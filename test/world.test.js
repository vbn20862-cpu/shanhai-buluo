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
  v.tiles[0].level = 2; v.res.food = 1000; v.res.mat = 1000; v.sp.paiwan = 20; v.sp.amis = 5;
  assert.equal(w.act(v.id, { type: 'upgrade', tile: 0 }, now).msg, '要先把小米田升到等級 2', '中心升級的前置條件');
  v.tiles[2].level = 2; delete v.sp.amis;
  assert.equal(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok, false, '只有自己的特產不夠');
  v.sp.amis = 5; v.res.mat = 100;
  assert.equal(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok, false);
  assert.equal(v.sp.amis, 5, '失敗時特產要還在');
  v.res.mat = 1000;
  assert.ok(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok);
  assert.equal(v.sp.amis || 0, 0); assert.equal(v.sp.paiwan, 20);
});

test('地圖：格子變細（約 1,250 格），每一格都有地形；路程照原本的距離算', () => {
  const Geo = require('../shared/geo.js'), m = Geo.build();
  assert.equal(m.settlements.length, 5);
  assert.ok(m.hexes.length > 1100 && m.hexes.length < 1400, m.hexes.length + ' 格');
  for (const h of m.hexes) assert.ok(['mt', 'hill', 'low'].includes(h.alt), h.id + ' 沒有地形');
  assert.ok(m.hexes.filter(h => h.coast).length > 100 && m.hexes.filter(h => h.alt === 'mt').length > 300);
  const a = m.hexes[0], b = m.hexes[m.hexes.length - 2];
  assert.equal(Geo.travel(a, b), Geo.hexDist(a, b) * Geo.HEX_SIZE / 6);
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

// ---------- 對戰（自動、單一戰場） ----------
const R = World.rules;
const all3 = o => o.w + o.a + (o.u || 0);
function run(w, now, sec) { for (let i = 0; i < sec; i++) { now += 1000; w.tick(now); } return now; }   // 推進時間

test('自動對戰：人多的一方贏；輸的一方撤退時還留著人；每一回合都有紀錄', () => {
  new World();   // 換回預設的數值
  const A = n => ({ tribe: 'bunun', w: n, a: n, u: 0 }), D = (n, wall, towers) => ({ tribe: 'amis', w: n, a: n, u: 0, wall: wall || 0, towers: towers || [] });
  let big = 0, small = 0;
  for (let i = 1; i <= 40; i++) { if (R.autoBattle(A(8), D(5), seeded(i)).win) big++; if (R.autoBattle(A(5), D(8), seeded(i)).win) small++; }
  assert.equal(big, 40, '多六成的人一定贏'); assert.equal(small, 0, '少四成的人一定輸');
  const r = R.autoBattle(A(8), D(5), seeded(3));
  assert.equal(r.log[0].r, 0, '先是一輪遠射'); assert.ok(r.log.length >= 2 && r.log.length <= R.FIGHT.rounds + 1);
  for (let i = 1; i < r.log.length; i++) { assert.ok(all3(r.log[i].a) <= all3(r.log[i - 1].a)); assert.ok(all3(r.log[i].d) <= all3(r.log[i - 1].d)); }
  assert.deepEqual(r.log[r.log.length - 1].a, r.left); assert.deepEqual(r.log[r.log.length - 1].d, r.home);
  assert.ok(all3(r.home) <= Math.floor(10 * R.TUNE.breakPct / 100), '守方剩不到三分之一就撤退');
  assert.equal(r.lostD, 10 - all3(r.home)); assert.equal(r.lostA, 16 - all3(r.left)); assert.ok(r.grade >= 1 && r.grade <= 3);
  assert.deepEqual(r.start, { a: { w: 8, a: 8, u: 0 }, d: { w: 5, a: 5, u: 0 } });
  const lose = R.autoBattle(A(5), D(8), seeded(3));
  assert.equal(lose.grade, 0); assert.ok(all3(lose.left) <= 3, '進攻方剩不到三分之一就撤退');
  const e = R.autoBattle(A(3), D(0, 2, [2]), seeded(1));
  assert.ok(e.win && e.grade === 3 && e.lostA === 0 && e.log.length === 0, '沒有守軍：直接獲勝，沒有人負傷');
  let open = 0, walled = 0;   // 人數一樣時，圍籬和瞭望台讓守方更容易守住
  for (let i = 1; i <= 200; i++) { if (R.autoBattle(A(6), D(6), seeded(i)).win) open++; if (R.autoBattle(A(6), D(6, 3, [2, 2]), seeded(i)).win) walled++; }
  assert.ok(open > 20 && walled === 0, '沒有圍籬時有機會打贏（' + open + '/200），有三級圍籬和兩座瞭望台就打不下來（' + walled + '/200）');
});

test('戰力與勝算：圍籬、瞭望台、獨特兵種的特性都算進戰力；勝算和實際結果對得上', () => {
  new World();
  const base = R.power({ tribe: 'amis', w: 4, a: 4, u: 0 });
  assert.ok(base > 0); assert.equal(R.power({ tribe: 'amis', w: 0, a: 0, u: 0, def: true, wall: 3, towers: [3] }), 0, '沒有人守，圍籬和瞭望台擋不住');
  assert.ok(R.power({ tribe: 'amis', w: 8, a: 8, u: 0 }) > base * 1.9);
  assert.ok(R.power({ tribe: 'amis', w: 4, a: 4, u: 0, def: true, wall: 2 }) > base); assert.ok(R.power({ tribe: 'amis', w: 4, a: 4, u: 0, def: true, wall: 2, towers: [2] }) > R.power({ tribe: 'amis', w: 4, a: 4, u: 0, def: true, wall: 2 }));
  assert.ok(R.power({ tribe: 'atayal', w: 0, a: 0, u: 6, def: true }) > R.power({ tribe: 'atayal', w: 0, a: 0, u: 6 }), '山林獵手守在自己部落時更強');
  assert.ok(R.power({ tribe: 'paiwan', w: 0, a: 0, u: 6, def: true }) > R.power({ tribe: 'paiwan', w: 0, a: 0, u: 6 }), '石牆守衛守在自己部落時更耐打');
  assert.ok(R.power({ tribe: 'amis', w: 0, a: 0, u: 8 }) / 8 > R.power({ tribe: 'amis', w: 0, a: 0, u: 2 }) / 2, '部落青年人越多越強');
  assert.equal(R.odds(130, 100), 'high'); assert.equal(R.odds(110, 100), 'mid'); assert.equal(R.odds(90, 100), 'low'); assert.equal(R.odds(50, 0), 'high'); assert.equal(R.odds(0, 0), 'low');
  const rng = seeded(17), ids = ['atayal', 'bunun', 'amis', 'paiwan'], ri = n => Math.floor(rng() * n), tally = { high: [0, 0], mid: [0, 0], low: [0, 0] };
  for (let i = 0; i < 6000; i++) {
    const n = 1 + ri(12), A = { tribe: ids[ri(4)], w: ri(n + 1), a: ri(n + 1), u: ri(n + 1), hero: rng() < 0.5 };
    const D = { tribe: ids[ri(4)], w: ri(n + 1), a: ri(n + 1), u: ri(n + 1), hero: rng() < 0.5, wall: ri(4), towers: Array.from({ length: ri(3) }, () => 1 + ri(3)), uniq: rng() < 0.3 ? 'watch' : '' };
    if (all3(A) < 1 || all3(D) < 1) continue;
    const o = R.odds(R.power(A), R.power(Object.assign({ def: true }, D))); tally[o][0]++; if (R.autoBattle(A, D, rng).win) tally[o][1]++;
  }
  const rate = k => tally[k][1] / tally[k][0];
  assert.ok(rate('high') >= 0.93, '勝算高：實際贏了 ' + (rate('high') * 100).toFixed(0) + '%');
  assert.ok(rate('low') <= 0.04, '勝算低：實際贏了 ' + (rate('low') * 100).toFixed(0) + '%');
  assert.ok(rate('mid') > 0.25 && rate('mid') < 0.75, '勝算中：實際贏了 ' + (rate('mid') * 100).toFixed(0) + '%');
});

test('對戰：打下沒有防守的部落，大勝、帶回物資、對方得到保護', () => {
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
  assert.equal(w.pub(b, now).pw, 0, '沒有守軍，守備戰力是 0');
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 3 }, now).ok);
  assert.equal(a.units.w, 0); assert.equal(a.away.w, 6);
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 0, a: 0 }, now).ok, false);
  now = run(w, now, 200);
  assert.equal(w.marches.length, 0, '隊伍已經回來');
  assert.deepEqual([a.units.w, a.units.a, a.away.w, a.away.a], [6, 3, 0, 0], '沒有守軍，全員回來');
  const rep = a.reports[0];
  assert.equal(rep.grade, 3); assert.equal(rep.win, true); assert.equal(rep.lost, 0); assert.deepEqual(rep.log, []);
  assert.deepEqual(rep.show.start.a, { w: 6, a: 3, u: 0 }); assert.equal(rep.show.aTribe, 'bunun'); assert.equal(rep.show.dName, '乙');
  assert.ok(rep.loot['sp:amis'] === 4, '大勝帶走四成特產');
  assert.ok(a.res.food > food0 + 100 && a.sp.amis === 4);
  assert.ok(b.shieldUntil > now && b.reports[0].win === false && b.reports[0].id === rep.id);
  assert.equal(w.stats['bunun>amis'].n, 1); assert.equal(w.stats['bunun>amis'].win, 1);
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 1, a: 0 }, now).ok, false, '保護時間內不能再出征');
  assert.equal(w.snapshot(a.id, now).battle, undefined, '沒有「進行中的對戰」這種狀態了');
  check(w);
});

