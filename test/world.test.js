const test = require('node:test');
const assert = require('node:assert');
const World = require('../shared/world.js');

function seeded(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function check(w) {
  for (const id in w.villages) {
    const v = w.villages[id];
    for (const k of ['food', 'mat']) assert.ok(v.res[k] >= 0 && Number.isFinite(v.res[k]), `${v.name} ${k}=${v.res[k]}`);
    for (const k in v.sp) assert.ok(v.sp[k] >= 0 && Number.isFinite(v.sp[k]));
    assert.ok(v.units.w >= 0 && v.units.a >= 0 && v.away.w >= 0 && v.away.a >= 0, 'units >= 0');
    assert.ok(v.pop <= World.rules.popCap(v), 'pop within cap');
    assert.ok(v.jobs.food + v.jobs.mat + v.jobs.special <= v.pop, 'jobs within pop');
  }
}

test('新部落能加入、生產並蓋建築', () => {
  const w = new World({ speed: 1, rng: seeded(1) });
  let now = 1e6;
  const r = w.join('tok1', { owner: '阿明', name: '測試部落', tribe: 'bunun' }, now);
  assert.ok(r.ok);
  const v = w.villages[r.id]; v.online = true;
  assert.equal(w.map.byId[v.hex].tribe, 'bunun');
  assert.equal(w.join('tok1', {}, now).id, r.id, '同一識別碼會回到同一個部落');
  assert.equal(w.join('tok2', { tribe: 'tao' }, now).ok, false, '未開放的族群不能選');
  for (let i = 0; i < 60; i++) { now += 1000; w.tick(now); }
  assert.ok(v.res.food > 120, 'food grows');
  assert.ok(w.act(v.id, { type: 'build', tile: 1, type2: 'house' }, now).ok);
  assert.equal(w.act(v.id, { type: 'build', tile: 1, type2: 'farm' }, now).ok, false, '同一塊地不能重複蓋');
  for (let i = 0; i < 20; i++) { now += 1000; w.tick(now); }
  assert.equal(v.tiles[1].level, 1);
  check(w);
});

test('示範部落長時間運作不會出現負數或壞值', () => {
  const w = new World({ speed: 4, rng: seeded(7) });
  let now = 1e6; w.ensureBots(now);
  assert.equal(Object.keys(w.villages).length, 8);
  for (let i = 0; i < 3000; i++) { now += 1000; w.tick(now); if (i % 200 === 0) check(w); }
  check(w);
  const levels = Object.values(w.villages).map(v => v.tiles[0].level);
  assert.ok(Object.values(w.villages).some(v => v.land.filter(Boolean).length > 7), '示範部落會自己拓荒');
  assert.ok(Math.max(...levels) >= 2, 'bots upgrade their centre: ' + levels.join(','));
});

test('市集：掛單會先扣物資，成交雙方互換，取消會退回', () => {
  const w = new World({ rng: seeded(5) });
  const now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'atayal' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'paiwan' }, now).id];
  a.sp.atayal = 10; b.res.food = 200;
  assert.ok(w.act(a.id, { type: 'offer', give: 'sp:atayal', giveN: 4, want: 'food', wantN: 50 }, now).ok);
  assert.equal(a.sp.atayal, 6);
  const id = w.market[0].id;
  assert.equal(w.act(a.id, { type: 'accept', id }, now).ok, false);
  assert.ok(w.act(b.id, { type: 'accept', id }, now).ok);
  assert.equal(b.sp.atayal, 4); assert.equal(Math.round(b.res.food), 150); assert.equal(Math.round(a.res.food), 170);
  assert.ok(w.act(a.id, { type: 'offer', give: 'sp:atayal', giveN: 2, want: 'mat', wantN: 30 }, now).ok);
  assert.ok(w.act(a.id, { type: 'cancel', id: w.market[0].id }, now).ok);
  assert.equal(a.sp.atayal, 6);
  assert.ok(w.act(a.id, { type: 'gift', to: b.id, key: 'sp:atayal', n: 1 }, now).ok);
  const snap = w.snapshot(a.id, now);
  assert.ok(snap.me.d.cap > 0 && snap.villages.length === 2);
  const w2 = new World().load(JSON.parse(JSON.stringify(w.toJSON())));
  assert.equal(Object.keys(w2.villages).length, 2);
});

