import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { buildCriticalCss, extractCriticalCss } from '../build-critical-css.mjs';

const root = new URL('../../', import.meta.url);

test('critical MiSans faces preserve shard boundaries and contain only requested characters', () => {
  const fallbackCss = `
    @font-face { font-family: "MiSans"; src: url("../fonts/misans-400/15.woff2") format("woff2"); font-weight: 400; font-display: swap; unicode-range: U+4E00-4E03; }
    @font-face { font-family: "MiSans"; src: url("../fonts/misans-400/17.woff2") format("woff2"); font-weight: 400; font-display: swap; unicode-range: U+4E04; }
    @font-face { font-family: "MiSans"; src: url("../fonts/misans-500.woff2") format("woff2"); font-weight: 500; font-display: swap; }
  `;
  const css = extractCriticalCss([], { fallbackCss, characters: new Set([0x4e00, 0x4e02, 0x9999]) });
  assert.match(css, /url\("\.\.\/fonts\/misans-400-shell-critical\/15\.woff2"\)/);
  assert.match(css, /font-display:swap;unicode-range:U\+4E00,U\+4E02/);
  assert.equal(/font-weight:([^;]+)/.exec(css)?.[1] || '400', '400', 'omitting the normal descriptor must preserve CSS default weight 400');
  assert.doesNotMatch(css, /17\.woff2|misans-500|U\+9999/);
});

test('unsupported MiSans fallback sources are rejected before emitting an unbuilt font URL', () => {
  const fallbackCss = '@font-face { font-family: "MiSans"; src: url("../fonts/unknown.woff2"); font-weight: 400; unicode-range: U+4E00; }';
  assert.throws(() => extractCriticalCss([], { fallbackCss, characters: new Set([0x4e00]) }), /existing source shard/);
});

test('an existing complete critical face bypasses legacy shard generation', () => {
  const base = '@font-face { font-family: "MiSans Critical"; src: url("../fonts/misans-400-0123456789ab-critical.woff2"); font-weight: 400; font-display: swap; }';
  const fallbackCss = '@font-face { font-family: "MiSans"; src: url("../fonts/misans-400-0123456789ab.woff2"); font-weight: 400; font-display: swap; }';
  const css = extractCriticalCss([base], { fallbackCss, characters: new Set([0x4e00]) });
  assert.equal([...css.matchAll(/font-family:"MiSans Critical"/g)].length, 1);
  assert.ok(css.includes('misans-400-0123456789ab-critical.woff2'));
  assert.doesNotMatch(css, /shell-critical/);
});

test('the single emitted MiSans critical face exists and reduces its complete source', async t => {
  const css = await buildCriticalCss();
  const original = await readFile(new URL('assets/css/desktop-fonts.css', root), 'utf8');
  const faces = [...css.matchAll(/@font-face\{font-family:"MiSans Critical";src:url\("\.\.\/fonts\/(misans-400-[a-f0-9]{12}-critical\.woff2)"\)[^}]*\}/g)];
  assert.equal(faces.length, 1, 'all first-screen CJK must be covered by one generated font');
  const source = original.split('\n').find(line => /font-weight: 400;/.test(line) && line.includes('font-family: "MiSans"'));
  assert.ok(source, 'the complete real 400 source must remain registered');
  const sourceName = /url\("\.\.\/fonts\/([^" ]+)"\)/.exec(source)[1];
  const [sourceInfo, subsetInfo] = await Promise.all([stat(new URL('assets/fonts/' + sourceName, root)), stat(new URL('assets/fonts/' + faces[0][1], root))]);
  const before = sourceInfo.size, after = subsetInfo.size;
  assert.ok(after < before * .3, 'first-screen CJK keeps the same glyphs with at least seventy percent less font data');
  t.diagnostic(JSON.stringify({ requests: faces.length, sourceBytes: before, criticalBytes: after, savedBytes: before - after }));
});

test('Chinese preloads match its immutable critical CJK faces while English skips unnecessary CJK preloads', async () => {
  const css = await buildCriticalCss();
  for (const path of ['index.html', 'en/index.html']) {
    const html = await readFile(new URL(path, root), 'utf8');
    const preloads = [...html.matchAll(/<link\b[^>]*href="([^" ]+)"[^>]*\bdata-hero-cjk\b[^>]*>/g)];
    assert.equal(preloads.length, path === 'index.html' ? 1 : 0);
    for (const [, href] of preloads) {
      const font = href.slice(href.indexOf('fonts/'));
      assert.ok(css.includes(font), path + ': ' + href + ' must match an emitted face');
      assert.ok(html.includes(font), 'the inline entry and preload must use the same immutable URL');
    }
  }
});
