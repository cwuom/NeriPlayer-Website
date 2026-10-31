import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function heldPage(holdFonts = false) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const scripts = gate(), styles = gate(), fonts = gate();
  const arrivals = { github: gate(), demos: gate(), style: gate() };
  const pending = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  await page.route(/\/assets\/js\/(github|demos)\.js(?:\?.*)?$/, route => {
    const name = /\/(github|demos)\.js/.exec(route.request().url())[1];
    arrivals[name].release();
    const task = scripts.promise.then(() => route.continue());
    pending.push(task);
    return task;
  });
  await page.route(/\/assets\/css\/site\.css(?:\?.*)?$/, route => {
    arrivals.style.release();
    const task = styles.promise.then(() => route.continue());
    pending.push(task);
    return task;
  });
  if (holdFonts) await page.route(/\/(?:fraunces-critical|fraunces-italic-critical|np-serif-critical)\.woff2(?:\?.*)?$/, route => {
    const task = fonts.promise.then(() => route.continue());
    pending.push(task);
    return task;
  });
  await page.addInitScript(() => {
    const probe = window.heroProbe = { dcl: null, introAt: null, introTransitions: 0, fontLoads: [] };
    document.addEventListener('DOMContentLoaded', () => { probe.dcl = performance.now(); }, { once: true });
    new MutationObserver(records => {
      for (const record of records) {
        if (!record.target.matches?.('.hero')) continue;
        if (record.target.classList.contains('is-intro') && !(record.oldValue || '').split(/\s+/).includes('is-intro')) {
          probe.introAt = performance.now();
          probe.introTransitions++;
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    const load = FontFaceSet.prototype.load;
    FontFaceSet.prototype.load = function (font, text) {
      const entry = { font, startedAt: performance.now(), settledAt: null };
      if (/64px/.test(font)) probe.fontLoads.push(entry);
      const promise = load.call(this, font, text);
      promise.then(() => { entry.settledAt = performance.now(); }, () => { entry.settledAt = performance.now(); });
      return promise;
    };
  });
  return {
    page, errors,
    async open() {
      await page.goto(origin, { waitUntil: 'commit' });
      let timer;
      try {
        await Promise.race([
          Promise.all(Object.values(arrivals).map(value => value.promise)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('the deferred script and stylesheet requests did not reach their gates')), 5000); }),
        ]);
      } finally { clearTimeout(timer); }
      await page.waitForFunction(() => document.readyState === 'interactive' && !!window.NP?.motion?.initHero);
    },
    release() { scripts.release(); styles.release(); fonts.release(); },
    async close() {
      scripts.release(); styles.release(); fonts.release();
      await Promise.allSettled(pending);
      try { await page.waitForLoadState('domcontentloaded', { timeout: 8000 }); } catch { /* 失败断言后也要释放下载再关闭页面 */ }
      await page.close();
    },
  };
}

async function state(page) {
  return page.evaluate(() => ({
    dcl: window.heroProbe.dcl,
    readyState: document.readyState,
    shellReady: !!window.NP?.shellReady,
    fullStylesReady: !!document.querySelector('link[data-deferred-style]')?.sheet,
    leadIn: document.querySelector('.hero .lead').classList.contains('is-in'),
    intro: document.querySelector('.hero').classList.contains('is-intro'),
    wrappers: document.querySelectorAll('.display__line > .dl-in').length,
    probe: window.heroProbe,
  }));
}

async function animationParameters(page) {
  return page.evaluate(() => {
    const lead = getComputedStyle(document.querySelector('.hero .lead'));
    return {
      lead: { duration: lead.transitionDuration, delay: lead.transitionDelay, easing: lead.transitionTimingFunction },
      lines: [...document.querySelectorAll('.display__line > .dl-in')].map(node => {
        const css = getComputedStyle(node);
        return { duration: css.transitionDuration, delay: css.transitionDelay, easing: css.transitionTimingFunction };
      }),
    };
  });
}

function assertAnimationParameters(parameters) {
  const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
  assert.deepEqual(parameters.lead, { duration: '0.9s, 1.1s, 1.1s, 1s', delay: '0.18s', easing: Array(4).fill(easing).join(', ') });
  assert.deepEqual(parameters.lines, ['0.15s', '0.27s', '0.39s'].map(delay => ({ duration: '1.2s', delay, easing })));
}

test('hero starts before later defer downloads, DOMContentLoaded, shell initialization and full CSS', async () => {
  const fixture = await heldPage();
  const { page } = fixture;
  try {
    await fixture.open();
    const started = await page.waitForFunction(() => document.querySelector('.hero .lead').classList.contains('is-in') && document.querySelector('.hero').classList.contains('is-intro'), null, { timeout: 2500 }).then(() => true, () => false);
    const early = await state(page);
    assert.equal(started, true, 'hero must start while later downloads remain gated: ' + JSON.stringify(early));
    assert.equal(early.dcl, null);
    assert.equal(early.shellReady, false);
    assert.equal(early.fullStylesReady, false);
    assert.equal(early.wrappers, 3);
    const parameters = await animationParameters(page);
    assertAnimationParameters(parameters);
    fixture.release();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => NP.shellReady && NP.contentReady);
    await page.evaluate(() => { NP.motion.initHero(); NP.motion.init(); NP.motion.initHero(); });
    assert.equal(await page.locator('.display__line > .dl-in').count(), 3);
    assert.equal(await page.locator('.dl-in .dl-in').count(), 0, 'the full initializer must not wrap title lines again');
    assert.equal((await state(page)).probe.introTransitions, 1);
    assert.deepEqual(await animationParameters(page), parameters);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('eager hero preserves the 1200ms font barrier and its original title animation', async () => {
  const fixture = await heldPage(true);
  const { page } = fixture;
  try {
    await fixture.open();
    const waiting = await page.waitForFunction(() => window.heroProbe.fontLoads.length === 3, null, { timeout: 2500 }).then(() => true, () => false);
    assert.equal(waiting, true, 'hero must start its font barrier before the deferred script gates release: ' + JSON.stringify(await state(page)));
    await page.waitForTimeout(900);
    assert.equal((await state(page)).intro, false, 'unavailable title fonts must not skip the original waiting period');
    await page.waitForFunction(() => document.querySelector('.hero').classList.contains('is-intro'), null, { timeout: 2500 });
    const fallback = await state(page);
    assert.equal(fallback.dcl, null);
    assert.equal(fallback.shellReady, false);
    assert.equal(fallback.probe.fontLoads.every(entry => entry.settledAt === null), true, 'the fallback must fire while the title fonts remain unavailable');
    const delay = fallback.probe.introAt - fallback.probe.fontLoads[0].startedAt;
    assert.ok(delay >= 1200 && delay < 1800, 'the 1200ms guard plus the existing RAF and 60ms intro delay must remain intact: ' + delay);
    assertAnimationParameters(await animationParameters(page));
    fixture.release();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => NP.contentReady && window.heroProbe.fontLoads.every(entry => entry.settledAt !== null));
    assert.equal((await state(page)).probe.introTransitions, 1, 'late fonts must not restart the intro');
    assert.equal(await page.locator('.display__line > .dl-in').count(), 3);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
