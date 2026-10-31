import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import test, { after } from 'node:test';

const source = await readFile(new URL('../../assets/js/github.js', import.meta.url), 'utf8');
const api = 'https://api.github.com/repos/';
const androidRepo = 'cwuom/NeriPlayer';
const desktopRepo = 'cwuom/NeriPlayer-Desktop';
const latest = repo => ({
  tag_name: repo === androidRepo ? 'v1.2.3-abcdef0' : 'v2.3.4', published_at: '2026-10-29T00:00:00Z',
  html_url: `https://github.com/${repo}/releases/latest`, body: '',
  assets: (repo === androidRepo ? ['neriplayer-arm64-v8a.apk', 'neriplayer-armeabi-v7a.apk', 'neriplayer-x86_64.apk', 'neriplayer-x86.apk'] : ['neriplayer-x64-setup.exe', 'neriplayer-x64.msi', 'neriplayer-arm64.dmg', 'neriplayer-x64.dmg', 'neriplayer.deb', 'neriplayer.rpm', 'neriplayer.AppImage']).map(name => ({
    name, browser_download_url: `https://github.com/${repo}/releases/download/v1.2.3/${name}`, size: 10485760, digest: (name.includes('arm64') ? 'SHA256:' : 'sha256:') + 'a'.repeat(64), download_count: 10,
  })),
});
const history = () => [
  { assets: [{ name: 'app.apk', download_count: 1200 }, { name: 'notes.txt', download_count: 999 }, { name: 'app.xz', download_count: 80 }] },
  { assets: [{ name: 'old.apk', download_count: 300 }, { name: 'archive.zip', download_count: 50 }, { name: 'install.sh', download_count: 100 }] },
];

function snapshot() {
  return {
    schema: 1, fetched_at: '2026-10-31T00:00:00Z', repository: { stargazers_count: 4200, forks_count: 222 },
    android: { latest: latest(androidRepo), stats: { count: 2, total: 1550, limited: false } },
    desktop: { latest: latest(desktopRepo), stats: { count: 2, total: 1550, limited: false } },
  };
}

function fixture({ io = true, cache = new Map(), historyResponse = async () => history(), snapshotResponse = async () => snapshot(), en = false } = {}) {
  const requests = [], watchers = [], listeners = new Map(), fields = new Map();
  const on = (type, callback) => listeners.set(type, [...listeners.get(type) || [], callback]);
  const off = (type, callback) => listeners.set(type, (listeners.get(type) || []).filter(fn => fn !== callback));
  const emit = type => { for (const fn of listeners.get(type) || []) fn(); };
  const panes = { android: { active: true }, desktop: { active: false } };
  for (const pane of Object.values(panes)) pane.classList = { contains: name => name === 'is-on' && pane.active };
  const stubs = Object.fromEntries(Object.entries(panes).map(([name, pane]) => [name, {
    top: 3000, getBoundingClientRect() { return { top: this.top, bottom: this.top + 60, height: 60 }; }, closest: () => pane,
  }]));
  const download = { top: 1300, getBoundingClientRect() { return { top: this.top, bottom: 6000 }; } };
  for (const name of ['stars', 'forks', 'tag', 'date', 'rev', 'dtag', 'ddate', 'count', 'downloads', 'dcount', 'ddownloads']) {
    fields.set(name, { textContent: '—', closest: () => name.startsWith('d') && name !== 'date' && name !== 'downloads' ? stubs.desktop : stubs.android });
  }
  function $(selector) {
    if (selector === '#download') return download;
    const match = /^\[data-gh="([^"]+)"\]$/.exec(selector);
    return match ? fields.get(match[1]) || null : null;
  }
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.margin = parseFloat(options.rootMargin); this.targets = []; watchers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.targets = []; }
  }
  const window = { innerHeight: 844, addEventListener: on, removeEventListener: off };
  if (io) window.IntersectionObserver = IntersectionObserver;
  const NP = window.NP = {
    $, $$: selector => { const match = /^\[data-gh="([^"]+)"\]$/.exec(selector); return match && fields.has(match[1]) ? [fields.get(match[1])] : []; },
    en, L: (zh, english) => en ? english : zh, env: { reduced: true }, swapText: (element, text) => { element.textContent = text; },
    onResize: callback => on('resize', callback),
    whenVisible(target, callback, _leave, margin) {
      if (!io) { callback(); return; }
      watchers.push({ targets: [target], margin: parseFloat(margin || '0'), callback: entries => { if (entries[0].isIntersecting) callback(); } });
    },
  };
  const localStorage = { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) };
  const fetch = async url => {
    requests.push(url);
    if (url.includes('/assets/data/github.json')) return { ok: true, json: snapshotResponse };
    const repo = url.includes(desktopRepo) ? desktopRepo : androidRepo;
    const value = url.endsWith('/releases/latest') ? latest(repo) : url.includes('?per_page=100') ? await historyResponse(repo) : { stargazers_count: 4200, forks_count: 222 };
    return { ok: true, json: async () => value };
  };
  vm.runInNewContext(source, { window, IntersectionObserver: io ? IntersectionObserver : undefined, document: { currentScript: { src: 'https://site.test/assets/js/github.js?v=test' } }, navigator: { userAgent: 'Android', platform: 'Linux armv8' }, localStorage, fetch, setTimeout, clearTimeout });
  NP.github.init();
  return {
    NP, requests, cache, fields, panes, stubs, emit,
    intersections() {
      for (const watcher of watchers) watcher.callback(watcher.targets.map(target => ({ target, isIntersecting: target.getBoundingClientRect().top <= window.innerHeight + watcher.margin && target.getBoundingClientRect().bottom >= -watcher.margin })));
    },
    historyRequests: () => requests.filter(url => url.includes('?per_page=100')),
    snapshotRequests: () => requests.filter(url => url.includes('/assets/data/github.json')),
  };
}

