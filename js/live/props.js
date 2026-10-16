// 新系统用到的 3D 美术：订单板、宝箱、工地（三期）、面包房、节日装饰、面包
import { THREE, cbox, box, cyl, sph, torus, group, mat, glow, textPlane } from '../core/kit.js';
import { icon } from '../core/icon-renderer.js';
import { BREADS } from './data.js';

const WOOD = '#d2a67e', WOOD_D = '#b3855f', STONE = '#f1e9df', STONE_D = '#ddd2c5', CREAM = '#fff6ea';
const ns = { cast: false, receive: false };
const text = (t, size, color, height) => textPlane(t, { size, color, height });

// 广场边的每日订单板
export function noticeBoard() {
  const g = group();
  for (const sx of [-1, 1]) g.add(box(0.18, 2.5, 0.18, WOOD_D, sx * 1.15, 0, 0, { r: 0.05 }));
  g.add(cbox(2.7, 1.7, 0.16, '#c98e6b', 0, 1.55, 0, { r: 0.08 }));
  g.add(cbox(2.46, 1.46, 0.1, '#f3dcc0', 0, 1.55, 0.06, { r: 0.05 }));
  g.add(cbox(3.0, 0.2, 0.5, '#ff9fbd', 0, 2.55, 0, { r: 0.08, rx: 0.0 }));
  g.add(cbox(3.1, 0.12, 0.6, '#ffffff', 0, 2.44, 0, { r: 0.05 }));
  // 三张订单纸 + 图钉
  [['#ffffff', -0.75, 1.7, -0.06], ['#fff3a8', 0.02, 1.52, 0.05], ['#d9f4e6', 0.78, 1.68, -0.04]].forEach(([c, x, y, rz], i) => {
    g.add(cbox(0.62, 0.8, 0.03, c, x, y, 0.13, { r: 0.03, rz }));
    for (let k = 0; k < 3; k++) g.add(cbox(0.36 - k * 0.06, 0.05, 0.02, '#c9b6aa', x, y + 0.16 - k * 0.15, 0.15, { rz, ...ns }));
    g.add(sph(0.06, ['#f0679a', '#5fa8ee', '#e9a520'][i], x, y + 0.34, 0.16));
  });
  const t = text('每日订单', 72, '#ffffff', 0.26);
  t.position.set(0, 2.56, 0.27);
  g.add(t);
  return g;
}

// 宝箱（open: 0 关 / 1 开）
export function chest(open = 0) {
  const g = group();
  g.add(box(1.0, 0.56, 0.7, '#c98a3c', 0, 0, 0, { r: 0.08 }));
  for (const x of [-0.42, 0.42]) g.add(box(0.1, 0.6, 0.74, '#ffd76a', x, -0.01, 0, { r: 0.03 }));
  const lid = group(0, 0.56, -0.35);
  lid.add(cbox(1.04, 0.34, 0.74, '#d99a48', 0, 0.14, 0.35, { r: 0.15 }));
  for (const x of [-0.42, 0.42]) lid.add(cbox(0.1, 0.38, 0.78, '#ffd76a', x, 0.14, 0.35, { r: 0.04 }));
  lid.rotation.x = -open * 1.15;
  g.add(lid);
  g.add(cbox(0.2, 0.24, 0.08, '#fff3a8', 0, 0.5, 0.37, { r: 0.05 }));
  if (open) for (const [x, y, z] of [[-0.2, 0.62, 0], [0.15, 0.66, 0.1], [0.02, 0.74, -0.08]]) g.add(cyl(0.14, 0.14, 0.05, mat('#ffd24f', { emissive: '#ffd24f', ei: 0.4 }), x, y, z, { seg: 14, rx: 0.5 }));
  return g;
}

