// 日常生活中的小发现：不发放货币或物品，只留下真实完成过的回忆。
import { RECIPE, parseDishKey, getTeaMenuPreview } from './homestead.js';
import { animalWalkEventError } from './animal-walk.js';

export const MUSICBOX_ECHO_KEYS = 'DGQJGHQEWJ';
export const LIFE_DISCOVERIES = Object.freeze([
  { id: 'soft_paws', name: '慢慢靠近的小爪子', category: '动物', hint: '害羞的小动物，需要一点耐心。', detail: '亲手完成一次害羞动物的陪伴或抚摸小游戏。', memory: '你没有催促，它终于放心地靠了过来。' },
  { id: 'animal_stroll', name: '一起走过的小路', category: '动物', hint: '邀请伙伴一起走走，再找个熟悉的角落歇歇。', detail: '在家园邀请动物散步，一起走一小段，在住处或牧场摆件旁安静停留。', memory: '你放慢了脚步，它也把这一小段路走进了心里。' },
  { id: 'animal_garden_walk', name: '它也喜欢这座小院', category: '动物', hint: '你为家园准备的小角落，也想让伙伴看看。', detail: '在同一次散步中，和伙伴在干草堆、食水槽、雏菊花箱中的两类摆件旁分别停留。', memory: '原来你认真布置的家，也是它愿意陪你慢慢逛的地方。' },
  { id: 'pudding_jiggle', name: '布丁轻轻晃', category: '料理', hint: '有一份奶香甜点，想把每一步都做好。', detail: '亲手做出一份精致品质的鲜奶布丁。', memory: '布丁轻轻晃了一下，像在夸奖刚才认真的你。' },
  { id: 'moonlit_recipe', name: '把月光端上桌', category: '料理', hint: '夜晚的厨房，和月亮有关的食谱会留下什么回忆？', detail: '在小镇夜晚（18时至次日5时前），亲手完成月见星光糕或月光山羊奶。', memory: '灶台暖暖的，月光也在这份料理里留了一个座位。' },
  { id: 'thoughtful_table', name: '每个人都喜欢的一桌', category: '招待', hint: '记住客人的口味，再多准备一道不一样的料理。', detail: '用至少两道不同食谱完成招待，让每位来客都吃到喜欢的味型。', memory: '桌边的每个人都找到了喜欢的味道，也看见了你的用心。' },
  { id: 'musicbox_echo', name: '八音盒的回声', category: '音乐', hint: '先完整听一遍海边八音盒，再去钢琴旁寻找那段旋律。', detail: '完整聆听海边八音盒后，在钢琴选择“海岸回声”，亲手弹完完整曲谱。', memory: '最后一个音落下时，熟悉的旋律把两个小小的角落连在了一起。' },
  { id: 'last_second_fish', name: '差一点溜走', category: '钓鱼', hint: '快要逃走的鱼，也许还愿意再等等。', detail: '收线进度曾降到12%或更低，最后仍成功钓起这条鱼。', memory: '那一刻几乎就要松手了，好在你又稳稳地把它带了回来。' },
  { id: 'fish_and_treasure', name: '水面下的双份惊喜', category: '钓鱼', hint: '顾好鱼儿的时候，也留意水里的小宝箱。', detail: '在同一次成功收鱼中带回至少一个宝箱。', memory: '鱼篓里多了一条鱼，口袋里也装进了一份意外的惊喜。' },
  { id: 'starlit_wish', name: '星光听见了', category: '探索', hint: '夜色降下来后，去海岸观星石旁停一停。', detail: '在小镇夜晚（18时至次日5时前），与海岸观星石互动许愿。', memory: '愿望很轻，星光很暖。你把这一小会儿认真地留了下来。' },
].map(Object.freeze));

const IDS = new Set(LIFE_DISCOVERIES.map(item => item.id));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || (Object.getPrototypeOf(proto) === null && Object.prototype.toString.call(value) === '[object Object]');
};
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const night = hour => hour >= 18 || hour < 5;
const unchanged = () => ({ ok: true, changed: false, unlocked: [], clueChanged: false, message: '' });

export function createLifeDiscoveries() { return { version: 1, musicboxHeard: false, found: {} }; }
export function getLifeDiscoveries(state) { return state?.lifeDiscoveries ?? createLifeDiscoveries(); }

