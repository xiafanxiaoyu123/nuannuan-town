// 家园散步的瞬态规则。位置由真实场景确认；不修改存档、经济或模型。
import { ANIMAL } from './homestead.js';

const PERSONALITIES = Object.freeze({
  shy: { followDistance: 1.45, arrivalLine: '先望望你，再放心地靠近，安静地陪你待了一会儿。' },
  friendly: { followDistance: .95, arrivalLine: '轻轻靠近你，像是也很喜欢一起停下来的这一刻。' },
  lively: { followDistance: 1.2, arrivalLine: '好奇地看了看这个角落，又回头等你一起发现。' },
});
const ARRIVAL_LINES = {
  home: {
    shy: '回到熟悉的住处旁，它悄悄挨近你，终于放松下来。',
    friendly: '在熟悉的住处旁，它亲昵地靠着你，像在邀请你常来。',
    lively: '熟悉的住处也藏着新鲜事，它好奇地张望，又回头等你。',
  },
  hay: {
    shy: '干草散着暖暖的气息，它试探着靠近，安心陪你停一会。',
    friendly: '柔软的干草让它放松下来，它靠近你，共享这一刻暖意。',
    lively: '它好奇地探看蓬松干草，又回头望你，仿佛发现了小天地。',
  },
  trough: {
    shy: '到了熟悉的食槽旁，它先看看你，再放心地探头瞧一瞧。',
    friendly: '它探头看看食槽，又亲昵地靠近你，享受你留步的陪伴。',
    lively: '食槽边的小动静引起它的好奇，它探头看看，又回身等你。',
  },
  flowers: {
    shy: '花箱边飘来淡淡花香，它小心地凑近，安静陪你看一会。',
    friendly: '它陪你靠近盛开的花箱，轻轻探看花朵，像也舍不得离开。',
    lively: '花箱里鲜亮的颜色吸引了它，它好奇地探看，又抬头望你。',
  },
};
const STOP_KINDS = ['home', 'hay', 'trough', 'flowers'];
const point = p => p !== null && typeof p === 'object' && !Array.isArray(p) && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= 10000 && Math.abs(p.z) <= 10000;
const copyPoint = p => ({ x: p.x, z: p.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;
const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
export function animalWalkPersonality(personality) { return own(PERSONALITIES, personality) ? { ...PERSONALITIES[personality] } : null; }
export function animalWalkEventError(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).length !== 3 || !['type', 'distance', 'stopKinds'].every(k => Object.hasOwn(event, k)) || event.type !== 'animal_walk') return '散步事件字段无效';
  if (!Number.isFinite(event.distance) || event.distance < 1.6 || event.distance > Number.MAX_SAFE_INTEGER) return '散步路程无效';
  if (!Array.isArray(event.stopKinds) || event.stopKinds.length < 1 || event.stopKinds.length > 4 || Array.from(event.stopKinds).some(k => typeof k !== 'string' || !STOP_KINDS.includes(k)) || new Set(event.stopKinds).size !== event.stopKinds.length) return '散步停留地点无效';
  return null;
}
export function createAnimalWalk(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { animalId, kind, personality, start } = input;
  if (!text(animalId, 80) || !/^[a-z][a-z0-9_-]*$/.test(animalId) || !own(ANIMAL, kind) || !own(PERSONALITIES, personality) || !point(start)) return null;
  return { animalId, kind, personality, distance: 0, stopSeconds: 0, stopKey: null, visitedKeys: [], stopKinds: [], lastAnimal: copyPoint(start), lastPlayer: null, paused: false, status: 'following' };
}
const result = (session, status, line, event = null) => ({ session: { ...session, status }, status, line, event });
export function advanceAnimalWalk(session, frame) {
  if (!session || session.status === 'cancelled') return result(session || {}, 'cancelled', '这次散步已经结束。');
  if (!frame || !point(frame.player) || !point(frame.animal)) return result(session, 'cancelled', '位置变化了，等站稳以后再邀请它散步吧。');
  const next = { ...session, visitedKeys: [...session.visitedKeys], stopKinds: [...session.stopKinds], lastAnimal: copyPoint(frame.animal), lastPlayer: copyPoint(frame.player) };
  if (frame.eligible !== true) return result({ ...next, paused: true }, 'paused', '先歇一下，回来再一起走。');
  if (session.paused) return result({ ...next, paused: false }, 'following', '它还在身边，慢慢走就好。');
  const dt = Number.isFinite(frame.dt) ? Math.max(0, Math.min(.1, frame.dt)) : 0;
  if (!dt) return result(next, 'following', '它在等你慢慢走。');
  const moved = distance(session.lastAnimal, frame.animal), playerMoved = session.lastPlayer ? distance(session.lastPlayer, frame.player) : 0;
  if (moved > 1 || session.lastPlayer && playerMoved > 2) return result(next, 'cancelled', '位置一下变远了，这次先歇歇，再从身边邀请它吧。');
  next.distance += moved;
  const stopped = moved / dt <= .07 && playerMoved / dt <= .10;
  const stop = frame.stop;
  const validStop = stop && text(stop.key, 160) && typeof stop.kind === 'string' && STOP_KINDS.includes(stop.kind) && text(stop.name, 60) && point(stop.position);
  const nearby = validStop && distance(frame.player, stop.position) <= 2.2 && distance(frame.animal, stop.position) <= 2.2 && distance(frame.player, frame.animal) <= 2.5;
  if (!nearby || frame.blocked === true || !stopped) {
    next.stopKey = null; next.stopSeconds = 0;
    return result(next, frame.blocked === true ? 'waiting' : 'following', frame.blocked === true ? '前面有点挤，留出一条能一起走的小路吧。' : distance(frame.player, frame.animal) > 2.5 ? '它正在跟上来，慢一点等它吧。' : '慢慢走，到喜欢的角落一起停一会儿。');
  }
  if (next.visitedKeys.includes(stop.key)) return result({ ...next, stopKey: stop.key, stopSeconds: 2.2 }, 'arrived', ARRIVAL_LINES[stop.kind][next.personality]);
  if (next.distance < 1.6) return result({ ...next, stopKey: null, stopSeconds: 0 }, 'following', '先一起走一小段，再在喜欢的角落歇歇。');
  next.stopSeconds = (session.stopKey === stop.key ? session.stopSeconds : 0) + dt;
  next.stopKey = stop.key;
  if (next.stopSeconds < 2.2 - 1e-9) return result(next, 'settling', `在${stop.name}旁停一停，它正慢慢放松。`);
  next.stopSeconds = 2.2; next.visitedKeys.push(stop.key);
  if (!next.stopKinds.includes(stop.kind)) next.stopKinds.push(stop.kind);
  const event = { type: 'animal_walk', distance: next.distance, stopKinds: [...next.stopKinds] };
  return result(next, 'arrived', ARRIVAL_LINES[stop.kind][next.personality], event);
}