async function settle() { await setImmediate(); await setImmediate(); }

test('the first screen keeps releases and repository metadata with one same-origin request and no GitHub connection', async () => {
  const app = fixture();
  app.intersections();
  await settle();
  assert.deepEqual(app.requests, ['https://site.test/assets/data/github.json']);
  assert.equal(app.fields.get('stars').textContent, '4.2k');
  assert.equal(app.fields.get('forks').textContent, '222');
  assert.equal(app.fields.get('tag').textContent, 'v1.2.3-abcdef0');
  assert.equal(app.fields.get('dtag').textContent, 'v2.3.4');
  assert.equal(app.fields.get('downloads').textContent, '—');
});

test('approaching active download statistics retains total filtering without another network request', async () => {
  const app = fixture();
  app.stubs.android.top = app.stubs.desktop.top = 1000;
  app.intersections();
  await settle();
  app.intersections();
  await settle();
  assert.deepEqual(app.historyRequests(), []);
  assert.equal(app.fields.get('count').textContent, '2');
  assert.equal(app.fields.get('downloads').textContent, '1.6k');
  assert.equal(app.fields.get('ddownloads').textContent, '—');
});

test('explicit and proximity requests share one in flight same-origin snapshot', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const app = fixture({ snapshotResponse: () => pending });
  const first = app.NP.github.android.loadStats(true);
  const second = app.NP.github.android.loadStats(true);
  app.stubs.android.top = 1000;
  app.intersections();
  assert.equal(first, second);
  assert.equal(app.snapshotRequests().length, 1);
  release(snapshot());
  await first;
  assert.equal(app.fields.get('downloads').textContent, '1.6k');
  assert.deepEqual(app.historyRequests(), []);
});

test('without IntersectionObserver statistics still wait for a nearby active ticket', async () => {
  const app = fixture({ io: false });
  await settle();
  assert.equal(app.fields.get('downloads').textContent, '—');
  app.stubs.android.top = app.stubs.desktop.top = 1000;
  app.emit('scroll');
  await settle();
  assert.equal(app.fields.get('downloads').textContent, '1.6k');
  assert.equal(app.fields.get('ddownloads').textContent, '—');
  assert.deepEqual(app.historyRequests(), []);
});

test('an invalid or unavailable snapshot uses the last validated cache without an external request', async () => {
  const incomplete = snapshot();
  incomplete.desktop.latest.assets = [];
  const invalidSHA = snapshot();
  invalidSHA.android.latest.assets[0].digest = 'sha256:broken';
  for (const value of [null, { schema: 1 }, { ...snapshot(), desktop: null }, incomplete, invalidSHA]) {
    const cache = new Map([['np-site:github-snapshot', JSON.stringify({ t: 1, v: snapshot() })]]);
    const app = fixture({ cache, snapshotResponse: async () => { if (value === null) throw new Error('offline'); return value; } });
    app.stubs.android.top = 1000;
    app.intersections();
    await settle();
    assert.equal(app.fields.get('tag').textContent, 'v1.2.3-abcdef0');
    assert.equal(app.fields.get('downloads').textContent, '1.6k');
    assert.equal(cache.get('np-site:github-snapshot'), JSON.stringify({ t: 1, v: snapshot() }), 'bad data must not replace the valid cache');
    assert.deepEqual(app.historyRequests(), []);
    assert.equal(app.requests.some(url => url.startsWith(api)), false);
  }
});

