import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

async function visit(run, withoutObserver = false) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  await page.addInitScript(withoutObserver => {
    if (withoutObserver) delete window.IntersectionObserver;
    window.distantDemoReads = [];
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.matches('.pstep,.src__sheets > *, .room__stage, .room__hub')) distantDemoReads.push(this.id || this.className);
      return rect.call(this);
    };
  }, withoutObserver);
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.baseReady && NP.contentReady);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

test('distant source, playback, room and stats demos do no startup geometry work', async () => {
  await visit(async page => {
    assert.deepEqual(await page.evaluate(() => distantDemoReads), []);
    assert.equal(await page.locator('#statChart > *').count(), 0, 'the distant chart must not build its SVG before the warmup region');
    await page.locator('#sources').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => distantDemoReads.some(value => String(value).includes('src')));
    assert.ok(await page.locator('#srcIndex .is-on').count());
    await page.locator('#room').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('#roomWires line').length > 0);
    await page.locator('#statsDemo').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('#statChart .bar').length > 0);
    const bars = await page.locator('#statChart .bar').count();
    await page.evaluate(() => NP.demos.init());
    assert.equal(await page.locator('#statChart .bar').count(), bars, 'repeat initialization must not duplicate the graph or handlers');
  });
});

test('a first synthetic stats click initializes before its target handler runs', async () => {
  await visit(async page => {
    await page.locator('#statsDemo .seg button').first().evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('#statPlays').textContent.trim() === '23');
    assert.equal(await page.locator('#statsDemo .seg button.is-on').innerText(), '日');
    assert.equal(await page.locator('#statChart .bar').count(), 24);
    await page.locator('#statsDemo').scrollIntoViewIfNeeded();
    // 初次可见回调后的原 800ms 数字过渡也不能覆盖用户刚选的范围
    await page.waitForTimeout(900);
    assert.equal(await page.locator('#statPlays').innerText(), '23');
    assert.equal(await page.locator('#statChart .bar').count(), 24);
  });
});

test('without IntersectionObserver all demos keep the complete eager fallback', async () => {
  await visit(async page => {
    assert.ok((await page.evaluate(() => distantDemoReads.length)) > 0);
    assert.ok(await page.locator('#statChart .bar').count());
    assert.ok(await page.locator('#roomWires line').count());
  }, true);
});
