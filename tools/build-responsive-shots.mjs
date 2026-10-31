#!/usr/bin/env node
// 从保留的真机截图生成展示尺寸，截图内容和原文件保持不变
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const shotNames = ['home', 'explore', 'library', 'settings'];
export const shotWidths = [424, 636, 848];
export const shotSizes = '(max-width: 944px) 150px, (min-width: 1278px) 210px, calc(18vw - 20px)';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function shotSources(name, prefix = 'assets/img/shots/') {
  if (!shotNames.includes(name)) throw new Error('Unknown screenshot: ' + name);
  const base = prefix + 'real-' + name;
  return {
    src: base + '.jpg',
    srcset: shotWidths.map(width => `${base}-${width}.jpg ${width}w`).concat(base + '.jpg 1272w').join(', '),
    webpSrcset: shotWidths.concat(1272).map(width => `${base}-${width}.webp ${width}w`).join(', '),
    sizes: shotSizes,
    width: 1272,
    height: 2772,
  };
}

function loadSharp() {
  try {
    const require = createRequire(process.env.SHARP_FROM ? join(resolve(process.env.SHARP_FROM), 'noop.js') : import.meta.url);
    return require('sharp');
  } catch {
    throw new Error('Requires sharp 0.35.5; use SHARP_FROM to point to an existing node_modules directory');
  }
}

export async function buildResponsiveShots({ check = false, directory = root, sharp = loadSharp() } = {}) {
  const report = { encoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips, webp: sharp.versions.webp }, originals: [], images: [], markup: {} };
  for (const name of shotNames) {
    const path = join(directory, 'assets/img/shots/real-' + name + '.jpg');
    const original = await readFile(path);
    const metadata = await sharp(original).metadata();
    if (metadata.width !== 1272 || metadata.height !== 2772 || metadata.orientation > 1) throw new Error('Unexpected original geometry: ' + path);
    report.originals.push({ name, width: metadata.width, height: metadata.height, bytes: original.length, sha256: digest(original) });
    report.markup[name] = shotSources(name);
    for (const width of shotWidths.concat(1272)) {
      const height = width * metadata.height / metadata.width;
      if (!Number.isInteger(height)) throw new Error('Screenshot size must retain its exact aspect ratio');
      const resized = sharp(original).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).toColourspace('srgb');
      for (const format of width === 1272 ? ['webp'] : ['webp', 'jpg']) {
        const pipeline = resized.clone();
        const bytes = format === 'webp'
          ? await pipeline.webp({ quality: 92, effort: 6, smartSubsample: true }).toBuffer()
          : await pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
        const relative = `assets/img/shots/real-${name}-${width}.${format}`;
        const output = join(directory, relative);
        if (check) {
          if (!(await readFile(output)).equals(bytes)) throw new Error('Stale responsive screenshot: ' + relative);
        } else await writeFile(output, bytes);
        report.images.push({ name, path: relative, width, height, format, bytes: bytes.length, sha256: digest(bytes), decodedBytes: width * height * 4 });
      }
    }
    if (!(await readFile(path)).equals(original)) throw new Error('Original screenshot changed: ' + path);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) throw new Error('Usage: node tools/build-responsive-shots.mjs [--check]');
  buildResponsiveShots({ check: args.includes('--check') }).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
