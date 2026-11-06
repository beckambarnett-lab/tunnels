// Milestone-3 gate (browser): director cycle + queen intents with tells + learning unlocks, all
// read from the game's own console logs, plus no console errors.
import { launch, collectErrors, BASE } from './pw.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
collectErrors(page, errors);
const logs = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('[director') || t.startsWith('[queen') || t.startsWith('[learning')) logs.push(t);
});
await page.goto(`${BASE}?auto&act=4&bugs=500&res=0.25&seed=${process.env.SEED || 2}`);
await page.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 1, null, { timeout: 120000 });

const out = await page.evaluate(async () => {
  const { game, world: w } = window.__tunnels;
  const me = game.me;
  const waitGame = (secs, until) =>
    new Promise((res) => {
      const t0 = w.time;
      const tick = () => (w.time - t0 >= secs || (until && until()) ? res(true) : setTimeout(tick, 30));
      tick();
    });
  const r = { forced: {} };
  // ---- 1. natural play with the autopilot until the director has gone round its loop ----
  const states = [];
  w.events.on('directorState', (e) => states.push(e.state));
  await waitGame(150, () => ['Sustain Peak', 'Peak Fade', 'Relax', 'Build Up'].every((s) => states.includes(s)) && states.lastIndexOf('Build Up') > states.indexOf('Relax'));
  r.directorStates = states;
  // ---- 2. habits, done for real in the game ----
  const c = w.camp;
  game.opts.auto = false;
  me.slots = [null, null, null];
  const gf = c.floor.find((f) => f.item.kind === 'generator');
  if (gf) {
    me.x = gf.x;
    me.z = gf.z;
    c.pickUpFloor(me, gf);
    const gen = c.place(me);
    // 26 m of cable in two runs
    for (const dir of [me.yaw + 1.2, me.yaw - 1.2]) {
      me.slots[0] = { id: Math.random(), kind: 'spool' };
      me.sel = 0;
      me.x = gen.x;
      me.z = gen.z;
      c.startWire(me, gen);
      let a = dir;
      for (let k = 0; k < 150; k++) {
        const nx = me.x + Math.sin(a) * 0.1, nz = me.z + Math.cos(a) * 0.1;
        if (w.grid.isOpenAt(nx, nz)) (me.x = nx), (me.z = nz);
        else a += 0.8;
        if (k % 5 === 0) await waitGame(0.02);
      }
      c.dropWireEnd(me);
    }
    me.x = gen.x;
    me.z = gen.z;
  }
  // flamethrower for 22 s near the swarm
  me.slots = [null, { id: 777, kind: 'flamethrower' }, null];
  me.sel = 1;
  game.debugFire = true;
  game.opts.auto = true;
  await waitGame(24);
  game.debugFire = false;
  // harvest 12 bodies
  for (let k = 0; k < 12; k++) c.bodies.push({ x: me.x + 0.3, z: me.z });
  c.collectBodies(me);
  await waitGame(2);
  r.unlocks = w.learning.log.map((l) => ({ unlock: l.unlock, why: l.why, t: Math.round(l.t) }));
  // ---- 3. force each intent: does it run and show its tell? ----
  const intents = ['conceal', 'probe', 'sabotage', 'flank', 'undermine', 'reroute', 'siege', 'bait', 'assault', 'retreat'];
  // a lit lamp to besiege
  const lf = c.floor.find((f) => f.item.kind === 'lamp');
  const gen = c.devices.find((d) => d.kind === 'generator');
  if (lf && gen) {
    me.slots = [lf.item, null, null];
    c.floor.splice(c.floor.indexOf(lf), 1);
    me.sel = 0;
    me.x = gen.x + Math.sin(me.yaw) * 3;
    me.z = gen.z + Math.cos(me.yaw) * 3;
    const lamp = c.place(me);
    if (lamp) {
      me.slots[1] = { id: 778, kind: 'spool' };
      me.sel = 1;
      me.x = gen.x;
      me.z = gen.z;
      c.startWire(me, gen);
      me.x = lamp.x;
      me.z = lamp.z;
      await waitGame(0.2);
      c.connectWire(me, lamp);
    }
  }
  w.director.scripted = true;
  w.director.state = 'Build Up';
  w.learning.unlock('flank', 'gate script');
  w.learning.unlock('bait', 'gate script');
  w.learning.unlock('sabotage', 'gate script');
  for (const i of intents) {
    const tells = [];
    const on = (e) => e.intent === i && tells.push(e.tell ?? '(pulse)');
    w.events.on('tell', on);
    w.events.on('tellPulse', on);
    me.lastFired = w.time; // keep bait viable
    w.queen.force(i);
    await waitGame(8);
    w.events.off('tell', on);
    w.events.off('tellPulse', on);
    const t = [...w.tendrils.values()].filter((x) => x.intent === i);
    r.forced[i] = { ran: w.queen.intent === i, tells: tells.length, tell: tells[0], tendrils: t.length, members: t.reduce((a, x) => a + x.members, 0) };
  }
  w.queen.force(null);
  w.director.scripted = false;
  return r;
});
await browser.close();
out.consoleErrors = errors;
out.logCounts = {
  director: logs.filter((l) => l.startsWith('[director')).length,
  queen: logs.filter((l) => l.startsWith('[queen')).length,
  learning: logs.filter((l) => l.startsWith('[learning')).length,
};
out.sampleLogs = [...logs.filter((l) => l.startsWith('[director')).slice(0, 5), ...logs.filter((l) => l.startsWith('[queen')).slice(0, 4), ...logs.filter((l) => l.startsWith('[learning')).slice(0, 6)];
console.log(JSON.stringify(out, null, 1));
const seq = ['Sustain Peak', 'Peak Fade', 'Relax', 'Build Up'];
let k = 0;
for (const s of out.directorStates) if (s === seq[k]) k++;
const checks = {
  directorCycle: k === 4 && out.logCounts.director >= 4,
  everyIntentRanWithTell: Object.values(out.forced).every((f) => f.ran && f.tells > 0),
  learnedFromHabits: out.unlocks.filter((u) => u.why !== 'time fallback' && u.why !== 'gate script').length >= 3,
  noErrors: errors.length === 0,
};
const failed = Object.entries(checks).filter(([, v]) => !v).map(([n]) => n);
if (failed.length) console.log('failed checks: ' + failed.join(', '));
console.log(failed.length ? 'GATE-3 BROWSER CHECKS: FAIL' : 'GATE-3 BROWSER CHECKS: PASS');
process.exit(failed.length ? 1 : 0);
