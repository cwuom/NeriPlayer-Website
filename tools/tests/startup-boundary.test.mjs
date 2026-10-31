import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/js/main.js', import.meta.url), 'utf8');

function bootstrap(styles = [], { holdFont, modules = [], failures = {}, preloadFailures = [], styleFailures = 0, script = source, scriptURL = 'https://example.test/assets/js/main.js?v=123456abcdef', fontVersion } = {}) {
  const ready = [], queued = [];
  const state = { phoneHandlers: false, restricted: false, phoneStarts: 0, fontLinks: [], classes: new Set(), moduleRequests: [], moduleRuns: [], preloads: [], styleLinks: [] };
  const NP = {
    math: {}, env: { reduced: true }, $: () => null,
    $$: selector => selector === 'link[data-deferred-style]' ? styles : selector === 'script[data-np-module]' ? modules.map(name => ({ getAttribute: () => name })) : [],
    phones: { init() { state.phoneHandlers = true; state.phoneStarts++; } },
    playerPreview: { init() { state.restricted = true; } },
    demos: { init() {} }, measure() {},
  };
  const document = {
    readyState: 'loading',
    currentScript: { src: scriptURL, dataset: { fontVersion } },
    createElement(tag) { return tag === 'link' ? Object.assign(stylesheet(), { tag }) : { tag, dataset: {}, remove() {} }; },
    head: {
      appendChild(link) {
        link.parentNode = this;
        if (link.tag === 'script') {
          state.moduleRequests.push(link.src);
          queued.push(() => {
            if (failures[link.src] > 0) { failures[link.src]--; link.onerror(); return; }
            state.moduleRuns.push(link.src);
            link.onload();
          });
          return;
        }
        if (link.rel === 'preload') {
          state.preloads.push(link.href);
          if (preloadFailures.includes(link.href)) queued.push(() => link.onerror());
          return;
        }
        if (link.rel === 'stylesheet' && !link.dataset.contentFont) {
          state.styleLinks.push(link);
          queued.push(() => link.settle(styleFailures-- > 0 ? 'error' : 'load'));
          return;
        }
        state.fontLinks.push(link);
        if (link.dataset.contentFont !== holdFont) queued.push(() => link.onload());
      },
      insertBefore(link) { this.appendChild(link); },
    },
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') ready.push(callback); },
    documentElement: { classList: { add(name) { state.classes.add(name); }, remove(name) { state.classes.delete(name); } } },
  };
  styles.forEach(link => { link.parentNode = document.head; });
  class IntersectionObserver {
    observe() {}
    disconnect() {}
  }
  const location = { hash: '' };
  vm.runInNewContext(script, {
    window: { NP, IntersectionObserver, location }, document, IntersectionObserver, location,
    setTimeout: callback => queued.push(callback),
    clearTimeout() {},
    requestAnimationFrame: callback => queued.push(callback),
  }, { filename: 'assets/js/main.js' });

  return {
    NP, state, queued,
    // shell startup does not own the preview task boundary
    start() { ready.find(callback => callback.name === 'bootPreviews')(); },
    async flush(stopWhen) {
      let turns = 0;
      while (true) {
        // native promises settle before the next simulated frame or timer task
        await setImmediate();
        assert.ok(!state.phoneHandlers || state.restricted, 'microtask checkpoint: phone handlers must already have preview restrictions');
        if (stopWhen?.()) break;
        if (!queued.length) break;
        assert.ok(++turns < 50, 'preview startup must terminate');
        queued.shift()();
        assert.ok(!state.phoneHandlers || state.restricted, `yield ${turns}: phone handlers must already have preview restrictions`);
      }
    },
    async drain(prepared) {
      await this.flush();
      assert.equal(NP.booted, true, 'preview startup must schedule work until it completes');
      await prepared;
    },
  };
}

function stylesheet(ready = false) {
  const listeners = new Map();
  return {
    media: 'print', sheet: null, dataset: ready ? { ready } : {}, href: 'https://example.test/assets/css/site.css',
    remove() { this.removed = true; },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    settle(type) {
      this.dataset.ready = type === 'load' ? 'true' : 'error';
      if (type === 'load') this.sheet = {};
      const callbacks = listeners.get(type) || [];
      listeners.delete(type);
      callbacks.forEach(callback => callback());
    },
  };
}

