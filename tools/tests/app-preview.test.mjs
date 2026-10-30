import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const executablePath = [process.env.CHROME, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && existsSync(p));
const site = (process.env.SITE_URL || 'http://localhost:6060').replace(/\/$/, '');

async function withPage(path, fn, touch = false) {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1100 }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(site + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NP?.booted);
    await enablePreviewInteractions(page);
    assert.equal(await page.locator('[data-app-preview] .app-preview').count(), 2, 'settings and library must be real DOM simulations');
    await fn(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

test('library filters real sample data, opens details, and shares actual playback and favorites', async () => {
  await withPage('/', async page => {
    const lib = page.locator('[data-app-preview="library"]');
    await lib.locator('[data-ap-search]').fill('不存在');
    assert.equal(await lib.locator('[data-ap-open-playlist]').count(), 0);
    assert.match(await lib.innerText(), /没有找到/);
    await lib.locator('[data-ap-clear]').click();
    await lib.locator('[data-ap-secondary="artists"]').click();
    assert.equal(await lib.locator('[data-ap-artist]').count(), 1);
    await lib.locator('[data-ap-secondary="playlists"]').click();
    await lib.locator('[data-ap-open-playlist="local"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    await lib.locator('[data-ap-track]').click();
    await page.waitForFunction(() => NP.player.playing && NP.player.audible);
    assert.equal(await page.locator('#player').evaluate(a => a.paused), false);
    await lib.locator('[data-ap-toggle]').click();
    assert.equal(await page.evaluate(() => NP.player.playing), false);
    assert.equal(await page.locator('#player').evaluate(a => a.paused), true);
    await lib.locator('[data-al-menu="track"]').click();
    await lib.locator('[data-al-action="like-track"]').click();
    assert.equal(await page.evaluate(() => NP.player.liked), true);
    await lib.locator('[data-ap-back]').click();
    assert.equal(await lib.locator('[data-ap-open-playlist="liked"]').count(), 1);
    await lib.locator('[data-ap-open-playlist="liked"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
  });
});

test('settings navigation changes both app themes, appearance, and actual UI density without resetting playback', async () => {
  await withPage('/', async page => {
    const settings = page.locator('[data-app-preview="settings"]');
    await page.evaluate(() => { NP.player.seek(27); NP.player.userPaused = true; });
    await settings.locator('[data-ap-setting="theme"]').click();
    const cleanBackground = await settings.locator('.app-preview').evaluate(el => getComputedStyle(el).backgroundColor);
    await settings.locator('[data-ap-style="material"]').click();
    assert.equal(await page.locator('html').getAttribute('data-app-style'), 'material');
    assert.equal(await page.locator('.app-preview[data-style="material"]').count(), 2);
    assert.equal(await settings.locator('[data-ap-style="material"]').getAttribute('aria-checked'), 'true');
    const materialBackground = await settings.locator('.app-preview').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(materialBackground, cleanBackground);
    await settings.locator('[data-ap-mode="light"]').click();
    assert.equal(await page.locator('.app-preview[data-mode="light"]').count(), 2);
    assert.notEqual(await settings.locator('.app-preview').evaluate(el => getComputedStyle(el).backgroundColor), materialBackground);
    await settings.locator('[data-ap-style="clean"]').click();
    assert.equal(await page.locator('.app-preview[data-style="clean"]').count(), 2);
    await settings.locator('[data-ap-back]').click();
    await settings.locator('[data-ap-setting="general"]').click();
    await settings.locator('[data-ap-scale-open]').click();
    await settings.locator('[data-ap-scale]').fill('1.15');
    await settings.locator('[data-ap-scale-apply]').click();
    assert.equal(await page.locator('.app-preview[data-ui-scale="1.15"]').count(), 2);
    assert.ok(await settings.locator('.ap-interface').evaluate(el => parseFloat(getComputedStyle(el).width) < 360));
    assert.equal(await page.evaluate(() => NP.player.t), 27);
    assert.equal(await settings.locator('[role="dialog"]').count(), 0);
    await settings.locator('[data-ap-back]').click();
    await settings.locator('[data-ap-nav="library"]').click();
    assert.equal(await settings.locator('[data-ap-search]').count(), 1);
  });
});

test('touch screens keep operable DOM previews and English labels without horizontal page overflow', async () => {
  await withPage('/en/', async page => {
    const lib = page.locator('[data-app-preview="library"]');
    assert.match(await lib.innerText(), /Library/);
    await lib.locator('[data-ap-open-playlist="local"]').click();
    assert.match(await lib.innerText(), /Startrail/);
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-nav="settings"]').click();
    assert.match(await lib.innerText(), /Settings/);
    await lib.locator('[data-ap-setting="theme"]').click();
    await lib.locator('[data-ap-style="material"]').click();
    assert.equal(await lib.locator('.app-preview').getAttribute('data-style'), 'material');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  }, true);
});

test('created playlists remain navigable and unavailable platform content returns to the local library', async () => {
  await withPage('/', async page => {
    const lib = page.locator('[data-app-preview="library"]');
    await lib.locator('[data-ap-create]').click();
    await lib.locator('[data-ap-playlist-name]').fill('我的试听歌单');
    await lib.locator('[data-ap-extension-apply]').click();
    await lib.locator('[data-ap-search]').fill('我的试听歌单');
    assert.equal(await lib.locator('[data-ap-open-playlist]').count(), 1);
    await lib.locator('[data-ap-open-playlist]').click();
    assert.match(await lib.innerText(), /歌单还是空的/);
    assert.equal(await lib.locator('[data-ap-track]').count(), 0);
    await lib.locator('[data-ap-back]').click();
    await page.evaluate(() => NP.demoData.setAccount('netease', false));
    await lib.locator('[data-ap-source="netease"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 0);
    await lib.getByRole('button', { name: '查看本地音乐' }).click();
    assert.equal(await lib.locator('[data-ap-open-playlist="custom-0"]').count(), 1);
  });
});

test('favorite icons use the Android active color and restore surface ink when unliked', async () => {
  await withPage('/', async page => {
    const lib = page.locator('[data-app-preview="library"]');
    await lib.locator('[data-ap-open-playlist="local"]').click();
    for (const style of ['clean', 'material']) {
      await page.evaluate(value => NP.themes.select(value), style);
      const hearts = page.locator('#phPlay .pg-cover [data-ph-like],#phLyrics .pg-lyrics [data-ph-like]');
      const expectedInk = style === 'clean' ? 'rgb(242, 242, 245)' : 'rgb(230, 224, 233)';
      await page.waitForFunction(color => [...document.querySelectorAll('#phPlay .pg-cover [data-ph-like],#phLyrics .pg-lyrics [data-ph-like]')].every(el => getComputedStyle(el).color === color), expectedInk);
      const original = await hearts.evaluateAll(els => els.map(el => getComputedStyle(el).color));
      await lib.locator('[data-al-menu="track"]').click();
      await lib.locator('[data-al-action="like-track"]').click();
      assert.equal(await page.evaluate(() => NP.player.liked), true);
      await page.waitForFunction(() => [...document.querySelectorAll('#phPlay .pg-cover [data-ph-like],#phLyrics .pg-lyrics [data-ph-like]')].every(el => getComputedStyle(el).color === 'rgb(255, 59, 0)'));
      assert.deepEqual(await hearts.evaluateAll(els => els.map(el => getComputedStyle(el).color)), ['rgb(255, 59, 0)', 'rgb(255, 59, 0)']);
      await lib.locator('[data-al-menu="track"]').click();
      await lib.locator('[data-al-action="like-track"]').click();
      assert.equal(await page.evaluate(() => NP.player.liked), false);
      await page.waitForFunction(colors => [...document.querySelectorAll('#phPlay .pg-cover [data-ph-like],#phLyrics .pg-lyrics [data-ph-like]')].every((el, i) => getComputedStyle(el).color === colors[i]), original);
      assert.deepEqual(await hearts.evaluateAll(els => els.map(el => getComputedStyle(el).color)), original);
    }
  });
});

test('keyboard navigation announces the new page and theme redraw preserves the focused control', async () => {
  await withPage('/', async page => {
    const settings = page.locator('[data-app-preview="settings"]');
    await settings.locator('[data-ap-setting="theme"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await settings.locator('h2').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await settings.locator('[data-ap-style="material"]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await settings.locator('[data-ap-style="material"]').evaluate(el => el === document.activeElement), true);
    await settings.locator('[data-ap-mode="light"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await settings.locator('[data-ap-mode="light"]').evaluate(el => el === document.activeElement), true);
    await settings.locator('[data-ap-back]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await settings.locator('[data-ap-setting="theme"]').evaluate(el => el === document.activeElement), true);
  });
});

test('preview dialogs focus their input, isolate background controls, trap Tab, and restore their opener', async () => {
  await withPage('/', async page => {
    const settings = page.locator('[data-app-preview="settings"]');
    await settings.locator('[data-ap-setting="general"]').click();
    await settings.locator('[data-ap-scale-open]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await settings.locator('[data-ap-scale]').evaluate(el => el === document.activeElement), true);
    assert.equal(await settings.locator('[data-ap-nav="library"]').evaluate(el => !!el.closest('[inert]')), true);
    await settings.locator('[data-ap-nav="library"]').dispatchEvent('click');
    assert.equal(await settings.locator('[role="dialog"]').count(), 1);
    assert.equal(await settings.locator('[data-ap-scale-open]').count(), 1);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await settings.locator('[data-ap-scale-apply]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await settings.locator('[data-ap-scale]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await settings.locator('[role="dialog"]').count(), 0);
    assert.equal(await settings.locator('[data-ap-scale-open]').evaluate(el => el === document.activeElement), true);
    assert.equal(await settings.locator('[data-ap-nav="library"]').evaluate(el => !!el.closest('[inert]')), false);
    await page.keyboard.press('Enter');
    await settings.locator('[data-ap-dialog-cancel]').click();
    assert.equal(await settings.locator('[data-ap-scale-open]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    await settings.locator('[data-ap-scale-apply]').click();
    assert.equal(await settings.locator('[data-ap-scale-open]').evaluate(el => el === document.activeElement), true);
    const lib = page.locator('[data-app-preview="library"]');
    await lib.locator('[data-ap-create]').click();
    assert.equal(await lib.locator('[data-ap-playlist-name]').evaluate(el => el === document.activeElement), true);
    await lib.locator('[data-ap-playlist-name]').fill('键盘歌单');
    await lib.locator('[data-ap-extension-apply]').click();
    assert.equal(await lib.locator('[data-ap-create]').evaluate(el => el === document.activeElement), true);
  });
});

test('UI scale supports the Android phone endpoints and 0.05 increments', async () => {
  await withPage('/', async page => {
    const settings = page.locator('[data-app-preview="settings"]');
    await settings.locator('[data-ap-setting="general"]').click();
    for (const [key, value] of [['Home', '0.6'], ['End', '1.2']]) {
      await settings.locator('[data-ap-scale-open]').click();
      await settings.locator('[data-ap-scale]').focus();
      await page.keyboard.press(key);
      assert.equal(await settings.locator('[data-ap-scale]').inputValue(), value);
      await settings.locator('[data-ap-scale-apply]').click();
      const width = await settings.locator('.ap-interface').evaluate(el => parseFloat(getComputedStyle(el).width));
      assert.ok(Math.abs(width - 411 / Number(value)) < 1);
    }
    await settings.locator('[data-ap-scale-open]').click();
    await settings.locator('[data-ap-scale]').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await settings.locator('[data-ap-scale]').inputValue(), '1.15');
    await page.keyboard.press('Escape');
  });
});
