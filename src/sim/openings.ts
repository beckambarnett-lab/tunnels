import { CELL, LIGHT, SWARM, QUEEN } from '../config';
import type { World, SimPlayer } from './world';
import type { LightSource } from './light';

/**
 * Openings (GDD, Attack rules): the moments a tendril may strike. "A light flickers or dies, a
 * player is alone or out of light, someone stands against an unlit wall, the flamethrower stops
 * firing, a wire is cut." Without one, the swarm masses at the edge of the light (or inside the
 * walls around it) and waits.
 *
 * Openings are found the way the hive would find them:
 *  - Light openings come from the light map itself: cells near a player that were lit and have just
 *    gone dark are the hole in the bubble. One mechanism covers a lamp dying, a cut cable killing
 *    everything downstream, the generator sputtering, a flashlight switched off or flickering, a
 *    device packed up, and the flamethrower's fire going out. The recent cause names the kind.
 *  - Player openings are states: alone (multiplayer), out of the camp's light, against an unlit
 *    wall.
 * An opening only exists for the queen if one of her bugs is close enough to sense it.
 */

export type OpeningKind = 'lightDied' | 'flicker' | 'wireCut' | 'fireStopped' | 'alone' | 'outOfLight' | 'unlitWall';

export interface Opening {
  id: number;
  kind: OpeningKind;
  x: number; // where the dark gap touches the bubble (or the player, for player openings)
  z: number;
  targetId: string;
  strength: number; // 0..1: how big a gap
  born: number;
  seen: number; // last time the condition was confirmed
  sensed: boolean; // a bug is near enough to know about it (no omniscience)
  open: boolean;
  closedAt: number;
  responders: number; // bugs committed to it
  harm: number; // overwhelm it caused while open (memory of what worked)
  overwhelm0: number;
  reason: string;
}

export const OPENING = {
  interval: 0.2, // s between scans (flickers are short)
  scanRadius: 12, // m around each player for light holes
  minHoleCells: 6, // ~1.5 m² of new darkness
  aloneDist: 12, // m from every teammate
  fireMinBurst: 0.8, // s of firing before stopping counts
  fireWindow: 2.5, // s the stop stays an opening
  causeWindow: 1.2, // s a cause (cut, sputter...) is credited
  maxAge: 10, // s a light hole stays an opening if nobody relights it
};

const STRENGTH: Record<OpeningKind, number> = {
  lightDied: 0.75,
  flicker: 0.45,
  wireCut: 0.85,
  fireStopped: 0.6,
  alone: 0.6,
  outOfLight: 0.8,
  unlitWall: 0.55,
};

export class Openings {
  list: Opening[] = [];
  history: Opening[] = []; // closed openings (for tests, logs and learning)
  stats: Record<string, { detected: number; exploited: number; succeeded: number }> = {};
  private prev: Float32Array;
  private t = 0;
  private nextId = 1;
  private causes: { kind: OpeningKind | 'sputter'; x: number; z: number; t: number }[] = [];
  private firingSince = new Map<string, number>();
  private prevSources = new Map<number, { on: boolean; intensity: number }>();

  constructor(public w: World) {
    this.prev = new Float32Array(w.grid.n);
    const cause = (kind: OpeningKind | 'sputter') => (e: any) => this.causes.push({ kind, x: e.x ?? 0, z: e.z ?? 0, t: w.time });
    w.events.on('wireCut', cause('wireCut'));
    w.events.on('deviceBroken', cause('lightDied'));
    w.events.on('generatorOff', cause('lightDied'));
    w.events.on('devicePacked', (e) => this.causes.push({ kind: 'lightDied', x: e.x ?? 0, z: e.z ?? 0, t: w.time }));
    w.events.on('sputter', cause('sputter'));
  }

  private stat(k: string) {
    return (this.stats[k] ??= { detected: 0, exploited: 0, succeeded: 0 });
  }

  /** Sensed, open openings, strongest first. */
  active(): Opening[] {
    return this.list.filter((o) => o.open && o.sensed).sort((a, b) => b.strength - a.strength);
  }
  forPlayer(id: string) {
    return this.active().filter((o) => o.targetId === id);
  }

