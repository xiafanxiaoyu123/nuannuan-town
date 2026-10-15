// 来访的原作角色（第二批）：乔万尼、诺诺伊、小马尔克斯，以及「人物档案」。
// 同人作品里的非官方小镇日常：造型对照游戏内画面做成方块版，互动和台词均为原创，不是原作剧情。
// 档案里的身份与经历整理自玩家社区资料：一段简介加一段人物故事。
import { THREE, cbox, box, cyl, group, mat, glow, textPlane, disposeSceneResources } from '../core/kit.js';
import { S, bus, save, flushSave, addCoins, spend, stat } from '../core/state.js';
import { CLOTHES, CLOTH, DECO } from '../data.js';
import { h, rand, pick } from '../core/util.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { Character, NONOY_LOOK, MARQUES_LOOK, GIOVANNI_LOOK } from '../models/character.js';
import { npcIco, clothIcon, coinIco, decorIcon } from '../core/icons.js';
import { svg } from '../ui/ui.js';
import { gameDayKey, gameDayNo } from '../core/gametime.js';
import { festivalDialogue } from './festival-dialogue.js';
import { installCraneRide } from './crane-ride.js';

const ns = { cast: false, receive: false };
const dayKey = gameDayKey; // 每天一次的互动按小镇的日子算
// 每天清一次的小账本
function V() {
  const c = S.live.canon, day = dayKey();
  if (!c.v || c.v.day !== day) { c.v = { day, paper: 0, gear: null, rebate: false }; save(); }
  return c.v;
}
const met = (id) => { if (!S.live.canon.met[id]) { S.live.canon.met[id] = 1; save(); } };

export const VISITORS = {
  giovanni: { id: 'giovanni', name: '乔万尼', job: '售卖愿望翱翔纸的搭配师', x: 8.6, z: 10.4, color: '#5a6a9a' },
  nonoy: { id: 'nonoy', name: '诺诺伊', job: '愿望梦境仓库 · 实习管理员', x: -3.6, z: 15.4, color: '#c9412f' },
  marques: { id: 'marques', name: '小马尔克斯', job: '马尔克斯服装店 · 店员', x: 25.9, z: 2.9, color: '#a9997a' },
  laila: { id: 'laila', name: '莱拉', job: '相机与拍照道具商人', x: 28.6, z: 18.2, color: '#c98f4a' },
};
export const PAPER_PRICE = 20, PAPER_MAX = 3, GEAR_REWARD = 70;
const GEAR_SPOTS = [[-19, 8], [-16, 10], [37, 6.5], [27, 17], [24, -8], [29, -7.5], [-13, 19.4], [22, 19], [13.4, 7.3], [-9.5, 13.6], [39, 3.5], [-27, 12], [-24, 17.5]];

