import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6060';

for (const language of ['/', '/en/']) for (const width of [390, 1440]) {
  test(`dual-theme gallery scrolls without navigation ${language} ${width}`, async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width < 600, isMobile: width < 600 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/__live', route => route.abort());
      await page.goto(origin + language, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
      const gallery = page.locator('#themes .theme-gallery');
      assert.equal(await gallery.locator('[data-preview-readonly]').count(), 2);
      assert.equal(await gallery.locator('[data-ap-source="qq"]').count(), 0);
      assert.equal(await page.locator('[data-open-simulator],[data-simulator-host],#appSimulator').count(), 0, 'the gallery only provides the two fixed previews');
      assert.equal(await page.evaluate(() => typeof NP.appSimulator), 'undefined');
      for (const style of ['clean', 'material']) {
        await page.locator(`#themes button[data-app-style="${style}"]`).click();
        for (const route of ['settings', 'library']) {
          const host = gallery.locator(`[data-app-preview="${route}"]`);
          assert.equal(await host.locator('.app-preview').getAttribute('data-style'), style);
          assert.equal(await host.locator('button:enabled,input:enabled,textarea:enabled,select:enabled').count(), 0);
          const nav = host.locator('[data-ap-nav="home"]');
          await nav.scrollIntoViewIfNeeded();
          const rect = await nav.boundingBox();
          await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
          const state = await host.evaluate(el => {
            el.querySelector('[data-ap-open-player]').click();
            el._appPreview.navigate('home');
            el._appPreview.openNative('player');
            return { route: el._appPreview.route, page: el._appPreview.page, native: el.querySelectorAll('.ap-native-device').length, modal: el.querySelectorAll('[role="dialog"]').length };
          });
          assert.deepEqual(state, { route, page: '', native: 0, modal: 0 });
          assert.equal(await nav.evaluate(el => { el.focus(); return document.activeElement === el; }), false);
          if (route === 'library') {
            const row = host.locator('[data-al-hold="sample"]');
            await row.scrollIntoViewIfNeeded();
            const box = await row.boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
            assert.equal(await host.evaluate(el => el._appPreview.al.selecting), false, 'context menus cannot enter selection in the display gallery');
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
            assert.equal(await host.evaluate(el => el._appPreview.al.selecting), false, 'long presses cannot enter selection in the display gallery');
          }
        }
        const scroll = gallery.locator('[data-app-preview="settings"] .ap-scroll');
        await scroll.scrollIntoViewIfNeeded();
        const rect = await scroll.boundingBox();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.mouse.wheel(0, 480);
        await page.waitForFunction(() => document.querySelector('#themes [data-app-preview="settings"] .ap-scroll').scrollTop > 0);
        if (width < 600) {
          await scroll.evaluate(el => { el.scrollTop = 0; });
          const touch = await page.context().newCDPSession(page);
          const x = rect.x + rect.width / 2, y = rect.y + rect.height * .7;
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let step = 1; step <= 8; step++) { await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 24 }] }); await page.waitForTimeout(16); }
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForFunction(() => document.querySelector('#themes [data-app-preview="settings"] .ap-scroll').scrollTop > 0);
          await touch.detach();
        }
        assert.equal(await gallery.locator('[data-app-preview="settings"]').evaluate(el => el._appPreview.route), 'settings');
        const out = process.env.GALLERY_ARTIFACTS;
        if (out) { mkdirSync(out, { recursive: true }); await gallery.screenshot({ path: `${out}/${language === '/' ? 'zh' : 'en'}-${style}-${width}.png` }); }
      }
      assert.equal(await page.evaluate(() => NP.player.playing), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
