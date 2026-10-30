import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const executablePath = [process.env.CHROME, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && existsSync(p));
const site = (process.env.SITE_URL || 'http://localhost:6060').replace(/\/$/, '');

async function withPage(fn, path = '/', mobile = false, reducedMotion = 'reduce') {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: mobile ? { width:390,height:844 } : { width:1440,height:1100 }, isMobile:mobile, hasTouch:mobile, reducedMotion });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(site + path, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => NP.booted && document.querySelector('#phDsp.np-glass-host'));
    await fn(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

function edgeEnergy(buffer) {
  const png = PNG.sync.read(buffer);
  let energy = 0, count = 0;
  for (let y = 3;y < png.height - 3;y++) for (let x = 3;x < png.width - 3;x++) {
    const i = (y * png.width + x) * 4;
    energy += Math.abs(png.data[i] - png.data[i + 4]);
    count++;
  }
  return energy / count;
}

test('chrome captures and blurs actual scrolling pixels behind mini player and tab bar in both themes and languages', async t => {
  for (const path of ['/', '/en/']) for (const style of ['clean', 'material']) {
    await withPage(async page => {
      await page.evaluate(style => NP.themes.select(style), style);
      await page.locator('#deviceDsp').scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const host = document.querySelector('#phDsp');
        const scroll = host.querySelector('.fxa-scroll');
        const stripe = document.createElement('div');
        stripe.className = 'glass-pixel-probe';
        stripe.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;z-index:10;background:repeating-linear-gradient(90deg,#fff 0 2px,#000 2px 4px);pointer-events:none';
        scroll.appendChild(stripe);
        host.querySelector('.hm-mini__row').style.visibility = 'hidden';
        host.querySelectorAll('.hm-nav>span,.hm-nav>.ng-pill').forEach(el => { el.style.visibility = 'hidden'; });
      });
      for (const selector of ['.hm-mini','.hm-nav']) {
        const bar = page.locator('#phDsp ' + selector);
        const box = await bar.boundingBox();
        const clip = { x:box.x + box.width * .3,y:box.y + box.height * .3,width:box.width * .4,height:box.height * .4 };
        const blurred = edgeEnergy(await page.screenshot({ clip }));
        await bar.evaluate(el => { el.style.backdropFilter = 'none';el.style.webkitBackdropFilter = 'none'; });
        const sharp = edgeEnergy(await page.screenshot({ clip }));
        assert.ok(sharp > 20, `${path} ${style} ${selector}: test pattern must actually be behind the chrome (${sharp})`);
        assert.ok(blurred < sharp * .2, `${path} ${style} ${selector}: real blur must remove high frequency detail (${blurred} vs ${sharp})`);
        t.diagnostic(`${path} ${style} ${selector}: sharp ${sharp.toFixed(1)}, blurred ${blurred.toFixed(1)}`);
      }
    }, path);
  }
});

test('preview scrolling extends behind floating chrome and reserves the final controls above it', async () => {
  await withPage(async page => {
    const metrics = await page.locator('[data-app-preview="settings"] .app-preview').evaluate(host => {
      const scroll = host.querySelector('.ap-scroll'),mini = host.querySelector('.ap-mini'),bottom = host.querySelector('.ap-bottom');
      const filter = document.getElementById(mini.dataset.glassFilter);
      return { overlap:scroll.getBoundingClientRect().bottom - mini.getBoundingClientRect().top,padding:parseFloat(getComputedStyle(scroll).paddingBottom),position:getComputedStyle(bottom).position,footer:getComputedStyle(bottom).backgroundImage,blur:filter.querySelector('feGaussianBlur').getAttribute('stdDeviation'),refraction:filter.querySelector('feDisplacementMap').getAttribute('scale') };
    });
    assert.ok(metrics.overlap > 80, 'the scroll surface must continue behind both floating bars');
    assert.ok(metrics.padding >= 164, 'last setting remains reachable above the chrome');
    assert.equal(metrics.position, 'absolute');
    assert.equal(metrics.footer, 'none', 'an opaque footer would prevent actual backdrop sampling');
    assert.equal(metrics.blur, '36');
    assert.equal(metrics.refraction, '11.76');
    assert.equal(await page.locator('#phDsp .fxa-scroll').evaluate(el => getComputedStyle(el).bottom), '24px');
  }, '/', true);
});

