/* 把 art/ 裡的美術素材（Claude Design 匯出的 SVG）打包成 public/assets.js，給遊戲使用。
 * 用法：npm run build:art（換了 art/ 裡的檔案之後要跑一次，產生的 public/assets.js 要一起提交）
 *
 * 做三件事：
 * 1. 檢查安全：素材是外來的檔案，含有程式、事件屬性、外部連結的一律拒收。
 * 2. 把顏色先算好：原檔用 CSS 變數和 color-mix 算明暗，這裡依每個檔案的預設色算成固定色碼寫進圖形，
 *    舊一點的手機瀏覽器（不支援 color-mix）也能正常顯示，也不用把樣式表塞進網頁。
 * 3. 圖層的 id（ground、shadow、body、deco、band、weapon…）改成 class（ly-…），同一個網頁裡放很多份才不會有重複的 id。
 *
 * 收哪些資料夾（每一類的畫布是約定好的，不合就拒收）：
 *   buildings/、site/ 建築與建地（-80 -140 160 180）  icons/ 圖示（0 0 24 24）
 *   people/ 人物（-30 -70 60 80；英雄 -50 -70 100 80）  nature/ 樹木與地景（-40 -100 80 110；大樹 -70 -170 140 180）
 *   battlefield/ 對戰的背景（0 0 1000 420，前景 #front 分開存，要蓋在人物上面）  fx/ 小特效（-16 -16 32 32）  logo/ 標誌
 *   scenes/、mockup/、patterns/ 只是參考，不打包。
 *
 * 產生兩種檔案（各族的建築每 5 級換一次外觀，全部加起來很大，不能讓玩家一開始就全部下載）：
 *   public/assets.js        共用：圖示、特效、標誌、建地，以及每一族 1 級的中心建築（地圖上用）。一開始就載入
 *   public/art/族群.js      各族：那一族所有建築的各級外觀、人物、樹木、對戰背景。用到那一族才載入（自己的族群、拜訪、對戰）
 * 單機預覽版（npm run build:solo）會把全部包進去。 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const BAD = /<script|javascript:|\son[a-z]+\s*=|<foreignObject|@import|<iframe|<!ENTITY|<!DOCTYPE|<image|<use|href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i;

function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); }
function toHex(rgb) { return '#' + rgb.map(x => ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2)).join('').toUpperCase(); }
function mix(a, b, p) { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v * (1 - p) + y[i] * p)); }   // color-mix(in srgb, a, b p%)

/* 讀一個 SVG，回傳 { name, vb 畫布, h 高度, body 去掉外框的內容 }。vbs：允許的畫布 */
function convert(file, vbs) {
  const src = fs.readFileSync(file, 'utf8'), name = path.basename(file, '.svg');
  if (BAD.test(src)) throw new Error(name + '：含有不允許的內容（程式、事件或外部連結），沒有收進來');
  const head = /<svg\b([^>]*)>/.exec(src); if (!head) throw new Error(name + '：不是 SVG');
  const vb = (/viewBox="([^"]+)"/.exec(head[1]) || [0, ''])[1];
  if (vbs.indexOf(vb) < 0) throw new Error(name + '：畫布 ' + vb + ' 不是約定的 ' + vbs.join(' 或 '));
  const style = (/<style>([\s\S]*?)<\/style>/.exec(src) || [0, ''])[1];
  // 變數：基色（#色碼），或混色的份量（#色碼 百分比，例如 --D:#26304A 30%）
  const vars = {}, mixes = {}; (/svg(?:\.[\w-]+)?\{([^}]*)\}/.exec(style) || [0, ''])[1].split(';').forEach(kv => {
    let m = /^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*$/.exec(kv); if (m) { vars[m[1]] = m[2]; return; }
    m = /^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s+([\d.]+)%\s*$/.exec(kv); if (m) mixes[m[1]] = [m[2], +m[3] / 100];
  });
  const cls = {};   // class 名稱 → [屬性, 色碼]
  style.replace(/\.([fs])-([\w-]+)\{(fill|stroke):([^}]*)\}/g, (all, kind, n, prop, val) => {
    let m = /^var\((--[\w-]+)\)$/.exec(val.trim()), color = null;
    if (m) color = vars[m[1]];
    else if ((m = /^color-mix\(in srgb,\s*var\((--[\w-]+)\),\s*(#[0-9a-fA-F]{3,6})\s+([\d.]+)%\)$/.exec(val.trim()))) color = vars[m[1]] && mix(vars[m[1]], m[2], +m[3] / 100);
    else if ((m = /^color-mix\(in srgb,\s*var\((--[\w-]+)\),\s*var\((--[\w-]+)\)\)$/.exec(val.trim())) && mixes[m[2]]) color = vars[m[1]] && mix(vars[m[1]], mixes[m[2]][0], mixes[m[2]][1]);
    if (!color) throw new Error(name + '：看不懂的顏色規則 ' + all);
    cls[kind + '-' + n] = [prop, toHex(hex(color))];
  });
  let body = src.slice(src.indexOf('>', head.index) + 1).replace(/<style>[\s\S]*?<\/style>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>/g, '');
  body = body.replace(/\sclass="([^"]*)"/g, (all, list) => {   // 顏色的 class 換成固定的 fill／stroke；其他 class 留著
    let attrs = '', keep = [];
    list.split(/\s+/).filter(Boolean).forEach(c => { if (cls[c]) attrs += ' ' + cls[c][0] + '="' + cls[c][1] + '"'; else keep.push(c); });
    return attrs + (keep.length ? ' class="' + keep.join(' ') + '"' : '');
  });
  // 圖層的 id 改成 class；<mask> 的 id 有被 url(#…) 用到，留著（每個檔案的名字不同，不會撞）
  body = body.replace(/<(\w+)([^>]*?)\sid="([^"]*)"/g, (all, tag, mid, id) => tag === 'mask' || tag === 'clipPath' || tag === 'linearGradient' || tag === 'radialGradient' ? all : '<' + tag + mid + ' data-ly="' + id + '"');
  body = body.replace(/ data-ly="([\w-]+)"([^>]*?)( class="([^"]*)")?(?=[\s/>])/g, (all, ly, mid, c, list) => mid + ' class="ly-' + ly + (list ? ' ' + list : '') + '"');
  if (/data-ly=/.test(body)) throw new Error(name + '：圖層的名稱有看不懂的寫法');
  if (/class="[fs]-/.test(body) || /var\(--|color-mix/.test(body)) throw new Error(name + '：還有沒換掉的顏色變數');
  if (/svg \*\{[^}]*stroke-linecap:round/.test(style)) body = '<g stroke-linecap="round" stroke-linejoin="round">' + body + '</g>';   // 原檔用 CSS 讓所有線條圓頭圓角，拿掉樣式表之後改用屬性
  return { name, vb, h: +(/data-height="(\d+)"/.exec(head[1]) || [0, 60])[1], body: body.replace(/>\s+</g, '><').trim() };
}
/* 對戰背景：最外層的 <g class="ly-front"> 拿出來另外存，畫面上要疊在人物上面 */
function splitFront(body, name) {
  const i = body.indexOf('<g class="ly-front'); if (i < 0) throw new Error(name + '：找不到前景圖層 #front');
  let depth = 0, re = /<(\/?)g\b[^>]*?(\/?)>/g, m, end = -1; re.lastIndex = i;
  while ((m = re.exec(body))) { if (m[2]) continue; depth += m[1] ? -1 : 1; if (!depth) { end = re.lastIndex; break; } }
  if (end < 0) throw new Error(name + '：前景圖層沒有結尾');
  return { back: body.slice(0, i) + body.slice(end), front: body.slice(i, end) };
}
function files(dir) { const d = path.join(root, 'art', dir); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.svg')).sort().map(f => path.join(d, f)) : []; }

const BLD = '-80 -140 160 180';
const TRIBES = ['atayal', 'bunun', 'amis', 'paiwan'];
function tribeOf(name) { const t = name.split('-')[0]; return TRIBES.indexOf(t) >= 0 ? t : null; }
const core = { building: {}, height: {}, icon: {}, people: {}, nature: {}, field: {}, fx: {}, logo: {} };
const packs = {}; TRIBES.forEach(t => { packs[t] = { tribe: t, building: {}, height: {}, people: {}, nature: {}, field: {} }; });
const count = { building: 0, people: 0, nature: 0, field: 0 };
files('buildings').concat(files('site')).forEach(f => {
  const b = convert(f, [BLD]), t = tribeOf(b.name), into = !t || b.name === t + '-center' ? core : packs[t];   // 建地與 1 級的中心建築放共用
  into.building[b.name] = b.body; into.height[b.name] = b.h; count.building++;
});
files('icons').forEach(f => { const b = convert(f, ['0 0 24 24']); core.icon[b.name.replace(/^icon-/, '')] = b.body; });
files('people').forEach(f => { const b = convert(f, ['-30 -70 60 80', '-50 -70 100 80']); packs[tribeOf(b.name)].people[b.name] = b.body; count.people++; });
files('nature').forEach(f => { const b = convert(f, ['-40 -100 80 110', '-70 -170 140 180']); packs[tribeOf(b.name)].nature[b.name] = b.body; count.nature++; });
files('battlefield').forEach(f => { const b = convert(f, ['0 0 1000 420']), t = b.name.replace(/-battlefield$/, ''); packs[t].field[t] = splitFront(b.body, b.name); count.field++; });
files('fx').forEach(f => { const b = convert(f, ['-16 -16 32 32']); core.fx[b.name.replace(/^fx-/, '')] = b.body; });
files('logo').forEach(f => { const b = convert(f, ['0 0 288 64', '0 0 512 512']); core.logo[b.name] = { vb: b.vb, body: b.body }; });
const head = '/* 這個檔案是 npm run build:art 從 art/ 產生的，不要手動修改。\n' +
  ' * building：建築與建地（原點在佔地中心，畫布 -80 -140 160 180）；height：建築高度；icon：圖示（24×24，顏色跟著文字）；\n' +
  ' * people：人物（原點在腳底，面向右）；nature：樹木與地景（原點在底部中央）；field：對戰背景（back 背景、front 蓋在人物上面的前景）；fx：小特效；logo：標誌 */\n';
const js = head + 'window.ShanhaiArt = ' + JSON.stringify(core) + ';\n';
fs.writeFileSync(path.join(root, 'public/assets.js'), js);
fs.mkdirSync(path.join(root, 'public/art'), { recursive: true });
const sizes = TRIBES.map(t => {
  const pjs = head + '(window.ShanhaiArtAdd || function (p) { (window.ShanhaiArtQueue = window.ShanhaiArtQueue || []).push(p); })(' + JSON.stringify(packs[t]) + ');\n';
  fs.writeFileSync(path.join(root, 'public/art/' + t + '.js'), pjs);
  return t + ' ' + Math.round(pjs.length / 1024) + ' KB';
});
console.log('已產生 public/assets.js（共用，' + Math.round(js.length / 1024) + ' KB）與各族的 public/art/：' + sizes.join('、') + '。建築與建地 ' + count.building + '、人物 ' + count.people + '、樹木與地景 ' + count.nature + '、對戰背景 ' + count.field);
