import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

const require = createRequire(process.env.PLAYWRIGHT_FROM ? join(process.env.PLAYWRIGHT_FROM, 'noop.js') : import.meta.url);
const { chromium } = require('playwright');
const base = process.env.SITE_URL || 'http://localhost:6060';
const executablePath = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(path => path && existsSync(path));
let browser;

before(async () => { browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }); });
after(async () => { await browser?.close(); });

async function open(path = '/', options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  const apiRequests = [];
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => {
    apiRequests.push(route.request().url());
    const url = route.request().url();
    if (url.includes('/releases')) {
      const release = {
        tag_name: 'v0.6.7.r1477.964c722b9', published_at: '2026-10-29T00:00:00Z',
        html_url: 'https://github.com/cwuom/NeriPlayer/releases', body: '',
        assets: ['neriplayer-arm64-v8a.apk', 'neriplayer-x64-setup.exe', 'neriplayer-arm64.dmg', 'neriplayer.deb'].map(name => ({
          name, browser_download_url: 'https://example.test/' + name, size: 123456789,
          digest: 'sha256:' + 'a'.repeat(64), download_count: 123456,
        })),
      };
      return route.fulfill({ json: url.includes('/latest') ? release : [release] });
    }
    return route.fulfill({ json: { stargazers_count: 3700, forks_count: 131 } });
  });
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.NP?.booted);
  await page.evaluate(() => document.fonts.ready);
  return { page, apiRequests };
}

async function overflowing(page, selector) {
  return page.locator(selector).evaluateAll(nodes => nodes.flatMap(el => {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') return [];
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    return el.scrollWidth > el.clientWidth + 1 || text.left < box.left - 1 || text.right > box.right + 1
      ? [{ text: el.textContent.trim().slice(0, 60), width: box.width, scrollWidth: el.scrollWidth, textWidth: text.width }]
      : [];
  }));
}

for (const path of ['/', '/en/']) {
  test(`${path} navigation, statistics, tickets and tablet fit their containers`, async () => {
    const { page } = await open(path);
    const failures = [];
    try {
      await page.locator('#statsDemo').scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      await page.locator('#statsDemo [data-r="4"]').click();
      await page.waitForFunction(() => document.querySelector('#statPlays').textContent === '19,630');
      for (const width of [320, 390, 560, 768, 1024, 1100, 1161, 1180, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(async () => {
          window.NP.measure(true);
          // media query styles commit on the frames following the viewport resize
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        const nav = await page.locator('.nav__links').evaluate(el => {
          if (getComputedStyle(el).display === 'none') return [];
          return Array.from(el.querySelectorAll('a')).filter(a => a.getBoundingClientRect().height > parseFloat(getComputedStyle(a).lineHeight) + 1).map(a => a.textContent);
        });
        if (nav.length) failures.push({ width, navigationWraps: nav });
        for (const selector of ['.stats__nums', '.stats__nums dd', '.ticket__route', '.ticket__stop b', '.ticket__info', '.ticket__stub', '.tabdev', '.dwin__screen']) {
          const overflow = await overflowing(page, selector);
          if (overflow.length) failures.push({ width, selector, overflow });
        }
        const navOverflow = await page.locator('.nav').evaluate(el => el.scrollWidth > el.clientWidth + 1);
        if (navOverflow) failures.push({ width, navOverflow });
        for (const platform of ['android', 'desktop']) {
          await page.locator(`.dlswitch button[data-plat="${platform}"]`).click();
          for (const os of platform === 'desktop' ? ['win', 'mac', 'linux'] : [null]) {
            if (os) await page.locator(`[data-dos-seg] [data-dos="${os}"]`).click();
            const selector = '.dlpane.is-on .ticket__route, .dlpane.is-on .ticket__stop b, .dlpane.is-on .ticket__info, .dlpane.is-on .ticket__stub, .dlpane.is-on .ticket__actions .btn';
            const overflow = await overflowing(page, selector);
            if (overflow.length) failures.push({ width, platform, os, overflow });
          }
        }
      }
      assert.deepEqual(failures, []);
    } finally { await page.close(); }
  });
}

test('desktop simulation waits until nearby and creates playback graphics only on demand', async () => {
  const { page } = await open();
  try {
    await page.evaluate(() => {
      const stage = document.querySelector('.dstage');
      window.NP.scrollTo(stage.getBoundingClientRect().top + scrollY - innerHeight - 800, true);
    });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => !!window.NP.desktopSim.sim.loading), false, 'simulation must stay unloaded 800px below the viewport');
    await page.locator('#deskSim').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.NP.desktopSim.sim.ready);
    assert.equal(await page.evaluate(() => !!window.NP.desktopSim.sim.hyper), false, 'home view must not allocate the playback WebGL renderer');
    await page.evaluate(() => window.NP.desktopSim.sim.go('np'));
    await page.waitForFunction(() => !!window.NP.desktopSim.sim.lyr);
    assert.ok(await page.evaluate(() => window.NP.desktopSim.sim.lyr.lines.length > 0));
    await page.evaluate(() => window.NP.scrollTo(0, true));
    await page.waitForFunction(() => !window.NP.desktopSim.sim.visible);
    const before = await page.evaluate(() => window.NP.desktopSim.sim.hyper?.t);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.NP.desktopSim.sim.hyper?.t), before, 'offscreen playback must not render');
  } finally { await page.close(); }
});

test('startup does not fetch unused desktop repository metadata', async () => {
  const { page, apiRequests } = await open();
  try {
    assert.ok(apiRequests.some(url => url.endsWith('/cwuom/NeriPlayer')));
    assert.equal(apiRequests.some(url => url.endsWith('/cwuom/NeriPlayer-Desktop')), false);
  } finally { await page.close(); }
});

test('download buttons and every selected desktop system remain readable in both themes', async () => {
  const { page } = await open();
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  const failures = [];
  try {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      for (const platform of ['android', 'desktop']) {
        await page.locator(`.dlswitch button[data-plat="${platform}"]`).click();
        const button = await page.locator('.dlpane.is-on .ticket__actions .btn--ink').evaluate(el => {
          const style = getComputedStyle(el);
          return { color: style.color, background: style.backgroundColor };
        });
        if (contrast(button.color, button.background) < 4.5) failures.push({ theme, platform, button });
      }
      for (const os of ['win', 'mac', 'linux']) {
        await page.locator(`[data-dos="${os}"]`).click();
        await page.waitForFunction(os => document.querySelector(`[data-dos="${os}"]`).classList.contains('is-on'), os);
        await page.waitForTimeout(100);
        const button = await page.locator(`[data-dos="${os}"]`).evaluate(el => ({
          color: getComputedStyle(el).color,
          background: getComputedStyle(el.closest('.seg').querySelector('.seg__ind') || el).backgroundColor,
        }));
        if (contrast(button.color, button.background) < 4.5) failures.push({ theme, os, button });
      }
    }
    assert.deepEqual(failures, []);
  } finally { await page.close(); }
});
