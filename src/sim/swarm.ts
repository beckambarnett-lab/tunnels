import { CELL, SWARM, LIGHT } from '../config';
import { Rng } from '../core/rng';
import { Events } from '../core/events';
import { Grid, OPEN, SOLID } from './grid';
import { LightMap } from './light';
import { Visibility } from './visibility';
import { SpatialHash } from './spatialHash';
import type { Tendril } from './tendril';

// Bug states (GDD: flow, mass, strike, carry, burn)
export const FLOW = 0, MASS = 1, STRIKE = 2, CARRY = 3, BURN = 4;
export const STATE_NAMES = ['flow', 'mass', 'strike', 'carry', 'burn'];

export interface SwarmContext {
  grid: Grid;
  light: LightMap;
  vis: Visibility;
  tendrils: Map<number, Tendril>;
  players: { x: number; z: number; alive: boolean }[];
  time: number;
  events: Events;
  /** Director lever: may breaches open at all right now? */
  breachAllowed: boolean;
  /** a bug touched electric light without burning (belief drops) */
  onTouch?: (i: number, kindIndex: number) => void;
  /** wall faces in a player's body shadow (dark for the breach rule) */
  shadowFaces?: Set<number>;
}

/**
 * The bug pool, struct-of-arrays. Bugs never path: each frame a bug reads its tendril's shared
 * flow field, adds boids (separation, alignment, cohesion from the spatial hash) and a push away
 * from light, and moves. Digging and breaching happen here when the field step points into earth.
 */
export class Swarm {
  max: number;
  count = 0; // high-water mark of used slots
  active = 0;
  alive: Uint8Array;
  x: Float32Array;
  z: Float32Array;
  y: Float32Array; // visual height offset (emerging, dropping)
  vx: Float32Array;
  vz: Float32Array;
  heading: Float32Array;
  layer: Uint8Array; // 0 surface, 1 under the floor
  state: Uint8Array;
  tendril: Int32Array;
  timer: Float32Array;
  phase: Float32Array;
  role: Uint8Array;
  hash: SpatialHash;
  rng: Rng;
  frame = 0;
  private free: number[] = [];
  eruptedAt = new Map<number, number>();
  private nearest = new Float32Array(0);
  // reusable per-frame scratch
  stats = { mass: 0, strike: 0, flow: 0, burn: 0, under: 0, inLight: 0, digging: 0, simulated: 0 };

  constructor(public grid: Grid, max = SWARM.maxBugs, seed = 1) {
    this.max = max;
    this.alive = new Uint8Array(max);
    this.x = new Float32Array(max);
    this.z = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.heading = new Float32Array(max);
    this.layer = new Uint8Array(max);
    this.state = new Uint8Array(max);
    this.tendril = new Int32Array(max).fill(-1);
    this.timer = new Float32Array(max);
    this.phase = new Float32Array(max);
    this.role = new Uint8Array(max);
    this.nearest = new Float32Array(max);
    this.hash = new SpatialHash(grid.w * CELL, grid.h * CELL, 1.0, max);
    this.rng = new Rng(seed * 7919 + 13);
  }

