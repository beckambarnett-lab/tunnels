import { CAMP, FUEL, CELL } from '../config';
import { ITEM_NAMES, PLACEABLE, Device, FloorItem, Wire, Item } from './camp';
import type { World, SimPlayer } from './world';

/** One frame of a player's intent. Built from local input, or received from a client (M4). */
export interface PlayerInput {
  use: boolean; // LMB held
  usePressed: boolean;
  alt: boolean; // RMB held
  altPressed: boolean;
  interact: boolean; // E held
  interactPressed: boolean;
  drop: boolean; // Q pressed
  repair: boolean; // R held
  stomp: boolean; // Space pressed
  dig?: boolean; // X held (Enlite suit)
  slot: number; // -1 none, else 0..2
  scroll: number;
  aim: [number, number, number]; // look direction
  eye: [number, number, number];
}

export const emptyInput = (): PlayerInput => ({
  use: false,
  usePressed: false,
  alt: false,
  altPressed: false,
  interact: false,
  interactPressed: false,
  drop: false,
  repair: false,
  stomp: false,
  slot: -1,
  scroll: 0,
  aim: [0, 0, 1],
  eye: [0, 1.6, 0],
});

export type Target =
  | { kind: 'device'; dev: Device; d: number }
  | { kind: 'floor'; fi: FloorItem; d: number }
  | { kind: 'wire'; wire: Wire; d: number; end: boolean }
  | { kind: 'bodies'; n: number; d: number }
  | { kind: 'player'; p: SimPlayer; d: number }
  | { kind: 'mark'; m: any; d: number };

/** What E would act on: the nearest interactable roughly in front of the player. */
export function findTarget(w: World, p: SimPlayer): Target | null {
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const R = CAMP.interactRange;
  let best: Target | null = null;
  const consider = (x: number, z: number, make: (d: number) => Target, bias = 0) => {
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > R) return;
    const facing = d < 0.5 ? 1 : (dx * fx + dz * fz) / d;
    if (facing < 0.35) return;
    const score = d - facing * 0.6 + bias;
    if (!best || score < (best as any)._s) {
      best = make(d);
      (best as any)._s = score;
    }
  };
  for (const dev of w.camp.devices) consider(dev.x, dev.z, (d) => ({ kind: 'device', dev, d }));
  for (const q of w.players) if (q !== p && q.alive && q.downed && !q.hive) consider(q.x, q.z, (d) => ({ kind: 'player', p: q, d }), -0.5);
  const mk = w.run?.markInReach(p);
  if (mk) consider(mk.x, mk.z, (d) => ({ kind: 'mark', m: mk, d }), -0.4);
  for (const fi of w.camp.floor) consider(fi.x, fi.z, (d) => ({ kind: 'floor', fi, d }), -0.1);
  for (const wr of w.camp.wires) {
    if (wr.layer) continue;
    // a dangling end can be resumed; any point can be coiled
    const end = wr.points[wr.points.length - 1];
    if (wr.to == null) consider(end.x, end.z, (d) => ({ kind: 'wire', wire: wr, d, end: true }), -0.05);
    for (let k = 1; k < wr.points.length - 1; k += 2) consider(wr.points[k].x, wr.points[k].z, (d) => ({ kind: 'wire', wire: wr, d, end: false }), 0.5);
  }
  let bodies = 0, bd = 9;
  for (const b of w.camp.bodies) {
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d < CAMP.bodyRadius) bodies++, (bd = Math.min(bd, d));
  }
  if (bodies) consider(p.x + fx * bd * 0.5, p.z + fz * bd * 0.5, (d) => ({ kind: 'bodies', n: bodies, d }), -0.3);
  return best;
}

