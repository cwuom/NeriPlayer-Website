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
  assets: (repo === androidRepo ? ['neriplayer-arm64-v8a.apk', 'neriplayer-x86.apk'] : ['neriplayer-x64-setup.exe', 'neriplayer-arm64.dmg', 'neriplayer.deb']).map(name => ({
    name, browser_download_url: `https://example.test/${name}`, size: 10485760, digest: 'sha256:' + 'a'.repeat(64), download_count: 10,
  })),
});
const history = () => [
  { assets: [{ name: 'app.apk', download_count: 1200 }, { name: 'notes.txt', download_count: 999 }, { name: 'app.xz', download_count: 80 }] },
  { assets: [{ name: 'old.apk', download_count: 300 }, { name: 'archive.zip', download_count: 50 }, { name: 'install.sh', download_count: 100 }] },
];

function fixture({ io = true, cache = new Map(), historyResponse = async () => history() } = {}) {
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
    L: (zh, _en) => zh, env: { reduced: true }, swapText: (element, text) => { element.textContent = text; },
    onResize: callback => on('resize', callback),
    whenVisible(target, callback, _leave, margin) {
      if (!io) { callback(); return; }
      watchers.push({ targets: [target], margin: parseFloat(margin || '0'), callback: entries => { if (entries[0].isIntersecting) callback(); } });
    },
  };
  const localStorage = { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) };
  const fetch = async url => {
    requests.push(url);
    const repo = url.includes(desktopRepo) ? desktopRepo : androidRepo;
    const value = url.endsWith('/releases/latest') ? latest(repo) : url.includes('?per_page=100') ? await historyResponse(repo) : { stargazers_count: 4200, forks_count: 222 };
    return { ok: true, json: async () => value };
  };
  vm.runInNewContext(source, { window, IntersectionObserver: io ? IntersectionObserver : undefined, document: {}, navigator: { userAgent: 'Android', platform: 'Linux armv8' }, localStorage, fetch, setTimeout, clearTimeout });
  NP.github.init();
  return {
    NP, requests, cache, fields, panes, stubs, emit,
    intersections() {
      for (const watcher of watchers) watcher.callback(watcher.targets.map(target => ({ target, isIntersecting: target.getBoundingClientRect().top <= window.innerHeight + watcher.margin && target.getBoundingClientRect().bottom >= -watcher.margin })));
    },
    historyRequests: () => requests.filter(url => url.includes('?per_page=100')),
  };
}

async function settle() { await setImmediate(); await setImmediate(); }

test('the first screen keeps current releases and repository metadata without fetching history', async () => {
  const app = fixture();
  app.intersections();
  await settle();
  assert.equal(app.requests.includes(api + androidRepo + '/releases/latest'), true);
  assert.equal(app.requests.includes(api + desktopRepo + '/releases/latest'), true);
  assert.equal(app.fields.get('stars').textContent, '4.2k');
  assert.equal(app.fields.get('forks').textContent, '222');
  assert.equal(app.fields.get('tag').textContent, 'v1.2.3-abcdef0');
  assert.equal(app.fields.get('dtag').textContent, 'v2.3.4');
  assert.deepEqual(app.historyRequests(), []);
});

test('approaching active download statistics fetches only that platform and retains the total filtering', async () => {
  const app = fixture();
  app.stubs.android.top = app.stubs.desktop.top = 1000;
  app.intersections();
  await settle();
  app.intersections();
  await settle();
  assert.deepEqual(app.historyRequests(), [api + androidRepo + '/releases?per_page=100']);
  assert.equal(app.fields.get('count').textContent, '2');
  assert.equal(app.fields.get('downloads').textContent, '1.6k');
  assert.equal(app.fields.get('ddownloads').textContent, '—');
});

test('history cache keys and six hour expiry preserve cached totals and the one hundred release suffix', async () => {
  const cache = new Map([['np-site:latests', JSON.stringify({ t: Date.now(), v: { count: 12, total: 12345 } })]]);
  const app = fixture({ cache });
  app.stubs.android.top = 1000;
  app.intersections();
  await settle();
  assert.equal(app.historyRequests().length, 0);
  assert.equal(app.fields.get('count').textContent, '12');
  assert.equal(app.fields.get('downloads').textContent, '1.2 万');
  const expired = fixture({ cache: new Map([['np-site:latests', JSON.stringify({ t: Date.now() - 361 * 60000, v: { count: 12, total: 12345 } })]]), historyResponse: async () => Array.from({ length: 100 }, () => ({ assets: [{ name: 'app.apk', download_count: 1 }] })) });
  expired.stubs.android.top = 1000;
  expired.intersections();
  await settle();
  assert.deepEqual(expired.historyRequests(), [api + androidRepo + '/releases?per_page=100']);
  assert.equal(expired.fields.get('count').textContent, '100+');
  assert.equal(expired.fields.get('downloads').textContent, '100+');
});

