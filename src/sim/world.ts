import { CELL, SWARM, OVERWHELM, VIS, FIRE } from '../config';
import { Events } from '../core/events';
import { Rng } from '../core/rng';
import { Grid, OPEN } from './grid';
import { LightMap, LightSource, makeLight } from './light';
import { Visibility } from './visibility';
import { FieldManager } from './fieldManager';
import { Swarm, BURN } from './swarm';
import { Fire } from './fire';
import { Tendril } from './tendril';
import { Queen } from './queen';
import { generateWorld, WorldLayout } from './worldgen';
import { Fuel } from './fuel';
import { Camp, Item } from './camp';
import { Learning } from './learning';
import { Director } from './director';
import { Death, HIVE_INTENT } from './death';
import { generateNight, NightLayout } from './night';
import { Run } from './run';
import { Finale } from './finale';

export interface SimPlayer {
  id: string;
  x: number;
  z: number;
  yaw: number; // forward = (sin yaw, cos yaw)
  pitch: number;
  alive: boolean;
  downed: boolean;
  downTimer: number;
  overwhelm: number;
  touching: number;
  firing: boolean;
  lastFired: number;
  crouch: boolean;
  flashlight: LightSource;
  fireLight: LightSource;
  // inventory (GDD: 3 slots; the generator is two-handed)
  slots: (Item | null)[];
  sel: number;
  carrying: Item | null;
  layingWire: number | null;
  lastCrank: 'L' | 'R' | null;
  tethered: boolean;
  repairT: number;
  liftT: number;
  pendingToggle: number | null;
  zapT: number;
  stompT: number;
  spraying: boolean;
  aim: [number, number, number];
  eye: [number, number, number];
  // death and the hive (M4)
  carriedT: number; // seconds being carried toward the queen
  reviveT: number; // seconds a teammate has been reviving them
  hive: boolean; // devoured: playing as the hive
  will: number; // hive player's will (resisting orders drains it)
  ritual: number; // respawn ritual progress 0..1 (electrocution)
  hiveX: number; // hive player's group centre
  hiveZ: number;
  connected: boolean;
  hiveMove: [number, number]; // hive player's desired direction (world x/z)
  ritualStage: number; // 0 gathering, 1 body formed, 2 in the light (electrocute it!)
  order: string; // the queen's current order to a hive player
  walkieTalking: boolean; // holding V with a walkie-talkie
  loudAt: number; // last time their mic was loud (voice as noise)
  peerId: string; // WebRTC peer id (voice calls)
  suit: boolean; // wearing an Enlite suit (faster, bigger flame, can dig)
  riding: boolean; // in the digging truck (finale)
  hose?: boolean; // garden hose taped on: longer, weaker flame
  god?: boolean; // debug god mode: never overwhelmed
  shockedAt?: number; // last time their ritual body was electrocuted
  digT: number;
}

export type RunState = 'playing' | 'failed' | 'won';

export type Role = 'solo' | 'host' | 'client';

export interface WorldOptions {
  seed?: number;
  useWorker?: boolean;
  bugs?: number;
  layout?: WorldLayout;
  /** disable the queen (tests drive tendrils by hand) */
  noQueen?: boolean;
  /** solo / host run everything; a client only runs bug bodies, light and fields locally */
  role?: Role;
  /** the full night (M5): house, base, nest, junkyard, queen */
  night?: boolean;
}

/** Owns every simulation system and steps them in order. No rendering in here. */
export class World {
  seed: number;
  role: Role;
  paused = false;
  runState: RunState = 'playing';
  usedSave = false; // continued from a save/checkpoint: only the bad ending is reachable
  failReason = '';
  layout: WorldLayout;
  grid: Grid;
  light: LightMap;
  vis: Visibility;
  fields: FieldManager;
  swarm: Swarm;
  fire: Fire;
  queen: Queen | null;
  events = new Events();
  fuel: Fuel;
  camp: Camp;
  learning: Learning;
  director: Director;
  death: Death;
  run: Run | null = null;
  finale: Finale | null = null;
  debugBreaches = true; // debug panel switch
  voiceNoise = true; // GDD: loud talking registers on the queen's opportunity map (on by default)
  tendrils = new Map<number, Tendril>();
  players: SimPlayer[] = [];
  staticLights: LightSource[] = [];
  burnLights: LightSource[] = [];
  time = 0;
  targetBugs: number;
  breachAllowed = true;
  private visTimer = 0;
  rng: Rng;
  timings = { light: 0, vis: 0, queen: 0, fields: 0, swarm: 0, fire: 0, total: 0 };
  /** Audit of every breach: was the spot dark and unseen when it opened? (gate check) */
  breachLog: { t: number; kind: string; cell: number; seen: boolean; raw: number }[] = [];
  digCount = 0;

