import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
let server;
let browser;
let origin;

before(async () => {
  server = createServer(async (req, res) => {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/, '/index.html'));
    if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined });
});
after(async () => { await browser?.close(); await new Promise((done) => server?.close(done)); });

async function pageFor(t) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(5000);
  t.after(() => page.close());
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.NP?.dsp?.page);
  await page.evaluate(() => NP.sound.usePreset('flat'));
  return page;
}
async function select(page, tab) { await page.evaluate((tab) => NP.dsp.page.setTab(tab, true), tab); }
async function importEq(page, text) {
  await select(page, 'equalizer');
  await page.locator('[data-peq-import]').click();
  await page.locator('[data-dlg] textarea').fill(text);
  await page.locator('[data-dlg-ok]').click();
}

test('GraphicEQ imports logarithmic band gains and keeps headphone correction', async (t) => {
  const page = await pageFor(t);
  await page.evaluate(() => { NP.sound.state.peq = [{ on: true, type: 'peak', f: 1000, g: 2, q: 1 }]; NP.sound.state.peqOn = true; });
  await importEq(page, 'Preamp: -5.8 dB\nGraphicEQ: 31.25 -6; 125 6');
  const state = await page.evaluate(() => ({ eq: NP.sound.state.eq, peq: NP.sound.state.peq, preamp: NP.sound.state.preamp }));
  assert.deepEqual(state.eq, [-6, 0, 6, 6, 6, 6, 6, 6, 6, 6]);
  assert.equal(state.preamp, -5.8);
  assert.equal(state.peq[0].g, 2);
});

test('ParametricEQ accepts signed values, normalizes bounds and rejects missing gain', async (t) => {
  const page = await pageFor(t);
  await importEq(page, 'Preamp: -30 dB\nFilter 1: ON PK Fc 10 Hz Gain +30 dB Q 30\nFilter 2: OFF HP Fc 30000 Hz Q 0.01\nFilter 3: ON PK Fc 1000 Hz Q 1');
  const state = await page.evaluate(() => ({ peq: NP.sound.state.peq, preamp: NP.sound.state.preamp }));
  assert.deepEqual(state.peq, [{ on: true, type: 'peak', f: 20, g: 24, q: 20 }, { on: false, type: 'high_pass', f: 20000, g: 0, q: 0.1 }]);
  assert.equal(state.preamp, -12);
});

test('sliders support keyboard input and stop changing a disabled section', async (t) => {
  const page = await pageFor(t);
  await select(page, 'tone');
  const range = page.locator('[data-sl="bass"] input[type="range"]');
  assert.equal(await range.count(), 1, 'bass must expose a native keyboard slider');
  await range.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => NP.sound.state.bass), 0.5);
  await page.locator('[data-sw="sec.tone"]').click();
  assert.equal(await range.isDisabled(), true);
  await page.evaluate(() => { const range = document.querySelector('[data-sl="bass"] input[type="range"]'); range.value = '10'; range.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.evaluate(() => NP.sound.state.bass), 0.5);
});

test('disabled equalizer controls cannot mutate saved bands through keyboard activation', async (t) => {
  const page = await pageFor(t);
  await select(page, 'equalizer');
  await page.locator('[data-peq-add]').click();
  await page.locator('[data-sw="sec.equalizer"]').click();
  assert.equal(await page.locator('[data-peq-clear]').isDisabled(), true);
  assert.equal(await page.locator('[data-step="0.5"]').isDisabled(), true);
  await page.evaluate(() => { document.querySelector('[data-peq-clear]').click(); document.querySelector('[data-step="0.5"]').click(); });
  assert.equal(await page.evaluate(() => NP.sound.state.peq.length), 1);
  assert.equal(await page.evaluate(() => NP.sound.state.eq[5]), 0);
});

test('speaker type choices expose their disabled state while optimization is off', async (t) => {
  const page = await pageFor(t);
  await select(page, 'speaker');
  assert.equal(await page.locator('[data-seg="spkSize"] button').first().isDisabled(), true);
});

test('tab arrows update selection and modal Escape returns focus to its opener', async (t) => {
  const page = await pageFor(t);
  await page.locator('[data-tab="presets"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-tab="equalizer"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('[data-tab="presets"]').getAttribute('tabindex'), '-1');
  await page.locator('[data-peq-import]').click();
  assert.equal(await page.locator('[data-dlg] [role="dialog"]').getAttribute('aria-label'), '导入 AutoEq 文本');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-dlg]').isVisible(), false);
  assert.equal(await page.locator('[data-peq-import]').evaluate((el) => el === document.activeElement), true);
});

test('parametric correction bands can be edited and removed', async (t) => {
  const page = await pageFor(t);
  await select(page, 'equalizer');
  await page.locator('[data-peq-add]').click();
  assert.equal(await page.locator('[data-peq-edit="0"]').count(), 1);
  await page.locator('[data-peq-edit="0"]').click();
  await page.locator('[data-peq-field="f"]').fill('3200');
  await page.locator('[data-peq-field="g"]').fill('-4.5');
  await page.locator('[data-peq-field="q"]').fill('1.4');
  await page.locator('[data-peq-save]').click();
  assert.deepEqual(await page.evaluate(() => NP.sound.state.peq[0]), { on: true, type: 'peak', f: 3200, g: -4.5, q: 1.4 });
  await page.locator('[data-peq-edit="0"]').click();
  await page.locator('[data-peq-delete]').click();
  assert.equal(await page.evaluate(() => NP.sound.state.peq.length), 0);
});

