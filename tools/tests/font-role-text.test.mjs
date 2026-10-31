import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dynamicHandStrings, scriptStrings } from '../font-role-text.mjs';

const root = new URL('../../', import.meta.url);

test('only text assigned to handwritten UI roles extends the handwritten font', async () => {
  const phone = await readFile(new URL('assets/js/phone.js', root), 'utf8');
  const demos = await readFile(new URL('assets/js/demos.js', root), 'utf8');
  const app = await readFile(new URL('assets/js/app-settings.js', root), 'utf8');
  const hand = [...dynamicHandStrings('phone.js', phone), ...dynamicHandStrings('demos.js', demos)].join('');
  for (const text of ['取消静音', '静音', '连续点击 7 次试试', '你已处于开发者模式', ' 次即可进入开发者模式']) assert.ok(hand.includes(text), text);
  assert.doesNotMatch(hand, /音效链|截图加载中|Debug 页已出现在底栏/);
  assert.deepEqual(dynamicHandStrings('app-settings.js', app), [], 'Android settings use NP Roboto, rather than the handwritten website family');
  assert.ok(scriptStrings(app).some(value => value.includes('扬声器')), 'native UI strings must remain available to the separate native font collection');
});

test('a moved handwritten role must fail collection instead of silently losing its dynamic text', () => {
  assert.throws(() => dynamicHandStrings('phone.js', ''), /must remain identifiable/);
  assert.throws(() => dynamicHandStrings('demos.js', ''), /must remain identifiable/);
});