// 面包（mini-game 与图标共用）；done: 0 生面团 / 1 刚好 / 2 烤焦
export function bread(id, done = 1) {
  const b = BREADS.find((x) => x.id === id) || BREADS[0];
  const col = done === 0 ? '#f7ecd9' : done === 2 ? '#6b4a3a' : b.color;
  const dark = done === 2 ? '#4a332a' : '#c98e4f';
  const g = group();
  if (id === 'bun') { g.add(cbox(0.5, 0.34, 0.5, col, 0, 0.17, 0, { r: 0.16 })); g.add(cbox(0.2, 0.04, 0.2, done === 1 ? '#fff3e2' : col, 0, 0.35, 0, { r: 0.015 })); }
  else if (id === 'croissant') { for (const [x, s, rz] of [[-0.24, 0.2, 0.6], [-0.1, 0.3, 0.25], [0.06, 0.34, 0], [0.22, 0.26, -0.35]]) g.add(cbox(0.2, s, 0.3, col, x, s / 2, 0, { r: 0.09, rz })); }
  else if (id === 'toast') { g.add(cbox(0.56, 0.5, 0.34, col, 0, 0.25, 0, { r: 0.08 })); g.add(cbox(0.62, 0.16, 0.38, dark, 0, 0.5, 0, { r: 0.07 })); }
  else if (id === 'baguette') { g.add(cbox(0.92, 0.22, 0.26, col, 0, 0.11, 0, { r: 0.1 })); for (const x of [-0.26, 0, 0.26]) g.add(cbox(0.05, 0.03, 0.22, dark, x, 0.22, 0, { ry: 0.5, ...ns })); }
  else { g.add(cyl(0.26, 0.26, 0.5, col, 0, 0.26, 0, { seg: 16, rz: Math.PI / 2 })); g.add(cyl(0.2, 0.2, 0.02, done === 1 ? '#ffffff' : col, 0.26, 0.26, 0, { seg: 16, rz: Math.PI / 2, ...ns })); g.add(cyl(0.09, 0.09, 0.03, done === 1 ? '#f2546b' : dark, 0.27, 0.26, 0, { seg: 12, rz: Math.PI / 2, ...ns })); }
  return g;
}

// 麦香面包房（建成后的样子）
export function shopBakery() {
  const g = group();
  g.add(box(7, 0.3, 5.4, STONE_D, 0, 0, 0, { r: 0.1 }));
  g.add(box(6.4, 3.3, 4.9, '#fff1dc', 0, 0.25, 0, { r: 0.16 }));
  g.add(box(6.42, 0.8, 4.92, '#f2d3ae', 0, 0.25, 0, { r: 0.12 }));
  // 大屋顶 + 麦穗色屋脊
  g.add(cbox(7.0, 0.36, 5.5, '#f6a56b', 0, 3.72, 0, { r: 0.14 }));
  g.add(cbox(5.6, 0.9, 4.2, '#f6a56b', 0, 4.3, 0, { r: 0.4 }));
  g.add(cbox(3.6, 0.6, 2.8, '#ffc48f', 0, 4.95, 0, { r: 0.28 }));
  g.children.slice(-3).forEach((roof) => { roof.userData.seasonalRoof = true; });
  // 砖烟囱 + 一朵烟
  g.add(box(0.9, 2.2, 0.9, '#e0a184', 2.1, 3.9, -1.2, { r: 0.1 }));
  g.add(box(1.06, 0.22, 1.06, '#c98568', 2.1, 6.1, -1.2, { r: 0.07 }));
  const puffs = [0, 1, 2].map(() => { const p = sph(0.26, mat('#ffffff', { opacity: 0.85 }), 2.1, 6.5, -1.2, ns); g.add(p); return p; });
  g.userData.tick = (time) => puffs.forEach((p, i) => { const u = (time * 0.3 + i / 3) % 1; p.position.set(2.1 + u * 0.4 + Math.sin(time + i * 2) * 0.12, 6.4 + u * 1.8, -1.2); p.scale.setScalar(0.6 + u); p.material.opacity = 0.85 * (1 - u); });
  // 门、橱窗、条纹遮阳棚
  g.add(box(1.34, 2.0, 0.12, '#ffffff', -1.9, 0.28, 2.42, { r: 0.06 }));
  g.add(box(1.1, 1.86, 0.16, '#d98a52', -1.9, 0.28, 2.44, { r: 0.07 }));
  g.add(cbox(0.6, 0.5, 0.18, glow('#fff3c4', '#ffc864', 0.2, 2), -1.9, 1.62, 2.45, { r: 0.05, ...ns }));
  g.add(cbox(3.4, 1.7, 0.12, '#ffffff', 1.1, 1.75, 2.42, { r: 0.07 }));
  g.add(cbox(3.14, 1.44, 0.14, glow('#fff3c4', '#ffc864', 0.25, 2.2), 1.1, 1.75, 2.44, { r: 0.05, ...ns }));
  g.add(box(3.5, 0.14, 0.6, WOOD, 1.1, 0.86, 2.7, { r: 0.05 }));
  BREADS.forEach((b, i) => { const m = bread(b.id); m.position.set(-0.3 + i * 0.7, 1.0, 2.72); m.scale.setScalar(0.8); m.rotation.y = 0.3; g.add(m); });
  for (let i = 0; i < 9; i++) { const x = -2.9 + i * 0.72; const c = i % 2 ? '#ffffff' : '#f6a56b'; g.add(cbox(0.73, 0.1, 1.2, c, x, 3.05, 3.0, { r: 0.03, rx: 0.42 })); g.add(cbox(0.7, 0.26, 0.08, c, x, 2.7, 3.52, { r: 0.03 })); }
  // 招牌：一个大可颂
  g.add(cbox(3.4, 0.86, 0.18, '#d98a52', 0, 4.25, 2.2, { r: 0.1 }));
  g.add(cbox(3.54, 1.0, 0.1, '#ffffff', 0, 4.25, 2.16, { r: 0.12 }));
  const t = text('麦香面包房', 80, '#ffffff', 0.46);
  t.position.set(0, 4.25, 2.31);
  g.add(t);
  const big = bread('croissant'); big.scale.setScalar(2.2); big.position.set(0, 5.3, 1.5); big.rotation.y = 0.2; g.add(big);
  g.add(box(1.7, 0.16, 0.8, STONE, -1.9, 0.1, 2.95, { r: 0.06 }));
  return g;
}