test('一格可以住好幾個部落，位置不重疊', () => {
  const w = new World({ rng: seeded(11) });
  const now = 1e6, first = w.villages[w.join('p0', { owner: 'P0', name: '部落0', tribe: 'amis' }, now).id];
  const seen = new Set([first.pos.join(',')]);
  for (let i = 1; i < 7; i++) {
    const v = w.villages[w.join('p' + i, { owner: 'P' + i, name: '部落' + i, tribe: 'amis', hex: first.hex }, now).id];
    assert.equal(v.hex, first.hex, '同一格還有位置時要留在同一格');
    assert.ok(!seen.has(v.pos.join(',')), '位置不能重疊'); seen.add(v.pos.join(','));
  }
  const overflow = w.villages[w.join('p7', { owner: 'P7', name: '部落7', tribe: 'amis', hex: first.hex }, now).id];
  assert.notEqual(overflow.hex, first.hex, '滿了要排到同族的鄰近格子');
  assert.equal(w.map.byId[overflow.hex].tribe, 'amis');
});

test('部落中心升到三級要用別族的特產，材料不夠時不會白扣', () => {
  const w = new World({ rng: seeded(13) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'paiwan' }, now).id];
  v.tiles[0].level = 2; v.res.food = 1000; v.res.mat = 1000; v.sp.paiwan = 20;
  assert.equal(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok, false, '只有自己的特產不夠');
  v.sp.amis = 5; v.res.mat = 100;
  assert.equal(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok, false);
  assert.equal(v.sp.amis, 5, '失敗時特產要還在');
  v.res.mat = 1000;
  assert.ok(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok);
  assert.equal(v.sp.amis || 0, 0); assert.equal(v.sp.paiwan, 20);
});

test('地圖：沒有族群的格子是野地或中立聚落', () => {
  const Geo = require('../shared/geo.js'), m = Geo.build();
  assert.equal(m.settlements.length, 5);
  for (const h of m.hexes) assert.ok(h.tribe || h.wild || h.settlement, h.id + ' 沒有分類');
  assert.ok(m.hexes.filter(h => h.wild).length > 50);
});

test('拓荒：只能從已開墾的地往外拓，完成後多一塊建地並得到建材', () => {
  const w = new World({ rng: seeded(17) }), R = World.rules;
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id]; v.online = true;
  assert.equal(v.land.filter(Boolean).length, 7, '一開始只有中央七塊地');
  const ring1 = R.SITES.findIndex(s => s.ring === 1), ring2 = R.SITES.findIndex(s => s.ring === 2);
  assert.equal(w.act(v.id, { type: 'build', tile: ring1, type2: 'house' }, now).ok, false, '山林不能直接蓋');
  assert.equal(w.act(v.id, { type: 'clear', tile: ring2 }, now).ok, false, '不能跳過中間直接拓最外圈');
  const mat0 = v.res.mat, food0 = v.res.food;
  assert.ok(w.act(v.id, { type: 'clear', tile: ring1 }, now).ok);
  assert.equal(Math.round(food0 - v.res.food), R.CLEAR[1].food);
  assert.equal(w.act(v.id, { type: 'clear', tile: ring1 }, now).ok, false, '同一塊地不能重複拓荒');
  for (let i = 0; i < 14; i++) { now += 1000; w.tick(now); }
  assert.equal(v.land[ring1], 1);
  assert.ok(v.res.mat >= mat0 + R.CLEAR[1].gain);
  assert.ok(w.act(v.id, { type: 'build', tile: ring1, type2: 'house' }, now).ok, '拓荒完就能蓋');
  const outer = R.SITES[ring1].near.find(j => R.SITES[j].ring === 2);
  assert.equal(w.act(v.id, { type: 'clear', tile: outer }, now).ok, false, '最外圈要部落中心等級 2');
});

