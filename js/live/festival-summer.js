// 夏日太鼓的独立轻量规则与界面。时钟、声音、窗口生命周期由节日活动入口负责。
export const beatDuration = 1400;
export const hitWindow = Object.freeze([0.3, 0.7]);
export const config = Object.freeze({
  title: '海风太鼓台', host: '七弦', scene: '太鼓舞台与团扇茶席',
  intro: '七弦把一对小鼓摆到你面前。先找一找海风的节拍，再用左右鼓接起一段小合奏。没有倒计时，漏掉一拍就等下一拍。',
  instruction: '看鼓谱上的下一拍；光点走进金色区时，点对应的左鼓或右鼓。练习时任选一面鼓，之后跟着左右提示走。',
  steps: Object.freeze(['听拍练习', '左右鼓交替', '海风小合奏']),
  done: '七弦接住最后的尾音：「你看，海风也在为我们打拍子。」彩旗轻轻扬起，这段小合奏已经留在夏日里。',
});
const PAD_NAMES = { left: '左鼓', right: '右鼓', any: '任一面鼓' };
const FINAL_PHRASES = [
  ['left', 'left', 'right', 'left', 'right'],
  ['right', 'left', 'right', 'right', 'left'],
  ['left', 'right', 'right', 'left', 'right'],
];
const WORDS = [
  '七弦：「先不用分左右。看见光点走进金色区，就轻轻落槌；海风会等你的。」',
  '七弦：「左边一句，右边一句。跟着亮起的鼓谱慢慢接，敲错了也不用从头来。」',
  '七弦：「最后加一点小变化。看清下一面鼓，我们把这五拍一起送给夏天。」',
];
const ENDS = [
  '七弦笑着点头：「三拍都找到了！接下来，让两面鼓轮流说话吧。」',
  '七弦：「左右两边已经配合得很好了。准备好，再来一段有变化的小合奏。」',
];

