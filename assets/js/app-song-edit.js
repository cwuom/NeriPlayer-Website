/* edit information follows the native sheet slots and keeps changes inside the preview */
(function () {
  'use strict';
  var NP = window.NP, L = NP.L, baseline, swaps = new WeakMap(), transitions = new WeakMap();
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(name) { return name === 'save' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zM19 19H5V5h11.17L19 7.83V19zM12 12c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zM6 6h9v4H6z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function button(action, text, glyph, cls, attrs) { return '<button type="button" data-edit-action="' + action + '" class="' + (cls || 'np-edit-button') + '"' + (attrs ? ' ' + attrs : '') + '>' + (glyph ? icon(glyph) : '') + '<span>' + text + '</span></button>'; }
  function stamps(translation) {
    return (NP.LYRICS || []).map(function (line) { var text = translation ? line.tr : line.words.map(function (word) { return word.text; }).join(''); return text ? '[' + String(Math.floor(line.t / 60)).padStart(2, '0') + ':' + (line.t % 60).toFixed(2).padStart(5, '0') + ']' + text : ''; }).filter(Boolean).join('\n');
  }
  function field(key, label, value, restore) {
    return '<label class="np-edit-field"><span>' + label + '</span><input type="text" data-action-field="' + key + '" value="' + esc(value) + '"' + (key === 'title' ? ' required' : '') + '>' + (restore ? '<button type="button" data-edit-restore="' + key + '" aria-label="' + L('恢复', 'Restore') + label + '">' + icon('refresh') + '</button>' : key === 'keyword' ? '<button type="button" data-edit-action="search-submit" aria-label="' + L('搜索', 'Search') + '">' + icon('search') + '</button>' : '') + '</label>';
  }
  function header(title, action) { return '<header class="np-edit-header"><b>' + title + '</b>' + button(action || 'cancel', L('取消', 'Cancel')) + '</header>'; }
  function mainContent(s) {
    return header(L('编辑歌曲信息', 'Edit Song Info')) + '<div class="np-edit-body"><div class="np-edit-fields">' + field('cover', L('封面链接', 'Cover URL'), s.draft.cover, true) + '<div class="np-edit-cover-pane"><button class="np-edit-cover" type="button" data-edit-action="choose-cover" aria-label="' + L('修改封面', 'Edit cover') + '"><img src="' + esc(s.draft.cover || baseline.cover) + '" alt=""></button></div>' + field('title', L('歌曲名称', 'Title'), s.draft.title, true) + field('artist', L('歌手', 'Artist'), s.draft.artist, true) + button('lyrics', L('编辑歌词', 'Edit lyrics'), 'edit', 'np-edit-lyrics') + '</div></div><footer class="np-edit-actions">' + button('search', L('获取歌曲信息', 'Get song info'), 'search') + button('restore-all', L('恢复原始信息', 'Restore original'), 'refresh') + button('save', L('保存修改', 'Save changes'), 'save') + '</footer>';
  }
  function lyricsContent(s) {
    var labels = [L('原文', 'Original'), L('翻译', 'Translation'), L('音译', 'Romanization')];
    return header(L('编辑歌词', 'Edit lyrics'), 'main') + '<p class="np-edit-identity">' + esc(s.draft.title + ' · ' + s.draft.artist) + '</p><div class="np-edit-tabs" role="tablist" aria-label="' + L('歌词类型', 'Lyric type') + '">' + labels.map(function (label, i) { return '<button type="button" role="tab" data-edit-lyric-tab="' + i + '" aria-selected="' + (s.lyricTab === i) + '">' + label + '</button>'; }).join('') + '</div><textarea class="np-edit-lyrics-input" data-action-lyrics aria-label="' + labels[s.lyricTab] + '" placeholder="' + L('在此编辑歌词，支持 LRC 时间戳', 'Edit lyrics here, including LRC timestamps') + '">' + esc(s.lyrics[s.lyricTab]) + '</textarea><p class="np-edit-error" role="status"></p><footer class="np-edit-actions">' + button('lyrics-clear', L('清空', 'Clear')) + button('lyrics-paste', L('粘贴', 'Paste')) + button('lyrics-save', L('保存修改', 'Save changes')) + '</footer>';
  }
  function searchContent(s) {
    var results = NP.demoData ? s.platform === 'qq' ? NP.demoData.tracks().filter(function (item) { return [item.name, item.artist].concat(item.titles).join(' ').toLowerCase().indexOf(s.keyword.toLowerCase()) >= 0; }) : NP.demoData.search('netease', 'song', s.keyword) : [];
    return header(L('选择搜索结果', 'Select a result'), 'main') + field('keyword', L('搜索关键词', 'Search keywords'), s.keyword, false) + '<div class="np-edit-tabs" role="tablist" aria-label="' + L('音乐平台', 'Music platform') + '">' + [['netease', L('网易云', 'NetEase')], ['qq', 'QQ 音乐']].map(function (pair) { return '<button type="button" data-edit-platform="' + pair[0] + '" role="tab" aria-selected="' + (s.platform === pair[0]) + '">' + L(pair[1], pair[0] === 'qq' ? 'QQ Music' : pair[1]) + '</button>'; }).join('') + '</div><div class="np-edit-results">' + (results.length ? results.map(function (track) { return '<button type="button" class="np-edit-search-result" data-edit-result="' + track.id + '"><img src="' + track.cover + '" alt=""><span><b>' + esc(track.name) + '</b><small>' + esc(track.artist + ' · ' + track.album) + '</small></span></button>'; }).join('') : '<p>' + L('未找到匹配结果', 'No matching results') + '</p>') + '</div>';
  }
  function motion(s) {
    if (NP.env.reduced) return;
    s.chrome.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, delay: 90, fill: 'backwards', easing: 'cubic-bezier(.4,0,.2,1)' });
  }
  function render(s, view, animate) {
    s.view = view || 'main';
    s.el.dataset.editView = s.view;
    s.chrome.innerHTML = s.view === 'lyrics' ? lyricsContent(s) : s.view === 'search' ? searchContent(s) : mainContent(s);
    measure(s);
    if (animate !== false) motion(s);
    var cancel = s.chrome.querySelector('.np-edit-header button');
    if (cancel) cancel.focus({ preventScroll: true });
  }
  function measure(s) {
    var scale = 1, owner = s.ui.ph._previewOwner, app = owner && owner.host.querySelector('.app-preview') || document.querySelector('.app-preview');
    if (app) scale = Number(app.dataset.uiScale) || 1;
    var width = s.ui.ph.clientWidth / scale, height = s.ui.ph.clientHeight / scale;
    var compact = width < 600 && width > height && height < 480;
    s.el.style.setProperty('--np-edit-scale', scale);
    s.el.style.setProperty('--np-edit-action-size', width < 420 ? '11px' : '13px');
    s.el.classList.toggle('is-compact', compact);
    s.el.classList.toggle('is-short', compact && height < 240);
    s.el.classList.toggle('is-tiny', compact && height < 160);
  }
  function closeModal(s) {
    if (!s.modal) return;
    s.modal.remove(); s.modal = null; s.chrome.inert = false;
    s.el.setAttribute('aria-modal', 'true');
    if (s.modalOpener && s.modalOpener.isConnected) s.modalOpener.focus({ preventScroll: true });
  }
  function modal(s, title, body, apply, label, extras) {
    closeModal(s);
    s.modalOpener = document.activeElement;
    var m = document.createElement('div'); m.className = 'np-edit-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', title);
    m.innerHTML = '<div class="np-edit-modal-card"><h3>' + title + '</h3><div class="np-edit-modal-body">' + body + '</div><footer>' + button('modal-cancel', L('取消', 'Cancel')) + (extras || []).map(function (extra) { return button(extra.action, extra.label); }).join('') + button('modal-apply', label || L('确定', 'Confirm')) + '</footer></div>';
    m.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.editAction === 'modal-cancel') closeModal(s); else if (b.dataset.editAction === 'modal-apply') { if (apply(m) !== false) closeModal(s); } else { var extra = (extras || []).find(function (item) { return item.action === b.dataset.editAction; }); if (extra) extra.run(); } });
    s.chrome.inert = true; s.el.removeAttribute('aria-modal'); s.el.appendChild(m); s.modal = m;
    m.querySelector('button').focus({ preventScroll: true });
  }
  function returnMore(s) {
    closeModal(s);
    if (s.fileUrl && s.fileUrl !== (NP.previewTrack || {}).coverUrl) { URL.revokeObjectURL(s.fileUrl); s.fileUrl = ''; }
    s.ui.layers.show(s.ui.more, true);
  }
  function syncPhones() {
    (NP.phones.list || []).forEach(function (phone) { if (phone.cover) phone.cover.dirty = true; if (phone.page) phone.page.remeasureFor(520); });
    NP.player.emit();
  }
  function applyMeta(s) {
    var title = s.chrome.querySelector('[data-action-field="title"]');
    if (!s.draft.title.trim()) { title.reportValidity(); return; }
    var meta = NP.previewTrack || (NP.previewTrack = { offset: 0, lyricScale: 1, translationScale: 1 });
    if (meta.coverUrl && /^blob:/.test(meta.coverUrl) && meta.coverUrl !== s.draft.cover) URL.revokeObjectURL(meta.coverUrl);
    meta.title = s.draft.title.trim(); meta.artist = s.draft.artist.trim(); meta.coverUrl = s.draft.cover || baseline.cover;
    if (s.restoreLyrics) { NP.restorePreviewLyrics(); meta.romanizedLyrics = baseline.lyrics[2]; }
    document.querySelectorAll('.pc-id>b,.pl-top__id>b,.hm-mini__id>b,.ap-mini-open b').forEach(function (el) { el.textContent = meta.title; });
    document.querySelectorAll('.pc-id>span,.pl-top__id>span,.hm-mini__id>span,.ap-mini-open small').forEach(function (el) { el.textContent = meta.artist; });
    document.querySelectorAll('.pc-art>img,.pl-top>img,.hm-mini img,.ap-mini-open>img').forEach(function (img) { img.src = meta.coverUrl; });
    syncPhones(); returnMore(s);
  }
  function lyricText(s) {
    var rows = [];
    s.lyrics.slice(0, 2).forEach(function (text, type) { text.split(/\r?\n/).forEach(function (line, index) { var match = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line); if (match) rows.push({ t: Number(match[1]) * 60 + Number(match[2]), type: type, index: index, text: line }); }); });
    rows.sort(function (a, b) { return a.t - b.t || a.type - b.type || a.index - b.index; });
    return rows.map(function (row) { return row.text; }).join('\n');
  }
  function updateCover(s) { var image = s.chrome.querySelector('.np-edit-cover img'); if (image) image.src = s.draft.cover || baseline.cover; }
  function activate(s, action) {
    if (action === 'cancel') { returnMore(s); return; }
    if (action === 'main') { render(s); return; }
    if (action === 'save') {
      if (!s.draft.title.trim()) { s.chrome.querySelector('[data-action-field="title"]').reportValidity(); return; }
      modal(s, L('保存歌曲信息', 'Save song information'), '<p>' + L('是否同时写入本地歌曲文件？网页预览仅支持保存在应用中。', 'Write changes to the local audio file as well? This website preview supports saving in the app only.') + '</p>', function () { return false; }, L('写入本地文件', 'Write to local file'), [{ action: 'save-preview', label: L('仅保存在应用中', 'Save in app only'), run: function () { closeModal(s); applyMeta(s); } }]);
      s.modal.querySelector('[data-edit-action="modal-apply"]').disabled = true;
      return;
    }
    if (action === 'restore-all') { s.draft = Object.assign({}, baseline); s.lyrics = baseline.lyrics.slice(); s.restoreLyrics = true; render(s); return; }
    if (action === 'lyrics') { if (!s.restoreLyrics) s.lyrics = [stamps(false), stamps(true), (NP.previewTrack || {}).romanizedLyrics || '']; s.lyricTab = 0; render(s, 'lyrics'); return; }
    if (action === 'lyrics-clear') { s.lyrics[s.lyricTab] = ''; s.chrome.querySelector('[data-action-lyrics]').value = ''; return; }
    if (action === 'lyrics-paste') { if (navigator.clipboard) navigator.clipboard.readText().then(function (text) { if (s.view !== 'lyrics') return; s.lyrics[s.lyricTab] = text; s.chrome.querySelector('[data-action-lyrics]').value = text; }).catch(function () { s.chrome.querySelector('.np-edit-error').textContent = L('请在文本框中粘贴歌词', 'Paste lyrics into the text field'); }); return; }
    if (action === 'lyrics-save') {
      var text = lyricText(s);
      if (!text && s.lyrics.slice(0, 2).some(function (value) { return value.trim(); })) { s.chrome.querySelector('.np-edit-error').textContent = L('请输入有效的 LRC 时间戳歌词', 'Enter valid timestamped LRC lyrics'); return; }
      if (!NP.setPreviewLyrics(text, { allowEmpty: true })) { s.chrome.querySelector('.np-edit-error').textContent = L('请输入有效的 LRC 时间戳歌词', 'Enter valid timestamped LRC lyrics'); return; }
      (NP.previewTrack || (NP.previewTrack = {})).romanizedLyrics = s.lyrics[2]; s.restoreLyrics = false; syncPhones(); render(s); return;
    }
    if (action === 'search') { s.keyword = s.draft.title; s.platform = 'netease'; render(s, 'search'); return; }
    if (action === 'search-submit') { render(s, 'search'); return; }
    if (action === 'choose-cover') {
      modal(s, L('修改封面', 'Edit cover'), '<p>' + L('从图片中选择封面', 'Choose a cover from your images') + '</p>', function () { s.file.value = ''; s.file.click(); return true; }, L('选择图片', 'Choose image'));
    }
  }
  function bind(s) {
    s.el.addEventListener('input', function (event) {
      var key = event.target.dataset.actionField;
      if (key === 'keyword') { s.keyword = event.target.value; return; }
      if (key) { s.draft[key] = event.target.value; if (key === 'cover') updateCover(s); }
      if (event.target.matches('[data-action-lyrics]')) s.lyrics[s.lyricTab] = event.target.value;
    });
    s.el.addEventListener('keydown', function (event) {
      if (s.ui.layers.open !== s.layer) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (s.modal) closeModal(s); else if (s.view !== 'main') render(s); else returnMore(s); }
      if (event.key === 'Enter' && event.target.matches('[data-action-field="keyword"]')) { event.preventDefault(); render(s, 'search'); }
      if (s.modal && event.key === 'Tab') {
        var controls = Array.from(s.modal.querySelectorAll('input,button')), first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); event.stopPropagation(); (event.shiftKey ? last : first).focus({ preventScroll: true }); }
      }
    });
    s.el.addEventListener('click', function (event) {
      if (s.modal && s.modal.contains(event.target)) return;
      var b = event.target.closest('button'); if (!b) return;
      if (b.dataset.editRestore) { var key = b.dataset.editRestore; s.draft[key] = baseline[key]; s.chrome.querySelector('[data-action-field="' + key + '"]').value = baseline[key]; if (key === 'cover') updateCover(s); return; }
      if (b.dataset.editLyricTab != null) { s.lyricTab = Number(b.dataset.editLyricTab); render(s, 'lyrics'); return; }
      if (b.dataset.editPlatform) { s.platform = b.dataset.editPlatform; render(s, 'search'); return; }
      if (b.dataset.editResult) {
        var item = NP.demoData.track(b.dataset.editResult);
        modal(s, L('选择填充内容', 'Choose information to fill'), '<p>' + esc(item.name + ' · ' + item.artist) + '</p>' + [['cover', L('封面', 'Cover')], ['title', L('歌曲名称', 'Title')], ['artist', L('歌手', 'Artist')], ['lyrics', L('歌词', 'Lyrics')]].map(function (pair) { return '<label class="np-edit-choice"><span>' + pair[1] + '</span><input type="checkbox" data-edit-fill="' + pair[0] + '" checked></label>'; }).join(''), function (m) { Array.from(m.querySelectorAll('[data-edit-fill]:checked')).forEach(function (input) { var key = input.dataset.editFill; if (key === 'lyrics') { if (item.id === 'startrail') { s.lyrics = baseline.lyrics.slice(); NP.restorePreviewLyrics(); } } else s.draft[key] = key === 'title' ? item.name : item[key]; }); closeModal(s); render(s); return true; });
        return;
      }
      activate(s, b.dataset.editAction);
    });
    s.file.addEventListener('change', function () { var file = s.file.files[0]; if (!file || !/^image\//.test(file.type)) return; if (s.fileUrl) URL.revokeObjectURL(s.fileUrl); s.fileUrl = URL.createObjectURL(file); s.draft.cover = s.fileUrl; var input = s.chrome.querySelector('[data-action-field="cover"]'); if (input) input.value = s.fileUrl; updateCover(s); });
    s.resize = new ResizeObserver(function () { measure(s); }); s.resize.observe(s.ui.ph);
  }
  NP.songEdit = {
    prepareSwap: function (from, to) {
      var token = { from: from, to: to, snapshot: null };
      if (!NP.env.reduced) {
        var snapshot = from.el.cloneNode(true);
        snapshot.classList.add('np-edit-snapshot'); snapshot.inert = true; snapshot.setAttribute('aria-hidden', 'true');
        snapshot.removeAttribute('role'); snapshot.removeAttribute('aria-modal');
        [snapshot].concat(Array.from(snapshot.querySelectorAll('*'))).forEach(function (el) { Array.from(el.attributes).forEach(function (attr) { if (/^(id|name|data-)/.test(attr.name)) el.removeAttribute(attr.name); }); });
        snapshot.style.cssText += ';left:' + from.el.offsetLeft + 'px;top:' + from.el.offsetTop + 'px;width:' + from.el.offsetWidth + 'px;height:' + from.el.offsetHeight + 'px;bottom:auto;transform:none;transition:none;z-index:13;pointer-events:none';
        from.el.parentNode.appendChild(snapshot); token.snapshot = snapshot;
        snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards', easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(function () { snapshot.remove(); }).catch(function () { snapshot.remove(); });
      }
      [from.el, to.el].forEach(function (el) { if (!transitions.has(el)) transitions.set(el, el.style.transition); swaps.set(el, token); el.style.transition = 'none'; });
      return token;
    },
    cancelSwap: function (token) {
      if (token.snapshot) token.snapshot.remove();
      [token.from.el, token.to.el].forEach(function (el) { if (swaps.get(el) === token) { el.style.transition = transitions.get(el) || ''; swaps.delete(el); transitions.delete(el); } });
    },
    finishSwap: function (token) {
      token.to.el.getBoundingClientRect();
      [token.from.el, token.to.el].forEach(function (el) { if (swaps.get(el) === token) { el.style.transition = transitions.get(el) || ''; swaps.delete(el); transitions.delete(el); } });
      if (!NP.env.reduced) {
        var content = token.to.el.querySelector('.np-edit-chrome,.msheet__body');
        if (content) content.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, delay: 90, fill: 'backwards', easing: 'cubic-bezier(.4,0,.2,1)' });
      }
    },
    open: function (ui) {
      if (!baseline) { var img = document.querySelector('#phPlay .pc-art>img'); baseline = { title: L('星轨', 'Startrail'), artist: 'Neri Line', cover: img.src, lyrics: [stamps(false), stamps(true), ''], lyricsText: NP.previewLyricsText() }; }
      var s = ui.songEdit;
      if (!s) {
        var el = document.createElement('div'); el.className = 'msheet np-song-edit'; el.setAttribute('aria-label', L('编辑歌曲信息', 'Edit Song Info')); el.innerHTML = '<i class="msheet__grab"></i><div class="np-edit-scale"><div class="np-edit-chrome"></div></div><input type="file" accept="image/*" data-action-cover hidden tabindex="-1">'; ui.ph.insertBefore(el, ui.ph.querySelector('.ph__gesture'));
        s = ui.songEdit = { ui: ui, el: el, chrome: el.querySelector('.np-edit-chrome'), file: el.querySelector('[data-action-cover]'), lyricTab: 0 };
        bind(s);
        s.layer = { el: el, editPage: true, parentPage: ui.more, onShow: function () { measure(s); var cancel = s.chrome.querySelector('.np-edit-header button'); if (cancel) cancel.focus({ preventScroll: true }); }, onHide: function () { closeModal(s); if (s.fileUrl && s.fileUrl !== (NP.previewTrack || {}).coverUrl) { URL.revokeObjectURL(s.fileUrl); s.fileUrl = ''; } } };
      }
      var meta = NP.previewTrack || {};
      s.draft = { title: meta.title || baseline.title, artist: meta.artist || baseline.artist, cover: meta.coverUrl || baseline.cover };
      s.restoreLyrics = false;
      s.lyrics = [stamps(false), stamps(true), meta.romanizedLyrics || ''];
      render(s, 'main', false); ui.layers.show(s.layer, true);
    }
  };
}());
