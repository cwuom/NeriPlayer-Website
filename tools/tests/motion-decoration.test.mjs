import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
const handSelector = '.hand--note, .hero__note, .shots__note, .sketch__a, .flow__note, .syncmap__note, .stats__label, .widgets__note, .tabstage__note, .cutline .hand, .footer__brand .hand, .tree em, .ruby-fig__label';
let browser;
after(async () => { await browser?.close(); });

async function visit(options, run) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  await page.addInitScript(({ handSelector, noObserver }) => {
    if (noObserver) delete window.IntersectionObserver;
    let frame = 0;
    requestAnimationFrame(function tick() { frame++; requestAnimationFrame(tick); });
    window.motionSamples = [];
    document.addEventListener('DOMContentLoaded', () => {
      window.motionHands = [...document.querySelectorAll(handSelector)].map((el, i) => ({ el, delay: String((i % 3) * 120) }));
      const heading = document.getElementById('stack-title');
      const sample = { splitFrame: null, revealFrame: null };
      window.motionSamples.push(sample);
      new MutationObserver(() => {
        if (heading.hasAttribute('data-split') && sample.splitFrame === null) sample.splitFrame = frame;
        if (heading.classList.contains('is-in') && sample.revealFrame === null) sample.revealFrame = frame;
      }).observe(heading, { attributes: true, attributeFilter: ['data-split', 'class'] });
    }, { once: true });
  }, { handSelector, noObserver: options.noObserver });
  try {
    await page.goto(origin + (options.path || '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NP?.baseReady && NP.shellReady);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

for (const path of ['/', '/en/']) {
  test('distant decorations wait for their section while the hero keeps its complete entrance ' + path, async () => {
    await visit({ path }, async page => {
      assert.equal(await page.locator('.hero .display__line > .dl-in').count(), 3);
      await page.waitForFunction(() => document.querySelector('.hero').classList.contains('is-intro'));
      assert.equal(await page.locator('#stack-title').getAttribute('data-split'), null, 'far headings must not be split during shell startup');
      assert.equal(await page.locator('#stack-title .sw').count(), 0);
      assert.equal(await page.locator('.footer__motto .sw').count(), 0);
      const farHands = await page.evaluate(() => motionHands.filter(item => item.el.closest('#stack,.footer')).map(item => ({ prepared: item.el.hasAttribute('data-write'), delay: item.el.style.getPropertyValue('--wd') })));
      assert.ok(farHands.length > 0);
      assert.ok(farHands.every(item => !item.prepared && item.delay === ''));

      await page.evaluate(() => NP.scrollTo(NP.absTop(document.getElementById('stack')) - innerHeight - 800, true));
      await page.waitForFunction(() => document.getElementById('stack-title').hasAttribute('data-split'));
      assert.equal(await page.locator('#stack-title').evaluate(el => el.classList.contains('is-in')), false, '1200px preparation must happen before the heading enters the viewport');
      assert.equal(await page.locator('.footer__motto .sw').count(), 0);
    });
  });

  test('fast jumps preserve the split transition, global handwritten delays and one-time preparation ' + path, async () => {
    await visit({ path }, async page => {
      assert.equal(await page.locator('#stack-title .sw').count(), 0);
      await page.evaluate(() => NP.scrollTo(NP.absTop(document.getElementById('stack')) - 75, true));
      await page.waitForFunction(() => document.getElementById('stack-title').classList.contains('is-in'));
      const result = await page.locator('#stack-title').evaluate(el => ({
        spans: el.querySelectorAll('.sw').length,
        nested: el.querySelectorAll('.sw .sw').length,
        transitions: el.querySelector('.sw > span').getAnimations().filter(animation => animation.transitionProperty === 'translate').map(animation => animation.effect.getTiming()),
        sample: motionSamples[0],
      }));
      assert.ok(result.spans > 0);
      assert.equal(result.nested, 0);
      assert.ok(result.sample.revealFrame > result.sample.splitFrame, JSON.stringify(result.sample));
      assert.equal(result.transitions.length, 1, 'a fast jump must still animate the prepared text');
      assert.equal(result.transitions[0].duration, 1000);
      assert.equal(result.transitions[0].easing, 'cubic-bezier(0.16, 1, 0.3, 1)');
      assert.equal(result.transitions[0].delay, 100);
      assert.equal(await page.evaluate(() => motionHands.filter(item => item.el.closest('#stack')).every(item => item.el.hasAttribute('data-write') && item.el.style.getPropertyValue('--wd') === item.delay)), true);
      const count = result.spans;
      await page.evaluate(() => NP.scrollTo(0, true));
      await page.waitForTimeout(100);
      await page.locator('#stack-title').scrollIntoViewIfNeeded();
      await page.evaluate(() => NP.measure(true));
      assert.equal(await page.locator('#stack-title .sw').count(), count);
      assert.equal(await page.locator('#stack-title .sw .sw').count(), 0);
    });
  });

  test('direct section links prepare their entrance before revealing it ' + path, async () => {
    await visit({ path: path + '#stack' }, async page => {
      await page.waitForFunction(() => document.getElementById('stack-title').hasAttribute('data-split') && document.getElementById('stack-title').classList.contains('is-in'));
      assert.ok(await page.locator('#stack-title .sw').count() > 0);
      const sample = await page.evaluate(() => motionSamples[0]);
      assert.ok(sample.revealFrame > sample.splitFrame, JSON.stringify(sample));
      assert.equal(await page.evaluate(() => motionHands.filter(item => item.el.closest('#stack')).every(item => item.el.style.getPropertyValue('--wd') === item.delay)), true);
    });
  });
}

test('reduced motion keeps the original readable text without adding decoration wrappers', async () => {
  await visit({ reduced: true }, async page => {
    assert.equal(await page.locator('.sw,.dl-in').count(), 0);
    assert.equal(await page.locator('#stack-title').evaluate(el => getComputedStyle(el).opacity), '1');
    assert.equal(await page.locator('#stack-title').evaluate(el => el.classList.contains('is-in')), true);
  });
});

test('without IntersectionObserver all decorations and original handwritten delays are available', async () => {
  await visit({ noObserver: true }, async page => {
    assert.ok(await page.locator('#stack-title .sw').count() > 0);
    assert.ok(await page.locator('.footer__motto .sw').count() > 0);
    assert.equal(await page.evaluate(() => motionHands.every(item => item.el.hasAttribute('data-write') && item.el.style.getPropertyValue('--wd') === item.delay)), true);
    assert.equal(await page.locator('#stack-title').evaluate(el => el.classList.contains('is-in')), true);
  });
});

test('overlapping load, font and resize notifications measure parallax once after rendering', async () => {
  await visit({}, async page => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    const result = await page.evaluate(async () => {
      const target = document.querySelector('.sec-stats dd');
      const read = target.getBoundingClientRect;
      let reads = 0;
      target.getBoundingClientRect = function () { reads++; return read.call(this); };
      NP.measure(true);
      NP.measure(true);
      window.dispatchEvent(new Event('load'));
      document.fonts.dispatchEvent(new Event('loadingdone'));
      const synchronous = reads;
      await new Promise(requestAnimationFrame);
      await new Promise(resolve => setTimeout(resolve, 50));
      target.getBoundingClientRect = read;
      return { synchronous, reads };
    });
    assert.equal(result.synchronous, 0, 'font and viewport callbacks must not synchronously force the parallax layout');
    assert.equal(result.reads, 1, 'notifications in one rendering turn share the same measurement');
  });
});

test('real font loading and viewport changes retain the original parallax geometry', async () => {
  await visit({}, async page => {
    await page.evaluate(async () => {
      window.motionFontEvents = 0;
      document.fonts.addEventListener('loadingdone', () => { window.motionFontEvents++; });
      const face = new FontFace('MotionProbe', 'url("/assets/fonts/geist-mono.woff2?motion-decoration")');
      document.fonts.add(face);
      document.querySelector('#play .sec-stats dd').style.fontFamily = '"MotionProbe", monospace';
      await document.fonts.load('32px "MotionProbe"', '12345');
      await document.fonts.ready;
    });
    assert.ok(await page.evaluate(() => motionFontEvents > 0), 'the browser must complete an actual font request');
    await page.setViewportSize({ width: 430, height: 930 });
    await page.waitForFunction(() => NP.vp.w === 430 && NP.vp.h === 930);
    await page.locator('#play .sec-stats dd').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    const geometry = await page.locator('#play .sec-stats dd').first().evaluate(el => {
      const actual = parseFloat(getComputedStyle(el).translate.split(' ')[1]) || 0;
      const rect = el.getBoundingClientRect();
      const top = rect.top + NP.scroll.y - actual;
      const progress = Math.max(0, Math.min(1, (NP.scroll.y + innerHeight - top) / (innerHeight + rect.height)));
      return { actual, expected: 14 - progress * 28 };
    });
    assert.ok(Math.abs(geometry.actual - geometry.expected) < .2, JSON.stringify(geometry));
  });
});

async function stages(options, run) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  let releaseStyles;
  const styles = new Promise(resolve => { releaseStyles = resolve; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  // 只替换启动入口，两个阶段都执行真实 motion 模块，样式按实际网络完成顺序释放
  await page.route(/\/assets\/js\/main(?:\.min)?\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: 'window.motionComponentFixture = true;' }));
  await page.route(url => url.pathname.endsWith('/site.css'), async route => { await styles; await route.continue().catch(() => {}); });
  await page.addInitScript(({ noObserver }) => {
    window.motionOutsideReads = 0;
    window.motionHeroObservations = 0;
    window.motionHeroFontLoads = [];
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (...args) {
      const section = this.closest('section');
      if (section && !section.classList.contains('hero')) window.motionOutsideReads++;
      return rect.apply(this, args);
    };
    const load = document.fonts.load.bind(document.fonts);
    document.fonts.load = function (...args) { window.motionHeroFontLoads.push(args); return load(...args); };
    if (noObserver) delete window.IntersectionObserver;
    else {
      const NativeObserver = window.IntersectionObserver;
      window.IntersectionObserver = class extends NativeObserver {
        observe(target) {
          if (target.closest('.hero')) window.motionHeroObservations++;
          super.observe(target);
        }
      };
    }
  }, { noObserver: options.noObserver });
  try {
    await page.goto(origin + (options.path || '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.motionComponentFixture && window.NP?.motion);
    await run(page, async () => {
      releaseStyles();
      await page.waitForFunction(() => document.querySelector('link[data-deferred-style]').sheet);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))));
    });
    assert.deepEqual(errors, []);
  } finally { releaseStyles(); await page.close(); }
}