// 缺省仅用于兼容旧档；存在但损坏的字段由启动、导入及云端共同拒绝。
export function validateLifeDiscoveries(state) {
  const value = state?.lifeDiscoveries, errors = [];
  if (value === undefined) return errors;
  const bad = (key, text) => errors.push(`lifeDiscoveries.${key}: ${text}`);
  if (!record(value)) return ['lifeDiscoveries: 应为对象'];
  const fields = ['version', 'musicboxHeard', 'found'];
  for (const key of Object.keys(value)) if (!fields.includes(key)) bad(key, '未知字段');
  for (const key of fields) if (!own(value, key)) bad(key, '缺少字段');
  if (value.version !== 1) bad('version', '版本无效');
  if (typeof value.musicboxHeard !== 'boolean') bad('musicboxHeard', '应为布尔值');
  if (!record(value.found)) bad('found', '应为对象');
  else {
    for (const [id, at] of Object.entries(value.found)) {
      if (!IDS.has(id)) bad('found.' + id, '未知发现');
      if (!integer(at, 1)) bad('found.' + id, '时间无效');
    }
    if (own(value.found, 'musicbox_echo') && value.musicboxHeard !== true) bad('found.musicbox_echo', '尚未听过八音盒');
  }
  return errors;
}

function discover(event, current) {
  const require = (condition, message = '这次生活事件无效') => { if (!condition) throw new Error(message); };
  require(record(event) && typeof event.type === 'string');
  switch (event.type) {
    case 'animal_walk':
      require(!animalWalkEventError(event));
      return ['animal_stroll', ...(event.stopKinds.filter(kind => kind !== 'home').length >= 2 ? ['animal_garden_walk'] : [])];
    case 'animal_care':
      require(['shy', 'friendly', 'lively'].includes(event.personality) && typeof event.manual === 'boolean' && typeof event.completed === 'boolean');
      return event.personality === 'shy' && event.manual && event.completed ? ['soft_paws'] : [];
    case 'cook': {
      require(typeof event.recipe === 'string' && own(RECIPE, event.recipe) && typeof event.manual === 'boolean');
      if (event.quality !== undefined) require(['normal', 'tasty', 'fine'].includes(event.quality));
      if (event.hour !== undefined) require(integer(event.hour, 0, 23));
      if (!event.manual) return [];
      if (event.recipe === 'milk_pudding' && event.quality === 'fine') return ['pudding_jiggle'];
      return ['moon_cake', 'goat_moon_milk'].includes(event.recipe) && event.hour !== undefined && night(event.hour) ? ['moonlit_recipe'] : [];
    }
    case 'tea': {
      require(Array.isArray(event.keys) && event.keys.length >= 1 && event.keys.length <= 3 && event.keys.every(key => parseDishKey(key)));
      require(Array.isArray(event.guests) && event.guests.length >= 1 && event.guests.length <= 2 && event.guests.every(id => typeof id === 'string') && new Set(event.guests).size === event.guests.length);
      if (own(event, 'served')) require(record(event.served) && Object.entries(event.served).every(([guest, key]) => event.guests.includes(guest) && typeof key === 'string' && parseDishKey(key) && event.keys.includes(key)));
      const menu = getTeaMenuPreview(event.keys, event.guests, event.served);
      require(menu.guests.length === event.guests.length);
      return new Set(menu.dishes.map(dish => dish.recipe)).size >= 2 && menu.guests.every(guest => guest.liked) ? ['thoughtful_table'] : [];
    }
    case 'musicbox_heard': return [];
    case 'piano':
      require(typeof event.melody === 'string' && typeof event.notes === 'string' && event.notes.length <= 64 && typeof event.manual === 'boolean');
      return current.musicboxHeard && event.manual && event.melody === 'musicbox_echo' && event.notes === MUSICBOX_ECHO_KEYS ? ['musicbox_echo'] : [];
    case 'fish_caught': {
      require(Number.isFinite(event.minProgress) && event.minProgress >= 0 && event.minProgress <= 1 && integer(event.treasure));
      return [...(event.minProgress <= 0.12 ? ['last_second_fish'] : []), ...(event.treasure > 0 ? ['fish_and_treasure'] : [])];
    }
    case 'star_wish':
      require(integer(event.hour, 0, 23));
      return night(event.hour) ? ['starlit_wish'] : [];
    default: throw new Error('未知的生活事件');
  }
}

export function applyLifeDiscovery(state, event, now = Date.now()) {
  try {
    if (!record(state) || !integer(now, 1)) throw new Error('生活回忆暂时无法记录');
    const errors = validateLifeDiscoveries(state);
    if (errors.length) throw new Error(errors[0]);
    const current = getLifeDiscoveries(state), matches = discover(event, current);
    const unlocked = matches.filter(id => !own(current.found, id));
    const clueChanged = event.type === 'musicbox_heard' && !current.musicboxHeard;
    if (!unlocked.length && !clueChanged) return unchanged();
    const draft = { ...current, musicboxHeard: current.musicboxHeard || clueChanged, found: { ...current.found } };
    for (const id of unlocked) draft.found[id] = now;
    const finalErrors = validateLifeDiscoveries({ lifeDiscoveries: draft });
    if (finalErrors.length) throw new Error(finalErrors[0]);
    state.lifeDiscoveries = draft;
    return { ok: true, changed: true, unlocked, clueChanged, message: '' };
  } catch (error) { return { ok: false, changed: false, unlocked: [], clueChanged: false, message: error.message || '生活回忆暂时无法记录' }; }
}