test('source and compressed main scripts keep lazy font URLs and startup callback names', async () => {
  for (const suffix of ['', '.min']) {
    const script = readFileSync(new URL('../../assets/js/main' + suffix + '.js', import.meta.url), 'utf8');
    const run = bootstrap([], { script, scriptURL: 'https://example.test/nested/site/assets/js/main' + suffix + '.js?v=123#cached', fontVersion: '123456abcdef' });
    run.start();
    await run.drain(run.NP.preparePreviews());
    assert.deepEqual(run.state.fontLinks.map(link => link.href), ['content', 'desktop', 'phone'].map(name => 'https://example.test/nested/site/assets/css/' + name + '-fonts.css?v=123456abcdef'));
    assert.equal(run.state.phoneStarts, 1);
  }
});

test('every preview startup yield keeps installed phone handlers behind preview restrictions', async () => {
  const run = bootstrap();
  run.start();
  assert.equal(run.NP.booted, undefined, 'the empty observer must leave previews cold until explicitly requested');
  const prepared = run.NP.preparePreviews();
  assert.equal(run.NP.preparePreviews(), prepared, 'concurrent preparation requests must share one promise');
  await run.drain(prepared);
  assert.equal(run.state.phoneHandlers, true);
  assert.equal(run.state.restricted, true);
  assert.equal(run.state.phoneStarts, 1);
  assert.equal(run.NP.booted, true);
});

test('a stylesheet error recorded before preview startup retries before releasing the barrier', async () => {
  const failed = stylesheet('error');
  const run = bootstrap([failed]);
  run.start();
  await run.drain(run.NP.preparePreviews());
  assert.equal(failed.removed, true);
  assert.equal(run.state.styleLinks.length, 1);
  assert.equal(run.state.styleLinks[0].media, 'all');
  assert.equal(run.NP.booted, true);
});

test('a recovered stylesheet releases only its own barrier slot and starts previews once', async () => {
  const failed = stylesheet(), pending = stylesheet();
  const run = bootstrap([failed, pending]);
  run.start();
  const prepared = run.NP.preparePreviews();
  await run.flush();
  assert.equal(run.queued.length, 0);
  failed.settle('error');
  await run.flush();
  assert.equal(run.queued.length, 0, 'an unrelated pending stylesheet must still hold the barrier');
  failed.settle('load');
  await run.flush();
  assert.equal(run.queued.length, 0, 'a second event cannot release the failed stylesheet twice');
  pending.settle('load');
  await run.drain(prepared);
  assert.equal(run.state.styleLinks[0].media, 'all');
  assert.equal(pending.media, 'all');
  assert.equal(run.state.phoneStarts, 1);
  assert.equal(run.NP.booted, true);
});

test('stylesheet failures retry twice, leave successful styles alone and eventually release the barrier', async () => {
  const failed = stylesheet('error'), ready = stylesheet('true');
  ready.sheet = {};
  const run = bootstrap([failed, ready], { styleFailures: 10 });
  run.start();
  await run.drain(run.NP.preparePreviews());
  assert.equal(run.state.styleLinks.length, 2, 'the original failed download gets only two extra requests');
  assert.equal(ready.removed, undefined, 'a successful stylesheet must not be replaced or downloaded again');
  assert.equal(run.state.phoneStarts, 1);
  assert.equal(run.state.classes.has('np-style-error'), true);
  assert.equal(run.NP.baseReady, true, 'exhausted CSS retries must not deadlock the shell');
});

test('a late stylesheet error consumes the same bounded retry budget', async () => {
  const failed = stylesheet();
  const run = bootstrap([failed], { styleFailures: 10 });
  run.start();
  const prepared = run.NP.preparePreviews();
  await run.flush();
  assert.equal(run.NP.baseReady, undefined);
  failed.settle('error');
  await run.drain(prepared);
  assert.equal(run.state.styleLinks.length, 2);
  assert.equal(run.state.phoneStarts, 1);
});

test('a preview task failure rejects preparation and exposes the preview error state', async () => {
  const run = bootstrap();
  const failure = new Error('theme initialization failed');
  run.NP.themes = { init() { throw failure; } };
  run.start();
  const prepared = run.NP.preparePreviews();
  const rejected = assert.rejects(prepared, error => error === failure);
  await assert.doesNotReject(run.flush(), 'task failures must reject preparation instead of escaping the scheduled task');
  await rejected;
  assert.equal(run.state.classes.has('np-preview-error'), true);
  assert.equal(run.NP.booted, undefined);
  assert.equal(run.queued.length, 0, 'failed initialization must stop the remaining jobs');
});

