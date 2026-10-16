// 账号、云冲突与邮件面板；保留原会话归属检查和关闭清理。
// 由 ui.js 的具名方法使用 .apply(this, arguments) 调用；不安装原型、不创建单例。
import { h, fmt } from '../core/util.js';
import { S } from '../core/state.js';
import { isBuildRoof } from '../world/yard-building.js';
import { MAX_BUILD_FLOOR } from '../world/build-constants.js';
import { live } from '../live/api.js';
import { saveTransferPanel } from './save-transfer.js';
import { account, accountSummary as currentAccountSummary } from '../core/account.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';
import { click } from './components/actions.js';

export function refreshAccountUi() {
  if (this.accountStatus) this.accountStatus.textContent = currentAccountSummary();
  if (this.accountEntry) this.accountEntry.textContent = currentAccountSummary();
}

export function canShowMailNotice() {
  return !!S.started && !this.title && !this.game?.busy && this.modals === 0
    && !document.hidden && !document.body.classList.contains('clean-screenshot');
}

export function mailNotice(summary) {
  const owner = account.profile?.id;
  if (!owner || !this.canShowMailNotice()) return false;
  this._mailNotice?.remove();
  this._mailNotice = this.toast(Number(summary?.unclaimed) > 0 ? '收到新邮件，有礼包等待领取' : '收到新邮件', {
    kind: 'mail-notice', life: 6500, action: '查看邮件',
    onAction: () => { if (account.profile?.id === owner && this.canShowMailNotice()) this.mailPanel(); },
  });
  return true;
}

export async function refreshMailBadge(summary) {
  if (!this.mailBtn) return;
  const label = this.mailBtn.querySelectorAll('span')[1];
  const owner = account.profile?.id;
  if (!owner) summary = {};
  else if (summary === undefined) {
    try { summary = await account.mailSummary(); }
    catch { return; /* 暂时断网保留上次提醒，不把未知状态当作零封邮件。 */ }
    if (account.profile?.id !== owner) return;
  }
  const pending = Math.max(0, Number(summary?.pending) || 0);
  const unclaimed = Math.max(0, Number(summary?.unclaimed) || 0);
  if (!pending) { this._mailNotice?.remove(); this._mailNotice = null; }
  if (label) label.textContent = pending ? `邮件 · ${pending}` : '邮件';
  this.mailBtn.classList.toggle('has-mail', pending > 0);
  this.mailBtn.classList.toggle('has', pending > 0);
  this.mailBtn.setAttribute('aria-label', pending ? `邮件，${pending} 封待处理，${unclaimed} 份礼包待领取` : '邮件');
  this._mailPanelSummary?.(summary || {});
}

export function accountSessionPanel(kind) {
  if (this._accountAccessModal && !this._accountAccessModal.veil._closed) return this._accountAccessModal;
  let modal, verifying = false;
  const status = h('p', { class: 'fine', 'aria-live': 'polite' }, '正在确认登录状态…');
  const retry = h('button', { class: 'btn', hidden: true, onclick: click(() => verify()) }, '重新连接');
  const verify = async () => {
    if (verifying || modal.veil._closed) return;
    verifying = true;
    retry.disabled = true;
    status.textContent = '正在确认登录状态…';
    try {
      const user = await account.ensureSession();
      if (modal.veil._closed) return;
      modal.close(true);
      this._accountAccessModal = kind === 'mail' && user ? this.showMailPanel() : this.showAccountPanel();
    } catch (error) {
      if (modal.veil._closed) return;
      status.textContent = `暂时无法连接账号服务，已有账号和本机进度会保留。${error.message || '请检查网络后重试。'}`;
      retry.hidden = false;
    } finally { verifying = false; retry.disabled = false; }
  };
  modal = this.modal(h('div', { class: 'account-session' }, h('h2', {}, kind === 'mail' ? '邮件中心' : '账号与云存档'), status, retry), { ribbon: kind === 'mail' ? 'MAIL' : 'ACCOUNT' });
  this._accountAccessModal = modal;
  verify();
  return modal;
}

