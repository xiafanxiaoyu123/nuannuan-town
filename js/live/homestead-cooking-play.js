// 手作料理的触控工作台。只投影既有制作进度，不拥有食材或成品库存。
import { h } from '../core/util.js';
import { CROP, FRUIT } from '../data.js';
import { PANTRY } from '../shared/homestead.js';
import { cookingQuality, stirQuality, flipQuality, layerQuality } from '../shared/cooking-quality.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const names = id => PANTRY[id]?.name || CROP[id]?.name || FRUIT[id]?.name || '备好食材';
const button = (label, attrs = {}) => h('button', { type: 'button', class: 'hs-button', ...attrs }, label);
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const contains = (node, x, y) => { const r = node?.getBoundingClientRect(); return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
const center = node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const METHOD = { stir: '轻搅慢煮', flip: '掌握火候', assemble: '层层搭配' };
const LAYERS = ['铺好底层', '放入主料', '添上顶层'];
const BAKED = new Set(['strawberry_tart', 'cheese_pumpkin', 'pumpkin_pie', 'goat_cheese_tart', 'cherry_egg_tart', 'garden_quiche']);

export function mountCookingPlay(host, { task, recipe, isCurrent, onProgress, onFinish, onCancel, makePreview }) {
  const baked = BAKED.has(recipe.id);
  let elapsed = clamp(task.activeMs || 0, 0, 24000), operation = clamp(task.operation || 0, 0, 40), plated = task.plating > 0;
  let technique = clamp(task.technique ?? task.operation ?? 0, 0, operation);
  // 料理计时封顶后仍可继续练习翻面；交互时钟与保存的24秒计时分开。
  let interactionMs = elapsed;
  let disposed = false, paused = false, focused = document.hasFocus(), pending = false, finishing = false;
  let stage = '', gesture = null, keyStir = 0, keyFlipAt = 0, heat = 50, lastFlipAt = -2000;
  let message = '', messageUntil = 0, lastPersist = '', lastTick = performance.now(), persistedAt = lastTick;
  let preview, pot, pan, marker, circle, cookingStatus, dragTarget, heatInput;
  const mainTitle = h('h3', {}, recipe.name);
  const steps = h('ol', { class: 'hs-cook-play-steps', 'aria-label': '制作步骤' }, ['备好食材', METHOD[recipe.method] || METHOD.assemble, '亲手摆盘'].map((text, i) => h('li', { 'data-cook-step': i }, h('b', {}, i + 1), h('span', {}, text))));
  const instruction = h('p', { class: 'hs-cook-play-instruction' });
  const board = h('div', { class: 'hs-cook-play-board', 'data-cook-board': '' });
  const status = h('p', { class: 'hs-muted hs-cook-play-status', 'data-cook-status': '', role: 'status', 'aria-live': 'polite' });
  const previewHost = h('div', { class: 'hs-cook-play-preview' });
  const timerLabel = h('strong', { 'data-cook-time': '' });
  const progress = h('span', {});
  const pauseButton = button('暂停', { 'data-cook-pause': '' });
  const finishButton = button('端出这道菜', { class: 'hs-button primary', 'data-cook-finish': '', disabled: true });
  const cancelButton = button('收好食材', { class: 'hs-button subtle', 'data-cook-cancel': '' });
  const qualityLabel = h('strong', { 'data-cook-quality': '' });
  const qualityDetail = h('span', { 'data-cook-technique': '' });
  const qualityCard = h('div', { class: 'hs-cook-quality', 'aria-live': 'polite' }, qualityLabel, qualityDetail);
  const keyboardHelp = h('details', { class: 'hs-cook-play-help' }, h('summary', {}, '键盘也能一起做'), h('p', { class: 'hs-muted' }, 'Tab选中食材，回车拿起；方向键移动，回车放下。搅拌依次按→↓←↑；翻面或烘烤先↓再↑。Esc放回手中的食材。'));
  const aside = h('aside', { class: 'hs-cook-play-aside' }, previewHost, h('div', { class: 'hs-cook-play-clock' }, timerLabel, pauseButton), h('div', { class: 'hs-cook-play-progress', role: 'progressbar', 'aria-label': '制作时间', 'aria-valuemin': 0, 'aria-valuemax': 24 }, progress), qualityCard, finishButton, cancelButton, keyboardHelp, h('p', { class: 'hs-muted hs-cook-play-note' }, '做错不损失食材。深绿火候、亮金时机、居中叠层更细腻；优选食材可补助品质。关闭或失焦会暂停，回来接着做。'));
  const root = h('section', { class: 'hs-cook-play', 'data-cook-method': recipe.method }, h('header', { class: 'hs-cook-play-heading' }, mainTitle, steps), h('div', { class: 'hs-cook-play-workspace' }, h('div', { class: 'hs-cook-play-worktop' }, instruction, board, status), aside));
  host.append(root);
  const current = () => !disposed && isCurrent() && root.isConnected;
  const blocked = () => !current() || paused || pending || finishing || !focused || document.hidden || document.documentElement.classList.contains('landscape-required');
  const stageFor = () => operation < 12 ? 'prep' : operation < 40 ? 'cook' : plated ? 'ready' : 'plate';
  const prepDone = () => Math.min(3, Math.floor(operation / 4));
  const cookDone = () => recipe.method === 'assemble' ? (operation >= 31 ? 2 : operation >= 21 ? 1 : 0) : recipe.method === 'flip' ? (operation >= 26 ? 1 : 0) : Math.max(0, Math.floor((operation - 12) / 7));
  function persist() {
    if (!current()) return false;
    const value = { activeMs: Math.floor(elapsed), operation: Math.round(operation), technique, plated };
    const stamp = JSON.stringify(value);
    if (stamp === lastPersist) return true;
    const result = onProgress(value);
    if (result === false || result?.ok === false) { message = result?.message || '进度暂未保存，请稍后再试。'; messageUntil = performance.now() + 3000; return false; }
    lastPersist = stamp;
    return true;
  }
  function tell(text) { message = text; messageUntil = performance.now() + 2400; }
  function setOperation(value, text, points = value - operation) {
    if (blocked()) return;
    const next = Math.max(operation, Math.min(40, value));
    technique += clamp(Math.round(points), 0, next - operation); operation = next;
    tell(text); persist(); update(); preview?.wake();
  }
  function clearGesture() {
    const old = gesture; gesture = null; keyStir = 0; keyFlipAt = 0;
    if (old?.source) { old.source.style.transform = ''; old.source.classList.remove('is-held'); old.source.setAttribute('aria-grabbed', 'false'); }
    if (old?.pointerId != null) { try { old.capture.releasePointerCapture(old.pointerId); } catch (_) { /* 捕获可能已由浏览器释放。 */ } }
    board.classList.remove('is-stirring', 'is-dragging');
  }
  function token(label, attrs = {}, index = 0) {
    return button('', { class: 'hs-button hs-cook-play-token', ...attrs, 'data-cook-draggable': '', 'aria-label': `${label}，拿起后移动到目标`, 'aria-grabbed': 'false', 'data-tone': index % 3 });
  }
  function fillToken(node, label) { node.append(h('span', { class: 'hs-cook-play-food', 'aria-hidden': 'true' }), h('span', {}, label)); return node; }
  function renderBoard(nextStage) {
    clearGesture(); stage = nextStage; root.dataset.cookStage = stage;
    board.replaceChildren(); pot = pan = marker = circle = cookingStatus = dragTarget = heatInput = null;
    const done = prepDone();
    if (stage === 'prep') {
      instruction.textContent = '食材分成了三小份，依次拖进料理碗。';
      const tray = h('div', { class: 'hs-cook-play-tray' });
      const inputs = task.inputs?.length ? task.inputs.map(v => v.id) : recipe.cost.map(v => v[0]);
      for (let i = 0; i < 3; i++) {
        const input = inputs[i % inputs.length];
        const label = names(input).replace(/^新鲜|^鲜/, '');
        const piece = fillToken(token(label, { 'data-cook-piece': i, disabled: i !== done }, i), label);
        piece.classList.toggle('is-done', i < done); tray.append(piece);
      }
      dragTarget = h('div', { class: 'hs-cook-play-bowl', 'data-cook-drop': 'prep', 'aria-label': '料理碗，放入食材' }, h('span', { class: 'hs-cook-play-bowl-fill', 'aria-hidden': 'true' }), h('strong', {}, `备料 ${done} / 3`));
      board.append(tray, dragTarget);
    } else if (stage === 'cook' && recipe.method === 'stir') {
      instruction.textContent = '每圈跟着绿色区调火，再沿锅边画圈。深绿区更细腻。';
      pot = h('div', { class: 'hs-cook-play-pot', 'data-cook-pot': '', tabindex: 0, role: 'application', 'aria-label': '搅拌锅：按住沿锅边画圈，或依次按右下左上' }, h('span', { class: 'hs-cook-play-ripple', 'aria-hidden': 'true' }), h('span', { class: 'hs-cook-play-spoon', 'aria-hidden': 'true' }), h('strong', {}, `轻搅 ${cookDone()} / 4`));
      circle = h('span', { class: 'hs-cook-play-stir-progress', 'aria-hidden': 'true' }); pot.append(circle);
      heatInput = h('input', { type: 'range', min: 0, max: 100, step: 1, value: heat, 'data-cook-heat': '', 'aria-label': '火力：跟着每圈的绿色区调整' });
      heatInput.addEventListener('input', () => { if (blocked()) { heatInput.value = heat; return; } heat = Number(heatInput.value); clearGesture(); update(); });
      const heatBox = h('label', { class: 'hs-cook-play-heat' }, h('span', {}, '小火'), h('div', {}, h('span', { class: 'hs-cook-play-heat-good' }), h('span', { class: 'hs-cook-play-heat-best' }), heatInput), h('span', {}, '大火'));
      board.append(pot, heatBox);
    } else if (stage === 'cook' && recipe.method === 'flip') {
      instruction.textContent = baked ? '金黄时上划调整烤盘、出炉；亮金区会更香酥。' : '金黄时向上翻面，亮金区的颜色会更均匀。';
      pan = h('div', { class: `hs-cook-play-pan ${baked ? 'is-baking' : ''}`, 'data-cook-pan': '', tabindex: 0, role: 'application', 'aria-label': `${baked ? '烤盘' : '翻面锅'}：金黄时向上划，键盘先下再上` }, h('span', { class: 'hs-cook-play-pancake', 'aria-hidden': 'true' }), h('strong', {}, `${baked ? '烘烤' : '翻面'} ${cookDone()} / 2`));
      marker = h('span', { class: 'hs-cook-play-timing-marker' });
      cookingStatus = h('span', { class: 'hs-cook-play-timing-label' });
      board.append(pan, h('div', { class: 'hs-cook-play-flip-timing', 'aria-label': `金黄区可以${baked ? '转盘与出炉' : '翻面'}，中间亮金区更细腻` }, h('span', { class: 'hs-cook-play-timing-good' }), h('span', { class: 'hs-cook-play-timing-best' }), marker), cookingStatus);
    } else if (stage === 'cook') {
      instruction.textContent = '按顺序放入同编号的位置，对准中间的圆点会更整齐。';
      const doneLayers = cookDone(), tray = h('div', { class: 'hs-cook-play-tray is-layers' }), stack = h('div', { class: 'hs-cook-play-stack' });
      for (let i = 0; i < 3; i++) {
        const piece = fillToken(token(LAYERS[i], { 'data-cook-layer': i, disabled: i !== doneLayers }, i), `${i + 1} ${LAYERS[i]}`);
        piece.classList.toggle('is-done', i < doneLayers); tray.append(piece);
        stack.append(h('div', { class: `hs-cook-play-slot ${i < doneLayers ? 'is-filled' : ''}`, 'data-cook-slot': i, 'aria-label': `${i + 1} ${LAYERS[i]}` }, i < doneLayers ? '已放好' : `${i + 1} ${LAYERS[i]}`));
      }
      board.append(tray, stack);
    } else if (stage === 'plate') {
      instruction.textContent = '把小点缀拖到盘中央，完成自己的摆盘。';
      const garnish = fillToken(token('小点缀', { 'data-cook-garnish': '' }, 2), '小点缀');
      dragTarget = h('div', { class: 'hs-cook-play-plate', 'data-cook-drop': 'plate', 'aria-label': '餐盘中央，摆放点缀' }, h('span', { class: 'hs-cook-play-plating-food', 'aria-hidden': 'true' }), h('span', { class: 'hs-cook-play-placement', 'aria-hidden': 'true' }, '+'));
      board.append(h('div', { class: 'hs-cook-play-tray is-garnish' }, garnish), dragTarget);
    } else {
      instruction.textContent = '摆盘完成，香气正在慢慢聚拢。';
      board.append(h('div', { class: 'hs-cook-play-ready' }, h('span', { 'aria-hidden': 'true' }, '✓'), h('strong', {}, '这道料理，亲手完成'), h('p', { class: 'hs-muted' }, '可以转动右侧的料理，看看自己的成品。')));
    }
  }
  function targetFor(source) {
    if (source.hasAttribute('data-cook-piece') && stage === 'prep' && Number(source.dataset.cookPiece) === prepDone()) return dragTarget;
    if (source.hasAttribute('data-cook-layer') && stage === 'cook' && recipe.method === 'assemble' && Number(source.dataset.cookLayer) === cookDone()) return board.querySelector(`[data-cook-slot="${source.dataset.cookLayer}"]`);
    if (source.hasAttribute('data-cook-garnish') && stage === 'plate') return dragTarget;
    return null;
  }
  function place(source, x, y, distance) {
    if (blocked()) return;
    const target = targetFor(source);
    if (!target || distance < 18 || !contains(target, x, y)) { tell('再对准目标一点，食材会稳稳放好。'); update(); return; }
    if (stage === 'prep') setOperation((prepDone() + 1) * 4, '食材放好了，继续下一份。');
    else if (stage === 'cook') {
      const rect = target.getBoundingClientRect(), quality = layerQuality(cookDone(), (x - rect.left) / rect.width, (y - rect.top) / rect.height);
      setOperation([21, 31, 40][cookDone()], quality.perfect ? '这一层居中叠好了，切面会更整齐。' : '这一层放好了，下一层试试对准中心。', quality.points);
    }
    else { plated = true; tell('点缀刚刚好，摆盘完成！'); persist(); update(); preview?.wake(); }
  }
  function stir(angle, distance) {
    if (blocked() || stage !== 'cook' || recipe.method !== 'stir') return;
    const quality = stirQuality(cookDone(), heat);
    if (!quality.accepted) { tell('先把火力调到本圈绿色区，温柔地慢煮。'); return; }
    if (angle >= Math.PI * 1.67 && distance >= 120) setOperation(Math.min(40, 12 + (cookDone() + 1) * 7), quality.perfect ? '这一圈火候细腻，看看下一圈的绿色区。' : '这一圈稳妥完成，深绿区还能更细腻。', quality.points);
  }
  const timing = () => (interactionMs % 3600) / 3600;
  const sweet = () => flipQuality(timing()).accepted;
  function flip() {
    if (blocked() || stage !== 'cook' || recipe.method !== 'flip') return;
    if (interactionMs - lastFlipAt < 650) return;
    lastFlipAt = interactionMs;
    const quality = flipQuality(timing());
    if (!quality.accepted) { tell('还差一点点，等金黄区再试一次。'); update(); return; }
    const done = cookDone();
    setOperation(done ? 40 : 26, quality.perfect ? (baked ? '亮金时机刚刚好，边缘更香酥！' : '这次翻面很细腻，颜色正好！') : '金黄时机稳稳接住了，亮金区还能更细腻。', quality.points);
  }
  function pointerDown(event) {
    if (blocked() || gesture || event.button !== 0 || event.isPrimary === false) return;
    const source = event.target.closest('[data-cook-draggable]');
    if (source && board.contains(source) && !source.disabled && targetFor(source)) {
      event.preventDefault(); event.stopPropagation(); source.focus({ preventScroll: true });
      gesture = { kind: 'drag', stage, source, capture: source, pointerId: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
      source.classList.add('is-held'); source.setAttribute('aria-grabbed', 'true'); board.classList.add('is-dragging');
    } else if ((pot && pot.contains(event.target)) || (pan && pan.contains(event.target))) {
      event.preventDefault(); event.stopPropagation(); const capture = pot || pan; capture.focus({ preventScroll: true });
      const c = center(capture); gesture = { kind: pot ? 'stir' : 'flip', stage, capture, pointerId: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, angle: Math.atan2(event.clientY - c.y, event.clientX - c.x), turn: 0, distance: 0, direction: 0 };
    } else return;
    try { gesture.capture.setPointerCapture(event.pointerId); } catch (_) { clearGesture(); }
  }
  function pointerMove(event) {
    const g = gesture; if (!g || event.pointerId !== g.pointerId) return;
    if (blocked() || stage !== g.stage) { clearGesture(); return; }
    event.preventDefault(); event.stopPropagation();
    if (g.kind === 'drag') {
      const dx = event.clientX - g.x, dy = event.clientY - g.y; g.distance = Math.max(g.distance, Math.hypot(dx, dy)); g.source.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (g.kind === 'stir') {
      const c = center(g.capture), rect = g.capture.getBoundingClientRect(), radius = Math.hypot(event.clientX - c.x, event.clientY - c.y), angle = Math.atan2(event.clientY - c.y, event.clientX - c.x);
      let diff = angle - g.angle; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      const step = Math.hypot(event.clientX - g.lastX, event.clientY - g.lastY);
      if (radius >= rect.width * .14 && radius <= rect.width * .55 && Math.abs(diff) < Math.PI / 2) {
        if (!g.direction && Math.abs(diff) > .015) g.direction = Math.sign(diff);
        if (Math.sign(diff) === g.direction) { g.turn += Math.abs(diff); g.distance += step; } else if (Math.abs(diff) > .09) { g.turn = 0; g.distance = 0; g.direction = Math.sign(diff); }
        board.classList.add('is-stirring'); g.capture.style.setProperty('--stir-angle', `${angle * 180 / Math.PI}deg`);
        circle.style.setProperty('--stir-progress', `${clamp(g.turn / (Math.PI * 1.67), 0, 1) * 100}%`);
        if (g.turn >= Math.PI * 1.67 && g.distance >= 120) { const before = operation; stir(g.turn, g.distance); if (operation !== before) { g.turn = 0; g.distance = 0; } }
      } else { g.turn = 0; g.distance = 0; }
      g.angle = angle; g.lastX = event.clientX; g.lastY = event.clientY;
    }
  }
  function pointerUp(event) {
    const g = gesture; if (!g || event.pointerId !== g.pointerId) return;
    event.preventDefault(); event.stopPropagation(); const allowed = !blocked() && stage === g.stage;
    clearGesture(); if (!allowed) return;
    if (g.kind === 'drag') place(g.source, event.clientX, event.clientY, g.distance);
    else if (g.kind === 'flip') { const r = g.capture.getBoundingClientRect(); if (g.y - event.clientY >= Math.max(36, r.height * .3) && Math.abs(event.clientX - g.x) < r.width * .65) flip(); else { tell(baked ? '托住烤盘，从下向上轻轻滑动。' : '从锅的下半部，向上轻划一段。'); update(); } }
  }
  function keyDown(event) {
    if (blocked()) return;
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopPropagation(); clearGesture(); tell('食材已轻轻放回原处。'); update(); return; }
    const source = event.target.closest('[data-cook-draggable]');
    if (source && board.contains(source) && !source.disabled && targetFor(source)) {
      if (!['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Enter' || event.key === ' ') {
        if (event.repeat) return;
        if (!gesture) { const c = center(source); gesture = { kind: 'keyboard', stage, source, capture: source, x: c.x, y: c.y, dx: 0, dy: 0 }; source.classList.add('is-held'); source.setAttribute('aria-grabbed', 'true'); tell('已拿起，用方向键移到目标，再按回车。'); }
        else if (gesture.source === source && gesture.kind === 'keyboard') { const g = gesture; clearGesture(); place(source, g.x + g.dx, g.y + g.dy, Math.hypot(g.dx, g.dy)); }
      } else if (gesture?.kind === 'keyboard' && gesture.source === source) {
        const r = board.getBoundingClientRect(), g = gesture, dx = event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0, dy = event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0;
        g.dx = clamp(g.x + g.dx + dx, r.left + 6, r.right - 6) - g.x; g.dy = clamp(g.y + g.dy + dy, r.top + 6, r.bottom - 6) - g.y; source.style.transform = `translate(${g.dx}px,${g.dy}px)`;
      }
      update(); return;
    }
    if (pot && event.target === pot && event.key.startsWith('Arrow')) {
      event.preventDefault(); event.stopPropagation(); if (event.repeat || gesture) return;
      const expected = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][keyStir];
      if (event.key !== expected) { keyStir = event.key === 'ArrowRight' ? 1 : 0; tell('顺着同一方向：右、下、左、上。'); }
      else { keyStir++; pot.style.setProperty('--stir-angle', `${keyStir * 90}deg`); if (keyStir === 4) { keyStir = 0; stir(Math.PI * 2, 160); } }
      update();
    } else if (pan && event.target === pan && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); if (event.repeat || gesture) return;
      if (event.key === 'ArrowDown') { keyFlipAt = performance.now(); tell(baked ? '已经托住烤盘，金黄时按上键。' : '已经稳住锅，金黄时按上键。'); }
      else if (keyFlipAt && performance.now() - keyFlipAt >= 100 && performance.now() - keyFlipAt < 2000) { keyFlipAt = 0; flip(); }
      update();
    }
  }
  function update() {
    if (!current()) return;
    const next = stageFor(); if (stage !== next) renderBoard(next);
    // 每件备料/每层搭配完成后重建工作台，旧节点不再能再次提交。
    if ((stage === 'prep' && Number(board.querySelector('[data-cook-piece]:not(:disabled)')?.dataset.cookPiece) !== prepDone()) || (stage === 'cook' && recipe.method === 'assemble' && Number(board.querySelector('[data-cook-layer]:not(:disabled)')?.dataset.cookLayer) !== cookDone())) renderBoard(stage);
    const stopped = blocked(); root.classList.toggle('is-paused', stopped); root.dataset.cookPaused = stopped ? 'yes' : 'no';
    const step = stage === 'prep' ? 0 : stage === 'cook' ? 1 : 2;
    steps.querySelectorAll('li').forEach((node, i) => { node.classList.toggle('is-current', i === step); node.classList.toggle('is-complete', i < step || stage === 'ready'); node.setAttribute('aria-current', i === step ? 'step' : 'false'); });
    const remain = Math.max(0, Math.ceil((24000 - elapsed) / 1000));
    timerLabel.textContent = remain ? `手作 ${remain} 秒` : plated && operation >= 40 ? '可以出餐啦' : '时间正好';
    progress.style.width = `${elapsed / 240}%`; progress.parentElement.setAttribute('aria-valuenow', String(Math.floor(elapsed / 1000)));
    // Keep labels stable between changes, including the live quality announcement.
    setText(pauseButton, paused || !focused ? '继续制作' : '暂停'); pauseButton.disabled = pending || finishing;
    finishButton.disabled = stopped || elapsed < 24000 || operation < 40 || !plated;
    cancelButton.disabled = pending || finishing;
    const potential = cookingQuality({ operation: 40, technique: technique + 40 - operation, plating: 20, primeRatio: task.primeRatio });
    const qualityName = { normal: '家常', tasty: '可口', fine: '精致' }[potential.quality];
    setText(qualityLabel, `${operation >= 40 ? '出餐品质' : '完成后有望'} · ${qualityName}`);
    qualityLabel.dataset.cookQuality = potential.quality;
    setText(qualityDetail, `技法 ${technique}/40 · 原料 +${potential.ingredientBonus}`);
    if (pot) {
      const q = stirQuality(cookDone(), heat);
      pot.querySelector('strong').textContent = `轻搅 ${cookDone()} / 4`; pot.classList.toggle('is-warm', q.accepted); heatInput.disabled = stopped;
      heatInput.setAttribute('aria-label', `第${cookDone() + 1}圈火力：${q.low}至${q.high}可完成，${q.perfectLow}至${q.perfectHigh}更细腻`);
      heatInput.dataset.heatCenter = q.center;
      board.style.setProperty('--heat-low', `${q.low}%`); board.style.setProperty('--heat-span', `${q.high - q.low}%`);
      board.style.setProperty('--heat-best-low', `${q.perfectLow}%`); board.style.setProperty('--heat-best-span', `${q.perfectHigh - q.perfectLow}%`);
    }
    if (pan) { const q = flipQuality(timing()); pan.dataset.cookSweet = q.accepted ? 'yes' : 'no'; pan.dataset.cookPerfect = q.perfect ? 'yes' : 'no'; pan.classList.toggle('is-golden', q.accepted); pan.classList.toggle('is-perfect', q.perfect); pan.querySelector('strong').textContent = `${baked ? '烘烤' : '翻面'} ${cookDone()} / 2`; marker.style.left = `${timing() * 100}%`; cookingStatus.textContent = q.perfect ? '亮金时机，细腻出手！' : q.accepted ? '金黄了，可以向上划' : '等一等，香味在酝酿'; }
    status.textContent = stopped ? '制作已暂停，准备好再继续。' : performance.now() < messageUntil ? message : stage === 'prep' ? `先放入第 ${prepDone() + 1} 份备料。` : stage === 'cook' ? recipe.method === 'stir' ? (stirQuality(cookDone(), heat).accepted ? '沿锅边画圈，深绿火候更细腻。' : '跟着本圈的绿色区调整火力。') : recipe.method === 'flip' ? '失手可以再试，选准时机会更细腻。' : `现在摆放第 ${cookDone() + 1} 层，对准中心更整齐。` : stage === 'plate' ? '还差最后一笔小点缀。' : remain ? '摆盘完成，稍等香气变得浓郁。' : `亲手做好的${qualityName}料理，可以端出去了。`;
  }
  pauseButton.addEventListener('click', () => { if (!current() || pending || finishing) return; clearGesture(); paused = !(paused || !focused); focused = document.hasFocus(); lastTick = performance.now(); persist(); update(); preview?.wake(); });
  finishButton.addEventListener('click', () => {
    if (blocked() || elapsed < 24000 || operation < 40 || !plated) return;
    clearGesture(); if (!persist()) { update(); return; } finishing = true; update();
    try { const result = onFinish(); if (result?.ok === false && current()) { finishing = false; tell(result.message || '暂时不能出餐，请再试一次。'); update(); } } catch (error) { finishing = false; tell('这道菜已备好，请稍后再试。'); update(); throw error; }
  });
  cancelButton.addEventListener('click', async () => {
    if (!current() || pending || finishing) return;
    clearGesture(); persist(); pending = true; update(); preview?.wake();
    try { await onCancel(); } finally { if (current()) { pending = false; focused = document.hasFocus(); lastTick = performance.now(); update(); preview?.wake(); } }
  });
  previewHost.addEventListener('click', () => { if (!blocked()) preview?.rotate?.(); });
  const stopInput = () => { clearGesture(); persist(); lastTick = performance.now(); update(); preview?.wake(); };
  const blur = () => { focused = false; stopInput(); }, focus = () => { focused = true; lastTick = performance.now(); update(); preview?.wake(); };
  const visibility = () => { stopInput(); }, resize = () => { stopInput(); };
  const cancelPointer = event => { if (gesture?.pointerId === event.pointerId) clearGesture(); };
  root.addEventListener('pointerdown', pointerDown); root.addEventListener('pointermove', pointerMove); root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', cancelPointer); root.addEventListener('lostpointercapture', cancelPointer); root.addEventListener('keydown', keyDown);
  window.addEventListener('blur', blur); window.addEventListener('focus', focus); window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
  update();
  preview = makePreview(previewHost, recipe.id, { cooking: true, variant: task.variant, progress: () => Math.min(1, operation / 40 * .85 + (plated ? .15 : 0)), paused: blocked });
  const tick = setInterval(() => {
    if (!current()) { clearGesture(); return; }
    const now = performance.now(), dt = clamp(now - lastTick, 0, 1000); lastTick = now;
    if (!blocked()) { elapsed = Math.min(24000, elapsed + dt); interactionMs += dt; } else clearGesture();
    if (now - persistedAt >= 1000) { persistedAt = now; persist(); }
    update();
  }, 100);
  return {
    wake() { if (current()) { lastTick = performance.now(); update(); preview?.wake(); } },
    dispose(saveProgress = true) {
      if (disposed) return;
      if (saveProgress) persist(); clearGesture(); disposed = true; clearInterval(tick);
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
      root.removeEventListener('pointerdown', pointerDown); root.removeEventListener('pointermove', pointerMove); root.removeEventListener('pointerup', pointerUp); root.removeEventListener('pointercancel', cancelPointer); root.removeEventListener('lostpointercapture', cancelPointer); root.removeEventListener('keydown', keyDown);
      root.querySelectorAll('button,input').forEach(node => { node.disabled = true; }); preview?.dispose();
    },
  };
}
