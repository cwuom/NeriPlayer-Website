/* NeriPlayer site · github —— Android 与桌面端的最新版本、安装包、星标与累计下载（带本地缓存与降级；数值变化都走过渡） */
(function () {
  'use strict';

  var NP = window.NP;
  var $ = NP.$;
  var $$ = NP.$$;
  var L = NP.L;
  var GH = 'https://github.com/';
  var API = 'https://api.github.com/repos/';
  var REPO = 'cwuom/NeriPlayer';
  var DREPO = 'cwuom/NeriPlayer-Desktop';

  var dataURL = document.currentScript ? document.currentScript.src.replace(/js\/github\.js(?:[?#].*)?$/, 'data/github.json') : (NP.en ? '../' : '') + 'assets/data/github.json';
  var snapshotRequest;

  function readCache(key) {
    try {
      var raw = localStorage.getItem('np-site:' + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem('np-site:' + key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* 隐私模式或配额已满时仍可使用当前数据 */ }
  }
  function requestJSON(url, timeout) {
    return new Promise(function (resolve, reject) {
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        reject(new Error('request timed out'));
      }, timeout);
      fetch(url, { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (value) { clearTimeout(timer); resolve(value); }, function (error) { clearTimeout(timer); reject(error); });
    });
  }
  function integer(value) { return typeof value === 'number' && isFinite(value) && value >= 0 && Math.floor(value) === value; }
  function validStats(value) { return value && integer(value.count) && integer(value.total); }
  function officialURL(value, repo, path) { return typeof value === 'string' && value.indexOf(GH + repo + path) === 0 && !/[\s"<>]/.test(value); }
  function validRelease(value, repo) {
    return value && typeof value.tag_name === 'string' && value.tag_name && typeof value.body === 'string' &&
      !isNaN(Date.parse(value.published_at)) && officialURL(value.html_url, repo, '/releases/') &&
      Array.isArray(value.assets) && value.assets.length && value.assets.every(function (asset) {
        return asset && typeof asset.name === 'string' && integer(asset.size) && asset.size > 0 &&
          officialURL(asset.browser_download_url, repo, '/releases/download/') &&
          (asset.digest == null || asset.digest === '' || typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(asset.digest));
      });
  }
  function hasInstaller(value, classify) {
    return value.assets.some(function (asset) { return !!classify(asset.name); });
  }
  function validSnapshot(value) {
    return value && value.schema === 1 && !isNaN(Date.parse(value.fetched_at)) && value.repository &&
      integer(value.repository.stargazers_count) && integer(value.repository.forks_count) &&
      value.android && validRelease(value.android.latest, REPO) && validStats(value.android.stats) && value.android.stats.count > 0 && value.android.stats.limited === false &&
      hasInstaller(value.android.latest, abiOf) &&
      value.desktop && validRelease(value.desktop.latest, DREPO) && validStats(value.desktop.stats) && value.desktop.stats.count > 0 && value.desktop.stats.limited === false &&
      hasInstaller(value.desktop.latest, pkgOf);
  }
  function snapshot() {
    if (!snapshotRequest) snapshotRequest = requestJSON(dataURL, 4000).then(function (value) {
      if (!validSnapshot(value)) throw new Error('invalid GitHub snapshot');
      writeCache('github-snapshot', value);
      return value;
    }).catch(function (error) {
      var hit = readCache('github-snapshot');
      if (hit && validSnapshot(hit.v)) return hit.v;
      throw error;
    });
    return snapshotRequest;
  }
  function cachedStats(o) {
    var hit = readCache(o.cache + 's');
    return hit && validStats(hit.v) ? hit : null;
  }
  function requestStats(o) {
    var hit = cachedStats(o);
    if (hit && Date.now() - hit.t < 360 * 60000) return Promise.resolve(hit.v);
    return requestJSON(API + o.repo + '/releases?per_page=100', 3000).then(function (list) {
      if (!Array.isArray(list)) throw new Error('invalid release history');
      var total = 0;
      list.forEach(function (rel) {
        if (!Array.isArray(rel.assets)) throw new Error('invalid release history');
        rel.assets.forEach(function (asset) {
          if (typeof asset.name !== 'string' || !integer(asset.download_count)) throw new Error('invalid download count');
          if (!/\.(txt|sh|xz)$/i.test(asset.name)) total += asset.download_count;
        });
      });
      var stats = { count: list.length, total: total, limited: list.length >= 100 };
      writeCache(o.cache + 's', stats);
      return stats;
    }).catch(function (error) { if (hit) return hit.v; throw error; });
  }

  function fmtCount(n) {
    if (n >= 10000 && !NP.en) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function fmtSize(b) { return (b / 1048576).toFixed(1) + ' MB'; }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function swap(el, text) {
    if (!el || el.textContent === text) return;
    if (NP.swapText) NP.swapText(el, text); else el.textContent = text;
  }
  function setAll(name, text) { $$('[data-gh="' + name + '"]').forEach(function (el) { swap(el, text); }); }

  /* SHA 行用透明度与高度过渡显隐，不再用 hidden 硬切 */
  function showSha(el, sha) {
    if (!el) return;
    if (sha) {
      var code = el.querySelector('code');
      var short = sha.slice(0, 24) + '…';
      code.title = sha;
      if (el.classList.contains('is-off')) code.textContent = short; else swap(code, short);
    }
    el.classList.toggle('is-off', !sha);
    el.setAttribute('aria-hidden', sha ? 'false' : 'true');
  }

  function renderChanges(list, body, url) {
    if (!list) return;
    var lines = (body || '').split(/\r?\n/);
    var items = [];
    lines.forEach(function (l) {
      var m = /^\*\s+(.+?)\s+by\s+@[\w-]+\s+in\s+(https:\/\/\S+)/.exec(l);
      if (m && items.length < 5) items.push({ text: m[1], href: m[2] });
    });
    if (!items.length) {
      lines.forEach(function (l) {
        var m = /^-\s+[0-9a-f]{7,}\s+(.+)$/.exec(l);
        if (m && items.length < 5) items.push({ text: m[1] });
      });
    }
    var build = function () {
      list.innerHTML = '';
      items.forEach(function (it, i) {
        var li = document.createElement('li');
        li.style.setProperty('--i', i);
        if (it.href) {
          var a = document.createElement('a');
          a.href = it.href;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = it.text;
          li.appendChild(a);
        } else {
          li.textContent = it.text;
        }
        list.appendChild(li);
      });
      var more = document.createElement('li');
      more.className = 'changes__empty';
      more.style.setProperty('--i', items.length);
      more.innerHTML = '<a href="' + url + '" target="_blank" rel="noopener">' + L('查看完整更新日志 ↗', 'Full changelog ↗') + '</a>';
      list.appendChild(more);
      list.classList.remove('is-swap');
    };
    fadeList(list, build);
  }
  function fadeList(list, build) {
    if (NP.env.reduced || !list.children.length) { build(); return; }
    list.classList.add('is-swap');
    setTimeout(build, 260);
  }
  function failList(list, releases) {
    if (!list) return;
    fadeList(list, function () {
      list.innerHTML = '<li class="changes__empty">' + L('暂时无法读取版本信息，', 'Release information is unavailable right now. ') + '<a href="' + releases + '" target="_blank" rel="noopener">' + L('直接前往 Releases ↗', 'Go to Releases ↗') + '</a></li>';
      list.classList.remove('is-swap');
    });
  }

  /* 一张车票：选座（ABI / 系统）→ 按钮链接、大小与校验值 */
  function Ticket(opt) {
    this.o = opt;
    this.release = null;
    var self = this;
    $$('input[name="' + opt.radio + '"]').forEach(function (r) { r.addEventListener('change', function () { self.apply(); }); });
  }
  Ticket.prototype.pick = function (v) {
    var input = $('input[name="' + this.o.radio + '"][value="' + v + '"]');
    if (input && !input.checked) { input.checked = true; this.apply(); }
  };
  Ticket.prototype.current = function () {
    var el = $('input[name="' + this.o.radio + '"]:checked');
    return el ? el.value : this.o.fallback;
  };
  Ticket.prototype.apply = function () {
    var o = this.o;
    var btn = $(o.btn);
    var size = $(o.size);
    if (!btn) return;
    var key = this.current();
    var rel = this.release;
    var asset = rel && (rel.assets[key] || (o.any && rel.assets[o.any]));
    btn.setAttribute('data-key', key);
    if (asset) {
      btn.href = asset.url;
      btn.removeAttribute('target');
      swap(size, o.label(key) + ' · ' + fmtSize(asset.size));
      showSha($(o.sha), asset.sha);
    } else {
      btn.href = rel ? rel.url : GH + o.repo + '/releases/latest';
      btn.target = '_blank';
      swap(size, rel ? L('前往发布页', 'Open release page') : 'GitHub Releases');
      showSha($(o.sha), '');
    }
  };
  Ticket.prototype.load = function () {
    var self = this;
    var o = this.o;
    snapshot().then(function (data) { return data[o.prefix ? 'desktop' : 'android'].latest; }).catch(function (error) {
      var hit = readCache(o.cache);
      if (hit && validRelease(hit.v, o.repo)) return hit.v;
      throw error;
    }).then(function (r) {
      var assets = {};
      (r.assets || []).forEach(function (a) {
        var k = o.classify(a.name);
        if (k && !assets[k]) assets[k] = { url: a.browser_download_url, size: a.size, sha: (a.digest || '').replace(/^sha256:/i, '') };
      });
      self.release = { tag: r.tag_name, url: r.html_url, date: r.published_at, assets: assets };
      setAll(o.prefix + 'tag', r.tag_name || L('最新版本', 'Latest'));
      setAll(o.prefix + 'date', fmtDate(r.published_at));
      if (o.onRelease) o.onRelease(r);
      renderChanges($(o.changes), r.body, r.html_url);
      self.apply();
    }).catch(function () {
      failList($(o.changes), GH + o.repo + '/releases');
      self.apply();
    });
    this.watchStats();
  };
  Ticket.prototype.loadStats = function (user) {
    if (this.statsRequest) return this.statsRequest;
    if (this.statsFailed && !user) return Promise.resolve(null);
    var self = this;
    var o = this.o;
    this.statsFailed = false;
    this.statsRequest = snapshot().then(function (data) { return data[o.prefix ? 'desktop' : 'android'].stats; }).catch(function (error) {
      var hit = cachedStats(o);
      if (user) return requestStats(o);
      if (hit) return hit.v;
      throw error;
    }).then(function (s) {
      if (self.stopStatsWatch) self.stopStatsWatch();
      if (!s) { self.statsFailed = true; self.statsRequest = null; return null; }
      var more = s.limited || (s.limited === undefined && s.count >= 100) ? '+' : '';
      setAll(o.prefix + 'count', s.count + more);
      setAll(o.prefix + 'downloads', fmtCount(s.total) + more);
      return s;
    }).catch(function () {
      if (self.stopStatsWatch) self.stopStatsWatch();
      self.statsFailed = true;
      self.statsRequest = null;
      return null;
    });
    return this.statsRequest;
  };
  Ticket.prototype.watchStats = function () {
    var self = this;
    var field = $('[data-gh="' + this.o.prefix + 'downloads"]');
    var target = field && field.closest('.ticket__stub');
    if (!target) return;
    var pane = target.closest('.dlpane');
    function active() { return !pane || pane.classList.contains('is-on'); }
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting && active()) self.loadStats(); });
      }, { rootMargin: '240px 0px' });
      this.stopStatsWatch = function () { observer.disconnect(); };
      observer.observe(target);
    } else {
      function check() {
        if (!active()) return;
        var rect = target.getBoundingClientRect();
        if (rect.top <= window.innerHeight + 240 && rect.bottom >= -240) self.loadStats();
      }
      this.stopStatsWatch = function () {
        window.removeEventListener('scroll', check);
        window.removeEventListener('resize', check);
        window.removeEventListener('load', check);
      };
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      window.addEventListener('load', check);
      check();
    }
  };

  function abiOf(name) {
    var m = /-(arm64-v8a|armeabi-v7a|x86_64|x86)\.apk$/i.exec(name);
    if (m) return m[1].toLowerCase();
    return /\.apk$/i.test(name) ? 'universal' : null;
  }
  function pkgOf(name) {
    if (/x64-setup\.exe$/i.test(name) || /setup\.exe$/i.test(name)) return 'win-exe';
    if (/\.msi$/i.test(name)) return 'win-msi';
    if (/(aarch64|arm64).*\.dmg$/i.test(name)) return 'mac-arm';
    if (/(x64|x86_64|intel).*\.dmg$/i.test(name)) return 'mac-x64';
    if (/\.deb$/i.test(name)) return 'linux-deb';
    if (/\.rpm$/i.test(name)) return 'linux-rpm';
    if (/appimage/i.test(name)) return 'linux-appimage';
    return null;
  }
  var PKG_LABEL = {
    'win-exe': 'Windows .exe', 'win-msi': 'Windows .msi', 'mac-arm': 'macOS Apple Silicon', 'mac-x64': 'macOS Intel',
    'linux-deb': 'Linux .deb', 'linux-rpm': 'Linux .rpm', 'linux-appimage': 'AppImage',
  };

  /* 访客的系统：决定桌面端默认选哪个安装包，以及首页按钮怎么写 */
  function guessOS() {
    var ua = navigator.userAgent || '';
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return { os: 'mobile' };
    if (/Win/i.test(plat) || /Windows/i.test(ua)) return { os: 'win', pkg: 'win-exe' };
    if (/Mac/i.test(plat) || /Mac OS X/i.test(ua)) return { os: 'mac', pkg: 'mac-arm' };
    if (/Linux|X11|CrOS/i.test(plat + ua)) return { os: 'linux', pkg: /Fedora|Red Hat|SUSE/i.test(ua) ? 'linux-rpm' : 'linux-deb' };
    return { os: 'other' };
  }
  function osLabel(os) {
    return os === 'win' ? L('下载 Windows 版', 'Get it for Windows') : os === 'mac' ? L('下载 macOS 版', 'Get it for macOS') : os === 'linux' ? L('下载 Linux 版', 'Get it for Linux') : L('下载桌面版', 'Get the desktop app');
  }

  /* ---------- 下载区：手机 / 电脑两张票切换，高度跟着动画 ---------- */
  function Switch(root, onSelect) {
    var self = this;
    this.root = root;
    this.btns = $$('[data-plat]', $('.dlswitch', root));
    this.ind = $('.dlswitch__ind', root);
    this.box = $('#dlPanes', root);
    this.panes = $$('.dlpane', this.box);
    this.cur = 'android';
    this.onSelect = onSelect;
    this.btns.forEach(function (b) {
      b.addEventListener('click', function () { self.set(b.getAttribute('data-plat'), false, true); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var i = (self.btns.indexOf(b) + d + self.btns.length) % self.btns.length;
        self.btns[i].focus();
        self.set(self.btns[i].getAttribute('data-plat'), false, true);
      });
    });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { self.fit(); });
      this.panes.forEach(function (p) { ro.observe(p); });
    }
    NP.onResize(function () { self.place(true); self.fit(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.place(true); self.fit(); });
  }
  Switch.prototype.set = function (plat, instant, user) {
    var self = this;
    var changed = plat !== this.cur;
    this.cur = plat;
    this.btns.forEach(function (b) {
      var on = b.getAttribute('data-plat') === plat;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    this.panes.forEach(function (p) {
      var on = p.getAttribute('data-plat') === plat;
      p.classList.toggle('is-on', on);
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
      p.inert = !on;
      if (on && changed) $$('[data-reveal]', p).forEach(function (r) { r.classList.add('is-in'); });
    });
    this.box.classList.toggle('is-instant', !!instant || NP.env.reduced);
    this.place(instant);
    this.fit();
    if (instant) requestAnimationFrame(function () { self.box.classList.remove('is-instant'); });
    if (user && this.onSelect) this.onSelect(plat);
  };
  Switch.prototype.place = function (instant) {
    var b = this.btns.filter(function (x) { return x.classList.contains('is-on'); })[0];
    if (!b || !this.ind || !b.offsetWidth) return;
    if (instant) this.ind.classList.add('is-jump');
    this.ind.style.width = b.offsetWidth + 'px';
    this.ind.style.translate = b.offsetLeft + 'px 0';
    if (instant) { void this.ind.offsetWidth; this.ind.classList.remove('is-jump'); }
  };
  Switch.prototype.fit = function () {
    var on = this.panes.filter(function (p) { return p.classList.contains('is-on'); })[0];
    if (on) this.box.style.height = on.offsetHeight + 'px';
  };

  /* 桌面端的票：先选系统，再选安装包；配色、图标与按钮文案跟着系统走 */
  var DOS = {
    win: { ic: '#i-win', to: L('你的 Windows', 'Your PC'), en: L('YOUR PC', '你的电脑'), first: 'win-exe' },
    mac: { ic: '#i-apple', to: L('你的 Mac', 'Your Mac'), en: L('YOUR MAC', '你的 Mac'), first: 'mac-arm' },
    linux: { ic: '#i-linux', to: L('你的 Linux', 'Your Linux box'), en: L('YOUR LINUX', '你的 Linux'), first: 'linux-appimage' },
  };
  var PKG_BTN = {
    'win-exe': L('下载 .exe 安装程序', 'Download the .exe installer'), 'win-msi': L('下载 .msi 安装包', 'Download the .msi package'),
    'mac-arm': L('下载 Apple Silicon 版', 'Download for Apple Silicon'), 'mac-x64': L('下载 Intel 版', 'Download for Intel Macs'),
    'linux-appimage': L('下载 AppImage', 'Download the AppImage'), 'linux-deb': L('下载 .deb 安装包', 'Download the .deb'), 'linux-rpm': L('下载 .rpm 安装包', 'Download the .rpm'),
  };
  function osOfPkg(k) { return k.indexOf('win') === 0 ? 'win' : k.indexOf('mac') === 0 ? 'mac' : 'linux'; }
  function initDeskTicket(desk) {
    var t = $('#ticketD');
    if (!t) return null;
    var seg = $$('[data-dos]', t);
    var ic = $('[data-dos-ic]', t);
    var to = $('[data-dos-to]', t);
    var en = $('[data-dos-en]', t);
    var label = $('#dlBtnDLabel');
    var cur = null;
    function setOS(os, pkg) {
      var o = DOS[os];
      if (!o) return;
      seg.forEach(function (b) { var on = b.getAttribute('data-dos') === os; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      if (os !== cur) {
        cur = os;
        t.setAttribute('data-os', os);
        if (ic) ic.setAttribute('href', o.ic);
        swap(to, o.to);
        swap(en, o.en);
      }
      var want = pkg || (osOfPkg(desk.current()) === os ? desk.current() : o.first);
      desk.pick(want);
      sync();
    }
    function sync() {
      var k = desk.current();
      if (label) swap(label, PKG_BTN[k] || L('下载安装包', 'Download'));
    }
    seg.forEach(function (b) { b.addEventListener('click', function () { setOS(b.getAttribute('data-dos')); }); });
    $$('input[name="dpkg"]').forEach(function (r) { r.addEventListener('change', sync); });
    return { setOS: setOS, sync: sync };
  }

  /* 首页按钮：电脑上默认推桌面版安装包，手机上推 APK，另一端放在下面一行 */
  var CTA = {
    win: { ic: '#i-win', label: L('下载 Windows 版', 'Download for Windows'), meta: L('.exe 安装程序 · 预览版', '.exe installer · preview'), plat: 'desktop', pkg: 'win-exe' },
    mac: { ic: '#i-apple', label: L('下载 macOS 版', 'Download for macOS'), meta: L('.dmg · Apple Silicon / Intel', '.dmg · Apple Silicon / Intel'), plat: 'desktop', pkg: 'mac-arm' },
    linux: { ic: '#i-linux', label: L('下载 Linux 版', 'Download for Linux'), meta: L('AppImage · .deb · .rpm', 'AppImage · .deb · .rpm'), plat: 'desktop', pkg: 'linux-appimage' },
    android: { ic: '#i-phone', label: L('下载 APK', 'Download the APK'), meta: L('Android 9+ · 免费', 'Android 9+ · free'), plat: 'android' },
  };
  function initCTA(g, sw, dt) {
    var key = g.os === 'win' || g.os === 'mac' || g.os === 'linux' ? g.os : 'android';
    var c = CTA[key];
    var btn = $('[data-cta]');
    if (btn) {
      var ic = $('[data-cta-ic]', btn);
      if (ic) ic.setAttribute('href', c.ic);
      $('[data-cta-label]', btn).textContent = c.label;
      $('[data-cta-meta]', btn).textContent = c.meta;
      btn.setAttribute('data-plat-go', c.plat);
      if (c.pkg) btn.setAttribute('data-pkg', g.pkg || c.pkg);
      btn.classList.add('is-' + key);
    }
    var alt = $('[data-cta-alt]');
    var altLink = $('[data-cta-alt-link]');
    if (alt && altLink && c.plat === 'desktop') {
      alt.textContent = L('手机上用：', 'On your phone: ');
      altLink.textContent = L('Android APK · 手机与平板 ↘', 'Android APK for phones & tablets ↘');
      altLink.setAttribute('data-plat-go', 'android');
    }
    $$('[data-plat-go]').forEach(function (a) {
      a.addEventListener('click', function () {
        var plat = a.getAttribute('data-plat-go');
        if (sw) sw.set(plat, true, true);
        var pkg = a.getAttribute('data-pkg');
        if (plat === 'desktop' && dt && pkg) dt.setOS(osOfPkg(pkg), pkg);
      });
    });
  }

  NP.github = {
    init: function () {
      var android = new Ticket({
        repo: REPO, cache: 'latest', radio: 'abi', fallback: 'arm64-v8a', any: 'universal', prefix: '',
        btn: '#dlBtn', size: '#dlSize', sha: '#dlSha', changes: '#dlChanges', classify: abiOf,
        label: function (k) { return k; },
        onRelease: function (r) {
          var rev = /-([0-9a-f]{7,})/i.exec(r.tag_name || '');
          setAll('rev', rev ? rev[1].slice(0, 7) : (r.tag_name || '—'));
          var dev = $('#devBtn b');
          if (dev && r.tag_name) swap(dev, r.tag_name);
        },
      });
      var desk = new Ticket({
        repo: DREPO, cache: 'd-latest', radio: 'dpkg', fallback: 'win-exe', prefix: 'd',
        btn: '#dlBtnD', size: '#dlSizeD', sha: '#dlShaD', changes: '#dlChangesD', classify: pkgOf,
        label: function (k) { return PKG_LABEL[k] || k; },
      });
      NP.github.android = android;
      NP.github.desktop = desk;

      var ua = navigator.userAgent || '';
      if (/Android/i.test(ua)) {
        if (/armv7|armeabi/i.test(ua)) android.pick('armeabi-v7a');
        else if (/x86_64/i.test(ua)) android.pick('x86_64');
        else if (/i686|x86/i.test(ua)) android.pick('x86');
      }
      var g = guessOS();
      var dt = initDeskTicket(desk);
      if (dt) dt.setOS(g.os === 'mac' || g.os === 'linux' ? g.os : 'win', g.pkg);
      var dl = $('#download');
      var sw = dl && $('.dlswitch', dl) ? new Switch(dl, function (plat) { (plat === 'desktop' ? desk : android).loadStats(true); }) : null;
      if (sw) sw.set(g.pkg ? 'desktop' : 'android', true);
      initCTA(g, sw, dt);
      $$('[data-desk-cta]').forEach(function (el) { swap(el, osLabel(g.os)); });
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']).then(function (v) {
          if (/Android/i.test(ua)) {
            if (v.architecture === 'arm' && v.bitness === '32') android.pick('armeabi-v7a');
            else if (v.architecture === 'x86') android.pick(v.bitness === '32' ? 'x86' : 'x86_64');
          } else if (g.os === 'mac' && v.architecture === 'x86') desk.pick('mac-x64');
        }).catch(function () {});
      }

      snapshot().then(function (data) { return data.repository; }).catch(function (error) {
        var hit = readCache('repo');
        if (hit && hit.v && integer(hit.v.stargazers_count) && integer(hit.v.forks_count)) return hit.v;
        throw error;
      }).then(function (repo) {
        if (repo && typeof repo.stargazers_count === 'number') setAll('stars', fmtCount(repo.stargazers_count));
        if (repo && typeof repo.forks_count === 'number') setAll('forks', fmtCount(repo.forks_count));
      }).catch(function () {});
      android.load();
      desk.load();
      android.apply();
      desk.apply();
    },
  };
})();