// ————— 人物档案 —————
export const ARCHIVE = [
  { id: 'dada', name: '达达', en: 'Dada', where: '花愿镇 · 搭配师协会', town: true, tags: ['亲切', '事务清楚'],
    intro: '花愿镇搭配师协会的负责人，暖暖初到花愿镇时就是在她这里登记的。说话直接又亲切，总会先问一句有什么能帮上忙。',
    story: ['暖暖在协会完成搭配师登记，由达达说明登记流程并发放美鸭梨。', '她手上常有各区域协会活动的文书要处理，但有人来访时会先放下手里的事接待。'] },
  { id: 'nonoy', name: '诺诺伊', en: 'Nonoy', where: '花愿镇 · 大许愿树广场', town: true, tags: ['认真', '擅长维修', '成长'],
    intro: '花愿镇的少女，愿望梦境仓库的实习管理员，修东西很拿手。做事认真，偶尔会因为太在意别人而责怪自己。',
    story: ['养母伊格莱妮突然昏迷后，诺诺伊心神不宁，修大纸鹤时分了心，撞坏了马尔克斯服装店的屋顶，也因此认识了暖暖。', '她曾因为追问自己的身世和养母起过争执，一度以为母亲的昏迷是自己造成的。',
      '在愿望梦境仓库，她不再只等别人帮忙，和暖暖一起夺回了母亲的愿望瓶。读到愿望后她才明白：母亲希望她独立长大，也愿意继续疼爱慢慢长大的她。', '读到愿望时母亲并没有立刻醒来；后续事件解决之后，才有了和苏醒的伊格莱妮交谈的内容。'] },
  { id: 'marques', name: '小马尔克斯', en: 'Marques Jr.', where: '花愿镇 · 马尔克斯服装店', town: true, tags: ['拘谨', '设计梦想', '重拾勇气'],
    intro: '在花愿镇的百年老店马尔克斯服装店工作，和爷爷老马尔克斯一起看店。待客周到，有点怕爷爷生气。',
    story: ['大纸鹤撞坏店铺屋顶时，他一边担心爷爷发火，一边处理衣服修补的事，也留意到了诺诺伊反常的状态。', '「花焰骑士」的故事和设计来自他小时候的幻想。一次受伤之后，他开始否定这些梦想，觉得追着幻想跑只会让自己和别人陷入危险。',
      '花焰精灵辛蒂拉一直珍惜着他的故事，为他安排了一场围绕花焰骑士的冒险。得知真相后他并没有马上被打动，反而和辛蒂拉起了争执。', '后来暖暖和欧佩拉准备了改良过的「勇气花焰」。亲手碰到不再灼人的花焰时，他才承认自己不是不在乎，而是害怕再受伤，并和朋友们和解。'] },
  { id: 'giovanni', name: '乔万尼', en: 'Giovanni', where: '花愿镇 · 大许愿树广场 / 小石树田村', town: true, tags: ['神秘', '善于引导', '愿望与失望'],
    intro: '售卖「愿望翱翔纸」的搭配师，谈吐从容，很会给人指路。暖暖先后在花愿镇的大许愿树广场和小石树田村遇见过他。',
    story: ['在小石树田村，他向暖暖解释火冠节焚烧愿望的习俗：这里的人不只是等愿望被实现，也借焚烧愿望卸下负担、靠自己往前走。随后把参加火冠节的推荐资格给了暖暖。',
      '随着调查推进，他被揭示为「先知」，与昏迷事件背后的阴谋有关；他对愿望神、心愿精灵和单品灵抱有强烈的不信任。', '司本多回忆，他十五岁时成为愿望收集员，曾是个对奇想科技感兴趣的孩子，后来与另外十名搭配师一同失踪。（十五岁说的是过去，不是现在的年龄。）'] },
  { id: 'laila', name: '莱拉', en: '', where: '花愿镇 · 大许愿树广场', town: true, tags: ['相机', '爱琢磨新道具'],
    intro: '在花愿镇卖拍照道具的商人，随身挂着相机。喜欢把街上拍到的有趣瞬间拿去琢磨新道具，说着说着就容易跑题。',
    story: ['她常在大许愿树广场一带摆摊，暖暖可以在她那里看看拍照用的道具。'] },
  { id: 'medael', name: '梅妲伊尔', en: 'Medael', where: '伊赞之地 · 2.0 起', tags: ['疗愈师', '大祭司', '姐弟'],
    intro: '帕克索尔人，曾是很有天赋的疗愈师，后来成为大祭司。梅戈希尔的姐姐。',
    story: ['她曾认真照料病人，努力寻找缓解族人痛苦的办法。', '长期面对疾病、弟弟的病情和看不到出路的现实，她逐渐陷入绝望，又受到错误信息和他人的引导，走向了极端。', '她有疗愈师和大祭司两套装束，正好对应前后两个阶段。'] },
  { id: 'meghill', name: '梅戈希尔', en: 'Meghill', where: '伊赞之地 · 埋骨地', tags: ['族长', '责任', '魂埙'],
    intro: '帕克索尔人的族长，梅妲伊尔的弟弟。2.0 已经出场，2.5 开放的埋骨地让他的故事进一步展开。',
    story: ['埋骨地的混乱中，他组织族人撤离、照顾病患，并用魂埙帮暖暖和其他人缓解症状。', '面对姐姐，他要在亲情和族长的责任之间做出选择。'] },
  { id: 'angert', name: '安格芒特', en: 'Angert', where: '伊赞之地 · 埋骨地', tags: ['调查搭档', '引渡者'],
    intro: '参与埋骨地异常事件调查的人，会带暖暖了解当地情况。和梅戈希尔从小就认识。',
    story: ['他带暖暖调查引渡者组织，并与梅戈希尔一同处理事件。', '他的对话里有引渡者的职责、帕克索尔人的传统，以及他对梅戈希尔的评价。'] },
  { id: 'verdante', name: '沃尔丹特', en: 'Verdante', where: '伊赞之地 · 2.0 起', tags: ['性感天王', '舞蹈'],
    intro: '伊赞地区的性感天王，与森林狂欢、舞蹈和动物有关。', story: ['暖暖可以向他发起搭配挑战。'] },
  { id: 'buzzy', name: '艾热闹', en: 'Buzzy', where: '万相境 · 2.2 起', tags: ['爱打听', '地方志'],
    intro: '喜欢打听奇闻、收集故事、编写地方志的人，也兼着一部分商店和兑换的活儿。', story: ['属于「地方见闻型」的角色，想听当地的故事可以找他。'] },
  { id: 'echeros', name: '伊刻罗斯', en: 'Echeros', where: '世界观人物', tags: ['轮回之神', '背景人物'],
    intro: '轮回之神，与灵魂引渡、龙族和埋骨地的历史有关。属于背景与剧情中的重要人物，不是能在地图上聊天的普通居民。', story: ['相关历史在埋骨地主线和过场中陆续交代。'] },
  { id: 'xiaweilin', name: '夏维琳', en: '', where: '伊赞之地 · 2.0 起', tags: ['伊赞之地'],
    intro: '伊赞之地的人物，2.0 起登场。', story: [] },
];
export function archivePanel(game, open) {
  const ui = game.ui;
  let cur = open || 'dada';
  const body = h('div', { class: 'arch' });
  const render = () => {
    const c = ARCHIVE.find((x) => x.id === cur);
    const seen = (x) => !x.town || S.live.canon.met[x.id] || (x.id === 'dada' && S.live.canon.dada);
    body.replaceChildren(
      h('div', { class: 'arch-head' }, h('h2', {}, '人物档案'), h('p', {}, '《无限暖暖》里的人物。资料整理自玩家社区，不是官方设定原文。')),
      h('div', { class: 'arch-main' },
        h('div', { class: 'arch-list' }, ARCHIVE.map((x) => h('button', { class: (x.id === cur ? 'on' : '') + (x.town ? ' town' : ''), onclick: () => { audio.sfx('tab'); cur = x.id; render(); } },
          x.town ? h('img', { src: npcIco(x.id), alt: '', class: seen(x) ? '' : 'dim' }) : h('i', {}, svg('star')), h('span', {}, h('b', {}, x.name), h('em', {}, x.town ? (seen(x) ? '来访中' : '还没遇见') : '敬请期待')))),
        ),
        h('div', { class: 'arch-card' },
          h('div', { class: 'arch-top' }, c.town && h('img', { src: npcIco(c.id), alt: '' }), h('div', {}, h('h3', {}, c.name, c.en && h('em', {}, c.en)), h('p', {}, c.where), h('div', { class: 'arch-tags' }, c.tags.map((t) => h('span', {}, t))))),
          h('p', { class: 'arch-intro' }, c.intro),
          c.town ? h('p', { class: 'arch-note' }, `${c.name}会来小镇做客，位置：${c.id === 'dada' ? '东边空地的来访登记桌' : c.id === 'marques' ? '搭配小屋门口' : c.id === 'nonoy' ? '白天在广场西南的大纸鹤旁，晚上回小岛西南角的家' : c.id === 'laila' ? '东南海边的相机摊' : '喷泉广场南侧的纸鹤摊'}。`)
            : h('p', { class: 'arch-note soon' }, '不远的将来可能会来小镇做客，敬请期待。'),
          c.story.length ? h('div', { class: 'arch-story' }, h('h4', {}, '人物故事'), c.story.map((t) => h('p', {}, t))) : null)));
  };
  render();
  return ui.modal(body, { ribbon: '档案', cls: 'live-modal' });
}

