import { CAMP, FUEL, SWARM } from '../config';
import { LightSource, makeLight } from './light';
import { BURN } from './swarm';
import type { World, SimPlayer } from './world';

export type ItemKind =
  | 'flashlight'
  | 'flamethrower'
  | 'sprayer'
  | 'zapper'
  | 'generator'
  | 'lamp'
  | 'floodlight'
  | 'motion'
  | 'spool'
  | 'splitter'
  | 'flare'
  | 'walkie'
  | 'lightning';

export const ITEM_NAMES: Record<ItemKind, string> = {
  flashlight: 'Flashlight',
  flamethrower: 'Flamethrower',
  sprayer: 'Bug sprayer',
  zapper: 'Generator zapper',
  generator: 'Generator',
  lamp: 'Lamp',
  floodlight: 'Floodlight',
  motion: 'Motion lamp',
  spool: 'Wire spool',
  splitter: 'Wire splitter',
  flare: 'Flare',
  walkie: 'Walkie-talkie',
  lightning: 'Lightning gun',
};

export const PLACEABLE: ItemKind[] = ['generator', 'lamp', 'floodlight', 'motion', 'splitter'];

export interface Item {
  id: number;
  kind: ItemKind;
  battery?: number; // flashlight seconds left
  on?: boolean; // flashlight switch
}
export interface FloorItem {
  item: Item;
  x: number;
  z: number;
}
export type DeviceKind = 'generator' | 'lamp' | 'floodlight' | 'motion' | 'splitter';
export interface Device {
  id: number;
  kind: DeviceKind;
  item: Item;
  x: number;
  z: number;
  yaw: number;
  running: boolean; // generator only
  powered: boolean;
  motionActive: number; // seconds left on (motion lamp)
  light: LightSource | null;
}
export interface WirePoint {
  x: number;
  z: number;
}
export interface Wire {
  id: number;
  from: number | null; // device id (source side)
  to: number | null; // device id, or null while being laid / dangling
  points: WirePoint[];
  layer: string | null; // player laying it
  cuts: Set<number>; // cut segment indices (segment k = points[k] -> points[k+1])
  chew: Map<number, number>;
  live: boolean; // carries power
  version: number;
}
export interface Body {
  x: number;
  z: number;
}

const PORTS: Record<DeviceKind, { in: number; out: number }> = {
  generator: { in: 0, out: 2 },
  lamp: { in: 1, out: 1 },
  floodlight: { in: 1, out: 1 },
  motion: { in: 1, out: 1 },
  splitter: { in: 1, out: 2 },
};

let nextId = 1;
export const newItem = (kind: ItemKind): Item => ({
  id: nextId++,
  kind,
  ...(kind === 'flashlight' ? { battery: CAMP.flashlightBattery, on: true } : {}),
});

/**
 * The camp: shared fuel consumers, placed devices, wires and their power graph, floor items and
 * harvestable bodies. Player-facing operations are plain methods taking the player, so the M4
 * host can apply the same calls from network messages.
 */
export class Camp {
  floor: FloorItem[] = [];
  devices: Device[] = [];
  wires: Wire[] = [];
  bodies: Body[] = [];
  version = 0; // bumps on any structural change (render rebuild)
  private chewT = 0;
  oilYieldMul = 1; // director lever

  constructor(public w: World) {
    w.events.on('bugDeath', (e) => {
      if (e.layer) return;
      if (e.cause === 'zap' || e.cause === 'stomp' || e.cause === 'lightning' || e.cause === 'crush') this.bodies.push({ x: e.x, z: e.z });
    });
  }

