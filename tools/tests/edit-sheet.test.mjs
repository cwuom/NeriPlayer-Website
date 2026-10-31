import { enablePlayerInteractions, enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
async function visit(run, options = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', ...options });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto((process.env.SITE_URL || 'http://localhost:6060') + (options.locale === 'en' ? '/en/' : '/'));
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted && NP.phoneUI.uis.length; });
    await enablePlayerInteractions(page, ['#phPlay']);
    if (options.style) await page.evaluate(style => NP.themes.select(style), options.style);
    if (options.scale) {
      await enablePreviewInteractions(page, ['settings']);
      const settings = page.locator('[data-app-preview="settings"]');
      await settings.locator('[data-ap-setting="general"]').click();
      await settings.locator('[data-ap-scale-open]').click();
      await settings.locator('[data-ap-scale]').evaluate((el, scale) => { el.value = scale; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(options.scale));
      await settings.locator('[data-ap-scale-apply]').click();
    }
    const phone = page.locator('#phPlay');
    await phone.locator('.pg-cover [data-ph-more]').evaluate(button => button.click());
    await phone.locator('.msheet--more [data-i="1"]').click();
    assert.equal(await phone.locator('.np-song-edit').count(), 1, 'Edit Song Info must use its source bottom-sheet layout');
    await page.waitForFunction(() => document.querySelector('#phPlay .np-song-edit.is-open'));
    await run(page, phone, phone.locator('.np-song-edit'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
test('edit sheet reproduces source fixed chrome, cover and fields without exposing a browser file control', async () => {
  await visit(async (page, phone, sheet) => {
    assert.equal(await phone.evaluate(el => el.classList.contains('is-dialog')), false);
    assert.equal(await sheet.locator('[data-action-cover]:visible').count(), 0);
    assert.equal(await sheet.locator('[data-action-lyrics]').count(), 0);
    assert.equal(await sheet.locator('[data-edit-restore]').count(), 3);
    const geometry = await sheet.evaluate(el => {
      const cover = el.querySelector('.np-edit-cover'), actions = el.querySelector('.np-edit-actions');
      return { ratio: el.offsetHeight / el.closest('.ph').clientHeight, cover: [cover.offsetWidth, cover.offsetHeight], columns: Array.from(actions.children).map(button => button.offsetWidth), padding: parseFloat(getComputedStyle(el.querySelector('.np-edit-chrome')).paddingLeft) };
    });
    assert.ok(Math.abs(geometry.ratio - .9) < .002);
    assert.deepEqual(geometry.cover, [120, 120]);
    assert.equal(geometry.padding, 24);
    assert.ok(Math.max(...geometry.columns) - Math.min(...geometry.columns) <= 1);
    assert.match(await sheet.innerText(), /编辑歌曲信息|Edit Song Info/);
    assert.equal(await sheet.locator('.np-edit-actions>button').count(), 3);
    if (process.env.ARTIFACT_DIR) { mkdirSync(process.env.ARTIFACT_DIR, { recursive: true }); await phone.screenshot({ path: join(process.env.ARTIFACT_DIR, 'edit-main-zh-clean.png') }); }
  });
});
test('metadata drafts cancel safely, restore each original field and commit only within the preview', async () => {
  await visit(async (page, phone, sheet) => {
    const original = await sheet.locator('[data-action-field="title"]').inputValue();
    await sheet.locator('[data-action-field="title"]').fill('Draft title');
    await sheet.locator('[data-edit-restore="title"]').click();
    assert.equal(await sheet.locator('[data-action-field="title"]').inputValue(), original);
    await sheet.locator('[data-action-field="title"]').fill('Preview title');
    await sheet.locator('[data-action-field="artist"]').fill('Preview artist');
    await sheet.locator('[data-edit-action="save"]').click();
    assert.equal(await sheet.locator('[data-edit-action="modal-apply"]').isDisabled(), true, 'the browser must not claim to write the source audio file');
    await sheet.locator('[data-edit-action="save-preview"]').click();
    assert.equal(await page.evaluate(() => NP.previewTrack.title), 'Preview title');
    assert.match(await phone.locator('.pc-id').innerText(), /Preview title/);
    await phone.locator('.pg-cover [data-ph-more]').evaluate(button => button.click());
    await phone.locator('.msheet--more [data-i="1"]').click();
    await sheet.locator('[data-action-field="title"]').fill('Discard this');
    await sheet.locator('[data-edit-action="cancel"]').click();
    assert.equal(await page.evaluate(() => NP.previewTrack.title), 'Preview title');
  });
});
test('cover selection uses a hidden picker, shows the chosen image and leaves the original intact on cancel', async () => {
  await visit(async (page, phone, sheet) => {
    const original = await phone.locator('.pc-art>img').getAttribute('src');
    await sheet.locator('[data-edit-action="choose-cover"]').click();
    const chooserPromise = page.waitForEvent('filechooser');
    await sheet.locator('[data-edit-action="modal-apply"]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64') });
    assert.match(await sheet.locator('[data-action-field="cover"]').inputValue(), /^blob:/);
    assert.match(await sheet.locator('.np-edit-cover>img').getAttribute('src'), /^blob:/);
    assert.equal(await sheet.locator('[data-action-cover]').isHidden(), true);
    await sheet.locator('[data-edit-action="cancel"]').click();
    assert.equal(await phone.locator('.pc-art>img').getAttribute('src'), original);
  });
});
test('lyrics are a separate tabbed editor and can clear, play, switch pages and restore actual lyrics', async () => {
  await visit(async (page, phone, sheet) => {
    const original = await page.evaluate(() => NP.previewLyricsText());
    await sheet.locator('[data-edit-action="lyrics"]').click();
    assert.equal(await sheet.locator('[data-edit-lyric-tab]').count(), 3);
    if (process.env.ARTIFACT_DIR) { mkdirSync(process.env.ARTIFACT_DIR, { recursive: true }); await phone.screenshot({ path: join(process.env.ARTIFACT_DIR, 'edit-lyrics-zh-clean.png') }); }
    await sheet.locator('[data-edit-action="lyrics-clear"]').click();
    await sheet.locator('[data-edit-lyric-tab="1"]').click();
    await sheet.locator('[data-edit-action="lyrics-clear"]').click();
    await sheet.locator('[data-edit-action="lyrics-save"]').click();
    assert.equal(await page.evaluate(() => NP.LYRICS.length), 0);
    await sheet.locator('[data-edit-action="cancel"]').click();
    await page.keyboard.press('Escape');
    await phone.locator('.pg-cover [data-ph-toggle]').click();
    await page.waitForFunction(() => NP.player.playing && NP.player.audible);
    await phone.locator('.pg-cover [data-ph-golyrics]').click();
    await page.waitForFunction(() => document.querySelector('#phPlay').classList.contains('is-lyrics'));
    await phone.locator('.pg-lyrics [data-ph-more]').click();
    await phone.locator('.msheet--more [data-i="1"]').click();
    await sheet.locator('[data-edit-action="lyrics"]').click();
    await sheet.locator('[data-action-lyrics]').fill(original);
    await sheet.locator('[data-edit-action="lyrics-save"]').click();
    assert.ok(await page.evaluate(() => NP.LYRICS.length) > 10);
    assert.match(await page.evaluate(() => NP.previewLyricsText()), /星轨|Neri/);
    await page.evaluate(() => NP.player.pause());
  });
});
test('metadata fill uses the native NetEase and QQ sources with individual fill choices', async () => {
  await visit(async (page, phone, sheet) => {
    await sheet.locator('[data-edit-action="search"]').click();
    assert.equal(await sheet.locator('[data-edit-platform]').count(), 2);
    await sheet.locator('[data-edit-platform="qq"]').click();
    await sheet.locator('[data-action-field="keyword"]').fill('Paper');
    await sheet.locator('[data-edit-action="search-submit"]').click();
    await sheet.locator('[data-edit-result="paper-planets"]').click();
    assert.equal(await sheet.locator('[data-edit-fill]').count(), 4);
    await sheet.locator('[data-edit-fill="lyrics"]').uncheck();
    await sheet.locator('[data-edit-action="modal-apply"]').click();
    assert.match(await sheet.locator('[data-action-field="title"]').inputValue(), /纸上行星/);
    assert.match(await sheet.locator('[data-action-field="cover"]').inputValue(), /paper-planets\.jpg$/);
    assert.equal(await page.evaluate(() => (NP.previewTrack || {}).title || '星轨'), '星轨');
  });
});
test('restoring original and Startrail fill recover exact word timings while ordinary LRC edits remain line timed', async () => {
  await visit(async (page, phone, sheet) => {
    const original = await page.evaluate(() => JSON.parse(JSON.stringify(NP.LYRICS)));
    assert.ok(original.some(line => line.words.length > 1));
    const edit = async () => {
      await sheet.locator('[data-edit-action="lyrics"]').click();
      await sheet.locator('[data-action-lyrics]').fill('[00:01.00]Edited line\n[00:02.00]Another line');
      await sheet.locator('[data-edit-lyric-tab="1"]').click();
      await sheet.locator('[data-edit-action="lyrics-clear"]').click();
      await sheet.locator('[data-edit-action="lyrics-save"]').click();
      assert.deepEqual(await page.evaluate(() => NP.LYRICS.map(line => ({ t: line.t, count: line.words.length, text: line.words[0].text }))), [{ t: 1, count: 1, text: 'Edited line' }, { t: 2, count: 1, text: 'Another line' }]);
    };
    await edit();
    await sheet.locator('[data-edit-action="restore-all"]').click();
    await sheet.locator('[data-edit-action="save"]').click();
    await sheet.locator('[data-edit-action="save-preview"]').click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(NP.LYRICS))), original);
    await phone.locator('.msheet--more [data-i="1"]').click();
    await edit();
    await sheet.locator('[data-edit-action="search"]').click();
    await sheet.locator('[data-edit-result="startrail"]').click();
    await sheet.locator('[data-edit-action="modal-apply"]').click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(NP.LYRICS))), original);
  });
});
test('More and Edit exchange native 90ms exit and delayed 220ms enter without sliding the whole sheet', async () => {
  await visit(async (page, phone) => {
    const result = await phone.evaluate(ph => {
      const ui = NP.phoneUI.uis.find(ui => ui.ph === ph);
      ui.songEdit.chrome.querySelector('[data-edit-action="cancel"]').click();
      const outgoing = ph.querySelector('.np-edit-snapshot:last-of-type');
      const animation = ui.more.el.querySelector('.msheet__body').getAnimations().find(animation => animation.effect.getTiming().duration === 220);
      return { retained: ph.classList.contains('is-sheet'), current: ui.layers.open === ui.more, transform: getComputedStyle(ui.more.el).transform, inert: outgoing.inert, controls: outgoing.querySelectorAll('[data-edit-action],input[name],[id]').length, exit: outgoing.getAnimations()[0].effect.getTiming(), enter: animation.effect.getTiming(), frames: animation.effect.getKeyframes() };
    });
    assert.equal(result.retained, true);
    assert.equal(result.current, true);
    assert.equal(result.transform, 'none');
    assert.equal(result.inert, true);
    assert.equal(result.controls, 0);
    assert.equal(result.exit.duration, 90);
    assert.equal(result.enter.duration, 220);
    assert.equal(result.enter.delay, 90);
    assert.equal(result.frames[0].transform, 'scale(0.92)');
    await page.waitForFunction(() => !document.querySelector('#phPlay .np-edit-snapshot'));
  }, { reducedMotion: 'no-preference' });
});
test('rapid return and Escape close the active page without reopening a stale 160ms layer', async () => {
  await visit(async (page, phone) => {
    for (let i = 0; i < 3; i++) {
      const result = await phone.evaluate(ph => {
        const ui = NP.phoneUI.uis.find(ui => ui.ph === ph);
        ui.songEdit.chrome.querySelector('[data-edit-action="cancel"]').click();
        const focused = ui.more.el.contains(document.activeElement);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { focused, closed: ui.layers.open === null, marked: ph.classList.contains('is-sheet') };
      });
      assert.deepEqual(result, { focused: true, closed: true, marked: false });
      await page.waitForFunction(() => !document.querySelector('#phPlay .np-edit-snapshot'));
      if (i < 2) {
        await phone.locator('.pg-cover [data-ph-more]').evaluate(button => button.click());
        await page.waitForFunction(() => document.querySelector('#phPlay .msheet--more.is-open'));
        await phone.locator('.msheet--more [data-i="1"]').evaluate(button => button.click());
      }
    }
    await page.waitForTimeout(200);
    assert.equal(await phone.evaluate(ph => ph.classList.contains('is-sheet')), false);
    assert.equal(await phone.locator('.np-edit-snapshot').count(), 0);
  }, { reducedMotion: 'no-preference' });
});
for (const locale of ['zh', 'en']) for (const style of ['clean', 'material']) for (const width of [375, 1440]) for (const scale of [.6, 1.2]) {
  test('edit sheet bounds ' + [locale, style, width, scale].join('-'), async () => {
    await visit(async (page, phone, sheet) => {
      const geometry = await sheet.evaluate(el => {
        const phone = el.closest('.ph').getBoundingClientRect(), body = el.getBoundingClientRect(), cancel = el.querySelector('.np-edit-header button').getBoundingClientRect(), save = el.querySelector('.np-edit-actions').getBoundingClientRect(), fields = el.querySelector('.np-edit-body');
        return { contained: body.left >= phone.left - 1 && body.right <= phone.right + 1 && body.top >= phone.top && body.bottom <= phone.bottom + 1, buttons: cancel.top >= body.top && save.bottom <= body.bottom + 1, width: fields.clientWidth, scrollWidth: fields.scrollWidth, scale: Number(el.style.getPropertyValue('--np-edit-scale')) };
      });
      assert.equal(geometry.contained, true);
      assert.equal(geometry.buttons, true);
      assert.equal(geometry.scale, scale);
      assert.ok(geometry.scrollWidth <= geometry.width);
      assert.equal(await sheet.locator('[data-action-cover]:visible').count(), 0);
      const evidence = process.env.ARTIFACT_DIR;
      if (evidence) { mkdirSync(evidence, { recursive: true }); await phone.screenshot({ path: join(evidence, 'edit-' + [locale, style, width, scale].join('-') + '.png') }); }
    }, { locale, style, scale, viewport: { width, height: width === 375 ? 900 : 1100 }, hasTouch: width === 375, isMobile: width === 375 });
  });
}


test('invalid nonempty lyric drafts cannot silently clear the active lyrics', async () => {
  await visit(async (page, phone, sheet) => {
    const initial = await page.evaluate(() => JSON.stringify(NP.LYRICS));
    await sheet.locator('[data-edit-action="lyrics"]').click();
    await sheet.locator('[data-action-lyrics]').fill('invalid timestamped lyric');
    await sheet.locator('[data-edit-lyric-tab="1"]').click();
    await sheet.locator('[data-edit-action="lyrics-clear"]').click();
    await sheet.locator('[data-edit-action="lyrics-save"]').click();
    assert.equal(await page.evaluate(() => JSON.stringify(NP.LYRICS)), initial);
    assert.equal(await sheet.getAttribute('data-edit-view'), 'lyrics');
    assert.match(await sheet.locator('.np-edit-error').innerText(), /LRC/);
  });
});
