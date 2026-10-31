import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const executablePath = [process.env.CHROME, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && existsSync(p));
const site = (process.env.SITE_URL || 'http://localhost:6060').replace(/\/$/, '');

async function browserTest(path, fn, options = {}) {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', ...options });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(site + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return window.NP?.booted && NP.previewLibrary; });
    await enablePreviewInteractions(page);
    await fn(page, page.locator('[data-app-preview="library"]'));
    assert.deepEqual(errors, [], 'library interaction must not generate browser exceptions');
  } finally {
    await browser.close();
  }
}
const apply = lib => lib.locator('[data-ap-extension-apply]');
async function create(lib, name) {
  await lib.locator('[data-ap-create]').click();
  await lib.locator('[data-al-name]').fill(name);
  await apply(lib).click();
}
async function openMenu(lib, id) {
  await lib.locator(`[data-al-menu="${id}"]`).click();
}

test('local playlists validate native names, create, rename, add songs, remove and undo', async () => {
  await browserTest('/', async (page, lib) => {
    await lib.locator('[data-ap-create]').click();
    assert.equal(await lib.locator('[data-al-name]').getAttribute('maxlength'), '10');
    await lib.locator('[data-al-name]').fill('本地文件');
    await apply(lib).click();
    assert.match(await lib.locator('[data-al-error]').innerText(), /保留/);
    await lib.locator('[data-al-name]').fill('我的歌单');
    await apply(lib).click();
    assert.equal(await lib.locator('[role="dialog"]').count(), 0);
    await openMenu(lib, 'custom-0');
    await lib.locator('[data-al-action="rename"]').click();
    await lib.locator('[data-al-name]').fill('夜间收听');
    await apply(lib).click();
    assert.match(await lib.locator('[data-ap-open-playlist="custom-0"]').innerText(), /夜间收听/);
    await lib.locator('[data-ap-open-playlist="custom-0"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 0);
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-open-playlist="sample"]').click();
    await lib.locator('.al-play-actions [data-al-action="add-selected"]').click();
    await lib.locator('[data-al-target="custom-0"]').check();
    await apply(lib).click();
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-open-playlist="custom-0"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    await lib.locator('[data-ap-back]').click();
    await openMenu(lib, 'custom-0');
    await lib.locator('[data-al-action="delete"]').click();
    await apply(lib).click();
    assert.equal(await lib.locator('[data-ap-open-playlist="custom-0"]').count(), 0);
    await lib.locator('[data-al-action="undo"]').click();
    assert.equal(await lib.locator('[data-ap-open-playlist="custom-0"]').count(), 1);
  });
});

test('multi-selection, accessible reordering and batch deletion preserve protected playlists', async () => {
  await browserTest('/', async (page, lib) => {
    await create(lib, '第一个');
    await create(lib, '第二个');
    await lib.locator('[data-al-row="custom-0"]').dispatchEvent('contextmenu');
    assert.equal(await lib.locator('[data-al-toggle="custom-0"][role="checkbox"]').getAttribute('aria-checked'), 'true');
    const before = await lib.locator('[data-al-row]').evaluateAll(rows => rows.map(row => row.dataset.alRow));
    await lib.locator('[data-al-action="move-down"][data-al-id="custom-0"]').click();
    const after = await lib.locator('[data-al-row]').evaluateAll(rows => rows.map(row => row.dataset.alRow));
    assert.notDeepEqual(after, before);
    assert.ok(after.indexOf('custom-0') > after.indexOf('custom-1'));
    assert.equal(await lib.locator('[data-al-toggle="local"][role="checkbox"]').isDisabled(), true);
    assert.equal(await lib.locator('[data-al-toggle="liked"][role="checkbox"]').isDisabled(), true);
    await lib.locator('[data-al-action="select-all"]').click();
    await lib.locator('[data-al-action="delete-selected"]').click();
    await apply(lib).click();
    assert.equal(await lib.locator('[data-ap-open-playlist="custom-0"]').count(), 0);
    assert.equal(await lib.locator('[data-ap-open-playlist="custom-1"]').count(), 0);
    assert.equal(await lib.locator('[data-ap-open-playlist="local"]').count(), 1);
    assert.equal(await lib.locator('[data-ap-open-playlist="liked"]').count(), 1);
    await lib.locator('[data-al-action="undo"]').click();
    assert.equal(await lib.locator('[data-ap-open-playlist="custom-1"]').count(), 1);
  });
});

