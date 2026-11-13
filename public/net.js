/* 山海部落 — 連線層
 * 有伺服器（socket.io）時走多人連線；沒有時在瀏覽器裡跑同一套規則，當作單機試玩。 */
window.Net = (function () {
  'use strict';
  var handlers = {}, mode = null, socket = null, local = null, localId = null, memToken = null;
  var SAVE_KEY = 'shanhai_solo_v1', TOKEN_KEY = 'shanhai_token';

  function on(ev, fn) { handlers[ev] = fn; }
  function fire(ev, d) { if (handlers[ev]) handlers[ev](d); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function token() {
    var t = store(TOKEN_KEY) || memToken;
    if (!t) {
      t = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      memToken = t; store(TOKEN_KEY, t);
    }
    return t;
  }

  // ----- 單機 -----
  function startLocal() {
    mode = 'solo';
    local = new World({ speed: 1 });
    var saved = store(SAVE_KEY);
    if (!saved && window.claude && window.claude.hot && window.claude.hot.data && window.claude.hot.data.world) saved = window.claude.hot.data.world;
    if (saved) { try { local.load(JSON.parse(saved)); } catch (e) { /* 壞掉的存檔就重新開始 */ } }
    var now = Date.now();
    local.ensureBots(now);
    localId = local.tokens.solo && local.villages[local.tokens.solo] ? local.tokens.solo : null;
    if (localId) local.villages[localId].online = true;
    fire('status', { online: true, mode: mode });
    fire('hello', { villages: pubs(now), resumed: !!localId });
    var n = 0;
    setInterval(function () {
      var t = Date.now();
      local.tick(t);
      if (localId) fire('state', local.snapshot(localId, t)); else fire('hello', { villages: pubs(t), resumed: false });
      if (++n % 10 === 0) save();
    }, 1000);
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(function () { return { world: JSON.stringify(local.toJSON()) }; });
  }
  function pubs(now) { return Object.keys(local.villages).map(function (k) { return local.pub(local.villages[k], now); }); }
  function save() { store(SAVE_KEY, JSON.stringify(local.toJSON())); }

  // ----- 連線 -----
  function startOnline() {
    mode = 'online';
    socket = window.io({ transports: ['websocket', 'polling'] });
    socket.on('connect', function () {
      fire('status', { online: true, mode: mode });
      socket.emit('resume', { token: token() }, function (r) { fire('hello', r || { villages: [] }); });
    });
    socket.on('disconnect', function () { fire('status', { online: false, mode: mode }); });
    socket.on('state', function (s) { fire('state', s); });
    socket.on('hello', function (h) { fire('hello', h); });
  }

  return {
    on: on,
    mode: function () { return mode; },
    start: function () { if (window.io) startOnline(); else startLocal(); },
    join: function (o, cb) {
      if (mode === 'solo') {
        var now = Date.now(), r = local.join('solo', o, now);
        if (r.ok) { localId = r.id; local.villages[localId].online = true; save(); fire('state', local.snapshot(localId, now)); }
        cb(r);
      } else { o.token = token(); socket.emit('join', o, cb); }
    },
    act: function (a, cb) {
      cb = cb || function () {};
      if (mode === 'solo') {
        var now = Date.now(), r = local.act(localId, a, now);
        fire('state', local.snapshot(localId, now)); cb(r);
      } else socket.emit('act', a, cb);
    },
    view: function (id, cb) {
      if (mode === 'solo') cb(local.detail(id, Date.now())); else socket.emit('view', id, cb);
    },
    reset: function () {   // 只有單機試玩可以重來
      if (mode !== 'solo') return;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 沒有存檔可清 */ }
      local = new World({ speed: 1 }); localId = null; local.ensureBots(Date.now());
      fire('hello', { villages: pubs(Date.now()), resumed: false, reset: true });
    }
  };
})();
