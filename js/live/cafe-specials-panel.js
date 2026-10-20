// 咖啡屋每局准备与常客手账：只选择菜单，实际开局才由规则预留料理。
import { h } from '../core/util.js';
import { S, bus } from '../core/state.js';
import { audio } from '../core/audio.js';
import { icon, npcIco } from '../core/icons.js';
import { createDish } from '../models/homestead.js';
import { parseDishKey } from '../shared/homestead.js';
import { CAFE_SPECIALS, CAFE_STYLES, getCafeSpecials } from '../shared/cafe-specials.js';

export const cafeDishIcon = (id, quality = 'normal', variant = 'plain') => icon(`homestead:dish:${id}:${quality}:${variant}`, () => createDish(id, { quality, variant: variant === 'milky' ? 'milk' : 'base' }), { pitch: .58, yaw: .5, size: 192, zoom: .92 });
const stockOf = (id) => Object.entries(S.homestead?.dishes || {}).reduce((sum, [key, count]) => sum + (parseDishKey(key)?.recipe === id ? count : 0), 0);
const MEMORIES = [
  '第一次尝到你的招牌，小满说：“原来家里的味道，也能在店里遇见。”',
  '再次来店里，小满记住了菜单：“我今天特意留了一个甜点的位置。”',
  '第三次见面，小满轻轻问：“下次，我能去你家坐坐吗？”',
  '在家园的餐桌边，小满说：“以后想到这里，就像想起一个可以歇脚的家。”',
];

export function createCafeMemoryCard({ onCook, onVisitCafe, onHost } = {}) {
  const st = getCafeSpecials(S), visits = Math.min(3, st.regularVisits || 0);
  const card = h('section', { class: 'cafe-memory', 'data-cafe-memory': '' });
  card.append(h('div', { class: 'cafe-memory-head' }, h('img', { src: npcIco('man'), alt: '小满' }), h('div', {}, h('strong', {}, '小满的熟悉味道'), h('small', {}, st.storyComplete ? '家园茶叙已珍藏 · 随时回看' : `招牌相遇 ${visits} / 3 · 不限日期`))));
  const next = st.storyComplete ? '这段相遇已留在手账里。继续营业，或邀请小满再来坐坐。' : visits >= 3 ? '带一道咖啡屋招牌回家，邀请小满参加茶会，留下这段回忆。' : '开店时选一道自制招牌，亲手送给来店里的小满。每局记下一次相遇。';
  card.append(h('p', {}, next));
  if (visits || st.storyComplete) {
    const entries = MEMORIES.slice(0, st.storyComplete ? 4 : visits);
    card.append(h('details', { class: 'cafe-memory-pages', 'data-cafe-memory-pages': '' }, h('summary', {}, '翻看相遇记录'), ...entries.map((line) => h('p', {}, line))));
  }
  const actions = h('div', { class: 'cafe-memory-actions' });
  if (onCook) actions.append(h('button', { type: 'button', class: 'btn alt sm', 'data-cafe-cook': '', onclick: () => onCook(st.recipeId || 'milk_pudding') }, '准备招牌料理'));
  if (onVisitCafe && visits < 3) actions.append(h('button', { type: 'button', class: 'btn sm', 'data-cafe-visit': '', onclick: onVisitCafe }, '去咖啡屋'));
  if (onHost && visits >= 3) actions.append(h('button', { type: 'button', class: 'btn sm', 'data-cafe-host': '', onclick: onHost }, st.storyComplete ? '再约一次茶会' : '邀请小满来家里'));
  if (actions.children.length) card.append(actions);
  return card;
}