test('掛機：採集重點、離線自動升級與離線報告', () => {
  const w = new World({ rng: seeded(21) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'amis' }, now).id];
  w.setOnline(v.id, true, now);
  assert.ok(w.act(v.id, { type: 'idle', focus: 'mat', upgrade: true }, now).ok);
  assert.equal(v.jobs.mat, 2); assert.equal(v.jobs.food, 2, '重點排滿後，其餘的人照常分配');
  v.pop = 3; w.autoJobs(v);
  assert.deepEqual([v.jobs.mat, v.jobs.food], [2, 1], '人手不夠時先顧重點');
  v.pop = 4;
  w.setOnline(v.id, false, now);
  const before = { food: v.res.food, lv: v.tiles.filter(Boolean).reduce((s, b) => s + b.level, 0) };
  now += 30 * 60000;                       // 離線 30 分鐘
  w.tick(now);
  assert.equal(v.last, 1e6, '離線的部落不會每秒計算');
  w.setOnline(v.id, true, now);
  assert.ok(v.report, '回來要有離線報告');
  assert.ok(v.report.food > 0 || v.report.mat > 0);
  assert.ok(v.report.ups.length > 0, '離線時有自動升級');
  assert.ok(v.tiles.filter(Boolean).reduce((s, b) => s + b.level, 0) > before.lv);
  assert.ok(v.res.food <= World.rules.derived(v, 1).cap + 1 && v.res.food >= 0);
  assert.ok(w.act(v.id, { type: 'ack' }, now).ok); assert.equal(v.report, undefined);
  // 短暫斷線不出報告
  w.setOnline(v.id, false, now); now += 20000; w.setOnline(v.id, true, now);
  assert.equal(v.report, undefined);
  // 離線超過 8 小時只算 8 小時
  w.act(v.id, { type: 'idle', upgrade: false }, now);
  w.setOnline(v.id, false, now); const t0 = now; now += 20 * 3600000; w.setOnline(v.id, true, now);
  assert.equal(v.report.capped, true);
  const adm = w.adminState(now);
  assert.equal(adm.villages.length, 1); assert.equal(adm.tribes.amis.players, 1);
});

// ---------- 對戰（三路佈陣加臨場指令） ----------
const R = World.rules;
function duel(ca, cd, seed) {   // 一路、雙方各 6 勇士 6 弓手，回傳雙方損失
  const side = () => ({ w: 6, a: 6, pool: 0, lostW: 0, lostA: 0 });
  const b = { phase: 1, wall: 0, towers: 0, lanes: [{ a: side(), d: side(), broken: false }, { a: { w: 0, a: 0, pool: 0, lostW: 0, lostA: 0 }, d: side(), broken: false }, { a: { w: 0, a: 0, pool: 0, lostW: 0, lostA: 0 }, d: side(), broken: false }] };
  const r = R.fightPhase(b, ca, cd, seeded(seed));
  return { a: r.lanes[0].aLost, d: r.lanes[0].dLost };
}
function run(w, now, sec, pick) {   // 推進時間；pick(battle) 回傳攻方這一階段要下的指令
  for (let i = 0; i < sec; i++) {
    now += 1000; w.tick(now);
    for (const id in w.battles) { const b = w.battles[id]; if (b.state === 'pick' && !b.cmd.a && pick) w.act(b.a, { type: 'cmd', c: pick(b) }, now); }
  }
  return now;
}

test('對戰：人數分到三路', () => {
  assert.deepEqual(R.split(7, 'even'), [3, 2, 2]);
  assert.deepEqual(R.split(7, 'gate'), [4, 2, 1]);
  assert.deepEqual(R.split(6, 'valley'), [2, 1, 3]);
  for (const k of R.LANE_KEYS) for (let n = 0; n < 20; n++) assert.equal(R.split(n, k).reduce((s, x) => s + x, 0), n);
});

test('對戰：三個指令互相剋制', () => {
  let chargeWins = 0, holdWins = 0, volleyWins = 0;
  for (let s = 1; s <= 20; s++) {
    const x = duel('charge', 'hold', s); if (x.d > x.a) chargeWins++;      // 衝鋒剋重整
    const y = duel('hold', 'volley', s); if (y.d >= y.a) holdWins++;       // 重整剋掩護射擊
    const z = duel('volley', 'charge', s); if (z.d > z.a) volleyWins++;    // 掩護射擊剋衝鋒
  }
  assert.equal(chargeWins, 20); assert.equal(holdWins, 20); assert.equal(volleyWins, 20);
});

