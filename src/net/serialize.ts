// World state <-> plain messages. The host is authoritative for terrain, camp, fuel, players'
// inventories and health, and the queen's tendrils; clients mirror it.
import type { World, SimPlayer } from '../sim/world';
import type { Device, Item, Wire } from '../sim/camp';
import { makeTendril, Tendril } from '../sim/tendril';
import { defaultParams } from '../sim/fieldManager';

const b64 = (a: ArrayBufferView) => {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

// ---------- camp ----------
export function campState(w: World) {
  const c = w.camp;
  return {
    v: c.version,
    floor: c.floor.map((f) => ({ item: f.item, x: f.x, z: f.z })),
    devices: c.devices.map((d) => ({ id: d.id, kind: d.kind, item: d.item, x: d.x, z: d.z, yaw: d.yaw, running: d.running, powered: d.powered, on: !!d.light?.on, hp: d.hp, broken: d.broken })),
    wires: c.wires.map((wr) => ({ id: wr.id, from: wr.from, to: wr.to, points: wr.points, layer: wr.layer, cuts: [...wr.cuts], chew: [...wr.chew.entries()], live: wr.live })),
    bodies: c.bodies,
    oil: c.oilYieldMul,
  };
}

export function applyCamp(w: World, s: ReturnType<typeof campState>) {
  const c = w.camp;
  c.floor = s.floor.map((f) => ({ item: f.item as Item, x: f.x, z: f.z }));
  const old = new Map(c.devices.map((d) => [d.id, d]));
  c.devices = s.devices.map((d) => {
    let dev: Device | undefined = old.get(d.id);
    if (!dev || dev.kind !== d.kind) dev = c.createDevice(d.kind as any, d.item as Item, d.x, d.z, d.yaw, d.id);
    dev.x = d.x;
    dev.z = d.z;
    c.aim(dev, d.yaw);
    dev.running = d.running;
    dev.powered = d.powered;
    dev.hp = d.hp;
    dev.broken = d.broken;
    if (dev.light) dev.light.on = d.on;
    return dev;
  });
  const oldW = new Map(c.wires.map((x) => [x.id, x]));
  c.wires = s.wires.map((x) => {
    const wr: Wire = oldW.get(x.id) ?? ({ id: x.id, version: 0 } as Wire);
    const changed = !oldW.has(x.id) || wr.points?.length !== x.points.length || (wr.cuts?.size ?? 0) !== x.cuts.length || wr.live !== x.live || wr.layer !== x.layer;
    wr.from = x.from;
    wr.to = x.to;
    wr.points = x.points;
    wr.layer = x.layer;
    wr.cuts = new Set(x.cuts);
    wr.chew = new Map(x.chew as [number, number][]);
    wr.live = x.live;
    if (changed || wr.layer) wr.version++;
    return wr;
  });
  c.bodies = s.bodies;
  c.oilYieldMul = s.oil;
  if (s.v !== (c as any)._remoteV) {
    (c as any)._remoteV = s.v;
    c.version++;
  }
}

// ---------- players ----------
const PKEYS = ['x', 'z', 'yaw', 'pitch', 'alive', 'downed', 'downTimer', 'overwhelm', 'touching', 'firing', 'lastFired', 'crouch', 'slots', 'sel', 'carrying', 'layingWire', 'tethered', 'repairT', 'aim', 'eye', 'carriedT', 'reviveT', 'hive', 'will', 'ritual', 'hiveX', 'hiveZ', 'connected', 'ritualStage', 'order', 'reviveT', 'walkieTalking', 'loudAt', 'peerId', 'suit', 'riding'] as const;
export function playerState(p: SimPlayer) {
  const o: any = { id: p.id, fl: [p.flashlight.on, p.flashlight.intensity] };
  for (const k of PKEYS) o[k] = (p as any)[k];
  return o;
}
/** `poseFromSelf`: keep our own position/look (each player owns their movement). */
export function applyPlayer(w: World, s: any, poseFromSelf: boolean) {
  let p = w.players.find((q) => q.id === s.id);
  if (!p) p = w.addPlayer(s.id, s.x, s.z);
  for (const k of PKEYS) {
    if (poseFromSelf && (k === 'x' || k === 'z' || k === 'yaw' || k === 'pitch' || k === 'crouch' || k === 'aim' || k === 'eye')) continue;
    (p as any)[k] = s[k];
  }
  p.flashlight.on = s.fl[0];
  p.flashlight.intensity = s.fl[1];
  return p;
}

// ---------- tendrils ----------
export function tendrilState(t: Tendril) {
  return {
    id: t.id,
    intent: t.intent,
    mode: t.mode,
    fieldName: t.fieldName,
    goals: t.goals,
    gx: t.gx,
    gz: t.gz,
    params: t.params,
    size: t.size,
    members: t.members,
    speedMul: t.speedMul,
    braveness: t.braveness,
    holdDist: t.holdDist,
    sepMul: t.sepMul,
    aliMul: t.aliMul,
    probeAmp: t.probeAmp,
    attackDevice: t.attackDevice,
  };
}
export function applyTendrils(w: World, list: ReturnType<typeof tendrilState>[]) {
  const keep = new Set<number>();
  for (const s of list) {
    keep.add(s.id);
    let t = w.tendrils.get(s.id);
    if (!t) {
      t = makeTendril({ params: defaultParams() });
      t.id = s.id;
      w.tendrils.set(s.id, t);
    }
    Object.assign(t, s);
  }
  for (const id of [...w.tendrils.keys()]) if (!keep.has(id)) w.tendrils.delete(id);
}

// ---------- swarm keyframes (quantised) ----------
const Q = 64; // 1/64 m
export function swarmKeyframe(w: World, from: number, to: number) {
  const sw = w.swarm;
  to = Math.min(to, sw.count);
  const n = Math.max(0, to - from);
  const pos = new Int16Array(n * 2);
  const vel = new Int8Array(n * 2);
  const meta = new Uint8Array(n * 2); // alive|layer<<1|state<<2 , y quantised
  const tend = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    const i = from + k;
    pos[k * 2] = Math.round(sw.x[i] * Q);
    pos[k * 2 + 1] = Math.round(sw.z[i] * Q);
    vel[k * 2] = Math.max(-127, Math.min(127, Math.round(sw.vx[i] * 20)));
    vel[k * 2 + 1] = Math.max(-127, Math.min(127, Math.round(sw.vz[i] * 20)));
    meta[k * 2] = (sw.alive[i] ? 1 : 0) | (sw.layer[i] << 1) | (sw.state[i] << 2);
    meta[k * 2 + 1] = Math.max(0, Math.min(255, Math.round((sw.y[i] + 1) * 60)));
    tend[k] = sw.tendril[i];
  }
  return { from, count: sw.count, pos: b64(pos), vel: b64(vel), meta: b64(meta), tend: b64(tend) };
}

