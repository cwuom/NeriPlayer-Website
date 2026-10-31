import { enablePlayerInteractions, enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const site = process.env.SITE_URL || 'http://localhost:6060';

async function browserCheck(run, options = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference', ...options });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(site, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
    await page.waitForFunction(() => !document.querySelector('#devicePlay').classList.contains('is-fontwait'));
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

function favoriteInk(buffer) {
  const image = PNG.sync.read(buffer);
  let count = 0;
  for (let y = 24; y < image.height * .18; y++) for (let x = image.width * .6 | 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4;
    if (image.data[i] > 180 && image.data[i] > image.data[i + 1] * 2 && image.data[i] > image.data[i + 2] * 2) count++;
  }
  return count;
}

async function seekMorph(page, selector, milliseconds) {
  await page.locator(selector).evaluate((ph, time) => {
    const ui = NP.phoneUI.uis.find(ui => ui.ph === ph);
    (ui.pageMotion ? ui.pageMotion.animations : []).forEach(animation => {
      if (time >= animation.effect.getComputedTiming().duration) animation.finish();
      else { animation.pause(); animation.currentTime = time; }
    });
  }, milliseconds);
}

test('cover and lyrics paint one favorite throughout the shared transition in both styles', async () => {
  await browserCheck(async page => {
    await enablePlayerInteractions(page, ['#phPlay']);
    const phone = page.locator('#phPlay');
    await phone.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      for (let el = document.querySelector('#phPlay'); el; el = el.parentElement) if (+getComputedStyle(el).opacity < .999) return false;
      return true;
    });
    for (const style of ['clean', 'material']) {
      await page.evaluate(style => { NP.themes.select(style); NP.player.pause(); NP.player.liked = true; NP.player.emit(); }, style);
      await phone.evaluate(ph => { ph.querySelector('.ph__fluid').style.visibility = 'hidden'; });
      const ink = favoriteInk(await phone.screenshot());
      assert.ok(ink > 40, 'the probe must see the actual favorite glyph');
      await phone.locator('.pg-cover [data-ph-golyrics]').evaluate(button => button.click());
      await seekMorph(page, '#phPlay', 0);
      for (const time of [0, 80, 150, 250, 420]) {
        await seekMorph(page, '#phPlay', time);
        const painted = favoriteInk(await phone.screenshot());
        assert.ok(painted > ink * .82 && painted < ink * 1.18, `${style} at ${time}ms: one opaque favorite should retain its ink (${painted} vs ${ink})`);
      }
      await seekMorph(page, '#phPlay', 560);
      await phone.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
      await phone.locator('.pg-lyrics [data-ph-golyrics]').click();
      await phone.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
    }
  });
});

test('rapid touch reversals start at the painted artwork and restore every endpoint', async () => {
  await browserCheck(async page => {
    await enablePlayerInteractions(page, ['#phPlay']);
    const phone = page.locator('#phPlay');
    await phone.scrollIntoViewIfNeeded();
    await phone.evaluate(ph => {
      function artwork() { return ph.querySelector('[data-flight="cover"]').getBoundingClientRect().toJSON(); }
      function holdMotion() { NP.phoneUI.uis.find(ui => ui.ph === ph).pageMotion.animations.forEach(animation => animation.pause()); }
      ph.addEventListener('click', event => { if (event.target.closest('[data-ph-golyrics]')) window.morphBefore = artwork(); }, true);
      ph.addEventListener('click', event => {
        if (!event.target.closest('[data-ph-golyrics]')) return;
        window.morphAfter = artwork();
        holdMotion();
      });
      NP.phoneUI.uis.find(ui => ui.ph === ph).setPage(true);
      holdMotion();
    });
    for (let i = 0; i < 6; i++) {
      await seekMorph(page, '#phPlay', 100);
      await phone.locator((i % 2 ? '.pg-cover' : '.pg-lyrics') + ' [data-ph-golyrics]').tap();
      const [before, after] = await page.evaluate(() => [morphBefore, morphAfter]);
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) < .3, `retarget ${i} ${key} must continue from the rendered frame`);
      assert.equal(await phone.locator('[data-flight="cover"]').count(), 1);
      assert.equal(await phone.evaluate(ph => ph.scrollTop), 0, 'the simulated display must not scroll when focus changes');
    }
    await seekMorph(page, '#phPlay', 560);
    await phone.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
    const state = await phone.evaluate(ph => ({
      lyrics: ph.classList.contains('is-lyrics'), hiddenEndpoints: ph.querySelectorAll('[data-ph-morph-opacity]').length,
      pages: Array.from(ph.querySelectorAll('.pg-cover,.pg-lyrics'), el => ({ inert: el.inert, opacity: getComputedStyle(el).opacity }))
    }));
    assert.equal(state.lyrics, true);
    assert.equal(state.hiddenEndpoints, 0);
    assert.deepEqual(state.pages, [{ inert: true, opacity: '0' }, { inert: false, opacity: '1' }]);
  }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
});