test('glass settings change actual blur, tint policy and live radius on every app preview', async () => {
  await withPage(async page => {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('np-preview-setting', { detail:{ key:'enhanced_advanced_blur_radius_dp',value:60 } })));
    await page.waitForFunction(() => document.querySelector('#' + document.querySelector('#phDsp .hm-mini').dataset.glassFilter + ' feGaussianBlur').getAttribute('stdDeviation') === '60');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('np-preview-setting', { detail:{ key:'advanced_blur_enabled',value:false } })));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#phDsp .hm-mini')).backdropFilter === 'none');
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('np-preview-setting', { detail:{ key:'advanced_blur_enabled',value:true } }));
      document.dispatchEvent(new CustomEvent('np-preview-setting', { detail:{ key:'liquid_glass_enabled',value:false } }));
    });
    await page.waitForFunction(() => document.querySelector('#phDsp').dataset.glassLiquid === 'off');
    assert.match(await page.locator('#phDsp .hm-nav').evaluate(el => getComputedStyle(el).backdropFilter), /saturate\(1\)/);
  });
});

test('Clean tab pill moves with the native spring and responds to press-and-slide', async () => {
  await withPage(async page => {
    await enablePreviewInteractions(page, ['settings']);
    const preview = page.locator('[data-app-preview="settings"]');
    await preview.scrollIntoViewIfNeeded();
    const before = await preview.locator('.ng-pill').boundingBox();
    assert.equal(await preview.locator('[data-glass-rounded="settings"]').count(),1);
    await preview.locator('[data-ap-nav="library"]').click();
    await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] [data-ap-nav="library"]').getAttribute('aria-current') === 'page');
    await page.waitForTimeout(550);
    assert.equal(await preview.locator('[data-glass-rounded="library"]').count(),1);
    assert.ok(Math.abs((await preview.locator('.ng-pill').boundingBox()).x - before.x) > 40,'the painted pill must move to the newly selected tab');
    const nav = preview.locator('.ap-nav'),box = await nav.boundingBox();
    await page.mouse.move(box.x + box.width * .63,box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .16,box.y + box.height / 2,{ steps:8 });
    assert.equal(await preview.locator('.ng-pill.is-pressed').count(), 1);
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] [data-ap-nav="home"]').getAttribute('aria-current') === 'page');
    assert.equal(await preview.locator('.ng-pill.is-pressed').count(), 0);
    assert.equal(await preview.locator('[data-glass-rounded="home"]').count(),1);
    await page.evaluate(() => NP.themes.select('material'));
    await page.waitForFunction(() => !document.querySelector('[data-app-preview="settings"] [data-glass-rounded]'));
  }, '/', false, 'no-preference');
});

