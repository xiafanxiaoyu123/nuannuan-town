// 牧场与家庭厨房的共享纯规则。无场景、存储、网络依赖；所有经济动作原子提交。
import { CROP } from './farming.js';
import { dailyFunKey } from './momo-fortune.js';
import { DECO } from './furniture.js';
import { HOME_LOT, YARDS } from './world.js';
import { housePlan } from '../world/house-plan.js';
import { BUILD_LOT, MAX_BUILD_FLOOR } from '../world/build-constants.js';
import { cookingQuality } from './cooking-quality.js';

const MINUTE = 60000, MAX = 999999, MAX_TIME = 8640000000000000;
const record = v => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const prototype = Object.getPrototypeOf(v);
  return prototype === null || (Object.getPrototypeOf(prototype) === null && Object.prototype.toString.call(v) === '[object Object]');
};
const integer = (v, min = 0, max = MAX) => Number.isSafeInteger(v) && v >= min && v <= max;
const clone = v => JSON.parse(JSON.stringify(v));
const qualityRank = { normal: 0, tasty: 1, fine: 2 };
const QUALITY = { normal: 1, tasty: 1.08, fine: 1.15 };
const NPC_IDS = ['momo', 'man', 'he', 'xu', 'shi', 'nuo', 'qi'];
const PREFERENCES = { momo: 'sweet', man: 'sweet', he: 'fresh', xu: 'milky', shi: 'warm', nuo: 'sweet', qi: 'drink' };
const dayPattern = /^(?:|\d{4}-\d{2}-\d{2})$/;
const idPattern = /^[a-z][a-z0-9_-]{0,79}$/;

