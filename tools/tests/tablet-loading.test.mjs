import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.env.SITE_URL || 'http://localhost:6060';
const evidence = process.env.TABLET_ARTIFACTS;
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  if (evidence) await mkdir(evidence, { recursive: true });
});
after(async () => { await browser?.close(); });

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function visit(path, run, setup = async () => {}, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  try {
    await setup(page);
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return window.NP?.booted; });
    await page.locator('#tabStage').scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

async function ready(page, index) {
  await page.waitForFunction(index => {
    const image = document.querySelector(`#tabStage [data-shot="${index}"] img`);
    return image.complete && image.naturalWidth > 0;
  }, index);
}

async function click(page, index) {
  await page.locator(`#tabStage [data-tab="${index}"]`).click();
}

async function selected(page) {
  return page.locator('#tabStage [role="tab"][aria-selected="true"]').getAttribute('data-tab');
}

async function capture(page, name) {
  if (evidence) await page.locator('#tabStage').screenshot({ path: join(evidence, name + '.png') });
}

for (const path of ['/', '/en/']) {
  test(`${path} a delayed tablet screenshot keeps the previous picture and annotations until ready`, async () => {
    const settings = gate();
    let requested = false;
    try {
      await visit(path, async page => {
        await ready(page, 0);
        await click(page, 3);
        await page.waitForTimeout(2400);
        await capture(page, path === '/' ? 'delayed-before-release-zh' : 'delayed-before-release-en');
        assert.equal(requested, true, 'the requested hidden lazy image must start loading');
        assert.equal(await selected(page), '0', 'the old screenshot must remain selected while the new bytes are unavailable');
        assert.equal(await page.locator('#tabScreen').getAttribute('aria-busy'), 'true');
        const old = await page.locator('#tabStage [data-shot="0"]').evaluate(node => ({ visibility: getComputedStyle(node).visibility, clip: getComputedStyle(node).clipPath }));
        assert.equal(old.visibility, 'visible');
        assert.equal(old.clip, 'inset(0px)');
        settings.release();
        await page.waitForFunction(() => document.querySelector('#tabT3').getAttribute('aria-selected') === 'true');
        await ready(page, 3);
        assert.equal(await page.locator('#tabScreen').getAttribute('aria-busy'), 'false');
        await page.waitForTimeout(1150);
        assert.equal(await page.locator('#tabStage .tabshot.is-prev, #tabStage .tabshot.is-wipe').count(), 0);
        await capture(page, path === '/' ? 'delayed-ready-zh' : 'delayed-ready-en');
      }, async page => {
        await page.route('**/assets/img/tablet/set-*.jpg', async route => {
          requested = true;
          await settings.promise;
          await route.continue().catch(() => {});
        });
      });
    } finally { settings.release(); }
  });
}

test('rapid tablet requests commit only the latest ready image and ignore stale completions', async () => {
  const playing = gate();
  const settings = gate();
  try {
    await visit('/', async page => {
      await ready(page, 0);
      await click(page, 1);
      await click(page, 3);
      assert.equal(await selected(page), '0');
      settings.release();
      await page.waitForFunction(() => document.querySelector('#tabT3').getAttribute('aria-selected') === 'true');
      playing.release();
      await ready(page, 1);
      await page.waitForTimeout(1200);
      assert.equal(await selected(page), '3', 'an older network completion must not overwrite the most recent tab request');
      await click(page, 1);
      await page.waitForTimeout(100);
      await click(page, 2);
      await page.waitForTimeout(100);
      await click(page, 0);
      await page.waitForTimeout(1200);
      assert.equal(await selected(page), '0');
      assert.equal(await page.locator('#tabStage .tabshot.is-on').count(), 1);
      assert.equal(await page.locator('#tabStage .tabshot.is-prev, #tabStage .tabshot.is-wipe').count(), 0);
      await capture(page, 'rapid-tabs-settled');
    }, async page => {
      await page.route('**/assets/img/tablet/np-zh.jpg', async route => { await playing.promise; await route.continue().catch(() => {}); });
      await page.route('**/assets/img/tablet/set-zh.jpg', async route => { await settings.promise; await route.continue().catch(() => {}); });
    });
  } finally { playing.release(); settings.release(); }
});

test('a failed tablet screenshot keeps the current screen and a second click retries it', async () => {
  let attempts = 0;
  await visit('/', async page => {
    await ready(page, 0);
    await click(page, 3);
    await page.waitForTimeout(1250);
    assert.equal(await selected(page), '0');
    assert.equal(await page.locator('#tabScreen').getAttribute('aria-busy'), 'false');
    await capture(page, 'failed-keeps-current');
    await click(page, 3);
    await page.waitForFunction(() => document.querySelector('#tabT3').getAttribute('aria-selected') === 'true');
    await ready(page, 3);
    assert.ok(attempts >= 2, 'a failed source must be requested again after retry');
  }, async page => {
    await page.route('**/assets/img/tablet/set-zh.jpg', route => ++attempts === 1 ? route.abort('failed') : route.continue());
  });
});

test('a decoded tablet picture commits only after decode resolves, including reduced motion', async () => {
  await visit('/', async page => {
    await ready(page, 0);
    await click(page, 3);
    await ready(page, 3);
    await page.waitForTimeout(100);
    assert.equal(await selected(page), '0', 'complete image bytes do not prove the next frame is decoded');
    await page.evaluate(() => window.releaseTabletDecode());
    await page.waitForFunction(() => document.querySelector('#tabT3').getAttribute('aria-selected') === 'true');
    assert.equal(await page.locator('#tabScreen').getAttribute('aria-busy'), 'false');
  }, async page => {
    await page.addInitScript(() => {
      const decode = HTMLImageElement.prototype.decode;
      const pending = new Promise(resolve => { window.releaseTabletDecode = resolve; });
      HTMLImageElement.prototype.decode = function () {
        return decode.call(this).then(() => this.src.includes('/tablet/set-') ? pending : undefined);
      };
    });
  }, 'reduce');
});

