import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

for (const language of ['/', '/en/']) {
  test(`a stylesheet 503 recovers while the first paint, menu and animation stay available ${language}`, async t => {
    const browser = await chromium.launch({ executablePath, headless: true });
    let release;
    const recovery = new Promise(resolve => { release = resolve; });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      let attempts = 0;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/__live', route => route.abort());
      await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
      await page.route(url => url.pathname.endsWith('/site.css'), async route => {
        if (++attempts === 1) { await route.fulfill({ status: 503, body: '', contentType: 'text/css' }); return; }
        await recovery;
        await route.continue();
      });
      await page.goto(origin + language, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.NP?.shellReady && performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout: 2500 });
      assert.equal(await page.evaluate(() => !!NP.baseReady), false, 'a failed CSS request must not be mistaken for applied styles');
      await page.locator('#burger').tap();
      assert.equal(await page.locator('#burger').getAttribute('aria-expanded'), 'true');
      await page.locator('#burger').tap();
      assert.equal(await page.locator('.crayon__art').evaluate(node => getComputedStyle(node).animationName), 'floaty');
      release();
      await page.waitForFunction(() => NP.baseReady);
      assert.equal(attempts, 2);
      assert.equal(await page.locator('html.np-style-error').count(), 0);
      await page.locator('#burger').tap();
      await page.locator('#menu a[href="#play"]').tap();
      await page.waitForFunction(() => NP.booted);
      assert.ok(await page.locator('#phPlay').evaluate(node => node.getBoundingClientRect().height > 0));
      assert.equal(await page.locator('link[data-deferred-style]').evaluateAll(links => links.every(link => link.sheet && link.media === 'all')), true);
      assert.deepEqual(errors, []);
      t.diagnostic(JSON.stringify({ language, attempts }));
    } finally { release(); await browser.close(); }
  });
}

test('persistent stylesheet failures stop after three requests and do not deadlock first-screen controls', async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let attempts = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.route(url => url.pathname.endsWith('/site.css'), route => { attempts++; return route.fulfill({ status: 503, body: '', contentType: 'text/css' }); });
    await page.goto(origin, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.NP?.shellReady && NP.baseReady && document.documentElement.classList.contains('np-style-error'));
    assert.equal(attempts, 3);
    await page.waitForTimeout(350);
    assert.equal(attempts, 3, 'exhausted retries must not keep issuing stylesheet downloads');
    await page.locator('#burger').tap();
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.crayon__art').evaluate(node => getComputedStyle(node).animationName), 'floaty');
    assert.deepEqual(errors, []);
    t.diagnostic(JSON.stringify({ attempts }));
  } finally { await browser.close(); }
});