  // ---------- items ----------
  drop(kind: ItemKind, x: number, z: number) {
    const item = newItem(kind);
    this.floor.push({ item, x, z });
    this.version++;
    return item;
  }
  held(p: SimPlayer): Item | null {
    if (p.carrying) return p.carrying;
    return p.slots[p.sel] ?? null;
  }
  freeSlot(p: SimPlayer) {
    if (p.carrying) return -1;
    if (!p.slots[p.sel]) return p.sel;
    return p.slots.findIndex((s) => !s);
  }
  allSlotsFree(p: SimPlayer) {
    return !p.carrying && p.slots.every((s) => !s);
  }
  give(p: SimPlayer, item: Item): boolean {
    const k = this.freeSlot(p);
    if (k < 0) return false;
    p.slots[k] = item;
    p.sel = k;
    return true;
  }
  pickUpFloor(p: SimPlayer, fi: FloorItem): boolean {
    if (fi.item.kind === 'generator') {
      if (!this.allSlotsFree(p)) return false;
      p.carrying = fi.item;
    } else if (!this.give(p, fi.item)) return false;
    this.floor.splice(this.floor.indexOf(fi), 1);
    this.version++;
    return true;
  }
  /** Q: drop the held item on the floor. */
  dropHeld(p: SimPlayer) {
    if (p.layingWire != null) {
      this.dropWireEnd(p);
      return;
    }
    const it = this.held(p);
    if (!it) return;
    if (p.carrying) p.carrying = null;
    else p.slots[p.sel] = null;
    this.floor.push({ item: it, x: p.x + Math.sin(p.yaw) * 0.6, z: p.z + Math.cos(p.yaw) * 0.6 });
    this.version++;
  }

  // ---------- devices ----------
  /** RMB with a placeable held: set it down in front, facing where you look. */
  place(p: SimPlayer): Device | null {
    const it = this.held(p);
    if (!it || !PLACEABLE.includes(it.kind)) return null;
    const d = 0.9;
    const x = p.x + Math.sin(p.yaw) * d, z = p.z + Math.cos(p.yaw) * d;
    if (!this.w.grid.isOpenAt(x, z)) return null;
    if (p.carrying) p.carrying = null;
    else p.slots[p.sel] = null;
    const dev: Device = { id: nextId++, kind: it.kind as DeviceKind, item: it, x, z, yaw: p.yaw, running: false, powered: false, motionActive: 0, light: null };
    if (dev.kind === 'lamp') dev.light = makeLight('lamp', { x, z, y: 1.1, radius: 5, intensity: 1, on: false, owner: 'dev' + dev.id });
    if (dev.kind === 'floodlight')
      dev.light = makeLight('floodlight', { x, z, y: 1.7, radius: 13, cone: (32 * Math.PI) / 180, intensity: 1.4, dirX: Math.sin(p.yaw), dirZ: Math.cos(p.yaw), on: false, owner: 'dev' + dev.id });
    if (dev.kind === 'motion') dev.light = makeLight('motion', { x, z, y: 1.0, radius: 4.5, intensity: 1, on: false, owner: 'dev' + dev.id });
    if (dev.kind === 'generator') {
      dev.running = true; // set down = started; E toggles
      dev.light = makeLight('lamp', { x, z, y: 0.6, radius: 2.2, intensity: 0.45, on: false, owner: 'dev' + dev.id });
    }
    this.devices.push(dev);
    this.version++;
    this.w.events.emit('devicePlaced', { id: dev.id, kind: dev.kind, x, z });
    return dev;
  }

  /** Pack up a device: lights go out, attached wires drop their end on the floor. */
  pickUpDevice(p: SimPlayer, dev: Device): boolean {
    if (dev.kind === 'generator') {
      if (!this.allSlotsFree(p)) return false;
      p.carrying = dev.item;
    } else if (!this.give(p, dev.item)) return false;
    for (const wr of this.wires) {
      if (wr.from === dev.id) wr.from = null;
      if (wr.to === dev.id) wr.to = null;
      wr.version++;
    }
    this.devices.splice(this.devices.indexOf(dev), 1);
    this.version++;
    this.w.events.emit('devicePacked', { id: dev.id, kind: dev.kind });
    return true;
  }

  toggleGenerator(dev: Device) {
    if (dev.kind !== 'generator') return;
    dev.running = !dev.running;
    this.w.events.emit(dev.running ? 'generatorOn' : 'generatorOff', { id: dev.id, x: dev.x, z: dev.z });
  }

  /** Aim a floodlight (RMB while looking at it). */
  aim(dev: Device, yaw: number) {
    dev.yaw = yaw;
    if (dev.light) {
      dev.light.dirX = Math.sin(yaw);
      dev.light.dirZ = Math.cos(yaw);
    }
  }

