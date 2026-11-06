import { SWARM, QUEEN, LIGHT, CELL, CAMP } from '../config';
import { defaultParams } from './fieldManager';
import { makeTendril, Tendril, TendrilMode } from './tendril';
import { Influence } from './influence';
import type { World, SimPlayer } from './world';
import type { Device } from './camp';
import { HIVE_INTENT } from './death';
import { Openings, Opening } from './openings';

export const INTENTS = ['conceal', 'probe', 'sabotage', 'flank', 'undermine', 'reroute', 'siege', 'bait', 'assault', 'retreat'] as const;
export type Intent = (typeof INTENTS)[number];

/** The readable tell for each intent (GDD table). Audio signatures live in synth.ts. */
export const TELLS: Record<Intent, string> = {
  conceal: 'bugs that are slightly too organised',
  probe: 'single bugs tapping into the light and retreating',
  sabotage: 'bugs lining up along the cable like ants on sugar',
  flank: 'scratching moves into the walls; the space ahead goes quiet',
  undermine: 'dirt trickling; the ground under the generator trembling',
  reroute: 'fresh holes in walls you already passed',
  siege: 'a growing ring of bugs at the edge of one lamp',
  bait: 'bugs in the open with nothing behind them',
  assault: 'the whole nest goes silent for a few seconds',
  retreat: 'scratching fades, bodies get dragged away',
};

/**
 * The queen (GDD): utility AI that scores intents about once a second from three influence maps,
 * within the Hive Director's aggression budget. She owns the tendrils and gives each one a goal,
 * a mode and field parameters. She has no omniscience: goals come from what bugs sense.
 */
export class Queen {
  thinkTimer = 0;
  intent: Intent = 'conceal';
  intentSince = 0;
  commitFor = QUEEN.minCommit;
  scores: Record<string, number> = {};
  raw: Record<string, number> = {}; // feasibility before the variety penalty
  chosen: Record<string, number> = {};
  lastChosenAt: Record<string, number> = {};
  forced: Intent | null = null;
  influence: Influence;
  openings: Openings;
  /** what worked: openings of each kind that hurt someone (feeds her intent choices) */
  openingWins: Record<string, number> = {};
  private respondT = 0;
  silenceUntil = 0; // assault tell
  log: string[] = [];
  phase: string = 'conceal'; // overlay compatibility
  burnDeaths: number[] = [];
  siegeTarget: number | null = null;
  rerouteGoals: number[] = [];
  private tellT = 0;

  constructor(public w: World) {
    this.influence = new Influence(w);
    this.openings = new Openings(w);
    w.events.on('openingClosed', (e) => {
      if (e.harm > 0.08) {
        this.openingWins[e.kind] = (this.openingWins[e.kind] || 0) + 1;
        const i = this.influence.idx(e.x, e.z);
        if (i >= 0) this.influence.memory[i] = Math.min(5, this.influence.memory[i] + 1 + e.harm * 2);
      }
    });
    w.events.on('bugDeath', (e) => {
      if (e.cause === 'fire') this.burnDeaths.push(w.time);
    });
  }

  /** Debug / gate hook: force an intent (bypasses scoring, not the director). */
  force(i: Intent | null) {
    this.forced = i;
    this.thinkTimer = 0;
  }

