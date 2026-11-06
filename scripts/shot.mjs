// Screenshot after N seconds of *game* time. usage: node scripts/shot.mjs "<query>" <gameSecs> <out.png> [js to eval before shot]
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const [query = '', secs = '10', out = 'scripts/out/shot.png', js = ''] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
collectErrors(page, errors);
await page.goto(BASE + '?' + query);
for (let k = 0; k < 400; k++) {
  await sleep(500);
  const t = await page.evaluate(() => window.__tunnels?.world.time ?? 0);
  if (t >= +secs) break;
}
if (js) await page.evaluate(js);
await sleep(600);
await page.screenshot({ path: out });
const ov = await page.evaluate(() => document.getElementById('debug-overlay').textContent);
console.log(ov);
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
