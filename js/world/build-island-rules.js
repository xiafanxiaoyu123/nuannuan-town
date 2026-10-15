// 建造岛邀请的纯状态转换：调用者一次性应用 patch 并保存，再播放航行动画。
// 不读取账号/网络/本地存储；重复操作使用当前存档计算，不重复扣材料或发奖励。
export const BUILD_QUEST_TITLE = '海风里的空白蓝图';
export const BUILD_LUNCH = Object.freeze({ radish: 3, apple: 2 });
export const BUILD_STARTER_KIT = Object.freeze({ yard_slab: 6, yard_stairs: 2, yard_column: 4, yard_foundation: 2 });

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const questOf = save => {
  const q = save?.buildQuest || {}, rewarded = q.rewarded === true;
  const stage = Number.isInteger(q.stage) && q.stage >= 0 && q.stage <= 3 ? q.stage : 0;
  return { version: 1, stage: rewarded ? 3 : Math.min(stage, 2), rewarded };
};

export function buildQuestProgress(save = {}) {
  const quest = questOf(save);
  const needs = Object.entries(BUILD_LUNCH).map(([id, required]) => ({ id, name: id === 'radish' ? '樱桃萝卜' : '苹果', required, owned: count(save.crops?.[id]), missing: Math.max(0, required - count(save.crops?.[id])) }));
  const steps = [
    { title: '一封来自海边的信', text: '码头边夹着一张空白蓝图：“海风岛留了一片空地，等你画出自己的家。带一份航行便当来，小船已经备好了。”', action: 'accept', actionLabel: '收好蓝图，准备便当', hint: '不需要扩建院子，也不用支付船票。' },
    { title: '准备航行便当', text: '大喵已经备好水壶。再带上 3 个樱桃萝卜和 2 个苹果，就能凑成一份简单的航行便当。', action: 'deliver', actionLabel: '装好便当', hint: '樱桃萝卜可在菜地种植；苹果可在果树田种苹果树获得。只提交本次所需数量，其余留在背包。' },
    { title: '系紧船绳，准备启航', text: '便当已经放进船舱。把松开的船绳整理好，再把空白蓝图铺平——海风岛的第一笔，就从这里开始。', action: 'depart', actionLabel: '整理船绳，免费启航', hint: '首次启航赠送基础建材：楼板 6、阶梯 2、立柱 4、地基 2。以后可以免费往返。' },
    { title: '海风岛已经开放', text: '蓝图上的第一条航线画好了。独立的建造空地已经向你开放，回来照顾菜园、再坐船继续搭建，都随时可以。', action: 'depart', actionLabel: '乘船去海风岛', hint: '后续往返不消耗便当、不收船票；首次建材不会重复发放。' },
  ];
  return { ...steps[quest.stage], titleMain: BUILD_QUEST_TITLE, ...quest, unlocked: quest.stage === 3 && quest.rewarded, needs, canAdvance: quest.stage !== 1 || needs.every(item => !item.missing) };
}

export function advanceBuildQuest(save = {}, action) {
  const q = questOf(save), done = { ok: true, changed: false, patch: {}, stage: q.stage };
  if (!['accept', 'deliver', 'depart'].includes(action)) return { ok: false, error: '没有这项航行准备', stage: q.stage };
  if (action === 'accept') {
    if (q.stage >= 1) return done;
    return { ...done, changed: true, stage: 1, patch: { buildQuest: { version: 1, stage: 1, rewarded: false } } };
  }
  if (action === 'deliver') {
    if (!q.stage) return { ok: false, error: '先读一读码头边的邀请信', stage: q.stage };
    if (q.stage >= 2) return done;
    const missing = buildQuestProgress(save).needs.filter(item => item.missing);
    if (missing.length) return { ok: false, error: '便当还缺：' + missing.map(item => item.name + ' ×' + item.missing).join('、'), missing, stage: q.stage };
    const crops = { ...(save.crops || {}) };
    for (const [id, n] of Object.entries(BUILD_LUNCH)) crops[id] = count(crops[id]) - n;
    return { ...done, changed: true, stage: 2, patch: { crops, buildQuest: { version: 1, stage: 2, rewarded: false } } };
  }
  if (q.stage < 2) return { ok: false, error: '先收好邀请信并准备航行便当', stage: q.stage };
  if (q.rewarded) return { ...done, depart: true };
  const decor = { ...(save.decor || {}) };
  for (const [id, n] of Object.entries(BUILD_STARTER_KIT)) {
    const previous = count(decor[id]);
    if (!Number.isSafeInteger(previous + n)) return { ok: false, error: '建材数量异常，请先整理仓库', stage: q.stage };
    decor[id] = previous + n;
  }
  return { ...done, changed: true, stage: 3, depart: true, rewards: { ...BUILD_STARTER_KIT }, patch: { decor, buildQuest: { version: 1, stage: 3, rewarded: true } } };
}
