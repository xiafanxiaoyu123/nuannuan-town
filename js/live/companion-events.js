// 诺诺伊共同日常：独立于原亲密度和礼物，只把真实行动保存为可重看的回忆。
import { THREE } from '../core/kit.js';
import { S, bus, save, addCoins } from '../core/state.js';
import { gameDayNo, gameDate } from '../core/gametime.js';
import { h } from '../core/util.js';
import { DECO } from '../data.js';
import { visitors } from './visitors.js';

const TEA = { x: 1001.75, z: 3.65, zone: 'nhome' };
const LIGHTS = new Set(['n_lamp', 'floorlamp', 'lamp']);
const SEATS = new Set(['chair', 'bench', 'n_bean', 'sofa']);
export const COMPANION_EVENTS = [
  { id: 'tea', name: '两杯慢慢凉的茶', love: 2, coins: 40,
    hint: '晚上诺诺伊在家时，走到她家东南角茶桌的左侧，一起把茶端好。',
    intro: ['诺诺伊：总是站在门口聊天，连茶都顾不上喝。今晚来家里坐一会儿吧。', '暖暖：那我来端杯子。桌边留给你的位置，也要留给休息的自己。'],
    end: ['暖暖把两杯茶放在桌边，往旁边挪了挪小碟子。', '诺诺伊：修东西的时候，总觉得再多做一点就好了。茶凉了才发现，天已经黑了。', '暖暖：那今天先把这杯喝完。明天的事，我们明天再做。', '诺诺伊笑了笑：好。这次不急着站起来了。'],
    memory: '茶桌边空着的位置，被两杯热茶和一段不着急的谈话填满了。她记住了先休息一会儿，我记住了她放松时的笑。' },
  { id: 'corner', name: '给灯光留一个位置', love: 5, after: 'tea', coins: 80,
    hint: '接下约定后，在暖暖自己的小屋里摆一盏灯和一张座椅，相距不超过4格。退出装修确认布置，再回诺诺伊身边分享。',
    intro: ['诺诺伊：你的小屋里，有没有一处只留给自己坐一会儿的角落？我想和你一起想个摆法。', '暖暖：一盏柔和的灯，再加一张舒服的椅子。我们不用把每一个空隙都填满。', '诺诺伊：就这么说定了。你来摆位置，我来记下这份小设计。摆好后一定告诉我。'],
    end: ['暖暖把灯和座椅的位置画给诺诺伊看。', '诺诺伊：灯光从旁边落下来，坐着看书的时候就不会挡住字了。你把通道也留出来了！', '暖暖：椅子旁还留了一点空位。下次一起坐的时候，可以再添一张。', '诺诺伊：那这一角就有我们两个人的主意了。'],
    memory: '我们商量着给暖暖的小屋留下一盏灯、一张座椅。布置不再只是把东西摆满，也是在给相聚留位置。' },
  { id: 'photo', name: '今天也请站在我身边', love: 8, after: 'corner', coins: 120,
    hint: '用自拍或固定支架，把暖暖和诺诺伊的头部、身体一起拍进画面。两人须在同一区域、相距6米内，不能被家具挡住；拍好后再和她分享。',
    intro: ['诺诺伊：以前照片里总是修好的东西，轮到我站进去，就不知道手该放哪里。', '暖暖：站在我旁边就好。不用摆出很厉害的样子，今天的我们就值得留念。'],
    end: ['暖暖把刚拍好的合照递给诺诺伊。', '诺诺伊：原来我笑起来是这个样子。你也在旁边，感觉就没有那么紧张了。', '暖暖：以后再翻到这张照片，就能想起今天。', '诺诺伊：嗯。下次轮到我提醒你——也要站进自己的回忆里。'],
    memory: '我们终于一起站进了照片。她没再只看镜头里的工具与作品，也看见了今天的自己和陪在身边的人。' },
];
const definition = (id) => COMPANION_EVENTS.find((event) => event.id === id);
const integer = (n) => Number.isSafeInteger(n) && n >= 0;
function state() {
  if (!S.live.companion || typeof S.live.companion !== 'object' || Array.isArray(S.live.companion)) S.live.companion = { version: 1, events: {} };
  const c = S.live.companion;
  if (!c.events || typeof c.events !== 'object' || Array.isArray(c.events)) c.events = {};
  c.version = 1;
  for (const [id, record] of Object.entries(c.events)) {
    if (!definition(id) || !record || !['active', 'done'].includes(record.status) || !integer(record.startedDay)) { delete c.events[id]; continue; }
    if (record.status === 'done' && !integer(record.doneDay)) record.doneDay = record.startedDay;
    if (id === 'corner') record.placed = (Array.isArray(record.placed) ? record.placed : []).filter(p => p && DECO[p.id] && integer(p.gx) && integer(p.gz) && integer(p.rot) && p.rot < 4).slice(-16);
    if (id === 'photo' && !integer(record.shot)) delete record.shot;
  }
  return c;
}
const nearNonoy = (game, radius = 5) => {
  const n = visitors.nonoy?.def, t = game.town;
  return !!n && t.zone === (n.zone || 'town') && Math.hypot(t.pos.x - n.x, t.pos.z - n.z) < radius;
};
const atTea = (game) => {
  const t = game.town, n = visitors.nonoy?.def;
  return t.zone === TEA.zone && n?.zone === TEA.zone && Math.hypot(t.pos.x - TEA.x, t.pos.z - TEA.z) < 1.8;
};
function cornerPair() {
  const placed = state().events.corner?.placed || [];
  const actual = placed.filter(p => (S.placedIn || []).some(e => e.id === p.id && e.gx === p.gx && e.gz === p.gz && e.rot === p.rot));
  return actual.find(a => LIGHTS.has(a.id) && actual.some(b => SEATS.has(b.id) && Math.hypot(a.gx - b.gx, a.gz - b.gz) <= 4));
}
function finish(game, id) {
  const c = state(), event = definition(id), record = c.events[id];
  if (!event || record?.status !== 'active' || !companion.ready(game, id)) return false;
  // 先记完成再发一次性奖励，避免重开对话或同步事件回入时重复领取。
  record.status = 'done'; record.doneDay = gameDayNo(); save();
  addCoins(event.coins, 'companion'); bus.emit('companionChanged');
  game.ui.toast(`收下回忆「${event.name}」 · +${event.coins} 噗灵`, { kind: 'live-reward' });
  return true;
}
function conversation(game, event, lines, onDone) {
  let index = 0, dialog;
  const body = h('div', { class: 'cn companion-dialog' });
  const render = () => body.replaceChildren(h('h2', {}, event.name), h('p', { class: 'cn-tag' }, '同人原创 · 诺诺伊的共同日常'),
    h('p', { class: 'say', style: { minHeight: '6em' } }, lines[index]),
    h('div', { class: 'row cn-act' }, h('span', {}, `${index + 1} / ${lines.length}`),
      h('button', { class: 'btn gold', 'data-companion-next': '', onclick: () => {
        if (index + 1 < lines.length) { index++; render(); }
        else { dialog.close(true); onDone?.(); }
      } }, index + 1 < lines.length ? '继续听' : onDone ? '记住这一刻' : '合上回忆')));
  render(); dialog = game.ui.modal(body, { ribbon: '共同日常', cls: 'live-modal' }); return dialog;
}
export const companion = {
  state,
  info(id) {
    const d = definition(id), record = state().events[id];
    if (!d) return null;
    const reason = (S.live.nonoy?.love || 0) < d.love ? `亲密度达到 ${d.love}` : d.after && state().events[d.after]?.status !== 'done' ? `先完成「${definition(d.after).name}」` : '';
    return { ...d, record, locked: !!reason, reason, complete: record?.status === 'done' };
  },
  start(game, id) {
    const info = this.info(id); if (!info || info.locked || info.record || !nearNonoy(game)) return false;
    state().events[id] = { status: 'active', startedDay: gameDayNo(), ...(id === 'corner' ? { placed: [] } : {}) };
    save(); bus.emit('companionChanged'); return true;
  },
  ready(game, id) {
    const record = state().events[id]; if (record?.status !== 'active') return false;
    return id === 'tea' ? atTea(game) : id === 'corner' ? !!cornerPair() && nearNonoy(game) : !!record.shot && nearNonoy(game);
  },
  complete(game, id) { return finish(game, id); },
  committed({ placements = [] } = {}) {
    const record = state().events.corner; if (record?.status !== 'active') return false;
    let changed = false;
    for (const placement of placements) {
      const e = placement.e, id = placement.id || e?.id;
      if (placement.zone !== 'house' || !e || (!LIGHTS.has(id) && !SEATS.has(id))) continue;
      if (!(S.placedIn || []).some(a => a.id === id && a.gx === e.gx && a.gz === e.gz && a.rot === e.rot)) continue;
      const p = { id, gx: e.gx, gz: e.gz, rot: e.rot };
      record.placed = record.placed.filter(a => !(a.id === id && a.gx === p.gx && a.gz === p.gz)); record.placed.push(p); record.placed = record.placed.slice(-16); changed = true;
    }
    if (changed) { save(); bus.emit('companionChanged'); }
    return changed;
  },
  photographed(game, payload = {}) {
    const record = state().events.photo, town = game.town, other = visitors.nonoy;
    if (record?.status !== 'active' || !integer(payload.shot) || payload.shot < 1 || payload.zone !== town.zone || !payload.camera?.isCamera || !other || !nearNonoy(game, 6)) return false;
    const fail = (reason) => { this.lastPhotoIssue = reason; game.ui.toast(reason + '。照片仍已正常保存'); return false; };
    const roots = [town.player.root, other.ch.root], cam = payload.camera;
    if (roots.some(root => !root.visible)) return fail('合影需要暖暖和诺诺伊一起入镜，可换自拍或固定支架');
    cam.updateMatrixWorld(true); town.scene.updateMatrixWorld(true);
    const ignored = [...roots, town.momo.root];
    const meshes = []; town.scene.traverse(o => {
      // 脚边随行的大喵可以一起入镜；它不是挡住合影的家具。
      if (!o.isMesh || ignored.some(root => {for(let p=o;p;p=p.parent)if(p===root)return true;return false;})) return;
      for(let p=o;p;p=p.parent) if(!p.visible)return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.isShaderMaterial || (m.transparent && m.opacity < 0.75) || o.name === 'season-particles') return;
      meshes.push(o);
    });
    const origin = cam.getWorldPosition(new THREE.Vector3()), ray = new THREE.Raycaster();
    for (const root of roots) for (const height of [0.9, 1.65]) {
      const target = root.localToWorld(new THREE.Vector3(0, height, 0)), ndc = target.clone().project(cam);
      if (Math.abs(ndc.x) > 0.86 || Math.abs(ndc.y) > 0.92 || ndc.z < -1 || ndc.z > 1) return fail('还有人没完整进入画面，稍微把镜头拉远一点');
      const distance = origin.distanceTo(target); ray.set(origin, target.clone().sub(origin).normalize()); ray.far = Math.max(0, distance - 0.28);
      const obstruction = ray.intersectObjects(meshes, false)[0];
      if (obstruction) { this.lastPhotoBlock = { name: obstruction.object.name, point: obstruction.point.toArray() }; return fail('有人被家具或摆件挡住了，换个开阔的角度试试'); }
    }
    this.lastPhotoIssue = '';
    if (!record.shot) { record.shot = payload.shot; save(); bus.emit('companionChanged'); game.ui.toast('这张合照里有你们两个人了，找诺诺伊一起看看吧'); }
    return true;
  },
};

