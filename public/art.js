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
    flag: '<path d="M3.2 15V1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M4.2 2.4h9.3l-2.6 3 2.6 3H4.2z" fill="currentColor"/>',
    shield: '<path d="M8 1.2 14 3.5v4.3c0 3.4-2.4 5.9-6 7-3.6-1.1-6-3.6-6-7V3.5z" fill="currentColor"/>'
  };
  function icon(name, cls) { return '<svg class="ic ' + (cls || 'ic-' + name) + '" viewBox="0 0 16 16" aria-hidden="true">' + ICONS[name] + '</svg>'; }

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
  var TOP = { center: 82, house: 58, farm: 26, mat: 36, special: 48, storage: 64, barracks: 56, tower: 104 };   // 各建築大約多高，用來放等級標記

  // 樹、石頭、草叢：定義一次，用 <use> 重複放
  var DEFS = '<defs>' +
    '<g id="t-c"><ellipse cx="0" cy="1" rx="11" ry="3.6" fill="#000" opacity=".25"/><rect x="-2" y="-11" width="4" height="12" fill="#6B4A32"/><polygon points="-16,-8 0,-36 16,-8" fill="#2F6B4F"/><polygon points="0,-36 16,-8 0,-8" fill="#25573F"/><polygon points="-11,-25 0,-52 11,-25" fill="#3A7C5B"/><polygon points="0,-52 11,-25 0,-25" fill="#2D6449"/></g>' +
    '<g id="t-b"><ellipse cx="0" cy="1" rx="14" ry="4.2" fill="#000" opacity=".25"/><rect x="-2.5" y="-15" width="5" height="16" fill="#6B4A32"/><circle cx="-8" cy="-23" r="12" fill="#3E7D4E"/><circle cx="8" cy="-25" r="13" fill="#357245"/><circle cx="0" cy="-35" r="13" fill="#4A8E59"/><circle cx="-4" cy="-39" r="6.5" fill="#63A96E" opacity=".85"/></g>' +
    '<g id="t-r"><polygon points="-13,2 -9,-10 3,-15 13,-6 14,2" fill="#8E9196"/><polygon points="3,-15 13,-6 14,2 2,2" fill="#74777C"/></g>' +
    '<g id="t-s"><ellipse cx="0" cy="1" rx="11" ry="3.4" fill="#000" opacity=".2"/><circle cx="-5" cy="-5" r="7" fill="#4F8F55"/><circle cx="5" cy="-6" r="8" fill="#447F4B"/><circle cx="0" cy="-10" r="6" fill="#62A566"/></g>' +
    '</defs>';
  function use(id, x, y, sc) { return '<use href="#' + id + '" transform="translate(' + f1(x) + ' ' + f1(y) + ') scale(' + sc.toFixed(2) + ')"/>'; }
  function inWater(k, p) {
    if (k.backdrop === 'coast') return p[1] > shore(p[0]) - 46;
    return Math.abs(p[0] - stream(p[1])) < 40;
  }
  function stream(y) { return 1890 + 62 * Math.sin(y / 160); }
  function shore(x) { return 1096 + 24 * Math.sin(x / 190); }
  var decorCache = {};
  function decor(t) {   // 開墾地外面的山林：位置固定，每次都一樣
    if (decorCache[t.id]) return decorCache[t.id];
    var k = t.look, out = [], coast = k.backdrop === 'coast', rocky = t.id === 'paiwan' ? 0.16 : 0.06;
    for (var i = 0; i < 1320; i++) {
      var gx = -9 + rnd(i, 1) * 58, gy = -9 + rnd(i, 2) * 58;
      if (Math.hypot(gx - CX, gy - CY) < 15.3) continue;
      var p = P(gx, gy);
      if (p[0] < -30 || p[0] > SW + 30 || p[1] < 36 || p[1] > SH + 50 || inWater(k, p)) continue;
      var r = rnd(i, 3), id = r < rocky ? 't-r' : coast ? (r < 0.24 ? 't-s' : 't-b') : (r < 0.66 ? 't-c' : 't-b');
      out.push({ y: p[1], s: use(id, p[0], p[1], 0.85 + rnd(i, 4) * 0.45) });
    }
    out.sort(function (a, b) { return a.y - b.y; });
    return (decorCache[t.id] = out.map(function (o) { return o.s; }).join(''));
  }
  var CLUMP = [[-36, -8], [-12, -22], [18, -15], [38, 0], [-20, 9], [8, 15]];
  function badge(x, y, inner, ring) {
    return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ')"><circle r="13" fill="rgba(20,33,42,.82)" stroke="' + ring + '" stroke-width="2"/>' + inner + '</g>';
  }

  /* v: {tribe, tiles, land, queue, wall}；回傳放進 <svg> 的內容。倒數文字由外部依 data-until 更新。 */
  function scene(v, sel, plain) {   // plain：參觀別人的部落時，不顯示可以拓荒、可以興建的記號
    var t = Tribes.get(v.tribe), k = t.look, S = R.SITES, low = '', top = '', items = [], busy = {}, i;
    v.queue.forEach(function (w) { if (w.tile >= 0) busy[w.tile] = w; });
    function dist(j) { return Math.hypot(S[j].x - CX, S[j].y - CY); }
    if (v.wall) {   // 圍籬：繞著整個開墾地的一圈，等級越高越粗
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
        var clearing = w && w.type === 'clear';
        CLUMP.forEach(function (c, n) {
          if (clearing && n % 2) return;
          items.push({ y: p[1] + c[1], s: use(rnd(i * 7 + n, 5) < (k.backdrop === 'coast' ? 0.15 : 0.6) ? 't-c' : 't-b', p[0] + c[0], p[1] + c[1], 0.95 + rnd(i * 7 + n, 6) * 0.3) });
        });
        if (clearing) top += pill(p[0], p[1] + 6, w.doneAt);
        else if (!plain && S[i].near.some(function (j) { return v.land[j]; }))
          top += badge(p[0], p[1] - 50, '<path d="M-5 6 4 -5" stroke="#F2EAD6" stroke-width="2.4" stroke-linecap="round"/><path d="M1 -8 8 -3 4 2 -1 -4z" fill="#F2EAD6"/>', '#F2EAD6');
      } else if (!b) {     // 開墾好的空地
        low += '<g' + tx + '>' + plot(1.2, 1.05, '#B79B6E', ' opacity=".85"') + '</g>';
        [[-1.2, -1.05], [1.2, -1.05], [1.2, 1.05], [-1.2, 1.05]].forEach(function (c) { var g = q(c[0], c[1]); low += seg([p[0] + g[0], p[1] + g[1]], [p[0] + g[0], p[1] + g[1] - 9], '#7A5636', 2.6); });
        if (!plain) top += badge(p[0], p[1] - 2, '<path d="M-6 0H6M0 -6V6" stroke="#E3B341" stroke-width="2.6" stroke-linecap="round"/>', '#E3B341');
      } else {
        items.push({ y: p[1] + 8, s: '<g' + tx + (b.level === 0 ? ' opacity=".45"' : '') + '>' + ISO[b.type](k, t) + '</g>' });
        if (b.busy && w) top += pill(p[0], p[1] + 22, w.doneAt);
        if (b.level > 0) top += '<g transform="translate(' + f1(p[0] + 34) + ' ' + f1(p[1] - TOP[b.type]) + ')"><circle r="12" fill="rgba(20,33,42,.88)"/><text y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#F2EAD6">' + b.level + '</text></g>';
      }
    }
    items.sort(function (a, c) { return a.y - c.y; });
    return low + items.map(function (it) { return it.s; }).join('') + top;
  }
  function pill(x, y, until) {
    return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ')"><rect x="-40" y="-13" width="80" height="26" rx="13" fill="rgba(20,33,42,.9)"/><text y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#E3B341" data-until="' + until + '"></text></g>';
  }
  function person(color) {
    return '<ellipse cx="0" cy="9" rx="6.5" ry="2.4" fill="#000" opacity=".22"/><path d="M-5.5 9c0-8 2-13 5.5-13s5.5 5 5.5 13z" fill="' + color + '"/><circle cx="0" cy="-8" r="4.8" fill="#B98660"/>';
  }

  // ---------- 對戰畫面 ----------
  // 三條路由上到下是山徑、正門、溪谷；攻方在左、守方在右。失去戰力的人是「往後退場」，不畫倒下的樣子。
  var BW = 1000, BH = 300, LANE_Y = [160, 78, 242], AX = 430, DX = 572, GATE_X = 501;
  function fig(kind, body, band, flip) {   // 一個人：腳底在原點，面向右；flip 則面向左
    var s = '<ellipse cx="0" cy="1" rx="8" ry="2.6" fill="#000" opacity=".25"/><path d="M-6.5 0c0-9 2-15 6.5-15s6.5 6 6.5 15z" fill="' + body + '"/>' +
      '<circle cx="0" cy="-19.5" r="5.6" fill="#B98660"/><path d="M-5.6 -21.5h11.2" stroke="' + band + '" stroke-width="2.2"/>';
    if (kind === 'w') s += '<g class="wpn"><path d="M8 2 12 -31" stroke="#6B4A32" stroke-width="2.2" stroke-linecap="round"/><path d="M12 -31l-2.6 -8 5.2 3z" fill="#D5D9DC"/></g>';
    else if (kind === 'a') s += '<g class="wpn"><path d="M8 -23q11 10 0 21" fill="none" stroke="#6B4A32" stroke-width="2.4" stroke-linecap="round"/><path d="M8 -23v21" stroke="#EFE7D2" stroke-width="0.9"/></g>';
    return '<g transform="scale(' + (flip ? -1.3 : 1.3) + ' 1.3)">' + s + '</g>';
  }
  function slot(side, n, y) {   // 第 n 個人站哪裡：每排 5 人、兩排，第 0 個最靠近對方
    var col = n % 5, row = Math.floor(n / 5) % 2, dx = col * 33 + row * 16;
    return [side === 'a' ? AX - dx : DX + dx, y + (row ? 17 : -8)];
  }
  function at(x, y, inner) { return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ')">' + inner + '</g>'; }
  function dly(ms) { return ' style="animation-delay:' + Math.round(ms) + 'ms"'; }
  function arrow(dir) { return '<path d="M0 0h' + 22 * dir + '" stroke="#F4EEDC" stroke-width="2.2" stroke-linecap="round"/><path d="M' + 22 * dir + ' 0l' + -7 * dir + ' -3.4v6.8z" fill="#F4EEDC"/>'; }
  var STAR = 'M0 -17 4 -5 15 -8 7 1 15 9 4 7 0 18 -4 7 -15 9 -7 1 -15 -8 -4 -5Z';

  /* 背景：遠山或海面、山林、三條路、溪水、圍籬與門柱、守方的部落。只跟守方的族群和圍籬有關，不隨每一階段改變 */
  function battleField(b, ta, td) {
    var k = td.look, s = '', i, coast = k.backdrop === 'coast';
    s += '<rect width="' + BW + '" height="' + BH + '" fill="' + k.ground + '"/>';
    s += '<rect width="130" height="' + BH + '" fill="' + shade(k.ground, -26) + '"/><rect x="130" width="70" height="' + BH + '" fill="' + shade(k.ground, -12) + '" opacity=".6"/>';
    s += '<rect x="760" width="240" height="' + BH + '" fill="' + shade(k.ground, 12) + '"/>';
    // 遠景：山或海
    if (coast) s += '<rect width="' + BW + '" height="20" fill="#3E8FB8"/><path d="M0 12q30 -5 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0" fill="none" stroke="#A9D8E8" stroke-width="2"/><rect y="20" width="' + BW + '" height="7" fill="#E2CF9C"/>';
    else s += '<rect width="' + BW + '" height="26" fill="#BFDDE0"/><polygon points="0,26 0,14 80,3 170,17 280,2 400,16 500,6 620,19 740,3 860,16 1000,8 1000,26" fill="#6F9C8D"/><polygon points="0,26 0,20 130,11 250,22 380,10 500,23 630,13 770,24 900,14 1000,20 1000,26" fill="#4B7A69"/>';
    for (i = 0; i < 46; i++) {   // 草叢筆觸
      var gx = 240 + rnd(i, 51) * 740, gy = 34 + rnd(i, 52) * 258;
      s += '<path d="M' + f1(gx) + ' ' + f1(gy) + 'l2 -6m2 6l1 -7m3 7l-1 -5" stroke="' + shade(k.ground, i % 2 ? 24 : -18) + '" stroke-width="1.5" fill="none" opacity=".7"/>';
    }
    LANE_Y.forEach(function (y, li) {   // 三條路：深色的路緣、淺色的路面、零星的小石子
      s += '<rect x="96" y="' + (y - 36) + '" width="672" height="72" rx="36" fill="#8E7347" opacity=".55"/><rect x="102" y="' + (y - 31) + '" width="660" height="62" rx="31" fill="#C4AB7C"/>';
      for (i = 0; i < 14; i++) s += '<ellipse cx="' + f1(130 + rnd(li * 20 + i, 53) * 600) + '" cy="' + f1(y - 24 + rnd(li * 20 + i, 54) * 48) + '" rx="' + f1(2 + rnd(i, 55) * 3) + '" ry="1.6" fill="#9C8256" opacity=".7"/>';
    });
    // 溪谷旁的溪水（會流動）與石頭
    var yv = LANE_Y[2] + 46;
    s += '<path d="M0 ' + yv + 'q60 -8 125 0t125 0 125 0 125 0 125 0 125 0 125 0 125 0" fill="none" stroke="#2E6F8E" stroke-width="15"/><path d="M0 ' + yv + 'q60 -8 125 0t125 0 125 0 125 0 125 0 125 0 125 0 125 0" fill="none" stroke="#4C93B5" stroke-width="10"/>' +
      '<path class="flow" d="M0 ' + yv + 'q60 -8 125 0t125 0 125 0 125 0 125 0 125 0 125 0 125 0" fill="none" stroke="#CFEAF2" stroke-width="2" stroke-dasharray="14 26" opacity=".8"/>';
    [[210, yv - 2], [470, yv + 1], [690, yv - 3]].forEach(function (r) { s += use('t-r', r[0], r[1], 0.55); });
    // 山徑：坡上的石頭與樹樁
    [[250, 42], [350, 44], [455, 40], [640, 44], [380, 118], [600, 120]].forEach(function (r, n) { s += use(n % 3 === 2 ? 't-s' : 't-r', r[0], r[1], 0.75 + (n % 2) * 0.2); });
    [[300, 204], [420, 200], [640, 202], [270, 122]].forEach(function (r) { s += use('t-s', r[0], r[1], 0.9); });
    // 攻方來的山林，兩層
    var trees = [];
    for (i = 0; i < 40; i++) trees.push([4 + rnd(i, 41) * 100, 44 + rnd(i, 43) * 258, rnd(i, 42), 0.75 + rnd(i, 44) * 0.45]);
    trees.sort(function (p, q) { return p[1] - q[1]; }).forEach(function (t) { s += use(t[2] < (coast ? 0.2 : 0.6) ? 't-c' : 't-b', t[0], t[1], t[3]); });
    // 攻方的旗子
    [[150, LANE_Y[1] + 46], [176, LANE_Y[0] + 46]].forEach(function (p, n) {
      s += at(p[0], p[1], '<path d="M0 0V-52" stroke="#6B4A32" stroke-width="3" stroke-linecap="round"/><path class="banner"' + dly(n * 400) + ' d="M0 -52l30 9-30 9z" fill="' + ta.look.trim + '" stroke="#F2EAD6" stroke-width="1.2"/>');
    });
    // 守方的部落：小米田、家屋、中心建築、營火
    s += at(872, 62, '<g transform="scale(.62)">' + ISO.farm(k, td) + '</g>') + at(950, 236, '<g transform="scale(.56)">' + ISO.farm(k, td) + '</g>');
    [[806, 52, 0.56], [945, 66, 0.56], [800, 262, 0.56]].forEach(function (h) { s += at(h[0], h[1], '<g transform="scale(' + h[2] + ')">' + house(k, { w: 1.9, d: 1.6, h: 22, rh: 20 }) + '</g>'); });
    s += at(900, 172, '<g transform="scale(.66)">' + ISO.center(k, td) + '</g>') + at(962, 150, '<g transform="scale(.52)">' + ISO.storage(k, td) + '</g>');
    s += at(820, 170, '<ellipse cx="0" cy="2" rx="13" ry="5" fill="#000" opacity=".2"/><path d="M-9 2 9 -3M-9 -3 9 2" stroke="#6B4A32" stroke-width="3.2" stroke-linecap="round"/><path class="fire" d="M0 -18c6 6 7 11 4 16h-8c-3 -5 -2 -10 4 -16z" fill="#F0A13A"/>' +
      [0, 1, 2].map(function (n) { return '<circle class="smoke"' + dly(n * 900) + ' cx="0" cy="-20" r="5" fill="#F2EAD6"/>'; }).join(''));
    [[842, 188], [868, 206]].forEach(function (p) { s += at(p[0], p[1], '<g transform="scale(.8)">' + fig('', '#F2EAD6', k.trim, true) + '</g>'); });
    return s;
  }
  /* b：伺服器傳來的對戰狀態；prev：上一個階段開打前各路的人數（用來演出誰退場、誰衝進去）；回傳 <svg> 的內容 */
  function battle(b, prev) {
    var ta = Tribes.get(b.aTribe), td = Tribes.get(b.dTribe), k = td.look, last = b.log[b.log.length - 1], show = b.state === 'show' && !!last, prep = b.state === 'prep', done = !!b.result;
    var ca = show ? last.a : null, cd = show ? last.d : null, s = battleField(b, ta, td), fx = '', top = '', i, n;
    var stone = k.fence === 'stone', wcol = stone ? ['#5F6166', '#A5A8AC', '12 4'] : ['#5E7B3C', '#A9C46A', '4 5'], ww = 5 + b.wall * 2;
    // 圍籬（三條路之間的部分）與每條路口的門柱；被攻破的門柱會倒下
    if (b.wall) [[28, LANE_Y[1] - 38], [LANE_Y[1] + 38, LANE_Y[0] - 38], [LANE_Y[0] + 38, LANE_Y[2] - 38]].forEach(function (g) {
      s += '<path d="M' + GATE_X + ' ' + g[0] + 'V' + g[1] + '" stroke="' + wcol[0] + '" stroke-width="' + (ww + 5) + '" stroke-linecap="round"/><path d="M' + GATE_X + ' ' + g[0] + 'V' + g[1] + '" stroke="' + wcol[1] + '" stroke-width="' + ww + '" stroke-dasharray="' + wcol[2] + '"/>';
    });
    for (i = 0; i < Math.min(3, b.towerN); i++) s += at(GATE_X + 26, [LANE_Y[1] + 58, LANE_Y[0] + 58, 50][i], '<g transform="scale(.42)">' + ISO.tower(k) + '</g>');
    b.lanes.forEach(function (l, li) {
      var y = LANE_Y[li], p = prev && prev[li], rec = show ? last.lanes[li] : null, active = show && !!p && p.aw + p.aa > 0 && !p.broken, justBroke = !!(rec && rec.broken), g = '';
      [-37, 37].forEach(function (dy, n2) {   // 門柱
        var fall = l.broken ? ' class="post ' + (justBroke ? 'fall' : 'down') + (n2 ? ' r' : '') + '"' : ' class="post"';
        g += at(GATE_X, y + dy, '<g' + fall + '><path d="M0 4V-22" stroke="#6B4A32" stroke-width="6" stroke-linecap="round"/><path d="M-4 -22h8" stroke="#8D6642" stroke-width="4" stroke-linecap="round"/></g>');
      });
      function side(sd, w, a, pw, pa, cmd, tribe, lost, hurt) {
        var out = '', total = w + a, flip = sd === 'd', body = tribe.look.trim, band = sd === 'a' ? '#F2EAD6' : '#2A1F05', dir = sd === 'a' ? 1 : -1, before = pw + pa, won = done && (sd === 'a' ? b.result.win : !b.result.win);
        for (n = 0; n < Math.min(total, 10); n++) {
          var kind = n < w ? 'w' : 'a', q = slot(sd, n, y), mv = 'mv', bob = 'bob';
          if (prep) mv += ' in-' + sd;
          else if (show && p && n >= before) mv += ' in-' + sd;                       // 歸隊或從別路趕來支援
          else if (active && cmd === 'charge' && kind === 'w') mv += ' charge-' + sd;
          if (active && cmd === 'hold') bob += ' brace';
          else if (active && cmd === 'volley' && kind === 'a') bob += ' loose';
          else if (active && hurt && !(cmd === 'charge' && kind === 'w')) bob += ' hit';
          if (won) bob += ' cheer';
          out += at(q[0], q[1], '<g class="' + mv + '"' + dly(n % 5 * 80 + Math.floor(n / 5) * 60) + '><g class="' + bob + '"' + dly(n * 110) + '>' + fig(kind, body, band, flip) + '</g>' +
            (active && cmd === 'charge' && kind === 'w' ? '<circle class="dust" cx="' + -12 * dir + '" cy="0" r="5" fill="#EADFC0"/><circle class="dust"' + dly(160) + ' cx="' + -22 * dir + '" cy="-2" r="4" fill="#EADFC0"/>' : '') + '</g>');
        }
        if (show && p) {   // 離開這一路的人：負傷的往自己那邊退場；攻破之後剩下的攻方衝進部落
          var gone = Math.max(0, before - total), back = Math.min(gone, Math.max(0, lost)), lw = Math.max(0, pw - w);
          for (n = 0; n < Math.min(gone, 8); n++) {
            var q2 = slot(sd, Math.min(9, total + n), y), away = n < back ? 'retreat-' + sd : (sd === 'a' && justBroke ? 'storm' : 'retreat-' + sd);
            out += at(q2[0], q2[1], '<g class="mv ' + away + '"' + dly(650 + n * 110) + '><g class="bob run">' + fig(n < lw ? 'w' : 'a', body, band, flip) + '</g></g>');
          }
        }
        if (active && cmd === 'volley') for (n = 0; n < Math.min(6, Math.max(2, a + 1)); n++) {   // 箭，以及落地揚起的塵土
          out += at(sd === 'a' ? AX - 46 : DX + 46, y - 30 + (n % 3) * 9, '<g class="arrow-' + sd + '"' + dly(250 + n * 140) + '>' + arrow(dir) + '</g>');
          fx += at((sd === 'a' ? DX + 30 : AX - 30) + (n % 3) * 26 * dir, y + 8 - (n % 2) * 14, '<circle class="puff"' + dly(900 + n * 140) + ' r="6" fill="#EADFC0"/>');
        }
        if (active && cmd === 'hold') out += '<ellipse class="ring" cx="' + (sd === 'a' ? AX - 66 : DX + 66) + '" cy="' + (y + 8) + '" rx="96" ry="30" fill="none" stroke="#F4EEDC" stroke-width="2.6" stroke-dasharray="9 7"/>';
        return out + (total ? '<text class="bcount" x="' + (sd === 'a' ? AX - 196 : DX + 196) + '" y="' + (y + 8) + '" text-anchor="middle">' + total + ' 人</text>' : '');
      }
      g += side('a', l.aw, l.aa, p ? p.aw : l.aw, p ? p.aa : l.aa, ca, ta, rec ? rec.aLost : 0, rec && rec.aLost > 0) +
        side('d', l.dw, l.da, p ? p.dw : l.dw, p ? p.da : l.da, cd, td, rec ? rec.dLost : 0, rec && rec.dLost > 0);
      if (active && (ca === 'charge' || cd === 'charge')) fx += at(GATE_X, y - 6, '<path class="clash" d="' + STAR + '" fill="#FFE9A8" stroke="#E3B341" stroke-width="2"/>') + at(GATE_X, y - 6, '<path class="clash"' + dly(1500) + ' d="' + STAR + '" fill="#FFE9A8" stroke="#E3B341" stroke-width="2"/>');
      if (active && b.towerN) for (n = 0; n < 2; n++) fx += at(GATE_X + 26, y - 30, '<g class="arrow-t"' + dly(400 + n * 600) + '>' + arrow(-1) + '</g>');
      var status = l.broken ? '已攻破' : l.aw + l.aa === 0 && !prep ? (l.dw + l.da ? '守住了' : '') : '';
      top += '<text class="blane' + (l.broken ? ' brk' : status ? ' ok' : '') + '" x="' + GATE_X + '" y="' + (y - 27) + '" text-anchor="middle">' + R.LANES[li] + (status ? '・' + status : '') + '</text>';
      if (l.broken) top += at(GATE_X + 4, y + 30, '<g class="bflag' + (justBroke ? ' plant' : '') + '"><path d="M0 0V-46" stroke="#6B4A32" stroke-width="3" stroke-linecap="round"/><path class="banner" d="M0 -46l26 8-26 8z" fill="' + ta.look.trim + '" stroke="#F2EAD6" stroke-width="1.2"/></g>');
      s += g;
    });
    if (show) {   // 雙方喊出的指令；剋住對方的那一邊用金色框起來
      var ma = R.taken(ca, cd), md = R.taken(cd, ca);
      [[250, ca, ma < md], [750, cd, md < ma]].forEach(function (c, n2) {
        top += at(c[0], 46, '<g class="shout' + (c[2] ? ' win' : '') + '"' + dly(n2 * 120) + '><rect x="-74" y="-19" width="148" height="34" rx="17"/><text y="6" text-anchor="middle">' + R.CMDS[c[1]] + '！' + (c[2] ? ' 剋制' : '') + '</text></g>');
      });
    }
    // 雲影與飛鳥
    top = '<ellipse class="cloud" cx="0" cy="110" rx="170" ry="46" fill="#0B1A20" opacity=".1"/><ellipse class="cloud"' + dly(-22000) + ' cx="0" cy="230" rx="130" ry="36" fill="#0B1A20" opacity=".08"/>' +
      '<g class="bird"><path d="M0 0q5 -6 10 0q5 -6 10 0" fill="none" stroke="#22333B" stroke-width="2" stroke-linecap="round"/><path d="M26 10q4 -5 8 0q4 -5 8 0" fill="none" stroke="#22333B" stroke-width="1.8" stroke-linecap="round"/></g>' + top;
    return '<g' + (show && (ca === 'charge' || cd === 'charge') ? ' class="quake"' : '') + '>' + s + fx + '</g>' + top;
  }

  /* 地面底圖：畫在畫布上再當成一張圖，縮放平移才順。 */
  var groundCache = {};
  function groundURL(t) {
    if (groundCache[t.id]) return groundCache[t.id];
    var k = t.look, cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
    var c = cv.getContext('2d'), base = k.ground, i, g;
    c.fillStyle = shade(base, -32); c.fillRect(0, 0, SW, SH);
    for (i = 0; i < 180; i++) {   // 林地的深淺變化
      var x = rnd(i, 11) * SW, y = rnd(i, 12) * SH, r = 50 + rnd(i, 13) * 130, col = i % 2 ? shade(base, -44) : shade(base, -20);
      g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
    }
    var ctr = P(CX, CY), rx = 16 * U * 1.414;
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
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(6,16,20,.45)'); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
    return (groundCache[t.id] = cv.toDataURL('image/jpeg', 0.86));
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

  return { icon: icon, scene: scene, battle: battle, BW: BW, BH: BH, decor: decor, groundURL: groundURL, sitePos: sitePos, person: person, DEFS: DEFS, SW: SW, SH: SH,
    paintMap: paintMap, mapLabels: mapLabels, shade: shade };
})();
