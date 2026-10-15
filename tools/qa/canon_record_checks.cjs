// 未接线的首单领域测试：Node内执行原样ES模块，不启动游戏、不读取真实存档。
const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const T = Date.parse('2026-10-08T23:59:59+08:00');
let data, domain, rules;

before(async () => {
  // These pure fixture modules have relative imports; data: URLs alone cannot
  // resolve them. Rewrite the known acyclic module graph without changing files.
  const cache = new Map(), loading = new Set();
  const toDataUrl = (file) => {
    const full = path.resolve(file);
    if (cache.has(full)) return cache.get(full);
    if (loading.has(full)) throw new Error('Cyclic QA module import: ' + full);
    loading.add(full);
    const source = fs.readFileSync(full, 'utf8').replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
      (_, left, relative, right) => left + toDataUrl(path.resolve(path.dirname(full), relative)) + right);
    const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    cache.set(full, url); loading.delete(full); return url;
  };
  const load = (name) => import(toDataUrl(path.join(root, name)));
  [data, domain] = await Promise.all([load('js/data.js'), load('js/live/canon-record.js')]);
  rules = domain.createRecordRules({ clothes: data.CLOTHES, shopIds: Object.keys(data.SHOPS) });
});

function freeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
const copy = (v) => JSON.parse(JSON.stringify(v));
function context(patch = {}) {
  return {
    now: T + 1000, stats: { watered: 7, fish_caught: 4 },
    outfit: { ...data.DEFAULT_OUTFIT }, owned: data.CLOTHES.filter((c) => c.price === 0).map((c) => c.id),
    openShops: Object.keys(data.SHOPS), ...patch,
  };
}
function step(record, action, patch = {}) {
  const c = context(patch);
  freeze(record); freeze(action); freeze(c);
  const result = rules.step(record, action, c);
  assert.equal(typeof result.changed, 'boolean');
  assert.ok([0, domain.RECORD_TASK.reward].includes(result.coins));
  if (result.changed) {
    assert.notStrictEqual(result.record, record);
    assert.notEqual(rules.status(result.record), 'invalid');
  } else {
    assert.strictEqual(result.record, record);
    assert.equal(result.coins, 0);
  }
  return result;
}
const accept = (patch = {}) => step(null, { type: 'accept' }, { now: T, ...patch }).record;
function outfit(record = accept(), patch = {}) {
  return step(record, { type: 'outfit' }, patch).record;
}
function observed(record = accept(), kind = 'watered', patch = {}) {
  if (kind === 'played') return step(record, { type: 'played', event: { id: 'cafe', endedAt: T + 500 } }, patch).record;
  return step(record, { type: 'stats' }, {
    stats: { ...record.base, [kind]: record.base[kind] + 1 }, ...patch,
  }).record;
}
function ready(kind = 'watered') {
  const r = observed(outfit(), kind);
  return step(r, { type: 'select', kind }).record;
}
function rejected(result, reason) {
  assert.equal(result.changed, false);
  assert.equal(result.reason, reason);
}

test('定义只包含原创任务ID、版本和固定80补贴，不注册角色', () => {
  assert.deepEqual(domain.RECORD_TASK, { id: 'canon_dada_record_01', version: 1, reward: 80 });
  assert.ok(Object.isFrozen(domain.RECORD_TASK));
  assert.deepEqual(Object.keys(domain).sort(), ['RECORD_TASK', 'createRecordRules']);
  assert.ok(Object.isFrozen(rules));
});

test('尚无首单字段的null/undefined是可接状态', () => {
  assert.equal(rules.status(null), 'offer');
  assert.equal(rules.status(undefined), 'offer');
});