test('browser status never fabricates native CPU load or a sample rate without audio taps', async (t) => {
  const page = await pageFor(t);
  await page.evaluate(() => { NP.sound.state.bass = 3; NP.player.playing = true; NP.player.audible = true; NP.dspScope.scope.sample(); });
  const status = await page.locator('[data-status]').innerText();
  assert.doesNotMatch(status, /单核|CPU|48 kHz/);
  assert.match(status, /浏览器/);
  assert.equal(await page.evaluate(() => NP.dspRuntime.limDb), 0);
});

test('signal chain highlights the current edit without waiting for a second change', async (t) => {
  const page = await pageFor(t);
  await page.evaluate(() => { NP.sound.state.bass = 3; NP.dsp.page.changed(); });
  assert.equal(await page.locator('[data-node="tone"]').evaluate((el) => el.classList.contains('is-on')), true);
});

test('mobile DSP supports precise input and keeps the monitor inside the viewport', async (t) => {
  const page = await pageFor(t);
  await page.setViewportSize({ width: 390, height: 844 });
  await select(page, 'equalizer');
  await page.locator('[data-sl="preamp"] [data-v]').click();
  await page.locator('[data-number]').fill('-5.8');
  await page.locator('[data-peq-save]').click();
  assert.equal(await page.evaluate(() => NP.sound.state.preamp), -5.8);
  await importEq(page, 'GraphicEQ: 31.25 -6; 125 6');
  assert.equal(await page.evaluate(() => NP.sound.state.eq[1]), 0);
  const boxes = await page.locator('.dscope__mon, .dscope__read, .dscope__side').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.right]; }));
  boxes.forEach(([left, right]) => { assert.ok(left >= 0 && right <= 390, 'monitor must fit the mobile viewport'); });
});

test('reduced motion keeps the idle model still until a setting changes', async (t) => {
  const page = await pageFor(t);
  const same = await page.evaluate(() => {
    const scope = NP.dspScope.scope;
    scope.visible = true;
    scope.frame(0.1);
    const before = scope.spec.toDataURL();
    scope.frame(0.1);
    return before === scope.spec.toDataURL();
  });
  assert.equal(same, true);
});

test('DSP uses the source theme controls and keeps collapsed titles readable', async (t) => {
  const page = await pageFor(t);
  for (const style of ['clean', 'material']) {
    await page.locator('#themes [data-app-style="' + style + '"]').click();
    await select(page, 'tone');
    const metrics = await page.locator('.ph--fx').evaluate((phone) => {
      const css = (selector) => getComputedStyle(phone.querySelector(selector));
      const scroll = phone.querySelector('[data-scroll]');
      scroll.scrollTop = 44;
      scroll.dispatchEvent(new Event('scroll'));
      const mini = phone.querySelector('.hm-mini');
      const nav = phone.querySelector('.hm-nav');
      return {
        tabs: css('.fxa-tabs__row').height,
        thumb: [css('.xs-thumb').width, css('.xs-thumb').height],
        chip: css('.fxa-chip').borderRadius,
        titleColor: css('.fxa-bar__t').color,
        titleShadow: css('.fxa-bar__t').textShadow,
        titleAlphas: ['.fxa-large', '.fxa-bar__t'].map((selector) => +css(selector).opacity),
        announcedTitles: phone.querySelectorAll('.fxa-large[aria-hidden="false"], .fxa-bar__t[aria-hidden="false"]').length,
        bottomChrome: { miniHeight: mini.offsetHeight, gap: nav.offsetTop - mini.offsetTop - mini.offsetHeight, navHeight: nav.offsetHeight },
      };
    });
    assert.equal(metrics.tabs, style === 'clean' ? '36px' : '48px');
    assert.deepEqual(metrics.thumb, style === 'clean' ? ['24px', '24px'] : ['4px', '44px']);
    assert.equal(metrics.chip, style === 'clean' ? '999px' : '8px');
    assert.notEqual(metrics.titleColor, 'rgb(0, 0, 0)');
    assert.equal(metrics.titleShadow, 'none');
    assert.equal(metrics.announcedTitles, 1, 'only one app-bar title is announced during collapse');
    assert.equal(metrics.titleAlphas[0], 0.5);
    assert.ok(metrics.titleAlphas[1] < 0.1, 'the compact title follows the source delayed fade-in');
    assert.equal(metrics.bottomChrome.miniHeight, style === 'clean' ? 58 : 64);
    assert.equal(metrics.bottomChrome.gap, style === 'clean' ? 6 : 0);
    assert.equal(metrics.bottomChrome.navHeight, style === 'clean' ? 64 : 104);
  }
});
