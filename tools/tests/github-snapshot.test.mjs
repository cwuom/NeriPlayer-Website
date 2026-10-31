import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
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

test('scheduled checks skip a recent unchanged release even when counters or asset order change', async () => {
  const { buildSnapshot, shouldDeploySnapshot } = await module();
  assert.equal(typeof shouldDeploySnapshot, 'function');
  const previous = await buildSnapshot(request, new Date('2026-10-31T10:00:00Z'));
  const next = structuredClone(previous);
  next.fetched_at = '2026-10-31T12:00:00Z';
  next.repository.stargazers_count++;
  next.android.stats.total++;
  next.desktop.stats.total++;
  next.desktop.latest.assets.reverse();
  assert.equal(await shouldDeploySnapshot(next, { eventName: 'schedule', now: new Date('2026-10-31T12:00:00Z'), loadPublished: async () => previous }), false);
});

test('scheduled checks immediately publish every change to the latest release identity', async () => {
  const { buildSnapshot, shouldDeploySnapshot } = await module();
  assert.equal(typeof shouldDeploySnapshot, 'function');
  const previous = await buildSnapshot(request, new Date('2026-10-31T10:00:00Z'));
  for (const key of ['android', 'desktop']) {
    for (const field of ['tag_name', 'published_at', 'html_url', 'body', 'asset-url', 'asset-size', 'asset-digest', 'asset-added']) {
      const next = structuredClone(previous);
      const latest = next[key].latest;
      if (field === 'published_at') latest.published_at = '2026-10-31T01:00:00Z';
      else if (field === 'asset-url') latest.assets[0].browser_download_url += '?revision=2';
      else if (field === 'asset-size') latest.assets[0].size++;
      else if (field === 'asset-digest') latest.assets[0].digest = 'sha256:' + 'b'.repeat(64);
      else if (field === 'asset-added') latest.assets.push({ ...latest.assets[0], name: key === 'android' ? 'extra-arm64-v8a.apk' : 'extra-x64-setup.exe', browser_download_url: latest.assets[0].browser_download_url + '?extra=1' });
      else latest[field] += '-updated';
      assert.equal(await shouldDeploySnapshot(next, { eventName: 'schedule', now: new Date('2026-10-31T12:00:00Z'), loadPublished: async () => previous }), true, key + ' ' + field);
    }
  }
});

test('an unchanged release refreshes at twenty four hours but not one millisecond sooner', async () => {
  const { buildSnapshot, shouldDeploySnapshot } = await module();
  assert.equal(typeof shouldDeploySnapshot, 'function');
  const previous = await buildSnapshot(request, new Date('2026-10-30T12:00:00Z'));
  const next = structuredClone(previous);
  for (const [now, expected] of [['2026-10-31T11:59:59.999Z', false], ['2026-10-31T12:00:00Z', true]]) {
    assert.equal(await shouldDeploySnapshot(next, { eventName: 'schedule', now: new Date(now), loadPublished: async () => previous }), expected);
  }
});

test('failed or invalid published data never blocks a valid new scheduled snapshot', async () => {
  const { buildSnapshot, shouldDeploySnapshot } = await module();
  assert.equal(typeof shouldDeploySnapshot, 'function');
  const next = await buildSnapshot(request);
  for (const previous of [null, {}, { ...next, desktop: null }]) {
    assert.equal(await shouldDeploySnapshot(next, { eventName: 'schedule', loadPublished: async () => previous }), true);
  }
  assert.equal(await shouldDeploySnapshot(next, { eventName: 'schedule', loadPublished: async () => { throw new Error('timed out'); } }), true);
  const future = { ...next, fetched_at: '2100-01-01T00:00:00Z' };
  assert.equal(await shouldDeploySnapshot(next, { eventName: 'schedule', now: new Date('2026-10-31T12:00:00Z'), loadPublished: async () => future }), true);
});

test('manual dispatch always publishes without reading the production site', async () => {
  const { buildSnapshot, shouldDeploySnapshot } = await module();
  assert.equal(typeof shouldDeploySnapshot, 'function');
  const next = await buildSnapshot(request);
  let reads = 0;
  assert.equal(await shouldDeploySnapshot(next, { eventName: 'workflow_dispatch', loadPublished: async () => { reads++; return next; } }), true);
  assert.equal(reads, 0);
  await assert.rejects(shouldDeploySnapshot({}, { eventName: 'workflow_dispatch' }));
});