export function mailPanel() { return this.accountSessionPanel('mail'); }

export function showMailPanel() {
  if (this._mailPanel && !this._mailPanel.veil._closed) return this._mailPanel;
  const owner = account.profile?.id;
  if (!owner) return this.accountPanel();
  let modal, busy = false, messages = [], nextCursor = null, summary = {};
  const list = h('div', { class: 'mail-list' }, h('div', { class: 'mail-loading' }, '正在收取邮件…'));
  const counts = h('p', { class: 'mail-counts', 'aria-live': 'polite' }, '正在确认邮件状态…');
  const status = h('p', { class: 'mail-status', role: 'status', 'aria-live': 'polite' });
  const active = () => !!modal && !modal.veil._closed && account.profile?.id === owner;
  const attachmentText = item => (item.ops || []).map(op => op.type === 'coins' ? `噗灵 +${fmt(op.amount)}` : op.type === 'owned' ? `解锁 ${op.ids.length} 件物品` : `${op.type} ${Object.values(op.items || {}).reduce((a, b) => a + b, 0)} 份`).join('、');
  const refresh = h('button', { class: 'btn alt sm', type: 'button', 'data-mail-action': 'refresh', onclick: click(() => load(false)) }, '刷新');
  const claimAll = h('button', { class: 'btn sm', type: 'button', 'data-mail-action': 'claim-all', onclick: click(() => mutate('all')) }, '一键领取');
  const more = h('button', { class: 'btn alt sm', type: 'button', hidden: true, 'data-mail-action': 'more', onclick: click(() => load(true)) }, '加载更多');
  const setStatus = (text, warning = false) => { status.textContent = text; status.setAttribute('role', warning ? 'alert' : 'status'); };
  const updateButtons = () => {
    if (!modal) return;
    modal.box.querySelectorAll('.mailbox button').forEach(button => { button.disabled = busy; });
    claimAll.disabled = busy || !(Number(summary.unclaimed) > 0);
    more.hidden = !nextCursor;
    list.setAttribute('aria-busy', String(busy));
  };
  const applySummary = value => {
    if (!active()) return;
    summary = value;
    counts.textContent = `未读 ${Number(value.unread) || 0} 封 · 待领取 ${Number(value.unclaimed) || 0} 份 · 共 ${Number(value.total) || 0} 封`;
    updateButtons();
  };
  const render = () => {
    const cards = messages.length ? messages.map((item) => {
      return h('article', { class: `mail-item${item.readAt ? '' : ' unread'}`, 'data-mail-id': item.id },
        h('div', { class: 'mail-meta' }, h('b', {}, item.kind === 'gift' ? '礼包邮件' : '公告'), h('small', {}, new Date(item.createdAt).toLocaleString('zh-CN'))),
        h('h3', {}, item.title),
        h('div', { class: 'mail-tags' }, h('span', { class: `mail-tag ${item.readAt ? 'is-read' : 'is-unread'}` }, item.readAt ? '已读' : '未读'),
          item.kind === 'gift' && h('span', { class: `mail-tag ${item.claimedAt ? 'is-claimed' : 'is-pending'}` }, item.claimedAt ? '已领取' : '待领取')),
        h('p', {}, item.body),
        item.kind === 'gift' && h('div', { class: 'mail-attachment' }, `附件：${attachmentText(item)}`),
        h('div', { class: 'mail-actions' },
          !item.readAt && h('button', { class: 'btn alt sm', type: 'button', 'data-mail-action': 'read', onclick: click(() => mutate('read', item)) }, '标为已读'),
          item.kind === 'gift' && !item.claimedAt && h('button', { class: 'btn sm', type: 'button', 'data-mail-action': 'claim', onclick: click(() => mutate('claim', item)) }, '领取礼包'),
          item.claimedAt && h('span', { class: 'mail-claimed' }, '已领取')));
    }) : [h('div', { class: 'mail-empty' }, '暂时没有新邮件')];
    list.replaceChildren(...cards);
    updateButtons();
  };
  const fetchPage = async append => {
    const result = await account.mailList({ limit: 20, ...(append && nextCursor ? { cursor: nextCursor } : {}) });
    if (!active()) return;
    const incoming = result.messages || [];
    messages = append ? [...new Map([...messages, ...incoming].map(item => [item.id, item])).values()] : incoming;
    nextCursor = result.nextCursor || null;
    this.refreshMailBadge(result);
    render();
  };
  const load = async append => {
    if (!active() || busy || (append && !nextCursor)) return;
    busy = true; updateButtons(); setStatus(append ? '正在加载更多…' : '正在刷新邮件…');
    try { await fetchPage(append); if (active()) setStatus(`已显示 ${messages.length} 封${nextCursor ? '，下方可继续加载' : ''}`); }
    catch (error) {
      if (!active()) return;
      setStatus(`${error.message || '邮件暂时无法加载'}，请稍后点击刷新。`, true);
      if (!messages.length) list.replaceChildren(h('div', { class: 'mail-empty' }, '暂时无法收取邮件，本机进度已保留。'));
    } finally { if (active()) { busy = false; updateButtons(); } }
  };
  const mutate = async (action, item) => {
    if (!active() || busy) return;
    busy = true; updateButtons(); setStatus(action === 'read' ? '正在标记已读…' : '正在领取，请稍候…');
    try {
      const result = action === 'all' ? await account.mailClaimAll() : action === 'read' ? await account.mailRead(item.id) : await account.mailClaim(item.id);
      if (!active()) return;
      const success = action === 'read' ? '已标为已读，未领取的礼包会继续提醒。' : action === 'all' ? `已领取 ${Number(result.count) || 0} 份礼包并同步到云存档。` : '礼包已领取并同步到云存档。';
      if (action === 'all') {
        const claimed = new Set(result.messageIds || []);
        for (const row of messages) if (claimed.has(row.id)) row.readAt = row.claimedAt = result.claimedAt || Date.now();
      } else {
        item.readAt = result.readAt || result.claim?.claimedAt || Date.now();
        if (action === 'claim') item.claimedAt = result.claim?.claimedAt || Date.now();
      }
      render();
      try {
        if (action === 'all') await fetchPage(false);
        // 已读和领奖均从服务端重新确认摘要；已读礼包仍应保留待领取红点。
        else { const value = await account.mailSummary(); if (active()) this.refreshMailBadge(value); }
      } catch {
        if (active()) setStatus(`${success} 邮件状态暂时未能刷新，稍后点击刷新即可。`, true);
        return; // 领取已成功，摘要网络失败不能被表述为领取失败。
      }
      if (!active()) return;
      setStatus(success);
    } catch (error) {
      if (!active()) return;
      // 一键领取可能已有部分成功；重新获取服务端结果，绝不把整批假定为未领取。
      let refreshed = false;
      try { await fetchPage(false); refreshed = true; } catch { /* 保留已显示列表，允许之后手动刷新。 */ }
      const partial = Number(error.claimedCount) > 0 ? `已确认领取 ${Number(error.claimedCount)} 份礼包，已领取内容不会重复发放。` : '';
      if (active()) setStatus(`${partial}${error.message || '操作暂时未完成'}。${refreshed ? `已刷新邮件状态，可重试${action === 'read' ? '标记已读' : '剩余礼包'}。` : '邮件状态暂时未能刷新，请稍后点击刷新确认。'}`, true);
    } finally { if (active()) { busy = false; updateButtons(); } }
  };
  const onAccount = () => { if (account.profile?.id !== owner) modal.close(true); };
  modal = this.modal(h('div', { class: 'mailbox' }, h('h2', {}, '邮件中心'),
    h('p', { class: 'fine' }, '礼包领取后写入云存档，不能重复领取。看过的礼包在领取前仍会提醒。'), counts,
    h('div', { class: 'mail-toolbar' }, refresh, claimAll), status, list,
    h('div', { class: 'mail-more' }, more)), {
    ribbon: 'MAIL', cls: 'mail-modal',
    onClose: () => {
      globalThis.removeEventListener?.('nuannuan:account', onAccount);
      if (this._mailPanel === modal) { this._mailPanel = null; this._mailPanelSummary = null; }
    }
  });
  this._mailPanel = modal;
  this._mailPanelSummary = applySummary;
  globalThis.addEventListener?.('nuannuan:account', onAccount);
  load(false);
  return modal;
}

