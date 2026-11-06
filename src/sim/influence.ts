import { CELL, LIGHT } from '../config';
import type { World } from './world';

export const INF_CELL = 4; // m per influence cell

/**
 * The queen's three influence maps (GDD): danger (fire, light, recent burn deaths), opportunity
 * (isolated players, dark gaps, cut wires, a silent flamethrower, the generator's noise) and
 * memory (where attacks worked before). Coarse 4 m cells; built only from what bugs can sense.
 */
export class Influence {
  w: number;
  h: number;
  danger: Float32Array;
  opportunity: Float32Array;
  memory: Float32Array;
  private burns: { x: number; z: number; t: number }[] = [];
  private t = 0;

  constructor(public world: World) {
    const g = world.grid;
    this.w = Math.ceil((g.w * CELL) / INF_CELL);
    this.h = Math.ceil((g.h * CELL) / INF_CELL);
    this.danger = new Float32Array(this.w * this.h);
    this.opportunity = new Float32Array(this.w * this.h);
    this.memory = new Float32Array(this.w * this.h);
    world.events.on('bugDeath', (e) => {
      if (e.cause === 'fire') this.burns.push({ x: e.x, z: e.z, t: world.time });
    });
    const remember = (x: number, z: number, a: number) => {
      const i = this.idx(x, z);
      if (i >= 0) this.memory[i] = Math.min(5, this.memory[i] + a);
    };
    world.events.on('wireCut', (e) => remember(e.x, e.z, 1));
    world.events.on('downed', (e) => remember(e.x, e.z, 3));
    world.events.on('deviceBroken', (e) => remember(e.x, e.z, 2));
  }
  idx(x: number, z: number) {
    const cx = Math.floor(x / INF_CELL), cz = Math.floor(z / INF_CELL);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }
  at(map: Float32Array, x: number, z: number) {
    const i = this.idx(x, z);
    return i < 0 ? 0 : map[i];
  }
  update(dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const W = this.world, g = W.grid, L = W.light;
    this.danger.fill(0);
    this.opportunity.fill(0);
    for (let i = 0; i < this.memory.length; i++) this.memory[i] *= 0.995; // slow forgetting
    // danger: light (bugs feel it) and fire, plus recent burn deaths
    for (let c = 0; c < g.n; c += 2) {
      const e = L.eff[c], f = L.fire[c];
      if (e < 0.02 && f < 0.02) continue;
      const i = this.idx(g.centerX(c), g.centerZ(c));
      if (i >= 0) this.danger[i] += e * 0.05 + f * 0.3;
    }
    this.burns = this.burns.filter((b) => W.time - b.t < 20);
    for (const b of this.burns) {
      const i = this.idx(b.x, b.z);
      if (i >= 0) this.danger[i] += 0.3;
    }
    // opportunity: players in the dark or alone, a silent flamethrower, cut wires, generator noise
    const alive = W.players.filter((p) => p.alive && !p.downed);
    for (const p of alive) {
      const i = this.idx(p.x, p.z);
      if (i < 0) continue;
      let o = 0.5;
      if (L.rawAt(p.x, p.z) < LIGHT.darkThreshold) o += 2;
      const nearest = Math.min(...alive.filter((q) => q !== p).map((q) => Math.hypot(q.x - p.x, q.z - p.z)), 1e9);
      if (alive.length > 1 && nearest > 10) o += 1.5; // alone
      if (W.time - p.lastFired > 5) o += 0.5; // the flamethrower went quiet
      if (W.voiceNoise && W.time - p.loudAt < 2) o += 1.5; // loud talking draws bugs
      this.opportunity[i] += o;
    }
    for (const wr of W.camp.wires)
      for (const k of wr.cuts) {
        const pt = wr.points[k];
        const i = this.idx(pt.x, pt.z);
        if (i >= 0) this.opportunity[i] += 1;
      }
    for (const d of W.camp.devices)
      if (d.kind === 'generator' && d.running) {
        // the generator is loud: it draws the hive from far away
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            const i = this.idx(d.x + dx * INF_CELL, d.z + dz * INF_CELL);
            if (i >= 0) this.opportunity[i] += 0.4 / (1 + Math.abs(dx) + Math.abs(dz));
          }
      }
  }
}
