// 账号、会话与云存档同步。游戏仍然可以匿名离线运行；登录后才启用云端。
import { S, flushSave, getCloudSaveBase, setCloudSaveBase, normalizeSaveData, replaceSaveData, serializeState } from './state.js';
import { LOCAL_PLAY } from './local-play-mode.js';

// 桌面版由 preload/--api-base 注入地址；Android 可在入口 HTML 中设置
// __NIKKI_API_BASE__。开源副本默认不连接任何外部账号服务器。
const API_BASE = String(globalThis.__NIKKI_API_BASE__ || '').replace(/\/$/, '');
const NATIVE_API_BASE = '';
const isNativeHost = () => !!globalThis.NikkiNative?.setOrientation
  || !!globalThis.Capacitor?.isNativePlatform?.();
const apiBase = () => API_BASE || (isNativeHost() ? NATIVE_API_BASE : '');
const DESKTOP_API_MISSING = !apiBase() && (globalThis.location?.protocol === 'app:' || isNativeHost());
const PROFILE_KEY = 'nikki-town-account-v1' + (LOCAL_PLAY ? ':local-free-play-v1' : '');
const FREE_ENTITLEMENTS = Object.freeze({
  plan: 'free', features: [], entitlements: [], expiresAt: null, checkedAt: 0,
  cloudSync: false, autoUpdate: false, freeEntitlements: false,
});
let profile = null;
let entitlementState = { ...FREE_ENTITLEMENTS };
let entitlementUserId = '';
let revision = 0;
let syncReady = false;
let pending = null;
let lastPayload = '';
let authStatus = 'unknown';
let authError = null;
let epoch = 0;
let restoreTask = null;
let authTask = null;
let operationTail = Promise.resolve();
let syncTask = null;
const claimKeys = new Map();
let claimAllTask = null;
let claimAllContext = null;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function comparablePayload(value) {
  if (!value) return '';
  const data = normalizeSaveData(typeof value === 'string' ? JSON.parse(value) : value);
  // 设备偏好与自动计时不是游戏进度；日常任务、日期、奖励必须参与比较。
  delete data.clock; delete data.savedAt; delete data.settings;
  return JSON.stringify(canonical(data));
}
function samePayload(left, right) { return comparablePayload(left) === comparablePayload(right); }
function context() { return { epoch, id: profile?.id }; }
function current(ctx) { return ctx.epoch === epoch && ctx.id === profile?.id; }
function assertCurrent(ctx) {
  if (!current(ctx)) { const error = new Error('账号已切换，本次操作已停止'); error.code = 'SESSION_CHANGED'; throw error; }
}
function enqueue(run) {
  const task = operationTail.then(run);
  operationTail = task.catch(() => {});
  return task;
}
function queueSave(run) {
  const ctx = context();
  return enqueue(() => current(ctx) ? run(ctx) : { kind: 'cancelled', ok: false, skipped: true });
}
function resetSync() { revision = 0; syncReady = false; pending = null; lastPayload = ''; }
function baselineKey(ctx) {
  const slot = new URLSearchParams(globalThis.location?.search || '').get('slot') || '';
  return PROFILE_KEY + ':sync-v1:' + [apiBase() || globalThis.location?.origin || '', ctx.id, slot].map(encodeURIComponent).join(':');
}
async function fingerprint(text) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function readBaseline(ctx) {
  try {
    const b = getCloudSaveBase();
    return b?.scope === baselineKey(ctx) && b?.schema === 1 && /^[a-f0-9]{64}$/.test(b.hash) && Number.isInteger(b.revision) ? b : null;
  } catch { return null; }
}
async function acknowledge(ctx, data, rev, knownHash) {
  const text = comparablePayload(data), hash = knownHash || await fingerprint(text);
  assertCurrent(ctx);
  revision = rev; lastPayload = text; syncReady = true; pending = null;
  try {
    if (hash) setCloudSaveBase({ schema: 1, scope: baselineKey(ctx), revision: rev, hash });
  } catch { /* 无法保存基线时，下次启动保守要求选择；不猜测覆盖。 */ }
}
function conflict(cloud, notify = true) {
  pending = { local: S.started ? serializeState() : null, cloud };
  syncReady = false;
  if (notify) emit('sync', { state: 'conflict', conflict: cloud, local: pending.local });
  return { kind: 'conflict', ...pending };
}
function assertSettled() {
  if (globalThis.__nuannuanDecorTransaction) throw new Error('请先完成装修结算，再同步存档或领取礼包');
}
async function sessionRequest(ctx, path, options) {
  assertCurrent(ctx);
  const headers = new Headers(options?.headers || {});
  if (ctx.id) headers.set('X-Nikki-Account-Id', ctx.id);
  try { const result = await request(path, { ...options, headers }); assertCurrent(ctx); return result; }
  catch (error) {
    assertCurrent(ctx);
    if (error.body?.code === 'ACCOUNT_CHANGED') {
      epoch++; authStatus = 'unknown'; authError = error; resetSync(); entitlementUserId = '';
      remember(null); setEntitlements(FREE_ENTITLEMENTS);
    }
    if (error.status === 401) {
      epoch++; authStatus = 'signed-out'; resetSync(); entitlementUserId = '';
      remember(null); setEntitlements(FREE_ENTITLEMENTS);
    }
    throw error;
  }
}
async function fetchCloud(ctx) {
  try {
    const cloud = await sessionRequest(ctx, '/api/save');
    return { ...cloud, data: normalizeSaveData(cloud.data) };
  } catch (error) { if (error.status === 404) return null; throw error; }
}
async function refreshEntitlements(ctx) {
  if (!profile) return setEntitlements(FREE_ENTITLEMENTS);
  const result = await sessionRequest(ctx, '/api/account/entitlements');
  entitlementUserId = ctx.id;
  return setEntitlements(result);
}
async function upload(ctx, data, baseRevision) {
  assertSettled();
  try {
    const result = await sessionRequest(ctx, '/api/save', { method: 'PUT', body: JSON.stringify({ baseRevision, data, clientUpdatedAt: data.savedAt || Date.now() }) });
    await acknowledge(ctx, data, result.revision);
    emit('sync', { state: 'saved', revision });
    return { kind: 'local', ok: true, revision };
  } catch (error) {
    if (current(ctx) && error.status === 409) return { ...conflict(error.body?.conflict), ok: false, error };
    throw error;
  }
}
async function adoptCloud(ctx, cloud) {
  assertCurrent(ctx); assertSettled();
  const before = serializeState(), beforeText = comparablePayload(before);
  const hash = await fingerprint(comparablePayload(cloud.data));
  assertCurrent(ctx); assertSettled();
  const latest = serializeState();
  if (comparablePayload(latest) !== beforeText) return conflict(cloud);
  // 保留可恢复的本机副本；写入失败时拒绝覆盖。
  if (S.started) localStorage.setItem('nikki-town-before-account-sync', JSON.stringify(latest));
  const next = { ...cloud.data, settings: latest.settings };
  const base = hash ? { schema: 1, scope: baselineKey(ctx), revision: cloud.revision, hash } : null;
  replaceSaveData(next, base);
  // stateReplaced 监听器可能初始化新一天的任务；基线仍是服务器确认的原数据。
  await acknowledge(ctx, next, cloud.revision, hash);
  emit('sync', { state: 'ready', revision });
  return { kind: 'cloud', revision };
}
async function prepare(ctx) {
  if (!profile) throw new Error('请先登录');
  assertSettled(); flushSave();
  await refreshEntitlements(ctx);
  if (!account.has('cloud_sync')) {
    resetSync(); emit('sync', { state: 'local-only', entitlements: entitlementState });
    return { kind: 'premium-required', entitlements: entitlementState };
  }
  const cloud = await fetchCloud(ctx);
  // GET 期间仍可以游玩，必须使用请求返回后的本机进度。
  const local = S.started ? serializeState() : null;
  if (!cloud && !local) { resetSync(); syncReady = true; return { kind: 'empty' }; }
  if (!cloud) { const r = await upload(ctx, local, 0); return r.ok ? { ...r, kind: 'uploaded-local' } : r; }
  if (!local) { const r = await adoptCloud(ctx, cloud); return r.kind === 'cloud' ? { ...r, kind: 'downloaded-cloud' } : r; }
  const baseline = readBaseline(ctx);
  const cloudText = comparablePayload(cloud.data), cloudHash = await fingerprint(cloudText);
  assertCurrent(ctx);
  const latest = serializeState(), localText = comparablePayload(latest);
  if (localText === cloudText) {
    await acknowledge(ctx, cloud.data, cloud.revision);
    emit('sync', { state: 'ready', revision });
    return { kind: 'same', revision };
  }
  if (baseline && baseline.hash === cloudHash) {
    const r = await upload(ctx, latest, cloud.revision);
    return r.ok ? { ...r, kind: 'uploaded-local' } : r;
  }
  const localHash = await fingerprint(localText);
  assertCurrent(ctx);
  // 哈希等待期间又有操作时，不采用旧快照覆盖。
  if (baseline && localHash === baseline.hash && comparablePayload(serializeState()) === localText) {
    const r = await adoptCloud(ctx, cloud); return r.kind === 'cloud' ? { ...r, kind: 'downloaded-cloud' } : r;
  }
  return conflict(cloud, false);
}
async function sync(ctx) {
  if (!profile || !syncReady || globalThis.__nuannuanDecorTransaction) return { ok: false, skipped: true };
  if (!account.has('cloud_sync')) return { ok: false, skipped: true, reason: 'premium-required', entitlements: entitlementState };
  try {
    flushSave(); const data = serializeState();
    if (revision > 0 && comparablePayload(data) === lastPayload) return { ok: true, unchanged: true };
    return await upload(ctx, data, revision);
  } catch (error) {
    if (current(ctx)) {
      if (error.status === 402) { setEntitlements(error.body?.entitlements || FREE_ENTITLEMENTS); syncReady = false; }
      emit('sync', { state: 'error', error });
    }
    return { ok: false, error };
  }
}
function authenticate(action, username, password) {
  const ticket = ++epoch; resetSync(); authStatus = 'restoring'; authError = null;
  const task = enqueue(async () => {
    if (ticket !== epoch) return { kind: 'cancelled' };
    try {
      const r = await request('/api/auth/' + action, { method: 'POST', body: JSON.stringify({ username, password }) });
      if (ticket !== epoch) return { kind: 'cancelled' };
      setEntitlements(FREE_ENTITLEMENTS, false); entitlementUserId = ''; authStatus = 'signed-in'; remember(r.user);
      try { return { ...await prepare(context()), interactive: true }; }
      catch (error) { return { kind: 'sync-error', error, interactive: true }; }
    } catch (error) { if (ticket === epoch) { authStatus = 'unknown'; authError = error; } throw error; }
  });
  authTask = task;
  task.finally(() => { if (authTask === task) authTask = null; }).catch(() => {});
  return task;
}