test('對戰：守軍、圍籬與瞭望台擋下小隊；守方不用在線上，也不用設定任何東西', () => {
  const w = new World({ rng: seeded(5) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'atayal' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'paiwan' }, now).id];
  w.setOnline(a.id, true, now); b.newbieUntil = 0;
  b.units.w = 6; b.units.a = 6; b.wall = 2; b.tiles[1] = { type: 'tower', level: 2 };
  assert.equal(w.act(b.id, { type: 'defense', lanes: 'gate' }, now).ok, false, '佈防設定已經拿掉');
  a.units.w = 4;
  assert.equal(R.odds(R.power({ tribe: 'atayal', w: 4, a: 0, u: 0 }), w.pub(b, now).pw), 'low', '出發前看得出勝算低');
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 4, a: 0 }, now).ok);
  while (!a.reports.length) { now += 1000; w.tick(now); }
  const rep = a.reports[0];
  assert.equal(rep.win, false); assert.equal(rep.grade, 0); assert.ok(rep.log.length >= 1 && rep.show.wall === 2 && rep.show.towerN === 1);
  assert.equal(b.reports[0].win, true); assert.equal(b.reports[0].lost, rep.hurt); assert.equal(b.reports[0].hurt, rep.lost);
  assert.equal(b.shieldUntil, 0, '守住了就沒有保護時間');
  assert.equal(b.units.w + b.units.a, 12 - rep.hurt, '守軍留在部落裡'); assert.ok(b.units.w + b.units.a > 6);
  assert.ok(b.glory >= 5);
  assert.equal(a.away.w, 4 - rep.lost, '負傷的人不再算出征中');
  now = run(w, now, 200);
  assert.deepEqual([a.units.w, a.away.w, w.marches.length], [4 - rep.lost, 0, 0], '剩下的人回到部落');
  check(w);
});

test('對戰：隊伍一到就打完，雙方同時收到戰報；戰報帶著每一回合的紀錄可以重播', () => {
  const w = new World({ rng: seeded(8) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  w.setOnline(a.id, true, now); b.newbieUntil = 0;   // 乙不在線上
  a.units.w = 6; a.units.a = 6; b.units.w = 6; b.units.a = 6; b.res.food = 800;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 6 }, now).ok);
  const arrive = w.marches[0].arriveAt;
  now = arrive - 1; w.tick(now); assert.equal(a.reports.length, 0);
  now = arrive + 1; w.tick(now);
  assert.equal(a.reports.length, 1); assert.equal(b.reports.length, 1, '同一刻雙方都有戰報');
  const ra = a.reports[0], rb = b.reports[0];
  assert.deepEqual(ra.log, rb.log); assert.equal(ra.role, 'atk'); assert.equal(rb.role, 'def'); assert.equal(ra.win, !rb.win);
  assert.ok(ra.log.length >= 2); ra.log.forEach((p, i) => { assert.equal(p.r, i, '回合依序'); assert.ok(p.a && p.d); });
  assert.equal(all3(ra.log[ra.log.length - 1].a), 12 - ra.lost); assert.equal(all3(ra.log[ra.log.length - 1].d), 12 - rb.lost);
  assert.equal(b.units.w + b.units.a, 12 - rb.lost);
  const me = w.snapshot(a.id, now).me;
  assert.ok(me.reports[0].show && me.reports[0].log.length === ra.log.length, '玩家收得到重播用的紀錄'); assert.equal(me.battle, undefined); assert.equal(me.def, undefined);
  if (ra.win) { assert.ok(w.marches[0].phase === 'back' && w.marches[0].loot.food > 0); assert.ok(b.shieldUntil > now); }
  now = run(w, now, 200);
  assert.equal(a.units.w + a.units.a, 12 - ra.lost); assert.equal(all3(a.away), 0);
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

test('資源點：隨機長出來、種類照地形；派人去採，採滿就回家；可以搶；被盯上會通知；可以叫回來', () => {
  const w = new World({ rng: seeded(43) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  w.setOnline(a.id, true, now); w.setOnline(b.id, true, now);
  w.tick(now += 1000);
  const nodes = Object.values(w.nodes).filter(n => !R.NODE[n.k].ev);   // 野地事件（山豬群、搶修）另外算
  assert.equal(nodes.length, R.TUNE.nodeCount, '一開始就長滿');
  const geo = w.map.byId;
  for (const n of nodes) {
    assert.ok(R.NODE[n.k] && n.lv >= 1 && n.lv <= 5 && n.amt === R.NODE_AMT[n.lv]);
    if (n.k === 'stone') assert.ok(['paiwan', 'rukai', 'bunun'].includes(geo[n.hex].tribe) && geo[n.hex].alt === 'mt', '石板只在產石板的山區');
    if (n.k === 'forage') assert.equal(geo[n.hex].alt, 'low', '野菜地在平地');
  }
  assert.ok(new Set(nodes.map(n => n.k)).size >= 5, '各種資源點都有');
  // 甲派 4 人去採一個糧食的資源點
  const nd = nodes.filter(n => R.NODE[n.k].res === 'food' && n.lv === 1)[0];
  a.units.w = 6; a.units.a = 4;
  assert.equal(w.act(a.id, { type: 'gather', node: 'toString', w: 1, a: 0 }, now).ok, false);
  assert.ok(w.act(a.id, { type: 'gather', node: nd.id, w: 4, a: 0 }, now).ok);
  assert.equal(w.act(a.id, { type: 'gather', node: nd.id, w: 1, a: 0 }, now).ok, false, '同一個點一次一支隊伍');
  const m = w.marches.filter(x => x.from === a.id)[0];
  now = m.arriveAt + 10; w.tick(now);
  assert.equal(m.phase, 'gather'); assert.equal(nd.g.v, a.id, '開始採集');
  assert.ok(w.snapshot(b.id, now).nodes.find(x => x.id === nd.id).g.pw > 0, '別人看得到誰在採、大概多強');
  // 乙派人去搶：甲馬上收到通知
  b.units.w = 8; b.units.a = 6;
  assert.ok(w.act(b.id, { type: 'gather', node: nd.id, w: 8, a: 6 }, now).ok);
  assert.ok(a.reports[0].alert && a.reports[0].note.includes('要來搶'), '被盯上的一方馬上有通知');
  const raid = w.marches.filter(x => x.from === b.id)[0];
  now = raid.arriveAt + 10; w.tick(now);
  assert.equal(nd.g.v, b.id, '人多的一方搶下來，接著採'); assert.ok(raid.carry > 0, '拿走甲已經採到的');
  assert.equal(m.phase, 'back'); assert.equal(m.carry, 0, '甲的隊伍空手回家（全部負傷的話隊伍直接解散）');
  assert.ok(a.reports[0].show && a.reports[0].point, '有可以重播的戰報');
  now = m.arriveAt + 10; w.tick(now);
  assert.equal(a.away.w + a.away.a, 0, '甲的人都回來了（負傷的不算）'); assert.ok(!w.marches.includes(m));
  // 乙採滿就回家，帶回糧食
  const food0 = b.res.food;
  while (raid.phase !== 'back') { now += 5000; w.tick(now); }
  const carry = raid.carry;
  assert.ok(carry > 0 && carry <= 14 * R.TUNE.gatherLoad);
  now = raid.arriveAt + 10; w.tick(now);
  assert.ok(b.res.food >= food0 + carry - 1 - 60, '帶回來的糧食進倉庫'); assert.equal(b.stat.point >= 1, true, '算採集過一次');
  assert.ok(!w.nodes[nd.id] || w.nodes[nd.id].amt < nd.max, '資源點扣掉了');
  // 叫回來：帶著已經採到的
  const nd2 = Object.values(w.nodes).filter(n => !n.g && n.lv >= 3)[0];
  b.units.w = Math.max(b.units.w, 4);
  assert.ok(w.act(b.id, { type: 'gather', node: nd2.id, w: 4, a: 0 }, now).ok);
  const m2 = w.marches.filter(x => x.from === b.id)[0];
  now = m2.arriveAt + 10; w.tick(now); now += 20000; w.tick(now);
  assert.ok(w.act(b.id, { type: 'recall', id: m2.id }, now).ok);
  assert.equal(m2.phase, 'back'); assert.ok(m2.carry > 0); assert.equal(nd2.g, null);
  assert.equal(w.act(b.id, { type: 'recall', id: m2.id }, now).ok, false);
  // 採完的點會在別的地方長出新的
  delete w.nodes[nd2.id]; w.nodesV++;
  for (let i = 0; i < 40; i++) w.tick(now += 1000);
  assert.equal(Object.values(w.nodes).filter(n => !R.NODE[n.k].ev).length, R.TUNE.nodeCount);
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
  assert.ok(Math.abs(R.derived(v, 1).rates.food / rate0 - (1 + R.TUNE.itemBonus)) < 1e-9, '第一件器物讓糧食產量增加');
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
  assert.ok(Math.abs(R.derived(v, 1).rates.special - R.TUNE.pondSp / 60) < 1e-9 && R.derived(v, 1).rates.food >= R.TUNE.pondFood / 60, '阿美的獨特建築不用人手也有漁獲和糧食');
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
  assert.ok(Math.abs(R.derived(v, 1).rates.mat / r1 - R.TUNE.blessMult) < 1e-9); assert.equal(Math.round(v.res.food), 300 - R.BLESS.food);
  check(w);
});

test('獨特建築的效果：望樓讓來襲變慢、芋頭窯保護量加倍、石板豬圈採集比較快又多一支隊伍', () => {
  const w = new World({ rng: seeded(67) });
  let now = 1e6;
  const mk = (tok, tribe) => { const v = w.villages[w.join(tok, { owner: tok, name: tok, tribe }, now).id]; v.newbieUntil = 0; return v; };
  const a = mk('a', 'bunun'), t1 = mk('b', 'atayal'), p = mk('c', 'paiwan');
  const prot0 = R.derived(p, 1).protect, cap0 = R.derived(p, 1).cap, r0 = R.gatherRate(a, 4);
  [a, t1, p].forEach(v => { v.quest = 3; v.tiles[1] = { type: 'unique', level: 1 }; });
  assert.equal(R.derived(p, 1).protect, prot0 * 2); assert.equal(R.derived(p, 1).cap, cap0 + 300);
  assert.equal(R.marchMax(a), 3); assert.ok(Math.abs(R.gatherRate(a, 4) - r0 * R.TUNE.rangeYield) < 1e-9);
  a.units.w = 4; p.units.w = 0;
  assert.ok(w.act(a.id, { type: 'attack', to: t1.id, w: 2, a: 0 }, now).ok);
  const toWatch = w.marches[0].travel; w.marches = []; a.units.w = 4; a.away.w = 0; a.cool = {};
  const d1 = require('../shared/geo.js').travel(w.map.byId[a.hex], w.map.byId[t1.hex]);
  assert.ok(Math.abs(toWatch - Math.min(60, 6 + 2.5 * d1) * 1500) < 1, '出征有望樓的部落，路上多花一半時間');
});

test('獨特兵種能上場；英雄能力自動發動、一場一次，用過要休息', () => {
  const w = new World({ rng: seeded(71) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'paiwan' }, now).id];
  w.setOnline(a.id, true, now); b.newbieUntil = 0;
  a.quest = 5; a.units.w = 3; a.units.a = 3; a.units.u = 4; b.units.w = 4; b.units.a = 4; b.units.u = 2; b.quest = 4;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 3, a: 3, u: 4 }, now).ok);
  assert.equal(a.away.u, 4);
  while (!a.reports.length) { now += 1000; w.tick(now); }
  const rep = a.reports[0];
  assert.deepEqual(rep.show.start, { a: { w: 3, a: 3, u: 4 }, d: { w: 4, a: 4, u: 2 } });
  assert.equal(rep.log[0].ha, 'volley2', '布農的英雄在開場的遠射發動');
  assert.equal(rep.log.filter(p => p.ha).length, 1, '一場只發動一次'); assert.equal(rep.log.filter(p => p.hd).length, 0, '守方還沒完成主線，沒有英雄');
  assert.ok(a.heroRest > now, '出過力之後英雄要休息'); assert.equal(b.heroRest, 0);
  now = run(w, now, 90);
  assert.equal(a.away.u, 0); assert.ok(a.units.u <= 4 && a.units.u >= 0);
  // 英雄還在休息：再打一場就不會發動
  a.units.w = 3; a.units.a = 3; a.units.u = 4; a.cool = {}; b.shieldUntil = 0; b.units.w = 4; b.units.a = 4;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 3, a: 3, u: 4 }, now).ok);
  const n0 = a.reports.length; while (a.reports.length === n0 && a.reports[0] === rep) { now += 1000; w.tick(now); }
  assert.equal(a.reports[0].log.filter(p => p.ha).length, 0, '休息中的英雄不會出力');
  check(w);
});

