import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = new URL('../../', import.meta.url);
async function visit(run) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await page.route('**/__live', route => route.abort());
    await page.goto(process.env.SITE_URL || 'http://localhost:6060', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => NP.booted);
    await run(page);
  } finally { await browser.close(); }
}

test('gallery preserves the four supplied real device photos and never substitutes a simulated theme', async () => {
  const names = ['home', 'explore', 'library', 'settings'];
  const hashes = ['dd04965e09721607ec685cb86cd84a9151b4416a57312a793427f217be99e5db', '8c6a8e6a9db117d588472dbd19eb7d30ac90aef6ee347bff4402a4ba12c99e3c', '5d78d9fe13a1eabfcfa7f75405a3ca356cb98b4fd7b1c74a1a7ddb5b1bc8b317', '18ef6df587e9db3145824de524211c4bead5508080e3d40cfc254b5e7629e57f'];
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (let i = 0; i < names.length; i++) {
    const photo = await readFile(new URL('assets/img/shots/real-' + names[i] + '.jpg', root));
    assert.equal(hash(photo), hashes[i]);
  }
  await visit(async page => {
    const photos = page.locator('#shots [data-real-shot]');
    assert.equal(await photos.count(), 4);
    const before = await photos.evaluateAll(nodes => nodes.map(node => node.src));
    await page.evaluate(() => NP.themes.select('material'));
    assert.deepEqual(await photos.evaluateAll(nodes => nodes.map(node => node.src)), before);
    assert.match(await page.locator('#shots').innerText(), /真机/);
  });
});

test('the fixed DSP example cannot leave its page while its sound effect sections remain operable', async () => {
  await visit(async page => {
    const dsp = page.locator('#phDsp');
    await dsp.locator('[data-back]').evaluate(button => button.click());
    for (const i of [0, 1, 2]) await dsp.locator('.hm-nav>span').nth(i).evaluate(button => button.click());
    assert.equal(await page.locator('#deviceDsp .ap-embedded-host').count(), 0);
    assert.equal(await dsp.locator('[data-back]').isDisabled(), true);
    assert.equal(await dsp.locator('.hm-nav>[aria-disabled="true"]').count(), 4);
    await dsp.locator('.hm-mini__id').evaluate(element => element.click());
    await dsp.locator('.hm-mini').evaluate(element => element.focus());
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#deviceDsp .ap-embedded-host').count(), 0);
    assert.equal(await dsp.locator('.hm-mini').getAttribute('tabindex'), '-1');
    assert.equal(await dsp.locator('.hm-mini').getAttribute('role'), 'group');
    assert.equal(await dsp.evaluate(element => element.style.visibility), '');

    await dsp.locator('[data-tab="equalizer"]').click();
    assert.equal(await dsp.locator('[data-tab="equalizer"]').getAttribute('aria-selected'), 'true');
    await dsp.locator('[data-tab="presets"]').click();
    assert.equal(await dsp.locator('[data-tab="presets"]').getAttribute('aria-selected'), 'true');
  });
});

test('Home is a locked Material example with independent theme controls and an unobscured bottom bar', async () => {
  await visit(async page => {
    const home = page.locator('#phHome');
    assert.equal(await home.getAttribute('data-app-style'), 'material');
    for (const selector of ['.hm-top button', '.hm-card', '.hm-list li', '.hm-nav>span', '.hm-mini']) await home.locator(selector).first().evaluate(element => element.click());
    assert.equal(await page.locator('#deviceHome .ap-embedded-host').count(), 0);
    assert.equal(await page.evaluate(() => NP.player.playing), false);
    await page.locator('#lab [data-app-style="clean"]').click();
    assert.equal(await home.getAttribute('data-app-style'), 'clean');
    assert.equal(await home.locator('.hm-sec svg:visible').count(), 0);
    await page.locator('#lab [data-app-style="material"]').click();
    assert.equal(await home.getAttribute('data-app-style'), 'material');
    await home.scrollIntoViewIfNeeded();
    const geometry = await home.evaluate(ph => {
      const app = ph.querySelector('.hm-app'), nav = ph.querySelector('.hm-nav');
      const scale = ph.getBoundingClientRect().width / ph.offsetWidth;
      const overlay = parseFloat(getComputedStyle(ph, '::after').height) * scale;
      const edge = ph.getBoundingClientRect().bottom - overlay;
      return { navTop: nav.getBoundingClientRect().top, edge, labels: [...nav.querySelectorAll('small')].filter(el => getComputedStyle(el).display !== 'none').map(el => el.getBoundingClientRect().bottom), appBottom: app.getBoundingClientRect().bottom, screenBottom: ph.getBoundingClientRect().bottom };
    });
    assert.ok(geometry.labels.length > 0 && geometry.labels.every(bottom => bottom <= geometry.edge + 1), JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.appBottom - geometry.screenBottom) < 1);
  });
});