// ————— 场景道具 —————
// 折纸鹤：全部用三角面片拼成，相邻面深浅略有差别，折痕才看得出来。头朝 +x
function facet(pts, color) {
  const geo = new THREE.BufferGeometry(), v = [];
  for (const i of pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]) v.push(...pts[i]);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.82, side: THREE.DoubleSide, flatShading: true }));
  m.castShadow = true;
  return m;
}
function craneModel(s = 1, col = '#ffffff') {
  const g = group();
  const c0 = new THREE.Color(col), c1 = c0.clone().multiplyScalar(0.93), c2 = c0.clone().multiplyScalar(0.86);
  const P = (x, y, z) => [x * s, y * s, z * s];
  for (const sz of [-1, 1]) {
    const side = P(0, 0.03, sz * 0.17);
    // 身体：上面一条脊线，下面一条龙骨，两侧各鼓出一个棱
    g.add(facet([P(0.36, 0.12, 0), P(-0.36, 0.12, 0), side], sz > 0 ? c0 : c1));
    g.add(facet([P(0.36, 0.12, 0), P(0, -0.13, 0), side], c1));
    g.add(facet([P(-0.36, 0.12, 0), P(0, -0.13, 0), side], c2));
    // 脖子：从胸前斜着向上
    g.add(facet([P(0.2, 0.12, sz * 0.07), P(0.36, 0.0, 0), P(0.66, 0.66, 0)], sz > 0 ? c0 : c1));
    // 头：顶端向下折的一个小尖
    g.add(facet([P(0.66, 0.66, 0), P(0.58, 0.56, sz * 0.035), P(0.88, 0.5, 0)], sz > 0 ? c1 : c2));
    // 尾：向后上方翘起
    g.add(facet([P(-0.2, 0.12, sz * 0.07), P(-0.36, 0.0, 0), P(-0.74, 0.74, 0)], sz > 0 ? c1 : c0));
  }
  g.add(facet([P(0.2, 0.12, 0.07), P(0.2, 0.12, -0.07), P(0.66, 0.66, 0)], c0));
  g.add(facet([P(-0.2, 0.12, 0.07), P(-0.2, 0.12, -0.07), P(-0.74, 0.74, 0)], c2));
  // 翅膀：前后两片，中间一道折痕；绕翅根上下扇动
  const wings = [];
  for (const sz of [-1, 1]) {
    const w = group(0, 0.1 * s, sz * 0.1 * s);
    const Q = (x, y, z) => [x * s, y * s, sz * z * s];
    w.add(facet([Q(0.2, 0, 0), Q(-0.06, 0, 0), Q(0.02, 0.16, 0.98)], c0));
    w.add(facet([Q(-0.06, 0, 0), Q(-0.24, 0, 0), Q(0.02, 0.16, 0.98)], c1));
    w.add(facet([Q(-0.24, 0, 0), Q(-0.36, 0.05, 0.5), Q(0.02, 0.16, 0.98)], c2));
    g.add(w); wings.push([w, sz]);
  }
  g.userData.flap = (t, amp = 0.5) => { for (const [w, sz] of wings) w.rotation.x = -sz * (0.12 + Math.sin(t) * amp); };
  g.userData.flap(0, 0);
  return g;
}
function paperStall() {
  const g = group();
  g.add(box(1.5, 0.7, 0.6, '#fff6ea', 0, 0, 0, { r: 0.07 }));
  g.add(box(1.62, 0.08, 0.72, '#2b3552', 0, 0.7, 0, { r: 0.03 }));
  for (const sx of [-1, 1]) g.add(box(0.07, 2.05, 0.07, '#d9b46a', sx * 0.72, 0.7, -0.26, { r: 0.025 }));
  g.add(cbox(1.6, 0.07, 0.07, '#d9b46a', 0, 2.73, -0.26, { r: 0.025 }));
  const hung = [];
  ['#ffffff', '#ffe9a8', '#ffc2d6', '#cfe6fb', '#ffffff'].forEach((c, i) => {
    const k = craneModel(0.3, c);
    k.position.set(-0.56 + i * 0.28, 2.42 - (i % 2) * 0.16, -0.26);
    k.rotation.y = 0.5 + i;
    g.add(cbox(0.012, 0.2 + (i % 2) * 0.16, 0.012, '#d9b46a', k.position.x, k.position.y + 0.1, -0.26, ns));
    g.add(k); hung.push(k);
  });
  for (let i = 0; i < 4; i++) g.add(cbox(0.3, 0.02, 0.3, ['#ffffff', '#ffe9a8', '#ffc2d6', '#cfe6fb'][i], -0.4 + i * 0.1, 0.79 + i * 0.02, 0.02, { r: 0.01, ry: i * 0.2 }));
  g.add(cbox(0.2, 0.2, 0.2, glow('#fff3c4', '#ffd76a', 0.5, 2), 0.46, 0.8, 0, { r: 0.06 }));
  const t = textPlane('愿望翱翔纸', { color: '#ffe9a8', height: 0.2, size: 44 });
  t.position.set(0, 0.4, 0.31);
  g.add(t);
  g.userData.dyn = hung;
  g.userData.tick = (time) => hung.forEach((k, i) => { k.rotation.y = 0.5 + i + Math.sin(time * 0.8 + i) * 0.5; k.userData.flap(time * 2 + i, 0.15); });
  return g;
}
function bigCrane() {
  const g = group();
  // 诺诺伊在检修的大纸鹤：纯白，停在一副木支架上
  const c = craneModel(1.9, '#ffffff');
  const REST = 1.12;
  c.position.y = REST;
  g.add(c);
  const WOOD = '#c99d77', WOOD_D = '#a67c58';
  // 两副人字支架 + 上面的托梁
  for (const x of [-0.5, 0.5]) {
    for (const sz of [-1, 1]) g.add(cbox(0.09, 0.96, 0.09, WOOD_D, x, 0.44, sz * 0.2, { r: 0.03, rx: -sz * 0.3 }));
    g.add(cbox(0.1, 0.07, 0.5, WOOD_D, x, 0.36, 0, { r: 0.02 }));
    g.add(cbox(0.16, 0.1, 0.36, WOOD, x, 0.84, 0, { r: 0.03 }));
  }
  g.add(cbox(1.3, 0.07, 0.1, WOOD, 0, 0.82, 0, { r: 0.02 }));
  g.add(cbox(1.5, 0.05, 1.0, '#e9dcc6', 0, 0, 0, { r: 0.02, cast: false }));
  // 工具箱（打开着）、扳手、一卷纸和小油壶
  const box0 = group(1.25, 0, 0.75);
  box0.add(cbox(0.44, 0.22, 0.28, '#3d4f7a', 0, 0, 0, { r: 0.04 }));
  box0.add(cbox(0.44, 0.05, 0.28, '#2c3a5c', 0, 0.3, -0.16, { r: 0.02, rx: -1.1 }));
  box0.add(cbox(0.1, 0.05, 0.03, '#ffd76a', 0, 0.12, 0.145, { r: 0.012 }));
  for (const [x, col] of [[-0.12, '#cfd6e0'], [0, '#ffd76a'], [0.12, '#cfd6e0']]) box0.add(cbox(0.04, 0.16, 0.04, col, x, 0.18, 0, { r: 0.015, rz: x * 2 }));
  box0.rotation.y = -0.4;
  g.add(box0);
  const wr = group(0.7, 0.03, 0.95);
  wr.add(cbox(0.3, 0.035, 0.05, '#cfd6e0', 0, 0, 0, { r: 0.015 }));
  wr.add(cbox(0.1, 0.035, 0.11, '#cfd6e0', 0.18, 0, 0, { r: 0.02 }));
  wr.rotation.y = 0.7;
  g.add(wr);
  g.add(cyl(0.07, 0.07, 0.5, '#ffffff', -1.2, 0.07, 0.7, { seg: 10, rx: Math.PI / 2 }));
  g.add(cyl(0.075, 0.075, 0.1, '#ffd76a', -1.2, 0.075, 0.7, { seg: 10, rx: Math.PI / 2 }));
  g.add(cyl(0.08, 0.1, 0.16, '#8a8f9c', -0.95, 0, 0.95, { seg: 10 }));
  g.add(cbox(0.02, 0.12, 0.02, '#8a8f9c', -0.9, 0.16, 0.95, { rz: -0.6 }));
  g.userData.dyn = [c];
  g.userData.bird = c;
  g.userData.fly = 0;
  g.userData.tick = (time, dt = 0.016) => {
    if (g.userData.riding) return;
    const f = g.userData.fly;
    if (f > 0) {
      g.userData.fly = Math.max(0, f - dt);
      const k = 1 - g.userData.fly / 6, up = Math.sin(Math.min(1, k * 1.2) * Math.PI);
      c.position.set(Math.sin(k * Math.PI * 2) * 2.4 * up, REST + up * 3.4, Math.sin(k * Math.PI * 4) * 1.2 * up);
      c.rotation.y = k * Math.PI * 2; c.rotation.z = Math.sin(k * Math.PI * 2) * 0.15 * up; c.userData.flap(time * 8, 0.55);
    } else { c.position.set(0, REST + Math.sin(time * 1.5) * 0.02, 0); c.rotation.set(0, 0, 0); c.userData.flap(time * 1.2, 0.05); }
  };
  return g;
}
function gearModel() {
  const g = group();
  const m = mat('#d9b46a', { rough: 0.3, metal: 0.6, emissive: '#ffd76a', ei: 0.35 });
  const w = group(0, 0.5, 0);
  w.add(cyl(0.24, 0.24, 0.1, m, 0, -0.05, 0, { seg: 12, rx: Math.PI / 2 }));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; w.add(cbox(0.1, 0.1, 0.1, m, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0, { r: 0.02, rz: a })); }
  w.add(cyl(0.08, 0.08, 0.12, '#fff6dc', 0, -0.06, 0, { seg: 8, rx: Math.PI / 2 }));
  g.add(w);
  g.userData.tick = (time) => { w.rotation.z = time * 1.5; w.position.y = 0.5 + Math.sin(time * 2.4) * 0.08; };
  return g;
}

