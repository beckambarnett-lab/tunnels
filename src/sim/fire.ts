import { FIRE, CELL } from '../config';
import { Rng } from '../core/rng';
import type { World } from './world';

/** Flamethrower fire: short-lived particles that ignite bugs and collapse fresh breaches. */
export class Fire {
  max = 800;
  x = new Float32Array(this.max);
  y = new Float32Array(this.max);
  z = new Float32Array(this.max);
  vx = new Float32Array(this.max);
  vy = new Float32Array(this.max);
  vz = new Float32Array(this.max);
  life = new Float32Array(this.max);
  count = 0;
  private acc = 0;
  heat = new Map<number, number>(); // fresh-hole cell -> seconds of fire contact
  rng = new Rng(4242);

  emit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, dt: number, rangeMul = 1) {
    this.acc += FIRE.particlesPerSec * dt;
    const cone = (FIRE.coneDeg * Math.PI) / 180;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.count >= this.max) break;
      const i = this.count++;
      const a = (this.rng.next() - 0.5) * 2 * cone, b = (this.rng.next() - 0.5) * cone;
      // rotate dir by small yaw (a) and pitch (b)
      const ca = Math.cos(a), sa = Math.sin(a);
      let rx = dx * ca - dz * sa, rz = dx * sa + dz * ca, ry = dy + b;
      const l = Math.hypot(rx, ry, rz) || 1;
      const sp = FIRE.particleSpeed * rangeMul * (0.8 + this.rng.next() * 0.4);
      this.x[i] = ox;
      this.y[i] = oy;
      this.z[i] = oz;
      this.vx[i] = (rx / l) * sp;
      this.vy[i] = (ry / l) * sp;
      this.vz[i] = (rz / l) * sp;
      this.life[i] = FIRE.particleLife * (0.7 + this.rng.next() * 0.5);
    }
  }

  step(dt: number, w: World) {
    const g = w.grid, sw = w.swarm;
    const r = FIRE.particleRadius, r2 = r * r;
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      let dead = this.life[i] <= 0;
      if (!dead) {
        this.vx[i] *= 1 - 1.6 * dt;
        this.vz[i] *= 1 - 1.6 * dt;
        this.vy[i] -= 1.5 * dt;
        const nx = this.x[i] + this.vx[i] * dt, nz = this.z[i] + this.vz[i] * dt, ny = this.y[i] + this.vy[i] * dt;
        const cell = g.cellAt(nx, nz);
        if (cell < 0 || g.cells[cell] !== 0) {
          dead = true; // splashes against the wall
        } else {
          this.x[i] = nx;
          this.z[i] = nz;
          this.y[i] = Math.max(0.05, ny);
          // fire poured into a fresh hole collapses it (GDD: closing a breach)
          if (w.authority && g.dugAt[cell] >= 0 && w.time - g.dugAt[cell] < FIRE.collapseWindow) {
            const h = (this.heat.get(cell) || 0) + dt;
            this.heat.set(cell, h);
            if (h >= FIRE.collapseHeat) this.collapse(cell, w);
          }
          sw.hash.forEachNear(nx, nz, r, (j) => {
            if (!sw.alive[j] || sw.layer[j]) return;
            const ox = sw.x[j] - nx, oz = sw.z[j] - nz;
            if (ox * ox + oz * oz < r2) sw.ignite(j);
          });
        }
      }
      if (dead) {
        const l = --this.count;
        this.x[i] = this.x[l];
        this.y[i] = this.y[l];
        this.z[i] = this.z[l];
        this.vx[i] = this.vx[l];
        this.vy[i] = this.vy[l];
        this.vz[i] = this.vz[l];
        this.life[i] = this.life[l];
      } else i++;
    }
  }

  collapse(cell: number, w: World) {
    const g = w.grid, sw = w.swarm;
    const cx = g.centerX(cell), cz = g.centerZ(cell);
    // anything in the hole burns
    sw.hash.forEachNear(cx, cz, CELL, (j) => {
      if (sw.alive[j] && g.cellAt(sw.x[j], sw.z[j]) === cell) sw.kill(j, 'fire', w.events);
    });
    // don't bury a player
    for (const p of w.players) if (g.cellAt(p.x, p.z) === cell) return;
    if (g.fill(cell)) {
      this.heat.delete(cell);
      w.events.emit('collapse', { cell, x: cx, z: cz });
    }
  }
}