test('對戰：打下沒有防守的部落，攻破三路、帶回物資、對方得到保護', () => {
  const w = new World({ rng: seeded(3) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  w.setOnline(a.id, true, now);
  a.units.w = 6; a.units.a = 3; b.res.food = 500; b.res.mat = 500; b.sp.amis = 10;
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 3 }, now).ok, false, '新手保護中不能被出征');
  b.newbieUntil = 0;
  assert.ok(w.act(a.id, { type: 'allyCreate', name: '山海盟' }, now).ok);
  assert.ok(w.act(b.id, { type: 'allyJoin', id: a.ally }, now).ok);
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 3 }, now).ok, false, '同盟不能互打');
  assert.ok(w.act(b.id, { type: 'allyLeave' }, now).ok);
  const food0 = a.res.food;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 3, lanes: 'gate' }, now).ok);
  assert.equal(a.units.w, 0); assert.equal(a.away.w, 6);
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 0, a: 0 }, now).ok, false);
  now = run(w, now, 200, () => 'charge');
  assert.equal(w.marches.length, 0, '隊伍已經回來');
  assert.equal(a.battle, null); assert.equal(b.battle, null);
  assert.deepEqual([a.units.w, a.units.a, a.away.w, a.away.a], [6, 3, 0, 0], '沒有守軍，全員回來');
  const rep = a.reports[0];
  assert.equal(rep.broken, 3); assert.equal(rep.win, true);
  assert.ok(rep.loot['sp:amis'] === 4, '攻破三路帶走四成特產');
  assert.ok(a.res.food > food0 + 100 && a.sp.amis === 4);
  assert.ok(b.shieldUntil > now && b.reports[0].win === false);
  assert.equal(w.stats['bunun>amis'].n, 1); assert.equal(w.stats['bunun>amis'].win, 1);
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 1, a: 0 }, now).ok, false, '保護時間內不能再出征');
  check(w);
});

test('對戰：守軍、圍籬與瞭望台擋下小隊；不在線上的守方照守備方針', () => {
  const w = new World({ rng: seeded(5) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'atayal' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'paiwan' }, now).id];
  w.setOnline(a.id, true, now); b.newbieUntil = 0;
  b.units.w = 6; b.units.a = 6; b.wall = 2; b.tiles[1] = { type: 'tower', level: 2 };
  assert.ok(w.act(b.id, { type: 'defense', lanes: 'gate', plan: ['volley', 'volley', 'hold'] }, now).ok);
  a.units.w = 4;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 4, a: 0, lanes: 'gate' }, now).ok);
  now = run(w, now, 200, () => 'charge');
  const rep = a.reports[0];
  assert.equal(rep.win, false); assert.ok(rep.broken < 2);
  assert.deepEqual(rep.log.map(p => p.d).slice(0, 2), ['volley', 'volley'].slice(0, rep.log.length), '守方照預設下指令');
  assert.equal(b.shieldUntil, 0, '守住了就沒有保護時間');
  assert.ok(b.units.w + b.units.a > 6, '守軍大多回到部落');
  assert.ok(b.glory >= 5);
  check(w);
});

test('對戰：防守方在線上可以自己下指令，時間到沒下就照預設', () => {
  const w = new World({ rng: seeded(8) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  w.setOnline(a.id, true, now); w.setOnline(b.id, true, now); b.newbieUntil = 0;
  a.units.w = 6; a.units.a = 6; b.units.w = 6; b.units.a = 6;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 6 }, now).ok);
  while (!a.battle) { now += 1000; w.tick(now); }
  const bt = w.battles[a.battle];
  assert.equal(w.snapshot(b.id, now).battle.role, 'def');
  while (bt.state !== 'pick') { now += 1000; w.tick(now); }
  assert.ok(w.act(a.id, { type: 'cmd', c: 'charge' }, now).ok);
  assert.equal(bt.state, 'pick', '守方在線上，要等他下令');
  assert.ok(w.act(b.id, { type: 'cmd', c: 'volley' }, now).ok);
  assert.equal(bt.state, 'show'); assert.deepEqual([bt.log[0].a, bt.log[0].d], ['charge', 'volley']);
  now = run(w, now, 6);
  assert.equal(bt.phase, 2);
  now = run(w, now, 14);                     // 雙方都不下令，等時間到
  assert.equal(bt.log.length, 2); assert.equal(bt.log[1].a, 'charge'); assert.equal(bt.log[1].d, b.def.plan[1]);
  while (bt.state !== 'done') { now += 1000; w.tick(now); }
  assert.equal(a.battle, null);
  const fin = w.snapshot(b.id, now).battle;
  assert.ok(fin && fin.result && fin.role === 'def', '打完後雙方還收得到結果');
  now = run(w, now, 30);
  assert.equal(w.snapshot(b.id, now).battle, null, '過一陣子就不再傳');
  check(w);
});

