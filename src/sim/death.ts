import { DEATH, FUEL } from '../config';
import { defaultParams } from './fieldManager';
import { makeTendril, Tendril } from './tendril';
import { BURN } from './swarm';
import type { World, SimPlayer } from './world';

export const HIVE_INTENT = 'hiveplayer';

/**
 * Death and the hive (GDD): downed players are lifted by carriers and walked to the queen;
 * teammates can scatter the carriers and revive them. A player who reaches the queen is devoured
 * and plays as the hive: dim control of a group of bugs, forceful orders, a will meter that drains
 * when resisting. The respawn ritual: gather ~60 bugs into a body, force it into the light, have it
 * electrocuted for ~10 s (lightning gun, a live wire, or the solo bug zapper), return at low health
 * for about 150 fuel. If every player is in the hive, the run fails.
 */
export class Death {
  hiveTendrils = new Map<string, Tendril>(); // player id -> their bugs
  stage = new Map<string, number>(); // ritual stage: 0 gather, 1 body formed, 2 in the light
  hiveSince = new Map<string, number>();
  orders = new Map<string, { x: number; z: number; text: string }>();
  constructor(public w: World) {}

  /** Bugs belonging to a hive player (the queen must not reassign them). */
  isHiveTendril(id: number) {
    for (const t of this.hiveTendrils.values()) if (t.id === id) return true;
    return false;
  }

  step(dt: number) {
    const w = this.w;
    for (const p of w.players) {
      if (!p.alive) continue;
      if (p.downed && !p.hive) this.stepDowned(p, dt);
      else if (p.hive) this.stepHive(p, dt);
    }
    // revive: a teammate holding E on a downed player (applied from actions via p.reviving)
    // failure: every player in the hive at once
    const humans = w.players.filter((p) => p.alive && p.connected);
    if (humans.length && humans.every((p) => p.hive) && w.runState === 'playing') {
      const solo = w.players.length === 1;
      const zapper = w.camp.devices.some((d) => d.kind === 'bugzapper' && d.powered && !d.broken);
      const since = w.time - (this.hiveSince.get(humans[0].id) ?? w.time);
      if (!solo || !zapper || since > DEATH.soloGrace) this.fail(solo ? (zapper ? 'the solo ritual took too long' : 'alone in the hive with no bug zapper') : 'every player is in the hive');
    }
  }

  fail(reason: string) {
    const w = this.w;
    w.runState = 'failed';
    w.failReason = reason;
    w.events.emit('runFailed', { reason });
    console.log(`[run t=${w.time.toFixed(1)}] FAILED: ${reason}`);
  }

  private hiveGoal() {
    return this.w.goalCellsAt(this.w.layout.hive.x, this.w.layout.hive.z, 2);
  }

  private stepDowned(p: SimPlayer, dt: number) {
    const w = this.w, sw = w.swarm;
    // carriers: bugs on the body lift it and walk it toward the queen
    let carriers = 0;
    sw.hash.forEachNear(p.x, p.z, 2, (j) => {
      if (sw.alive[j] && !sw.layer[j] && sw.state[j] !== BURN && (sw.x[j] - p.x) ** 2 + (sw.z[j] - p.z) ** 2 < 4) carriers++;
    });
    if (carriers >= DEATH.carriers) {
      if (p.carriedT === 0) w.events.emit('carried', { id: p.id, x: p.x, z: p.z });
      p.carriedT += dt;
      const f = w.fields.get('hive', this.hiveGoal(), defaultParams({ allowDig: false }), w.time);
      const c = w.grid.cellAt(p.x, p.z);
      const nx = f.next && c >= 0 ? f.next[c] : -1;
      if (nx >= 0 && nx < w.grid.n) {
        const tx = w.grid.centerX(nx) - p.x, tz = w.grid.centerZ(nx) - p.z;
        const l = Math.hypot(tx, tz) || 1;
        p.x += (tx / l) * DEATH.carrySpeed * dt;
        p.z += (tz / l) * DEATH.carrySpeed * dt;
      }
      // the swarm crushes and swallows their voice; on arrival, the queen devours them
      const dq = Math.hypot(p.x - w.layout.hive.x, p.z - w.layout.hive.z);
      if (dq < DEATH.devourDist || p.carriedT >= DEATH.carryMax) this.devour(p);
    }
    // revive progress decays if nobody is helping
    p.reviveT = Math.max(0, p.reviveT - dt * 0.5);
  }

  /** Called from actions when a teammate holds E on a downed player. */
  revive(helper: SimPlayer, p: SimPlayer, dt: number) {
    if (!p.downed || p.hive) return;
    p.reviveT += dt * 1.5; // net of the decay above
    if (p.reviveT >= DEATH.reviveTime) {
      p.downed = false;
      p.overwhelm = DEATH.reviveOverwhelm;
      p.carriedT = 0;
      p.reviveT = 0;
      this.w.events.emit('revived', { id: p.id, by: helper.id, x: p.x, z: p.z });
    }
  }

