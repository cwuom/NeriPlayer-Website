import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const faces = css => [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => ({
  body: match[1],
  family: /font-family:\s*"([^"]+)"/.exec(match[1])?.[1],
  weight: /font-weight:\s*([^;]+)/.exec(match[1])?.[1],
  href: /url\("([^"]+)"\)/.exec(match[1])?.[1],
}));

test('first-screen MiSans 400 has one immutable complete face', async () => {
  const critical = faces(await read('assets/css/base.css')).filter(face => face.family === 'MiSans Critical' && face.weight === '400');
  assert.equal(critical.length, 1, 'all required first-screen CJK must share one request instead of independent shard swaps');
  assert.match(critical[0].href, /^\.\.\/fonts\/misans-400-[a-f0-9]{12}-critical\.woff2$/);
  assert.doesNotMatch(critical[0].body, /unicode-range/, 'the exact font cmap supplies the complete first-screen repertoire');
});

test('changed published and critical fonts use content-hashed immutable paths', async () => {
  const base = faces(await read('assets/css/base.css')).filter(face => face.family?.endsWith(' Critical') || face.family === 'Fraunces Critical ZH');
  const content = faces(await read('assets/css/content-fonts.css')).filter(face => ['NP Serif', 'NP Hand'].includes(face.family));
  const desktop = faces(await read('assets/css/desktop-fonts.css')).filter(face => face.family === 'MiSans');
  assert.equal(desktop.length, 5, 'one complete actual-role subset remains available for every existing MiSans weight');
  for (const face of [...base, ...content, ...desktop]) {
    const match = /-([a-f0-9]{12})(?:-critical)?\.woff2$/.exec(face.href);
    assert.ok(match, face.href + ' must not reuse a cacheable old glyph set');
    const bytes = await readFile(new URL('assets/css/' + face.href, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 12), match[1], face.href + ' must match its actual bytes');
  }
});

test('old cached font URLs remain present', async () => {
  for (const path of ['np-serif.woff2', 'np-hand.woff2', 'misans-500.woff2', 'misans-400/15.woff2', 'misans-400-shell-critical/15.woff2', 'np-serif-critical.woff2']) {
    assert.ok((await readFile(new URL('assets/fonts/' + path, root))).length > 0, path + ' must survive cached HTML');
  }
});
