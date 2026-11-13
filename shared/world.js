/* 山海部落 — 遊戲規則與世界模擬
 * 伺服器用它當唯一的裁判；單機試玩版在瀏覽器裡跑同一份程式。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'), require('./tribes.js'));
  else root.World = factory(root.Geo, root.Tribes);
})(typeof self !== 'undefined' ? self : this, function (Geo, Tribes) {
  'use strict';

  // ---------- 規則數值 ----------
  // 建地：部落中央是廣場與部落中心，外面三圈是可以蓋建築的位置（地面座標，畫面再轉成斜視角）。
  // 第 0 圈一開始就是開墾好的；第 1、2 圈是山林，要拓荒之後才能蓋。
  var SITES = (function () {
    var out = [{ x: 20, y: 20, ring: 0 }];
    [[6, 4.6, 0.5], [10, 8.8, 0.2], [12, 13.0, 0.05]].forEach(function (r, ri) {
      for (var i = 0; i < r[0]; i++) {
        var a = i / r[0] * Math.PI * 2 + r[2], rad = r[1] + ((i * 7 + ri * 3) % 5 - 2) * 0.16;
        out.push({ x: +(20 + rad * Math.cos(a)).toFixed(2), y: +(20 + rad * Math.sin(a)).toFixed(2), ring: ri });
      }
    });
    out.forEach(function (s, i) {
      s.near = [];
      out.forEach(function (o, j) { if (i !== j && Math.hypot(s.x - o.x, s.y - o.y) <= 6.2) s.near.push(j); });
    });
    return out;
  })();
  var TILE_N = SITES.length, CENTER_TILE = 0;
  var CLEAR = { 1: { food: 25, time: 12, gain: 15, center: 1 }, 2: { food: 60, time: 25, gain: 35, center: 2 } };   // 拓荒：花糧食與時間，清出來的木石變成建材
  var MULT = [1, 2.2, 4, 7, 11], TMULT = [1, 2, 3.5, 5.5, 8], MAX_LEVEL = 5;
  var TYPES = ['house', 'farm', 'mat', 'special', 'storage', 'barracks', 'tower'];
  var DEF = {
    house: { base: { food: 15, mat: 40 }, time: 8 },
    farm: { base: { food: 0, mat: 35 }, time: 8 },
    mat: { base: { food: 35, mat: 0 }, time: 8 },
    special: { base: { food: 60, mat: 60 }, time: 14 },
    storage: { base: { food: 30, mat: 70 }, time: 12 },
    barracks: { base: { food: 80, mat: 80 }, time: 16 },
    tower: { base: { food: 20, mat: 90 }, time: 14 },
    wall: { base: { food: 0, mat: 70 }, time: 12 }
  };
  // 部落中心升級：除了糧食與建材，還需要「別族的特產」，鼓勵交易與往來
  var CENTER_UP = {
    2: { food: 150, mat: 150, time: 20, kinds: 0, each: 0 },
    3: { food: 400, mat: 400, time: 45, kinds: 1, each: 5 },
    4: { food: 900, mat: 900, time: 90, kinds: 2, each: 8 },
    5: { food: 1800, mat: 1800, time: 150, kinds: 3, each: 12 }
  };
  var UNIT = {
    w: { zh: '勇士', atk: 10, hp: 30, cost: { food: 30, mat: 0 }, time: 5 },
    a: { zh: '弓手', atk: 12, hp: 18, cost: { food: 20, mat: 20 }, time: 5 }
  };
  var RATE = { food: 0.35, mat: 0.35, special: 0.03 };   // 每位族人每秒
  var FOREIGN_SP = false;   // 階段 4 加入交易後改成 true：部落中心升級要用別族的特產
  var OFFLINE_MAX = 8 * 3600000;
  var BUILDERS = 2, SHIELD_MS = 300000, NEWBIE_MS = 600000, OFFER_MS = 600000;
  // 對戰：正門、山徑、溪谷三路，共三個階段；每階段雙方各下一個指令
  var LANES = ['正門', '山徑', '溪谷'], LANE_KEYS = ['even', 'gate', 'path', 'valley'];
  var CMDS = { charge: '衝鋒', volley: '掩護射擊', hold: '重整' };
  var PREP_MS = 6000, PICK_MS = 12000, SHOW_MS = 4000, PHASES = 3;
  var LOOT_FRAC = [0, 0.10, 0.25, 0.40];   // 攻破 0、1、2、3 路時，帶走對方可被拿走物資的比例
  var BOT_NAMES = {
    atayal: ['霧林部落', '溪谷部落'], bunun: ['雲海部落', '楓林部落'],
    amis: ['浪花部落', '月桃部落'], paiwan: ['晨曦部落', '山風部落']
  };
  var PHRASES = { hello: 1, thanks: 1, trade: 1, ally: 1, cheer: 1, nice: 1 };

  function r5(n) { return Math.round(n / 5) * 5; }
  function cost(type, level) {
    if (type === 'center') { var c = CENTER_UP[level]; return c ? { food: c.food, mat: c.mat } : null; }
    var d = DEF[type], m = MULT[level - 1];
    return { food: r5(d.base.food * m), mat: r5(d.base.mat * m) };
  }
  function buildTime(type, level) {
    if (type === 'center') return CENTER_UP[level].time;
    return Math.round(DEF[type].time * TMULT[level - 1]);
  }
  function limit(type, C) {
    switch (type) {
      case 'house': case 'farm': case 'mat': return C + 1;
      case 'special': case 'storage': return 1 + Math.floor(C / 2);
      case 'barracks': return 1;
      case 'tower': return Math.max(0, C - 1);
    }
    return 0;
  }
  function centerLevel(v) { return v.tiles[CENTER_TILE].level; }
  function count(v, type) { var n = 0; for (var i = 0; i < TILE_N; i++) if (v.tiles[i] && v.tiles[i].type === type) n++; return n; }
  function sumLevels(v, type) { var n = 0; for (var i = 0; i < TILE_N; i++) if (v.tiles[i] && v.tiles[i].type === type) n += v.tiles[i].level; return n; }
  function levelsOf(v, type) { var a = []; for (var i = 0; i < TILE_N; i++) if (v.tiles[i] && v.tiles[i].type === type && v.tiles[i].level > 0) a.push(v.tiles[i].level); return a; }
  function popCap(v) { var n = 4; levelsOf(v, 'house').forEach(function (l) { n += 1 + 2 * l; }); return n; }
  function slots(v) { return { food: sumLevels(v, 'farm') * 2, mat: sumLevels(v, 'mat') * 2, special: sumLevels(v, 'special') * 2 }; }
  function caps(v) {
    var C = centerLevel(v), st = sumLevels(v, 'storage');
    return { res: 300 + 200 * C + 400 * st, sp: 20 + 20 * C + 20 * st, protect: 50 * C + 100 * st };
  }
  function armyCap(v) { return sumLevels(v, 'barracks') * 6; }
  function armyTotal(v) { return v.units.w + v.units.a + v.away.w + v.away.a + v.train.length; }
  function rates(v, speed) {
    var s = slots(v), t = Tribes.get(v.tribe), b = t && t.bonus, out = {};
    ['food', 'mat', 'special'].forEach(function (k) {
      var m = b && b.key === k ? b.mult : 1;
      out[k] = Math.min(v.jobs[k], s[k]) * RATE[k] * m * speed;
    });
    return out;
  }
  function foreignKinds(v) { var n = 0; for (var k in v.sp) if (k !== v.tribe && v.sp[k] >= 1) n++; return n; }
  function prosperity(v) {
    var p = 0;
    for (var i = 0; i < TILE_N; i++) { if (v.tiles[i]) p += v.tiles[i].level * (v.tiles[i].type === 'center' ? 30 : 10); if (v.land[i] && SITES[i].ring > 0) p += 3; }
    return Math.round(p + v.wall * 10 + v.pop * 3 + foreignKinds(v) * 15 + Math.min(40, v.gifts * 2));
  }
  function derived(v, speed) {
    var c = caps(v);
    return { cap: c.res, spCap: c.sp, protect: c.protect, slots: slots(v), rates: rates(v, speed), popCap: popCap(v),
      armyCap: armyCap(v), builders: BUILDERS, prosperity: prosperity(v), center: centerLevel(v) };
  }
  /* 這塊地能不能拓荒：要是山林、緊鄰已開墾的地、部落中心等級夠、有空的工程名額、糧食夠 */
  function clearInfo(v, i) {
    var s = SITES[i], out = { ok: false, why: '' };
    if (!s || v.land[i]) { out.why = '這裡已經開墾過了'; return out; }
    var c = CLEAR[s.ring]; out.food = c.food; out.time = c.time; out.gain = c.gain;
    if (v.queue.some(function (q) { return q.type === 'clear' && q.tile === i; })) out.why = '正在拓荒';
    else if (!s.near.some(function (j) { return v.land[j]; })) out.why = '要從已經開墾的地方往外拓荒';
    else if (centerLevel(v) < c.center) out.why = 'center';
    else if (v.queue.length >= BUILDERS) out.why = '同時只能進行 ' + BUILDERS + ' 項工程';
    else if (v.res.food < c.food) out.why = '糧食不足';
    else out.ok = true;
    return out;
  }
  function getRes(v, k) { return k === 'food' || k === 'mat' ? v.res[k] : (v.sp[k.slice(3)] || 0); }
  function addRes(v, k, n) {
    if (k === 'food' || k === 'mat') v.res[k] = Math.max(0, v.res[k] + n);
    else { var id = k.slice(3); v.sp[id] = Math.max(0, (v.sp[id] || 0) + n); if (v.sp[id] < 1e-9) delete v.sp[id]; }
  }
  function validKey(k) { return k === 'food' || k === 'mat' || (typeof k === 'string' && k.slice(0, 3) === 'sp:' && !!Tribes.get(k.slice(3))); }
  function resName(k, tribeId) {
    if (k === 'food') return '糧食'; if (k === 'mat') return '建材';
    var t = Tribes.get(k.slice(3)); return t && t.sp ? t.sp.zh : '特產';
  }
  function can(v, c) { return v.res.food >= c.food && v.res.mat >= c.mat; }
  function pay(v, c) { v.res.food -= c.food; v.res.mat -= c.mat; }
  function clean(s, max) { return String(s == null ? '' : s).replace(/[<>&"'`\\\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
  function int(n) { n = Math.floor(Number(n)); return isFinite(n) ? n : 0; }

  // ---------- 對戰規則 ----------
  // 不呈現傷亡細節：失去戰力的單位一律視為「負傷撤退」。
  /* 把 n 個人分到三路。even：平均；gate / path / valley：一半守（攻）那一路，其餘平分 */
  function split(n, key) {
    var main = LANE_KEYS.indexOf(key) - 1, out = [0, 0, 0], i;
    if (main < 0) { for (i = 0; i < n; i++) out[i % 3]++; return out; }
    out[main] = Math.ceil(n / 2);
    for (i = 0; i < n - out[main]; i++) out[(main + 1 + i % 2) % 3]++;
    return out;
  }
  /* 我方下 mine、對方下 theirs 時，我方承受傷害的倍率。衝鋒怕掩護射擊；重整能躲掉掩護射擊，但擋不住衝鋒 */
  function taken(mine, theirs) {
    if (mine === 'charge') return theirs === 'volley' ? 1.5 : 1;
    if (mine === 'hold') return theirs === 'volley' ? 0.4 : theirs === 'charge' ? 0.9 : 0.6;
    return 1;
  }
  function output(w, a, cmd) {
    var o = w * UNIT.w.atk * (cmd === 'charge' ? 1.5 : 1) + a * UNIT.a.atk * (cmd === 'volley' ? 1.5 : 1);
    return cmd === 'hold' ? o * 0.6 : o;
  }
  function hit(side, dmg) {   // side: {w, a, pool, lostW, lostA}；勇士在前面先承受
    side.pool += dmg;
    while (side.w > 0 && side.pool >= UNIT.w.hp) { side.w--; side.lostW++; side.pool -= UNIT.w.hp; }
    if (side.w === 0) while (side.a > 0 && side.pool >= UNIT.a.hp) { side.a--; side.lostA++; side.pool -= UNIT.a.hp; }
    if (side.w + side.a === 0) side.pool = 0;
  }
  function rally(side) {      // 重整：這一路負傷的人有四分之一歸隊
    var bw = Math.floor(side.lostW / 4), ba = Math.floor(side.lostA / 4);
    side.w += bw; side.lostW -= bw; side.a += ba; side.lostA -= ba;
    return bw + ba;
  }
  /* 打一個階段。b.lanes[i] = {a: 攻方, d: 守方, broken}；回傳這個階段的紀錄 */
  function fightPhase(b, ca, cd, rng) {
    var open = b.lanes.filter(function (l) { return !l.broken && l.a.w + l.a.a > 0; }).length || 1;
    var rec = { phase: b.phase, a: ca, d: cd, lanes: [] };
    b.lanes.forEach(function (l, i) {
      var before = { aw: l.a.w, aa: l.a.a, dw: l.d.w, da: l.d.a }, r = { i: i, broken: false, backA: 0, backD: 0 };
      if (!l.broken && l.a.w + l.a.a > 0) {
        if (ca === 'hold') r.backA = rally(l.a);
        if (cd === 'hold') r.backD = rally(l.d);
        var outA = output(l.a.w, l.a.a, ca) * (0.92 + rng() * 0.16);
        var outD = (output(l.d.w, l.d.a, cd) * (1 + b.wall * 0.08) + b.towers / open) * (0.92 + rng() * 0.16);
        hit(l.a, outD * taken(ca, cd)); hit(l.d, outA * taken(cd, ca));
        if (l.d.w + l.d.a === 0 && l.a.w + l.a.a > 0) { l.broken = true; r.broken = true; }
      }
      r.aLost = before.aw + before.aa + r.backA - l.a.w - l.a.a; r.dLost = before.dw + before.da + r.backD - l.d.w - l.d.a;
      rec.lanes.push(r);
    });
    // 攻破一路後，那一路的人下個階段轉去支援還在打的路
    b.lanes.forEach(function (l) {
      if (!l.broken || l.moved || l.a.w + l.a.a === 0) return;
      var target = b.lanes.filter(function (o) { return !o.broken; }).sort(function (x, y) { return (x.d.w + x.d.a) - (y.d.w + y.d.a); })[0];   // 去守軍最少的那一路
      if (target) { target.a.w += l.a.w; target.a.a += l.a.a; l.a.w = 0; l.a.a = 0; }
      l.moved = true;
    });
    return rec;
  }

  // ---------- 世界 ----------
  function World(opts) {
    opts = opts || {};
    this.speed = opts.speed || 1;
    this.reportAfter = opts.reportAfter == null ? 60000 : opts.reportAfter;   // 離開多久以上才顯示離線報告
    this.newbieMs = opts.newbieMs == null ? NEWBIE_MS : opts.newbieMs;         // 新部落受保護多久
    this.rng = opts.rng || Math.random;
    this.map = Geo.build();
    this.villages = {}; this.tokens = {}; this.marches = []; this.market = []; this.feed = []; this.alliances = {};
    this.battles = {}; this.stats = {};
    this.seq = 1; this.lastBot = 0;
  }
  World.prototype.id = function (p) { return p + (this.seq++).toString(36); };
  World.prototype.log = function (text, now, kind) {
    this.feed.push({ id: this.seq++, t: now, kind: kind || 'info', text: text });
    if (this.feed.length > 60) this.feed.splice(0, this.feed.length - 60);
  };
  // 一格可以住好幾個部落（Geo.SLOTS 個）；回傳每格已用掉的位置
  World.prototype.hexSlots = function () {
    var m = {};
    for (var id in this.villages) { var v = this.villages[id]; (m[v.hex] = m[v.hex] || {})[v.slot || 0] = id; }
    return m;
  };
  World.prototype.pickHex = function (tribe, prefer) {
    var used = this.hexSlots(), byId = this.map.byId, self = this;
    function n(h) { return used[h] ? Object.keys(used[h]).length : 0; }
    var list = (this.map.regions[tribe] || []).filter(function (h) { return n(h) < Geo.SLOTS; });
    if (!list.length) return null;
    var hex;
    if (prefer && list.indexOf(prefer) >= 0) hex = prefer;
    else if (prefer && byId[prefer]) {   // 選的格子滿了，挑同區最近的
      var p = byId[prefer];
      hex = list.slice().sort(function (a, b) { return Geo.hexDist(p, byId[a]) - Geo.hexDist(p, byId[b]); })[0];
    } else {   // 沒指定就挑人最少的格子
      var min = Math.min.apply(null, list.map(n)), least = list.filter(function (h) { return n(h) === min; });
      hex = least[Math.floor(self.rng() * least.length)];
    }
    var slot = 0; while (used[hex] && used[hex][slot]) slot++;
    return { hex: hex, slot: slot, pos: Geo.slotPos(byId[hex], slot) };
  };
  World.prototype.createVillage = function (o, now) {
    var tiles = []; for (var i = 0; i < TILE_N; i++) tiles.push(null);
    tiles[CENTER_TILE] = { type: 'center', level: 1 };
    tiles[4] = { type: 'house', level: 1 };
    tiles[2] = { type: 'farm', level: 1 };
    tiles[6] = { type: 'mat', level: 1 };
    var land = SITES.map(function (s) { return s.ring === 0 ? 1 : 0; });
    var v = {
      id: this.id('v'), name: o.name, owner: o.owner, tribe: o.tribe, hex: o.at.hex, slot: o.at.slot, pos: o.at.pos, bot: !!o.bot,
      createdAt: now, last: now, res: { food: 120, mat: 120 }, sp: {}, pop: 4, popAcc: 0,
      jobs: { food: 2, mat: 2, special: 0 }, auto: true, tiles: tiles, land: land, wall: 0, queue: [],
      units: { w: 0, a: 0 }, away: { w: 0, a: 0 }, train: [], glory: 0, wins: 0, losses: 0, gifts: 0,
      shieldUntil: 0, newbieUntil: o.bot ? 0 : now + this.newbieMs, ally: null, reports: [], cool: {},
      lastSay: 0, lastGift: 0, online: !!o.bot, idle: { focus: 'even', upgrade: false, train: false }, offAt: 0,
      def: { lanes: 'even', plan: ['volley', 'hold', 'charge'] }, battle: null
    };
    this.villages[v.id] = v;
    return v;
  };
  World.prototype.join = function (token, o, now) {
    token = clean(token, 64);
    if (!token) return { ok: false, msg: '缺少識別碼' };
    if (this.tokens[token] && this.villages[this.tokens[token]]) return { ok: true, id: this.tokens[token], resumed: true };
    o = o || {};
    var t = Tribes.get(o.tribe);
    if (!t) return { ok: false, msg: '請先在地圖上選一個區域' };
    if (!t.playable) return { ok: false, msg: t.zh + '的區域還在製作中，請先選其他區域' };
    var owner = clean(o.owner, 10) || '旅人', name = clean(o.name, 10) || (owner + '的部落');
    var at = this.pickHex(t.id, o.hex);
    if (!at) return { ok: false, msg: t.zh + '的區域已經住滿了，請選其他區域' };
    var v = this.createVillage({ name: name, owner: owner, tribe: t.id, at: at }, now);
    this.tokens[token] = v.id;
    this.log('「' + v.name + '」在' + t.zh + '的區域落腳了。', now, 'join');
    return { ok: true, id: v.id };
  };
  World.prototype.ensureBots = function (now) {
    var self = this;
    Tribes.playable().forEach(function (t) {
      var names = BOT_NAMES[t.id] || [];
      names.forEach(function (n) {
        for (var id in self.villages) if (self.villages[id].bot && self.villages[id].name === n) return;
        var at = self.pickHex(t.id);
        if (at) self.createVillage({ name: n, owner: '示範部落', tribe: t.id, at: at, bot: true }, now);
      });
    });
  };

  // ---------- 單一部落的時間推進 ----------
  World.prototype.autoJobs = function (v) {
    var s = slots(v), j = { food: 0, mat: 0, special: 0 }, left = v.pop, order = ['food', 'mat', 'special'];
    var f = v.idle && v.idle.focus;   // 採集重點：先把重點項目的位置排滿，剩下的人再平均分
    if (f && f !== 'even' && s[f] > 0) { j[f] = Math.min(left, s[f]); left -= j[f]; }
    while (left > 0) {
      var best = null, bestR = 2;
      for (var i = 0; i < 3; i++) { var k = order[i]; if (j[k] < s[k]) { var r = j[k] / s[k]; if (r < bestR) { bestR = r; best = k; } } }
      if (!best) break;
      j[best]++; left--;
    }
    v.jobs = j;
  };
  World.prototype.tickVillage = function (v, now) {
    if (now <= v.last) return;
    if (now - v.last > OFFLINE_MAX) v.last = now - OFFLINE_MAX;   // 離線最多累積 8 小時
    if (now - v.last > 60000) {   // 離開一段時間：每 30 秒補算一次，掛機設定才會照著生效
      for (var t = v.last + 30000; t < now; t += 30000) { this.advance(v, t); if (!v.online && !v.bot) this.idleStep(v, t); }
    }
    this.advance(v, now);
  };
  // 掛機時自動升級：挑等級最低、最便宜的建築
  World.prototype.idleStep = function (v, t) {
    if (v.idle && v.idle.train && !v.battle && armyTotal(v) < armyCap(v)) {
      var u = v.units.a < v.units.w ? 'a' : 'w';
      if (v.res.food >= UNIT[u].cost.food + 60 && v.res.mat >= UNIT[u].cost.mat) ACTIONS.train.call(this, v, { u: u }, t);
    }
    if (!v.idle || !v.idle.upgrade || v.queue.length >= BUILDERS) return;
    var C = centerLevel(v), best = null;
    for (var i = 0; i < TILE_N; i++) {
      var b = v.tiles[i];
      if (!b || b.busy || b.level >= MAX_LEVEL) continue;
      var c = cost(b.type, b.level + 1);
      if (!can(v, c)) continue;
      if (b.type === 'center') { var need = CENTER_UP[b.level + 1]; if (FOREIGN_SP ? need.kinds > 0 : (v.sp[v.tribe] || 0) < need.each * need.kinds) continue; }
      else if (b.level >= C) continue;
      var score = b.level * 100000 + c.food + c.mat;
      if (!best || score < best.score) best = { i: i, score: score, type: b.type, to: b.level + 1 };
    }
    if (best && !ACTIONS.upgrade.call(this, v, { tile: best.i }, t)) (v.offLog = v.offLog || []).push({ type: best.type, to: best.to });
  };
  World.prototype.advance = function (v, now) {
    var dt = Math.min((now - v.last) / 1000, 8 * 3600);
    if (dt <= 0) return;
    v.last = now;
    var self = this;
    v.queue = v.queue.filter(function (q) {
      if (q.doneAt > now) return true;
      if (q.type === 'wall') v.wall = q.to;
      else if (q.type === 'clear') { v.land[q.tile] = 1; v.res.mat += q.gain; }
      else if (v.tiles[q.tile]) { v.tiles[q.tile].level = q.to; delete v.tiles[q.tile].busy; }
      return false;
    });
    v.train = v.train.filter(function (q) { if (q.doneAt > now) return true; v.units[q.u]++; return false; });
    var pc = popCap(v);
    if (v.pop < pc) {
      v.popAcc += dt * self.speed / 10;
      while (v.popAcc >= 1 && v.pop < pc) { v.pop++; v.popAcc -= 1; }
    } else v.popAcc = 0;
    if (v.auto) this.autoJobs(v);
    else {   // 手動分工：人數不能超過族人總數
      var sum = v.jobs.food + v.jobs.mat + v.jobs.special;
      ['special', 'mat', 'food'].forEach(function (k) { while (sum > v.pop && v.jobs[k] > 0) { v.jobs[k]--; sum--; } });
    }
    var rt = rates(v, this.speed), c = caps(v);
    ['food', 'mat'].forEach(function (k) { if (v.res[k] < c.res) v.res[k] = Math.min(c.res, v.res[k] + rt[k] * dt); });
    var own = v.sp[v.tribe] || 0;
    if (rt.special > 0 && own < c.sp) v.sp[v.tribe] = Math.min(c.sp, own + rt.special * dt);
  };

  // ---------- 上線、離線與離線報告 ----------
  function snap(v) { return { food: v.res.food, mat: v.res.mat, sp: v.sp[v.tribe] || 0, pop: v.pop, land: v.land.filter(Boolean).length }; }
  World.prototype.setOnline = function (id, on, now) {
    var v = this.villages[id];
    if (!v || v.bot) return;
    if (!on) {
      if (!v.online) return;
      this.tickVillage(v, now);
      v.online = false; v.offAt = now; v.offSnap = snap(v); v.offLog = [];
      return;
    }
    if (v.online) return;
    var since = v.offAt || v.last, before = v.offSnap || snap(v);
    this.tickVillage(v, now);   // 這時還算離線，掛機設定會生效
    v.online = true; v.offAt = 0;
    if (now - since >= this.reportAfter) {
      var a = snap(v);
      v.report = { from: since, to: now, capped: now - since > OFFLINE_MAX, food: Math.floor(a.food - before.food), mat: Math.floor(a.mat - before.mat),
        sp: Math.floor(a.sp - before.sp), pop: a.pop - before.pop, land: a.land - before.land, ups: v.offLog || [] };
    }
    delete v.offSnap; delete v.offLog;
  };

  // ---------- 玩家動作 ----------
  World.prototype.act = function (id, a, now) {
    var v = this.villages[id];
    if (!v || !a) return { ok: false, msg: '找不到部落' };
    this.tickVillage(v, now);
    var fn = ACTIONS[a.type];
    if (!fn) return { ok: false, msg: '不支援的動作' };
    return fn.call(this, v, a, now) || { ok: true };
  };
  var ACTIONS = {
    auto: function (v, a) { v.auto = !!a.on; if (v.auto) this.autoJobs(v); },
    idle: function (v, a) {   // 掛機設定
      if (['even', 'food', 'mat', 'special'].indexOf(a.focus) >= 0) v.idle.focus = a.focus;
      if (a.upgrade != null) v.idle.upgrade = !!a.upgrade;
      if (a.train != null) v.idle.train = !!a.train;
      if (v.auto) this.autoJobs(v);
    },
    ack: function (v) { delete v.report; },
    jobs: function (v, a) {
      var s = slots(v), j = {}, sum = 0;
      ['food', 'mat', 'special'].forEach(function (k) { j[k] = Math.max(0, Math.min(s[k], int(a[k]))); sum += j[k]; });
      if (sum > v.pop) return { ok: false, msg: '族人不夠分配' };
      v.jobs = j; v.auto = false;
    },
    build: function (v, a, now) {
      var tile = int(a.tile), type = a.type2;
      if (TYPES.indexOf(type) < 0) return { ok: false, msg: '沒有這種建築' };
      if (tile < 0 || tile >= TILE_N || v.tiles[tile]) return { ok: false, msg: '這塊地已經有建築了' };
      if (!v.land[tile]) return { ok: false, msg: '這裡還是山林，要先拓荒' };
      if (count(v, type) >= limit(type, centerLevel(v))) return { ok: false, msg: '數量已達上限，先升級部落中心' };
      if (v.queue.length >= BUILDERS) return { ok: false, msg: '同時只能進行 ' + BUILDERS + ' 項工程' };
      var c = cost(type, 1);
      if (!can(v, c)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, c);
      v.tiles[tile] = { type: type, level: 0, busy: true };
      v.queue.push({ id: this.id('q'), tile: tile, type: type, to: 1, doneAt: now + buildTime(type, 1) * 1000 / this.speed });
    },
    clear: function (v, a, now) {
      var info = clearInfo(v, int(a.tile));
      if (!info.ok) return { ok: false, msg: info.why === 'center' ? '要先把部落中心升到等級 ' + CLEAR[SITES[int(a.tile)].ring].center : info.why };
      v.res.food -= info.food;
      v.queue.push({ id: this.id('q'), tile: int(a.tile), type: 'clear', to: 0, gain: info.gain, doneAt: now + info.time * 1000 / this.speed });
    },
    upgrade: function (v, a, now) {
      var tile = int(a.tile), b = v.tiles[tile];
      if (!b) return { ok: false, msg: '這裡沒有建築' };
      if (b.busy) return { ok: false, msg: '還在施工中' };
      if (b.level >= MAX_LEVEL) return { ok: false, msg: '已經是最高等級' };
      if (v.queue.length >= BUILDERS) return { ok: false, msg: '同時只能進行 ' + BUILDERS + ' 項工程' };
      var to = b.level + 1, c = cost(b.type, to), picked = [], ownSp = 0;
      if (b.type === 'center') {
        var need = CENTER_UP[to];
        if (need.kinds > 0) {
          if (!FOREIGN_SP) {
            ownSp = need.each * need.kinds;
            if ((v.sp[v.tribe] || 0) < ownSp) return { ok: false, msg: '還需要 ' + ownSp + ' 份特產' };
          } else {
            var have = Object.keys(v.sp).filter(function (k) { return k !== v.tribe && v.sp[k] >= need.each; })
              .sort(function (x, y) { return v.sp[y] - v.sp[x]; });
            if (have.length < need.kinds) return { ok: false, msg: '還需要 ' + need.kinds + ' 種別族特產，每種 ' + need.each + ' 份（可以交易、送禮或出征取得）' };
            picked = have.slice(0, need.kinds);
          }
        }
      } else if (to > centerLevel(v)) return { ok: false, msg: '等級不能超過部落中心' };
      if (!can(v, c)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, c);
      if (ownSp) addRes(v, 'sp:' + v.tribe, -ownSp);
      picked.forEach(function (k) { addRes(v, 'sp:' + k, -CENTER_UP[to].each); });
      b.busy = true;
      v.queue.push({ id: this.id('q'), tile: tile, type: b.type, to: to, doneAt: now + buildTime(b.type, to) * 1000 / this.speed });
    },
    wall: function (v, a, now) {
      if (v.queue.some(function (q) { return q.type === 'wall'; })) return { ok: false, msg: '還在施工中' };
      var to = v.wall + 1;
      if (to > centerLevel(v)) return { ok: false, msg: '等級不能超過部落中心' };
      if (v.queue.length >= BUILDERS) return { ok: false, msg: '同時只能進行 ' + BUILDERS + ' 項工程' };
      var c = cost('wall', to);
      if (!can(v, c)) return { ok: false, msg: '建材不足' };
      pay(v, c);
      v.queue.push({ id: this.id('q'), tile: -1, type: 'wall', to: to, doneAt: now + buildTime('wall', to) * 1000 / this.speed });
    },
    train: function (v, a, now) {
      var u = UNIT[a.u];
      if (!u) return { ok: false, msg: '沒有這種單位' };
      if (armyCap(v) === 0) return { ok: false, msg: '要先蓋好訓練場' };
      if (v.battle) return { ok: false, msg: '交戰中不能訓練' };
      if (armyTotal(v) >= armyCap(v)) return { ok: false, msg: '人數已滿，升級訓練場可以增加名額' };
      if (!can(v, u.cost)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, u.cost);
      var start = v.train.length ? v.train[v.train.length - 1].doneAt : now;
      v.train.push({ u: a.u, doneAt: Math.max(start, now) + u.time * 1000 / this.speed });
    },
    defense: function (v, a) {   // 佈防：重點守哪一路、不在線上時每個階段下什麼指令
      if (LANE_KEYS.indexOf(a.lanes) >= 0) v.def.lanes = a.lanes;
      if (Array.isArray(a.plan) && a.plan.length === PHASES && a.plan.every(function (c) { return CMDS[c]; })) v.def.plan = a.plan.slice();
    },
    attack: function (v, a, now) {
      var t = this.villages[a.to], w = int(a.w), ar = int(a.a);
      if (!t || t.id === v.id) return { ok: false, msg: '找不到目標' };
      if (w < 0 || ar < 0 || w + ar < 1) return { ok: false, msg: '至少要派出一個人' };
      if (w > v.units.w || ar > v.units.a) return { ok: false, msg: '留在部落的人數不夠' };
      if (v.battle) return { ok: false, msg: '部落正在交戰，現在不能出征' };
      if (v.ally && v.ally === t.ally) return { ok: false, msg: '不能出征同一個聯盟的部落' };
      if (now < t.shieldUntil || now < t.newbieUntil) return { ok: false, msg: '對方正受到保護' };
      if (!t.bot && centerLevel(v) - centerLevel(t) > 1) return { ok: false, msg: '對方規模比你小太多，不能出征' };
      if ((v.cool[t.id] || 0) > now) return { ok: false, msg: '才剛交手過，晚一點再來' };
      if (this.marches.some(function (m) { return m.from === v.id; })) return { ok: false, msg: '已經有一支隊伍在外面了' };
      v.units.w -= w; v.units.a -= ar; v.away.w += w; v.away.a += ar;
      v.newbieUntil = 0; v.shieldUntil = 0;   // 主動出征就放棄保護
      var d = Geo.hexDist(this.map.byId[v.hex], this.map.byId[t.hex]);
      var travel = Math.min(60, 6 + 2.5 * d) * 1000 / this.speed;
      this.marches.push({ id: this.id('m'), from: v.id, to: t.id, w: w, a: ar, lanes: LANE_KEYS.indexOf(a.lanes) >= 0 ? a.lanes : 'even',
        departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null });
      v.cool[t.id] = now + 120000 / this.speed;
      return { ok: true, msg: '隊伍出發了' };
    },
    cmd: function (v, a, now) {   // 對戰中下指令
      var b = this.battles[v.battle];
      if (!b || b.state !== 'pick') return { ok: false, msg: '現在不能下指令' };
      if (!CMDS[a.c]) return { ok: false, msg: '沒有這個指令' };
      b.cmd[b.a === v.id ? 'a' : 'd'] = a.c;
      this.stepBattle(b, now);
    },
    seen: function (v, a) { v.reports.forEach(function (r) { if (!a.id || r.id === a.id) r.seen = true; }); },
    gift: function (v, a, now) {
      var t = this.villages[a.to], k = a.key, n = int(a.n);
      if (!t || t.id === v.id) return { ok: false, msg: '找不到對象' };
      if (!validKey(k) || n < 1 || n > 100) return { ok: false, msg: '一次可以送 1 到 100 份' };
      if (now - v.lastGift < 5000) return { ok: false, msg: '稍等一下再送' };
      if (getRes(v, k) < n) return { ok: false, msg: '數量不夠' };
      this.tickVillage(t, now);
      addRes(v, k, -n); addRes(t, k, n); v.lastGift = now; v.gifts++;
      this.log('「' + v.name + '」送給「' + t.name + '」' + n + ' 份' + resName(k) + '。', now, 'gift');
      return { ok: true, msg: '禮物送到了' };
    },
    offer: function (v, a, now) {
      var g = a.give, w = a.want, gn = int(a.giveN), wn = int(a.wantN);
      if (!validKey(g) || !validKey(w) || g === w) return { ok: false, msg: '請選兩種不同的物資' };
      if (gn < 1 || wn < 1 || gn > 500 || wn > 500) return { ok: false, msg: '數量要在 1 到 500 之間' };
      if (this.market.filter(function (o) { return o.from === v.id; }).length >= 3) return { ok: false, msg: '最多同時掛三筆交易' };
      if (getRes(v, g) < gn) return { ok: false, msg: '數量不夠' };
      addRes(v, g, -gn);
      this.market.push({ id: this.id('o'), from: v.id, give: g, giveN: gn, want: w, wantN: wn, t: now });
      return { ok: true, msg: '已經掛到市集' };
    },
    cancel: function (v, a) {
      var i = this.market.findIndex(function (o) { return o.id === a.id && o.from === v.id; });
      if (i < 0) return { ok: false, msg: '找不到這筆交易' };
      var o = this.market.splice(i, 1)[0]; addRes(v, o.give, o.giveN);
      return { ok: true, msg: '已取消，物資退回來了' };
    },
    accept: function (v, a, now) {
      var i = this.market.findIndex(function (o) { return o.id === a.id; });
      if (i < 0) return { ok: false, msg: '這筆交易已經不在了' };
      var o = this.market[i], s = this.villages[o.from];
      if (o.from === v.id) return { ok: false, msg: '這是你自己掛的交易' };
      if (getRes(v, o.want) < o.wantN) return { ok: false, msg: resName(o.want) + '不夠' };
      this.market.splice(i, 1);
      addRes(v, o.want, -o.wantN); addRes(v, o.give, o.giveN);
      if (s) { this.tickVillage(s, now); addRes(s, o.want, o.wantN); }
      this.log('「' + v.name + '」和「' + (s ? s.name : '遠方部落') + '」完成交易：' + o.giveN + ' ' + resName(o.give) + ' 換 ' + o.wantN + ' ' + resName(o.want) + '。', now, 'trade');
      return { ok: true, msg: '交易完成' };
    },
    allyCreate: function (v, a, now) {
      if (v.ally) return { ok: false, msg: '你已經在聯盟裡了' };
      var name = clean(a.name, 8);
      if (name.length < 2) return { ok: false, msg: '聯盟名稱至少兩個字' };
      for (var k in this.alliances) if (this.alliances[k].name === name) return { ok: false, msg: '已經有同名的聯盟' };
      var al = { id: this.id('a'), name: name, leader: v.id, members: [v.id] };
      this.alliances[al.id] = al; v.ally = al.id;
      this.log('「' + v.name + '」發起了聯盟「' + name + '」。', now, 'ally');
      return { ok: true, msg: '聯盟成立了' };
    },
    allyJoin: function (v, a, now) {
      var al = this.alliances[a.id];
      if (v.ally) return { ok: false, msg: '你已經在聯盟裡了' };
      if (!al) return { ok: false, msg: '找不到這個聯盟' };
      if (al.members.length >= 20) return { ok: false, msg: '這個聯盟滿了' };
      al.members.push(v.id); v.ally = al.id;
      this.log('「' + v.name + '」加入了聯盟「' + al.name + '」。', now, 'ally');
      return { ok: true, msg: '加入了' + al.name };
    },
    allyLeave: function (v) {
      var al = this.alliances[v.ally];
      if (!al) { v.ally = null; return { ok: false, msg: '你不在聯盟裡' }; }
      al.members = al.members.filter(function (m) { return m !== v.id; }); v.ally = null;
      if (!al.members.length) delete this.alliances[al.id]; else if (al.leader === v.id) al.leader = al.members[0];
      return { ok: true, msg: '已離開聯盟' };
    },
    say: function (v, a, now) {
      if (!PHRASES[a.phrase]) return { ok: false, msg: '沒有這句話' };
      if (now - v.lastSay < 4000) return { ok: false, msg: '說話慢一點' };
      v.lastSay = now;
      var t = Tribes.get(v.tribe), txt = {
        hello: t.hello + '！（' + t.lang + '的問候）', thanks: t.thanks + '！（' + t.lang + '的謝謝）',
        trade: '有人想交換特產嗎？', ally: '歡迎加入我們的聯盟！', cheer: '大家一起加油！', nice: '這場較量真精彩！'
      }[a.phrase];
      this.log('「' + v.name + '」：' + txt, now, 'say');
    }
  };

  // ---------- 出征隊伍與對戰流程 ----------
  World.prototype.resolveMarch = function (m, now) {
    var v = this.villages[m.from], t = this.villages[m.to];
    if (!v) return false;
    if (m.phase === 'back') {
      v.units.w += m.w; v.units.a += m.a; v.away.w = Math.max(0, v.away.w - m.w); v.away.a = Math.max(0, v.away.a - m.a);
      if (m.loot) for (var k in m.loot) addRes(v, k, m.loot[k]);
      return false;
    }
    if (m.phase === 'fight') return true;   // 對戰中，等對戰結束
    var why = !t ? '找不到對方的部落' : now < t.shieldUntil ? '對方正受到保護' : (v.ally && v.ally === t.ally) ? '對方現在是同盟' : t.battle ? '對方正在和別人交戰' : '';
    if (why) {
      this.pushReport(v, { t: now, role: 'atk', other: t ? t.name : '', otherTribe: t ? t.tribe : v.tribe, win: false, broken: 0, note: why + '，隊伍折返。', log: [] });
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    this.tickVillage(v, now); this.tickVillage(t, now);
    var aw = split(m.w, m.lanes), aa = split(m.a, m.lanes), dw = split(t.units.w, t.def.lanes), da = split(t.units.a, t.def.lanes);
    var b = { id: this.id('b'), a: v.id, d: t.id, aName: v.name, dName: t.name, aTribe: v.tribe, dTribe: t.tribe, march: m.id,
      wall: t.wall, towers: levelsOf(t, 'tower').reduce(function (s, L) { return s + 9 * L; }, 0), towerN: levelsOf(t, 'tower').length,
      lanes: [0, 1, 2].map(function (i) { return { a: { w: aw[i], a: aa[i], pool: 0, lostW: 0, lostA: 0 }, d: { w: dw[i], a: da[i], pool: 0, lostW: 0, lostA: 0 }, broken: false }; }),
      start: { a: { w: m.w, a: m.a }, d: { w: t.units.w, a: t.units.a } }, phase: 1, state: 'prep', deadline: now + PREP_MS / this.speed, cmd: { a: null, d: null }, log: [] };
    t.units.w = 0; t.units.a = 0;   // 守軍都上場了，打完再回來
    this.battles[b.id] = b; v.battle = b.id; t.battle = b.id; m.phase = 'fight';
    return true;
  };
  /* 對戰往前推一步：時間到，或雙方都下好指令時呼叫 */
  World.prototype.stepBattle = function (b, now) {
    var A = this.villages[b.a], D = this.villages[b.d];
    if (b.state === 'prep') { if (now >= b.deadline) { b.state = 'pick'; b.deadline = now + PICK_MS / this.speed; } else return; }
    if (b.state === 'pick') {
      var live = D && D.online && !D.bot;
      if (!live && !b.cmd.d) b.cmd.d = (D && D.def.plan[b.phase - 1]) || 'hold';   // 守方不在線上：照預設的守備方針
      if (!(b.cmd.a && b.cmd.d) && now < b.deadline) return;
      if (!b.cmd.a) b.cmd.a = 'charge';                                             // 時間到還沒下令：攻方衝鋒，守方照預設
      if (!b.cmd.d) b.cmd.d = (D && D.def.plan[b.phase - 1]) || 'hold';
      b.log.push(fightPhase(b, b.cmd.a, b.cmd.d, this.rng));
      b.state = 'show'; b.deadline = now + SHOW_MS / this.speed;
      return;
    }
    if (b.state === 'show' && now >= b.deadline) {
      var fighting = b.lanes.some(function (l) { return !l.broken && l.a.w + l.a.a > 0 && l.d.w + l.d.a > 0; });
      var unopposed = b.lanes.some(function (l) { return !l.broken && l.a.w + l.a.a > 0 && l.d.w + l.d.a === 0; });
      if (b.phase >= PHASES || !(fighting || unopposed)) return this.endBattle(b, now);
      b.phase++; b.cmd = { a: null, d: null }; b.state = 'pick'; b.deadline = now + PICK_MS / this.speed;
    }
  };
  World.prototype.endBattle = function (b, now) {
    var A = this.villages[b.a], D = this.villages[b.d], m = this.marches.filter(function (x) { return x.id === b.march; })[0];
    var broken = b.lanes.filter(function (l) { return l.broken; }).length, win = broken >= 2;
    var left = { w: 0, a: 0 }, home = { w: 0, a: 0 };
    b.lanes.forEach(function (l) { left.w += l.a.w; left.a += l.a.a; home.w += l.d.w; home.a += l.d.a; });
    var lostA = b.start.a.w + b.start.a.a - left.w - left.a, lostD = b.start.d.w + b.start.d.a - home.w - home.a, loot = {}, txt = [];
    if (D) {
      D.units.w += home.w; D.units.a += home.a; D.battle = null;
      if (broken > 0 && left.w + left.a > 0) {   // 每位回程的人能背 30 份：先帶特產，剩下的空間分給糧食與建材
        var frac = LOOT_FRAC[broken], carry = 30 * (left.w + left.a), prot = caps(D).protect, want = {};
        var take = function (k, n) { n = Math.min(n, carry); if (n <= 0) return; carry -= n; loot[k] = n; addRes(D, k, -n); txt.push(n + ' ' + resName(k)); };
        for (var sk in D.sp) take('sp:' + sk, Math.floor(D.sp[sk] * frac));
        ['food', 'mat'].forEach(function (k) { want[k] = Math.floor(Math.max(0, D.res[k] - prot) * frac); });
        var total = want.food + want.mat, f = total > carry ? carry / total : 1;
        var nf = Math.floor(want.food * f), nm = Math.floor(want.mat * f); take('food', nf); take('mat', nm);
      }
      if (win) { D.losses++; D.glory = Math.max(0, D.glory - 3); D.shieldUntil = now + SHIELD_MS / this.speed; } else { D.wins++; D.glory += 5; }
      this.pushReport(D, { id: b.id, t: now, role: 'def', other: b.aName, otherTribe: b.aTribe, win: !win, broken: broken, loot: loot, lost: lostD, log: b.log });
    }
    if (A) {
      A.battle = null; A.away.w = Math.max(0, A.away.w - (b.start.a.w - left.w)); A.away.a = Math.max(0, A.away.a - (b.start.a.a - left.a));
      if (win) { A.wins++; A.glory += (broken === 3 ? 15 : 10) + 2 * (D ? centerLevel(D) : 1); } else { A.losses++; A.glory = Math.max(0, A.glory - 2); }
      this.pushReport(A, { id: b.id, t: now, role: 'atk', other: b.dName, otherTribe: b.dTribe, win: win, broken: broken, loot: loot, lost: lostA, log: b.log });
    }
    var key = b.aTribe + '>' + b.dTribe, st = this.stats[key] = this.stats[key] || { n: 0, win: 0 };   // 後台用：各族對戰的場數與攻方勝場
    st.n++; if (win) st.win++;
    this.log(win ? '「' + b.aName + '」出征「' + b.dName + '」，攻破 ' + broken + ' 路獲勝' + (txt.length ? '，帶回 ' + txt.join('、') : '') + '。'
      : '「' + b.dName + '」守住了「' + b.aName + '」的出征。', now, 'battle');
    b.state = 'done'; b.result = { broken: broken, win: win, loot: loot, lostA: lostA, lostD: lostD }; b.doneAt = now;
    if (m) {
      if (left.w + left.a === 0) this.marches = this.marches.filter(function (x) { return x.id !== m.id; });
      else { m.w = left.w; m.a = left.a; m.loot = loot; m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; }
    }
  };
  World.prototype.pushReport = function (v, rep) {
    rep.id = rep.id || this.id('r'); rep.seen = false;
    v.reports.unshift(rep); if (v.reports.length > 6) v.reports.length = 6;
  };

  // ---------- 示範部落（電腦） ----------
  World.prototype.botStep = function (v, now) {
    var self = this, rng = this.rng, C = centerLevel(v);
    this.tickVillage(v, now);
    if (v.queue.length < BUILDERS && rng() < 0.7) {
      var opts = [], empty = [], wild = [];
      for (var i = 0; i < TILE_N; i++) {
        var b = v.tiles[i];
        if (!b) { if (v.land[i]) empty.push(i); else if (clearInfo(v, i).ok) wild.push(i); continue; }
        if (b.busy || b.level >= MAX_LEVEL) continue;
        if (b.type === 'center') { if (can(v, cost('center', b.level + 1))) opts.push({ type: 'upgrade', tile: i }, { type: 'upgrade', tile: i }); }
        else if (b.level < C && can(v, cost(b.type, b.level + 1))) opts.push({ type: 'upgrade', tile: i });
      }
      if (empty.length < 2 && wild.length) opts.push({ type: 'clear', tile: wild[Math.floor(rng() * wild.length)] });
      if (empty.length) TYPES.forEach(function (ty) {
        if (count(v, ty) < limit(ty, C) && can(v, cost(ty, 1))) opts.push({ type: 'build', type2: ty, tile: empty[Math.floor(rng() * empty.length)] });
      });
      if (v.wall < C && can(v, cost('wall', v.wall + 1))) opts.push({ type: 'wall' });
      if (opts.length) this.act(v.id, opts[Math.floor(rng() * opts.length)], now);
    }
    if (armyCap(v) > armyTotal(v) && rng() < 0.5) this.act(v.id, { type: 'train', u: rng() < 0.6 ? 'w' : 'a' }, now);
    var mine = this.market.filter(function (o) { return o.from === v.id; });
    if (!mine.length && (v.sp[v.tribe] || 0) >= 6 && rng() < 0.25) {
      var others = Tribes.playable().filter(function (t) { return t.id !== v.tribe; });
      var wantSp = rng() < 0.5;
      this.act(v.id, wantSp ? { type: 'offer', give: 'sp:' + v.tribe, giveN: 4, want: 'sp:' + others[Math.floor(rng() * others.length)].id, wantN: 4 }
        : { type: 'offer', give: 'sp:' + v.tribe, giveN: 4, want: rng() < 0.5 ? 'food' : 'mat', wantN: 60 }, now);
    }
    this.market.slice().forEach(function (o) {
      if (o.from === v.id || rng() > 0.2) return;
      var fair = o.give.slice(0, 3) === 'sp:' && o.give !== 'sp:' + v.tribe &&
        ((o.want === 'food' || o.want === 'mat') ? o.wantN / o.giveN <= 25 && v.res[o.want] > o.wantN + 150 : o.want === 'sp:' + v.tribe && o.wantN <= o.giveN * 1.5);
      if (fair && getRes(v, o.want) >= o.wantN) self.act(v.id, { type: 'accept', id: o.id }, now);
    });
  };

  // ---------- 世界時間推進 ----------
  World.prototype.tick = function (now) {
    var self = this, id;
    for (id in this.villages) { var v = this.villages[id]; if (v.online || v.bot) this.tickVillage(v, now); }
    this.marches = this.marches.filter(function (m) { return m.arriveAt > now ? true : self.resolveMarch(m, now); });
    for (id in this.battles) {
      var b = this.battles[id];
      if (b.state === 'done') { if (now - b.doneAt > 20000) delete this.battles[id]; } else this.stepBattle(b, now);
    }
    this.market = this.market.filter(function (o) {
      if (now - o.t < OFFER_MS) return true;
      var s = self.villages[o.from]; if (s) addRes(s, o.give, o.giveN);
      return false;
    });
    if (now - this.lastBot >= 4000 / this.speed) {
      this.lastBot = now;
      for (id in this.villages) if (this.villages[id].bot) this.botStep(this.villages[id], now);
    }
  };

  // ---------- 給客戶端的資料 ----------
  World.prototype.pub = function (v, now) {
    var guard = v.units.w + v.units.a;
    return { id: v.id, name: v.name, owner: v.owner, tribe: v.tribe, hex: v.hex, pos: v.pos, bot: v.bot, online: v.online || v.bot,
      c: centerLevel(v), wall: v.wall, towers: levelsOf(v, 'tower').length, guard: guard === 0 ? 0 : guard <= 4 ? 1 : guard <= 10 ? 2 : 3,
      pros: prosperity(v), glory: v.glory, ally: v.ally, safe: Math.max(v.shieldUntil, v.newbieUntil) };
  };
  function battleView(b, id) {
    return { id: b.id, role: b.a === id ? 'atk' : 'def', aName: b.aName, dName: b.dName, aTribe: b.aTribe, dTribe: b.dTribe, wall: b.wall, towerN: b.towerN,
      phase: b.phase, state: b.state, deadline: b.deadline, mine: b.cmd[b.a === id ? 'a' : 'd'], log: b.log, result: b.result || null,
      lanes: b.lanes.map(function (l) { return { aw: l.a.w, aa: l.a.a, dw: l.d.w, da: l.d.a, broken: l.broken }; }) };
  }
  World.prototype.pubs = function (now) { var self = this; return Object.keys(this.villages).map(function (k) { return self.pub(self.villages[k], now); }); };
  World.prototype.detail = function (id, now) {
    var v = this.villages[id]; if (!v) return null;
    this.tickVillage(v, now);
    var p = this.pub(v, now);
    p.tiles = v.tiles.map(function (b) { return b ? { type: b.type, level: b.level, busy: !!b.busy } : null; });
    p.land = v.land.slice(); p.queue = []; p.popCap = popCap(v);
    p.pop = v.pop;
    return p;
  };
  World.prototype.snapshot = function (id, now) {
    var v = this.villages[id], self = this;
    if (!v) return null;
    var me = JSON.parse(JSON.stringify(v));
    delete me.offSnap; delete me.offLog; delete me.cool;
    var bt = v.battle && this.battles[v.battle];
    if (!bt) for (var bk in this.battles) {   // 剛打完的對戰再多傳一小段時間，讓雙方看到結果
      var x = this.battles[bk]; if (x.state === 'done' && (x.a === id || x.d === id)) bt = x;
    }
    me.d = derived(v, this.speed);
    var al = {};
    for (var k in this.alliances) al[k] = { id: k, name: this.alliances[k].name, leader: this.alliances[k].leader, n: this.alliances[k].members.length };
    return {
      now: now, speed: this.speed, me: me,
      villages: Object.keys(this.villages).map(function (k) { return self.pub(self.villages[k], now); }),
      marches: this.marches.map(function (m) { return { id: m.id, from: m.from, to: m.to, departAt: m.departAt, arriveAt: m.arriveAt, phase: m.phase, n: m.w + m.a }; }),
      shieldMs: SHIELD_MS / this.speed,
      market: this.market.map(function (o) { return { id: o.id, from: o.from, fromName: (self.villages[o.from] || {}).name || '', give: o.give, giveN: o.giveN, want: o.want, wantN: o.wantN }; }),
      feed: this.feed.slice(-30), alliances: al, battle: bt ? battleView(bt, id) : null
    };
  };
  World.prototype.adminState = function (now) {
    var self = this, tribes = {}, list = Object.keys(this.villages).map(function (id) {
      var v = self.villages[id], d = derived(v, self.speed);
      var row = { id: v.id, name: v.name, owner: v.owner, tribe: v.tribe, bot: v.bot, online: !!v.online, center: d.center, pop: v.pop, popCap: d.popCap,
        food: Math.floor(v.res.food), mat: Math.floor(v.res.mat), sp: Math.floor(v.sp[v.tribe] || 0), cap: d.cap, land: v.land.filter(Boolean).length,
        buildings: v.tiles.filter(Boolean).length, prosperity: d.prosperity, glory: v.glory, army: v.units.w + v.units.a, createdAt: v.createdAt,
        seen: v.online || v.bot ? now : (v.offAt || v.last), idle: v.idle, pos: v.pos };
      var t = tribes[v.tribe] = tribes[v.tribe] || { players: 0, bots: 0, online: 0, prosperity: 0 };
      if (v.bot) t.bots++; else { t.players++; t.prosperity += d.prosperity; if (v.online) t.online++; }
      return row;
    });
    for (var k in tribes) tribes[k].avg = tribes[k].players ? Math.round(tribes[k].prosperity / tribes[k].players) : 0;
    return { now: now, speed: this.speed, villages: list, tribes: tribes, marches: this.marches.length, offers: this.market.length,
      battles: Object.keys(this.battles).filter(function (k) { return self.battles[k].state !== 'done'; }).length, stats: this.stats };
  };
  World.prototype.toJSON = function () {
    return { villages: this.villages, tokens: this.tokens, marches: this.marches, market: this.market, feed: this.feed, alliances: this.alliances,
      battles: this.battles, stats: this.stats, seq: this.seq };
  };
  World.prototype.load = function (d) {
    if (!d || !d.villages) return this;
    this.villages = d.villages; this.tokens = d.tokens || {}; this.marches = d.marches || []; this.market = d.market || [];
    this.feed = d.feed || []; this.alliances = d.alliances || {}; this.seq = d.seq || 1;
    this.battles = d.battles || {}; this.stats = d.stats || {};
    for (var id in this.villages) {
      var v = this.villages[id]; v.online = !!v.bot;
      if (!v.land || v.tiles.length !== TILE_N) { delete this.villages[id]; continue; }   // 舊版的方格部落無法沿用
      if (!v.idle) v.idle = { focus: 'even', upgrade: false };
      if (!v.def) v.def = { lanes: 'even', plan: ['volley', 'hold', 'charge'] };
      if (v.battle && !(this.battles || {})[v.battle]) v.battle = null;
    }
    for (var tk in this.tokens) if (!this.villages[this.tokens[tk]]) delete this.tokens[tk];
    return this;
  };

  World.rules = {
    SITES: SITES, CLEAR: CLEAR, clearInfo: clearInfo, TILE_N: TILE_N, CENTER_TILE: CENTER_TILE, TYPES: TYPES, MAX_LEVEL: MAX_LEVEL, UNIT: UNIT,
    CENTER_UP: CENTER_UP, BUILDERS: BUILDERS, FOREIGN_SP: FOREIGN_SP, cost: cost, buildTime: buildTime, limit: limit, count: count,
    resName: resName, derived: derived, popCap: popCap, LANES: LANES, LANE_KEYS: LANE_KEYS, CMDS: CMDS, PHASES: PHASES, LOOT_FRAC: LOOT_FRAC,
    split: split, taken: taken, fightPhase: fightPhase, armyCap: armyCap
  };
  return World;
});
