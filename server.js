/* 山海部落 — 遊戲伺服器
 * 送出遊戲網頁、讓所有玩家連到同一個世界，並定時存檔。伺服器是唯一的裁判，規則都在 shared/world.js。
 *
 * 可用的設定（環境變數）：
 *   PORT            連接埠，預設 3000
 *   ADMIN_PASSWORD  後台密碼；沒有設定時後台不開放
 *   CONTACT_TEXT    顯示在遊戲裡「關於這個遊戲」最後的一句話，例如意見回饋的管道（可以不設）
 *   JOIN_CODE       邀請碼；有設定時，要輸入邀請碼才能建立部落（公開測試用）
 *   MAX_VILLAGES    玩家部落的數量上限，預設 300
 *   DATA_FILE       存檔位置，預設 data/world.json。放在主機服務上時，要指到不會被清掉的硬碟，例如 /data/world.json
 *   BACKUP_HOURS    每隔幾小時多留一份備份，預設 6；BACKUP_KEEP 留幾份，預設 8（放在存檔旁邊的 backups 資料夾）
 *   MAX_CONN_PER_IP 同一個網路位置最多幾個連線，預設 20；JOINS_PER_HOUR 同一個網路位置每小時最多建立幾個新部落，預設 5
 *   MAX_SOCKETS     全部連線的上限，預設 2000
 *   TRUST_PROXY     伺服器前面有代理（例如 Railway）時設為 1，才會用代理告知的來源位置；在 Railway 上會自動開啟
 *   PACE            遊戲節奏，預設 20（正式）。1 是快速試玩。只在存檔裡還沒有設定時使用；之後在後台調整，會記在存檔裡
 *   SPEED           整體加速倍率，測試用，預設 1（連對戰的讀秒也會加速，正式環境不要設） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Server } = require('socket.io');
const World = require('./shared/world.js');

const PORT = process.env.PORT || 3000;
const ADMIN = process.env.ADMIN_PASSWORD || '';
const JOIN_CODE = (process.env.JOIN_CODE || '').trim();
const CONTACT = String(process.env.CONTACT_TEXT || '').replace(/[<>]/g, '').trim().slice(0, 200);   // 顯示在「關於這個遊戲」最後的一句話，例如意見回饋的管道
const MAX_VILLAGES = Number(process.env.MAX_VILLAGES) || 300;
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP) || 20, JOINS_PER_HOUR = Number(process.env.JOINS_PER_HOUR) || 5, MAX_SOCKETS = Number(process.env.MAX_SOCKETS) || 2000;
const BACKUP_HOURS = Number(process.env.BACKUP_HOURS) || 6, BACKUP_KEEP = Number(process.env.BACKUP_KEEP) || 8;
const TRUST_PROXY = process.env.TRUST_PROXY ? process.env.TRUST_PROXY !== '0' : !!process.env.RAILWAY_ENVIRONMENT;
const DATA = process.env.DATA_FILE ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'world.json') : path.join(__dirname, 'data', 'world.json'));
const world = new World({
  speed: Number(process.env.SPEED) || 1,
  tune: { pace: process.env.PACE ? Number(process.env.PACE) : 20 },
  reportAfter: process.env.REPORT_AFTER_MS ? Number(process.env.REPORT_AFTER_MS) : undefined,
  newbieMs: process.env.NEWBIE_MS ? Number(process.env.NEWBIE_MS) : undefined
});

// ---------- 存檔 ----------
const BACKUP_DIR = path.join(path.dirname(DATA), 'backups');
function listBackups() {   // 由新到舊
  try { return fs.readdirSync(BACKUP_DIR).filter(f => /^world-\d{8}-\d{4}\.json$/.test(f)).sort().reverse(); } catch (e) { return []; }
}
try {
  world.load(JSON.parse(fs.readFileSync(DATA, 'utf8')));
  console.log('已讀取存檔：' + Object.keys(world.villages).length + ' 個部落，遊戲節奏 ' + world.tune.pace);
} catch (e) {
  if (e.code !== 'ENOENT') {   // 存檔壞了：改名留著不要蓋掉，再從最新的備份接回來
    const bad = DATA + '.壞掉-' + Date.now();
    try { fs.renameSync(DATA, bad); } catch (x) { /* 改名失敗就維持原狀 */ }
    console.error('存檔讀不出來，已另存為 ' + bad + '。原因：' + e.message);
    let ok = false;
    for (const f of listBackups()) {
      try { world.load(JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8'))); console.error('改用備份 ' + f + '：' + Object.keys(world.villages).length + ' 個部落'); ok = true; break; }
      catch (x) { console.error('備份 ' + f + ' 也讀不出來'); }
    }
    if (!ok) console.error('沒有可用的備份，這次從新的世界開始。');
  }
}
world.ensureBots(Date.now());
const saved = { at: 0, bytes: 0 };
const traffic = { bytes: 0, msgs: 0, perSec: 0, msgsPerSec: 0 };   // 送出去的資料量（壓縮前的估計），給後台看
const backups = { list: [], at: 0 };
let io = null;
function save() {
  try {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    const js = JSON.stringify(world.toJSON());
    fs.writeFileSync(DATA + '.tmp', js);
    fs.renameSync(DATA + '.tmp', DATA);
    saved.at = Date.now(); saved.bytes = js.length;
  } catch (e) { console.error('存檔失敗：' + e.message); }
}

