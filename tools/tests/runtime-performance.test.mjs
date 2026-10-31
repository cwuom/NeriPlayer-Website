import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test, { after } from 'node:test';

const core = await readFile(new URL('../../assets/js/core.js', import.meta.url), 'utf8');
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

function scrollFixture(initial = 0) {
  let y = initial;
  const reads = { position: 0, height: 0 };
  const listeners = new Map();
  const on = (type, fn) => listeners.set(type, [...listeners.get(type) || [], fn]);
  const dispatch = (type, event = {}) => { for (const fn of listeners.get(type) || []) fn(event); };
  const window = {
    get scrollY() { reads.position++; return y; }, innerHeight: 800, innerWidth: 1280,
    matchMedia: () => ({ matches: false }), addEventListener: on,
    scrollTo: (_x, next) => { y = Math.max(0, Math.min(5200, Math.round(next))); },
  };
  const document = {
    documentElement: { lang: 'zh-CN', style: { setProperty() {} }, classList: { toggle() {} }, get scrollHeight() { reads.height++; return 6000; } },
    body: {}, addEventListener() {},
  };
  vm.runInNewContext(core, { window, document, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {} });
  const NP = window.NP;
  return {
    NP, reads, window, dispatch, actual: () => y, set: value => { y = value; },
    native(value) { y = value; dispatch('scroll'); },
    resetReads() { reads.position = 0; reads.height = 0; },
  };
}

for (const initialHeight of [0, 800]) test(`forced font relayouts preserve callbacks without rewriting the unchanged ${initialHeight}px viewport`, () => {
  const writes = [];
  const document = {
    documentElement: { lang: 'zh-CN', clientWidth: 1280, style: { setProperty: (...args) => writes.push(args) }, classList: { toggle() {} } },
    body: {}, addEventListener() {},
  };
  const window = { innerHeight: initialHeight, innerWidth: 1280, matchMedia: () => ({ matches: false }), addEventListener() {} };
  vm.runInNewContext(core, { window, document, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {} });
  let callbacks = 0;
  window.NP.onResize(() => callbacks++);
  window.NP.measure(true);
  window.NP.measure(true);
  document.documentElement.clientWidth = 1000;
  window.NP.measure(true);
  assert.deepEqual(writes, [['--vh', initialHeight + 'px']]);
  assert.equal(callbacks, 3, 'font changes and width changes still refresh every geometry consumer');
  window.innerHeight = 1000;
  window.NP.measure(true);
  assert.deepEqual(writes, [['--vh', initialHeight + 'px'], ['--vh', '1000px']]);
});

test('idle scroll frames use the cached position without querying document geometry', () => {
  const fixture = scrollFixture(150);
  fixture.NP.smoothScroll.init();
  fixture.resetReads();
  for (let frame = 0; frame < 120; frame++) {
    fixture.NP.smoothScroll.update(1 / 60);
    fixture.NP.scroll.update(1 / 60);
  }
  assert.equal(fixture.NP.scroll.y, 150);
  assert.deepEqual(fixture.reads, { position: 0, height: 0 });
});

test('native scroll changes retain the velocity response and its idle decay', () => {
  const fixture = scrollFixture();
  fixture.NP.smoothScroll.init();
  fixture.native(100);
  fixture.resetReads();
  fixture.NP.scroll.update(.1);
  assert.equal(fixture.NP.scroll.y, 100);
  assert.ok(Math.abs(fixture.NP.scroll.vy - 503.4146962085905) < 1e-9);
  const moving = fixture.NP.scroll.vy;
  fixture.NP.scroll.update(.1);
  assert.ok(fixture.NP.scroll.vy > 0 && fixture.NP.scroll.vy < moving);
  fixture.native(0);
  fixture.NP.scroll.update(.1);
  assert.ok(fixture.NP.scroll.vy < 0);
  assert.equal(fixture.reads.height, 0);
});

test('smooth and instant programmatic scrolling update the cache in the same frame', () => {
  const fixture = scrollFixture();
  fixture.NP.smoothScroll.init();
  fixture.NP.scrollTo(1200);
  fixture.NP.smoothScroll.update(.1);
  assert.equal(fixture.actual(), 8, 'the original easing and browser pixel rounding stay intact');
  assert.equal(fixture.NP.scroll.y, 8, 'frame consumers must see the result before the asynchronous scroll event');
  for (let frame = 0; frame < 80; frame++) {
    fixture.NP.smoothScroll.update(1 / 60);
    fixture.NP.scroll.update(1 / 60);
    assert.equal(fixture.NP.scroll.y, fixture.actual());
  }
  assert.equal(fixture.actual(), 1200);
  fixture.NP.scrollTo(400, true);
  assert.equal(fixture.NP.scroll.y, 400);
  fixture.window.scrollTo(0, 700);
  fixture.dispatch('scroll');
  fixture.NP.scroll.update(1 / 60);
  assert.equal(fixture.NP.scroll.y, 700);
});

test('first pageshow leaves geometry reads to scroll initialization and native scrolling', () => {
  const fixture = scrollFixture(900);
  fixture.resetReads();
  fixture.dispatch('pageshow', { persisted: false });
  assert.deepEqual(fixture.reads, { position: 0, height: 0 }, 'the first pageshow must not force layout');
  fixture.NP.smoothScroll.init();
  assert.equal(fixture.NP.scroll.y, 900, 'initialization still restores the actual position');
  fixture.resetReads();
  fixture.dispatch('pageshow', { persisted: false });
  assert.deepEqual(fixture.reads, { position: 0, height: 0 });
  fixture.native(450);
  assert.equal(fixture.NP.scroll.y, 450, 'native scrolling remains the cache update path');
});

