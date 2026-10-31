import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

async function visit(width, run, withoutObserver = false) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  await page.addInitScript(({ withoutObserver }) => {
    if (withoutObserver) delete window.IntersectionObserver;
    window.chainBoxReads = [];
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('chain__box')) window.chainBoxReads.push(performance.now());
      return original.call(this);
    };
  }, { withoutObserver });
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.baseReady && NP.shellReady);
    await page.waitForFunction(() => !document.querySelector('#chain').classList.contains('is-swap'));
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

async function dash(page) {
  return page.locator('#wireFlow').evaluate(node => {
    const animation = node.getAnimations().find(animation => animation.animationName === 'dash');
    return { time: animation.currentTime, state: animation.playState, duration: animation.effect.getTiming().duration, easing: animation.effect.getTiming().easing };
  });
}

async function waitForDash(page, state) {
  await page.waitForFunction(state => {
    const animation = document.querySelector('#wireFlow').getAnimations().find(animation => animation.animationName === 'dash');
    return animation.playState === state && !animation.pending;
  }, state);
}

async function nearChain(page) {
  await page.evaluate(() => {
    const chain = document.querySelector('#chain');
    window.scrollTo(0, chain.getBoundingClientRect().top + scrollY - innerHeight - 300);
  });
  await page.waitForFunction(() => document.querySelector('#wireBase').hasAttribute('d'));
}

for (const width of [390, 1440]) {
  test('chain geometry waits until the 600px warmup region and preserves visible motion at ' + width + 'px', async () => {
    await visit(width, async page => {
      assert.equal(await page.evaluate(() => window.chainBoxReads.length), 0, 'startup timers and font readiness must not measure distant chain boxes');
      assert.equal(await page.locator('#wireBase').getAttribute('d'), null);
      await page.evaluate(() => {
        NP.measure(true);
        const checkbox = document.querySelector('#bitPerfect');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => !document.querySelector('#chain').classList.contains('is-swap'));
      assert.equal(await page.evaluate(() => window.chainBoxReads.length), 0, 'offscreen resize and bypass timers must also leave geometry untouched');

      await nearChain(page);
      const warm = await page.locator('#chain').evaluate(node => ({ top: node.getBoundingClientRect().top, viewport: innerHeight, paused: node.classList.contains('is-paused'), lit: node.querySelectorAll('.is-lit').length }));
      assert.ok(warm.top > warm.viewport && warm.top < warm.viewport + 600, 'paths must already exist before the chain enters the viewport');
      assert.equal(warm.paused, true);
      assert.equal(warm.lit, 0, 'preparing paths must not start the visible pulse sequence');
      assert.ok(await page.locator('#wireBypass').getAttribute('d'));

      await page.locator('#chain').scrollIntoViewIfNeeded();
      await waitForDash(page, 'running');
      const visible = await dash(page);
      assert.equal(visible.duration, 1000);
      assert.equal(visible.easing, 'linear');
      await page.waitForFunction(time => document.querySelector('#wireFlow').getAnimations().find(animation => animation.animationName === 'dash').currentTime > time + 100, visible.time);
      assert.equal(await page.locator('#chain .is-lit').count(), 1);
      await page.locator('#chain label.pswitch').click();
      await page.waitForFunction(() => !document.querySelector('#chain').classList.contains('is-swap'));
      assert.equal(await page.locator('#bitPerfect').isChecked(), false);
      assert.equal(await page.locator('#wireBypass').getAttribute('d'), '');
      assert.equal(await page.locator('#wireFlow').getAttribute('d'), await page.locator('#wireBase').getAttribute('d'));

      await page.evaluate(() => window.scrollTo(0, 0));
      await waitForDash(page, 'paused');
      const paused = await dash(page);
      await page.waitForTimeout(150);
      assert.ok(Math.abs((await dash(page)).time - paused.time) < 1);
      await nearChain(page);
      await waitForDash(page, 'paused');
      assert.ok(Math.abs((await dash(page)).time - paused.time) < 1, 'warming paths must preserve the paused dash phase');
      await page.locator('#chain').scrollIntoViewIfNeeded();
      await waitForDash(page, 'running');
      assert.ok((await dash(page)).time >= paused.time);
    });
  });
}

test('without IntersectionObserver the chain draws eagerly and keeps its animation and bypass control', async () => {
  await visit(1440, async page => {
    assert.ok(await page.evaluate(() => window.chainBoxReads.length) > 0);
    assert.ok(await page.locator('#wireBase').getAttribute('d'));
    await waitForDash(page, 'running');
    await page.locator('#chain').scrollIntoViewIfNeeded();
    await page.locator('#chain label.pswitch').click();
    await page.waitForFunction(() => !document.querySelector('#chain').classList.contains('is-swap'));
    assert.equal(await page.locator('#bitPerfect').isChecked(), true);
    assert.ok(await page.locator('#wireBypass').getAttribute('d'));
  }, true);
});