function emit(type, detail = {}) {
  globalThis.dispatchEvent?.(new CustomEvent(`nuannuan:${type}`, { detail }));
}

function exposeEntitlements() {
  // 桌面壳和其他宿主只读取这个快照来决定是否显示自动更新入口；它不是授权凭证。
  globalThis.__NIKKI_ACCOUNT_ENTITLEMENTS__ = {
    ...entitlementState,
    features: [...entitlementState.features],
    entitlements: entitlementState.entitlements.map((item) => ({ ...item })),
  };
}

function setEntitlements(value, notify = true) {
  const raw = value && typeof value === 'object' ? value : {};
  const features = [...new Set((Array.isArray(raw.features) ? raw.features : []).map((feature) => String(feature)).filter(Boolean))];
  const entries = Array.isArray(raw.entitlements) ? raw.entitlements.map((entry) => ({
    feature: String(entry?.feature || ''),
    validFrom: Number(entry?.validFrom) || 0,
    validUntil: Number.isFinite(entry?.validUntil) ? Number(entry.validUntil) : null,
    source: String(entry?.source || 'unknown'),
  })).filter((entry) => entry.feature) : [];
  entitlementState = {
    plan: String(raw.plan || (features.length ? 'test-premium' : 'free')),
    features,
    entitlements: entries,
    expiresAt: Number.isFinite(raw.expiresAt) ? Number(raw.expiresAt) : null,
    checkedAt: Number(raw.checkedAt) || Date.now(),
    cloudSync: features.includes('cloud_sync'),
    autoUpdate: features.includes('auto_update'),
    freeEntitlements: raw.freeEntitlements === true || raw.plan === 'free-public'
      || entries.some((entry) => entry.source === 'free_public'),
  };
  exposeEntitlements();
  if (notify) {
    emit('entitlements', { entitlements: entitlementState });
    emit('account', { profile, entitlements: entitlementState });
  }
  return entitlementState;
}