/** The HUD prompt for what E (and RMB) would do right now. */
export function promptFor(w: World, p: SimPlayer, t: Target | null): string {
  const c = w.camp;
  const held = c.held(p);
  const lines: string[] = [];
  if (p.layingWire != null) lines.push('Laying cable — E on a device to connect, alternate LMB/RMB to reel in, Q to drop the end');
  if (held && PLACEABLE.includes(held.kind)) lines.push(`RMB: place ${ITEM_NAMES[held.kind]}`);
  const br = c.nearestBroken(p);
  if (br) lines.push(`Hold R: repair the ${ITEM_NAMES[br.kind]}${p.repairT > 0 ? ` (${Math.round((p.repairT / (CAMP.repairTime * 1.5)) * 100)}%)` : ''}`);
  const cut = c.nearestCut(p);
  if (cut) lines.push(`Hold R: repair cut cable${p.repairT > 0 ? ` (${Math.round((p.repairT / CAMP.repairTime) * 100)}%)` : ''}`);
  if (t) {
    const hk = held?.kind;
    if (t.kind === 'floor' && ((t.fi.item.kind === 'hubcap' && hk === 'flashlight') || (t.fi.item.kind === 'hose' && (hk === 'sprayer' || hk === 'flamethrower'))))
      lines.push(`E: tape the ${t.fi.item.kind === 'hubcap' ? 'hubcap onto your flashlight (wider beam, drains faster)' : 'garden hose onto your ' + ITEM_NAMES[hk!] + ' (longer reach, weaker)'}`);
    else if (t.kind === 'floor') lines.push(`E: pick up ${ITEM_NAMES[t.fi.item.kind]}${t.fi.item.kind === 'generator' && !c.allSlotsFree(p) ? ' (needs all 3 slots empty)' : ''}`);
    if (t.kind === 'mark') {
      const m = t.m;
      if (m.kind === 'rig') lines.push(`E: tap the oil rig (+${m.data?.fuel ?? 300} fuel)`);
      if (m.kind === 'tank') lines.push(p.slots.some((s) => s?.kind === 'sprayer') ? 'E: strap the fuel tank onto your sprayer (it becomes a flamethrower)' : 'Fuel tank (needs a bug sprayer in your slots)');
      if (m.kind === 'suit') lines.push(p.suit ? 'Enlite suit (you are wearing one)' : 'E: put on the Enlite suit (faster, bigger flame, dig with X)');
      if (m.kind === 'truck') lines.push((w.run?.rage ?? 0) >= 1 ? 'E: get in the digging truck!' : 'An Enlite digging truck. It will not start while the queen sleeps.');
    }
    if (t.kind === 'player') lines.push(`Hold E: revive ${t.p.id}${t.p.reviveT > 0 ? ` (${Math.round((t.p.reviveT / 3) * 100)}%)` : ''}${t.p.carriedT > 0 ? ' — they are being carried off!' : ''}`);
    if (t.kind === 'bodies') lines.push(`E: harvest hive oil (${t.n} bodies, +${t.n * FUEL.oilPerBody})`);
    if (t.kind === 'wire') lines.push(t.end ? 'E: pick up cable end' : 'E: coil cable onto a spool');
    if (t.kind === 'device') {
      const dv = t.dev;
      const name = ITEM_NAMES[dv.kind];
      if (p.layingWire != null) lines.push(c.canInput(dv) ? `E: connect cable to ${name}` : `${name}: no free input`);
      else if (held?.kind === 'spool') lines.push(c.canOutput(dv) ? `E: start cable from ${name}` : `${name}: no free output`);
      else if (dv.kind === 'generator') {
        if (held?.kind === 'flashlight' && dv.running) lines.push('E: recharge flashlight (3 fuel per full charge)');
        else lines.push(`E: ${dv.running ? 'stop' : 'start'} generator   hold E: lift (all slots empty)`);
      } else lines.push(`E: pack up ${name}${dv.kind === 'floodlight' ? '   RMB: aim' : ''}  ${dv.powered ? '[powered]' : '[no power]'}`);
    }
  }
  return lines.join('\n');
}

