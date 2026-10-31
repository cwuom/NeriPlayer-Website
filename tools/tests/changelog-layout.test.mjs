import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';

for (const failed of [false, true]) test(`changelog ${failed ? 'fallback' : 'release'} updates do not synchronously measure rebuilt lists`, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1350, height: 940 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => {
      if (failed) return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      return route.fulfill({ json: { tag_name: 'v1.2.3', html_url: 'https://github.com/cwuom/NeriPlayer/releases/latest', body: '- abcdef0 Preserve release notes', assets: [], stargazers_count: 42 } });
    });
    await page.addInitScript(() => {
      window.changelogLayoutReads = 0;
      const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
        if (this.matches('.changes')) window.changelogLayoutReads++;
        return width.get.call(this);
      } });
    });
    await page.goto(origin);
    await page.waitForFunction(failed => ['#dlChanges', '#dlChangesD'].every(id => {
      const list = document.querySelector(id);
      return list && !list.classList.contains('is-swap') && list.textContent.includes(failed ? 'GitHub API' : 'Preserve release notes');
    }), failed);
    assert.equal(await page.evaluate(() => changelogLayoutReads), 0, 'rebuilding release notes must leave layout to the browser rendering step');
    await page.locator('#dlChanges').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#dlChanges a').last().getAttribute('href'), 'https://github.com/cwuom/NeriPlayer/releases' + (failed ? '' : '/latest'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