test('touch cancellation releases the interactive preview lens without changing tabs', async () => {
  await withPage(async page => {
    await enablePreviewInteractions(page, ['settings']);
    const host = page.locator('[data-app-preview="settings"]');
    await host.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const box = await host.locator('[data-ap-nav="library"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{ type:'touchStart',touchPoints:[{ x:box.x + box.width / 2,y:box.y + box.height / 2,id:1 }] });
    await page.waitForTimeout(180);
    assert.equal(await host.locator('.ng-pill.is-pressed').count(),1);
    await cdp.send('Input.dispatchTouchEvent',{ type:'touchCancel',touchPoints:[] });
    await page.waitForTimeout(600);
    assert.equal(await host.locator('.ng-pill.is-pressed,.ng-lens-copy').count(),0);
    assert.equal(await host.locator('[data-ap-nav="settings"]').getAttribute('aria-current'),'page');
    await cdp.detach();
  }, '/en/', true, 'no-preference');
});

test('touch tab commits preserve preview scale and cannot click through into the player', async () => {
  await withPage(async page => {
    await enablePreviewInteractions(page, ['settings']);
    const host = page.locator('[data-app-preview="settings"]');
    await host.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const original = await host.locator('.app-preview').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    async function tap(destination) {
      const target = host.locator('[data-ap-nav="' + destination + '"]');
      await target.click({ trial:true });
      const box = await target.boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{ type:'touchStart',touchPoints:[{ x:box.x + box.width / 2,y:box.y + box.height / 2,id:1 }] });
      await page.waitForFunction(() => !!document.querySelector('[data-app-preview="settings"] .ng-pill.is-pressed'));
      await page.waitForTimeout(200);
      await cdp.send('Input.dispatchTouchEvent',{ type:'touchEnd',touchPoints:[] });
      await page.waitForFunction(destination => document.querySelector('[data-app-preview="settings"] [data-ap-nav="' + destination + '"]')?.getAttribute('aria-current') === 'page',destination);
      await page.waitForTimeout(650);
    }
    await tap('explore');
    assert.equal(await host.locator('.ap-native-device:not([hidden])').count(),0,'a compatibility click must not activate a newly inserted control');
    const changed = await host.locator('.app-preview').boundingBox();
    assert.ok(Math.abs(changed.width - original.width) < 1 && Math.abs(changed.height - original.height) < 1,'tab commits must preserve phone scale');
    await tap('library');
    assert.equal(await host.locator('[data-ap-nav="library"]').getAttribute('aria-current'),'page');
    assert.equal(await host.locator('.ap-native-device:not([hidden]),.ng-lens-copy,.ng-pill.is-pressed').count(),0);
    await cdp.detach();
  }, '/en/', true, 'no-preference');
});

