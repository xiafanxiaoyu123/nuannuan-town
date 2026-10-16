// 每日订单的副作用边界：依赖由兼容入口注入，避免规则依赖整个游戏或 UI。
import { DAILY_CHEST } from '../../shared/daily.js';
import { dailyDateKey, isCurrentDaily, createDailyTasks, dailyPlayedUpdates, dailyView } from './rules.js';

/**
 * getState 必须每次读取当前存档，以兼容导入、云档替换和重开游戏。
 * now 返回真实毫秒时间；测试可注入时钟，无需修改系统时间。
 */
export function createDailyService({ getState, getStat, save, addCoins, bus, now = () => Date.now() }) {
  let subscriptions = null;

  function refreshDay() {
    const state = getState(), liveState = state.live;
    const day = dailyDateKey(new Date(now()));
    if (isCurrentDaily(liveState, day)) return;
    const shopPlays = Object.values(state.shops).reduce((total, shop) => total + (shop.plays || 0), 0);
    const plays = Math.max(getStat('plays'), shopPlays);
    liveState.daily = createDailyTasks(day, plays, getStat);
    liveState.day = day;
    liveState.chest = false;
    save();
  }

  function onPlayed(event) {
    refreshDay();
    const liveState = getState().live;
    if (dailyDateKey(new Date(event.endedAt ?? now())) !== liveState.day) return;
    const updates = dailyPlayedUpdates(liveState.daily, event);
    if (!updates.length) return;
    for (const update of updates) liveState.daily[update.index].prog = update.prog;
    save();
    bus.emit('liveDaily');
  }

  function init() {
    refreshDay();
    if (subscriptions) return;
    // 统计先换日再增长，午夜第一笔不能被当作新基线。
    subscriptions = [bus.on('beforeStat', refreshDay), bus.on('played', onPlayed)];
  }

  function daily() {
    refreshDay();
    return dailyView(getState().live, getStat);
  }

  function claimDaily(id) {
    const task = daily().tasks.find((item) => item.id === id);
    if (!task || task.claimed || !task.done) return 0;
    // 发奖前记账，重复点击或同步回调不能重复领奖。
    getState().live.daily.find((item) => item.id === id).claimed = true;
    addCoins(task.reward, 'live');
    save();
    bus.emit('liveDaily');
    return task.reward;
  }

  function claimChest() {
    const view = daily();
    if (view.chest.claimed || view.chest.done < view.chest.need) return 0;
    getState().live.chest = true;
    addCoins(DAILY_CHEST.coins, 'live');
    save();
    bus.emit('liveDaily');
    return DAILY_CHEST.coins;
  }

  function dispose() {
    if (!subscriptions) return;
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions = null;
  }

  return { init, daily, claimDaily, claimChest, dispose };
}
