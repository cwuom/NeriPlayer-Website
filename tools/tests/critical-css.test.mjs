import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test, { after, before } from 'node:test';

const tool = new URL('../build-critical-css.mjs', import.meta.url);
const root = new URL('../../', import.meta.url);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
});
after(async () => { await browser?.close(); });

async function generate(sources) {
  assert.ok(existsSync(tool), 'the repeatable critical stylesheet generator must exist');
  const generator = await import(tool.href);
  return sources ? generator.extractCriticalCss(sources) : generator.buildCriticalCss();
}

async function fullStyles() {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const paths = [...new Set([...html.matchAll(/href=["'](assets\/css\/[^"?#]+\.css)(?:\?[^"']*)?["']/g)].map(match => match[1]))].filter(path => !path.endsWith('/critical.css'));
  return (await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')))).join('\n').replaceAll('../fonts/', '/assets/fonts/');
}

test('critical CSS safely retains nested responsive rules, quoted braces and SVG data URLs', async () => {
  const source = `/* ignored { */
    :root { --ink: #123; }
    .hero::after { content: "a } { ; /* quoted */"; background: url("data:image/svg+xml,<svg a='{x};'>a, b</svg>"); }
    .unrelated { color: red; }
    @media (max-width: 980px) { .hero__grid { grid-template-columns: 1fr; } .unrelated { color: blue; }
      @supports (display: grid) { .nav { display: grid; } }
    }
    .doodle { animation: twinkle 3.6s ease infinite; }
    @keyframes twinkle { from { opacity: .7; } to { opacity: 1; } }
    @keyframes unused { to { opacity: 0; } }
  `;
  const output = await generate([source]);
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(css => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      const rules = [...sheet.cssRules];
      const hero = rules.find(rule => rule.selectorText === '.hero::after');
      const media = rules.find(rule => rule.conditionText === '(max-width: 980px)');
      const support = [...media.cssRules].find(rule => rule.conditionText === '(display: grid)');
      return { text: hero.style.content, background: hero.style.backgroundImage, responsive: media.cssRules[0].style.gridTemplateColumns, supported: support.cssRules[0].style.display, animations: rules.filter(rule => rule.type === CSSRule.KEYFRAMES_RULE).map(rule => rule.name), selectors: rules.filter(rule => rule.selectorText).map(rule => rule.selectorText) };
    }, output);
    assert.equal(result.text, '"a } { ; /* quoted */"');
    assert.match(result.background, /<svg a='\{x\};'>a, b<\/svg>/);
    assert.equal(result.responsive, '1fr');
    assert.equal(result.supported, 'grid');
    assert.deepEqual(result.animations, ['twinkle']);
    assert.equal(result.selectors.includes('.unrelated'), false);
  } finally { await page.close(); }
});

test('the checked in critical stylesheet is current and removes at least eighty percent of full stylesheet bytes', async () => {
  const generated = await generate();
  assert.ok(existsSync(new URL('assets/css/critical.css', root)), 'the generated stylesheet must be checked in');
  assert.equal(await readFile(new URL('assets/css/critical.css', root), 'utf8'), generated);
  assert.ok(Buffer.byteLength(generated) < 27 * 1024, 'critical CSS and matching CJK font faces must fit below 27 KiB');
  const fullBytes = Buffer.byteLength(await fullStyles());
  assert.ok(Buffer.byteLength(generated) < fullBytes * .2, 'the critical entry replaces the full render-blocking stylesheet set');
});

test('the actual critical CSS retains every first-screen keyframe and its normal-motion animation', async () => {
  const css = await generate();
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(css => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      const rules = [...sheet.cssRules];
      document.adoptedStyleSheets = [sheet];
      document.documentElement.classList.add('js');
      document.body.innerHTML = '<span class="display__line"><span class="dl-in">NeriPlayer</span></span>';
      const reveal = getComputedStyle(document.querySelector('.dl-in'));
      return {
        frames: rules.filter(rule => rule.type === CSSRule.KEYFRAMES_RULE).map(rule => rule.name).sort(),
        floating: rules.find(rule => rule.selectorText === '.crayon__art').style.animation,
        twinkling: rules.find(rule => rule.selectorText === '.doodle').style.animation,
        scrolling: rules.find(rule => rule.selectorText === '.hero__scroll svg').style.animation,
        reveal: { property: reveal.transitionProperty, duration: reveal.transitionDuration },
        cord: rules.find(rule => rule.selectorText === '.lamp__cord').style.transition,
        glow: rules.some(rule => rule.selectorText === '.lamp-glow'),
      };
    }, css);
    assert.deepEqual(result.frames, ['cordBead', 'cordSway', 'floaty', 'nudge', 'twinkle']);
    assert.match(result.floating, /floaty 6s/);
    assert.match(result.twinkling, /twinkle 3.6s/);
    assert.match(result.scrolling, /nudge 1.8s/);
    assert.deepEqual(result.reveal, { property: 'translate', duration: '1.2s' });
    assert.match(result.cord, /height 0.7s/);
    assert.equal(result.glow, true);
  } finally { await page.close(); }
});

async function snapshot(page) {
  return page.evaluate(() => {
    const selectors = ['.nav', '.nav__inner', '.nav__brand', '.nav__logo', '.nav__name', '.nav__actions', '.nav__burger', '.nav__lang', '.lamp', '.hero', '.hero__grid', '.hero__copy', '.hero .eyebrow', '.hero .display', '.hero .lead', '.hero .small', '.hero__cta', '.hero__dl', '.hero__alt', '.signals', '.hero__fig', '.hero__note', '.crayon', '.fig__cap', '.hero__scroll', '.route'];
    return selectors.map(selector => {
      const element = document.querySelector(selector), style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display, color: style.color, background: style.backgroundColor, font: style.fontFamily, fontSize: style.fontSize, animation: style.animationName, transition: style.transitionProperty };
    });
  });
}

function baselineFont(entry) {
  const aliases = { '.nav__name': 'Fraunces Critical', '.hero .display': 'Fraunces Critical', '.hero__note': 'Caveat Critical', '.hero__scroll': 'Caveat Critical' };
  const alias = aliases[entry.selector];
  // 仅这四个固定角色的独立子集已逐字形和 shaping 验证等价，其他 family 仍逐字比较
  if (!alias) return entry.font;
  const prefix = '"' + alias + '", ';
  assert.ok(entry.font.startsWith(prefix), entry.selector + ' must use its verified first-screen alias');
  return entry.font.slice(prefix.length);
}

async function settle(page) {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    document.body.getBoundingClientRect();
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const finalColor = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;visibility:hidden;color:var(--ink);transition:none';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await page.waitForFunction(color => ['.nav__name', '.nav__brand'].every(selector => getComputedStyle(document.querySelector(selector)).color === color), finalColor);
}

for (const path of ['/', '/en/']) for (const width of [320, 390, 1440]) {
  test(`${path} ${width}px hero and navigation stay identical before delayed full CSS arrives`, async () => {
    const critical = await generate();
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const base = process.env.SITE_URL || 'http://localhost:6068';
    let baseline;
    try {
      await page.route('**/__live', route => route.abort());
      await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
      await page.route('**/*.css', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.NP?.baseReady);
      const style = await page.addStyleTag({ content: critical.replaceAll('../fonts/', '/assets/fonts/') });
      await page.evaluate(async () => {
        document.documentElement.style.setProperty('--vh', '1000px');
        document.querySelector('.hero').classList.add('is-intro');
        document.querySelectorAll('.hero [data-reveal], .hero [data-split], .hero [data-write], .hero .draw, .hero .ul').forEach(node => node.classList.add('is-in'));
        await document.fonts.ready;
      });
      await settle(page);
      if (process.env.BASELINE_URL) {
        baseline = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        await baseline.route('**/__live', route => route.abort());
        await baseline.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
        await baseline.goto(process.env.BASELINE_URL + path, { waitUntil: 'domcontentloaded' });
        await baseline.waitForFunction(() => window.NP?.booted);
        await settle(baseline);
      }
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        await settle(page);
        const before = await snapshot(page);
        if (baseline) {
          await baseline.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
          await settle(baseline);
          const original = await snapshot(baseline);
          const changes = before.flatMap((entry, index) => Object.keys(entry).flatMap(key => (key === 'font' ? baselineFont(entry) : entry[key]) === original[index][key] ? [] : [{ selector: entry.selector, property: key, critical: entry[key], baseline: original[index][key] }]));
          assert.deepEqual(changes, [], `${theme}: critical CSS must retain the unchanged baseline first screen`);
        }
        const full = await page.addStyleTag({ content: await fullStyles() });
        await settle(page);
        const after = await snapshot(page);
        const changes = before.flatMap((entry, index) => Object.keys(entry).flatMap(key => entry[key] === after[index][key] ? [] : [{ selector: entry.selector, property: key, before: entry[key], after: after[index][key] }]));
        assert.deepEqual(changes, [], `${theme}: source styles must not change the visible first screen`);
        await full.evaluate(node => node.remove());
      }
      if (width < 1000) {
        await page.locator('#burger').click();
        await page.waitForFunction(() => document.querySelector('#menu').classList.contains('is-open'));
        await settle(page);
        await page.waitForFunction(() => [...document.querySelectorAll('#menu, #menu .menu__list a')].every(node => {
          const style = getComputedStyle(node);
          return style.opacity === '1' && style.transform === 'none';
        }));
        const menuGeometry = () => page.locator('#menu, #menu .menu__inner, #menu .menu__list, #menu .menu__list a').evaluateAll(nodes => nodes.map(node => {
          const box = node.getBoundingClientRect(), style = getComputedStyle(node);
          return { x: box.x, y: box.y, width: box.width, height: box.height, color: style.color, font: style.fontFamily, opacity: style.opacity };
        }));
        const before = await menuGeometry();
        await page.addStyleTag({ content: await fullStyles() });
        await settle(page);
        assert.deepEqual(before, await menuGeometry(), 'opening the mobile contents must not wait for full stylesheet geometry');
      }
      await style.evaluate(node => node.remove());
    } finally { await page.close(); await baseline?.close(); }
  });
}

test('critical CSS keeps the same real Chinese sans face before full fonts arrive when MiSans is the first CJK fallback', async () => {
  const page = await browser.newPage();
  const base = process.env.SITE_URL || 'http://localhost:6068';
  try {
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => node.remove());
      document.body.style.setProperty('--sans', '"Geist", "MiSans Critical", system-ui, sans-serif');
    });
    await page.addStyleTag({ content: (await readFile(new URL('assets/css/critical.css', root), 'utf8')).replaceAll('../fonts/', '/assets/fonts/') });
    await settle(page);
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root: documentRoot } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: documentRoot.nodeId, selector: '.hero .lead' });
    const faces = async () => (await session.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(font => ({ family: font.familyName, custom: font.isCustomFont, glyphs: font.glyphCount })).sort((a, b) => a.family.localeCompare(b.family));
    const before = await faces();
    assert.ok(before.some(face => /MiSans/.test(face.family) && face.custom && face.glyphs > 0), 'the probe must actually render Chinese with the critical MiSans face');
    await page.addStyleTag({ content: await fullStyles() });
    await settle(page);
    assert.deepEqual(before, await faces(), 'declared font-family equality must also preserve the font actually drawing Chinese text');
  } finally { await page.close(); }
});