setEntitlements(FREE_ENTITLEMENTS, false);
function readProfile() {
  if (LOCAL_PLAY) return null;
  try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { profile = null; }
  return profile;
}
readProfile();

async function request(path, options = {}) {
  if (LOCAL_PLAY) throw new Error('本地自由试玩无需登录，进度保存在当前设备的独立试玩档中');
  if (DESKTOP_API_MISSING) {
    const error = new Error('此安装包未配置账号服务器，可继续游客游玩。自建服务配置方法见项目 README。');
    error.status = 503;
    error.code = 'API_BASE_MISSING';
    throw error;
  }
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiBase() + path, { ...options, headers, credentials: 'include', cache: 'no-store' });
  let body = null;
  try { body = await response.json(); } catch { /* 空响应 */ }
  if (!response.ok) {
    // 认证和权益接口不应该对客户端返回业务 404；这通常表示静态站点、旧服务
    // 或错误的反代地址。把它转换成可操作的提示，避免用户只看到“请求失败（404）”。
    const missingAccountApi = response.status === 404 && /^\/api\/(?:auth\/|account\/)/.test(path);
    const error = new Error(missingAccountApi
      ? '账号服务器未提供登录或权益接口，请使用 node server.js 启动，或检查 NIKKI_API_BASE / --api-base'
      : (body?.error || `请求失败（${response.status}）`));
    error.status = missingAccountApi ? 503 : response.status;
    error.code = missingAccountApi ? 'API_ENDPOINT_MISSING' : undefined;
    error.body = body;
    throw error;
  }
  return body;
}

