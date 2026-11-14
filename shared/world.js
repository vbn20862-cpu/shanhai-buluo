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
  var TYPES = ['house', 'farm', 'mat', 'special', 'storage', 'barracks', 'tower', 'unique'];   // unique：各族的獨特建築，任務第 3 章解鎖，只能蓋一座
  var DEF = {
    house: { base: { food: 15, mat: 40 }, time: 8 },
    farm: { base: { food: 0, mat: 35 }, time: 8 },
    mat: { base: { food: 35, mat: 0 }, time: 8 },
    special: { base: { food: 60, mat: 60 }, time: 14 },
    storage: { base: { food: 30, mat: 70 }, time: 12 },
    barracks: { base: { food: 80, mat: 80 }, time: 16 },
    tower: { base: { food: 20, mat: 90 }, time: 14 },
    unique: { base: { food: 150, mat: 150 }, time: 30 },
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
  var FOREIGN_SP = true;    // 部落中心升到 3 級以上要用別族的特產（靠市集、中立聚落、送禮或出征取得）
  // 族群關係：每兩族之間一個數值，-100 到 100，起始 0。交易、送禮、結盟會上升，出征會下降，會慢慢回到 0
  var REL = { friend: 20, hostile: -20, trade: 2, gift: 1, ally: 3, attack: -4, win: -2, point: -3, decayMs: 300000 };
  // 野地資源點：每位駐守的人每秒的產量（最多算 6 人）
  var POINT = { fish: { key: 'food', rate: 0.07, zh: '漁場' }, hunt: { key: 'food', rate: 0.06, zh: '獵場' }, wood: { key: 'mat', rate: 0.07, zh: '林地' } };
  var POINT_MAX = 2, POINT_UNITS = 6;
  // 中立聚落：3 份自己的特產換 2 份別族特產，或 120 糧食／建材換 1 份；每種特產有存量，會慢慢補回來
  var SETTLE = { stock: 20, refillMs: 30000, give: 3, get: 2, resCost: 120 };
  // 任務主線：五章的目標各族相同（故事不同），獎勵依序是器物、器物、獨特建築、獨特兵種、傳說英雄與祝福
  var QUESTS = [
    { type: 'land', n: 9, text: '開墾到 9 塊地' },
    { type: 'have', n: 300, text: '倉庫裡存到 300 糧食' },
    { type: 'trade', n: 2, text: '和別人交換 2 次（市集或中立聚落）' },
    { type: 'units', n: 4, text: '擁有 4 名戰士' },   // 訓練場一級的名額是 6，留兩個位置給解鎖的獨特兵種
    { type: 'point', n: 1, text: '佔領一處野地資源點' }
  ];
  var BUILDERS = 2, SHIELD_MS = 300000, NEWBIE_MS = 600000, OFFER_MS = 600000;
  var UNIT_U = { cost: { food: 30, mat: 20 }, time: 6 };
  var BLESS = { ms: 600000, again: 1200000, food: 150 }, HERO_REST = 600000;   // 共聚：準備大家一起吃的糧食，之後一段時間產量增加

  // ---------- 可以從後台調整的數值 ----------
  /* 每一項：k 代號、g 分組、zh 名稱、min／max／step 範圍、def 預設值、note 說明。
   * 要新增一個可調的數值：在這裡加一行，再到規則裡用 TUNE.代號 取值；後台的欄位會自動長出來。 */
  /* 預設值是階段 6 用自動模擬對戰校正過的：六種情境下，任兩族之間的整體勝率都在 47%～53%（目標是 45%～55%）。改動後請跑 npm run sim 確認 */
  var TUNE_DEF = [
    { k: 'pace', g: '節奏', zh: '遊戲節奏', min: 1, max: 100, step: 1, def: 1, note: '數字越大越慢：產量除以它，建設、訓練、路程、保護、共聚的時間乘以它。1 是快速試玩，20 是正式。對戰中每個階段的秒數不受影響。' },
    { k: 'buildTime', g: '節奏', zh: '建設與拓荒時間倍率', min: 0.2, max: 5, step: 0.1, def: 1 },
    { k: 'trainTime', g: '節奏', zh: '訓練時間倍率', min: 0.2, max: 5, step: 0.1, def: 1 },
    { k: 'marchTime', g: '節奏', zh: '出征路程倍率', min: 0.2, max: 5, step: 0.1, def: 1 },
    { k: 'guardTime', g: '節奏', zh: '保護時間倍率', min: 0, max: 10, step: 0.1, def: 1, note: '新部落的保護，以及被攻破之後的保護。' },
    { k: 'prod', g: '經濟', zh: '全體產量倍率', min: 0.2, max: 5, step: 0.05, def: 1 },
    { k: 'cost', g: '經濟', zh: '建築與拓荒花費倍率', min: 0.2, max: 5, step: 0.05, def: 1 },
    { k: 'loot', g: '經濟', zh: '出征帶走物資的倍率', min: 0, max: 2, step: 0.05, def: 1 },
    { k: 'popBonus', g: '經濟', zh: '玩家最少的族群：產量加成', min: 0, max: 0.5, step: 0.01, def: 0.15 },
    { k: 'itemBonus', g: '經濟', zh: '每件器物的產量加成', min: 0, max: 0.3, step: 0.01, def: 0.08 },
    { k: 'blessMult', g: '經濟', zh: '共聚時的產量倍率', min: 1, max: 1.5, step: 0.01, def: 1.15 },
    { k: 'atkW', g: '對戰', zh: '勇士：攻擊', min: 1, max: 40, step: 1, def: 10 },
    { k: 'hpW', g: '對戰', zh: '勇士：耐力', min: 1, max: 80, step: 1, def: 30 },
    { k: 'atkA', g: '對戰', zh: '弓手：攻擊', min: 1, max: 40, step: 1, def: 12 },
    { k: 'hpA', g: '對戰', zh: '弓手：耐力', min: 1, max: 80, step: 1, def: 18 },
    { k: 'wallPct', g: '對戰', zh: '圍籬每一級：守軍戰力增加（%）', min: 0, max: 30, step: 1, def: 8 },
    { k: 'towerPow', g: '對戰', zh: '瞭望台每一級的火力', min: 0, max: 30, step: 1, def: 9 },
    { k: 'guardPct', g: '獨特兵種與英雄', zh: '山林獵手：守部落時攻擊增加（%）', min: 0, max: 100, step: 1, def: 20 },
    { k: 'bandPct', g: '獨特兵種與英雄', zh: '部落青年：每多一位同伴攻擊增加（%）', min: 0, max: 10, step: 0.5, def: 2 },
    { k: 'bandMax', g: '獨特兵種與英雄', zh: '部落青年：同伴加成的上限（%）', min: 0, max: 100, step: 1, def: 30 },
    { k: 'wallHpPct', g: '獨特兵種與英雄', zh: '石牆守衛：守部落時耐力增加（%）', min: 0, max: 100, step: 1, def: 10 },
    { k: 'abVolley2', g: '獨特兵種與英雄', zh: '凝神一箭：攻擊倍率', min: 1, max: 3, step: 0.05, def: 1.6 },
    { k: 'abVolley2Take', g: '獨特兵種與英雄', zh: '凝神一箭：損失變成幾成（1 是不變）', min: 0.4, max: 1, step: 0.05, def: 1 },
    { k: 'abRelay', g: '獨特兵種與英雄', zh: '世代接力：這個階段的攻擊倍率（一般重整是 0.6）', min: 0.6, max: 1.5, step: 0.05, def: 0.7 },
    { k: 'abRelayBack', g: '獨特兵種與英雄', zh: '世代接力：負傷的人有幾成歸隊（無條件進位；一般重整是 0.25）', min: 0.25, max: 1, step: 0.05, def: 0.5 },
    { k: 'abUnity', g: '獨特兵種與英雄', zh: '齊心：損失變成幾成（0.5 是減半）', min: 0.1, max: 1, step: 0.05, def: 0.5 },
    { k: 'abSteadfast', g: '獨特兵種與英雄', zh: '守望：損失再變成幾成', min: 0.1, max: 1, step: 0.05, def: 0.5 },
    { k: 'abSteadfastOut', g: '獨特兵種與英雄', zh: '守望：這個階段的攻擊倍率（一般重整是 0.6）', min: 0.6, max: 1.5, step: 0.05, def: 1 },
    { k: 'watchDefPct', g: '獨特建築', zh: '望樓：守軍戰力增加（%）', min: 0, max: 50, step: 1, def: 11 },
    { k: 'watchSlow', g: '獨特建築', zh: '望樓：來襲的路程倍率', min: 1, max: 3, step: 0.1, def: 1.5 },
    { k: 'rangeYield', g: '獨特建築', zh: '石板豬圈：資源點產量倍率', min: 1, max: 3, step: 0.05, def: 1.5 },
    { k: 'pondFood', g: '獨特建築', zh: '巴拉告：每分鐘固定的糧食（節奏 1 時）', min: 0, max: 60, step: 1, def: 18 },
    { k: 'pondSp', g: '獨特建築', zh: '巴拉告：每分鐘固定的漁獲（節奏 1 時）', min: 0, max: 10, step: 0.1, def: 1.8 },
    { k: 'vaultProt', g: '獨特建築', zh: '芋頭窯：保護量倍率', min: 1, max: 4, step: 0.1, def: 2 },
    { k: 'vaultCap', g: '獨特建築', zh: '芋頭窯：倉庫容量增加', min: 0, max: 1000, step: 50, def: 300 }
  ];
  Tribes.playable().forEach(function (t) {   // 每一族：產量倍率、獨特兵種的攻擊與耐力
    TUNE_DEF.push({ k: 'prod_' + t.id, g: t.zh, zh: t.zh + '：產量倍率', min: 0.5, max: 2, step: 0.01, def: 1 });
    if (t.uniq) TUNE_DEF.push({ k: 'uAtk_' + t.id, g: t.zh, zh: t.uniq.unit.zh + '：攻擊', min: 1, max: 40, step: 1, def: t.uniq.unit.atk },
      { k: 'uHp_' + t.id, g: t.zh, zh: t.uniq.unit.zh + '：耐力', min: 1, max: 80, step: 1, def: t.uniq.unit.hp });
  });
  var TUNE_BY = {}; TUNE_DEF.forEach(function (d) { TUNE_BY[d.k] = d; });
  function tuneDefaults() { var o = Object.create(null); TUNE_DEF.forEach(function (d) { o[d.k] = d.def; }); return o; }
  var TUNE = tuneDefaults();   // 目前生效的數值。每個世界有自己的一份，執行規則前會換成那個世界的
  /* 把 patch 裡認得的數值寫進 target（預設是目前生效的那一份）：超出範圍的夾回範圍內，不認得的略過。回傳有變動的代號 */
  function setTune(patch, target) {
    var changed = []; target = target || TUNE;
    for (var k in patch || {}) {
      var d = TUNE_BY[k], x = +patch[k];
      if (!d || !isFinite(x)) continue;
      x = Math.max(d.min, Math.min(d.max, x)); x = +(Math.round(x / d.step) * d.step).toFixed(4);
      if (target[k] !== x) { target[k] = x; changed.push(k); }
    }
    return changed;
  }
  // 以「節奏 1」為準的秒數或毫秒，換算成目前節奏下的長度
  function paced(x) { return x * TUNE.pace; }
  function trainTime(u) { return Math.max(1, Math.round((u === 'u' ? UNIT_U : UNIT[u]).time * TUNE.pace * TUNE.trainTime)); }
  function marchSecs(dist, watch) { return Math.min(60, 6 + 2.5 * dist) * TUNE.pace * TUNE.marchTime * (watch ? TUNE.watchSlow : 1); }
  function shieldMs() { return SHIELD_MS * TUNE.pace * TUNE.guardTime; }
  // 英雄能力：算成哪一種指令，以及這個階段的額外效果（out 我方輸出、take 我方承受、firm 重整時不減輸出、holdOut 重整時的輸出折扣、rallyFrac 負傷的人歸隊的比例）
  function ability(id) {
    switch (id) {
      case 'volley2': return { as: 'volley', out: TUNE.abVolley2, take: TUNE.abVolley2Take };
      case 'relay': return { as: 'hold', rallyFrac: TUNE.abRelayBack, holdOut: TUNE.abRelay };
      case 'unity': return { as: 'charge', take: TUNE.abUnity };
      case 'steadfast': return { as: 'hold', holdOut: TUNE.abSteadfastOut, take: TUNE.abSteadfast };
    }
    return { as: 'hold' };
  }
  var OFFLINE_MAX = 8 * 3600000;
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

  /* 沒有原型的字典。玩家送來的名稱會拿來查表，一般物件遇到 __proto__、constructor、toString 這類名稱會查到內建的東西，
   * 輕則判斷錯誤、重則整個伺服器出錯，所以凡是會被外來名稱查到的表都用這個 */
  function dict(o) { var d = Object.create(null); if (o) Object.keys(o).forEach(function (k) { d[k] = o[k]; }); return d; }
  CLEAR = dict(CLEAR); DEF = dict(DEF); CENTER_UP = dict(CENTER_UP); UNIT = dict(UNIT); POINT = dict(POINT); CMDS = dict(CMDS); PHRASES = dict(PHRASES); TUNE_BY = dict(TUNE_BY);
  function r5(n) { return Math.round(n / 5) * 5; }
  function cost(type, level) {
    if (type === 'center') { var c = CENTER_UP[level]; return c ? { food: r5(c.food * TUNE.cost), mat: r5(c.mat * TUNE.cost) } : null; }
    var d = DEF[type], m = MULT[level - 1] * TUNE.cost;
    return { food: r5(d.base.food * m), mat: r5(d.base.mat * m) };
  }
  function buildTime(type, level) {
    var base = type === 'center' ? CENTER_UP[level].time : DEF[type].time * TMULT[level - 1];   // 秒數已經算進遊戲節奏
    return Math.max(1, Math.round(base * TUNE.pace * TUNE.buildTime));
  }
  function limit(type, C, v) {
    switch (type) {
      case 'house': case 'farm': case 'mat': return C + 1;
      case 'special': case 'storage': return 1 + Math.floor(C / 2);
      case 'barracks': return 1;
      case 'tower': return Math.max(0, C - 1);
      case 'unique': return v && v.quest >= 3 ? 1 : 0;
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
    var vault = uniq(v) === 'vault';   // 排灣的獨特建築：耐放的存糧，容量多 300、受保護的份量加倍
    return { res: 300 + 200 * C + 400 * st + (vault ? TUNE.vaultCap : 0), sp: 20 + 20 * C + 20 * st, protect: (50 * C + 100 * st) * (vault ? TUNE.vaultProt : 1) };
  }
  function uniq(v) {   // 蓋好獨特建築後的效果代號：watch／range／pond／vault
    var t = Tribes.get(v.tribe);
    return t && t.uniq && sumLevels(v, 'unique') > 0 ? t.uniq.building.effect : '';
  }
  function ustat(tribe) {   // 獨特兵種的數值（攻擊與耐力可以從後台調整）
    var t = Tribes.get(tribe); if (!t || !t.uniq) return null;
    return { kind: t.uniq.unit.kind, trait: t.uniq.unit.trait, zh: t.uniq.unit.zh, atk: TUNE['uAtk_' + tribe], hp: TUNE['uHp_' + tribe] };
  }
  function all3(o) { return o.w + o.a + (o.u || 0); }
  function armyCap(v) { return sumLevels(v, 'barracks') * 6; }
  function armyTotal(v) { return all3(v.units) + all3(v.away) + v.train.length; }
  function pointMax(v) { return POINT_MAX + (uniq(v) === 'range' ? 1 : 0); }
  function pointRate(kind, v) { return kind.rate * (v && uniq(v) === 'range' ? TUNE.rangeYield : 1) * TUNE.prod / TUNE.pace; }   // 資源點每位駐守的人每秒的產量
  function rates(v, speed) {
    var s = slots(v), t = Tribes.get(v.tribe), b = t && t.bonus, out = {}, g = speed * TUNE.prod * (TUNE['prod_' + v.tribe] || 1) / TUNE.pace;   // 後台的產量倍率與遊戲節奏
    ['food', 'mat', 'special'].forEach(function (k) {
      var m = (b && b.key === k ? b.mult : 1) * (1 + (v.pb || 0));   // 族群特長，加上人數少的族群的加成
      if ((k === 'food' && v.quest >= 1) || (k === 'mat' && v.quest >= 2)) m *= 1 + TUNE.itemBonus;   // 任務拿到的器物
      if (v.blessed) m *= TUNE.blessMult;                                                        // 共聚之後的同心
      out[k] = Math.min(v.jobs[k], s[k]) * RATE[k] * m * g;
    });
    if (uniq(v) === 'pond') { out.food += TUNE.pondFood / 60 * g; out.special += TUNE.pondSp / 60 * g; }
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
      armyCap: armyCap(v), builders: BUILDERS, prosperity: prosperity(v), center: centerLevel(v), pointMax: pointMax(v), uniq: uniq(v) };
  }
  /* 這塊地能不能拓荒：要是山林、緊鄰已開墾的地、部落中心等級夠、有空的工程名額、糧食夠 */
  function clearInfo(v, i) {
    var s = SITES[i], out = { ok: false, why: '' };
    if (!s || v.land[i]) { out.why = '這裡已經開墾過了'; return out; }
    var c = CLEAR[s.ring]; out.food = r5(c.food * TUNE.cost); out.time = Math.max(1, Math.round(c.time * TUNE.pace * TUNE.buildTime)); out.gain = c.gain;
    if (v.queue.some(function (q) { return q.type === 'clear' && q.tile === i; })) out.why = '正在拓荒';
    else if (!s.near.some(function (j) { return v.land[j]; })) out.why = '要從已經開墾的地方往外拓荒';
    else if (centerLevel(v) < c.center) out.why = 'center';
    else if (v.queue.length >= BUILDERS) out.why = '同時只能進行 ' + BUILDERS + ' 項工程';
    else if (v.res.food < out.food) out.why = '糧食不足';
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
  /* 指令之間的相剋：衝鋒剋重整，重整剋掩護射擊，掩護射擊剋衝鋒 */
  function beats(x, y) { return (x === 'charge' && y === 'hold') || (x === 'hold' && y === 'volley') || (x === 'volley' && y === 'charge'); }
  /* 這個階段雙方實際承受的倍率。用了英雄能力的一方不剋人、也不被剋（指令之間的相剋只發生在一般指令之間） */
  function edge(ca, cd, heroA, heroD) {
    return { a: heroA ? taken(ca, '') : taken(ca, heroD ? '' : cd), d: heroD ? taken(cd, '') : taken(cd, heroA ? '' : ca) };
  }
  function mkSide(w, a, u, tribe, def) { return { w: w, a: a, u: u || 0, pool: 0, lostW: 0, lostA: 0, lostU: 0, st: ustat(tribe), def: !!def }; }
  function output(s, cmd, mod) {
    var st = s.st, u = s.u || 0, o = s.w * TUNE.atkW * (cmd === 'charge' ? 1.5 : 1) + s.a * TUNE.atkA * (cmd === 'volley' ? 1.5 : 1);
    if (u && st) {
      var m = st.kind === 'ranged' ? (cmd === 'volley' ? 1.5 : 1) : (cmd === 'charge' ? 1.5 : 1);
      if (st.trait === 'guard' && s.def) m *= 1 + TUNE.guardPct / 100;                         // 守在自己部落時更強
      if (st.trait === 'band') m *= 1 + Math.min(TUNE.bandMax, TUNE.bandPct * u) / 100;        // 同行的人越多越強
      o += u * st.atk * m;
    }
    if (cmd === 'hold' && !(mod && mod.firm)) o *= (mod && mod.holdOut) || 0.6;   // 重整時攻擊打六折；英雄能力可以改變這個折扣
    return o * ((mod && mod.out) || 1);
  }
  function hit(s, dmg) {   // 勇士在前面先承受；近戰的獨特兵種排第二，遠程的排最後
    var st = s.st, uhp = st ? st.hp * (st.trait === 'wall' && s.def ? 1 + TUNE.wallHpPct / 100 : 1) : 1;
    var order = st && st.kind === 'ranged' ? [['w', 'lostW', TUNE.hpW], ['a', 'lostA', TUNE.hpA], ['u', 'lostU', uhp]] : [['w', 'lostW', TUNE.hpW], ['u', 'lostU', uhp], ['a', 'lostA', TUNE.hpA]];
    s.pool += dmg;
    for (var i = 0; i < 3; i++) {
      var k = order[i][0];
      while ((s[k] || 0) > 0 && s.pool >= order[i][2]) { s[k]--; s[order[i][1]] = (s[order[i][1]] || 0) + 1; s.pool -= order[i][2]; }
      if ((s[k] || 0) > 0) break;
    }
    if (all3(s) === 0) s.pool = 0;
  }
  function rally(s, frac) {   // 重整：這一路負傷的人有四分之一歸隊（英雄的「世代接力」比例更高）
    var back = 0;
    [['w', 'lostW'], ['a', 'lostA'], ['u', 'lostU']].forEach(function (p) {
      var lost = s[p[1]] || 0, n = frac ? Math.min(lost, Math.ceil(lost * frac - 1e-9)) : Math.floor(lost / 4);   // 英雄能力的比例無條件進位，人少的時候才不會等於沒用
      s[p[0]] = (s[p[0]] || 0) + n; s[p[1]] = (s[p[1]] || 0) - n; back += n;
    });
    return back;
  }
  /* 打一個階段。b.lanes[i] = {a: 攻方, d: 守方, broken}；mods：雙方這個階段的英雄效果；回傳這個階段的紀錄 */
  function fightPhase(b, ca, cd, rng, mods) {
    var ma = (mods && mods.a) || {}, md = (mods && mods.d) || {}, eg = edge(ca, cd, !!(mods && mods.a), !!(mods && mods.d));
    var open = b.lanes.filter(function (l) { return !l.broken && all3(l.a) > 0; }).length || 1;
    var rec = { phase: b.phase, a: ca, d: cd, lanes: [] };
    b.lanes.forEach(function (l, i) {
      var before = { a: all3(l.a), d: all3(l.d) }, r = { i: i, broken: false, backA: 0, backD: 0 };
      if (!l.broken && all3(l.a) > 0) {
        if (ca === 'hold') r.backA = rally(l.a, ma.rallyFrac);
        if (cd === 'hold') r.backD = rally(l.d, md.rallyFrac);
        var outA = output(l.a, ca, ma) * (0.92 + rng() * 0.16);
        var outD = (output(l.d, cd, md) * (1 + b.wall * TUNE.wallPct / 100) * (b.defMul || 1) + b.towers / open) * (0.92 + rng() * 0.16);
        hit(l.a, outD * eg.a * (ma.take || 1)); hit(l.d, outA * eg.d * (md.take || 1));
        if (all3(l.d) === 0 && all3(l.a) > 0) { l.broken = true; r.broken = true; }
      }
      r.aLost = before.a + r.backA - all3(l.a); r.dLost = before.d + r.backD - all3(l.d);
      rec.lanes.push(r);
    });
    // 攻破一路後，那一路的人下個階段轉去支援還在打的路
    b.lanes.forEach(function (l) {
      if (!l.broken || l.moved || all3(l.a) === 0) return;
      var target = b.lanes.filter(function (o) { return !o.broken; }).sort(function (x, y) { return all3(x.d) - all3(y.d); })[0];   // 去守軍最少的那一路
      if (target) { ['w', 'a', 'u'].forEach(function (k) { target.a[k] = (target.a[k] || 0) + (l.a[k] || 0); l.a[k] = 0; }); }
      l.moved = true;
    });
    return rec;
  }

  /* 建立一場對戰的戰場（實際對戰與自動模擬共用）。
   * A = { tribe, w, a, u, lanes, hero }；D = 同上，再加 wall（圍籬等級）、towers（各座瞭望台的等級）、uniq（獨特建築的效果代號） */
  function makeField(A, D) {
    var aw = split(A.w, A.lanes), aa = split(A.a, A.lanes), au = split(A.u || 0, A.lanes), dw = split(D.w, D.lanes), da = split(D.a, D.lanes), du = split(D.u || 0, D.lanes), tw = D.towers || [];
    return { aTribe: A.tribe, dTribe: D.tribe, wall: D.wall || 0, towers: tw.reduce(function (s, L) { return s + TUNE.towerPow * L; }, 0), towerN: tw.length,
      defMul: D.uniq === 'watch' ? 1 + TUNE.watchDefPct / 100 : 1, hero: { a: !!A.hero, d: !!D.hero },
      lanes: [0, 1, 2].map(function (i) { return { a: mkSide(aw[i], aa[i], au[i], A.tribe, false), d: mkSide(dw[i], da[i], du[i], D.tribe, true), broken: false }; }),
      start: { a: { w: A.w, a: A.a, u: A.u || 0 }, d: { w: D.w, a: D.a, u: D.u || 0 } }, phase: 1, log: [] };
  }
  /* 打一個階段。ca、cd 是雙方的指令，可以是 'hero'（英雄能力，一場一次）。回傳這個階段的紀錄（ha、hd 是用掉的英雄能力） */
  function playPhase(b, ca, cd, rng) {
    var cmd = { a: ca, d: cd }, mods = {}, used = {};
    ['a', 'd'].forEach(function (sd) {
      if (cmd[sd] !== 'hero') return;
      if (!b.hero[sd]) { cmd[sd] = sd === 'a' ? 'charge' : 'hold'; return; }
      var tr = Tribes.get(sd === 'a' ? b.aTribe : b.dTribe), ab = ability(tr.hero.ability);
      mods[sd] = ab; used[sd] = tr.hero.ability; cmd[sd] = ab.as; b.hero[sd] = false;
    });
    var rec = fightPhase(b, cmd.a, cmd.d, rng, mods);
    rec.ha = used.a || null; rec.hd = used.d || null;
    b.log.push(rec);
    return rec;
  }
  /* 打完了嗎：三個階段都打完，或是已經沒有還在打的路、也沒有無人防守的路 */
  function fieldOver(b) {
    var fighting = b.lanes.some(function (l) { return !l.broken && all3(l.a) > 0 && all3(l.d) > 0; });
    var unopposed = b.lanes.some(function (l) { return !l.broken && all3(l.a) > 0 && all3(l.d) === 0; });
    return b.phase >= PHASES || !(fighting || unopposed);
  }
  /* 結算：攻破幾路、誰贏、雙方還剩多少人 */
  function fieldResult(b) {
    var broken = b.lanes.filter(function (l) { return l.broken; }).length, left = { w: 0, a: 0, u: 0 }, home = { w: 0, a: 0, u: 0 };
    b.lanes.forEach(function (l) { ['w', 'a', 'u'].forEach(function (k) { left[k] += l.a[k] || 0; home[k] += l.d[k] || 0; }); });
    return { broken: broken, win: broken >= 2, left: left, home: home, lostA: all3(b.start.a) - all3(left), lostD: all3(b.start.d) - all3(home) };
  }

  // ---------- 自動模擬對戰（平衡用） ----------
  /* 模擬用的下指令方式：三種指令機率相同。有英雄的話一場用一次——
   * 「讓負傷的人歸隊」這類能力留到第二、三階段（開場沒有人負傷，用了等於浪費），其他能力在三個階段裡隨機挑一個 */
  function randomPolicy(b, side, rng) {
    if (b.hero[side]) {
      var tr = Tribes.get(side === 'a' ? b.aTribe : b.dTribe), late = tr.hero.ability === 'relay', first = late ? 2 : 1;
      if (b.phase >= first && rng() < 1 / (PHASES - b.phase + 1)) return 'hero';
    }
    return ['charge', 'volley', 'hold'][Math.floor(rng() * 3)];
  }
  /* 模擬一場，不經過世界、不花時間。pa、pd：決定每個階段下什麼指令的函式 (戰場, 'a' 或 'd', rng) → 指令 */
  function simBattle(A, D, pa, pd, rng) {
    var b = makeField(A, D);
    for (;;) {
      playPhase(b, (pa || randomPolicy)(b, 'a', rng), (pd || randomPolicy)(b, 'd', rng), rng);
      if (fieldOver(b)) break;
      b.phase++;
    }
    return fieldResult(b);
  }
  /* 各族互打的勝率表。o = { n: 每一組打幾場, army: {w,a,u} 雙方相同的隊伍, wall, towers, uniq: 有沒有蓋獨特建築, hero: 有沒有英雄, rng }
   * 回傳 pairs（攻方族 × 守方族的攻方勝率）、duel（兩族之間的整體勝率）、tribes（每一族的總評）、base（平均攻方勝率） */
  function simMatrix(o) {
    o = o || {};
    var n = Math.max(20, Math.min(5000, Math.round(o.n || 400))), rng = o.rng || Math.random, ids = Tribes.playable().map(function (t) { return t.id; });
    var army = o.army || { w: 4, a: 4, u: 4 }, wall = o.wall == null ? 1 : o.wall, towers = o.towers || [], hero = o.hero !== false, ub = o.uniq !== false;
    var atk = {}, out = { n: n, army: army, wall: wall, towers: towers, hero: hero, uniq: ub, pairs: [], duel: [], tribes: [], base: 0 }, sum = 0;
    ids.forEach(function (x) {
      ids.forEach(function (y) {
        var win = 0, broken = 0;
        for (var i = 0; i < n; i++) {
          var r = simBattle({ tribe: x, w: army.w, a: army.a, u: army.u, lanes: LANE_KEYS[Math.floor(rng() * 4)], hero: hero },
            { tribe: y, w: army.w, a: army.a, u: army.u, lanes: LANE_KEYS[Math.floor(rng() * 4)], hero: hero, wall: wall, towers: towers, uniq: ub ? Tribes.get(y).uniq.building.effect : '' }, null, null, rng);
          if (r.win) win++; broken += r.broken;
        }
        atk[x + '>' + y] = win / n; sum += win / n;
        out.pairs.push({ a: x, d: y, win: +(win / n).toFixed(3), broken: +(broken / n).toFixed(2) });
      });
    });
    out.base = +(sum / (ids.length * ids.length)).toFixed(3);
    // 兩族之間的整體勝率：X 打 Y 的勝率，加上 Y 打 X 時 X 守住的機率，除以二
    ids.forEach(function (x, i) {
      var total = 0, cnt = 0, a2 = 0, d2 = 0;
      ids.forEach(function (y, j) {
        if (x === y) return;
        var s = (atk[x + '>' + y] + 1 - atk[y + '>' + x]) / 2; total += s; cnt++; a2 += atk[x + '>' + y]; d2 += 1 - atk[y + '>' + x];
        if (i < j) out.duel.push({ x: x, y: y, score: +s.toFixed(3) });
      });
      out.tribes.push({ id: x, score: +(total / cnt).toFixed(3), atk: +(a2 / cnt).toFixed(3), def: +(d2 / cnt).toFixed(3), mirror: +atk[x + '>' + x].toFixed(3) });
    });
    out.worst = out.duel.reduce(function (m, d) { return Math.max(m, Math.abs(d.score - 0.5)); }, 0);
    out.ok = out.worst <= 0.05;   // 目標：任兩族之間落在 45%～55%
    return out;
  }

  // ---------- 世界 ----------
  function World(opts) {
    opts = opts || {};
    this.speed = opts.speed || 1;   // 測試用的整體加速（連對戰的讀秒也加速）。正式的快慢用可調數值裡的「遊戲節奏」
    this.tune = tuneDefaults(); setTune(opts.tune, this.tune); this.tuneV = 1; this.adminLog = [];
    TUNE = this.tune;
    this.reportAfter = opts.reportAfter == null ? 60000 : opts.reportAfter;   // 離開多久以上才顯示離線報告
    this.newbieMs = opts.newbieMs == null ? NEWBIE_MS : opts.newbieMs;         // 新部落受保護多久
    this.rng = opts.rng || Math.random;
    this.map = Geo.build();
    this.villages = dict(); this.tokens = dict(); this.marches = []; this.market = []; this.feed = []; this.alliances = dict();
    this.battles = dict(); this.stats = dict(); this.rel = dict(); this.points = dict(); this.stock = dict();
    this.lastRel = 0; this.lastStock = 0; this.lastPop = 0;
    this.seq = 1; this.lastBot = 0;
  }
  World.prototype.id = function (p) { return p + (this.seq++).toString(36); };
  World.prototype.ms = function (base) { return base * TUNE.pace / this.speed; };   // 以節奏 1 為準的毫秒數，換成這個世界實際要等多久
  /* 後台：改可調數值。回傳實際有變動的項目 */
  World.prototype.setTune = function (patch) {
    TUNE = this.tune;
    var before = {}, k; for (k in this.tune) before[k] = this.tune[k];
    var changed = setTune(patch, this.tune);
    if (changed.length) { this.tuneV++; this.popBonus(); }
    return changed.map(function (key) { return { k: key, zh: TUNE_BY[key].zh, from: before[key], to: TUNE[key] }; });
  };
  World.prototype.resetTune = function (keepPace) {
    var d = tuneDefaults(); if (keepPace) d.pace = this.tune.pace;
    return this.setTune(d);
  };
  /* 後台的操作紀錄（最多留 80 筆） */
  World.prototype.adminNote = function (text, now) {
    this.adminLog.push({ t: now, text: text }); if (this.adminLog.length > 80) this.adminLog.splice(0, this.adminLog.length - 80);
  };
  /* 後台：調整某個部落的物資或保護。d = { food, mat, sp: { 族群: 數量 }, shieldMin }，數量可正可負 */
  World.prototype.adminAdjust = function (id, d, now) {
    TUNE = this.tune;
    var v = this.villages[id]; if (!v) return { ok: false, msg: '找不到這個部落' };
    this.tickVillage(v, now);
    var c = caps(v), done = [], n;
    ['food', 'mat'].forEach(function (k) {
      n = Math.round(+d[k] || 0); if (!n) return;
      var to = Math.max(0, Math.min(c.res, v.res[k] + n)); done.push((k === 'food' ? '糧食' : '建材') + ' ' + (to - v.res[k] >= 0 ? '+' : '') + Math.round(to - v.res[k])); v.res[k] = to;
    });
    for (var tk in d.sp || {}) {
      var t = Tribes.get(tk); n = Math.round(+d.sp[tk] || 0); if (!t || !t.playable || !n) continue;
      var cur = v.sp[tk] || 0, to2 = Math.max(0, Math.min(c.sp, cur + n)); done.push(t.sp.zh + ' ' + (to2 - cur >= 0 ? '+' : '') + Math.round(to2 - cur)); addRes(v, 'sp:' + tk, to2 - cur);
    }
    n = +d.shieldMin;
    if (isFinite(n) && d.shieldMin !== '' && d.shieldMin != null) {
      n = Math.max(0, Math.min(1440, n)); v.shieldUntil = n ? now + n * 60000 : 0; if (!n) v.newbieUntil = 0;
      done.push(n ? '保護 ' + n + ' 分鐘' : '取消保護');
    }
    if (!done.length) return { ok: false, msg: '沒有要調整的項目' };
    this.adminNote('調整「' + v.name + '」：' + done.join('、'), now);
    return { ok: true, msg: done.join('、') };
  };
  World.prototype.log = function (text, now, kind) {
    this.feed.push({ id: this.seq++, t: now, kind: kind || 'info', text: text });
    if (this.feed.length > 60) this.feed.splice(0, this.feed.length - 60);
  };
  // 一格可以住好幾個部落（Geo.SLOTS 個）；回傳每格已用掉的位置
  World.prototype.hexSlots = function () {
    var m = dict();
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
      createdAt: now, last: now, res: { food: 120, mat: 120 }, sp: dict(), pop: 4, popAcc: 0,
      jobs: { food: 2, mat: 2, special: 0 }, auto: true, tiles: tiles, land: land, wall: 0, queue: [],
      units: { w: 0, a: 0, u: 0 }, away: { w: 0, a: 0, u: 0 }, train: [], quest: 0, stat: { trade: 0, point: 0 }, blessUntil: 0, blessNext: 0, heroRest: 0, glory: 0, wins: 0, losses: 0, gifts: 0,
      shieldUntil: 0, newbieUntil: o.bot ? 0 : now + this.newbieMs * TUNE.pace * TUNE.guardTime, ally: null, reports: [], cool: dict(),
      lastSay: 0, lastGift: 0, online: !!o.bot, idle: { focus: 'even', upgrade: false, train: false }, offAt: 0,
      def: { lanes: 'even', plan: ['volley', 'hold', 'charge'] }, battle: null
    };
    this.villages[v.id] = v;
    return v;
  };
  World.prototype.join = function (token, o, now) {
    TUNE = this.tune;
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
    var self = this; TUNE = this.tune;
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
      else if (b.level >= C || b.type === 'unique') continue;
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
      v.popAcc += dt * self.speed / TUNE.pace / 10;
      while (v.popAcc >= 1 && v.pop < pc) { v.pop++; v.popAcc -= 1; }
    } else v.popAcc = 0;
    if (v.auto) this.autoJobs(v);
    else {   // 手動分工：人數不能超過族人總數
      var sum = v.jobs.food + v.jobs.mat + v.jobs.special;
      ['special', 'mat', 'food'].forEach(function (k) { while (sum > v.pop && v.jobs[k] > 0) { v.jobs[k]--; sum--; } });
    }
    v.blessed = now < (v.blessUntil || 0);
    var rt = rates(v, this.speed), c = caps(v);
    ['food', 'mat'].forEach(function (k) { if (v.res[k] < c.res) v.res[k] = Math.min(c.res, v.res[k] + rt[k] * dt); });
    var own = v.sp[v.tribe] || 0;
    if (rt.special > 0 && own < c.sp) v.sp[v.tribe] = Math.min(c.sp, own + rt.special * dt);
    for (var hx in this.points) {   // 佔領的野地資源點持續產出
      var pt = this.points[hx];
      if (pt.owner !== v.id) continue;
      var kind = POINT[this.map.byId[hx].wild], gain = pointRate(kind, v) * Math.min(POINT_UNITS, all3(pt)) * dt * this.speed;
      if (v.res[kind.key] < c.res) v.res[kind.key] = Math.min(c.res, v.res[kind.key] + gain);
    }
  };

  // ---------- 族群關係 ----------
  function relKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  World.prototype.relOf = function (a, b) { return a === b ? 0 : (this.rel[relKey(a, b)] || 0); };
  World.prototype.relAdd = function (a, b, n) {
    if (a === b) return;
    var k = relKey(a, b); this.rel[k] = Math.max(-100, Math.min(100, (this.rel[k] || 0) + n));
  };
  World.prototype.relState = function (a, b) { var r = this.relOf(a, b); return r >= REL.friend ? 'friend' : r <= REL.hostile ? 'hostile' : 'neutral'; };
  World.prototype.stockOf = function (sid) {
    var s = this.stock[sid] = this.stock[sid] || dict();
    Tribes.playable().forEach(function (t) { if (s[t.id] == null) s[t.id] = SETTLE.stock; });
    return s;
  };
  /* 目前這一章的進度；全部完成回傳 null */
  World.prototype.questProgress = function (v) {
    var q = QUESTS[v.quest]; if (!q) return null;
    var cur = q.type === 'land' ? v.land.filter(Boolean).length : q.type === 'have' ? Math.floor(v.res.food) : q.type === 'trade' ? v.stat.trade :
      q.type === 'units' ? all3(v.units) + all3(v.away) : v.stat.point;
    return { i: v.quest, cur: Math.min(cur, q.n), n: q.n, done: cur >= q.n, text: q.text };
  };
  World.prototype.pointsOf = function (id) { var out = []; for (var h in this.points) if (this.points[h].owner === id) out.push(h); return out; };

  // ---------- 上線、離線與離線報告 ----------
  function snap(v) { return { food: v.res.food, mat: v.res.mat, sp: v.sp[v.tribe] || 0, pop: v.pop, land: v.land.filter(Boolean).length }; }
  World.prototype.setOnline = function (id, on, now) {
    TUNE = this.tune;
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
    TUNE = this.tune;
    var v = this.villages[id];
    if (!v || !a || typeof a !== 'object') return { ok: false, msg: '找不到部落' };
    this.tickVillage(v, now);
    var fn = typeof a.type === 'string' ? ACTIONS[a.type] : null;
    if (typeof fn !== 'function') return { ok: false, msg: '不支援的動作' };
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
      if (count(v, type) >= limit(type, centerLevel(v), v)) return { ok: false, msg: type === 'unique' ? (v.quest >= 3 ? '這種建築只能蓋一座' : '完成任務第三章才能蓋') : '數量已達上限，先升級部落中心' };
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
      if (b.level >= MAX_LEVEL || b.type === 'unique') return { ok: false, msg: b.type === 'unique' ? '這座建築不用升級' : '已經是最高等級' };
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
      var isU = a.u === 'u', st = isU ? ustat(v.tribe) : null, u = isU ? (st && UNIT_U) : UNIT[a.u];
      if (!u) return { ok: false, msg: '沒有這種單位' };
      if (isU && v.quest < 4) return { ok: false, msg: '完成任務第四章才能訓練' + st.zh };
      if (armyCap(v) === 0) return { ok: false, msg: '要先蓋好訓練場' };
      if (v.battle) return { ok: false, msg: '交戰中不能訓練' };
      if (armyTotal(v) >= armyCap(v)) return { ok: false, msg: '人數已滿，升級訓練場可以增加名額' };
      if (!can(v, u.cost)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, u.cost);
      var start = v.train.length ? v.train[v.train.length - 1].doneAt : now;
      v.train.push({ u: a.u, doneAt: Math.max(start, now) + trainTime(a.u) * 1000 / this.speed });
    },
    quest: function (v, a, now) {   // 領取目前這一章的獎勵
      var p = this.questProgress(v);
      if (!p) return { ok: false, msg: '任務都完成了' };
      if (!p.done) return { ok: false, msg: '目標還沒達成' };
      var i = v.quest; v.quest++;
      if (i === 0) v.res.food += 80; else if (i === 1) v.res.mat += 80;
      else if (i === 4) { v.blessUntil = now + this.ms(BLESS.ms); v.blessNext = now + this.ms(BLESS.again); }
      if (v.quest >= QUESTS.length) { var tr = Tribes.get(v.tribe); this.log('「' + v.name + '」完成了' + (tr && tr.story ? '「' + tr.story.t + '」' : '') + '的全部任務。', now, 'quest'); }   // 只有整條主線完成才上消息，免得洗版
      return { ok: true, msg: '完成第 ' + (i + 1) + ' 章' };
    },
    bless: function (v, a, now) {   // 共聚：準備大家一起吃的糧食，之後一段時間產量增加
      if (v.quest < QUESTS.length) return { ok: false, msg: '完成任務主線之後才能舉辦' };
      if (now < (v.blessNext || 0)) return { ok: false, msg: '才剛辦過，過一陣子再辦' };
      if (v.res.food < BLESS.food) return { ok: false, msg: '糧食不夠準備大家的飯菜' };
      v.res.food -= BLESS.food;
      v.blessUntil = now + this.ms(BLESS.ms); v.blessNext = now + this.ms(BLESS.again); v.blessed = true;
      return { ok: true, msg: '大家聚在一起，同心協力' };
    },
    defense: function (v, a) {   // 佈防：重點守哪一路、不在線上時每個階段下什麼指令
      if (LANE_KEYS.indexOf(a.lanes) >= 0) v.def.lanes = a.lanes;
      if (Array.isArray(a.plan) && a.plan.length === PHASES && a.plan.every(function (c) { return CMDS[c]; })) v.def.plan = a.plan.slice();
    },
    attack: function (v, a, now) {
      var t = this.villages[a.to], w = int(a.w), ar = int(a.a), uu = int(a.u);
      if (!t || t.id === v.id) return { ok: false, msg: '找不到目標' };
      if (w < 0 || ar < 0 || uu < 0 || w + ar + uu < 1) return { ok: false, msg: '至少要派出一個人' };
      if (w > v.units.w || ar > v.units.a || uu > v.units.u) return { ok: false, msg: '留在部落的人數不夠' };
      if (v.battle) return { ok: false, msg: '部落正在交戰，現在不能出征' };
      if (v.ally && v.ally === t.ally) return { ok: false, msg: '不能出征同一個聯盟的部落' };
      if (now < t.shieldUntil || now < t.newbieUntil) return { ok: false, msg: '對方正受到保護' };
      if (!t.bot && centerLevel(v) - centerLevel(t) > 1) return { ok: false, msg: '對方規模比你小太多，不能出征' };
      if ((v.cool[t.id] || 0) > now) return { ok: false, msg: '才剛交手過，晚一點再來' };
      if (this.marches.some(function (m) { return m.from === v.id; })) return { ok: false, msg: '已經有一支隊伍在外面了' };
      v.units.w -= w; v.units.a -= ar; v.units.u -= uu; v.away.w += w; v.away.a += ar; v.away.u += uu;
      v.newbieUntil = 0; v.shieldUntil = 0;   // 主動出征就放棄保護
      var d = Geo.hexDist(this.map.byId[v.hex], this.map.byId[t.hex]);
      var travel = marchSecs(d, uniq(t) === 'watch') * 1000 / this.speed;   // 對方有望樓：更早被發現，路上多花一半時間
      this.marches.push({ id: this.id('m'), from: v.id, to: t.id, w: w, a: ar, u: uu, lanes: LANE_KEYS.indexOf(a.lanes) >= 0 ? a.lanes : 'even',
        departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null });
      v.cool[t.id] = now + this.ms(120000);
      this.marches[this.marches.length - 1].hostile = this.relState(v.tribe, t.tribe) === 'hostile';
      this.relAdd(v.tribe, t.tribe, REL.attack);
      return { ok: true, msg: '隊伍出發了' };
    },
    occupy: function (v, a, now) {   // 派人去野地的資源點：沒人就佔領，別人佔著就較量，自己的就增援
      var h = this.map.byId[a.hex], w = int(a.w), ar = int(a.a), uu = int(a.u), p = h && this.points[h.id];
      if (!h || !h.wild) return { ok: false, msg: '這裡不是野地的資源點' };
      if (w < 0 || ar < 0 || uu < 0 || w + ar + uu < 1) return { ok: false, msg: '至少要派出一個人' };
      if (w > v.units.w || ar > v.units.a || uu > v.units.u) return { ok: false, msg: '留在部落的人數不夠' };
      if (v.battle) return { ok: false, msg: '部落正在交戰，現在不能派人出去' };
      if (this.marches.some(function (m) { return m.from === v.id; })) return { ok: false, msg: '已經有一支隊伍在外面了' };
      var own = p && p.owner === v.id, holder = p && this.villages[p.owner];
      if (!own && this.pointsOf(v.id).length >= pointMax(v)) return { ok: false, msg: '最多同時佔領 ' + pointMax(v) + ' 處資源點' };
      if (own && all3(p) >= POINT_UNITS) return { ok: false, msg: '這裡已經有 ' + POINT_UNITS + ' 個人駐守，夠了' };
      if (!own && holder && v.ally && v.ally === holder.ally) return { ok: false, msg: '這是盟友佔領的地方' };
      v.units.w -= w; v.units.a -= ar; v.units.u -= uu; v.away.w += w; v.away.a += ar; v.away.u += uu;
      var travel = marchSecs(Geo.hexDist(this.map.byId[v.hex], h)) * 1000 / this.speed;
      this.marches.push({ id: this.id('m'), kind: 'point', from: v.id, to: null, hex: h.id, w: w, a: ar, u: uu, departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null });
      return { ok: true, msg: '隊伍出發了' };
    },
    recall: function (v, a, now) {   // 把駐守資源點的人叫回來
      var p = this.points[a.hex];
      if (!p || p.owner !== v.id) return { ok: false, msg: '這裡不是你佔領的地方' };
      var travel = marchSecs(Geo.hexDist(this.map.byId[v.hex], this.map.byId[a.hex])) * 1000 / this.speed;
      this.marches.push({ id: this.id('m'), kind: 'point', from: v.id, to: null, hex: a.hex, w: p.w, a: p.a, u: p.u || 0, departAt: now, arriveAt: now + travel, travel: travel, phase: 'back', loot: null });
      delete this.points[a.hex];
      return { ok: true, msg: '駐守的人回來了' };
    },
    barter: function (v, a, now) {   // 在中立聚落換別族的特產
      var st = this.map.settlements.filter(function (s) { return s.id === a.at; })[0], t = Tribes.get(a.want), pay = a.pay;
      if (!st) return { ok: false, msg: '找不到這個聚落' };
      if (!t || !t.playable || t.id === v.tribe) return { ok: false, msg: '請選一種別族的特產' };
      var stock = this.stockOf(st.id), bySp = pay === 'sp', cost = bySp ? SETTLE.give : SETTLE.resCost, gain = bySp ? SETTLE.get : 1, key = bySp ? 'sp:' + v.tribe : pay;
      if (!bySp && pay !== 'food' && pay !== 'mat') return { ok: false, msg: '請選要拿什麼來換' };
      if (stock[t.id] < gain) return { ok: false, msg: '聚落裡的' + t.sp.zh + '換完了，過一陣子再來' };
      if (getRes(v, key) < cost) return { ok: false, msg: resName(key) + '不夠' };
      addRes(v, key, -cost); addRes(v, 'sp:' + t.id, gain); stock[t.id] -= gain; v.stat.trade++;
      return { ok: true, msg: '換到 ' + gain + ' 份' + t.sp.zh };
    },
    cmd: function (v, a, now) {   // 對戰中下指令
      var b = this.battles[v.battle];
      if (!b || b.state !== 'pick') return { ok: false, msg: '現在不能下指令' };
      var sd = b.a === v.id ? 'a' : 'd';
      if (a.c === 'hero') { if (!b.hero[sd]) return { ok: false, msg: '這一場不能再用英雄能力了' }; }
      else if (!CMDS[a.c]) return { ok: false, msg: '沒有這個指令' };
      b.cmd[sd] = a.c;
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
      addRes(v, k, -n); addRes(t, k, n); v.lastGift = now; v.gifts++; this.relAdd(v.tribe, t.tribe, REL.gift);
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
      var st = s ? this.relState(v.tribe, s.tribe) : 'neutral', bonus = st === 'friend' ? 1.1 : 1;
      if (st === 'hostile') return { ok: false, msg: '兩族的關係緊張，暫時不能直接交易' };
      this.market.splice(i, 1);
      addRes(v, o.want, -o.wantN); addRes(v, o.give, Math.floor(o.giveN * bonus));   // 兩族友好時，雙方各多拿一成
      if (s) { this.tickVillage(s, now); addRes(s, o.want, Math.floor(o.wantN * bonus)); this.relAdd(v.tribe, s.tribe, REL.trade); s.stat.trade++; }
      v.stat.trade++;
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
      var self = this, seen = {};
      al.members.forEach(function (m) { var o = self.villages[m]; if (o && !seen[o.tribe]) { seen[o.tribe] = 1; self.relAdd(v.tribe, o.tribe, REL.ally); } });   // 和不同族的部落結盟，兩族關係變好
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
  ACTIONS = dict(ACTIONS);

  // ---------- 出征隊伍與對戰流程 ----------
  World.prototype.resolveMarch = function (m, now) {
    var v = this.villages[m.from], t = this.villages[m.to];
    if (!v) return false;
    if (m.phase === 'back') {
      ['w', 'a', 'u'].forEach(function (k) { var n = m[k] || 0; v.units[k] += n; v.away[k] = Math.max(0, v.away[k] - n); });
      if (m.loot) for (var k in m.loot) addRes(v, k, m.loot[k]);
      return false;
    }
    if (m.phase === 'fight') return true;   // 對戰中，等對戰結束
    if (m.kind === 'point') return this.resolvePoint(m, v, now);
    var why = !t ? '找不到對方的部落' : now < t.shieldUntil ? '對方正受到保護' : (v.ally && v.ally === t.ally) ? '對方現在是同盟' : t.battle ? '對方正在和別人交戰' : '';
    if (why) {
      this.pushReport(v, { t: now, role: 'atk', other: t ? t.name : '', otherTribe: t ? t.tribe : v.tribe, win: false, broken: 0, note: why + '，隊伍折返。', log: [] });
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    this.tickVillage(v, now); this.tickVillage(t, now);
    var heroOk = function (x) { return x.quest >= QUESTS.length && now >= (x.heroRest || 0); };
    var b = makeField({ tribe: v.tribe, w: m.w, a: m.a, u: m.u || 0, lanes: m.lanes, hero: heroOk(v) },
      { tribe: t.tribe, w: t.units.w, a: t.units.a, u: t.units.u, lanes: t.def.lanes, hero: heroOk(t), wall: t.wall, towers: levelsOf(t, 'tower'), uniq: uniq(t) });
    b.id = this.id('b'); b.a = v.id; b.d = t.id; b.aName = v.name; b.dName = t.name; b.march = m.id;
    b.state = 'prep'; b.deadline = now + PREP_MS / this.speed; b.cmd = { a: null, d: null };
    t.units.w = 0; t.units.a = 0; t.units.u = 0;   // 守軍都上場了，打完再回來
    this.battles[b.id] = b; v.battle = b.id; t.battle = b.id; m.phase = 'fight';
    return true;
  };
  /* 隊伍抵達野地的資源點。資源點的較量是自動的（一條路、三個階段），不進對戰畫面 */
  World.prototype.resolvePoint = function (m, v, now) {
    var h = this.map.byId[m.hex], p = this.points[m.hex], name = POINT[h.wild].zh, self = this;
    m.u = m.u || 0;
    function home(note, win) {
      self.pushReport(v, { t: now, role: 'atk', point: name, other: note.other || '', otherTribe: note.tribe || v.tribe, win: !!win, broken: 0, note: note.text, log: [] });
      if (all3(m) === 0) return false;
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    function hold() { self.points[m.hex] = { owner: v.id, w: m.w, a: m.a, u: m.u, since: now }; v.stat.point++; }
    if (!p) {   // 沒有人：趕走野獸就佔領。只派一個人會被野獸趕回來
      if (all3(m) < 2) return home({ text: name + '有野獸出沒，一個人應付不來，折返了。至少要派兩個人。' });
      if (this.pointsOf(v.id).length >= pointMax(v)) return home({ text: '已經佔了 ' + pointMax(v) + ' 處資源點，隊伍折返。' });
      hold();
      this.pushReport(v, { t: now, role: 'atk', point: name, other: '', otherTribe: v.tribe, win: true, broken: 0, note: '趕走了野獸，佔領了' + name + '，開始有收穫。', log: [] });
      return false;
    }
    if (p.owner === v.id) {   // 增援自己的地方，超過上限的人回家
      p.u = p.u || 0;
      ['w', 'a', 'u'].forEach(function (k) { var room = Math.max(0, POINT_UNITS - all3(p)), n = Math.min(m[k], room); p[k] += n; m[k] -= n; });
      if (all3(m) === 0) return false;
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    var D = this.villages[p.owner];
    if (D && v.ally && v.ally === D.ally) return home({ text: '這裡現在是盟友佔領的，隊伍折返。', other: D.name, tribe: D.tribe });
    if (this.pointsOf(v.id).length >= pointMax(v)) return home({ text: '已經佔了 ' + pointMax(v) + ' 處資源點，隊伍折返。' });
    var none = function () { return mkSide(0, 0, 0, v.tribe, false); };
    var b = { phase: 1, wall: 0, towers: 0, lanes: [{ a: mkSide(m.w, m.a, m.u, v.tribe, false), d: mkSide(p.w, p.a, p.u || 0, D ? D.tribe : v.tribe, false), broken: false },
      { a: none(), d: none(), broken: true }, { a: none(), d: none(), broken: true }] };
    var plan = D ? D.def.plan : ['volley', 'hold', 'charge'], ac = ['charge', 'volley', 'charge'];
    for (var i = 0; i < PHASES && !b.lanes[0].broken && all3(b.lanes[0].a) > 0; i++) { b.phase = i + 1; fightPhase(b, ac[i], plan[i], this.rng); }
    var L = b.lanes[0], took = L.broken, lostA = all3(m) - all3(L.a), lostD = all3(p) - all3(L.d);
    ['w', 'a', 'u'].forEach(function (k) {
      v.away[k] -= m[k] - (L.a[k] || 0); m[k] = L.a[k] || 0;
      if (D) D.away[k] = Math.max(0, D.away[k] - ((p[k] || 0) - (L.d[k] || 0)));
    });
    if (D) {
      this.relAdd(v.tribe, D.tribe, REL.point);
      this.pushReport(D, { t: now, role: 'def', point: name, other: v.name, otherTribe: v.tribe, win: !took, broken: 0, lost: lostD, log: [],
        note: took ? '「' + v.name + '」搶走了你佔領的' + name + '，駐守的 ' + lostD + ' 人負傷撤退。' : '守住了' + name + '，擊退「' + v.name + '」。我方 ' + lostD + ' 人負傷撤退。' });
    }
    if (took) {
      hold();
      this.pushReport(v, { t: now, role: 'atk', point: name, other: D ? D.name : '', otherTribe: D ? D.tribe : v.tribe, win: true, broken: 0, lost: lostA, log: [], note: '搶下了' + name + '。我方 ' + lostA + ' 人負傷撤退。' });
      this.log('「' + v.name + '」從「' + (D ? D.name : '別人') + '」手上搶下一處' + name + '。', now, 'battle');
      return false;
    }
    p.w = L.d.w; p.a = L.d.a; p.u = L.d.u || 0;
    return home({ text: '沒能搶下' + name + '。我方 ' + lostA + ' 人負傷撤退。', other: D ? D.name : '', tribe: D ? D.tribe : v.tribe });
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
      var rec = playPhase(b, b.cmd.a, b.cmd.d, this.rng);
      b.cmd.a = rec.a; b.cmd.d = rec.d;                                             // 英雄能力算成哪一種指令
      if (rec.ha && A) A.heroRest = now + this.ms(HERO_REST);                       // 用過之後英雄要休息
      if (rec.hd && D) D.heroRest = now + this.ms(HERO_REST);
      b.state = 'show'; b.deadline = now + SHOW_MS / this.speed;
      return;
    }
    if (b.state === 'show' && now >= b.deadline) {
      if (fieldOver(b)) return this.endBattle(b, now);
      b.phase++; b.cmd = { a: null, d: null }; b.state = 'pick'; b.deadline = now + PICK_MS / this.speed;
    }
  };
  World.prototype.endBattle = function (b, now) {
    var A = this.villages[b.a], D = this.villages[b.d], m = this.marches.filter(function (x) { return x.id === b.march; })[0];
    var res = fieldResult(b), broken = res.broken, win = res.win, left = res.left, home = res.home, lostA = res.lostA, lostD = res.lostD, loot = {}, txt = [];
    if (D) {
      D.units.w += home.w; D.units.a += home.a; D.units.u += home.u; D.battle = null;
      if (broken > 0 && all3(left) > 0) {   // 每位回程的人能背 30 份：先帶特產，剩下的空間分給糧食與建材
        var frac = Math.min(1, LOOT_FRAC[broken] * TUNE.loot), carry = 30 * all3(left), prot = caps(D).protect, want = {};
        var take = function (k, n) { n = Math.min(n, carry); if (n <= 0) return; carry -= n; loot[k] = n; addRes(D, k, -n); txt.push(n + ' ' + resName(k)); };
        for (var sk in D.sp) take('sp:' + sk, Math.floor(D.sp[sk] * frac));
        ['food', 'mat'].forEach(function (k) { want[k] = Math.floor(Math.max(0, D.res[k] - prot) * frac); });
        var total = want.food + want.mat, f = total > carry ? carry / total : 1;
        var nf = Math.floor(want.food * f), nm = Math.floor(want.mat * f); take('food', nf); take('mat', nm);
      }
      if (win) { D.losses++; D.glory = Math.max(0, D.glory - 3); D.shieldUntil = now + shieldMs() / this.speed; } else { D.wins++; D.glory += 5; }
      this.pushReport(D, { id: b.id, t: now, role: 'def', other: b.aName, otherTribe: b.aTribe, win: !win, broken: broken, loot: loot, lost: lostD, log: b.log });
    }
    if (A) {
      A.battle = null; ['w', 'a', 'u'].forEach(function (k) { A.away[k] = Math.max(0, A.away[k] - (b.start.a[k] - left[k])); });
      if (win) { A.wins++; A.glory += Math.round(((broken === 3 ? 15 : 10) + 2 * (D ? centerLevel(D) : 1)) * (m && m.hostile ? 1.5 : 1)); this.relAdd(b.aTribe, b.dTribe, REL.win); }
      else { A.losses++; A.glory = Math.max(0, A.glory - 2); }
      this.pushReport(A, { id: b.id, t: now, role: 'atk', other: b.dName, otherTribe: b.dTribe, win: win, broken: broken, loot: loot, lost: lostA, log: b.log });
    }
    var key = b.aTribe + '>' + b.dTribe, st = this.stats[key] = this.stats[key] || { n: 0, win: 0 };   // 後台用：各族對戰的場數與攻方勝場
    st.n++; if (win) st.win++;
    this.log(win ? '「' + b.aName + '」出征「' + b.dName + '」，攻破 ' + broken + ' 路獲勝' + (txt.length ? '，帶回 ' + txt.join('、') : '') + '。'
      : '「' + b.dName + '」守住了「' + b.aName + '」的出征。', now, 'battle');
    b.state = 'done'; b.result = { broken: broken, win: win, loot: loot, lostA: lostA, lostD: lostD }; b.doneAt = now;
    if (m) {
      if (all3(left) === 0) this.marches = this.marches.filter(function (x) { return x.id !== m.id; });
      else { m.w = left.w; m.a = left.a; m.u = left.u; m.loot = loot; m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; }
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
        else if (b.type !== 'unique' && b.level < C && can(v, cost(b.type, b.level + 1))) opts.push({ type: 'upgrade', tile: i });
      }
      if (empty.length < 2 && wild.length) opts.push({ type: 'clear', tile: wild[Math.floor(rng() * wild.length)] });
      if (empty.length) TYPES.forEach(function (ty) {
        if (count(v, ty) < limit(ty, C, v) && can(v, cost(ty, 1))) opts.push({ type: 'build', type2: ty, tile: empty[Math.floor(rng() * empty.length)] });
      });
      if (v.wall < C && can(v, cost('wall', v.wall + 1))) opts.push({ type: 'wall' });
      if (opts.length) this.act(v.id, opts[Math.floor(rng() * opts.length)], now);
    }
    var qp = this.questProgress(v); if (qp && qp.done) this.act(v.id, { type: 'quest' }, now);
    if (armyCap(v) > armyTotal(v) && rng() < 0.5) this.act(v.id, { type: 'train', u: v.quest >= 4 && rng() < 0.3 ? 'u' : rng() < 0.6 ? 'w' : 'a' }, now);
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
    TUNE = this.tune;
    for (id in this.villages) { var v = this.villages[id]; if (v.online || v.bot) this.tickVillage(v, now); }
    this.marches = this.marches.filter(function (m) { return m.arriveAt > now ? true : self.resolveMarch(m, now); });
    if (now - this.lastRel >= this.ms(REL.decayMs)) {   // 族群關係慢慢回到中立
      this.lastRel = now;
      for (var rk in this.rel) { this.rel[rk] -= Math.sign(this.rel[rk]); if (!this.rel[rk]) delete this.rel[rk]; }
    }
    if (now - this.lastStock >= this.ms(SETTLE.refillMs)) {   // 中立聚落補貨
      this.lastStock = now;
      for (var sk in this.stock) for (var tk in this.stock[sk]) if (this.stock[sk][tk] < SETTLE.stock) this.stock[sk][tk]++;
    }
    if (now - this.lastPop >= 60000) { this.lastPop = now; this.popBonus(); }
    for (id in this.battles) {
      var b = this.battles[id];
      if (b.state === 'done') { if (now - b.doneAt > 20000) delete this.battles[id]; } else this.stepBattle(b, now);
    }
    this.market = this.market.filter(function (o) {
      if (now - o.t < self.ms(OFFER_MS)) return true;
      var s = self.villages[o.from]; if (s) addRes(s, o.give, o.giveN);
      return false;
    });
    if (now - this.lastBot >= 4000 / this.speed) {
      this.lastBot = now;
      for (id in this.villages) if (this.villages[id].bot) this.botStep(this.villages[id], now);
    }
  };

  /* 人數加成：玩家最少的族群產量 +15%，依人數差距遞減，人最多的族群沒有加成 */
  World.prototype.popBonus = function () {
    var n = {}, max = 0, id;
    Tribes.playable().forEach(function (t) { n[t.id] = 0; });
    for (id in this.villages) if (!this.villages[id].bot) n[this.villages[id].tribe]++;
    for (id in n) max = Math.max(max, n[id]);
    for (id in this.villages) { var v = this.villages[id]; v.pb = v.bot || !max ? 0 : +(TUNE.popBonus * (max - n[v.tribe]) / max).toFixed(3); }
    return n;
  };

  // ---------- 給客戶端的資料 ----------
  World.prototype.pub = function (v, now) {
    var guard = all3(v.units);
    return { id: v.id, name: v.name, owner: v.owner, tribe: v.tribe, hex: v.hex, pos: v.pos, bot: v.bot, online: v.online || v.bot,
      c: centerLevel(v), wall: v.wall, towers: levelsOf(v, 'tower').length, guard: guard === 0 ? 0 : guard <= 4 ? 1 : guard <= 10 ? 2 : 3,
      pros: prosperity(v), glory: v.glory, ally: v.ally, safe: Math.max(v.shieldUntil, v.newbieUntil), uq: uniq(v) };
  };
  function battleView(b, id) {
    return { id: b.id, role: b.a === id ? 'atk' : 'def', aName: b.aName, dName: b.dName, aTribe: b.aTribe, dTribe: b.dTribe, wall: b.wall, towerN: b.towerN,
      phase: b.phase, state: b.state, deadline: b.deadline, mine: b.cmd[b.a === id ? 'a' : 'd'], log: b.log, result: b.result || null,
      hero: !!b.hero[b.a === id ? 'a' : 'd'],
      lanes: b.lanes.map(function (l) { return { aw: l.a.w, aa: l.a.a, au: l.a.u || 0, dw: l.d.w, da: l.d.a, du: l.d.u || 0, broken: l.broken }; }) };
  }
  World.prototype.pubs = function (now) { var self = this; TUNE = this.tune; return Object.keys(this.villages).map(function (k) { return self.pub(self.villages[k], now); }); };
  World.prototype.detail = function (id, now) {
    TUNE = this.tune;
    var v = this.villages[id]; if (!v) return null;
    this.tickVillage(v, now);
    var p = this.pub(v, now);
    p.tiles = v.tiles.map(function (b) { return b ? { type: b.type, level: b.level, busy: !!b.busy } : null; });
    p.land = v.land.slice(); p.queue = []; p.popCap = popCap(v);
    p.pop = v.pop;
    return p;
  };
  World.prototype.snapshot = function (id, now) {
    TUNE = this.tune;
    var v = this.villages[id], self = this;
    if (!v) return null;
    var me = JSON.parse(JSON.stringify(v));
    delete me.offSnap; delete me.offLog; delete me.cool;
    var bt = v.battle && this.battles[v.battle];
    if (!bt) for (var bk in this.battles) {   // 剛打完的對戰再多傳一小段時間，讓雙方看到結果
      var x = this.battles[bk]; if (x.state === 'done' && (x.a === id || x.d === id)) bt = x;
    }
    me.d = derived(v, this.speed);
    me.qp = this.questProgress(v);
    var al = {};
    for (var k in this.alliances) al[k] = { id: k, name: this.alliances[k].name, leader: this.alliances[k].leader, n: this.alliances[k].members.length };
    return {
      now: now, speed: this.speed, me: me,
      villages: Object.keys(this.villages).map(function (k) { return self.pub(self.villages[k], now); }),
      marches: this.marches.map(function (m) { return { id: m.id, from: m.from, to: m.to, hex: m.hex || null, departAt: m.departAt, arriveAt: m.arriveAt, phase: m.phase, n: all3(m) }; }),
      shieldMs: shieldMs() / this.speed, tune: this.tune, tv: this.tuneV,
      rel: Tribes.playable().filter(function (t) { return t.id !== v.tribe; }).map(function (t) { return { tribe: t.id, value: self.relOf(v.tribe, t.id), state: self.relState(v.tribe, t.id) }; }),
      points: Object.keys(this.points).map(function (h) { var p = self.points[h], o = self.villages[p.owner], mine = p.owner === id;
        return { hex: h, owner: p.owner, name: o ? o.name : '', tribe: o ? o.tribe : v.tribe, ally: !!(o && v.ally && o.ally === v.ally), n: mine ? all3(p) : (all3(p) <= 2 ? 1 : all3(p) <= 4 ? 2 : 3), w: mine ? p.w : null, a: mine ? p.a : null, u: mine ? (p.u || 0) : null }; }),
      stock: (function () { var o = {}; self.map.settlements.forEach(function (s) { o[s.id] = self.stockOf(s.id); }); return o; })(),
      market: this.market.map(function (o) { return { id: o.id, from: o.from, fromName: (self.villages[o.from] || {}).name || '', give: o.give, giveN: o.giveN, want: o.want, wantN: o.wantN }; }),
      feed: this.feed.slice(-30), alliances: al, battle: bt ? battleView(bt, id) : null
    };
  };
  World.prototype.adminState = function (now) {
    TUNE = this.tune;
    var self = this, tribes = {}, list = Object.keys(this.villages).map(function (id) {
      var v = self.villages[id], d = derived(v, self.speed);
      var row = { id: v.id, name: v.name, owner: v.owner, tribe: v.tribe, bot: v.bot, online: !!v.online, center: d.center, pop: v.pop, popCap: d.popCap,
        food: Math.floor(v.res.food), mat: Math.floor(v.res.mat), sp: Math.floor(v.sp[v.tribe] || 0), cap: d.cap, land: v.land.filter(Boolean).length,
        buildings: v.tiles.filter(Boolean).length, prosperity: d.prosperity, glory: v.glory, army: all3(v.units), quest: v.quest, createdAt: v.createdAt,
        seen: v.online || v.bot ? now : (v.offAt || v.last), idle: v.idle, pos: v.pos };
      var t = tribes[v.tribe] = tribes[v.tribe] || { players: 0, bots: 0, online: 0, prosperity: 0 };
      if (v.bot) t.bots++; else { t.players++; t.prosperity += d.prosperity; if (v.online) t.online++; }
      return row;
    });
    for (var k in tribes) tribes[k].avg = tribes[k].players ? Math.round(tribes[k].prosperity / tribes[k].players) : 0;
    return { now: now, speed: this.speed, tune: this.tune, adminLog: this.adminLog.slice(-40), villages: list, tribes: tribes, marches: this.marches.length, offers: this.market.length,
      battles: Object.keys(this.battles).filter(function (k) { return self.battles[k].state !== 'done'; }).length, stats: this.stats,
      rel: this.rel, points: Object.keys(this.points).length, alliances: Object.keys(this.alliances).map(function (k) { return { name: self.alliances[k].name, n: self.alliances[k].members.length }; }) };
  };
  World.prototype.toJSON = function () {
    return { villages: this.villages, tokens: this.tokens, marches: this.marches, market: this.market, feed: this.feed, alliances: this.alliances,
      battles: this.battles, stats: this.stats, rel: this.rel, points: this.points, stock: this.stock, seq: this.seq, tune: this.tune, adminLog: this.adminLog };
  };
  World.prototype.load = function (d) {
    if (!d || !d.villages) return this;
    TUNE = this.tune;
    if (d.tune) { setTune(d.tune, this.tune); this.tuneV++; }   // 存檔裡有後台調過的數值就沿用；沒有就用啟動時的預設
    this.adminLog = d.adminLog || [];
    this.villages = dict(d.villages); this.tokens = dict(d.tokens); this.marches = d.marches || []; this.market = d.market || [];
    this.feed = d.feed || []; this.alliances = dict(d.alliances); this.seq = d.seq || 1;
    this.battles = dict(d.battles); this.stats = dict(d.stats); this.rel = dict(d.rel); this.points = dict(d.points); this.stock = dict(d.stock);
    for (var sk0 in this.stock) this.stock[sk0] = dict(this.stock[sk0]);
    for (var id in this.villages) {
      var v = this.villages[id]; v.online = !!v.bot;
      v.sp = dict(v.sp); v.cool = dict(v.cool);
      if (!v.land || v.tiles.length !== TILE_N) { delete this.villages[id]; continue; }   // 舊版的方格部落無法沿用
      if (!v.idle) v.idle = { focus: 'even', upgrade: false };
      if (!v.def) v.def = { lanes: 'even', plan: ['volley', 'hold', 'charge'] };
      if (v.units.u == null) { v.units.u = 0; v.away.u = 0; }
      if (v.quest == null) { v.quest = 0; v.stat = { trade: 0, point: 0 }; v.blessUntil = 0; v.blessNext = 0; v.heroRest = 0; }
      if (v.battle && !(this.battles || {})[v.battle]) v.battle = null;
    }
    for (var tk in this.tokens) if (!this.villages[this.tokens[tk]]) delete this.tokens[tk];
    return this;
  };

  World.rules = {
    SITES: SITES, CLEAR: CLEAR, clearInfo: clearInfo, TILE_N: TILE_N, CENTER_TILE: CENTER_TILE, TYPES: TYPES, MAX_LEVEL: MAX_LEVEL, UNIT: UNIT,
    CENTER_UP: CENTER_UP, BUILDERS: BUILDERS, FOREIGN_SP: FOREIGN_SP, cost: cost, buildTime: buildTime, limit: limit, count: count,
    resName: resName, derived: derived, popCap: popCap, LANES: LANES, LANE_KEYS: LANE_KEYS, CMDS: CMDS, PHASES: PHASES, LOOT_FRAC: LOOT_FRAC,
    split: split, taken: taken, edge: edge, beats: beats, fightPhase: fightPhase, armyCap: armyCap, mkSide: mkSide, QUESTS: QUESTS, UNIT_U: UNIT_U, BLESS: BLESS, HERO_REST: HERO_REST, pointMax: pointMax, REL: REL, POINT: POINT, POINT_MAX: POINT_MAX, POINT_UNITS: POINT_UNITS, SETTLE: SETTLE,
    makeField: makeField, playPhase: playPhase, fieldOver: fieldOver, fieldResult: fieldResult, randomPolicy: randomPolicy, simBattle: simBattle, simMatrix: simMatrix,
    TUNE_DEF: TUNE_DEF, tuneDefaults: tuneDefaults, setTune: setTune, paced: paced, trainTime: trainTime, marchSecs: marchSecs, shieldMs: shieldMs, pointRate: pointRate, ability: ability, OFFER_MS: OFFER_MS
  };
  Object.defineProperty(World.rules, 'TUNE', { get: function () { return TUNE; } });   // 目前生效的可調數值
  return World;
});