  private upsert(kind: OpeningKind, p: SimPlayer, x: number, z: number, strength: number, reason: string, mergeDist = 3) {
    const w = this.w;
    let o = this.list.find((q) => q.open && q.kind === kind && q.targetId === p.id && Math.hypot(q.x - x, q.z - z) < mergeDist);
    if (o) {
      o.seen = w.time;
      o.strength = Math.max(o.strength * 0.9, strength);
      o.x = o.x * 0.7 + x * 0.3;
      o.z = o.z * 0.7 + z * 0.3;
      return o;
    }
    o = { id: this.nextId++, kind, x, z, targetId: p.id, strength, born: w.time, seen: w.time, sensed: false, open: true, closedAt: 0, responders: 0, harm: 0, overwhelm0: p.overwhelm, reason };
    this.list.push(o);
    this.stat(kind).detected++;
    w.events.emit('openingFound', { id: o.id, kind, x, z, target: p.id, strength, reason });
    return o;
  }

  private close(o: Opening) {
    const w = this.w;
    o.open = false;
    o.closedAt = w.time;
    this.history.push(o);
    if (this.history.length > 200) this.history.shift();
    if (o.responders > 0) this.stat(o.kind).exploited++;
    if (o.harm > 0.08) this.stat(o.kind).succeeded++;
    w.events.emit('openingClosed', { id: o.id, kind: o.kind, x: o.x, z: o.z, harm: o.harm, responders: o.responders });
  }

  /** Light from everything except the player's own flashlight (are they inside the camp's light?). */
  otherLight(p: SimPlayer) {
    return this.w.light.lightAt(p.x, p.z, p.flashlight);
  }