test('phone handlers wait for the native font stylesheet before initialization', async () => {
  const run = bootstrap([], { holdFont: 'phone-fonts' });
  run.start();
  const prepared = run.NP.preparePreviews();
  await run.flush();
  assert.equal(run.state.phoneHandlers, false, 'an unsettled font stylesheet must keep phone handlers uninitialized');
  assert.equal(run.NP.booted, undefined);
  const font = run.state.fontLinks.find(link => link.dataset.contentFont === 'phone-fonts');
  assert.ok(font, 'preparation must request the native font stylesheet');
  run.queued.push(() => font.onload());
  await run.drain(prepared);
  assert.equal(run.state.phoneHandlers, true);
  assert.equal(run.state.restricted, true);
  assert.equal(run.state.phoneStarts, 1);
});

test('a transient module failure retries automatically without executing dependencies early or replaying successful modules', async () => {
  const modules = ['phone.js', 'dsp.js', 'dependent.js'];
  const run = bootstrap([], { modules, failures: { 'dsp.js': 1 } });
  run.start();
  const prepared = run.NP.preparePreviews();
  const rejected = assert.rejects(prepared, /Unable to load dsp\.js/);
  await run.flush();
  await rejected;
  assert.deepEqual(run.state.preloads, modules, 'all module downloads should start in parallel before ordered execution');
  assert.deepEqual(run.state.moduleRequests, ['phone.js', 'dsp.js', 'dsp.js', 'dependent.js']);
  assert.deepEqual(run.state.moduleRuns, modules, 'a dependent script must wait for its failed prerequisite to recover');
  assert.equal(run.state.phoneStarts, 1);
  assert.equal(run.NP.booted, true);
  assert.equal(run.state.classes.has('np-preview-error'), false);
});

test('an explicit preparation request can resume the failed module before its scheduled retry', async () => {
  const run = bootstrap([], { modules: ['phone.js', 'dsp.js', 'dependent.js'], failures: { 'dsp.js': 1 } });
  run.start();
  const first = run.NP.preparePreviews();
  const rejected = assert.rejects(first, /Unable to load dsp\.js/);
  await run.flush(() => run.state.classes.has('np-preview-error'));
  await rejected;
  assert.deepEqual(run.state.moduleRuns, ['phone.js']);
  assert.equal(run.state.moduleRequests.includes('dependent.js'), false);
  const resumed = run.NP.preparePreviews();
  assert.notEqual(resumed, first, 'a failed download must not permanently cache its rejected preparation promise');
  await run.drain(resumed);
  assert.deepEqual(run.state.moduleRuns, ['phone.js', 'dsp.js', 'dependent.js']);
  assert.equal(run.state.phoneStarts, 1);
});

test('module retries stop after three total attempts and do not install partial preview handlers', async () => {
  const run = bootstrap([], { modules: ['phone.js', 'dsp.js', 'dependent.js'], failures: { 'dsp.js': 10 } });
  run.start();
  const rejected = assert.rejects(run.NP.preparePreviews(), /Unable to load dsp\.js/);
  await run.flush();
  await rejected;
  assert.deepEqual(run.state.moduleRequests, ['phone.js', 'dsp.js', 'dsp.js', 'dsp.js']);
  assert.deepEqual(run.state.moduleRuns, ['phone.js']);
  assert.equal(run.state.phoneStarts, 0);
  assert.equal(run.NP.booted, undefined);
  await assert.rejects(run.NP.preparePreviews(), /Unable to load dsp\.js/);
  assert.equal(run.state.moduleRequests.length, 4, 'exhausted retries must not issue more network requests');
});

test('a failed parallel preload counts toward the same bounded network retry budget', async () => {
  const run = bootstrap([], { modules: ['phone.js', 'dsp.js', 'dependent.js'], failures: { 'dsp.js': 10 }, preloadFailures: ['dsp.js'] });
  run.start();
  const rejected = assert.rejects(run.NP.preparePreviews(), /Unable to load dsp\.js/);
  await run.flush();
  await rejected;
  assert.deepEqual(run.state.moduleRequests, ['phone.js', 'dsp.js', 'dsp.js'], 'one failed preload leaves only two execution fetch attempts');
  assert.deepEqual(run.state.moduleRuns, ['phone.js']);
  assert.equal(run.state.phoneStarts, 0);
});
