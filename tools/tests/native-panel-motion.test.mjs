import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const site = process.env.SITE_URL || 'http://localhost:6060';

async function check(run, width = 1440, reducedMotion = 'no-preference') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(site, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.booted);
    await page.evaluate(() => document.fonts.ready);
    await enablePreviewInteractions(page, ['settings']);
    const host = page.locator('[data-app-preview="settings"]');
    await host.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(() => {
      for (let el = document.querySelector('[data-app-preview="settings"]'); el; el = el.parentElement) if (+getComputedStyle(el).opacity < .999) return false;
      return true;
    });
    await stableDisplay(host);
    await run(page, host);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function stableDisplay(host) {
  await host.evaluate(async el => {
    let previous, stable = 0;
    const started = performance.now();
    while (performance.now() - started < 5000) {
      await new Promise(requestAnimationFrame);
      const box = el.getBoundingClientRect();
      const sample = [scrollX, scrollY, box.x, box.y, box.width, box.height];
      let moving = document.fonts.status === 'loading';
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
        moving ||= ancestor.getAnimations().some(animation => animation.playState === 'running' || animation.pending);
      }
      stable = !moving && previous && sample.every((value, i) => Math.abs(value - previous[i]) < .01) ? stable + 1 : 0;
      if (stable >= 3) return;
      previous = sample;
    }
    throw new Error('the display and its outer scroll must settle before sampling native motion');
  });
}

async function seek(layer, time) {
  await layer.evaluate(async (el, time) => {
    const motion = el._nativeMotion;
    const animation = motion ? motion.driver : el.getAnimations()[0];
    if (animation) { animation.pause(); animation.currentTime = Math.min(time, animation.effect.getComputedTiming().duration); }
    if (motion && motion.draw) motion.draw();
    await new Promise(requestAnimationFrame);
  }, time);
}

async function escapedInk(page, host) {
  await host.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  // 页面滚动尚未落定时，旧坐标可能把手机底部误当作屏幕外区域
  for (let attempt = 0; attempt < 3; attempt++) {
    await stableDisplay(host);
    const before = await host.evaluate(el => ({ box: el.getBoundingClientRect().toJSON(), scrollX, scrollY }));
    const box = before.box;
    const clip = { x: Math.ceil(box.x + box.width * .2), y: Math.ceil(box.y + box.height + 5), width: Math.floor(box.width * .6), height: Math.floor(Math.min(100, 1100 - box.y - box.height - 10)) };
    assert.ok(clip.height > 20, 'the browser must show the area below the phone');
    const image = PNG.sync.read(await page.screenshot({ clip }));
    const after = await host.evaluate((el, { x, y }) => ({ box: el.getBoundingClientRect().toJSON(), scrollX, scrollY, hit: document.elementsFromPoint(x, y).some(node => node.closest('.ap-native-device')) }), { x: clip.x + clip.width / 2, y: clip.y + 10 });
    if (Math.abs(before.scrollX - after.scrollX) >= .01 || Math.abs(before.scrollY - after.scrollY) >= .01 || ['x', 'y', 'width', 'height'].some(key => Math.abs(before.box[key] - after.box[key]) >= .01)) continue;
    let ink = 0;
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i] > 180 && image.data[i + 1] < 80 && image.data[i + 2] > 140) ink++;
    return { ink, hit: after.hit };
  }
  throw new Error('the display moved while screenshot and hit-test coordinates were being sampled');
}

test('native opening and closing cannot paint or receive input outside the phone at any sampled frame', async () => {
  for (const width of [375, 1440]) for (const style of ['clean', 'material']) {
    await check(async (page, host) => {
      await page.evaluate(style => NP.themes.select(style), style);
      await host.locator('[data-ap-open-player]').click();
      const layer = host.locator('.ap-native-device[data-kind="player"]');
      await layer.evaluate(el => {
        const ph = el.querySelector('.ph');
        ph.style.background = '#ff00ee';
        ph.querySelectorAll(':scope > *').forEach(child => child.style.visibility = 'hidden');
      });
      for (const time of [0, 30, 80, 150, 250, 400, 650]) {
        await seek(layer, time);
        assert.deepEqual(await escapedInk(page, host), { ink: 0, hit: false }, `${width} ${style} opening ${time}ms must be clipped by the fixed display`);
      }
      await layer.evaluate(el => { const motion = el._nativeMotion; if (motion) motion.driver.finish(); else el.getAnimations().forEach(a => a.finish()); });
      await host.evaluate(el => el._appPreview.closeNative(el.querySelector('.ap-native-device[data-kind="player"]')));
      for (const time of [0, 30, 80, 150, 249]) {
        await seek(layer, time);
        assert.deepEqual(await escapedInk(page, host), { ink: 0, hit: false }, `${width} ${style} closing ${time}ms must be clipped by the fixed display`);
      }
    }, width);
  }
});

