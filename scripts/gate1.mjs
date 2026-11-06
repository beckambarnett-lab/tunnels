// Milestone-1 gate, browser part: benchmark + breach audit in the real nest + console errors.
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const out = {};
const browser = await launch();
const errors = [];
// 1) benchmark scene
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  collectErrors(page, errors, '[bench] ');
  await page.goto(`${BASE}?bench&bugs=500&res=0.25`);
  let r = null;
  for (let k = 0; k < 600 && !r; k++) {
    await sleep(1000);
    r = await page.evaluate(() => window.__tunnels?.game.bench?.result ?? null);
  }
  out.bench = r;
  await page.close();
}
// 2) the real stitched nest, autopilot wandering and looking around, for N seconds of game time
{
  const secs = +(process.env.GATE_SECS || 90);
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  collectErrors(page, errors, '[nest] ');
  await page.goto(`${BASE}?auto&bugs=500&res=0.25&seed=${process.env.SEED || 3}`);
  for (let k = 0; k < 2000; k++) {
    await sleep(1000);
    const t = await page.evaluate(() => window.__tunnels?.world.time ?? 0);
    if (t >= secs) break;
  }
  out.nest = await page.evaluate(() => {
    const w = window.__tunnels.world;
    const log = w.breachLog;
    return {
      gameTime: w.time,
      digs: w.digCount,
      breaches: log.length,
      breachKinds: log.reduce((m, b) => ((m[b.kind] = (m[b.kind] || 0) + 1), m), {}),
      breachesSeen: log.filter((b) => b.seen).length,
      breachesLit: log.filter((b) => b.raw >= 0.04).length,
      queenLog: w.queen.log.slice(-8),
    };
  });
  await page.close();
}
await browser.close();
out.consoleErrors = errors;
console.log(JSON.stringify(out, null, 1));
const ok = out.bench && out.bench.cpuMsAvg < 8 && out.nest.breachesSeen === 0 && out.nest.breachesLit === 0 && errors.length === 0;
console.log(ok ? 'GATE-1 BROWSER CHECKS: PASS' : 'GATE-1 BROWSER CHECKS: FAIL');
process.exit(ok ? 0 : 1);
