import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

test('a transient preview module 503 recovers with ordered execution and working player controls', async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [], consoleErrors = [], requests = new Map();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /Uncaught|ReferenceError|TypeError|SyntaxError/.test(message.text())) consoleErrors.push(message.text()); });
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.addInitScript(() => { window.previewModuleRuns = []; });
    await page.route(url => /\/assets\/js\/[^/]+\.js$/.test(url.pathname), async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      const count = (requests.get(name) || 0) + 1;
      requests.set(name, count);
      if (name === 'app-settings.js' && count === 1) { await route.fulfill({ status: 503, body: '', contentType: 'text/javascript' }); return; }
      const response = await route.fetch();
      await route.fulfill({ response, body: 'window.previewModuleRuns.push(' + JSON.stringify(name) + ');\n' + await response.text() });
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.baseReady);
    const expected = await page.locator('script[data-np-module]').evaluateAll(entries => entries.map(entry => new URL(entry.getAttribute('data-np-module'), location.href).pathname.split('/').pop()));
    await page.evaluate(() => { previewModuleRuns.length = 0; });
    await page.locator('#burger').tap();
    await page.locator('#menu a[href="#play"]').tap();
    await page.waitForFunction(() => NP.booted && !document.querySelector('#devicePlay').classList.contains('is-fontwait'));
    assert.deepEqual(await page.evaluate(() => previewModuleRuns), expected, 'recovery must execute every module once in its declared dependency order');
    assert.ok(requests.get('app-settings.js') >= 2 && requests.get('app-settings.js') <= 3, 'the 503 must recover within the bounded network budget');
    t.diagnostic(JSON.stringify({ recoveredModuleRequests: requests.get('app-settings.js'), executedModules: expected.length }));
    assert.equal(await page.locator('html.np-preview-error').count(), 0);
    await page.locator('#phPlay .pg-cover [data-ph-toggle]').tap();
    await page.waitForFunction(() => NP.player.playing && !NP.player.muted);
    await page.locator('#phPlay .pg-cover [data-ph-toggle]').tap();
    await page.waitForFunction(() => !NP.player.playing);
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
});

test('a persistently unavailable first module has at most three real requests including its preload', async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let firstModule, attempts = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.baseReady);
    firstModule = await page.locator('script[data-np-module]').first().getAttribute('data-np-module');
    await page.route('**/' + firstModule, route => { attempts++; return route.fulfill({ status: 503, body: '', contentType: 'text/javascript' }); });
    await page.evaluate(() => NP.preparePreviews().catch(() => {}));
    await page.waitForFunction(() => document.documentElement.classList.contains('np-preview-error'));
    await page.waitForTimeout(1600);
    assert.ok(attempts >= 1 && attempts <= 3, `a failed preload must share the retry budget; actual requests=${attempts}`);
    t.diagnostic(JSON.stringify({ firstModule, attempts }));
    assert.equal(await page.evaluate(() => !!NP.booted), false);
    await page.evaluate(() => NP.preparePreviews().catch(() => {}));
    const exhausted = attempts;
    await page.waitForTimeout(350);
    assert.equal(attempts, exhausted);
    await page.locator('#burger').tap();
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'), 'true', 'failed preview modules must leave the first-screen menu usable');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
