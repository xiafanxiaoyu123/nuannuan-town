// 手势只负责一次照料演出；库存、每日照料与收获仍由调用方的原子动作提交。
const SVG = {
  brush: '<path d="M27 18h26a8 8 0 0 1 8 8v15H19V26a8 8 0 0 1 8-8Z" fill="#dca785"/><path d="M23 41v10m8-10v13m9-13v14m9-14v13m8-13v10" stroke="#805f48" stroke-width="5" stroke-linecap="round"/><path d="M32 19v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#9c7454" stroke-width="7"/>',
  feed: '<path d="M17 30h43l-5 28H22Z" fill="#d8b58c" stroke="#aa8360" stroke-width="3"/><path d="m22 27 8-8 8 7 9-10 10 12" fill="#d8bf72" stroke="#b59852" stroke-width="4" stroke-linejoin="round"/><path d="m60 37 11-8" stroke="#aa8360" stroke-width="7" stroke-linecap="round"/>',
  egg: '<path d="M40 10C27 10 19 32 19 44c0 15 9 22 21 22s21-7 21-22c0-12-8-34-21-34Z" fill="#fff6dc" stroke="#cbb58e" stroke-width="3"/><path d="M31 24c-4 7-6 12-6 18" fill="none" stroke="#fffdf5" stroke-width="5" stroke-linecap="round"/>',
  bowl: '<ellipse cx="40" cy="38" rx="30" ry="11" fill="#cbb39a"/><path d="M10 38q3 29 30 29t30-29" fill="#c98c78" stroke="#ac7463" stroke-width="3"/><ellipse cx="40" cy="38" rx="24" ry="6" fill="#f1d49a"/>',
  basket: '<path d="M23 33V22a17 17 0 0 1 34 0v11" fill="none" stroke="#b28b63" stroke-width="5"/><path d="m10 32 7 33h46l7-33Z" fill="#d6b68d" stroke="#b28b63" stroke-width="3"/><path d="M14 42h52M16 52h48M28 33v29M40 33v29M52 33v29" stroke="#b28b63" stroke-width="2"/>',
  milk: '<path d="M21 23q0-16 19-16t19 16" fill="none" stroke="#a4aca5" stroke-width="4"/><path d="m15 25 6 42h38l6-42Z" fill="#dfe6df" stroke="#9aaa9f" stroke-width="3"/><ellipse cx="40" cy="27" rx="25" ry="8" fill="#fffcef" stroke="#9aaa9f" stroke-width="3"/><path d="M28 40v17" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  hand: '<path d="M24 38V21a5 5 0 0 1 10 0v12-21a5 5 0 0 1 10 0v21-16a5 5 0 0 1 10 0v21-9a5 5 0 0 1 10 0v19c0 14-9 22-21 22-12 0-18-8-24-17l-6-10a5 5 0 0 1 8-6Z" fill="#f1c8a6" stroke="#bc906e" stroke-width="3" stroke-linejoin="round"/>',
  fiber: '<path d="M23 58a13 13 0 0 1-7-24 14 14 0 0 1 20-18 15 15 0 0 1 25 13 16 16 0 0 1 1 29Z" fill="#fffaf0" stroke="#d2c2a9" stroke-width="3"/><path d="M29 36q-8-9 0-12m11 21q-9-8-1-15m13 14q8-9 0-14" fill="none" stroke="#e2d5bf" stroke-width="3" stroke-linecap="round"/>'
};
function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
function art(kind) { const el = node('span', 'hs-animal-play-art'); el.innerHTML = `<svg viewBox="0 0 80 80" aria-hidden="true">${SVG[kind] || SVG.brush}</svg>`; return el; }
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const FIBER_COPY = { sheep: ['梳一团云朵', '顺着羊毛，轻轻梳过三处蓬松的地方。'], rabbit: ['梳一团兔绒', '动作放轻，顺着兔兔的软毛慢慢梳。'], alpaca: ['梳一团暖绒', '沿着颈侧和身体，把蓬松的绒毛梳顺。'] };
const PET_COPY = {
  shy: ['先陪它安心', '先按住圆点，停一小会儿；放心后再慢慢轻刷。'],
  lively: ['跟上它的小心思', '沿虚线先碰中点，再跟到箭头处；每段松手。'],
  friendly: ['喜欢你的轻轻抚摸', '从圆点顺着箭头轻刷，三处连着陪它放松。']
};
// 固定、宽容的路线便于触摸与键盘操作；不以随机移动或扣材料制造难度。
export function getAnimalPetGesture(animal, step = 0) {
  const personality = PET_COPY[animal?.personality] ? animal.personality : 'friendly';
  step = clamp(Math.floor(Number(step) || 0), 0, 2);
  const ys = animal?.kind === 'alpaca' ? [.31, .49, .62] : [.4, .52, .64];
  if (personality === 'shy' && step === 0) return { style: 'calm', origin: { x: .5, y: ys[0] }, destination: { x: .5, y: ys[0] }, waypoint: null, minDuration: 700 };
  if (personality === 'lively') {
    const reverse = step === 1;
    return { style: 'follow', origin: { x: reverse ? .68 : .32, y: ys[step] }, destination: { x: reverse ? .32 : .68, y: ys[step] }, waypoint: { x: .5, y: ys[step] + (step === 1 ? -.14 : .14) }, minDuration: 160 };
  }
  const reverse = step === 1;
  return { style: 'brush', origin: { x: reverse ? .65 : .35, y: ys[step] }, destination: { x: reverse ? .35 : .65, y: ys[step] }, waypoint: null, minDuration: personality === 'shy' ? 350 : 160 };
}

