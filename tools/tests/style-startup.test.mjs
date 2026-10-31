import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';
import { buildCriticalCss } from '../build-critical-css.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.SITE_URL || 'http://localhost:6068';
let browser;
after(async () => { await browser?.close(); });

for (const path of ['/', '/en/']) for (const width of [390, 1440]) {
  test('deferred CSS commits its initial colors while preserving real motion ' + path + ' ' + width + 'px', async () => {
    browser ||= await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'no-preference' });
    const critical = (await buildCriticalCss()).replaceAll('../fonts/', '/assets/fonts/');
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.route(url => url.pathname.endsWith('/site.css'), async route => { await pending; await route.continue().catch(() => {}); });
    // 独立生成首屏样式，不写入由发布构建统一更新的 HTML
    await page.route(url => url.pathname === path, async route => {
      const response = await route.fetch();
      const html = (await response.text()).replace(/<style id="critical-css">[\s\S]*?<\/style>/, '<style id="critical-css">' + critical + '</style>');
      await route.fulfill({ response, body: html });
    });
    await page.addInitScript(() => {
      window.initialStyleTransitions = null;
      new MutationObserver(records => {
        if (window.initialStyleTransitions || !records.some(record => record.target.matches?.('link[data-deferred-style]') && record.target.media === 'all')) return;
        window.initialStyleTransitions = document.getAnimations().filter(animation => animation instanceof CSSTransition && /color|background|border/.test(animation.transitionProperty) && animation.effect.target.closest('.station,.footer')).map(animation => ({ property: animation.transitionProperty, class: animation.effect.target.className, frames: animation.effect.getKeyframes() }));
      }).observe(document, { attributes: true, attributeFilter: ['media'], subtree: true });
    });
    try {
      await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.NP?.shellReady && document.querySelector('.hero.is-intro'));
      await page.waitForTimeout(280);
      const hero = await page.locator('.hero').evaluate(el => {
        const span = el.querySelector('.dl-in');
        const entrance = span.getAnimations().find(animation => animation.transitionProperty === 'translate');
        return { floating: getComputedStyle(el.querySelector('.crayon__art')).animationName, entrance: entrance?.effect.getTiming(), progress: entrance?.effect.getComputedTiming().progress, translate: getComputedStyle(span).translate, lamp: getComputedStyle(document.querySelector('.lamp svg')).transition };
      });
      assert.equal(hero.floating, 'floaty');
      assert.equal(hero.entrance?.duration, 1200);
      assert.equal(hero.entrance?.easing, 'cubic-bezier(0.16, 1, 0.3, 1)');
      assert.ok(hero.progress > 0 && hero.progress < 1, JSON.stringify(hero));
      assert.match(hero.lamp, /rotate 0.7s/);
      release();
      await page.waitForFunction(() => initialStyleTransitions !== null);
      assert.deepEqual(await page.evaluate(() => initialStyleTransitions), [], 'applying full CSS must not animate previously unstyled, offscreen UA colors');
      await page.waitForFunction(() => NP.contentReady && document.documentElement.classList.contains('np-styles-ready'));
      assert.equal(await page.locator('.footer__cols a').first().evaluate(el => getComputedStyle(el).transitionDuration), '0.25s', 'the initial-style gate must be removed after the full stylesheet commits');

      await page.evaluate(() => NP.scrollTo(NP.absTop(document.getElementById('stack')) - innerHeight - 700, true));
      await page.waitForFunction(() => document.querySelector('#stack-title .sw > span'));
      assert.equal(await page.locator('#stack-title').evaluate(el => el.classList.contains('is-in')), false);
      await page.evaluate(() => NP.scrollTo(NP.absTop(document.getElementById('stack')) - 75, true));
      await page.waitForFunction(() => document.getElementById('stack-title').classList.contains('is-in'));
      await page.waitForTimeout(180);
      const entrance = await page.locator('#stack-title .sw > span').first().evaluate(el => {
        const animation = el.getAnimations().find(item => item.transitionProperty === 'translate');
        return { timing: animation?.effect.getTiming(), progress: animation?.effect.getComputedTiming().progress, translate: getComputedStyle(el).translate };
      });
      assert.equal(entrance.timing?.duration, 1000);
      assert.equal(entrance.timing?.delay, 100);
      assert.equal(entrance.timing?.easing, 'cubic-bezier(0.16, 1, 0.3, 1)');
      assert.ok(entrance.progress > 0 && entrance.progress < 1, JSON.stringify(entrance));
      assert.notEqual(entrance.translate, '0px');
      assert.notEqual(entrance.translate, '0px 112%');

      await page.locator('#deviceHome').scrollIntoViewIfNeeded();
      await page.evaluate(() => NP.preparePreviews());
      await page.waitForFunction(() => NP.booted);
      await page.locator('#lab [data-mode="dark"]').click();
      await page.waitForTimeout(600);
      const button = page.locator('#lab [data-mode="light"]');
      const before = await button.evaluate(el => getComputedStyle(el).color);
      await button.click();
      const active = await page.locator('#phHome').evaluate(el => el.getAnimations().filter(animation => animation instanceof CSSTransition && ['color', 'background-color'].includes(animation.transitionProperty)).map(animation => ({ property: animation.transitionProperty, duration: animation.effect.getTiming().duration })));
      assert.ok(active.some(animation => animation.property === 'background-color' && animation.duration === 500), JSON.stringify(active));
      await page.waitForTimeout(100);
      const middle = await button.evaluate(el => ({ color: getComputedStyle(el).color, durations: el.getAnimations().filter(animation => animation.transitionProperty === 'color').map(animation => animation.effect.getTiming().duration) }));
      assert.ok(middle.durations.includes(350), JSON.stringify(middle));
      await page.waitForTimeout(500);
      const final = await button.evaluate(el => getComputedStyle(el).color);
      assert.notEqual(middle.color, before);
      assert.notEqual(middle.color, final, 'a real interaction must retain its intermediate color frame');
      assert.deepEqual(errors, []);
    } finally { release(); await page.close(); }
  });
}