test('掛機：離線時自動補訓守軍', () => {
  const w = new World({ rng: seeded(31) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'paiwan' }, now).id];
  w.setOnline(v.id, true, now);
  v.tiles[1] = { type: 'barracks', level: 1 }; v.res.food = 500; v.res.mat = 300;
  assert.ok(w.act(v.id, { type: 'idle', train: true }, now).ok);
  w.setOnline(v.id, false, now); now += 20 * 60000; w.setOnline(v.id, true, now);
  assert.equal(v.units.w + v.units.a, R.armyCap(v), '補滿到上限');
  check(w);
});

// ---------- 世界互動 ----------
test('族群關係：交易、送禮、結盟變好；出征變差；友好有加成、敵對不能交易', () => {
  const w = new World({ rng: seeded(41) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  const c = w.villages[w.join('c', { owner: 'C', name: '丙', tribe: 'bunun' }, now).id];
  a.sp.bunun = 40; b.res.food = 2000; b.sp.amis = 40;
  assert.equal(w.relState('bunun', 'amis'), 'neutral');
  for (let i = 0; i < 10; i++) {
    assert.ok(w.act(a.id, { type: 'offer', give: 'sp:bunun', giveN: 1, want: 'food', wantN: 10 }, now).ok);
    assert.ok(w.act(b.id, { type: 'accept', id: w.market[0].id }, now).ok);
  }
  assert.equal(w.relOf('bunun', 'amis'), 10 * R.REL.trade); assert.equal(w.relState('amis', 'bunun'), 'friend');
  const f0 = a.res.food, s0 = b.sp.bunun;
  assert.ok(w.act(a.id, { type: 'offer', give: 'sp:bunun', giveN: 10, want: 'food', wantN: 100 }, now).ok);
  assert.ok(w.act(b.id, { type: 'accept', id: w.market[0].id }, now).ok);
  assert.equal(Math.round(a.res.food - f0), 110, '友好時多拿一成'); assert.equal(b.sp.bunun - s0, 11);
  now += 6000; assert.ok(w.act(b.id, { type: 'gift', to: a.id, key: 'sp:amis', n: 2 }, now).ok);
  assert.equal(w.relOf('bunun', 'amis'), 11 * R.REL.trade + R.REL.gift);
  assert.equal(w.relOf('bunun', 'bunun'), 0, '同族之間沒有關係值');
  w.rel['amis|bunun'] = R.REL.hostile;      // 兩族變成敵對
  assert.ok(w.act(a.id, { type: 'offer', give: 'sp:bunun', giveN: 1, want: 'food', wantN: 10 }, now).ok);
  assert.equal(w.act(b.id, { type: 'accept', id: w.market[0].id }, now).ok, false, '敵對不能直接交易');
  assert.ok(w.act(c.id, { type: 'offer', give: 'food', giveN: 10, want: 'mat', wantN: 10 }, now).ok);
  // 出征讓關係變差
  w.rel = {}; b.newbieUntil = 0; a.units.w = 2;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 2, a: 0 }, now).ok);
  assert.equal(w.relOf('bunun', 'amis'), R.REL.attack);
  // 會慢慢回到中立
  w.rel = { 'amis|bunun': 3, 'atayal|paiwan': -2 }; w.lastRel = now;
  for (let i = 0; i < 4; i++) { now += R.REL.decayMs; w.tick(now); }
  assert.deepEqual(w.rel, {});
  check(w);
});

