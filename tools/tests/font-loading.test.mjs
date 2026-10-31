import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6060';
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const root = new URL('../../', import.meta.url);

async function fontNames(paths) {
  const styles = await Promise.all(paths.map(path => readFile(new URL('assets/css/' + path, root), 'utf8')));
  return styles.flatMap(css => [...css.matchAll(/url\("\.\.\/fonts\/([^"?]+\.woff2)(?:\?[^"]*)?"\)/g)].map(match => match[1].split('/').pop()));
}

async function open(path, options = {}) {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  if (options.noObserver) await page.addInitScript(() => { delete window.IntersectionObserver; });
  await page.goto(origin + path);
  await page.waitForFunction(() => window.NP?.baseReady || window.NP?.booted);
  await page.evaluate(() => document.fonts.ready);
  return { browser, page, errors };
}

async function waitForStyles(page, names) {
  await page.waitForFunction(names => names.every(name => Array.from(document.querySelectorAll('link[data-content-font]')).some(link => link.dataset.contentFont === name && link.sheet)), names);
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await document.fonts.ready;
  });
}

for (const language of ['/', '/en/']) {
  test(`offscreen fonts wait for their content while the hero keeps its typography ${language}`, async () => {
    const { browser, page, errors } = await open(language);
    try {
      const fonts = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /\.woff2(?:$|\?)/.test(entry.name)).map(entry => entry.name.split('/').pop()));
      for (const name of await fontNames(['content-fonts.css', 'phone-fonts.css', 'desktop-fonts.css'])) {
        assert.ok(!fonts.includes(name), `${name} must wait until its content is nearby`);
      }
      const heroFonts = await fontNames(['base.css']);
      const titleFont = heroFonts.find(name => /^fraunces-[a-f0-9]{12}-critical\.woff2$/.test(name));
      assert.ok(titleFont, 'the actual normal title alias must be registered');
      assert.ok(fonts.includes(titleFont), titleFont + ' must draw the title');
      const before = await page.locator('.hero h1').boundingBox();
      await page.locator('#download').scrollIntoViewIfNeeded();
      await waitForStyles(page, ['content-fonts', 'desktop-fonts']);
      await page.locator('#top').scrollIntoViewIfNeeded();
      const after = await page.locator('.hero h1').boundingBox();
      assert.ok(Math.abs(after.height - before.height) < 0.1);
      assert.ok(Math.abs(after.width - before.width) < 0.1);
      await page.locator('#devicePlay').scrollIntoViewIfNeeded();
      await waitForStyles(page, ['phone-fonts']);
      await page.waitForFunction(() => NP.booted);
      assert.ok(await page.evaluate(() => document.fonts.check('400 14px "NP Roboto"', '音效设置')));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(`direct player links load native fonts before interaction ${language}`, async () => {
    const { browser, page, errors } = await open(language + '#play');
    try {
      await waitForStyles(page, ['content-fonts', 'desktop-fonts', 'phone-fonts']);
      await page.waitForFunction(() => NP.booted);
      assert.ok(await page.evaluate(() => document.fonts.check('400 14px "NP Roboto"', '音效设置')));
      assert.ok(await page.locator('#phPlay [data-ph-more]').evaluateAll(buttons => buttons.length > 0 && buttons.every(button => button.disabled)));
      await page.locator('#phPlay .pg-cover [data-ph-toggle]').tap();
      assert.equal(await page.evaluate(() => NP.player.muted), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

test('font loading falls back to eager loading when IntersectionObserver is unavailable', async () => {
  const { browser, page, errors } = await open('/', { noObserver: true });
  try {
    await waitForStyles(page, ['content-fonts', 'desktop-fonts', 'phone-fonts']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
