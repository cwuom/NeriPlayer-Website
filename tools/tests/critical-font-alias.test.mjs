import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { buildCriticalCss } from '../build-critical-css.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('fixed first-screen roles use complete-run aliases while the shared font stacks stay unchanged', async () => {
  const css = await read('assets/css/base.css');
  assert.match(css, /--serif: "Fraunces", "NP Serif"/);
  assert.match(css, /--hand: "Caveat", "NP Hand"/);
  assert.match(css, /body \{\s*--serif: "Fraunces Critical", "NP Serif Critical"/);
  assert.match(css, /--hand: "Caveat Critical", "NP Hand Critical"/);
  assert.match(css, /\.menu__list i \{[^}]*font-family: var\(--mono\)/);
  assert.match(css, /\.menu__list small \{[^}]*font-family: var\(--mono\)/);
  const generated = await buildCriticalCss();
  for (const family of ['Fraunces Critical', 'Caveat Critical']) assert.ok(generated.includes('font-family:"' + family + '"'), 'critical CSS must retain the alias font');
});

test('deferred Latin families keep their complete ASCII runs instead of a character complement', async () => {
  const css = await read('assets/css/content-fonts.css');
  const faces = [...css.matchAll(/@font-face \{ font-family: "(Fraunces|Caveat)";[^\n]+\}/g)];
  assert.equal(faces.length, 3, 'normal, italic and handwritten content faces must remain available');
  for (const [face] of faces) {
    assert.match(face, /unicode-range: U\+0020-007E[,;]/);
    assert.doesNotMatch(face, /-critical\.woff2/);
  }
  const base = await read('assets/css/base.css');
  const paths = ['fraunces', 'caveat'].map(name => new RegExp('url\\("\\.\\./fonts/(' + name + '-[a-f0-9]{12}-critical\\.woff2)"\\)').exec(base)?.[1]);
  assert.ok(paths.every(Boolean), 'the actual registered aliases must use immutable font URLs');
  const sizes = await Promise.all(paths.map(name => stat(new URL('assets/fonts/' + name, root))));
  assert.ok(sizes.reduce((bytes, entry) => bytes + entry.size, 0) < 65 * 1024, 'fixed-run subsets must remove more than half of the previous 148,768-byte Latin critical payload');
});

test('the unchanged title intro waits for the alias faces actually drawing the title', async () => {
  const source = await read('assets/js/motion.js');
  assert.ok(source.includes('document.fonts.load(\'400 64px "\' + family + \'"\', sample)'));
  assert.ok(source.includes('document.fonts.load(\'italic 400 64px "\' + family + \'"\', sample)'));
  assert.ok(source.includes('document.fonts.load(\'400 64px "NP Serif Critical"\', sample)'));
});