test('野地資源點：佔領、產出、被搶、召回', () => {
  const w = new World({ rng: seeded(43) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  w.setOnline(a.id, true, now); w.setOnline(b.id, true, now);
  const wild = w.map.hexes.filter(h => h.wild === 'wood').map(h => h.id);
  assert.equal(w.act(a.id, { type: 'occupy', hex: a.hex, w: 1, a: 0 }, now).ok, false, '族群的區域不是資源點');
  a.units.w = 6; a.units.a = 2;
  assert.ok(w.act(a.id, { type: 'occupy', hex: wild[0], w: 1, a: 0 }, now).ok);
  assert.equal(w.act(a.id, { type: 'occupy', hex: wild[1], w: 1, a: 0 }, now).ok, false, '一次只能有一支隊伍在外面');
  now = run(w, now, 130);
  assert.equal(w.points[wild[0]], undefined, '只派一個人會被野獸趕回來'); assert.equal(a.units.w, 6);
  assert.ok(w.act(a.id, { type: 'occupy', hex: wild[0], w: 3, a: 1 }, now).ok);
  now = run(w, now, 70);
  assert.equal(w.points[wild[0]].owner, a.id); assert.equal(a.away.w, 3);
  const mat0 = a.res.mat; now = run(w, now, 60);
  const base = 60 * R.derived(a, 1).rates.mat;
  assert.ok(a.res.mat - mat0 > base + 60 * R.POINT.wood.rate * 4 * 0.9, '資源點多產出建材');
  assert.equal(w.snapshot(b.id, now).points[0].w, null, '別人看不到確切的駐守人數');
  // 乙派更多人來搶
  b.units.w = 6; b.units.a = 6;
  assert.ok(w.act(b.id, { type: 'occupy', hex: wild[0], w: 6, a: 6 }, now).ok);
  now = run(w, now, 70);
  assert.equal(w.points[wild[0]].owner, b.id, '人多的一方搶下來');
  assert.equal(a.away.w + a.away.a, 0, '被趕走的人不再算出征中');
  assert.ok(a.reports[0].note.includes('搶走')); assert.ok(w.relOf('bunun', 'amis') < 0);
  // 召回
  const n = w.points[wild[0]].w + w.points[wild[0]].a, home = b.units.w + b.units.a;
  assert.ok(w.act(b.id, { type: 'recall', hex: wild[0] }, now).ok);
  assert.equal(w.points[wild[0]], undefined);
  now = run(w, now, 70);
  assert.equal(b.units.w + b.units.a, home + n); assert.equal(b.away.w + b.away.a, 0);
  check(w);
});

test('中立聚落：用特產或物資換別族特產，存量會用完也會補回來', () => {
  const w = new World({ rng: seeded(47) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'atayal' }, now).id];
  const at = w.map.settlements[0].id;
  v.sp.atayal = 9; v.res.food = 300;
  assert.equal(w.act(v.id, { type: 'barter', at, want: 'atayal', pay: 'sp' }, now).ok, false, '不能換自己的特產');
  assert.ok(w.act(v.id, { type: 'barter', at, want: 'bunun', pay: 'sp' }, now).ok);
  assert.equal(v.sp.atayal, 9 - R.SETTLE.give); assert.equal(v.sp.bunun, R.SETTLE.get);
  assert.ok(w.act(v.id, { type: 'barter', at, want: 'amis', pay: 'food' }, now).ok);
  assert.equal(Math.round(v.res.food), 300 - R.SETTLE.resCost); assert.equal(v.sp.amis, 1);
  w.stock[at].paiwan = 1;
  assert.equal(w.act(v.id, { type: 'barter', at, want: 'paiwan', pay: 'sp' }, now).ok, false, '存量不夠');
  w.lastStock = now; now += R.SETTLE.refillMs; w.tick(now);
  assert.equal(w.stock[at].paiwan, 2);
  assert.ok(w.act(v.id, { type: 'barter', at, want: 'paiwan', pay: 'sp' }, now).ok);
  check(w);
});

test('人數加成：玩家少的族群產量較高', () => {
  const w = new World({ rng: seeded(53) });
  const now = 1e6;
  const ids = ['bunun', 'bunun', 'bunun', 'bunun', 'amis', 'amis', 'paiwan'].map((t, i) => w.join('p' + i, { owner: 'P' + i, name: '部落' + i, tribe: t }, now).id);
  w.ensureBots(now); w.popBonus();
  const pb = id => w.villages[id].pb;
  assert.equal(pb(ids[0]), 0, '人最多的族群沒有加成');
  assert.ok(Math.abs(pb(ids[4]) - 0.075) < 0.001); assert.ok(Math.abs(pb(ids[6]) - 0.1125) < 0.001);
  for (const id in w.villages) if (w.villages[id].bot) assert.equal(w.villages[id].pb, 0);
  const a = w.villages[ids[0]], c = w.villages[ids[6]];
  assert.ok(R.derived(c, 1).rates.food > R.derived(a, 1).rates.food * 0.95);
});

// ---------- 任務、器物、獨特建築與兵種、英雄、祝福 ----------
test('任務主線：五章依序完成，獎勵是器物、器物、獨特建築、獨特兵種、英雄與祝福', () => {
  const w = new World({ rng: seeded(61) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'amis' }, now).id];
  w.setOnline(v.id, true, now);
  assert.equal(w.act(v.id, { type: 'quest' }, now).ok, false, '目標沒達成不能領');
  assert.equal(w.act(v.id, { type: 'build', tile: 1, type2: 'unique' }, now).ok, false, '第三章前不能蓋獨特建築');
  const rate0 = R.derived(v, 1).rates.food;
  v.land[7] = 1; v.land[8] = 1;                                    // 第一章：開墾到 9 塊地
  assert.deepEqual([w.questProgress(v).cur, w.questProgress(v).done], [9, true]);
  assert.ok(w.act(v.id, { type: 'quest' }, now).ok);
  assert.ok(Math.abs(R.derived(v, 1).rates.food / rate0 - (1 + R.ITEM_BONUS)) < 1e-9, '第一件器物讓糧食產量增加');
  v.res.food = 320; assert.ok(w.act(v.id, { type: 'quest' }, now).ok);      // 第二章：存糧
  v.stat.trade = 2; assert.ok(w.act(v.id, { type: 'quest' }, now).ok);      // 第三章：交換
  assert.equal(v.quest, 3);
  v.res.food = 500; v.res.mat = 500;
  assert.ok(w.act(v.id, { type: 'build', tile: 1, type2: 'unique' }, now).ok);
  assert.equal(w.act(v.id, { type: 'build', tile: 3, type2: 'unique' }, now).ok, false, '只能蓋一座');
  v.tiles[5] = { type: 'barracks', level: 2 };
  assert.equal(w.act(v.id, { type: 'train', u: 'u' }, now).ok, false, '第四章前不能訓練獨特兵種');
  v.jobs = { food: 0, mat: 0, special: 0 }; v.auto = false;
  assert.equal(R.derived(v, 1).rates.special, 0);
  now = run(w, now, 40);
  assert.equal(v.tiles[1].level, 1);
  assert.ok(Math.abs(R.derived(v, 1).rates.special - R.POND.special) < 1e-9 && R.derived(v, 1).rates.food >= R.POND.food, '阿美的獨特建築不用人手也有漁獲和糧食');
  assert.equal(w.act(v.id, { type: 'upgrade', tile: 1 }, now).ok, false, '獨特建築不用升級');
  v.units.w = 6; assert.ok(w.act(v.id, { type: 'quest' }, now).ok);         // 第四章：6 名戰士
  v.res.food = 500; v.res.mat = 500;
  assert.ok(w.act(v.id, { type: 'train', u: 'u' }, now).ok);
  now = run(w, now, 8); assert.equal(v.units.u, 1);
  assert.equal(w.act(v.id, { type: 'bless' }, now).ok, false, '主線沒完成不能舉行祭儀');
  v.stat.point = 1; assert.ok(w.act(v.id, { type: 'quest' }, now).ok);      // 第五章：佔領資源點
  assert.equal(v.quest, 5); assert.equal(w.questProgress(v), null);
  now = run(w, now, 2);
  assert.equal(v.blessed, true, '完成主線先得到一次祝福');
  assert.equal(w.act(v.id, { type: 'bless' }, now).ok, false, '剛祝福過不能馬上再辦');
  now += R.BLESS.again + 1000; w.tick(now);
  assert.equal(v.blessed, false);
  v.res.food = 300; v.jobs.mat = 1; const r1 = R.derived(v, 1).rates.mat;
  assert.ok(w.act(v.id, { type: 'bless' }, now).ok);
  assert.ok(Math.abs(R.derived(v, 1).rates.mat / r1 - R.BLESS.mult) < 1e-9); assert.equal(Math.round(v.res.food), 300 - R.BLESS.food);
  check(w);
});

