// 裁缝铺的实体工作台。场景、音符和触摸面共用这些世界坐标，不能再各自拟合屏幕。
import { THREE, box, cbox, cyl, frustum, torus, group, mat, mergeStatic } from '../core/kit.js';
import { Character, Momo, outfitToLook } from '../models/character.js';
import { buildRoom, roomLights, wallWindow, shelf } from './common.js';
import { S } from '../core/state.js';
import { TAILOR_LANES } from './tailor-lanes.js';

export const FABRIC = Object.freeze({ left: -3.2, right: 3.2, farZ: -4, nearZ: 3.6, y: 1.24, judgeZ: 2.7, unit: 100 });
export const LANE_X = [-2.4, -0.8, 0.8, 2.4];
const PLANE_W = (FABRIC.right - FABRIC.left) * FABRIC.unit;
const PLANE_H = (FABRIC.nearZ - FABRIC.farZ) * FABRIC.unit;
const NEEDLE_LIFT = 0.18;

function spool(color, x, y, z) {
  return group(x, y, z,
    cyl(0.24, 0.24, 0.07, '#d9b68f', 0, 0, 0, { seg: 16 }),
    cyl(0.17, 0.17, 0.4, color, 0, 0.07, 0, { seg: 16 }),
    cyl(0.24, 0.24, 0.07, '#d9b68f', 0, 0.47, 0, { seg: 16 }));
}

