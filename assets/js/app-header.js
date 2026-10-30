(function () {
  'use strict';
  var NP = window.NP;
  function collapsedAlpha(fraction) {
    var low = 0, high = 1, t = 0;
    for (var i = 0; i < 16; i++) {
      t = (low + high) / 2;
      var inv = 1 - t;
      var x = 2.4 * inv * inv * t + 2.4 * inv * t * t + t * t * t;
      if (x < fraction) low = t; else high = t;
    }
    return .45 * (1 - t) * t * t + t * t * t;
  }
  function update(header, scroll, title) {
    var fraction = Math.max(0, Math.min(1, scroll.scrollTop / 88));
    var smallAlpha = collapsedAlpha(fraction), largeAlpha = 1 - fraction;
    header.style.setProperty('--ah-small-alpha', smallAlpha);
    title.style.opacity = 1 - fraction;
    header.dataset.collapsed = fraction >= 1 ? 'true' : 'false';
    var mode = header._modeAction;
    if (!mode) return;
    var scene = header.parentElement, sceneBox = scene.getBoundingClientRect();
    var scale = sceneBox.width / scene.offsetWidth || 1;
    var large = title.firstElementChild.getBoundingClientRect(), small = header.querySelector('h2').getBoundingClientRect();
    var blend = smallAlpha / (largeAlpha + smallAlpha);
    var x = (large.right + (small.right - large.right) * blend - sceneBox.left) / scale + 10;
    var largeCenter = large.top + large.height / 2, smallCenter = small.top + small.height / 2;
    var y = (largeCenter + (smallCenter - largeCenter) * blend - sceneBox.top) / scale - 18;
    mode.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    mode.style.opacity = Math.max(largeAlpha, smallAlpha);
  }
  function refresh(host) {
    var scene = host.querySelector('.ap-scene');
    if (!scene) return;
    var header = scene.querySelector(':scope > .ap-header');
    var scroll = scene.querySelector(':scope > .ap-scroll');
    if (!header || !scroll || header.classList.contains('al-detail-header')) return;
    if (header.classList.contains('ah-header')) {
      var existing = scroll.querySelector(':scope > .ah-expanded-title');
      if (existing) update(header, scroll, existing);
      return;
    }
    var heading = header.querySelector('h2');
    if (!heading) return;
    var title = document.createElement('div');
    title.className = 'ah-expanded-title';
    title.setAttribute('aria-hidden', 'true');
    var text = document.createElement('span');
    text.textContent = heading.textContent;
    title.appendChild(text);
    header.classList.add('ah-header');
    scroll.classList.add('ah-scroll');
    scroll.prepend(title);
    var mode = header.querySelector('[data-ap-mode-toggle]');
    if (mode) {
      header.classList.add('ah-header--mode');
      title.classList.add('ah-expanded-title--mode');
      mode.classList.add('ah-mode-action');
      header._modeAction = mode;
      scene.appendChild(mode);
      if (document.fonts) document.fonts.ready.then(function () { if (scene.isConnected) update(header, scroll, title); });
    }
    scroll.addEventListener('scroll', function () { update(header, scroll, title); }, { passive: true });
    update(header, scroll, title);
  }
  NP.appHeader = { refresh: refresh };
})();
