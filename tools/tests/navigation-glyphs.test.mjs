import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

async function paintedGlyphs(nav) {
  await nav.scrollIntoViewIfNeeded();
  const geometry = await nav.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    function rgba(color) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    }
    return {
      width: bounds.width,
      height: bounds.height,
      icons: Array.from(node.querySelectorAll(':scope > [data-ap-nav]')).map(item => {
        const svg = item.querySelector('svg'), paint = svg.querySelector('path,use');
        const box = svg.getBoundingClientRect();
        return { route: item.dataset.apNav, color: rgba(getComputedStyle(svg).color), fill: rgba(getComputedStyle(paint).fill), x: box.x - bounds.x, y: box.y - bounds.y, width: box.width, height: box.height };
      })
    };
  });
  const visible = PNG.sync.read(await nav.screenshot());
  const originalVisibility = await nav.evaluate(node => Array.from(node.querySelectorAll(':scope > [data-ap-nav] svg')).map(svg => {
    const original = svg.style.visibility;
    svg.style.visibility = 'hidden';
    return original;
  }));
  let background;
  try { background = PNG.sync.read(await nav.screenshot()); }
  finally {
    await nav.evaluate((node, values) => Array.from(node.querySelectorAll(':scope > [data-ap-nav] svg')).forEach((svg, index) => {
      if (values[index]) svg.style.visibility = values[index];
      else svg.style.removeProperty('visibility');
    }), originalVisibility);
  }
  const scaleX = visible.width / geometry.width, scaleY = visible.height / geometry.height;
  return geometry.icons.map(icon => {
    let ink = 0;
    for (let y = Math.max(0, Math.ceil(icon.y * scaleY)); y < Math.min(visible.height, Math.floor((icon.y + icon.height) * scaleY)); y++) {
      for (let x = Math.max(0, Math.ceil(icon.x * scaleX)); x < Math.min(visible.width, Math.floor((icon.x + icon.width) * scaleX)); x++) {
        const index = (y * visible.width + x) * 4, alpha = icon.color[3] / 255;
        const painted = [0, 1, 2].every(channel => Math.abs(visible.data[index + channel] - (icon.color[channel] * alpha + background.data[index + channel] * (1 - alpha))) < 8);
        const changed = [0, 1, 2].some(channel => Math.abs(visible.data[index + channel] - background.data[index + channel]) > 10);
        if (painted && changed) ink++;
      }
    }
    return { ...icon, ink, minimumInk: icon.width * scaleX * icon.height * scaleY * .03 };
  });
}

for (const language of ['/', '/en/']) {
  test(`gallery navigation uses Android outlined icons and Clean active glyphs ${language}`, async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/__live', route => route.abort());
      await page.goto((process.env.SITE_URL || 'http://localhost:6060') + language, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
      for (const style of ['clean', 'material', 'clean']) {
        await page.locator(`#themes button[data-app-style="${style}"]`).click();
        for (const route of ['settings', 'library']) {
          const icons = await page.locator(`#themes [data-app-preview="${route}"] .ap-nav`).evaluate(nav => Array.from(nav.querySelectorAll(':scope > [data-ap-nav]')).map(item => {
            const svg = item.querySelector('svg');
            const use = svg.querySelector('use');
            const reference = use && document.querySelector(use.getAttribute('href'));
            const bounds = svg.getBBox();
            return {
              route: item.dataset.apNav,
              active: item.getAttribute('aria-current') === 'page',
              rounded: svg.querySelector('[data-glass-rounded]')?.getAttribute('data-glass-rounded') || null,
              reference: use?.getAttribute('href') || null,
              source: reference?.querySelector('path')?.getAttribute('d') || null,
              width: bounds.width,
              height: bounds.height
            };
          }));
          assert.equal(icons.length, 4);
          for (const glyph of icons) {
            assert.ok(glyph.width > 16 && glyph.width <= 21, `${glyph.route} resolves to a visible 24dp Android vector`);
            assert.ok(glyph.height > 16 && glyph.height <= 21);
            if (style === 'clean' && glyph.active) {
              assert.equal(glyph.rounded, route);
              assert.equal(glyph.reference, null);
            } else {
              const name = glyph.route === 'explore' ? 'search' : glyph.route;
              assert.equal(glyph.rounded, null);
              assert.equal(glyph.reference, `#i-${name}`);
              assert.ok(glyph.source?.length > 50);
              if (glyph.route === 'home') assert.ok(glyph.source.startsWith('M12 5.69'), 'inactive Home keeps the native outlined roof and doorway');
              if (glyph.route === 'library') assert.ok(glyph.source.includes('7.5-1a2.5'), 'the library note uses the native 2.5dp head');
              if (glyph.route === 'settings') assert.ok(glyph.source.includes('M17.45 11.27'), 'inactive Settings keeps the native gear outline');
            }
          }
        }
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

for (const language of ['/', '/en/']) {
  test(`visible Android tab ink follows currentColor in both themes and modes ${language}`, async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', deviceScaleFactor: 2 });
      const errors = [], failures = [], samples = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/__live', route => route.abort());
      await page.goto((process.env.SITE_URL || 'http://localhost:6060') + language, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
      await page.evaluate(() => document.fonts.ready);
      for (const style of ['clean', 'material']) for (const mode of ['dark', 'light']) {
        await page.evaluate(({ style, mode, missingFill }) => {
          NP.themes.select(style);
          document.querySelectorAll('#themes .app-preview').forEach(host => { host.dataset.mode = mode; });
          NP.appGlass.refresh(document);
          if (missingFill) document.querySelectorAll('#themes .ap-nav-item svg').forEach(svg => svg.removeAttribute('fill'));
        }, { style, mode, missingFill: process.env.GLYPH_REPRO_MISSING_FILL === '1' });
        for (const host of ['settings', 'library']) {
          const nav = page.locator(`#themes [data-app-preview="${host}"] .ap-nav`);
          const glyphs = await paintedGlyphs(nav);
          assert.equal(glyphs.length, 4);
          for (const glyph of glyphs) {
            const sample = { language, style, mode, host, ...glyph };
            samples.push(sample);
            if (glyph.ink < glyph.minimumInk || glyph.fill.some((value, index) => value !== glyph.color[index])) failures.push(sample);
          }
          if (process.env.GLYPH_COLOR_ARTIFACTS) {
            mkdirSync(process.env.GLYPH_COLOR_ARTIFACTS, { recursive: true });
            await nav.screenshot({ path: `${process.env.GLYPH_COLOR_ARTIFACTS}/${language === '/' ? 'zh' : 'en'}-${style}-${mode}-${host}.png` });
          }
        }
      }
      if (process.env.GLYPH_COLOR_ARTIFACTS) writeFileSync(`${process.env.GLYPH_COLOR_ARTIFACTS}/${language === '/' ? 'zh' : 'en'}-ink.json`, JSON.stringify(samples, null, 2));
      assert.deepEqual(failures, [], 'every outlined and selected icon must actually paint its native currentColor');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
