import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { buildStartupScripts, esbuildVersion, startupScriptNames } from '../build-startup-scripts.mjs';
import { versionAssetUrls } from '../version-assets.mjs';

const root = new URL('../../', import.meta.url);
const functionNames = source => [...source.matchAll(/\bfunction\s+([$\w]+)\s*\(|\b(?:var|let|const)\s+([$\w]+)\s*=\s*function\s*\(/g)].map(match => match[1] || match[2]);

test('published startup scripts reproduce with the pinned whitespace-only compiler', async () => {
  const report = await buildStartupScripts({ check: true });
  assert.deepEqual(report.map(file => file.path), startupScriptNames.map(name => 'assets/js/' + name + '.min.js'));
  let before = 0, after = 0;
  for (const name of startupScriptNames) {
    const source = await readFile(new URL('assets/js/' + name + '.js', root), 'utf8');
    const generated = await readFile(new URL('assets/js/' + name + '.min.js', root), 'utf8');
    assert.doesNotThrow(() => new vm.Script(generated));
    assert.deepEqual(functionNames(generated), functionNames(source), name + ': function names and declaration order must remain intact');
    before += gzipSync(source).length;
    after += gzipSync(generated).length;
  }
  assert.ok(after < before * 0.85, 'generated scripts must save at least 15 percent of gzip transfer');
});

test('checking stale startup artifacts does not overwrite their sources or generated files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'neriplayer-startup-scripts-'));
  try {
    await mkdir(join(directory, 'assets/js'), { recursive: true });
    for (const name of startupScriptNames) await writeFile(join(directory, 'assets/js/' + name + '.js'), 'function ' + name + '() { return 1; }\n');
    await buildStartupScripts({ directory });
    const file = join(directory, 'assets/js/core.min.js');
    const original = await readFile(join(directory, 'assets/js/core.js'));
    await writeFile(file, 'stale');
    await assert.rejects(buildStartupScripts({ directory, check: true }), /core\.min\.js is stale/);
    assert.equal(await readFile(file, 'utf8'), 'stale');
    assert.deepEqual(await readFile(join(directory, 'assets/js/core.js')), original);
    await buildStartupScripts({ directory });
    await assert.doesNotReject(buildStartupScripts({ directory, check: true }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a different compiler version is rejected before transformation or writes', async () => {
  let transformed = false;
  await assert.rejects(buildStartupScripts({ esbuild: { version: '0.28.3', transform() { transformed = true; } } }), new RegExp('Requires esbuild ' + esbuildVersion.replaceAll('.', '\\.')));
  assert.equal(transformed, false);
});

test('asset versioning retains the font generation on both old and compressed main URLs', async () => {
  for (const suffix of ['', '.min']) {
    const page = new URL('index.html', root);
    const html = '<script defer src="assets/js/main' + suffix + '.js" data-font-version="stale"></script>';
    const output = await versionAssetUrls(html, page);
    assert.match(output, /data-font-version="[a-f0-9]{12}"/);
    assert.equal((output.match(/data-font-version=/g) || []).length, 1);
    assert.match(output, new RegExp('main' + suffix.replace('.', '\\.') + '\\.js\\?v=[a-f0-9]{12}'));
    assert.equal(await versionAssetUrls(output, page), output);
  }
});
