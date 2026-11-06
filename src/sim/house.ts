import { CELL, PEST } from '../config';
import { defaultParams } from './fieldManager';
import { makeTendril, Tendril } from './tendril';
import { OPEN } from './grid';
import { Z, NightLayout } from './night';
import type { World } from './world';

export const HOUSE_INTENT = 'house';

/**
 * Act 1, the routine job (GDD): the house is crawling with what look like ordinary bugs,
 * scattered through every room. They are the hive concealing itself: one tendril the queen leaves
 * alone, in the swarm's `pest` steering (scuttle, hug walls, scatter from people, ignore the lamps,
 * and every so often all freeze at once). The house's vent is a hive highway: while the job is
 * unfinished and the house runs low, more crawl out of it. When the power dies they stop
 * pretending and the queen takes them back.
 */
export class HouseInfestation {
  tendril: Tendril | null = null;
  private cells: number[] = [];
  private vent: { x: number; z: number } | null = null;
  private start: { x: number; z: number } | null = null;
  private started = false;
  revealed = false;
  aliveCount = 0;

  constructor(public w: World, public L: NightLayout) {
    const g = w.grid;
    for (let i = 0; i < g.n; i++) if (L.zone[i] === Z.house && g.cells[i] === OPEN && !L.plugCells.includes(i)) this.cells.push(i);
    const v = L.marks.find((m) => m.kind === 'vent');
    if (v) this.vent = { x: v.x, z: v.z };
    const s = L.marks.find((m) => m.kind === 'start');
    if (s) this.start = { x: s.x, z: s.z };
  }

  /** is bug tendril `id` the house's (the queen and the population balance leave these alone) */
  owns(id: number) {
    return !!this.tendril && this.tendril.id === id;
  }

  /** authority only (called from Run.step) */
  step(jobDone: boolean) {
    const w = this.w;
    if (!this.started) {
      this.started = true;
      // a loaded save or checkpoint brings its house tendril (and bugs) with it
      this.tendril = [...w.tendrils.values()].find((t) => t.intent === HOUSE_INTENT) ?? null;
      if (!this.tendril && !this.revealed) {
        this.tendril = makeTendril({ params: defaultParams(), mode: 'pest', intent: HOUSE_INTENT, holdDist: 0, sepMul: 2.2, aliMul: 0.2, fieldName: 'house', born: w.time });
        w.tendrils.set(this.tendril.id, this.tendril);
        this.scatter(PEST.count);
      }
    }
    if (!this.tendril) return;
    this.aliveCount = this.count();
    this.tendril.members = this.aliveCount;
    this.tendril.size = this.aliveCount;
    // more come out of the vent while the job still needs them
    if (!jobDone && this.aliveCount < PEST.topUpBelow && this.vent) this.fromVent(PEST.topUpBatch);
  }

  private count() {
    const sw = this.w.swarm, id = this.tendril!.id;
    let n = 0;
    for (let j = 0; j < sw.count; j++) if (sw.alive[j] && sw.tendril[j] === id) n++;
    return n;
  }

  /** spread through every room (uniform over the floor), never right on top of the start */
  private scatter(n: number) {
    const w = this.w, g = w.grid, rng = w.rng;
    if (!this.cells.length) return;
    let made = 0;
    for (let tries = 0; made < n && tries < n * 20; tries++) {
      const c = this.cells[rng.int(this.cells.length)];
      const x = g.centerX(c) + (rng.next() - 0.5) * CELL * 0.8, z = g.centerZ(c) + (rng.next() - 0.5) * CELL * 0.8;
      if (this.start && Math.hypot(x - this.start.x, z - this.start.z) < 2.5) continue;
      if (w.swarm.spawn(x, z, this.tendril!.id) >= 0) made++;
    }
  }

  private fromVent(n: number) {
    const w = this.w, rng = w.rng, v = this.vent!;
    for (let k = 0; k < n; k++) {
      const a = rng.next() * Math.PI * 2, r = rng.next() * 0.4;
      const x = v.x + Math.sin(a) * r, z = v.z + Math.cos(a) * r;
      if (w.grid.isOpenAt(x, z)) w.swarm.spawn(x, z, this.tendril!.id);
    }
    w.events.emit('ventCrawl', { x: v.x, z: v.z, n });
  }

  /** the power dies: the act is over. Survivors drop the pretence and join the queen's tendrils. */
  reveal() {
    if (this.revealed) return;
    this.revealed = true;
    if (!this.tendril) return;
    const sw = this.w.swarm, id = this.tendril.id;
    for (let j = 0; j < sw.count; j++)
      if (sw.alive[j] && sw.tendril[j] === id) {
        sw.tendril[j] = -1;
        sw.timer[j] = 0; // (a pest's timer held its sprayed-until time)
      }
    this.w.tendrils.delete(id);
    this.tendril = null;
    this.aliveCount = 0;
  }
}
