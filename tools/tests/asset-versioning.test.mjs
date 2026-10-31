import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const fontStyles = ['content-fonts', 'desktop-fonts', 'phone-fonts'];

async function fontStyleVersion() {
  const hash = createHash('sha256');
  for (const name of fontStyles) hash.update(name).update(await readFile(new URL('assets/css/' + name + '.css', root)));
  return hash.digest('hex').slice(0, 12);
}

for (const language of ['', 'en/']) {
  test(`hero script preloads match their deferred execution URLs ${language || 'zh/'}`, async () => {
    const html = await readFile(new URL(language + 'index.html', root), 'utf8');
    const preloads = [...html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*as="script"[^>]*>/g)];
    assert.equal(preloads.length, 2);
    for (const [, href] of preloads) {
      assert.match(href, /\/(core|motion)(?:\.min)?\.js\?v=[a-f0-9]{12}$/);
      const script = [...html.matchAll(/<script\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`src="${href}"`));
      assert.ok(script && /\bdefer(?:\s|=)/.test(script) && script.includes('fetchpriority="high"'), 'preloading must not change execution order or fetch a second script version');
      const asset = new URL(href, new URL(language + 'index.html', root));
      const version = asset.searchParams.get('v');
      asset.search = '';
      assert.equal(version, createHash('sha256').update(await readFile(asset)).digest('hex').slice(0, 12));
    }
  });

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

  test(`preloaded, deferred and noscript styles share their exact content version ${language || 'zh/'}`, async () => {
    const page = new URL(language + 'index.html', root);
    const html = await readFile(page, 'utf8');
    const references = [...html.matchAll(/href="((?:\.\.\/)?assets\/css\/site\.css[^"#]*)"/g)];
    assert.equal(references.length, 3);
    const expected = createHash('sha256').update(await readFile(new URL('assets/css/site.css', root))).digest('hex').slice(0, 12);
    for (const [, path] of references) assert.equal(new URL(path, page).searchParams.get('v'), expected, path);
  });

  test(`lazy font styles are bound to the HTML generation ${language || 'zh/'}`, async () => {
    const html = await readFile(new URL(language + 'index.html', root), 'utf8');
    const main = html.match(/<script\b[^>]*\bsrc="[^" ]*\/main(?:\.min)?\.js[^" ]*"[^>]*>/)?.[0];
    assert.ok(main);
    assert.equal(main.match(/data-font-version="([a-f0-9]+)"/)?.[1], await fontStyleVersion());
    const styles = [...html.matchAll(/href="((?:\.\.\/)?assets\/css\/(?:content|desktop|phone)-fonts\.css[^"#]*)"/g)];
    assert.equal(styles.length, 3, 'the no-script fallback must retain all complete font stylesheets');
    for (const [, href] of styles) assert.equal(new URL(href, new URL(language + 'index.html', root)).searchParams.get('v'), await fontStyleVersion());
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
      await page.route(url => url.pathname.endsWith('/site.css'), route => {
        if (new URL(route.request().url()).searchParams.has('v')) return route.continue();
        cached.push(route.request().url());
        return route.fulfill({ contentType: 'text/css', body: '.seg { position:static }' });
      });
      await page.route(url => /\/(?:content|desktop|phone)-fonts\.css$/.test(url.pathname), route => {
        if (new URL(route.request().url()).searchParams.has('v')) return route.continue();
        cached.push(route.request().url());
        return route.fulfill({ contentType: 'text/css', body: '/* stale font ranges */' });
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

test('the no-script page avoids cached font ranges from the older font families', async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const stale = [], requested = [];
    await page.route(url => /\/(?:content|desktop|phone)-fonts\.css$/.test(url.pathname), route => {
      requested.push(route.request().url());
      if (new URL(route.request().url()).searchParams.has('v')) return route.continue();
      stale.push(route.request().url());
      return route.fulfill({ contentType: 'text/css', body: '/* cached complementary font ranges */' });
    });
    await page.goto(origin, { waitUntil: 'load' });
    assert.equal(requested.length, 3);
    assert.deepEqual(stale, []);
    assert.doesNotMatch(await page.locator('.hero .lead').evaluate(el => getComputedStyle(el).fontFamily), /Critical/);
  } finally { await browser.close(); }
});

test('asset version generation is repeatable', async () => {
  const { versionAssetUrls } = await import('../version-assets.mjs');
  for (const language of ['', 'en/']) {
    const page = new URL(language + 'index.html', root);
    const html = await readFile(page, 'utf8');
    assert.equal(await versionAssetUrls(html, page), html);
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
    .replace(/\/((?:core|motion|github|demos|main))\.min\.js/g, '/$1.js')
    .replace(/type="application\/x-np-preview" data-np-module=/g, 'defer src=')
    .replace(/<script\b[^>]*\bsrc="assets\/js\/main\.js"[^>]*><\/script>/g, '')
    .replace('</head>', main + '\n</head>');
  assert.equal((html.match(/\bsrc="assets\/js\/main\.js"/g) || []).length, 1, 'the cached fixture must execute main once');
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