  private cause(x: number, z: number): OpeningKind | 'sputter' | null {
    const w = this.w;
    let best: { kind: OpeningKind | 'sputter'; d: number } | null = null;
    for (const c of this.causes) {
      if (w.time - c.t > OPENING.causeWindow) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < 18 && (!best || d < best.d)) best = { kind: c.kind, d };
    }
    return best?.kind ?? null;
  }

  update(dt: number) {
    const w = this.w, g = w.grid, L = w.light;
    // fire stopping: a sustained burst that ends leaves a window (the flamethrower stops firing)
    for (const p of w.players) {
      if (p.firing) {
        if (!this.firingSince.has(p.id)) this.firingSince.set(p.id, w.time);
      } else if (this.firingSince.has(p.id)) {
        const burst = w.time - this.firingSince.get(p.id)!;
        this.firingSince.delete(p.id);
        if (burst >= OPENING.fireMinBurst && p.alive && !p.downed && !p.hive) {
          const x = p.x + Math.sin(p.yaw) * 2.5, z = p.z + Math.cos(p.yaw) * 2.5;
          this.causes.push({ kind: 'fireStopped', x, z, t: w.time });
          this.upsert('fireStopped', p, x, z, STRENGTH.fireStopped, `the flamethrower stopped after ${burst.toFixed(1)} s`);
        }
      }
    }
    this.t -= dt;
    if (this.t > 0) return;
    const step = OPENING.interval - this.t;
    this.t = OPENING.interval;
    const tol = SWARM.tolerance;
    const players = w.players.filter((p) => p.alive && !p.downed && !p.hive);

    // ---- light holes: lit a moment ago, dark now ----
    const dimmed = this.dimmedSources(w.allLights());
    for (const p of players) {
      const r = OPENING.scanRadius / CELL;
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      let n = 0, best = -1, bd = 1e9, sx = 0, sz = 0;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, z = cz + dz;
          if (!g.inBounds(x, z)) continue;
          const i = z * g.w + x;
          if (g.cells[i] !== 0) continue;
          if (this.prev[i] > tol && L.eff[i] < tol * 0.6) {
            n++;
            sx += x;
            sz += z;
            const d = dx * dx + dz * dz;
            if (d < bd) (bd = d), (best = i);
          }
        }
      if (n >= OPENING.minHoleCells && best >= 0) {
        const hx = g.centerX(best), hz = g.centerZ(best);
        const c = this.cause((sx / n + 0.5) * CELL, (sz / n + 0.5) * CELL);
        let kind: OpeningKind = 'lightDied';
        if (c === 'wireCut' || c === 'fireStopped') kind = c;
        else if (c === 'sputter' || dimmed) kind = 'flicker';
        const s = Math.min(1, Math.max(0.3, n / 40)) * STRENGTH[kind] + 0.15;
        this.upsert(kind, p, hx, hz, Math.min(1, s), `${n} cells went dark ${Math.sqrt(bd) * CELL < 1 ? 'right beside' : Math.round(Math.sqrt(bd) * CELL) + ' m from'} ${p.id}`, 5);
      }
    }
    this.prev.set(L.eff);
    // a light hole closes when its spot is lit again (or it gets old)
    for (const o of this.list) {
      if (!o.open) continue;
      const light = o.kind === 'lightDied' || o.kind === 'flicker' || o.kind === 'wireCut';
      if (light) {
        if (L.effAt(o.x, o.z) > tol) this.close(o);
        else if (w.time - o.born > OPENING.maxAge) this.close(o);
        else o.seen = w.time;
      }
      if (o.kind === 'fireStopped') {
        const p = w.players.find((q) => q.id === o.targetId);
        if (!p || p.firing || w.time - o.born > OPENING.fireWindow) this.close(o);
      }
    }

    // ---- player openings: states that hold while they last ----
    const solo = w.players.length === 1;
    w.shadowFaces.clear();
    for (const p of players) {
      if (p.riding) continue;
      const others = players.filter((q) => q !== p);
      if (!solo && others.length && Math.min(...others.map((q) => Math.hypot(q.x - p.x, q.z - p.z))) > OPENING.aloneDist)
        this.upsert('alone', p, p.x, p.z, STRENGTH.alone, `${p.id} is alone`, 99);
      if (this.otherLight(p) < tol) this.upsert('outOfLight', p, p.x, p.z, STRENGTH.outOfLight, `${p.id} is out of the light`, 99);
      const wall = this.unlitWall(p);
      if (wall) {
        w.shadowFaces.add(wall.cell); // dark enough to break through (the breach rule)
        this.upsert('unlitWall', p, wall.x, wall.z, STRENGTH.unlitWall, `${p.id} has an unlit wall at their ${wall.side}`, 2);
      }
    }
    for (const o of this.list) {
      if (!o.open || (o.kind !== 'alone' && o.kind !== 'outOfLight' && o.kind !== 'unlitWall')) continue;
      if (w.time - o.seen > step * 1.5) this.close(o);
    }

    // ---- sensing and harm ----
    const sw = w.swarm;
    for (const o of this.list) {
      if (!o.open) continue;
      let found = false;
      sw.hash.forEachNear(o.x, o.z, QUEEN.senseRange, (j) => {
        if (sw.alive[j] && !w.death.isHiveTendril(sw.tendril[j])) {
          found = true;
          return true;
        }
      });
      if (found && !o.sensed) w.events.emit('openingSensed', { id: o.id, kind: o.kind, x: o.x, z: o.z });
      o.sensed = found;
      const p = w.players.find((q) => q.id === o.targetId);
      if (p) {
        o.harm = Math.max(o.harm, p.overwhelm - o.overwhelm0 + (p.downed ? 1 : 0));
      }
    }
    this.list = this.list.filter((o) => o.open);
    this.causes = this.causes.filter((c) => w.time - c.t < OPENING.causeWindow * 2);
  }

  /** Did any electric light dim without going out (a weak battery, a sputtering generator)? */
  private dimmedSources(sources: LightSource[]) {
    let dimmed = false;
    const seen = new Set<number>();
    for (const s of sources) {
      seen.add(s.id);
      const prev = this.prevSources.get(s.id);
      if (prev && s.on && prev.on && s.intensity < prev.intensity * 0.6) dimmed = true;
      this.prevSources.set(s.id, { on: s.on, intensity: s.intensity });
    }
    return dimmed;
  }

  /**
   * Earth right behind or beside a player whose face is unlit: the light that would reach it is
   * blocked by the player's own body (or there is none). The hive can break out right there.
   */
  unlitWall(p: SimPlayer): { x: number; z: number; side: string; cell: number } | null {
    const w = this.w, g = w.grid;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const sides: [number, number, string][] = [
      [-fx, -fz, 'back'],
      [-fz, fx, 'side'],
      [fz, -fx, 'side'],
    ];
    for (const [dx, dz, side] of sides) {
      const c = g.cellAt(p.x + dx * 0.7, p.z + dz * 0.7);
      if (c < 0 || g.cells[c] !== 1) continue;
      // the face: where the wall meets the space the player stands in
      const fxp = p.x + dx * 0.45, fzp = p.z + dz * 0.45;
      const lit = w.light.lightAt(fxp, fzp, p.flashlight, { x: p.x, z: p.z, r: 0.32 });
      if (lit < LIGHT.darkThreshold * 2) return { x: g.centerX(c), z: g.centerZ(c), side, cell: c };
    }
    return null;
  }
}
