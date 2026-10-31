import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { buildCriticalCss, syncCriticalFontPreloads } from '../build-critical-css.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const source = await read('assets/js/motion.js');
const startHero = /  function startHero\(\) \{[\s\S]*?(?=\n  var heroInitialized)/.exec(source)?.[0];
assert.ok(startHero, 'exercise the actual hero startup function');

async function startup({ english = false, chineseFace = true, iterable = true, pending = false } = {}) {
  const calls = [], timers = [], reveals = [], classes = [];
  const fonts = { load(font, text) { calls.push({ font, text }); return pending ? new Promise(() => {}) : Promise.resolve([]); } };
  if (iterable) fonts.forEach = callback => {
    callback({ family: 'Fraunces Critical' });
    if (chineseFace) callback({ family: 'Fraunces Critical ZH' });
  };
  const hero = { classList: { add(value) { classes.push(value); } } };
  const context = vm.createContext({ NP: { en: english }, document: { fonts }, $: selector => selector === '.hero h1' ? { textContent: '多源在线，本地优先，从掌心到桌面' } : hero, observe: value => reveals.push(value), requestAnimationFrame: callback => callback(), setTimeout: (callback, delay) => timers.push({ callback, delay }) });
  vm.runInContext(startHero + '\nstartHero();', context);
  await new Promise(resolve => setImmediate(resolve));
  return { calls, timers, reveals, classes };
}

for (const scenario of [
  { name: 'Chinese entry', options: {}, family: 'Fraunces Critical ZH' },
  { name: 'English entry', options: { english: true }, family: 'Fraunces Critical' },
  { name: 'cached old Chinese HTML', options: { chineseFace: false }, family: 'Fraunces Critical' },
  { name: 'older font loading implementation', options: { iterable: false }, family: 'Fraunces Critical' },
]) test('hero font barrier uses matching registered faces for ' + scenario.name, async () => {
  const result = await startup(scenario.options);
  assert.deepEqual(result.calls.map(call => call.font), ['400 64px "' + scenario.family + '"', 'italic 400 64px "' + scenario.family + '"', '400 64px "NP Serif Critical"']);
  assert.deepEqual(result.reveals, [true]);
  assert.deepEqual(result.timers.map(timer => timer.delay).sort((a, b) => a - b), [60, 1200]);
  result.timers.find(timer => timer.delay === 60).callback();
  assert.deepEqual(result.classes, ['is-intro']);
});

test('a pending language font retains the original 1200ms fallback and one intro', async () => {
  const result = await startup({ pending: true });
  assert.deepEqual(result.reveals, []);
  result.timers.find(timer => timer.delay === 1200).callback();
  assert.deepEqual(result.reveals, [true]);
  result.timers.find(timer => timer.delay === 60).callback();
  assert.deepEqual(result.classes, ['is-intro']);
});

test('Chinese aliases retain the normal font and expose an explicit English italic preload', async () => {
  const css = await buildCriticalCss();
  const faces = [...css.matchAll(/@font-face\{([^}]+)\}/g)].map(match => match[1]);
  const sourceFor = (family, italic) => {
    const face = faces.find(face => face.includes('font-family:"' + family + '";') && face.includes('font-style:italic') === italic);
    assert.ok(face, family + ' ' + italic);
    return /url\("([^" ]+)"\)/.exec(face)[1].replace('../fonts/', 'assets/fonts/');
  };
  assert.equal(sourceFor('Fraunces Critical ZH', false), sourceFor('Fraunces Critical', false));
  assert.notEqual(sourceFor('Fraunces Critical ZH', true), sourceFor('Fraunces Critical', true));
  const html = '<link rel="preload" href="assets/fonts/fraunces-italic-critical.woff2" as="font" crossorigin>\n<link rel="preload" href="assets/fonts/misans-400-critical.woff2" as="font" data-hero-cjk>\n';
  const output = syncCriticalFontPreloads(html, css);
  assert.ok(output.includes('href="' + sourceFor('Fraunces Critical ZH', true) + '"'));
  assert.ok(output.includes('data-hero-en-font="' + sourceFor('Fraunces Critical', true) + '"'));
  assert.equal(syncCriticalFontPreloads(output, css), output, 'rebuilding keeps one matching preload instead of appending attributes');
  const englishBuilder = await read('tools/i18n.mjs');
  assert.match(englishBuilder, /querySelectorAll\('link\[data-hero-en-font\]'\)/);
});
