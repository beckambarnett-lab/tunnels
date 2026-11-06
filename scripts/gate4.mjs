// Milestone-4 gate (browser): two tabs host + join, see the same swarm and stay in sync for N
// minutes (default 10); then the joined player dies, is carried to the queen, plays as the hive and
// is rebuilt by the respawn ritual.
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const minutes = +(process.env.SOAK_MIN || 10);
const room = 'Q' + Math.floor(Math.random() * 900 + 100);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
const errors = [];
const host = await ctx.newPage();
collectErrors(host, errors, '[host] ');
await host.goto(`${BASE}?host=${room}&net=local&bugs=500&res=0.25&seed=3&auto`);
await host.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 1, null, { timeout: 120000 });
const client = await ctx.newPage();
collectErrors(client, errors, '[client] ');
await client.goto(`${BASE}?join=${room}&net=local&res=0.25`);
await client.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 0, null, { timeout: 120000 });
const clientId = await client.evaluate(() => window.__tunnels.game.localId);

const sample = (page) =>
  page.evaluate(() => {
    const w = window.__tunnels.world, sw = w.swarm;
    const bugs = [];
    for (let i = 0; i < sw.count; i++) bugs.push(sw.alive[i] ? [sw.x[i], sw.z[i]] : null);
    let cellHash = 0;
    for (let i = 0; i < w.grid.n; i++) cellHash = (cellHash * 31 + w.grid.cells[i]) | 0;
    return {
      t: w.time, bugs, alive: sw.active, cellHash, fuel: w.fuel.value,
      players: w.players.map((p) => ({ id: p.id, x: p.x, z: p.z, downed: p.downed, hive: p.hive })),
      devices: w.camp.devices.length, cuts: w.camp.wires.reduce((a, x) => a + x.cuts.size, 0), tendrils: w.tendrils.size,
      dug: [...w.grid.dugAt].filter((x) => x >= 0).length,
    };
  });
const compare = async () => {
  const [a, b] = await Promise.all([sample(host), sample(client)]);
  let err = 0, n = 0, mism = 0;
  for (let i = 0; i < Math.max(a.bugs.length, b.bugs.length); i++) {
    const p = a.bugs[i], q = b.bugs[i];
    if (!!p !== !!q) mism++;
    else if (p && q) (err += Math.hypot(p[0] - q[0], p[1] - q[1])), n++;
  }
  const hp = a.players.find((p) => p.id === 'host'), cp = b.players.find((p) => p.id === 'host');
  return {
    hostT: +a.t.toFixed(1), clientT: +b.t.toFixed(1), alive: [a.alive, b.alive], bugsCompared: n,
    meanBugErrM: +(err / Math.max(1, n)).toFixed(3), aliveMismatch: mism, terrainMatch: a.cellHash === b.cellHash, dug: [a.dug, b.dug],
    fuel: [+a.fuel.toFixed(1), +b.fuel.toFixed(1)], players: [a.players.length, b.players.length], devices: [a.devices, b.devices], cuts: [a.cuts, b.cuts],
    hostPlayerPosErrM: hp && cp ? +Math.hypot(hp.x - cp.x, hp.z - cp.z).toFixed(2) : null,
  };
};

// ---------- phase 1: soak ----------
const soak = [];
const t0 = Date.now();
// the host builds a small camp so there is camp state to keep in sync
await host.evaluate(() => {
  const { world: w, game } = window.__tunnels;
  const me = game.me, c = w.camp;
  me.slots = [null, null, null];
  const gf = c.floor.find((f) => f.item.kind === 'generator');
  me.x = gf.x; me.z = gf.z;
  c.pickUpFloor(me, gf);
  c.place(me);
});
while (Date.now() - t0 < minutes * 60000) {
  await sleep(30000);
  const r = { wallS: Math.round((Date.now() - t0) / 1000), ...(await compare()) };
  soak.push(r);
  console.log(JSON.stringify(r));
}

