import { S, flushSave, bus, checkAch } from './state.js';
import { applyLifeDiscovery } from '../shared/life-discoveries.js';
import { ensureDailyFun } from '../shared/momo-fortune.js';
import { addFertilizer } from '../shared/save-compat.js';
import { gameClockHour } from '../shared/life-session.js';
import { ACHS } from '../shared/progression.js';

const stale = () => ({ ok: false, changed: false, unlocked: [], clueChanged: false, message: '进度已经切换，请重新进入当前玩法。' });
const failed = () => ({ ok: false, changed: false, unlocked: [], clueChanged: false, coins: 0, message: '本机暂时没有保存成功，这次操作已撤回。释放设备空间或结束装修后，可以再试一次。' });
// 日奖、每日资格、成就和发现同笔落盘；落盘前不派发会触发演出或其他玩法的事件。
function commitLifeChanges(source, patch, result, coins = 0, from) {
  if (source !== S) return stale();
  const fields = [...Object.keys(patch), ...(coins ? ['ach'] : [])];
  const before = fields.map(key => ({ key, exists: Object.hasOwn(source, key), value: source[key] }));
  const priorAch = source.ach;
  Object.assign(source, patch);
  if (coins) source.ach = { ...source.ach };
  let saved = false;
  try { if (coins) checkAch(true); saved = flushSave(); } catch (_) { saved = false; }
  if (!saved) {
    for (const { key, exists, value } of before) { if (exists) source[key] = value; else delete source[key]; }
    return failed();
  }
  const achievements = coins ? ACHS.filter(a => !priorAch?.[a.id] && source.ach[a.id]) : [];
  if (coins) bus.emit('coins', source.coins, coins, from);
  for (const achievement of achievements) if (S === source) bus.emit('ach', achievement);
  if (result.changed && S === source) bus.emit('lifeDiscovery', result);
  return { ...result, coins };
}

function rewardFields(source, coins) {
  const total = source.coins + coins, earned = (source.stats?.earned || 0) + coins;
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(earned) || earned < 0) return null;
  return { coins: total, stats: { ...source.stats, earned } };
}

// 独立场景事件在落盘后提示；家园事务由 homestead-actions 同笔保存。
export function recordLifeEvent(event, expectedSource = S) {
  if (expectedSource !== S) return stale();
  const source = S;
  const draft = { ...source }, result = applyLifeDiscovery(draft, event);
  if (!result.ok || !result.changed) return result;
  return commitLifeChanges(source, { lifeDiscoveries: draft.lifeDiscoveries }, result);
}

export function completeStarWish(expectedSource = S) {
  if (expectedSource !== S) return stale();
  const source = S, reward = rewardFields(source, 50);
  if (!reward) return failed();
  const draft = { ...source, ...reward, live: { ...source.live, fun: { ...source.live?.fun, used: { ...source.live?.fun?.used } } } };
  const { fun } = ensureDailyFun(draft);
  if (fun.used.starWish) return { ok: true, changed: false, already: true, coins: 0 };
  const hour = Math.floor(gameClockHour(source.clock)), night = hour >= 18 || hour < 5;
  fun.used.starWish = 1;
  try { addFertilizer(draft, 1); } catch (_) { return failed(); }
  const result = applyLifeDiscovery(draft, { type: 'star_wish', hour });
  if (!result.ok) return result;
  return { ...commitLifeChanges(source, { ...reward, stats: draft.stats, live: draft.live, lifeDiscoveries: draft.lifeDiscoveries }, result, 50, 'fun'), night };
}

export function completePianoPerformance(event, expectedSource = S) {
  if (expectedSource !== S) return stale();
  const source = S, draft = { ...source };
  const result = applyLifeDiscovery(draft, { ...event, type: 'piano' });
  if (!result.ok || event.manual !== true) return result;
  const coins = Number.isSafeInteger(source.gday) && source.gday >= 0 && source._pianoDay !== source.gday ? 60 : 0;
  if (!coins && !result.changed) return { ...result, coins: 0 };
  const reward = coins ? rewardFields(source, coins) : {};
  if (!reward) return failed();
  return commitLifeChanges(source, { ...reward, ...(coins ? { _pianoDay: source.gday } : {}), ...(result.changed ? { lifeDiscoveries: draft.lifeDiscoveries } : {}) }, result, coins);
}