// 工地：phase 0 围栏和告示 / 1 地基 / 2 墙和屋架。建成后换成 shopBakery()
export function constructionSite(phase = 0) {
  const g = group();
  const W = 7.4, D = 5.8;
  // 黄白相间的围栏
  for (let i = 0; i <= 10; i++) for (const z of [-D / 2, D / 2]) { if (z > 0 && i >= 4 && i <= 6) continue; g.add(box(0.14, 0.9, 0.14, i % 2 ? '#ffffff' : '#ffd24f', -W / 2 + (i * W) / 10, 0, z, { r: 0.04 })); }
  for (let i = 0; i <= 8; i++) for (const x of [-W / 2, W / 2]) g.add(box(0.14, 0.9, 0.14, i % 2 ? '#ffffff' : '#ffd24f', x, 0, -D / 2 + (i * D) / 8, { r: 0.04 }));
  for (const z of [-D / 2, D / 2]) for (const [x0, x1] of z > 0 ? [[-W / 2, -0.75], [0.75, W / 2]] : [[-W / 2, W / 2]]) g.add(cbox(x1 - x0, 0.1, 0.08, '#ffd24f', (x0 + x1) / 2, 0.62, z, { r: 0.03 }));
  for (const x of [-W / 2, W / 2]) g.add(cbox(0.08, 0.1, D, '#ffd24f', x, 0.62, 0, { r: 0.03 }));
  // 沙堆、砖垛、木板
  g.add(cbox(1.4, 0.7, 1.2, '#f2d9a8', -2.6, 0.3, 1.6, { r: 0.34 }));
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) g.add(box(0.5, 0.2, 0.26, k ? '#e0a184' : '#d99273', 2.3 + (i % 2) * 0.1 + k * 0.52, i * 0.2, 1.9, { r: 0.03 }));
  for (let i = 0; i < 3; i++) g.add(cbox(2.2, 0.08, 0.3, WOOD, 2.4, 0.06 + i * 0.09, -2.0 + i * 0.05, { r: 0.02, ry: 0.1 * i }));
  if (phase >= 1) {
    g.add(box(6.2, 0.36, 4.6, STONE_D, 0, 0, -0.2, { r: 0.08 }));
    g.add(box(5.8, 0.12, 4.2, '#efe4d6', 0, 0.36, -0.2, { r: 0.04 }));
  }
  if (phase >= 2) {
    for (const [x, z] of [[-2.8, -2.2], [2.8, -2.2], [-2.8, 1.8], [2.8, 1.8], [0, -2.2], [0, 1.8]]) g.add(box(0.26, 3.1, 0.26, WOOD, x, 0.46, z, { r: 0.05 }));
    g.add(box(5.9, 1.5, 0.2, '#fff1dc', 0, 0.46, -2.2, { r: 0.06 }));
    for (const sx of [-1, 1]) g.add(box(0.2, 1.1, 4.0, '#fff1dc', sx * 2.8, 0.46, -0.2, { r: 0.06 }));
    for (const z of [-2.2, 1.8]) g.add(cbox(6.0, 0.22, 0.26, WOOD_D, 0, 3.6, z, { r: 0.05 }));
    for (const x of [-2.8, 0, 2.8]) g.add(cbox(0.26, 0.22, 4.3, WOOD_D, x, 3.6, -0.2, { r: 0.05 }));
    for (const x of [-2.1, -0.7, 0.7, 2.1]) g.add(cbox(0.14, 0.14, 4.6, WOOD, x, 3.9, -0.2, { r: 0.04, rz: x * 0.12 }));
  } else {
    // 还没立墙时，中间立一块效果图
    for (const sx of [-1, 1]) g.add(box(0.12, 1.7, 0.12, WOOD_D, sx * 0.9, phase ? 0.46 : 0, -0.6, { r: 0.04 }));
    g.add(cbox(2.3, 1.2, 0.1, '#fffaf2', 0, (phase ? 0.46 : 0) + 1.5, -0.6, { r: 0.08 }));
    const t = text('面包房', 72, '#d98a52', 0.4), t2 = text('建设中', 56, '#9a8290', 0.24);
    t.position.set(0, (phase ? 0.46 : 0) + 1.68, -0.53); t2.position.set(0, (phase ? 0.46 : 0) + 1.24, -0.53);
    g.add(t, t2);
  }
  return g;
}

