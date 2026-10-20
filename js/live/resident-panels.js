// 原创居民的常驻活动界面。旧委托/聊天仍走原入口，活动奖励独立记账。
import { h, fmt } from '../core/util.js';
import { audio } from '../core/audio.js';
import { app } from '../core/app.js';
import { S, bus } from '../core/state.js';
import { STYLES, CLOTH, SETS } from '../data.js';
import { clothIcon, fishIco, seedIco, npcIco } from '../core/icons.js';
import { ui, priceTag } from '../ui/ui.js';
import { residentLife } from './residents.js';
import { mountResidentPerformance } from './resident-performance-play.js';
import { residentFieldworkBody } from './resident-fieldwork-panel.js';
import { residentFishingBody } from './resident-fishing-panel.js';
import { buildPanel } from './panels.js';
import { holdResidentForReading } from '../world/town/residents.js';

const click = (fn) => (e) => { audio.init(); audio.sfx('click'); fn(e); };
const note = (text) => h('p', { class: 'res-note' }, text);

export function residentHub(game) {
  let modal;
  const body = h('div', { class: 'res-hub' }, h('h2', {}, '居民日常'), note('看看今天谁有新点子：试烤、巡田、聊搭配，也可以收集诗签和剪报。'),
    h('div', { class: 'res-grid' }, residentLife.list().map((n) => h('button', { class: 'bigcard', 'data-resident': n.id, onclick: click(() => { modal.close(true); residentPanel(n.id, game); }) }, h('b', {}, n.name), h('p', {}, n.title)))));
  modal = ui.modal(body, { ribbon: '小镇生活', cls: 'live-modal' });
  return modal;
}