  spawn(x: number, z: number, tendril = -1, layer = 0): number {
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else if (this.count < this.max) i = this.count++;
    else return -1;
    this.alive[i] = 1;
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] = 0;
    this.vx[i] = 0;
    this.vz[i] = 0;
    this.layer[i] = layer;
    this.state[i] = FLOW;
    this.tendril[i] = tendril;
    this.timer[i] = 0;
    this.phase[i] = this.rng.next() * 100;
    this.heading[i] = this.rng.next() * Math.PI * 2;
    this.active++;
    return i;
  }

  /** Clients mirror the host's bug slots exactly. */
  ensureCount(n: number) {
    if (n > this.count) this.count = Math.min(this.max, n);
  }
  setAlive(i: number, x: number, z: number, layer: number) {
    if (this.alive[i]) return;
    this.alive[i] = 1;
    this.active++;
    const f = this.free.indexOf(i);
    if (f >= 0) this.free.splice(f, 1);
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] = 0;
    this.vx[i] = this.vz[i] = 0;
    this.layer[i] = layer;
    this.state[i] = FLOW;
    this.timer[i] = 0;
    if (!this.phase[i]) this.phase[i] = this.rng.next() * 100;
  }

  kill(i: number, cause: string, events?: Events) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.active--;
    this.free.push(i);
    events?.emit('bugDeath', { i, cause, x: this.x[i], z: this.z[i], layer: this.layer[i] });
  }

  ignite(i: number) {
    if (!this.alive[i] || this.state[i] === BURN || this.layer[i] === 1) return;
    this.state[i] = BURN;
    this.timer[i] = SWARM.burnTime * (0.7 + this.rng.next() * 0.6);
  }

  rebuildHash() {
    this.hash.clear();
    for (let i = 0; i < this.count; i++) if (this.alive[i]) this.hash.insert(i, this.x[i], this.z[i]);
  }

  /** Bilinear effective light at a world point (smooth gradient for steering). */
  effSample(light: LightMap, wx: number, wz: number) {
    const g = this.grid;
    const fx = wx / CELL - 0.5, fz = wz / CELL - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    const e = light.eff;
    const at = (x: number, z: number) => (x < 0 || z < 0 || x >= g.w || z >= g.h ? 0 : e[z * g.w + x]);
    const a = at(x0, z0), b = at(x0 + 1, z0), c = at(x0, z0 + 1), d = at(x0 + 1, z0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /** May a bug open this cell / erupt here? Only at dark spots out of every player's view. */
  canBreach(ctx: SwarmContext, cell: number) {
    if (!ctx.breachAllowed) return false;
    if (ctx.vis.isSeen(cell)) return false;
    if (ctx.shadowFaces?.has(cell)) return true;
    return ctx.light.surfaceRaw(cell) < LIGHT.darkThreshold;
  }

  step(dt: number, ctx: SwarmContext) {
    const g = this.grid, n = g.n, light = ctx.light;
    const cells = g.cells;
    this.frame++;
    this.rebuildHash();
    const st = this.stats;
    st.mass = st.strike = st.flow = st.burn = st.under = st.inLight = st.digging = st.simulated = 0;
    const R = SWARM.neighbourRadius, R2 = R * R;
    const sepR = SWARM.radius * 3.2, sepR2 = sepR * sepR;
    const players = ctx.players;

    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const px = this.x[i], pz = this.z[i];
      // Level of detail: far from every player -> simulate every 4th frame at 4x dt.
      let near = 1e9;
      for (const p of players) {
        if (!p.alive) continue;
        const dx = p.x - px, dz = p.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < near) near = d2;
      }
      this.nearest[i] = near;
      let dtl = dt;
      if (near > SWARM.farSimDist * SWARM.farSimDist) {
        if ((i + this.frame) % 4 !== 0) continue;
        dtl = dt * 4;
      }
      st.simulated++;
      const layer = this.layer[i];
      if (layer) st.under++;

      if (this.state[i] === BURN) {
        st.burn++;
        this.stepBurn(i, dtl, ctx);
        continue;
      }

      const cell = g.cellAt(px, pz);
      if (cell < 0) {
        this.kill(i, 'oob', ctx.events);
        continue;
      }
      const t = this.tendril[i] >= 0 ? ctx.tendrils.get(this.tendril[i]) : undefined;
      const field = t?.field;
      const next = field?.next;
      let dx = 0, dz = 0; // desired direction (unit-ish)
      let speed = SWARM.darkSpeed * (t ? t.speedMul : 0.5);
      const striking = !!t && t.mode === 'strike';
      let tol = striking ? SWARM.strikeTolerance : SWARM.tolerance;
      if (t) {
        tol *= t.braveness;
        // scouts tap into the light and retreat
        if (t.probeAmp > 0) tol *= 1 + t.probeAmp * Math.max(0, Math.sin(this.phase[i] * 7 + ctx.time * 1.3));
      }
      let digging = false;

      if (next) {
        const node = layer ? cell + n : cell;
        const nx = next[node];
        if (nx < 0) {
          // at the goal: go for the goal point itself (the player, the fixture...)
          if (t && !layer) {
            dx = t.gx - px;
            dz = t.gz - pz;
          }
        } else if (nx >= n) {
          const c2 = nx - n;
          if (!layer) {
            // dive below the floor: takes a moment of digging
            this.timer[i] += dtl;
            digging = true;
            if (this.timer[i] > 0.6) {
              this.layer[i] = 1;
              this.timer[i] = 0;
              ctx.events.emit('dive', { i, x: px, z: pz });
            }
          } else {
            dx = g.centerX(c2) - px;
            dz = g.centerZ(c2) - pz;
            speed = SWARM.digSpeed * (g.burrow[c2] ? 2.5 : 1);
            if (!g.burrow[cell]) g.burrow[cell] = 1;
          }
        } else {
          if (layer) {
            // erupt through the floor here (nx === cell), only at a dark unseen spot
            if (this.canBreach(ctx, nx)) {
              this.layer[i] = 0;
              this.y[i] = this.rng.next() < 0.3 ? 2.6 : -0.35; // some drop from the ceiling
              this.timer[i] = 0;
              // one breach per hole: followers through the same spot don't count again
              const last = this.eruptedAt.get(nx);
              if (last === undefined || ctx.time - last > 10) ctx.events.emit('breach', { kind: this.y[i] > 0 ? 'ceiling' : 'floor', cell: nx, x: px, z: pz });
              else ctx.events.emit('erupt', { cell: nx, x: px, z: pz });
              this.eruptedAt.set(nx, ctx.time);
            } else {
              speed = 0;
              this.timer[i] += dtl; // waiting under the floor (drives the dirt-trickle tell)
            }
          } else if (cells[nx] === SOLID) {
            // dig into the earth the field routes through
            const cx = g.centerX(nx), cz = g.centerZ(nx);
            dx = cx - px;
            dz = cz - pz;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < CELL * 1.25) {
              digging = true;
              speed *= 0.15;
              const face = this.isPlayerSideFace(nx, cell);
              if (this.canBreach(ctx, nx)) {
                g.digProgress[nx] += dtl / SWARM.digTime;
                if (g.digProgress[nx] >= 1) {
                  g.dig(nx, ctx.time);
                  ctx.events.emit('dig', { cell: nx, x: cx, z: cz });
                  if (face) ctx.events.emit('breach', { kind: 'wall', cell: nx, x: cx, z: cz });
                }
              } else {
                // blocked by light or a player's gaze: keep scratching but never break through
                g.digProgress[nx] = Math.min(0.85, g.digProgress[nx] + dtl / SWARM.digTime);
                ctx.events.emit('scratch', { cell: nx, x: cx, z: cz, blocked: true });
              }
            }
          } else {
            dx = g.centerX(nx) - px;
            dz = g.centerZ(nx) - pz;
          }
        }
      } else {
        // no field yet: mill about
        dx = Math.sin(this.phase[i] + ctx.time * 0.7);
        dz = Math.cos(this.phase[i] * 1.3 + ctx.time * 0.5);
        speed *= 0.3;
      }
      if (digging) st.digging++;
      let dl = Math.sqrt(dx * dx + dz * dz);
      if (dl > 1e-4) {
        dx /= dl;
        dz /= dl;
      }

      let ax = 0, az = 0;
      let state = striking ? STRIKE : FLOW;
      if (this.state[i] === CARRY && t?.mode === 'retreat') state = CARRY; // dragging a body into the dark
      // massing tendrils wait in the dark at a stand-off distance until the queen strikes
      if (t && t.mode === 'mass' && !layer && t.holdDist > 0) {
        const ox = t.gx - px, oz = t.gz - pz;
        const d2 = ox * ox + oz * oz;
        if (d2 < t.holdDist * t.holdDist) {
          state = MASS;
          const d = Math.sqrt(d2) + 1e-4;
          const back = (t.holdDist - d) / t.holdDist;
          // drift outward a little if too close, otherwise hold
          dx = (-ox / d) * back;
          dz = (-oz / d) * back;
          dl = 1;
          speed *= 0.6;
        }
      }

      if (!layer) {
        // ---- light: hold at the edge, retreat when inside ----
        const e = this.effSample(light, px, pz);
        const look = 0.45;
        const ahead = this.effSample(light, px + dx * look, pz + dz * look);
        if (ahead > tol && dl > 1e-4) {
          // the next step is into light: hold here (mass at the light's edge)
          state = MASS;
          dx *= 0.0;
          dz *= 0.0;
        }
        if (e > tol * 0.75) {
          const h = 0.35;
          const gx = this.effSample(light, px + h, pz) - this.effSample(light, px - h, pz);
          const gz = this.effSample(light, px, pz + h) - this.effSample(light, px, pz - h);
          const gl = Math.sqrt(gx * gx + gz * gz) + 1e-5;
          const push = SWARM.lightPushWeight * Math.min(3, e / tol);
          ax -= (gx / gl) * push;
          az -= (gz / gl) * push;
          if (e > tol) {
            st.inLight++;
            state = MASS;
          }
          // touching electric light without burning wears down belief in that light type
          if (ctx.onTouch && e > SWARM.tolerance) {
            const c = g.cellAt(px, pz);
            if (light.kindAt[c] && light.fire[c] < 0.05) ctx.onTouch(i, light.kindAt[c]);
          }
        }
      }

      // ---- boids ----
      let sx = 0, sz = 0, alx = 0, alz = 0, cx = 0, cz = 0, nn = 0;
      const sepMul = t ? Math.sqrt(t.sepMul) : 1, sepMul2 = sepMul * sepMul;
      const aliMul = t ? t.aliMul : 1;
      const vxi = this.vx[i], vzi = this.vz[i];
      const self = this;
      this.hash.forEachNear(px, pz, R, (j) => {
        if (j === i || self.layer[j] !== layer) return;
        const ox = px - self.x[j], oz = pz - self.z[j];
        const d2 = ox * ox + oz * oz;
        if (d2 > R2) return;
        if (d2 < sepR2 * sepMul2) {
          const d = Math.sqrt(d2) + 1e-4;
          const k = (sepR * sepMul - d) / (sepR * sepMul) / d;
          sx += ox * k;
          sz += oz * k;
        }
        alx += self.vx[j];
        alz += self.vz[j];
        cx += self.x[j];
        cz += self.z[j];
        nn++;
        if (nn >= SWARM.maxNeighbours) return true;
      });
      if (nn > 0) {
        ax += sx * SWARM.sepWeight * 6;
        az += sz * SWARM.sepWeight * 6;
        ax += (alx / nn - vxi) * SWARM.aliWeight * aliMul;
        az += (alz / nn - vzi) * SWARM.aliWeight * aliMul;
        ax += (cx / nn - px) * SWARM.cohWeight;
        az += (cz / nn - pz) * SWARM.cohWeight;
      }

      // mass: idle shuffle so the ring breathes
      if (state === MASS) {
        const w = Math.sin(this.phase[i] * 3.1 + ctx.time * 2.3) * 0.6;
        ax += -dz * w;
        az += dx * w;
      }

      // ---- integrate ----
      const tvx = dx * speed, tvz = dz * speed;
      const k = 6;
      let nvx = vxi + ((tvx - vxi) * k + ax) * dtl;
      let nvz = vzi + ((tvz - vzi) * k + az) * dtl;
      const maxs = (layer ? SWARM.digSpeed * 2.5 : SWARM.darkSpeed) * 1.25;
      const sl = Math.sqrt(nvx * nvx + nvz * nvz);
      if (sl > maxs) {
        nvx *= maxs / sl;
        nvz *= maxs / sl;
      }
      let nxp = px + nvx * dtl, nzp = pz + nvz * dtl;
      if (!layer) {
        // collide with earth (slide along walls)
        if (!g.isOpenAt(nxp, nzp)) {
          if (g.isOpenAt(nxp, pz)) {
            nzp = pz;
            nvz = 0;
          } else if (g.isOpenAt(px, nzp)) {
            nxp = px;
            nvx = 0;
          } else {
            nxp = px;
            nzp = pz;
            nvx *= -0.2;
            nvz *= -0.2;
          }
        }
      } else if (g.cells[g.cellAt(nxp, nzp)] === 2) {
        nxp = px;
        nzp = pz;
      }
      this.x[i] = nxp;
      this.z[i] = nzp;
      this.vx[i] = nvx;
      this.vz[i] = nvz;
      // settle visual height (emerging bugs rise, dropping bugs fall)
      const yy = this.y[i];
      if (yy !== 0) this.y[i] = Math.abs(yy) < 0.02 ? 0 : yy > 0 ? Math.max(0, yy - dtl * 6) : Math.min(0, yy + dtl * 1.2);
      if (sl > 0.05) {
        const hdg = Math.atan2(nvx, nvz);
        let dh = hdg - this.heading[i];
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.heading[i] += dh * Math.min(1, dtl * 10);
      }
      this.state[i] = state;
      if (state === MASS) st.mass++;
      else if (state === STRIKE) st.strike++;
      else st.flow++;
    }
  }

  /**
   * Is opening cell i a breach: does it break into open tunnel (not hive-dug) other than the
   * space the digging bug is standing in? Digging out of the hive's own room isn't a breach.
   */
  isPlayerSideFace(i: number, from: number) {
    const g = this.grid;
    const x = i % g.w, y = (i / g.w) | 0;
    const fx = from % g.w, fy = (from / g.w) | 0;
    const chk = (xx: number, yy: number) => {
      if (!g.inBounds(xx, yy)) return false;
      if (Math.abs(xx - fx) <= 1 && Math.abs(yy - fy) <= 1) return false;
      const j = yy * g.w + xx;
      return g.cells[j] === OPEN && g.dugAt[j] < 0;
    };
    return chk(x + 1, y) || chk(x - 1, y) || chk(x, y + 1) || chk(x, y - 1);
  }

  private stepBurn(i: number, dt: number, ctx: SwarmContext) {
    this.timer[i] -= dt;
    // panic run
    const a = this.heading[i] + (this.rng.next() - 0.5) * 6 * dt;
    this.heading[i] = a;
    const sp = SWARM.darkSpeed * 1.1;
    let nx = this.x[i] + Math.sin(a) * sp * dt, nz = this.z[i] + Math.cos(a) * sp * dt;
    if (!this.grid.isOpenAt(nx, nz)) {
      this.heading[i] += Math.PI * (0.5 + this.rng.next());
      nx = this.x[i];
      nz = this.z[i];
    }
    this.x[i] = nx;
    this.z[i] = nz;
    // fire spreads to packed neighbours (GDD: a good burst can torch a packed tendril)
    const r = SWARM.burnSpreadRadius, r2 = r * r;
    const chance = SWARM.burnSpreadChance * dt;
    this.hash.forEachNear(nx, nz, r, (j) => {
      if (j === i || this.state[j] === BURN || !this.alive[j] || this.layer[j]) return;
      const ox = this.x[j] - nx, oz = this.z[j] - nz;
      if (ox * ox + oz * oz < r2 && this.rng.next() < chance) this.ignite(j);
    });
    if (this.timer[i] <= 0) this.kill(i, 'fire', ctx.events);
  }
}