test('the initial tablet image hides its annotations until real pixels are available', async () => {
  const home = gate();
  try {
    await visit('/', async page => {
      await page.waitForTimeout(1000);
      const pin = await page.locator('#tabStage [data-shot="0"] .tabpin').first().evaluate(node => ({ visibility: getComputedStyle(node).visibility, opacity: getComputedStyle(node).opacity }));
      assert.ok(pin.visibility === 'hidden' || Number(pin.opacity) === 0, 'unloaded screenshots must not show floating annotation numbers on a black screen');
      assert.equal(await page.locator('#tabScreen').getAttribute('aria-busy'), 'true');
      home.release();
      await ready(page, 0);
      await page.waitForFunction(() => document.querySelector('#tabScreen').getAttribute('aria-busy') === 'false');
    }, async page => {
      await page.route('**/assets/img/tablet/home-zh.jpg', async route => { await home.promise; await route.continue().catch(() => {}); });
    });
  } finally { home.release(); }
});

test('tablet screenshots remain lazy while distant and warm the next screen when approached', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const images = [];
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  page.on('request', request => { if (request.url().includes('/img/tablet/')) images.push(request.url()); });
  try {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return window.NP?.booted; });
    await page.waitForTimeout(250);
    assert.equal(images.length, 0, 'the distant tablet section must not eagerly download screenshots at startup');
    await page.locator('#tabStage').scrollIntoViewIfNeeded();
    await ready(page, 0);
    await ready(page, 1);
    assert.ok(images.some(url => url.endsWith('/home-zh.jpg')));
    assert.ok(images.some(url => url.endsWith('/np-zh.jpg')));
  } finally { await page.close(); }
});

test('ready tablet screens retain the wipe, image settling and linked annotation hover', async () => {
  await visit('/', async page => {
    await ready(page, 0);
    await ready(page, 1);
    await click(page, 1);
    await page.waitForFunction(() => document.querySelector('#tabT1').getAttribute('aria-selected') === 'true');
    await page.waitForTimeout(100);
    const moving = await page.locator('#tabStage [data-shot="1"]').evaluate(node => ({
      clip: getComputedStyle(node).clipPath,
      scale: Number(getComputedStyle(node.querySelector('img')).scale),
      edge: getComputedStyle(node, '::after').animationName,
      previous: getComputedStyle(node.parentElement.querySelector('[data-shot="0"]')).visibility,
    }));
    assert.notEqual(moving.clip, 'inset(0px)', 'the screenshot must still wipe in rather than jump directly to its final frame');
    assert.ok(moving.scale > 1 && moving.scale < 1.06, 'the incoming image must keep its settling motion');
    assert.equal(moving.edge, 'tabedge');
    assert.equal(moving.previous, 'visible');
    await page.waitForTimeout(1700);
    const settled = await page.locator('#tabStage [data-shot="1"]').evaluate(node => ({
      clip: getComputedStyle(node).clipPath,
      scale: getComputedStyle(node.querySelector('img')).scale,
      pin: getComputedStyle(node.querySelector('.tabpin')).opacity,
      pulse: getComputedStyle(node.querySelector('.tabpin'), '::after').animationName,
    }));
    assert.equal(settled.clip, 'inset(0px)');
    assert.equal(settled.scale, '1');
    assert.equal(settled.pin, '1');
    assert.equal(settled.pulse, 'tabping');
    await page.locator('#tabStage [data-legend="1"] li').first().hover();
    assert.equal(await page.locator('#tabStage [data-shot="1"] .tabpin').first().evaluate(node => node.classList.contains('is-hot')), true);
  });
});

test('tablet automatic cycling pauses on hover and advances after ready', async () => {
  await visit('/', async page => {
    await ready(page, 0);
    await ready(page, 1);
    await page.locator('#tabStage .tabdev').hover();
    const pausedAt = await page.locator('#tabT0 s').evaluate(node => node.getAnimations()[0].currentTime);
    await page.waitForTimeout(200);
    const stillPaused = await page.locator('#tabT0 s').evaluate(node => ({ time: node.getAnimations()[0].currentTime, state: node.getAnimations()[0].playState }));
    assert.equal(stillPaused.state, 'paused');
    assert.ok(Math.abs(stillPaused.time - pausedAt) < 30);
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => document.querySelector('#tabT1').getAttribute('aria-selected') === 'true', null, { timeout: 10000 });
    assert.equal(await page.locator('#tabStage').evaluate(node => node.classList.contains('is-auto')), true);
    await capture(page, 'automatic-next-ready');
  });
});

test('keyboard navigation follows pending tab intent and returning to the current tab cancels a slow request', async () => {
  const settings = gate();
  try {
    await visit('/', async page => {
      await ready(page, 0);
      await click(page, 3);
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => document.querySelector('#tabT2').getAttribute('aria-selected') === 'true');
      assert.equal(await page.locator('#tabT2').evaluate(node => node === document.activeElement), true);
      await click(page, 3);
      await click(page, 2);
      settings.release();
      await ready(page, 3);
      await page.waitForTimeout(100);
      assert.equal(await selected(page), '2');
      assert.equal(await page.locator('#tabScreen').getAttribute('aria-busy'), 'false');
    }, async page => {
      await page.route('**/assets/img/tablet/set-zh.jpg', async route => { await settings.promise; await route.continue().catch(() => {}); });
    });
  } finally { settings.release(); }
});
