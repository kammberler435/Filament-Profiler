'use strict';
// Lokale Vorschau der statischen Website (web/dist) – wie GitHub Pages, mit gzip.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.join(__dirname, 'dist');
const PORT = +process.argv[2] || 47812;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.normalize(path.join(DIST, p.endsWith('/') ? p + 'index.html' : p));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  let body = fs.readFileSync(f);
  const headers = { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  if (/gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
  res.writeHead(200, headers);
  res.end(body);
}).listen(PORT, '127.0.0.1', () => console.log(`Website-Vorschau: http://127.0.0.1:${PORT}/`));
