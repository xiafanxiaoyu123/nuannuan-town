import { h } from '../core/util.js';
import { getTeaMenuPreview } from '../shared/homestead.js';
import { describeTeaGuest, teaGuestLine, TEA_TASTES } from '../shared/tea-hospitality.js';

const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
const button = (text, attrs = {}) => h('button', { type: 'button', class: 'hs-button', ...attrs }, text);

// 递菜只确定这位朋友先品尝哪一道。库存仍由开始/取消/结束招待统一处理。
export function mountTeaPlay(host, options) {
  const { taskId, getTask, getState, isCurrent, onServe, onFinish, onCancel, onVisit, dishIcon, portrait } = options;
  const task = getTask(), menu = getTeaMenuPreview(task.keys, task.guests, task.served);
  const section = h('section', { class: 'hs-tea-session hs-tea-host hs-scroll', 'data-tea-play': '' });
  const heading = h('h3', {}, '把喜欢的那一口，递到朋友面前');
  const instruction = h('p', { class: 'hs-muted hs-tea-instruction' }, '把料理拖给朋友；也可以先选料理，再点朋友。每人先尝一道，其他菜一起分享。');
  const guestRow = h('div', { class: 'hs-tea-serving-guests' });
  const tray = h('div', { class: 'hs-tea-serving-tray', role: 'group', 'aria-label': '选择要递给朋友的料理' });
  const status = h('p', { class: 'hs-tea-serving-status', role: 'status', 'aria-live': 'polite' });
  const line = h('p', { class: 'hs-tea-line' });
  const progress = h('div', { class: 'hs-progress-fill' });
  const finish = button('收好这一刻', { class: 'hs-button primary', 'data-tea-finish': '', onclick: () => { if (playable()) onFinish(false); } });
  const skip = button('跳过演出并完成', { class: 'hs-button subtle', onclick: () => { if (playable()) onFinish(true); } });
  const visit = button('到餐桌旁看看', { onclick: () => { if (playable()) onVisit(); } });
  const cancel = button('取消招待并退回料理', { class: 'hs-button subtle', onclick: () => { if (playable()) onCancel(); } });
  const resume = button('继续递菜', { class: 'hs-button primary', 'data-tea-resume': '', onclick: () => { if (current() && landscape() && !document.hidden) { paused = false; feedback = ''; update(); } } });
  resume.hidden = true;
  const guests = new Map(), dishes = new Map(), listeners = [];
  let disposed = false, paused = false, pending = false, selected = null, pointer = null, ghost = null, suppressClickUntil = 0;
  let feedback = '', lastGuest = '', responseUntil = 0;
  const current = () => !disposed && isCurrent() && getTask()?.id === taskId;
  const landscape = () => innerWidth >= innerHeight && !document.documentElement.classList.contains('landscape-required');
  const playable = () => current() && !pending && !paused && !document.hidden && landscape();
  const listen = (element, type, fn, opts) => { element.addEventListener(type, fn, opts); listeners.push(() => element.removeEventListener(type, fn, opts)); };
  const release = () => {
    const old = pointer; pointer = null; ghost?.remove(); ghost = null;
    if (old) { try { old.element.releasePointerCapture(old.id); } catch {} }
    guestRow.querySelectorAll('.is-over').forEach(el => el.classList.remove('is-over'));
  };
  function choose(key) {
    if (!playable()) return;
    selected = key; feedback = ''; update();
  }
  function serve(id, key) {
    if (!playable() || !key) return;
    const live = getTask();
    if (live.served?.[id]) { feedback = '这位朋友已经接到了第一道菜，剩下的大家一起分享。'; update(); return; }
    pending = true;
    let result;
    try { result = onServe(id, key); } catch { result = { ok: false, message: '这次没有递出，料理仍在桌上，可以再试。' }; }
    pending = false;
    if (!current()) return;
    if (result?.ok) { lastGuest = id; responseUntil = performance.now() + 8000; selected = null; feedback = ''; }
    else feedback = result?.message || '这次没有递出，料理仍在桌上，可以再试。';
    update();
  }
  for (const guest of menu.guests) {
    const description = describeTeaGuest(getState(), task, guest.id);
    const name = h('strong', {}, description.name), hint = h('span', { class: 'hs-tea-guest-hint' });
    const card = button('', { class: 'hs-button hs-tea-recipient', 'data-tea-guest': guest.id, onclick: () => {
      if (!playable()) return;
      if (getTask().served?.[guest.id]) { lastGuest = guest.id; responseUntil = performance.now() + 8000; update(); }
      else if (selected) serve(guest.id, selected);
      else { feedback = '先从桌上选一道料理，再递给这位朋友。'; update(); }
    } });
    card.append(portrait(guest.id), h('span', { class: 'hs-tea-recipient-copy' }, name, hint));
    guests.set(guest.id, { card, hint }); guestRow.append(card);
  }
  for (const dish of menu.dishes) {
    if (dishes.has(dish.key)) continue;
    const card = button('', { class: 'hs-button hs-tea-serving-dish', 'data-tea-dish': dish.key,
      'aria-label': `选择${dish.name}`, onclick: () => { if (performance.now() >= suppressClickUntil) choose(dish.key); } });
    const image = h('img', { src: dishIcon(dish.recipe, dish.quality, dish.variant), alt: '', draggable: 'false' });
    card.append(image, h('strong', {}, dish.name), h('small', {}, `${({ normal: '家常', tasty: '可口', fine: '精致' })[dish.quality]} · ${dish.tags.map(tag => TEA_TASTES[tag]).join(' / ')}`));
    dishes.set(dish.key, card); tray.append(card);
  }
  section.append(heading, instruction, guestRow, tray, status, resume, line);
  if (menu.theme) section.append(h('div', { class: 'hs-tea-theme', 'data-tea-theme': menu.theme.id }, h('strong', {}, `小彩蛋 · ${menu.theme.title}`), h('span', {}, menu.theme.line)));
  section.append(h('div', { class: 'hs-progress' }, progress), h('div', { class: 'hs-actions hs-tea-host-actions' }, finish, visit, skip), cancel,
    h('p', { class: 'hs-muted' }, '不递菜也可以自在品尝，朋友会先找合口味的菜。亲手递菜决定这一口的口味反馈，不额外消耗料理。关闭可续接，取消全数退回。'));
  host.append(section);
  function update() {
    if (!current()) return;
    const live = getTask(), actual = getTeaMenuPreview(live.keys, live.guests, live.served), active = playable();
    section.dataset.state = paused || !landscape() || document.hidden ? 'paused' : pending ? 'committing' : 'playing';
    section.dataset.served = String(actual.guests.filter(g => g.served).length);
    for (const guest of actual.guests) {
      const { card, hint } = guests.get(guest.id), dish = actual.dishes.find(d => d.key === (guest.served ? guest.key : selected));
      card.disabled = !active;
      card.classList.toggle('is-served', guest.served);
      card.classList.toggle('is-liked', !!dish?.tags.includes(guest.preference));
      const wording = guest.served ? `已接过${dish?.name} · ${guest.liked ? '合口味' : '尝尝新味道'}`
        : dish ? `${dish.tags.includes(guest.preference) ? '正合口味' : `更喜欢${TEA_TASTES[guest.preference]}`} · 递给朋友`
          : `喜欢${TEA_TASTES[guest.preference]} · 等你递菜`;
      setText(hint, wording);
    }
    for (const [key, card] of dishes) { card.disabled = !active; card.classList.toggle('selected', key === selected); card.setAttribute('aria-pressed', String(key === selected)); }
    const fraction = Math.max(0, Math.min(1, (Date.now() - live.startedAt) / Math.max(1, live.readyAt - live.startedAt)));
    progress.style.width = `${fraction * 100}%`; finish.disabled = !active || fraction < 1; skip.disabled = visit.disabled = cancel.disabled = !active;
    resume.hidden = !paused; resume.disabled = !current() || !landscape() || document.hidden;
    const count = actual.guests.filter(g => g.served).length;
    const selectedDish = actual.dishes.find(d => d.key === selected);
    setText(status, !active ? '先歇一下，回来再继续。料理仍好好地放在桌上。' : feedback || (selectedDish ? `端起了「${selectedDish.name}」，看看哪位朋友喜欢。` : count === actual.guests.length ? '大家都接到了第一道菜，慢慢聊一会儿吧。' : '拖动递菜没有时间惩罚，朋友们会等你。'));
    const cafeVisit = (getState().cafeSpecials?.regularVisits || 0) >= 3 && live.guests.includes('man') && actual.dishes.some(d => ['milk_pudding', 'cherry_yogurt', 'egg_sandwich'].includes(d.recipe));
    const shownGuest = lastGuest && performance.now() < responseUntil ? lastGuest : actual.guests.find(g => g.served)?.id;
    let text;
    if (shownGuest && (performance.now() < responseUntil || fraction < .65)) text = teaGuestLine(getState(), live, shownGuest);
    else if (fraction < .15) text = teaGuestLine(getState(), live, actual.guests[0].id, 0);
    else if (fraction < .65) text = teaGuestLine(getState(), live, actual.guests[fraction < .4 ? 0 : actual.guests.length - 1].id);
    else if (fraction < .85) text = cafeVisit ? '小满：“原来店里的招牌，是在这样的小厨房里慢慢做出来的呀。”' : actual.theme?.line || '大家慢慢交换了盘子，想把每一道都尝一小口。';
    else text = fraction < 1 ? teaGuestLine(getState(), live, actual.guests[actual.guests.length - 1].id, 3) : '大家已经品尝完啦。收好这一刻，让今天的小故事留在手账里。';
    setText(line, text);
  }
  listen(section, 'pointerdown', event => {
    const element = event.target.closest('[data-tea-dish]');
    if (!element || !playable() || pointer || event.isPrimary === false || event.button !== 0) return;
    // Suppress only the compatibility click from the previous drag, not a fresh tap.
    suppressClickUntil = 0;
    pointer = { id: event.pointerId, element, key: element.dataset.teaDish, x: event.clientX, y: event.clientY, moved: false };
    try { element.setPointerCapture(event.pointerId); } catch {}
  });
  listen(section, 'pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!playable()) { release(); return; }
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 7) pointer.moved = true;
    if (!pointer.moved) return;
    event.preventDefault();
    if (!ghost) { ghost = h('div', { class: 'hs-tea-drag-ghost', 'aria-hidden': 'true' }, pointer.element.querySelector('img').cloneNode(true)); document.body.append(ghost); }
    ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`;
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-tea-guest]');
    guests.forEach(({ card }) => card.classList.toggle('is-over', card === over && !getTask().served?.[card.dataset.teaGuest]));
  }, { passive: false });
  listen(section, 'pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const record = pointer, over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-tea-guest]');
    release();
    if (!record.moved) return;
    suppressClickUntil = performance.now() + 500; event.preventDefault();
    if (!playable()) return;
    if (over && section.contains(over)) serve(over.dataset.teaGuest, record.key);
    else { feedback = '还没递到朋友面前，料理已放回桌上。'; update(); }
  });
  listen(section, 'pointercancel', release); listen(section, 'lostpointercapture', release);
  listen(section, 'keydown', event => { if (event.key === 'Escape') { release(); selected = null; feedback = ''; update(); } });
  const pause = () => { if (!current()) return; release(); paused = true; update(); };
  listen(window, 'blur', pause); listen(document, 'visibilitychange', () => { if (document.hidden) pause(); else update(); });
  listen(window, 'resize', () => { if (!landscape()) pause(); else { release(); update(); } });
  const timer = setInterval(update, 250); update();
  return { element: section, dispose() { if (disposed) return; disposed = true; release(); clearInterval(timer); listeners.forEach(off => off()); section.querySelectorAll('button').forEach(el => { el.disabled = true; }); } };
}