// ---------- 網頁 ----------
const ROOTS = { '/shared/': path.join(__dirname, 'shared'), '/': path.join(__dirname, 'public') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const fileCache = Object.create(null);   // 檔案內容與壓縮後的版本，檔案沒變就重複使用
/* 瀏覽器的安全設定：不讓別的網站把遊戲嵌進去、不猜檔案類型、不外洩來源網址；
 * 網頁只能載入自己網站的程式（外加 Google 字型），降低被塞進惡意程式的風險 */
const SAFE = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
function json(res, code, obj) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SAFE)); res.end(JSON.stringify(obj)); }
function sameKey(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const startedAt = Date.now();
function health() {   // 伺服器的健康狀況，給後台看
  return { upMs: Date.now() - startedAt, memMB: Math.round(process.memoryUsage().rss / 1048576), sockets: io ? io.sockets.sockets.size : 0, outPerSec: traffic.perSec, msgsPerSec: traffic.msgsPerSec,
    savedAt: saved.at, savedKB: Math.round(saved.bytes / 1024), backups: backups.list.length, backupList: backups.list.slice(0, 8), lastBackup: backups.at, backupHours: BACKUP_HOURS, node: process.version,
    limits: { perIp: MAX_CONN_PER_IP, joinsPerHour: JOINS_PER_HOUR, sockets: MAX_SOCKETS, villages: MAX_VILLAGES, needCode: !!JOIN_CODE } };
}
// 後台密碼連續打錯太多次，就先擋一陣子（所有來源一起算，避免被一直猜）
const fails = { n: 0, until: 0 };
function adminOk(req, res) {
  if (!ADMIN) { json(res, 503, { error: '後台沒有開放。啟動伺服器時要設定 ADMIN_PASSWORD。' }); return false; }
  const now = Date.now();
  if (now < fails.until) { json(res, 429, { error: '密碼打錯太多次，請過幾分鐘再試。' }); return false; }
  if (!sameKey(req.headers['x-admin-key'] || '', ADMIN)) {
    if (++fails.n >= 20) { fails.n = 0; fails.until = now + 5 * 60000; }
    json(res, 401, { error: '密碼不對' }); return false;
  }
  fails.n = 0;
  return true;
}
function readJson(req, res, cb) {   // 後台送來的內容：只收 JSON，最多 8 KB
  if (req.method !== 'POST') return json(res, 405, { error: '要用 POST' });
  if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: '內容要是 JSON' });
  let body = '', over = false;
  req.on('data', c => { body += c; if (body.length > 8192) { over = true; req.destroy(); } });
  req.on('end', () => {
    if (over) return;
    let o; try { o = JSON.parse(body || '{}'); } catch (e) { return json(res, 400, { error: 'JSON 格式不對' }); }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return json(res, 400, { error: '內容不對' });
    try { cb(o); } catch (e) { console.error('後台動作出錯：' + (e && e.stack || e)); if (!res.headersSent) json(res, 500, { error: '伺服器處理時出了問題' }); }
  });
}
const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }   // 網址編碼不對
  if (url === '/admin/api/state') {   // 後台資料：要帶密碼
    if (!adminOk(req, res)) return;
    return json(res, 200, Object.assign(world.adminState(Date.now()), { server: health() }));
  }
  if (url === '/admin/api/tune') {    // 後台：改可調的數值。{ set: { 代號: 數值 } } 或 { reset: true }（還原成預設，節奏不變）
    if (!adminOk(req, res)) return;
    return readJson(req, res, o => {
      const now = Date.now(), changed = o.reset ? world.resetTune(true) : world.setTune(o.set && typeof o.set === 'object' ? o.set : {});
      if (changed.length) {
        world.adminNote((o.reset ? '數值還原成預設：' : '調整數值：') + changed.map(c => c.zh + ' ' + c.from + ' → ' + c.to).join('、'), now);
        save();
      }
      json(res, 200, { ok: true, changed: changed, tune: world.tune });
    });
  }
  if (url === '/admin/api/village') {   // 後台：幫部落改名，或移除部落。{ id, action: 'rename', name, owner } 或 { id, action: 'remove' }
    if (!adminOk(req, res)) return;
    return readJson(req, res, o => {
      const now = Date.now(), id = String(o.id || '');
      const r = o.action === 'remove' ? world.removeVillage(id, now) : o.action === 'rename' ? world.adminRename(id, o, now) : { ok: false, msg: '不認得的動作' };
      if (r.ok) {
        if (o.action === 'remove') for (const sk of io.sockets.sockets.values()) if (sk.data.vid === id) {   // 那個玩家還在線上：讓他回到開始畫面
          sk.data.vid = null; sk.data.last = null; sk.data.vseq = null; sk.data.nseq = null; delete conns[id];
          send(sk, 'hello', Object.assign({ reset: true }, hello(sk)));
        }
        refreshPubs(now); save();
      }
      json(res, 200, r);
    });
  }
  if (url === '/admin/api/export') {    // 後台：下載目前的存檔（裡面有所有玩家的部落鑰匙，請自己收好）
    if (!adminOk(req, res)) return;
    const d = new Date(), p2 = x => ('0' + x).slice(-2);
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="shanhai-world-' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + '.json"' }, SAFE));
    return res.end(JSON.stringify(world.toJSON()));
  }
  if (url === '/admin/api/backup') {    // 後台：現在就多留一份備份
    if (!adminOk(req, res)) return;
    return readJson(req, res, () => { backup(); json(res, 200, { ok: true, backups: backups.list }); });
  }
  if (url === '/admin/api/adjust') {  // 後台：調整某個部落的物資或保護
    if (!adminOk(req, res)) return;
    return readJson(req, res, o => {
      const r = world.adminAdjust(String(o.id || ''), o, Date.now());
      if (r.ok) save();
      json(res, 200, r);
    });
  }
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SAFE); return res.end(); }
  if (url === '/') url = '/index.html';
  if (url === '/admin') url = '/admin.html';
  const prefix = url.startsWith('/shared/') ? '/shared/' : '/';
  const file = path.join(ROOTS[prefix], url.slice(prefix.length));
  if (!file.startsWith(ROOTS[prefix] + path.sep) || url.indexOf('\0') >= 0) { res.writeHead(403, SAFE); return res.end(); }
  fs.stat(file, (e0, st) => {
    if (e0 || !st.isFile()) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SAFE)); return res.end('找不到這個檔案'); }
    const etag = '"' + st.size.toString(36) + '-' + Math.round(st.mtimeMs).toString(36) + '"', type = TYPES[path.extname(file)] || 'application/octet-stream';
    const head = Object.assign({ 'Content-Type': type, 'Cache-Control': url === '/admin.html' ? 'no-store' : 'no-cache', ETag: etag, Vary: 'Accept-Encoding' }, SAFE, /html/.test(type) ? { 'Content-Security-Policy': CSP } : {});
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }   // 瀏覽器手上的還是最新的，不用重傳
    const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|svg/.test(type);
    const hit = fileCache[file];
    if (hit && hit.etag === etag) { if (gz) head['Content-Encoding'] = 'gzip'; res.writeHead(200, head); return res.end(gz ? hit.gz : hit.raw); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, SAFE); return res.end(); }
      fileCache[file] = { etag: etag, raw: data, gz: zlib.gzipSync(data) };
      if (gz) head['Content-Encoding'] = 'gzip';
      res.writeHead(200, head); res.end(gz ? fileCache[file].gz : data);
    });
  });
});

