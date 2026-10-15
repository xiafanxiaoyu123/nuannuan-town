// 原作角色来访：达达（花愿镇搭配师协会）。这是同人作品里的「非官方小镇日常」，任务和台词均为原创，不是原作剧情。
// 规则沿用 canon-record.js 的纯逻辑；这里负责场景里的人、存档、发奖和面板。
// 与原六位居民完全分账：不动 S.npc / S.req / 剧情 / 图鉴，也不走旧的聊天好感流程。
import { THREE, cbox, box, group, textPlane } from '../core/kit.js';
import { S, bus, save, addCoins, getStat } from '../core/state.js';
import { CLOTHES, CLOTH, SHOPS } from '../data.js';
import { h } from '../core/util.js';
import { audio } from '../core/audio.js';
import { Character, DADA_LOOK } from '../models/character.js';
import { npcIco, clothIcon, coinIco } from '../core/icons.js';
import { createRecordRules, RECORD_TASK } from './canon-record.js';
import { archivePanel } from './visitors.js';
import { gameDayNo } from '../core/gametime.js';
import { festivalDialogue } from './festival-dialogue.js';

export const DADA = { id: 'dada', name: '达达', job: '花愿镇搭配师协会 · 来访', x: 37, z: 5.6 };
const ACT_NAME = { watered: '给作物浇了一次水', fish_caught: '钓到了一条鱼', played: '完成了一局营业' };
const ACT_HINT = { watered: '去后院给缺水的田浇一次水', fish_caught: '去码头钓上一条鱼', played: '去任意一家店营业一局' };
const TIPS = [
  '每家店都有偏爱的风格。出门营业前看一眼衣橱里的「穿搭加成」，会轻松不少。',
  '发型、裙装和鞋穿齐同一套，会触发套装效果。混搭也很好，按你喜欢的来。',
  '订单板每天都会换新的订单，做完三个可以开宝箱。',
  '图鉴里记着你钓到的鱼和种出的作物，慢慢收集就好，不用着急。',
];

let rules = null, ruleKey = '', ready = false, actor = null;
// 面包房是后登记的店：店铺表变了就重建规则
const R = () => { const k = Object.keys(SHOPS).join(); if (k !== ruleKey) { ruleKey = k; rules = createRecordRules({ clothes: CLOTHES, shopIds: Object.keys(SHOPS) }); } return rules; };
const rec = () => S.live.canon.dada;
const openShops = () => Object.keys(SHOPS).filter((id) => id !== 'bakery' || S.live.project.phase >= 3);
const ctx = () => ({ now: Date.now(), stats: { watered: getStat('watered'), fish_caught: getStat('fish_caught') }, outfit: { ...S.outfit }, owned: [...S.owned], openShops: openShops() });

// 每一步都读最新的存档；记录与发奖在同一次同步修改里完成，再一起落盘
function step(action) {
  const r = R().step(rec(), action, ctx());
  if (!r.changed) return r;
  S.live.canon.dada = r.record;
  if (r.coins) addCoins(r.coins, 'live');
  save();
  bus.emit('canon');
  return r;
}
// 有了第一条活动记录就先替玩家选上，之后可以在面板里改
function autoSelect() {
  const r = rec();
  if (!r || r.activity || r.archivedAt) return;
  const k = ['played', 'fish_caught', 'watered'].find((key) => r.events[key]);
  if (k) step({ type: 'select', kind: k });
}

export const canon = {
  status: () => R().status(rec()),
  record: rec,
  accept() { S.live.canon.met.dada = 1; return step({ type: 'accept' }).changed; },
  saveOutfit() { return step({ type: 'outfit' }); },
  select(kind) { return step({ type: 'select', kind }).changed; },
  archive() { return step({ type: 'archive' }).coins; },
  // 任务清单里的一行
  task(game) {
    const st = this.status();
    if (st !== 'active' && st !== 'ready') return null;
    const r = rec(), n = (r.outfit ? 1 : 0) + (r.activity ? 1 : 0);
    return { key: 'canon', group: '来访记录', tag: DADA.name, color: '#f48fb1', text: st === 'ready' ? '把「来访搭配记录」交给达达归档' : !r.outfit ? '请达达记下你现在的搭配' : '完成一件事：浇水、钓鱼或营业一局',
      cur: n, need: 2, coins: RECORD_TASK.reward, ready: st === 'ready', loc: () => ({ x: DADA.x, z: DADA.z + 1.2, where: DADA.name }), open: () => dadaPanel(game), openLabel: '详情' };
  },
};