// ————— 安装 —————
let ready = false;
export const visitors = {
  tasks(game) {
    const v = V(), out = [];
    if (v.gear && !v.gear.done) {
      const n = v.gear.got.length, full = n >= 3, N = VISITORS.nonoy;
      const left = v.gear.spots.find((_, i) => !v.gear.got.includes(i));
      out.push({ key: 'nonoy', group: '来访记录', tag: N.name, color: N.color, text: full ? '零件找齐了，拿回去给诺诺伊' : '帮诺诺伊找回散落在小镇里的 3 个零件', cur: n, need: 3, coins: GEAR_REWARD, ready: full,
        loc: () => (full ? { x: N.x, z: N.z + 1.2, zone: N.zone, where: N.name } : { x: left[0], z: left[1], where: '零件' }), open: () => nonoyPanel(game), openLabel: '详情' });
    }
    return out;
  },
};

export function stand(game, def, look, ry, label) {
  const town = game.town;
  const ch = new Character(look);
  ch.root.position.set(def.x, 0, def.z);
  ch.root.rotation.y = ry;
  town.scene.add(ch.root);
  town.addCircle(def.x, def.z, 0.45, 'live');
  let wave = 0;
  town.ticks.push((time, dt = 0.016) => {
    if (town.zone !== (def.zone || 'town')) return;
    ch.update(dt);
    const dx = town.pos.x - def.x, dz = town.pos.z - def.z, d = Math.hypot(dx, dz);
    let diff = (d < 6 ? Math.atan2(dx, dz) : ry) - ch.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    ch.root.rotation.y += diff * Math.min(1, dt * 5);
    if (d < 3.6 && wave <= 0) { ch.setPose('cheer'); wave = 10; setTimeout(() => ch.setPose('idle'), 800); }
    wave -= dt;
  });
  const it = { id: def.id, x: def.x, z: def.z + 0.9, r: 2.2, prio: 0.2, label, sub: def.job, act: () => { met(def.id); def.open(game); } };
  town.inter.push(it);
  ch.userData = { it };
  return ch;
}
export const near = (game, def) => game.town.zone === (def.zone || 'town') && Math.hypot(game.town.pos.x - def.x, game.town.pos.z - def.z) < 6;
export const head = (def) => h('div', { class: 'reqhead', style: { '--c': def.color } }, h('img', { class: 'ava', src: npcIco(def.id), alt: '' }),
  h('div', {}, h('h2', {}, def.name), h('p', {}, def.job), h('em', { class: 'cn-tag' }, '同人原创 · 非官方小镇日常')));
