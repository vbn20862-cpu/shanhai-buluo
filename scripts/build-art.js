/* 把 art/ 裡的美術素材（Claude Design 匯出的 SVG）打包成 public/assets.js，給遊戲使用。
 * 用法：npm run build:art（換了 art/ 裡的檔案之後要跑一次，產生的 public/assets.js 要一起提交）
 *
 * 做三件事：
 * 1. 檢查安全：素材是外來的檔案，含有程式、事件屬性、外部連結的一律拒收。
 * 2. 把顏色先算好：原檔用 CSS 變數和 color-mix 算明暗，這裡依每個檔案的預設色算成固定色碼寫進圖形，
 *    舊一點的手機瀏覽器（不支援 color-mix）也能正常顯示，也不用把樣式表塞進網頁。
 * 3. 圖層的 id（ground／shadow／body／deco）改成 class（ly-…），同一個網頁裡放很多棟建築才不會有重複的 id。 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const BAD = /<script|javascript:|\son[a-z]+\s*=|<foreignObject|@import|<iframe|<!ENTITY|<!DOCTYPE|<image|<use|href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i;

function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); }
function toHex(rgb) { return '#' + rgb.map(x => ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2)).join('').toUpperCase(); }
function mix(a, b, p) { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v * (1 - p) + y[i] * p)); }   // color-mix(in srgb, a, b p%)

function building(file) {
  const src = fs.readFileSync(file, 'utf8'), name = path.basename(file, '.svg');
  if (BAD.test(src)) throw new Error(name + '：含有不允許的內容（程式、事件或外部連結），沒有收進來');
  const head = /<svg\b([^>]*)>/.exec(src); if (!head) throw new Error(name + '：不是 SVG');
  if (!/viewBox="-80 -140 160 180"/.test(head[1])) throw new Error(name + '：畫布不是約定的 -80 -140 160 180');
  const style = (/<style>([\s\S]*?)<\/style>/.exec(src) || [0, ''])[1];
  const vars = {}; (/svg\.[\w-]+\{([^}]*)\}/.exec(style) || [0, ''])[1].split(';').forEach(kv => { const m = /^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*$/.exec(kv); if (m) vars[m[1]] = m[2]; });
  const cls = {};   // class 名稱 → [屬性, 色碼]
  style.replace(/\.([fs])-([\w-]+)\{(fill|stroke):([^}]*)\}/g, (all, kind, n, prop, val) => {
    let m = /^var\((--[\w-]+)\)$/.exec(val.trim()), color = null;
    if (m) color = vars[m[1]];
    else if ((m = /^color-mix\(in srgb,\s*var\((--[\w-]+)\),\s*(#[0-9a-fA-F]{3,6})\s+([\d.]+)%\)$/.exec(val.trim()))) color = vars[m[1]] && mix(vars[m[1]], m[2], +m[3] / 100);
    if (!color) throw new Error(name + '：看不懂的顏色規則 ' + all);
    cls[kind + '-' + n] = [prop, toHex(hex(color))];
  });
  let body = src.slice(src.indexOf('</style>') + 8).replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>/g, '');
  body = body.replace(/\sclass="([^"]*)"/g, (all, list) => {   // 顏色的 class 換成固定的 fill／stroke；其他 class 留著
    let attrs = '', keep = [];
    list.split(/\s+/).filter(Boolean).forEach(c => { if (cls[c]) attrs += ' ' + cls[c][0] + '="' + cls[c][1] + '"'; else keep.push(c); });
    return attrs + (keep.length ? ' class="' + keep.join(' ') + '"' : '');
  });
  body = body.replace(/\sid="(ground|shadow|body|deco)"/g, ' data-ly="$1"').replace(/\sid="[^"]*"/g, '');
  body = body.replace(/\sclass="([^"]*)"/g, (all, list) => ' class="' + list + '"').replace(/ data-ly="(\w+)"( class="([^"]*)")?/g, (all, ly, c, list) => ' class="ly-' + ly + (list ? ' ' + list : '') + '"');
  if (/class="[fs]-/.test(body) || /var\(--|color-mix/.test(body)) throw new Error(name + '：還有沒換掉的顏色變數');
  const title = (/<title>([\s\S]*?)<\/title>/.exec(src) || [0, ''])[1].trim();
  return { name, h: +(/data-height="(\d+)"/.exec(head[1]) || [0, 60])[1], title, body: body.replace(/>\s+</g, '><').trim() };
}
function icon(file) {
  const src = fs.readFileSync(file, 'utf8'), name = path.basename(file, '.svg').replace(/^icon-/, '');
  if (BAD.test(src)) throw new Error('圖示 ' + name + '：含有不允許的內容');
  if (!/viewBox="0 0 24 24"/.test(src)) throw new Error('圖示 ' + name + '：畫布不是 0 0 24 24');
  return { name, body: src.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/g, '').trim() };
}

const bdir = path.join(root, 'art/buildings'), idir = path.join(root, 'art/icons');
const B = fs.readdirSync(bdir).filter(f => f.endsWith('.svg')).sort().map(f => building(path.join(bdir, f)));
const I = fs.readdirSync(idir).filter(f => f.endsWith('.svg')).sort().map(f => icon(path.join(idir, f)));
const out = { building: {}, height: {}, icon: {} };
B.forEach(b => { out.building[b.name] = b.body; out.height[b.name] = b.h; });
I.forEach(i => { out.icon[i.name] = i.body; });
const js = '/* 這個檔案是 npm run build:art 從 art/ 產生的，不要手動修改。\n * building：每棟建築的圖形（原點在佔地中心，畫布 -80 -140 160 180）；height：建築高度；icon：圖示（畫布 24×24，顏色跟著文字） */\n' +
  'window.ShanhaiArt = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(root, 'public/assets.js'), js);
console.log('已產生 public/assets.js：' + B.length + ' 棟建築、' + I.length + ' 個圖示，' + Math.round(js.length / 1024) + ' KB');