export const ANIMALS = Object.freeze([
  { id: 'chicken', name: '奶油小鸡', product: 'egg', cycleMs: 12 * MINUTE, price: 180 },
  { id: 'cow', name: '斑点奶牛', product: 'milk', cycleMs: 18 * MINUTE, price: 650 },
  { id: 'sheep', name: '云朵绵羊', product: 'wool', cycleMs: 24 * MINUTE, price: 850 },
  { id: 'duck', name: '奶黄小鸭', product: 'duck_egg', cycleMs: 14 * MINUTE, price: 260 },
  { id: 'goat', name: '山野山羊', product: 'goat_milk', cycleMs: 20 * MINUTE, price: 720 },
  { id: 'rabbit', name: '棉花兔', product: 'rabbit_fur', cycleMs: 22 * MINUTE, price: 520 },
  { id: 'alpaca', name: '蜜糖羊驼', product: 'alpaca_fiber', cycleMs: 28 * MINUTE, price: 1050 },
]);
export const ANIMAL = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(ANIMALS.map(v => [v.id, v]))));
export const PANTRY = Object.freeze(Object.assign(Object.create(null), Object.fromEntries([
  ['egg', '新鲜鸡蛋', 42, '小鸡产出'], ['milk', '鲜牛奶', 64, '奶牛产出'], ['wool', '柔软羊毛', 80, '绵羊产出'],
  ['egg_prime', '优选鸡蛋', 50, '精心照料后下一轮正常饲料产物'], ['milk_prime', '优选牛奶', 77, '精心照料后下一轮正常饲料产物'],
  ['wool_prime', '优选羊毛', 96, '精心照料后下一轮正常饲料产物'], ['cheese', '鲜奶酪', 128, '2份鲜奶加工'],
  ['yogurt', '原味酸奶', 64, '1份鲜奶加工'], ['feed', '通用饲料', 0, '1份小麦换2份，或26噗灵购买'],
  ['duck_egg', '新鲜鸭蛋', 48, '小鸭产出'], ['goat_milk', '鲜山羊奶', 70, '山羊产出'],
  ['rabbit_fur', '柔软兔绒', 72, '兔子梳绒产出'], ['alpaca_fiber', '蓬松羊驼绒', 96, '羊驼梳绒产出'],
  ['duck_egg_prime', '优选鸭蛋', 58, '精心照料后下一轮正常饲料产物'], ['goat_milk_prime', '优选山羊奶', 84, '精心照料后下一轮正常饲料产物'],
  ['rabbit_fur_prime', '优选兔绒', 87, '精心照料后下一轮正常饲料产物'], ['alpaca_fiber_prime', '优选羊驼绒', 116, '精心照料后下一轮正常饲料产物'],
].map(([id, name, sell, source]) => [id, { id, name, sell, source }]))));
const recipe = (id, name, cost, method, category, tags, desc, milkOption = false) => ({ id, name, cost, method, category, tags, desc, milkOption, seconds: 24 });
export const RECIPES = Object.freeze([
  recipe('strawberry_tart', '草莓鲜果挞', [['strawberry', 2], ['wheat', 1]], 'flip', 'dessert', ['sweet', 'fresh'], '褶边挞壳盛着奶白馅与切半草莓。', true),
  recipe('pumpkin_soup', '奶油南瓜浓汤', [['pumpkin', 1], ['wheat', 1]], 'stir', 'soup', ['warm'], '金黄浓汤与白色旋纹，喝下去暖洋洋。', true),
  recipe('blueberry_muffin', '蓝莓蜜糖松饼', [['blueberry', 2], ['apple', 1]], 'flip', 'dessert', ['sweet', 'fresh'], '蓬松的松饼里藏着整颗蓝莓。'),
  recipe('lemon_tea', '香水柠檬花果茶', [['lemon', 1], ['peach', 1]], 'stir', 'drink', ['drink', 'fresh'], '柠檬薄片与蜜桃粒在茶面轻浮。'),
  recipe('moon_cake', '月见星光糕', [['moonflower', 1], ['cherry', 1]], 'stir', 'dessert', ['sweet'], '月形糕体配着樱桃与小星点。'),
  recipe('egg_custard', '田园蒸蛋羹', [['egg', 1]], 'stir', 'soup', ['warm'], '小陶碗里平滑柔嫩的蛋羹，是牧场的第一道菜。'),
  recipe('milk_pudding', '鲜奶布丁', [['milk', 1], ['egg', 1]], 'stir', 'dessert', ['sweet', 'milky'], '焦糖顶的布丁，脱模后会轻轻晃动。'),
  recipe('egg_sandwich', '暖心蛋蔬三明治', [['wheat', 1], ['egg', 1], ['radish', 1]], 'assemble', 'breakfast', ['fresh'], '三角切面里叠着蛋片和粉色萝卜。'),
  recipe('cheese_pumpkin', '芝士焗南瓜', [['pumpkin', 1], ['cheese', 1]], 'flip', 'soup', ['warm', 'milky'], '焗盘里的南瓜盖着起泡芝士，端起会短短拉丝。'),
  recipe('apple_pancake', '苹果奶香薄饼', [['apple', 1], ['wheat', 1], ['milk', 1]], 'flip', 'breakfast', ['sweet', 'milky'], '三层薄饼配苹果扇片与少量酱汁。'),
  recipe('cherry_yogurt', '樱桃酸奶杯', [['cherry', 1], ['yogurt', 1]], 'assemble', 'dessert', ['sweet', 'milky', 'fresh'], '酸奶、果酱和樱桃层层分明的冷食。'),
  recipe('radish_omelet', '田园萝卜蛋卷', [['egg', 1], ['radish', 1]], 'flip', 'breakfast', ['warm', 'fresh'], '卷起的蛋皮切成两段，露出清晰的螺旋切面。'),
  recipe('duck_egg_toast', '金黄鸭蛋吐司', [['wheat', 1], ['duck_egg', 1]], 'flip', 'breakfast', ['warm'], '金黄鸭蛋铺在方吐司上，边缘烤得酥香。'),
  recipe('goat_moon_milk', '月光山羊奶', [['goat_milk', 1], ['moonflower', 1]], 'stir', 'drink', ['warm', 'milky', 'drink'], '月见花染出淡紫奶色，温热杯口飘着花香。'),
  recipe('berry_trifle', '莓果奶酪杯', [['strawberry', 1], ['blueberry', 1], ['cheese', 1]], 'assemble', 'dessert', ['sweet', 'milky', 'fresh'], '红蓝莓与奶酪分层装杯，每一勺都有果香。'),
  recipe('orange_yogurt', '甜橙酸奶碗', [['orange', 1], ['yogurt', 1]], 'assemble', 'dessert', ['sweet', 'milky', 'fresh'], '橙瓣绕着酸奶碗排成一朵小太阳。'),
  recipe('peach_milk', '蜜桃鲜奶杯', [['peach', 1], ['milk', 1]], 'assemble', 'drink', ['sweet', 'milky', 'drink'], '粉白相间的果奶里藏着柔软蜜桃粒。'),
  recipe('pumpkin_pie', '南瓜蛋奶派', [['pumpkin', 1], ['wheat', 1], ['duck_egg', 1]], 'flip', 'dessert', ['sweet', 'warm'], '南瓜和鸭蛋烤成金橙派馅，切开露出厚厚一层。'),
  recipe('goat_cheese_tart', '山羊奶咸香挞', [['goat_milk', 1], ['wheat', 1], ['egg', 1]], 'flip', 'breakfast', ['warm', 'milky'], '小挞壳装着山羊奶蛋馅，烤好后轻轻鼓起。'),
  recipe('apple_milk_bowl', '苹果暖奶碗', [['apple', 1], ['milk', 1], ['wheat', 1]], 'stir', 'breakfast', ['warm', 'sweet', 'milky'], '麦粒在奶里慢慢煮软，苹果片围着碗边。'),
  recipe('lemon_cheesecake', '柠檬奶酪蛋糕', [['lemon', 1], ['cheese', 1], ['egg', 1]], 'stir', 'dessert', ['sweet', 'milky', 'fresh'], '黄色果层和奶白蛋糕叠成清爽的三角切片。'),
  recipe('cherry_egg_tart', '樱桃鸭蛋挞', [['cherry', 1], ['duck_egg', 1], ['wheat', 1]], 'flip', 'dessert', ['sweet', 'warm'], '金黄鸭蛋挞顶着一颗红樱桃，挞边层层酥脆。'),
  recipe('blueberry_yogurt', '蓝莓酸奶旋杯', [['blueberry', 1], ['yogurt', 1]], 'assemble', 'dessert', ['sweet', 'milky', 'fresh'], '蓝莓果泥在高杯里绕出紫白旋纹。'),
  recipe('garden_quiche', '田园芝士萝卜派', [['radish', 1], ['cheese', 1], ['duck_egg', 1]], 'flip', 'breakfast', ['warm', 'milky', 'fresh'], '开放式圆派铺着红萝卜薄片和金黄芝士。'),
]);
export const RECIPE = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(RECIPES.map(v => [v.id, v]))));
export const WOOL_TRADES = Object.freeze([
  { id: 'rug_cloud', item: 'rug_cloud', name: '云朵长绒毯', wool: 3, cost: [['wool', 3]], material: '3份柔软羊毛', kind: 'decor' },
  { id: 'rug_cat', item: 'rug_cat', name: '大喵圆绒垫', wool: 3, cost: [['wool', 3]], material: '3份柔软羊毛', kind: 'decor' },
  { id: 'a_water', item: 'a_water', name: '悠然水畔·渔夫帽', wool: 5, cost: [['wool', 5]], material: '5份柔软羊毛', kind: 'owned' },
  { id: 'rabbit_rug_cat', item: 'rug_cat', name: '大喵圆绒垫', cost: [['rabbit_fur', 3]], material: '3份柔软兔绒', kind: 'decor' },
  { id: 'alpaca_rug_cloud', item: 'rug_cloud', name: '云朵长绒毯', cost: [['alpaca_fiber', 3]], material: '3份蓬松羊驼绒', kind: 'decor' },
  { id: 'alpaca_water_hat', item: 'a_water', name: '悠然水畔·渔夫帽', cost: [['alpaca_fiber', 5]], material: '5份蓬松羊驼绒', kind: 'owned' },
]);
export const HOUSING = Object.freeze(Object.assign(Object.create(null), {
  ranch_coop: { id: 'ranch_coop', name: '奶油鸡舍', capacity: 4, kinds: ['chicken', 'duck'] },
  ranch_barn: { id: 'ranch_barn', name: '红顶畜棚', capacity: 4, kinds: ['cow', 'sheep', 'goat', 'alpaca'] },
  ranch_hutch: { id: 'ranch_hutch', name: '胡萝卜兔舍', capacity: 4, kinds: ['rabbit'] },
}));
const surfaceKey = (zone, e) => [zone, e.id, e.gx, e.gz, e.rot || 0, e.level || 0].join('_');
const placementOK = e => record(e) && integer(e.gx, 0, 999) && integer(e.gz, 0, 999) && integer(e.rot ?? 0, 0, 3) && integer(e.level ?? 0, 0, 99);
function usablePlacement(state, e, zone) {
  if (!placementOK(e) || !Object.hasOwn(DECO, e.id)) return false;
  const def = DECO[e.id], [w, d] = (e.rot || 0) % 2 ? [...def.size].reverse() : def.size;
  let cols, rows;
  if (zone === 'home') { const yard = YARDS.find(v => v.lv === (state.yardLv ?? 1)) || YARDS[0]; cols = Math.min(HOME_LOT.cols, yard.x1 + 1); rows = Math.min(HOME_LOT.rows, yard.z1 + 1); if (def.indoorOnly || (e.level || 0)) return false; }
  else if (zone === 'house') { ({ cols, rows } = housePlan(state.house)); if (def.outdoorOnly || (e.level || 0)) return false; }
  else { ({ cols, rows } = BUILD_LOT); if ((e.level || 0) > MAX_BUILD_FLOOR) return false; }
  return e.gx + w <= cols && e.gz + d <= rows;
}
const footprint = e => { const [w, d] = (e.rot || 0) % 2 ? [...DECO[e.id].size].reverse() : DECO[e.id].size; return { x0: e.gx, x1: e.gx + w, z0: e.gz, z1: e.gz + d }; };
const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
export function getAnimalHousing(state) {
  const seen = new Set(), occupied = [], homes = [];
  for (const e of [...(state.placed || [])].filter(e => HOUSING[e?.id] && usablePlacement(state, e, 'home')).sort((a, b) => surfaceKey('home', a).localeCompare(surfaceKey('home', b)))) {
    const key = surfaceKey('home', e); if (seen.has(key)) continue; seen.add(key);
    const rect = footprint(e); if (occupied.some(v => overlaps(v, rect))) continue; occupied.push(rect);
    homes.push({ ...HOUSING[e.id], key, gx: e.gx, gz: e.gz, rot: e.rot || 0, level: 0, animalIds: [], free: 4 });
  }
  homes.sort((a, b) => a.key.localeCompare(b.key));
  const assignments = Object.create(null), animals = state.homestead?.animals || []; let totalHoused = 0;
  // Keep existing suitable homes first; a new animal must not displace a resident.
  const assign = (a, home) => { assignments[a.id] = home.key; home.animalIds.push(a.id); home.free--; totalHoused++; };
  for (const a of animals) { assignments[a.id] = null; const home = homes.find(v => v.key === a.housingKey && v.kinds.includes(a.kind) && v.free > 0); if (home && totalHoused < 16) assign(a, home); }
  for (const a of animals) if (!assignments[a.id] && totalHoused < 16) { const home = homes.find(v => v.kinds.includes(a.kind) && v.free > 0); if (home) assign(a, home); }
  return { capacity: Math.min(16, homes.length * 4), totalHoused, assignments, homes,
    unhousedIds: animals.filter(a => !assignments[a.id]).map(a => a.id),
    availableByKind: Object.fromEntries(ANIMALS.map(a => [a.id, Math.max(0, Math.min(16 - animals.length, homes.filter(v => v.kinds.includes(a.id)).reduce((n, v) => n + v.free, 0)))])) };
}
export const ranchCapacity = state => getAnimalHousing(state || {}).capacity;
export function getDishSurfaces(state) {
  const result = [], seen = new Set();
  for (const [zone, entries] of [['home', state.placed], ['house', state.placedIn], ['build', state.buildPlaced]]) for (const e of entries || []) {
    if (!['dining', 'kitchen_island', 'ranch_picnic'].includes(e?.id) || !usablePlacement(state, e, zone)) continue;
    const id = surfaceKey(zone, e); if (seen.has(id)) continue; seen.add(id);
    result.push({ id, zone, furnitureId: e.id, capacity: e.id === 'ranch_picnic' ? 4 : 2 });
  }
  return result;
}
export function getTeaSurfaces(state) { return getDishSurfaces(state).filter(v => v.furnitureId !== 'kitchen_island'); }
export const homesteadDay = (now = Date.now()) => new Date(now + 8 * 60 * MINUTE).toISOString().slice(0, 10);
export const dishKey = (recipeId, quality = 'normal', variant = 'plain') => `${recipeId}:${quality}:${variant}`;
export function parseDishKey(key) {
  if (typeof key !== 'string') return null;
  const [recipeId, quality, variant, extra] = key.split(':');
  if (!RECIPE[recipeId] || !Object.hasOwn(QUALITY, quality) || !['plain', 'milky'].includes(variant) || extra !== undefined || (variant === 'milky' && !RECIPE[recipeId].milkOption)) return null;
  return { recipe: recipeId, recipeId, quality, variant };
}
export function recipeCost(recipeId, variant = 'plain') {
  const r = typeof recipeId === 'string' ? RECIPE[recipeId] : RECIPE[recipeId?.id];
  if (!r) return [];
  return [...r.cost.map(([id, n]) => [id, n]), ...(variant === 'milky' && r.milkOption ? [['milk', 1]] : [])];
}
export function dishPrice(keyOrRecipe, quality = 'normal', variant = 'plain') {
  const parsed = parseDishKey(keyOrRecipe);
  const r = parsed?.recipe || keyOrRecipe;
  if (!RECIPE[r]) return 0;
  const cost = recipeCost(r, parsed?.variant || variant).reduce((s, [id, n]) => s + n * (PANTRY[id]?.sell ?? CROP[id]?.sell ?? 0), 0);
  return Math.ceil(Math.ceil(cost * 1.3) * (QUALITY[parsed?.quality || quality] || 1));
}
export function availableIngredient(state, id) {
  const raw = PANTRY[id] ? state.homestead?.pantry?.[id] : state.crops?.[id];
  return Math.max(0, raw || 0);
}
export function availableDish(state, key) {
  return Math.max(0, state.homestead?.dishes?.[key] || 0);
}
export function recipeUnlock(state, id) {
  const r = RECIPE[id], h = state.homestead;
  if (!r) return { ok: false, reason: '找不到这道菜谱' };
  if (!['milk_pudding', 'cheese_pumpkin', 'apple_pancake', 'cherry_yogurt'].includes(id) || h?.history?.[id] > 0 || h?.animals?.some(a => a.kind === 'cow') || ['milk', 'milk_prime', 'cheese', 'yogurt'].some(k => h?.pantry?.[k] > 0)) return { ok: true, reason: '' };
  return { ok: false, reason: '做出两种料理后领养奶牛，开放奶香菜谱' };
}
export function createHomestead(legacy = {}, now = Date.now()) {
  const history = {}, book = {}, mastery = {};
  const kitchen = legacy.live?.kitchen || legacy.kitchen || {};
  for (const r of RECIPES) if (integer(kitchen[r.id], 1)) {
    history[r.id] = kitchen[r.id]; book[r.id] = { count: kitchen[r.id], best: 'normal', firstDay: '' };
    mastery[r.id] = { operation: 32, plating: 20 };
  }
  const alreadyTea = legacy.live?.fun?.day === dailyFunKey(legacy) && !!legacy.live?.fun?.used?.teaParty;
  return { version: 2, serial: 1, tutorial: false, ranchLevel: 0, animals: [], pantry: {}, dishes: {}, placed: [], cooking: null, tea: null, prep: null,
    history, mastery, book, favorites: [], giftDays: {}, teaDay: alreadyTea ? homesteadDay(now) : '', orderDay: '', teaCount: 0, lastNow: now, receipts: [] };
}
export function ensureHomestead(state, now = Date.now()) {
  if (state.homestead === undefined || state.homestead === null) state.homestead = createHomestead(state, now);
  else if (state.homestead.version === 1) migrateHomestead(state, now);
  return state.homestead;
}
// Version is the one-time migration receipt. Never advance wall-clock production
// here: save normalization must yield the same result on every client/server.
export function migrateHomestead(state, now = 0) {
  if (state.homestead === undefined || state.homestead === null) { state.homestead = createHomestead(state, now); return state.homestead; }
  const errors = validateHomesteadState(state); if (errors.length) throw new Error(`牧场存档需要修复：${errors[0]}`);
  if (state.homestead.version === 2) return state.homestead;
  const h = clone(state.homestead), decor = clone(state.decor || {});
  const refund = h.ranchLevel === 3 ? 1700 : h.ranchLevel === 2 ? 500 : 0;
  const coins = state.coins ?? 0;
  if (!integer(coins, 0, Number.MAX_SAFE_INTEGER) || !integer(coins + refund, 0, Number.MAX_SAFE_INTEGER)) throw new Error('噗灵退款超出容量，迁移未执行');
  for (const def of Object.values(HOUSING)) {
    const required = Math.ceil(h.animals.filter(a => def.kinds.includes(a.kind)).length / def.capacity);
    if (required) add(decor, def.id, required);
  }
  for (const p of h.placed) if (p.zone === 'ranch') add(h.dishes, p.key, 1);
  h.placed = h.placed.filter(p => p.zone !== 'ranch');
  if (h.tea) for (const key of h.tea.keys) add(h.dishes, key, 1);
  h.tea = null;
  for (const a of h.animals) {
    a.housingKey = '';
    a.pausedMs = a.cycleAt ? Math.max(1, Math.min(ANIMAL[a.kind].cycleMs * (a.cycleEmergency ? 2 : 1), a.cycleAt - h.lastNow)) : 0;
    a.cycleAt = 0;
  }
  h.ranchLevel = 0; h.version = 2;
  const after = validateHomestead(h); if (after.length) throw new Error(`无法迁移牧场：${after[0]}`);
  state.homestead = h; state.decor = decor; state.coins = coins + refund;
  return h;
}
function startCycle(a, at) {
  if (!a.housingKey || a.pausedMs || a.cycleAt || a.ready + a.readyPrime >= 4 || a.feed + a.emergency === 0) return false;
  a.cycleEmergency = a.feed === 0;
  a.cyclePrime = !a.cycleEmergency && a.carePending;
  if (a.cyclePrime) a.carePending = false;
  if (a.cycleEmergency) a.emergency--; else a.feed--;
  a.cycleAt = at + ANIMAL[a.kind].cycleMs * (a.cycleEmergency ? 2 : 1);
  return true;
}
export function advanceHomestead(state, now = Date.now()) {
  const h = ensureHomestead(state, now);
  const at = Math.max(h.lastNow, now), housing = getAnimalHousing(state); let changed = false;
  for (const a of h.animals) {
    const home = housing.assignments[a.id];
    if (!home) {
      if (a.cycleAt) { a.pausedMs = Math.max(1, Math.min(ANIMAL[a.kind].cycleMs * (a.cycleEmergency ? 2 : 1), a.cycleAt - at)); a.cycleAt = 0; changed = true; }
      if (a.housingKey) { a.housingKey = ''; changed = true; }
      continue;
    }
    if (a.housingKey !== home) { a.housingKey = home; changed = true; }
    if (a.pausedMs) { a.cycleAt = at + a.pausedMs; a.pausedMs = 0; changed = true; }
    // At most four completions: production can never run through a full store.
    for (let n = 0; n < 4 && a.cycleAt && a.cycleAt <= at; n++) {
      const completedAt = a.cycleAt;
      if (a.cyclePrime) a.readyPrime++; else a.ready++;
      changed = true;
      a.cycleAt = 0; a.cycleEmergency = false; a.cyclePrime = false;
      startCycle(a, completedAt);
    }
    if (startCycle(a, at)) changed = true;
  }
  // Polling is read-only when no production transition happened, so idle clients
  // do not create cloud-save divergence merely by watching a countdown.
  if (changed) h.lastNow = at;
  return h;
}
function unique(h, prefix) { return `${prefix}_${h.serial++}`; }
function add(map, key, count) {
  const next = (map[key] || 0) + count;
  if (!integer(next)) throw new Error('库存已达上限，请先整理');
  if (next) map[key] = next; else delete map[key];
}
function animal(h, id) { const a = h.animals.find(v => v.id === id); if (!a) throw new Error('没有找到这只动物'); return a; }
function count(v, max = 99) { if (!integer(v, 1, max)) throw new Error('数量不正确'); return v; }
function spend(state, amount) { if (!integer(state.coins, 0, Number.MAX_SAFE_INTEGER) || state.coins < amount) throw new Error('噗灵不足'); state.coins -= amount; }
function earn(state, amount) { if (!integer(state.coins + amount, 0, Number.MAX_SAFE_INTEGER)) throw new Error('噗灵已达上限'); state.coins += amount; }
function stock(state, id) { return PANTRY[id] ? state.homestead.pantry : state.crops; }
function takeIngredient(state, id, n) { if (!PANTRY[id] && !Object.hasOwn(CROP, id)) throw new Error('未知食材'); if (availableIngredient(state, id) < n) throw new Error(`${PANTRY[id]?.name || CROP[id]?.name}不足或已被制作预留`); add(stock(state, id), id, -n); }
function takeDish(state, key, n = 1) { if (!parseDishKey(key) || availableDish(state, key) < n) throw new Error('料理不足，可能已摆桌或为茶会预留'); add(state.homestead.dishes, key, -n); }
function known(state, id) { return NPC_IDS.includes(id) && (id === 'momo' || (state.npc?.[id]?.t || 0) > 0); }
function makeAnimal(h, kind, name = '') {
  return { id: unique(h, 'animal'), kind, name: name || ANIMAL[kind].name, look: h.serial % 3,
    personality: ['shy', 'friendly', 'lively'][h.serial % 3], love: 0, grazing: false, feed: 0, emergency: 0,
    cycleAt: 0, cycleEmergency: false, cyclePrime: false, carePending: false, ready: 0, readyPrime: 0, petDay: '', housingKey: '', pausedMs: 0 };
}
function checkName(value) { if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > 12 || /[<>\x00-\x1f]/.test(value)) throw new Error('名字请用1至12个字，不含特殊控制符'); return value.trim(); }
function inputsFor(state, id, variant, n, preferPrime) {
  const inputs = []; let prime = 0, total = 0;
  for (const [item, amount] of recipeCost(id, variant)) {
    let needed = amount * n; total += needed;
    const primeId = `${item}_prime`;
    if (preferPrime && PANTRY[primeId]) { const used = Math.min(needed, availableIngredient(state, primeId)); if (used) { inputs.push({ id: primeId, count: used }); needed -= used; prime += used; } }
    const normal = Math.min(needed, availableIngredient(state, item));
    if (normal) { inputs.push({ id: item, count: normal }); needed -= normal; }
    if (needed && PANTRY[primeId] && !preferPrime) { const used = Math.min(needed, availableIngredient(state, primeId)); if (used) { inputs.push({ id: primeId, count: used }); needed -= used; prime += used; } }
    if (needed) throw new Error(`${PANTRY[item]?.name || CROP[item]?.name}不足`);
  }
  return { inputs, primeRatio: total ? prime / total : 0 };
}
function cookRequest(state, action, n) {
  const h = state.homestead, recipeId = action.recipe, variant = action.variant || 'plain';
  const unlocked = recipeUnlock(state, recipeId);
  if (!unlocked.ok) throw new Error(unlocked.reason);
  if (!['plain', 'milky'].includes(variant) || (variant === 'milky' && !RECIPE[recipeId].milkOption)) throw new Error('这道菜没有该变体');
  return { recipe: recipeId, variant, count: n, ...inputsFor(state, recipeId, variant, n, !!action.preferPrime) };
}
export function getCookingPreview(state, recipeId, variant = 'plain', preferPrime = false, n = 1) {
  try {
    const task = cookRequest(state, { recipe: recipeId, variant, preferPrime }, count(n, 5));
    const learned = state.homestead?.mastery?.[recipeId] || { operation: 32, plating: 20 };
    const mastery = { ...learned, technique: Object.hasOwn(learned, 'technique') ? learned.technique : learned.operation };
    const result = cookingQuality({ ...task, ...mastery });
    return { ok: true, inputs: task.inputs, primeRatio: task.primeRatio, materialBonus: result.ingredientBonus, count: n, mastery, quality: result.quality, score: result.score };
  } catch (error) { return { ok: false, message: error.message, inputs: [], primeRatio: 0, materialBonus: 0, count: n }; }
}
function completeDish(state, task, now, escrow = false) {
  const h = state.homestead;
  if (!escrow) for (const input of task.inputs) takeIngredient(state, input.id, input.count);
  const { score, quality, technique } = cookingQuality(task);
  const key = dishKey(task.recipe, quality, task.variant);
  add(h.dishes, key, task.count); add(h.history, task.recipe, task.count);
  const old = h.book[task.recipe];
  h.book[task.recipe] = { count: h.history[task.recipe], best: old && qualityRank[old.best] > qualityRank[quality] ? old.best : quality, firstDay: old?.firstDay || homesteadDay(now) };
  const mastery = h.mastery[task.recipe] || { operation: 0, plating: 0 };
  h.mastery[task.recipe] = { operation: Math.max(mastery.operation, task.operation), plating: Math.max(mastery.plating, task.plating), technique: Math.max(Object.hasOwn(mastery, 'technique') ? mastery.technique : mastery.operation, technique) };
  if (h.prep?.recipe === task.recipe && h.prep.variant === task.variant) h.prep = null;
  return { key, quality, count: task.count, score };
}
export function getHomesteadOrders(state, now = Date.now()) {
  const day = homesteadDay(Math.max(now, state.homestead?.lastNow || 0));
  const done = state.homestead?.orderDay === day;
  const pool = RECIPES.filter(r => r.id !== 'egg_custard');
  const index = Math.floor(Date.parse(`${day}T00:00:00Z`) / (24 * 60 * MINUTE));
  // Choices depend only on the date. Inventory, cooking history and reopening
  // the panel never reroll an order; the first choice remains obtainable by all.
  return [{ id: `order_${day}`, recipe: 'egg_custard', name: '大喵的暖心蛋羹', count: 1, bonus: 25, done },
    ...[0, 11].map((offset, i) => {
      const r = pool[((index + offset) % pool.length + pool.length) % pool.length];
      return { id: `order_${day}_${r.id}`, recipe: r.id, name: `邻里的${r.name}`, count: 1, bonus: i ? 50 : 35, done };
    })];
}
export function getHomesteadOrder(state, now = Date.now()) { return getHomesteadOrders(state, now)[0]; }
export function getRehomePreview(state, animalId, now = Date.now()) {
  if (!state.homestead?.animals?.some(a => a.id === animalId)) return { ok: false, reason: '没有找到这只动物' };
  if (state.homestead.animals.length <= 1) return { ok: false, reason: '至少留下一只动物陪伴家园' };
  const draft = { ...state, homestead: clone(state.homestead) };
  advanceHomestead(draft, Math.max(now, draft.homestead.lastNow));
  const a = animal(draft.homestead, animalId), product = ANIMAL[a.kind].product, products = {};
  if (a.ready) products[product] = a.ready;
  if (a.readyPrime) products[`${product}_prime`] = a.readyPrime;
  return { ok: true, animalId, name: a.name, feed: a.feed + ((a.cycleAt || a.pausedMs) && !a.cycleEmergency ? 1 : 0), products, coins: 0 };
}
function assertTableAvailable(h, surface) {
  if (h.tea?.surface === surface) throw new Error('这张桌正在招待来客，请先结束或取消招待再操作桌上料理');
}
function taste(key) { return { message: '尝了一口自己做的菜，心情暖暖的', key }; }
function dishTags(key) { const dish = parseDishKey(key); return [...RECIPE[dish.recipe].tags, ...(dish.variant === 'milky' ? ['milky'] : [])]; }
// 菜单提示与结算共用味型；只从已选料理派生，不写存档或预支关系奖励。
export function getTeaMenuPreview(keys = [], guestIds = [], served = {}) {
  const dishes = (Array.isArray(keys) ? keys : []).filter(key => parseDishKey(key)).slice(0, 3).map(key => {
    const { recipe, quality, variant } = parseDishKey(key);
    return { key, recipe, quality, variant, name: RECIPE[recipe].name, tags: dishTags(key) };
  });
  const guests = [...new Set(Array.isArray(guestIds) ? guestIds : [])].filter(id => NPC_IDS.includes(id)).slice(0, 2).map(id => {
    const preference = PREFERENCES[id], delivered = record(served) && Object.hasOwn(served, id) ? dishes.find(dish => dish.key === served[id]) : null;
    const dish = delivered || dishes.find(dish => dish.tags.includes(preference)) || dishes[0];
    return { id, preference, served: !!delivered, liked: !!dish?.tags.includes(preference), key: dish?.key || null, recipe: dish?.recipe || null };
  });
  const unique = [...new Map(dishes.map(dish => [dish.recipe, dish])).values()];
  let theme = null;
  if (unique.some(dish => dish.recipe === 'moon_cake') && unique.some(dish => dish.recipe === 'goat_moon_milk')) {
    theme = { id: 'moon-toast', title: '月亮碰杯', line: '星光糕旁放着月光山羊奶，像把两轮小月亮请到了桌边。' };
  } else if (unique.some(dish => dish.tags.includes('sweet') && unique.some(other => other.recipe !== dish.recipe && other.tags.includes('drink')))) {
    theme = { id: 'sweet-drink', title: '一甜一饮', line: '先尝一口甜，再喝一小口茶饮，慢慢聊到杯子见底。' };
  } else if (unique.filter(dish => dish.tags.includes('fresh')).length >= 2) {
    theme = { id: 'orchard', title: '果园小聚', line: '两道不同的清新料理挨在一起，桌边好像吹来了果园的风。' };
  }
  return { dishes, guests, theme };
}
function relation(state, id, key, now) {
  const h = state.homestead, day = homesteadDay(now), first = h.giftDays[id] !== day;
  const liked = dishTags(key).includes(PREFERENCES[id]);
  if (first) {
    h.giftDays[id] = day;
    if (id !== 'momo') state.npc[id].t = Math.min(Number.MAX_SAFE_INTEGER, (state.npc[id].t || 0) + (liked ? 2 : 1));
  }
  return { liked, first, resident: id };
}

