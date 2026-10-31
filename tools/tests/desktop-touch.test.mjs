import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, before } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const site = process.env.SITE_URL || 'http://localhost:6060';
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
});
after(async () => { await browser?.close(); });

async function open(run, path = '/', mobile = true, init) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference',
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__live', route => route.abort());
  await page.route('https://api.github.com/**', route => route.abort());
  if (init) await page.addInitScript(init);
  try {
    await page.goto(site + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
    await page.locator('#deskStage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => NP.desktopSim.sim.ready && document.querySelector('#deskSim').closest('.dwin').classList.contains('is-live'));
    await page.evaluate(() => document.fonts.ready);
    await run(page, page.locator('#deskSim'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

for (const path of ['/', '/en/']) {
  test(`${path} touch desktop player keeps working transport, favorite, lyrics and seek controls`, async () => {
    await open(async (page, host) => {
      await page.locator('#deskT1').tap();
      assert.equal(await host.locator('.np-controls .play-btn').count(), 1, 'the mobile player must expose live controls');
      await page.waitForFunction(() => NP.desktopSim.sim.npReady);
      await page.evaluate(() => { NP.player.pause(); NP.player.liked = false; NP.player.shuffle = false; NP.player.emit(); });
      const play = host.locator('.np-controls .play-btn');
      await play.tap();
      await page.waitForFunction(() => NP.player.playing && NP.player.audible);
      await play.tap();
      assert.equal(await page.evaluate(() => NP.player.playing), false);
      await host.locator('.np-toolbar .fav-btn').tap();
      assert.equal(await page.evaluate(() => NP.player.liked), true);
      await host.locator('.np-controls button').first().tap();
      await host.locator('.np-controls button').last().tap();
      assert.deepEqual(await page.evaluate(() => [NP.player.shuffle, NP.player.repeat]), [true, 2]);
      await host.locator('.lyrics-display-toggle').tap();
      assert.equal(await host.locator('.amll-lyric-player').evaluate(el => el.classList.contains('dsim-no-sub')), true);

      const wave = await host.locator('.waveform-container').boundingBox();
      const touch = await page.context().newCDPSession(page);
      const point = fraction => ({ x: wave.x + wave.width * fraction, y: wave.y + wave.height / 2 });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.2)] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.7)] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.ok(await page.evaluate(() => Math.abs(NP.player.t / NP.player.dur - .7) < .02), 'dragging the waveform must seek on a touch release');
      await host.locator('.tb-np-collapse').tap();
      assert.equal(await page.evaluate(() => NP.desktopSim.sim.np), false);
      await host.locator('.mp-cover').tap();
      assert.equal(await page.evaluate(() => NP.desktopSim.sim.np), true);
    }, path);
  });
}

for (const mobile of [true, false]) {
  test(`${mobile ? 'touch' : 'mouse'} desktop entrance prepares the animated content before revealing it and preserves interrupted motion`, async () => {
    await open(async (page, host) => {
      await page.locator('#deskT1').evaluate(button => {
        button.addEventListener('click', () => {
          const sim = NP.desktopSim.sim;
          const line = sim.q('.amll-lyric-player')?.firstElementChild;
          const pixel = new Uint8Array(4);
          if (sim.hyper?.ok) {
            const gl = sim.hyper.gl;
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          }
          const animation = sim.npEl.getAnimations().find(animation => animation.transitionProperty === 'transform');
          if (animation) { animation.pause(); animation.currentTime = 150; }
          window.desktopFirstPaint = { lyrics: !!line && getComputedStyle(line).transform !== 'none', background: pixel[3] > 0, slide: !!animation };
        }, { once: true });
      });
      if (mobile) await page.locator('#deskT1').tap(); else await page.locator('#deskT1').click();
      const firstPaint = await page.evaluate(() => window.desktopFirstPaint);
      assert.equal(firstPaint.lyrics, true, 'lyrics must be laid out before the playback entrance can paint');
      assert.equal(firstPaint.background, true, 'the fluid background must have its first frame ready at the entrance');
      assert.equal(firstPaint.slide, true, 'the playback entrance must retain its slide animation');
      const player = host.locator('.now-playing');
      for (let i = 0; i < 4; i++) {
        const continuity = await page.evaluate(i => {
          const sim = NP.desktopSim.sim;
          const el = sim.npEl;
          const before = el.getBoundingClientRect().y;
          document.querySelector(i % 2 ? '#deskT1' : '#deskT0').click();
          const after = el.getBoundingClientRect().y;
          const animation = el.getAnimations().find(animation => animation.transitionProperty === 'transform');
          if (animation) { animation.pause(); animation.currentTime = 100; }
          return { before, after, visible: getComputedStyle(el).visibility };
        }, i);
        assert.ok(Math.abs(continuity.before - continuity.after) < .5, JSON.stringify(continuity));
        assert.equal(continuity.visible, 'visible');
      }
      await player.evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
      assert.equal(await host.evaluate(el => el.classList.contains('np-open')), true);
    }, '/', mobile);
  });
}

test('a desktop player without WebGL keeps controls and resize callbacks working', async () => {
  await open(async (page, host) => {
    await page.locator('#deskT1').click();
    assert.equal(await page.evaluate(() => NP.desktopSim.sim.hyper.ok), false);
    await page.evaluate(() => NP.measure(true));
    await host.locator('.np-toolbar .fav-btn').click();
    assert.equal(await page.evaluate(() => NP.player.liked), true);
    await host.locator('.tb-np-collapse').click();
    assert.equal(await page.evaluate(() => NP.desktopSim.sim.np), false);
  }, '/', false, () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...options) {
      return type === 'webgl' ? null : getContext.call(this, type, ...options);
    };
  });
});
