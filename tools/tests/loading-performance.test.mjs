import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6060';
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

for (const language of ['/', '/en/']) {
  test(`first-screen animation and menu remain usable while preview scripts load ${language}`, async () => {
    const browser = await chromium.launch({ executablePath, headless: true });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/__live', route => route.abort());
      await page.route(url => url.pathname.endsWith('/app-settings.js'), async route => { await pending; await route.continue(); });
      await page.goto(origin + language, { waitUntil: 'commit' });
      const ready = await page.waitForFunction(() => window.NP?.shellReady, null, { timeout: 2000 }).then(() => true, () => false);
      assert.equal(ready, true, 'a slow settings script must not delay the first-screen controls');
      await page.locator('#burger').tap();
      await page.locator('#menu a[href="#play"]').tap();
      assert.equal(await page.evaluate(() => !!NP.booted), false, 'the delayed preview has not initialized yet');
      await page.waitForFunction(() => document.querySelector('.hero').classList.contains('is-intro'));
      assert.equal(await page.locator('.crayon__art').evaluate(el => getComputedStyle(el).animationName), 'floaty', 'the illustration keeps its original animation');
      await page.locator('#burger').tap();
      assert.equal(await page.locator('#burger').getAttribute('aria-expanded'), 'true');
      await page.locator('#burger').tap();
      release();
      await page.waitForFunction(() => NP.booted);
      assert.equal(await page.locator('#themes [data-preview-readonly]').count(), 2);
      assert.deepEqual(errors, []);
    } finally { release(); await browser.close(); }
  });

  test(`preview styles do not block the first paint or change the settled header ${language}`, async () => {
    const browser = await chromium.launch({ executablePath, headless: true });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
      await page.route('**/__live', route => route.abort());
      await page.route('**/site.css', async route => { await pending; await route.continue(); });
      await page.goto(origin + language, { waitUntil: 'commit' });
      const painted = await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout: 2000 }).then(() => true, () => false);
      assert.equal(painted, true, 'a slow offscreen phone stylesheet must not block the page');
      const header = await page.locator('.nav').boundingBox();
      assert.ok(header && header.height > 0);
      release();
      await page.waitForFunction(() => NP.shellReady);
      await page.locator('#burger').tap();
      await page.locator('#menu a[href="#play"]').tap();
      await page.waitForFunction(() => NP.booted);
      const settled = await page.locator('.nav').boundingBox();
      assert.ok(Math.abs(settled.height - header.height) < 1, 'full styles preserve the first-screen geometry');
      assert.ok(await page.locator('#phPlay').evaluate(el => el.getBoundingClientRect().height > 0), 'the complete player still initializes');
    } finally { release(); await browser.close(); }
  });
}
