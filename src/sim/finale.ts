import { CELL } from '../config';
import { Z } from './night';
import type { World, SimPlayer } from './world';

export const TRUCK = { radius: 1.1, openSpeed: 4.5, digSpeed: 1.3, turnRate: 2.2, bugDamage: 0.0035, queenDamage: 0.12, hp: 1 };
export const QBOSS = { speed: 5.2, digSpeed: 2.6, reach: 2.6, stunTime: 3, knockTime: 1.5, knockDist: 6, chargeRate: 0.1 };

export type Role = 'driver' | 'gunnerL' | 'gunnerR' | 'keeper';

/**
 * The finale (GDD, Decided): the Enlite digging truck carries everyone up through the earth with
 * the queen in pursuit. Fast in open space, slow while digging; the driver steers, side gunners
 * burn what tears at it, the queen-keeper spends charge on a stun burst (she stops, then comes
 * back stronger) or a knock-aside (she careens to the side). Bursting out into the sunrise kills
 * her. Fewer players: roles merge; the queen and swarm are less aggressive.
 */
export class Finale {
  state: 'waiting' | 'driving' | 'won' | 'lost' = 'waiting';
  truck = { x: 0, z: 0, yaw: -Math.PI / 2, hp: TRUCK.hp, speed: 0, digging: false };
  queen = { x: 0, z: 0, stun: 0, rage: 1, alive: true, speedMul: 1 };
  energy = 0;
  roles = new Map<string, Role>();
  startedAt = 0;
  ending: 'true' | 'hollow' | null = null;
  mind = false; // replaying the finale inside the swarm's mind (the bad ending loop)
  replays = 0;
  private start0 = { truck: { x: 0, z: 0 }, queen: { x: 0, z: 0 } };

  constructor(public w: World) {
    const tm = (w.layout as any).marks?.find((m: any) => m.kind === 'truck');
    if (tm) {
      this.truck.x = tm.x;
      this.truck.z = tm.z;
    }
    this.queen.x = w.layout.hive.x;
    this.queen.z = w.layout.hive.z;
    this.start0 = { truck: { x: this.truck.x, z: this.truck.z }, queen: { x: this.queen.x, z: this.queen.z } };
    w.events.on('boardTruck', () => this.start());
  }

  /** Roles by player count (GDD). */
  assignRoles(players: SimPlayer[]) {
    this.roles.clear();
    const ids = players.map((p) => p.id);
    const order: Role[][] = [[], ['driver'], ['driver', 'gunnerL'], ['driver', 'gunnerL', 'gunnerR'], ['driver', 'gunnerL', 'gunnerR', 'keeper']];
    const rs = order[Math.min(4, ids.length)];
    ids.forEach((id, k) => this.roles.set(id, rs[k] ?? 'gunnerR'));
  }
  /** With 3 players the driver is also the queen-keeper; solo the driver is everything. */
  isKeeper(id: string) {
    const r = this.roles.get(id);
    if (r === 'keeper') return true;
    return r === 'driver' && this.roles.size === 3; // GDD: with three, the driver is also the queen-keeper
  }

  start() {
    if (this.state !== 'waiting') return;
    const w = this.w;
    this.state = 'driving';
    this.startedAt = w.time;
    const riders = w.players.filter((p) => p.alive && !p.hive && !p.downed);
    this.assignRoles(riders);
    for (const p of riders) p.riding = true;
    if (w.run) w.run.finale = true;
    w.director.scripted = true; // the sunrise chase is exempt from the pacing loop
    w.director.act = 5;
    w.director.state = 'Sustain Peak';
    console.log(`[finale t=${w.time.toFixed(1)}] the truck starts digging for the surface; roles ${JSON.stringify([...this.roles])}`);
    w.events.emit('finaleStart', { roles: [...this.roles] });
  }

