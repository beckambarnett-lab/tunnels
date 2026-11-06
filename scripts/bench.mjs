// Runs the built-in benchmark scene (?bench) and prints its result.
// usage: node scripts/bench.mjs [bugs=500] [res=1] [width=1280] [height=720]
import { launch, collectErrors, BASE, sleep } from './pw.mjs';
const [bugs = '500', res = '1', W = '1280', H = '720'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const errors = [];
collectErrors(page, errors);
await page.goto(`${BASE}?bench&bugs=${bugs}&res=${res}`);
let result = null;
for (let k = 0; k < 600 && !result; k++) {
  await sleep(1000);
  result = await page.evaluate(() => window.__tunnels?.game.bench?.result ?? null);
}
await page.screenshot({ path: 'scripts/out/bench.png' });
console.log(JSON.stringify(result, null, 1));
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
if (!result) process.exit(2);