test('獨特建築的效果：望樓讓來襲變慢、石板建築保護量加倍、獵場建築多佔一處', () => {
  const w = new World({ rng: seeded(67) });
  let now = 1e6;
  const mk = (tok, tribe) => { const v = w.villages[w.join(tok, { owner: tok, name: tok, tribe }, now).id]; v.newbieUntil = 0; return v; };
  const a = mk('a', 'bunun'), t1 = mk('b', 'atayal'), p = mk('c', 'paiwan');
  const prot0 = R.derived(p, 1).protect, cap0 = R.derived(p, 1).cap;
  [a, t1, p].forEach(v => { v.quest = 3; v.tiles[1] = { type: 'unique', level: 1 }; });
  assert.equal(R.derived(p, 1).protect, prot0 * 2); assert.equal(R.derived(p, 1).cap, cap0 + 300);
  assert.equal(R.pointMax(a), R.POINT_MAX + 1);
  a.units.w = 4; p.units.w = 0;
  assert.ok(w.act(a.id, { type: 'attack', to: t1.id, w: 2, a: 0 }, now).ok);
  const toWatch = w.marches[0].travel; w.marches = []; a.units.w = 4; a.away.w = 0; a.cool = {};
  const d1 = require('../shared/geo.js').hexDist(w.map.byId[a.hex], w.map.byId[t1.hex]);
  assert.ok(Math.abs(toWatch - Math.min(60, 6 + 2.5 * d1) * 1500) < 1, '出征有望樓的部落，路上多花一半時間');
});

