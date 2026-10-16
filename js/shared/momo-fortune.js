// 大喵亲密应援与签筒共用的纯数据规则。日期沿用镇历，不读取时钟、存储或运行中的 S。
import { gameDate } from './calendar.js';

export const FORTUNES = Object.freeze([
  ['大吉', '今天做什么都顺手，连大喵都抢不到你的可颂。'], ['大吉', '今天钓上来的鱼，会比昨天大一圈。'],
  ['中吉', '穿上喜欢的那身出门，会有人夸你。'], ['中吉', '浇过水的田不会辜负你，下午去看看。'],
  ['小吉', '路过喷泉记得许个愿，数到七会有回礼。'], ['小吉', '今天适合整理衣橱，旧衣服也能搭出新花样。'],
  ['吉', '慢一点也没关系，花是一朵一朵开的。'], ['吉', '和居民多聊两句，他们总有话想告诉你。'],
  ['末吉', '今天的幸运色是粉色——反正你每天都穿。'], ['末吉', '饿了就去咖啡屋，别空着肚子许愿。'],
].map(value => Object.freeze(value)));
export const FORTUNE_LEVELS = Object.freeze(['大吉', '中吉', '小吉', '吉', '末吉']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const marked = value => value === true || value === 1;
const dayNumber = state => Number.isSafeInteger(state?.gday) && state.gday >= 0 ? state.gday : 0;
export const dailyFunKey = state => gameDate(dayNumber(state)).key;
export const fortuneForDay = state => FORTUNES[(dayNumber(state) * 7 + 3) % FORTUNES.length];
const dailyUsed = (state, expectedDay = dailyFunKey(state)) => {
  const fun = state?.live?.fun;
  return record(fun) && fun.day === expectedDay && record(fun.used) ? fun.used : {};
};
export const hasDailyMomoPet = state => marked(dailyUsed(state).momoPet);

// 旧档只保存了“今天已经抽过”。按原来的确定性序列还原等级，不重发找零或修改原档。
export function getDailySupport(state, expectedDay = dailyFunKey(state)) {
  const used = dailyUsed(state, expectedDay);
  let fortuneLv = FORTUNE_LEVELS.includes(used.fortuneLv) ? used.fortuneLv : null;
  if (!Object.hasOwn(used, 'fortuneLv') && marked(used.fortune)) fortuneLv = fortuneForDay(state)[0];
  const fortuneBonus = fortuneLv === '大吉' ? 0.08 : fortuneLv === '中吉' ? 0.05 : fortuneLv ? 0.03 : 0;
  return { momoEnergy: (marked(used.momoPet) ? 35 : 0) + (fortuneLv === '中吉' ? 20 : 0),
    fortuneLv, fortuneBonus, rareDropBonus: fortuneLv === '大吉' ? 0.2 : 0 };
}

// 仅真实互动调用写入函数；读提示/开一局/导入预览不会偷偷刷新或发奖励。
export function ensureDailyFun(state) {
  state.live = state.live || {};
  const fun = state.live.fun = state.live.fun || { day: '', used: {}, capsule: 0 };
  const day = dailyFunKey(state), changed = fun.day !== day;
  if (changed) { fun.day = day; fun.used = {}; fun.capsule = 0; }
  else fun.used = fun.used || {};
  return { fun, changed };
}

export function markMomoPet(state) {
  const { fun } = ensureDailyFun(state);
  const first = !marked(fun.used.momoPet);
  if (first) fun.used.momoPet = 1;
  return first;
}

export function drawDailyFortune(state) {
  const { fun } = ensureDailyFun(state);
  const first = !marked(fun.used.fortune) && !FORTUNE_LEVELS.includes(fun.used.fortuneLv);
  const entry = fortuneForDay(state);
  const level = FORTUNE_LEVELS.includes(fun.used.fortuneLv) ? fun.used.fortuneLv : entry[0];
  fun.used.fortune = 1; fun.used.fortuneLv = level;
  const text = level === entry[0] ? entry[1] : FORTUNES.find(value => value[0] === level)[1];
  return { first, level, text };
}
