import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

async function visit(options, run) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  await page.addInitScript(({ fixture, holdObserver, withoutObserver }) => {
    if (withoutObserver) delete window.IntersectionObserver;
    if (holdObserver) {
      const NativeObserver = window.IntersectionObserver;
      const pending = [];
      window.releaseSegmentObservers = () => pending.splice(0).forEach(item => item.callback(item.entries, item.observer));
      window.IntersectionObserver = class extends NativeObserver {
        constructor(callback, settings) {
          super((entries, observer) => {
            const ready = entries.filter(entry => {
              if (!entry.target.id.startsWith('segmentFixture')) return true;
              pending.push({ callback, entries: [entry], observer });
              return false;
            });
            if (ready.length) callback(ready, observer);
          }, settings);
        }
      };
    }
    window.segmentProbeReads = {};
    for (const property of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property);
      Object.defineProperty(HTMLElement.prototype, property, {
        ...descriptor,
        get() {
          const probe = this.tagName === 'BUTTON' && this.closest('[data-segment-probe]');
          if (probe) window.segmentProbeReads[probe.dataset.segmentProbe] = (window.segmentProbeReads[probe.dataset.segmentProbe] || 0) + 1;
          return descriptor.get.call(this);
        },
      });
    }
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelector('[data-app-theme-target="phHome"]').dataset.segmentProbe = 'far';
      if (!fixture) return;
      const style = document.createElement('style');
      style.textContent = '[id^="segmentFixture"] {position:absolute!important;top:6000px;left:8px;z-index:10000} .segment-test-fixed {position:fixed!important;top:80px!important} #segmentFixtureKeyboard {top:140px!important} #segmentFixtureClick {top:200px!important}';
      document.head.appendChild(style);
      for (const id of fixture === 'capture' ? ['segmentFixture', 'segmentFixtureKeyboard', 'segmentFixtureClick'] : ['segmentFixture']) {
        const seg = document.createElement('div');
        seg.id = id;
        seg.className = 'seg' + (fixture === 'capture' ? ' segment-test-fixed' : '');
        seg.dataset.segmentProbe = id;
        if (fixture === 'hidden') { seg.classList.add('segment-test-fixed'); seg.hidden = true; }
        seg.innerHTML = '<button type="button" class="is-on">Alpha</button><button type="button">Longer option</button>';
        seg.addEventListener('click', event => {
          const selected = event.target.closest('button');
          if (!selected) return;
          const indicator = seg.querySelector('.seg__ind');
          const sample = seg._segmentSample = {
            from: indicator && parseFloat(getComputedStyle(indicator).translate),
            target: selected.offsetLeft,
          };
          seg.querySelectorAll('button').forEach(button => button.classList.toggle('is-on', button === selected));
          requestAnimationFrame(() => {
            const animation = indicator?.getAnimations().find(item => item.transitionProperty === 'translate');
            sample.duration = animation?.effect.getTiming().duration;
            setTimeout(() => { sample.middle = indicator && parseFloat(getComputedStyle(indicator).translate); }, 100);
          });
        });
        document.body.appendChild(seg);
      }
    }, { once: true });
  }, options);
  try {
    await page.goto(origin + (options.path || '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NP?.baseReady && NP.shellReady);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

for (const path of ['/', '/en/']) {
  test('distant segments retain their native selection without startup or resize geometry reads ' + path, async () => {
    await visit({ path }, async page => {
      const distant = page.locator('[data-segment-probe="far"]');
      assert.equal(await distant.locator('.seg__ind').count(), 0);
      assert.equal(await distant.evaluate(seg => seg.classList.contains('has-ind')), false);
      assert.equal(await page.evaluate(() => segmentProbeReads.far || 0), 0);
      await page.evaluate(async () => {
        NP.measure(true);
        document.fonts.dispatchEvent(new Event('loadingdone'));
        await new Promise(requestAnimationFrame);
      });
      assert.equal(await page.evaluate(() => segmentProbeReads.far || 0), 0, 'global resize and font readiness must leave distant buttons untouched');
      assert.notEqual(await distant.locator('button.is-on').evaluate(button => getComputedStyle(button).backgroundColor), 'rgba(0, 0, 0, 0)', 'the ordinary selected button keeps its ink before the sliding indicator is prepared');
    });
  });
}

test('the 1200px warmup prepares an aligned indicator before visibility and stays idempotent', async () => {
  await visit({ fixture: 'warmup' }, async page => {
    const seg = page.locator('#segmentFixture');
    assert.equal(await seg.locator('.seg__ind').count(), 0);
    assert.equal(await page.evaluate(() => segmentProbeReads.segmentFixture || 0), 0);
    await page.evaluate(() => window.scrollTo(0, 6000 - innerHeight - 1500));
    await page.waitForTimeout(100);
    assert.equal(await seg.locator('.seg__ind').count(), 0, 'the 1200px boundary must not become an eager whole-page initializer');
    await page.evaluate(() => window.scrollTo(0, 6000 - innerHeight - 650));
    await page.waitForFunction(() => document.querySelector('#segmentFixture .seg__ind'));
    const state = await seg.evaluate(element => {
      const button = element.querySelector('button.is-on'), indicator = element.querySelector('.seg__ind');
      return { top: element.getBoundingClientRect().top, viewport: innerHeight, width: parseFloat(indicator.style.width), expectedWidth: button.offsetWidth, left: parseFloat(indicator.style.translate), expectedLeft: button.offsetLeft };
    });
    assert.ok(state.top > state.viewport && state.top < state.viewport + 1200, 'preparation must complete while the segment is still outside the viewport: ' + JSON.stringify(state));
    assert.equal(state.width, state.expectedWidth);
    assert.equal(state.left, state.expectedLeft);
    for (let turn = 0; turn < 2; turn++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(50);
      await page.evaluate(() => window.scrollTo(0, 6000 - innerHeight - 650));
      await page.waitForTimeout(50);
    }
    assert.equal(await seg.locator('.seg__ind').count(), 1, 're-entering the warmup region must reuse the original indicator');
  });
});

test('capture activation preserves the first real click and keyboard slide even before the observer callback', async () => {
  await visit({ fixture: 'capture', holdObserver: true }, async page => {
    const fixtures = ['segmentFixture', 'segmentFixtureKeyboard', 'segmentFixtureClick'];
    for (const id of fixtures) assert.equal(await page.locator('#' + id + ' .seg__ind').count(), 0);
    await page.locator('#segmentFixture button').nth(1).tap();
    await page.locator('#segmentFixtureKeyboard button').nth(1).focus();
    assert.equal(await page.locator('#segmentFixtureKeyboard .seg__ind').count(), 1, 'focus must prepare the old selection before an Enter click changes it');
    await page.locator('#segmentFixtureKeyboard button').nth(1).press('Enter');
    await page.locator('#segmentFixtureClick button').nth(1).evaluate(button => button.click());
    await page.waitForFunction(ids => ids.every(id => document.getElementById(id)._segmentSample?.middle != null), fixtures);
    for (const id of fixtures) {
      const sample = await page.locator('#' + id).evaluate(seg => seg._segmentSample);
      assert.equal(sample.duration, 550, id + ' must retain the complete native translate transition');
      assert.ok(sample.middle > sample.from && sample.middle < sample.target, id + ' must pass through visible intermediate positions');
    }
    await page.evaluate(() => releaseSegmentObservers());
    for (const id of fixtures) assert.equal(await page.locator('#' + id + ' .seg__ind').count(), 1);
  });
});

test('a hidden segment initializes when its pane becomes visible', async () => {
  await visit({ fixture: 'hidden' }, async page => {
    const seg = page.locator('#segmentFixture');
    assert.equal(await seg.locator('.seg__ind').count(), 0);
    await seg.evaluate(element => { element.hidden = false; });
    await page.waitForFunction(() => document.querySelector('#segmentFixture .seg__ind'));
    assert.equal(await seg.locator('.seg__ind').count(), 1);
    assert.equal(await seg.evaluate(element => {
      const indicator = element.querySelector('.seg__ind'), button = element.querySelector('button.is-on');
      return !indicator.hidden && parseFloat(indicator.style.width) === button.offsetWidth && parseFloat(indicator.style.translate) === button.offsetLeft;
    }), true);
  });
});

test('without IntersectionObserver all segments eagerly retain their complete indicators', async () => {
  await visit({ fixture: 'warmup', withoutObserver: true }, async page => {
    const seg = page.locator('#segmentFixture');
    assert.equal(await seg.locator('.seg__ind').count(), 1);
    assert.equal(await seg.evaluate(element => element.classList.contains('has-ind')), true);
    assert.ok(await page.evaluate(() => segmentProbeReads.segmentFixture > 0));
  });
});