export function create(seed = 0) {
  const variant = Number.isSafeInteger(seed) ? ((seed % FINAL_PHRASES.length) + FINAL_PHRASES.length) % FINAL_PHRASES.length : 0;
  return {
    kind: 'summer', done: false, message: WORDS[0], phase: 0, playing: false,
    hits: 0, lastBeat: -1, phraseIndex: 0, ready: false, paused: false, variant,
    attempts: 0, mistakes: 0, stableHits: 0, streak: 0, bestStreak: 0,
    lastResult: null, lastPad: null, phaseHits: [0, 0, 0],
  };
}
export function phrase(state) {
  if (state.phase === 0) return ['any', 'any', 'any'];
  if (state.phase === 1) return ['left', 'right', 'left', 'right'];
  return [...(FINAL_PHRASES[state.variant] || FINAL_PHRASES[0])];
}
// 与既有 activityStep 一致：仅变更传入状态，无 DOM、时间、声音或存档副作用。
// true 表示接受开始/暂停/换段，或成功命中；合法错拍会更新反馈并返回 false。
export function step(state, action) {
  if (!state || state.kind !== 'summer' || state.done || !action || typeof action !== 'object') return false;
  if (action.type === 'pause') {
    if (!state.playing) return false;
    state.playing = false; state.paused = true; state.lastResult = null;
    state.message = '七弦把鼓槌放轻了：「歇一歇也好。已经接好的拍子都在，准备好再继续。」';
    return true;
  }
  if (action.type === 'start') {
    if (state.playing || state.ready) return false;
    state.playing = true; state.paused = false; state.lastBeat = -1; state.lastResult = null;
    state.message = state.phraseIndex ? '七弦：「就从亮起的这一拍继续，我跟着你。」' : WORDS[state.phase];
    return true;
  }
  if (action.type === 'next') {
    if (!state.ready || state.playing || state.phase >= 2) return false;
    state.phase++; state.phraseIndex = 0; state.ready = false; state.playing = true;
    state.paused = false; state.lastBeat = -1; state.lastResult = null; state.lastPad = null;
    state.message = WORDS[state.phase];
    return true;
  }
  if (action.type !== 'beat' || !state.playing || state.ready) return false;
  const { cycle, phase, pad } = action;
  if (!Number.isSafeInteger(cycle) || cycle < 0 || !Number.isFinite(phase) || phase < 0 || phase >= 1 || !['left', 'right'].includes(pad)) return false;
  // 同周期第二次点击与旧周期回调都不再落槌，也不重复计错或改变进度。
  if (cycle <= state.lastBeat) return false;
  state.lastBeat = cycle; state.attempts++; state.lastPad = pad;
  const expected = phrase(state)[state.phraseIndex];
  if (phase < hitWindow[0] || phase > hitWindow[1]) {
    state.mistakes++; state.streak = 0; state.lastResult = phase < hitWindow[0] ? 'early' : 'late';
    state.message = phase < hitWindow[0]
      ? '这次落槌早了一点。等下一圈走进金色区，再接同一拍就好。'
      : '这次落槌晚了一点。已接好的鼓谱保留，我们等下一圈。';
    return false;
  }
  if (expected !== 'any' && pad !== expected) {
    state.mistakes++; state.streak = 0; state.lastResult = 'wrong';
    state.message = `节拍跟上了，下一句轮到${PAD_NAMES[expected]}。等下一圈再试，不用重来。`;
    return false;
  }
  const stable = phase >= 0.42 && phase <= 0.58;
  state.hits++; state.phraseIndex++; state.phaseHits[state.phase]++;
  state.streak++; state.bestStreak = Math.max(state.bestStreak, state.streak);
  if (stable) state.stableHits++;
  state.lastResult = stable ? 'stable' : 'hit';
  state.message = stable ? '咚！稳稳落在拍心，七弦轻轻应了一声。' : '咚！这一拍接住了，下一拍也慢慢来。';
  if (state.phraseIndex === phrase(state).length) {
    state.playing = false;
    if (state.phase === 2) { state.done = true; state.message = config.done; }
    else { state.ready = true; state.message = ENDS[state.phase]; }
  }
  return true;
}

export function summary(state) {
  const complete = !!state.done;
  const title = !complete ? '正在谱写的海风' : state.stableHits >= 9 ? '稳稳的海风合奏' : state.bestStreak >= 5 ? '默契的海风合奏' : '温柔的海风合奏';
  return {
    title,
    text: complete ? config.done : '已经接好的鼓点仍然保留；准备好，就继续当前的小节。',
    details: [
      `完成鼓点 ${state.hits} / 12`,
      `稳定拍 ${state.stableHits} · 最长连击 ${state.bestStreak}`,
      `调整落槌 ${state.mistakes} 次 · 漏拍不扣进度`,
    ],
  };
}