  devour(p: SimPlayer) {
    const w = this.w;
    p.downed = false;
    p.hive = true;
    p.carriedT = 0;
    p.will = 1;
    p.ritual = 0;
    p.hiveX = p.x;
    p.hiveZ = p.z;
    p.flashlight.on = false;
    p.firing = false;
    // their gear falls where they were devoured
    for (const it of [...p.slots, p.carrying]) if (it) w.camp.floor.push({ item: it, x: p.x + (w.rng.next() - 0.5), z: p.z + (w.rng.next() - 0.5) });
    p.slots = [null, null, null];
    p.carrying = null;
    w.camp.version++;
    this.hiveSince.set(p.id, w.time);
    this.stage.set(p.id, 0);
    const t = makeTendril({ params: defaultParams({ lightCost: 40 }), mode: 'strike', intent: HIVE_INTENT, holdDist: 0, braveness: 8, fieldName: 'hivep:' + p.id, born: w.time });
    t.gx = p.x;
    t.gz = p.z;
    t.goals = w.goalCellsAt(p.x, p.z, 1);
    w.tendrils.set(t.id, t);
    this.hiveTendrils.set(p.id, t);
    w.events.emit('devoured', { id: p.id, x: p.x, z: p.z });
    console.log(`[hive t=${w.time.toFixed(1)}] ${p.id} was devoured and joins the hive`);
  }

  /** The queen's forceful order for a hive player: go where her current intent is aimed. */
  private order(p: SimPlayer) {
    const w = this.w;
    const main = [...w.tendrils.values()].find((t) => t.intent !== HIVE_INTENT && t.intent !== 'surround' && t.intent !== 'hide');
    const intent = main?.intent ?? 'surround';
    const text: Record<string, string> = {
      sabotage: 'Cut the cable in the dark',
      siege: 'Break the lamp',
      undermine: 'Dig under their generator',
      flank: 'Go through the wall at their side',
      reroute: 'Dig behind them',
      assault: 'Kill them all',
      bait: 'Stand in their light',
      probe: 'Touch their light',
      conceal: 'Hide',
      retreat: 'Come home',
    };
    const o = { x: main?.gx ?? w.layout.hive.x, z: main?.gz ?? w.layout.hive.z, text: text[intent] ?? 'Surround them' };
    this.orders.set(p.id, o);
    p.order = o.text;
    return o;
  }

  private stepHive(p: SimPlayer, dt: number) {
    const w = this.w, sw = w.swarm;
    const t = this.hiveTendrils.get(p.id)!;
    if (!t) return;
    // members and their centre
    let n = 0, cx = 0, cz = 0;
    for (let j = 0; j < sw.count; j++)
      if (sw.alive[j] && sw.tendril[j] === t.id) {
        n++;
        cx += sw.x[j];
        cz += sw.z[j];
      }
    if (n) {
      p.hiveX = cx / n;
      p.hiveZ = cz / n;
    }
    p.x = p.hiveX;
    p.z = p.hiveZ;
    // recruit nearby bugs up to a body's worth (dim control over a group of bugs)
    if (n < DEATH.bodyBugs) {
      let need = Math.min(DEATH.bodyBugs - n, Math.ceil(30 * dt) + 1);
      sw.hash.forEachNear(p.hiveX, p.hiveZ, DEATH.recruitRadius, (j) => {
        if (need <= 0) return true;
        if (!sw.alive[j] || sw.layer[j] || sw.state[j] === BURN || this.isHiveTendril(sw.tendril[j])) return;
        sw.tendril[j] = t.id;
        need--;
      });
    }
    t.members = n;
    // orders and will: resisting drains it and your bugs drag toward the queen's goal
    const o = this.order(p);
    const ox = o.x - p.hiveX, oz = o.z - p.hiveZ;
    const ol = Math.hypot(ox, oz) || 1;
    const [mx, mz] = p.hiveMove;
    const moving = Math.hypot(mx, mz) > 0.1;
    const agree = moving ? (mx * ox + mz * oz) / ol : 1;
    const lit = w.light.rawAt(p.hiveX, p.hiveZ);
    const st = n >= DEATH.bodyBugs * 0.9 ? Math.max(1, this.stage.get(p.id) ?? 0) : 0;
    if (moving && agree < -0.1) p.will -= DEATH.willDrainResist * dt;
    else p.will += DEATH.willRefill * dt;
    const pinned = w.time - (p.shockedAt ?? -100) < 0.5;
    if (st >= 1 && lit > DEATH.ritualLight * 0.5 && !pinned) p.will -= DEATH.willDrainLight * dt; // the bugs hate the light
    p.will = Math.max(0, Math.min(1, p.will));
    // steer toward the last open point along your direction (never a goal inside a wall)
    // (if the straight line is blocked, slide along the wall: try nearby angles)
    let px = p.hiveX, pz = p.hiveZ, bestReach = -1;
    if (moving)
      for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
        const ca = Math.cos(da), sa = Math.sin(da);
        const dx = mx * ca - mz * sa, dz = mx * sa + mz * ca;
        let reach = 0;
        while (reach < 3 && w.grid.isOpenAt(p.hiveX + dx * (reach + 0.25), p.hiveZ + dz * (reach + 0.25))) reach += 0.25;
        const score = reach - Math.abs(da) * 0.8;
        if (score > bestReach) (bestReach = score), (px = p.hiveX + dx * reach), (pz = p.hiveZ + dz * reach);
        if (reach >= 2.5 && da === 0) break;
      }
    // as will falls your bugs drift toward her goal; you always keep a little dim control
    const k = 0.75 * (1 - p.will);
    t.gx = px * (1 - k) + o.x * k;
    t.gz = pz * (1 - k) + o.z * k;
    if (!moving && p.will > 0.2) (t.gx = p.hiveX), (t.gz = p.hiveZ);
    t.goals = w.goalCellsAt(t.gx, t.gz, 1);
    t.mode = 'strike';
    t.braveness = st >= 1 ? 10 : 2; // a body can be forced into the light
    t.sepMul = st >= 1 ? 0.25 : 1; // packed into a human shape
    t.speedMul = st >= 1 ? 0.55 : 1;