test('reopening cancels an in-flight close and repeated close calls have one owner', async () => {
  await check(async (page, host) => {
    await host.locator('[data-ap-open-player]').click();
    const layer = host.locator('.ap-native-device[data-kind="player"]');
    await layer.evaluate(el => { const motion = el._nativeMotion; if (motion) motion.driver.finish(); else el.getAnimations().forEach(a => a.finish()); });
    await host.evaluate(el => el._appPreview.closeNative(el.querySelector('.ap-native-device')));
    await seek(layer, 100);
    await host.evaluate(el => { el.querySelector('.ap-native-device').getAnimations().forEach(animation => animation.play()); el._appPreview.openNative('player'); });
    await page.waitForTimeout(700);
    assert.equal(await layer.evaluate(el => el.hidden), false, 'an obsolete close callback must not hide a reopened player');
    assert.equal(await host.locator('.app-preview').evaluate(el => el.inert), true);
    assert.equal(await layer.evaluate(el => el.inert), false);
    await host.evaluate(el => { const preview = el._appPreview, layer = el.querySelector('.ap-native-device'); preview.closeNative(layer); preview.closeNative(layer); });
    await layer.waitFor({ state: 'hidden' });
    assert.equal(await host.locator('.app-preview').evaluate(el => el.inert), false);
    assert.equal(await host.locator('[data-ap-open-player]').evaluate(el => el === document.activeElement), true);
  });
});

test('reduced motion opens and returns synchronously inside the same display in both layouts and themes', async () => {
  for (const width of [375, 1440]) for (const style of ['clean', 'material']) {
    await check(async (page, host) => {
      await page.evaluate(style => NP.themes.select(style), style);
      await host.locator('[data-ap-open-player]').click();
      const layer = host.locator('.ap-native-device[data-kind="player"]');
      assert.equal(await layer.evaluate(el => el._nativeMotion.driver), null);
      assert.equal(await host.locator('.ap-native-cover,.ap-native-card').count(), 0);
      assert.equal(await host.locator('.ap-mini-progress').count(), 0);
      assert.deepEqual(await escapedInk(page, host), { ink: 0, hit: false });
      await layer.locator('.pg-cover [data-ph-collapse]').click();
      assert.equal(await layer.evaluate(el => el.hidden), true);
      assert.equal(await host.locator('.app-preview').evaluate(el => el.inert), false);
      assert.equal(await host.locator('[data-ap-open-player]').evaluate(el => el === document.activeElement), true);
    }, width, 'reduce');
  }
});

test('one artwork flies out of the real capsule, while the card and content follow source geometry', async () => {
  await check(async (page, host) => {
    const mini = host.locator('.ap-mini');
    await host.locator('[data-ap-open-player]').click();
    const layer = host.locator('.ap-native-device[data-kind="player"]');
    await seek(layer, 0);
    const card = host.locator('.ap-native-card');
    const { source, start } = await host.evaluate(el => ({ source: el.querySelector('.ap-mini').getBoundingClientRect().toJSON(), start: el.querySelector('.ap-native-card').getBoundingClientRect().toJSON() }));
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(start[key] - source[key]) < 1, `capsule ${key} must be the opening geometry`);
    assert.equal(await layer.evaluate(el => +getComputedStyle(el).opacity), 0);
    const early = await host.locator('.ap-native-cover').boundingBox();
    await seek(layer, 180);
    const middle = await host.locator('.ap-native-cover').boundingBox();
    assert.ok(middle.width > early.width && middle.y < early.y);
    assert.equal(await host.locator('.ap-native-cover').count(), 1);
    assert.equal(await layer.locator('.pc-art>img').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    const halfway = await card.boundingBox();
    assert.ok(halfway.height > start.height * 3);
    assert.ok(+await layer.evaluate(el => getComputedStyle(el).opacity) > .8);
    await layer.evaluate(el => el._nativeMotion.driver.cancel());
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"] .ap-native-device').dataset.nativeMorph);
    assert.equal(await host.locator('.ap-native-cover,.ap-native-card,.ap-native-scrim').count(), 0);
    assert.equal(await layer.locator('.pc-art>img').evaluate(el => getComputedStyle(el).visibility), 'visible');
    assert.equal(await layer.evaluate(el => el.hidden), false);
    assert.equal(await mini.locator('img').evaluate(el => getComputedStyle(el).opacity), '1');
  });
});