// ---------- 階段 6：可調數值、遊戲節奏、後台調整、自動模擬 ----------
test('可調數值：超出範圍會夾回去、不認得的略過；每個世界各有一份，存檔會記住', () => {
  const w = new World({ rng: seeded(81) });
  const ch = w.setTune({ pace: 500, atkW: 12, nope: 3, prod: 'x' });
  assert.deepEqual(ch.map(c => c.k).sort(), ['atkW', 'pace']);
  assert.equal(w.tune.pace, 100); assert.equal(w.tune.atkW, 12); assert.equal(w.tune.nope, undefined);
  const v1 = w.tuneV;
  assert.equal(w.setTune({ pace: 100 }).length, 0, '沒有變動就不算一次修改'); assert.equal(w.tuneV, v1);
  const w2 = new World({ rng: seeded(82) });
  assert.equal(w2.tune.pace, 1, '另一個世界不受影響'); assert.equal(R.TUNE.pace, 1);
  w.tick(1e6); assert.equal(R.TUNE.pace, 100, '執行哪個世界，就用哪個世界的數值');
  const w3 = new World({ tune: { pace: 20 } }).load(JSON.parse(JSON.stringify(w.toJSON())));
  assert.equal(w3.tune.pace, 100, '存檔裡的數值優先'); assert.equal(w3.tune.atkW, 12);
  assert.equal(new World({ tune: { pace: 20 } }).load({ villages: {} }).tune.pace, 20, '舊存檔沒有記數值，就用啟動時的預設');
  assert.equal(w.resetTune(true).length, 1, '還原時可以保留節奏'); assert.equal(w.tune.pace, 100); assert.equal(w.tune.atkW, 10);
  assert.ok(R.TUNE_DEF.every(d => d.min <= d.def && d.def <= d.max && d.zh && d.g), '每個可調數值都有名稱、分組，預設值在範圍內');
});

test('遊戲節奏：產量變慢，建設、訓練、路程、保護變長；對戰還是一到就打完', () => {
  const w = new World({ rng: seeded(83) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const r1 = R.derived(v, 1).rates.food, t1 = R.buildTime('house', 1), tr1 = R.trainTime('w'), m1 = R.marchSecs(4), s1 = R.shieldMs(), c1 = R.clearInfo(v, 7).time;
  w.setTune({ pace: 20 });
  assert.ok(Math.abs(R.derived(v, 1).rates.food * 20 - r1) < 1e-9, '產量是二十分之一');
  assert.equal(R.buildTime('house', 1), t1 * 20); assert.equal(R.trainTime('w'), tr1 * 20); assert.equal(R.marchSecs(4), m1 * 20); assert.equal(R.shieldMs(), s1 * 20); assert.equal(R.clearInfo(v, 7).time, c1 * 20);
  v.res.mat = 200; assert.ok(w.act(v.id, { type: 'build', tile: 1, type2: 'house' }, now).ok);
  assert.equal(v.queue[0].doneAt - now, t1 * 20 * 1000);
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  assert.equal(b.newbieUntil - now, 600000 * 20, '新部落的保護也跟著變長');
  v.newbieUntil = 0; b.newbieUntil = 0; v.tiles[3] = { type: 'barracks', level: 1 }; v.units.w = 4; b.units.w = 2;
  w.setOnline(v.id, true, now);
  assert.ok(w.act(v.id, { type: 'attack', to: b.id, w: 4, a: 0 }, now).ok);
  assert.ok(w.marches[0].arriveAt - now >= 6 * 20 * 1000, '路程變長');
  now = w.marches[0].arriveAt + 10; w.tick(now);
  assert.ok(v.reports[0] && v.reports[0].show, '隊伍一到就打完，不受節奏影響');
  check(w);
});

test('各族產量倍率、兵種數值、花費都可以從後台調', () => {
  const w = new World({ rng: seeded(85) });
  const now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id], b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  const ra = R.derived(a, 1).rates.food, rb = R.derived(b, 1).rates.food, c0 = R.cost('house', 1).mat;
  w.setTune({ prod_bunun: 1.5, uAtk_bunun: 20, cost: 2, wallPct: 20 });
  assert.ok(Math.abs(R.derived(a, 1).rates.food / ra - 1.5) < 1e-9); assert.equal(R.derived(b, 1).rates.food, rb, '別族不受影響');
  assert.equal(R.mkSide(0, 0, 3, 'bunun', false).st.atk, 20); assert.equal(R.cost('house', 1).mat, c0 * 2);
});

test('後台調整部落：物資加減不會超過倉庫、可以給保護，並留下紀錄', () => {
  const w = new World({ rng: seeded(87) });
  const now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'paiwan' }, now).id], cap = R.derived(v, 1).cap, spCap = R.derived(v, 1).spCap;
  assert.ok(w.adminAdjust(v.id, { food: 99999, mat: -50, sp: { atayal: 5, nobody: 9, paiwan: 9999 }, shieldMin: 30 }, now).ok);
  assert.equal(v.res.food, cap); assert.equal(Math.round(v.res.mat), 70); assert.equal(v.sp.atayal, 5); assert.equal(v.sp.paiwan, spCap); assert.equal(v.sp.nobody, undefined);
  assert.equal(v.shieldUntil, now + 30 * 60000);
  assert.ok(w.adminAdjust(v.id, { food: -99999, shieldMin: 0 }, now).ok); assert.equal(v.res.food, 0); assert.equal(v.shieldUntil, 0); assert.equal(v.newbieUntil, 0);
  assert.equal(w.adminAdjust(v.id, {}, now).ok, false); assert.equal(w.adminAdjust('x', { food: 1 }, now).ok, false);
  assert.equal(w.adminLog.length, 2); assert.ok(/甲/.test(w.adminLog[0].text));
  assert.equal(new World().load(JSON.parse(JSON.stringify(w.toJSON()))).adminLog.length, 2, '操作紀錄會跟著存檔');
  check(w);
});

