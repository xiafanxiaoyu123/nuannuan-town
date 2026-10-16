// 已发布数据的窄迁移。只处理有明确含义的历史字段；不读存储、不发奖励。
// 客户端导入、启动与服务端预检共用，重复执行不会重复合并物品或订单进度。
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const recorded = (value, key) => record(value) && Object.hasOwn(value, key) ? value[key] : 0;

export const PHOTO_THEMES = Object.freeze([
  Object.freeze({ id: 'sunset', name: '晴空风车原野', sky: '#bfe6ff', hill: '#98de9b', sun: '#ffe066' }),
  Object.freeze({ id: 'sakura', name: '春日樱吹雪', sky: '#ffd6e5', hill: '#8fd9a8', sun: '#fff3b0' }),
  Object.freeze({ id: 'starry', name: '星夜月见湾', sky: '#3b4371', hill: '#5c7a99', sun: '#f6d365' }),
  Object.freeze({ id: 'meadow', name: '暖阳向日葵丘', sky: '#ffe5b4', hill: '#e8a87c', sun: '#ff7f50' }),
]);

// 历史数字按原模型的 %4 映射显示，存档仍保留原数字，不改写家具/布局内容。
export function photoThemeIndex(value) {
  if (value === undefined) return 0;
  if (count(value) && value <= 20) return value % PHOTO_THEMES.length;
  return PHOTO_THEMES.findIndex(theme => theme.id === value);
}
export const photoThemeId = value => PHOTO_THEMES[photoThemeIndex(value)]?.id;

export const fertilizerCount = state => count(state.stats?.fertilizer) ? state.stats.fertilizer : 0;
export function addFertilizer(state, amount = 1) {
  if (!count(amount) || !Number.isSafeInteger(fertilizerCount(state) + amount)) throw new Error('花肥数量无效');
  state.stats = state.stats || {};
  state.stats.fertilizer = fertilizerCount(state) + amount;
  return state.stats.fertilizer;
}
export function useFertilizer(state) {
  if (!fertilizerCount(state)) return false;
  state.stats.fertilizer--;
  return true;
}

const MARKET_STATS = Object.freeze({ games: 'plays', harvest: 'harvested' });
export function migrateMarketOrders(data) {
  if (!record(data.live?.market) || !Array.isArray(data.live.market.orders)) return data;
  let changed = false;
  const orders = data.live.market.orders.map(order => {
    if (!record(order) || !MARKET_STATS[order.stat]) return order;
    const stat = MARKET_STATS[order.stat], actual = recorded(data.stats, stat);
    const legacy = recorded(data.stats, order.stat), base = recorded(order, 'base');
    // 畸形字段交给严格校验报错，不能以迁移为名擦掉坏数据。
    if (![actual, legacy, base, recorded(order, 'carriedProgress'), recorded(order, 'prog'), recorded(order, 'cur')].every(count)) return order;
    // 旧订单没有记录正确统计的创建时总量，无法反推本周起点。
    // 只保留可证实的旧计数/已记录进度，再锚定当前总量，避免把历史总数当成本周奖励。
    const progress = Math.max(0, legacy - base, recorded(order, 'prog'), recorded(order, 'cur'), recorded(order, 'carriedProgress'));
    changed = true;
    return { ...order, stat, base: actual, carriedProgress: progress };
  });
  return changed ? { ...data, live: { ...data.live, market: { ...data.live.market, orders } } } : data;
}

export function prepareCompatibleSave(data) {
  if (!record(data)) return data;
  let next = data;
  if (record(data.seeds) && Object.hasOwn(data.seeds, 'fertilizer')) {
    const old = data.seeds.fertilizer, current = recorded(data.stats, 'fertilizer');
    // 两个历史位置来自不同领取入口；相加保留尚未消耗的数量。
    // 删除旧键即为迁移标记，反复预览/导入/重载不会再次增加。
    if (count(old) && count(current) && Number.isSafeInteger(old + current) && (data.stats === undefined || record(data.stats))) {
      const seeds = { ...data.seeds }; delete seeds.fertilizer;
      next = { ...data, seeds, stats: { ...(data.stats || {}), fertilizer: old + current } };
    }
  }
  return migrateMarketOrders(next);
}