// ---------- 連線 ----------
/* 把處理函式包起來：萬一裡面出錯，只記錄下來，不讓整個伺服器停掉（其他玩家不受影響） */
function guard(name, fn) {
  return function () {
    try { return fn.apply(this, arguments); }
    catch (e) {
      console.error('處理「' + name + '」時出錯：' + (e && e.stack || e));
      const cb = arguments[arguments.length - 1];
      if (typeof cb === 'function') { try { cb({ ok: false, msg: '伺服器處理這個動作時出了問題' }); } catch (x) { /* 回覆失敗就算了 */ } }
    }
  };
}
// 收的訊息都很小，限制大小避免被灌爆。送出去超過 1 KB 的才壓縮（剛連上時的完整狀態）；每則訊息各自壓縮、壓完就釋放，連線多的時候才不會吃掉太多記憶體
io = new Server(server, { serveClient: true, maxHttpBufferSize: 16e3, perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true } });

/* ----- 只傳有變動的部分 -----
 * 全島的部落清單每秒只算一次，和上一次比對，記下每個部落「最後一次變動的序號」。
 * 每個連線記得自己看到第幾號，之後只收序號比它新的部落（vd）和被移除的部落（vx）。
 * 其他欄位（關係、資源點、市集…）沒變就不送；自己的部落只送有變動的欄位（mp）；消息只送新的（feedAdd）。 */
