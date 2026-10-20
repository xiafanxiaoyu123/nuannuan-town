// 任务栏与牧场共用的下一步建议；只读已有进度，不领物、不推进计时、不另存任务。
import { ANIMAL, HOUSING, PANTRY, RECIPES, RECIPE, recipeCost, recipeUnlock, availableIngredient, parseDishKey, getAnimalHousing, getTeaSurfaces, getHomesteadOrders, homesteadDay } from './homestead.js';
import { getMealPrep, getRecipeAccess } from './meal-prep.js';
import { DECO } from './furniture.js';

const step = (id, tag, text, label, action, extra = {}) => ({ id, tag, text, label, action, cur: 0, need: 1, ...extra });
const amount = (state, id) => availableIngredient(state, id) + (PANTRY[`${id}_prime`] ? availableIngredient(state, `${id}_prime`) : 0);
const missing = (state, recipe) => recipeCost(recipe.id).filter(([id, n]) => amount(state, id) < n);

function suggestRecipe(state, unlearned = false, now = Date.now()) {
  // Stock and affordable, already available sources come before a small raw
  // missing count: two berries must not send a new player to an unaffordable orchard.
  const ordered = ['egg_custard', 'radish_omelet', ...RECIPES.map(r => r.id).filter(id => !['egg_custard', 'radish_omelet'].includes(id))];
  return ordered.map(id => RECIPE[id]).filter(r => recipeUnlock(state, r.id).ok && (!unlearned || !(state.homestead?.history?.[r.id] > 0)))
    .map(recipe => ({ recipe, ...getRecipeAccess(state, recipe.id, 'plain', now) }))
    .sort((a, b) => a.blocked-b.blocked || a.newSources-b.newSources || a.missing-b.missing || a.cost-b.cost)[0]?.recipe || RECIPE.egg_custard;
}

