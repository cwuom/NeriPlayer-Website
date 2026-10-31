/* NeriPlayer site · main —— 启动顺序、导航、路线图与锚点跳转 */
(function () {
  'use strict';

  var NP = window.NP;
  var M = NP.math;
  var $ = NP.$;
  var $$ = NP.$$;

  function navH() { var n = $('#nav'); return n ? n.offsetHeight : 64; }
  function targetY(id) {
    if (id === 'top' || !id) return 0;
    var el = document.getElementById(id);
    if (!el) return null;
    var extra = el.classList.contains('station') ? 10 : 24;
    return NP.absTop(el) - navH() - extra;
  }

  var fontGroups = [
    { files: ['content-fonts', 'desktop-fonts'], selector: '.station,.footer', margin: '200px 0px' },
    { files: ['phone-fonts'], selector: '.device:not(.is-shot)', margin: '1200px 0px' },
  ];
  var assetBase = document.currentScript.src.replace(/[?#].*$/, '').replace(/js\/main\.js$/, 'css/');
  var fontVersion = document.currentScript.dataset && document.currentScript.dataset.fontVersion;
  function loadFonts(group) {
    if (group.pending) return group.pending;
    var loaded = group.loaded || (group.loaded = {});
    group.pending = Promise.all(group.files.map(function (name) {
      if (loaded[name]) return true;
      return new Promise(function (resolve) {
        var attempts = 0;
        function request() {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = assetBase + name + '.css' + (fontVersion ? '?v=' + fontVersion : '');
          link.dataset.contentFont = name;
          attempts++;
          link.onload = function () { loaded[name] = true; resolve(true); };
          link.onerror = function () {
            link.remove();
            if (attempts < 3) setTimeout(request, attempts === 1 ? 250 : 750);
            else resolve(false);
          };
          document.head.appendChild(link);
        }
        request();
      });
    })).then(function (results) {
      if (results.indexOf(false) !== -1) group.pending = null;
      return results.indexOf(false) === -1;
    });
    return group.pending;
  }
  var fontSections = new WeakMap();
  function prepareSectionFonts(section) {
    if (fontSections.has(section)) return fontSections.get(section);
    var pending = Promise.all([stylesLoaded, loadFonts(fontGroups[0])]).then(function (ready) {
      if (!ready[1]) { fontSections.delete(section); return false; }
      section.setAttribute('data-fonts-preparing', '');
      return new Promise(function (resolve) {
        // 先让浏览器按此章节的真实字体栈请求字形，避免遍历仿真器或强制加载平台未选用的字体
        requestAnimationFrame(function () { setTimeout(function () {
          var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
          fontsReady.then(function () {
            section.setAttribute('data-fonts-ready', '');
            section.removeAttribute('data-fonts-preparing');
            resolve(true);
          }, function () {
            section.removeAttribute('data-fonts-preparing');
            fontSections.delete(section);
            resolve(false);
          });
        }, 0); });
      });
    });
    fontSections.set(section, pending);
    return pending;
  }
  function fontsFor(target) {
    if (!target || target.id === 'top') return Promise.resolve();
    var section = target.closest('.station,.footer');
    var pending = section ? [prepareSectionFonts(section)] : [loadFonts(fontGroups[0])];
    fontGroups.slice(1).forEach(function (group) {
      if (target.matches(group.selector) || target.querySelector(group.selector) || target.closest(group.selector)) pending.push(loadFonts(group));
    });
    return Promise.all(pending);
  }
  var previewSelector = '.device:not(.is-shot),[data-app-preview],#deskStage';
  function prepareFor(target) {
    if (target && (target.matches(previewSelector) || target.querySelector(previewSelector) || target.closest(previewSelector))) return NP.preparePreviews();
    return Promise.resolve();
  }
  function initFontLoading() {
    fontGroups.forEach(function (group, index) {
      if (!window.IntersectionObserver) {
        if (index === 0) $$(group.selector).forEach(prepareSectionFonts);
        else loadFonts(group);
        return;
      }
      var observer = new IntersectionObserver(function (entries) {
        if (index === 0) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) prepareSectionFonts(entry.target).then(function (ready) {
              if (ready) observer.unobserve(entry.target);
            });
          });
          return;
        }
        if (entries.some(function (entry) { return entry.isIntersecting; })) loadFonts(group).then(function (ready) {
          if (ready) observer.disconnect();
        });
      }, { rootMargin: group.margin });
      $$(group.selector).forEach(function (el) { observer.observe(el); });
    });
    if (location.hash) fontsFor(document.getElementById(location.hash.slice(1)));
  }

  var anchorIntent;
  function alignAnchor() {
    if (!anchorIntent || !NP.baseReady) return;
    var y = targetY(anchorIntent.id);
    if (y === null) return;
    if (anchorIntent.instant) { if (Math.abs(y - window.scrollY) >= 1) NP.scrollTo(y, true); }
    else if (NP.retargetScroll) NP.retargetScroll(y);
  }
  function navigateTo(id, instant) {
    var target = document.getElementById(id);
    var y = targetY(id);
    if (y === null) return false;
    var intent = anchorIntent = { id: id, instant: !!instant };
    if (!instant) NP.scrollTo(y);
    stylesLoaded.then(function () { if (anchorIntent === intent) alignAnchor(); });
    Promise.all([stylesLoaded, fontsFor(target), prepareFor(target)]).then(function () {
      return new Promise(requestAnimationFrame);
    }).then(function () {
      return document.fonts && document.fonts.ready;
    }).then(function () { return new Promise(requestAnimationFrame); }).then(function () {
      // 旧页面可能暂时保留旧 core，等它最长 2.1 秒的滚动结束再校准一次
      if (!NP.retargetScroll || !NP.smoothScroll.isAnimating) {
        setTimeout(function () {
          if (anchorIntent !== intent) return;
          var y = targetY(intent.id);
          anchorIntent = null;
          if (y !== null && Math.abs(y - window.scrollY) >= 1) NP.scrollTo(y, true);
        }, 2200);
        return;
      }
      var quietFrames = 0;
      function finish() {
        if (anchorIntent !== intent) return;
        if (NP.smoothScroll.isAnimating() || (document.fonts && document.fonts.status === 'loading')) quietFrames = 0;
        else {
          relayout();
          quietFrames = NP.smoothScroll.isAnimating() ? 0 : quietFrames + 1;
          if (quietFrames >= 2) { anchorIntent = null; return; }
        }
        requestAnimationFrame(finish);
      }
      finish();
    }, function () { if (anchorIntent === intent) anchorIntent = null; });
    return true;
  }
  function cancelAnchor() { anchorIntent = null; }

  /* ---------- 导航与路线图 ---------- */
  var nav = {
    stops: [],
    idx: -1,
    hidden: false,
    solid: false,
    init: function () {
      this.el = $('#nav');
      this.route = $('#route');
      this.ink = $('#routeInk');
      this.cat = $('#routeCat');
      this.items = $$('.route__stops li');
      this.links = $$('.nav__links a');
      this.inkLen = 0;
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        var id = (a.getAttribute('href') || '').slice(1);
        if (id === 'main') return;
        if (!document.getElementById(id)) return;
        e.preventDefault();
        menu.close();
        navigateTo(id);
        if (history.replaceState) history.replaceState(null, '', id === 'top' ? location.pathname + location.search : '#' + id);
      });
      window.addEventListener('touchstart', cancelAnchor, { passive: true });
      window.addEventListener('pointerdown', cancelAnchor, { passive: true });
      window.addEventListener('wheel', cancelAnchor, { passive: true });
      window.addEventListener('pageshow', function (e) { if (e.persisted) cancelAnchor(); });
      window.addEventListener('keydown', function (e) {
        if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) cancelAnchor();
      });
    },
    measure: function () {
      this.stops = $$('[data-station]').map(function (el) {
        return { i: +el.getAttribute('data-station'), y: NP.absTop(el), id: el.id };
      });
      this.railH = this.route ? this.route.clientHeight : 0;
      if (this.railH && !this.inkLen && this.ink && this.ink.getTotalLength) this.inkLen = this.ink.getTotalLength();
      this.routePos = null;
      this.idx = -1;
    },
    update: function () {
      var s = this.stops;
      if (!s.length) return;
      var sy = NP.scroll.y;
      var y = sy + NP.vp.h * 0.4;
      var i = 0;
      while (i < s.length - 1 && s[i + 1].y <= y) i++;
      if (i !== this.idx) {
        this.idx = i;
        // 路线图上没有站务室，FAQ 时停在终点
        var stop = Math.min(i, this.items.length - 1);
        this.items.forEach(function (li, k) {
          li.classList.toggle('is-on', k === stop);
          li.classList.toggle('is-passed', k < stop);
        });
        var href = '#' + s[i].id;
        this.links.forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('href') === href); });
      }
      // 路线进度按站计：当前站 + 到下一站的比例，与等距排布的站点对齐
      var last = this.items.length - 1;
      var next = s[Math.min(i + 1, s.length - 1)];
      var frac = next.y > s[i].y ? M.clamp((y - s[i].y) / (next.y - s[i].y)) : 0;
      var pos = last > 0 ? M.clamp((i + frac) / last) : 0;
      var routePos = pos.toFixed(4);
      if (routePos !== this.routePos && this.ink) this.ink.style.strokeDashoffset = (1 - pos).toFixed(4);
      if (routePos !== this.routePos && this.cat && this.railH && this.inkLen) {
        var pt = this.ink.getPointAtLength(this.inkLen * pos);
        var ty = (pt.y / 600) * this.railH;
        this.cat.style.transform = 'translate3d(' + (pt.x - 12).toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0)';
      }
      this.routePos = routePos;
      var solid = sy > 24;
      if (solid !== this.solid) { this.solid = solid; this.el.classList.toggle('is-solid', solid); }
      var vy = NP.scroll.vy;
      var hide = sy > NP.vp.h * 0.9 && vy > 60 && !menu.isOpen;
      var show = vy < -40 || sy < NP.vp.h * 0.5;
      if (hide && !this.hidden) { this.hidden = true; this.el.classList.add('is-hidden'); }
      else if (show && this.hidden) { this.hidden = false; this.el.classList.remove('is-hidden'); }
    },
  };

  /* ---------- 移动端目录 ---------- */
  var menu = {
    isOpen: false,
    init: function () {
      this.el = $('#menu');
      this.btn = $('#burger');
      if (!this.el || !this.btn) return;
      var self = this;
      $$('.menu__list a').forEach(function (a, k) { a.style.setProperty('--k', k); });
      this.btn.addEventListener('click', function () { self.isOpen ? self.close() : self.open(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') self.close(); });
    },
    open: function () {
      this.isOpen = true;
      this.el.hidden = false;
      this.el.style.pointerEvents = '';
      void this.el.offsetWidth;
      this.el.classList.add('is-open');
      this.btn.setAttribute('aria-expanded', 'true');
      this.btn.setAttribute('aria-label', NP.L('关闭目录', 'Close menu'));
      NP.lockScroll(true);
      $('#nav').classList.remove('is-hidden');
    },
    close: function () {
      if (!this.isOpen) return;
      var el = this.el;
      this.isOpen = false;
      el.classList.remove('is-open');
      el.style.pointerEvents = 'none';
      this.btn.setAttribute('aria-expanded', 'false');
      this.btn.setAttribute('aria-label', NP.L('打开目录', 'Open menu'));
      NP.lockScroll(false);
      setTimeout(function () { if (!menu.isOpen) el.hidden = true; }, 450);
    },
  };

  /* ---------- 启动 ---------- */
  function relayout() { nav.measure(); alignAnchor(); }

  /* 还没加载完的图片先透明，解码后淡入，不会“啪”一下冒出来 */
  var imageObserver;
  function fadeImages(scope) {
    var images = scope ? (scope.tagName === 'IMG' ? [scope] : $$('img', scope)) : $$('img');
    var pending = images.filter(function (img) {
      if (NP.env.reduced || (img.complete && img.naturalWidth)) { img.classList.remove('img-wait'); return false; }
      return !img._npFadeBound && !img.classList.contains('theme-ghost');
    });
    pending.forEach(function (img) {
      img._npFadeBound = true;
      img.classList.add('img-wait');
      var done = function () {
        img.removeEventListener('load', loaded);
        img.removeEventListener('error', done);
        requestAnimationFrame(function () { img.classList.remove('img-wait'); });
      };
      function loaded() {
        // 等图片真正加载时再检查淡入，避免读取懒加载图片的样式唤醒整台模拟器
        var ownTransition = getComputedStyle(img).transitionDuration.split(',').some(function (d) { return parseFloat(d) > 0; });
        if (!ownTransition) img.classList.add('img-fade');
        if (img.decode) img.decode().then(done, done); else done();
      }
      img.addEventListener('load', loaded);
      img.addEventListener('error', done);
    });
    if (!imageObserver && window.MutationObserver) {
      imageObserver = new MutationObserver(function (records) {
        records.forEach(function (record) { Array.prototype.forEach.call(record.addedNodes, function (node) {
          if (node.nodeType === 1 && (node.tagName === 'IMG' || node.querySelector('img'))) fadeImages(node);
        }); });
      });
      imageObserver.observe($('#main'), { childList: true, subtree: true });
    }
  }

  function bootShell() {
    // 先读取滚动位置，再写入视口和主题，避免启动时强制重排整页
    NP.smoothScroll.init();
    NP.measure(true);
    NP.motion.initTheme();
    nav.init();
    menu.init();
    var hash = location.hash.replace('#', '');
    if (hash) navigateTo(hash, true);
    // 主题与导航先完成一次布局，动画装饰放到下个任务，避免合成长任务
    setTimeout(finishShell, 0);
  }

  function finishShell() {
    if (NP.motion.initHero) NP.motion.initHero();
    NP.addFrame(function (dt) { NP.smoothScroll.update(dt); }, 0);
    NP.addFrame(function (dt) { NP.scroll.update(dt); }, 1);
    NP.addFrame(function () { nav.update(); }, 6);
    NP.start();
    NP.shellReady = true;
    // 下方内容先应用完整样式，再建立观察器和读取布局，首屏动画不必等它们
    stylesLoaded.then(function () {
      requestAnimationFrame(function () { setTimeout(finishContent, 0); });
    });
  }

  function finishContent() {
    NP.motion.init();
    NP.github.init();
    NP.onResize(relayout);

    if (window.ResizeObserver) {
      var t = 0;
      var lastH = document.documentElement.scrollHeight;
      new ResizeObserver(function () {
        var h = document.documentElement.scrollHeight;
        if (Math.abs(h - lastH) < 2) return;
        lastH = h;
        clearTimeout(t);
        t = setTimeout(relayout, 120);
      }).observe($('#main'));
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () {
      if (!NP.baseReady) return;
      NP.measure(true);
      if (NP.phones && NP.phones.list) NP.phones.list.forEach(function (phone) {
        if (phone.cover) phone.cover.dirty = true;
        if (phone.page) phone.page.dirty = true;
      });
    });
    window.addEventListener('load', relayout);

    NP.contentReady = true;
  }

  var previewsStarted = false;
  function bootPreviews() {
    if (previewsStarted) return;
    previewsStarted = true;
    var styles = $$('link[data-deferred-style]');
    var pending = styles.length;
    function afterStyles() {
      // 先让浏览器应用完整样式，再测量演示区域，避免在脚本任务中同步重排整页
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        document.documentElement.classList.add('np-styles-ready');
        setTimeout(startJobs, 0);
      }); });
    }
    function styleReady(state, link, failed) {
      if (state.ready || state.current !== link) return;
      state.ready = true;
      state.original._npReady = true;
      link.dataset.ready = failed ? 'error' : 'true';
      if (failed) document.documentElement.classList.add('np-style-error');
      else link.media = 'all';
      if (--pending === 0) afterStyles();
    }
    function styleFailed(state, link) {
      if (state.ready || state.current !== link || link._npStyleFailed) return;
      link._npStyleFailed = true;
      if (state.attempts >= 3) { styleReady(state, link, true); return; }
      setTimeout(function () {
        if (state.ready || state.current !== link) return;
        var retry = document.createElement('link');
        retry.rel = 'stylesheet';
        retry.href = state.src;
        retry.media = 'print';
        retry.setAttribute('data-deferred-style', '');
        state.attempts++;
        watchStyle(state, retry);
        if (link.parentNode) link.parentNode.insertBefore(retry, link.nextSibling);
        else document.head.appendChild(retry);
        link.remove();
      }, state.attempts === 1 ? 250 : 750);
    }
    function watchStyle(state, link) {
      state.current = link;
      link.addEventListener('load', function () { styleReady(state, link); }, { once: true });
      link.addEventListener('error', function () { styleFailed(state, link); }, { once: true });
      if (link.sheet || link.dataset.ready === 'true' || link.dataset.ready === true) styleReady(state, link);
      else if (link.dataset.ready === 'error') styleFailed(state, link);
    }
    if (!pending) afterStyles();
    styles.forEach(function (link) {
      watchStyle({ original: link, src: link.href, attempts: 1, ready: false }, link);
    });
  }

  function startJobs() {
    initFontLoading();
    fadeImages();
    NP.measure(true);
    NP.demos.init();
    relayout();
    NP.baseReady = true;
    stylesReady();
    if (!window.IntersectionObserver) { NP.preparePreviews(); return; }
    var observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) { NP.preparePreviews(); observer.disconnect(); }
    }, { rootMargin: '1600px 0px' });
    $$(previewSelector).forEach(function (el) { observer.observe(el); });
  }

  var stylesReady;
  var stylesLoaded = new Promise(function (resolve) { stylesReady = resolve; });
  var previewRequest;
  var previewRetry = 0;
  var previewModules;
  function loadPreviewModules() {
    if (!previewModules) {
      previewModules = $$('script[data-np-module]').map(function (entry) {
        var module = { src: entry.getAttribute('data-np-module'), loaded: false, attempts: 0 };
        // 并行下载，按依赖顺序执行，重试时不重放已执行模块的副作用
        var preload = document.createElement('link');
        preload.rel = 'preload';
        preload.as = 'script';
        preload.href = module.src;
        preload.onerror = function () { if (!module.attempts) module.attempts = 1; };
        document.head.appendChild(preload);
        return module;
      });
    }
    return previewModules.reduce(function (previous, module) {
      return previous.then(function () {
        if (module.loaded) return;
        return new Promise(function (resolve, reject) {
          var script = document.createElement('script');
          script.async = false;
          script.src = module.src;
          module.attempts++;
          script.onload = function () { module.loaded = true; resolve(); };
          script.onerror = function () {
            script.remove();
            var error = new Error('Unable to load ' + module.src);
            error.previewModule = true;
            error.retryable = module.attempts < 3;
            error.attempt = module.attempts;
            reject(error);
          };
          document.head.appendChild(script);
        });
      });
    }, Promise.resolve());
  }
  NP.preparePreviews = function () {
    if (previewRequest) return previewRequest;
    clearTimeout(previewRetry);
    previewRetry = 0;
    var fontStyles = fontGroups.map(loadFonts);
    previewRequest = Promise.all([stylesLoaded, loadPreviewModules()].concat(fontStyles)).then(function () {
      return new Promise(startPreviewJobs);
    }).then(function () {
      document.documentElement.classList.remove('np-preview-error');
    });
    previewRequest.catch(function (error) {
      document.documentElement.classList.add('np-preview-error');
      if (!error || !error.previewModule || !error.retryable) return;
      previewRequest = null;
      previewRetry = setTimeout(function () {
        previewRetry = 0;
        if (!previewRequest) NP.preparePreviews();
      }, error.attempt === 1 ? 250 : 750);
    });
    return previewRequest;
  };

  function startPreviewJobs(resolve, reject) {
    var jobs = [
      function () {
        NP.phones.init();
        if (NP.playerPreview) NP.playerPreview.init();
      },
      function () { if (NP.themes) NP.themes.init(); },
      function () { if (NP.dsp) NP.dsp.init(); },
      function () { if (NP.appPreview) NP.appPreview.init(); },
      function () { if (NP.appMotion) NP.appMotion.init(); },
      function () { if (NP.appGlass) NP.appGlass.init(); },
      function () { if (NP.desktop) NP.desktop.init(); },
      function () {
        if (window.ResizeObserver && NP.desktopSim && NP.desktopSim.sim) new ResizeObserver(function () { NP.desktopSim.sim.layout(); }).observe($('#deskScreen'));
        NP.measure(true);
        relayout();
        NP.booted = true;
        document.documentElement.classList.add('np-ready');
        resolve();
      },
    ];
    // 每个预览之间交还主线程，首屏绘制和用户输入不必等整组初始化结束
    function next() {
      var job = jobs.shift();
      if (!job) return;
      try { job(); } catch (error) { reject(error); return; }
      setTimeout(next, 0);
    }
    requestAnimationFrame(function () { setTimeout(next, 0); });
  }

  function scheduleShell() {
    requestAnimationFrame(function () { setTimeout(bootShell, 0); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleShell);
  else scheduleShell();
  if (document.readyState === 'complete') bootPreviews();
  else document.addEventListener('DOMContentLoaded', bootPreviews, { once: true });
})();