test('nested DSP and player transitions keep their stack, focus, playback and latest state when interrupted', async () => {
  await check(async (page, host) => {
    await host.locator('[data-ap-setting="audio"]').click();
    const dsp = host.locator('.ap-native-device[data-kind="dsp"]');
    await dsp.locator('.hm-mini__id').click();
    const player = host.locator('.ap-native-device[data-kind="player"]');
    await seek(player, 180);
    await dsp.evaluate(el => { if (el._nativeMotion.driver) el._nativeMotion.driver.finish(); });
    assert.equal(await host.evaluate(el => Array.from(el.querySelectorAll('.ap-status,.ph__status')).filter(node => {
      if (getComputedStyle(node).visibility === 'hidden' || !node.getBoundingClientRect().width) return false;
      for (let ancestor = node; ancestor !== el; ancestor = ancestor.parentElement) if (+getComputedStyle(ancestor).opacity < .005) return false;
      return true;
    }).length), 1, 'a finishing background page must not release the foreground system chrome');
    await page.evaluate(() => NP.themes.select('material'));
    await seek(player, 180);
    assert.equal(await host.locator('.app-preview > .ap-status').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'a theme render must join the foreground system-chrome ownership');
    assert.equal(await player.evaluate(el => el.isConnected && !el.hidden), true);
    assert.equal(await dsp.evaluate(el => el.inert), true);
    await player.evaluate(el => el._nativeMotion.driver.cancel());
    await player.locator('.pg-cover [data-ph-toggle]').click();
    await page.waitForFunction(() => NP.player.playing);
    await player.locator('.pg-cover [data-ph-collapse]').click();
    await player.waitFor({ state: 'hidden' });
    assert.equal(await dsp.evaluate(el => el.inert), false);
    assert.equal(await page.evaluate(() => NP.player.playing), true);
    assert.equal(await dsp.evaluate(el => el.contains(document.activeElement)), true);
    await dsp.locator('.fxa-bar .pbtn').click();
    await dsp.waitFor({ state: 'hidden' });
    assert.equal(await host.locator('.app-preview').evaluate(el => el.inert), false);
    assert.equal(await host.locator('.ap-native-cover,.ap-native-card,.ap-native-scrim').count(), 0);
  });
});

test('native edge return cancels and commits from the held frame with one decoded artwork', async () => {
  await check(async (page, host) => {
    await host.locator('[data-ap-open-player]').click();
    const layer = host.locator('.ap-native-device[data-kind="player"]');
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"] .ap-native-device')._nativeMotion.driver);
    const session = await page.context().newCDPSession(page);
    await layer.evaluate(el => {
      window.nativeMoveCount = 0;
      window.nativeReleaseCount = 0;
      el.addEventListener('pointermove', () => { window.nativeMoveCount++; });
      function frame() { const cover = el.parentElement.querySelector('.ap-native-cover'); return cover && cover.getBoundingClientRect().toJSON(); }
      for (const type of ['pointercancel', 'pointerup']) {
        el.addEventListener(type, () => { window.nativeRelease = { before: frame() }; }, true);
        el.addEventListener(type, () => { window.nativeRelease.after = frame(); window.nativeReleaseCount++; });
      }
    });
    for (const [fraction, event] of [[.2, 'touchCancel'], [.6, 'touchEnd']]) {
      await stableDisplay(host);
      const viewport = await host.locator('.ap-native-viewport').boundingBox();
      const x = viewport.x + viewport.width * .03, y = viewport.y + viewport.height * .2;
      const processed = await page.evaluate(() => ({ moves: window.nativeMoveCount, releases: window.nativeReleaseCount }));
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + viewport.width * fraction, y }] });
      await page.waitForFunction(count => window.nativeMoveCount > count, processed.moves);
      assert.ok(Math.abs(await layer.evaluate(el => el._nativeMotion.value) - (1 - fraction * .4)) < .01);
      await host.evaluate(el => { window.nativeHeldCover = el.querySelector('.ap-native-cover'); });
      await session.send('Input.dispatchTouchEvent', { type: event, touchPoints: [] });
      await page.waitForFunction(count => window.nativeReleaseCount > count, processed.releases);
      const release = await host.evaluate(el => ({ sameCover: window.nativeHeldCover === el.querySelector('.ap-native-cover'), ...window.nativeRelease }));
      assert.equal(release.sameCover, true, 'return retargeting must reuse the decoded artwork rather than replace it');
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(release.before[key] - release.after[key]) < .3, `${event} ${key} must continue from the held frame`);
      if (event === 'touchCancel') {
        await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"] .ap-native-device')._nativeMotion.driver);
        assert.equal(await layer.evaluate(el => el.hidden), false);
      } else await layer.waitFor({ state: 'hidden' });
      assert.equal(await host.locator('.ap-native-cover,.ap-native-card,.ap-native-scrim').count(), 0);
    }
    assert.equal(await host.locator('.app-preview').evaluate(el => el.inert), false);
    assert.equal(await host.locator('[data-ap-open-player]').evaluate(el => el === document.activeElement), true);
    await session.detach();
  }, 375);
});