export interface SyncStats {
  frames: number;
  lastMeanErr: number;
  lastMaxErr: number;
  maxMeanErr: number;
  snaps: number;
  spawned: number;
  killed: number;
}

/** Blend the local swarm toward the host's keyframe; returns the position error before correcting. */
export function applyKeyframe(w: World, k: ReturnType<typeof swarmKeyframe>, stats: SyncStats) {
  const sw = w.swarm;
  const pos = new Int16Array(unb64(k.pos).buffer);
  const vel = new Int8Array(unb64(k.vel).buffer);
  const meta = unb64(k.meta);
  const tend = new Int32Array(unb64(k.tend).buffer);
  const n = tend.length;
  sw.ensureCount(k.count);
  let err = 0, maxErr = 0, cmp = 0;
  for (let j = 0; j < n; j++) {
    const i = k.from + j;
    const alive = meta[j * 2] & 1;
    const layer = (meta[j * 2] >> 1) & 1;
    const state = meta[j * 2] >> 2;
    const x = pos[j * 2] / Q, z = pos[j * 2 + 1] / Q;
    if (!alive) {
      if (sw.alive[i]) {
        sw.kill(i, 'sync');
        stats.killed++;
      }
      continue;
    }
    if (!sw.alive[i]) {
      sw.setAlive(i, x, z, layer);
      stats.spawned++;
    } else {
      const ex = x - sw.x[i], ez = z - sw.z[i];
      const e = Math.sqrt(ex * ex + ez * ez);
      err += e;
      cmp++;
      if (e > maxErr) maxErr = e;
      if (e > 1.5 || layer !== sw.layer[i]) {
        sw.x[i] = x;
        sw.z[i] = z;
        stats.snaps++;
      } else {
        // soft correction: most of the way now, the rest is the local sim's job
        sw.x[i] += ex * 0.7;
        sw.z[i] += ez * 0.7;
      }
    }
    sw.vx[i] = vel[j * 2] / 20;
    sw.vz[i] = vel[j * 2 + 1] / 20;
    sw.layer[i] = layer;
    if (sw.state[i] !== 4 || state === 4) sw.state[i] = state;
    sw.y[i] = meta[j * 2 + 1] / 60 - 1;
    sw.tendril[i] = tend[j];
  }
  stats.frames++;
  stats.lastMeanErr = cmp ? err / cmp : 0;
  stats.lastMaxErr = maxErr;
  if (stats.frames > 5) stats.maxMeanErr = Math.max(stats.maxMeanErr, stats.lastMeanErr);
}

