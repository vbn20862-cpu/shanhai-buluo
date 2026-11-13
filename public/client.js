/* 山海部落 — 操作介面（選區域落腳、拓荒與部落經營、掛機、拜訪、圖鑑） */
(function () {
  'use strict';
  var R = World.rules, G = Geo.build();
  var STAGE_TYPES = ['house', 'farm', 'mat', 'special', 'storage'];   // 這個階段開放的建築；軍事建築在對戰階段加入
  var JOBS = ['food', 'mat', 'special'], WILD = { fish: '漁場', hunt: '獵場', wood: '林地' };
  var S = { me: null, pubs: [], tab: 'build', zone: null, selTile: null, visit: null, form: { owner: '', name: '' }, mode: '', online: false, resetAt: 0, joining: false };
  var el = {}, MV = null, VV = null;

  // ---------- 小工具 ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(x) { return Math.floor(x || 0); }
  function setHTML(node, html) { if (node._h === html) return false; node.innerHTML = html; node._h = html; return true; }
  function dur(sec) { sec = Math.max(0, Math.ceil(sec)); return sec < 60 ? sec + ' 秒' : Math.floor(sec / 60) + ' 分 ' + ('0' + sec % 60).slice(-2) + ' 秒'; }
  function toast(msg, bad) {
    var d = document.createElement('div'); d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = msg;
    el.toast.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
  }
  function scene() { return S.visit || (S.me && S.tab !== 'map') ? 'village' : 'map'; }
  function shown() { return S.visit ? S.visit.v : S.me; }   // 目前畫面上的部落：自己的，或正在拜訪的
  function ago(ms) { var m = Math.round(ms / 60000); return m < 1 ? '不到 1 分鐘' : m < 60 ? m + ' 分鐘' : Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分鐘'; }
  function myTribe() { return Tribes.get(S.me.tribe); }

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
    app.innerHTML = '<header id="hud"></header><main id="stage"><section id="scene">' +
      '<svg id="vsvg" role="img" aria-label="部落畫面">' + Art.DEFS + '<g id="vcam"><image id="vimg" width="' + Art.SW + '" height="' + Art.SH + '" preserveAspectRatio="none"/><g id="vdecor"></g><g id="vobjs"></g><g id="folk"></g></g></svg>' +
      '<svg id="msvg" role="img" aria-label="臺灣全島地圖"></svg><div id="tools"></div></section>' +
      '<aside id="panel"><nav id="tabs"></nav><div id="pbody"></div></aside></main><div id="modal"></div><div id="toast" role="status" aria-live="polite"></div>';
    ['hud', 'stage', 'scene', 'vsvg', 'vcam', 'vimg', 'vdecor', 'vobjs', 'folk', 'msvg', 'tools', 'panel', 'tabs', 'pbody', 'toast', 'modal'].forEach(function (id) { el[id] = document.getElementById(id); });
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    el.msvg.innerHTML = '<g id="cam"><image width="' + Geo.MAP_W + '" height="' + Geo.MAP_H + '" href="' + Art.paintMap(4).toDataURL('image/png') + '" preserveAspectRatio="none"/>' +
      '<g id="mzone"></g><g id="mmarks"></g><g id="mlabels">' + Art.mapLabels() + '</g></g>';
    el.mzone = document.getElementById('mzone'); el.mmarks = document.getElementById('mmarks');
    MV = new PanZoom(el.msvg, document.getElementById('cam'), Geo.MAP_W, Geo.MAP_H, { cover: false, maxK: 7, onTap: mapTap, onChange: function (pz) {
      el.msvg.style.setProperty('--u', (1 / (pz.s0 * pz.k)).toFixed(4)); el.msvg.classList.toggle('far', pz.k < 1.9); renderMarks();
    } });
    VV = new PanZoom(el.vsvg, el.vcam, Art.SW, Art.SH, { cover: true, maxK: 3.2, onTap: siteTap });
    window.addEventListener('resize', function () { MV.resize(); VV.resize(); });
    setInterval(tickTimers, 250);
    setInterval(moveFolk, 2400);
    setInterval(function () { if (S.visit) Net.view(S.visit.id, function (d) { if (d && S.visit && S.visit.id === d.id) { S.visit.v = d; render(); } }); }, 3000);
    Net.on('status', function (s) { S.online = s.online; S.mode = s.mode; render(); });
    Net.on('hello', function (h) { S.pubs = h.villages || S.pubs; if (h.reset) { S.me = null; S.zone = null; S.selTile = null; S.visit = null; S.tab = 'build'; el.vobjs._sig = null; } render(); });
    Net.on('state', function (st) { S.me = st.me; S.pubs = st.villages; render(); });
    Net.start();
    render();
  }

  // ---------- 世界地圖 ----------
  function mapTap(x, y, u) {
    var best = null, bd = 16 * u;
    S.pubs.forEach(function (v) { var d = Math.hypot(v.pos[0] - x, v.pos[1] - y); if (d < bd) { bd = d; best = v; } });
    var h = best ? G.byId[best.hex] : Geo.nearestHex(x, y, Geo.HEX_SIZE * 1.15);
    S.zone = h ? h.id : null;
    if (S.me) S.tab = 'map';
    render();
  }
  function renderMarks() {
    if (!MV || !MV.sized) return;
    var u = 1 / (MV.s0 * MV.k), s = '', z = S.zone && G.byId[S.zone];
    setHTML(el.mzone, z ? '<circle class="zsel" cx="' + z.x + '" cy="' + z.y + '" r="' + (Geo.HEX_SIZE * 1.05) + '" style="stroke-width:' + (2.2 * u).toFixed(3) + '"/>' : '');
    G.settlements.forEach(function (st) {
      var r = 5 * u;
      s += '<path class="sett" d="M' + st.x + ' ' + (st.y - r) + 'L' + (st.x + r) + ' ' + st.y + 'L' + st.x + ' ' + (st.y + r) + 'L' + (st.x - r) + ' ' + st.y + 'Z" style="stroke-width:' + (1.4 * u).toFixed(3) + '"/>';
    });
    S.pubs.forEach(function (v) {
      var mine = S.me && v.id === S.me.id, t = Tribes.get(v.tribe), r = (mine ? 6.5 : MV.k < 1.9 ? 3 : 4.2) * u;
      s += '<g class="vm' + (mine ? ' me' : '') + '"><circle cx="' + v.pos[0] + '" cy="' + v.pos[1] + '" r="' + r.toFixed(3) + '" fill="' + t.color + '" style="stroke-width:' + ((mine ? 2.4 : 1.4) * u).toFixed(3) + '"/>' +
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
    S.selTile = best === S.selTile ? null : best; S.tab = 'build'; render();
  }
  function renderVillage() {
    var v = shown(); if (!v) return;
    var t = Tribes.get(v.tribe), sel = S.visit ? null : S.selTile;
    if (el.vimg._t !== t.id) { el.vimg.setAttribute('href', Art.groundURL(t)); el.vdecor.innerHTML = Art.decor(t); el.vimg._t = t.id; }
    if (!VV.sized || el.vimg._focus !== v.id) {
      if (VV.resize()) { var c = Art.sitePos(R.CENTER_TILE); VV.focus(c[0], c[1] - 10, Math.max(1, Math.min(3.2, VV.vw / 1040))); el.vimg._focus = v.id; }
    }
    var sig = v.id + '|' + sel + '|' + JSON.stringify(v.tiles) + v.land.join('') + JSON.stringify(v.queue);
    if (el.vobjs._sig !== sig) { el.vobjs.innerHTML = Art.scene(v, sel, !!S.visit); el.vobjs._sig = sig; tickTimers(); }
    var want = Math.min(v.pop, 14);
    if (folkN !== want || el.folk._t !== v.id) {
      var s = '';
      for (var i = 0; i < want; i++) { var p = spot(v); s += '<g class="person" style="transform:translate(' + p[0] + 'px,' + p[1] + 'px)">' + Art.person(i % 3 ? '#F2EAD6' : t.look.trim) + '</g>'; }
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
    var now = Date.now(), list = document.querySelectorAll('[data-until]');
    for (var i = 0; i < list.length; i++) list[i].textContent = dur((+list[i].getAttribute('data-until') - now) / 1000);
  }

  // ---------- 上方資訊列 ----------
  function chip(ic, label, val, cap) {
    return '<div class="chip" title="' + label + '">' + Art.icon(ic) + '<span class="lbl">' + label + '</span><b>' + val + '</b>' + (cap != null ? '<span class="cap">/' + cap + '</span>' : '') + '</div>';
  }
  function renderHud() {
    var live = S.pubs.filter(function (v) { return v.online && !v.bot; }).length;
    var me = S.me, h, badge = '<div class="mode' + (S.mode !== 'solo' && !S.online ? ' off' : '') + '">' + (S.mode === 'solo' ? '單機試玩' : S.online ? '已連線 · ' + live + ' 人在線' : '連線中斷，重新連線中') + '</div>';
    if (!me) h = '<div class="brand">山海部落</div><div class="spacer"></div><div class="turn">橫放手機，畫面更大</div>' + badge;
    else {
      var t = myTribe(), d = me.d;
      h = '<div class="vname"><span class="dot" style="background:' + t.color + '"></span><b>' + esc(me.name) + '</b><span class="sub">' + t.zh + '</span></div>' +
        chip('food', t.res.food, n0(me.res.food), d.cap) + chip('mat', t.res.mat, n0(me.res.mat), d.cap) +
        chip('sp', t.sp.zh, n0(me.sp[me.tribe]), d.spCap) + chip('pop', '族人', me.pop, d.popCap) + chip('star', '繁榮', d.prosperity) +
        '<div class="spacer"></div>' + (S.visit ? '<div class="visiting">正在拜訪 ' + esc(S.visit.v.name) + '</div>' : '') + badge;
    }
    setHTML(el.hud, h);
  }

  // ---------- 右側面板 ----------
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
      case 'center': return '倉庫容量 ' + (300 + 200 * L) + '，其他建築最高可到等級 ' + L;
      case 'house': return '可以住 ' + (1 + 2 * L) + ' 位族人';
      case 'farm': return (2 * L) + ' 個耕作位置，產出' + t.res.food;
      case 'mat': return (2 * L) + ' 個採集位置，產出' + t.res.mat;
      case 'special': return (2 * L) + ' 個工作位置，產出' + t.sp.zh;
      case 'storage': return '倉庫容量 +' + 400 * L + '，特產容量 +' + 20 * L;
    }
    return '';
  }
  function bname(t, type) { var b = t.b[type]; return esc(b.zh) + (b.native ? ' <i class="nat">' + esc(b.native) + '</i>' : ''); }
  function buildingCard(me, i, b) {
    var t = myTribe(), full = me.queue.length >= R.BUILDERS, h = '<section class="card sel"><h3>' + bname(t, b.type) + '<span class="lv">' + (b.level ? '等級 ' + b.level : '興建中') + '</span></h3>';
    if (b.level) h += '<p class="eff">' + effect(b.type, b.level, t) + '</p>';
    if (b.busy) {
      var w = me.queue.filter(function (x) { return x.tile === i; })[0];
      h += '<p class="busyline">施工中，還要 <b data-until="' + (w ? w.doneAt : 0) + '"></b></p>';
    } else if (b.level >= R.MAX_LEVEL) h += '<p class="muted">已經是最高等級。</p>';
    else {
      var to = b.level + 1, c = R.cost(b.type, to), sp = 0, why = '';
      if (b.type === 'center') sp = R.CENTER_UP[to].each * R.CENTER_UP[to].kinds;
      else if (to > me.d.center) why = '要先把' + t.b.center.zh + '升到等級 ' + to;
      if (!why && full) why = '同時只能進行 ' + R.BUILDERS + ' 項工程';
      if (!why && !affordable(me, c, sp)) why = '物資還不夠';
      h += '<p class="eff next">升級後：' + effect(b.type, to, t) + '</p>' +
        '<div class="act"><button class="btn" data-act="upgrade" data-tile="' + i + '"' + (why ? ' disabled' : '') + '>升到等級 ' + to + '</button>' + costHTML(me, c, sp) + '<span class="time">' + dur(R.buildTime(b.type, to)) + '</span></div>' +
        (why ? '<p class="why">' + why + '</p>' : '');
    }
    return h + '<p class="note">' + esc(t.b[b.type].note) + '</p></section>';
  }
  function emptyCard(me, i) {
    var t = myTribe(), full = me.queue.length >= R.BUILDERS, h = '<section class="card sel"><h3>開墾好的空地<span class="lv">選一種建築</span></h3><ul class="opts">';
    STAGE_TYPES.forEach(function (ty) {
      var c = R.cost(ty, 1), have = R.count(me, ty), lim = R.limit(ty, me.d.center), why = '';
      if (have >= lim) why = '已達上限，先升級' + t.b.center.zh; else if (full) why = '工程已滿'; else if (!affordable(me, c)) why = '物資還不夠';
      h += '<li><div class="opt-top"><b>' + bname(t, ty) + '</b><span class="cnt">' + have + '/' + lim + '</span></div><p class="eff">' + effect(ty, 1, t) + '</p>' +
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
        '<span class="rate">+' + Math.round(d.rates[k] * 60) + '/分</span></div>';
    });
    return h + '<p class="muted">族人 ' + me.pop + ' 位，待命 ' + (me.pop - used) + ' 位。位置不夠時，多蓋或升級對應的建築。</p></section>';
  }
  function queueCard(me) {
    if (!me.queue.length) return '';
    var t = myTribe(), h = '<section class="card"><h3>進行中的工程<span class="lv">' + me.queue.length + '/' + R.BUILDERS + '</span></h3>';
    me.queue.forEach(function (w) { h += '<div class="qrow"><span>' + (w.type === 'clear' ? '拓荒' : esc(t.b[w.type].zh) + ' → 等級 ' + w.to) + '</span><b data-until="' + w.doneAt + '"></b></div>'; });
    return h + '</section>';
  }
  function buildPanel(me) {
    var h = '', i = S.selTile;
    if (i != null) h += !me.land[i] ? wildCard(me, i) : me.tiles[i] ? buildingCard(me, i, me.tiles[i]) : emptyCard(me, i);
    else h += '<p class="hint">點建築可以升級，點有 ＋ 的空地可以蓋新建築，點外圍有斧頭記號的山林可以拓荒。畫面可以拖曳和縮放。</p>';
    return h + jobsCard(me) + queueCard(me) + idleCard(me);
  }
  function idleCard(me) {
    var t = myTribe(), opts = [['even', '平均'], ['food', t.res.food], ['mat', t.res.mat], ['special', t.sp.zh]];
    var h = '<section class="card"><h3>掛機設定<span class="lv">離線時照這樣進行</span></h3><p class="label">採集重點</p><div class="seg">';
    opts.forEach(function (o) { h += '<button data-act="focus" data-f="' + o[0] + '" aria-pressed="' + (me.idle.focus === o[0]) + '">' + o[1] + '</button>'; });
    h += '</div><label class="switch wide" for="idleup"><input type="checkbox" id="idleup" data-act="idleup"' + (me.idle.upgrade ? ' checked' : '') + '>離線時自動升級建築</label>';
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
    if (r.land) h += '<li><span>新開墾的地</span><b>+' + r.land + '</b></li>';
    r.ups.forEach(function (u) { h += '<li><span>' + esc(t.b[u.type].zh) + '升級</span><b>等級 ' + u.to + '</b></li>'; });
    if (!rows.length && !r.land && !r.ups.length) h += '<li><span>倉庫已經滿了，沒有新的收穫。</span></li>';
    return h + '</ul><button class="btn big" data-act="ack">知道了</button></div></div>';
  }
  function tribeCard(t, cells) {
    var h = '<section class="card tribe"><h3><span class="dot" style="background:' + t.color + '"></span>' + t.zh + '<span class="chipst ' + (t.playable ? 'on' : '') + '">' + (t.playable ? '可以落腳' : '之後開放') + '</span></h3>' +
      '<p class="en">' + esc(t.en) + ' · ' + t.terrain + (cells ? ' · 地圖上 ' + cells + ' 格' : '') + '</p><p>' + t.intro + '</p><p class="muted">分布：' + t.area + '</p>';
    if (t.playable) h += '<dl class="facts"><dt>特產</dt><dd>' + t.sp.zh + '（' + t.sp.desc + '）</dd><dt>特長</dt><dd>' + t.bonus.text + '</dd><dt>問候</dt><dd><i class="nat">' + esc(t.hello) + '</i>（' + t.lang + '）</dd></dl>';
    return h + '</section>';
  }
  function zonePanel() {
    if (!S.zone) return '<p class="hint">拖曳可以移動地圖，用兩指或右下角的按鈕縮放。點地圖上的任何地方，看看那裡是誰的區域。</p>';
    var z = G.byId[S.zone], h = '';
    if (z.tribe) h += tribeCard(Tribes.get(z.tribe), (G.regions[z.tribe] || []).length);
    else if (z.settlement) h += '<section class="card"><h3>' + G.settlements.filter(function (s) { return s.id === z.settlement; })[0].name + '<span class="chipst">中立</span></h3><p>平原上的中立聚落。之後可以在這裡交換各族的特產。這裡不能落腳，也不會有衝突。</p></section>';
    else h += '<section class="card"><h3>野地 · ' + WILD[z.wild] + '<span class="chipst">之後開放</span></h3><p>沒有人居住的野地。之後各部落可以派人佔領這裡的資源點。</p></section>';
    var here = S.pubs.filter(function (v) { return v.hex === z.id; });
    if (here.length) {
      h += '<section class="card"><h3>這裡的部落<span class="lv">' + here.length + '/' + Geo.SLOTS + '</span></h3>';
      here.forEach(function (v) {
        var mine = S.me && v.id === S.me.id;
        h += '<div class="vrow"><div><b>' + esc(v.name) + '</b>' + (mine ? '（你）' : v.bot ? '（示範）' : v.online ? '（在線上）' : '') + '<span class="muted">等級 ' + v.c + ' · 繁榮 ' + v.pros + '</span></div>' +
          (S.me ? '<button class="btn sm ghost" data-act="' + (mine ? 'tab" data-tab="build' : 'visit" data-id="' + v.id) + '">' + (mine ? '回部落' : '拜訪') + '</button>' : '') + '</div>';
      });
      h += '</section>';
    }
    return h;
  }
  function startPanel() {
    var z = S.zone && G.byId[S.zone], t = z && z.tribe && Tribes.get(z.tribe), ok = t && t.playable;
    var h = '<div class="start"><h1>山海部落</h1><p class="lead">很久以前，島上的山與海之間住著許多族群。選一個地方，建立你的部落。</p>' +
      '<div class="fields"><label for="f-owner">你的名字<input id="f-owner" maxlength="10" autocomplete="off" placeholder="例如：小米"></label>' +
      '<label for="f-name">部落名稱<input id="f-name" maxlength="10" autocomplete="off" placeholder="例如：晨霧部落"></label></div>' +
      '<p class="label">第一版開放的族群</p><div class="picks">';
    Tribes.playable().forEach(function (p) {
      h += '<button class="pick" data-act="pick" data-t="' + p.id + '" aria-pressed="' + (t && t.id === p.id) + '"><span class="dot" style="background:' + p.color + '"></span><b>' + p.zh + '</b><span>' + p.terrain + '</span></button>';
    });
    h += '</div>';
    if (t) h += tribeCard(t, (G.regions[t.id] || []).length);
    else if (z) h += zonePanel();
    else h += '<p class="hint">點上面的族群，或直接在地圖上點一個地方。</p>';
    h += '<button class="btn big" data-act="join"' + (ok && !S.joining ? '' : ' disabled') + '>' + (ok ? '在' + t.zh + '的區域建立部落' : '先選一個可以落腳的區域') + '</button></div>';
    return h;
  }
  function codexPanel(me) {
    var t = myTribe(), h = '<section class="card"><h3><span class="dot" style="background:' + t.color + '"></span>' + t.zh + '<span class="lv">' + esc(t.en) + '</span></h3><p>' + t.intro + '</p>' +
      '<dl class="facts"><dt>問候</dt><dd><i class="nat">' + esc(t.hello) + '</i></dd><dt>謝謝</dt><dd><i class="nat">' + esc(t.thanks) + '</i></dd><dt>語別</dt><dd>' + t.lang + '</dd><dt>特長</dt><dd>' + t.bonus.text + '</dd></dl></section>';
    t.cards.forEach(function (c) { h += '<section class="card"><h3>' + esc(c.t) + '</h3><p>' + esc(c.x) + '</p></section>'; });
    h += '<p class="label">島上的 17 族</p><ul class="tlist">';
    Tribes.LIST.forEach(function (o) { h += '<li><span class="dot" style="background:' + o.color + '"></span><div><b>' + o.zh + '</b><span class="muted"> ' + o.area + '</span><p>' + o.intro + '</p></div></li>'; });
    h += '</ul><p class="muted">' + Tribes.SOURCE_NOTE + '</p>';
    if (S.mode === 'solo') h += '<button class="btn ghost" data-act="reset">' + (Date.now() < S.resetAt ? '再按一次，確定重新開始' : '重新開始（清除單機存檔）') + '</button>';
    return h;
  }
  function renderPanel() {
    var me = S.me;
    if (!me) { setHTML(el.tabs, ''); el.tabs.hidden = true; if (setHTML(el.pbody, startPanel())) restoreForm(); return; }
    if (S.visit) { el.tabs.hidden = true; setHTML(el.pbody, visitPanel()); return; }
    el.tabs.hidden = false;
    setHTML(el.tabs, [['build', '部落'], ['map', '地圖'], ['codex', '圖鑑']].map(function (t) {
      return '<button data-act="tab" data-tab="' + t[0] + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + '</button>';
    }).join(''));
    var keep = el.pbody.scrollTop;
    if (setHTML(el.pbody, S.tab === 'build' ? buildPanel(me) : S.tab === 'map' ? zonePanel() : codexPanel(me))) { el.pbody.scrollTop = keep; tickTimers(); }
  }
  function restoreForm() {
    var a = document.getElementById('f-owner'), b = document.getElementById('f-name');
    if (a) a.value = S.form.owner; if (b) b.value = S.form.name;
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
    renderHud(); renderTools(); renderPanel();
    setHTML(el.modal, S.me && !S.visit ? reportModal(S.me) : '');
    if (sc === 'village') renderVillage(); else renderMarks();
  }

  // ---------- 操作 ----------
  function act(a, okMsg) { Net.act(a, function (r) { if (r && !r.ok) toast(r.msg || '沒有成功', true); else if (okMsg || (r && r.msg)) toast(okMsg || r.msg); }); }
  function onInput(e) {
    if (e.target.id === 'f-owner') S.form.owner = e.target.value;
    else if (e.target.id === 'f-name') S.form.name = e.target.value;
  }
  function onClick(e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var a = b.getAttribute('data-act'), me = S.me, tile = +b.getAttribute('data-tile');
    if (a === 'tab') {
      S.visit = null; S.tab = b.getAttribute('data-tab'); render();
      if (S.tab === 'map' && me) { S.zone = S.zone || me.hex; var h = G.byId[me.hex]; MV.focus(h.x, h.y, Math.max(MV.k, 2.6)); render(); }
    }
    else if (a === 'pick') {
      var id = b.getAttribute('data-t'), c = G.centroid[id];
      var list = G.regions[id].map(function (x) { return G.byId[x]; }).sort(function (p, q) { return Math.hypot(p.x - c[0], p.y - c[1]) - Math.hypot(q.x - c[0], q.y - c[1]); });
      S.zone = list[0].id; MV.focus(list[0].x, list[0].y, Math.max(MV.k, 1.8)); render();
    }
    else if (a === 'join') {
      S.joining = true; render();
      Net.join({ owner: S.form.owner, name: S.form.name, tribe: G.byId[S.zone].tribe, hex: S.zone }, function (r) {
        S.joining = false;
        if (!r.ok) { toast(r.msg, true); render(); return; }
        S.tab = 'build'; S.selTile = null; toast('部落建立了。先蓋家屋讓族人住進來，空地不夠就往外拓荒。'); render();
      });
    }
    else if (a === 'zoom') (scene() === 'map' ? MV : VV).zoomCenter(+b.getAttribute('data-f'));
    else if (a === 'whole') MV.focus(Geo.MAP_W / 2, Geo.MAP_H / 2, 1);
    else if (a === 'home') { var p = Art.sitePos(R.CENTER_TILE); VV.focus(p[0], p[1] - 10, Math.max(1, Math.min(3.2, VV.vw / 1040))); }
    else if (a === 'upgrade') act({ type: 'upgrade', tile: tile }, '開始施工');
    else if (a === 'build') act({ type: 'build', tile: tile, type2: b.getAttribute('data-type') }, '開始興建');
    else if (a === 'clear') act({ type: 'clear', tile: tile }, '族人開始拓荒');
    else if (a === 'auto') act({ type: 'auto', on: b.checked });
    else if (a === 'focus') act({ type: 'idle', focus: b.getAttribute('data-f') });
    else if (a === 'idleup') act({ type: 'idle', upgrade: b.checked }, b.checked ? '離線時會自動升級' : '已關閉自動升級');
    else if (a === 'ack') act({ type: 'ack' });
    else if (a === 'visit') Net.view(b.getAttribute('data-id'), function (d) { if (!d) return toast('找不到這個部落', true); S.visit = { id: d.id, v: d }; el.vimg._focus = null; render(); });
    else if (a === 'leave') { S.visit = null; el.vimg._focus = null; S.tab = 'map'; render(); }
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