function execute(state, action, now) {
  const h = state.homestead, day = homesteadDay(now);
  switch (action.type) {
    case 'planRecipe': {
      const variant = action.variant === undefined ? 'plain' : action.variant;
      if (typeof action.recipe !== 'string' || !parseDishKey(dishKey(action.recipe, 'normal', variant))) throw new Error('备餐清单的菜谱或变体无效');
      h.prep = { recipe: action.recipe, variant };
      state.settings.track = 'homestead'; state.settings.questOff = false;
      return { message: `开始准备${RECIPE[action.recipe].name}，食材会记在备餐清单里`, recipe: action.recipe, variant };
    }
    case 'clearRecipePlan':
      h.prep = null; return { message: '已收起这份备餐清单，食材和料理仍然保留' };
    case 'tutorial':
      if (h.tutorial) throw new Error('迎新鸡蛋和小鸡已经领过啦');
      h.tutorial = true; add(state.decor, 'ranch_coop', 1);
      h.animals.push(makeAnimal(h, 'chicken', '奶油')); add(h.pantry, 'egg', 1); add(h.pantry, 'feed', 4);
      return { message: '奶油鸡舍、小鸡奶油、4份饲料和1枚鸡蛋已到家，先进入家园装修摆好奶油鸡舍吧' };
    case 'adopt': {
      const kind = action.kind;
      if (typeof kind !== 'string' || !Object.hasOwn(ANIMAL, kind)) throw new Error('未知动物');
      if (!h.tutorial) throw new Error('先领取牧场迎新礼');
      if (h.animals.length >= 16) throw new Error('家园最多照顾16只动物');
      if (getAnimalHousing(state).availableByKind[kind] < 1) throw new Error(`先在家园地面摆放有空位的${Object.values(HOUSING).find(v => v.kinds.includes(kind)).name}`);
      if (kind === 'cow' && Object.values(h.history).filter(n => n > 0).length < 2) throw new Error('完成两种不同料理后，奶牛就能入住');
      if (kind === 'sheep' && h.teaCount < 1) throw new Error('完成一次真实招待后，绵羊就能入住');
      spend(state, ANIMAL[kind].price);
      const a = makeAnimal(h, kind, action.name ? checkName(action.name) : ''); h.animals.push(a);
      a.housingKey = getAnimalHousing(state).assignments[a.id];
      return { message: `${a.name}住进了家园里的住处`, animalId: a.id };
    }
    case 'upgradeRanch': {
      throw new Error('请在家园装修里建造奶油鸡舍、红顶畜棚或胡萝卜兔舍来增加住处，每栋4位，最多照顾16只动物');
    }
    case 'feed': {
      if (action.animalId !== undefined && action.animalIds !== undefined) throw new Error('请指定一只动物或一个动物分组');
      if (action.animalIds !== undefined && (!Array.isArray(action.animalIds) || !integer(action.animalIds.length, 1, 16) || new Set(action.animalIds).size !== action.animalIds.length)) throw new Error('动物分组无效');
      const selected = action.animalId !== undefined ? [animal(h, action.animalId)] : action.animalIds ? action.animalIds.map(id => animal(h, id)) : h.animals;
      const hunger = a => !a.cycleAt && !a.pausedMs && !a.feed && !a.emergency ? (a.housingKey ? 0 : 1) : 2;
      const targets = [...selected].sort((a, b) => hunger(a) - hunger(b));
      if (!targets.length) throw new Error('牧场还没有动物');
      const limit = action.count === undefined ? 64 : count(action.count, 64);
      const budget = action.emergency ? limit : Math.min(limit, availableIngredient(state, 'feed'));
      if (!budget) throw new Error('还没有通用饲料，可以用小麦制作、购买或先添免费草料');
      let used = 0, replaced = 0; const fed = new Set();
      // Allocate before starting cycles: consuming the first ration immediately
      // must not let an earlier animal receive a second turn ahead of its peers.
      for (let level = 0; level < 4 && used < budget; level++) for (const a of targets) {
        if (used >= budget) break;
        if (a.feed + a.emergency > level) continue;
        if (action.emergency) a.emergency++; else a.feed++;
        used++; fed.add(a.id);
      }
      // Replace only queued grass. The active/paused ration and its deadline,
      // quality and duration are already reserved and remain untouched.
      if (!action.emergency) for (let round = 0; round < 4 && used < budget; round++) for (const a of targets) {
        if (used >= budget) break;
        if (!a.emergency) continue;
        a.emergency--; a.feed++; used++; replaced++; fed.add(a.id);
      }
      if (!used) throw new Error(action.emergency ? '料槽已经满了' : '待用料槽已装满普通饲料');
      if (!action.emergency) takeIngredient(state, 'feed', used);
      for (const a of targets) if (fed.has(a.id)) startCycle(a, now);
      return { message: action.emergency ? `补充${used}份免费草料，周期较慢且固定普通品质` : `添好了${used}份饲料${replaced ? `，其中${replaced}份替换了待用草料` : ''}`, count: used, used, replaced, fedIds: [...fed] };
    }
    case 'rehome': {
      const a = animal(h, action.animalId);
      const preview = getRehomePreview(state, a.id, now);
      if (!preview.ok) throw new Error(preview.reason);
      if (typeof action.confirmName !== 'string' || action.confirmName !== a.name) throw new Error('请准确输入这只动物的名字，再确认送养');
      if (preview.feed) add(h.pantry, 'feed', preview.feed);
      for (const [id, n] of Object.entries(preview.products)) add(h.pantry, id, n);
      h.animals = h.animals.filter(v => v.id !== a.id);
      return { message: `${a.name}已交给新家庭照顾，待用普通饲料和未收产物已退回；领养费用不返还`, ...preview };
    }
    case 'pet': {
      const a = animal(h, action.animalId), first = a.petDay !== day, beforeLove = a.love;
      if (first) { a.love = Math.min(100, a.love + 8); a.petDay = day; a.carePending = true; }
      const loveGain = a.love - beforeLove;
      return { message: first ? loveGain ? `${a.name}开心地蹭了蹭你，亲密+${loveGain}` : `${a.name}和你已经很亲密啦，也记住了今天的照料` : `${a.name}记得今天的照料，开心地回应你`, first, loveGain };
    }
    case 'rename': { const a = animal(h, action.animalId); a.name = checkName(action.name); return { message: `以后就叫${a.name}啦` }; }
    case 'graze': { const a = animal(h, action.animalId); if (typeof action.value !== 'boolean') throw new Error('放牧状态无效'); a.grazing = action.value; return { message: a.grazing ? '去安全草地散步吧' : '动物回到棚舍休息' }; }
    case 'collect': {
      const targets = action.animalId ? [animal(h, action.animalId)] : h.animals, collected = {};
      for (const a of targets) {
        const p = ANIMAL[a.kind].product;
        if (a.ready) { add(h.pantry, p, a.ready); add(collected, p, a.ready); }
        if (a.readyPrime) { add(h.pantry, `${p}_prime`, a.readyPrime); add(collected, `${p}_prime`, a.readyPrime); }
        a.ready = 0; a.readyPrime = 0; startCycle(a, now);
      }
      if (!Object.keys(collected).length) throw new Error('动物还在慢慢准备，暂时没有可收的产物');
      return { message: '牧场产物已收进食材柜', collected };
    }
    case 'buyFeed': { const n = count(action.count); spend(state, n * 26); add(h.pantry, 'feed', n); return { message: `买到了${n}份饲料` }; }
    case 'makeFeed': { const n = count(action.count); takeIngredient(state, 'wheat', n); add(h.pantry, 'feed', n * 2); return { message: `${n}份小麦换成${n * 2}份饲料` }; }
    case 'sellIngredient': {
      const n = count(action.count), item = PANTRY[action.item];
      if (!item?.sell) throw new Error('这种物品不能出售');
      takeIngredient(state, item.id, n); const coins = item.sell * n; earn(state, coins); return { message: `售出${item.name}，获得${coins}噗灵`, coins };
    }
    case 'process': {
      if (!['cheese', 'yogurt'].includes(action.item)) throw new Error('未知加工品');
      const n = count(action.count, 5), required = n * (action.item === 'cheese' ? 2 : 1);
      const normal = Math.min(required, availableIngredient(state, 'milk'));
      if (normal) takeIngredient(state, 'milk', normal);
      if (normal < required) takeIngredient(state, 'milk_prime', required - normal);
      add(h.pantry, action.item, n); return { message: `完成${n}份${PANTRY[action.item].name}`, count: n };
    }
    case 'cookStart': {
      if (h.cooking) throw new Error('先完成或取消正在制作的菜');
      const t = { id: unique(h, 'cook'), ...cookRequest(state, action, 1), startedAt: now, readyAt: now + 24000, activeMs: 0, operation: 0, plating: 0, technique: 0 };
      for (const input of t.inputs) takeIngredient(state, input.id, input.count);
      h.cooking = t; return { message: '食材已预留，离开后可继续或取消', taskId: t.id };
    }
    case 'cookStep': {
      const t = h.cooking;
      if (!t || action.taskId !== t.id) throw new Error('这次制作已结束');
      if (!integer(action.activeMs, 0, 24000) || !integer(action.operation, 0, 40) || typeof action.plated !== 'boolean') throw new Error('制作步骤无效');
      // Old tasks keep their earned operation score until a new client supplies
      // technique. New tasks cannot omit it or improve an already committed step.
      if (Object.hasOwn(t, 'technique') || Object.hasOwn(action, 'technique')) {
        const prior = Object.hasOwn(t, 'technique') ? t.technique : t.operation;
        if (!integer(action.technique, 0, action.operation) || action.operation < t.operation || action.technique < prior || action.technique - prior > action.operation - t.operation) throw new Error('制作技法进度无效');
        t.technique = action.technique;
      }
      t.activeMs = Math.max(t.activeMs, action.activeMs); t.operation = Math.max(t.operation, action.operation); t.plating = Math.max(t.plating, action.plated ? 20 : 0);
      return { message: '制作进度已保存' };
    }
    case 'cookFinish': {
      const t = h.cooking;
      if (!t || action.taskId !== t.id) throw new Error('这次制作已结算或取消');
      if (t.activeMs < RECIPE[t.recipe].seconds * 1000 || t.operation < 40 || t.plating !== 20) throw new Error('继续完成当前料理步骤吧');
      h.cooking = null; const result = completeDish(state, t, now, true);
      return { ...result, message: `${RECIPE[t.recipe].name}做好了！可以摆桌、品尝或出售` };
    }
    case 'cookCancel': {
      if (!h.cooking || action.taskId !== h.cooking.id) throw new Error('这次制作已结束');
      for (const input of h.cooking.inputs) add(stock(state, input.id), input.id, input.count);
      h.cooking = null; return { message: '已取消制作，全部预留食材已退回柜中' };
    }
    case 'quickCook': {
      const n = count(action.count || 1, 5), history = h.history[action.recipe] || 0;
      if (history < 1 || (n > 1 && history < 3)) throw new Error(history < 1 ? '亲手做过一次后开放快捷制作' : '做满3次后可以批量制作');
      const t = { ...cookRequest(state, action, n), ...(h.mastery[action.recipe] || { operation: 32, plating: 20 }) };
      const result = completeDish(state, t, now);
      return { ...result, message: `做好了${n}份${RECIPE[t.recipe].name}` };
    }
    case 'favorite': {
      if (!RECIPE[action.recipe] || typeof action.value !== 'boolean') throw new Error('菜谱收藏无效');
      h.favorites = h.favorites.filter(id => id !== action.recipe); if (action.value) h.favorites.push(action.recipe);
      return { message: action.value ? '已加入想做清单' : '已移出想做清单' };
    }
    case 'place': {
      if (h.placed.length >= 12) throw new Error('最多同时摆放12份料理');
      if (!['home', 'house', 'build'].includes(action.zone) || typeof action.surface !== 'string' || !/^[a-zA-Z0-9_.-]{1,120}$/.test(action.surface) || !['a0', 'a1', 'a2', 'a3'].includes(action.anchor) || !integer(action.rotation ?? 0, 0, 3)) throw new Error('请选一个有效的餐桌位置');
      const surface = getDishSurfaces(state).find(v => v.id === action.surface && v.zone === action.zone);
      if (!surface || Number(action.anchor.slice(1)) >= surface.capacity) throw new Error('这个桌面位置已移动、收回或不能摆盘，请重新选择');
      assertTableAvailable(h, action.surface);
      if (h.placed.some(p => p.zone === action.zone && p.surface === action.surface && p.anchor === action.anchor)) throw new Error('这个桌面位置已经有菜了');
      takeDish(state, action.key);
      const p = { id: unique(h, 'dish'), key: action.key, zone: action.zone, surface: action.surface, anchor: action.anchor, rotation: action.rotation || 0 };
      h.placed.push(p); return { message: '料理端上了桌，取回后才能出售或赠送', instanceId: p.id };
    }
    case 'rotate': { const p = h.placed.find(v => v.id === action.instanceId); if (!p) throw new Error('这份料理已经取回'); assertTableAvailable(h, p.surface); p.rotation = (p.rotation + 1) % 4; return { message: '轻轻转好了餐盘' }; }
    case 'retrieve': {
      const index = h.placed.findIndex(v => v.id === action.instanceId); if (index < 0) throw new Error('这份料理已经取回');
      assertTableAvailable(h, h.placed[index].surface);
      const [p] = h.placed.splice(index, 1); add(h.dishes, p.key, 1); return { message: '料理已取回冰箱', key: p.key };
    }
    case 'retrieveAll': {
      const picked = h.placed.filter(p => (!action.zone || p.zone === action.zone) && (!action.surface || p.surface === action.surface));
      for (const p of picked) assertTableAvailable(h, p.surface);
      for (const p of picked) add(h.dishes, p.key, 1);
      const ids = new Set(picked.map(p => p.id)); h.placed = h.placed.filter(p => !ids.has(p.id)); return { message: '桌上料理已安全收回', count: picked.length };
    }
    case 'sellDish': { const n = count(action.count || 1); takeDish(state, action.key, n); const coins = dishPrice(action.key) * n; earn(state, coins); return { message: `售出${n}份料理，获得${coins}噗灵`, coins }; }
    case 'eat': { takeDish(state, action.key); return taste(action.key); }
    case 'eatPlaced': {
      const index = h.placed.findIndex(v => v.id === action.instanceId); if (index < 0) throw new Error('这份料理已经取回或品尝过');
      const p = h.placed[index]; assertTableAvailable(h, p.surface);
      if (!getDishSurfaces(state).some(v => v.id === p.surface && v.zone === p.zone && Number(p.anchor.slice(1)) < v.capacity)) throw new Error('餐桌已经移动，请先取回料理');
      h.placed.splice(index, 1); return { ...taste(p.key), instanceId: p.id };
    }
    case 'gift': {
      if (!known(state, action.resident)) throw new Error('先认识这位居民，再请对方品尝吧');
      takeDish(state, action.key); const feedback = relation(state, action.resident, action.key, now);
      return { ...feedback, message: feedback.liked ? '这正是喜欢的味道！对方开心地道谢' : '收到亲手做的料理，对方很开心' };
    }
    case 'teaStart': {
      if (h.tea) throw new Error('先完成或取消这场茶会');
      if (!Array.isArray(action.keys) || !integer(action.keys.length, 1, 3) || !Array.isArray(action.guests) || !integer(action.guests.length, 1, 2) || new Set(action.guests).size !== action.guests.length || !action.guests.every(id => known(state, id))) throw new Error('选择1至3份菜和1至2位已认识的来客');
      const surfaces = getTeaSurfaces(state), surface = action.surface === undefined ? surfaces[0] : surfaces.find(v => v.id === action.surface);
      if (!surface) throw new Error('先在家园或房间装修摆好餐桌或野餐桌，再邀请来客');
      if (action.keys.length > surface.capacity) throw new Error(`这张桌最多摆${surface.capacity}道菜，请换大桌或减少菜品`);
      const needed = {}; for (const key of action.keys) { if (!parseDishKey(key)) throw new Error('料理无效'); add(needed, key, 1); }
      for (const [key, n] of Object.entries(needed)) if (availableDish(state, key) < n) throw new Error('茶会需要的料理不足');
      for (const key of action.keys) takeDish(state, key);
      h.tea = { id: unique(h, 'tea'), keys: [...action.keys], guests: [...action.guests], served: {}, surface: surface.id, startedAt: now, readyAt: now + 30000 };
      return { message: '菜品已为茶会预留，大喵和来客准备品尝', taskId: h.tea.id };
    }
    case 'teaServe': {
      const t = h.tea;
      if (!t || t.id !== action.taskId) throw new Error('这场茶会已结束');
      if (typeof action.guest !== 'string' || !t.guests.includes(action.guest)) throw new Error('这位朋友没有参加本场茶会');
      if (typeof action.key !== 'string' || !parseDishKey(action.key) || !t.keys.includes(action.key)) throw new Error('请递上本场茶会已经预留的料理');
      if (!getTeaSurfaces(state).some(v => v.id === t.surface)) throw new Error('招待餐桌已移动或收回，请取消茶会取回菜品');
      const previous = t.served?.[action.guest];
      if (previous && previous !== action.key) throw new Error('这位朋友已经开始品尝第一道菜啦');
      if (!t.served) t.served = {};
      t.served[action.guest] = action.key;
      const liked = dishTags(action.key).includes(PREFERENCES[action.guest]);
      return { changed: !previous, guest: action.guest, key: action.key, liked, quality: parseDishKey(action.key).quality,
        message: previous ? '这道料理已经递到朋友手里啦' : liked ? '这正是朋友喜欢的味道！' : '朋友接过料理，准备慢慢品尝' };
    }
    case 'teaCancel': {
      if (!h.tea || h.tea.id !== action.taskId) throw new Error('这场茶会已结束');
      for (const key of h.tea.keys) add(h.dishes, key, 1);
      h.tea = null; return { message: '取消了茶会，预留的菜品全部退回' };
    }
    case 'teaFinish': {
      const t = h.tea;
      if (!t || t.id !== action.taskId) throw new Error('这场茶会已结算或取消');
      if (!getTeaSurfaces(state).some(v => v.id === t.surface)) throw new Error('招待餐桌已移动或收回，请取消茶会取回菜品');
      if (!action.skip && now < t.readyAt) throw new Error('来客还在品尝，也可以跳过演出直接结算');
      h.tea = null;
      const first = h.teaDay !== day;
      if (first) h.teaDay = day;
      h.teaCount++; const feedback = getTeaMenuPreview(t.keys, t.guests, t.served).guests.map(guest => relation(state, guest.id, guest.key, now));
      return { message: feedback.some(v => v.first) ? '茶会结束，来客记住了这顿暖心料理' : '茶会结束，这些来客今天的关系奖励已领过，仍很开心', coins: 0, first, feedback };
    }
    case 'order': {
      const orders = getHomesteadOrders(state, now), recipeId = parseDishKey(action.key)?.recipe;
      const order = action.orderId === undefined ? orders.find(v => v.recipe === recipeId) : orders.find(v => v.id === action.orderId);
      if (!order) throw new Error('这道菜不在今天的订单中，请查看当前订单');
      if (order.done) throw new Error('今天的料理订单已经完成，明天再来吧');
      if (recipeId !== order.recipe) throw new Error(`这份订单需要${RECIPE[order.recipe].name}`);
      takeDish(state, action.key); const coins = dishPrice(action.key) + order.bonus; earn(state, coins); h.orderDay = day;
      return { message: `完成${RECIPE[order.recipe].name}订单，收到${coins}噗灵`, coins, orderId: order.id };
    }
    case 'woolTrade': {
      const trade = WOOL_TRADES.find(v => v.id === action.trade); if (!trade) throw new Error('未知羊毛工艺单');
      if (h.teaCount < 1) throw new Error('完成一次招待后开放羊毛工艺');
      if (trade.kind === 'owned' && state.owned.includes(trade.item)) throw new Error('你已经拥有这顶帽子');
      for (const [id, n] of trade.cost) {
        const normal = Math.min(n, availableIngredient(state, id));
        if (normal) takeIngredient(state, id, normal);
        if (normal < n) takeIngredient(state, `${id}_prime`, n - normal);
      }
      if (trade.kind === 'decor') add(state.decor, trade.item, 1); else state.owned.push(trade.item);
      return { message: `绒毛换成了${trade.name}`, item: trade.item };
    }
    default: throw new Error('未知牧场或厨房操作');
  }
}