export const btn = (cls, label, fn) => h('button', { class: 'btn ' + cls, onclick: (e) => { audio.init(); audio.sfx('click'); fn(e); } }, label);
export const price = (n) => h('span', { class: 'price' }, h('img', { src: coinIco(), alt: '' }), n);
export const archBtn = (game, id, m) => btn('alt sm', '人物档案', () => { m().close(true); archivePanel(game, id); });
const holidaySay=id=>{const line=festivalDialogue(id);return h('p',{class:'say festival-dialogue','data-festival-speaker':id,hidden:!line},line?'「'+line+'」':'');};

// —— 乔万尼：愿望翱翔纸 ——
const WISHES = [['顺顺利利', '「那就祝你今天的每一步，都落在实处。」'], ['有所收获', '「愿望写下的那一刻，手已经伸出去了。剩下的，交给你自己。」'], ['遇见好事', '「好事不一定循着愿望来，但出门的人总比等着的人先遇到。」']];
const GIO_HELLO = ['你好，暖暖。要来一张愿望翱翔纸吗？写上心愿，折成纸鹤，让它替你飞一程。', '又见面了。今天的风不错，纸鹤能飞得很远。', '愿望这东西，有人等它实现，也有人写下来只是为了记住自己想去哪儿。两种我都卖。'];
const GIO_NIGHT = '夜里放飞的纸鹤，没人看得见它落在哪。——这样也好，对吧？';
function giovanniPanel(game) {
  const ui = game.ui, town = game.town, G = VISITORS.giovanni;
  const panelSave = S;
  let m, say = S.clock >= 0.75 && S.clock < 0.95 ? GIO_NIGHT : GIO_HELLO[gameDayNo() % GIO_HELLO.length];
  const body = h('div', { class: 'cn' });
  const render = () => {
    const v = V(), left = PAPER_MAX - v.paper;
    body.replaceChildren(head(G), h('p', { class: 'say' }, `「${say}」`),holidaySay(G.id),
      h('div', { class: 'cn-block' }, h('h4', {}, '写一个心愿', h('em', { class: left ? '' : 'no' }, left ? `今天还能写 ${left} 张` : '今天写完了')),
        h('p', {}, '挑一句写在纸上，折成纸鹤放飞。放飞的心愿也算进许愿次数。'),
        h('div', { class: 'cn-acts' }, WISHES.map(([w, line]) => h('button', { class: 'cn-opt has', disabled: !left, onclick: () => {
          if (S !== panelSave) { m.close(); ui.toast('存档已更新，请重新打开愿望摊'); return; }
          if (!near(game, G)) { ui.toast('走到乔万尼的摊子前再买吧'); return; }
          if (!spend(PAPER_PRICE)) return;
          v.paper++; save(); stat('wishes'); stat('papers');
          audio.sfx('equip');
          // 纸鹤从摊子上飞起来，绕一小圈飞远
          const k = craneModel(0.45, pick(['#ffffff', '#ffe9a8', '#ffc2d6', '#cfe6fb']));
          town.scene.add(k);
          let t = 0;
          const fly = (time, dt = 0.016) => { t += dt; const u = t / 3.2; k.position.set(G.x + Math.sin(u * 5) * (1 + u * 3), 1.6 + u * 7, G.z + 0.6 + Math.cos(u * 5) * (1 + u * 3) - u * 4); k.rotation.y = u * 5 + 1.6; k.userData.flap(t * 14, 0.6); if (u >= 1) { town.scene.remove(k); disposeSceneResources(k); town.ticks = town.ticks.filter((f) => f !== fly); } };
          town.ticks.push(fly);
          fx.sparkle(town.scene, new THREE.Vector3(G.x, 1.8, G.z + 0.6), 10, ['#ffe9a8', '#ffffff', '#cfe6fb']);
          say = line.slice(1, -1);
          // 偶尔，风会带回一点回礼；入账与扣款同步完成，防止中途离开丢奖或切档串档
          const source = S;
          if (Math.random() < 0.25) { const n = pick([30, 40, 60]); addCoins(n, 'fun'); setTimeout(() => { if (S !== source) return; ui.toast(`纸鹤飞回来了一趟，带着 ${n} 噗灵`, { icon: coinIco(), kind: 'live-reward' }); audio.sfx('success'); }, 2600); }
          flushSave();
          render();
        } }, h('b', {}, `愿今天${w}`), price(PAPER_PRICE))))),
      h('div', { class: 'row cn-act' }, archBtn(game, 'giovanni', () => m), btn('alt sm', '下次再来', () => m.close())));
  };
  render();
  m = ui.modal(body, { ribbon: '来访', cls: 'live-modal' });
  return m;
}

