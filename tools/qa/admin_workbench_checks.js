// 本地账号工作台回归。运行：node tools/qa/admin_workbench_checks.js
// 服务、SQLite 和测试账号均隔离在本脚本创建的临时目录；不继承支付或生产数据库配置。
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { createServer } = require('node:net');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');

const project = path.resolve(__dirname, '../..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'nuannuan-workbench-qa-'));
const database = path.join(dataDir, 'accounts.sqlite');
const adminToken = 'local-workbench-admin-' + randomUUID();
const testToken = 'local-workbench-entitlements-' + randomUUID();
const password = 'workbench-local-password-123';
const stamp = Date.now().toString(36);
let child, childError, base, origin, timedOut = false, assertions = 0;
let serverOutput = '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const eq = (actual, expected, label) => { assertions++; assert.equal(actual, expected, label); };
const same = (actual, expected, label) => { assertions++; assert.deepEqual(actual, expected, label); };
const ok = (actual, label) => { assertions++; assert.ok(actual, label); };
const timeout = setTimeout(() => { timedOut = true; child?.kill('SIGKILL'); }, 90000);

function localEnvironment(port) {
  // Whitelist OS variables so AUTH_DB, NODE_OPTIONS and payment key paths cannot leak in.
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
  return {
    ...environment,
    API_PORT: String(port), DATA_DIR: dataDir, AUTH_DB: database,
    COOKIE_SECURE: '0', PUBLIC_FREE_ENTITLEMENTS: '1', PAYMENT_CHECKOUT_ENABLED: '0',
    ADMIN_API_TOKEN: adminToken, ADMIN_PUBLIC_ORIGIN: origin, APP_ORIGINS: origin,
    TEST_AUTH_ENABLED: '1', TEST_AUTH_ADMIN_TOKEN: testToken,
  };
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer() {
  const port = await freePort();
  base = origin = `http://127.0.0.1:${port}`;
  childError = null;
  child = spawn(process.execPath, ['server-api.js'], {
    cwd: project, env: localEnvironment(port), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const consume = (chunk) => { serverOutput = (serverOutput + String(chunk)).slice(-10000); };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.on('error', (error) => { childError = error; });
  for (let i = 0; i < 100; i++) {
    if (childError) throw childError;
    if (child.exitCode !== null) throw new Error('隔离 API 启动失败：' + serverOutput);
    try { const response = await call('/api/healthz'); if (response.status === 200 && response.body.ok) return; }
    catch { /* startup */ }
    await sleep(40);
  }
  throw new Error('隔离 API 启动超时：' + serverOutput);
}

async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const running = child;
  await new Promise((resolve) => {
    const force = setTimeout(() => { running.kill('SIGKILL'); resolve(); }, 3000);
    running.once('exit', () => { clearTimeout(force); resolve(); });
    running.kill('SIGTERM');
  });
}

async function call(route, { method = 'GET', body, headers = {} } = {}) {
  if (timedOut) throw new Error('工作台回归超过 90 秒');
  const response = await fetch(base + route, {
    method, headers: { Origin: origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(7000),
  });
  const text = await response.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 300) }; }
  return { status: response.status, body: parsed, headers: response.headers };
}

function expected(response, status, label) {
  eq(response.status, status, `${label}: ${JSON.stringify(response.body)}`);
  return response.body;
}
function rejected(response, label) {
  ok(response.status >= 400 && response.status < 500, `${label}: 应为 4xx，实际 ${response.status} ${JSON.stringify(response.body)}`);
}
const admin = (route, options = {}) => call('/api/admin' + route, {
  ...options, headers: { 'X-Admin-Token': adminToken, ...options.headers },
});
const accountRoute = (user, action = '') => `/accounts/${encodeURIComponent(user.id)}${action}`;
const player = (user, route, options = {}) => call(route, { ...options, headers: { Cookie: user.cookie, ...options.headers } });
const key = (label) => `workbench_${stamp}_${label}`;
function cookie(response) {
  const value = String(response.headers.get('set-cookie') || '').split(';')[0];
  ok(/^session=/.test(value), '注册或登录必须提供玩家会话 Cookie');
  return value;
}
async function register(label) {
  const username = `wb_${label}_${stamp}`;
  const response = await call('/api/auth/register', { method: 'POST', body: { username, password } });
  const body = expected(response, 201, '注册隔离账号 ' + label);
  await sleep(5); // Keep creation order deterministic for newest/oldest checks.
  return { ...body.user, cookie: cookie(response) };
}
async function login(user) {
  const response = await call('/api/auth/login', { method: 'POST', body: { username: user.username, password } });
  expected(response, 200, '账号可登录');
  user.cookie = cookie(response);
}
async function detail(user) { return expected(await admin(accountRoute(user)), 200, '读取账号详情'); }
async function managed(user, changes) {
  const before = await detail(user);
  expected(await admin(accountRoute(user, '/manage'), { method: 'POST', body: { baseRevision: before.account.adminRevision, ...changes } }), 200, '修改账号');
  const after = await detail(user);
  eq(after.account.adminRevision, before.account.adminRevision + 1, '账号管理版本递增一次');
  return after;
}
function saveData(coins) {
  return { v: 3, started: true, coins, owned: ['d_reunion'], outfit: { hair: 'h_default', dress: 'd_reunion', shoes: 's_default' }, shops: {}, placed: [], crops: {}, seeds: {}, decor: {}, house: 1, yardLv: 1, gday: 0 };
}
async function save(user, coins) {
  expected(await player(user, '/api/save', { method: 'PUT', body: { baseRevision: 0, data: saveData(coins) } }), 200, '保存隔离云存档');
}
async function listAccounts(parameters) {
  return expected(await admin('/accounts?' + new URLSearchParams(parameters)), 200, '筛选账号');
}
async function checkDecimal(route, listName) {
  for (const parameters of ['page=1.5', 'pageSize=2.5', 'page=NaN', 'pageSize=-1']) {
    const response = await admin(route + (route.includes('?') ? '&' : '?') + parameters);
    if (response.status === 200) {
      ok(Number.isInteger(response.body.page) && Number.isInteger(response.body.pageSize), `${route} 非整数参数应规范为整数`);
      ok(Array.isArray(response.body[listName]), `${route} 规范分页应返回列表`);
    } else rejected(response, `${route} 非整数分页应拒绝，不能 500`);
  }
}

async function main() {
  try {
    await startServer();
    const alice = await register('alice'), bob = await register('bob'), carol = await register('carol'), dave = await register('dave');
    const users = [alice, bob, carol, dave];
    await save(alice, 100); await save(bob, 50);
    for (const [route, method] of [
      ['/accounts', 'GET'], [accountRoute(alice), 'GET'], [accountRoute(alice, '/manage'), 'POST'],
      [accountRoute(alice, '/revoke-sessions'), 'POST'], [accountRoute(alice, '/entitlements'), 'PUT'],
      ['/gift-catalog', 'GET'], ['/gift-templates', 'GET'], ['/gift-templates/missing/restore', 'POST'],
      ['/mail', 'GET'], ['/mail/missing', 'GET'], ['/mail/missing/revoke', 'POST'], ['/audit', 'GET'], ['/service-settings', 'GET'],
    ]) expected(await call('/api/admin' + route, { method, ...(method === 'GET' ? {} : { body: {} }) }), 401, '管理接口未授权');
    expected(await call('/api/admin/accounts', { headers: { 'X-Admin-Token': 'wrong-local-token' } }), 401, '错误令牌不能访问');

    let aliceDetail = await detail(alice);
    eq(aliceDetail.account.adminRevision, 0, '新账号 adminRevision 从 0 开始');
    eq(aliceDetail.sessions, 1, '注册产生一个有效会话');
    ok(Array.isArray(aliceDetail.sessionList), '详情包含会话列表');
    eq(aliceDetail.sessionList.length, aliceDetail.sessions, '会话列表与数量一致');
    for (const session of aliceDetail.sessionList) {
      ok(Number.isSafeInteger(session.createdAt) && Number.isSafeInteger(session.expiresAt) && Number.isSafeInteger(session.lastSeen), '会话只返回有效元数据');
      ok(!Object.keys(session).some((field) => /token|hash|password|secret/i.test(field)), '会话不得泄漏 token/hash');
    }
    const note = 'QA 备注：只存于临时数据库';
    const oldRevision = aliceDetail.account.adminRevision;
    aliceDetail = await managed(alice, { note });
    eq(aliceDetail.account.note, note, '账号备注持久返回');
    expected(await admin(accountRoute(alice, '/manage'), { method: 'POST', body: { baseRevision: oldRevision, note: '旧页面不能覆盖' } }), 409, '备注 CAS 冲突');
    eq((await detail(alice)).account.note, note, 'CAS 冲突保留最新备注');
    for (const invalid of [{ note: 'x'.repeat(1001) }, { disabled: true }, { disabled: true, reason: 'x'.repeat(301) }, { disabled: 'true', reason: '错误类型' }]) {
      rejected(await admin(accountRoute(alice, '/manage'), { method: 'POST', body: { baseRevision: aliceDetail.account.adminRevision, ...invalid } }), '账号输入约束');
    }
    aliceDetail = await managed(alice, { disabled: true, reason: 'QA 暂停账号' });
    eq(aliceDetail.account.disabled, true, '停用状态保存');
    eq(aliceDetail.sessions, 0, '停用即撤销全部玩家会话');
    eq(aliceDetail.save.data.coins, 100, '停用保留云存档');
    eq(aliceDetail.save.revision, 1, '停用不推进云存档版本');
    expected(await player(alice, '/api/auth/me'), 401, '停用后的旧 Cookie 无效');
    expected(await call('/api/auth/login', { method: 'POST', body: { username: alice.username, password } }), 401, '停用账号不能重新登录');
    same((await listAccounts({ status: 'disabled' })).accounts.map((item) => item.id), [alice.id], '停用筛选');
    eq((await listAccounts({ status: 'active' })).total, 3, '启用筛选排除停用账号');
    aliceDetail = await managed(alice, { disabled: false, reason: 'QA 恢复账号' });
    await login(alice);

    // Shared CAS revision spans note edits, session revocation and manual entitlements.
    let bobDetail = await detail(bob);
    const lastSeen = bobDetail.account.lastSeen, staleBobRevision = bobDetail.account.adminRevision;
    ok(Number.isSafeInteger(lastSeen), '账号持久记录最近活动时间');
    expected(await admin(accountRoute(bob, '/revoke-sessions'), { method: 'POST', body: { baseRevision: staleBobRevision, reason: 'QA 主动撤销会话' } }), 200, '管理员撤销会话');
    bobDetail = await detail(bob);
    eq(bobDetail.account.adminRevision, staleBobRevision + 1, '撤会话递增共享版本');
    eq(bobDetail.sessions, 0, '会话确实撤销');
    eq(bobDetail.account.lastSeen, lastSeen, '撤会话后保留最近活动时间');
    eq(bobDetail.save.data.coins, 50, '撤会话不修改云存档');
    expected(await player(bob, '/api/auth/me'), 401, '已撤会话不能继续访问');
    expected(await admin(accountRoute(bob, '/entitlements'), { method: 'PUT', body: { baseRevision: staleBobRevision, features: ['auto_update'], validUntil: null, reason: '旧页面授权' } }), 409, '人工权益遵循共享 CAS');
    await login(bob);
    expected(await call('/api/test/entitlements', { method: 'POST', headers: { 'X-Test-Admin-Token': testToken }, body: { userId: bob.id, features: ['cloud_sync'], validUntil: null } }), 200, '植入独立 test 源权益');
    const testEntry = (await detail(bob)).account.entitlements.find((item) => item.source === 'test');
    ok(testEntry, 'test 源权益已存在');
    const entitlementReason = 'QA 人工权益更新';
    for (const invalid of [
      { features: ['unknown_feature'], validUntil: null, reason: entitlementReason },
      { features: ['auto_update'], validUntil: Date.now() - 1, reason: entitlementReason },
      { features: ['auto_update'], validUntil: Date.now() + 367 * 86400000, reason: entitlementReason },
      { features: ['auto_update'], validUntil: null, reason: '' },
    ]) rejected(await admin(accountRoute(bob, '/entitlements'), { method: 'PUT', body: { baseRevision: bobDetail.account.adminRevision, ...invalid } }), '人工授权校验');
    for (const features of [['auto_update'], ['cloud_sync'], []]) {
      const before = await detail(bob);
      const validUntil = features.includes('auto_update') ? Date.now() + 3600000 : null;
      expected(await admin(accountRoute(bob, '/entitlements'), { method: 'PUT', body: { baseRevision: before.account.adminRevision, features, validUntil, reason: entitlementReason } }), 200, '替换 admin 源权益');
      const after = await detail(bob);
      eq(after.account.adminRevision, before.account.adminRevision + 1, '人工权益递增共享版本');
      same(after.account.entitlements.filter((item) => item.source === 'admin').map((item) => item.feature).sort(), [...features].sort(), '人工权益替换只影响 admin 源');
      if (features.length) eq(after.account.entitlements.find((item) => item.source === 'admin').validUntil, validUntil, '人工授权保存有效期');
      same(after.account.entitlements.find((item) => item.source === 'test'), testEntry, '人工权益不覆盖 test 源');
    }
    const concurrencyRevision = (await detail(bob)).account.adminRevision;
    const concurrent = await Promise.all(['页面 A', '页面 B'].map((value) => admin(accountRoute(bob, '/manage'), { method: 'POST', body: { baseRevision: concurrencyRevision, note: value } })));
    same(concurrent.map((item) => item.status).sort(), [200, 409], '同时修改相同版本只有一个成功');
    eq((await detail(bob)).account.adminRevision, concurrencyRevision + 1, '并发冲突不额外递增版本');

    // Filters and paging must use the complete dataset, not a single fetched page.
    const newest = await listAccounts({ sort: 'newest', page: '1', pageSize: '2' });
    const nextPage = await listAccounts({ sort: 'newest', page: '2', pageSize: '2' });
    eq(newest.total, 4, '账号总数'); eq(newest.pages, 2, '账号总页数');
    same([...newest.accounts, ...nextPage.accounts].map((item) => item.id), [dave.id, carol.id, bob.id, alice.id], '分页 newest 顺序稳定且无重复');
    same((await listAccounts({ sort: 'oldest' })).accounts.map((item) => item.id), users.map((item) => item.id), 'oldest 排序');
    same((await listAccounts({ save: 'yes' })).accounts.map((item) => item.id).sort(), [alice.id, bob.id].sort(), '有存档筛选');
    same((await listAccounts({ save: 'no' })).accounts.map((item) => item.id).sort(), [carol.id, dave.id].sort(), '无存档筛选');
    eq((await listAccounts({ q: alice.username })).total, 1, '账号用户名搜索');
    eq((await listAccounts({ q: alice.id })).accounts[0].id, alice.id, '账号 ID 搜索');
    eq((await listAccounts({ q: note })).accounts[0].id, alice.id, '账号备注搜索');
    eq((await listAccounts({ activity: '7d' })).total, 4, '近七天活动筛选');
    for (const sort of ['activity', 'save']) {
      const rows = (await listAccounts({ sort })).accounts;
      const values = rows.map((item) => sort === 'activity' ? item.lastSeen || 0 : item.save?.serverUpdatedAt || 0);
      ok(values.every((value, i) => i === 0 || values[i - 1] >= value), `${sort} 排序时间降序`);
    }
    await checkDecimal('/accounts', 'accounts');

    const catalog = expected(await admin('/gift-catalog'), 200, '资源目录可读取');
    for (const category of ['owned', 'crops', 'seeds', 'decor']) ok(Array.isArray(catalog[category]) && catalog[category].length > 0, '资源目录 ' + category);
    const invalidOps = [
      [{ type: 'coins', mode: 'add', amount: -1 }], [{ type: 'coins', mode: 'set', amount: 20 }],
      [{ type: 'owned', ids: ['qa_missing_resource'] }], [{ type: 'seeds', items: { qa_missing_resource: 1 } }],
    ];
    for (let i = 0; i < invalidOps.length; i++) {
      rejected(await admin(accountRoute(alice, '/gift'), { method: 'POST', body: { baseRevision: 1, idempotencyKey: key('invalid_gift_' + i), ops: invalidOps[i] } }), '直接礼包不能减币、set 或非法资源');
      rejected(await admin('/gift-templates', { method: 'POST', body: { name: '无效模板', ops: invalidOps[i] } }), '模板只能使用加法和有效目录');
    }
    const giftInput = { baseRevision: 1, idempotencyKey: key('direct_gift'), ops: [{ type: 'coins', mode: 'add', amount: 7 }] };
    const gift = expected(await admin(accountRoute(alice, '/gift'), { method: 'POST', body: giftInput }), 200, '直接发放有效礼包');
    eq(gift.save.coins, 107, '礼包增加金币');
    expected(await admin(accountRoute(alice, '/gift'), { method: 'POST', body: { ...giftInput, ops: [{ type: 'coins', mode: 'add', amount: 8 }] } }), 409, '礼包幂等键不能复用不同 payload');
    expected(await admin(accountRoute(bob, '/gift'), { method: 'POST', body: giftInput }), 409, '礼包幂等键不能复用不同目标');
    const giftRetry = expected(await admin(accountRoute(alice, '/gift'), { method: 'POST', body: giftInput }), 200, '相同礼包幂等重试');
    eq(giftRetry.idempotent, true, '重复礼包未再次发放');
    eq((await detail(alice)).save.revision, 2, '无效和重复礼包不增加存档版本');

    const template = expected(await admin('/gift-templates', { method: 'POST', body: { name: 'QA 可恢复模板', description: '回归', ops: [{ type: 'coins', mode: 'add', amount: 10 }] } }), 201, '创建礼包模板').template;
    expected(await admin('/gift-templates/' + template.id, { method: 'DELETE', body: {} }), 200, '归档模板');
    ok(!expected(await admin('/gift-templates'), 200, '默认模板列表').templates.some((item) => item.id === template.id), '默认列表排除归档模板');
    const archived = expected(await admin('/gift-templates?includeArchived=1'), 200, '查看归档模板').templates.find((item) => item.id === template.id);
    eq(archived?.active, false, '归档列表返回 inactive 模板');
    expected(await admin('/gift-templates/' + template.id + '/restore', { method: 'POST', body: {} }), 200, '恢复归档模板');
    eq(expected(await admin('/gift-templates'), 200, '恢复后的模板列表').templates.find((item) => item.id === template.id)?.active, true, '模板恢复后可用');

    // Mail revoke preserves claimed grants, blocks unclaimed users, and is auditable once.
    const mailInput = { kind: 'gift', title: 'QA 工作台礼包', body: '只用于本地回归', audience: 'all', ops: [{ type: 'coins', mode: 'add', amount: 11 }], idempotencyKey: key('mail_gift') };
    const message = expected(await admin('/mail', { method: 'POST', body: mailInput }), 201, '发布测试邮件').message;
    eq(message.recipientCount, 4, '全体邮件投递四个账号');
    expected(await admin('/mail', { method: 'POST', body: { ...mailInput, title: '不同正文' } }), 409, '邮件幂等键 payload 冲突');
    expected(await admin('/mail', { method: 'POST', body: { ...mailInput, audience: 'user', targetUserId: bob.id } }), 409, '邮件幂等键目标冲突');
    eq(expected(await admin('/mail', { method: 'POST', body: mailInput }), 200, '相同邮件重试').idempotent, true, '重复发信幂等');
    const read = expected(await player(alice, `/api/mail/${message.id}/read`, { method: 'POST', body: {} }), 200, '正常邮件阅读');
    ok(read.readAt > 0, '阅读时间记录');
    const claimBody = { baseRevision: 2, idempotencyKey: key('mail_claim') };
    const claim = expected(await player(alice, `/api/mail/${message.id}/claim`, { method: 'POST', body: claimBody }), 200, '正常领取邮件礼包');
    eq(claim.save.coins, 118, '邮件礼包正常增加金币');
    eq(claim.claim.revision, 3, '邮件领取推进存档一次');
    const deliveries1 = expected(await admin(`/mail/${message.id}?page=1&pageSize=2`), 200, '投递明细第一页');
    const deliveries2 = expected(await admin(`/mail/${message.id}?page=2&pageSize=2`), 200, '投递明细第二页');
    eq(deliveries1.total, 4, '投递明细总数'); eq(deliveries1.pages, 2, '投递明细总页数');
    const deliveries = [...deliveries1.deliveries, ...deliveries2.deliveries];
    eq(new Set(deliveries.map((item) => item.userId)).size, 4, '投递分页不重叠');
    ok(deliveries.every((item) => users.some((user) => user.id === item.userId && user.username === item.username)), '投递明细包含正确用户与用户名');
    ok(deliveries.find((item) => item.userId === alice.id)?.readAt > 0 && deliveries.find((item) => item.userId === alice.id)?.claimedAt > 0, '已读与领取时间可见');
    eq(deliveries.find((item) => item.userId === bob.id)?.claimedAt, null, '未领取明细正确');
    rejected(await admin(`/mail/${message.id}/revoke`, { method: 'POST', body: { reason: '' } }), '撤信必须填写原因');
    const revokeReason = 'QA 撤回未领取邮件';
    expected(await admin(`/mail/${message.id}/revoke`, { method: 'POST', body: { reason: revokeReason } }), 200, '撤回邮件');
    eq(expected(await admin(`/mail/${message.id}/revoke`, { method: 'POST', body: { reason: revokeReason } }), 200, '重复撤回邮件').idempotent, true, '撤回操作幂等');
    rejected(await player(bob, `/api/mail/${message.id}/read`, { method: 'POST', body: {} }), '未领取用户不能阅读撤回邮件');
    rejected(await player(bob, `/api/mail/${message.id}/claim`, { method: 'POST', body: { baseRevision: 1, idempotencyKey: key('revoked_claim') } }), '未领取用户不能领取撤回邮件');
    const revokedRetry = expected(await player(alice, `/api/mail/${message.id}/claim`, { method: 'POST', body: claimBody }), 200, '已领取用户撤回后仍可幂等重试');
    eq(revokedRetry.idempotent, true, '撤回不打破已领取重试');
    eq((await detail(alice)).save.data.coins, 118, '撤回不回收已领取资源');
    eq((await detail(alice)).save.revision, 3, '撤回与重试不推进已领存档');
    ok(!expected(await player(bob, '/api/mail'), 200, '撤回后的玩家收件箱').messages.some((item) => item.id === message.id), '撤回邮件移出玩家可操作列表');
    eq(expected(await admin(`/mail/${message.id}`), 200, '撤回后的投递详情').message.status, 'revoked', '撤回状态仍可后台查看');

    const announcement = expected(await admin('/mail', { method: 'POST', body: { kind: 'announcement', title: 'QA 仍发布公告', body: '公告筛选', audience: 'all', idempotencyKey: key('announcement') } }), 201, '发布公告').message;
    const expiresAt = Date.now() + 150;
    const expires = expected(await admin('/mail', { method: 'POST', body: { ...mailInput, title: 'QA 过期礼包', audience: 'user', targetUserId: bob.id, expiresAt, idempotencyKey: key('expires') } }), 201, '发布短时邮件').message;
    await sleep(Math.max(0, expiresAt - Date.now() + 40));
    expected(await player(bob, `/api/mail/${expires.id}/claim`, { method: 'POST', body: { baseRevision: 1, idempotencyKey: key('expired_claim') } }), 410, '过期邮件不能领取');
    same(expected(await admin('/mail?status=revoked'), 200, '撤回筛选').messages.map((item) => item.id), [message.id], '撤回列表精确');
    same(expected(await admin('/mail?status=expired'), 200, '过期筛选').messages.map((item) => item.id), [expires.id], '过期列表精确');
    same(expected(await admin('/mail?status=published&kind=announcement'), 200, '发布公告筛选').messages.map((item) => item.id), [announcement.id], '正常发布过滤过期和撤回');
    eq(expected(await admin('/mail?q=' + encodeURIComponent('QA 工作台礼包')), 200, '邮件搜索').total, 1, '邮件关键词搜索');
    const mailPage1 = expected(await admin('/mail?status=all&page=1&pageSize=1'), 200, '邮件第一页');
    const mailPage2 = expected(await admin('/mail?status=all&page=2&pageSize=1'), 200, '邮件第二页');
    eq(mailPage1.total, 3, '邮件总数'); eq(mailPage1.pages, 3, '邮件总页数');
    ok(mailPage1.messages[0].id !== mailPage2.messages[0].id, '邮件分页不重复');
    await checkDecimal('/mail', 'messages');
    await checkDecimal(`/mail/${message.id}`, 'deliveries');

    // Regression checks for new workbench enhancements: delivery filter/search, mail stats, account mailDeliveries/recentAudits, and single-session revoke.
    const claimedOnly = expected(await admin(`/mail/${message.id}?status=claimed`), 200, '投递明细已领取筛选');
    eq(claimedOnly.total, 1, '已领取筛选数量');
    eq(claimedOnly.deliveries[0].userId, alice.id, '已领取用户为 Alice');
    const unclaimedOnly = expected(await admin(`/mail/${message.id}?status=unclaimed`), 200, '投递明细未领取筛选');
    eq(unclaimedOnly.total, 3, '未领取筛选数量');
    const searchDelivery = expected(await admin(`/mail/${message.id}?q=` + encodeURIComponent(bob.username)), 200, '投递明细用户名搜索');
    eq(searchDelivery.total, 1, '投递明细用户名搜索命中');
    eq(searchDelivery.deliveries[0].userId, bob.id, '投递明细搜索返回 Bob');
    const mailOverview = expected(await admin('/mail'), 200, '邮件列表包含统计汇总');
    ok(mailOverview.stats && mailOverview.stats.totalMessages === 3 && mailOverview.stats.revokedMessages === 1, '邮件统计汇总准确');

    const aliceEnriched = await detail(alice);
    ok(Array.isArray(aliceEnriched.mailDeliveries) && aliceEnriched.mailDeliveries.length >= 2, '账号详情包含收件历史');
    ok(Array.isArray(aliceEnriched.recentAudits) && aliceEnriched.recentAudits.length >= 2, '账号详情包含近期审计记录');

    // Single-session revoke preserves other active sessions on the same account.
    await login(dave);
    const daveCookie1 = dave.cookie;
    await login(dave);
    const daveCookie2 = dave.cookie;
    const daveDetailBefore = await detail(dave);
    ok(daveDetailBefore.sessions >= 2, 'Dave 拥有多个并行登录会话');
    const targetSessionId = daveDetailBefore.sessionList[0].id;
    expected(await admin(accountRoute(dave, '/revoke-sessions'), {
      method: 'POST',
      body: { baseRevision: daveDetailBefore.account.adminRevision, sessionId: targetSessionId, reason: 'QA 单会话下线验证' },
    }), 200, '指定单会话下线');
    const daveDetailAfter = await detail(dave);
    eq(daveDetailAfter.sessions, daveDetailBefore.sessions - 1, '仅下线指定会话，保留其余会话');
    ok(!daveDetailAfter.sessionList.some((s) => s.id === targetSessionId), '目标会话已移除');
    ok(daveCookie1 !== daveCookie2, '两次登录会话不同');

    const audits = expected(await admin('/audit?page=1&pageSize=100'), 200, '审计总览');
    ok(audits.entries.length >= 10, '操作留下审计记录');
    const revokeAudits = expected(await admin('/audit?action=mail.revoke'), 200, '撤回审计筛选');
    eq(revokeAudits.total, 1, '重复撤回只写一次审计');
    eq(revokeAudits.entries[0].detail.messageId, message.id, '撤回审计包含目标邮件');
    eq(revokeAudits.entries[0].detail.reason, revokeReason, '撤回审计保存原因');
    const targetAudits = expected(await admin('/audit?targetUserId=' + bob.id), 200, '目标用户审计');
    ok(targetAudits.entries.length > 0 && targetAudits.entries.every((item) => item.targetUserId === bob.id), '目标用户过滤');
    const queryAudits = expected(await admin('/audit?q=' + encodeURIComponent(revokeReason)), 200, '审计关键词');
    ok(queryAudits.entries.some((item) => item.id === revokeAudits.entries[0].id), '审计关键词搜索明细');
    const timestamp = revokeAudits.entries[0].createdAt;
    const dateAudits = expected(await admin(`/audit?from=${timestamp}&to=${timestamp}`), 200, '审计时间范围');
    ok(dateAudits.entries.some((item) => item.id === revokeAudits.entries[0].id), '时间范围包含边界');
    ok(dateAudits.entries.every((item) => item.createdAt >= timestamp && item.createdAt <= timestamp), '时间范围精确');
    const auditPage1 = expected(await admin('/audit?page=1&pageSize=2'), 200, '审计第一页');
    const auditPage2 = expected(await admin('/audit?page=2&pageSize=2'), 200, '审计第二页');
    same(expected(await admin('/audit?page=1&pageSize=2'), 200, '重复审计第一页').entries.map((item) => item.id), auditPage1.entries.map((item) => item.id), '同时间审计排序稳定');
    eq(new Set([...auditPage1.entries, ...auditPage2.entries].map((item) => item.id)).size, 4, '审计分页无重叠');
    ok(expected(await admin('/audit?limit=2'), 200, '兼容旧 limit').entries.length <= 2, '旧 limit 保持限制');
    await checkDecimal('/audit', 'entries');

    // Only the disposable SQLite fixture is edited, with the child stopped first.
    // This creates a genuine older activity timestamp that API calls cannot manufacture.
    const initialSettings = expected(await admin('/service-settings'), 200, '隔离服务设置').settings;
    const persistedSettings = expected(await admin('/service-settings', { method: 'PUT', body: { baseRevision: initialSettings.revision, freeEntitlements: true } }), 200, '写入隔离服务设置').settings;
    eq(persistedSettings.revision, initialSettings.revision + 1, '服务设置推进版本');
    const beforeRestart = await detail(alice), bobBeforeRestart = await detail(bob);
    await stopServer();
    const { DatabaseSync } = require('node:sqlite');
    const fixture = new DatabaseSync(database);
    try {
      fixture.prepare('DELETE FROM sessions WHERE user_id=?').run(carol.id);
      fixture.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now() - 8 * 86400000, carol.id);
    }
    finally { fixture.close(); }
    await startServer();
    const afterRestart = await detail(alice), bobAfterRestart = await detail(bob);
    eq(afterRestart.account.note, note, '重启后账号备注仍保存');
    eq(afterRestart.account.adminRevision, beforeRestart.account.adminRevision, '重启不重置账号管理版本');
    eq(afterRestart.save.data.coins, 118, '重启后保留存档与已领资源');
    eq(bobAfterRestart.account.lastSeen, bobBeforeRestart.account.lastSeen, '重启后最近活动仍保存');
    same(expected(await admin('/service-settings'), 200, '重启后服务设置').settings, persistedSettings, '重启不覆盖已保存的服务设置');
    same((await listAccounts({ activity: 'inactive' })).accounts.map((item) => item.id), [carol.id], '超过七天未活动筛选');
    eq((await listAccounts({ activity: '7d' })).total, 3, '七天活动筛选排除旧活动');
    same(expected(await admin('/audit?action=mail.revoke'), 200, '重启后审计').entries.map((item) => item.id), revokeAudits.entries.map((item) => item.id), '重启保留审计与幂等记录');
    return { status: 'ok', assertions, users: 4, isolated: true, accountCAS: true, sessions: true, entitlements: 'admin source only', mailRevoke: true, pagination: true, persistence: true };
  } finally {
    clearTimeout(timeout);
    await stopServer();
    // rm targets exactly the directory created by mkdtemp, never project data.
    assert.ok(path.dirname(dataDir) === path.resolve(tmpdir()) && path.basename(dataDir).startsWith('nuannuan-workbench-qa-'), '临时目录清理边界');
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
  }
}

main().then((result) => console.log(JSON.stringify(result))).catch((error) => {
  console.error(JSON.stringify({ status: 'failed', assertions, error: error.stack || String(error), serverOutput }));
  process.exitCode = 1;
});
