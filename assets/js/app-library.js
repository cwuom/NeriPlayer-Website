/* library interactions mirror the Android local, favorite and platform screens */
(function () {
  'use strict';
  var NP = window.NP;
  var base = new URL('../', document.currentScript.src);
  var cover = new URL('img/covers/startrail.jpg', base).href;
  var sampleAudio = new URL('audio/startrail.mp3', base).href;
  var lists = [{ id: 'sample', name: '', tracks: ['startrail'] }];
  var nextId = 0;
  var localTracks = ['startrail'];
  var recent = [];
  var deleted = null;
  var detailSize = null;
  var initialized = false;
  var metrics = { plays: 0, seconds: 0, session: false, first: null, last: null };
  var previousTime = null;
  var previews = new Set();
  var usage = ['sample'];
  var coverColors = new Map();
  var icons = {
    more: 'M12 5a2 2 0 1 0 0 .1zm0 7a2 2 0 1 0 0 .1zm0 7a2 2 0 1 0 0 .1z',
    edit: 'm3 17 11-11 4 4L7 21H3zm13-13 2-2 4 4-2 2z',
    delete: 'M6 7h12l-1 14H7zm2-5h8l1 2h4v2H3V4h4z',
    sort: 'M3 5h18v2H3zm3 6h12v2H6zm3 6h6v2H9z',
    download: 'M11 3h2v9l3-3 1.4 1.4L12 16l-5.4-5.6L8 9l3 3zM4 18h16v3H4z',
    upload: 'M11 16V7l-3 3-1.4-1.4L12 3l5.4 5.6L16 10l-3-3v9zM4 18h16v3H4z',
    queue: 'M3 5h14v2H3zm0 5h14v2H3zm0 5h8v2H3zm12-1 7 4-7 4z',
    queueMusic: 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18A3 3 0 1 0 19 17V8h3V6h-5z',
    select: 'M3 3h18v18H3zm2 2v14h14V5zm3 6 3 3 5-6 1.5 1.3-6.4 7.1L6.5 12.4z',
    drag: 'M3 8h18v2H3zm0 6h18v2H3z',
    refresh: 'M19 8A8 8 0 1 0 20 16h-2a6 6 0 1 1-.4-8H14v2h8V2h-2v5z',
    copy: 'M7 2h14v16H7zm2 2v12h10V4zM3 6h2v14h12v2H3z',
    share: 'M18 2a3 3 0 1 0 1.1 5.8l-9 4.5a3 3 0 1 0 0 3.4l9 4.5A3 3 0 1 0 20 18l-9-4.5 9-4.5A3 3 0 0 0 18 2',
    arrowUp: 'm12 4 8 8-1.5 1.5L13 8v12h-2V8l-5.5 5.5L4 12z',
    arrowDown: 'm12 20-8-8 1.5-1.5L11 16V4h2v12l5.5-5.5L20 12z',
    shuffle: 'm3 4 5 5-1.4 1.4L1.6 5.4zm13-1h6v6h-2V6.4l-6.2 6.2L7.4 19H2v-2h4.6L18.6 5H16zm-1.4 11.6 4 4V16H22v6h-6v-2h2.6l-4-4z',
    repeat: 'm7 3-4 4 4 4V8h12v4h2V6H7zm10 10v3H5v-4H3v6h14v3l4-4z',
    repeatOne: 'm7 3-4 4 4 4V8h12v4h2V6H7zm10 10v3H5v-4H3v6h14v3l4-4zM11 10h2v4h-1v-3h-1z',
    playlistAdd: 'M14 10H3v2h11v-2zm0-4H3v2h11V6zM3 16h7v-2H3v2zm17-4v-4h-2v4h-4v2h4v4h2v-4h4v-2z',
    checkboxBlank: 'M3 3v18h18V3H3zm16 16H5V5h14v14z',
    checkboxChecked: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    headphones: 'M12 2a10 10 0 0 0-10 10v8a2 2 0 0 0 2 2h3v-9H4v-1a8 8 0 0 1 16 0v1h-3v9h3a2 2 0 0 0 2-2v-8A10 10 0 0 0 12 2'
  };
  function glyph(env, key) {
    return icons[key] ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + icons[key] + '"/></svg>' : env.icon(key);
  }
  function hsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2, h = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [(h + 360) % 360, s, l];
  }
  function rgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = l - c / 2;
    var channels = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return channels.map(function (v) { return Math.round((v + m) * 255); });
  }
  function clamp(v, low, high) { return Math.max(low, Math.min(v, high)); }
  function luminance(channels) { return channels.map(function (v) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce(function (sum, v, i) { return sum + v * [.2126, .7152, .0722][i]; }, 0); }
  // adapted from AndroidX Palette's Apache-2.0 color-cut quantizer and target scoring
  // https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:palette/
  function paletteSeed(pixels) {
    var histogram = new Uint32Array(32768), colors = [], boxes = [];
    for (var i = 0; i < pixels.length; i += 4) histogram[(pixels[i] >> 3) << 10 | (pixels[i + 1] >> 3) << 5 | pixels[i + 2] >> 3]++;
    histogram.forEach(function (count, color) { if (count) colors.push(color); });
    function channels(c) { return [c >> 10 & 31, c >> 5 & 31, c & 31]; }
    function fit(lo, hi) {
      var min = [31, 31, 31], max = [0, 0, 0], count = 0;
      for (var j = lo; j <= hi; j++) { var c = channels(colors[j]); count += histogram[colors[j]]; for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[k]); max[k] = Math.max(max[k], c[k]); } }
      return { lo: lo, hi: hi, count: count, ranges: max.map(function (v, k) { return v - min[k]; }), volume: max.reduce(function (v, n, k) { return v * (n - min[k] + 1); }, 1) };
    }
    function offer(box) {
      var at = boxes.length; boxes.push(box);
      while (at > 0) { var parent = (at - 1) >> 1; if (box.volume <= boxes[parent].volume) break; boxes[at] = boxes[parent]; at = parent; }
      boxes[at] = box;
    }
    function poll() {
      var first = boxes[0], last = boxes.pop();
      if (boxes.length) { var at = 0; while (at < boxes.length >> 1) { var child = at * 2 + 1; if (child + 1 < boxes.length && boxes[child + 1].volume > boxes[child].volume) child++; if (last.volume >= boxes[child].volume) break; boxes[at] = boxes[child]; at = child; } boxes[at] = last; }
      return first;
    }
    if (!colors.length) return [128, 128, 128];
    var swatches;
    if (colors.length <= 16) swatches = colors.map(function (c) { return { color: channels(c).map(function (v) { return v << 3; }), count: histogram[c] }; });
    else {
      offer(fit(0, colors.length - 1));
      while (boxes.length < 16) {
        var box = poll(); if (box.hi <= box.lo) { offer(box); break; }
        var axis = box.ranges.indexOf(Math.max.apply(Math, box.ranges));
        function packed(c) { var v = channels(c); return axis === 0 ? c : axis === 1 ? v[1] << 10 | v[0] << 5 | v[2] : v[2] << 10 | v[1] << 5 | v[0]; }
        var sorted = colors.slice(box.lo, box.hi + 1).sort(function (a, b) { return packed(a) - packed(b); });
        for (var j = 0; j < sorted.length; j++) colors[box.lo + j] = sorted[j];
        var sum = 0, split = box.lo;
        for (var j = box.lo; j <= box.hi; j++) { sum += histogram[colors[j]]; if (sum >= Math.floor(box.count / 2)) { split = Math.min(box.hi - 1, j); break; } }
        offer(fit(split + 1, box.hi)); offer(fit(box.lo, split));
      }
      swatches = boxes.map(function (box) { var sum = [0, 0, 0]; for (var j = box.lo; j <= box.hi; j++) { var values = channels(colors[j]), count = histogram[colors[j]]; for (var k = 0; k < 3; k++) sum[k] += values[k] * count; } return { color: sum.map(function (v) { return Math.round(v / box.count) << 3; }), count: box.count }; });
    }
    var dominant = swatches.reduce(function (a, b) { return a.count >= b.count ? a : b; }), used = new Set(), selected = [];
    var targets = [[.35, 1, 1, .55, .74, 1], [.35, 1, 1, .3, .5, .7], [.35, 1, 1, 0, .26, .45], [0, .3, .4, .55, .74, 1], [0, .3, .4, .3, .5, .7], [0, .3, .4, 0, .26, .45]];
    targets.forEach(function (target) {
      var best = null, score = 0;
      swatches.forEach(function (swatch) { var value = hsl(swatch.color); if (used.has(swatch) || value[1] < target[0] || value[1] > target[2] || value[2] < target[3] || value[2] > target[5]) return; var candidate = .24 * (1 - Math.abs(value[1] - target[1])) + .52 * (1 - Math.abs(value[2] - target[4])) + .24 * swatch.count / dominant.count; if (!best || candidate > score) { best = swatch; score = candidate; } });
      selected.push(best); if (best) used.add(best);
    });
    return (selected[1] || selected[4] || dominant).color;
  }
  function visualColors(url, dark) {
    var sample = coverColors.get(url), seed = sample && sample.color || (dark ? [48, 56, 70] : [95, 104, 117]), value = hsl(seed);
    var background = rgb(value[0], clamp(value[1] * .52, .12, .42), dark ? .20 : .36).map(function (v) { return Math.floor(v * (dark ? .82 : .92)); });
    var accent = rgb(value[0], clamp(value[1], .34, .78), dark ? .62 : .48), a = hsl(accent);
    var readable = rgb(a[0], clamp(a[1], .36, .82), dark ? Math.max(a[2], .66) : Math.min(a[2], .38));
    return { '--al-hero-rgb': background.join(','), '--al-hero': 'rgb(' + background + ')', '--al-accent-rgb': accent.join(','), '--al-readable': 'rgb(' + readable + ')', '--al-on-readable': luminance(readable) > .48 ? '#000' : '#fff', '--al-control-rgb': dark ? '255,255,255' : '25,23,18', '--al-control': dark ? 'rgba(255,255,255,.94)' : '#191712' };
  }
  function colorStyle(url, env) { var colors = visualColors(url, env.appearance.mode !== 'light'); return Object.keys(colors).map(function (key) { return key + ':' + colors[key]; }).join(';'); }
  function loadCoverColor(url) {
    if (!url || coverColors.has(url)) return;
    var entry = {}; coverColors.set(url, entry);
    var img = new Image();
    img.onload = function () {
      try {
        var canvas = document.createElement('canvas'), ratio = Math.min(96 / img.naturalWidth, 96 / img.naturalHeight);
        canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        var ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        entry.color = paletteSeed(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
        previews.forEach(function (p) { var frame = p.host.querySelector('.app-preview'); if (!frame) return; var values = visualColors(url, frame.dataset.mode !== 'light'); p.host.querySelectorAll('[data-al-cover]').forEach(function (el) { if (el.dataset.alCover === url) { Object.keys(values).forEach(function (key) { el.style.setProperty(key, values[key]); }); if (el.matches('.al-detail-header')) frame.style.setProperty('--al-status-rgb', values['--al-hero-rgb']); } }); });
      } catch (_) { entry.failed = true; }
    };
    img.onerror = function () { entry.failed = true; };
    img.src = url;
  }
  function act(env, key, label, image, cls, attrs) {
    return env.button('data-al-action="' + key + '"' + (attrs ? ' ' + attrs : ''), (image ? glyph(env, image) : '') + '<span>' + label + '</span>', cls || 'al-action');
  }
  function state(p, env) {
    if (!p.al) p.al = { selected: [], selecting: false, fileTab: 'manual', artistSort: 'count', detailQuery: '', search: false, history: [], panel: '', sort: 'default', order: 1, favoritePlatform: 'netease', tabStates: {}, undo: false, period: 'day', statsSort: 'count', playCounts: {} };
    previews.add(p);
    if (!p.alBound) {
      p.alBound = true;
      var timer;
      var held;
      p.host.addEventListener('pointerdown', function (event) {
        var row = event.target.closest('[data-al-hold]');
        if (!row || event.target.closest('[data-al-menu]') || p.modal || p.al.panel === 'stats') return;
        held = { x: event.clientX, y: event.clientY, row: row };
        timer = setTimeout(function () {
          if (!held) return;
          p.al.suppressClick = { id: row.dataset.alHold, until: performance.now() + 500 };
          p.al.selecting = true;
          p.al.selected = [row.dataset.alHold];
          redraw(p, env, 'selection');
          held = null;
        }, 500);
      });
      function cancel() { clearTimeout(timer); held = null; }
      p.host.addEventListener('pointermove', function (event) { if (held && Math.hypot(event.clientX - held.x, event.clientY - held.y) > 8) cancel(); });
      p.host.addEventListener('pointerup', cancel);
      p.host.addEventListener('pointercancel', cancel);
      p.host.addEventListener('click', function (event) { if (event.target.matches('.ap-dialog-scrim') && event.target.querySelector('.al-menu-options')) close(p); });
      p.host.addEventListener('scroll', function (event) {
        if (event.target.matches('.al-primary')) updateTabFade(event.target);
        if (event.target.matches('.al-detail-content')) updateDetailChrome(p, event.target);
      }, true);
      p.host.addEventListener('contextmenu', function (event) {
        var row = event.target.closest('[data-al-hold]');
        if (!row || p.al.panel === 'stats') return;
        event.preventDefault(); cancel();
        p.al.selecting = true; p.al.selected = [row.dataset.alHold];
        redraw(p, env, 'selection');
      });
      p.host.addEventListener('keydown', function (event) {
        var tab = event.target.closest('[role="tab"]');
        if (tab && /^(ArrowLeft|ArrowRight|Home|End)$/.test(event.key)) {
          var tabList = Array.from(tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
          var index = tabList.indexOf(tab);
          var target = event.key === 'Home' ? 0 : event.key === 'End' ? tabList.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabList.length - 1)) % tabList.length;
          event.preventDefault();
          var selector = tabList[target].hasAttribute('data-ap-source') ? '[data-ap-source="' + tabList[target].dataset.apSource + '"]' : tabList[target].hasAttribute('data-ap-secondary') ? '[data-ap-secondary="' + tabList[target].dataset.apSecondary + '"]' : tabList[target].hasAttribute('data-al-period') ? '[data-al-period="' + tabList[target].dataset.alPeriod + '"]' : '[data-al-file-tab="' + tabList[target].dataset.alFileTab + '"]';
          tabList[target].click();
          var selectedTab = p.host.querySelector(selector); if (selectedTab) selectedTab.focus({ preventScroll: true });
        }
        if (event.key === 'Escape' && !p.modal && (p.playlist || p.al.selecting || p.al.panel)) {
          event.preventDefault(); back(p, env);
        }
        if (event.altKey && /Arrow(Up|Down)/.test(event.key)) {
          var row = event.target.closest('[data-al-row]');
          if (!row || !p.al.selecting || p.playlist) return;
          event.preventDefault(); moveList(p, env, row.dataset.alRow, event.key === 'ArrowUp' ? -1 : 1);
        }
      });
      p.host.addEventListener('dragstart', function (event) {
        var row = event.target.closest('[data-al-row]');
        if (!row || !p.al.selecting || p.playlist) { event.preventDefault(); return; }
        event.dataTransfer.setData('text/plain', row.dataset.alRow);
        event.dataTransfer.effectAllowed = 'move';
      });
      p.host.addEventListener('dragover', function (event) { if (p.al.selecting && event.target.closest('[data-al-row]')) event.preventDefault(); });
      p.host.addEventListener('drop', function (event) {
        var row = event.target.closest('[data-al-row]');
        if (!row || !p.al.selecting || p.playlist) return;
        event.preventDefault();
        var from = lists.findIndex(function (item) { return item.id === event.dataTransfer.getData('text/plain'); });
        var to = lists.findIndex(function (item) { return item.id === row.dataset.alRow; });
        if (from >= 0 && to >= 0 && from !== to) { lists.splice(to, 0, lists.splice(from, 1)[0]); redraw(p, env, 'list'); }
      });
    }
    if (!initialized) {
      initialized = true;
      document.addEventListener('np-demo-data', function () { previews.forEach(function (preview) { if (preview.route === 'library' && !preview.modal) preview.render(); }); });
      var audio = document.getElementById('player');
      if (audio) {
        audio.addEventListener('playing', function () {
          recent = ['startrail'];
          if (!metrics.session) { metrics.plays++; metrics.first = metrics.first || new Date(); metrics.last = new Date(); }
          metrics.session = true; previousTime = audio.currentTime;
          previews.forEach(function (preview) { if (preview.route === 'library' && preview.al.panel && !preview.modal) preview.render(); });
        });
        audio.addEventListener('timeupdate', function () {
          var now = audio.currentTime;
          if (!audio.paused && !audio.seeking && previousTime != null && now > previousTime && now - previousTime < 2) metrics.seconds += (now - previousTime) / audio.playbackRate;
          previousTime = !audio.paused && !audio.seeking ? now : null;
          document.querySelectorAll('[data-al-listen-duration]').forEach(function (output) { output.textContent = listenDuration(metrics.seconds, env); });
        });
        audio.addEventListener('seeking', function () { previousTime = null; });
        audio.addEventListener('seeked', function () { previousTime = audio.paused ? null : audio.currentTime; });
        audio.addEventListener('pause', function () { previousTime = null; });
        audio.addEventListener('ended', function () { previousTime = null; metrics.session = false; });
      }
    }
    return p.al;
  }
  function name(item, env) {
    if (!item) return '';
    return item.id === 'local' ? env.L('本地文件', 'Local files') : item.id === 'liked' ? env.L('我喜欢的音乐', 'Liked songs') : item.id === 'sample' && !item.name ? env.L('NeriPlayer 示例歌单', 'NeriPlayer sample playlist') : item.id === 'artist' ? 'Neri Line' : item.name;
  }
  function playlist(p) {
    var id = p.playlist;
    if (id && id.indexOf('demo:') === 0 && NP.demoData && p.al.demo) {
      var spec = p.al.demo, record = spec.kind === 'playlist' ? NP.demoData.playlist(spec.id) : NP.demoData.track(spec.id);
      if (spec.kind === 'artist') return { id: id, name: 'Neri Line', tracks: NP.demoData.tracks().filter(function (item) { return item.artist === 'Neri Line'; }).map(function (item) { return item.id; }), remote: true, cover: cover, kind: 'artist', source: spec.provider };
      if (record) return { id: id, name: record.name || record.title, tracks: record.trackIds || [record.id], remote: true, cover: record.cover, source: record.source, description: record.description || '', recordId: record.id };
    }
    if (id === 'local') return { id: id, tracks: localTracks.slice() };
    if (id === 'liked') return { id: id, tracks: NP.player.liked ? ['startrail'] : [] };
    if (id === 'artist') return { id: id, tracks: allTracks() };
    if (id === 'week' || id === 'month') return { id: id, name: '', tracks: metrics.seconds >= (id === 'week' ? 600 : 1800) ? ['startrail'] : [] };
    return lists.find(function (item) { return item.id === id; });
  }
  function allTracks() { return localTracks.length || lists.some(function (item) { return item.tracks.length; }) || NP.player.liked ? ['startrail'] : []; }
  function match(query, text) { return !query || text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase().trim()) >= 0; }
  function trackName(env) { return env.L('星轨', 'Startrail'); }
  function updateTabFade(row) {
    row.style.setProperty('--al-left-fade', row.scrollLeft > 1 ? '28px' : '0px');
    row.style.setProperty('--al-right-fade', row.scrollLeft + row.clientWidth < row.scrollWidth - 1 ? '28px' : '0px');
  }
  function emptyCard(env, title, hint, artist) {
    return '<div class="al-empty-card"><span class="ap-library-cover">' + glyph(env, artist ? 'person' : 'queueMusic') + '</span><span><b>' + title + '</b><small>' + hint + '</small></span></div>';
  }
  function search(p, env, hint, detail) {
    var value = detail ? p.al.detailQuery : p.query;
    return '<label class="ap-search">' + glyph(env, 'search') + '<input type="search" ' + (detail ? 'data-al-detail-search' : 'data-ap-search') + ' placeholder="' + hint + '" aria-label="' + hint + '" value="' + env.esc(value) + '">' + env.button((detail ? 'data-al-action="clear-detail"' : 'data-ap-clear') + (!value ? ' hidden' : ''), glyph(env, 'close'), 'ap-icon-button') + '</label>';
  }
  function tabs(p, env, items, current, secondary) {
    var selected = Math.max(0, items.findIndex(function (item) { return item[0] === current; }));
    return '<div class="' + (secondary ? 'ap-secondary-tabs al-secondary' : 'ap-primary-tabs al-primary') + '" role="tablist" aria-label="' + env.L(secondary ? '分类' : '媒体来源', secondary ? 'Categories' : 'Music sources') + '" style="--al-count:' + items.length + ';--al-index:' + selected + '">' + (secondary ? '<i class="al-tab-thumb" aria-hidden="true"></i>' : '') + items.map(function (item) { return env.button((secondary ? 'data-ap-secondary' : 'data-ap-source') + '="' + item[0] + '" role="tab" aria-selected="' + (current === item[0]) + '" tabindex="' + (current === item[0] ? 0 : -1) + '"', item[1], secondary ? 'ap-secondary-tab' : 'ap-source-tab'); }).join('') + '</div>';
  }
  function top(p, env) {
    return p.header(env.L('媒体库', 'Library'), false).replace('</header>', '<div class="al-top-actions">' + act(env, 'stats', env.L('播放统计', 'Playback statistics'), 'stats', 'ap-icon-button') + act(env, 'recent', env.L('最近播放', 'Recently played'), 'history', 'ap-icon-button') + '</div></header>');
  }
  function compact(p, env, title, actions) {
    return '<header class="ap-header al-detail-header">' + env.button('data-ap-back aria-label="' + env.L('返回', 'Back') + '"', glyph(env, 'back'), 'ap-icon-button') + '<h2 tabindex="-1">' + env.esc(title) + '</h2><div class="al-detail-actions">' + (actions || '') + '</div></header>';
  }
  function row(p, env, item) {
    var n = name(item, env), selectable = lists.indexOf(item) >= 0;
    var selected = p.al.selected.indexOf(item.id) >= 0;
    var body = '<span class="ap-library-cover">' + (item.tracks.length ? '<img src="' + cover + '" alt="">' : glyph(env, 'queueMusic')) + '</span><span class="ap-row-copy"><b>' + env.esc(n) + '</b><small>' + item.tracks.length + env.L(' 首', item.tracks.length === 1 ? ' song' : ' songs') + '</small></span>';
    var attrs = p.al.selecting && selectable ? 'data-al-toggle="' + item.id + '" aria-pressed="' + selected + '"' : 'data-ap-open-playlist="' + item.id + '"';
    return '<div class="al-playlist-row' + (selected ? ' is-selected' : '') + '" data-al-row="' + item.id + '"' + (selectable ? ' data-al-hold="' + item.id + '" draggable="' + p.al.selecting + '"' : '') + '>' + (p.al.selecting ? env.button('data-al-toggle="' + item.id + '" role="checkbox" aria-checked="' + selected + '"' + (!selectable ? ' disabled' : ''), '<i class="al-checkbox">' + (selected ? glyph(env, 'check') : '') + '</i>', 'al-check-button') : '') + env.button(attrs, body, 'ap-library-row') + (selectable ? p.al.selecting ? '<div class="al-order-actions">' + act(env, 'move-up', env.L('上移', 'Move up'), 'arrowUp', 'ap-icon-button', 'data-al-id="' + item.id + '"') + act(env, 'move-down', env.L('下移', 'Move down'), 'arrowDown', 'ap-icon-button', 'data-al-id="' + item.id + '"') + '</div>' : env.button('data-al-menu="' + item.id + '" aria-label="' + env.L('更多选项', 'More options') + '"', glyph(env, 'more'), 'ap-icon-button') : '') + '</div>';
  }
  function selection(p, env, detail) {
    var ids = detail ? displayed(p, env).map(function () { return 'startrail'; }) : lists.filter(function (item) { return match(p.query, name(item, env) + (item.tracks.length ? ' Neri Line 星轨 Startrail' : '')); }).map(function (item) { return item.id; });
    return '<div class="al-selection" role="toolbar" aria-label="' + env.L('多选操作', 'Selection actions') + '">' + act(env, 'exit-selection', env.L('退出多选', 'Exit selection'), 'close', 'ap-icon-button') + '<b>' + env.L('已选择 ', 'Selected ') + p.al.selected.length + '</b>' + act(env, 'select-all', p.al.selected.length === ids.length && ids.length ? env.L('取消全选', 'Deselect all') : env.L('全选', 'Select all'), '', 'ap-text-button') + (!detail ? act(env, 'delete-selected', env.L('删除所选', 'Delete selected'), '', 'ap-text-button', !p.al.selected.length ? 'disabled' : '') : '') + '</div>';
  }
  function local(p, env) {
    var artist = p.secondary === 'artists';
    var html = tabs(p, env, [['playlists', env.L('歌单', 'Playlists')], ['artists', env.L('歌手', 'Artists')]], p.secondary, true);
    if (!p.al.selecting) html += '<div class="al-search-row">' + search(p, env, artist ? env.L('搜索本地歌手 / 歌曲', 'Search local artists / songs') : env.L('搜索本地歌单 / 歌曲', 'Search local playlists / songs')) + (artist ? act(env, 'artist-sort', env.L('本地歌手排序', 'Sort local artists'), 'more', 'ap-icon-button') : '') + '</div>';
    if (artist) return html + '<div class="al-results">' + (allTracks().length && match(p.query, 'Neri Line 星轨 Startrail') ? '<div class="al-artist-grid">' + env.button('data-ap-artist', '<img src="' + cover + '" alt=""><b>Neri Line</b><small>' + env.L('1 首', '1 song') + '</small>', 'al-artist') + '</div>' : emptyCard(env, env.L('暂无本地歌手', 'No local artists'), env.L('导入本地音频后，会按歌曲艺术家自动分类', 'Imported local audio is grouped by artist'), true)) + '</div>';
    var items = [{ id: 'liked', tracks: NP.player.liked ? ['startrail'] : [] }].concat(lists).concat([{ id: 'local', tracks: localTracks }]);
    var filtered = items.filter(function (item) { return match(p.query, name(item, env) + (item.tracks.length ? ' Neri Line 星轨 Startrail' : '')); });
    if (p.al.selecting) html += selection(p, env, false);
    html += '<div class="al-results">' + (!p.query ? env.button('data-ap-create' + (p.al.selecting ? ' disabled' : ''), '＋ ' + env.L('新建歌单', 'New playlist'), 'ap-create-playlist') : '') + filtered.map(function (item) { return row(p, env, item); }).join('');
    if (!filtered.length) html += emptyCard(env, env.L('没有找到匹配的本地内容', 'No matching local content'), env.L('试试输入歌单、歌手或歌曲名称', 'Try a playlist, artist or song name'));
    html += '</div>';
    return html;
  }
  function favorites(p, env) {
    var html = tabs(p, env, [['playlists', env.L('歌单', 'Playlists')], ['artists', env.L('歌手', 'Artists')], ['hot', env.L('热点', 'Hot')]], p.secondary, true);
    var followed = NP.demoData && NP.demoData.isArtistFollowed('neri-line');
    if (p.secondary === 'hot') return html + '<div class="al-results">' + ['week', 'month'].map(function (id) { return env.button('data-ap-open-playlist="' + id + '"', '<span class="ap-library-cover">' + glyph(env, 'stats') + '</span><span class="ap-row-copy"><b>' + env.L(id === 'week' ? '本周热点' : '本月热点', id === 'week' ? 'This week' : 'This month') + '</b><small>' + env.L('开始收听后，热点歌曲会显示在这里', 'Eligible tracks appear here after listening') + '</small></span>', 'ap-library-row'); }).join('') + '</div>';
    if (p.secondary === 'playlists' && NP.demoData) {
      var saved = NP.demoData.playlists().filter(function (item) { return NP.demoData.isPlaylistSaved(item.id) && match(p.query, item.name + ' ' + item.artist); });
      if (saved.length) return html + '<div class="al-search-row">' + search(p, env, env.L('搜索当前收藏', 'Search favorites')) + '</div><div class="al-results">' + saved.map(function (item) { return demoRow(env, item); }).join('') + '</div>';
    }
    if (p.secondary === 'artists') html += '<div class="al-platform-options">' + [['netease', env.L('网易云', 'NetEase')], ['bilibili', env.L('B 站', 'Bilibili')], ['youtube', 'YouTube']].map(function (item) { return env.button('data-al-platform="' + item[0] + '" aria-pressed="' + (p.al.favoritePlatform === item[0]) + '"', item[1], 'al-platform-option'); }).join('') + '</div><div class="al-followed-header"><span>' + env.L('关注的歌手', 'Followed artists') + ' · ' + (followed ? 1 : 0) + '</span>' + act(env, 'pull-artists', env.L('拉取远端关注', 'Import followed artists'), 'refresh', 'ap-text-button') + '</div>';
    if (p.secondary === 'artists' && followed && match(p.query, 'Neri Line')) return html + '<div class="al-search-row">' + search(p, env, env.L('搜索当前收藏', 'Search favorites')) + '</div><div class="al-results">' + env.button('data-al-open-artist="neri-line"', '<span class="ap-library-cover"><img src="' + cover + '" alt=""></span><span class="ap-row-copy"><b>Neri Line</b><small>' + env.L('已关注', 'Following') + '</small></span>', 'ap-library-row al-demo-playlist') + '</div>';
    html += '<div class="al-search-row">' + search(p, env, env.L('搜索当前收藏', 'Search favorites')) + '</div><div class="al-results">' + emptyCard(env, env.L(p.secondary === 'artists' ? '暂无关注的歌手' : '暂无收藏歌单', p.secondary === 'artists' ? 'No followed artists' : 'No favorite playlists'), env.L(p.secondary === 'artists' ? '在歌手或创作者详情页点击关注，就能在这里找到' : '在平台歌单详情页收藏后，会显示在这里', p.secondary === 'artists' ? 'Follow artists and creators to find them here' : 'Playlists saved from a platform appear here'), p.secondary === 'artists') + '</div>';
    return html;
  }
  function platform(p, env) {
    if (p.source === 'qq') return env.empty(env.L('QQ音乐功能开发中…', 'QQ Music is in development…'), env.L('敬请期待', 'Coming soon'));
    if (NP.demoData && NP.demoData.account(p.source) && NP.demoData.account(p.source).signedIn) {
      var collections = NP.demoData.playlists(p.source).filter(function (item) { return match(p.query, item.name + ' ' + item.artist); });
      return (p.source === 'netease' ? tabs(p, env, [['playlists', env.L('歌单', 'Playlists')], ['albums', env.L('专辑', 'Albums')]], p.secondary, true) : '') + '<div class="al-search-row">' + search(p, env, env.L('搜索歌单', 'Search playlists')) + '</div><div class="al-results">' + (p.source === 'netease' && p.secondary === 'albums' ? emptyCard(env, env.L('暂无收藏专辑', 'No saved albums'), env.L('收藏专辑后会显示在这里', 'Saved albums appear here')) : collections.map(function (item) { return demoRow(env, item); }).join('')) + '</div><div class="al-platform-footer">' + act(env, 'refresh-platform', env.L('刷新', 'Refresh'), 'refresh', 'ap-text-button') + '</div>';
    }
    var netease = p.source === 'netease', bili = p.source === 'bilibili';
    var title = netease ? env.L(p.secondary === 'albums' ? '还没有加载到网易云专辑' : '还没有加载到网易云歌单', p.secondary === 'albums' ? 'No NetEase albums loaded' : 'No NetEase playlists loaded') : bili ? env.L('还没有加载到哔哩哔哩收藏夹或合集', 'No Bilibili favorites or collections loaded') : env.L('还没有抓到 YouTube Music 歌单', 'No YouTube Music playlists loaded');
    var hint = netease ? env.L('登录网易云音乐账号后，加载收藏的歌单和专辑', 'Sign in to NetEase Music to load saved playlists and albums') : bili ? env.L('确认已登录哔哩哔哩后，会加载创建的收藏夹、订阅收藏夹和收藏的合集', 'Sign in to load created favorites, subscribed favorites and saved collections') : env.L('先确认 YouTube 已登录，随后会从媒体库拉取你的歌单', 'Sign in to YouTube to load playlists from your library');
    return (netease ? tabs(p, env, [['playlists', env.L('歌单', 'Playlists')], ['albums', env.L('专辑', 'Albums')]], p.secondary, true) : '') + (netease || bili ? '<div class="al-search-row">' + search(p, env, netease ? env.L('搜索歌单 / 专辑', 'Search playlists / albums') : env.L('搜索收藏夹 / 合集', 'Search favorites / collections')) + '</div>' : '') + '<div class="al-results">' + env.empty(title, hint, act(env, 'login', env.L('登录', 'Sign in'), 'person', 'ap-text-button', 'data-al-login="' + p.source + '"')) + '</div><div class="al-platform-footer">' + act(env, 'refresh-platform', env.L('刷新', 'Refresh'), 'refresh', 'ap-text-button') + env.button('data-ap-source="local"', env.L('查看本地音乐', 'Explore local music'), 'ap-text-button') + '</div>';
  }
  function demoRow(env, item) {
    return env.button('data-al-open-demo="' + env.esc(item.id) + '" data-al-provider="' + env.esc(item.source) + '"', '<span class="ap-library-cover"><img src="' + env.esc(item.cover) + '" alt=""></span><span class="ap-row-copy"><b>' + env.esc(item.name) + '</b><small>' + item.trackIds.length + env.L(' 首', ' songs') + ' · ' + env.esc(item.artist) + '</small></span>', 'ap-library-row al-demo-playlist');
  }
  function displayed(p, env) {
    var item = playlist(p);
    if (!item) return [];
    if (item.id === 'local' && p.al.fileTab === 'downloaded') return [];
    return item.tracks.filter(function (id) { var song = songRecord(id, env); return match(p.al.detailQuery, song.title + ' ' + song.artist + ' ' + (song.album || '') + (id === 'startrail' ? ' 星轨 Startrail' : '')); });
  }
  function songRecord(id, env) {
    return NP.demoData && NP.demoData.track(id) || (id === 'startrail' ? { id: id, title: trackName(env), artist: 'Neri Line', cover: cover, duration: 72.45, playable: true, audio: sampleAudio } : { id: id, title: id, artist: '', cover: cover, duration: null, playable: false, audio: null });
  }
  function track(p, env, index, id) {
    id = id || 'startrail';
    var selected = p.al.selected.indexOf(id) >= 0, song = songRecord(id, env), isSample = id === 'startrail', remote = !!(playlist(p) && playlist(p).remote);
    var duration = song.duration == null ? '' : Math.floor(song.duration / 60).toString().padStart(2, '0') + ':' + Math.floor(song.duration % 60).toString().padStart(2, '0');
    return '<div class="al-track-row' + (selected ? ' is-selected' : '') + '" data-al-row="' + env.esc(id) + '"' + (isSample && !remote ? ' data-al-hold="startrail"' : '') + '>' + env.button(p.al.selecting ? 'data-al-toggle="' + env.esc(id) + '" role="checkbox" aria-checked="' + selected + '"' : isSample ? 'data-ap-track aria-label="' + env.L('播放星轨', 'Play Startrail') + '"' : 'data-al-demo-track="' + env.esc(id) + '" aria-label="' + env.esc(song.title) + '"', (p.al.selecting ? '<span class="ap-track-number"><i class="al-checkbox">' + (selected ? glyph(env, 'check') : '') + '</i></span>' : '<span class="ap-track-number">' + (index + 1) + '</span>') + '<img src="' + env.esc(song.cover) + '" alt=""><span class="ap-row-copy"><b>' + env.esc(song.title) + '</b><small>' + env.esc(song.artist) + '</small></span><small>' + duration + '</small>' + (isSample && !p.al.selecting ? '<span class="ap-track-playing al-playing-indicator" aria-hidden="true"><i></i><i></i><i></i></span>' : ''), 'ap-track' + (isSample ? '' : ' al-demo-track')) + (!p.al.selecting ? env.button('data-al-menu="' + (isSample && !remote ? 'track' : 'track:' + env.esc(id)) + '" aria-label="' + env.L('歌曲更多选项', 'Song options') + '"', glyph(env, 'more'), 'ap-icon-button') : '') + '</div>';
  }
  function updateDetailChrome(p, scroll) {
    var header = p.host.querySelector('.al-detail-header'), hero = scroll.querySelector('.al-detail-hero'), field = scroll.querySelector('.al-detail-search');
    if (header && hero) {
      var progress = clamp(scroll.scrollTop / hero.offsetHeight, 0, 1), alpha = p.al.selecting ? progress < 1 ? 1 : 0 : 1 - progress, frame = p.host.querySelector('.app-preview');
      header.style.setProperty('--al-chrome-alpha', alpha);
      frame.style.setProperty('--al-status-alpha', alpha);
      frame.style.setProperty('--al-status-rgb', getComputedStyle(header).getPropertyValue('--al-hero-rgb'));
    }
    if (field) field.dataset.docked = scroll.scrollTop >= 106 ? 'true' : 'false';
  }
  function detail(p, env) {
    var item = playlist(p);
    if (!item) { p.playlist = ''; return render(p, env); }
    var title = item.id === 'week' ? env.L('本周热点', 'This week') : item.id === 'month' ? env.L('本月热点', 'This month') : name(item, env);
    var system = item.remote || ['local', 'liked', 'artist', 'week', 'month'].indexOf(item.id) >= 0;
    var actions = act(env, 'detail-search', env.L('搜索歌曲', 'Search songs'), 'search', 'ap-icon-button') + (item.id === 'local' && p.al.fileTab !== 'downloaded' ? act(env, 'scan', env.L('扫描本地音乐', 'Scan local music'), 'library', 'ap-icon-button') : '') + (!system ? act(env, 'rename', env.L('重命名歌单', 'Rename playlist'), 'edit', 'ap-icon-button') + act(env, 'delete', env.L('删除歌单', 'Delete playlist'), 'delete', 'ap-icon-button') : '') + (item.id === 'liked' ? act(env, 'sync', env.L('同步到网易云我喜欢的音乐', 'Sync to NetEase liked songs'), 'refresh', 'ap-icon-button') : '') + (item.remote && p.al.demo.kind === 'playlist' ? act(env, 'demo-save', env.L('收藏歌单', 'Save playlist'), NP.demoData.isPlaylistSaved(item.recordId) ? 'heart' : 'heartOutline', 'ap-icon-button') : '');
    var art = item.cover || (item.tracks.length ? songRecord(item.tracks[0], env).cover : ''), colors = colorStyle(art, env);
    loadCoverColor(art);
    var attributes = ' data-al-cover="' + env.esc(art) + '" style="' + colors + '"';
    var header = compact(p, env, title, actions);
    if (p.al.selecting) {
      var selectedAll = p.al.selected.length > 0 && p.al.selected.length === displayed(p, env).length;
      var selectedActions = act(env, 'remove-selected', env.L('删除所选歌曲', 'Delete selected songs'), 'delete', 'ap-icon-button', !p.al.selected.length ? 'disabled' : '') + act(env, 'select-all', selectedAll ? env.L('取消全选', 'Deselect all') : env.L('全选', 'Select all'), selectedAll ? 'checkboxChecked' : 'checkboxBlank', 'ap-icon-button') + act(env, 'add-selected', env.L('导出到歌单', 'Export playlist'), 'playlistAdd', 'ap-icon-button', !p.al.selected.length ? 'disabled' : '') + act(env, 'selection-more', env.L('更多选项', 'More options'), 'more', 'ap-icon-button');
      header = compact(p, env, env.L('已选 ', '') + p.al.selected.length + env.L(' 项', ' selected'), selectedActions).replace(glyph(env, 'back'), glyph(env, 'close')).replace('al-detail-header', 'al-detail-header al-selection-header');
    }
    var html = header.replace('<header ', '<header' + attributes + ' ') + '<div class="ap-scroll al-detail-content"' + attributes + '>';
    var headerTracks = item.id === 'local' && p.al.fileTab === 'downloaded' ? [] : item.tracks;
    var seconds = headerTracks.reduce(function (total, id) { return total + (songRecord(id, env).duration || 0); }, 0), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
    var duration = headerTracks.some(function (id) { return songRecord(id, env).duration == null; }) ? env.L('正在读取时长', 'Reading duration') : (hours ? hours + env.L('小时', hours === 1 ? ' hour ' : ' hours ') : '') + minutes % 60 + env.L('分钟', minutes % 60 === 1 ? ' minute' : ' minutes');
    var subtitle = duration + ' · ' + headerTracks.length + env.L(' 首 · 播放 ', ' songs · ') + (p.al.playCounts[item.id] || 0) + env.L(' 次', ' plays');
    html += '<div class="al-detail-hero' + (p.al.search && !p.al.selecting ? ' al-detail-hero--search' : '') + '"><div class="al-hero-summary">' + (art ? '<img src="' + env.esc(art) + '" alt="">' : '<span class="al-hero-placeholder" aria-hidden="true"></span>') + '<span><h3>' + env.esc(title) + '</h3><p>' + env.esc(subtitle) + '</p></span></div></div>';
    if (p.al.search && !p.al.selecting) html += '<div class="al-detail-search" data-docked="false">' + search(p, env, env.L('搜索歌单', 'Search playlist'), true) + '</div>';
    html += '<div class="al-detail-sheet-wrap"><div class="al-detail-sheet">';
    if (item.id === 'local') html += '<div class="al-files-tabs" role="tablist">' + [['manual', env.L('手动添加', 'Manually added')], ['downloaded', env.L('已下载', 'Downloaded')]].map(function (tab) { return env.button('data-al-file-tab="' + tab[0] + '" role="tab" aria-selected="' + (p.al.fileTab === tab[0]) + '"', tab[1], 'al-file-tab'); }).join('') + '</div>';
    var playLabel = NP.player.shuffle ? env.L('随机播放', 'Shuffle play') : env.L('全部播放', 'Play all');
    html += '<div class="ap-play-all"><div class="al-play-group">' + env.button((item.remote ? 'data-al-action="demo-play-all"' : 'data-ap-play-all') + ' aria-label="' + playLabel + '"' + (!displayed(p, env).length ? ' disabled' : ''), glyph(env, 'play'), 'ap-play-all-button') + '<span class="al-play-label">' + playLabel + '</span></div><div class="al-play-actions">' + act(env, 'shuffle', env.L('随机播放', 'Shuffle'), 'shuffle', 'ap-icon-button', 'aria-pressed="' + NP.player.shuffle + '"' + (!displayed(p, env).length ? ' disabled' : '')) + act(env, 'repeat', env.L('循环模式', 'Repeat mode'), NP.player.repeat === 2 ? 'repeatOne' : 'repeat', 'ap-icon-button', 'aria-label="' + env.L('循环模式', 'Repeat mode') + '" data-repeat="' + NP.player.repeat + '" aria-pressed="' + (NP.player.repeat !== 0) + '"') + act(env, item.remote ? 'demo-export' : 'add-selected', env.L('导出到本地歌单', 'Add to local playlist'), 'playlistAdd', 'ap-icon-button', !displayed(p, env).length ? 'disabled' : '') + '</div></div>';
    var tracks = displayed(p, env);
    html += '</div></div><div class="al-track-results">' + (tracks.length ? tracks.map(function (id, i) { return track(p, env, i, id); }).join('') : env.empty(env.L(p.al.detailQuery ? '没有找到匹配的歌曲' : item.id === 'local' && p.al.fileTab === 'downloaded' ? '暂无已下载歌曲' : item.id === 'week' || item.id === 'month' ? '暂无符合条件的热点歌曲' : '歌单还是空的', p.al.detailQuery ? 'No matching songs' : item.id === 'local' && p.al.fileTab === 'downloaded' ? 'No downloaded songs' : item.id === 'week' || item.id === 'month' ? 'No eligible hot tracks yet' : 'This playlist is empty'), env.L(item.id === 'week' || item.id === 'month' ? '周榜要求累计听歌 10 分钟，月榜要求 30 分钟' : '可以从歌曲菜单添加到歌单', item.id === 'week' || item.id === 'month' ? 'Weekly tracks require 10 minutes of listening; monthly tracks require 30' : 'Add music from a song’s menu'))) + '</div>';
    requestAnimationFrame(function () { var scroll = p.host.querySelector('.al-detail-content'); if (scroll) updateDetailChrome(p, scroll); });
    return html + toast(p, env) + '</div>';
  }
  function listenDuration(seconds, env) {
    var whole = Math.floor(seconds), minutes = Math.floor(whole / 60), hours = Math.floor(minutes / 60);
    return hours ? hours + env.L(' 小时 ', 'h ') + minutes % 60 + env.L(' 分钟', 'm') : minutes ? minutes + env.L(' 分钟 ', 'm ') + whole % 60 + env.L(' 秒', 's') : whole + env.L(' 秒', 's');
  }
  function panel(p, env) {
    var al = p.al, isRecent = al.panel === 'recent';
    var actions = isRecent ? act(env, 'detail-search', env.L('搜索', 'Search'), 'search', 'ap-icon-button') + act(env, 'play-recent', env.L('全部播放', 'Play all'), 'play', 'ap-icon-button', !recent.length ? 'disabled' : '') + act(env, 'shuffle-recent', env.L('随机播放', 'Shuffle play'), 'queue', 'ap-icon-button', !recent.length ? 'disabled' : '') + act(env, 'clear-recent', env.L('清空最近播放', 'Clear recently played'), 'delete', 'ap-icon-button', !recent.length ? 'disabled' : '') : act(env, 'stats-sort', env.L('排序', 'Sort'), 'sort', 'ap-icon-button') + act(env, 'clear-stats', env.L('清空统计数据', 'Clear statistics'), 'delete', 'ap-icon-button');
    var html = compact(p, env, isRecent ? env.L('最近播放', 'Recently played') : env.L('播放统计', 'Playback statistics'), actions) + '<div class="ap-scroll al-panel-content">';
    if (isRecent) {
      if (al.search) html += search(p, env, env.L('搜索最近播放', 'Search recently played'), true);
      var visible = recent.length && match(al.detailQuery, '星轨 Startrail Neri Line');
      if (al.selecting) html += '<div class="al-selection">' + act(env, 'exit-selection', env.L('退出多选', 'Exit selection'), 'close', 'ap-icon-button') + '<b>' + env.L('已选择 ', 'Selected ') + al.selected.length + '</b>' + act(env, 'select-recent', env.L('全选', 'Select all'), '', 'ap-text-button') + act(env, 'delete-recent-selected', env.L('删除', 'Delete'), '', 'ap-text-button', !al.selected.length ? 'disabled' : '') + '</div>';
      html += visible ? track(p, env, 0) : env.empty(env.L('暂无最近播放', 'No recent plays'), '');
    } else {
      var periods = [['day', env.L('日', 'Day')], ['week', env.L('周', 'Week')], ['month', env.L('月', 'Month')], ['year', env.L('年', 'Year')], ['all', env.L('总', 'All')]];
      html += '<div class="ap-secondary-tabs al-secondary al-stats-periods" role="tablist" style="--al-count:5;--al-index:' + periods.findIndex(function (period) { return period[0] === al.period; }) + '"><i class="al-tab-thumb" aria-hidden="true"></i>' + periods.map(function (period) { return env.button('data-al-period="' + period[0] + '" role="tab" aria-selected="' + (al.period === period[0]) + '"', period[1], 'ap-secondary-tab al-stats-period'); }).join('') + '</div>';
      if (!metrics.plays) html += env.empty(env.L('还没有播放记录', 'No playback history yet'), env.L('开始听歌后这里会显示统计数据', 'Statistics appear here after listening'));
      else html += '<div class="al-stat-summary ap-card"><span>' + glyph(env, 'headphones') + '<b>' + metrics.plays + '</b>' + env.L('播放次数', 'Plays') + '</span><span>' + glyph(env, 'history') + '<b data-al-listen-duration>' + listenDuration(metrics.seconds, env) + '</b>' + env.L('累计时长', 'Total time') + '</span><span>' + glyph(env, 'library') + '<b>1</b>' + env.L('曲目数', 'Tracks') + '</span></div><div class="al-stat-track">' + track(p, env, 0) + '<p>' + env.L('播放 ', 'Played ') + metrics.plays + env.L(' 次 · ', ' times · ') + '<span data-al-listen-duration>' + listenDuration(metrics.seconds, env) + '</span></p></div>';
    }
    return html + toast(p, env) + '</div>';
  }
  function render(p, env) {
    state(p, env);
    if (p.al.panel) return panel(p, env);
    if (p.playlist) return detail(p, env);
    var localTab = ['local', env.L('本地', 'Local')], favorite = ['favorite', env.L('收藏', 'Favorites')], ne = ['netease', env.L('网易云', 'NetEase')], yt = ['youtube', 'YouTube'];
    var international = NP.previewSettings && NP.previewSettings.value('internationalization_enabled');
    var sources = [localTab, favorite].concat(international ? [yt, ne] : [ne, yt]).concat([['bilibili', env.L('哔哩哔哩', 'Bilibili')]]);
    if (NP.previewSettings && NP.previewSettings.value('youtube_enabled') === false) sources = sources.filter(function (item) { return item[0] !== 'youtube'; });
    if (!sources.some(function (item) { return item[0] === p.source; })) { p.source = 'local'; p.secondary = 'playlists'; }
    requestAnimationFrame(function () { var row = p.host.querySelector('.al-primary'); if (row) updateTabFade(row); });
    return top(p, env) + '<div class="ap-scroll ap-library-content al-library-content">' + tabs(p, env, sources, p.source, false) + '<div class="ap-library-panel al-library-panel">' + (p.source === 'local' ? local(p, env) : p.source === 'favorite' ? favorites(p, env) : platform(p, env)) + '</div>' + toast(p, env) + '</div>';
  }
  function toast(p, env) {
    return p.al.message ? '<div class="al-snackbar" role="status"><span>' + env.esc(p.al.message) + '</span>' + (deleted && p.al.undo ? act(env, 'undo', env.L('撤销', 'Undo'), '', 'ap-text-button') : '') + act(env, 'dismiss-message', env.L('关闭', 'Dismiss'), 'close', 'ap-icon-button') + '</div>' : '';
  }
  function redraw(p, env, kind) {
    var focus = document.activeElement, focusSelector;
    if (focus && p.host.contains(focus)) {
      for (var a = 0; a < focus.attributes.length; a++) {
        var attr = focus.attributes[a];
        if (attr.name.indexOf('data-al-') === 0) { focusSelector = '[' + attr.name + '="' + CSS.escape(attr.value) + '"]'; break; }
      }
    }
    var old = {};
    p.host.querySelectorAll('[data-al-row]').forEach(function (el) { old[el.dataset.alRow] = el.getBoundingClientRect(); });
    var thumb = p.host.querySelector('.al-tab-thumb');
    var rect = thumb && thumb.getBoundingClientRect();
    var top = p.host.querySelector('.ap-primary-tabs');
    var left = top ? top.scrollLeft : 0;
    p.render();
    var restored = focusSelector && p.host.querySelector(focusSelector); if (restored) restored.focus({ preventScroll: true });
    top = p.host.querySelector('.ap-primary-tabs');
    if (top) top.scrollLeft = left;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var phone = p.host.querySelector('.app-preview');
    var scale = (Number(getComputedStyle(p.host).getPropertyValue('--s')) || 1) * (phone ? Number(phone.dataset.uiScale) || 1 : 1);
    var fresh = p.host.querySelector('.al-tab-thumb');
    if (kind === 'tab' && rect && fresh) {
      var newRect = fresh.getBoundingClientRect();
      fresh.animate(springFrames((rect.x - newRect.x) / scale), { duration: 360, fill: 'both' });
    }
    p.host.querySelectorAll('[data-al-row]').forEach(function (el) {
      var was = old[el.dataset.alRow], now = el.getBoundingClientRect();
      if (was && Math.abs(was.top - now.top) > 1) el.animate([{ transform: 'translateY(' + (was.top - now.top) / scale + 'px)' }, { transform: 'translateY(0)' }], { duration: 360, easing: 'cubic-bezier(.2,0,0,1)' });
      else if (!was) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
    });
    if (kind === 'selection') {
      var selectionBar = p.host.querySelector('.al-selection');
      if (selectionBar) selectionBar.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.05,.7,.1,1)' });
    }
  }
  function springFrames(distance) {
    var damping = .8, stiffness = 700, omega = Math.sqrt(stiffness), damped = omega * Math.sqrt(1 - damping * damping), frames = [];
    for (var i = 0; i <= 36; i++) {
      var time = i * .01;
      var value = Math.exp(-damping * omega * time) * (Math.cos(damped * time) + damping * omega / damped * Math.sin(damped * time));
      frames.push({ transform: 'translateX(' + (i === 36 ? 0 : distance * value) + 'px)', offset: i / 36, composite: 'add' });
    }
    return frames;
  }
  function message(p, env, text, undo) { p.al.message = text; p.al.undo = !!undo; redraw(p, env, 'list'); }
  function close(p) { if (p.modal && p.closeModal) p.closeModal(); }
  function choices(p, env, title, options) {
    var opener = document.activeElement, anchor = opener && p.host.contains(opener) ? opener.getBoundingClientRect() : null;
    env.openDialog(p, { title: title, body: '<div class="al-menu-options">' + options.map(function (option) { return act(env, option[0], option[1], option[2], 'al-menu-option', option[3] || ''); }).join('') + '</div>', hideConfirm: true });
    var popup = p.host.querySelector('.ap-dialog'), frame = p.host.querySelector('.ap-interface');
    if (anchor && popup && frame) {
      var bounds = frame.getBoundingClientRect(), scale = bounds.width / frame.offsetWidth;
      popup.style.left = Math.max(8, Math.min(frame.clientWidth - popup.offsetWidth - 8, (anchor.right - bounds.left) / scale - popup.offsetWidth)) + 'px';
      popup.style.top = Math.max(8, Math.min(frame.clientHeight - popup.offsetHeight - 8, (anchor.bottom - bounds.top) / scale)) + 'px';
    }
  }
  function error(dialog, text) {
    var output = dialog.querySelector('[data-al-error]');
    if (output) output.textContent = text;
    return false;
  }
  function editName(p, env, item) {
    close(p);
    env.openDialog(p, {
      title: env.L(item ? p.playlist ? '重命名歌单' : '重命名' : '新建歌单', item ? p.playlist ? 'Rename playlist' : 'Rename' : 'New playlist'),
      body: '<input data-ap-playlist-name data-al-name type="text" maxlength="10" aria-label="' + env.L('歌单名称', 'Playlist name') + '" placeholder="' + env.L('输入歌单名称', 'Playlist name') + '" value="' + env.esc(item ? name(item, env).slice(0, 10) : '') + '"><p class="al-form-error" data-al-error role="alert"></p>',
      confirmLabel: env.L(item ? '确定' : '创建', item ? 'Confirm' : 'Create'),
      filledConfirm: true,
      onApply: function (dialog) {
        var value = dialog.querySelector('[data-al-name]').value.trim().slice(0, 10);
        if (!value) return error(dialog, env.L('请输入歌单名称', 'Enter a playlist name'));
        if (['本地文件', '我喜欢的音乐', 'Local files', 'Liked songs', 'Favorites'].some(function (word) { return word.toLowerCase() === value.toLowerCase(); })) return error(dialog, env.L('该名称已保留，请换一个名称', 'This name is reserved'));
        if (lists.some(function (list) { return list !== item && name(list, env).toLowerCase() === value.toLowerCase(); })) return error(dialog, env.L('已存在同名歌单，请换一个名称', 'A playlist with this name already exists'));
        if (item) item.name = value;
        else lists.push({ id: 'custom-' + nextId++, name: value, tracks: [] });
        return true;
      }
    });
    var confirm = p.host.querySelector('[data-ap-extension-apply]');
    if (confirm) confirm.disabled = !(item && name(item, env).trim()) || !!(item && p.playlist);
    p.al.renamingName = item && p.playlist ? name(item, env) : null;
  }
  function confirmDelete(p, env, ids) {
    close(p);
    env.openDialog(p, { title: env.L('确认删除', 'Confirm deletion'), body: '<p>' + env.L('确定要删除所选歌单吗？删除后可通过提示撤销。', 'Delete the selected playlists? You can undo this action.') + '</p>', confirmLabel: env.L('删除', 'Delete'), onApply: function () {
      deleted = { type: 'playlists', lists: lists.slice(), local: localTracks.slice(), liked: NP.player.liked };
      lists = lists.filter(function (item) { return ids.indexOf(item.id) < 0; });
      p.playlist = ''; p.al.selecting = false; p.al.selected = [];
      p.al.message = env.L('已删除歌单', 'Playlists deleted'); p.al.undo = true;
      return true;
    } });
  }
  function addToPlaylist(p, env) {
    close(p);
    env.openDialog(p, { title: env.L('导出到歌单', 'Add to playlist'), body: '<div class="al-add-list">' + lists.map(function (item) { return '<label><input type="checkbox" data-al-target="' + item.id + '"><span>' + env.esc(name(item, env)) + '</span><small>' + item.tracks.length + env.L(' 首', ' songs') + '</small></label>'; }).join('') + act(env, 'create-from-add', env.L('新建歌单', 'New playlist'), 'plus', 'ap-text-button') + '</div><p class="al-form-error" data-al-error role="alert"></p>', confirmLabel: env.L('添加', 'Add'), onApply: function (dialog) {
      var checked = Array.from(dialog.querySelectorAll('[data-al-target]:checked')).map(function (input) { return input.dataset.alTarget; });
      if (!checked.length) return error(dialog, env.L('请选择歌单', 'Choose a playlist'));
      lists.forEach(function (item) { if (checked.indexOf(item.id) >= 0 && item.tracks.indexOf('startrail') < 0) item.tracks.push('startrail'); });
      p.al.message = env.L('已添加到歌单', 'Added to playlist');
      return true;
    } });
  }
  function addTracks(p, env) {
    close(p);
    var current = playlist(p);
    env.openDialog(p, { title: env.L('添加歌曲', 'Add songs'), body: '<label class="al-scan-track"><input type="checkbox" data-al-add-track' + (current && current.tracks.length ? ' checked disabled' : ' checked') + '><img src="' + cover + '" alt=""><span><b>' + trackName(env) + '</b><small>Neri Line · 01:12</small></span></label><p>' + env.L(current && current.tracks.length ? '该歌曲已在歌单中' : '选择要添加的本地歌曲', current && current.tracks.length ? 'This song is already in the playlist' : 'Choose local songs to add') + '</p>', confirmLabel: env.L('添加', 'Add'), onApply: function (dialog) {
      if (current && dialog.querySelector('[data-al-add-track]').checked && !current.tracks.length) current.tracks.push('startrail');
      p.al.message = env.L('已添加到歌单', 'Added to playlist'); return true;
    } });
  }
  function exportLists(p, env, items) {
    var payload = { format: 'NeriPlayer-site-preview', version: 1, playlists: items.map(function (item) { return { name: name(item, env), songs: item.tracks.map(function () { return { sample: 'startrail', title: trackName(env), artist: 'Neri Line', album: 'NeriPlayer PV' }; }) }; }) };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'NeriPlayer-preview-playlists.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    close(p); message(p, env, env.L('导出成功', 'Export complete'));
  }
  function importDialog(p, env) {
    env.openDialog(p, { title: env.L('导入歌单', 'Import playlist'), body: '<p>' + env.L('选择此预览导出的歌单文件，或粘贴备份内容。只有包含实际音源的示例曲会加入曲目。', 'Choose a playlist file exported by this preview or paste its contents. Only tracks with an available sample audio source are included.') + '</p><input data-al-import-file type="file" accept=".json,application/json" aria-label="' + env.L('选择歌单文件', 'Choose playlist file') + '"><textarea data-al-import-json aria-label="' + env.L('歌单 JSON', 'Playlist JSON') + '" spellcheck="false" placeholder="{ &quot;playlists&quot;: [...] }"></textarea><p class="al-form-error" data-al-error role="alert"></p>', confirmLabel: env.L('导入', 'Import'), onApply: function (dialog) {
      var parsed;
      try { parsed = JSON.parse(dialog.querySelector('[data-al-import-json]').value); } catch (_) { return error(dialog, env.L('无法读取歌单文件，请检查 JSON 格式', 'Cannot read this playlist. Check the JSON format.')); }
      if (!parsed || !Array.isArray(parsed.playlists) || parsed.playlists.length > 100) return error(dialog, env.L('请选择有效的歌单备份（最多 100 个歌单）', 'Choose a valid backup containing at most 100 playlists'));
      var staged = [], names = lists.map(function (item) { return name(item, env).toLowerCase(); });
      parsed.playlists.forEach(function (item) {
        if (!item || typeof item.name !== 'string') return;
        var n = item.name.trim().slice(0, 10);
        if (!n || names.indexOf(n.toLowerCase()) >= 0 || /^(本地文件|我喜欢的音乐|Local files|Liked songs)$/i.test(n)) return;
        names.push(n.toLowerCase());
        var tracks = Array.isArray(item.songs) && item.songs.some(function (song) { return song && song.sample === 'startrail'; }) ? ['startrail'] : [];
        staged.push({ id: 'custom-' + nextId++, name: n, tracks: tracks });
      });
      if (!staged.length) return error(dialog, env.L('没有新的歌单需要导入', 'No new playlists to import'));
      lists = lists.concat(staged); p.al.message = env.L('导入完成：', 'Imported: ') + staged.length; return true;
    } });
  }
  function scan(p, env) {
    choices(p, env, env.L('选择扫描方式', 'Choose scan mode'), [['scan-folder', env.L('授权文件夹', 'Choose folder'), 'folder'], ['scan-global', env.L('全局扫描', 'Global scan'), 'library']]);
  }
  function scanPreview(p, env, mode) {
    close(p);
    env.openDialog(p, { title: env.L('预览本地文件', 'Preview local files'), body: '<p>' + env.L(mode === 'folder' ? '授权文件夹只扫描你选择的文件夹及其子文件夹' : '全局扫描会读取设备音乐库', mode === 'folder' ? 'Folder scans include the chosen folder and its subfolders' : 'A global scan reads the device music library') + '</p><label class="al-scan-track"><input type="checkbox" data-al-scan-track checked><img src="' + cover + '" alt=""><span><b>' + trackName(env) + '</b><small>Neri Line · 01:12</small></span></label><p>' + env.L('本地示例目录 · 1 个音频文件', 'Local sample directory · 1 audio file') + '</p>', confirmLabel: env.L('导入选中', 'Import selected'), onApply: function (dialog) {
      if (dialog.querySelector('[data-al-scan-track]').checked) localTracks = ['startrail'];
      p.al.message = env.L('已完成扫描，现有文件已保留', 'Scan complete. Existing files preserved'); return true;
    } });
  }
  function trackDetails(p, env) {
    close(p);
    var rows = [[env.L('文件名', 'File name'), 'startrail.mp3'], [env.L('标题', 'Title'), trackName(env)], [env.L('艺术家', 'Artist'), 'Neri Line'], [env.L('专辑', 'Album'), 'NeriPlayer PV'], [env.L('时长', 'Duration'), '01:12'], [env.L('文件扩展名', 'File extension'), 'mp3'], [env.L('MIME 类型', 'MIME type'), 'audio/mpeg'], [env.L('文件大小', 'File size'), detailSize ? (detailSize / 1048576).toFixed(2) + ' MB' : '—'], [env.L('文件路径', 'File path'), sampleAudio], [env.L('歌词', 'Lyrics'), env.L('已加载', 'Loaded')]];
    env.openDialog(p, { title: env.L('本地歌曲详情', 'Local song details'), body: '<dl class="al-song-details">' + rows.map(function (row) { return '<dt>' + row[0] + '</dt><dd>' + env.esc(row[1]) + '</dd>'; }).join('') + '</dl>', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } });
    if (!detailSize) fetch(sampleAudio, { method: 'HEAD' }).then(function (r) { detailSize = Number(r.headers.get('content-length')) || null; }).catch(function () {});
  }
  function toggleSelection(p, env, id) {
    if (!p.playlist && p.al.panel !== 'recent' && !lists.some(function (item) { return item.id === id; })) return;
    var at = p.al.selected.indexOf(id);
    if (at >= 0) p.al.selected.splice(at, 1); else p.al.selected.push(id);
    redraw(p, env, 'selection');
  }
  function moveList(p, env, id, offset) {
    var at = lists.findIndex(function (item) { return item.id === id; });
    var to = Math.max(0, Math.min(lists.length - 1, at + offset));
    if (at >= 0 && at !== to) { lists.splice(to, 0, lists.splice(at, 1)[0]); redraw(p, env, 'list'); }
  }
  function open(p, env, id) {
    var scroller = p.host.querySelector('.ap-scroll');
    p.al.history.push({ playlist: p.playlist, demo: p.al.demo, query: p.query, secondary: p.secondary, source: p.source, scroll: scroller ? scroller.scrollTop : 0 });
    p.playlist = id; p.al.menuItem = ''; p.al.detailQuery = ''; p.al.search = false; p.al.selecting = false; p.al.selected = [];
    if (id !== 'week' && id !== 'month') usage = [id].concat(usage.filter(function (key) { return key !== id; })).slice(0, 12);
    redraw(p, env, 'detail');
    var next = p.host.querySelector('.ap-scroll'); if (next) next.scrollTop = 0;
  }
  function back(p, env) {
    if (p.al.selecting) { p.al.selecting = false; p.al.selected = []; redraw(p, env, 'selection'); return; }
    if (p.al.panel) { p.al.panel = ''; p.al.search = false; p.al.detailQuery = ''; redraw(p, env, 'detail'); return; }
    var previous = p.al.history.pop();
    if (previous) { p.playlist = previous.playlist; p.al.demo = previous.demo; p.query = previous.query; p.secondary = previous.secondary; p.source = previous.source; }
    else p.playlist = '';
    p.al.menuItem = ''; p.al.detailQuery = ''; p.al.search = false;
    redraw(p, env, 'detail');
    var scroll = p.host.querySelector('.ap-scroll'); if (scroll) scroll.scrollTop = previous ? previous.scroll : 0;
  }
  function openDemo(p, env, spec) {
    state(p, env);
    if (!NP.demoData || !spec || !spec.id) return false;
    if (NP.demoData.playlist(spec.id)) spec = Object.assign({}, spec, { kind: 'playlist' });
    var record = spec.kind === 'playlist' ? NP.demoData.playlist(spec.id) : spec.kind === 'artist' ? NP.demoData.artist(spec.id, spec.provider) : NP.demoData.track(spec.id, spec.provider);
    if (!record) return false;
    if (p.route !== 'library') p.navigate('library');
    var previous = p.al.demo;
    p.al.demo = spec;
    open(p, env, 'demo:' + spec.id);
    p.al.history[p.al.history.length - 1].demo = previous;
    p.playlist = 'demo:' + spec.id;
    p.al.panel = '';
    if (spec.kind === 'playlist') NP.demoData.use(spec.id);
    redraw(p, env, 'detail');
    return true;
  }
  function demoTrackInfo(p, env, id, missing) {
    state(p, env);
    close(p);
    var song = NP.demoData.track(id, p.al.demo && p.al.demo.provider);
    if (!song) return;
    env.openDialog(p, { title: song.title, body: '<dl class="al-song-details"><dt>' + env.L('歌手', 'Artist') + '</dt><dd>' + env.esc(song.artist) + '</dd><dt>' + env.L('专辑', 'Album') + '</dt><dd>' + env.esc(song.album) + '</dd><dt>' + env.L('音源', 'Audio source') + '</dt><dd>' + env.L(song.playable ? '本地演示音频' : '此演示曲目尚未配置音源', song.playable ? 'Local demo audio' : 'No audio source is configured for this demo track') + '</dd></dl>' + (missing ? '<p>' + env.L('可以查看作品资料和收藏；播放需要此曲目的音频文件。', 'You can view and save this work. Playback requires an audio file for this track.') + '</p>' : ''), confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } });
  }
  function playDemo(p, env, id, provider, action) {
    state(p, env);
    var song = NP.demoData && NP.demoData.track(id, provider);
    if (!song) return false;
    action = action || 'play';
    if (action === 'details') { demoTrackInfo(p, env, id, false); return true; }
    if (!song.playable || id !== 'startrail') { demoTrackInfo(p, env, id, true); return true; }
    if (action === 'next' || action === 'end') { if (NP.previewQueue) NP.previewQueue[action](id); return true; }
    if (action === 'download') { close(p); env.openDialog(p, { title: env.L('下载歌曲', 'Download track'), body: '<a class="al-file-link" href="' + sampleAudio + '" download="startrail.mp3">' + env.L('下载星轨 · MP3', 'Download Startrail · MP3') + '</a>', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } }); return true; }
    NP.player.play();
    return true;
  }
  function handle(p, b, env) {
    if (p.route !== 'library') return false;
    state(p, env);
    var d = b.dataset, al = p.al, action = d.alAction;
    if (d.alOpenDemo) { openDemo(p, env, { kind: 'playlist', id: d.alOpenDemo, provider: d.alProvider || p.source }); return true; }
    if (d.alOpenArtist) { openDemo(p, env, { kind: 'artist', id: d.alOpenArtist, provider: al.favoritePlatform }); return true; }
    if (d.alDemoTrack) { demoTrackInfo(p, env, d.alDemoTrack, true); return true; }
    if (al.suppressClick) {
      var heldRow = b.closest('[data-al-hold]');
      var suppress = performance.now() < al.suppressClick.until && heldRow && heldRow.dataset.alHold === al.suppressClick.id;
      al.suppressClick = null;
      if (suppress) return true;
    }
    if ('apBack' in d) { back(p, env); return true; }
    if (d.apSource) {
      al.tabStates[p.source] = { secondary: p.secondary, query: p.query };
      p.source = d.apSource;
      var saved = al.tabStates[p.source]; p.secondary = saved ? saved.secondary : 'playlists'; p.query = saved ? saved.query : '';
      al.selected = []; al.selecting = false; redraw(p, env, 'tab');
      var selected = p.host.querySelector('[data-ap-source="' + p.source + '"]'); if (selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      return true;
    }
    if (d.apSecondary) { p.secondary = d.apSecondary; al.selected = []; al.selecting = false; redraw(p, env, 'tab'); return true; }
    if (d.apOpenPlaylist) { open(p, env, d.apOpenPlaylist); return true; }
    if ('apArtist' in d) { open(p, env, 'artist'); return true; }
    if ('apClear' in d) { p.query = ''; redraw(p, env, 'filter'); var field = p.host.querySelector('[data-ap-search]'); if (field) field.focus({ preventScroll: true }); return true; }
    if ('apCreate' in d) { editName(p, env); return true; }
    if ('apTrack' in d || 'apPlayAll' in d) { if (p.playlist) al.playCounts[p.playlist] = (al.playCounts[p.playlist] || 0) + 1; NP.player.play(); return true; }
    if ('apLike' in d) { NP.player.liked = !NP.player.liked; NP.player.emit(); redraw(p, env, 'list'); return true; }
    if (d.alToggle) { toggleSelection(p, env, d.alToggle); return true; }
    if (d.alFileTab) { al.fileTab = d.alFileTab; al.selected = []; al.selecting = false; redraw(p, env, 'tab'); return true; }
    if (d.alPlatform) { al.favoritePlatform = d.alPlatform; redraw(p, env, 'tab'); return true; }
    if (d.alPeriod) { al.period = d.alPeriod; redraw(p, env, 'tab'); return true; }
    if (d.alMenu) {
      al.menuItem = d.alMenu;
      if (d.alMenu.indexOf('track:') === 0) {
        var demoId = d.alMenu.slice(6), demoSong = NP.demoData.track(demoId);
        al.demoTrack = demoId;
        choices(p, env, demoSong.title, [['demo-info', env.L('歌曲信息详情', 'Song details'), 'info'], ['demo-like', NP.demoData.isTrackLiked(demoId) ? env.L('取消收藏', 'Unlike') : env.L('收藏', 'Like'), NP.demoData.isTrackLiked(demoId) ? 'heart' : 'heartOutline'], ['demo-artist', env.L('查看歌手', 'View artist'), 'person']]);
        return true;
      }
      if (d.alMenu === 'track') choices(p, env, trackName(env), [['song-details', env.L('歌曲信息详情', 'Song details'), 'info'], ['share-song', env.L('分享', 'Share'), 'share'], ['queue-next', env.L('接下来播放…', 'Play next…'), 'queue'], ['queue-end', env.L('添加到队尾', 'Add to queue'), 'plus'], ['like-track', NP.player.liked ? env.L('取消收藏', 'Unlike') : env.L('收藏', 'Like'), NP.player.liked ? 'heart' : 'heartOutline'], ['copy-info', env.L('复制歌曲信息', 'Copy song information'), 'copy'], ['add-selected', env.L('导出到歌单', 'Add to playlist'), 'library'], ['select-tracks', env.L('多选', 'Select'), 'select']]);
      else choices(p, env, name(lists.find(function (item) { return item.id === d.alMenu; }), env), [['rename', env.L('重命名', 'Rename')], ['delete', env.L('删除', 'Delete')]]);
      return true;
    }
    if (!action) return false;
    var item = b.closest('.ap-dialog') && al.menuItem && al.menuItem !== 'track' ? lists.find(function (list) { return list.id === al.menuItem; }) : playlist(p);
    switch (action) {
      case 'demo-info': demoTrackInfo(p, env, al.demoTrack, false); break;
      case 'demo-like': close(p); if (al.demoTrack === 'startrail') { NP.player.liked = !NP.player.liked; if (NP.demoData.isTrackLiked('startrail') !== NP.player.liked) NP.demoData.toggleTrackLike('startrail'); NP.player.emit(); } else NP.demoData.toggleTrackLike(al.demoTrack); redraw(p, env, 'list'); break;
      case 'demo-artist': close(p); openDemo(p, env, { kind: 'artist', id: 'neri-line', provider: al.demo && al.demo.provider }); break;
      case 'demo-save': NP.demoData.savePlaylist(item.recordId); redraw(p, env, 'list'); break;
      case 'demo-play-all': {
        var available = displayed(p, env).find(function (id) { return songRecord(id, env).playable; });
        if (available === 'startrail') { NP.player.play(); al.playCounts[item.id] = (al.playCounts[item.id] || 0) + 1; redraw(p, env, 'list'); }
        else if (item.tracks.length) demoTrackInfo(p, env, item.tracks[0], true);
        break;
      }
      case 'demo-export': env.openDialog(p, { title: env.L('导出到本地歌单', 'Export to local playlist'), body: '<p>' + env.L('此页展示本地模拟的平台歌单资料。批量导出操作请在 Android 应用中使用。', 'This page displays locally simulated platform playlist metadata. Use the Android app for bulk export.') + '</p>', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } }); break;
      case 'rename': editName(p, env, item); break;
      case 'delete': if (item) confirmDelete(p, env, [item.id]); break;
      case 'select-lists': close(p); al.selecting = true; al.selected = item ? [item.id] : []; redraw(p, env, 'selection'); break;
      case 'select-tracks': close(p); al.selecting = true; al.selected = []; redraw(p, env, 'selection'); break;
      case 'selection-more': choices(p, env, env.L('更多选项', 'More options'), [['sync', env.L('同步到网易云歌单', 'Sync to a NetEase playlist'), 'refresh']]); break;
      case 'exit-selection': al.selecting = false; al.selected = []; redraw(p, env, 'selection'); break;
      case 'select-all': {
        var visible = p.playlist ? displayed(p, env).map(function () { return 'startrail'; }) : lists.filter(function (list) { return match(p.query, name(list, env) + (list.tracks.length ? ' Neri Line 星轨 Startrail' : '')); }).map(function (list) { return list.id; });
        al.selected = al.selected.length === visible.length ? [] : visible; redraw(p, env, 'selection'); break;
      }
      case 'delete-selected': confirmDelete(p, env, al.selected.slice()); break;
      case 'move-up': moveList(p, env, d.alId, -1); break;
      case 'move-down': moveList(p, env, d.alId, 1); break;
      case 'track-sort': choices(p, env, env.L('排序与多选', 'Sort and select'), [['select-tracks', env.L('多选', 'Select'), 'select'], ['sort-default', env.L('默认顺序', 'Default order'), 'sort'], ['sort-title', env.L('按歌曲名称', 'By song title'), 'music'], ['sort-artist', env.L('按歌手名称', 'By artist name'), 'person'], ['sort-duration', env.L('按时长', 'By duration'), 'history']]); break;
      case 'shuffle': NP.player.shuffle = !NP.player.shuffle; NP.player.emit(); redraw(p, env, 'list'); break;
      case 'repeat': NP.player.repeat = (NP.player.repeat + 1) % 3; NP.player.emit(); redraw(p, env, 'list'); break;
      case 'artist-sort': choices(p, env, env.L('本地歌手排序', 'Sort local artists'), [['sort-count', env.L('按歌曲数量排序', 'By song count'), al.artistSort === 'count' ? 'check' : 'sort'], ['sort-recent', env.L('按最近添加排序', 'Recently added'), al.artistSort === 'recent' ? 'check' : 'history'], ['sort-name', env.L('按名称排序', 'By name'), al.artistSort === 'name' ? 'check' : 'person']]); break;
      case 'sort-count': case 'sort-recent': case 'sort-name': al.artistSort = action.slice(5); close(p); redraw(p, env, 'list'); break;
      case 'sort-default': case 'sort-title': case 'sort-artist': case 'sort-duration': al.sort = action.slice(5); close(p); message(p, env, env.L('排序已更新', 'Sort order updated')); break;
      case 'detail-search': al.search = !al.search; if (!al.search) al.detailQuery = ''; redraw(p, env, 'filter'); if (al.search) p.host.querySelector('[data-al-detail-search]').focus({ preventScroll: true }); break;
      case 'clear-detail': al.detailQuery = ''; redraw(p, env, 'filter'); p.host.querySelector('[data-al-detail-search]').focus({ preventScroll: true }); break;
      case 'add-tracks': addTracks(p, env); break;
      case 'add-selected': addToPlaylist(p, env); break;
      case 'create-from-add': editName(p, env); break;
      case 'remove-selected': {
        close(p);
        env.openDialog(p, { title: env.L('删除所选歌曲', 'Remove selected songs'), body: '<p>' + env.L('从当前歌单移除所选歌曲？音频文件会保留。', 'Remove selected songs from this playlist? Audio files will be kept.') + '</p>', confirmLabel: env.L('删除', 'Remove'), onApply: function () {
          deleted = { type: 'tracks', lists: lists.map(function (list) { return { id: list.id, name: list.name, tracks: list.tracks.slice() }; }), local: localTracks.slice(), liked: NP.player.liked };
          if (p.playlist === 'local') localTracks = []; else if (p.playlist === 'liked') { NP.player.liked = false; NP.player.emit(); } else if (playlist(p)) playlist(p).tracks = [];
          al.selected = []; al.selecting = false; al.message = env.L('已移除歌曲', 'Songs removed'); al.undo = true; return true;
        } }); break;
      }
      case 'undo': if (deleted) { lists = deleted.lists; localTracks = deleted.local; NP.player.liked = deleted.liked; NP.player.emit(); deleted = null; al.undo = false; message(p, env, env.L('已撤销', 'Undone')); } break;
      case 'export': if (item) exportLists(p, env, [item]); break;
      case 'export-all': exportLists(p, env, lists); break;
      case 'import': importDialog(p, env); break;
      case 'scan': scan(p, env); break;
      case 'scan-folder': scanPreview(p, env, 'folder'); break;
      case 'scan-global': scanPreview(p, env, 'global'); break;
      case 'song-details': trackDetails(p, env); break;
      case 'like-track': close(p); NP.player.liked = !NP.player.liked; NP.player.emit(); redraw(p, env, 'list'); break;
      case 'queue-next': case 'queue-selected': close(p); if (NP.previewQueue) NP.previewQueue.next('startrail'); message(p, env, env.L('已添加到接下来播放', 'Added to play next')); break;
      case 'queue-end': close(p); if (NP.previewQueue) NP.previewQueue.end('startrail'); message(p, env, env.L('已添加到队尾', 'Added to queue')); break;
      case 'copy-info': close(p); navigator.clipboard.writeText(trackName(env) + '-Neri Line').then(function () { message(p, env, env.L('已复制', 'Copied')); }).catch(function () { env.openDialog(p, { title: env.L('歌曲信息', 'Song information'), body: '<input readonly value="' + env.esc(trackName(env) + '-Neri Line') + '">', onApply: function () { return true; } }); }); break;
      case 'share-song': close(p); env.openDialog(p, { title: env.L('分享', 'Share'), body: '<p>' + trackName(env) + ' · Neri Line</p><a class="al-file-link" href="' + sampleAudio + '" download="startrail.mp3">' + env.L('保存音频文件', 'Save audio file') + '</a><p>' + env.L('NeriPlayer PV 示例曲', 'NeriPlayer PV sample track') + '</p>', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } }); break;
      case 'sync': choices(p, env, env.L('同步到网易云？', 'Sync to NetEase?'), [['login', env.L('请先登录网易云音乐账号', 'Sign in to NetEase Music first'), 'person', 'data-al-login="netease"']]); break;
      case 'login': close(p); p.accountProvider = d.alLogin || p.source; env.navigate(p, 'accounts'); break;
      case 'pull-artists': message(p, env, NP.demoData && NP.demoData.account(al.favoritePlatform) && NP.demoData.account(al.favoritePlatform).signedIn ? env.L('关注歌手已刷新', 'Followed artists refreshed') : env.L('请先登录对应平台账号', 'Sign in to the corresponding platform first')); break;
      case 'refresh-platform': message(p, env, NP.demoData && NP.demoData.account(p.source) && NP.demoData.account(p.source).signedIn ? env.L('歌单已刷新', 'Playlists refreshed') : env.L('请先登录对应平台账号', 'Sign in to the corresponding platform first')); break;
      case 'recent': al.panel = 'recent'; redraw(p, env, 'detail'); break;
      case 'stats': al.panel = 'stats'; al.search = false; al.detailQuery = ''; al.selecting = false; al.selected = []; redraw(p, env, 'detail'); break;
      case 'stats-sort': choices(p, env, env.L('排序', 'Sort'), [['stats-count', env.L('按播放次数', 'By play count'), al.statsSort === 'count' ? 'check' : 'stats'], ['stats-time', env.L('按累计时长', 'By listening time'), al.statsSort === 'time' ? 'check' : 'history'], ['stats-recent', env.L('按最近播放', 'Most recently played'), al.statsSort === 'recent' ? 'check' : 'history'], ['stats-first', env.L('按首次播放', 'First played'), al.statsSort === 'first' ? 'check' : 'history']]); break;
      case 'stats-count': case 'stats-time': case 'stats-recent': case 'stats-first': al.statsSort = action.slice(6); close(p); redraw(p, env, 'list'); break;
      case 'clear-stats': env.openDialog(p, { title: env.L('清空统计数据', 'Clear statistics'), body: '<p>' + env.L('确定要清空所有播放统计数据吗？此操作不可撤销。', 'Clear all playback statistics? This cannot be undone.') + '</p>', confirmLabel: env.L('清空', 'Clear'), onApply: function () { metrics.plays = 0; metrics.seconds = 0; metrics.first = null; metrics.last = null; return true; } }); break;
      case 'play-recent': case 'shuffle-recent': NP.player.play(); break;
      case 'select-recent': al.selected = al.selected.length ? [] : recent.slice(); redraw(p, env, 'selection'); break;
      case 'delete-recent-selected': env.openDialog(p, { title: env.L('删除所选记录', 'Delete selected history'), body: '<p>' + env.L('确定要删除所选播放记录吗？', 'Delete the selected history entries?') + '</p>', confirmLabel: env.L('删除', 'Delete'), onApply: function () { recent = recent.filter(function (id) { return al.selected.indexOf(id) < 0; }); al.selecting = false; al.selected = []; return true; } }); break;
      case 'clear-recent': env.openDialog(p, { title: env.L('清空最近播放', 'Clear recently played'), body: '<p>' + env.L('确定要清空全部最近播放记录吗？此操作不可恢复。', 'Clear all recent plays? This cannot be undone.') + '</p>', confirmLabel: env.L('清空', 'Clear'), onApply: function () { recent = []; al.selecting = false; al.selected = []; return true; } }); break;
      case 'dismiss-message': al.message = ''; al.undo = false; redraw(p, env); break;
      default: return false;
    }
    return true;
  }
  function input(p, event, env) {
    if (p.route !== 'library') return false;
    state(p, env);
    var el = event.target;
    // native change fires during blur; rendering again while replacing the focused input is reentrant
    if (event.type === 'change' && el.matches('[data-ap-search],[data-al-detail-search],[data-al-name]')) return true;
    if (el.matches('[data-ap-search]')) {
      p.query = el.value;
      var start = el.selectionStart;
      redraw(p, env, 'filter');
      var replacement = p.host.querySelector('[data-ap-search]'); if (replacement) { replacement.focus({ preventScroll: true }); if (start != null && replacement.type !== 'search') replacement.setSelectionRange(start, start); }
      return true;
    }
    if (el.matches('[data-al-detail-search]')) {
      p.al.detailQuery = el.value;
      var at = el.selectionStart;
      redraw(p, env, 'filter');
      var fresh = p.host.querySelector('[data-al-detail-search]'); if (fresh) { fresh.focus({ preventScroll: true }); if (at != null && fresh.type !== 'search') fresh.setSelectionRange(at, at); }
      return true;
    }
    if (el.matches('[data-al-import-file]') && el.files && el.files[0]) {
      var dialog = el.closest('.ap-dialog');
      if (el.files[0].size > 1048576) { error(dialog, env.L('文件过大，请选择 1 MB 以内的歌单文件', 'Choose a playlist file smaller than 1 MB')); return true; }
      el.files[0].text().then(function (text) { if (dialog.isConnected) dialog.querySelector('[data-al-import-json]').value = text; }).catch(function () { error(dialog, env.L('文件读取失败', 'Could not read this file')); });
      return true;
    }
    if (el.matches('[data-al-name]')) { var dialog = el.closest('.ap-dialog'), err = dialog.querySelector('[data-al-error]'); if (err) err.textContent = ''; var confirm = dialog.querySelector('[data-ap-extension-apply]'); if (confirm) confirm.disabled = !el.value.trim() || el.value.trim() === p.al.renamingName; return true; }
    return false;
  }
  NP.previewLibrary = { render: render, handle: handle, input: input, openDemo: openDemo, playDemo: playDemo, snapshot: function (env) {
    var items = [{ id: 'liked', tracks: NP.player.liked ? ['startrail'] : [] }].concat(lists).concat([{ id: 'local', tracks: localTracks }, { id: 'artist', tracks: allTracks() }]);
    return { usage: usage.filter(function (id) { return items.some(function (item) { return item.id === id; }); }), playlists: items.map(function (item) { return { id: item.id, name: name(item, env), count: item.tracks.length, cover: item.tracks.length ? cover : '' }; }) };
  }, removeUsage: function (id) { usage = usage.filter(function (key) { return key !== id; }); }, openPlaylist: function (p, env, id) {
    state(p, env); p.navigate('library'); open(p, env, id);
  }, openPanel: function (p, env, key) {
    state(p, env); p.al.panel = key; p.al.search = false; p.al.detailQuery = ''; p.al.selected = []; p.al.selecting = false; redraw(p, env, 'detail');
  } };
})();
