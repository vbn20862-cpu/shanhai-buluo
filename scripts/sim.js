/* 自動模擬對戰：列出各族互打的勝率，用來檢查平衡（目標是任兩族之間落在 45%～55%）。
 * 用法：npm run sim            每一組打 6000 場（六族有 15 組、6 種情境，場數少的話運氣的起伏會蓋過真正的強弱）
 *       npm run sim -- 5000    每一組打 5000 場
 * 對戰是自動的，人數完全相同時幾乎都是戰力高的一方贏，所以每一場雙方的人數各自在基準的上下浮動三成，量的是「兵力差不多時誰比較常贏」。
 * 用的是 shared/world.js 裡的預設數值；線上世界調過的數值，請到後台的「模擬對戰」看。 */
const World = require('../shared/world.js'), Tribes = require('../shared/tribes.js'), R = World.rules;
const n = Number(process.argv[2]) || 6000, ids = Tribes.playable().map(t => t.id), zh = id => Tribes.get(id).zh.replace('族', '');
const pct = x => (x * 100).toFixed(1) + '%';
const CASES = [
  ['標準：勇士、弓手、獨特兵種各約 4 人，圍籬 1 級', {}],
  ['沒有獨特兵種：勇士、弓手各約 6 人', { army: { w: 6, a: 6, u: 0 } }],
  ['獨特兵種為主：勇士 2、弓手 2、獨特兵種約 8 人', { army: { w: 2, a: 2, u: 8 } }],
  ['大隊：各約 6 人，圍籬 2 級、瞭望台 1 座', { army: { w: 6, a: 6, u: 6 }, wall: 2, towers: [1] }],
  ['勇士為主：勇士約 8、弓手 3、獨特兵種 3', { army: { w: 8, a: 3, u: 3 } }],
  ['弓手為主、沒有圍籬：勇士 3、弓手約 8、獨特兵種 3', { army: { w: 3, a: 8, u: 3 }, wall: 0 }],
  ['英雄都是 5 級：勇士、弓手、獨特兵種各約 4 人，圍籬 1 級', { heroLv: 5 }]
];
let allOk = true;
CASES.forEach(([title, o]) => {
  const m = R.simMatrix(Object.assign({ n }, o));
  console.log('\n【' + title + '】每一組 ' + m.n + ' 場，進攻方平均勝率 ' + pct(m.base));
  console.log('攻＼守  ' + ids.map(i => zh(i).padStart(4)).join('  '));
  ids.forEach(a => console.log(zh(a).padEnd(6) + ids.map(d => pct(m.pairs.find(p => p.a === a && p.d === d).win).padStart(6)).join(' ')));
  console.log('兩族之間：' + m.duel.map(d => zh(d.x) + '對' + zh(d.y) + ' ' + pct(d.score)).join('、'));
  console.log('最大偏差 ' + pct(m.worst) + (m.ok ? '（在目標範圍內）' : '（超出 45%～55%）'));
  if (!m.ok) allOk = false;
});
console.log(allOk ? '\n每一種情境的兩兩勝率都在 45%～55% 之內。' : '\n有組合超出 45%～55%，需要調整數值。');