export function render(state, { h, button }) {
  const target = phrase(state), expected = target[state.phraseIndex];
  const labels = { any: '任选', left: '左', right: '右' };
  const stage = h('div', { class: 'fa-stage fa-summer', 'data-summer-phase': String(state.phase) });
  stage.append(h('ol', { class: 'fa-summer-steps', 'aria-label': '太鼓合奏的三个阶段' }, config.steps.map((name, i) =>
    h('li', { class: i === state.phase ? 'current' : i < state.phase ? 'complete' : '', 'aria-current': i === state.phase ? 'step' : 'false' }, h('b', {}, String(i + 1)), name))));
  if (state.done) {
    stage.append(h('div', { class: 'fa-summer-finale' }, h('span', { 'aria-hidden': 'true' }, '♪  咚  ♫  咚  ♪'), h('strong', {}, '十二拍合奏完成'), h('p', {}, '两面小鼓响成一段夏日回忆。')));
    return stage;
  }
  stage.append(h('div', { class: 'fa-summer-host' }, h('b', {}, `第 ${state.phase + 1} 段 · ${config.steps[state.phase]}`), h('p', {}, state.ready ? ENDS[state.phase] : WORDS[state.phase])));
  stage.append(h('ol', { class: 'fa-drum-score', 'aria-label': '本段鼓谱，亮起的是下一拍' }, target.map((pad, i) =>
    h('li', { class: (i < state.phraseIndex ? 'hit ' : i === state.phraseIndex ? 'next ' : '') + 'pad-' + pad, 'aria-current': i === state.phraseIndex ? 'step' : 'false' },
      h('small', {}, `${i + 1}`), h('b', {}, i < state.phraseIndex ? '✓' : labels[pad]), h('span', {}, i < state.phraseIndex ? '接住了' : pad === 'any' ? '任一鼓' : PAD_NAMES[pad])))));
  stage.append(h('div', { class: 'fa-summer-progress' }, h('span', {}, `本段 ${state.phraseIndex} / ${target.length} 拍`), h('span', {}, `合奏 ${state.hits} / 12`), h('span', {}, `连击 ${state.streak}`)));
  if (state.ready) {
    stage.append(h('p', { class: 'fa-summer-cue' }, '这一小段合好了，下一段由你准备好再开始。'),
      button(`继续 · ${config.steps[state.phase + 1]}`, 'next', { type: 'next' }));
    return stage;
  }
  stage.append(h('p', { class: 'fa-summer-cue' }, `下一拍：${PAD_NAMES[expected]} · 光点进入金色区时落槌`));
  stage.append(h('div', { class: 'fa-track', 'aria-label': '金色区从三成到七成；光点进入后，点击鼓谱指定的小鼓' },
    h('i', { class: 'fa-zone', style: { left: hitWindow[0] * 100 + '%', width: (hitWindow[1] - hitWindow[0]) * 100 + '%' } }),
    h('i', { class: 'fa-pulse', style: { left: '0%' }, 'aria-hidden': 'true' })));
  stage.append(h('div', { class: 'fa-summer-drums' }, ['left', 'right'].map(pad =>
    button([h('span', { class: 'fa-drum-face', 'aria-hidden': 'true' }, pad === 'left' ? '咚' : '咚♪'), h('strong', {}, PAD_NAMES[pad]), h('small', {}, pad === 'left' ? '低声鼓' : '清亮鼓')], 'drum-' + pad, { type: 'beat', pad },
      { class: 'fa-drum-button ' + pad + ((expected === pad || expected === 'any') ? ' suggested' : ''), disabled: !state.playing, 'aria-label': PAD_NAMES[pad] + (pad === 'left' ? '，低声' : '，高声') }))));
  stage.append(h('p', { class: 'fa-summer-feedback', role: 'status', 'aria-live': 'polite', 'data-result': state.lastResult || 'waiting' }, state.lastResult || state.paused ? state.message : '看金色区和亮起的鼓谱，不开声音也能跟上。'));
  stage.append(state.playing ? button('歇一小会儿', 'pause', { type: 'pause' }) : button(state.paused ? '继续这一小段' : '开始听拍', 'start', { type: 'start' }));
  stage.append(h('small', { class: 'fa-summer-note' }, '一圈只落一槌；来不及就等下一圈，已经接好的拍子不会清空。'));
  return stage;
}