  // ---------- wires ----------
  portsUsed(dev: Device) {
    let i = 0, o = 0;
    for (const wr of this.wires) {
      if (wr.to === dev.id) i++;
      if (wr.from === dev.id) o++;
    }
    return { i, o };
  }
  canOutput(dev: Device) {
    return this.portsUsed(dev).o < PORTS[dev.kind].out;
  }
  canInput(dev: Device) {
    return this.portsUsed(dev).i < PORTS[dev.kind].in;
  }
  wireLength(wr: Wire, p?: SimPlayer) {
    let L = 0;
    for (let k = 1; k < wr.points.length; k++) L += Math.hypot(wr.points[k].x - wr.points[k - 1].x, wr.points[k].z - wr.points[k - 1].z);
    if (p && wr.points.length) {
      const last = wr.points[wr.points.length - 1];
      L += Math.hypot(p.x - last.x, p.z - last.z);
    }
    return L;
  }

  /** E on a source while holding a spool: cable starts paying out behind you. */
  startWire(p: SimPlayer, dev: Device): boolean {
    const it = this.held(p);
    if (!it || it.kind !== 'spool' || p.layingWire != null || !this.canOutput(dev)) return false;
    const wr: Wire = { id: nextId++, from: dev.id, to: null, points: [{ x: dev.x, z: dev.z }], layer: p.id, cuts: new Set(), chew: new Map(), live: false, version: 0 };
    this.wires.push(wr);
    p.layingWire = wr.id;
    this.version++;
    return true;
  }
  /** E on the next device: connect; it powers on if the chain is live. The spool is used up. */
  connectWire(p: SimPlayer, dev: Device): boolean {
    const wr = this.wires.find((x) => x.id === p.layingWire);
    if (!wr || !this.canInput(dev) || wr.from === dev.id) return false;
    wr.points.push({ x: dev.x, z: dev.z });
    wr.to = dev.id;
    wr.layer = null;
    wr.version++;
    p.layingWire = null;
    if (p.slots[p.sel]?.kind === 'spool') p.slots[p.sel] = null;
    this.version++;
    this.w.events.emit('wireConnected', { id: wr.id });
    return true;
  }
  /** Q while laying: leave the cable end on the floor (E on it later to carry on). */
  dropWireEnd(p: SimPlayer) {
    const wr = this.wires.find((x) => x.id === p.layingWire);
    if (!wr) return;
    wr.points.push({ x: p.x, z: p.z });
    wr.layer = null;
    p.layingWire = null;
    const k = p.slots.findIndex((s) => s?.kind === 'spool');
    if (k >= 0) p.slots[k] = null; // the spool stays on the cable end
    wr.version++;
    this.version++;
  }
  resumeWire(p: SimPlayer, wr: Wire): boolean {
    if (wr.to != null || wr.layer || p.layingWire != null) return false;
    const k = this.freeSlot(p);
    if (k < 0) return false;
    p.slots[k] = newItem('spool');
    p.sel = k;
    wr.layer = p.id;
    p.layingWire = wr.id;
    wr.version++;
    return true;
  }
  /** Wind the whole cable back onto a spool (packing up). */
  coilWire(p: SimPlayer, wr: Wire): boolean {
    if (wr.layer) return false;
    if (!this.give(p, newItem('spool'))) return false;
    this.wires.splice(this.wires.indexOf(wr), 1);
    this.version++;
    return true;
  }
  /** Left/right alternation winds cable in (and you can keep walking while you do it). */
  crank(p: SimPlayer, button: 'L' | 'R') {
    if (p.layingWire == null) return;
    if (p.lastCrank === button) return;
    p.lastCrank = button;
    const wr = this.wires.find((x) => x.id === p.layingWire);
    if (!wr || wr.points.length <= 1) return;
    let wound = 0;
    while (wound < CAMP.reelPerCrank && wr.points.length > 1) {
      const a = wr.points[wr.points.length - 1], b = wr.points[wr.points.length - 2];
      wound += Math.hypot(a.x - b.x, a.z - b.z);
      wr.points.pop();
      for (const c of [...wr.cuts]) if (c >= wr.points.length - 1) wr.cuts.delete(c);
    }
    wr.version++;
    this.w.events.emit('crank', { id: wr.id });
  }
  /** Called every frame for a player laying cable: pay out points and keep the tether. */
  payOut(p: SimPlayer) {
    const wr = this.wires.find((x) => x.id === p.layingWire);
    if (!wr) {
      p.layingWire = null;
      return;
    }
    const last = wr.points[wr.points.length - 1];
    const d = Math.hypot(p.x - last.x, p.z - last.z);
    const max = CAMP.spoolLength;
    const L = this.wireLength(wr, p);
    if (L > max) {
      // tether: pull the player back so the cable never exceeds the spool
      const over = L - max;
      const k = Math.max(0, (d - over) / Math.max(d, 1e-4));
      p.x = last.x + (p.x - last.x) * k;
      p.z = last.z + (p.z - last.z) * k;
      p.tethered = true;
    } else p.tethered = false;
    if (d >= CAMP.wirePointStep && this.wireLength(wr) + d <= max + 0.01) {
      wr.points.push({ x: p.x, z: p.z });
      wr.version++;
    }
  }