function buttonTexture(color) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.shadowColor = '#77536555'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#fffdf8'; ctx.beginPath(); ctx.arc(64, 62, 58, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = ctx.shadowOffsetY = 0;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(64, 62, 51, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff77'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(64, 62, 43, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#79596d';
  for (const x of [53, 75]) for (const y of [51, 73]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildTailorStage(g) {
  const sc = g.scene;
  // 横屏工作台会变宽；房间边界必须包住两侧站位，不能让角色陷入侧墙。
  buildRoom(sc, { w: 26, d: 17, z0: -8, floorA: '#fff7ef', floorB: '#f3e7ed', wall: '#fff3f4', trim: '#eed4e1' });
  roomLights(sc, { ground: 0xf2dce5 });
  g.post.tilt = 0; // 布面现在真实参与深度绘制，不能把近处的判定区当背景虚化。
  for (const x of [-6.3, 6.3]) {
    const w = wallWindow(2.4, 2.8, '#f3b6cb'); w.position.set(x, 4.3, -7.9); sc.add(w);
    const s = shelf(3.8); s.position.set(x, 2.5, -7.55);
    TAILOR_LANES.forEach((lane, i) => s.add(spool(lane.color, -1.3 + i * 0.85, 0.08, 0)));
    sc.add(s);
  }
  g.rack = group(0, 4.5, -7.6);
  g.rack.add(cbox(9, 0.1, 0.1, '#c79b84', 0, 0, 0, { r: 0.04 }));
  for (const x of [-4.4, 4.4]) g.rack.add(cbox(0.1, 0.55, 0.1, '#c79b84', x, 0.2, -0.1));
  sc.add(g.rack);

  g.topY = 1.2;
  g.workstation = group(); sc.add(g.workstation);
  const station = g.workstation;
  // 布面仍宽6.4；收掉多余木边，把两侧空间还给暖暖和大喵。
  g.table = box(6.85, 0.22, 8.8, '#ead0ad', 0, 0.98, -0.1, { r: 0.12 }); station.add(g.table);
  station.add(box(6.95, 0.1, 8.95, '#fff7e5', 0, 1.1, -0.1, { r: 0.06 }));
  for (const x of [-3.25, 3.25]) for (const z of [-3.6, 3.6]) station.add(box(0.3, 1.0, 0.3, '#d9b994', x, 0, z, { r: 0.04 }));
  // 前沿的花边与四块操作踏片属于同一张桌子。
  station.add(box(6.85, 0.4, 0.18, '#f2bad0', 0, 0.65, 4.25, { r: 0.07 }));
  g.fabric = [];
  TAILOR_LANES.forEach((lane, i) => {
    const color = '#' + new THREE.Color(lane.color).lerp(new THREE.Color('#fffdf5'), 0.58).getHexString();
    const material = mat(color, { rough: 1 });
    const cloth = box(1.58, 0.025, 7.6, material, LANE_X[i], FABRIC.y - 0.025, -0.2, { cast: false });
    station.add(cloth); g.fabric.push(cloth);
    // 布卷确实接着远端布面；两边的虚线是桌上的缝线，不是悬浮 UI 边框。
    const roll = cyl(0.28, 0.28, 1.54, lane.color, 0, 0, 0, { rz: -Math.PI / 2, seg: 20 });
    // cyl 的 y 参数表示未旋转圆柱底面；横放后显式设置中心，避免整卷悬空。
    // 布卷放在出谱区域之外，用短引布段接回桌面，避免遮住刚出现的纽扣上缘。
    roll.position.set(LANE_X[i], FABRIC.y + 0.28, -4.4); station.add(roll);
    station.add(box(1.58, 0.025, 0.4, material, LANE_X[i], FABRIC.y - 0.025, -4.2, { cast: false }));
    for (const dx of [-0.68, 0.68]) for (let z = -3.8; z < 3.55; z += 0.35) station.add(box(0.025, 0.004, 0.16, '#fffdfa', LANE_X[i] + dx, FABRIC.y + 0.001, z, { cast: false }));
  });

  // 四针缝纫机从桌子前沿伸向判定点，后面的整段布面保持敞开可读。
  g.machine = group(0, g.topY, 0); station.add(g.machine);
  const mc = g.machine;
  g.machineSupports = [];
  for (const x of [-3.25, 3.25]) {
    const pillar = box(0.3, 0.92, 0.72, '#f4aac5', x, 0, 4.0, { r: 0.09 });
    mc.add(pillar); g.machineSupports.push(pillar);
    mc.add(box(0.32, 0.18, 1.0, '#fff9f0', x, 0, 3.85, { r: 0.07 }));
  }
  g.machineBeam = box(6.8, 0.3, 0.6, '#f7bed2', 0, 0.62, 4.1, { r: 0.1 }); mc.add(g.machineBeam);
  mc.add(cbox(1.1, 0.2, 0.035, '#fff9f2', 0, 0.77, 4.42, { r: 0.06 }));
  mc.add(cbox(0.13, 0.13, 0.05, '#eb80a8', 0, 0.77, 4.45, { rz: Math.PI / 4, r: 0.03 }));
  g.needles = []; g.rings = []; g.ringMounts = []; g.bobbins = [];
  g.needleRig = group(); station.add(g.needleRig);
  LANE_X.forEach((x, i) => {
    const color = TAILOR_LANES[i].color;
    // 粗机头和支架全部退到轨缝。只检查针圈中心会漏掉上游纽扣被盖住的问题。
    const headX = x - 0.82;
    mc.add(box(0.10, 0.24, 1.5, '#fff4e9', headX, 0.65, 3.4, { r: 0.03 }));
    mc.add(box(0.12, 0.36, 0.28, color, headX, 0.5, FABRIC.judgeZ, { r: 0.04 }));
    // 横向传动只留细金属针杆，针尖仍准确落在原判定点，不用厚机壳盖住音符。
    g.needleRig.add(cbox(0.82, 0.018, 0.018, '#c9d3dc', x - 0.41, FABRIC.y + 0.7, FABRIC.judgeZ, { cast: false }));
    const nd = group(x, FABRIC.y + NEEDLE_LIFT, FABRIC.judgeZ);
    nd.add(cyl(0.018, 0.006, 0.72, mat('#c9d3dc', { metal: 0.6, rough: 0.3 }), 0, 0, 0, { seg: 8, cast: false }));
    station.add(nd); g.needles.push({ g: nd, k: 0 });
    const ringMount = group(x, FABRIC.y + 0.006, FABRIC.judgeZ);
    const ring = torus(0.47, 0.035, mat(color, { emissive: color, ei: 0.4 }), 0, 0, 0, { rx: Math.PI / 2, cast: false });
    ringMount.add(ring); station.add(ringMount); g.rings.push(ring); g.ringMounts.push(ringMount);
    // 比例补偿放外层，内层线轴自由转动，避免旋转与非等比缩放组合后忽胖忽瘦。
    const bobbinMount = group(headX, 0.92, 4.1), bobbin = spool(color, 0, 0, 0);
    bobbinMount.add(bobbin); mc.add(bobbinMount); g.bobbins.push(bobbinMount);
    if (i === 0) g.spool = bobbin;
  });
  // 判定线是布面印记，必须低于纽扣/长针脚，不能像凸起横条一样切过音符。
  station.add(box(6.4, 0.002, 0.045, '#fffdf5', 0, FABRIC.y + 0.0005, FABRIC.judgeZ, { cast: false }));
  g.wheel = cyl(0.3, 0.3, 0.18, '#fff8ed', -3.48, g.topY + 0.5, 4.0, { rz: Math.PI / 2, seg: 24 }); station.add(g.wheel);

  g.nikki = new Character(outfitToLook(S.outfit)); g.nikki.setPose('work');
  g.nikki.root.position.set(-4.65, 0, 1.25); g.nikki.root.rotation.y = Math.PI / 2; g.nikki.root.scale.setScalar(1.45); sc.add(g.nikki.root);
  // 3D 礼服假人模台：随缝制进度逐段拼装上衣、裙摆、腰封蝴蝶结与蕾丝花边
  const mq = g.mannequin = group(-4.65, 0, -3.5);
  mq.add(cyl(0.42, 0.48, 0.12, '#c79b84', 0, 0, 0, { seg: 16 }));
  mq.add(cyl(0.06, 0.06, 1.65, '#d9b994', 0, 0.12, 0, { seg: 12 }));
  mq.add(cyl(0.24, 0.2, 0.68, '#fff6ea', 0, 1.38, 0, { seg: 16 }));
  mq.add(cyl(0.08, 0.08, 0.14, '#c79b84', 0, 2.06, 0, { seg: 12 }));
  const mqBodice = box(0.56, 0.46, 0.34, '#ff9fbd', 0, 1.46, 0, { r: 0.08 });
  const mqSkirt = frustum(0.32, 0.72, 0.68, '#ffb6ce', 0, 0.82, 0, { sz: 0.72 });
  const mqBow = group(0, 1.42, 0.2, cbox(0.28, 0.14, 0.08, '#fff5f8', 0, 0, 0, { r: 0.03 }), cbox(0.1, 0.1, 0.1, '#ff6b9d', 0, 0, 0.02, { r: 0.02 }));
  const mqLace = cyl(0.74, 0.76, 0.1, '#fffdf8', 0, 0.78, 0, { seg: 20 });
  g.mannequinParts = [mqBodice, mqSkirt, mqBow, mqLace];
  for (const part of g.mannequinParts) { part.visible = false; mq.add(part); }
  sc.add(mq);
  // 大喵和成衣架退到工作台后侧，不占四条送布路线。
  g.momo = new Momo(); g.momo.root.position.set(4.8, 0, -2.9); g.momo.root.rotation.y = -0.45; g.momo.root.scale.setScalar(1.6); sc.add(g.momo.root);
  g.momoBaseY = 0;
  const basket = g.basket = group(4.8, 0, -0.4, box(1.2, 0.55, 1.4, '#e7b795', 0, 0, 0, { r: 0.1 }));
  for (let i = 0; i < 3; i++) basket.add(box(1.0, 0.13, 1.1, TAILOR_LANES[i].color, 0, 0.52 + i * 0.13, 0, { r: 0.04 })); sc.add(basket);
  g.noteGroup = group(); station.add(g.noteGroup);
  g.noteGeometry = new THREE.PlaneGeometry(1, 1); g.noteGeometry.rotateX(-Math.PI / 2);
  g.noteMaterials = TAILOR_LANES.map(lane => new THREE.MeshBasicMaterial({ map: buttonTexture(lane.color), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  g.threadMaterials = TAILOR_LANES.map(lane => new THREE.MeshBasicMaterial({ color: lane.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  // 桌上数百小段缝线是静物；只合并静态桌饰，保留每条布面和机器动画引用。
  mergeStatic(station, [g.table, ...g.fabric, mc, g.needleRig, ...g.ringMounts, ...g.needles.map(n => n.g), g.wheel, g.spool, g.noteGroup]);
}

export function disposeTailorNotes(g) {
  // clearNotes 会从场景摘除池节点，这些独占资源需在退出时显式释放。
  g.noteGeometry.dispose();
  for (const material of g.noteMaterials) { material.map.dispose(); material.dispose(); }
  for (const material of g.threadMaterials) material.dispose();
}

export function createStageNote(g, lane) {
  const root = group();
  const head = new THREE.Mesh(g.noteGeometry, g.noteMaterials[lane]);
  const thread = new THREE.Mesh(g.noteGeometry, g.threadMaterials[lane]);
  
  // --- 新增：脚（尾部纽扣） ---
  const tail = new THREE.Mesh(g.noteGeometry, g.noteMaterials[lane]);
  // ---------------------------
  
  thread.renderOrder = 1; head.renderOrder = 2;
  tail.renderOrder = 2; // 和头同一层级
  
  // 把尾巴也加进 root
  root.add(thread, head, tail); 
  g.noteGroup.add(root);
  
  // 返回的时候带上它
  return { root, head, thread, tail }; 
}

export function renderStageNote(g, note, localY, tailLength) {
  const { head, thread, tail, root } = note.visual; // 解构出 tail
  const z = FABRIC.farZ + localY / FABRIC.unit;
  const size = g.noteSize / FABRIC.unit;
  head.position.set(LANE_X[note.lane], FABRIC.y + 0.006, z);
  // 桌面可以随屏幕变宽/变长；纽扣仍保持圆形，不随工作台被拉成椭圆。
  const { x: sx, z: sz } = g.workstation.scale, unit = Math.min(sx, sz);
  head.scale.set(size * unit / sx, 1, size * unit / sz);
  // 裁到布面两端，绝不让长针脚飞出桌外或穿过布卷。
  // 画线的部分
  const begin = Math.max(FABRIC.farZ, z - tailLength / FABRIC.unit);
  const end = Math.min(FABRIC.nearZ, z);
  thread.position.set(LANE_X[note.lane], FABRIC.y + 0.003, (begin + end) / 2);
  thread.scale.set(size * 0.4 * unit / sx, 1, Math.max(0.001, end - begin));
  thread.visible = note.dur > 0 && end > begin;

    // --- 新增：尾巴的渲染逻辑 ---
  if (note.dur > 0) {
    // 尾巴的位置就在线的末端（begin处）
    tail.position.set(LANE_X[note.lane], FABRIC.y + 0.006, begin);
    tail.scale.set(size * unit / sx, 1, size * unit / sz);
    // 如果尾巴跑到布面外了，就隐藏
    tail.visible = begin >= FABRIC.farZ + size / 2 && begin <= FABRIC.nearZ - size / 2;
  } else {
    tail.visible = false;
  }

  head.visible = z >= FABRIC.farZ + size / 2 && z <= FABRIC.nearZ - size / 2;
  root.visible = note.state !== 'sewn' && (note.state !== 'miss' || note.fade > 0.2);
}

export function animateTailorStage(g, dt, flow, pulse) {
  g.wheel.rotation.x = -flow * 6; g.spool.rotation.y = flow * 3;
  g.needles.forEach((n, i) => {
    n.k = Math.max(0, n.k - dt * 7);
    // 针尖最低点正好是布面，不允许穿台或脱离同一判定线。
    n.g.position.y = FABRIC.y + NEEDLE_LIFT * (1 - n.k);
    g.rings[i].material.emissiveIntensity = 0.4 + pulse * 0.7 + (g.laneHeld(i) ? 0.8 : 0);
  });
}

export function fitTailorCamera(g, width, height) {
  const portrait = width <= height;
  // 竖屏延长送布台，横屏加宽四轨。只改变表现坐标，不改谱面长度、到线时间或判定。
  const sx = portrait ? 1 : THREE.MathUtils.clamp(2.4 - (width - 900) / 750, 1.8, 2.4);
  const sz = portrait ? THREE.MathUtils.clamp((height - 200) / width * 1.04, 1, 1.7) : 1;
  const unit = Math.min(sx, sz);
  g.workstation.scale.set(sx, 1, sz);
  for (const mount of g.ringMounts) mount.scale.set(unit / sx, 1, unit / sz);
  for (const n of g.needles) n.g.scale.set(1 / sx, 1, 1 / sz);
  for (const rod of g.needleRig.children) rod.scale.z = 1 / sz;
  for (const bobbin of g.bobbins) bobbin.scale.set(1 / sx, 1, 1 / sz);
  // 为桌侧留出真实站位和看见脚部的视线，不能只把角色中心塞进画面。
  const companionX = 3.475 * sx + (portrait ? 0.85 : 1.25);
  g.nikki.root.position.set(-companionX, 0, -1.8 * sz); g.nikki.root.rotation.y = 0.45;
  if (g.mannequin) { g.mannequin.position.set(-companionX, 0, -3.7 * sz); g.mannequin.rotation.y = 0.35; }
  g.momo.root.position.set(companionX, 0, -3.5 * sz); g.momo.root.rotation.y = -0.3;
  g.basket.position.set(companionX, 0, -0.1 * sz);
  g.workstation.updateMatrixWorld(true);
  const camera = g.camera;
  camera.aspect = width / height; camera.fov = portrait ? 85 : 65;
  camera.clearViewOffset(); camera.updateProjectionMatrix();
  const top = portrait ? 140 : 104, bottom = height - 76, left = portrait ? Math.min(28, Math.max(14, Math.round(width * 0.06))) : 30, right = width - 14;
  const target = new THREE.Vector3(0, 1.4, 0);
  // 操作视角优先展示整个布面；提高俯角仍保留透视，机头位置须配合全路线遮挡检查。
  const CameraPitchAngle = 45;

  const pitch = CameraPitchAngle * Math.PI / 180, up = Math.sin(pitch), forward = Math.cos(pitch);
  const bounds = [
    [-3.3, FABRIC.y, -4.3], [3.3, FABRIC.y, -4.3],
    [-3.3, FABRIC.y, 3.6], [3.3, FABRIC.y, 3.6],
    [-3.3, 0.95, 4.5], [3.3, 0.95, 4.5],
  ].map(p => g.workstation.localToWorld(new THREE.Vector3(...p)));
  const projectedBounds = () => {
    const pixels = bounds.map(p => { const v = p.clone().project(camera); return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 }; });
    return { left: Math.min(...pixels.map(p => p.x)), right: Math.max(...pixels.map(p => p.x)), top: Math.min(...pixels.map(p => p.y)), bottom: Math.max(...pixels.map(p => p.y)) };
  };
  let lo = 4, hi = 40;
  for (let i = 0; i < 24; i++) {
    const distance = (lo + hi) / 2;
    camera.position.set(target.x, target.y + distance * up, target.z + distance * forward);
    camera.lookAt(target); camera.updateMatrixWorld(true);
    const rect = projectedBounds();
    const fits = rect.right - rect.left <= right - left && rect.bottom - rect.top <= bottom - top;
    if (fits) hi = distance; else lo = distance;
  }
  camera.position.set(target.x, target.y + hi * up, target.z + hi * forward);
  camera.lookAt(target); camera.updateMatrixWorld(true);
  // 对齐实际投影包围盒；只对齐相机目标会因透视把桌面推向下方，留下大片空白。
  const rect = projectedBounds();
  camera.setViewOffset(width, height, (rect.left + rect.right - left - right) / 2, (rect.top + rect.bottom - top - bottom) / 2, width, height);
}

export function projectTailorInput(g, width, height) {
  g.scene.updateMatrixWorld(true); g.camera.updateMatrixWorld(true);
  const m = new THREE.Matrix4().multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse).multiply(g.workstation.matrixWorld);
  // 同一个投影矩阵从布面局部像素映射至屏幕，保留齐次 w，触摸自然命中真实梯形。
  const origin = new THREE.Vector4(FABRIC.left, FABRIC.y, FABRIC.farZ, 1).applyMatrix4(m);
  const x = new THREE.Vector4(1 / FABRIC.unit, 0, 0, 0).applyMatrix4(m);
  const y = new THREE.Vector4(0, 0, 1 / FABRIC.unit, 0).applyMatrix4(m);
  const column = p => [(p.x + p.w) * width / 2, (p.w - p.y) * height / 2, 0, p.w].map(v => v / origin.w);
  g.laneField.style.width = PLANE_W + 'px'; g.laneField.style.height = PLANE_H + 'px';
  g.laneField.style.transform = `matrix3d(${[...column(x), ...column(y), 0, 0, 1, 0, ...column(origin)].join(',')})`;
  g.noteSize = 150;
  g.laneField.style.setProperty('--note-size', g.noteSize + 'px');
  const { x: sx, z: sz } = g.workstation.scale, unit = Math.min(sx, sz);
  g.laneField.style.setProperty('--note-width', (g.noteSize * unit / sx) + 'px');
  g.laneField.style.setProperty('--note-height', (g.noteSize * unit / sz) + 'px');
  g.judgeY = (FABRIC.judgeZ - FABRIC.farZ) * FABRIC.unit;
  g.laneField.style.setProperty('--judge-inset', PLANE_H - g.judgeY + 'px');
  const project = (x, y, z) => { const v = g.workstation.localToWorld(new THREE.Vector3(x, y, z)).project(g.camera); return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 }; };
  const a = project(FABRIC.left, 0.95, 4.5), b = project(FABRIC.right, 0.95, 4.5);
  const maxKeyW = Math.floor((width - 16) / 4);
  const keyWidth = Math.min(maxKeyW, Math.max(50, (b.x - a.x) / 4));
  const keyLeft = Math.max(8, Math.min(width - 8 - keyWidth * 4, (a.x + b.x) / 2 - keyWidth * 2));
  g.keyEls.forEach((key, i) => {
    key.style.left = (keyLeft + keyWidth * i + 1) + 'px'; key.style.top = a.y + 'px';
    key.style.width = (keyWidth - 2) + 'px';
  });
  const far = project(0, FABRIC.y, FABRIC.farZ);
  g.board.style.setProperty('--runway-top', far.y + 'px');
}