function remember(user) {
  profile = user || null;
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch { /* Cookie 会话仍可用；缓存写入失败不等于退出。 */ }
  emit('account', { profile, entitlements: entitlementState });
}

// 单封和批量领取共用同一保存队列与版本校验；通知只读状态，不参与存档写入。
async function claimMail(ctx, path, keyName) {
  assertCurrent(ctx); assertSettled();
  await refreshEntitlements(ctx);
  if (!account.has('cloud_sync')) throw new Error('云同步当前未开放，礼包仍保留在邮件中');
  if (!syncReady) {
    const r = await prepare(ctx);
    if (r.kind === 'conflict') { conflict(r.cloud); throw new Error('请先处理云存档冲突，再领取邮件礼包'); }
  }
  const synced = await sync(ctx);
  if (!synced.ok) throw synced.error || new Error('领取前同步失败，请稍后重试');
  const before = comparablePayload(serializeState());
  if (before !== lastPayload) throw new Error('进度刚发生变化，请稍后再领取，礼包仍保留');
  let idempotencyKey = claimKeys.get(keyName);
  if (!idempotencyKey) { idempotencyKey = `mail_${crypto.randomUUID()}`; claimKeys.set(keyName, idempotencyKey); }
  let result;
  try {
    result = await sessionRequest(ctx, path, { method: 'POST', body: JSON.stringify({ idempotencyKey, baseRevision: revision }) });
  } catch (error) {
    if (current(ctx) && error.status === 409) {
      syncReady = false;
      const cloud = error.body?.conflict || await fetchCloud(ctx);
      conflict(cloud);
    }
    // 请求可能已在服务器落账，断网重试时沿用本批 key。
    if (current(ctx)) emit('mail', { changed: true });
    throw error;
  }
  emit('mail', { changed: true });
  const cloud = await fetchCloud(ctx);
  if (!cloud) throw new Error('礼包已记录，暂时无法读取云存档，请稍后同步');
  if (comparablePayload(serializeState()) !== before) {
    conflict(cloud); emit('mail', { claimed: result });
    throw new Error('礼包已存入云端；领取期间本机进度发生变化，请选择要保留的进度');
  }
  const adopted = await adoptCloud(ctx, cloud);
  if (adopted.kind === 'conflict') throw new Error('礼包已存入云端；本机进度已变化，请先处理存档选择');
  claimKeys.delete(keyName); emit('mail', { claimed: result });
  return result;
}

