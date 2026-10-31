import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';
import { buildCriticalCss } from '../build-critical-css.mjs';
import { buildStyleBundle } from '../build-style-bundle.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
const root = new URL('../../', import.meta.url);
let browser;
after(async () => { await browser?.close(); });

async function open(path = '/', options = {}) {
  browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference', javaScriptEnabled: !options.noJS });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
  const language = path.startsWith('/en/') ? 'en/' : '';
  const html = await readFile(new URL(language + 'index.html', root), 'utf8');
  const critical = (await buildCriticalCss()).replaceAll('../fonts/', language ? '../assets/fonts/' : 'assets/fonts/');
  await page.route(url => url.pathname === '/' + language, route => route.fulfill({ contentType: 'text/html', body: html.replace(/<style id="critical-css">[\s\S]*?<\/style>/, '<style id="critical-css">' + critical + '</style>') }));
  const css = await buildStyleBundle();
  await page.route(url => url.pathname.endsWith('/assets/css/site.css'), route => route.fulfill({ contentType: 'text/css', body: css }));
  if (options.noIO) await page.addInitScript(() => { delete window.IntersectionObserver; });
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
  if (!options.noJS) await page.waitForFunction(() => NP.contentReady);
  return { page, errors };
}

async function heroFonts(page, cdp) {
  await page.evaluate(() => document.fonts.ready);
  const { root: documentNode } = await cdp.send('DOM.getDocument');
  const result = [];
  for (const selector of ['.hero h1', '.hero .lead', '.hero__note']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    result.push({ selector, fonts: fonts.map(font => ({ fontId: font.fontId, familyName: font.familyName, glyphCount: font.glyphCount })) });
  }
  return result;
}

