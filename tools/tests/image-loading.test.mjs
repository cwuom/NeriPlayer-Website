import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';

test('waiting images do not force styles inside distant simulator screens', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.route('**/assets/img/**', async route => { await gate; await route.continue(); });
    await page.addInitScript(() => {
      window.waitingImageReads = 0;
      const original = window.getComputedStyle;
      window.getComputedStyle = function (element, ...args) {
        if (element.tagName === 'IMG' && element.closest('.device__screen,.dwin__screen,.tabdev__screen,.desk__screen')) waitingImageReads++;
        return original.call(this, element, ...args);
      };
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.baseReady);
    assert.equal(await page.evaluate(() => waitingImageReads), 0, 'image fade setup must leave distant simulator styles deferred');
  } finally { release(); await browser.close(); }
});

test('late and cloned images become visible after their shared delayed image decodes', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/__live', route => route.abort());
    await page.route('**/startrail.jpg?fade-regression', async route => { await gate; await route.continue(); });
    await page.goto(origin);
    await page.waitForFunction(() => NP.baseReady);
    assert.ok(await page.locator('main img').evaluateAll(images => images.every(image => image.loading === 'lazy')));
    await page.evaluate(() => {
      const image = document.querySelector('.pc-art img').cloneNode(true);
      image.loading = 'eager';
      image.src += '?fade-regression';
      image.dataset.fadeProbe = '';
      image.classList.add('img-wait');
      image.style.cssText = 'position:fixed;top:100px;left:10px;width:48px;height:48px;z-index:100';
      const clone = image.cloneNode(true);
      clone.style.left = '70px';
      document.querySelector('main').append(image, clone);
    });
    assert.ok(await page.locator('[data-fade-probe]').evaluateAll(images => images.every(image => getComputedStyle(image).opacity === '0')));
    release();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-fade-probe]')].every(image => image.complete && image.naturalWidth > 0));
    const visible = await page.waitForFunction(() => [...document.querySelectorAll('[data-fade-probe]')].every(image => getComputedStyle(image).opacity === '1'), null, { timeout: 2500 }).then(() => true, () => false);
    assert.equal(visible, true, 'cloning an image must not leave its loading class stuck at opacity zero');
  } finally { release(); await browser.close(); }
});
