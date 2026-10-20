// 招牌备货与常客回忆只在本机持久化成功后生效。
import { S, save, flushSave, bus } from './state.js';
import { cafeSpecialAction } from '../shared/cafe-specials.js';

const FIELDS = ['cafeSpecials', 'homestead', 'npc', 'decor', 'savedAt'];
export function applyCafeSpecialAction(action, expectedSource = S) {
  if (expectedSource !== S) return { ok: false, message: '进度已经切换，请重新打开营业准备。' };
  const source = S;
  const before = Object.fromEntries(FIELDS.map(key => [key, { exists: Object.hasOwn(source, key), value: source[key] }]));
  const result = cafeSpecialAction(source, action);
  if (!result.ok || result.changed === false) return result;
  save();
  if (flushSave()) {
    bus.emit('cafeSpecialsChanged', result);
    if (['begin', 'end', 'recover'].includes(action.type)) bus.emit('homesteadChanged', result);
    return result;
  }
  for (const [key, prior] of Object.entries(before)) {
    if (prior.exists) source[key] = prior.value; else delete source[key];
  }
  return { ok: false, message: '这次进度未能存好，备货和回忆已保留原状。请释放设备空间后再试。' };
}