const pubs = { list: [], json: Object.create(null), ver: Object.create(null), gone: [], goneFloor: 0, seq: 0 };
function refreshPubs(now) {
  const list = world.pubs(now), seen = Object.create(null);
  for (const p of list) {
    const js = JSON.stringify(p); seen[p.id] = 1;
    if (pubs.json[p.id] !== js) { pubs.json[p.id] = js; pubs.ver[p.id] = ++pubs.seq; }
  }
  for (const id in pubs.json) if (!seen[id]) { delete pubs.json[id]; delete pubs.ver[id]; pubs.gone.push({ id: id, seq: ++pubs.seq }); }
  while (pubs.gone.length > 500) pubs.goneFloor = pubs.gone.shift().seq;   // 太舊的移除紀錄丟掉；落後到這之前的連線改拿完整清單
  pubs.list = list;
}
/* 把部落清單的變動放進要送出的內容裡：第一次給完整清單，之後只給差異 */
function addPubs(socket, out) {
  const seen = socket.data.vseq;
  if (seen == null || seen < pubs.goneFloor) out.villages = pubs.list;   // 沒看過，或落後太多
  else if (seen < pubs.seq) {
    const vd = pubs.list.filter(p => pubs.ver[p.id] > seen), vx = pubs.gone.filter(g => g.seq > seen).map(g => g.id);
    if (vd.length) out.vd = vd;
    if (vx.length) out.vx = vx;
  }
  socket.data.vseq = pubs.seq;
}
function send(socket, ev, obj) { const js = JSON.stringify(obj); traffic.bytes += js.length; traffic.msgs++; socket.emit(ev, obj); }
/* 資源點也只送有變動的：nd 有變動的資源點、nx 消失的資源點（第一次或落後太多就送完整的 nodes） */
const nodesC = { json: Object.create(null), ver: Object.create(null), seq: 0, gone: [], goneFloor: 0, list: [], v: -1 };
function refreshNodes() {
  if (nodesC.v === world.nodesV) return;
  nodesC.v = world.nodesV;
  const list = world.nodesList(), seen = Object.create(null);
  for (const n of list) {
    const js = JSON.stringify(n); seen[n.id] = 1;
    if (nodesC.json[n.id] !== js) { nodesC.json[n.id] = js; nodesC.ver[n.id] = ++nodesC.seq; }
  }
  for (const id in nodesC.json) if (!seen[id]) { delete nodesC.json[id]; delete nodesC.ver[id]; nodesC.gone.push({ id: id, seq: ++nodesC.seq }); }
  while (nodesC.gone.length > 1000) nodesC.goneFloor = nodesC.gone.shift().seq;
  nodesC.list = list;
}
function addNodes(socket, out) {
  refreshNodes();
  const seen = socket.data.nseq;
  if (seen == null || seen < nodesC.goneFloor) out.nodes = nodesC.list;
  else if (seen < nodesC.seq) {
    const nd = nodesC.list.filter(n => nodesC.ver[n.id] > seen), nx = nodesC.gone.filter(g => g.seq > seen).map(g => g.id);
    if (nd.length) out.nd = nd;
    if (nx.length) out.nx = nx;
  }
  socket.data.nseq = nodesC.seq;
}
function hello(socket) {   // 給還沒有部落的連線：全島的部落（差異）與要不要邀請碼
  const out = { needCode: !!JOIN_CODE, contact: CONTACT };
  addPubs(socket, out);
  return out;
}
const conns = {};   // 部落 → 目前有幾個連線（同一個人可能開兩個分頁）
function push(socket, now) {   // 把這個連線還不知道的變動送過去
  const st = world.snapshot(socket.data.vid, now, { noPubs: true });
  if (!st) return;
  const D = socket.data, first = !D.last, last = D.last || (D.last = Object.create(null)), out = { now: st.now };
  delete st.villages; delete st.now;
  if (D.tv === st.tv) { delete st.tune; delete st.tv; } else D.tv = st.tv;
  delete st.nodes; delete st.nv;   // 資源點另外用差異的方式送（addNodes）
  const me = st.me; delete st.me;
  if (first) { out.me = me; D.lastMe = Object.create(null); for (const k in me) D.lastMe[k] = JSON.stringify(me[k]); }
  else {
    let mp = null;
    for (const k in me) { const js = JSON.stringify(me[k]); if (D.lastMe[k] !== js) { D.lastMe[k] = js; (mp = mp || {})[k] = me[k]; } }
    for (const k in D.lastMe) if (!(k in me)) { delete D.lastMe[k]; (mp = mp || {})[k] = null; }
    if (mp) out.mp = mp;
  }
  const feed = st.feed || []; delete st.feed;
  if (first) out.feed = feed; else { const add = feed.filter(f => f.id > (D.feedId || 0)); if (add.length) out.feedAdd = add; }
  if (feed.length) D.feedId = feed[feed.length - 1].id;
  for (const k in st) { const js = JSON.stringify(st[k]); if (last[k] !== js) { last[k] = js; out[k] = st[k] === undefined ? null : st[k]; } }
  addPubs(socket, out); addNodes(socket, out);
  send(socket, 'state', out);
}
function bind(socket, id) {
  socket.data.vid = id;
  conns[id] = (conns[id] || 0) + 1;
  world.setOnline(id, true, Date.now());
  push(socket, Date.now());
}
/* 來源的網路位置。伺服器前面有代理（Railway）時，用代理加上的那一段；玩家自己塞的標頭不算 */
function ipOf(req) {
  if (TRUST_PROXY) {
    const real = String(req.headers['x-real-ip'] || '').trim(); if (real) return real;
    const xs = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean); if (xs.length) return xs[xs.length - 1];
  }
  return (req.socket && req.socket.remoteAddress) || '?';
}
const byIp = Object.create(null), joinsByIp = Object.create(null);   // 每個網路位置目前有幾個連線、最近一小時建立了幾個部落
io.use((socket, next) => {   // 連線太多就不讓它連：整體的上限，以及同一個網路位置的上限
  const ip = ipOf(socket.request); socket.data.ip = ip;
  if (io.sockets.sockets.size >= MAX_SOCKETS) return next(new Error('伺服器滿了'));
  if ((byIp[ip] || 0) >= MAX_CONN_PER_IP) return next(new Error('連線太多'));
  byIp[ip] = (byIp[ip] || 0) + 1;
  next();
});
function okToken(t) { return typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t); }   // 識別碼是部落的鑰匙：太短或有怪字元的一律不收
io.on('connection', socket => {
  let budget = 30;   // 每個連線每 2 秒最多 30 個動作，避免被灌爆
  const refill = setInterval(() => { budget = 30; }, 2000);
  socket.on('resume', guard('resume', (o, cb) => {
    if (typeof cb !== 'function') return;
    const id = o && okToken(o.token) && world.tokens[o.token];
    if (id && world.villages[id] && !socket.data.vid) bind(socket, id);
    socket.data.vseq = null; socket.data.nseq = null;   // 重新給一份完整的部落清單與資源點
    cb(Object.assign({ resumed: !!socket.data.vid }, hello(socket)));
  }));
  socket.on('join', guard('join', (o, cb) => {
    if (typeof cb !== 'function' || socket.data.vid || !o) return;
    if (--budget < 0) return cb({ ok: false, msg: '動作太快了，稍等一下' });
    if (!okToken(o.token)) return cb({ ok: false, msg: '瀏覽器的識別碼不對，請重新整理網頁再試一次' });
    const known = world.tokens[o.token] && world.villages[world.tokens[o.token]];
    if (!known) {   // 新玩家才檢查邀請碼與人數上限
      if (JOIN_CODE && !sameKey(String(o.code || '').trim(), JOIN_CODE)) return cb({ ok: false, msg: '邀請碼不對' });
      const players = Object.keys(world.villages).filter(id => !world.villages[id].bot).length;
      if (players >= MAX_VILLAGES) return cb({ ok: false, msg: '部落的名額已經滿了' });
      const ip = socket.data.ip, hour = Date.now() - 3600000, mine = joinsByIp[ip] = (joinsByIp[ip] || []).filter(t => t > hour);
      if (mine.length >= JOINS_PER_HOUR) return cb({ ok: false, msg: '這個網路位置短時間內建立太多部落了，請晚一點再試' });
    }
    const r = world.join(o.token, o, Date.now());
    if (r.ok) { if (!r.resumed) (joinsByIp[socket.data.ip] = joinsByIp[socket.data.ip] || []).push(Date.now()); refreshPubs(Date.now()); bind(socket, r.id); }   // 新部落馬上進清單，自己才看得到自己
    cb(r);
  }));
  socket.on('act', guard('act', (a, cb) => {
    if (typeof cb !== 'function') cb = () => {};
    if (!socket.data.vid) return cb({ ok: false, msg: '還沒有部落' });
    if (--budget < 0) return cb({ ok: false, msg: '動作太快了，稍等一下' });
    const r = world.act(socket.data.vid, a, Date.now());
    cb(r);
    push(socket, Date.now());
  }));
  socket.on('has', guard('has', (code, cb) => {   // 換裝置：這組部落代碼存在嗎
    if (typeof cb !== 'function') return;
    budget -= 5;   // 查代碼算比較貴的動作，避免被拿來亂猜
    if (budget < 0) return cb(false);
    cb(!!(okToken(code) && world.tokens[code] && world.villages[world.tokens[code]]));
  }));
  socket.on('view', guard('view', (id, cb) => { if (typeof cb === 'function' && --budget >= 0) cb(world.detail(String(id), Date.now())); }));
  socket.on('disconnect', guard('disconnect', () => {
    clearInterval(refill);
    const ip = socket.data.ip; if (ip && byIp[ip] && --byIp[ip] <= 0) delete byIp[ip];
    const id = socket.data.vid;
    if (id && --conns[id] <= 0) { delete conns[id]; world.setOnline(id, false, Date.now()); }
  }));
});

