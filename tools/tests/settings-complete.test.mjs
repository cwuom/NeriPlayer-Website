import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const executablePath = process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
async function visit(path, run) {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    await page.route('**/__live', r => r.abort());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.SITE_URL || 'http://localhost:6060') + path);
    await page.waitForFunction(() => window.NP?.booted);
    await enablePreviewInteractions(page, ['settings']);
    assert.equal(await page.evaluate(() => typeof NP.previewSettings), 'object');
    await run(page, page.locator('[data-app-preview="settings"]'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
test('all source settings root groups navigate to complete interactive pages in both languages', async () => {
  for (const lang of ['/', '/en/']) await visit(lang, async (page, host) => {
    assert.equal(await page.evaluate(() => NP.previewSettings.entries().length), 22);
    for (const entry of await page.evaluate(() => NP.previewSettings.entries().filter(e => e.key !== 'audio'))) {
      await host.locator('[data-ap-setting="' + entry.key + '"]').click();
      assert.ok((await host.locator('.ap-settings-content').innerText()).trim().length > 0, entry.key);
      assert.ok(await host.locator('[data-as-key], [data-as-action], [data-ap-style]').count(), entry.key);
      await host.locator('[data-ap-back]').click();
    }
  });
});
test('blur controls preserve values and enforce native Clean and background dependencies', async () => {
  await visit('/', async (page, host) => {
    await host.locator('[data-ap-setting="motion"]').click();
    await host.locator('[data-as-toggle="advanced_blur_enabled"]').click();
    assert.equal(await host.locator('[data-as-range="enhanced_advanced_blur_radius_dp"]').count(), 0);
    await host.locator('[data-as-toggle="advanced_blur_enabled"]').click();
    await host.locator('[data-as-range="enhanced_advanced_blur_radius_dp"]').fill('64');
    assert.equal(await page.evaluate(() => NP.previewSettings.value('enhanced_advanced_blur_radius_dp')), 64);
    await host.locator('[data-as-toggle="nowplaying_cover_blur_background_enabled"]').click();
    assert.equal(await host.locator('[data-as-toggle="nowplaying_dynamic_background_enabled"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => NP.previewSettings.value('nowplaying_audio_reactive_enabled')), false);
  });
});
test('native switch springs and dependent fields animate without replaying unrelated controls', async () => {
  await visit('/', async (page, host) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await host.locator('[data-ap-setting="motion"]').click();
    const control = host.locator('[data-as-toggle="advanced_blur_enabled"]');
    const spring = await control.evaluate(el => {
      const before = el.getAttribute('aria-checked') === 'true';
      el.click();
      const next = document.querySelector('[data-app-preview="settings"] [data-as-toggle="advanced_blur_enabled"]');
      const animation = next.querySelector('.as-switch i').getAnimations()[0];
      animation.pause();
      const frames = animation.effect.getKeyframes();
      animation.currentTime = animation.effect.getTiming().duration;
      return { before, duration: animation.effect.getTiming().duration, frames, settled: getComputedStyle(next.querySelector('.as-switch i')).width };
    });
    assert.equal(spring.duration, 350);
    assert.equal(spring.frames.length, 61);
    assert.equal(spring.frames[0].width, spring.before ? '24px' : '16px');
    assert.equal(spring.settled, spring.before ? '16px' : '24px');
    const expansion = await control.evaluate(el => {
      const host = el.closest('[data-app-preview]');
      const existing = new Set(Array.from(host.querySelectorAll('[data-as-range]')).map(input => input.dataset.asRange));
      el.click();
      const added = host.querySelector('[data-as-range="enhanced_advanced_blur_radius_dp"]').closest('[data-as-key]');
      return {
        durations: added.getAnimations().map(animation => animation.effect.getTiming().duration).sort(),
        unrelated: Array.from(host.querySelectorAll('[data-as-range]')).filter(input => existing.has(input.dataset.asRange)).reduce((sum, input) => sum + input.closest('[data-as-key]').getAnimations().length, 0)
      };
    });
    assert.deepEqual(expansion.durations, [180, 240]);
    assert.equal(expansion.unrelated, 0);
  });
});
test('dependent controls stay inert in the DOM until native fade and shrink exit animations finish', async () => {
  await visit('/', async (page, host) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const style of ['clean', 'material']) {
      await page.evaluate(value => NP.themes.select(value), style);
      await host.locator('[data-ap-setting="motion"]').click();
      const result = await host.locator('[data-as-toggle="advanced_blur_enabled"]').evaluate(async el => {
        const host = el.closest('[data-app-preview]');
        el.click();
        const wrapper = host.querySelector('[data-as-leaving~="enhanced_advanced_blur_radius_dp"]');
        const animations = wrapper.getAnimations();
        const fade = animations.find(animation => animation.effect.getTiming().duration === 120);
        const shrink = animations.find(animation => animation.effect.getTiming().duration === 200);
        animations.forEach(animation => animation.pause());
        shrink.currentTime = 0;
        const fullHeight = wrapper.offsetHeight;
        fade.currentTime = 60;
        shrink.currentTime = 100;
        const middle = { opacity: Number(getComputedStyle(wrapper).opacity), height: wrapper.offsetHeight };
        fade.currentTime = 120;
        shrink.currentTime = 150;
        wrapper.querySelector('input').focus();
        const retained = {
          inert: wrapper.inert,
          hidden: wrapper.getAttribute('aria-hidden'),
          opacity: Number(getComputedStyle(wrapper).opacity),
          height: wrapper.offsetHeight,
          focusExcluded: !wrapper.contains(document.activeElement),
          activeCopies: host.querySelectorAll('[data-as-range="enhanced_advanced_blur_radius_dp"]').length,
          stripped: Array.from(wrapper.querySelectorAll('*')).every(node => Array.from(node.attributes).every(attribute => !/^(data-|id$|name$)/.test(attribute.name)))
        };
        const timings = animations.map(animation => ({ duration: animation.effect.getTiming().duration, easing: animation.effect.getTiming().easing }));
        animations.forEach(animation => { animation.currentTime = 0; animation.play(); });
        await Promise.all(Array.from(host.querySelectorAll('[data-as-leaving]')).flatMap(node => node.getAnimations().filter(animation => animation.effect.getTiming().duration === 200).map(animation => animation.finished)));
        return { fullHeight, middle, retained, timings, removed: !wrapper.isConnected, remaining: host.querySelectorAll('[data-as-leaving]').length };
      });
      assert.deepEqual(result.timings.map(timing => timing.duration).sort(), [120, 200]);
      assert.ok(result.timings.every(timing => timing.easing === 'cubic-bezier(0.4, 0, 0.2, 1)'));
      assert.ok(result.middle.opacity > 0 && result.middle.opacity < 1);
      assert.ok(result.middle.height > 0 && result.middle.height < result.fullHeight);
      assert.deepEqual({ ...result.retained, height: result.retained.height > 0 }, { inert: true, hidden: 'true', opacity: 0, height: true, focusExcluded: true, activeCopies: 0, stripped: true });
      assert.equal(result.removed, true);
      assert.equal(result.remaining, 0);
      await host.locator('[data-as-toggle="advanced_blur_enabled"]').click();
      await host.locator('[data-ap-back]').click();
    }
  });
});
test('settings choice dialogs commit state, cancel safely and search subitems', async () => {
  await visit('/en/', async (page, host) => {
    await host.locator('[data-ap-setting="downloads"]').click();
    await host.locator('[data-as-range="download_parallelism"]').fill('8');
    assert.equal(await page.evaluate(() => NP.previewSettings.value('download_parallelism')), 8);
    await host.locator('[data-ap-back]').click();
    await host.locator('[data-ap-search]').fill('blur radius');
    assert.ok(await host.locator('[data-ap-search-setting="motion"]').count());
  });
});

test('source switches and sliders retain independent state across navigation in both themes', async () => {
  await visit('/', async (page, host) => {
    let switchChecks = 0, sliderChecks = 0;
    for (const style of ['clean', 'material']) {
      await page.evaluate(s => NP.themes.select(s), style);
      for (const key of ['general', 'playback', 'quality', 'theme', 'nowplaying', 'personalization', 'motion', 'lyrics', 'external', 'downloads', 'usb', 'network', 'traffic', 'backup']) {
        await host.locator('[data-ap-setting="' + key + '"]').click();
        const switches = await host.locator('[data-as-toggle]:not(:disabled)').evaluateAll(els => els.map(el => el.dataset.asToggle));
        for (const setting of switches) {
          const control = host.locator('[data-as-toggle="' + setting + '"]');
          if (!(await control.count()) || await control.isDisabled()) continue;
          const original = await page.evaluate(k => NP.previewSettings.value(k), setting);
          await control.click();
          assert.equal(await page.evaluate(k => NP.previewSettings.value(k), setting), !original, setting);
          if (await host.locator('[role="dialog"]').count()) await host.locator('[data-ap-extension-apply]').click();
          await host.locator('[data-as-toggle="' + setting + '"]').click();
          assert.equal(await page.evaluate(k => NP.previewSettings.value(k), setting), original, setting);
          switchChecks++;
        }
        const sliders = await host.locator('[data-as-range]').evaluateAll(els => els.map(el => ({ key: el.dataset.asRange, min: el.min, max: el.max, value: el.value })));
        for (const slider of sliders) {
          const control = host.locator('[data-as-range="' + slider.key + '"]');
          await control.fill(slider.max);
          assert.equal(await control.inputValue(), slider.max, slider.key);
          await control.fill(slider.min);
          assert.equal(await control.inputValue(), slider.min, slider.key);
          await control.fill(slider.value);
          sliderChecks++;
        }
        await host.locator('[data-ap-back]').click();
      }
    }
    assert.ok(switchChecks >= 120, 'must exercise source switches, not just the page titles: ' + switchChecks);
    assert.ok(sliderChecks >= 35, 'must exercise slider endpoints: ' + sliderChecks);
  });
});

test('platform auth, sync configuration and native storage dialogs expose actual fields without sending credentials', async () => {
  await visit('/en/', async (page, host) => {
    const outbound = [];
    await page.route('https://**/*', route => { outbound.push(route.request().url()); return route.abort(); });
    await host.locator('[data-ap-setting="accounts"]').click();
    for (const provider of ['netease', 'bilibili', 'youtube']) {
      await host.locator('[data-as-action="login-' + provider + '"]').click();
      await host.locator('[data-as-auth-method="cookie"]').click();
      await host.locator('[data-as-field="cookie"]').fill('demo-cookie');
      await page.keyboard.press('Escape');
      assert.equal(await host.locator('[role="dialog"]').count(), 0);
    }
    await host.locator('[data-ap-back]').click();
    await host.locator('[data-ap-setting="backup"]').click();
    await host.locator('[data-as-action="webdav-config"]').click();
    await host.locator('[data-as-field="url"]').fill('invalid');
    await host.locator('[data-ap-extension-apply]').click();
    assert.equal(await host.locator('[role="dialog"]').count(), 1, 'invalid URL must not commit');
    await host.locator('[data-as-field="url"]').fill('https://example.com/dav');
    await host.locator('[data-as-field="username"]').fill('preview');
    await host.locator('[data-as-field="password"]').fill('not-a-real-password');
    await host.locator('[data-ap-extension-apply]').click();
    assert.equal(await host.locator('[role="dialog"]').count(), 0);
    assert.equal(await page.evaluate(() => NP.previewSettings.value('webdav_password')), undefined);
    await host.locator('[data-ap-back]').click();
    await host.locator('[data-ap-setting="storage"]').click();
    await host.locator('[data-as-choice="download_file_name_template"]').click();
    await host.locator('[data-as-field="template"]').fill('%artist% - %title%');
    assert.match(await host.locator('[data-as-filename-preview]').innerText(), /Neri Line - Startrail/);
    await host.locator('[data-ap-extension-apply]').click();
    assert.equal(await page.evaluate(() => NP.previewSettings.value('download_file_name_template')), '%artist% - %title%');
    assert.deepEqual(outbound, [], 'auth and sync forms must not leak their contents');
  });
});

test('config protection follows the native PBKDF2 and AES-GCM envelope and restores local preview state', async () => {
  const { readFile } = await import('node:fs/promises');
  const { pbkdf2Sync, createDecipheriv } = await import('node:crypto');
  await visit('/en/', async (page, host) => {
    await host.locator('[data-ap-setting="backup"]').click();
    await host.locator('[data-as-action="config-export"]').click();
    assert.equal(await host.locator('[data-as-export-option="login"]').isChecked(), false);
    await host.locator('[data-as-export-option="encrypt"]').check();
    await host.locator('[data-as-field="password"]').fill('fixture passphrase');
    await host.locator('[data-as-field="confirmation"]').fill('fixture passphrase');
    const downloadEvent = page.waitForEvent('download');
    await host.locator('[data-ap-extension-apply]').click();
    const download = await downloadEvent;
    const bytes = await readFile(await download.path());
    const envelope = JSON.parse(bytes.toString());
    assert.equal(envelope.iterations, 600000);
    assert.equal(envelope.cipher, 'AES-256-GCM');
    assert.ok(!bytes.toString().includes('fixture passphrase'));
    const key = pbkdf2Sync('fixture passphrase', Buffer.from(envelope.salt, 'base64'), 600000, 32, 'sha256');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(envelope.kind + '|1|PBKDF2-HMAC-SHA256|600000|AES-256-GCM'));
    decipher.setAuthTag(ciphertext.subarray(-16));
    const data = JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString());
    key.fill(0);
    assert.equal(data.format, 'neriplayer-site-preview');
    assert.equal(data.settings.haptic_feedback_enabled, true);
    assert.equal(data.settings.webdav_password, undefined);
    await host.locator('[data-ap-back]').click();
    await host.locator('[data-ap-setting="general"]').click();
    await host.locator('[data-as-toggle="haptic_feedback_enabled"]').click();
    await host.locator('[data-ap-back]').click();
    await host.locator('[data-ap-setting="backup"]').click();
    await host.locator('[data-as-action="config-import"]').click();
    await host.locator('[data-as-import]').setInputFiles({ name: 'config.json', mimeType: 'application/json', buffer: bytes });
    await host.locator('[data-ap-extension-apply]').click();
    await host.locator('[data-as-field="import-password"]').fill('fixture passphrase');
    await host.locator('[data-ap-extension-apply]').click();
    await page.waitForFunction(() => NP.previewSettings.value('haptic_feedback_enabled') === true);
    assert.equal(await host.locator('[role="dialog"]').count(), 0);
  });
});