test('touch long press enters selection without swallowing the following toolbar action', async () => {
  await browserTest('/', async (page, lib) => {
    await create(lib, '长按歌单');
    const row = lib.locator('[data-al-row="custom-0"]');
    await row.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200, bubbles: true });
    await page.waitForTimeout(550);
    await row.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200, bubbles: true });
    assert.equal(await lib.locator('[data-al-toggle="custom-0"][role="checkbox"]').getAttribute('aria-checked'), 'true');
    await lib.locator('[data-al-action="delete-selected"]').click();
    assert.equal(await lib.locator('[role="dialog"]').count(), 1);
    await apply(lib).click();
    assert.equal(await lib.locator('[data-ap-open-playlist="custom-0"]').count(), 0);
  }, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
});

test('detail menus operate real playback, favorites, queue, song info, search and return state', async () => {
  await browserTest('/', async (page, lib) => {
    await lib.locator('[data-ap-search]').fill('星轨');
    await lib.locator('[data-ap-open-playlist="local"]').click();
    await lib.locator('[data-ap-track]').click();
    await page.waitForFunction(() => NP.player.playing && NP.player.audible);
    assert.equal(await page.locator('#player').evaluate(audio => audio.paused), false);
    await openMenu(lib, 'track');
    await lib.locator('[data-al-action="like-track"]').click();
    assert.equal(await page.evaluate(() => NP.player.liked), true);
    await openMenu(lib, 'track');
    await lib.locator('[data-al-action="queue-next"]').click();
    assert.deepEqual(await page.evaluate(() => NP.previewQueue.items().map(item => item[0])), ['startrail']);
    await openMenu(lib, 'track');
    await lib.locator('[data-al-action="song-details"]').click();
    assert.match(await lib.locator('.al-song-details').innerText(), /startrail\.mp3/);
    assert.match(await lib.locator('.al-song-details').innerText(), /audio\/mpeg/);
    await apply(lib).click();
    await lib.locator('[data-al-action="detail-search"]').click();
    await lib.locator('[data-al-detail-search]').fill('不存在');
    assert.equal(await lib.locator('[data-ap-track]').count(), 0);
    await lib.locator('[data-al-action="clear-detail"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    await lib.locator('[data-ap-back]').click();
    assert.equal(await lib.locator('[data-ap-search]').inputValue(), '星轨');
    await lib.locator('[data-ap-clear]').click();
    await lib.locator('[data-ap-open-playlist="liked"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    await lib.locator('[data-ap-toggle]').click();
    assert.equal(await page.evaluate(() => NP.player.playing), false);
    assert.equal(await lib.locator('.al-playing-indicator').evaluate(el => getComputedStyle(el).display), 'flex', 'the current song keeps a static native indicator while paused');
    assert.ok(Math.abs(await lib.locator('.al-playing-indicator i').first().evaluate(el => parseFloat(getComputedStyle(el).height)) - 4.2) < .03);
  });
});

test('local file tabs, scan preview, artist sorting and keyboard tabs follow source states', async () => {
  await browserTest('/', async (page, lib) => {
    await lib.locator('[data-ap-open-playlist="local"]').click();
    await lib.locator('[data-al-file-tab="downloaded"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 0);
    assert.match(await lib.innerText(), /暂无已下载/);
    await lib.locator('[data-al-file-tab="manual"]').click();
    await lib.locator('[data-al-action="scan"]').click();
    await lib.locator('[data-al-action="scan-folder"]').click();
    assert.equal(await lib.locator('[data-al-scan-track]').isChecked(), true);
    await apply(lib).click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-secondary="playlists"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await lib.locator('[data-ap-secondary="artists"]').getAttribute('aria-selected'), 'true');
    assert.equal(await lib.locator('[data-ap-artist]').count(), 1);
    assert.equal(await lib.locator('[data-ap-artist]>img').evaluate(img => getComputedStyle(img).borderRadius), '12px');
    await lib.locator('[data-al-action="artist-sort"]').click();
    await lib.locator('[data-al-action="sort-name"]').click();
    await lib.locator('[data-ap-artist]').click();
    assert.match(await lib.locator('.al-detail-header h2').innerText(), /Neri Line/);
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    await lib.locator('[data-ap-back]').click();
    assert.equal(await lib.locator('[data-ap-secondary="artists"]').getAttribute('aria-selected'), 'true');
  });
});

test('native quick export copies the actual song to a local playlist without adding root import controls', async () => {
  await browserTest('/', async (page, lib) => {
    assert.equal(await lib.locator('[data-al-action="export-all"],[data-al-action="import"]').count(), 0);
    await create(lib, '本地目标');
    await lib.locator('[data-ap-open-playlist="sample"]').click();
    await lib.locator('.al-play-actions [data-al-action="add-selected"]').click();
    await lib.locator('[data-al-target="custom-0"]').check();
    await apply(lib).click();
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-open-playlist="custom-0"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    assert.match(await lib.locator('[data-ap-track]').innerText(), /星轨/);
    await lib.locator('[data-ap-back]').click();
    await openMenu(lib, 'custom-0');
    assert.deepEqual(await lib.locator('.al-menu-option').allTextContents(), ['重命名', '删除']);
    assert.equal(await lib.locator('.ap-dialog-scrim').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await lib.locator('.ap-dialog-scrim').click({ position: { x: 8, y: 8 } });
    assert.equal(await lib.locator('[role="dialog"]').count(), 0);
  });
});

test('library categories, playlist rows and empty cover match the Android source geometry', async () => {
  await browserTest('/', async (page, lib) => {
    const layout = await lib.evaluate(host => {
      const css = selector => getComputedStyle(host.querySelector(selector));
      const scale = host.querySelector('.app-preview').getBoundingClientRect().width / 411;
      const box = selector => host.querySelector(selector).getBoundingClientRect();
      const primary = box('.al-primary'), secondary = box('.al-secondary'), search = box('.al-search-row>.ap-search');
      return { primaryHeight: css('.al-primary').height, secondaryHeight: css('.al-secondary').height, categoriesGap: (secondary.top - primary.bottom) / scale, searchGap: (search.top - secondary.bottom) / scale, row: css('.al-playlist-row').minHeight, icon: css('[data-al-row="liked"] .ap-library-cover svg').width, headline: css('.al-playlist-row b').lineHeight, supporting: css('.al-playlist-row small').lineHeight, rowTextGap: css('.al-playlist-row .ap-row-copy').gap };
    });
    assert.equal(layout.primaryHeight, '36px');
    assert.equal(layout.secondaryHeight, '36px');
    assert.ok(Math.abs(layout.categoriesGap - 14) < .1);
    assert.ok(Math.abs(layout.searchGap - 10) < .1);
    assert.equal(layout.row, '72px');
    assert.equal(layout.icon, '56px');
    assert.equal(layout.headline, '23px');
    assert.equal(layout.supporting, '20px');
    assert.equal(layout.rowTextGap, '0px');
    assert.equal(await lib.locator('[data-al-row="liked"] small').innerText(), '0 首');
    assert.match(await lib.locator('[data-al-row="liked"] svg path').getAttribute('d'), /M15 6H3/);
    await lib.locator('[data-ap-create]').click();
    assert.equal(await apply(lib).isDisabled(), true);
    const form = await lib.locator('[role="dialog"]').evaluate(el => ({ width: getComputedStyle(el).maxWidth, title: getComputedStyle(el.querySelector('h3')).fontSize, field: getComputedStyle(el.querySelector('[data-al-name]')).height, action: getComputedStyle(el.querySelector('[data-ap-extension-apply]')).minHeight, gap: getComputedStyle(el.querySelector('.ap-dialog-actions')).gap }));
    assert.deepEqual(form, { width: '340px', title: '20px', field: '56px', action: '46px', gap: '10px' });
    await page.keyboard.press('Escape');
    await lib.locator('[data-ap-open-playlist="local"]').click();
    const track = await lib.locator('[data-ap-track]').evaluate(el => ({ image: getComputedStyle(el.querySelector('img')).width, number: getComputedStyle(el.querySelector('.ap-track-number')).width, gap: getComputedStyle(el).gap, title: getComputedStyle(el.querySelector('b')).fontSize }));
    assert.deepEqual(track, { image: '48px', number: '48px', gap: '0px', title: '16.5px' });
    assert.equal(await lib.locator('[data-ap-track] .ap-row-copy small').innerText(), 'Neri Line');
    await lib.locator('[data-ap-back]').click();
    await page.evaluate(() => NP.themes.select('material'));
    assert.equal(await lib.locator('.al-primary').evaluate(el => getComputedStyle(el).height), '48px');
    assert.equal(await lib.locator('.al-secondary').evaluate(el => getComputedStyle(el).height), '48px');
    assert.equal(await lib.locator('.al-tab-thumb').evaluate(el => getComputedStyle(el).clipPath), 'none');
  });
});

test('library platform order and visibility follow Android settings rather than the website language', async () => {
  await browserTest('/en/', async (page, lib) => {
    assert.deepEqual((await lib.locator('[data-ap-source]').evaluateAll(items => items.map(item => item.dataset.apSource))).slice(0, 4), ['local', 'favorite', 'netease', 'youtube']);
    await lib.locator('[data-ap-nav="settings"]').click();
    await lib.locator('[data-ap-setting="general"]').click();
    await lib.locator('[data-as-toggle="youtube_enabled"]').click();
    await lib.locator('[data-ap-nav="library"]').click();
    assert.equal(await lib.locator('[data-ap-source="youtube"]').count(), 0);
    await lib.locator('[data-ap-nav="settings"]').click();
    await lib.locator('[data-ap-setting="general"]').click();
    await lib.locator('[data-as-toggle="youtube_enabled"]').click();
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-setting="language"]').click();
    await lib.locator('[data-as-toggle="internationalization_enabled"]').click();
    await lib.locator('[data-ap-nav="library"]').click();
    assert.deepEqual((await lib.locator('[data-ap-source]').evaluateAll(items => items.map(item => item.dataset.apSource))).slice(0, 4), ['local', 'favorite', 'youtube', 'netease']);
  });
});

test('playlist detail uses source chrome, cover colors, separate action sheet and native search geometry', async () => {
  await browserTest('/', async (page, lib) => {
    await lib.locator('[data-ap-open-playlist="sample"]').click();
    await page.waitForFunction(() => document.querySelector('[data-app-preview="library"] .app-preview').style.getPropertyValue('--al-status-rgb').trim());
    const layout = await lib.evaluate(host => {
      const css = selector => getComputedStyle(host.querySelector(selector));
      return { bar: css('.al-detail-header').height, barColor: css('.al-detail-header').backgroundColor, heroColor: css('.al-detail-hero').backgroundColor, hero: css('.al-detail-hero').minHeight, controls: css('.al-play-actions button').backgroundColor, icon: css('.al-play-actions button svg').width, artwork: css('.al-detail-hero img').width };
    });
    assert.equal(layout.bar, '64px', 'TopAppBarSmallTokens.ContainerHeight is 64dp');
    assert.equal(layout.barColor, layout.heroColor, 'the expanded toolbar shares its cover-derived hero background');
    assert.equal(await lib.locator('.ap-status').evaluate(el => getComputedStyle(el).backgroundColor), layout.heroColor, 'the native TopAppBar status inset continues the hero color');
    assert.equal(layout.hero, '122px');
    assert.equal(layout.artwork, '88px');
    assert.match(await lib.locator('.al-detail-hero p').innerText(), /^1分钟 · 1 首 · 播放 0 次$/);
    assert.notEqual(layout.controls, 'rgba(0, 0, 0, 0)', 'native compact actions have tinted containers');
    assert.equal(layout.icon, '20px');
    assert.equal(await lib.locator('.al-detail-sheet .al-track-row').count(), 0, 'native lazy track rows follow the action sheet');
    assert.equal(await lib.locator('.al-detail-content>.al-track-results>.al-track-row').count(), 1);
    assert.equal(await lib.locator('.al-detail-content .al-library-tools').count(), 0, 'native detail has no extra add/export footer');
    assert.match(await lib.locator('.al-play-actions [data-al-action="add-selected"] path').getAttribute('d'), /M14 10H3/);
    await lib.locator('[data-al-action="detail-search"]').click();
    const search = await lib.locator('[data-al-detail-search]').evaluate(el => {
      const field = el.closest('.ap-search'), hero = el.closest('.al-detail-content').querySelector('.al-detail-hero');
      const scale = hero.getBoundingClientRect().width / hero.offsetWidth;
      return { height: getComputedStyle(field).height, radius: getComputedStyle(field).borderTopLeftRadius, offset: Math.round((field.getBoundingClientRect().top - hero.getBoundingClientRect().top) / scale), expanded: getComputedStyle(hero).minHeight };
    });
    assert.deepEqual(search, { height: '60px', radius: '18px', offset: 116, expanded: '190px' });
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-open-playlist="liked"]').click();
    assert.equal(await lib.locator('.al-hero-placeholder svg').count(), 0, 'blank native header artwork does not invent a heart icon');
    const darkColor = await lib.locator('.al-detail-hero').evaluate(el => getComputedStyle(el).backgroundColor);
    const settings = page.locator('[data-app-preview="settings"]');
    await settings.locator('[data-ap-mode-toggle]').click();
    assert.notEqual(await lib.locator('.al-detail-hero').evaluate(el => getComputedStyle(el).backgroundColor), darkColor);
  });
});

test('simulated platform detail preserves artwork colors, real track identity and truthful missing-audio behavior', async () => {
  await browserTest('/', async (page, lib) => {
    await page.waitForFunction(() => NP.demoData);
    await lib.locator('[data-ap-source="netease"]').click();
    await lib.locator('[data-al-open-demo="demo-netease-night"]').click();
    assert.equal(await lib.locator('.al-track-row').count(), 5);
    assert.equal(await lib.locator('[data-ap-track]').count(), 1, 'only Startrail has a real audio file');
    assert.equal(await lib.locator('[data-al-demo-track]').count(), 4);
    assert.match(await lib.locator('.al-detail-hero p').innerText(), /正在读取时长/);
    assert.equal(await lib.locator('.al-detail-actions [data-al-action="rename"]').count(), 0, 'remote playlists cannot be renamed through local controls');
    await lib.locator('[data-al-demo-track="polaris"]').click();
    assert.match(await lib.locator('[role="dialog"]').innerText(), /尚未配置音源/);
    assert.equal(await page.evaluate(() => NP.player.playing), false, 'clicking Polaris must not play Startrail');
    await apply(lib).click();
    await openMenu(lib, 'track:polaris');
    await lib.locator('[data-al-action="demo-like"]').click();
    assert.equal(await page.evaluate(() => NP.demoData.isTrackLiked('polaris')), true);
    assert.equal(await page.evaluate(() => NP.player.liked), false, 'liking another demo track must preserve the actual player track');
    await lib.locator('[data-al-action="demo-save"]').click();
    assert.equal(await page.evaluate(() => NP.demoData.isPlaylistSaved('demo-netease-night')), true);
    await lib.locator('[data-ap-back]').click();
    assert.equal(await lib.locator('[data-ap-source="netease"]').getAttribute('aria-selected'), 'true');
    await page.evaluate(() => {
      const original = NP.demoData.playlist;
      const red = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><path fill="#ff0000" d="M0 0h96v96H0z"/></svg>');
      NP.demoData.playlist = id => { const item = original(id); return id === 'demo-netease-night' ? { ...item, cover: red } : item; };
    });
    await lib.locator('[data-al-open-demo="demo-netease-night"]').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-app-preview="library"] .al-detail-hero')).backgroundColor === 'rgb(59, 24, 24)');
    assert.equal(await lib.locator('.al-detail-header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(59, 24, 24)', 'native HSL and black blending must use the actual red cover seed');
    await page.locator('[data-app-preview="settings"] [data-ap-mode-toggle]').click();
    assert.equal(await lib.locator('.al-detail-hero').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(119, 48, 48)');
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-source="favorite"]').click();
    assert.equal(await lib.locator('[data-al-open-demo="demo-netease-night"]').count(), 1);
    await lib.locator('[data-al-open-demo="demo-netease-night"]').click();
    await openMenu(lib, 'track:polaris');
    await lib.locator('[data-al-action="demo-artist"]').click();
    assert.equal(await lib.locator('.al-track-row').count(), 10);
    await lib.locator('.al-detail-content').evaluate(el => { el.scrollTop = 180; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-app-preview="library"] .al-detail-header')).backgroundColor === 'rgba(59, 24, 24, 0)' || document.querySelector('[data-app-preview="library"] .al-detail-header').style.getPropertyValue('--al-chrome-alpha') === '0');
    assert.equal(await lib.locator('.al-detail-header').evaluate(el => getComputedStyle(el).color), 'color(srgb 0.0901961 0.0980392 0.121569)', 'collapsed light chrome must retain dark readable content');
  });
});

test('large headers collapse through scroll flow, restore without height feedback, and keep detail bars fixed', async () => {
  await browserTest('/', async (page, lib) => {
    await page.waitForFunction(() => NP.appHeader);
    const settings = page.locator('[data-app-preview="settings"]');
    const header = settings.locator('.ah-header');
    const scroll = settings.locator('.ap-scroll');
    assert.equal(await header.evaluate(el => getComputedStyle(el).height), '64px');
    assert.equal(await settings.locator('.ah-expanded-title').evaluate(el => getComputedStyle(el).height), '88px');
    await scroll.evaluate(el => { el.scrollTop = 132; });
    await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] .ah-header').dataset.collapsed === 'true');
    const fixedHeight = await scroll.evaluate(el => el.clientHeight);
    assert.ok(await header.locator('h2').evaluate(el => parseFloat(getComputedStyle(el).opacity) > .99));
    await page.evaluate(() => NP.themes.select('material'));
    assert.equal(await scroll.evaluate(el => el.scrollTop), 132);
    assert.equal(await scroll.evaluate(el => el.clientHeight), fixedHeight);
    await scroll.evaluate(el => { el.scrollTop = 0; });
    await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] .ah-header').dataset.collapsed === 'false');
    assert.ok(await header.locator('h2').evaluate(el => parseFloat(getComputedStyle(el).opacity) < .01));
    await lib.locator('[data-ap-open-playlist="local"]').click();
    assert.equal(await lib.locator('.al-detail-header').evaluate(el => getComputedStyle(el).height), '64px');
    assert.equal(await lib.locator('.ah-expanded-title').count(), 0);
  });
});

