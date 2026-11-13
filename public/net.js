/* 山海部落 — 連線層
 * 有伺服器（socket.io）時走多人連線；沒有時在瀏覽器裡跑同一套規則，當作單機試玩。 */
window.Net = (function () {
  'use strict';
  var handlers = {}, mode = null, socket = null, local = null, localId = null, memToken = null;
  var SAVE_KEY = 'shanhai_solo_v2', TOKEN_KEY = 'shanhai_token', RICH_KEY = 'shanhai_test_rich', rich = false;

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
    rich = store(RICH_KEY) === '1';
    local.ensureBots(now);
    localId = local.tokens.solo && local.villages[local.tokens.solo] ? local.tokens.solo : null;
    if (localId) local.setOnline(localId, true, now);   // 補算關掉網頁這段時間，並產生離線報告
    fire('status', { online: true, mode: mode });
    fire('hello', { villages: pubs(now), resumed: !!localId });
    var n = 0;
    setInterval(function () {
      var t = Date.now();
      fill(); local.tick(t); fill();
      if (localId) fire('state', local.snapshot(localId, t)); else fire('hello', { villages: pubs(t), resumed: false });
      if (++n % 10 === 0) save();
    }, 1000);
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(function () { return { world: JSON.stringify(local.toJSON()) }; });
  }
  function pubs(now) { return local.pubs(now); }
  function save() { store(SAVE_KEY, JSON.stringify(local.toJSON())); }
  // 測試工具（只有單機試玩有）：無限資源就是每次都把倉庫補滿
  function fill() {
    var v = rich && localId && local.villages[localId]; if (!v) return;
    var d = World.rules.derived(v, 1); v.res.food = d.cap; v.res.mat = d.cap;
    Tribes.playable().forEach(function (t) { v.sp[t.id] = d.spCap; });   // 連別族的特產也補滿，才能測試部落中心升級
  }

  // ----- 連線 -----
  function startOnline() {
    mode = 'online';
    socket = window.io({ transports: ['websocket', 'polling'] });
    socket.on('connect', function () {
      fire('status', { online: true, mode: mode });
      socket.emit('resume', { token: token() }, function (r) { fire('hello', r || { villages: [] }); });   // 伺服器認得就會接著送出部落狀態
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
        if (r.ok) { localId = r.id; local.setOnline(localId, true, now); save(); fire('state', local.snapshot(localId, now)); }
        cb(r);
      } else { o.token = token(); socket.emit('join', o, cb); }
    },
    act: function (a, cb) {
      cb = cb || function () {};
      if (mode === 'solo') {
        fill();
        var now = Date.now(), r = local.act(localId, a, now);
        fill(); fire('state', local.snapshot(localId, now)); cb(r);
      } else socket.emit('act', a, cb);
    },
    view: function (id, cb) {
      if (mode === 'solo') cb(local.detail(id, Date.now())); else socket.emit('view', id, cb);
    },
    testing: function () { return mode === 'solo' ? { rich: rich } : null; },
    test: function (kind, on) {   // 單機試玩的測試工具；連線版沒有這條路，伺服器不接受
      if (mode !== 'solo' || !localId) return;
      var v = local.villages[localId], now = Date.now();
      if (kind === 'rich') { rich = !!on; store(RICH_KEY, rich ? '1' : '0'); }
      else if (kind === 'finish') { v.queue.forEach(function (q) { q.doneAt = now; }); v.train.forEach(function (q) { q.doneAt = now; }); }
      else if (kind === 'march') local.marches.forEach(function (m) { if (m.from === localId && m.phase !== 'fight') m.arriveAt = now; });
      else if (kind === 'army') {
        var room = World.rules.armyCap(v) - (v.units.w + v.units.a + v.units.u + v.away.w + v.away.a + v.away.u + v.train.length);
        var nu = v.quest >= 4 ? Math.floor(room / 3) : 0;   // 已經解鎖獨特兵種的話，三種各補一些
        if (room > 0) { v.units.u += nu; v.units.w += Math.ceil((room - nu) / 2); v.units.a += Math.floor((room - nu) / 2); }
      }
      else if (kind === 'quest') {   // 把這一章的目標直接補到達成，再照正常規則領獎勵
        var p = local.questProgress(v), q = p && World.rules.QUESTS[p.i];
        if (q) {
          if (q.type === 'land') { for (var i = 0; i < v.land.length && v.land.filter(Boolean).length < q.n; i++) v.land[i] = v.land[i] || 1; }
          else if (q.type === 'have') v.res.food = Math.max(v.res.food, q.n);
          else if (q.type === 'trade') v.stat.trade = Math.max(v.stat.trade, q.n);
          else if (q.type === 'units') v.units.w = Math.max(v.units.w, q.n - v.units.a - v.units.u);
          else v.stat.point = Math.max(v.stat.point, q.n);
          local.act(localId, { type: 'quest' }, now);
        }
      }
      else if (kind === 'rest') { v.heroRest = 0; v.blessNext = 0; }
      else if (kind === 'bots') Object.keys(local.villages).forEach(function (id) {   // 讓示範部落有守軍，對戰才有東西可以打
        var o = local.villages[id]; if (!o.bot || o.battle) return;
        o.units.w += 3; o.units.a += 3; o.wall = Math.max(o.wall, 1); o.res.food = Math.max(o.res.food, 400); o.res.mat = Math.max(o.res.mat, 400);
      });
      fill(); local.tick(now); fill(); save(); fire('state', local.snapshot(localId, now));
    },
    reset: function () {   // 只有單機試玩可以重來
      if (mode !== 'solo') return;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 沒有存檔可清 */ }
      local = new World({ speed: 1 }); localId = null; local.ensureBots(Date.now());
      fire('hello', { villages: pubs(Date.now()), resumed: false, reset: true });
    }
  };
})();
