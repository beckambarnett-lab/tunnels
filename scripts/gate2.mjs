// Milestone-2 gate (browser): drives the real game through the camp loop and checks the results.
import { launch, collectErrors, BASE, sleep } from './pw.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
collectErrors(page, errors);
await page.goto(`${BASE}?seed=${process.env.SEED || 1}&bugs=600&res=0.25`);
await page.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 1, null, { timeout: 120000 });

const result = await page.evaluate(async () => {
  const { game, world: w } = window.__tunnels;
  const me = game.me;
  const c = w.camp;
  game.panel.state.god = true;
  const log = [];
  const frames = async (n = 2) => {
    for (let k = 0; k < n; k++) {
      const t = w.time;
      while (w.time === t) await new Promise((r) => setTimeout(r, 5));
    }
  };
  const waitGame = async (secs, until) => {
    const t0 = w.time;
    while (w.time - t0 < secs) {
      if (until && until()) return true;
      await new Promise((r) => setTimeout(r, 30));
    }
    return until ? until() : true;
  };
  const walkTo = async (x, z, steps = 40) => {
    const x0 = me.x, z0 = me.z;
    for (let s = 1; s <= steps; s++) {
      me.x = x0 + ((x - x0) * s) / steps;
      me.z = z0 + ((z - z0) * s) / steps;
      await frames(1);
    }
  };
  const fwd = (d) => ({ x: me.x + Math.sin(me.yaw) * d, z: me.z + Math.cos(me.yaw) * d });
  const out = {};
  let cutEv = null;
  w.events.on('wireCut', (e) => (cutEv = cutEv || { ...e, t: w.time }));

  // ---------- 1. set up camp ----------
  me.slots = [null, null, null];
  const genFloor = c.floor.find((f) => f.item.kind === 'generator');
  me.x = genFloor.x - Math.sin(me.yaw) * 0.8;
  me.z = genFloor.z - Math.cos(me.yaw) * 0.8;
  out.liftOk = c.pickUpFloor(me, genFloor);
  out.carryFillsSlots = c.freeSlot(me) === -1;
  await walkTo(fwd(2).x, fwd(2).z, 10);
  const gen = c.place(me);
  out.generatorPlaced = !!gen && gen.running;
  // a lamp at the end of a long cable so part of the cable lies in the dark
  const lampFloor = c.floor.find((f) => f.item.kind === 'lamp');
  c.pickUpFloor(me, lampFloor);
  // walk a path along the tunnel ~12 m away from the generator
  const path = [];
  {
    let x = gen.x, z = gen.z, a = me.yaw;
    for (let k = 0; k < 48; k++) {
      // follow open space
      let best = a, bestLen = -1;
      for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
        let len = 0;
        while (len < 4 && w.grid.isOpenAt(x + Math.sin(a + da) * len, z + Math.cos(a + da) * len)) len += 0.25;
        if (len > bestLen + 0.3) (bestLen = len), (best = a + da);
      }
      a = best;
      x += Math.sin(a) * 0.25;
      z += Math.cos(a) * 0.25;
      path.push({ x, z });
    }
  }
  me.slots[me.sel] = null;
  me.slots[0] = lampFloor.item;
  me.sel = 0;
  const end = path[path.length - 1];
  me.x = end.x;
  me.z = end.z;
  me.yaw = Math.atan2(end.x - path[path.length - 5].x, end.z - path[path.length - 5].z);
  await frames(1);
  const lamp = c.place(me);
  out.lampPlaced = !!lamp;
  // lay cable: E on generator with a spool, walk the path, E on the lamp
  me.slots[1] = { id: 99999, kind: 'spool' };
  me.sel = 1;
  me.x = gen.x;
  me.z = gen.z;
  out.wireStarted = c.startWire(me, gen);
  for (const p of path) {
    me.x = p.x;
    me.z = p.z;
    await frames(1);
  }
  out.wireConnected = c.connectWire(me, lamp);
  await frames(3);
  out.lampPoweredAfterConnect = lamp.powered && lamp.light.on;
  out.wireLengthM = +c.wireLength(c.wires[0]).toFixed(1);

  // ---------- 2. fuel drains ----------
  const s0 = { ...w.fuel.spent }, t0 = w.time;
  // walk back to the generator and wait in the camp; integrate the lamp's powered time
  me.x = gen.x - Math.sin(me.yaw) * 1.5;
  me.z = gen.z - Math.cos(me.yaw) * 1.5;
  let lampOnMin = 0, lastT = w.time;
  while (w.time - t0 < 20) {
    await frames(1);
    if (lamp.powered) lampOnMin += (w.time - lastT) / 60;
    lastT = w.time;
  }
  const dtMin = (w.time - t0) / 60;
  out.fuelDrain = {
    minutes: +dtMin.toFixed(3),
    generator: +((w.fuel.spent.generator || 0) - (s0.generator || 0)).toFixed(4),
    generatorExpected: +(dtMin * 1).toFixed(4),
    lamp: +((w.fuel.spent.lamp || 0) - (s0.lamp || 0)).toFixed(4),
    lampExpected: +(lampOnMin * 0.5).toFixed(4),
  };

  // ---------- 3. bugs cut the cable ----------
  const tCut0 = t0;
  await waitGame(240, () => !!cutEv);
  out.wireCut = !!cutEv;
  out.wireCutAfterS = cutEv ? +(cutEv.t - tCut0).toFixed(1) : null;
  await frames(3);
  out.lampOffAfterCut = !lamp.powered;
  // ---------- 4. repair ----------
  if (cutEv) {
    const wr = c.wires[0];
    out.cutsBeforeRepair = wr.cuts.size;
    // burn the chewers off the cable first (what a player would do), then repair every cut
    const sw = w.swarm;
    let burned = 0;
    for (let j = 0; j < sw.count; j++) {
      if (!sw.alive[j] || sw.layer[j]) continue;
      if (wr.points.some((p) => Math.hypot(p.x - sw.x[j], p.z - sw.z[j]) < 3)) {
        sw.ignite(j);
        burned++;
      }
    }
    out.burnedOffCable = burned;
    await waitGame(1.5);
    for (const k of [...wr.cuts]) {
      const a = wr.points[k], b = wr.points[k + 1];
      me.x = (a.x + b.x) / 2;
      me.z = (a.z + b.z) / 2;
      for (let n = 0; n < 60 && wr.cuts.has(k); n++) c.repair(me, 1 / 30);
    }
    out.repaired = wr.cuts.size === 0;
    await frames(1);
    out.lampOnAfterRepair = lamp.powered;
  }

  // ---------- 5. harvest ----------
  {
    const f0 = w.fuel.value;
    // a dark spot along the tunnel, facing down it
    me.x = path[12].x;
    me.z = path[12].z;
    me.yaw = Math.atan2(path[16].x - path[12].x, path[16].z - path[12].z);
    const sx = path[16].x, sz = path[16].z;
    for (let k = 0; k < 3; k++) w.swarm.spawn(sx + k * 0.1, sz);
    await frames(1);
    const zapKills = window.__tunnels.actions.zap(w, me);
    const fAfterZap = w.fuel.value;
    const n = c.collectBodies({ ...me, x: sx, z: sz });
    out.harvest = { zapKills, bodies: n, zapCost: +(f0 - fAfterZap).toFixed(2), oil: +(w.fuel.value - fAfterZap).toFixed(2), netLoss: +(f0 - w.fuel.value).toFixed(2) };
    // fire kills leave nothing
    const before = c.bodies.length;
    const j = w.swarm.spawn(sx, sz);
    w.swarm.ignite(j);
    await waitGame(2);
    out.fireBodies = c.bodies.length - before;
  }

  // ---------- 6. pack up, move, set up again ----------
  me.slots = [null, null, null];
  out.packLamp = c.pickUpDevice(me, lamp);
  const wire = c.wires[0];
  out.coil = c.coilWire(me, wire);
  me.slots = [null, null, null];
  out.packGenerator = c.pickUpDevice(me, gen);
  out.lightsOutWhilePacked = c.devices.length === 0;
  // carry it 12 m back toward the start
  const back = path.slice().reverse();
  me.x = path[path.length - 1].x;
  me.z = path[path.length - 1].z;
  await frames(2);
  me.yaw = Math.atan2(path[path.length - 1].x - path[path.length - 6].x, path[path.length - 1].z - path[path.length - 6].z);
  const gen2 = c.place(me);
  me.slots[0] = { id: 99998, kind: 'lamp' };
  me.sel = 0;
  me.x = path[30].x;
  me.z = path[30].z;
  me.yaw = Math.atan2(path[30].x - path[25].x, path[30].z - path[25].z);
  const lamp2 = c.place(me);
  me.slots[1] = { id: 99997, kind: 'spool' };
  me.sel = 1;
  me.x = gen2.x;
  me.z = gen2.z;
  c.startWire(me, gen2);
  for (let k = path.length - 1; k >= 30; k--) {
    me.x = path[k].x;
    me.z = path[k].z;
    await frames(1);
  }
  c.connectWire(me, lamp2);
  await frames(3);
  out.movedCampPowered = !!gen2 && !!lamp2 && lamp2.powered;
  out.movedDistanceM = +Math.hypot(gen2.x - gen.x, gen2.z - gen.z).toFixed(1);
  out.fuelLeft = Math.round(w.fuel.value);
  return out;
});
await browser.close();
result.consoleErrors = errors;
console.log(JSON.stringify(result, null, 1));
const r = result;
const checks = {
  lift: r.liftOk && r.carryFillsSlots,
  setup: r.generatorPlaced && r.lampPlaced && r.wireStarted && r.wireConnected && r.lampPoweredAfterConnect,
  generatorDrain: Math.abs(r.fuelDrain.generator - r.fuelDrain.generatorExpected) < 0.02,
  lampDrain: Math.abs(r.fuelDrain.lamp - r.fuelDrain.lampExpected) < 0.02,
  cut: r.wireCut && r.lampOffAfterCut,
  repair: r.repaired && r.lampOnAfterRepair,
  harvest: r.harvest.bodies === r.harvest.zapKills && r.harvest.zapKills > 0 && Math.abs(r.harvest.oil - r.harvest.bodies * 2) < 1e-6 && r.harvest.netLoss > 0,
  fireLeavesNothing: r.fireBodies === 0,
  pack: r.packLamp && r.coil && r.packGenerator && r.lightsOutWhilePacked,
  move: r.movedCampPowered,
  noErrors: errors.length === 0,
};
const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
if (failed.length) console.log('failed checks: ' + failed.join(', '));
const ok = failed.length === 0;
console.log(ok ? 'GATE-2 BROWSER CHECKS: PASS' : 'GATE-2 BROWSER CHECKS: FAIL');
process.exit(ok ? 0 : 1);
