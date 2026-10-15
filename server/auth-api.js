// 暖暖小镇账号与云存档 API。
// 依赖 Node 22+ 的 node:sqlite，避免测试阶段额外编译原生数据库模块。
// 生产环境请通过 HTTPS 反向代理访问，并将 COOKIE_SECURE=1。
const { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const GIFT_CATALOG = require('./gift-catalog.json');
const GIFT_IDS = Object.fromEntries(['owned', 'seeds', 'crops', 'decor'].map((type) => [type, new Set(GIFT_CATALOG[type].map((item) => item.id))]));
const createBilling = require('./billing');
const createAdminWorkbench = require('./admin-workbench');
const ADMIN_CAPABILITIES = ['accounts.read', 'accounts.write', 'sessions.read', 'sessions.revoke', 'entitlements.write', 'saves.read', 'gifts.write', 'gift_templates.write', 'mail.write', 'mail.read', 'mail.revoke', 'audit.read', 'service_settings.read', 'service_settings.write'];

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const DB_PATH = path.resolve(process.env.AUTH_DB || path.join(DATA_DIR, 'accounts.sqlite'));
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 30));
const MAX_SAVE_BYTES = 2 * 1024 * 1024;
// CORS allowlist for browser clients. Keep APP_ORIGIN as a backwards-compatible
// single-origin fallback, while APP_ORIGINS accepts a comma-separated list for
// the public site plus explicitly approved test/mobile mirrors. Never use `*`
// here because account requests carry cookies.
const APP_ORIGINS = new Set(
  String(process.env.APP_ORIGINS || process.env.APP_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
// Android Capacitor 页面使用 https://localhost，请求公网 API 时属于跨站
// fetch；Secure 生产会话必须允许带凭据跨站发送，否则 APK 注册后下一次
// /api/auth/me 会看不到刚写入的 HttpOnly 会话。开发机 HTTP 仍使用 Lax，
// 避免浏览器拒收 SameSite=None 且没有 Secure 的 Cookie。
const COOKIE_SAMESITE = COOKIE_SECURE ? 'None' : 'Lax';
// 测试授权只用于本地验收，不连接任何支付平台。生产环境应保持关闭，
// 并且不要把 TEST_AUTH_ADMIN_TOKEN 暴露给浏览器或客户端。
const TEST_AUTH_ENABLED = process.env.TEST_AUTH_ENABLED === '1';
const TEST_AUTH_ADMIN_TOKEN = String(process.env.TEST_AUTH_ADMIN_TOKEN || '');
const TEST_FEATURES = new Set(['cloud_sync', 'auto_update']);
// 首次配置默认统一免费；管理台保存后以数据库为准，重启不覆盖运营选择。
// 限免与支付开通分离，管理台关闭限免时会持续暂停下单。
const DEFAULT_FREE_ENTITLEMENTS = process.env.PUBLIC_FREE_ENTITLEMENTS !== '0';
// 管理台使用独立的服务端令牌，不复用测试授权令牌，也不把令牌写进静态页面。
// 生产环境通过 systemd EnvironmentFile 注入 ADMIN_API_TOKEN；未配置时管理台保持关闭。
const ADMIN_API_TOKEN = String(process.env.ADMIN_API_TOKEN || '').trim();
const ADMIN_PUBLIC_ORIGIN = String(process.env.ADMIN_PUBLIC_ORIGIN || 'http://127.0.0.1:5173').trim().replace(/\/$/, '');
const ADMIN_SESSION_DAYS = Math.max(1, Number(process.env.ADMIN_SESSION_DAYS || 30));
const ADMIN_LAUNCH_SECONDS = Math.max(30, Math.min(300, Number(process.env.ADMIN_LAUNCH_SECONDS || 90)));
const ADMIN_COOKIE_SECURE = COOKIE_SECURE;
const ADMIN_COOKIE_NAME = ADMIN_COOKIE_SECURE ? '__Host-nikki-admin' : 'nikki-admin';
const db = (() => {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const value = new DatabaseSync(DB_PATH);
  value.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash);
    CREATE TABLE IF NOT EXISTS entitlements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feature TEXT NOT NULL,
      valid_from INTEGER NOT NULL,
      valid_until INTEGER,
      source TEXT NOT NULL DEFAULT 'test',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (user_id, feature, source)
    );
    CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id, valid_from, valid_until);
    CREATE TABLE IF NOT EXISTS billing_orders (
      id TEXT PRIMARY KEY,
      out_trade_no TEXT NOT NULL UNIQUE,
      client_request_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_fen INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      status TEXT NOT NULL DEFAULT 'PENDING',
      code_url TEXT,
      transaction_id TEXT,
      trade_state TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      paid_at INTEGER,
      refunded_at INTEGER,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS billing_orders_user_idx ON billing_orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS billing_orders_status_idx ON billing_orders(status, expires_at);
    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      out_trade_no TEXT,
      transaction_id TEXT,
      event_type TEXT NOT NULL,
      body_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_events_order_idx ON billing_events(out_trade_no, created_at DESC);
    CREATE TABLE IF NOT EXISTS saves (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 1,
      payload TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      client_updated_at INTEGER,
      server_updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      target_user_id TEXT,
      detail TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at DESC);
    CREATE TABLE IF NOT EXISTS service_settings (
      id INTEGER PRIMARY KEY CHECK (id=1),
      free_entitlements INTEGER NOT NULL CHECK (free_entitlements IN (0,1)),
      checkout_paused INTEGER NOT NULL DEFAULT 1 CHECK (checkout_paused IN (0,1)),
      revision INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gift_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL UNIQUE,
      items_json TEXT NOT NULL,
      operator TEXT NOT NULL,
      before_revision INTEGER NOT NULL,
      after_revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gift_grants_user_idx ON gift_grants(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      admin_token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS admin_launch_tickets (
      id TEXT PRIMARY KEY,
      ticket_hash TEXT NOT NULL UNIQUE,
      admin_token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS admin_launch_tickets_expiry_idx ON admin_launch_tickets(expires_at);
    CREATE TABLE IF NOT EXISTS gift_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      ops_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gift_templates_active_idx ON gift_templates(active, updated_at DESC);
    CREATE TABLE IF NOT EXISTS mail_messages (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      ops_json TEXT NOT NULL DEFAULT '[]',
      audience TEXT NOT NULL,
      target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'published',
      idempotency_key TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      published_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS mail_messages_publish_idx ON mail_messages(status, published_at DESC, expires_at);
    CREATE INDEX IF NOT EXISTS mail_messages_target_idx ON mail_messages(target_user_id, published_at DESC);
    CREATE TABLE IF NOT EXISTS mail_deliveries (
      message_id TEXT NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at INTEGER,
      claimed_at INTEGER,
      claim_idempotency_key TEXT,
      claim_result_json TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS mail_deliveries_user_idx ON mail_deliveries(user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS mail_delivery_claim_key_idx ON mail_deliveries(user_id, claim_idempotency_key) WHERE claim_idempotency_key IS NOT NULL;
    -- Batch receipts are independent of mail availability and individual claims.
    -- Keep even empty receipts so a retry cannot collect newly delivered gifts.
    CREATE TABLE IF NOT EXISTS mail_claim_batches (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS mail_messages_page_idx ON mail_messages(status, published_at DESC, id DESC);
  `);
  // 兼容已有数据库；活动历史独立于可撤销的登录会话保存。
  const userColumns = new Set(value.prepare('PRAGMA table_info(users)').all().map((row) => row.name));
  if (!userColumns.has('note')) value.exec("ALTER TABLE users ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  if (!userColumns.has('admin_revision')) value.exec('ALTER TABLE users ADD COLUMN admin_revision INTEGER NOT NULL DEFAULT 0');
  if (!userColumns.has('last_seen')) value.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER');
  const mailColumns = new Set(value.prepare('PRAGMA table_info(mail_messages)').all().map((row) => row.name));
  if (!mailColumns.has('revoked_at')) value.exec('ALTER TABLE mail_messages ADD COLUMN revoked_at INTEGER');
  if (!mailColumns.has('revoke_reason')) value.exec("ALTER TABLE mail_messages ADD COLUMN revoke_reason TEXT NOT NULL DEFAULT ''");
  value.exec(`CREATE INDEX IF NOT EXISTS sessions_user_activity_idx ON sessions(user_id,last_seen);
    CREATE INDEX IF NOT EXISTS users_last_seen_idx ON users(last_seen);
    CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit(target_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS admin_audit_action_idx ON admin_audit(action, created_at DESC);
    CREATE INDEX IF NOT EXISTS mail_deliveries_message_idx ON mail_deliveries(message_id, read_at, claimed_at);
    UPDATE users SET last_seen=(SELECT MAX(s.last_seen) FROM sessions s WHERE s.user_id=users.id)
      WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.user_id=users.id AND (users.last_seen IS NULL OR s.last_seen>users.last_seen));`);
  return value;
})();

const limiter = new Map();
let nextLimiterSweep = 0;
function limited(key, max, windowMs) {
  const now = Date.now();
  if (now >= nextLimiterSweep) {
    for (const [oldKey, hit] of limiter) if (now >= hit.expiresAt) limiter.delete(oldKey);
    nextLimiterSweep = now + 30000;
  }
  const hit = limiter.get(key);
  if (!hit || now - hit.start >= windowMs) {
    // Refuse new identities under sustained flooding instead of forgetting live limits.
    if (!hit && limiter.size >= 20000) return true;
    limiter.set(key, { start: now, count: 1, expiresAt: now + windowMs });
    return false;
  }
  hit.count += 1;
  return hit.count > max;
}

function send(res, status, body, headers = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

function originHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  if (!APP_ORIGINS.size || APP_ORIGINS.has(origin)) return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
  return {};
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* malformed cookie is ignored */ }
    }
  }
  return out;
}

function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
function passwordHash(password, salt) { return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url'); }
function userView(row) { return { id: row.id, username: row.username, createdAt: row.created_at }; }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }

function sameSecret(actual, expected) {
  if (!expected || typeof actual !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function testAdmin(req) {
  if (!TEST_AUTH_ENABLED || !TEST_AUTH_ADMIN_TOKEN) return false;
  const value = String(req.headers['x-test-admin-token'] || req.headers['x-admin-token'] || '');
  return sameSecret(value, TEST_AUTH_ADMIN_TOKEN);
}

function adminToken(req) {
  const header = String(req.headers['x-admin-token'] || req.headers['x-admin-api-token'] || '');
  if (header) return header;
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function adminAuth(req) {
  return !!ADMIN_API_TOKEN && sameSecret(adminToken(req), ADMIN_API_TOKEN);
}

function adminTokenDigest() { return tokenHash(ADMIN_API_TOKEN); }
function adminCookie(req) { return parseCookies(req)[ADMIN_COOKIE_NAME] || ''; }
function adminSessionCookie(token) {
  const secure = ADMIN_COOKIE_SECURE ? '; Secure' : '';
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${ADMIN_SESSION_DAYS * 86400}; HttpOnly; SameSite=Strict${secure}`;
}
function clearAdminSessionCookie() {
  const secure = ADMIN_COOKIE_SECURE ? '; Secure' : '';
  return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}
function adminSessionAuth(req) {
  const value = adminCookie(req);
  if (!value || !ADMIN_API_TOKEN) return false;
  const now = Date.now();
  const row = db.prepare('SELECT id FROM admin_sessions WHERE token_hash=? AND admin_token_hash=? AND expires_at>?').get(tokenHash(value), adminTokenDigest(), now);
  if (!row) return false;
  db.prepare('UPDATE admin_sessions SET last_seen=? WHERE id=?').run(now, row.id);
  return true;
}

function requireAdmin(req, res, headers) {
  if (!ADMIN_API_TOKEN) {
    send(res, 503, { error: '管理台尚未配置管理员令牌', code: 'ADMIN_NOT_CONFIGURED' }, headers);
    return false;
  }
  if (adminCookie(req)) {
    const origin = String(req.headers.origin || '');
    if (origin && origin !== ADMIN_PUBLIC_ORIGIN) {
      send(res, 403, { error: '管理员会话不接受跨来源请求', code: 'ADMIN_ORIGIN_REQUIRED' });
      return false;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && (origin !== ADMIN_PUBLIC_ORIGIN || !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json'))) {
      send(res, 403, { error: '管理员写操作必须来自线上管理台', code: 'ADMIN_CSRF_BLOCKED' });
      return false;
    }
    if (adminSessionAuth(req)) return true;
  }
  if (!adminAuth(req)) {
    send(res, 401, { error: '需要管理员令牌', code: 'ADMIN_AUTH_REQUIRED' }, headers);
    return false;
  }
  return true;
}

function cleanupAdminAuth(now = Date.now()) {
  db.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').run(now);
  db.prepare('DELETE FROM admin_launch_tickets WHERE expires_at<=? OR (used_at IS NOT NULL AND used_at<?)').run(now, now - 86400000);
}

function createAdminLaunchTicket() {
  cleanupAdminAuth();
  const ticket = randomBytes(48).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO admin_launch_tickets (id,ticket_hash,admin_token_hash,created_at,expires_at,used_at) VALUES (?,?,?,?,?,NULL)')
    .run(randomUUID(), tokenHash(ticket), adminTokenDigest(), now, now + ADMIN_LAUNCH_SECONDS * 1000);
  return { ticket, expiresAt: now + ADMIN_LAUNCH_SECONDS * 1000 };
}

function redeemAdminLaunchTicket(ticket) {
  if (typeof ticket !== 'string' || ticket.length < 40 || ticket.length > 160) return null;
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT id FROM admin_launch_tickets WHERE ticket_hash=? AND admin_token_hash=? AND expires_at>? AND used_at IS NULL').get(tokenHash(ticket), adminTokenDigest(), now);
    if (!row) { db.exec('ROLLBACK'); return null; }
    const consumed = db.prepare('UPDATE admin_launch_tickets SET used_at=? WHERE id=? AND used_at IS NULL').run(now, row.id);
    if (consumed.changes !== 1) { db.exec('ROLLBACK'); return null; }
    const session = randomBytes(48).toString('base64url');
    db.prepare('INSERT INTO admin_sessions (id,token_hash,admin_token_hash,created_at,expires_at,last_seen) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), tokenHash(session), adminTokenDigest(), now, now + ADMIN_SESSION_DAYS * 86400000, now);
    db.exec('COMMIT');
    return session;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  }
}

function adminSaveSummary(row) {
  if (!row) return null;
  let data = null;
  try { data = JSON.parse(row.payload); } catch { /* 已由保存接口校验过，损坏时仍返回元数据 */ }
  const sum = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.values(value).reduce((n, v) => n + (Number.isFinite(Number(v)) ? Number(v) : 0), 0) : 0;
  return {
    revision: row.revision,
    checksum: row.checksum,
    payloadBytes: row.payload_bytes,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.server_updated_at,
    started: !!data?.started,
    coins: Number.isFinite(Number(data?.coins)) ? Number(data.coins) : 0,
    ownedCount: Array.isArray(data?.owned) ? data.owned.length : 0,
    cropsTotal: sum(data?.crops),
    seedsTotal: sum(data?.seeds),
    decorTotal: sum(data?.decor),
    house: Number(data?.house || 1),
    yardLv: Number(data?.yardLv || 1),
    gday: Number(data?.gday || 0),
  };
}

function adminEntitlements(userId, now = Date.now()) {
  return db.prepare(`SELECT feature, valid_from, valid_until, source, created_at, updated_at
    FROM entitlements WHERE user_id=? ORDER BY valid_until IS NULL DESC, valid_until DESC, feature ASC`).all(userId)
    .map((row) => ({ feature: row.feature, validFrom: row.valid_from, validUntil: row.valid_until, source: row.source, createdAt: row.created_at, updatedAt: row.updated_at, active: row.valid_from <= now && (row.valid_until === null || row.valid_until > now) }));
}

function adminUserView(row, saveRow, now = Date.now()) {
  const metadata = row.admin_revision === undefined ? db.prepare('SELECT note,admin_revision,last_seen FROM users WHERE id=?').get(row.id) : row;
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    disabled: !!row.disabled,
    note: metadata?.note || '',
    adminRevision: Number(metadata?.admin_revision || 0),
    lastSeen: metadata?.last_seen || null,
    entitlements: adminEntitlements(row.id, now),
    access: entitlementView(row.id, now),
    save: adminSaveSummary(saveRow),
  };
}

function recordAdminAudit(action, targetUserId, detail, req) {
  db.prepare('INSERT INTO admin_audit (id,action,target_user_id,detail,created_at,ip) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), action, targetUserId || null, JSON.stringify(detail || {}), Date.now(), clientIp(req));
}

function serviceSettings() {
  const row = db.prepare('SELECT free_entitlements,checkout_paused,revision,updated_at FROM service_settings WHERE id=1').get();
  return row ? { freeEntitlements: !!row.free_entitlements, checkoutPaused: !!row.checkout_paused, revision: row.revision, updatedAt: row.updated_at, source: 'workbench' }
    : { freeEntitlements: DEFAULT_FREE_ENTITLEMENTS, checkoutPaused: false, revision: 0, updatedAt: null, source: 'environment' };
}

function updateServiceSettings(body, req) {
  if (typeof body?.freeEntitlements !== 'boolean' || !Number.isSafeInteger(body?.baseRevision) || body.baseRevision < 0) {
    throw Object.assign(new Error('请提供限免状态和当前设置版本'), { status: 400, code: 'SERVICE_SETTINGS_INVALID' });
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const before = serviceSettings();
    if (body.baseRevision !== before.revision) throw Object.assign(new Error('服务设置已被其他页面修改，请刷新后重试'), { status: 409, code: 'SERVICE_SETTINGS_CONFLICT' });
    if (before.freeEntitlements !== body.freeEntitlements || !before.checkoutPaused || before.source !== 'workbench') {
      const revision = before.revision + 1, now = Date.now();
      db.prepare(`INSERT INTO service_settings(id,free_entitlements,checkout_paused,revision,updated_at) VALUES (1,?,1,?,?)
        ON CONFLICT(id) DO UPDATE SET free_entitlements=excluded.free_entitlements,checkout_paused=1,revision=excluded.revision,updated_at=excluded.updated_at`)
        .run(body.freeEntitlements ? 1 : 0, revision, now);
      recordAdminAudit('service.free_access.update', null, { before: { freeEntitlements: before.freeEntitlements, checkoutPaused: before.checkoutPaused, revision: before.revision }, after: { freeEntitlements: body.freeEntitlements, checkoutPaused: true, revision } }, req);
    }
    db.exec('COMMIT');
    return serviceSettings();
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* preserve original error */ } throw error; }
}

function safeId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 80 && /^[A-Za-z0-9_.-]+$/.test(value);
}

function giftOps(body) {
  if (!Array.isArray(body?.ops) || body.ops.length < 1 || body.ops.length > 20) {
    throw Object.assign(new Error('礼包至少包含 1 项，最多 20 项'), { status: 400 });
  }
  return body.ops.map((op) => {
    const type = String(op?.type || '');
    if (type === 'coins') {
      const mode = op.mode === 'set' ? 'set' : 'add';
      const amount = Number(op.amount);
      if (!Number.isSafeInteger(amount) || Math.abs(amount) > 1_000_000_000) throw Object.assign(new Error('噗灵数量必须是 ±10 亿以内的整数'), { status: 400 });
      return { type, mode, amount };
    }
    if (type === 'owned') {
      const ids = [...new Set(Array.isArray(op.ids) ? op.ids.map(String).filter(safeId) : [])];
      if (!ids.length || ids.length > 100 || ids.length !== (Array.isArray(op.ids) ? new Set(op.ids).size : 0)) throw Object.assign(new Error('服饰礼包包含无效或重复的物品 ID'), { status: 400 });
      return { type, ids };
    }
    if (['crops', 'seeds', 'decor'].includes(type)) {
      if (!op.items || typeof op.items !== 'object' || Array.isArray(op.items)) throw Object.assign(new Error(`${type} 礼包格式不正确`), { status: 400 });
      const items = {};
      for (const [id, value] of Object.entries(op.items)) {
        const amount = Number(value);
        if (!safeId(id) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) throw Object.assign(new Error(`${type} 礼包包含无效数量或 ID`), { status: 400 });
        items[id] = amount;
      }
      if (!Object.keys(items).length || Object.keys(items).length > 100) throw Object.assign(new Error(`${type} 礼包数量不正确`), { status: 400 });
      return { type, items };
    }
    throw Object.assign(new Error(`不支持的礼包类型：${type || '空'}`), { status: 400 });
  });
}

function mailGiftOps(ops) {
  const normalized = giftOps({ ops });
  if (normalized.some((op) => op.type === 'coins' && (op.mode !== 'add' || op.amount < 1))) {
    throw Object.assign(new Error('邮件礼包只能增加资源，不能覆盖或扣减余额'), { status: 400 });
  }
  for (const op of normalized) {
    if (op.type === 'coins') continue;
    const ids = op.type === 'owned' ? op.ids : Object.keys(op.items);
    if (ids.some((id) => !GIFT_IDS[op.type].has(id))) throw Object.assign(new Error('礼包包含不存在的资源，请从资源目录选择有效 ID'), { status: 400 });
  }
  return normalized;
}

function textField(value, max, label, required = true) {
  const text = String(value ?? '').trim();
  if ((required && !text) || text.length > max) throw Object.assign(new Error(`${label}不能为空且不能超过 ${max} 字`), { status: 400 });
  return text;
}

function templateInput(body) {
  const name = textField(body?.name, 40, '礼包名称');
  const description = textField(body?.description, 160, '礼包说明', false);
  const ops = mailGiftOps(body?.ops);
  return { name, description, ops };
}

function normalizedGiftOps(ops) {
  return ops.map((op) => {
    if (op.type === 'coins') return { type: 'coins', mode: op.mode || 'add', amount: op.amount };
    if (op.type === 'owned') return { type: 'owned', ids: [...op.ids].sort() };
    return { type: op.type, items: Object.fromEntries(Object.entries(op.items).sort(([a], [b]) => a.localeCompare(b))) };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function mailInput(body, replay = false) {
  const kind = body?.kind === 'gift' ? 'gift' : body?.kind === 'announcement' ? 'announcement' : '';
  if (!kind) throw Object.assign(new Error('邮件类型只能是 announcement 或 gift'), { status: 400 });
  const title = textField(body?.title, 80, '邮件标题');
  const content = textField(body?.body, 10000, '邮件正文');
  const audience = body?.audience === 'user' ? 'user' : body?.audience === 'all' ? 'all' : '';
  if (!audience) throw Object.assign(new Error('邮件范围只能是 all 或 user'), { status: 400 });
  const targetUserId = audience === 'user' ? String(body?.targetUserId || '') : null;
  if (audience === 'user' && (!safeId(targetUserId) || (!replay && !db.prepare('SELECT id FROM users WHERE id=? AND disabled=0').get(targetUserId)))) throw Object.assign(new Error('目标账号不存在或已停用'), { status: 400 });
  const ops = kind === 'gift' ? mailGiftOps(body?.ops) : [];
  if (kind === 'announcement' && Array.isArray(body?.ops) && body.ops.length) throw Object.assign(new Error('公告邮件不能带礼包附件'), { status: 400 });
  const expiresAt = body?.expiresAt === null || body?.expiresAt === undefined || body?.expiresAt === '' ? null : Number(body.expiresAt);
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < 1 || (!replay && (expiresAt <= Date.now() || expiresAt > Date.now() + 366 * 86400000)))) throw Object.assign(new Error('过期时间必须在现在到一年内'), { status: 400 });
  const idempotencyKey = String(body?.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9_-]{12,120}$/.test(idempotencyKey)) throw Object.assign(new Error('邮件请求缺少有效的幂等键'), { status: 400 });
  return { kind, title, body: content, audience, targetUserId, ops, expiresAt, idempotencyKey };
}

function applyGiftOpsToSave(data, ops) {
  data.coins = Number.isFinite(Number(data.coins)) ? Math.max(0, Math.min(1_000_000_000_000, Math.trunc(Number(data.coins)))) : 0;
  data.owned = Array.isArray(data.owned) ? [...new Set(data.owned.map(String))] : [];
  for (const op of ops) {
    if (op.type === 'coins') data.coins = op.mode === 'set' ? op.amount : data.coins + op.amount;
    if (op.type === 'owned') data.owned = [...new Set([...data.owned, ...op.ids])];
    if (['crops', 'seeds', 'decor'].includes(op.type)) {
      data[op.type] = data[op.type] && typeof data[op.type] === 'object' && !Array.isArray(data[op.type]) ? data[op.type] : {};
      for (const [key, amount] of Object.entries(op.items)) data[op.type][key] = Math.max(0, Math.min(1_000_000, Math.trunc(Number(data[op.type][key] || 0) + amount)));
    }
  }
  data.coins = Math.max(0, Math.min(1_000_000_000_000, Math.trunc(data.coins)));
  data.savedAt = Date.now();
  return data;
}

// All mailbox counters describe currently available deliveries, independently
// of a page/filter. Pending is a union: an unread, unclaimed gift counts once.
const AVAILABLE_MAIL_SQL = "d.user_id=? AND m.status='published' AND m.published_at<=? AND (m.expires_at IS NULL OR m.expires_at>?)";
function mailSummary(userId, now = Date.now()) {
  const row = db.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(d.read_at IS NULL),0) AS unread,
    COALESCE(SUM(m.kind='gift' AND d.claimed_at IS NULL),0) AS unclaimed,
    COALESCE(SUM(d.read_at IS NULL OR (m.kind='gift' AND d.claimed_at IS NULL)),0) AS pending
    FROM mail_deliveries d JOIN mail_messages m ON m.id=d.message_id
    WHERE ${AVAILABLE_MAIL_SQL}`).get(userId, now, now);
  const latest = db.prepare(`SELECT m.id,m.published_at FROM mail_deliveries d JOIN mail_messages m ON m.id=d.message_id
    WHERE ${AVAILABLE_MAIL_SQL} ORDER BY m.published_at DESC,m.id DESC LIMIT 1`).get(userId, now, now);
  // UUID lexical order is not arrival order. Include every effective delivery
  // at the newest timestamp so a later, smaller UUID in the same millisecond
  // still changes the notification marker. Avoid non-persistent SQLite rowid.
  const latestIds = latest ? db.prepare(`SELECT m.id FROM mail_deliveries d JOIN mail_messages m ON m.id=d.message_id
    WHERE ${AVAILABLE_MAIL_SQL} AND m.published_at=? ORDER BY m.id DESC`).all(userId, now, now, latest.published_at).map((mail) => mail.id) : [];
  return { unread: Number(row.unread), unclaimed: Number(row.unclaimed), pending: Number(row.pending),
    total: Number(row.total), latest: latest ? { id: latest.id, publishedAt: latest.published_at, ids: latestIds } : null };
}

function mailPageCursor(value, filter) {
  if (!value) return null;
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('format');
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor.v !== 1 || cursor.filter !== filter || !Number.isSafeInteger(cursor.publishedAt) || cursor.publishedAt < 0 || !safeId(cursor.id)) throw new Error('fields');
    return cursor;
  } catch {
    throw Object.assign(new Error('邮件分页位置无效，请刷新列表'), { status: 400, code: 'MAIL_CURSOR_INVALID' });
  }
}

function nextMailCursor(row, filter) {
  return Buffer.from(JSON.stringify({ v: 1, publishedAt: row.published_at, id: row.id, filter })).toString('base64url');
}

function mailMessageView(row) {
  return { id: row.id, kind: row.kind, title: row.title, body: row.body, ops: JSON.parse(row.ops_json),
    createdAt: row.created_at, publishedAt: row.published_at, expiresAt: row.expires_at, readAt: row.read_at, claimedAt: row.claimed_at };
}

function entitlementView(userId, now = Date.now()) {
  const freeEntitlements = serviceSettings().freeEntitlements;
  const rows = db.prepare(`SELECT feature, valid_from, valid_until, source
    FROM entitlements
    WHERE user_id=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?)
    ORDER BY feature ASC, valid_until DESC`).all(userId, now, now);
  const byFeature = new Map();
  if (freeEntitlements) {
    for (const feature of TEST_FEATURES) {
      byFeature.set(feature, { feature, valid_from: 0, valid_until: null, source: 'free_public' });
    }
  }
  for (const row of rows) {
    if (!byFeature.has(row.feature)) byFeature.set(row.feature, row);
  }
  const entries = [...byFeature.values()].map((row) => ({
    feature: row.feature,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    source: row.source,
  }));
  const features = entries.map((entry) => entry.feature);
  const paid = entries.some((entry) => entry.source === 'payment');
  const expiry = entries.map((entry) => entry.validUntil).filter(Number.isFinite);
  return {
    plan: freeEntitlements ? 'free-public' : (paid ? 'portal-member' : (features.length ? 'test-premium' : 'free')),
    freeEntitlements,
    features,
    entitlements: entries,
    expiresAt: expiry.length ? Math.max(...expiry) : null,
    checkedAt: now,
  };
}

function hasEntitlement(userId, feature, now = Date.now()) {
  if (serviceSettings().freeEntitlements && TEST_FEATURES.has(String(feature))) return true;
  return !!db.prepare(`SELECT 1 FROM entitlements
    WHERE user_id=? AND feature=? AND valid_from<=? AND (valid_until IS NULL OR valid_until>?) LIMIT 1`)
    .get(userId, feature, now, now);
}

const billing = createBilling({ db, entitlementView, userView, serviceSettings });

function sendCloudSyncRequired(res, headers, userId) {
  send(res, 402, {
    error: '云同步需要有效的账号权益',
    code: 'CLOUD_SYNC_REQUIRED',
    feature: 'cloud_sync',
    entitlements: entitlementView(userId),
  }, headers);
}

function testFeatureList(value) {
  const list = Array.isArray(value) ? value : [value];
  const features = [...new Set(list.map((item) => String(item || '').trim()).filter(Boolean))];
  if (!features.length || features.some((feature) => !TEST_FEATURES.has(feature))) {
    throw Object.assign(new Error('测试授权 feature 只能是 cloud_sync 或 auto_update'), { status: 400 });
  }
  return features;
}

function testEntitlementTarget(body) {
  if (typeof body?.userId === 'string' && body.userId) {
    return db.prepare('SELECT id,username,created_at FROM users WHERE id=? AND disabled=0').get(body.userId);
  }
  if (typeof body?.username === 'string' && body.username) {
    return db.prepare('SELECT id,username,created_at FROM users WHERE username=? AND disabled=0').get(body.username);
  }
  return null;
}

function sessionCookie(token) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  return `session=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=${COOKIE_SAMESITE}${secure}`;
}
function clearSessionCookie() { const secure = COOKIE_SECURE ? '; Secure' : ''; return `session=; Path=/; Max-Age=0; HttpOnly; SameSite=${COOKIE_SAMESITE}${secure}`; }

function authUser(req) {
  const cookies = parseCookies(req);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = cookies.session || bearer;
  if (!token) return null;
  const now = Date.now();
  const row = db.prepare(`SELECT u.id, u.username, u.created_at, s.id AS session_id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`).get(tokenHash(token), now);
  if (!row) return null;
  db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(now, row.session_id);
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now, row.id);
  return row;
}

function validLogin(value) {
  return typeof value === 'string' && value.length >= 3 && value.length <= 32 && /^[A-Za-z0-9_\u4e00-\u9fff.-]+$/.test(value);
}
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0; const chunks = [];
    req.on('data', (chunk) => { total += chunk.length; if (total > MAX_SAVE_BYTES + 32 * 1024) { reject(Object.assign(new Error('请求太大'), { status: 413 })); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readBody(req) {
  const raw = await readRawBody(req);
  try { return JSON.parse(raw.toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('请求不是有效 JSON'), { status: 400 }); }
}

function validateSave(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('存档格式不正确'), { status: 400 });
  if (!Number.isInteger(data.v) || data.v < 1 || data.v > 99) throw Object.assign(new Error('存档版本不受支持'), { status: 400 });
  if (!Array.isArray(data.owned) || !data.outfit || typeof data.outfit !== 'object') throw Object.assign(new Error('存档缺少必要字段'), { status: 400 });
  if (!Number.isFinite(data.coins) || data.coins < 0 || data.coins > 1e12) throw Object.assign(new Error('存档数值不合法'), { status: 400 });
  const text = JSON.stringify(data);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_SAVE_BYTES) throw Object.assign(new Error('单个存档不能超过 2 MB'), { status: 413 });
  return { text, bytes, checksum: createHash('sha256').update(text).digest('hex') };
}

function newSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id,user_id,token_hash,created_at,expires_at,last_seen) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), userId, tokenHash(token), now, now + SESSION_DAYS * 86400000, now);
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now, userId);
  return token;
}

function requireUser(req, res, headers) {
  const user = authUser(req);
  if (!user) { send(res, 401, { error: '请先登录' }, headers); return null; }
  const expectedAccount = req.headers['x-nikki-account-id'];
  if (expectedAccount !== undefined && expectedAccount !== user.id) {
    send(res, 409, { error: '账号已在其他页面切换，请重新确认登录状态', code: 'ACCOUNT_CHANGED' }, headers); return null;
  }
  return user;
}

const handleAdminWorkbench = createAdminWorkbench({ db, send, requireAdmin, readBody, limited, clientIp, recordAdminAudit, adminUserView, adminSaveSummary, serviceSettings });

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  const headers = originHeaders(req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...headers, 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Test-Admin-Token, X-Admin-Token, X-Nikki-Account-Id', 'Access-Control-Allow-Methods': 'DELETE,GET,POST,PUT,OPTIONS', 'Access-Control-Max-Age': '600' }).end();
    return true;
  }
  if (APP_ORIGINS.size && req.headers.origin && !headers['Access-Control-Allow-Origin']) { send(res, 403, { error: '来源不被允许' }); return true; }
  try {
    if (await handleAdminWorkbench(req, res, url, headers)) return true;
    if (url.pathname === '/api/admin/launch' && req.method === 'POST') {
      if (!ADMIN_API_TOKEN || !adminAuth(req)) { send(res, 401, { error: '需要管理员令牌', code: 'ADMIN_AUTH_REQUIRED' }, headers); return true; }
      if (limited(`admin-launch:${clientIp(req)}`, 12, 60000)) { send(res, 429, { error: '管理台启动请求太频繁，请稍后再试' }, headers); return true; }
      const launch = createAdminLaunchTicket();
      send(res, 200, { ok: true, ticket: launch.ticket, expiresAt: launch.expiresAt, expiresIn: ADMIN_LAUNCH_SECONDS }, headers); return true;
    }
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const origin = String(req.headers.origin || '');
      if (origin !== ADMIN_PUBLIC_ORIGIN || !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        send(res, 403, { error: '管理台登录必须来自线上管理台', code: 'ADMIN_ORIGIN_REQUIRED' }); return true;
      }
      const body = await readBody(req);
      const session = redeemAdminLaunchTicket(body.ticket);
      if (!session) { send(res, 401, { error: '临时登录票据无效或已过期', code: 'ADMIN_TICKET_INVALID' }, headers); return true; }
      send(res, 200, { ok: true, role: 'admin', capabilities: ADMIN_CAPABILITIES, expiresIn: ADMIN_SESSION_DAYS * 86400 }, { ...headers, 'Set-Cookie': adminSessionCookie(session) }); return true;
    }
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      if (!requireAdmin(req, res, headers)) return true;
      const value = adminCookie(req);
      if (value) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(tokenHash(value));
      send(res, 200, { ok: true }, { ...headers, 'Set-Cookie': clearAdminSessionCookie() }); return true;
    }
    if (url.pathname === '/api/admin/session' && req.method === 'GET') {
      if (!requireAdmin(req, res, headers)) return true;
      send(res, 200, { ok: true, role: 'admin', capabilities: ADMIN_CAPABILITIES }, headers); return true;
    }
    if (url.pathname === '/api/admin/service-settings' && (req.method === 'GET' || req.method === 'PUT')) {
      if (!requireAdmin(req, res, headers)) return true;
      if (req.method === 'PUT') {
        if (req.headers.origin !== ADMIN_PUBLIC_ORIGIN || !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          send(res, 403, { error: '服务设置只能从管理台提交', code: 'ADMIN_CSRF_BLOCKED' }, headers); return true;
        }
        if (limited(`admin-settings:${clientIp(req)}`, 20, 60000)) { send(res, 429, { error: '设置操作太频繁，请稍后再试' }, headers); return true; }
        updateServiceSettings(await readBody(req), req);
      }
      send(res, 200, { settings: serviceSettings(), billing: billing.status() }, headers); return true;
    }
    if (url.pathname === '/api/admin/gift-catalog' && req.method === 'GET') {
      if (!requireAdmin(req, res, headers)) return true;
      send(res, 200, GIFT_CATALOG, headers); return true;
    }
    const templateRoute = url.pathname.match(/^\/api\/admin\/gift-templates\/([^/]+)$/);
    if (templateRoute && ['PUT', 'DELETE'].includes(req.method)) {
      if (!requireAdmin(req, res, headers)) return true;
      const id = decodeURIComponent(templateRoute[1]);
      const old = db.prepare('SELECT id FROM gift_templates WHERE id=? AND active=1').get(id);
      if (!old) { send(res, 404, { error: '礼包模板不存在' }, headers); return true; }
      if (req.method === 'DELETE') {
        db.prepare('UPDATE gift_templates SET active=0,updated_at=? WHERE id=?').run(Date.now(), id);
        recordAdminAudit('gift_template.archive', null, { templateId: id }, req);
        send(res, 200, { ok: true }, headers); return true;
      }
      const input = templateInput(await readBody(req));
      db.prepare('UPDATE gift_templates SET name=?,description=?,ops_json=?,updated_at=? WHERE id=?').run(input.name, input.description, JSON.stringify(input.ops), Date.now(), id);
      recordAdminAudit('gift_template.update', null, { templateId: id, name: input.name, ops: input.ops }, req);
      send(res, 200, { ok: true, template: { id, ...input } }, headers); return true;
    }
    if (url.pathname === '/api/admin/gift-templates' && req.method === 'POST') {
      if (!requireAdmin(req, res, headers)) return true;
      const input = templateInput(await readBody(req));
      const now = Date.now(); const id = randomUUID();
      db.prepare('INSERT INTO gift_templates (id,name,description,ops_json,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(id, input.name, input.description, JSON.stringify(input.ops), now, now);
      recordAdminAudit('gift_template.create', null, { templateId: id, name: input.name, ops: input.ops }, req);
      send(res, 201, { ok: true, template: { id, ...input, createdAt: now, updatedAt: now } }, headers); return true;
    }
    if (url.pathname === '/api/admin/mail' && req.method === 'POST') {
      if (!requireAdmin(req, res, headers)) return true;
      if (limited(`admin-mail:${clientIp(req)}`, 20, 60000)) { send(res, 429, { error: '发信操作太频繁，请稍后再试' }, headers); return true; }
      const body = await readBody(req);
      const input = mailInput(body, true);
      const previous = db.prepare('SELECT id,kind,title,body,ops_json,audience,target_user_id,expires_at,created_at FROM mail_messages WHERE idempotency_key=?').get(input.idempotencyKey);
      if (previous) {
        const matches = previous.kind === input.kind && previous.title === input.title && previous.body === input.body && previous.audience === input.audience
          && previous.target_user_id === input.targetUserId && previous.expires_at === input.expiresAt
          && JSON.stringify(normalizedGiftOps(JSON.parse(previous.ops_json))) === JSON.stringify(normalizedGiftOps(input.ops));
        if (!matches) { send(res, 409, { error: '这个请求编号已用于不同内容或收件人的邮件，请勿重复使用', code: 'IDEMPOTENCY_CONFLICT' }, headers); return true; }
        const recipientCount = Number(db.prepare('SELECT COUNT(*) AS n FROM mail_deliveries WHERE message_id=?').get(previous.id).n);
        send(res, 200, { ok: true, idempotent: true, message: { id: previous.id, ...input, createdAt: previous.created_at, recipientCount } }, headers); return true;
      }
      mailInput(body);
      const now = Date.now(); const id = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO mail_messages (id,kind,title,body,ops_json,audience,target_user_id,status,idempotency_key,created_by,created_at,published_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, input.kind, input.title, input.body, JSON.stringify(input.ops), input.audience, input.targetUserId, 'published', input.idempotencyKey, 'admin', now, now, input.expiresAt);
        if (input.audience === 'all') db.prepare('INSERT INTO mail_deliveries (message_id,user_id,created_at) SELECT ?,id,? FROM users WHERE disabled=0').run(id, now);
        else db.prepare('INSERT INTO mail_deliveries (message_id,user_id,created_at) VALUES (?,?,?)').run(id, input.targetUserId, now);
        recordAdminAudit('mail.publish', input.targetUserId, { messageId: id, kind: input.kind, title: input.title, audience: input.audience, ops: input.ops, expiresAt: input.expiresAt }, req);
        db.exec('COMMIT');
      } catch (error) { try { db.exec('ROLLBACK'); } catch { /* preserve original error */ } throw error; }
      send(res, 201, { ok: true, message: { id, ...input, createdAt: now, recipientCount: Number(db.prepare('SELECT COUNT(*) AS n FROM mail_deliveries WHERE message_id=?').get(id).n) } }, headers); return true;
    }
    const giftAccount = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/gift$/);
    if (giftAccount && req.method === 'POST') {
      if (!requireAdmin(req, res, headers)) return true;
      if (limited(`admin-gift:${clientIp(req)}`, 30, 60000)) { send(res, 429, { error: '礼包操作太频繁，请稍后再试' }, headers); return true; }
      const id = decodeURIComponent(giftAccount[1]);
      const row = db.prepare('SELECT id,username,created_at,disabled FROM users WHERE id=?').get(id);
      if (!row) { send(res, 404, { error: '账号不存在' }, headers); return true; }
      const body = await readBody(req);
      const ops = mailGiftOps(body.ops);
      const idempotencyKey = String(body.idempotencyKey || '').trim();
      if (!/^[A-Za-z0-9_-]{12,120}$/.test(idempotencyKey)) { send(res, 400, { error: '礼包请求缺少有效的幂等键', code: 'IDEMPOTENCY_KEY_REQUIRED' }, headers); return true; }
      const previousGift = db.prepare('SELECT id,user_id,items_json,before_revision,after_revision,status,created_at FROM gift_grants WHERE idempotency_key=?').get(idempotencyKey);
      if (previousGift) {
        if (previousGift.user_id !== id || JSON.stringify(normalizedGiftOps(JSON.parse(previousGift.items_json))) !== JSON.stringify(normalizedGiftOps(ops))) { send(res, 409, { error: '这个请求编号已用于不同账号或礼包，请勿重复使用', code: 'IDEMPOTENCY_CONFLICT' }, headers); return true; }
        send(res, 200, { ok: true, idempotent: true, gift: { id: previousGift.id, ops: JSON.parse(previousGift.items_json), beforeRevision: previousGift.before_revision, revision: previousGift.after_revision, status: previousGift.status, issuedAt: previousGift.created_at } }, headers); return true;
      }
      if (row.disabled) { send(res, 409, { error: '账号已停用，请恢复账号后再发放礼包', code: 'ACCOUNT_DISABLED' }, headers); return true; }
      const old = db.prepare('SELECT revision,payload,payload_bytes,checksum,client_updated_at,server_updated_at FROM saves WHERE user_id=?').get(id);
      if (!old) { send(res, 404, { error: '该账号还没有云存档，无法发放礼包', code: 'SAVE_NOT_FOUND' }, headers); return true; }
      if (body.baseRevision !== undefined && Number(body.baseRevision) !== old.revision) { send(res, 409, { error: '存档在查看后发生了变化，请刷新详情后再发放', code: 'SAVE_REVISION_CONFLICT', currentRevision: old.revision }, headers); return true; }
      let parsedOld;
      try { parsedOld = JSON.parse(old.payload); }
      catch { send(res, 409, { error: '该账号云存档已经损坏，无法直接改写', code: 'SAVE_CORRUPTED' }, headers); return true; }
      const data = applyGiftOpsToSave(parsedOld, ops);
      const checked = validateSave(data);
      const now = Date.now();
      const giftId = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE saves SET revision=?,payload=?,payload_bytes=?,checksum=?,client_updated_at=?,server_updated_at=? WHERE user_id=?')
          .run(old.revision + 1, checked.text, checked.bytes, checked.checksum, now, now, id);
        db.prepare('INSERT INTO gift_grants (id,user_id,idempotency_key,items_json,operator,before_revision,after_revision,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(giftId, id, idempotencyKey, JSON.stringify(ops), 'admin-token', old.revision, old.revision + 1, 'applied', now);
        recordAdminAudit('gift.issue', id, { username: row.username, baseRevision: old.revision, revision: old.revision + 1, ops }, req);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* 保持原始错误 */ }
        throw error;
      }
      const updated = db.prepare('SELECT revision,payload,payload_bytes,checksum,client_updated_at,server_updated_at FROM saves WHERE user_id=?').get(id);
      send(res, 200, { ok: true, account: adminUserView(row, updated), gift: { id: giftId, revision: updated.revision, ops, issuedAt: now }, save: adminSaveSummary(updated) }, headers); return true;
    }
    if (url.pathname === '/api/mail' && req.method === 'GET') {
      const user = requireUser(req, res, headers); if (!user) return true;
      if (limited(`mail-list:${user.id}`, 60, 60000)) { send(res, 429, { error: '邮件请求太频繁，请稍后再试' }, headers); return true; }
      const now = Date.now(); const limit = Math.max(1, Math.min(50, Math.trunc(Number(url.searchParams.get('limit') || 30) || 30)));
      const filter = url.searchParams.get('filter') || 'all';
      if (!['all', 'unclaimed'].includes(filter)) { send(res, 400, { error: '不支持的邮件筛选', code: 'MAIL_FILTER_INVALID' }, headers); return true; }
      const cursor = mailPageCursor(url.searchParams.get('cursor'), filter);
      const params = [user.id, now, now];
      if (cursor) params.push(cursor.publishedAt, cursor.publishedAt, cursor.id);
      params.push(limit + 1);
      const rows = db.prepare(`SELECT m.id,m.kind,m.title,m.body,m.ops_json,m.created_at,m.published_at,m.expires_at,d.read_at,d.claimed_at
        FROM mail_deliveries d JOIN mail_messages m ON m.id=d.message_id
        WHERE ${AVAILABLE_MAIL_SQL}
        ${filter === 'unclaimed' ? "AND m.kind='gift' AND d.claimed_at IS NULL" : ''}
        ${cursor ? 'AND (m.published_at<? OR (m.published_at=? AND m.id<?))' : ''}
        ORDER BY m.published_at DESC,m.id DESC LIMIT ?`).all(...params);
      const hasMore = rows.length > limit; const page = rows.slice(0, limit);
      send(res, 200, { ...mailSummary(user.id, now), messages: page.map(mailMessageView),
        nextCursor: hasMore ? nextMailCursor(page[page.length - 1], filter) : null }, headers); return true;
    }
    if (['/api/mail/summary', '/api/mail/unread-count'].includes(url.pathname) && req.method === 'GET') {
      const user = requireUser(req, res, headers); if (!user) return true;
      send(res, 200, mailSummary(user.id), headers); return true;
    }
    if (url.pathname === '/api/mail/claim-all' && req.method === 'POST') {
      const user = requireUser(req, res, headers); if (!user) return true;
      const body = await readBody(req); const idempotencyKey = String(body?.idempotencyKey || '').trim();
      if (!/^[A-Za-z0-9_-]{12,120}$/.test(idempotencyKey)) { send(res, 400, { error: '领取请求缺少有效的幂等键' }, headers); return true; }
      db.exec('BEGIN IMMEDIATE');
      try {
        // Replay precedes entitlement, revision and mail availability checks.
        // A completed (including empty) batch is immutable, even after revoke.
        const previous = db.prepare('SELECT result_json FROM mail_claim_batches WHERE user_id=? AND idempotency_key=?').get(user.id, idempotencyKey);
        if (previous) { db.exec('COMMIT'); send(res, 200, { ...JSON.parse(previous.result_json), idempotent: true }, headers); return true; }
        if (db.prepare('SELECT 1 FROM mail_deliveries WHERE user_id=? AND claim_idempotency_key=?').get(user.id, idempotencyKey)) {
          throw Object.assign(new Error('这个请求编号已用于单封邮件'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) {
          throw Object.assign(new Error('领取前请先同步存档并提供有效版本'), { status: 400, code: 'MAIL_REVISION_REQUIRED' });
        }
        if (!hasEntitlement(user.id, 'cloud_sync')) throw Object.assign(new Error('领取邮件礼包需要云存档权益'), { status: 403, code: 'CLOUD_SYNC_REQUIRED' });
        const old = db.prepare('SELECT revision,payload,checksum FROM saves WHERE user_id=?').get(user.id);
        if (!old) throw Object.assign(new Error('请先完成一次云存档同步，再领取邮件礼包'), { status: 409, code: 'SAVE_NOT_FOUND' });
        if (body.baseRevision !== old.revision) throw Object.assign(new Error('领取前存档发生了变化，请重新同步后再试'), { status: 409, code: 'MAIL_REVISION_CONFLICT', currentRevision: old.revision });
        let data;
        try {
          data = JSON.parse(old.payload); validateSave(data);
          if (createHash('sha256').update(old.payload).digest('hex') !== old.checksum) throw new Error('checksum');
        } catch { throw Object.assign(new Error('当前云存档损坏，无法发放礼包，请联系管理员'), { status: 409, code: 'SAVE_CORRUPTED' }); }
        const now = Date.now();
        const available = db.prepare(`SELECT m.id,m.ops_json FROM mail_deliveries d JOIN mail_messages m ON m.id=d.message_id
          WHERE ${AVAILABLE_MAIL_SQL} AND m.kind='gift' AND d.claimed_at IS NULL
          ORDER BY m.published_at DESC,m.id DESC LIMIT 101`).all(user.id, now, now);
        const messages = available.slice(0, 100).map((row) => ({ id: row.id, ops: mailGiftOps(JSON.parse(row.ops_json)) }));
        for (const message of messages) data = applyGiftOpsToSave(data, message.ops);
        const revision = old.revision + (messages.length ? 1 : 0);
        if (messages.length) {
          const checked = validateSave(data);
          const changed = db.prepare('UPDATE saves SET revision=?,payload=?,payload_bytes=?,checksum=?,client_updated_at=?,server_updated_at=? WHERE user_id=? AND revision=?')
            .run(revision, checked.text, checked.bytes, checked.checksum, now, now, user.id, old.revision);
          if (Number(changed.changes) !== 1) throw Object.assign(new Error('领取前存档发生了变化，请重新同步后再试'), { status: 409, code: 'MAIL_REVISION_CONFLICT' });
          const save = adminSaveSummary({ revision, payload: checked.text, payload_bytes: checked.bytes, checksum: checked.checksum, client_updated_at: now, server_updated_at: now });
          for (const message of messages) {
            db.prepare('INSERT INTO gift_grants (id,user_id,idempotency_key,items_json,operator,before_revision,after_revision,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
              .run(randomUUID(), user.id, `mail:${message.id}:${user.id}`, JSON.stringify(message.ops), 'mail', old.revision, revision, 'applied', now);
            // Individual retry remains compatible with old clients. The colon
            // namespace cannot collide with valid client-supplied claim keys.
            const receipt = { ok: true, claim: { messageId: message.id, revision, ops: message.ops, claimedAt: now }, save };
            const updated = db.prepare('UPDATE mail_deliveries SET read_at=COALESCE(read_at,?),claimed_at=?,claim_idempotency_key=?,claim_result_json=? WHERE message_id=? AND user_id=? AND claimed_at IS NULL')
              .run(now, now, `batch:${idempotencyKey}:${message.id}`, JSON.stringify(receipt), message.id, user.id);
            if (Number(updated.changes) !== 1) throw Object.assign(new Error('邮件领取状态发生变化，请刷新后重试'), { status: 409, code: 'MAIL_CLAIM_CONFLICT' });
          }
          recordAdminAudit('mail.claim-all', user.id, { messageIds: messages.map((message) => message.id), beforeRevision: old.revision, revision }, req);
        }
        const result = { ok: true, count: messages.length, messageIds: messages.map((message) => message.id), claimedAt: now, revision, hasMore: available.length > 100 };
        db.prepare('INSERT INTO mail_claim_batches(user_id,idempotency_key,result_json,created_at) VALUES (?,?,?,?)').run(user.id, idempotencyKey, JSON.stringify(result), now);
        db.exec('COMMIT'); send(res, 200, result, headers); return true;
      } catch (error) { try { db.exec('ROLLBACK'); } catch { /* preserve original error */ } throw error; }
    }
    const mailRoute = url.pathname.match(/^\/api\/mail\/([^/]+)\/(read|claim)$/);
    if (mailRoute && req.method === 'POST') {
      const user = requireUser(req, res, headers); if (!user) return true;
      const messageId = decodeURIComponent(mailRoute[1]); const action = mailRoute[2]; const now = Date.now();
      const row = db.prepare(`SELECT m.id,m.kind,m.title,m.body,m.ops_json,m.status,m.published_at,m.expires_at,d.read_at,d.claimed_at,d.claim_result_json
        FROM mail_messages m JOIN mail_deliveries d ON d.message_id=m.id AND d.user_id=? WHERE m.id=?`).get(user.id, messageId);
      if (!row || row.published_at > now) { send(res, 404, { error: '邮件不存在' }, headers); return true; }
      // 已领取的重试返回原回执，即使邮件后来到期或撤回；不会再修改存档。
      if (action === 'claim' && row.claimed_at && row.claim_result_json) {
        const body = await readBody(req); const key = String(body?.idempotencyKey || '').trim();
        if (!/^[A-Za-z0-9_-]{12,120}$/.test(key)) { send(res, 400, { error: '领取请求缺少有效的幂等键' }, headers); return true; }
        if (db.prepare('SELECT 1 FROM mail_claim_batches WHERE user_id=? AND idempotency_key=?').get(user.id, key)) { send(res, 409, { error: '这个请求编号已用于批量领取', code: 'IDEMPOTENCY_CONFLICT' }, headers); return true; }
        const used = db.prepare('SELECT message_id FROM mail_deliveries WHERE user_id=? AND claim_idempotency_key=?').get(user.id, key);
        if (used && used.message_id !== messageId) { send(res, 409, { error: '这个请求编号已用于另一封邮件', code: 'IDEMPOTENCY_CONFLICT' }, headers); return true; }
        send(res, 200, { ...JSON.parse(row.claim_result_json), idempotent: true }, headers); return true;
      }
      if (row.status !== 'published') { send(res, row.status === 'revoked' ? 410 : 404, { error: row.status === 'revoked' ? '邮件已被撤回' : '邮件不存在', ...(row.status === 'revoked' ? { code: 'MAIL_REVOKED' } : {}) }, headers); return true; }
      if (row.expires_at !== null && row.expires_at <= now) { send(res, 410, { error: '邮件已过期', code: 'MAIL_EXPIRED' }, headers); return true; }
      if (action === 'read') {
        db.prepare('UPDATE mail_deliveries SET read_at=COALESCE(read_at,?) WHERE message_id=? AND user_id=?').run(now, messageId, user.id);
        send(res, 200, { ok: true, readAt: row.read_at || now }, headers); return true;
      }
      if (row.kind !== 'gift') { send(res, 400, { error: '公告邮件没有礼包可领取', code: 'MAIL_NOT_GIFT' }, headers); return true; }
      if (!hasEntitlement(user.id, 'cloud_sync')) { send(res, 403, { error: '领取邮件礼包需要云存档权益', code: 'CLOUD_SYNC_REQUIRED' }, headers); return true; }
      const body = await readBody(req); const idempotencyKey = String(body?.idempotencyKey || '').trim();
      if (!/^[A-Za-z0-9_-]{12,120}$/.test(idempotencyKey)) { send(res, 400, { error: '领取请求缺少有效的幂等键' }, headers); return true; }
      if (db.prepare('SELECT 1 FROM mail_claim_batches WHERE user_id=? AND idempotency_key=?').get(user.id, idempotencyKey)) { send(res, 409, { error: '这个请求编号已用于批量领取', code: 'IDEMPOTENCY_CONFLICT' }, headers); return true; }
      const usedClaimKey = db.prepare('SELECT message_id FROM mail_deliveries WHERE user_id=? AND claim_idempotency_key=?').get(user.id, idempotencyKey);
      if (usedClaimKey && usedClaimKey.message_id !== messageId) { send(res, 409, { error: '这个请求编号已用于另一封邮件', code: 'IDEMPOTENCY_CONFLICT' }, headers); return true; }
      const ops = mailGiftOps(JSON.parse(row.ops_json)); const giftGrantId = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        const fresh = db.prepare('SELECT claimed_at,claim_result_json FROM mail_deliveries WHERE message_id=? AND user_id=?').get(messageId, user.id);
        if (fresh?.claimed_at && fresh.claim_result_json) { db.exec('COMMIT'); send(res, 200, { ...JSON.parse(fresh.claim_result_json), idempotent: true }, headers); return true; }
        const available = db.prepare("SELECT 1 FROM mail_messages WHERE id=? AND status='published' AND published_at<=? AND (expires_at IS NULL OR expires_at>?)").get(messageId, Date.now(), Date.now());
        if (!available) { db.exec('ROLLBACK'); send(res, 410, { error: '邮件已到期或被撤回，请刷新邮件列表', code: 'MAIL_UNAVAILABLE' }, headers); return true; }
        const old = db.prepare('SELECT revision,payload,payload_bytes,checksum,client_updated_at,server_updated_at FROM saves WHERE user_id=?').get(user.id);
        if (!old) { db.exec('ROLLBACK'); send(res, 409, { error: '请先完成一次云存档同步，再领取邮件礼包', code: 'SAVE_NOT_FOUND' }, headers); return true; }
        const latest = db.prepare('SELECT revision,payload FROM saves WHERE user_id=?').get(user.id);
        if (body.baseRevision !== undefined && Number(body.baseRevision) !== latest.revision) {
          db.exec('ROLLBACK');
          send(res, 409, { error: '领取前存档发生了变化，请重新同步后再试', code: 'MAIL_REVISION_CONFLICT', currentRevision: latest.revision }, headers);
          return true;
        }
        const latestData = applyGiftOpsToSave(JSON.parse(latest.payload), ops); const latestChecked = validateSave(latestData); const revision = latest.revision + 1;
        db.prepare('UPDATE saves SET revision=?,payload=?,payload_bytes=?,checksum=?,client_updated_at=?,server_updated_at=? WHERE user_id=?').run(revision, latestChecked.text, latestChecked.bytes, latestChecked.checksum, now, now, user.id);
        db.prepare('INSERT INTO gift_grants (id,user_id,idempotency_key,items_json,operator,before_revision,after_revision,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(giftGrantId, user.id, `mail:${messageId}:${user.id}`, JSON.stringify(ops), 'mail', latest.revision, revision, 'applied', now);
        const result = { ok: true, claim: { messageId, revision, ops, claimedAt: now }, save: adminSaveSummary({ revision, payload: latestChecked.text, payload_bytes: latestChecked.bytes, checksum: latestChecked.checksum, client_updated_at: now, server_updated_at: now }) };
        db.prepare('UPDATE mail_deliveries SET read_at=COALESCE(read_at,?),claimed_at=?,claim_idempotency_key=?,claim_result_json=? WHERE message_id=? AND user_id=? AND claimed_at IS NULL').run(now, now, idempotencyKey, JSON.stringify(result), messageId, user.id);
        recordAdminAudit('mail.claim', user.id, { messageId, revision, ops }, req);
        db.exec('COMMIT');
        send(res, 200, result, headers); return true;
      } catch (error) { try { db.exec('ROLLBACK'); } catch { /* preserve original error */ } throw error; }
    }
    if (url.pathname === '/api/healthz' && req.method === 'GET') { send(res, 200, { ok: true, service: 'nikki-town-api', time: Date.now() }, headers); return true; }
    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      if (limited(`register:${clientIp(req)}`, 5, 60000)) { send(res, 429, { error: '操作太频繁，请稍后再试' }, headers); return true; }
      const body = await readBody(req);
      if (!validLogin(body.username) || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) { send(res, 400, { error: '用户名 3-32 位，密码 8-128 位' }, headers); return true; }
      if (db.prepare('SELECT 1 FROM users WHERE username=?').get(body.username)) { send(res, 409, { error: '用户名已存在' }, headers); return true; }
      const id = randomUUID(), salt = randomBytes(16).toString('base64url'), now = Date.now();
      db.prepare('INSERT INTO users (id,username,password_salt,password_hash,created_at) VALUES (?,?,?,?,?)').run(id, body.username, salt, passwordHash(body.password, salt), now);
      const token = newSession(id); const user = db.prepare('SELECT id,username,created_at FROM users WHERE id=?').get(id);
      send(res, 201, { user: userView(user) }, { ...headers, 'Set-Cookie': sessionCookie(token) }); return true;
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      if (limited(`login:${clientIp(req)}`, 10, 60000)) { send(res, 429, { error: '登录尝试太频繁，请稍后再试' }, headers); return true; }
      const body = await readBody(req); const row = db.prepare('SELECT * FROM users WHERE username=?').get(body.username || '');
      const actual = row && !row.disabled ? passwordHash(String(body.password || ''), row.password_salt) : randomBytes(32).toString('base64url');
      const ok = row && !row.disabled && actual.length === row.password_hash.length && timingSafeEqual(Buffer.from(actual), Buffer.from(row.password_hash));
      if (!ok) { send(res, 401, { error: '用户名或密码不正确' }, headers); return true; }
      const token = newSession(row.id); send(res, 200, { user: userView(row) }, { ...headers, 'Set-Cookie': sessionCookie(token) }); return true;
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req); if (cookies.session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(cookies.session));
      send(res, 200, { ok: true }, { ...headers, 'Set-Cookie': clearSessionCookie() }); return true;
    }
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const user = requireUser(req, res, headers); if (user) send(res, 200, { user: userView(user) }, headers); return true;
    }
    if (url.pathname === '/api/account/entitlements' && req.method === 'GET') {
      const user = requireUser(req, res, headers); if (!user) return true;
      send(res, 200, entitlementView(user.id), headers); return true;
    }
    if (url.pathname === '/api/billing/wechat/notify' && req.method === 'POST') {
      billing.notifyWechat((await readRawBody(req)).toString('utf8'), req.headers);
      send(res, 200, { code: 'SUCCESS', message: '成功' }, headers); return true;
    }
    if (url.pathname === '/api/billing/alipay/notify' && req.method === 'POST') {
      try {
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
          throw Object.assign(new Error('通知格式无效'), { status: 400 });
        }
        billing.notifyAlipay((await readRawBody(req)).toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('success');
      } catch (error) {
        // No raw notification, signatures, buyer details or key material in logs.
        console.error('[billing-notify]', error.code || 'ALIPAY_NOTIFY_REJECTED');
        res.writeHead(Number(error.status) || 500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('failure');
      }
      return true;
    }
    if (url.pathname === '/api/billing/status' && req.method === 'GET') {
      send(res, 200, billing.status(), headers); return true;
    }
    if (url.pathname === '/api/billing/membership' && req.method === 'GET') {
      const user = requireUser(req, res, headers); if (!user) return true;
      send(res, 200, billing.membership(user), headers); return true;
    }
    if (url.pathname === '/api/billing/orders' && req.method === 'GET') {
      const user = requireUser(req, res, headers); if (!user) return true;
      send(res, 200, { orders: billing.list(user.id) }, headers); return true;
    }
    if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
      const user = requireUser(req, res, headers); if (!user) return true;
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        send(res, 415, { error: '下单请求需要 JSON' }, headers); return true;
      }
      if (limited(`billing-checkout:${user.id}`, 8, 60000)) { send(res, 429, { error: '下单过于频繁，请稍后再试' }, headers); return true; }
      send(res, 200, await billing.createOrder(user, await readBody(req)), headers); return true;
    }
    const billingOrderRoute = url.pathname.match(/^\/api\/billing\/orders\/([^/]+)$/);
    if (billingOrderRoute && (req.method === 'GET' || req.method === 'POST')) {
      const user = requireUser(req, res, headers); if (!user) return true;
      send(res, 200, await billing.userOrder(user.id, decodeURIComponent(billingOrderRoute[1])), headers); return true;
    }
    // 本地测试授权管理：必须显式打开 TEST_AUTH_ENABLED=1，并通过服务端注入的
    // TEST_AUTH_ADMIN_TOKEN 发送管理请求。该接口不模拟真实支付，也不应在生产开放。
    if (url.pathname === '/api/test/entitlements' && (req.method === 'POST' || req.method === 'DELETE')) {
      if (!TEST_AUTH_ENABLED) { send(res, 404, { error: '测试授权接口未启用' }, headers); return true; }
      if (!testAdmin(req)) { send(res, 403, { error: '需要测试授权管理员令牌' }, headers); return true; }
      const body = await readBody(req);
      const target = testEntitlementTarget(body);
      if (!target) { send(res, 404, { error: '用户不存在' }, headers); return true; }
      const features = testFeatureList(body.features || body.feature);
      const now = Date.now();
      if (req.method === 'DELETE' || body.revoke === true) {
        const placeholders = features.map(() => '?').join(',');
        db.prepare(`DELETE FROM entitlements WHERE user_id=? AND source='test' AND feature IN (${placeholders})`).run(target.id, ...features);
      } else {
        const validFrom = Number.isFinite(body.validFrom) ? Number(body.validFrom) : now;
        const validUntil = body.validUntil === null || body.validUntil === undefined || body.validUntil === ''
          ? null : Number(body.validUntil);
        if (!Number.isInteger(validFrom) || (validUntil !== null && (!Number.isInteger(validUntil) || validUntil <= validFrom))) {
          send(res, 400, { error: 'validFrom/validUntil 必须是有效的毫秒时间戳，且结束时间晚于开始时间' }, headers); return true;
        }
        for (const feature of features) {
          const old = db.prepare("SELECT id FROM entitlements WHERE user_id=? AND feature=? AND source='test'").get(target.id, feature);
          if (old) {
            db.prepare('UPDATE entitlements SET valid_from=?,valid_until=?,updated_at=? WHERE id=?').run(validFrom, validUntil, now, old.id);
          } else {
            db.prepare('INSERT INTO entitlements (id,user_id,feature,valid_from,valid_until,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
              .run(randomUUID(), target.id, feature, validFrom, validUntil, 'test', now, now);
          }
        }
      }
      send(res, 200, { user: userView(target), ...entitlementView(target.id) }, headers); return true;
    }
    if (url.pathname === '/api/save' && req.method === 'GET') {
      const user = requireUser(req, res, headers); if (!user) return true;
      if (!hasEntitlement(user.id, 'cloud_sync')) { sendCloudSyncRequired(res, headers, user.id); return true; }
      const row = db.prepare('SELECT revision,payload,checksum,client_updated_at,server_updated_at FROM saves WHERE user_id=?').get(user.id);
      if (!row) send(res, 404, { error: '还没有云存档' }, headers);
      else send(res, 200, { revision: row.revision, data: JSON.parse(row.payload), checksum: row.checksum, clientUpdatedAt: row.client_updated_at, serverUpdatedAt: row.server_updated_at }, headers);
      return true;
    }
    if (url.pathname === '/api/save' && req.method === 'PUT') {
      const user = requireUser(req, res, headers); if (!user) return true;
      if (!hasEntitlement(user.id, 'cloud_sync')) { sendCloudSyncRequired(res, headers, user.id); return true; }
      if (limited(`save:${user.id}`, 60, 60000)) { send(res, 429, { error: '同步太频繁，请稍后再试' }, headers); return true; }
      const body = await readBody(req); const checked = validateSave(body.data); const base = Number.isInteger(body.baseRevision) ? body.baseRevision : 0; const now = Date.now();
      const old = db.prepare('SELECT revision,payload,checksum,client_updated_at,server_updated_at FROM saves WHERE user_id=?').get(user.id);
      // A response may be lost after COMMIT. An identical validated retry has
      // already succeeded, even if its original baseRevision is now stale.
      if (old && old.checksum === checked.checksum && old.payload === checked.text) {
        send(res, 200, { ok: true, unchanged: true, revision: old.revision, checksum: old.checksum, serverUpdatedAt: old.server_updated_at }, headers); return true;
      }
      if (old && old.revision !== base) { send(res, 409, { error: '云端已有更新', conflict: { revision: old.revision, data: JSON.parse(old.payload), checksum: old.checksum, clientUpdatedAt: old.client_updated_at, serverUpdatedAt: old.server_updated_at } }, headers); return true; }
      if (old) db.prepare('UPDATE saves SET revision=?,payload=?,payload_bytes=?,checksum=?,client_updated_at=?,server_updated_at=? WHERE user_id=?').run(old.revision + 1, checked.text, checked.bytes, checked.checksum, Number.isFinite(body.clientUpdatedAt) ? body.clientUpdatedAt : null, now, user.id);
      else db.prepare('INSERT INTO saves (user_id,revision,payload,payload_bytes,checksum,client_updated_at,server_updated_at) VALUES (?,?,?,?,?,?,?)').run(user.id, 1, checked.text, checked.bytes, checked.checksum, Number.isFinite(body.clientUpdatedAt) ? body.clientUpdatedAt : null, now);
      const revision = old ? old.revision + 1 : 1; send(res, 200, { ok: true, revision, checksum: checked.checksum, serverUpdatedAt: now }, headers); return true;
    }
    send(res, 404, { error: '接口不存在' }, headers); return true;
  } catch (error) {
    const status = Number(error.status) || 500;
    console.error('[api]', req.method, url.pathname, error.stack || error.message);
    send(res, status, { error: status === 500 ? '服务器内部错误' : error.message, ...(status !== 500 && /^[A-Z][A-Z0-9_]{0,80}$/.test(error.code || '') ? { code: error.code } : {}), ...(Number.isSafeInteger(error.currentRevision) ? { currentRevision: error.currentRevision } : {}) }, headers); return true;
  }
}

module.exports = { handleApi, DB_PATH };