// 节日装饰：一座拱门 + 一串灯笼。kind: sakura / summer / harvest / snow
const FEST = { sakura: ['#ff9fbd', '#ffe3ec', '#ffffff'], summer: ['#5fa8ee', '#ff6f6f', '#fff3a8'], harvest: ['#e9a520', '#ff9a4a', '#7cc77a'], snow: ['#9fd6f2', '#ffffff', '#d9c8ff'] };
export function festivalArch(kind = 'summer', label = '夏日祭') {
  const [a, b, c] = FEST[kind] || FEST.summer;
  const g = group();
  for (const sx of [-1, 1]) { g.add(box(0.36, 3.6, 0.36, '#ffffff', sx * 2.0, 0, 0, { r: 0.1 })); g.add(box(0.5, 0.3, 0.5, a, sx * 2.0, 0, 0, { r: 0.08 })); g.add(sph(0.3, mat(c, { emissive: c, ei: 0.35 }), sx * 2.0, 3.85, 0)); }
  g.add(cbox(4.9, 0.7, 0.3, a, 0, 3.4, 0, { r: 0.16 }));
  g.add(cbox(5.1, 0.16, 0.42, '#ffffff', 0, 3.82, 0, { r: 0.06 }));
  const t = text(label, 80, '#ffffff', 0.4);
  t.position.set(0, 3.4, 0.17);
  g.add(t);
  for (let i = 0; i < 7; i++) { const x = -1.5 + i * 0.5; g.add(cbox(0.24, 0.3, 0.06, [a, b, c][i % 3], x, 2.85 - Math.sin((i / 6) * Math.PI) * 0.14, 0.02, { r: 0.05, rz: Math.PI / 4 })); }
  return g;
}
export function lanternString(x0, z0, x1, z1, kind = 'summer', n = 6, y = 3.7) {
  const [a, b, c] = FEST[kind] || FEST.summer;
  const g = group();
  const lamps = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), sag = Math.sin(t * Math.PI) * 0.6;
    const col = [a, b, c][i % 3];
    const l = group(x0 + (x1 - x0) * t, y - sag, z0 + (z1 - z0) * t);
    l.add(cbox(0.34, 0.42, 0.34, glow(col, col, 0.25, 2.4), 0, -0.3, 0, { r: 0.14, ...ns }), cbox(0.2, 0.07, 0.2, '#7a5d6e', 0, -0.06, 0, { r: 0.02 }), cbox(0.2, 0.07, 0.2, '#7a5d6e', 0, -0.54, 0, { r: 0.02 }), cbox(0.05, 0.2, 0.05, '#ffd24f', 0, -0.68, 0));
    g.add(l);
    lamps.push(l);
  }
  g.userData.tick = (time) => lamps.forEach((l, i) => { l.rotation.z = Math.sin(time * 1.6 + i) * 0.12; });
  return g;
}

