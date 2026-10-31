import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

test('a hidden route avoids SVG measurement and initializes its original motion when revealed', async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.addInitScript(() => {
      const length = SVGPathElement.prototype.getTotalLength;
      window.routeLengthReads = 0;
      SVGPathElement.prototype.getTotalLength = function () {
        if (this.id === 'routeInk') routeLengthReads++;
        return length.call(this);
      };
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.shellReady && NP.baseReady);
    assert.equal(await page.locator('#route').isVisible(), false);
    assert.equal(await page.evaluate(() => routeLengthReads), 0, 'a hidden route must not force SVG layout during startup');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => routeLengthReads === 1);
    assert.equal(await page.locator('#route').isVisible(), true);
    const before = await page.locator('#routeCat').getAttribute('style');
    await page.evaluate(() => NP.scrollTo(1200, true));
    await page.waitForFunction(before => document.getElementById('routeCat').getAttribute('style') !== before, before);
    assert.equal(await page.evaluate(() => routeLengthReads), 1, 'the visible path length remains cached');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
