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
  /* 建築最高 25 級。1～5 級的花費與時間和原本一樣（舊部落不受影響），6 級以後花費每級 ×1.25、時間每級 ×1.2：
   * 正式節奏下，最後幾級要十幾個小時到一天多（中心 25 級約 32 小時）；不賣加速，所以不再更長 */
  var MAX_LEVEL = 25;
  function MULT(L) { return L <= 5 ? [1, 2.2, 4, 7, 11][L - 1] : 11 * Math.pow(1.25, L - 5); }
  function TMULT(L) { return L <= 5 ? [1, 2, 3.5, 5.5, 8][L - 1] : 8 * Math.pow(1.2, L - 5); }
  function eq(L) { return L <= 5 ? L : 5 * Math.pow(1.25, L - 5); }   // 容量類的效果（倉庫、保護量）跟著花費一起長，才存得下高等級的花費
  var TYPES = ['house', 'farm', 'mat', 'special', 'storage', 'barracks', 'tower', 'unique',   // unique：各族的獨特建築，任務第 3 章解鎖，只能蓋一座
    'hut', 'archery', 'taro', 'water', 'heal', 'craft', 'market', 'plaza', 'guest'];            // 第二批新增的 9 種
  /* 第二批的建築：中心幾級才能蓋（每種一座；芋頭田最多 4 塊） */
  var UNLOCK = { hut: 2, archery: 2, taro: 3, water: 4, heal: 4, craft: 5, market: 6, plaza: 7, guest: 8 };
  var DEF = {
    house: { base: { food: 15, mat: 40 }, time: 8 },
    farm: { base: { food: 0, mat: 35 }, time: 8 },
    mat: { base: { food: 35, mat: 0 }, time: 8 },
    special: { base: { food: 60, mat: 60 }, time: 14 },
    storage: { base: { food: 30, mat: 70 }, time: 12 },
    barracks: { base: { food: 80, mat: 80 }, time: 16 },
    tower: { base: { food: 20, mat: 90 }, time: 14 },
    unique: { base: { food: 150, mat: 150 }, time: 30 },
    wall: { base: { food: 0, mat: 70 }, time: 12 },
    hut: { base: { food: 40, mat: 80 }, time: 12 }, archery: { base: { food: 60, mat: 90 }, time: 14 }, taro: { base: { food: 0, mat: 40 }, time: 10 },
    water: { base: { food: 30, mat: 90 }, time: 14 }, heal: { base: { food: 80, mat: 100 }, time: 16 }, craft: { base: { food: 100, mat: 120 }, time: 20 },
    market: { base: { food: 60, mat: 80 }, time: 14 }, plaza: { base: { food: 80, mat: 80 }, time: 16 }, guest: { base: { food: 60, mat: 90 }, time: 14 }
  };
  /* 技藝：在技藝屋學，學會之後永久加成。每項最多 5 級，技藝屋 1、6、11、16、21 級時上限分別是 1～5 級；同時只能學一項 */
  var TECH = {
    farming: { zh: '農耕', per: 4, fx: '糧食產量 +' }, gather: { zh: '採集', per: 4, fx: '建材產量 +' }, weave: { zh: '編織', per: 4, fx: '特產產量 +' },
    build: { zh: '建築', per: 4, fx: '建設與拓荒的時間 −' }, store: { zh: '儲藏', per: 6, fx: '倉庫容量與保護量 +' }, trade: { zh: '交易', per: 6, fx: '中立聚落換特產的花費 −' },
    hunt: { zh: '狩獵', per: 6, fx: '到野地採集的速度 +' }, archery: { zh: '射箭', per: 3, fx: '弓手與遠程獨特兵種的攻擊 +' }, spear: { zh: '矛術', per: 3, fx: '勇士與近戰獨特兵種的攻擊 +' },
    guard: { zh: '守備', per: 3, fx: '守在自己部落時的戰力 +' }, march: { zh: '行軍', per: 5, fx: '路上的時間 −' }, care: { zh: '療養', per: 15, fx: '療養屋的容量 +' }
  };
  var TECH_MAX = 5;
  // 部落中心升級：除了糧食與建材，還需要「別族的特產」，鼓勵交易與往來
  var CENTER_UP = {
    2: { food: 150, mat: 150, time: 20, kinds: 0, each: 0 },
    3: { food: 400, mat: 400, time: 45, kinds: 1, each: 5 },
    4: { food: 900, mat: 900, time: 90, kinds: 2, each: 8 },
    5: { food: 1800, mat: 1800, time: 150, kinds: 3, each: 12 }
  };
  function centerUp(to) {   // 中心升到 to 級要的東西；6 級以後照曲線往上長
    if (to < 2 || to > MAX_LEVEL) return null;
    if (to <= 5) return CENTER_UP[to];
    return { food: r5(1800 * Math.pow(1.25, to - 5)), mat: r5(1800 * Math.pow(1.25, to - 5)), time: Math.round(150 * Math.pow(1.2, to - 5)), kinds: 3, each: 12 + 3 * (to - 5) };
  }
  /* 中心升級的前置條件（和那兩款遊戲一樣）：輪流要求一種建築升到前一級；6 級以後圍籬也要跟上 */
  var REQ_CYCLE = ['house', 'farm', 'storage', 'mat', 'barracks', 'special', 'tower'];
  function centerReq(to) {
    var out = [{ type: REQ_CYCLE[(to - 2) % REQ_CYCLE.length], level: to - 1 }];
    if (to >= 6) out.push({ type: 'wall', level: to - 1 });
    return out;
  }
  function maxLevelOf(v, type) { if (type === 'wall') return v.wall; var m = 0; for (var i = 0; i < TILE_N; i++) if (v.tiles[i] && v.tiles[i].type === type) m = Math.max(m, v.tiles[i].level); return m; }
  function reqLeft(v, to) { return centerReq(to).filter(function (r) { return maxLevelOf(v, r.type) < r.level; }); }
  var UNIT = {
    w: { zh: '勇士', atk: 10, hp: 30, cost: { food: 30, mat: 0 }, time: 5 },
    a: { zh: '弓手', atk: 12, hp: 18, cost: { food: 20, mat: 20 }, time: 5 }
  };
  var RATE = { food: 0.35, mat: 0.35, special: 0.03 };   // 每位族人每秒
  var FOREIGN_SP = true;    // 部落中心升到 3 級以上要用別族的特產（靠市集、中立聚落、送禮或出征取得）
  // 族群關係：每兩族之間一個數值，-100 到 100，起始 0。交易、送禮、結盟會上升，出征會下降，會慢慢回到 0
  var REL = { friend: 20, hostile: -20, trade: 2, gift: 1, ally: 3, attack: -4, win: -2, point: -3, decayMs: 300000 };
  // 野地資源點：每位駐守的人每秒的產量（最多算 6 人）
  /* 野地的資源點：在地圖上隨機長出來，種類照所在地的地形（海岸是漁場、山區是林地與獵場……），每個點有固定的存量。
   * 派隊伍去採，採滿（背不下）或採完就自己回部落；採完的點消失，別的地方會再長出新的。採集中的隊伍可以被別人搶 */
  var NODE = {
    fish: { zh: '漁場', res: 'food' }, hunt: { zh: '獵場', res: 'food' }, forage: { zh: '野菜地', res: 'food' },
    wood: { zh: '林地', res: 'mat' }, bamboo: { zh: '竹林', res: 'mat' }, stone: { zh: '石板', res: 'mat' },
    // 野地的事件（一個人也有事可做；都不是敵對的族群，也不能被別的玩家搶）：
    boar: { zh: '山豬群', res: 'food', ev: 'fight' },     // 在田邊出沒的山豬群：派人去把牠們趕回山裡（不畫獵殺）
    repair: { zh: '颱風後搶修', res: 'mat', ev: 'work' }  // 颱風過後沖壞的便橋、擋路的落石：派人去修
  };
  var BOAR_N = [0, 6, 12, 20, 30, 44], BOAR_MUL = [0, 1, 1.1, 1.2, 1.35, 1.5];   // 山豬群各等級的數量與強度
  var REPAIR_WHAT = ['沖壞的便橋', '落石擋住的山路', '倒塌的田寮', '淤塞的水圳'];
  function boarSide(lv, n) { return { n: n == null ? BOAR_N[lv] : n, mod: { tw: BOAR_MUL[lv] } }; }
  function boarPower(nd) { var b = boarSide(nd.lv, nd.bn); return power({ w: b.n, a: 0, u: 0, mod: b.mod }); }
  /* 野地事件的獎勵：山豬群（趕走之後附近的田保住了）、搶修（修好了） */
  function wildReward(k, lv) {
    var A = NODE_AMT[lv] * TUNE.prod;
    return k === 'boar' ? { food: r5(A * 0.5), mat: r5(A * 0.2), boost: lv >= 5 ? 2 : lv >= 3 ? 1 : 0 } : { food: r5(A * 0.2), mat: r5(A * 0.4), boost: lv >= 3 ? 1 : 0 };
  }
  var NODE_AMT = [0, 400, 800, 1400, 2200, 3200], NODE_LV_W = [0, 40, 28, 17, 10, 5];   // 各等級的存量、出現的機會
  var SLATE = { paiwan: 1, rukai: 1, bunun: 1 };   // 產石板的山區（這幾族有石板屋）
  // 中立聚落：3 份自己的特產換 2 份別族特產，或 120 糧食／建材換 1 份；每種特產有存量，會慢慢補回來
  var SETTLE = { stock: 20, refillMs: 30000, give: 3, get: 2, resCost: 120 };
  // 任務主線：五章的目標各族相同（故事不同），獎勵依序是器物、器物、獨特建築、獨特兵種、傳說英雄與祝福
  var QUESTS = [
    { type: 'land', n: 9, text: '開墾到 9 塊地' },
    { type: 'have', n: 300, text: '倉庫裡存到 300 糧食' },
    { type: 'trade', n: 2, text: '和別人交換 2 次（市集或中立聚落）' },
    { type: 'units', n: 4, text: '擁有 4 名戰士' },   // 訓練場一級的名額是 6，留兩個位置給解鎖的獨特兵種
    { type: 'point', n: 1, text: '到野地的資源點採集一次' }
  ];
  /* 神話故事關卡：每一章拆成 3 關，第 3 關就是原本那一章的目標（獎勵照舊）；前兩關是新的小目標，其中一關是「出一趟遠門」。
   * 故事文字不新增，只把原本那一章的文字分成三段，每過一關揭開一段（storySegs） */
  var QSTAGE = [
    [{ type: 'build', b: 'farm', n: 2 }, { type: 'build', b: 'house', n: 2 }],
    [{ type: 'have', n: 150, text: '倉庫裡存到 150 糧食' }, { type: 'journey', n: 1, d: 3 }],
    [{ type: 'mat', n: 300, text: '倉庫裡存到 300 建材' }, { type: 'journey', n: 2, d: 5 }],
    [{ type: 'build', b: 'barracks', n: 1 }, { type: 'journey', n: 3, d: 8 }],
    [{ type: 'build', b: 'storage', n: 2 }, { type: 'journey', n: 4, d: 12 }]
  ];
  function stageOf(v) { var i = v.quest, s = v.qs || 0; return QUESTS[i] ? (s >= 2 ? QUESTS[i] : QSTAGE[i][s]) : null; }
  function stageReward(v) { var f = r5(40 * eq(centerLevel(v)) * TUNE.cost); return { food: f, mat: f }; }
  /* 把一章的文字分成三段（照句號分，不夠就從最長那句的逗號切開）；接起來和原文一模一樣 */
  function storySegs(x) {
    var parts = [], cur = '';
    for (var i = 0; i < x.length; i++) { cur += x[i]; if (x[i] === '。') { parts.push(cur); cur = ''; } }
    if (cur) parts.push(cur);
    while (parts.length < 3) {
      var li = -1; parts.forEach(function (p, k) { if (p.indexOf('，') >= 0 && (li < 0 || p.length > parts[li].length)) li = k; });   // 最長、而且有逗號可以切的那一句
      if (li < 0) break;
      var p = parts[li], mid = p.length / 2, best = -1;
      for (var j = 0; j < p.length - 1; j++) if (p[j] === '，' && (best < 0 || Math.abs(j - mid) < Math.abs(best - mid))) best = j;
      if (best < 0) break;
      parts.splice(li, 1, p.slice(0, best + 1), p.slice(best + 1));
    }
    while (parts.length > 3) {   // 太多段：把最短的相鄰兩段併起來
      var bi = 0, bl2 = 1e9;
      for (var k2 = 0; k2 < parts.length - 1; k2++) { var L = parts[k2].length + parts[k2 + 1].length; if (L < bl2) { bl2 = L; bi = k2; } }
      parts.splice(bi, 2, parts[bi] + parts[bi + 1]);
    }
    return parts;
  }
  /* 部落發展任務（和神話主線分開）：前面幾個是新手引導，之後跟著「中心升下一級要的條件」一步一步走，一路帶到 25 級。
   * k：build 蓋一座、level 升到幾級（wall 是圍籬）、units 擁有幾名戰士 */
  var DEV_START = [
    { k: 'build', type: 'storage', n: 1 }, { k: 'level', type: 'farm', n: 2 }, { k: 'level', type: 'center', n: 2 },
    { k: 'level', type: 'house', n: 2 }, { k: 'build', type: 'barracks', n: 1 }, { k: 'units', n: 3 }, { k: 'level', type: 'wall', n: 1 }
  ];
  var BUILDERS = 2, SHIELD_MS = 300000, NEWBIE_MS = 600000, OFFER_MS = 600000;
  var UNIT_U = { cost: { food: 30, mat: 20 }, time: 6 };
  var BLESS = { ms: 600000, again: 1200000, food: 150 }, HERO_REST = 600000;   // 共聚：準備大家一起吃的糧食，之後一段時間產量增加

  // ---------- 可以從後台調整的數值 ----------
  /* 每一項：k 代號、g 分組、zh 名稱、min／max／step 範圍、def 預設值、note 說明。
   * 要新增一個可調的數值：在這裡加一行，再到規則裡用 TUNE.代號 取值；後台的欄位會自動長出來。 */
  /* 預設值是對戰改成自動之後，用自動模擬對戰重新校正過的：十種情境下，任兩族之間的整體勝率都在 45%～55% 之內。改動後請跑 npm run sim 確認 */
  var TUNE_DEF = [
    { k: 'pace', g: '節奏', zh: '遊戲節奏', min: 1, max: 100, step: 1, def: 1, note: '數字越大越慢：產量除以它，建設、訓練、路程、保護、共聚的時間乘以它。1 是快速試玩，20 是正式。' },
    { k: 'buildTime', g: '節奏', zh: '建設與拓荒時間倍率', min: 0.2, max: 5, step: 0.1, def: 1 },
    { k: 'seasonDays', g: '節奏', zh: '一季幾天（節奏 20 時）', min: 1, max: 60, step: 1, def: 7, note: '季末照季分排名，前三名送加速道具；換季時季分歸零，部落的其他東西不受影響。改了從下一季開始生效。' },
    { k: 'trainTime', g: '節奏', zh: '訓練時間倍率', min: 0.2, max: 5, step: 0.1, def: 1 },
    { k: 'marchTime', g: '節奏', zh: '出征路程倍率', min: 0.2, max: 5, step: 0.1, def: 1 },
    { k: 'guardTime', g: '節奏', zh: '保護時間倍率', min: 0, max: 10, step: 0.1, def: 1, note: '新部落的保護，以及被攻破之後的保護。' },
    { k: 'prod', g: '經濟', zh: '全體產量倍率', min: 0.2, max: 5, step: 0.05, def: 1 },
    { k: 'cost', g: '經濟', zh: '建築與拓荒花費倍率', min: 0.2, max: 5, step: 0.05, def: 1 },
    { k: 'loot', g: '經濟', zh: '出征帶走物資的倍率', min: 0, max: 2, step: 0.05, def: 1 },
    { k: 'popBonus', g: '經濟', zh: '玩家最少的族群：產量加成', min: 0, max: 0.5, step: 0.01, def: 0.15 },
    { k: 'itemBonus', g: '經濟', zh: '每件器物的產量加成', min: 0, max: 0.3, step: 0.01, def: 0.08 },
    { k: 'blessMult', g: '經濟', zh: '共聚時的產量倍率', min: 1, max: 1.5, step: 0.01, def: 1.15 },
    { k: 'gatherRate', g: '採集', zh: '每人每分鐘採集的量（節奏 1 時）', min: 1, max: 60, step: 1, def: 12 },
    { k: 'gatherLoad', g: '採集', zh: '每人背得動的量', min: 10, max: 300, step: 5, def: 60 },
    { k: 'nodeCount', g: '採集', zh: '地圖上的資源點數量', min: 20, max: 600, step: 10, def: 180, note: '少於這個數量時，每半分鐘（節奏 1 時）長出新的。' },
    { k: 'boarCount', g: '採集', zh: '地圖上的山豬群數量', min: 0, max: 200, step: 2, def: 24 },
    { k: 'repairRate', g: '採集', zh: '搶修：每人每分鐘的進度（節奏 1 時）', min: 1, max: 60, step: 1, def: 12 },
    { k: 'typhoonHours', g: '採集', zh: '多久來一次颱風（小時，節奏 20 時）', min: 1, max: 48, step: 1, def: 4, note: '颱風過後，某一帶會出現幾處要搶修的地方；放 12 小時（節奏 20 時）沒人修就會消失。' },
    { k: 'eatPop', g: '經濟', zh: '每位族人每分鐘吃的糧食（節奏 1 時）', min: 0, max: 10, step: 0.1, def: 1.8, note: '族人和戰士都要吃糧食。吃光了不會餓死，只是族人不再增加、其他工作變慢、不能訓練。' },
    { k: 'eatUnit', g: '經濟', zh: '每位戰士每分鐘吃的糧食（節奏 1 時）', min: 0, max: 10, step: 0.1, def: 3, note: '出征、採集、駐守中的戰士也算。' },
    { k: 'hungryWork', g: '經濟', zh: '糧食吃光時，建材與特產的工作效率', min: 0.1, max: 1, step: 0.05, def: 0.5 },
    { k: 'atkW', g: '對戰', zh: '勇士：攻擊', min: 1, max: 40, step: 1, def: 10 },
    { k: 'hpW', g: '對戰', zh: '勇士：耐力', min: 1, max: 80, step: 1, def: 30 },
    { k: 'atkA', g: '對戰', zh: '弓手：攻擊', min: 1, max: 40, step: 1, def: 12 },
    { k: 'hpA', g: '對戰', zh: '弓手：耐力', min: 1, max: 80, step: 1, def: 18 },
    { k: 'wallPct', g: '對戰', zh: '圍籬每一級：守軍戰力增加（%）', min: 0, max: 30, step: 1, def: 8 },
    { k: 'towerPow', g: '對戰', zh: '瞭望台每一級的火力', min: 0, max: 30, step: 1, def: 9 },
    { k: 'dmg', g: '對戰', zh: '每回合的攻擊倍率', min: 0.1, max: 2, step: 0.05, def: 0.5, note: '越小打越久、回合越多。' },
    { k: 'farPct', g: '對戰', zh: '開場遠射的威力（%）', min: 0, max: 100, step: 5, def: 50, note: '開打前弓箭先射一輪。100 是和之後每一回合一樣強。' },
    { k: 'breakPct', g: '對戰', zh: '人數剩下幾成以下就撤退（%）', min: 0, max: 80, step: 1, def: 33 },
    { k: 'luckPct', g: '對戰', zh: '運氣的幅度（±%）', min: 0, max: 30, step: 1, def: 10 },
    { k: 'tierPct', g: '對戰', zh: '兵種每升一階：攻擊與耐力增加（%）', min: 0, max: 50, step: 1, def: 15 },
    { k: 'boostMin', g: '節奏', zh: '一個加速道具縮短的時間（分鐘，節奏 20 時）', min: 1, max: 120, step: 1, def: 15, note: '節奏 20 時就是這麼多分鐘；節奏越快跟著越短。' },
    { k: 'helpMin', g: '節奏', zh: '盟友幫忙一次至少縮短（分鐘，節奏 20 時）', min: 0, max: 30, step: 0.5, def: 1 },
    { k: 'helpPct', g: '節奏', zh: '盟友幫忙一次縮短剩下時間的幾 %', min: 0, max: 20, step: 0.5, def: 3 },
    { k: 'guardPct', g: '獨特兵種與英雄', zh: '山林獵手：守部落時攻擊增加（%）', min: 0, max: 100, step: 1, def: 18 },
    { k: 'bandPct', g: '獨特兵種與英雄', zh: '部落青年：每多一位同伴攻擊增加（%）', min: 0, max: 10, step: 0.5, def: 1.5 },
    { k: 'bandMax', g: '獨特兵種與英雄', zh: '部落青年：同伴加成的上限（%）', min: 0, max: 100, step: 1, def: 30 },
    { k: 'wallHpPct', g: '獨特兵種與英雄', zh: '石牆守衛：守部落時耐力增加（%）', min: 0, max: 100, step: 1, def: 16 },
    { k: 'abVolley2', g: '獨特兵種與英雄', zh: '凝神一箭：開場那一回合的攻擊倍率', min: 1, max: 5, step: 0.1, def: 1.9 },
    { k: 'abRelayBack', g: '獨特兵種與英雄', zh: '世代接力：負傷的人有幾成歸隊', min: 0.05, max: 1, step: 0.05, def: 0.2 },
    { k: 'abUnity', g: '獨特兵種與英雄', zh: '齊心：第一次交鋒的損失變成幾成（0.5 是減半）', min: 0.1, max: 1, step: 0.05, def: 0.65 },
    { k: 'abSteadfast', g: '獨特兵種與英雄', zh: '守望：發動的那一回合損失變成幾成', min: 0.1, max: 1, step: 0.05, def: 0.15 },
    { k: 'watchDefPct', g: '獨特建築', zh: '望樓：守軍戰力增加（%）', min: 0, max: 50, step: 1, def: 2 },
    { k: 'watchSlow', g: '獨特建築', zh: '望樓：來襲的路程倍率', min: 1, max: 3, step: 0.1, def: 1.5 },
    { k: 'rangeYield', g: '獨特建築', zh: '石板豬圈：採集速度倍率', min: 1, max: 3, step: 0.05, def: 1.5 },
    { k: 'pondFood', g: '獨特建築', zh: '巴拉告：每分鐘固定的糧食（節奏 1 時）', min: 0, max: 60, step: 1, def: 18 },
    { k: 'pondSp', g: '獨特建築', zh: '巴拉告：每分鐘固定的漁獲（節奏 1 時）', min: 0, max: 10, step: 0.1, def: 1.8 },
    { k: 'vaultProt', g: '獨特建築', zh: '芋頭窯：保護量倍率', min: 1, max: 4, step: 0.1, def: 2 },
    { k: 'vaultCap', g: '獨特建築', zh: '芋頭窯：倉庫容量增加', min: 0, max: 1000, step: 50, def: 300 },
    { k: 'springPop', g: '獨特建築', zh: '山泉取水處：族人增加的速度增加（%）', min: 0, max: 200, step: 5, def: 40 },
    { k: 'springEat', g: '獨特建築', zh: '山泉取水處：族人吃的糧食減少（%）', min: 0, max: 50, step: 1, def: 10 },
    { k: 'groveMat', g: '獨特建築', zh: '刺竹林：建材產量增加（%）', min: 0, max: 100, step: 1, def: 15 },
    { k: 'groveWall', g: '獨特建築', zh: '刺竹林：竹圍的加成再增加（%）', min: 0, max: 200, step: 5, def: 15 },
    { k: 'haulPct', g: '獨特建築', zh: '背籃工坊：採集隊伍背得動的量增加（%）', min: 0, max: 200, step: 5, def: 40 },
    { k: 'riverFood', g: '獨特建築', zh: '家族的溪流：糧食產量增加（%）', min: 0, max: 100, step: 1, def: 10 },
    { k: 'riverFish', g: '獨特建築', zh: '家族的溪流：到漁場採集的速度增加（%）', min: 0, max: 300, step: 10, def: 100 },
    { k: 'scoutPct', g: '獨特兵種與英雄', zh: '山徑斥候：出征時攻擊增加（%）', min: 0, max: 100, step: 1, def: 18 },
    { k: 'swiftPct', g: '獨特兵種與英雄', zh: '平原跑者：每一位讓隊伍的路程縮短（%）', min: 0, max: 10, step: 0.5, def: 3 },
    { k: 'swiftMax', g: '獨特兵種與英雄', zh: '平原跑者：路程最多縮短（%）', min: 0, max: 60, step: 1, def: 30 },
    { k: 'aidPct', g: '獨特兵種與英雄', zh: '竹林獵人：每一位讓弓手的攻擊增加（%）', min: 0, max: 20, step: 0.5, def: 3 },
    { k: 'aidMax', g: '獨特兵種與英雄', zh: '竹林獵人：弓手的攻擊最多增加（%）', min: 0, max: 100, step: 1, def: 30 },
    { k: 'rushPct', g: '獨特兵種與英雄', zh: '溪谷獵人：第一次交鋒那一回合攻擊增加（%）', min: 0, max: 200, step: 5, def: 40 },
    { k: 'abShelterPct', g: '獨特兵種與英雄', zh: '避過大水：整場對戰我方的損失減少（%）', min: 0, max: 50, step: 1, def: 10 },
    { k: 'abPinch', g: '獨特兵種與英雄', zh: '夾住大鰻魚：對方連續兩回合的攻擊減少幾成', min: 0, max: 0.9, step: 0.05, def: 0.2 },
    { k: 'heroLvAll', g: '獨特兵種與英雄', zh: '英雄每升一級，英雄在場時全隊的攻擊與耐力增加（%）', min: 0, max: 20, step: 0.5, def: 3 },
    { k: 'abCover', g: '獨特兵種與英雄', zh: '雲豹的山徑：第一次交鋒那一回合的攻擊倍率', min: 1, max: 4, step: 0.1, def: 1.4 },
    { k: 'abGatherPct', g: '獨特兵種與英雄', zh: '聚在一起：交鋒後每一回合攻擊多（%）', min: 0, max: 20, step: 0.5, def: 7.5 },
    { k: 'abGatherMax', g: '獨特兵種與英雄', zh: '聚在一起：攻擊最多多（%）', min: 0, max: 100, step: 1, def: 24 }
  ];
  Tribes.playable().forEach(function (t) {   // 每一族：產量倍率、獨特兵種的攻擊與耐力
    TUNE_DEF.push({ k: 'prod_' + t.id, g: t.zh, zh: t.zh + '：產量倍率', min: 0.5, max: 2, step: 0.01, def: 1 });
    if (t.uniq) TUNE_DEF.push({ k: 'uAtk_' + t.id, g: t.zh, zh: t.uniq.unit.zh + '：攻擊', min: 1, max: 40, step: 1, def: t.uniq.unit.atk },
      { k: 'uHp_' + t.id, g: t.zh, zh: t.uniq.unit.zh + '：耐力', min: 1, max: 80, step: 1, def: t.uniq.unit.hp });
  });
  var TUNE_BY = {}; TUNE_DEF.forEach(function (d) { TUNE_BY[d.k] = d; });
  function tuneDefaults() { var o = Object.create(null); TUNE_DEF.forEach(function (d) { o[d.k] = d.def; }); return o; }
  var TUNE = tuneDefaults();
  function r5(n) { return Math.round(n / 5) * 5; }   // 目前生效的數值。每個世界有自己的一份，執行規則前會換成那個世界的
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
  var OFFLINE_MAX = 8 * 3600000;
  var FIGHT = { rounds: 8 };               // 對戰最多打幾回合（不含開場的遠射）
  var LOOT_FRAC = [0, 0.10, 0.25, 0.40];   // 險勝、獲勝、大勝時，帶走對方可被拿走物資的比例
  var GRADE = ['', '險勝', '獲勝', '大勝'];
  var TUNE_REV = 2, MAP_REV = 2;   // MAP_REV：地圖的版本（2 是格子變細之後）                        // 對戰規則的版本。存檔比這個舊，對戰相關的可調數值就改用新的預設（舊規則調出來的數字不適用）
  var BOT_NAMES = {
    atayal: ['霧林部落', '溪谷部落'], bunun: ['雲海部落', '楓林部落'],
    amis: ['浪花部落', '月桃部落'], paiwan: ['晨曦部落', '山風部落'],
    rukai: ['石屏部落', '山泉部落'], pinuyumayan: ['竹影部落', '平原部落'],
    saisiyat: ['桂竹部落', '山腹部落'], tsou: ['楓葉部落', '雲谷部落']
  };
  var PHRASES = { hello: 1, thanks: 1, trade: 1, ally: 1, cheer: 1, nice: 1 };

  /* 沒有原型的字典。玩家送來的名稱會拿來查表，一般物件遇到 __proto__、constructor、toString 這類名稱會查到內建的東西，
   * 輕則判斷錯誤、重則整個伺服器出錯，所以凡是會被外來名稱查到的表都用這個 */
  function dict(o) { var d = Object.create(null); if (o) Object.keys(o).forEach(function (k) { d[k] = o[k]; }); return d; }
  CLEAR = dict(CLEAR); DEF = dict(DEF); CENTER_UP = dict(CENTER_UP); UNIT = dict(UNIT); NODE = dict(NODE); TECH = dict(TECH); UNLOCK = dict(UNLOCK); PHRASES = dict(PHRASES); TUNE_BY = dict(TUNE_BY);
  function cost(type, level) {
    if (type === 'center') { var c = centerUp(level); return c ? { food: r5(c.food * TUNE.cost), mat: r5(c.mat * TUNE.cost) } : null; }
    var d = DEF[type], m = MULT(level) * TUNE.cost;
    return { food: r5(d.base.food * m), mat: r5(d.base.mat * m) };
  }
  function buildTime(type, level) {
    var base = type === 'center' ? centerUp(level).time : DEF[type].time * TMULT(level);   // 秒數已經算進遊戲節奏
    return Math.max(1, Math.round(base * TUNE.pace * TUNE.buildTime));
  }
  function limit(type, C, v) {
    if (UNLOCK[type]) return C < UNLOCK[type] ? 0 : type === 'taro' ? Math.min(4, 1 + Math.floor((C - UNLOCK.taro) / 3)) : 1;
    switch (type) {
      case 'house': case 'farm': case 'mat': return Math.min(8, C + 1);         // 數量有上限，往後主要靠升級
      case 'special': case 'storage': return Math.min(4, 1 + Math.floor(C / 2));
      case 'barracks': return 1;
      case 'tower': return Math.min(4, Math.max(0, C - 1));
      case 'unique': return v && v.quest >= 3 ? 1 : 0;
    }
    return 0;
  }
  function centerLevel(v) { return v.tiles[CENTER_TILE].level; }
  function count(v, type) { var n = 0; for (var i = 0; i < TILE_N; i++) if (v.tiles[i] && v.tiles[i].type === type) n++; return n; }
  function sumLevels(v, type) { var n = 0; for (var i = 0; i < TILE_N; i++) if (v.tiles[i] && v.tiles[i].type === type) n += v.tiles[i].level; return n; }
  function levelsOf(v, type) { var a = []; for (var i = 0; i < TILE_N; i++) if (v.tiles[i] && v.tiles[i].type === type && v.tiles[i].level > 0) a.push(v.tiles[i].level); return a; }
  function tech(v, id) { return (v.tech && v.tech[id]) || 0; }
  function bl(v, type) { return levelsOf(v, type).reduce(function (m, L) { return Math.max(m, L); }, 0); }   // 這種建築最高幾級（沒有就是 0）
  function techMax(v) { var L = bl(v, 'craft'); return L ? Math.min(TECH_MAX, 1 + Math.floor((L - 1) / 5)) : 0; }
  function builders(v) { return BUILDERS + (bl(v, 'hut') ? 1 : 0); }   // 工寮：多一個工人
  function buildMul(v) { return (1 - 0.04 * tech(v, 'build')) * (1 - 0.01 * bl(v, 'hut')); }   // 建設時間的倍率
  function marchMul(v) { return 1 - 0.05 * tech(v, 'march'); }
  function offerMax(v) { var L = bl(v, 'market'); return 3 + (L ? 1 + Math.floor(L / 10) : 0); }
  function barterMul(v) { return Math.max(0.5, 1 - 0.01 * bl(v, 'market') - 0.06 * tech(v, 'trade')); }
  function giftMax(v) { return 100 + 20 * bl(v, 'guest'); }
  function relMul(v) { return 1 + 0.05 * bl(v, 'guest'); }   // 迎賓亭：交易、送禮、結盟讓族群關係變好得更多
  function blessMul(v) { return 1 + 0.04 * bl(v, 'plaza'); }  // 聚會廣場：共聚的時間更長
  function healCap(v) { var L = bl(v, 'heal'); return L ? Math.round((6 + 4 * L) * (1 + TECH.care.per / 100 * tech(v, 'care'))) : 0; }
  function healRate(v) { var L = bl(v, 'heal'); return L ? (0.6 + 0.12 * L) / 60 * (1 + 0.1 * tech(v, 'care')) / TUNE.pace : 0; }   // 每秒有幾位負傷的人歸隊
  /* 兵種階級：訓練的方法進步了，全部落的這種兵一起升階（不分開算人數）。每升一階，攻擊與耐力 +TUNE.tierPct%。
   * 條件：勇士看訓練場與矛術、弓手看靶場與射箭、獨特兵種看訓練場與守備 */
  var TIER = {
    w: [null, null, { b: 'barracks', L: 9, t: 'spear', n: 2 }, { b: 'barracks', L: 17, t: 'spear', n: 4 }],
    a: [null, null, { b: 'archery', L: 9, t: 'archery', n: 2 }, { b: 'archery', L: 17, t: 'archery', n: 4 }],
    u: [null, null, { b: 'barracks', L: 12, t: 'guard', n: 2 }, { b: 'barracks', L: 20, t: 'guard', n: 4 }]
  };
  function tierOf(v, k) { var n = 1; for (var i = 2; i <= 3; i++) { var r = TIER[k][i]; if (bl(v, r.b) >= r.L && tech(v, r.t) >= r.n) n = i; else break; } return n; }
  function tiers(v) { return { w: tierOf(v, 'w'), a: tierOf(v, 'a'), u: tierOf(v, 'u') }; }
  function tierMul(n) { return 1 + TUNE.tierPct / 100 * ((n || 1) - 1); }
  /* 對戰的加成：矛術、射箭、靶場、守備、兵種階級。
   * mod = { w 勇士與近戰獨特兵種的攻擊, a 弓手與遠程獨特兵種的攻擊, def 守在自己部落時, tw、ta、tu 勇士、弓手、獨特兵種的階級（攻擊與耐力一起乘） } */
  function battleMod(v, home) {
    var t = tiers(v);
    return { w: 1 + TECH.spear.per / 100 * tech(v, 'spear'), a: (1 + TECH.archery.per / 100 * tech(v, 'archery')) * (1 + 0.02 * bl(v, 'archery')), def: home ? 1 + TECH.guard.per / 100 * tech(v, 'guard') : 1,
      tw: tierMul(t.w), ta: tierMul(t.a), tu: tierMul(t.u) };
  }
  function helpMax(v) { return 3 + Math.floor(bl(v, 'guest') / 2); }   // 迎賓亭：一項工程最多讓盟友幫幾次
  function supportCap(v) { return 5 * bl(v, 'guest'); }                 // 迎賓亭：最多接待幾位來支援的盟友戰士
  var STAY = 3650 * 864e5;   // 支援的隊伍駐守時沒有抵達時間：用很久以後代替，叫回來時才改
  function sendBack(m, now) { var gone = m.phase === 'out' ? Math.min(m.travel || 0, now - m.departAt) : m.travel || 0; m.phase = 'back'; m.departAt = now; m.arriveAt = now + gone; }
  /* 聚會廣場的定時任務：部落裡的日常工作（一般的說法，不是祭儀）。每隔一段時間換一批，選一件做，做完領獎勵。
   * 星等 1～3：時間是節奏 20 時的 30、60、120 分鐘；三星的另外送一個加速道具 */
  var CHORES = ['修補家屋的屋頂', '整理柴薪', '到溪邊取水', '曬乾收成的作物', '編竹簍', '修整田埂', '照顧剛發芽的作物', '磨利工具', '整理倉庫', '清理部落的步道', '修補圍籬', '準備大家的飯菜'];
  var CHORE_MIN = [0, 30, 60, 120], CHORE_EVERY = 6 * 60;   // 每 6 小時（節奏 20 時）換一批
  function choreOffers(v) { return 3 + Math.floor(bl(v, 'plaza') / 5); }        // 一次列出幾件可以選
  function choreSlots(v) { return 1 + Math.floor(bl(v, 'plaza') / 10); }         // 同時可以做幾件
  function choreReward(v, star) {
    var C = centerLevel(v), m = star * (1 + 0.04 * bl(v, 'plaza')) * TUNE.cost, base = 8 * eq(C);   // 一直有在做的話，大約多七成的糧食與建材收入
    return { food: r5(base * m), mat: r5(base * m), sp: star >= 2 ? 3 * star : 0, boost: star >= 3 ? 1 : 0 };
  }
  function techCost(id, to) { var f = Math.pow(2, to - 1) * TUNE.cost; return { food: r5(150 * f), mat: r5(150 * f) }; }
  function techTime(v, to) { return Math.max(1, Math.round(90 * Math.pow(1.8, to - 1) * TUNE.pace * (1 - 0.01 * bl(v, 'craft')))); }
  function popCap(v) { var n = 4; levelsOf(v, 'house').forEach(function (l) { n += 1 + 2 * l; }); return n; }
  function slots(v) { return { food: (sumLevels(v, 'farm') + sumLevels(v, 'taro')) * 2, mat: sumLevels(v, 'mat') * 2, special: sumLevels(v, 'special') * 2 }; }   // 芋頭田也是糧食的位置
  function caps(v) {
    var C = centerLevel(v), st = sumLevels(v, 'storage'), se = 0;
    levelsOf(v, 'storage').forEach(function (L) { se += eq(L); });
    var vault = uniq(v) === 'vault';   // 排灣的獨特建築：耐放的存糧，容量多 300、受保護的份量加倍
    var tm = 1 + TECH.store.per / 100 * tech(v, 'store');   // 技藝「儲藏」
    return { res: Math.round((300 + 200 * eq(C) + 400 * se) * tm + (vault ? TUNE.vaultCap : 0)), sp: 20 + 20 * C + 20 * st, protect: Math.round((50 * eq(C) + 100 * se) * tm * (vault ? TUNE.vaultProt : 1)) };
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
  function swiftMul(v, uu) { var st = ustat(v.tribe); return st && st.trait === 'swift' && uu > 0 ? 1 - Math.min(TUNE.swiftMax, TUNE.swiftPct * uu) / 100 : 1; }   // 卑南的平原跑者：隊伍裡有他們，路程縮短
  function marchMax(v) { return 2 + (uniq(v) === 'range' ? 1 : 0); }   // 同時可以有幾支隊伍在外面（布農的石板豬圈多一支）
  function gatherRate(v, n, k) {   // n 個人每秒採多少（k：資源點的種類；鄒的家族的溪流：到漁場採得快）
    return n * TUNE.gatherRate / 60 * (uniq(v) === 'range' ? TUNE.rangeYield : 1) * (uniq(v) === 'river' && k === 'fish' ? 1 + TUNE.riverFish / 100 : 1) * (1 + TECH.hunt.per / 100 * tech(v, 'hunt')) * TUNE.prod / TUNE.pace;
  }
  function loadPer(v) { return TUNE.gatherLoad * (v && uniq(v) === 'haul' ? 1 + TUNE.haulPct / 100 : 1); }   // 每人背得動多少（賽夏的背籃工坊：背得多）
  function loadOf(m, v) { return all3(m) * loadPer(v); }
  /* 一位族人做這項工作每秒的產量（還沒算「吃不飽、工作變慢」） */
  function perWorker(v, k, speed) {
    var t = Tribes.get(v.tribe), b = t && t.bonus, g = speed * TUNE.prod * (TUNE['prod_' + v.tribe] || 1) / TUNE.pace;   // 後台的產量倍率與遊戲節奏
    var m = (b && b.key === k ? b.mult : 1) * (1 + (v.pb || 0));   // 族群特長，加上人數少的族群的加成
    if ((k === 'food' && v.quest >= 1) || (k === 'mat' && v.quest >= 2)) m *= 1 + TUNE.itemBonus;   // 任務拿到的器物
    if (v.blessed) m *= TUNE.blessMult;                                                        // 共聚之後的同心
    m *= 1 + 0.04 * tech(v, k === 'food' ? 'farming' : k === 'mat' ? 'gather' : 'weave');      // 技藝
    if (k === 'food') m *= 1 + 0.02 * bl(v, 'water');                                           // 引水道
    return RATE[k] * m * g;
  }
  function rates(v, speed) {
    var s = slots(v), out = {}, g = speed * TUNE.prod * (TUNE['prod_' + v.tribe] || 1) / TUNE.pace;
    ['food', 'mat', 'special'].forEach(function (k) {
      out[k] = Math.min(v.jobs[k], s[k]) * perWorker(v, k, speed) * (v.hungry && k !== 'food' ? TUNE.hungryWork : 1);   // 吃不飽：種田的照種，其他工作變慢
    });
    if (uniq(v) === 'pond') { out.food += TUNE.pondFood / 60 * g; out.special += TUNE.pondSp / 60 * g; }
    if (uniq(v) === 'grove') out.mat *= 1 + TUNE.groveMat / 100;   // 卑南的刺竹林：建材多
    if (uniq(v) === 'river') out.food *= 1 + TUNE.riverFood / 100;   // 鄒的家族的溪流：糧食多
    return out;
  }
  function soldiers(v) { return all3(v.units) + all3(v.away) + (v.hurt ? all3(v.hurt) : 0); }   // 出征、採集中、在療養屋休養的也算
  /* 全部落每秒吃掉的糧食：族人加上戰士 */
  function eatRate(v, speed) { return (v.pop * TUNE.eatPop * (uniq(v) === 'spring' ? 1 - TUNE.springEat / 100 : 1) + soldiers(v) * TUNE.eatUnit) / 60 * speed / TUNE.pace; }   // 魯凱的山泉取水處：族人省一點糧
  function foreignKinds(v) { var n = 0; for (var k in v.sp) if (k !== v.tribe && v.sp[k] >= 1) n++; return n; }
  function prosperity(v) {
    var p = 0;
    for (var i = 0; i < TILE_N; i++) { if (v.tiles[i]) p += v.tiles[i].level * (v.tiles[i].type === 'center' ? 30 : 10); if (v.land[i] && SITES[i].ring > 0) p += 3; }
    return Math.round(p + v.wall * 10 + v.pop * 3 + foreignKinds(v) * 15 + Math.min(40, v.gifts * 2));
  }
  /* 部落的戰力：建築（每一級都算，越高級越多）、圍籬、所有的戰士。之後可以拿來做排行榜 */
  var POW_W = { center: 12, unique: 0 };
  function villagePower(v) {
    var p = 0, tri = function (L) { return L * (L + 1) / 2; };
    for (var i = 0; i < TILE_N; i++) { var b = v.tiles[i]; if (b && b.level > 0) p += b.type === 'unique' ? 40 : (POW_W[b.type] || 3) * tri(b.level); }
    p += 4 * tri(v.wall);
    for (var tk in v.tech || {}) p += 30 * v.tech[tk];   // 技藝
    return Math.round(p + power({ tribe: v.tribe, w: v.units.w + v.away.w, a: v.units.a + v.away.a, u: (v.units.u || 0) + (v.away.u || 0), mod: battleMod(v, false) }));
  }
  function derived(v, speed) {
    var c = caps(v);
    var rt = rates(v, speed), eat = eatRate(v, speed);
    return { cap: c.res, spCap: c.sp, protect: c.protect, slots: slots(v), rates: rt, eat: eat, net: rt.food - eat, hungry: !!v.hungry, popCap: popCap(v),
      armyCap: armyCap(v), builders: builders(v), techMax: techMax(v), tiers: tiers(v), helpMax: helpMax(v), healCap: healCap(v), healRate: healRate(v) * speed, offerMax: offerMax(v), giftMax: giftMax(v), barterMul: barterMul(v), prosperity: prosperity(v), power: villagePower(v), center: centerLevel(v), marchMax: marchMax(v), uniq: uniq(v) };
  }
  /* 這塊地能不能拓荒：要是山林、緊鄰已開墾的地、部落中心等級夠、有空的工程名額、糧食夠 */
  function clearInfo(v, i) {
    var s = SITES[i], out = { ok: false, why: '' };
    if (!s || v.land[i]) { out.why = '這裡已經開墾過了'; return out; }
    var c = CLEAR[s.ring]; out.food = r5(c.food * TUNE.cost); out.time = Math.max(1, Math.round(c.time * TUNE.pace * TUNE.buildTime * buildMul(v))); out.gain = c.gain;
    if (v.queue.some(function (q) { return q.type === 'clear' && q.tile === i; })) out.why = '正在拓荒';
    else if (!s.near.some(function (j) { return v.land[j]; })) out.why = '要從已經開墾的地方往外拓荒';
    else if (centerLevel(v) < c.center) out.why = 'center';
    else if (v.queue.length >= builders(v)) out.why = '同時只能進行 ' + builders(v) + ' 項工程';
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
  /* 對戰是自動的，只有一個戰場，雙方都不用下指令：
   * 先是一輪遠射（只有弓手、遠程的獨特兵種和瞭望台出手），接著最多打 FIGHT.rounds 回合，每一回合雙方同時出手。
   * 哪一邊的人數掉到開打時的三分之一以下（TUNE.breakPct）就撤退。守方撤退算進攻方獲勝；進攻方撤退算守方守住；
   * 兩邊同一回合撐不住，剩下的人比例高的一方贏；打完所有回合還分不出來，算守方守住。
   * 英雄能力會在適合的時機自動發動，一場一次。
   * 不呈現傷亡細節：失去戰力的單位一律視為「負傷撤退」。 */
  function mkSide(w, a, u, tribe, def, mod) { return { w: w, a: a, u: u || 0, pool: 0, lostW: 0, lostA: 0, lostU: 0, st: ustat(tribe), def: !!def, mod: mod || null }; }
  function umult(s) {   // 獨特兵種的攻擊加成
    var st = s.st, m = 1;
    if (st.trait === 'guard' && s.def) m *= 1 + TUNE.guardPct / 100;                              // 守在自己部落時更強
    if (st.trait === 'band') m *= 1 + Math.min(TUNE.bandMax, TUNE.bandPct * (s.u || 0)) / 100;    // 同行的人越多越強
    if (st.trait === 'scout' && !s.def) m *= 1 + TUNE.scoutPct / 100;                              // 熟悉山路：出征時更強（守部落時沒有）
    if (st.trait === 'rush' && s.r === 1) m *= 1 + TUNE.rushPct / 100;                          // 溪谷獵人：第一次交鋒那一回合衝得最快
    return m;
  }
  function uhp(s) { var st = s.st; return st ? st.hp * (st.trait === 'wall' && s.def ? 1 + TUNE.wallHpPct / 100 : 1) : 1; }
  /* 一方這一回合的攻擊。far：開場的遠射，只算遠程的人 */
  function output(s, far) {
    var st = s.st, u = s.u || 0, md = s.mod || {}, mw = md.w || 1, ma = md.a || 1, aid = st && st.trait === 'aid' && u ? 1 + Math.min(TUNE.aidMax, TUNE.aidPct * u) / 100 : 1;   // 竹林獵人：替弓手補給，弓手更強
    var o = s.a * TUNE.atkA * ma * (md.ta || 1) * aid + (far ? 0 : s.w * TUNE.atkW * mw * (md.tw || 1));   // mod：技藝、靶場與兵種階級的加成
    if (u && st && (!far || st.kind === 'ranged')) o += u * st.atk * umult(s) * (st.kind === 'ranged' ? ma : mw) * (md.tu || 1);
    return o * (md.def || 1);
  }
  function hit(s, dmg) {   // 勇士在前面先承受；近戰的獨特兵種排第二，遠程的排最後
    var st = s.st, md = s.mod || {}, hw = TUNE.hpW * (md.tw || 1), ha = TUNE.hpA * (md.ta || 1), hu = uhp(s) * (md.tu || 1);   // 兵種階級也加耐力
    var order = st && st.kind === 'ranged' ? [['w', 'lostW', hw], ['a', 'lostA', ha], ['u', 'lostU', hu]] : [['w', 'lostW', hw], ['u', 'lostU', hu], ['a', 'lostA', ha]];
    s.pool += dmg;
    for (var i = 0; i < 3; i++) {
      var k = order[i][0];
      while ((s[k] || 0) > 0 && s.pool >= order[i][2]) { s[k]--; s[order[i][1]] = (s[order[i][1]] || 0) + 1; s.pool -= order[i][2]; }
      if ((s[k] || 0) > 0) break;
    }
    if (all3(s) === 0) s.pool = 0;
  }
  function rally(s, frac, rng) {   // 負傷的人有一部分歸隊；站前面的先回來。不是整數的部分用機率決定（1.4 人：四成的機會是 2 人），人多人少才一樣划算
    var lost = (s.lostW || 0) + (s.lostU || 0) + (s.lostA || 0), x = lost * frac, n = Math.min(lost, Math.floor(x) + (rng() < x - Math.floor(x) ? 1 : 0)), back = 0;
    (s.st && s.st.kind === 'ranged' ? [['w', 'lostW'], ['a', 'lostA'], ['u', 'lostU']] : [['w', 'lostW'], ['u', 'lostU'], ['a', 'lostA']]).forEach(function (p) {
      var k = Math.min(s[p[1]] || 0, n - back);
      s[p[0]] = (s[p[0]] || 0) + k; s[p[1]] = (s[p[1]] || 0) - k; back += k;
    });
    return back;
  }
  function left3(s) { return { w: s.w, a: s.a, u: s.u || 0 }; }
  /* 打一場。A = { tribe, w, a, u, hero }；D = 同上，再加 wall（圍籬等級）、towers（各座瞭望台的等級）、uniq（獨特建築的效果代號）、
   * home（是不是守在自己的部落，預設是；資源點的較量不是）。
   * 回傳 { win, grade（1 險勝、2 獲勝、3 大勝；沒贏是 0）, left 攻方剩下的人, home 守方剩下的人, lostA, lostD, used 用掉的英雄能力,
   *        start 開打時的人數, wall, towerN, log 每一回合的紀錄 }
   * 每一回合的紀錄：{ r 第幾回合（0 是遠射）, a、d 這一回合結束時雙方剩下的人, ha、hd 這一回合發動的英雄能力, backA、backD 歸隊的人數 } */
  /* 英雄等級（1～5）：每升一級，英雄在場時全隊的攻擊與耐力多 heroLvAll%（預設 3%），用過之後休息的時間少一成。
   * 試過讓各英雄的能力本身隨等級變強，但能力之間有相剋（例如齊心正好擋住雲豹的山徑），兩邊都 5 級時各族會失衡，所以改成全隊的加成，各族一樣 */
  var HERO_MAX = 5, HERO_REQ = [0, 0, 6, 9, 12, 15];   // 升到幾級要部落中心幾級
  function heroLvOf(L) { return Math.max(1, Math.min(HERO_MAX, int(L) || 1)); }
  function heroBoost(L) { return 1 + TUNE.heroLvAll / 100 * (heroLvOf(L) - 1); }   // 英雄在場時全隊的攻擊與耐力倍數
  function heroAb(ab) {   // 能力的數字（不隨等級改變）
    if (ab === 'volley2') return TUNE.abVolley2;
    if (ab === 'cover') return TUNE.abCover;
    if (ab === 'unity') return TUNE.abUnity;
    if (ab === 'steadfast') return TUNE.abSteadfast;
    if (ab === 'relay') return TUNE.abRelayBack;
    if (ab === 'gather') return TUNE.abGatherPct;
    if (ab === 'shelter') return TUNE.abShelterPct;
    if (ab === 'pinch') return TUNE.abPinch;
    return 1;
  }
  function heroCost(to) { var C = HERO_REQ[to] || 1, f = r5(300 * eq(C) * TUNE.cost); return { food: f, mat: f, sp: 10 + 10 * C }; }
  function heroTime(to) { return 60 * Math.pow(2, to - 2); }   // 正式節奏的分鐘數：2 級 1 小時、3 級 2 小時、4 級 4 小時、5 級 8 小時
  function heroRest(v) { return HERO_REST * Math.max(0.5, 1 - 0.1 * ((v.heroLv || 1) - 1)); }   // 每升一級，用過之後要休息的時間少一成
  function autoBattle(A, D, rng) {
    rng = rng || Math.random;
    var a = mkSide(A.w, A.a, A.u, A.tribe, false, A.mod), d = mkSide(D.w, D.a, D.u, D.tribe, D.home !== false, D.mod), na = all3(a), nd = all3(d);
    var tw = D.towers || [], towers = tw.reduce(function (s, L) { return s + TUNE.towerPow * L; }, 0);
    var dm = defWall(D.wall || 0, D.uniq) * (D.uniq === 'watch' ? 1 + TUNE.watchDefPct / 100 : 1);
    var heroOf = function (o) { var t = o.hero && Tribes.get(o.tribe); return t && t.hero ? t.hero.ability : null; };
    var hero = { a: heroOf(A), d: heroOf(D) }, hf = { a: heroLvOf(A.heroLv), d: heroLvOf(D.heroLv) }, hb = { a: hero.a ? heroBoost(hf.a) : 1, d: hero.d ? heroBoost(hf.d) : 1 }, used = { a: null, d: null }, gath = { a: null, d: null }, pinch = { a: null, d: null }, shel = { a: false, d: false }, log = [], brk = TUNE.breakPct / 100, luck = TUNE.luckPct / 100, outA = false, outD = nd === 0;
    for (var r = 0; r <= FIGHT.rounds && !outA && !outD; r++) {
      var far = r === 0, rec = { r: r }, mod = { a: { out: 1, take: 1 }, d: { out: 1, take: 1 } };
      a.r = d.r = r;
      if (far && output(a, true) + output(d, true) + towers === 0) continue;   // 兩邊都沒有弓箭：直接接近
      [['a', a, na], ['d', d, nd]].forEach(function (x) {   // 英雄能力：時機到了就自動發動
        var sd = x[0], s = x[1], n0 = x[2], ab = hero[sd], left = all3(s), go = false;
        if (!ab) return;
        if (ab === 'volley2') { go = !far || output(s, true) > 0; if (go) mod[sd].out = heroAb('volley2'); }             // 開場就凝神放箭（沒有弓箭的話留到第一次交鋒）
        else if (ab === 'unity') { go = !far; if (go) mod[sd].take = heroAb('unity'); }                                  // 第一次交鋒時彼此掩護
        else if (ab === 'relay') { go = !far && n0 - left >= Math.max(1, Math.ceil(n0 * 0.3)); if (go) rec['back' + sd.toUpperCase()] = rally(s, heroAb('relay'), rng); }   // 負傷的人超過三成：後面的人接上來
        else if (ab === 'steadfast') { go = !far && left <= n0 * 0.6; if (go) mod[sd].take = heroAb('steadfast'); }      // 人數剩六成以下：守住陣腳
        else if (ab === 'cover') { go = !far; if (go) mod[sd].out = heroAb('cover'); }                                 // 走雲豹找到的山徑，第一次交鋒時出其不意
        else if (ab === 'gather') { go = !far; if (go) gath[sd] = r; }
        else if (ab === 'shelter') { go = true; shel[sd] = true; }                                                         // 開戰就發動：整場對戰懂得保護自己
        else if (ab === 'pinch') { go = !far; if (go) pinch[sd] = r; }                                                    // 夾住對方：連續兩回合使不上力                                                   // 交鋒之後越打越齊心
        if (go) { rec['h' + sd] = ab; used[sd] = ab; hero[sd] = null; }
      });
      ['a', 'd'].forEach(function (sd) { mod[sd].out *= hb[sd]; mod[sd].take /= hb[sd]; });   // 英雄在場：等級越高，全隊越有信心
      ['a', 'd'].forEach(function (sd) { if (shel[sd]) mod[sd].take *= 1 - TUNE.abShelterPct / 100; });   // 避過大水
      ['a', 'd'].forEach(function (sd) { if (pinch[sd] != null && r - pinch[sd] < 2) mod[sd === 'a' ? 'd' : 'a'].out *= 1 - TUNE.abPinch; });   // 螃蟹夾住對方
      ['a', 'd'].forEach(function (sd) { if (gath[sd] != null) mod[sd].out *= 1 + Math.min(TUNE.abGatherMax, TUNE.abGatherPct * (r - gath[sd] + 1)) / 100; });
      var scale = TUNE.dmg * (far ? TUNE.farPct / 100 : 1);
      var oa = output(a, far) * mod.a.out * (1 - luck + rng() * 2 * luck) * scale;
      var od = (output(d, far) * dm + towers) * mod.d.out * (1 - luck + rng() * 2 * luck) * scale;
      hit(a, od * mod.a.take); hit(d, oa * mod.d.take);
      rec.a = left3(a); rec.d = left3(d); log.push(rec);
      outA = all3(a) <= Math.floor(na * brk); outD = all3(d) <= Math.floor(nd * brk);
    }
    // 兩邊在同一回合撐不住：剩下的人比例高的一方贏，一樣就算守住
    var win = outA && outD ? all3(a) * nd > all3(d) * na : outD, lostA = na - all3(a), lostD = nd - all3(d);
    return { win: win, grade: !win ? 0 : lostA * 4 <= na ? 3 : lostA * 2 <= na ? 2 : 1, left: left3(a), home: left3(d), lostA: lostA, lostD: lostD, used: used,
      start: { a: { w: A.w, a: A.a, u: A.u || 0 }, d: { w: D.w, a: D.a, u: D.u || 0 } }, wall: D.wall || 0, towerN: tw.length, log: log };
  }
  /* 戰力：一個數字代表這群人有多強（攻擊總和 × 耐力總和，再開根號）。o = { tribe, w, a, u }；
   * 守部落時再給 def: true、wall、towers、uniq，圍籬和瞭望台會算進去。出征前的「勝算」就是拿雙方的戰力來比 */
  function power(o) {
    var s = mkSide(o.w || 0, o.a || 0, o.u || 0, o.tribe, !!o.def, o.mod), md = o.mod || {}, atk = output(s, false), hp = s.w * TUNE.hpW * (md.tw || 1) + s.a * TUNE.hpA * (md.ta || 1) + s.u * uhp(s) * (md.tu || 1);
    if (o.def) atk = atk * defWall(o.wall || 0, o.uniq) * (o.uniq === 'watch' ? 1 + TUNE.watchDefPct / 100 : 1) + (o.towers || []).reduce(function (t, L) { return t + TUNE.towerPow * L; }, 0);
    return Math.round(Math.sqrt(atk * hp));
  }
  function wallMul(L) { return 1 + TUNE.wallPct / 100 * (Math.min(L, 5) + 0.5 * Math.max(0, L - 5)); }   // 圍籬：5 級以後每級的加成減半
  function defWall(L, u) { var m = wallMul(L); return u === 'grove' ? 1 + (m - 1) * (1 + TUNE.groveWall / 100) : m; }   // 卑南的刺竹林：竹圍的加成更多
  var ODDS = { high: 1.2, low: 0.95 };   // 我方戰力是對方的幾倍以上算「高」、幾倍以下算「低」（用模擬校正過，見測試）
  function odds(mine, theirs) {
    if (mine <= 0) return 'low';
    var r = mine / Math.max(1, theirs);
    return r >= ODDS.high ? 'high' : r <= ODDS.low ? 'low' : 'mid';
  }

  // ---------- 自動模擬對戰（平衡用） ----------
  /* 模擬一場，不經過世界、不花時間。和實際對戰用的是同一個 autoBattle */
  function simBattle(A, D, rng) { return autoBattle(A, D, rng); }
  /* 各族互打的勝率表。o = { n: 每一組打幾場, army: {w,a,u} 雙方隊伍的基準, spread: 人數的浮動幅度, wall, towers, uniq: 有沒有蓋獨特建築, hero: 有沒有英雄, rng }
   * 自動對戰幾乎是戰力高的一方贏，人數完全相同時勝率不是 0 就是 100，量不出強弱；所以每一場雙方每種兵的人數各自在基準的上下浮動（預設三成），
   * 量的是「兵力差不多的時候，誰比較常贏」。
   * 回傳 pairs（攻方族 × 守方族的攻方勝率）、duel（兩族之間的整體勝率）、tribes（每一族的總評）、base（平均攻方勝率） */
  function simMatrix(o) {
    o = o || {};
    var n = Math.max(20, Math.min(5000, Math.round(o.n || 400))), rng = o.rng || Math.random, ids = Tribes.playable().map(function (t) { return t.id; });
    var army = o.army || { w: 4, a: 4, u: 4 }, wall = o.wall == null ? 1 : o.wall, towers = o.towers || [], hero = o.hero !== false, ub = o.uniq !== false, spread = o.spread == null ? 0.3 : o.spread;
    var vary = function (k) { return Math.max(0, Math.round(army[k] * (1 + spread * (2 * rng() - 1)))); };
    var atk = {}, out = { n: n, army: army, spread: spread, wall: wall, towers: towers, hero: hero, uniq: ub, pairs: [], duel: [], tribes: [], base: 0 }, sum = 0;
    ids.forEach(function (x) {
      ids.forEach(function (y) {
        var win = 0, grade = 0;
        for (var i = 0; i < n; i++) {
          var r = autoBattle({ tribe: x, w: vary('w'), a: vary('a'), u: vary('u'), hero: hero, heroLv: o.heroLv || 1 },
            { tribe: y, w: vary('w'), a: vary('a'), u: vary('u'), hero: hero, heroLv: o.heroLv || 1, wall: wall, towers: towers, uniq: ub ? Tribes.get(y).uniq.building.effect : '' }, rng);
          if (r.win) { win++; grade += r.grade; }
        }
        atk[x + '>' + y] = win / n; sum += win / n;
        out.pairs.push({ a: x, d: y, win: +(win / n).toFixed(3), grade: win ? +(grade / win).toFixed(2) : 0 });
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
    this.stats = dict(); this.rel = dict(); this.nodes = dict(); this.nodesV = 1; this.lastNode = -1e15; this.stock = dict();
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
  /* 後台：幫部落改名（處理不當的名稱）。name 是部落名稱，owner 是主人的名字，沒給的就不改 */
  World.prototype.adminRename = function (id, d, now) {
    var v = this.villages[id]; if (!v) return { ok: false, msg: '找不到這個部落' };
    var name = d.name == null ? '' : clean(d.name, 10), owner = d.owner == null ? '' : clean(d.owner, 10), done = [];
    if (name && name !== v.name) { done.push('部落「' + v.name + '」改名為「' + name + '」'); v.name = name; }
    if (owner && owner !== v.owner) { done.push('「' + v.name + '」的主人「' + v.owner + '」改名為「' + owner + '」'); v.owner = owner; }
    if (!done.length) return { ok: false, msg: '名稱沒有變' };
    this.adminNote(done.join('、'), now);
    return { ok: true, msg: done.join('、') };
  };
  /* 後台：移除一個部落（灌水或棄置的帳號）。它派出去的隊伍、佔領的資源點、掛的單、聯盟身分一併清掉，
   * 別人正朝它出征的隊伍會折返。移除後原本的識別碼作廢，那個玩家會回到開始畫面 */
  World.prototype.removeVillage = function (id, now) {
    TUNE = this.tune;
    var v = this.villages[id], self = this; if (!v) return { ok: false, msg: '找不到這個部落' };
    if (v.ally) ACTIONS.allyLeave.call(this, v, {}, now);
    this.marches = this.marches.filter(function (m) {
      if (m.from === id) return false;
      if (m.to === id && m.phase === 'out') {   // 別人朝它出征的隊伍：折返
        var o = self.villages[m.from];
        if (o) self.pushReport(o, { t: now, role: 'atk', other: v.name, otherTribe: v.tribe, win: false, note: '對方的部落已經不在了，隊伍折返。' });
        m.phase = 'back'; m.departAt = now; m.arriveAt = now + (m.travel || 0);
      }
      return true;
    });
    for (var nk in this.nodes) if (this.nodes[nk].g && this.nodes[nk].g.v === id) { this.nodes[nk].g = null; this.nodesV++; }
    this.market = this.market.filter(function (o) { return o.from !== id; });
    for (var tk in this.tokens) if (this.tokens[tk] === id) delete this.tokens[tk];
    for (var oid in this.villages) if (this.villages[oid].cool) delete this.villages[oid].cool[id];
    delete this.villages[id];
    this.popBonus();
    this.adminNote('移除部落「' + v.name + '」（' + (Tribes.get(v.tribe) || {}).zh + '，主人 ' + v.owner + (v.bot ? '，示範部落' : '') + '）', now);
    return { ok: true, msg: '已移除「' + v.name + '」' };
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
      units: { w: 0, a: 0, u: 0 }, heroLv: 1, away: { w: 0, a: 0, u: 0 }, hurt: { w: 0, a: 0, u: 0 }, tech: dict(), research: null, train: [], quest: 0, stat: { trade: 0, point: 0 }, blessUntil: 0, blessNext: 0, heroRest: 0, glory: 0, wins: 0, losses: 0, gifts: 0,
      shieldUntil: 0, newbieUntil: o.bot ? 0 : now + this.newbieMs * TUNE.pace * TUNE.guardTime, ally: null, reports: [], cool: dict(),
      lastSay: 0, lastGift: 0, online: !!o.bot, idle: { focus: 'even', upgrade: false, train: false }, offAt: 0, boosts: BOOST_START, qs: 0
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
    var per = perWorker(v, 'food', this.speed), extra = uniq(v) === 'pond' ? TUNE.pondFood / 60 * this.speed * TUNE.prod / TUNE.pace : 0;
    var need = per > 0 ? Math.ceil(Math.max(0, eatRate(v, this.speed) * 1.1 - extra) / per - 1e-9) : 0;   // 先排夠養活大家的人去種田（多一成）
    if (need > 0) { j.food = Math.min(left, s.food, need); left -= j.food; }
    var f = v.idle && v.idle.focus;   // 採集重點：先把重點項目的位置排滿，剩下的人再平均分
    if (f && f !== 'even' && s[f] > 0) { var add = Math.min(left, s[f] - j[f]); j[f] += add; left -= add; }
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
    if (v.idle && v.idle.train && armyTotal(v) < armyCap(v)) {
      var u = v.units.a < v.units.w && bl(v, 'archery') ? 'a' : 'w';
      if (v.res.food >= UNIT[u].cost.food + 60 && v.res.mat >= UNIT[u].cost.mat) ACTIONS.train.call(this, v, { u: u }, t);
    }
    if (!v.idle || !v.idle.upgrade || v.queue.length >= builders(v)) return;
    var C = centerLevel(v), best = null;
    for (var i = 0; i < TILE_N; i++) {
      var b = v.tiles[i];
      if (!b || b.busy || b.level >= MAX_LEVEL) continue;
      var c = cost(b.type, b.level + 1);
      if (!can(v, c)) continue;
      if (b.type === 'center') { var need = centerUp(b.level + 1); if (reqLeft(v, b.level + 1).length || (FOREIGN_SP ? need.kinds > 0 : (v.sp[v.tribe] || 0) < need.each * need.kinds)) continue; }
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
      if (q.type === 'wall') { v.wall = q.to; addPts(v, q.to); }
      else if (q.type === 'clear') { v.land[q.tile] = 1; v.res.mat += q.gain; addPts(v, 3); }
      else if (v.tiles[q.tile]) { v.tiles[q.tile].level = q.to; delete v.tiles[q.tile].busy; addPts(v, q.to); }   // 季分：升到幾級就加幾分
      self.dailyAdd(v, 'build', 1, now);
      return false;
    });
    v.train = v.train.filter(function (q) { if (q.doneAt > now) return true; v.units[q.u]++; addPts(v, 1); self.dailyAdd(v, 'train', 1, now); return false; });
    if (v.heroUp && v.heroUp.doneAt <= now) { v.heroLv = v.heroUp.to; v.heroUp = null; addPts(v, 20 * v.heroLv); }   // 英雄升級完成
    if (v.research && v.research.doneAt <= now) { v.tech = v.tech || dict(); v.tech[v.research.id] = v.research.to; addPts(v, 10 * v.research.to); v.research = null; this.dailyAdd(v, 'tech', 1, now); }   // 技藝學會了
    if (v.hurt && all3(v.hurt) > 0) {   // 療養屋：負傷的人休養好就回到隊伍（名額滿了先等著）
      v.healAcc = Math.min(1, (v.healAcc || 0) + dt * healRate(v) * self.speed) ;
      while (v.healAcc >= 1 && all3(v.hurt) > 0 && armyTotal(v) < armyCap(v)) {
        var hk = v.hurt.w ? 'w' : v.hurt.a ? 'a' : 'u'; v.hurt[hk]--; v.units[hk]++; v.healAcc -= 1;
      }
    } else v.healAcc = 0;
    var pc = popCap(v);
    if (v.pop < pc && !v.hungry) {
      v.popAcc += dt * self.speed / TUNE.pace / 10 * (1 + 0.04 * bl(v, 'plaza')) * (uniq(v) === 'spring' ? 1 + TUNE.springPop / 100 : 1);   // 聚會廣場、山泉取水處：族人增加得快一點
      while (v.popAcc >= 1 && v.pop < pc) { v.pop++; v.popAcc -= 1; }
    } else v.popAcc = 0;
    if (v.auto) this.autoJobs(v);
    else {   // 手動分工：人數不能超過族人總數
      var sum = v.jobs.food + v.jobs.mat + v.jobs.special;
      ['special', 'mat', 'food'].forEach(function (k) { while (sum > v.pop && v.jobs[k] > 0) { v.jobs[k]--; sum--; } });
    }
    v.blessed = now < (v.blessUntil || 0);
    var rt = rates(v, this.speed), c = caps(v), eat = eatRate(v, this.speed) * dt;
    if (v.res.mat < c.res) v.res.mat = Math.min(c.res, v.res.mat + rt.mat * dt);
    // 糧食：收成減掉族人和戰士吃掉的。吃光了就是「吃不飽」：不會餓死，只是不長人、其他工作變慢、不能訓練
    var have = v.res.food + rt.food * dt, ate = Math.min(eat, Math.max(0, have));
    v.ate = (v.ate || 0) + ate;
    v.res.food = Math.max(0, Math.min(Math.max(c.res, v.res.food), have - eat));
    v.hungry = have - eat <= 0 && eat > 0;
    var own = v.sp[v.tribe] || 0;
    if (rt.special > 0 && own < c.sp) v.sp[v.tribe] = Math.min(c.sp, own + rt.special * dt);
    this.refreshChores(v, now);
    this.rollDaily(v, now);
  };
  /* 有聚會廣場的部落：時間到了就換一批定時任務（正在做的不受影響） */
  World.prototype.refreshChores = function (v, now) {
    if (!bl(v, 'plaza') || v.bot) return;
    var c = v.chores = v.chores || { list: [], cur: [], at: 0, n: 0 };
    if (now < c.at && c.list.length) return;
    c.list = []; c.at = now + this.ms(CHORE_EVERY * 3000);
    var pool = CHORES.map(function (x, i) { return i; });   // 同一批不重複
    for (var i = 0, n = Math.min(choreOffers(v), pool.length); i < n; i++) {
      var r = this.rng(), star = r < 0.5 ? 1 : r < 0.85 ? 2 : 3, k = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
      c.list.push({ id: this.id('c'), k: k, star: star, rw: choreReward(v, star) });
    }
  };

  World.prototype.dayLen = function () { return this.ms(864e5 / 20); };
  World.prototype.dayOf = function (now) { return Math.floor((now - DAILY_OFF) / this.dayLen()); };
  /* 換一天了：重新出今天的 4 件小目標（沒領的獎勵就沒了，不另外懲罰） */
  World.prototype.rollDaily = function (v, now) {
    if (v.bot) return;
    var day = this.dayOf(now);
    if (v.daily && v.daily.day === day) return;
    var self = this, rnd = hashRng(v.id + ':' + day);
    var army = bl(v, 'barracks') > 0 || armyTotal(v) > 0;   // 做不到的題目不出：還沒有訓練場也沒有戰士，就不出訓練、採集、野地事件
    var can = { train: bl(v, 'barracks') > 0, gather: army, chore: bl(v, 'plaza') > 0, help: !!(v.ally && this.alliances[v.ally]), tech: bl(v, 'craft') > 0,
      wild: army && Object.keys(this.nodes).some(function (k) { var nd = self.nodes[k]; return NODE[nd.k] && !!NODE[nd.k].ev; }) };
    var pick = function (pool, n) { var out = []; pool = pool.slice(); while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]); return out; };
    var ok = function (k) { return can[k] !== false; };
    var first = pick(DAILY_BASE.filter(ok), 2), rest = Object.keys(DAILY).filter(function (k) { return DAILY_BASE.indexOf(k) < 0 && ok(k); });
    v.daily = { day: day, next: (day + 1) * this.dayLen() + DAILY_OFF, bonus: false,   // 剛開始的部落能做的事比較少，可能只有 3 件
      list: first.concat(pick(rest, DAILY_N - first.length)).map(function (k) { return { k: k, n: DAILY[k].n, cur: 0, got: false }; }) };
  };
  /* 做了某件事：今天的小目標裡有這一項的話，進度加上去（只在事情做完的那一刻變動） */
  World.prototype.dailyAdd = function (v, k, n, now) {
    if (!v || v.bot) return;
    this.rollDaily(v, now);
    v.daily.list.forEach(function (x) { if (x.k === k && x.cur < x.n) x.cur = Math.min(x.n, x.cur + (n || 1)); });
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
  function nextDev(v) {
    var i = v.dev || 0;
    if (i < DEV_START.length) return DEV_START[i];
    var C = centerLevel(v); if (C >= MAX_LEVEL) return null;
    var miss = reqLeft(v, C + 1)[0];
    return miss ? { k: 'level', type: miss.type, n: miss.level } : { k: 'level', type: 'center', n: C + 1 };
  }
  /* 賽季：一季（節奏 20 時 7 天）裡做的事累積季分。季分到了各個目標可以領獎勵；季末照季分排名，前三名送加速道具 */
  var SEASON_GOAL = [100, 250, 500, 800, 1200], SEASON_BOOST = [1, 1, 2, 2, 3], SEASON_TOP = [5, 3, 2];
  function seasonReward(v, i) { var f = r5(60 * eq(centerLevel(v)) * (i + 1) * TUNE.cost); return { food: f, mat: f, boost: SEASON_BOOST[i] }; }
  function addPts(v, n) { if (v && n > 0) v.spts = (v.spts || 0) + Math.round(n); }
  /* 聯盟共同目標：每一季每個聯盟三個目標，全聯盟一起累積；達成後，達成前就已經是成員的每個部落各領一份獎勵。目標的量跟著人數長 */
  var ALLY_GOAL = [
    { k: 'gather', per: 1500, zh: '一起採集：從野地帶回的資源', unit: '份' },
    { k: 'wild', per: 3, zh: '一起照顧野地：趕走山豬群、修好搶修點', unit: '次' },
    { k: 'help', per: 8, zh: '互相幫忙：幫盟友縮短工程', unit: '次' }
  ];
  function allyGoalN(al, i) { return ALLY_GOAL[i].per * Math.max(2, al.members.length); }
  function allyReward(v, i) { var f = r5(50 * eq(centerLevel(v)) * TUNE.cost); return { food: f, mat: f, boost: i === 2 ? 2 : 1 }; }
  /* 今天的小目標（每日任務）：每天換一批 4 件（前兩件從蓋建築、訓練、採集挑，後兩件從其他的挑），做完各領一份，4 件都做完再加碼。
   * 正式節奏時臺灣時間每天早上 5 點換；節奏 1 時大約 72 分鐘換一次。題目都是一個人做得到的事，不要求去打別的玩家；沒有連續登入的獎勵 */
  var DAILY = {
    build: { zh: '蓋好或升級建築', n: 1, unit: '次' }, train: { zh: '訓練好戰士', n: 5, unit: '名' }, gather: { zh: '派隊伍到野地採集，帶回物資', n: 1, unit: '次' },
    chore: { zh: '完成聚會廣場的工作', n: 1, unit: '件' }, trade: { zh: '到市集或中立聚落交易', n: 1, unit: '次' }, gift: { zh: '送禮給別的部落', n: 1, unit: '次' },
    help: { zh: '幫盟友加速', n: 2, unit: '次' }, tech: { zh: '學完一項技藝', n: 1, unit: '項' }, wild: { zh: '處理野地事件（趕山豬或搶修）', n: 1, unit: '次' }
  }, DAILY_BASE = ['build', 'train', 'gather'], DAILY_N = 4, DAILY_OFF = 21 * 3600e3, DAILY_BONUS = { boost: 1, sp: 10, pts: 20 };   // DAILY_OFF：臺灣時間早上 5 點是 UTC 21 點
  function dailyReward(v) { var f = r5(20 * eq(centerLevel(v)) * TUNE.cost); return { food: f, mat: f }; }
  function hashRng(str) {   // 用部落代號和日期決定題目：每個人每天的組合固定，也不會動到世界的亂數
    var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  /* 族人的請託（支線任務）：每族 3 件（shared/tribes.js 的 side），部落中心到 3、6、9 級各出現一件，一次做一件。
   * 目標有四種：交出物資（give）、存到多少物資（have）、某種建築升到幾級（level）、派隊伍到某種資源點採集一趟（trip） */
  var SIDE_AT = [3, 6, 9], SIDE_LV = [3, 5, 8], SIDE_PTS = 30;
  function sideNeed(i, g) { return g.k === 'level' ? SIDE_LV[i] : g.k === 'trip' ? 1 : g.r === 'sp' ? 10 + 10 * SIDE_AT[i] : r5(80 * eq(SIDE_AT[i]) * TUNE.cost); }
  function sideReward(i) { var f = r5(60 * eq(SIDE_AT[i]) * TUNE.cost); return { food: f, mat: f, boost: 1 }; }
  function sideOf(v) {   // 目前這件請託的進度：{ i, need, have, can }；還沒出現、或三件都做完了回傳 null
    var t = Tribes.get(v.tribe), i = v.side ? v.side.i || 0 : 0, s = t && t.side && t.side[i];
    if (!s || centerLevel(v) < SIDE_AT[i]) return null;
    var g = s.goal, need = sideNeed(i, g);
    var have = g.k === 'level' ? bl(v, g.b) : g.k === 'trip' ? (v.side && v.side.trip ? 1 : 0) : Math.floor(g.r === 'sp' ? v.sp[v.tribe] || 0 : v.res[g.r] || 0);
    return { i: i, need: need, have: Math.min(need, have), can: have >= need };
  }
  var BOOST_START = 3, BOOST_DEV = 1, BOOST_QUEST = 2;   // 加速道具：新部落送 3 個；部落發展每一步送 1 個、神話主線每一章送 2 個（不賣）
  function devReward(d) {   // 獎勵：升級類的給那一級花費的三成，其他給固定的量
    if (d.k === 'units') return { food: 120, mat: 0 };
    var c = cost(d.type, d.k === 'build' ? 1 : d.n) || { food: 0, mat: 0 }, f = d.k === 'build' ? 1 : 0.3;
    return { food: r5(Math.max(d.type === 'wall' ? 0 : 40, c.food * f)), mat: r5(Math.max(40, c.mat * f)) };
  }
  /* 目前的部落發展任務與進度（任務存在部落裡，完成、領完獎勵才換下一個） */
  World.prototype.devProgress = function (v) {
    if (v.devCur === undefined) v.devCur = nextDev(v);
    var d = v.devCur; if (!d) return null;
    var cur = d.k === 'build' ? levelsOf(v, d.type).length : d.k === 'units' ? all3(v.units) + all3(v.away) : maxLevelOf(v, d.type);
    return { i: v.dev || 0, k: d.k, type: d.type || null, n: d.n, cur: Math.min(cur, d.n), done: cur >= d.n, reward: devReward(d) };
  };
  World.prototype.questProgress = function (v) {
    var q = stageOf(v); if (!q) return null;
    var s = v.qs || 0, key = v.quest * 3 + s, t = Tribes.get(v.tribe), out = { i: v.quest, s: s, type: q.type, n: q.n, text: q.text };
    var cur = q.type === 'land' ? v.land.filter(Boolean).length : q.type === 'have' ? Math.floor(v.res.food) : q.type === 'mat' ? Math.floor(v.res.mat) : q.type === 'trade' ? v.stat.trade :
      q.type === 'units' ? all3(v.units) + all3(v.away) : q.type === 'build' ? maxLevelOf(v, q.b) : q.type === 'journey' ? (v.qj === key ? 1 : 0) : v.stat.point;
    if (q.type === 'build') { var bz = (t && t.b[q.b] && t.b[q.b].zh) || q.b; out.text = q.n <= 1 ? '蓋好' + bz : '把' + bz + '升到 ' + q.n + ' 級'; out.b = q.b; }
    if (q.type === 'journey') {   // 出一趟遠門：派至少幾人走到遠方的地點再回來
      out.text = '派 ' + q.n + ' 人以上出一趟遠門，走到地圖上標出的地點再回來'; out.people = q.n; out.n = 1;
      var dh = this.journeyHex(v, q.d); out.dest = dh ? { hex: dh.id, x: dh.x, y: dh.y } : null;
      out.going = this.marches.some(function (m) { return m.from === v.id && m.kind === 'journey'; });
    }
    out.cur = Math.min(cur, out.n); out.done = cur >= out.n;
    if (s < 2) out.reward = stageReward(v);
    return out;
  };
  /* 出遠門的目的地：離部落 d 格左右、往東邊（照固定的規則挑，每次都一樣） */
  World.prototype.journeyHex = function (v, d) {
    var from = this.map.byId[v.hex], best = null, bs = -1e9;
    if (!from) return null;
    this.map.hexes.forEach(function (h) {
      if (h.settlement || h.islet || h.id === from.id) return;
      var dd = Geo.hexDist(from, h), sc = -Math.abs(dd - d) * 100 + (h.x - from.x);
      if (sc > bs) { bs = sc; best = h; }
    });
    return best;
  };

  // ---------- 上線、離線與離線報告 ----------
  function snap(v) { return { food: v.res.food, mat: v.res.mat, sp: v.sp[v.tribe] || 0, pop: v.pop, land: v.land.filter(Boolean).length, ate: v.ate || 0 }; }
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
        sp: Math.floor(a.sp - before.sp), pop: a.pop - before.pop, land: a.land - before.land, ups: v.offLog || [], ate: Math.floor(a.ate - (before.ate || 0)), hungry: !!v.hungry };
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
      if (v.queue.length >= builders(v)) return { ok: false, msg: '同時只能進行 ' + builders(v) + ' 項工程' };
      var c = cost(type, 1);
      if (!can(v, c)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, c);
      v.tiles[tile] = { type: type, level: 0, busy: true };
      v.queue.push({ id: this.id('q'), tile: tile, type: type, to: 1, doneAt: now + buildTime(type, 1) * buildMul(v) * 1000 / this.speed });
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
      if (v.queue.length >= builders(v)) return { ok: false, msg: '同時只能進行 ' + builders(v) + ' 項工程' };
      var to = b.level + 1, c = cost(b.type, to), picked = [], ownSp = 0;
      if (b.type === 'center') {
        var miss = reqLeft(v, to)[0];
        if (miss) return { ok: false, msg: '要先把' + (miss.type === 'wall' ? '圍籬' : (Tribes.get(v.tribe).b[miss.type] || {}).zh || miss.type) + '升到等級 ' + miss.level };
        var need = centerUp(to);
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
      picked.forEach(function (k) { addRes(v, 'sp:' + k, -centerUp(to).each); });
      b.busy = true;
      v.queue.push({ id: this.id('q'), tile: tile, type: b.type, to: to, doneAt: now + buildTime(b.type, to) * buildMul(v) * 1000 / this.speed });
    },
    wall: function (v, a, now) {
      if (v.queue.some(function (q) { return q.type === 'wall'; })) return { ok: false, msg: '還在施工中' };
      var to = v.wall + 1;
      if (to > MAX_LEVEL) return { ok: false, msg: '已經是最高等級' };
      if (to > centerLevel(v)) return { ok: false, msg: '等級不能超過部落中心' };
      if (v.queue.length >= builders(v)) return { ok: false, msg: '同時只能進行 ' + builders(v) + ' 項工程' };
      var c = cost('wall', to);
      if (!can(v, c)) return { ok: false, msg: '建材不足' };
      pay(v, c);
      v.queue.push({ id: this.id('q'), tile: -1, type: 'wall', to: to, doneAt: now + buildTime('wall', to) * buildMul(v) * 1000 / this.speed });
    },
    train: function (v, a, now) {
      var isU = a.u === 'u', st = isU ? ustat(v.tribe) : null, u = isU ? (st && UNIT_U) : UNIT[a.u];
      if (!u) return { ok: false, msg: '沒有這種單位' };
      if (isU && v.quest < 4) return { ok: false, msg: '完成任務第四章才能訓練' + st.zh };
      if (a.u === 'a' && !bl(v, 'archery')) return { ok: false, msg: '要先蓋靶場才能訓練弓手' };
      if (armyCap(v) === 0) return { ok: false, msg: '要先蓋好訓練場' };
      if (v.hungry) return { ok: false, msg: '糧食吃光了，族人吃不飽，沒辦法訓練' };
      if (armyTotal(v) >= armyCap(v)) return { ok: false, msg: '人數已滿，升級訓練場可以增加名額' };
      if (!can(v, u.cost)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, u.cost);
      var start = v.train.length ? v.train[v.train.length - 1].doneAt : now;
      v.train.push({ u: a.u, doneAt: Math.max(start, now) + trainTime(a.u) * 1000 / this.speed });
    },
    research: function (v, a, now) {   // 在技藝屋學一項技藝
      var t = typeof a.id === 'string' ? TECH[a.id] : null;
      if (!t) return { ok: false, msg: '沒有這項技藝' };
      if (!bl(v, 'craft')) return { ok: false, msg: '要先蓋技藝屋' };
      if (v.research) return { ok: false, msg: '同時只能學一項技藝' };
      var to = tech(v, a.id) + 1;
      if (to > techMax(v)) return { ok: false, msg: to > TECH_MAX ? '已經學到最高級' : '技藝屋升級之後才能學更高級' };
      var c = techCost(a.id, to);
      if (!can(v, c)) return { ok: false, msg: '糧食或建材不足' };
      pay(v, c);
      v.research = { id: a.id, to: to, doneAt: now + techTime(v, to) * 1000 / this.speed };
      return { ok: true, msg: '開始學「' + t.zh + '」' };
    },
    dismiss: function (v, a) {   // 讓戰士回家：少吃一點糧食；家裡有空房的話變回族人
      var u = a.u, n = int(a.n);
      if (u !== 'w' && u !== 'a' && u !== 'u') return { ok: false, msg: '沒有這種戰士' };
      if (n < 1 || n > v.units[u]) return { ok: false, msg: '留在部落裡的人數不夠' };
      v.units[u] -= n;
      var back = Math.min(n, Math.max(0, popCap(v) - v.pop)); v.pop += back;
      return { ok: true, msg: n + ' 位戰士回家了' + (back ? '，其中 ' + back + ' 位成為族人' : '') };
    },
    dev: function (v) {   // 領取部落發展任務的獎勵，換下一個
      var p = this.devProgress(v);
      if (!p) return { ok: false, msg: '部落已經發展到頂了' };
      if (!p.done) return { ok: false, msg: '目標還沒達成' };
      v.res.food += p.reward.food; v.res.mat += p.reward.mat; v.boosts = (v.boosts || 0) + BOOST_DEV;
      v.dev = (v.dev || 0) + 1; v.devCur = nextDev(v);
      return { ok: true, msg: '領到獎勵了，另外得到 ' + BOOST_DEV + ' 個加速' };
    },
    quest: function (v, a, now) {   // 領取目前這一章的獎勵
      var p = this.questProgress(v);
      if (!p) return { ok: false, msg: '任務都完成了' };
      if (!p.done) return { ok: false, msg: '目標還沒達成' };
      addPts(v, 5);
      if ((v.qs || 0) < 2) { var rw = stageReward(v); v.res.food += rw.food; v.res.mat += rw.mat; v.qs = (v.qs || 0) + 1; return { ok: true, msg: '過了第 ' + (v.quest + 1) + ' 章第 ' + v.qs + ' 關' }; }
      v.qs = 0;
      var i = v.quest; v.quest++; v.boosts = (v.boosts || 0) + BOOST_QUEST;
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
      v.blessUntil = now + this.ms(BLESS.ms) * blessMul(v); v.blessNext = now + this.ms(BLESS.again); v.blessed = true;
      return { ok: true, msg: '大家聚在一起，同心協力' };
    },
    attack: function (v, a, now) {
      var t = this.villages[a.to], w = int(a.w), ar = int(a.a), uu = int(a.u);
      if (!t || t.id === v.id) return { ok: false, msg: '找不到目標' };
      if (w < 0 || ar < 0 || uu < 0 || w + ar + uu < 1) return { ok: false, msg: '至少要派出一個人' };
      if (w > v.units.w || ar > v.units.a || uu > v.units.u) return { ok: false, msg: '留在部落的人數不夠' };
      if (v.ally && v.ally === t.ally) return { ok: false, msg: '不能出征同一個聯盟的部落' };
      if (now < t.shieldUntil || now < t.newbieUntil) return { ok: false, msg: '對方正受到保護' };
      if (!t.bot && centerLevel(v) - centerLevel(t) > 1) return { ok: false, msg: '對方規模比你小太多，不能出征' };
      if ((v.cool[t.id] || 0) > now) return { ok: false, msg: '才剛交手過，晚一點再來' };
      if (this.marchesOf(v.id).length >= marchMax(v)) return { ok: false, msg: '同時最多 ' + marchMax(v) + ' 支隊伍在外面' };
      v.units.w -= w; v.units.a -= ar; v.units.u -= uu; v.away.w += w; v.away.a += ar; v.away.u += uu;
      v.newbieUntil = 0; v.shieldUntil = 0;   // 主動出征就放棄保護
      var d = Geo.travel(this.map.byId[v.hex], this.map.byId[t.hex]);
      var travel = marchSecs(d, uniq(t) === 'watch') * marchMul(v) * swiftMul(v, uu) * 1000 / this.speed;   // 對方有望樓：更早被發現，路上多花一半時間
      this.marches.push({ id: this.id('m'), from: v.id, to: t.id, w: w, a: ar, u: uu,
        departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null });
      v.cool[t.id] = now + this.ms(120000);
      this.marches[this.marches.length - 1].hostile = this.relState(v.tribe, t.tribe) === 'hostile';
      this.relAdd(v.tribe, t.tribe, REL.attack);
      return { ok: true, msg: '隊伍出發了' };
    },
    gather: function (v, a, now) {   // 派隊伍去資源點：沒人在採就開始採；別人在採，就是去搶
      var nd = typeof a.node === 'string' ? this.nodes[a.node] : null, w = int(a.w), ar = int(a.a), uu = int(a.u);
      if (!nd) return { ok: false, msg: '這個資源點已經不在了' };
      if (w < 0 || ar < 0 || uu < 0 || w + ar + uu < 1) return { ok: false, msg: '至少要派出一個人' };
      if (w > v.units.w || ar > v.units.a || uu > v.units.u) return { ok: false, msg: '留在部落的人數不夠' };
      if (this.marchesOf(v.id).length >= marchMax(v)) return { ok: false, msg: '同時最多 ' + marchMax(v) + ' 支隊伍在外面' };
      if (this.marches.some(function (m) { return m.from === v.id && m.node === nd.id; })) return { ok: false, msg: '你已經有隊伍在這裡了' };
      var ev = NODE[nd.k].ev;
      if (ev === 'work' && nd.g && this.marches.some(function (m) { return m.id === nd.g.m; })) return { ok: false, msg: '已經有人在這裡搶修了' };
      var holder = !ev && nd.g && this.villages[nd.g.v];   // 野地事件不能搶
      if (holder && v.ally && v.ally === holder.ally) return { ok: false, msg: '盟友正在這裡採集' };
      v.units.w -= w; v.units.a -= ar; v.units.u -= uu; v.away.w += w; v.away.a += ar; v.away.u += uu;
      var travel = marchSecs(Geo.travel(this.map.byId[v.hex], this.map.byId[nd.hex])) * marchMul(v) * swiftMul(v, uu) * 1000 / this.speed;
      var m = { id: this.id('m'), kind: ev ? nd.k : 'gather', from: v.id, to: null, node: nd.id, w: w, a: ar, u: uu, carry: 0, departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null };
      this.marches.push(m);
      if (holder) {   // 去搶：馬上通知正在採集的那一方
        m.raid = holder.id;
        this.pushReport(holder, { t: now, role: 'def', point: NODE[nd.k].zh, other: v.name, otherTribe: v.tribe, alert: true, win: true,
          note: '「' + v.name + '」派了 ' + (w + ar + uu) + ' 人，要來搶你在' + NODE[nd.k].zh + '（' + nd.lv + ' 級）採集的隊伍，大約 ' + Math.max(1, Math.round(travel / 60000)) + ' 分鐘後抵達。可以先把人叫回來。' });
        this.relAdd(v.tribe, holder.tribe, REL.point);
      }
      return { ok: true, msg: ev === 'fight' ? '隊伍出發去趕山豬了' : ev === 'work' ? '隊伍出發去搶修了' : holder ? '隊伍出發去搶了' : '隊伍出發去採集了' };
    },
    journey: function (v, a, now) {   // 神話故事關卡：出一趟遠門
      var p = this.questProgress(v), w = int(a.w), ar = int(a.a), uu = int(a.u);
      if (!p || p.type !== 'journey') return { ok: false, msg: '現在這一關不用出遠門' };
      if (p.done) return { ok: false, msg: '這一趟已經走完了，去領獎勵吧' };
      if (p.going) return { ok: false, msg: '隊伍已經在路上了' };
      if (w < 0 || ar < 0 || uu < 0 || w + ar + uu < p.people) return { ok: false, msg: '至少要派 ' + p.people + ' 人' };
      if (w > v.units.w || ar > v.units.a || uu > v.units.u) return { ok: false, msg: '留在部落的人數不夠' };
      if (this.marchesOf(v.id).length >= marchMax(v)) return { ok: false, msg: '同時最多 ' + marchMax(v) + ' 支隊伍在外面' };
      var dh = p.dest && this.map.byId[p.dest.hex]; if (!dh) return { ok: false, msg: '找不到要去的地方' };
      v.units.w -= w; v.units.a -= ar; v.units.u -= uu; v.away.w += w; v.away.a += ar; v.away.u += uu;
      var travel = marchSecs(Geo.travel(this.map.byId[v.hex], dh)) * marchMul(v) * 1000 / this.speed;
      this.marches.push({ id: this.id('m'), kind: 'journey', from: v.id, to: null, node: null, dest: [dh.x, dh.y], qkey: v.quest * 3 + (v.qs || 0), w: w, a: ar, u: uu, departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null });
      return { ok: true, msg: '隊伍出發了' };
    },
    support: function (v, a, now) {   // 派勇士、弓手到盟友的部落幫忙守（獨特兵種不去）
      var t = this.villages[a.to], w = int(a.w), ar = int(a.a);
      if (!t || t.id === v.id) return { ok: false, msg: '找不到目標' };
      if (!v.ally || v.ally !== t.ally) return { ok: false, msg: '只能支援同一個聯盟的部落' };
      if (w < 0 || ar < 0 || w + ar < 1) return { ok: false, msg: '至少要派出一個人' };
      if (w > v.units.w || ar > v.units.a) return { ok: false, msg: '留在部落的人數不夠' };
      if (!supportCap(t)) return { ok: false, msg: '對方還沒有迎賓亭，沒辦法接待支援的人' };
      var room = supportCap(t) - this.guestsOf(t.id, true).reduce(function (n, m) { return n + all3(m); }, 0);
      if (w + ar > room) return { ok: false, msg: room > 0 ? '對方的迎賓亭只能再接待 ' + room + ' 人' : '對方的迎賓亭已經住滿了' };
      if (this.marchesOf(v.id).length >= marchMax(v)) return { ok: false, msg: '同時最多 ' + marchMax(v) + ' 支隊伍在外面' };
      v.units.w -= w; v.units.a -= ar; v.away.w += w; v.away.a += ar;
      var travel = marchSecs(Geo.travel(this.map.byId[v.hex], this.map.byId[t.hex]), false) * marchMul(v) * 1000 / this.speed;
      this.marches.push({ id: this.id('m'), from: v.id, to: t.id, w: w, a: ar, u: 0, kind: 'support', departAt: now, arriveAt: now + travel, travel: travel, phase: 'out', loot: null });
      return { ok: true, msg: '支援的隊伍出發了' };
    },
    sendHome: function (v, a, now) {   // 主人請來支援的盟友回去
      var m = this.marches.filter(function (x) { return x.id === a.id && x.to === v.id && x.kind === 'support' && x.phase !== 'back'; })[0];
      if (!m) return { ok: false, msg: '找不到這支支援的隊伍' };
      sendBack(m, now);
      return { ok: true, msg: '謝謝盟友，他們回去了' };
    },
    recall: function (v, a, now) {   // 把採集中的隊伍叫回來，帶著已經採到的；支援盟友的隊伍也可以叫回來
      var m = this.marches.filter(function (x) { return x.id === a.id && x.from === v.id; })[0];
      if (m && m.kind === 'support' && m.phase !== 'back') { sendBack(m, now); return { ok: true, msg: '支援的隊伍回來了' }; }
      if (m && m.kind === 'repair' && m.phase === 'gather') { this.stopRepair(m, now); return { ok: true, msg: '搶修到一半，隊伍先回來了（進度會留著）' }; }
      if (!m || m.kind !== 'gather' || m.phase !== 'gather') return { ok: false, msg: '這支隊伍不在採集' };
      this.finishGather(m, now, true);
      return { ok: true, msg: '隊伍帶著採到的東西回來了' };
    },
    barter: function (v, a, now) {   // 在中立聚落換別族的特產
      var st = this.map.settlements.filter(function (s) { return s.id === a.at; })[0], t = Tribes.get(a.want), pay = a.pay;
      if (!st) return { ok: false, msg: '找不到這個聚落' };
      if (!t || !t.playable || t.id === v.tribe) return { ok: false, msg: '請選一種別族的特產' };
      var stock = this.stockOf(st.id), bySp = pay === 'sp', cost = Math.max(1, Math.round((bySp ? SETTLE.give : SETTLE.resCost) * barterMul(v))), gain = bySp ? SETTLE.get : 1, key = bySp ? 'sp:' + v.tribe : pay;
      if (!bySp && pay !== 'food' && pay !== 'mat') return { ok: false, msg: '請選要拿什麼來換' };
      if (stock[t.id] < gain) return { ok: false, msg: '聚落裡的' + t.sp.zh + '換完了，過一陣子再來' };
      if (getRes(v, key) < cost) return { ok: false, msg: resName(key) + '不夠' };
      addRes(v, key, -cost); addRes(v, 'sp:' + t.id, gain); stock[t.id] -= gain; v.stat.trade++; this.dailyAdd(v, 'trade', 1, now);
      return { ok: true, msg: '換到 ' + gain + ' 份' + t.sp.zh };
    },
    seen: function (v, a) { v.reports.forEach(function (r) { if (!a.id || r.id === a.id) r.seen = true; }); },
    gift: function (v, a, now) {
      var t = this.villages[a.to], k = a.key, n = int(a.n);
      if (!t || t.id === v.id) return { ok: false, msg: '找不到對象' };
      if (!validKey(k) || n < 1 || n > giftMax(v)) return { ok: false, msg: '一次可以送 1 到 ' + giftMax(v) + ' 份' };
      if (now - v.lastGift < 5000) return { ok: false, msg: '稍等一下再送' };
      if (getRes(v, k) < n) return { ok: false, msg: '數量不夠' };
      this.tickVillage(t, now);
      addRes(v, k, -n); addRes(t, k, n); v.lastGift = now; v.gifts++; this.relAdd(v.tribe, t.tribe, REL.gift * relMul(v)); this.dailyAdd(v, 'gift', 1, now);
      this.log('「' + v.name + '」送給「' + t.name + '」' + n + ' 份' + resName(k) + '。', now, 'gift');
      return { ok: true, msg: '禮物送到了' };
    },
    offer: function (v, a, now) {
      var g = a.give, w = a.want, gn = int(a.giveN), wn = int(a.wantN);
      if (!validKey(g) || !validKey(w) || g === w) return { ok: false, msg: '請選兩種不同的物資' };
      if (gn < 1 || wn < 1 || gn > 500 || wn > 500) return { ok: false, msg: '數量要在 1 到 500 之間' };
      if (this.market.filter(function (o) { return o.from === v.id; }).length >= offerMax(v)) return { ok: false, msg: '最多同時掛 ' + offerMax(v) + ' 筆交易' };
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
      if (s) { this.tickVillage(s, now); addRes(s, o.want, Math.floor(o.wantN * bonus)); this.relAdd(v.tribe, s.tribe, REL.trade * relMul(v)); s.stat.trade++; this.dailyAdd(s, 'trade', 1, now); }
      v.stat.trade++; this.dailyAdd(v, 'trade', 1, now);
      this.log('「' + v.name + '」和「' + (s ? s.name : '遠方部落') + '」完成交易：' + o.giveN + ' ' + resName(o.give) + ' 換 ' + o.wantN + ' ' + resName(o.want) + '。', now, 'trade');
      return { ok: true, msg: '交易完成' };
    },
    speed: function (v, a, now) {   // 用加速道具：工程、技藝、訓練或定時任務。n 個一起用
      if (!(v.boosts > 0)) return { ok: false, msg: '沒有加速道具了' };
      var n = Math.max(1, Math.min(int(a.n) || 1, v.boosts, 99)), cut = n * this.ms(TUNE.boostMin * 3000);   // boostMin 是節奏 20 時的分鐘數
      if (a.what === 'build') {
        var q = findQ(v, a); if (!q) return { ok: false, msg: '這項工程已經完成了' };
        q.doneAt = Math.max(now, q.doneAt - cut);
      } else if (a.what === 'research') {
        if (!v.research) return { ok: false, msg: '目前沒有在學技藝' };
        v.research.doneAt = Math.max(now, v.research.doneAt - cut);
      } else if (a.what === 'train') {
        if (!v.train.length) return { ok: false, msg: '目前沒有在訓練' };
        v.train.forEach(function (t) { t.doneAt = Math.max(now, t.doneAt - cut); });
      } else if (a.what === 'hero') {
        if (!v.heroUp) return { ok: false, msg: '英雄沒有在升級' };
        v.heroUp.doneAt = Math.max(now, v.heroUp.doneAt - cut);
      } else if (a.what === 'chore') {
        var ch = v.chores && v.chores.cur.filter(function (x) { return x.id === String(a.id || '') && x.doneAt > now; })[0];
        if (!ch) return { ok: false, msg: '這件工作已經做完了' };
        ch.doneAt = Math.max(now, ch.doneAt - cut);
      } else return { ok: false, msg: '這個不能加速' };
      v.boosts -= n;
      return { ok: true, msg: '用了 ' + n + ' 個加速' };
    },
    chore: function (v, a, now) {   // 在聚會廣場選一件工作開始做
      var c = v.chores, id = String(a.id || '');
      if (!bl(v, 'plaza') || !c) return { ok: false, msg: '要先蓋聚會廣場' };
      var o = c.list.filter(function (x) { return x.id === id; })[0];
      if (!o) return { ok: false, msg: '這件工作已經換掉了' };
      if (c.cur.length >= choreSlots(v)) return { ok: false, msg: '同時只能做 ' + choreSlots(v) + ' 件，先做完手上的' };
      c.list = c.list.filter(function (x) { return x !== o; });
      c.cur.push({ id: o.id, k: o.k, star: o.star, rw: o.rw, doneAt: now + this.ms(CHORE_MIN[o.star] * 3000) });
      return { ok: true, msg: '族人開始「' + CHORES[o.k] + '」' };
    },
    choreDone: function (v, a, now) {   // 做完的工作：領獎勵
      var c = v.chores, id = String(a.id || ''), o = c && c.cur.filter(function (x) { return x.id === id; })[0];
      if (!o) return { ok: false, msg: '找不到這件工作' };
      if (o.doneAt > now) return { ok: false, msg: '還沒做完' };
      c.cur = c.cur.filter(function (x) { return x !== o; }); c.n = (c.n || 0) + 1; addPts(v, 5 * o.star); this.dailyAdd(v, 'chore', 1, now);
      v.res.food += o.rw.food; v.res.mat += o.rw.mat; if (o.rw.sp) addRes(v, 'sp:' + v.tribe, o.rw.sp); v.boosts = (v.boosts || 0) + (o.rw.boost || 0);
      return { ok: true, msg: '「' + CHORES[o.k] + '」做完了，領到獎勵' };
    },
    allyClaim: function (v, a) {   // 領聯盟共同目標的獎勵
      var al = v.ally && this.alliances[v.ally], i = int(a.i);
      if (!al) return { ok: false, msg: '你不在聯盟裡' };
      if (i < 0 || i >= ALLY_GOAL.length) return { ok: false, msg: '沒有這個目標' };
      this.allyState(al);
      if (!al.done[i]) return { ok: false, msg: '聯盟還沒完成這個目標' };
      if (al.got[i].indexOf(v.id) >= 0) return { ok: false, msg: '已經領過了' };
      if ((v.allyAt || 0) > al.done[i]) return { ok: false, msg: '目標達成之後才加入的，這一次不能領' };
      var rw = allyReward(v, i); v.res.food += rw.food; v.res.mat += rw.mat; v.boosts = (v.boosts || 0) + rw.boost; al.got[i].push(v.id);
      return { ok: true, msg: '領到聯盟目標的獎勵' };
    },
    seasonClaim: function (v, a) {   // 領這一季的目標獎勵
      var i = int(a.i);
      if (i < 0 || i >= SEASON_GOAL.length) return { ok: false, msg: '沒有這個目標' };
      v.sgot = v.sgot || [];
      if (v.sgot.indexOf(i) >= 0) return { ok: false, msg: '已經領過了' };
      if ((v.spts || 0) < SEASON_GOAL[i]) return { ok: false, msg: '季分還不夠' };
      var rw = seasonReward(v, i); v.res.food += rw.food; v.res.mat += rw.mat; v.boosts = (v.boosts || 0) + rw.boost; v.sgot.push(i);
      return { ok: true, msg: '領到本季第 ' + (i + 1) + ' 個目標的獎勵' };
    },
    heroUp: function (v, a, now) {   // 替傳說英雄升級：花物資和時間，能力變強、用過之後休息的時間變短
      var to = (v.heroLv || 1) + 1, c = heroCost(to);
      if (v.quest < QUESTS.length) return { ok: false, msg: '完成神話主線，才會有傳說英雄' };
      if (v.heroUp) return { ok: false, msg: '英雄正在升級' };
      if (to > HERO_MAX) return { ok: false, msg: '英雄已經是最高級了' };
      if (centerLevel(v) < HERO_REQ[to]) return { ok: false, msg: '部落中心要先升到 ' + HERO_REQ[to] + ' 級' };
      if (v.res.food < c.food || v.res.mat < c.mat || (v.sp[v.tribe] || 0) < c.sp) return { ok: false, msg: '物資不夠' };
      v.res.food -= c.food; v.res.mat -= c.mat; addRes(v, 'sp:' + v.tribe, -c.sp);
      v.heroUp = { to: to, doneAt: now + this.ms(heroTime(to) * 3000) };
      return { ok: true, msg: '英雄開始準備，升到 ' + to + ' 級' };
    },
    dailyClaim: function (v, a, now) {   // 領今天的小目標裡一件的獎勵
      this.rollDaily(v, now);
      var i = int(a.i), x = i >= 0 && v.daily.list[i];
      if (!x) return { ok: false, msg: '沒有這個目標' };
      if (x.got) return { ok: false, msg: '已經領過了' };
      if (x.cur < x.n) return { ok: false, msg: '還沒完成' };
      var rw = dailyReward(v); v.res.food += rw.food; v.res.mat += rw.mat; x.got = true;
      return { ok: true, msg: '領到「' + (DAILY[x.k] || { zh: '小目標' }).zh + '」的獎勵' };
    },
    dailyBonus: function (v, a, now) {   // 4 件都完成：領加碼（還沒領的那幾件一起領）
      this.rollDaily(v, now);
      var d = v.daily, self = this;
      if (d.bonus) return { ok: false, msg: '今天已經領過了' };
      if (!d.list.every(function (x) { return x.cur >= x.n; })) return { ok: false, msg: '全部完成才能領' };
      d.list.forEach(function (x, i) { if (!x.got) ACTIONS.dailyClaim.call(self, v, { i: i }, now); });
      d.bonus = true; v.boosts = (v.boosts || 0) + DAILY_BONUS.boost; addRes(v, 'sp:' + v.tribe, DAILY_BONUS.sp); addPts(v, DAILY_BONUS.pts);
      return { ok: true, msg: '今天的小目標全部完成！' };
    },
    side: function (v, a, now) {   // 完成族人的請託
      var t = Tribes.get(v.tribe), o = sideOf(v), s = o && t.side[o.i];
      if (!s) return { ok: false, msg: '現在沒有族人的請託' };
      if (!o.can) return { ok: false, msg: '還沒準備好' };
      if (s.goal.k === 'give') addRes(v, s.goal.r === 'sp' ? 'sp:' + v.tribe : s.goal.r, -o.need);
      var rw = sideReward(o.i); v.res.food += rw.food; v.res.mat += rw.mat; v.boosts = (v.boosts || 0) + rw.boost; addPts(v, SIDE_PTS);
      v.side = { i: o.i + 1, trip: 0 };
      return { ok: true, msg: '「' + s.t + '」完成了，族人謝謝你' };
    },
    askHelp: function (v, a) {   // 請盟友幫忙這項工程
      if (!v.ally || !this.alliances[v.ally]) return { ok: false, msg: '加入聯盟才能請盟友幫忙' };
      var q = findQ(v, a); if (!q) return { ok: false, msg: '這項工程已經完成了' };
      if (q.ask) return { ok: false, msg: '已經請盟友幫忙了' };
      q.ask = 1; q.hn = 0; q.hmax = helpMax(v); q.hby = [];
      return { ok: true, msg: '已經請盟友幫忙' };
    },
    help: function (v, a, now) {   // 幫盟友：一次把所有盟友請求幫忙的工程都按一下
      var al = v.ally && this.alliances[v.ally];
      if (!al) return { ok: false, msg: '你不在聯盟裡' };
      var n = this.helpAll(v, al, now);
      return n ? { ok: true, msg: '幫了盟友 ' + n + ' 次' } : { ok: false, msg: '目前沒有需要幫忙的工程' };
    },
    allyCreate: function (v, a, now) {
      if (v.ally) return { ok: false, msg: '你已經在聯盟裡了' };
      var name = clean(a.name, 8);
      if (name.length < 2) return { ok: false, msg: '聯盟名稱至少兩個字' };
      for (var k in this.alliances) if (this.alliances[k].name === name) return { ok: false, msg: '已經有同名的聯盟' };
      var al = { id: this.id('a'), name: name, leader: v.id, members: [v.id] };
      this.alliances[al.id] = al; v.ally = al.id; v.allyAt = now;
      this.log('「' + v.name + '」發起了聯盟「' + name + '」。', now, 'ally');
      return { ok: true, msg: '聯盟成立了' };
    },
    allyJoin: function (v, a, now) {
      var al = this.alliances[a.id];
      if (v.ally) return { ok: false, msg: '你已經在聯盟裡了' };
      if (!al) return { ok: false, msg: '找不到這個聯盟' };
      if (al.members.length >= 20) return { ok: false, msg: '這個聯盟滿了' };
      var self = this, seen = {};
      al.members.forEach(function (m) { var o = self.villages[m]; if (o && !seen[o.tribe]) { seen[o.tribe] = 1; self.relAdd(v.tribe, o.tribe, REL.ally * relMul(v)); } });   // 和不同族的部落結盟，兩族關係變好
      al.members.push(v.id); v.ally = al.id; v.allyAt = now;
      this.log('「' + v.name + '」加入了聯盟「' + al.name + '」。', now, 'ally');
      return { ok: true, msg: '加入了' + al.name };
    },
    allyLeave: function (v, a, now) {
      var al = this.alliances[v.ally];
      if (!al) { v.ally = null; return { ok: false, msg: '你不在聯盟裡' }; }
      al.members = al.members.filter(function (m) { return m !== v.id; }); v.ally = null;
      if (!al.members.length) delete this.alliances[al.id]; else if (al.leader === v.id) al.leader = al.members[0];
      this.marches.forEach(function (m) { if (m.kind === 'support' && m.phase !== 'back' && (m.from === v.id || m.to === v.id)) sendBack(m, now); });   // 不同盟了：支援的隊伍各自回家
      return { ok: true, msg: '已離開聯盟' };
    },
    say: function (v, a, now) {
      if (!PHRASES[a.phrase]) return { ok: false, msg: '沒有這句話' };
      if (now - v.lastSay < 4000) return { ok: false, msg: '說話慢一點' };
      v.lastSay = now;
      var t = Tribes.get(v.tribe), txt = {
        hello: t.hello ? t.hello + (/[?？!！]$/.test(t.hello) ? '' : '！') + '（' + t.lang + '的問候）' : '大家好！', thanks: t.thanks ? t.thanks + '！（' + t.lang + '的謝謝）' : '謝謝！',   // 還沒查到可靠族語的，用中文
        trade: '有人想交換特產嗎？', ally: '歡迎加入我們的聯盟！', cheer: '大家一起加油！', nice: '這場較量真精彩！'
      }[a.phrase];
      this.log('「' + v.name + '」：' + txt, now, 'say');
    }
  };
  ACTIONS = dict(ACTIONS);
  function findQ(v, a) { var id = String(a.id || ''); return v.queue.filter(function (q) { return q.type !== 'clear' && (id ? q.id === id : q.tile === int(a.tile)); })[0] || null; }
  /* 盟友 v 幫聯盟 al 裡其他人的工程：每項工程每個人只能幫一次，最多幫到對方迎賓亭的上限。回傳幫了幾次 */
  World.prototype.helpAll = function (v, al, now) {
    var self = this, n = 0;
    al.members.forEach(function (mid) {
      var o = self.villages[mid]; if (!o || o.id === v.id) return;
      o.queue.forEach(function (q) {
        if (!q.ask || q.hn >= q.hmax || q.doneAt <= now || (q.hby || []).indexOf(v.id) >= 0) return;
        var cut = Math.max(self.ms(TUNE.helpMin * 3000), (q.doneAt - now) * TUNE.helpPct / 100);
        q.doneAt = Math.max(now, q.doneAt - cut); q.hn++; (q.hby = q.hby || []).push(v.id); n++; addPts(v, 2); self.allyAdd(v, 'help', 1, now); self.dailyAdd(v, 'help', 1, now);
      });
    });
    return n;
  };
  /* 聯盟這一季的目標進度（換季了就重新開始） */
  World.prototype.allyState = function (al) {
    var n = this.season ? this.season.n : 1;
    if (al.sn !== n || !al.prog) { al.sn = n; al.prog = { gather: 0, wild: 0, help: 0 }; al.contrib = dict(); al.done = [0, 0, 0]; al.got = [[], [], []]; }
    return al;
  };
  World.prototype.allyAdd = function (v, k, n, now) {
    var al = v && v.ally && this.alliances[v.ally], self = this; if (!al || !(n > 0)) return;
    this.allyState(al);
    al.prog[k] = (al.prog[k] || 0) + n;
    var c = al.contrib[v.id] = al.contrib[v.id] || { gather: 0, wild: 0, help: 0 }; c[k] += n;
    ALLY_GOAL.forEach(function (g, i) {
      if (al.done[i] || al.prog[g.k] < allyGoalN(al, i)) return;
      al.done[i] = now;
      al.members.forEach(function (mid) { var o = self.villages[mid]; if (o) self.pushReport(o, { t: now, role: 'atk', point: '聯盟目標', other: '', otherTribe: o.tribe, win: true, note: '聯盟「' + al.name + '」一起完成了「' + g.zh.split('：')[0] + '」，到聯盟視窗領獎勵（換季前要領）。' }); });
    });
  };
  /* 給某個成員看的聯盟目標 */
  World.prototype.allyGoals = function (v) {
    var al = v.ally && this.alliances[v.ally], self = this; if (!al) return null;
    this.allyState(al);
    return { sn: al.sn, goals: ALLY_GOAL.map(function (g, i) {
      var n = allyGoalN(al, i), got = al.got[i].indexOf(v.id) >= 0, done = !!al.done[i];
      return { k: g.k, zh: g.zh, unit: g.unit, n: n, cur: Math.min(n, Math.floor(al.prog[g.k] || 0)), done: done, got: got, can: done && !got && (v.allyAt || 0) <= al.done[i], late: done && !got && (v.allyAt || 0) > al.done[i], reward: allyReward(v, i) };
    }), top: al.members.map(function (mid) { var o = self.villages[mid], c = al.contrib[mid] || { gather: 0, wild: 0, help: 0 }; return { name: o ? o.name : '', tribe: o ? o.tribe : '', gather: Math.floor(c.gather), wild: c.wild, help: c.help }; }) };
  };
  /* 盟友有哪些工程在等人幫忙（v 還沒幫過的） */
  World.prototype.helpsFor = function (v, now) {
    var al = v.ally && this.alliances[v.ally], self = this, out = [];
    if (!al) return out;
    al.members.forEach(function (mid) {
      var o = self.villages[mid]; if (!o || o.id === v.id) return;
      o.queue.forEach(function (q) { if (q.ask && q.hn < q.hmax && q.doneAt > now && (q.hby || []).indexOf(v.id) < 0) out.push({ vid: o.id, name: o.name, tribe: o.tribe, type: q.type, to: q.to, hn: q.hn, hmax: q.hmax }); });
    });
    return out;
  };

  // ---------- 出征隊伍與對戰 ----------
  /* 隊伍抵達：回到家就把人和物資放回去；到了別人的部落就當場自動打完，剩下的人帶著物資回程 */
  World.prototype.resolveMarch = function (m, now) {
    var v = this.villages[m.from], t = this.villages[m.to];
    if (!v) return false;
    if (m.phase === 'back') {
      ['w', 'a', 'u'].forEach(function (k) { var n = m[k] || 0; v.units[k] += n; v.away[k] = Math.max(0, v.away[k] - n); });
      if (m.kind === 'journey' && m.qkey === v.quest * 3 + (v.qs || 0)) v.qj = m.qkey;   // 出遠門回來了：這一關達成
      if (m.loot) for (var k in m.loot) addRes(v, k, m.loot[k]);
      return false;
    }
    if (m.kind === 'journey') { m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true; }   // 走到了，回家
    if (m.kind === 'gather') return this.resolveGather(m, v, now);
    if (m.kind === 'boar') return this.resolveBoar(m, v, now);
    if (m.kind === 'repair') return this.resolveRepair(m, v, now);
    if (m.kind === 'support') {   // 支援的隊伍到了：駐守在盟友的部落，直到被叫回或請回
      if (!t || !v.ally || v.ally !== t.ally) { sendBack(m, now); return true; }
      m.phase = 'stay'; m.departAt = now; m.arriveAt = now + STAY; return true;
    }
    if (m.kind === 'point') { m.phase = 'back'; m.departAt = now; m.arriveAt = now + (m.travel || 0); return true; }   // 改版前的佔領隊伍：直接回家
    var why = !t ? '找不到對方的部落' : now < t.shieldUntil ? '對方正受到保護' : (v.ally && v.ally === t.ally) ? '對方現在是同盟' : '';
    if (why) {
      this.pushReport(v, { t: now, role: 'atk', other: t ? t.name : '', otherTribe: t ? t.tribe : v.tribe, win: false, note: why + '，隊伍折返。' });
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    this.tickVillage(v, now); this.tickVillage(t, now);
    m.u = m.u || 0;
    var heroOk = function (x) { return x.quest >= QUESTS.length && now >= (x.heroRest || 0); };
    var guests = this.guestsOf(t.id), gw = 0, ga = 0;   // 駐守在這裡的盟友一起守（照主人部落的加成算）
    guests.forEach(function (g) { gw += g.w; ga += g.a; });
    var r = autoBattle({ tribe: v.tribe, w: m.w, a: m.a, u: m.u, hero: heroOk(v), heroLv: v.heroLv || 1, mod: battleMod(v, false) },
      { tribe: t.tribe, w: t.units.w + gw, a: t.units.a + ga, u: t.units.u, hero: heroOk(t), heroLv: t.heroLv || 1, wall: t.wall, towers: levelsOf(t, 'tower'), uniq: uniq(t), mod: battleMod(t, true) }, this.rng);
    var home = this.splitGuests(t, guests, r, now, v);   // 剩下的人照比例分回主人與各支援隊伍
    var careA = hospitalize(v, { w: m.w - r.left.w, a: m.a - r.left.a, u: m.u - r.left.u }), careD = hospitalize(t, { w: t.units.w - home.w, a: t.units.a - home.a, u: t.units.u - home.u });
    var win = r.win, left = r.left, loot = {}, txt = [];
    t.units.w = home.w; t.units.a = home.a; t.units.u = home.u;
    ['w', 'a', 'u'].forEach(function (k) { v.away[k] = Math.max(0, v.away[k] - (m[k] - left[k])); });
    if (r.used.a) v.heroRest = now + this.ms(heroRest(v));   // 英雄出過力之後要休息（等級越高休息越短）
    if (r.used.d) t.heroRest = now + this.ms(heroRest(t));
    if (win && all3(left) > 0) {   // 每位回程的人能背 30 份：先帶特產，剩下的空間分給糧食與建材
      var frac = Math.min(1, LOOT_FRAC[r.grade] * TUNE.loot), carry = 30 * all3(left), prot = caps(t).protect, want = {};
      var take = function (k, n) { n = Math.min(n, carry); if (n <= 0) return; carry -= n; loot[k] = n; addRes(t, k, -n); txt.push(n + ' ' + resName(k)); };
      for (var sk in t.sp) take('sp:' + sk, Math.floor(t.sp[sk] * frac));
      ['food', 'mat'].forEach(function (k) { want[k] = Math.floor(Math.max(0, t.res[k] - prot) * frac); });
      var total = want.food + want.mat, f = total > carry ? carry / total : 1;
      take('food', Math.floor(want.food * f)); take('mat', Math.floor(want.mat * f));
    }
    addPts(win ? v : t, win ? 10 + 5 * r.grade : 15);   // 季分：打贏的一方（進攻贏、或守住）
    if (win) {
      t.losses++; t.glory = Math.max(0, t.glory - 3); t.shieldUntil = now + shieldMs() / this.speed;
      v.wins++; v.glory += Math.round(((r.grade === 3 ? 15 : 10) + 2 * centerLevel(t)) * (m.hostile ? 1.5 : 1)); this.relAdd(v.tribe, t.tribe, REL.win);
    } else { t.wins++; t.glory += 5; v.losses++; v.glory = Math.max(0, v.glory - 2); }
    // 戰報：雙方各一份，裡面帶著每一回合的紀錄，畫面用它重播這一場
    var bid = this.id('b'), show = { aName: v.name, dName: t.name, aTribe: v.tribe, dTribe: t.tribe, wall: r.wall, towerN: r.towerN, start: r.start, aTier: tiers(v), dTier: tiers(t) };
    this.pushReport(t, { id: bid, t: now, role: 'def', other: v.name, otherTribe: v.tribe, win: !win, grade: r.grade, loot: loot, lost: r.lostD, hurt: r.lostA, care: careD, log: r.log, show: show, guests: gw + ga });
    this.pushReport(v, { id: bid, t: now, role: 'atk', other: t.name, otherTribe: t.tribe, win: win, grade: r.grade, loot: loot, lost: r.lostA, hurt: r.lostD, care: careA, log: r.log, show: show });
    var key = v.tribe + '>' + t.tribe, st = this.stats[key] = this.stats[key] || { n: 0, win: 0 };   // 後台用：各族對戰的場數與攻方勝場
    st.n++; if (win) st.win++;
    this.log(win ? '「' + v.name + '」出征「' + t.name + '」，' + GRADE[r.grade] + (txt.length ? '，帶回 ' + txt.join('、') : '') + '。'
      : '「' + t.name + '」守住了「' + v.name + '」的出征。', now, 'battle');
    if (all3(left) === 0) return false;
    m.w = left.w; m.a = left.a; m.u = left.u; m.loot = loot; m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel;
    return true;
  };
  World.prototype.nodeCount = function () { return Object.keys(this.nodes).length; };
  /* 對戰裡負傷撤退的人：療養屋有空位就進去休養（之後歸隊），沒有空位就離開隊伍。回傳進療養屋的人數 */
  function hospitalize(v, lost) {
    var room = Math.max(0, healCap(v) - (v.hurt ? all3(v.hurt) : 0)), n = 0;
    if (!room) return 0;
    v.hurt = v.hurt || { w: 0, a: 0, u: 0 };
    ['u', 'a', 'w'].forEach(function (k) { var x = Math.min(room - n, Math.max(0, lost[k] || 0)); v.hurt[k] += x; n += x; });
    return n;
  }
  World.prototype.marchesOf = function (id) { return this.marches.filter(function (m) { return m.from === id; }); };
  /* 駐守在某個部落的盟友隊伍（withOut：連路上還沒到的也算，用來算迎賓亭還剩幾個位置） */
  World.prototype.guestsOf = function (id, withOut) {
    return this.marches.filter(function (m) { return m.kind === 'support' && m.to === id && (m.phase === 'stay' || (withOut && m.phase === 'out')) && all3(m) > 0; });
  };
  /* 守方打完後剩下的人（r.home）照開打時的比例分回主人與各支援隊伍；支援的人負傷的話回自己部落的療養屋，並收到一份戰報。回傳主人留下的人數 */
  World.prototype.splitGuests = function (t, guests, r, now, atk) {
    var home = { w: r.home.w, a: r.home.a, u: r.home.u }, self = this;
    if (!guests.length) return home;
    var tot = { w: t.units.w, a: t.units.a }, keep = guests.map(function () { return { w: 0, a: 0 }; });
    guests.forEach(function (g) { tot.w += g.w; tot.a += g.a; });
    ['w', 'a'].forEach(function (k) {
      var left = r.home[k];
      guests.forEach(function (g, i) { keep[i][k] = tot[k] ? Math.min(g[k], Math.floor(g[k] * r.home[k] / tot[k])) : 0; left -= keep[i][k]; });
      var extra = left - t.units[k];   // 四捨五入多出來的人不能算到主人頭上：補回給支援的隊伍
      guests.forEach(function (g, i) { var x = Math.min(Math.max(0, extra), g[k] - keep[i][k]); keep[i][k] += x; extra -= x; left -= x; });
      home[k] = Math.max(0, Math.min(t.units[k], left));
    });
    guests.forEach(function (g, i) {
      var o = self.villages[g.from], lost = { w: g.w - keep[i].w, a: g.a - keep[i].a, u: 0 };
      g.w = keep[i].w; g.a = keep[i].a;
      if (!o) return;
      o.away.w = Math.max(0, o.away.w - lost.w); o.away.a = Math.max(0, o.away.a - lost.a);
      var care = hospitalize(o, lost), n = lost.w + lost.a;
      self.pushReport(o, { t: now, role: 'def', other: atk.name, otherTribe: atk.tribe, win: !r.win, note: '你派去支援「' + t.name + '」的隊伍一起守部落，' + (r.win ? '沒有守住' : '守住了') + '。' + (n ? n + ' 人負傷撤退' + (care ? '，其中 ' + care + ' 人回到療養屋休養' : '') + '。' : '沒有人負傷。') + (all3(g) ? '其他人繼續駐守。' : '') });
    });
    return home;
  };
  function n3(m) { return { w: m.w, a: m.a, u: m.u || 0 }; }
  /* 在資源點開始（或重新開始）採：算出速度、還背得下多少，排好採完的時間 */
  World.prototype.startGather = function (m, nd, v, now) {
    var room = Math.max(0, loadOf(m, v) - m.carry), rate = gatherRate(v, all3(m), nd.k) * this.speed;
    if (room <= 0 || nd.amt <= 0 || rate <= 0) return this.finishGather(m, now, false, nd);
    nd.g = { v: v.id, m: m.id, name: v.name, tribe: v.tribe, start: now, rate: rate, room: room, n: all3(m), pw: power({ tribe: v.tribe, w: m.w, a: m.a, u: m.u || 0, mod: battleMod(v, false) }) };
    m.phase = 'gather'; m.departAt = now; m.arriveAt = now + Math.min(nd.amt, room) / rate * 1000; this.nodesV++;
    return true;
  };
  function picked(nd, now) { var g = nd.g; return g ? Math.min(nd.amt, g.room, g.rate * Math.max(0, now - g.start) / 1000) : 0; }   // 這一段已經採到多少
  /* 採集結束（採滿、採完、被叫回來，或打完架之後）：把採到的放進隊伍，資源點扣掉，隊伍回家 */
  World.prototype.finishGather = function (m, now, early, nd) {
    var v = this.villages[m.from]; nd = nd || this.nodes[m.node];
    if (nd && nd.g && nd.g.m === m.id) { var got = Math.floor(picked(nd, now)); nd.amt -= got; m.carry += got; nd.g = null; this.nodesV++; }
    if (nd && nd.amt < 1) { delete this.nodes[nd.id]; this.nodesV++; }
    var k = nd ? NODE[nd.k].res : (m.res || 'food'); m.res = k;
    if (m.carry > 0) { m.loot = {}; m.loot[k] = m.carry; }
    if (v && m.carry > 0) {
      addPts(v, 5); this.allyAdd(v, 'gather', m.carry, now); this.dailyAdd(v, 'gather', 1, now);
      var so = sideOf(v), sg = so && Tribes.get(v.tribe).side[so.i].goal;   // 族人的請託：派隊伍到某種資源點採集一趟
      if (sg && sg.k === 'trip' && nd && nd.k === sg.node) { v.side = v.side || { i: so.i, trip: 0 }; v.side.trip = 1; }
    }
    if (v && m.carry > 0 && !early) {
      v.stat.point++;
      this.pushReport(v, { t: now, role: 'atk', point: nd ? NODE[nd.k].zh : '資源點', other: '', otherTribe: v.tribe, win: true, note: '採集完成，帶著 ' + m.carry + ' ' + resName(k) + '回部落。' });
    } else if (v && m.carry > 0) v.stat.point++;
    m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel;
    return true;
  };
  /* 採集隊伍抵達資源點 */
  World.prototype.resolveGather = function (m, v, now) {
    if (m.phase === 'gather') return this.finishGather(m, now, false);   // 採滿或採完了
    var nd = this.nodes[m.node], self = this;
    function home(text) {
      self.pushReport(v, { t: now, role: 'atk', point: nd ? NODE[nd.k].zh : '資源點', other: '', otherTribe: v.tribe, win: false, note: text });
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    if (!nd) return home('資源點已經被採完了，隊伍折返。');
    var G = nd.g && this.villages[nd.g.v], gm = nd.g && this.marches.filter(function (x) { return x.id === nd.g.m; })[0];
    if (!nd.g || !G || !gm) { nd.g = null; return this.startGather(m, nd, v, now); }   // 沒人在採：開始採
    if (G.id === v.id) return home('你已經有隊伍在這裡採集，這支隊伍折返。');
    if (v.ally && v.ally === G.ally) return home('盟友正在這裡採集，隊伍折返。');
    // 有人在採：先算好對方已經採到的，再打一場（沒有圍籬，雙方都不是守自己的部落）
    var got = Math.floor(picked(nd, now)); nd.amt -= got; gm.carry += got; nd.g = null; this.nodesV++;
    var r = autoBattle({ tribe: v.tribe, w: m.w, a: m.a, u: m.u || 0, mod: battleMod(v, false) }, { tribe: G.tribe, w: gm.w, a: gm.a, u: gm.u || 0, home: false, mod: battleMod(G, false) }, this.rng);
    var careA = hospitalize(v, { w: m.w - r.left.w, a: m.a - r.left.a, u: (m.u || 0) - r.left.u }), careD = hospitalize(G, { w: gm.w - r.home.w, a: gm.a - r.home.a, u: (gm.u || 0) - r.home.u });
    ['w', 'a', 'u'].forEach(function (k) {
      v.away[k] = Math.max(0, v.away[k] - ((m[k] || 0) - r.left[k])); m[k] = r.left[k];
      G.away[k] = Math.max(0, G.away[k] - ((gm[k] || 0) - r.home[k])); gm[k] = r.home[k];
    });
    var name = NODE[nd.k].zh, res = NODE[nd.k].res, took = 0;
    if (r.win) { took = Math.min(gm.carry, loadOf(m, v)); m.carry += took; gm.carry = 0; }
    var show = { aName: v.name, dName: G.name, aTribe: v.tribe, dTribe: G.tribe, wall: 0, towerN: 0, start: r.start, point: name, aTier: tiers(v), dTier: tiers(G) }, bid = this.id('b');
    this.pushReport(G, { id: bid, t: now, role: 'def', point: name, other: v.name, otherTribe: v.tribe, win: !r.win, grade: r.grade, lost: r.lostD, hurt: r.lostA, care: careD, log: r.log, show: show,
      note: r.win ? '「' + v.name + '」搶走了你在' + name + '採到的 ' + took + ' ' + resName(res) + '，採集的隊伍撤退回家。' : '擋下了「' + v.name + '」，繼續採集。' });
    this.pushReport(v, { id: bid, t: now, role: 'atk', point: name, other: G.name, otherTribe: G.tribe, win: r.win, grade: r.grade, lost: r.lostA, hurt: r.lostD, care: careA, log: r.log, show: show,
      note: r.win ? '搶贏了，拿到 ' + took + ' ' + resName(res) + '，接著在這裡採。' : '沒有搶下來，隊伍撤退回家。' });
    this.relAdd(v.tribe, G.tribe, REL.point);
    if (r.win) this.log('「' + v.name + '」在' + name + '搶了「' + G.name + '」採集的隊伍。', now, 'battle');
    // 輸的一方帶著剩下的人回家；贏的一方（進攻）接著採，守住的一方繼續採
    var loser = r.win ? gm : m, winner = r.win ? m : gm, wv = r.win ? v : G;
    loser.loot = loser.carry > 0 ? (function () { var o = {}; o[res] = loser.carry; return o; })() : null; loser.phase = 'back'; loser.departAt = now; loser.arriveAt = now + loser.travel;
    if (all3(loser) === 0) this.marches = this.marches.filter(function (x) { return x !== loser; });   // 全部負傷撤退：隊伍解散
    if (all3(winner) === 0) { this.marches = this.marches.filter(function (x) { return x !== winner; }); return winner !== m; }
    if (winner !== m) { this.startGather(winner, nd, wv, now); return all3(m) > 0; }
    this.startGather(m, nd, v, now);
    return true;
  };
  /* 趕山豬：到了就自動打完。趕走了山豬群就消失，帶著附近部落送的謝禮回家；沒趕走的話山豬少了幾隻，還在原地 */
  World.prototype.resolveBoar = function (m, v, now) {
    var nd = this.nodes[m.node], name = nd ? '山豬群（' + nd.lv + ' 級）' : '山豬群';
    if (!nd) { this.pushReport(v, { t: now, role: 'atk', point: name, ev: 'boar', other: '', otherTribe: v.tribe, win: false, note: '山豬群已經被別人趕走了，隊伍折返。' }); m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true; }
    var B = boarSide(nd.lv, nd.bn);
    var r = autoBattle({ tribe: v.tribe, w: m.w, a: m.a, u: m.u || 0, mod: battleMod(v, false) }, { tribe: v.tribe, w: B.n, a: 0, u: 0, home: false, mod: B.mod }, this.rng);
    var care = hospitalize(v, { w: m.w - r.left.w, a: m.a - r.left.a, u: (m.u || 0) - r.left.u });
    ['w', 'a', 'u'].forEach(function (k) { v.away[k] = Math.max(0, v.away[k] - ((m[k] || 0) - r.left[k])); m[k] = r.left[k]; });
    var rw = null;
    addPts(v, r.win ? 8 * nd.lv : 2); if (r.win) { this.allyAdd(v, 'wild', 1, now); this.dailyAdd(v, 'wild', 1, now); }
    if (r.win) { rw = wildReward('boar', nd.lv); delete this.nodes[nd.id]; v.stat.point++; v.boosts = (v.boosts || 0) + rw.boost; m.loot = { food: rw.food, mat: rw.mat }; }
    else nd.bn = Math.max(1, r.home.w);
    this.nodesV++;
    this.pushReport(v, { t: now, role: 'atk', point: name, ev: 'boar', other: '', otherTribe: v.tribe, win: r.win, grade: r.grade, lost: r.lostA, hurt: r.lostD, care: care, log: r.log,
      note: r.win ? '把山豬群趕回山裡了，附近的田保住了。帶回謝禮：' + rw.food + ' ' + resName('food') + '、' + rw.mat + ' ' + resName('mat') + (rw.boost ? '，另外得到 ' + rw.boost + ' 個加速' : '') + '。'
        : '山豬群太多了，隊伍先撤回。牠們少了 ' + r.lostD + ' 隻，還有 ' + nd.bn + ' 隻在原地。' });
    if (all3(m) === 0) return false;
    m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
  };
  /* 搶修：到了就開始修，修好了（或叫回來）就回家。進度存在資源點上（amt 是還要多少工） */
  function repairRate(n) { return n * TUNE.repairRate / 60 / TUNE.pace; }   // n 個人每秒的進度
  World.prototype.resolveRepair = function (m, v, now) {
    var nd = this.nodes[m.node];
    if (m.phase === 'gather') {   // 修好了
      var lv = nd ? nd.lv : 1, rw = wildReward('repair', lv), hx = nd && this.map.byId[nd.hex], ht = hx && hx.tribe;
      if (nd) { delete this.nodes[nd.id]; this.nodesV++; }
      v.stat.point++; v.boosts = (v.boosts || 0) + rw.boost; m.loot = { food: rw.food, mat: rw.mat }; addPts(v, 8 * lv); this.allyAdd(v, 'wild', 1, now); this.dailyAdd(v, 'wild', 1, now);
      if (ht && ht !== v.tribe && Tribes.get(ht) && Tribes.get(ht).playable) this.relAdd(v.tribe, ht, REL.gift);   // 幫別族的區域搶修：兩族的關係變好
      this.pushReport(v, { t: now, role: 'atk', point: '颱風後搶修', ev: 'repair', other: '', otherTribe: v.tribe, win: true,
        note: '修好了' + (nd ? REPAIR_WHAT[nd.what || 0] : '') + '，帶回謝禮：' + rw.food + ' ' + resName('food') + '、' + rw.mat + ' ' + resName('mat') + (rw.boost ? '，另外得到 ' + rw.boost + ' 個加速' : '') + '。' + (ht && ht !== v.tribe ? '這裡是' + Tribes.get(ht).zh + '的區域，兩族的關係變好了。' : '') });
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    var self = this;
    if (!nd || (nd.g && nd.g.m !== m.id && this.marches.some(function (x) { return x.id === nd.g.m; }))) {
      this.pushReport(v, { t: now, role: 'atk', point: '颱風後搶修', ev: 'repair', other: '', otherTribe: v.tribe, win: false, note: nd ? '已經有人在這裡搶修了，隊伍折返。' : '這裡已經修好了，隊伍折返。' });
      m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel; return true;
    }
    var rate = repairRate(all3(m)) * this.speed;
    nd.g = { v: v.id, m: m.id, name: v.name, tribe: v.tribe, start: now, rate: rate, room: 1e12, n: all3(m), pw: 0 };
    m.phase = 'gather'; m.departAt = now; m.arriveAt = now + nd.amt / rate * 1000; this.nodesV++;
    return true;
  };
  World.prototype.stopRepair = function (m, now) {   // 修到一半叫回來：進度留在那裡，別人（或自己）可以接著修
    var nd = this.nodes[m.node];
    if (nd && nd.g && nd.g.m === m.id) { nd.amt = Math.max(1, nd.amt - Math.floor(nd.g.rate * (now - nd.g.start) / 1000)); nd.g = null; this.nodesV++; }
    m.phase = 'back'; m.departAt = now; m.arriveAt = now + m.travel;
  };
  /* 資源點不夠就長出新的：隨機挑一格，種類照那裡的地形，避開部落和別的資源點 */
  World.prototype.spawnNodes = function (now, max) {
    var rng = this.rng, hexes = this.map.hexes, n = 0, list = [], pos = [];
    for (var id in this.villages) pos.push(this.villages[id].pos);
    for (var nk in this.nodes) list.push(this.nodes[nk]);
    var have = list.filter(function (o) { return !NODE[o.k].ev; }).length;   // 野地事件另外算
    while (have < TUNE.nodeCount && n < max) {
      var h = hexes[Math.floor(rng() * hexes.length)];
      if (h.settlement || h.islet) continue;
      var x = h.x + (rng() - 0.5) * Geo.HEX_SIZE, y = h.y + (rng() - 0.5) * Geo.HEX_SIZE;
      if (pos.some(function (p) { return Math.hypot(p[0] - x, p[1] - y) < 2.2; }) || list.some(function (o) { return Math.hypot(o.x - x, o.y - y) < 3.2; })) continue;
      var r = rng(), k;
      if (h.coast && r < 0.7) k = 'fish';
      else if (h.alt === 'mt') k = SLATE[h.tribe] && r < 0.35 ? 'stone' : r < 0.6 ? 'wood' : 'hunt';
      else if (h.alt === 'hill') k = r < 0.4 ? 'bamboo' : r < 0.7 ? 'hunt' : 'wood';
      else k = r < 0.6 ? 'forage' : 'bamboo';
      var lr = rng() * 100, lv = 1; while (lv < 5 && lr > NODE_LV_W[lv]) { lr -= NODE_LV_W[lv]; lv++; }
      var nd = { id: this.id('n'), k: k, lv: lv, hex: h.id, x: +x.toFixed(2), y: +y.toFixed(2), amt: NODE_AMT[lv], max: NODE_AMT[lv], g: null };
      this.nodes[nd.id] = nd; list.push(nd); n++; have++;
    }
    if (n) this.nodesV++;
    return n;
  };
  /* 野地事件：山豬群在山區、丘陵出沒（不夠就補）；每隔一段時間來一次颱風，某一帶出現幾處要搶修的地方 */
  World.prototype.spawnWild = function (now) {
    var rng = this.rng, hexes = this.map.hexes, self = this, list = [], pos = [], n = 0;
    for (var id in this.villages) pos.push(this.villages[id].pos);
    for (var nk in this.nodes) list.push(this.nodes[nk]);
    var free = function (x, y) { return !pos.some(function (p) { return Math.hypot(p[0] - x, p[1] - y) < 2.2; }) && !list.some(function (o) { return Math.hypot(o.x - x, o.y - y) < 3.2; }); };
    var add = function (h, k, lv, extra) {
      for (var tries = 0; tries < 6; tries++) {
        var x = h.x + (rng() - 0.5) * Geo.HEX_SIZE, y = h.y + (rng() - 0.5) * Geo.HEX_SIZE;
        if (!free(x, y)) continue;
        var nd = { id: self.id('n'), k: k, lv: lv, hex: h.id, x: +x.toFixed(2), y: +y.toFixed(2), amt: NODE_AMT[lv], max: NODE_AMT[lv], g: null };
        for (var ek in extra) nd[ek] = extra[ek];
        self.nodes[nd.id] = nd; list.push(nd); n++; return nd;
      }
      return null;
    };
    var boars = list.filter(function (o) { return o.k === 'boar'; }).length;
    for (var tries = 0; boars < TUNE.boarCount && tries < 40; tries++) {
      var h = hexes[Math.floor(rng() * hexes.length)];
      if (h.settlement || h.islet || h.alt === 'low') continue;
      var lr = rng() * 100, lv = 1; while (lv < 5 && lr > NODE_LV_W[lv]) { lr -= NODE_LV_W[lv]; lv++; }
      if (add(h, 'boar', lv, { bn: BOAR_N[lv] })) boars++;
    }
    var every = this.ms(TUNE.typhoonHours * 3600 * 1000 / 20);
    if (!this.lastTyphoon) this.lastTyphoon = now - every;   // 新的世界（或改版前的存檔）：馬上來第一次
    if (now - this.lastTyphoon >= every) {
      this.lastTyphoon = now;
      var c = hexes[Math.floor(rng() * hexes.length)], near = hexes.filter(function (h) { return !h.settlement && !h.islet && Math.hypot(h.x - c.x, h.y - c.y) < Geo.HEX_SIZE * 4; }), made = 0;
      for (var i = 0; i < 12 && made < 5 && near.length; i++) {
        var hh = near[Math.floor(rng() * near.length)], rl = rng(), lv2 = rl < 0.5 ? 1 : rl < 0.85 ? 2 : 3;
        if (add(hh, 'repair', lv2, { what: Math.floor(rng() * REPAIR_WHAT.length), until: now + this.ms(12 * 3600 * 1000 / 20), amt: NODE_AMT[lv2] / 2, max: NODE_AMT[lv2] / 2 })) made++;   // 要修的工是同等級資源點存量的一半
      }
      var tt = c.tribe && Tribes.get(c.tribe);
      if (made) this.log('颱風過後，' + (tt ? tt.zh + '的區域' : '野地') + '一帶有 ' + made + ' 處要搶修，有空的部落可以去幫忙。', now, 'wild');
    }
    for (var k2 in this.nodes) { var o = this.nodes[k2]; if (o.k === 'repair' && o.until < now && !o.g) { delete this.nodes[k2]; n++; } }   // 放太久沒人修：當地人自己修好了
    if (n) this.nodesV++;
  };
  World.prototype.pushReport = function (v, rep) {
    rep.id = rep.id || this.id('r'); rep.seen = false;
    v.reports.unshift(rep); if (v.reports.length > 6) v.reports.length = 6;
  };

  // ---------- 示範部落（電腦） ----------
  World.prototype.botStep = function (v, now) {
    var self = this, rng = this.rng, C = centerLevel(v);
    this.tickVillage(v, now);
    if (v.queue.length < builders(v) && rng() < 0.7) {
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
      var miss = reqLeft(v, C + 1)[0];   // 中心升下一級缺的條件：優先補上
      if (miss && miss.type === 'wall') { if (v.wall < C && can(v, cost('wall', v.wall + 1))) opts.push({ type: 'wall' }, { type: 'wall' }); }
      else if (miss) for (var mi = 0; mi < TILE_N; mi++) { var mb = v.tiles[mi]; if (mb && mb.type === miss.type && !mb.busy && mb.level < C && can(v, cost(mb.type, mb.level + 1))) { opts.push({ type: 'upgrade', tile: mi }, { type: 'upgrade', tile: mi }, { type: 'upgrade', tile: mi }); break; } }
      if (opts.length) this.act(v.id, opts[Math.floor(rng() * opts.length)], now);
    }
    var qp = this.questProgress(v); if (qp && qp.type === 'journey' && !qp.done) { v.qj = v.quest * 3 + (v.qs || 0); qp.done = true; }   // 示範部落不用真的出遠門
    if (qp && qp.done) this.act(v.id, { type: 'quest' }, now);
    if (armyCap(v) > armyTotal(v) && rng() < 0.5) this.act(v.id, { type: 'train', u: v.quest >= 4 && rng() < 0.3 ? 'u' : rng() < 0.6 || !bl(v, 'archery') ? 'w' : 'a' }, now);
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
  World.prototype.seasonLen = function () { return this.ms(TUNE.seasonDays * 864e5 / 20); };
  /* 季末：照季分排名（示範部落不算），前三名送加速道具並記在消息裡；所有部落的季分歸零，開始下一季 */
  World.prototype.endSeason = function (now) {
    var S = this.season, self = this, list = Object.keys(this.villages).map(function (k) { return self.villages[k]; })
      .filter(function (v) { return !v.bot && (v.spts || 0) > 0; }).sort(function (a, b) { return b.spts - a.spts; });
    var top = list.slice(0, SEASON_TOP.length).map(function (v) { return { v: v, pts: v.spts }; });
    top.forEach(function (x, i) {
      x.v.boosts = (x.v.boosts || 0) + SEASON_TOP[i];
      self.pushReport(x.v, { t: now, role: 'atk', point: '第 ' + S.n + ' 季', other: '', otherTribe: x.v.tribe, win: true, note: '第 ' + S.n + ' 季結束，你的部落季分第 ' + (i + 1) + ' 名（' + x.pts + ' 分），得到 ' + SEASON_TOP[i] + ' 個加速道具。' });
    });
    if (top.length) this.log('第 ' + S.n + ' 季結束：' + top.map(function (x, i) { return '第 ' + (i + 1) + ' 名「' + x.v.name + '」'; }).join('、') + '。新的一季開始了。', now, 'season');
    for (var k in this.villages) { this.villages[k].spts = 0; this.villages[k].sgot = []; }
    this.season = { n: S.n + 1, start: now, end: now + this.seasonLen(), last: top.map(function (x) { return { id: x.v.id, name: x.v.name, tribe: x.v.tribe, pts: x.pts }; }) };
  };
  World.prototype.tick = function (now) {
    var self = this, id;
    TUNE = this.tune;
    if (!this.season) this.season = { n: 1, start: now, end: now + this.seasonLen(), last: [] };
    else if (now >= this.season.end) this.endSeason(now);
    for (id in this.villages) { var v = this.villages[id]; if (v.online || v.bot) this.tickVillage(v, now); }
    this.marches = this.marches.filter(function (m) { return m.arriveAt > now ? true : self.resolveMarch(m, now); });
    this.marches = this.marches.filter(function (m) { return m.kind !== 'support' || all3(m) > 0; });   // 支援的人都負傷撤退了：隊伍解散
    if (now - this.lastRel >= this.ms(REL.decayMs)) {   // 族群關係慢慢回到中立
      this.lastRel = now;
      for (var rk in this.rel) { this.rel[rk] -= Math.sign(this.rel[rk]); if (!this.rel[rk]) delete this.rel[rk]; }
    }
    if (now - this.lastStock >= this.ms(SETTLE.refillMs)) {   // 中立聚落補貨
      this.lastStock = now;
      for (var sk in this.stock) for (var tk in this.stock[sk]) if (this.stock[sk][tk] < SETTLE.stock) this.stock[sk][tk]++;
    }
    if (now - this.lastPop >= 60000) { this.lastPop = now; this.popBonus(); }
    if (now - this.lastNode >= this.ms(30000)) { this.lastNode = now; this.spawnNodes(now, this.nodeCount() === 0 ? 1000 : 4); this.spawnWild(now); }
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
      pros: prosperity(v), glory: v.glory, ally: v.ally, safe: Math.max(v.shieldUntil, v.newbieUntil), uq: uniq(v), vp: villagePower(v), ss: v.spts || 0,   // vp：部落的戰力、ss：這一季的季分（排行榜）
      pw: (function (g) { return power({ tribe: v.tribe, w: v.units.w + g.w, a: v.units.a + g.a, u: v.units.u, def: true, wall: v.wall, towers: levelsOf(v, 'tower'), uniq: uniq(v), mod: battleMod(v, true) }); })(this.guestSum(v.id)) };   // pw：守在部落裡的戰力（含駐守的盟友），別人用它估勝算
  };
  World.prototype.guestSum = function (id) { var o = { w: 0, a: 0 }; this.guestsOf(id).forEach(function (g) { o.w += g.w; o.a += g.a; }); return o; };
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
  /* 給某個玩家的完整狀態。opt.noPubs：不帶全島的部落清單（伺服器另外用差異的方式傳，才不會每秒重傳一大包） */
  World.prototype.snapshot = function (id, now, opt) {
    TUNE = this.tune;
    var v = this.villages[id], self = this;
    if (!v) return null;
    this.rollDaily(v, now);   // 換天了就先出今天的小目標
    var me = JSON.parse(JSON.stringify(v));
    delete me.offSnap; delete me.offLog; delete me.cool; delete me.last; delete me.popAcc; delete me.ate; delete me.healAcc;   // 玩家用不到的欄位不傳
    me.d = derived(v, this.speed);
    me.qp = this.questProgress(v);
    me.dq = this.devProgress(v); delete me.devCur;
    me.queue.forEach(function (q) { delete q.hby; });   // 誰幫過忙不用傳
    me.helps = this.helpsFor(v, now);
    me.ag = this.allyGoals(v);   // 聯盟這一季的共同目標
    var al = {};
    for (var k in this.alliances) al[k] = { id: k, name: this.alliances[k].name, leader: this.alliances[k].leader, n: this.alliances[k].members.length };
    return {
      now: now, speed: this.speed, me: me,
      villages: opt && opt.noPubs ? undefined : Object.keys(this.villages).map(function (k) { return self.pub(self.villages[k], now); }),
      marches: this.marches.map(function (m) { return { id: m.id, from: m.from, to: m.to, node: m.node || null, dest: m.dest || null, kind: m.kind || null, departAt: m.departAt, arriveAt: m.arriveAt, phase: m.phase, n: all3(m), carry: m.from === id ? m.carry || 0 : undefined }; }),
      nodes: this.nodesList(), nv: this.nodesV,
      shieldMs: shieldMs() / this.speed, tune: this.tune, tv: this.tuneV,
      rel: Tribes.playable().filter(function (t) { return t.id !== v.tribe; }).map(function (t) { return { tribe: t.id, value: self.relOf(v.tribe, t.id), state: self.relState(v.tribe, t.id) }; }),
      stock: (function () { var o = {}; self.map.settlements.forEach(function (s) { o[s.id] = self.stockOf(s.id); }); return o; })(),
      market: this.market.map(function (o) { return { id: o.id, from: o.from, fromName: (self.villages[o.from] || {}).name || '', give: o.give, giveN: o.giveN, want: o.want, wantN: o.wantN }; }),
      feed: this.feed.slice(-30), alliances: al, season: this.season ? { n: this.season.n, end: this.season.end, last: this.season.last } : null
    };
  };
  /* 全部的資源點（所有玩家看到的都一樣，只有變動時才重算） */
  World.prototype.nodesList = function () {
    if (this._nl && this._nlV === this.nodesV) return this._nl;
    var self = this;
    this._nl = Object.keys(this.nodes).map(function (k) { var n = self.nodes[k], g = n.g;
      return { id: n.id, k: n.k, lv: n.lv, x: n.x, y: n.y, hex: n.hex, amt: n.amt, max: n.max, bn: n.bn, what: n.what, until: n.until, g: g ? { v: g.v, name: g.name, tribe: g.tribe, start: g.start, rate: g.rate, room: g.room, n: g.n, pw: g.pw } : null }; });
    this._nlV = this.nodesV;
    return this._nl;
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
      stats: this.stats,
      rel: this.rel, nodes: this.nodeCount(), gathering: this.marches.filter(function (m) { return m.phase === 'gather'; }).length, alliances: Object.keys(this.alliances).map(function (k) { return { name: self.alliances[k].name, n: self.alliances[k].members.length }; }) };
  };
  World.prototype.toJSON = function () {
    return { villages: this.villages, tokens: this.tokens, marches: this.marches, market: this.market, feed: this.feed, alliances: this.alliances,
      stats: this.stats, rel: this.rel, nodes: this.nodes, stock: this.stock, seq: this.seq, tune: this.tune, tuneRev: TUNE_REV, mapRev: MAP_REV, adminLog: this.adminLog, lastTyphoon: this.lastTyphoon || 0, season: this.season || null };
  };
  World.prototype.load = function (d) {
    if (!d || !d.villages) return this;
    TUNE = this.tune;
    if (d.tune) {   // 存檔裡有後台調過的數值就沿用；沒有就用啟動時的預設
      var saved = d.tune, stale = (d.tuneRev || 1) < TUNE_REV;
      if (stale) {   // 對戰規則改版過：對戰相關的數值是照舊規則調的，改用新的預設，其他的照舊
        saved = {};
        for (var tk0 in d.tune) { var td0 = TUNE_BY[tk0]; if (td0 && td0.g !== '對戰' && td0.g !== '獨特兵種與英雄' && !/^u(Atk|Hp)_/.test(tk0)) saved[tk0] = d.tune[tk0]; }
      }
      setTune(saved, this.tune); this.tuneV++;
    }
    this.adminLog = d.adminLog || [];
    this.villages = dict(d.villages); this.tokens = dict(d.tokens); this.marches = d.marches || []; this.market = d.market || [];
    this.feed = d.feed || []; this.alliances = dict(d.alliances); for (var ak in this.alliances) if (this.alliances[ak].contrib) this.alliances[ak].contrib = dict(this.alliances[ak].contrib); this.seq = d.seq || 1; this.lastTyphoon = d.lastTyphoon || 0; this.season = d.season || null;   // 改版前的存檔沒有賽季：下一次推進時開始第 1 季
    this.stats = dict(d.stats); this.rel = dict(d.rel); this.nodes = (d.mapRev || 1) < MAP_REV ? dict() : dict(d.nodes); this.nodesV++; this.stock = dict(d.stock);
    for (var sk0 in this.stock) this.stock[sk0] = dict(this.stock[sk0]);
    for (var id in this.villages) {
      var v = this.villages[id]; v.online = !!v.bot;
      v.sp = dict(v.sp); v.cool = dict(v.cool);
      if (!v.land || v.tiles.length !== TILE_N) { delete this.villages[id]; continue; }   // 舊版的方格部落無法沿用
      if (!v.idle) v.idle = { focus: 'even', upgrade: false };
      if (v.units.u == null) { v.units.u = 0; v.away.u = 0; }
      if (v.quest == null) { v.quest = 0; v.stat = { trade: 0, point: 0 }; v.blessUntil = 0; v.blessNext = 0; v.heroRest = 0; }
      delete v.battle; delete v.def;   // 舊版的對戰狀態與佈防設定，現在用不到了
      v.tech = dict(v.tech); if (!v.hurt) v.hurt = { w: 0, a: 0, u: 0 }; if (v.research === undefined) v.research = null;   // 第二批：技藝、療養
      if (v.boosts == null) v.boosts = BOOST_START;
      if (v.heroLv == null) v.heroLv = 1;   // 英雄等級：舊部落從 1 級開始   // 第三批：加速道具（舊部落也送 3 個）
      if (v.qs == null) v.qs = 2;   // 神話故事關卡之前的部落：直接接在這一章的最後一關（原本的目標），不用重做前兩關
    }
    /* 改版前「佔領之後一直有收穫」的資源點：駐守的人送回部落 */
    for (var hk in d.points || {}) {
      var pt = d.points[hk], ow = this.villages[pt.owner];
      if (ow) ['w', 'a', 'u'].forEach(function (k) { var n = pt[k] || 0; ow.units[k] += n; ow.away[k] = Math.max(0, ow.away[k] - n); });
    }
    /* 地圖變細了（格子大小 6 → 3）：每個部落搬到原本位置附近、同一族區域裡的新格子，坐標也跟著換 */
    if ((d.mapRev || 1) < MAP_REV) {
      var used = {}, hexes = this.map.hexes;
      Object.keys(this.villages).forEach(function (vid) {
        var v = this.villages[vid], best = null, bd = 1e9;
        hexes.forEach(function (h) { if (h.tribe !== v.tribe) return; var dd = Math.hypot(h.x - v.pos[0], h.y - v.pos[1]) + (used[h.id] || 0) * 2; if (dd < bd) { bd = dd; best = h; } });
        if (!best) return;
        var slot = 0; while (used[best.id + ':' + slot]) slot++;
        used[best.id + ':' + slot] = 1; used[best.id] = (used[best.id] || 0) + 1;
        v.hex = best.id; v.slot = slot; v.pos = Geo.slotPos(best, slot);
      }, this);
    }
    /* 舊版的對戰要當場下指令，存檔裡可能有打到一半的對戰：把場上還剩的人各自送回去（守軍回部落，進攻的隊伍折返） */
    var self = this, old = d.battles || {};
    Object.keys(old).forEach(function (bk) {
      var ob = old[bk]; if (!ob || ob.state === 'done' || !Array.isArray(ob.lanes)) return;
      var A = self.villages[ob.a], D = self.villages[ob.d], mm = self.marches.filter(function (x) { return x.id === ob.march; })[0], left = { w: 0, a: 0, u: 0 }, home = { w: 0, a: 0, u: 0 };
      ob.lanes.forEach(function (l) { ['w', 'a', 'u'].forEach(function (k) { left[k] += (l.a && l.a[k]) || 0; home[k] += (l.d && l.d[k]) || 0; }); });
      if (D) ['w', 'a', 'u'].forEach(function (k) { D.units[k] = (D.units[k] || 0) + home[k]; });
      if (mm) ['w', 'a', 'u'].forEach(function (k) { if (A) A.away[k] = Math.max(0, (A.away[k] || 0) - ((mm[k] || 0) - left[k])); mm[k] = left[k]; });
    });
    this.marches = this.marches.filter(function (m) {
      if (m.phase !== 'fight') return true;
      if (all3(m) === 0) return false;
      m.phase = 'back'; m.departAt = m.arriveAt || 0; m.arriveAt = (m.arriveAt || 0) + (m.travel || 0); return true;
    });
    // 改版前去佔領資源點的隊伍：還在路上的折返
    this.marches.forEach(function (m) { if (m.kind === 'point' && m.phase !== 'back') { m.phase = 'back'; m.departAt = m.arriveAt || 0; m.arriveAt = (m.arriveAt || 0) + (m.travel || 0); } });
    for (var tk in this.tokens) if (!this.villages[this.tokens[tk]]) delete this.tokens[tk];
    return this;
  };

  World.rules = {
    SITES: SITES, CLEAR: CLEAR, clearInfo: clearInfo, TILE_N: TILE_N, CENTER_TILE: CENTER_TILE, TYPES: TYPES, MAX_LEVEL: MAX_LEVEL, UNIT: UNIT,
    CENTER_UP: CENTER_UP, BUILDERS: BUILDERS, FOREIGN_SP: FOREIGN_SP, cost: cost, buildTime: buildTime, limit: limit, count: count,
    resName: resName, derived: derived, eatRate: eatRate, perWorker: perWorker, TECH: TECH, TECH_MAX: TECH_MAX, UNLOCK: UNLOCK, techCost: techCost, techTime: techTime, techMax: techMax, battleMod: battleMod, buildMul: buildMul, marchMul: marchMul, healCap: healCap, bl: bl, eq: eq, centerUp: centerUp, centerReq: centerReq, reqLeft: reqLeft, maxLevelOf: maxLevelOf, wallMul: wallMul, villagePower: villagePower, DEV_START: DEV_START, popCap: popCap, LOOT_FRAC: LOOT_FRAC, GRADE: GRADE, FIGHT: FIGHT,
    armyCap: armyCap, mkSide: mkSide, supportCap: supportCap, ALLY_GOAL: ALLY_GOAL, allyReward: allyReward, QSTAGE: QSTAGE, storySegs: storySegs, stageReward: stageReward, SEASON_GOAL: SEASON_GOAL, SEASON_TOP: SEASON_TOP, seasonReward: seasonReward, CHORES: CHORES, CHORE_MIN: CHORE_MIN, CHORE_EVERY: CHORE_EVERY, choreSlots: choreSlots, choreOffers: choreOffers, choreReward: choreReward, TIER: TIER, tiers: tiers, tierMul: tierMul, helpMax: helpMax, BOOST_START: BOOST_START, BOOST_DEV: BOOST_DEV, BOOST_QUEST: BOOST_QUEST, QUESTS: QUESTS, UNIT_U: UNIT_U, BLESS: BLESS, HERO_REST: HERO_REST, marchMax: marchMax, gatherRate: gatherRate, REL: REL, NODE: NODE, NODE_AMT: NODE_AMT, BOAR_N: BOAR_N, boarSide: boarSide, boarPower: boarPower, wildReward: wildReward, REPAIR_WHAT: REPAIR_WHAT, repairRate: repairRate, SETTLE: SETTLE,
    autoBattle: autoBattle, power: power, odds: odds, ODDS: ODDS, simBattle: simBattle, simMatrix: simMatrix,
    HERO_MAX: HERO_MAX, HERO_REQ: HERO_REQ, heroBoost: heroBoost, heroCost: heroCost, heroTime: heroTime, heroAb: heroAb, heroRest: heroRest,
    DAILY: DAILY, DAILY_N: DAILY_N, DAILY_BONUS: DAILY_BONUS, dailyReward: dailyReward, SIDE_AT: SIDE_AT, SIDE_LV: SIDE_LV, sideNeed: sideNeed, sideReward: sideReward, sideOf: sideOf,
    swiftMul: swiftMul, defWall: defWall, loadPer: loadPer, TUNE_DEF: TUNE_DEF, tuneDefaults: tuneDefaults, setTune: setTune, paced: paced, trainTime: trainTime, marchSecs: marchSecs, shieldMs: shieldMs, OFFER_MS: OFFER_MS
  };
  Object.defineProperty(World.rules, 'TUNE', { get: function () { return TUNE; } });   // 目前生效的可調數值
  return World;
});
