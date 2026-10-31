import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, before } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6060';
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
});
after(async () => { await browser?.close(); });

function barrier() {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  return { pending, release };
}

async function visit(path, { css, font } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  if (css) await page.route('**/site.css', async route => { await css.pending; await route.continue(); });
  if (font) await page.route('**/fonts/geist.woff2', async route => { await font.pending; await route.continue(); });
  await page.goto(origin + path, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.NP?.shellReady);
  return { context, page, errors };
}

async function menuTo(page, id) {
  await page.locator('#burger').tap();
  await page.locator(`#menu a[href="#${id}"]`).tap();
}

async function settled(page) {
  await page.waitForFunction(() => NP.booted);
  await page.evaluate(() => document.fonts.ready);
}

async function aligned(page, id) {
  const result = await page.waitForFunction(id => {
    const target = document.getElementById(id);
    const wanted = target.getBoundingClientRect().top - document.querySelector('#nav').offsetHeight - 10;
    return Math.abs(wanted) < 2;
  }, id, { timeout: 6000 }).then(() => true, () => false);
  const state = await page.locator(`#${id}`).evaluate(node => {
    const offset = node.getBoundingClientRect().top - document.querySelector('#nav').offsetHeight - 10;
    return { offset, scrollY, desiredY: offset + scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight, animating: NP.smoothScroll.isAnimating() };
  });
  assert.equal(result, true, `${id} must align after the deferred layout settles; ${JSON.stringify(state)}`);
}

async function recordScrollRequests(page) {
  await page.evaluate(() => {
    window.anchorScrollRequests = [];
    for (const key of ['scrollTo', 'retargetScroll']) {
      if (!NP[key]) continue;
      const original = NP[key];
      NP[key] = function (...args) { anchorScrollRequests.push({ key, args }); return original.apply(this, args); };
    }
  });
}

async function manualScroll(page, input) {
  await page.evaluate(type => {
    window.anchorInputSeen = false;
    window.addEventListener(type, () => { anchorInputSeen = true; }, { once: true });
  }, input === 'touch' ? 'touchstart' : input === 'wheel' ? 'wheel' : 'keydown');
  if (input === 'touch') await page.touchscreen.tap(12, 300);
  else if (input === 'wheel') await page.mouse.wheel(0, -300);
  else await page.keyboard.press('PageDown');
  await page.waitForFunction(() => anchorInputSeen, null, { timeout: 3000 });
}

test('touch input during animation startup cancels initial hash navigation', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.addInitScript(() => {
      const schedule = window.setTimeout;
      window.setTimeout = function (callback, delay, ...args) {
        if (callback.name === 'finishShell') { window.finishAnimationStartup = callback; return 0; }
        return schedule(callback, delay, ...args);
      };
    });
    await page.goto(origin + '/#play', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.finishAnimationStartup && window.NP?.baseReady);
    await manualScroll(page, 'touch');
    await page.evaluate(() => { NP.scrollTo(900, true); finishAnimationStartup(); });
    await page.waitForFunction(() => NP.booted);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - 900) < 2, 'finishing startup must preserve the user scroll intent');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const language of ['/', '/en/']) {
  test(`deep hashes align after slow page CSS ${language}`, async () => {
    for (const id of ['play', 'desktop']) {
      const css = barrier();
      let run;
      try {
        run = await visit(`${language}#${id}`, { css });
        await run.page.waitForTimeout(150);
        css.release();
        await settled(run.page);
        await aligned(run.page, id);
        assert.deepEqual(run.errors, []);
      } finally { css.release(); await run?.context.close(); }
    }
  });

  test(`menu navigation survives late page CSS and fonts ${language}`, async () => {
    const css = barrier(), font = barrier();
    let run;
    try {
      run = await visit(language, { css, font });
      await menuTo(run.page, 'desktop');
      css.release();
      await run.page.waitForFunction(() => NP.baseReady);
      await run.page.waitForTimeout(250);
      font.release();
      await settled(run.page);
      await aligned(run.page, 'desktop');
      assert.deepEqual(run.errors, []);
    } finally { css.release(); font.release(); await run?.context.close(); }
  });

  test(`an anchor moving onto the current frame still replaces the old scroll destination ${language}`, async () => {
    const font = barrier();
    let run;
    try {
      run = await visit(language, { font });
      await run.page.evaluate(() => NP.preparePreviews());
      await menuTo(run.page, 'play');
      await run.page.waitForFunction(() => scrollY > 600 && NP.smoothScroll.isAnimating());
      await run.page.evaluate(() => {
        const target = document.querySelector('#play');
        target.style.transform = `translateY(${document.querySelector('#nav').offsetHeight + 10 - target.getBoundingClientRect().top}px)`;
        window.dispatchEvent(new Event('load'));
      });
      font.release();
      await run.page.waitForTimeout(2200);
      await aligned(run.page, 'play');
      assert.deepEqual(run.errors, []);
    } finally { font.release(); await run?.context.close(); }
  });

  test(`a settled deep link releases later programmatic scrolling ${language}`, async () => {
    let run;
    try {
      run = await visit(language + '#play');
      await settled(run.page);
      await aligned(run.page, 'play');
      await run.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
      await recordScrollRequests(run.page);
      await run.page.evaluate(() => {
        NP.scrollTo(0, true);
        anchorScrollRequests.length = 0;
        window.dispatchEvent(new Event('load'));
        document.fonts.dispatchEvent(new Event('loadingdone'));
      });
      await run.page.waitForTimeout(250);
      assert.equal(await run.page.evaluate(() => scrollY), 0);
      assert.deepEqual(await run.page.evaluate(() => anchorScrollRequests), [], 'settled anchor navigation must not reclaim later programmatic scrolling');
      assert.deepEqual(run.errors, []);
    } finally { await run?.context.close(); }
  });

  test(`manual scrolling cancels a pending initial hash correction ${language}`, async () => {
    for (const input of ['touch', 'wheel', 'keyboard']) {
      const css = barrier();
      let run;
      try {
        run = await visit(`${language}#desktop`, { css });
        await run.page.waitForTimeout(150);
        await manualScroll(run.page, input);
        await recordScrollRequests(run.page);
        css.release();
        await settled(run.page);
        await run.page.waitForTimeout(250);
        assert.deepEqual(await run.page.evaluate(() => anchorScrollRequests), [], `settling resources must not reclaim scrolling after ${input}`);
        assert.deepEqual(run.errors, []);
      } finally { css.release(); await run?.context.close(); }
    }
  });

  test(`manual scrolling cancels font-driven correction after menu navigation ${language}`, async () => {
    for (const input of ['touch', 'wheel', 'keyboard']) {
      const font = barrier();
      let run;
      try {
        run = await visit(language, { font });
        await run.page.waitForFunction(() => NP.baseReady);
        await menuTo(run.page, 'play');
        await run.page.waitForTimeout(250);
        assert.equal(await run.page.evaluate(() => document.querySelector('#menu').contains(document.elementFromPoint(12, 300))), false, 'a closing menu must release hit testing while its fade continues');
        await manualScroll(run.page, input);
        await recordScrollRequests(run.page);
        font.release();
        await settled(run.page);
        await run.page.waitForTimeout(250);
        assert.deepEqual(await run.page.evaluate(() => anchorScrollRequests), [], `late fonts must not restart navigation after ${input}`);
        assert.deepEqual(run.errors, []);
      } finally { font.release(); await run?.context.close(); }
    }
  });
}
