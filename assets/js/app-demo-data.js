/* fictional local content shared by the website's simulated platform sessions */
(function () {
  'use strict';
  var NP = window.NP;
  var base = new URL('../', document.currentScript.src);
  var providers = ['netease', 'bilibili', 'youtube'];
  var sessions = {};
  var liked = new Set(), saved = new Set(), followed = new Set();
  var usage = ['demo-netease-night', 'demo-youtube-studio'];
  providers.forEach(function (provider) { sessions[provider] = { provider: provider, signedIn: true, simulated: true, name: 'Neri Line' }; });
  var trackRows = [
    ['startrail', '星轨', 'Startrail', 'NeriPlayer PV'],
    ['polaris', '北极星', 'Polaris', 'NeriPlayer PV'],
    ['paper-planets', '纸上行星', 'Paper Planets', 'Paper Planets'],
    ['low-orbit', '低轨道', 'Low Orbit', 'Low Orbit'],
    ['two-am', '凌晨两点', '2:00 AM', 'Night Notes'],
    ['rain-radio', '雨天电台', 'Rain Radio', 'Rain Radio'],
    ['cat-soda', '汽水猫', 'Cat Soda', 'Paper Planets'],
    ['goodnight-train', '晚安列车', 'Goodnight Train', 'Night Notes'],
    ['daylight-route', '日光航线', 'Daylight Route', 'Daylight Route'],
    ['seaside-signal', '海边信号', 'Seaside Signal', 'Seaside Signal']
  ];
  var playlistRows = [
    ['night', '星轨旅程', 'Startrail Journey', 'startrail', ['startrail', 'polaris', 'low-orbit', 'two-am', 'goodnight-train']],
    ['studio', 'Neri Line 创作选集', 'Neri Line Sessions', 'paper-planets', ['paper-planets', 'cat-soda', 'startrail', 'daylight-route']],
    ['discovery', '发现新的声音', 'New Discoveries', 'low-orbit', ['low-orbit', 'polaris', 'rain-radio', 'seaside-signal']],
    ['focus', '静下来，听一会儿', 'A Moment to Focus', 'rain-radio', ['rain-radio', 'two-am', 'paper-planets', 'startrail']],
    ['radar', '你的每日雷达', 'Your Daily Radar', 'cat-soda', ['cat-soda', 'polaris', 'daylight-route', 'goodnight-train']],
    ['coast', '沿着日光去海边', 'Daylight by the Sea', 'seaside-signal', ['seaside-signal', 'daylight-route', 'polaris', 'paper-planets']]
  ];
  function emit(kind, id) { document.dispatchEvent(new CustomEvent('np-demo-data', { detail: { kind: kind, id: id } })); }
  function track(id, provider) {
    var row = trackRows.find(function (entry) { return entry[0] === id; });
    if (!row) return null;
    var playable = id === 'startrail';
    return { id: id, name: NP.L(row[1], row[2]), title: NP.L(row[1], row[2]), titles: [row[1], row[2]], artist: 'Neri Line', artistId: 'neri-line', album: row[3], cover: new URL('img/covers/' + id + '.jpg', base).href, source: provider || 'demo', provider: provider || 'demo', simulated: true, kind: 'track', audio: playable ? new URL('audio/startrail.mp3', base).href : null, playable: playable, duration: playable ? 72.45 : null, audioSource: playable ? 'local' : null };
  }
  function tracks(provider) { return trackRows.map(function (row) { return track(row[0], provider); }); }
  function playlists(provider) {
    if (!provider) return providers.reduce(function (all, source) { return all.concat(playlists(source)); }, []);
    if (providers.indexOf(provider) < 0) return [];
    return playlistRows.map(function (row, index) {
      return { id: 'demo-' + provider + '-' + row[0], name: NP.L(row[1], row[2]), title: NP.L(row[1], row[2]), titles: [row[1], row[2]], description: NP.L('Neri Line 的本地演示选集，沿途收集一些安静又明亮的声音。', 'A local Neri Line demo collection, gathering quiet and bright sounds along the way.'), artist: 'Neri Line', creator: 'Neri Line', creatorId: 'neri-line', cover: track(row[3]).cover, source: provider, provider: provider, simulated: true, kind: 'playlist', trackIds: row[4].slice(), count: row[4].length, trackCount: row[4].length, playCount: 2100 + index * 1370, tags: Array.from({ length: 26 }, function (_, tag) { return tag; }).filter(function (tag) { return tag === 0 || tag % 6 === index; }) };
    });
  }
  function playlist(id) { return playlists().find(function (item) { return item.id === id; }) || null; }
  function artist(id, provider) {
    if (id !== 'neri-line') return null;
    return { id: id, name: 'Neri Line', title: 'Neri Line', titles: ['Neri Line'], artist: 'Neri Line', cover: track('startrail').cover, source: provider || 'netease', provider: provider || 'netease', simulated: true, kind: 'artist', description: NP.L('星轨、夜行与纸上行星。这里收录的是本地演示作品资料。', 'Startrails, night journeys and paper planets. This collection contains local demo work metadata.'), trackIds: trackRows.map(function (row) { return row[0]; }) };
  }
  function account(provider) { return sessions[provider] ? Object.assign({}, sessions[provider]) : null; }
  function setAccount(provider, signedIn) {
    if (!sessions[provider]) return null;
    sessions[provider].signedIn = !!signedIn;
    emit('account', provider);
    return account(provider);
  }
  function search(provider, type, query) {
    if (!sessions[provider] || !sessions[provider].signedIn) return [];
    var term = String(query || '').trim().toLowerCase();
    var items = type === 'playlist' ? playlists(provider) : type === 'artist' || type === 'creator' ? [artist('neri-line', provider)] : tracks(provider);
    return items.filter(function (item) {
      var content = [item.name, item.artist, item.album || ''].concat(item.titles || []);
      if (item.trackIds) item.trackIds.forEach(function (id) { var song = track(id); content = content.concat(song.titles, song.artist); });
      return content.join(' ').toLowerCase().indexOf(term) >= 0;
    }).map(function (item) {
      var result = Object.assign({}, item);
      if (result.kind === 'track' && (provider === 'bilibili' || type === 'video')) result.kind = 'video';
      return result;
    });
  }
  function browse(provider, tag) {
    if (!sessions[provider] || !sessions[provider].signedIn) return [];
    var all = playlists(provider), selected = Number(tag) || 0;
    return selected ? all.filter(function (item) { return item.tags.indexOf(selected) >= 0; }) : all;
  }
  function home(provider) {
    var source = provider || 'netease';
    if (!sessions[source] || !sessions[source].signedIn) return null;
    var collections = playlists(source);
    return { radar: ['startrail', 'polaris', 'paper-planets'].map(function (id) { return track(id, source); }), radarPlaylists: collections.slice(0, 3), trending: ['low-orbit', 'two-am', 'rain-radio'].map(function (id) { return track(id, source); }), recommended: collections, daily: ['cat-soda', 'daylight-route', 'seaside-signal'].map(function (id) { return track(id, source); }) };
  }
  function setMembership(store, id, on, kind) {
    var next = on === undefined ? !store.has(id) : !!on;
    if (next) store.add(id); else store.delete(id);
    emit(kind, id);
    return next;
  }
  NP.demoData = {
    account: account, setAccount: setAccount, tracks: tracks, track: track, playlists: playlists, playlist: playlist, artist: artist, home: home, browse: browse, search: search,
    isTrackLiked: function (id) { return liked.has(id); }, toggleTrackLike: function (id) { return setMembership(liked, id, undefined, 'liked'); },
    isPlaylistSaved: function (id) { return saved.has(id); }, savePlaylist: function (id, on) { return setMembership(saved, id, on, 'saved'); },
    isArtistFollowed: function (id) { return followed.has(id); }, followArtist: function (id, on) { return setMembership(followed, id, on, 'followed'); },
    usage: function () { return usage.slice(); }, use: function (id) { if (!playlist(id)) return; usage = [id].concat(usage.filter(function (key) { return key !== id; })).slice(0, 12); emit('usage', id); }, removeUsage: function (id) { usage = usage.filter(function (key) { return key !== id; }); emit('usage', id); }
  };
}());
