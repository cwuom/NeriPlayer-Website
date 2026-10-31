import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const tool = new URL('../build-github-snapshot.mjs', import.meta.url);
const repos = ['cwuom/NeriPlayer', 'cwuom/NeriPlayer-Desktop'];
const sha = 'sha256:' + 'a'.repeat(64);
const release = repo => ({
  tag_name: 'v1.2.3', published_at: '2026-10-31T00:00:00Z', draft: false,
  html_url: `https://github.com/${repo}/releases/tag/v1.2.3`,
  body: Array.from({ length: 9 }, (_, i) => `* Change ${i} by @cwuom in https://github.com/${repo}/pull/${i + 1}`).join('\n') + '\nPrivate build machinery not shown by the UI',
  assets: (repo === repos[0] ? ['app-arm64-v8a.apk', 'app-armeabi-v7a.apk', 'app-x86_64.apk', 'app-x86.apk'] : ['app-x64-setup.exe', 'app.msi', 'app-aarch64.dmg', 'app-x64.dmg', 'app.deb', 'app.rpm', 'app.AppImage']).map(name => ({
    name, browser_download_url: `https://github.com/${repo}/releases/download/v1.2.3/${name}`, size: 1234567,
    digest: sha, download_count: 42, state: 'uploaded', uploader: { login: 'not-needed' },
  })),
});
const history = () => [
  { id: 1, assets: [{ name: 'app.apk', download_count: 1200 }, { name: 'notes.txt', download_count: 999 }, { name: 'app.xz', download_count: 80 }] },
  { id: 2, assets: [{ name: 'old.apk', download_count: 300 }, { name: 'archive.zip', download_count: 50 }, { name: 'install.sh', download_count: 100 }] },
];
async function module() {
  assert.ok(existsSync(tool), 'the deployment must generate a validated same-origin snapshot');
  return import(tool);
}
const request = async path => path.endsWith('/releases/latest') ? release(path.includes('Desktop') ? repos[1] : repos[0]) : path.includes('/releases?') ? history() : { stargazers_count: 4200, forks_count: 222, description: 'unused' };

test('the snapshot preserves official asset identity and only the release fields used by the UI', async () => {
  const { buildSnapshot } = await module();
  const value = await buildSnapshot(request, new Date('2026-10-31T12:00:00Z'));
  assert.equal(value.fetched_at, '2026-10-31T12:00:00.000Z');
  assert.deepEqual(value.repository, { stargazers_count: 4200, forks_count: 222 });
  for (const key of ['android', 'desktop']) {
    const source = release(key === 'android' ? repos[0] : repos[1]);
    assert.equal(value[key].latest.tag_name, source.tag_name);
    assert.equal(value[key].latest.html_url, source.html_url);
    assert.equal(value[key].latest.body.split('\n').length, 5);
    assert.deepEqual(Object.keys(value[key].latest.assets[0]).sort(), ['browser_download_url', 'digest', 'name', 'size']);
    assert.equal(value[key].latest.assets[0].digest, sha);
    assert.deepEqual(value[key].stats, { count: 2, total: 1550, limited: false });
  }
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < 6000);
});

test('history pagination keeps cumulative statistics beyond the first one hundred releases', async () => {
  const { buildSnapshot } = await module();
  const calls = [];
  const value = await buildSnapshot(async path => {
    calls.push(path);
    if (!path.includes('/releases?')) return request(path);
    return path.endsWith('page=1') ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1, assets: [{ name: 'app.apk', download_count: 2 }] })) : [{ id: 101, assets: [{ name: 'app.apk', download_count: 3 }] }];
  });
  assert.equal(calls.filter(path => path.endsWith('page=2')).length, 2);
  assert.deepEqual(value.android.stats, { count: 101, total: 203, limited: false });
});

test('invalid metadata, incomplete uploads and upstream failures leave the existing snapshot intact', async () => {
  const { refreshSnapshot } = await module();
  const dir = await mkdtemp(join(tmpdir(), 'np-github-snapshot-'));
  const file = join(dir, 'github.json');
  const previous = '{"previous":"valid deployment"}\n';
  try {
    for (const fault of ['network', 'digest', 'asset-url', 'missing-platform', 'upload', 'unrecognized-package', 'stats']) {
      await writeFile(file, previous);
      await assert.rejects(refreshSnapshot({ output: file, request: async path => {
        if (fault === 'network' && path.includes('Desktop')) throw new Error('offline');
        const result = structuredClone(await request(path));
        if (path.endsWith('/releases/latest')) {
          if (fault === 'digest') result.assets[0].digest = 'sha256:broken';
          if (fault === 'asset-url') result.assets[0].browser_download_url = 'https://mirror.test/file.apk';
          if (fault === 'missing-platform' && path.includes('Desktop')) result.assets = [];
          if (fault === 'upload') result.assets[0].state = 'new';
          if (fault === 'unrecognized-package' && path.includes('Desktop')) result.assets = [{ ...result.assets[0], name: 'notes.zip' }];
        }
        if (fault === 'stats' && path.includes('/releases?')) result[0].assets[0].download_count = -1;
        return result;
      } }), undefined, fault);
      assert.equal(await readFile(file, 'utf8'), previous, fault + ' must leave the last valid bytes untouched');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a successful refresh writes one complete validated JSON document', async () => {
  const { refreshSnapshot, validateSnapshot } = await module();
  const dir = await mkdtemp(join(tmpdir(), 'np-github-snapshot-'));
  const file = join(dir, 'github.json');
  try {
    await refreshSnapshot({ output: file, request });
    const raw = await readFile(file, 'utf8');
    assert.equal(validateSnapshot(JSON.parse(raw)), true);
    assert.ok(raw.endsWith('\n'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unknown upstream digests stay unknown while valid digests remain unchanged', async () => {
  const { buildSnapshot } = await module();
  for (const checksum of [undefined, null, '', sha]) {
    const value = await buildSnapshot(async path => {
      const result = structuredClone(await request(path));
      if (path.endsWith('/releases/latest')) for (const asset of result.assets) asset.digest = checksum;
      return result;
    });
    assert.equal(value.android.latest.assets[0].digest, checksum || null);
    assert.equal(value.desktop.latest.assets[0].digest, checksum || null);
  }
});

test('a published release may omit individual formats while retaining a valid installer on each platform', async () => {
  const { buildSnapshot, validateSnapshot } = await module();
  const value = await buildSnapshot(async path => {
    const result = structuredClone(await request(path));
    if (path.endsWith('/releases/latest')) result.assets = result.assets.slice(0, 1);
    return result;
  });
  assert.equal(validateSnapshot(value), true);
  assert.equal(value.android.latest.assets.length, 1);
  assert.equal(value.desktop.latest.assets.length, 1);
  assert.equal(value.android.latest.assets[0].browser_download_url, release(repos[0]).assets[0].browser_download_url);
});