test('Material follows the source default new-tab labels and restores the optional indicator style', async () => {
  await withPage(async page => {
    await page.evaluate(() => NP.themes.select('material'));
    await page.waitForFunction(() => document.querySelector('[data-app-preview="settings"] .app-preview').dataset.glassNewTabs === 'on');
    const nav = page.locator('[data-app-preview="settings"] .ap-nav');
    assert.equal(await nav.locator('.ap-nav-item>small:visible').count(),1);
    assert.equal(await nav.locator('.ap-nav-item[aria-label]').count(),4,'hidden labels must retain accessible names');
    assert.equal(await nav.locator('[aria-current="page"]>span').evaluate(el => getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('#phDsp .hm-nav .ng-label:visible').count(),1);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('np-preview-setting',{detail:{key:'always_use_new_tab_style',value:false}})));
    await page.waitForFunction(() => document.querySelector('#phDsp').dataset.glassNewTabs === 'off');
    assert.equal(await nav.locator('.ap-nav-item>small:visible').count(),4);
    assert.notEqual(await nav.locator('[aria-current="page"]>span').evaluate(el => getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  });
});

test('liquid glass belongs only to Clean, including the independently themed Home example', async () => {
  await withPage(async page => {
    async function assertPolicy(selector, liquid) {
      const actual = await page.locator(selector).evaluate(host => ({
        liquid: host.dataset.glassLiquid,
        filters: Array.from(host.querySelectorAll('.hm-mini,.hm-nav,.ap-mini,.ap-nav')).map(bar => {
          const paint = getComputedStyle(bar, '::before');
          return paint.content !== 'none' && paint.backdropFilter !== 'none' ? paint.backdropFilter : getComputedStyle(bar).backdropFilter;
        })
      }));
      assert.equal(actual.liquid, liquid ? 'on' : 'off', selector);
      actual.filters.forEach(filter => {
        if (liquid) assert.match(filter, /url\(/, selector + ' must retain the native Clean lens');
        else {
          assert.doesNotMatch(filter, /url\(/, selector + ' must not refract a Material surface');
          assert.match(filter, /blur\(/, selector + ' must retain ordinary backdrop blur');
        }
      });
    }
    await page.evaluate(() => NP.themes.select('clean'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertPolicy('[data-app-preview="settings"] .app-preview', true);
    await assertPolicy('#phDsp', true);
    await assertPolicy('#phHome', false);
    await page.locator('#lab [data-app-style="clean"]').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertPolicy('#phHome', true);
    await page.evaluate(() => NP.themes.select('material'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertPolicy('[data-app-preview="settings"] .app-preview', false);
    await assertPolicy('#phDsp', false);
    await assertPolicy('#phHome', true);
    await page.locator('#lab [data-app-style="material"]').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertPolicy('#phHome', false);
  });
});

test('cloned native chrome retains keyboard navigation and mini player activation', async () => {
  await withPage(async page => {
    await enablePreviewInteractions(page, ['settings']);
    const host = page.locator('[data-app-preview="settings"]');
    await host.locator('[data-ap-setting="audio"]').click();
    const dsp = host.locator('.ap-native-device[data-kind="dsp"]');
    assert.equal(await dsp.locator('.hm-nav>.ng-pill').count(),1,'cloning an initialized bar must not duplicate its pill');
    await dsp.locator('.hm-mini').focus();
    await page.keyboard.press('Enter');
    const player = host.locator('.ap-native-device[data-kind="player"]');
    assert.equal(await player.isVisible(),true);
    await player.locator('.pg-cover [data-ph-collapse]').click();
    assert.equal(await dsp.locator('.hm-mini').evaluate(el => el === document.activeElement),true);
    await dsp.locator('.hm-nav>span').nth(2).focus();
    await page.keyboard.press('Enter');
    assert.equal(await dsp.isVisible(),false);
    assert.equal(await host.locator('[data-ap-nav="library"]').getAttribute('aria-current'),'page');
  });
});

test('interactive lens magnifies from its actual glyph coordinates and releases after committing tabs', async () => {
  await withPage(async page => {
    await enablePreviewInteractions(page, ['settings']);
    const host = page.locator('[data-app-preview="settings"]');
    await host.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const box = await host.locator('[data-ap-nav="explore"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2,box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    const errors = await host.locator('.ap-nav').evaluate(nav => {
      const pill = nav.querySelector('.ng-pill').getBoundingClientRect(),center = { x:pill.x + pill.width / 2,y:pill.y + pill.height / 2 };
      const source = Array.from(nav.querySelectorAll('.ap-nav-item')).map(el => el.querySelector('svg').getBoundingClientRect());
      return Array.from(nav.querySelectorAll('.ng-lens-copy svg')).map((svg,i) => {
        const actual = svg.getBoundingClientRect(),original = source[i];
        return Math.hypot(actual.x + actual.width / 2 - center.x - (original.x + original.width / 2 - center.x) * 1.2,actual.y + actual.height / 2 - center.y - (original.y + original.height / 2 - center.y) * 1.2);
      });
    });
    assert.equal(errors.length,4);
    assert.ok(errors.every(error => error < 1.5),'magnified glyphs must preserve their actual source coordinates: ' + errors);
    await page.mouse.up();
    await host.locator('[data-ap-nav="explore"][aria-current="page"]').waitFor({ timeout:5000 });
    await page.waitForTimeout(700);
    assert.equal(await host.locator('.ng-pill.is-pressed').count(),0);
    await host.locator('[data-ap-nav="library"]').click();
    await page.waitForTimeout(700);
    assert.equal(await host.locator('[data-ap-nav="library"]').getAttribute('aria-current'),'page');
    assert.equal(await host.locator('.ng-pill.is-pressed,.ng-lens-copy').count(),0);
  }, '/', false, 'no-preference');
});