test('predictive lyrics return scrubs all layers, cancels continuously and commits without a flash', async () => {
  await browserCheck(async page => {
    await enablePlayerInteractions(page, ['#phPlay']);
    const phone = page.locator('#phPlay');
    await phone.scrollIntoViewIfNeeded();
    await phone.locator('.pg-cover [data-ph-golyrics]').click();
    await phone.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
    const box = await phone.boundingBox();
    const x = box.x + box.width * .03, y = box.y + box.height * .2;
    await phone.evaluate(ph => {
      ph.addEventListener('pointerup', () => {
        const cover = ph.querySelector('[data-flight="cover"]');
        window.morphReleased = cover && cover.getBoundingClientRect().toJSON();
      });
    });
    for (const fraction of [.2, .6]) {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + box.width * fraction, y, { steps: 6 });
      const held = await phone.locator('[data-flight="cover"]').boundingBox();
      const layers = await phone.evaluate(ph => Array.from(ph.querySelectorAll('.pg-cover,.pg-lyrics'), el => +getComputedStyle(el).opacity));
      assert.ok(layers[0] > 0 && layers[1] > 0);
      assert.ok(Math.abs(layers[0] + layers[1] - 1) < .001, 'page fades must use the same timeline');
      await page.mouse.up();
      const released = await page.evaluate(() => morphReleased);
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(held[key] - released[key]) < .3, `release ${fraction} ${key} must not jump back to an endpoint`);
      await phone.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
      assert.equal(await phone.evaluate(ph => ph.classList.contains('is-lyrics')), fraction < .35);
      assert.equal(await phone.locator('[data-ph-morph-opacity]').count(), 0);
    }
  });
});

test('shared transport glyphs scale continuously into the lyrics controls', async () => {
  await browserCheck(async page => {
    await enablePlayerInteractions(page, ['#phPlay']);
    const phone = page.locator('#phPlay');
    await phone.scrollIntoViewIfNeeded();
    await phone.locator('.pg-cover [data-ph-golyrics]').evaluate(button => button.click());
    await seekMorph(page, '#phPlay', 0);
    const { source, start } = await phone.evaluate(ph => ({ source: ph.querySelector('.pc-ctrl [data-ph-prev] svg').getBoundingClientRect().toJSON(), start: ph.querySelector('[data-flight="previous"] svg').getBoundingClientRect().toJSON() }));
    assert.ok(Math.abs(start.width - source.width) < .1);
    await seekMorph(page, '#phPlay', 150);
    const middle = await phone.evaluate(ph => ({ source: ph.querySelector('.pc-ctrl [data-ph-prev] svg').getBoundingClientRect().width, flight: ph.querySelector('[data-flight="previous"] svg').getBoundingClientRect().width, target: ph.querySelector('.pl-ctrl [data-ph-prev] svg').getBoundingClientRect().width }));
    assert.ok(middle.flight > middle.source && middle.flight < middle.target);
    await seekMorph(page, '#phPlay', 559);
    const { target, end } = await phone.evaluate(ph => ({ target: ph.querySelector('.pl-ctrl [data-ph-prev] svg').getBoundingClientRect().toJSON(), end: ph.querySelector('[data-flight="previous"] svg').getBoundingClientRect().toJSON() }));
    assert.ok(Math.abs(end.width - target.width) < .1, 'the icon must reach its destination size before handing back to the page');
  });
});