// 节日模型拥有不同轮廓，而不仅是共用灯笼换色。动态零件只改变变换，不改共用材质。
function flowerCharm(scale = 1) {
  const g = group();g.userData.festivalFeature = 'sakura-blossom';
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const p=sph(.22,'#ffc2d6',Math.sin(a)*.28,Math.cos(a)*.28,0,ns);p.scale.z=.35;g.add(p);}
  g.add(sph(.13,'#ffe8a4',0,0,.05,ns));g.scale.setScalar(scale);return g;
}
function windBell() {
  const g=group();g.userData.festivalFeature='wind-chime';
  g.add(box(.018,.22,.018,'#c4a38c',0,-.22,0,ns),cyl(.18,.27,.28,mat('#d8f7fa',{opacity:.72}),0,-.48,0,{seg:14,...ns}),sph(.055,'#ed8da9',0,-.43,0,ns),box(.018,.26,.018,'#c4a38c',0,-.73,0,ns),cbox(.19,.37,.025,'#ffe0ec',0,-.88,0,{r:.02,...ns}));return g;
}
function fan(color='#5fa8ee') {
  const g=group();g.userData.festivalFeature='summer-fan';
  for(let i=0;i<7;i++){const a=-1.1+i*2.2/6;g.add(cbox(.18,.67,.035,color,Math.sin(a)*.25,Math.cos(a)*.25,0,{r:.035,rz:-a,...ns}),cbox(.015,.57,.042,'#fff5cf',Math.sin(a)*.19,Math.cos(a)*.19,.018,{rz:-a,...ns}));}
  g.add(box(.055,.32,.045,'#bb8966',0,-.28,0,ns));return g;
}
function pumpkin(scale=1,color='#f6a13f') {
  const g=group();g.userData.festivalFeature='pumpkin';
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const s=sph(.29,color,Math.cos(a)*.2,.27,Math.sin(a)*.2);s.scale.y=.9;g.add(s);}
  g.add(box(.105,.22,.105,'#7c8d4e',0,.44,0,{r:.025,rz:-.18}));g.scale.setScalar(scale);return g;
}
function wheatBundle(scale=1) {
  const g=group();g.userData.festivalFeature='wheat-sheaf';
  for(let i=-2;i<=2;i++){const stem=group(i*.08,0,0);stem.rotation.z=-i*.13;stem.add(box(.026,.77,.026,'#dca44c',0,0,0,ns));
    for(let j=0;j<4;j++)for(const side of [-1,1])stem.add(cbox(.12,.22,.1,'#ffe1a0',side*.055,.64+j*.1,0,{r:.05,rz:-side*.55,...ns}));g.add(stem);}
  g.add(cbox(.47,.1,.17,'#cf8053',0,.33,.035,{r:.025}));g.scale.setScalar(scale);return g;
}
function wheatCharm() {
  const g=group();g.userData.festivalFeature='wheat-charm';g.add(box(.025,.62,.025,'#dca44c',0,-.7,0,ns));
  for(let i=0;i<3;i++)for(const side of [-1,1])g.add(cbox(.115,.2,.08,'#ffe1a0',side*.055,-.5+i*.105,0,{r:.04,rz:-side*.5,...ns}));return g;
}
function snowCrystal() {
  const g=group();g.userData.festivalFeature='snowflake-light';
  for(let i=0;i<3;i++)g.add(cbox(.055,.8,.06,glow('#effaff','#b9e5ff',.25,1.9),0,0,0,{r:.018,rz:i*Math.PI/3,...ns}));return g;
}
function gift(x,y,z,color,size=.43) {
  const g=group(x,y,z);g.userData.festivalFeature='wrapped-gift';g.add(box(size,size*.85,size,color,0,0,0,{r:.045}),box(size+.015,.075,size+.015,'#fff6da',0,size*.71,0,{r:.02}),box(.075,size*.85,size+.024,'#fff6da',0,0,0,{r:.02}));
  for(const x of [-.085,.085])g.add(torus(.082,.022,'#fff6da',x,size*.88,0,{rx:Math.PI/2}));return g;
}
function snowman() {
  const g=group();g.userData.festivalFeature='snowman';g.add(sph(.43,'#f4fbff',0,.4,0),sph(.31,'#ffffff',0,1.03,0));
  g.add(cyl(.37,.37,.065,'#7b6e98',0,1.29,0),cyl(.23,.24,.28,'#7b6e98',0,1.34,0));
  g.add(cbox(.58,.13,.58,'#ed8fa8',0,.81,0,{r:.1}),box(.13,.36,.06,'#ed8fa8',.16,.52,.4,{r:.025}));
  for(const x of [-.105,.105])g.add(sph(.035,'#615568',x,1.08,.286,ns));
  const nose=cyl(0,.075,.23,'#ffac63',0,1,.31,{rx:Math.PI/2,seg:8});g.add(nose);
  for(const y of [.36,.56])g.add(sph(.038,'#7b6e98',0,y,.405,ns));
  for(const side of [-1,1])g.add(cbox(.055,.52,.055,'#a58068',side*.51,.63,0,{rz:-side*.85}));return g;
}

