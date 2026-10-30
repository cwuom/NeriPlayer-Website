import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
async function visit(run, locale = 'zh', width = 1440, reducedMotion = 'reduce') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 900 : 1100 }, isMobile: width === 390, hasTouch: width === 390, reducedMotion });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto((process.env.SITE_URL || 'http://localhost:6060') + (locale === 'en' ? '/en/' : '/'));
    await page.waitForFunction(() => NP.booted);
    await page.locator('#deviceHome').scrollIntoViewIfNeeded();
    await run(page, page.locator('#phHome'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
async function scale(page, value) { await page.locator('#labScale').evaluate((range, value) => { range.value = value * 100; range.dispatchEvent(new Event('input', { bubbles: true })); }, value); }
function expected(ui) {
  const width = 411 / ui, tablet = width >= 600, outer = 24, container = width - outer * 2;
  const slots = Math.max(container >= 300 ? 3 : 2, container >= 600 ? 4 : 0, Math.ceil((container - 16 + 12) / 152), 1);
  return { width, outer, container, slots, card: (container - 16 - 12 * (slots - 1)) / slots, radar: tablet ? 172 : 148 };
}
function metrics(ph) {
  const app = ph.querySelector('.hm-app'), scroll = ph.querySelector('.hm-scroll'), rows = Array.from(ph.querySelectorAll('.hm-cards')), phone = ph.getBoundingClientRect(), ui = Number(getComputedStyle(ph).getPropertyValue('--ui')), screenScale = phone.width / ph.offsetWidth;
  const row = rows[0].getBoundingClientRect(), cards = Array.from(rows[0].children).map(card => card.getBoundingClientRect()), nav = ph.querySelector('.hm-nav'), navBox = nav.getBoundingClientRect();
  const labels = Array.from(nav.querySelectorAll('svg,.ng-label')).filter(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0).map(el => el.getBoundingClientRect().bottom);
  const appScale = new DOMMatrixReadOnly(getComputedStyle(app).transform).a, miniStyle = getComputedStyle(ph.querySelector('.hm-mini'));
  return { ui, width: parseFloat(getComputedStyle(app).width), appScale, outerWidth: parseFloat(getComputedStyle(app).width) * appScale, phoneWidth: ph.offsetWidth, card: parseFloat(getComputedStyle(rows[0].firstElementChild).width), gap: parseFloat(getComputedStyle(rows[0]).gap), radar: parseFloat(getComputedStyle(rows[1].firstElementChild).width), rowRight: (row.right - phone.left) / screenScale, cardRights: cards.map(card => (card.right - phone.left) / screenScale), rowOverflow: rows[0].scrollWidth - rows[0].clientWidth, labelsClear: labels.every(bottom => bottom <= phone.bottom - 24 * screenScale + 1), navInside: navBox.left >= phone.left - .05 && navBox.right <= phone.right + .05 && navBox.bottom <= phone.bottom + 1, miniGap: parseFloat(getComputedStyle(nav).top) - parseFloat(miniStyle.top) - parseFloat(miniStyle.height), subtitles: Array.from(scroll.querySelectorAll('.hm-list div>span')).map(el => ({ overflow: getComputedStyle(el).overflowX, display: getComputedStyle(el).display })), inert: app.inert, style: ph.dataset.appStyle };
}
function chromeGeometry(ph) {
  const nav = ph.querySelector('.hm-nav'), mini = ph.querySelector('.hm-mini'), selected = nav.querySelector('.is-on'), pill = nav.querySelector('.ng-pill');
  return {
    gap: nav.getBoundingClientRect().top - mini.getBoundingClientRect().bottom,
    filterMaps: [mini, nav].map(bar => {
      const filter = document.getElementById(bar.dataset.glassFilter);
      const map = filter && filter.querySelector('feImage');
      return { width: bar.clientWidth, height: bar.clientHeight, mapWidth: Number(map && map.getAttribute('width')), mapHeight: Number(map && map.getAttribute('height')) };
    }),
    selectedWidth: selected.offsetWidth,
    pillWidth: pill && pill.offsetWidth,
    pillX: pill && parseFloat(pill.style.getPropertyValue('--ng-pill-x')),
    selectedX: selected.offsetLeft
  };
}
function assertGlassFits(actual) {
  actual.filterMaps.forEach(bar => {
    assert.equal(bar.mapWidth, bar.width, 'glass texture must resize with the current DPI, not retain a previous width');
    assert.equal(bar.mapHeight, bar.height, 'glass texture must resize with the current DPI, not retain a previous height');
  });
  assert.equal(actual.pillWidth, actual.selectedWidth - 4, 'the selected tab pill must resize with its tab');
  assert.equal(actual.pillX, actual.selectedX + 2);
}
test('Clean glass and selection update during a real DPI slider drag and theme round-trip', async () => {
  await visit(async (page, home) => {
    await page.locator('#lab [data-app-style="clean"]').click();
    const box = await page.locator('#labScale').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    try {
      for (const ratio of [.02, .98, .3, .7, .02, .98]) {
        await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assertGlassFits(await home.evaluate(chromeGeometry));
      }
    } finally { await page.mouse.up(); }
    await page.locator('#lab [data-app-style="material"]').click();
    await scale(page, 1);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(Math.abs((await home.evaluate(chromeGeometry)).gap) < .05, 'Material mini player must meet the navigation bar');
    await page.locator('#lab [data-app-style="clean"]').click();
    await scale(page, .6);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assertGlassFits(await home.evaluate(chromeGeometry));
  }, 'zh', 1440, 'no-preference');
});
test('Clean DPI 1.15 sizes all three continue cards from the native available width', async () => {
  await visit(async (page, home) => {
    await page.locator('#lab [data-app-style="clean"]').click();
    await scale(page, 1.15);
    await page.waitForFunction(() => Math.abs(Number(getComputedStyle(document.querySelector('#phHome')).getPropertyValue('--ui')) - 1.15) < .00001);
    const actual = await home.evaluate(metrics), source = expected(1.15);
    assert.ok(Math.abs(actual.card - source.card) < .03, 'native card width ' + source.card + 'dp, actual ' + actual.card + 'dp');
    assert.equal(source.slots, 3);
    assert.ok(actual.cardRights.every(right => right <= actual.rowRight + 1), JSON.stringify(actual));
    assert.ok(actual.rowOverflow <= 1, 'three continue entries must fit in the first native pager page');
  });
});
for (const locale of ['zh', 'en']) for (const width of [390, 1440]) {
  test('Home density preserves source layout and fixed chrome ' + locale + '-' + width, async () => {
    await visit(async (page, home) => {
      const all = [];
      for (const style of ['clean', 'material', 'clean']) for (const ui of [.6, 1, 1.15, 1.2]) {
        await page.locator('#lab [data-app-style="' + style + '"]').click();
        await scale(page, ui);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const actual = await home.evaluate(metrics), source = expected(ui);
        assert.equal(actual.ui, ui, 'Android density changes directly, with no delayed DPI interpolation');
        assert.equal(actual.appScale, ui);
        assert.ok(Math.abs(actual.width - source.width) < .03);
        assert.ok(Math.abs(actual.outerWidth - actual.phoneWidth) < .03);
        assert.ok(Math.abs(actual.card - source.card) < .03, JSON.stringify({ actual, source }));
        assert.equal(actual.gap, 12);
        assert.equal(actual.radar, source.radar);
        assert.ok(actual.cardRights.slice(0, Math.min(3, source.slots)).every(right => right <= actual.rowRight + 1));
        assert.equal(actual.labelsClear, true);
        assert.equal(actual.navInside, true, JSON.stringify({ actual, source, style }));
        assert.ok(Math.abs(actual.miniGap - (style === 'clean' ? 6 : 0)) < .05, JSON.stringify({ actual, source, style }));
        const chrome = await home.evaluate(chromeGeometry);
        if (style === 'clean') assertGlassFits(chrome);
        else assert.ok(Math.abs(chrome.gap) < .05, 'Material mini player and bottom navigation must share an edge');
        assert.ok(actual.subtitles.every(subtitle => subtitle.overflow === 'hidden' && subtitle.display === 'block'));
        assert.equal(actual.inert, true);
        assert.equal(actual.style, style);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
        all.push({ style, ui, actual, source });
        if (process.env.ARTIFACT_DIR) { mkdirSync(process.env.ARTIFACT_DIR, { recursive: true }); await home.screenshot({ path: join(process.env.ARTIFACT_DIR, 'home-dpi-' + [locale, style, width, ui].join('-') + '.png') }); }
        const finalClear = await home.evaluate(ph => {
          const scroll = ph.querySelector('.hm-scroll'); scroll.scrollTop = scroll.scrollHeight;
          const clear = scroll.lastElementChild.getBoundingClientRect().bottom <= ph.querySelector('.hm-mini').getBoundingClientRect().top + 1;
          scroll.scrollTop = 0;
          return clear;
        });
        assert.equal(finalClear, true, 'the final Home section must remain reachable above the player at every DPI');
      }
      if (process.env.ARTIFACT_DIR) writeFileSync(join(process.env.ARTIFACT_DIR, 'home-dpi-' + locale + '-' + width + '.json'), JSON.stringify(all, null, 2));
    }, locale, width, 'no-preference');
  });
}
