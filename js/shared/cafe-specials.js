// 咖啡屋招牌与常客的共享纯规则。每局预留一份料理，首次真实招牌服务后才消耗。
import { RECIPE, parseDishKey, validateHomesteadState } from './homestead.js';
import { DECO } from './furniture.js';

const MAX = 999999;
const record = v => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === null || (Object.getPrototypeOf(p) === null && Object.prototype.toString.call(v) === '[object Object]');
};
const integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
const copy = v => JSON.parse(JSON.stringify(v));
export const CAFE_SPECIALS = Object.freeze([
  { id: 'milk_pudding', name: RECIPE.milk_pudding.name, shortName: '鲜奶布丁', description: '奶香甜点，带来一段悠闲的下午茶。' },
  { id: 'cherry_yogurt', name: RECIPE.cherry_yogurt.name, shortName: '樱桃酸奶', description: '酸甜果香，给饮品搭配添一点清爽。' },
  { id: 'egg_sandwich', name: RECIPE.egg_sandwich.name, shortName: '蛋蔬三明治', description: '温暖早餐，适合一杯饮品配一份餐点。' },
].map(Object.freeze));
export const CAFE_STYLES = Object.freeze([
  { id: 'teatime', name: '悠闲下午茶', description: '客人更有耐心，慢慢搭配饮品和甜点。' },
  { id: 'breakfast', name: '暖心早餐铺', description: '组合订单更常见，提前安排准备顺序。' },
].map(Object.freeze));
const recipeOK = id => CAFE_SPECIALS.some(v => v.id === id);
const styleOK = id => CAFE_STYLES.some(v => v.id === id);

export function createCafeSpecials() {
  return { version: 1, style: 'teatime', recipeId: null, sequence: 0, pending: null, regularVisits: 0, storyComplete: false };
}
export function getCafeSpecials(state) { return state?.cafeSpecials ?? createCafeSpecials(); }

// 与导入、启动、云档服务端共享；只允许旧档缺省，不修补存在但损坏的预留记录。
export function validateCafeSpecials(state) {
  const errors = [], raw = state?.cafeSpecials;
  if (raw === undefined) return errors;
  const bad = (at, message) => errors.push(`${at}: ${message}`);
  const object = (value, at, keys) => {
    if (!record(value)) { bad(at, '应为对象'); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) bad(`${at}.${key}`, '未知字段');
    for (const key of keys) if (!Object.hasOwn(value, key)) bad(`${at}.${key}`, '缺少字段');
    return true;
  };
  if (!object(raw, 'cafeSpecials', ['version', 'style', 'recipeId', 'sequence', 'pending', 'regularVisits', 'storyComplete'])) return errors;
  if (raw.version !== 1) bad('version', '版本无效');
  if (!styleOK(raw.style)) bad('style', '营业风格无效');
  if (raw.recipeId !== null && !recipeOK(raw.recipeId)) bad('recipeId', '招牌无效');
  if (!integer(raw.sequence)) bad('sequence', '序号无效');
  if (!integer(raw.regularVisits, 0, 3)) bad('regularVisits', '常客进度无效');
  if (typeof raw.storyComplete !== 'boolean') bad('storyComplete', '应为布尔值');
  if (raw.storyComplete && raw.regularVisits !== 3) bad('storyComplete', '常客故事进度不一致');
  const p = raw.pending;
  if (p !== null && object(p, 'pending', ['id', 'style', 'recipeId', 'dishKey', 'used', 'regularCounted'])) {
    if (!integer(raw.sequence, 1) || p.id !== `cafe_${raw.sequence}`) bad('pending.id', '预留序号无效');
    if (!styleOK(p.style) || p.style !== raw.style) bad('pending.style', '风格不一致');
    if (!recipeOK(p.recipeId) || p.recipeId !== raw.recipeId) bad('pending.recipeId', '招牌不一致');
    const dish = parseDishKey(p.dishKey);
    if (!dish || dish.recipe !== p.recipeId) bad('pending.dishKey', '预留料理无效');
    if (typeof p.used !== 'boolean' || typeof p.regularCounted !== 'boolean') bad('pending', '服务状态应为布尔值');
    if (p.regularCounted && (!p.used || raw.regularVisits < 1)) bad('pending.regularCounted', '常客服务状态不一致');
    if (!state?.homestead || state.homestead.version !== 2) bad('pending', '预留缺少有效厨房');
  }
  return errors;
}

function requireSession(cafe, id) {
  if (!cafe.pending || cafe.pending.id !== id) throw new Error('这场营业已经结束，请重新开店');
  return cafe.pending;
}
function release(draft) {
  const p = draft.cafeSpecials.pending;
  if (!p) return { changed: false, refunded: false, message: '' };
  if (!p.used) {
    const count = draft.homestead?.dishes?.[p.dishKey] || 0;
    if (!integer(count, 0, MAX - 1)) throw new Error('料理仓库暂时无法接收退回，备货仍为你保留');
    draft.homestead.dishes[p.dishKey] = count + 1;
  }
  draft.cafeSpecials.pending = null;
  return { changed: true, refunded: !p.used, dishKey: p.dishKey, message: p.used ? '这份招牌已供应本场营业' : '尚未送出的招牌料理已退回厨房' };
}