test('unknown SHA values and omitted formats keep the available official release usable', async () => {
  for (const checksum of [undefined, null, '']) {
    const value = snapshot();
    for (const key of ['android', 'desktop']) {
      value[key].latest.assets = value[key].latest.assets.slice(0, 1);
      value[key].latest.assets[0].digest = checksum;
    }
    const app = fixture({ snapshotResponse: async () => value });
    await settle();
    assert.equal(app.fields.get('tag').textContent, 'v1.2.3-abcdef0');
    assert.equal(app.fields.get('dtag').textContent, 'v2.3.4');
    assert.equal(app.NP.github.android.release.assets['arm64-v8a'].sha, '');
    assert.equal(app.NP.github.desktop.release.assets['win-exe'].sha, '');
    assert.equal(app.requests.length, 1);
  }
});

test('legacy release caches survive a failed same-origin request without a default GitHub retry', async () => {
  const cachedAndroid = latest(androidRepo), cachedDesktop = latest(desktopRepo);
  for (const asset of cachedAndroid.assets) delete asset.digest;
  for (const asset of cachedDesktop.assets) asset.digest = null;
  const cache = new Map([
    ['np-site:latest', JSON.stringify({ t: 1, v: cachedAndroid })],
    ['np-site:d-latest', JSON.stringify({ t: 1, v: cachedDesktop })],
    ['np-site:repo', JSON.stringify({ t: 1, v: { stargazers_count: 1234, forks_count: 56 } })],
    ['np-site:latests', JSON.stringify({ t: 1, v: { count: 12, total: 12345 } })],
  ]);
  const app = fixture({ cache, snapshotResponse: async () => { throw new Error('offline'); } });
  app.stubs.android.top = 1000;
  app.intersections();
  await settle();
  assert.equal(app.fields.get('tag').textContent, 'v1.2.3-abcdef0');
  assert.equal(app.NP.github.android.release.assets['arm64-v8a'].sha, '');
  assert.equal(app.NP.github.desktop.release.assets['win-exe'].sha, '');
  assert.equal(app.fields.get('stars').textContent, '1.2k');
  assert.equal(app.fields.get('downloads').textContent, '1.2 万');
  assert.equal(app.requests.length, 1);
});

test('a failed snapshot stops automatic retries; only an explicit retry may fetch history once', async () => {
  let attempts = 0;
  const app = fixture({ snapshotResponse: async () => { throw new Error('offline'); }, historyResponse: async () => { if (++attempts === 1) throw new Error('offline'); return history(); } });
  app.stubs.android.top = 1000;
  app.intersections();
  await settle();
  app.intersections();
  await settle();
  assert.equal(attempts, 0);
  await app.NP.github.android.loadStats(true);
  assert.equal(attempts, 1);
  app.intersections();
  await settle();
  assert.equal(attempts, 1);
  await app.NP.github.android.loadStats(true);
  assert.equal(attempts, 2);
  assert.equal(app.fields.get('downloads').textContent, '1.6k');
});

test('the explicit API fallback preserves the six hour cache and one hundred release suffix', async () => {
  const cache = new Map([['np-site:latests', JSON.stringify({ t: Date.now(), v: { count: 12, total: 12345 } })]]);
  const app = fixture({ cache, snapshotResponse: async () => { throw new Error('offline'); } });
  await app.NP.github.android.loadStats(true);
  assert.deepEqual(app.historyRequests(), []);
  assert.equal(app.fields.get('downloads').textContent, '1.2 万');
  const expired = fixture({ cache: new Map([['np-site:latests', JSON.stringify({ t: Date.now() - 361 * 60000, v: { count: 12, total: 12345 } })]]), snapshotResponse: async () => { throw new Error('offline'); }, historyResponse: async () => Array.from({ length: 100 }, () => ({ assets: [{ name: 'app.apk', download_count: 1 }] })) });
  await expired.NP.github.android.loadStats(true);
  assert.deepEqual(expired.historyRequests(), [api + androidRepo + '/releases?per_page=100']);
  assert.equal(expired.fields.get('count').textContent, '100+');
  assert.equal(expired.fields.get('downloads').textContent, '100+');
});