export function performHomestead(state, action, now = Date.now()) {
  if (!record(state) || !record(action) || !integer(now, 0, MAX_TIME - 8 * 60 * MINUTE)) return { ok: false, message: '操作参数无效' };
  try {
    // Validate explicit new data before JSON cloning can erase undefined or turn
    // a non-plain object into a different, apparently valid served map.
    if (state.homestead && (Object.hasOwn(state.homestead, 'prep') || state.homestead.tea && Object.hasOwn(state.homestead.tea, 'served'))) {
      const issues = validateHomesteadState(state); if (issues.length) return { ok: false, message: `牧场存档需要修复：${issues[0]}` };
    }
    // Clone only the fields this module owns or may change. Failed transactions never leak a partial payment or reservation.
    const draft = { homestead: state.homestead ? clone(state.homestead) : createHomestead(state, now), coins: state.coins ?? 0,
      crops: clone(state.crops || {}), npc: clone(state.npc || {}), decor: clone(state.decor || {}), owned: [...(state.owned || [])],
      placed: clone(state.placed || []), placedIn: clone(state.placedIn || []), buildPlaced: clone(state.buildPlaced || []), yardLv: state.yardLv, house: state.house,
      ...(action.type === 'planRecipe' ? { settings: clone(state.settings || {}) } : {}) };
    if (!integer(draft.coins, 0, Number.MAX_SAFE_INTEGER)) throw new Error('噗灵数据无效，未执行这次操作');
    migrateHomestead(draft, now);
    const invalid = validateHomesteadState(draft); if (invalid.length) return { ok: false, message: `牧场存档需要修复：${invalid[0]}` };
    const h = draft.homestead;
    if (action.requestId !== undefined) {
      if (typeof action.requestId !== 'string' || action.requestId.length < 1 || action.requestId.length > 100 || /[\x00-\x1f]/.test(action.requestId)) throw new Error('交易编号无效');
      if (h.receipts.includes(action.requestId)) return { ok: false, duplicate: true, message: '这次操作已经完成' };
    }
    advanceHomestead(draft, now);
    h.lastNow = Math.max(h.lastNow, now);
    const result = execute(draft, action, h.lastNow);
    if (!integer(draft.coins, 0, Number.MAX_SAFE_INTEGER)) throw new Error('噗灵结算无效，已保留原物品');
    if (action.requestId !== undefined) { h.receipts.push(action.requestId); if (h.receipts.length > 256) h.receipts.shift(); }
    const after = validateHomesteadState(draft); if (after.length) throw new Error(`无法保存这次操作：${after[0]}`);
    for (const key of ['homestead', 'coins', 'crops', 'npc', 'decor', 'owned', ...(action.type === 'planRecipe' ? ['settings'] : [])]) state[key] = draft[key];
    return { ok: true, ...result };
  } catch (error) { return { ok: false, message: error.message || '操作未完成，物品已保留' }; }
}

