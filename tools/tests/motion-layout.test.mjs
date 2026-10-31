import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

async function visit(run, fixture = false) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  if (fixture) await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '#motionSegFixture {position:fixed;top:80px;left:8px;z-index:10000} #motionSegFixture.probe-wide {padding-left:15px}';
      document.head.appendChild(style);
      const seg = document.createElement('div');
      seg.id = 'motionSegFixture';
      seg.className = 'seg';
      seg.innerHTML = '<button class="is-on" type="button">Alpha</button><button type="button">Longer option</button>';
      seg.addEventListener('click', event => {
        const selected = event.target.closest('button');
        if (!selected) return;
        seg.querySelectorAll('button').forEach(button => button.classList.toggle('is-on', button === selected));
        window.motionSegSamples = {};
        requestAnimationFrame(() => {
          const indicator = seg.querySelector('.seg__ind');
          const animation = indicator.getAnimations().find(item => item.transitionProperty === 'translate');
          window.motionSegSamples.duration = animation?.effect.getTiming().duration;
          setTimeout(() => { window.motionSegSamples.middle = parseFloat(getComputedStyle(indicator).translate); }, 100);
        });
      });
      document.body.appendChild(seg);
    }, { once: true });
  });
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NP?.baseReady);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

test('parallax measurement batches translate resets before geometry reads without changing the measured boxes', async () => {
  await visit(async page => {
    const result = await page.evaluate(async () => {
      await document.fonts.ready;
      // 页面现有过渡结束后再比较不同任务中的绝对坐标
      await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {})));
      const targets = [...document.querySelectorAll('.sheet__num--xl, .sec-stats dd')];
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      targets.forEach(element => { element.style.translate = ''; });
      const expected = targets.map(rect);
      targets.forEach((element, index) => { element.style.translate = '0 ' + (index + 8) + 'px'; });
      const events = [];
      const elements = new WeakMap(targets.map((element, index) => [element, index]));
      const style = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
      const proxies = new WeakMap();
      const geometry = Element.prototype.getBoundingClientRect;
      let reads = 0;
      let measured;
      const complete = new Promise(resolve => { measured = resolve; });
      Object.defineProperty(HTMLElement.prototype, 'style', {
        ...style,
        get() {
          const declaration = style.get.call(this);
          if (!elements.has(this)) return declaration;
          if (!proxies.has(declaration)) {
            const index = elements.get(this);
            proxies.set(declaration, new Proxy(declaration, {
              get(target, property) {
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
              set(target, property, value) {
                if (property === 'translate' && value === '') events.push({ kind: 'write', index });
                return Reflect.set(target, property, value, target);
              },
            }));
          }
          return proxies.get(declaration);
        },
      });
      Element.prototype.getBoundingClientRect = function (...args) {
        const box = geometry.apply(this, args);
        if (elements.has(this)) {
          const index = elements.get(this);
          events.push({ kind: 'read', index });
          if (++reads === targets.length) measured();
        }
        return box;
      };
      try {
        NP.measure(true);
        // 保留探针直到合并后的视差测量实际完成，再检查原有的写读顺序与几何
        await complete;
      }
      finally {
        Object.defineProperty(HTMLElement.prototype, 'style', style);
        Element.prototype.getBoundingClientRect = geometry;
      }
      return { targets: targets.length, events, expected, actual: targets.map(rect) };
    });
    assert.ok(result.targets >= 6, 'exercise the actual source headings and section statistics');
    assert.equal(result.events.filter(event => event.kind === 'write').length, result.targets);
    assert.equal(result.events.filter(event => event.kind === 'read').length, result.targets);
    const firstRead = result.events.findIndex(event => event.kind === 'read');
    assert.equal(firstRead, result.targets, 'all parallax resets must precede the first measured box instead of alternating writes and reads');
    for (let index = 0; index < result.targets; index++) {
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(result.actual[index][key] - result.expected[index][key]) < .1, `target ${index} ${key} must preserve its original measured geometry: ${JSON.stringify({ expected: result.expected[index], actual: result.actual[index] })}`);
    }
  });
});

test('indicator bookkeeping does not remeasure buttons while user selections keep their full sliding animation', async () => {
  await visit(async page => {
    const ownReads = await page.evaluate(async () => {
      const seg = document.getElementById('motionSegFixture');
      const active = seg.querySelector('button.is-on');
      const indicator = seg.querySelector('.seg__ind');
      const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      let reads = 0;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        ...width,
        get() { if (this === active) reads++; return width.get.call(this); },
      });
      try {
        indicator.classList.add('is-jump');
        await new Promise(resolve => setTimeout(resolve, 0));
        indicator.classList.remove('is-jump');
        await new Promise(resolve => setTimeout(resolve, 0));
      } finally { Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width); }
      return reads;
    });
    assert.equal(ownReads, 0, 'indicator-only class records must not re-enter button geometry measurement');
    const before = await page.locator('#motionSegFixture').evaluate(seg => ({
      left: parseFloat(getComputedStyle(seg.querySelector('.seg__ind')).translate),
      target: seg.querySelectorAll('button')[1].offsetLeft,
      duration: getComputedStyle(seg.querySelector('.seg__ind')).transitionDuration,
      easing: getComputedStyle(seg.querySelector('.seg__ind')).transitionTimingFunction,
    }));
    await page.locator('#motionSegFixture button').nth(1).tap();
    await page.waitForFunction(() => window.motionSegSamples?.middle != null);
    const samples = await page.evaluate(() => motionSegSamples);
    assert.equal(samples.duration, 550, 'the real translate transition must retain its complete duration');
    assert.ok(samples.middle > before.left && samples.middle < before.target, 'the indicator must visibly slide through intermediate positions');
    await page.waitForFunction(() => {
      const seg = document.getElementById('motionSegFixture');
      return Math.abs(parseFloat(getComputedStyle(seg.querySelector('.seg__ind')).translate) - seg.querySelector('button.is-on').offsetLeft) < .1;
    });
    assert.equal(before.duration, '0.55s, 0.55s, 0.55s');
    assert.equal(before.easing, Array(3).fill('cubic-bezier(0.16, 1, 0.3, 1)').join(', '));
    await page.evaluate(() => document.getElementById('motionSegFixture').classList.add('probe-wide'));
    await page.waitForFunction(() => {
      const seg = document.getElementById('motionSegFixture');
      return Math.abs(parseFloat(seg.querySelector('.seg__ind').style.translate) - seg.querySelector('button.is-on').offsetLeft) < .1;
    });
  }, true);
});
