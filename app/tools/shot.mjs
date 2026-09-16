// Usage: node tools/shot.mjs <out.png> [url] [width] [height] [script]
// Screenshots the running app. `script` is JS evaluated in the page before
// the shot (e.g. "window.__focus.goToPerspective('projects')").
import { chromium } from 'playwright';
const [out = '/tmp/shot.png', url = 'http://localhost:5180/', w = '1500', h = '980', script = ''] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__focus && window.__focus.snapshot, null, { timeout: 15000 });
if (script) { await page.evaluate(script); await page.waitForTimeout(300); }
await page.waitForTimeout(200);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