// —— 和诺诺伊的亲密度：按现实日期，每天第一次聊天 +1；到了天数就送一件她家里的东西 ——
export const LOVE_MAX = 15;
export const LOVE_GIFTS = [[2, 'n_lamp'], [4, 'n_crane'], [6, 'n_mobile'], [8, 'n_momo'], [10, 'n_shelf'], [12, 'n_bean'], [14, 'n_screen'], [15, 'n_bench']];
const realDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const CHATS = [
  '今天把大纸鹤的翅膀轴重新上了油，扇起来一点声音都没有。你下次来听听看。',
  '妈妈说我修东西的时候眉头皱得像打了结的线。……有那么明显吗？',
  '大许愿树上的愿望瓶，我每天路过都会数一遍。少了会担心，多了又会想是谁挂的。',
  '我以前总怕自己做不好。现在觉得，做不好的地方，修一修就是了，东西和人都一样。',
  '这只纸鹤玩偶是我自己缝的，针脚有点歪。你可别笑。',
  '仓库里的梦境瓶要按颜色分架子放，我花了三天才记住顺序。',
  '暖暖，你走过那么多地方，会不会想家？……我只是随便问问。',
  '昨晚修到很晚，抬头的时候窗外全是星星。那种时候会觉得，慢一点也没关系。',
  '妈妈煮了汤，让我给你留一碗。她说帮过我的人，都要好好谢谢。',
  '我在想，等大纸鹤完全修好了，第一趟就载你去看海。',
];
export const nonoyLove = {
  info() {
    const n = S.live.nonoy, next = LOVE_GIFTS.find(([need, id]) => !n.got.includes(id));
    return { love: n.love, max: LOVE_MAX, today: n.last === realDay(), next: next ? { need: next[0], id: next[1], name: DECO[next[1]].name } : null, got: n.got.slice() };
  },
  chat() {
    const n = S.live.nonoy, day = realDay();
    if (n.last === day) return null;
    n.last = day;
    n.love = Math.min(LOVE_MAX, n.love + 1);
    const gifts = [];
    for (const [need, id] of LOVE_GIFTS) if (n.love >= need && !n.got.includes(id)) { n.got.push(id); S.decor[id] = (S.decor[id] || 0) + 1; gifts.push(id); }
    if (gifts.length) bus.emit('decorChanged');
    stat('nonoy_chats');
    save();
    return { love: n.love, gifts, line: CHATS[(n.love - 1) % CHATS.length] };
  },
};