test('settings mode action follows the expanded and collapsed title with one source-sized control', async () => {
  await browserTest('/', async (page) => {
    const settings = page.locator('[data-app-preview="settings"]');
    const mode = settings.locator('[data-ap-mode-toggle]');
    const scroll = settings.locator('.ap-scroll');
    async function aligned(selector) {
      const geometry = await mode.evaluate((button, selector) => {
        const scene = button.closest('.ap-scene');
        const title = scene.querySelector(selector).getBoundingClientRect();
        const box = button.getBoundingClientRect();
        const scale = scene.getBoundingClientRect().width / scene.offsetWidth;
        return { gap: (box.left - title.right) / scale, center: (box.top + box.height / 2 - title.top - title.height / 2) / scale, size: box.width / scale, hidden: !!button.closest('[aria-hidden="true"],[inert]') };
      }, selector);
      assert.ok(Math.abs(geometry.gap - 10) < .1, 'the source title Row uses a 10dp gap');
      assert.ok(Math.abs(geometry.center) < .1, 'mode action and title must share their vertical center');
      assert.ok(Math.abs(geometry.size - 36) < .1);
      assert.equal(geometry.hidden, false);
      assert.equal(await mode.count(), 1, 'expanded and collapsed states must share one focusable action');
    }
    for (const style of ['clean', 'material']) {
      await page.evaluate(style => NP.themes.select(style), style);
      const search = await settings.locator('.ap-settings-content>.ap-search').evaluate(el => {
        const css = getComputedStyle(el);
        return { height: css.height, radius: css.borderTopLeftRadius, padding: css.paddingLeft, gap: css.columnGap, border: css.borderTopWidth, icon: getComputedStyle(el.querySelector('svg')).width };
      });
      assert.deepEqual(search, { height: '48px', radius: '16px', padding: '14px', gap: '10px', border: '0px', icon: '20px' }, 'SettingsNavigationSearch keeps the source 48dp glass shape in both styles');
      await scroll.evaluate(el => { el.scrollTop = 0; });
      await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] .ah-header').dataset.collapsed === 'false');
      await aligned('.ah-expanded-title>span');
      await mode.evaluate(el => { window.headerModeAction = el; });
      await scroll.evaluate(el => { el.scrollTop = 132; });
      await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] .ah-header').dataset.collapsed === 'true');
      await aligned('.ap-header h2');
      assert.equal(await mode.evaluate(el => el === window.headerModeAction), true, 'scrolling must preserve the same button and focus entry');
      const previousMode = await settings.locator('.app-preview').getAttribute('data-mode');
      await mode.click();
      assert.notEqual(await settings.locator('.app-preview').getAttribute('data-mode'), previousMode);
      await aligned('.ap-header h2');
    }
  });
});

