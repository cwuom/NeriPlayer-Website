import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { shotNames, shotSizes, shotSources, shotWidths } from '../build-responsive-shots.mjs';

const require = createRequire(process.env.SHARP_FROM ? join(resolve(process.env.SHARP_FROM), 'noop.js') : import.meta.url);
const sharp = require('sharp');
const root = new URL('../../', import.meta.url);
const originalHashes = {
  home: 'dd04965e09721607ec685cb86cd84a9151b4416a57312a793427f217be99e5db',
  explore: '8c6a8e6a9db117d588472dbd19eb7d30ac90aef6ee347bff4402a4ba12c99e3c',
  library: '5d78d9fe13a1eabfcfa7f75405a3ca356cb98b4fd7b1c74a1a7ddb5b1bc8b317',
  settings: '18ef6df587e9db3145824de524211c4bead5508080e3d40cfc254b5e7629e57f',
};

test('published original screenshots remain byte-identical', async () => {
  for (const name of shotNames) {
    const bytes = await readFile(new URL('assets/img/shots/real-' + name + '.jpg', root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), originalHashes[name]);
  }
});

test('all responsive candidates decode at the original exact aspect ratio', async () => {
  for (const name of shotNames) {
    const original = await stat(new URL('assets/img/shots/real-' + name + '.jpg', root));
    for (const format of ['jpg', 'webp']) {
      for (const width of format === 'webp' ? shotWidths.concat(1272) : shotWidths) {
        const url = new URL(`assets/img/shots/real-${name}-${width}.${format}`, root);
        const bytes = await readFile(url);
        const metadata = await sharp(bytes).metadata();
        assert.equal(metadata.format, format === 'jpg' ? 'jpeg' : format);
        assert.equal(metadata.width, width);
        assert.equal(metadata.height * 1272, width * 2772);
        assert.equal(metadata.space, 'srgb');
        assert.equal(metadata.channels, 3);
        assert.ok(bytes.length < original.size / 2, `${url.pathname} must save more than half the original transfer`);
        await sharp(bytes).raw().toBuffer();
      }
    }
  }
});

test('responsive markup retains the original JPEG fallback and an ultra-high-density candidate', () => {
  for (const name of shotNames) {
    const source = shotSources(name);
    assert.equal(source.src, `assets/img/shots/real-${name}.jpg`);
    assert.ok(source.srcset.endsWith(source.src + ' 1272w'));
    assert.ok(source.webpSrcset.endsWith(`real-${name}-1272.webp 1272w`));
    assert.equal(source.width / source.height, 1272 / 2772);
    assert.equal(shotSources(name, '../assets/img/shots/').src, '../' + source.src);
  }
  assert.throws(() => shotSources('../outside'), /Unknown screenshot/);
});

test('both published HTML pages resolve every screenshot candidate to the matching local image', async () => {
  const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
  for (const filename of ['index.html', 'en/index.html']) {
    const page = new URL(filename, root);
    const html = await readFile(page, 'utf8');
    const pictures = [...html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/g)]
      .map(match => match[1]).filter(picture => /\bdata-real-shot=/.test(picture));
    assert.equal(pictures.length, 4, filename);
    for (const name of shotNames) {
      const matching = pictures.filter(picture => picture.includes(`data-real-shot="${name}"`));
      assert.equal(matching.length, 1, `${filename}: ${name}`);
      const sources = [...matching[0].matchAll(/<source\b[^>]*>/g)];
      assert.equal(sources.length, 1);
      const source = attributes(sources[0][0]);
      const image = attributes(matching[0].match(/<img\b[^>]*>/)[0]);
      assert.equal(source.type, 'image/webp');
      assert.equal(source.sizes, shotSizes);
      assert.equal(image.sizes, shotSizes);
      assert.equal(image.width, '1272');
      assert.equal(image.height, '2772');
      assert.equal(image.loading, 'lazy');
      assert.equal(image.decoding, 'async');
      assert.ok(image.alt.trim(), 'the existing accessible name must be retained');
      const original = new URL(`assets/img/shots/real-${name}.jpg`, root);
      assert.equal(new URL(image.src, page).href, original.href, 'the legacy src must resolve to the original JPEG');
      for (const [tag, format] of [[source, 'webp'], [image, 'jpg']]) {
        const candidates = tag.srcset.split(',').map(candidate => candidate.trim().split(/\s+/));
        assert.deepEqual(candidates.map(candidate => candidate[1]), ['424w', '636w', '848w', '1272w']);
        for (const [reference, descriptor] of candidates) {
          const width = parseInt(descriptor, 10);
          const expected = width === 1272 && format === 'jpg' ? original : new URL(`assets/img/shots/real-${name}-${width}.${format}`, root);
          const resolved = new URL(reference, page);
          assert.equal(resolved.href, expected.href, `${filename}: candidate must stay within the matching screenshot`);
          const metadata = await sharp(await readFile(resolved)).metadata();
          assert.equal(metadata.width, width, `${filename}: width descriptor must match the actual resource`);
          assert.equal(metadata.height * 1272, width * 2772);
        }
      }
    }
  }
});
