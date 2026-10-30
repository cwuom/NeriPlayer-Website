/* settings and library previews follow the Android screens; all audio uses the shared sample */
(function () {
  'use strict';
  var NP = window.NP;
  var base = new URL('../', document.currentScript.src);
  var cover = new URL('img/covers/startrail.jpg', base).href;
  var instances = [];
  var appearance = { mode: 'dark', scale: 1 };
  var lists = [];
  var modalOwner = null;
  var inertRegions = [];
  function environment(preview) {
    return { L: L, esc: esc, icon: icon, button: button, intro: intro, empty: empty, appearance: appearance, style: style, refresh: refresh,
      navigate: function (p, key) { p.navigate('settings', key); },
      openDialog: function (p, config) { p.modalOpener = rememberFocus(document.activeElement, p.host); p.dialogConfig = config; p.modal = 'extension'; p.render(); },
      openDsp: function (p) { p.openNative('dsp'); }, openPlayer: function (p) { p.openNative('player'); },
      cover: cover, title: title, preview: preview };
  }
  var paths = {
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20z',
    search: 'M9.5 3a6.5 6.5 0 1 0 3.98 11.64L19 20.16 20.16 19l-5.52-5.52A6.5 6.5 0 0 0 9.5 3m0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9',
    play: 'M8 5v14l11-7z', pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
    library: 'M4 6H2v16h16v-2H4zm3-4v16h15V2zm2 2h11v12H9zm3 2v7a2 2 0 1 0 2-2V6z',
    settings: 'm19.43 12.98.04-.98-.04-.98 2.11-1.65-2-3.46-2.49 1a8 8 0 0 0-1.69-.98L15 3h-4l-.36 2.93c-.61.25-1.17.58-1.69.98l-2.49-1-2 3.46 2.11 1.65-.04.98.04.98-2.11 1.65 2 3.46 2.49-1c.52.4 1.08.73 1.69.98L11 21h4l.36-2.93a8 8 0 0 0 1.69-.98l2.49 1 2-3.46zM13 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8',
    home: 'm12 3 10 9h-3v9h-5v-6h-4v6H5v-9H2z',
    heart: 'M12 21 3.3 12.4C-2 7 5.4-.9 12 5.3 18.6-.9 26 7 20.7 12.4z',
    heartOutline: 'm12 18.2 7.2-7.2C23 7.2 17.7 1.8 12 8 6.3 1.8 1 7.2 4.8 11zM12 21 3.3 12.4C-2 7 5.4-.9 12 5.3 18.6-.9 26 7 20.7 12.4z',
    chevron: 'm9 6 6 6-6 6-1.4-1.4 4.6-4.6-4.6-4.6z',
    palette: 'M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.8-4.3c-.6-.6-.2-1.7.7-1.7h1a6 6 0 0 0 0-12zm-5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m4-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3',
    tune: 'M3 6h9V4h2v2h7v2h-7v2h-2V8H3zm0 10h4v-2h2v2h12v2H9v2H7v-2H3z',
    eq: 'M3 10h3v5H3zm5-6h3v16H8zm5 3h3v11h-3zm5 3h3v5h-3z',
    sun: 'M11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4 3l3 3-1 1-3-3zm13 14 3 3 1-1-3-3zm0-11 3-3 1 1-3 3zM3 20l3-3 1 1-3 3zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12',
    moon: 'M20.7 14A9 9 0 0 1 10 3.3 9 9 0 1 0 20.7 14',
    check: 'm9 16.2-4.2-4.2L3.4 13.4 9 19l12-12-1.4-1.4z',
    close: 'm6 4 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6z',
    folder: 'M10 4H2v16h20V6H12z',
    music: 'M12 3v10.6a4 4 0 1 0 2 3.4V7h6V3z',
    person: 'M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 12c-5 0-9 2.5-9 5v3h18v-3c0-2.5-4-5-9-5',
    plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
    info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-1 4h2v2h-2zm0 4h2v8h-2z',
    history: 'M13 3a9 9 0 1 1-8.5 12H7a6.5 6.5 0 1 0 1.4-7L11 11H3V3l3 3a9 9 0 0 1 7-3m-1 4h2v5l4 2-1 2-5-3z',
    stats: 'M3 13h4v8H3zm7-10h4v18h-4zm7 6h4v12h-4z'
  };
  function L(zh, en) { return NP.L(zh, en); }
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="' + paths[name] + '"/></svg>'; }
  function tabIcon(name) { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function button(attrs, body, cls) { return '<button type="button" class="' + (cls || 'ap-icon-button') + '" ' + attrs + '>' + body + '</button>'; }
  function nativeLayers(host) { return Array.from(host.querySelectorAll(':scope > .ap-native-viewport > .ap-native-device')); }
  function title() { return NP.previewTrack ? NP.previewTrack.title : L('星轨', 'Startrail'); }
  function style() { return document.documentElement.dataset.appStyle === 'material' ? 'material' : 'clean'; }
  function intro(name, desc) { return '<div class="ap-section-intro"><b>' + name + '</b><p>' + desc + '</p></div>'; }
  function empty(name, desc, action) { return '<div class="ap-empty">' + icon('library') + '<b>' + name + '</b><p>' + desc + '</p>' + (action || '') + '</div>'; }
  function rememberFocus(el, host) {
    if (!el || !host.contains(el)) return null;
    if (el.matches('.ap-header h2')) return { selector: '.ap-header h2' };
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (!/^data-a[palsh]-/.test(attr.name)) continue;
      var selector = '[' + attr.name + '="' + CSS.escape(attr.value) + '"]';
      if (el.hasAttribute('role')) selector += '[role="' + CSS.escape(el.getAttribute('role')) + '"]';
      return { selector: selector, start: el.selectionStart, end: el.selectionEnd };
    }
    return null;
  }
  function restoreFocus(host, state) {
    var el = state && host.querySelector(state.selector);
    if (!el || el.hidden || el.closest('[inert]')) return false;
    el.focus({ preventScroll: true });
    if (state.start != null && typeof el.setSelectionRange === 'function') el.setSelectionRange(state.start, state.end);
    return document.activeElement === el;
  }
  function releaseModal(preview) {
    if (modalOwner !== preview) return;
    inertRegions.forEach(function (el) { el.inert = false; });
    inertRegions = [];
    modalOwner = null;
  }
  function isolateModal(preview) {
    modalOwner = preview;
    var dialog = preview.host.querySelector('.ap-dialog-scrim');
    for (var branch = dialog; branch && branch !== document.body; branch = branch.parentElement) {
      Array.prototype.forEach.call(branch.parentElement.children, function (el) {
        if (el === branch || el.inert || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) return;
        el.inert = true;
        inertRegions.push(el);
      });
    }
  }
  function settingRow(key, name, desc, glyph, color, svg) {
    return button('data-ap-setting="' + key + '"', '<span class="ap-setting-glyph" style="--glyph:' + color + '">' + (svg || icon(glyph)) + '</span><span class="ap-row-copy"><b>' + esc(name) + '</b><small>' + esc(desc) + '</small></span>' + icon('chevron'), 'ap-setting-row');
  }
  function Preview(host) {
    this.host = host;
    this.route = host.dataset.appPreview;
    this.page = '';
    this.source = 'local';
    this.secondary = 'playlists';
    this.query = '';
    this.playlist = '';
    this.modal = '';
    this.modalOpener = null;
    this.returnFocus = null;
    this.scrollPositions = {};
    this.stack = [];
    this.render();
    host.addEventListener('click', this.click.bind(this));
    host.addEventListener('input', this.input.bind(this));
    host.addEventListener('change', this.input.bind(this));
    ['pointerdown', 'contextmenu', 'dragstart', 'drop'].forEach(function (type) {
      host.addEventListener(type, function (event) {
        if (!host.hasAttribute('data-preview-readonly')) return;
        event.stopImmediatePropagation();
        if (type !== 'pointerdown') event.preventDefault();
      }, true);
    });
    var self = this;
    host.addEventListener('keydown', function (e) {
      var layer = nativeLayers(host).filter(function (el) { return !el.hidden; }).sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); })[0];
      if (!layer) return;
      var dialog = layer.querySelector('.msheet.is-open,.mdialog.is-open,.fxa-dlg.is-open');
      if (e.key === 'Escape') { if (!dialog) { e.preventDefault(); e.stopPropagation(); self.closeNative(layer); } return; }
      if (e.key !== 'Tab') return;
      var area = dialog || layer;
      var controls = Array.from(area.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,select,[tabindex="0"]')).filter(function (el) { return !el.closest('[inert]') && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; });
      var first = controls[0], last = controls[controls.length - 1];
      if (first && (!area.contains(document.activeElement) || (!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first))) { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? last : first).focus({ preventScroll: true }); }
    }, true);
    if (NP.appMotion) NP.appMotion.swipe(this);
  }
  Preview.prototype.header = function (name, back) {
    return '<header class="ap-header' + (back ? ' ap-header--detail' : '') + '">' +
      (back ? button('data-ap-back aria-label="' + L('返回', 'Back') + '"', icon('back')) : '<div class="ap-header-spacer"></div>') +
      '<div class="ap-header-title"><h2 tabindex="-1">' + name + '</h2>' +
      (this.route === 'settings' && !this.page ? button('data-ap-mode-toggle aria-label="' + L('切换深浅色', 'Toggle light and dark') + '"', icon(appearance.mode === 'dark' ? 'sun' : 'moon')) : '') + '</div></header>';
  };
  Preview.prototype.search = function (placeholder) {
    return '<label class="ap-search">' + icon('search') + '<input type="search" data-ap-search aria-label="' + placeholder + '" placeholder="' + placeholder + '" value="' + esc(this.query) + '">' + button('data-ap-clear aria-label="' + L('清空', 'Clear') + '"' + (!this.query ? ' hidden' : ''), icon('close')) + '</label>';
  };
  Preview.prototype.nav = function () {
    var current = this.route;
    return '<nav class="ap-nav" aria-label="' + L('应用导航', 'App navigation') + '">' + [
      ['home', 'home', L('首页', 'Home')], ['explore', 'search', L('探索', 'Explore')], ['library', 'library', L('媒体库', 'Library')], ['settings', 'settings', L('设置', 'Settings')]
    ].map(function (item) { return button('data-ap-nav="' + item[0] + '" aria-current="' + (current === item[0] ? 'page' : 'false') + '"', '<span>' + tabIcon(item[1]) + '</span><small>' + item[2] + '</small>', 'ap-nav-item'); }).join('') + '</nav>';
  };
  Preview.prototype.mini = function () {
    return '<div class="ap-mini">' + button('data-ap-open-player aria-label="' + L('打开播放页', 'Open Now Playing') + '"', '<img src="' + cover + '" alt=""><span><b>' + title() + '</b><small>Neri Line</small></span>', 'ap-mini-open') + button('data-ap-toggle aria-label="' + L('播放', 'Play') + '"', icon('play')) + '</div>';
  };
  Preview.prototype.navigate = function (route, page) {
    if (this.host.hasAttribute('data-preview-readonly')) return;
    var same = this.route === route;
    if (same && this.page === (page || '') && !this.playlist && !(this.al && this.al.panel)) return;
    if (same && page) this.stack.push({ route: this.route, page: this.page, playlist: this.playlist, focus: rememberFocus(document.activeElement, this.host) });
    else if (!same) this.stack = [];
    this.route = route; this.page = page || ''; this.playlist = ''; this.query = '';
    if (this.al) this.al.panel = '';
    this.render({ selector: '.ap-header h2' });
  };
  Preview.prototype.back = function () {
    var previous = this.stack.pop();
    this.motionBack = true;
    if (previous) { this.route = previous.route; this.page = previous.page; this.playlist = previous.playlist; }
    else { this.page = ''; this.playlist = ''; }
    this.query = '';
    this.render(previous && previous.focus || this.returnFocus || { selector: '.ap-header h2' });
    this.returnFocus = null;
  };
  Preview.prototype.openNative = function (kind) {
    if (this.host.hasAttribute('data-preview-readonly')) return;
    var self = this;
    var viewport = this.host.querySelector(':scope > .ap-native-viewport');
    if (!viewport) { viewport = document.createElement('div'); viewport.className = 'ap-native-viewport'; this.host.appendChild(viewport); }
    var layer = this.host.querySelector('.ap-native-device[data-kind="' + kind + '"]');
    if (!layer) {
      layer = document.createElement('div'); layer.className = 'ap-native-device'; layer.dataset.kind = kind;
      var ph = document.createElement('div'); ph.className = 'ph' + (kind === 'dsp' ? ' ph--fx' : '');
      ph.dataset.appStyle = style();
      ph._previewOwner = this;
      var source = document.getElementById(kind === 'dsp' ? 'phDsp' : 'phPlay');
      var selectors = kind === 'dsp' ? ['.ph__status', '.hm-mini', '.hm-nav', '.ph__gesture'] : ['.ph__fluid', '.ph__status', '.pg-cover', '.pg-lyrics', '.sheet-scrim', '.ph__gesture'];
      selectors.forEach(function (selector) { var original = source.querySelector(selector); if (original) ph.appendChild(original.cloneNode(true)); });
      ph.querySelectorAll('.hm-nav [aria-disabled]').forEach(function (item) { item.removeAttribute('aria-disabled'); item.tabIndex = 0; });
      ph.querySelectorAll('[data-ph-clrc],[data-ph-lrc]').forEach(function (el) { el.textContent = ''; });
      if (kind !== 'dsp') { ph.dataset.home = 'cover'; ph.dataset.place = 'lower'; }
      layer.appendChild(ph); viewport.appendChild(layer);
      if (kind === 'dsp') layer._dsp = NP.dsp.mount(ph);
      else {
        layer._phone = NP.phones.mount(layer);
        layer._ui = NP.phoneUI.mount(layer._phone);
        if (source.hasAttribute('data-player-demo') && NP.playerPreview) NP.playerPreview.restrict(ph);
      }
      layer.addEventListener('click', function (e) {
        if (e.target.closest('[data-ph-collapse],.fxa-bar .pbtn')) { e.stopImmediatePropagation(); self.closeNative(layer); }
        var nav = e.target.closest('.hm-nav span');
        if (nav) { e.stopImmediatePropagation(); self.closeNative(layer); self.navigate(['home', 'explore', 'library', 'settings'][Array.from(nav.parentElement.children).indexOf(nav)]); }
      }, true);
      if (kind === 'dsp') {
        var mini = ph.querySelector('.hm-mini');
        mini.tabIndex = 0;
        mini.setAttribute('role', 'button');
        mini.setAttribute('aria-label', L('打开播放页', 'Open Now Playing'));
        mini.addEventListener('click', function (e) { if (e.target.closest('[data-dsp-play]')) return; e.stopImmediatePropagation(); self.openNative('player'); }, true);
      }
    }
    var opener = document.activeElement;
    if (!layer._opener || (this.host.contains(opener) && !layer.contains(opener) && !opener.closest('[inert]'))) layer._opener = opener;
    layer.hidden = false;
    layer.style.zIndex = kind === 'player' ? 12 : 8;
    nativeLayers(this.host).forEach(function (el) { el.inert = el !== layer; });
    this.host.querySelector('.app-preview').inert = true;
    var ph = layer.querySelector('.ph');
    if (layer._phone) { layer._phone.visible = true; layer._phone.onShow(); layer._phone.sync(); }
    if (layer._dsp) { layer._dsp.measureRows(); layer._dsp.placeInd(true); layer._dsp.placeSegs(true); layer._dsp.paint(); }
    if (NP.appGlass) NP.appGlass.refresh(layer);
    if (NP.appMotion && NP.appMotion.native) NP.appMotion.native(this, layer, true);
    var control = ph.querySelector('button'); if (control && !layer.contains(document.activeElement)) control.focus({ preventScroll: true });
  };
  Preview.prototype.closeNative = function (layer) {
    if (layer.hidden) return;
    var self = this;
    function finish() {
      layer.hidden = true;
      if (layer._phone) { layer._phone.visible = false; layer._phone.onHide(); }
      var active = nativeLayers(self.host).filter(function (el) { return !el.hidden; }).sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); });
      self.host.querySelector('.app-preview').inert = !!active.length;
      active.forEach(function (el, index) { el.inert = index !== 0; });
      var scope = active[0] || self.host.querySelector('.app-preview');
      var opener = layer._opener;
      if (!opener || !opener.isConnected || !scope.contains(opener) || opener.closest('[inert]')) opener = scope.querySelector('[data-ap-open-player],button');
      if (opener) opener.focus({ preventScroll: true });
    }
    if (NP.appMotion && NP.appMotion.native) NP.appMotion.native(this, layer, false, finish);
    else finish();
  };
  Preview.prototype.settings = function () {
    var page = this.page;
    if (NP.previewSettings) {
      var heading = page ? NP.previewSettings.title(page) : L('设置', 'Settings');
      return this.header(heading, !!page) + '<div class="ap-scroll ap-settings-content">' + (page ? NP.previewSettings.render(this, environment(this)) : this.search(L('搜索设置', 'Search settings')) + '<div class="ap-setting-results">' + this.settingsRows() + '</div>') + '</div>';
    }
    var name = page === 'theme' ? L('主题设置', 'Theme') : page === 'general' ? L('通用', 'General') : page === 'about' ? L('关于', 'About') : L('设置', 'Settings');
    var body = '';
    if (!page) {
      body = this.search(L('搜索设置', 'Search settings')) + '<div class="ap-setting-results">' + this.settingsRows() + '</div>';
    } else if (page === 'theme') {
      body = '<section class="ap-card ap-style-card">' + intro(L('界面风格', 'Interface style'), L('在 Material You 与简洁风格之间切换', 'Switch between Material You and Clean')) +
        '<div class="ap-style-options" role="radiogroup" aria-label="' + L('界面风格', 'Interface style') + '">' + ['material', 'clean'].map(function (s) {
          return button('data-ap-style="' + s + '" role="radio" aria-checked="' + (style() === s) + '"', '<span class="ap-style-mock ap-style-mock--' + s + '"><i class="ap-mock-title"></i><i class="ap-mock-card"><i></i><i></i><i></i></i><i class="ap-mock-line"></i><i class="ap-mock-line ap-mock-line--short"></i><i class="ap-mock-nav"><i></i><i></i><i></i></i><em>' + icon('check') + '</em></span><b>' + (s === 'clean' ? L('简洁', 'Clean') : 'Material You') + '</b><p>' + (s === 'clean' ? L('中性配色、连续曲率圆角与玻璃质感，长时间使用更不易疲劳', 'Neutral colors, continuous corners and glass for comfortable daily use') : L('经典 Material 3 设计，跟随壁纸或封面取色', 'Classic Material 3 design with wallpaper and cover colors')) + '</p>', 'ap-style-option');
        }).join('') + '</div></section><section class="ap-card">' + intro(L('深浅色模式', 'Appearance'), L('快速切换浅色和深色', 'Quickly switch between light and dark')) +
        '<div class="ap-mode-options">' + ['light', 'dark'].map(function (m) { return button('data-ap-mode="' + m + '" aria-pressed="' + (appearance.mode === m) + '"', icon(m === 'light' ? 'sun' : 'moon') + L(m === 'light' ? '浅色' : '深色', m === 'light' ? 'Light' : 'Dark'), 'ap-mode-option'); }).join('') + '</div></section>';
    } else if (page === 'general') {
      body = '<section class="ap-card">' + intro(L('UI 缩放', 'UI scale'), L('全局调整应用界面密度和文字缩放', 'Adjust the density and text size across the app')) + button('data-ap-scale-open', icon('tune') + '<span class="ap-row-copy"><b>' + L('UI 缩放 (DPI)', 'UI scale (DPI)') + '</b><small>' + L('当前: ', 'Current: ') + appearance.scale.toFixed(2) + 'x ' + L('(默认 1.00x)', '(default 1.00x)') + '</small></span>' + icon('chevron'), 'ap-setting-control') + '</section>';
    } else {
      body = '<section class="ap-card ap-about"><img src="' + new URL('img/icon-512.png', base).href + '" alt=""><h3>NeriPlayer</h3><p>' + L('多平台音乐，一个播放器', 'Your music, in one player') + '</p><a href="https://github.com/cwuom/NeriPlayer" target="_blank" rel="noopener">GitHub</a></section>';
    }
    return this.header(name, !!page) + '<div class="ap-scroll ap-settings-content">' + body + '</div>';
  };
  Preview.prototype.settingsRows = function () {
    var query = this.query.toLowerCase();
    if (NP.previewSettings) {
      if (query && NP.previewSettings.search) {
        return NP.previewSettings.search(query).map(function (row) { return button('data-ap-search-setting="' + row.page + '" data-ap-search-key="' + row.key + '"', '<span class="ap-row-copy"><b>' + esc(row.name) + '</b><small>' + esc(row.desc) + '</small></span>' + icon('chevron'), 'ap-setting-row'); }).join('') || empty(L('没有找到匹配的设置', 'No matching settings'), L('试试搜索主题或缩放', 'Try searching for theme or scale'));
      }
      var rows = NP.previewSettings.entries();
      return Array.from(new Set(rows.map(function (row) { return row.group; }))).map(function (group) {
        return '<section class="ap-card">' + rows.filter(function (row) { return row.group === group; }).map(function (row) { return settingRow(row.key, row.name, row.desc, paths[row.glyph] ? row.glyph : 'settings', row.color, row.svg); }).join('') + '</section>';
      }).join('');
    }
    var groups = [
      [['general', L('通用', 'General'), L('触感、后台服务与界面缩放', 'Haptics, background service and UI scale'), 'settings', '#8b8b91']],
      [['theme', L('主题设置', 'Theme'), L('深浅色、动态取色和主题调色', 'Appearance, dynamic colors and palette'), 'palette', '#9b59ec']],
      [['audio', L('音效与倍速', 'Audio effects & speed'), L('预设音效、均衡器、扬声器优化、声场与倍速', 'Presets, equalizer, soundstage and speed'), 'eq', '#fa375f']],
      [['about', L('关于', 'About'), L('版本信息、开源许可和项目链接', 'Version, open source licenses and project links'), 'info', '#2788ec']]
    ];
    var html = groups.map(function (group) {
      var rows = group.filter(function (r) { return !query || (r[1] + ' ' + r[2]).toLowerCase().indexOf(query) >= 0; });
      return rows.length ? '<section class="ap-card">' + rows.map(function (r) { return settingRow.apply(null, r); }).join('') + '</section>' : '';
    }).join('');
    return html || empty(L('没有找到匹配的设置', 'No matching settings'), L('试试搜索主题或缩放', 'Try searching for theme or scale'));
  };
  Preview.prototype.library = function () {
    if (NP.previewLibrary) return NP.previewLibrary.render(this, environment(this));
    if (this.playlist) return this.details();
    var sources = [['local', L('本地', 'Local')], ['favorite', L('收藏', 'Favorites')], ['netease', L('网易云', 'NetEase')], ['youtube', 'YouTube'], ['bilibili', L('哔哩哔哩', 'Bilibili')]];
    var self = this;
    return this.header(L('媒体库', 'Library'), false) + '<div class="ap-scroll ap-library-content"><div class="ap-primary-tabs" role="tablist" aria-label="' + L('媒体来源', 'Music sources') + '">' + sources.map(function (s) { return button('data-ap-source="' + s[0] + '" role="tab" aria-selected="' + (self.source === s[0]) + '"', s[1], 'ap-source-tab'); }).join('') + '</div>' +
      '<div class="ap-library-panel">' + this.libraryPanel() + '</div></div>';
  };
  Preview.prototype.libraryPanel = function () {
    var local = this.source === 'local';
    if (!local && this.source !== 'favorite') return empty(L('暂无收藏歌单', 'No playlists yet'), L('网页演示未连接平台账号，可以先体验本地示例曲', 'This web demo has no platform account. Explore the local sample instead.'), button('data-ap-source="local"', L('查看本地音乐', 'Explore local music'), 'ap-text-button'));
    var self = this;
    var tabs = '<div class="ap-secondary-tabs" role="tablist" aria-label="' + L('本地分类', 'Library categories') + '">' + [['playlists', L('歌单', 'Playlists')], ['artists', L('歌手', 'Artists')]].map(function (t) { return button('data-ap-secondary="' + t[0] + '" role="tab" aria-selected="' + (self.secondary === t[0]) + '"', t[1], 'ap-secondary-tab'); }).join('') + '</div>';
    return tabs + this.search(this.secondary === 'artists' ? L('搜索本地歌手 / 歌曲', 'Search local artists / songs') : L('搜索本地歌单 / 歌曲', 'Search local playlists / songs')) + '<div class="ap-library-results">' + this.libraryRows() + '</div>';
  };
  Preview.prototype.libraryRows = function () {
    var local = this.source === 'local';
    var q = this.query.toLowerCase();
    var matches = function (text) { return !q || text.toLowerCase().indexOf(q) >= 0; };
    var row = function (id, name, desc, glyph) { return button('data-ap-open-playlist="' + id + '"', '<span class="ap-library-cover' + (id === 'liked' ? ' ap-library-cover--liked' : '') + '">' + icon(glyph) + '</span><span class="ap-row-copy"><b>' + esc(name) + '</b><small>' + desc + '</small></span>', 'ap-library-row'); };
    if (this.secondary === 'artists') return (local || NP.player.liked) && matches('Neri Line 星轨 Startrail') ? button('data-ap-artist', '<img src="' + cover + '" alt=""><span class="ap-row-copy"><b>Neri Line</b><small>' + L('1 首歌曲', '1 song') + '</small></span>', 'ap-library-row ap-artist-row') : empty(L('暂无本地歌手', 'No local artists'), L('没有找到匹配的本地内容', 'No matching local content'));
    var html = '';
    if (local && matches(L('本地文件', 'Local files') + ' Neri Line 星轨 Startrail')) html += row('local', L('本地文件', 'Local files'), L('1 首歌曲', '1 song'), 'folder');
    if (matches(L('我喜欢的音乐', 'Liked songs') + (NP.player.liked ? ' Neri Line 星轨 Startrail' : ''))) html += row('liked', L('我喜欢的音乐', 'Liked songs'), (NP.player.liked ? '1' : '0') + L(' 首歌曲', ' songs'), 'heart');
    if (local && matches(L('NeriPlayer 示例歌单', 'NeriPlayer sample playlist') + ' Neri Line 星轨 Startrail')) html += row('sample', L('NeriPlayer 示例歌单', 'NeriPlayer sample playlist'), L('1 首歌曲', '1 song'), 'music');
    if (local) lists.forEach(function (name, i) { if (matches(name)) html += row('custom-' + i, name, L('0 首歌曲', '0 songs'), 'music'); });
    if (!html) return empty(L('没有找到匹配的本地内容', 'No matching local content'), L('试试输入歌单、歌手或歌曲名称', 'Try a playlist, artist or song name'));
    return (local && !q ? button('data-ap-create', '+ ' + L('新建歌单', 'New playlist'), 'ap-create-playlist') : '') + html;
  };
  Preview.prototype.details = function () {
    var id = this.playlist;
    var name = id === 'local' ? L('本地文件', 'Local files') : id === 'liked' ? L('我喜欢的音乐', 'Liked songs') : id === 'artist' ? 'Neri Line' : id.indexOf('custom-') === 0 ? lists[Number(id.slice(7))] : L('NeriPlayer 示例歌单', 'NeriPlayer sample playlist');
    var hasTrack = id.indexOf('custom-') !== 0 && (id !== 'liked' || NP.player.liked);
    return this.header(esc(name), true) + '<div class="ap-scroll ap-detail-content"><div class="ap-playlist-hero"><img src="' + cover + '" alt=""><span><h3>' + esc(name) + '</h3><p>' + (hasTrack ? L('1 分钟 · 1 首', '1 minute · 1 song') : L('0 首歌曲', '0 songs')) + '</p></span></div>' +
      (id === 'local' ? '<div class="ap-detail-tabs"><span>' + L('手动添加', 'Manually added') + '</span></div>' : '') +
      (hasTrack ? '<div class="ap-play-all">' + button('data-ap-play-all', icon('play') + L('全部播放', 'Play all'), 'ap-play-all-button') + button('data-ap-like aria-label="' + L('收藏星轨', 'Like Startrail') + '" aria-pressed="' + NP.player.liked + '"', icon(NP.player.liked ? 'heart' : 'heartOutline')) + '</div>' +
        button('data-ap-track aria-label="' + L('播放星轨', 'Play Startrail') + '"', '<span class="ap-track-number">1</span><img src="' + cover + '" alt=""><span class="ap-row-copy"><b>' + title() + '</b><small>Neri Line</small></span><small>01:12</small><span class="ap-track-playing">' + icon('eq') + '</span>', 'ap-track') : empty(L('歌单还是空的', 'This playlist is empty'), L('你创建的歌单会保留在本次演示中', 'Playlists you create stay available during this demo'))) + '</div>';
  };
  Preview.prototype.home = function () {
    if (NP.previewHome) return NP.previewHome.render(this, environment(this));
    return this.header(this.route === 'home' ? 'NeriPlayer' : L('探索', 'Explore'), false) + '<div class="ap-scroll ap-home-content">' + this.search(L('搜索关键词', 'Search keywords')) + '<div class="ap-home-results">' + this.homeRows() + '</div></div>';
  };
  Preview.prototype.homeRows = function () {
    if (this.query && ('星轨 Startrail Neri Line').toLowerCase().indexOf(this.query.toLowerCase()) < 0) return empty(L('没有找到匹配的歌曲', 'No matching songs'), L('演示曲：星轨 · Neri Line', 'Sample: Startrail · Neri Line'));
    return '<h3 class="ap-home-heading">' + L('NeriPlayer 示例曲', 'NeriPlayer sample') + '</h3>' + button('data-ap-track', '<span class="ap-track-number">1</span><img src="' + cover + '" alt=""><span class="ap-row-copy"><b>' + title() + '</b><small>Neri Line / NeriPlayer PV</small></span>', 'ap-track');
  };
  Preview.prototype.dialog = function () {
    if (!this.modal) return '';
    if (this.modal === 'extension' && this.dialogConfig) {
      var config = this.dialogConfig;
      var classes = 'ap-dialog' + (config.kind === 'sheet' ? ' ap-dialog--sheet' : '') + (config.className ? ' ' + esc(config.className) : '');
      var actions = config.hideActions ? '' : '<div class="ap-dialog-actions">' + button('data-ap-dialog-cancel', L('取消', 'Cancel'), 'ap-text-button') + (config.hideConfirm ? '' : button('data-ap-extension-apply', config.confirmLabel || L('应用', 'Apply'), 'ap-text-button' + (config.filledConfirm ? ' as-dialog-filled' : ''))) + '</div>';
      return '<div class="ap-dialog-scrim' + (config.kind === 'sheet' ? ' ap-dialog-scrim--sheet' : '') + '"><section class="' + classes + '" role="dialog" aria-modal="true" aria-label="' + esc(config.title) + '"><h3>' + esc(config.title) + '</h3>' + config.body + actions + '</section></div>';
    }
    var scale = this.modal === 'scale';
    return '<div class="ap-dialog-scrim"><section class="ap-dialog" role="dialog" aria-modal="true" aria-label="' + (scale ? L('UI 缩放', 'UI scale') : L('新建歌单', 'New playlist')) + '"><h3>' + (scale ? L('UI 缩放', 'UI scale') : L('新建歌单', 'New playlist')) + '</h3>' +
      (scale ? '<p>' + L('全局调整应用界面密度和文字缩放', 'Adjust the density and text size across the app') + '</p><output data-ap-scale-value>' + appearance.scale.toFixed(2) + 'x</output><input data-ap-scale type="range" min="0.6" max="1.2" step="0.05" value="' + appearance.scale + '" aria-label="' + L('UI 缩放', 'UI scale') + '">' : '<input data-ap-playlist-name type="text" maxlength="48" aria-label="' + L('歌单名称', 'Playlist name') + '" placeholder="' + L('输入歌单名称', 'Playlist name') + '">') +
      '<div class="ap-dialog-actions">' + button('data-ap-dialog-cancel', L('取消', 'Cancel'), 'ap-text-button') + button(scale ? 'data-ap-scale-apply' : 'data-ap-create-apply', scale ? L('应用', 'Apply') : L('创建', 'Create'), 'ap-text-button') + '</div></section></div>';
  };
  Preview.prototype.render = function (requestedFocus) {
    var panel = this.route === 'library' && this.al ? this.al.panel || '' : '';
    var key = this.route + '|' + this.page + '|' + this.playlist + '|' + panel;
    var depth = this.page ? Math.max(1, this.stack.length) : this.playlist || panel ? 1 : 0;
    var previousKey = this.renderedKey;
    if (previousKey && previousKey !== key && NP.appThemeTransition) NP.appThemeTransition.cancel(this.host);
    var previousRoute = this.renderedRoute;
    var scene = this.host.querySelector('.ap-scene:not(.ap-outgoing)');
    var previousScene = scene && scene.cloneNode(true);
    if (previousScene) {
      var oldScroll = scene.querySelector('.ap-scroll');
      if (oldScroll) { previousScene._scrollTop = oldScroll.scrollTop; this.scrollPositions[previousKey] = oldScroll.scrollTop; }
    }
    if (previousScene && previousKey !== key && !this.motionBack && (this.page || this.playlist)) { this.backScene = previousScene.cloneNode(true); this.backScene._scrollTop = previousScene._scrollTop; }
    var active = document.activeElement;
    var focused = rememberFocus(active, this.host);
    var oldDialog = this.host.querySelector('.ap-dialog');
    var closingDialog = !this.modal && oldDialog && oldDialog.parentElement.cloneNode(true);
    var dialogFocused = oldDialog && oldDialog.contains(active);
    releaseModal(this);
    var currentScroll = this.host.querySelector('.ap-scroll');
    var savedScroll = currentScroll ? currentScroll.scrollTop : 0;
    var viewport = this.host.querySelector(':scope > .ap-native-viewport');
    var native = nativeLayers(this.host);
    var nativeFocus = viewport && viewport.contains(active) ? active : null;
    if (viewport) viewport.remove();
    this.host.innerHTML = '<div class="app-preview" data-style="' + style() + '" data-mode="' + appearance.mode + '" data-ui-scale="' + appearance.scale + '" style="--ap-density:' + appearance.scale + '"><div class="ap-status" aria-hidden="true"><span>19:19</span><span><svg viewBox="0 0 24 24"><use href="#i-signal"/></svg><svg viewBox="0 0 24 24"><use href="#i-wifi"/></svg><i></i></span></div><div class="ap-interface">' +
      '<div class="ap-page"><div class="ap-scene">' + (this.route === 'settings' ? this.settings() : this.route === 'library' ? this.library() : this.home()) + '</div><div class="ap-bottom">' + this.mini() + this.nav() + '</div></div>' + this.dialog() + '</div><div class="ap-gesture"></div></div>';
    if (viewport) this.host.appendChild(viewport);
    this.host.querySelector('.app-preview').inert = native.some(function (el) { return !el.hidden; });
    if (NP.appHeader) NP.appHeader.refresh(this.host);
    var scroll = this.host.querySelector('.ap-scroll');
    if (scroll) scroll.scrollTop = previousKey === key ? savedScroll : this.scrollPositions[key] || 0;
    if (NP.appHeader) NP.appHeader.refresh(this.host);
    if (previousKey && key !== previousKey && NP.appMotion) {
      var order = ['home', 'explore', 'library', 'settings'];
      var backwards = this.motionBack || (previousRoute === this.route && depth < this.renderedDepth);
      var kind = previousRoute !== this.route ? 'tab' : this.route === 'settings' ? 'settings' : 'detail';
      if (kind === 'tab') backwards = order.indexOf(this.route) < order.indexOf(previousRoute);
      NP.appMotion.scene(this.host, previousScene, kind, backwards, this._gestureProgress);
    }
    this.renderedKey = key; this.renderedRoute = this.route; this.renderedDepth = depth; this.motionBack = false; this._gestureProgress = 0;
    if (closingDialog && NP.appMotion) { closingDialog.inert = true; closingDialog.setAttribute('aria-hidden', 'true'); closingDialog.style.pointerEvents = 'none'; this.host.querySelector('.ap-interface').appendChild(closingDialog); NP.appMotion.dialog(closingDialog, true); }
    this.sync();
    if (this.modal) {
      if (NP.appMotion) NP.appMotion.layoutDialog(this.host.querySelector('.ap-dialog-scrim'));
      isolateModal(this);
      if (!dialogFocused || !restoreFocus(this.host, focused)) {
        var first = this.host.querySelector('.ap-dialog input,.ap-dialog textarea,.ap-dialog select,.ap-dialog button');
        if (first) first.focus({ preventScroll: true });
      }
      if (!oldDialog && NP.appMotion) NP.appMotion.dialog(this.host.querySelector('.ap-dialog-scrim'), false);
    } else if ((requestedFocus || focused) && !restoreFocus(this.host, requestedFocus || focused)) {
      restoreFocus(this.host, { selector: '.ap-header h2' });
    }
    if (NP.appGlass) NP.appGlass.refresh(this.host);
    if (NP.appMotion && NP.appMotion.artwork) NP.appMotion.artwork(this.host);
    if (this.host.hasAttribute('data-preview-readonly')) {
      this.host.querySelectorAll('button,input,textarea,select').forEach(function (control) { control.disabled = true; });
      this.host.querySelectorAll('a,[tabindex]').forEach(function (control) { control.tabIndex = -1; });
      var displayScroll = this.host.querySelector('.ap-scroll');
      if (displayScroll) { displayScroll.tabIndex = 0; displayScroll.setAttribute('role', 'region'); displayScroll.setAttribute('aria-label', this.route === 'settings' ? L('设置界面展示','Settings preview') : L('媒体库界面展示','Library preview')); }
    }
    if (NP.appThemeTransition) NP.appThemeTransition.decorate(this.host);
    if (nativeFocus && nativeFocus.isConnected && !nativeFocus.closest('[inert]')) nativeFocus.focus({ preventScroll: true });
  };
  Preview.prototype.closeModal = function () {
    var opener = this.modalOpener;
    this.modal = '';
    this.dialogConfig = null;
    this.modalOpener = null;
    this.render(opener);
  };
  Preview.prototype.sync = function () {
    var p = NP.player;
    var playing = p.playing;
    this.host.querySelectorAll('[data-ap-toggle]').forEach(function (b) { b.innerHTML = icon(playing ? 'pause' : 'play'); b.setAttribute('aria-label', playing ? L('暂停', 'Pause') : L('播放', 'Play')); });
    this.host.querySelectorAll('[data-ap-like]').forEach(function (b) { b.innerHTML = icon(p.liked ? 'heart' : 'heartOutline'); b.setAttribute('aria-pressed', p.liked); });
    this.host.querySelectorAll('.ap-track').forEach(function (el) { el.classList.toggle('is-playing', playing); });
  };
  Preview.prototype.click = function (e) {
    if (this.host.hasAttribute('data-preview-readonly')) return;
    var b = e.target.closest('button');
    if (!b || !this.host.contains(b)) return;
    if (this.modal && !b.closest('.ap-dialog')) { e.preventDefault(); e.stopPropagation(); return; }
    var d = b.dataset;
    var env = environment(this);
    if (NP.previewSettings && NP.previewSettings.handle(this, b, env)) return;
    if (NP.previewLibrary && NP.previewLibrary.handle(this, b, env)) return;
    if (NP.previewHome && NP.previewHome.handle(this, b, env)) return;
    var redraw = true;
    var requestedFocus = null;
    if (d.apNav) { this.navigate(d.apNav); return; }
    else if (d.apSearchSetting) {
      if (NP.previewSettings.reveal) NP.previewSettings.reveal(d.apSearchKey);
      this.navigate('settings', d.apSearchSetting);
      var match = this.host.querySelector('[data-as-key="' + CSS.escape(d.apSearchKey) + '"]');
      if (match) match.scrollIntoView({ block: 'center', behavior: NP.env.reduced ? 'auto' : 'smooth' });
      return;
    }
    else if (d.apSetting) {
      if (d.apSetting === 'audio' || d.apSetting === 'audioEffects') this.openNative('dsp');
      else this.navigate('settings', d.apSetting);
      return;
    } else if ('apBack' in d) { this.back(); return; }
    else if (d.apSource) { this.source = d.apSource; this.query = ''; this.secondary = 'playlists'; }
    else if (d.apSecondary) { this.secondary = d.apSecondary; this.query = ''; }
    else if ('apClear' in d) { this.query = ''; requestedFocus = { selector: '[data-ap-search]' }; }
    else if (d.apOpenPlaylist) { this.returnFocus = rememberFocus(b, this.host); this.playlist = d.apOpenPlaylist; this.query = ''; requestedFocus = { selector: '.ap-header h2' }; }
    else if ('apArtist' in d) { this.returnFocus = rememberFocus(b, this.host); this.playlist = 'artist'; requestedFocus = { selector: '.ap-header h2' }; }
    else if ('apTrack' in d || 'apPlayAll' in d) { NP.player.play(); redraw = false; }
    else if ('apToggle' in d) { NP.player.toggle(); redraw = false; }
    else if ('apOpenPlayer' in d) { this.openNative('player'); return; }
    else if ('apLike' in d) { NP.player.liked = !NP.player.liked; NP.player.emit(); redraw = false; }
    else if (d.apStyle) { if (NP.themes && NP.themes.select) NP.themes.select(d.apStyle); else { document.documentElement.dataset.appStyle = d.apStyle; document.dispatchEvent(new CustomEvent('np-app-style')); } redraw = false; }
    else if (d.apMode || 'apModeToggle' in d) {
      var nextMode = d.apMode || (appearance.mode === 'dark' ? 'light' : 'dark');
      var token = NP.appThemeTransition && NP.appThemeTransition.begin(this.host, b, nextMode);
      if (token === false) return;
      appearance.mode = nextMode;
      refresh();
      if (token) NP.appThemeTransition.finish(token);
      redraw = false;
    }
    else if ('apScaleOpen' in d) { this.modalOpener = rememberFocus(b, this.host); this.modal = 'scale'; }
    else if ('apCreate' in d) { this.modalOpener = rememberFocus(b, this.host); this.modal = 'create'; }
    else if ('apDialogCancel' in d) { this.closeModal(); redraw = false; }
    else if ('apExtensionApply' in d) { var config = this.dialogConfig; if (!config.onApply || config.onApply(this.host.querySelector('.ap-dialog')) !== false) this.closeModal(); redraw = false; }
    else if ('apScaleApply' in d) { appearance.scale = Number(this.host.querySelector('[data-ap-scale]').value); this.modal = ''; refresh(this, this.modalOpener); this.modalOpener = null; redraw = false; }
    else if ('apCreateApply' in d) { var input = this.host.querySelector('[data-ap-playlist-name]'); var value = input.value.trim(); if (!value) { input.focus(); return; } lists.push(value); this.modal = ''; refresh(this, this.modalOpener); this.modalOpener = null; redraw = false; }
    else redraw = false;
    if (redraw) this.render(requestedFocus);
  };
  Preview.prototype.input = function (e) {
    if (this.host.hasAttribute('data-preview-readonly')) return;
    var el = e.target;
    if (this.modal && !el.closest('.ap-dialog')) { e.preventDefault(); return; }
    if (NP.previewSettings && NP.previewSettings.input(this, e, environment(this))) return;
    if (NP.previewLibrary && NP.previewLibrary.input(this, e, environment(this))) return;
    if (NP.previewHome && NP.previewHome.input(this, e, environment(this))) return;
    if (el.matches('[data-ap-search]')) {
      this.query = el.value;
      var results = this.host.querySelector(this.route === 'settings' ? '.ap-setting-results' : this.route === 'library' ? '.ap-library-results' : '.ap-home-results');
      if (results) results.innerHTML = this.route === 'settings' ? this.settingsRows() : this.route === 'library' ? this.libraryRows() : this.homeRows();
      this.host.querySelector('[data-ap-clear]').hidden = !this.query;
      this.sync();
    } else if (el.matches('[data-ap-scale]')) this.host.querySelector('[data-ap-scale-value]').textContent = Number(el.value).toFixed(2) + 'x';
  };
  function refresh(focusedPreview, focusedTarget) { instances.forEach(function (p) { p.render(p === focusedPreview ? focusedTarget : null); }); }
  NP.appPreview = {
    openLibraryPanel: function (ph, panel) {
      var preview = this.fromPhone(ph, 'library');
      preview.host.querySelectorAll('.ap-native-device:not([hidden])').forEach(function (layer) { preview.closeNative(layer); });
      if (NP.previewLibrary && NP.previewLibrary.openPanel) NP.previewLibrary.openPanel(preview, environment(preview), panel);
    },
    mount: function (host, route) {
      if (host._appPreview) return host._appPreview;
      if (route) host.dataset.appPreview = route;
      var preview = new Preview(host);
      host._appPreview = preview; instances.push(preview);
      return preview;
    },
    fromPhone: function (ph, route, page) {
      if (ph._previewOwner) { ph._previewOwner.navigate(route, page); return ph._previewOwner; }
      var screen = ph.parentElement;
      var host = screen.querySelector(':scope > .ap-embedded-host');
      if (!host) { host = document.createElement('div'); host.className = 'preview-device ap-embedded-host'; screen.appendChild(host); }
      ph.dataset.covered = 'true';
      ph.style.visibility = 'hidden';
      if (NP.phones.list) NP.phones.list.forEach(function (p) { if (p.ph === ph) { p.visible = false; p.onHide(); } });
      var preview = this.mount(host, route);
      if (preview.route !== route || page) preview.navigate(route, page);
      return preview;
    },
    init: function () {
      document.querySelectorAll('[data-app-preview]').forEach(function (host) {
        if (host._appPreview) return;
        host._appPreview = new Preview(host);
        instances.push(host._appPreview);
      });
      if (this.started) return;
      this.started = true;
      var homeExample = document.querySelector('#phHome .hm-app');
      if (homeExample) homeExample.inert = true;
      var dspBack = document.querySelector('#phDsp [data-back]');
      if (dspBack) dspBack.disabled = true;
      document.addEventListener('click', function (e) {
        var ph = e.target.closest('.ph');
        if (!ph || ph._previewOwner) return;
        var nav = e.target.closest('.hm-nav span');
        if (ph.hasAttribute('data-demo-locked') || (ph.hasAttribute('data-demo-navigation-locked') && (nav || e.target.closest('.fxa-bar [data-back]') || (e.target.closest('.hm-mini') && !e.target.closest('[data-dsp-play]'))))) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (nav) { e.preventDefault(); e.stopImmediatePropagation(); NP.appPreview.fromPhone(ph, ['home', 'explore', 'library', 'settings'][Array.from(nav.parentElement.children).indexOf(nav)]); return; }
        if (e.target.closest('.hm-mini') && !e.target.closest('[data-hm-play],[data-dsp-play]')) { e.stopImmediatePropagation(); NP.appPreview.fromPhone(ph, ph.classList.contains('ph--fx') ? 'settings' : 'home').openNative('player'); return; }
        if (NP.previewHome && NP.previewHome.fromOriginal && NP.previewHome.fromOriginal(ph, e.target, e)) return;
        if (e.target.closest('[data-ph-collapse]')) { e.stopImmediatePropagation(); NP.appPreview.fromPhone(ph, 'home'); return; }
        if (e.target.closest('.fxa-bar .pbtn')) { e.stopImmediatePropagation(); NP.appPreview.fromPhone(ph, 'settings'); }
      }, true);
      document.querySelectorAll('.hm-nav').forEach(function (nav) {
        nav.removeAttribute('aria-hidden');
        var locked = !!nav.closest('[data-demo-locked],[data-demo-navigation-locked]');
        nav.querySelectorAll('span').forEach(function (item) { item.tabIndex = locked ? -1 : 0; item.setAttribute('role', 'button'); if (locked) item.setAttribute('aria-disabled', 'true'); item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } }); });
      });
      document.querySelectorAll('.hm-mini').forEach(function (mini) {
        var locked = !!mini.closest('[data-demo-locked],[data-demo-navigation-locked]');
        mini.tabIndex = locked ? -1 : 0;
        mini.setAttribute('role', locked ? 'group' : 'button');
        mini.setAttribute('aria-label', locked ? L('当前播放', 'Now Playing') : L('打开播放页', 'Open Now Playing'));
        if (!locked) mini.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === mini) { e.preventDefault(); mini.click(); } });
      });
      document.addEventListener('np-app-style', function (event) { if (!event.detail || !event.detail.target) refresh(); });
      document.addEventListener('keydown', function (e) {
        if (!modalOwner) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); modalOwner.closeModal(); return; }
        if (e.key !== 'Tab') return;
        var dialog = modalOwner.host.querySelector('.ap-dialog');
        var controls = Array.prototype.filter.call(dialog.querySelectorAll('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),a[href]'), function (el) { return !el.hidden && el.getClientRects().length; });
        var first = controls[0];
        var last = controls[controls.length - 1];
        if (!dialog.contains(document.activeElement) || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus({ preventScroll: true });
        }
      }, true);
      var liked = NP.player.liked;
      NP.player.on(function (p) {
        if (p.liked !== liked) {
          liked = p.liked;
          instances.forEach(function (preview) {
            if (preview.route === 'library' && (!preview.playlist || preview.playlist === 'liked')) preview.render();
          });
        }
        instances.forEach(function (preview) { preview.sync(); });
      });
    }
  };
})();
