/* 山海部落 — 畫面繪製（全部用 SVG 即時畫出，沒有外部圖檔）
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

  // ---------- 建築（每格 96×96，地面約在 y=82） ----------
  function shadow(rx) { return '<ellipse cx="48" cy="83" rx="' + (rx || 36) + '" ry="5" fill="#000" opacity=".2"/>'; }
  function texture(k, x, y, w, h) {
    var s = '', c = shade(k.wall, -22), i;
    if (k.fence === 'stone') for (i = 1; i < 4; i++) s += '<path d="M' + x + ' ' + (y + i * h / 4) + 'h' + w + '" stroke="' + c + '" stroke-width="1.6"/>';
    else for (i = 1; i < 7; i++) s += '<path d="M' + (x + i * w / 7) + ' ' + y + 'v' + h + '" stroke="' + c + '" stroke-width="1.4"/>';
    return s;
  }
  function houseShape(k, big) {
    var s = shadow(big ? 42 : 36);
    if (big) return s + '<g transform="translate(48 82) scale(1.22) translate(-48 -82)">' + houseBody(k) + '</g>';
    return s + houseBody(k);
  }
  function houseBody(k) {
    var flat = k.fence === 'stone';
    var roof = flat ? '10,50 48,31 86,50' : '11,50 48,22 85,50';
    return '<rect x="20" y="49" width="56" height="32" fill="' + k.wall + '"/>' + texture(k, 20, 49, 56, 32) +
      '<rect x="41" y="59" width="14" height="22" rx="1.5" fill="' + shade(k.wall, -55) + '"/>' +
      '<polygon points="' + roof + '" fill="' + k.roof + '"/>' +
      '<path d="M' + roof.split(' ')[0].replace(',', ' ') + 'L' + roof.split(' ')[2].replace(',', ' ') + '" stroke="' + shade(k.roof, -30) + '" stroke-width="3"/>' +
      '<rect x="20" y="50" width="56" height="4" fill="' + k.trim + '"/>';
  }
  function pennant(k, x, y) {
    return '<path d="M' + x + ' ' + y + 'v-26" stroke="' + shade(k.wall, -45) + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M' + x + ' ' + (y - 26) + 'l15 5-15 5z" fill="' + k.trim + '"/>';
  }
  var DRAW = {
    center: function (k, t) {
      if (t.id === 'amis') {   // 聚會所：四面開放的大茅草屋
        var posts = '';
        [16, 32, 48, 64, 80].forEach(function (x) { posts += '<rect x="' + (x - 2) + '" y="46" width="4" height="36" fill="' + shade(k.wall, -35) + '"/>'; });
        return shadow(44) + '<rect x="12" y="76" width="72" height="6" fill="' + shade(k.wall, -15) + '"/>' + posts +
          '<polygon points="3,48 48,10 93,48" fill="' + k.roof + '"/>' +
          '<path d="M14 40 48 12 82 40" fill="none" stroke="' + shade(k.roof, -22) + '" stroke-width="2.5"/>' +
          '<path d="M3 48h90" stroke="' + k.trim + '" stroke-width="5"/>';
      }
      var s = houseShape(k, true);
      if (t.id === 'paiwan') s += '<rect x="4" y="80" width="88" height="6" rx="1" fill="#8A877F"/><rect x="82" y="50" width="7" height="31" rx="2.5" fill="#6E6B64"/>';
      else s += pennant(k, 88, 80);
      return s;
    },
    house: function (k) { return houseShape(k, false); },
    farm: function (k, t, head) {
      var s = '<rect x="9" y="24" width="78" height="60" rx="5" fill="#73553A"/>', hc = head || '#E3B341';
      for (var r = 0; r < 3; r++) {
        s += '<path d="M12 ' + (44 + r * 18) + 'h72" stroke="#5C422B" stroke-width="3"/>';
        for (var c = 0; c < 6; c++) {
          var x = 19 + c * 12, y = 42 + r * 18;
          s += '<path d="M' + x + ' ' + y + 'q0 -8 3 -13" stroke="#6FA04B" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
            '<ellipse cx="' + (x + 4) + '" cy="' + (y - 13) + '" rx="2.6" ry="4" fill="' + hc + '" transform="rotate(35 ' + (x + 4) + ' ' + (y - 13) + ')"/>';
        }
      }
      return s;
    },
    mat: function (k, t) {
      var s = shadow(34);
      if (t.id === 'paiwan' || t.id === 'bunun') {   // 石板堆
        [[14, 66, 68], [20, 54, 56], [26, 43, 44]].forEach(function (p, i) {
          s += '<polygon points="' + p[0] + ',' + (p[1] + 11) + ' ' + (p[0] + 6) + ',' + p[1] + ' ' + (p[0] + p[2]) + ',' + p[1] + ' ' + (p[0] + p[2] - 6) + ',' + (p[1] + 11) + '" fill="' + ['#7C7F84', '#8F9297', '#A3A6AA'][i] + '"/>';
        });
        if (t.id === 'bunun') s += '<rect x="56" y="28" width="26" height="9" rx="4.5" fill="#9B6B3F"/><circle cx="81" cy="32.5" r="4.5" fill="#C99A63"/>';
      } else {   // 竹木堆
        [[14, 68], [38, 68], [26, 55]].forEach(function (p) {
          s += '<rect x="' + p[0] + '" y="' + p[1] + '" width="44" height="13" rx="6.5" fill="#9B6B3F"/><circle cx="' + (p[0] + 44 - 6.5) + '" cy="' + (p[1] + 6.5) + '" r="6.5" fill="#C99A63"/><circle cx="' + (p[0] + 44 - 6.5) + '" cy="' + (p[1] + 6.5) + '" r="3" fill="none" stroke="#9B6B3F" stroke-width="1.2"/>';
        });
        s += '<path d="M70 50V20M76 50V26M82 50V18" stroke="#7FA65A" stroke-width="3.2" stroke-linecap="round"/>';
      }
      return s;
    },
    special: function (k, t) {
      if (t.id === 'paiwan') return DRAW.farm(k, t, '#D4476B');
      var s = shadow(36), rack = '<path d="M52 82V44M86 82V44M50 47h38" stroke="' + shade(k.wall, -45) + '" stroke-width="2.6" stroke-linecap="round" fill="none"/>';
      var hut = '<polygon points="8,82 28,38 48,82" fill="' + k.roof + '"/><polygon points="22,82 28,62 34,82" fill="' + shade(k.roof, -45) + '"/>';
      if (t.id === 'amis') {
        s += hut + rack;
        [58, 69, 80].forEach(function (x) { s += '<path d="M' + x + ' 47v5" stroke="#5C422B" stroke-width="1.2"/><path d="M' + x + ' 52c5 4 5 12 0 18c-5-6-5-14 0-18z" fill="#8FB8C9"/><path d="M' + (x - 3) + ' 74l3-5 3 5z" fill="#8FB8C9"/>'; });
      } else if (t.id === 'atayal') {
        s = houseShape(k, false);
        s += '<rect x="62" y="40" width="26" height="34" fill="' + CREAM + '"/>';
        [44, 52, 60, 68].forEach(function (y, i) { s += '<rect x="62" y="' + y + '" width="26" height="3.5" fill="' + (i % 2 ? '#2F3B45' : k.trim) + '"/>'; });
        s += '<path d="M60 40h30" stroke="' + shade(k.wall, -45) + '" stroke-width="2.6" stroke-linecap="round"/>';
      } else {   // 獵寮
        s += hut + rack;
        [59, 69, 79].forEach(function (x) { s += '<path d="M' + x + ' 47v4" stroke="#5C422B" stroke-width="1.2"/><rect x="' + (x - 3.5) + '" y="51" width="7" height="13" rx="3" fill="#A6583F"/>'; });
      }
      return s;
    },
    storage: function (k, t) {
      var s = shadow(32);
      if (t.id === 'bunun') {   // 小米倉傳統上在屋內，這裡畫成矮石屋
        return s + '<g transform="translate(48 82) scale(.82) translate(-48 -82)">' + houseBody(k) + '</g>' +
          '<path d="M70 82V62" stroke="#6FA04B" stroke-width="2.4"/><ellipse cx="73" cy="59" rx="3" ry="5" fill="#E3B341" transform="rotate(30 73 59)"/><ellipse cx="67" cy="60" rx="3" ry="5" fill="#E3B341" transform="rotate(-30 67 60)"/>';
      }
      [28, 64].forEach(function (x) { s += '<rect x="' + x + '" y="58" width="4.5" height="24" fill="' + shade(k.wall, -40) + '"/><ellipse cx="' + (x + 2.2) + '" cy="60" rx="8" ry="2.6" fill="' + shade(k.wall, -55) + '"/>'; });
      return s + '<rect x="21" y="34" width="54" height="24" fill="' + k.wall + '"/>' + texture(k, 21, 34, 54, 24) +
        '<polygon points="13,37 48,14 83,37" fill="' + k.roof + '"/><rect x="42" y="42" width="12" height="16" fill="' + shade(k.wall, -55) + '"/>';
    },
    barracks: function (k) {
      return '<ellipse cx="48" cy="66" rx="40" ry="18" fill="#B49A6C" opacity=".85"/>' +
        '<path d="M26 82V44" stroke="' + shade(k.wall, -45) + '" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="26" cy="40" r="13" fill="' + CREAM + '"/><circle cx="26" cy="40" r="8.5" fill="' + k.trim + '"/><circle cx="26" cy="40" r="3.6" fill="' + CREAM + '"/>' +
        '<path d="M56 80 70 30M66 80 72 30M78 80 74 30" stroke="#6B4A32" stroke-width="2.6" stroke-linecap="round"/>' +
        '<path d="M70 30l-3-9 6 3zM72 30l0-10 4 6zM74 30l4-9 1 8z" fill="#C9CDD1"/>';
    },
    tower: function (k) {
      return shadow(26) + '<path d="M28 84 36 34M68 84 60 34M31 64h34M33 50h30M31 64 63 50M65 64 33 50" stroke="#7A5636" stroke-width="3.2" stroke-linecap="round" fill="none"/>' +
        '<rect x="26" y="26" width="44" height="9" fill="#8D6642"/><path d="M30 26V12M66 26V12" stroke="#7A5636" stroke-width="3"/>' +
        '<polygon points="22,14 48,0 74,14" fill="' + k.roof + '"/><rect x="26" y="20" width="44" height="3" fill="' + k.trim + '"/>';
    }
  };
  function building(b, t) {
    var k = t.look, s = DRAW[b.type](k, t);
    if (b.level === 0) return '<g opacity=".4">' + s + '</g><rect x="8" y="14" width="80" height="72" rx="6" fill="none" stroke="' + CREAM + '" stroke-width="2.5" stroke-dasharray="7 6"/>';
    return s;
  }
  function badge(level) {
    return '<circle cx="80" cy="16" r="13" fill="' + INK + '" opacity=".88"/><text x="80" y="22.5" text-anchor="middle" font-size="18" font-weight="700" fill="' + CREAM + '">' + level + '</text>';
  }

  // ---------- 部落場景 ----------
  var VW = 960, VH = 600, OX = 48, OY = 78, TS = 96;
  function tileXY(i) { return [OX + (i % R.GRID_W) * TS, OY + Math.floor(i / R.GRID_W) * TS]; }
  function backdrop(k) {
    var s = '<rect width="' + VW + '" height="' + VH + '" fill="' + k.ground + '"/>';
    if (k.backdrop === 'coast') {
      s += '<rect width="' + VW + '" height="30" fill="#BFE0EA"/><rect y="26" width="' + VW + '" height="26" fill="#3E8FB8"/>' +
        '<path d="M0 40q30-7 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0" fill="none" stroke="#9CD0E4" stroke-width="2.5"/>' +
        '<rect y="50" width="' + VW + '" height="12" fill="#E2CF9C"/>';
    } else {
      s += '<rect width="' + VW + '" height="62" fill="#BFDDE0"/>' +
        '<polygon points="0,62 0,34 90,8 190,40 300,4 420,36 520,14 640,44 760,6 880,38 960,20 960,62" fill="#6F9C8D"/>' +
        '<polygon points="0,62 0,48 130,26 250,52 380,24 500,54 630,30 770,56 900,32 960,46 960,62" fill="#4B7A69"/>';
    }
    var dots = '';
    for (var i = 0; i < 46; i++) {   // 固定位置的草叢，讓地面不單調
      var x = (i * 197) % 940 + 10, y = 70 + (i * 131) % 520;
      dots += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (9 + i % 5 * 3) + '" ry="' + (4 + i % 3) + '" fill="' + shade(k.ground, i % 2 ? -10 : 9) + '"/>';
    }
    return s + dots;
  }
  function fence(k, level) {
    if (!level) return '';
    var w = 3 + level * 1.6, x = 30, y = 68, ww = VW - 60, hh = VH - 92;
    if (k.fence === 'stone') return '<rect x="' + x + '" y="' + y + '" width="' + ww + '" height="' + hh + '" rx="20" fill="none" stroke="#5F6166" stroke-width="' + (w + 5) + '"/>' +
      '<rect x="' + x + '" y="' + y + '" width="' + ww + '" height="' + hh + '" rx="20" fill="none" stroke="#A5A8AC" stroke-width="' + (w + 1) + '" stroke-dasharray="22 5"/>';
    return '<rect x="' + x + '" y="' + y + '" width="' + ww + '" height="' + hh + '" rx="20" fill="none" stroke="#5E7B3C" stroke-width="' + (w + 4) + '"/>' +
      '<rect x="' + x + '" y="' + y + '" width="' + ww + '" height="' + hh + '" rx="20" fill="none" stroke="#A9C46A" stroke-width="' + w + '" stroke-dasharray="5 6"/>';
  }
  /* v: {tribe, tiles, wall}；回傳 <svg> 內容。timers 由外部依 data-until 更新。 */
  function village(v, sel, queue) {
    var t = Tribes.get(v.tribe), k = t.look, s = backdrop(k) + fence(k, v.wall), until = {};
    (queue || []).forEach(function (q) { if (q.tile >= 0) until[q.tile] = q.doneAt; });
    for (var i = 0; i < R.TILE_N; i++) {
      var p = tileXY(i), b = v.tiles[i], on = sel === i;
      s += '<g class="tile' + (on ? ' on' : '') + (b ? '' : ' empty') + '" data-tile="' + i + '" transform="translate(' + p[0] + ' ' + p[1] + ')">' +
        '<rect class="plot" x="5" y="5" width="86" height="86" rx="12"/>';
      if (b) {
        s += building(b, t);
        if (b.level > 0) s += badge(b.level);
        if (b.busy) s += '<g class="busy"><rect x="12" y="64" width="72" height="24" rx="12" fill="' + INK + '" opacity=".9"/><text x="48" y="82" text-anchor="middle" font-size="17" font-weight="700" fill="#E3B341" data-until="' + (until[i] || 0) + '"></text></g>';
      }
      s += '<rect class="hit" width="96" height="96" fill="transparent"/></g>';
    }
    return s;
  }

  // ---------- 世界地圖（自然風格：平滑海岸線、暈染的區域色塊、山脈起伏） ----------
  function rgba(hex, al) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + al + ')'; }
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

  return { icon: icon, village: village, paintMap: paintMap, mapLabels: mapLabels, tileXY: tileXY, shade: shade, VW: VW, VH: VH, TS: TS };
})();
