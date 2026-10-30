import { enablePlayerInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

async function visit(run, options = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference', ...options });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(process.env.SITE_URL || 'http://localhost:6060', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.booted && !document.querySelector('#devicePlay').classList.contains('is-fontwait'));
    await enablePlayerInteractions(page, ['#phPlay']);
    await page.locator('#phPlay').scrollIntoViewIfNeeded();
    await page.evaluate(() => NP.player.pause());
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function hold(page, button) {
  const rect = await button.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(620);
  await page.mouse.up();
}

async function state(page) {
  return page.evaluate(() => {
    const ph = document.querySelector('#phPlay');
    const box = selector => {
      const css = getComputedStyle(ph.querySelector(selector));
      return { left: parseFloat(css.left), top: parseFloat(css.top), width: parseFloat(css.width), height: parseFloat(css.height), textAlign: css.textAlign, visibility: css.visibility, display: css.display };
    };
    return { enabled: NP.previewSettings.value('nowplaying_immersive_mode'), playing: NP.player.playing, audible: NP.player.audible, art: box('.pc-art'), identity: box('.pc-id'), lyrics: box('.pc-lrc'), status: box('.ph__status') };
  });
}

test('long-press play shows source large-cover layout and restores saved lyrics without toggling playback', async () => {
  await visit(async page => {
    for (const style of ['clean', 'material']) {
      await page.evaluate(style => NP.themes.select(style), style);
      const before = await state(page);
      await hold(page, page.locator('#phPlay .pg-cover [data-ph-toggle]'));
      const immersive = await state(page);
      assert.equal(immersive.enabled, true);
      assert.deepEqual([immersive.playing, immersive.audible], [before.playing, before.audible]);
      assert.equal(immersive.art.left, 20);
      assert.equal(immersive.art.top, 42.5 + 12 + 56 + 16);
      assert.equal(immersive.art.width, 344);
      assert.equal(immersive.art.height, 344);
      assert.equal(immersive.identity.top, immersive.art.top + 344 + 28);
      assert.equal(immersive.identity.textAlign, 'left');
      assert.equal(immersive.lyrics.display, 'none');
      assert.equal(immersive.status.visibility, 'visible');
      assert.equal(await page.locator('.ph-snack.is-on').count(), 0);
      assert.equal(await page.locator('[data-immersive-toggle]').getAttribute('aria-pressed'), 'true');
      await hold(page, page.locator('#phPlay .pg-cover [data-ph-toggle]'));
      const restored = await state(page);
      assert.equal(restored.enabled, false);
      assert.deepEqual([restored.playing, restored.audible], [before.playing, before.audible]);
      assert.deepEqual(restored.art, before.art);
      assert.equal(restored.lyrics.display, before.lyrics.display);
      assert.equal(restored.identity.textAlign, 'center');
    }
  });
});

test('touch long-press switches both ways and the next short tap still controls playback', async () => {
  await visit(async page => {
    const client = await page.context().newCDPSession(page);
    const button = page.locator('#phPlay .pg-cover [data-ph-toggle]');
    const cancelled = await button.boundingBox();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelled.x + cancelled.width / 2, y: cancelled.y + cancelled.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForTimeout(620);
    assert.equal((await state(page)).enabled, false);
    for (const enabled of [true, false]) {
      const before = await state(page);
      const rect = await button.boundingBox();
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] });
      await page.waitForTimeout(620);
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const after = await state(page);
      assert.equal(after.enabled, enabled);
      assert.deepEqual([after.playing, after.audible], [before.playing, before.audible]);
    }
    const before = await state(page);
    await button.tap();
    await page.waitForFunction(was => NP.player.playing !== was.playing || NP.player.audible !== was.audible, before);
  }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
});

test('moving a held pointer outside Android touch slop cancels immersive activation', async () => {
  await visit(async page => {
    const button = page.locator('#phPlay .pg-cover [data-ph-toggle]');
    const rect = await button.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 30, rect.y + rect.height / 2, { steps: 3 });
    await page.waitForTimeout(620);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => NP.previewSettings.value('nowplaying_immersive_mode')), false);
  });
});

test('external immersive control remains synchronized while lyrics transitions preserve their endpoints', async () => {
  await visit(async page => {
    const toggle = page.locator('[data-immersive-toggle]');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await toggle.evaluate(button => button.classList.contains('is-on')), true);
    const ph = page.locator('#phPlay');
    await ph.locator('.pg-cover [data-ph-golyrics]').click();
    await ph.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
    assert.equal(await ph.evaluate(node => node.classList.contains('is-lyrics')), true);
    await ph.locator('.pg-lyrics [data-ph-golyrics]').click();
    await ph.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
    assert.equal((await state(page)).art.width, 344);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.ok(Math.abs((await state(page)).art.width - 222.6) < .02);
    assert.equal(await ph.locator('[data-ph-morph-opacity]').count(), 0);
  });
});

for (const width of [390, 1440]) test(`switching immersive during cover/lyrics reversals retargets one artwork and releases every hidden endpoint ${width}`, async () => {
  await visit(async page => {
    const ph = page.locator('#phPlay');
    for (const style of ['clean', 'material']) {
      await page.evaluate(style => NP.themes.select(style), style);
      for (const [lyrics, immersive] of [[true, true], [false, false], [true, true], [false, false]]) {
        await ph.evaluate((node, lyrics) => {
          const ui = NP.phoneUI.uis.find(ui => ui.ph === node);
          ui.setPage(lyrics);
          ui.pageMotion.animations.forEach(animation => { animation.pause(); animation.currentTime = 100; });
        }, lyrics);
        const jump = await page.evaluate(immersive => {
          const before = Array.from(document.querySelectorAll('#phPlay [data-flight]')).map(node => ({ key: node.dataset.flight, bounds: node.getBoundingClientRect() }));
          NP.previewSettings.set('nowplaying_immersive_mode', immersive);
          return Math.max(...before.map(item => {
            const after = document.querySelector(`#phPlay [data-flight="${item.key}"]`).getBoundingClientRect();
            return Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(after[key] - item.bounds[key])));
          }));
        }, immersive);
        assert.equal(await ph.locator('[data-flight="cover"]').count(), 1);
        assert.ok(jump < 1, `retarget must continue from every painted shared element (${jump})`);
        await ph.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
        assert.equal(await ph.locator('[data-ph-morph-opacity]').count(), 0);
        assert.equal(await ph.evaluate(node => node.classList.contains('is-lyrics')), lyrics);
      }
      assert.ok(Math.abs((await state(page)).art.width - 222.6) < .02);
      await page.evaluate(() => NP.previewSettings.set('nowplaying_immersive_mode', true));
      await hold(page, ph.locator('.pg-cover [data-ph-toggle]'));
      assert.equal((await state(page)).enabled, false);
    }
  }, { viewport: { width, height: width === 390 ? 844 : 1100 }, isMobile: width === 390, hasTouch: width === 390 });
});