test('parent perspective and scaled controls do not change the source artwork or glyph geometry', async () => {
  await browserCheck(async page => {
    const phone = page.locator('#phPlay');
    await phone.scrollIntoViewIfNeeded();
    const frames = await phone.evaluate(ph => {
      ph.closest('.phone-fig').style.transform = 'perspective(900px) rotateX(24deg) scale(.9)';
      ph.dataset.controlSize = 'large';
      const source = [ph.querySelector('.pc-art>img'), ph.querySelector('.pc-ctrl [data-ph-prev] svg')].map(el => el.getBoundingClientRect().toJSON());
      const ui = NP.phoneUI.uis.find(ui => ui.ph === ph);
      ui.setPage(true);
      ui.pageMotion.animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
      const flight = [ph.querySelector('[data-flight="cover"]'), ph.querySelector('[data-flight="previous"] svg')].map(el => el.getBoundingClientRect().toJSON());
      return { source, flight };
    });
    for (let i = 0; i < frames.source.length; i++) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(frames.source[i][key] - frames.flight[i][key]) < .8, `element ${i} ${key} must be measured inside the display`);
  });
});

test('embedded player keeps live icons during flight and mounts clean endpoints from an animating demo', async () => {
  await browserCheck(async page => {
    await enablePlayerInteractions(page, ['#phPlay']);
    await page.locator('#phPlay').scrollIntoViewIfNeeded();
    await page.locator('#phPlay .pg-cover [data-ph-golyrics]').evaluate(button => button.click());
    await seekMorph(page, '#phPlay', 180);
    await enablePreviewInteractions(page, ['settings']);
    const host = page.locator('[data-app-preview="settings"]');
    await host.locator('[data-ap-open-player]').click();
    const native = host.locator('.ap-native-device[data-kind="player"] .ph');
    assert.equal(await native.locator('[data-ph-morph-opacity]').count(), 0);
    assert.equal(await native.locator('.pg-cover [data-ph-like]').evaluate(button => getComputedStyle(button).opacity), '1');
    await native.evaluate(ph => {
      ph.addEventListener('click', function holdFlight(event) {
        if (!event.target.closest('.pg-cover [data-ph-golyrics]')) return;
        ph.removeEventListener('click', holdFlight);
        const ui = NP.phoneUI.uis.find(ui => ui.ph === ph);
        ui.pageMotion.animations.forEach(animation => { animation.pause(); animation.currentTime = 120; });
      });
    });
    await native.locator('.pg-cover [data-ph-golyrics]').click();
    await native.evaluate(ph => {
      ph.querySelector('.pg-lyrics [data-ph-like]').click();
    });
    assert.equal(await native.locator('[data-flight="favorite"] use').getAttribute('href'), '#i-heart');
    assert.equal(await native.locator('[data-flight="favorite"] svg').evaluate(svg => getComputedStyle(svg).color), 'rgb(255, 59, 0)');
    await native.locator('.pg-lyrics [data-ph-toggle]').evaluate(button => button.click());
    await page.waitForFunction(() => NP.player.playing);
    assert.equal(await native.locator('[data-flight="play"] use').getAttribute('href'), '#i-pause');
    await seekMorph(page, '[data-app-preview="settings"] .ap-native-device[data-kind="player"] .ph', 560);
    await native.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
    await native.locator('.pg-lyrics [data-ph-collapse]').click();
    await host.locator('.ap-native-device[data-kind="player"]').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => NP.player.playing), true);
  });
});