// ---------- phase 2: hive death and respawn of the joined player ----------
const death = await host.evaluate(async (cid) => {
  const { world: w, game } = window.__tunnels;
  const waitGame = (secs, until) => new Promise((res) => { const s = w.time; const tick = () => (w.time - s >= secs || (until && until()) ? res(true) : setTimeout(tick, 50)); tick(); });
  const p = w.players.find((q) => q.id === cid);
  const ev = [];
  for (const n of ['downed', 'carried', 'devoured', 'ritualStage', 'respawned']) w.events.on(n, (e) => e.id === cid && ev.push(n + (e.stage != null ? ':' + e.stage : '')));
  game.opts.auto = false;
  // a lit camp with a live cable lying in the light, next to the host
  const c = w.camp, me = game.me;
  let gen = c.devices.find((d) => d.kind === 'generator');
  const lampF = c.floor.find((f) => f.item.kind === 'lamp');
  me.slots = [lampF.item, null, null]; c.floor.splice(c.floor.indexOf(lampF), 1); me.sel = 0;
  me.x = gen.x + Math.sin(me.yaw) * 2.5; me.z = gen.z + Math.cos(me.yaw) * 2.5;
  const lamp = c.place(me);
  me.slots[1] = { id: 991, kind: 'spool' }; me.sel = 1; me.x = gen.x; me.z = gen.z;
  c.startWire(me, gen); me.x = lamp.x; me.z = lamp.z; await waitGame(0.3); c.connectWire(me, lamp);
  me.slots[1] = { id: 992, kind: 'spool' }; me.x = gen.x; me.z = gen.z; c.startWire(me, gen);
  me.x = lamp.x + 0.6; me.z = lamp.z + 0.6; await waitGame(0.3); c.dropWireEnd(me);
  me.x = gen.x - Math.sin(me.yaw) * 1.5; me.z = gen.z - Math.cos(me.yaw) * 1.5;
  const target = { x: lamp.x + 0.3, z: lamp.z + 0.3 };
  // the joined player is overwhelmed far from help, in the dark
  let spot = null, best = -1;
  for (let i = 0; i < w.grid.n; i += 3) {
    if (w.grid.cells[i] !== 0 || w.light.rawAt(w.grid.centerX(i), w.grid.centerZ(i)) > 0.02) continue;
    const x = w.grid.centerX(i), z = w.grid.centerZ(i);
    const d = Math.hypot(x - gen.x, z - gen.z), dh = Math.hypot(x - w.layout.hive.x, z - w.layout.hive.z);
    // dark, well away from the camp, and not already at the queen
    const score = Math.min(d, 25) + Math.min(dh, 15);
    if (d > 8 && dh > 8 && score > best) (best = score), (spot = { x, z });
  }
  p.x = spot.x; p.z = spot.z;
  p.downed = true; p.overwhelm = 1;
  const t0 = w.time;
  await waitGame(120, () => p.hive);
  const devouredAfter = w.time - t0;
  return { events: ev.slice(), devoured: p.hive, devouredAfterS: +devouredAfter.toFixed(1), target, lampOn: lamp.light.on };
}, clientId);
console.log('death:', JSON.stringify(death));
// the client now steers its bugs (from its own tab) back to the camp and into the light
const clientView = await client.evaluate(async (target) => {
  const { world: w, game } = window.__tunnels;
  const me = game.me;
  const seenHive = me.hive;
  const order = me.order;
  game.hiveMove = () => {
    const dx = target.x - me.hiveX, dz = target.z - me.hiveZ, l = Math.hypot(dx, dz);
    return l < 0.4 ? [0, 0] : [dx / l, dz / l];
  };
  const waitGame = (secs, until) => new Promise((res) => { const s = w.time; const tick = () => (w.time - s >= secs || (until && until()) ? res(true) : setTimeout(tick, 50)); tick(); });
  const t0 = w.time;
  let maxStage = 0;
  await waitGame(400, () => { maxStage = Math.max(maxStage, me.ritualStage); return !me.hive && w.time - t0 > 1; });
  const hud = document.querySelector('.hivehud')?.textContent ?? '';
  return { sawHiveOnClient: seenHive, order, maxStage, back: !me.hive, after: +(w.time - t0).toFixed(1), overwhelm: me.overwhelm, hud };
}, death.target);
console.log('client:', JSON.stringify(clientView));
const hostAfter = await host.evaluate((cid) => {
  const w = window.__tunnels.world;
  const p = w.players.find((q) => q.id === cid);
  return { hive: p.hive, downed: p.downed, fuelSpentRespawn: w.fuel.spent.respawn || 0, runState: w.runState };
}, clientId);
console.log('host after:', JSON.stringify(hostAfter));
await browser.close();
const checks = {
  soakRan: soak.length >= Math.max(1, Math.floor(minutes * 2) - 1),
  sameSwarm: soak.every((r) => r.meanBugErrM < 1 && r.aliveMismatch < 30 && r.bugsCompared > 300),
  terrainCampFuel: soak.every((r) => r.terrainMatch && r.devices[0] === r.devices[1] && Math.abs(r.fuel[0] - r.fuel[1]) < 1.5 && r.players[0] === 2 && r.players[1] === 2),
  devoured: death.devoured && death.events.includes('carried') && death.events.includes('devoured'),
  hiveOnClient: clientView.sawHiveOnClient,
  ritualAndRespawn: clientView.back && clientView.maxStage >= 2 && !hostAfter.hive && hostAfter.fuelSpentRespawn >= 150,
  noErrors: errors.length === 0,
};
const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 10).join('\n'));
if (failed.length) console.log('failed checks: ' + failed.join(', '));
console.log(failed.length ? 'GATE-4 BROWSER CHECKS: FAIL' : 'GATE-4 BROWSER CHECKS: PASS');
process.exit(failed.length ? 1 : 0);