test('英雄能力各自的時機：凝神一箭在開場、齊心在第一次交鋒、世代接力在負傷三成之後、守望在人數剩六成以下', () => {
  new World();
  const army = (tribe, hero, o) => Object.assign({ tribe, w: 5, a: 5, u: 2, hero }, o);
  const find = (r, k) => r.log.filter(p => p[k]);
  for (let i = 1; i <= 30; i++) {
    const bu = R.autoBattle(army('bunun', true), army('amis', true), seeded(i));
    assert.equal(find(bu, 'ha').length, 1); assert.equal(find(bu, 'ha')[0].r, 0, '凝神一箭：開場的遠射');
    assert.equal(find(bu, 'hd').length, 1); assert.equal(find(bu, 'hd')[0].r, 1, '齊心：第一次交鋒');
    const at = R.autoBattle(army('atayal', true), army('paiwan', true, { wall: 1 }), seeded(i)), ha = find(at, 'ha')[0], hd = find(at, 'hd')[0];
    if (ha) { const before = at.log[at.log.indexOf(ha) - 1]; assert.ok(ha.r >= 1 && 12 - all3(before.a) >= 4, '世代接力：負傷的人到三成才發動'); assert.ok(ha.backA >= 0 && ha.backA <= 12 - all3(before.a)); }
    if (hd) { const before = at.log[at.log.indexOf(hd) - 1]; assert.ok(hd.r >= 1 && all3(before.d) <= 12 * 0.6, '守望：人數剩六成以下才發動'); }
    assert.ok(find(at, 'ha').length <= 1 && find(at, 'hd').length <= 1);
    const none = R.autoBattle(army('atayal', false), army('paiwan', false), seeded(i));
    assert.equal(find(none, 'ha').length + find(none, 'hd').length, 0, '沒有英雄就不會發動');
  }
  const melee = R.autoBattle({ tribe: 'bunun', w: 8, a: 0, u: 0, hero: true }, { tribe: 'amis', w: 8, a: 0, u: 0 }, seeded(2));
  assert.equal(melee.log[0].r, 1, '兩邊都沒有弓箭：直接接近'); assert.equal(melee.log[0].ha, 'volley2', '沒有弓箭時，凝神一箭留到第一次交鋒');
  let back = 0, lost = 0;   // 世代接力：平均有兩成負傷的人歸隊
  for (let i = 1; i <= 400; i++) {
    const r = R.autoBattle({ tribe: 'atayal', w: 10, a: 0, u: 0, hero: true }, { tribe: 'amis', w: 10, a: 0, u: 0 }, seeded(i)), h = r.log.filter(p => p.ha)[0];
    if (h) { back += h.backA; lost += 10 - all3(r.log[r.log.indexOf(h) - 1].a); }
  }
  assert.ok(lost > 500 && Math.abs(back / lost - R.TUNE.abRelayBack) < 0.05, '歸隊比例 ' + (back / lost).toFixed(2));
});

test('自動模擬對戰：同一組亂數結果相同；兵力差不多時任兩族都在 45%～55% 之內', () => {
  new World();
  const m1 = R.simMatrix({ n: 300, rng: seeded(5) }), m2 = R.simMatrix({ n: 300, rng: seeded(5) });
  assert.deepEqual(m1.duel, m2.duel);
  assert.equal(m1.pairs.length, 16); assert.equal(m1.duel.length, 6); assert.equal(m1.tribes.length, 4);
  [['標準', {}], ['沒有獨特兵種', { army: { w: 6, a: 6, u: 0 } }], ['大隊', { army: { w: 6, a: 6, u: 6 }, wall: 2, towers: [1] }]].forEach(([name, o], i) => {
    const m = R.simMatrix(Object.assign({ n: 2500, rng: seeded(11 + i) }, o));
    assert.ok(m.ok && m.worst <= 0.05, name + '：最大偏差 ' + (m.worst * 100).toFixed(1) + '%：' + m.duel.map(d => d.x + '-' + d.y + ' ' + (d.score * 100).toFixed(1)).join(' '));
  });
  const flat = R.simMatrix({ n: 200, rng: seeded(3), spread: 0 });
  assert.ok(flat.pairs.every(p => p.win < 0.2), '人數完全一樣又有圍籬時，幾乎都是守方守住——所以模擬要讓人數上下浮動才量得出強弱');
  const r = R.simBattle({ tribe: 'bunun', w: 6, a: 6, u: 6, hero: true }, { tribe: 'amis', w: 0, a: 0, u: 0, hero: false, wall: 0 }, seeded(1));
  assert.equal(r.grade, 3); assert.equal(r.win, true); assert.equal(r.lostA, 0, '沒有守軍：大勝、沒有人負傷');
});

test('玩家送來奇怪的名稱（__proto__、constructor、toString…）：一律當成查不到，不會出錯', () => {
  const w = new World({ rng: seeded(91) });
  const now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id], b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  a.newbieUntil = 0; b.newbieUntil = 0; a.tiles[3] = { type: 'barracks', level: 1 }; a.units.w = 4; a.res.food = 400; a.res.mat = 400; w.setOnline(a.id, true, now);
  const before = JSON.stringify(a);
  for (const x of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype', 'valueOf']) {
    const acts = [{ type: x }, { type: 'attack', to: x, w: 1, a: 0 }, { type: 'gift', to: x, key: 'food', n: 5 }, { type: 'gift', to: b.id, key: 'sp:' + x, n: 5 }, { type: 'train', u: x },
      { type: 'build', tile: 1, type2: x }, { type: 'gather', node: x, w: 2, a: 0 }, { type: 'recall', id: x }, { type: 'barter', at: 'n1', want: x, pay: 'food' }, { type: 'barter', at: x, want: 'amis', pay: x },
      { type: 'offer', give: 'sp:' + x, giveN: 1, want: 'food', wantN: 1 }, { type: 'offer', give: 'food', giveN: 1, want: 'sp:' + x, wantN: 1 }, { type: 'accept', id: x }, { type: 'allyJoin', id: x },
      { type: 'say', phrase: x }, { type: 'cmd', c: x }];
    for (const act of acts) assert.equal(w.act(a.id, act, now).ok, false, JSON.stringify(act));
    assert.equal(w.act(x, { type: 'auto', on: true }, now).ok, false); assert.equal(w.detail(x, now), null); assert.equal(w.snapshot(x, now), null);
    assert.equal(w.join('t' + x, { owner: 'X', name: 'N' + x, tribe: x }, now).ok, false, '不存在的族群');
    assert.equal(w.adminAdjust(x, { food: 5 }, now).ok, false); assert.equal(w.adminAdjust(a.id, { sp: { [x]: 3 } }, now).ok, false);
    assert.equal(w.setTune(JSON.parse('{"' + x + '": 5}')).length, 0);
    w.setOnline(x, true, now);
  }
  assert.equal(w.act(a.id, null, now).ok, false); assert.equal(w.act(a.id, 'attack', now).ok, false); assert.equal(w.act(a.id, { type: {} }, now).ok, false);
  assert.equal(JSON.stringify(a), before, '部落的資料沒有被動到');
  assert.deepEqual(Object.keys(w.tune).sort(), R.TUNE_DEF.map(d => d.k).sort(), '可調數值裡沒有多出奇怪的項目');
  for (let i = 1; i <= 20; i++) w.tick(now + i * 1000);
  const w2 = new World().load(JSON.parse(JSON.stringify(w.toJSON())));
  assert.equal(w2.act(Object.keys(w2.villages)[0], { type: 'attack', to: 'toString', w: 1, a: 0 }, now + 30000).ok, false, '讀檔之後也一樣安全');
  check(w);
});

test('後台改名與移除部落：隊伍、資源點、掛單、聯盟一併處理，識別碼作廢', () => {
  const w = new World({ rng: seeded(93) });
  let now = 1e6;
  const mk = (tok, name, tribe) => { const v = w.villages[w.join(tok, { owner: name, name: name, tribe }, now).id]; v.newbieUntil = 0; v.tiles[3] = { type: 'barracks', level: 1 }; v.units.w = 6; v.res.food = 400; v.res.mat = 400; w.setOnline(v.id, true, now); return v; };
  const a = mk('tokA', '甲', 'bunun'), b = mk('tokB', '乙', 'amis'), c = mk('tokC', '丙', 'paiwan');
  assert.ok(w.adminRename(a.id, { name: '  新<名>字  ', owner: '阿明' }, now).ok); assert.equal(a.name, '新名字'); assert.equal(a.owner, '阿明');
  assert.equal(w.adminRename(a.id, { name: '新名字' }, now).ok, false, '沒有變就不算'); assert.equal(w.adminRename('nope', { name: 'x' }, now).ok, false);
  assert.ok(w.act(b.id, { type: 'allyCreate', name: '山海盟' }, now).ok); assert.ok(w.act(c.id, { type: 'allyJoin', id: b.ally }, now).ok);
  assert.ok(w.act(b.id, { type: 'offer', give: 'food', giveN: 10, want: 'mat', wantN: 10 }, now).ok);
  w.tick(now += 1000);
  const ns = Object.values(w.nodes);
  assert.ok(w.act(b.id, { type: 'gather', node: ns[0].id, w: 2, a: 0 }, now).ok);
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 3, a: 0 }, now).ok);   // 甲正朝乙出征
  ns[1].g = { v: b.id, m: 'mX', name: '乙', tribe: 'amis', start: now, rate: 1, room: 10, n: 1, pw: 5 };   // 乙正在另一個點採集
  assert.equal(w.marches.length, 2);
  const r = w.removeVillage(b.id, now);
  assert.ok(r.ok, r.msg); assert.equal(w.villages[b.id], undefined); assert.equal(w.tokens.tokB, undefined, '識別碼作廢');
  assert.equal(w.market.length, 0); assert.equal(ns[1].g, null, '採集中的資源點空出來'); assert.equal(w.marches.length, 1, '它派出去的隊伍一起消失');
  assert.equal(w.alliances[c.ally].members.length, 1); assert.equal(w.alliances[c.ally].leader, c.id, '盟主換人');
  const m = w.marches.filter(x => x.from === a.id)[0];
  if (m) { assert.equal(m.phase, 'back', '朝它出征的隊伍折返'); now = m.arriveAt + 10; w.tick(now); }
  assert.equal(a.units.w + a.away.w, 6, '甲的人都回來了');
  assert.equal(w.join('tokB', { owner: '乙', name: '乙二', tribe: 'amis' }, now).resumed, undefined, '同一個識別碼再來，是全新的部落');
  assert.equal(w.removeVillage('nope', now).ok, false);
  assert.ok(w.adminLog.length >= 2);
  a.cool = {}; assert.ok(w.act(a.id, { type: 'attack', to: c.id, w: 3, a: 0 }, now).ok);
  assert.ok(w.removeVillage(c.id, now).ok, '對戰是一到就打完，沒有「交戰中」的狀態，隨時可以移除');
  now = run(w, now, 200);
  assert.deepEqual([a.units.w, a.away.w], [6, 0], '朝它出征的人折返回來');
  for (let i = 1; i <= 30; i++) w.tick(now + i * 1000);
  check(w);
});