export function openCafePreparation(ui, { onCook, onHost } = {}) {
  return new Promise((resolve) => {
    const source = S, remembered = getCafeSpecials(source);
    let style = remembered.style || 'teatime', recipeId = null, chosen = null, modal;
    const body = h('div', { class: 'cafe-preparation', 'data-cafe-preparation': '' });
    const render = () => {
      body.replaceChildren(
        h('header', { class: 'cafe-prep-header' }, h('h2', {}, '今天想怎样开店？'), h('p', {}, '常规菜单随时营业；自制招牌只需一份，供应整局。')),
        h('div', { class: 'cafe-style-grid' }, CAFE_STYLES.map((item) => h('button', { type: 'button', class: `cafe-style-choice ${style === item.id ? 'selected' : ''}`, 'data-cafe-style': item.id, 'aria-pressed': String(style === item.id), onclick: () => { style = item.id; audio.sfx('tab'); render(); } }, h('strong', {}, item.name), h('span', {}, item.id === 'teatime' ? '客人更耐心 · 茶饮搭甜点 · 节奏舒缓' : '成对早餐单 · 相同搭配接连来 · 备货更快')))),
        h('div', { class: 'cafe-prep-label' }, h('strong', {}, '本局招牌'), h('small', {}, '可不选 · 优先使用家常品质')),
        h('div', { class: 'cafe-special-grid' },
          h('button', { type: 'button', class: `cafe-recipe-choice cafe-regular-menu ${!recipeId ? 'selected' : ''}`, 'data-cafe-recipe': 'none', 'aria-pressed': String(!recipeId), onclick: () => { recipeId = null; audio.sfx('tab'); render(); } }, h('b', {}, '常规菜单'), h('span', {}, '不消耗家中料理'), h('small', {}, '直接营业')),
          ...CAFE_SPECIALS.map((item) => { const count = stockOf(item.id); return h('button', { type: 'button', class: `cafe-recipe-choice ${recipeId === item.id ? 'selected' : ''}`, disabled: !count, 'data-cafe-recipe': item.id, 'aria-pressed': String(recipeId === item.id), onclick: () => { recipeId = item.id; audio.sfx('tab'); render(); } }, h('img', { src: cafeDishIcon(item.id), alt: '' }), h('strong', {}, item.shortName || item.name), h('small', {}, count ? `冰箱 ${count} 份 · 本局用 1 份` : '冰箱暂无 · 可先做一份')); })),
        h('p', { class: 'cafe-prep-note' }, recipeId ? `${({ milk_pudding: '鲜奶布丁搭茶饮，享受慢慢品尝。', cherry_yogurt: '酸奶搭咖啡，果香与奶香交替准备。', egg_sandwich: '三明治搭咖啡，小满也会点一套。' })[recipeId]} 确定开店预留 1 份，整局未出招牌就归还。` : '不带招牌也能体验两种营业风格。小满的相遇故事等你准备好再开始。'),
        h('footer', { class: 'cafe-prep-actions' },
          h('button', { type: 'button', class: 'btn alt', 'data-cafe-cancel': '', onclick: () => modal.close(true) }, '先不开店'),
          onCook && h('button', { type: 'button', class: 'btn alt sm', 'data-cafe-prep-cook': '', onclick: () => { modal.close(true); onCook(recipeId || 'milk_pudding'); } }, '去厨房准备'),
          h('button', { type: 'button', class: 'btn', 'data-cafe-start': '', onclick: () => { if (S !== source) { ui.toast('存档已切换，请重新选择菜单'); modal.close(true); return; } if (recipeId && !stockOf(recipeId)) { ui.toast('这道招牌已没有库存，请重新选择'); recipeId = null; render(); return; } chosen = { style, recipeId }; modal.close(true); } }, recipeId ? '带上招牌开店' : '常规菜单开店')));
    };
    render();
    const stopReset = bus.on('reset', () => modal?.close(true));
    const stopSource = bus.on('stateReplaced', () => modal?.close(true));
    modal = ui.modal(body, { ribbon: '今日咖啡屋', cls: 'cafe-prep-modal', onClose: () => { stopReset(); stopSource(); resolve(chosen); } });
  });
}