export function accountSummary(data) {
  if (!data) return '暂无';
  const d = data.data || data;
  const pieces = d.buildPlaced || [], levels = pieces.reduce((max, e) => Math.max(max, isBuildRoof(e.id) ? Math.min(MAX_BUILD_FLOOR + 1, e.level || 0) : Math.min(MAX_BUILD_FLOOR + 1, (e.level || 0) + 1)), 0);
  const island = d.buildQuest?.stage === 3 && d.buildQuest?.rewarded ? '已开放' : ['未接邀请', '准备便当', '等待首航'][d.buildQuest?.stage || 0] || '未开放';
  const plans = (d.decorLayouts?.build || []).filter(Boolean).length;
  return `噗灵 ${fmt(d.coins || 0)} · 第 ${d.gday || 0} 天 · 房屋 Lv.${d.house || 1} · 海风岛${island} · ${pieces.length} 件摆放 / 最高 ${levels} 楼 / ${plans} 套方案`;
}

export function accountConflictPanel(result) {
  if (this._accountConflict && !this._accountConflict.modal.veil._closed) {
    this._accountConflict.update(result);
    return this._accountConflict.modal;
  }
  let m;
  const entry = { busy: false, resolved: false, modal: null };
  const localSummary = h('span');
  const cloudSummary = h('span');
  const status = h('p', { class: 'fine', 'aria-live': 'polite' });
  entry.update = (next) => {
    entry.result = next;
    localSummary.textContent = this.accountSummary(next.local);
    cloudSummary.textContent = this.accountSummary(next.cloud);
    status.textContent = '同步已暂停，请选择要保留的进度，也可以稍后再处理。';
  };
  entry.update(result);
  const setBusy = (busy) => {
    entry.busy = busy;
    m?.box.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
  };
  const closeAnd = async (choice) => {
    if (entry.busy || m.veil._closed) return;
    setBusy(true);
    status.textContent = '正在同步，请稍候…';
    try {
      const r = await account.resolveSync(choice);
      if (r.kind === 'conflict') { entry.update(r); return r; }
      if (r.kind !== choice) {
        status.textContent = '这次同步尚未完成，进度已保留，请稍后重试。';
        this.handleSyncResult(r);
        return r;
      }
      entry.resolved = true;
      setBusy(false);
      m.close(true);
      if (r.kind === 'cloud') {
        this.toast('已使用云端进度，正在重新载入');
        setTimeout(() => location.reload(), 220);
      } else if (r.kind === 'local') this.toast('已将本机进度上传到云端');
      return r;
    } catch (error) {
      if (error.status === 409 && error.body?.conflict) entry.update({ kind: 'conflict', cloud: error.body.conflict, local: entry.result.local });
      else status.textContent = error.message || '同步失败，进度已保留，请稍后重试。';
      this.toast(error.message || '同步失败，请稍后重试', { kind: 'warn', life: 4200 });
    } finally { setBusy(false); }
  };
  m = this.modal(h('div', { class: 'account conflict' },
    h('h2', {}, '发现两份进度'),
    h('p', {}, '本机和云端都有存档。为了避免金币、任务或家具被悄悄覆盖，请选择要保留的版本。'),
    h('div', { class: 'account-compare' },
      h('div', {}, h('b', {}, '本机进度'), localSummary),
      h('div', {}, h('b', {}, '云端进度'), cloudSummary)),
    status,
    h('div', { class: 'row account-actions' },
      h('button', { class: 'btn alt', onclick: click(() => closeAnd('local')) }, '保留本机并上传'),
      h('button', { class: 'btn', onclick: click(() => closeAnd('cloud')) }, '使用云端进度')),
    h('button', { class: 'btn alt sm', onclick: click(() => m.close(true)) }, '稍后处理'),
    h('p', { class: 'fine' }, '选择云端时，本机版本会在此设备保留一份“登录前备份”；选择本机时，云端会生成新版本。稍后处理会暂停同步，不会退出账号。')), {
      ribbon: '云存档冲突', beforeClose: () => !entry.busy,
      onClose: () => {
        if (this._accountConflict === entry) this._accountConflict = null;
        if (!entry.resolved) Promise.resolve(account.resolveSync('cancel')).catch((error) => this.toast(error.message || '暂停同步失败，请稍后重试', { kind: 'warn' }));
      },
    });
  entry.modal = m;
  this._accountConflict = entry;
  return m;
}