export function getHomesteadNextStep(state, now = Date.now()) {
  const hs = state.homestead;
  if (!hs?.tutorial) return step('welcome', '从一枚鸡蛋开始', '领取小鸡和奶油鸡舍，在家园搭建自己的牧场。', '牧场手账', 'ranch');
  if (hs.cooking) return step('cooking', '继续这道菜', `${RECIPE[hs.cooking.recipe].name}的备料还在，回到灶台继续操作。`, '继续烹饪', 'kitchen', { recipeId: hs.cooking.recipe, cur: Math.floor(hs.cooking.activeMs / 1000), need: 24 });
  if (hs.tea) return step('tea-running', '朋友还在桌边', now >= hs.tea.readyAt ? '朋友已经品尝完了，回去收好这一刻。' : '这场招待还在继续，回到桌边听听朋友的话。', '继续招待', 'tea', { cur: Math.min(30, Math.max(0, Math.floor((now - hs.tea.startedAt) / 1000))), need: 30 });
  const prep = getMealPrep(state, now);
  if (prep) return step('prep', '备餐清单', `${prep.name} · ${prep.ready ? '材料已备齐，回厨房完成这一份吧。' : prep.next.detail}`, prep.ready ? '回厨房制作' : '继续备餐', 'prep', { recipeId: prep.recipeId, variant: prep.variant, cur: prep.cur, need: prep.need });
  const animals = hs.animals, housing = getAnimalHousing(state);
  if (housing.unhousedIds.length) {
    const needed = animals.filter(a => housing.unhousedIds.includes(a.id)).map(a => Object.values(HOUSING).find(home => home.kinds.includes(a.kind)));
    const home = needed.find(home => state.decor?.[home.id] > 0) || needed[0], owned = state.decor?.[home.id] > 0;
    return step('housing', '给伙伴一个家', `${housing.unhousedIds.length}只伙伴等待安置，${owned ? `仓库已有${home.name}，直接摆到家园就能入住。` : `先在家园安排${home.name}，为它们留个位置。`}`, owned ? `摆放库存${home.name}` : `安排${home.name}`, 'build', { cur: housing.totalHoused, need: animals.length, furnitureId: home.id, zone: 'home' });
  }
  const made = RECIPES.filter(r => hs.history[r.id] > 0).length;
  const ready = animals.find(a => a.ready + a.readyPrime > 0);
  const hungry = animals.find(a => !a.cycleAt && !a.pausedMs && a.feed + a.emergency === 0 && a.ready + a.readyPrime < 4);
  const collect = a => step('collect', '收获好时光', `${a.name}准备了${a.ready + a.readyPrime}份${PANTRY[ANIMAL[a.kind].product].name}，亲手收进冰箱吧。`, '亲手收获', 'collect', { animalId: a.id });
  const feed = a => step('feed', '料槽空了', `${a.name}的料槽空了，添料后会继续生产；没有饲料也可以使用免费草料。`, availableIngredient(state, 'feed') ? '亲手喂食' : '看看免费草料', availableIngredient(state, 'feed') ? 'feed' : 'ranch', { animalId: a.id });
  if (made < 2) {
    const recipe = suggestRecipe(state, true, now), lack = missing(state, recipe);
    const provider = animals.find(a => lack.some(([id]) => ANIMAL[a.kind].product === id));
    if (provider && provider.ready + provider.readyPrime > 0) return collect(provider);
    if (provider && !provider.cycleAt && !provider.pausedMs && provider.feed + provider.emergency === 0) return feed(provider);
    return step('learn-recipe', made ? '学会第二种料理' : '第一道家常菜', `${made ? '再学会一种不同料理，就满足奶牛的料理条件。' : '做出第一道料理，留下自己的厨房记忆。'}${lack.length ? `看看${recipe.name}还缺哪些材料。` : `现有材料可以做${recipe.name}。`}`, lack.length ? '查看食材去向' : '亲手做这道菜', 'kitchen', { recipeId: recipe.id, cur: made, need: made ? 2 : 1 });
  }
  if (ready) return collect(ready);
  if (hungry) return feed(hungry);
  if (!hs.teaCount) {
    if (!getTeaSurfaces(state).length) {
      const stocked = ['ranch_picnic','dining'].find(id => (state.decor?.[id] || 0) > 0);
      const price = Math.min(DECO.ranch_picnic.price, DECO.dining.price), shortfall = Math.max(0, price-(state.coins || 0));
      if (!stocked && shortfall) return step('tea-fund', '为第一次招待攒一点', `招待餐桌需要${price}噗灵，目前还差${shortfall}。去甜心咖啡屋打一会儿工，再回来布置这张桌。`, '去咖啡屋打工', 'shop', { shopId: 'cafe', shortfall, cur: Math.min(price,state.coins || 0), need: price });
      return step('tea-table', '准备第一次招待', stocked ? `库存里已有${DECO[stocked].name}，摆到${stocked === 'dining' ? '小屋' : '家园'}就能邀请朋友。` : '已经学会两种料理，摆一张牧场野餐桌或家中餐桌，请朋友来坐坐。', '去摆放餐桌', 'build', { zone: stocked === 'dining' ? 'house' : 'home', furnitureId: stocked || 'ranch_picnic' });
    }
    if (!Object.entries(hs.dishes).some(([key, n]) => n > 0 && parseDishKey(key))) {
      if (hs.placed.length) return step('tea-retrieve', '把料理备好', '桌上还有料理，取回冰箱后就能用来招待朋友。', '整理这张餐桌', 'table', { surface: hs.placed[0].surface, zone: hs.placed[0].zone });
      const recipe = suggestRecipe(state, false, now);
      return step('tea-cook', '为朋友做道菜', `餐桌已经备好，再做一份${recipe.name}，就可以邀请朋友。`, '去准备料理', 'kitchen', { recipeId: recipe.id });
    }
    return step('tea-first', '第一次招待', '选好料理与朋友，完成第一次招待，就满足绵羊的招待条件。', '准备招待朋友', 'tea');
  }
  const day = homesteadDay(Math.max(now, hs.lastNow || 0)), uncared = animals.find(a => a.petDay !== day);
  if (uncared) return step('care', '陪伙伴玩一会儿', `${uncared.name}今天还没和你玩过，按照它的性格慢慢靠近吧。`, '陪伴梳毛', 'pet', { animalId: uncared.id, cur: animals.filter(a => a.petDay === day).length, need: animals.length });
  if (!getHomesteadOrders(state, now).some(order => order.done)) return step('order', '今日来客 · 三选一', '今天有三个料理请求，可以挑一道喜欢的交付。', '看看今日请求', 'book');
  return step('free', '随心过日子', '今天的料理请求已完成。试试新的食谱搭配，或请朋友来吃一顿吧。', '翻翻料理手账', 'book', { cur: 1 });
}