function execute(draft, action) {
  const cafe = draft.cafeSpecials;
  switch (action.type) {
    case 'choose': {
      if (cafe.pending) throw new Error('先结束当前营业，再更换菜单');
      if (!styleOK(action.style) || (action.recipeId !== null && !recipeOK(action.recipeId))) throw new Error('请选择有效的营业风格和招牌');
      const changed = cafe.style !== action.style || cafe.recipeId !== action.recipeId;
      cafe.style = action.style; cafe.recipeId = action.recipeId;
      return { changed, message: '营业菜单已记下' };
    }
    case 'begin': {
      if (cafe.pending) throw new Error('还有一场营业的备货未结算');
      const style = action.style ?? cafe.style, recipeId = Object.hasOwn(action, 'recipeId') ? action.recipeId : cafe.recipeId;
      if (!styleOK(style) || (recipeId !== null && !recipeOK(recipeId))) throw new Error('营业菜单无效');
      cafe.style = style; cafe.recipeId = recipeId;
      if (recipeId === null) {
        if (action.dishKey != null) throw new Error('常规营业不需要备货');
        return { changed: true, sessionId: null, recipeId: null, style, dishKey: null, message: '常规营业开始，无需消耗料理' };
      }
      const dishes = draft.homestead?.dishes;
      let key = action.dishKey;
      if (key === undefined) key = ['normal', 'tasty', 'fine'].map(q => `${recipeId}:${q}:plain`).find(k => (dishes?.[k] || 0) > 0);
      if (parseDishKey(key)?.recipe !== recipeId || !integer(dishes?.[key], 1, MAX)) throw new Error('厨房里还没有这道料理，可以先选择常规营业');
      if (!integer(cafe.sequence, 0, Number.MAX_SAFE_INTEGER - 1)) throw new Error('营业序号已达上限，备货未扣除');
      dishes[key]--; if (dishes[key] === 0) delete dishes[key];
      const id = `cafe_${++cafe.sequence}`;
      cafe.pending = { id, style, recipeId, dishKey: key, used: false, regularCounted: false };
      return { changed: true, sessionId: id, recipeId, style, dishKey: key, message: '一份料理已为整场营业备好' };
    }
    case 'serve': {
      const pending = requireSession(cafe, action.sessionId);
      let changed = !pending.used, regularAdvanced = false;
      pending.used = true;
      if (action.npcId === 'man' && !pending.regularCounted) {
        pending.regularCounted = true; changed = true;
        if (cafe.regularVisits < 3) { cafe.regularVisits++; regularAdvanced = true; }
        const old = draft.npc.man || { t: 0, last: '' };
        if (!integer(old.t ?? 0)) throw new Error('常客关系数据无效，未记录这次招待');
        draft.npc.man = { ...old, t: Math.max(1, old.t ?? 0) };
      }
      return { changed, regularAdvanced, regularVisits: cafe.regularVisits, inviteReady: cafe.regularVisits === 3 && !cafe.storyComplete,
        message: regularAdvanced ? cafe.regularVisits === 3 ? '小满想来你的家园，再尝一次招牌料理' : `小满记住了这次招待（${cafe.regularVisits}/3）` : '' };
    }
    case 'end': requireSession(cafe, action.sessionId); return release(draft);
    case 'recover': return release(draft);
    case 'host': {
      if (cafe.storyComplete || cafe.regularVisits < 3) return { changed: false, message: '' };
      const tea = action.tea;
      if (!record(tea) || !Array.isArray(tea.guests) || !tea.guests.includes('man') || !Array.isArray(tea.keys) || !tea.keys.some(k => recipeOK(parseDishKey(k)?.recipe))) return { changed: false, message: '' };
      // The caller snapshots the active tea before a successful teaFinish. A cancel,
      // pending tea, or stale completion cannot substitute for that finished meal.
      if (!/^tea_[1-9]\d*$/.test(tea.id) || !integer(action.beforeTeaCount, 0, MAX - 1) || draft.homestead?.tea !== null || draft.homestead?.teaCount !== action.beforeTeaCount + 1) throw new Error('这场招待尚未完成，常客故事进度已保留');
      const count = draft.decor.teaset || 0;
      if (!DECO.teaset || !integer(count, 0, Number.MAX_SAFE_INTEGER - 1)) throw new Error('下午茶桌暂时无法领取，故事进度已保留');
      draft.decor.teaset = count + 1; cafe.storyComplete = true;
      return { changed: true, storyCompleted: true, item: 'teaset', message: '小满把下午茶桌送给了你，约好以后常来做客' };
    }
    default: throw new Error('未知的咖啡屋操作');
  }
}

export function cafeSpecialAction(state, action) {
  if (!record(state) || !record(action)) return { ok: false, message: '咖啡屋操作参数无效' };
  try {
    const invalid = validateCafeSpecials(state);
    if (invalid.length) throw new Error('咖啡屋存档需要修复：' + invalid[0]);
    const draft = { cafeSpecials: copy(getCafeSpecials(state)), homestead: state.homestead === undefined ? undefined : copy(state.homestead), npc: copy(state.npc || {}), decor: copy(state.decor || {}) };
    if (draft.homestead !== undefined) { const issues = validateHomesteadState({ ...state, ...draft }); if (issues.length) throw new Error('厨房存档需要修复：' + issues[0]); }
    const result = execute(draft, action);
    const issues = [...validateCafeSpecials(draft), ...validateHomesteadState({ ...state, ...draft })];
    if (issues.length) throw new Error('无法保存这次咖啡屋操作：' + issues[0]);
    if (result.changed) {
      state.cafeSpecials = draft.cafeSpecials; state.npc = draft.npc; state.decor = draft.decor;
      if (draft.homestead !== undefined) state.homestead = draft.homestead;
    }
    return { ok: true, ...result };
  } catch (error) { return { ok: false, message: error.message || '这次操作没有完成，原物品已保留' }; }
}
