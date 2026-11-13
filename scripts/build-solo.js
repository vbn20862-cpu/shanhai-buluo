/* 把遊戲打包成單一檔案（dist/shanhai-buluo.html），用來發佈預覽頁。
 * 這個檔案沒有 <html>/<body>，由預覽平臺包起來；要在本機玩請用 npm start。 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const scripts = ['shared/geo.js', 'shared/tribes.js', 'shared/world.js', 'public/art.js', 'public/net.js', 'public/client.js'];
const out = [
  '<title>山海部落</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@700&family=Noto+Sans+TC:wght@400;500;700&display=swap">',
  '<style>\n' + read('public/style.css') + '</style>',
  '<div id="app"></div>'
].concat(scripts.map(f => '<script>\n' + read(f) + '</script>')).join('\n');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/shanhai-buluo.html'), out);
console.log('已產生 dist/shanhai-buluo.html（' + Math.round(out.length / 1024) + ' KB）');
