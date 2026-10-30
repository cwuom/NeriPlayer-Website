import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

async function visit(run, width, deviceScaleFactor) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, deviceScaleFactor, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(process.env.SITE_URL || 'http://localhost:6060');
    await page.waitForFunction(() => NP.booted);
    await page.locator('#deviceHome').scrollIntoViewIfNeeded();
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

function seamContrast(png, geometry) {
  const x0 = Math.ceil((geometry.left + 24 * geometry.scale) * geometry.dpr);
  const x1 = Math.floor((geometry.right - 24 * geometry.scale) * geometry.dpr);
  const y0 = Math.floor(geometry.seam * geometry.dpr) - 2;
  const y1 = Math.ceil(geometry.seam * geometry.dpr) + 2;
  let maximum = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x < x1 - 2; x++) {
      const first = (y * png.width + x) * 4, next = first + 8;
      const luma = index => (png.data[index] + png.data[index + 1] + png.data[index + 2]) / 3;
      maximum = Math.max(maximum, Math.abs(luma(first) - luma(next)));
    }
  }
  return maximum;
}

for (const width of [390, 1440]) for (const dpr of [1, 2]) {
  test(`Material chrome paints through the shared edge without leaking unblurred content ${width} DPR ${dpr}`, async () => {
    await visit(async page => {
      await page.locator('#lab [data-app-style="material"]').click();
      await page.addStyleTag({ content: '#phHome .hm-scroll { background:repeating-linear-gradient(90deg,#fff 0 1px,#000 1px 2px)!important } #phHome .hm-scroll>* { visibility:hidden!important }' });
      for (const ui of [.6, 1, 1.15, 1.2]) {
        await page.locator('#labScale').evaluate((range, value) => { range.value = value * 100; range.dispatchEvent(new Event('input', { bubbles: true })); }, ui);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const geometry = await page.locator('#phHome').evaluate(ph => {
          const mini = ph.querySelector('.hm-mini').getBoundingClientRect(), nav = ph.querySelector('.hm-nav').getBoundingClientRect();
          return { left: mini.left, right: mini.right, seam: nav.top, gap: nav.top - mini.bottom, scale: mini.width / ph.querySelector('.hm-mini').offsetWidth, dpr: devicePixelRatio };
        });
        assert.ok(Math.abs(geometry.gap) < .05, 'the source Material layout remains contiguous');
        const screenshot = await page.screenshot(), contrast = seamContrast(PNG.sync.read(screenshot), geometry);
        if (process.env.SEAM_ARTIFACTS) {
          mkdirSync(process.env.SEAM_ARTIFACTS, { recursive: true });
          writeFileSync(join(process.env.SEAM_ARTIFACTS, `material-seam-${width}-${dpr}-${ui}.png`), screenshot);
        }
        assert.ok(contrast < 8, `the glass edge must blur the stripe probe at DPI ${ui}, rather than expose a high-frequency raster gap (${contrast})`);
      }
      await page.locator('#lab [data-app-style="clean"]').click();
      await page.locator('#labScale').evaluate(range => { range.value = 100; range.dispatchEvent(new Event('input', { bubbles: true })); });
      const clean = await page.locator('#phHome').evaluate(ph => {
        const mini = ph.querySelector('.hm-mini'), nav = ph.querySelector('.hm-nav'), scale = mini.getBoundingClientRect().width / mini.offsetWidth;
        return { gap: (nav.getBoundingClientRect().top - mini.getBoundingClientRect().bottom) / scale, paintLayer: getComputedStyle(mini, '::before').content };
      });
      assert.ok(Math.abs(clean.gap - 6) < .05, 'Clean retains its native 6 dp separation');
      assert.equal(clean.paintLayer, 'none');
    }, width, dpr);
  });
}