export function festivalDisplay(kind, label, variant=0) {
  const g=group(),anim=[];const [a]=FEST[kind]||FEST.summer;g.userData.festivalKind=kind;g.userData.festivalFootprint=1.2;
  g.add(cyl(1.06,1.12,.22,kind==='snow'?'#e7f4fb':'#fff2da',0,0,0,{seg:24}),cyl(1.02,1.05,.045,a,0,.22,0,{seg:24}));
  if(kind==='sakura'){
    g.userData.festivalFeature='sakura-basket';g.add(box(1.27,.45,.6,'#d5a684',0,.265,.05,{r:.1}));for(let i=-3;i<=3;i++)g.add(cbox(.055,.4,.64,'#efcfab',i*.18,.49,.05,{r:.02}));
    for(const x of [-.79,.79])g.add(box(.085,1.7,.085,'#ba927c',x,.265,-.2,{r:.025}));g.add(cbox(1.77,.1,.13,'#ba927c',0,1.96,-.2,{r:.03}));
    for(let i=-2;i<=2;i++){const f=flowerCharm(.55+(i===0?.17:0));f.position.set(i*.28,.84+Math.abs(i%2)*.15,.08);g.add(f);}
    for(const x of [-.51,0,.51]){const bell=windBell();bell.position.set(x,1.89,-.17);g.add(bell);anim.push(bell);}for(const x of [-.8,.8]){const f=flowerCharm(.5);f.position.set(x,1.97,-.13);g.add(f);}
  }else if(kind==='summer'){
    g.userData.festivalFeature='summer-drum-stage';g.add(box(1.45,.22,1.15,'#d28c63',0,.265,0,{r:.045}));
    for(const x of [-.61,.61])for(const z of [-.44,.44])g.add(box(.075,1.33,.075,'#b87d5c',x,.48,z,{r:.02}));
    const roof=cbox(1.68,.13,1.39,'#ff8387',0,1.88,0,{r:.04});roof.userData.seasonalRoof=true;g.add(roof);
    for(let i=-3;i<=3;i++)g.add(cbox(.21,.27,.035,i%2?'#fff4d9':'#5fa8ee',i*.21,1.7,.68,{r:.015}));
    g.add(cyl(.37,.37,.56,'#bc7256',0,.58,0,{seg:20}),cyl(.39,.39,.055,'#fff4d9',0,1.14,0,{seg:20}));
    for(const x of [-.15,.15])g.add(cbox(.045,.39,.045,'#ffe3a0',x,1.24,.08,{rz:x>0?.65:-.65}));
    for(const x of [-.73,.73]){const f=fan(x<0?'#65c8d4':'#ffd76b');f.position.set(x,.78,.43);f.scale.setScalar(.7);g.add(f);anim.push(f);}
  }else if(kind==='harvest'){
    g.userData.festivalFeature='harvest-basket';g.add(box(1.48,.36,.85,'#bb8c5b',0,.265,-.05,{r:.075}));for(let i=-3;i<=3;i++)g.add(cbox(.055,.36,.91,'#e2b97f',i*.21,.44,-.05,{r:.018}));
    for(const [x,z,s,c]of [[-.45,.27,.9,'#f6a13f'],[.42,.29,.69,'#f9bf5b'],[0,-.13,.76,'#ec8650']]){const p=pumpkin(s,c);p.position.set(x,.61,z);g.add(p);}
    for(const x of [-.57,.54]){const w=wheatBundle(.87);w.position.set(x,.55,-.34);g.add(w);}
    const sign=cbox(.66,.33,.06,'#fff2cc',0,1.45,-.32,{r:.035});g.add(sign);const wheat=wheatBundle(.34);wheat.position.set(0,1.32,-.275);g.add(wheat);
  }else{
    g.userData.festivalFeature='snowman-gifts';const s=snowman();s.position.set(-.3,.265,-.1);g.add(s);
    g.add(gift(.56,.265,.38,'#eb9eb9',.46),gift(.43,.265,-.36,'#a7c8f0',.37),gift(-.56,.265,.57,'#b9dfca',.31));
    const pole=box(.07,1.92,.07,'#adc5d5',.67,.265,-.43,{r:.02});g.add(pole);const star=snowCrystal();star.position.set(.67,2.11,-.43);star.scale.setScalar(.65);g.add(star);anim.push(star);
  }
  const sign=textPlane(label,{size:64,color:'#6a5360',height:.19});sign.position.set(0,.36,1.015);g.add(sign);g.rotation.y=variant?-.25:.18;
  g.userData.tick=(time)=>anim.forEach((o,i)=>{o.rotation.z=Math.sin(time*1.45+i*.8)*.1;});return g;
}

