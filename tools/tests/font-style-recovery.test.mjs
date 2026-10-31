import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

async function open({ noIO = false, respond } = {}) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  await page.route(url => url.pathname.endsWith('/content-fonts.css'), route => {
    requests.push({ url: route.request().url(), time: Date.now() });
    return respond(route, requests.length);
  });
  await page.addInitScript(noIO => {
    window.__fontObserver = { entered: [], unobserved: [] };
    if (noIO) { delete window.IntersectionObserver; return; }
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = function (callback, options) {
      const fontObserver = options?.rootMargin === '200px 0px';
      const observer = new NativeObserver((entries, observer) => {
        if (fontObserver) entries.forEach(entry => {
          if (entry.isIntersecting) window.__fontObserver.entered.push(entry.target.id);
        });
        callback(entries, observer);
      }, options);
      if (fontObserver) {
        const unobserve = observer.unobserve.bind(observer);
        observer.unobserve = target => {
          window.__fontObserver.unobserved.push(target.id);
          unobserve(target);
        };
      }
      return observer;
    };
    window.IntersectionObserver.prototype = NativeObserver.prototype;
  }, noIO);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => NP.contentReady);
  return { page, errors, requests };
}

async function enter(page, id) {
  await page.locator('#' + id).evaluate(section => window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top + 100));
  await page.waitForFunction(id => window.__fontObserver.entered.includes(id), id);
}

test('a failed section stays observed and recovers after another section loads the fonts', async () => {
  let recover = false;
  const { page, errors, requests } = await open({ respond: route => recover ? route.continue() : route.fulfill({ status: 503, contentType: 'text/css', body: '' }) });
  try {
    await enter(page, 'download');
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('#download').evaluate(section => section.hasAttribute('data-fonts-ready')), false);
    assert.equal(await page.evaluate(() => window.__fontObserver.unobserved.includes('download')), false, 'a failed font preparation must not remove its section from the real observer');
    recover = true;
    await enter(page, 'play');
    await page.waitForFunction(() => document.querySelector('#play').hasAttribute('data-fonts-ready'));
    await enter(page, 'download');
    await page.waitForFunction(() => document.querySelector('#download').hasAttribute('data-fonts-ready'));
    assert.doesNotMatch(await page.locator('#download .lead').evaluate(section => getComputedStyle(section).fontFamily), /Critical/);
    assert.equal(requests.length, 4, 'the failed batch is bounded and later successful CSS is shared by both sections');
    assert.equal(await page.locator('link[data-content-font="desktop-fonts"]').count(), 1, 'a later batch must retain the already successful companion stylesheet');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('without IntersectionObserver one font stylesheet 503 automatically recovers for every section', async () => {
  const { page, errors, requests } = await open({ noIO: true, respond: (route, attempt) => attempt === 1 ? route.fulfill({ status: 503, contentType: 'text/css', body: '' }) : route.continue() });
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('.station,.footer')].every(section => section.hasAttribute('data-fonts-ready')), null, { timeout: 10000 });
    assert.equal(requests.length, 2, 'all sections and preview startup must share one retrying CSS promise');
    assert.equal(await page.locator('link[data-content-font="content-fonts"]').count(), 1, 'failed stylesheets must not remain in the document');
    const versions = requests.map(request => new URL(request.url).searchParams.get('v'));
    assert.ok(versions[0], 'retries must retain the current font CSS version');
    assert.equal(versions[1], versions[0]);
    assert.doesNotMatch(await page.locator('.footer__motto').evaluate(section => getComputedStyle(section).fontFamily), /Critical/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('persistent font stylesheet failures stop after three attempts and a new entry can retry', async () => {
  let recover = false;
  const { page, errors, requests } = await open({ respond: route => recover ? route.continue() : route.fulfill({ status: 503, contentType: 'text/css', body: '' }) });
  try {
    await enter(page, 'download');
    await page.waitForTimeout(1400);
    assert.equal(requests.length, 3);
    await page.waitForTimeout(800);
    assert.equal(requests.length, 3, 'a stationary failed section must not start another automatic batch');
    assert.equal(await page.locator('#download .lead').isVisible(), true, 'the fallback remains readable');
    assert.match(await page.locator('#download .lead').evaluate(section => getComputedStyle(section).fontFamily), /Critical/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#burger').tap();
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'), 'true');
    await page.locator('#burger').tap();
    assert.equal(await page.locator('.crayon__art').evaluate(node => getComputedStyle(node).animationName), 'floaty');
    recover = true;
    await enter(page, 'download');
    await page.waitForFunction(() => document.querySelector('#download').hasAttribute('data-fonts-ready'));
    assert.equal(requests.length, 4);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
