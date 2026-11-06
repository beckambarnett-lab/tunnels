// A full night, dusk to sunrise, driven through the real game in the browser (solo), with
// screenshots at each act. Fast-forwards the walking (teleports between set pieces) but plays
// every beat through the game's own systems.
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
collectErrors(page, errors);
const logs = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('[night') || t.startsWith('[finale')) logs.push(t);
});
await page.goto(`${BASE}?night&seed=${process.env.SEED || 2}&bugs=200&res=0.4`);
await page.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 1, null, { timeout: 120000 });
const shot = async (name) => {
  await page.evaluate(() => document.getElementById('debug-panel').classList.add('hidden'));
  await page.screenshot({ path: `scripts/out/night-${name}.png` });
};
const step = (fn, arg) => page.evaluate(fn, arg);
const helpers = `
  const { game, world: w } = window.__tunnels;
  const me = game.me, r = w.run, L = w.layout;
  game.panel.state.god = true;
  const waitGame = (secs, until) => new Promise((res) => { const s = w.time; const tick = () => (w.time - s >= secs || (until && until()) ? res(true) : setTimeout(tick, 40)); tick(); });
  const mark = (k) => L.marks.find((m) => m.kind === k);
  const go = (m, back = 1.2) => { me.x = m.x - back; me.z = m.z; me.yaw = Math.PI / 2; };
`;
const out = {};
// act 1: the job, flashlights, power dies
await shot('1-house');
out.act1 = await step(new Function(`return (async () => { ${helpers}
  r.jobKills = r.jobTarget; // (zapping 8 bugs by hand is tested in Node; here we skip to the beat)
  const fl = w.camp.floor.find((f) => f.item.kind === 'flashlight');
  me.slots[2] = null;
  me.x = fl.x - 0.6; me.z = fl.z; me.yaw = Math.PI / 2;
  await waitGame(0.3);
  w.camp.pickUpFloor(me, fl);
  await waitGame(1, () => r.plugOpen);
  return { act: r.act, powerOn: r.powerOn, plugOpen: r.plugOpen };
})()`));
await sleep(500);
await shot('2-power-out');
// act 2 -> 4: walk the ladder
out.ladder = await step(new Function(`return (async () => { ${helpers}
  const res = {};
  const plug = L.plugCells[(L.plugCells.length / 2) | 0];
  me.x = w.grid.centerX(plug) + 3; me.z = w.grid.centerZ(plug); await waitGame(1);
  res.actAtBase = r.act;
  go(mark('tank')); await waitGame(0.5);
  window.__tunnels.actions.applyInput(w, me, { ...game.buildInput(false), interactPressed: true, interact: true }, 0.05);
  res.flamethrower = me.slots.some((s) => s && s.kind === 'flamethrower');
  res.actAtIntersection = r.act;
  const rig = mark('rig'); go(rig); await waitGame(0.5);
  const f0 = w.fuel.value; r.useMark(me, rig); res.rigFuel = Math.round(w.fuel.value - f0);
  go(mark('suit')); await waitGame(0.5); r.useMark(me, mark('suit')); res.suit = me.suit;
  res.actAtJunkyard = r.act;
  res.checkpoints = r.checkpoints.slice();
  return res;
})()`));
await sleep(500);
await shot('3-junkyard');
// act 4: burn the egg sacs
out.eggs = await step(new Function(`return (async () => { ${helpers}
  const ft = me.slots.findIndex((s) => s && s.kind === 'flamethrower'); me.sel = ft;
  for (const e of r.eggs) { me.x = e.x - 1.5; me.z = e.z; me.yaw = Math.PI / 2; me.pitch = -0.2; game.debugFire = true; await waitGame(4, () => e.hp <= 0); }
  game.debugFire = false;
  return { rage: r.rage, burned: r.eggs.filter((e) => e.hp <= 0).length };
})()`));
await shot('4-queen');
// act 5: the truck
out.finale = await step(new Function(`return (async () => { ${helpers}
  go(mark('truck'), 0.6); await waitGame(0.3);
  r.useMark(me, mark('truck'));
  const f = w.finale;
  const started = f.state === 'driving';
  game.hiveMove = () => [-1, 0];
  let maxQueenDist = 0, minHp = 1;
  await waitGame(420, () => { minHp = Math.min(minHp, f.truck.hp); f.truck.hp = Math.max(f.truck.hp, 0.4); return f.state !== 'driving'; });
  return { started, state: f.state, ending: f.ending, runState: w.runState, minHp: +minHp.toFixed(2), truckX: +f.truck.x.toFixed(1), queenAlive: f.queen.alive };
})()`));
await sleep(1500);
await shot('5-sunrise');
out.endingScreen = await page.evaluate(() => document.querySelector('.ending')?.textContent ?? '');
out.logs = logs;
out.consoleErrors = errors;
await browser.close();
console.log(JSON.stringify(out, null, 1));
const ok = out.act1.plugOpen && out.ladder.flamethrower && out.ladder.suit && out.ladder.rigFuel > 0 && out.eggs.rage >= 1 && out.finale.started && out.finale.ending === 'true' && /SUNRISE/.test(out.endingScreen) && errors.length === 0;
console.log(ok ? 'FULL NIGHT (browser): PASS' : 'FULL NIGHT (browser): FAIL');
process.exit(ok ? 0 : 1);
