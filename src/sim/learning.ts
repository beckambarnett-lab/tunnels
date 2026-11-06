import { BELIEF, LEARN, QUEEN, CELL, SWARM } from '../config';
import type { World } from './world';

export type Unlock =
  | 'testLight'
  | 'flank'
  | 'breach'
  | 'sabotage'
  | 'sabotageGenerator'
  | 'spreadOut'
  | 'bait'
  | 'dragDead'
  | 'triggerMotion'
  | 'takeOver'
  | 'darkRush';

export const UNLOCK_NAMES: Record<Unlock, string> = {
  testLight: 'Testing the light',
  flank: 'Flanking through the walls',
  breach: 'Breaching through the wall at their backs',
  sabotage: 'Sabotage of cables',
  sabotageGenerator: 'Sabotage of the generator',
  spreadOut: 'Spreading out so fire cannot chain',
  bait: 'Baiting to waste fuel',
  dragDead: 'Dragging the dead into the dark',
  triggerMotion: 'Triggering motion lamps from range',
  takeOver: 'Taking over player-dug tunnels',
  darkRush: 'Dark rush',
};

/**
 * The learning tree (GDD): behaviours start locked and unlock when players' habits trigger them.
 * Fairness: nothing unlocks from a player dying; time-based fallbacks keep pace with strong teams;
 * habits only count when the queen's bugs could sense them.
 */
export class Learning {
  unlocked = new Set<Unlock>();
  habits = { touchLight: 0, campSpots: new Map<string, number>(), backToWall: 0, wireM: 0, cuts: 0, flameSecs: 0, harvested: 0, motionTriggers: 0, playerDig: 0 };
  log: { t: number; unlock: Unlock; why: string }[] = [];
  /** bug index -> last electric touch time */
  private lastTouch: Float32Array;
  private lastTypeTouch: Record<string, number> = {};
  fallbackMul = 1; // director lever: how quickly fallbacks arrive
  lastWall: { x: number; z: number; cell: number } | null = null; // the wall at someone's back

  constructor(public w: World) {
    this.lastTouch = new Float32Array(w.swarm.max).fill(-100);
    w.events.on('harvest', (e) => {
      if (this.sensed(e.x, e.z)) this.habits.harvested += e.bodies;
    });
    w.events.on('wireCut', () => this.habits.cuts++);
    w.events.on('devicePlaced', (e) => {
      if (e.kind === 'generator') {
        const kind = this.spotKind(e.x, e.z);
        this.habits.campSpots.set(kind, (this.habits.campSpots.get(kind) || 0) + 1);
      }
    });
    w.events.on('motionOn', (e) => {
      if (this.sensed(e.x, e.z)) this.habits.motionTriggers++;
    });
    w.events.on('playerDig', () => this.habits.playerDig++);
    w.events.on('bugDeath', (e) => {
      if (e.cause === 'lightning') this.onLightningKill(e.x, e.z);
    });
  }

  has(u: Unlock) {
    return this.unlocked.has(u);
  }

  /** Could any bug sense something happening here? (no omniscience) */
  sensed(x: number, z: number) {
    const sw = this.w.swarm;
    let found = false;
    sw.hash.forEachNear(x, z, QUEEN.senseRange, (j) => {
      if (sw.alive[j]) {
        found = true;
        return true;
      }
    });
    return found;
  }

