/* 山海部落 — 操作介面（選區域落腳、拓荒與部落經營、掛機、拜訪、軍事與對戰、圖鑑） */
(function () {
  'use strict';
  var R = World.rules, G = Geo.build();
  var STAGE_TYPES = ['house', 'farm', 'taro', 'mat', 'special', 'storage', 'barracks', 'archery', 'tower', 'hut', 'water', 'heal', 'craft', 'market', 'plaza', 'guest', 'unique'];   // 空地上可以蓋的建築（第二批多了 9 種）
  // 獨特兵種的特性、英雄能力的效果（規則在 shared/world.js，這裡只是給玩家看的說明）
  function pct(x) { return Math.round(x * 100) + '%'; }
  function traitFx(tr) {
    var T = R.TUNE;
    return tr === 'guard' ? '守在自己部落時，攻擊多 ' + T.guardPct + '%' : tr === 'sharp' ? '遠程，開場的遠射就能出手，攻擊力比弓手高'
      : tr === 'band' ? '一起出征的同伴越多越強（每多一位加 ' + T.bandPct + '%，最多 ' + T.bandMax + '%）' : '守在自己部落時更耐打（多 ' + T.wallHpPct + '%）';
  }
  function abilityFx(ab) {   // 英雄能力是自動發動的：寫出什麼時候發動、效果是什麼
    var T = R.TUNE;
    return ab === 'volley2' ? '開場的遠射時發動，那一輪我方的攻擊變成 ' + T.abVolley2 + ' 倍'
      : ab === 'relay' ? '負傷的人超過三成時發動，負傷的人有 ' + pct(T.abRelayBack) + ' 回到隊伍裡'
      : ab === 'unity' ? '第一次交鋒時發動，那一回合我方的損失只有原本的 ' + pct(T.abUnity) : '人數剩六成以下時發動，那一回合我方的損失只有原本的 ' + pct(T.abSteadfast);
  }
  var ODDS_ZH = { high: '高', mid: '中', low: '低' };
  function oddsHTML(mine, theirs) { var o = R.odds(mine, theirs); return '<span class="odds ' + o + '">勝算' + ODDS_ZH[o] + '</span>'; }
  function gradeText(r) {   // 戰報右邊的一句話
    if (r.alert) return '有人來搶';
    if (r.point && !r.show) return r.win ? '採集' : '折返';
    if (r.note) return '折返';
    if (r.grade == null) return '攻破 ' + (r.broken || 0) + ' 路';   // 改版前的舊戰報
    return r.role === 'atk' ? (r.win ? R.GRADE[r.grade] : '撤退') : (r.win ? '守住' : '被攻下');
  }
  function perTime(perSec) {   // 產量的寫法：快的時候寫每分鐘，慢的時候（正式節奏）寫每小時
    var m = perSec * 60; return m <= 0 ? '0/分' : m >= 10 ? Math.round(m) + '/分' : m >= 1 ? Math.round(m * 10) / 10 + '/分' : Math.round(m * 60) + '/時';
  }
  var GUARD = ['沒有', '少', '中等', '多'];
  var JOBS = ['food', 'mat', 'special'], WILD = { fish: '漁場', hunt: '獵場', wood: '林地' };
  var S = { me: null, pubs: [], nodes: [], node: null, alerted: {}, view: 'village', popMore: false, leftMin: false, tab: 'build', zone: null, selTile: null, visit: null, needCode: false, show: null, autoShown: {}, marches: [], attack: null, report: null, closed: null, gift: null, rel: [], points: [], stock: {}, market: [], feed: [], alliances: {}, form: { owner: '', name: '', code: '', adopt: '', ally: '', give: 'food', giveN: '10', want: 'mat', wantN: '10' }, mode: '', online: false, resetAt: 0, joining: false };
  var el = {}, MV = null, VV = null;

  // ---------- 小工具 ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(x) { return Math.floor(x || 0); }
  function setHTML(node, html) { if (node._h === html) return false; node.innerHTML = html; node._h = html; return true; }
  function dur(sec) {
    sec = Math.max(0, Math.ceil(sec));
    if (sec >= 3600) return Math.floor(sec / 3600) + ' 小時 ' + ('0' + Math.floor(sec % 3600 / 60)).slice(-2) + ' 分';
    return sec < 60 ? sec + ' 秒' : Math.floor(sec / 60) + ' 分 ' + ('0' + sec % 60).slice(-2) + ' 秒';
  }
  function coarse(sec) { sec = Math.max(0, sec); return sec >= 3600 ? Math.ceil(sec / 3600) + ' 小時' : sec >= 60 ? Math.ceil(sec / 60) + ' 分' : Math.ceil(sec) + ' 秒'; }   // 只寫最大的單位
  function toast(msg, bad) {
    var d = document.createElement('div'); d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = msg;
    el.toast.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
  }
  function scene() { return S.visit ? 'village' : (!S.me || S.view === 'map') ? 'map' : 'village'; }   // 畫面是部落還是大地圖
  var DRAWERS = { tech: '技藝', army: '軍事', social: '聯盟', trade: '交易', reports: '戰報', codex: '圖鑑', test: '測試工具', tribe: '族人', quest: '任務' };
  function drawer() { return !S.me ? 'start' : S.visit ? null : DRAWERS[S.tab] ? S.tab : null; }   // 打開的視窗（蓋在畫面上）
  function shown() { return S.visit ? S.visit.v : S.me; }   // 目前畫面上的部落：自己的，或正在拜訪的
  function ago(ms) { var m = Math.round(ms / 60000); return m < 1 ? '不到 1 分鐘' : m < 60 ? m + ' 分鐘' : Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分鐘'; }
  function myTribe() { return Tribes.get(S.me.tribe); }
  function bdef(t, type) { return type === 'unique' ? t.uniq.building : t.b[type]; }   // 建築的名稱與說明；獨特建築另外放在 uniq
  function nat(o) { return esc(o.zh) + (o.native ? ' <i class="nat">' + esc(o.native) + '</i>' : ''); }
  function all3(o) { return o.w + o.a + (o.u || 0); }
  function uniqFx(t) {
    var T = R.TUNE, g = T.prod * (T['prod_' + t.id] || 1) / T.pace;
    switch (t.uniq.building.effect) {
      case 'watch': return '來出征的隊伍路上多花 ' + pct(T.watchSlow - 1) + ' 的時間；守軍的戰力多 ' + T.watchDefPct + '%';
      case 'range': return '到野地採集的速度快 ' + pct(T.rangeYield - 1) + '，可以多派 1 支隊伍';
      case 'pond': return '不用人手，固定多 ' + perTime(T.pondFood / 60 * g) + ' 的' + t.res.food + '和 ' + perTime(T.pondSp / 60 * g) + ' 的' + t.sp.zh;
      case 'vault': return '倉庫受保護的份量變成 ' + T.vaultProt + ' 倍，倉庫容量 +' + T.vaultCap;
    }
    return '';
  }
  function rewardText(t, i) {   // 任務每一章的獎勵
    return i === 0 ? '器物「' + t.items[0].zh + '」，' + t.res.food + '產量永久 +' + Math.round(R.TUNE.itemBonus * 100) + '%，另外送 80 份' + t.res.food
      : i === 1 ? '器物「' + t.items[1].zh + '」，' + t.res.mat + '產量永久 +' + Math.round(R.TUNE.itemBonus * 100) + '%，另外送 80 份' + t.res.mat
      : i === 2 ? '可以興建獨特建築「' + t.uniq.building.zh + '」'
      : i === 3 ? '可以訓練獨特兵種「' + t.uniq.unit.zh + '」'
      : '「' + t.hero.zh + '」成為部落的傳說英雄，並且可以舉辦「' + t.bless.zh + '」';
  }

  /* 可以拖曳、縮放的畫面。cover=true 時畫面一定被場景填滿（部落）；false 時整張圖都看得到（地圖）。 */
  function PanZoom(svg, cam, W, H, o) {
    var self = this, ptrs = {}, drag = null;
    this.k = 1; this.cx = W / 2; this.cy = H / 2; this.s0 = 1; this.vw = W; this.vh = H; this.sized = false;
    function count() { return Object.keys(ptrs).length; }
    function two() { var k = Object.keys(ptrs); return Math.hypot(ptrs[k[0]].x - ptrs[k[1]].x, ptrs[k[0]].y - ptrs[k[1]].y); }
    this.toWorld = function (cx, cy) {
      var r = svg.getBoundingClientRect();
      return [((cx - r.left) / self.s0 - (self.vw / 2 - self.cx * self.k)) / self.k, ((cy - r.top) / self.s0 - (self.vh / 2 - self.cy * self.k)) / self.k];
    };
    this.apply = function () {
      self.k = Math.max(1, Math.min(o.maxK, self.k));
      var hx = o.cover ? self.vw / (2 * self.k) : 0, hy = o.cover ? self.vh / (2 * self.k) : 0;
      self.cx = Math.max(hx, Math.min(W - hx, self.cx)); self.cy = Math.max(hy, Math.min(H - hy, self.cy));
      cam.setAttribute('transform', 'translate(' + (self.vw / 2 - self.cx * self.k).toFixed(2) + ' ' + (self.vh / 2 - self.cy * self.k).toFixed(2) + ') scale(' + self.k.toFixed(3) + ')');
      if (o.onChange) o.onChange(self);
    };
    this.resize = function () {
      var r = svg.getBoundingClientRect(); if (!r.width || !r.height) return false;
      self.s0 = o.cover ? Math.max(r.width / W, r.height / H) : Math.min(r.width / W, r.height / H);
      self.vw = r.width / self.s0; self.vh = r.height / self.s0; self.sized = true;
      svg.setAttribute('viewBox', '0 0 ' + self.vw.toFixed(1) + ' ' + self.vh.toFixed(1));
      self.apply(); return true;
    };
    this.zoomAt = function (f, cx, cy) {
      var a = self.toWorld(cx, cy); self.k *= f; self.apply();
      var b = self.toWorld(cx, cy); self.cx += a[0] - b[0]; self.cy += a[1] - b[1]; self.apply();
    };
    this.zoomCenter = function (f) { var r = svg.getBoundingClientRect(); self.zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); };
    this.focus = function (x, y, k) { self.cx = x; self.cy = y; if (k) self.k = k; self.apply(); };
    svg.addEventListener('pointerdown', function (e) {
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* 有些瀏覽器不支援，拖曳仍可用 */ }
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() === 1) drag = { x: e.clientX, y: e.clientY, cx: self.cx, cy: self.cy, moved: false };
      else if (count() === 2) drag = { pinch: two(), k: self.k, moved: true };
    });
    svg.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId] || !drag) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (drag.pinch) { if (count() === 2) { self.k = drag.k * two() / drag.pinch; self.apply(); } return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
      if (drag.moved) { self.cx = drag.cx - dx / (self.s0 * self.k); self.cy = drag.cy - dy / (self.s0 * self.k); self.apply(); }
    });
    function up(e) {
      if (!ptrs[e.pointerId]) return;
      var tap = drag && !drag.moved && count() === 1;
      delete ptrs[e.pointerId];
      if (tap) { var p = self.toWorld(e.clientX, e.clientY); o.onTap(p[0], p[1], 1 / (self.s0 * self.k)); }
      if (count() === 0) drag = null;
      else { var k = Object.keys(ptrs)[0]; drag = { x: ptrs[k].x, y: ptrs[k].y, cx: self.cx, cy: self.cy, moved: true }; }
    }
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', function (e) { e.preventDefault(); self.zoomAt(e.deltaY < 0 ? 1.2 : 0.83, e.clientX, e.clientY); }, { passive: false });
  }

  // ---------- 骨架 ----------
  function boot() {
    var app = document.getElementById('app');
    // 全螢幕的畫面（部落或大地圖），資訊都疊在畫面上：上方資訊列、左邊追蹤欄、點了東西跳出的小視窗、下方按鈕列、提醒橫幅、蓋在畫面上的視窗
    app.innerHTML = '<main id="stage"><section id="scene">' +
      '<svg id="vsvg" role="img" aria-label="部落畫面">' + Art.DEFS + '<g id="vcam"><image id="vimg" width="' + Art.SW + '" height="' + Art.SH + '" preserveAspectRatio="none"/><g id="vdecor"></g><g id="vobjs"></g><g id="folk"></g></g></svg>' +
      '<svg id="msvg" role="img" aria-label="臺灣全島地圖"></svg></section>' +
      '<header id="hud"></header><aside id="left"></aside><div id="banner"></div><div id="feedbar"></div><div id="tools"></div><nav id="dock" aria-label="功能"></nav><div id="pop"></div>' +
      '<aside id="drawer" hidden><header id="dhead"></header><div id="pbody"></div></aside></main><div id="modal"></div><div id="toast" role="status" aria-live="polite"></div>';
    ['hud', 'stage', 'scene', 'vsvg', 'vcam', 'vimg', 'vdecor', 'vobjs', 'folk', 'msvg', 'tools', 'left', 'banner', 'feedbar', 'dock', 'pop', 'drawer', 'dhead', 'pbody', 'toast', 'modal'].forEach(function (id) { el[id] = document.getElementById(id); });
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    el.msvg.innerHTML = '<g id="cam"><image width="' + Geo.MAP_W + '" height="' + Geo.MAP_H + '" href="' + Art.paintMap(4).toDataURL('image/png') + '" preserveAspectRatio="none"/>' +
      '<g id="mzone"></g><g id="mmarks"></g><g id="mlabels">' + Art.mapLabels() + '</g></g>';
    el.mzone = document.getElementById('mzone'); el.mmarks = document.getElementById('mmarks');
    MV = new PanZoom(el.msvg, document.getElementById('cam'), Geo.MAP_W, Geo.MAP_H, { cover: false, maxK: 7, onTap: mapTap, onChange: function (pz) {
      el.msvg.style.setProperty('--u', (1 / (pz.s0 * pz.k)).toFixed(4)); el.msvg.classList.toggle('far', pz.k < 1.9); el.msvg.classList.toggle('near', pz.k >= 3); renderMarks(); placePop();
    } });
    VV = new PanZoom(el.vsvg, el.vcam, Art.SW, Art.SH, { cover: true, maxK: 3.2, onTap: siteTap, onChange: function () { placePop(); } });
    window.addEventListener('resize', function () { MV.resize(); VV.resize(); placePop(); });
    setInterval(tickTimers, 250);
    setInterval(moveFolk, 2400);
    setInterval(function () { if (S.visit) Net.view(S.visit.id, function (d) { if (d && S.visit && S.visit.id === d.id) { S.visit.v = d; render(); } }); }, 3000);
    Net.on('status', function (s) { S.online = s.online; S.mode = s.mode; render(); });
    Net.on('hello', function (h) { S.pubs = h.villages || S.pubs; if (h.needCode != null) S.needCode = !!h.needCode; if (h.contact != null) S.contact = String(h.contact); if (h.reset) { S.me = null; S.zone = null; S.selTile = null; S.visit = null; S.tab = 'build'; S.view = 'village'; el.vobjs._sig = null; } render(); });
    Net.on('state', function (st) {
      if (st.tune) R.setTune(st.tune);   // 後台調過的數值：顯示的時間、產量、說明都跟著變
      S.me = st.me; S.pubs = st.villages; S.marches = st.marches || [];
      S.rel = st.rel || []; S.nodes = st.nodes || []; S.stock = st.stock || {}; S.market = st.market || []; S.feed = st.feed || []; S.alliances = st.alliances || {};
      if (st.me) Art.need([st.me.tribe]);   // 自己族群的美術素材
      autoShow(st.me); raidAlert(st.me);
      render();
    });
    Art.onLoad(function () { el.vobjs._sig = null; el.vimg._t = null; folkN = -1; if (el.mmarks) el.mmarks._h = null; render(); });   // 某一族的美術素材載好了：重畫
    Net.start();
    render();
  }

  // ---------- 世界地圖 ----------
  function mapTap(x, y, u) {
    var nb = null, nbd = 7 * u;   // 先看有沒有點到資源點
    S.nodes.forEach(function (n) { var d = Math.hypot(n.x - x, n.y - y); if (d < nbd) { nbd = d; nb = n; } });
    if (nb) { S.node = nb.id; S.zone = nb.hex; if (S.me) S.tab = 'map'; S.popMore = false; render(); return; }
    S.node = null;
    var best = null, bd = 9 * u;   // 點得很靠近部落的記號才算點到部落，不然附近的野地會點不到
    S.pubs.forEach(function (v) { var d = Math.hypot(v.pos[0] - x, v.pos[1] - y); if (d < bd) { bd = d; best = v; } });
    var h = best ? G.byId[best.hex] : Geo.nearestHex(x, y, Geo.HEX_SIZE * 1.15);
    S.zone = h && (best || !S.me || h.settlement) ? h.id : S.me ? null : h ? h.id : null;   // 有部落的人：點到部落或聚落才跳出小視窗
    if (S.me) S.tab = 'map';
    S.popMore = false; render();
  }
  function renderMarks() {
    if (!MV || !MV.sized) return;
    var u = 1 / (MV.s0 * MV.k), s = '', z = S.zone && G.byId[S.zone];
    setHTML(el.mzone, z ? '<circle class="zsel" cx="' + z.x + '" cy="' + z.y + '" r="' + (Geo.HEX_SIZE * 1.05) + '" style="stroke-width:' + (2.2 * u).toFixed(3) + '"/>' : '');
    G.settlements.forEach(function (st) {
      var r = 5 * u;
      s += '<path class="sett" d="M' + st.x + ' ' + (st.y - r) + 'L' + (st.x + r) + ' ' + st.y + 'L' + st.x + ' ' + (st.y + r) + 'L' + (st.x - r) + ' ' + st.y + 'Z" style="stroke-width:' + (1.4 * u).toFixed(3) + '"/>';
    });
    var byId = {}; S.pubs.forEach(function (v) { byId[v.id] = v; });
    var nodeById = {}, far = MV.k < 2.2;
    S.nodes.forEach(function (n) {   // 資源點：依種類上色，數字是等級；有人在採的外面加一圈（自己的金色，別人的用族群色）
      nodeById[n.id] = n;
      var r = (far ? 2.6 : 4.6) * u, mine = S.me && n.g && n.g.v === S.me.id, ring = n.g ? (mine ? '#E3B341' : Tribes.get(n.g.tribe).color) : '', sel = S.node === n.id;
      var big = MV.k >= 3; if (big) r = 11 * u;
      s += '<g class="nd' + (sel ? ' sel' : '') + (big ? ' big' : '') + '"><circle cx="' + n.x + '" cy="' + n.y + '" r="' + r.toFixed(3) + '" fill="' + (big ? '#14212A' : NODE_COL[n.k]) + '" style="stroke-width:' + ((sel ? 2.4 : big ? 1.6 : 1.1) * u).toFixed(3) + (big ? ';stroke:' + NODE_COL[n.k] : '') + '"/>' +
        (ring ? '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + (r + 2.4 * u).toFixed(3) + '" fill="none" stroke="' + ring + '" style="stroke-width:' + (2 * u).toFixed(3) + '"/>' : '') +
        (big ? '<svg x="' + (n.x - 7.5 * u).toFixed(3) + '" y="' + (n.y - 7.5 * u).toFixed(3) + '" width="' + (15 * u).toFixed(3) + '" height="' + (15 * u).toFixed(3) + '" viewBox="0 0 24 24" style="color:' + NODE_COL[n.k] + '">' + Art.iconBody(NODE_IC[n.k]) + '</svg>' +
          '<circle cx="' + (n.x + 9 * u).toFixed(3) + '" cy="' + (n.y + 8 * u).toFixed(3) + '" r="' + (5.2 * u).toFixed(3) + '" fill="#E3B341"/><text class="lvt" x="' + (n.x + 9 * u).toFixed(3) + '" y="' + (n.y + 10.6 * u).toFixed(3) + '" style="font-size:' + (7.6 * u).toFixed(3) + 'px">' + n.lv + '</text>'
          : far ? '' : '<text x="' + n.x + '" y="' + (n.y + 2.4 * u).toFixed(2) + '" style="font-size:' + (6.8 * u).toFixed(3) + 'px">' + n.lv + '</text>') + '</g>';
    });
    S.marches.forEach(function (m) {   // 出征中的隊伍：一條線加一個移動的點
      var nd = m.node && nodeById[m.node], a = byId[m.from], b = m.node ? (nd ? { pos: [nd.x, nd.y] } : null) : byId[m.to]; if (!a || !b) return;
      var f = m.phase === 'gather' ? 1 : Math.max(0, Math.min(1, (Date.now() - m.departAt) / Math.max(1, m.arriveAt - m.departAt)));
      if (m.phase === 'back') f = 1 - f;
      var x = a.pos[0] + (b.pos[0] - a.pos[0]) * f, y = a.pos[1] + (b.pos[1] - a.pos[1]) * f;
      s += '<path class="mline" d="M' + a.pos[0] + ' ' + a.pos[1] + 'L' + b.pos[0] + ' ' + b.pos[1] + '" style="stroke-width:' + (1.6 * u).toFixed(3) + ';stroke-dasharray:' + (5 * u).toFixed(3) + ' ' + (4 * u).toFixed(3) + '"/>' +
        '<circle class="mdot' + (m.phase === 'gather' ? ' fight' : '') + '" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + (4 * u).toFixed(3) + '" style="stroke-width:' + (1.4 * u).toFixed(3) + '"/>' +
        (S.me && m.from === S.me.id && MV.k >= 2 ? '<text class="mtime" x="' + x.toFixed(2) + '" y="' + (y - 7 * u).toFixed(2) + '" style="font-size:' + (8.5 * u).toFixed(3) + 'px;stroke-width:' + (2.6 * u).toFixed(3) + '">' + (m.phase === 'gather' ? '採集中 ' : m.phase === 'back' ? '回程 ' : '') + dur((m.arriveAt - Date.now()) / 1000) + '</text>' : '');
    });
    S.pubs.forEach(function (v) {
      var mine = S.me && v.id === S.me.id, t = Tribes.get(v.tribe), r = (mine ? 6.5 : MV.k < 1.9 ? 3 : 4.2) * u;
      if (MV.k >= 3) {   // 放大的時候：部落畫成各族的中心建築
        var bs = (mine ? 0.4 : 0.32) * u, bw = 160 * bs, bh = 180 * bs;   // 畫面上固定大約 64／51 像素寬，放大縮小都一樣
        s += '<g class="vm big' + (mine ? ' me' : S.me && S.me.ally && v.ally === S.me.ally ? ' ally' : '') + '"><ellipse cx="' + v.pos[0] + '" cy="' + v.pos[1] + '" rx="' + (bw * 0.42).toFixed(3) + '" ry="' + (bw * 0.2).toFixed(3) + '" fill="' + t.color + '" opacity=".55"/>' +
          '<svg x="' + (v.pos[0] - bw / 2).toFixed(3) + '" y="' + (v.pos[1] - bh * 140 / 180).toFixed(3) + '" width="' + bw.toFixed(3) + '" height="' + bh.toFixed(3) + '" viewBox="-80 -140 160 180" overflow="visible">' + Art.building('center', t, v.c) + '</svg>' +
          '<text x="' + v.pos[0] + '" y="' + (v.pos[1] + 14 * u).toFixed(2) + '" style="font-size:' + ((mine ? 11 : 9.5) * u).toFixed(3) + 'px;stroke-width:' + (2.6 * u).toFixed(3) + '">' + esc(v.name) + '</text></g>';
        return;
      }
      s += '<g class="vm' + (mine ? ' me' : S.me && S.me.ally && v.ally === S.me.ally ? ' ally' : '') + '"><circle cx="' + v.pos[0] + '" cy="' + v.pos[1] + '" r="' + r.toFixed(3) + '" fill="' + t.color + '" style="stroke-width:' + ((mine ? 2.4 : 1.4) * u).toFixed(3) + '"/>' +
        '<text x="' + v.pos[0] + '" y="' + (v.pos[1] + r + 10 * u).toFixed(2) + '" style="font-size:' + (10 * u).toFixed(3) + 'px;stroke-width:' + (2.6 * u).toFixed(3) + '">' + esc(v.name) + '</text></g>';
    });
    setHTML(el.mmarks, s);
  }

  // ---------- 部落畫面 ----------
  var folkN = -1;
  function siteTap(x, y) {
    if (!S.me || S.visit) return;   // 拜訪別人時只能看
    var best = null, bd = 78;
    for (var i = 0; i < R.TILE_N; i++) {
      var p = Art.sitePos(i), lift = S.me.tiles[i] || !S.me.land[i] ? 22 : 0, d = Math.hypot(p[0] - x, (p[1] - lift - y) * 1.25);
      if (d < bd) { bd = d; best = i; }
    }
    S.selTile = best === S.selTile ? null : best; S.tab = 'build'; S.popMore = false; render();
  }
  function renderVillage() {
    var v = shown(); if (!v) return;
    var t = Tribes.get(v.tribe), sel = S.visit ? null : S.selTile;
    Art.need([t.id]);
    var gk = t.id + Art.newArt() + Art.ready(t.id);
    if (el.vimg._t !== gk) { el.vimg.setAttribute('href', Art.groundURL(t)); el.vdecor.innerHTML = Art.decor(t); el.vimg._t = gk; folkN = -1; }
    if (!VV.sized || el.vimg._focus !== v.id) {
      if (VV.resize()) { var c = Art.sitePos(R.CENTER_TILE); VV.focus(c[0], c[1] - 10, Math.max(1, Math.min(3.2, VV.vw / 1040))); el.vimg._focus = v.id; }
    }
    var bub = !S.visit && S.me && S.me.d ? { farm: '+' + perTime(S.me.d.rates.food), mat: '+' + perTime(S.me.d.rates.mat), special: '+' + perTime(S.me.d.rates.special) } : null;   // 產量的泡泡
    var sig = v.id + '|' + sel + '|' + Art.newArt() + Art.ready(t.id) + '|' + JSON.stringify(v.tiles) + v.land.join('') + JSON.stringify(v.queue) + JSON.stringify(bub);
    if (el.vobjs._sig !== sig) { el.vobjs.innerHTML = Art.scene(v, sel, !!S.visit, bub); el.vobjs._sig = sig; tickTimers(); }
    var want = Math.min(v.pop, 14);
    if (folkN !== want || el.folk._t !== v.id) {
      var s = '';
      for (var i = 0; i < want; i++) { var p = spot(v); s += '<g class="person" style="transform:translate(' + p[0] + 'px,' + p[1] + 'px)">' + Art.person(i % 3 ? '#F2EAD6' : t.look.trim, t.id, i) + '</g>'; }
      el.folk.innerHTML = s; folkN = want; el.folk._t = v.id;
    }
  }
  function spot(v) {   // 族人走動的位置：開墾好的地附近
    var open = []; for (var i = 0; i < R.TILE_N; i++) if (v.land[i]) open.push(i);
    var p = Art.sitePos(open[Math.floor(Math.random() * open.length)]);
    return [Math.round(p[0] - 44 + Math.random() * 88), Math.round(p[1] + 24 + Math.random() * 16)];
  }
  function moveFolk() {
    if (!shown() || scene() !== 'village' || document.hidden) return;
    var nodes = el.folk.children;
    for (var i = 0; i < nodes.length; i++) if (Math.random() < 0.55) { var p = spot(shown()); nodes[i].style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px)'; }
  }
  function tickTimers() {
    if (S.marches.length && scene() === 'map') renderMarks();
    var now = Date.now(), list = document.querySelectorAll('[data-until]');
    for (var i = 0; i < list.length; i++) { var left = (+list[i].getAttribute('data-until') - now) / 1000; list[i].textContent = list[i].getAttribute('data-coarse') ? coarse(left) : dur(left); }
  }

  // ---------- 上方資訊列 ----------
  function chip(ic, label, val, cap, cls) {
    return '<div class="chip' + (cls ? ' ' + cls : '') + '" title="' + label + '">' + Art.icon(ic) + '<span class="lbl">' + label + '</span><b>' + val + '</b>' + (cap != null ? '<span class="cap">/' + cap + '</span>' : '') + '</div>';
  }
  function renderHud() {
    var live = S.pubs.filter(function (v) { return v.online && !v.bot; }).length;
    var me = S.me, h, badge = '<div class="mode' + (S.mode !== 'solo' && !S.online ? ' off' : '') + '">' + (S.mode === 'solo' ? '單機試玩' : S.online ? '已連線 · ' + live + ' 人' : '連線中斷，重新連線中') + '</div>';
    if (!me) h = '<div class="brand">山海部落</div><div class="spacer"></div><div class="turn">橫放手機，畫面更大</div>' + badge;
    else {
      var t = myTribe(), d = me.d, net = d.net, safe = Math.max(me.shieldUntil, me.newbieUntil);
      var pill = function (ic, val, cap, sub, cls, label) { return '<div class="pill' + (cls ? ' ' + cls : '') + '" title="' + label + '">' + Art.icon(ic) + '<b>' + val + '</b>' + (cap != null ? '<span class="cap">/' + cap + '</span>' : '') + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
      h = '<button class="mecard" data-act="tab" data-tab="codex" aria-label="' + esc(me.name) + '，' + t.zh + '，戰力 ' + d.power + '"><span class="av" style="background:' + t.color + '">' + esc(me.name.slice(0, 1)) + '</span><span class="mi"><b>' + esc(me.name) + '</b><span class="pw">' + Art.icon('power') + ' 戰力 ' + d.power + '</span></span></button>' +
        (safe > Date.now() ? '<div class="pill safe" title="保護中，別人不能出征你">' + Art.icon('shield') + '<b data-until="' + safe + '" data-coarse="1"></b></div>' : '') +
        (me.blessUntil > Date.now() ? '<div class="pill bless" title="族人同心，產量加成中" role="img" aria-label="族人同心，產量加成中">' + Art.icon('fire') + '</div>' : '') +
        '<div class="spacer"></div>' +
        pill('food', n0(me.res.food), null, (net >= 0 ? '+' : '−') + perTime(Math.abs(net)), d.hungry || net < 0 ? 'warn' : '', t.res.food + '（倉庫 ' + d.cap + '）') +
        pill('mat', n0(me.res.mat), null, '+' + perTime(d.rates.mat), '', t.res.mat + '（倉庫 ' + d.cap + '）') +
        pill('sp', n0(me.sp[me.tribe]), null, '', '', t.sp.zh) + pill('pop', me.pop, d.popCap, '', '', '族人') + pill('army', all3(me.units), d.armyCap, '', '', '在部落裡的戰士') + badge;
    }
    setHTML(el.hud, h);
  }
  /* 左邊的追蹤欄：部落發展、神話主線、工人、訓練、外面的隊伍。點一下就帶到要去的地方 */
  function renderLeft() {
    var me = S.me;
    if (!me || S.visit) { setHTML(el.left, ''); return; }
    if (S.leftMin) { setHTML(el.left, '<button class="trk mini" data-act="left-toggle" aria-label="打開追蹤欄">' + Art.icon('book') + ' 任務 ›</button>'); return; }
    var t = myTribe(), h = '', q = me.dq, p = me.qp;
    if (q) h += '<div class="trk' + (q.done ? ' ready' : '') + '"><button class="tt" data-act="tab" data-tab="quest"><span class="th">部落發展 · 第 ' + (q.i + 1) + ' 步</span>' + devText(t, q) + '<span class="bar"><i style="width:' + Math.round(100 * q.cur / q.n) + '%"></i></span></button>' +
      '<button class="go' + (q.done ? '' : ' ghost') + '" data-act="' + (q.done ? 'dev' : 'dev-go') + '">' + (q.done ? '領取' : '前往') + '</button></div>';
    if (p) h += '<div class="trk' + (p.done ? ' ready' : '') + '"><button class="tt" data-act="tab" data-tab="quest"><span class="th">' + Art.icon('book') + esc(t.story.t) + ' · 第 ' + (p.i + 1) + ' 章</span>' + p.text + ' <b>' + p.cur + '/' + p.n + '</b></button>' + (p.done ? '<button class="go" data-act="quest">完成</button>' : '') + '</div>';
    else h += '<div class="trk"><button class="tt" data-act="tab" data-tab="quest"><span class="th">' + Art.icon('fire') + esc(t.bless.zh) + '</span>' + (me.blessUntil > Date.now() ? '同心中，還有 <b data-until="' + me.blessUntil + '"></b>' : me.blessNext > Date.now() ? '下次可以舉辦：<b data-until="' + me.blessNext + '"></b>' : '可以舉辦了') + '</button></div>';
    if (me.research) { var rt = R.TECH[me.research.id]; h += '<button class="q" data-act="tab" data-tab="tech">' + Art.icon('craft') + '<span>學「' + rt.zh + '」→ ' + me.research.to + ' 級</span><b data-until="' + me.research.doneAt + '"></b></button>'; }
    if (me.hurt && all3(me.hurt)) h += '<button class="q" data-act="tab" data-tab="army">' + Art.icon('heal') + '<span>療養中 ' + all3(me.hurt) + ' 位</span></button>';
    for (var i = 0; i < me.d.builders; i++) {
      var w = me.queue[i];
      h += w ? '<button class="q" data-act="go-tile" data-tile="' + w.tile + '">' + Art.icon('build') + '<span>' + (w.type === 'clear' ? '拓荒' : w.type === 'wall' ? esc(t.b.wall.zh) + ' → ' + w.to + ' 級' : esc(bdef(t, w.type).zh) + (w.type === 'unique' ? '' : ' → ' + w.to + ' 級')) + '</span><b data-until="' + w.doneAt + '"></b></button>'
        : '<div class="q idle">' + Art.icon('build') + '<span>工人閒著，點建築升級</span></div>';
    }
    if (me.train.length) h += '<button class="q" data-act="tab" data-tab="army">' + Art.icon('army') + '<span>訓練 ' + me.train.length + ' 位</span><b data-until="' + me.train[me.train.length - 1].doneAt + '"></b></button>';
    S.marches.filter(function (m) { return m.from === me.id; }).forEach(function (m) {
      var n = m.node && S.nodes.filter(function (x) { return x.id === m.node; })[0], tv = m.to && S.pubs.filter(function (v) { return v.id === m.to; })[0];
      var where = m.node ? (n ? R.NODE[n.k].zh + ' ' + n.lv + ' 級' : '資源點') : esc(tv ? tv.name : '出征');
      h += '<button class="q" data-act="go-march" data-id="' + m.id + '">' + Art.icon('march') + '<span>' + where + ' · ' + (m.phase === 'back' ? '回程' : m.phase === 'gather' ? '採集中' : m.node ? '前往' : '出征') + '</span><b data-until="' + m.arriveAt + '"></b></button>';
    });
    setHTML(el.left, h + '<button class="trk mini" data-act="left-toggle" aria-label="收起追蹤欄">‹ 收起</button>');
  }
  /* 下方的按鈕列；最右邊的大按鈕切換大地圖與部落 */
  function renderDock() {
    var me = S.me;
    if (!me || S.visit) { setHTML(el.dock, ''); return; }
    var unseen = me.reports.some(function (r) { return !r.seen; }), cur = drawer();
    var b = function (tab, ic, label, dot) { return '<button class="db" data-act="tab" data-tab="' + tab + '" aria-pressed="' + (cur === tab) + '"><span>' + Art.icon(ic) + (dot ? '<i class="rdot"></i>' : '') + '</span>' + label + '</button>'; };
    var map = scene() === 'map';
    setHTML(el.dock, b('tribe', 'pop', '族人', me.d.hungry) + b('army', 'army', '軍事') + b('social', 'alliance', '聯盟') + b('trade', 'trade', '交易') + b('reports', 'book', '戰報', unseen) + b('codex', 'craft', '圖鑑') +
      (Net.testing() ? b('test', 'star', '測試') : '') +
      '<button class="db big" data-act="tab" data-tab="' + (map ? 'build' : 'map') + '"><span>' + (map ? '<svg viewBox="-80 -140 160 180" class="bico">' + Art.building('center', myTribe(), me.d.center) + '</svg>' : Art.icon('map')) + '</span>' + (map ? '回部落' : '大地圖') + '</button>');
  }
  /* 上方的提醒橫幅：拜訪中、有人來出征、有人來搶採集的隊伍、糧食吃光了 */
  function renderBanner() {
    var me = S.me, h = '';
    if (S.visit) { var v = S.visit.v, vt = Tribes.get(v.tribe); h = '<div class="bn info">正在拜訪「<b>' + esc(v.name) + '</b>」（' + vt.zh + '，' + esc(vt.b.center.zh) + ' ' + v.c + ' 級）<button class="bbtn" data-act="leave">回我的部落</button></div>'; }
    else if (me) {
      var coming = S.marches.filter(function (m) { return m.to === me.id && m.phase === 'out'; })[0], th = threats(me)[0];
      if (coming) { var fv = S.pubs.filter(function (x) { return x.id === coming.from; })[0]; h = '<div class="bn">⚠ 「<b>' + esc(fv ? fv.name : '有人') + '</b>」派出 ' + coming.n + ' 人朝你的部落來了，<b data-until="' + coming.arriveAt + '"></b> 後抵達<button class="bbtn" data-act="tab" data-tab="army">看看</button></div>'; }
      else if (th) {
        var fr = S.pubs.filter(function (x) { return x.id === th.from; })[0], nn = S.nodes.filter(function (x) { return x.id === th.node; })[0], my = S.marches.filter(function (x) { return x.from === me.id && x.node === th.node; })[0];
        h = '<div class="bn">⚠ 「<b>' + esc(fr ? fr.name : '有人') + '</b>」要來搶你在' + (nn ? R.NODE[nn.k].zh : '資源點') + '的隊伍，<b data-until="' + th.arriveAt + '"></b> 後抵達' + (my ? '<button class="bbtn" data-act="recall" data-id="' + my.id + '">叫回來</button>' : '') + '</div>';
      } else if (me.d.hungry) h = '<div class="bn">' + esc(myTribe().res.food) + '吃光了：族人吃不飽，工作變慢、不能訓練<button class="bbtn" data-act="tab" data-tab="tribe">去分工</button></div>';
    }
    setHTML(el.banner, h);
  }
  function renderFeed() {   // 左下：最新的一則消息
    var f = S.me && !S.visit && S.feed.length ? S.feed[S.feed.length - 1] : null;
    setHTML(el.feedbar, f ? '<button data-act="tab" data-tab="social">' + esc(f.text) + '</button>' : '');
  }
  /* 蓋在畫面上的視窗：下方按鈕打開的軍事、聯盟、交易、戰報、圖鑑、族人、任務，還沒有部落時是開始畫面 */
  function renderDrawer() {
    var me = S.me, dn = drawer();
    el.drawer.hidden = !dn; el.stage.classList.toggle('drawer-open', !!dn);
    if (!dn) { setHTML(el.pbody, ''); return; }
    el.drawer.setAttribute('data-d', dn);
    setHTML(el.dhead, dn === 'start' ? '' : '<b>' + DRAWERS[dn] + '</b><button class="x" data-act="tab" data-tab="' + (S.view === 'map' ? 'map' : 'build') + '" aria-label="關閉">×</button>');
    var act0 = document.activeElement;   // 正在打字或選選單時不要重畫，免得輸入到一半被打斷
    if (act0 && el.pbody.contains(act0) && /^(INPUT|SELECT)$/.test(act0.tagName) && act0.type !== 'checkbox') return;
    var keep = el.pbody.scrollTop, html;
    if (dn === 'start') html = startPanel();
    else if (dn === 'army') html = armyPanel(me);
    else if (dn === 'reports') html = reportsCard(me);
    else if (dn === 'social') html = socialPanel(me, 'social');
    else if (dn === 'trade') html = socialPanel(me, 'trade');
    else if (dn === 'tribe') html = hungryCard(me) + jobsCard(me) + queueCard(me) + idleCard(me) + codeCard();
    else if (dn === 'quest') html = devCard(me) + questCard(me);
    else if (dn === 'tech') html = techPanel(me);
    else if (dn === 'test') html = testPanel(me);
    else html = codexPanel(me);
    if (setHTML(el.pbody, html)) { el.pbody.scrollTop = keep; tickTimers(); if (dn === 'start') restoreForm(); }
  }
  /* 點了東西跳出的小視窗：部落裡點建築、空地、山林；地圖上點資源點、部落、聚落 */
  function popContent() {
    var me = S.me, sc = scene();
    if (!me || S.visit || drawer()) return null;
    if (sc === 'village' && S.selTile != null) {
      var i = S.selTile, b = me.tiles[i];
      if (!me.land[i]) return { html: wildCard(me, i), at: { tile: i } };
      if (!b) return { html: emptyCard(me, i), at: { tile: i }, tall: true };
      return buildingPop(me, i, b);
    }
    if (sc === 'map') {
      var n = S.node && S.nodes.filter(function (x) { return x.id === S.node; })[0];
      if (n) return { html: nodeCard(n), at: { x: n.x, y: n.y } };
      var z = S.zone && G.byId[S.zone];
      if (z) { var here = S.pubs.filter(function (v) { return v.hex === z.id; }), p = here[0] ? here[0].pos : [z.x, z.y]; return { html: zonePanel(), at: { x: p[0], y: p[1] }, tall: !!z.settlement }; }
    }
    return null;
  }
  function renderPop() {
    var c = popContent();
    if (!c) { setHTML(el.pop, ''); el.pop._at = null; return; }
    el.pop._at = c.at;
    if (setHTML(el.pop, '<div class="pcard' + (c.tall ? ' tall' : '') + '"><button class="x" data-act="pop-close" aria-label="關閉">×</button>' + c.html + '</div>' + (c.ring || ''))) tickTimers();
    placePop();
  }
  /* 把小視窗放在點的東西旁邊（畫面拖曳、縮放時跟著移動），圓形按鈕排在建築下方 */
  function placePop() {
    var at = el.pop && el.pop._at, card = at && el.pop.querySelector('.pcard'); if (!card) return;
    var st = el.stage.getBoundingClientRect(), m, q;
    if (at.tile != null) { q = Art.sitePos(at.tile); m = el.vcam.getScreenCTM(); } else { q = [at.x, at.y]; m = document.getElementById('cam').getScreenCTM(); }
    if (!m) return;
    var x = m.a * q[0] + m.c * q[1] + m.e - st.left, y = m.b * q[0] + m.d * q[1] + m.f - st.top, W = st.width, H = st.height, w = card.offsetWidth, h = card.offsetHeight;
    var ring = el.pop.querySelectorAll('.rb'), n = ring.length, half = n ? (n - 1) / 2 * 60 + 30 : 0;
    var gap = at.tile != null ? Math.max(76, half + 14) : 26, left = x + gap + w < W - 8 ? x + gap : x - gap - w;   // 小視窗放在建築旁邊，不要蓋到圓形按鈕
    left = Math.max(8, Math.min(W - w - 8, left));
    var top = Math.max(46, Math.min(H - h - 8, y - h / 2 - (at.tile != null ? 30 : 0)));
    card.style.left = left + 'px'; card.style.top = top + 'px';
    for (var i = 0; i < n; i++) {   // 圓形按鈕在建築下方排成一道弧
      var o = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0, dx = o * (half - 30), dy = 50 + 16 * (1 - o * o);
      ring[i].style.left = Math.max(30, Math.min(W - 30, x + dx)) + 'px'; ring[i].style.top = Math.min(H - 34, y + dy) + 'px';
    }
  }
  /* 點了建築：小視窗寫現在的效果、升級後的效果、花費與時間、條件；下方一圈圓形按鈕 */
  function buildingPop(me, i, b) {
    var t = myTribe(), full = me.queue.length >= me.d.builders, h = '<h3>' + bname(t, b.type) + '<span class="lv">' + (!b.level ? '興建中' : b.type === 'unique' ? '獨特建築' : '等級 ' + b.level) + '</span></h3>', why = '', up = false;
    if (b.level) h += '<p class="eff">' + effect(b.type, b.level, t) + '</p>';
    if (b.busy) { var w = me.queue.filter(function (x) { return x.tile === i; })[0]; h += '<p class="busyline">施工中，還要 <b data-until="' + (w ? w.doneAt : 0) + '"></b></p>'; }
    else if (b.type === 'unique') h += '<p class="muted">' + t.zh + '才有的建築，只能蓋一座，不用升級。</p>';
    else if (b.level >= R.MAX_LEVEL) h += '<p class="muted">已經是最高等級。</p>';
    else {
      up = true;
      var to = b.level + 1, c = R.cost(b.type, to), need = b.type === 'center' ? R.centerUp(to) : null, miss = b.type === 'center' ? R.reqLeft(me, to) : [];
      var kinds = need && need.kinds ? Object.keys(me.sp).filter(function (k2) { return k2 !== me.tribe && me.sp[k2] >= need.each; }).length : 0;
      if (b.type !== 'center' && to > me.d.center) why = '要先把' + t.b.center.zh + '升到等級 ' + to;
      if (!why && miss.length) why = '還沒達成升級的條件';
      if (!why && full) why = '工人都在忙（同時 ' + me.d.builders + ' 項工程）';
      if (!why && !affordable(me, c, 0)) why = '物資還不夠';
      if (!why && need && kinds < need.kinds) why = '還缺別族的特產（目前有 ' + kinds + ' 種夠數）';
      h += '<p class="eff next">升到 ' + to + ' 級：' + effect(b.type, to, t) + '</p><div class="act">' + costHTML(me, c, 0) + '<span class="time">' + dur(R.buildTime(b.type, to)) + '</span></div>' +
        (need ? '<ul class="reqs">' + R.centerReq(to).map(function (r) { var ok = R.maxLevelOf(me, r.type) >= r.level; return '<li class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓' : '✗') + ' ' + esc(bdef(t, r.type).zh) + ' ' + r.level + ' 級</li>'; }).join('') + '</ul>' : '') +
        (need && need.kinds ? '<p class="spneed">另外要 ' + need.kinds + ' 種別族的特產，每種 ' + need.each + ' 份。</p>' : '') + (why ? '<p class="why">' + why + '</p>' : '');
    }
    if (S.popMore) h += '<p class="note">' + esc(bdef(t, b.type).note) + '</p>';
    var rb = function (act, ic, label, extra, cls) { return '<button class="rb' + (cls ? ' ' + cls : '') + '" data-act="' + act + '"' + (extra || '') + '><span>' + Art.icon(ic) + '</span>' + label + '</button>'; };
    var ring = (up ? rb('upgrade', 'level', '升級', ' data-tile="' + i + '"' + (why ? ' disabled' : ''), 'up') : '') +
      (b.type === 'farm' || b.type === 'mat' || b.type === 'special' ? rb('tab', 'pop', '人手', ' data-tab="tribe"') : '') +
      (b.type === 'barracks' || b.type === 'archery' ? rb('tab', 'army', '訓練', ' data-tab="army"') : '') + (b.type === 'center' ? rb('tab', 'book', '任務', ' data-tab="quest"') : '') +
      (b.type === 'craft' ? rb('tab', 'craft', '技藝', ' data-tab="tech"') : '') + (b.type === 'heal' ? rb('tab', 'heal', '療養', ' data-tab="army"') : '') + (b.type === 'taro' ? rb('tab', 'pop', '人手', ' data-tab="tribe"') : '') +
      (b.type === 'market' ? rb('tab', 'trade', '交易', ' data-tab="trade"') : '') + (b.type === 'plaza' ? rb('tab', 'fire', '共聚', ' data-tab="quest"') : '') + (b.type === 'guest' ? rb('tab', 'alliance', '聯盟', ' data-tab="social"') : '') +
      rb('pop-more', 'book', S.popMore ? '收起' : '說明');
    return { html: '<section class="card sel">' + h + '</section>', at: { tile: i }, ring: ring };
  }
  // ---------- 視窗裡的內容（下方按鈕打開） ----------
  function costHTML(me, c, sp) {
    var t = myTribe(), s = '<span class="costs">';
    if (c.food) s += '<span class="cost' + (me.res.food < c.food ? ' lack' : '') + '">' + Art.icon('food') + c.food + '</span>';
    if (c.mat) s += '<span class="cost' + (me.res.mat < c.mat ? ' lack' : '') + '">' + Art.icon('mat') + c.mat + '</span>';
    if (sp) s += '<span class="cost' + ((me.sp[me.tribe] || 0) < sp ? ' lack' : '') + '">' + Art.icon('sp') + sp + ' ' + t.sp.zh + '</span>';
    return s + '</span>';
  }
  function affordable(me, c, sp) { return me.res.food >= c.food && me.res.mat >= c.mat && (me.sp[me.tribe] || 0) >= (sp || 0); }
  function effect(type, L, t) {
    switch (type) {
      case 'center': return '倉庫容量 ' + Math.round(300 + 200 * R.eq(L)) + '，其他建築最高可到等級 ' + L;
      case 'house': return '可以住 ' + (1 + 2 * L) + ' 位族人';
      case 'farm': return (2 * L) + ' 個耕作位置，產出' + t.res.food;
      case 'mat': return (2 * L) + ' 個採集位置，產出' + t.res.mat;
      case 'special': return (2 * L) + ' 個工作位置，產出' + t.sp.zh;
      case 'storage': return '倉庫容量 +' + Math.round(400 * R.eq(L)) + '，特產容量 +' + 20 * L;
      case 'barracks': return '可以訓練勇士（弓手在靶場練），戰士名額 ' + 6 * L + ' 人';
      case 'tower': return '有人來出征時從部落裡放箭（強度 ' + R.TUNE.towerPow * L + '）';
      case 'unique': return uniqFx(t);
      case 'hut': return '多一個工人（同時 3 項工程），建設時間 −' + L + '%';
      case 'archery': return '可以訓練弓手；弓手的攻擊 +' + 2 * L + '%';
      case 'taro': return (2 * L) + ' 個耕作位置，產出' + t.res.food;
      case 'water': return '所有田地的收成 +' + 2 * L + '%';
      case 'heal': return '可以住 ' + (6 + 4 * L) + ' 位負傷的人，每分鐘大約 ' + (Math.round((0.6 + 0.12 * L) / R.TUNE.pace * 100) / 100) + ' 位休養好歸隊';
      case 'craft': return '可以學技藝，每一項最多 ' + Math.min(R.TECH_MAX, 1 + Math.floor((L - 1) / 5)) + ' 級；學習的時間 −' + L + '%';
      case 'market': return '市集最多掛 ' + (4 + Math.floor(L / 10)) + ' 筆；到中立聚落換特產的花費 −' + L + '%';
      case 'plaza': return '共聚的時間 +' + 4 * L + '%，族人增加的速度 +' + 4 * L + '%';
      case 'guest': return '交易、送禮、結盟時族群關係變好 +' + 5 * L + '%；一次最多送 ' + (100 + 20 * L) + ' 份';
    }
    return '';
  }
  function bname(t, type) { return nat(bdef(t, type)); }
  function buildingCard(me, i, b) {
    var t = myTribe(), full = me.queue.length >= me.d.builders, h = '<section class="card sel"><h3>' + bname(t, b.type) + '<span class="lv">' + (!b.level ? '興建中' : b.type === 'unique' ? '獨特建築' : '等級 ' + b.level) + '</span></h3>';
    if (b.level) h += '<p class="eff">' + effect(b.type, b.level, t) + '</p>';
    if (b.busy) {
      var w = me.queue.filter(function (x) { return x.tile === i; })[0];
      h += '<p class="busyline">施工中，還要 <b data-until="' + (w ? w.doneAt : 0) + '"></b></p>';
    } else if (b.type === 'unique') h += '<p class="muted">' + t.zh + '才有的建築，只能蓋一座，不用升級。</p>';
    else if (b.level >= R.MAX_LEVEL) h += '<p class="muted">已經是最高等級。</p>';
    else {
      var to = b.level + 1, c = R.cost(b.type, to), sp = 0, why = '';
      var need = b.type === 'center' ? R.centerUp(to) : null, miss = b.type === 'center' ? R.reqLeft(me, to) : [], kinds = need && need.kinds ? Object.keys(me.sp).filter(function (k2) { return k2 !== me.tribe && me.sp[k2] >= need.each; }).length : 0;
      if (b.type !== 'center' && to > me.d.center) why = '要先把' + t.b.center.zh + '升到等級 ' + to;
      if (!why && miss.length) why = '還沒達成升級的條件';
      if (!why && full) why = '同時只能進行 ' + me.d.builders + ' 項工程';
      if (!why && !affordable(me, c, 0)) why = '物資還不夠';
      if (!why && need && kinds < need.kinds) why = '還缺別族的特產（目前有 ' + kinds + ' 種夠數）';
      h += '<p class="eff next">升級後：' + effect(b.type, to, t) + '</p>' +
        '<div class="act"><button class="btn" data-act="upgrade" data-tile="' + i + '"' + (why ? ' disabled' : '') + '>升到等級 ' + to + '</button>' + costHTML(me, c, 0) + '<span class="time">' + dur(R.buildTime(b.type, to)) + '</span></div>' +
        (need ? '<ul class="reqs">' + R.centerReq(to).map(function (r) { var ok = R.maxLevelOf(me, r.type) >= r.level; return '<li class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓' : '✗') + ' ' + esc(bdef(t, r.type).zh) + '升到等級 ' + r.level + '</li>'; }).join('') + '</ul>' : '') +
        (need && need.kinds ? '<p class="spneed">另外要 <b>' + need.kinds + ' 種別族的特產</b>，每種 ' + need.each + ' 份。可以從市集、中立聚落、送禮或出征取得。</p>' : '') +
        (why ? '<p class="why">' + why + '</p>' : '');
    }
    return h + '<p class="note">' + esc(bdef(t, b.type).note) + '</p></section>';
  }
  function emptyCard(me, i) {
    var t = myTribe(), full = me.queue.length >= me.d.builders, h = '<section class="card sel"><h3>開墾好的空地<span class="lv">選一種建築</span></h3><ul class="opts">';
    STAGE_TYPES.slice().sort(function (x, y) { return (R.limit(x, me.d.center, me) > 0 ? 0 : 1) - (R.limit(y, me.d.center, me) > 0 ? 0 : 1); }).forEach(function (ty) {
      var c = R.cost(ty, 1), have = R.count(me, ty), lim = R.limit(ty, me.d.center, me), why = '', un = ty === 'unique';
      if (un && me.quest < 3) why = '完成任務第 3 章就能興建'; else if (un && have >= 1) why = '只能蓋一座';
      else if (R.UNLOCK[ty] && me.d.center < R.UNLOCK[ty]) why = t.b.center.zh + ' ' + R.UNLOCK[ty] + ' 級才能蓋';
      else if (have >= lim) why = '已達上限，先升級' + t.b.center.zh; else if (full) why = '工程已滿'; else if (!affordable(me, c)) why = '物資還不夠';
      h += '<li' + (un ? ' class="uq"' : '') + '><div class="opt-top"><b>' + bname(t, ty) + '</b><span class="cnt">' + (un ? '獨特建築 ' + have + '/1' : have + '/' + lim) + '</span></div><p class="eff">' + effect(ty, 1, t) + '</p>' +
        '<div class="act"><button class="btn sm" data-act="build" data-tile="' + i + '" data-type="' + ty + '"' + (why ? ' disabled' : '') + '>興建</button>' + costHTML(me, c) + '<span class="time">' + dur(R.buildTime(ty, 1)) + '</span></div>' +
        (why ? '<p class="why">' + why + '</p>' : '') + '</li>';
    });
    return h + '</ul></section>';
  }
  function wildCard(me, i) {
    var t = myTribe(), info = R.clearInfo(me, i), w = me.queue.filter(function (x) { return x.tile === i && x.type === 'clear'; })[0];
    var h = '<section class="card sel"><h3>山林<span class="lv">還沒開墾</span></h3><p>這裡還是一片山林。拓荒之後會變成建地，清出來的木石也會成為' + t.res.mat + '。</p>';
    if (w) return h + '<p class="busyline">拓荒中，還要 <b data-until="' + w.doneAt + '"></b></p></section>';
    var why = info.ok ? '' : info.why === 'center' ? '要先把' + t.b.center.zh + '升到等級 ' + R.CLEAR[R.SITES[i].ring].center : info.why;
    return h + '<div class="act"><button class="btn" data-act="clear" data-tile="' + i + '"' + (info.ok ? '' : ' disabled') + '>拓荒</button>' + costHTML(me, { food: info.food, mat: 0 }) +
      '<span class="gain">' + Art.icon('mat') + '+' + info.gain + '</span><span class="time">' + dur(info.time) + '</span></div>' + (why ? '<p class="why">' + why + '</p>' : '') + '</section>';
  }
  function jobsCard(me) {
    var t = myTribe(), d = me.d, names = { food: t.res.food, mat: t.res.mat, special: t.sp.zh }, ic = { food: 'food', mat: 'mat', special: 'sp' };
    var used = me.jobs.food + me.jobs.mat + me.jobs.special;
    var h = '<section class="card"><h3>族人分工<label class="switch" for="auto"><input type="checkbox" id="auto" data-act="auto"' + (me.auto ? ' checked' : '') + '>自動分配</label></h3>';
    JOBS.forEach(function (k) {
      h += '<div class="job">' + Art.icon(ic[k]) + '<span class="jn">' + names[k] + '</span><div class="stepper"><button data-act="job" data-k="' + k + '" data-d="-1" aria-label="減少' + names[k] + '的人手"' + (me.jobs[k] <= 0 ? ' disabled' : '') + '>−</button>' +
        '<b>' + me.jobs[k] + '/' + d.slots[k] + '</b><button data-act="job" data-k="' + k + '" data-d="1" aria-label="增加' + names[k] + '的人手"' + (me.jobs[k] >= d.slots[k] || used >= me.pop ? ' disabled' : '') + '>＋</button></div>' +
        '<span class="rate">+' + perTime(d.rates[k]) + '</span></div>';
    });
    var neg = d.net < 0;
    return h + '<p class="eatline' + (neg ? ' neg' : '') + '">族人和戰士吃掉 ' + perTime(d.eat).replace(/^\+/, '') + '，' + t.res.food + '實際' + (neg ? '減少 ' + perTime(-d.net) : '增加 ' + perTime(d.net)) + '</p>' +
      '<p class="muted">族人 ' + me.pop + ' 位，待命 ' + (me.pop - used) + ' 位。位置不夠時，多蓋或升級對應的建築。自動分配會先排夠養活大家的人去種田。</p></section>';
  }
  function queueCard(me) {
    if (!me.queue.length) return '';
    var t = myTribe(), h = '<section class="card"><h3>進行中的工程<span class="lv">' + me.queue.length + '/' + me.d.builders + '</span></h3>';
    me.queue.forEach(function (w) { h += '<div class="qrow"><span>' + (w.type === 'clear' ? '拓荒' : esc(bdef(t, w.type).zh) + (w.type === 'unique' ? '' : ' → 等級 ' + w.to)) + '</span><b data-until="' + w.doneAt + '"></b></div>'; });
    return h + '</section>';
  }
  function devText(t, q) {   // 部落發展任務的目標寫成一句話
    var nm = q.type ? esc(bdef(t, q.type).zh) : '';
    return q.k === 'build' ? '蓋一座' + nm : q.k === 'units' ? '擁有 ' + q.n + ' 名戰士' : q.type === 'wall' && q.n === 1 ? '蓋' + nm : '把' + nm + '升到等級 ' + q.n;
  }
  /* 技藝：12 項，每項最多 5 級；技藝屋的等級決定能學到幾級；同時只能學一項 */
  function techPanel(me) {
    var L = R.bl(me, 'craft'), max = me.d.techMax, r = me.research, h = '';
    h += '<section class="card"><h3>' + Art.icon('craft') + '技藝屋<span class="lv">' + (L ? '等級 ' + L + ' · 每項最多 ' + max + ' 級' : '還沒有') + '</span></h3>' +
      (L ? '<p class="muted">學會的技藝永久有效。同時只能學一項；技藝屋在 6、11、16、21 級時，每一項能學的上限多一級。</p>' : '<p class="why">先在空地上蓋一座技藝屋（' + esc(myTribe().b.center.zh) + ' ' + R.UNLOCK.craft + ' 級才能蓋）。</p>') +
      (r ? '<p class="busyline">正在學「' + R.TECH[r.id].zh + '」' + r.to + ' 級，還要 <b data-until="' + r.doneAt + '"></b></p>' : '') + '</section>';
    Object.keys(R.TECH).forEach(function (id) {
      var tk = R.TECH[id], lv = (me.tech && me.tech[id]) || 0, to = lv + 1, c = to <= R.TECH_MAX ? R.techCost(id, to) : null;
      var why = !L ? '要先蓋技藝屋' : r ? (r.id === id ? '學習中' : ' ') : to > R.TECH_MAX ? '已經是最高級' : to > max ? '技藝屋升級之後才能學' : !affordable(me, c) ? '物資還不夠' : '';
      h += '<section class="card tech"><h3><svg class="ic" viewBox="0 0 24 24">' + Art.iconBody('craft-' + id) + '</svg>' + tk.zh + '<span class="lv">' + lv + ' / ' + R.TECH_MAX + ' 級</span></h3>' +
        '<p class="eff' + (lv ? '' : ' muted') + '">' + (lv ? '現在：' + tk.fx + lv * tk.per + '%' : '還沒學') + (to <= R.TECH_MAX ? '　<span class="eff next">' + to + ' 級：' + tk.fx + to * tk.per + '%</span>' : '') + '</p>' +
        (c ? '<div class="act"><button class="btn sm" data-act="research" data-id="' + id + '"' + (why ? ' disabled' : '') + '>學習</button>' + costHTML(me, c) + '<span class="time">' + dur(R.techTime(me, to)) + '</span></div>' : '') +
        (why && why.trim() && why !== '已經是最高級' && L ? '<p class="why">' + why + '</p>' : '') + '</section>';
    });
    return h;
  }
  function devGo(me) {
    var q = me.dq; if (!q) return;
    var best = -1, bl = -1, i;
    if (q.k === 'units') { S.tab = 'army'; render(); return; }
    if (q.type === 'wall') { S.view = 'village'; S.tab = 'army'; render(); return; }
    for (i = 0; i < R.TILE_N; i++) {
      var tl = me.tiles[i];
      if (q.k === 'build' ? me.land[i] && !tl : tl && tl.type === q.type && tl.level > bl) { best = i; bl = tl ? tl.level : 0; if (q.k === 'build') break; }
    }
    if (best < 0) { toast(q.k === 'build' ? '沒有空地了，先往外拓荒' : '還沒有這種建築，先在空地上蓋一座', true); return; }
    S.view = 'village'; S.tab = 'build'; S.selTile = best; S.popMore = false;
    var gp = Art.sitePos(best); VV.focus(gp[0], gp[1], VV.k); render();
  }
  function devCard(me) {   // 部落發展：一步一步帶著升級，完成就領獎勵
    var t = myTribe(), q = me.dq;
    if (!q) return '';
    var rw = (q.reward.food ? Art.icon('food') + q.reward.food + ' ' + t.res.food : '') + (q.reward.food && q.reward.mat ? '、' : '') + (q.reward.mat ? Art.icon('mat') + q.reward.mat + ' ' + t.res.mat : '');
    return '<section class="card dev' + (q.done ? ' ready' : '') + '"><h3>' + Art.icon('star') + '部落發展<span class="lv">第 ' + (q.i + 1) + ' 步</span></h3>' +
      '<div class="goal"><span>目標：' + devText(t, q) + '</span><b>' + q.cur + ' / ' + q.n + '</b></div><div class="bar" role="img" aria-label="進度 ' + q.cur + ' / ' + q.n + '"><i style="width:' + Math.round(100 * q.cur / q.n) + '%"></i></div>' +
      '<div class="act"><button class="btn sm' + (q.done ? '' : ' ghost') + '" data-act="dev"' + (q.done ? '' : ' disabled') + '>' + (q.done ? '領獎勵' : '還沒達成') + '</button><span class="gain">獎勵：' + rw + '</span></div></section>';
  }
  function questCard(me) {   // 任務主線：目前這一章的故事、目標與獎勵；五章都完成之後換成「共聚」
    var t = myTribe(), p = me.qp;
    if (!p) return blessCard(me);
    var q = t.quests[p.i];
    return '<section class="card quest' + (p.done ? ' ready' : '') + '"><h3>' + Art.icon('book') + esc(t.story.t) + '<span class="lv">第 ' + (p.i + 1) + ' 章 / 共 ' + R.QUESTS.length + ' 章</span></h3>' +
      '<p class="story"><b>' + esc(q.t) + '</b>' + esc(q.x) + '</p>' +
      '<div class="goal"><span>目標：' + p.text + '</span><b>' + p.cur + ' / ' + p.n + '</b></div><div class="bar" role="img" aria-label="進度 ' + p.cur + ' / ' + p.n + '"><i style="width:' + Math.round(100 * p.cur / p.n) + '%"></i></div>' +
      '<p class="eff next">獎勵：' + rewardText(t, p.i) + '</p>' +
      '<button class="btn' + (p.done ? '' : ' ghost') + '" data-act="quest"' + (p.done ? '' : ' disabled') + '>' + (p.done ? '完成這一章' : '目標還沒達成') + '</button></section>';
  }
  function blessCard(me) {
    var t = myTribe(), now = Date.now(), on = me.blessUntil > now, wait = me.blessNext > now, why = on || wait ? '' : me.res.food < R.BLESS.food ? '糧食不夠' : '';
    return '<section class="card quest"><h3>' + Art.icon('fire') + nat(t.bless) + '<span class="lv">' + (on ? '同心中' : '主線已完成') + '</span></h3>' +
      (on ? '<p class="eff next">族人同心，所有產量 +' + Math.round((R.TUNE.blessMult - 1) * 100) + '%，還有 <b data-until="' + me.blessUntil + '"></b>。</p>'
        : '<p class="eff">準備大家一起吃的飯菜，全部落聚在一起。之後 ' + dur(R.paced(R.BLESS.ms) / 1000) + '，所有產量 +' + Math.round((R.TUNE.blessMult - 1) * 100) + '%。</p>') +
      '<div class="act"><button class="btn sm" data-act="bless"' + (on || wait || why ? ' disabled' : '') + '>舉辦</button>' + costHTML(me, { food: R.BLESS.food, mat: 0 }) +
      '<span class="time">' + (wait ? '<b data-until="' + me.blessNext + '"></b> 後可以再辦' : why) + '</span></div><p class="note">' + esc(t.bless.note) + '</p></section>';
  }
  function hungryCard(me) {   // 糧食吃光了：說明影響和解決的辦法
    var t = myTribe();
    if (!me.d.hungry) return '';
    return '<section class="card alert"><h3>' + t.res.food + '吃光了</h3><p>族人吃不飽：不再增加、' + t.res.mat + '和' + t.sp.zh + '的工作變慢、不能訓練戰士。不會有人餓死或離開。</p><p class="muted">多派人種田（或打開自動分配）、多蓋田地、去野地採集糧食，或到「軍事」讓一些戰士回家。</p></section>';
  }
  function buildPanel(me) {
    var h = '', i = S.selTile;
    if (i != null) h += !me.land[i] ? wildCard(me, i) : me.tiles[i] ? buildingCard(me, i, me.tiles[i]) : emptyCard(me, i);
    else h += '<p class="hint">點建築可以升級，點有 ＋ 的空地可以蓋新建築，點外圍有斧頭記號的山林可以拓荒。畫面可以拖曳和縮放。</p>';
    return h + hungryCard(me) + devCard(me) + questCard(me) + jobsCard(me) + queueCard(me) + idleCard(me) + codeCard();
  }
  function codeCard() {   // 換裝置繼續玩：部落代碼。只有連線版有（單機試玩的進度存在這個瀏覽器裡）
    if (S.mode !== 'online') return '';
    var h = '<section class="card"><h3>換裝置繼續玩<span class="lv">部落代碼</span></h3>';
    if (!S.showCode) return h + '<p class="muted">想在另一支手機或電腦接著玩，或擔心瀏覽器的資料被清掉，先把部落代碼記下來。</p><button class="btn sm ghost" data-act="code-show">顯示我的部落代碼</button></section>';
    return h + '<p class="codebox" id="codebox">' + esc(Net.code()) + '</p><div class="act"><button class="btn sm" data-act="code-copy">複製連結</button><button class="btn sm ghost" data-act="code-hide">收起來</button></div>' +
      '<p class="muted">在另一臺裝置打開複製的連結，或在開始畫面按「我已經有部落」輸入這組代碼，就會接回這個部落。</p><p class="why">這組代碼就是部落的鑰匙，不要給別人。</p></section>';
  }
  function idleCard(me) {
    var t = myTribe(), opts = [['even', '平均'], ['food', t.res.food], ['mat', t.res.mat], ['special', t.sp.zh]];
    var h = '<section class="card"><h3>掛機設定<span class="lv">離線時照這樣進行</span></h3><p class="label">採集重點</p><div class="seg">';
    opts.forEach(function (o) { h += '<button data-act="focus" data-f="' + o[0] + '" aria-pressed="' + (me.idle.focus === o[0]) + '">' + o[1] + '</button>'; });
    h += '</div><label class="switch wide" for="idleup"><input type="checkbox" id="idleup" data-act="idleup"' + (me.idle.upgrade ? ' checked' : '') + '>離線時自動升級建築</label>' +
      '<label class="switch wide" for="idletr"><input type="checkbox" id="idletr" data-act="idletr"' + (me.idle.train ? ' checked' : '') + '>離線時自動補訓守軍</label>';
    return h + '<p class="muted">離線最多累積 8 小時，回來時會看到這段時間的報告。' + (me.auto ? '' : '採集重點要開啟上面的「自動分配」才有作用。') + '</p></section>';
  }
  function visitPanel() {
    var v = S.visit.v, t = Tribes.get(v.tribe);
    return '<section class="card sel"><h3><span class="dot" style="background:' + t.color + '"></span>' + esc(v.name) + '<span class="lv">' + (v.bot ? '示範部落' : v.online ? '在線上' : '不在線上') + '</span></h3>' +
      '<dl class="facts"><dt>族群</dt><dd>' + t.zh + '</dd><dt>主人</dt><dd>' + esc(v.owner) + '</dd><dt>' + esc(t.b.center.zh) + '</dt><dd>等級 ' + v.c + '</dd><dt>族人</dt><dd>' + v.pop + ' / ' + v.popCap + '</dd><dt>繁榮</dt><dd>' + v.pros + '</dd></dl>' +
      '<p class="muted">拜訪時只能參觀。畫面可以拖曳和縮放。</p><button class="btn big" data-act="leave">回我的部落</button></section>';
  }
  function reportModal(me) {
    var r = me.report; if (!r) return '';
    var t = myTribe(), rows = [[t.res.food, r.food, 'food'], [t.res.mat, r.mat, 'mat'], [t.sp.zh, r.sp, 'sp'], ['族人', r.pop, 'pop']].filter(function (x) { return x[1] !== 0; });
    var h = '<div class="veil"><div class="sheet" role="dialog" aria-label="離線報告"><h2>你不在的時候</h2><p class="muted">離開了 ' + ago(r.to - r.from) + (r.capped ? '，只計算最後 8 小時' : '') + '。</p><ul class="rep">';
    rows.forEach(function (x) { h += '<li>' + Art.icon(x[2]) + '<span>' + x[0] + '</span><b class="' + (x[1] < 0 ? 'neg' : '') + '">' + (x[1] > 0 ? '+' : '') + x[1] + '</b></li>'; });
    if (r.ate) h += '<li>' + Art.icon('food') + '<span>族人和戰士吃掉</span><b>' + r.ate + '</b></li>';
    if (r.land) h += '<li><span>新開墾的地</span><b>+' + r.land + '</b></li>';
    r.ups.forEach(function (u) { h += '<li><span>' + esc(bdef(t, u.type).zh) + '升級</span><b>等級 ' + u.to + '</b></li>'; });
    if (r.hungry) h += '<li><span class="neg">' + t.res.food + '吃光了，族人吃不飽，工作變慢。</span></li>';
    if (!rows.length && !r.land && !r.ups.length && !r.ate) h += '<li><span>倉庫已經滿了，沒有新的收穫。</span></li>';
    return h + '</ul><button class="btn big" data-act="ack">知道了</button></div></div>';
  }
  function tribeCard(t, cells) {
    var h = '<section class="card tribe"><h3><span class="dot" style="background:' + t.color + '"></span>' + t.zh + '<span class="chipst ' + (t.playable ? 'on' : '') + '">' + (t.playable ? '可以落腳' : '之後開放') + '</span></h3>' +
      '<p class="en">' + esc(t.en) + ' · ' + t.terrain + (cells ? ' · 地圖上 ' + cells + ' 格' : '') + '</p><p>' + t.intro + '</p><p class="muted">分布：' + t.area + '</p>';
    if (t.playable) h += '<dl class="facts"><dt>特產</dt><dd>' + t.sp.zh + '（' + t.sp.desc + '）</dd><dt>特長</dt><dd>' + t.bonus.text + '</dd><dt>獨特</dt><dd>' + esc(t.uniq.building.zh) + '、' + esc(t.uniq.unit.zh) + '（完成任務後解鎖）</dd><dt>故事</dt><dd>' + esc(t.story.t) + '</dd><dt>問候</dt><dd><i class="nat">' + esc(t.hello) + '</i>（' + t.lang + '）</dd></dl>';
    return h + '</section>';
  }
  function zonePanel() {
    if (!S.zone) return '<p class="hint">拖曳可以移動地圖，用兩指或右下角的按鈕縮放。點地圖上的任何地方，看看那裡是誰的區域。</p>';
    var z = G.byId[S.zone], h = '';
    var nd = S.node && S.nodes.filter(function (n) { return n.id === S.node; })[0];
    if (nd) h += nodeCard(nd);
    else if (z.tribe) h += tribeCard(Tribes.get(z.tribe), (G.regions[z.tribe] || []).length);
    else if (z.settlement) h += settlementCard(z);
    else h += '<section class="card"><h3>野地<span class="lv">' + ALT[z.alt] + '</span></h3><p>這裡沒有族群居住。地圖上的圓點是可以採集的資源點，數字是等級，點一下可以派人去採。</p></section>';
    var here = S.pubs.filter(function (v) { return v.hex === z.id; });
    if (here.length) {
      h += '<section class="card"><h3>這裡的部落<span class="lv">' + here.length + '/' + Geo.SLOTS + '</span></h3>';
      here.forEach(function (v) {
        var mine = S.me && v.id === S.me.id;
        h += '<div class="vrow"><div><b>' + esc(v.name) + '</b>' + (mine ? '（你）' : v.bot ? '（示範）' : v.online ? '（在線上）' : '') + '<span class="muted">等級 ' + v.c + ' · 繁榮 ' + v.pros + '</span></div>' +
          (S.me ? '<span class="vbtns">' + (mine ? '' : (S.me.ally && v.ally === S.me.ally ? '<span class="allytag">盟友</span>' : '<button class="btn sm" data-act="atk-open" data-id="' + v.id + '">出征</button>') + '<button class="btn sm ghost" data-act="gift-open" data-id="' + v.id + '">送禮</button>') +
            '<button class="btn sm ghost" data-act="' + (mine ? 'tab" data-tab="build' : 'visit" data-id="' + v.id) + '">' + (mine ? '回部落' : '拜訪') + '</button></span>' : '') + '</div>';
      });
      h += '</section>';
    }
    return h;
  }
  function aboutCard() {   // 關於這個遊戲：文化內容的來源與限制、記了哪些資料。開始畫面和圖鑑都會放
    return '<details class="about"><summary>關於這個遊戲</summary>' +
      '<p>以臺灣原住民族為主題的部落經營遊戲，背景是虛構的「南島時期」。目前開放泰雅、布農、阿美、排灣四族，其他族會陸續加入。</p>' +
      '<p>遊戲裡的族語、建築、物產與神話故事，整理自原住民族委員會、文化部、學術研究與出版品等公開資料，並標明語別或地區。<b>這些內容還沒有經過族人與專家審閱</b>，各部落的說法也不盡相同；如果有錯誤或不妥的地方，歡迎指正。</p>' +
      '<p>遊戲不呈現獵首與傷亡（戰敗一律是「負傷撤退」），神聖或有身分意義的物品不會成為戰利品，各族專屬的紋樣在取得授權前只用一般的幾何形狀；祭儀不會出現在畫面上，神靈也不是可以操控的角色。</p>' +
      '<p>我們只記下你取的名字、部落名稱與遊戲進度，不蒐集其他個人資料。為了防止灌水，伺服器會暫時記住連線的網路位置，但不會存下來。</p>' +
      (S.contact ? '<p>' + esc(S.contact) + '</p>' : '') + '</details>';
  }
  function startPanel() {
    var z = S.zone && G.byId[S.zone], t = z && z.tribe && Tribes.get(z.tribe), ok = t && t.playable;
    var h = '<div class="start"><h1>山海部落</h1><p class="lead">很久以前，島上的山與海之間住著許多族群。選一個地方，建立你的部落。</p>';
    if (S.mode === 'online') h += S.adopt
      ? '<div class="adopt"><label for="f-adopt">部落代碼<input id="f-adopt" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="貼上部落代碼，或整個連結"></label><button class="btn sm" data-act="adopt-go">接回我的部落</button><button class="btn sm ghost" data-act="adopt-close">取消</button></div>'
      : '<button class="btn ghost adoptbtn" data-act="adopt-open">玩過了？輸入部落代碼，接回原本的部落</button>';
    h +=
      '<div class="fields"><label for="f-owner">你的名字<input id="f-owner" maxlength="10" autocomplete="off" placeholder="例如：小米"></label>' +
      '<label for="f-name">部落名稱<input id="f-name" maxlength="10" autocomplete="off" placeholder="例如：晨霧部落"></label>' +
      (S.needCode ? '<label for="f-code" class="wide">邀請碼<input id="f-code" maxlength="40" autocomplete="off" autocapitalize="off" placeholder="這是封閉測試，請輸入邀請你的人給的邀請碼"></label>' : '') + '</div>' +
      '<p class="label">第一版開放的族群</p><div class="picks">';
    Tribes.playable().forEach(function (p) {
      h += '<button class="pick" data-act="pick" data-t="' + p.id + '" aria-pressed="' + (t && t.id === p.id) + '"><span class="dot" style="background:' + p.color + '"></span><b>' + p.zh + '</b><span>' + p.terrain + '</span></button>';
    });
    h += '</div>';
    if (t) h += tribeCard(t, (G.regions[t.id] || []).length);
    else if (z) h += zonePanel();
    else h += '<p class="hint">點上面的族群，或直接在地圖上點一個地方。</p>';
    h += '<button class="btn big" data-act="join"' + (ok && !S.joining ? '' : ' disabled') + '>' + (ok ? '在' + t.zh + '的區域建立部落' : '先選一個可以落腳的區域') + '</button>' + aboutCard() + '</div>';
    return h;
  }
  function codexPanel(me) {
    var t = myTribe(), h = '<section class="card"><h3><span class="dot" style="background:' + t.color + '"></span>' + t.zh + '<span class="lv">' + esc(t.en) + '</span></h3><p>' + t.intro + '</p>' +
      '<dl class="facts"><dt>問候</dt><dd><i class="nat">' + esc(t.hello) + '</i></dd><dt>謝謝</dt><dd><i class="nat">' + esc(t.thanks) + '</i></dd><dt>語別</dt><dd>' + t.lang + '</dd><dt>特長</dt><dd>' + t.bonus.text + '</dd></dl></section>';
    if (Art.hasNewArt()) h += '<section class="card"><h3>畫面風格<span class="lv">建築與圖示</span></h3>' + seg('art-style', Art.newArt() ? 'new' : 'old', [['new', '新的美術'], ['old', '原本的畫法']]) + '<p class="muted">新的美術是設計稿做成的素材；原本的畫法是程式直接畫的。兩種可以隨時切換比較。</p></section>';
    h += '<section class="card"><h3>' + Art.icon('book') + '神話故事：' + esc(t.story.t) + '<span class="lv">' + Math.min(me.quest, R.QUESTS.length) + ' / ' + R.QUESTS.length + ' 章</span></h3>';
    t.quests.forEach(function (q, i) {
      h += i <= me.quest ? '<p class="story"><b>' + (i + 1) + '. ' + esc(q.t) + '</b>' + esc(q.x) + '</p>' : '<p class="muted">' + (i + 1) + '. 完成前面的章節後就能讀到。</p>';
    });
    h += '<p class="note">' + esc(t.story.credit) + '</p></section>';
    var got = [];   // 任務拿到的東西：器物、獨特建築、獨特兵種、英雄與共聚
    if (me.quest >= 1) got.push(['器物', t.items[0], t.res.food + '產量 +' + Math.round(R.TUNE.itemBonus * 100) + '%']);
    if (me.quest >= 2) got.push(['器物', t.items[1], t.res.mat + '產量 +' + Math.round(R.TUNE.itemBonus * 100) + '%']);
    if (me.quest >= 3) got.push(['獨特建築', t.uniq.building, uniqFx(t)]);
    if (me.quest >= 4) got.push(['獨特兵種', t.uniq.unit, traitFx(t.uniq.unit.trait)]);
    if (me.quest >= 5) got.push(['傳說英雄', t.hero, '能力「' + t.hero.abilityZh + '」：' + abilityFx(t.hero.ability)], ['共聚', t.bless, '舉辦後一段時間所有產量 +' + Math.round((R.TUNE.blessMult - 1) * 100) + '%']);
    got.forEach(function (g) { h += '<section class="card"><h3>' + nat(g[1]) + '<span class="lv">' + g[0] + '</span></h3><p class="eff">' + g[2] + '</p><p class="note">' + esc(g[1].note) + '</p></section>'; });
    t.cards.forEach(function (c) { h += '<section class="card"><h3>' + esc(c.t) + '</h3><p>' + esc(c.x) + '</p></section>'; });
    h += '<p class="label">島上的 17 族</p><ul class="tlist">';
    Tribes.LIST.forEach(function (o) { h += '<li><span class="dot" style="background:' + o.color + '"></span><div><b>' + o.zh + '</b><span class="muted"> ' + o.area + '</span><p>' + o.intro + '</p></div></li>'; });
    h += '</ul>' + aboutCard();
    return h;
  }
  // ---------- 軍事 ----------
  function seg(act, cur, opts, extra) {
    return '<div class="seg n' + opts.length + '">' + opts.map(function (o) { return '<button data-act="' + act + '" data-v="' + o[0] + '"' + (extra || '') + ' aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function armyPanel(me) {
    var t = myTribe(), d = me.d, U = R.UNIT, us = t.uniq.unit, total = all3(me.units) + all3(me.away) + me.train.length, h = '';
    var mine = S.marches.filter(function (m) { return m.from === me.id; }), coming = S.marches.filter(function (m) { return m.to === me.id && m.phase === 'out'; });
    threats(me).forEach(function (m) {
      var from = S.pubs.filter(function (v) { return v.id === m.from; })[0], n = S.nodes.filter(function (x) { return x.id === m.node; })[0], my = S.marches.filter(function (x) { return x.from === me.id && x.node === m.node; })[0];
      h += '<section class="card alert"><h3>有人要來搶你採集的隊伍</h3><p>「' + esc(from ? from.name : '不明部落') + '」派出 ' + m.n + ' 人，朝你在' + (n ? R.NODE[n.k].zh + '（' + n.lv + ' 級）' : '資源點') + '採集的隊伍過來，還有 <b data-until="' + m.arriveAt + '"></b> 抵達。</p>' + (my ? '<div class="act"><button class="btn sm" data-act="recall" data-id="' + my.id + '">先叫回來（帶著已經採到的）</button></div>' : '') + '</section>';
    });
    coming.forEach(function (m) {
      var from = S.pubs.filter(function (v) { return v.id === m.from; })[0];
      h += '<section class="card alert"><h3>有隊伍正朝你而來</h3><p>「' + esc(from ? from.name : '不明部落') + '」派出 ' + m.n + ' 人，還有 <b data-until="' + m.arriveAt + '"></b> 抵達。可以趁現在補訓守軍。到了會自動打完，你不用在線上。</p></section>';
    });
    h += '<section class="card"><h3>戰士<span class="lv">' + total + ' / ' + d.armyCap + '</span></h3>';
    if (!d.armyCap) h += '<p class="why">還沒有' + t.b.barracks.zh + '。回到部落，點一塊有 ＋ 的空地蓋一座，才能訓練戰士。</p>';
    else {
      var hasU = me.quest >= 4 || me.units.u + me.away.u > 0;
      h += '<div class="units' + (hasU ? ' n5' : '') + '"><div><b>' + me.units.w + '</b><span>' + U.w.zh + '</span></div><div><b>' + me.units.a + '</b><span>' + U.a.zh + '</span></div>' + (hasU ? '<div class="uq"><b>' + me.units.u + '</b><span>' + esc(us.zh) + '</span></div>' : '') +
        '<div><b>' + all3(me.away) + '</b><span>出征中</span></div><div><b>' + me.train.length + '</b><span>訓練中</span></div></div>';
      ['w', 'a', 'u'].forEach(function (u) {
        if (u === 'u' && me.quest < 4) { h += '<p class="muted">完成任務第 4 章，可以訓練' + t.zh + '的獨特兵種「' + esc(us.zh) + '」。</p>'; return; }
        var def = u === 'u' ? R.UNIT_U : U[u], name = u === 'u' ? esc(us.zh) : U[u].zh;
        var why = d.hungry ? t.res.food + '吃光了' : u === 'a' && !R.bl(me, 'archery') ? '要先蓋靶場' : total >= d.armyCap ? '名額已滿' : !affordable(me, def.cost) ? '物資還不夠' : '';
        h += '<div class="act"><button class="btn sm' + (u === 'u' ? ' uq' : '') + '" data-act="train" data-u="' + u + '"' + (why ? ' disabled' : '') + '>訓練' + name + '</button>' + costHTML(me, def.cost) + '<span class="time">' + (why || dur(R.trainTime(u))) + '</span></div>';
      });
      if (me.train.length) h += '<p class="busyline">下一位還要 <b data-until="' + me.train[0].doneAt + '"></b>，全部完成還要 <b data-until="' + me.train[me.train.length - 1].doneAt + '"></b></p>';
      if (all3(me.units) > 0) h += '<p class="label">讓戰士回家（每位戰士每分鐘吃 ' + R.TUNE.eatUnit + ' 份' + t.res.food + '）</p><div class="tbtns row">' + ['w', 'a', 'u'].filter(function (u) { return me.units[u] > 0; }).map(function (u) { return '<button class="btn sm ghost" data-act="dismiss" data-u="' + u + '">' + (u === 'u' ? esc(us.zh) : U[u].zh) + '回家 1 位</button>'; }).join('') + '</div>';
      h += '<p class="muted">' + U.w.zh + '站在前面承受攻擊；' + U.a.zh + '攻擊力較高但較脆弱。' + (me.quest >= 4 ? nat(us) + '：' + traitFx(us.trait) + '。' : '') + '</p>';
      if (me.quest >= 4) h += '<p class="note">' + esc(us.note) + '</p>';
    }
    h += '</section>';
    if (me.quest >= R.QUESTS.length) {   // 傳說英雄：每場對戰可以用一次能力，用過要休息
      var rest = me.heroRest > Date.now();
      h += '<section class="card"><h3>' + nat(t.hero) + '<span class="lv">傳說英雄 · ' + (rest ? '休息中' : '可以出戰') + '</span></h3>' +
        '<p class="eff' + (rest ? '' : ' next') + '">能力「' + esc(t.hero.abilityZh) + '」：' + abilityFx(t.hero.ability) + '。</p>' +
        '<p class="muted">對戰時會在適合的時機自動發動，每場一次；出過力之後要休息 ' + dur(R.paced(R.HERO_REST) / 1000) + '。' + (rest ? '還要 <b data-until="' + me.heroRest + '"></b>。' : '') + '</p><p class="note">' + esc(t.hero.note) + '</p></section>';
    }
    if (mine.length) {   // 在外面的隊伍：出征、採集
      h += '<section class="card"><h3>外面的隊伍<span class="lv">' + mine.length + ' / ' + d.marchMax + '</span></h3>';
      mine.forEach(function (m) {
        var n = m.node && S.nodes.filter(function (x) { return x.id === m.node; })[0], tv = m.to && S.pubs.filter(function (v) { return v.id === m.to; })[0];
        var where = m.node ? (n ? R.NODE[n.k].zh + '（' + n.lv + ' 級）' : '資源點') : '「' + esc(tv ? tv.name : '對方') + '」';
        var what = m.phase === 'back' ? '回程中' + (m.carry ? '，帶著 ' + m.carry + ' 份' : '') : m.phase === 'gather' ? '採集中' : m.node ? '前往採集' : '出征中';
        h += '<div class="qrow"><span>' + where + ' · ' + m.n + ' 人 · ' + what + '</span><b data-until="' + m.arriveAt + '"></b>' + (m.phase === 'gather' ? '<button class="btn sm ghost" data-act="recall" data-id="' + m.id + '">叫回來</button>' : '') + '</div>';
      });
      h += '<p class="muted">同時最多 ' + d.marchMax + ' 支隊伍在外面。到地圖上點資源點（彩色圓點）可以派人去採。</p></section>';
    }
    // 防禦
    var wl = me.wall, to = wl + 1, wc = R.cost('wall', Math.min(to, R.MAX_LEVEL)), busy = me.queue.filter(function (q) { return q.type === 'wall'; })[0];
    var towers = me.tiles.filter(function (b) { return b && b.type === 'tower' && b.level > 0; }), safe = Math.max(me.shieldUntil, me.newbieUntil);
    h += '<section class="card"><h3>' + esc(t.b.wall.zh) + '<span class="lv">' + (wl ? '等級 ' + wl : '還沒有') + '</span></h3><p class="eff">' + (wl ? '守軍的戰力加 ' + Math.round((R.wallMul(wl) - 1) * 100) + '%' : '蓋了之後，每一級讓守軍的戰力加 ' + R.TUNE.wallPct + '%（5 級以後每級減半）') + '</p>';
    if (busy) h += '<p class="busyline">施工中，還要 <b data-until="' + busy.doneAt + '"></b></p>';
    else if (wl >= R.MAX_LEVEL) h += '<p class="muted">已經是最高等級。</p>';
    else {
      var ww = to > d.center ? '要先把' + t.b.center.zh + '升到等級 ' + to : me.queue.length >= me.d.builders ? '同時只能進行 ' + me.d.builders + ' 項工程' : !affordable(me, wc) ? '物資還不夠' : '';
      h += '<div class="act"><button class="btn sm" data-act="wall"' + (ww ? ' disabled' : '') + '>' + (wl ? '升到等級 ' + to : '興建') + '</button>' + costHTML(me, wc) + '<span class="time">' + dur(R.buildTime('wall', to)) + '</span></div>' + (ww ? '<p class="why">' + ww + '</p>' : '');
    }
    h += '<p class="muted">' + esc(t.b.tower.zh) + ' ' + towers.length + ' 座' + (towers.length ? '' : '（點部落裡有 ＋ 的空地興建）') + '。' + (safe > Date.now() ? '保護中，還有 <b data-until="' + safe + '"></b>；主動出征會提前結束保護。' : '') + '</p></section>';
    // 療養屋：負傷撤退的人在這裡休養，好了就歸隊
    var hurt = me.hurt ? all3(me.hurt) : 0;
    if (d.healCap || hurt) h += '<section class="card"><h3>' + Art.icon('heal') + esc(t.b.heal.zh) + '<span class="lv">' + hurt + ' / ' + d.healCap + ' 位</span></h3>' +
      (hurt ? '<p>' + U.w.zh + ' ' + me.hurt.w + '、' + U.a.zh + ' ' + me.hurt.a + (me.hurt.u ? '、' + esc(us.zh) + ' ' + me.hurt.u : '') + ' 位在休養，大約每 ' + dur(1 / Math.max(1e-9, d.healRate)) + '有一位歸隊' + (total >= d.armyCap ? '（戰士名額滿了，休養好的人先等著）' : '') + '。</p>' : '<p class="muted">沒有人在休養。對戰裡負傷撤退的人，療養屋有空位就會來這裡，休養好再回到隊伍。</p>') + '</section>';
    else h += '<section class="card"><p class="muted">蓋一座療養屋（' + esc(t.b.center.zh) + ' ' + R.UNLOCK.heal + ' 級），對戰裡負傷撤退的人就能休養後歸隊，不會就這樣離開隊伍。</p></section>';
    // 守備戰力：別人出征前看到的就是這個數字
    var myPow = me.d ? R.power({ tribe: me.tribe, w: me.units.w, a: me.units.a, u: me.units.u, def: true, wall: me.wall, towers: towers.map(function (b) { return b.level; }), uniq: me.d.uniq, mod: R.battleMod(me, true) }) : 0;
    h += '<section class="card"><h3>守備戰力<span class="lv">' + myPow + '</span></h3><p class="muted">留在部落的戰士，加上' + esc(t.b.wall.zh) + '和' + esc(t.b.tower.zh) + '。別人出征前會拿他的戰力和這個數字比，估出勝算。防守不用設定，也不用在線上，來了會自動打完。</p></section>';
    return h;
  }
  function reportsCard(me) {   // 戰報：出征、防守、採集、有人來搶
    var h = '<section class="card"><h3>戰報<span class="lv">戰功 ' + me.glory + '</span></h3>';
    if (!me.reports.length) h += '<p class="muted">還沒有交戰紀錄。打開大地圖，點別人的部落就可以出征。</p>';
    else h += '<p class="muted">點一筆可以重看那一場。</p>';
    me.reports.forEach(function (r) {
      h += '<button class="rrow" data-act="rep-open" data-id="' + r.id + '"><span class="tag ' + (r.win ? 'win' : 'lose') + '">' + (r.win ? '勝' : '敗') + '</span><span>' + (r.point ? r.point + (r.other ? '・' + esc(r.other) : '') : (r.role === 'atk' ? '出征' : '防守') + '「' + esc(r.other) + '」') + (r.seen ? '' : '<i class="new" aria-label="新的"></i>') + '</span><b>' + gradeText(r) + '</b></button>';
    });
    return h + '</section>';
  }
  function attackModal(me) {
    var A = S.attack;
    if (A.node) return gatherModal(me, A);
    var v = S.pubs.filter(function (x) { return x.id === A.id; })[0];
    if (!v) { S.attack = null; return ''; }
    var t = Tribes.get(v.tribe), safe = v.safe > Date.now(), d = Geo.travel(G.byId[me.hex], G.byId[v.hex]), secs = R.marchSecs(d, v.uq === 'watch') * R.marchMul(me);
    var why = safe ? '對方正受到保護' : S.marches.filter(function (m) { return m.from === me.id; }).length >= me.d.marchMax ? '同時最多 ' + me.d.marchMax + ' 支隊伍在外面' : all3(A) < 1 ? '至少要派出一個人' : (!v.bot && me.d.center - v.c > 1) ? '對方規模比你小太多，不能出征' : '';
    function step(u, label, have) {
      return '<div class="job"><span class="jn">' + label + '</span><div class="stepper"><button data-act="atk-n" data-u="' + u + '" data-d="-1"' + (A[u] <= 0 ? ' disabled' : '') + ' aria-label="少派一位' + label + '">−</button><b>' + A[u] + '/' + have + '</b>' +
        '<button data-act="atk-n" data-u="' + u + '" data-d="1"' + (A[u] >= have ? ' disabled' : '') + ' aria-label="多派一位' + label + '">＋</button></div><button class="btn sm ghost" data-act="atk-all" data-u="' + u + '">全部</button></div>';
    }
    return '<div class="veil"><div class="sheet wide" role="dialog" aria-label="出征設定"><h2>出征「' + esc(v.name) + '」</h2><p class="muted">' + t.zh + ' · ' + esc(t.b.center.zh) + '等級 ' + v.c + ' · 路程約 ' + dur(secs) + '</p>' +
      '<p class="scout">偵察：' + esc(t.b.wall.zh) + (v.wall ? '等級 ' + v.wall : '沒有') + ' · ' + esc(t.b.tower.zh) + ' ' + v.towers + ' 座 · 守軍' + GUARD[v.guard] + (v.uq === 'watch' ? ' · 有' + esc(t.uniq.building.zh) + '，路程較久' : '') + '</p>' +
      '<p class="label">派多少人</p>' + step('w', R.UNIT.w.zh, me.units.w) + step('a', R.UNIT.a.zh, me.units.a) + (me.units.u ? step('u', esc(myTribe().uniq.unit.zh), me.units.u) : '') +
      '<div class="gostat"><span>我方戰力 ' + R.power({ tribe: me.tribe, w: A.w, a: A.a, u: A.u, mod: R.battleMod(me, false) }) + ' · 對方守備戰力 ' + (v.pw || 0) + '</span>' + oddsHTML(R.power({ tribe: me.tribe, w: A.w, a: A.a, u: A.u, mod: R.battleMod(me, false) }), v.pw || 0) + '</div>' +
      '<p class="muted">到了會自動打完，不用下指令。贏得越漂亮，帶回的物資越多；每位回程的人可以背 30 份。主動出征會結束自己的保護時間。</p>' +
      (why ? '<p class="why">' + why + '</p>' : '') +
      '<div class="act two"><button class="btn ghost" data-act="atk-cancel">取消</button><button class="btn" data-act="atk-go"' + (why ? ' disabled' : '') + '>' + (A.w === me.units.w && A.a === me.units.a && A.u === me.units.u ? '全軍出征' : '出發') + '</button></div></div></div>';
  }
  function lootText(loot2) { var a = []; for (var k in loot2 || {}) a.push(R.resName(k) + ' ' + loot2[k]); return a.join('、'); }
  function resultBlock(r) {   // 戰報的結果：誰贏、帶走什麼、雙方各有幾人負傷撤退、英雄有沒有出力
    var win = r.win, loot = lootText(r.loot), pt = r.point, mt = myTribe(), ot = Tribes.get(r.otherTribe), title;
    if (pt) title = r.role === 'atk' ? (win ? '搶下了' + pt : '沒能搶下' + pt) : (win ? '擋下了來搶的人' : '採集的隊伍被搶了');
    else title = r.role === 'atk' ? (win ? R.GRADE[r.grade] : '沒能攻下') : (win ? '守住了部落' : '部落被攻下');
    var mine = r.role === 'atk' ? 'ha' : 'hd', theirs = r.role === 'atk' ? 'hd' : 'ha', heroes = '';
    (r.log || []).forEach(function (p) {
      if (p[mine]) heroes += '我方的英雄發動「' + esc(mt.hero.abilityZh) + '」。';
      if (p[theirs] && ot && ot.hero) heroes += '對方的英雄發動「' + esc(ot.hero.abilityZh) + '」。';
    });
    var txt = pt ? (r.note ? esc(r.note) + ' ' : '') : r.role === 'atk' ? (win ? (loot ? '帶回 ' + esc(loot) + '。' : '對方沒有可以帶走的物資。') : '隊伍撤退了。') : (win ? '' : (loot ? '被帶走 ' + esc(loot) + '。' : '物資都保住了。') + '接下來一段時間受到保護。');
    return '<div class="bres ' + (win ? 'win' : 'lose') + '"><h3>' + title + '</h3><p>' + txt + '我方 ' + (r.lost || 0) + ' 人負傷撤退' + (r.care ? '（' + r.care + ' 人到療養屋休養）' : '') + '，對方 ' + (r.hurt || 0) + ' 人。' + heroes + '</p></div>';
  }
  /* 有新的對戰結果（剛打完、還沒看過）就自動播放；離開太久才回來的，留在戰報裡自己點 */
  function autoShow(me) {
    if (!me || S.show) return;
    var r = (me.reports || []).filter(function (x) { return x.show && !x.seen && !S.autoShown[x.id] && Date.now() - x.t < 1800000; })[0];
    if (!r) return;
    S.autoShown[r.id] = 1; S.show = { id: r.id, n: 0 }; S.attack = null;
  }
  function showReport(me) { return S.show && me.reports.filter(function (x) { return x.id === S.show.id && x.show; })[0]; }
  function showModal(me) {
    var r = showReport(me);
    if (!r) { S.show = null; return ''; }
    var sh = r.show, ta = Tribes.get(sh.aTribe), td = Tribes.get(sh.dTribe), atk = r.role === 'atk';
    var info = ta.zh + '「' + esc(sh.aName) + '」' + (atk ? '（你）' : '') + '進攻' + (sh.point ? '「' + esc(sh.dName || '') + '」正在採集的' + esc(sh.point) : td.zh + '「' + esc(sh.dName) + '」' + (atk ? '' : '（你）') + '，' + esc(td.b.wall.zh) + ' ' + sh.wall + ' 級、' + esc(td.b.tower.zh) + ' ' + sh.towerN + ' 座');
    return '<div class="veil"><div class="sheet battle show" role="dialog" aria-label="對戰：' + info.replace(/<[^>]*>/g, '') + '">' +
      '<svg class="bscene" id="bshow" data-n="' + S.show.n + '" viewBox="0 0 ' + Art.BW + ' ' + Art.BH + '" role="img" aria-label="' + esc(sh.aName) + '和' + esc(sh.dName || sh.point) + '在山林裡交戰"></svg>' +
      '<div class="bfoot" id="bfoot"><div class="bplay"><span>' + info + '</span><button class="btn sm ghost" data-act="show-skip">略過</button></div></div></div></div>';
  }
  function showDone(me) {   // 演完了：換成結果和按鈕
    var r = showReport(me), foot = document.getElementById('bfoot'); if (!r || !foot) return;
    foot.innerHTML = '<div class="bdone">' + resultBlock(r) + '<div class="bbtns"><button class="btn ghost" data-act="show-again">重看</button><button class="btn" data-act="show-close">關閉</button></div></div>';
    if (!r.seen) Net.act({ type: 'seen', id: r.id });
  }
  function startShow() {   // 對戰畫面放進來之後才開始演
    var svg = document.getElementById('bshow'), me = S.me, r = me && showReport(me);
    if (!svg || !r) return;
    Art.need([r.show.aTribe, r.show.dTribe], function () {   // 雙方族群的人物與戰場都載好了才開始演
      if (svg.isConnected) S.showCtl = Art.battleShow(svg, r, { onDone: function () { showDone(S.me); } });
    });
  }
  function battleReport(me) {   // 沒有演出可以看的戰報：折返、改版前的舊戰報
    var r = me.reports.filter(function (x) { return x.id === S.report; })[0];
    if (!r) { S.report = null; return ''; }
    var body = r.note ? '<p>' + esc(r.note) + '</p>' : r.grade != null ? resultBlock(r) : '<p>' + (r.win ? '勝' : '敗') + '：攻破 ' + (r.broken || 0) + ' 路（改版前的戰報）。</p>';
    return '<div class="veil"><div class="sheet battle" role="dialog" aria-label="戰報"><h2>' + (r.point ? esc(r.point) : (r.role === 'atk' ? '出征' : '防守') + '「' + esc(r.other) + '」') + '</h2>' + body + '<button class="btn big" data-act="rep-close">關閉</button></div></div>';
  }
  function armyClick(a, b, me) {
    var A = S.attack;
    if (a === 'train') act({ type: 'train', u: b.getAttribute('data-u') });
    else if (a === 'wall') act({ type: 'wall' }, '開始施工');
    else if (a === 'dismiss') act({ type: 'dismiss', u: b.getAttribute('data-u'), n: 1 });
    else if (a === 'atk-open') { S.attack = { id: b.getAttribute('data-id'), w: me.units.w, a: me.units.a, u: me.units.u }; render(); }
    else if (a === 'atk-cancel') { S.attack = null; render(); }
    else if (a === 'atk-n') { var u = b.getAttribute('data-u'); A[u] = Math.max(0, Math.min(me.units[u], A[u] + +b.getAttribute('data-d'))); render(); }
    else if (a === 'atk-all') { var u2 = b.getAttribute('data-u'); A[u2] = me.units[u2]; render(); }
    else if (a === 'atk-go' && A.node) Net.act({ type: 'gather', node: A.node, w: Math.min(A.w, me.units.w), a: Math.min(A.a, me.units.a), u: Math.min(A.u, me.units.u) }, function (r) { if (!r.ok) return toast(r.msg, true); S.attack = null; toast('隊伍出發了'); render(); });
    else if (a === 'atk-go') Net.act({ type: 'attack', to: A.id, w: Math.min(A.w, me.units.w), a: Math.min(A.a, me.units.a), u: Math.min(A.u, me.units.u) }, function (r) { if (!r.ok) return toast(r.msg, true); S.attack = null; S.tab = 'army'; toast('隊伍出發了'); render(); });
    else if (a === 'show-skip') { if (S.showCtl) S.showCtl.finish(); }
    else if (a === 'show-again') { S.show.n++; render(); }
    else if (a === 'show-close') { S.show = null; S.showCtl = null; render(); }
    else if (a === 'rep-open') { var rid = b.getAttribute('data-id'), rr = me.reports.filter(function (x) { return x.id === rid; })[0]; if (rr && rr.show) S.show = { id: rid, n: 0 }; else S.report = rid; render(); }
    else if (a === 'rep-close') { S.report = null; render(); }
    else return false;
    return true;
  }
  function testPanel(me) {
    var T = Net.testing(), cap = me.d.armyCap, room = cap - (all3(me.units) + all3(me.away) + me.train.length);
    return '<section class="card"><h3>測試工具<span class="lv">只有單機試玩有</span></h3><p class="muted">方便快速試玩用。連線版沒有這些功能，所有人都照正常規則。</p>' +
      '<label class="switch wide" for="t-rich"><input type="checkbox" id="t-rich" data-act="t-rich"' + (T.rich ? ' checked' : '') + '>無限資源（糧食、建材、特產隨時補滿）</label>' +
      '<p class="label">遊戲節奏</p>' + seg('t-pace', R.TUNE.pace >= 20 ? 'formal' : R.TUNE.pace <= 1 ? 'fast' : '', [['fast', '快速試玩'], ['formal', '正式節奏']]) +
      '<p class="muted">正式節奏是連線版的預設：產量是快速的二十分之一，建設、訓練、路程、保護的時間是二十倍。</p>' +
      '<div class="tbtns"><button class="btn sm" data-act="t-finish"' + (me.queue.length + me.train.length ? '' : ' disabled') + '>工程和訓練立刻完成</button>' +
      '<button class="btn sm" data-act="t-army"' + (room > 0 ? '' : ' disabled') + '>戰士補滿' + (cap ? '' : '（要先有訓練場）') + '</button>' +
      '<button class="btn sm" data-act="t-march"' + (S.marches.some(function (m) { return m.from === me.id; }) ? '' : ' disabled') + '>出征的隊伍立刻抵達</button>' +
      '<button class="btn sm" data-act="t-bots">讓示範部落有守軍和物資（各加 6 人）</button>' +
      '<button class="btn sm" data-act="t-quest"' + (me.qp ? '' : ' disabled') + '>' + (me.qp ? '任務第 ' + (me.qp.i + 1) + ' 章直接完成' : '任務都完成了') + '</button>' +
      '<button class="btn sm" data-act="t-rest"' + (me.heroRest > Date.now() || me.blessNext > Date.now() ? '' : ' disabled') + '>英雄和共聚不用等</button></div></section>' +
      '<section class="card"><h3>重新開始</h3><p class="muted">清除單機存檔，回到選區域的畫面。</p><button class="btn ghost" data-act="reset">' + (Date.now() < S.resetAt ? '再按一次，確定重新開始' : '重新開始') + '</button></section>';
  }
  // ---------- 交流：聯盟、市集、族群關係、資源點、中立聚落、送禮 ----------
  function spList(me) {   // 手上所有的特產
    var a = []; Tribes.playable().forEach(function (t) { var n = n0(me.sp[t.id]); if (n > 0 || t.id === me.tribe) a.push('<span class="spi"><i class="dot" style="background:' + t.color + '"></i>' + t.sp.zh + ' ' + n + '</span>'); });
    return a.join('');
  }
  function resOptions(me, cur, mineOnly) {
    var keys = ['food', 'mat'].concat(Tribes.playable().map(function (t) { return 'sp:' + t.id; }));
    return keys.filter(function (k) { return !mineOnly || k === 'food' || k === 'mat' || n0(me.sp[k.slice(3)]) > 0; })
      .map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + R.resName(k) + '</option>'; }).join('');
  }
  function have(me, k) { return n0(k === 'food' || k === 'mat' ? me.res[k] : me.sp[k.slice(3)]); }
  function socialPanel(me, part) {   // part：social 聯盟、族群關係、消息；trade 市集
    var t = myTribe(), h = '', al = me.ally && S.alliances[me.ally], REL = R.REL, out = '';
    // 聯盟
    h += '<section class="card"><h3>聯盟<span class="lv">' + (al ? al.n + ' 個部落' : '還沒加入') + '</span></h3>';
    if (al) {
      h += '<p>你在「<b>' + esc(al.name) + '</b>」。同盟之間不能互相出征。</p>';
      S.pubs.filter(function (v) { return v.ally === me.ally; }).forEach(function (v) { var vt = Tribes.get(v.tribe); h += '<div class="qrow"><span><i class="dot" style="background:' + vt.color + '"></i> ' + esc(v.name) + (v.id === me.id ? '（你）' : '') + '</span><b>' + vt.zh + '</b></div>'; });
      h += '<button class="btn sm ghost" data-act="ally-leave">退出聯盟</button>';
    } else {
      h += '<p class="muted">加入聯盟後，同盟不能互相出征。和不同族的部落結盟，兩族的關係會變好。</p><div class="inrow"><input id="f-ally" maxlength="8" autocomplete="off" placeholder="聯盟名稱（2 到 8 個字）" aria-label="聯盟名稱"><button class="btn sm" data-act="ally-create">發起</button></div>';
      Object.keys(S.alliances).forEach(function (k) { var x = S.alliances[k]; h += '<div class="vrow"><div><b>' + esc(x.name) + '</b><span class="muted">' + x.n + ' 個部落</span></div><button class="btn sm ghost" data-act="ally-join" data-id="' + k + '">加入</button></div>'; });
    }
    h += '</section>';
    if (part === 'social') out = h; h = '';
    // 市集
    h += '<section class="card"><h3>市集<span class="lv">' + S.market.length + ' 筆</span></h3><div class="splist">' + spList(me) + '</div>';
    if (!S.market.length) h += '<p class="muted">目前沒有人掛單。可以自己掛一筆，或到地圖上的中立聚落換特產。</p>';
    S.market.forEach(function (o) {
      var mine = o.from === me.id, seller = S.pubs.filter(function (v) { return v.id === o.from; })[0], st = seller && !mine ? (S.rel.filter(function (r) { return r.tribe === seller.tribe; })[0] || {}).state : '';
      var why = mine ? '' : st === 'hostile' ? '兩族關係緊張' : have(me, o.want) < o.wantN ? R.resName(o.want) + '不夠' : '';
      h += '<div class="offer"><div><b>' + o.giveN + ' ' + R.resName(o.give) + '</b> 換你的 <b>' + o.wantN + ' ' + R.resName(o.want) + '</b><span class="muted">' + esc(o.fromName) + (mine ? '（你掛的）' : st === 'friend' ? ' · 友好，雙方多拿一成' : '') + (why ? ' · ' + why : '') + '</span></div>' +
        (mine ? '<button class="btn sm ghost" data-act="offer-cancel" data-id="' + o.id + '">取消</button>' : '<button class="btn sm" data-act="offer-accept" data-id="' + o.id + '"' + (why ? ' disabled' : '') + '>交換</button>') + '</div>';
    });
    h += '<p class="label">掛一筆交易</p><div class="oform"><span>我出</span><input id="o-giveN" type="number" min="1" max="500" inputmode="numeric" aria-label="我出的數量"><select id="o-give" aria-label="我出的物資">' + resOptions(me, S.form.give, true) + '</select>' +
      '<span>想換</span><input id="o-wantN" type="number" min="1" max="500" inputmode="numeric" aria-label="想換的數量"><select id="o-want" aria-label="想換的物資">' + resOptions(me, S.form.want) + '</select></div>' +
      '<button class="btn sm" data-act="offer-post">掛到市集</button><p class="muted">掛單時先扣下你出的物資，' + dur(R.paced(R.OFFER_MS) / 1000) + '沒人換就退回來。最多同時掛 ' + me.d.offerMax + ' 筆（交易亭可以多掛）。</p></section>';
    if (part === 'trade') return h + '<section class="card"><p class="muted">也可以到大地圖上的中立聚落（白色菱形）用特產或物資換別族的特產。</p></section>';
    h = out;
    // 族群關係
    h += '<section class="card"><h3>族群關係<span class="lv">' + t.zh + '與各族</span></h3>';
    S.rel.forEach(function (r) {
      var o = Tribes.get(r.tribe), pct = 50 + r.value / 2, label = r.state === 'friend' ? '友好' : r.state === 'hostile' ? '敵對' : '中立';
      h += '<div class="relrow"><span><i class="dot" style="background:' + o.color + '"></i> ' + o.zh + '</span><div class="relbar" role="img" aria-label="關係值 ' + r.value + '"><i style="left:' + pct.toFixed(1) + '%"></i></div><b class="' + r.state + '">' + label + '</b></div>';
    });
    h += '<p class="muted">交易、送禮、結盟會讓兩族的關係變好；出征和搶資源點會變差；放著會慢慢回到中立。友好時在市集交換雙方多拿一成；敵對時不能在市集直接交換，但出征對方的戰功多五成。這是所有玩家一起累積的。</p>' +
      (me.pb > 0 ? '<p class="eff next">' + t.zh + '的玩家比較少，產量加 ' + Math.round(me.pb * 100) + '%。</p>' : '') + '</section>';
    // 最近的消息
    h += '<section class="card"><h3>最近的消息</h3>';
    if (!S.feed.length) h += '<p class="muted">還沒有消息。</p>';
    S.feed.slice(-8).reverse().forEach(function (f) { h += '<p class="feed">' + esc(f.text) + '</p>'; });
    return h + '</section>';
  }
  function restoreSocial() {
    [['f-ally', 'ally'], ['o-giveN', 'giveN'], ['o-wantN', 'wantN']].forEach(function (p) { var x = document.getElementById(p[0]); if (x) x.value = S.form[p[1]]; });
  }
  var NODE_IC = { fish: 'fish', hunt: 'craft-hunt', forage: 'craft-gather', wood: 'material', bamboo: 'bamboo', stone: 'stone' };   // 地圖放大時資源點的圖示
  var NODE_COL = { fish: '#3E96BC', hunt: '#B5703A', forage: '#8CC152', wood: '#3F6B3A', bamboo: '#B6C95A', stone: '#9AA0A6' };
  var NODE_TXT = { fish: '海岸邊的漁場，可以捕魚', hunt: '山林裡的獵場', forage: '平地上可以採野菜', wood: '山上的森林，可以伐木', bamboo: '丘陵上的竹林，可以砍竹子', stone: '產板岩的山區，可以採石板' };
  var ALT = { mt: '山區', hill: '丘陵', low: '平地' };
  function nodeLeft(n) { var g = n.g; return g ? Math.max(0, n.amt - Math.min(n.amt, g.room, g.rate * Math.max(0, Date.now() - g.start) / 1000)) : n.amt; }   // 現在還剩多少
  function nodeCard(n) {   // 點選的資源點：存量、誰在採、派人採集或去搶
    var me = S.me, info = R.NODE[n.k], t = me && myTribe(), resZh = t ? (info.res === 'food' ? t.res.food : t.res.mat) : info.res === 'food' ? '糧食' : '建材';
    var h = '<section class="card sel"><h3><i class="dot" style="background:' + NODE_COL[n.k] + '"></i>' + info.zh + '<span class="lv">' + n.lv + ' 級</span><span class="chipst' + (n.g ? '' : ' on') + '">' + (n.g ? '有人在採' : '沒有人') + '</span></h3>' +
      '<p>' + NODE_TXT[n.k] + '。還剩 <b>' + Math.floor(nodeLeft(n)) + '</b> / ' + n.max + ' ' + resZh + '，採完就會消失，別的地方會再長出新的。</p>';
    if (!me) return h + '</section>';
    var myM = S.marches.filter(function (m) { return m.from === me.id && m.node === n.id; })[0], out = S.marches.filter(function (m) { return m.from === me.id; }).length;
    var secs = R.marchSecs(Geo.travel(G.byId[me.hex], G.byId[n.hex])) * R.marchMul(me);
    if (myM) {
      h += '<p class="eff next">你的隊伍（' + myM.n + ' 人）' + (myM.phase === 'out' ? '在路上，還有 <b data-until="' + myM.arriveAt + '"></b> 抵達' : myM.phase === 'gather' ? '正在採集，還要 <b data-until="' + myM.arriveAt + '"></b> 採完' : '回程中') + '。</p>';
      if (myM.phase === 'gather') h += '<div class="act"><button class="btn sm ghost" data-act="recall" data-id="' + myM.id + '">叫回來（帶著已經採到的）</button></div>';
      return h + '</section>';
    }
    var ally = n.g && me.ally && S.pubs.some(function (v) { return v.id === n.g.v && v.ally === me.ally; });
    if (n.g) h += '<p><i class="dot" style="background:' + Tribes.get(n.g.tribe).color + '"></i> 「' + esc(n.g.name) + '」正在這裡採集，' + n.g.n + ' 人（戰力 ' + n.g.pw + '）。' + (ally ? '是盟友。' : '可以派人去搶，搶贏了拿走他們採到的，接著採。') + '</p>';
    var why = ally ? '盟友正在這裡採集' : out >= me.d.marchMax ? '同時最多 ' + me.d.marchMax + ' 支隊伍在外面' : all3(me.units) < 1 ? '部落裡沒有戰士可以派' : '';
    h += '<div class="act"><button class="btn sm" data-act="nd-open" data-id="' + n.id + '"' + (why ? ' disabled' : '') + '>' + (n.g ? '派人去搶' : '派人採集') + '</button><span class="time">路程約 ' + dur(secs) + '</span></div>' + (why ? '<p class="why">' + why + '</p>' : '');
    return h + '<p class="muted">每位戰士背得動 ' + R.TUNE.gatherLoad + ' 份，人越多採越快。採滿或採完會自己回來；採集中可能被別人搶，有人來搶時你會收到通知。</p></section>';
  }
  function gatherModal(me, A) {   // 派人採集（或去搶）：選人數，看背得動多少、要採多久
    var n = S.nodes.filter(function (x) { return x.id === A.node; })[0];
    if (!n) { S.attack = null; return ''; }
    var info = R.NODE[n.k], t = myTribe(), resZh = info.res === 'food' ? t.res.food : t.res.mat, cnt = all3(A), load = cnt * R.TUNE.gatherLoad, left = nodeLeft(n);
    var rate = R.gatherRate(me, cnt), take = Math.min(load, left), secs = R.marchSecs(Geo.travel(G.byId[me.hex], G.byId[n.hex])) * R.marchMul(me);
    var mine = R.power({ tribe: me.tribe, w: A.w, a: A.a, u: A.u, mod: R.battleMod(me, false) }), why = cnt < 1 ? '至少要派出一個人' : '';
    function step(u, label, have) {
      return '<div class="job"><span class="jn">' + label + '</span><div class="stepper"><button data-act="atk-n" data-u="' + u + '" data-d="-1"' + (A[u] <= 0 ? ' disabled' : '') + ' aria-label="少派一位' + label + '">−</button><b>' + A[u] + '/' + have + '</b>' +
        '<button data-act="atk-n" data-u="' + u + '" data-d="1"' + (A[u] >= have ? ' disabled' : '') + ' aria-label="多派一位' + label + '">＋</button></div><button class="btn sm ghost" data-act="atk-all" data-u="' + u + '">全部</button></div>';
    }
    return '<div class="veil"><div class="sheet wide" role="dialog" aria-label="派人到資源點"><h2>' + (n.g ? '去搶' : '採集') + '：' + info.zh + '（' + n.lv + ' 級）</h2><p class="muted">路程約 ' + dur(secs) + '，還剩 ' + Math.floor(left) + ' ' + resZh + '。</p>' +
      '<p class="label">派多少人</p>' + step('w', R.UNIT.w.zh, me.units.w) + step('a', R.UNIT.a.zh, me.units.a) + (me.units.u ? step('u', esc(t.uniq.unit.zh), me.units.u) : '') +
      (n.g ? '<div class="gostat"><span>我方戰力 ' + mine + ' · 「' + esc(n.g.name) + '」採集的隊伍 ' + n.g.pw + '</span>' + oddsHTML(mine, n.g.pw) + '</div>' : '') +
      '<div class="gostat"><span>背得動 ' + load + ' 份，這趟大約採 ' + Math.floor(take) + ' ' + resZh + (cnt ? '，要採 ' + dur(take / Math.max(1e-9, rate)) : '') + '</span></div>' +
      (why ? '<p class="why">' + why + '</p>' : '') +
      '<div class="act two"><button class="btn ghost" data-act="atk-cancel">取消</button><button class="btn" data-act="atk-go"' + (why ? ' disabled' : '') + '>出發</button></div></div></div>';
  }
  /* 有人朝自己正在採集的資源點出發：跳出提醒（每一支來搶的隊伍提醒一次） */
  function threats(me) {
    if (!me) return [];
    var mine = S.marches.filter(function (m) { return m.from === me.id && m.phase === 'gather'; }).map(function (m) { return m.node; });
    return S.marches.filter(function (m) { return m.kind === 'gather' && m.phase === 'out' && m.from !== me.id && mine.indexOf(m.node) >= 0; });
  }
  function raidAlert(me) {
    threats(me).forEach(function (m) {
      if (S.alerted[m.id]) return;
      S.alerted[m.id] = 1;
      var from = S.pubs.filter(function (v) { return v.id === m.from; })[0], n = S.nodes.filter(function (x) { return x.id === m.node; })[0];
      toast('「' + (from ? from.name : '有人') + '」派人要來搶你在' + (n ? R.NODE[n.k].zh : '資源點') + '採集的隊伍！', true);
    });
  }
  function settlementCard(z) {
    var me = S.me, st = G.settlements.filter(function (s) { return s.id === z.settlement; })[0], stock = S.stock[st.id] || {}, SE0 = R.SETTLE, bm = me && me.d ? me.d.barterMul : 1, SE = { give: Math.max(1, Math.round(SE0.give * bm)), get: SE0.get, resCost: Math.max(1, Math.round(SE0.resCost * bm)), stock: SE0.stock };
    var h = '<section class="card"><h3>' + st.name + '<span class="chipst">中立</span></h3><p>平原上的中立聚落，可以在這裡換到別族的特產。這裡不能落腳，也不會有衝突。</p>';
    if (!me) return h + '</section>';
    var t = myTribe(), own = n0(me.sp[me.tribe]);
    Tribes.playable().forEach(function (o) {
      if (o.id === me.tribe) return;
      var left = stock[o.id] == null ? SE.stock : stock[o.id];
      h += '<div class="barter"><div><b><i class="dot" style="background:' + o.color + '"></i> ' + o.sp.zh + '</b><span class="muted">' + o.zh + ' · 存量 ' + left + ' · 你有 ' + n0(me.sp[o.id]) + '</span></div><div class="bbtns">' +
        '<button class="btn sm" data-act="barter" data-at="' + st.id + '" data-want="' + o.id + '" data-pay="sp"' + (own < SE.give || left < SE.get ? ' disabled' : '') + '>' + SE.give + ' ' + t.sp.zh + ' 換 ' + SE.get + '</button>' +
        '<button class="btn sm ghost" data-act="barter" data-at="' + st.id + '" data-want="' + o.id + '" data-pay="food"' + (me.res.food < SE.resCost || left < 1 ? ' disabled' : '') + '>' + SE.resCost + ' 糧食 換 1</button>' +
        '<button class="btn sm ghost" data-act="barter" data-at="' + st.id + '" data-want="' + o.id + '" data-pay="mat"' + (me.res.mat < SE.resCost || left < 1 ? ' disabled' : '') + '>' + SE.resCost + ' 建材 換 1</button></div></div>';
    });
    return h + '<p class="muted">你有 ' + own + ' 份' + t.sp.zh + '。聚落的存量換完會慢慢補回來。跟玩家在市集交換通常比較划算。</p></section>';
  }
  function giftModal(me) {
    var g = S.gift, v = S.pubs.filter(function (x) { return x.id === g.id; })[0];
    if (!v) { S.gift = null; return ''; }
    var max = Math.min(me.d.giftMax, have(me, g.key)); g.n = Math.max(0, Math.min(max, g.n));
    return '<div class="veil"><div class="sheet wide" role="dialog" aria-label="送禮"><h2>送禮給「' + esc(v.name) + '」</h2><p class="muted">一次最多送 ' + me.d.giftMax + ' 份。送給別族的部落，兩族的關係會變好。</p>' +
      '<p class="label">送什麼</p><select id="g-key" aria-label="要送的物資">' + resOptions(me, g.key, true) + '</select>' +
      '<div class="job"><span class="jn">數量（你有 ' + have(me, g.key) + '）</span><div class="stepper"><button data-act="gift-n" data-d="-10"' + (g.n <= 0 ? ' disabled' : '') + ' aria-label="少送 10 份">−</button><b>' + g.n + '</b><button data-act="gift-n" data-d="10"' + (g.n >= max ? ' disabled' : '') + ' aria-label="多送 10 份">＋</button></div></div>' +
      '<div class="act two"><button class="btn ghost" data-act="gift-cancel">取消</button><button class="btn" data-act="gift-go"' + (g.n < 1 ? ' disabled' : '') + '>送出</button></div></div></div>';
  }
  function socialClick(a, b, me) {
    var id = b.getAttribute('data-id');
    if (a === 'ally-create') Net.act({ type: 'allyCreate', name: S.form.ally }, function (r) { toast(r.msg, !r.ok); if (r.ok) S.form.ally = ''; render(); });
    else if (a === 'ally-join') act({ type: 'allyJoin', id: id });
    else if (a === 'ally-leave') act({ type: 'allyLeave' });
    else if (a === 'offer-post') Net.act({ type: 'offer', give: S.form.give, giveN: +S.form.giveN, want: S.form.want, wantN: +S.form.wantN }, function (r) { toast(r.msg, !r.ok); render(); });
    else if (a === 'offer-accept') act({ type: 'accept', id: id });
    else if (a === 'offer-cancel') act({ type: 'cancel', id: id });
    else if (a === 'nd-open') { S.attack = { node: b.getAttribute('data-id'), w: me.units.w, a: me.units.a, u: me.units.u }; render(); }
    else if (a === 'recall') act({ type: 'recall', id: b.getAttribute('data-id') });
    else if (a === 'barter') act({ type: 'barter', at: b.getAttribute('data-at'), want: b.getAttribute('data-want'), pay: b.getAttribute('data-pay') });
    else if (a === 'gift-open') { S.gift = { id: id, key: 'food', n: Math.min(20, have(me, 'food')) }; render(); }
    else if (a === 'gift-cancel') { S.gift = null; render(); }
    else if (a === 'gift-n') { S.gift.n += +b.getAttribute('data-d'); render(); }
    else if (a === 'gift-go') Net.act({ type: 'gift', to: S.gift.id, key: S.gift.key, n: S.gift.n }, function (r) { toast(r.msg, !r.ok); if (r.ok) S.gift = null; render(); });
    else return false;
    return true;
  }
  function restoreForm() {
    var a = document.getElementById('f-owner'), b = document.getElementById('f-name'), c = document.getElementById('f-code'), d = document.getElementById('f-adopt');
    if (a) a.value = S.form.owner; if (b) b.value = S.form.name; if (c) c.value = S.form.code; if (d) d.value = S.form.adopt;
  }
  function renderTools() {
    setHTML(el.tools, '<div class="zoom"><button data-act="zoom" data-f="1.4" aria-label="放大">＋</button><button data-act="zoom" data-f="0.714" aria-label="縮小">−</button>' +
      (scene() === 'map' ? '<button data-act="whole" aria-label="顯示全島">全島</button>' : '<button data-act="home" aria-label="回到部落中央">中央</button>') + '</div>');
  }
  function render() {
    if (!el.hud) return;
    var sc = scene();
    if (el.scene.getAttribute('data-scene') !== sc) { el.scene.setAttribute('data-scene', sc); if (sc === 'map') MV.resize(); else VV.resize(); }
    if (sc === 'map' && !MV.sized) MV.resize();
    renderHud(); renderTools(); renderLeft(); renderDock(); renderBanner(); renderFeed(); renderDrawer(); renderPop();
    if (setHTML(el.modal, !S.me ? '' : S.show ? showModal(S.me) : S.attack ? attackModal(S.me) : S.gift ? giftModal(S.me) : S.report ? battleReport(S.me) : S.visit ? '' : reportModal(S.me))) { tickTimers(); if (S.show) startShow(); }
    if (sc === 'village') renderVillage(); else renderMarks();
  }

  // ---------- 操作 ----------
  function act(a, okMsg) { Net.act(a, function (r) { if (r && !r.ok) toast(r.msg || '沒有成功', true); else if (okMsg || (r && r.msg)) toast(okMsg || r.msg); }); }
  function onInput(e) {
    if (e.target.id === 'f-owner') S.form.owner = e.target.value;
    else if (e.target.id === 'f-name') S.form.name = e.target.value;
    else if (e.target.id === 'f-code') S.form.code = e.target.value;
    else if (e.target.id === 'f-adopt') S.form.adopt = e.target.value;
    else if (e.target.id === 'f-ally') S.form.ally = e.target.value;
    else if (e.target.id === 'o-give') S.form.give = e.target.value;
    else if (e.target.id === 'o-giveN') S.form.giveN = e.target.value;
    else if (e.target.id === 'o-want') S.form.want = e.target.value;
    else if (e.target.id === 'o-wantN') S.form.wantN = e.target.value;
    else if (e.target.id === 'g-key' && S.gift) { S.gift.key = e.target.value; render(); }
  }
  function onClick(e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var foc = document.activeElement;   // 按了按鈕就離開輸入框，面板才會照新的狀態重畫（手機上按鈕不一定會搶走焦點）
    if (foc && foc !== b && /^(INPUT|SELECT)$/.test(foc.tagName) && foc.type !== 'checkbox') foc.blur();
    var a = b.getAttribute('data-act'), me = S.me, tile = +b.getAttribute('data-tile');
    if (a === 'tab') {
      var tb = b.getAttribute('data-tab'), wasMap = S.view === 'map';
      S.visit = null;
      if (tb === 'map') { S.view = 'map'; S.tab = 'map'; }
      else if (tb === 'build') { S.view = 'village'; S.tab = 'build'; }
      else S.tab = S.tab === tb ? (S.view === 'map' ? 'map' : 'build') : tb;   // 再按一次就關掉
      render();
      if (tb === 'map' && me && !wasMap) { var h = G.byId[me.hex]; MV.focus(h.x, h.y, Math.max(MV.k, 4.5)); render(); }   // 打開大地圖：放大到自己附近
    }
    else if (a === 'pick') {
      var id = b.getAttribute('data-t'), c = G.centroid[id];
      var list = G.regions[id].map(function (x) { return G.byId[x]; }).sort(function (p, q) { return Math.hypot(p.x - c[0], p.y - c[1]) - Math.hypot(q.x - c[0], q.y - c[1]); });
      S.zone = list[0].id; MV.focus(list[0].x, list[0].y, Math.max(MV.k, 1.8)); render();
    }
    else if (a === 'join') {
      S.joining = true; render();
      Net.join({ owner: S.form.owner, name: S.form.name, code: S.form.code, tribe: G.byId[S.zone].tribe, hex: S.zone }, function (r) {
        S.joining = false;
        if (!r.ok) { toast(r.msg, true); render(); return; }
        S.tab = 'build'; S.view = 'village'; S.selTile = null; toast('部落建立了。左邊是任務，點建築可以升級，下方的按鈕打開其他功能。'); render();
      });
    }
    else if (a === 'zoom') (scene() === 'map' ? MV : VV).zoomCenter(+b.getAttribute('data-f'));
    else if (a === 'pop-close') { S.selTile = null; S.node = null; S.zone = null; render(); }
    else if (a === 'pop-more') { S.popMore = !S.popMore; render(); }
    else if (a === 'left-toggle') { S.leftMin = !S.leftMin; render(); }
    else if (a === 'go-tile') { var gt = +b.getAttribute('data-tile'); S.view = 'village'; S.tab = 'build'; if (gt >= 0) { S.selTile = gt; var gp = Art.sitePos(gt); VV.focus(gp[0], gp[1], VV.k); } else S.tab = 'army'; render(); }
    else if (a === 'go-march') {   // 追蹤欄的隊伍：到地圖上看
      var gm = S.marches.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0], gn = gm && gm.node && S.nodes.filter(function (x) { return x.id === gm.node; })[0], gv = gm && gm.to && S.pubs.filter(function (x) { return x.id === gm.to; })[0];
      S.view = 'map'; S.tab = 'map'; render();
      if (gn) { S.node = gn.id; MV.focus(gn.x, gn.y, Math.max(MV.k, 4.5)); } else if (gv) { S.node = null; S.zone = gv.hex; MV.focus(gv.pos[0], gv.pos[1], Math.max(MV.k, 4.5)); }
      render();
    }
    else if (a === 'dev-go') devGo(me);
    else if (a === 'whole') MV.focus(Geo.MAP_W / 2, Geo.MAP_H / 2, 1);
    else if (a === 'home') { var p = Art.sitePos(R.CENTER_TILE); VV.focus(p[0], p[1] - 10, Math.max(1, Math.min(3.2, VV.vw / 1040))); }
    else if (a === 'upgrade') act({ type: 'upgrade', tile: tile }, '開始施工');
    else if (a === 'build') act({ type: 'build', tile: tile, type2: b.getAttribute('data-type') }, '開始興建');
    else if (a === 'clear') act({ type: 'clear', tile: tile }, '族人開始拓荒');
    else if (a === 'auto') act({ type: 'auto', on: b.checked });
    else if (a === 'focus') act({ type: 'idle', focus: b.getAttribute('data-f') });
    else if (a === 'idleup') act({ type: 'idle', upgrade: b.checked }, b.checked ? '離線時會自動升級' : '已關閉自動升級');
    else if (a === 'ack') act({ type: 'ack' });
    else if (a === 'art-style') { Art.setNewArt(b.getAttribute('data-v') === 'new'); el.vobjs._sig = null; el.hud._h = null; el.pbody._h = null; el.modal._h = null; render(); toast(Art.newArt() ? '已換成新的美術' : '已換回原本的畫法'); }
    else if (a === 'code-show' || a === 'code-hide') { S.showCode = a === 'code-show'; render(); }
    else if (a === 'code-copy') {
      var link = location.origin + location.pathname + '#t=' + Net.code();
      var done = function () { toast('連結複製好了，貼到另一臺裝置的瀏覽器打開'); }, manual = function () { var box = document.getElementById('codebox'); if (box && window.getSelection) { var rg = document.createRange(); rg.selectNodeContents(box); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg); } toast('這個瀏覽器不能自動複製，請長按上面的代碼自己複製'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, manual); else manual();
    }
    else if (a === 'adopt-open' || a === 'adopt-close') { S.adopt = a === 'adopt-open'; render(); }
    else if (a === 'adopt-go') Net.adopt(S.form.adopt, function (r) { if (!r.ok) return toast(r.msg, true); S.adopt = false; S.form.adopt = ''; toast('找到了，正在接回你的部落'); });
    else if (a === 'dev') act({ type: 'dev' });
    else if (a === 'research') act({ type: 'research', id: b.getAttribute('data-id') });
    else if (a === 'quest') { var qi = me.qp ? me.qp.i : 0; Net.act({ type: 'quest' }, function (r) { if (!r.ok) return toast(r.msg, true); toast('完成第 ' + (qi + 1) + ' 章！' + rewardText(myTribe(), qi)); }); }
    else if (a === 'bless') act({ type: 'bless' });
    else if (a === 't-quest') Net.test('quest');
    else if (a === 't-pace') { Net.test('pace', b.getAttribute('data-v') === 'formal' ? 20 : 1); toast(b.getAttribute('data-v') === 'formal' ? '已切換成正式節奏' : '已切換成快速試玩'); }
    else if (a === 't-rest') Net.test('rest');
    else if (a === 't-rich') { Net.test('rich', b.checked); toast(b.checked ? '已開啟無限資源' : '已關閉無限資源'); }
    else if (a === 't-finish') Net.test('finish');
    else if (a === 't-army') Net.test('army');
    else if (a === 't-march') Net.test('march');
    else if (a === 't-bots') { Net.test('bots'); toast('示範部落都多了 6 名守軍'); }
    else if (a === 'idletr') act({ type: 'idle', train: b.checked }, b.checked ? '離線時會自動補訓守軍' : '已關閉自動補訓');
    else if (armyClick(a, b, me) || socialClick(a, b, me)) { /* 軍事、對戰與交流的操作 */ }
    else if (a === 'visit') Net.view(b.getAttribute('data-id'), function (d) { if (!d) return toast('找不到這個部落', true); S.visit = { id: d.id, v: d }; el.vimg._focus = null; render(); });
    else if (a === 'leave') { S.visit = null; el.vimg._focus = null; S.tab = 'map'; S.view = 'map'; render(); }
    else if (a === 'job') {
      var j = { type: 'jobs', food: me.jobs.food, mat: me.jobs.mat, special: me.jobs.special };
      j[b.getAttribute('data-k')] += +b.getAttribute('data-d'); act(j);
    }
    else if (a === 'reset') {
      if (Date.now() < S.resetAt) { S.resetAt = 0; Net.reset(); toast('已重新開始'); }
      else { S.resetAt = Date.now() + 4000; render(); setTimeout(render, 4100); }
    }
  }

  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
