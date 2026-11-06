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
}

export interface WorldOptions {
  seed?: number;
  useWorker?: boolean;
  bugs?: number;
  layout?: WorldLayout;
  /** disable the queen (tests drive tendrils by hand) */
  noQueen?: boolean;
}

/** Owns every simulation system and steps them in order. No rendering in here. */
export class World {
  seed: number;
  layout: WorldLayout;
  grid: Grid;
  light: LightMap;
  vis: Visibility;
  fields: FieldManager;
  swarm: Swarm;
  fire: Fire;
  queen: Queen | null;
  events = new Events();
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

  constructor(opts: WorldOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.rng = new Rng(this.seed * 31 + 7);
    this.layout = opts.layout ?? generateWorld(this.seed);
    this.grid = this.layout.grid;
    this.light = new LightMap(this.grid);
    this.vis = new Visibility(this.grid);
    this.fields = new FieldManager(this.grid, this.light, opts.useWorker ?? false);
    this.swarm = new Swarm(this.grid, SWARM.maxBugs, this.seed);
    this.fire = new Fire();
    this.queen = opts.noQueen ? null : new Queen(this);
    this.targetBugs = opts.bugs ?? SWARM.defaultBugs;
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
    if (this.targetBugs < 0) return; // unmanaged (tests place bugs by hand)
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

  step(dt: number) {
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
      players: this.players.map((p) => ({ x: p.x, z: p.z, alive: p.alive && !p.downed })),
      time: this.time,
      events: this.events,
      breachAllowed: this.breachAllowed,
    });
    this.timings.swarm = T(t);
    t = now();
    this.fire.step(dt, this);
    this.timings.fire = T(t);
    this.stepPlayers(dt);
    this.timings.total = T(t0);
  }

  stepPlayers(dt: number) {
    const sw = this.swarm;
    for (const p of this.players) {
      if (p.firing) p.lastFired = this.time;
      if (!p.alive) continue;
      if (p.downed) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          // M1 stand-in for carrying/revive: respawn at the start after a few seconds
          p.downed = false;
          p.overwhelm = 0;
          p.x = this.layout.start.x;
          p.z = this.layout.start.z;
          this.events.emit('respawn', { id: p.id });
        }
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
        p.downTimer = OVERWHELM.respawnDelay;
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