  constructor(opts: WorldOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.role = opts.role ?? 'solo';
    this.rng = new Rng(this.seed * 31 + 7);
    this.layout = opts.layout ?? (opts.night ? generateNight(this.seed) : generateWorld(this.seed));
    this.grid = this.layout.grid;
    this.light = new LightMap(this.grid);
    this.vis = new Visibility(this.grid);
    this.fields = new FieldManager(this.grid, this.light, opts.useWorker ?? false);
    this.swarm = new Swarm(this.grid, SWARM.maxBugs, this.seed);
    this.fire = new Fire();
    this.fuel = new Fuel(this.events);
    this.camp = new Camp(this);
    this.learning = new Learning(this);
    this.director = new Director(this);
    this.death = new Death(this);
    if (opts.night) {
      this.run = new Run(this, this.layout as NightLayout);
      this.finale = new Finale(this);
    }
    this.queen = opts.noQueen || this.role === 'client' ? null : new Queen(this);
    this.targetBugs = opts.bugs ?? SWARM.defaultBugs;
    this.events.on('breach', (e) =>
      this.breachLog.push({ t: this.time, kind: e.kind, cell: e.cell, seen: this.vis.isSeen(e.cell), raw: this.light.surfaceRaw(e.cell) }),
    );
    this.events.on('dig', () => this.digCount++);
    for (let k = 0; k < 96; k++) this.burnLights.push(makeLight('burn', { radius: 1.8, intensity: 0.9, on: false, y: 0.3 }));
  }

  addPlayer(id: string, x: number, z: number): SimPlayer {
    const p: SimPlayer = {
      id,
      x,
      z,
      yaw: 0,
      pitch: 0,
      alive: true,
      downed: false,
      downTimer: 0,
      overwhelm: 0,
      touching: 0,
      firing: false,
      lastFired: -100,
      crouch: false,
      flashlight: makeLight('flashlight', { radius: 15, cone: (24 * Math.PI) / 180, intensity: 1.25, y: 1.4, owner: id }),
      fireLight: makeLight('fire', { radius: FIRE.lightRadius, cone: (55 * Math.PI) / 180, intensity: 1.6, on: false, y: 1.2, owner: id }),
      slots: [null, null, null],
      sel: 0,
      carrying: null,
      layingWire: null,
      lastCrank: null,
      tethered: false,
      repairT: 0,
      liftT: 0,
      pendingToggle: null,
      zapT: -10,
      stompT: -10,
      spraying: false,
      aim: [0, 0, 1],
      eye: [x, 1.6, z],
      carriedT: 0,
      reviveT: 0,
      hive: false,
      will: 1,
      ritual: 0,
      hiveX: x,
      hiveZ: z,
      connected: true,
      hiveMove: [0, 0],
      ritualStage: 0,
      order: '',
      walkieTalking: false,
      loudAt: -100,
      peerId: '',
      suit: false,
      riding: false,
      digT: 0,
    };
    this.players.push(p);
    return p;
  }

  allLights(): LightSource[] {
    const out: LightSource[] = [];
    for (const p of this.players) {
      if (!p.alive) continue;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      // flashlight starts slightly in front of the body so the cell behind the player stays dark
      p.flashlight.x = p.x + fx * 0.15;
      p.flashlight.z = p.z + fz * 0.15;
      p.flashlight.dirX = fx;
      p.flashlight.dirZ = fz;
      p.fireLight.x = p.x + fx * 0.3;
      p.fireLight.z = p.z + fz * 0.3;
      p.fireLight.dirX = fx;
      p.fireLight.dirZ = fz;
      p.fireLight.on = p.firing;
      out.push(p.flashlight, p.fireLight);
    }
    for (const l of this.staticLights) out.push(l);
    this.camp.lights(out);
    // burning bugs are fire too (they light up and repel their neighbours)
    const sw = this.swarm;
    let k = 0;
    for (let i = 0; i < sw.count && k < this.burnLights.length; i++) {
      if (sw.alive[i] && sw.state[i] === BURN) {
        const l = this.burnLights[k++];
        l.x = sw.x[i];
        l.z = sw.z[i];
        l.on = true;
        out.push(l);
      }
    }
    for (; k < this.burnLights.length; k++) this.burnLights[k].on = false;
    return out;
  }