test('Clean category selection animates a real sliding thumb with the source spring', async () => {
  await browserTest('/', async (page, lib) => {
    await lib.scrollIntoViewIfNeeded();
    const start = await lib.locator('.al-tab-thumb').evaluate(el => el.getBoundingClientRect().x);
    await lib.locator('[data-ap-secondary="artists"]').click();
    const animation = await lib.locator('.al-tab-thumb').evaluate(el => {
      const animation = el.getAnimations()[0];
      return animation ? { duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes().length, state: animation.playState } : null;
    });
    assert.equal(animation?.duration, 360);
    assert.ok(animation.frames > 30);
    await lib.locator('.al-tab-thumb').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
    const finish = await lib.locator('.al-tab-thumb').evaluate(el => el.getBoundingClientRect().x);
    assert.ok(finish - start > 90);
  }, { reducedMotion: 'no-preference' });
});

test('statistics count actual listening rather than seek position and recent history supports search and deletion', async () => {
  await browserTest('/', async (page, lib) => {
    await page.evaluate(() => NP.player.seek(31));
    await lib.locator('[data-ap-open-playlist="local"]').click();
    await lib.locator('[data-ap-track]').click();
    await page.waitForFunction(() => NP.player.audible && document.getElementById('player').currentTime > 31.8);
    await lib.locator('[data-ap-toggle]').click();
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-al-action="stats"]').click();
    assert.match(await lib.locator('.al-detail-header h2').innerText(), /播放统计/);
    assert.equal(await lib.locator('[data-al-period]').count(), 5);
    assert.ok(parseInt(await lib.locator('[data-al-listen-duration]').first().innerText(), 10) < 10, 'seeking to 31 seconds must not fabricate 31 seconds of listening');
    await lib.locator('[data-al-period="month"]').click();
    assert.equal(await lib.locator('[data-al-period="month"]').getAttribute('aria-selected'), 'true');
    await lib.locator('[data-al-action="stats-sort"]').click();
    await lib.locator('[data-al-action="stats-time"]').click();
    assert.equal(await lib.locator('[role="dialog"]').count(), 0);
    await lib.locator('[data-al-action="clear-stats"]').click();
    await apply(lib).click();
    assert.match(await lib.innerText(), /还没有播放记录/);
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-al-action="recent"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 1);
    await lib.locator('[data-al-action="detail-search"]').click();
    await lib.locator('[data-al-detail-search]').fill('找不到');
    assert.equal(await lib.locator('[data-ap-track]').count(), 0);
    await lib.locator('[data-al-action="clear-detail"]').click();
    await openMenu(lib, 'track');
    await lib.locator('[data-al-action="select-tracks"]').click();
    await lib.locator('[data-al-toggle="startrail"][role="checkbox"]').click();
    await lib.locator('[data-al-action="delete-recent-selected"]').click();
    await apply(lib).click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 0);
  });
});

