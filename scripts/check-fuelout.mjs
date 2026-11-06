// Fuel running out fails the run and shows the failure screen (night mode, random seed).
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
collectErrors(page, errors);
await page.goto(`${BASE}?night&bugs=150&res=0.4`);
await page.waitForFunction(() => window.__tunnels && window.__tunnels.world.time > 1, null, { timeout: 120000 });
const before = await page.evaluate(() => ({ seed: window.__tunnels.world.seed, runState: window.__tunnels.world.runState }));
await page.evaluate(() => window.__tunnels.world.fuel.drain(5000, 'test', window.__tunnels.world.time));
await sleep(2500);
const after = await page.evaluate(() => {
  const w = window.__tunnels.world;
  const el = document.querySelector('.fail');
  return { runState: w.runState, reason: w.failReason, screen: el && getComputedStyle(el).display !== 'none' ? el.textContent : null };
});
await browser.close();
console.log(JSON.stringify({ before, after, errors }, null, 1));
const ok = after.runState === 'failed' && /fuel/.test(after.reason) && /NIGHT IS LOST/.test(after.screen ?? '') && errors.length === 0;
console.log(ok ? 'FUEL-OUT CHECK: PASS' : 'FUEL-OUT CHECK: FAIL');
process.exit(ok ? 0 : 1);
