/* 山海部落 — 遊戲伺服器
 * 送出遊戲網頁、讓所有玩家連到同一個世界，並定時存檔。伺服器是唯一的裁判，規則都在 shared/world.js。
 *
 * 可用的設定（環境變數）：
 *   PORT            連接埠，預設 3000
 *   ADMIN_PASSWORD  後台密碼；沒有設定時後台不開放
 *   JOIN_CODE       邀請碼；有設定時，要輸入邀請碼才能建立部落（公開測試用）
 *   MAX_VILLAGES    玩家部落的數量上限，預設 300
 *   DATA_FILE       存檔位置，預設 data/world.json。放在主機服務上時，要指到不會被清掉的硬碟，例如 /data/world.json
 *   PACE            遊戲節奏，預設 20（正式）。1 是快速試玩。只在存檔裡還沒有設定時使用；之後在後台調整，會記在存檔裡
 *   SPEED           整體加速倍率，測試用，預設 1（連對戰的讀秒也會加速，正式環境不要設） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const World = require('./shared/world.js');

const PORT = process.env.PORT || 3000;
const ADMIN = process.env.ADMIN_PASSWORD || '';
const JOIN_CODE = (process.env.JOIN_CODE || '').trim();
const MAX_VILLAGES = Number(process.env.MAX_VILLAGES) || 300;
const DATA = process.env.DATA_FILE ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'world.json') : path.join(__dirname, 'data', 'world.json'));
const world = new World({
  speed: Number(process.env.SPEED) || 1,
  tune: { pace: process.env.PACE ? Number(process.env.PACE) : 20 },
  reportAfter: process.env.REPORT_AFTER_MS ? Number(process.env.REPORT_AFTER_MS) : undefined,
  newbieMs: process.env.NEWBIE_MS ? Number(process.env.NEWBIE_MS) : undefined
});

// ---------- 存檔 ----------
try {
  world.load(JSON.parse(fs.readFileSync(DATA, 'utf8')));
  console.log('已讀取存檔：' + Object.keys(world.villages).length + ' 個部落，遊戲節奏 ' + world.tune.pace);
} catch (e) {
  if (e.code !== 'ENOENT') {   // 存檔壞了：改名留著，不要直接蓋掉
    const bad = DATA + '.壞掉-' + Date.now();
    try { fs.renameSync(DATA, bad); } catch (x) { /* 改名失敗就維持原狀 */ }
    console.error('存檔讀不出來，已另存為 ' + bad + '，這次從新的世界開始。原因：' + e.message);
  }
}
world.ensureBots(Date.now());
function save() {
  try {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    fs.writeFileSync(DATA + '.tmp', JSON.stringify(world.toJSON()));
    fs.renameSync(DATA + '.tmp', DATA);
  } catch (e) { console.error('存檔失敗：' + e.message); }
}

// ---------- 網頁 ----------
const ROOTS = { '/shared/': path.join(__dirname, 'shared'), '/': path.join(__dirname, 'public') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function sameKey(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
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
    return json(res, 200, world.adminState(Date.now()));
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
  if (url === '/admin/api/adjust') {  // 後台：調整某個部落的物資或保護
    if (!adminOk(req, res)) return;
    return readJson(req, res, o => {
      const r = world.adminAdjust(String(o.id || ''), o, Date.now());
      if (r.ok) save();
      json(res, 200, r);
    });
  }
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url === '/') url = '/index.html';
  if (url === '/admin') url = '/admin.html';
  const prefix = url.startsWith('/shared/') ? '/shared/' : '/';
  const file = path.join(ROOTS[prefix], url.slice(prefix.length));
  if (!file.startsWith(ROOTS[prefix])) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('找不到這個檔案'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
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
const io = new Server(server, { serveClient: true, maxHttpBufferSize: 16e3 });   // 訊息都很小，限制大小避免被灌爆
function hello() { return { villages: world.pubs(Date.now()), needCode: !!JOIN_CODE }; }
const conns = {};   // 部落 → 目前有幾個連線（同一個人可能開兩個分頁）
function push(socket, now) {   // 把最新的狀態送給這個連線；可調數值只在這個連線還沒看過這一版時才附上
  const st = world.snapshot(socket.data.vid, now);
  if (socket.data.tv === st.tv) delete st.tune; else socket.data.tv = st.tv;
  socket.emit('state', st);
}
function bind(socket, id) {
  socket.data.vid = id;
  conns[id] = (conns[id] || 0) + 1;
  world.setOnline(id, true, Date.now());
  push(socket, Date.now());
}
io.on('connection', socket => {
  let budget = 30;   // 每個連線每 2 秒最多 30 個動作，避免被灌爆
  const refill = setInterval(() => { budget = 30; }, 2000);
  socket.on('resume', guard('resume', (o, cb) => {
    if (typeof cb !== 'function') return;
    const id = o && typeof o.token === 'string' && world.tokens[o.token];
    if (id && world.villages[id] && !socket.data.vid) bind(socket, id);
    cb(Object.assign({ resumed: !!socket.data.vid }, hello()));
  }));
  socket.on('join', guard('join', (o, cb) => {
    if (typeof cb !== 'function' || socket.data.vid || !o) return;
    if (--budget < 0) return cb({ ok: false, msg: '動作太快了，稍等一下' });
    const known = typeof o.token === 'string' && world.tokens[o.token] && world.villages[world.tokens[o.token]];
    if (!known) {   // 新玩家才檢查邀請碼與人數上限
      if (JOIN_CODE && !sameKey(String(o.code || '').trim(), JOIN_CODE)) return cb({ ok: false, msg: '邀請碼不對' });
      const players = Object.keys(world.villages).filter(id => !world.villages[id].bot).length;
      if (players >= MAX_VILLAGES) return cb({ ok: false, msg: '測試名額已經滿了' });
    }
    const r = world.join(o.token, o, Date.now());
    if (r.ok) bind(socket, r.id);
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
  socket.on('view', guard('view', (id, cb) => { if (typeof cb === 'function' && --budget >= 0) cb(world.detail(String(id), Date.now())); }));
  socket.on('disconnect', guard('disconnect', () => {
    clearInterval(refill);
    const id = socket.data.vid;
    if (id && --conns[id] <= 0) { delete conns[id]; world.setOnline(id, false, Date.now()); }
  }));
});

let n = 0;
setInterval(guard('每秒更新', () => {
  const now = Date.now();
  world.tick(now);
  n++;
  let h = null;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.vid) push(socket, now);
    else if (n % 3 === 0) socket.emit('hello', h || (h = hello()));
  }
  if (n % 20 === 0) save();
}), 1000);

function quit() { save(); process.exit(0); }
process.on('SIGINT', quit); process.on('SIGTERM', quit);
server.listen(PORT, () => {
  console.log('山海部落已啟動：http://localhost:' + PORT);
  console.log(ADMIN ? '後台：http://localhost:' + PORT + '/admin' : '後台沒有開放（啟動時設定 ADMIN_PASSWORD 才會開）');
  console.log(JOIN_CODE ? '需要邀請碼才能建立部落' : '沒有設定邀請碼，任何人都能建立部落');
  console.log('存檔位置：' + DATA);
  console.log('遊戲節奏：' + world.tune.pace + '（1 是快速試玩，20 是正式；可以在後台調整）');
});
