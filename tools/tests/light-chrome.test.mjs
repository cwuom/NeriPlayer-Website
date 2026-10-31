import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const site = (process.env.SITE_URL || 'http://localhost:6060').replace(/\/$/, '');

function luminance(rgb) {
  return rgb.map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}

function contrast(foreground, background) {
  const alpha = foreground[3] / 255;
  const ink = luminance(foreground.slice(0, 3).map((value, index) => value * alpha + background[index] * (1 - alpha)));
  const surface = luminance(background);
  return (Math.max(ink, surface) + .05) / (Math.min(ink, surface) + .05);
}

async function readChrome(page) {
  return page.locator('#phHome').evaluate(host => {
    const context = document.createElement('canvas').getContext('2d');
    const color = value => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const mini = host.querySelector('.hm-mini'), nav = host.querySelector('.hm-nav');
    const title = host.querySelector('.hm-mini__id b'), label = nav.querySelector('.is-on .ng-label');
    return {
      title: { rect: title.getBoundingClientRect().toJSON(), color: color(getComputedStyle(title).color) },
      label: { rect: label.getBoundingClientRect().toJSON(), color: color(getComputedStyle(label).color) },
      tint: color(getComputedStyle(mini, host.dataset.appStyle === 'material' ? '::before' : null).backgroundColor),
      mini: mini.getBoundingClientRect().toJSON(), nav: nav.getBoundingClientRect().toJSON(),
      scale: mini.getBoundingClientRect().width / mini.offsetWidth,
      blur: getComputedStyle(host.dataset.appStyle === 'material' ? mini : nav, host.dataset.appStyle === 'material' ? '::before' : null).backdropFilter,
      labels: [...nav.querySelectorAll('.ng-label')].filter(el => getComputedStyle(el).display !== 'none').map(el => ({ rect: el.getBoundingClientRect().toJSON(), text: el.textContent })),
    };
  });
}

function backgroundAt(png, text, dpr) {
  const x = Math.round((text.rect.left + Math.min(8, text.rect.width / 3)) * dpr);
  const y = Math.round((text.rect.top + text.rect.height / 2) * dpr);
  const offset = (y * png.width + x) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}

for (const path of ['/', '/en/']) {
  test(`home chrome pairs readable light and dark colors without losing glass or DPI layout ${path}`, async t => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
    try {
      for (const [width, dpr] of [[390, 1], [1440, 2]]) {
        const page = await browser.newPage({ viewport: { width, height: 1100 }, deviceScaleFactor: dpr, isMobile: width === 390, hasTouch: width === 390 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/__live', route => route.abort());
        await page.goto(site + path, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return window.NP?.booted; });
        for (const style of ['material', 'clean']) for (const mode of ['light', 'dark']) {
          await page.locator(`#lab [data-app-style="${style}"]`).click();
          await page.locator(`#lab [data-mode="${mode}"]`).click();
          await page.locator('#deviceHome').scrollIntoViewIfNeeded();
          await page.waitForTimeout(550);
          for (const density of [1, .6, 1.2]) {
            await page.locator('#labScale').evaluate((range, value) => { range.value = value * 100; range.dispatchEvent(new Event('input', { bubbles: true })); }, density);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const chrome = await readChrome(page);
            const gap = (chrome.nav.top - chrome.mini.bottom) / chrome.scale;
            assert.ok(Math.abs(gap - (style === 'clean' ? 6 : 0)) < .1, `${style} ${mode} DPI ${density}: native chrome spacing`);
            for (const label of chrome.labels) {
              assert.ok(label.text.trim());
              assert.ok(label.rect.top >= chrome.nav.top && label.rect.bottom <= chrome.nav.bottom, `${style} ${mode} DPI ${density}: label stays inside the bar`);
              assert.ok(label.rect.height > 0 && label.rect.width > 0);
            }
            assert.notEqual(chrome.blur, 'none', 'theme changes keep the actual backdrop filter');
            if (density !== 1) continue;
            const name = `${path === '/' ? 'zh' : 'en'}-${style}-${mode}-${width}-dpr${dpr}`;
            const screenshot = await page.locator('#deviceHome').screenshot();
            if (process.env.LIGHT_CHROME_ARTIFACTS) {
              mkdirSync(process.env.LIGHT_CHROME_ARTIFACTS, { recursive: true });
              writeFileSync(join(process.env.LIGHT_CHROME_ARTIFACTS, name + '.png'), screenshot);
            }
            await page.locator('#phHome .hm-mini__row,#phHome .hm-nav>span,#phHome .hm-nav>.ng-pill').evaluateAll(elements => elements.forEach(el => { el.style.visibility = 'hidden'; }));
            const pixels = PNG.sync.read(await page.screenshot());
            await page.locator('#phHome .hm-mini__row,#phHome .hm-nav>span,#phHome .hm-nav>.ng-pill').evaluateAll(elements => elements.forEach(el => { el.style.visibility = ''; }));
            const titleContrast = contrast(chrome.title.color, backgroundAt(pixels, chrome.title, dpr));
            const labelContrast = contrast(chrome.label.color, backgroundAt(pixels, chrome.label, dpr));
            const labelFloor = style === 'clean' ? 3 : 4.5;
            assert.ok(labelContrast >= labelFloor, `${name}: selected tab label must remain readable over the sampled content (${labelContrast})`);
            if (style === 'material' && mode === 'light') {
              assert.ok(luminance(chrome.tint.slice(0, 3)) > .5, `${name}: the sampled chrome must use a light secondary container`);
              assert.ok(titleContrast >= 4, `${name}: title contrast over the real radar artwork must not regress to the dark tint (${titleContrast})`);
            }
            t.diagnostic(`${name}: title ${titleContrast.toFixed(2)}, tab label ${labelContrast.toFixed(2)}`);
          }
        }
        await page.locator('#lab [data-app-style="material"]').click();
        const seeds = page.locator('#lab [data-seed]');
        for (const mode of ['light', 'dark']) {
          await page.locator(`#lab [data-mode="${mode}"]`).click();
          const tints = [];
          for (let index = 0; index < await seeds.count(); index++) {
            await seeds.nth(index).click();
            const chrome = await readChrome(page);
            const lightness = luminance(chrome.tint.slice(0, 3));
            assert.ok(mode === 'light' ? lightness > .5 : lightness < .2, `${mode}: every seed uses the matching theme container`);
            tints.push(chrome.tint.slice(0, 3).join(','));
          }
          assert.equal(new Set(tints).size, await seeds.count(), 'changing the dynamic seed must repaint the mini player tint');
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally { await browser.close(); }
  });
}
