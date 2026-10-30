/* home and explore use the same local content and account state as the other previews */
(function () {
  'use strict';
  var NP = window.NP, history = [], instances = new Set();
  var tagLabels = [['全部','All'],['流行','Pop'],['影视原声','Soundtrack'],['华语','Chinese'],['怀旧','Nostalgia'],['摇滚','Rock'],['ACG','ACG'],['欧美','Western'],['清新','Fresh'],['夜晚','Night'],['儿童','Children'],['民谣','Folk'],['日语','Japanese'],['浪漫','Romantic'],['学习','Study'],['韩语','Korean'],['工作','Work'],['电子','Electronic'],['粤语','Cantonese'],['舞曲','Dance'],['伤感','Sad'],['游戏','Game'],['下午茶','Afternoon tea'],['治愈','Healing'],['说唱','Rap'],['轻音乐','Light music']];
  function setting(key, fallback) { var value = NP.previewSettings && NP.previewSettings.value(key); return value === undefined ? fallback : value; }
  function intl() { return setting('internationalization_enabled', false) && setting('youtube_enabled', true); }
  function icon(env, type) {
    var typePaths = {
      queueMusic: 'M22 6h-5v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6zM15 6H3v2h12V6zM15 10H3v2h12v-2zM11 14H3v2h8v-2z',
      accountCircle: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 6c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zM12 20c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z',
      musicNote: 'M12 3l.01 10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4.01 4S14 19.21 14 17V7h4V3h-6zM10.01 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
      playCircle: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM10 16.5v-9l6 4.5z'
    };
    if (typePaths[type]) return '<svg viewBox="0 0 24 24" aria-hidden="true" data-ah-icon="' + type + '"><path fill="currentColor" d="' + typePaths[type] + '"/></svg>';
    if (type === 'refresh') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 8A8 8 0 1 0 20 16h-2a6 6 0 1 1-.4-8H14v2h8V2h-2v5z"/></svg>';
    if (type === 'more') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>';
    if (type === 'next') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5v14l10-7zM17 5h2v14h-2z"/></svg>';
    if (type === 'download') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7zM5 18v3h14v-3z"/></svg>';
    return env.icon(type);
  }
  function button(env, action, label, glyph, cls, extra) { return env.button('data-ah-action="' + action + '"' + (extra ? ' ' + extra : ''), (glyph ? icon(env, glyph) : '') + '<span>' + label + '</span>', cls || 'ap-text-button'); }
  function get(p, env) {
    if (!p.ah) p.ah = { source: intl() ? 'youtube' : 'netease', types: { netease: 'song', youtube: 'song' }, query: '', tag: 0, result: null, pending: false, message: '', timer: null, removed: '', returnScroll: 0 };
    instances.add(p);
    if (p.ah.international !== intl()) { p.ah.international = intl(); if (p.ah.international) p.ah.source = 'youtube'; }
    if (!setting('youtube_enabled', true) && p.ah.source === 'youtube') p.ah.source = 'netease';
    if (!p.ahBound) {
      p.ahBound = true;
      p.host.addEventListener('keydown', function (event) {
        if (event.target.matches('[data-ah-query]') && event.key === 'Enter') { event.preventDefault(); submit(p, env); }
        var tab = event.target.closest('[data-ah-source],[data-ah-type]');
        if (tab && /^(ArrowLeft|ArrowRight|Home|End)$/.test(event.key)) {
          var items = Array.from(tab.parentElement.querySelectorAll('[role="tab"]'));
          var at = items.indexOf(tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length;
          var attr = tab.hasAttribute('data-ah-source') ? 'data-ah-source' : 'data-ah-type', value = items[next].getAttribute(attr);
          event.preventDefault(); items[next].click(); var selected = p.host.querySelector('[' + attr + '="' + value + '"]'); if (selected) selected.focus({ preventScroll: true });
        }
      });
      var timer, touchStart;
      p.host.addEventListener('contextmenu', function (event) { var card = event.target.closest('[data-ah-continue]'); if (card) { event.preventDefault(); continueMenu(p, env, card.dataset.ahContinue); } });
      p.host.addEventListener('pointerdown', function (event) {
        var card = event.target.closest('[data-ah-continue]'); if (!card) return;
        touchStart = { x: event.clientX, y: event.clientY };
        timer = setTimeout(function () { p.ah.held = performance.now() + 500; continueMenu(p, env, card.dataset.ahContinue); }, 500);
      });
      p.host.addEventListener('pointermove', function (event) { if (touchStart && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 8) { clearTimeout(timer); touchStart = null; } });
      p.host.addEventListener('pointerup', function () { clearTimeout(timer); touchStart = null; });
      p.host.addEventListener('pointercancel', function () { clearTimeout(timer); touchStart = null; });
    }
    return p.ah;
  }
  function redraw(p, env, motion) {
    var active = document.activeElement, inputFocused = active && active.matches('[data-ah-query]');
    var focused;
    if (active && p.host.contains(active)) Array.from(active.attributes).some(function (attr) { if (attr.name.indexOf('data-ah-') === 0) { focused = '[' + attr.name + '="' + CSS.escape(attr.value) + '"]'; return true; } return false; });
    var sourceX = p.host.querySelector('.ah-source-thumb');
    var oldX = sourceX && sourceX.getBoundingClientRect().x;
    var tags = p.host.querySelector('.ah-tags'), tagScroll = tags ? tags.scrollLeft : 0;
    p.render();
    if (inputFocused) { var input = p.host.querySelector('[data-ah-query]'); if (input) input.focus({ preventScroll: true }); }
    else if (focused) { var control = p.host.querySelector(focused); if (control) control.focus({ preventScroll: true }); }
    tags = p.host.querySelector('.ah-tags'); if (tags) tags.scrollLeft = tagScroll;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (motion === 'source') {
      var fresh = p.host.querySelector('.ah-source-thumb');
      if (fresh && oldX != null) {
        var scale = p.host.querySelector('.app-preview').getBoundingClientRect().width / 411;
        var offset = (oldX - fresh.getBoundingClientRect().x) / scale;
        fresh.animate([{ transform: 'translateX(' + offset + 'px)', composite: 'add' }, { transform: 'translateX(0)', composite: 'add' }], { duration: 360, easing: 'cubic-bezier(.2,0,0,1)' });
      }
      var types = p.host.querySelector('.ah-search-types');
      if (types) types.animate([{ opacity: 0, transform: 'translateY(' + (p.ah.source === 'youtube' ? 8 : -8) + 'px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.4,0,.2,1)' });
    }
  }
  function login(p, env, provider) { p.accountProvider = provider; env.navigate(p, 'accounts'); }
  function signedIn(provider) { var account = NP.demoData && NP.demoData.account(provider); return account && account.signedIn; }
  function demoAttrs(item) { return 'data-ah-demo="' + item.id + '" data-ah-kind="' + item.kind + '" data-ah-provider="' + item.provider + '"'; }
  function songRow(item, index, env, radar, search) {
    var duration = item.duration ? '<time>' + Math.floor(item.duration / 60) + ':' + String(Math.floor(item.duration % 60)).padStart(2, '0') + '</time>' : '';
    return '<div class="ah-song-row' + (search ? ' ah-song-search' : '') + '"' + (radar ? ' data-ah-radar-track="' + item.id + '"' : '') + '>' + env.button(demoAttrs(item), '<i class="ah-song-index">' + (index + 1) + '</i><img src="' + item.cover + '" alt=""><span><b>' + env.esc(item.name) + '</b><small>' + env.esc(item.artist + (search ? ' · ' : ' / ') + item.album) + '</small></span>' + (search ? duration : '') , 'ah-song-open') + button(env, 'demo-menu', env.L('更多选项', 'More options'), 'more', 'ap-icon-button ah-song-more', 'data-ah-id="' + item.id + '" data-ah-provider="' + item.provider + '"') + '</div>';
  }
  function playlistCard(item, env, shelf) {
    var count = item.playCount >= 10000 ? env.L((item.playCount / 10000).toFixed(1) + '万', (item.playCount / 1000).toFixed(1) + 'k') : item.playCount.toLocaleString(NP.lang === 'en' ? 'en-US' : 'zh-CN');
    var caption = env.esc(item.name), subtitle = count + ' · ' + item.count + env.L('首', ' songs');
    return env.button(demoAttrs(item) + (shelf ? ' data-ah-shelf-card="' + item.id + '"' : ''), '<div class="ah-artwork"><img src="' + item.cover + '" alt="" loading="lazy">' + (shelf ? '<em>' + env.L('雷达', 'Radar') + '</em>' : '<div class="ah-featured-caption" style="--ah-cover:url(&quot;' + item.cover + '&quot;)"><b>' + caption + '</b><small>' + env.esc(subtitle) + '</small></div>') + '</div><span class="ah-playlist-caption"><b>' + caption + '</b><small>' + env.esc(subtitle) + '</small></span>', shelf ? 'ah-shelf-card' : 'ah-browse-card');
  }
  function feedGate(provider, env) { return '<div class="ah-feed-empty"><p>' + env.L('请登录后启用', 'Sign in to enable') + '</p>' + button(env, 'login', env.L('登录', 'Sign in'), 'person', 'ap-text-button', 'data-ah-provider="' + provider + '"') + '<small>' + env.L('点右上角刷新重试~', 'Use refresh in the top right to retry') + '</small></div>'; }
  function section(title, glyph, content, env, extra) { return '<section class="ah-home-section"' + (extra || '') + '><h3>' + icon(env, glyph) + title + '</h3>' + content + '</section>'; }
  function home(p, env) {
    var offline = setting('offline_mode', false), international = intl(), snapshot = NP.previewLibrary.snapshot(env);
    var html = p.header('NeriPlayer', false).replace('class="ap-header', 'class="ap-header ah-home-bar').replace('</header>', button(env, 'refresh', env.L('刷新推荐', 'Refresh recommendations'), 'refresh', 'ap-icon-button ah-home-refresh', offline ? 'disabled' : '') + '</header>') + '<div class="ap-scroll ah-home-content">';
    if (env.style() === 'clean') html += button(env, 'open-search', env.L('搜索关键词', 'Search keywords'), 'search', 'ah-search-entry');
    var usage = snapshot.usage.map(function (id) { return snapshot.playlists.find(function (item) { return item.id === id; }); }).filter(Boolean);
    if (NP.demoData) usage = usage.concat(NP.demoData.usage().map(NP.demoData.playlist).filter(Boolean));
    var visible = false;
    if (setting('home_card_continue', true) && usage.length) {
      visible = true;
      html += '<section class="ah-home-section"><h3>' + icon(env, 'history') + env.L('继续播放', 'Continue listening') + '</h3><div class="ah-continue-cards">' + usage.map(function (item) { return '<div class="ah-continue-card" data-ah-continue="' + item.id + '">' + env.button('data-ah-open="' + item.id + '"', (item.cover ? '<img src="' + item.cover + '" alt="">' : '<i>' + icon(env, 'library') + '</i>') + '<b>' + env.esc(item.name) + '</b><small>' + item.count + env.L(' 首', ' songs') + '</small>', 'ah-continue-open') + button(env, 'continue-menu', env.L('更多选项', 'More options'), 'more', 'ap-icon-button ah-continue-menu', 'data-ah-id="' + item.id + '"') + '</div>'; }).join('') + '</div></section>';
    }
    if (!offline) {
      var provider = international ? 'youtube' : 'netease', feed = NP.demoData && NP.demoData.home(provider);
      if (setting('home_card_radar', true)) {
        visible = true;
        html += section(international ? env.L('每日发现', 'Daily discovery') : env.L('私人雷达', 'Personal radar'), 'music', feed ? '<div class="ah-song-list">' + feed.radar.map(function (item, index) { return songRow(item, index, env, true); }).join('') + '</div>' : feedGate(provider, env), env);
        if (feed) html += section(env.L('雷达歌单', 'Radar playlists'), 'library', '<div class="ah-playlist-shelf">' + feed.radarPlaylists.map(function (item) { return playlistCard(item, env, true); }).join('') + '</div>', env);
      }
      if (!international && setting('home_card_bilibili', true)) {
        visible = true;
        var bili = NP.demoData && NP.demoData.home('bilibili');
        html += section(env.L('Bilibili 音乐榜', 'Bilibili music charts'), 'music', bili ? '<div class="ah-song-list">' + bili.trending.map(function (item, index) { return songRow(item, index, env); }).join('') + '</div>' : feedGate('bilibili', env), env);
        html += section(env.L('Bilibili 音乐热门', 'Trending Bilibili music'), 'music', bili ? '<div class="ah-browse-grid">' + bili.recommended.slice(0, 2).map(function (item) { return playlistCard(item, env); }).join('') + '</div>' : feedGate('bilibili', env), env);
      }
      if (setting('home_card_trending', true)) {
        visible = true;
        html += section(international ? env.L('猜你喜欢', 'You might like') : env.L('热力飙升', 'Trending'), 'music', feed ? '<div class="ah-song-list">' + feed.trending.map(function (item, index) { return songRow(item, index, env); }).join('') + '</div>' : feedGate(provider, env), env);
      }
      if (setting('home_card_recommended', true)) {
        visible = true;
        html += section(international ? env.L('更多推荐', 'More recommendations') : env.L('为你推荐', 'Recommended for you'), 'library', feed ? '<div class="ah-browse-grid">' + feed.recommended.map(function (item) { return playlistCard(item, env); }).join('') + '</div>' : feedGate(provider, env), env);
      }
    }
    if (!visible) html += env.empty(env.L(offline ? '脱机模式下仅显示继续播放，暂无可显示内容。' : '首页卡片已全部隐藏，可在设置中重新开启。', offline ? 'Offline mode shows Continue only. No content is available.' : 'All Home cards are hidden. Enable them in Settings.'), button(env, 'personalization', env.L('个性化', 'Personalization'), 'settings', 'ap-text-button'));
    if (p.ah.message) html += '<div class="ah-message" role="status">' + env.esc(p.ah.message) + '</div>';
    return html + '</div>';
  }
  function sourceTabs(p, env) {
    var yt = ['youtube', 'YouTube'], ne = ['netease', env.L('网易云', 'NetEase')], bili = ['bilibili', env.L('哔哩哔哩', 'Bilibili')], links = ['links', env.L('链接', 'Links')];
    var sources = setting('youtube_enabled', true) ? intl() ? [yt, ne, bili, links] : [ne, bili, yt, links] : [ne, bili, links];
    return '<div class="ah-source-tabs" role="tablist" aria-label="' + env.L('搜索来源', 'Search sources') + '" style="--ah-count:' + sources.length + ';--ah-index:' + Math.max(0, sources.findIndex(function (source) { return source[0] === p.ah.source; })) + '"><i class="ah-source-thumb" aria-hidden="true"></i>' + sources.map(function (item) { return env.button('data-ah-source="' + item[0] + '" role="tab" aria-selected="' + (p.ah.source === item[0]) + '" tabindex="' + (p.ah.source === item[0] ? 0 : -1) + '"', item[1], 'ah-source-tab'); }).join('') + '</div>';
  }
  function historyRow(p, env) {
    if (!setting('explore_search_history_enabled', true) || !history.length || p.ah.source === 'links') return '';
    var items = history.filter(function (item) { return !p.ah.query || item.toLowerCase().indexOf(p.ah.query.toLowerCase()) >= 0; });
    if (!items.length) return '';
    return '<div class="ah-search-history"><div><span>' + icon(env, 'history') + env.L('搜索历史', 'Search history') + '</span>' + (!p.ah.query ? button(env, 'clear-history', env.L('清空', 'Clear'), '', 'ap-text-button') : '') + '</div><div class="ah-history-chips">' + items.map(function (item) { return '<div class="ah-history-chip">' + env.button('data-ah-history="' + env.esc(item) + '"', env.esc(item), 'ah-history-open') + env.button('data-ah-remove-history="' + env.esc(item) + '" aria-label="' + env.L('移除', 'Remove') + ' ' + env.esc(item) + '"', icon(env, 'close'), 'ah-history-remove') + '</div>'; }).join('') + '</div></div>';
  }
  function searchTypes(p, env) {
    var source = p.ah.source;
    if (source !== 'netease' && source !== 'youtube') return '';
    var types = source === 'netease' ? [['song', env.L('歌曲', 'Songs')], ['playlist', env.L('歌单', 'Playlists')], ['artist', env.L('歌手', 'Artists')]] : [['song', env.L('歌曲', 'Songs')], ['video', env.L('视频', 'Videos')], ['creator', env.L('创作者', 'Creators')]];
    return '<div class="ah-search-types" role="tablist" aria-label="' + env.L('搜索类型', 'Search type') + '">' + types.map(function (item) { return env.button('data-ah-type="' + item[0] + '" role="tab" aria-selected="' + (p.ah.types[source] === item[0]) + '"', '<span class="ah-tag-pill">' + icon(env, item[0] === 'song' ? 'musicNote' : item[0] === 'playlist' ? 'queueMusic' : item[0] === 'video' ? 'playCircle' : 'accountCircle') + item[1] + '</span>', 'ah-tag'); }).join('') + '</div>';
  }
  function demoSearch(items, env) {
    if (!items.length) return '<div class="ah-search-status">' + env.L('暂无搜索结果', 'No search results') + '</div>';
    return '<div class="ah-search-list">' + items.map(function (item, index) {
      if (item.kind === 'track' || item.kind === 'video') return songRow(item, index, env, false, true);
      var subtitle = item.kind === 'playlist' ? item.count + env.L('首 · ', ' songs · ') + item.creator : env.L('歌手 · ', 'Artist · ') + item.trackIds.length + env.L('首歌曲', ' songs');
      return env.button(demoAttrs(item), '<img src="' + item.cover + '" alt=""' + (item.kind === 'artist' ? ' class="ah-artist-cover"' : '') + '><span><b>' + env.esc(item.name) + '</b><small>' + env.esc(subtitle) + '</small></span>', 'ah-collection-row');
    }).join('') + '</div>';
  }
  function results(p, env) {
    var s = p.ah;
    if (setting('offline_mode', false)) return '<div class="ah-search-status"><b>' + env.L('脱机模式', 'Offline mode') + '</b><p>' + env.L('探索在脱机模式下不可用', 'Explore is unavailable in offline mode') + '</p></div>';
    if (s.pending) return '<div class="ah-search-status" role="status"><i class="ah-spinner"></i>' + env.L('搜索中…', 'Searching…') + '</div>';
    if (s.query) {
      if (s.source === 'links') {
        if (!s.result) return env.empty(env.L('无法识别这个链接', 'Unable to recognize this link'), '');
        return '<div class="ah-link-result">' + env.button('data-ah-action="link-details"', '<i>' + icon(env, s.result.kind === 'song' || s.result.kind === 'video' ? 'music' : 'library') + '</i><span><b>' + env.esc(s.result.name) + '</b><small>' + env.esc(s.result.provider) + ' · ' + env.esc(s.result.id) + '</small></span>', 'ah-link-open') + button(env, 'result-menu', env.L('更多选项', 'More options'), 'more', 'ap-icon-button') + '</div><p class="ah-account-note">' + env.L('请先登录对应平台账号', 'Sign in to the corresponding platform first') + '</p>';
      }
      if (signedIn(s.source)) return demoSearch(NP.demoData.search(s.source, s.types[s.source] || 'video', s.query), env);
      return feedGate(s.source, env);
    }
    if (s.source === 'links') return '<div class="ah-search-status">' + env.L('粘贴音乐链接即可识别', 'Paste a music link to recognize it') + '</div>';
    var tags = s.source === 'netease' ? '<div class="ah-tags">' + tagLabels.map(function (pair, index) { return env.button('data-ah-tag="' + index + '" aria-pressed="' + (s.tag === index) + '"', '<span class="ah-tag-pill">' + env.L(pair[0], pair[1]) + '</span>', 'ah-tag'); }).join('') + '</div>' : '';
    if (!signedIn(s.source)) return tags + feedGate(s.source, env);
    var items = NP.demoData.browse(s.source, s.source === 'netease' ? s.tag : 0);
    return tags + '<div class="ah-browse-grid">' + items.map(function (item) { return playlistCard(item, env); }).join('') + '</div>';
  }
  function explore(p, env) {
    var s = p.ah, links = s.source === 'links';
    var needsLogin = s.source === 'netease' && !signedIn(s.source);
    return p.header(env.L('探索', 'Explore'), false) + '<div class="ap-scroll ah-explore-content"><div class="ah-search-panel"><label class="ap-search">' + icon(env, 'search') + '<input type="search" data-ap-search data-ah-query placeholder="' + env.L(links ? '粘贴网易云、B 站或 YouTube 链接' : needsLogin ? '登录网易云后才能搜索' : '搜索关键词', links ? 'Paste a NetEase, Bilibili or YouTube link' : needsLogin ? 'Sign in to NetEase to search' : 'Search keywords') + '" aria-label="' + env.L(links ? '链接或分享文案' : '搜索关键词', links ? 'Link or share text' : 'Search keywords') + '" value="' + env.esc(s.query) + '">' + button(env, 'clear-query', env.L('清空', 'Clear'), 'close', 'ap-icon-button', !s.query ? 'hidden' : '') + '</label>' + historyRow(p, env) + (needsLogin ? '<p class="ah-login-error">' + env.L('网易云未登录，暂不支持搜索', 'Sign in to NetEase Music to search') + '</p>' : links ? '<p class="ah-link-hint">' + env.L('支持歌曲、视频、歌单和歌手链接，也可直接粘贴含标题和短链接的整段分享文案', 'Supports song, video, playlist and artist links, including share text') + '</p>' : '') + sourceTabs(p, env) + searchTypes(p, env) + '</div><div class="ah-explore-results">' + results(p, env) + '</div></div>';
  }
  function recognize(text, env) {
    var match = /https?:\/\/[^\s<>"'，。]+/.exec(text), url;
    if (!match) return null;
    try { url = new URL(match[0].replace(/[.,)）】\]}>》]+$/, '')); } catch (_) { return null; }
    var host = url.hostname.toLowerCase(), path = url.pathname, provider, kind, id;
    if (/(^|\.)music\.163\.com$/.test(host)) {
      var fragment = url.hash.slice(1), params = new URLSearchParams(url.search);
      new URLSearchParams(fragment.split('?')[1]).forEach(function (value, key) { params.set(key, value); });
      id = params.get('id'); var found = /\/(song|playlist|artist)/.exec(path + '/' + fragment.split('?')[0]);
      if (!found || !/^\d+$/.test(id || '')) return null; kind = found[1]; provider = 'netease';
    } else if (/(^|\.)bilibili\.com$/.test(host)) {
      var bv = /BV[\da-zA-Z]+/.exec(url.href), av = /av(\d+)/i.exec(path), media = /\/medialist\/detail\/ml(\d+)/.exec(path);
      if (bv || av) { id = bv ? bv[0] : 'av' + av[1]; kind = 'video'; }
      else if (media) { id = media[1]; kind = 'playlist'; }
      else if (url.searchParams.get('fid')) { id = url.searchParams.get('fid'); kind = 'playlist'; }
      else return null;
      provider = 'bilibili';
    } else if (host === 'youtu.be' || /(^|\.)youtube(?:-nocookie)?\.com$/.test(host)) {
      var video = host === 'youtu.be' ? path.split('/')[1] : url.searchParams.get('v') || /\/(?:shorts|embed)\/([^/?]+)/.exec(path)?.[1];
      var list = url.searchParams.get('list');
      if (!video && !list) return null; id = video || list; kind = video ? 'video' : 'playlist'; provider = 'youtube';
    } else return null;
    var typeName = kind === 'song' ? env.L('歌曲', 'song') : kind === 'playlist' ? env.L('歌单', 'playlist') : kind === 'artist' ? env.L('歌手', 'artist') : env.L('视频', 'video');
    return { provider: provider, kind: kind, id: id, url: url.href, name: (provider === 'netease' ? env.L('网易云', 'NetEase') : provider === 'youtube' ? 'YouTube' : env.L('B 站', 'Bilibili')) + ' ' + typeName + ' ' + id };
  }
  function submit(p, env) {
    var s = p.ah; clearTimeout(s.timer); s.pending = false; s.query = s.query.trim();
    s.result = s.source === 'links' ? recognize(s.query, env) : null;
    if (s.query && s.source !== 'links' && setting('explore_search_history_enabled', true)) history = [s.query].concat(history.filter(function (item) { return item.toLowerCase() !== s.query.toLowerCase(); })).slice(0, 15);
    if (p.route === 'explore') redraw(p, env, 'results');
  }
  function continueMenu(p, env, id) {
    p.ah.removed = id;
    env.openDialog(p, { title: env.L('继续播放', 'Continue listening'), body: button(env, 'remove-continue', env.L('移除', 'Remove'), 'close', 'ah-menu-row'), confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } });
  }
  function resultMenu(p, env) {
    var s = p.ah, item = s.result;
    env.openDialog(p, { title: env.L('更多选项', 'More options'), body: button(env, 'link-details', env.L('查看信息', 'View information'), 'info', 'ah-menu-row') + button(env, 'copy-link', env.L('复制链接', 'Copy link'), 'library', 'ah-menu-row') + '<a class="ah-menu-row" href="' + env.esc(item.url) + '" target="_blank" rel="noopener">' + icon(env, 'chevron') + env.L('打开原链接', 'Open original link') + '</a>' + button(env, 'login', env.L('登录', 'Sign in'), 'person', 'ah-menu-row', 'data-ah-provider="' + item.provider + '"'), confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } });
  }
  function openDemo(p, env, item) {
    if (p.modal) p.closeModal();
    if (NP.previewLibrary.openDemo) NP.previewLibrary.openDemo(p, env, item);
    else {
      var record = item.kind === 'playlist' ? NP.demoData.playlist(item.id) : item.kind === 'artist' ? NP.demoData.artist(item.id, item.provider) : NP.demoData.track(item.id, item.provider);
      env.openDialog(p, { title: record.name, body: '<dl class="al-song-details"><dt>' + env.L('创作者', 'Creator') + '</dt><dd>' + env.esc(record.artist) + '</dd><dt>' + env.L('来源', 'Source') + '</dt><dd>' + env.L('本地演示内容', 'Local demo content') + '</dd></dl>', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } });
    }
  }
  function demoMenu(p, env, id, provider) {
    var item = NP.demoData.track(id, provider);
    p.ah.menuTrack = item;
    env.openDialog(p, { title: item.name, body: button(env, 'demo-play', env.L('立即播放', 'Play now'), 'play', 'ah-menu-row') + button(env, 'demo-next', env.L('下一首播放', 'Play next'), 'next', 'ah-menu-row') + button(env, 'demo-end', env.L('添加到播放队列末尾', 'Add to end of queue'), 'library', 'ah-menu-row') + button(env, 'demo-download', env.L('下载', 'Download'), 'download', 'ah-menu-row') + button(env, 'demo-like', NP.demoData.isTrackLiked(id) ? env.L('取消收藏', 'Remove from favorites') : env.L('收藏', 'Add to favorites'), 'heart', 'ah-menu-row') + button(env, 'demo-copy', env.L('复制歌曲信息', 'Copy song information'), 'library', 'ah-menu-row') + button(env, 'demo-details', env.L('歌曲信息', 'Song information'), 'info', 'ah-menu-row') + button(env, 'demo-artist', env.L('查看歌手', 'View artist'), 'person', 'ah-menu-row'), confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } });
  }
  function handle(p, b, env) {
    if (p.route !== 'home' && p.route !== 'explore') return false;
    var s = get(p, env), d = b.dataset;
    if (d.ahDemo) { if ((d.ahKind === 'track' || d.ahKind === 'video') && NP.previewLibrary.playDemo) NP.previewLibrary.playDemo(p, env, d.ahDemo, d.ahProvider, 'play'); else openDemo(p, env, { kind: d.ahKind, id: d.ahDemo, provider: d.ahProvider }); return true; }
    if (d.ahOpen) { if (s.held && performance.now() < s.held) { s.held = 0; return true; } var demo = NP.demoData && NP.demoData.playlist(d.ahOpen); if (demo) openDemo(p, env, demo); else NP.previewLibrary.openPlaylist(p, env, d.ahOpen); return true; }
    if (d.ahSource) { var old = s.source; s.source = d.ahSource; if (old === 'links' || s.source === 'links') { s.query = ''; s.result = null; s.pending = false; clearTimeout(s.timer); } redraw(p, env, 'source'); return true; }
    if (d.ahType) { s.types[s.source] = d.ahType; redraw(p, env, 'source'); return true; }
    if (d.ahTag != null) { s.tag = Number(d.ahTag); redraw(p, env); return true; }
    if (d.ahHistory) { s.query = d.ahHistory; submit(p, env); return true; }
    if (d.ahRemoveHistory) { history = history.filter(function (item) { return item !== d.ahRemoveHistory; }); redraw(p, env); return true; }
    switch (d.ahAction) {
      case 'open-search': p.navigate('explore'); get(p, env); var field = p.host.querySelector('[data-ah-query]'); if (field) field.focus({ preventScroll: true }); return true;
      case 'refresh': s.message = signedIn(intl() ? 'youtube' : 'netease') ? env.L('推荐已刷新', 'Recommendations refreshed') : env.L('请先登录对应平台账号', 'Sign in to the corresponding platform first'); redraw(p, env); return true;
      case 'login': if (p.modal) p.closeModal(); login(p, env, d.ahProvider || s.source); return true;
      case 'personalization': env.navigate(p, 'personalization'); return true;
      case 'clear-query': s.query = ''; s.result = null; s.pending = false; clearTimeout(s.timer); redraw(p, env); var input = p.host.querySelector('[data-ah-query]'); if (input) input.focus({ preventScroll: true }); return true;
      case 'clear-history': history = []; redraw(p, env); return true;
      case 'continue-menu': continueMenu(p, env, d.ahId); return true;
      case 'remove-continue': if (NP.demoData && NP.demoData.playlist(s.removed)) NP.demoData.removeUsage(s.removed); else NP.previewLibrary.removeUsage(s.removed); p.closeModal(); env.refresh(); return true;
      case 'demo-menu': demoMenu(p, env, d.ahId, d.ahProvider); return true;
      case 'demo-play': case 'demo-next': case 'demo-end': case 'demo-download': case 'demo-details': if (NP.previewLibrary.playDemo) NP.previewLibrary.playDemo(p, env, s.menuTrack.id, s.menuTrack.provider, d.ahAction.replace('demo-', '')); else openDemo(p, env, s.menuTrack); return true;
      case 'demo-artist': openDemo(p, env, { kind: 'artist', id: 'neri-line', provider: s.menuTrack.provider }); return true;
      case 'demo-like': { var liked = NP.demoData.toggleTrackLike(s.menuTrack.id); if (s.menuTrack.id === 'startrail') { NP.player.liked = liked; NP.player.emit('like'); } p.closeModal(); return true; }
      case 'demo-copy': {
        var info = s.menuTrack.name + '\n' + s.menuTrack.artist + '\n' + s.menuTrack.album;
        var showCopy = function () { env.openDialog(p, { title: env.L('复制歌曲信息', 'Copy song information'), body: '<textarea readonly aria-label="' + env.L('歌曲信息', 'Song information') + '">' + env.esc(info) + '</textarea>', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } }); };
        if (navigator.clipboard) navigator.clipboard.writeText(info).then(function () { p.closeModal(); s.message = env.L('已复制', 'Copied'); redraw(p, env); }).catch(showCopy); else showCopy();
        return true;
      }
      case 'result-menu': resultMenu(p, env); return true;
      case 'copy-link': {
        var fallback = function () { env.openDialog(p, { title: env.L('复制链接', 'Copy link'), body: '<input type="text" readonly value="' + env.esc(s.result.url) + '" aria-label="URL">', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } }); };
        if (navigator.clipboard) navigator.clipboard.writeText(s.result.url).then(function () { if (p.modal) p.closeModal(); s.message = env.L('已复制', 'Copied'); redraw(p, env); }).catch(fallback); else fallback();
        return true;
      }
      case 'link-details': env.openDialog(p, { title: env.L('链接信息', 'Link information'), body: '<dl class="al-song-details"><dt>' + env.L('名称', 'Name') + '</dt><dd>' + env.esc(s.result.name) + '</dd><dt>ID</dt><dd>' + env.esc(s.result.id) + '</dd><dt>URL</dt><dd>' + env.esc(s.result.url) + '</dd></dl><p>' + env.L('请先登录对应平台账号', 'Sign in to the corresponding platform first') + '</p>', confirmLabel: env.L('关闭', 'Close'), onApply: function () { return true; } }); return true;
      default: return false;
    }
  }
  function input(p, event, env) {
    if (p.route !== 'home' && p.route !== 'explore' || !event.target.matches('[data-ah-query]')) return false;
    if (event.type === 'change') return true;
    var s = get(p, env); s.query = event.target.value; s.pending = !!s.query; s.result = null; clearTimeout(s.timer);
    redraw(p, env); s.timer = setTimeout(function () { submit(p, env); }, 300);
    return true;
  }
  function fromOriginal(ph, target, event) {
    if (!ph || ph.id !== 'phHome' || ph._previewOwner || !target.closest) return false;
    var entry = target.closest('.hm-search,.hm-top button,.hm-card,.hm-list li');
    if (!entry || !ph.contains(entry)) return false;
    var kind = entry.matches('.hm-search') ? 'search' : entry.matches('.hm-top button') ? 'refresh' : 'cloud';
    if (entry.matches('.hm-card') && entry.parentElement === ph.querySelector('.hm-cards')) {
      var index = Array.from(entry.parentElement.children).indexOf(entry);
      if (index === 0) kind = 'local';
      else if (index === 1) kind = 'artist';
    }
    if (event) { event.preventDefault(); event.stopImmediatePropagation(); }
    var preview = NP.appPreview.fromPhone(ph, kind === 'search' ? 'explore' : kind === 'refresh' ? 'home' : 'library');
    var control;
    if (kind === 'search') {
      control = preview.host.querySelector('[data-ah-query]');
      if (control) control.focus({ preventScroll: true });
    } else if (kind === 'refresh') {
      control = preview.host.querySelector('[data-ah-action="refresh"]');
      if (control) control.click();
    } else {
      control = preview.host.querySelector('[data-ap-source="' + (kind === 'cloud' ? 'netease' : 'local') + '"]');
      if (control) control.click();
      if (kind === 'local') control = preview.host.querySelector('[data-ap-open-playlist="local"]');
      else if (kind === 'artist') {
        control = preview.host.querySelector('[data-ap-secondary="artists"]');
        if (control) control.click();
        control = preview.host.querySelector('[data-ap-artist]');
      } else control = null;
      if (control) control.click();
    }
    return true;
  }
  document.querySelectorAll('#phHome .hm-search,#phHome .hm-card,#phHome .hm-list li').forEach(function (entry) {
    entry.tabIndex = 0; entry.setAttribute('role', 'button');
    entry.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); entry.click(); } });
  });
  document.addEventListener('np-preview-setting', function () { instances.forEach(function (p) { if (p.route === 'home' || p.route === 'explore') p.render(); }); });
  document.addEventListener('np-demo-data', function () { instances.forEach(function (p) { if (p.route === 'home' || p.route === 'explore') p.render(); }); });
  NP.previewHome = { render: function (p, env) { get(p, env); return p.route === 'home' ? home(p, env) : explore(p, env); }, handle: handle, input: input, fromOriginal: fromOriginal };
})();
