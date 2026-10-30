/* theme hand-off follows ThemeRevealOverlay and SettingsCommon at Android 1eedfed6c */
/* AndroidX Material icons, Copyright The Android Open Source Project, Apache-2.0 */
(function () {
  'use strict';
  var NP = window.NP;
  var active = null;
  var sequence = 0;
  var moonPath = 'M9.37,5.51 C9.19,6.15,9.1,6.82,9.1,7.5 c0.0,4.08,3.32,7.4,7.4,7.4 c0.68,0.0,1.35,-0.09,1.99,-0.27 C17.45,17.19,14.93,19.0,12.0,19.0 c-3.86,0.0,-7.0,-3.14,-7.0,-7.0 C5.0,9.07,6.81,6.55,9.37,5.51 Z M12.0,3.0 c-4.97,0.0,-9.0,4.03,-9.0,9.0 s4.03,9.0,9.0,9.0 s9.0,-4.03,9.0,-9.0 c0.0,-0.46,-0.04,-0.92,-0.1,-1.36 c-0.98,1.37,-2.58,2.26,-4.4,2.26 c-2.98,0.0,-5.4,-2.42,-5.4,-5.4 c0.0,-1.81,0.89,-3.42,2.26,-4.4 C12.92,3.04,12.46,3.0,12.0,3.0 L12.0,3.0 Z';
  var sunPath = 'M12.0,9.0 c1.65,0.0,3.0,1.35,3.0,3.0 s-1.35,3.0,-3.0,3.0 s-3.0,-1.35,-3.0,-3.0 S10.35,9.0,12.0,9.0 M12.0,7.0 c-2.76,0.0,-5.0,2.24,-5.0,5.0 s2.24,5.0,5.0,5.0 s5.0,-2.24,5.0,-5.0 S14.76,7.0,12.0,7.0 L12.0,7.0 Z M2.0,13.0 l2.0,0.0 c0.55,0.0,1.0,-0.45,1.0,-1.0 s-0.45,-1.0,-1.0,-1.0 l-2.0,0.0 c-0.55,0.0,-1.0,0.45,-1.0,1.0 S1.45,13.0,2.0,13.0 Z M20.0,13.0 l2.0,0.0 c0.55,0.0,1.0,-0.45,1.0,-1.0 s-0.45,-1.0,-1.0,-1.0 l-2.0,0.0 c-0.55,0.0,-1.0,0.45,-1.0,1.0 S19.45,13.0,20.0,13.0 Z M11.0,2.0 v2.0 c0.0,0.55,0.45,1.0,1.0,1.0 s1.0,-0.45,1.0,-1.0 V2.0 c0.0,-0.55,-0.45,-1.0,-1.0,-1.0 S11.0,1.45,11.0,2.0 Z M11.0,20.0 v2.0 c0.0,0.55,0.45,1.0,1.0,1.0 s1.0,-0.45,1.0,-1.0 v-2.0 c0.0,-0.55,-0.45,-1.0,-1.0,-1.0 C11.45,19.0,11.0,19.45,11.0,20.0 Z M5.99,4.58 c-0.39,-0.39,-1.03,-0.39,-1.41,0.0 c-0.39,0.39,-0.39,1.03,0.0,1.41 l1.06,1.06 c0.39,0.39,1.03,0.39,1.41,0.0 s0.39,-1.03,0.0,-1.41 L5.99,4.58 Z M18.36,16.95 c-0.39,-0.39,-1.03,-0.39,-1.41,0.0 c-0.39,0.39,-0.39,1.03,0.0,1.41 l1.06,1.06 c0.39,0.39,1.03,0.39,1.41,0.0 c0.39,-0.39,0.39,-1.03,0.0,-1.41 L18.36,16.95 Z M19.42,5.99 c0.39,-0.39,0.39,-1.03,0.0,-1.41 c-0.39,-0.39,-1.03,-0.39,-1.41,0.0 l-1.06,1.06 c-0.39,0.39,-0.39,1.03,0.0,1.41 s1.03,0.39,1.41,0.0 L19.42,5.99 Z M7.05,18.36 c0.39,-0.39,0.39,-1.03,0.0,-1.41 c-0.39,-0.39,-1.03,-0.39,-1.41,0.0 l-1.06,1.06 c-0.39,0.39,-0.39,1.03,0.0,1.41 s1.03,0.39,1.41,0.0 L7.05,18.36 Z';
  var iconEasing = 'cubic-bezier(.4,0,.2,1)';
  function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function screen(host) { return host.querySelector(':scope > .app-preview'); }
  function decorate(host) {
    var root = screen(host);
    if (!root) return;
    root.querySelectorAll('[data-ap-mode-toggle]').forEach(function (button) {
      if (button.querySelector('[data-at-icon]')) return;
      button.classList.add('at-mode-button');
      button.innerHTML = '<span class="at-icon" data-at-icon="moon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="' + moonPath + '"/></svg></span><span class="at-icon" data-at-icon="sun" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="' + sunPath + '"/></svg></span>';
      var progress = root.dataset.mode === 'dark' ? 1 : 0;
      button.querySelector('[data-at-icon="moon"]').style.cssText = 'opacity:' + (1 - progress) + ';transform:rotate(' + (-56 * progress) + 'deg) scale(' + (1 - .44 * progress) + ')';
      button.querySelector('[data-at-icon="sun"]').style.cssText = 'opacity:' + progress + ';transform:rotate(' + (56 * (1 - progress)) + 'deg) scale(' + (.56 + .44 * progress) + ')';
    });
  }
  function capture(root) {
    var clone = root.cloneNode(true);
    var originals = [root].concat(Array.from(root.querySelectorAll('*')));
    var copies = [clone].concat(Array.from(clone.querySelectorAll('*')));
    var scrolls = [];
    originals.forEach(function (original, index) {
      var copy = copies[index], css = getComputedStyle(original);
      ['color','backgroundColor','backgroundImage','borderColor','borderRadius','boxShadow','textShadow','opacity','filter','backdropFilter','transform','fill','stroke'].forEach(function (name) { copy.style[name] = css[name]; });
      if (index === 0) Array.from(css).filter(function (name) { return name.indexOf('--') === 0; }).forEach(function (name) { copy.style.setProperty(name, css.getPropertyValue(name)); });
      if (original.tagName === 'CANVAS') { try { copy.getContext('2d').drawImage(original, 0, 0); } catch (_) {} }
      if ('value' in original && original.tagName !== 'LI') copy.value = original.value;
      if ('checked' in original) copy.checked = original.checked;
      if (original.scrollTop || original.scrollLeft) scrolls.push({ node: copy, top: original.scrollTop, left: original.scrollLeft });
      Array.from(copy.attributes).forEach(function (attribute) {
        if (/^(id$|name$|data-)/.test(attribute.name) && !(index === 0 && /^(data-mode|data-style|data-ui-scale)$/.test(attribute.name))) copy.removeAttribute(attribute.name);
      });
    });
    clone.inert = true;
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-ap-theme-reveal', '');
    clone.classList.add('at-snapshot');
    return { layer: clone, scrolls: scrolls };
  }
  function close(token, interrupted) {
    if (!token || token.closed) return;
    token.closed = true;
    cancelAnimationFrame(token.frame);
    clearTimeout(token.watchdog);
    if (token.resize) token.resize.disconnect();
    if (token.mutation) token.mutation.disconnect();
    if (token.layer) token.layer.remove();
    if (interrupted) (token.icons || []).forEach(function (animation) { animation.cancel(); });
    token.host.removeAttribute('data-at-switching');
    if (active === token) active = null;
  }
  function begin(host, buttonOrOrigin, nextMode) {
    if (active) return false;
    var root = screen(host);
    if (!root || !host.isConnected || root.dataset.mode === nextMode) return false;
    decorate(host);
    var box = root.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    var button = buttonOrOrigin && buttonOrOrigin.getBoundingClientRect ? buttonOrOrigin : null;
    var buttonBox = button ? button.getBoundingClientRect() : null;
    var origin = buttonBox ? { x: buttonBox.left + buttonBox.width / 2, y: buttonBox.top + buttonBox.height / 2, radius: Math.max(buttonBox.width, buttonBox.height) / 2 } : buttonOrOrigin || { x: box.left, y: box.top, radius: 1 };
    var width = root.offsetWidth, height = root.offsetHeight;
    var x = (origin.x - box.left) * width / box.width;
    var y = (origin.y - box.top) * height / box.height;
    var max = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y), 1);
    var sun = button && button.querySelector('[data-at-icon="sun"]');
    var token = { id: ++sequence, host: host, mode: nextMode, reverse: nextMode === 'light', x: x, y: y, max: max, initial: Math.min(max, Math.max(1, (origin.radius || 1) * width / box.width)), width: box.width, height: box.height, iconFrom: sun ? Number(getComputedStyle(sun).opacity) : root.dataset.mode === 'dark' ? 1 : 0, background: button ? getComputedStyle(button).backgroundColor : null, focus: button === document.activeElement, reduced: reduced(), closed: false, frame: 0 };
    if (!token.reduced) {
      var snapshot = capture(root);
      token.layer = snapshot.layer;
      token.scrolls = snapshot.scrolls;
      token.layer.dataset.reverse = String(token.reverse);
      token.layer.style.setProperty('--at-x', x + 'px');
      token.layer.style.setProperty('--at-y', y + 'px');
      host.setAttribute('data-at-switching', '');
    }
    active = token;
    token.watchdog = setTimeout(function () { close(token, true); }, 4000);
    return token;
  }
  function cubic(x1, y1, x2, y2, fraction) {
    var low = 0, high = 1, t = fraction;
    for (var i = 0; i < 18; i++) {
      var inv = 1 - t;
      var x = 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
      if (x < fraction) low = t; else high = t;
      t = (low + high) / 2;
    }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  }
  function paint(token, progress) {
    var radius = token.reverse ? token.max * (1 - progress) : token.initial + (token.max - token.initial) * progress;
    token.layer.style.setProperty('--at-radius', radius);
    token.layer.style.opacity = token.reverse ? Math.min(1, (1 - progress) / .12) : 1;
  }
  function animateButton(token) {
    var root = screen(token.host), button = root && root.querySelector('[data-ap-mode-toggle]');
    if (!button) return;
    if (token.focus) button.focus({ preventScroll: true });
    if (token.reduced) return;
    var from = token.iconFrom, to = token.mode === 'dark' ? 1 : 0;
    token.icons = Array.from(button.querySelectorAll('[data-at-icon]')).map(function (icon) {
      var sun = icon.dataset.atIcon === 'sun';
      return icon.animate([from, to].map(function (p) { return { opacity: sun ? p : 1 - p, transform: 'rotate(' + (sun ? 56 * (1 - p) : -56 * p) + 'deg) scale(' + (sun ? .56 + .44 * p : 1 - .44 * p) + ')' }; }), { duration: 620, easing: iconEasing });
    });
    if (token.background) token.icons.push(button.animate([{ backgroundColor: token.background }, { backgroundColor: getComputedStyle(button).backgroundColor }], { duration: 420, easing: iconEasing }));
  }
  function finish(token) {
    if (!token || token !== active || token.closed) return;
    if (!screen(token.host) || !token.host.isConnected || screen(token.host).dataset.mode !== token.mode) { close(token, true); return; }
    decorate(token.host);
    animateButton(token);
    if (token.reduced) { close(token, false); return; }
    token.host.appendChild(token.layer);
    token.scrolls.forEach(function (scroll) { scroll.node.scrollTop = scroll.top; scroll.node.scrollLeft = scroll.left; });
    paint(token, 0);
    var duration = token.reverse ? 560 : 640;
    var elapsed = 0, last = null;
    function frame(now) {
      if (token.closed) return;
      if (!token.host.isConnected || !token.layer.isConnected) { close(token, true); return; }
      if (last !== null) elapsed += Math.max(0, Math.min(40, now - last));
      last = now;
      var fraction = Math.min(1, elapsed / duration);
      paint(token, token.reverse ? cubic(.55, 0, .3, 1, fraction) : cubic(.45, 0, .15, 1, fraction));
      if (fraction === 1) close(token, false); else token.frame = requestAnimationFrame(frame);
    }
    token.frame = requestAnimationFrame(frame);
    token.resize = new ResizeObserver(function () {
      var root = screen(token.host), box = root && root.getBoundingClientRect();
      if (!box || Math.abs(box.width - token.width) > .5 || Math.abs(box.height - token.height) > .5) close(token, true);
    });
    token.resize.observe(token.host);
    token.mutation = new MutationObserver(function () { if (!token.host.isConnected || !token.layer.isConnected) close(token, true); });
    token.mutation.observe(token.host, { childList: true });
  }
  function cancel(host) { if (active && (!host || active.host === host)) close(active, true); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) cancel(); });
  window.addEventListener('pagehide', function () { cancel(); });
  window.addEventListener('resize', function () { cancel(); });
  NP.appThemeTransition = { begin: begin, finish: finish, cancel: cancel, decorate: decorate };
}());
