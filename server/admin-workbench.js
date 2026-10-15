// 账号工作台的查询与运营操作。所有数据访问使用调用方的同一 SQLite 连接。
const { randomUUID } = require('node:crypto');

module.exports = function createAdminWorkbench(context) {
  const { db, send, requireAdmin, readBody, limited, clientIp, recordAdminAudit, adminUserView, adminSaveSummary, serviceSettings } = context;
  const fail = (message, status = 400, code = 'ADMIN_INPUT_INVALID', extra = {}) => { throw Object.assign(new Error(message), { status, code, ...extra }); };
  const allowedQuery = (url, keys) => {
    for (const key of url.searchParams.keys()) {
      if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1) fail(`不支持或重复的查询参数：${key}`);
    }
  };
  const choice = (url, key, values, fallback) => {
    const value = url.searchParams.get(key) ?? fallback;
    if (!values.includes(value)) fail(`${key} 参数不正确`);
    return value;
  };
  const integer = (value, fallback, min, max, label) => {
    if (value === null || value === undefined) return fallback;
    if (!/^\d+$/.test(String(value))) fail(`${label} 必须是整数`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) fail(`${label} 超出范围`);
    return parsed;
  };
  const pagination = (url, maxSize = 50, fallback = 20) => ({
    page: integer(url.searchParams.get('page'), 1, 1, 10000, 'page'),
    pageSize: integer(url.searchParams.get('pageSize'), fallback, 1, maxSize, 'pageSize'),
  });
  const queryText = (url, key = 'q', max = 120) => {
    const text = String(url.searchParams.get(key) || '').trim();
    if (text.length > max) fail(`${key} 不能超过 ${max} 字`);
    return text;
  };
  const fields = (body, keys) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求必须是 JSON 对象');
    for (const key of Object.keys(body)) if (!keys.includes(key)) fail(`不支持的字段：${key}`);
  };
  const text = (value, max, label, required = true) => {
    if (typeof value !== 'string') fail(`${label} 必须是文本`);
    const result = value.trim();
    if ((required && !result) || result.length > max) fail(`${label}${required ? '不能为空且' : ''}不能超过 ${max} 字`);
    return result;
  };
  const user = (id) => {
    const row = db.prepare('SELECT id,username,created_at,disabled,note,admin_revision,last_seen FROM users WHERE id=?').get(id);
    if (!row) fail('账号不存在', 404, 'ACCOUNT_NOT_FOUND');
    return row;
  };
  const save = (id) => db.prepare('SELECT revision,payload,payload_bytes,checksum,client_updated_at,server_updated_at FROM saves WHERE user_id=?').get(id);
  const account = (id) => adminUserView(user(id), save(id));
  const revision = (body, row) => {
    if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) fail('请提供当前账号管理版本');
    if (body.baseRevision !== row.admin_revision) fail('账号已被其他页面修改，请刷新详情后重试', 409, 'ACCOUNT_REVISION_CONFLICT', { currentRevision: row.admin_revision });
  };
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch { /* preserve original error */ } throw error; }
  };
  const write = (req) => {
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) fail('管理操作需要 JSON 请求', 415, 'ADMIN_JSON_REQUIRED');
    if (limited(`admin-workbench:${clientIp(req)}`, 60, 60000)) fail('管理操作太频繁，请稍后再试', 429, 'ADMIN_RATE_LIMITED');
  };
  const mailSelect = `SELECT m.*,
    (SELECT username FROM users WHERE id=m.target_user_id) AS target_username,
    (SELECT COUNT(*) FROM mail_deliveries d WHERE d.message_id=m.id) AS recipients,
    (SELECT COUNT(*) FROM mail_deliveries d WHERE d.message_id=m.id AND d.read_at IS NOT NULL) AS reads,
    (SELECT COUNT(*) FROM mail_deliveries d WHERE d.message_id=m.id AND d.claimed_at IS NOT NULL) AS claims
    FROM mail_messages m`;
  const mailView = (row, now = Date.now()) => ({
    id: row.id, kind: row.kind, title: row.title, body: row.body, ops: JSON.parse(row.ops_json), audience: row.audience,
    targetUserId: row.target_user_id, targetUsername: row.target_username || null,
    status: row.status === 'published' && row.expires_at !== null && row.expires_at <= now ? 'expired' : row.status,
    createdAt: row.created_at, publishedAt: row.published_at, expiresAt: row.expires_at,
    revokedAt: row.revoked_at || null, revokeReason: row.revoke_reason || '',
    recipients: Number(row.recipients), reads: Number(row.reads), claims: Number(row.claims),
  });
  const mail = (id) => {
    const row = db.prepare(`${mailSelect} WHERE m.id=?`).get(id);
    if (!row) fail('邮件不存在', 404, 'MAIL_NOT_FOUND');
    return row;
  };
  const pageResult = (total, requestedPage, pageSize) => {
    const pages = Math.max(1, Math.ceil(Number(total) / pageSize));
    return { total: Number(total), page: Math.min(requestedPage, pages), pageSize, pages };
  };

  return async function handleAdminWorkbench(req, res, url, headers) {
    const accountRoute = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)(?:\/(manage|revoke-sessions|entitlements))?$/);
    const mailRoute = url.pathname.match(/^\/api\/admin\/mail\/([^/]+)(?:\/(revoke))?$/);
    const restoreRoute = url.pathname.match(/^\/api\/admin\/gift-templates\/([^/]+)\/restore$/);
    const matches = (url.pathname === '/api/admin/accounts' && req.method === 'GET')
      || (url.pathname === '/api/admin/mail' && req.method === 'GET')
      || (url.pathname === '/api/admin/audit' && req.method === 'GET')
      || (url.pathname === '/api/admin/gift-templates' && req.method === 'GET')
      || (accountRoute && ((!accountRoute[2] && req.method === 'GET') || (['manage', 'revoke-sessions'].includes(accountRoute[2]) && req.method === 'POST') || (accountRoute[2] === 'entitlements' && req.method === 'PUT')))
      || (mailRoute && ((!mailRoute[2] && req.method === 'GET') || (mailRoute[2] === 'revoke' && req.method === 'POST')))
      || (restoreRoute && req.method === 'POST');
    if (!matches) return false;
    if (!requireAdmin(req, res, headers)) return true;

    if (url.pathname === '/api/admin/accounts') {
      allowedQuery(url, ['q', 'status', 'save', 'activity', 'sort', 'page', 'pageSize']);
      const q = queryText(url), status = choice(url, 'status', ['all', 'active', 'disabled'], 'all');
      const saveFilter = choice(url, 'save', ['all', 'yes', 'no'], 'all');
      const activity = choice(url, 'activity', ['all', '7d', 'inactive'], 'all');
      const sort = choice(url, 'sort', ['newest', 'oldest', 'activity', 'save'], 'newest');
      const { page, pageSize } = pagination(url); const now = Date.now();
      const conditions = [], params = [];
      if (q) { conditions.push('(instr(lower(u.username),lower(?))>0 OR instr(u.id,?)>0 OR instr(lower(u.note),lower(?))>0)'); params.push(q, q, q); }
      if (status !== 'all') { conditions.push('u.disabled=?'); params.push(status === 'disabled' ? 1 : 0); }
      if (saveFilter !== 'all') conditions.push(saveFilter === 'yes' ? 's.user_id IS NOT NULL' : 's.user_id IS NULL');
      if (activity !== 'all') { conditions.push(activity === '7d' ? 'u.last_seen>=?' : '(u.last_seen IS NULL OR u.last_seen<?)'); params.push(now - 7 * 86400000); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const order = { newest: 'u.created_at DESC,u.id DESC', oldest: 'u.created_at ASC,u.id ASC', activity: 'COALESCE(u.last_seen,0) DESC,u.created_at DESC,u.id DESC', save: 'COALESCE(s.server_updated_at,0) DESC,u.created_at DESC,u.id DESC' }[sort];
      const total = db.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN saves s ON s.user_id=u.id ${where}`).get(...params).n;
      const paging = pageResult(total, page, pageSize);
      const rows = db.prepare(`SELECT u.id,u.username,u.created_at,u.disabled,u.note,u.admin_revision,u.last_seen,s.revision,s.payload,s.payload_bytes,s.checksum,s.client_updated_at,s.server_updated_at FROM users u LEFT JOIN saves s ON s.user_id=u.id ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, pageSize, (paging.page - 1) * pageSize);
      const stats = {
        accounts: Number(db.prepare('SELECT COUNT(*) AS n FROM users').get().n),
        disabledAccounts: Number(db.prepare('SELECT COUNT(*) AS n FROM users WHERE disabled=1').get().n),
        withSaves: Number(db.prepare('SELECT COUNT(*) AS n FROM saves').get().n),
        activeEntitlements: Number(db.prepare('SELECT COUNT(*) AS n FROM entitlements WHERE valid_from<=? AND (valid_until IS NULL OR valid_until>?)').get(now, now).n),
        activeLast7Days: Number(db.prepare('SELECT COUNT(*) AS n FROM users WHERE last_seen>=?').get(now - 7 * 86400000).n),
      };
      send(res, 200, { accounts: rows.map((row) => adminUserView(row, row.revision === null ? null : row, now)), ...paging, stats, service: serviceSettings() }, headers); return true;
    }

    if (accountRoute) {
      const id = decodeURIComponent(accountRoute[1]), action = accountRoute[2];
      allowedQuery(url, []);
      if (!action) {
        const row = user(id), saveRow = save(id), now = Date.now();
        const sessionList = db.prepare('SELECT id,created_at,expires_at,last_seen FROM sessions WHERE user_id=? AND expires_at>? ORDER BY last_seen DESC,id ASC').all(id, now)
          .map((entry) => ({ id: entry.id, createdAt: entry.created_at, expiresAt: entry.expires_at, lastSeen: entry.last_seen }));
        const giftHistory = db.prepare('SELECT id,items_json,operator,before_revision,after_revision,status,created_at FROM gift_grants WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 30').all(id)
          .map((entry) => ({ id: entry.id, ops: JSON.parse(entry.items_json), operator: entry.operator, beforeRevision: entry.before_revision, revision: entry.after_revision, status: entry.status, issuedAt: entry.created_at }));
        const mailDeliveries = db.prepare(`SELECT d.message_id,d.read_at,d.claimed_at,d.created_at,m.kind,m.title,m.audience,m.status,m.ops_json,m.published_at,m.expires_at,m.revoked_at,m.revoke_reason
          FROM mail_deliveries d JOIN mail_messages m ON m.id=d.message_id WHERE d.user_id=? ORDER BY d.created_at DESC,d.message_id DESC LIMIT 20`).all(id)
          .map((entry) => ({
            messageId: entry.message_id, kind: entry.kind, title: entry.title, audience: entry.audience,
            status: entry.status === 'published' && entry.expires_at !== null && entry.expires_at <= now ? 'expired' : entry.status,
            ops: JSON.parse(entry.ops_json || '[]'), publishedAt: entry.published_at, expiresAt: entry.expires_at,
            revokedAt: entry.revoked_at || null, revokeReason: entry.revoke_reason || '',
            deliveredAt: entry.created_at, readAt: entry.read_at, claimedAt: entry.claimed_at,
          }));
        const recentAudits = db.prepare('SELECT id,action,detail,created_at,ip FROM admin_audit WHERE target_user_id=? ORDER BY created_at DESC,id DESC LIMIT 20').all(id)
          .map((entry) => ({ id: entry.id, action: entry.action, detail: JSON.parse(entry.detail || '{}'), createdAt: entry.created_at, ip: entry.ip }));
        let data = null; if (saveRow) { try { data = JSON.parse(saveRow.payload); } catch { /* retain metadata for damaged saves */ } }
        send(res, 200, { account: adminUserView(row, saveRow, now), sessions: sessionList.length, sessionList, giftHistory, mailDeliveries, recentAudits, save: saveRow ? { ...adminSaveSummary(saveRow), data, healthy: data !== null } : null }, headers); return true;
      }
      write(req); const body = await readBody(req);
      if (action === 'manage') {
        fields(body, ['baseRevision', 'note', 'disabled', 'reason']);
        if (!Object.hasOwn(body, 'note') && !Object.hasOwn(body, 'disabled')) fail('请填写备注或账号状态');
        const note = Object.hasOwn(body, 'note') ? text(body.note, 1000, '运营备注', false) : undefined;
        if (Object.hasOwn(body, 'disabled') && typeof body.disabled !== 'boolean') fail('disabled 必须是布尔值');
        const reason = body.reason === undefined ? '' : text(body.reason, 300, '操作原因', false);
        let revoked = 0;
        transaction(() => {
          const row = user(id); revision(body, row);
          const disabled = body.disabled === undefined ? !!row.disabled : body.disabled;
          if (disabled !== !!row.disabled && !reason) fail('变更账号状态时请填写原因');
          if (disabled) revoked = Number(db.prepare('DELETE FROM sessions WHERE user_id=?').run(id).changes);
          const nextNote = note === undefined ? row.note : note;
          db.prepare('UPDATE users SET note=?,disabled=?,admin_revision=admin_revision+1 WHERE id=?').run(nextNote, disabled ? 1 : 0, id);
          recordAdminAudit('account.manage', id, { username: row.username, before: { disabled: !!row.disabled, note: row.note, adminRevision: row.admin_revision }, after: { disabled, note: nextNote, adminRevision: row.admin_revision + 1 }, reason, revoked }, req);
        });
        send(res, 200, { ok: true, account: account(id), revoked }, headers); return true;
      }
      if (action === 'revoke-sessions') {
        fields(body, ['baseRevision', 'reason', 'sessionId']); const reason = text(body.reason, 300, '撤销原因');
        const sessionId = body.sessionId === undefined || body.sessionId === null || body.sessionId === '' ? null : String(body.sessionId).trim();
        if (sessionId !== null && !/^[A-Za-z0-9_.-]{1,80}$/.test(sessionId)) fail('sessionId 格式不正确');
        const revoked = transaction(() => {
          const row = user(id); revision(body, row);
          const count = sessionId
            ? Number(db.prepare('DELETE FROM sessions WHERE user_id=? AND id=?').run(id, sessionId).changes)
            : Number(db.prepare('DELETE FROM sessions WHERE user_id=?').run(id).changes);
          db.prepare('UPDATE users SET admin_revision=admin_revision+1 WHERE id=?').run(id);
          recordAdminAudit('account.sessions.revoke', id, { username: row.username, revoked: count, ...(sessionId ? { sessionId } : {}), reason, adminRevision: row.admin_revision + 1 }, req);
          return count;
        });
        send(res, 200, { ok: true, revoked, account: account(id) }, headers); return true;
      }
      fields(body, ['baseRevision', 'features', 'validUntil', 'reason']);
      if (!Array.isArray(body.features) || body.features.length > 2 || new Set(body.features).size !== body.features.length || body.features.some((feature) => !['cloud_sync', 'auto_update'].includes(feature))) fail('features 只能包含不重复的 cloud_sync 或 auto_update；空数组表示撤销单独授权');
      const reason = text(body.reason, 300, '授权原因'), now = Date.now(), validUntil = body.validUntil;
      if (validUntil !== null && (!Number.isSafeInteger(validUntil) || validUntil <= now || validUntil > now + 366 * 86400000)) fail('validUntil 必须为 null 或未来一年内的毫秒时间戳');
      transaction(() => {
        const row = user(id); revision(body, row);
        const before = db.prepare("SELECT feature,valid_until FROM entitlements WHERE user_id=? AND source='admin'").all(id);
        db.prepare("DELETE FROM entitlements WHERE user_id=? AND source='admin'").run(id);
        for (const feature of body.features) db.prepare('INSERT INTO entitlements(id,user_id,feature,valid_from,valid_until,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(), id, feature, now, validUntil, 'admin', now, now);
        db.prepare('UPDATE users SET admin_revision=admin_revision+1 WHERE id=?').run(id);
        recordAdminAudit('account.entitlements.update', id, { username: row.username, before, features: [...body.features].sort(), validUntil, reason, adminRevision: row.admin_revision + 1 }, req);
      });
      send(res, 200, { ok: true, account: account(id) }, headers); return true;
    }

    if (url.pathname === '/api/admin/mail') {
      allowedQuery(url, ['q', 'kind', 'status', 'page', 'pageSize']);
      const q = queryText(url), kind = choice(url, 'kind', ['all', 'announcement', 'gift'], 'all'), status = choice(url, 'status', ['all', 'published', 'expired', 'revoked'], 'all');
      const { page, pageSize } = pagination(url), now = Date.now(); const conditions = [], params = [];
      if (q) { conditions.push('(instr(lower(m.title),lower(?))>0 OR instr(m.id,?)>0 OR instr(lower(m.body),lower(?))>0)'); params.push(q, q, q); }
      if (kind !== 'all') { conditions.push('m.kind=?'); params.push(kind); }
      if (status === 'revoked') conditions.push("m.status='revoked'");
      if (status === 'published') { conditions.push("m.status='published' AND (m.expires_at IS NULL OR m.expires_at>?)"); params.push(now); }
      if (status === 'expired') { conditions.push("m.status='published' AND m.expires_at IS NOT NULL AND m.expires_at<=?"); params.push(now); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM mail_messages m ${where}`).get(...params).n;
      const paging = pageResult(total, page, pageSize);
      const messages = db.prepare(`${mailSelect} ${where} ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (paging.page - 1) * pageSize).map((row) => mailView(row, now));
      const stats = {
        totalMessages: Number(db.prepare('SELECT COUNT(*) AS n FROM mail_messages').get().n),
        activeMessages: Number(db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE status='published' AND (expires_at IS NULL OR expires_at>?)").get(now).n),
        giftMessages: Number(db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE kind='gift'").get().n),
        revokedMessages: Number(db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE status='revoked'").get().n),
        expiredMessages: Number(db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE status='published' AND expires_at IS NOT NULL AND expires_at<=?").get(now).n),
        totalDeliveries: Number(db.prepare('SELECT COUNT(*) AS n FROM mail_deliveries').get().n),
        totalReads: Number(db.prepare('SELECT COUNT(*) AS n FROM mail_deliveries WHERE read_at IS NOT NULL').get().n),
        totalClaims: Number(db.prepare('SELECT COUNT(*) AS n FROM mail_deliveries WHERE claimed_at IS NOT NULL').get().n),
      };
      send(res, 200, { messages, stats, ...paging }, headers); return true;
    }
    if (mailRoute) {
      const id = decodeURIComponent(mailRoute[1]);
      if (!mailRoute[2]) {
        allowedQuery(url, ['page', 'pageSize', 'q', 'status']); const { page, pageSize } = pagination(url);
        const q = queryText(url), status = choice(url, 'status', ['all', 'read', 'unread', 'claimed', 'unclaimed'], 'all');
        const row = mail(id);
        const conditions = ['d.message_id=?'], params = [id];
        if (q) { conditions.push('(instr(lower(u.username),lower(?))>0 OR instr(d.user_id,?)>0)'); params.push(q, q); }
        if (status === 'read') conditions.push('d.read_at IS NOT NULL');
        if (status === 'unread') conditions.push('d.read_at IS NULL');
        if (status === 'claimed') conditions.push('d.claimed_at IS NOT NULL');
        if (status === 'unclaimed') conditions.push('d.claimed_at IS NULL');
        const where = `WHERE ${conditions.join(' AND ')}`;
        const filteredTotal = (q || status !== 'all')
          ? Number(db.prepare(`SELECT COUNT(*) AS n FROM mail_deliveries d JOIN users u ON u.id=d.user_id ${where}`).get(...params).n)
          : Number(row.recipients);
        const paging = pageResult(filteredTotal, page, pageSize);
        const deliveries = db.prepare(`SELECT d.user_id,u.username,d.read_at,d.claimed_at,d.created_at FROM mail_deliveries d JOIN users u ON u.id=d.user_id ${where} ORDER BY u.username COLLATE NOCASE,u.id LIMIT ? OFFSET ?`).all(...params, pageSize, (paging.page - 1) * pageSize)
          .map((entry) => ({ userId: entry.user_id, username: entry.username, readAt: entry.read_at, claimedAt: entry.claimed_at, deliveredAt: entry.created_at }));
        send(res, 200, { message: mailView(row), deliveries, ...paging }, headers); return true;
      }
      allowedQuery(url, []); write(req); const body = await readBody(req); fields(body, ['reason']); const reason = text(body.reason, 300, '撤回原因');
      const idempotent = transaction(() => {
        const row = mail(id); if (row.status === 'revoked') return true;
        db.prepare("UPDATE mail_messages SET status='revoked',revoked_at=?,revoke_reason=? WHERE id=?").run(Date.now(), reason, id);
        recordAdminAudit('mail.revoke', row.target_user_id, { messageId: id, title: row.title, kind: row.kind, audience: row.audience, recipients: row.recipients, reads: row.reads, claims: row.claims, reason }, req);
        return false;
      });
      send(res, 200, { ok: true, idempotent, message: mailView(mail(id)) }, headers); return true;
    }

    if (url.pathname === '/api/admin/audit') {
      allowedQuery(url, ['q', 'action', 'targetUserId', 'from', 'to', 'page', 'pageSize', 'limit']);
      if (url.searchParams.has('limit') && url.searchParams.has('pageSize')) fail('limit 和 pageSize 不能同时使用');
      const fallback = integer(url.searchParams.get('limit'), 50, 1, 100, 'limit');
      const { page, pageSize } = pagination(url, 100, fallback), q = queryText(url), action = queryText(url, 'action', 100), targetUserId = queryText(url, 'targetUserId', 80);
      const from = integer(url.searchParams.get('from'), null, 0, Number.MAX_SAFE_INTEGER, 'from'), to = integer(url.searchParams.get('to'), null, 0, Number.MAX_SAFE_INTEGER, 'to');
      if (from !== null && to !== null && from > to) fail('from 不能晚于 to');
      const conditions = [], params = [];
      if (q) { conditions.push('(instr(lower(a.action),lower(?))>0 OR instr(lower(a.detail),lower(?))>0 OR instr(COALESCE(a.target_user_id,\'\'),?)>0 OR instr(lower(COALESCE(u.username,\'\')),lower(?))>0)'); params.push(q, q, q, q); }
      if (action) { conditions.push('a.action=?'); params.push(action); }
      if (targetUserId) { conditions.push('a.target_user_id=?'); params.push(targetUserId); }
      if (from !== null) { conditions.push('a.created_at>=?'); params.push(from); }
      if (to !== null) { conditions.push('a.created_at<=?'); params.push(to); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM admin_audit a LEFT JOIN users u ON u.id=a.target_user_id ${where}`).get(...params).n;
      const paging = pageResult(total, page, pageSize);
      const entries = db.prepare(`SELECT a.*,u.username AS target_username FROM admin_audit a LEFT JOIN users u ON u.id=a.target_user_id ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (paging.page - 1) * pageSize)
        .map((row) => ({ id: row.id, action: row.action, targetUserId: row.target_user_id, targetUsername: row.target_username || null, detail: JSON.parse(row.detail), createdAt: row.created_at, ip: row.ip }));
      send(res, 200, { entries, ...paging }, headers); return true;
    }

    if (url.pathname === '/api/admin/gift-templates') {
      allowedQuery(url, ['includeArchived']); const includeArchived = choice(url, 'includeArchived', ['0', '1'], '0') === '1';
      const templates = db.prepare(`SELECT id,name,description,ops_json,active,created_at,updated_at FROM gift_templates ${includeArchived ? '' : 'WHERE active=1'} ORDER BY active DESC,updated_at DESC,id DESC`).all()
        .map((row) => ({ id: row.id, name: row.name, description: row.description, ops: JSON.parse(row.ops_json), active: !!row.active, createdAt: row.created_at, updatedAt: row.updated_at }));
      send(res, 200, { templates }, headers); return true;
    }
    allowedQuery(url, []); write(req); const body = await readBody(req); fields(body, []); const id = decodeURIComponent(restoreRoute[1]);
    const idempotent = transaction(() => {
      const row = db.prepare('SELECT id,name,active FROM gift_templates WHERE id=?').get(id);
      if (!row) fail('礼包模板不存在', 404, 'GIFT_TEMPLATE_NOT_FOUND');
      if (row.active) return true;
      db.prepare('UPDATE gift_templates SET active=1,updated_at=? WHERE id=?').run(Date.now(), id);
      recordAdminAudit('gift_template.restore', null, { templateId: id, name: row.name }, req);
      return false;
    });
    send(res, 200, { ok: true, idempotent }, headers); return true;
  };
};
