// One-portion preparation guidance derived from the saved plan and real sources.
// No inventory reservation, clock advancement, storage or scene dependencies.
import { ANIMALS, HOUSING, PANTRY, RECIPE, recipeCost, recipeUnlock, availableIngredient, getAnimalHousing } from './homestead.js';
import { CROP, FRUIT } from './farming.js';
import { DECO } from './furniture.js';

const stock = (state, id) => availableIngredient(state, id) + (PANTRY[`${id}_prime`] ? availableIngredient(state, `${id}_prime`) : 0);
const minutes = ms => `${Math.max(1, Math.ceil(ms / 60000))}分钟`;
const label = id => PANTRY[id]?.name || CROP[id]?.name || id;
const present = (state, id) => (state.placed || []).filter(p => p.id === id);
const owned = (state, id) => (state.decor?.[id] || 0) > 0;

function animalSource(state, id, now, housing) {
  const def = ANIMALS.find(a => a.product === id);
  if (!def) return { action: 'ranch', label: '查看牧场', detail: PANTRY[id]?.source || '查看材料来源', cost: 0, newSource: 0, blocked: 1 };
  const animals = (state.homestead?.animals || []).filter(a => a.kind === def.id);
  const home = Object.values(HOUSING).find(h => h.kinds.includes(def.id));
  const harvested = animals.find(a => a.ready + a.readyPrime > 0 || housing.assignments[a.id] && a.cycleAt && a.cycleAt <= now);
  if (harvested) return { action: 'collect', label: `收取${label(id)}`, detail: `${harvested.name}已经备好产物，收进冰箱后可继续备餐。`, animalId: harvested.id, status: 'collect', cost: 0, newSource: 0, blocked: 0 };
  const working = animals.filter(a => housing.assignments[a.id] && (a.cycleAt || a.pausedMs)).sort((a,b) => (a.cycleAt || now+a.pausedMs) - (b.cycleAt || now+b.pausedMs))[0];
  if (working) return { action: 'ranch', label: '查看生产进度', detail: `${working.name}正在准备${label(id)}，约${minutes((working.cycleAt || now+working.pausedMs)-now)}后可收取${working.cycleEmergency ? '；本轮是较慢的免费草料生产' : ''}。`, animalId: working.id, status: 'waiting', cost: 0, newSource: 0, blocked: 0 };
  const housed = animals.find(a => housing.assignments[a.id]);
  if (housed) return { action: stock(state, 'feed') ? 'feed' : 'ranch', label: stock(state, 'feed') ? '给伙伴添料' : '查看免费草料', detail: `${housed.name}还没开始下一轮，${stock(state, 'feed') ? '添入已有饲料' : '可先添免费草料'}后开始生产。`, animalId: housed.id, status: 'feed', cost: 0, newSource: 0, blocked: 0 };
  if (animals.length) return { action: 'build', label: `安排${home.name}`, detail: `${animals[0].name}等待安置；把有空位的${home.name}摆到家园后恢复生产。`, animalId: animals[0].id, furnitureId: home.id, zone: 'home', status: 'housing', cost: owned(state, home.id) ? 0 : DECO[home.id].price, newSource: 0, blocked: 0 };
  const made = Object.values(state.homestead?.history || {}).filter(n => n > 0).length;
  const gate = def.id === 'cow' && made < 2 ? `先完成两种不同料理（${made}/2）` : def.id === 'sheep' && !state.homestead?.teaCount ? '先完成一次招待' : '';
  const homeCost = housing.availableByKind[def.id] || owned(state, home.id) ? 0 : DECO[home.id].price;
  const cost = def.price + homeCost;
  return { action: 'ranch', label: `了解${def.name}的入住条件`, detail: `${label(id)}来自${def.name}；${gate ? gate+'；' : ''}${homeCost ? `${home.name}${homeCost}噗灵，` : owned(state, home.id) && !housing.availableByKind[def.id] ? `已有${home.name}需先摆放，` : ''}领养${def.price}噗灵${cost > (state.coins || 0) ? `，目前还差${cost-(state.coins||0)}噗灵` : ''}。`, status: 'adopt', cost, newSource: 1, blocked: gate ? 1 : 0 };
}