for (const path of ['/', '/en/']) {
  test('the hero stage stays independent of full page CSS and initializes only once ' + path, async () => {
    await stages({ path }, async (page, releaseStyles) => {
      assert.equal(await page.evaluate(() => typeof NP.motion.initHero), 'function');
      await page.evaluate(() => { NP.measure(true); NP.shellReady = true; NP.motion.initHero(); NP.motion.initHero(); NP.start(); });
      await page.waitForFunction(() => document.querySelector('.hero').classList.contains('is-intro'));
      assert.equal(await page.locator('.hero .display__line > .dl-in').count(), 3);
      assert.equal(await page.locator('.dl-in .dl-in').count(), 0);
      assert.equal(await page.locator('#download-title').getAttribute('data-split'), null);
      assert.equal(await page.locator('#download .is-in').count(), 0, 'the early stage must not reveal unformatted components');
      assert.equal(await page.locator('.seg__ind,.src__progress').count(), 0, 'the hero must not initialize page-wide geometry helpers');
      assert.equal(await page.evaluate(() => motionOutsideReads), 0);
      const before = await page.evaluate(() => ({ observations: motionHeroObservations, fonts: motionHeroFontLoads.length }));
      assert.ok(before.observations > 0);
      assert.equal(before.fonts, 3);
      await releaseStyles();
      await page.evaluate(() => { NP.motion.init(); NP.motion.initHero(); NP.motion.init(); });
      await page.waitForFunction(() => document.getElementById('download-title').hasAttribute('data-split'));
      assert.equal(await page.locator('.hero .display__line > .dl-in').count(), 3);
      assert.equal(await page.locator('.dl-in .dl-in').count(), 0);
      assert.deepEqual(await page.evaluate(() => ({ observations: motionHeroObservations, fonts: motionHeroFontLoads.length })), before, 'the full stage must reuse the original hero reveal and font barrier');
    });
  });
}

