import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { buildCriticalCss, extractCriticalCss } from '../build-critical-css.mjs';

const root = new URL('../../', import.meta.url);

function points(range) {
  return new Set(range.split(',').flatMap(part => {
    const match = /^\s*U\+([\da-f]+)(?:-([\da-f]+))?\s*$/i.exec(part);
    assert.ok(match, 'invalid unicode range: ' + part);
    const first = parseInt(match[1], 16), last = parseInt(match[2] || match[1], 16);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }));
}

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

test('every emitted MiSans subset exists and reduces the matching source shard', async t => {
  const css = await buildCriticalCss();
  const original = await readFile(new URL('assets/css/desktop-fonts.css', root), 'utf8');
  const faces = [...css.matchAll(/@font-face\{font-family:"MiSans Critical";src:url\("\.\.\/fonts\/misans-400-shell-critical\/(\d+)\.woff2"\)[^}]*unicode-range:([^}]+)\}/g)];
  assert.ok(faces.length > 0, 'first-screen CJK must use actual generated subsets');
  let before = 0, after = 0;
  for (const [, shard, range] of faces) {
    const source = original.split('\n').find(line => line.includes('misans-400/' + shard + '.woff2'));
    assert.ok(source, 'critical face must retain an existing source shard');
    const originalPoints = points(/unicode-range:\s*([^;]+)/.exec(source)[1]);
    for (const point of points(range)) assert.ok(originalPoints.has(point), 'critical range must not invent a glyph');
    const sourceFile = new URL('assets/fonts/misans-400/' + shard + '.woff2', root);
    const subsetFile = new URL('assets/fonts/misans-400-shell-critical/' + shard + '.woff2', root);
    const [sourceInfo, subsetInfo] = await Promise.all([stat(sourceFile), stat(subsetFile)]);
    assert.ok(subsetInfo.size <= sourceInfo.size, 'critical subset must not grow the source shard');
    before += sourceInfo.size;
    after += subsetInfo.size;
  }
  assert.ok(after < before * .3, 'first-screen CJK keeps the same glyphs with at least seventy percent less font data');
  t.diagnostic(JSON.stringify({ shards: faces.length, sourceBytes: before, criticalBytes: after, savedBytes: before - after }));
});

test('Chinese preloads match its immutable critical CJK faces while English skips unnecessary CJK preloads', async () => {
  const css = await buildCriticalCss();
  for (const path of ['index.html', 'en/index.html']) {
    const html = await readFile(new URL(path, root), 'utf8');
    const preloads = [...html.matchAll(/<link\b[^>]*href="([^" ]+)"[^>]*\bdata-hero-cjk\b[^>]*>/g)];
    assert.equal(preloads.length, path === 'index.html' ? 4 : 0);
    for (const [, href] of preloads) {
      const font = href.slice(href.indexOf('fonts/'));
      assert.ok(css.includes(font), path + ': ' + href + ' must match an emitted face');
      assert.ok(html.includes(font), 'the inline entry and preload must use the same immutable URL');
    }
  }
});
