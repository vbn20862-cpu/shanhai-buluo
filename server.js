/* 山海部落 — 遊戲伺服器
 * 送出遊戲網頁、讓所有玩家連到同一個世界，並定時存檔。伺服器是唯一的裁判，規則都在 shared/world.js。
 *
 * 可用的設定（環境變數）：
 *   PORT            連接埠，預設 3000
 *   ADMIN_PASSWORD  後台密碼；沒有設定時後台不開放
 *   JOIN_CODE       邀請碼；有設定時，要輸入邀請碼才能建立部落（公開測試用）
 *   MAX_VILLAGES    玩家部落的數量上限，預設 300
 *   DATA_FILE       存檔位置，預設 data/world.json。放在主機服務上時，要指到不會被清掉的硬碟，例如 /data/world.json
 *   SPEED           遊戲速度倍率，測試用，預設 1 */
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
  reportAfter: process.env.REPORT_AFTER_MS ? Number(process.env.REPORT_AFTER_MS) : undefined,
  newbieMs: process.env.NEWBIE_MS ? Number(process.env.NEWBIE_MS) : undefined
});

// ---------- 存檔 ----------
try {
  world.load(JSON.parse(fs.readFileSync(DATA, 'utf8')));
  console.log('已讀取存檔：' + Object.keys(world.villages).length + ' 個部落');
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
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/admin/api/state') {   // 後台資料：要帶密碼
    if (!ADMIN) return json(res, 503, { error: '後台沒有開放。啟動伺服器時要設定 ADMIN_PASSWORD。' });
    if (!sameKey(req.headers['x-admin-key'] || '', ADMIN)) return json(res, 401, { error: '密碼不對' });
    return json(res, 200, world.adminState(Date.now()));
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
const io = new Server(server, { serveClient: true, maxHttpBufferSize: 16e3 });   // 訊息都很小，限制大小避免被灌爆
function hello() { return { villages: world.pubs(Date.now()), needCode: !!JOIN_CODE }; }
const conns = {};   // 部落 → 目前有幾個連線（同一個人可能開兩個分頁）
function bind(socket, id) {
  socket.data.vid = id;
  conns[id] = (conns[id] || 0) + 1;
  world.setOnline(id, true, Date.now());
  socket.emit('state', world.snapshot(id, Date.now()));
}
io.on('connection', socket => {
  let budget = 30;   // 每個連線每 2 秒最多 30 個動作，避免被灌爆
  const refill = setInterval(() => { budget = 30; }, 2000);
  socket.on('resume', (o, cb) => {
    if (typeof cb !== 'function') return;
    const id = o && typeof o.token === 'string' && world.tokens[o.token];
    if (id && world.villages[id] && !socket.data.vid) bind(socket, id);
    cb(Object.assign({ resumed: !!socket.data.vid }, hello()));
  });
  socket.on('join', (o, cb) => {
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
  });
  socket.on('act', (a, cb) => {
    if (typeof cb !== 'function') cb = () => {};
    if (!socket.data.vid) return cb({ ok: false, msg: '還沒有部落' });
    if (--budget < 0) return cb({ ok: false, msg: '動作太快了，稍等一下' });
    const r = world.act(socket.data.vid, a, Date.now());
    cb(r);
    socket.emit('state', world.snapshot(socket.data.vid, Date.now()));
  });
  socket.on('view', (id, cb) => { if (typeof cb === 'function' && --budget >= 0) cb(world.detail(String(id), Date.now())); });
  socket.on('disconnect', () => {
    clearInterval(refill);
    const id = socket.data.vid;
    if (id && --conns[id] <= 0) { delete conns[id]; world.setOnline(id, false, Date.now()); }
  });
});

let n = 0;
setInterval(() => {
  const now = Date.now();
  world.tick(now);
  n++;
  let h = null;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.vid) socket.emit('state', world.snapshot(socket.data.vid, now));
    else if (n % 3 === 0) socket.emit('hello', h || (h = hello()));
  }
  if (n % 20 === 0) save();
}, 1000);

function quit() { save(); process.exit(0); }
process.on('SIGINT', quit); process.on('SIGTERM', quit);
server.listen(PORT, () => {
  console.log('山海部落已啟動：http://localhost:' + PORT);
  console.log(ADMIN ? '後台：http://localhost:' + PORT + '/admin' : '後台沒有開放（啟動時設定 ADMIN_PASSWORD 才會開）');
  console.log(JOIN_CODE ? '需要邀請碼才能建立部落' : '沒有設定邀請碼，任何人都能建立部落');
  console.log('存檔位置：' + DATA);
});