test('獨特兵種：能上場；守方的山林獵手比進攻時更強；英雄能力一場只能用一次', () => {
  const side = (u, tribe, def) => R.mkSide(0, 0, u, tribe, def);
  const fight = (def) => { const b = { phase: 1, wall: 0, towers: 0, lanes: [{ a: side(6, def ? 'bunun' : 'atayal', false), d: side(6, def ? 'atayal' : 'bunun', true), broken: false }, { a: side(0, 'bunun'), d: side(0, 'bunun'), broken: true }, { a: side(0, 'bunun'), d: side(0, 'bunun'), broken: true }] }; R.fightPhase(b, 'charge', 'charge', seeded(5)); return b.lanes[0]; };
  const asDef = fight(true), asAtk = fight(false);
  assert.ok(asDef.d.u >= asAtk.a.u, '泰雅的山林獵手守在部落時損失不會比進攻時多');
  const w = new World({ rng: seeded(71) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'paiwan' }, now).id];
  w.setOnline(a.id, true, now); b.newbieUntil = 0;
  a.quest = 5; a.units.w = 3; a.units.a = 3; a.units.u = 4; b.units.w = 4; b.units.a = 4; b.units.u = 2; b.quest = 4;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 3, a: 3, u: 4 }, now).ok);
  assert.equal(a.away.u, 4);
  while (!a.battle) { now += 1000; w.tick(now); }
  const bt = w.battles[a.battle];
  assert.deepEqual(bt.hero, { a: true, d: false }, '守方還沒完成主線，沒有英雄');
  assert.equal(bt.lanes.reduce((s, l) => s + l.a.u, 0), 4); assert.equal(bt.lanes.reduce((s, l) => s + l.d.u, 0), 2);
  while (bt.state !== 'pick') { now += 1000; w.tick(now); }
  assert.ok(w.act(a.id, { type: 'cmd', c: 'hero' }, now).ok);
  assert.equal(bt.log[0].ha, 'volley2'); assert.equal(bt.log[0].a, 'volley', '射日一箭算作掩護射擊');
  assert.equal(w.snapshot(a.id, now).battle.hero, false);
  while (bt.state !== 'pick' && bt.state !== 'done') { now += 1000; w.tick(now); }
  if (bt.state === 'pick') assert.equal(w.act(a.id, { type: 'cmd', c: 'hero' }, now).ok, false, '一場只能用一次');
  while (bt.state !== 'done') { now += 1000; w.tick(now); }
  assert.ok(a.heroRest > now, '用過之後英雄要休息');
  now = run(w, now, 90);
  assert.equal(a.away.u, 0); assert.ok(a.units.u <= 4 && a.units.u >= 0);
  check(w);
});
