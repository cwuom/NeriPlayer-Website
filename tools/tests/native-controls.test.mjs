import { enablePreviewInteractions } from './preview-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
async function visit(run, path = '') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__live', route => route.abort());
    await page.goto(new URL(path, (process.env.SITE_URL || 'http://localhost:6060').replace(/\/$/, '') + '/').href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { window.NP?.preparePreviews?.(); return NP.booted; });
    await enablePreviewInteractions(page, ['settings']);
    await run(page, page.locator('[data-app-preview="settings"]'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

test('Clean floating navigation centers every icon and label on the same baselines', async () => {
  await visit(async page => {
    await page.evaluate(() => NP.themes.selectLocal('phHome', 'clean'));
    for (const width of [1440, 390]) for (const scale of [.6, 1, 1.2]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.locator('#lab input[type="range"]').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, scale);
      for (const selector of ['#phHome .hm-nav', '[data-app-preview="settings"] .ap-nav']) {
        const metrics = await page.locator(selector).evaluate(nav => {
          const rows = [...nav.children].filter(el => el.matches('span,.ap-nav-item'));
          return rows.map(row => {
            const icon = row.querySelector('svg').getBoundingClientRect(), label = row.querySelector('small').getBoundingClientRect();
            const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
            ctx.fillStyle = getComputedStyle(row).color;ctx.fillRect(0, 0, 1, 1);
            return { selected: row.matches('.is-on,[aria-current="page"]'), alpha: ctx.getImageData(0, 0, 1, 1).data[3], iconY: icon.y, labelY: label.y, center: (icon.y + label.bottom) / 2, rowCenter: row.getBoundingClientRect().y + row.getBoundingClientRect().height / 2 };
          });
        });
        assert.equal(metrics.length, 4);
        for (const metric of metrics) {
          if (!metric.selected) assert.ok(Math.abs(metric.alpha - 184) <= 1, JSON.stringify(metric));
          assert.ok(Math.abs(metric.iconY - metrics[0].iconY) < .15, JSON.stringify({ width, scale, selector, metrics }));
          assert.ok(Math.abs(metric.labelY - metrics[0].labelY) < .15, JSON.stringify({ width, scale, selector, metrics }));
          assert.ok(Math.abs(metric.center - metric.rowCenter) < 1, JSON.stringify({ width, scale, selector, metrics }));
        }
      }
    }
  });
});

test('About uses native two-line list items with leading glyphs and no chevrons', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-setting="about"]').click();
    const content = host.locator('.as-about');
    assert.equal(await content.locator('.as-about-row').count(), 5);
    assert.equal(await content.locator('.ap-section-intro').count(), 0);
    const rows = await content.locator('.as-about-row').evaluateAll(nodes => nodes.map(el => ({ glyphs: el.querySelectorAll(':scope > svg').length, title: getComputedStyle(el.querySelector('b')).fontSize, line: getComputedStyle(el.querySelector('small')).lineHeight })));
    assert.ok(rows.every(row => row.glyphs === 1 && row.line === '20px'), JSON.stringify(rows));
    assert.deepEqual(rows.map(row => row.title), ['16.5px', '16.5px', '16.5px', '16.5px', '16px']);
    assert.equal(await content.locator('[data-as-action="about-build"] small').innerText(), '—');
    assert.equal(await content.locator('a>svg').evaluate(el => getComputedStyle(el).fill), 'rgb(242, 242, 245)');
  });
});

test('native playlist dialogs align equal neutral and filled action pills with readable disabled ink', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-nav="library"]').click();
    await host.locator('[data-ap-create]').click();
    const dialog = host.locator('[role="dialog"]');
    const metrics = await dialog.evaluate(el => {
      const buttons = [...el.querySelectorAll('.ap-dialog-actions button')];
      return { title: getComputedStyle(el.querySelector('h3')).fontSize, actions: buttons.map(button => ({ width: button.offsetWidth, height: button.offsetHeight, color: getComputedStyle(button).color, opacity: getComputedStyle(button).opacity, background: getComputedStyle(button).backgroundColor, top: button.offsetTop })) };
    });
    assert.equal(metrics.title, '20px');
    assert.equal(metrics.actions.length, 2);
    assert.ok(metrics.actions.every(button => button.height === 46 && button.opacity === '1'), JSON.stringify(metrics));
    assert.ok(Math.abs(metrics.actions[0].width - metrics.actions[1].width) <= 1);
    assert.equal(metrics.actions[0].top, metrics.actions[1].top);
    assert.equal(metrics.actions[1].color, 'rgb(173, 173, 181)');
    await dialog.locator('[data-al-name]').fill('A native playlist');
    assert.equal(await dialog.locator('[data-ap-extension-apply]').isEnabled(), true);
    const ink = await dialog.locator('[data-ap-extension-apply]').evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ap-on-accent)';
      el.append(probe);
      const result = { actual: getComputedStyle(el).color, expected: getComputedStyle(probe).color };
      probe.remove();
      return result;
    });
    assert.equal(ink.actual, ink.expected);
  });
});

test('removed non-native speaker preview and mini progress decorations stay absent', async () => {
  await visit(async page => {
    assert.equal(await page.locator('[data-scope-spk], [data-scope-tip]').count(), 0);
    assert.equal(await page.locator('.ap-mini-progress').count(), 0);
  });
});

