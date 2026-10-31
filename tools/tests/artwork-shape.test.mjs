import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const site = process.env.SITE_URL || 'http://localhost:6060';
function shape() {
  const window = { NP: {} };
  runInNewContext(readFileSync(new URL('../../assets/js/app-artwork-shape.js', import.meta.url), 'utf8'), { window });
  return window.NP.artworkShape;
}
function numbers(path) { return path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number); }

test('continuous artwork uses the Android four-cubic control points and radius extension', () => {
  const path = shape().path(40, 40, 10, 1);
  assert.equal((path.match(/C/g) || []).length, 4);
  assert.equal(path.includes('A'), false);
  const expected = [11, 0, 29, 0, 36.073, 0, 40, 3.927, 40, 11, 40, 29, 40, 36.073, 36.073, 40, 29, 40, 11, 40, 3.927, 40, 0, 36.073, 0, 29, 0, 11, 0, 3.927, 3.927, 0, 11, 0];
  numbers(path).forEach((number, i) => assert.ok(Math.abs(number - expected[i]) < 1e-10, `source control point ${i}`));
});

test('zero smoothing preserves true circular arcs and intermediate smoothing matches source geometry', () => {
  const helper = shape();
  const circular = helper.path(40, 40, 10, 0);
  assert.equal((circular.match(/A/g) || []).length, 4);
  assert.equal(circular.includes('C'), false);
  assert.equal(helper.path(40, 40, 10, -1), circular);
  assert.equal(helper.path(40, 40, 10, 2), helper.path(40, 40, 10, 1));
  const middle = numbers(helper.path(40, 40, 10, .5));
  assert.equal(middle[0], 10.5);
  assert.ok(Math.abs(middle[4] - 35.7752449375) < 1e-10);
  assert.ok(Math.abs(middle[7] - 4.2247550625) < 1e-10);
  assert.equal(helper.clip(40, 40, 10, 0), `path('${circular}')`);
});

test('source corner tiles clamp to half the smaller dimension without invalid coordinates', () => {
  const helper = shape();
  assert.equal(numbers(helper.path(40, 20, 200, 1))[0], 10);
  assert.equal(numbers(helper.path(40, 20, -5, 1))[0], 0);
  assert.equal(helper.path(0, 40, 10, 1), 'M 0 0 Z');
  assert.equal(helper.path(40, Number.NaN, 10, 1), 'M 0 0 Z');
});

async function check(run) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(site, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test('static cover and mini endpoints share exact paths with the flight metadata in both themes', async () => {
  await check(async page => {
    for (const style of ['clean', 'material']) {
      await page.evaluate(style => NP.themes.select(style), style);
      const values = await page.evaluate(() => {
        const root = document.querySelector('#phPlay');
        const cover = root.querySelector('.pc-art'), lyric = root.querySelector('.pl-top>img');
        const mini = document.querySelector('[data-app-preview="settings"] .ap-mini-open>img');
        const frame = NP.phoneUI.artwork(root).frame;
        return [cover, lyric, mini].map(node => { const css = getComputedStyle(node), normalized = document.createElement('i').style; normalized.clipPath = NP.artworkShape.clip(parseFloat(css.width), parseFloat(css.height), parseFloat(css.getPropertyValue('--ph-cover-corner')), +css.getPropertyValue('--ph-cover-smoothing')); return { radius: parseFloat(css.getPropertyValue('--ph-cover-corner')), smoothing: +css.getPropertyValue('--ph-cover-smoothing'), border: css.borderTopLeftRadius, clip: css.clipPath, expected: normalized.clipPath, frame }; });
      });
      assert.deepEqual(values.map(value => value.radius), [24, 10, style === 'clean' ? 10 : 8]);
      assert.deepEqual(values.map(value => value.smoothing), [style === 'clean' ? 1 : 0, 0, style === 'clean' ? 1 : 0]);
      for (const value of values) {
        assert.equal(value.border, '0px', 'the old circular crop must not intersect the source path');
        assert.deepEqual(numbers(value.clip), numbers(value.expected));
      }
      assert.equal(values[0].frame.corner, 24);
      assert.equal(values[0].frame.cornerSmoothing, style === 'clean' ? 1 : 0);
    }
  });
});

test('browser paths reproduce the Android coverage probes between circular and continuous corners', async () => {
  await check(async page => {
    const coverage = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d');
      return [0, .5, 1].map(smoothing => {
        const path = new Path2D(NP.artworkShape.path(40, 40, 10, smoothing));
        return [context.isPointInPath(path, 2.90, 2.90), context.isPointInPath(path, 2.87, 2.87)];
      });
    });
    assert.deepEqual(coverage, [[false, false], [true, false], [true, true]]);
  });
});