export const css = `
.fa-summer{background:linear-gradient(155deg,#fff8ed,#fff2f3);color:#74576a;overflow:hidden}
.fa-summer-steps{display:flex;gap:5px;padding:0;list-style:none;justify-content:center;margin:0 0 12px}
.fa-summer-steps li{display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 5px;border-radius:12px;background:#ede6e2;color:#786c73;font-size:12px;flex:1;line-height:1.4}
.fa-summer-steps b{border-radius:50%;background:#ffffffb0;width:19px;min-width:19px;height:19px;line-height:19px}
.fa-summer-steps .current{background:#f4d58a;color:#6c4c24;font-weight:700}.fa-summer-steps .complete{background:#dceddb}
.fa-summer-host{border-radius:12px;padding:9px 11px;background:#ffffffbf;text-align:left}.fa-summer-host p{font-size:13px;margin:5px 0 0;line-height:1.6}
.fa-drum-score{display:flex;list-style:none;justify-content:center;gap:6px;padding:0;margin:14px 0 9px}
.fa-drum-score li{flex:1;max-width:72px;min-width:0;border:2px solid #e5d9d8;border-radius:12px;background:#fff;display:flex;align-items:center;flex-direction:column;gap:2px;padding:5px 2px;color:#8a7980}
.fa-drum-score small{font-size:10px}.fa-drum-score b{font-size:22px;line-height:1.15}.fa-drum-score span{font-size:11px;white-space:nowrap}.fa-drum-score .next{border-color:#d79054;background:#fff0cb;box-shadow:0 0 0 2px #f6dfab}.fa-drum-score .hit{background:#e9f5e7;border-color:#acd0aa;color:#4a7850}
.fa-summer-progress{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 12px;font-size:12px}.fa-summer-cue{font-weight:700;font-size:13px}
.fa-summer .fa-track{margin:17px 12px 20px;height:27px}.fa-summer .fa-pulse{height:35px;top:-4px;background:#b96a83}.fa-summer .fa-zone:after{content:'';position:absolute;left:50%;top:4px;bottom:4px;border-left:2px dashed #ac793d66}
.fa-summer-drums{display:flex;gap:14px;justify-content:center;margin:10px 0}.fa-drum-button{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;max-width:160px;min-width:0;min-height:105px;border:2px solid #d4bcc1;border-radius:18px;padding:10px 6px;background:#f7e5e4;color:#805564;cursor:pointer;touch-action:manipulation}.fa-drum-button.right{background:#e8f1ed;color:#547c76}.fa-drum-button.suggested{border-color:#d58c55}.fa-drum-button:disabled{opacity:.58;cursor:default}.fa-drum-button:focus-visible{outline:3px solid #b67b45;outline-offset:3px}.fa-drum-button:not(:disabled):active{transform:translateY(2px);filter:brightness(1.04)}
.fa-drum-face{display:flex;align-items:center;justify-content:center;width:64px;height:45px;border:5px double #a66a59;border-radius:50%;background:#ffecc4;box-shadow:0 5px 0 #c77f6b;color:#935949;font-size:20px;font-weight:800;margin-bottom:6px}.right .fa-drum-face{border-color:#698e80;box-shadow:0 5px 0 #86a895;color:#54796f}.fa-drum-button small{font-size:11px}
.fa-summer-feedback{font-size:13px;min-height:3.2em}.fa-summer-feedback[data-result='stable'],.fa-summer-feedback[data-result='hit']{color:#4f7b55;font-weight:700}.fa-summer-note{display:block;font-size:11px;margin-top:10px;line-height:1.6;color:#8a7580}.fa-summer-finale{padding:18px 8px}.fa-summer-finale>span{font-size:28px;display:block;color:#bd8054;margin-bottom:12px}.fa-summer-finale strong{display:block;font-size:20px}
@media(max-width:380px){.fa-summer-steps li{font-size:11px;gap:2px;padding:6px 2px}.fa-summer-steps b{width:16px;min-width:16px;height:16px;line-height:16px}.fa-drum-score{gap:4px}.fa-drum-score span{font-size:10px}.fa-summer-drums{gap:10px}.fa-drum-button{min-height:98px}.fa-summer-progress{gap:4px 9px}}
@media(max-height:500px){.fa-summer-host{padding:6px 9px}.fa-summer-steps{margin-bottom:7px}.fa-drum-score{margin:8px 0 6px}.fa-drum-button{min-height:83px;padding:6px}.fa-drum-face{height:32px;width:54px}.fa-summer-feedback{min-height:1.8em}}
`;