export function createAnimalActivity({ animal, iconUrl, mode = 'pet', productName = '产物', count = 1, alreadyCared = false, isCurrent = () => true, onCommit }) {
  if (!['pet', 'feed', 'collect'].includes(mode) || !animal || typeof onCommit !== 'function') throw new Error('动物互动参数不完整');
  const family = mode !== 'collect' ? mode : ['chicken', 'duck'].includes(animal.kind) ? 'egg' : ['cow', 'goat'].includes(animal.kind) ? 'milk' : 'fiber';
  const total = family === 'feed' ? 1 : family === 'egg' ? clamp(Math.floor(Number(count) || 1), 1, 3) : 3;
  const personality = PET_COPY[animal.personality] ? animal.personality : 'friendly';
  const copy = family === 'pet' ? PET_COPY[personality] : family === 'feed' ? ['亲手添一份料', '把量勺里的饲料拖到食盆，松开手。'] : family === 'egg' ? ['把小蛋送回篮子', `一颗颗轻轻拿起，放到右边的篮子里。`] : family === 'milk' ? ['接一小桶鲜奶', '从圆点向下轻拉，再松开；保持轻缓的节奏。'] : (FIBER_COPY[animal.kind] || FIBER_COPY.sheep);
  const element = node('section', 'hs-animal-play'); element.dataset.animalPlay = ''; element.dataset.mode = mode; element.dataset.family = family; element.dataset.total = total;
  if (family === 'pet') element.dataset.personality = personality;
  const heading = node('header', 'hs-animal-play-heading');
  const headingCopy = node('div'); headingCopy.append(node('small', 'hs-animal-play-eyebrow', '牧场 · 相伴时光'), node('h3', '', `${animal.name || '小伙伴'} · ${copy[0]}`));
  const counter = node('span', 'hs-animal-play-counter'); counter.setAttribute('aria-label', '互动进度'); heading.append(headingCopy, counter);
  const workspace = node('div', 'hs-animal-play-workspace');
  const stage = node('div', 'hs-animal-play-stage'); stage.dataset.playStage = ''; stage.tabIndex = 0; stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', `${copy[0]}，空格拿起，方向键移动，空格放下`);
  const picture = node('img', 'hs-animal-play-animal'); picture.src = iconUrl || ''; picture.alt = animal.name || '小伙伴'; picture.draggable = false;
  const grass = node('div', 'hs-animal-play-grass');
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); guide.setAttribute('viewBox', '0 0 100 100'); guide.setAttribute('preserveAspectRatio', 'none'); guide.setAttribute('aria-hidden', 'true'); guide.classList.add('hs-animal-play-guide');
  const line = document.createElementNS(guide.namespaceURI, 'polyline'); guide.append(line);
  const source = node('span', 'hs-animal-play-source'); source.dataset.playSource = ''; source.setAttribute('aria-hidden', 'true');
  const target = node('span', 'hs-animal-play-target'); target.dataset.playTarget = ''; target.setAttribute('aria-hidden', 'true');
  const floating = node('span', 'hs-animal-play-tool'); floating.append(art(family === 'feed' ? 'feed' : family === 'egg' ? 'egg' : family === 'milk' ? 'hand' : 'brush')); floating.hidden = true;
  const bowl = node('span', 'hs-animal-play-basket'); bowl.append(art(family === 'feed' ? 'bowl' : family === 'egg' ? 'basket' : family === 'milk' ? 'milk' : 'fiber'));
  const pauseCover = node('div', 'hs-animal-play-pause'); pauseCover.hidden = true;
  const pauseText = node('strong', '', '先歇一下，回来再继续');
  const resume = node('button', 'hs-button primary', '继续互动'); resume.type = 'button'; resume.dataset.playResume = ''; pauseCover.append(pauseText, resume);
  stage.append(grass, picture, guide, bowl, source, target, floating, pauseCover);
  const sidebar = node('aside', 'hs-animal-play-sidebar');
  const instruction = node('p', 'hs-animal-play-instruction', copy[1]);
  const steps = node('div', 'hs-animal-play-steps'); steps.setAttribute('aria-hidden', 'true');
  const stepDots = Array.from({ length: total }, (_, i) => { const dot = node('span', 'hs-animal-play-step', String(i + 1)); steps.append(dot); return dot; });
  const feedback = node('p', 'hs-animal-play-feedback'); feedback.dataset.playFeedback = ''; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const reward = node('p', 'hs-muted', family === 'pet' ? alreadyCared ? '今天已照料过，还可以陪它玩一会儿。' : '完成这次陪伴，获得今天的照料好感。' : family === 'feed' ? '完成后添入 1 份饲料；中途离开不消耗。' : `完成后收好待领取的${productName}；中途离开不收取。`);
  const retry = node('button', 'hs-button primary', '重新试一次'); retry.type = 'button'; retry.dataset.playRetry = ''; retry.hidden = true;
  sidebar.append(instruction, steps, feedback, reward, retry);
  workspace.append(stage, sidebar);
  const keyboard = node('p', 'hs-animal-play-keyboard', '触摸或鼠标拖动 · 键盘：Tab 选中画面，空格拿起，方向键移动，空格放下');
  element.append(heading, workspace, keyboard);

  let disposed = false, step = 0, pending = false, finished = false, paused = false, failed = false, pointer = null, keyboardDrag = null;
  let origin = { x: 0, y: 0 }, destination = { x: 0, y: 0 }, petGesture = null, holdTimer = 0;
  const listeners = [];
  const listen = (targetEl, event, callback, options) => { targetEl.addEventListener(event, callback, options); listeners.push(() => targetEl.removeEventListener(event, callback, options)); };
  const current = () => !disposed && !!isCurrent();
  const landscape = () => window.innerWidth >= window.innerHeight && !document.documentElement.classList.contains('landscape-required');
  const playable = () => current() && !pending && !finished && !failed && !paused && !document.hidden && landscape();
  const setState = () => { element.dataset.state = finished ? 'done' : pending ? 'committing' : failed ? 'error' : paused ? 'paused' : 'playing'; element.dataset.step = step; element.dataset.playStep = step; stage.setAttribute('aria-disabled', String(!playable())); };
  const position = (el, point) => { el.style.left = `${point.x * 100}%`; el.style.top = `${point.y * 100}%`; };
  const pointOf = event => { const rect = stage.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; };
  const near = (point, to, radius = 27) => { const rect = stage.getBoundingClientRect(); return Math.abs(point.x - to.x) * rect.width <= Math.max(radius, rect.width * .055) && Math.abs(point.y - to.y) * rect.height <= radius; };
  function idleMessage() {
    if (petGesture?.style === 'calm') return '第 1 步 · 按住圆点，等它放松后再松手';
    if (petGesture?.style === 'follow') return `第 ${step + 1} 步 · 先到中点，再跟到下一处`;
    return family === 'pet' || family === 'fiber' ? `第 ${step + 1} 处 · ${destination.x > origin.x ? '向右' : '向左'}轻刷` : family === 'milk' ? `第 ${step + 1} 次 · 轻拉，再松开` : family === 'egg' ? `第 ${step + 1} 颗 · 送进篮子` : '拿起量勺，慢慢送到食盆';
  }
  function updateStep() {
    petGesture = family === 'pet' ? getAnimalPetGesture(animal, step) : null;
    element.dataset.gesture = petGesture?.style || family;
    if (petGesture) { origin = petGesture.origin; destination = petGesture.destination; }
    else if (family === 'feed') { origin = { x: .18, y: .73 }; destination = { x: .8, y: .73 }; }
    else if (family === 'egg') { origin = { x: .2 + step * .07, y: .73 }; destination = { x: .81, y: .73 }; }
    else if (family === 'milk') { origin = { x: .51, y: .4 }; destination = { x: .51, y: .76 }; }
    else {
      const ys = animal.kind === 'alpaca' ? [.31, .49, .62] : [.4, .52, .64];
      const reverse = family === 'pet' && step === 1;
      origin = { x: reverse ? .65 : .35, y: ys[step] || .5 }; destination = { x: reverse ? .35 : .65, y: origin.y };
    }
    position(source, origin); position(target, petGesture?.waypoint || destination);
    target.hidden = petGesture?.style === 'calm';
    position(bowl, family === 'feed' || family === 'egg' ? destination : { x: .82, y: .77 });
    source.replaceChildren(family === 'egg' || family === 'feed' ? art(family) : node('span', '', String(step + 1)));
    target.textContent = petGesture?.waypoint ? '1' : family === 'milk' ? '↓' : family === 'feed' || family === 'egg' ? '↓' : destination.x > origin.x ? '→' : '←';
    line.setAttribute('points', [origin, ...(petGesture?.waypoint ? [petGesture.waypoint] : []), destination].map(point => `${point.x * 100},${point.y * 100}`).join(' '));
    line.style.visibility = petGesture?.style === 'calm' ? 'hidden' : '';
    source.style.removeProperty('--calm-progress');
    stepDots.forEach((dot, i) => { dot.classList.toggle('complete', i < step); dot.classList.toggle('current', i === step); dot.textContent = i < step ? '✓' : String(i + 1); });
    counter.textContent = `${step} / ${total}`; feedback.textContent = idleMessage(); setState();
  }
  function release() {
    clearInterval(holdTimer); holdTimer = 0;
    const old = pointer; pointer = null; keyboardDrag = null; floating.hidden = true; source.classList.remove('held'); stage.classList.remove('dragging');
    if (old && stage.hasPointerCapture?.(old.id)) { try { stage.releasePointerCapture(old.id); } catch {} }
  }
  function showMovement(point) { position(floating, point); floating.hidden = petGesture?.style === 'calm'; source.classList.add('held'); stage.classList.add('dragging'); }
  function pause() {
    if (!current() || finished || pending) { release(); return; }
    release(); paused = true; pauseCover.hidden = false; setState();
  }
  function resumePlay() {
    if (!current() || document.hidden || !landscape() || finished || pending) return;
    paused = false; pauseCover.hidden = true; setState(); stage.focus({ preventScroll: true });
  }
  async function commit() {
    if (!playable()) return;
    pending = true; release(); feedback.textContent = '正在收好这份心意…'; setState();
    let result;
    try { if (!current()) return; result = await onCommit(); } catch { result = { ok: false, message: '暂时没能保存，请重新试一次。' }; }
    if (!current()) return;
    pending = false;
    if (result?.ok) {
      finished = true; counter.textContent = `${total} / ${total}`; feedback.textContent = result.message || (family === 'pet' ? '它舒服地眯起了眼睛。' : family === 'feed' ? '食盆添好了，慢慢吃吧。' : `${productName}已经收好了。`);
      stepDots.forEach(dot => { dot.className = 'hs-animal-play-step complete'; dot.textContent = '✓'; });
      source.hidden = target.hidden = true; guide.setAttribute('hidden', ''); instruction.textContent = family === 'pet' ? ({ shy: '它悄悄靠近了一点，记住了你的耐心。', lively: '它开心地跟着你，又舍不得先离开。', friendly: '它舒服地眯起眼睛，想再靠近你一点。' })[personality] : family === 'feed' ? '小伙伴已经收到这份饲料。' : '今天的收获，已经收进食材柜啦。';
      element.classList.add('finished');
    } else { failed = true; feedback.textContent = result?.message || '这次没有完成，可以重新试一次。'; retry.hidden = false; }
    setState();
  }
  function finishGesture(record, point, keyboardInput = false) {
    if (!playable()) { release(); return; }
    const duration = performance.now() - record.started, dx = point.x - record.start.x, dy = point.y - record.start.y;
    const calm = petGesture?.style === 'calm', following = petGesture?.style === 'follow';
    const horizontal = family === 'pet' || family === 'fiber';
    const directed = horizontal ? dx * Math.sign(destination.x - origin.x) >= .2 && Math.abs(dy) < .16 : family === 'milk' ? dy >= .23 && Math.abs(dx) < .16 : Math.abs(dx) >= .32;
    const timeOk = duration >= (petGesture?.minDuration || (family === 'milk' ? 180 : 160)) && (family !== 'milk' || keyboardInput || duration <= 1800);
    const valid = calm ? near(point, origin) && record.maxTravel <= .065 && timeOk : near(point, destination) && directed && record.moves >= 2 && record.distance >= (family === 'milk' ? .22 : .2) && timeOk && (!following || record.passedWaypoint);
    release();
    if (!valid) { feedback.textContent = calm ? '它还有一点害羞，按住圆点不动一小会儿就好。' : following && !record.passedWaypoint ? '不用追得很急，先经过中间圆点，再跟到下一处。' : !timeOk && (family === 'milk' || personality === 'shy' && family === 'pet') ? '放轻一点，慢慢移动，再松开。' : `没关系，再从圆点${family === 'feed' || family === 'egg' ? '送到右边' : '沿箭头'}试一次。`; if (petGesture?.waypoint) { position(target, petGesture.waypoint); target.textContent = '1'; } source.style.removeProperty('--calm-progress'); return; }
    if (calm) { picture.classList.add('is-relaxed'); instruction.textContent = '它愿意靠近了。接下来顺着箭头，慢慢刷过两处。'; }
    step++; element.dataset.step = step; element.dataset.playStep = step;
    if (step >= total) commit(); else updateStep();
  }
  function begin(point, keyboardInput = false) {
    if (!playable() || !near(point, origin)) return null;
    if (petGesture?.waypoint) { position(target, petGesture.waypoint); target.textContent = '1'; }
    source.style.removeProperty('--calm-progress');
    const record = { start: { ...point }, last: { ...point }, started: performance.now(), distance: 0, maxTravel: 0, moves: 0, passedWaypoint: false };
    showMovement(point); feedback.textContent = family === 'milk' ? '轻轻向下，再松开手…' : '沿着箭头，慢慢送过去…';
    if (petGesture?.style === 'calm') {
      feedback.textContent = '别急，轻轻陪着它…';
      holdTimer = setInterval(() => {
        if (!playable()) { release(); return; }
        const held = pointer || keyboardDrag;
        if (!held) return;
        const fraction = held.maxTravel > .065 ? 0 : clamp((performance.now() - held.started) / petGesture.minDuration, 0, 1);
        source.style.setProperty('--calm-progress', `${fraction * 100}%`);
        feedback.textContent = fraction >= 1 ? '它放松了，可以松开手啦。' : '轻轻陪着它，等圆点变绿…';
      }, 80);
    }
    if (keyboardInput) keyboardDrag = record;
    return record;
  }
  function move(record, point) {
    if (!playable()) { release(); return; }
    record.distance += Math.hypot(point.x - record.last.x, point.y - record.last.y); record.moves++; record.last = point;
    record.maxTravel = Math.max(record.maxTravel, Math.hypot(point.x - record.start.x, point.y - record.start.y));
    if (petGesture?.waypoint && !record.passedWaypoint && near(point, petGesture.waypoint, 19)) {
      record.passedWaypoint = true; position(target, destination); target.textContent = destination.x > origin.x ? '→' : '←'; feedback.textContent = '跟上啦，再慢慢跟到箭头处。';
    }
    showMovement({ x: clamp(point.x, .04, .96), y: clamp(point.y, .08, .9) });
  }
  listen(stage, 'pointerdown', event => {
    if (event.target.closest('button') || pointer || keyboardDrag || event.isPrimary === false || event.button !== 0 || !playable()) return;
    const record = begin(pointOf(event)); if (!record) return;
    event.preventDefault(); event.stopPropagation(); stage.focus({ preventScroll: true }); pointer = { ...record, id: event.pointerId };
    try { stage.setPointerCapture(event.pointerId); } catch { release(); }
  });
  listen(stage, 'pointermove', event => { if (!pointer || pointer.id !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); move(pointer, pointOf(event)); });
  listen(stage, 'pointerup', event => { if (!pointer || pointer.id !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); finishGesture(pointer, pointOf(event)); });
  const canceled = event => { if (!pointer || pointer.id !== event.pointerId) return; release(); if (playable()) feedback.textContent = '这一步还没完成，再从圆点开始就好。'; };
  listen(stage, 'pointercancel', canceled); listen(stage, 'lostpointercapture', canceled);
  listen(stage, 'keydown', event => {
    if (![' ', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.target !== stage) return;
    event.preventDefault(); event.stopPropagation();
    if (!playable() || pointer || event.repeat && [' ', 'Enter'].includes(event.key)) return;
    if (event.key === 'Escape') { release(); feedback.textContent = idleMessage(); return; }
    if (event.key === ' ' || event.key === 'Enter') { if (keyboardDrag) finishGesture(keyboardDrag, keyboardDrag.last, true); else begin(origin, true); return; }
    if (!keyboardDrag) { feedback.textContent = '先按空格拿起，再用方向键移动。'; return; }
    const delta = { ArrowLeft: [-.06, 0], ArrowRight: [.06, 0], ArrowUp: [0, -.06], ArrowDown: [0, .06] }[event.key];
    move(keyboardDrag, { x: clamp(keyboardDrag.last.x + delta[0], .03, .97), y: clamp(keyboardDrag.last.y + delta[1], .06, .94) });
  });
  listen(resume, 'click', resumePlay);
  listen(retry, 'click', () => { if (!current() || !failed || pending || finished || paused) return; failed = false; step = 0; retry.hidden = true; instruction.textContent = copy[1]; picture.classList.remove('is-relaxed'); updateStep(); });
  listen(window, 'blur', pause);
  listen(document, 'visibilitychange', () => { if (document.hidden) pause(); });
  listen(window, 'resize', () => { release(); if (!landscape()) pause(); });
  const orientationObserver = new MutationObserver(() => { if (!landscape()) pause(); }); orientationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  updateStep();
  return { element, dispose() { if (disposed) return; disposed = true; release(); orientationObserver.disconnect(); listeners.splice(0).forEach(remove => remove()); stage.tabIndex = -1; stage.setAttribute('aria-disabled', 'true'); resume.disabled = retry.disabled = true; element.dataset.state = 'disposed'; } };
}
