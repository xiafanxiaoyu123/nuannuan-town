// Visible, scene-only pauses beside a real home furnishing. Never save this
// state: the world owns its source/animal/place lease and may cancel it at once.
const DURATIONS = Object.freeze({ chicken: 3.2, duck: 3.5, rabbit: 3, sheep: 3.7, goat: 3.4, alpaca: 3.9, cow: 4 });
const PLACES = Object.freeze({ home: '住处', hay: '干草', trough: '食槽', flowers: '花箱' });
const PERSONALITIES = Object.freeze({ shy: true, friendly: true, lively: true });
const REACTIONS = Object.freeze({
  chicken: { home: '轻轻理一理翅膀', hay: '低头探看，再歪头望你', trough: '探头瞧瞧，又轻轻抬头', flowers: '歪头看看花，又望向你' },
  duck: { home: '放松下来，轻轻舒展翅膀', hay: '侧头探看，轻轻晃晃身体', trough: '侧着头，仔细看看食槽', flowers: '侧头望花，轻轻舒展翅膀' },
  rabbit: { home: '安静歪头，陪你歇一会儿', hay: '小幅探头，嗅嗅干草气息', trough: '轻轻探头，再歪头看你', flowers: '轻轻嗅闻飘来的花香' },
  sheep: { home: '放松脖颈，慢慢望向你', hay: '慢慢低头，嗅嗅干草气息', trough: '低头探看，再轻轻转头', flowers: '轻轻转头，闻闻花香' },
  goat: { home: '放松下来，好奇地望一望', hay: '左右探看，抬头望向你', trough: '探头看一看，再抬起头', flowers: '歪头看花，又抬头望你' },
  alpaca: { home: '慢慢转头，安静陪着你', hay: '探看干草，再缓缓抬头', trough: '慢慢探看，再转头望你', flowers: '轻轻歪头，慢慢望向花箱' },
  cow: { home: '放松脖颈，慢慢摆摆尾巴', hay: '低头嗅闻，尾巴轻轻摆动', trough: '缓缓探头，仔细看看食槽', flowers: '慢慢闻花香，轻轻摆尾' },
});
const own = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const phaseAt = progress => progress < .16 ? 'settle' : progress < .54 ? 'look' : progress < .80 ? 'react' : 'recover';

function describe(state, phase) {
  if (phase === 'settle') return state.personality === 'shy' ? '先安静站稳，慢慢放松' : state.personality === 'lively' ? '停下脚步，好奇地望一望' : '在你身边站稳，放松下来';
  if (phase === 'recover') return '慢慢收回目光，等你继续走';
  if (!state.near) {
    if (phase === 'look') return `远远望向${PLACES[state.place]}`;
    return state.place === 'hay' || state.place === 'flowers' ? '轻轻嗅嗅空气，再望向你' : '远远看一会儿，再望向你';
  }
  if (phase === 'look') return { home: '在熟悉的住处旁放松下来', hay: '朝向干草，轻轻探看', trough: '朝向食槽，探头看一看', flowers: '朝向花箱，轻轻探看' }[state.place];
  return REACTIONS[state.species][state.place];
}

function atAge(state, age) {
  const phase = phaseAt(age / state.duration);
  return { ...state, age, phase, label: describe(state, phase) };
}

export function createAnimalMoment(input) {
  if (!object(input)) return null;
  const { species, place, personality, near = true } = input;
  if (!own(DURATIONS, species) || !own(PLACES, place) || !own(PERSONALITIES, personality) || typeof near !== 'boolean') return null;
  return atAge({ species, place, personality, near, duration: DURATIONS[species] }, 0);
}

export function advanceAnimalMoment(state, dt, options = {}) {
  if (!object(options) || options.cancel === true || !object(state)) return null;
  if (!own(DURATIONS, state.species) || !own(PLACES, state.place) || !own(PERSONALITIES, state.personality) || typeof state.near !== 'boolean' || state.duration !== DURATIONS[state.species] || !Number.isFinite(state.age) || state.age < 0 || state.age >= state.duration) return null;
  const { eligible = true } = options;
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
  if (eligible !== true || elapsed === 0) return state;
  const age = state.age + elapsed;
  // A completed pose must not linger for one more frame in the model sampler.
  return age >= state.duration - 1e-9 ? null : atAge(state, age);
}
