#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

export async function versionAssetUrls(html, page) {
  const pattern = /\b(src|data-np-module|href)="((?:\.\.\/)?assets\/(?:js\/[^"?#]+\.js|css\/site\.css))(?:\?v=[a-f0-9]+)?"/g;
  const paths = [...new Set([...html.matchAll(pattern)].map(match => match[2]))];
  const versions = new Map(await Promise.all(paths.map(async path => {
    const bytes = await readFile(new URL(path, page));
    return [path, createHash('sha256').update(bytes).digest('hex').slice(0, 12)];
  })));
  const fontHash = createHash('sha256');
  for (const name of ['content-fonts', 'desktop-fonts', 'phone-fonts']) fontHash.update(name).update(await readFile(new URL('assets/css/' + name + '.css', root)));
  const fontVersion = fontHash.digest('hex').slice(0, 12);
  return html.replace(pattern, (_match, attribute, path) => `${attribute}="${path}?v=${versions.get(path)}"`)
    .replace(/\bhref="((?:\.\.\/)?assets\/css\/(?:content|desktop|phone)-fonts\.css)(?:\?v=[a-f0-9]+)?"/g, (_match, path) => `href="${path}?v=${fontVersion}"`)
    .replace(/<script\b[^>]*\bsrc="[^" ]*\/main\.js[^" ]*"[^>]*>/g, tag => tag.replace(/\sdata-font-version="[^"]*"/g, '').replace('>', ` data-font-version="${fontVersion}">`));
}

async function main() {
  const args = process.argv.slice(2);
  for (const flag of args) if (flag !== '--check') throw new Error('Unknown option: ' + flag);
  for (const path of ['index.html', 'en/index.html']) {
    const page = new URL(path, root);
    const html = await readFile(page, 'utf8');
    const output = await versionAssetUrls(html, page);
    if (args.includes('--check')) {
      if (output !== html) throw new Error(path + ' has stale asset versions; run node tools/version-assets.mjs');
    } else if (output !== html) await writeFile(page, output);
  }
  console.log('Asset versions: ' + (args.includes('--check') ? 'current' : 'updated'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
