// モックを「触れる形」で出すだけの小さなサーバー（開発用・2026-10-25）
//   node mock_server.js   → http://localhost:8401/mock_week_v5.html
//   リポジトリの中のファイルを読んで返すだけ。データには一切触らない。
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = __dirname, PORT = Number(process.env.PORT || 8401);
const TYPE = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (!p) p = 'mock_week_v5.html';
  const f = path.join(DIR, p);
  if (f.indexOf(DIR) !== 0) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('見つかりません: ' + p); return; }
    res.writeHead(200, { 'Content-Type': TYPE[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(PORT, () => console.log('http://localhost:' + PORT + '/mock_week_v5.html'));
