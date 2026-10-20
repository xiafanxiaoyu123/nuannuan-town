// 新玩法的物品交易先确认本机写入，成功后才允许界面演出/云同步。
import { S, bus, save, flushSave } from './state.js';
import { performHomestead } from '../shared/homestead.js';
import { cafeSpecialAction } from '../shared/cafe-specials.js';
import { applyLifeDiscovery } from '../shared/life-discoveries.js';
import { gameClockHour } from '../shared/life-session.js';
const FIELDS = ['homestead', 'cafeSpecials', 'lifeDiscoveries', 'coins', 'crops', 'npc', 'decor', 'owned', 'settings', 'savedAt'];
export function applyHomesteadAction(action, now = Date.now()) {
  const source = S, before = Object.fromEntries(FIELDS.map(key => [key, { exists: Object.hasOwn(source, key), value: source[key] }]));
  const tea = action.type === 'teaFinish' && source.homestead?.tea ? JSON.parse(JSON.stringify(source.homestead.tea)) : null;
  const cooking = action.type === 'cookFinish' ? source.homestead?.cooking : null;
  const cared = action.type === 'pet' && action.manual === true ? source.homestead?.animals.find(a => a.id === action.animalId) : null;
  const beforeTeaCount = source.homestead?.teaCount || 0;
  const result = performHomestead(source, action, now);
  if (!result.ok) return result;
  if (tea) {
    const memory = cafeSpecialAction(source, { type: 'host', tea, beforeTeaCount });
    if (!memory.ok) {
      for (const [key, prior] of Object.entries(before)) { if (prior.exists) source[key] = prior.value; else delete source[key]; }
      return memory;
    }
    if (memory.changed !== false) {
      result.cafeMemory = memory;
      if (memory.message) result.message = `${result.message || '招待完成'}\n${memory.message}`;
    }
  }
  // 只接真实完成事件；发现与菜品、招待、照料共用一笔本机保存。
  const event = tea ? { type: 'tea', keys: tea.keys, guests: tea.guests, ...(Object.hasOwn(tea, 'served') ? { served: tea.served } : {}) }
    : cooking ? { type: 'cook', recipe: cooking.recipe, quality: result.quality, manual: true, hour: Math.floor(gameClockHour(source.clock)) }
      : cared ? { type: 'animal_care', personality: cared.personality, manual: true, completed: true } : null;
  const discovery = event ? applyLifeDiscovery(source, event, now) : null;
  if (discovery && !discovery.ok) {
    for (const [key, prior] of Object.entries(before)) { if (prior.exists) source[key] = prior.value; else delete source[key]; }
    return discovery;
  }
  save();
  if (flushSave()) {
    if (discovery?.changed) { result.discovery = discovery; bus.emit('lifeDiscovery', discovery); }
    return result;
  }
  for (const [key, prior] of Object.entries(before)) { if (prior.exists) source[key] = prior.value; else delete source[key]; }
  return { ok: false, message: '本机存档暂时没有写入成功，这次操作已撤回，食材和噗灵保留。请先完成装修或释放设备空间后再试。' };
}