test('explicit and proximity requests share one in flight history request', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const app = fixture({ historyResponse: () => pending });
  assert.equal(typeof app.NP.github.android.loadStats, 'function');
  const first = app.NP.github.android.loadStats(true);
  const second = app.NP.github.android.loadStats(true);
  app.stubs.android.top = 1000;
  app.intersections();
  assert.equal(first, second);
  assert.equal(app.historyRequests().length, 1);
  release(history());
  await first;
  await settle();
  assert.equal(app.fields.get('downloads').textContent, '1.6k');
});

test('without IntersectionObserver history still waits for nearby active statistics', async () => {
  const app = fixture({ io: false });
  await settle();
  assert.deepEqual(app.historyRequests(), []);
  app.stubs.android.top = app.stubs.desktop.top = 1000;
  app.emit('scroll');
  await settle();
  assert.deepEqual(app.historyRequests(), [api + androidRepo + '/releases?per_page=100']);
});

test('failed history waits for explicit user retry without a scroll retry loop', async () => {
  let attempts = 0;
  const app = fixture({ historyResponse: async () => { if (++attempts === 1) throw new Error('offline'); return history(); } });
  app.stubs.android.top = 1000;
  app.intersections();
  await settle();
  app.intersections();
  await settle();
  assert.equal(attempts, 1);
  await app.NP.github.android.loadStats(true);
  assert.equal(attempts, 2);
  assert.equal(app.fields.get('downloads').textContent, '1.6k');
});

let browser;
after(async () => { await browser?.close(); });

async function visit(path, run, { noIO = false, failHistoryOnce = false } = {}) {
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
  await page.route('https://api.github.com/**', route => {
    const url = route.request().url();
    requests.push(url);
    const repo = url.includes(desktopRepo) ? desktopRepo : androidRepo;
    if (failHistoryOnce && requests.filter(request => request.includes('?per_page=100')).length === 1 && url.includes('?per_page=100')) return route.fulfill({ status: 503, json: { message: 'unavailable' } });
    return route.fulfill({ json: url.endsWith('/releases/latest') ? latest(repo) : url.includes('?per_page=100') ? history() : { stargazers_count: 4200, forks_count: 222 } });
  });
  try {
    if (noIO) await page.addInitScript(() => { delete window.IntersectionObserver; });
    await page.goto((process.env.SITE_URL || 'http://localhost:6068') + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NP?.baseReady && NP.github.android.release && NP.github.desktop.release);
    await run(page, requests);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

for (const path of ['/', '/en/']) test(`${path} first paint skips history while CTA, keyboard, platform, links and SHA stay correct`, async () => {
  await visit(path, async (page, requests) => {
    await page.waitForTimeout(500);
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 0);
    assert.equal(await page.locator('#dlBtn').getAttribute('href'), 'https://example.test/neriplayer-arm64-v8a.apk');
    assert.equal(await page.locator('#dlSha code').getAttribute('title'), 'a'.repeat(64));
    await page.locator('[data-cta]').click();
    await page.waitForFunction(() => document.querySelector('[data-gh="downloads"]').textContent === '1.6k');
    assert.equal(requests.filter(url => url === api + androidRepo + '/releases?per_page=100').length, 1);
    await page.locator('#platA').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-gh="ddownloads"]').textContent === '1.6k');
    assert.equal(await page.locator('#platD').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#dlBtnD').getAttribute('href'), 'https://example.test/neriplayer-x64-setup.exe');
    assert.equal(await page.locator('#dlShaD code').getAttribute('title'), 'a'.repeat(64));
    await page.locator('#platA').click();
    await page.locator('#platD').click();
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 2);
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
    assert.deepEqual(requests.filter(url => url.includes('?per_page=100')), [api + androidRepo + '/releases?per_page=100']);
    assert.equal(await page.locator('[data-gh="ddownloads"]').textContent(), '—');
  }, { noIO });
});

test('a failed nearby history request retries once on explicit same platform selection', async () => {
  await visit('/', async (page, requests) => {
    await page.locator('[data-cta]').click();
    await page.waitForFunction(() => NP.github.android.statsFailed);
    await page.locator('#ticket .ticket__stub').scrollIntoViewIfNeeded();
    await page.evaluate(() => { window.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('scroll')); });
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 1);
    await page.locator('#platA').click();
    await page.waitForFunction(() => document.querySelector('[data-gh="downloads"]').textContent === '1.6k');
    await page.locator('#platA').click();
    assert.equal(requests.filter(url => url.includes('?per_page=100')).length, 2);
  }, { failHistoryOnce: true });
});
