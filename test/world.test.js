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

test('出征：勝利帶回物資、對方獲得保護；同盟不能互打', () => {
  const w = new World({ speed: 1, rng: seeded(3) });
  let now = 1e6;
  const a = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'bunun' }, now).id];
  const b = w.villages[w.join('b', { owner: 'B', name: '乙', tribe: 'amis' }, now).id];
  a.online = b.online = true;
  a.units.w = 6; b.res.food = 500; b.res.mat = 500; b.sp.amis = 10;
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 0 }, now).ok, false, '新手保護中不能被出征');
  b.newbieUntil = 0;
  assert.ok(w.act(a.id, { type: 'allyCreate', name: '山海盟' }, now).ok);
  assert.ok(w.act(b.id, { type: 'allyJoin', id: a.ally }, now).ok);
  assert.equal(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 0 }, now).ok, false, '同盟不能互打');
  assert.ok(w.act(b.id, { type: 'allyLeave' }, now).ok);
  const food0 = a.res.food;
  assert.ok(w.act(a.id, { type: 'attack', to: b.id, w: 6, a: 0 }, now).ok);
  assert.equal(a.units.w, 0); assert.equal(a.away.w, 6);
  for (let i = 0; i < 140; i++) { now += 1000; w.tick(now); }
  assert.equal(w.marches.length, 0, 'march finished');
  assert.equal(a.units.w, 6, 'all warriors home (undefended target)'); assert.equal(a.away.w, 0);
  assert.ok(a.res.food > food0 + 50, 'loot arrived');
  assert.ok(a.sp.amis >= 3, 'specialty looted');
  assert.ok(b.shieldUntil > now - 140000 && a.wins === 1 && a.reports.length === 1 && b.reports.length === 1);
  check(w);
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

test('戰鬥：圍籬與瞭望台能擋下小隊', () => {
  const r = World.rules.battle({ w: 3, a: 0 }, { w: 2, a: 2, wallHp: 160, towers: [2] }, seeded(9));
  assert.equal(r.win, false);
  const r2 = World.rules.battle({ w: 12, a: 6 }, { w: 1, a: 1, wallHp: 80, towers: [1] }, seeded(9));
  assert.equal(r2.win, true);
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

test('部落中心升到三級要用特產，材料不夠時不會白扣', () => {
  const w = new World({ rng: seeded(13) });
  let now = 1e6;
  const v = w.villages[w.join('a', { owner: 'A', name: '甲', tribe: 'paiwan' }, now).id];
  v.tiles[0].level = 2; v.res.food = 1000; v.res.mat = 100; v.sp.paiwan = 5;
  assert.equal(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok, false);
  assert.equal(v.sp.paiwan, 5, '失敗時特產要還在');
  v.res.mat = 1000;
  assert.ok(w.act(v.id, { type: 'upgrade', tile: 0 }, now).ok);
  assert.equal(v.sp.paiwan || 0, 0);
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
