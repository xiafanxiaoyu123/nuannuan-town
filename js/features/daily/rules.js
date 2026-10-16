// 每日订单纯规则：不读全局存档、DOM、时间或存储；不发奖励、不修改传入的记录。
import { seeded } from '../../core/util.js';
import { DAILY_POOL, DAILY_TASK_COUNT, DAILY_CHEST, dailyDefinition } from '../../shared/daily.js';

/** @typedef {import('../../shared/daily.js').DailyRecord} DailyRecord */

/** 现实设备本地日期；不能改为 UTC 截日期或游戏镇历。 */
export function dailyDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isCurrentDaily(liveState, day) {
  return liveState.day === day
    && liveState.daily.length === DAILY_TASK_COUNT
    && liveState.daily.every((task) => dailyDefinition(task.id));
}

/**
 * 按原日期种子、原表顺序及原 Fisher–Yates 洗牌抽取三种不同类型。
 * @param {string} day 本地 YYYY-MM-DD。
 * @param {number} plays 累计次数；调用方兼容只有 shops.plays 的旧档。
 * @param {(name: string) => number} readStat 当前统计读取器，不修改统计。
 * @returns {DailyRecord[]}
 */
export function createDailyTasks(day, plays, readStat) {
  const random = seeded(Number(day.replace(/-/g, '')));
  const pool = DAILY_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const tier = plays < 10 ? 0 : plays < 40 ? 1 : 2;
  const types = new Set(), tasks = [];
  for (const definition of pool) {
    if (types.has(definition.type)) continue;
    types.add(definition.type);
    tasks.push({
      id: definition.id,
      n: definition.n[tier],
      base: definition.type === 'stat' ? readStat(definition.stat) : 0,
      prog: 0,
      claimed: false,
    });
    if (tasks.length === DAILY_TASK_COUNT) break;
  }
  return tasks;
}

/** 只计算更新，不重写领取过的记录；结算来源的日期由服务层先检查。 */
export function dailyPlayedUpdates(tasks, { id, total, mode, elapsed }) {
  const updates = [];
  tasks.forEach((task, index) => {
    if (task.claimed) return;
    const definition = dailyDefinition(task.id);
    const value = definition.type === 'score' && definition.shop === id ? total
      : definition.type === 'endless' && mode === 'endless' ? elapsed : 0;
    if (Number.isFinite(value) && value > task.prog) updates.push({ index, prog: value });
  });
  return updates;
}

/** 构建现有 UI 返回契约；纯读取，不会换日、保存或触发奖励。 */
export function dailyView(liveState, readStat) {
  const tasks = liveState.daily.map((task) => {
    const definition = dailyDefinition(task.id);
    const cur = Math.max(0, definition.type === 'stat' ? readStat(definition.stat) - task.base : task.prog);
    return {
      id: task.id,
      text: definition.text.replace('{n}', task.n),
      cur,
      need: task.n,
      reward: definition.reward,
      done: cur >= task.n,
      claimed: task.claimed,
    };
  });
  return {
    date: liveState.day,
    tasks,
    chest: { ...DAILY_CHEST, done: tasks.filter((task) => task.claimed).length, claimed: liveState.chest },
  };
}