  seat(p: SimPlayer) {
    const r = this.roles.get(p.id) ?? 'gunnerR';
    const t = this.truck;
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), rx = -fz, rz = fx;
    const off = r === 'driver' ? [0.6, 0] : r === 'gunnerL' ? [-0.2, -0.9] : r === 'gunnerR' ? [-0.2, 0.9] : [-0.8, 0];
    return { x: t.x + fx * off[0] + rx * off[1], z: t.z + fz * off[0] + rz * off[1] };
  }

  /** Driver steers with WASD (world direction); keeper LMB = knock-aside, RMB = stun burst. */
  input(p: SimPlayer, use: boolean, alt: boolean) {
    if (this.state !== 'driving' || !this.isKeeper(p.id)) return;
    const q = this.queen;
    const t = this.truck;
    if (use && this.energy >= 0.5) {
      this.energy -= 0.5;
      // knock her aside: she careens left or right, buying room but stampeding alongside
      const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
      const side = (q.x - t.x) * -fz + (q.z - t.z) * fx > 0 ? 1 : -1;
      const nx = q.x + -fz * side * QBOSS.knockDist, nz = q.z + fx * side * QBOSS.knockDist;
      if (this.w.grid.isOpenAt(nx, nz)) (q.x = nx), (q.z = nz);
      q.stun = Math.max(q.stun, QBOSS.knockTime);
      this.w.events.emit('queenKnocked', { x: q.x, z: q.z });
    } else if (alt && this.energy >= 1) {
      this.energy = 0;
      q.stun = QBOSS.stunTime; // she stops briefly but comes back stronger
      q.speedMul *= 1.15;
      this.w.events.emit('queenStunned', { x: q.x, z: q.z });
    }
  }

  step(dt: number) {
    const w = this.w;
    if (this.state !== 'driving') return;
    const t = this.truck, q = this.queen, g = w.grid;
    const riders = w.players.filter((p) => p.riding && p.alive && !p.hive);
    const n = Math.max(1, riders.length);
    this.energy = Math.min(1, this.energy + QBOSS.chargeRate * dt);
    // ---- drive ----
    const driver = riders.find((p) => this.roles.get(p.id) === 'driver') ?? riders[0];
    let throttle = 0;
    if (driver) {
      const [mx, mz] = driver.hiveMove;
      if (Math.hypot(mx, mz) > 0.1) {
        const want = Math.atan2(mx, mz);
        let d = want - t.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        t.yaw += Math.max(-TRUCK.turnRate * dt, Math.min(TRUCK.turnRate * dt, d));
        throttle = Math.cos(d) > 0 ? 1 : 0.3;
      }
    }
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    // fast in open space, slow while digging
    const rx = -fz, rz = fx;
    const ahead = (r: number) => {
      let solid = false, rock = false;
      for (const a of [-TRUCK.radius, 0, TRUCK.radius]) {
        const c = g.cellAt(t.x + fx * r + rx * a, t.z + fz * r + rz * a);
        if (c < 0 || g.cells[c] === 2) rock = true;
        else if (g.cells[c] === 1) solid = true;
      }
      return { solid, rock };
    };
    const look = ahead(TRUCK.radius + 0.4);
    t.digging = look.solid;
    const sp = (look.solid ? TRUCK.digSpeed : TRUCK.openSpeed) * throttle;
    t.speed += (sp - t.speed) * Math.min(1, dt * 3);
    if (look.rock) t.speed = 0;
    const nx = t.x + fx * t.speed * dt, nz = t.z + fz * t.speed * dt;
    // the drill opens everything it touches (and these tunnels are the hive's too)
    if (w.authority) {
      const r = TRUCK.radius + 0.3;
      for (let dz = -r; dz <= r; dz += CELL)
        for (let dx = -r; dx <= r; dx += CELL) {
          if (dx * dx + dz * dz > r * r) continue;
          const c = g.cellAt(nx + dx, nz + dz);
          if (c >= 0 && g.cells[c] === 1) g.dig(c, w.time);
        }
    }
    if (!look.rock) {
      t.x = nx;
      t.z = nz;
    }
    for (const p of riders) {
      const s = this.seat(p);
      p.x = s.x;
      p.z = s.z;
      p.overwhelm = Math.min(p.overwhelm, 0.6);
    }
    // ---- the swarm tears at the wheels ----
    const sw = w.swarm;
    let onTruck = 0;
    sw.hash.forEachNear(t.x, t.z, TRUCK.radius + 0.6, (j) => {
      if (sw.alive[j] && !sw.layer[j] && sw.state[j] !== 4) onTruck++;
    });
    const aggression = n === 1 ? 0.5 : 0.6 + 0.1 * n; // fewer players: less aggressive
    t.hp -= onTruck * TRUCK.bugDamage * aggression * dt;
    // ---- the queen stampedes after you ----
    if (q.alive) {
      if (q.stun > 0) q.stun -= dt;
      else {
        const dx = t.x - q.x, dz = t.z - q.z, d = Math.hypot(dx, dz) || 1;
        const inEarth = !g.isOpenAt(q.x + (dx / d) * 1.5, q.z + (dz / d) * 1.5);
        const qs = (inEarth ? QBOSS.digSpeed : QBOSS.speed) * q.speedMul * aggression;
        q.x += (dx / d) * qs * dt;
        q.z += (dz / d) * qs * dt;
        if (d < QBOSS.reach) t.hp -= TRUCK.queenDamage * aggression * dt;
      }
      // gunners' fire on her drives her back a little
      for (const p of riders) if (p.firing && Math.hypot(p.x - q.x, p.z - q.z) < 6) {
        const d = Math.hypot(q.x - t.x, q.z - t.z) || 1;
        q.x += ((q.x - t.x) / d) * 1.5 * dt;
        q.z += ((q.z - t.z) / d) * 1.5 * dt;
      }
    }
    // ---- outcomes ----
    const zone = (w.layout as any).zone?.[g.cellAt(t.x, t.z)] ?? 0;
    if (zone === Z.house) this.win();
    else if (t.hp <= 0) {
      this.state = 'lost';
      w.death.fail('the truck was stopped');
      w.events.emit('truckStopped', {});
    }
  }

  /**
   * The bad ending (GDD): failing the finale makes the team part of the entity; they replay the
   * finale inside the swarm's mind until they complete it. Only the hollow ending is left.
   */
  replayInMind() {
    const w = this.w;
    this.mind = true;
    this.replays++;
    w.usedSave = true;
    w.runState = 'playing';
    w.failReason = '';
    this.truck = { x: this.start0.truck.x, z: this.start0.truck.z, yaw: -Math.PI / 2, hp: TRUCK.hp, speed: 0, digging: false };
    this.queen = { x: this.start0.queen.x, z: this.start0.queen.z, stun: 0, rage: 1, alive: true, speedMul: 1 };
    this.energy = 0;
    this.state = 'driving';
    for (const p of w.players) {
      if (!p.alive) continue;
      p.hive = false;
      p.downed = false;
      p.riding = true;
      p.overwhelm = 0.3;
    }
    this.assignRoles(w.players.filter((p) => p.alive));
    console.log(`[finale t=${w.time.toFixed(1)}] the team is part of the entity now. Replaying the finale inside the swarm's mind (#${this.replays})`);
    w.events.emit('mindReplay', { n: this.replays });
  }

  win() {
    const w = this.w;
    this.state = 'won';
    this.queen.alive = false; // she follows you out into the sunrise and dies in the light
    this.ending = w.usedSave ? 'hollow' : 'true';
    w.runState = 'won';
    // first light pours down the hole: the whole swarm burns
    for (let i = 0; i < w.swarm.count; i++) if (w.swarm.alive[i]) w.swarm.ignite(i);
    console.log(`[finale t=${w.time.toFixed(1)}] sunrise. The queen dies in the light. Ending: ${this.ending}`);
    w.events.emit('sunrise', { ending: this.ending });
  }

  applyState(s: any) {
    this.state = s.state;
    Object.assign(this.truck, s.truck);
    Object.assign(this.queen, s.queen);
    this.energy = s.energy;
    this.roles = new Map(s.roles);
    this.ending = s.ending;
    this.mind = !!s.mind;
  }
  get stateMsg() {
    return { state: this.state, truck: this.truck, queen: this.queen, energy: this.energy, roles: [...this.roles], ending: this.ending, mind: this.mind };
  }
}