test('system status and gesture chrome stay fixed and paint once throughout the native morph', async () => {
  await check(async (page, host) => {
    await host.locator('[data-ap-open-player]').click();
    const layer = host.locator('.ap-native-device[data-kind="player"]');
    let reference;
    for (const time of [0, 80, 180, 300, 500, 680]) {
      await seek(layer, time);
      const chrome = await host.evaluate(el => {
        const visible = selector => Array.from(el.querySelectorAll(selector)).filter(node => {
          if (getComputedStyle(node).visibility === 'hidden' || !node.getBoundingClientRect().width) return false;
          for (let ancestor = node; ancestor !== el; ancestor = ancestor.parentElement) if (+getComputedStyle(ancestor).opacity < .005) return false;
          return true;
        });
        return { status: visible('.ap-status,.ph__status').map(node => node.getBoundingClientRect().toJSON()), gesture: visible('.ap-gesture,.ph__gesture').map(node => node.getBoundingClientRect().toJSON()) };
      });
      assert.equal(chrome.status.length, 1, `${time}ms must paint one status bar`);
      assert.equal(chrome.gesture.length, 1, `${time}ms must paint one system gesture handle`);
      if (!reference) reference = chrome;
      for (const type of ['status', 'gesture']) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(chrome[type][0][key] - reference[type][0][key]) < .3, `${type} ${key} must stay outside content transforms`);
    }
    await layer.evaluate(el => el._nativeMotion.driver.finish());
    assert.equal(await host.locator('.ap-native-chrome').count(), 0);
    assert.equal(await layer.locator('.ph__status').evaluate(el => getComputedStyle(el).visibility), 'visible');
    await host.evaluate(el => { const layer = el.querySelector('.ap-native-device[data-kind="player"]'); el._appPreview.closeNative(layer); layer._nativeMotion.driver.finish(); });
    await layer.waitFor({ state: 'hidden' });
    await host.evaluate(el => el._appPreview.openNative('dsp'));
    const dsp = host.locator('.ap-native-device[data-kind="dsp"]');
    await seek(dsp, 80);
    await host.evaluate(el => { el.querySelector('.hm-mini').focus(); el._appPreview.openNative('player'); });
    await seek(layer, 180);
    await dsp.evaluate(el => el._nativeMotion.driver.finish());
    assert.equal(await host.evaluate(el => Array.from(el.querySelectorAll('.ap-status,.ph__status')).filter(node => {
      if (getComputedStyle(node).visibility === 'hidden' || !node.getBoundingClientRect().width) return false;
      for (let ancestor = node; ancestor !== el; ancestor = ancestor.parentElement) if (+getComputedStyle(ancestor).opacity < .005) return false;
      return true;
    }).length), 1, 'overlapping native transitions must keep only the foremost system bar');
  });
});

test('native status glyphs and gesture match the originating display before, during and after handoffs', async () => {
  for (const width of [375, 1440]) for (const style of ['clean', 'material']) await check(async (page, host) => {
    await page.evaluate(style => NP.themes.select(style), style);
    async function compare(stage) {
      const glyphs = await host.evaluate(el => {
        const base = el.querySelector('.app-preview'), active = el.querySelector('.ap-native-chrome') || el.querySelector('.ap-native-device:not([hidden]) .ph') || base;
        function rects(scope, native) {
          const status = scope.querySelector(native ? '.ph__status' : '.ap-status');
          const clock = status.firstElementChild, icons = status.lastElementChild;
          const range = document.createRange(); range.selectNodeContents(clock);
          return [clock, ...icons.children, scope.querySelector(native ? '.ph__gesture' : '.ap-gesture')].map(node => node.getBoundingClientRect().toJSON()).concat(range.getBoundingClientRect().toJSON());
        }
        return { source: rects(base, false), actual: rects(active, active !== base) };
      });
      for (let i = 0; i < glyphs.source.length; i++) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(glyphs.source[i][key] - glyphs.actual[i][key]) < .1, `${width} ${style} ${stage} glyph ${i} ${key} must not jump at a system-chrome handoff`);
    }
    await compare('before');
    await host.locator('[data-ap-open-player]').click();
    const layer = host.locator('.ap-native-device[data-kind="player"]');
    await seek(layer, 0); await compare('initial');
    await seek(layer, 180); await compare('opening');
    await layer.evaluate(el => el._nativeMotion.driver.finish()); await compare('settled');
    await layer.locator('.pg-cover [data-ph-collapse]').click();
    await seek(layer, 0); await compare('close-initial');
    await seek(layer, 100); await compare('closing');
    await layer.evaluate(el => el._nativeMotion.driver.finish());
    await layer.waitFor({ state: 'hidden' }); await compare('closed');
  }, width);
});
