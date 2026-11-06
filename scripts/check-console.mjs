// Loads the game, lets it run, fails on any console error. Optional screenshots.
// usage: node scripts/check-console.mjs [query] [seconds] [shot.png]
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const [query = '', secs = '12', shot] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
collectErrors(page, errors);
const logs = [];
page.on('console', (m) => { if (m.type() !== 'error') logs.push(m.text()); });
await page.goto(BASE + (query ? '?' + query : ''));
await sleep(+secs * 1000);
const info = await page.evaluate(() => {
  const t = window.__tunnels;
  if (!t) return null;
  const w = t.world;
  return { active: w.swarm.active, stats: w.swarm.stats, fields: w.fields.fields.size, builds: w.fields.stats.builds, time: w.time, overlay: document.getElementById('debug-overlay').textContent };
});
if (shot) await page.screenshot({ path: shot });
console.log(JSON.stringify(info, null, 1));
for (const l of logs.slice(-15)) console.log('log:', l);
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('no console errors');
