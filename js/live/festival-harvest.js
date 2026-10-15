// 丰收节：三位居民的野餐订单。纯规则，不消耗背包、不发经济奖励。
export const BASKET_WEIGHTS = { pumpkin: 3, apple: 2, wheat: 1 };
export const HARVEST_INGREDIENTS = {
  pumpkin: { name: '南瓜', unit: '个', symbol: '🎃', note: '熬一锅暖暖的浓汤' },
  apple: { name: '苹果', unit: '个', symbol: '🍎', note: '清甜的饭后水果' },
  wheat: { name: '麦穗', unit: '束', symbol: '🌾', note: '给长桌添一份麦香' },
};
export const HARVEST_ORDERS = [
  { id: 'man', name: '小满', dish: '热汤与面包篮', target: 8, minimum: { pumpkin: 1, wheat: 1 }, forbidden: [],
    request: '“我想煮一锅南瓜汤，再烤几块小面包。请给我南瓜和麦穗，苹果也能放一点。”',
    thanks: '小满把南瓜搬到锅边，又捧起麦穗：“热汤和面包都有着落了！等香味飘出来，就叫大家来坐。”' },
  { id: 'he', name: '青禾', dish: '果香小点篮', target: 7, minimum: { apple: 2, wheat: 1 }, forbidden: ['pumpkin'],
    request: '“我要做苹果小点，至少放两个苹果和一束麦穗吧。南瓜留给小满，这一篮清清甜甜的就好。”',
    thanks: '青禾把苹果摆成一圈：“等会儿把小点装在花边盘里，每个人都能分到甜甜的一块。”' },
  { id: 'qi', name: '七弦', dish: '长桌分享篮', target: 10, minimum: { pumpkin: 1, apple: 1, wheat: 1 }, forbidden: [],
    request: '“最后一篮留给长桌。南瓜、苹果、麦穗都放一些吧，把这座小镇的秋天分给大家。”',
    thanks: '七弦接过最后一篮：“有暖色的汤，有清甜的果，还有麦香。今晚的诗，就从‘请再坐一会儿’开始。”' },
];
export const config = {
  title: '秋收称篮摊', host: '小满', scene: '南瓜摊与丰收长桌',
  intro: '长桌还差三篮食材，小满把居民写好的小纸条摊在秤旁：“每个人想做的菜不一样，帮我们按心意装好，一会儿一起开饭！”',
  instruction: '依次为小满、青禾和七弦配篮。既要达到目标重量，也要满足各自的材料要求。南瓜3份、苹果2份、麦穗1份；点篮中食材可逐件取回，称对后亲手交付。',
  steps: ['小满的热汤篮', '青禾的果香篮', '七弦的分享篮'],
  done: '三篮都送到了长桌，大家为暖暖留好了座位。',
};
const own = (map, key) => typeof key === 'string' && Object.hasOwn(map, key);
const rotation = seed => Number.isFinite(Number(seed)) ? Math.abs(Math.trunc(Number(seed))) % 2 : 0;
export function create(seed = 0) {
  const n = rotation(seed);
  return { kind: 'harvest', phase: 0, done: false, ready: false, message: '', seed: n, basket: [], delivered: [], hintOpen: false, weighings: 0,
    orders: HARVEST_ORDERS.map(o => ({ ...o, target: o.target + n, minimum: { ...o.minimum }, forbidden: [...o.forbidden] })) };
}
export const basketWeight = basket => basket.reduce((sum, id) => sum + (BASKET_WEIGHTS[id] || 0), 0);
export function assess(order, basket) {
  const counts = Object.fromEntries(Object.keys(BASKET_WEIGHTS).map(id => [id, basket.filter(a => a === id).length]));
  const weight = basketWeight(basket), missing = Object.entries(order.minimum).filter(([id, n]) => counts[id] < n).map(([id, n]) => ({ id, count: n - counts[id] }));
  const unwanted = order.forbidden.filter(id => counts[id] > 0);
  return { counts, weight, missing, unwanted, ok: weight === order.target && !missing.length && !unwanted.length };
}
// 给提示和检查共用的所有计数组合；材料摆放顺序不影响菜篮。
export function solutions(order) {
  const found = [];
  for (let p = 0; p <= Math.floor(order.target / 3); p++) for (let a = 0; a <= Math.floor(order.target / 2); a++) {
    const w = order.target - p * 3 - a * 2;
    if (w < 0) continue;
    const basket = [...Array(p).fill('pumpkin'), ...Array(a).fill('apple'), ...Array(w).fill('wheat')];
    if (basket.length <= 12 && assess(order, basket).ok) found.push(basket);
  }
  return found.sort((a, b) => a.length - b.length);
}
const describe = basket => Object.keys(BASKET_WEIGHTS).map(id => [id, basket.filter(a => a === id).length]).filter(([, n]) => n).map(([id, n]) => n + HARVEST_INGREDIENTS[id].unit + HARVEST_INGREDIENTS[id].name).join('、');
export function step(s, action) {
  if (!s || s.kind !== 'harvest' || s.done || !action || typeof action !== 'object') return false;
  const order = s.orders[s.phase];
  if (!order) return false;
  if (action.type === 'basket') {
    if (!own(BASKET_WEIGHTS, action.id) || s.basket.length >= 12) return false;
    s.basket.push(action.id); s.ready = false;
    const amount = basketWeight(s.basket);
    s.message = amount > order.target ? '篮子重了 ' + (amount - order.target) + ' 份。点篮中的食材就能逐件取回，不用全部重装。' : '放入' + HARVEST_INGREDIENTS[action.id].name + '。装好后点“称一称”，一起核对小纸条。'; return true;
  }
  if (action.type === 'remove' || action.type === 'undo') {
    const index = action.type === 'undo' ? s.basket.length - 1 : action.index;
    if (!Number.isInteger(index) || index < 0 || index >= s.basket.length) return false;
    const id = s.basket.splice(index, 1)[0]; s.ready = false;
    s.message = '取回一份' + HARVEST_INGREDIENTS[id].name + '，其余食材都留在篮中。'; return true;
  }
  if (action.type === 'hint') {
    s.hintOpen = !s.hintOpen;
    s.message = s.hintOpen ? '一种配法是：' + describe(solutions(order)[s.seed % solutions(order).length]) + '。这不是唯一答案，按自己的配法装也可以。' : '小提示收起来了，订单要求还在上面。'; return true;
  }
  if (action.type === 'weigh') {
    s.weighings++; const result = assess(order, s.basket); s.ready = result.ok;
    if (s.ready) { s.message = '刚好 ' + order.target + ' 份，材料也齐了！' + order.name + '已经在长桌边等你，准备好就亲手把篮子交过去。'; return true; }
    const details = [];
    if (result.weight < order.target) details.push('还差 ' + (order.target - result.weight) + ' 份重量');
    if (result.weight > order.target) details.push('重了 ' + (result.weight - order.target) + ' 份，可以取回或替换篮中食材');
    if (result.unwanted.length) details.push(order.name + '这一篮不需要' + result.unwanted.map(id => HARVEST_INGREDIENTS[id].name).join('、'));
    if (result.missing.length) details.push('还需要' + result.missing.map(({ id, count }) => '至少再添 ' + count + ' ' + HARVEST_INGREDIENTS[id].unit + HARVEST_INGREDIENTS[id].name).join('、'));
    s.message = (result.weight === order.target ? '重量刚好，不过' : '') + details.join('；') + '。篮子保留，可以慢慢调整。'; return false;
  }
  if (action.type === 'next' && s.ready) {
    s.delivered.push({ id: order.id, name: order.name, dish: order.dish, target: order.target, basket: [...s.basket] });
    if (s.phase === 2) { s.done = true; s.message = '小满端来热汤，青禾摆好小点，七弦把诗纸折在杯旁。三个人同时往旁边挪了挪：“暖暖，这个位置留给你！”'; return true; }
    const thanks = order.thanks; s.phase++; s.basket = []; s.ready = false; s.hintOpen = false;
    s.message = thanks + ' 接下来看看' + s.orders[s.phase].name + '的小纸条。'; return true;
  }
  return false;
}
export function summary(s) {
  return { title: '今晚的长桌，已经坐满了秋天', text: s.done ? s.message : config.done,
    details: s.delivered.map(o => o.name + ' · ' + o.dish + '：' + describe(o.basket) + '，共 ' + o.target + ' 份重量。') };
}
function food(h, id) { return h('span', { class: 'fa-harvest-food', 'aria-hidden': 'true' }, HARVEST_INGREDIENTS[id].symbol); }
function displayBasket(h, basket) { return h('div', { class: 'fa-harvest-basket fa-visual', role: 'img', 'aria-label': describe(basket) || '空篮子' }, basket.length ? basket.map(id => food(h, id)) : h('span', { class: 'fa-note' }, '等一篮秋天')); }
export function render(s, { h, button }) {
  const root = h('div', { class: 'fa-stage fa-harvest', 'data-harvest-phase': s.phase });
  if (s.done) {
    root.append(h('h3', {}, '长桌开席了'), h('div', { class: 'fa-harvest-table' }, s.delivered.map(o => h('section', {}, h('b', {}, o.name + '的' + o.dish), displayBasket(h, o.basket), h('span', { class: 'fa-note' }, o.target + ' 份重量'))))); return root;
  }
  const order = s.orders[s.phase], result = assess(order, s.basket);
  root.append(h('h3', {}, order.name + '的小纸条'), h('p', { class: 'fa-task' }, order.request), h('div', { class: 'fa-harvest-order' },
    h('b', { class: 'fa-counter' }, result.weight + ' / ' + order.target + ' 份重量'),
    h('ul', { class: 'fa-harvest-needs' }, Object.entries(order.minimum).map(([id, n]) => h('li', { class: result.counts[id] >= n ? 'met' : '' }, (result.counts[id] >= n ? '✓ ' : '○ ') + '至少 ' + n + ' ' + HARVEST_INGREDIENTS[id].unit + HARVEST_INGREDIENTS[id].name)),
      order.forbidden.map(id => h('li', { class: result.counts[id] === 0 ? 'met' : '' }, (result.counts[id] === 0 ? '✓ ' : '○ ') + '不放' + HARVEST_INGREDIENTS[id].name)))));
  root.append(h('div', { class: 'fa-harvest-basket fa-visual', 'aria-label': '篮中食材，点击可逐件取回' }, s.basket.length ? s.basket.map((id, index) => button(HARVEST_INGREDIENTS[id].symbol + ' ' + HARVEST_INGREDIENTS[id].name + ' −', 'harvest-remove-' + index, { type: 'remove', index }, { class: 'btn alt sm fa-harvest-piece', 'aria-label': '取回第 ' + (index + 1) + ' 份' + HARVEST_INGREDIENTS[id].name })) : h('p', { class: 'fa-note' }, '篮子还空着。点下方食材放入，点篮中食材取回。')),
    h('div', { class: 'fa-row' }, Object.entries(BASKET_WEIGHTS).map(([id, weight]) => button(HARVEST_INGREDIENTS[id].symbol + ' ' + HARVEST_INGREDIENTS[id].name + ' +' + weight + '重量', 'harvest-add-' + id, { type: 'basket', id }, { disabled: s.basket.length >= 12 }))),
    h('div', { class: 'fa-row' }, button('撤回最后一份', 'harvest-undo', { type: 'undo' }, { disabled: !s.basket.length }), button(s.hintOpen ? '收起配篮提示' : '看看一种配法', 'harvest-hint', { type: 'hint' }, { 'aria-pressed': String(s.hintOpen) })));
  if (s.hintOpen) { const choices = solutions(order); root.append(h('p', { class: 'fa-harvest-hint' }, '可以试试：' + describe(choices[s.seed % choices.length]) + '。还有别的正确配法。')); }
  if (s.ready) root.append(h('p', { class: 'fa-note' }, order.thanks), button(s.phase === 2 ? '交给七弦 · 一起入席' : '交给' + order.name + ' · 下一篮', 'harvest-next', { type: 'next' }, { class: 'btn' }));
  else root.append(button('称一称，核对小纸条', 'harvest-weigh', { type: 'weigh' }, { class: 'btn', disabled: !s.basket.length }));
  if (s.delivered.length) root.append(h('p', { class: 'fa-note' }, '长桌已收到：' + s.delivered.map(o => o.name + '的' + o.dish).join('、')));
  return root;
}
export const css = `
  .fa-harvest button{min-height:44px;touch-action:manipulation}.fa-harvest h3{margin:0 0 8px}.fa-harvest-order{padding:12px;background:#fffdf6;border:1px dashed #d7b17e;border-radius:12px}.fa-harvest-needs{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:7px 13px;font-size:13px}.fa-harvest-needs .met{color:#437947}
  .fa-harvest-basket{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;min-height:68px;margin:12px 0;padding:12px 8px;background:repeating-linear-gradient(0deg,#efddc0 0px,#efddc0 5px,#e5cea8 6px,#efddc0 8px);border:3px solid #bf986c;border-top:6px double #9e754c;border-radius:10px 10px 25px 25px}.fa-harvest-basket .fa-harvest-piece{flex:0 1 auto;min-width:78px;padding:7px 9px;background:#fff8ec;font-size:12px}.fa-harvest-food{font-size:26px}.fa-harvest-hint{padding:9px;background:#edf4e7;border-radius:10px;color:#567447;font-size:13px}
  .fa-harvest-table{display:grid;gap:12px}.fa-harvest-table section{border-bottom:2px dashed #dcbaa4;padding-bottom:9px}.fa-harvest-table .fa-harvest-basket{margin:7px auto;max-width:270px;min-height:48px}.fa-harvest .fa-note{line-height:1.6}
`;
