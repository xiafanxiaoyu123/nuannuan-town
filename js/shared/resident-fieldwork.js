// 青禾的指定田块手记：纯投影、动作匹配和可选存档契约，不读取运行时或存储。
import { CROP, FRUIT } from '../data.js';

const ROUTES = {
  dry: { label: '照顾缺水的植物', intro: '选一株正缺水的植物，亲手浇一次，记下生长时间的变化。' },
  ripe: { label: '收好眼前的成熟', intro: '选一块已成熟的田，亲手收获一次，记下真正收进背包的东西。' },
  empty: { label: '从空田开始', intro: '选一块空田，亲手播种，再为同一株植物浇一次水。' },
};
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const keysAre = (v, keys, required = keys) => plain(v) && Object.keys(v).every(k => keys.includes(k)) && required.every(k => Object.hasOwn(v, k));
const safe = n => Number.isSafeInteger(n) && n >= 0;
const plantName = id => (CROP[id] || FRUIT[id])?.name || '植物';
const plantingText = t => t?.planting ? `当前选中${t.planting.name}，${t.planting.free ? '本次用免费种子 ×1' : `本次需要 ${t.planting.cost} 噗灵`}${t.planting.shortage ? `，还差 ${t.planting.shortage} 噗灵；可以换普通田或稍后筹齐` : ''}。` : '播种使用当前选中的种子或树苗，按原价结算。';
const targetCopy = t => ({ plotKey: t.plotKey, plotId: t.plotId, plantId: t.plantId, plantedAt: t.plantedAt });
export const sameFieldTarget = (a, b) => !!a && !!b && ['plotKey', 'plotId', 'plantId', 'plantedAt'].every(k => a[k] === b[k]);
export function fieldTargetError(t) {
  if (!keysAre(t, ['plotKey', 'plotId', 'plantId', 'plantedAt'])) return '田块目标字段无效';
  if (typeof t.plotKey !== 'string' || t.plotKey.length > 40 || !/^-?\d+,-?\d+$/.test(t.plotKey) || !['plot', 'bigplot'].includes(t.plotId)) return '田块位置无效';
  if (t.plantId === null) return t.plantedAt === null ? null : '空田不应带有种植时间';
  if (typeof t.plantId !== 'string' || !(t.plotId === 'bigplot' ? Object.hasOwn(FRUIT, t.plantId) : Object.hasOwn(CROP, t.plantId) && !Object.hasOwn(FRUIT, t.plantId))) return '田块植物无效';
  return Number.isFinite(t.plantedAt) && t.plantedAt >= 0 && t.plantedAt <= Number.MAX_SAFE_INTEGER ? null : '种植时间无效';
}
function resultError(route, target, result) {
  if (route === 'ripe') {
    if (!keysAre(result, ['plantId', 'itemId', 'kind', 'count']) || result.plantId !== target.plantId || !safe(result.count) || result.count < 1) return '收获结果无效';
    if (result.kind === 'crop' && result.itemId === result.plantId) return null;
    if (result.kind === 'decor' && CROP[result.plantId]?.giant && result.itemId === 'giant_' + result.plantId && result.count === 1) return null;
    return '收获物品与田块不一致';
  }
  return keysAre(result, ['plantId', 'savedSeconds']) && result.plantId === target.plantId && safe(result.savedSeconds) ? null : '照料效果无效';
}
export function fieldPlanError(plan) {
  if (!keysAre(plan, ['route', 'target', 'phase', 'result', 'invalid'], ['route', 'target', 'phase']) || typeof plan.route !== 'string' || !Object.hasOwn(ROUTES, plan.route)) return '手记路线字段无效';
  const error = fieldTargetError(plan.target); if (error) return error;
  if (!['active', 'planted', 'done'].includes(plan.phase) || plan.route !== 'empty' && plan.phase === 'planted') return '手记步骤无效';
  if (plan.route === 'empty' && plan.phase === 'active' ? plan.target.plantId !== null : plan.target.plantId === null) return '步骤与植物目标不一致';
  if (Object.hasOwn(plan, 'invalid') && (plan.invalid !== true || plan.phase !== 'active' || plan.route !== 'empty')) return '田地调整标记无效';
  if (plan.phase === 'done') return Object.hasOwn(plan, 'result') ? resultError(plan.route, plan.target, plan.result) : '已完成手记缺少结果';
  return Object.hasOwn(plan, 'result') ? '未完成手记不应带有结果' : null;
}
export function fieldNotesError(notes) {
  if (!Array.isArray(notes) || notes.length > 7) return '巡田回访应为最多七条记录';
  const days = new Set();
  for (const note of notes) {
    if (!keysAre(note, ['day', 'route', 'target', 'result']) || typeof note.day !== 'string' || !note.day || note.day.length > 80 || days.has(note.day)) return '巡田回访日期或字段无效';
    days.add(note.day);
    const error = fieldPlanError({ route: note.route, target: note.target, phase: 'done', result: note.result }); if (error) return error;
  }
  return null;
}
export function fieldworkChoices(snapshots) {
  return Object.entries(ROUTES).map(([route, def]) => ({ route, ...def, targets: snapshots.filter(t => !fieldTargetError(targetCopy(t)) && (route === 'empty' ? t.plantId === null : route === 'dry' ? t.action === 'water' : ['harvest', 'pickFruit'].includes(t.action))).map(t => ({
    key: t.plotKey, plotId: t.plotId, cropId: t.plantId, target: targetCopy(t),
    title: `第${t.ordinal || snapshots.indexOf(t) + 1}块田 · ${t.plantId ? plantName(t.plantId) : t.plotId === 'bigplot' ? '空果树田' : '空田'}`,
    detail: route === 'dry' ? `正缺水，当前还需 ${t.remain} 秒；只记录你亲手照顾的这一株。` : route === 'ripe' ? '已经成熟；请在田边亲手收取，满篮采集不代办这页手记。' : plantingText(t),
  })) }));
}
export function createFieldPlan(route, key, snapshots) {
  const chosen = fieldworkChoices(snapshots).find(c => c.route === route)?.targets.find(t => t.key === key);
  return chosen ? { route, target: targetCopy(chosen.target), phase: 'active' } : null;
}
export function advanceFieldPlan(plan, event) {
  if (fieldPlanError(plan) || plan.phase === 'done' || plan.invalid || event?.actor !== 'manual' || !plain(event.plot)) return plan;
  const target = { plotKey: event.plot.key, plotId: event.plot.plotId, plantId: event.before?.plantId ?? null, plantedAt: event.before?.plantedAt ?? null };
  if (!sameFieldTarget(plan.target, target)) return plan;
  if (plan.route === 'empty' && plan.phase === 'active' && event.kind === 'plant') {
    const after = { ...target, plantId: event.after?.plantId, plantedAt: event.after?.plantedAt };
    return fieldTargetError(after) || !after.plantId ? plan : { route: plan.route, target: after, phase: 'planted' };
  }
  let result;
  if ((plan.route === 'dry' || plan.route === 'empty' && plan.phase === 'planted') && event.kind === 'water') {
    if (![event.remainBefore, event.remainAfter].every(n => Number.isFinite(n) && n >= 0)) return plan;
    result = { plantId: target.plantId, savedSeconds: Math.max(0, Math.round(event.remainBefore - event.remainAfter)) };
  } else if (plan.route === 'ripe' && event.kind === 'harvest') result = { plantId: target.plantId, itemId: event.yield?.itemId, kind: event.yield?.kind, count: event.yield?.count };
  else return plan;
  const next = { route: plan.route, target: targetCopy(plan.target), phase: 'done', result };
  return fieldPlanError(next) ? plan : next;
}
export function describeFieldNote(note) {
  const name = plantName(note.result.plantId), title = `${ROUTES[note.route].label} · ${name}`;
  const lines = note.route === 'ripe'
    ? [`你亲手收下${note.result.kind === 'decor' ? '巨大' : ''}${name} ×${note.result.count}。`, note.result.kind === 'decor' ? '这份巨大收获放进了摆件仓库。' : '这次的实际收获已经进了作物背包。']
    : [`你${note.route === 'empty' ? '亲手种下并浇了' : '亲手照顾了'}${name}。`, `这一瓢水让它少等了约 ${note.result.savedSeconds} 秒。`];
  return { day: note.day, route: note.route, title, lines };
}
export function fieldworkView(task, snapshots, notes = []) {
  const legacy = !!task && !Object.hasOwn(task, 'plan'), plan = task?.plan;
  let shown = null;
  if (plan) {
    const target = snapshots.find(t => sameFieldTarget(t, plan.target)), done = plan.phase === 'done';
    let message = done ? task.claimed ? '这页手记和今天的郁金香种子已经收好，明天再一起观察新的田块。' : '这页真实的照料记录已经完成，可以回去收好反馈。' : '';
    if (!done && plan.invalid) message = '田地布局已调整，请重新选择空田；先前动作不会带到新的记录里。';
    else if (!done && !target) message = '原来的田块或植物已经变化，请重新选择一块田。';
    else if (!done && plan.route === 'empty' && plan.phase === 'active') message = '到选中的空田亲手播种，再给同一株植物浇水。' + plantingText(target);
    else if (!done && (plan.route === 'dry' || plan.route === 'empty')) message = target.action === 'water' ? '请亲手为这株植物浇一次水。' : '这株已经不缺水或已成熟，帮手的照料不算亲手记录；可以重新选择一块田。';
    else if (!done) message = ['harvest', 'pickFruit'].includes(target.action) ? '请在这块田边亲手收获一次。' : '这株现在还没有可收的果实；可以等它成熟或重新选择。';
    const steps = plan.route === 'empty' ? [{ key: 'plant', text: '在指定空田亲手播种', cur: plan.phase !== 'active' ? 1 : 0, need: 1 }, { key: 'water', text: '亲手浇同一株植物', cur: done ? 1 : 0, need: 1 }]
      : [{ key: plan.route === 'dry' ? 'water' : 'harvest', text: plan.route === 'dry' ? '亲手浇选中的植物' : '亲手收选中的成熟植物', cur: done ? 1 : 0, need: 1 }];
    const valid = done || !!target && !plan.invalid && (plan.route === 'empty' && plan.phase === 'active' ? target.plantId === null : plan.route === 'ripe' ? ['harvest', 'pickFruit'].includes(target.action) : target.action === 'water');
    const place = snapshots.find(t => t.plotKey === plan.target.plotKey && t.plotId === plan.target.plotId);
    shown = { route: plan.route, title: `${place ? `第${place.ordinal || snapshots.indexOf(place) + 1}块田` : '选定田块'} · ${plan.target.plantId ? plantName(plan.target.plantId) : plan.target.plotId === 'bigplot' ? '空果树田' : '空田'}`, target: { ...targetCopy(plan.target), key: plan.target.plotKey }, steps, valid, state: task.claimed ? 'claimed' : done ? 'ready' : 'doing', message };
  }
  const history = notes.map(describeFieldNote);
  return { choices: fieldworkChoices(snapshots), plan: shown, legacy, notes: history, response: history.length ? `青禾还记得：${history[0].lines.join(' ')}` : '' };
}