test('the CLI writes its schedule or manual decision to the standard GitHub output file', async () => {
  const { buildSnapshot } = await module();
  const dir = await mkdtemp(join(tmpdir(), 'np-github-output-'));
  const execute = promisify(execFile);
  const revision = 'c'.repeat(40);
  const previous = await buildSnapshot(request, new Date(), { siteRevision: revision });
  const preload = join(dir, 'fetch-fixture.mjs');
  const fixtures = Object.fromEntries(await Promise.all([
    'repos/' + repos[0], ...repos.flatMap(repo => ['repos/' + repo + '/releases/latest', 'repos/' + repo + '/releases?per_page=100&page=1']),
  ].map(async path => [path, await request(path)])));
  await writeFile(preload, `const fixtures = ${JSON.stringify(fixtures)};\nconst previous = ${JSON.stringify(previous)};\nglobalThis.fetch = async (url, options) => {\n  if (url === 'https://neri.kano.kim/assets/data/github.json') {\n    if (!options.signal || options.cache !== 'no-cache') throw new Error('The published snapshot must have a timeout and revalidate');\n    return { ok: true, json: async () => previous };\n  }\n  const result = fixtures[url.replace('https://api.github.com/', '')];\n  if (!result) throw new Error('Unexpected request');\n  return { ok: true, json: async () => result };\n};\n`);
  try {
    for (const [args, expected] of [[['--scheduled'], false], [[], true]]) {
      const output = join(dir, 'output-' + expected);
      const snapshot = join(dir, 'snapshot-' + expected + '.json');
      await execute(process.execPath, ['--import', preload, fileURLToPath(tool), '--output', snapshot, ...args], { env: { ...process.env, GITHUB_SHA: revision, GITHUB_OUTPUT: output } });
      assert.equal(await readFile(output, 'utf8'), 'deploy=' + expected + '\n');
      assert.equal(JSON.parse(await readFile(snapshot, 'utf8')).schema, 1);
      assert.equal(JSON.parse(await readFile(snapshot, 'utf8')).site_revision, revision);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('site revisions are optional locally and only valid Git commit identifiers enter the snapshot', async () => {
  const { buildSnapshot, validateSnapshot } = await module();
  const local = await buildSnapshot(request);
  assert.equal(Object.hasOwn(local, 'site_revision'), false);
  const revision = 'a'.repeat(40);
  const value = await buildSnapshot(request, new Date(), { siteRevision: revision });
  assert.equal(value.site_revision, revision);
  assert.equal(validateSnapshot(value), true);
  for (const invalid of ['', 'not-a-revision', 'a'.repeat(39), 'a'.repeat(41), null]) {
    await assert.rejects(buildSnapshot(request, new Date(), { siteRevision: invalid }));
    assert.equal(validateSnapshot({ ...local, site_revision: invalid }), false);
  }
});

test('scheduled checks publish changed site revisions and migrate old published snapshots', async () => {
  const { buildSnapshot, shouldDeploySnapshot } = await module();
  const now = new Date('2026-10-31T12:00:00Z');
  const previous = await buildSnapshot(request, now, { siteRevision: 'a'.repeat(40) });
  const unchanged = structuredClone(previous);
  assert.equal(await shouldDeploySnapshot(unchanged, { eventName: 'schedule', now, loadPublished: async () => previous }), false);
  const changed = { ...unchanged, site_revision: 'b'.repeat(40) };
  assert.equal(await shouldDeploySnapshot(changed, { eventName: 'schedule', now, loadPublished: async () => previous }), true);
  const legacy = structuredClone(previous);
  delete legacy.site_revision;
  assert.equal(await shouldDeploySnapshot(unchanged, { eventName: 'schedule', now, loadPublished: async () => legacy }), true);
  assert.equal(await shouldDeploySnapshot(legacy, { eventName: 'schedule', now, loadPublished: async () => previous }), false, 'local snapshots without a revision retain the release and time checks');
});