  nearestCut(p: SimPlayer): { wire: Wire; seg: number; d: number } | null {
    let best: { wire: Wire; seg: number; d: number } | null = null;
    for (const wr of this.wires)
      for (const s of wr.cuts) {
        const a = wr.points[s], b = wr.points[s + 1] ?? a;
        const d = Math.hypot((a.x + b.x) / 2 - p.x, (a.z + b.z) / 2 - p.z);
        if (d < CAMP.repairRadius && (!best || d < best.d)) best = { wire: wr, seg: s, d };
      }
    return best;
  }
  /** Hold R near a cut to repair it. */
  repair(p: SimPlayer, dt: number): boolean {
    const c = this.nearestCut(p);
    if (!c) {
      p.repairT = 0;
      return false;
    }
    p.repairT += dt;
    if (p.repairT >= CAMP.repairTime) {
      p.repairT = 0;
      c.wire.cuts.delete(c.seg);
      c.wire.chew.delete(c.seg);
      c.wire.version++;
      this.w.events.emit('wireRepaired', { id: c.wire.id, seg: c.seg });
      return true;
    }
    return false;
  }

  /** Recharge a held flashlight at a running generator (GDD: 3 fuel per full charge). */
  recharge(p: SimPlayer, dev: Device): boolean {
    const it = this.held(p);
    if (!it || it.kind !== 'flashlight' || dev.kind !== 'generator' || !dev.running) return false;
    const missing = CAMP.flashlightBattery - (it.battery ?? 0);
    if (missing <= 0.5) return false;
    const cost = (FUEL.flashlightRecharge * missing) / CAMP.flashlightBattery;
    if (!this.w.fuel.has(cost)) return false;
    this.w.fuel.drain(cost, 'flashlight', this.w.time);
    it.battery = CAMP.flashlightBattery;
    return true;
  }

