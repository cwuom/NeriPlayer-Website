import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6060';

test('offscreen simulator interiors defer rendering without changing the page or visible player', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      await page.route('**/__live', route => route.abort());
      await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
      await page.goto(origin);
      await page.waitForFunction(() => window.NP?.baseReady);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await page.evaluate(async () => {
        const screens = [...document.querySelectorAll('.device__screen, .dwin__screen, .tabdev__screen, .desk__screen')];
        const geometry = () => [document.documentElement.scrollHeight, ...screens.flatMap(el => { const r = el.getBoundingClientRect(); return [r.width, r.height, r.top]; })];
        const before = geometry();
        const skipped = screens.filter(el => !el.firstElementChild.checkVisibility({ contentVisibilityAuto: true })).length;
        screens.forEach(el => { el.style.contentVisibility = 'visible'; });
        const after = geometry();
        screens.forEach(el => { el.style.removeProperty('content-visibility'); });
        return { before, after, skipped, total: screens.length };
      });
      assert.ok(result.total > 0);
      assert.equal(result.skipped, result.total, 'distant simulator contents should not be laid out or painted at startup');
      assert.deepEqual(result.after, result.before, 'skipping fixed simulator interiors must preserve every outer rectangle and page height');
      await page.locator('#devicePlay').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => NP.booted);
      assert.equal(await page.locator('#devicePlay .device__screen').evaluate(el => el.checkVisibility({ contentVisibilityAuto: true })), true);
      assert.equal(await page.locator('#devicePlay').evaluate(el => el.classList.contains('is-fontwait')), false);
      assert.equal(await page.locator('.crayon__art').evaluate(el => getComputedStyle(el).animationName), 'floaty');
      await page.close();
    }
  } finally { await browser.close(); }
});
