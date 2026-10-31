import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

for (const language of ['', 'en/']) {
  test(`every script URL identifies its exact contents ${language || 'zh/'}`, async () => {
    const page = new URL(language + 'index.html', root);
    const html = await readFile(page, 'utf8');
    const references = [...html.matchAll(/(?:src|data-np-module)="((?:\.\.\/)?assets\/js\/[^"#]+)"/g)];
    assert.equal(references.length, 26);
    for (const [, path] of references) {
      const url = new URL(path, page);
      const version = url.searchParams.get('v');
      url.search = '';
      const expected = createHash('sha256').update(await readFile(url)).digest('hex').slice(0, 12);
      assert.equal(version, expected, path);
    }
  });

  test(`new HTML never consumes cached unversioned scripts ${language || 'zh/'}`, async () => {
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const errors = [], cached = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/__live', route => route.abort());
      await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
      await page.route(url => /\/assets\/js\/[^/]+\.js$/.test(url.pathname), route => {
        if (new URL(route.request().url()).searchParams.has('v')) return route.continue();
        cached.push(route.request().url());
        return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("stale cached script")' });
      });
      await page.goto(origin + '/' + language, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.NP?.shellReady);
      await page.evaluate(() => NP.preparePreviews());
      await page.waitForFunction(() => NP.booted);
      await page.locator('#devicePlay').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => !document.querySelector('#devicePlay').classList.contains('is-fontwait'));
      await page.locator('#phPlay .pg-cover [data-ph-toggle]').tap();
      await page.waitForFunction(() => NP.player.playing && !NP.player.muted);
      assert.deepEqual(cached, []);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

test('script version generation is repeatable', async () => {
  const { versionScriptUrls } = await import('../version-assets.mjs');
  for (const language of ['', 'en/']) {
    const page = new URL(language + 'index.html', root);
    const html = await readFile(page, 'utf8');
    assert.equal(await versionScriptUrls(html, page), html);
  }
});

test('cached HTML and core remain usable with a refreshed main script', async () => {
  const [currentHtml, currentCore] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('assets/js/core.js', root), 'utf8'),
  ]);
  // 复现旧页面的急切加载顺序与 core API，不依赖仓库外的历史快照服务
  const main = '<script defer src="assets/js/main.js"></script>';
  const html = currentHtml.replace(/\?v=[a-f0-9]+/g, '')
    .replace(/type="application\/x-np-preview" data-np-module=/g, 'defer src=')
    .replace(main, '').replace('</head>', main + '\n</head>');
  const core = currentCore + '\ndelete window.NP.retargetScroll; delete window.NP.smoothScroll.isAnimating;';
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('**/assets/js/core.js', route => route.fulfill({ contentType: 'text/javascript', body: core }));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.shellReady);
    assert.equal(await page.evaluate(() => typeof NP.retargetScroll), 'undefined', 'the fixture must expose the cached core API');
    await page.locator('#burger').tap();
    await page.locator('#menu a[href="#play"]').tap();
    await page.waitForFunction(() => NP.booted);
    await page.waitForTimeout(2600);
    await page.waitForFunction(() => !document.querySelector('#devicePlay').classList.contains('is-fontwait'));
    await page.locator('#phPlay .pg-cover [data-ph-toggle]').tap();
    await page.waitForFunction(() => NP.player.playing && !NP.player.muted);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