export function festivalGarland(x0,z0,x1,z1,kind,n=7,y=4.25) {
  const g=group(),parts=[],[a,b,c]=FEST[kind]||FEST.summer;g.userData.festivalKind=kind;
  const points=[];for(let i=0;i<=20;i++){const t=i/20;points.push(new THREE.Vector3(x0+(x1-x0)*t,y-Math.sin(t*Math.PI)*.42,z0+(z1-z0)*t));}
  // 每次节日独占的线几何/材质由控制器统一释放。
  const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#c8a889'}));g.add(rope);
  for(let i=1;i<=n;i++){const t=i/(n+1),p=group(x0+(x1-x0)*t,y-Math.sin(t*Math.PI)*.42,z0+(z1-z0)*t);p.rotation.y=Math.atan2(z1-z0,x1-x0)*-1;
    if(kind==='sakura'){const fl=flowerCharm(.55);fl.position.y=-.18;p.add(fl);if(i%2===0){const bell=windBell();bell.position.y=-.34;p.add(bell);}}
    else if(kind==='summer'){
      const shape=new THREE.Shape();shape.moveTo(-.24,0);shape.lineTo(.24,0);shape.lineTo(0,-.56);shape.closePath();const flag=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat([a,b,c][i%3],{side:THREE.DoubleSide}));p.add(flag);
      if(i%2===0){const f=fan([a,b,c][(i+1)%3]);f.position.y=-.85;f.scale.setScalar(.58);p.add(f);}
    }else if(kind==='harvest'){p.add(wheatCharm());p.add(sph(.12,glow('#ffd881','#ffcc65',.22,1.7),0,-.83,0,ns));}
    else {const star=snowCrystal();star.position.y=-.36;p.add(star);p.add(sph(.09,glow('#ffeccc','#ffe0a0',.28,2),0,-.87,0,ns));}
    g.add(p);parts.push(p);
  }g.userData.tick=(time)=>parts.forEach((p,i)=>{p.rotation.z=Math.sin(time*1.3+i*.7)*.075;});return g;
}

// 成套场景使用不同轮廓与实物内容；控制器将静态零件合并后再加入世界。
export function festivalScene(kind,label,variant=0){
  const g=group(),wood='#b98c68',cream='#fff1d6',accent=(FEST[kind]||FEST.summer)[0];
  g.userData.festivalKind=kind;g.userData.festivalFeature=kind+'-'+(variant?'gathering-corner':'workshop');
  g.add(cyl(1.95,2.04,.09,kind==='snow'?'#eaf7ff':kind==='harvest'?'#edd39b':'#f8e6ce',0,.005,0,{seg:32,cast:false}));
  const at=(obj,x,y,z,s=1)=>{obj.position.set(x,y,z);obj.scale.setScalar(s);g.add(obj);return obj;};
  const table=(w=2.4,d=1.15,y=.75)=>{g.add(box(w,.12,d,cream,0,y,0,{r:.045}));for(const x of [-w*.4,w*.4])for(const z of [-d*.35,d*.35])g.add(box(.12,y,.12,wood,x,.09,z));};
  const canopy=(color)=>{for(const x of[-1.4,1.4])g.add(box(.1,2.5,.1,wood,x,.09,-.68,{r:.025}));g.add(box(3.12,.15,1.38,color,0,2.55,-.3,{r:.04}),box(3.1,.25,.055,cream,0,2.34,.37,{r:.02}));};
  if(kind==='sakura'){
    if(!variant){
      canopy('#ffb4cd');table();
      for(let i=-3;i<=3;i++){const f=flowerCharm(.55);at(f,i*.43,2.51,.43);}
      for(const x of[-1.38,1.38])for(let i=0;i<4;i++){at(flowerCharm(.37),x+(i%2?.13:-.09),.8+i*.39,-.57);at(sph(.16,'#9dccb1'),x-.12,.65+i*.4,-.67);}
      for(let i=-2;i<=2;i++)at(flowerCharm(.43),i*.4,1.08,.12);
      g.add(torus(.43,.06,'#9dccb1',0,1.1,-.1,{rx:Math.PI/2}));
    }else{
      table(2.2,1.28,.42);for(const x of[-1.37,1.37])at(cbox(.65,.22,1.14,'#ffc2d6'),x,.2,0);
      for(const x of[-.55,.55]){g.add(cyl(.23,.23,.035,'#ffffff',x,.57,.13,{seg:16}));g.add(sph(.12,'#ffe2a5',x,.64,.13));}
      at(windBell(),0,2.7,-1.1,1.4);g.add(box(.09,2.7,.09,wood,0,.09,-1.2),box(1.6,.08,.08,wood,0,2.68,-1.2));
      for(const x of[-.7,.7])at(flowerCharm(.7),x,2.55,-1.13);
    }
  }else if(kind==='summer'){
    if(!variant){
      g.add(box(2.8,.27,2.15,wood,0,.09,0,{r:.05}));canopy('#f9828b');
      for(const x of[-.58,.58]){g.add(cyl(.43,.43,.65,'#b8664e',x,.44,.13,{seg:20}),cyl(.46,.46,.05,cream,x,1.09,.13,{seg:20}));g.add(cbox(.055,.55,.055,cream,x,1.26,.16,{rz:x<0?.55:-.55}));}
      for(let i=-3;i<=3;i++)g.add(box(.37,.25,.06,i%2?'#6bb7d5':'#ffdf7c',i*.42,2.12,.42,{r:.01}));
    }else{
      table(2.2,1.2,.63);for(const x of[-1.36,1.36])at(fan(x<0?'#60c8dc':'#ffdf7c'),x,1.22,-.32,1.15);
      for(const x of[-.65,0,.65]){g.add(cyl(.15,.15,.25,'#9ed9da',x,.87,.08,{seg:12}),box(.023,.27,.023,'#fff7d5',x,.9,.08));}
      for(const z of[-.95,.95])g.add(box(2.4,.22,.46,'#7fbeca',0,.24,z,{r:.06}));
    }
    for(const x of[-1.58,1.58]){g.add(box(.06,2.06,.06,wood,x,.09,0));g.add(sph(.29,accent,x,1.94,0),box(.045,.28,.045,cream,x,1.42,0));}
  }else if(kind==='harvest'){
    if(!variant){canopy('#dd9c48');table(2.35,1.2,.65);for(const x of[-.76,-.22,.38,.91])at(pumpkin(.62),x,.77,.03);g.add(box(.48,.06,.52,wood,0,1.2,-.1),box(.07,.5,.07,wood,0,.8,-.1));}
    else{table(2.6,1.35,.63);for(const x of[-.82,0,.82]){g.add(cyl(.29,.29,.03,cream,x,.8,.06,{seg:16}));at(pumpkin(.42),x,.82,.06);}for(const z of[-1,1])g.add(box(2.6,.3,.48,'#d7a16e',0,.14,z,{r:.05}));}
    for(const x of[-1.55,1.55]){at(wheatBundle(1.22),x,.09,-.65);at(pumpkin(.83),x,.1,.58);}
  }else{
    if(!variant){
      at(snowman(),-.82,.11,-.3,1.25);for(const[x,y,z,s]of[[.55,.55,.12,.47],[1.13,.42,.02,.34],[.98,.37,.71,.26]])at(sph(s,'#ffffff'),x,y,z);
      g.add(box(2.4,.17,.7,'#b4cedb',0,.25,1.1,{r:.05}));for(const x of[-.7,.7])g.add(cbox(.45,.04,.55,x<0?'#e98ba8':'#97cafa',x,.45,1.1,{r:.04}));
    }else{
      for(const[x,z,s,c]of[[-.85,.45,.63,'#ec9cba'],[.85,.56,.51,'#9dc5ed'],[.08,.79,.36,'#b7dfcc']])at(gift(0,0,0,c,s),x,.11,z);
      for(let i=0;i<3;i++)g.add(cyl(0,1.13-i*.22,1.25,'#b6dace',0,.45+i*.65,-.48,{seg:8}));at(snowCrystal(),0,3.04,-.48,.7);
      g.add(cbox(2.35,.13,1.45,'#e4eef5',0,.1,.1,{r:.14}));
    }
    for(const x of[-1.52,1.52]){g.add(box(.06,2.55,.06,'#a8c5d6',x,.1,-.73));at(snowCrystal(),x,2.58,-.73,.6);}
  }
  const sign=textPlane(label,{size:64,color:'#715464',height:.23});sign.position.set(0,.3,1.72);g.add(sign);
  const completed=group(0,2.98,.1);completed.name='festival-completed';completed.userData.dynamicFestival=true;
  const tag=textPlane('一起完成啦',{size:56,color:'#598568',height:.22});completed.add(tag);completed.visible=false;g.add(completed);g.userData.completed=completed;
  return g;
}

