import { h } from '../core/util.js';
import { S } from '../core/state.js';
import { LIFE_DISCOVERIES } from '../shared/life-discoveries.js';

const announcements = new WeakMap();
const WALK_DISCOVERIES = new Set(['animal_stroll', 'animal_garden_walk']);
export function announceAnimalWalkDiscovery(game, result) {
  return announcements.get(game)?.(result) || [];
}

// World owns movement and discoveries. This card only presents current facts.
export function mountAnimalWalkHUD(game, ui) {
  let element = null, sessionId = null, sessionSource = null, signature = '', disposed = false, notice = null;
  let name, status, detail, memory, retry;
  function remove() { element?.remove(); element = null; sessionId = null; sessionSource = null; signature = ''; notice = null; }
  function mount(state) {
    remove(); sessionId = state.id; sessionSource = S;
    const source = S, id = state.id;
    const current = () => !disposed && element?.isConnected && S === source && game.homesteadWorld?.getAnimalWalkState()?.id === id;
    name = h('strong', { class: 'hs-walk-name' });
    status = h('p', { class: 'hs-walk-status', 'data-walk-status': '', role: 'status', 'aria-live': 'polite' });
    detail = h('p', { class: 'hs-walk-detail', 'data-walk-detail': '' });
    memory = h('p', { class: 'hs-walk-memory', 'data-walk-memory': '', role: 'status', 'aria-live': 'polite' });
    retry = h('button', { type: 'button', class: 'hs-button primary', 'data-walk-retry': '', onclick: () => { if (current()) game.homesteadWorld.retryAnimalWalkSave(id); } }, '再保存一次');
    const stop = h('button', { type: 'button', class: 'hs-button subtle', 'data-walk-stop': '', onclick: () => { if (current()) game.homesteadWorld.stopAnimalWalk(id); } }, '结束散步');
    element = h('section', { class: 'hs-walk-hud', 'data-animal-walk': '', 'aria-label': '和伙伴一起散步' },
      h('div', { class: 'hs-walk-heading' }, h('span', { 'aria-hidden': 'true' }, '♥'), name), status, detail, memory,
      h('div', { class: 'hs-walk-actions' }, retry, stop));
    ui.root.append(element);
  }
  function tick() {
    if (disposed) return;
    const state = game.homesteadWorld?.getAnimalWalkState();
    if (!state?.active) { if (element) remove(); return; }
    if (!element || sessionId !== state.id || sessionSource !== S) mount(state);
    element.hidden = state.visible === false;
    const visited = Array.isArray(state.visited) ? state.visited : [];
    const stamp = JSON.stringify([state.name, state.phase, state.status, state.detail, state.savePending, visited, notice]);
    if (stamp === signature) return;
    signature = stamp;
    name.textContent = `和${state.name || '小伙伴'}一起走走`;
    status.textContent = state.status || '慢慢走，等它跟上来。';
    detail.textContent = state.detail || '用平时的方式移动；走过一小段路后，在住处、干草、食槽或花箱旁一起停一会儿。';
    memory.textContent = state.savePending ? '刚才的发现暂未保存，可以再试一次。' : notice ? `已记入手账：${notice}` : visited.length ? `一起停过的角落：${[...new Set(visited.map(item => item.name || item.kind).filter(Boolean))].join('、')}` : '不用赶时间，也不消耗饲料。';
    memory.dataset.walkDiscovery = String(!!notice && !state.savePending);
    retry.hidden = !state.savePending;
    element.dataset.walkPhase = state.phase || 'following';
    element.dataset.walkPending = String(!!state.savePending);
  }
  const announce = result => {
    if (disposed || result?.ok !== true || result.changed !== true || !Array.isArray(result.unlocked)) return [];
    const state = game.homesteadWorld?.getAnimalWalkState();
    if (!state?.active || state.visible === false || !ui.root?.isConnected) return [];
    const ids = [...new Set(result.unlocked.filter(id => WALK_DISCOVERIES.has(id) && Object.hasOwn(S.lifeDiscoveries?.found || {}, id)))];
    if (!ids.length) return [];
    tick();
    if (!element?.isConnected || element.hidden || sessionSource !== S || sessionId !== state.id) return [];
    // Keep the newest saved discovery inside the activity card. Its persistent
    // journal entry remains the full history; no timers or delayed notifications.
    notice = LIFE_DISCOVERIES.find(item => item.id === ids[ids.length - 1]).name;
    tick();
    return ids;
  };
  announcements.set(game, announce);
  game.town.ticks.push(tick);
  return { dispose() { if (disposed) return; disposed = true; if (announcements.get(game) === announce) announcements.delete(game); game.town.ticks = game.town.ticks.filter(fn => fn !== tick); remove(); } };
}