export function handleSyncResult(result) {
  if (!result) return;
  if (result.kind === 'conflict') return this.accountConflictPanel(result);
  if (result.kind === 'sync-error') {
    this.refreshAccountUi();
    this.toast(`账号已登录，云存档暂未同步：${result.error?.message || result.message || '请检查网络后在账号面板重试。'}`, { kind: 'warn', life: 5000 });
    return;
  }
  if (result.kind === 'premium-required') {
    this.refreshAccountUi();
    if (result.interactive) this.toast('云同步当前未开放，本机进度已保留，可在设置中导出 / 导入', { life: 4200 });
    return;
  }
  if (result.kind === 'downloaded-cloud') {
    if (S.started) return setTimeout(() => location.reload(), 180);
    this.refreshTitle();
    this.toast('已加载云端进度');
  } else if (result.kind === 'uploaded-local') this.toast('本机进度已上传到云端');
}

export function accountPanel() { return LOCAL_PLAY ? this.localPlayPanel() : this.accountSessionPanel('account'); }

export function localPlayPanel() {
  if (!LOCAL_PLAY || this.game.busy) return;
  let modal;
  const go = (zone) => { modal.close(true); this.game.localPlayTravel(zone); };
  modal = this.modal(h('div', { class: 'local-play-panel' },
    h('h2', {}, '本地自由试玩'),
    h('p', {}, '建造岛已开放，家具不限量，购买和建造免费。全部服饰、店铺关卡、房屋扩建和拍照工具均已解锁。'),
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '.6rem' } },
      h('button', { class: 'btn', 'data-local-travel': 'build', onclick: () => go('build') }, '直达建造岛'),
      h('button', { class: 'btn alt', 'data-local-travel': 'house', onclick: () => go('house') }, '进入小屋'),
      h('button', { class: 'btn alt', 'data-local-travel': 'home', onclick: () => go('home') }, '前往后院'),
      h('button', { class: 'btn alt', 'data-local-travel': 'town', onclick: () => go('town') }, '返回小镇')),
    h('p', { class: 'fine' }, '试玩自动保存到本机独立存档。建筑保留五格承重、拆除保护及室内外摆放规则。'),
    h('button', { class: 'btn alt sm', onclick: () => { modal.close(true); this.cheatPanel(); } }, '作物催熟 / 切换昼夜')),
    { ribbon: '自由试玩' });
  return modal;
}