function plantSource(state, id, missing, now, orchard) {
  const fruit = FRUIT[id], def = CROP[id], plots = present(state, fruit ? 'bigplot' : 'plot');
  const plants = plots.map(p => state.farm?.[`${p.gx},${p.gz}`]).filter(p => p && (fruit ? p.tree === id : p.crop === id));
  if (!fruit && plants.some(p => p.t0 + p.dur <= now)) return { action: 'farm', cropId: id, label: `去收获${def.name}`, detail: `农田里已有成熟的${def.name}，收获后会计入这份清单。`, status: 'collect', cost: 0, newSource: 0, blocked: 0 };
  if (plants.length) return { action: 'farm', cropId: id, label: fruit ? `去看${def.tree}` : '查看作物进度', detail: fruit ? `已有${def.tree}，到果园查看本轮果实；不用重新买树苗。` : `${def.name}正在生长，约${minutes(Math.min(...plants.map(p=>p.t0+p.dur))-now)}后成熟；可浇水照料。`, status: 'waiting', cost: 0, newSource: 0, blocked: 0 };
  const plotId = fruit ? 'bigplot' : 'plot';
  let plotCost = 0, facility = '', needsPlacement = false;
  if (fruit) {
    // A fruit tree keeps its plot. Allocate each empty/stored plot once for this recipe.
    if (orchard.empty > 0) orchard.empty--;
    else if (orchard.stored > 0) { orchard.stored--; needsPlacement = true; facility = `先摆放库存里的${DECO[plotId].name}；`; }
    else { plotCost = DECO[plotId].price; needsPlacement = true; facility = `先另备一块${DECO[plotId].name}（${plotCost}噗灵）；`; }
  } else if (!plots.length) {
    needsPlacement = true; plotCost = owned(state, plotId) ? 0 : DECO[plotId].price;
    facility = owned(state, plotId) ? `先摆放库存里的${DECO[plotId].name}；` : `先准备${DECO[plotId].name}（${plotCost}噗灵）；`;
  }
  const seeds = fruit ? 1 : Math.max(0, Math.ceil(missing / (def.yield || 1)) - (state.seeds?.[id] || 0));
  const planting = fruit ? def.price : seeds * def.seed, cost = plotCost + planting;
  return { action: 'farm', cropId: id, label: fruit ? `准备${def.tree}` : `去种${def.name}`, detail: `${facility}${fruit ? `树苗${planting}噗灵，种下后持续结果` : planting ? `本次所缺材料需${seeds}颗种子，约${planting}噗灵` : '已有免费种子可用'}${cost > (state.coins || 0) ? `；目前还差${cost-(state.coins||0)}噗灵，可先去打工` : ''}。`, status: needsPlacement ? 'housing' : 'plant', cost, newSource: fruit ? 1 : plots.length ? 0 : 1, blocked: 0 };
}

function sourceFor(state, id, missing, now, housing, orchard) {
  if (id === 'cheese' || id === 'yogurt') {
    const required = missing * (id === 'cheese' ? 2 : 1), milk = stock(state, 'milk');
    if (milk >= required) return { action: 'process', processItem: id, label: `加工${label(id)}`, detail: `已有鲜牛奶${milk}/${required}份，可到冰箱加工所缺的${missing}份${label(id)}。`, status: 'process', cost: 0, newSource: 0, blocked: 0 };
    const route = animalSource(state, 'milk', now, housing);
    return { ...route, detail: `${missing}份${label(id)}需要${required}份鲜牛奶，当前${milk}/${required}。${route.detail}` };
  }
  return PANTRY[id] ? animalSource(state, id, now, housing) : plantSource(state, id, missing, now, orchard);
}

function describeRecipe(state, recipeId, variant, now) {
  const recipe = RECIPE[recipeId];
  if (!recipe || !['plain','milky'].includes(variant) || variant === 'milky' && !recipe.milkOption) return null;
  const at = Math.max(now, state.homestead?.lastNow || 0), housing = getAnimalHousing(state);
  const orchard = { empty: present(state, 'bigplot').filter(p => !state.farm?.[`${p.gx},${p.gz}`]).length, stored: state.decor?.bigplot || 0 };
  const rows = recipeCost(recipeId, variant).map(([id, need]) => {
    const have = stock(state, id), missing = Math.max(0, need-have);
    return { id, name: label(id), need, have, missing, ...(missing ? sourceFor(state,id,missing,at,housing,orchard) : { action: 'kitchen', label: '已备齐', detail: `${label(id)}已够这1份料理使用。`, status: 'ready', cost: 0, newSource: 0, blocked: 0 }) };
  });
  return { recipe, rows, unlocked: recipeUnlock(state, recipeId) };
}

export function getRecipeAccess(state, recipeId, variant = 'plain', now = Date.now()) {
  const detail = describeRecipe(state, recipeId, variant, now);
  if (!detail) return { blocked: 1, cost: Infinity, missing: Infinity, newSources: Infinity };
  const { rows, unlocked } = detail, cost = rows.reduce((n,r) => n+r.cost, 0);
  return { blocked: (unlocked.ok ? 0 : 1) + rows.reduce((n,r) => n+r.blocked,0) + (cost > (state.coins||0) ? 1 : 0), cost, missing: rows.reduce((n,r)=>n+r.missing,0), newSources: rows.reduce((n,r)=>n+r.newSource,0) };
}

export function getMealPrep(state, now = Date.now()) {
  const prep = state.homestead?.prep;
  if (!prep) return null;
  const detail = describeRecipe(state, prep.recipe, prep.variant, now);
  if (!detail) return null;
  const { recipe, rows, unlocked } = detail, need = rows.reduce((n,r)=>n+r.need,0), cur = rows.reduce((n,r)=>n+Math.min(r.need,r.have),0);
  const priority = { collect: 0, process: 1, feed: 2, plant: 3, housing: 4, adopt: 5, waiting: 6 };
  const missing = rows.filter(r=>r.missing).sort((a,b)=>(priority[a.status]??7)-(priority[b.status]??7));
  const ready = unlocked.ok && cur === need;
  const next = missing.length ? { ...missing[0] } : { action: 'kitchen', label: '回厨房制作', detail: unlocked.ok ? '这一份所需材料已备齐，可以亲手制作。' : unlocked.reason, recipeId: recipe.id, variant: prep.variant };
  return { name: recipe.name, recipeId: recipe.id, variant: prep.variant, ready, cur, need, rows, next };
}