refreshPubs(Date.now());
let n = 0;
setInterval(guard('每秒更新', () => {
  const now = Date.now();
  world.tick(now);
  n++;
  refreshPubs(now);
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.vid) push(socket, now);
    else if (n % 3 === 0 && socket.data.vseq !== pubs.seq) send(socket, 'hello', hello(socket));   // 還在選地點的人：部落清單有變動才送
  }
  if (n % 5 === 0) { traffic.perSec = Math.round(traffic.bytes / 5); traffic.msgsPerSec = Math.round(traffic.msgs / 5); traffic.bytes = 0; traffic.msgs = 0; }
  if (n % 20 === 0) save();
  if (n % 600 === 0) { const hour = now - 3600000; for (const ip in joinsByIp) { joinsByIp[ip] = joinsByIp[ip].filter(t => t > hour); if (!joinsByIp[ip].length) delete joinsByIp[ip]; } }   // 清掉過期的紀錄
}), 1000);

/* 定時多留一份備份（檔名帶日期時間），只保留最新的幾份。存檔萬一壞掉，或想回到之前的狀態，可以用它 */
function backup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date(), p2 = x => ('0' + x).slice(-2);
    const name = 'world-' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + '-' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + '.json';
    fs.writeFileSync(path.join(BACKUP_DIR, name), JSON.stringify(world.toJSON()));
    listBackups().slice(BACKUP_KEEP).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) { /* 刪不掉就留著 */ } });
    backups.list = listBackups(); backups.at = Date.now();
  } catch (e) { console.error('備份失敗：' + e.message); }
}
backups.list = listBackups();
setInterval(guard('備份', backup), BACKUP_HOURS * 3600000);
function quit() { save(); process.exit(0); }
process.on('SIGINT', quit); process.on('SIGTERM', quit);
server.listen(PORT, () => {
  console.log('山海部落已啟動：http://localhost:' + PORT);
  console.log(ADMIN ? '後台：http://localhost:' + PORT + '/admin' : '後台沒有開放（啟動時設定 ADMIN_PASSWORD 才會開）');
  console.log(JOIN_CODE ? '需要邀請碼才能建立部落' : '沒有設定邀請碼，任何人都能建立部落');
  console.log('存檔位置：' + DATA);
  console.log('遊戲節奏：' + world.tune.pace + '（1 是快速試玩，20 是正式；可以在後台調整）');
});
