// 邮件与礼包工坊回归：资源目录、模板 CRUD、公告已读、定向隔离、版本冲突、领取幂等、过期和管理统计。
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const port = 57500 + Math.floor(Math.random() * 400);
const root = mkdtempSync(path.join(tmpdir(), 'nuannuan-mail-qa-'));
const token = 'qa-mail-admin-token-20261012';
const isolatedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
const child = spawn(process.execPath, ['server-api.js'], {
  cwd: path.resolve(__dirname, '../..'),
  env: {
    ...isolatedEnvironment,
    API_PORT: String(port),
    DATA_DIR: root,
    AUTH_DB: path.join(root, 'accounts.sqlite'),
    COOKIE_SECURE: '0',
    PUBLIC_FREE_ENTITLEMENTS: '1',
    PAYMENT_CHECKOUT_ENABLED: '0',
    ADMIN_API_TOKEN: token,
    APP_ORIGINS: `http://127.0.0.1:${port}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(pathname, options = {}) {
  const headers = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(base + pathname, { ...options, headers });
  let body = null;
  try { body = await res.json(); } catch { /* empty response */ }
  return { res, body };
}

function sessionCookie(response) {
  const value = String(response.headers.get('set-cookie') || '').split(';')[0];
  assert.match(value, /^session=/, '注册/登录应返回会话 Cookie');
  return value;
}

async function register(username) {
  const response = await call('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'qa-mail-password-123' }),
  });
  assert.equal(response.res.status, 201, `注册 ${username} 应成功`);
  return { cookie: sessionCookie(response.res), user: response.body.user };
}

function saveData(coins) {
  return {
    v: 3,
    started: true,
    coins,
    owned: ['d_reunion'],
    outfit: { hair: 'h_default', dress: 'd_reunion', shoes: 's_default' },
    shops: {},
    placed: [],
    crops: {},
    seeds: {},
    decor: {},
    house: 1,
    yardLv: 1,
    gday: 0,
  };
}

async function main() {
  try {
    let health;
    for (let i = 0; i < 60; i += 1) {
      try {
        health = await call('/api/healthz');
        if (health.res.ok) break;
      } catch { /* server is still starting */ }
      await sleep(50);
    }
    assert.equal(health?.body?.ok, true, 'API 应启动');

    const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const alice = await register(`mailqa_a_${stamp}`);
    const bob = await register(`mailqa_b_${stamp}`);
    assert.notEqual(alice.user.id, bob.user.id, '测试账号应是两个不同用户');

    const saveAlice = await call('/api/save', {
      method: 'PUT',
      headers: { Cookie: alice.cookie },
      body: JSON.stringify({ baseRevision: 0, data: saveData(100) }),
    });
    assert.equal(saveAlice.res.status, 200, 'Alice 初始存档应保存');
    const saveBob = await call('/api/save', {
      method: 'PUT',
      headers: { Cookie: bob.cookie },
      body: JSON.stringify({ baseRevision: 0, data: saveData(25) }),
    });
    assert.equal(saveBob.res.status, 200, 'Bob 初始存档应保存');

    const adminHeaders = { 'X-Admin-Token': token };
    const catalogUnauthorized = await call('/api/admin/gift-catalog');
    assert.equal(catalogUnauthorized.res.status, 401, '资源目录应要求管理员登录');
    const catalogResponse = await call('/api/admin/gift-catalog', { headers: adminHeaders });
    assert.equal(catalogResponse.res.status, 200, 'admin 应能读取资源目录');
    const catalog = catalogResponse.body;
    for (const type of ['owned', 'seeds', 'crops', 'decor']) {
      assert.ok(Array.isArray(catalog[type]) && catalog[type].length > 0, `${type} 目录应包含可用资源`);
      assert.ok(catalog[type].every((item) => typeof item.id === 'string' && item.id && typeof item.name === 'string'), `${type} 目录应包含有效 ID 和名称`);
    }
    assert.ok(catalog.seeds.some((item) => item.id === 'radish'), '萝卜种子应属于有效目录');
    const ownedId = catalog.owned.find((item) => item.id !== 'd_reunion').id;
    const cropId = catalog.crops[0].id;
    const decorId = catalog.decor[0].id;
    const invalidTemplate = await call('/api/admin/gift-templates', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ name: '不存在的资源', ops: [{ type: 'seeds', items: { qa_missing_resource: 1 } }] }),
    });
    assert.equal(invalidTemplate.res.status, 400, '模板不能保存目录中不存在的资源');
    const createdTemplate = await call('/api/admin/gift-templates', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: '邮件测试礼包',
        description: '回归测试模板',
        ops: [{ type: 'coins', mode: 'add', amount: 200 }],
      }),
    });
    assert.equal(createdTemplate.res.status, 201, 'admin 应能创建礼包模板');
    const templateId = createdTemplate.body.template.id;
    assert.ok(templateId);

    const updatedTemplate = await call(`/api/admin/gift-templates/${encodeURIComponent(templateId)}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        name: '邮件测试礼包（已更新）',
        description: '更新后的回归模板',
        ops: [
          { type: 'coins', mode: 'add', amount: 300 },
          { type: 'seeds', items: { radish: 3 } },
          { type: 'owned', ids: [ownedId] },
          { type: 'crops', items: { [cropId]: 4 } },
          { type: 'decor', items: { [decorId]: 2 } },
        ],
      }),
    });
    assert.equal(updatedTemplate.res.status, 200, 'admin 应能更新礼包模板');
    assert.equal(updatedTemplate.body.template.ops[0].amount, 300);

    const templates = await call('/api/admin/gift-templates', { headers: adminHeaders });
    assert.equal(templates.res.status, 200, 'admin 应能列出礼包模板');
    const listedTemplate = templates.body.templates.find((item) => item.id === templateId);
    assert.ok(listedTemplate, '已创建模板应出现在模板列表');
    assert.equal(listedTemplate.name, '邮件测试礼包（已更新）');
    assert.deepEqual(listedTemplate.ops[1], { type: 'seeds', items: { radish: 3 } });

    const announcement = await call('/api/admin/mail', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        kind: 'announcement',
        title: '测试公告',
        body: '这是一封全体公告邮件。',
        audience: 'all',
        idempotencyKey: `mailqa_announce_${stamp}`,
      }),
    });
    assert.equal(announcement.res.status, 201, 'admin 应能发布全体公告');
    assert.equal(announcement.body.message.recipientCount, 2, '全体公告应投递到两个账号');
    const announcementId = announcement.body.message.id;

    const targetedGift = await call('/api/admin/mail', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        kind: 'gift',
        title: '定向测试礼包',
        body: '给 Alice 的测试礼包。',
        audience: 'user',
        targetUserId: alice.user.id,
        ops: listedTemplate.ops,
        idempotencyKey: `mailqa_target_${stamp}`,
      }),
    });
    assert.equal(targetedGift.res.status, 201, 'admin 应能发布定向礼包');
    assert.equal(targetedGift.body.message.recipientCount, 1, '定向礼包只能投递到 Alice');
    const targetedGiftId = targetedGift.body.message.id;

    const invalidMail = await call('/api/admin/mail', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ kind: 'gift', title: '无效资源邮件', body: '不应投递', audience: 'user', targetUserId: alice.user.id,
        ops: [{ type: 'owned', ids: ['qa_missing_resource'] }], idempotencyKey: `mailqa_invalid_${stamp}` }),
    });
    assert.equal(invalidMail.res.status, 400, '邮件不能投递目录中不存在的资源');

    const expiresAt = Date.now() + 1000;
    const expiredGift = await call('/api/admin/mail', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        kind: 'gift',
        title: '短时效礼包',
        body: '用于验证过期保护。',
        audience: 'user',
        targetUserId: alice.user.id,
        ops: [{ type: 'coins', mode: 'add', amount: 1 }],
        expiresAt,
        idempotencyKey: `mailqa_expire_${stamp}`,
      }),
    });
    assert.equal(expiredGift.res.status, 201, 'admin 应能发布有过期时间的礼包');
    const expiredGiftId = expiredGift.body.message.id;

    const aliceMail = await call('/api/mail', { headers: { Cookie: alice.cookie } });
    assert.equal(aliceMail.res.status, 200, 'Alice 应能查看邮件');
    assert.equal(aliceMail.body.messages.length, 3, 'Alice 应看到公告、定向礼包和短时效礼包');
    assert.equal(aliceMail.body.unread, 3, 'Alice 初次查看应有 3 封未读邮件');
    assert.ok(aliceMail.body.messages.some((item) => item.id === announcementId));
    assert.ok(aliceMail.body.messages.some((item) => item.id === targetedGiftId));

    const bobMail = await call('/api/mail', { headers: { Cookie: bob.cookie } });
    assert.equal(bobMail.res.status, 200, 'Bob 应能查看邮件');
    assert.equal(bobMail.body.messages.length, 1, 'Bob 不应看见 Alice 的定向礼包');
    assert.equal(bobMail.body.messages[0].id, announcementId);
    assert.equal(bobMail.body.unread, 1);
    const bobTargeted = await call(`/api/mail/${encodeURIComponent(targetedGiftId)}/read`, { method: 'POST', headers: { Cookie: bob.cookie }, body: '{}' });
    assert.equal(bobTargeted.res.status, 404, 'Bob 不能读取 Alice 的定向邮件');

    const markRead = await call(`/api/mail/${encodeURIComponent(announcementId)}/read`, { method: 'POST', headers: { Cookie: alice.cookie }, body: '{}' });
    assert.equal(markRead.res.status, 200, 'Alice 应能标记公告已读');
    const aliceUnreadAfterRead = await call('/api/mail/unread-count', { headers: { Cookie: alice.cookie } });
    assert.equal(aliceUnreadAfterRead.res.status, 200);
    assert.equal(aliceUnreadAfterRead.body.unread, 2);
    const readAgain = await call(`/api/mail/${encodeURIComponent(announcementId)}/read`, { method: 'POST', headers: { Cookie: alice.cookie }, body: '{}' });
    assert.equal(readAgain.res.status, 200, '重复标记已读应成功');
    const mailAfterRead = await call('/api/mail', { headers: { Cookie: alice.cookie } });
    assert.ok(mailAfterRead.body.messages.find((item) => item.id === announcementId).readAt, '公告已读状态应持久保存');
    assert.equal(mailAfterRead.body.unread, 2, '重复已读不应再次扣减未读数');
    const bobUnreadAfterAliceRead = await call('/api/mail/unread-count', { headers: { Cookie: bob.cookie } });
    assert.equal(bobUnreadAfterAliceRead.body.unread, 1, 'Alice 阅读公告不能改变 Bob 的未读状态');

    const announcementClaim = await call(`/api/mail/${encodeURIComponent(announcementId)}/claim`, {
      method: 'POST', headers: { Cookie: alice.cookie }, body: JSON.stringify({ idempotencyKey: `mailqa_bad_claim_${stamp}`, baseRevision: 1 }),
    });
    assert.equal(announcementClaim.res.status, 400, '公告邮件不应允许领取礼包');
    assert.equal(announcementClaim.body.code, 'MAIL_NOT_GIFT');

    const claimKey = `mailqa_claim_${stamp}`;
    const newerSave = await call('/api/save', {
      method: 'PUT', headers: { Cookie: alice.cookie },
      body: JSON.stringify({ baseRevision: 1, data: saveData(175) }),
    });
    assert.equal(newerSave.res.status, 200, '模拟第二台设备先保存新的游戏进度');
    for (const [index, baseRevision] of [undefined, null, -1, 1.5, '2'].entries()) {
      const invalidRevision = await call(`/api/mail/${encodeURIComponent(targetedGiftId)}/claim`, {
        method: 'POST', headers: { Cookie: alice.cookie },
        body: JSON.stringify({ idempotencyKey: `mailqa_invalid_revision_${stamp}_${index}`, baseRevision }),
      });
      assert.equal(invalidRevision.res.status, 400, '缺省或非法版本不能领取邮件礼包');
      assert.equal(invalidRevision.body.code, 'SAVE_REVISION_REQUIRED');
    }
    const staleClaim = await call(`/api/mail/${encodeURIComponent(targetedGiftId)}/claim`, {
      method: 'POST', headers: { Cookie: alice.cookie },
      body: JSON.stringify({ idempotencyKey: claimKey, baseRevision: 1 }),
    });
    assert.equal(staleClaim.res.status, 409, '旧版本设备领取礼包应得到存档版本冲突');
    assert.equal(staleClaim.body.code, 'MAIL_REVISION_CONFLICT');
    assert.equal(staleClaim.body.currentRevision, 2);
    const saveAfterConflict = await call('/api/save', { headers: { Cookie: alice.cookie } });
    assert.equal(saveAfterConflict.body.revision, 2, '冲突不能推进云存档版本');
    assert.equal(saveAfterConflict.body.data.coins, 175, '冲突不能覆盖较新的游戏进度或发放礼包');
    const mailAfterConflict = await call('/api/mail', { headers: { Cookie: alice.cookie } });
    assert.equal(mailAfterConflict.body.messages.find((item) => item.id === targetedGiftId).claimedAt, null, '冲突不能把礼包标记为已领取');
    const claim = await call(`/api/mail/${encodeURIComponent(targetedGiftId)}/claim`, {
      method: 'POST',
      headers: { Cookie: alice.cookie },
      body: JSON.stringify({ idempotencyKey: claimKey, baseRevision: 2 }),
    });
    assert.equal(claim.res.status, 200, 'Alice 应能领取定向礼包');
    assert.equal(claim.body.claim.revision, 3);
    assert.equal(claim.body.save.coins, 475, '礼包应在较新的进度上增加 300 噗灵');
    assert.equal(claim.body.claim.ops[1].items.radish, 3);

    const duplicateClaim = await call(`/api/mail/${encodeURIComponent(targetedGiftId)}/claim`, {
      method: 'POST',
      headers: { Cookie: alice.cookie },
      body: JSON.stringify({ idempotencyKey: claimKey, baseRevision: 2 }),
    });
    assert.equal(duplicateClaim.res.status, 200, '重复领取请求应成功返回幂等结果');
    assert.equal(duplicateClaim.body.idempotent, true);
    assert.equal(duplicateClaim.body.claim.revision, claim.body.claim.revision);
    assert.equal(duplicateClaim.body.save.coins, claim.body.save.coins);
    const duplicateNewKey = await call(`/api/mail/${encodeURIComponent(targetedGiftId)}/claim`, {
      method: 'POST', headers: { Cookie: alice.cookie },
      body: JSON.stringify({ idempotencyKey: `mailqa_retry_${stamp}`, baseRevision: 3 }),
    });
    assert.equal(duplicateNewKey.res.status, 200, '更换请求键也不能重复领取同一封邮件');
    assert.equal(duplicateNewKey.body.idempotent, true);

    const aliceSave = await call('/api/save', { headers: { Cookie: alice.cookie } });
    assert.equal(aliceSave.res.status, 200);
    assert.equal(aliceSave.body.revision, 3);
    assert.equal(aliceSave.body.data.coins, 475);
    assert.equal(aliceSave.body.data.seeds.radish, 3);
    assert.ok(aliceSave.body.data.owned.includes(ownedId), '服装附件应进入实际云存档');
    assert.equal(aliceSave.body.data.crops[cropId], 4, '作物附件应进入实际云存档');
    assert.equal(aliceSave.body.data.decor[decorId], 2, '装饰附件应进入实际云存档');

    const bobClaimTargeted = await call(`/api/mail/${encodeURIComponent(targetedGiftId)}/claim`, {
      method: 'POST', headers: { Cookie: bob.cookie }, body: JSON.stringify({ idempotencyKey: `mailqa_bob_claim_${stamp}`, baseRevision: 1 }),
    });
    assert.equal(bobClaimTargeted.res.status, 404, 'Bob 不能领取 Alice 的定向礼包');

    await sleep(Math.max(0, expiresAt - Date.now() + 30));
    const expiredClaim = await call(`/api/mail/${encodeURIComponent(expiredGiftId)}/claim`, {
      method: 'POST',
      headers: { Cookie: alice.cookie },
      body: JSON.stringify({ idempotencyKey: `mailqa_expired_claim_${stamp}`, baseRevision: 3 }),
    });
    assert.equal(expiredClaim.res.status, 410, '过期礼包领取应返回 410');
    assert.equal(expiredClaim.body.code, 'MAIL_EXPIRED');

    const adminMail = await call('/api/admin/mail', { headers: adminHeaders });
    assert.equal(adminMail.res.status, 200, 'admin 应能读取邮件统计');
    const announcementStats = adminMail.body.messages.find((item) => item.id === announcementId);
    const targetedStats = adminMail.body.messages.find((item) => item.id === targetedGiftId);
    const expiredStats = adminMail.body.messages.find((item) => item.id === expiredGiftId);
    assert.deepEqual(
      { recipients: announcementStats.recipients, reads: announcementStats.reads, claims: announcementStats.claims },
      { recipients: 2, reads: 1, claims: 0 },
    );
    assert.deepEqual(
      { recipients: targetedStats.recipients, reads: targetedStats.reads, claims: targetedStats.claims },
      { recipients: 1, reads: 1, claims: 1 },
    );
    assert.deepEqual(
      { recipients: expiredStats.recipients, reads: expiredStats.reads, claims: expiredStats.claims },
      { recipients: 1, reads: 0, claims: 0 },
    );

    const unreadAfterClaim = await call('/api/mail/unread-count', { headers: { Cookie: alice.cookie } });
    assert.equal(unreadAfterClaim.res.status, 200);
    assert.equal(unreadAfterClaim.body.unread, 0, '已读/已领取邮件以及已过期邮件不应计入未读');

    const result = {
      status: 'ok',
      users: 2,
      catalog: { categories: 4, invalidTemplateStatus: invalidTemplate.res.status, invalidMailStatus: invalidMail.res.status },
      template: { created: true, updated: true, listed: true },
      announcement: { recipients: announcementStats.recipients, reads: announcementStats.reads },
      targetedGift: { recipients: targetedStats.recipients, claims: targetedStats.claims, idempotent: duplicateClaim.body.idempotent },
      revisionConflict: { status: staleClaim.res.status, code: staleClaim.body.code, preservedCoins: saveAfterConflict.body.data.coins },
      expiredGift: { status: expiredClaim.res.status, code: expiredClaim.body.code },
      alice: { revision: aliceSave.body.revision, coins: aliceSave.body.data.coins, unread: unreadAfterClaim.body.unread },
      bob: { visibleMessages: bobMail.body.messages.length, targetedStatus: bobClaimTargeted.res.status },
    };
    console.log(JSON.stringify(result));
  } finally {
    child.kill('SIGKILL');
    await sleep(120);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('nuannuan-mail-qa-'));
    try { rmSync(root, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