export function companionPanel(game) {
  const body = h('div', { class: 'cn companion-panel' }); let dialog;
  const openDialogue = (event, lines, done) => { dialog.close(true); conversation(game, event, lines, done); };
  const render = () => body.replaceChildren(h('h2', {}, '和诺诺伊的共同日常'),
    h('p', { class: 'say' }, '一起喝茶、商量一处角落、留下一张合照。已完成的对白和日记都可以再看。'),
    ...COMPANION_EVENTS.map(event => {
      const info = companion.info(event.id), active = info.record?.status === 'active', ready = companion.ready(game,event.id);
      return h('section', { class: 'cn-block' + (info.complete ? ' ok' : ''), 'data-companion-event': event.id },
        h('h4', {}, event.name, h('em', { class: info.locked ? 'no' : '' }, info.complete ? '已成为回忆' : active ? '约定进行中' : info.locked ? '尚未开始' : '可以相约')),
        h('p', {}, info.locked ? info.reason : event.hint),
        !info.locked && !active && !info.complete && !nearNonoy(game) && h('p', {}, '先走到诺诺伊身边，再和她说说这个约定。白天在大纸鹤旁，晚上在她家。'),
        active && event.id === 'corner' && h('p', {}, cornerPair() ? '灯与座椅已经布置好，回去告诉她吧。' : '须在接下约定后摆放，并退出装修确认；收回的摆件不会计入。'),
        active && event.id === 'photo' && info.record.shot && h('p', {}, `第 ${info.record.shot} 张照片已记录，可以分享了。`),
        info.complete ? h('div', {}, h('p', {}, `${gameDate(info.record.doneDay).key} · ${event.memory}`), h('button', {class:'btn alt sm',onclick:()=>openDialogue(event,[...event.intro,...event.end])},'重看对白')) :
        h('div', {class:'row cn-act'}, h('span',{},`首次完成 +${event.coins} 噗灵`),
          h('button',{class:'btn gold sm',disabled:info.locked || (!active && !nearNonoy(game)) || (active && !ready),onclick:()=>{
            if(!active) {if(companion.start(game,event.id))openDialogue(event,event.intro);}
            else if(companion.ready(game,event.id)) {game.town.act('work',0.6);openDialogue(event,event.end,()=>finish(game,event.id));}
          }}, !active ? '和她说说这个约定' : ready ? '一起完成约定' : event.id==='tea' ? '到茶桌旁再开始' : event.id==='corner' ? '布置后回她身边' : '合影后回她身边')));
    }));
  render(); dialog = game.ui.modal(body,{ribbon:'共同日常',cls:'live-modal'}); return dialog;
}

export function installCompanionEvents(game, ui = game.ui) {
  state(); if(game.companionInstalled)return;game.companionInstalled=true;
  ui.companionPanel=()=>companionPanel(game);
  game.town.inter.push({id:'companionTea',x:TEA.x,z:TEA.z,r:1.65,prio:0.15,label:()=>state().events.tea?.status==='active'?'两杯茶 · 和诺诺伊坐一会儿':'茶桌旁的共同回忆',act:()=>companionPanel(game)});
  bus.on('decorEditCommitted',payload=>companion.committed(payload));
  bus.on('photoTaken',payload=>companion.photographed(game,payload));
  bus.on('reset',state);
}
