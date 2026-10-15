// 「来访搭配记录」纯逻辑样板：原创任务规则，不含角色台词、外观或运行时注册。
// 无全局状态、存档、时钟、网络或事件副作用；资料核验完成前不接入正式游戏。
export const RECORD_TASK = Object.freeze({ id: 'canon_dada_record_01', version: 1, reward: 80 });

const SLOTS = ['hair', 'dress', 'shoes', 'acc', 'back'];
const COUNTERS = ['watered', 'fish_caught'];
const ACTIVITIES = [...COUNTERS, 'played'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const time = (v) => Number.isSafeInteger(v) && v > 0;
const absent = (v) => v === null || v === undefined;

// 由调用方传当前服饰表及全部已注册店铺ID；已开放店铺另从每次上下文读取。
export function createRecordRules({ clothes, shopIds }) {
  const cats = new Map(clothes.map((c) => [c.id, c.cat]));
  const shops = new Set(shopIds);
  const validOutfit = (o) => object(o) && SLOTS.every((slot) =>
    Object.hasOwn(o, slot) && typeof o[slot] === 'string' && cats.get(o[slot]) === slot);
  const totals = (stats) => {
    if (!absent(stats) && !object(stats)) return null;
    const values = Object.fromEntries(COUNTERS.map((key) => [key,
      stats && Object.hasOwn(stats, key) ? stats[key] : 0]));
    return COUNTERS.every((key) => count(values[key])) ? values : null;
  };
  const latestAt = (r) => Math.max(r.acceptedAt, r.outfit?.at || 0,
    ...ACTIVITIES.map((key) => r.events[key]?.at || 0));

  // 只检查当前版本的完整记录。损坏/未来版本不重置为可接状态，避免丢失领取标记。
  function valid(r) {
    if (!object(r) || r.id !== RECORD_TASK.id || r.version !== RECORD_TASK.version ||
      !time(r.acceptedAt) || !object(r.base) || !object(r.events)) return false;
    if (!COUNTERS.every((key) => count(r.base[key]))) return false;
    if (r.outfit !== null && (!object(r.outfit) || !time(r.outfit.at) ||
      r.outfit.at < r.acceptedAt || !validOutfit(r.outfit.items))) return false;
    for (const key of ACTIVITIES) {
      const e = r.events[key];
      if (e === null) continue;
      if (!object(e) || !time(e.at) || e.at < r.acceptedAt) return false;
      if (key === 'played') {
        if (typeof e.shop !== 'string' || !shops.has(e.shop)) return false;
      } else if (!count(e.value) || e.value <= r.base[key]) return false;
    }
    if (r.activity !== null && (!ACTIVITIES.includes(r.activity) || !r.events[r.activity])) return false;
    if (r.archivedAt !== null && (!time(r.archivedAt) || !r.outfit || !r.activity ||
      r.archivedAt < latestAt(r))) return false;
    return true;
  }

  function status(record) {
    if (absent(record)) return 'offer';
    if (!valid(record)) return 'invalid';
    if (record.archivedAt !== null) return 'archived';
    return record.outfit && record.activity ? 'ready' : 'active';
  }

  // context只应来自同一份当前存档：{now, stats, outfit, owned, openShops}。
  // stats在真实统计更新后读取；played.event原样取正常结算事件，不能由面板捏造。
  // 返回coins只是发奖意图，不会改余额。调用方必须先提交新record，再发币/广播，
  // 且每次使用最新record。旧闭包、跨存档回调及持久化事务须在未来接线层另行处理。
  function step(record, action, context = {}) {
    const unchanged = (reason) => ({ record, changed: false, coins: 0, reason });
    const changed = (next, reason, coins = 0) => ({ record: next, changed: true, coins, reason });
    const state = status(record);
    if (state === 'invalid') return unchanged('invalid_record');
    if (state === 'archived') return unchanged('archived');
    if (!object(action) || typeof action.type !== 'string') return unchanged('invalid_action');
    if (action.type === 'accept' && state !== 'offer') return unchanged('already_accepted');
    if (action.type !== 'accept' && state === 'offer') return unchanged('not_accepted');
    if (!object(context) || !time(context.now) ||
      (state !== 'offer' && context.now < latestAt(record))) return unchanged('invalid_time');
    const now = context.now;

    if (action.type === 'accept') {
      const base = totals(context.stats);
      if (!base) return unchanged('invalid_stats');
      return changed({
        id: RECORD_TASK.id, version: RECORD_TASK.version, acceptedAt: now, base,
        outfit: null, events: { watered: null, fish_caught: null, played: null },
        activity: null, archivedAt: null,
      }, 'accepted');
    }
    if (action.type === 'outfit') {
      if (!validOutfit(context.outfit) || !Array.isArray(context.owned)) return unchanged('invalid_outfit');
      const owned = new Set(context.owned);
      if (!SLOTS.every((slot) => owned.has(context.outfit[slot]))) return unchanged('unowned_outfit');
      const items = Object.fromEntries(SLOTS.map((slot) => [slot, context.outfit[slot]]));
      if (record.outfit && SLOTS.every((slot) => record.outfit.items[slot] === items[slot])) {
        return unchanged('same_outfit');
      }
      return changed({ ...record, outfit: { at: now, items } }, 'outfit_recorded');
    }
    if (action.type === 'stats') {
      const current = totals(context.stats);
      if (!current) return unchanged('invalid_stats');
      const events = { ...record.events };
      let found = false;
      for (const key of COUNTERS) {
        if (!events[key] && current[key] > record.base[key]) {
          // 记录首次观察到的实际总数；at是观察时间，不伪称精确发生时间。
          events[key] = { at: now, value: current[key] };
          found = true;
        }
      }
      return found ? changed({ ...record, events }, 'activity_observed') : unchanged('no_new_activity');
    }
    if (action.type === 'played') {
      const e = action.event;
      if (!object(e) || typeof e.id !== 'string' || !shops.has(e.id) ||
        !Array.isArray(context.openShops) || !context.openShops.includes(e.id)) return unchanged('invalid_shop');
      // 关闭结算面板才送出的旧局不补算；跨日送达的新局仍按真实结束时刻判断。
      if (!time(e.endedAt) || e.endedAt < record.acceptedAt || e.endedAt > now) return unchanged('invalid_ended_at');
      if (record.events.played) return unchanged('already_observed');
      return changed({ ...record, events: { ...record.events, played: { at: e.endedAt, shop: e.id } } }, 'activity_observed');
    }
    if (action.type === 'select') {
      if (!ACTIVITIES.includes(action.kind) || !record.events[action.kind]) return unchanged('unavailable_activity');
      if (record.activity === action.kind) return unchanged('same_activity');
      return changed({ ...record, activity: action.kind }, 'activity_selected');
    }
    if (action.type === 'archive') {
      if (state !== 'ready') return unchanged('not_ready');
      return changed({ ...record, archivedAt: now }, 'archived', RECORD_TASK.reward);
    }
    return unchanged('invalid_action');
  }

  return Object.freeze({ status, step });
}
