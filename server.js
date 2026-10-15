// 零依赖静态服务器：node server.js  →  http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const { handleApi } = require('./server/auth-api');
const inside = (root, file) => file.startsWith(root + path.sep);
const publicPath = (relative) => /^(?:js|css|assets|site|dist)\//i.test(relative)
  || /^node_modules\/three\//i.test(relative)
  || /^[^/]+\.(?:html|mp4|apk)$/i.test(relative);
function fail(res, status) {
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(String(status));
}
http
  .createServer(async (req, res) => {
    try {
    if (req.url.startsWith('/api/')) {
      await handleApi(req, res);
      return;
    }
    // 仅在 CAPTURE=1 时启用（录宣传片用，见 tools/promo/README.md）
    if (process.env.CAPTURE === '1' && req.method === 'POST' && req.url.startsWith('/__cap/')) {
      const rel = decodeURIComponent(req.url.split('?')[0].slice(7)).replace(/\\/g, '/');
      if (!rel || rel.includes('\0') || rel.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) return fail(res, 400);
      const captureRoot = path.join(ROOT, '_capture'), out = path.resolve(captureRoot, rel);
      if (!inside(captureRoot, out)) return fail(res, 403);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const chunks = [];
      let bytes = 0, rejected = false;
      req.on('data', (c) => { bytes += c.length; if (bytes > 64 * 1024 * 1024) { if (!rejected) fail(res, 413); rejected = true; chunks.length = 0; } else if (!rejected) chunks.push(c); });
      req.on('end', () => { if (rejected) return; try { fs.writeFileSync(out, Buffer.concat(chunks)); res.writeHead(200).end('ok'); } catch { fail(res, 500); } });
      req.on('error', () => { if (!res.writableEnded) fail(res, 400); });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 405);
    let rel = decodeURIComponent(req.url.split('?')[0]).replace(/\\/g, '/');
    if (rel.includes('\0') || rel.includes(':')) return fail(res, 400);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(ROOT, '.' + rel);
    const relative = path.relative(ROOT, file).replace(/\\/g, '/');
    if (!inside(ROOT, file) || !publicPath(relative) || relative.split('/').some(part => part.startsWith('.'))
      || /\.(?:sqlite(?:-wal|-shm)?|db|pem|key|env)$/i.test(relative)) return fail(res, 403);
    try {
      const real = fs.realpathSync(file), realRelative = path.relative(ROOT, real).replace(/\\/g, '/');
      if (!inside(ROOT, real) || !publicPath(realRelative)) return fail(res, 403);
    } catch { return fail(res, 404); }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
    } catch (error) { fail(res, error instanceof URIError ? 400 : 500); }
  })
  .listen(PORT, HOST, () => console.log(`暖暖的方块小镇 → http://${HOST}:${PORT}`));
