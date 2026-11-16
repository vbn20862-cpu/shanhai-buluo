/* 山海部落 — 後台的操作邏輯（總覽、數值調整、模擬對戰、操作紀錄）。
 * 獨立成檔案是為了讓瀏覽器的安全設定（只執行自己網站上的程式檔）也能套用在後台。 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, key = '', data = null, sort = { k: 'prosperity', dir: -1 }, timer = null, mapReady = false;
  var R = World.rules, tab = 'overview', draft = {}, tuneSig = '', simRes = null, adjId = null, armed = {}, toastT = null;
  var TABS = [['overview', '總覽'], ['tune', '數值調整'], ['sim', '模擬對戰'], ['ops', '營運'], ['log', '操作紀錄']];
  var restoreName = '', tunePending = null;
  var PACES = [[1, '快速試玩'], [5, '加速測試'], [20, '正式']];
  var SIMPRE = [['標準', 4, 4, 4, 1, ''], ['沒有獨特兵種', 6, 6, 0, 1, ''], ['獨特兵種為主', 2, 2, 8, 1, ''], ['大隊加工事', 6, 6, 6, 2, '1'], ['沒有圍籬的小隊', 3, 3, 3, 0, '']];
  var COLS = [['name', '部落', 'l'], ['owner', '主人', 'l'], ['tribe', '族群', 'l'], ['online', '狀態', 'l'], ['center', '中心等級'], ['pop', '族人'], ['food', '小米'], ['wood', '木頭'], ['stone', '石頭'], ['meat', '肉'], ['sp', '特產'],
    ['land', '開墾地'], ['buildings', '建築'], ['army', '戰士'], ['quest', '任務'], ['prosperity', '繁榮'], ['idle', '掛機', 'l'], ['seen', '最後上線', 'l']];
  var FOCUS = { even: '平均', food: '小米', mat: '平均', special: '特產' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(v) { try { if (v === undefined) return sessionStorage.getItem('shanhai_admin') || ''; if (v) sessionStorage.setItem('shanhai_admin', v); else sessionStorage.removeItem('shanhai_admin'); } catch (e) { return ''; } }
  function when(t, now) { var m = Math.round((now - t) / 60000); return m < 1 ? '剛剛' : m < 60 ? m + ' 分鐘前' : m < 1440 ? Math.floor(m / 60) + ' 小時前' : Math.floor(m / 1440) + ' 天前'; }

  function load() {
    return fetch('admin/api/state', { headers: { 'x-admin-key': key }, cache: 'no-store' }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || '讀取失敗'); return j; });
    });
  }
  function post(url, body) {   // 後台的寫入動作：帶密碼、內容是 JSON
    return fetch(url, { method: 'POST', headers: { 'x-admin-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || '沒有成功'); return j; });
    });
  }
  function toast(msg, bad) {
    var t = $('toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200);
  }
  /* 需要按兩次才會執行的按鈕（影響所有玩家的動作）：第一次按只是把字換成確認的問句 */
  function twice(btn, id, ask, run) {
    if (armed[id] && Date.now() < armed[id]) { armed[id] = 0; btn.textContent = btn.getAttribute('data-label'); return run(); }
    armed[id] = Date.now() + 4000; if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', btn.textContent); btn.textContent = ask;
    setTimeout(function () { if (armed[id] && Date.now() >= armed[id]) { armed[id] = 0; btn.textContent = btn.getAttribute('data-label'); } }, 4100);
  }
  function fmt(x) { return String(+(+x).toFixed(4)); }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function fail(msg) { clearInterval(timer); $('dash').hidden = true; $('out').hidden = true; $('login').hidden = false; $('err').textContent = msg; $('err').hidden = false; }
  function start() {
    load().then(function (j) {
      store(key); data = j; $('login').hidden = true; $('dash').hidden = false; $('out').hidden = false; $('err').hidden = true; render();
      clearInterval(timer);
      timer = setInterval(function () { load().then(function (x) { data = x; render(); }).catch(function (e) { $('stamp').textContent = '更新失敗：' + e.message; }); }, 3000);   // 數值調整的欄位在有修改時不會被重畫
    }).catch(function (e) { store(''); fail(e.message === 'Failed to fetch' ? '連不上伺服器' : e.message); });
  }
  function render() {
    renderNav(); renderTune(false); renderLog(); renderHealth(); renderOps();
    var v = data.villages, players = v.filter(function (x) { return !x.bot; }), live = players.filter(function (x) { return x.online; });
    $('stamp').textContent = '每 3 秒更新 · ' + new Date(data.now).toLocaleTimeString('zh-TW') + ' · 遊戲節奏 ' + data.tune.pace + (data.speed !== 1 ? ' · 測試加速 ' + data.speed + ' 倍' : '');
    $('tiles').innerHTML = [['玩家部落', players.length], ['在線上', live.length], ['示範部落', v.length - players.length], ['出征中的隊伍', data.marches], ['打過的對戰', Object.keys(data.stats || {}).reduce(function (n, k) { return n + data.stats[k].n; }, 0)], ['資源點（採集中）', data.nodes + '（' + data.gathering + '）'], ['聯盟', (data.alliances || []).length], ['市集掛單', data.offers]]
      .map(function (t) { return '<div class="tile"><b>' + t[1] + '</b><span>' + t[0] + '</span></div>'; }).join('');
    $('tribes').innerHTML = Tribes.playable().map(function (t) {
      var s = data.tribes[t.id] || { players: 0, online: 0, bots: 0, avg: 0 };
      return '<tr><td><span class="dot" style="background:' + t.color + '"></span>' + t.zh + '</td><td>' + s.players + '</td><td>' + s.online + '</td><td>' + s.bots + '</td><td>' + (s.players ? s.avg : '—') + '</td></tr>';
    }).join('');
    var keys = Object.keys(data.stats || {}).sort();
    $('fights').innerHTML = keys.length ? keys.map(function (k) {
      var p = k.split('>'), s = data.stats[k], a = Tribes.get(p[0]), d = Tribes.get(p[1]);
      return '<tr><td><span class="dot" style="background:' + a.color + '"></span>' + a.zh + '</td><td class="l"><span class="dot" style="background:' + d.color + '"></span>' + d.zh + '</td><td>' + s.n + '</td><td>' + s.win + '</td><td>' + Math.round(s.win / s.n * 100) + '%</td></tr>';
    }).join('') : '<tr><td class="l muted" colspan="5">還沒有對戰紀錄。</td></tr>';
    var rk = Object.keys(data.rel || {}).sort();
    $('rels').innerHTML = rk.length ? rk.map(function (k) {
      var p = k.split('|'), x = Tribes.get(p[0]), y = Tribes.get(p[1]), v = data.rel[k];
      return '<tr><td><span class="dot" style="background:' + x.color + '"></span>' + x.zh + '</td><td class="l"><span class="dot" style="background:' + y.color + '"></span>' + y.zh + '</td><td>' + v + '</td><td class="l ' + (v >= 20 ? 'on' : v <= -20 ? 'off' : '') + '">' + (v >= 20 ? '友好' : v <= -20 ? '敵對' : '中立') + '</td></tr>';
    }).join('') : '<tr><td class="l muted" colspan="4">各族之間目前都是中立。</td></tr>';
    $('heads').innerHTML = COLS.map(function (c) { return '<th class="' + (c[2] || '') + '"><button data-k="' + c[0] + '" aria-pressed="' + (sort.k === c[0]) + '">' + c[1] + (sort.k === c[0] ? (sort.dir < 0 ? ' ▼' : ' ▲') : '') + '</button></th>'; }).join('') + '<th class="l">微調</th>';
    var rows = v.filter(function (x) { return $('bots').checked || !x.bot; }).sort(function (a, b) {
      var x = a[sort.k], y = b[sort.k]; if (sort.k === 'idle') { x = a.idle.focus; y = b.idle.focus; }
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
    $('count').textContent = '共 ' + rows.length + ' 個';
    $('rows').innerHTML = rows.length ? rows.map(function (r) {
      var t = Tribes.get(r.tribe);
      return '<tr><td class="l">' + esc(r.name) + '</td><td class="l' + (r.bot ? ' bot' : '') + '">' + esc(r.owner) + '</td><td class="l"><span class="dot" style="background:' + t.color + '"></span>' + t.zh + '</td>' +
        '<td class="l ' + (r.bot ? 'bot' : r.online ? 'on' : 'off') + '">' + (r.bot ? '示範' : r.online ? '在線上' : '離線') + '</td><td>' + r.center + '</td><td>' + r.pop + '/' + r.popCap + '</td><td>' + r.food + '</td><td>' + r.wood + '</td><td>' + r.stone + '</td><td>' + r.meat + '</td><td>' + r.sp + '</td>' +
        '<td>' + r.land + '</td><td>' + r.buildings + '</td><td>' + r.army + '</td><td>' + r.quest + '/5</td><td>' + r.prosperity + '</td><td class="l">' + FOCUS[r.idle.focus] + (r.idle.upgrade ? '・自動升級' : '') + (r.idle.gather !== false ? '・自動採集' : '') + '</td><td class="l">' + (r.online || r.bot ? '—' : when(r.seen, data.now)) + '</td><td class="l"><button class="btn sm ghost" data-adj="' + esc(r.id) + '">調整</button></td></tr>';
    }).join('') : '<tr><td class="l muted" colspan="' + (COLS.length + 1) + '">還沒有玩家建立部落。勾選「顯示示範部落」可以看到電腦的示範部落。</td></tr>';
    drawMap(v);
  }
  // ---------- 分頁 ----------
  function renderNav() {
    $('nav').innerHTML = TABS.map(function (t) { return '<button data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + (t[0] === 'tune' && Object.keys(draft).length ? '（' + Object.keys(draft).length + ' 項沒套用）' : '') + '</button>'; }).join('');
    TABS.forEach(function (t) { $('p-' + t[0]).hidden = tab !== t[0]; });
  }
  // ---------- 數值調整：欄位由規則裡的 TUNE_DEF 自動產生 ----------
  function renderTune(force) {
    var sig = JSON.stringify(data.tune);
    $('paceNow').textContent = data.tune.pace + (PACES.filter(function (p) { return p[0] === data.tune.pace; })[0] ? '（' + PACES.filter(function (p) { return p[0] === data.tune.pace; })[0][1] + '）' : '');
    if (!force && (sig === tuneSig || Object.keys(draft).length)) return dirtyState();   // 正在改的時候不要重畫，免得打到一半的字不見
    tuneSig = sig;
    if (!$('paces').innerHTML) $('paces').innerHTML = PACES.map(function (p) { return '<button class="btn ghost" data-pace="' + p[0] + '">' + p[1] + '（' + p[0] + '）</button>'; }).join('');
    var groups = [], by = {};
    R.TUNE_DEF.forEach(function (d) { if (!by[d.g]) { by[d.g] = []; groups.push(d.g); } by[d.g].push(d); });
    $('groups').innerHTML = groups.map(function (g) {
      return '<section class="card"><h2>' + esc(g) + '</h2>' + by[g].map(function (d) {
        var cur = draft[d.k] != null ? draft[d.k] : data.tune[d.k];
        return '<div class="trow' + (draft[d.k] != null ? ' chg' : '') + (d.k !== 'pace' && data.tune[d.k] !== d.def ? ' off' : '') + '" id="row-' + d.k + '"><label for="t-' + d.k + '">' + esc(d.zh) + '</label>' +
          '<input type="number" id="t-' + d.k + '" data-k="' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + fmt(cur) + '" inputmode="decimal">' +
          '<span class="def">' + (d.k === 'pace' ? '正式 20' : '預設 ' + fmt(d.def)) + '</span>' + (d.note ? '<p class="tnote">' + esc(d.note) + '</p>' : '') + '</div>';
      }).join('') + '</section>';
    }).join('');
    dirtyState();
  }
  function dirtyState() {
    var n = Object.keys(draft).length;
    $('apply').disabled = !n; $('discard').disabled = !n; $('trysim').disabled = !n;
    $('dirty').textContent = n ? '有 ' + n + ' 項修改還沒套用（金色的欄位）。套用後所有玩家馬上生效。' : '';
    $('s-draft').disabled = !n; if (!n) $('s-draft').checked = false;
    $('simnote').textContent = n ? '' : '用的是目前生效的數值。';
  }
  function tuneInput(e) {
    var inp = e.target.closest('input[data-k]'); if (!inp) return;
    var k = inp.getAttribute('data-k'), d = R.TUNE_DEF.filter(function (x) { return x.k === k; })[0], x = parseFloat(inp.value);
    if (!isFinite(x) || inp.value === '') delete draft[k];
    else { x = Math.max(d.min, Math.min(d.max, x)); if (x === data.tune[k]) delete draft[k]; else draft[k] = x; }
    $('row-' + k).classList.toggle('chg', draft[k] != null);
    dirtyState(); renderNav();
  }
  function applyTune(body, okMsg) {
    return post('admin/api/tune', body).then(function (j) {
      data.tune = j.tune; draft = {}; renderTune(true); renderNav();
      toast(j.changed.length ? okMsg + '（' + j.changed.length + ' 項）' : '數值沒有變動');
      return load().then(function (x) { data = x; render(); });
    }).catch(function (e) { toast(e.message, true); });
  }
  // ---------- 模擬對戰（在瀏覽器裡跑，和伺服器用同一份規則） ----------
  function simParams() {
    var n = function (id, max) { return Math.max(0, Math.min(max, Math.round(+$(id).value || 0))); };
    return { n: +$('s-n').value, army: { w: n('s-w', 30), a: n('s-a', 30), u: n('s-u', 30) }, wall: n('s-wall', 5), hero: $('s-hero').checked, uniq: $('s-ub').checked,
      towers: $('s-tw').value.split(/[^0-9]+/).filter(Boolean).slice(0, 6).map(function (x) { return Math.max(1, Math.min(5, +x)); }) };
  }
  function runSim() {
    var p = simParams(), useDraft = $('s-draft').checked && Object.keys(draft).length > 0;
    if (p.army.w + p.army.a + p.army.u < 1) return toast('至少要有一個人', true);
    $('simrun').disabled = true; $('simnote').textContent = '計算中⋯⋯';
    setTimeout(function () {
      var saved = {}, k; for (k in R.TUNE) saved[k] = R.TUNE[k];
      R.setTune(data.tune); if (useDraft) R.setTune(draft);
      var t0 = Date.now(), m;
      try { m = R.simMatrix(p); } finally { R.setTune(saved); }
      simRes = { m: m, draft: useDraft, ms: Date.now() - t0 };
      $('simrun').disabled = false; renderSim(); dirtyState();
    }, 30);
  }
  function renderSim() {
    if (!simRes) return;
    var m = simRes.m, ids = Tribes.playable().map(function (t) { return t.id; }), nm = function (id) { var t = Tribes.get(id); return '<span class="dot" style="background:' + t.color + '"></span>' + t.zh; };
    var pair = {}; m.pairs.forEach(function (p) { pair[p.a + '>' + p.d] = p; });
    var cls = function (s) { return Math.abs(s - 0.5) <= 0.05 ? 'cellok' : 'cellbad'; };
    var h = '<section class="card"><h2>結果' + (simRes.draft ? '（包含還沒套用的修改）' : '') + '</h2>' +
      '<p class="verdict ' + (m.ok ? 'ok' : 'bad') + '">' + (m.ok ? '任兩族之間都在 45%～55% 之內。' : '有組合超出 45%～55%，建議調整數值。') + '最大偏差 ' + pct(m.worst) + '。</p>' +
      '<p class="muted">每一組 ' + m.n + ' 場 · 勇士約 ' + m.army.w + '、弓手約 ' + m.army.a + '、獨特兵種約 ' + m.army.u + '（各自上下浮動三成）· 圍籬 ' + m.wall + ' 級' + (m.towers.length ? ' · 瞭望台 ' + m.towers.join('、') + ' 級' : '') +
      (m.hero ? '' : ' · 沒有英雄') + (m.uniq ? '' : ' · 沒有獨特建築') + ' · 進攻方平均勝率 ' + pct(m.base) + ' · 花了 ' + (simRes.ms / 1000).toFixed(1) + ' 秒</p>' +
      '<p class="muted">因為是隨機打的，每次結果會有一點出入：這個場數下，每個數字大約有 ±' + (2 * Math.sqrt(0.125 / m.n) * 100).toFixed(1) + ' 個百分點的誤差。數字剛好在邊緣時，用 5000 場再跑一次比較準。</p></section><div class="simgrid">';
    h += '<section class="card"><h2>兩族之間的整體勝率</h2><div class="scroll"><table><thead><tr><th>這一族</th><th class="l">對上</th><th>整體勝率</th><th class="l">判定</th></tr></thead><tbody>' +
      m.duel.map(function (d) { return '<tr><td>' + nm(d.x) + '</td><td class="l">' + nm(d.y) + '</td><td class="' + cls(d.score) + '">' + pct(d.score) + '</td><td class="l ' + cls(d.score) + '">' + (Math.abs(d.score - 0.5) <= 0.05 ? '在範圍內' : d.score > 0.5 ? '前者偏強' : '後者偏強') + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="muted">整體勝率 = 前者進攻後者的勝率，加上後者進攻時前者守住的機率，除以二。50% 就是勢均力敵。</p></section>';
    h += '<section class="card"><h2>各族總評</h2><div class="scroll"><table><thead><tr><th>族群</th><th>對其他族的整體勝率</th><th>進攻成功</th><th>防守成功</th></tr></thead><tbody>' +
      m.tribes.map(function (t) { return '<tr><td>' + nm(t.id) + '</td><td class="' + cls(t.score) + '">' + pct(t.score) + '</td><td>' + pct(t.atk) + '</td><td>' + pct(t.def) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="muted">進攻和防守不一樣高是各族的特色（有的擅長進攻、有的擅長防守），只要整體勝率接近 50% 就算公平。</p></section>';
    h += '<section class="card"><h2>進攻方勝率明細</h2><div class="scroll"><table><thead><tr><th>進攻＼防守</th>' + ids.map(function (d) { return '<th>' + Tribes.get(d).zh + '</th>'; }).join('') + '</tr></thead><tbody>' +
      ids.map(function (x) { return '<tr><td>' + nm(x) + '</td>' + ids.map(function (y) { return '<td' + (x === y ? ' class="self"' : '') + '>' + pct(pair[x + '>' + y].win) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muted">橫列是進攻的族，直欄是防守的族。灰色是同族對打。</p></section></div>';
    $('simout').innerHTML = h;
  }
  // ---------- 伺服器的健康狀況 ----------
  function span(ms) { var m = Math.floor(ms / 60000); return m < 60 ? m + ' 分鐘' : m < 1440 ? Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分' : Math.floor(m / 1440) + ' 天 ' + Math.floor(m % 1440 / 60) + ' 小時'; }
  function renderHealth() {
    var s = data.server; if (!s) return;
    var rows = [['已經運作', span(s.upMs)], ['記憶體', s.memMB + ' MB'], ['目前連線', s.sockets + ' 個'], ['每秒送出', (s.outPerSec / 1024).toFixed(1) + ' KB'],
      ['上次存檔', s.savedAt ? when(s.savedAt, data.now) + '（' + s.savedKB + ' KB）' : '還沒有'], ['備份', s.backups + ' 份' + (s.lastBackup ? '，' + when(s.lastBackup, data.now) : '')]];
    $('health').innerHTML = rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('');
    $('limits').textContent = '每 ' + s.backupHours + ' 小時自動備份 · 玩家部落上限 ' + s.limits.villages + ' · ' + (s.limits.needCode ? '需要邀請碼' : '不需要邀請碼（公開）') + ' · 同一個網路位置每小時最多建立 ' + s.limits.joinsPerHour + ' 個部落';
  }
  function download() {   // 下載存檔：要帶密碼，所以用程式抓下來再存成檔案
    fetch('admin/api/export', { headers: { 'x-admin-key': key }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('下載失敗');
      var name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [0, 'shanhai-world.json'])[1];
      return r.blob().then(function (b) { var u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); toast('存檔下載好了：' + name); });
    }).catch(function (e) { toast(e.message, true); });
  }
  // ---------- 操作紀錄 ----------
  /* 營運：公告、備份還原、數值匯出匯入、封鎖來源。表單的欄位寫在 admin.html，這裡只重畫會變的清單（每 3 秒更新時不會清掉正在打的字） */
  function hoursText(until, now) { return !until ? '一直到撤下' : until <= now ? '已經到期' : '還有 ' + span(until - now); }
  function renderOps() {
    var now = data.now, n = data.notice;
    $('noticeNow').innerHTML = n ? '目前的公告（' + hoursText(n.until, now).replace('一直到撤下', '一直顯示到撤下') + '）：<b>' + esc(n.text) + '</b>' : '目前沒有公告。';
    $('n-clear').disabled = !n;
    var bk = data.backupInfo || [];
    $('bk-rows').innerHTML = bk.length ? bk.map(function (b) {
      var m = /^world-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})?/.exec(b.name), t = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))) : null;
      return '<tr><td class="l">' + (t ? t.toLocaleString('zh-TW') : esc(b.name)) + '</td><td>' + b.kb + ' KB</td><td>' + (b.bad ? '讀不出來' : b.villages) + '</td><td>' + (b.bad ? '—' : b.players) + '</td><td class="l">' + (b.bad ? '' : '<button class="btn sm ghost" data-restore="' + esc(b.name) + '">還原這份</button>') + '</td></tr>';
    }).join('') : '<tr><td class="l muted" colspan="5">還沒有備份。可以在「總覽」按「現在備份一次」。</td></tr>';
    var src = data.sources || [];
    $('src-rows').innerHTML = src.length ? src.map(function (x) {
      return '<tr><td class="l">' + esc(x.ip) + '</td><td>' + x.n + '</td><td class="l">' + (x.villages.length ? x.villages.map(esc).join('、') : '<span class="muted">還沒有部落（在開始畫面）</span>') + '</td><td class="l"><button class="btn sm ghost" data-block="' + esc(x.ip) + '">封鎖</button></td></tr>';
    }).join('') : '<tr><td class="l muted" colspan="4">目前沒有人連線。</td></tr>';
    var bl = data.blocks || [];
    $('blk-rows').innerHTML = bl.length ? bl.map(function (x) {
      return '<tr><td class="l">' + esc(x.ip) + '</td><td class="l">' + esc(x.note || '') + '</td><td class="l">' + (x.until ? '還有 ' + span(Math.max(0, x.until - now)) : '永久') + '</td><td class="l"><button class="btn sm ghost" data-unblock="' + esc(x.ip) + '">解除</button></td></tr>';
    }).join('') : '<tr><td class="l muted" colspan="4">沒有封鎖任何來源。</td></tr>';
  }
  function exportTune() {   // 只匯出可調的數值
    var o = { game: 'shanhai-buluo', kind: 'tune', at: new Date().toISOString(), tune: data.tune }, b = new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' });
    var u = URL.createObjectURL(b), l = document.createElement('a'), d = new Date(), p2 = function (x) { return ('0' + x).slice(-2); };
    l.href = u; l.download = 'shanhai-tune-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json'; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000); toast('數值匯出好了');
  }
  function importTune(file) {   // 讀檔案、列出會改的數值，確認後才送出
    if (!file) return;
    if (file.size > 64 * 1024) { toast('檔案太大了，這不是數值檔', true); return; }
    file.text().then(function (txt) {
      var o; try { o = JSON.parse(txt); } catch (e) { throw new Error('檔案不是正確的 JSON'); }
      var t = o && typeof o === 'object' && o.tune && typeof o.tune === 'object' ? o.tune : o;
      if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error('檔案裡找不到數值');
      var set = {}, rows = [], skipped = 0;
      R.TUNE_DEF.forEach(function (d) {
        if (!Object.prototype.hasOwnProperty.call(t, d.k)) return;
        var x = Number(t[d.k]); if (!isFinite(x)) { skipped++; return; }
        x = Math.max(d.min, Math.min(d.max, x));
        if (x !== data.tune[d.k]) { set[d.k] = x; rows.push('<tr><td class="l">' + esc(d.g) + '：' + esc(d.zh) + '</td><td>' + fmt(data.tune[d.k]) + '</td><td>' + fmt(x) + '</td></tr>'); }
      });
      Object.keys(t).forEach(function (k) { if (!R.TUNE_DEF.some(function (d) { return d.k === k; })) skipped++; });
      tunePending = set;
      $('t-sum').textContent = rows.length ? '匯入後有 ' + rows.length + ' 項數值會改變' + (skipped ? '（另有 ' + skipped + ' 項不認得或格式不對，會略過）' : '') + '：' : '檔案裡的數值和現在一樣，不用匯入。';
      $('t-rows').innerHTML = rows.join(''); $('t-apply').disabled = !rows.length; $('t-preview').hidden = false;
    }).catch(function (e) { toast(e.message, true); });
  }
  function renderLog() {
    var L = (data.adminLog || []).slice().reverse();
    $('logs').innerHTML = L.length ? L.map(function (x) { return '<div class="logrow"><span class="muted">' + new Date(x.t).toLocaleString('zh-TW') + '</span><span>' + esc(x.text) + '</span></div>'; }).join('') : '<p class="muted">還沒有任何調整。</p>';
  }
  // ---------- 個別部落的微調 ----------
  function openAdj(id) {
    var r = data.villages.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    adjId = id;
    $('adjT').textContent = '調整「' + r.name + '」';
    $('adjNow').textContent = Tribes.get(r.tribe).zh + ' · 主人 ' + r.owner + ' · 現在小米 ' + r.food + '、木頭 ' + r.wood + '、石頭 ' + r.stone + '、肉 ' + r.meat + '、自己的特產 ' + r.sp + '（倉庫容量 ' + r.cap + '）';
    $('j-spk').innerHTML = Tribes.playable().map(function (t) { return '<option value="' + t.id + '"' + (t.id === r.tribe ? ' selected' : '') + '>' + t.sp.zh + '（' + t.zh + '）</option>'; }).join('');
    ['j-food', 'j-wood', 'j-stone', 'j-meat', 'j-spn', 'j-sh'].forEach(function (i) { $(i).value = ''; });
    $('r-name').value = r.name; $('r-owner').value = r.owner; armed.rem = 0; $('remB').textContent = '移除部落';
    $('adj').showModal();
  }
  function sendAdj(e) {
    e.preventDefault();
    var body = { id: adjId, food: +$('j-food').value || 0, wood: +$('j-wood').value || 0, stone: +$('j-stone').value || 0, meat: +$('j-meat').value || 0, sp: {} };
    if (+$('j-spn').value) body.sp[$('j-spk').value] = +$('j-spn').value;
    if ($('j-sh').value !== '') body.shieldMin = +$('j-sh').value;
    post('admin/api/adjust', body).then(function (j) {
      if (!j.ok) return toast(j.msg, true);
      $('adj').close(); toast('已調整：' + j.msg);
      return load().then(function (x) { data = x; render(); });
    }).catch(function (er) { toast(er.message, true); });
  }
  function village(body, okMsg) {   // 改名或移除
    post('admin/api/village', body).then(function (j) {
      if (!j.ok) return toast(j.msg, true);
      $('adj').close(); toast(okMsg + j.msg);
      return load().then(function (x) { data = x; render(); });
    }).catch(function (er) { toast(er.message, true); });
  }
  function drawMap(v) {
    var svg = $('map');
    if (!mapReady) {
      svg.setAttribute('viewBox', '0 0 ' + Geo.MAP_W + ' ' + Geo.MAP_H);
      svg.innerHTML = '<image width="' + Geo.MAP_W + '" height="' + Geo.MAP_H + '" href="' + Art.paintMap(3).toDataURL('image/png') + '" preserveAspectRatio="none"/><g id="marks"></g>';
      mapReady = true;
    }
    $('marks').innerHTML = v.map(function (p) {
      var live = p.online && !p.bot;
      return '<circle cx="' + p.pos[0] + '" cy="' + p.pos[1] + '" r="' + (live ? 3.4 : 2.6) + '" fill="' + Tribes.get(p.tribe).color + '" class="' + (live ? 'live' : '') + '"><title>' + esc(p.name) + '</title></circle>';
    }).join('');
  }
  $('form').addEventListener('submit', function (e) { e.preventDefault(); key = $('key').value; if (key) start(); });
  $('out').addEventListener('click', function () { key = ''; store(''); $('key').value = ''; fail(''); $('err').hidden = true; });
  $('bots').addEventListener('change', function () { if (data) render(); });
  $('nav').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (!b) return; tab = b.getAttribute('data-tab'); renderNav(); if (tab === 'sim') { renderSim(); dirtyState(); } });
  $('groups').addEventListener('input', tuneInput);
  $('apply').addEventListener('click', function () { if (Object.keys(draft).length) applyTune({ set: draft }, '已套用'); });
  $('discard').addEventListener('click', function () { draft = {}; renderTune(true); renderNav(); });
  $('trysim').addEventListener('click', function () { tab = 'sim'; renderNav(); $('s-draft').disabled = false; $('s-draft').checked = true; runSim(); });
  $('resetAll').addEventListener('click', function () { var b = this; twice(b, 'reset', '再按一次，確定全部還原', function () { applyTune({ reset: true }, '已還原成預設'); }); });
  $('paces').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pace]'); if (!b) return; var p = +b.getAttribute('data-pace');
    if (p === data.tune.pace) return toast('現在就是這個節奏');
    twice(b, 'pace' + p, '再按一次，切換成節奏 ' + p, function () { applyTune({ set: { pace: p } }, '遊戲節奏已改成 ' + p); });
  });
  $('simpre').innerHTML = SIMPRE.map(function (s, i) { return '<button class="btn sm ghost" data-pre="' + i + '">' + s[0] + '</button>'; }).join('');
  $('simpre').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pre]'); if (!b) return; var s = SIMPRE[+b.getAttribute('data-pre')];
    $('s-w').value = s[1]; $('s-a').value = s[2]; $('s-u').value = s[3]; $('s-wall').value = s[4]; $('s-tw').value = s[5]; runSim();
  });
  $('simrun').addEventListener('click', runSim);
  $('rows').addEventListener('click', function (e) { var b = e.target.closest('button[data-adj]'); if (b) openAdj(b.getAttribute('data-adj')); });
  $('adjF').addEventListener('submit', sendAdj);
  $('adjX').addEventListener('click', function () { $('adj').close(); });
  $('renF').addEventListener('submit', function (e) { e.preventDefault(); village({ id: adjId, action: 'rename', name: $('r-name').value, owner: $('r-owner').value }, ''); });
  $('remB').addEventListener('click', function () { var b = this; twice(b, 'rem', '再按一次，確定移除（不能復原）', function () { village({ id: adjId, action: 'remove' }, ''); }); });
  $('exportB').addEventListener('click', download);
  $('n-text').addEventListener('input', function () { $('n-count').textContent = this.value.length + ' / 200 字'; });
  $('n-send').addEventListener('click', function () {
    var text = $('n-text').value.trim(); if (!text) { toast('公告不能是空的', true); return; }
    post('admin/api/notice', { text: text, hours: +$('n-hours').value }).then(function (j) { toast(j.msg || '發出去了'); $('n-text').value = ''; $('n-count').textContent = ''; return load().then(function (x) { data = x; render(); }); }).catch(function (e) { toast(e.message, true); });
  });
  $('n-clear').addEventListener('click', function () { var b = this; twice(b, 'nclear', '再按一次，確定撤下', function () { post('admin/api/notice', { clear: true }).then(function (j) { toast(j.msg || '撤下了'); return load().then(function (x) { data = x; render(); }); }).catch(function (e) { toast(e.message, true); }); }); });
  $('bk-rows').addEventListener('click', function (e) { var b = e.target.closest('button[data-restore]'); if (!b) return; restoreName = b.getAttribute('data-restore'); $('bk-name').textContent = b.closest('tr').firstChild.textContent; $('bk-word').value = ''; $('bk-confirm').hidden = false; $('bk-word').focus(); });
  $('bk-x').addEventListener('click', function () { restoreName = ''; $('bk-confirm').hidden = true; });
  $('bk-go').addEventListener('click', function () {
    if ($('bk-word').value.trim() !== '還原') { toast('要打「還原」兩個字確認', true); return; }
    post('admin/api/restore', { name: restoreName, confirm: '還原' }).then(function (j) { toast(j.msg || '還原好了'); restoreName = ''; $('bk-confirm').hidden = true; return load().then(function (x) { data = x; draft = {}; render(); renderTune(true); }); }).catch(function (e) { toast(e.message, true); });
  });
  $('t-export').addEventListener('click', exportTune);
  $('t-file').addEventListener('change', function () { importTune(this.files && this.files[0]); this.value = ''; });
  $('t-cancel').addEventListener('click', function () { tunePending = null; $('t-preview').hidden = true; });
  $('t-apply').addEventListener('click', function () { if (!tunePending) return; var set = tunePending; applyTune({ set: set }, '匯入的數值已套用').then(function () { tunePending = null; $('t-preview').hidden = true; }); });
  $('src-rows').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-block]'); if (!b) return;
    var ip = b.getAttribute('data-block');
    twice(b, 'blk' + ip, '再按一次，確定封鎖', function () { post('admin/api/block', { ip: ip, hours: +$('b-hours').value }).then(function (j) { toast(j.msg); return load().then(function (x) { data = x; render(); }); }).catch(function (er) { toast(er.message, true); }); });
  });
  $('blk-rows').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-unblock]'); if (!b) return;
    post('admin/api/block', { ip: b.getAttribute('data-unblock'), unblock: true }).then(function (j) { toast(j.msg); return load().then(function (x) { data = x; render(); }); }).catch(function (er) { toast(er.message, true); });
  });
  $('backupB').addEventListener('click', function () { post('admin/api/backup', {}).then(function (j) { toast('備份好了，現在有 ' + j.backups.length + ' 份'); return load().then(function (x) { data = x; render(); }); }).catch(function (e) { toast(e.message, true); }); });
  $('heads').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var k = b.getAttribute('data-k'); sort = { k: k, dir: sort.k === k ? -sort.dir : (k === 'name' || k === 'owner' || k === 'tribe' ? 1 : -1) }; render();
  });
  key = store(); if (key) start();
})();