test('接取旧档缺失统计时从零建基线，不填旧成就或物品', () => {
  const r = accept({ stats: undefined });
  assert.equal(rules.status(r), 'active');
  assert.deepEqual(r.base, { watered: 0, fish_caught: 0 });
  assert.deepEqual(r.events, { watered: null, fish_caught: null, played: null });
  assert.equal(r.acceptedAt, T);
  assert.equal(r.outfit, null);
  assert.equal(r.activity, null);
  assert.equal(r.archivedAt, null);
});

test('已有统计只作为基线，接取和立即观察都不倒算', () => {
  const r = accept();
  assert.deepEqual(r.base, { watered: 7, fish_caught: 4 });
  rejected(step(r, { type: 'stats' }), 'no_new_activity');
});

test('重复接取不改变时间、基线、穿搭或活动', () => {
  const r = ready();
  rejected(step(r, { type: 'accept' }, { now: T + 86400000, stats: { watered: 99 } }), 'already_accepted');
});

for (const type of ['outfit', 'stats', 'played', 'select', 'archive']) {
  test('未接取不能执行 ' + type, () => rejected(step(null, { type }), 'not_accepted'));
}

for (const value of [-1, 1.5, '8', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
  test('拒绝无效基线 ' + String(value), () => {
    rejected(step(null, { type: 'accept' }, { stats: { watered: value } }), 'invalid_stats');
  });
}

for (const value of [0, -1, NaN, Infinity, '1791475199000', 1.5]) {
  test('拒绝无效操作时间 ' + String(value), () => {
    rejected(step(null, { type: 'accept' }, { now: value }), 'invalid_time');
  });
}

test('初始免费装含不戴配件可直接留档，无购买或风格条件', () => {
  const r = outfit();
  assert.deepEqual(r.outfit.items, data.DEFAULT_OUTFIT);
  assert.equal(r.outfit.at, T + 1000);
  assert.equal(rules.status(r), 'active');
});

test('已拥有的混搭可用，不要求同套或某种风格', () => {
  const actual = { ...data.DEFAULT_OUTFIT, dress: 'd_wind', shoes: 's_water' };
  const r = outfit(accept(), { outfit: actual, owned: Object.values(actual) });
  assert.deepEqual(r.outfit.items, actual);
});

test('只记录context实际穿着，不接受按钮payload中另一套衣服', () => {
  const result = step(accept(), { type: 'outfit', outfit: { hair: 'h_lion' } });
  assert.deepEqual(result.record.outfit.items, data.DEFAULT_OUTFIT);
});

test('买过但未穿着的衣服不被自动选作记录', () => {
  const r = outfit(accept(), { owned: data.CLOTHES.map((c) => c.id) });
  assert.deepEqual(r.outfit.items, data.DEFAULT_OUTFIT);
});

for (const slot of ['hair', 'dress', 'shoes', 'acc', 'back']) {
  test('缺少实际服饰槽位时不默默补装：' + slot, () => {
    const actual = { ...data.DEFAULT_OUTFIT }; delete actual[slot];
    rejected(step(accept(), { type: 'outfit' }, { outfit: actual }), 'invalid_outfit');
  });
}

test('错误分类和未知服饰都不记录', () => {
  for (const hair of ['d_reunion', 'h_unknown']) {
    rejected(step(accept(), { type: 'outfit' }, { outfit: { ...data.DEFAULT_OUTFIT, hair } }), 'invalid_outfit');
  }
});

test('实际槽位写着未拥有的衣服也不能提交', () => {
  rejected(step(accept(), { type: 'outfit' }, { outfit: { ...data.DEFAULT_OUTFIT, dress: 'd_lion' } }), 'unowned_outfit');
  rejected(step(accept(), { type: 'outfit' }, { owned: null }), 'invalid_outfit');
});

test('同套重复记录不重写时间、不发币', () => {
  const r = outfit();
  rejected(step(r, { type: 'outfit' }, { now: T + 86400000 }), 'same_outfit');
});

test('归档前可以主动换装更新，但先前快照没有被修改', () => {
  const first = outfit();
  const next = { ...data.DEFAULT_OUTFIT, hair: 'h_far' };
  const result = step(first, { type: 'outfit' }, { now: T + 2000, outfit: next, owned: Object.values(next) });
  assert.equal(result.record.outfit.items.hair, 'h_far');
  assert.equal(first.outfit.items.hair, 'h_reunion');
  assert.equal(first.outfit.at, T + 1000);
  assert.equal(result.coins, 0);
});

test('记录是独立ID快照，不跟随输入对象后来变更', () => {
  const actual = { ...data.DEFAULT_OUTFIT };
  const result = rules.step(accept(), { type: 'outfit' }, context({ outfit: actual }));
  actual.dress = 'd_lion';
  assert.equal(result.record.outfit.items.dress, 'd_reunion');
});

for (const kind of ['watered', 'fish_caught']) {
  test('接取后一次真实总数增长可留证但必须主动选择：' + kind, () => {
    const r = observed(accept(), kind);
    assert.deepEqual(r.events[kind], { at: T + 1000, value: r.base[kind] + 1 });
    assert.equal(r.activity, null);
    assert.equal(step(r, { type: 'archive' }).reason, 'not_ready');
  });
}

test('减小或缺失的总数不能创造活动', () => {
  const r = accept();
  rejected(step(r, { type: 'stats' }, { stats: { watered: 2, fish_caught: 1 } }), 'no_new_activity');
  rejected(step(r, { type: 'stats' }, { stats: undefined }), 'no_new_activity');
});

test('无效的新统计不当作真实增长', () => {
  for (const stats of [{ watered: 8.2 }, { fish_caught: Infinity }, { watered: '8' }, []]) {
    rejected(step(accept(), { type: 'stats' }, { stats }), 'invalid_stats');
  }
});

test('保留首次有效观察，重复和更多浇水不改记录、不发奖', () => {
  const r = observed();
  rejected(step(r, { type: 'stats' }, { now: T + 3000, stats: { watered: 100, fish_caught: 4 } }), 'no_new_activity');
  assert.equal(r.events.watered.value, 8);
});

test('只完成其中一种活动即可，不要求把三项都做完', () => {
  for (const kind of ['watered', 'fish_caught', 'played']) {
    const r = ready(kind);
    assert.equal(rules.status(r), 'ready');
    assert.equal(Object.values(r.events).filter(Boolean).length, 1);
    assert.equal(step(r, { type: 'archive' }).coins, 80);
  }
});

test('接取前结束、接取后才关结算的小游戏不计入', () => {
  rejected(step(accept(), { type: 'played', event: { id: 'cafe', endedAt: T - 1 } }), 'invalid_ended_at');
});

test('接取时刻结束的合法结算按毫秒边界计入', () => {
  const result = step(accept(), { type: 'played', event: { id: 'cafe', endedAt: T } });
  assert.deepEqual(result.record.events.played, { at: T, shop: 'cafe' });
});

test('接取后结束、跨日才关闭结果仍保留原结束时刻', () => {
  const result = step(accept(), { type: 'played', event: { id: 'cafe', endedAt: T + 100 } }, { now: T + 86400000 });
  assert.deepEqual(result.record.events.played, { at: T + 100, shop: 'cafe' });
});

test('零分零星的正常结算也计入，不附加成绩门槛', () => {
  const result = step(accept(), { type: 'played', event: { id: 'cafe', endedAt: T + 100, total: 0, stars: 0 } });
  assert.equal(result.reason, 'activity_observed');
});

for (const endedAt of [undefined, null, 0, NaN, Infinity, T + 2000, String(T + 100)]) {
  test('无效/未来/缺失结束时间不计入：' + String(endedAt), () => {
    rejected(step(accept(), { type: 'played', event: { id: 'cafe', endedAt } }), 'invalid_ended_at');
  });
}

test('未注册或尚未开放店铺的局不计入', () => {
  for (const id of ['unknown', '__proto__', 'tailor']) {
    rejected(step(accept(), { type: 'played', event: { id, endedAt: T + 100 } }, { openShops: ['cafe'] }), 'invalid_shop');
  }
});

test('未正常结算的退出事件没有进度，不能以退出时刻补结束时刻', () => {
  const r = accept();
  rejected(step(r, { type: 'cancelled', id: 'cafe' }), 'invalid_action');
  rejected(step(r, { type: 'played', event: { id: 'cafe' } }), 'invalid_ended_at');
  assert.equal(r.events.played, null);
});

test('重复投递正常结算只保留第一次', () => {
  const r = observed(accept(), 'played');
  rejected(step(r, { type: 'played', event: { id: 'flower', endedAt: T + 700 } }), 'already_observed');
  assert.equal(r.events.played.shop, 'cafe');
});

test('活动选择必须有证据，未知或未完成项不可选', () => {
  const r = observed();
  for (const kind of ['played', 'fish_caught', 'unknown', '__proto__', null]) {
    rejected(step(r, { type: 'select', kind }), 'unavailable_activity');
  }
});

test('只记录穿搭、只观察活动或只选择活动都不能领奖', () => {
  const activityOnly = step(observed(), { type: 'select', kind: 'watered' }).record;
  for (const r of [accept(), outfit(), observed(outfit()), activityOnly]) {
    rejected(step(r, { type: 'archive' }), 'not_ready');
  }
});

test('归档前可改选已完成活动，重复选同项无额外变化', () => {
  const both = step(ready(), { type: 'stats' }, { stats: { watered: 8, fish_caught: 5 } }).record;
  const selected = step(both, { type: 'select', kind: 'fish_caught' }).record;
  assert.equal(selected.activity, 'fish_caught');
  rejected(step(selected, { type: 'select', kind: 'fish_caught' }), 'same_activity');
  assert.equal(step(selected, { type: 'archive' }).coins, 80);
});

test('三类活动全做也只产生固定一次80补贴意图', () => {
  let r = step(outfit(), { type: 'stats' }, { stats: { watered: 100, fish_caught: 50 } }).record;
  r = observed(r, 'played');
  r = step(r, { type: 'select', kind: 'played' }).record;
  const result = step(r, { type: 'archive' }, { reward: 999, multiplier: 3 });
  assert.equal(result.coins, domain.RECORD_TASK.reward);
  assert.equal(rules.status(result.record), 'archived');
  assert.equal(result.record.activity, 'played');
  assert.equal(result.record.archivedAt, T + 1000);
  assert.equal(r.archivedAt, null);
});

test('归档后所有动作都不能重领或改写，包括重新接取', () => {
  const archived = step(ready(), { type: 'archive' }).record;
  for (const type of ['accept', 'outfit', 'stats', 'played', 'select', 'archive']) {
    rejected(step(archived, { type }, { now: T + 86400000 }), 'archived');
  }
});

test('先提交归档记录再处理发币，最新状态重入不重复发奖', () => {
  const holder = { record: ready(), coins: 0 };
  function commit(reenter) {
    const result = step(holder.record, { type: 'archive' });
    holder.record = result.record;
    if (reenter) commit(false);
    holder.coins += result.coins;
  }
  commit(true); commit(true);
  assert.equal(holder.coins, 80);
  assert.equal(rules.status(holder.record), 'archived');
});

test('JSON往返保留未完成状态及基线，跨日观察后仍可交付', () => {
  const saved = copy(outfit());
  const r = observed(saved, 'fish_caught', { now: T + 3 * 86400000 });
  const selected = step(r, { type: 'select', kind: 'fish_caught' }, { now: T + 3 * 86400000 }).record;
  assert.equal(selected.acceptedAt, T);
  assert.deepEqual(selected.outfit, saved.outfit);
  assert.equal(step(selected, { type: 'archive' }, { now: T + 3 * 86400000 }).coins, 80);
});

test('JSON往返的已归档记录不重发补贴，也不需要仍穿原衣服', () => {
  const saved = copy(step(ready(), { type: 'archive' }).record);
  rejected(step(saved, { type: 'archive' }, { now: T + 86400000, outfit: {}, owned: [] }), 'archived');
  assert.deepEqual(saved.outfit.items, data.DEFAULT_OUTFIT);
});

test('无效时间上下文不能把较新的记录倒写回过去', () => {
  rejected(step(outfit(), { type: 'archive' }, { now: T + 1 }), 'invalid_time');
  rejected(step(accept(), { type: 'stats' }, { now: T - 1, stats: { watered: 99 } }), 'invalid_time');
});

const corruptions = {
  '空对象': () => ({}),
  '非对象': () => false,
  '错误任务ID': (r) => ({ ...r, id: 'man' }),
  '未来版本': (r) => ({ ...r, version: 2 }),
  '缺少基线': (r) => { delete r.base; return r; },
  '基线负数': (r) => { r.base.watered = -1; return r; },
  '缺少领取字段': (r) => { delete r.archivedAt; return r; },
  '领取时间为零': (r) => ({ ...r, archivedAt: 0 }),
  '缺少穿搭': (r) => ({ ...r, outfit: null }),
  '未知穿搭': (r) => { r.outfit.items.hair = 'unknown'; return r; },
  '缺少活动记录': (r) => ({ ...r, events: {} }),
  '活动早于接取': (r) => { r.events.watered.at = T - 1; return r; },
  '活动总数不超过基线': (r) => { r.events.watered.value = r.base.watered; return r; },
  '选择无证据活动': (r) => ({ ...r, activity: 'played' }),
  '归档早于记录': (r) => ({ ...r, archivedAt: T }),
};
for (const [name, corrupt] of Object.entries(corruptions)) {
  test('损坏记录保留原样且不重建领奖资格：' + name, () => {
    const bad = corrupt(copy(step(ready(), { type: 'archive' }).record));
    assert.equal(rules.status(bad), 'invalid');
    for (const type of ['accept', 'archive']) rejected(step(bad, { type }), 'invalid_record');
  });
}

test('未知动作和无效context/action均无副作用', () => {
  const r = accept();
  rejected(step(r, { type: 'unknown' }), 'invalid_action');
  rejected(rules.step(r, null, context()), 'invalid_action');
  rejected(rules.step(r, { type: 'outfit' }, null), 'invalid_time');
});

test('规则不持有真实存档或修改调用方的旧居民字段', () => {
  const legacy = freeze({
    npc: { man: { t: 8 } }, req: { man: { i: 2, done: 2, acc: T - 1000 } },
    live: { story: { man: 1 }, storyClaimed: { man: true }, book: { claimed: { npc: true } } },
  });
  const snapshot = copy(legacy);
  const result = step(ready(), { type: 'archive' }, { legacy });
  assert.deepEqual(legacy, snapshot);
  assert.equal(result.coins, 80);
  assert.equal(Object.hasOwn(result.record, 'npc'), false);
  assert.equal(Object.hasOwn(result.record, 'req'), false);
});

test('构造规则时复制分类和店铺ID，不随外部配置数组变化', () => {
  const clothes = data.CLOTHES.map((c) => ({ ...c }));
  const shopIds = ['cafe'];
  const isolated = domain.createRecordRules({ clothes, shopIds });
  clothes.find((c) => c.id === 'h_reunion').cat = 'dress';
  shopIds.length = 0;
  const a = isolated.step(null, { type: 'accept' }, context({ now: T })).record;
  const b = isolated.step(a, { type: 'outfit' }, context()).record;
  assert.deepEqual(b.outfit.items, data.DEFAULT_OUTFIT);
  assert.equal(isolated.step(b, { type: 'played', event: { id: 'cafe', endedAt: T + 500 } }, context()).changed, true);
});
