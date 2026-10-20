// 永久生活手账：打开、筛选、翻提示都只读，不替玩家完成发现。
import { h } from '../core/util.js';
import { S, bus } from '../core/state.js';
import { LIFE_DISCOVERIES, getLifeDiscoveries } from '../shared/life-discoveries.js';

const SYMBOLS = { 动物: '♥', 料理: '♨', 招待: '❀', 音乐: '♫', 钓鱼: '≈', 探索: '✦' };
const openBooks = new WeakMap();

export function openLifeDiscoveries(game) {
  if (openBooks.has(game)) return openBooks.get(game);
  const source = S, ui = game.ui;
  let filter = 'all', modal;
  const body = h('div', { class: 'life-discoveries', 'data-life-discoveries': '' });
  const render = () => {
    if (S !== source) { modal?.close(true); return; }
    const state = getLifeDiscoveries(source), count = LIFE_DISCOVERIES.filter(item => state.found[item.id]).length;
    const scroll = body.scrollTop;
    const expanded = new Set([...body.querySelectorAll('details[open]')].map(el => el.dataset.lifeHint));
    const items = LIFE_DISCOVERIES.filter(item => filter === 'all' || (filter === 'found' ? !!state.found[item.id] : !state.found[item.id]));
    body.replaceChildren(
      h('header', { class: 'life-discoveries-head' }, h('div', {}, h('h2', {}, '生活里的小发现'), h('p', {}, '慢慢玩，慢慢遇见。这里的回忆没有期限。')), h('span', { class: 'life-discoveries-count', 'data-life-count': '' }, `珍藏 ${count} / ${LIFE_DISCOVERIES.length}`)),
      h('nav', { class: 'life-discoveries-filters', 'aria-label': '筛选生活发现' }, ...[['all', '全部页签'], ['hint', '等待遇见'], ['found', '已珍藏']].map(([id, label]) => h('button', { type: 'button', class: 'btn alt sm', 'data-life-filter': id, 'aria-pressed': String(filter === id), onclick: () => { filter = id; render(); } }, label))),
      ...(state.musicboxHeard && !state.found.musicbox_echo ? [h('p', { class: 'life-discoveries-clue', 'data-life-music-clue': '' }, '♫ 那段旋律还记得吗？钢琴里多了一首「海岸回声」，可以边看谱边亲手弹。')] : []),
      h('div', { class: 'life-discoveries-grid' }, ...items.map(item => {
        const at = state.found[item.id];
        const card = h('article', { class: `life-discovery-card ${at ? 'found' : 'waiting'}`, 'data-life-id': item.id },
          h('div', { class: 'life-discovery-title' }, h('span', { class: 'life-discovery-sticker', 'aria-hidden': 'true' }, SYMBOLS[item.category]), h('div', {}, h('small', {}, `${item.category} · ${at ? '已珍藏' : '线索'}`), h('h3', {}, at ? item.name : '等待与你相遇'))),
          h('p', {}, at ? item.memory : item.hint));
        if (at) {
          const date = new Date(at), label = Number.isFinite(date.getTime()) ? `${date.toLocaleDateString('zh-CN')} · ` : '';
          card.append(h('small', { class: 'life-discovery-date' }, `${label}留在手账里的一天`));
        }
        else {
          const hint = h('details', { class: 'life-discovery-hint', 'data-life-hint': item.id }, h('summary', {}, '再给一点提示'), h('p', {}, item.detail));
          hint.open = expanded.has(item.id); card.append(hint);
        }
        return card;
      })),
      ...(!items.length ? [h('p', { class: 'life-discoveries-empty' }, filter === 'found' ? '还没有翻开的回忆。先选「等待遇见」，带着一条线索去小镇走走吧。' : '这一册的回忆已经集齐了。喜欢的日常，随时都可以再玩一次。')] : []),
      h('p', { class: 'life-discoveries-note' }, '不用每天打卡，也不必一次找齐。发现时会自动记下；查看提示不会消耗任何东西。'));
    body.scrollTop = scroll;
  };
  render();
  const offFound = bus.on('lifeDiscovery', render);
  const offSource = bus.on('stateReplaced', () => modal?.close(true));
  const offReset = bus.on('reset', () => modal?.close(true));
  modal = ui.modal(body, { ribbon: '小镇手账', cls: 'life-discoveries-modal', onClose: () => { offFound(); offSource(); offReset(); openBooks.delete(game); } });
  openBooks.set(game, modal);
  return modal;
}