/** Apply one frame of a player's input to the world (host-side in multiplayer). */
export function applyInput(w: World, p: SimPlayer, inp: PlayerInput, dt: number) {
  const c = w.camp;
  p.firing = false;
  p.spraying = false;
  p.aim = inp.aim;
  p.eye = inp.eye;
  if (!p.alive || p.downed || p.hive) {
    p.liftT = 0;
    p.flashlight.on = false; // a downed player's light is on the floor, not in their hand
    return;
  }
  // slot selection
  if (!p.carrying && p.layingWire == null) {
    if (inp.slot >= 0) p.sel = inp.slot;
    if (inp.scroll) p.sel = (p.sel + (inp.scroll > 0 ? 1 : 2)) % 3;
  }
  // in the truck: the queen-keeper spends charge; gunners burn with the flamethrower (solo is just the driver)
  if (p.riding && w.finale) {
    w.finale.input(p, inp.usePressed, inp.altPressed);
    const role = w.finale.roles.get(p.id);
    const fl = p.slots.find((s) => s?.kind === 'flamethrower');
    if (inp.use && fl && (role === 'gunnerL' || role === 'gunnerR') && w.fuel.has(0.01)) {
      p.firing = true;
      w.fuel.drain(FUEL.flamethrowerPerSec * dt, 'flamethrower', w.time);
    }
    return;
  }
  const held: Item | null = c.held(p);
  const target = findTarget(w, p);
  // revive a downed teammate: hold E on them
  if (inp.interact && target?.kind === 'player') {
    w.death.revive(p, target.p, dt);
    return;
  }

  // ---- E ----
  if (inp.interactPressed) {
    p.liftT = 0;
    if (p.layingWire != null) {
      if (target?.kind === 'device') c.connectWire(p, target.dev);
    } else if (target?.kind === 'device') {
      const dv = target.dev;
      if (held?.kind === 'spool') c.startWire(p, dv);
      else if (dv.kind === 'generator') {
        if (!(held?.kind === 'flashlight' && c.recharge(p, dv))) p.pendingToggle = dv.id; // toggle on release unless it becomes a lift
      } else c.pickUpDevice(p, dv);
    } else if (target?.kind === 'floor') c.pickUpFloor(p, target.fi);
    else if (target?.kind === 'wire') {
      if (target.end) c.resumeWire(p, target.wire);
      else c.coilWire(p, target.wire);
    } else if (target?.kind === 'bodies') c.collectBodies(p);
    else if (target?.kind === 'mark') w.run?.useMark(p, target.m);
  }
  if (inp.interact && p.pendingToggle != null) {
    p.liftT += dt;
    if (p.liftT >= CAMP.liftHold) {
      const dv = c.devices.find((d) => d.id === p.pendingToggle);
      p.pendingToggle = null;
      p.liftT = 0;
      if (dv && c.allSlotsFree(p)) c.pickUpDevice(p, dv);
    }
  } else if (!inp.interact && p.pendingToggle != null) {
    const dv = c.devices.find((d) => d.id === p.pendingToggle);
    if (dv) c.toggleGenerator(dv);
    p.pendingToggle = null;
    p.liftT = 0;
  }

  // ---- Q / R ----
  if (inp.drop) c.dropHeld(p);
  if (inp.repair) c.repair(p, dt);
  else p.repairT = 0;

  // ---- reel crank (alternate LMB/RMB while laying cable) ----
  if (p.layingWire != null) {
    if (inp.usePressed) c.crank(p, 'L');
    if (inp.altPressed) c.crank(p, 'R');
  } else if (held) {
    // ---- use held item ----
    switch (held.kind) {
      case 'flashlight':
        if (inp.usePressed) held.on = !held.on;
        break;
      case 'flamethrower':
        p.hose = !!held.mods?.includes('hose');
        if (inp.use && w.fuel.has(0.01)) {
          p.firing = true; // the world emits the flames (on every machine) from p.aim / p.eye
          w.fuel.drain(FUEL.flamethrowerPerSec * dt, 'flamethrower', w.time);
        }
        break;
      case 'sprayer':
        if (inp.use) {
          p.spraying = true;
          const house = w.run?.house;
          if (house?.tendril) w.swarm.sprayPests(p.x, p.z, Math.sin(p.yaw), Math.cos(p.yaw), w.time, (id) => house.owns(id));
        }
        break;
      case 'flare':
        if (inp.usePressed) {
          w.throwFlare(p);
          p.slots[p.sel] = null;
        }
        break;
      case 'lightning':
        if (inp.usePressed && w.time - p.zapT > 0.6 && w.fuel.has(FUEL.lightningPerShot)) {
          p.zapT = w.time;
          w.fuel.drain(FUEL.lightningPerShot, 'lightning', w.time);
          lightning(w, p, inp);
        }
        break;
      case 'zapper':
        if (inp.usePressed && w.time - p.zapT > CAMP.zapperCooldown) {
          p.zapT = w.time;
          zap(w, p);
        }
        break;
    }
    if (inp.altPressed && PLACEABLE.includes(held.kind)) c.place(p);
    else if (inp.altPressed && target?.kind === 'device' && target.dev.kind === 'floodlight') c.aim(target.dev, p.yaw);
  } else if (inp.altPressed && target?.kind === 'device' && target.dev.kind === 'floodlight') c.aim(target.dev, p.yaw);

  // ---- Enlite suit digging ----
  if (inp.dig && p.suit && w.run) {
    p.digT += dt;
    if (p.digT >= 0.45) {
      p.digT = 0;
      w.run.playerDig(p);
    }
  } else p.digT = 0;

  // ---- stomp (crush a bug: harvests a body but puts you in reach) ----
  if (inp.stomp && w.time - p.stompT > CAMP.stompCooldown) {
    p.stompT = w.time;
    const sw = w.swarm;
    const sx = p.x + Math.sin(p.yaw) * 0.45, sz = p.z + Math.cos(p.yaw) * 0.45;
    const r = CAMP.stompRange;
    let killed = 0;
    sw.hash.forEachNear(sx, sz, r, (j) => {
      if (killed >= 2 || !sw.alive[j] || sw.layer[j]) return;
      if ((sw.x[j] - sx) ** 2 + (sw.z[j] - sz) ** 2 < r * r) {
        sw.kill(j, 'stomp', w.events);
        killed++;
      }
    });
    w.events.emit('stomp', { id: p.id, x: sx, z: sz, killed });
  }

  // ---- flashlight state + battery ----
  const fl = c.held(p);
  const lit = !!fl && fl.kind === 'flashlight' && fl.on !== false && (fl.battery ?? 0) > 0;
  p.flashlight.on = lit;
  const hub = !!fl?.mods?.includes('hubcap');
  p.flashlight.cone = ((hub ? 36 : 24) * Math.PI) / 180; // hubcap reflector: a wider beam...
  if (lit) {
    fl!.battery = Math.max(0, (fl!.battery ?? 0) - dt * (hub ? 1.6 : 1)); // ...that drains faster
    // weak battery: dimmer and flickering
    const b = fl!.battery! / CAMP.flashlightBattery;
    p.flashlight.intensity = b > 0.15 ? 1.25 : 0.5 + b * 5 * (Math.sin(w.time * 37) > -0.6 ? 1 : 0.2);
  }
}