export function installCanon(game) {
  const town = game.town, ui = game.ui;
  // 场景：一张来访登记的小桌，达达站在桌后
  const desk = group();
  desk.add(box(1.7, 0.74, 0.7, '#fff6ea', 0, 0, 0, { r: 0.08 }));
  desk.add(box(1.84, 0.1, 0.84, '#f48fb1', 0, 0.74, 0, { r: 0.04 }));
  desk.add(cbox(1.5, 0.34, 0.05, '#3d4f7a', 0, 0.42, 0.36, { r: 0.04 }));
  const tx = textPlane('搭配师协会 · 来访登记', { color: '#ffffff', height: 0.2, size: 44 });
  tx.position.set(0, 0.42, 0.395);
  desk.add(tx);
  desk.add(cbox(0.36, 0.03, 0.5, '#ffffff', -0.45, 0.86, 0, { r: 0.01, ry: 0.2 }));
  desk.add(cbox(0.3, 0.02, 0.4, '#ffe9a8', -0.42, 0.885, 0.02, { r: 0.01, ry: 0.32 }));
  desk.add(cbox(0.34, 0.26, 0.26, '#7fc4f5', 0.5, 0.97, -0.05, { r: 0.05 }));
  desk.add(cbox(0.12, 0.3, 0.12, '#ffd76a', 0.5, 1.2, -0.05, { r: 0.04 }));
  desk.add(cbox(0.05, 0.22, 0.05, '#ff8fb1', 0.12, 0.95, 0.12, { r: 0.02, rz: 0.3 }));
  town.place(desk, DADA.x, DADA.z, -0.25);
  town.addRect(DADA.x - 1.0, DADA.x + 1.0, DADA.z - 1.3, DADA.z + 0.5, 'live');
  const ch = new Character(DADA_LOOK);
  ch.root.position.set(DADA.x + 0.2, 0, DADA.z - 0.85);
  ch.root.rotation.y = -0.25;
  town.scene.add(ch.root);
  actor = ch;
  // 头顶标记：有事可做时亮起
  const mk = town.marker(DADA.x, 3.3, DADA.z - 0.8, '#f48fb1');
  const label = () => { const st = canon.status(); return st === 'offer' ? '达达好像在整理什么记录' : st === 'ready' ? '把记录交给达达' : '和达达说话'; };
  town.inter.push({ id: 'dada', x: DADA.x - 0.2, z: DADA.z + 1.3, r: 2.3, prio: 0.2, label, sub: DADA.job, act: () => dadaPanel(game), marker: mk });
  let wave = 0;
  town.ticks.push((time, dt = 0.016) => {
    if (town.zone !== 'town') return;
    ch.update(dt);
    // 玩家走近时转过来看着，并挥一下手
    const dx = town.pos.x - ch.root.position.x, dz = town.pos.z - ch.root.position.z, d = Math.hypot(dx, dz);
    const want = d < 6 ? Math.atan2(dx, dz) : -0.25;
    let diff = want - ch.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    ch.root.rotation.y += diff * Math.min(1, dt * 5);
    if (d < 4 && wave <= 0) { ch.setPose('cheer'); wave = 9; setTimeout(() => ch.setPose('idle'), 900); }
    if (d > 7) wave = Math.min(wave, 1);
    wave -= dt;
    const st = canon.status();
    if (mk) mk.visible = st === 'offer' || st === 'ready';
  });
  if (ready) return;
  ready = true;
  // 真实统计增长后观察浇水 / 钓鱼；营业以正常结算事件为准
  bus.on('quest', () => { if (canon.status() === 'active' || canon.status() === 'ready') { if (step({ type: 'stats' }).changed) autoSelect(); } });
  bus.on('played', (e) => { const st = canon.status(); if (st === 'active' || st === 'ready') { if (step({ type: 'played', event: e }).changed) autoSelect(); } });
}

const outfitNames = (items) => ['hair', 'dress', 'shoes', 'acc', 'back'].map((k) => CLOTH[items[k]]).filter((c) => c && c.acc !== 'none' && c.back !== 'none');