test('simulated sessions and the login sheet use native spacing without extra footer controls', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-setting="accounts"]').click();
    assert.equal(await host.locator('.as-account[data-signed-in="true"]').count(), 3);
    await host.locator('[data-as-action="login-netease"]').click();
    const sheet = host.locator('.as-auth-dialog');
    assert.equal(await sheet.count(), 1);
    assert.equal(await sheet.locator('.ap-dialog-actions,.as-dialog-note').count(), 0);
    const geometry = await sheet.evaluate(el => ({ title: getComputedStyle(el.querySelector('h3')).fontSize, padding: getComputedStyle(el).paddingLeft, tabs: el.querySelector('.as-auth-tabs').offsetHeight, segments: [...el.querySelectorAll('.as-auth-tab')].map(button => button.offsetWidth), text: el.querySelector('.as-auth-subtitle').textContent }));
    assert.deepEqual({ title: geometry.title, padding: geometry.padding, tabs: geometry.tabs }, { title: '22px', padding: '20px', tabs: 36 });
    assert.ok(Math.abs(geometry.segments[0] - geometry.segments[1]) <= 1);
    await host.locator('[data-as-auth-method="cookie"]').click();
    await host.locator('[data-as-field="cookie"]').fill('local-demo-only');
    await host.locator('[data-as-auth-save]').click();
    assert.equal(await host.locator('[role="dialog"]').count(), 0);
    assert.equal(await page.evaluate(() => NP.demoData.account('netease').signedIn), true);
  });
});

test('Clean alert entrance uses the native scale spring and independent linear fade', async () => {
  await visit(async (page, host) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await host.locator('[data-ap-nav="library"]').click();
    const frames = await host.locator('[data-ap-create]').evaluate(button => {
      button.click();
      const dialog = document.querySelector('[data-app-preview="settings"] .ap-dialog');
      return dialog.getAnimations().map(animation => ({ timing: animation.effect.getTiming(), frames: animation.effect.getKeyframes() }));
    });
    const scale = frames.find(animation => animation.frames[0].transform);
    const fade = frames.find(animation => animation.frames[0].opacity === '0');
    assert.ok(scale && fade);
    assert.equal(scale.frames[0].transform, 'scale(1.06)');
    assert.equal(scale.timing.duration, 107);
    assert.equal(scale.timing.easing, 'linear');
    assert.equal(fade.timing.duration, 140);
    assert.equal(fade.timing.easing, 'linear');
  });
});

test('playlist popup keeps native menu geometry and hides dialog footer actions', async () => {
  await visit(async (page, host) => {
    await host.locator('[data-ap-nav="library"]').click();
    await host.locator('[data-al-menu="sample"]').click();
    const menu = host.locator('.ap-dialog:has(.al-menu-options)');
    const geometry = await menu.evaluate(el => ({ padding: getComputedStyle(el).padding, radius: getComputedStyle(el).borderRadius, visibleActions: [...el.querySelectorAll('.ap-dialog-actions button')].filter(button => button.checkVisibility()).length }));
    assert.deepEqual(geometry, { padding: '8px 0px', radius: '14px', visibleActions: 0 });
  });
});

test('long English dialog actions stack at full width with confirm first', async () => {
  await visit(async (page, host) => {
    await page.locator('#lab input[type="range"]').evaluate(el => { el.value = '1.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await host.locator('[data-ap-setting="backup"]').click();
    await host.locator('[data-as-action="webdav-config"]').click();
    const positions = await host.locator('.ap-dialog-actions button').evaluateAll(buttons => buttons.map(button => ({ apply: button.hasAttribute('data-ap-extension-apply'), width: button.offsetWidth, height: button.offsetHeight, top: button.offsetTop, line: getComputedStyle(button).whiteSpace })));
    const confirm = positions.find(button => button.apply), cancel = positions.find(button => !button.apply);
    assert.ok(confirm.top < cancel.top, JSON.stringify(positions));
    assert.equal(confirm.height, 46);
    assert.equal(cancel.height, 46);
    assert.equal(confirm.width, cancel.width);
    assert.equal(cancel.top - confirm.top - confirm.height, 8);
  }, 'en/');
});


test('blank Cookie input retains the sheet and leaves simulated login state unchanged', async () => {
  await visit(async (page, host) => {
    await page.evaluate(() => NP.demoData.setAccount('youtube', false));
    await host.locator('[data-ap-setting="accounts"]').click();
    await host.locator('[data-as-action="login-youtube"]').click();
    await host.locator('[data-as-auth-method="cookie"]').click();
    await host.locator('[data-as-field="cookie"]').fill('   ');
    await host.locator('[data-as-auth-save]').click();
    assert.equal(await page.evaluate(() => NP.demoData.account('youtube').signedIn), false);
    assert.match(await host.locator('.as-auth-status').innerText(), /Cookie 为空/);
    assert.equal(await host.locator('.as-auth-dialog').count(), 1);
    await host.locator('[data-as-auth-dismiss]').click();
    assert.equal(await host.locator('.as-auth-status').innerText(), '');
  });
});