/** Lightning gun (Enlite salvage): a bolt along the aim that chains through up to 5 bugs. */
export function lightning(w: World, p: SimPlayer, inp: PlayerInput) {
  const sw = w.swarm;
  const [ax, , az] = inp.aim;
  const al = Math.hypot(ax, az) || 1;
  const dx = ax / al, dz = az / al;
  let first = -1;
  const pts: [number, number][] = [[p.x + dx * 0.4, p.z + dz * 0.4]];
  for (let d = 0.5; d < 14 && first < 0; d += 0.4) {
    const x = p.x + dx * d, z = p.z + dz * d;
    if (!w.grid.isOpenAt(x, z)) {
      pts.push([x, z]);
      break;
    }
    sw.hash.forEachNear(x, z, 0.5, (j) => {
      if (sw.alive[j] && !sw.layer[j] && (sw.x[j] - x) ** 2 + (sw.z[j] - z) ** 2 < 0.25) {
        first = j;
        return true;
      }
    });
    if (first < 0 && d + 0.4 >= 14) pts.push([x, z]);
  }
  const hit: number[] = [];
  let cur = first;
  while (cur >= 0 && hit.length < 5) {
    hit.push(cur);
    pts.push([sw.x[cur], sw.z[cur]]);
    let nxt = -1, nd = 2.2 * 2.2;
    sw.hash.forEachNear(sw.x[cur], sw.z[cur], 2.2, (j) => {
      if (!sw.alive[j] || sw.layer[j] || hit.includes(j)) return;
      const d2 = (sw.x[j] - sw.x[cur]) ** 2 + (sw.z[j] - sw.z[cur]) ** 2;
      if (d2 < nd) (nd = d2), (nxt = j);
    });
    cur = nxt;
  }
  // a struggling hive body in the light is electrocuted solid, not killed (respawn ritual)
  for (const j of hit) if (!w.death.shockBody(j)) sw.kill(j, 'lightning', w.events);
  w.events.emit('lightning', { id: p.id, pts, kills: hit.length });
  return hit.length;
}

/** Generator zapper: a short electric arc that kills a few bugs in front and leaves their bodies. */
export function zap(w: World, p: SimPlayer) {
  const sw = w.swarm;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const R = CAMP.zapperRange;
  const hits: { j: number; d: number }[] = [];
  sw.hash.forEachNear(p.x, p.z, R, (j) => {
    if (!sw.alive[j] || sw.layer[j]) return;
    const dx = sw.x[j] - p.x, dz = sw.z[j] - p.z;
    const d = Math.hypot(dx, dz);
    if (d > R || d < 1e-3) return;
    if ((dx * fx + dz * fz) / d < Math.cos(CAMP.zapperCone)) return;
    hits.push({ j, d });
  });
  hits.sort((a, b) => a.d - b.d);
  let k = 0;
  for (const h of hits) {
    if (k >= CAMP.zapperMaxKills || !w.fuel.has(CAMP.zapperFuelPerKill)) break;
    w.fuel.drain(CAMP.zapperFuelPerKill, 'zapper', w.time);
    sw.kill(h.j, 'zap', w.events);
    k++;
  }
  w.events.emit('zap', { id: p.id, x: p.x + fx, z: p.z + fz, kills: k });
  return k;
}

export const cellM = CELL;
