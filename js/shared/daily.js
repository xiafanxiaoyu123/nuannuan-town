// 每日订单的共享内容与字段约定。旧入口 live/data.js 会继续转出这些对象。
// ID、目标档位、奖励及表内顺序都属于现有玩法；顺序会影响日期种子的抽取结果。

/**
 * @typedef {'score' | 'stat' | 'endless'} DailyTaskType
 * @typedef {object} DailyDefinition
 * @property {string} id 稳定存档 ID。
 * @property {string} text 包含 {n} 的订单文案。
 * @property {DailyTaskType} type
 * @property {number[]} n 0–9、10–39、40 次及以上游玩的目标。
 * @property {number} reward 整数金币奖励。
 * @property {string} [shop] score 订单对应店铺。
 * @property {string} [stat] stat 订单对应累计统计。
 */

/**
 * @typedef {object} DailyRecord
 * @property {string} id
 * @property {number} n 正整数目标。
 * @property {number} base 非负整数统计基线。
 * @property {number} prog 非负进度；只有 endless 可以为小数秒。
 * @property {boolean | 0 | 1} claimed 保留旧档兼容的领取标记。
 */

/** @type {DailyDefinition[]} */
export const DAILY_POOL = [
  { id: 'd_cafe', text: '在甜心咖啡屋单局营业额达到 {n}', type: 'score', shop: 'cafe', n: [120, 180, 260], reward: 120 },
  { id: 'd_flower', text: '在花语小筑单局营业额达到 {n}', type: 'score', shop: 'flower', n: [100, 160, 230], reward: 120 },
  { id: 'd_tailor', text: '在星梦裁缝铺单局营业额达到 {n}', type: 'score', shop: 'tailor', n: [100, 150, 200], reward: 120 },
  { id: 'd_fish', text: '在悠然钓场钓到 {n} 条鱼', type: 'stat', stat: 'fish_caught', n: [4, 6, 9], reward: 110 },
  { id: 'd_harvest', text: '收获作物或摘果子 {n} 次', type: 'stat', stat: 'harvested', n: [6, 10, 16], reward: 90 },
  { id: 'd_fruit', text: '摘 {n} 个果子', type: 'stat', stat: 'fruits', n: [3, 6, 9], reward: 100 },
  { id: 'd_req', text: '完成 {n} 个居民委托', type: 'stat', stat: 'reqs', n: [1, 2, 3], reward: 140 },
  { id: 'd_talk', text: '和居民聊天 {n} 次', type: 'stat', stat: 'npc_talk', n: [3, 5, 8], reward: 60 },
  { id: 'd_stage', text: '关卡模式过 {n} 关（可重打）', type: 'stat', stat: 'stage_clears', n: [1, 2, 3], reward: 150 },
  { id: 'd_endless', text: '无尽模式坚持 {n} 秒', type: 'endless', n: [60, 90, 150], reward: 150 },
  { id: 'd_wish', text: '对喷泉许愿 {n} 次', type: 'stat', stat: 'wishes', n: [2, 3, 5], reward: 50 },
  { id: 'd_decor', text: '摆放 {n} 件家具', type: 'stat', stat: 'placed', n: [1, 2, 3], reward: 80 },
];

export const DAILY_TASK_COUNT = 3;
export const DAILY_CHEST = { need: 3, coins: 300, note: '做完当天 3 个订单可开' };

/** @returns {DailyDefinition | undefined} */
export const dailyDefinition = (id) => DAILY_POOL.find((definition) => definition.id === id);

// prog 的单位由订单类型决定：无尽是有限非负秒数（可带小数），其余是整数计数。
// 最大值、非负和有限数值仍由通用存档数字校验器检查，不能只检查整数属性。
export const dailyProgressIsInteger = (definition) => definition.type !== 'endless';
