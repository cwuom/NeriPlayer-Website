import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.env.SITE_URL || 'http://localhost:6060';
async function check(run, reducedMotion = 'no-preference') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
    await enablePreviewInteractions(page, ['settings']);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test('settings transitions preserve the outgoing scroll, animate in both directions, and settle the latest tab', async () => {
  await check(async page => {
    const host = page.locator('[data-app-preview="settings"]');
    await host.locator('[data-ap-setting="motion"]').scrollIntoViewIfNeeded();
    await host.evaluate(el => el.addEventListener('pointerdown', () => { window.beforeSceneScroll = el.querySelector('.ap-scroll').scrollTop; }, { once: true }));
    await host.locator('[data-ap-setting="motion"]').click();
    assert.equal(await host.getAttribute('data-motion'), 'settings');
    assert.equal(await host.locator('.ap-outgoing .ap-scroll').evaluate(el => el.scrollTop), await page.evaluate(() => beforeSceneScroll));
    assert.equal(await host.locator('.ap-outgoing').evaluate(el => el.inert), true);
    const frame = await page.waitForFunction(() => {
      const el = document.querySelector('[data-app-preview="settings"] .ap-scene:not(.ap-outgoing)');
      const x = new DOMMatrix(getComputedStyle(el).transform).m41;
      return x > 0 && x < 411 ? x : false;
    });
    const during = await frame.jsonValue();
    assert.ok(during > 0 && during < 411, 'entering page should still be between its endpoints');
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"]').dataset.motion);
    await host.locator('[data-ap-back]').click();
    const backward = await host.locator('.ap-scene:not(.ap-outgoing)').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    assert.ok(backward < 0, 'return must enter from the opposite edge');
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"]').dataset.motion);
    await host.evaluate(el => { el.querySelector('[data-ap-nav="library"]').click(); el.querySelector('[data-ap-nav="explore"]').click(); el.querySelector('[data-ap-nav="settings"]').click(); });
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"]').dataset.motion);
    assert.equal(await host.locator('.ap-outgoing').count(), 0);
    assert.equal(await host.locator('[data-ap-setting]').count(), 22);
    assert.equal(await host.locator('[data-ap-nav="settings"]').getAttribute('aria-current'), 'page');
  });
});

test('DSP, player and lyrics stay inside the originating phone and share real playback', async () => {
  await check(async page => {
    const host = page.locator('[data-app-preview="settings"]');
    await host.locator('[data-ap-setting="audio"]').click();
    const dsp = host.locator('.ap-native-device[data-kind="dsp"]');
    assert.equal(await dsp.isVisible(), true);
    assert.equal(await page.locator('.fxa [role="tab"]').evaluateAll(tabs => tabs.every(tab => {
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      return panel && panel.closest('.fxa') === tab.closest('.fxa') && panel.getAttribute('aria-labelledby') === tab.id;
    })), true, 'each DSP instance must own its tab panels');
    assert.equal(await page.locator('.fxa [id]').evaluateAll(nodes => new Set(nodes.map(node => node.id)).size === nodes.length), true);
    await dsp.locator('.hm-mini__id').click();
    const player = host.locator('.ap-native-device[data-kind="player"]');
    await player.locator('.pg-cover [data-ph-toggle]').click();
    await page.waitForFunction(() => NP.player.playing && NP.player.audible);
    assert.equal(await player.locator('[data-ph-clrc] .lrc-c').count(), await page.evaluate(() => NP.LYRICS.length));
    await player.locator('.pg-cover [data-ph-golyrics]').click();
    assert.equal(await player.locator('[data-flight="cover"]').count(), 1);
    const early = await player.locator('[data-flight="cover"]').boundingBox();
    await page.waitForTimeout(120);
    const middle = await player.locator('[data-flight="cover"]').boundingBox();
    assert.ok(middle.width < early.width && middle.y < early.y, 'one cover must fly continuously into the lyrics header');
    await player.locator('.ph-shared-flight').first().waitFor({ state: 'detached' });
    assert.equal(await player.locator('.ph-shared-flight').count(), 0);
    assert.equal(await player.locator('.ph').evaluate(el => el.classList.contains('is-lyrics')), true);
    await player.locator('.pg-lyrics [data-ph-collapse]').click();
    await player.waitFor({ state: 'hidden' });
    assert.equal(await player.evaluate(el => el.hidden), true);
    assert.equal(await dsp.isVisible(), true);
    await dsp.locator('.fxa-bar .pbtn').click();
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"] .app-preview').inert);
    assert.equal(await host.locator('.app-preview').evaluate(el => el.inert), false);
    assert.equal(await page.evaluate(() => NP.player.playing), true);
  });
});

test('edge return follows the pointer, restores a cancelled page, and commits the parent scene', async () => {
  await check(async page => {
    const host = page.locator('[data-app-preview="settings"]');
    await host.locator('[data-ap-setting="general"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"]').dataset.motion);
    const box = await host.boundingBox();
    const x = box.x + 16, y = box.y + 240;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + box.width * .2, y, { steps: 6 });
    const transform = await host.locator('.ap-scene:not(.ap-outgoing)').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    assert.ok(transform > 10, 'foreground must follow the held pointer');
    assert.equal(await host.locator('.ap-outgoing').count(), 1, 'parent page must be visible behind the moving scene');
    await page.mouse.up();
    await host.locator('.ap-outgoing').waitFor({ state: 'detached' });
    assert.equal(await host.locator('[data-ap-back]').count(), 1);
    assert.equal(await host.locator('.ap-outgoing').count(), 0);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + box.width * .6, y, { steps: 8 }); await page.mouse.up();
    await host.locator('[data-ap-setting="general"]').waitFor({ state: 'visible' });
    await host.locator('.ap-outgoing').waitFor({ state: 'detached' });
    assert.equal(await host.locator('[data-ap-setting]').count(), 22);
    assert.equal(await host.locator('.ap-outgoing').count(), 0);
  });
});

test('native player menus are usable dialogs, constrain focus, and apply lyric settings', async () => {
  await check(async page => {
    const host = page.locator('[data-app-preview="settings"]');
    await host.locator('[data-ap-open-player]').click();
    const player = host.locator('.ap-native-device[data-kind="player"]');
    await player.locator('.pg-cover [data-ph-more]').click();
    await player.locator('.msheet--more [data-i="4"]').click();
    const dialog = player.locator('.mdialog--action');
    await dialog.locator('[data-action-range="lyricScale"]').fill('1.4');
    await dialog.locator('[data-action-apply]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await dialog.locator('[data-action-range="lyricScale"]').evaluate(el => el === document.activeElement), true);
    await dialog.locator('[data-action-apply]').click();
    assert.equal(await player.locator('.ph').evaluate(el => getComputedStyle(el).getPropertyValue('--lyric-scale').trim()), '1.4');
    await player.locator('.pg-cover [data-ph-more]').click();
    await player.locator('.msheet--more [data-i="2"]').click();
    await dialog.locator('.ph-action-details').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] .mdialog--action').contains(document.activeElement));
    assert.match(await dialog.innerText(), /MP3/);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.evaluate(el => el.classList.contains('is-open')), false);
  }, 'reduce');
});
