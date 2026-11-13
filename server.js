/* 山海部落 — 本機伺服器
 * 目前（階段 1）只負責把遊戲頁面送到瀏覽器，遊戲在瀏覽器裡單機執行。
 * 階段 2 會在這裡加入多人連線。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOTS = { '/shared/': path.join(__dirname, 'shared'), '/': path.join(__dirname, 'public') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const prefix = url.startsWith('/shared/') ? '/shared/' : '/';
  const file = path.join(ROOTS[prefix], url.slice(prefix.length));
  if (!file.startsWith(ROOTS[prefix])) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('找不到這個檔案'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log('山海部落已啟動：http://localhost:' + PORT));