test('initial scroll restoration and pageshow rebuild the cache without resuming an old tween', () => {
  const fixture = scrollFixture();
  fixture.set(900);
  fixture.NP.smoothScroll.init();
  assert.equal(fixture.NP.scroll.y, 900);
  fixture.NP.scrollTo(2000);
  fixture.NP.smoothScroll.update(.1);
  fixture.set(450);
  fixture.resetReads();
  fixture.dispatch('pageshow', { persisted: true });
  assert.deepEqual(fixture.reads, { position: 1, height: 0 }, 'BFCache restoration still reads the restored position');
  assert.equal(fixture.NP.scroll.y, 450);
  assert.equal(fixture.NP.scroll.vy, 0);
  fixture.resetReads();
  fixture.NP.smoothScroll.update(.1);
  fixture.NP.scroll.update(.1);
  assert.equal(fixture.actual(), 450, 'restoring the page must not resume the previous navigation tween');
  assert.equal(fixture.NP.scroll.vy, 0);
  assert.deepEqual(fixture.reads, { position: 0, height: 0 });
});

async function visit(run, { path = '/', setup = async () => {} } = {}) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  try {
    await setup(page);
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NP?.baseReady);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

async function chainState(page) {
  return page.locator('#wireFlow').evaluate(node => {
    const animation = node.getAnimations().find(animation => animation.animationName === 'dash');
    return { state: animation.playState, time: animation.currentTime, duration: animation.effect.getTiming().duration, easing: animation.effect.getTiming().easing, name: getComputedStyle(node).animationName };
  });
}

async function waitForChain(page, state) {
  await page.waitForFunction(state => {
    const animation = document.querySelector('#wireFlow').getAnimations().find(animation => animation.animationName === 'dash');
    return animation.playState === state && !animation.pending;
  }, state);
}

async function waitForDashAdvance(page, time) {
  await page.waitForFunction(time => document.querySelector('#wireFlow').getAnimations().find(animation => animation.animationName === 'dash').currentTime > time + 100, time, { timeout: 3000 });
}

test('the offscreen chain pauses its existing animation and resumes the same visible dash motion', async () => {
  await visit(async page => {
    await page.waitForTimeout(100);
    assert.equal((await chainState(page)).state, 'paused');
    await waitForChain(page, 'paused');
    const before = await chainState(page);
    await page.waitForTimeout(150);
    assert.ok(Math.abs((await chainState(page)).time - before.time) < 1);
    await page.locator('#chain').scrollIntoViewIfNeeded();
    await waitForChain(page, 'running');
    const visible = await chainState(page);
    assert.equal(visible.duration, 1000);
    assert.equal(visible.easing, 'linear');
    assert.equal(visible.name, 'dash');
    await waitForDashAdvance(page, visible.time);
    await page.evaluate(() => NP.scrollTo(0, true));
    await waitForChain(page, 'paused');
    const paused = await chainState(page);
    await page.waitForTimeout(150);
    assert.ok(Math.abs((await chainState(page)).time - paused.time) < 1);
    await page.locator('#chain').scrollIntoViewIfNeeded();
    await waitForChain(page, 'running');
    assert.ok((await chainState(page)).time >= paused.time, 'visibility changes must retain the animation phase');
  });
});

test('without IntersectionObserver the chain remains animated and operable', async () => {
  await visit(async page => {
    const before = await chainState(page);
    assert.equal(before.state, 'running');
    await waitForDashAdvance(page, before.time);
    await page.locator('#chain label.pswitch').click();
    assert.equal(await page.locator('#bitPerfect').isChecked(), true);
    assert.equal(await page.locator('#chain').evaluate(node => node.classList.contains('is-bp')), true);
  }, { setup: page => page.addInitScript(() => { delete window.IntersectionObserver; }) });
});

test('real native scrolling, initial hash and history restoration stay synchronized with the cached state', async () => {
  await visit(async page => {
    await page.waitForFunction(() => window.runtimePageShown);
    await page.waitForFunction(() => scrollY > 100 && Math.abs(NP.scroll.y - scrollY) < 1);
    await page.evaluate(() => history.replaceState(null, '', location.pathname));
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForFunction(() => Math.abs(NP.scroll.y - scrollY) < 1 && scrollY > 1100);
    const saved = await page.evaluate(() => scrollY);
    await page.goto(base + '/en/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.baseReady);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    // pageshow 前的位置可能只是历史恢复的中间状态，不能在浏览器恢复完成前发出新滚动
    await page.waitForFunction(saved => window.runtimePageShown && NP.baseReady && Math.abs(NP.scroll.y - scrollY) < 1 && Math.abs(scrollY - saved) < 2, saved);
    const immediate = await page.evaluate(() => {
      NP.scrollTo(300, true);
      return { cached: NP.scroll.y, actual: scrollY };
    });
    assert.deepEqual(immediate, { cached: 300, actual: 300 }, 'an instant scroll updates the cache before returning');
    const nextFrame = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve({ cached: NP.scroll.y, actual: scrollY }))));
    assert.deepEqual(nextFrame, { cached: 300, actual: 300 }, 'the settled history restoration must not overwrite the new scroll');
  }, {
    path: '/#download',
    setup: page => page.addInitScript(() => {
      window.runtimePageShown = false;
      window.addEventListener('pageshow', () => { window.runtimePageShown = true; });
      window.addEventListener('pagehide', () => { window.runtimePageShown = false; });
    }),
  });
});