let browser;
after(async () => { await browser?.close(); });

async function visit(path, run, { noIO = false, failSnapshot = false, apiFallback = false, snapshotData = snapshot() } = {}) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('**/assets/data/github.json', route => {
    requests.push(route.request().url());
    return failSnapshot ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: snapshotData });
  });
  await page.route('https://github.com/**', route => route.abort());
  await page.route('https://api.github.com/**', route => {
    const url = route.request().url();
    requests.push(url);
    if (!apiFallback) return route.abort();
    const attempts = requests.filter(request => request.includes('?per_page=100')).length;
    return attempts === 1 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: history() });
  });
  try {
    if (noIO) await page.addInitScript(() => { delete window.IntersectionObserver; });
    await page.goto((process.env.SITE_URL || 'http://localhost:6068') + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(failed => window.NP?.baseReady && NP.github.android && (failed || NP.github.android.release && NP.github.desktop.release), failSnapshot);
    await run(page, requests);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

for (const path of ['/', '/en/']) test(`${path} blocked GitHub still preserves CTA, keyboard, every installer, sizes, SHA and statistics`, async () => {
  await visit(path, async (page, requests) => {
    await page.waitForTimeout(500);
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 0);
    assert.equal(await page.locator('#dlBtn').getAttribute('href'), 'https://github.com/' + androidRepo + '/releases/download/v1.2.3/neriplayer-arm64-v8a.apk');
    assert.equal(await page.locator('#dlSha code').getAttribute('title'), 'a'.repeat(64));
    await page.locator('[data-cta]').click();
    await page.waitForFunction(() => document.querySelector('[data-gh="downloads"]').textContent === '1.6k');
    assert.equal(requests.filter(url => url.startsWith(api)).length, 0);
    await page.locator('#platA').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-gh="ddownloads"]').textContent === '1.6k');
    assert.equal(await page.locator('#platD').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#dlBtnD').getAttribute('href'), 'https://github.com/' + desktopRepo + '/releases/download/v1.2.3/neriplayer-x64-setup.exe');
    assert.equal(await page.locator('#dlShaD code').getAttribute('title'), 'a'.repeat(64));
    await page.locator('#platA').click();
    await page.locator('#platD').click();
    assert.equal(requests.filter(url => url.startsWith(api)).length, 0);
    for (const [os, packages] of Object.entries({ win: ['win-exe', 'win-msi'], mac: ['mac-arm', 'mac-x64'], linux: ['linux-appimage', 'linux-deb', 'linux-rpm'] })) {
      await page.locator(`[data-dos-seg] [data-dos="${os}"]`).click();
      for (const pkg of packages) {
        await page.locator(`label:has(input[name="dpkg"][value="${pkg}"])`).click();
        assert.equal(await page.locator('#dlBtnD').getAttribute('data-key'), pkg);
        const href = await page.locator('#dlBtnD').getAttribute('href');
        assert.ok(href.startsWith('https://github.com/' + desktopRepo + '/releases/download/'), pkg);
        assert.equal(await page.locator('#dlShaD code').getAttribute('title'), 'a'.repeat(64));
        assert.ok((await page.locator('#dlSizeD').textContent()).includes('10.0 MB'));
      }
    }
    await page.locator('#platA').click();
    for (const abi of ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86']) {
      await page.locator(`label:has(input[name="abi"][value="${abi}"])`).click();
      assert.equal(await page.locator('#dlBtn').getAttribute('href'), `https://github.com/${androidRepo}/releases/download/v1.2.3/neriplayer-${abi}.apk`);
      assert.equal(await page.locator('#dlSha code').getAttribute('title'), 'a'.repeat(64));
    }
    assert.equal(requests.filter(url => url.includes('/assets/data/github.json')).length, 1);
  });
});

for (const noIO of [false, true]) test(`native scrolling loads only nearby active statistics${noIO ? ' without IntersectionObserver' : ''}`, async () => {
  await visit('/', async (page, requests) => {
    await page.waitForTimeout(500);
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 0);
    await page.evaluate(() => {
      const stub = document.querySelector('#ticket .ticket__stub');
      window.scrollTo(0, stub.getBoundingClientRect().top + window.scrollY - innerHeight - 120);
    });
    await page.waitForFunction(() => document.querySelector('[data-gh="downloads"]').textContent === '1.6k');
    assert.equal(await page.locator('#ticket .ticket__stub').evaluate(element => element.getBoundingClientRect().top > innerHeight), true);
    assert.deepEqual(requests.filter(url => url.startsWith(api)), []);
    assert.equal(await page.locator('[data-gh="ddownloads"]').textContent(), '—');
  }, { noIO });
});

