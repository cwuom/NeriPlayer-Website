import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/js/core.js', import.meta.url), 'utf8');

function fixture() {
  let y = 0;
  const window = {
    get scrollY() { return y; }, innerHeight: 800,
    matchMedia: () => ({ matches: false }), addEventListener() {},
    scrollTo(_x, value) { y = Math.round(Math.max(0, Math.min(5200, value))); },
  };
  const document = {
    documentElement: { lang: 'zh-CN', scrollHeight: 6000, style: { setProperty() {} }, classList: { toggle() {} } },
    addEventListener() {},
  };
  vm.runInNewContext(source, { window, document, setTimeout() {}, clearTimeout() {}, requestAnimationFrame() {} });
  return { NP: window.NP, window, y: () => y };
}

test('retargeting a scroll preserves position, easing progress and the original completion time', () => {
  const { NP, y } = fixture();
  NP.scrollTo(1200);
  NP.smoothScroll.update(.25);
  const before = y();
  NP.retargetScroll(3600);
  NP.smoothScroll.update(0);
  assert.equal(y(), before, 'changing the target must not jump the current frame');
  const progress = .25 / (.7 + 1200 / 9000);
  const eased = NP.math.ease.inOut(progress);
  const revisedStart = (before - eased * 3600) / (1 - eased);
  NP.smoothScroll.update(.1);
  const nextEase = NP.math.ease.inOut((.25 + .1) / (.7 + 1200 / 9000));
  assert.equal(y(), Math.round(revisedStart + (3600 - revisedStart) * nextEase), 'the active curve keeps its existing progress');
  NP.smoothScroll.update(.7 + 1200 / 9000 - .35);
  assert.equal(y(), 3600, 'retargeting must finish at the original deadline');
});

test('retargeting preserves a position the browser already adjusted during layout', () => {
  const { NP, window, y } = fixture();
  NP.scrollTo(1200);
  NP.smoothScroll.update(.25);
  window.scrollTo(0, 1800);
  NP.retargetScroll(3600);
  NP.smoothScroll.update(0);
  assert.equal(y(), 1800, 'a delayed native scroll event must not restore the pre-layout position');
});

test('a settled scroll can start a correction and still clamps the destination to the page', () => {
  const { NP, y } = fixture();
  NP.scrollTo(400, true);
  NP.retargetScroll(9000);
  NP.smoothScroll.update(2.1);
  assert.equal(y(), 5200);
  assert.equal(NP.scroll.y, 5200);
});
