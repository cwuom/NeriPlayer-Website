import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');

for (const language of ['zh', 'en']) for (const width of [390, 1440]) {
  test(`immersive source spacing and Clean typography remain intact at ${language} ${width}`, async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1100 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/__live', route => route.abort());
      await page.goto(`${process.env.SITE_URL || 'http://localhost:6060'}/${language === 'en' ? 'en/' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted && !document.querySelector('#devicePlay').classList.contains('is-fontwait'); });
      const regularWidth = await page.locator('#devicePlay').evaluate(node => node.offsetWidth);
      for (const style of ['clean', 'material']) {
        await page.evaluate(style => {
          NP.player.pause();
          NP.themes.select(style);
          NP.previewSettings.set('nowplaying_control_placement', 'lower');
          NP.previewSettings.set('nowplaying_immersive_mode', true);
        }, style);
        await page.waitForTimeout(700);
        const geometry = await page.evaluate(() => {
          const phone = document.querySelector('#phPlay');
          const box = selector => {
            const node = phone.querySelector(selector);
            const css = getComputedStyle(node);
            return Object.fromEntries(['top', 'left', 'width', 'height', 'fontSize', 'lineHeight', 'fontWeight', 'textAlign'].map(key => [key, css[key]]));
          };
          return {
            viewport: box('.pg-cover'),
            status: box('.ph__status'), top: box('.pc-top'), art: box('.pc-art'), identity: box('.pc-id'),
            title: box('.pc-id b'), artist: box('.pc-id span'), progress: box('.pc-prog'), info: box('.pc-info'),
            controls: box('.pc-ctrl'), dock: box('.pc-dock'), time: box('.pc-time'),
            source: phone.querySelector('.pc-art img').getAttribute('src'),
            lyricsTop: getComputedStyle(phone.querySelector('.pl-top')).top,
            otherSafeTop: getComputedStyle(document.querySelector('#phLyrics')).getPropertyValue('--ph-safe-top').trim(),
            deviceWidth: document.querySelector('#devicePlay').offsetWidth,
            lyrics: ['.pl-lrc', '.pl-chip', '.pl-prog', '.pl-ctrl', '.pl-tools'].map(selector => box(selector)),
            playButton: box('.pc-ctrl [data-ph-toggle]')
          };
        });
        const numeric = (value, expected) => assert.equal(parseFloat(value), expected);
        numeric(geometry.viewport.width, 384);
        numeric(geometry.viewport.height, 837);
        numeric(geometry.status.height, 42.5);
        numeric(geometry.top.top, 42.5 + 12);
        numeric(geometry.top.height, 56);
        numeric(geometry.art.left, 20);
        numeric(geometry.art.width, 384 - 40);
        numeric(geometry.art.height, 344);
        numeric(geometry.art.top, 42.5 + 12 + 56 + 16);
        numeric(geometry.identity.top, parseFloat(geometry.art.top) + 344 + 28);
        assert.equal(geometry.identity.textAlign, 'left');
        numeric(geometry.progress.top, parseFloat(geometry.identity.top) + parseFloat(geometry.identity.height) + 12);
        numeric(geometry.info.top, parseFloat(geometry.progress.top) + 48 - 6);
        numeric(geometry.controls.top, parseFloat(geometry.progress.top) + 48 + parseFloat(geometry.info.lineHeight) + 10);
        numeric(geometry.dock.height, 48 + 12 * 2);
        numeric(geometry.dock.top, 837 - 18 - 12 - 8 - 2 - 72);
        assert.ok(parseFloat(geometry.controls.top) + 42 < parseFloat(geometry.dock.top));
        assert.ok(Math.abs(geometry.deviceWidth - regularWidth) < 1, 'the denser reference viewport keeps the displayed phone width stable');
        assert.equal(geometry.otherSafeTop, '42.5px');
        numeric(geometry.lyricsTop, 54.5);
        let lastBottom = 0;
        for (const box of geometry.lyrics) {
          const top = parseFloat(box.top), bottom = top + parseFloat(box.height);
          assert.ok(top >= lastBottom, 'the lyric body, language chip, progress, controls and toolbar do not overlap');
          assert.ok(bottom <= 837 - 18, 'lyrics controls stay inside the bottom safe area');
          lastBottom = bottom;
        }
        assert.ok(geometry.source.endsWith('/startrail.jpg'));
        if (style === 'clean') {
          numeric(geometry.title.fontSize, 26);
          numeric(geometry.title.lineHeight, 32);
          assert.equal(geometry.title.fontWeight, '700');
          numeric(geometry.artist.fontSize, 16.5);
          numeric(geometry.artist.lineHeight, 22);
          assert.equal(geometry.artist.fontWeight, '400');
          numeric(geometry.time.fontSize, 12.5);
          numeric(geometry.time.lineHeight, 17);
          numeric(geometry.info.lineHeight, 14);
          const reference = (value, pixels, tolerance = 3) => assert.ok(Math.abs(parseFloat(value) * 940 / 384 - pixels) <= tolerance, `${value} dp matches ${pixels}px in the device reference`);
          reference(geometry.art.left, 49);
          reference(geometry.art.top, 310);
          reference(geometry.art.width, 841);
          reference(parseFloat(geometry.progress.top) + 24, 1442);
          reference(parseFloat(geometry.controls.top) + 21, 1612);
          reference(geometry.playButton.width, 104);
          reference(geometry.dock.left, 88);
          reference(geometry.dock.top, 1775);
          reference(geometry.dock.height, 175);
        }
        if (process.env.IMMERSIVE_ARTIFACTS) {
          mkdirSync(process.env.IMMERSIVE_ARTIFACTS, { recursive: true });
          await page.locator('#devicePlay').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => {
            for (let node = document.querySelector('#devicePlay'); node; node = node.parentElement) if (parseFloat(getComputedStyle(node).opacity) < .99) return false;
            return true;
          });
          await page.locator('#devicePlay').screenshot({ path: `${process.env.IMMERSIVE_ARTIFACTS}/${language}-${style}-${width}-cover.png` });
        }
      }
      await page.evaluate(() => NP.previewSettings.set('nowplaying_immersive_mode', false));
      assert.equal(await page.locator('#phPlay .pc-art').evaluate(node => getComputedStyle(node).top), '100px');
      assert.equal(await page.locator('#phPlay .pc-top').evaluate(node => getComputedStyle(node).top), '36px');
      assert.equal(await page.locator('#phPlay').evaluate(node => getComputedStyle(node).width), '411px');
      assert.equal(await page.locator('#phPlay').evaluate(node => getComputedStyle(node).height), '914px');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