test('favorites use playlist/artist/hot categories and remote platforms show real unsigned states', async () => {
  await browserTest('/', async (page, lib) => {
    await page.evaluate(() => ['netease', 'bilibili', 'youtube'].forEach(provider => NP.demoData?.setAccount(provider, false)));
    await lib.locator('[data-ap-source="favorite"]').click();
    assert.equal(await lib.locator('[data-ap-open-playlist="liked"]').count(), 0, 'liked songs belong to local playlists in Android');
    await lib.locator('[data-ap-secondary="hot"]').click();
    assert.equal(await lib.locator('[data-ap-open-playlist="week"]').count(), 1);
    await lib.locator('[data-ap-open-playlist="week"]').click();
    assert.equal(await lib.locator('[data-ap-track]').count(), 0, 'weekly hot tracks must meet the real listening threshold');
    await lib.locator('[data-ap-back]').click();
    await lib.locator('[data-ap-secondary="artists"]').click();
    assert.equal(await lib.locator('[data-al-platform]').count(), 3);
    await lib.locator('[data-al-action="pull-artists"]').click();
    assert.match(await lib.innerText(), /请先登录/);
    await lib.locator('[data-ap-source="netease"]').click();
    await lib.locator('[data-ap-secondary="albums"]').click();
    assert.match(await lib.innerText(), /网易云专辑/);
    await lib.locator('[data-ap-source="bilibili"]').click();
    assert.match(await lib.innerText(), /收藏夹或合集/);
    await lib.locator('[data-ap-source="youtube"]').click();
    assert.match(await lib.innerText(), /YouTube Music/);
    assert.equal(await lib.locator('[data-ap-source="qq"]').count(), 0, 'the website omits the unavailable QQ Music tab');
    await lib.locator('[data-ap-source="netease"]').click();
    await lib.locator('[data-al-action="login"]').click();
    assert.match(await lib.locator('.ap-header').innerText(), /第三方平台登录/);
  });
});

test('English touch previews keep source dimensions and live controls in both styles', async () => {
  await browserTest('/en/', async (page, lib) => {
    for (const style of ['material', 'clean']) {
      await page.evaluate(style => NP.themes.select(style), style);
      await lib.locator('[data-ap-open-playlist="local"]').click();
      assert.match(await lib.innerText(), /Manually added/);
      assert.equal(await lib.locator('.al-detail-header').evaluate(el => getComputedStyle(el).height), '64px');
      assert.equal(await lib.locator('.al-hero-summary>img').evaluate(el => getComputedStyle(el).width), '88px');
      await openMenu(lib, 'track');
      assert.match(await lib.locator('[role="dialog"]').innerText(), /Song details/);
      await page.keyboard.press('Escape');
      assert.equal(await lib.locator('[role="dialog"]').count(), 0);
      await lib.locator('[data-ap-back]').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    }
  }, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
});