// —— 诺诺伊：找零件，修大纸鹤 ——
let craneObj = null, gearObjs = [];
function syncGears(game) {
  const town = game.town, v = V();
  for (const o of gearObjs) { town.scene.remove(o); town.ticks = town.ticks.filter((f) => f !== o.userData.tick); }
  gearObjs = [];
  town.inter = town.inter.filter((i) => !String(i.id).startsWith('gear'));
  if (!v.gear || v.gear.done) return;
  v.gear.spots.forEach(([x, z], i) => {
    if (v.gear.got.includes(i)) return;
    const o = gearModel();
    o.position.set(x, 0, z);
    town.scene.add(o); town.ticks.push(o.userData.tick); gearObjs.push(o);
    town.inter.push({ id: 'gear' + i, x, z, r: 1.6, prio: 0.3, label: '闪闪发亮的零件 · 捡起来', act: () => {
      const g = V().gear;
      if (!g || g.got.includes(i)) return;
      g.got.push(i); save();
      town.act('work', 0.5); audio.sfx('harvest');
      fx.sparkle(town.scene, new THREE.Vector3(x, 0.8, z), 8, ['#ffd76a', '#ffffff']);
      game.ui.toast(g.got.length >= 3 ? '零件找齐了，拿回去给诺诺伊吧' : `捡到一个零件（${g.got.length}/3）`);
      bus.emit('canon'); syncGears(game);
    } });
  });
}
function nonoyPanel(game) {
  const ui = game.ui, N = VISITORS.nonoy;
  let m, say = null;
  const body = h('div', { class: 'cn' });
  const render = () => {
    const v = V(), g = v.gear, n = g ? g.got.length : 0;
    const line = say || (N.home ? (g && !g.done && n >= 3 ? '零件都找到了？太好了，明天一早我就装回去。先给我吧。' : '欢迎来我家，暖暖。地方不大，随便坐。屏风后面是我的小工作间，别嫌乱。') : !g ? '暖暖！你来得正好。我在给大纸鹤做检修，刚才手一滑，有三个零件滚到小镇里去了……你能帮我找找吗？'
      : g.done ? '今天的检修做完啦，它飞得很稳。谢谢你，暖暖。大许愿树上的愿望瓶，今天看起来也特别亮呢。'
      : n >= 3 ? '都找到了？太好了！给我吧，我这就装回去。' : `还差 ${3 - n} 个。它们会发光，应该不难认。不着急，慢慢找。`);
    const kids = [head(N), h('p', { class: 'say' }, `「${line}」`),holidaySay(N.id)];
    if (!N.home) kids.push(h('div', { class: 'row cn-act' }, btn('alt sm', '乘坐大纸鹤 · 环镇一周', () => { m.close(true); game.town.craneRide?.panel(); })));
    if (ui.companionPanel) kids.push(h('div', { class: 'row cn-act' }, btn('alt sm', '共同日常与回忆', () => { m.close(true); ui.companionPanel(); })));
    const lv = nonoyLove.info();
    kids.push(h('div', { class: 'cn-block love' + (lv.today ? ' ok' : '') },
      h('h4', {}, '亲密度', h('em', {}, `${lv.love}/${lv.max}`)),
      h('div', { class: 'love-bar' }, Array.from({ length: lv.max }, (_, i) => h('i', { class: (i < lv.love ? 'on' : '') + (LOVE_GIFTS.some(([need]) => need === i + 1) ? ' gift' : '') }))),
      h('div', { class: 'love-row' },
        lv.next ? h('span', { class: 'love-next' }, h('img', { src: decorIcon(lv.next.id), alt: '' }), h('span', {}, `下一件礼物「${lv.next.name}」`, h('br'), lv.next.need > lv.love ? `再聊 ${lv.next.need - lv.love} 天` : '今天就能拿到')) : h('span', { class: 'love-next' }, '她家里的宝贝都送给你了'),
        lv.today ? h('span', { class: 'rw' }, '今天聊过了，明天再来') : btn('sm', '聊聊天', () => {
          if (!near(game, N)) { ui.toast('走到诺诺伊身边再聊吧'); return; }
          const r = nonoyLove.chat();
          if (!r) return;
          audio.sfx('quest'); say = r.line;
          fx.hearts(game.town.scene, new THREE.Vector3(N.x, 2.2, N.z), 4);
          for (const id of r.gifts) ui.toast(`诺诺伊送了你「${DECO[id].name}」，已放进装修仓库`, { icon: decorIcon(id), kind: 'live-reward', life: 4200 });
          render();
        }))));
    if (!g) kids.push(h('div', { class: 'cn-steps' }, h('div', {}, h('i', {}, '1'), h('span', {}, '在小镇里找回 3 个发光的零件')), h('div', {}, h('i', {}, '2'), h('span', {}, '拿回来交给诺诺伊，看大纸鹤试飞'), price(GEAR_REWARD))),
      h('div', { class: 'row cn-act' }, archBtn(game, 'nonoy', () => m), btn('', '好，我去找', () => {
        if (!near(game, N)) { ui.toast('走到诺诺伊身边再说吧'); return; }
        const pool = GEAR_SPOTS.filter(([x, z]) => !game.town.blocked(x, z, 0.3)).sort(() => Math.random() - 0.5).slice(0, 3);
        v.gear = { spots: pool, got: [], done: false }; save();
        audio.sfx('quest'); ui.toast('接下了「大纸鹤的零件」'); bus.emit('canon'); syncGears(game); render();
      })));
    else if (!g.done) kids.push(h('div', { class: 'cn-block' + (n >= 3 ? ' ok' : '') }, h('h4', {}, '零件', h('em', { class: n >= 3 ? '' : 'no' }, `${n}/3`)), h('p', {}, '任务清单里点「追踪」，画面上会指向下一个零件。')),
      h('div', { class: 'row cn-act' }, archBtn(game, 'nonoy', () => m), n >= 3 ? btn('gold', '把零件交给她', (e) => {
        if (!near(game, N)) { ui.toast('走到诺诺伊身边再交给她吧'); return; }
        if (g.done) return;
        g.done = true; addCoins(GEAR_REWARD, 'live'); stat('crane_fixed'); save();
        const b = e.currentTarget.getBoundingClientRect();
        audio.sfx('fanfare'); ui.flyCoins(b.left + b.width / 2, b.top, 8);
        if (craneObj) craneObj.userData.fly = 6;
        say = '装好了！你看——它飞起来了！……嗯，这次我没有分心。';
        bus.emit('canon'); syncGears(game); render();
        setTimeout(() => m.close(true), 2200);
      }) : h('span', { class: 'rw' }, '找齐后回来 ', price(GEAR_REWARD))));
    else kids.push(h('div', { class: 'row cn-act' }, archBtn(game, 'nonoy', () => m), btn('alt sm', '再看一次试飞', () => { if (craneObj) craneObj.userData.fly = 6; m.close(true); })));
    body.replaceChildren(...kids);
  };
  render();
  m = ui.modal(body, { ribbon: '来访', cls: 'live-modal' });
  return m;
}

