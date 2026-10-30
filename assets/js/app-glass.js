(function () {
  'use strict';
  var NP = window.NP;
  var hosts = new Set();
  var navs = new WeakMap();
  var glyphs = new WeakMap();
  var keyboardNavs = new WeakSet();
  var keyboardMinis = new WeakSet();
  var filters = new Map();
  var maps = new Map();
  var activePresses = new Set();
  var handledClick;
  var defs;
  var svgNamespace = 'http://www.w3.org/2000/svg';
  var snapshots = new Map();
  var queued = false;
  var initialized = false;
  var defaults = { advanced_blur_enabled: true, liquid_glass_enabled: true, enhanced_advanced_blur_enabled: false, enhanced_advanced_blur_radius_dp: 36, advanced_blur_quality: 'default', always_use_new_tab_style:true, background_image_uri: '', background_image_blur: 0, background_image_alpha: 1 };
  var values = {};
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  // AndroidX rounded paths, Copyright 2025 The Android Open Source Project, Apache-2.0
  var rounded = {
    home:'M10 19 v-5 h4 v5 c0 .55 .45 1 1 1 h3 c.55 0 1-.45 1-1 v-7 h1.7 c.46 0 .68-.57 .33-.87 L12.67 3.6 c-.38-.34-.96-.34-1.34 0 l-8.36 7.53 c-.34 .3-.13 .87 .33 .87 H5 v7 c0 .55 .45 1 1 1 h3 c.55 0 1-.45 1-1 z',
    library:'M20 2 L8 2 c-1.1 0-2 .9-2 2 v12 c0 1.1 .9 2 2 2 h12 c1.1 0 2-.9 2-2 L22 4 c0-1.1-.9-2-2-2 z M17 7 h-2 v5.37 c0 1.27-.9 2.44-2.16 2.6 c-1.69 .23-3.11-1.25-2.8-2.95 c.2-1.1 1.18-1.95 2.3-2.02 c.63-.04 1.2 .16 1.66 .51 L14 6 c0-.55 .45-1 1-1 h2 c.55 0 1 .45 1 1 s-.45 1-1 1 z M3 6 c-.55 0-1 .45-1 1 v13 c0 1.1 .9 2 2 2 h13 c.55 0 1-.45 1-1 s-.45-1-1-1 L5 20 c-.55 0-1-.45-1-1 L4 7 c0-.55-.45-1-1-1 z',
    settings:'M19.5 12 c0-.23-.01-.45-.03-.68 l1.86-1.41 c.4-.3 .51-.86 .26-1.3 l-1.87-3.23 c-.25-.44-.79-.62-1.25-.42 l-2.15 .91 c-.37-.26-.76-.49-1.17-.68 l-.29-2.31 C14.8 2.38 14.37 2 13.87 2 h-3.73 C9.63 2 9.2 2.38 9.14 2.88 L8.85 5.19 c-.41 .19-.8 .42-1.17 .68 L5.53 4.96 c-.46-.2-1-.02-1.25 .42 L2.41 8.62 c-.25 .44-.14 .99 .26 1.3 l1.86 1.41 C4.51 11.55 4.5 11.77 4.5 12 s.01 .45 .03 .68 l-1.86 1.41 c-.4 .3-.51 .86-.26 1.3 l1.87 3.23 c.25 .44 .79 .62 1.25 .42 l2.15-.91 c.37 .26 .76 .49 1.17 .68 l.29 2.31 C9.2 21.62 9.63 22 10.13 22 h3.73 c.5 0 .93-.38 .99-.88 l.29-2.31 c.41-.19 .8-.42 1.17-.68 l2.15 .91 c.46 .2 1 .02 1.25-.42 l1.87-3.23 c.25-.44 .14-.99-.26-1.3 l-1.86-1.41 C19.49 12.45 19.5 12.23 19.5 12 z M12.04 15.5 c-1.93 0-3.5-1.57-3.5-3.5 s1.57-3.5 3.5-3.5 s3.5 1.57 3.5 3.5 S13.97 15.5 12.04 15.5 z',
    explore:'M15.5 14 h-.79 l-.28-.27 c1.2-1.4 1.82-3.31 1.48-5.34 c-.47-2.78-2.79-5-5.59-5.34 c-4.23-.52-7.79 3.04-7.27 7.27 c.34 2.8 2.56 5.12 5.34 5.59 c2.03 .34 3.94-.28 5.34-1.48 l.27 .28 v.79 l4.25 4.25 c.41 .41 1.08 .41 1.49 0 c.41-.41 .41-1.08 0-1.49 L15.5 14 z M9.5 14 C7.01 14 5 11.99 5 9.5 S7.01 5 9.5 5 S14 7.01 14 9.5 S11.99 14 9.5 14 z'
  };

  function setting(key) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
    var value = NP.previewSettings && NP.previewSettings.value ? NP.previewSettings.value(key) : defaults[key];
    return value === undefined ? defaults[key] : value;
  }
  function isClean(host) { return (host.dataset.style || host.dataset.appStyle || document.documentElement.dataset.appStyle || 'clean') === 'clean'; }
  function items(nav) { return Array.prototype.filter.call(nav.children, function (el) { return el.matches('.ap-nav-item,span'); }); }
  function selected(nav) { return items(nav).findIndex(function (el) { return el.matches('[aria-current="page"],.is-on'); }); }
  function key(nav) {
    var preview = nav.closest('[data-app-preview]');
    var phone = nav.closest('.ph');
    var native = nav.closest('.ap-native-device');
    return preview ? 'preview-' + preview.dataset.appPreview + (native ? '-native-' + native.dataset.kind : '') : phone ? phone.id : nav.dataset.glassKey;
  }
  function springFrames(from, to, damping, stiffness, duration, scale) {
    var omega = Math.sqrt(stiffness), decay = damping * omega, frequency = omega * Math.sqrt(1 - damping * damping);
    var frames = [];
    for (var i = 0; i <= 32; i++) {
      var t = duration * i / 32 / 1000;
      var value = 1 - Math.exp(-decay * t) * (Math.cos(frequency * t) + decay / frequency * Math.sin(frequency * t));
      frames.push({ transform: scale ? 'scale(' + (from + (to - from) * value) + ')' : 'translateX(' + (from + (to - from) * value) + 'px)', offset: i / 32 });
    }
    frames[32].transform = scale ? 'scale(' + to + ')' : 'translateX(' + to + 'px)';
    return frames;
  }
  function paintGlyphs(nav, state, clean) {
    var index = selected(nav);
    items(nav).forEach(function (item, i) {
      var svg = item.querySelector('svg');
      if (!svg) return;
      if (!glyphs.has(svg)) { glyphs.set(svg, svg.dataset.glassOriginal || svg.innerHTML);svg.dataset.glassOriginal = glyphs.get(svg); }
      var name = item.dataset.apNav || ['home','explore','library','settings'][i];
      var active = clean && i === index && rounded[name];
      var markup = active ? '<path data-glass-rounded="' + name + '" fill="currentColor" fill-rule="nonzero" d="' + rounded[name] + '"/>' : glyphs.get(svg);
      if (svg.innerHTML !== markup) svg.innerHTML = markup;
      if (active && state && state.glyphIndex !== index && !reduced.matches) svg.animate(springFrames(.84, 1, .7, 460, 500, true), { duration:500,easing:'linear' });
    });
    if (state) state.glyphIndex = index;
  }
  function move(state, x, animate) {
    var from = state.x;
    state.x = x;
    state.pill.style.setProperty('--ng-pill-x', x + 'px');
    if (state.animation) state.animation.cancel();
    if (animate && !reduced.matches && Number.isFinite(from) && Math.abs(from - x) > .25) {
      var frames = springFrames(from, x, .88, 380, 520).map(function (frame) { return { translate:frame.transform.slice(11,-1) + ' 0',offset:frame.offset }; });
      state.animation = state.pill.animate(frames, { duration: 520, easing: 'linear' });
    }
    snapshots.set(state.key, { x: x, index: selected(state.nav) });
  }
  function bounds(state, index) {
    var list = items(state.nav), el = list[index] || list[0];
    return el ? { x: el.offsetLeft + 2, width: el.offsetWidth - 4, center: el.offsetLeft + el.offsetWidth / 2 } : null;
  }
  function update(nav) {
    var host = nav.closest('.app-preview,.ph');
    if (!host) return;
    if (nav.matches('.hm-nav')) items(nav).forEach(function (item,index) {
      Array.prototype.slice.call(item.childNodes).forEach(function (node) {
        if (node.nodeType !== 3 || !node.textContent.trim()) return;
        var label = document.createElement('small');label.className = 'ng-label';label.textContent = node.textContent;
        item.replaceChild(label,node);
      });
      if (!item.querySelector('small')) {
        var names = [NP.L('首页','Home'),NP.L('探索','Explore'),NP.L('媒体库','Library'),NP.L('设置','Settings')];
        var label = document.createElement('small');label.className = 'ng-label';label.textContent = names[index];item.appendChild(label);
      }
    });
    items(nav).forEach(function (item) { var label = item.querySelector('small');if (label && label.textContent.trim()) item.setAttribute('aria-label',label.textContent.trim()); });
    if (nav.matches('.hm-nav') && !keyboardNavs.has(nav)) {
      keyboardNavs.add(nav);
      nav.addEventListener('keydown',function (event) {
        if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;
        var item = items(nav).find(function (el) { return el === event.target; });
        if (item) { event.preventDefault();item.click(); }
      });
    }
    if (!isClean(host)) { paintGlyphs(nav, navs.get(nav), false);return; }
    var state = navs.get(nav);
    if (!state) {
      var previous = snapshots.get(key(nav));
      nav.querySelectorAll(':scope > .ng-pill').forEach(function (el) { el.remove(); });
      var pill = document.createElement('div');
      pill.className = 'ng-pill';
      pill.setAttribute('aria-hidden', 'true');
      nav.appendChild(pill);
      nav.classList.add('ng-nav');
      state = { nav: nav, pill: pill, key:key(nav), x: previous ? previous.x : NaN, index: previous ? previous.index : selected(nav), dragging: false };
      navs.set(nav, state);
      bindNav(state);
    }
    var index = selected(nav), rect = bounds(state, index);
    if (!rect) return;
    state.pill.style.setProperty('--ng-pill-width', rect.width + 'px');
    if (!state.dragging) move(state, rect.x, index !== state.index);
    state.index = index;
    paintGlyphs(nav, state, true);
    state.pill.classList.add('is-ready');
  }
  function localX(nav, event) { var rect = nav.getBoundingClientRect();return (event.clientX - rect.left) * nav.offsetWidth / rect.width; }
  function nearest(state, x) {
    var list = items(state.nav), winner = 0, distance = Infinity;
    list.forEach(function (el, i) { var d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - x);if (d < distance) { distance = d;winner = i; } });
    return winner;
  }
  function lens(state) {
    var copy = state.pill.querySelector('.ng-lens-copy');
    if (!copy) {
      copy = document.createElement('div');
      copy.className = 'ng-lens-copy';
      copy.setAttribute('aria-hidden', 'true');
      copy.inert = true;
      var navRect = state.nav.getBoundingClientRect();
      var sx = navRect.width / state.nav.offsetWidth,sy = navRect.height / state.nav.offsetHeight;
      items(state.nav).forEach(function (item) {
        var svg = item.querySelector('svg'),label = item.querySelector('small');
        [svg,label].forEach(function (source) {
          if (!source) return;
          var rect = source.getBoundingClientRect();
          var clone = source === svg ? source.cloneNode(true) : document.createElement('div');
          clone.removeAttribute('id');
          if (source === label) { clone.className = 'ng-lens-label';clone.textContent = label.textContent;clone.style.font = getComputedStyle(label).font;clone.style.lineHeight = getComputedStyle(label).lineHeight; }
          clone.style.position = 'absolute';clone.style.left = ((rect.left - navRect.left) / sx) + 'px';clone.style.top = ((rect.top - navRect.top) / sy) + 'px';
          clone.style.width = (rect.width / sx) + 'px';clone.style.height = (rect.height / sy) + 'px';clone.style.margin = '0';clone.style.padding = '0';clone.style.transform = 'none';
          copy.appendChild(clone);
        });
      });
      state.pill.appendChild(copy);
    }
    copy.style.width = state.nav.offsetWidth + 'px';copy.style.height = state.nav.offsetHeight + 'px';
    positionLens(state,copy);
  }
  function positionLens(state,copy) {
    var x = state.nav.clientLeft + state.pill.offsetLeft + state.x;
    var y = state.nav.clientTop + state.pill.offsetTop;
    copy.style.left = -(x + state.pill.clientLeft) + 'px';copy.style.top = -(y + state.pill.clientTop) + 'px';
    copy.style.transformOrigin = (x + state.pill.offsetWidth / 2) + 'px ' + (y + state.pill.offsetHeight / 2) + 'px';
  }
  function drawPress(state, progress) {
    state.press = Math.max(0,Math.min(1,progress));
    var scale = 1 + .34 * state.press;
    state.pill.style.scale = String(scale);
    state.pill.classList.toggle('is-pressed',state.press > 0);
    var copy = state.pill.querySelector('.ng-lens-copy');
    if (copy) { positionLens(state,copy);copy.style.transform = 'scale(' + (1 + .2 * state.press) / scale + ')'; }
    var width = state.pill.offsetWidth * scale, height = state.pill.offsetHeight * scale, radius = height / 2;
    items(state.nav).forEach(function (item) {
      if (!state.press) { item.style.removeProperty('clip-path');return; }
      var x = state.x - item.offsetLeft - (width - state.pill.offsetWidth) / 2;
      var y = state.pill.offsetTop - item.offsetTop - (height - state.pill.offsetHeight) / 2;
      var path = 'M0 0H' + item.offsetWidth + 'V' + item.offsetHeight + 'H0Z M' + (x + radius) + ' ' + y + 'H' + (x + width - radius) + 'A' + radius + ' ' + radius + ' 0 0 1 ' + (x + width - radius) + ' ' + (y + height) + 'H' + (x + radius) + 'A' + radius + ' ' + radius + ' 0 0 1 ' + (x + radius) + ' ' + y + 'Z';
      item.style.clipPath = 'path(evenodd,"' + path + '")';
    });
    if (!state.press && copy) copy.remove();
  }
  function press(state, value) {
    cancelAnimationFrame(state.pressFrame);
    var from = state.press || 0,target = value ? 1 : 0;
    if (reduced.matches) { drawPress(state,target);return; }
    var start = performance.now(),duration = value ? 360 : 500,damping = value ? 1 : .82,omega = Math.sqrt(value ? 1000 : 420);
    function frame(now) {
      if (!state.nav.isConnected || state.nav.closest('[data-covered="true"]')) { drawPress(state,0);return; }
      var t = (now - start) / 1000,decay = Math.exp(-damping * omega * t);
      var position = damping === 1 ? 1 - (1 + omega * t) * decay : 1 - decay * (Math.cos(omega * Math.sqrt(1 - damping * damping) * t) + damping / Math.sqrt(1 - damping * damping) * Math.sin(omega * Math.sqrt(1 - damping * damping) * t));
      drawPress(state,now - start >= duration ? target : from + (target - from) * position);
      if (now - start < duration) state.pressFrame = requestAnimationFrame(frame);
    }
    state.pressFrame = requestAnimationFrame(frame);
  }
  function bindNav(state) {
    var nav = state.nav;
    nav.addEventListener('pointerdown', function (event) {
      if (nav.closest('[data-demo-locked],[data-demo-navigation-locked]')) return;
      if (!isClean(nav.closest('.app-preview,.ph')) || event.button !== 0 || event.isPrimary === false) return;
      if (state.animation) { var current = parseFloat(getComputedStyle(state.pill).translate) || 0;state.animation.cancel();state.x = current;state.pill.style.setProperty('--ng-pill-x',current + 'px'); }
      state.start = localX(nav, event);state.pointer = event.pointerId;state.dragging = false;
      activePresses.add(state);
      nav.setPointerCapture(event.pointerId);
      lens(state);
      press(state, true);
    });
    nav.addEventListener('pointermove', function (event) {
      if (state.pointer !== event.pointerId) return;
      var x = localX(nav, event), list = items(nav);
      if (!state.dragging && Math.abs(x - state.start) < 8) return;
      state.dragging = true;nav.classList.add('ng-dragging');
      if (!nav.hasPointerCapture(event.pointerId)) nav.setPointerCapture(event.pointerId);
      var first = bounds(state, 0).center,last = bounds(state, list.length - 1).center,limit = nav.clientWidth * .06;
      var edge = x < first ? first : last,over = x < first || x > last;
      if (over) { var excess = x - edge;x = edge + Math.sign(excess) * limit * (1 - 1 / (Math.abs(excess) / limit + 1)); }
      move(state, x - state.pill.offsetWidth / 2, false);
      lens(state);
      drawPress(state,state.press || 0);
      event.preventDefault();
    });
    function finish(event, cancelled) {
      if (state.pointer !== event.pointerId) return;
      state.pointer = null;
      activePresses.delete(state);
      state.dragging = false;nav.classList.remove('ng-dragging');press(state, false);
      if (nav.hasPointerCapture(event.pointerId)) nav.releasePointerCapture(event.pointerId);
      if (!cancelled) {
        var item = items(nav)[nearest(state, localX(nav, event))];
        if (item) {
          handledClick = { x:event.clientX,y:event.clientY,time:performance.now(),owner:nav.closest('.device,.preview-device') };
          state.skipClick = true;item.click();
        }
      }
      if (!nav.isConnected || nav.closest('[data-covered="true"]')) { cancelAnimationFrame(state.pressFrame);drawPress(state,0);return; }
      update(nav);
    }
    state.finish = finish;
    nav.addEventListener('pointerup', function (event) { finish(event, false); });
    nav.addEventListener('pointercancel', function (event) { finish(event, true); });
    nav.addEventListener('lostpointercapture',function (event) { finish(event,true); });
    nav.addEventListener('click', function (event) { if (state.skipClick && event.isTrusted && event.detail > 0) { state.skipClick = false;event.preventDefault();event.stopImmediatePropagation(); } }, true);
  }
  function svgElement(name, attrs) {
    var el = document.createElementNS(svgNamespace, name);
    Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    return el;
  }
  function roundedDistance(x, y, width, height, radii) {
    var r = y < height / 2 ? (x < width / 2 ? radii[0] : radii[1]) : (x < width / 2 ? radii[3] : radii[2]);
    r = Math.max(0, Math.min(r, width / 2, height / 2));
    var qx = Math.abs(x - width / 2) - width / 2 + r;
    var qy = Math.abs(y - height / 2) - height / 2 + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  function lensMaps(width, height, radii) {
    var signature = [width,height].concat(radii).join(':');
    if (maps.has(signature)) return maps.get(signature);
    var canvas = document.createElement('canvas');canvas.width = width;canvas.height = height;
    var context = canvas.getContext('2d');
    var displacement = context.createImageData(width, height),rim = context.createImageData(width, height);
    // AGSL advanced_glass_region_mask: refraction .42, edge band 14dp, rim 1.6dp/.16
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
      var px = x + .5,py = y + .5,index = (y * width + x) * 4;
      var distance = roundedDistance(px,py,width,height,radii);
      var dx = roundedDistance(px + 1,py,width,height,radii) - roundedDistance(px - 1,py,width,height,radii);
      var dy = roundedDistance(px,py + 1,width,height,radii) - roundedDistance(px,py - 1,width,height,radii);
      var length = Math.hypot(dx,dy);
      var nx = length > .0001 ? dx / length : 0,ny = length > .0001 ? dy / length : 0;
      var edge = 1 - Math.max(0, Math.min(1, -distance / 14));edge *= edge;
      displacement.data[index] = Math.round((.5 - nx * edge / 2) * 255);
      displacement.data[index + 1] = Math.round((.5 - ny * edge / 2) * 255);
      displacement.data[index + 2] = 128;displacement.data[index + 3] = 255;
      var rimDepth = 1 - Math.max(0,Math.min(1,-distance / 1.6));
      var light = .55 + .45 * Math.max(-1,Math.min(1,nx * -.5 + ny * -.86));
      rim.data[index] = 255;rim.data[index + 1] = 255;rim.data[index + 2] = 255;
      rim.data[index + 3] = Math.round(rimDepth * rimDepth * .16 * light * 255);
    }
    context.putImageData(displacement,0,0);var map = canvas.toDataURL();
    context.putImageData(rim,0,0);var result = { displacement:map,rim:canvas.toDataURL() };
    if (maps.size >= 24) maps.delete(maps.keys().next().value);
    maps.set(signature,result);
    return result;
  }
  function applyLensFilter(bar, host, radius) {
    if (host.dataset.glassLiquid !== 'on' || host.dataset.glassBlur !== 'on' || !CSS.supports('backdrop-filter','url("#ng-glass-support")')) {
      bar.style.removeProperty('--ng-filter');return;
    }
    var width = Math.round(bar.clientWidth),height = Math.round(bar.clientHeight);
    if (!width || !height) return;
    var style = getComputedStyle(bar);
    var radii = [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(function (v) { return parseFloat(v) || 0; });
    var filterKey = key(bar) + (bar.matches('.ap-mini,.hm-mini') ? '-mini' : '-nav');
    var signature = [width,height,radius].concat(radii).join(':');
    var entry = filters.get(filterKey);
    if (!defs) {
      var svg = svgElement('svg',{ width:0,height:0,'aria-hidden':'true',focusable:'false' });
      svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
      defs = svgElement('defs');svg.appendChild(defs);document.body.appendChild(svg);
    }
    if (!entry) {
      var id = 'ng-glass-' + filters.size;
      var filter = svgElement('filter',{ id:id,filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse','color-interpolation-filters':'sRGB' });
      defs.appendChild(filter);entry = { id:id,el:filter };filters.set(filterKey,entry);
    }
    if (entry.signature !== signature) {
      var textures = lensMaps(width,height,radii),pad = radius * 3;
      entry.el.setAttribute('x',-pad);entry.el.setAttribute('y',-pad);entry.el.setAttribute('width',width + pad * 2);entry.el.setAttribute('height',height + pad * 2);
      entry.el.replaceChildren(
        svgElement('feGaussianBlur',{ in:'SourceGraphic',stdDeviation:radius,edgeMode:'duplicate',result:'blurred' }),
        svgElement('feImage',{ href:textures.displacement,x:0,y:0,width:width,height:height,preserveAspectRatio:'none',result:'displacement' }),
        svgElement('feDisplacementMap',{ in:'blurred',in2:'displacement',scale:11.76,xChannelSelector:'R',yChannelSelector:'G',result:'refracted' }),
        svgElement('feColorMatrix',{ in:'refracted',type:'saturate',values:1.12,result:'saturated' }),
        svgElement('feImage',{ href:textures.rim,x:0,y:0,width:width,height:height,preserveAspectRatio:'none',result:'rim' }),
        svgElement('feComposite',{ in:'saturated',in2:'rim',operator:'arithmetic',k1:0,k2:1,k3:1,k4:0 })
      );
      entry.signature = signature;
    }
    bar.style.setProperty('--ng-filter','url("#' + entry.id + '")');
    bar.dataset.glassFilter = entry.id;
  }
  function refresh(root) {
    var scope = root || document;
    var found = [];
    if (scope.matches && scope.matches('.app-preview:not(.at-snapshot),.ph--home,.ph--fx')) found.push(scope);
    scope.querySelectorAll('.app-preview:not(.at-snapshot),.ph--home,.ph--fx').forEach(function (host) { found.push(host); });
    found.forEach(function (host) {
      if (!host.classList.contains('np-glass-host')) host.classList.add('np-glass-host');
      hosts.add(host);
      host.dataset.glassBlur = setting('advanced_blur_enabled') === false ? 'off' : 'on';
      var quality = setting('advanced_blur_quality');
      host.dataset.glassLiquid = isClean(host) && setting('liquid_glass_enabled') !== false && quality !== 'low' && quality !== 'ultra_low' ? 'on' : 'off';
      host.dataset.glassEnhanced = setting('enhanced_advanced_blur_enabled') ? 'on' : 'off';
      var radius = Number(setting('enhanced_advanced_blur_radius_dp'));
      if (!Number.isFinite(radius)) radius = 36;
      radius = Math.round(Math.max(12, Math.min(64, radius)) / 4) * 4;
      host.style.setProperty('--ng-radius', radius + 'px');
      var background = setting('background_image_uri');
      host.dataset.glassBackground = background ? 'on' : 'off';
      host.dataset.glassNewTabs = setting('always_use_new_tab_style') || background ? 'on' : 'off';
      host.style.setProperty('--ng-background-image', background ? 'url(' + JSON.stringify(background) + ')' : 'none');
      host.style.setProperty('--ng-background-blur', Math.max(0, Math.min(25, Number(setting('background_image_blur')) || 0)) + 'px');
      host.style.setProperty('--ng-background-alpha', Math.max(.1, Math.min(1, Number(setting('background_image_alpha')) || 1)));
      host.querySelectorAll('.ap-nav,.hm-nav').forEach(update);
      host.querySelectorAll('.ap-mini,.hm-mini,.ap-nav,.hm-nav').forEach(function (bar) {
        applyLensFilter(bar,host,radius);
        if (bar.matches('.hm-mini') && !keyboardMinis.has(bar)) {
          keyboardMinis.add(bar);
          bar.addEventListener('keydown',function (event) { if (!event.defaultPrevented && event.target === bar && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault();bar.click(); } });
        }
      });
    });
    hosts.forEach(function (host) { if (!host.isConnected) hosts.delete(host); });
  }
  function schedule() { if (!queued) { queued = true;requestAnimationFrame(function () { queued = false;refresh(); }); } }
  function init() {
    if (initialized) return;initialized = true;refresh();
    document.addEventListener('np-app-style', schedule);
    document.addEventListener('np-preview-setting', function (event) { if (event.detail && event.detail.key in defaults) values[event.detail.key] = event.detail.value;schedule(); });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pointerdown',function () { handledClick = null; },true);
    window.addEventListener('click',function (event) {
      if (!handledClick || !event.isTrusted || event.detail === 0) return;
      var match = performance.now() - handledClick.time < 500 && Math.hypot(event.clientX - handledClick.x,event.clientY - handledClick.y) < 8 && handledClick.owner && handledClick.owner.contains(event.target);
      handledClick = null;
      if (match) { event.preventDefault();event.stopImmediatePropagation(); }
    },true);
    document.addEventListener('pointerup',function (event) { activePresses.forEach(function (state) { state.finish(event,false); }); },true);
    document.addEventListener('pointercancel',function (event) { activePresses.forEach(function (state) { state.finish(event,true); }); },true);
    window.addEventListener('blur',function () { activePresses.forEach(function (state) { state.finish({ pointerId:state.pointer },true); }); });
    var observer = new MutationObserver(function (records) {
      if (records.some(function (record) {
        if (record.type === 'attributes') return record.target.matches('.app-preview,.ap-nav-item,.hm-nav>span');
        return Array.prototype.some.call(record.addedNodes, function (node) { return node.nodeType === 1 && (node.matches('.app-preview,.ap-nav,.hm-nav,.ap-scene') || node.querySelector('.app-preview,.ap-nav,.hm-nav')); });
      })) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current', 'data-style', 'data-mode', 'data-ui-scale', 'class'] });
  }
  NP.appGlass = { init: init, refresh: refresh };
})();
