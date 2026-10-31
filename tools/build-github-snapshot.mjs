#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { appendFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const repositories = { android: 'cwuom/NeriPlayer', desktop: 'cwuom/NeriPlayer-Desktop' };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const revision = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
const official = (url, repo, prefix) => typeof url === 'string' && url.startsWith(`https://github.com/${repo}/${prefix}`) && !/[\s"<>]/.test(url);
const digest = value => value == null || value === '' || typeof value === 'string' && /^sha256:[a-f0-9]{64}$/i.test(value);
const installer = (name, key) => typeof name === 'string' && (key === 'android' ? /\.apk$/i.test(name) :
  /(?:setup\.exe|\.msi|(?:aarch64|arm64|x64|x86_64|intel).*\.dmg|\.deb|\.rpm|\.AppImage(?:\.tar\.gz)?)$/i.test(name));

function validateRelease(release, key) {
  const repo = repositories[key];
  if (!release || typeof release.tag_name !== 'string' || !release.tag_name || !Number.isFinite(Date.parse(release.published_at)) ||
      !official(release.html_url, repo, 'releases/') || typeof release.body !== 'string' || !Array.isArray(release.assets) || !release.assets.length) return false;
  if (!release.assets.every(asset => asset && typeof asset.name === 'string' && installer(asset.name, key) &&
      official(asset.browser_download_url, repo, 'releases/download/') && integer(asset.size) && asset.size > 0 && digest(asset.digest))) return false;
  return true;
}

export function validateSnapshot(value) {
  return !!(value && value.schema === 1 && Number.isFinite(Date.parse(value.fetched_at)) && value.repository &&
    (value.site_revision === undefined || revision(value.site_revision)) &&
    integer(value.repository.stargazers_count) && integer(value.repository.forks_count) &&
    Object.keys(repositories).every(key => value[key] && validateRelease(value[key].latest, key) && value[key].stats &&
      integer(value[key].stats.count) && value[key].stats.count > 0 && integer(value[key].stats.total) && value[key].stats.limited === false));
}

function compactBody(body) {
  const lines = String(body || '').split(/\r?\n/);
  const changes = lines.filter(line => /^\*\s+.+?\s+by\s+@[\w-]+\s+in\s+https:\/\//.test(line));
  return (changes.length ? changes : lines.filter(line => /^-\s+[0-9a-f]{7,}\s+.+$/.test(line))).slice(0, 5).join('\n');
}

function compactRelease(value, key) {
  if (!value || value.draft || value.prerelease || !Array.isArray(value.assets)) throw new Error(key + ': latest release is not a complete published release');
  const release = {
    tag_name: value.tag_name, published_at: value.published_at, html_url: value.html_url, body: compactBody(value.body),
    assets: value.assets.filter(asset => installer(asset.name, key)).map(asset => {
      if (asset.state !== 'uploaded') throw new Error(key + ': installer upload is incomplete');
      if (!digest(asset.digest)) throw new Error(key + ': installer digest is malformed');
      return { name: asset.name, browser_download_url: asset.browser_download_url, size: asset.size, digest: asset.digest || null };
    }),
  };
  if (!validateRelease(release, key)) throw new Error(key + ': release has invalid metadata or missing platform installers');
  return release;
}

async function collectStats(request, repo) {
  let count = 0, total = 0;
  const seen = new Set();
  for (let page = 1; page <= 20; page++) {
    const list = await request(`repos/${repo}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(list)) throw new Error(repo + ': invalid release history');
    for (const release of list) {
      if (!integer(release.id) || seen.has(release.id) || release.draft || !Array.isArray(release.assets)) throw new Error(repo + ': inconsistent release history');
      seen.add(release.id);
      count++;
      for (const asset of release.assets) {
        if (typeof asset.name !== 'string' || !integer(asset.download_count)) throw new Error(repo + ': invalid download statistics');
        if (!/\.(txt|sh|xz)$/i.test(asset.name)) total += asset.download_count;
      }
    }
    if (!Number.isSafeInteger(total)) throw new Error(repo + ': download count is outside the safe integer range');
    if (list.length < 100) return { count, total, limited: false };
  }
  throw new Error(repo + ': release history pagination did not complete');
}

export async function buildSnapshot(request, now = new Date(), { siteRevision } = {}) {
  if (siteRevision !== undefined && !revision(siteRevision)) throw new Error('site_revision must be a 40-character Git commit SHA');
  const [repository, android, desktop] = await Promise.all([
    request('repos/' + repositories.android),
    Promise.all([request('repos/' + repositories.android + '/releases/latest'), collectStats(request, repositories.android)]),
    Promise.all([request('repos/' + repositories.desktop + '/releases/latest'), collectStats(request, repositories.desktop)]),
  ]);
  const result = {
    schema: 1, fetched_at: now.toISOString(),
    repository: { stargazers_count: repository.stargazers_count, forks_count: repository.forks_count },
    android: { latest: compactRelease(android[0], 'android'), stats: android[1] },
    desktop: { latest: compactRelease(desktop[0], 'desktop'), stats: desktop[1] },
  };
  if (siteRevision !== undefined) result.site_revision = siteRevision.toLowerCase();
  if (!validateSnapshot(result)) throw new Error('GitHub snapshot validation failed');
  return result;
}

export async function refreshSnapshot({ output, request, now, siteRevision }) {
  const value = await buildSnapshot(request, now, { siteRevision });
  const temporary = output + '.' + process.pid + '.tmp';
  await mkdir(dirname(output), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx' });
    await rename(temporary, output);
  } finally { await rm(temporary, { force: true }); }
  return value;
}

function releaseIdentity(release) {
  const assets = release.assets.map(asset => JSON.stringify([asset.name, asset.browser_download_url, asset.size, asset.digest || null])).sort();
  return JSON.stringify([release.tag_name, release.published_at, release.html_url, release.body, assets]);
}

async function readPublishedSnapshot() {
  const response = await fetch('https://neri.kano.kim/assets/data/github.json', { cache: 'no-cache', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Published snapshot returned HTTP ' + response.status);
  return response.json();
}

export async function shouldDeploySnapshot(next, { eventName = 'workflow_dispatch', now = new Date(), loadPublished = readPublishedSnapshot } = {}) {
  if (!validateSnapshot(next)) throw new Error('Cannot publish an invalid GitHub snapshot');
  if (eventName !== 'schedule') return true;
  let previous;
  try { previous = await loadPublished(); } catch { return true; }
  if (!validateSnapshot(previous)) return true;
  if (next.site_revision && next.site_revision.toLowerCase() !== (previous.site_revision || '').toLowerCase()) return true;
  const age = now.getTime() - Date.parse(previous.fetched_at);
  if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000) return true;
  return Object.keys(repositories).some(key => releaseIdentity(previous[key].latest) !== releaseIdentity(next[key].latest));
}

async function officialRequest(path) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GH_TOKEN) headers.Authorization = 'Bearer ' + process.env.GH_TOKEN;
  const response = await fetch('https://api.github.com/' + path, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('GitHub returned HTTP ' + response.status + ' for ' + path);
  return response.json();
}
async function cliRequest(path) {
  const { stdout } = await execute('gh', ['api', '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', path], { timeout: 25000, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outputArg = args.indexOf('--output');
  const output = outputArg >= 0 ? resolve(args[outputArg + 1]) : fileURLToPath(new URL('../assets/data/github.json', import.meta.url));
  try {
    const value = await refreshSnapshot({ output, request: args.includes('--use-gh') ? cliRequest : officialRequest, siteRevision: process.env.GITHUB_SHA });
    console.log(`GitHub snapshot: ${value.fetched_at}, ${value.android.stats.count} Android / ${value.desktop.stats.count} desktop releases`);
    const deploy = await shouldDeploySnapshot(value, { eventName: args.includes('--scheduled') ? 'schedule' : 'workflow_dispatch' });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'deploy=' + deploy + '\n');
    console.log('Publish site: ' + deploy);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
