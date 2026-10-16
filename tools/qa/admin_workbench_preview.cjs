'use strict';

// Local workbench preview. Uses an isolated fixture database and never reads server credentials.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, createHash, scryptSync } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '../..');
const port = Number(process.env.WORKBENCH_PREVIEW_PORT || 57831);
const origin = `http://127.0.0.1:${port}`;
const fixtureDir = path.join(root, 'output', 'admin-workbench-local-preview');
fs.mkdirSync(fixtureDir, { recursive: true });
Object.assign(process.env, {
  DATA_DIR: fixtureDir,
  AUTH_DB: path.join(fixtureDir, 'preview.sqlite'),
  ADMIN_API_TOKEN: randomBytes(32).toString('base64url'),
  ADMIN_PUBLIC_ORIGIN: origin,
  APP_ORIGINS: origin,
  COOKIE_SECURE: '0',
  PUBLIC_FREE_ENTITLEMENTS: '1',
  TEST_AUTH_ENABLED: '0',
  PAYMENT_PROVIDER: '',
  PAYMENT_CHECKOUT_ENABLED: '0',
  PAYMENT_TEST_MODE: '0',
});
const { handleApi } = require('../../server/auth-api');
const fixtureDb = new DatabaseSync(process.env.AUTH_DB);
if (!fixtureDb.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
  const now = Date.now();
  const columns = new Set(fixtureDb.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync('local-preview-password', salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url');
  fixtureDb.exec('BEGIN IMMEDIATE');
  try {
    for (let i = 0; i < 26; i++) {
      const id = randomUUID();
      fixtureDb.prepare('INSERT INTO users(id,username,password_salt,password_hash,created_at,disabled) VALUES (?,?,?,?,?,?)')
        .run(id, `preview_resident_${String(i + 1).padStart(2, '0')}`, salt, hash, now - i * 86400000, i === 4 || i === 12 ? 1 : 0);
      if (columns.has('last_seen')) fixtureDb.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now - (i % 11) * 86400000, id);
      if (i % 5 !== 0) {
        const data = { v: 3, started: true, coins: 800 + i * 320, owned: ['h_reunion', 'd_reunion', 's_reunion'], outfit: { hair: 'h_reunion', dress: 'd_reunion', shoes: 's_reunion' },
          placed: [], crops: { radish: i + 2 }, seeds: { radish: 5 }, decor: { fence: 2 }, house: 1 + i % 3, yardLv: 1 + i % 2, gday: i * 3, shops: { cafe: { lv: 1, stage: 0, plays: 0 } } };
        const payload = JSON.stringify(data);
        fixtureDb.prepare('INSERT INTO saves(user_id,revision,payload,payload_bytes,checksum,client_updated_at,server_updated_at) VALUES (?,?,?,?,?,?,?)')
          .run(id, 1, payload, Buffer.byteLength(payload), createHash('sha256').update(payload).digest('hex'), now - i * 3600000, now - i * 3600000);
      }
      if (i < 4) fixtureDb.prepare('INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at,last_seen) VALUES (?,?,?,?,?,?)')
        .run(randomUUID(), id, createHash('sha256').update(randomBytes(32)).digest('hex'), now - 3600000, now + 86400000, now - i * 60000);
    }
    fixtureDb.exec('COMMIT');
  } catch (error) { fixtureDb.exec('ROLLBACK'); throw error; }
}
fixtureDb.close();

const staticFiles = { '/admin/': ['index.html', 'text/html; charset=utf-8'], '/admin/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/admin/admin.js': ['admin.js', 'text/javascript; charset=utf-8'], '/admin/admin.css': ['admin.css', 'text/css; charset=utf-8'] };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (url.pathname === '/preview-healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ localWorkbenchPreview: true })); return; }
    if (url.pathname.startsWith('/api/')) { await handleApi(req, res); return; }
    if (url.pathname === '/') { res.writeHead(302, { Location: '/admin/' }).end(); return; }
    if (!['GET', 'HEAD'].includes(req.method) || !staticFiles[url.pathname]) { res.writeHead(404).end('Not found'); return; }
    const [name, contentType] = staticFiles[url.pathname];
    let content = fs.readFileSync(path.join(root, 'site/admin', name));
    if (name === 'index.html') {
      content = Buffer.from(content.toString('utf8').replace(/window\.__NIKKI_ADMIN_API_BASE__\s*=\s*[^;]+;/, "window.__NIKKI_ADMIN_API_BASE__ = '';" ).replace('</head>', '<script>window.__NIKKI_ADMIN_LOCAL_PREVIEW__ = true;</script></head>'));
    }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { console.error(error.code || error.message); if (!res.headersSent) res.writeHead(500); res.end('Local preview error'); }
});

server.listen(port, '127.0.0.1', async () => {
  const res = await fetch(`${origin}/api/admin/launch`, { method: 'POST', headers: { 'X-Admin-Token': process.env.ADMIN_API_TOKEN, 'Content-Type': 'application/json' }, body: '{}' });
  const launch = await res.json();
  if (!res.ok) throw new Error(launch.error || 'Preview login ticket failed');
  const url = `${origin}/admin/#ticket=${encodeURIComponent(launch.ticket)}`;
  fs.writeFileSync(path.join(fixtureDir, 'preview-session.json'), JSON.stringify({ origin, url, token: process.env.ADMIN_API_TOKEN, expiresAt: launch.expiresAt, fixtureDatabase: process.env.AUTH_DB }, null, 2));
  console.log(`LOCAL_FIXTURE_PREVIEW=${url}`);
  console.log('Uses synthetic accounts only. Keep this process running while previewing.');
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