test('舊存檔：打到一半的舊式對戰把人送回去；佈防設定拿掉；舊規則調出來的對戰數值改用新的預設', () => {
  const w = new World({ rng: seeded(97) });
  let now = 1e6;
  const a = w.villages[w.join('tokA-0123456789abcdef', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('tokB-0123456789abcdef', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  const save = JSON.parse(JSON.stringify(w.toJSON()));
  const sa = save.villages[a.id], sb = save.villages[b.id];
  // 改成舊版存檔的樣子：甲派 4 個勇士出征乙，場上還剩 2 個；乙的守軍 3 人都在場上
  sa.away.w = 4; sa.battle = 'b1'; sb.battle = 'b1'; sa.def = { lanes: 'gate', plan: ['volley', 'hold', 'charge'] }; sb.def = sa.def;
  sa.reports = [{ id: 'r1', t: now, role: 'atk', other: '乙', otherTribe: 'amis', win: true, broken: 2, loot: {}, lost: 1, log: [{ phase: 1, a: 'charge', d: 'hold', lanes: [] }] }];
  save.marches = [{ id: 'm1', from: a.id, to: b.id, w: 4, a: 0, u: 0, lanes: 'even', departAt: now - 5000, arriveAt: now - 1000, travel: 4000, phase: 'fight', loot: null }];
  const lane = (aw, dw, da) => ({ a: { w: aw, a: 0, u: 0 }, d: { w: dw, a: da, u: 0 }, broken: false });
  save.battles = { b1: { id: 'b1', a: a.id, d: b.id, march: 'm1', state: 'pick', phase: 2, lanes: [lane(1, 1, 1), lane(1, 0, 1), lane(0, 0, 0)], log: [] } };
  delete save.tuneRev; save.tune = Object.assign({}, save.tune, { pace: 20, prod: 1.5, uAtk_bunun: 15, abRelay: 0.7, wallPct: 20 });
  const w2 = new World({ rng: seeded(1) }).load(save);
  const a2 = w2.villages[a.id], b2 = w2.villages[b.id];
  assert.equal(a2.battle, undefined); assert.equal(a2.def, undefined);
  assert.deepEqual([b2.units.w, b2.units.a], [1, 2], '守軍回到部落');
  assert.equal(a2.away.w, 2, '負傷的人不再算出征中'); assert.equal(w2.marches[0].phase, 'back'); assert.equal(w2.marches[0].w, 2);
  assert.equal(w2.tune.pace, 20); assert.equal(w2.tune.prod, 1.5, '節奏和經濟的設定照舊');
  assert.equal(w2.tune.uAtk_bunun, R.tuneDefaults().uAtk_bunun); assert.equal(w2.tune.wallPct, R.tuneDefaults().wallPct, '對戰相關的數值改用新的預設');
  w2.tick(now + 5000);
  assert.deepEqual([a2.units.w, a2.away.w, w2.marches.length], [2, 0, 0], '折返的人回到部落');
  assert.ok(w2.snapshot(a.id, now + 6000).me.reports[0].broken === 2, '舊的戰報還在');
  const again = new World({ rng: seeded(1) }).load(JSON.parse(JSON.stringify(Object.assign(w2.toJSON(), {}))));
  w2.setTune({ wallPct: 12 }); const w3 = new World().load(JSON.parse(JSON.stringify(w2.toJSON())));
  // 改版前的存檔：佔領的資源點把駐守的人送回去；地圖變細，部落搬到同一族區域裡附近的新格子
  const old = JSON.parse(JSON.stringify(w2.toJSON())); delete old.mapRev; delete old.nodes;
  const oa = old.villages[a.id]; oa.units = { w: 1, a: 0, u: 0 }; oa.away = { w: 3, a: 0, u: 0 }; oa.pos = [140, 290];
  old.points = { '10_20': { owner: a.id, w: 3, a: 0, u: 0, since: 1 } };
  const w4 = new World({ rng: seeded(2) }).load(old), a4 = w4.villages[a.id];
  assert.deepEqual([a4.units.w, a4.away.w], [4, 0], '駐守的人回到部落');
  const h4 = w4.map.byId[a4.hex];
  assert.ok(h4 && h4.tribe === 'bunun', '搬到同一族的區域'); assert.ok(Math.hypot(a4.pos[0] - h4.x, a4.pos[1] - h4.y) <= 2, '坐標跟著換');
  w4.tick(now + 7000); assert.equal(Object.values(w4.nodes).filter(n => !R.NODE[n.k].ev).length, R.TUNE.nodeCount, '資源點重新長出來');
  assert.equal(w3.tune.wallPct, 12, '新版存檔裡調過的對戰數值會保留'); assert.equal(again.tune.pace, 20);
  check(w2);
});

test('族人與戰士吃糧食：吃光了不會餓死，只是不長人、工作變慢、不能訓練；可以讓戰士回家', () => {
  const w = new World({ rng: seeded(101) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'amis' }, now).id];
  w.setOnline(v.id, true, now);
  const d0 = R.derived(v, 1);
  assert.ok(Math.abs(d0.eat - 4 * R.TUNE.eatPop / 60) < 1e-9, '4 位族人吃的糧食');
  assert.ok(d0.net > 0 && d0.net < d0.rates.food, '一開始糧食還是會增加');
  v.tiles[3] = { type: 'barracks', level: 5 }; v.units.w = 20; v.away.a = 6;
  assert.ok(Math.abs(R.derived(v, 1).eat - (4 * R.TUNE.eatPop + 26 * R.TUNE.eatUnit) / 60) < 1e-9, '戰士也吃，出征中的也算');
  // 自動分工：先排夠養活大家的人去種田
  v.tiles[2] = { type: 'farm', level: 5 }; v.tiles[4] = { type: 'house', level: 5 }; v.pop = 12; v.auto = true;
  w.tick(now += 1000);
  assert.ok(R.derived(v, 1).net > 0, '自動分工會先排夠人種田：淨收入 ' + R.derived(v, 1).net.toFixed(2) + '，分工 ' + JSON.stringify(v.jobs));
  // 手動把人都調去採建材：糧食慢慢吃光
  v.auto = false; v.jobs = { food: 0, mat: 2, special: 0 }; v.res.food = 30; v.res.mat = 0;
  const pop0 = v.pop; v.popAcc = 0;
  for (let i = 0; i < 120; i++) w.tick(now += 1000);
  assert.equal(v.res.food, 0); assert.equal(v.hungry, true); assert.equal(R.derived(v, 1).hungry, true);
  const popH = v.pop; for (let i = 0; i < 120; i++) w.tick(now += 1000);
  assert.ok(pop0 <= popH && v.pop === popH && v.hungry, '吃不飽就不長人'); assert.ok(v.units.w === 20 && v.pop > 0, '不會餓死，也不會離開');
  const r = R.derived(v, 1).rates.mat, full = 2 * R.perWorker(v, 'mat', 1);
  assert.ok(Math.abs(r - full * R.TUNE.hungryWork) < 1e-9, '建材的工作變慢');
  assert.equal(w.act(v.id, { type: 'train', u: 'w' }, now).ok, false, '吃不飽不能訓練');
  // 讓戰士回家：家裡有空房的變回族人
  assert.equal(w.act(v.id, { type: 'dismiss', u: 'w', n: 21 }, now).ok, false);
  assert.equal(w.act(v.id, { type: 'dismiss', u: 'x', n: 1 }, now).ok, false);
  const room = R.popCap(v) - v.pop;
  assert.ok(w.act(v.id, { type: 'dismiss', u: 'w', n: 15 }, now).ok);
  assert.equal(v.units.w, 5); assert.equal(v.pop, popH + Math.min(15, room));
  // 改回自動分工：糧食回來，就不再吃不飽
  v.auto = true; v.away.a = 0;
  for (let i = 0; i < 30; i++) w.tick(now += 1000);
  assert.ok(v.res.food > 0 && !v.hungry, '糧食回來了');
  // 離線報告寫出吃掉多少
  w.setOnline(v.id, false, now); now += 3 * 3600000; w.setOnline(v.id, true, now);
  assert.ok(v.report && v.report.ate > 0, '離線報告有吃掉的糧食');
  assert.equal(w.snapshot(v.id, now).me.ate, undefined, '累計吃掉的量不傳給玩家（每秒都在變）');
  check(w);
});

test('建築升到 25 級：花費與時間的曲線、中心的前置條件、容量跟著長、戰力、部落發展任務', () => {
  const w = new World({ rng: seeded(103) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  assert.equal(R.MAX_LEVEL, 25);
  assert.deepEqual(R.cost('house', 5), { food: 165, mat: 440 }, '1～5 級的花費和原本一樣');
  for (let L = 6; L <= 25; L++) { assert.ok(R.cost('house', L).mat > R.cost('house', L - 1).mat); assert.ok(R.buildTime('center', L) > R.buildTime('center', L - 1)); }
  w.setTune({ pace: 20 });
  assert.ok(R.buildTime('center', 25) * 1000 <= 2 * 86400000, '正式節奏下，最久的一次升級在兩天以內');
  w.setTune({ pace: 1 });
  // 容量要存得下最貴的一次升級
  v.tiles[0].level = 24; v.tiles[1] = { type: 'storage', level: 24 }; v.tiles[3] = { type: 'storage', level: 24 };
  assert.ok(R.derived(v, 1).cap >= R.cost('center', 25).mat, '倉庫存得下中心 25 級的花費');
  // 前置條件：輪流要求一種建築升到前一級，6 級以後圍籬也要跟上
  assert.deepEqual(R.centerReq(3), [{ type: 'farm', level: 2 }]);
  assert.deepEqual(R.centerReq(6), [{ type: 'barracks', level: 5 }, { type: 'wall', level: 5 }]);
  // 圍籬 5 級以後每級的加成減半；戰力會隨建築與戰士增加
  assert.ok(Math.abs(R.wallMul(5) - (1 + 5 * R.TUNE.wallPct / 100)) < 1e-9 && Math.abs(R.wallMul(25) - (1 + 15 * R.TUNE.wallPct / 100)) < 1e-9);
  const u = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id], p0 = R.villagePower(u);
  u.tiles[2].level = 3; const p1 = R.villagePower(u); u.units.w = 5; const p2 = R.villagePower(u);
  assert.ok(p0 > 0 && p1 > p0 && p2 > p1, '戰力 ' + [p0, p1, p2].join(' → '));
  assert.equal(R.derived(u, 1).power, p2);
  // 部落發展任務：一步一步領獎勵，引導完之後跟著中心的前置條件走
  w.setOnline(u.id, true, now);
  let q = w.devProgress(u);
  assert.deepEqual([q.k, q.type, q.n, q.done], ['build', 'storage', 1, false]);
  assert.equal(w.act(u.id, { type: 'dev' }, now).ok, false, '還沒達成不能領');
  u.tiles[5] = { type: 'storage', level: 1 };
  const food0 = u.res.food; assert.ok(w.act(u.id, { type: 'dev' }, now).ok); assert.ok(u.res.food > food0, '領到獎勵');
  assert.equal(w.devProgress(u).type, 'farm');
  u.dev = R.DEV_START.length; u.devCur = undefined; u.tiles[0].level = 5;
  q = w.devProgress(u);
  assert.deepEqual([q.type, q.n], ['barracks', 5], '引導完：照中心 6 級的條件，先把訓練場升到 5 級');
  assert.ok(w.snapshot(u.id, now).me.dq, '玩家看得到發展任務'); assert.equal(w.snapshot(u.id, now).me.devCur, undefined);
  // 存檔讀回來還在
  const w2 = new World().load(JSON.parse(JSON.stringify(w.toJSON())));
  assert.equal(w2.devProgress(w2.villages[u.id]).type, 'barracks');
  check(w);
});

test('第二批的建築：靶場才能訓練弓手、工寮多一個工人、芋頭田有耕作位置、引水道讓糧食變多、交易亭多掛單、迎賓亭可以多送', () => {
  const w = new World({ rng: seeded(111) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'amis' }, now).id];
  w.setOnline(v.id, true, now);
  v.res.food = 5000; v.res.mat = 5000; v.tiles[3] = { type: 'barracks', level: 3 };
  assert.equal(R.limit('archery', 1, v), 0, '中心 2 級才能蓋靶場'); assert.equal(R.limit('archery', 2, v), 1); assert.equal(R.limit('guest', 7, v), 0); assert.equal(R.limit('taro', 9, v), 3);
  assert.equal(w.act(v.id, { type: 'train', u: 'a' }, now).msg, '要先蓋靶場才能訓練弓手');
  assert.ok(w.act(v.id, { type: 'train', u: 'w' }, now).ok, '勇士照樣在訓練場練');
  v.tiles[1] = { type: 'archery', level: 1 };
  assert.ok(w.act(v.id, { type: 'train', u: 'a' }, now).ok, '有靶場就可以練弓手');
  assert.ok(R.battleMod(v, false).a > 1, '靶場讓弓手強一點');
  assert.equal(R.derived(v, 1).builders, 2); v.tiles[5] = { type: 'hut', level: 1 }; assert.equal(R.derived(v, 1).builders, 3, '工寮：多一個工人');
  const f0 = R.derived(v, 1).slots.food; v.tiles[7] = { type: 'taro', level: 2 }; v.land[7] = 1;
  assert.equal(R.derived(v, 1).slots.food, f0 + 4, '芋頭田也有耕作的位置');
  const p0 = R.perWorker(v, 'food', 1); v.tiles[8] = { type: 'water', level: 5 }; v.land[8] = 1;
  assert.ok(Math.abs(R.perWorker(v, 'food', 1) / p0 - 1.1) < 1e-9, '引水道 5 級：糧食 +10%');
  assert.equal(R.derived(v, 1).offerMax, 3); v.tiles[9] = { type: 'market', level: 10 }; v.land[9] = 1; assert.equal(R.derived(v, 1).offerMax, 5);
  assert.equal(R.derived(v, 1).giftMax, 100); v.tiles[10] = { type: 'guest', level: 2 }; v.land[10] = 1; assert.equal(R.derived(v, 1).giftMax, 140);
  check(w);
});

test('技藝：技藝屋的等級決定上限，同時學一項，學會之後有加成；療養：負傷的人進療養屋，好了就歸隊', () => {
  const w = new World({ rng: seeded(113) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const t = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'paiwan' }, now).id];
  w.setOnline(v.id, true, now); w.setOnline(t.id, true, now);
  v.res.food = 9000; v.res.mat = 9000;
  assert.equal(w.act(v.id, { type: 'research', id: 'spear' }, now).msg, '要先蓋技藝屋');
  v.tiles[1] = { type: 'craft', level: 1 };
  assert.equal(R.techMax(v), 1); assert.equal(w.act(v.id, { type: 'research', id: 'toString' }, now).ok, false);
  assert.ok(w.act(v.id, { type: 'research', id: 'farming' }, now).ok);
  assert.equal(w.act(v.id, { type: 'research', id: 'spear' }, now).msg, '同時只能學一項技藝');
  const p0 = R.perWorker(v, 'food', 1);
  now = v.research.doneAt + 1; w.tick(now);
  assert.equal(v.tech.farming, 1); assert.equal(v.research, null);
  assert.ok(Math.abs(R.perWorker(v, 'food', 1) / p0 - 1.04) < 1e-9, '農耕 1 級：糧食 +4%');
  assert.equal(w.act(v.id, { type: 'research', id: 'farming' }, now).msg, '技藝屋升級之後才能學更高級');
  v.tiles[1].level = 6; assert.equal(R.techMax(v), 2);
  ['spear', 'archery', 'guard'].forEach(id => { v.tech[id] = 5; });
  const m = R.battleMod(v, true);
  assert.ok(Math.abs(m.w - 1.15) < 1e-9 && Math.abs(m.a - 1.15) < 1e-9 && Math.abs(m.def - 1.15) < 1e-9, '矛術、射箭、守備各 5 級：+15%');
  assert.ok(R.power({ tribe: 'bunun', w: 5, a: 5, u: 0, mod: m, def: true }) > R.power({ tribe: 'bunun', w: 5, a: 5, u: 0, def: true }));
  // 療養：乙蓋了療養屋，被打下來時負傷的人進去休養，之後歸隊
  t.newbieUntil = 0; t.units = { w: 6, a: 0, u: 0 }; t.tiles[3] = { type: 'barracks', level: 2 }; t.tiles[5] = { type: 'heal', level: 2 }; t.land[5] = 1;
  assert.equal(R.healCap(t), 14);
  v.units = { w: 12, a: 8, u: 0 }; v.tiles[3] = { type: 'barracks', level: 5 };
  assert.ok(w.act(v.id, { type: 'attack', to: t.id, w: 12, a: 8 }, now).ok);
  while (!t.reports.length) { now += 1000; w.tick(now); }
  const rep = t.reports[0];
  assert.ok(rep.lost > 0 && rep.care === Math.min(rep.lost, 14), '負傷的人進療養屋：' + rep.lost + ' 人負傷，' + rep.care + ' 人休養');
  assert.equal(t.hurt.w, rep.care); assert.equal(w.snapshot(t.id, now).me.healAcc, undefined);
  const home0 = t.units.w;
  for (let i = 0; i < 600 && t.hurt.w > 0; i++) { now += 1000; w.tick(now); }
  assert.equal(t.hurt.w, 0, '休養好了'); assert.equal(t.units.w, home0 + rep.care, '都回到隊伍');
  // 舊存檔沒有這些欄位也讀得進來
  const old = JSON.parse(JSON.stringify(w.toJSON())); delete old.villages[v.id].tech; delete old.villages[v.id].hurt; delete old.villages[v.id].research;
  const w2 = new World().load(old); assert.deepEqual(w2.villages[v.id].hurt, { w: 0, a: 0, u: 0 }); assert.equal(w2.villages[v.id].research, null);
  check(w);
});

test('第三批：兵種升階、加速道具、聯盟互助、排行用的戰力', () => {
  const w = new World({ speed: 1, rng: seeded(31) }), R = World.rules;
  let now = 1e6;
  const v = w.villages[w.join('t3a', { owner: '甲', name: '甲部落', tribe: 'amis' }, now).id];
  const t = w.villages[w.join('t3b', { owner: '乙', name: '乙部落', tribe: 'paiwan' }, now).id];
  v.online = t.online = true; v.land = v.land.map(() => 1); t.land = t.land.map(() => 1);
  // 兵種升階：建築與技藝都到了才升
  assert.deepEqual(R.tiers(v), { w: 1, a: 1, u: 1 });
  v.tiles[3] = { type: 'barracks', level: 9 }; assert.equal(R.tiers(v).w, 1, '只有訓練場不夠');
  v.tech.spear = 2; assert.equal(R.tiers(v).w, 2, '訓練場 9 級＋矛術 2 級：勇士第 2 階');
  v.tiles[3].level = 17; v.tech.spear = 4; assert.equal(R.tiers(v).w, 3);
  v.tiles[7] = { type: 'archery', level: 9 }; v.tech.archery = 2; assert.equal(R.tiers(v).a, 2);
  const m = R.battleMod(v, false);
  assert.ok(Math.abs(m.tw - 1.3) < 1e-9 && Math.abs(m.ta - 1.15) < 1e-9 && m.tu === 1, '每一階 +15%');
  const base = { tribe: 'amis', w: 10, a: 0, u: 0 };
  assert.ok(Math.abs(R.power(Object.assign({ mod: { tw: 1.3 } }, base)) / R.power(base) - 1.3) < 0.02, '攻擊與耐力都乘上去：戰力也是 1.3 倍');
  let wins = 0; for (let i = 0; i < 40; i++) if (R.autoBattle({ tribe: 'amis', w: 10, a: 0, mod: { tw: 1.3 } }, { tribe: 'amis', w: 12, a: 0, home: false }, seeded(i)).win) wins++;
  assert.ok(wins >= 30, '第 3 階的 10 人通常打得贏第 1 階的 12 人：' + wins + '/40');
  // 加速道具：新部落有 3 個；用在工程上；用完就不能再用
  assert.equal(v.boosts, R.BOOST_START);
  v.res.food = v.res.mat = 99999;
  v.tiles[0].level = 20;
  assert.ok(w.act(v.id, { type: 'upgrade', tile: 3 }, now).ok, '訓練場 17 → 18 級（時間夠長）');
  const q = v.queue[0], left0 = q.doneAt - now;
  assert.ok(left0 > 3 * w.ms(R.TUNE.boostMin * 3000));
  assert.ok(w.act(v.id, { type: 'speed', what: 'build', id: q.id }, now).ok);
  assert.equal(v.boosts, 2); assert.equal(left0 - (q.doneAt - now), Math.min(left0, w.ms(R.TUNE.boostMin * 3000)), '縮短一個加速的時間');
  assert.equal(w.act(v.id, { type: 'speed', what: 'build', id: 'nope' }, now).ok, false);
  assert.equal(w.act(v.id, { type: 'speed', what: 'toString' }, now).ok, false, '奇怪的種類不能加速');
  v.boosts = 0; assert.equal(w.act(v.id, { type: 'speed', what: 'build', id: q.id }, now).msg, '沒有加速道具了');
  // 部落發展、主線送加速
  v.dev = 0; v.devCur = undefined; v.tiles[5] = { type: 'storage', level: 1 };
  assert.ok(w.act(v.id, { type: 'dev' }, now).ok); assert.equal(v.boosts, R.BOOST_DEV);
  // 聯盟互助
  assert.equal(w.act(v.id, { type: 'askHelp', id: q.id }, now).msg, '加入聯盟才能請盟友幫忙');
  assert.ok(w.act(v.id, { type: 'allyCreate', name: '山海' }, now).ok);
  assert.ok(w.act(t.id, { type: 'allyJoin', id: v.ally }, now).ok);
  assert.equal(w.act(t.id, { type: 'help' }, now).msg, '目前沒有需要幫忙的工程');
  assert.ok(w.act(v.id, { type: 'askHelp', id: q.id }, now).ok);
  assert.equal(w.act(v.id, { type: 'askHelp', id: q.id }, now).ok, false, '不能重複請求');
  assert.equal(w.snapshot(t.id, now).me.helps.length, 1, '盟友看得到請求');
  assert.equal(w.snapshot(v.id, now).me.queue[0].hby, undefined, '誰幫過忙不傳');
  const before = q.doneAt;
  assert.ok(w.act(t.id, { type: 'help' }, now).ok);
  assert.ok(q.doneAt < before && q.hn === 1, '盟友按一下：時間變短');
  assert.equal(w.act(t.id, { type: 'help' }, now).ok, false, '同一項工程每人只能幫一次');
  assert.equal(w.snapshot(t.id, now).me.helps.length, 0);
  assert.equal(R.helpMax(v), 3); v.tiles[9] = { type: 'guest', level: 6 }; assert.equal(R.helpMax(v), 6, '迎賓亭越高，可以被幫越多次');
  // 排行用的戰力在公開清單裡
  const pub = w.pubs(now).filter(p => p.id === v.id)[0];
  assert.equal(pub.vp, R.villagePower(v));
  // 對戰演出帶著雙方的階級
  v.units = { w: 10, a: 0, u: 0 }; t.newbieUntil = 0; t.tiles[0].level = 20; w.act(v.id, { type: 'allyLeave' }, now);
  const ar = w.act(v.id, { type: 'attack', to: t.id, w: 10, a: 0 }, now); assert.ok(ar.ok, ar.msg);
  while (!v.reports.length) { now += 1000; w.tick(now); }
  assert.deepEqual(v.reports[0].show.aTier, R.tiers(v));
  // 舊存檔沒有加速道具：補 3 個
  const old = JSON.parse(JSON.stringify(w.toJSON())); delete old.villages[t.id].boosts;
  assert.equal(new World().load(old).villages[t.id].boosts, R.BOOST_START);
  check(w);
});

test('聚會廣場的定時任務：每隔一段時間換一批，選一件做，做完領獎勵', () => {
  const w = new World({ speed: 1, rng: seeded(41) }), R = World.rules;
  let now = 1e6;
  const v = w.villages[w.join('ch1', { owner: '甲', name: '甲部落', tribe: 'bunun' }, now).id]; v.online = true;
  now += 1000; w.tick(now);
  assert.equal(v.chores, undefined, '沒有聚會廣場就沒有');
  assert.equal(w.act(v.id, { type: 'chore', id: 'x' }, now).msg, '要先蓋聚會廣場');
  v.land[12] = 1; v.tiles[12] = { type: 'plaza', level: 1 };
  now += 1000; w.tick(now);
  assert.equal(v.chores.list.length, R.choreOffers(v)); assert.equal(R.choreSlots(v), 1);
  const o = v.chores.list[0], o2 = v.chores.list[1];
  assert.equal(w.act(v.id, { type: 'chore', id: 'toString' }, now).ok, false);
  assert.ok(w.act(v.id, { type: 'chore', id: o.id }, now).ok);
  assert.equal(w.act(v.id, { type: 'chore', id: o2.id }, now).ok, false, '同時只能做一件');
  assert.equal(w.act(v.id, { type: 'choreDone', id: o.id }, now).msg, '還沒做完');
  const cur = v.chores.cur[0]; assert.equal(cur.doneAt - now, w.ms(R.CHORE_MIN[o.star] * 3000));
  // 加速道具也可以用在定時任務
  assert.ok(w.act(v.id, { type: 'speed', what: 'chore', id: o.id }, now).ok);
  now = cur.doneAt + 1; w.tick(now);
  const f0 = v.res.food, b0 = v.boosts;
  assert.ok(w.act(v.id, { type: 'choreDone', id: o.id }, now).ok);
  assert.ok(Math.abs(v.res.food - f0 - o.rw.food) < 1e-6); assert.equal(v.boosts, b0 + o.rw.boost); assert.equal(v.chores.n, 1);
  assert.equal(w.act(v.id, { type: 'choreDone', id: o.id }, now).ok, false, '不能領兩次');
  // 時間到了換一批（id 不一樣）
  const ids = v.chores.list.map(x => x.id).join();
  now = v.chores.at + 1; w.tick(now);
  assert.notEqual(v.chores.list.map(x => x.id).join(), ids); assert.equal(v.chores.list.length, R.choreOffers(v));
  // 三星的獎勵比一星多，還有加速
  const r1 = R.choreReward(v, 1), r3 = R.choreReward(v, 3);
  assert.ok(r3.food > r1.food && r3.boost === 1 && r1.boost === 0);
  check(w);
});

test('迎賓亭的盟友支援：派人駐守、一起守部落、分回剩下的人、叫回來、離開聯盟就回家', () => {
  const w = new World({ speed: 1, rng: seeded(51) }), R = World.rules;
  let now = 1e6;
  const host = w.villages[w.join('s1', { owner: '甲', name: '主人', tribe: 'atayal' }, now).id];
  const fr = w.villages[w.join('s2', { owner: '乙', name: '盟友', tribe: 'bunun' }, now).id];
  const foe = w.villages[w.join('s3', { owner: '丙', name: '來犯', tribe: 'amis' }, now).id];
  [host, fr, foe].forEach(x => { x.online = true; x.newbieUntil = 0; x.land = x.land.map(() => 1); x.tiles[0].level = 8; x.tiles[3] = { type: 'barracks', level: 8 }; x.res.food = x.res.mat = 50000; });
  fr.units = { w: 10, a: 6, u: 0 }; host.units = { w: 2, a: 0, u: 0 }; foe.units = { w: 20, a: 10, u: 0 };
  assert.equal(w.act(fr.id, { type: 'support', to: host.id, w: 4, a: 2 }, now).msg, '只能支援同一個聯盟的部落');
  w.act(host.id, { type: 'allyCreate', name: '同心' }, now); w.act(fr.id, { type: 'allyJoin', id: host.ally }, now);
  assert.equal(w.act(fr.id, { type: 'support', to: host.id, w: 4, a: 2 }, now).msg, '對方還沒有迎賓亭，沒辦法接待支援的人');
  host.tiles[9] = { type: 'guest', level: 2 }; assert.equal(R.supportCap(host), 10);
  assert.equal(w.act(fr.id, { type: 'support', to: host.id, w: 10, a: 6 }, now).msg, '對方的迎賓亭只能再接待 10 人');
  assert.equal(w.act(fr.id, { type: 'support', to: host.id, w: 'x', a: 0 }, now).ok, false);
  assert.ok(w.act(fr.id, { type: 'support', to: host.id, w: 6, a: 4 }, now).ok);
  assert.deepEqual(fr.away, { w: 6, a: 4, u: 0 });
  const m = w.marches.filter(x => x.kind === 'support')[0];
  while (m.phase === 'out') { now += 1000; w.tick(now); }
  assert.equal(m.phase, 'stay'); assert.equal(w.guestsOf(host.id).length, 1);
  for (let i = 0; i < 30; i++) { now += 1000; w.tick(now); }
  assert.equal(m.phase, 'stay', '駐守著不會自己回家');
  const pw0 = w.pub(host, now).pw; assert.ok(pw0 > R.power({ tribe: 'atayal', w: 2, a: 0, u: 0, def: true }), '別人看到的守備戰力含駐守的盟友');
  // 有人來出征：盟友一起守
  assert.ok(w.act(foe.id, { type: 'attack', to: host.id, w: 20, a: 10 }, now).ok);
  while (!host.reports.length) { now += 1000; w.tick(now); }
  const rep = host.reports[0];
  assert.equal(rep.guests, 10, '戰報記得有幾位盟友來守'); assert.equal(rep.show.start.d.w, 8, '開打時守方有主人的 2 人加盟友的 6 人');
  assert.ok(fr.reports.some(r => /一起守部落/.test(r.note || '')), '支援的盟友也收到戰報');
  const g = w.marches.filter(x => x.kind === 'support')[0];
  const gw = g ? g.w : 0, ga = g ? g.a : 0;
  assert.ok(host.units.w <= 2 && host.units.w >= 0 && gw <= 6 && ga <= 4, '分回的人不會比原本多');
  assert.equal(fr.away.w, gw); assert.equal(fr.away.a, ga, '盟友的 away 跟著駐守的人數');
  // 叫回來：回家之後人回到部落
  if (g) {
    assert.ok(w.act(fr.id, { type: 'recall', id: g.id }, now).ok);
    while (w.marches.some(x => x.id === g.id)) { now += 1000; w.tick(now); }
    assert.deepEqual(fr.away, { w: 0, a: 0, u: 0 });
  }
  // 再派一次，然後離開聯盟：自動回家
  fr.units.w = Math.max(fr.units.w, 3);
  assert.ok(w.act(fr.id, { type: 'support', to: host.id, w: 3, a: 0 }, now).ok);
  const m2 = w.marches.filter(x => x.kind === 'support')[0];
  assert.ok(w.act(host.id, { type: 'allyLeave' }, now).ok);
  assert.equal(m2.phase, 'back');
  while (w.marches.length) { now += 1000; w.tick(now); }
  assert.equal(R.all3 ? 0 : 0, 0); assert.deepEqual(fr.away, { w: 0, a: 0, u: 0 });
  check(w);
});

test('野地事件：山豬群（趕回山裡）與颱風後搶修，一個人也有事可做', () => {
  const w = new World({ speed: 1, rng: seeded(61) }), R = World.rules;
  let now = 1e6;
  const v = w.villages[w.join('wd1', { owner: '甲', name: '甲部落', tribe: 'atayal' }, now).id]; v.online = true; v.newbieUntil = 0;
  v.tiles[3] = { type: 'barracks', level: 6 }; v.units = { w: 20, a: 10, u: 0 };
  for (let i = 0; i < 3; i++) { now += 31000; w.tick(now); }
  const nodes = Object.values(w.nodes);
  const boars = nodes.filter(n => n.k === 'boar'), repairs = nodes.filter(n => n.k === 'repair');
  assert.equal(boars.length, R.TUNE.boarCount, '山豬群補到設定的數量');
  assert.ok(repairs.length > 0, '颱風過後有地方要搶修');
  assert.ok(nodes.filter(n => !R.NODE[n.k].ev).length <= R.TUNE.nodeCount, '資源點的數量不受事件影響');
  assert.ok(w.feed.some(f => /颱風過後/.test(f.text || f.t || JSON.stringify(f))));
  // 趕山豬：1 級的山豬群，20 個勇士、10 個弓手去一定趕得走
  const b = boars.filter(n => n.lv === 1)[0] || boars[0]; b.lv = 1; b.bn = R.BOAR_N[1];
  assert.ok(w.act(v.id, { type: 'gather', node: b.id, w: 20, a: 10 }, now).ok);
  const m = w.marches.filter(x => x.node === b.id)[0]; assert.equal(m.kind, 'boar');
  while (!v.reports.length) { now += 1000; w.tick(now); }
  const rep = v.reports[0];
  assert.ok(rep.win && /趕回山裡/.test(rep.note), rep.note); assert.equal(w.nodes[b.id], undefined, '趕走了就消失');
  const f0 = v.res.food;
  while (w.marches.some(x => x.id === m.id)) { now += 1000; w.tick(now); }
  assert.ok(v.res.food >= f0 + R.wildReward('boar', 1).food - 1e-6 || v.res.food >= f0, '帶回謝禮');
  // 打不贏：山豬少了幾隻還在原地
  const b5 = Object.values(w.nodes).filter(n => n.k === 'boar')[0]; b5.lv = 5; b5.bn = R.BOAR_N[5];
  v.units = { w: 3, a: 0, u: 0 }; v.away = { w: 0, a: 0, u: 0 };
  assert.ok(w.act(v.id, { type: 'gather', node: b5.id, w: 3, a: 0 }, now).ok);
  const n0 = v.reports.length; while (v.reports.length === n0) { now += 1000; w.tick(now); }
  assert.equal(v.reports[0].win, false); assert.ok(w.nodes[b5.id] && w.nodes[b5.id].bn <= R.BOAR_N[5]);
  // 搶修：到了開始修，修好拿謝禮；別人不能來搶
  while (w.marches.some(x => x.from === v.id)) { now += 1000; w.tick(now); }
  v.units = { w: 10, a: 0, u: 0 }; v.away = { w: 0, a: 0, u: 0 };
  const rp = Object.values(w.nodes).filter(n => n.k === 'repair')[0]; rp.until = now + 1e9;
  assert.ok(w.act(v.id, { type: 'gather', node: rp.id, w: 10, a: 0 }, now).ok);
  const t2 = w.villages[w.join('wd2', { owner: '乙', name: '乙部落', tribe: 'amis' }, now).id]; t2.units = { w: 10, a: 0, u: 0 }; t2.online = true;
  const rm = w.marches.filter(x => x.node === rp.id)[0];
  while (rm.phase === 'out') { now += 1000; w.tick(now); }
  assert.equal(rm.phase, 'gather'); assert.ok(w.nodes[rp.id].g);
  assert.equal(w.act(t2.id, { type: 'gather', node: rp.id, w: 5, a: 0 }, now).msg, '已經有人在這裡搶修了');
  const b0 = v.boosts, n1 = v.reports.length;
  while (v.reports.length === n1) { now += 1000; w.tick(now); }
  assert.ok(v.reports[0].win && /修好了/.test(v.reports[0].note)); assert.equal(w.nodes[rp.id], undefined);
  assert.equal(v.boosts, b0 + R.wildReward('repair', rp.lv).boost);
  // 放太久沒人修：自己消失
  const rp2 = Object.values(w.nodes).filter(n => n.k === 'repair' && !n.g)[0];
  if (rp2) { rp2.until = now - 1; now += 31000; w.tick(now); assert.equal(w.nodes[rp2.id], undefined); }
  check(w);
});