for (const path of ['/', '/en/']) test('full content fonts never replace the first-screen faces or geometry ' + path, async () => {
  const { page, errors } = await open(path);
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    assert.match(await page.locator('.hero .lead').evaluate(el => getComputedStyle(el).fontFamily), /MiSans Critical/);
    assert.match(await page.locator('.hero h1').evaluate(el => getComputedStyle(el).fontFamily), /NP Serif Critical/);
    assert.match(await page.locator('.hero__note').evaluate(el => getComputedStyle(el).fontFamily), /NP Hand Critical/);
    assert.match(await page.locator('.hero h1').evaluate(el => getComputedStyle(el).fontFamily), /^"?Fraunces Critical/);
    assert.match(await page.locator('.hero__note').evaluate(el => getComputedStyle(el).fontFamily), /^"?Caveat Critical/);
    const before = await heroFonts(page, cdp);
    const box = await page.locator('.hero .lead').boundingBox();
    await page.evaluate(() => NP.preparePreviews());
    await page.locator('#download').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#download').hasAttribute('data-fonts-ready'));
    assert.doesNotMatch(await page.locator('#download .lead').evaluate(el => getComputedStyle(el).fontFamily), /Critical/);
    await page.locator('#top').scrollIntoViewIfNeeded();
    assert.deepEqual(await heroFonts(page, cdp), before, 'the actual platform font ids and glyph runs must remain stable when complete faces are registered');
    const after = await page.locator('.hero .lead').boundingBox();
    for (const key of ['width', 'height']) assert.ok(Math.abs(after[key] - box[key]) < .1, key + ' must stay unchanged');
    for (const weight of [500, 600, 700]) {
      const faces = await page.evaluate(weight => document.fonts.load(weight + ' 16px "MiSans Critical"', '播放器').then(faces => faces.map(face => ({ family: face.family, weight: face.weight }))), weight);
      assert.ok(faces.some(face => face.family.replace(/^"|"$/g, '') === 'MiSans Critical' && face.weight === String(weight)), 'the requested real source weight must exist instead of synthesizing weight ' + weight);
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('dynamic desktop CTA and keyboard skip text retain their real MiSans glyphs', async () => {
  const { page } = await open();
  try {
    const text = '手机上用手机与平板跳到正文安装程序预览版';
    await page.evaluate(async text => {
      await document.fonts.load('400 16px "MiSans Critical"', text);
      const probe = document.createElement('span');
      probe.id = 'fontScopeDynamicProbe';
      probe.style.cssText = 'font-family:"MiSans Critical";font-weight:400;position:fixed;opacity:0';
      probe.textContent = text;
      document.body.appendChild(probe);
    }, text);
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root: documentNode } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector: '#fontScopeDynamicProbe' });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    assert.ok(fonts.length > 0);
    assert.ok(fonts.every(font => font.isCustomFont), 'CTA and keyboard glyphs must not fall back to a system face after their critical family is isolated');
    assert.equal(fonts.reduce((count, font) => count + font.glyphCount, 0), text.length);
  } finally { await page.close(); }
});

test('deep links and the footer prepare their own full font stacks', async () => {
  const { page, errors } = await open('/#persona');
  try {
    await page.waitForFunction(() => document.querySelector('#persona').hasAttribute('data-fonts-ready'));
    await page.waitForFunction(() => Math.abs(document.querySelector('#persona').getBoundingClientRect().top - document.querySelector('#nav').offsetHeight - 10) < 2);
    assert.doesNotMatch(await page.locator('#persona .lead').evaluate(el => getComputedStyle(el).fontFamily), /Critical/);
    await page.touchscreen.tap(12, 300);
    await page.locator('.footer').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.footer').hasAttribute('data-fonts-ready'));
    assert.doesNotMatch(await page.locator('.footer__motto').evaluate(el => getComputedStyle(el).fontFamily), /Critical/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('missing IntersectionObserver eagerly prepares every content section', async () => {
  const { page, errors } = await open('/', { noIO: true });
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('.station,.footer')].every(section => section.hasAttribute('data-fonts-ready')));
    assert.doesNotMatch(await page.locator('.footer__motto').evaluate(el => getComputedStyle(el).fontFamily), /Critical/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the no-script page retains its original complete font stacks', async () => {
  const { page } = await open('/', { noJS: true });
  try {
    await page.evaluate(() => document.fonts.ready);
    assert.doesNotMatch(await page.locator('#download .lead').evaluate(el => getComputedStyle(el).fontFamily), /Critical/);
    assert.doesNotMatch(await page.locator('.footer__motto').evaluate(el => getComputedStyle(el).fontFamily), /Critical/);
    assert.ok(await page.locator('#download .lead').isVisible());
  } finally { await page.close(); }
});

test('real MiSans source weights preserve shaping and kerning for every critical glyph pair', async () => {
  const { page } = await open();
  try {
    await page.evaluate(() => NP.preparePreviews());
    const shell = await page.locator('.hero,.nav,.menu,.route,.skip').allTextContents();
    const github = await readFile(new URL('assets/js/github.js', root), 'utf8');
    const cta = /var CTA = \{[\s\S]*?(?=\n  NP\.github =)/.exec(github)?.[0];
    assert.ok(cta, 'dynamic first-screen labels must be included in the shaping checks');
    const labels = [...cta.matchAll(/'([^'\n]*)'/g)].map(match => match[1]);
    const points = new Set((shell.join('') + labels.join('')).match(/[\u2e80-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/gu));
    const result = await page.evaluate(async characters => {
      const canvas = document.createElement('canvas').getContext('2d');
      let comparisons = 0;
      const differences = [];
      for (const weight of [500, 600, 700]) {
        await Promise.all(['MiSans', 'MiSans Critical'].map(family => document.fonts.load(weight + ' 32px "' + family + '"', characters.join(''))));
        for (const first of characters) for (const second of characters) {
          canvas.font = weight + ' 32px "MiSans"';
          const source = canvas.measureText(first + second);
          canvas.font = weight + ' 32px "MiSans Critical"';
          const subset = canvas.measureText(first + second);
          for (const property of ['width', 'actualBoundingBoxLeft', 'actualBoundingBoxRight', 'actualBoundingBoxAscent', 'actualBoundingBoxDescent']) {
            if (Math.abs(source[property] - subset[property]) > .001) differences.push({ weight, text: first + second, property, source: source[property], subset: subset[property] });
          }
          comparisons++;
        }
      }
      return { comparisons, differences };
    }, [...points]);
    assert.ok(result.comparisons >= 15000, 'exercise the full critical CJK pair set with each actual 500/600/700 face');
    assert.deepEqual(result.differences, [], 'subsetting must retain the real browser shaping, kerning and ink bounds');
  } finally { await page.close(); }
});
