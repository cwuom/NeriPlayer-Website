import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const executablePath = [process.env.CHROME, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && existsSync(p));
const site = (process.env.SITE_URL || 'http://localhost:6060').replace(/\/$/, '');
async function withHome(path, run, options = {}) {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', ...options });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(site + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted && NP.previewHome; });
    await enablePreviewInteractions(page, ['library']);
    const app = page.locator('[data-app-preview="library"]');
    await app.locator('[data-ap-nav="home"]').click();
    await run(page, app);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test('home continues into a real local playlist, can remove an entry, and does not fabricate cloud playback', async () => {
  await withHome('/', async (page, app) => {
    assert.match(await app.innerText(), /继续播放/);
    await app.locator('[data-ah-open="sample"]').click();
    assert.match(await app.locator('.al-detail-header').innerText(), /NeriPlayer 示例歌单/);
    await app.locator('[data-ap-track]').click();
    await page.waitForFunction(() => NP.player.audible && NP.player.playing);
    await app.locator('[data-ap-toggle]').click();
    await app.locator('[data-ap-nav="home"]').click();
    await app.locator('[data-ah-action="continue-menu"][data-ah-id="sample"]').click();
    await app.locator('[data-ah-action="remove-continue"]').click();
    assert.equal(await app.locator('[data-ah-open="sample"]').count(), 0);
    await app.locator('[data-ah-action="refresh"]').click();
    assert.match(await app.locator('.ah-message').innerText(), /推荐已刷新/);
    assert.equal(await page.evaluate(() => NP.player.playing), false);
  });
});

test('home section controls use actual settings state and restore the source hidden-card state', async () => {
  await withHome('/', async (page, app) => {
    await app.locator('[data-ap-nav="settings"]').click();
    await app.locator('[data-ap-setting="personalization"]').click();
    for (const key of ['home_card_continue', 'home_card_radar', 'home_card_trending', 'home_card_recommended', 'home_card_bilibili']) {
      await app.locator(`[data-as-toggle="${key}"]`).click();
      assert.equal(await page.evaluate(key => NP.previewSettings.value(key), key), false);
    }
    await app.locator('[data-ap-nav="home"]').click();
    assert.equal(await app.locator('.ah-home-section').count(), 0);
    assert.match(await app.innerText(), /首页卡片已全部隐藏/);
    await app.locator('[data-ah-action="personalization"]').click();
    assert.match(await app.locator('.ap-header').innerText(), /首页与启动/);
  });
});

test('explore implements real source tabs, tags, native search categories, debounce and editable history', async () => {
  await withHome('/', async (page, app) => {
    await app.locator('[data-ah-action="open-search"]').click();
    assert.equal(await app.locator('[data-ah-tag]').count(), 26);
    assert.equal(await app.locator('[data-ah-source]').count(), 4);
    await app.locator('[data-ah-tag="5"]').click();
    assert.equal(await app.locator('[data-ah-tag="5"]').getAttribute('aria-pressed'), 'true');
    await app.locator('[data-ah-query]').fill('星轨');
    await page.waitForFunction(() => document.querySelector('[data-app-preview="library"] [data-ah-history="星轨"]'));
    assert.equal(await app.locator('[data-ah-type]').count(), 3);
    assert.equal(await app.locator('[data-ap-track]').count(), 0, 'a local sample must not be disguised as a cloud search result');
    assert.match(await app.locator('.ah-explore-results').innerText(), /星轨/);
    assert.equal(await app.locator('[data-ah-demo="startrail"]').count(), 1);
    await app.locator('[data-ah-type="playlist"]').click();
    assert.equal(await app.locator('[data-ah-type="playlist"]').getAttribute('aria-selected'), 'true');
    await app.locator('[data-ah-action="clear-query"]').click();
    await app.locator('[data-ah-history="星轨"]').click();
    assert.equal(await app.locator('[data-ah-query]').inputValue(), '星轨');
    await app.locator('[data-ah-action="clear-query"]').click();
    await app.locator('[data-ah-remove-history="星轨"]').click();
    assert.equal(await app.locator('[data-ah-history]').count(), 0);
    await app.locator('[data-ah-query]').fill('Neri Line');
    await page.waitForFunction(() => document.querySelector('[data-ah-history="Neri Line"]'));
    await app.locator('[data-ah-action="clear-query"]').click();
    await app.locator('[data-ah-action="clear-history"]').click();
    assert.equal(await app.locator('[data-ah-history]').count(), 0);
  });
});

test('link recognition exposes identities and menus without inventing remote audio or accepting unsafe URLs', async () => {
  await withHome('/', async (page, app) => {
    await app.locator('[data-ap-nav="explore"]').click();
    await app.locator('[data-ah-source="links"]').click();
    for (const [url, id] of [['https://music.163.com/#/song?id=123', '123'], ['https://www.bilibili.com/video/BV1xx411c7mD', 'BV1xx411c7mD'], ['https://youtu.be/abc12345678', 'abc12345678']]) {
      await app.locator('[data-ah-query]').fill(url);
      await page.keyboard.press('Enter');
      assert.match(await app.locator('.ah-link-result').innerText(), new RegExp(id));
      assert.equal(await app.locator('[data-ap-track]').count(), 0);
      await app.locator('[data-ah-action="result-menu"]').click();
      assert.match(await app.locator('[role="dialog"]').innerText(), /复制链接/);
      assert.equal(await app.locator('[role="dialog"] a').getAttribute('rel'), 'noopener');
      await page.keyboard.press('Escape');
      await app.locator('[data-ah-action="link-details"]').click();
      assert.match(await app.locator('[role="dialog"]').innerText(), new RegExp(id));
      await page.keyboard.press('Escape');
    }
    await app.locator('[data-ah-query]').fill('javascript:alert(1)');
    await page.keyboard.press('Enter');
    assert.equal(await app.locator('.ah-link-result').count(), 0);
    assert.match(await app.innerText(), /无法识别/);
    assert.equal(await page.evaluate(() => NP.player.playing), false);
  });
});

test('internationalization, YouTube visibility and search-history controls propagate across pages', async () => {
  await withHome('/', async (page, app) => {
    await app.locator('[data-ap-nav="settings"]').click();
    await app.locator('[data-ap-setting="language"]').click();
    await app.locator('[data-as-toggle="internationalization_enabled"]').click();
    await app.locator('[data-ap-nav="home"]').click();
    assert.match(await app.innerText(), /每日发现/);
    assert.doesNotMatch(await app.locator('.ah-home-content').innerText(), /Bilibili 音乐榜/);
    await app.locator('[data-ap-nav="explore"]').click();
    assert.equal(await app.locator('[data-ah-source="youtube"]').getAttribute('aria-selected'), 'true');
    await app.locator('[data-ap-nav="settings"]').click();
    await app.locator('[data-ap-setting="general"]').click();
    await app.locator('[data-as-toggle="youtube_enabled"]').click();
    await app.locator('[data-as-toggle="explore_search_history_enabled"]').click();
    await app.locator('[data-ap-nav="explore"]').click();
    assert.equal(await app.locator('[data-ah-source="youtube"]').count(), 0);
    assert.equal(await app.locator('[data-ah-source="netease"]').getAttribute('aria-selected'), 'true');
    await app.locator('[data-ah-query]').fill('not saved');
    await page.keyboard.press('Enter');
    assert.equal(await app.locator('[data-ah-history]').count(), 0);
  });
});

test('English touch home and explore retain real controls, keyboard source navigation and responsive bounds', async () => {
  await withHome('/en/', async (page, app) => {
    await app.locator('[data-ah-action="open-search"]').click();
    await app.locator('[data-ah-source="netease"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await app.locator('[data-ah-source="bilibili"]').getAttribute('aria-selected'), 'true');
    await app.locator('[data-ah-query]').fill('Startrail');
    await page.keyboard.press('Enter');
    assert.match(await app.locator('.ah-explore-results').innerText(), /Startrail/);
    assert.equal(await app.locator('[data-ah-demo="startrail"]').count(), 1);
    await page.evaluate(() => NP.themes.select('material'));
    await app.locator('[data-ap-nav="home"]').click();
    assert.match(await app.innerText(), /Continue/);
    assert.equal(await app.locator('[data-ah-action="open-search"]').count(), 0, 'the home search pill is Clean-specific in Android');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  }, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
});

test('original Home remains a read-only Material example with independent appearance controls', async () => {
  await withHome('/', async (page) => {
    const original = page.locator('#phHome');
    assert.equal(await original.getAttribute('data-app-style'), 'material');
    assert.equal(await original.locator('.hm-app').evaluate(el => el.inert), true);
    await original.evaluate(el => el.querySelectorAll('button,.hm-card,.hm-list li,.hm-nav>span').forEach(target => target.click()));
    assert.equal(await page.locator('#deviceHome .ap-embedded-host').count(), 0);
    assert.equal(await page.evaluate(() => NP.player.playing), false);
    await page.locator('#lab [data-app-style="clean"]').click();
    assert.equal(await original.getAttribute('data-app-style'), 'clean');
    assert.equal(await original.locator('.hm-sec>svg:visible').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-app-style'), 'clean');
    await page.locator('#lab [data-app-style="material"]').click();
    await page.locator('#lab [data-mode="light"]').click();
    assert.equal(await original.getAttribute('data-app-style'), 'material');
    assert.equal(await original.evaluate(el => el.classList.contains('is-light')), true);
  });
});
