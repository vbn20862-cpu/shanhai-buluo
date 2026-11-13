/* 山海部落 — 世界地圖：台灣輪廓、六角格、各族傳統分布區
 * 同一份程式在伺服器（Node）與瀏覽器共用。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 台灣本島海岸線（經度, 緯度），由北端順時針。簡化輪廓，僅供遊戲地圖使用。
  var OUTLINE = [
    [121.537, 25.298], [121.64, 25.23], [121.69, 25.21], [121.76, 25.155], [121.92, 25.13],
    [122.007, 25.008], [121.83, 24.86], [121.83, 24.72], [121.87, 24.59], [121.82, 24.45],
    [121.77, 24.31], [121.67, 24.16], [121.63, 23.98], [121.60, 23.82], [121.52, 23.48],
    [121.46, 23.32], [121.41, 23.12], [121.31, 22.97], [121.24, 22.87], [121.17, 22.75],
    [121.01, 22.61], [120.90, 22.34], [120.89, 22.20], [120.86, 21.99], [120.855, 21.90],
    [120.76, 21.94], [120.735, 21.92], [120.70, 22.07], [120.68, 22.19], [120.65, 22.26],
    [120.59, 22.36], [120.45, 22.46], [120.33, 22.55], [120.26, 22.68], [120.18, 22.90],
    [120.15, 23.00], [120.04, 23.10], [120.11, 23.27], [120.14, 23.38], [120.14, 23.46],
    [120.14, 23.58], [120.19, 23.78], [120.27, 23.85], [120.40, 24.07], [120.47, 24.19],
    [120.51, 24.29], [120.58, 24.39], [120.67, 24.49], [120.76, 24.62], [120.84, 24.70],
    [120.92, 24.85], [120.98, 24.92], [121.06, 25.04], [121.19, 25.11], [121.38, 25.16],
    [121.42, 25.19], [121.49, 25.26]
  ];
  // 離島（僅蘭嶼為可居住格，綠島為裝飾）
  var ISLETS = {
    lanyu: [[121.50, 22.08], [121.55, 22.09], [121.60, 22.06], [121.59, 22.02], [121.55, 22.00], [121.51, 22.03]],
    ludao: [[121.47, 22.68], [121.50, 22.68], [121.51, 22.65], [121.48, 22.64]]
  };

  // 各族傳統分布區的代表點（經度, 緯度）。用最近代表點決定每個六角格屬於哪一族的區域。
  var SEEDS = {
    amis: [[121.57, 23.93], [121.52, 23.84], [121.46, 23.75], [121.42, 23.65], [121.38, 23.50],
      [121.32, 23.34], [121.27, 23.18], [121.20, 23.08], [121.14, 22.92], [121.51, 23.58],
      [121.45, 23.32], [121.37, 23.10], [121.30, 22.97], [121.16, 22.74]],
    atayal: [[121.55, 24.85], [121.37, 24.73], [121.28, 24.62], [121.30, 24.50], [121.05, 24.42],
      [121.12, 24.27], [121.55, 24.62], [121.40, 24.45], [121.72, 24.45], [121.22, 24.17]],
    saisiyat: [[121.10, 24.62], [120.99, 24.58], [120.92, 24.52]],
    truku: [[121.56, 24.15], [121.45, 24.18], [121.47, 23.96], [121.38, 23.74], [121.70, 24.30]],
    seediq: [[121.13, 24.02], [121.02, 24.06]],
    sakizaya: [[121.61, 24.04]],
    kavalan: [[121.77, 24.75], [121.78, 24.63]],
    thao: [[120.91, 23.86]],
    bunun: [[120.88, 23.62], [120.96, 23.52], [121.03, 23.88], [121.20, 23.38], [121.24, 23.52],
      [121.31, 23.63], [121.10, 23.12], [121.03, 22.92], [120.90, 23.20], [121.02, 23.38],
      [121.14, 23.72], [121.04, 23.25]],
    tsou: [[120.76, 23.46], [120.72, 23.37]],
    kanakanavu: [[120.70, 23.26]],
    hlaalua: [[120.76, 23.14]],
    rukai: [[120.74, 22.76], [120.67, 22.89], [120.86, 22.84]],
    paiwan: [[120.66, 22.69], [120.68, 22.59], [120.67, 22.49], [120.70, 22.40], [120.74, 22.25],
      [120.82, 22.13], [120.83, 22.02], [120.88, 22.33], [120.93, 22.56], [120.99, 22.63],
      [120.79, 22.53]],
    pinuyumayan: [[121.10, 22.80], [121.03, 22.71], [121.07, 22.87]],
    tao: [[121.55, 22.05]],
    siraya: [[120.38, 23.03], [120.43, 23.28], [120.20, 23.17], [120.43, 23.14]]
  };
  var SEED_RADIUS_KM = 16;
  // 平原上的中立聚落（平埔族群的家園；之後開放交易）。只標位置，不放未查證的文化內容。
  var SETTLEMENTS = [
    { id: 'n1', name: '北部平原聚落', at: [121.48, 25.03] },
    { id: 'n2', name: '西北平原聚落', at: [120.98, 24.78] },
    { id: 'n3', name: '中部平原聚落', at: [120.66, 24.14] },
    { id: 'n4', name: '西部平原聚落', at: [120.42, 23.62] },
    { id: 'n5', name: '南部平原聚落', at: [120.42, 22.66] }
  ];
  // 畫地圖用的山脈稜線（中央山脈、雪山山脈、阿里山山脈、海岸山脈）
  var RANGES = [
    [[121.62, 24.62], [121.45, 24.38], [121.30, 24.12], [121.20, 23.85], [121.08, 23.55], [120.98, 23.28], [120.92, 23.00], [120.85, 22.72], [120.80, 22.45], [120.78, 22.20]],
    [[121.55, 24.90], [121.38, 24.70], [121.22, 24.50], [121.08, 24.32], [120.98, 24.12]],
    [[120.82, 23.70], [120.78, 23.50], [120.72, 23.30], [120.68, 23.10]],
    [[121.52, 23.78], [121.46, 23.55], [121.40, 23.32], [121.32, 23.10], [121.22, 22.90]]
  ];

  // 投影：等距圓柱。1 單位約 1.11 公里。
  var LON0 = 119.9, LAT0 = 25.42, K = 100, COS = Math.cos(23.6 * Math.PI / 180);
  var MAP_W = 216, MAP_H = 362;
  function project(lon, lat) { return [(lon - LON0) * COS * K, (LAT0 - lat) * K]; }
  function unproject(x, y) { return [x / (COS * K) + LON0, LAT0 - y / K]; }
  function km(a, b) {
    var dx = (a[0] - b[0]) * 111 * COS, dy = (a[1] - b[1]) * 111;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function inPoly(pt, poly) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // 六角格（尖頂、odd-r 排列）
  var S = 6, HEX_W = Math.sqrt(3) * S, ROW_H = 1.5 * S;
  function hexCenter(col, row) { return [HEX_W * (col + 0.5 * (row & 1)) + HEX_W / 2, row * ROW_H + S]; }
  function hexCorners(x, y, s) {
    s = s || S; var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i - 30);
      pts.push([x + s * Math.cos(a), y + s * Math.sin(a)]);
    }
    return pts;
  }
  function axial(col, row) { return { q: col - (row - (row & 1)) / 2, r: row }; }
  function hexDist(a, b) {
    var A = axial(a.col, a.row), B = axial(b.col, b.row);
    var dq = A.q - B.q, dr = A.r - B.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }
  var NEIGH = [[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]];

  var cache = null;
  function build() {
    if (cache) return cache;
    var hexes = [], byId = {};
    var cols = Math.ceil(MAP_W / HEX_W), rows = Math.ceil(MAP_H / ROW_H);
    var lanyuC = project(121.55, 22.05), best = null;
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var c = hexCenter(col, row), ll = unproject(c[0], c[1]);
        var dl = Math.hypot(c[0] - lanyuC[0], c[1] - lanyuC[1]);
        if (!best || dl < best.d) best = { d: dl, col: col, row: row };
        if (!inPoly(ll, OUTLINE)) continue;
        var h = { id: col + '_' + row, col: col, row: row, x: +c[0].toFixed(2), y: +c[1].toFixed(2), tribe: null, coast: false };
        hexes.push(h); byId[h.id] = h;
      }
    }
    // 蘭嶼：面積小於一格，固定給一格
    var lc = hexCenter(best.col, best.row);
    var lh = { id: best.col + '_' + best.row, col: best.col, row: best.row, x: +lc[0].toFixed(2), y: +lc[1].toFixed(2), tribe: 'tao', coast: true, islet: true };
    hexes.push(lh); byId[lh.id] = lh;

    hexes.forEach(function (h) {
      if (h.islet) return;
      var ll = unproject(h.x, h.y), bestT = null, bestD = 1e9;
      for (var t in SEEDS) {
        for (var i = 0; i < SEEDS[t].length; i++) {
          var d = km(ll, SEEDS[t][i]);
          if (d < bestD) { bestD = d; bestT = t; }
        }
      }
      if (bestD <= SEED_RADIUS_KM && bestT !== 'tao') h.tribe = bestT;
      var nb = NEIGH[h.row & 1];
      for (var n = 0; n < 6; n++) {
        if (!byId[(h.col + nb[n][0]) + '_' + (h.row + nb[n][1])]) { h.coast = true; break; }
      }
    });
    // 被族群區域包住的零星空格，歸給周圍最多的那一族
    hexes.forEach(function (h) {
      if (h.tribe || h.islet) return;
      var nb = NEIGH[h.row & 1], cnt = {}, top = null;
      for (var n = 0; n < 6; n++) {
        var o = byId[(h.col + nb[n][0]) + '_' + (h.row + nb[n][1])];
        if (o && o.tribe && !o.filled) { cnt[o.tribe] = (cnt[o.tribe] || 0) + 1; if (!top || cnt[o.tribe] > cnt[top]) top = o.tribe; }
      }
      if (top && cnt[top] >= 4) { h.tribe = top; h.filled = true; }
    });
    // 其餘沒有族群的格子是野地：靠海是漁場，其他輪流是獵場與林地
    var wildN = 0;
    hexes.forEach(function (h) { if (!h.tribe) h.wild = h.coast ? 'fish' : (wildN++ % 2 ? 'wood' : 'hunt'); });
    var settlements = SETTLEMENTS.map(function (st) {
      var p = project(st.at[0], st.at[1]), best = null, bd = 1e9;
      hexes.forEach(function (h) { if (h.tribe) return; var d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < bd) { bd = d; best = h; } });
      best.settlement = st.id; delete best.wild;
      return { id: st.id, name: st.name, hex: best.id, x: best.x, y: best.y };
    });
    var regions = {}, centroid = {};
    hexes.forEach(function (h) { if (h.tribe) (regions[h.tribe] = regions[h.tribe] || []).push(h.id); });
    for (var t2 in regions) {
      var sx = 0, sy = 0, list = regions[t2];
      list.forEach(function (id) { sx += byId[id].x; sy += byId[id].y; });
      centroid[t2] = [+(sx / list.length).toFixed(1), +(sy / list.length).toFixed(1)];
    }
    cache = { hexes: hexes, byId: byId, regions: regions, centroid: centroid, settlements: settlements };
    return cache;
  }

  // 平滑的海岸線：以各點的中點為端點、原本的點為控制點
  function smoothPoints(poly) {
    var pts = poly.map(function (p) { return project(p[0], p[1]); }), out = [], n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      out.push({ c: a, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
    }
    return out;
  }
  function smoothPath(poly) {
    var sp = smoothPoints(poly), last = sp[sp.length - 1].m, d = 'M' + last[0].toFixed(1) + ' ' + last[1].toFixed(1);
    sp.forEach(function (q) { d += 'Q' + q.c[0].toFixed(1) + ' ' + q.c[1].toFixed(1) + ' ' + q.m[0].toFixed(1) + ' ' + q.m[1].toFixed(1); });
    return d + 'Z';
  }
  // 一格可以住好幾個部落：第 0 個在中央，其餘繞一圈
  var SLOTS = 7;
  function slotPos(h, i) {
    if (!i) return [h.x, h.y];
    var a = (i - 1) * Math.PI / 3 + 0.3;
    return [+(h.x + 3 * Math.cos(a)).toFixed(2), +(h.y + 3 * Math.sin(a)).toFixed(2)];
  }
  function nearestHex(x, y, maxDist) {
    var best = null, bd = maxDist == null ? 1e9 : maxDist;
    build().hexes.forEach(function (h) { var d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } });
    return best;
  }
  function outlinePath(poly) {
    return poly.map(function (p, i) { var q = project(p[0], p[1]); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('') + 'Z';
  }

  return {
    OUTLINE: OUTLINE, ISLETS: ISLETS, SEEDS: SEEDS, MAP_W: MAP_W, MAP_H: MAP_H, HEX_SIZE: S,
    project: project, unproject: unproject, build: build, hexCorners: hexCorners, hexDist: hexDist,
    outlinePath: outlinePath, smoothPath: smoothPath, smoothPoints: smoothPoints, slotPos: slotPos, nearestHex: nearestHex,
    SLOTS: SLOTS, RANGES: RANGES
  };
});
