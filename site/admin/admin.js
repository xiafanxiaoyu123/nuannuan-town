(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const API_BASE = String(globalThis.__NIKKI_ADMIN_API_BASE__ || '').trim().replace(/\/$/, '');
  const fmt = new Intl.NumberFormat('zh-CN');

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const date = (v) => v && Number.isFinite(new Date(v).getTime())
    ? new Date(v).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    : '—';

  const relTime = (v) => {
    if (!v || !Number.isFinite(new Date(v).getTime())) return '从未活动';
    const diff = Date.now() - Number(v);
    if (diff < 60000) return '刚刚活跃';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
  };

  const datetimeLocal = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const uid = () => {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const empty = (message) => `<div class="empty-inline">${esc(message)}</div>`;
  const loading = '<div class="loading" aria-label="正在加载"><i></i><i></i><i></i></div>';

  const labels = { owned: '服饰与拥有物', seeds: '种子', crops: '作物', decor: '家具', pantry: '牧场材料', dishes: '成品料理' };
  const quantityEntry = (type, text) => text.match(type === 'dishes' ? /^([a-z][a-z0-9_]{0,79}:(?:normal|tasty|fine):(?:plain|milky))\s*:\s*(\d+)$/ : /^([A-Za-z0-9_-]+)\s*:\s*(\d+)$/);
  const quantityLimit = type => ['pantry', 'dishes'].includes(type) ? 999999 : 1000000;
  const outfitLabels = { hair: '发型', dress: '连衣裙/上下装', shoes: '鞋履', head: '头饰', back: '背饰' };
  const actions = {
    'gift.issue': '发放礼包',
    'mail.publish': '发布邮件',
    'mail.revoke': '撤回邮件',
    'mail.claim': '领取邮件礼包',
    'service.free_access.update': '调整全体账号限免',
    'account.manage': '修改账号状态/备注',
    'account.sessions.revoke': '结束账号会话',
    'account.entitlements.update': '调整手动授权',
    'gift_template.create': '创建礼包模板',
    'gift_template.update': '更新礼包模板',
    'gift_template.archive': '归档礼包模板',
    'gift_template.restore': '恢复礼包模板',
  };

  const viewMeta = {
    accounts: ['账号档案', '居民档案检索、云档检视、权益与会话管控'],
    gifts: ['礼包工坊', '自定义资源礼包模板与有效目录配置'],
    mail: ['邮件中心', '全服公告、礼包邮件发布、投递回执与撤回管理'],
    service: ['服务设置', '全体账号限免开关与商业化收银台状态'],
    audit: ['操作记录', '全链路管理动作审计与安全回执导出'],
  };

  const state = {
    token: '',
    authenticated: false,
    epoch: 0,
    view: 'accounts',
    accounts: [],
    accountStats: null,
    accountQuery: { q: '', status: 'all', save: 'all', activity: 'all', sort: 'newest', page: 1, pageSize: 20 },
    accountPages: 1,
    selected: null,
    detail: null,
    service: null,
    billing: null,
    templates: [],
    templateKeyword: '',
    messages: [],
    mailStats: null,
    mailQuery: { q: '', kind: 'all', status: 'all', page: 1, pageSize: 20 },
    mailPages: 1,
    mailDetailId: null,
    deliveryQuery: { q: '', status: 'all', page: 1 },
    auditQuery: { q: '', action: '', targetUserId: '', from: '', to: '', page: 1, pageSize: 20 },
    auditPages: 1,
    catalog: null,
    pendingWrites: new Map(),
    requests: new Map(),
    busy: new Set(),
    drawerReturnFocus: null,
    dialogResolver: null,
  };

  const draftKey = 'nuannuan.admin.mail-draft.v1';
  const templateSnapshot = { mail: null, gift: null };

  const storage = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); return true; } catch { return false; } },
    remove(key) { try { sessionStorage.removeItem(key); } catch { /* ignore */ } },
  };
  storage.remove('nuannuan.admin.token');

  const launchTicket = (() => {
    const raw = location.hash.startsWith('#ticket=') ? location.hash.slice(8) : '';
    if (raw) history.replaceState(null, document.title, `${location.pathname}${location.search}`);
    try { return raw ? decodeURIComponent(raw) : ''; } catch { return ''; }
  })();

  function toast(message, error = false) {
    const el = document.createElement('div');
    el.className = `toast${error ? ' error' : ''}`;
    el.textContent = message;
    $('#toast-region').append(el);
    setTimeout(() => el.remove(), 5000);
  }

  function feedback(id, message = '', error = false) {
    const el = $(`#${id}`);
    if (el) {
      el.textContent = message;
      el.classList.toggle('error', error);
    }
  }

  function setConnection(ok, message) {
    $('#connection-status').textContent = message;
    $('#connection-dot').classList.toggle('offline', !ok);
  }

  function setSync() {
    $('#last-sync').textContent = `同步于 ${date(Date.now())}`;
  }

  function showGate(message = '') {
    $('#gate').hidden = false;
    $('#app').hidden = true;
    $('#gate-error').textContent = message;
  }

  function showApp() {
    state.authenticated = true;
    $('#gate').hidden = true;
    $('#app').hidden = false;
  }

  function endSession(message) {
    state.epoch++;
    state.authenticated = false;
    state.token = '';
    state.pendingWrites.clear();
    state.requests.forEach((r) => r.controller.abort());
    state.requests.clear();
    closeDrawer(false);
    if ($('#workbench-dialog').open) $('#workbench-dialog').close('cancel');
    state.accounts = [];
    state.accountStats = null;
    state.messages = [];
    state.mailStats = null;
    state.templates = [];
    state.service = null;
    state.billing = null;
    $('#account-list').innerHTML = '';
    $('#admin-mail-list').innerHTML = '';
    $('#audit-list').innerHTML = '';
    $('#template-list').innerHTML = '';
    $('#admin-token').value = '';
    $('#metrics').innerHTML = '';
    if ($('#mail-metrics')) $('#mail-metrics').innerHTML = '';
    $('#account-options').innerHTML = '';
    if ($('#mail-target-quick')) $('#mail-target-quick').innerHTML = '<option value="">— 选择居民自动填入 ID —</option>';
    $('#result-count').textContent = '尚未读取';
    $('#service-summary').textContent = '登录后读取服务状态';
    $('#last-sync').textContent = '尚未同步';
    setConnection(false, '已退出');
    showGate(message);
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const epoch = state.epoch;
    const signal = options.signal;
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), 25000);
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(state.token ? { 'X-Admin-Token': state.token } : {}),
          ...(options.headers || {}),
        },
        credentials: 'include',
        cache: 'no-store',
      });
    } catch (cause) {
      if (signal?.aborted || epoch !== state.epoch) throw Object.assign(new Error('已取消请求'), { cancelled: true });
      setConnection(false, '连接中断');
      throw Object.assign(
        new Error(controller.signal.aborted
          ? '请求超时，请重试。发放或发布操作会保留原请求编号安全重试。'
          : '无法连接管理服务，请检查网络后重试。'),
        { cause, uncertain: true },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    if (epoch !== state.epoch) throw Object.assign(new Error('已取消请求'), { cancelled: true });
    let body;
    try { body = await res.json(); } catch { body = null; }
    if (epoch !== state.epoch || signal?.aborted) throw Object.assign(new Error('已取消请求'), { cancelled: true });
    if (res.status === 401) {
      endSession(body?.error || '管理员登录已失效，请重新登录。');
      throw Object.assign(new Error(body?.error || '管理员登录已失效'), { status: 401, cancelled: true });
    }
    setConnection(res.status < 500, res.status >= 500 ? '服务暂不可用' : 'API 已连接');
    if (!res.ok) throw Object.assign(new Error(body?.error || `请求失败（${res.status}）`), { status: res.status, body, uncertain: res.status >= 500 });
    if (!body || typeof body !== 'object') throw Object.assign(new Error('服务返回了无法识别的数据，请刷新重试。'), { uncertain: true });
    return body;
  }

  const query = (values) => new URLSearchParams(
    Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ).toString();

  async function latest(name, path) {
    state.requests.get(name)?.controller.abort();
    const request = { controller: new AbortController(), epoch: state.epoch };
    state.requests.set(name, request);
    const data = await api(path, { signal: request.controller.signal });
    if (state.requests.get(name) !== request || request.epoch !== state.epoch) {
      throw Object.assign(new Error('已取消请求'), { cancelled: true });
    }
    return data;
  }

  function fail(error, id) {
    if (error.cancelled) return;
    feedback(id, error.message, true);
    toast(error.message, true);
  }

  async function withBusy(name, button, action) {
    if (state.busy.has(name)) return;
    state.busy.add(name);
    if (button) button.disabled = true;
    try {
      return await action();
    } finally {
      state.busy.delete(name);
      if (button?.isConnected) button.disabled = false;
    }
  }

  function canonicalOps(ops = []) {
    return ops.map((op) => op.type === 'coins'
      ? { type: op.type, mode: op.mode, amount: op.amount }
      : op.type === 'owned'
        ? { type: op.type, ids: [...op.ids].sort() }
        : { type: op.type, items: Object.fromEntries(Object.entries(op.items || {}).sort(([a], [b]) => a.localeCompare(b))) },
    ).sort((a, b) => a.type.localeCompare(b.type));
  }

  function writeSignature(name, payload) {
    return JSON.stringify(name.startsWith('gift:')
      ? { ops: canonicalOps(payload.ops) }
      : { ...payload, ops: canonicalOps(payload.ops) });
  }

  function storedMailPending() {
    try {
      const value = JSON.parse(storage.get(`${draftKey}.pending`) || 'null');
      return value && typeof value.signature === 'string' && /^[A-Za-z0-9_-]{12,120}$/.test(value.key) ? value : null;
    } catch { return null; }
  }

  function matchingMailPending(payload) {
    const signature = writeSignature('mail:publish', payload);
    return state.pendingWrites.get('mail:publish')?.signature === signature || storedMailPending()?.signature === signature;
  }

  function giftPendingStorageKey(name) {
    return `nuannuan.admin.pending.${name}`;
  }

  function storedGiftPending(name) {
    try {
      const value = JSON.parse(storage.get(giftPendingStorageKey(name)) || 'null');
      return value
        && typeof value.signature === 'string'
        && /^[A-Za-z0-9_-]{12,120}$/.test(value.body?.idempotencyKey)
        && Number.isSafeInteger(value.body?.baseRevision)
        && Array.isArray(value.body?.ops)
        && writeSignature(name, value.body) === value.signature
        ? value
        : null;
    } catch { return null; }
  }

  function requestBody(name, payload) {
    const signature = writeSignature(name, payload);
    let pending = state.pendingWrites.get(name);
    if (!pending || pending.signature !== signature) {
      const saved = name === 'mail:publish' ? storedMailPending() : storedGiftPending(name);
      const same = saved?.signature === signature;
      pending = {
        signature,
        body: name.startsWith('gift:') && same
          ? saved.body
          : { ...payload, idempotencyKey: same ? saved.key : `${name.startsWith('mail') ? 'mail' : 'gift'}_${uid()}` },
      };
      state.pendingWrites.set(name, pending);
    }
    if (name === 'mail:publish') storage.set(`${draftKey}.pending`, JSON.stringify({ signature, key: pending.body.idempotencyKey }));
    else storage.set(giftPendingStorageKey(name), JSON.stringify({ signature, body: pending.body }));
    return pending.body;
  }

  function clearPending(name) {
    state.pendingWrites.delete(name);
    storage.remove(name === 'mail:publish' ? `${draftKey}.pending` : giftPendingStorageKey(name));
  }

  function clearDefinitePending(name, error) {
    if (!error.uncertain && error.status && error.status < 500) clearPending(name);
  }

  function setFormBusy(form, yes) {
    $$('input,select,textarea,button', form).forEach((el) => {
      if (yes) {
        el.dataset.wasDisabled = el.disabled ? '1' : '0';
        el.disabled = true;
      } else if (el.dataset.wasDisabled !== undefined) {
        el.disabled = el.dataset.wasDisabled === '1';
        delete el.dataset.wasDisabled;
      }
    });
  }

  function debounce(fn, delay = 260) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function pager(prefix, data, q) {
    q.page = Math.max(1, Number(data.page) || 1);
    const pages = Math.max(1, Number(data.pages) || 1);
    q.page = Math.min(q.page, pages);
    const ids = prefix === 'account'
      ? ['prev-page', 'next-page', 'page-label']
      : [`${prefix}-prev-page`, `${prefix}-next-page`, `${prefix}-page-label`];
    $(`#${ids[0]}`).disabled = q.page <= 1;
    $(`#${ids[1]}`).disabled = q.page >= pages;
    $(`#${ids[2]}`).textContent = `第 ${q.page} / ${pages} 页 · 共 ${fmt.format(data.total || 0)} 条`;
    return pages;
  }

  function chips(items, fallback = '尚未单独授权') {
    return items?.length
      ? items.map((x) => `<span class="chip ${x.active === false ? '' : 'green'}">${esc(({ cloud_sync: '云同步', auto_update: '自动更新', portal_member: '历史会员' })[x.feature] || x.feature)}${x.source === 'free_public' ? ' · 免费' : x.source === 'admin' ? ' · 手动' : x.source === 'payment' ? ' · 付费' : x.source === 'test' ? ' · 测试' : ''}</span>`).join('')
      : `<span class="chip">${esc(fallback)}</span>`;
  }

  const accessChips = (a) => {
    const manual = (a.entitlements || []).filter((x) => x.active !== false);
    if (a.access?.freeEntitlements) {
      return `<span class="chip green">统一免费开放</span>${manual.length ? `<span class="chip violet">独立授权 ${manual.length}</span>` : ''}`;
    }
    return chips(a.access?.entitlements || manual);
  };

  function renderMetrics(stats = {}) {
    state.accountStats = stats;
    const total = Number(stats.accounts || 0);
    const withSaves = Number(stats.withSaves || 0);
    const active7d = Number(stats.activeLast7Days || 0);
    const disabled = Number(stats.disabledAccounts || 0);
    const grants = Number(stats.activeEntitlements || 0);
    const savePct = total ? `${Math.round((withSaves / total) * 100)}% 覆盖` : '0%';
    const actPct = total ? `${Math.round((active7d / total) * 100)}% 活跃` : '0%';
    const q = state.accountQuery;
    const isAll = q.status === 'all' && q.save === 'all' && q.activity === 'all';

    const items = [
      { name: '注册账号总数', n: total, badge: '全部档案', note: `正常 ${fmt.format(Math.max(0, total - disabled))} · 停用 ${fmt.format(disabled)}`, color: 'pink', filter: 'all', active: isAll },
      { name: '拥有云存档', n: withSaves, badge: savePct, note: '点击筛选已有云档居民', color: 'violet', filter: 'save:yes', active: q.save === 'yes' },
      { name: '近 7 天活跃', n: active7d, badge: actPct, note: '点击筛选近 7 天访问居民', color: 'green', filter: 'activity:7d', active: q.activity === '7d' },
      { name: '有效独立授权', n: grants, badge: state.service?.freeEntitlements !== false ? '全服限免中' : '按授权生效', note: '点击前往服务设置查看', color: 'gold', filter: 'view:service', active: false },
      { name: '已停用账号', n: disabled, badge: disabled ? '需关注' : '全部正常', note: '点击筛选已停用账号', color: 'danger', filter: 'status:disabled', active: q.status === 'disabled' },
    ];

    $('#metrics').innerHTML = items.map((item) => `
      <button type="button" class="metric${item.active ? ' active-filter' : ''}" data-metric-filter="${item.filter}" style="--accent:var(--${item.color})">
        <div class="metric-top">
          <span class="metric-label">${esc(item.name)}</span>
          <span class="metric-badge">${esc(item.badge)}</span>
        </div>
        <strong>${fmt.format(item.n)}</strong>
        <small>${esc(item.note)}</small>
      </button>
    `).join('');

    $$('[data-metric-filter]', $('#metrics')).forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.metricFilter;
        if (mode === 'view:service') {
          switchView('service');
          return;
        }
        $('#account-status').value = mode === 'status:disabled' ? 'disabled' : 'all';
        $('#account-save').value = mode === 'save:yes' ? 'yes' : 'all';
        $('#account-activity').value = mode === 'activity:7d' ? '7d' : 'all';
        readAccountFilters();
        void loadAccounts();
      });
    });
  }

  function renderServiceSummary(service) {
    if (!service) return;
    $('#service-summary').textContent = service.freeEntitlements
      ? '统一免费开放中 · 全体登录居民均可使用云存档同步与自动更新'
      : '限免已关闭 · 仅独立授权账号可使用云存档同步与自动更新';
    $('#service-banner').classList.toggle('paused', !service.freeEntitlements);
  }

  async function loadAccounts() {
    if (!state.authenticated) return;
    $('#account-list').innerHTML = loading;
    feedback('account-feedback', '正在读取账号档案…');
    $('#prev-page').disabled = $('#next-page').disabled = true;
    try {
      const data = await latest('accounts', `/api/admin/accounts?${query(state.accountQuery)}`);
      state.accounts = data.accounts || [];
      if (data.service) state.service = data.service;
      renderMetrics(data.stats);
      renderServiceSummary(data.service);
      state.accountPages = pager('account', data, state.accountQuery);
      $('#result-count').textContent = `${fmt.format(data.total || 0)} 个账号`;

      $('#account-options').innerHTML = state.accounts
        .map((a) => `<option value="${esc(a.id)}">${esc(a.username)}${a.disabled ? ' (已停用)' : ''}</option>`)
        .join('');

      const quickSelect = $('#mail-target-quick');
      if (quickSelect) {
        const currentVal = quickSelect.value;
        quickSelect.innerHTML = `<option value="">— 选择居民自动填入 ID —</option>${state.accounts
          .filter((a) => !a.disabled)
          .map((a) => `<option value="${esc(a.id)}">${esc(a.username)} (${esc(a.id.slice(0, 8))}…)</option>`)
          .join('')}`;
        if (currentVal) quickSelect.value = currentVal;
      }

      $('#account-list').innerHTML = state.accounts.length
        ? state.accounts.map((a) => {
          const initials = (a.username || 'N').replace(/^preview_resident_/i, 'R').slice(0, 2).toUpperCase();
          return `
            <div class="account-row">
              <div class="account-primary-cell">
                <div class="resident-avatar${a.disabled ? ' disabled' : ''}" aria-hidden="true">${esc(initials)}</div>
                <button class="account-link" type="button" data-account="${esc(a.id)}">
                  <b>
                    <span>${esc(a.username)}</span>
                    <span class="chip ${a.disabled ? 'gold' : 'green'}">${a.disabled ? '已停用' : '正常'}</span>
                    <span class="chip">管理 v${a.adminRevision ?? 0}</span>
                  </b>
                  <small class="mono">${esc(a.id)}</small>
                  ${a.note ? `<span class="account-note-tag" title="${esc(a.note)}">✎ 备注：${esc(a.note)}</span>` : ''}
                </button>
              </div>
              <div class="save-cell">
                ${a.save
                  ? `<b>🪙 ${fmt.format(a.save.coins)} 噗灵 · 房屋 Lv.${a.save.house}</b>
                     <small>云档 rev ${a.save.revision} · 第 ${a.save.gday || 0} 天 · 服饰 ${fmt.format(a.save.ownedCount || 0)} 件</small>
                     <small>同步于 ${date(a.save.serverUpdatedAt)}</small>`
                  : '<span class="chip">暂无云档</span><small>尚未上传首次游戏进度</small>'}
              </div>
              <div class="account-access">${accessChips(a)}</div>
              <div class="save-cell">
                <b>${esc(relTime(a.lastSeen))}</b>
                <small>访问 ${date(a.lastSeen)}</small>
                <small>注册 ${date(a.createdAt)}</small>
              </div>
              <div class="row-actions">
                <button class="row-arrow copy-id-btn" type="button" data-copy-id="${esc(a.id)}" title="复制居民 ID" aria-label="复制 ${esc(a.username)} 的 ID">复制 ID</button>
                <button class="row-arrow" type="button" data-account="${esc(a.id)}" aria-label="查看 ${esc(a.username)} 详情">管理详情 ›</button>
              </div>
            </div>
          `;
        }).join('')
        : empty('没有找到匹配的居民账号，请调整搜索词或筛选条件。');

      $$('[data-account]', $('#account-list')).forEach((el) => {
        el.addEventListener('click', () => openDetail(el.dataset.account));
      });
      $$('[data-copy-id]', $('#account-list')).forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = el.dataset.copyId;
          navigator.clipboard?.writeText(id).then(() => {
            el.textContent = '已复制 ✓';
            setTimeout(() => { el.textContent = '复制 ID'; }, 1400);
          }).catch(() => {});
        });
      });
      feedback('account-feedback');
      setSync();
    } catch (e) {
      if (!e.cancelled) {
        $('#account-list').innerHTML = empty('账号读取失败，可点击右上角刷新重试。');
        fail(e, 'account-feedback');
      }
    }
  }

  function readAccountFilters() {
    state.accountQuery = {
      q: $('#account-search').value.trim(),
      status: $('#account-status').value,
      save: $('#account-save').value,
      activity: $('#account-activity').value,
      sort: $('#account-sort').value,
      page: 1,
      pageSize: Number($('#account-page-size').value),
    };
  }

  function resourceName(type, id) {
    return state.catalog?.[type]?.find((item) => item.id === id)?.name || id;
  }

  function opsSummary(ops = [], detailed = false) {
    return ops.length
      ? ops.map((op) => {
        if (op.type === 'coins') return `${fmt.format(op.amount)} 噗灵`;
        if (op.type === 'owned') {
          return detailed
            ? op.ids.map((id) => resourceName('owned', id)).join('、')
            : `${op.ids.length} 件拥有物`;
        }
        return detailed
          ? Object.entries(op.items || {}).map(([id, amount]) => `${resourceName(op.type, id)} × ${fmt.format(amount)}`).join('、')
          : `${Object.keys(op.items || {}).length} 项${labels[op.type] || op.type}`;
      }).join('；')
      : '无附件';
  }

  function fieldError(el, message) {
    el.setCustomValidity(message);
    el.setAttribute('aria-invalid', 'true');
    el.classList.add('invalid');
    let hint = el.parentElement.querySelector('.field-error');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'field-error';
      hint.setAttribute('role', 'alert');
      el.parentElement.append(hint);
    }
    hint.textContent = message;
    el.focus();
    el.reportValidity();
    throw new Error(message);
  }

  function clearFieldErrors(root) {
    if (!root) return;
    $$('input,textarea,select', root).forEach((el) => {
      el.setCustomValidity('');
      el.removeAttribute('aria-invalid');
      el.classList.remove('invalid');
    });
    $$('.field-error', root).forEach((el) => el.remove());
  }

  function readOps(prefix) {
    const root = $(`#${prefix}-coins`)?.closest('form') || $('#drawer-body');
    clearFieldErrors(root);
    const ops = [];
    const coinsEl = $(`#${prefix}-coins`);
    const coinsText = coinsEl.value.trim();
    if (coinsText) {
      const amount = Number(coinsText);
      if (!/^\d+$/.test(coinsText) || !Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) {
        fieldError(coinsEl, '噗灵必须是 0 到 10 亿的整数');
      }
      if (amount > 0) ops.push({ type: 'coins', mode: 'add', amount });
    }
    for (const type of ['owned', 'seeds', 'crops', 'decor', 'pantry', 'dishes']) {
      const el = $(`#${prefix}-${type}`);
      const text = el.value.trim();
      if (!text) continue;
      if (!state.catalog) fieldError(el, '资源目录尚未读取成功，请先刷新资源目录再提交');
      const entries = text.split(/[,，\n]+/).map((x) => x.trim());
      if (entries.some((x) => !x)) fieldError(el, `${labels[type]}中存在空条目，请删除多余分隔符`);
      const allowed = new Set((state.catalog[type] || []).map((item) => item.id));
      if (type === 'owned') {
        if (entries.length > 100) fieldError(el, '拥有物一次最多 100 件');
        const ids = [];
        for (const id of entries) {
          if (!allowed.has(id)) fieldError(el, `目录中不存在拥有物 ID：${id}`);
          if (ids.includes(id)) fieldError(el, `拥有物 ID 重复：${id}`);
          ids.push(id);
        }
        ops.push({ type, ids });
      } else {
        const items = Object.create(null);
        if (entries.length > 100) fieldError(el, `${labels[type]}一次最多 100 项`);
        for (const entry of entries) {
          const match = quantityEntry(type, entry);
          if (!match) fieldError(el, `“${entry}”格式错误，请使用 ID:正整数`);
          const [, id, raw] = match;
          const amount = Number(raw);
          if (!allowed.has(id)) fieldError(el, `目录中不存在${labels[type]} ID：${id}`);
          if (!Number.isSafeInteger(amount) || amount < 1 || amount > quantityLimit(type)) fieldError(el, `${id} 数量必须是 1 到 ${quantityLimit(type)} 的整数`);
          if (Object.hasOwn(items, id)) fieldError(el, `${id} 重复，请合并为一项`);
          items[id] = amount;
        }
        ops.push({ type, items });
      }
    }
    return ops;
  }

  function renderVisualOps(prefix) {
    const container = $(`#${prefix}-visual-ops`);
    if (!container) return;
    const coinsEl = $(`#${prefix}-coins`);
    if (!coinsEl) return;
    const pills = [];
    const coinsVal = Number(coinsEl.value.trim());
    if (Number.isSafeInteger(coinsVal) && coinsVal > 0) {
      pills.push(`
        <span class="visual-op-pill">
          <b>🪙 ${fmt.format(coinsVal)} 噗灵</b>
          <button type="button" class="visual-op-remove" data-remove-op="coins" aria-label="移除噗灵">×</button>
        </span>
      `);
    }
    const ownedEl = $(`#${prefix}-owned`);
    if (ownedEl && ownedEl.value.trim()) {
      const ids = ownedEl.value.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean);
      for (const id of ids) {
        pills.push(`
          <span class="visual-op-pill">
            <b>👗 ${esc(resourceName('owned', id))}</b>
            <small class="mono">${esc(id)}</small>
            <button type="button" class="visual-op-remove" data-remove-op="owned" data-remove-id="${esc(id)}" aria-label="移除 ${esc(id)}">×</button>
          </span>
        `);
      }
    }
    const icons = { seeds: '🌱', crops: '🧺', decor: '🪑', pantry: '🥚', dishes: '🍽️' };
    for (const type of ['seeds', 'crops', 'decor', 'pantry', 'dishes']) {
      const el = $(`#${prefix}-${type}`);
      if (!el || !el.value.trim()) continue;
      const entries = el.value.split(/[,，\n]+/).map((s) => s.trim()).filter(Boolean);
      for (const entry of entries) {
        const match = quantityEntry(type, entry);
        if (match) {
          const [, id, qty] = match;
          pills.push(`
            <span class="visual-op-pill">
              <b>${icons[type]} ${esc(resourceName(type, id))} × ${fmt.format(Number(qty))}</b>
              <small class="mono">${esc(id)}</small>
              <button type="button" class="visual-op-remove" data-remove-op="${type}" data-remove-id="${esc(id)}" aria-label="移除 ${esc(id)}">×</button>
            </span>
          `);
        }
      }
    }
    container.innerHTML = pills.join('');
    $$('[data-remove-op]', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        const opType = btn.dataset.removeOp;
        const targetId = btn.dataset.removeId;
        if (opType === 'coins') {
          coinsEl.value = '';
          coinsEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (opType === 'owned') {
          const rest = ownedEl.value.split(/[,，\n]+/).map((s) => s.trim()).filter((x) => x && x !== targetId);
          ownedEl.value = rest.join(', ');
          ownedEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const el = $(`#${prefix}-${opType}`);
          const rest = el.value.split(/[,，\n]+/).map((s) => s.trim()).filter((x) => {
            const m = quantityEntry(opType, x);
            return m ? m[1] !== targetId : Boolean(x);
          });
          el.value = rest.join(', ');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        renderVisualOps(prefix);
      });
    });
  }

  function bindVisualOpsListeners(prefix) {
    for (const type of ['coins', 'owned', 'seeds', 'crops', 'decor', 'pantry', 'dishes']) {
      const el = $(`#${prefix}-${type}`);
      if (el && !el.dataset.visualBound) {
        el.dataset.visualBound = '1';
        el.addEventListener('input', () => renderVisualOps(prefix));
        el.addEventListener('change', () => renderVisualOps(prefix));
      }
    }
    renderVisualOps(prefix);
  }

  function setOpsFields(prefix, ops = []) {
    const byType = Object.fromEntries(ops.map((op) => [op.type, op]));
    $(`#${prefix}-coins`).value = byType.coins?.amount || '';
    $(`#${prefix}-owned`).value = byType.owned?.ids?.join(', ') || '';
    for (const type of ['seeds', 'crops', 'decor', 'pantry', 'dishes']) {
      $(`#${prefix}-${type}`).value = Object.entries(byType[type]?.items || {}).map(([id, n]) => `${id}:${n}`).join(', ');
    }
    for (const type of ['coins', 'owned', 'seeds', 'crops', 'decor', 'pantry', 'dishes']) {
      const el = $(`#${prefix}-${type}`);
      if (!el) continue;
      el.setCustomValidity('');
      el.removeAttribute('aria-invalid');
      el.classList.remove('invalid');
      el.parentElement.querySelector('.field-error')?.remove();
    }
    renderVisualOps(prefix);
  }

  function fieldsHtml(prefix) {
    return `
      <div class="form-grid compact-grid">
        <label><span>噗灵（增加整数）</span><input id="${prefix}-coins" type="number" min="0" max="1000000000" step="1" placeholder="0"></label>
        <label><span>拥有物 ID（逗号分隔）</span><input id="${prefix}-owned" list="gift-owned-options" placeholder="例如 h_reunion"></label>
        <label><span>种子（ID:数量）</span><input id="${prefix}-seeds" placeholder="radish:10"></label>
        <label><span>作物（ID:数量）</span><input id="${prefix}-crops" placeholder="radish:10"></label>
        <label class="span-2"><span>家具（ID:数量）</span><input id="${prefix}-decor" list="gift-decor-options" placeholder="fence:1"></label>
        <label><span>牧场材料（ID:数量）</span><input id="${prefix}-pantry" list="gift-pantry-options" placeholder="egg:3, milk:2"></label>
        <label><span>成品料理（菜品:品质:变体:数量）</span><input id="${prefix}-dishes" list="gift-dishes-options" placeholder="egg_custard:normal:plain:1"></label>
      </div>
      <div id="${prefix}-visual-ops" class="visual-ops-preview" aria-live="polite"></div>
    `;
  }

  function pickerHtml(prefix) {
    return `
      <details class="resource-picker">
        <summary>🔎 从官方资源目录搜索并点选添加</summary>
        <div class="filter-bar">
          <label>
            <span>资源分类</span>
            <select id="${prefix}-catalog-type">
              ${Object.entries(labels).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}
            </select>
          </label>
          <label class="grow">
            <span>搜索中文名称或 ID</span>
            <input id="${prefix}-catalog-search" type="search" placeholder="例如：双辫 / radish / 樱桃萝卜 / 栅栏">
          </label>
          <label>
            <span>每次添加数量</span>
            <input id="${prefix}-catalog-amount" type="number" min="1" max="1000000" step="1" value="1">
          </label>
        </div>
        <div id="${prefix}-catalog-results" class="catalog-results"></div>
        <p class="form-note">点击资源卡片即可加入上方附件。服饰每件仅添加一次；种子、作物、家具、牧场材料和料理重复点击会自动累加数量。料理含品质与变体，最后一段为数量。</p>
        <button type="button" class="text-button" data-catalog-reload>↻ 重新读取资源目录</button>
      </details>
    `;
  }

  function initPicker(prefix) {
    const type = $(`#${prefix}-catalog-type`);
    const search = $(`#${prefix}-catalog-search`);
    if (!type) return;
    bindVisualOpsListeners(prefix);
    const render = () => {
      const kind = type.value;
      const keyword = search.value.trim().toLowerCase();
      const items = (state.catalog?.[kind] || []).filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(keyword));
      $(`#${prefix}-catalog-amount`).disabled = kind === 'owned';
      const list = $(`#${prefix}-catalog-results`);
      list.innerHTML = !state.catalog
        ? empty('目录尚未加载，请点击下方重新读取。')
        : items.length
          ? `${items.slice(0, 60).map((item) => `
              <button type="button" class="catalog-item" data-resource-id="${esc(item.id)}">
                <b>${esc(item.name || item.id)}</b>
                <small>${esc(item.id)}</small>
                <span>＋</span>
              </button>
            `).join('')}${items.length > 60 ? '<p class="form-note">仅显示前 60 项匹配资源，请输入更精确的关键词。</p>' : ''}`
          : empty('没有匹配的目录资源');
      $$('[data-resource-id]', list).forEach((button) => {
        button.addEventListener('click', () => addResource(prefix, kind, button.dataset.resourceId));
      });
    };
    type.addEventListener('change', render);
    search.addEventListener('input', render);
    type.closest('.resource-picker').querySelector('[data-catalog-reload]').addEventListener('click', loadCatalog);
    render();
  }

  function addResource(prefix, type, id) {
    try {
      const ops = readOps(prefix);
      if (type === 'owned') {
        let op = ops.find((x) => x.type === type);
        if (!op) ops.push(op = { type, ids: [] });
        if (!op.ids.includes(id)) op.ids.push(id);
        if (op.ids.length > 100) throw new Error('拥有物一次最多 100 件');
      } else {
        const input = $(`#${prefix}-catalog-amount`);
        const amount = Number(input.value);
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > quantityLimit(type)) fieldError(input, `添加数量必须是 1 到 ${quantityLimit(type)} 的整数`);
        let op = ops.find((x) => x.type === type);
        if (!op) ops.push(op = { type, items: {} });
        const total = Number(op.items[id] || 0) + amount;
        if (total > quantityLimit(type)) throw new Error(`合并后的数量不能超过 ${quantityLimit(type)}`);
        op.items[id] = total;
      }
      setOpsFields(prefix, ops);
      $(`#${prefix}-${type}`).dispatchEvent(new Event('input', { bubbles: true }));
      toast(`已添加 ${resourceName(type, id)}`);
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function loadCatalog() {
    if (!state.authenticated) return;
    try {
      state.catalog = await latest('catalog', '/api/admin/gift-catalog');
      for (const prefix of ['template', 'mail', 'gift']) {
        $(`#${prefix}-catalog-search`)?.dispatchEvent(new Event('input'));
        renderVisualOps(prefix);
      }
      for (const [type, selector] of [['owned', '#gift-owned-options'], ['decor', '#gift-decor-options'], ['pantry', '#gift-pantry-options'], ['dishes', '#gift-dishes-options']]) {
        $(selector).innerHTML = (state.catalog[type] || [])
          .map((item) => `<option value="${esc(item.id)}">${esc(item.name || item.id)}</option>`)
          .join('');
      }
      if (state.templates.length) renderTemplates();
      if (state.detail && state.selected) renderDetail(state.detail);
    } catch (e) {
      fail(e, 'template-feedback');
    }
  }

  function showDialog(title, html, confirmLabel = '确认', cancellable = true) {
    if ($('#workbench-dialog').open) return Promise.resolve(false);
    if (state.dialogResolver) {
      const prev = state.dialogResolver;
      state.dialogResolver = null;
      prev(false);
    }
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = html;
    $('#dialog-confirm').textContent = confirmLabel;
    $('#dialog-confirm').hidden = !confirmLabel;
    $('#dialog-cancel').textContent = cancellable ? '取消' : '关闭';
    feedback('dialog-feedback');
    $('#workbench-dialog').returnValue = '';
    $('#workbench-dialog').showModal();
    return new Promise((resolve) => {
      state.dialogResolver = resolve;
    });
  }

  $('#workbench-dialog').addEventListener('close', () => {
    if ($('#workbench-dialog').open) return;
    state.requests.get('mail-detail')?.controller.abort();
    state.requests.delete('mail-detail');
    state.mailDetailId = null;
    const resolve = state.dialogResolver;
    state.dialogResolver = null;
    resolve?.($('#workbench-dialog').returnValue === 'confirm');
  });

  async function confirmOperation(title, content, reasonRequired = false) {
    const yes = await showDialog(
      title,
      `${content}${reasonRequired ? '<label class="dialog-reason"><span>操作原因 *（必填，将写入安全审计记录）</span><textarea id="operation-reason" maxlength="300" rows="3" required placeholder="请填写本次操作的具体原因…"></textarea></label>' : ''}`,
      '确认执行',
    );
    if (!yes || !state.authenticated) return null;
    return reasonRequired ? $('#operation-reason').value.trim() : true;
  }

  function closeDrawer(restoreFocus = true) {
    const drawer = $('#detail-drawer');
    state.requests.get('detail')?.controller.abort();
    state.requests.delete('detail');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    $('#drawer-backdrop').hidden = true;
    $('#app').inert = false;
    state.selected = null;
    state.detail = null;
    $('#drawer-body').innerHTML = '';
    if (restoreFocus && state.drawerReturnFocus?.isConnected) state.drawerReturnFocus.focus();
    state.drawerReturnFocus = null;
  }

  async function openDetail(id) {
    if (!state.authenticated) return;
    const alreadyOpen = $('#detail-drawer').classList.contains('open');
    if (!alreadyOpen) state.drawerReturnFocus = document.activeElement;
    state.selected = id;
    state.detail = null;
    $('#detail-drawer').classList.add('open');
    $('#detail-drawer').setAttribute('aria-hidden', 'false');
    $('#detail-drawer').inert = false;
    $('#drawer-backdrop').hidden = false;
    $('#app').inert = true;
    $('#drawer-name').textContent = '正在读取账号…';
    $('#drawer-id').textContent = id;
    $('#drawer-body').innerHTML = loading;
    if (!alreadyOpen) $('#close-drawer').focus();
    try {
      const data = await latest('detail', `/api/admin/accounts/${encodeURIComponent(id)}`);
      if (state.selected === id) renderDetail(data);
    } catch (e) {
      if (!e.cancelled && state.selected === id) {
        $('#drawer-body').innerHTML = `${empty(e.message)}<button type="button" id="detail-retry" class="primary">重新读取详情</button>`;
        $('#detail-retry').addEventListener('click', () => openDetail(id));
      }
    }
  }

  function detailCard(label, value) {
    return `<div class="detail-card"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  }

  function renderInventorySection(s) {
    if (!s || !s.data) return '';
    const d = s.data;
    const outfitEntries = Object.entries(d.outfit || {}).filter(([, val]) => val);
    const ownedList = Array.isArray(d.owned) ? d.owned : [];
    const seedsEntries = Object.entries(d.seeds || {}).filter(([, n]) => Number(n) > 0);
    const cropsEntries = Object.entries(d.crops || {}).filter(([, n]) => Number(n) > 0);
    const decorEntries = Object.entries(d.decor || {}).filter(([, n]) => Number(n) > 0);
    const pantryEntries = Object.entries(d.homestead?.pantry || {}).filter(([, n]) => Number(n) > 0);
    const dishEntries = Object.entries(d.homestead?.dishes || {}).filter(([, n]) => Number(n) > 0);

    return `
      <div class="inventory-grid">
        <div class="inventory-box">
          <strong>当前穿戴搭配 (${outfitEntries.length})</strong>
          <div class="inventory-pills">
            ${outfitEntries.length
              ? outfitEntries.map(([slot, itemId]) => `<span class="inv-pill">${esc(outfitLabels[slot] || slot)}：${esc(resourceName('owned', itemId))}</span>`).join('')
              : '<span class="inv-pill">未穿戴</span>'}
          </div>
        </div>
        <div class="inventory-box">
          <strong>已拥有服饰 (${ownedList.length} 件)</strong>
          <div class="inventory-pills">
            ${ownedList.length
              ? ownedList.map((itemId) => `<span class="inv-pill" title="${esc(itemId)}">${esc(resourceName('owned', itemId))}</span>`).join('')
              : '<span class="inv-pill">暂无服饰</span>'}
          </div>
        </div>
        <div class="inventory-box">
          <strong>种子库存 (${seedsEntries.length} 类)</strong>
          <div class="inventory-pills">
            ${seedsEntries.length
              ? seedsEntries.map(([itemId, qty]) => `<span class="inv-pill">🌱 ${esc(resourceName('seeds', itemId))} × ${fmt.format(Number(qty))}</span>`).join('')
              : '<span class="inv-pill">暂无种子</span>'}
          </div>
        </div>
        <div class="inventory-box">
          <strong>作物、家具与厨房 (${cropsEntries.length + decorEntries.length + pantryEntries.length + dishEntries.length} 类)</strong>
          <div class="inventory-pills">
            ${[
              ...cropsEntries.map(([itemId, qty]) => `<span class="inv-pill">🧺 ${esc(resourceName('crops', itemId))} × ${fmt.format(Number(qty))}</span>`),
              ...decorEntries.map(([itemId, qty]) => `<span class="inv-pill">🪑 ${esc(resourceName('decor', itemId))} × ${fmt.format(Number(qty))}</span>`),
              ...pantryEntries.map(([itemId, qty]) => `<span class="inv-pill">🥚 ${esc(resourceName('pantry', itemId))} × ${fmt.format(Number(qty))}</span>`),
              ...dishEntries.map(([itemId, qty]) => `<span class="inv-pill">🍽️ ${esc(resourceName('dishes', itemId))} × ${fmt.format(Number(qty))}</span>`),
            ].join('') || '<span class="inv-pill">暂无库存</span>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderDetail(payload) {
    const a = payload.account;
    const s = payload.save;
    state.detail = payload;
    templateSnapshot.gift = null;
    $('#drawer-name').textContent = a.username;
    $('#drawer-id').textContent = a.id;

    const adminGrants = (a.entitlements || []).filter((x) => x.source === 'admin' && x.active !== false);
    const until = adminGrants.find((x) => x.validUntil)?.validUntil || null;
    const pendingGift = storedGiftPending(`gift:${a.id}`);

    $('#drawer-body').innerHTML = `
      <nav class="drawer-subnav" aria-label="详情章节快捷跳转">
        <button type="button" class="chip-button" data-drawer-jump="#sec-overview">1. 概览与管控</button>
        <button type="button" class="chip-button" data-drawer-jump="#sec-entitlements">2. 权益与会话</button>
        <button type="button" class="chip-button" data-drawer-jump="#sec-save">3. 云档与背包</button>
        <button type="button" class="chip-button" data-drawer-jump="#sec-gift">4. 发放礼包</button>
        <button type="button" class="chip-button" data-drawer-jump="#sec-history">5. 历史与回执</button>
      </nav>

      <div class="detail-toolbar">
        <span class="chip ${a.disabled ? 'gold' : 'green'}">${a.disabled ? '账号已停用' : '账号正常启用'}</span>
        <span class="chip">管理版本 v${a.adminRevision ?? 0}</span>
        <button type="button" id="copy-account-id" class="secondary-button">复制账号 ID</button>
        <button type="button" id="detail-refresh" class="secondary-button">↻ 刷新详情</button>
        <button type="button" id="account-target-mail" class="secondary-button">✉ 发送定向邮件</button>
        <button type="button" id="account-view-audit" class="ghost-button">◷ 查该账号审计</button>
      </div>
      <p class="form-note">注册于 ${date(a.createdAt)} · 最近活跃 ${date(a.lastSeen)}（${esc(relTime(a.lastSeen))}）</p>
      <div id="detail-feedback" class="inline-feedback" role="status"></div>

      <div class="detail-grid">
        ${detailCard('噗灵余额', s ? fmt.format(s.coins) : '—')}
        ${detailCard('云档版本', s ? `revision ${s.revision}` : '暂无')}
        ${detailCard('已拥有服饰', s ? `${fmt.format(s.ownedCount)} 件` : '—')}
        ${detailCard('家园等级', s ? `房屋 ${s.house} · 庭院 ${s.yardLv}` : '—')}
        ${detailCard('作物 / 种子', s ? `${fmt.format(s.cropsTotal)} / ${fmt.format(s.seedsTotal || 0)}` : '—')}
        ${detailCard('家具库存', s ? fmt.format(s.decorTotal) : '—')}
        ${detailCard('牧场材料 / 料理库存', s ? `${fmt.format(s.pantryTotal || 0)} / ${fmt.format(s.dishesTotal || 0)}` : '—')}
        ${detailCard('动物 / 已摆料理', s ? `${fmt.format(s.ranchAnimals || 0)} / ${fmt.format(s.placedDishes || 0)}` : '—')}
      </div>

      <section id="sec-overview" class="detail-section">
        <h3><span>账号管理与状态控制</span><small class="mono">CAS baseRevision = ${a.adminRevision ?? 0}</small></h3>
        <form id="account-note-form" class="studio-form">
          <label>
            <span>运营内部备注（仅管理台可见，支持搜索与导出）</span>
            <textarea id="account-note" maxlength="1000" rows="2" placeholder="记录玩家反馈、客诉单号或跟进事项…">${esc(a.note || '')}</textarea>
          </label>
          <div class="detail-toolbar">
            <button id="account-note-save" class="primary" type="submit">保存备注</button>
            <button id="account-toggle-status" type="button" class="secondary-button ${a.disabled ? '' : 'danger'}">${a.disabled ? '恢复账号正常登录' : '停用该账号'}</button>
            <button id="account-revoke-sessions" type="button" class="secondary-button danger">结束全部登录会话 (${fmt.format(payload.sessions || 0)})</button>
          </div>
        </form>
        <p class="form-note">停用后账号立即下线且无法登录；恢复后需重新登录。停用/恢复账号与强制结束会话均需填写审计原因，且不会丢失最近活跃时间与云存档。</p>
      </section>

      <section id="sec-entitlements" class="detail-section">
        <h3><span>当前可用服务与登录会话</span></h3>
        <div class="entitlement-list">${accessChips(a)}</div>
        <p>最近访问 ${date(a.lastSeen)} · 当前有效登录会话 <b>${fmt.format(payload.sessions || 0)}</b> 个</p>
        <details class="session-details" ${(payload.sessionList?.length || 0) > 0 ? 'open' : ''}>
          <summary>查看活跃登录会话列表 (${fmt.format(payload.sessions || 0)})</summary>
          <div class="session-list">
            ${payload.sessionList?.length
              ? payload.sessionList.map((x) => `
                  <article>
                    <div>
                      <small class="mono">会话 ${esc(x.id)}</small>
                      <p>创建：${date(x.createdAt)} · 最近访问：${date(x.lastSeen)} · 到期：${date(x.expiresAt)}</p>
                    </div>
                    <button type="button" class="ghost-button danger" data-revoke-session="${esc(x.id)}">下线此会话</button>
                  </article>
                `).join('')
              : empty('当前没有有效登录会话')}
          </div>
        </details>

        <form id="account-entitlement-form" class="studio-form">
          <h3><span>手动权益授权（仅管理 source=admin）</span></h3>
          <div class="detail-toolbar">
            <label class="check-label"><input id="grant-cloud" type="checkbox" ${adminGrants.some((x) => x.feature === 'cloud_sync') ? 'checked' : ''}> <span>云存档同步 (cloud_sync)</span></label>
            <label class="check-label"><input id="grant-update" type="checkbox" ${adminGrants.some((x) => x.feature === 'auto_update') ? 'checked' : ''}> <span>自动更新 (auto_update)</span></label>
          </div>
          <label>
            <span>授权到期时间（留空表示永久有效，最长未来 1 年内）</span>
            <input id="grant-until" type="datetime-local" value="${esc(datetimeLocal(until))}">
          </label>
          <div class="preset-bar">
            <span class="preset-label">快捷授权期限：</span>
            <button type="button" class="chip-button" data-grant-days="7">+7 天</button>
            <button type="button" class="chip-button" data-grant-days="30">+30 天</button>
            <button type="button" class="chip-button" data-grant-days="90">+90 天</button>
            <button type="button" class="chip-button" data-grant-days="365">+1 年</button>
            <button type="button" class="chip-button" data-grant-days="0">永久有效</button>
          </div>
          <div class="studio-actions">
            <button id="account-grant-save" class="primary" type="submit">确认更新手动授权</button>
          </div>
          <p class="form-note">仅替换来源为 <code>admin</code> 的手动授权，完整保留 <code>payment</code>（付费购买）与 <code>test</code>（测试植入）授权。取消勾选两项即移除手动授权。</p>
        </form>

        <details class="session-details">
          <summary>查看全部独立授权来源明细 (${fmt.format((a.entitlements || []).length)})</summary>
          <div class="session-list">
            ${(a.entitlements || []).map((x) => `
              <article>
                <div>
                  <b>${esc(({ cloud_sync: '云同步 (cloud_sync)', auto_update: '自动更新 (auto_update)', portal_member: '会员身份 (portal_member)' })[x.feature] || x.feature)}</b>
                  <p>来源：<code>${esc(x.source)}</code> · 到期：${x.validUntil ? date(x.validUntil) : '永久有效'}</p>
                </div>
                <span class="chip ${x.active === false ? 'gold' : 'green'}">${x.active === false ? '已失效' : '生效中'}</span>
              </article>
            `).join('') || empty('暂无任何独立授权记录')}
          </div>
        </details>
      </section>

      <section id="sec-save" class="detail-section">
        <h3>
          <span>云存档健康度与家园背包明细</span>
          ${s ? `<span class="chip ${s.healthy !== false ? 'green' : 'danger'}">${s.healthy !== false ? '存档结构正常' : 'JSON 损坏'}</span>` : '<span class="chip">无存档</span>'}
        </h3>
        <p>${s
          ? `最后同步：${date(s.serverUpdatedAt)} · 体积：${fmt.format(s.payloadBytes)} bytes · 游戏第 ${s.gday || 0} 天 (${s.started ? '已开局' : '未开局'}) · SHA-256：${esc(s.checksum?.slice(0, 16) || '—')}…`
          : '这个账号还没有上传过云存档。可先发送礼包邮件，待玩家完成首次云同步后再领取。'}</p>
        ${renderInventorySection(s)}
        <div class="detail-toolbar">
          <button id="download-account-save" type="button" class="secondary-button" ${s ? '' : 'disabled'}>↓ 下载兼容游戏的存档 TXT</button>
        </div>
        <p class="form-note">导出格式为 <code>nikki-block-town-save</code> (v1)，玩家可在游戏内通过「文件迁移」预览和导入，上限 2 MB。</p>
        ${s ? `<details class="json-details"><summary>展开查看完整云存档原始 JSON</summary><pre>${esc(JSON.stringify(s.data ?? {}, null, 2))}</pre></details>` : ''}
      </section>

      <section id="sec-gift" class="detail-section gift-panel">
        <h3>
          <span>向该账号直接发放礼包</span>
          <small class="mono">${s ? `云档 baseRevision = ${s.revision}` : '需先有云档'}</small>
        </h3>
        <p class="hint">直接写入该居民的云存档（仅允许增加有效目录资源，校验云档 revision 乐观锁与幂等键）。</p>
        ${pendingGift ? `
          <div class="mail-revoke-callout" id="gift-pending-banner">
            <b>⚡ 检测到未确认回执的礼包请求</b>：已为您自动恢复上次待重试的礼包附件（幂等键 <code class="mono">${esc(pendingGift.body.idempotencyKey)}</code>）。直接点击下方「预览并确认发放」将向服务器安全核对回执，绝不会重复加币或重复发物。
            <button type="button" id="gift-pending-discard" class="ghost-button danger">放弃该待重试记录</button>
          </div>
        ` : ''}
        <form id="account-gift-form" class="studio-form">
          <label>
            <span>选择礼包模板或自定义附件</span>
            <select id="gift-select">
              <option value="custom">✨ 自定义配置附件</option>
              ${state.templates.filter((t) => t.active !== false).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
            </select>
          </label>
          <div class="preset-grid">
            <button type="button" class="preset" data-coins="500">🪙 新手补给 · 500 噗灵</button>
            <button type="button" class="preset" data-coins="5000">💰 小镇基金 · 5,000 噗灵</button>
            <button type="button" class="preset" data-preset-seeds="radish:10, strawberry:5">🌱 田园播种 · 萝卜10+草莓5</button>
          </div>
          <div id="gift-custom-ops">${fieldsHtml('gift')}${pickerHtml('gift')}</div>
          <p id="gift-attachment-summary" class="form-note"></p>
          <div class="studio-actions">
            <button id="issue-gift" class="primary" type="submit" ${s && !a.disabled ? '' : 'disabled'}>预览并确认发放礼包</button>
          </div>
        </form>
      </section>

      <section id="sec-history" class="detail-section">
        <h3><span>礼包发放与邮件收件历史</span></h3>
        <details class="session-details" open>
          <summary>礼包到账记录 (${fmt.format((payload.giftHistory || []).length)})</summary>
          <div class="history-mini-list">
            ${payload.giftHistory?.length
              ? payload.giftHistory.map((g) => `
                  <article>
                    <div>
                      <b>${g.operator === 'mail' ? '✉ 邮件礼包领取' : '✦ 管理台直接发放'} · rev ${g.beforeRevision} → ${g.revision}</b>
                      <p>${esc(opsSummary(g.ops, true))}</p>
                      <small>${date(g.issuedAt)} · 状态：${esc(g.status)}</small>
                    </div>
                    <span class="chip green">已入账</span>
                  </article>
                `).join('')
              : empty('暂无礼包发放或领取记录')}
          </div>
        </details>

        <details class="session-details">
          <summary>收到邮件记录 (${fmt.format((payload.mailDeliveries || []).length)})</summary>
          <div class="history-mini-list">
            ${payload.mailDeliveries?.length
              ? payload.mailDeliveries.map((m) => `
                  <article>
                    <div>
                      <b>${esc(m.title)}</b>
                      <p>${m.kind === 'gift' ? `礼包（${esc(opsSummary(m.ops, true))}）` : '公告'} · 投递于 ${date(m.deliveredAt)}</p>
                      <small>阅读：${m.readAt ? date(m.readAt) : '未读'}${m.kind === 'gift' ? ` · 领取：${m.claimedAt ? date(m.claimedAt) : '未领'}` : ''}</small>
                    </div>
                    <button type="button" class="ghost-button" data-open-mail-detail="${esc(m.messageId)}">查看邮件</button>
                  </article>
                `).join('')
              : empty('该账号暂未收到过任何邮件')}
          </div>
        </details>

        <details class="session-details">
          <summary>近期针对该账号的管理审计 (${fmt.format((payload.recentAudits || []).length)})</summary>
          <div class="history-mini-list">
            ${payload.recentAudits?.length
              ? payload.recentAudits.map((au) => `
                  <article>
                    <div>
                      <b>${esc(actions[au.action] || au.action)}</b>
                      <p>${au.detail?.reason ? `原因：${esc(au.detail.reason)}` : esc(formatAuditSummary(au))}</p>
                      <small>${date(au.createdAt)} · IP ${esc(au.ip || '—')}</small>
                    </div>
                  </article>
                `).join('')
              : empty('暂无针对该账号的管理审计记录')}
          </div>
        </details>
      </section>
    `;

    initPicker('gift');

    if (pendingGift) {
      $('#gift-select').value = 'custom';
      syncGiftTemplate();
      setOpsFields('gift', pendingGift.body.ops);
      feedback('detail-feedback', '检测到上次礼包请求未收到确定回执，已恢复待重试附件。保持相同内容重试将自动去重。', true);
      $('#gift-pending-discard')?.addEventListener('click', () => {
        clearPending(`gift:${a.id}`);
        $('#gift-pending-banner')?.remove();
        setOpsFields('gift', []);
        feedback('detail-feedback', '已清除待重试礼包记录，您可以重新配置新礼包。');
      });
    } else {
      syncGiftTemplate();
    }

    $$('[data-drawer-jump]', $('#drawer-body')).forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = $(btn.dataset.drawerJump, $('#drawer-body'));
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    $('#copy-account-id').addEventListener('click', () => copyText(a.id));
    $('#detail-refresh').addEventListener('click', () => openDetail(a.id));
    $('#account-target-mail').addEventListener('click', () => {
      switchView('mail');
      $('#mail-audience').value = 'user';
      $('#mail-target').value = a.id;
      syncMailAudienceUi();
      persistDraft();
      $('#mail-title').focus();
    });
    $('#account-view-audit').addEventListener('click', () => {
      switchView('audit');
      $('#audit-target').value = a.id;
      readAuditFilters();
      void loadAudit();
    });

    $('#account-note-form').addEventListener('submit', saveAccountNote);
    $('#account-toggle-status').addEventListener('click', toggleAccount);
    $('#account-revoke-sessions').addEventListener('click', () => revokeSessions( null));
    $$('[data-revoke-session]', $('#drawer-body')).forEach((btn) => {
      btn.addEventListener('click', () => revokeSessions(btn.dataset.revokeSession, btn));
    });
    $$('[data-grant-days]', $('#drawer-body')).forEach((btn) => {
      btn.addEventListener('click', () => {
        const days = Number(btn.dataset.grantDays);
        $('#grant-until').value = days > 0 ? datetimeLocal(Date.now() + days * 86400000) : '';
        $('#grant-until').dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    $('#account-entitlement-form').addEventListener('submit', saveEntitlements);
    $('#download-account-save').addEventListener('click', downloadSave);
    $('#account-gift-form').addEventListener('submit', issueGift);
    $('#gift-select').addEventListener('change', syncGiftTemplate);

    $$('.preset', $('#drawer-body')).forEach((b) => {
      b.addEventListener('click', () => {
        $('#gift-select').value = 'custom';
        syncGiftTemplate();
        if (b.dataset.coins) {
          setOpsFields('gift', [{ type: 'coins', mode: 'add', amount: Number(b.dataset.coins) }]);
        } else if (b.dataset.presetSeeds) {
          setOpsFields('gift', [{ type: 'seeds', items: { radish: 10, strawberry: 5 } }]);
        }
      });
    });

    $$('[data-open-mail-detail]', $('#drawer-body')).forEach((btn) => {
      btn.addEventListener('click', () => showMailDetail(btn.dataset.openMailDetail));
    });
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      toast('账号 ID 已复制到剪贴板');
    } catch {
      await showDialog('复制账号 ID', `<p>请选中下方内容手动复制：</p><input readonly value="${esc(value)}" aria-label="账号 ID">`, '', false);
    }
  }

  async function accountWrite(path, body, button, success) {
    const id = state.selected;
    return withBusy('account-write', button, async () => {
      try {
        await api(`/api/admin/accounts/${encodeURIComponent(id)}/${path}`, {
          method: path === 'entitlements' ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        });
        if (state.selected === id) await openDetail(id);
        await loadAccounts();
        toast(success);
      } catch (e) {
        fail(e, 'detail-feedback');
        if (e.status === 409 && state.selected === id) {
          await openDetail(id);
          feedback('detail-feedback', '账号已被其他页面修改，已读取最新管理版本，请核对后再操作。', true);
        }
      }
    });
  }

  async function saveAccountNote(event) {
    event.preventDefault();
    if (!state.detail) return;
    const note = $('#account-note').value.trim();
    await accountWrite('manage', { baseRevision: state.detail.account.adminRevision, note }, $('#account-note-save'), '账号备注已保存');
  }

  async function toggleAccount() {
    if (!state.detail) return;
    const a = state.detail.account;
    const reason = await confirmOperation(
      a.disabled ? '恢复账号' : '停用账号',
      `<p>目标账号：<b>${esc(a.username)}</b>（<span class="mono">${esc(a.id)}</span>）</p><p>${a.disabled ? '恢复后该居民可以重新登录游戏与访问云存档服务。' : '停用后将立即强制下线全部登录会话，且无法继续登录；已有云存档安全保留。'}</p>`,
      true,
    );
    if (reason === null) return;
    if (!reason) { toast('请填写操作原因', true); return; }
    await accountWrite('manage', { baseRevision: a.adminRevision, disabled: !a.disabled, reason }, $('#account-toggle-status'), a.disabled ? '账号已恢复启用' : '账号已停用');
  }

  async function revokeSessions(sessionId = null, customBtn = null) {
    if (!state.detail) return;
    const a = state.detail.account;
    const reason = await confirmOperation(
      sessionId ? '下线指定登录会话' : '结束全部登录会话',
      `<p>目标账号：<b>${esc(a.username)}</b></p><p>${sessionId ? `将强制下线会话 <code class="mono">${esc(sessionId)}</code>。` : `将强制结束当前全部 ${fmt.format(state.detail.sessions || 0)} 个有效会话，所有设备需重新登录。`}</p><p>账号最近活跃时间与云存档进度完整保留。</p>`,
      true,
    );
    if (reason === null) return;
    if (!reason) { toast('请填写操作原因', true); return; }
    await accountWrite(
      'revoke-sessions',
      { baseRevision: a.adminRevision, reason, ...(sessionId ? { sessionId } : {}) },
      customBtn || $('#account-revoke-sessions'),
      sessionId ? '指定会话已下线' : '账号全部登录会话已结束',
    );
  }

  function parseUntil(el, allowExisting = false) {
    if (!el.value) return null;
    const value = new Date(el.value).getTime();
    if (!Number.isSafeInteger(value) || (!allowExisting && (value <= Date.now() || value > Date.now() + 366 * 86400000))) {
      fieldError(el, '时间必须在现在之后、未来一年以内');
    }
    return value;
  }

  async function saveEntitlements(event) {
    event.preventDefault();
    try {
      const a = state.detail?.account;
      if (!a) return;
      const features = [];
      if ($('#grant-cloud').checked) features.push('cloud_sync');
      if ($('#grant-update').checked) features.push('auto_update');
      const validUntil = parseUntil($('#grant-until'));
      const reason = await confirmOperation(
        '调整手动授权',
        `<p>目标账号：<b>${esc(a.username)}</b></p><p>手动授权项：<b>${features.length ? features.map((x) => x === 'cloud_sync' ? '云存档同步' : '自动更新').join('、') : '移除全部 admin 来源手动授权'}</b><br>有效期至：<b>${validUntil ? date(validUntil) : '永久有效'}</b></p><p>仅替换 <code>source=admin</code> 的授权记录，付费购买与测试授权保持不变。</p>`,
        true,
      );
      if (reason === null) return;
      if (!reason) throw new Error('请填写操作原因');
      await accountWrite('entitlements', { baseRevision: a.adminRevision, features, validUntil, reason }, $('#account-grant-save'), '手动授权已更新');
    } catch (e) {
      fail(e, 'detail-feedback');
    }
  }

  function download(filename, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadSave() {
    try {
      const payload = state.detail;
      if (!payload?.save?.data) throw new Error('没有可导出的云存档');
      const file = {
        format: 'nikki-block-town-save',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        data: payload.save.data,
      };
      let text = JSON.stringify(file, null, 2);
      if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) text = JSON.stringify(file);
      if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error('存档超过游戏可导入的 2 MB 限制，暂不能导出');
      download(`暖暖小镇-存档-${payload.account.id.replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now()}.txt`, text, 'text/plain;charset=utf-8');
      toast('云存档备份已下载');
    } catch (e) {
      fail(e, 'detail-feedback');
    }
  }

  function syncGiftTemplate() {
    const el = $('#gift-select');
    if (!el) return;
    const id = el.value;
    const t = state.templates.find((x) => x.id === id && x.active !== false);
    $('#gift-custom-ops').hidden = id !== 'custom';
    if (t) {
      if (templateSnapshot.gift?.id !== id) templateSnapshot.gift = { id, ops: structuredClone(t.ops) };
      setOpsFields('gift', templateSnapshot.gift.ops);
    } else {
      templateSnapshot.gift = null;
    }
    $('#gift-attachment-summary').textContent = t
      ? `已选模板附件：${opsSummary(templateSnapshot.gift.ops, true)}`
      : '自定义附件：请填写上方资源字段，或展开下方官方资源目录点选添加。';
  }

  async function issueGift(event) {
    event.preventDefault();
    const payload = state.detail;
    const id = state.selected;
    if (!payload?.save || payload.account.disabled || state.busy.has('gift')) return;
    const form = $('#account-gift-form');
    let ops;
    try {
      ops = $('#gift-select').value === 'custom' ? readOps('gift') : templateSnapshot.gift?.ops;
      if (!ops?.length) throw new Error('请至少添加一项礼包资源');
      const savedPending = storedGiftPending(`gift:${id}`);
      const isRetry = savedPending && savedPending.signature === writeSignature(`gift:${id}`, { ops });
      const yes = await showDialog(
        '确认发放礼包',
        `<p>目标居民：<b>${esc(payload.account.username)}</b><br><span class="mono">${esc(id)}</span></p>
         <p>当前云档版本：<b>revision ${payload.save.revision}</b></p>
         <div class="preview-attachments"><b>发放附件明细：</b><br>${esc(opsSummary(ops, true))}</div>
         ${isRetry ? `<div class="mail-revoke-callout">检测到相同附件的未确认请求，本次确认将复用原幂等键 <code class="mono">${esc(savedPending.body.idempotencyKey)}</code> 安全核对回执，若已发放则不会重复增加资源。</div>` : ''}
         <p class="form-note">确认后立即写入该账号云存档，资源仅做加法累加并记录审计回执。</p>`,
        '确认发放',
      );
      if (!yes || !state.authenticated || state.selected !== id) return;
    } catch (e) {
      fail(e, 'detail-feedback');
      return;
    }

    await withBusy('gift', $('#issue-gift'), async () => {
      setFormBusy(form, true);
      const name = `gift:${id}`;
      const body = requestBody(name, { baseRevision: payload.save.revision, ops });
      try {
        const r = await api(`/api/admin/accounts/${encodeURIComponent(id)}/gift`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        clearPending(name);
        toast(r.idempotent ? '已确认原礼包成功，重复请求已安全去重' : `礼包已发放 · 云档升至 revision ${r.gift.revision}`);
        if (state.selected === id) await openDetail(id);
        await loadAccounts();
      } catch (e) {
        clearDefinitePending(name, e);
        fail(e, 'detail-feedback');
        if (e.status === 409 && state.selected === id) {
          await openDetail(id);
          feedback('detail-feedback', '云存档已更新，已刷新最新详情。请重新核对礼包并确认最新 revision。', true);
        } else if (e.uncertain) {
          feedback('detail-feedback', '未收到确定回执。保持相同附件重试（含按 F5 刷新后重试）会复用原请求编号，不会重复发放。', true);
        }
      } finally {
        setFormBusy(form, false);
      }
    });
  }

  function resetTemplateForm() {
    $('#template-form').reset();
    $('#template-id').value = '';
    $('#template-save').textContent = '保存模板';
    if ($('#template-form-title')) $('#template-form-title').textContent = '创建礼包模板';
    $('#template-cancel').hidden = true;
    clearFieldErrors($('#template-form'));
    renderVisualOps('template');
    $('#template-catalog-type')?.dispatchEvent(new Event('change'));
  }

  function editTemplate(id) {
    const t = state.templates.find((x) => x.id === id);
    if (!t || t.active === false) return;
    $('#template-id').value = t.id;
    $('#template-name').value = t.name;
    $('#template-description').value = t.description || '';
    setOpsFields('template', t.ops);
    $('#template-save').textContent = '更新模板';
    if ($('#template-form-title')) $('#template-form-title').textContent = `编辑模板：${t.name}`;
    $('#template-cancel').hidden = false;
    $('#template-name').focus();
    $('#template-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function duplicateTemplate(id) {
    const t = state.templates.find((x) => x.id === id);
    if (!t) return;
    $('#template-id').value = '';
    $('#template-name').value = `${t.name}（副本）`.slice(0, 40);
    $('#template-description').value = t.description || '';
    setOpsFields('template', t.ops);
    $('#template-save').textContent = '保存为新模板';
    if ($('#template-form-title')) $('#template-form-title').textContent = '复制创建新模板';
    $('#template-cancel').hidden = false;
    $('#template-name').focus();
    toast('已载入模板副本，修改名称后点击保存即可');
  }

  function useTemplateInMail(id) {
    const t = state.templates.find((x) => x.id === id && x.active !== false);
    if (!t) return;
    switchView('mail');
    $('#mail-kind').value = 'gift';
    syncMailKindUi();
    $('#mail-template').value = t.id;
    syncMailTemplateUi();
    persistDraft();
    $('#mail-title').focus();
    toast(`已在邮件附件中选择模板「${t.name}」`);
  }

  function syncTemplateSelects() {
    for (const selector of ['#mail-template', '#gift-select']) {
      const el = $(selector);
      if (!el) continue;
      const old = el.value;
      el.innerHTML = `<option value="custom">✨ 自定义配置附件内容</option>${state.templates
        .filter((t) => t.active !== false)
        .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
        .join('')}`;
      if (old && old !== 'custom' && state.templates.some((t) => t.id === old && t.active !== false)) {
        el.value = old;
      } else if (old && old !== 'custom') {
        el.value = 'custom';
        toast('已选模板不可用，附件已保留为自定义内容，请检查。', true);
      }
    }
    syncMailTemplateUi();
    if ($('#gift-select')) syncGiftTemplate();
  }

  async function loadTemplates() {
    if (!state.authenticated) return;
    feedback('template-feedback', '正在读取模板…');
    try {
      const data = await latest('templates', '/api/admin/gift-templates?includeArchived=1');
      state.templates = data.templates || [];
      renderTemplates();
      syncTemplateSelects();
      feedback('template-feedback');
    } catch (e) {
      fail(e, 'template-feedback');
    }
  }

  function renderTemplates() {
    const kw = (state.templateKeyword || '').trim().toLowerCase();
    const showArchived = $('#template-archived').checked;
    const templates = state.templates.filter((t) => {
      if (!showArchived && t.active === false) return false;
      if (!kw) return true;
      const summary = opsSummary(t.ops, true);
      return `${t.name} ${t.description || ''} ${summary}`.toLowerCase().includes(kw);
    });

    $('#template-list').innerHTML = templates.length
      ? templates.map((t) => `
          <article class="template-item">
            <div>
              <b>${esc(t.name)}</b>
              <span class="chip ${t.active === false ? 'gold' : 'green'}">${t.active === false ? '已归档' : '启用中'}</span>
              <p>${esc(t.description || '未填写运营说明')}</p>
              <div class="mail-attachment-tag">🎁 ${esc(opsSummary(t.ops, true))}</div>
              <small>更新于 ${date(t.updatedAt)}</small>
            </div>
            <div class="template-item-actions">
              ${t.active === false
                ? `<button class="secondary-button" type="button" data-template-restore="${esc(t.id)}">恢复启用</button>
                   <button class="ghost-button" type="button" data-template-copy="${esc(t.id)}">复制</button>`
                : `<button class="secondary-button" type="button" data-template-mail="${esc(t.id)}">✉ 用于发邮件</button>
                   <button class="ghost-button" type="button" data-template-edit="${esc(t.id)}">编辑</button>
                   <button class="ghost-button" type="button" data-template-copy="${esc(t.id)}">复制</button>
                   <button class="ghost-button danger" type="button" data-template-archive="${esc(t.id)}">归档</button>`}
            </div>
          </article>
        `).join('')
      : empty('没有找到匹配的礼包模板，请在左侧创建或调整筛选条件。');

    $$('[data-template-edit]').forEach((el) => el.addEventListener('click', () => editTemplate(el.dataset.templateEdit)));
    $$('[data-template-copy]').forEach((el) => el.addEventListener('click', () => duplicateTemplate(el.dataset.templateCopy)));
    $$('[data-template-mail]').forEach((el) => el.addEventListener('click', () => useTemplateInMail(el.dataset.templateMail)));
    $$('[data-template-archive]').forEach((el) => el.addEventListener('click', () => changeTemplateStatus(el.dataset.templateArchive, false, el)));
    $$('[data-template-restore]').forEach((el) => el.addEventListener('click', () => changeTemplateStatus(el.dataset.templateRestore, true, el)));
  }

  async function saveTemplate(event) {
    event.preventDefault();
    if (state.busy.has('template-save')) return;
    let body;
    try {
      const name = $('#template-name').value.trim();
      const ops = readOps('template');
      if (!name) fieldError($('#template-name'), '请填写礼包名称');
      if (!ops.length) throw new Error('请至少添加一项礼包资源');
      body = { name, description: $('#template-description').value.trim(), ops };
    } catch (e) {
      fail(e, 'template-feedback');
      return;
    }
    const id = $('#template-id').value;
    const form = $('#template-form');
    await withBusy('template-save', $('#template-save'), async () => {
      setFormBusy(form, true);
      try {
        await api(id ? `/api/admin/gift-templates/${encodeURIComponent(id)}` : '/api/admin/gift-templates', {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        });
        toast(id ? '礼包模板已更新' : '礼包模板已创建');
        resetTemplateForm();
        await loadTemplates();
      } catch (e) {
        fail(e, 'template-feedback');
      } finally {
        setFormBusy(form, false);
      }
    });
  }

  async function changeTemplateStatus(id, restore, button) {
    const t = state.templates.find((x) => x.id === id);
    if (!t) return;
    const yes = await confirmOperation(
      restore ? '恢复礼包模板' : '归档礼包模板',
      `<p>模板名称：<b>${esc(t.name)}</b></p><p>${restore ? '恢复后可以在新邮件和账号礼包中选择该模板。' : '归档后不再用于新邮件或礼包下拉框，已发出的历史邮件附件不受影响。'}</p>`,
    );
    if (!yes) return;
    await withBusy(`template:${id}`, button, async () => {
      try {
        await api(`/api/admin/gift-templates/${encodeURIComponent(id)}${restore ? '/restore' : ''}`, {
          method: restore ? 'POST' : 'DELETE',
          body: '{}',
        });
        toast(restore ? '模板已恢复启用' : '模板已归档');
        await loadTemplates();
      } catch (e) {
        fail(e, 'template-feedback');
      }
    });
  }

  function mailDraft() {
    const ids = ['kind', 'audience', 'target', 'title', 'body', 'template', 'coins', 'owned', 'seeds', 'crops', 'decor', 'pantry', 'dishes', 'expires'];
    return Object.fromEntries(ids.map((id) => [id, $(`#mail-${id}`).value]));
  }

  function updateDraftBarUi(customMessage = '') {
    const pending = storedMailPending();
    const bar = $('.draft-bar');
    if (pending) {
      bar?.classList.add('pending-lock');
      $('#mail-draft-state').textContent = customMessage || `⚡ 存在未确认回执的发信请求（幂等键 ${pending.key.slice(0, 18)}…），恢复草稿并保持原内容发布可安全去重`;
    } else {
      bar?.classList.remove('pending-lock');
      if (customMessage) $('#mail-draft-state').textContent = customMessage;
    }
  }

  function persistDraft() {
    const content = mailDraft();
    if (!content.title && !content.body && !['coins', 'owned', 'seeds', 'crops', 'decor', 'pantry', 'dishes'].some((key) => content[key])) return;
    const ok = storage.set(draftKey, JSON.stringify({ version: 1, savedAt: Date.now(), content }));
    updateDraftBarUi(ok ? `草稿已在本机保存 · ${date(Date.now())}` : '浏览器不允许保存草稿；当前内容仍保留在页面。');
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(storage.get(draftKey) || 'null');
      if (!draft?.content) {
        toast('当前浏览器会话没有可恢复草稿');
        return;
      }
      for (const [id, value] of Object.entries(draft.content)) {
        const el = $(`#mail-${id}`);
        if (el && typeof value === 'string') el.value = value;
      }
      $('#mail-template').value = 'custom';
      templateSnapshot.mail = null;
      syncMailKindUi();
      syncMailAudienceUi();
      syncMailTemplateUi();
      renderVisualOps('mail');
      const pending = storedMailPending();
      updateDraftBarUi(
        pending
          ? `已恢复待重试草稿（保存于 ${date(draft.savedAt)}）· 原幂等键已锁定`
          : `已恢复本机草稿 · 保存于 ${date(draft.savedAt)}`,
      );
      feedback('mail-feedback', pending
        ? '草稿与原请求编号已恢复。保持相同内容点击「预览并确认发布」将自动向服务器核对去重，不会重复投递。'
        : '草稿已恢复为保存时的附件内容。发布前请重新检查目标账号、附件和过期时间。');
    } catch {
      storage.remove(draftKey);
      toast('旧草稿无法读取，已清除损坏内容', true);
    }
  }

  async function clearDraft() {
    const yes = await confirmOperation('清除本机邮件草稿', '<p>将清除本机浏览器会话保存的邮件内容与未确认请求编号，并重置当前表单。</p>');
    if (!yes) return;
    storage.remove(draftKey);
    state.pendingWrites.delete('mail:publish');
    storage.remove(`${draftKey}.pending`);
    $('#mail-form').reset();
    clearFieldErrors($('#mail-form'));
    syncMailKindUi();
    syncMailAudienceUi();
    syncMailTemplateUi();
    renderVisualOps('mail');
    updateDraftBarUi('本机草稿已清除');
    feedback('mail-feedback');
  }

  function syncMailKindUi() {
    const gift = $('#mail-kind').value === 'gift';
    $('#mail-gift-fields').hidden = !gift;
    if (!gift) $('#mail-template').value = 'custom';
    $$('input,select,button', $('#mail-gift-fields')).forEach((el) => {
      el.disabled = !gift;
      el.setCustomValidity?.('');
    });
    syncMailTemplateUi();
    $('#mail-catalog-type')?.dispatchEvent(new Event('change'));
  }

  function syncMailAudienceUi() {
    const user = $('#mail-audience').value === 'user';
    $('#mail-target-wrap').hidden = !user;
    $('#mail-target').required = user;
    if (!user) {
      state.requests.get('mail-target')?.controller.abort();
      state.requests.delete('mail-target');
      feedback('mail-target-status');
    } else if ($('#mail-target').value.trim()) {
      $('#mail-target').dispatchEvent(new Event('input'));
    }
  }

  function syncMailTemplateUi() {
    const id = $('#mail-template').value;
    const custom = id === 'custom';
    $('#mail-custom-ops').hidden = !custom;
    let t;
    if (!custom) {
      t = state.templates.find((x) => x.id === id && x.active !== false);
      if (t) {
        if (templateSnapshot.mail?.id !== id) templateSnapshot.mail = { id, ops: structuredClone(t.ops) };
        setOpsFields('mail', templateSnapshot.mail.ops);
      } else {
        $('#mail-template').value = 'custom';
        $('#mail-custom-ops').hidden = false;
        templateSnapshot.mail = null;
      }
    } else {
      templateSnapshot.mail = null;
    }
    const summary = $('#mail-template-summary');
    if (summary) summary.textContent = t ? `当前模板附件：${opsSummary(templateSnapshot.mail.ops, true)} · 发布时使用选取的模板快照` : '';
  }

  function readMailPayload() {
    clearFieldErrors($('#mail-form'));
    const kind = $('#mail-kind').value;
    const audience = $('#mail-audience').value;
    const title = $('#mail-title').value.trim();
    const body = $('#mail-body').value.trim();
    const targetUserId = audience === 'user' ? $('#mail-target').value.trim() : null;
    if (!title) fieldError($('#mail-title'), '请填写邮件标题');
    if (!body) fieldError($('#mail-body'), '请填写邮件正文');
    if (audience === 'user' && !targetUserId) fieldError($('#mail-target'), '请填写目标账号 ID');
    const ops = kind === 'gift' ? readOps('mail') : [];
    if (kind === 'gift' && !ops.length) throw new Error('礼包邮件至少需要一项资源附件');
    const payload = { kind, audience, targetUserId, title, body, ops, expiresAt: parseUntil($('#mail-expires'), true) };
    if (!matchingMailPending(payload)) parseUntil($('#mail-expires'));
    return payload;
  }

  async function sendMail(event) {
    event.preventDefault();
    if (state.busy.has('mail-send')) return;
    const form = $('#mail-form');
    const button = $('#mail-send');
    await withBusy('mail-send', button, async () => {
      let payload;
      try {
        payload = readMailPayload();
        persistDraft();
        setFormBusy(form, true);
        let audienceText;
        if (matchingMailPending(payload)) {
          audienceText = `${payload.audience === 'all' ? '原请求的全体正常账号' : payload.targetUserId} · 重试原请求并确认回执，已成功时不会重复投递`;
        } else if (payload.audience === 'user') {
          const detail = await api(`/api/admin/accounts/${encodeURIComponent(payload.targetUserId)}`);
          if (detail.account.disabled) throw new Error('目标账号已停用，不能接收新邮件');
          audienceText = `${detail.account.username}（${detail.account.id}）`;
        } else {
          const data = await api('/api/admin/accounts?status=active&page=1&pageSize=1');
          audienceText = `全体正常账号，当前 ${fmt.format(data.total || 0)} 个（实际按发布时账号状态投递）`;
        }
        const yes = await showDialog(
          '发布前预览',
          `<div class="mail-preview">
            <p class="preview-meta">${payload.kind === 'gift' ? '🎁 礼包邮件' : '📢 公告邮件'} · 收件人：${esc(audienceText)}</p>
            <h3>${esc(payload.title)}</h3>
            <p class="preview-body">${esc(payload.body)}</p>
            <div class="preview-attachments"><b>附件明细：</b>${esc(opsSummary(payload.ops, true))}</div>
            <p>过期时间：<b>${payload.expiresAt ? date(payload.expiresAt) : '永不过期'}</b></p>
            <p class="form-note">确认后立即发布。后续如撤回邮件，仅隐藏未读/未领入口，不会回收玩家已领取的存档资源。</p>
          </div>`,
          '确认立即发布',
        );
        if (!yes || !state.authenticated) return;
        const request = requestBody('mail:publish', payload);
        const result = await api('/api/admin/mail', { method: 'POST', body: JSON.stringify(request) });
        state.pendingWrites.delete('mail:publish');
        storage.remove(`${draftKey}.pending`);
        storage.remove(draftKey);
        toast(result.idempotent ? '已确认原邮件发布成功，重复请求已安全去重' : `邮件已发布，成功送达 ${fmt.format(result.message?.recipientCount || 0)} 个账号`);
        form.reset();
        syncMailKindUi();
        syncMailAudienceUi();
        syncMailTemplateUi();
        renderVisualOps('mail');
        updateDraftBarUi('邮件已发布，本机草稿已清除');
        feedback('mail-feedback', '邮件发布完成，可在右侧历史邮件中实时查看阅读与领取进度。');
        state.mailQuery.page = 1;
        await loadMail();
      } catch (e) {
        clearDefinitePending('mail:publish', e);
        fail(e, 'mail-feedback');
        if (e.uncertain) {
          updateDraftBarUi();
          feedback('mail-feedback', '未收到确定回执，草稿内容和原幂等请求编号已保留。保持相同内容再次确认发布（或 F5 刷新后恢复草稿重试）会安全去重。', true);
        }
      } finally {
        setFormBusy(form, false);
      }
    });
  }

  function mailStatus(m) {
    return m.status === 'revoked' ? '已撤回' : m.expiresAt && m.expiresAt <= Date.now() ? '已过期' : '有效';
  }

  function renderMailMetrics(stats) {
    const el = $('#mail-metrics');
    if (!el || !stats) return;
    const totalDeliveries = Number(stats.totalDeliveries || 0);
    const totalReads = Number(stats.totalReads || 0);
    const totalClaims = Number(stats.totalClaims || 0);
    const readRate = totalDeliveries ? `${Math.round((totalReads / totalDeliveries) * 100)}%` : '0%';
    const claimRate = totalDeliveries ? `${Math.round((totalClaims / totalDeliveries) * 100)}%` : '0%';

    el.innerHTML = [
      ['累计发布邮件', fmt.format(stats.totalMessages || 0), `礼包 ${fmt.format(stats.giftMessages || 0)} · 撤回 ${fmt.format(stats.revokedMessages || 0)}`, 'pink'],
      ['当前生效邮件', fmt.format(stats.activeMessages || 0), `已过期 ${fmt.format(stats.expiredMessages || 0)} 封`, 'green'],
      ['累计触达与已读', `${fmt.format(totalReads)} / ${fmt.format(totalDeliveries)}`, `整体阅读率 ${readRate}`, 'violet'],
      ['累计礼包领取', fmt.format(totalClaims), `整体触达领取率 ${claimRate}`, 'gold'],
    ].map(([label, val, sub, color]) => `
      <article class="metric" style="--accent:var(--${color})">
        <span class="metric-label">${esc(label)}</span>
        <strong>${esc(val)}</strong>
        <small>${esc(sub)}</small>
      </article>
    `).join('');
  }

  async function loadMail() {
    if (!state.authenticated) return;
    $('#admin-mail-list').innerHTML = loading;
    feedback('mail-history-feedback', '正在读取邮件列表…');
    $('#mail-prev-page').disabled = $('#mail-next-page').disabled = true;
    try {
      const data = await latest('mail', `/api/admin/mail?${query(state.mailQuery)}`);
      state.messages = data.messages || [];
      if (data.stats) {
        state.mailStats = data.stats;
        renderMailMetrics(data.stats);
      }
      state.mailPages = pager('mail', data, state.mailQuery);
      $('#admin-mail-list').innerHTML = state.messages.length
        ? state.messages.map((m) => {
          const st = mailStatus(m);
          const chipColor = st === '已撤回' ? 'danger' : st === '已过期' ? 'gold' : m.kind === 'gift' ? 'pink' : 'green';
          const rec = Math.max(0, Number(m.recipients || 0));
          const rds = Math.max(0, Number(m.reads || 0));
          const cls = Math.max(0, Number(m.claims || 0));
          const readPct = rec ? Math.min(100, Math.round((rds / rec) * 100)) : 0;
          const claimPct = rec ? Math.min(100, Math.round((cls / rec) * 100)) : 0;
          const targetLabel = m.audience === 'all'
            ? '🌍 全体正常账号'
            : `🎯 定向：${m.targetUsername ? `${m.targetUsername} (${m.targetUserId})` : m.targetUserId || '—'}`;

          return `
            <article class="mail-history-item">
              <div class="mail-history-top">
                <div class="detail-toolbar">
                  <span class="chip ${chipColor}">${m.kind === 'gift' ? '礼包' : '公告'} · ${st}</span>
                  <span class="chip">${esc(targetLabel)}</span>
                </div>
                <small>发布于 ${date(m.createdAt)}</small>
              </div>
              <h4>${esc(m.title)}</h4>
              <p>${esc((m.body || '').slice(0, 240))}${m.body?.length > 240 ? '…' : ''}</p>
              ${m.kind === 'gift' && m.ops?.length ? `<div class="mail-attachment-tag">🎁 附件：${esc(opsSummary(m.ops, true))}</div>` : ''}
              ${m.status === 'revoked' ? `<div class="mail-revoke-callout">⚠ 已于 ${date(m.revokedAt)} 撤回 · 原因：${esc(m.revokeReason || '未记录')}</div>` : ''}
              <div class="mail-progress-row">
                <div class="progress-item">
                  <span>已读进度：${fmt.format(rds)} / ${fmt.format(rec)} (${readPct}%)</span>
                  <div class="progress-bar"><div class="progress-fill" style="width:${readPct}%"></div></div>
                </div>
                ${m.kind === 'gift' ? `
                  <div class="progress-item">
                    <span>领取进度：${fmt.format(cls)} / ${fmt.format(rec)} (${claimPct}%)</span>
                    <div class="progress-bar"><div class="progress-fill green" style="width:${claimPct}%"></div></div>
                  </div>
                ` : `
                  <div class="progress-item">
                    <span>有效期：${m.expiresAt ? date(m.expiresAt) : '永不过期'}</span>
                  </div>
                `}
              </div>
              <div class="mail-stats">
                <span>收件 ${fmt.format(rec)}</span>
                <span>已读 ${fmt.format(rds)}</span>
                ${m.kind === 'gift' ? `<span>已领 ${fmt.format(cls)}</span>` : ''}
                <span>${m.expiresAt ? `过期 ${date(m.expiresAt)}` : '永不过期'}</span>
              </div>
              <div class="detail-toolbar" style="margin-top:0.65rem">
                <button type="button" class="secondary-button" data-mail-detail="${esc(m.id)}">查看详情与投递明细</button>
                <button type="button" class="ghost-button" data-mail-copy="${esc(m.id)}">复制为新邮件</button>
                ${m.status !== 'revoked' ? `<button type="button" class="ghost-button danger" data-mail-revoke="${esc(m.id)}">撤回邮件</button>` : ''}
              </div>
            </article>
          `;
        }).join('')
        : empty('没有找到匹配的邮件，请调整筛选条件或在左侧发布新邮件。');

      $$('[data-mail-detail]').forEach((el) => el.addEventListener('click', () => {
        void showMailDetail(el.dataset.mailDetail, 1);
      }));
      $$('[data-mail-copy]').forEach((el) => el.addEventListener('click', () => copyMail(el.dataset.mailCopy)));
      $$('[data-mail-revoke]').forEach((el) => el.addEventListener('click', () => revokeMail(el.dataset.mailRevoke, el)));
      feedback('mail-history-feedback');
      setSync();
    } catch (e) {
      if (!e.cancelled) {
        $('#admin-mail-list').innerHTML = empty('邮件读取失败，请点击刷新重试。');
        fail(e, 'mail-history-feedback');
      }
    }
  }

  async function showMailDetail(id, page = 1) {
    if (!state.authenticated) return;
    const dialog = $('#workbench-dialog');
    if (dialog.open && state.mailDetailId !== id) return;
    if (!dialog.open || state.mailDetailId !== id) {
      state.deliveryQuery = { q: '', status: 'all', page: 1 };
    } else {
      state.deliveryQuery.page = page;
    }
    if (!dialog.open) {
      void showDialog('邮件详情与投递记录', loading, '', false);
      state.mailDetailId = id;
    }
    try {
      const qStr = query({ page: state.deliveryQuery.page, pageSize: 20, q: state.deliveryQuery.q, status: state.deliveryQuery.status });
      const data = await latest('mail-detail', `/api/admin/mail/${encodeURIComponent(id)}?${qStr}`);
      const m = data.message;
      const rec = Math.max(0, Number(m.recipients || 0));
      const rds = Math.max(0, Number(m.reads || 0));
      const cls = Math.max(0, Number(m.claims || 0));

      const html = `
        <div class="mail-preview">
          <div class="detail-toolbar">
            <span class="chip ${m.status === 'revoked' ? 'danger' : 'pink'}">${m.kind === 'gift' ? '礼包邮件' : '公告邮件'} · ${mailStatus(m)}</span>
            <span class="chip">${m.audience === 'all' ? '全体正常账号' : `指定账号：${esc(m.targetUsername || m.targetUserId)}`}</span>
            <span class="chip mono">ID: ${esc(m.id.slice(0, 12))}…</span>
          </div>
          <h3>${esc(m.title)}</h3>
          <p class="preview-body">${esc(m.body)}</p>
          <div class="preview-attachments"><b>附件内容：</b>${esc(opsSummary(m.ops, true))}</div>
          ${m.status === 'revoked' ? `<div class="mail-revoke-callout">已于 ${date(m.revokedAt)} 撤回 · 原因：${esc(m.revokeReason || '—')}</div>` : ''}
          <p class="form-note">发布时间：${date(m.publishedAt || m.createdAt)} · 过期时间：${m.expiresAt ? date(m.expiresAt) : '永不过期'} · 总触达：${fmt.format(rec)} 人（已读 ${fmt.format(rds)} / 已领 ${fmt.format(cls)}）</p>
        </div>

        <div class="studio-card-head" style="margin-top:1rem;margin-bottom:0.6rem;padding-bottom:0.5rem">
          <h3>投递状态明细 · 当前筛选共 ${fmt.format(data.total || 0)} 个账号</h3>
          <button type="button" class="secondary-button" id="delivery-export">↓ 导出投递明细 CSV</button>
        </div>

        <div class="filter-bar" style="margin-bottom:0.75rem">
          <label class="grow">
            <span>搜索收件居民</span>
            <input id="delivery-search" type="search" value="${esc(state.deliveryQuery.q)}" placeholder="输入用户名或账号 ID 回车过滤…">
          </label>
          <label>
            <span>状态筛选</span>
            <select id="delivery-status">
              <option value="all" ${state.deliveryQuery.status === 'all' ? 'selected' : ''}>全部收件人</option>
              <option value="read" ${state.deliveryQuery.status === 'read' ? 'selected' : ''}>已阅读</option>
              <option value="unread" ${state.deliveryQuery.status === 'unread' ? 'selected' : ''}>未阅读</option>
              ${m.kind === 'gift' ? `
                <option value="claimed" ${state.deliveryQuery.status === 'claimed' ? 'selected' : ''}>已领取礼包</option>
                <option value="unclaimed" ${state.deliveryQuery.status === 'unclaimed' ? 'selected' : ''}>未领取礼包</option>
              ` : ''}
            </select>
          </label>
          <button type="button" class="secondary-button" id="delivery-filter-apply">筛选</button>
        </div>

        <div class="delivery-list">
          ${data.deliveries?.length
            ? data.deliveries.map((d) => `
                <article>
                  <div>
                    <b>${esc(d.username || d.userId)}</b>
                    <small class="mono">${esc(d.userId)}</small>
                    <p>阅读：${d.readAt ? date(d.readAt) : '未读'}${m.kind === 'gift' ? ` · 领取：${d.claimedAt ? date(d.claimedAt) : '未领'}` : ''}</p>
                  </div>
                  <div class="detail-toolbar">
                    <span class="chip ${d.claimedAt ? 'green' : d.readAt ? 'pink' : ''}">${d.claimedAt ? '已领取' : d.readAt ? '已读' : '未读'}</span>
                    <button type="button" class="ghost-button" data-delivery-account="${esc(d.userId)}">查看账号</button>
                  </div>
                </article>
              `).join('')
            : empty('没有符合条件的投递记录')}
        </div>
        <div class="pager">
          <button type="button" class="page-button" id="delivery-prev" ${data.page <= 1 ? 'disabled' : ''} aria-label="投递上一页">←</button>
          <span>第 ${data.page || 1} / ${data.pages || 1} 页</span>
          <button type="button" class="page-button" id="delivery-next" ${data.page >= data.pages ? 'disabled' : ''} aria-label="投递下一页">→</button>
        </div>
      `;

      if (!$('#workbench-dialog').open || state.mailDetailId !== id) return;
      $('#dialog-title').textContent = '邮件详情与投递记录';
      $('#dialog-body').innerHTML = html;

      const triggerFilter = () => {
        state.deliveryQuery.q = $('#delivery-search').value.trim();
        state.deliveryQuery.status = $('#delivery-status').value;
        void showMailDetail(id, 1);
      };
      $('#delivery-filter-apply').addEventListener('click', triggerFilter);
      $('#delivery-status').addEventListener('change', triggerFilter);
      $('#delivery-search').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); triggerFilter(); }
      });
      $('#delivery-prev').addEventListener('click', () => showMailDetail(id, Math.max(1, data.page - 1)));
      $('#delivery-next').addEventListener('click', () => showMailDetail(id, data.page + 1));
      $('#delivery-export').addEventListener('click', () => exportMailDeliveries(id, m.title));
      $$('[data-delivery-account]', $('#dialog-body')).forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.deliveryAccount;
          $('#workbench-dialog').close('cancel');
          void openDetail(targetId);
        });
      });
    } catch (e) {
      fail(e, $('#workbench-dialog').open ? 'dialog-feedback' : 'mail-history-feedback');
    }
  }

  function copyMail(id) {
    const m = state.messages.find((x) => x.id === id);
    if (!m) return;
    $('#mail-kind').value = m.kind;
    $('#mail-audience').value = m.audience;
    $('#mail-target').value = m.targetUserId || '';
    $('#mail-title').value = m.title;
    $('#mail-body').value = m.body;
    $('#mail-template').value = 'custom';
    setOpsFields('mail', m.ops);
    $('#mail-expires').value = '';
    state.pendingWrites.delete('mail:publish');
    storage.remove(`${draftKey}.pending`);
    syncMailKindUi();
    syncMailAudienceUi();
    syncMailTemplateUi();
    renderVisualOps('mail');
    persistDraft();
    $('#mail-title').focus();
    $('#mail-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    feedback('mail-feedback', '已复制为新邮件草稿，过期时间已清空，请核对后发布。');
  }

  async function revokeMail(id, button) {
    const m = state.messages.find((x) => x.id === id);
    if (!m) return;
    const reason = await confirmOperation(
      '撤回已发布邮件',
      `<p>邮件标题：<b>${esc(m.title)}</b></p><p>撤回后该邮件立即从玩家游戏内收件箱隐藏，未领取的礼包附件将无法再领取；<b>已经领取到存档中的资源与回执将安全保留，不会回滚玩家进度。</b></p>`,
      true,
    );
    if (reason === null) return;
    if (!reason) { toast('请填写撤回原因', true); return; }
    await withBusy(`mail-revoke:${id}`, button, async () => {
      try {
        await api(`/api/admin/mail/${encodeURIComponent(id)}/revoke`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        toast('邮件已撤回');
        await loadMail();
      } catch (e) {
        fail(e, 'mail-history-feedback');
      }
    });
  }

  function readAuditFilters() {
    const from = $('#audit-from').value;
    const to = $('#audit-to').value;
    if (from && to && from > to) throw new Error('结束日期不能早于起始日期');
    state.auditQuery = {
      q: $('#audit-search').value.trim(),
      action: $('#audit-action').value,
      targetUserId: $('#audit-target').value.trim(),
      from: from ? new Date(`${from}T00:00:00`).getTime() : '',
      to: to ? new Date(`${to}T23:59:59.999`).getTime() : '',
      page: 1,
      pageSize: 20,
    };
  }

  function formatAuditSummary(x) {
    const d = x.detail || {};
    if (x.action === 'gift.issue') {
      return `向 ${d.username || x.targetUsername || x.targetUserId || '账号'} 发放礼包（云档 rev ${d.baseRevision} → ${d.revision}）：${opsSummary(d.ops || [], true)}`;
    }
    if (x.action === 'mail.publish') {
      return `发布${d.kind === 'gift' ? '礼包' : '公告'}邮件「${d.title || ''}」（范围：${d.audience === 'all' ? '全体正常账号' : d.targetUserId || '指定账号'}）`;
    }
    if (x.action === 'mail.revoke') {
      return `撤回邮件「${d.title || d.messageId || ''}」（触达 ${d.recipients ?? 0}，已读 ${d.reads ?? 0}，已领 ${d.claims ?? 0}）`;
    }
    if (x.action === 'mail.claim') {
      return `玩家领取邮件礼包（邮件 ${d.messageId || ''} · 云档升至 rev ${d.revision}）`;
    }
    if (x.action === 'account.manage') {
      const statusChanged = d.before?.disabled !== d.after?.disabled
        ? `状态：${d.before?.disabled ? '停用' : '正常'} → ${d.after?.disabled ? '停用' : '正常'}`
        : '更新运营备注';
      return `${statusChanged}（管理版本 v${d.before?.adminRevision ?? 0} → v${d.after?.adminRevision ?? 0}${d.revoked ? `，下线会话 ${d.revoked} 个` : ''}）`;
    }
    if (x.action === 'account.sessions.revoke') {
      return `强制下线登录会话 ${d.revoked ?? 0} 个${d.sessionId ? `（指定会话 ${d.sessionId}）` : ''} · 管理版本升至 v${d.adminRevision}`;
    }
    if (x.action === 'account.entitlements.update') {
      const feats = (d.features || []).length ? d.features.join(', ') : '移除全部手动授权';
      return `手动授权变更：${feats}（到期：${d.validUntil ? date(d.validUntil) : '永久'} · 管理版本 v${d.adminRevision}）`;
    }
    if (x.action === 'service.free_access.update') {
      return `全服限免状态：${d.before?.freeEntitlements ? '开启' : '关闭'} → ${d.after?.freeEntitlements ? '开启' : '关闭'}（设置版本 rev ${d.after?.revision}）`;
    }
    if (x.action?.startsWith('gift_template.')) {
      return `模板「${d.name || d.templateId || ''}」${d.ops ? ` · ${opsSummary(d.ops, true)}` : ''}`;
    }
    return JSON.stringify(d);
  }

  async function loadAudit() {
    if (!state.authenticated) return;
    $('#audit-list').innerHTML = loading;
    feedback('audit-feedback', '正在读取操作记录…');
    $('#audit-prev-page').disabled = $('#audit-next-page').disabled = true;
    try {
      const data = await latest('audit', `/api/admin/audit?${query(state.auditQuery)}`);
      state.auditPages = pager('audit', data, state.auditQuery);
      $('#audit-list').innerHTML = data.entries?.length
        ? data.entries.map((x) => {
          const isDanger = ['mail.revoke', 'account.sessions.revoke', 'gift_template.archive'].includes(x.action)
            || (x.action === 'account.manage' && x.detail?.after?.disabled);
          const chipClass = isDanger ? 'gold' : x.action.startsWith('gift') || x.action.startsWith('mail') ? 'pink' : 'green';
          const targetText = x.targetUserId
            ? `${x.targetUsername ? `${x.targetUsername} (${x.targetUserId})` : x.targetUserId}`
            : '全局系统操作';

          return `
            <article class="audit-item">
              <div class="audit-item-head">
                <div class="audit-item-title">
                  <span class="chip ${chipClass}">${esc(actions[x.action] || x.action)}</span>
                  <b class="mono">${esc(x.action)}</b>
                  ${x.targetUserId
                    ? `<button type="button" class="chip-button" data-audit-account="${esc(x.targetUserId)}">👤 ${esc(targetText)}</button>`
                    : `<span class="chip">${esc(targetText)}</span>`}
                </div>
                <small>${date(x.createdAt)} · IP ${esc(x.ip || '—')}</small>
              </div>
              <p class="audit-summary-line">${esc(formatAuditSummary(x))}</p>
              ${x.detail?.reason ? `<p class="audit-summary-line" style="color:var(--gold)">✎ 操作原因：${esc(x.detail.reason)}</p>` : ''}
              <details>
                <summary>查看完整回执 JSON</summary>
                <pre>${esc(JSON.stringify(x.detail || {}, null, 2))}</pre>
              </details>
            </article>
          `;
        }).join('')
        : empty('当前筛选条件下没有操作记录');

      $$('[data-audit-account]', $('#audit-list')).forEach((btn) => {
        btn.addEventListener('click', () => openDetail(btn.dataset.auditAccount));
      });
      feedback('audit-feedback');
      setSync();
    } catch (e) {
      if (!e.cancelled) {
        $('#audit-list').innerHTML = empty('操作记录读取失败，请点击刷新重试。');
        fail(e, 'audit-feedback');
      }
    }
  }

  function csvCell(v) {
    let value = String(v ?? '');
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)) value = `'${value}`;
    return `"${value.replace(/"/g, '""')}"`;
  }

  async function exportAll(type, filters = null) {
    const button = $(`#${type}-export`);
    const id = type === 'account' ? 'account-feedback' : type === 'mail' ? 'mail-history-feedback' : 'audit-feedback';
    const baseQuery = filters || (type === 'account' ? state.accountQuery : type === 'mail' ? state.mailQuery : state.auditQuery);
    const snapshot = { ...baseQuery, page: 1, pageSize: 50 };
    const epoch = state.epoch;
    const endpoint = type === 'account' ? 'accounts' : type === 'mail' ? 'mail' : 'audit';
    const key = type === 'account' ? 'accounts' : type === 'mail' ? 'messages' : 'entries';

    await withBusy(`export:${type}`, button, async () => {
      try {
        const rows = [];
        const seen = new Set();
        let pages = 1;
        for (let page = 1; page <= pages; page++) {
          if (!state.authenticated || epoch !== state.epoch) return;
          feedback(id, `正在分页拉取并导出第 ${page} / ${pages} 页…`);
          const data = await api(`/api/admin/${endpoint}?${query({ ...snapshot, page })}`);
          pages = Math.max(1, Number(data.pages) || 1);
          if (pages > 10000) throw new Error('结果过多，请缩小筛选范围后导出');
          for (const row of data[key] || []) {
            if (!seen.has(row.id)) {
              seen.add(row.id);
              rows.push(row);
            }
          }
        }
        const headers = type === 'account'
          ? ['账号 ID', '用户名', '状态', '注册时间', '最近访问', '云档 revision', '最近同步', '噗灵', '运营备注']
          : type === 'mail'
            ? ['邮件 ID', '类型', '状态', '标题', '收件范围', '目标账号', '收件人数', '已读人数', '已领人数', '发布时间', '过期时间', '撤回原因']
            : ['记录 ID', '操作', '目标账号', '目标用户名', '时间', 'IP', '原因', '详情'];
        const values = rows.map((x) => type === 'account'
          ? [x.id, x.username, x.disabled ? '停用' : '正常', date(x.createdAt), date(x.lastSeen), x.save?.revision, date(x.save?.serverUpdatedAt), x.save?.coins, x.note]
          : type === 'mail'
            ? [x.id, x.kind === 'gift' ? '礼包' : '公告', mailStatus(x), x.title, x.audience === 'all' ? '全体' : '指定', x.targetUserId || '', x.recipients, x.reads, x.claims, date(x.createdAt), x.expiresAt ? date(x.expiresAt) : '永不过期', x.revokeReason || '']
            : [x.id, actions[x.action] || x.action, x.targetUserId, x.targetUsername || '', date(x.createdAt), x.ip || '', x.detail?.reason, JSON.stringify(x.detail || {})]);

        const label = type === 'account' ? '账号' : type === 'mail' ? '邮件统计' : '操作记录';
        download(`暖暖小镇-${label}-${Date.now()}.csv`, '\uFEFF' + [headers, ...values].map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
        feedback(id, `已导出 ${fmt.format(rows.length)} 条记录（使用点击导出时的筛选条件并已做防公式注入处理）。`);
      } catch (e) {
        fail(e, id);
      }
    });
  }

  async function exportMailDeliveries(mailId, title) {
    const button = $('#delivery-export');
    const snapshot = { q: state.deliveryQuery.q, status: state.deliveryQuery.status, page: 1, pageSize: 50 };
    const epoch = state.epoch;
    await withBusy(`export:delivery:${mailId}`, button, async () => {
      try {
        const rows = [];
        const seen = new Set();
        let pages = 1;
        for (let page = 1; page <= pages; page++) {
          if (!state.authenticated || epoch !== state.epoch) return;
          feedback('dialog-feedback', `正在导出投递明细第 ${page} / ${pages} 页…`);
          const data = await api(`/api/admin/mail/${encodeURIComponent(mailId)}?${query({ ...snapshot, page })}`);
          pages = Math.max(1, Number(data.pages) || 1);
          for (const d of data.deliveries || []) {
            if (!seen.has(d.userId)) {
              seen.add(d.userId);
              rows.push(d);
            }
          }
        }
        const headers = ['邮件 ID', '邮件标题', '收件账号 ID', '收件用户名', '投递时间', '阅读时间', '领取时间'];
        const values = rows.map((d) => [mailId, title, d.userId, d.username || '', date(d.deliveredAt), d.readAt ? date(d.readAt) : '未读', d.claimedAt ? date(d.claimedAt) : '未领取']);
        download(`暖暖小镇-邮件投递明细-${mailId.slice(0, 8)}-${Date.now()}.csv`, '\uFEFF' + [headers, ...values].map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
        feedback('dialog-feedback', `已成功导出 ${fmt.format(rows.length)} 条投递记录。`);
      } catch (e) {
        fail(e, 'dialog-feedback');
      }
    });
  }

  function updateServiceButton() {
    $('#service-save').disabled = !state.service
      || state.busy.has('service-save')
      || $('#free-access').checked === state.service.freeEntitlements;
  }

  function renderService(data) {
    state.service = data.settings;
    state.billing = data.billing;
    const s = state.service;
    const b = state.billing || {};
    renderServiceSummary(s);
    $('#free-access').checked = !!s.freeEntitlements;
    $('#free-access').disabled = false;
    $('#service-current').textContent = s.freeEntitlements
      ? '已开启：所有正常登录账号统一免费享有云同步与自动更新，无需购买。'
      : '已关闭：仅具备独立有效授权的账号可继续使用云同步与自动更新。';
    $('#service-mode').textContent = s.freeEntitlements ? '限免进行中' : '限免已关闭';
    $('#service-mode').className = `chip ${s.freeEntitlements ? 'green' : 'gold'}`;
    $('#service-meta').textContent = `设置版本 revision ${s.revision} · 来源 ${s.source || 'workbench'} · ${s.updatedAt ? `保存于 ${date(s.updatedAt)}` : '沿用服务端初始默认配置'}`;
    $('#checkout-state').textContent = b.checkoutEnabled
      ? (b.sandbox ? '支付宝沙箱验证已开放' : b.testMode ? '指定账号小额验证已开放' : '会员购买入口已开放')
      : '购买收银台入口已关闭';
    $('#checkout-description').textContent = b.message || '支付状态由服务器实时返回';
    updateServiceButton();
  }

  async function loadService() {
    if (!state.authenticated || state.busy.has('service-save')) return;
    feedback('service-feedback', '正在读取服务设置…');
    try {
      renderService(await latest('service', '/api/admin/service-settings'));
      feedback('service-feedback');
      setSync();
    } catch (e) {
      if (!e.cancelled) {
        state.service = null;
        $('#free-access').disabled = true;
        updateServiceButton();
        fail(e, 'service-feedback');
      }
    }
  }

  async function saveService(event) {
    event.preventDefault();
    if (!state.service || state.busy.has('service-save')) return;
    const freeEntitlements = $('#free-access').checked;
    const revision = state.service.revision;
    const yes = await confirmOperation(
      freeEntitlements ? '开启全体账号限免' : '关闭全体账号限免',
      `<p>${freeEntitlements
        ? '开启后，所有正常登录账号均可免费使用云存档同步和自动更新。'
        : '关闭后，仅具备独立有效授权（admin / payment / test）的账号可继续使用云存档同步和自动更新；已有云存档保留，且购买入口仍保持暂停。'}</p>`,
    );
    if (!yes) return;
    await withBusy('service-save', $('#service-save'), async () => {
      $('#free-access').disabled = true;
      $('#service-reload').disabled = true;
      try {
        renderService(await api('/api/admin/service-settings', {
          method: 'PUT',
          body: JSON.stringify({ freeEntitlements, baseRevision: revision }),
        }));
        feedback('service-feedback', '服务设置已保存并立即生效，审计记录已写入。');
        toast('服务设置已保存');
        await loadAccounts();
      } catch (e) {
        fail(e, 'service-feedback');
        if (e.status === 409) {
          try {
            renderService(await api('/api/admin/service-settings'));
            feedback('service-feedback', '已读取其他页面保存的最新设置版本，请核对后再操作。', true);
          } catch (readError) {
            fail(readError, 'service-feedback');
          }
        }
      } finally {
        $('#free-access').disabled = !state.service;
        $('#service-reload').disabled = false;
      }
    });
    updateServiceButton();
  }

  async function refreshView() {
    if (!state.authenticated) return;
    $('#refresh').disabled = true;
    try {
      if (state.view === 'service') await loadService();
      else if (state.view === 'audit') await loadAudit();
      else if (state.view === 'mail') await Promise.all([loadTemplates(), loadMail()]);
      else if (state.view === 'gifts') await Promise.all([loadTemplates(), loadCatalog()]);
      else {
        await loadAccounts();
        if (state.selected) await openDetail(state.selected);
      }
    } finally {
      $('#refresh').disabled = false;
    }
  }

  function switchView(view, focusNavigation = false) {
    if (!['accounts', 'gifts', 'mail', 'service', 'audit'].includes(view) || !state.authenticated) return;
    state.view = view;
    closeDrawer(false);
    $$('.nav-item').forEach((el) => {
      const active = el.dataset.view === view;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    $$('.view').forEach((el) => {
      el.hidden = el.id !== `view-${view}`;
    });
    const [title, sub] = viewMeta[view] || ['账号档案', ''];
    $('#view-title').textContent = title;
    if ($('#view-subtitle')) $('#view-subtitle').textContent = sub;
    if (focusNavigation) $(`.nav-item[data-view="${view}"]`)?.focus();
    void refreshView();
  }

  function bindPager(prev, next, q, pages, load) {
    $(`#${prev}`).addEventListener('click', () => {
      if (q().page > 1) { q().page--; void load(); }
    });
    $(`#${next}`).addEventListener('click', () => {
      if (q().page < pages()) { q().page++; void load(); }
    });
  }

  // Event Bindings
  $('#gate-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button', event.target);
    await withBusy('login', button, async () => {
      state.token = $('#admin-token').value.trim();
      feedback('gate-error');
      try {
        await api('/api/admin/session');
        showApp();
        $('#admin-token').value = '';
        await Promise.all([loadAccounts(), loadCatalog(), loadService(), loadTemplates()]);
      } catch (e) {
        state.token = '';
        showGate(e.status === 401 ? '管理员令牌无效或登录已失效。' : e.message);
      }
    });
  });

  async function signOut() {
    const token = state.token;
    endSession('已退出管理台');
    try {
      await api('/api/admin/logout', { method: 'POST', headers: token ? { 'X-Admin-Token': token } : {}, body: '{}' });
    } catch { /* local access has already ended */ }
  }
  $$('[data-admin-sign-out]').forEach((button) => button.addEventListener('click', signOut));

  $('#refresh').addEventListener('click', refreshView);
  $('#account-search').addEventListener('input', debounce(() => { readAccountFilters(); void loadAccounts(); }));
  ['status', 'save', 'activity', 'sort', 'page-size'].forEach((name) => {
    $(`#account-${name}`).addEventListener('change', () => { readAccountFilters(); void loadAccounts(); });
  });
  $('#clear-search').addEventListener('click', () => {
    $('#account-search').value = '';
    for (const [key, value] of [['status', 'all'], ['save', 'all'], ['activity', 'all'], ['sort', 'newest'], ['page-size', '20']]) {
      $(`#account-${key}`).value = value;
    }
    readAccountFilters();
    void loadAccounts();
  });
  $('#account-export').addEventListener('click', () => {
    const page = state.accountQuery.page;
    readAccountFilters();
    const snapshot = { ...state.accountQuery };
    state.accountQuery.page = page;
    void exportAll('account', snapshot);
  });

  bindPager('prev-page', 'next-page', () => state.accountQuery, () => state.accountPages, loadAccounts);
  bindPager('mail-prev-page', 'mail-next-page', () => state.mailQuery, () => state.mailPages, loadMail);
  bindPager('audit-prev-page', 'audit-next-page', () => state.auditQuery, () => state.auditPages, loadAudit);

  $('#close-drawer').addEventListener('click', () => closeDrawer());
  $('#drawer-backdrop').addEventListener('click', () => closeDrawer());
  $$('.nav-item,[data-view]').forEach((el) => el.addEventListener('click', () => switchView(el.dataset.view)));

  document.addEventListener('keydown', (event) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && state.authenticated && !$('#workbench-dialog').open) {
      const map = { '1': 'accounts', '2': 'gifts', '3': 'mail', '4': 'service', '5': 'audit' };
      if (map[event.key]) {
        event.preventDefault();
        switchView(map[event.key], true);
        return;
      }
    }
    if ($('#workbench-dialog').open || !$('#detail-drawer').classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
    } else if (event.key === 'Tab') {
      const targets = $$('button,input,select,textarea,summary,[tabindex="0"]', $('#detail-drawer'))
        .filter((el) => !el.disabled && el.getClientRects().length);
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });

  $('#service-form').addEventListener('submit', saveService);
  $('#free-access').addEventListener('change', updateServiceButton);
  $('#service-reload').addEventListener('click', loadService);

  $('#template-form').addEventListener('submit', saveTemplate);
  $('#template-cancel').addEventListener('click', resetTemplateForm);
  $('#template-clear-fields')?.addEventListener('click', () => setOpsFields('template', []));
  $('#template-archived').addEventListener('change', renderTemplates);
  $('#template-refresh').addEventListener('click', loadTemplates);
  $('#template-search')?.addEventListener('input', debounce(() => {
    state.templateKeyword = $('#template-search').value;
    renderTemplates();
  }, 180));

  $$('[data-template-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.templatePreset;
      if (kind === 'welcome') {
        if (!$('#template-name').value) $('#template-name').value = '春日迎新补给礼';
        if (!$('#template-description').value) $('#template-description').value = '新居民初始家园建设与服饰欢迎礼包';
        setOpsFields('template', [
          { type: 'coins', mode: 'add', amount: 1000 },
          { type: 'seeds', items: { radish: 10, strawberry: 5 } },
        ]);
      } else if (kind === 'harvest') {
        if (!$('#template-name').value) $('#template-name').value = '田园丰收季礼盒';
        if (!$('#template-description').value) $('#template-description').value = '农场丰收活动种子与作物补给';
        setOpsFields('template', [
          { type: 'coins', mode: 'add', amount: 500 },
          { type: 'seeds', items: { tulip: 6, sunflower: 6 } },
          { type: 'crops', items: { radish: 8, strawberry: 8 } },
        ]);
      } else if (kind === 'dressup') {
        if (!$('#template-name').value) $('#template-name').value = '星夜庆典穿搭礼';
        if (!$('#template-description').value) $('#template-description').value = '庆典限定发型与服饰纪念组合';
        setOpsFields('template', [
          { type: 'coins', mode: 'add', amount: 2000 },
          { type: 'owned', ids: ['h_star', 'd_star', 's_star'] },
        ]);
      }
    });
  });

  $('#mail-form').addEventListener('submit', sendMail);
  $('#mail-kind').addEventListener('change', syncMailKindUi);
  $('#mail-audience').addEventListener('change', syncMailAudienceUi);
  $('#mail-template').addEventListener('change', syncMailTemplateUi);
  $('#mail-refresh').addEventListener('click', loadMail);
  $('#mail-export')?.addEventListener('click', () => exportAll('mail'));
  $('#mail-draft-restore').addEventListener('click', restoreDraft);
  $('#mail-draft-clear').addEventListener('click', clearDraft);
  $('#mail-form').addEventListener('input', persistDraft);
  $('#mail-form').addEventListener('change', persistDraft);

  $('#mail-target-quick')?.addEventListener('change', (e) => {
    if (e.target.value) {
      $('#mail-target').value = e.target.value;
      $('#mail-target').dispatchEvent(new Event('input', { bubbles: true }));
      persistDraft();
    }
  });

  $$('[data-mail-expire-days]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.mailExpireDays);
      $('#mail-expires').value = days > 0 ? datetimeLocal(Date.now() + days * 86400000) : '';
      $('#mail-expires').dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  const mailFilter = () => {
    state.mailQuery = {
      ...state.mailQuery,
      q: $('#mail-search').value.trim(),
      kind: $('#mail-filter-kind').value,
      status: $('#mail-filter-status').value,
      page: 1,
    };
    void loadMail();
  };
  $('#mail-search').addEventListener('input', debounce(mailFilter));
  $('#mail-filter-kind').addEventListener('change', mailFilter);
  $('#mail-filter-status').addEventListener('change', mailFilter);

  $('#audit-filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try { readAuditFilters(); void loadAudit(); } catch (error) { fail(error, 'audit-feedback'); }
  });
  $('#audit-reset').addEventListener('click', () => {
    $('#audit-filter-form').reset();
    readAuditFilters();
    void loadAudit();
  });
  $('#audit-export').addEventListener('click', () => {
    try { readAuditFilters(); void exportAll('audit'); } catch (e) { fail(e, 'audit-feedback'); }
  });

  $$('[data-audit-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.auditRange;
      const now = new Date();
      const toStr = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (range === 'all') {
        $('#audit-from').value = '';
        $('#audit-to').value = '';
      } else if (range === 'today') {
        const s = toStr(now);
        $('#audit-from').value = s;
        $('#audit-to').value = s;
      } else if (range === '7d') {
        $('#audit-from').value = toStr(new Date(now.getTime() - 6 * 86400000));
        $('#audit-to').value = toStr(now);
      } else if (range === '30d') {
        $('#audit-from').value = toStr(new Date(now.getTime() - 29 * 86400000));
        $('#audit-to').value = toStr(now);
      }
      try { readAuditFilters(); void loadAudit(); } catch (e) { fail(e, 'audit-feedback'); }
    });
  });

  $('#template-form .ops-box').insertAdjacentHTML('beforeend', pickerHtml('template'));
  $('#mail-custom-ops').insertAdjacentHTML('afterend', '<p id="mail-template-summary" class="form-note"></p>');
  $('#mail-custom-ops').insertAdjacentHTML('beforeend', pickerHtml('mail'));
  initPicker('template');
  initPicker('mail');

  const clearOnEdit = (event) => {
    const el = event.target;
    if (!el.matches('input,textarea,select')) return;
    el.setCustomValidity('');
    el.removeAttribute('aria-invalid');
    el.classList.remove('invalid');
    el.parentElement.querySelector('.field-error')?.remove();
  };
  document.addEventListener('input', clearOnEdit);
  document.addEventListener('change', clearOnEdit);

  $('#mail-target-wrap').insertAdjacentHTML('beforeend', '<span id="mail-target-status" class="form-note" role="status"></span>');
  $('#mail-target').addEventListener('input', debounce(async () => {
    const id = $('#mail-target').value.trim();
    if (!id || !state.authenticated) return;
    feedback('mail-target-status', '正在验证目标账号…');
    try {
      const data = await latest('mail-target', `/api/admin/accounts/${encodeURIComponent(id)}`);
      if ($('#mail-target').value.trim() === id) {
        feedback(
          'mail-target-status',
          `✓ 已匹配居民：${data.account.username} · ${data.account.disabled ? '已停用（无法接收新邮件）' : `正常账号（${data.save ? `云档 rev ${data.save.revision}` : '暂无云档'}）`}`,
          data.account.disabled,
        );
      }
    } catch (e) {
      fail(e, 'mail-target-status');
    }
  }, 350));

  if (globalThis.__NIKKI_ADMIN_LOCAL_PREVIEW__) {
    const badge = '<span class="preview-badge">✦ 本地测试 · 虚构账号</span>';
    $('.gate-header')?.insertAdjacentHTML('beforeend', badge);
    $('.top-actions')?.insertAdjacentHTML('afterbegin', badge);
  }

  syncMailKindUi();
  syncMailAudienceUi();
  syncMailTemplateUi();
  if (storage.get(draftKey) || storedMailPending()) {
    updateDraftBarUi('本机有未发布草稿，点击「恢复本机草稿」可继续编辑或安全重试。');
  }

  (async () => {
    try {
      if (launchTicket) await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ ticket: launchTicket }) });
      else await api('/api/admin/session');
      showApp();
      await Promise.all([loadAccounts(), loadCatalog(), loadService(), loadTemplates()]);
    } catch (e) {
      state.token = '';
      showGate(launchTicket
        ? '临时登录票据已失效，请重新运行 npm run login-url 或启动脚本。'
        : e.status === 401
          ? '请输入管理员令牌，或使用一键启动脚本自动登录。'
          : e.message);
    }
  })();
})();
