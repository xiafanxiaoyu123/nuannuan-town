// 邮件摘要轮询独立于云存档。后台暂停，重连补查；只在安全时机提示一次。
export function startMailMonitor({ account, onSummary = () => {}, onNotice = () => {}, onReset = () => {}, canNotify = () => true, env = globalThis }) {
  const doc = env.document, nav = env.navigator, now = () => (env.Date || Date).now();
  let stopped = false, scope = '', generation = 0, timer = null, noticeTimer = null;
  let inFlight = null, controller = null, dirty = false, failures = 0, queued = null, lastRequest = -Infinity, summaryVersion = 0;
  const memory = new Map();
  const active = () => !stopped && !doc?.hidden && nav?.onLine !== false;
  const scopeOf = () => account.profile?.id && account.authStatus !== 'signed-out' ? (account.mailScope || String(account.profile.id)) : '';
  const storageKey = () => `nikki-mail-notice-v1:${encodeURIComponent(scope)}`;
  const readSeen = () => {
    try { return JSON.parse(env.localStorage?.getItem(storageKey()) || 'null') || memory.get(scope); }
    catch { return memory.get(scope); }
  };
  const idsOf = latest => [...new Set(Array.isArray(latest?.ids) ? latest.ids.map(String) : latest?.id ? [String(latest.id)] : [])];
  const remember = latest => {
    if (!latest) return;
    const seen = readSeen();
    const record = { ...latest, ids: [...new Set([...idsOf(latest), ...(Number(seen?.publishedAt) === Number(latest.publishedAt) ? idsOf(seen) : [])])] };
    memory.set(scope, record);
    try { env.localStorage?.setItem(storageKey(), JSON.stringify(record)); } catch { /* 存储受限时在本次会话去重。 */ }
  };
  const newer = (a, b) => a && (!b || Number(a.publishedAt) > Number(b.publishedAt)
    || (Number(a.publishedAt) === Number(b.publishedAt) && (Array.isArray(a.ids)
      ? idsOf(a).some(id => !idsOf(b).includes(id)) : String(a.id) > String(b.id))));
  const clearPoll = () => { if (timer !== null) env.clearTimeout(timer); timer = null; };
  const clearNotice = () => { if (noticeTimer !== null) env.clearTimeout(noticeTimer); noticeTimer = null; };
  function syncScope() {
    const next = scopeOf();
    if (scope === next) return;
    scope = next; generation++; controller?.abort(); controller = null;
    inFlight = null; dirty = false; failures = 0; queued = null; lastRequest = -Infinity;
    clearPoll(); clearNotice(); onReset();
  }
  function flushNotice() {
    clearNotice();
    if (!active() || !scope || !queued) return;
    if (!newer(queued.latest, readSeen())) { queued = null; return; }
    if (canNotify() && onNotice(queued) !== false) {
      remember(queued.latest); queued = null;
    } else noticeTimer = env.setTimeout(flushNotice, 1000);
  }
  function schedule() {
    clearPoll();
    if (!active() || !scope) return;
    const delay = failures ? Math.min(300000, 30000 * (2 ** Math.min(failures, 4))) : 45000 + Math.floor(Math.random() * 10000);
    timer = env.setTimeout(() => { refresh().catch(() => {}); }, delay);
  }
  function accept(summary) {
    onSummary(summary);
    if (Number(summary.pending) > 0 && newer(summary.latest, readSeen())) queued = summary;
    else {
      queued = null;
      if (newer(summary.latest, readSeen())) remember(summary.latest);
    }
    flushNotice();
  }
  function refresh({ force = false } = {}) {
    syncScope();
    if (!active() || !scope) return Promise.resolve(null);
    if (inFlight) { dirty ||= force; return inFlight; }
    clearPoll();
    const ticket = generation, version = summaryVersion;
    const abort = new AbortController(); controller = abort;
    const timeout = env.setTimeout(() => abort.abort(), 15000);
    lastRequest = now();
    const task = (async () => {
      try {
        // 会话恢复可能尚未进入真正的 fetch；abort 本身也必须结束本轮等待。
        const summary = await new Promise((resolve, reject) => {
          const cancel = () => reject(Object.assign(new Error('邮件检查已取消或超时'), { name: 'AbortError' }));
          abort.signal.addEventListener('abort', cancel, { once: true });
          Promise.resolve().then(() => account.mailSummary({ signal: abort.signal })).then(value => {
            abort.signal.removeEventListener('abort', cancel); resolve(value);
          }, error => { abort.signal.removeEventListener('abort', cancel); reject(error); });
        });
        if (stopped || ticket !== generation || version !== summaryVersion || scope !== scopeOf() || abort.signal.aborted) return null;
        failures = 0; accept(summary); return summary;
      } catch (error) {
        if (ticket === generation && !stopped && active()) failures++;
        return null; // 邮件故障不打断离线游玩；下次检查自动退避。
      } finally {
        env.clearTimeout(timeout);
        if (ticket === generation) {
          inFlight = null; controller = null;
          if (dirty && active()) { dirty = false; refresh().catch(() => {}); }
          else schedule();
        }
      }
    })();
    inFlight = task;
    return task;
  }
  function resume() {
    syncScope();
    if (!active()) { clearPoll(); clearNotice(); controller?.abort(); lastRequest = -Infinity; return; }
    flushNotice();
    if (now() - lastRequest > 2000) refresh({ force: !!controller?.signal.aborted }).catch(() => {});
    else schedule();
  }
  const changed = event => {
    if (!event.detail?.changed && !event.detail?.claimed) return;
    summaryVersion++; queued = null; clearNotice();
    refresh({ force: true }).catch(() => {});
  };
  const listeners = [
    [env, 'nuannuan:account', resume], [env, 'nuannuan:mail', changed],
    [env, 'focus', resume], [env, 'online', resume], [env, 'offline', resume],
    [doc, 'visibilitychange', resume],
  ];
  for (const [target, name, fn] of listeners) target?.addEventListener?.(name, fn);
  refresh().catch(() => {});
  return { refresh, flushNotice, stop() {
    stopped = true; generation++; controller?.abort(); queued = null;
    clearPoll(); clearNotice();
    for (const [target, name, fn] of listeners) target?.removeEventListener?.(name, fn);
  } };
}