export const account = {
  get profile() { return profile; },
  get authStatus() { return authStatus; },
  get entitlements() { return entitlementState; },
  get revision() { return revision; },
  get ready() { return syncReady; },
  // 诊断摘要只有状态与计数；不暴露账号、云端载荷或同步祖先。
  get diagnosticsInfo() {
    return { status: LOCAL_PLAY ? 'local-only' : pending ? 'conflict' : syncReady ? 'ready' : authStatus,
      revision, pending: !!syncTask, conflict: !!pending };
  },
  get mailScope() { return `${apiBase() || globalThis.location?.origin || ''}|${profile?.id || ''}`; },
  has(feature) { return entitlementState.features.includes(String(feature)); },
  async accessPolicy() { return request('/api/billing/status'); },
  refreshEntitlements() { return refreshEntitlements(context()); },
  restore() {
    if (LOCAL_PLAY) { authStatus = 'signed-out'; return Promise.resolve(null); }
    if (authTask) return authTask.then(() => authStatus === 'signed-in' ? profile : null);
    if (restoreTask) return restoreTask;
    let ticket = epoch;
    authStatus = 'restoring'; authError = null;
    const task = (async () => {
      try {
        // HttpOnly Cookie 才是凭证；缺少 localStorage 缓存也要尝试恢复。
        const r = await request('/api/auth/me');
        if (ticket !== epoch) return null;
        if (profile?.id !== r.user?.id) {
          ticket = ++epoch; resetSync(); entitlementUserId = '';
          setEntitlements(FREE_ENTITLEMENTS, false);
        }
        authStatus = 'signed-in'; remember(r.user);
        try { await refreshEntitlements(context()); } catch (error) { if (ticket === epoch) authError = error; }
        return ticket === epoch && authStatus === 'signed-in' ? profile : null;
      } catch (error) {
        if (ticket !== epoch) return null;
        authError = error;
        if (error.status === 401) {
          epoch++; authStatus = 'signed-out'; resetSync(); entitlementUserId = '';
          remember(null); setEntitlements(FREE_ENTITLEMENTS);
        } else authStatus = 'offline';
        return null;
      }
    })();
    restoreTask = task;
    task.finally(() => { if (restoreTask === task) restoreTask = null; }).catch(() => {});
    return task;
  },
  async ensureSession() {
    if (authStatus === 'signed-in' && profile) return profile;
    if (authStatus === 'signed-out' && !authTask) return null;
    await this.restore();
    if (authStatus === 'signed-in') return profile;
    if (authStatus === 'signed-out') return null;
    throw authError || new Error('暂时无法确认登录状态，请检查网络后重试；本机进度仍保留');
  },
  register(username, password) { return authenticate('register', username, password); },
  login(username, password) { return authenticate('login', username, password); },
  logout() {
    const ticket = ++epoch; resetSync(); authStatus = 'restoring';
    const task = enqueue(async () => {
      try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* 本机仍退出；下次恢复会重新确认服务器。 */ }
      if (ticket !== epoch) return;
      authStatus = 'signed-out'; remember(null); setEntitlements(FREE_ENTITLEMENTS); entitlementUserId = '';
      emit('sync', { state: 'logged-out' });
    });
    authTask = task;
    task.finally(() => { if (authTask === task) authTask = null; }).catch(() => {});
    return task;
  },
  async mailSummary({ signal } = {}) {
    if (!await this.ensureSession()) return { unread: 0, unclaimed: 0, pending: 0, total: 0, latest: null };
    return sessionRequest(context(), '/api/mail/summary', { signal });
  },
  async mailList({ cursor, limit = 30, filter } = {}) {
    if (!await this.ensureSession()) return { unread: 0, unclaimed: 0, pending: 0, total: 0, latest: null, messages: [], nextCursor: null };
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    if (filter) params.set('filter', filter);
    const result = await sessionRequest(context(), `/api/mail?${params}`); emit('mail', result); return result;
  },
  async mailRead(messageId) {
    if (!await this.ensureSession()) throw new Error('请先登录');
    const result = await sessionRequest(context(), `/api/mail/${encodeURIComponent(messageId)}/read`, { method: 'POST', body: '{}' });
    emit('mail', { changed: true }); return result;
  },
  async mailClaim(messageId) {
    if (!await this.ensureSession()) throw new Error('请先登录');
    return queueSave(ctx => claimMail(ctx, `/api/mail/${encodeURIComponent(messageId)}/claim`, `${ctx.id}:${messageId}`));
  },
  mailClaimAll() {
    if (claimAllTask && claimAllContext && current(claimAllContext)) return claimAllTask;
    const owner = context();
    const task = (async () => {
      if (!await this.ensureSession()) throw new Error('请先登录');
      if (owner.id) assertCurrent(owner);
      return queueSave(async ctx => {
        const collected = new Set(); let result;
        try {
          do {
            result = await claimMail(ctx, '/api/mail/claim-all', `${ctx.id}:all`);
            for (const id of result.messageIds || []) collected.add(id);
            if (result.hasMore && !result.count) throw new Error('领取未继续，请刷新邮箱后重试');
          } while (result.hasMore);
          return { ...result, count: collected.size, messageIds: [...collected] };
        } catch (error) {
          error.claimedCount = collected.size;
          error.claimedMessageIds = [...collected];
          throw error;
        }
      });
    })();
    claimAllTask = task; claimAllContext = owner;
    task.finally(() => { if (claimAllTask === task) { claimAllTask = null; claimAllContext = null; } }).catch(() => {});
    return task;
  },
  prepareSync() { return queueSave(prepare); },
  resolveSync(choice) {
    const candidate = pending;
    return queueSave(async ctx => {
      if (choice === 'cancel') { syncReady = false; emit('sync', { state: 'cancelled' }); return { kind: 'cancelled' }; }
      if (!this.has('cloud_sync')) return { kind: 'premium-required', entitlements: entitlementState };
      if (!pending) return { kind: 'empty' };
      if (candidate !== pending) return { kind: 'conflict', ...pending };
      assertSettled();
      if (choice === 'cloud' && candidate.cloud) {
        const cloud = await fetchCloud(ctx);
        if (!samePayload(S.started ? serializeState() : null, candidate.local)) return conflict(cloud);
        if (!cloud || cloud.revision !== candidate.cloud.revision || !samePayload(cloud.data, candidate.cloud.data)) return conflict(cloud);
        return adoptCloud(ctx, cloud);
      }
      if (choice === 'local' && S.started) return upload(ctx, serializeState(), candidate.cloud?.revision || 0);
      return { kind: 'empty' };
    });
  },
  syncNow() {
    if (syncTask) return syncTask;
    const task = queueSave(sync); syncTask = task;
    task.finally(() => { if (syncTask === task) syncTask = null; }).catch(() => {});
    return task;
  },
};

export function accountSummary() {
  if (LOCAL_PLAY) return '本地自由试玩 · 自动保存到独立试玩档';
  if (!account.profile) return '未登录 · 仅本机存档';
  return account.has('cloud_sync') ? `已登录：${account.profile.username} · 云同步已启用` : `已登录：${account.profile.username} · 本机进度已保留`;
}
