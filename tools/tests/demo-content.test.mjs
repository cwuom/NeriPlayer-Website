import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
async function visit(run, options = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', ...options });
    const errors = [], authRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/login|\/oauth|\/auth\//i.test(request.url())) authRequests.push(request.url()); });
    await page.route('**/__live', route => route.abort());
    await page.goto((process.env.SITE_URL || 'http://localhost:6060') + (options.locale === 'en' ? '/en/' : '/'));
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted && NP.previewHome; });
    await enablePreviewInteractions(page, ['library']);
    const host = page.locator('[data-app-preview="library"]');
    await host.locator('[data-ap-nav="home"]').click();
    await run(page, host);
    assert.deepEqual(errors, []);
    assert.deepEqual(authRequests, [], 'simulated sign-in must never call a real sign-in endpoint');
  } finally { await browser.close(); }
}
test('signed-in demo Home renders three continue cards, three radar tracks and real playlist artwork', async () => {
  await visit(async (page, host) => {
    assert.equal(await host.locator('[data-ah-radar-track]').count(), 3);
    assert.equal(await host.locator('[data-ah-continue]').count(), 3);
    assert.ok(await host.locator('[data-ah-shelf-card]').count() >= 3);
    assert.equal(await host.locator('.ah-feed-empty').count(), 0);
    assert.equal(await host.locator('.ah-home-content img').evaluateAll(images => images.every(image => image.getAttribute('src').includes('/assets/img/covers/'))), true);
  });
});
test('all simulated platforms browse and search local demo content without sign-in prompts', async () => {
  await visit(async (page, host) => {
    assert.deepEqual(await page.evaluate(() => ['netease', 'bilibili', 'youtube'].map(provider => ({ signedIn: NP.demoData.account(provider).signedIn, simulated: NP.demoData.account(provider).simulated }))), Array(3).fill({ signedIn: true, simulated: true }));
    await host.locator('[data-ap-nav="explore"]').click();
    assert.ok(await host.locator('.ah-browse-card').count() >= 4);
    for (const provider of ['netease', 'bilibili', 'youtube']) {
      await host.locator('[data-ah-source="' + provider + '"]').click();
      await host.locator('[data-ah-query]').fill('Startrail');
      await page.keyboard.press('Enter');
      assert.ok(await host.locator('[data-ah-demo="startrail"]').count(), provider);
      assert.doesNotMatch(await host.locator('.ah-explore-results').innerText(), /未登录|请先登录|Sign in/);
      await host.locator('[data-ah-action="clear-query"]').click();
    }
  });
});
test('demo metadata never assigns Startrail audio to unrelated covers and shared account changes stay local', async () => {
  await visit(async (page, host) => {
    const metadata = await page.evaluate(() => NP.demoData.tracks().map(track => ({ id: track.id, playable: track.playable, audio: track.audio, duration: track.duration })));
    assert.equal(metadata.length, 10);
    assert.match(metadata.find(track => track.id === 'startrail').audio, /\/assets\/audio\/startrail\.mp3$/);
    assert.ok(metadata.filter(track => track.id !== 'startrail').every(track => track.playable === false && track.audio === null && track.duration === null));
    const kinds = await page.evaluate(() => ['song', 'playlist', 'artist'].map(type => NP.demoData.search('bilibili', type, 'Startrail').map(item => item.kind)));
    assert.ok(kinds[0].length > 0 && kinds[0].every(kind => kind === 'video'));
    assert.ok(kinds[1].length > 0 && kinds[1].every(kind => kind === 'playlist'));
    assert.deepEqual(kinds[2], ['artist']);
    await page.evaluate(() => NP.demoData.setAccount('netease', false));
    assert.equal(await page.evaluate(() => NP.demoData.account('netease').signedIn), false);
    assert.match(await host.locator('.ah-home-content').innerText(), /登录|Sign in/);
    await page.evaluate(() => NP.demoData.setAccount('netease', true));
    assert.equal(await host.locator('[data-ah-radar-track]').count(), 3);
  });
});
test('Home track actions preserve each identity, shared favorites and actual local playback', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ah-radar-track="polaris"] [data-ah-demo]').click();
    assert.match(await host.locator('[role="dialog"]').innerText(), /北极星/);
    assert.match(await host.locator('[role="dialog"]').innerText(), /尚未配置音源/);
    assert.equal(await page.evaluate(() => NP.player.playing), false);
    await page.keyboard.press('Escape');
    await host.locator('[data-ah-radar-track="polaris"] [data-ah-action="demo-menu"]').click();
    assert.equal(await host.locator('[role="dialog"] [data-ah-action]').count(), 8);
    await host.locator('[data-ah-action="demo-like"]').click();
    assert.equal(await page.evaluate(() => NP.demoData.isTrackLiked('polaris')), true);
    await host.locator('[data-ah-radar-track="startrail"] [data-ah-demo]').click();
    await page.waitForFunction(() => NP.player.playing && NP.player.audible);
    await host.locator('[data-ap-toggle]').click();
    await host.locator('[data-ah-open="demo-netease-night"]').click();
    assert.match(await host.locator('.al-detail-header').innerText(), /星轨旅程/);
    assert.equal(await host.locator('[data-al-row]').count(), 5);
    await host.locator('[data-al-demo-track="polaris"]').click();
    assert.match(await host.locator('[role="dialog"]').innerText(), /北极星/);
    assert.equal(await page.evaluate(() => NP.player.playing), false);
  });
});
test('Explore categories and result types open distinct demo collections and creators', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-nav="explore"]').click();
    const all = await host.locator('.ah-browse-card').count();
    await host.locator('[data-ah-tag="5"]').click();
    assert.ok(await host.locator('.ah-browse-card').count() < all);
    assert.match(await host.locator('.ah-browse-grid').innerText(), /沿着日光去海边/);
    await host.locator('.ah-browse-card').click();
    assert.match(await host.locator('.al-detail-header').innerText(), /沿着日光去海边/);
    await host.locator('[data-ap-nav="explore"]').click();
    await host.locator('[data-ah-query]').fill('Startrail');
    await page.keyboard.press('Enter');
    await host.locator('[data-ah-type="playlist"]').click();
    assert.ok(await host.locator('.ah-collection-row').count() >= 2);
    await host.locator('[data-ah-type="artist"]').click();
    assert.match(await host.locator('.ah-collection-row').innerText(), /Neri Line/);
    await host.locator('.ah-collection-row').click();
    assert.match(await host.locator('.al-detail-header').innerText(), /Neri Line/);
    assert.equal(await host.locator('[data-al-row]').count(), 10);
  });
});
for (const locale of ['zh', 'en']) for (const style of ['clean', 'material']) for (const width of [375, 1440]) {
  test('native Home and Explore geometry ' + [locale, style, width].join('-'), async () => {
    const evidence = process.env.ARTIFACT_DIR;
    if (evidence) mkdirSync(evidence, { recursive: true });
    await visit(async (page, host) => {
      await page.evaluate(style => NP.themes.select(style), style);
      await host.locator('[data-ap-nav="settings"]').click();
      await host.locator('[data-ap-mode-toggle]').click();
      await host.locator('[data-ap-nav="home"]').click();
      assert.equal(await host.locator('.app-preview').getAttribute('data-mode'), 'light');
      const home = await host.locator('.ah-home-content').evaluate(el => {
        const style = getComputedStyle(el), cover = el.querySelector('.ah-song-open>img'), card = el.querySelector('.ah-shelf-card'), title = el.querySelector('h3');
        return { padding: parseFloat(style.paddingLeft), titleSize: parseFloat(getComputedStyle(title).fontSize), cover: [cover.offsetWidth, cover.offsetHeight], card: card.offsetWidth, sectionIcons: getComputedStyle(title.querySelector('svg')).display, continue: el.querySelectorAll('[data-ah-continue]').length, searchHeight: el.querySelector('.ah-search-entry')?.offsetHeight || 0 };
      });
      assert.deepEqual(home.cover, [44, 44]);
      assert.equal(home.padding, 24);
      assert.equal(home.titleSize, style === 'clean' ? 22 : 24);
      assert.equal(home.card, 148);
      assert.equal(home.continue, 3);
      assert.equal(home.searchHeight, style === 'clean' ? 46 : 0);
      assert.equal(home.sectionIcons, style === 'clean' ? 'none' : 'block');
      if (evidence) await host.screenshot({ path: join(evidence, 'home-' + [locale, style, width].join('-') + '.png') });
      await host.locator('[data-ap-nav="explore"]').click();
      const explore = await host.locator('.ah-explore-content').evaluate(el => {
        const grid = el.querySelector('.ah-browse-grid'), card = grid.querySelector('.ah-browse-card'), cover = card.querySelector('.ah-artwork>img'), band = card.querySelector('.ah-featured-caption');
        const tag = el.querySelector('[data-ah-tag="1"]'), pill = tag.firstElementChild, selected = el.querySelector('[data-ah-tag="0"]').firstElementChild;
        return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').map(Number.parseFloat), gap: parseFloat(getComputedStyle(grid).gap), searchHeight: el.querySelector('.ap-search').offsetHeight, searchRadius: parseFloat(getComputedStyle(el.querySelector('.ap-search')).borderRadius), cover: [cover.offsetWidth, cover.offsetHeight], captionHeight: band.offsetHeight, categoryHeight: tag.offsetHeight, pillHeight: pill.offsetHeight, pillOutline: getComputedStyle(pill).borderTopColor, pillBorder: getComputedStyle(pill).borderTopWidth, selectedOutline: getComputedStyle(selected).borderTopColor, icons: Array.from(el.querySelectorAll('.ah-search-types [data-ah-icon]')).map(icon => icon.dataset.ahIcon), blur: getComputedStyle(band, '::before').filter, width: grid.offsetWidth };
      });
      assert.equal(explore.columns.length, 2);
      assert.ok(explore.columns.every(column => column > 180));
      assert.equal(explore.gap, 12);
      assert.equal(explore.searchHeight, 56);
      assert.equal(explore.searchRadius, style === 'clean' ? 22 : 16);
      assert.equal(explore.categoryHeight, 48);
      assert.equal(explore.pillHeight, 32);
      assert.equal(explore.pillBorder, '1px');
      assert.equal(explore.pillOutline, style === 'clean' ? 'rgb(133, 133, 140)' : 'rgb(121, 116, 126)');
      assert.equal(explore.selectedOutline, 'rgb(98, 91, 113)');
      assert.deepEqual(explore.icons, ['musicNote', 'queueMusic', 'accountCircle']);
      assert.equal(explore.cover[0], explore.cover[1]);
      assert.equal(explore.captionHeight, style === 'clean' ? 54 : 0);
      assert.equal(explore.blur, 'blur(24px)');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      assert.equal(await host.locator('.app-preview').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.equal(await host.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
      if (evidence) {
        const name = [locale, style, width].join('-');
        await host.screenshot({ path: join(evidence, 'explore-' + name + '.png') });
        writeFileSync(join(evidence, 'geometry-' + name + '.json'), JSON.stringify({ home, explore }, null, 2));
      }
    }, { locale, viewport: { width, height: width === 375 ? 900 : 1100 }, hasTouch: width === 375, isMobile: width === 375 });
  });
}