test('a failed snapshot uses official release pages and permits a bounded explicit statistics retry', async () => {
  await visit('/', async (page, requests) => {
    await page.waitForTimeout(300);
    assert.equal(requests.filter(url => url.startsWith(api)).length, 0);
    assert.equal(await page.locator('#dlBtn').getAttribute('href'), 'https://github.com/' + androidRepo + '/releases/latest');
    assert.equal(await page.locator('#dlBtnD').getAttribute('href'), 'https://github.com/' + desktopRepo + '/releases/latest');
    await page.locator('#ticket .ticket__stub').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => NP.github.android.statsFailed);
    await page.evaluate(() => { window.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('scroll')); });
    assert.equal(requests.filter(url => url.startsWith(api)).length, 0);
    await page.locator('#platA').click();
    await page.waitForFunction(() => NP.github.android.statsFailed);
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 1);
    await page.locator('#platA').click();
    await page.waitForFunction(() => document.querySelector('[data-gh="downloads"]').textContent === '1.6k');
    await page.locator('#platA').click();
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 2);
  }, { failSnapshot: true, apiFallback: true });
});

for (const path of ['/', '/en/']) test(`${path} a damaged same-origin snapshot keeps the last valid offline cache`, async () => {
  await visit(path, async (page, requests) => {
    await page.route('**/assets/data/github.json', route => route.fulfill({ json: { ...snapshot(), desktop: { latest: {} } } }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.github.android?.release && NP.github.desktop?.release);
    assert.equal(await page.locator('#dlBtn').getAttribute('href'), `https://github.com/${androidRepo}/releases/download/v1.2.3/neriplayer-arm64-v8a.apk`);
    assert.equal(await page.locator('#dlSha code').getAttribute('title'), 'a'.repeat(64));
    await page.locator('#platD').click();
    await page.waitForFunction(() => document.querySelector('[data-gh="ddownloads"]').textContent === '1.6k');
    assert.equal(await page.locator('#dlBtnD').getAttribute('href'), `https://github.com/${desktopRepo}/releases/download/v1.2.3/neriplayer-x64-setup.exe`);
    assert.equal(requests.filter(url => url.startsWith(api)).length, 0);
  });
});

for (const path of ['/', '/en/']) test(`${path} unknown SHA is hidden and missing formats fall back to the official release page`, async () => {
  const data = snapshot();
  for (const key of ['android', 'desktop']) {
    data[key].latest.assets = data[key].latest.assets.slice(0, 1);
    data[key].latest.assets[0].digest = null;
  }
  await visit(path, async (page, requests) => {
    assert.equal(await page.locator('#dlBtn').getAttribute('href'), `https://github.com/${androidRepo}/releases/download/v1.2.3/neriplayer-arm64-v8a.apk`);
    assert.equal(await page.locator('#dlSha').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('#dlShaD').getAttribute('aria-hidden'), 'true');
    await page.locator('[data-cta]').click();
    await page.locator('label:has(input[name="abi"][value="x86"])').click();
    assert.equal(await page.locator('#dlBtn').getAttribute('href'), `https://github.com/${androidRepo}/releases/latest`);
    assert.equal(await page.locator('#dlBtn').getAttribute('target'), '_blank');
    await page.locator('#platD').click();
    assert.equal(await page.locator('#dlBtnD').getAttribute('href'), `https://github.com/${desktopRepo}/releases/download/v1.2.3/neriplayer-x64-setup.exe`);
    await page.locator('[data-dos-seg] [data-dos="mac"]').click();
    assert.equal(await page.locator('#dlBtnD').getAttribute('href'), `https://github.com/${desktopRepo}/releases/latest`);
    assert.equal(await page.locator('#dlBtnD').getAttribute('target'), '_blank');
    assert.equal(requests.filter(url => url.startsWith(api)).length, 0);
  }, { snapshotData: data });
});
