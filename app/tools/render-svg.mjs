import { chromium } from 'playwright';
const [svg, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 900 }, deviceScaleFactor: 1 });
await page.goto('file://' + svg);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