  /** E on a body pile: +2 fuel per intact body (fire kills leave nothing). */
  collectBodies(p: SimPlayer): number {
    let n = 0;
    const r2 = CAMP.bodyRadius * CAMP.bodyRadius;
    this.bodies = this.bodies.filter((b) => {
      const take = (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < r2;
      if (take) n++;
      return !take;
    });
    if (n) {
      this.w.fuel.add(n * FUEL.oilPerBody * this.oilYieldMul, 'hiveOil');
      this.w.events.emit('harvest', { id: p.id, bodies: n, x: p.x, z: p.z });
    }
    return n;
  }

  // ---------- simulation ----------
  lights(out: LightSource[]) {
    for (const d of this.devices) if (d.light && d.light.on) out.push(d.light);
  }

  /** Power graph: from every running generator through uncut wires. */
  computePower() {
    const byId = new Map(this.devices.map((d) => [d.id, d]));
    for (const d of this.devices) d.powered = false;
    for (const wr of this.wires) wr.live = false;
    const q: Device[] = [];
    if (!this.w.fuel.out)
      for (const d of this.devices)
        if (d.kind === 'generator' && d.running) {
          d.powered = true;
          q.push(d);
        }
    while (q.length) {
      const d = q.pop()!;
      for (const wr of this.wires) {
        if (wr.cuts.size || wr.layer) {
          // a wire being laid is live up to the player's hand (but powers nothing yet)
          if (wr.layer && wr.from === d.id && !wr.cuts.size) wr.live = true;
          continue;
        }
        let other: number | null = null;
        if (wr.from === d.id) other = wr.to;
        else if (wr.to === d.id) other = wr.from;
        if (other == null) {
          if (wr.from === d.id || wr.to === d.id) wr.live = true; // dangling but energised
          continue;
        }
        wr.live = true;
        const o = byId.get(other);
        if (o && !o.powered) {
          o.powered = true;
          q.push(o);
        }
      }
    }
  }

  step(dt: number) {
    const w = this.w;
    this.computePower();
    const perMin = dt / 60;
    for (const d of this.devices) {
      if (d.kind === 'generator') {
        if (d.running) w.fuel.drain(FUEL.generatorPerMin * perMin, 'generator', w.time);
        if (d.light) d.light.on = d.running && !w.fuel.out;
        continue;
      }
      if (!d.light) continue;
      if (d.kind === 'motion') {
        if (d.powered && this.bugNear(d.x, d.z, CAMP.motionRange)) d.motionActive = 3;
        d.motionActive = Math.max(0, d.motionActive - dt);
        d.light.on = d.powered && d.motionActive > 0;
        if (d.powered) w.fuel.drain((d.light.on ? FUEL.lampPerMin : FUEL.motionLampIdlePerMin) * perMin, 'motion', w.time);
        continue;
      }
      d.light.on = d.powered;
      if (d.powered) w.fuel.drain((d.kind === 'lamp' ? FUEL.lampPerMin : d.kind === 'floodlight' ? FUEL.floodlightPerMin : 0) * perMin, d.kind, w.time);
    }
    for (const p of w.players) if (p.layingWire != null) this.payOut(p);
    this.chewT -= dt;
    if (this.chewT <= 0) {
      this.chew(0.1 - this.chewT);
      this.chewT = 0.1;
    }
  }

  bugNear(x: number, z: number, r: number) {
    const sw = this.w.swarm;
    let found = false;
    sw.hash.forEachNear(x, z, r, (j) => {
      if (sw.alive[j] && !sw.layer[j] && (sw.x[j] - x) ** 2 + (sw.z[j] - z) ** 2 < r * r) {
        found = true;
        return true;
      }
    });
    return found;
  }

  /** Bugs in the dark chew through cable (GDD: bugs cut wires; a cut kills everything downstream). */
  private chew(dt: number) {
    const w = this.w, sw = w.swarm;
    const r = CAMP.chewRadius, r2 = r * r;
    for (const wr of this.wires) {
      for (let k = 0; k < wr.points.length - 1; k++) {
        if (wr.cuts.has(k)) continue;
        const a = wr.points[k], b = wr.points[k + 1];
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        if (w.light.effAt(mx, mz) > SWARM.tolerance) continue; // they won't chew in the light
        // wire-cutters (the sabotage tendril) chew at full rate; any other bug only nibbles
        let chewers = 0;
        sw.hash.forEachNear(mx, mz, r + 0.3, (j) => {
          if (!sw.alive[j] || sw.layer[j] || sw.state[j] === BURN) return;
          if ((sw.x[j] - mx) ** 2 + (sw.z[j] - mz) ** 2 < r2 + 0.09) {
            const t = w.tendrils.get(sw.tendril[j]);
            chewers += !t || t.intent === 'sabotage' ? 1 : 0.15;
          }
        });
        if (!chewers) continue;
        const prog = (wr.chew.get(k) || 0) + (Math.min(chewers, 6) * dt) / CAMP.cutTime;
        if (prog >= 1) {
          wr.cuts.add(k);
          wr.chew.delete(k);
          wr.version++;
          w.events.emit('wireCut', { id: wr.id, seg: k, x: mx, z: mz });
        } else wr.chew.set(k, prog);
      }
    }
  }

  /** Points along live-or-not wires, for the queen's sabotage goals: the darkest uncut stretch. */
  darkestWirePoint(): { x: number; z: number } | null {
    let best: { x: number; z: number; l: number } | null = null;
    for (const wr of this.wires)
      for (let k = 0; k < wr.points.length - 1; k++) {
        if (wr.cuts.has(k)) continue;
        const a = wr.points[k], b = wr.points[k + 1];
        const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
        const l = this.w.light.rawAt(x, z);
        if (!best || l < best.l) best = { x, z, l };
      }
    return best;
  }
}