test('the legacy motion entry still initializes the hero and the complete page', async () => {
  await stages({}, async (page, releaseStyles) => {
    await releaseStyles();
    await page.evaluate(() => { NP.measure(true); NP.shellReady = true; NP.motion.init(); NP.motion.init(); NP.start(); });
    await page.waitForFunction(() => document.querySelector('.hero').classList.contains('is-intro') && document.getElementById('download-title').hasAttribute('data-split'));
    assert.equal(await page.locator('.hero .display__line > .dl-in').count(), 3);
    assert.equal(await page.locator('.dl-in .dl-in').count(), 0);
    assert.equal(await page.evaluate(() => motionHeroFontLoads.length), 3);
  });
});

for (const options of [{ reduced: true }, { noObserver: true }]) {
  test('staged motion preserves the full fallback ' + (options.reduced ? 'for reduced motion' : 'without IntersectionObserver'), async () => {
    await stages(options, async (page, releaseStyles) => {
      assert.equal(await page.evaluate(() => typeof NP.motion.initHero), 'function');
      await page.evaluate(() => { NP.measure(true); NP.shellReady = true; NP.motion.initHero(); NP.start(); });
      assert.equal(await page.locator('#stack-title').evaluate(el => el.classList.contains('is-in')), false);
      await releaseStyles();
      await page.evaluate(() => { NP.motion.init(); NP.motion.init(); });
      assert.equal(await page.locator('#stack-title').evaluate(el => el.classList.contains('is-in')), true);
      if (options.reduced) assert.equal(await page.locator('.sw,.dl-in').count(), 0);
      else {
        assert.ok(await page.locator('#stack-title .sw').count() > 0);
        assert.equal(await page.locator('.hero .display__line > .dl-in').count(), 3);
        assert.equal(await page.locator('.sw .sw,.dl-in .dl-in').count(), 0);
      }
    });
  });
}
