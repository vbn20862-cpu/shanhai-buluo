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
    if (!t) { t = newToken(); memToken = t; store(TOKEN_KEY, t); }
    return t;
  }
  /* 識別碼就是部落的鑰匙，要用猜不到的亂數（瀏覽器提供的安全亂數；太舊的瀏覽器才退回一般亂數） */
  function newToken() {
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789', out = 'p', i;   // 去掉容易看錯的 l、o、0、1，抄寫時比較不會錯
    try { var buf = new Uint8Array(24); window.crypto.getRandomValues(buf); for (i = 0; i < 24; i++) out += abc[buf[i] % 32]; }
    catch (e) { for (i = 0; i < 24; i++) out += abc[Math.floor(Math.random() * 32)]; }
    return out;
  }
  function validCode(c) { return typeof c === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(c); }
  function setToken(t) {   // 換成另一個部落的鑰匙；原本的留一份備用，萬一按錯還找得回來
    var old = store(TOKEN_KEY) || memToken; if (old && old !== t) store(TOKEN_KEY + '_prev', old);
    memToken = t; store(TOKEN_KEY, t);
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
    /* 伺服器只送有變動的部分，這裡把它們合併回完整的狀態再交給畫面：
     * villages 是完整的部落清單，vd／vx 是有變動與被移除的部落；me 是完整的自己，mp 是自己有變動的欄位；feedAdd 是新的消息 */
    var cur = null, pubList = [];
    function applyPubs(m) {
      if (m.villages) pubList = m.villages.slice();
      if (m.vx) pubList = pubList.filter(function (p) { return m.vx.indexOf(p.id) < 0; });
      if (m.vd) {
        var idx = {}; pubList.forEach(function (p, i) { idx[p.id] = i; });
        m.vd.forEach(function (p) { if (idx[p.id] != null) pubList[idx[p.id]] = p; else pubList.push(p); });
      }
      return pubList.slice();
    }
    socket.on('connect', function () {
      cur = null; pubList = [];   // 重新連上之後，伺服器會重新給一份完整的
      fire('status', { online: true, mode: mode });
      socket.emit('resume', { token: token() }, function (r) { r = r || {}; r.villages = applyPubs(r); fire('hello', r); });   // 伺服器認得就會接著送出部落狀態
    });
    socket.on('disconnect', function () { fire('status', { online: false, mode: mode }); });
    socket.on('state', function (s) {
      var list = applyPubs(s), k;
      if (s.me) cur = {};
      if (!cur) return;   // 還沒拿到完整的狀態，零碎的變動先不處理
      for (k in s) if (k !== 'mp' && k !== 'vd' && k !== 'vx' && k !== 'feedAdd' && k !== 'villages') cur[k] = s[k];
      if (s.mp) { var me = {}; for (k in cur.me) me[k] = cur.me[k]; for (k in s.mp) me[k] = s.mp[k]; cur.me = me; }
      if (s.feedAdd) cur.feed = (cur.feed || []).concat(s.feedAdd).slice(-30);
      cur.villages = list;
      var out = {}; for (k in cur) out[k] = cur[k];
      if (!s.tune) delete out.tune;   // 可調數值只在有新的時候才交給畫面
      fire('state', out);
    });
    socket.on('hello', function (h) { h.villages = applyPubs(h); fire('hello', h); });
  }

  return {
    on: on,
    mode: function () { return mode; },
    start: function () {
      if (window.io) {
        var m = /#t=([A-Za-z0-9_-]{16,64})$/.exec(location.hash || '');
        if (m) { setToken(m[1]); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; } }   // 用完就從網址上拿掉，免得被別人看到
        startOnline();
      } else startLocal();
    },
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
    /* 部落代碼：在另一臺裝置輸入，就能接回同一個部落。只有連線版有 */
    code: function () { return mode === 'online' ? token() : ''; },
    adopt: function (code, cb) {
      code = String(code || '').trim().replace(/^.*#t=/, '');   // 貼上整個連結也可以
      if (mode !== 'online') return cb({ ok: false, msg: '單機試玩沒有部落代碼' });
      if (!validCode(code)) return cb({ ok: false, msg: '代碼的格式不對，請再檢查一次' });
      if (code === token()) return cb({ ok: false, msg: '這就是這臺裝置現在的部落' });
      socket.emit('has', code, function (yes) {
        if (!yes) return cb({ ok: false, msg: '找不到這組代碼的部落' });
        setToken(code); cb({ ok: true });
        socket.disconnect(); socket.connect();   // 重新連線，伺服器就會把這臺裝置接到那個部落
      });
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
      else if (kind === 'pace') local.setTune({ pace: +on || 1 });   // 試試正式節奏的快慢
      else if (kind === 'bots') Object.keys(local.villages).forEach(function (id) {   // 讓示範部落有守軍，對戰才有東西可以打
        var o = local.villages[id]; if (!o.bot) return;
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