export function residentPanel(id, game) {
  let data = residentLife.data(id);
  if (!data) { ui.toast('没有这位居民的活动'); return null; }
  const body = h('div', { class: 'res-panel', 'data-resident': id });
  const source = S;
  let modal, signature = '', listening = null, closed = false, releaseReading = null;
  const fieldDraft = { route: '', key: '', editing: false };
  const fishingDraft = { focus: 'steady', sample: null, editing: false, planId: null };
  const isCurrent = () => !closed && S === source && body.isConnected;
  const click = fn => e => { if (!isCurrent()) return; audio.init(); audio.sfx('click'); fn(e); };
  const showResult = (result, success) => {
    if (!isCurrent()) return;
    ui.toast(result?.ok ? success || result.message || result.note : result?.message || result?.note || '这份记录还没有保存好，请再试一次。', result?.ok ? { kind: 'live-reward' } : {});
    render();
  };
  const stopSong = () => {
    if (!listening) return;
    listening.player?.dispose();
    residentLife.cancelPerformance(listening.token);
    if (audio.mode === 'resident_qi') { audio.startMusic(listening.mode || 'town'); if (app.suspended || listening.musicPaused) audio.pauseMusic(); }
    listening = null;
  };
  const nearbyNpc = () => {
    if (game.busy || app.view !== game.town || game.town.zone !== 'town') return null;
    const n = game.town.npcs.find((p) => p.def.id === id);
    return n && n.ch.root.position.distanceTo(game.town.pos) < 3 ? n : null;
  };
  const go = (fn) => click(() => { modal.close(true); fn(); });
  const finishSong = () => {
    if (!isCurrent() || !listening) return { ok: false };
    const reward = residentLife.finishPerformance(listening.token);
    if (!reward?.ok) return reward;
    stopSong();
    ui.toast(reward.coins ? `七弦把你们的见闻收成诗签：+${reward.coins} 噗灵` : '夜曲唱完了，今天收藏的诗签仍好好留着。', { kind: 'live-reward' });
    render(); return reward;
  };
  const beginSong = (mode = 'listen') => {
    if (!isCurrent() || listening) return;
    if (game.busy || app.view !== game.town || game.town.zone !== 'town') { ui.toast('回到小镇，再来听这段夜曲。'); return; }
    const token = residentLife.beginPerformance(mode);
    if (!token) { ui.toast('夜曲在小镇的夜间开始；现实时间不受限制。'); return; }
    listening = { token, mode: audio.mode, musicPaused: audio.musicPaused, zone: game.town.zone, player: null };
    audio.startMusic('resident_qi'); render();
  };
  const taskBody = (d) => {
    if (id === 'shi' && d.fishingJournal && !d.fishingJournal.legacy) {
      const task = JSON.stringify(S.live.residents.tasks.shi || null);
      const fishingClick = fn => click(() => {
        if (JSON.stringify(S.live.residents.tasks.shi || null) !== task || residentLife.data('shi').day !== d.day) return;
        fn();
      });
      return residentFishingBody(d, { draft: fishingDraft, click: fishingClick, render,
        start: focus => { const result = residentLife.startFishingJournal(focus); if (result.ok) fishingDraft.editing = false; showResult(result); },
        claim: sample => showResult(residentLife.claim('shi', { sample })),
        go: () => { modal.close(true); game.openShop('fish'); } });
    }
    if (id === 'he' && d.fieldwork && !d.fieldwork.legacy) {
      const task = JSON.stringify(S.live.residents.tasks.he || null);
      const fieldClick = fn => click(() => {
        if (JSON.stringify(S.live.residents.tasks.he || null) !== task || residentLife.data('he').day !== d.day) return;
        fn();
      });
      return residentFieldworkBody(d, { draft: fieldDraft, click: fieldClick, render,
        start: (route, key) => { const result = residentLife.startFieldwork(route, key); if (result.ok) fieldDraft.editing = false; showResult(result); },
        claim: () => showResult(residentLife.claim('he')),
        go: target => { modal.close(true); game.homesteadWorld.visitFarm({ target }); },
        visitHome: () => { modal.close(true); game.travel('home'); },
        preparePlot: () => { modal.close(true); game.homesteadWorld.buildFurniture('plot', 'home'); } });
    }
    const reward = d.reward.seed ? h('span', { class: 'res-seed' }, h('img', { src: seedIco(d.reward.seed), alt: '' }), '郁金香种子 ×' + d.reward.n) : priceTag(d.reward.coins);
    const btn = d.state === 'locked' ? h('button', { class: 'btn alt sm', onclick: go(() => buildPanel()) }, '查看面包房工地')
      : d.state === 'offer' ? h('button', { class: 'btn', 'data-act': 'start', onclick: click(() => showResult(residentLife.start(id))) }, '开始今日记录')
      : d.state === 'ready' ? h('button', { class: 'btn gold', 'data-act': 'claim', onclick: click(() => showResult(residentLife.claim(id))) }, '领取反馈')
      : h('button', { class: 'btn alt', disabled: true }, d.state === 'claimed' ? '今天已完成' : '正在记录');
    const extra = [];
    if (d.field) extra.push(h('div', { class: 'res-facts' }, ['地块 ' + d.field.plots, '空田 ' + d.field.empty, '缺水 ' + d.field.thirsty, '可收获 ' + d.field.ripe].map((x) => h('span', { class: 'chip' }, x))));
    if (d.shop) extra.push(note(`今日完美出炉 ${d.shop.todayPerfect} 份 · 面包房 Lv.${d.shop.lv}。${d.state === 'locked' ? '先把面包房建好，再一起练习。' : '火候稳一点，试烤记录就会多一点。'}`));
    if (d.fish) extra.push(h('div', { class: 'res-fish' }, d.fish.map((f) => h('div', { class: f.count ? '' : 'unknown' }, h('img', { src: fishIco(f.id), alt: '' }), h('b', {}, f.count ? f.name : '待记录'), h('small', {}, f.count ? `累计 ${fmt(f.count)} 条` : '成功收线后收录')))), note('钓过的鱼都会记在这里。还没见过的，等下一次咬钩再认。'));
    return h('div', {}, note(d.intro), ...extra,
      h('div', { class: 'res-steps' }, d.steps.map((s) => h('div', {}, h('span', {}, s.text), h('b', {}, `${s.cur}/${s.need}`)))),
      h('div', { class: 'row res-actions' }, h('span', { class: 'res-reward' }, '今日反馈 ', reward), btn),
      h('div', { class: 'row' }, id === 'man' && d.state !== 'locked' && h('button', { class: 'btn alt sm', onclick: go(() => game.openShop('bakery')) }, '去烘焙'),
        id === 'he' && h('button', { class: 'btn alt sm', onclick: go(() => game.travel('home')) }, '查看后院'),
        id === 'shi' && h('button', { class: 'btn alt sm', onclick: go(() => game.openShop('fish')) }, '去钓场')),
      note('从接下记录后开始计算，小镇清晨5点更新。今天做完了，明天再来看看。'));
  };
  const reviewBody = (d) => h('div', {},
    h('div', { class: 'res-speech' }, d.review.lines.map((line) => h('p', {}, line))),
    h('div', { class: 'res-facts' }, d.review.shops.map((sh) => h('span', { class: 'chip' }, `${sh.name} +${sh.pct}%`))),
    h('div', { class: 'row' }, h('button', { class: 'btn', 'data-act': 'review', onclick: click(() => showResult(residentLife.saveReview())) }, '保存今日点评'),
      h('button', { class: 'btn alt', onclick: go(() => game.openWardrobe('closet')) }, '去衣橱试试')),
    note('每家店偏爱的风格不同。混搭、穿齐一套，都可以有自己的安排。'),
    h('details', { class: 'res-history' }, h('summary', {}, `近期点评（${d.history.length}/7）`), d.history.map((r) => h('p', {}, h('b', {}, r.day + ' · '), r.lines.join(' ')))));
  const albumBody = (d) => h('div', {},
    note('把今天这身留进剪报册吧。每套都只记一页，初始套装也有自己的位置。'),
    h('div', { class: 'row' }, h('span', {}, d.set ? `当前：${SETS[d.set].name}` : '当前主件还不是完整同套'),
      h('button', { class: 'btn' + (d.recorded ? ' alt' : ' gold'), disabled: !d.set || d.recorded, 'data-act': 'album', onclick: click(() => showResult(residentLife.showOutfit())) }, d.recorded ? '这套已收录' : '贴进剪报册 +40')),
    h('div', { class: 'res-album' }, d.items.map((item) => h('div', {}, CLOTH[item.outfit?.dress] && h('img', { src: clothIcon(item.outfit.dress), alt: '' }), h('b', {}, item.name), h('small', {}, item.day)))),
    note('新搭配的名字和展示日期会留在这里，随时都可以翻看。'));
  const poemBody = (d) => {
    if (listening) return h('div', { class: 'res-performance-host' });
    const today = d.history.find(p => p.day === d.day), shown = today || d.preview;
    return h('div', {},
      d.recentResponse && h('div', { class: 'res-speech res-return', 'data-resident-return': '' }, h('b', {}, '七弦还记得'), h('p', {}, d.recentResponse)),
      note('夜里风轻，把今天的种田、钓鱼和忙碌收成一首歌。可以静静听，也可以轻敲三句回应，再挑一句自己的结尾。'),
      h('div', { class: 'res-verses', 'data-resident-poem': '' }, h('b', {}, today ? '今天收藏的诗签' : '今晚的见闻'), shown.lines.map(line => h('p', {}, line))),
      h('div', { class: 'res-facts', 'data-poem-counts': '' }, h('span', { class: 'chip' }, today ? '写下时的见闻' : '当前见闻'), [['打工', 'plays'], ['浇水', 'watered'], ['收获', 'harvested'], ['钓鱼', 'fish_caught']].map(([label, key]) => h('span', { class: 'chip' }, `${label} ${shown.counts?.[key] || 0}`))),
      h('div', { class: 'row res-performance-choices' },
        h('button', { class: 'btn', 'data-act': 'perform-echo', disabled: !d.night, onclick: click(() => beginSong('echo')) }, d.night ? '一起把夜曲接下去' : '等小镇入夜再开始'),
        h('button', { class: 'btn alt', 'data-act': 'perform', disabled: !d.night, onclick: click(() => beginSong('listen')) }, '只听一会儿 · 6秒')),
      note(d.completed ? '今天的诗签与50噗灵已收好。重听可以试不同回应，不再奖励，也不改写已收藏的结尾。' : '以小镇昼夜为准。两种方式都能收藏今日诗签并获得原有50噗灵；每日一次，中途关闭可重新开始。'),
      h('details', { class: 'res-history' }, h('summary', {}, `收藏的诗签（${d.history.length}/7）`), d.history.map(p => h('article', { class: 'res-poem-entry' }, h('b', {}, p.day),
        h('small', {}, p.performance?.mode === 'echo' ? '一起接完的夜曲' : '静静听过的夜曲'), p.lines.map(line => h('p', {}, line))))));
  };
  const render = () => {
    const scroll = body.scrollTop, focused = body.contains(document.activeElement) ? document.activeElement : null;
    const historyOpen = [...body.querySelectorAll('details.res-history')].map(el => el.open);
    const focusAttribute = focused && [...focused.attributes].find(a => a.name.startsWith('data-field-') || a.name.startsWith('data-fishing-'));
    const focus = focusAttribute && { name: focusAttribute.name, value: focusAttribute.value };
    listening?.player?.dispose();
    data = residentLife.data(id); signature = JSON.stringify(data);
    const nearby = !!nearbyNpc();
    body.replaceChildren(h('div', { class: 'reqhead', style: { '--c': STYLES[data.npc.like].color } }, h('img', { class: 'ava', src: npcIco(data.npc.id), alt: '' }),
      h('div', {}, h('h2', {}, data.title), h('p', {}, data.npc.job + ' · ' + data.day))),
      data.kind === 'task' ? taskBody(data) : data.kind === 'review' ? reviewBody(data) : data.kind === 'album' ? albumBody(data) : poemBody(data),
      h('div', { class: 'row res-nav' }, h('button', { class: 'btn alt sm', 'data-act': 'chat', disabled: !nearby, title: nearby ? '和本人聊聊' : '在本人附近时可聊天', onclick: click(() => {
        const n = nearbyNpc();
        if (!n) { ui.toast('居民已经走远了，靠近本人再聊聊吧。'); render(); return; }
        modal.close(true); game.town.talk(n);
      }) }, '聊聊'),
        h('button', { class: 'btn alt sm', onclick: go(() => ui.reqPanel(id)) }, '往事与旧委托'), h('button', { class: 'btn alt sm', onclick: go(() => residentHub(game)) }, '其他居民')));
    if (listening) {
      const session = listening;
      session.player = mountResidentPerformance(body.querySelector('.res-performance-host'), { token: session.token,
        isCurrent: () => isCurrent() && listening === session && app.view === game.town && game.town.zone === session.zone && !game.busy,
        onFinish: finishSong, onInvalid: () => { if (isCurrent() && listening === session) { stopSong(); ui.toast('这段夜曲已经暂停，重新开始就好。'); render(); } } });
    }
    [...body.querySelectorAll('details.res-history')].forEach((el, index) => { el.open = historyOpen[index] || false; });
    body.scrollTop = scroll;
    if (focus) [...body.querySelectorAll(`[${focus.name}]`)].find(el => el.getAttribute(focus.name) === focus.value && !el.disabled)?.focus({ preventScroll: true });
  };
  render();
  const refresh = setInterval(() => {
    if (!isCurrent()) { clearInterval(refresh); releaseReading?.(); stopSong(); return; }
    if (app.view !== game.town || game.town.zone !== 'town' || !game.town.active || game.busy) releaseReading?.();
    if (listening && (app.view !== game.town || game.town.zone !== listening.zone || game.busy)) { stopSong(); render(); }
    const chat = body.querySelector('[data-act="chat"]'), nearby = !!nearbyNpc();
    if (chat) { chat.disabled = !nearby; chat.title = nearby ? '和本人聊聊' : '在本人附近时可聊天'; }
    if (!listening && signature !== JSON.stringify(residentLife.data(id))) render();
  }, 1000);
  const offReplace = bus.on('stateReplaced', () => modal?.close(true));
  const offZone = bus.on('zoneChanged', zone => { if (zone !== 'town') releaseReading?.(); });
  modal = ui.modal(body, { ribbon: '居民日常', cls: 'live-modal', onClose: () => { closed = true; releaseReading?.(); clearInterval(refresh); stopSong(); offReplace(); offZone(); } });
  // Acquire once on opening: a remote panel must not catch a resident passing by later.
  releaseReading = holdResidentForReading(game.town, nearbyNpc(), () => isCurrent() && !game.busy);
  return modal;
}