test('cover lyrics intermediate paths and rapid reverse preserve their painted smoothing', async () => {
  await check(async page => {
    await page.locator('#phPlay').scrollIntoViewIfNeeded();
    for (const style of ['clean', 'material']) {
      await page.evaluate(style => NP.themes.select(style), style);
      const frames = await page.locator('#phPlay').evaluate(ph => {
        const ui = NP.phoneUI.uis.find(ui => ui.ph === ph);
        ui.setPage(true);
        const frames = [];
        for (const time of [0, 80, 150, 300, 559]) {
          ui.pageMotion.animations.forEach(a => { a.pause(); a.currentTime = time; });
          ui.pageMotion.drawArtwork();
          const art = NP.phoneUI.artwork(ph), css = getComputedStyle(art.node);
          const normalized = document.createElement('i').style;
          normalized.clipPath = NP.artworkShape.clip(parseFloat(css.width), parseFloat(css.height), art.frame.corner, art.frame.cornerSmoothing);
          frames.push({ frame: art.frame, clip: css.clipPath, expected: normalized.clipPath });
        }
        ui.pageMotion.animations.forEach(a => { a.currentTime = 150; }); ui.pageMotion.drawArtwork();
        const heldArt = NP.phoneUI.artwork(ph), held = heldArt.frame, heldClip = getComputedStyle(heldArt.node).clipPath;
        ui.setPage(false);
        ui.pageMotion.animations.forEach(a => { a.pause(); a.currentTime = 0; }); ui.pageMotion.drawArtwork();
        const reverseArt = NP.phoneUI.artwork(ph), reversed = reverseArt.frame, reversedClip = getComputedStyle(reverseArt.node).clipPath;
        ui.pageMotion.animations.forEach(a => { a.currentTime = 560; }); ui.pageMotion.drawArtwork();
        const finalClip = getComputedStyle(NP.phoneUI.artwork(ph).node).clipPath, endpointClip = getComputedStyle(ph.querySelector('.pc-art')).clipPath;
        return { frames, held, reversed, heldClip, reversedClip, finalClip, endpointClip };
      });
      for (const frame of frames.frames) assert.deepEqual(numbers(frame.clip), numbers(frame.expected));
      assert.ok(Math.abs(frames.held.corner - frames.reversed.corner) < .01);
      assert.ok(Math.abs(frames.held.cornerSmoothing - frames.reversed.cornerSmoothing) < .001);
      assert.deepEqual(numbers(frames.heldClip), numbers(frames.reversedClip), 'the painted curve must survive retargeting');
      assert.deepEqual(numbers(frames.finalClip), numbers(frames.endpointClip), 'the flight must hand off the exact endpoint crop');
      assert.equal(frames.frames[0].frame.cornerSmoothing, style === 'clean' ? 1 : 0);
      assert.ok(frames.frames[2].frame.cornerSmoothing < (style === 'clean' ? 1 : .001));
      await page.locator('#phPlay').evaluate(ph => NP.phoneUI.uis.find(ui => ui.ph === ph).pageMotion.animations.forEach(a => a.finish()));
      await page.locator('#phPlay .ph-shared-flight').first().waitFor({ state: 'detached' });
    }
  });
});

test('native artwork uses live child smoothing and the same mini endpoint on open and return', async () => {
  for (const style of ['clean', 'material']) await check(async page => {
    await enablePreviewInteractions(page, ['settings']);
    const host = page.locator('[data-app-preview="settings"]');
    await host.scrollIntoViewIfNeeded();
      await page.evaluate(style => NP.themes.select(style), style);
      await host.locator('[data-ap-open-player]').click();
      const layer = host.locator('.ap-native-device[data-kind="player"]');
      for (const time of [0, 80, 180, 400, 680]) {
        const value = await layer.evaluate((el, time) => {
          const motion = el._nativeMotion; motion.driver.pause(); motion.driver.currentTime = time; motion.draw();
          const css = getComputedStyle(motion.cover), { corner: radius, cornerSmoothing: smoothing, width, height } = motion.coverFrame, normalized = document.createElement('i').style;
          normalized.clipPath = NP.artworkShape.clip(width, height, radius, smoothing);
          return { radius, smoothing, p: Math.max(0, Math.min(1, motion.value)), clip: css.clipPath, expected: normalized.clipPath };
        }, time);
        assert.deepEqual(numbers(value.clip), numbers(value.expected));
        assert.equal(value.smoothing, style === 'clean' ? 1 : 0);
      }
      await layer.evaluate(el => el._nativeMotion.driver.finish());
      await layer.locator('.pg-cover [data-ph-golyrics]').click();
      await layer.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
      await layer.locator('.pg-lyrics [data-ph-collapse]').click();
      const returning = await layer.evaluate(el => {
        const motion = el._nativeMotion; motion.driver.pause(); motion.driver.currentTime = 100; motion.draw();
        const css = getComputedStyle(motion.cover); return { p: Math.max(0, Math.min(1, motion.value)), smoothing: +css.getPropertyValue('--ph-cover-smoothing'), clip: css.clipPath };
      });
      assert.ok(Math.abs(returning.smoothing - (style === 'clean' ? 1 - returning.p : 0)) < .0001);
      await layer.evaluate(el => el._nativeMotion.driver.finish());
      await layer.waitFor({ state: 'hidden' });
  });
});
