/* NeriPlayer site · motion —— 进入视口的编排、标题逐字升起、手写批注、滚动视差、截图条横移、主题拉绳 */
(function () {
  'use strict';

  var NP = window.NP;
  var M = NP.math;
  var $ = NP.$;
  var $$ = NP.$$;
  var reduced = NP.env.reduced;

  /* ---------- 文字拆分 ---------- */
  var PUNCT = /^[，。、；：！？）」』》〉】,.;:!?)\]…·]$/;
  function splitText(root) {
    var idx = 0;
    function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (n) {
        if (n.nodeType === 3) {
          var text = n.data;
          if (!text.trim()) return;
          var frag = document.createDocumentFragment();
          // 中日文按字、拉丁文按词；标点黏在前一个字上，避免行首出现标点
          var tokens = text.match(/[\u3000-\u9fff\uff00-\uffef]|[^\s\u3000-\u9fff\uff00-\uffef]+|\s+/g) || [];
          var last = null;
          tokens.forEach(function (tk) {
            if (/^\s+$/.test(tk)) { frag.appendChild(document.createTextNode(tk)); last = null; return; }
            if (last && PUNCT.test(tk)) { last.firstChild.textContent += tk; return; }
            var sw = document.createElement('span');
            sw.className = 'sw';
            var inner = document.createElement('span');
            inner.textContent = tk;
            sw.appendChild(inner);
            sw.style.setProperty('--i', idx++);
            frag.appendChild(sw);
            last = sw;
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          if (n.classList.contains('ul')) { n.style.setProperty('--i', idx++); return; }
          if (n.tagName === 'BR' || n.tagName === 'svg' || n.tagName === 'SVG') return;
          walk(n);
        }
      });
    }
    if (!root.hasAttribute('aria-label')) root.setAttribute('aria-label', root.textContent.replace(/\s+/g, ' ').trim());
    walk(root);
    return idx;
  }

  /* ---------- 眉标乱码 ---------- */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function scramble(el) {
    var nodes = [];
    (function collect(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3 && /[A-Za-z]/.test(c.data)) nodes.push({ n: c, text: c.data });
        else if (c.nodeType === 1 && c.tagName !== 'B') collect(c);
      });
    })(el);
    if (!nodes.length) return;
    var start = performance.now();
    var dur = 900;
    (function tick(now) {
      var p = M.clamp((now - start) / dur);
      nodes.forEach(function (o) {
        var t = o.text;
        var keep = Math.floor(t.length * M.ease.out(p));
        var s = t.slice(0, keep);
        for (var i = keep; i < t.length; i++) s += /[A-Za-z]/.test(t[i]) ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : t[i];
        o.n.data = s;
      });
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  /* ---------- 平滑换字 ---------- */
  NP.swapText = function (el, text) {
    if (!el || el.textContent === text) return;
    if (reduced) { el.textContent = text; return; }
    el.classList.add('swap-text', 'is-out');
    clearTimeout(el._swap);
    el._swap = setTimeout(function () {
      el.textContent = text;
      el.classList.remove('is-out');
    }, 220);
  };

  /* ---------- 编排：给元素挂上动效角色 ---------- */
  function setIndex(parent) {
    Array.prototype.forEach.call(parent.children, function (c, i) { c.style.setProperty('--i', i); });
  }
  var decorationGroups = [];
  var decorationPlanned = false;
  function decorationRoot(el) { return el.closest('section, footer') || el; }
  function planDecoration(el, apply) {
    var root = decorationRoot(el);
    var group = decorationGroups.filter(function (item) { return item.root === root; })[0];
    if (!group) { group = { root: root, jobs: [], prepared: false }; decorationGroups.push(group); }
    group.jobs.push(apply);
  }
  function prepareDecoration(group) {
    if (group.prepared) return;
    group.prepared = true;
    group.jobs.forEach(function (apply) { apply(); });
    group.jobs = [];
  }
  function decorate() {
    if (decorationPlanned) return;
    decorationPlanned = true;
    $$('.h2, .footer__motto').forEach(function (h) {
      planDecoration(h, function () {
        h.removeAttribute('data-reveal');
        h.setAttribute('data-split', '');
        splitText(h);
      });
    });
    $$('.display__line').forEach(function (line, i) {
      var inner = document.createElement('span');
      inner.className = 'dl-in';
      while (line.firstChild) inner.appendChild(line.firstChild);
      line.appendChild(inner);
      inner.style.setProperty('--i', i);
    });
    $$('.sheet[data-reveal], .card[data-reveal], .note-card[data-reveal], .ticket[data-reveal]').forEach(function (el) { planDecoration(el, function () { el.setAttribute('data-reveal', 'sheet'); }); });
    $$('.tiles').forEach(function (t) {
      planDecoration(t, function () {
        $$('[data-reveal]', t).forEach(function (li) { li.removeAttribute('data-reveal'); });
        t.setAttribute('data-stagger', 'pop');
        setIndex(t);
      });
    });
    $$('.chain__nodes, .crayons').forEach(function (t) { planDecoration(t, function () { t.setAttribute('data-stagger', 'pop'); setIndex(t); }); });
    $$('.notes, .checklist, .stor-legend, .flow__steps, .ticket__info, .tree, .shortcut__menu, .dash__menu, .matrix tbody, .abi tbody, .changes, .split-demo__out, .palette, .footer__cols').forEach(function (t) {
      planDecoration(t, function () {
        if (t.closest('[data-stagger]') && t.closest('[data-stagger]') !== t) return;
        t.setAttribute('data-stagger', t.matches('.split-demo__out, .palette') ? 'pop' : '');
        setIndex(t);
      });
    });
    $$('.sec-stats').forEach(function (s) { planDecoration(s, function () { s.removeAttribute('data-reveal'); s.setAttribute('data-stagger', 'x'); s.style.setProperty('--base', '380ms'); setIndex(s); }); });
    $$('.stamp').forEach(function (s) { planDecoration(s, function () { s.setAttribute('data-stamp', ''); }); });
    $$('.hand--note, .hero__note, .shots__note, .sketch__a, .flow__note, .syncmap__note, .stats__label, .widgets__note, .tabstage__note, .cutline .hand, .footer__brand .hand, .tree em, .ruby-fig__label').forEach(function (h, i) {
      planDecoration(h, function () {
        h.setAttribute('data-write', '');
        h.style.setProperty('--wd', (i % 3) * 120);
      });
    });
    decorationGroups.forEach(function (group) { if (group.root.classList.contains('hero')) prepareDecoration(group); });
  }

  /* ---------- 进入视口 ---------- */
  function observe(heroOnly) {
    var selector = '[data-reveal], [data-stagger], [data-split], [data-write], [data-stamp], .eyebrow, .draw, .ul';
    function included(el) { return !!el.closest('.hero') === !!heroOnly; }
    if (!('IntersectionObserver' in window) || reduced) {
      decorationGroups.filter(function (group) { return included(group.root); }).forEach(prepareDecoration);
      if (heroOnly) $$('.hero').forEach(function (root) { $$(selector, root).forEach(function (el) { el.classList.add('is-in'); }); });
      else $$(selector).filter(included).forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add('is-in');
        if (el.classList.contains('eyebrow')) scramble(el);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
    function register(root) {
      if (root.matches(selector)) io.observe(root);
      $$(selector, root).forEach(function (el) { io.observe(el); });
    }
    if (heroOnly) { $$('.hero').forEach(register); return; }
    var near = new IntersectionObserver(function (entries) {
      var prepared = [];
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var group = decorationGroups.filter(function (item) { return item.root === entry.target; })[0];
        if (!group || group.prepared) return;
        prepareDecoration(group);
        prepared.push(group);
        near.unobserve(group.root);
      });
      if (!prepared.length) return;
      // 跳到远处时也先绘制拆分后的初始状态，下一帧再触发原来的入场过渡
      requestAnimationFrame(function () { setTimeout(function () {
        prepared.forEach(function (group) { register(group.root); });
        queueMeasure();
      }, 0); });
    }, { rootMargin: '1200px 0px' });
    decorationGroups.forEach(function (group) {
      if (!included(group.root)) return;
      if (group.prepared) register(group.root);
      else near.observe(group.root);
    });
    $$(selector).forEach(function (el) {
      if (!included(el)) return;
      if (!decorationGroups.some(function (group) { return group.root === decorationRoot(el); })) io.observe(el);
    });
  }

  /* ---------- 滚动联动 ---------- */
  var vh = 0;
  var hero = null;
  var parallax = [];
  var shots = null;
  var tilts = [];
  var srcProg = null;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var scrollReady = false;
  var measureQueued = false;
  function queueMeasure() {
    if (!scrollReady || measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(function () { setTimeout(function () {
      measureQueued = false;
      measure();
      lastY = -1;
    }, 0); });
  }

  function measure() {
    parallax.forEach(function (p) { p.el.style.translate = ''; });
    vh = window.innerHeight;
    var sy = window.scrollY;
    if (hero) {
      var r = hero.el.getBoundingClientRect();
      hero.top = r.top + sy;
      hero.h = r.height;
    }
    parallax.forEach(function (p) {
      var r = p.el.getBoundingClientRect();
      p.top = r.top + sy;
      p.h = r.height;
    });
    tilts.forEach(function (t) {
      var r = t.el.getBoundingClientRect();
      t.top = r.top + sy - (t.lastY || 0);
      t.h = r.height;
    });
    if (srcProg) {
      var rs = srcProg.sheets.getBoundingClientRect();
      srcProg.top = rs.top + sy;
      srcProg.h = rs.height;
    }
    if (shots) layoutShots();
  }

  function layoutShots() {
    var s = shots;
    var pin = NP.vp.w > 980 && !NP.env.coarse && !reduced;
    s.el.classList.toggle('is-pinned', pin);
    s.pinned = pin;
    if (!pin) {
      s.el.style.height = '';
      s.strip.style.transform = '';
      if (s.route) s.route.classList.remove('is-tucked');
      return;
    }
    s.strip.style.transform = '';
    s.dist = Math.max(0, s.strip.scrollWidth - document.documentElement.clientWidth);
    s.el.style.height = Math.round(vh + s.dist + vh * 0.25) + 'px';
    var r = s.el.getBoundingClientRect();
    s.top = r.top + window.scrollY;
    s.h = r.height;
    s.items.forEach(function (it) { it.x = it.el.offsetLeft + it.el.offsetWidth / 2; });
  }

  var lastY = -1;
  var lastPX = 0;
  var lastPY = 0;
  function frame(dt) {
    var sy = NP.scroll.y;
    pointer.x = M.damp(pointer.x, pointer.tx, 4.5, dt);
    pointer.y = M.damp(pointer.y, pointer.ty, 4.5, dt);
    var pointerMoved = Math.abs(pointer.x - lastPX) > 0.001 || Math.abs(pointer.y - lastPY) > 0.001;
    if (sy === lastY && !pointerMoved) return;
    lastY = sy;
    lastPX = pointer.x;
    lastPY = pointer.y;

    if (hero && sy < hero.top + hero.h + 50) {
      var p = M.clamp((sy - hero.top) / hero.h);
      hero.copy.style.translate = '0 ' + (-p * 90).toFixed(1) + 'px';
      hero.copy.style.opacity = (1 - p * 0.75).toFixed(3);
      // 单栏时插画排在文案下面，滚到它时 p 已经不小，跟着上移会跑出画框，只在双栏时做滚动视差
      var ps = hero.stacked.matches ? 0 : p;
      hero.art.style.translate = (pointer.x * 10).toFixed(1) + 'px ' + (-ps * 130 + pointer.y * 8).toFixed(1) + 'px';
      hero.art.style.rotate = (ps * 6).toFixed(2) + 'deg';
      hero.doodles.forEach(function (d) {
        d.el.style.translate = (pointer.x * 22 * d.depth).toFixed(1) + 'px ' + (-ps * 260 * d.depth + pointer.y * 16 * d.depth).toFixed(1) + 'px';
      });
    }

    var top = sy - 200;
    var bottom = sy + vh + 200;
    for (var i = 0; i < parallax.length; i++) {
      var q = parallax[i];
      if (q.top + q.h < top || q.top > bottom) continue;
      var prog = M.clamp((sy + vh - q.top) / (vh + q.h));
      q.el.style.translate = '0 ' + (q.amp - prog * q.amp * 2).toFixed(1) + 'px';
    }

    if (srcProg) {
      var sp = M.clamp((sy + vh * 0.45 - srcProg.top) / srcProg.h);
      srcProg.bar.style.scale = '1 ' + sp.toFixed(4);
    }

    for (var k = 0; k < tilts.length; k++) {
      var t = tilts[k];
      var tp = M.ease.out(M.clamp((sy + vh - t.top) / (vh * 0.85)));
      var y = (1 - tp) * 70;
      t.lastY = y;
      t.el.style.transform = 'perspective(1800px) translate3d(0,' + y.toFixed(1) + 'px,0) rotateX(' + ((1 - tp) * 26).toFixed(2) + 'deg) scale(' + (0.88 + tp * 0.12).toFixed(4) + ')';
    }

    if (shots && shots.pinned) {
      var s = shots;
      var sp2 = M.clamp((sy - s.top) / Math.max(1, s.h - vh));
      var x = -sp2 * s.dist;
      s.strip.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
      s.meter.style.setProperty('--p', sp2.toFixed(4));
      if (s.route) s.route.classList.toggle('is-tucked', sy > s.top - vh * 0.35 && sy < s.top + s.h - vh * 0.65);
      var cx = document.documentElement.clientWidth / 2 - x;
      s.items.forEach(function (it) {
        var d = M.clamp((it.x - cx) / (document.documentElement.clientWidth * 0.6), -1, 1);
        it.el.style.translate = '0 ' + (Math.abs(d) * 26).toFixed(1) + 'px';
      });
    }
  }

  function initScroll() {
    var h = $('.hero');
    if (h) {
      hero = {
        el: h,
        copy: $('.hero__copy', h),
        art: $('.crayon', h),
        stacked: window.matchMedia('(max-width: 980px)'),
        doodles: $$('.doodle', h).map(function (el, i) { return { el: el, depth: 0.5 + ((i * 37) % 10) / 10 }; }),
      };
      if (!NP.env.coarse) {
        h.addEventListener('pointermove', function (e) {
          var r = h.getBoundingClientRect();
          pointer.tx = (e.clientX - r.left) / r.width - 0.5;
          pointer.ty = (e.clientY - r.top) / r.height - 0.5;
        });
        h.addEventListener('pointerleave', function () { pointer.tx = 0; pointer.ty = 0; });
      }
    }
    parallax = $$('.sheet__num--xl, .sec-stats dd').map(function (el) { return { el: el, amp: el.matches('.sheet__num--xl') ? 40 : 14 }; });
    tilts = $$('[data-tilt]').map(function (el) { return { el: el }; });
    var idx = $('#srcIndex');
    if (idx) {
      var ol = $('ol', idx);
      var bar = document.createElement('i');
      bar.className = 'src__progress';
      bar.setAttribute('aria-hidden', 'true');
      ol.style.position = 'relative';
      ol.appendChild(bar);
      srcProg = { bar: bar, sheets: $('.src__sheets') };
    }
    var sh = $('.shots');
    if (sh && $('.shots__pin', sh)) {
      shots = {
        el: sh,
        strip: $('.shots__strip', sh),
        meter: $('.shots__meter', sh),
        items: $$('.shot', sh).map(function (el) { return { el: el, x: 0 }; }),
        route: $('#route'),
      };
    }
    NP.onResize(queueMeasure);
    window.addEventListener('load', queueMeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueMeasure);
    if (window.ResizeObserver) {
      var t = 0;
      new ResizeObserver(function () { clearTimeout(t); t = setTimeout(queueMeasure, 150); }).observe(document.body);
    }
    measure();
    scrollReady = true;
    NP.addFrame(frame, 3);
  }

  /* ---------- 主题拉绳 ---------- */
  var THEME_KEY = 'np-theme';
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function applyTheme(t) {
    var root = document.documentElement;
    root.setAttribute('data-theme', t);
    root.style.colorScheme = t;
    root.style.backgroundColor = t === 'dark' ? '#15130f' : '#fbf7ef';
    $$('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', t === 'dark' ? '#15130f' : '#fbf7ef'); });
    var btn = $('#themeBtn');
    if (btn) {
      btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', btn.getAttribute(t === 'dark' ? 'data-label-light' : 'data-label-dark') || '');
    }
  }
  function toggleTheme(origin) {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    var commit = function () {
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 隐私模式 */ }
      applyTheme(next);
    };
    if (!document.startViewTransition || reduced || !origin) { commit(); return; }
    var r = origin.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    var rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.classList.add('is-theming');
    var vt = document.startViewTransition(commit);
    vt.ready.then(function () {
      document.documentElement.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + rad + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 720, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () {});
    vt.finished.then(function () { document.documentElement.classList.remove('is-theming'); }, function () { document.documentElement.classList.remove('is-theming'); });
  }
  /* 拉绳：往下拽有阻尼，拉过一小段就「咔哒」一下，松手切换主题并弹回 */
  function initCord(btn, cord, onPull) {
    var REACH = 46;
    var ARM = 15;
    var x0 = 0;
    var y0 = 0;
    var down = false;
    var armed = false;
    var moved = 0;
    function set(pull, sway) {
      cord.style.setProperty('--pull', pull.toFixed(1) + 'px');
      cord.style.setProperty('--sway', sway.toFixed(2) + 'deg');
    }
    cord.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      down = true;
      armed = false;
      moved = 0;
      x0 = e.clientX;
      y0 = e.clientY;
      NP.capture(cord, e);
      cord.classList.add('is-drag');
    });
    cord.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dy = Math.max(0, e.clientY - y0);
      var dx = e.clientX - x0;
      moved = Math.max(moved, Math.hypot(dx, dy));
      var pull = REACH * (1 - Math.exp(-dy / REACH));
      set(pull, M.clamp(-dx * 0.7, -22, 22));
      var now = pull >= ARM;
      if (now !== armed) {
        armed = now;
        cord.classList.toggle('is-armed', armed);
        if (armed && navigator.vibrate) navigator.vibrate(8);
      }
    });
    function end() {
      if (!down) return;
      down = false;
      cord.classList.remove('is-drag', 'is-armed');
      var fire = armed || moved < 4;
      set(0, 0);
      if (fire) {
        cord.classList.remove('is-snap');
        void cord.offsetWidth;
        cord.classList.add('is-snap');
        onPull(cord);
      }
    }
    cord.addEventListener('pointerup', end);
    cord.addEventListener('pointercancel', end);
    cord.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  function initTheme() {
    applyTheme(currentTheme());
    var btn = $('#themeBtn');
    if (btn) {
      var cord = $('.lamp__cord', btn);
      var quietUntil = 0;
      btn.addEventListener('click', function () {
        if (Date.now() < quietUntil) return;
        btn.classList.add('is-pull');
        setTimeout(function () { btn.classList.remove('is-pull'); }, 160);
        toggleTheme(btn);
      });
      if (cord) initCord(btn, cord, function (bead) { quietUntil = Date.now() + 600; toggleTheme(bead); });
    }
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var follow = function (e) {
        var stored = null;
        try { stored = localStorage.getItem(THEME_KEY); } catch (err) { /* ignore */ }
        if (!stored) applyTheme(e.matches ? 'dark' : 'light');
      };
      if (mq.addEventListener) mq.addEventListener('change', follow);
    }
    var glow = document.createElement('div');
    glow.className = 'lamp-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(glow, document.body.firstChild);
    if (!NP.env.coarse && !reduced) {
      var raf = 0;
      var px = 0;
      var py = 0;
      window.addEventListener('pointermove', function (e) {
        px = e.clientX;
        py = e.clientY;
        if (raf || currentTheme() !== 'dark') return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          glow.style.setProperty('--lx', px + 'px');
          glow.style.setProperty('--ly', py + 'px');
        });
      }, { passive: true });
    }
  }

  /* ---------- 分段选择的滑块 ---------- */
  function initSegs() {
    $$('.seg').forEach(function (seg) {
      var active = false;
      function activate(event) {
        if (active) return;
        active = true;
        seg.removeEventListener('pointerdown', activate, true);
        seg.removeEventListener('focusin', activate, true);
        seg.removeEventListener('click', activate, true);
        var fontsReady = document.fonts && document.fonts.status !== 'loaded' ? document.fonts.ready : null;
        var ind = document.createElement('span');
        ind.className = 'seg__ind';
        ind.setAttribute('aria-hidden', 'true');
        function geometry(button) {
          var width = button ? button.offsetWidth : 0;
          return width ? [width, button.offsetHeight, button.offsetLeft, button.offsetTop] : null;
        }
        // 首击可能在同一任务里换选项，先一次读完按钮，再连接滑块
        var initial = $$('button', seg).map(function (button) { return { button: button, box: geometry(button) }; });
        var lastGeometry = '';
        function place(jump) {
          var on = $('button.is-on', seg);
          var hit = initial && initial.filter(function (item) { return item.button === on; })[0];
          var box = hit ? hit.box : geometry(on);
          if (!box) { ind.hidden = true; lastGeometry = ''; return; }
          var key = box.join(',');
          if (key === lastGeometry && !ind.hidden) return;
          lastGeometry = key;
          ind.hidden = false;
          if (jump) ind.classList.add('is-jump');
          ind.style.width = box[0] + 'px';
          ind.style.height = box[1] + 'px';
          ind.style.translate = box[2] + 'px ' + box[3] + 'px';
          if (jump && ind.isConnected) { void ind.offsetWidth; ind.classList.remove('is-jump'); }
        }
        place(true);
        seg.insertBefore(ind, seg.firstChild);
        seg.classList.add('has-ind');
        // 只提交过渡初态，不用尺寸读取强制布局；普通预热交给浏览器绘制
        if (event) getComputedStyle(ind).transitionProperty;
        ind.classList.remove('is-jump');
        requestAnimationFrame(function () { initial = null; });
        new MutationObserver(function (records) {
          // 跳转标记不改变按钮几何，避免滑块响应自己的 class 写入
          if (records.some(function (record) { return record.target === seg; })) initial = null;
          if (records.some(function (record) { return record.target !== ind; })) place(false);
        }).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] });
        function refresh() { initial = null; place(true); }
        NP.onResize(refresh);
        // 已完成的字体不再排跳转校准，避免覆盖首击刚开始的滑动
        if (fontsReady) fontsReady.then(refresh);
        NP.whenVisible(seg, function () { place(true); });
      }
      // 首次输入可能早于可见性回调，先定位旧选中项再让按钮响应
      seg.addEventListener('pointerdown', activate, true);
      seg.addEventListener('focusin', activate, true);
      seg.addEventListener('click', activate, true);
      NP.whenVisible(seg, activate, null, '1200px 0px');
    });
  }

  function startHero() {
    /* 开场等标题字体就位（最多 1.2 秒），否则会先闪一下回退字体再换 */
    var started = false;
    var start = function () {
      if (started) return;
      started = true;
      requestAnimationFrame(function () {
        setTimeout(function () { var h = $('.hero'); if (h) h.classList.add('is-intro'); }, 60);
      });
    };
    var h1 = $('.hero h1');
    if (document.fonts && document.fonts.load && h1) {
      var sample = (h1.textContent || 'NeriPlayer').replace(/\s+/g, '').slice(0, 24);
      Promise.all([
        document.fonts.load('400 64px "Fraunces Critical"', sample),
        document.fonts.load('italic 400 64px "Fraunces Critical"', sample),
        document.fonts.load('400 64px "NP Serif"', sample),
      ]).then(start, start);
      setTimeout(start, 1200);
    } else start();
  }

  var heroInitialized = false;
  var motionInitialized = false;
  function initHero() {
    if (heroInitialized) return;
    heroInitialized = true;
    if (!reduced) decorate();
    observe(true);
    startHero();
  }

  NP.motion = {
    initHero: initHero,
    init: function () {
      if (motionInitialized) return;
      motionInitialized = true;
      initHero();
      observe(false);
      initScroll();
      initSegs();
    },
    initTheme: initTheme,
  };
  // defer 执行时首屏已解析，不必等待后续演示脚本才开始原有入场动画
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHero, { once: true });
  else initHero();
})();
