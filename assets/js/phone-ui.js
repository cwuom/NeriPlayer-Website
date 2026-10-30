/* NeriPlayer site · phone-ui —— 播放页的交互仿真：更多选项、Dock 面板、睡眠定时器、音效与倍速、主控位置、封面 / 歌词页切换、首页迷你播放器 */
(function () {
  'use strict';

  var NP = window.NP;
  var M = NP.math;
  var $ = NP.$;
  var $$ = NP.$$;
  var L = NP.L;
  var P = NP.player;

  /* 队列只放网站实际提供音源的歌曲 */
  var QUEUE = [
    ['startrail', '星轨', 'Neri Line'],
  ];
  var CUR = 0;
  var coverBase = 'assets/img/covers/';
  var favCount = 0;
  var sleep = { mode: null, end: 0 };
  NP.previewQueue = {
    items: function () { return QUEUE.slice(); },
    next: function () { if (!QUEUE.length) QUEUE.push(['startrail', '星轨', 'Neri Line']); document.dispatchEvent(new CustomEvent('np-preview-queue')); },
    end: function () { this.next(); },
    clear: function () { QUEUE.length = 0; P.pause(); document.dispatchEvent(new CustomEvent('np-preview-queue')); }
  };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function ic(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function cover(k) { return coverBase + k + '.jpg'; }
  function songs(n) { return NP.en ? n + (n === 1 ? ' song' : ' songs') : n + ' 首'; }
  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60);
    s %= 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- 水波纹（M3 state layer） ---------- */
  var RIPPLE = '.ph button, .ph [data-rpl], .app-preview button';
  function ripple(e) {
    if (e.button > 0) return;
    if (document.documentElement.dataset.appStyle === 'clean') return;
    var t = e.target.closest && e.target.closest(RIPPLE);
    if (!t || t.disabled || t.closest('.xslider')) return;
    if (!t._rpl) {
      t._rpl = true;
      var cs = getComputedStyle(t);
      if (cs.position === 'static') t.style.position = 'relative';
      if (cs.overflow === 'visible') t.style.overflow = 'hidden';
    }
    var r = t.getBoundingClientRect();
    var k = t.offsetWidth ? r.width / t.offsetWidth : 1;
    var x = (e.clientX - r.left) / k;
    var y = (e.clientY - r.top) / k;
    var w = t.offsetWidth;
    var h = t.offsetHeight;
    var d = 2 * Math.sqrt(Math.pow(Math.max(x, w - x), 2) + Math.pow(Math.max(y, h - y), 2));
    var s = el('span', 'ph-rpl');
    s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (x - d / 2) + 'px;top:' + (y - d / 2) + 'px';
    t.appendChild(s);
    function up() {
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      s.classList.add('is-up');
      setTimeout(function () { s.remove(); }, 520);
    }
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  /* ---------- Snackbar ---------- */
  function snack(ph, msg) {
    if (!ph._snack) {
      ph._snack = el('div', 'ph-snack');
      ph._snack.setAttribute('role', 'status');
      ph.appendChild(ph._snack);
    }
    var s = ph._snack;
    clearTimeout(s._t);
    if (s.classList.contains('is-on')) {
      s.classList.remove('is-on');
      setTimeout(function () { s.textContent = msg; s.classList.add('is-on'); }, 180);
    } else {
      s.textContent = msg;
      void s.offsetWidth;
      s.classList.add('is-on');
    }
    s._t = setTimeout(function () { s.classList.remove('is-on'); }, 2800);
  }
  NP.phoneSnack = snack;

  /* ---------- 面板层：底部面板与对话框共用一层遮罩 ---------- */
  function Layers(ph) {
    var self = this;
    this.ph = ph;
    this.open = null;
    this.scrim = $('[data-ph-scrim]', ph);
    if (!this.scrim) {
      this.scrim = el('div', 'sheet-scrim');
      this.scrim.setAttribute('data-ph-scrim', '');
      ph.insertBefore(this.scrim, $('.ph__gesture', ph));
    }
    this.scrim.addEventListener('click', function () { self.hide(true); });
    ph.addEventListener('keydown', function (e) {
      if (!self.open) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); self.hide(true); return; }
      if (e.key !== 'Tab') return;
      var controls = Array.from(self.open.el.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(function (el) { return !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; });
      var first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if ((!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus({ preventScroll: true }); }
    });
  }
  Layers.prototype.restoreInert = function () { (this.inertChildren || []).forEach(function (el) { el.inert = false; }); this.inertChildren = []; };
  Layers.prototype.show = function (layer, manual) {
    if (this.open === layer) return;
    var prev = this.open;
    var pageSwap = prev && ((layer.editPage && prev === layer.parentPage) || (prev.editPage && layer === prev.parentPage));
    var swap = pageSwap && NP.songEdit && NP.songEdit.prepareSwap(prev, layer);
    this.restoreInert();
    if (!prev) this.opener = document.activeElement;
    if (prev) {
      prev.el.classList.remove('is-open');
      if (prev.onHide) prev.onHide();
    }
    this.open = layer;
    this.manual = !!manual;
    var self = this;
    function showLayer() {
      if (self.open !== layer) { if (swap) NP.songEdit.cancelSwap(swap); return; }
      layer.el.classList.add('is-open');
      layer.el.setAttribute('role', 'dialog'); layer.el.setAttribute('aria-modal', 'true');
      self.inertChildren = Array.from(self.ph.children).filter(function (el) { return el !== layer.el && el !== self.scrim && !el.inert && !el.matches('.ph__gesture,.ph__status'); });
      self.inertChildren.forEach(function (el) { el.inert = true; });
      self.ph.classList.add('is-sheet');
      self.ph.classList.toggle('is-dialog', !!layer.dialog);
      self.ph.classList.toggle('is-page', !!layer.page);
      if (swap) NP.songEdit.finishSwap(swap);
      if (layer.onShow) layer.onShow();
      var control = layer.el.querySelector('input:not([disabled]),textarea,select,button:not([disabled])');
      function focusControl() {
        if (self.open === layer && control && !layer.el.contains(document.activeElement)) control.focus({ preventScroll: true });
      }
      if (control) {
        focusControl();
        // inherited visibility transitions must finish before the browser accepts focus
        var visibility = layer.el.getAnimations({ subtree: true }).filter(function (animation) { return animation.transitionProperty === 'visibility'; });
        if (visibility.length) Promise.allSettled(visibility.map(function (animation) { return animation.finished; })).then(focusControl);
      }
    }
    if (pageSwap) showLayer(); else setTimeout(showLayer, prev ? 160 : 0);
  };
  Layers.prototype.hide = function (byUser) {
    var l = this.open;
    if (!l) return;
    this.open = null;
    this.manual = false;
    if (byUser) this.dismissed = l;
    l.el.classList.remove('is-open');
    l.el.removeAttribute('aria-modal');
    this.restoreInert();
    this.ph.classList.remove('is-sheet', 'is-dialog', 'is-page');
    if (l.onHide) l.onHide();
    if (this.opener && this.opener.isConnected && !this.opener.closest('[inert]')) this.opener.focus({ preventScroll: true });
  };

  function makeSheet(ph, cls, inner) {
    var s = el('div', 'msheet msheet--auto ' + cls, '<i class="msheet__grab"></i><div class="msheet__body">' + inner + '</div>');
    ph.insertBefore(s, $('.ph__gesture', ph));
    return s;
  }
  function makeDialog(ph, cls, inner) {
    var d = el('div', 'mdialog ' + cls, inner);
    d.setAttribute('role', 'dialog');
    ph.insertBefore(d, $('.ph__gesture', ph));
    return d;
  }

  /* 按住拖动条往下拉可以关掉面板 */
  function dragToDismiss(sheet, layers) {
    var grab = $('.msheet__grab', sheet);
    if (!grab) return;
    var y0 = 0;
    var dy = 0;
    var k = 1;
    var t0 = 0;
    var down = false;
    grab.addEventListener('pointerdown', function (e) {
      down = true;
      y0 = e.clientY;
      dy = 0;
      t0 = performance.now();
      var r = sheet.getBoundingClientRect();
      k = sheet.offsetHeight ? r.height / sheet.offsetHeight : 1;
      NP.capture(grab, e);
      sheet.classList.add('is-drag');
    });
    grab.addEventListener('pointermove', function (e) {
      if (!down) return;
      dy = Math.max(0, (e.clientY - y0) / k);
      sheet.style.translate = '0 ' + dy + 'px';
    });
    function end() {
      if (!down) return;
      down = false;
      sheet.classList.remove('is-drag');
      sheet.style.translate = '';
      var v = dy / Math.max(1, performance.now() - t0);
      if (dy > 110 || v > 0.6) layers.hide(true);
    }
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  }

  /* ---------- 一台手机的播放页 ---------- */
  function PlayerUI(ph, phone) {
    var self = this;
    this.ph = ph;
    this.phone = phone;
    ph.dataset.immersive = String(!!NP.previewSettings && NP.previewSettings.value('nowplaying_immersive_mode') === true);
    $$('[data-ph-morph-opacity]', ph).forEach(function (node) {
      node.style.opacity = node.getAttribute('data-ph-morph-opacity');
      node.removeAttribute('data-ph-morph-opacity');
    });
    $$('.pg-cover,.pg-lyrics', ph).forEach(function (page) {
      page.inert = page.classList.contains('pg-lyrics') !== ph.classList.contains('is-lyrics');
      page.setAttribute('aria-hidden', String(page.inert));
    });
    this.fig = ph.closest('.phone-fig');
    if (phone.device.matches('#devicePlay,#deviceLyrics')) phone.device.dataset.immersive = ph.dataset.immersive;
    if (this.fig) this.fig.dataset.immersive = ph.dataset.immersive;
    this.layers = new Layers(ph);
    var lay = this.layers;

    this.fx = null;

    this.buildMore();
    this.buildQueue();
    this.buildVolume();
    this.buildAdd();
    this.buildSleep();

    function on(sel, fn) { $$(sel, ph).forEach(function (b) { b.addEventListener('click', function (e) { fn.call(b, e); }); }); }
    on('[data-ph-more]', function () { lay.show(self.more, true); });
    on('[data-ph-queue]', function () { lay.show(self.queue, true); });
    on('[data-ph-timer]', function () { lay.show(self.sleep, true); });
    on('[data-ph-volume]', function () { lay.show(self.volume, true); });
    on('[data-ph-add]', function () { lay.show(self.add, true); });
    on('[data-ph-golyrics]', function () { self.setPage(!ph.classList.contains('is-lyrics')); });
    on('[data-ph-collapse]', function () {
      ph.classList.remove('is-nudge');
      void ph.offsetWidth;
      ph.classList.add('is-nudge');
      snack(ph, L('收起后会回到首页，在底部的迷你播放器里继续播放', 'Collapsing returns to Home, where the mini player keeps playing'));
    });
    on('[data-ph-like]', function () {
      P.liked = !P.liked;
      favCount = P.liked ? 1 : 0;
      P.emit();
      var svg = this.querySelector('svg');
      svg.classList.remove('ph-pop');
      void svg.getBoundingClientRect();
      svg.classList.add('ph-pop');
    });
    on('[data-ph-prev]', function () { P.seek(0); });
    on('[data-ph-next]', function () { P.seek(0); });

    this.bindSwipe();
    this.bindImmersive();
    P.on(function () { self.sync(); });
  }
  PlayerUI.prototype.bindImmersive = function () {
    $$('[data-ph-toggle]', this.ph).forEach(function (button) {
      var press = null;
      var suppressClick = false;
      function cancel() {
        if (press) clearTimeout(press.timer);
        press = null;
      }
      button.style.touchAction = 'none';
      button.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || event.isPrimary === false) return;
        cancel();
        suppressClick = false;
        var scale = button.getBoundingClientRect().width / button.offsetWidth;
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, scale: scale || 1 };
        NP.capture(button, event);
        press.timer = setTimeout(function () {
          if (!press || document.hidden) return;
          suppressClick = true;
          NP.phoneUI.toggleImmersive();
        }, 500);
      });
      button.addEventListener('pointermove', function (event) {
        if (!press || press.id !== event.pointerId || suppressClick) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8 * press.scale) cancel();
      });
      button.addEventListener('pointerup', cancel);
      button.addEventListener('pointercancel', cancel);
      button.addEventListener('lostpointercapture', cancel);
      button.addEventListener('contextmenu', function (event) { event.preventDefault(); });
      button.addEventListener('click', function (event) {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    });
  };
  PlayerUI.prototype.applyImmersive = function (enabled) {
    var ph = this.ph;
    if (ph.dataset.immersive === String(enabled)) return;
    var painted = this.pageMotion && (this.flights || []).map(function (flight) {
      return { key: flight.key, bounds: flight.node.getBoundingClientRect(), frame: playbackFrame(flight.node, flight.key, ph) };
    });
    var oldViewport = ph.getBoundingClientRect();
    var oldScale = oldViewport.width / ph.offsetWidth;
    ph.classList.add('is-immersive-change');
    ph.dataset.immersive = String(enabled);
    if (this.phone.device.matches('#devicePlay,#deviceLyrics')) this.phone.device.dataset.immersive = String(enabled);
    if (this.fig) this.fig.dataset.immersive = String(enabled);
    NP.phones.resize();
    void ph.offsetWidth;
    ph.classList.remove('is-immersive-change');
    if (this.pageMotion) {
      var viewport = ph.getBoundingClientRect();
      var scaleX = viewport.width / ph.offsetWidth, scaleY = viewport.height / ph.offsetHeight;
      var frames = {};
      painted.forEach(function (item) {
        var frame = item.frame, bounds = item.bounds;
        frame.left = (bounds.left - viewport.left) / scaleX;
        frame.top = (bounds.top - viewport.top) / scaleY;
        frame.width = bounds.width / scaleX;
        frame.height = bounds.height / scaleY;
        frame.paintedBounds = bounds;
        ['corner', 'fontSize', 'lineHeight', 'glyphWidth', 'glyphHeight'].forEach(function (key) { frame[key] *= oldScale / scaleX; });
        frames[item.key] = frame;
      });
      this.setPage(ph.classList.contains('is-lyrics'), false, { duration: 560, easing: 'linear', frames: frames });
    }
    if (!ph.classList.contains('is-lyrics') && !(NP.appMotion && NP.appMotion.reduced())) {
      var identity = $('.pc-id', ph);
      if (this.identityMotion) this.identityMotion.cancel();
      this.identityMotion = identity.animate([{ transform: 'translateY(25%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 400, delay: 150, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' });
    }
  };
  PlayerUI.prototype.sync = function () {
    var ph = this.ph;
    $$('[data-ph-timer]', ph).forEach(function (b) {
      b.classList.toggle('is-acc', !!sleep.mode);
      var u = b.querySelector('use');
      if (u) u.setAttribute('href', sleep.mode ? '#i-timer-f' : '#i-timer');
    });
    if (this.queueCur) {
      var u = $('use', this.queueCur);
      if (u) u.setAttribute('href', P.playing && P.audible ? '#i-pause' : '#i-play-o');
    }
    if (this.addCount) this.addCount.textContent = songs(favCount);
    if (this.volXs) this.volXs.style.setProperty('--v', P.volume.toFixed(4));
    (this.flights || []).forEach(function (flight) {
      if (!/^(play|favorite|timer)$/.test(flight.key)) return;
      var icon = $('use', flight.node), target = $('use', flight.to);
      if (icon && target) icon.setAttribute('href', target.getAttribute('href'));
      var svg = $('svg', flight.node);
      if (svg) svg.style.color = getComputedStyle(flight.to).color;
    });
  };

  // shared keys from NowPlayingLyricsSharedMotion, CoverTopBar and CoverActionToolbar
  var playbackShared = [
    ['cover', '.pc-art>img', '.pl-top>img'],
    ['back', '.pc-top [data-ph-collapse]', '.pl-top [data-ph-collapse]'],
    ['artist', '.pc-id>span', '.pl-top__id>span'],
    ['favorite', '.pc-top [data-ph-like]', '.pl-top [data-ph-like]'],
    ['more', '.pc-top [data-ph-more]', '.pl-top [data-ph-more]'],
    ['progress', '.pc-prog', '.pl-prog'],
    ['previous', '.pc-ctrl [data-ph-prev]', '.pl-ctrl [data-ph-prev]'],
    ['play', '.pc-ctrl [data-ph-toggle]', '.pl-ctrl [data-ph-toggle]'],
    ['next', '.pc-ctrl [data-ph-next]', '.pl-ctrl [data-ph-next]'],
    ['queue', '.pc-dock [data-ph-queue]', '.pl-tools [data-ph-queue]'],
    ['timer', '.pc-dock [data-ph-timer]', '.pl-tools [data-ph-timer]'],
    ['volume', '.pc-dock [data-ph-volume]', '.pl-tools [data-ph-volume]'],
    ['lyrics', '.pc-dock [data-ph-golyrics]', '.pl-tools [data-ph-golyrics]'],
    ['add', '.pc-dock [data-ph-add]', '.pl-tools [data-ph-add]']
  ];
  function playbackBox(element, ink) {
    var width = parseFloat(ink.width) || element.offsetWidth;
    var height = parseFloat(ink.height) || element.offsetHeight;
    if (ink.boxSizing !== 'border-box') {
      width += (parseFloat(ink.paddingLeft) || 0) + (parseFloat(ink.paddingRight) || 0) + (parseFloat(ink.borderLeftWidth) || 0) + (parseFloat(ink.borderRightWidth) || 0);
      height += (parseFloat(ink.paddingTop) || 0) + (parseFloat(ink.paddingBottom) || 0) + (parseFloat(ink.borderTopWidth) || 0) + (parseFloat(ink.borderBottomWidth) || 0);
    }
    return { width: width, height: height };
  }
  function playbackLocalRect(element, root) {
    var size = playbackBox(element, getComputedStyle(element));
    var matrix = new DOMMatrix();
    // stay in the display's layout space; website perspective and container morphs belong to the parent
    for (var node = element; node && node !== root; node = node.offsetParent) {
      var ink = getComputedStyle(node);
      var parent = node.offsetParent;
      var origin = ink.transformOrigin.split(' ').map(parseFloat);
      var scale = ink.scale === 'none' ? [1, 1] : ink.scale.split(' ').map(Number);
      var local = new DOMMatrix().translate(origin[0], origin[1]).scale(scale[0], scale.length > 1 ? scale[1] : scale[0]);
      if (ink.transform !== 'none') local = local.multiply(new DOMMatrix(ink.transform));
      local = local.translate(-origin[0], -origin[1]);
      var left = ink.position === 'absolute' && ink.left !== 'auto' ? parseFloat(ink.left) : node.offsetLeft;
      var top = ink.position === 'absolute' && ink.top !== 'auto' ? parseFloat(ink.top) : node.offsetTop;
      matrix = new DOMMatrix().translate(left + (parent ? parent.clientLeft - parent.scrollLeft : 0), top + (parent ? parent.clientTop - parent.scrollTop : 0)).multiply(local).multiply(matrix);
    }
    var points = [[0, 0], [size.width, 0], [0, size.height], [size.width, size.height]].map(function (point) { return matrix.transformPoint({ x: point[0], y: point[1] }); });
    var left = Math.min.apply(null, points.map(function (point) { return point.x; }));
    var top = Math.min.apply(null, points.map(function (point) { return point.y; }));
    return { left: left, top: top, width: Math.max.apply(null, points.map(function (point) { return point.x; })) - left, height: Math.max.apply(null, points.map(function (point) { return point.y; })) - top };
  }
  function playbackFrame(element, key, root) {
    var rect = playbackLocalRect(element, root);
    var ink = getComputedStyle(element);
    if (key === 'artist' && !element.classList.contains('ph-shared-flight') && element.firstChild) {
      var range = document.createRange();
      range.selectNodeContents(element);
      var text = range.getBoundingClientRect();
      if (text.width && text.height) {
        var width = text.width / element.getBoundingClientRect().width * rect.width;
        if (ink.textAlign === 'center') rect.left += (rect.width - width) / 2;
        rect.width = width;
      }
    }
    var shape = key === 'cover' && element.parentElement.classList.contains('pc-art') ? getComputedStyle(element.parentElement) : ink;
    var corner = key === 'cover' ? shape.getPropertyValue('--ph-cover-corner') : ink.borderTopLeftRadius;
    var icon = $('svg', element);
    var glyph = icon && getComputedStyle(icon);
    var box = playbackBox(element, ink);
    var glyphTransform = glyph && glyph.transform !== 'none' ? new DOMMatrix(glyph.transform) : new DOMMatrix();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, corner: parseFloat(corner) || 0, cornerSmoothing: key === 'cover' ? Math.max(0, Math.min(1, +shape.getPropertyValue('--ph-cover-smoothing'))) : 0, fontSize: parseFloat(ink.fontSize), lineHeight: parseFloat(ink.lineHeight) || rect.height, glyphWidth: glyph ? parseFloat(glyph.width) * rect.width / box.width * Math.abs(glyphTransform.a) : 0, glyphHeight: glyph ? parseFloat(glyph.height) * rect.height / box.height * Math.abs(glyphTransform.d) : 0, color: ink.color, backgroundColor: ink.backgroundColor };
  }
  function copyPlaybackLayer(source, key) {
    var copy = source.cloneNode(true);
    [copy].concat(Array.from(copy.querySelectorAll('*'))).forEach(function (node) {
      Array.from(node.attributes).forEach(function (attribute) {
        if (/^(data-|id$|name$)/.test(attribute.name)) node.removeAttribute(attribute.name);
      });
    });
    copy.querySelectorAll('.ph-rpl').forEach(function (node) { node.remove(); });
    copy.classList.add('ph-shared-flight');
    copy.dataset.flight = key;
    copy.inert = true;
    copy.setAttribute('aria-hidden', 'true');
    var ink = getComputedStyle(source);
    copy.style.cssText = 'position:absolute;z-index:8;pointer-events:none;object-fit:cover;margin:0;border:0;padding:0;overflow:hidden;transform:none;translate:none;scale:1;transition:none;opacity:1;visibility:visible;font:' + ink.font + ';color:' + ink.color + ';background:' + ink.backgroundColor;
    if (key === 'artist') copy.style.cssText += ';display:block;text-align:left;white-space:nowrap';
    copy.querySelectorAll('svg').forEach(function (svg, i) {
      var original = source.querySelectorAll('svg')[i];
      var css = getComputedStyle(original);
      svg.style.width = css.width;
      svg.style.height = css.height;
      svg.classList.remove('ph-pop', 'ph-icon-swap');
    });
    copy.querySelectorAll('canvas').forEach(function (canvas, i) {
      var original = source.querySelectorAll('canvas')[i];
      canvas.width = original.width;
      canvas.height = original.height;
      canvas.getContext('2d').drawImage(original, 0, 0);
    });
    return copy;
  }
  var playbackBounds = ['left', 'top', 'width', 'height', 'fontSize', 'lineHeight', 'corner', 'cornerSmoothing', 'glyphWidth', 'glyphHeight'];
  function playbackSpring(from, to, velocity, seconds) {
    var displacement = from - to;
    return to + (displacement + (velocity + 20 * displacement) * seconds) * Math.exp(-20 * seconds);
  }
  PlayerUI.prototype.setPage = function (lyrics, preview, settle) {
    var ph = this.ph;
    if (ph.classList.contains('is-lyrics') === lyrics && !settle) return;
    if (NP.appMotion) NP.appMotion.artwork(ph);
    var self = this;
    var current = {};
    var pages = [$('.pg-cover', ph), $('.pg-lyrics', ph)];
    var opacity = pages.map(function (page) { return parseFloat(getComputedStyle(page).opacity); });
    var focused = document.activeElement;
    if (this.flights) this.flights.forEach(function (flight) {
      var frame = playbackFrame(flight.node, flight.key, ph);
      frame.velocity = {};
      if (flight.spring) {
        var seconds = Math.max(0, flight.animation.currentTime || 0) / 1000;
        playbackBounds.forEach(function (key) {
          var velocity = flight.start.velocity && flight.start.velocity[key] || 0;
          var displacement = flight.start[key] - flight.end[key];
          frame.velocity[key] = (velocity - 20 * (velocity + 20 * displacement) * seconds) * Math.exp(-20 * seconds);
          if (flight.key === 'cover' && (key === 'cornerSmoothing' && (frame[key] <= 0 || frame[key] >= 1) || key === 'corner' && (frame[key] <= 10 || frame[key] >= 24))) frame.velocity[key] = 0;
        });
      }
      current[flight.key] = frame;
    });
    if (this.pageMotion) this.pageMotion.cancel();
    this.pageMotion = null;
    this.previewAnimations = null;
    if (settle && settle.frames) current = settle.frames;
    var sources = playbackShared.map(function (entry) {
      var from = $(entry[lyrics ? 1 : 2], ph), to = $(entry[lyrics ? 2 : 1], ph);
      return { key: entry[0], from: from, to: to, frame: current[entry[0]] || playbackFrame(from, entry[0], ph) };
    });
    ph.classList.toggle('is-lyrics', lyrics);
    pages.forEach(function (page, i) { page.inert = (i === 1) !== lyrics; page.setAttribute('aria-hidden', String(page.inert)); });
    if (this.fig) this.fig.classList.toggle('is-alt', lyrics !== (ph.getAttribute('data-home') === 'lyrics'));
    if (this.phone && this.phone.page) this.phone.page.dirty = true;
    if (this.phone && this.phone.cover) this.phone.cover.dirty = true;
    var focusTarget = sources.find(function (item) { return item.from === focused; });
    if (focusTarget) focusTarget.to.focus({ preventScroll: true });
    this.flights = [];
    if (!NP.appMotion || NP.appMotion.reduced()) return;
    var animations = [];
    var flights = this.flights;
    var duration = preview ? 300 : settle ? settle.duration : 560;
    var motion = {
      animations: animations,
      cancel: function () {
        cancelAnimationFrame(motion.waveFrame);
        animations.forEach(function (animation) { animation.cancel(); });
        flights.forEach(function (flight) {
          flight.from.style.opacity = flight.fromOpacity;
          flight.to.style.opacity = flight.toOpacity;
          flight.from.removeAttribute('data-ph-morph-opacity');
          flight.to.removeAttribute('data-ph-morph-opacity');
          flight.node.remove();
        });
        ph.classList.remove('is-player-morphing');
      }
    };
    this.pageMotion = motion;
    ph.classList.add('is-player-morphing');
    sources.forEach(function (item) {
      var from = item.frame;
      var to = playbackFrame(item.to, item.key, ph);
      var copy = copyPlaybackLayer(item.from, item.key);
      if (item.key === 'cover') {
        copy.style.borderRadius = '0';
        copy.style.clipPath = NP.artworkShape.clip(from.width, from.height, from.corner, from.cornerSmoothing);
      }
      var flight = { key: item.key, node: copy, from: item.from, to: item.to, fromOpacity: item.from.style.opacity, toOpacity: item.to.style.opacity, start: from, end: to, spring: !preview && !settle };
      // draw suppression keeps the live endpoints focusable and clickable like Compose drawWithContent
      item.from.style.opacity = '0';
      item.to.style.opacity = '0';
      item.from.setAttribute('data-ph-morph-opacity', flight.fromOpacity);
      item.to.setAttribute('data-ph-morph-opacity', flight.toOpacity);
      ph.appendChild(copy);
      if (from.paintedBounds) {
        var rootBounds = ph.getBoundingClientRect();
        var rootScaleX = rootBounds.width / ph.offsetWidth, rootScaleY = rootBounds.height / ph.offsetHeight;
        // changing the viewport also changes the paper's perspective projection
        for (var pass = 0; pass < 3; pass++) {
          ['left', 'top', 'width', 'height'].forEach(function (key) { copy.style[key] = from[key] + 'px'; });
          var painted = copy.getBoundingClientRect(), target = from.paintedBounds;
          if (Math.max(Math.abs(painted.left - target.left), Math.abs(painted.top - target.top), Math.abs(painted.width - target.width), Math.abs(painted.height - target.height)) < .1) break;
          from.left += (target.left - painted.left) / rootScaleX;
          from.top += (target.top - painted.top) / rootScaleY;
          if (painted.width) from.width *= target.width / painted.width;
          if (painted.height) from.height *= target.height / painted.height;
        }
      }
      var points = NP.appMotion.springFrames('progress', 0, 1, 1, 400, 560).map(function (frame) {
        var values = { offset: frame.offset };
        if (frame.offset === 0 || frame.offset === 1) {
          values.color = frame.offset ? to.color : from.color;
          values.backgroundColor = frame.offset ? to.backgroundColor : from.backgroundColor;
        }
        playbackBounds.forEach(function (key) {
          var value = preview || settle ? from[key] + (to[key] - from[key]) * frame.offset : playbackSpring(from[key], to[key], from.velocity && from.velocity[key] || 0, frame.offset * duration / 1000);
          if (frame.offset === 1) value = to[key];
          if (item.key === 'cover' && key === 'corner') value = Math.max(10, Math.min(24, value));
          if (key === 'cornerSmoothing') value = Math.max(0, Math.min(1, value));
          var property = key === 'corner' ? item.key === 'cover' ? '--ph-cover-corner' : 'borderRadius' : key === 'cornerSmoothing' ? '--ph-cover-smoothing' : key === 'glyphWidth' ? '--ph-morph-glyph-width' : key === 'glyphHeight' ? '--ph-morph-glyph-height' : key;
          values[property] = key === 'cornerSmoothing' ? value : value + 'px';
        });
        return values;
      });
      flight.animation = copy.animate(points, { duration: duration, easing: settle ? settle.easing : 'linear', fill: 'both' });
      animations.push(flight.animation);
      flights.push(flight);
    });
    // titles, lyric bodies and the dock surface use the source's separate 300 ms linear fade
    pages.forEach(function (page, i) { animations.push(page.animate([{ opacity: opacity[i] }, { opacity: (i === 1) === lyrics ? 1 : 0 }], { duration: settle ? duration : 300, easing: settle ? settle.easing : 'linear', fill: 'both' })); });
    var progressFlight = flights.find(function (flight) { return flight.key === 'progress'; });
    var coverFlight = flights.find(function (flight) { return flight.key === 'cover'; });
    motion.drawArtwork = function () {
      var css = getComputedStyle(coverFlight.node);
      coverFlight.node.style.clipPath = NP.artworkShape.clip(parseFloat(css.width), parseFloat(css.height), parseFloat(css.getPropertyValue('--ph-cover-corner')), +css.getPropertyValue('--ph-cover-smoothing'));
    };
    motion.drawArtwork();
    function updateWave() {
      if (self.pageMotion !== motion) return;
      if (!document.hidden && self.phone && self.phone.visible) {
        motion.drawArtwork();
        var source = $('canvas', progressFlight.to), canvas = $('canvas', progressFlight.node);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      }
      motion.waveFrame = requestAnimationFrame(updateWave);
    }
    motion.waveFrame = requestAnimationFrame(updateWave);
    if (preview) animations.forEach(function (animation) { animation.pause(); animation.currentTime = 0; });
    this.previewAnimations = preview ? animations : null;
    Promise.all(animations.map(function (animation) { return animation.finished; })).then(function () {
      if (self.pageMotion !== motion) return;
      motion.cancel();
      self.pageMotion = null;
      self.flights = [];
      self.previewAnimations = null;
      var badge = $('.pc-badge:not([hidden])', ph);
      if (!lyrics && badge) badge.animate([{ scale: '0' }, { scale: '1' }], { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' });
    }, function () {});
  };
  PlayerUI.prototype.bindSwipe = function () {
    var self = this;
    var ph = this.ph;
    var x0 = 0;
    var y0 = 0;
    var active = false;
    var moved = false;
    var edge = false;
    var predicting = false;
    var progress = 0;
    ph.addEventListener('pointerdown', function (e) {
      if (ph.classList.contains('is-sheet') || e.target.closest('button, canvas, .xslider, .lrc-c, .lrc-l')) { active = false; return; }
      active = true;
      moved = false;
      x0 = e.clientX;
      y0 = e.clientY;
      edge = ph.classList.contains('is-lyrics') && e.clientX - ph.getBoundingClientRect().left < 28;
      predicting = false; progress = 0;
    });
    ph.addEventListener('pointermove', function (e) {
      if (!active) return;
      var dx = e.clientX - x0;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - y0) * 1.4) moved = true;
      if (edge && moved && dx > 0) {
        if (!predicting) { self.setPage(false, true); predicting = true; ph.setPointerCapture(e.pointerId); }
        progress = Math.max(0, Math.min(1, dx / ph.getBoundingClientRect().width));
        var low = 0, high = 1, t = .5;
        for (var i = 0; i < 12; i++) { t = (low + high) / 2; var x = 1.2 * (1 - t) * (1 - t) * t + .6 * (1 - t) * t * t + t * t * t; if (x < progress) low = t; else high = t; }
        var eased = 3 * (1 - t) * t * t + t * t * t;
        (self.previewAnimations || []).forEach(function (animation) { animation.currentTime = eased * animation.effect.getTiming().duration; });
      }
    });
    ph.addEventListener('pointerup', function (e) {
      if (!active || !moved) { active = false; return; }
      active = false;
      if (predicting) {
        predicting = false;
        var fraction = self.previewAnimations && self.previewAnimations[0] ? self.previewAnimations[0].currentTime / 300 : 0;
        var commit = progress >= .35;
        self.setPage(!commit, false, { duration: commit ? Math.max(1, (1 - fraction) * 300) : Math.max(160, fraction * 300), easing: commit ? 'cubic-bezier(0,0,.58,1)' : 'cubic-bezier(.4,0,.2,1)' });
        self.previewAnimations = null;
        return;
      }
      var r = ph.getBoundingClientRect();
      var k = r.width / ph.offsetWidth;
      var dx = (e.clientX - x0) / k;
      if (dx < -56 && !ph.classList.contains('is-lyrics')) self.setPage(true);
      else if (dx > 56 && ph.classList.contains('is-lyrics')) self.setPage(false);
    });
    ph.addEventListener('pointercancel', function () {
      active = false;
      if (predicting) {
        predicting = false;
        var fraction = self.previewAnimations && self.previewAnimations[0] ? self.previewAnimations[0].currentTime / 300 : 0;
        self.setPage(true, false, { duration: Math.max(160, fraction * 300), easing: 'cubic-bezier(.4,0,.2,1)' });
        self.previewAnimations = null;
      }
    });
  };

  PlayerUI.prototype.buildMore = function () {
    var self = this;
    var ph = this.ph;
    var items = [
      ['i-info', L('获取歌曲信息', 'Get Song Info'), null, 'search'],
      ['i-edit', L('编辑歌曲信息', 'Edit Song Info'), null, 'edit'],
      ['i-info', L('歌曲信息详情', 'Song Details'), null, 'details'],
      ['i-timer', L('调整歌词行为', 'Adjust Lyrics Behavior'), null, 'lyrics'],
      ['i-fontsize', L('歌词字体大小', 'Lyrics Font Size'), L('歌词 100% · 翻译 100%', 'Lyrics 100% · Translation 100%'), 'font'],
      ['i-share', L('分享', 'Share'), null, 'share'],
      ['i-chart', L('播放统计', 'Playback Stats'), null, 'stats'],
      ['i-headphones', L('一起听', 'Listen Together'), null, 'together'],
    ];
    var html = '<ul class="sh-menu">' + items.map(function (it, i) {
      return '<li><button type="button" class="sh-menu__row" data-i="' + i + '">' + ic(it[0]) + '<span><b>' + it[1] + '</b>' + (it[2] ? '<small>' + it[2] + '</small>' : '') + '</span></button></li>';
    }).join('') + '</ul>';
    var s = makeSheet(ph, 'msheet--more', html);
    this.more = { el: s };
    dragToDismiss(s, this.layers);
    $$('.sh-menu__row', s).forEach(function (b) {
      b.addEventListener('click', function () {
        var it = items[+b.getAttribute('data-i')];
        var act = it[3];
        if (act === 'share') {
          var text = L('分享 Neri Line 的单曲《星轨》', 'Neri Line – “星轨”') + ' · NeriPlayer ' + location.href.split('#')[0];
          var done = function () { snack(ph, L('分享文案已复制', 'Share text copied')); };
          if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done);
          else done();
          self.layers.hide();
          return;
        }
        if (act === 'stats' && NP.appPreview) { self.layers.hide(); NP.appPreview.openLibraryPanel(ph, 'stats'); return; }
        self.openAction(act, it[1]);
      });
    });
  };

  PlayerUI.prototype.openAction = function (action, heading) {
    if (action === 'edit') { if (NP.songEdit) NP.songEdit.open(this); return; }
    var self = this;
    var ph = this.ph;
    var meta = NP.previewTrack || (NP.previewTrack = { title: L('星轨', 'Startrail'), artist: 'Neri Line', offset: 0, lyricScale: 1, translationScale: 1 });
    function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function field(key, label, value, type) { return '<label class="ph-action-field">' + label + '<input data-action-field="' + key + '" type="' + (type || 'text') + '" value="' + escape(value) + '"></label>'; }
    var body = '';
    if (action === 'search') body = field('keyword', L('搜索关键词', 'Search keywords'), meta.title + ' ' + meta.artist) + '<div class="ph-action-platform" role="tablist">' + ['NetEase', 'Bilibili', 'YouTube'].map(function (name, i) { return '<button type="button" data-action-platform="' + name + '" role="tab" aria-selected="' + !i + '">' + name + '</button>'; }).join('') + '</div><p class="ph-action-results">' + L('输入关键词后搜索歌曲信息', 'Search for track information using a keyword') + '</p>';
    else if (action === 'details') body = '<dl class="ph-action-details">' + [[L('歌曲', 'Title'), meta.title], [L('歌手', 'Artist'), meta.artist], [L('来源', 'Source'), L('本地文件', 'Local file')], [L('时长', 'Duration'), mmss(P.dur * 1000)], [L('格式', 'Format'), 'MP3'], [L('文件', 'File'), 'startrail.mp3']].map(function (row) { return '<div><dt>' + row[0] + '</dt><dd>' + escape(row[1]) + '</dd></div>'; }).join('') + '</dl>';
    else if (action === 'lyrics') body = '<label class="ph-action-check"><span>' + L('显示歌词翻译', 'Show translation') + '</span><input type="checkbox" data-action-translation' + (!ph.classList.contains('no-trans') ? ' checked' : '') + '></label><label class="ph-action-field">' + L('调整歌词偏移', 'Lyric offset') + '<output data-action-output="offset">' + meta.offset + ' ms</output><input type="range" data-action-range="offset" min="-5000" max="5000" step="50" value="' + meta.offset + '"></label>';
    else if (action === 'font') body = [['lyricScale', L('歌词字体大小', 'Lyric font size')], ['translationScale', L('翻译字体大小', 'Translation font size')]].map(function (row) { return '<label class="ph-action-field">' + row[1] + '<output data-action-output="' + row[0] + '">' + Math.round(meta[row[0]] * 100) + '%</output><input type="range" data-action-range="' + row[0] + '" min="0.5" max="1.6" step="0.1" value="' + meta[row[0]] + '"></label>'; }).join('');
    else if (action === 'stats') body = '<div class="ph-action-platform">' + [L('日','Day'),L('周','Week'),L('月','Month'),L('年','Year'),L('全部','All')].map(function (name, i) { return '<button type="button" data-action-period aria-pressed="' + !i + '">' + name + '</button>'; }).join('') + '<div class="ph-action-stat"><b>' + (P.t > 0 ? 1 : 0) + '</b><span>' + L('首歌曲', 'song') + '</span><b>' + Math.floor(P.t) + '</b><span>' + L('秒收听', 'seconds listened') + '</span></div><p>' + meta.title + ' · ' + meta.artist + '</p>';
    else if (action === 'together') body = field('server', L('服务器地址', 'Server URL'), '', 'url') + field('room', L('房间号', 'Room code'), '') + field('nickname', L('昵称', 'Nickname'), '') + '<p class="ph-action-results">' + L('未连接', 'Disconnected') + '</p>';
    else if (action === 'queue') body = '<div class="ph-action-options"><button type="button" data-action-queue="shuffle">' + L('随机播放', 'Shuffle') + '</button><button type="button" data-action-queue="clear">' + L('清空播放队列', 'Clear queue') + '</button></div>';
    if (!this.actionDialog) {
      var d = makeDialog(ph, 'mdialog--action', '');
      this.actionDialog = { el: d, dialog: true };
      d.addEventListener('input', function (e) {
        var key = e.target.dataset.actionRange;
        if (!key) return;
        var value = Number(e.target.value);
        $('[data-action-output="' + key + '"]', d).textContent = key === 'offset' ? value + ' ms' : Math.round(value * 100) + '%';
      });
      d.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-action-close')) { self.layers.hide(); return; }
        if (b.hasAttribute('data-action-platform')) { $$('[data-action-platform]', d).forEach(function (tab) { tab.setAttribute('aria-selected', tab === b); }); return; }
        if (b.hasAttribute('data-action-period')) { $$('[data-action-period]', d).forEach(function (tab) { tab.setAttribute('aria-pressed', tab === b); }); return; }
        if (b.dataset.actionQueue) { if (b.dataset.actionQueue === 'clear') NP.previewQueue.clear(); else { P.shuffle = true; P.emit(); } self.layers.hide(); return; }
        if (!b.hasAttribute('data-action-apply')) return;
        var current = self.actionDialog.action;
        if (current === 'search') { $('.ph-action-results', d).textContent = L('未找到匹配结果', 'No matching results'); return; }
        if (current === 'together') {
          var server = $('[data-action-field="server"]', d);
          var room = $('[data-action-field="room"]', d);
          if (!server.value || !room.value) { server.required = true; room.required = true; (server.value ? room : server).reportValidity(); return; }
          $('.ph-action-results', d).textContent = L('尚未连接服务器', 'Not connected to the server'); return;
        }
        if (current === 'lyrics') {
          meta.offset = +$('[data-action-range="offset"]', d).value;
          var translated = $('[data-action-translation]', d).checked;
          document.querySelectorAll('.ph').forEach(function (phone) { phone.classList.toggle('no-trans', !translated); });
        } else if (current === 'font') {
          ['lyricScale', 'translationScale'].forEach(function (key) { meta[key] = +$('[data-action-range="' + key + '"]', d).value; });
          document.querySelectorAll('.ph').forEach(function (phone) { phone.style.setProperty('--lyric-scale', meta.lyricScale); phone.style.setProperty('--translation-scale', meta.translationScale); });
        }
        if (NP.phones.list) NP.phones.list.forEach(function (phone) { if (phone.cover) phone.cover.dirty = true; if (phone.page) phone.page.remeasureFor(520); });
        self.layers.hide();
      });
    }
    var dialog = this.actionDialog;
    dialog.action = action;
    dialog.el.innerHTML = '<div class="mdialog__card"><p class="mdialog__title">' + heading + '</p><div class="mdialog__body">' + body + '</div><p class="mdialog__actions"><button type="button" class="mdialog__text" data-action-close>' + L('关闭', 'Close') + '</button>' + (action === 'details' || action === 'stats' || action === 'queue' ? '' : '<button type="button" class="mdialog__text" data-action-apply>' + (action === 'search' ? L('搜索','Search') : action === 'together' ? L('加入','Join') : L('保存','Save')) + '</button>') + '</p></div>';
    dialog.onShow = function () { var first = dialog.el.querySelector('input,button'); if (first) first.focus({ preventScroll: true }); };
    this.layers.show(dialog, true);
  };

  PlayerUI.prototype.buildQueue = function () {
    var self = this;
    var ph = this.ph;
    var rows = QUEUE.map(function (q, i) {
      var cur = i === CUR;
      return '<li class="sh-q' + (cur ? ' is-cur' : '') + '"><button type="button" class="sh-q__row" data-i="' + i + '"><i>' + (i + 1) + '</i><img src="' + cover(q[0]) + '" alt="" width="96" height="96" loading="lazy"><span><b>' + q[1] + '</b><small>' + q[2] + '</small></span>' + (cur ? '<em class="sh-q__now">' + ic('i-play-o') + '</em>' : '') + '</button><button type="button" class="pbtn sh-q__more" aria-label="' + L('更多', 'More') + '">' + ic('i-more') + '</button></li>';
    }).join('');
    var html = '<div class="sh-q__head"><p><b>' + L('播放列表', 'Play Queue') + '</b><small>' + songs(QUEUE.length) + '</small></p><button type="button" class="sh-q__chip" data-q-jump>' + ic('i-play-o') + L('第 ' + (CUR + 1) + ' 首', 'No. ' + (CUR + 1)) + '</button></div><ol class="sh-q__list" data-q-list>' + rows + '</ol><button type="button" class="sh-q__fab" aria-label="' + L('播放列表快捷操作', 'Queue Quick Actions') + '">' + ic('i-more') + '</button>';
    var s = makeSheet(ph, 'msheet--queue', html);
    var list = $('[data-q-list]', s);
    this.queueCur = $('.sh-q__now', s);
    function jump(smooth) {
      var row = $('.is-cur', list);
      if (!row) return;
      list.scrollTo({ top: row.offsetTop - list.clientHeight + row.offsetHeight + 24, behavior: smooth ? 'smooth' : 'auto' });
    }
    function syncQueue() { list.innerHTML = QUEUE.length ? rows : '<li class="ph-queue-empty">' + L('播放列表为空', 'The queue is empty') + '</li>'; $('.sh-q__head small', s).textContent = songs(QUEUE.length); $('[data-q-jump]', s).disabled = !QUEUE.length; self.queueCur = $('.sh-q__now', s); }
    this.queue = { el: s, onShow: function () { syncQueue(); jump(false); } };
    document.addEventListener('np-preview-queue', syncQueue);
    dragToDismiss(s, this.layers);
    $('[data-q-jump]', s).addEventListener('click', function () { jump(true); });
    s.addEventListener('click', function (e) {
      if (e.target.closest('.sh-q__row')) { if (!(P.playing && P.audible)) P.play(); }
      if (e.target.closest('.sh-q__more,.sh-q__fab')) self.openAction('queue', L('播放列表快捷操作', 'Queue quick actions'));
    });
  };

  PlayerUI.prototype.buildVolume = function () {
    var html = '<p class="sh-vol__title">' + L('手机扬声器', 'Phone Speaker') + '</p><div class="sh-vol__row">' + ic('i-speaker') + '<div class="xslider sh-vol__xs" style="--v:1"><i class="xs-on"></i><i class="xs-thumb"></i><i class="xs-off"></i></div></div>';
    var s = makeSheet(this.ph, 'msheet--vol', html);
    this.volume = { el: s };
    this.volXs = $('.xslider', s);
    dragToDismiss(s, this.layers);
    NP.sound.dragSlider(this.volXs, function (p) { P.setVolume(p); });
  };

  PlayerUI.prototype.buildAdd = function () {
    var self = this;
    var ph = this.ph;
    var html = '<ul class="sh-add"><li><button type="button" class="sh-add__row"><b>' + L('我喜欢的音乐', 'My Favorite Music') + '</b><small data-add-count>' + songs(favCount) + '</small></button></li></ul>';
    var s = makeSheet(ph, 'msheet--add', html);
    this.add = { el: s };
    this.addCount = $('[data-add-count]', s);
    dragToDismiss(s, this.layers);
    $('.sh-add__row', s).addEventListener('click', function () {
      var had = P.liked;
      P.liked = true;
      favCount = 1;
      P.emit();
      self.layers.hide();
      snack(ph, had ? L('《星轨》已经在「我喜欢的音乐」里了', '“星轨” is already in My Favorite Music') : L('已添加到「我喜欢的音乐」', 'Added to My Favorite Music'));
    });
  };

  PlayerUI.prototype.buildSleep = function () {
    var self = this;
    var ph = this.ph;
    var minutes = 30;
    var html = '<div class="mdialog__card">' +
      '<span class="mdialog__icon">' + ic('i-timer-f') + '</span>' +
      '<p class="mdialog__title">' + L('睡眠定时器', 'Sleep Timer') + '</p>' +
      '<div class="mdialog__body">' +
      '<div class="sl-run" data-sl-run><small>' + L('定时器运行中', 'Timer Running') + '</small><b data-sl-left>30:00</b></div>' +
      '<p class="sl-label">' + L('倒计时', 'Countdown') + '</p>' +
      '<p class="sl-min" data-sl-min></p>' +
      '<div class="xslider xslider--steps sl-xs" data-sl-xs><i class="xs-on"></i><i class="xs-thumb"></i><i class="xs-off"></i></div>' +
      '<button type="button" class="sl-btn" data-sl="count">' + L('开始倒计时', 'Start Countdown') + '</button>' +
      '<p class="sl-label">' + L('其他模式', 'Other Modes') + '</p>' +
      '<button type="button" class="sl-btn" data-sl="current">' + ic('i-next') + L('播放完当前歌曲后停止', 'Stop after current song') + '</button>' +
      '<button type="button" class="sl-btn" data-sl="playlist">' + ic('i-playlist-play') + L('播放完播放列表后停止', 'Stop after playlist') + '</button>' +
      '</div>' +
      '<p class="mdialog__actions"><button type="button" class="mdialog__text" data-sl="cancel">' + L('取消定时器', 'Cancel Timer') + '</button><button type="button" class="mdialog__text" data-sl="close">' + L('关闭', 'Close') + '</button></p>' +
      '</div>';
    var d = makeDialog(ph, 'mdialog--sleep', html);
    var xs = $('[data-sl-xs]', d);
    var minEl = $('[data-sl-min]', d);
    var run = $('[data-sl-run]', d);
    var left = $('[data-sl-left]', d);
    var cancel = $('[data-sl="cancel"]', d);
    function paint() {
      xs.style.setProperty('--v', ((minutes - 5) / 115).toFixed(4));
      minEl.textContent = NP.en ? minutes + ' minutes' : minutes + ' 分钟';
      var active = !!sleep.mode;
      run.hidden = !active;
      cancel.hidden = !active;
      if (active) {
        left.textContent = sleep.mode === 'count' ? mmss(sleep.end - Date.now()) : sleep.mode === 'current' ? L('播放完当前歌曲后停止', 'Stop after current song') : L('播放完播放列表后停止', 'Stop after playlist');
        left.classList.toggle('is-text', sleep.mode !== 'count');
      }
    }
    NP.sound.dragSlider(xs, function (p) { minutes = Math.round((5 + p * 115) / 5) * 5; paint(); });
    $$('[data-sl]', d).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sl');
        if (k === 'count') { sleep.mode = 'count'; sleep.end = Date.now() + minutes * 60000; }
        else if (k === 'current' || k === 'playlist') { sleep.mode = k; }
        else if (k === 'cancel') { sleep.mode = null; }
        self.layers.hide();
        P.emit();
        if (k === 'count') snack(ph, L(minutes + ' 分钟后停止播放', 'Playback stops in ' + minutes + ' minutes'));
        else if (k === 'current') snack(ph, L('播放完当前歌曲后停止', 'Stops after the current song'));
        else if (k === 'playlist') snack(ph, L('播放完播放列表后停止', 'Stops after the playlist'));
      });
    });
    this.sleep = { el: d, dialog: true, onShow: paint, paint: paint };
  };

  /* 睡眠定时器真的会停：倒计时到点暂停；「播完当前 / 播完列表」在《星轨》放完时停（它是列表最后一首） */
  function tickSleep(uis) {
    if (!sleep.mode) return;
    var stop = false;
    if (sleep.mode === 'count') stop = Date.now() >= sleep.end;
    else stop = P.playing && P.t >= P.dur - 0.3;
    uis.forEach(function (u) { if (u.layers.open === u.sleep) u.sleep.paint(); });
    if (!stop) return;
    sleep.mode = null;
    if (P.playing) P.pause();
    uis.forEach(function (u) { snack(u.ph, L('睡眠定时器已结束，播放已暂停', 'Sleep timer finished, playback paused')); });
    P.emit();
  }

  /* ---------- 主控位置：中下 / 底部 / 底部 + 进度 ---------- */
  function initPlacement(uis) {
    var lab = $('#placeLab');
    if (!lab) return;
    var btns = $$('[data-place]', lab);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-place');
        btns.forEach(function (o) {
          var on = o === b;
          o.classList.toggle('is-on', on);
          o.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        uis.forEach(function (u) {
          u.ph.setAttribute('data-place', v);
          if (u.fig) u.fig.setAttribute('data-place', v);
          if (u.phone && u.phone.cover) u.phone.cover.dirty = true;
        });
        var play = uis[0];
        if (play && play.ph.classList.contains('is-lyrics')) play.setPage(false);
      });
    });
  }

  /* ---------- 首页迷你播放器：左右滑切歌，带阻尼回弹 ---------- */
  function initMini() {
    var home = $('#phHome');
    var mini = home && $('.hm-mini', home);
    if (!mini) return;
    var row = $('.hm-mini__row', mini);
    var img = $('img', row);
    var title = $('.hm-mini__id b', row);
    var artist = $('.hm-mini__id span', row);
    var btn = $('[data-hm-play]', mini);
    var PEAK = 52;
    var THRESH = 72;
    function resisted(d) { return d === 0 ? 0 : (d > 0 ? 1 : -1) * PEAK * (1 - Math.exp(-Math.abs(d) / PEAK)); }
    function set(off, anim) {
      var r = Math.min(1, Math.abs(off) / PEAK);
      row.style.transition = anim ? 'translate ' + anim + 'ms cubic-bezier(.4, 0, .2, 1), scale ' + anim + 'ms cubic-bezier(.4, 0, .2, 1)' : 'none';
      row.style.translate = off.toFixed(2) + 'px 0';
      row.style.scale = (1 - r * 0.025).toFixed(4);
    }
    function show() {
      var q = QUEUE[CUR];
      if (!q) return;
      img.src = cover(q[0]);
      title.textContent = q[1];
      artist.textContent = q[2];
      paintBtn();
    }
    function playing() { return P.playing && P.audible; }
    function paintBtn() {
      var u = $('use', btn);
      var href = playing() ? '#i-pause' : '#i-play-o';
      if (u.getAttribute('href') !== href) u.setAttribute('href', href);
      btn.setAttribute('aria-label', playing() ? L('暂停', 'Pause') : L('播放', 'Play'));
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (QUEUE.length) P.toggle();
    });
    var x0 = 0;
    var dist = 0;
    var down = false;
    var k = 1;
    mini.addEventListener('pointerdown', function (e) {
      if (e.target.closest('[data-hm-play]')) return;
      down = true;
      dist = 0;
      x0 = e.clientX;
      var r = mini.getBoundingClientRect();
      k = mini.offsetWidth ? r.width / mini.offsetWidth : 1;
      NP.capture(mini, e);
    });
    mini.addEventListener('pointermove', function (e) {
      if (!down) return;
      dist = (e.clientX - x0) / k;
      set(resisted(dist), 0);
    });
    function end() {
      if (!down) return;
      down = false;
      if (Math.abs(dist) >= THRESH) {
        var dir = dist < 0 ? -1 : 1;
        set(dir * PEAK, 120);
        setTimeout(function () { set(0, 180); }, 120);
        setTimeout(function () { if (QUEUE.length) { P.seek(0); P.play(); show(); } }, 300);
      } else set(0, 160);
    }
    mini.addEventListener('pointerup', end);
    mini.addEventListener('pointercancel', end);
    P.on(paintBtn);
  }

  NP.phoneUI = {
    toggleImmersive: function () {
      if (NP.previewSettings) NP.previewSettings.set('nowplaying_immersive_mode', NP.previewSettings.value('nowplaying_immersive_mode') !== true);
    },
    artwork: function (ph) {
      var node = $('[data-flight="cover"]', ph) || $(ph.classList.contains('is-lyrics') ? '.pl-top>img' : '.pc-art>img', ph);
      return node ? { node: node, frame: playbackFrame(node, 'cover', ph) } : null;
    },
    applySettings: function () {
      if (!NP.previewSettings) return;
      var value = NP.previewSettings.value;
      document.querySelectorAll('.ph').forEach(function (ph) {
        ph.querySelectorAll('.pc-badge').forEach(function (el) { el.hidden = value('show_cover_source_badge') === false; });
        ph.classList.toggle('no-trans', value('show_lyric_translation') === false);
        var ui = NP.phoneUI.uis && NP.phoneUI.uis.find(function (candidate) { return candidate.ph === ph; });
        if (ui) ui.applyImmersive(value('nowplaying_immersive_mode') === true);
        else ph.dataset.immersive = String(value('nowplaying_immersive_mode') === true);
        ph.dataset.toolbarDock = String(value('nowplaying_toolbar_dock_enabled') !== false);
        ph.dataset.coverLyrics = String(value('nowplaying_cover_lyrics_enabled') !== false);
        var placement = value('nowplaying_control_placement');
        if (placement) ph.dataset.place = placement === 'bottom_with_progress' ? 'bprog' : placement;
        var fonts = { nowplaying_cover_lyric_font_scale: '--cover-lyric-scale', nowplaying_cover_translation_font_scale: '--cover-translation-scale', lyrics_page_lyric_font_scale: '--page-lyric-scale', lyrics_page_translation_font_scale: '--page-translation-scale' };
        Object.keys(fonts).forEach(function (key) { var number = value(key); if (number != null) ph.style.setProperty(fonts[key], number); });
        ['nowplaying_control_size', 'lyrics_control_size'].forEach(function (key) { var size = value(key); if (size) ph.dataset[key === 'lyrics_control_size' ? 'lyricsControlSize' : 'controlSize'] = String(size).toLowerCase(); });
      });
      $$('[data-immersive-toggle]').forEach(function (button) {
        var enabled = value('nowplaying_immersive_mode') === true;
        button.classList.toggle('is-on', enabled);
        button.setAttribute('aria-pressed', String(enabled));
      });
      if (NP.phones.list) NP.phones.list.forEach(function (phone) { phone.sync(); if (phone.cover) phone.cover.dirty = true; if (phone.page) phone.page.remeasureFor(600); });
      if (NP.appMotion) NP.appMotion.artwork(document);
    },
    mount: function (phone) {
      var ui = new PlayerUI(phone.ph, phone);
      if (this.uis) this.uis.push(ui);
      this.applySettings();
      return ui;
    },
    /* 两台手机各自补齐封面页与歌词页、音效面板与遮罩，之后 Phone 会把它们一起绑定 */
    prepare: function () {
      var play = $('#phPlay');
      var lyr = $('#phLyrics');
      var img = (play && $('.pc-art img', play)) || $('img[src*="img/covers/"]');
      if (img) coverBase = img.getAttribute('src').replace(/[^/]*$/, '');
      if (!play || !lyr) return;
      var lp = $('.pg-lyrics', lyr);
      var cp = $('.pg-cover', play);
      var gesture = $('.ph__gesture', play);
      play.insertBefore(lp.cloneNode(true), $('.sheet-scrim', play) || gesture);
      lyr.insertBefore(cp.cloneNode(true), lp);
      var scrim = $('[data-ph-scrim]', play);
      var lg = $('.ph__gesture', lyr);
      if (scrim) lyr.insertBefore(scrim.cloneNode(true), lg);
      play.setAttribute('data-home', 'cover');
      lyr.setAttribute('data-home', 'lyrics');
      lyr.classList.add('is-lyrics');
      $$('#phPlay, #phLyrics').forEach(function (ph) { ph.setAttribute('data-place', 'lower'); });
    },
    init: function (phones) {
      document.addEventListener('pointerdown', ripple, true);
      var uis = [];
      this.uis = uis;
      document.addEventListener('np-preview-setting', function () { NP.phoneUI.applySettings(); });
      phones.forEach(function (p) {
        var ph = p.ph;
        if (!ph || !ph.hasAttribute('data-home')) return;
        uis.push(new PlayerUI(ph, p));
      });
      $$('[data-immersive-toggle]').forEach(function (button) { button.addEventListener('click', NP.phoneUI.toggleImmersive); });
      NP.sound.usePreset('acg');
      initPlacement(uis);
      initMini();
      NP.addFrame(function () { tickSleep(uis); }, 7);

      var play = uis[0];
      if (play && play.fx) {
        var api = {
          open: function () {
            if (play.layers.open || play.layers.dismissed === play.fx) return;
            if (play.ph.classList.contains('is-lyrics')) play.setPage(false);
            play.layers.show(play.fx, false);
          },
          close: function () { if (play.layers.open === play.fx && !play.layers.manual) play.layers.hide(); },
          isOpen: function () { return !!play.layers.open; },
          scrollTo: function (y) { var sc = $('[data-fx-scroll]', play.fx.el); if (sc) sc.scrollTo({ top: y, behavior: NP.env.reduced ? 'auto' : 'smooth' }); },
        };
        Object.defineProperty(api, 'manual', { get: function () { return play.layers.manual; }, set: function () {} });
        NP.phones.sheet = api;
        $$('[data-open-fx]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (play.ph.classList.contains('is-lyrics')) play.setPage(false);
            play.layers.show(play.fx, true);
            var r = play.ph.getBoundingClientRect();
            if (r.top < 60 || r.bottom > innerHeight) NP.scrollTo(NP.absTop(play.ph) - Math.max(80, (innerHeight - r.height) / 2));
          });
        });
      }
    },
  };
})();
