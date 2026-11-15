/* 山海部落 — 畫面繪製（全部用程式畫出，沒有外部圖檔；之後可以整組換成畫師的作品）
 * 圖樣只用一般的幾何形狀，不使用各族專屬或具身分意義的紋樣。 */
window.Art = (function () {
  'use strict';
  var R = World.rules, INK = '#14212A', CREAM = '#F2EAD6';

  function shade(hex, p) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, t = p < 0 ? 0 : 255, a = Math.abs(p) / 100;
    r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  var ICONS = {
    food: '<path d="M8 15V5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><g fill="currentColor"><ellipse cx="8" cy="3" rx="1.6" ry="2.2"/><ellipse cx="5.2" cy="6.2" rx="1.5" ry="2" transform="rotate(-32 5.2 6.2)"/><ellipse cx="10.8" cy="6.2" rx="1.5" ry="2" transform="rotate(32 10.8 6.2)"/><ellipse cx="5.4" cy="10" rx="1.4" ry="1.9" transform="rotate(-32 5.4 10)"/><ellipse cx="10.6" cy="10" rx="1.4" ry="1.9" transform="rotate(32 10.6 10)"/></g>',
    mat: '<g fill="currentColor"><rect x="1.5" y="9.2" width="13" height="4.6" rx="2.3"/><rect x="3.5" y="3.6" width="9" height="4.6" rx="2.3"/></g>',
    sp: '<path d="M2 6.5h12l-1.6 7.5H3.6z" fill="currentColor"/><path d="M4.4 6.5a3.6 3.6 0 0 1 7.2 0" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    pop: '<g fill="currentColor"><circle cx="8" cy="4.2" r="2.7"/><path d="M2.8 15c0-3.6 2.3-6 5.2-6s5.2 2.4 5.2 6z"/></g>',
    army: '<path d="M2.5 14 11 5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M14.6 1.4 13.7 6.9 9.1 2.3z" fill="currentColor"/>',
    star: '<path d="M8 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="currentColor"/>',
    power: '<path d="M8 1.5 14 6 11.6 14H4.4L2 6z" fill="currentColor"/>',
    build: '<path d="M3 13.5 9.5 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 3.2 12.8 8l1.6-1.6L9.6 1.6z" fill="currentColor"/>',
    alliance: '<path d="M3 15V2M9 15V4" stroke="currentColor" stroke-width="1.4"/><path d="M3.6 2.4h5v3.6h-5zM9.6 4.4h5v3.6h-5z" fill="currentColor"/>',
    map: '<path d="M1.5 3.5 6 2l4 1.6 4.5-1.6v10.5L10 14l-4-1.6-4.5 1.6z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 2v10.4M10 3.6V14" stroke="currentColor" stroke-width="1.2"/>',
    level: '<path d="M2 14h12V3h-3.5v3.5H7V10H2z" fill="currentColor"/>',
    heal: '<path d="M3 14C2 8 5 3 13.5 2c.4 7-3.4 11.6-9.4 12.2z" fill="currentColor"/><path d="M3 14 1.6 15.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    flag: '<path d="M3.2 15V1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M4.2 2.4h9.3l-2.6 3 2.6 3H4.2z" fill="currentColor"/>',
    shield: '<path d="M8 1.2 14 3.5v4.3c0 3.4-2.4 5.9-6 7-3.6-1.1-6-3.6-6-7V3.5z" fill="currentColor"/>',
    fire: '<path d="M8 1.2c3.4 3 4.6 5.6 4.6 8a4.6 4.6 0 0 1-9.2 0c0-1.5.6-2.8 1.7-3.9.2 1.3.8 2.1 1.6 2.4C6.4 5.4 6.8 3.2 8 1.2z" fill="currentColor"/><path d="M2.5 14.6h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    book: '<path d="M2 3.2c2-.9 4-.9 6 .2 2-1.1 4-1.1 6-.2v9.6c-2-.9-4-.9-6 .2-2-1.1-4-1.1-6-.2z" fill="currentColor"/><path d="M8 3.6v9.4" stroke="#14212A" stroke-width="1"/>',
    speed: '<path d="M3.5 1.6h9M3.5 14.4h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M4.6 2c0 3.2 2.6 4.4 2.6 6s-2.6 2.8-2.6 6h6.8c0-3.2-2.6-4.4-2.6-6s2.6-2.8 2.6-6z" fill="currentColor"/>',
    help: '<path d="M8 14.2 2.3 8.6a3.3 3.3 0 0 1 5.7-4.5 3.3 3.3 0 0 1 5.7 4.5z" fill="currentColor"/>',
    tier1: '<path d="M3 11.5 8 7.5l5 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tier2: '<path d="M3 13 8 9l5 4M3 8.5 8 4.5l5 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tier3: '<path d="M3 14.5 8 10.5l5 4M3 10 8 6l5 4M3 5.5 8 1.5l5 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  /* 美術素材：art/ 裡的 SVG 由 npm run build:art 打包成 public/assets.js（window.ShanhaiArt）。
   * 有載入、而且沒有被玩家切回「原本的畫法」時，建築和圖示用素材；否則用這個檔案裡程式畫的版本。 */
  var AS = window.ShanhaiArt || null, newArt = !!AS;
  /* 各族的素材（public/art/族群.js）用到才載入：載入後呼叫 ShanhaiArtAdd 把內容併進來。單機預覽版會在這之前就全部載好（先排在佇列裡） */
  var packs = Object.create(null), loading = Object.create(null), waiters = [], onLoad = [];
  function merge(p) {
    if (!AS || !p || !p.tribe) return '';
    ['building', 'height', 'people', 'nature', 'field'].forEach(function (k) { AS[k] = AS[k] || {}; for (var n in p[k] || {}) AS[k][n] = p[k][n]; });
    packs[p.tribe] = true;
    decorCacheReset();
    return Object.keys(p.building || {}).map(function (n) { return '<symbol id="b-' + n + '" viewBox="-80 -140 160 180" overflow="visible">' + p.building[n] + '</symbol>'; }).join('') +
      Object.keys(p.nature || {}).map(function (n) { return '<g id="n-' + n + '">' + p.nature[n] + '</g>'; }).join('') +
      Object.keys(p.people || {}).filter(function (n) { return n.indexOf('-villager-') > 0; }).map(function (n) { return '<g id="vp-' + n + '">' + p.people[n] + '</g>'; }).join('');
  }
  function addPack(p) {
    var defs = merge(p), live = typeof document !== 'undefined' && document.querySelector('#vsvg defs');
    if (live && defs) live.insertAdjacentHTML('beforeend', defs);   // 部落畫面已經開著：把新的圖形加進去
    delete loading[p.tribe];
    waiters = waiters.filter(function (w) { if (w.list.every(function (t) { return packs[t] || !AS; })) { w.cb(); return false; } return true; });
    onLoad.forEach(function (fn) { fn(p.tribe); });
  }
  window.ShanhaiArtAdd = addPack;
  /* 確認這幾族的素材都載入了；還沒有的就去載。cb 在全部好了（或載入失敗）之後呼叫 */
  function need(list, cb) {
    list = (list || []).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    var miss = AS ? list.filter(function (t) { return !packs[t]; }) : [];
    if (!miss.length) { if (cb) cb(); return; }
    if (cb) waiters.push({ list: list, cb: cb });
    miss.forEach(function (t) {
      if (loading[t]) return;
      loading[t] = true;
      var sc = document.createElement('script'); sc.src = 'art/' + t + '.js'; sc.async = true;
      sc.onerror = function () { packs[t] = true; addPack({ tribe: t }); packs[t] = false; };   // 載不到就先用程式畫的
      document.head.appendChild(sc);
    });
  }
  var preDefs = '';
  (window.ShanhaiArtQueue || []).forEach(function (p) { preDefs += merge(p); }); window.ShanhaiArtQueue = [];
  try { if (localStorage.getItem('shanhai_art') === 'old') newArt = false; } catch (e) { /* 讀不到設定就用預設 */ }
  function decorCacheReset() { if (typeof decorCache !== 'undefined') { decorCache = {}; groundCache = {}; } }
  var ICON_AS = { speed: 'speed', help: 'help', tier1: 'tier-1', tier2: 'tier-2', tier3: 'tier-3', heal: 'heal', power: 'power', build: 'build', march: 'march', alliance: 'alliance', trade: 'specialty', craft: 'craft', map: 'map', level: 'level', food: 'food', mat: 'material', pop: 'people', army: 'warrior', star: 'prosperity', shield: 'protect', fire: 'gather', book: 'quest', charge: 'charge', volley: 'volley', hold: 'regroup' };   // 遊戲裡的圖示名稱 → 素材的檔名
  [['march', 'flag'], ['trade', 'sp'], ['craft', 'book']].forEach(function (p) { ICONS[p[0]] = ICONS[p[1]]; });   // 沒有素材時借用相近的圖示
  /* 地圖上的資源點用的圖示（24 格）：素材裡沒有竹子和石板，這兩個是程式畫的 */
  var ICON24 = {
    bamboo: '<g fill="currentColor"><rect x="5" y="3" width="3.2" height="18" rx="1.2"/><rect x="10.4" y="1.5" width="3.2" height="19.5" rx="1.2"/><rect x="15.8" y="4" width="3.2" height="17" rx="1.2"/></g><path d="M5 9h3.2M5 15h3.2M10.4 7h3.2M10.4 13.5h3.2M15.8 10h3.2M15.8 16h3.2" stroke="#14212A" stroke-width="1.2"/><path d="M13.6 5.5c3-2 5-2 6.5-1.5-1.4 1.6-3.6 2.2-6.5 1.5z" fill="currentColor"/>',
    stone: '<g fill="currentColor"><path d="M3 18.5 5 15h14l2 3.5z"/><path d="M4.5 13.5 6.5 10h11l2 3.5z"/><path d="M7 8.5 8.8 5h6.4l1.8 3.5z"/></g>',
    boar: '<g fill="currentColor"><path d="M4 15.5c0-4 3.4-7 8-7 3 0 5.2 1 6.6 2.8l2.4.4-.6 2.4-1.6.3c-.4 1.8-1.8 3.1-3.8 3.6v2h-2.2v-1.8h-4.6v1.8H6v-2.3c-1.2-.6-2-1.7-2-3.2z"/><path d="M8.5 8.8 10 5.5l1.6 3"/></g><circle cx="17.6" cy="12" r=".9" fill="#14212A"/><path d="M20.2 14.6l1.6 1" stroke="#F2EAD6" stroke-width="1.2" stroke-linecap="round"/>'
  };
  function iconBody(name) { return (AS && newArt && AS.icon[name]) || ICON24[name] || (AS && AS.icon[name]) || ''; }
  function icon(name, cls) {
    var n = newArt && ICON_AS[name] && AS.icon[ICON_AS[name]];
    if (n) return '<svg class="ic ' + (cls || 'ic-' + name) + '" viewBox="0 0 24 24" aria-hidden="true">' + n + '</svg>';
    return ICONS[name] ? '<svg class="ic ' + (cls || 'ic-' + name) + '" viewBox="0 0 16 16" aria-hidden="true">' + ICONS[name] + '</svg>' : '';
  }

  function rgba(hex, al) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + al + ')'; }

  // ---------- 部落場景（從斜上方俯視，沒有格線；場景比螢幕大，可以拖曳縮放） ----------
  var U = 28, SW = 2200, SH = 1240, OX = SW / 2, OY = 60, CX = 20, CY = 20;   // CX, CY：部落中央的地面座標
  function P(gx, gy, z) { return [OX + (gx - gy) * U, OY + (gx + gy) * U / 2 - (z || 0)]; }   // 地面座標 → 畫面座標
  function sitePos(i) { var s = R.SITES[i]; return P(s.x, s.y); }
  function q(x, y, z) { return [(x - y) * U, (x + y) * U / 2 - (z || 0)]; }                    // 以建地中心為原點
  function f1(n) { return n.toFixed(1); }
  function poly(a, fill, extra) { return '<polygon points="' + a.map(function (p) { return f1(p[0]) + ',' + f1(p[1]); }).join(' ') + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function seg(a, b, stroke, w, extra) { return '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + '" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" fill="none"' + (extra || '') + '/>'; }
  function lerp(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
  function plot(w, d, fill, extra) { return poly([q(-w, -d), q(w, -d), q(w, d), q(-w, d)], fill, extra); }
  function rnd(i, salt) { var x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }

  /* 立體的屋子：兩面看得到的牆、山形屋頂。o = {w, d: 佔地（地面單位）, h: 牆高, rh: 屋頂高, z: 架高, open: 沒有牆的涼亭式} */
  function house(k, o) {
    var w = o.w / 2, d = o.d / 2, h = o.h, rh = o.rh, e = o.ov == null ? 0.2 : o.ov, z = o.z || 0, s = '', i;
    var wl = k.wall, wr = shade(k.wall, -18), dk = shade(k.wall, -52), rf = k.roof, rb = shade(k.roof, -24);
    s += plot(w + 0.3, d + 0.3, '#000', ' opacity=".2" transform="translate(6 4)"');
    if (z) [[-w, d], [w, d], [w, -d]].forEach(function (c) {
      var g = q(c[0], c[1], z - 3);
      s += seg(q(c[0], c[1]), q(c[0], c[1], z), dk, 3.2) + '<ellipse cx="' + f1(g[0]) + '" cy="' + f1(g[1]) + '" rx="6" ry="2.6" fill="' + dk + '"/>';
    });
    var r1 = q(-w - e, 0, z + h + rh), r2 = q(w + e, 0, z + h + rh), eL = q(-w - e, d + e, z + h), eB = q(w + e, d + e, z + h);
    s += poly([q(-w - e, -d - e, z + h), q(w + e, -d - e, z + h), r2, r1], rb);
    if (o.open) {
      s += plot(w, d, shade(k.wall, -8));
      [[-w, -d], [-w, d], [0, d], [w, d], [w, 0], [w, -d]].forEach(function (c) { s += seg(q(c[0], c[1]), q(c[0], c[1], h + 2), dk, 3.4); });
    } else {
      s += poly([q(-w, d, z), q(w, d, z), q(w, d, z + h), q(-w, d, z + h)], wl) +
        poly([q(w, d, z), q(w, -d, z), q(w, -d, z + h), q(w, 0, z + h + rh), q(w, d, z + h)], wr);
      if (k.fence === 'stone') for (i = 1; i < 3; i++) s += seg(q(-w, d, z + h * i / 3), q(w, d, z + h * i / 3), shade(wl, -20), 1.2) + seg(q(w, d, z + h * i / 3), q(w, -d, z + h * i / 3), shade(wr, -20), 1.2);
      else for (i = 1; i < 6; i++) s += seg(q(-w + 2 * w * i / 6, d, z), q(-w + 2 * w * i / 6, d, z + h), shade(wl, -20), 1.1);
      s += poly([q(-w, d, z + h - 5), q(w, d, z + h - 5), q(w, d, z + h), q(-w, d, z + h)], k.trim) +
        poly([q(w, d, z + h - 5), q(w, -d, z + h - 5), q(w, -d, z + h), q(w, d, z + h)], shade(k.trim, -20));
      if (o.door !== false) s += poly([q(-w * 0.3, d, z), q(w * 0.3, d, z), q(w * 0.3, d, z + h * 0.7), q(-w * 0.3, d, z + h * 0.7)], dk);
    }
    s += poly([eL, eB, r2, r1], rf);
    for (i = 1; i < 4; i++) s += seg(lerp(eL, r1, i / 4), lerp(eB, r2, i / 4), rb, 1.2);
    return s + seg(r1, r2, shade(k.roof, 22), 2.2);
  }
  function rack(k, x, y, hang) {   // 曬架：兩根柱子、一根橫桿，掛著 hang 畫的東西
    var a = q(x, y - 0.55), b = q(x, y + 0.55), dk = shade(k.wall, -50), s = seg(a, [a[0], a[1] - 24], dk, 2.6) + seg(b, [b[0], b[1] - 24], dk, 2.6) + seg([a[0], a[1] - 23], [b[0], b[1] - 23], dk, 2.4);
    for (var i = 1; i < 4; i++) { var p = lerp([a[0], a[1] - 23], [b[0], b[1] - 23], i / 4); s += hang(p[0], p[1], i); }
    return s;
  }
  function log(y, z) {
    var a = q(-0.8, y, z + 5), b = q(0.8, y, z + 5);
    return seg(a, b, '#9B6B3F', 10) + '<circle cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" r="5" fill="#C99A63"/><circle cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" r="2.4" fill="none" stroke="#9B6B3F" stroke-width="1"/>';
  }
  var ISO = {
    center: function (k, t) {
      if (t.id === 'amis') return house(k, { w: 2.9, d: 2.4, h: 26, rh: 32, open: true, ov: 0.4 });   // 聚會所：四面開放的大茅草屋
      var s = house(k, { w: 2.7, d: 2.2, h: 30, rh: 26 }), p;
      if (t.id === 'paiwan') {   // 頭目家屋前的石砌平臺與立石（不畫任何雕刻紋樣）
        s += '<g transform="translate(' + f1(q(0, 2.1)[0]) + ' ' + f1(q(0, 2.1)[1]) + ')">' + plot(1.5, 0.55, '#8A877F') + '</g>';
        p = q(1.5, 2.1); s += '<rect x="' + f1(p[0] - 4) + '" y="' + f1(p[1] - 34) + '" width="8" height="34" rx="3" fill="#6E6B64"/>';
      } else { p = q(1.75, 1.5); s += seg(p, [p[0], p[1] - 46], shade(k.wall, -50), 2.6) + poly([[p[0], p[1] - 46], [p[0] + 17, p[1] - 40], [p[0], p[1] - 34]], k.trim); }
      return s;
    },
    house: function (k) { return house(k, { w: 1.9, d: 1.6, h: 22, rh: 20 }); },
    farm: function (k, t, head) {
      var w = 1.25, d = 1.15, s = plot(w + 0.1, d + 0.1, '#5C422B') + plot(w, d, '#7A5A3A'), hc = head || '#E3B341';
      for (var r = 0; r < 4; r++) {
        var y = -d + (r + 0.5) * d / 2;
        s += seg(q(-w + 0.12, y), q(w - 0.12, y), '#5C422B', 2.2);
        for (var c = 0; c < 6; c++) {
          var p = q(-w + 0.28 + c * (2 * w - 0.56) / 5, y);
          s += '<path d="M' + f1(p[0]) + ' ' + f1(p[1]) + 'q1 -6 3 -10" stroke="#6FA04B" stroke-width="2" fill="none" stroke-linecap="round"/>' +
            '<ellipse cx="' + f1(p[0] + 4) + '" cy="' + f1(p[1] - 11) + '" rx="2.4" ry="3.8" fill="' + hc + '" transform="rotate(30 ' + f1(p[0] + 4) + ' ' + f1(p[1] - 11) + ')"/>';
        }
      }
      return s;
    },
    mat: function (k, t) {
      var s = plot(1.15, 1.0, '#000', ' opacity=".16" transform="translate(5 3)"');
      if (t.id === 'paiwan' || t.id === 'bunun') {   // 石板堆
        [[1.0, 0.8, 0, '#74777C', '#8F9297'], [0.8, 0.64, 7, '#7F8287', '#9DA0A5'], [0.6, 0.48, 14, '#8A8D92', '#AEB1B5']].forEach(function (L) {
          s += poly([q(-L[0], L[1], L[2]), q(L[0], L[1], L[2]), q(L[0], L[1], L[2] + 7), q(-L[0], L[1], L[2] + 7)], L[3]) +
            poly([q(L[0], L[1], L[2]), q(L[0], -L[1], L[2]), q(L[0], -L[1], L[2] + 7), q(L[0], L[1], L[2] + 7)], shade(L[3], -16)) +
            poly([q(-L[0], -L[1], L[2] + 7), q(L[0], -L[1], L[2] + 7), q(L[0], L[1], L[2] + 7), q(-L[0], L[1], L[2] + 7)], L[4]);
        });
        if (t.id === 'bunun') s += '<g transform="translate(-34 10)">' + log(0, 0) + '</g>';
      } else {   // 竹木堆
        s += log(-0.3, 0) + log(0.3, 0) + log(0, 8);
        [[-0.9, -0.5, 34], [-0.7, -0.75, 40], [-1.05, -0.3, 30]].forEach(function (b) { var p = q(b[0], b[1]); s += seg(p, [p[0], p[1] - b[2]], '#7FA65A', 3); });
      }
      return s;
    },
    special: function (k, t) {
      if (t.id === 'paiwan') return ISO.farm(k, t, '#D4476B');   // 紅藜田
      var hut = '<g transform="translate(' + f1(q(-0.55, -0.1)[0]) + ' ' + f1(q(-0.55, -0.1)[1]) + ')">' + house(k, { w: 1.3, d: 1.1, h: 14, rh: 15 }) + '</g>';
      if (t.id === 'atayal') return hut + rack(k, 0.95, 0.3, function (x, y, i) {   // 織布屋：晾著一般條紋的布
        return '<rect x="' + f1(x - 5) + '" y="' + f1(y) + '" width="10" height="17" fill="#F2EAD6"/><rect x="' + f1(x - 5) + '" y="' + f1(y + 4) + '" width="10" height="3" fill="' + (i % 2 ? k.trim : '#2F3B45') + '"/><rect x="' + f1(x - 5) + '" y="' + f1(y + 10) + '" width="10" height="3" fill="' + k.trim + '"/>';
      });
      if (t.id === 'amis') return hut + rack(k, 0.95, 0.3, function (x, y) {      // 漁寮：曬魚
        return '<path d="M' + f1(x) + ' ' + f1(y) + 'c5 4 5 11 0 16c-5-5-5-12 0-16z" fill="#8FB8C9"/><path d="M' + f1(x - 3) + ' ' + f1(y + 20) + 'l3-5 3 5z" fill="#8FB8C9"/>';
      });
      return hut + rack(k, 0.95, 0.3, function (x, y) { return '<rect x="' + f1(x - 3.5) + '" y="' + f1(y) + '" width="7" height="13" rx="3" fill="#A6583F"/>'; });   // 獵寮
    },
    storage: function (k, t) {
      if (t.id === 'bunun') {   // 小米倉傳統上在屋內，這裡畫成矮石屋，旁邊放一束小米
        var p = q(1.0, 0.9);
        return house(k, { w: 1.5, d: 1.3, h: 16, rh: 14 }) + seg(p, [p[0], p[1] - 16], '#6FA04B', 2.4) + '<ellipse cx="' + f1(p[0] + 3) + '" cy="' + f1(p[1] - 18) + '" rx="3" ry="5" fill="#E3B341" transform="rotate(28 ' + f1(p[0] + 3) + ' ' + f1(p[1] - 18) + ')"/>';
      }
      return house(k, { w: 1.5, d: 1.3, h: 17, rh: 16, z: 14, door: false });   // 架高的穀倉，柱子上有防鼠板
    },
    barracks: function (k) {
      var a = q(-0.5, 0.2), s = plot(1.25, 1.1, '#B49A6C', ' opacity=".9"') + seg(a, [a[0], a[1] - 26], shade(k.wall, -50), 3);
      s += '<circle cx="' + f1(a[0]) + '" cy="' + f1(a[1] - 30) + '" r="12" fill="#F2EAD6"/><circle cx="' + f1(a[0]) + '" cy="' + f1(a[1] - 30) + '" r="7.5" fill="' + k.trim + '"/><circle cx="' + f1(a[0]) + '" cy="' + f1(a[1] - 30) + '" r="3" fill="#F2EAD6"/>';
      [[0.6, -0.2, 6], [0.75, 0.05, 0], [0.9, 0.3, -6]].forEach(function (b) { var p = q(b[0], b[1]); s += seg(p, [p[0] + b[2], p[1] - 40], '#6B4A32', 2.4) + poly([[p[0] + b[2] - 3, p[1] - 40], [p[0] + b[2] + 3, p[1] - 40], [p[0] + b[2], p[1] - 50]], '#C9CDD1'); });
      return s;
    },
    tower: function (k) {
      var s = plot(0.8, 0.8, '#000', ' opacity=".18" transform="translate(5 3)"'), dk = '#7A5636';
      [[-0.55, -0.55], [-0.55, 0.55], [0.55, 0.55], [0.55, -0.55]].forEach(function (c) { s += seg(q(c[0], c[1]), q(c[0] * 0.8, c[1] * 0.8, 56), dk, 3.2); });
      s += seg(q(-0.55, 0.55, 20), q(0.55, 0.55, 20), dk, 2.2) + seg(q(0.55, 0.55, 36), q(0.55, -0.55, 36), dk, 2.2);
      return s + '<g transform="translate(0 -56)">' + plot(0.62, 0.62, '#8D6642') + '</g><g transform="translate(0 -58)">' + house(k, { w: 1.1, d: 1.1, h: 14, rh: 12, open: true, ov: 0.25 }) + '</g>';
    }
  };
  function box(w, d, z, h, c1, c2, c3) {   // 一個方塊：左前面、右前面、頂面
    return poly([q(-w, d, z), q(w, d, z), q(w, d, z + h), q(-w, d, z + h)], c1) + poly([q(w, d, z), q(w, -d, z), q(w, -d, z + h), q(w, d, z + h)], c2) +
      poly([q(-w, -d, z + h), q(w, -d, z + h), q(w, d, z + h), q(-w, d, z + h)], c3);
  }
  ISO.unique = function (k, t) {
    var s = '', dk = '#7A5636', p, i;
    if (t.id === 'atayal') {   // 望樓：許多根原木撐起來的高臺，比一般的瞭望台高，有梯子和一圈窄窄的走道
      s = plot(1.0, 1.0, '#000', ' opacity=".18" transform="translate(6 4)"');
      [[-0.75, -0.75], [0, -0.8], [0.75, -0.75], [-0.8, 0], [0.8, 0], [-0.75, 0.75], [0, 0.8], [0.75, 0.75]].forEach(function (c) { s += seg(q(c[0], c[1]), q(c[0] * 0.78, c[1] * 0.78, 80), dk, 3.2); });
      [26, 52].forEach(function (z) { s += seg(q(-0.7, 0.7, z), q(0.7, 0.7, z), dk, 2.2) + seg(q(0.7, 0.7, z), q(0.7, -0.7, z), dk, 2.2); });
      var a = q(-1.0, 1.05), b = q(-0.55, 0.6, 80), a2 = [a[0] + 9, a[1] + 3], b2 = [b[0] + 9, b[1] + 3];   // 梯子
      s += seg(a, b, '#9B6B3F', 2.4) + seg(a2, b2, '#9B6B3F', 2.4);
      for (i = 1; i < 8; i++) s += seg(lerp(a, b, i / 8), lerp(a2, b2, i / 8), '#9B6B3F', 1.8);
      s += '<g transform="translate(0 -80)">' + plot(0.95, 0.95, '#8D6642') + '</g>';
      [[-0.95, 0.95, 0.95, 0.95], [0.95, 0.95, 0.95, -0.95]].forEach(function (r) { s += seg(q(r[0], r[1], 89), q(r[2], r[3], 89), dk, 2); });
      return s + '<g transform="translate(0 -82)">' + house(k, { w: 1.3, d: 1.3, h: 16, rh: 14, open: true, ov: 0.3 }) + '</g>';
    }
    if (t.id === 'bunun') {    // 石板豬圈：厚石板圍成的矮圈，一角搭著石板頂，裡面養著黑豬
      s = plot(1.35, 1.2, '#000', ' opacity=".16" transform="translate(5 3)"') + plot(1.25, 1.1, '#6E5A3E');
      s += poly([q(-1.25, -1.1), q(1.25, -1.1), q(1.25, -1.1, 13), q(-1.25, -1.1, 13)], '#6E7176') + poly([q(-1.25, -1.1), q(-1.25, 1.1), q(-1.25, 1.1, 13), q(-1.25, -1.1, 13)], '#7E8186');
      [[0.55, -0.45, -1], [-0.15, 0.45, 1]].forEach(function (g) {   // 兩頭豬
        p = q(g[0], g[1], 6);
        s += '<ellipse cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" rx="11" ry="6.5" fill="#2E2A28"/><circle cx="' + f1(p[0] + 10 * g[2]) + '" cy="' + f1(p[1] - 2) + '" r="4.6" fill="#2E2A28"/><circle cx="' + f1(p[0] + 14 * g[2]) + '" cy="' + f1(p[1] - 1.4) + '" r="1.8" fill="#6B5A55"/>' +
          '<path d="M' + f1(p[0] - 6) + ' ' + f1(p[1] + 5) + 'v4m5 -3v4m6 -4v4" stroke="#2E2A28" stroke-width="2" stroke-linecap="round"/><path d="M' + f1(p[0] + 8 * g[2]) + ' ' + f1(p[1] - 6) + 'l' + 2 * g[2] + ' -4 ' + 2 * g[2] + ' 4z" fill="#2E2A28"/>';
      });
      s += seg(q(-1.2, 0), q(-1.2, 0, 22), '#6B4A32', 2.6) + seg(q(0, -1.05), q(0, -1.05, 22), '#6B4A32', 2.6) + seg(q(0, 0), q(0, 0, 22), '#6B4A32', 2.6) +
        '<g transform="translate(' + f1(q(-0.6, -0.52)[0]) + ' ' + f1(q(-0.6, -0.52)[1]) + ')">' + box(0.68, 0.6, 22, 4, '#8A8D92', '#74777C', '#A5A8AC') + '</g>';
      s += poly([q(-1.25, 1.1), q(1.25, 1.1), q(1.25, 1.1, 13), q(-1.25, 1.1, 13)], '#8A8D92') + poly([q(1.25, 1.1), q(1.25, -1.1), q(1.25, -1.1, 13), q(1.25, 1.1, 13)], '#74777C');
      for (i = 1; i < 5; i++) s += seg(q(-1.25 + 0.5 * i, 1.1), q(-1.25 + 0.5 * i, 1.1, 13), '#6A6D72', 1.2);
      return s + seg(q(-1.25, 1.1, 13), q(1.25, 1.1, 13), '#A5A8AC', 2.4) + seg(q(1.25, 1.1, 13), q(1.25, -1.1, 13), '#8F9297', 2.4);
    }
    if (t.id === 'amis') {     // 巴拉告：水道裡用竹筒和樹枝搭出來、讓魚蝦棲息的地方
      s = plot(1.4, 1.25, '#6E5A3E') + plot(1.25, 1.1, '#3F86A6') + plot(0.95, 0.8, '#5BA4C4', ' opacity=".7"');
      [[-0.5, 0.3], [0.2, 0.55], [0.5, -0.1]].forEach(function (g) {   // 沉在水裡的竹筒
        var a = q(g[0] - 0.35, g[1]), b = q(g[0] + 0.35, g[1]);
        s += seg(a, b, '#8FB56A', 6) + '<circle cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" r="3" fill="#3E5A2E"/>';
      });
      [[-0.2, -0.45], [0.05, -0.3], [-0.45, -0.25], [0.3, -0.5]].forEach(function (g, n) {   // 堆在上面的樹枝
        p = q(g[0], g[1]); s += '<path d="M' + f1(p[0] - 14) + ' ' + f1(p[1] + 4) + 'l14 -7 13 5M' + f1(p[0]) + ' ' + f1(p[1] - 3) + 'l-3 -8" stroke="' + (n % 2 ? '#7A5636' : '#5E4329') + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
      });
      [[-1.05, -0.9, 30], [-0.9, 0.95, 24], [1.05, 0.9, 28], [1.0, -0.95, 34], [0, -1.05, 26]].forEach(function (g) {   // 插在四周的竹竿
        p = q(g[0], g[1]); s += seg(p, [p[0] + 2, p[1] - g[2]], '#7FA65A', 2.8) + seg([p[0] + 2, p[1] - g[2]], [p[0] + 9, p[1] - g[2] - 5], '#7FA65A', 1.8);
      });
      [[-0.7, 0.6], [0.65, 0.2]].forEach(function (g) { p = q(g[0], g[1]); s += '<ellipse cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" rx="8" ry="3" fill="none" stroke="#CFEAF2" stroke-width="1.2" opacity=".8"/>'; });
      return s;
    }
    // 排灣的芋頭窯：石板砌的窯，上面搭木架和竹架，架上烘著芋頭
    s = plot(1.15, 1.0, '#000', ' opacity=".18" transform="translate(5 3)"') + box(0.95, 0.8, 0, 18, '#8A8D92', '#74777C', '#5E5A55');
    for (i = 1; i < 3; i++) s += seg(q(-0.95, 0.8, 6 * i), q(0.95, 0.8, 6 * i), '#6A6D72', 1.2) + seg(q(0.95, 0.8, 6 * i), q(0.95, -0.8, 6 * i), '#5F6267', 1.2);
    s += poly([q(-0.3, 0.8), q(0.3, 0.8), q(0.3, 0.8, 11), q(-0.3, 0.8, 11)], '#2A2320') + '<path d="M' + f1(q(0, 0.8, 2)[0] - 5) + ' ' + f1(q(0, 0.8, 2)[1]) + 'q5 -9 10 0z" fill="#F0A13A"/>';
    [[-0.95, 0.8], [0.95, 0.8], [0.95, -0.8], [-0.95, -0.8]].forEach(function (c) { s += seg(q(c[0], c[1], 18), q(c[0], c[1], 40), '#6B4A32', 2.6); });
    s += '<g transform="translate(0 -36)">' + plot(1.0, 0.85, '#B9A46A') + '</g>';
    for (i = 0; i < 5; i++) s += seg(q(-1.0 + 0.5 * i, 0.85, 36), q(-1.0 + 0.5 * i, -0.85, 36), '#8C7A45', 1.1);
    [[-0.5, 0.3], [0, 0.4], [0.5, 0.2], [-0.3, -0.2], [0.3, -0.3], [0.65, -0.45], [-0.65, -0.1]].forEach(function (g) { p = q(g[0], g[1], 38); s += '<ellipse cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" rx="5" ry="3.4" fill="#7A5A48"/>'; });
    p = q(0, 0, 44);
    return s + '<circle cx="' + f1(p[0] + 4) + '" cy="' + f1(p[1] - 8) + '" r="5" fill="#F2EAD6" opacity=".55"/><circle cx="' + f1(p[0] + 10) + '" cy="' + f1(p[1] - 20) + '" r="7" fill="#F2EAD6" opacity=".35"/>';
  };
  var ASSET_SCALE = 0.92;
  /* 外觀隨等級改變：每一種建築在 6、11、16、21 級換一次外觀（美術檔名 族群-種類-lv6.svg……） */
  function stage(type, level) { return level >= 21 ? '-lv21' : level >= 16 ? '-lv16' : level >= 11 ? '-lv11' : level >= 6 ? '-lv6' : ''; }
  function asset(t, type, level) {
    if (!newArt || !AS) return '';
    var n = t.id + '-' + type + stage(type, level || 1);
    if (AS.building[n]) return n;
    n = t.id + '-' + type; return AS.building[n] ? n : '';
  }
  function useB(n, sc) { return '<use href="#b-' + n + '" x="-80" y="-140" width="160" height="180" transform="scale(' + (sc || ASSET_SCALE) + ')"/>'; }
  function site(n) { return newArt && AS && AS.building['site-' + n] ? useB('site-' + n) : ''; }   // 建地的素材：空地、施工中、升級中、拓荒中
  /* 畫一棟建築，原點在佔地中心。有素材就用素材（<use> 參照 DEFS 裡的圖形），沒有就用上面程式畫的 */
  function bld(type, k, t, level) {
    var n = asset(t, type, level);
    return n ? useB(n) : ISO[type](k, t);   // 素材的地基比建地略大，縮一點相鄰的建築才不會疊在一起
  }
  function topOf(type, t, level) { var n = asset(t, type, level); return n ? AS.height[n] * ASSET_SCALE + 18 : type === 'unique' && t.id === 'atayal' ? 128 : TOP[type]; }   // 等級標記放多高
  var TOP = { center: 82, house: 58, farm: 26, mat: 36, special: 48, storage: 64, barracks: 56, tower: 104, unique: 56, hut: 46, archery: 40, taro: 26, water: 34, heal: 56, craft: 60, market: 50, plaza: 30, guest: 52 };
  /* 第二批的 9 種建築：程式畫的簡單版本（美術素材還沒載好、或是切回原本的畫法時用） */
  function sign(color, p) { return '<circle cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="7" fill="' + color + '" stroke="#F2EAD6" stroke-width="2"/>'; }
  ISO.hut = function (k) { return house(k, { w: 1.3, d: 1.0, h: 14, rh: 12, open: true }) + seg(q(0.9, 0.7), q(1.1, 0.4, 24), '#7A5636', 2.6); };
  ISO.archery = function (k) {
    var s = plot(1.2, 1.05, '#B79B6E', ' opacity=".85"');
    [[-0.5, -0.3], [0.4, -0.5], [0.1, 0.4]].forEach(function (c) { var p = q(c[0], c[1]); s += seg(p, [p[0], p[1] - 18], '#7A5636', 2.4) + '<circle cx="' + f1(p[0]) + '" cy="' + f1(p[1] - 22) + '" r="7" fill="#E3D3A6" stroke="#B5483A" stroke-width="2.4"/>'; });
    return s;
  };
  ISO.taro = function (k) {
    var s = plot(1.2, 1.05, '#6E5A3E');
    for (var i = 0; i < 9; i++) { var p = q(-0.8 + (i % 3) * 0.8, -0.7 + Math.floor(i / 3) * 0.7); s += '<path d="M' + f1(p[0]) + ' ' + f1(p[1]) + 'q-9 -14 0 -18q9 4 0 18z" fill="#5E9A4E"/>'; }
    return s;
  };
  ISO.water = function (k) { return plot(1.2, 1.05, '#B79B6E', ' opacity=".7"') + plot(0.5, 0.5, '#4C93B5') + seg(q(-1.1, -0.9, 16), q(-0.3, -0.3, 10), '#8FB56A', 5) + seg(q(-1.1, -0.9), q(-1.1, -0.9, 16), '#7A5636', 2.4); };
  ISO.heal = function (k) { return house(k, { w: 1.4, d: 1.2, h: 18, rh: 16 }) + sign('#BFE3C4', q(0.9, 0.9, 26)); };
  ISO.craft = function (k) { return house(k, { w: 1.6, d: 1.3, h: 18, rh: 18, open: true }) + sign('#E3B341', q(1.0, 1.0, 26)); };
  ISO.market = function (k) { return house(k, { w: 1.4, d: 1.4, h: 16, rh: 14, open: true }) + box(0.5, 0.3, 0, 8, '#8D6642', '#74553A', '#A57A50'); };
  ISO.plaza = function (k) {
    var p = q(0, 0), s = plot(1.25, 1.1, '#C4AB7C');
    [[-0.8, 0], [0.8, 0], [0, -0.7], [0, 0.7]].forEach(function (c) { var r = q(c[0], c[1]); s += '<ellipse cx="' + f1(r[0]) + '" cy="' + f1(r[1]) + '" rx="10" ry="4" fill="#7A5636"/>'; });
    return s + '<path d="M' + f1(p[0]) + ' ' + f1(p[1] - 16) + 'c6 6 7 11 4 16h-8c-3 -5 -2 -10 4 -16z" fill="#F0A13A"/>';
  };
  ISO.guest = function (k) { return house(k, { w: 1.2, d: 1.0, h: 16, rh: 14, open: true }) + seg(q(1.0, 1.0), q(1.0, 1.0, 40), '#7A5636', 2.4) + seg(q(-1.0, 1.0), q(-1.0, 1.0, 40), '#7A5636', 2.4); };   // 各建築大約多高，用來放等級標記

  // 樹、石頭、草叢：定義一次，用 <use> 重複放
  var DEFS = '<defs>' +
    '<g id="t-c"><ellipse cx="0" cy="1" rx="11" ry="3.6" fill="#000" opacity=".25"/><rect x="-2" y="-11" width="4" height="12" fill="#6B4A32"/><polygon points="-16,-8 0,-36 16,-8" fill="#2F6B4F"/><polygon points="0,-36 16,-8 0,-8" fill="#25573F"/><polygon points="-11,-25 0,-52 11,-25" fill="#3A7C5B"/><polygon points="0,-52 11,-25 0,-25" fill="#2D6449"/></g>' +
    '<g id="t-b"><ellipse cx="0" cy="1" rx="14" ry="4.2" fill="#000" opacity=".25"/><rect x="-2.5" y="-15" width="5" height="16" fill="#6B4A32"/><circle cx="-8" cy="-23" r="12" fill="#3E7D4E"/><circle cx="8" cy="-25" r="13" fill="#357245"/><circle cx="0" cy="-35" r="13" fill="#4A8E59"/><circle cx="-4" cy="-39" r="6.5" fill="#63A96E" opacity=".85"/></g>' +
    '<g id="t-r"><polygon points="-13,2 -9,-10 3,-15 13,-6 14,2" fill="#8E9196"/><polygon points="3,-15 13,-6 14,2 2,2" fill="#74777C"/></g>' +
    '<g id="t-s"><ellipse cx="0" cy="1" rx="11" ry="3.4" fill="#000" opacity=".2"/><circle cx="-5" cy="-5" r="7" fill="#4F8F55"/><circle cx="5" cy="-6" r="8" fill="#447F4B"/><circle cx="0" cy="-10" r="6" fill="#62A566"/></g>' +
    // 對戰畫面用的高樹：樹幹高、樹冠在上面，人站在樹後面看得到
    '<g id="bt-a"><ellipse cx="0" cy="1" rx="17" ry="5" fill="#000" opacity=".25"/><path d="M-5 0C-4 -30 -4 -50 -3 -72h6C4 -50 5 -30 6 0Z" fill="#6B4A32"/><path d="M1 0C2 -30 2 -50 1.5 -72h1.5C4 -50 5 -30 6 0Z" fill="#573A26"/><path d="M-2 -48l-14 -14" stroke="#6B4A32" stroke-width="3" stroke-linecap="round"/><circle cx="-17" cy="-78" r="19" fill="#357245"/><circle cx="15" cy="-82" r="21" fill="#2F6A40"/><circle cx="-2" cy="-98" r="21" fill="#3E7D4E"/><circle cx="-8" cy="-104" r="10" fill="#5A9E64" opacity=".85"/></g>' +
    '<g id="bt-c"><ellipse cx="0" cy="1" rx="15" ry="4.6" fill="#000" opacity=".25"/><rect x="-3.5" y="-46" width="7" height="47" fill="#6B4A32"/><rect x="0" y="-46" width="3.5" height="47" fill="#573A26"/><polygon points="-24,-36 0,-78 24,-36" fill="#2F6B4F"/><polygon points="0,-78 24,-36 0,-36" fill="#25573F"/><polygon points="-19,-62 0,-100 19,-62" fill="#3A7C5B"/><polygon points="0,-100 19,-62 0,-62" fill="#2D6449"/><polygon points="-13,-86 0,-118 13,-86" fill="#468A66"/><polygon points="0,-118 13,-86 0,-86" fill="#357052"/></g>' +
    '<g id="bt-p"><ellipse cx="0" cy="1" rx="11" ry="3.6" fill="#000" opacity=".25"/><path d="M-2.5 0C-1 -40 0 -70 1 -92h3C4 -70 3 -40 3 0Z" fill="#8A7A5A"/><path d="M-1.6 -20h4M-1 -40h4M-.4 -60h3.6M.4 -78h3" stroke="#6E6046" stroke-width="1.4"/><g fill="none" stroke="#3E8A4E" stroke-width="5" stroke-linecap="round"><path d="M2 -92q-16 -14 -30 -2"/><path d="M2 -92q16 -14 30 -2"/><path d="M2 -92q-10 -24 -24 -24"/><path d="M2 -92q10 -24 24 -24"/><path d="M2 -92q0 -20 2 -30"/></g><circle cx="2" cy="-92" r="4" fill="#2F6A40"/></g>' +
    (AS ? Object.keys(AS.building).filter(function (n) { return !/^(atayal|bunun|amis|paiwan)-/.test(n) || /-center$/.test(n); }).map(function (n) { return '<symbol id="b-' + n + '" viewBox="-80 -140 160 180" overflow="visible">' + AS.building[n] + '</symbol>'; }).join('') : '') +   // 共用的美術素材：建地、1 級的中心建築
    preDefs +   // 已經載好的各族素材（單機預覽版）
    '</defs>';
  function use(id, x, y, sc) { return '<use href="#' + id + '" transform="translate(' + f1(x) + ' ' + f1(y) + ') scale(' + sc.toFixed(2) + ')"/>'; }
  function inWater(k, p) {
    if (k.backdrop === 'coast') return p[1] > shore(p[0]) - 46;
    return Math.abs(p[0] - stream(p[1])) < 40;
  }
  function stream(y) { return 1890 + 62 * Math.sin(y / 160); }
  function shore(x) { return 1096 + 24 * Math.sin(x / 190); }
  var decorCache = {}, WALL_A = 15.6;   // WALL_A：方形圍籬離部落中央的距離（地面單位），每邊 13 段、每段 2.4
  function natureOn(t) { return newArt && AS && AS.nature && AS.nature[t.id + '-tree-a'] ? true : false; }
  function treeId(t, r, small) {   // 素材的樹：依隨機數挑一種
    if (small) return 'n-' + t.id + (r < 0.3 ? '-bush' : r < 0.65 ? '-tree-a' : r < 0.85 ? '-tree-b' : '-tree-c');
    return 'n-' + t.id + (r < 0.05 ? '-rock' : r < 0.15 ? '-bush' : r < 0.45 ? '-tree-big' : r < 0.66 ? '-tree-a' : r < 0.83 ? '-tree-b' : r < 0.99 ? '-tree-c' : '-log');
  }
  function decor(t) {   // 開墾地外面的山林：位置固定，每次都一樣
    var art = natureOn(t), key = t.id + (art ? '+' : '');
    if (decorCache[key]) return decorCache[key];
    var k = t.look, out = [], coast = k.backdrop === 'coast', rocky = t.id === 'paiwan' ? 0.16 : 0.06;
    for (var i = 0; i < 1320; i++) {
      var gx = -9 + rnd(i, 1) * 58, gy = -9 + rnd(i, 2) * 58;
      if (art ? Math.abs(gx - CX) < WALL_A + 1.4 && Math.abs(gy - CY) < WALL_A + 1.4 : Math.hypot(gx - CX, gy - CY) < 15.3) continue;
      if (art && rnd(i, 7) < 0.3) continue;   // 素材的樹比較大，種得稀一點，看得到草地
      var p = P(gx, gy);
      if (p[0] < -30 || p[0] > SW + 30 || p[1] < 36 || p[1] > SH + 50 || inWater(k, p)) continue;
      var r = rnd(i, 3), id = art ? treeId(t, r) : r < rocky ? 't-r' : coast ? (r < 0.24 ? 't-s' : 't-b') : (r < 0.66 ? 't-c' : 't-b');
      out.push({ y: p[1], s: use(id, p[0], p[1], (art ? 0.82 + rnd(i, 4) * 0.3 : 0.85 + rnd(i, 4) * 0.45) * (/-tree-big$/.test(id) ? 0.5 : 1)) });
    }
    out.sort(function (a, b) { return a.y - b.y; });
    return (decorCache[key] = out.map(function (o) { return o.s; }).join(''));
  }
  /* 方形的圍籬（有素材時）：四邊各 13 段，左前方那一邊的正中間是大門，四個角有轉角柱。等級越高，用越堅固的那一款 */
  function wallRing(t, level, items) {
    var nm = AS.building[t.id + '-wall' + stage('wall', level)] ? t.id + '-wall' + stage('wall', level) : t.id + '-wall', L = 2.4, n = 13, a = WALL_A, j;
    function put(gx, gy, id, flip) { var p = P(gx, gy); items.push({ y: p[1] - 2, s: '<g transform="translate(' + f1(p[0]) + ' ' + f1(p[1]) + ')' + (flip ? ' scale(-1 1)' : '') + '">' + useB(id, 1) + '</g>' }); }
    for (j = 0; j < n; j++) {
      var o = -a + L * (j + 0.5);
      put(CX + o, CY - a, nm, false);                                                                       // 右後方
      put(CX + o, CY + a, j === (n - 1) / 2 && AS.building[t.id + '-gate'] ? t.id + '-gate' : nm, false);   // 左前方，正中間是大門
      put(CX - a, CY + o, nm, true); put(CX + a, CY + o, nm, true);                                          // 左後方、右前方
    }
    if (AS.building[t.id + '-wall-corner']) [[-a, -a], [a, -a], [a, a], [-a, a]].forEach(function (c) { put(CX + c[0], CY + c[1], t.id + '-wall-corner', false); });
  }
  var CLUMP = [[-36, -8], [-12, -22], [18, -15], [38, 0], [-20, 9], [8, 15]];
  function badge(x, y, inner, ring) {
    return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ')"><circle r="13" fill="rgba(20,33,42,.82)" stroke="' + ring + '" stroke-width="2"/>' + inner + '</g>';
  }

  /* v: {tribe, tiles, land, queue, wall}；回傳放進 <svg> 的內容。倒數文字由外部依 data-until 更新。 */
  function scene(v, sel, plain, bub) {   // plain：參觀別人的部落時，不顯示可以拓荒、可以興建的記號；bub：產量的泡泡（建築種類 → 文字）
    var t = Tribes.get(v.tribe), k = t.look, S = R.SITES, low = '', top = '', items = [], busy = {}, i;
    v.queue.forEach(function (w) { if (w.tile >= 0) busy[w.tile] = w; });
    function dist(j) { return Math.hypot(S[j].x - CX, S[j].y - CY); }
    if (v.wall && newArt && AS && AS.building[t.id + '-wall']) wallRing(t, v.wall, items);
    else if (v.wall) {   // 圍籬：繞著整個開墾地的一圈，等級越高越粗
      var c0 = P(CX, CY), rx = 14.5 * U * 1.414, wd = 5 + v.wall * 2, stone = k.fence === 'stone';
      var ring = function (col, wdt, dash) { return '<ellipse cx="' + f1(c0[0]) + '" cy="' + f1(c0[1]) + '" rx="' + f1(rx) + '" ry="' + f1(rx / 2) + '" fill="none" stroke="' + col + '" stroke-width="' + wdt + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; };
      low += ring('rgba(0,0,0,.28)', wd + 8) + ring(stone ? '#5F6166' : '#5E7B3C', wd + 4) + ring(stone ? '#A5A8AC' : '#A9C46A', wd, stone ? '26 6' : '6 7');
    }
    for (i = 1; i < S.length; i++) {   // 小路：每塊開墾好的地連到比較靠近中央的鄰地
      if (!v.land[i]) continue;
      var parent = 0, best = dist(i);
      S[i].near.forEach(function (j) { if (v.land[j] && dist(j) < best) { best = dist(j); parent = j; } });
      low += seg(sitePos(i), sitePos(parent), '#BFA475', 13, ' opacity=".8"');
    }
    for (i = 0; i < S.length; i++) {
      var p = sitePos(i), b = v.tiles[i], w = busy[i], tx = ' transform="translate(' + f1(p[0]) + ' ' + f1(p[1]) + ')"';
      if (sel === i) low += '<ellipse cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" rx="66" ry="33" fill="rgba(227,179,65,.25)" stroke="#E3B341" stroke-width="4"/>';
      if (!v.land[i]) {   // 山林
        var clearing = w && w.type === 'clear', art = natureOn(t);
        if (clearing && site('clearing')) items.push({ y: p[1], s: '<g' + tx + '>' + site('clearing') + '</g>' });   // 拓荒中：砍到一半的樹、樹樁
        else CLUMP.forEach(function (c, n) {
          if (clearing && n % 2) return;
          var tid = art ? treeId(t, rnd(i * 7 + n, 5), n > 3) : rnd(i * 7 + n, 5) < (k.backdrop === 'coast' ? 0.15 : 0.6) ? 't-c' : 't-b';
          items.push({ y: p[1] + c[1], s: use(tid, p[0] + c[0], p[1] + c[1], (art ? 0.78 + rnd(i * 7 + n, 6) * 0.25 : 0.95 + rnd(i * 7 + n, 6) * 0.3) * (/-tree-big$/.test(tid) ? 0.5 : 1)) });
        });
        if (clearing) top += pill(p[0], p[1] + 6, w.doneAt);
        else if (!plain && S[i].near.some(function (j) { return v.land[j]; }))
          top += badge(p[0], p[1] - 50, '<path d="M-5 6 4 -5" stroke="#F2EAD6" stroke-width="2.4" stroke-linecap="round"/><path d="M1 -8 8 -3 4 2 -1 -4z" fill="#F2EAD6"/>', '#F2EAD6');
      } else if (!b) {     // 開墾好的空地
        if (site('empty')) low += '<g' + tx + '>' + site('empty') + '</g>';
        else {
          low += '<g' + tx + '>' + plot(1.2, 1.05, '#B79B6E', ' opacity=".85"') + '</g>';
          [[-1.2, -1.05], [1.2, -1.05], [1.2, 1.05], [-1.2, 1.05]].forEach(function (c) { var g = q(c[0], c[1]); low += seg([p[0] + g[0], p[1] + g[1]], [p[0] + g[0], p[1] + g[1] - 9], '#7A5636', 2.6); });
        }
        if (!plain) top += badge(p[0], p[1] - 2, '<path d="M-6 0H6M0 -6V6" stroke="#E3B341" stroke-width="2.6" stroke-linecap="round"/>', '#E3B341');
      } else {
        if (b.level === 0 && site('building')) items.push({ y: p[1] + 8, s: '<g' + tx + '>' + site('building') + '</g>' });   // 施工中：鷹架和堆著的材料
        else items.push({ y: p[1] + 8, s: '<g' + tx + (b.level === 0 ? ' opacity=".45"' : '') + '>' + bld(b.type, k, t, b.level) + (b.busy && b.level > 0 && site('upgrade') ? site('upgrade') : '') + '</g>' });   // 升級中：疊上鷹架
        if (b.busy && w) top += pill(p[0], p[1] + 22, w.doneAt);
        if (b.level > 0 && b.type === 'unique') top += '<g transform="translate(' + f1(p[0] + 34) + ' ' + f1(p[1] - topOf('unique', t)) + ')"><circle r="12" fill="rgba(20,33,42,.88)" stroke="#E3B341" stroke-width="2"/><path d="M0 -8l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6-5-2.9-5 2.9 1.2-5.6-4.2-3.8 5.6-.6z" fill="#E3B341"/></g>';
        else if (b.level > 0) top += '<g transform="translate(' + f1(p[0] + 34) + ' ' + f1(p[1] - topOf(b.type, t, b.level)) + ')"><circle r="12" fill="rgba(20,33,42,.88)"/><text y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#F2EAD6">' + b.level + '</text></g>';
      }
    }
    if (bub) Object.keys(bub).forEach(function (ty) {   // 每一種生產建築，在第一棟上方浮出整個部落的產量
      for (var j = 0; j < S.length; j++) {
        var bj = v.tiles[j]; if (!bj || bj.type !== ty || !bj.level || bj.busy) continue;
        var pj = sitePos(j), txt = bub[ty], w = 30 + txt.length * 9.5, ic = ty === 'farm' ? 'food' : ty === 'mat' ? 'mat' : 'sp';
        top += '<g class="bubble" transform="translate(' + f1(pj[0] - 6) + ' ' + f1(pj[1] - topOf(ty, t, bj.level) + 6) + ')"><rect x="' + f1(-w / 2) + '" y="-15" width="' + f1(w) + '" height="28" rx="14" fill="#BFE3C4" stroke="#fff" stroke-width="2.5"/>' +
          '<g transform="translate(' + f1(-w / 2 + 8) + ' -9) scale(1.05)" style="color:#14212A">' + (ICONS[ic] || '') + '</g><text x="' + f1(-w / 2 + 28) + '" y="6" font-size="16" font-weight="700" fill="#14212A">' + txt + '</text></g>';
        break;
      }
    });
    items.sort(function (a, c) { return a.y - c.y; });
    return low + items.map(function (it) { return it.s; }).join('') + top;
  }
  function pill(x, y, until) {
    return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ')"><rect x="-40" y="-13" width="80" height="26" rx="13" fill="rgba(20,33,42,.9)"/><text y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#E3B341" data-until="' + until + '"></text></g>';
  }
  function person(color, tribe, i) {   // 有素材就用該族的族人（走路、站著、扛東西），原點在腳底下 9 的地方
    var vs = ['-villager-a-walk', '-villager-b-stand', '-villager-a-stand'], n = tribe && newArt && AS && AS.people ? tribe + vs[(i || 0) % 3] : '';
    if (n && AS.people[n]) return '<use href="#vp-' + n + '" transform="translate(0 9) scale(.95)"/>';
    return '<ellipse cx="0" cy="9" rx="6.5" ry="2.4" fill="#000" opacity=".22"/><path d="M-5.5 9c0-8 2-13 5.5-13s5.5 5 5.5 13z" fill="' + color + '"/><circle cx="0" cy="-8" r="4.8" fill="#B98660"/>';
  }

  // ---------- 對戰畫面：山林間的亂戰 ----------
  /* 對戰是自動打完的，這裡把戰報裡每一回合的紀錄演出來：一整片樹林，雙方的人在樹和樹之間穿插、兩兩纏鬥，弓手在後面放箭。
   * 失去戰力的人是轉身跑回自己那一邊（撤退），不畫倒下的樣子。 */
  var BW = 1000, BH = 420, B_TOP = 186, B_BOT = 394, MAXFIG = 14;   // B_TOP～B_BOT：人可以站的上下範圍；每一邊畫面上最多站 MAXFIG 個人
  function figure(kind, body, band) {   // 一個人：腳底在原點，面向右
    var s = '<path d="M-6.5 0c0-9 2-15 6.5-15s6.5 6 6.5 15z" fill="' + body + '"/>' +
      '<circle cx="0" cy="-19.5" r="5.6" fill="#B98660"/><path d="M-5.6 -21.5h11.2" stroke="' + band + '" stroke-width="2.2"/>';
    if (kind === 'w') s += '<g class="wpn"><path d="M8 2 12 -31" stroke="#6B4A32" stroke-width="2.2" stroke-linecap="round"/><path d="M12 -31l-2.6 -8 5.2 3z" fill="#D5D9DC"/></g>';
    else if (kind === 'a') s += '<g class="wpn"><path d="M8 -23q11 10 0 21" fill="none" stroke="#6B4A32" stroke-width="2.4" stroke-linecap="round"/><path d="M8 -23v21" stroke="#EFE7D2" stroke-width="0.9"/></g>';
    else if (kind === 'um') s += '<g class="wpn"><path d="M9 2 13 -33" stroke="#6B4A32" stroke-width="2.4" stroke-linecap="round"/><path d="M13 -33l-2.8 -9 5.6 3.4z" fill="#D5D9DC"/></g><circle cx="6.5" cy="-7.5" r="6.4" fill="#8D6642" stroke="#F2EAD6" stroke-width="1.4"/>';
    else if (kind === 'ur') s = '<path d="M-6 -5l-5 -12" stroke="#6B4A32" stroke-width="4" stroke-linecap="round"/><path d="M-11 -17l-2 -5m3.4 4.2l-.4 -5.4" stroke="#EFE7D2" stroke-width="1.2" stroke-linecap="round"/>' + s + '<g class="wpn"><path d="M8 -27q15 13 0 27" fill="none" stroke="#6B4A32" stroke-width="2.8" stroke-linecap="round"/><path d="M8 -27v27" stroke="#EFE7D2" stroke-width="0.9"/></g>';
    return s;
  }
  function at(x, y, inner) { return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ')">' + inner + '</g>'; }
  function dly(ms) { return ' style="animation-delay:' + Math.round(ms) + 'ms"'; }
  var STAR = 'M0 -17 4 -5 15 -8 7 1 15 9 4 7 0 18 -4 7 -15 9 -7 1 -15 -8 -4 -5Z';
  function depth(y) { return 0.84 + (y - B_TOP) / (B_BOT - B_TOP) * 0.5; }   // 越靠近畫面下方（越近）越大
  function fenceX(y) { return 872 + (y - 176) * 0.14; }                       // 部落邊緣的圍籬是一條微微斜的線
  function bTree(coast, i) { return coast ? (rnd(i, 71) < 0.55 ? 'bt-p' : 'bt-a') : (rnd(i, 71) < 0.5 ? 'bt-c' : 'bt-a'); }
  /* 背景：遠景、後排的樹牆、林間空地、右邊部落的邊緣。只跟守方的族群有關，演出中不會變 */
  function showBack(ta, td, sh) {
    var k = td.look, g = k.ground, coast = k.backdrop === 'coast', point = !!sh.point, s = '', i;
    s += '<rect width="1000" height="130" fill="' + (coast ? '#C4E4EA' : '#CBE2DE') + '"/>';
    if (coast) s += '<rect y="58" width="1000" height="50" fill="#3E8FB8"/><path d="M0 74q30 -5 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0" fill="none" stroke="#A9D8E8" stroke-width="2"/><rect y="100" width="1000" height="14" fill="#E2CF9C"/>';
    else s += '<polygon points="0,116 0,64 90,30 190,68 300,24 420,64 520,36 640,72 760,28 880,62 1000,42 1000,116" fill="#86AFA2"/><polygon points="0,118 0,88 130,60 250,90 380,56 500,92 630,64 770,94 900,66 1000,86 1000,118" fill="#5E8E7C"/>';
    s += '<rect y="104" width="1000" height="80" fill="' + shade(g, -46) + '"/>';
    for (i = 0; i < 31; i++) s += use(bTree(coast, i), -12 + i * 34 + rnd(i, 61) * 16, 170 + rnd(i, 62) * 12, 0.86 + rnd(i, 63) * 0.34);
    s += '<rect y="40" width="1000" height="144" fill="' + shade(g, -62) + '" opacity=".34"/>';   // 樹牆壓暗一點，前面的人才跳得出來
    s += '<rect y="176" width="1000" height="244" fill="' + shade(g, 2) + '"/><ellipse cx="510" cy="296" rx="420" ry="112" fill="' + shade(g, 15) + '" opacity=".8"/>';
    s += '<rect y="176" width="140" height="244" fill="' + shade(g, -34) + '" opacity=".75"/><rect x="140" y="176" width="90" height="244" fill="' + shade(g, -20) + '" opacity=".4"/>';
    if (point) s += '<rect x="860" y="176" width="140" height="244" fill="' + shade(g, -34) + '" opacity=".75"/><rect x="770" y="176" width="90" height="244" fill="' + shade(g, -20) + '" opacity=".4"/>';
    else s += '<path d="M' + f1(fenceX(176) + 6) + ' 176L' + f1(fenceX(420) + 6) + ' 420H1000V176Z" fill="' + shade(g, 24) + '"/>';
    for (i = 0; i < 10; i++) s += '<ellipse class="dapple"' + dly(-i * 700) + ' cx="' + f1(170 + rnd(i, 64) * 640) + '" cy="' + f1(200 + rnd(i, 65) * 180) + '" rx="' + f1(26 + rnd(i, 66) * 34) + '" ry="' + f1(8 + rnd(i, 67) * 8) + '" fill="#FFF3C4" opacity=".2"/>';
    for (i = 0; i < 60; i++) {   // 草叢筆觸、落葉、小石頭
      var gx = 20 + rnd(i, 51) * 960, gy = 190 + rnd(i, 52) * 214;
      if (i % 4 === 0) s += '<ellipse cx="' + f1(gx) + '" cy="' + f1(gy) + '" rx="' + f1(2.5 + rnd(i, 55) * 3) + '" ry="1.7" fill="' + (i % 8 ? '#B9853E' : '#9A9C9E') + '" opacity=".7"/>';
      else s += '<path d="M' + f1(gx) + ' ' + f1(gy) + 'l2 -6m2 6l1 -7m3 7l-1 -5" stroke="' + shade(g, i % 2 ? 26 : -20) + '" stroke-width="1.5" fill="none" opacity=".7"/>';
    }
    return s + showEdge(td, sh);
  }
  function showEdge(td, sh) {   // 部落的邊緣：裡面的房子、圍籬、大門、瞭望台（資源點的較量沒有）
    var k = td.look, s = '', i;
    if (!sh.point) {
      s += at(962, 250, '<g transform="scale(.6)">' + bld('center', k, td) + '</g>') + at(946, 200, '<g transform="scale(.46)">' + bld('house', k, td) + '</g>') + at(968, 372, '<g transform="scale(.52)">' + bld('house', k, td) + '</g>');
      var stone = k.fence === 'stone', c1 = stone ? '#5F6166' : '#6F8A44', c2 = stone ? '#A5A8AC' : '#B4CC76', hgt = 12 + sh.wall * 5;
      if (sh.wall) for (i = 0; i < 26; i++) {
        var fy = 180 + i * 9.4; if (fy > 262 && fy < 322) continue;   // 大門的缺口
        s += '<path d="M' + f1(fenceX(fy)) + ' ' + f1(fy) + 'v' + -hgt + '" stroke="' + c1 + '" stroke-width="' + (stone ? 9 : 5) + '" stroke-linecap="' + (stone ? 'butt' : 'round') + '"/><path d="M' + f1(fenceX(fy)) + ' ' + f1(fy - 1) + 'v' + -(hgt - 3) + '" stroke="' + c2 + '" stroke-width="' + (stone ? 5 : 2) + '"/>';
      }
      [262, 322].forEach(function (py) { s += '<path d="M' + f1(fenceX(py)) + ' ' + py + 'v-34" stroke="#6B4A32" stroke-width="6" stroke-linecap="round"/><path d="M' + f1(fenceX(py) - 4) + ' ' + (py - 34) + 'h8" stroke="#8D6642" stroke-width="4" stroke-linecap="round"/>'; });
      [[212, 0.5], [366, 0.58], [300, 0.44]].slice(0, Math.min(3, sh.towerN)).forEach(function (tw) { s += at(fenceX(tw[0]) + 30, tw[0], '<g transform="scale(' + tw[1] + ')">' + bld('tower', k, td) + '</g>'); });
    }
    return s;
  }
  /* 前景：畫面下緣和兩個角落的大葉子（會蓋在人物上面）、樹冠間灑下來的光、飄落的葉子 */
  function showFront(td) {
    var g = td.look.ground, dk = shade(g, -58), dk2 = shade(g, -44), s = '', i;
    [[120, 96, 240], [390, 70, 210], [650, 90, 230]].forEach(function (p, n) {
      s += '<polygon class="shaft"' + dly(-n * 1900) + ' points="' + p[0] + ',60 ' + (p[0] + p[1]) + ',60 ' + (p[0] + p[1] + p[2]) + ',410 ' + (p[0] + p[2] - 20) + ',410" fill="#FFF6D0" opacity=".1"/>';
    });
    function leaf(x, y, r, len, col) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + len + '" ry="' + f1(len * 0.3) + '" fill="' + col + '" transform="rotate(' + r + ' ' + x + ' ' + y + ')"/>'; }
    s += leaf(18, 404, -52, 74, dk) + leaf(64, 416, -30, 80, dk2) + leaf(-6, 372, -74, 60, dk2) + leaf(120, 424, -14, 66, dk);
    s += leaf(982, 404, 232, 74, dk) + leaf(936, 418, 208, 78, dk2) + leaf(1006, 370, 252, 58, dk2) + leaf(880, 426, 194, 62, dk);
    for (i = 0; i < 16; i++) { var fx = 170 + i * 44 + rnd(i, 81) * 20; s += '<path d="M' + f1(fx) + ' 424q' + f1(-6 + rnd(i, 82) * 12) + ' -' + f1(10 + rnd(i, 83) * 12) + ' ' + f1(-10 + rnd(i, 84) * 20) + ' -' + f1(16 + rnd(i, 85) * 12) + '" stroke="' + (i % 2 ? dk : dk2) + '" stroke-width="5" stroke-linecap="round" fill="none"/>'; }
    for (i = 0; i < 12; i++) s += at(90 + rnd(i, 91) * 880, 30 + rnd(i, 92) * 60, '<path class="leaf" style="animation-delay:' + Math.round(-rnd(i, 93) * 8000) + 'ms;animation-duration:' + Math.round(6000 + rnd(i, 94) * 5000) + 'ms" d="M0 0q5 -5 10 0q-5 5 -10 0z" fill="' + (i % 3 ? '#D9A441' : '#8FB85A') + '"/>');
    return s;
  }
  /* 神話故事關卡的插圖：那一族的山林或海邊背景，加上幾位族人。只畫人，不畫太陽、巨人、神靈或故事裡的危險場面 */
  var STORY_FIG = [
    [['villager-a-stand', 430, 1], ['villager-b-stand', 560, -1]],
    [['villager-a-walk', 400, 1], ['warrior-stand', 560, -1]],
    [['warrior-run', 380, 1], ['archer-run', 500, 1], ['villager-b-stand', 640, -1]],
    [['warrior-stand', 400, 1], ['archer-stand', 520, 1], ['villager-a-stand', 640, -1]],
    [['warrior-stand', 360, 1], ['hero-stand', 500, 1], ['archer-stand', 640, -1]]
  ];
  function storyScene(tribe, i) {
    var A = AS; if (!newArt || !A || !A.field || !A.field[tribe] || !A.people) return '';
    var s = '';
    (STORY_FIG[i] || STORY_FIG[0]).forEach(function (f) { var b = A.people[tribe + '-' + f[0]]; if (b) s += '<g transform="translate(' + f[1] + ' 356) scale(' + (2.4 * f[2]) + ' 2.4)" style="color:#F2EAD6">' + b + '</g>'; });
    return '<svg class="sscene" viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid slice" role="img" aria-label="故事插圖：族人">' + A.field[tribe].back + s + A.field[tribe].front + '</svg>';
  }
  /* 有第二包美術素材時：雙方的人物（每種兵三個姿勢、英雄）、守方族群的樹木、特效，放進這個 svg 自己的 <defs>。
   * 人物照雙方的兵種階級換成第 2、3 階的樣子（sh.aTier、sh.dTier；舊戰報沒有就是第 1 階）。代號用「哪一方」區分，兩邊同一族也不會混在一起 */
  var PK = { w: 'warrior', a: 'archer', um: 'unique', ur: 'unique' }, POSE = { run: 'run', lunge: 'attack', loose: 'attack' };
  function battleArt(td, ta) { return newArt && AS && AS.field && AS.field[td.id] && AS.people && AS.people[td.id + '-warrior-stand'] && (!ta || AS.people[ta.id + '-warrior-stand']) ? AS : null; }
  var TIER_K = { warrior: 'w', archer: 'a', unique: 'u' };
  function showDefs(A, sh, ta, td) {
    var s = '<defs>';
    [['a', ta.id], ['d', td.id]].forEach(function (x) {
      var sd = x[0], t = x[1], tier = sh[sd + 'Tier'] || {};
      ['warrior', 'archer', 'unique'].forEach(function (k) {
        var n = tier[TIER_K[k]] || 1;
        ['stand', 'run', 'attack'].forEach(function (p) { var nm = t + '-' + k + '-' + p, b = (n > 1 && A.people[nm + '-t' + n]) || A.people[nm]; if (b) s += '<g id="bp-' + sd + '-' + k + '-' + p + '">' + b + '</g>'; });
      });
      if (A.people[t + '-hero-stand']) s += '<g id="bp-' + sd + '-hero">' + A.people[t + '-hero-stand'] + '</g>';
    });
    ['tree-a', 'tree-b', 'tree-c', 'tree-big', 'bush', 'rock', 'log'].forEach(function (n) { var b = A.nature[td.id + '-' + n]; if (b) s += '<g id="bn-' + n + '">' + b + '</g>'; });
    Object.keys(A.fx || {}).forEach(function (n) { s += '<g id="bx-' + n + '">' + A.fx[n] + '</g>'; });
    return s + '</defs>';
  }
  /* 在 svg 裡演出一場對戰。rep：戰報（rep.show 是雙方的資料、rep.log 是每一回合的紀錄）；
   * opt.onDone：演完時呼叫；opt.end：不演，直接顯示結束的樣子。回傳 { finish(): 直接跳到結束 } */
  function battleShow(svg, rep, opt) {
    opt = opt || {};
    var sh = rep.show, log = rep.log || [], ta = Tribes.get(sh.aTribe), td = Tribes.get(sh.dTribe), point = !!sh.point, coast = td.look.backdrop === 'coast';
    var win = rep.role === 'atk' ? !!rep.win : !rep.win;   // 進攻方有沒有贏
    var seed = (Math.floor(rep.t || 1) % 2147483646) + 1, rand = function () { seed = seed * 48271 % 2147483647; return seed / 2147483647; };
    var col = { a: ta.color, d: ta.id === td.id ? shade(td.color, -34) : td.color }, band = { a: '#F2EAD6', d: '#1B2A33' };
    var ukind = { a: ta.uniq && ta.uniq.unit.kind === 'ranged' ? 'ur' : 'um', d: td.uniq && td.uniq.unit.kind === 'ranged' ? 'ur' : 'um' };
    function n3(o) { return o.w + o.a + (o.u || 0); }
    var fscale = { a: Math.min(1, MAXFIG / Math.max(1, n3(sh.start.a))), d: Math.min(1, MAXFIG / Math.max(1, n3(sh.start.d))) };
    function shown(sd, c) { var o = {}; ['w', 'a', 'u'].forEach(function (k) { o[k] = c[k] > 0 ? Math.max(1, Math.round(c[k] * fscale[sd])) : 0; }); return o; }
    var ART = battleArt(td, ta), FS = ART ? 1.3 : 1.22, trees = '', i;   // FS：人物放大的倍數（素材的人物比程式畫的高）
    if (ART) [[206, 204, 'tree-big', 0.76], [694, 198, 'tree-big', 0.72], [356, 210, 'tree-a', 1.0], [546, 204, 'tree-c', 0.95], [796, 228, 'tree-b', 1.0], [270, 298, 'bush', 1.3], [452, 262, 'rock', 1.2],
      [612, 318, 'log', 1.1], [744, 352, 'tree-a', 1.2], [134, 356, 'tree-b', 1.25], [524, 388, 'bush', 1.4], [372, 374, 'rock', 1.3]].forEach(function (t) {
      if (ART.nature[td.id + '-' + t[2]]) trees += '<g class="btree" data-y="' + t[1] + '">' + use('bn-' + t[2], t[0], t[1], t[3]) + '</g>';
    });
    else [[196, 214, 1.0], [338, 198, 0.9], [486, 222, 1.05], [628, 200, 0.92], [772, 216, 1.0], [262, 306, 1.25], [436, 338, 1.4], [600, 304, 1.25], [748, 342, 1.35], [108, 368, 1.5], [540, 392, 1.5]].forEach(function (t, n) {
      trees += '<g class="btree" data-y="' + t[1] + '">' + use(bTree(coast, n + 40), t[0], t[1], t[2]) + '</g>';
    });
    var me = rep.role === 'atk' ? 'a' : 'd', leaves = '';
    if (ART) for (i = 0; i < 12; i++) leaves += at(90 + rnd(i, 91) * 880, 30 + rnd(i, 92) * 60, '<g class="leaf" style="animation-delay:' + Math.round(-rnd(i, 93) * 8000) + 'ms;animation-duration:' + Math.round(6000 + rnd(i, 94) * 5000) + 'ms">' + '<use href="#bx-leaf-' + (i % 3 ? 'b' : 'a') + '" transform="scale(.6)"/></g>');
    svg.innerHTML = (ART ? showDefs(ART, sh, ta, td) : '') + '<g class="bq">' + (ART ? ART.field[td.id].back + showEdge(td, sh) : showBack(ta, td, sh)) + '<g class="bz">' + trees + '</g><g class="bfx"></g>' + (ART ? ART.field[td.id].front + leaves : showFront(td)) + '</g><g class="btop">' +
      '<rect class="bchip' + (me === 'a' ? ' me' : '') + '" x="10" y="10" width="270" height="32" rx="16"/><text class="bnum" id="bn-a" x="145" y="32" text-anchor="middle"></text>' +
      '<rect class="bchip' + (me === 'd' ? ' me' : '') + '" x="720" y="10" width="270" height="32" rx="16"/><text class="bnum" id="bn-d" x="855" y="32" text-anchor="middle"></text>' +
      '<rect class="bchip mid" x="400" y="10" width="200" height="32" rx="16"/><text class="bnum mid" id="bn-m" x="500" y="32" text-anchor="middle"></text></g>';
    var Z = svg.querySelector('.bz'), FX = svg.querySelector('.bfx'), TOP = svg.querySelector('.btop'), Q = svg.querySelector('.bq');
    Array.prototype.forEach.call(Z.children, function (el) { el._y = +el.getAttribute('data-y'); });
    var figs = [], arrows = [], events = [], stopped = false, T = 0, t0 = 0, lastSort = -1e9, order = '';
    function nm(x) { x = String(x || ''); return x.length > 8 ? x.slice(0, 7) + '…' : x; }
    function bar(a, d, mid) { svg.querySelector('#bn-a').textContent = nm(sh.aName) + ' · ' + a + ' 人'; svg.querySelector('#bn-d').textContent = (point && !sh.dName ? '駐守' : nm(sh.dName)) + ' · ' + d + ' 人'; svg.querySelector('#bn-m').textContent = mid; }
    function add(parent, html) { parent.insertAdjacentHTML('beforeend', html); return parent.lastElementChild; }
    function later(ms, fn) { events.push({ t: T + ms, fn: fn }); }
    function fx(html, life) { var el = add(FX, html); later(life, function () { if (el.parentNode) el.parentNode.removeChild(el); }); return el; }
    function place(f) {
      f.el.setAttribute('transform', 'translate(' + f1(f.x) + ' ' + f1(f.y) + ') scale(' + (depth(f.y) * FS).toFixed(3) + ')');
      f.fl.setAttribute('transform', f.face < 0 ? 'scale(-1 1)' : 'scale(1 1)'); f.el._y = f.y;
    }
    function pose(f, cls) {
      if (f.cls === cls) return;
      f.cls = cls; f.bb.setAttribute('class', 'bb ' + cls);
      if (f.use) f.use.setAttribute('href', '#bp-' + f.sd + '-' + f.pk + '-' + (POSE[cls] || 'stand'));   // 素材的人物：換成跑步、出擊、站立的姿勢
    }
    function mk(sd, type, x, y) {
      var kind = type === 'u' ? ukind[sd] : type, isU = type === 'u';
      var tr = sd === 'a' ? ta.id : td.id, ring = '<ellipse cx="0" cy="1" rx="10" ry="3.3" fill="' + (sd === 'a' ? '#F2EAD6' : '#0B161C') + '" opacity="' + (ART ? '.4' : '.5') + '"/>';
      var el = add(Z, '<g class="bf"><g>' + (ART ? '<g class="bb idle" style="color:' + band[sd] + '">' + ring + '<use href="#bp-' + sd + '-' + PK[kind] + '-stand"/></g>'
        : '<g class="bb idle">' + ring + figure(kind, isU ? shade(col[sd], -22) : col[sd], isU ? '#E3B341' : band[sd]) + '</g>') + '</g></g>');
      var f = { el: el, fl: el.firstChild, bb: el.firstChild.firstChild, sd: sd, type: type, tribe: tr, pk: PK[kind], melee: kind === 'w' || kind === 'um', x: x, y: y, face: sd === 'a' ? 1 : -1, mv: null, gone: false, cls: 'idle' };
      if (ART) f.use = f.bb.lastChild;
      place(f); figs.push(f); return f;
    }
    function go(f, x, y, ms, delay, then) { f.mv = { x1: x, y1: Math.max(B_TOP, Math.min(B_BOT, y)), t0: T + (delay || 0), ms: Math.max(60, ms), then: then, on: false }; }
    function live(sd, melee) { return figs.filter(function (f) { return f.sd === sd && !f.gone && (melee == null || f.melee === melee); }); }
    function shuffle(a) { for (var n = a.length - 1; n > 0; n--) { var j = Math.floor(rand() * (n + 1)), x = a[n]; a[n] = a[j]; a[j] = x; } return a; }
    function edgeX(sd) { return sd === 'a' ? -46 : 1046; }
    function home(sd, melee) { return sd === 'a' ? (melee ? 250 + rand() * 150 : 160 + rand() * 90) : (melee ? 600 + rand() * 150 : 748 + rand() * 86); }
    function enter(sd, type, delay) {   // 從自己那一邊跑進場
      var melee = (type === 'u' ? ukind[sd] : type) !== 'a' && (type === 'u' ? ukind[sd] : type) !== 'ur', y = B_TOP + 8 + rand() * (B_BOT - B_TOP - 16);
      var f = mk(sd, type, edgeX(sd) + (sd === 'a' ? -rand() * 60 : rand() * 60), sd === 'd' && !point ? 292 + (rand() - 0.5) * 30 : y);
      go(f, home(sd, melee), y, 900 + rand() * 500, delay || 0); return f;
    }
    function retreat(f, delay) {   // 失去戰力：晃一下，轉身跑回自己那一邊
      f.gone = true;
      later(delay || 0, function () {
        pose(f, 'hit'); f.mv = null;
        later(280, function () {
          var x = edgeX(f.sd), y = f.sd === 'd' && !point ? 292 + (rand() - 0.5) * 40 : f.y + (rand() - 0.5) * 50;
          f.out = true; go(f, x, y, Math.abs(x - f.x) / 0.36, 0, function () { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); figs.splice(figs.indexOf(f), 1); });
        });
      });
    }
    function shoot(from, to, delay, tower) {   // 一支箭：拋物線飛過去，落地揚起一點土
      later(delay, function () {
        if (!tower && (from.gone || !from.el.parentNode)) return;
        if (!tower) { from.face = to.x > from.x ? 1 : -1; place(from); pose(from, 'loose'); later(700, function () { if (!from.gone && !from.mv) pose(from, 'idle'); }); }
        var x0 = from.x + (tower ? 0 : from.face * 12), y0 = from.y - (tower ? 62 : 26 * depth(from.y)), x1 = to.x + (rand() - 0.5) * 16, y1 = to.y - 14;
        var el = add(FX, '<g class="barrow">' + (ART ? '<use href="#bx-arrow" transform="scale(.8)"/>' : '<path d="M-9 0h17" stroke="#F4EEDC" stroke-width="2" stroke-linecap="round"/><path d="M9 0l-6 -3v6z" fill="#F4EEDC"/>') + '</g>');
        arrows.push({ el: el, x0: x0, y0: y0, x1: x1, y1: y1, t0: T, ms: 380 + Math.abs(x1 - x0) * 0.5, h: 34 + Math.abs(x1 - x0) * 0.1, to: to });
      });
    }
    function clash(x, y) {
      fx(at(x, y - 22, ART ? '<g class="clash"><use href="#bx-clash" transform="scale(1.3)"/></g>' : '<path class="clash" d="' + STAR + '" fill="#FFE9A8" stroke="#E3B341" stroke-width="2"/>'), 620);
      fx(at(x - 12, y, ART ? '<g class="dust"><use href="#bx-dust" transform="scale(.6)"/></g>' : '<circle class="dust" r="6" fill="#EADFC0"/>'), 760);
      fx(at(x + 12, y + 2, ART ? '<g class="dust"' + dly(120) + '><use href="#bx-dust" transform="scale(.5)"/></g>' : '<circle class="dust"' + dly(120) + ' r="5" fill="#EADFC0"/>'), 880);
    }
    function shout(sd, t) {   // 英雄發動能力：喊出能力的名字，英雄站出來
      var x = sd === 'a' ? 235 : 765, flip = sd === 'd', ab = t.hero.ability, one = ab === 'steadfast', wpn = ab === 'unity' ? 'w' : one ? '' : 'a', body = t.color;
      var el = add(TOP, at(x, 78, '<g class="shout hero"><rect x="-92" y="-19" width="184" height="36" rx="18"/><text y="7" text-anchor="middle">★ ' + t.hero.abilityZh + '！</text></g>') +
        '');
      var hero = add(TOP, at(sd === 'a' ? 118 : 882, 300, '<g class="heroin"><ellipse class="ring" cx="0" cy="-22" rx="46" ry="38" fill="rgba(255,233,168,.3)" stroke="#E3B341" stroke-width="2.6"/>' +
        '<g transform="scale(' + (flip ? -1.7 : 1.7) + ' 1.7)" style="color:#E3B341">' + (ART && ART.people[t.id + '-hero-stand'] ? '<use href="#bp-' + sd + '-hero"/>' : (one ? '' : '<g transform="translate(-14 3)">' + figure(wpn, shade(body, -20), '#E3B341') + '</g>') + figure(wpn, body, '#E3B341') +
        (one ? '<path d="M-6.4 -22.6a6.4 6.4 0 0 1 12.8 0z" fill="#3A3F45"/><path d="M-8 -22.6h16" stroke="#3A3F45" stroke-width="1.8" stroke-linecap="round"/>' : '')) + '</g></g>'));
      later(2600, function () { [el, hero].forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); }); });
    }
    function settle(rec) {   // 這一回合結束：照紀錄裡剩下的人數，讓多出來的人撤退
      ['a', 'd'].forEach(function (sd) {
        var want = shown(sd, rec[sd]);
        ['w', 'u', 'a'].forEach(function (k) {
          var have = figs.filter(function (f) { return f.sd === sd && f.type === k && !f.gone; }), diff = have.length - want[k], n;
          for (n = 0; n < diff; n++) retreat(have[have.length - 1 - n], n * 110);
          for (n = 0; n < -diff; n++) enter(sd, k, n * 140);
        });
      });
      bar(n3(rec.a), n3(rec.d), rec.r === 0 ? '開場遠射' : '第 ' + rec.r + ' 回合');
    }
    function heroes(rec) {
      if (rec.ha) shout('a', ta); if (rec.hd) shout('d', td);
      [['a', rec.backA], ['d', rec.backD]].forEach(function (x) {   // 世代接力：負傷的人從後面跑回來
        var n = x[1] ? Math.max(1, Math.round(x[1] * fscale[x[0]])) : 0;
        for (var j = 0; j < n; j++) enter(x[0], 'w', 300 + j * 160);
      });
    }
    function volleys(dur, per) {   // 雙方的弓手和瞭望台放箭
      ['a', 'd'].forEach(function (sd) {
        var foe = live(sd === 'a' ? 'd' : 'a'), mine = live(sd, false);
        if (!foe.length) return;
        mine.forEach(function (f) { for (var n = 0; n < per; n++) shoot(f, foe[Math.floor(rand() * foe.length)], 120 + rand() * (dur - 900) + n * 260); });
        if (sd === 'd' && !point) [[212], [366], [300]].slice(0, Math.min(3, sh.towerN)).forEach(function (tw) {
          shoot({ x: fenceX(tw[0]) + 30, y: tw[0] }, foe[Math.floor(rand() * foe.length)], 200 + rand() * (dur - 900), true);
        });
      });
    }
    function meleeRound(dur) {   // 近戰：每個人找一個對手，跑到樹林間的某個地方纏鬥；每一回合都換位置、換對手
      var A = live('a', true), D = live('d', true), fa = shuffle(A.length ? A : live('a')), fd = shuffle(D.length ? D : live('d')), pairs = [], n = Math.max(fa.length, fd.length);
      if (!fa.length || !fd.length) return;
      for (var j = 0; j < n; j++) {
        var a = fa[j % fa.length], d = fd[j % fd.length], p;
        if (j < Math.min(fa.length, fd.length)) {
          p = { x: Math.max(300, Math.min(720, (a.x + d.x) / 2 + (rand() - 0.5) * 240)), y: Math.max(B_TOP + 6, Math.min(B_BOT - 6, (a.y + d.y) / 2 + (rand() - 0.5) * 110)) };
          pairs.push(p);
          (function (a, d, p) {
            var ms = 480 + rand() * 260, wait = rand() * 220;
            go(a, p.x - 15, p.y, ms, wait, function () { pose(a, 'lunge'); a.face = 1; place(a); });
            go(d, p.x + 15, p.y + 3, ms, wait, function () { pose(d, 'lunge'); d.face = -1; place(d); clash(p.x, p.y); });
            later(wait + ms + 520, function () { if (!a.gone && !d.gone) clash(p.x + (rand() - 0.5) * 10, p.y); });
          })(a, d, p);
        } else {   // 人多的一邊：多出來的人去幫同伴，變成二打一
          p = pairs[j % pairs.length];
          (function (f, p, k) {
            var side = f.sd === 'a' ? -1 : 1;
            go(f, p.x + side * (32 + k * 6), p.y + (k % 2 ? 15 : -13), 560 + rand() * 300, 150 + rand() * 300, function () { pose(f, 'lunge'); f.face = -side; place(f); });
          })(fa.length > fd.length ? a : d, p, j);
        }
      }
      live('a', false).concat(live('d', false)).forEach(function (f) {   // 弓手在後面換位置
        if (f.melee || f.mv || (A.length === 0 && f.sd === 'a') || (D.length === 0 && f.sd === 'd')) return;
        go(f, home(f.sd, false), f.y + (rand() - 0.5) * 60, 500, rand() * 300);
      });
      later(700, function () { Q.setAttribute('class', 'bq quake'); later(700, function () { Q.setAttribute('class', 'bq'); }); });
      volleys(dur, 1);
    }
    function ending() {
      var losers = live(win ? 'd' : 'a'), winners = live(win ? 'a' : 'd');
      losers.forEach(function (f, n) { retreat(f, n * 80); });
      winners.forEach(function (f, n) {
        if (win && !point) go(f, 770 + rand() * 70, f.y, 700 + rand() * 300, 300 + rand() * 300, function () { pose(f, 'cheer'); });
        else later(400 + n * 60, function () { if (!f.mv) pose(f, 'cheer'); });
      });
      if (win && !point) later(1100, flag);
      bar(n3(lastRec ? lastRec.a : sh.start.a), n3(lastRec ? lastRec.d : sh.start.d), win ? (point ? '搶下來了' : '攻下來了') : '守住了');
    }
    function flag() { add(FX, at(fenceX(292) - 6, 300, '<g class="bflag plant"><path d="M0 0V-58" stroke="#6B4A32" stroke-width="3.4" stroke-linecap="round"/><path class="banner" d="M0 -58l32 10-32 10z" fill="' + ta.color + '" stroke="#F2EAD6" stroke-width="1.4"/></g>')); }
    var lastRec = log[log.length - 1] || null, done = false;
    function finishUp() { if (done) return; done = true; if (opt.onDone) opt.onDone(); }
    /* 直接擺出結束的樣子：贏的一方留在場上歡呼 */
    function finish() {
      stopped = true; events = []; arrows = [];
      figs.forEach(function (f) { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); }); figs = [];
      FX.innerHTML = ''; Q.setAttribute('class', 'bq');
      Array.prototype.slice.call(TOP.querySelectorAll('.shout, .heroin')).forEach(function (e) { var p = e.parentNode; if (p && p.parentNode) p.parentNode.removeChild(p); });
      var sd = win ? 'a' : 'd', c = shown(sd, lastRec ? lastRec[sd] : sh.start[sd]), list = [];
      ['w', 'u', 'a'].forEach(function (k) { for (var n = 0; n < c[k]; n++) list.push(k); });
      list.forEach(function (k, n) {
        var y = B_TOP + 10 + (n + 0.5) / list.length * (B_BOT - B_TOP - 20), x = win && !point ? 760 + rnd(n, 31) * 80 : (sd === 'a' ? 250 : 560) + rnd(n, 32) * 190;
        pose(mk(sd, k, x, y), 'cheer');
      });
      sortZ(true);
      if (win && !point) flag();
      bar(n3(lastRec ? lastRec.a : sh.start.a), n3(lastRec ? lastRec.d : sh.start.d), win ? (point ? '搶下來了' : '攻下來了') : '守住了');
      finishUp();
    }
    function sortZ(force) {   // 依照遠近重新排列人和樹，近的蓋住遠的
      if (!force && T - lastSort < 140) return;
      lastSort = T;
      var kids = Array.prototype.slice.call(Z.children).sort(function (p, q) { return p._y - q._y; }), sig = kids.map(function (k) { return k._y.toFixed(0); }).join(',');
      if (sig === order && !force) return;
      order = sig; kids.forEach(function (k) { Z.appendChild(k); });
    }
    function frame(now) {
      if (stopped || !svg.isConnected) return;
      if (!t0) t0 = now;
      T = now - t0;
      var due = events.filter(function (e) { return e.t <= T; });
      if (due.length) { events = events.filter(function (e) { return e.t > T; }); due.sort(function (p, q) { return p.t - q.t; }).forEach(function (e) { if (!stopped) e.fn(); }); }
      if (stopped) return;
      figs.slice().forEach(function (f) {
        var m = f.mv; if (!m || T < m.t0) return;
        if (!m.on) { m.on = true; m.x0 = f.x; m.y0 = f.y; if (Math.abs(m.x1 - f.x) > 3) f.face = m.x1 > f.x ? 1 : -1; pose(f, 'run'); }
        var p = Math.min(1, (T - m.t0) / m.ms), e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
        f.x = m.x0 + (m.x1 - m.x0) * e; f.y = m.y0 + (m.y1 - m.y0) * e; place(f);
        if (f.out) f.el.style.opacity = p > 0.7 ? ((1 - p) / 0.3).toFixed(2) : '1';
        if (p >= 1) { f.mv = null; pose(f, 'idle'); if (!f.out) { f.face = f.sd === 'a' ? 1 : -1; place(f); } if (m.then) m.then(); }
      });
      arrows = arrows.filter(function (a) {
        var p = (T - a.t0) / a.ms;
        if (p >= 1) {
          if (a.el.parentNode) a.el.parentNode.removeChild(a.el);
          fx(at(a.x1, a.y1 + 14, '<circle class="puff" r="5" fill="#EADFC0"/>'), 520);
          if (a.to && a.to.bb && !a.to.gone && !a.to.mv && a.to.cls === 'idle') { pose(a.to, 'hit'); (function (f) { later(520, function () { if (!f.gone && !f.mv && f.cls === 'hit') pose(f, 'idle'); }); })(a.to); }
          return false;
        }
        var x = a.x0 + (a.x1 - a.x0) * p, y = a.y0 + (a.y1 - a.y0) * p - Math.sin(Math.PI * p) * a.h;
        var dx = a.x1 - a.x0, dy = a.y1 - a.y0 - Math.PI * Math.cos(Math.PI * p) * a.h;
        a.el.setAttribute('transform', 'translate(' + f1(x) + ' ' + f1(y) + ') rotate(' + f1(Math.atan2(dy, dx) * 57.3) + ')');
        return true;
      });
      sortZ(false);
      requestAnimationFrame(frame);
    }
    if (opt.end || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) { finish(); return { finish: finish }; }
    // 排演出的時間表：進場 → 每一回合 → 收尾
    bar(n3(sh.start.a), n3(sh.start.d), point ? sh.point + '的較量' : '兩軍接近');
    ['a', 'd'].forEach(function (sd) { var c = shown(sd, sh.start[sd]), n = 0; ['w', 'u', 'a'].forEach(function (k) { for (var j = 0; j < c[k]; j++) enter(sd, k, 60 * n++); }); });
    var tt = 1700, rd = Math.max(1250, Math.min(1900, 9000 / Math.max(1, log.length)));
    log.forEach(function (rec) {
      var far = rec.r === 0, dur = far ? 1500 : rd;
      later(tt, function () { heroes(rec); bar(n3(prevCount.a), n3(prevCount.d), far ? '開場遠射' : '第 ' + rec.r + ' 回合'); if (far) volleys(dur, 2); else meleeRound(dur); });
      later(tt + dur - 420, function () { settle(rec); prevCount = rec; });
      tt += dur;
    });
    var prevCount = { a: sh.start.a, d: sh.start.d };
    later(tt + 250, ending);
    later(tt + 2300, function () { stopped = true; finishUp(); });
    requestAnimationFrame(frame);
    return { finish: finish };
  }

  /* 地面底圖：畫在畫布上再當成一張圖，縮放平移才順。 */
  var groundCache = {};
  var GRASS = { amis: '#8DB55C', atayal: '#84AC58', bunun: '#7BA262', paiwan: '#89B15A' };   // 新的美術：和部落場景示意圖一樣明亮的草地
  function groundURL(t) {
    var art = natureOn(t), key = t.id + (art ? '+' : '');
    if (groundCache[key]) return groundCache[key];
    var k = t.look, cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
    var c = cv.getContext('2d'), base = art ? GRASS[t.id] || shade(k.ground, 30) : k.ground, i, g;
    c.fillStyle = shade(base, art ? -4 : -32); c.fillRect(0, 0, SW, SH);
    for (i = 0; i < 180; i++) {   // 林地的深淺變化
      var x = rnd(i, 11) * SW, y = rnd(i, 12) * SH, r = 50 + rnd(i, 13) * 130, col = art ? (i % 2 ? shade(base, -14) : shade(base, 12)) : i % 2 ? shade(base, -44) : shade(base, -20);
      g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
    }
    var ctr = P(CX, CY), rx = (art ? 21 : 16) * U * 1.414;
    c.save(); c.translate(ctr[0], ctr[1]); c.scale(1, 0.5);   // 開墾地：比周圍亮的草地
    g = c.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx); g.addColorStop(0, shade(base, 14)); g.addColorStop(0.7, base); g.addColorStop(1, rgba(base, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 6.3); c.fill();
    var pr = 3.5 * U * 1.414;                                   // 中央的廣場
    g = c.createRadialGradient(0, 0, pr * 0.45, 0, 0, pr); g.addColorStop(0, 'rgba(196,170,122,.95)'); g.addColorStop(1, 'rgba(196,170,122,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, pr, 0, 6.3); c.fill();
    c.restore();
    for (i = 0; i < 420; i++) {   // 草叢筆觸
      var a = rnd(i, 21) * 6.283, rr = Math.sqrt(rnd(i, 22)) * rx, gx = ctr[0] + Math.cos(a) * rr, gy = ctr[1] + Math.sin(a) * rr * 0.5;
      c.strokeStyle = rgba(shade(base, i % 2 ? 26 : -16), 0.5); c.lineWidth = 1.6; c.beginPath(); c.moveTo(gx - 4, gy); c.lineTo(gx - 2, gy - 5); c.moveTo(gx, gy); c.lineTo(gx + 1, gy - 6); c.moveTo(gx + 4, gy); c.lineTo(gx + 3, gy - 4); c.stroke();
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (k.backdrop === 'coast') {   // 海岸：沙灘、海面、浪花
      var edge = function (off) { c.beginPath(); c.moveTo(0, shore(0) + off); for (var x2 = 0; x2 <= SW; x2 += 20) c.lineTo(x2, shore(x2) + off); c.lineTo(SW, SH); c.lineTo(0, SH); c.closePath(); };
      edge(-34); c.fillStyle = '#E2CF9C'; c.fill();
      edge(4); c.fillStyle = '#3E8FB8'; c.fill();
      edge(44); c.fillStyle = '#2F7CA6'; c.fill();
      [[6, 0.8], [26, 0.45], [58, 0.3]].forEach(function (wv) {
        c.beginPath(); for (var x3 = 0; x3 <= SW; x3 += 20) { var y3 = shore(x3) + wv[0] + 3 * Math.sin(x3 / 37); if (x3) c.lineTo(x3, y3); else c.moveTo(x3, y3); }
        c.strokeStyle = 'rgba(255,255,255,' + wv[1] + ')'; c.lineWidth = 3; c.stroke();
      });
    } else {                        // 山區：一條溪
      [[30, '#2E6F8E'], [20, '#4C93B5'], [5, 'rgba(255,255,255,.35)']].forEach(function (wv) {
        c.beginPath(); for (var y4 = -20; y4 <= SH + 20; y4 += 20) { if (y4 > -20) c.lineTo(stream(y4), y4); else c.moveTo(stream(y4), y4); }
        c.strokeStyle = wv[1]; c.lineWidth = wv[0]; c.stroke();
      });
    }
    g = c.createRadialGradient(SW / 2, SH / 2, SH * 0.45, SW / 2, SH / 2, SW * 0.62);   // 四周壓暗
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, art ? 'rgba(6,16,20,.2)' : 'rgba(6,16,20,.45)'); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
    return (groundCache[key] = cv.toDataURL('image/jpeg', 0.86));
  }

  // ---------- 世界地圖（自然風格：平滑海岸線、暈染的區域色塊、山脈起伏） ----------
  function tracePath(c, poly) {
    var sp = Geo.smoothPoints(poly), last = sp[sp.length - 1].m;
    c.beginPath(); c.moveTo(last[0], last[1]);
    sp.forEach(function (q) { c.quadraticCurveTo(q.c[0], q.c[1], q.m[0], q.m[1]); });
    c.closePath();
  }
  function blob(c, x, y, r, color, a0) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a0)); g.addColorStop(0.55, rgba(color, a0 * 0.6)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
  }
  /* 把底圖畫在畫布上（scale = 每個地圖單位幾個像素），之後當成一張圖來縮放平移。 */
  function paintMap(scale) {
    var G = Geo.build(), W = Geo.MAP_W, H = Geo.MAP_H, cv = document.createElement('canvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    var c = cv.getContext('2d'); c.scale(scale, scale); c.lineJoin = 'round'; c.lineCap = 'round';
    // 海面不畫在底圖上，由場景的背景色呈現，縮放平移時才不會看到底圖的邊界
    var lands = [Geo.OUTLINE, Geo.ISLETS.lanyu, Geo.ISLETS.ludao];
    lands.forEach(function (p) {   // 近岸的淺水
      tracePath(c, p); c.strokeStyle = 'rgba(120,195,205,.10)'; c.lineWidth = 15; c.stroke();
      c.strokeStyle = 'rgba(150,215,215,.13)'; c.lineWidth = 7; c.stroke();
    });
    c.save(); tracePath(c, Geo.OUTLINE); c.fillStyle = '#93A97C'; c.fill(); c.clip();
    G.hexes.forEach(function (h) {
      if (h.islet) return;
      if (h.tribe) blob(c, h.x, h.y, Geo.HEX_SIZE * 2, Tribes.get(h.tribe).color, 0.66);
      else blob(c, h.x, h.y, Geo.HEX_SIZE * 1.8, '#D8CB93', 0.5);   // 野地：平原的草色
    });
    Geo.RANGES.forEach(function (line) {   // 山脈的陰影
      [[17, .07], [10, .08], [4.5, .10]].forEach(function (wv) {
        c.beginPath(); line.forEach(function (p, i) { var q = Geo.project(p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
        c.strokeStyle = 'rgba(18,40,40,' + wv[1] + ')'; c.lineWidth = wv[0]; c.stroke();
      });
    });
    Geo.RANGES.forEach(function (line, li) {   // 沿著稜線畫小山峰
      for (var i = 0; i < line.length - 1; i++) {
        var a = Geo.project(line[i][0], line[i][1]), b = Geo.project(line[i + 1][0], line[i + 1][1]);
        var n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6.5));
        for (var j = 0; j < n; j++) {
          var f = j / n, off = ((i * 7 + j * 13 + li * 5) % 9 - 4) * 0.9, sz = 2.6 + ((i + j * 3) % 4) * 0.5;
          var x = a[0] + (b[0] - a[0]) * f + off, y = a[1] + (b[1] - a[1]) * f + off * 0.4;
          c.fillStyle = 'rgba(255,255,255,.34)'; c.beginPath(); c.moveTo(x - sz, y + sz * 0.7); c.lineTo(x, y - sz * 0.8); c.lineTo(x, y + sz * 0.7); c.fill();
          c.fillStyle = 'rgba(16,38,40,.36)'; c.beginPath(); c.moveTo(x, y - sz * 0.8); c.lineTo(x + sz, y + sz * 0.7); c.lineTo(x, y + sz * 0.7); c.fill();
        }
      }
    });
    var lake = Geo.project(120.91, 23.86);   // 日月潭
    c.fillStyle = '#5FB4D6'; c.beginPath(); c.ellipse(lake[0], lake[1], 1.5, 1.1, 0.5, 0, 6.3); c.fill();
    c.restore();
    tracePath(c, Geo.OUTLINE); c.strokeStyle = 'rgba(244,232,196,.9)'; c.lineWidth = 0.7; c.stroke();
    [['lanyu', Tribes.get('tao').color], ['ludao', '#93A97C']].forEach(function (it) {
      tracePath(c, Geo.ISLETS[it[0]]); c.fillStyle = it[1]; c.fill(); c.strokeStyle = 'rgba(244,232,196,.9)'; c.lineWidth = 0.6; c.stroke();
    });
    return cv;
  }
  function mapLabels() {
    var G = Geo.build(), s = '';
    Tribes.LIST.forEach(function (t) {
      var c = G.centroid[t.id]; if (!c) return;
      var small = (G.regions[t.id] || []).length < 10, y = t.id === 'tao' ? c[1] + 9 : c[1];
      s += '<text class="rlabel' + (small ? ' minor' : '') + (t.playable ? ' play' : '') + '" x="' + c[0] + '" y="' + y + '">' + t.zh.replace('族', '').replace('（達悟）', '') + '</text>';
    });
    return s;
  }

  return { need: need, ready: function (t) { return !AS || !!packs[t]; }, onLoad: function (fn) { onLoad.push(fn); }, icon: icon, iconBody: iconBody, scene: scene, battleShow: battleShow, building: function (type, t, level) { return bld(type, t.look, t, level); },
    hasNewArt: function () { return !!AS; }, newArt: function () { return newArt; },
    storyScene: storyScene, setNewArt: function (on) { newArt = !!AS && !!on; try { localStorage.setItem('shanhai_art', newArt ? 'new' : 'old'); } catch (e) { /* 記不住就只在這次有效 */ } }, BW: BW, BH: BH, decor: decor, groundURL: groundURL, sitePos: sitePos, person: person, DEFS: DEFS, SW: SW, SH: SH,
    paintMap: paintMap, mapLabels: mapLabels, shade: shade };
})();