export function showAccountPanel() {
  let m;
  if (account.profile) {
    const status = h('p', { class: 'fine account-service-status', 'aria-live': 'polite' }, '正在获取云同步状态…');
    const refresh = async () => {
      refreshBtn.disabled = true;
      try {
        const access = await account.refreshEntitlements();
        status.textContent = (access.freeEntitlements ? '当前限免开放，所有账号统一使用，无需付费。' : '')
          + (access.cloudSync ? '云存档已启用。' : '云同步当前未开放，本机进度已保留。')
          + (access.autoUpdate ? '客户端更新服务已启用。' : '可通过官网手动下载更新。');
      } catch (error) {
        status.textContent = '暂时无法刷新服务状态，本机进度已保留。' + (error.message || '请稍后重试。');
      } finally { refreshBtn.disabled = false; }
    };
    const refreshBtn = h('button', { class: 'btn alt sm', onclick: click(refresh) }, '刷新状态');
    const syncBtn = h('button', { class: 'btn', onclick: click(async () => {
      if (syncBtn.disabled) return;
      syncBtn.disabled = true;
      try { const r = await account.prepareSync(); m.close(true); this.handleSyncResult({ ...r, interactive: true }); }
      catch (error) { this.toast(error.message || '同步失败', { kind: 'warn' }); }
      finally { syncBtn.disabled = false; }
    }) }, '立即同步');
    const body = h('div', { class: 'account' },
      h('h2', {}, '账号与云存档'),
      h('p', {}, `当前账号：${account.profile.username}`),
      status, refreshBtn,
      h('div', { class: 'row account-actions' },
        syncBtn,
        h('button', { class: 'btn alt', onclick: click(() => { m.close(true); saveTransferPanel(this); }) }, '导出 / 导入存档'),
        h('button', { class: 'btn alt', onclick: click(async () => { await account.logout(); m.close(true); this.refreshTitle(); this.toast('已退出账号'); }) }, '退出账号')),
      h('p', { class: 'fine' }, '多台设备登录同一账号即可同步进度。有不同存档时会先让你选择，不会悄悄覆盖。本机导出 / 导入仍可用于手动备份，请使用不重复的密码。'));
    m = this.modal(body, { ribbon: 'ACCOUNT' });
    refresh();
    return m;
  }
  const username = h('input', { class: 'account-input', type: 'text', autocomplete: 'username', placeholder: '用户名（3-32位）', maxlength: '32' });
  const password = h('input', { class: 'account-input', type: 'password', autocomplete: 'current-password', placeholder: '密码（至少8位）', maxlength: '128' });
  const tip = h('p', { class: 'fine account-tip' }, '未登录时进度保存在本机，登录后获取最新的云同步状态。');
  const policy = h('p', { class: 'fine account-policy', 'aria-live': 'polite' }, '正在获取服务状态…');
  account.accessPolicy().then((value) => {
    policy.textContent = value.freeEntitlements ? '当前限免开放：所有账号统一使用云存档和客户端更新，无需付费。' : '账号服务状态以登录后的显示为准。';
  }).catch(() => { policy.textContent = '暂时无法获取服务状态，你仍可继续本机游玩。'; });
  let submitting = false;
  const submit = async (mode) => {
    if (submitting) return;
    const u = username.value.trim(), p = password.value;
    if (!u || !p) { tip.textContent = '请填写用户名和密码。'; return; }
    submitting = true;
    username.disabled = password.disabled = true;
    try {
      const r = mode === 'register' ? await account.register(u, p) : await account.login(u, p);
      m.close(true); this.refreshTitle(); this.handleSyncResult(r);
      if (r.kind !== 'premium-required' && r.kind !== 'conflict' && r.kind !== 'downloaded-cloud' && r.kind !== 'sync-error') this.toast(mode === 'register' ? '账号已创建，云存档已准备好' : '登录成功');
    } catch (error) {
      username.disabled = password.disabled = false;
      tip.textContent = error.message || '操作失败，请稍后重试';
    } finally { submitting = false; }
  };
  m = this.modal(h('div', { class: 'account' },
    h('h2', {}, '账号与云存档'),
    h('p', {}, '登录同一账号，在手机、电脑和网页版继续你的小镇进度。'),
    policy,
    username, password,
    h('div', { class: 'row account-actions' },
      h('button', { class: 'btn', onclick: click(() => submit('login')) }, '登录'),
      h('button', { class: 'btn alt', onclick: click(() => submit('register')) }, '注册账号')),
    tip,
    h('p', { class: 'fine' }, '不登录也能离线游玩，设置中的导出 / 导入存档继续保留。请勿使用与其他网站相同的密码。')), { ribbon: 'ACCOUNT' });
  return m;
}