  /** Keep the live bug count at the slider value: spawn in the hive, despawn the furthest. */
  balancePopulation() {
    if (this.targetBugs < 0 || this.role === 'client') return; // unmanaged (tests place bugs by hand; clients mirror the host)
    const sw = this.swarm;
    const cells = this.layout.hiveCells;
    let spawned = 0;
    while (sw.active < this.targetBugs && spawned < 60 && cells.length) {
      const c = cells[this.rng.int(cells.length)];
      sw.spawn(this.grid.centerX(c) + (this.rng.next() - 0.5) * CELL, this.grid.centerZ(c) + (this.rng.next() - 0.5) * CELL);
      spawned++;
    }
    let extra = sw.active - this.targetBugs;
    for (let i = sw.count - 1; i >= 0 && extra > 0; i--) {
      if (sw.alive[i]) {
        sw.kill(i, 'despawn');
        extra--;
      }
    }
  }

  get authority() {
    return this.role !== 'client';
  }

  step(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 1 / 20);
    const T = (a: number) => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - a;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t0 = now();
    this.time += dt;
    this.balancePopulation();
    let t = now();
    this.light.rebuild(this.allLights());
    this.timings.light = T(t);
    t = now();
    this.visTimer -= dt;
    if (this.visTimer <= 0) {
      this.visTimer = VIS.interval;
      this.vis.update(this.players.filter((p) => p.alive && !p.downed));
    }
    this.timings.vis = T(t);
    t = now();
    if (this.queen) {
      this.director.step(dt);
      this.learning.step(dt);
    }
    this.queen?.update(dt);
    for (const tr of this.tendrils.values()) tr.field = this.fields.get(tr.fieldName, tr.goals, tr.params, this.time);
    this.timings.queen = T(t);
    t = now();
    this.fields.update(this.time);
    this.timings.fields = T(t);
    t = now();
    this.swarm.step(dt, {
      grid: this.grid,
      light: this.light,
      vis: this.vis,
      tendrils: this.tendrils,
      // (LOD counts downed players too: their carriers need full-rate steering)
      players: this.players.map((p) => ({ x: p.hive ? p.hiveX : p.x, z: p.hive ? p.hiveZ : p.z, alive: p.alive })),
      time: this.time,
      events: this.events,
      breachAllowed: this.breachAllowed && this.debugBreaches && this.authority,
      onTouch: (i, k) => this.learning.touch(i, k),
    });
    this.timings.swarm = T(t);
    t = now();
    // flames are emitted on every machine from each player's synced aim
    for (const p of this.players) {
      if (!p.firing || !p.alive || p.downed || p.hive) continue;
      const [ax, ay, az] = p.aim, [ex, ey, ez] = p.eye;
      // suits: larger flame; a taped-on garden hose reaches further but sprays thinner
      this.fire.emit(ex + ax * 0.5, ey - 0.35, ez + az * 0.5, ax, ay, az, p.hose ? dt * 0.55 : dt, (p.suit ? 1.4 : 1) * (p.hose ? 1.35 : 1));
    }
    this.fire.step(dt, this);
    this.timings.fire = T(t);
    if (this.authority) {
      this.run?.step(dt);
      this.finale?.step(dt);
      this.camp.step(dt);
      this.stepPlayers(dt);
      this.death.step(dt);
    }
    this.timings.total = T(t0);
  }

  stepPlayers(dt: number) {
    const sw = this.swarm;
    for (const p of this.players) {
      if (p.firing) p.lastFired = this.time;
      if (!p.alive) continue;
      if (p.downed || p.hive) {
        p.flashlight.on = false;
        continue; // carrying, reviving and the hive are handled by Death
      }
      if (p.god) {
        p.overwhelm = 0;
        continue;
      }
      let touching = 0;
      const r = SWARM.touchDist, r2 = r * r;
      sw.hash.forEachNear(p.x, p.z, r, (j) => {
        if (!sw.alive[j] || sw.layer[j] || sw.state[j] === BURN) return;
        const dx = sw.x[j] - p.x, dz = sw.z[j] - p.z;
        if (dx * dx + dz * dz < r2) touching++;
      });
      p.touching = touching;
      if (touching > 0) p.overwhelm += touching * OVERWHELM.perBugPerSec * dt;
      else p.overwhelm = Math.max(0, p.overwhelm - OVERWHELM.decayPerSec * dt);
      if (p.overwhelm >= 1) {
        p.overwhelm = 1;
        p.downed = true;
        p.carriedT = 0;
        p.reviveT = 0;
        this.events.emit('downed', { id: p.id, x: p.x, z: p.z });
      }
    }
  }

  /** Goal nodes for a world point: its cell plus open neighbours (robust to standing on an edge). */
  goalCellsAt(x: number, z: number, r = 1): number[] {
    const g = this.grid;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const out: number[] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.get(cx + dx, cz + dz) === OPEN) out.push(g.idx(cx + dx, cz + dz));
    return out;
  }
}