export function dadaPanel(game) {
  const ui = game.ui, town = game.town;
  const near = () => town.zone === 'town' && Math.hypot(town.pos.x - DADA.x, town.pos.z - DADA.z) < 6;
  let m, say = null;
  const body = h('div', { class: 'cn' });
  const btn = (cls, label, fn) => h('button', { class: 'btn ' + cls, onclick: (e) => { audio.init(); audio.sfx('click'); fn(e); } }, label);
  const render = () => {
    const st = canon.status(), r = rec();
    const line = say || (st === 'offer' ? '嗨，暖暖！今天在小镇上过得怎么样？我正在整理一份搭配活动记录，想请你帮个忙。'
      : st === 'active' ? (!r.outfit && !r.activity ? '选一身你已经拥有的搭配就好，不用特意添新衣。再记下一件接下来亲手完成的事，这份记录就有内容了。'
        : r.outfit ? '搭配已经记下了，还差一条活动记录。按你今天的安排来就好。' : '活动这一栏齐了。等你选好想留下的搭配，我们再一起核对。')
      : st === 'ready' ? '搭配和活动都齐了。你看看有没有想改的，没有的话我就归档啦。'
      : st === 'archived' ? '这份已经归档了。你想再看看上次留下的搭配吗？' : '这份记录好像出了点问题，我先收着，不会弄丢的。');
    const kids = [
      h('div', { class: 'reqhead', style: { '--c': '#f48fb1' } }, h('img', { class: 'ava', src: npcIco('dada'), alt: '' }),
        h('div', {}, h('h2', {}, DADA.name), h('p', {}, DADA.job), h('em', { class: 'cn-tag' }, '同人原创 · 非官方小镇日常'))),
      h('p', { class: 'say' }, `「${line}」`),
      h('p', { class:'say festival-dialogue','data-festival-speaker':'dada',hidden:!festivalDialogue('dada') }, festivalDialogue('dada')?'「'+festivalDialogue('dada')+'」':''),
    ];
    if (st === 'offer') {
      kids.push(h('div', { class: 'cn-steps' },
        h('div', {}, h('i', {}, '1'), h('span', {}, '让达达记下你身上这套搭配（已有的衣服就行）')),
        h('div', {}, h('i', {}, '2'), h('span', {}, '接下后亲手做一件事：浇水、钓鱼或营业一局，三选一')),
        h('div', {}, h('i', {}, '3'), h('span', {}, '回来核对、归档'), h('span', { class: 'price' }, h('img', { src: coinIco(), alt: '' }), RECORD_TASK.reward))),
        h('div', { class: 'row cn-act' }, btn('alt', '下次再说', () => { say = '没关系，等你方便的时候再来找我。'; render(); setTimeout(() => m.close(true), 1400); }),
          btn('', '好，我来帮忙', () => { if (!near()) { ui.toast('走到达达身边再说吧'); return; } if (canon.accept()) { audio.sfx('quest'); ui.toast('接下了「来访搭配记录」'); say = null; render(); } })));
    } else if (st === 'active' || st === 'ready' || st === 'archived') {
      const done = st === 'archived';
      const items = r.outfit ? outfitNames(r.outfit.items) : [];
      kids.push(h('div', { class: 'cn-block' + (r.outfit ? ' ok' : '') },
        h('h4', {}, '搭配', r.outfit ? h('em', {}, '已记下') : h('em', { class: 'no' }, '还没记')),
        r.outfit ? h('div', { class: 'cn-fit' }, items.map((c) => h('span', {}, h('img', { src: clothIcon(c.id), alt: '' }), c.name.split('·').pop()))) : h('p', {}, '穿着你想留下的那一身来就好。'),
        !done && btn('sm ' + (r.outfit ? 'alt' : ''), r.outfit ? '改成现在这身' : '记录当前搭配', () => {
          if (!near()) { ui.toast('走到达达身边再记录吧'); return; }
          const res = canon.saveOutfit();
          if (res.changed) { audio.sfx('equip'); say = null; } else say = res.reason === 'same_outfit' ? '和记下的是同一身，不用重复登记。' : '这一身里有还没拥有的衣服，记不了哦。';
          render();
        })));
      kids.push(h('div', { class: 'cn-block' + (r.activity ? ' ok' : '') },
        h('h4', {}, '活动', r.activity ? h('em', {}, '已选好') : h('em', { class: 'no' }, '三选一')),
        h('div', { class: 'cn-acts' }, Object.keys(ACT_NAME).map((k) => {
          const e = r.events[k], on = r.activity === k;
          return h('button', { class: 'cn-opt' + (e ? ' has' : '') + (on ? ' on' : ''), disabled: !e || done, onclick: () => { audio.sfx('tab'); canon.select(k); render(); } },
            h('b', {}, e ? (k === 'played' ? `在${SHOPS[e.shop]?.name || '店里'}营业了一局` : ACT_NAME[k]) : ACT_HINT[k]), h('span', {}, on ? '写进记录' : e ? '已完成，可选' : '未完成'));
        }))));
      if (st === 'ready') kids.push(h('div', { class: 'row cn-act' }, h('span', { class: 'rw' }, '小镇协作补贴 ', h('span', { class: 'price' }, h('img', { src: coinIco(), alt: '' }), RECORD_TASK.reward)),
        btn('gold', '核对无误，归档', (e) => {
          if (!near()) { ui.toast('走到达达身边再交给她吧'); return; }
          const coins = canon.archive();
          if (!coins) return;
          const b = e.currentTarget.getBoundingClientRect();
          audio.sfx('fanfare'); ui.flyCoins(b.left + b.width / 2, b.top, 8);
          say = '搭配和活动都记清楚了，谢谢你，暖暖！这样整理出来的记录，更方便大家参考。';
          render();
        })));
      if (done) kids.push(h('div', { class: 'cn-tip' }, h('b', {}, '协会小贴士'), h('span', {}, TIPS[gameDayNo() % TIPS.length])));
    }
    kids.push(h('div', { class: 'row cn-foot' }, btn('alt sm', '人物档案', () => { m.close(true); archivePanel(game, 'dada'); })));
    body.replaceChildren(...kids);
  };
  render();
  const off = bus.on('canon', () => { if (m && !m._gone) render(); });
  m = ui.modal(body, { ribbon: '来访', cls: 'live-modal', onClose: () => { m._gone = true; off && off(); } });
  return m;
}
