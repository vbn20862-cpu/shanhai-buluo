/* 山海部落 — 遊戲規則與世界模擬
 * 伺服器用它當唯一的裁判；單機試玩版在瀏覽器裡跑同一份程式。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'), require('./tribes.js'));
  else root.World = factory(root.Geo, root.Tribes);
})(typeof self !== 'undefined' ? self : this, function (Geo, Tribes) {
  'use strict';

  // ---------- 規則數值 ----------
  var GRID_W = 9, GRID_H = 5, TILE_N = GRID_W * GRID_H, CENTER_TILE = 22;
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
  var BUILDERS = 2, SHIELD_MS = 180000, NEWBIE_MS = 300000, OFFER_MS = 600000;
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
    for (var i = 0; i < TILE_N; i++) if (v.tiles[i]) p += v.tiles[i].level * (v.tiles[i].type === 'center' ? 30 : 10);
    return Math.round(p + v.wall * 10 + v.pop * 3 + foreignKinds(v) * 15 + Math.min(40, v.gifts * 2));
  }
  function derived(v, speed) {
    var c = caps(v);
    return { cap: c.res, spCap: c.sp, protect: c.protect, slots: slots(v), rates: rates(v, speed), popCap: popCap(v),
      armyCap: armyCap(v), builders: BUILDERS, prosperity: prosperity(v), center: centerLevel(v) };
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

  // ---------- 戰鬥 ----------
  // 不呈現傷亡細節：失去戰力的單位視為「負傷撤退」。
  function battle(att, def, rng) {
    var A = { w: att.w, a: att.a }, D = { w: def.w, a: def.a };
    var wall = def.wallHp, towers = def.towers.map(function (L) { return { L: L, hp: 60 * L }; });
    var rounds = [], aPool = 0, dPool = 0;
    function towersUp() { return towers.filter(function (t) { return t.hp > 0; }); }
    function done() { return wall <= 0 && D.w + D.a === 0 && towersUp().length === 0; }
    rounds.push({ r: 0, aw: A.w, aa: A.a, dw: D.w, da: D.a, wall: Math.round(wall), towers: towers.length });
    for (var r = 1; r <= 10 && !done(); r++) {
      var wallUp = wall > 0, f1 = 0.88 + rng() * 0.24, f2 = 0.88 + rng() * 0.24;
      var dmgDef = (towersUp().reduce(function (s, t) { return s + 9 * t.L; }, 0) + (wallUp ? 0 : D.w * UNIT.w.atk) + D.a * UNIT.a.atk * (wallUp ? 1.5 : 1)) * f2;
      if (wallUp) wall = Math.max(0, wall - (A.w * UNIT.w.atk + A.a * UNIT.a.atk * 0.5) * f1);
      else {
        dPool += (A.w * UNIT.w.atk + A.a * UNIT.a.atk) * f1;
        while (D.w > 0 && dPool >= UNIT.w.hp) { D.w--; dPool -= UNIT.w.hp; }
        if (D.w === 0) while (D.a > 0 && dPool >= UNIT.a.hp) { D.a--; dPool -= UNIT.a.hp; }
        if (D.w + D.a === 0) { towers.forEach(function (t) { if (t.hp > 0 && dPool > 0) { var x = Math.min(t.hp, dPool); t.hp -= x; dPool -= x; } }); dPool = 0; }
      }
      aPool += dmgDef;
      while (A.w > 0 && aPool >= UNIT.w.hp) { A.w--; aPool -= UNIT.w.hp; }
      if (A.w === 0) while (A.a > 0 && aPool >= UNIT.a.hp) { A.a--; aPool -= UNIT.a.hp; }
      rounds.push({ r: r, aw: A.w, aa: A.a, dw: D.w, da: D.a, wall: Math.round(wall), towers: towersUp().length });
      if (A.w + A.a === 0) break;
    }
    return { win: A.w + A.a > 0 && done(), rounds: rounds, A: A, D: D };
  }

  // ---------- 世界 ----------
  function World(opts) {
    opts = opts || {};
    this.speed = opts.speed || 1;
    this.rng = opts.rng || Math.random;
    this.map = Geo.build();
    this.villages = {}; this.tokens = {}; this.marches = []; this.market = []; this.feed = []; this.alliances = {};
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
    tiles[CENTER_TILE - 1] = { type: 'house', level: 1 };
    tiles[CENTER_TILE - GRID_W] = { type: 'farm', level: 1 };
    tiles[CENTER_TILE + GRID_W] = { type: 'mat', level: 1 };
    var v = {
      id: this.id('v'), name: o.name, owner: o.owner, tribe: o.tribe, hex: o.at.hex, slot: o.at.slot, pos: o.at.pos, bot: !!o.bot,
      createdAt: now, last: now, res: { food: 120, mat: 120 }, sp: {}, pop: 4, popAcc: 0,
      jobs: { food: 2, mat: 2, special: 0 }, auto: true, tiles: tiles, wall: 0, queue: [],
      units: { w: 0, a: 0 }, away: { w: 0, a: 0 }, train: [], glory: 0, wins: 0, losses: 0, gifts: 0,
      shieldUntil: 0, newbieUntil: o.bot ? 0 : now + NEWBIE_MS, ally: null, reports: [], cool: {},
      lastSay: 0, lastGift: 0, online: !!o.bot
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
    while (left > 0) {
      var best = null, bestR = 2;
      for (var i = 0; i < 3; i++) { var k = order[i]; if (j[k] < s[k]) { var r = j[k] / s[k]; if (r < bestR) { bestR = r; best = k; } } }
      if (!best) break;
      j[best]++; left--;
    }
    v.jobs = j;
  };
  World.prototype.tickVillage = function (v, now) {
    var dt = Math.min((now - v.last) / 1000, 8 * 3600);
    if (dt <= 0) return;
    v.last = now;
    var self = this;
    v.queue = v.queue.filter(function (q) {
      if (q.doneAt > now) return true;
      if (q.type === 'wall') v.wall = q.to;
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
      if (count(v, type) >= limit(type, centerLevel(v))) return { ok: false, msg: '數量已達上限，先升級部落中心' };
      if (v.queue.length >= BUILDERS) return { ok: false, msg: '同時只能進行 ' + BUILDERS + ' 項工程' };
      var c = cost(type, 1);
      if (!can(v, c)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, c);
      v.tiles[tile] = { type: type, level: 0, busy: true };
      v.queue.push({ id: this.id('q'), tile: tile, type: type, to: 1, doneAt: now + buildTime(type, 1) * 1000 / this.speed });
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
      if (armyTotal(v) >= armyCap(v)) return { ok: false, msg: '人數已滿，升級訓練場可以增加名額' };
      if (!can(v, u.cost)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, u.cost);
      var start = v.train.length ? v.train[v.train.length - 1].doneAt : now;
      v.train.push({ u: a.u, doneAt: Math.max(start, now) + u.time * 1000 / this.speed });
    },
    attack: function (v, a, now) {
      var t = this.villages[a.to], w = int(a.w), ar = int(a.a);
      if (!t || t.id === v.id) return { ok: false, msg: '找不到目標' };
      if (w < 0 || ar < 0 || w + ar < 1) return { ok: false, msg: '至少要派出一位勇士' };
      if (w > v.units.w || ar > v.units.a) return { ok: false, msg: '留在部落的人數不夠' };
      if (v.ally && v.ally === t.ally) return { ok: false, msg: '不能出征同一個聯盟的部落' };
      if (now < t.shieldUntil || now < t.newbieUntil) return { ok: false, msg: '對方正受到保護' };
      if (!t.bot && centerLevel(v) - centerLevel(t) > 1) return { ok: false, msg: '對方規模比你小太多，不能出征' };
      if ((v.cool[t.id] || 0) > now) return { ok: false, msg: '才剛交手過，晚一點再來' };
      if (this.marches.filter(function (m) { return m.from === v.id; }).length >= 2) return { ok: false, msg: '最多同時派出兩支隊伍' };
      v.units.w -= w; v.units.a -= ar; v.away.w += w; v.away.a += ar;
      v.newbieUntil = 0; v.shieldUntil = 0;
      var d = Geo.hexDist(this.map.byId[v.hex], this.map.byId[t.hex]);
      var travel = Math.min(60, 6 + 2.5 * d) * 1000 / this.speed;
      this.marches.push({ id: this.id('m'), from: v.id, to: t.id, w: w, a: ar, departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null });
      v.cool[t.id] = now + 120000;
      return { ok: true, msg: '隊伍出發了' };
    },
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

  // ---------- 出征隊伍 ----------
  World.prototype.resolveMarch = function (m, now) {
    var v = this.villages[m.from], t = this.villages[m.to];
    if (!v) return false;
    if (m.phase === 'back') {
      v.units.w += m.w; v.units.a += m.a; v.away.w = Math.max(0, v.away.w - m.w0); v.away.a = Math.max(0, v.away.a - m.a0);
      if (m.loot) for (var k in m.loot) addRes(v, k, m.loot[k]);
      return false;
    }
    m.w0 = m.w; m.a0 = m.a;
    var back = function () { m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true; };
    if (!t || now < t.shieldUntil || (v.ally && v.ally === t.ally)) {
      this.pushReport(v, { t: now, role: 'atk', other: t ? t.name : '', win: false, note: '對方正受到保護，隊伍折返。', rounds: [] });
      return back();
    }
    this.tickVillage(v, now); this.tickVillage(t, now);
    var res = battle({ w: m.w, a: m.a }, { w: t.units.w, a: t.units.a, wallHp: t.wall * 80, towers: levelsOf(t, 'tower') }, this.rng);
    var lostA = { w: m.w - res.A.w, a: m.a - res.A.a }, lostD = { w: t.units.w - res.D.w, a: t.units.a - res.D.a };
    t.units.w = res.D.w; t.units.a = res.D.a;
    v.away.w -= lostA.w; v.away.a -= lostA.a; m.w0 = res.A.w; m.a0 = res.A.a;
    m.w = res.A.w; m.a = res.A.a;
    var loot = {}, lootTxt = [];
    if (res.win) {
      // 每位回程的勇士能背 30 份：先帶特產，剩下的空間平均分給糧食與建材
      var prot = caps(t).protect, carry = 30 * (m.w + m.a), want = {}, take = function (k2, n) {
        n = Math.min(n, carry); if (n <= 0) return;
        carry -= n; loot[k2] = n; addRes(t, k2, -n); lootTxt.push(n + ' ' + resName(k2));
      };
      for (var sk in t.sp) take('sp:' + sk, Math.floor(t.sp[sk] * 0.3));
      ['food', 'mat'].forEach(function (k) { want[k] = Math.floor(Math.max(0, t.res[k] - prot) * 0.35); });
      var total = want.food + want.mat, f = total > carry ? carry / total : 1;
      var nf = Math.floor(want.food * f), nm = Math.floor(want.mat * f);
      take('food', nf); take('mat', nm);
      m.loot = loot;
      v.wins++; t.losses++; v.glory += 10 + 2 * centerLevel(t); t.glory = Math.max(0, t.glory - 3);
      t.shieldUntil = now + SHIELD_MS;
      this.log('「' + v.name + '」出征「' + t.name + '」獲勝' + (lootTxt.length ? '，帶回 ' + lootTxt.join('、') : '') + '。', now, 'battle');
    } else {
      v.losses++; t.wins++; t.glory += 5; v.glory = Math.max(0, v.glory - 2);
      this.log('「' + t.name + '」守住了「' + v.name + '」的出征。', now, 'battle');
    }
    var rid = this.id('r');
    this.pushReport(v, { id: rid, t: now, role: 'atk', other: t.name, otherTribe: t.tribe, win: res.win, rounds: res.rounds, loot: loot, lost: lostA });
    this.pushReport(t, { id: rid, t: now, role: 'def', other: v.name, otherTribe: v.tribe, win: !res.win, rounds: res.rounds, loot: loot, lost: lostD });
    if (m.w + m.a === 0) return false;
    return back();
  };
  World.prototype.pushReport = function (v, rep) {
    rep.id = rep.id || this.id('r'); rep.seen = false;
    v.reports.unshift(rep); if (v.reports.length > 8) v.reports.length = 8;
  };

  // ---------- 示範部落（電腦） ----------
  World.prototype.botStep = function (v, now) {
    var self = this, rng = this.rng, C = centerLevel(v);
    this.tickVillage(v, now);
    if (v.queue.length < BUILDERS && rng() < 0.7) {
      var opts = [], empty = [];
      for (var i = 0; i < TILE_N; i++) {
        var b = v.tiles[i];
        if (!b) { empty.push(i); continue; }
        if (b.busy || b.level >= MAX_LEVEL) continue;
        if (b.type === 'center') { if (can(v, cost('center', b.level + 1))) opts.push({ type: 'upgrade', tile: i }, { type: 'upgrade', tile: i }); }
        else if (b.level < C && can(v, cost(b.type, b.level + 1))) opts.push({ type: 'upgrade', tile: i });
      }
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
  World.prototype.detail = function (id, now) {
    var v = this.villages[id]; if (!v) return null;
    this.tickVillage(v, now);
    var p = this.pub(v, now);
    p.tiles = v.tiles.map(function (b) { return b ? { type: b.type, level: b.level, busy: !!b.busy } : null; });
    p.pop = v.pop;
    return p;
  };
  World.prototype.snapshot = function (id, now) {
    var v = this.villages[id], self = this;
    if (!v) return null;
    var me = JSON.parse(JSON.stringify(v));
    me.d = derived(v, this.speed);
    var al = {};
    for (var k in this.alliances) al[k] = { id: k, name: this.alliances[k].name, leader: this.alliances[k].leader, n: this.alliances[k].members.length };
    return {
      now: now, speed: this.speed, me: me,
      villages: Object.keys(this.villages).map(function (k) { return self.pub(self.villages[k], now); }),
      marches: this.marches.map(function (m) { return { id: m.id, from: m.from, to: m.to, departAt: m.departAt, arriveAt: m.arriveAt, phase: m.phase, n: m.w + m.a }; }),
      market: this.market.map(function (o) { return { id: o.id, from: o.from, fromName: (self.villages[o.from] || {}).name || '', give: o.give, giveN: o.giveN, want: o.want, wantN: o.wantN }; }),
      feed: this.feed.slice(-30), alliances: al
    };
  };
  World.prototype.toJSON = function () {
    return { villages: this.villages, tokens: this.tokens, marches: this.marches, market: this.market, feed: this.feed, alliances: this.alliances, seq: this.seq };
  };
  World.prototype.load = function (d) {
    if (!d || !d.villages) return this;
    this.villages = d.villages; this.tokens = d.tokens || {}; this.marches = d.marches || []; this.market = d.market || [];
    this.feed = d.feed || []; this.alliances = d.alliances || {}; this.seq = d.seq || 1;
    for (var id in this.villages) { this.villages[id].online = !!this.villages[id].bot; }
    return this;
  };

  World.rules = {
    GRID_W: GRID_W, GRID_H: GRID_H, TILE_N: TILE_N, CENTER_TILE: CENTER_TILE, TYPES: TYPES, MAX_LEVEL: MAX_LEVEL, UNIT: UNIT,
    CENTER_UP: CENTER_UP, BUILDERS: BUILDERS, FOREIGN_SP: FOREIGN_SP, cost: cost, buildTime: buildTime, limit: limit, count: count,
    resName: resName, battle: battle, derived: derived, popCap: popCap
  };
  return World;
});