// Shared client/server strict schema. No repairs or coercion here: import preview must explain corruption.
export function validateHomestead(raw) {
  const errors = [];
  const bad = (p, message) => { if (errors.length < 64) errors.push(`${p}: ${message}`); };
  const obj = (v, p, keys, optional = []) => {
    if (!record(v)) { bad(p, '应为对象'); return false; }
    if (keys) {
      for (const k of Object.keys(v)) if (!keys.includes(k) && !optional.includes(k)) bad(`${p}.${k}`, '未知字段');
      for (const k of keys) if (!Object.hasOwn(v, k)) bad(`${p}.${k}`, '缺少字段');
    }
    return true;
  };
  const num = (v, p, min = 0, max = MAX) => { if (!integer(v, min, max)) bad(p, '应为范围内的安全整数'); };
  const bool = (v, p) => { if (typeof v !== 'boolean') bad(p, '应为布尔值'); };
  const text = (v, p, max = 120) => { if (typeof v !== 'string' || v.length > max || /[\x00-\x1f]/.test(v)) bad(p, '文本无效'); };
  const day = (v, p) => { if (typeof v !== 'string' || !dayPattern.test(v)) bad(p, '现实日期无效'); };
  const list = (v, p, max) => { if (!Array.isArray(v) || v.length > max) { bad(p, '列表无效或超过容量'); return []; } return v; };
  const map = (v, p, ids) => { if (obj(v, p)) for (const [k, n] of Object.entries(v)) { if (!ids(k)) bad(`${p}.${k}`, '未知物品ID'); num(n, `${p}.${k}`); } };
  const fields = ['version', 'serial', 'tutorial', 'ranchLevel', 'animals', 'pantry', 'dishes', 'placed', 'cooking', 'tea', 'history', 'mastery', 'book', 'favorites', 'giftDays', 'teaDay', 'orderDay', 'teaCount', 'lastNow', 'receipts'];
  if (!obj(raw, 'homestead', fields, ['prep'])) return errors;
  if (Object.hasOwn(raw, 'prep') && raw.prep !== null && obj(raw.prep, 'prep', ['recipe', 'variant'])) {
    const p = raw.prep;
    if (typeof p.recipe !== 'string' || !Object.hasOwn(RECIPE, p.recipe) || !['plain', 'milky'].includes(p.variant) || p.variant === 'milky' && !RECIPE[p.recipe]?.milkOption) bad('prep', '备餐菜谱或变体无效');
  }
  if (![1, 2].includes(raw.version)) bad('version', '版本无效');
  const legacy = raw.version === 1;
  num(raw.serial, 'serial', 1, 1000000000); bool(raw.tutorial, 'tutorial'); num(raw.ranchLevel, 'ranchLevel', 0, 3);
  num(raw.lastNow, 'lastNow', 0, MAX_TIME - 8 * 60 * MINUTE); num(raw.teaCount, 'teaCount');
  if (legacy && raw.tutorial !== (raw.ranchLevel > 0)) bad('tutorial', '牧场开启状态不一致');
  if (!legacy && raw.ranchLevel !== 0) bad('ranchLevel', '旧牧场等级应已转换为家园住处');
  const instances = new Set(), checkId = (id, p) => {
    if (typeof id !== 'string' || !idPattern.test(id) || instances.has(id)) bad(p, '实例编号无效或重复');
    instances.add(id);
    const n = Number(String(id).split('_').pop()); if (!integer(n, 1, 1000000000) || n >= raw.serial) bad(p, '实例编号超出序列');
  };
  for (const [i, a] of list(raw.animals, 'animals', legacy ? 8 : 16).entries()) {
    const p = `animals.${i}`;
    if (!obj(a, p, ['id', 'kind', 'name', 'look', 'personality', 'love', 'grazing', 'feed', 'emergency', 'cycleAt', 'cycleEmergency', 'cyclePrime', 'carePending', 'ready', 'readyPrime', 'petDay', ...(legacy ? [] : ['housingKey', 'pausedMs'])])) continue;
    checkId(a.id, `${p}.id`); if (typeof a.kind !== 'string' || !Object.hasOwn(ANIMAL, a.kind)) bad(`${p}.kind`, '动物种类无效');
    if (legacy && !['chicken', 'cow', 'sheep'].includes(a.kind)) bad(`${p}.kind`, '旧版动物种类无效');
    try { checkName(a.name); } catch { bad(`${p}.name`, '名字无效'); }
    num(a.look, `${p}.look`, 0, 2); if (!['shy', 'friendly', 'lively'].includes(a.personality)) bad(`${p}.personality`, '性格无效');
    num(a.love, `${p}.love`, 0, 100); bool(a.grazing, `${p}.grazing`); bool(a.cycleEmergency, `${p}.cycleEmergency`); bool(a.cyclePrime, `${p}.cyclePrime`);
    bool(a.carePending, `${p}.carePending`);
    for (const k of ['feed', 'emergency', 'ready', 'readyPrime']) num(a[k], `${p}.${k}`, 0, 4);
    if (a.feed + a.emergency > 4 || a.ready + a.readyPrime > 4) bad(p, '饲料或产物超过容量');
    const hasCycle = !!a.cycleAt || (!legacy && !!a.pausedMs);
    if (a.ready + a.readyPrime >= 4 && hasCycle) bad(p, '满仓动物不能继续生产');
    if (!hasCycle && a.cycleEmergency) bad(p, '空周期不能标记草料');
    if ((!hasCycle || a.cycleEmergency) && a.cyclePrime) bad(p, '应急或空周期不能产优选');
    if (!legacy) {
      num(a.pausedMs, `${p}.pausedMs`, 0, (ANIMAL[a.kind]?.cycleMs || 28 * MINUTE) * (a.cycleEmergency ? 2 : 1));
      if (typeof a.housingKey !== 'string' || (a.housingKey !== '' && !/^home_ranch_(?:coop|barn|hutch)_\d+_\d+_[0-3]_0$/.test(a.housingKey))) bad(`${p}.housingKey`, '住处编号无效');
      if (a.pausedMs && (a.cycleAt || a.housingKey)) bad(p, '暂停周期不能同时在住处生产');
      if (a.cycleAt && !a.housingKey) bad(p, '无住处动物不能继续生产');
    }
    num(a.cycleAt, `${p}.cycleAt`, 0, MAX_TIME); day(a.petDay, `${p}.petDay`);
  }
  if (legacy && Array.isArray(raw.animals) && raw.animals.length > ([0, 2, 4, 8][raw.ranchLevel] || 0)) bad('animals', '超过旧牧场容量');
  map(raw.pantry, 'pantry', k => Object.hasOwn(PANTRY, k)); map(raw.dishes, 'dishes', k => !!parseDishKey(k));
  map(raw.history, 'history', k => Object.hasOwn(RECIPE, k));
  if (obj(raw.mastery, 'mastery')) for (const [id, m] of Object.entries(raw.mastery)) {
    if (!RECIPE[id]) bad(`mastery.${id}`, '未知菜谱');
    if (obj(m, `mastery.${id}`, ['operation', 'plating'], ['technique'])) {
      num(m.operation, `mastery.${id}.operation`, 0, 40); num(m.plating, `mastery.${id}.plating`, 0, 20);
      if (Object.hasOwn(m, 'technique')) num(m.technique, `mastery.${id}.technique`, 0, m.operation);
    }
  }
  if (obj(raw.book, 'book')) for (const [id, b] of Object.entries(raw.book)) {
    if (!RECIPE[id]) bad(`book.${id}`, '未知菜谱');
    if (obj(b, `book.${id}`, ['count', 'best', 'firstDay'])) { num(b.count, `book.${id}.count`); if (!Object.hasOwn(QUALITY, b.best)) bad(`book.${id}.best`, '品质无效'); day(b.firstDay, `book.${id}.firstDay`); }
  }
  const positions = new Set();
  for (const [i, p] of list(raw.placed, 'placed', 12).entries()) {
    if (!obj(p, `placed.${i}`, ['id', 'key', 'zone', 'surface', 'anchor', 'rotation'])) continue;
    checkId(p.id, `placed.${i}.id`); if (!parseDishKey(p.key)) bad(`placed.${i}.key`, '菜品无效');
    if (!(legacy ? ['home', 'house', 'build', 'ranch'] : ['home', 'house', 'build']).includes(p.zone)) bad(`placed.${i}.zone`, '房间无效'); text(p.surface, `placed.${i}.surface`); if (typeof p.surface !== 'string' || !/^[a-zA-Z0-9_.-]{1,120}$/.test(p.surface)) bad(`placed.${i}.surface`, '桌面编号无效');
    if (!['a0', 'a1', 'a2', 'a3'].includes(p.anchor)) bad(`placed.${i}.anchor`, '锚点无效'); num(p.rotation, `placed.${i}.rotation`, 0, 3);
    const pos = `${p.zone}:${p.surface}:${p.anchor}`; if (positions.has(pos)) bad(`placed.${i}`, '桌面位置重复'); positions.add(pos);
  }
  if (raw.cooking !== null) {
    const t = raw.cooking;
    if (obj(t, 'cooking', ['id', 'recipe', 'variant', 'count', 'inputs', 'primeRatio', 'startedAt', 'readyAt', 'activeMs', 'operation', 'plating'], ['technique'])) {
      checkId(t.id, 'cooking.id'); if (!parseDishKey(dishKey(t.recipe, 'normal', t.variant))) bad('cooking.recipe', '配方或变体无效');
      num(t.count, 'cooking.count', 1, 1); num(t.startedAt, 'cooking.startedAt', 0, MAX_TIME); num(t.readyAt, 'cooking.readyAt', 0, MAX_TIME);
      if (t.readyAt !== t.startedAt + 24000) bad('cooking.readyAt', '制作计时不一致');
      num(t.activeMs, 'cooking.activeMs', 0, 24000); num(t.operation, 'cooking.operation', 0, 40); num(t.plating, 'cooking.plating', 0, 20);
      if (Object.hasOwn(t, 'technique')) num(t.technique, 'cooking.technique', 0, t.operation);
      if (![0, 20].includes(t.plating)) bad('cooking.plating', '摆盘进度无效');
      const needs = Object.fromEntries(recipeCost(t.recipe, t.variant)), actual = {}, seen = new Set(); let total = 0, prime = 0;
      for (const [i, input] of list(t.inputs, 'cooking.inputs', 8).entries()) {
        if (!obj(input, `cooking.inputs.${i}`, ['id', 'count'])) continue;
        if ((!PANTRY[input.id] && !Object.hasOwn(CROP, input.id)) || seen.has(input.id)) bad(`cooking.inputs.${i}.id`, '食材无效或重复');
        seen.add(input.id); num(input.count, `cooking.inputs.${i}.count`, 1, 20);
        const base = String(input.id).replace(/_prime$/, ''); actual[base] = (actual[base] || 0) + input.count; total += input.count; if (base !== input.id) prime += input.count;
      }
      if (Object.keys(actual).length !== Object.keys(needs).length || Object.keys(needs).some(id => actual[id] !== needs[id])) bad('cooking.inputs', '预留与配方不一致');
      if (typeof t.primeRatio !== 'number' || !Number.isFinite(t.primeRatio) || Math.abs(t.primeRatio - (total ? prime / total : 0)) > 1e-9) bad('cooking.primeRatio', '优选比例不一致');
    }
  }
  if (raw.tea !== null) {
    const t = raw.tea;
    if (obj(t, 'tea', ['id', 'keys', 'guests', 'startedAt', 'readyAt', ...(legacy ? [] : ['surface'])], ['served'])) {
      checkId(t.id, 'tea.id'); const keys = list(t.keys, 'tea.keys', 3); if (!keys.length) bad('tea.keys', '至少一道菜');
      const needed = {}; for (const key of keys) { if (!parseDishKey(key)) bad('tea.keys', '菜品无效'); needed[key] = (needed[key] || 0) + 1; }
      const guests = list(t.guests, 'tea.guests', 2); if (!guests.length || new Set(guests).size !== guests.length || !guests.every(id => NPC_IDS.includes(id))) bad('tea.guests', '来客无效');
      if (Object.hasOwn(t, 'served') && obj(t.served, 'tea.served')) for (const [guest, key] of Object.entries(t.served)) {
        if (!guests.includes(guest)) bad(`tea.served.${guest}`, '未受邀的来客');
        if (typeof key !== 'string' || !parseDishKey(key) || !keys.includes(key)) bad(`tea.served.${guest}`, '不是本场预留的料理');
      }
      num(t.startedAt, 'tea.startedAt', 0, MAX_TIME); num(t.readyAt, 'tea.readyAt', 0, MAX_TIME); if (t.readyAt !== t.startedAt + 30000) bad('tea.readyAt', '茶会计时不一致');
      if (!legacy && (typeof t.surface !== 'string' || !/^(?:home|house|build)_(?:dining|ranch_picnic)_\d+_\d+_[0-3]_\d+$/.test(t.surface))) bad('tea.surface', '招待桌编号无效');
    }
  }
  const favorites = list(raw.favorites, 'favorites', legacy ? 12 : RECIPES.length); if (new Set(favorites).size !== favorites.length || favorites.some(id => !RECIPE[id])) bad('favorites', '菜谱无效或重复');
  if (obj(raw.giftDays, 'giftDays')) for (const [id, value] of Object.entries(raw.giftDays)) { if (!NPC_IDS.includes(id)) bad(`giftDays.${id}`, '居民无效'); day(value, `giftDays.${id}`); }
  day(raw.teaDay, 'teaDay'); day(raw.orderDay, 'orderDay');
  const receipts = list(raw.receipts, 'receipts', 256); if (new Set(receipts).size !== receipts.length) bad('receipts', '交易编号重复'); for (const r of receipts) { text(r, 'receipts', 100); if (!r) bad('receipts', '交易编号为空'); }
  return errors;
}
export function validateHomesteadState(state) {
  if (state.homestead === undefined) return [];
  const errors = validateHomestead(state.homestead);
  if (!errors.length && state.homestead.tea && state.homestead.tea.guests.some(id => !known(state, id))) errors.push('tea.guests: 尚未认识的来客');
  return errors;
}
