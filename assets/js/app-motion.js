(function () {
  'use strict';
  var NP = window.NP;
  var reduced = function () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function springFrames(property, from, to, damping, stiffness, duration) {
    var frames = [];
    var w = Math.sqrt(stiffness);
    for (var i = 0; i <= 60; i++) {
      var t = duration / 1000 * i / 60;
      var decay = Math.exp(-damping * w * t);
      var p = damping === 1 ? 1 - (1 + w * t) * decay : 1 - decay * (Math.cos(w * Math.sqrt(1 - damping * damping) * t) + damping / Math.sqrt(1 - damping * damping) * Math.sin(w * Math.sqrt(1 - damping * damping) * t));
      var f = { offset: i / 60 };
      f[property] = property === 'transform' ? 'translateX(' + (from + (to - from) * p) + '%)' : from + (to - from) * p;
      frames.push(f);
    }
    frames[60][property] = property === 'transform' ? 'translateX(' + to + '%)' : to;
    return frames;
  }
  function stripClone(node) {
    node.inert = true;
    node.setAttribute('aria-hidden', 'true');
    [node].concat(Array.from(node.querySelectorAll('*'))).forEach(function (el) {
      Array.from(el.attributes).forEach(function (a) { if (/^(data-|id$|name$)/.test(a.name)) el.removeAttribute(a.name); });
    });
    return node;
  }
  function cleanup(host) {
    clearTimeout(host._motionTimer);
    host.querySelectorAll('.ap-outgoing').forEach(function (el) { el.remove(); });
    host.querySelectorAll('.ap-scene').forEach(function (el) { el.style.visibility = ''; el.style.transform = ''; el.getAnimations().forEach(function (a) { a.cancel(); }); });
    delete host.dataset.motion;
  }
  function scene(host, old, kind, backwards, progress) {
    cleanup(host);
    if (!old || reduced()) return;
    var next = host.querySelector('.ap-scene');
    if (!next) return;
    old = stripClone(old);
    old.classList.add('ap-outgoing');
    next.parentElement.appendChild(old);
    var oldScroll = old.querySelector('.ap-scroll');
    if (oldScroll) oldScroll.scrollTop = old._scrollTop || 0;
    host.dataset.motion = kind;
    var enter;
    var exit;
    if (kind === 'tab') {
      var direction = backwards ? -1 : 1;
      next.style.visibility = 'hidden';
      exit = old.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + -direction * 14 + '%)' }], { duration: 70, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      host._motionTimer = setTimeout(function () {
        next.style.visibility = '';
        old.remove();
        enter = next.animate([{ transform: 'translateX(' + direction * 14 + '%)' }, { transform: 'translateX(0)' }], { duration: 330, easing: 'cubic-bezier(.4,0,.2,1)' });
        enter.finished.then(function () { delete host.dataset.motion; }, function () {});
      }, 70);
      return;
    }
    if (kind === 'settings') {
      var sign = backwards ? -1 : 1;
      var start = progress || 0;
      enter = next.animate(springFrames('transform', sign * 100 * (1 - start), 0, 1, 400, 560), { duration: 560, fill: 'both' });
      exit = old.animate(springFrames('transform', -sign * 100 * start, -sign * 100, 1, 400, 560), { duration: 560, fill: 'forwards' });
    } else {
      var duration = backwards ? 280 : 300;
      if (backwards) {
        enter = next.animate([{ transform: 'scale(.98)' }, { transform: 'scale(1)' }], { duration: duration, easing: 'cubic-bezier(.4,0,.2,1)' });
        old.style.zIndex = 3;
        exit = old.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], { duration: duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      } else {
        enter = next.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: duration, easing: 'cubic-bezier(.4,0,.2,1)' });
        exit = old.animate([{ transform: 'scale(1)' }, { transform: 'scale(.98)' }], { duration: duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
        next.style.zIndex = 3;
      }
    }
    Promise.all([enter.finished, exit.finished]).then(function () {
      enter.cancel();
      old.remove();
      next.style.zIndex = '';
      delete host.dataset.motion;
    }, function () { old.remove(); });
  }
  function layoutDialog(el) {
    if (!el) return;
    var root = el.closest('.app-preview');
    var card = el.querySelector('.ap-dialog:not(.ap-dialog--sheet):not(:has(.al-menu-options))');
    var actions = card && card.querySelector('.ap-dialog-actions');
    if (!root || root.dataset.style !== 'clean' || !actions) return;
    var buttons = Array.from(actions.children);
    var slot = (actions.clientWidth - 10 * (buttons.length - 1)) / buttons.length;
    var stack = buttons.some(function (button) {
      var label = document.createElement('span');
      label.textContent = button.textContent;
      label.style.cssText = 'position:absolute;width:max-content;white-space:nowrap;font:inherit;letter-spacing:inherit;visibility:hidden';
      button.appendChild(label);
      var ink = getComputedStyle(button);
      var width = label.offsetWidth + parseFloat(ink.paddingLeft) + parseFloat(ink.paddingRight);
      label.remove();
      return width > slot;
    });
    actions.dataset.stack = stack;
  }
  function dialog(el, closing) {
    if (!el || reduced()) { if (closing && el) el.remove(); return; }
    var card = el.querySelector('.ap-dialog');
    var root = el.closest('.app-preview');
    if (root && root.dataset.style === 'clean' && !card.classList.contains('ap-dialog--sheet')) {
      if (closing) { el.remove(); return; }
      // Compose stops Float springs at its default 0.01 displacement threshold
      var low = 0, high = 1;
      for (var i = 0; i < 32; i++) {
        var seconds = (low + high) / 2;
        if (.06 * (1 + 30 * seconds) * Math.exp(-30 * seconds) > .01) low = seconds;
        else high = seconds;
      }
      var duration = Math.floor(high * 1000);
      var frames = springFrames('scale', 1.06, 1, 1, 900, duration).map(function (frame) { return { transform: 'scale(' + frame.scale + ')', offset: frame.offset }; });
      card.animate(frames, { duration: duration, easing: 'linear' });
      card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'linear' });
      return;
    }
    if (card.classList.contains('ap-dialog--sheet')) {
      var slide = card.animate([{ transform: closing ? 'translateY(0)' : 'translateY(100%)' }, { transform: closing ? 'translateY(100%)' : 'translateY(0)' }], { duration: closing ? 260 : 500, easing: closing ? 'cubic-bezier(.3,0,.8,.15)' : 'cubic-bezier(.05,.7,.1,1)', fill: 'both' });
      el.animate([{ opacity: closing ? 1 : 0 }, { opacity: closing ? 0 : 1 }], { duration: closing ? 260 : 350, fill: 'both' });
      if (closing) slide.finished.then(function () { el.remove(); }, function () { el.remove(); });
      return;
    }
    el.animate([{ opacity: closing ? 1 : 0 }, { opacity: closing ? 0 : 1 }], { duration: closing ? 150 : 200, fill: 'both' });
    var animation = card.animate([{ transform: closing ? 'scale(1)' : 'scale(.92)', opacity: closing ? 1 : 0 }, { transform: closing ? 'scale(.92)' : 'scale(1)', opacity: closing ? 0 : 1 }], { duration: closing ? 200 : 450, easing: closing ? 'cubic-bezier(.3,0,.8,.15)' : 'cubic-bezier(.05,.7,.1,1)', fill: 'both' });
    if (closing) animation.finished.then(function () { el.remove(); }, function () { el.remove(); });
  }
  function swipe(preview) {
    var start;
    var target;
    var backScene;
    var progress = 0;
    preview.host.addEventListener('pointerdown', function (e) {
      if (preview.host.hasAttribute('data-preview-readonly')) return;
      var rect = preview.host.getBoundingClientRect();
      if (preview.modal || e.target.closest('.ap-native-device') || e.clientX - rect.left > 28 || !preview.host.querySelector('[data-ap-back]')) return;
      var scene = preview.host.querySelector('.ap-scene:not(.ap-outgoing)');
      start = { x: e.clientX, y: e.clientY, width: scene ? scene.getBoundingClientRect().width : rect.width, id: e.pointerId };
    });
    preview.host.addEventListener('pointermove', function (e) {
      if (!start) return;
      var dx = e.clientX - start.x;
      if (!target && Math.abs(e.clientY - start.y) > Math.max(12, dx)) { start = null; return; }
      if (dx < 10 && !target) return;
      target = preview.host.querySelector('.ap-scene:not(.ap-outgoing)');
      if (!target) return;
      if (!backScene && preview.backScene) {
        backScene = stripClone(preview.backScene.cloneNode(true)); backScene.classList.add('ap-outgoing'); backScene.style.zIndex = 0;
        target.parentElement.appendChild(backScene);
        var scroll = backScene.querySelector('.ap-scroll'); if (scroll) scroll.scrollTop = preview.backScene._scrollTop || 0;
        target.style.zIndex = 3;
      }
      preview.host.setPointerCapture(e.pointerId);
      e.preventDefault();
      progress = Math.max(0, Math.min(.95, dx / start.width));
      target.style.transform = 'translateX(' + progress * 100 + '%)';
      if (backScene) backScene.style.transform = 'translateX(' + (progress - 1) * 100 + '%)';
    });
    function end(e) {
      if (!start) return;
      var moving = target;
      var commit = e.type !== 'pointercancel' && progress >= .35;
      start = null; target = null;
      if (!moving) return;
      var background = backScene; backScene = null;
      if (commit) { if (background) background.remove(); preview._gestureProgress = progress; preview.host.querySelector('[data-ap-back]').click(); }
      else {
        moving.animate(springFrames('transform', progress * 100, 0, 1, 400, 400), { duration: reduced() ? 0 : 400 }).finished.then(function () { moving.style.zIndex = ''; }, function () {}); moving.style.transform = '';
        if (background) background.animate(springFrames('transform', (progress - 1) * 100, -100, 1, 400, 400), { duration: reduced() ? 0 : 400 }).finished.then(function () { background.remove(); }, function () { background.remove(); });
      }
      progress = 0;
    }
    preview.host.addEventListener('pointerup', end);
    preview.host.addEventListener('pointercancel', end);
  }
  function artwork(host) {
    if (!NP.artworkShape) return;
    host.querySelectorAll('.pc-art,.pl-top>img,.hm-mini__row>img,.ap-mini-open>img,.ap-mini>img').forEach(function (node) {
      var owner = node.closest('.ph,.app-preview');
      var clean = owner && (owner.dataset.appStyle || owner.dataset.style) === 'clean';
      var cover = node.classList.contains('pc-art'), lyrics = node.parentElement.classList.contains('pl-top');
      var radius = cover ? 24 : lyrics || clean ? 10 : 8, smoothing = clean && !lyrics ? 1 : 0;
      var size = nativeBox(node, getComputedStyle(node));
      node.style.setProperty('--ph-cover-corner', radius + 'px');
      node.style.setProperty('--ph-cover-smoothing', smoothing);
      node.style.borderRadius = '0';
      node.style.clipPath = NP.artworkShape.clip(size.width, size.height, radius, smoothing);
    });
  }
  function nativeBox(node, ink) {
    var width = parseFloat(ink.width) || node.offsetWidth, height = parseFloat(ink.height) || node.offsetHeight;
    if (ink.boxSizing !== 'border-box') {
      width += (parseFloat(ink.paddingLeft) || 0) + (parseFloat(ink.paddingRight) || 0) + (parseFloat(ink.borderLeftWidth) || 0) + (parseFloat(ink.borderRightWidth) || 0);
      height += (parseFloat(ink.paddingTop) || 0) + (parseFloat(ink.paddingBottom) || 0) + (parseFloat(ink.borderTopWidth) || 0) + (parseFloat(ink.borderBottomWidth) || 0);
    }
    return { width: width, height: height };
  }
  function nativeRect(node, root) {
    if (!node || !node.isConnected) return null;
    var size = nativeBox(node, getComputedStyle(node)), matrix = new DOMMatrix();
    for (var el = node; el && el !== root; el = el.offsetParent) {
      var ink = getComputedStyle(el), parent = el.offsetParent;
      var origin = ink.transformOrigin.split(' ').map(parseFloat);
      var scale = ink.scale === 'none' ? [1, 1] : ink.scale.split(' ').map(Number);
      var local = new DOMMatrix().translate(origin[0], origin[1]).scale(scale[0], scale.length > 1 ? scale[1] : scale[0]);
      if (ink.transform !== 'none') local = local.multiply(new DOMMatrix(ink.transform));
      local = local.translate(-origin[0], -origin[1]);
      var left = ink.position === 'absolute' && ink.left !== 'auto' ? parseFloat(ink.left) : el.offsetLeft;
      var top = ink.position === 'absolute' && ink.top !== 'auto' ? parseFloat(ink.top) : el.offsetTop;
      matrix = new DOMMatrix().translate(left + (parent ? parent.clientLeft - parent.scrollLeft : 0), top + (parent ? parent.clientTop - parent.scrollTop : 0)).multiply(local).multiply(matrix);
    }
    var points = [[0, 0], [size.width, 0], [0, size.height], [size.width, size.height]].map(function (p) { return matrix.transformPoint({ x: p[0], y: p[1] }); });
    var x = Math.min.apply(null, points.map(function (p) { return p.x; })), y = Math.min.apply(null, points.map(function (p) { return p.y; }));
    return { left: x, top: y, width: Math.max.apply(null, points.map(function (p) { return p.x; })) - x, height: Math.max.apply(null, points.map(function (p) { return p.y; })) - y };
  }
  function nativeSpring(from, velocity, seconds) {
    var w = Math.sqrt(260), decay = .9 * w, damped = w * Math.sqrt(1 - .9 * .9), displacement = from - 1;
    return 1 + Math.exp(-decay * seconds) * (displacement * Math.cos(damped * seconds) + (velocity + decay * displacement) / damped * Math.sin(damped * seconds));
  }
  function nativeMini(state) {
    var source = state.source && !state.source.hidden ? state.source : state.preview.host.querySelector('.app-preview');
    return source && source.querySelector('.hm-mini,.ap-mini');
  }
  function nativeCapsule(state) {
    var viewport = state.layer.parentElement, mini = nativeMini(state), rect = nativeRect(mini, state.preview.host);
    if (!rect) return null;
    rect.left -= viewport.offsetLeft; rect.top -= viewport.offsetTop;
    var image = mini.querySelector('img'), cover = nativeRect(image, state.preview.host);
    if (cover) { cover.left -= viewport.offsetLeft; cover.top -= viewport.offsetTop; }
    var color = getComputedStyle(mini).backgroundColor, components = color.match(/[\d.]+/g);
    if (components && components.length >= 3) color = 'rgb(' + components.slice(0, 3).map(function (v) { return Math.round(Number(v) * (color.indexOf('color(srgb') === 0 ? 255 : 1)); }).join(',') + ')';
    var shape = image && getComputedStyle(image);
    return { rect: rect, cover: cover, image: image, color: color, corner: shape ? parseFloat(shape.getPropertyValue('--ph-cover-corner')) * cover.width / image.offsetWidth : 0, cornerSmoothing: shape ? +shape.getPropertyValue('--ph-cover-smoothing') : 0 };
  }
  function nativeSurface(state, className, z) {
    var node = document.createElement(className === 'ap-native-cover' ? 'img' : 'div');
    node.className = className; node.style.zIndex = z; node.inert = true; node.setAttribute('aria-hidden', 'true');
    state.layer.parentElement.appendChild(node);
    return node;
  }
  var nativeSystemLocks = new WeakMap();
  function nativeReleaseChrome(state) {
    (state.systemChrome || []).forEach(function (node) {
      var lock = nativeSystemLocks.get(node);
      if (lock && !--lock.users) { node.style.visibility = lock.visibility; nativeSystemLocks.delete(node); }
    });
    state.systemChrome = null;
  }
  function nativeChrome(state) {
    var ph = state.layer.querySelector('.ph');
    if (!state.chrome) {
      state.chrome = nativeSurface(state, 'ap-native-chrome', (+state.layer.style.zIndex || 12) + 3);
      state.chrome.style.transform = 'scale(var(--s))';
      var ink = getComputedStyle(ph);
      state.chrome.style.color = ink.color; state.chrome.style.fontFamily = ink.fontFamily;
      state.chrome.style.setProperty('--p-on', ink.getPropertyValue('--p-on'));
      ph.querySelectorAll(':scope > .ph__status,:scope > .ph__gesture').forEach(function (node) {
        var copy = node.cloneNode(true), locked = nativeSystemLocks.get(node);
        copy.style.visibility = locked ? locked.computed : getComputedStyle(node).visibility;
        state.chrome.appendChild(copy);
      });
    }
    var base = state.preview.host.querySelector('.app-preview');
    if (state.systemChrome && state.chromeBase === base) return;
    nativeReleaseChrome(state); state.chromeBase = base;
    state.systemChrome = Array.from(state.preview.host.querySelectorAll('.app-preview > .ap-status,.app-preview > .ap-gesture,.ap-native-device .ph__status,.ap-native-device .ph__gesture,.ap-native-chrome > .ph__status,.ap-native-chrome > .ph__gesture')).filter(function (node) { return !state.chrome.contains(node); });
    state.systemChrome.forEach(function (node) {
      var lock = nativeSystemLocks.get(node);
      if (!lock) { lock = { users: 0, visibility: node.style.visibility, computed: getComputedStyle(node).visibility }; nativeSystemLocks.set(node, lock); }
      lock.users++; node.style.visibility = 'hidden';
    });
  }
  function nativeClean(state, keepCover) {
    cancelAnimationFrame(state.frame);
    [state.card, keepCover ? null : state.cover, state.scrim, keepCover ? null : state.chrome].forEach(function (node) { if (node) node.remove(); });
    state.card = state.scrim = null;
    if (!keepCover) state.cover = state.chrome = null;
    nativeReleaseChrome(state);
    if (state.hiddenImage) state.hiddenImage.style.opacity = state.imageOpacity;
    state.hiddenImage = null;
    state.layer.removeAttribute('data-native-cover');
    state.layer.removeAttribute('data-native-morph');
    state.layer.style.transform = ''; state.layer.style.clipPath = ''; state.layer.style.opacity = '';
  }
  function nativeDraw(state) {
    var layer = state.layer, viewport = layer.parentElement;
    nativeChrome(state);
    if (state.driver) state.value = parseFloat(getComputedStyle(layer).getPropertyValue('--ap-native-progress')) || 0;
    var screen = getComputedStyle(viewport);
    var p = Math.max(0, Math.min(1, state.value)), width = parseFloat(screen.width), height = parseFloat(screen.height);
    if (layer.dataset.kind !== 'player') { layer.style.transform = 'translateY(' + (1 - p) * height + 'px)'; return; }
    var live = nativeCapsule(state);
    if ((!state.target || state.backPreview) && live) state.capsule = live;
    var capsule = state.capsule;
    var from = capsule ? capsule.rect : { left: 0, top: 0, width: width, height: height };
    var left = Math.max(0, Math.min(width, from.left)), top = Math.max(0, Math.min(height, from.top));
    var right = Math.min(width, Math.max(left, from.left + from.width)), bottom = Math.min(height, Math.max(top, from.top + from.height));
    var x = left * (1 - p), y = top * (1 - p), w = (right - left) * (1 - p) + width * p, h = (bottom - top) * (1 - p) + height * p;
    var scale = Math.max(.01, w / width), density = parseFloat(screen.getPropertyValue('--s')) || width / 411;
    var corner = (p < .8 ? 22 + (40 - 22) * p / .8 : 40 * (1 - p) / .2) * density;
    layer.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    layer.style.clipPath = 'inset(0 0 ' + Math.max(0, height - h / scale) + 'px 0 round ' + corner / scale + 'px)';
    layer.style.opacity = Math.max(0, Math.min(1, (p - .06) / (.42 - .06)));
    var smooth = function (v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    state.scrim.style.opacity = .16 * p;
    state.card.style.cssText += ';left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;border-radius:' + corner + 'px;opacity:' + smooth(p / (state.target ? .14 : .2)) + ';background:color-mix(in srgb,' + (capsule ? capsule.color : '#19191c') + ' ' + (100 * (1 - smooth(p / .5))) + '%,#19191c)';
    var artwork = NP.phoneUI && NP.phoneUI.artwork(layer.querySelector('.ph'));
    if (!capsule || !capsule.cover || !artwork || !artwork.node.complete || !artwork.node.naturalWidth) return;
    if (!state.cover) { state.cover = nativeSurface(state, 'ap-native-cover', (+layer.style.zIndex || 12) + 1); state.cover.src = artwork.node.currentSrc || artwork.node.src; }
    if (capsule.image !== state.hiddenImage) {
      if (state.hiddenImage) state.hiddenImage.style.opacity = state.imageOpacity;
      state.hiddenImage = capsule.image; state.imageOpacity = capsule.image.style.opacity; capsule.image.style.opacity = '0';
    }
    layer.dataset.nativeCover = 'true';
    var page = artwork.frame, art = capsule.cover;
    var target = { left: x + page.left * density * scale, top: y + page.top * density * scale, width: page.width * density * scale, height: page.height * density * scale };
    var frame = {};
    ['left', 'top', 'width', 'height'].forEach(function (key) { frame[key] = art[key] + (target[key] - art[key]) * p; state.cover.style[key] = frame[key] + 'px'; });
    var radius = capsule.corner + (page.corner * density * scale - capsule.corner) * p;
    var smoothing = capsule.cornerSmoothing + (page.cornerSmoothing - capsule.cornerSmoothing) * p;
    frame.corner = radius; frame.cornerSmoothing = smoothing; state.coverFrame = frame;
    state.cover.style.setProperty('--ph-cover-corner', radius + 'px');
    state.cover.style.setProperty('--ph-cover-smoothing', smoothing);
    state.cover.style.clipPath = NP.artworkShape.clip(frame.width, frame.height, radius, smoothing);
  }
  function nativeBack(preview, layer) {
    if (layer._nativeBackBound || layer.dataset.kind !== 'player') return;
    layer._nativeBackBound = true;
    var start, moving = false, fraction = 0;
    layer.addEventListener('pointerdown', function (event) {
      var ph = layer.querySelector('.ph'), state = layer._nativeMotion, rect = layer.parentElement.getBoundingClientRect();
      if (!state || !state.target || state.driver || ph.classList.contains('is-lyrics') || ph.classList.contains('is-sheet') || event.clientX - rect.left > rect.width * 28 / 411 || event.target.closest('button,input,canvas,.lrc-c,.lrc-l,.xslider')) return;
      start = { x: event.clientX, y: event.clientY, width: rect.width, id: event.pointerId }; moving = false; fraction = 0;
    });
    layer.addEventListener('pointermove', function (event) {
      if (!start || event.pointerId !== start.id) return;
      var dx = event.clientX - start.x;
      if (!moving && Math.abs(event.clientY - start.y) > Math.max(12, dx)) { start = null; return; }
      if (!moving && dx < 12) return;
      if (!moving) { nativeMotion(preview, layer, true, null, { preview: true }); moving = true; layer.setPointerCapture(event.pointerId); }
      event.preventDefault();
      fraction = Math.max(0, Math.min(1, dx / start.width));
      var state = layer._nativeMotion;
      state.value = 1 - fraction * .4;
      layer.style.setProperty('--ap-native-progress', state.value);
      state.draw();
    });
    function end(event) {
      if (!start || event.pointerId !== start.id) return;
      if (layer.hasPointerCapture(start.id)) layer.releasePointerCapture(start.id);
      start = null;
      if (!moving || !layer._nativeMotion.backPreview) return;
      moving = false;
      if (event.type !== 'pointercancel' && fraction >= .35) preview.closeNative(layer);
      else nativeMotion(preview, layer, true);
    }
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
  }
  function nativeMotion(preview, layer, visible, finish, options) {
    options = options || {};
    artwork(preview.host);
    var state = layer._nativeMotion;
    if (state && state.target === visible && state.driver) return state;
    if (!state) state = layer._nativeMotion = { preview: preview, layer: layer, value: visible ? 0 : 1, generation: 0 };
    var value = state.driver ? parseFloat(getComputedStyle(layer).getPropertyValue('--ap-native-progress')) : state.value;
    var velocity = 0;
    if (state.driver && state.spring) {
      var seconds = Math.max(0, (state.driver.currentTime || 0) - state.delay) / 1000;
      velocity = (nativeSpring(state.from, state.velocity, seconds + .0005) - nativeSpring(state.from, state.velocity, Math.max(0, seconds - .0005))) / .001;
    }
    var generation = ++state.generation;
    if (state.driver) state.driver.cancel();
    nativeClean(state, true);
    state.value = Number.isFinite(value) ? value : visible ? 0 : 1;
    state.target = visible; state.driver = null; state.from = state.value; state.velocity = velocity;
    state.backPreview = !!options.preview;
    state.source = layer._opener && layer._opener.closest('.ap-native-device');
    state.capsule = nativeCapsule(state);
    layer.style.setProperty('--ap-native-progress', state.value);
    function complete() {
      if (state.generation !== generation) return;
      state.value = visible ? 1 : 0;
      layer.style.setProperty('--ap-native-progress', state.value);
      var driver = state.driver; state.driver = null;
      if (driver) driver.cancel();
      nativeClean(state);
      if (finish) finish();
    }
    state.complete = complete;
    state.draw = function () { nativeDraw(state); };
    nativeBack(preview, layer);
    if (!options.preview && (reduced() || Math.abs(state.value - (visible ? 1 : 0)) < .0001)) { complete(); return state; }
    layer.dataset.nativeMorph = layer.dataset.kind;
    if (layer.dataset.kind === 'player') {
      state.scrim = nativeSurface(state, 'ap-native-scrim', (+layer.style.zIndex || 12) - 2);
      state.card = nativeSurface(state, 'ap-native-card', (+layer.style.zIndex || 12) - 1);
    }
    if (options.preview) { state.draw(); return state; }
    state.spring = visible && layer.dataset.kind === 'player';
    var duration = visible ? state.spring ? 650 : 300 : 250;
    state.delay = visible && state.value <= 0 ? 32 : 0;
    var frames = [];
    for (var i = 0; i <= 60; i++) frames.push({ offset: i / 60, '--ap-native-progress': state.spring ? nativeSpring(state.from, velocity, duration / 1000 * i / 60) : state.from + ((visible ? 1 : 0) - state.from) * i / 60 });
    frames[60]['--ap-native-progress'] = visible ? 1 : 0;
    state.driver = layer.animate(frames, { duration: duration, delay: state.delay, easing: state.spring ? 'linear' : 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
    function tick() { if (state.generation !== generation || !state.driver) return; state.draw(); state.frame = requestAnimationFrame(tick); }
    tick();
    state.driver.finished.then(complete, complete);
    return state;
  }
  function init() {
    artwork(document);
    document.addEventListener('np-app-style', function () { artwork(document); });
    var pressed;
    document.addEventListener('pointerdown', function (e) {
      if (document.documentElement.dataset.appStyle !== 'clean' || e.button > 0) return;
      var button = e.target.closest('.app-preview button,.ph button');
      if (!button || button.disabled || button.closest('.ap-nav,.hm-nav') || button.matches('[role="switch"]')) return;
      var scale = 1 - Math.min(.06, 6 / Math.max(button.offsetWidth, button.offsetHeight, 1));
      pressed = button; button.classList.add('ap-pressing');
      if (button._pressAnimation) button._pressAnimation.cancel();
      button._pressAnimation = button.animate(springFrames('scale', 1, scale, 1, 1400, 260), { duration: reduced() ? 0 : 260, fill: 'forwards' });
    }, true);
    function release() {
      if (!pressed) return;
      var button = pressed; pressed = null;
      var scale = parseFloat(getComputedStyle(button).scale) || 1;
      if (button._pressAnimation) button._pressAnimation.cancel();
      button.classList.remove('ap-pressing');
      button._pressAnimation = button.animate(springFrames('scale', scale, 1, .62, 420, 650), { duration: reduced() ? 0 : 650 });
    }
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
  }
  NP.appMotion = { init: init, scene: scene, dialog: dialog, layoutDialog: layoutDialog, swipe: swipe, native: nativeMotion, artwork: artwork, stripClone: stripClone, reduced: reduced, springFrames: springFrames };
})();