  opening(p: SimPlayer): boolean {
    const w = this.w;
    if (!p.alive || p.downed) return false;
    if (w.light.effAt(p.x, p.z) < SWARM.tolerance) return true; // standing in the dark
    const others = w.players.filter((q) => q !== p && q.alive && !q.downed);
    if (others.length && Math.min(...others.map((q) => Math.hypot(q.x - p.x, q.z - p.z))) > 12) return true; // alone
    // someone stands against an unlit wall (GDD): earth right behind or beside them with a dark face
    const g = w.grid;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const own = g.cellAt(p.x, p.z);
    for (const [dx, dz] of [[-fx, -fz], [-fz, fx], [fz, -fx]]) {
      const c = g.cellAt(p.x + dx * 0.7, p.z + dz * 0.7);
      if (c < 0 || g.cells[c] !== 1) continue;
      // the wall's own light, not counting the cell the player stands in (their light starts there)
      const x = c % g.w, y = (c / g.w) | 0;
      let lit = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!g.inBounds(x + ox, y + oy)) continue;
          const j = (y + oy) * g.w + x + ox;
          if (j !== own && g.cells[j] === 0) lit = Math.max(lit, w.light.raw[j]);
        }
      if (lit < LIGHT.darkThreshold * 2) return true;
    }
    // their back is in the dark and the flamethrower has gone quiet
    const bx = p.x - fx * 1.0, bz = p.z - fz * 1.0;
    const back = g.isOpenAt(bx, bz) ? w.light.effAt(bx, bz) : 1;
    return back < SWARM.tolerance && w.time - p.lastFired > 1.5;
  }

  litDevices(): Device[] {
    return this.w.camp.devices.filter((d) => d.light?.on && !d.broken);
  }

  score(): Record<Intent, number> {
    const w = this.w, L = w.learning, D = w.director;
    const players = w.players.filter((p) => p.alive && !p.downed);
    // an opening now, or the camp has cracked recently (the hive saw it and is ready to go all-in)
    const recentCracks = this.openings.history.filter((o) => o.sensed && w.time - o.closedAt < 15).length;
    const opening = this.openings.active().length > 0 || recentCracks > 0;
    const won = (k: string) => Math.min(3, this.openingWins[k] || 0);
    const lit = this.litDevices().length;
    const camp = w.camp.devices.some((d) => d.kind === 'generator');
    const darkWire = (w.camp.darkestWirePoint()?.l ?? 1) < LIGHT.darkThreshold * 3;
    const burns = this.burnDeaths.length;
    const flameRecent = players.some((p) => w.time - p.lastFired < 40);
    const mem = (i: Intent) => Math.min(1, (this.chosen['ok:' + i] || 0) * 0.25);
    const b = D.budget;
    const s: Record<Intent, number> = {
      conceal: D.act <= 1 ? 3 : b < 0.3 ? 1.2 : 0.4,
      probe: 0.9 + (lit ? 0.3 : 0) + (L.has('testLight') ? 0.4 : 0) + (L.has('triggerMotion') && w.camp.devices.some((d) => d.kind === 'motion') ? 0.5 : 0) - (L.has('darkRush') ? 0.8 : 0),
      // cutting light worked before? she leans on it (openings she can make herself)
      sabotage: L.has('sabotage') && darkWire ? 2.0 + mem('sabotage') + 0.25 * (won('wireCut') + won('lightDied') * 0.5) : L.has('sabotageGenerator') && camp ? 1.5 : 0,
      flank: L.has('flank') || L.has('breach') ? 1.7 + (camp ? 0.3 : 0) + mem('flank') + 0.25 * won('unlitWall') : 0,
      undermine: camp ? 1.5 + mem('undermine') + 0.15 * won('flicker') : 0.6,
      reroute: 1.3 + (players.length ? 0.2 : 0),
      siege: lit ? 1.5 + mem('siege') + 0.15 * won('lightDied') : 0,
      bait: L.has('bait') && flameRecent ? 1.8 + 0.25 * won('fireStopped') : 0,
      // all-in through an opening: the queen's answer to a cracked camp
      assault:
        opening && b >= 0.5 && (D.state === 'Build Up' || D.state === 'Sustain Peak')
          ? (this.openings.active().length ? 2.0 + this.openings.active()[0].strength : 1.5) + D.team * 0.4 + (L.has('darkRush') ? 1.5 : 0)
          : 0,
      retreat: D.state === 'Relax' ? 10 : burns > 60 ? 4 : 0,
    };
    this.raw = { ...s };
    // a light penalty for repeating the last intent (the hive keeps you guessing)
    for (const k of INTENTS) {
      if (k === 'retreat') continue;
      if (k === this.intent) s[k] -= 0.8;
      s[k] -= 0.05 * (this.chosen[k] || 0);
    }
    if (D.state !== 'Relax') s.retreat = Math.min(s.retreat, burns > 60 ? 4 : -1);
    return s;
  }

  update(dt: number) {
    const w = this.w;
    this.influence.update(dt);
    this.openings.update(dt);
    this.respondT -= dt;
    if (this.respondT <= 0) {
      this.respondT = 0.2;
      this.respond();
    }
    this.burnDeaths = this.burnDeaths.filter((t) => w.time - t < 5);
    for (const t of w.tendrils.values()) this.refreshGoal(t);
    this.stepIntentEffects(dt);
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = QUEEN.thinkInterval;
    const D = w.director;
    const sc = this.score();
    this.scores = sc;
    const since = w.time - this.intentSince;
    let next: Intent = this.intent;
    if (this.forced) next = this.forced;
    else if (D.state === 'Relax') next = 'retreat';
    else if (D.state === 'Peak Fade') next = this.intent === 'retreat' ? 'conceal' : this.intent; // the current fight plays out
    else if (!this.started) next = this.pick(sc); else if (since >= this.commitFor || this.intent === 'retreat' || (this.intent !== 'assault' && (this.raw[this.intent] ?? 0) <= 0)) {
      // (an assault, once the nest has gone silent, always follows through)
      next = this.pick(sc);
    }
    if (next !== this.intent || !this.started) this.begin(next, sc[next]);
    this.phase = this.intent;
    this.syncTendrils();
  }

  /**
   * Dual-utility choice: among feasible intents scoring within 0.6 of the best, pick at random
   * weighted by score. Predictable in spirit, never in detail.
   */
  pick(sc: Record<Intent, number>): Intent {
    let best = -1e9;
    for (const k of INTENTS) if ((this.raw[k] ?? 0) > 0 && sc[k] > best) best = sc[k];
    const pool = INTENTS.filter((k) => (this.raw[k] ?? 0) > 0 && sc[k] >= best - 0.6);
    if (!pool.length) return 'probe';
    const wts = pool.map((k) => Math.max(0.05, sc[k] - (best - 0.6)));
    let r = this.w.rng.next() * wts.reduce((a, b) => a + b, 0);
    for (let k = 0; k < pool.length; k++) if ((r -= wts[k]) <= 0) return pool[k];
    return pool[pool.length - 1];
  }

  private started = false;
  private begin(i: Intent, score: number) {
    const w = this.w;
    this.started = true;
    this.intent = i;
    this.intentSince = w.time;
    this.commitFor = QUEEN.minCommit + w.rng.next() * (QUEEN.maxCommit - QUEEN.minCommit);
    this.chosen[i] = (this.chosen[i] || 0) + 1;
    this.lastChosenAt[i] = w.time;
    if (i === 'assault') {
      this.silenceUntil = w.time + QUEEN.assaultSilence;
      this.commitFor = QUEEN.assaultSilence + 9;
    }
    if (i === 'siege') this.siegeTarget = this.pickSiegeTarget()?.id ?? null;
    if (i === 'reroute') this.rerouteGoals = this.pickRerouteGoals();
    const pos = this.tellPos(i);
    this.note(`intent -> ${i} (score ${score?.toFixed(2)}, director ${w.director.state}, budget ${w.director.budget.toFixed(2)}) tell: ${TELLS[i]}`);
    w.events.emit('intent', { intent: i });
    w.events.emit('tell', { intent: i, tell: TELLS[i], x: pos.x, z: pos.z });
  }

  private tellPos(i: Intent) {
    const w = this.w;
    const p = w.players.find((q) => q.alive) ?? { x: w.layout.hive.x, z: w.layout.hive.z };
    if (i === 'siege' && this.siegeTarget != null) {
      const d = w.camp.devices.find((x) => x.id === this.siegeTarget);
      if (d) return { x: d.x, z: d.z };
    }
    if (i === 'undermine') {
      const g = w.camp.devices.find((d) => d.kind === 'generator');
      if (g) return { x: g.x, z: g.z };
    }
    if (i === 'sabotage') {
      const wp = w.camp.darkestWirePoint();
      if (wp) return { x: wp.x, z: wp.z };
    }
    return { x: p.x, z: p.z };
  }

  pickSiegeTarget(): Device | null {
    const lit = this.litDevices().filter((d) => d.kind !== 'generator');
    if (!lit.length) return null;
    // the lamp with the most darkness around it (fewest other lights nearby)
    let best: Device | null = null, bs = 1e9;
    for (const d of lit) {
      let s = 0;
      for (const o of lit) if (o !== d) s += 1 / (1 + Math.hypot(o.x - d.x, o.z - d.z));
      if (s < bs) (bs = s), (best = d);
    }
    return best;
  }

  /** Solid wall faces next to explored tunnel 10-25 m from the team: new holes behind / ahead. */
  pickRerouteGoals(): number[] {
    const w = this.w, g = w.grid;
    const p = w.players.find((q) => q.alive);
    if (!p) return [];
    const out: number[] = [];
    for (let tries = 0; tries < 4000 && out.length < 6; tries++) {
      const i = w.rng.int(g.n);
      if (g.cells[i] !== 1 || !g.isFace(i)) continue;
      const d = Math.hypot(g.centerX(i) - p.x, g.centerZ(i) - p.z);
      if (d < 10 || d > 25) continue;
      // next to tunnel the players have already seen
      const x = i % g.w, y = (i / g.w) | 0;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.isOpen(x + dx, y + dy) && g.explored[g.idx(x + dx, y + dy)])) continue;
      out.push(i);
    }
    return out;
  }

  /** Per-frame behaviour that isn't steering: siege damage, sabotage on the generator, dragging the dead, periodic tells. */
  private stepIntentEffects(dt: number) {
    const w = this.w, sw = w.swarm;
    void HIVE_INTENT;
    // fixtures under attack (siege, sabotage of the generator): attacking bugs within reach damage them
    for (const t of w.tendrils.values()) {
      const target = t.attackDevice != null ? w.camp.devices.find((d) => d.id === t.attackDevice) : null;
      if (!target || target.broken) continue;
      let n = 0;
      sw.hash.forEachNear(target.x, target.z, 0.9, (j) => {
        if (sw.alive[j] && !sw.layer[j] && sw.tendril[j] === t.id && (sw.x[j] - target.x) ** 2 + (sw.z[j] - target.z) ** 2 < 0.81) n++;
      });
      if (n) w.camp.damage(target, n * QUEEN.fixtureDamagePerBug * dt);
    }
    // dragging the dead into the dark (learned when the team harvests)
    if (w.learning.has('dragDead') && w.camp.bodies.length) {
      const bodies = w.camp.bodies;
      for (let k = bodies.length - 1; k >= 0; k--) {
        const b = bodies[k];
        let carrier = -1;
        sw.hash.forEachNear(b.x, b.z, 0.5, (j) => {
          if (sw.alive[j] && !sw.layer[j] && sw.state[j] !== 4) {
            const t = w.tendrils.get(sw.tendril[j]);
            if (t?.intent === 'retreat' || t?.intent === 'drag') {
              carrier = j;
              return true;
            }
          }
        });
        if (carrier >= 0) {
          bodies.splice(k, 1);
          sw.state[carrier] = 3; // carry
          w.events.emit('bodyDragged', { x: b.x, z: b.z });
          w.events.emit('tell', { intent: 'retreat', tell: 'bodies get dragged away', x: b.x, z: b.z });
        }
      }
    }
    // periodic tells while an intent runs (so they can be read, not just at the start)
    this.tellT -= dt;
    if (this.tellT <= 0) {
      this.tellT = 4;
      const pos = this.tellPos(this.intent);
      w.events.emit('tellPulse', { intent: this.intent, x: pos.x, z: pos.z });
    }
  }

  private syncTendrils() {
    const w = this.w, D = w.director, sw = w.swarm;
    const N = sw.active;
    const players = w.players.filter((p) => p.alive && !p.downed);
    const maxT = Math.max(QUEEN.minTendril, D.maxTendril);
    const i = this.intent;
    // how many bugs commit to the intent (the budget); the rest surround the bubble or hide
    const silent = w.time < this.silenceUntil;
    let committed = Math.round(N * Math.max(0.15, D.budget));
    if (i === 'probe') committed = Math.min(committed, 12);
    if (i === 'bait') committed = Math.min(committed, 15);
    if (i === 'conceal') committed = Math.min(committed, 40);
    if (i === 'reroute') committed = Math.min(committed, 60); // a digging party, not the nest
    if (i === 'sabotage') committed = Math.min(committed, 90);
    if (i === 'retreat') committed = N;
    if (i === 'assault') committed = N;
    const roles: { intent: string; size: number }[] = [];
    let left = committed;
    while (left > 0) {
      const sz = Math.min(maxT, left);
      roles.push({ intent: i, size: sz });
      left -= sz;
    }
    // the rest: surround the team in the dark (Build Up) or hide in the hive
    let rest = N - committed;
    const restIntent = !players.length || D.state === 'Relax' || i === 'conceal' ? 'hide' : 'surround';
    while (rest > 0) {
      const sz = Math.min(maxT, rest);
      roles.push({ intent: restIntent, size: sz });
      rest -= sz;
    }
    if (!roles.length) roles.push({ intent: 'hide', size: 0 });
    const list = [...w.tendrils.values()].filter((t) => t.intent !== HIVE_INTENT); // hive players' bugs are theirs
    while (list.length < roles.length) {
      const t = makeTendril({ params: defaultParams(), born: w.time });
      w.tendrils.set(t.id, t);
      list.push(t);
    }
    while (list.length > roles.length) w.tendrils.delete(list.pop()!.id);
    // the queen sees a respawn ritual as an opportunity: one tendril goes to break it up
    const ritual = w.players.find((p) => p.hive && p.ritualStage >= 2);
    let breaker = false;
    // a downed player is lifted by a carrier group and walked to the queen (GDD)
    const downed = w.players.find((p) => p.alive && p.downed && !p.hive);
    let carrier = false;
    list.forEach((t, k) => {
      const r = roles[k];
      t.size = r.size;
      const target = players.length ? players[k % players.length] : null;
      t.targetId = target?.id;
      this.configure(t, r.intent, silent);
      if (r.intent === 'assault') {
        const op = this.openings.active()[0];
        if (op) t.targetId = op.targetId; // all-in, through the best opening
      }
      if (t.strike) this.applyStrike(t);
      t.breakRitual = null;
      t.carryTarget = null;
      if (downed && !carrier && (r.intent === 'surround' || r.intent === 'hide' || k === list.length - 1)) {
        carrier = true;
        t.mode = 'strike';
        t.holdDist = 0;
        t.braveness = 1.6;
        t.carryTarget = downed.id;
      } else if (ritual && !breaker && r.intent === 'surround') {
        breaker = true;
        t.mode = 'strike';
        t.holdDist = 0;
        t.breakRitual = ritual.id;
      }
      this.refreshGoal(t);
    });
    // assign bugs to tendrils by role size, keeping members stable where possible
    const ids = list.map((t) => t.id);
    const quota = new Map(list.map((t) => [t.id, t.size]));
    const count = new Map<number, number>();
    const spill: number[] = [];
    for (let j = 0; j < sw.count; j++) {
      if (!sw.alive[j]) continue;
      if (w.death.isHiveTendril(sw.tendril[j])) continue;
      const cur = sw.tendril[j];
      if (quota.has(cur) && (count.get(cur) || 0) < quota.get(cur)!) count.set(cur, (count.get(cur) || 0) + 1);
      else spill.push(j);
    }
    // re-home spill: nearest-first to the committed intent so the closest bugs act
    let k = 0;
    for (const j of spill) {
      if (w.death.isHiveTendril(sw.tendril[j])) continue;
      while (k < ids.length && (count.get(ids[k]) || 0) >= quota.get(ids[k])!) k++;
      const id = k < ids.length ? ids[k] : ids[ids.length - 1];
      sw.tendril[j] = id;
      count.set(id, (count.get(id) || 0) + 1);
    }
    for (const t of list) t.members = count.get(t.id) || 0;
  }

  /**
   * Where a flank tendril waits: interior earth 2 cells behind a wall face, 3-7 m from the target,
   * behind a dark face, scored toward the player's back and sides (and the wall they keep their
   * back to, once the hive has learned to breach it). Re-chosen every few seconds, not every frame,
   * so the field stays put while they dig in.
   */
  private flankPocket(t: Tendril, p: SimPlayer): { x: number; z: number; cells: number[] } | null {
    const w = this.w, g = w.grid, inf = this.influence;
    const cache = (t as any)._pocket as { at: number; px: number; pz: number; x: number; z: number; cells: number[] } | undefined;
    if (cache && w.time - cache.at < 4 && Math.hypot(cache.px - p.x, cache.pz - p.z) < 2.5) return cache;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best: { c: number; s: number } | null = null;
    const cells: { c: number; s: number }[] = [];
    for (let k = 0; k < 240; k++) {
      const a = (k / 240) * Math.PI * 2, r = 3 + (k % 5);
      const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      const c = g.cellAt(x, z);
      if (c < 0 || g.cells[c] !== 1) continue;
      const cx = c % g.w, cy = (c / g.w) | 0;
      // two deep: the next cell toward the open space is earth, the one after is tunnel
      let face = -1;
      for (const [dx, dy] of dirs) {
        if (g.get(cx + dx, cy + dy) === 1 && g.get(cx + 2 * dx, cy + 2 * dy) === 0) face = g.idx(cx + dx, cy + dy);
      }
      if (face < 0) continue;
      const dark = w.light.surfaceRaw(face);
      if (dark > 0.25) continue;
      const toX = x - p.x, toZ = z - p.z, d = Math.hypot(toX, toZ) || 1;
      const behind = -(toX * fx + toZ * fz) / d; // 1 = right behind them
      let sc = -dark * 6 + behind * 1.2 - Math.abs(d - 4.5) * 0.3 - inf.at(inf.danger, x, z) * 2;
      if (w.learning.has('breach') && w.learning.lastWall) sc -= Math.hypot(x - w.learning.lastWall.x, z - w.learning.lastWall.z) * 0.3;
      cells.push({ c, s: sc });
      if (!best || sc > best.s) best = { c, s: sc };
    }
    if (!best) return null;
    // a small pocket: the best cell and its near neighbours among the candidates
    const bx = g.centerX(best.c), bz = g.centerZ(best.c);
    const pocket = cells.filter((q) => Math.hypot(g.centerX(q.c) - bx, g.centerZ(q.c) - bz) < 1.6).map((q) => q.c);
    const res = { at: w.time, px: p.x, pz: p.z, x: bx, z: bz, cells: pocket };
    (t as any)._pocket = res;
    return res;
  }

  /** Which tendrils may strike through an opening: the queen's intent allows it (GDD). */
  private permits(t: Tendril, op: Opening) {
    if (t.carryTarget || t.breakRitual || t.intent === HIVE_INTENT) return false;
    switch (t.intent) {
      case 'surround': // the ring around the bubble
      case 'assault':
        return true;
      case 'flank': // massed in the walls beside the camp
        return true;
      case 'undermine': // waiting under the floor
        return op.kind !== 'alone';
      case 'siege':
      case 'sabotage': // they made the dark: now they use it
        return op.kind === 'lightDied' || op.kind === 'wireCut' || op.kind === 'flicker';
      default: // conceal, probe (scouts report, don't strike), bait, reroute, retreat, hide
        return false;
    }
  }

  /** Put a responding tendril into its strike (once its turn in the wave comes). */
  private applyStrike(t: Tendril) {
    const s = t.strike!;
    if (this.w.time < s.at) return;
    if (t.mode !== 'strike') t.modeSince = this.w.time;
    t.mode = 'strike';
    t.holdDist = 0;
    t.braveness = Math.max(t.braveness, 1.35);
    t.speedMul = this.w.time - s.at < 2 ? 1.25 : 1.05; // the pounce, then the press
    t.attackDevice = null;
    if (s.kind === 'unlitWall') t.params = defaultParams({ digCost: 3 }); // straight through the wall at their back
  }

  /**
   * The strike rule (GDD): a tendril strikes only when the queen's intent allows it *and* an
   * opening exists. Runs 5x a second (flickers are short). Responders are the permitted tendrils
   * nearest the opening, sized by the director's budget and the opening's strength, released in a
   * wave (nearest first). When the opening closes they press on briefly, then fall back to the edge.
   */
  private respond() {
    const w = this.w, D = w.director, sw = w.swarm;
    const silent = w.time < this.silenceUntil;
    const tendrils = [...w.tendrils.values()].filter((t) => t.intent !== HIVE_INTENT);
    // tendril centres (where their bugs actually are)
    const cen = new Map<number, { x: number; z: number; n: number }>();
    for (let j = 0; j < sw.count; j++) {
      if (!sw.alive[j]) continue;
      const c = cen.get(sw.tendril[j]) ?? { x: 0, z: 0, n: 0 };
      c.x += sw.x[j];
      c.z += sw.z[j];
      c.n++;
      cen.set(sw.tendril[j], c);
    }
    const open = new Map(this.openings.active().map((o) => [o.id, o]));
    // keep strikes alive while their opening is open; release them once it has been shut a moment
    for (const t of tendrils) {
      if (!t.strike) continue;
      const op = open.get(t.strike.openingId);
      if (op) t.strike.until = w.time + 1.6;
      else if (w.time > t.strike.until) {
        t.strike = null;
        this.configure(t, t.intent, silent);
        this.refreshGoal(t);
        continue;
      }
      this.applyStrike(t);
      this.refreshGoal(t);
    }
    // new responders: only when the director lets the hive push (and never during the assault's hush)
    const pushing = (D.state === 'Build Up' || D.state === 'Sustain Peak') && D.budget > 0 && !silent;
    if (!pushing) return;
    const N = sw.active;
    for (const op of [...open.values()].slice(0, 3)) {
      const want = Math.round(N * D.budget * op.strength * 0.5);
      let have = 0;
      for (const t of tendrils) if (t.strike?.openingId === op.id) have += t.members;
      if (have >= want) continue;
      const cands = tendrils
        .filter((t) => !t.strike && this.permits(t, op) && t.members > 0)
        .map((t) => {
          const c = cen.get(t.id);
          return { t, d: c ? Math.hypot(c.x / c.n - op.x, c.z / c.n - op.z) : 1e9 };
        })
        .sort((a, b) => a.d - b.d);
      let first = have === 0;
      for (const { t, d } of cands) {
        if (have >= want) break;
        // nearest go first: a wave, not a teleport (and the first ones are already on their way)
        t.strike = { openingId: op.id, kind: op.kind, targetId: op.targetId, at: w.time + 0.15 + d / 25, until: w.time + 1e9 };
        have += t.members;
        op.responders += t.members;
        if (first) {
          first = false;
          this.note(`opening: ${op.kind} (${op.reason}), strength ${op.strength.toFixed(2)} -> strike with ${t.members}+ bugs`);
          const c = cen.get(t.id);
          // fromX/fromZ: where the first wave is coming from (the swell is heard from there)
          w.events.emit('strike', { kind: op.kind, x: op.x, z: op.z, fromX: c ? c.x / c.n : op.x, fromZ: c ? c.z / c.n : op.z, target: op.targetId, bugs: t.members });
        }
      }
    }
  }

  /** Turn an intent into tendril mode + field parameters + steering modifiers. */
  private configure(t: Tendril, intent: string, silent: boolean) {
    const L = this.w.learning;
    const set = (mode: TendrilMode, o: Partial<Tendril> = {}) => {
      if (t.mode !== mode) t.modeSince = this.w.time;
      t.mode = mode;
      t.holdDist = 3.5;
      t.braveness = 1;
      t.speedMul = 1;
      t.sepMul = L.has('spreadOut') && this.w.players.some((p) => this.w.time - p.lastFired < 30) ? 2.6 : 1;
      t.aliMul = 1;
      t.probeAmp = 0;
      t.attackDevice = null;
      t.params = defaultParams();
      Object.assign(t, o);
    };
    t.intent = intent;
    switch (intent) {
      case 'conceal':
        set('mass', { holdDist: 12, speedMul: 0.45, aliMul: 4 }); // a few bugs, oddly orderly
        break;
      case 'probe':
        set('mass', { holdDist: 0, probeAmp: L.has('testLight') ? 2.6 : 1.4, speedMul: 0.8 });
        break;
      case 'sabotage':
        set('strike', { holdDist: 0, params: defaultParams({ lightCost: 320 }) });
        if (L.has('sabotageGenerator')) {
          const gen = this.w.camp.devices.find((d) => d.kind === 'generator');
          if (gen && !this.w.camp.darkestWirePoint()) t.attackDevice = gen.id;
        }
        break;
      case 'flank':
        // positioning: mass inside the walls beside the camp; openings decide when they break through
        set('mass', { holdDist: 0, params: defaultParams({ digCost: 3, lightCost: 320 }) });
        break;
      case 'undermine':
        // positioning: wait beneath the generator; they erupt when the floor there goes dark
        set('mass', { holdDist: 0, params: defaultParams({ allowDig: false, allowUnder: true, underCost: 3, burrowCost: 1.5 }) });
        break;
      case 'reroute':
        set('strike', { holdDist: 0, params: defaultParams({ digCost: 2 }) });
        break;
      case 'siege': {
        const el = this.w.time - this.intentSince;
        set('mass', { holdDist: 0, braveness: Math.min(QUEEN.siegeMaxBravery, 1 + el * QUEEN.siegeBraveryRate), attackDevice: this.siegeTarget });
        break;
      }
      case 'bait':
        set('strike', { holdDist: 0, braveness: 6 }); // oddly brave: they stand in your light
        break;
      case 'assault':
        set(silent ? 'mass' : 'strike', { holdDist: silent ? 6 : 0, braveness: silent ? 1 : 1.3, speedMul: silent ? 0.3 : 1.15 });
        break;
      case 'retreat':
        set('retreat');
        break;
      case 'surround':
        // the bubble: darkness on every side; during an assault everyone goes
        set(silent ? 'mass' : 'mass', { holdDist: this.intent === 'bait' ? 8 : 5 });
        break;
      case 'hide':
      default:
        set('retreat', { speedMul: 0.6 });
    }
  }

  refreshGoal(t: Tendril) {
    const w = this.w;
    if (t.intent === HIVE_INTENT) return; // steered by its hive player
    if (t.carryTarget) {
      const dp = w.players.find((p) => p.id === t.carryTarget && p.downed && !p.hive);
      if (dp) {
        t.fieldName = 'carry:' + dp.id;
        t.gx = dp.x;
        t.gz = dp.z;
        t.goals = w.goalCellsAt(dp.x, dp.z, 1);
        return;
      }
    }
    if (t.strike && w.time >= t.strike.at) {
      const tp = w.players.find((p) => p.id === t.strike!.targetId && p.alive && !p.downed && !p.hive);
      if (tp) {
        // the field (already rebuilt around the new darkness) routes them through the gap
        t.fieldName = 'player:' + tp.id;
        t.gx = tp.x;
        t.gz = tp.z;
        t.goals = w.goalCellsAt(tp.x, tp.z, 1);
        return;
      }
    }
    if (t.breakRitual) {
      const rp = w.players.find((p) => p.id === t.breakRitual && p.hive);
      if (rp) {
        t.fieldName = 'ritual';
        t.gx = rp.hiveX;
        t.gz = rp.hiveZ;
        t.goals = w.goalCellsAt(rp.hiveX, rp.hiveZ, 1);
        return;
      }
    }
    const hive = () => {
      t.fieldName = 'hive';
      t.gx = w.layout.hive.x;
      t.gz = w.layout.hive.z;
      t.goals = w.goalCellsAt(t.gx, t.gz, 2);
    };
    if (t.mode === 'retreat') {
      // dragging the dead: retreating bugs swing past bodies on the way out
      if (t.intent === 'retreat' && w.learning.has('dragDead') && w.camp.bodies.length) {
        const b = w.camp.bodies[0];
        t.fieldName = 'bodies';
        t.gx = b.x;
        t.gz = b.z;
        t.goals = w.camp.bodies.slice(0, 20).map((bb) => w.grid.cellAt(bb.x, bb.z)).filter((c) => c >= 0);
        return;
      }
      return hive();
    }
    const p = w.players.find((pp) => pp.id === t.targetId && pp.alive && !pp.downed) ?? w.players.find((pp) => pp.alive && !pp.downed);
    switch (t.intent) {
      case 'sabotage': {
        // every dark stretch of cable: the tendril spreads along it (ants on sugar)
        const goals: number[] = [];
        for (const wr of w.camp.wires)
          for (let k = 0; k < wr.points.length - 1; k++) {
            if (wr.cuts.has(k)) continue;
            const a = wr.points[k];
            if (w.light.rawAt(a.x, a.z) < LIGHT.darkThreshold * 3) {
              const c = w.grid.cellAt(a.x, a.z);
              if (c >= 0) goals.push(c);
            }
          }
        if (t.attackDevice != null) {
          const gen = w.camp.devices.find((d) => d.id === t.attackDevice);
          if (gen) goals.push(...w.goalCellsAt(gen.x, gen.z, 1));
        }
        if (goals.length) {
          const wp = w.camp.darkestWirePoint();
          t.fieldName = 'wire';
          t.gx = wp?.x ?? t.gx;
          t.gz = wp?.z ?? t.gz;
          t.goals = goals;
          return;
        }
        break;
      }
      case 'siege': {
        const d = w.camp.devices.find((x) => x.id === t.attackDevice);
        if (d) {
          t.fieldName = 'dev:' + d.id;
          t.gx = d.x;
          t.gz = d.z;
          t.goals = w.goalCellsAt(d.x, d.z, 1);
          return;
        }
        break;
      }
      case 'undermine': {
        const gen = w.camp.devices.find((d) => d.kind === 'generator');
        const x = gen ? gen.x : p?.x, z = gen ? gen.z : p?.z;
        if (x != null) {
          t.fieldName = 'under';
          t.gx = x;
          t.gz = z!;
          t.goals = w.goalCellsAt(x, z!, 2);
          return;
        }
        break;
      }
      case 'reroute':
        if (this.rerouteGoals.some((c) => w.grid.cells[c] === 1)) {
          t.fieldName = 'reroute';
          t.goals = this.rerouteGoals.filter((c) => w.grid.cells[c] === 1);
          t.gx = w.grid.centerX(t.goals[0]);
          t.gz = w.grid.centerZ(t.goals[0]);
          return;
        }
        if (this.intent === 'reroute') this.rerouteGoals = this.pickRerouteGoals();
        break;
      case 'bait':
        if (p) {
          // a spot in the open in front of the player, at the edge of their light
          const d = 6.5;
          let x = p.x + Math.sin(p.yaw) * d, z = p.z + Math.cos(p.yaw) * d;
          if (!w.grid.isOpenAt(x, z)) (x = p.x + Math.sin(p.yaw) * 3.5), (z = p.z + Math.cos(p.yaw) * 3.5);
          t.fieldName = 'bait';
          t.gx = x;
          t.gz = z;
          t.goals = w.goalCellsAt(x, z, 1);
          return;
        }
        break;
      case 'flank':
        if (p) {
          // mass inside the walls around the camp (GDD): pockets two cells deep in the earth beside
          // the team, behind a dark face, preferring their back and sides. The face stays intact, so
          // positioning never breaks through by itself; an opening does.
          const pocket = this.flankPocket(t, p);
          if (pocket) {
            t.fieldName = 'flank:' + t.id;
            t.gx = pocket.x;
            t.gz = pocket.z;
            t.goals = pocket.cells;
            return;
          }
        }
        break;
      case 'probe': {
        // a light to test: a lit device (motion lamps when they've learned to trigger them), or a flashlight
        const L = w.learning;
        let dev: Device | undefined;
        if (L.has('triggerMotion')) dev = w.camp.devices.find((d) => d.kind === 'motion' && d.powered);
        dev = dev ?? this.litDevices().find((d) => d.kind !== 'generator');
        if (dev) {
          t.fieldName = 'probe:' + dev.id;
          t.gx = dev.x;
          t.gz = dev.z;
          t.goals = w.goalCellsAt(dev.x, dev.z, 1);
          return;
        }
        break;
      }
    }
    if (!p) return hive();
    t.fieldName = 'player:' + p.id;
    t.gx = p.x;
    t.gz = p.z;
    t.goals = w.goalCellsAt(p.x, p.z, 1);
  }

  note(s: string) {
    const line = `[queen t=${this.w.time.toFixed(1)}] ${s}`;
    console.log(line);
    this.log.push(line);
    if (this.log.length > 200) this.log.shift();
  }
}

