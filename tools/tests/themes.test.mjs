import { enablePlayerInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);

test('download follows the introduction and navigation keeps it second', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const sections = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sections.slice(0, 4), ['top', 'download', 'themes', 'play']);
  const nav = /<nav class="nav__links"[\s\S]*?<\/nav>/.exec(html)[0];
  assert.equal([...nav.matchAll(/href="#([^"]+)"/g)][1][1], 'download');
});

test('both languages keep DOM player previews on touch screens', async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
  try {
    for (const path of ['/', '/en/']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
      await page.route('**/__live', route => route.abort());
      await page.goto((process.env.SITE_URL || 'http://localhost:6060').replace(/\/$/, '') + path, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.NP?.booted);
      assert.equal(await page.locator('#devicePlay.is-shot').count(), 0);
      assert.equal(await page.locator('#devicePlay .pg-cover [data-ph-toggle]').count(), 1);
      assert.equal(await page.locator('#deviceLyrics .pg-lyrics [data-ph-like]').count(), 1);
      await page.locator('#themes [data-app-style="material"]').click();
      const images = await page.locator('#shots img[data-real-shot]').evaluateAll(imgs => imgs.map(img => img.src));
      assert.equal(images.length, 4);
      for (const url of images) {
        assert.match(url, /\/real-(home|explore|library|settings)\.jpg$/);
        assert.equal((await page.request.get(url)).status(), 200, url);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('favorite color and Clean player geometry follow the Android source', async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.route('**/__live', route => route.abort());
    await page.goto(process.env.SITE_URL || 'http://localhost:6060/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.booted);
    await enablePlayerInteractions(page);
    for (const style of ['clean', 'material']) {
      await page.locator('#themes [data-app-style="' + style + '"]').click();
      await page.locator('#phPlay .pg-cover [data-ph-like]').click();
      assert.equal(await page.locator('#phPlay .pg-cover [data-ph-like]').evaluate(el => getComputedStyle(el).color), 'rgb(255, 59, 0)');
      assert.equal(await page.locator('#phLyrics .pg-lyrics [data-ph-like]').evaluate(el => getComputedStyle(el).color), 'rgb(255, 59, 0)');
      assert.equal(await page.locator('#phPlay .ph-snack.is-on').count(), 0, 'Android favorite action has no snackbar');
      await page.locator('#phPlay .pg-cover [data-ph-like]').click();
      assert.notEqual(await page.locator('#phPlay .pg-cover [data-ph-like]').evaluate(el => getComputedStyle(el).color), 'rgb(255, 59, 0)');
    }
    await page.locator('#themes [data-app-style="clean"]').click();
    const cover = await page.locator('#phPlay .pc-art').evaluate(el => { const css = getComputedStyle(el); return { radius: css.getPropertyValue('--ph-cover-corner'), smoothing: css.getPropertyValue('--ph-cover-smoothing'), border: css.borderRadius, shadow: css.boxShadow, path: css.clipPath }; });
    assert.equal(cover.radius, '24px');
    assert.equal(cover.smoothing, '1');
    assert.equal(cover.border, '0px');
    assert.equal(cover.shadow, 'none');
    assert.equal((cover.path.match(/C/g) || []).length, 4, 'Clean artwork must use the source continuous-corner path');
    assert.equal(await page.locator('#phPlay .pc-id b').evaluate(el => getComputedStyle(el).fontSize), '22px');
    assert.equal(await page.locator('#phLyrics .pl-ctrl [data-ph-prev] svg').evaluate(el => getComputedStyle(el).width), '32px');
    await page.close();
  } finally { await browser.close(); }
});

test('global and local themes preserve playback and keep real device photos unchanged', async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const executablePath = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && existsSync(p));
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/__live', route => route.abort());
    await page.goto(process.env.SITE_URL || 'http://localhost:6060/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NP?.booted);
    assert.ok(await page.evaluate(() => NP.phones.list.every(phone => !phone.fluid)), 'offscreen phone demos must not allocate WebGL at startup');
    assert.equal(await page.$eval('html', el => el.dataset.appStyle), 'clean');
    const photos = await page.locator('#shots img[data-real-shot]').evaluateAll(imgs => imgs.map(img => img.src));
    await page.evaluate(() => { NP.player.seek(22); NP.player.liked = true; });
    await page.click('#themes [data-app-style="material"]');
    assert.equal(await page.$eval('html', el => el.dataset.appStyle), 'material');
    assert.deepEqual(await page.locator('#shots img[data-real-shot]').evaluateAll(imgs => imgs.map(img => img.src)), photos);
    assert.equal(await page.locator('#phPlay').getAttribute('data-app-style'), 'material');
    assert.equal(await page.$eval('#themes [data-app-style="material"]', el => el.getAttribute('aria-checked')), 'true');
    assert.ok(await page.evaluate(() => NP.player.liked && NP.player.t >= 22));
    await page.locator('#devicePlay').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => NP.phones.list.find(phone => phone.device.id === 'devicePlay').fluid);
    await page.locator('#themes [data-app-style="material"]').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.$eval('html', el => el.dataset.appStyle), 'clean');
    assert.equal(await page.$eval('#lab [data-app-style="material"]', el => el.getAttribute('aria-checked')), 'true');
    assert.equal(await page.locator('#phHome').getAttribute('data-app-style'), 'material');
    await page.click('#lab [data-app-style="clean"]');
    assert.equal(await page.locator('#phHome').getAttribute('data-app-style'), 'clean');
    assert.equal(await page.locator('#phHome .hm-sec > svg:visible').count(), 0);
    const clean = await page.$eval('#phHome .hm-nav', el => ({ radius: getComputedStyle(el).borderRadius, left: getComputedStyle(el).left }));
    assert.equal(clean.radius, '32px');
    assert.equal(clean.left, '16px');
    await page.click('#lab [data-mode="light"]');
    assert.equal(await page.$eval('#phHome', el => getComputedStyle(el).getPropertyValue('--h-bg').trim()), '#f4f4f7');
    await page.close();
  } finally {
    await browser.close();
  }
});
