import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
async function visit(run, reducedMotion = 'no-preference') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, reducedMotion });
    await page.route('**/__live', route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.SITE_URL || 'http://localhost:6060') + '/');
    await page.waitForFunction(() => window.NP?.booted);
    await enablePreviewInteractions(page, ['settings']);
    await page.evaluate(() => document.fonts.ready);
    const host = page.locator('[data-app-preview="settings"]');
    await run(page, host);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
test('mode switching retains the old phone outside the growing dark reveal and collapses it for light', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-mode-toggle]').evaluate(button => button.click());
    assert.equal(await host.locator('[data-ap-theme-reveal]').count(), 1, 'old phone must remain while the new light theme is revealed');
    const reverse = await host.locator('[data-ap-theme-reveal]').evaluate(layer => ({ inert: layer.inert, mode: layer.dataset.mode, reverse: layer.dataset.reverse, controls: layer.querySelectorAll('[data-ap-mode-toggle],[data-as-toggle],input[name],[id]').length }));
    assert.equal(reverse.inert, true);
    assert.equal(reverse.mode, 'dark');
    assert.equal(reverse.reverse, 'true');
    assert.equal(reverse.controls, 0);
    await page.waitForFunction(() => !document.querySelector('[data-ap-theme-reveal]'));
    await host.locator('[data-ap-mode-toggle]').evaluate(button => button.click());
    const forward = host.locator('[data-ap-theme-reveal]');
    assert.equal(await forward.getAttribute('data-reverse'), 'false');
    const radii = [];
    for (let i = 0; i < 4; i++) { radii.push(await forward.evaluate(layer => Number(layer.style.getPropertyValue('--at-radius')))); await page.waitForTimeout(65); }
    assert.ok(radii[0] > 0 && radii[1] > radii[0] && radii[2] > radii[1] && radii[3] > radii[2]);
    await page.waitForFunction(() => !document.querySelector('[data-ap-theme-reveal]'));
    assert.equal(await host.locator(':scope > .app-preview').getAttribute('data-mode'), 'dark');
  });
});
test('sun and moon layers cross rotate and scale while duplicate mode requests leave playback and focus intact', async () => {
  await visit(async (page, host) => {
    await page.evaluate(() => NP.player.seek(31.25));
    await host.locator('.ap-scroll').evaluate(scroll => { scroll.scrollTop = 450; });
    await host.locator('[data-ap-mode-toggle]').focus();
    const result = await host.locator('[data-ap-mode-toggle]').evaluate(button => {
      const host = button.closest('[data-app-preview]');
      const time = NP.player.t;
      const scroll = host.querySelector('.ap-scroll').scrollTop;
      button.click();
      const next = host.querySelector(':scope > .app-preview [data-ap-mode-toggle]');
      const icons = Array.from(next.querySelectorAll('[data-at-icon]')).map(icon => ({ name: icon.dataset.atIcon, timing: icon.getAnimations()[0].effect.getTiming(), frames: icon.getAnimations()[0].effect.getKeyframes() }));
      const mode = host.querySelector(':scope > .app-preview').dataset.mode;
      next.click();
      return { icons, mode, after: host.querySelector(':scope > .app-preview').dataset.mode, time, afterTime: NP.player.t, scroll, afterScroll: host.querySelector(':scope > .app-preview .ap-scroll').scrollTop, oldScroll: host.querySelector('[data-ap-theme-reveal] .ap-scroll').scrollTop, focused: next === document.activeElement, snapshots: host.querySelectorAll('[data-ap-theme-reveal]').length };
    });
    assert.equal(result.icons.length, 2);
    assert.ok(result.icons.every(icon => icon.timing.duration === 620));
    assert.ok(result.icons.every(icon => icon.frames.some(frame => /56/.test(frame.transform))));
    assert.equal(result.after, result.mode);
    assert.equal(result.time, result.afterTime);
    assert.equal(result.time, 31.25);
    assert.ok(result.scroll > 0);
    assert.equal(result.afterScroll, result.scroll);
    assert.equal(result.oldScroll, result.scroll);
    assert.equal(result.focused, true);
    assert.equal(result.snapshots, 1);
  });
});
test('navigation and resizing interrupt theme capture without stale overlays or sibling phone coverage', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-mode-toggle]').evaluate(button => button.click());
    const containment = await host.locator('[data-ap-theme-reveal]').evaluate(layer => {
      const root = layer.closest('[data-app-preview]').getBoundingClientRect(), box = layer.getBoundingClientRect();
      return box.left >= root.left && box.top >= root.top && box.right <= root.right && box.bottom <= root.bottom;
    });
    assert.equal(containment, true);
    await host.locator('[data-ap-nav="library"]').evaluate(button => button.click());
    assert.equal(await host.locator('[data-ap-theme-reveal]').count(), 0);
    await host.locator('[data-ap-nav="settings"]').click();
    await host.locator('[data-ap-mode-toggle]').evaluate(button => button.click());
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.waitForFunction(() => !document.querySelector('[data-ap-theme-reveal]'));
    assert.equal(await host.locator('[data-ap-mode-toggle]').count(), 1);
  });
});
test('reduced motion commits the new theme directly without capture layers', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-mode-toggle]').evaluate(button => button.click());
    assert.equal(await host.locator(':scope > .app-preview').getAttribute('data-mode'), 'light');
    assert.equal(await host.locator('[data-ap-theme-reveal]').count(), 0);
    assert.equal(await host.locator('[data-at-icon]').evaluateAll(icons => icons.reduce((sum, icon) => sum + icon.getAnimations().length, 0)), 0);
  }, 'reduce');
});
test('a stalled frame pauses the reveal instead of jumping ahead and the watchdog releases its capture', async () => {
  await visit(async (page, host) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await host.locator('[data-ap-mode-toggle]').evaluate(button => button.click());
    await page.clock.runFor(32);
    const initial = await host.locator('[data-ap-theme-reveal]').evaluate(layer => Number(layer.style.getPropertyValue('--at-radius')));
    await page.clock.fastForward(1000);
    assert.equal(await host.locator('[data-ap-theme-reveal]').count(), 1, 'a single delayed frame may advance only 40ms');
    const after = await host.locator('[data-ap-theme-reveal]').evaluate(layer => Number(layer.style.getPropertyValue('--at-radius')));
    assert.ok(after < initial && after > initial * .8);
    await page.clock.fastForward(4500);
    assert.equal(await host.locator('[data-ap-theme-reveal]').count(), 0);
    assert.equal(await host.getAttribute('data-at-switching'), null);
  });
});