export function festivalTreeOrnaments(kind){
  const g=group();g.userData.festivalFeature=kind+'-tree-hangings';
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,x=Math.cos(a)*.65,z=Math.sin(a)*.65;
    g.add(box(.018,.32,.018,'#d0b28b',x,1.9,z,ns));
    const ornament=kind==='sakura'?flowerCharm(.43):kind==='summer'?fan(i%2?'#ffd974':'#fa91ac'):kind==='harvest'?wheatCharm():snowCrystal();
    ornament.position.set(x,1.75,z);ornament.rotation.y=-a;ornament.scale.multiplyScalar(kind==='sakura'?1:.52);g.add(ornament);
  }
  return g;
}

// 图标
export const chestIco = (open) => icon('live:chest' + (open ? 1 : 0), () => chest(open ? 1 : 0), { yaw: 0.5, pitch: 0.35 });
export const breadIco = (id, done = 1) => icon('live:bread:' + id + done, () => bread(id, done), { yaw: 0.5, pitch: 0.45 });
export const bakeryIco = () => icon('live:bakery', () => shopBakery(), { yaw: 0.55, pitch: 0.36, size: 384, zoom: 1.02 });
export const siteIco = (phase) => icon('live:site' + phase, () => constructionSite(phase), { yaw: 0.55, pitch: 0.42, size: 320 });
export const boardIco = () => icon('live:board', () => noticeBoard(), { yaw: 0.4, pitch: 0.25 });
