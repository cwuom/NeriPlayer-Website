import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
async function visit(run, width = 1440) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(process.env.SITE_URL || 'http://localhost:6060', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
    await page.locator('#devicePlay').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => NP.player.playing);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function audioState(page) {
  return page.evaluate(() => {
    const audio = document.getElementById('player');
    return { playing: NP.player.playing, audible: NP.player.audible, muted: audio.muted, paused: audio.paused, loop: audio.loop, time: audio.currentTime, repeat: NP.player.repeat };
  });
}

test('visible player starts a real muted preview and always repeats the single bundled song', async () => {
  await visit(async page => {
    await page.waitForFunction(() => !document.getElementById('player').paused);
    const state = await audioState(page);
    assert.deepEqual([state.playing, state.audible, state.muted, state.loop, state.repeat], [true, false, true, true, 2]);
    assert.equal(await page.locator('#phPlay .pg-cover [data-ph-toggle] use').getAttribute('href'), '#i-play-o');
    assert.equal(await page.locator('#phPlay .pg-cover [data-ph-toggle]').getAttribute('aria-label'), '播放');
    await page.evaluate(() => { NP.player.repeat = 0; NP.player.emit(); });
    assert.equal((await audioState(page)).repeat, 2);
    assert.equal(await page.locator('#phPlay .pg-cover [data-ph-repeat] use').getAttribute('href'), '#i-repeat-one');
  });
});

test('mute buttons change actual media mute without pausing or seeking playback', async () => {
  await visit(async page => {
    const mute = page.locator('#devicePlay + .ph-hint');
    assert.equal(await mute.getAttribute('aria-pressed'), 'true');
    await mute.click();
    await page.waitForFunction(() => NP.player.audible && !document.getElementById('player').paused && !document.getElementById('player').muted);
    assert.equal(await page.locator('#phPlay .pg-cover [data-ph-toggle] use').getAttribute('href'), '#i-pause');
    assert.equal(await page.locator('#phPlay .pg-cover [data-ph-toggle]').getAttribute('aria-label'), '暂停');
    const audible = await audioState(page);
    await page.waitForTimeout(120);
    await mute.click();
    const muted = await audioState(page);
    assert.deepEqual([muted.playing, muted.audible, muted.muted, muted.paused], [true, false, true, false]);
    assert.ok(muted.time >= audible.time, 'muting must preserve the current audio position');
    assert.ok(muted.time - audible.time < 2, 'muting must not seek to a new position');
    await page.waitForTimeout(150);
    assert.ok((await audioState(page)).time > muted.time, 'the muted media keeps advancing');
    assert.equal(await mute.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#phPlay .pg-cover [data-ph-toggle] use').getAttribute('href'), '#i-play-o');
    assert.equal(await page.locator('#phPlay .pg-cover [data-ph-toggle]').getAttribute('aria-label'), '播放');
  });
});

test('play first unmutes a running preview, then pauses; muting a paused song does not resume it', async () => {
  await visit(async page => {
    const play = page.locator('#phPlay .pg-cover [data-ph-toggle]');
    await play.click();
    await page.waitForFunction(() => NP.player.audible && !document.getElementById('player').muted);
    assert.equal((await audioState(page)).paused, false);
    await play.click();
    const paused = await audioState(page);
    assert.equal(paused.playing, false);
    assert.equal(paused.paused, true);
    assert.equal(await play.locator('use').getAttribute('href'), '#i-play-o');
    assert.equal(await play.getAttribute('aria-label'), '播放');
    await page.locator('#devicePlay + .ph-hint').click();
    const muted = await audioState(page);
    assert.deepEqual([muted.playing, muted.paused, muted.muted], [false, true, true]);
    assert.ok(Math.abs(muted.time - paused.time) < .05);
  });
});

test('actual media loops across the track end while keeping playback and mute state', async () => {
  await visit(async page => {
    await page.locator('#phPlay .pg-cover [data-ph-toggle]').click();
    await page.waitForFunction(() => !document.getElementById('player').paused && NP.player.audible);
    await page.evaluate(() => NP.player.seek(NP.player.dur - .14));
    await page.waitForFunction(() => document.getElementById('player').currentTime < 1, null, { timeout: 4000 });
    const state = await audioState(page);
    assert.deepEqual([state.playing, state.paused, state.muted, state.loop], [true, false, false, true]);
  });
});

for (const width of [390, 1440]) test(`wave thumbs remain full circles at both Android track endpoints and dragging clamps to the source fraction ${width}`, async () => {
  await visit(async page => {
    await page.evaluate(() => NP.player.pause());
    const ends = await page.evaluate(() => {
      const phone = NP.phones.list.find(phone => phone.ph.id === 'phPlay');
      const wave = phone.waves[0];
      wave.amp = 0; wave.phase = 0;
      return [0, 1].map(progress => {
        wave.draw(0, progress);
        const radius = 16 / 2.625;
        const y = Math.floor((24 + radius * .45) * wave.k);
        const row = wave.ctx.getImageData(0, y, wave.c.width, 1).data;
        let colored = 0;
        for (let x = 0; x < wave.c.width; x++) if (row[x * 4 + 3] > 128) colored++;
        return { progress, colored, minimum: radius * 1.4 * wave.k };
      });
    });
    for (const end of ends) assert.ok(end.colored > end.minimum, `thumb at ${end.progress} must draw both halves (${end.colored} > ${end.minimum})`);
    const wave = page.locator('#phPlay .pg-cover [data-ph-wave]');
    const rect = await wave.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x - 20, rect.y + rect.height / 2);
    assert.equal(await page.evaluate(() => NP.player.t), 0);
    await page.mouse.move(rect.x + rect.width + 20, rect.y + rect.height / 2);
    assert.equal(await page.evaluate(() => NP.player.t / NP.player.dur), 1);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => NP.phones.list.find(phone => phone.ph.id === 'phPlay').waves[0].drag), false);
  }, width);
});

test('buffering uses Android vertical pulses and a level thumb instead of the travelling wave', async () => {
  await visit(async page => {
    await page.evaluate(() => NP.player.pause());
    const samples = await page.evaluate(() => {
      const wave = NP.phones.list.find(phone => phone.ph.id === 'phPlay').waves[0];
      const ctx = wave.ctx;
      const lines = [];
      let start;
      let circle;
      const moveTo = ctx.moveTo, lineTo = ctx.lineTo, arc = ctx.arc;
      ctx.moveTo = function (x, y) { start = { x, y }; return moveTo.call(this, x, y); };
      ctx.lineTo = function (x, y) { lines.push({ start, end: { x, y } }); return lineTo.call(this, x, y); };
      ctx.arc = function (x, y, radius, a, b) { circle = { x, y, radius }; return arc.call(this, x, y, radius, a, b); };
      NP.player.playing = true;
      document.getElementById('player').dispatchEvent(new Event('waiting'));
      wave.phase = .6;
      wave.draw(.016, .4);
      ctx.moveTo = moveTo; ctx.lineTo = lineTo; ctx.arc = arc;
      const result = { waiting: NP.player.waiting, lines, circle, width: wave.w };
      NP.player.pause();
      return result;
    });
    assert.equal(samples.waiting, true);
    assert.ok(samples.lines.length >= 1 && samples.lines.length <= 72);
    assert.ok(samples.lines.every(line => line.start.x === line.end.x), 'waiting segments must be vertical');
    assert.ok(samples.lines.some(line => line.end.y - line.start.y > 4), 'pulse strength changes the segment height');
    assert.equal(samples.circle.y, 24);
    assert.ok(Math.abs(samples.circle.x - .4 * samples.width) < .001);
  });
});