// —— 小马尔克斯：今日推荐 ——
function recommend() {
  const pool = CLOTHES.filter((c) => c.price > 0 && !c.only && !S.owned.includes(c.id));
  if (!pool.length) return null;
  return pool[(gameDayNo() * 13 + 5) % pool.length];
}
let recToday = null;
function marquesPanel(game) {
  const ui = game.ui, M = VISITORS.marques;
  let m;
  const v = V(), rec = recommend();
  if (rec && !v.rebate) recToday = { day: v.day, id: rec.id };
  const back = rec ? Math.round(rec.price * 0.1) : 0;
  const line = v.rebate ? '谢谢惠顾！这件很衬你。……啊，我不是在说客套话。' : rec ? '欢迎光临，暖暖！我来搭配小屋帮几天忙。今天想推荐这一件，版型和做工我都看过了，可以放心。' : '店里的款式你都有了……真厉害。我、我得赶紧再画点新的。';
  const body = h('div', { class: 'cn' }, head(M), h('p', { class: 'say' }, `「${line}」`),holidaySay(M.id),
    rec && h('div', { class: 'cn-block' + (v.rebate ? ' ok' : '') }, h('h4', {}, '今日推荐', v.rebate ? h('em', {}, '已返还') : h('em', { class: 'no' }, '买下返一成')),
      h('div', { class: 'cn-rec' }, h('img', { src: clothIcon(rec.id), alt: '' }), h('div', {}, h('b', {}, rec.name), h('p', {}, '今天在搭配小屋买下这一件，小马尔克斯返还 ', price(back))), price(rec.price))),
    h('div', { class: 'row cn-act' }, archBtn(game, 'marques', () => m), rec && !v.rebate ? btn('', '去搭配小屋看看', () => { m.close(true); game.openWardrobe('shop'); }) : btn('alt sm', '下次再来', () => m.close())));
  m = ui.modal(body, { ribbon: '来访', cls: 'live-modal' });
  return m;
}

export function installVisitors(game) {
  const town = game.town, ui = game.ui;
  const G = VISITORS.giovanni, N = VISITORS.nonoy, M = VISITORS.marques;
  G.open = giovanniPanel; N.open = nonoyPanel; M.open = marquesPanel;
  // 乔万尼的纸鹤摊
  town.place(paperStall(), G.x, G.z + 0.9, 0);
  town.addRect(G.x - 0.9, G.x + 0.9, G.z + 0.5, G.z + 1.3, 'live');
  stand(game, G, GIOVANNI_LOOK, 0, '和乔万尼说话 · 愿望翱翔纸');
  town.inter.find((i) => i.id === 'giovanni').z = G.z + 2.2;
  // 诺诺伊和大纸鹤
  craneObj = town.place(bigCrane(), N.x - 2.4, N.z - 0.4, 0.5);
  installCraneRide(game, craneObj, craneObj.userData.bird);
  town.addCircle(N.x - 2.4, N.z - 0.4, 1.1, 'live');
  const nmk = town.marker(N.x, 3.2, N.z, '#ffc94d');
  const nch = stand(game, N, NONOY_LOOK, 0.3, () => { const g = V().gear; return !g ? '诺诺伊好像在找什么' : g.done ? '和诺诺伊说话' : g.got.length >= 3 ? '把零件交给诺诺伊' : '和诺诺伊说话'; });
  town.inter.find((i) => i.id === 'nonoy').marker = nmk;
  visitors.nonoy = { ch: nch, it: nch.userData.it, mk: nmk, def: N, day: { x: N.x, z: N.z } };
  town.ticks.push(() => { const g = S.live.canon.v && S.live.canon.v.gear; nmk.visible = !g || (!g.done && g.got.length >= 3); });
  // 小马尔克斯：搭配小屋门口
  stand(game, M, MARQUES_LOOK, -0.4, '和小马尔克斯说话 · 今日推荐');
  syncGears(game);
  if (ready) return;
  ready = true;
  // 买下今日推荐：返一成
  bus.on('collection', () => {
    const v = V();
    if (v.rebate || !recToday || recToday.day !== v.day || !S.owned.includes(recToday.id)) return;
    v.rebate = true;
    const n = Math.round(CLOTH[recToday.id].price * 0.1);
    addCoins(n, 'live'); save();
    ui.toast(`小马尔克斯：谢谢惠顾！返还 ${n} 噗灵`, { icon: coinIco(), kind: 'live-reward' });
  });
  bus.on('reset', () => { recToday = null; syncGears(game); });
  bus.on('newDay', () => { V(); syncGears(game); bus.emit('canon'); });
}