// ---------- terrain ----------
/** Every cell that differs from the freshly generated layout (dug or refilled). */
export function gridDiff(w: World, pristine: Uint8Array) {
  const g = w.grid;
  const out: [number, number, number][] = [];
  for (let i = 0; i < g.n; i++) if (g.cells[i] !== pristine[i]) out.push([i, g.cells[i], g.dugAt[i]]);
  return { cells: out, burrow: b64(g.burrow) };
}
export function applyGridDiff(w: World, d: ReturnType<typeof gridDiff>) {
  for (const [i, v, t] of d.cells) w.grid.applyRemote(i, v, t);
  w.grid.burrow.set(unb64(d.burrow));
}

export function fullSnapshot(w: World, pristine: Uint8Array) {
  return {
    seed: w.seed,
    time: w.time,
    targetBugs: w.targetBugs,
    act: w.director.act,
    grid: gridDiff(w, pristine),
    camp: campState(w),
    players: w.players.map(playerState),
    tendrils: [...w.tendrils.values()].map(tendrilState),
    swarm: swarmKeyframe(w, 0, w.swarm.count),
    fuel: w.fuel.value,
    fuelOut: w.fuel.out,
    belief: w.light.belief,
    breach: w.breachAllowed,
    paused: w.paused,
    night: !!w.run,
    run: runState(w),
  };
}

export function runState(w: World) {
  const r = w.run;
  if (!r) return null;
  return { act: r.act, powerOn: r.powerOn, plugOpen: r.plugOpen, used: [...r.used], eggs: r.eggs.map((e) => e.hp), rage: r.rage, finale: r.finale, jobKills: r.jobKills, radio: r.radio.slice(-3), checkpoints: r.checkpoints, truck: w.finale?.stateMsg ?? null };
}
export function applyRunState(w: World, s: ReturnType<typeof runState>) {
  const r = w.run;
  if (!r || !s) return;
  r.act = s.act;
  w.director.act = s.act;
  if (r.powerOn !== s.powerOn) for (const l of r.houseLights) l.on = s.powerOn;
  r.powerOn = s.powerOn;
  r.plugOpen = s.plugOpen;
  r.used = new Set(s.used);
  s.eggs.forEach((hp, i) => r.eggs[i] && (r.eggs[i].hp = hp));
  r.rage = s.rage;
  r.finale = s.finale;
  r.jobKills = s.jobKills;
  r.checkpoints = s.checkpoints;
  for (const m of s.radio) if (!r.radio.some((x) => x.text === m.text && x.t === m.t)) r.radio.push(m);
  if (s.truck && w.finale) w.finale.applyState(s.truck);
}
