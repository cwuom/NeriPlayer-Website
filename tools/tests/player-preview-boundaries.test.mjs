import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
async function visit(run, width = 1440, language = '/') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto((process.env.SITE_URL || 'http://localhost:6060') + language, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.booted);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test('deselected immersive control removes its ink indicator while the pointer stays over its label', async () => {
  await visit(async page => {
    const button = page.locator('[data-immersive-toggle]');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeBtn').evaluate(button => button.click());
      for (let turn = 0; turn < 3; turn++) {
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'false');
        const ink = await button.evaluate(el => {
          const indicator = el.parentElement.querySelector('.seg__ind'), css = getComputedStyle(indicator);
          return { label: el.textContent.trim(), hidden: indicator.hidden || css.display === 'none' || +css.opacity === 0 || indicator.getBoundingClientRect().width < .1 };
        });
        assert.ok(ink.label.length > 0);
        assert.equal(ink.hidden, true, 'turning the mode off must remove the dark selection surface');
      }
    }
  });
});

for (const language of ['/', '/en/']) for (const width of [390, 1440]) {
  test(`player controls work while More stays disabled and lyric sizes stay at defaults ${language} ${width}`, async () => {
    await visit(async page => {
      const phone = page.locator('#phPlay');
      assert.equal(await phone.getAttribute('data-player-demo'), '');
      assert.equal(await page.locator('[data-player-font],#player-font-controls').count(), 0);
      for (const style of ['clean', 'material']) {
        await page.locator('#play button[data-app-style="' + style + '"]').click();
        await phone.scrollIntoViewIfNeeded();
        await page.evaluate(() => { NP.player.pause(); NP.player.seek(22); NP.player.setMuted(true); });
        const play = phone.locator('.pg-cover [data-ph-toggle]');
        assert.equal(await play.isEnabled(), true);
        await play.click();
        await page.waitForFunction(() => NP.player.playing && !NP.player.muted);
        await play.click();
        assert.equal(await page.evaluate(() => NP.player.playing), false);
        const liked = await page.evaluate(() => NP.player.liked);
        await phone.locator('.pg-cover [data-ph-like]').click();
        assert.equal(await page.evaluate(() => NP.player.liked), !liked);
        const more = phone.locator('.pg-cover [data-ph-more]');
        assert.equal(await more.isDisabled(), true);
        const rect = await more.boundingBox();
        await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await more.evaluate(el => {
          el.click();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        assert.equal(await phone.locator('.msheet.is-open,.mdialog.is-open').count(), 0);
        for (const selector of ['[data-ph-collapse]', '[data-ph-timer]', '[data-ph-volume]', '[data-ph-add]', '[data-ph-repeat]']) {
          assert.equal(await phone.locator('.pg-cover ' + selector).isDisabled(), true, selector + ' stays unavailable until its demo is complete');
        }
        for (let opening = 0; opening < 2; opening++) {
          await phone.locator('.pg-cover [data-ph-queue]').click();
          const queue = phone.locator('.msheet--queue');
          await page.waitForFunction(() => document.querySelector('#phPlay .msheet--queue').classList.contains('is-open'));
          const menus = queue.locator('.sh-q__more,.sh-q__fab');
          assert.equal(await menus.count(), 2);
          await page.waitForFunction(() => [...document.querySelectorAll('#phPlay .sh-q__more,#phPlay .sh-q__fab')].every(el => el.disabled));
          for (const menu of await menus.all()) {
            const box = await menu.boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            await menu.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
          }
          assert.equal(await phone.locator('.mdialog.is-open').count(), 0, 'queue menus must not open an unfinished action dialog');
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('#phPlay .msheet.is-open,#phPlay .mdialog.is-open'));
        }
        await phone.locator('.pg-cover [data-ph-golyrics]').click();
        assert.equal(await phone.evaluate(el => el.classList.contains('is-lyrics')), true);
        await page.waitForFunction(() => document.querySelector('[data-player-page="lyrics"]').getAttribute('aria-checked') === 'true');
        await phone.locator('.ph-shared-flight').waitFor({ state: 'detached' });
        const sizes = await phone.evaluate(el => ['.lrc-l__main', '.lrc-l__sub'].map(selector => parseFloat(getComputedStyle(el.querySelector(selector)).fontSize)));
        assert.deepEqual(sizes, [20, 14]);
        await page.locator('[data-player-page="cover"]').click();
        assert.equal(await phone.evaluate(el => el.classList.contains('is-lyrics')), false);
        await phone.locator('.ph-shared-flight').waitFor({ state: 'detached' });
        await page.locator('[data-immersive-toggle]').click();
        assert.equal(await phone.getAttribute('data-immersive'), 'true');
        assert.equal(await phone.locator('.pc-lrc').evaluate(el => getComputedStyle(el).display), 'none');
        await page.locator('[data-immersive-toggle]').click();
        assert.equal(await phone.getAttribute('data-immersive'), 'false');
        assert.equal(await phone.locator('[data-ph-more]:enabled').count(), 0);
        assert.equal(await page.locator('#phLyrics [data-ph-more]:enabled').count(), 0);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, width, language);
  });
}

test('mounted player inherits the public boundary after its queue rebuilds', async () => {
  await visit(async page => {
    await page.evaluate(() => {
      const host = document.querySelector('[data-app-preview="settings"]');
      host.removeAttribute('data-preview-readonly');
      host._appPreview.render();
    });
    const host = page.locator('[data-app-preview="settings"]');
    await host.locator('[data-ap-open-player]').click();
    const phone = host.locator('.ap-native-device[data-kind="player"] .ph');
    await phone.waitFor();
    assert.equal(await phone.getAttribute('data-player-demo'), '');
    assert.equal(await phone.locator('.pg-cover [data-ph-more]').isDisabled(), true);
    await phone.locator('.pg-cover [data-ph-queue]').click();
    await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] .msheet--queue').classList.contains('is-open'));
    assert.equal(await phone.locator('.sh-q__more:enabled,.sh-q__fab:enabled').count(), 0);
    await page.keyboard.press('Escape');
  });
});
