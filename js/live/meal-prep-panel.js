import { h } from '../core/util.js';

const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
const button = (text, attrs = {}) => h('button', { type: 'button', class: 'hs-button', ...attrs }, text);

// Stable controls keep their pointer/keyboard targets while stock and timers update.
// The board only explains the shared plan; all spending stays in existing actions.
export function mountMealPrep(host, { getPlan, getTarget, current, onRecipe, onRoute, onClear, onPlanChanged, dishIcon }) {
  const initial = getPlan(), identity = `${initial.recipeId}:${initial.variant}`;
  let disposed = false;
  const active = () => !disposed && current();
  const samePlan = () => {
    if (!active()) return null;
    const plan = getPlan();
    return plan && `${plan.recipeId}:${plan.variant}` === identity ? plan : null;
  };
  const section = h('section', { class: 'hs-meal-prep hs-scroll', 'data-meal-prep': initial.recipeId });
  const title = h('h3', {}, initial.name), progress = h('p', { class: 'hs-meal-progress', role: 'status', 'aria-live': 'polite' });
  const grid = h('div', { class: 'hs-meal-ingredients' }), rows = new Map();
  section.append(h('header', { class: 'hs-meal-heading' }, h('img', { src: dishIcon(initial.recipeId, 'normal', initial.variant), alt: '' }), h('div', {}, h('span', { class: 'hs-eyebrow' }, '今天想做 · 1份'), title, progress)),
    h('p', { class: 'hs-muted' }, '先看看手头的食材，再决定去田里、牧场，还是鲜奶加工。清单会跟着收获更新，不用赶时间。'), grid);
  for (const value of initial.rows) {
    const amount = h('strong', { class: 'hs-meal-amount' });
    const detail = h('p', { class: 'hs-muted' });
    const go = button('', { 'data-prep-route': value.id, onclick: () => {
      const live = samePlan(); if (!live) return;
      const row = live.rows.find(r => r.id === value.id);
      if (row?.missing) onRoute(row);
    } });
    const card = h('article', { class: 'hs-meal-ingredient', 'data-prep-item': value.id },
      h('div', { class: 'hs-meal-item-heading' }, h('strong', {}, value.name), amount), detail, go);
    rows.set(value.id, { card, amount, detail, go }); grid.append(card);
  }
  const back = button('返回这道菜的菜谱', { class: 'hs-button primary', 'data-prep-cook': '', onclick: () => { if (samePlan()) onRecipe(); } });
  section.append(h('div', { class: 'hs-actions hs-meal-actions' }, back,
    button('收起备餐清单', { class: 'hs-button subtle', 'data-prep-clear': '', onclick: () => { if (samePlan()) onClear(); } })),
    h('p', { class: 'hs-muted hs-meal-footnote' }, '普通与优选都能备料。清单不预扣材料，做出这道菜的同一变体后自动收起；取消制作会保留清单。'));
  host.append(section);
  function update() {
    if (!active() || document.hidden) return;
    const plan = getPlan();
    if (!plan || `${plan.recipeId}:${plan.variant}` !== identity) { onPlanChanged(); return; }
    setText(progress, plan.ready ? '食材已经备齐，可以回厨房动手啦。' : `已备 ${plan.cur} / ${plan.need} 份原料${plan.variant === 'milky' ? ' · 奶香变体' : ''}`);
    setText(back, plan.ready ? '食材已备齐 · 去制作' : '返回这道菜的菜谱');
    section.dataset.ready = String(plan.ready);
    for (const row of plan.rows) {
      const elements = rows.get(row.id); if (!elements) continue;
      const target = row.missing && row.cropId ? getTarget?.(row.cropId) : null;
      elements.card.classList.toggle('is-ready', !row.missing);
      elements.card.dataset.status = !row.missing ? 'ready' : target?.status || row.action;
      setText(elements.amount, `${row.have} / ${row.need}`);
      setText(elements.detail, !row.missing ? '这一份已经在食材柜里。' : target?.detail || row.detail);
      const label = target && ['missing', 'occupied'].includes(target.status) ? `去准备${target.fruit ? '果树田' : '田地'}` : target?.label || row.label;
      setText(elements.go, !row.missing ? '已经备好' : label);
      elements.go.disabled = !row.missing;
    }
  }
  const timer = setInterval(update, 1000); update();
  return { dispose() { if (disposed) return; disposed = true; clearInterval(timer); section.querySelectorAll('button').forEach(el => { el.disabled = true; }); } };
}