  /** What kind of spot is this camp in? Open hall, corridor, junction or dead end (by openness). */
  spotKind(x: number, z: number) {
    const g = this.w.grid;
    let rays = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      let len = 0;
      while (len < 8 && g.isOpenAt(x + Math.sin(a) * len, z + Math.cos(a) * len)) len += 0.5;
      if (len >= 6) rays++;
    }
    return rays >= 6 ? 'hall' : rays >= 3 ? 'junction' : rays >= 2 ? 'corridor' : 'deadend';
  }

  /** A bug touched electric light and didn't burn: belief in that type drops (GDD). */
  touch(i: number, kindIndex: number) {
    const t = this.w.time;
    if (t - this.lastTouch[i] < BELIEF.touchCooldown) return;
    const kind = ['', 'flashlight', 'lamp', 'floodlight', 'motion'][kindIndex];
    // one lesson per light type every couple of seconds: a jostling crowd isn't 200 lessons
    if (t - (this.lastTypeTouch[kind] ?? -100) < BELIEF.typeCooldown) return;
    this.lastTypeTouch[kind] = t;
    this.lastTouch[i] = t;
    const b = this.w.light.belief;
    b[kind] = Math.max(BELIEF.floor, (b[kind] ?? 1) - BELIEF.touchDrop);
    this.habits.touchLight++;
    this.w.events.emit('beliefDrop', { kind, belief: b[kind] });
  }

  /** Lightning kills restore belief in electric light types within 5 m. */
  onLightningKill(x: number, z: number) {
    const w = this.w;
    const kinds = new Set<string>();
    const near = (lx: number, lz: number) => Math.hypot(lx - x, lz - z) <= BELIEF.lightningRadius;
    for (const d of w.camp.devices) if (d.light && near(d.x, d.z)) kinds.add(d.light.kind);
    for (const p of w.players) if (p.flashlight.on && near(p.x, p.z)) kinds.add('flashlight');
    for (const k of kinds) w.light.belief[k] = Math.min(1, (w.light.belief[k] ?? 1) + BELIEF.lightningRise);
  }

  unlock(u: Unlock, why: string) {
    if (this.unlocked.has(u)) return;
    this.unlocked.add(u);
    this.log.push({ t: this.w.time, unlock: u, why });
    const line = `[learning t=${this.w.time.toFixed(1)}] unlocked "${UNLOCK_NAMES[u]}" because ${why}`;
    console.log(line);
    this.w.events.emit('unlock', { unlock: u, name: UNLOCK_NAMES[u], why });
  }

  step(dt: number) {
    const w = this.w, h = this.habits;
    // habits that accumulate over time (only while the player is up: nothing unlocks from dying)
    for (const p of w.players) {
      if (!p.alive || p.downed) continue;
      if (p.firing && this.sensed(p.x, p.z)) h.flameSecs += dt;
      // back to a wall: a solid cell within 1 m directly behind them
      const bx = p.x - Math.sin(p.yaw) * 0.8, bz = p.z - Math.cos(p.yaw) * 0.8;
      if (!w.grid.isOpenAt(bx, bz) && this.sensed(p.x, p.z)) {
        h.backToWall += dt;
        const c = w.grid.cellAt(bx, bz);
        if (c >= 0) this.lastWall = { x: bx, z: bz, cell: c };
      }
    }
    let wireM = 0;
    for (const wr of w.camp.wires) wireM += w.camp.wireLength(wr);
    h.wireM = Math.max(h.wireM, wireM);

    const minutes = w.time / 60;
    const fb = (u: Unlock) => minutes >= LEARN.fallbackMin[u] * this.fallbackMul;
    if (h.touchLight >= LEARN.touchLight) this.unlock('testLight', `bugs touched electric light ${h.touchLight} times without burning`);
    else if (fb('testLight')) this.unlock('testLight', 'time fallback');
    let same = 0;
    for (const v of h.campSpots.values()) same = Math.max(same, v);
    if (same >= LEARN.sameSpotCamps) this.unlock('flank', `the team camped in the same kind of spot ${same} times`);
    else if (fb('flank')) this.unlock('flank', 'time fallback');
    if (h.backToWall >= LEARN.backToWallSecs) this.unlock('breach', `players kept their backs to a wall for ${h.backToWall.toFixed(0)} s`);
    else if (fb('breach')) this.unlock('breach', 'time fallback');
    if (h.wireM >= LEARN.longWireM) this.unlock('sabotage', `the team ran ${h.wireM.toFixed(0)} m of cable`);
    else if (fb('sabotage')) this.unlock('sabotage', 'time fallback');
    if (this.has('sabotage') && h.cuts >= 3) this.unlock('sabotageGenerator', `cables were cut ${h.cuts} times`);
    else if (this.has('sabotage') && fb('sabotageGenerator')) this.unlock('sabotageGenerator', 'time fallback');
    if (h.flameSecs >= LEARN.flameSecs) {
      this.unlock('spreadOut', `the flamethrower burned for ${h.flameSecs.toFixed(0)} s`);
      this.unlock('bait', `the flamethrower burned for ${h.flameSecs.toFixed(0)} s`);
    } else {
      if (fb('spreadOut')) this.unlock('spreadOut', 'time fallback');
      if (fb('bait')) this.unlock('bait', 'time fallback');
    }
    if (h.harvested >= LEARN.harvestBodies) this.unlock('dragDead', `${h.harvested} bodies were harvested`);
    else if (fb('dragDead')) this.unlock('dragDead', 'time fallback');
    if (h.motionTriggers >= LEARN.motionTriggers) this.unlock('triggerMotion', `motion lamps switched on ${h.motionTriggers} times`);
    else if (fb('triggerMotion')) this.unlock('triggerMotion', 'time fallback');
    if (h.playerDig >= LEARN.playerDigCells) this.unlock('takeOver', `players dug ${h.playerDig} cells`);
    if (w.fuel.value / 1500 <= LEARN.fuelLowFrac) this.unlock('darkRush', `fuel fell to ${Math.round(w.fuel.value)}`);
    else if (fb('darkRush')) this.unlock('darkRush', 'time fallback');
  }
}