    // ---- the ritual ----
    let stage = st;
    if (stage >= 1 && lit >= DEATH.ritualLight) stage = 2;
    p.ritualStage = stage;
    if (stage !== (this.stage.get(p.id) ?? 0)) {
      this.stage.set(p.id, stage);
      w.events.emit('ritualStage', { id: p.id, stage, x: p.hiveX, z: p.hiveZ });
    }
    if (stage === 2) {
      // electrocution: a live wire touching the body, or (solo) a powered bug zapper
      let shock = false;
      for (const wr of w.camp.wires) {
        if (!wr.live) continue;
        for (const pt of wr.points)
          if (Math.hypot(pt.x - p.hiveX, pt.z - p.hiveZ) < 1.2) {
            shock = true;
            break;
          }
        if (shock) break;
      }
      for (const d of w.camp.devices)
        if (d.kind === 'bugzapper' && d.powered && !d.broken && Math.hypot(d.x - p.hiveX, d.z - p.hiveZ) < 2) {
          shock = true;
          w.fuel.drain(DEATH.soloZapperPerSec * dt, 'bugzapper', w.time);
        }
      if (shock) {
        p.ritual += dt / DEATH.ritualTime;
        // the current pins the struggling mass where it stands
        t.gx = p.hiveX;
        t.gz = p.hiveZ;
        t.goals = w.goalCellsAt(p.hiveX, p.hiveZ, 0);
        p.shockedAt = w.time;
      }
      // the queen sends a tendril to break it up
      let hostile = 0;
      sw.hash.forEachNear(p.hiveX, p.hiveZ, 1.5, (j) => {
        if (sw.alive[j] && !sw.layer[j] && sw.tendril[j] !== t.id && !this.isHiveTendril(sw.tendril[j])) hostile++;
      });
      if (hostile >= DEATH.breakBugs) {
        p.ritual = Math.max(0, p.ritual - dt * 0.2);
        if (p.ritual === 0 && hostile > DEATH.breakBugs * 2) this.breakBody(p, t);
      }
      if (p.ritual >= 1) this.respawn(p, t);
    }
  }

  /** Lightning gun hits on a struggling body count as electrocution. */
  shockBody(j: number): boolean {
    const w = this.w;
    for (const [pid, t] of this.hiveTendrils) {
      if (w.swarm.tendril[j] !== t.id) continue;
      if ((this.stage.get(pid) ?? 0) < 2) return false;
      const p = w.players.find((q) => q.id === pid);
      if (p) p.ritual += DEATH.lightningRitual / DEATH.ritualTime;
      return true;
    }
    return false;
  }

  private breakBody(p: SimPlayer, t: Tendril) {
    const sw = this.w.swarm;
    let k = 0;
    for (let j = 0; j < sw.count; j++) if (sw.alive[j] && sw.tendril[j] === t.id && k++ % 2 === 0) sw.tendril[j] = -1;
    this.stage.set(p.id, 0);
    this.w.events.emit('ritualBroken', { id: p.id, x: p.hiveX, z: p.hiveZ });
  }

  respawn(p: SimPlayer, t: Tendril) {
    const w = this.w, sw = w.swarm;
    for (let j = 0; j < sw.count; j++) if (sw.alive[j] && sw.tendril[j] === t.id) sw.kill(j, 'ritual', w.events);
    w.tendrils.delete(t.id);
    this.hiveTendrils.delete(p.id);
    this.stage.delete(p.id);
    p.hive = false;
    p.downed = false;
    p.ritual = 0;
    p.ritualStage = 0;
    p.order = '';
    p.will = 1;
    p.overwhelm = DEATH.respawnOverwhelm;
    p.x = p.hiveX;
    p.z = p.hiveZ;
    if (!w.grid.isOpenAt(p.x, p.z)) {
      p.x = w.layout.start.x;
      p.z = w.layout.start.z;
    }
    w.fuel.drain(FUEL.respawn, 'respawn', w.time);
    w.events.emit('respawned', { id: p.id, x: p.x, z: p.z });
    console.log(`[hive t=${w.time.toFixed(1)}] ${p.id} was rebuilt from the swarm (−${FUEL.respawn} fuel)`);
  }
}

