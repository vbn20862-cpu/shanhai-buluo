/* 山海部落 — 操作介面（階段 1：選區域落腳、部落經營、圖鑑） */
(function () {
  'use strict';
  var R = World.rules, G = Geo.build();
  var STAGE_TYPES = ['house', 'farm', 'mat', 'special', 'storage'];   // 這個階段開放的建築；軍事建築在對戰階段加入
  var JOBS = ['food', 'mat', 'special'], WILD = { fish: '漁場', hunt: '獵場', wood: '林地' };
  var S = { me: null, pubs: [], tab: 'build', zone: null, selTile: null, form: { owner: '', name: '' }, mode: '', online: false, resetAt: 0, joining: false };
  var el = {}, MV = { k: 1, cx: Geo.MAP_W / 2, cy: Geo.MAP_H / 2, s0: 1, vw: Geo.MAP_W, vh: Geo.MAP_H, ready: false };

  // ---------- 小工具 ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(x) { return Math.floor(x || 0); }
  function setHTML(node, html) { if (node._h === html) return false; node.innerHTML = html; node._h = html; return true; }
  function dur(sec) { sec = Math.max(0, Math.ceil(sec)); return sec < 60 ? sec + ' 秒' : Math.floor(sec / 60) + ' 分 ' + ('0' + sec % 60).slice(-2) + ' 秒'; }
  function toast(msg, bad) {
    var d = document.createElement('div'); d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = msg;
    el.toast.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
  }
  function scene() { return S.me && S.tab !== 'map' ? 'village' : 'map'; }
  function myTribe() { return Tribes.get(S.me.tribe); }

  // ---------- 骨架 ----------
  function boot() {
    var app = document.getElementById('app');
    app.innerHTML = '<header id="hud"></header><main id="stage"><section id="scene">' +
      '<svg id="vsvg" viewBox="0 0 ' + Art.VW + ' ' + Art.VH + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="部落畫面"><g id="vbase"></g><g id="folk"></g></svg>' +
      '<svg id="msvg" role="img" aria-label="臺灣全島地圖"></svg><div id="tools"></div></section>' +
      '<aside id="panel"><nav id="tabs"></nav><div id="pbody"></div></aside></main><div id="toast" role="status" aria-live="polite"></div>';
    ['hud', 'stage', 'scene', 'vsvg', 'vbase', 'folk', 'msvg', 'tools', 'panel', 'tabs', 'pbody', 'toast'].forEach(function (id) { el[id] = document.getElementById(id); });
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    el.vsvg.addEventListener('click', function (e) {
      var g = e.target.closest('[data-tile]'); if (!g || !S.me) return;
      var i = +g.getAttribute('data-tile'); S.selTile = S.selTile === i ? null : i; S.tab = 'build'; render();
    });
    mapInit();
    window.addEventListener('resize', mapResize);
    setInterval(tickTimers, 250);
    setInterval(moveFolk, 2400);
    Net.on('status', function (s) { S.online = s.online; S.mode = s.mode; render(); });
    Net.on('hello', function (h) { S.pubs = h.villages || S.pubs; if (h.reset) { S.me = null; S.zone = null; S.selTile = null; S.tab = 'build'; } render(); });
    Net.on('state', function (st) { S.me = st.me; S.pubs = st.villages; render(); });
    Net.start();
    render();
  }

  // ---------- 世界地圖 ----------
  function mapInit() {
    var url = Art.paintMap(4).toDataURL('image/png');
    el.msvg.innerHTML = '<g id="cam"><image width="' + Geo.MAP_W + '" height="' + Geo.MAP_H + '" href="' + url + '" preserveAspectRatio="none"/>' +
      '<g id="mzone"></g><g id="mmarks"></g><g id="mlabels">' + Art.mapLabels() + '</g></g>';
    el.cam = document.getElementById('cam'); el.mzone = document.getElementById('mzone'); el.mmarks = document.getElementById('mmarks');
    var ptrs = {}, drag = null;
    function count() { return Object.keys(ptrs).length; }
    function two() { var k = Object.keys(ptrs); return Math.hypot(ptrs[k[0]].x - ptrs[k[1]].x, ptrs[k[0]].y - ptrs[k[1]].y); }
    el.msvg.addEventListener('pointerdown', function (e) {
      try { el.msvg.setPointerCapture(e.pointerId); } catch (x) { /* 有些瀏覽器不支援，拖曳仍可用 */ }
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() === 1) drag = { x: e.clientX, y: e.clientY, cx: MV.cx, cy: MV.cy, moved: false };
      else if (count() === 2) drag = { pinch: two(), k: MV.k, moved: true };
    });
    el.msvg.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId] || !drag) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (drag.pinch && count() === 2) { MV.k = drag.k * two() / drag.pinch; mapApply(); return; }
      if (drag.pinch) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
      if (drag.moved) { MV.cx = drag.cx - dx / (MV.s0 * MV.k); MV.cy = drag.cy - dy / (MV.s0 * MV.k); mapApply(); }
    });
    function up(e) {
      if (!ptrs[e.pointerId]) return;
      var tap = drag && !drag.moved && count() === 1;
      delete ptrs[e.pointerId];
      if (tap) mapTap(e.clientX, e.clientY);
      if (count() === 0) drag = null;
      else { var k = Object.keys(ptrs)[0]; drag = { x: ptrs[k].x, y: ptrs[k].y, cx: MV.cx, cy: MV.cy, moved: true }; }
    }
    el.msvg.addEventListener('pointerup', up); el.msvg.addEventListener('pointercancel', up);
    el.msvg.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY); }, { passive: false });
    MV.ready = true; mapResize();
  }
  function toMap(cx, cy) {
    var r = el.msvg.getBoundingClientRect();
    return [((cx - r.left) / MV.s0 - (MV.vw / 2 - MV.cx * MV.k)) / MV.k, ((cy - r.top) / MV.s0 - (MV.vh / 2 - MV.cy * MV.k)) / MV.k];
  }
  function zoomAt(f, cx, cy) {
    var before = toMap(cx, cy); MV.k *= f; mapApply();
    var after = toMap(cx, cy); MV.cx += before[0] - after[0]; MV.cy += before[1] - after[1]; mapApply();
  }
  function mapResize() {
    if (!MV.ready) return;
    var r = el.scene.getBoundingClientRect(); if (!r.width || !r.height) return;
    MV.s0 = Math.min(r.width / Geo.MAP_W, r.height / Geo.MAP_H); MV.vw = r.width / MV.s0; MV.vh = r.height / MV.s0;
    el.msvg.setAttribute('viewBox', '0 0 ' + MV.vw.toFixed(1) + ' ' + MV.vh.toFixed(1));
    mapApply();
  }
  function mapApply() {
    MV.k = Math.max(1, Math.min(7, MV.k));
    MV.cx = Math.max(0, Math.min(Geo.MAP_W, MV.cx)); MV.cy = Math.max(0, Math.min(Geo.MAP_H, MV.cy));
    el.cam.setAttribute('transform', 'translate(' + (MV.vw / 2 - MV.cx * MV.k).toFixed(2) + ' ' + (MV.vh / 2 - MV.cy * MV.k).toFixed(2) + ') scale(' + MV.k.toFixed(3) + ')');
    el.msvg.style.setProperty('--u', (1 / (MV.s0 * MV.k)).toFixed(4));
    el.msvg.classList.toggle('far', MV.k < 1.9);
    renderMarks();
  }
  function focusHex(h, k) { MV.cx = h.x; MV.cy = h.y; if (k) MV.k = Math.max(MV.k, k); mapApply(); }
  function mapTap(cx, cy) {
    var p = toMap(cx, cy), u = 1 / (MV.s0 * MV.k), best = null, bd = 16 * u;
    S.pubs.forEach(function (v) { var d = Math.hypot(v.pos[0] - p[0], v.pos[1] - p[1]); if (d < bd) { bd = d; best = v; } });
    var h = best ? G.byId[best.hex] : Geo.nearestHex(p[0], p[1], Geo.HEX_SIZE * 1.15);
    S.zone = h ? h.id : null;
    if (S.me) S.tab = 'map';
    render();
  }
  function renderMarks() {
    if (!MV.ready) return;
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
  var folk = [];
  function renderVillage() {
    var v = S.me; if (!v) return;
    var sig = v.tribe + '|' + v.wall + '|' + S.selTile + '|' + JSON.stringify(v.tiles) + JSON.stringify(v.queue);
    if (el.vbase._sig !== sig) {
      var look = Tribes.get(v.tribe).look;   // 畫面比例不同時，上下多出來的地方用天空與地面的顏色補滿
      el.vsvg.style.background = 'linear-gradient(' + (look.backdrop === 'coast' ? '#BFE0EA' : '#BFDDE0') + ' 50%, ' + look.ground + ' 50%)';
      el.vbase.innerHTML = Art.village(v, S.selTile, v.queue); el.vbase._sig = sig; tickTimers();
    }
    var want = Math.min(v.pop, 12);
    if (folk.length !== want) {
      var t = Tribes.get(v.tribe), s = '';
      folk = [];
      for (var i = 0; i < want; i++) {
        var p = spot(v); folk.push(p);
        s += '<g class="person" style="transform:translate(' + p[0] + 'px,' + p[1] + 'px)"><ellipse cx="0" cy="9" rx="6" ry="2.2" fill="#000" opacity=".22"/><path d="M-5 9c0-8 2-12 5-12s5 4 5 12z" fill="' + (i % 3 ? '#F2EAD6' : t.look.trim) + '"/><circle cx="0" cy="-7" r="4.4" fill="#B98660"/></g>';
      }
      el.folk.innerHTML = s;
    }
  }
  function spot(v) {
    var built = []; for (var i = 0; i < R.TILE_N; i++) if (v.tiles[i] && v.tiles[i].level > 0) built.push(i);
    var p = Art.tileXY(built[Math.floor(Math.random() * built.length)] || R.CENTER_TILE);
    return [Math.round(p[0] + 14 + Math.random() * 68), Math.round(p[1] + 88 + Math.random() * 10)];
  }
  function moveFolk() {
    if (!S.me || scene() !== 'village' || document.hidden) return;
    var nodes = el.folk.children;
    for (var i = 0; i < nodes.length; i++) if (Math.random() < 0.6) { var p = spot(S.me); nodes[i].style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px)'; }
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
    var me = S.me, h, badge = '<div class="mode">' + (S.mode === 'solo' ? '單機試玩' : S.online ? '已連線' : '連線中') + '</div>';
    if (!me) h = '<div class="brand">山海部落</div><div class="spacer"></div><div class="turn">橫放手機，畫面更大</div>' + badge;
    else {
      var t = myTribe(), d = me.d;
      h = '<div class="vname"><span class="dot" style="background:' + t.color + '"></span><b>' + esc(me.name) + '</b><span class="sub">' + t.zh + '</span></div>' +
        chip('food', t.res.food, n0(me.res.food), d.cap) + chip('mat', t.res.mat, n0(me.res.mat), d.cap) +
        chip('sp', t.sp.zh, n0(me.sp[me.tribe]), d.spCap) + chip('pop', '族人', me.pop, d.popCap) + chip('star', '繁榮', d.prosperity) +
        '<div class="spacer"></div>' + badge;
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
      var q = me.queue.filter(function (x) { return x.tile === i; })[0];
      h += '<p class="busyline">施工中，還要 <b data-until="' + (q ? q.doneAt : 0) + '"></b></p>';
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
    var t = myTribe(), full = me.queue.length >= R.BUILDERS, h = '<section class="card sel"><h3>空地<span class="lv">選一種建築</span></h3><ul class="opts">';
    STAGE_TYPES.forEach(function (ty) {
      var c = R.cost(ty, 1), have = R.count(me, ty), lim = R.limit(ty, me.d.center), why = '';
      if (have >= lim) why = '已達上限，先升級' + t.b.center.zh; else if (full) why = '工程已滿'; else if (!affordable(me, c)) why = '物資還不夠';
      h += '<li><div class="opt-top"><b>' + bname(t, ty) + '</b><span class="cnt">' + have + '/' + lim + '</span></div><p class="eff">' + effect(ty, 1, t) + '</p>' +
        '<div class="act"><button class="btn sm" data-act="build" data-tile="' + i + '" data-type="' + ty + '"' + (why ? ' disabled' : '') + '>興建</button>' + costHTML(me, c) + '<span class="time">' + dur(R.buildTime(ty, 1)) + '</span></div>' +
        (why ? '<p class="why">' + why + '</p>' : '') + '</li>';
    });
    return h + '</ul></section>';
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
    var t = myTribe(), h = '<section class="card"><h3>施工中<span class="lv">' + me.queue.length + '/' + R.BUILDERS + '</span></h3>';
    me.queue.forEach(function (q) { h += '<div class="qrow"><span>' + esc(t.b[q.type].zh) + ' → 等級 ' + q.to + '</span><b data-until="' + q.doneAt + '"></b></div>'; });
    return h + '</section>';
  }
  function buildPanel(me) {
    var h = '';
    if (S.selTile != null) h += me.tiles[S.selTile] ? buildingCard(me, S.selTile, me.tiles[S.selTile]) : emptyCard(me, S.selTile);
    else h += '<p class="hint">點部落裡的建築可以升級，點空地可以蓋新的建築。</p>';
    return h + jobsCard(me) + queueCard(me);
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
        h += '<div class="qrow"><span>' + esc(v.name) + (mine ? '（你）' : v.bot ? '（示範）' : '') + '</span><b>等級 ' + v.c + ' · 繁榮 ' + v.pros + '</b></div>';
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
    setHTML(el.tools, scene() === 'map' ? '<div class="zoom"><button data-act="zoom" data-f="1.5" aria-label="放大">＋</button><button data-act="zoom" data-f="0.667" aria-label="縮小">−</button><button data-act="whole" aria-label="顯示全島">全島</button></div>' : '');
  }
  function render() {
    if (!el.hud) return;
    var sc = scene();
    if (el.scene.getAttribute('data-scene') !== sc) { el.scene.setAttribute('data-scene', sc); if (sc === 'map') setTimeout(mapResize, 0); }
    renderHud(); renderTools(); renderPanel();
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
    var a = b.getAttribute('data-act'), me = S.me;
    if (a === 'tab') { S.tab = b.getAttribute('data-tab'); if (S.tab === 'map' && me) { S.zone = S.zone || me.hex; focusHex(G.byId[me.hex], 2.6); } render(); }
    else if (a === 'pick') {
      var id = b.getAttribute('data-t'), c = G.centroid[id], h = Geo.nearestHex(c[0], c[1]);
      var list = G.regions[id].map(function (x) { return G.byId[x]; }).sort(function (p, q) { return Math.hypot(p.x - c[0], p.y - c[1]) - Math.hypot(q.x - c[0], q.y - c[1]); });
      h = list[0]; S.zone = h.id; focusHex(h, 1.8); render();
    }
    else if (a === 'join') {
      S.joining = true; render();
      Net.join({ owner: S.form.owner, name: S.form.name, tribe: G.byId[S.zone].tribe, hex: S.zone }, function (r) {
        S.joining = false;
        if (!r.ok) { toast(r.msg, true); render(); return; }
        S.tab = 'build'; S.selTile = null; toast('部落建立了。先蓋幾間家屋，讓更多族人住進來。'); render();
      });
    }
    else if (a === 'zoom') { var r = el.msvg.getBoundingClientRect(); zoomAt(+b.getAttribute('data-f'), r.left + r.width / 2, r.top + r.height / 2); }
    else if (a === 'whole') { MV.k = 1; MV.cx = Geo.MAP_W / 2; MV.cy = Geo.MAP_H / 2; mapApply(); }
    else if (a === 'upgrade') act({ type: 'upgrade', tile: +b.getAttribute('data-tile') }, '開始施工');
    else if (a === 'build') act({ type: 'build', tile: +b.getAttribute('data-tile'), type2: b.getAttribute('data-type') }, '開始興建');
    else if (a === 'auto') act({ type: 'auto', on: b.checked });
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
