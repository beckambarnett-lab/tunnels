// Two tabs on one machine: host + join over BroadcastChannel; compare what each tab sees.
// usage: node scripts/twotab.mjs [minutes=1] [bugs=500]
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const minutes = +(process.argv[2] || 1), bugs = +(process.argv[3] || 500);
const room = 'G' + Math.floor(Math.random() * 900 + 100);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
const errors = [];
const host = await ctx.newPage();
collectErrors(host, errors, '[host] ');
await host.goto(`${BASE}?host=${room}&net=local&bugs=${bugs}&res=0.25&seed=3&auto`);
await host.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 1, null, { timeout: 120000 });
const client = await ctx.newPage();
collectErrors(client, errors, '[client] ');
await client.goto(`${BASE}?join=${room}&net=local&res=0.25`);
await client.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 0, null, { timeout: 120000 });

const sample = (page) =>
  page.evaluate(() => {
    const w = window.__tunnels.world;
    const sw = w.swarm;
    const bugs = [];
    for (let i = 0; i < sw.count; i++) bugs.push(sw.alive[i] ? [Math.round(sw.x[i] * 100) / 100, Math.round(sw.z[i] * 100) / 100] : null);
    let cellHash = 0;
    for (let i = 0; i < w.grid.n; i++) cellHash = (cellHash * 31 + w.grid.cells[i]) | 0;
    return {
      t: w.time,
      bugs,
      alive: sw.active,
      cellHash,
      dug: [...w.grid.dugAt].filter((x) => x >= 0).length,
      fuel: w.fuel.value,
      players: w.players.map((p) => ({ id: p.id, x: p.x, z: p.z, downed: p.downed, hive: p.hive })),
      devices: w.camp.devices.length,
      wires: w.camp.wires.map((x) => x.cuts.size),
      tendrils: w.tendrils.size,
      sync: window.__tunnels.session?.stats ?? null,
      fps: window.__tunnels.game.overlay.fps,
    };
  });
const checks = [];
const t0 = Date.now();
let k = 0;
while (Date.now() - t0 < minutes * 60000) {
  await sleep(Math.min(30000, minutes * 60000 / 4));
  const [a, b] = await Promise.all([sample(host), sample(client)]);
  let err = 0, n = 0, mism = 0;
  for (let i = 0; i < Math.max(a.bugs.length, b.bugs.length); i++) {
    const p = a.bugs[i], q = b.bugs[i];
    if (!!p !== !!q) mism++;
    else if (p && q) (err += Math.hypot(p[0] - q[0], p[1] - q[1])), n++;
  }
  const rec = {
    wallS: Math.round((Date.now() - t0) / 1000),
    hostT: +a.t.toFixed(1),
    clientT: +b.t.toFixed(1),
    alive: [a.alive, b.alive],
    meanBugErrM: +(err / Math.max(1, n)).toFixed(3),
    aliveMismatch: mism,
    terrainMatch: a.cellHash === b.cellHash,
    dug: [a.dug, b.dug],
    fuel: [+a.fuel.toFixed(1), +b.fuel.toFixed(1)],
    players: [a.players.length, b.players.length],
    devices: [a.devices, b.devices],
    tendrils: [a.tendrils, b.tendrils],
    clientKfErr: b.sync ? +b.sync.lastMeanErr.toFixed(3) : null,
    fps: [Math.round(a.fps), Math.round(b.fps)],
  };
  checks.push(rec);
  console.log(JSON.stringify(rec));
  k++;
}
await browser.close();
const ok =
  checks.length > 0 &&
  checks.every((c) => c.meanBugErrM < 1.0 && c.terrainMatch && c.players[0] === 2 && c.players[1] === 2 && Math.abs(c.fuel[0] - c.fuel[1]) < 1 && c.devices[0] === c.devices[1] && c.aliveMismatch < 30) &&
  errors.length === 0;
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 10).join('\n'));
console.log(ok ? 'TWO-TAB SYNC: PASS' : 'TWO-TAB SYNC: FAIL');
process.exit(ok ? 0 : 1);
