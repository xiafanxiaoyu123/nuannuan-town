// 地面表现与编辑：共用贴图缓存、网格、铺地笔画和地面重建。
import { THREE } from '../../core/kit.js';
import { FLOOR } from '../../data.js';
import { S, bus, spend, save } from '../../core/state.js';
import { audio } from '../../core/audio.js';
import { YARD_LEVEL_HEIGHT } from '../yard-building.js';
import { LOCAL_PLAY } from '../../core/local-play-mode.js';

const key = (x, z) => x + ',' + z;

// 地面材质的贴图：直接用 canvas 画出砖缝 / 木纹 / 卵石
const texCache = {};
export function floorTex(id) {
  if (texCache[id]) return texCache[id];
  const f = FLOOR[id];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = f.color;
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = f.line;
  x.fillStyle = f.line;
  x.lineWidth = 3;
  if (id === 'stone') {
    x.strokeRect(2, 2, 60, 60);
    x.beginPath(); x.moveTo(2, 34); x.lineTo(62, 30); x.moveTo(30, 2); x.lineTo(34, 32); x.moveTo(22, 32); x.lineTo(20, 62); x.stroke();
  } else if (id === 'wood') {
    for (const y of [0, 21, 43]) x.fillRect(0, y, 64, 2.5);
    for (const [px, py] of [[20, 2], [48, 23], [12, 45]]) x.fillRect(px, py, 2, 19);
  } else if (id === 'brick') {
    for (let r = 0; r < 4; r++) { x.fillRect(0, r * 16, 64, 2.5); for (let k = 0; k < 3; k++) x.fillRect(((r % 2) * 16 + k * 32) % 64, r * 16, 2.5, 16); }
  } else if (id === 'pebble') {
    x.fillStyle = f.color2;
    for (const [px, py, r] of [[14, 14, 10], [44, 12, 8], [30, 34, 11], [10, 46, 8], [52, 46, 10], [34, 56, 6], [56, 28, 6]]) { x.beginPath(); x.ellipse(px, py, r, r * 0.8, 0.4, 0, 7); x.fill(); x.stroke(); }
  } else if (id === 'mosaic') {
    // 一圈圈卵石拼出的花：中心一颗，外面两圈交替颜色
    x.lineWidth = 1.5;
    const dot = (px, py, r, c) => { x.fillStyle = c; x.beginPath(); x.ellipse(px, py, r, r * 0.86, 0.3, 0, 7); x.fill(); x.stroke(); };
    dot(32, 32, 6, '#ffe27a');
    for (let i = 0; i < 6; i++) dot(32 + Math.cos((i * Math.PI) / 3) * 13, 32 + Math.sin((i * Math.PI) / 3) * 13, 5.4, i % 2 ? f.color3 : f.color2);
    for (let i = 0; i < 12; i++) dot(32 + Math.cos((i * Math.PI) / 6 + 0.26) * 25, 32 + Math.sin((i * Math.PI) / 6 + 0.26) * 25, 4.6, i % 3 === 0 ? f.color3 : i % 3 === 1 ? '#ffffff' : f.color2);
    for (const [px, py] of [[4, 4], [60, 4], [4, 60], [60, 60]]) dot(px, py, 4, '#ffffff');
  } else if (id === 'tile') {
    x.strokeRect(1.5, 1.5, 61, 61);
    x.fillStyle = f.color2;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(32 + Math.cos((i * Math.PI) / 2) * 11, 32 + Math.sin((i * Math.PI) / 2) * 11, 9, 9, 0, 0, 7); x.fill(); }
    x.fillStyle = '#ffe27a';
    x.beginPath(); x.arc(32, 32, 6, 0, 7); x.fill();
  } else {
    x.globalAlpha = 0.5;
    for (const [px, py] of [[12, 16], [40, 10], [52, 40], [22, 46], [34, 28]]) x.fillRect(px, py, 5, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache[id] = { tex: t, url: c.toDataURL() };
  return texCache[id];
}


/** @param {import('../decor.js').DecorSys} decor */
export function resizeRoom(decor, blocked) {
  decor.finishStroke();decor.clearHistory(true);decor.cfg.blocked=blocked;decor.blockedTiles.clear();
  for(const [x0,x1,z0,z1]of blocked)for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)decor.blockedTiles.add(key(x,z));
  decor.rebuildGrid();decor.rebuildFloor();decor.pan.x=decor.pan.z=0;decor.updateGhost();
}

/** @param {import('../decor.js').DecorSys} decor */
export function rebuildGrid(decor) {
  const d = new THREE.Object3D(), LOT = decor.lot;
  let gi = 0;
  for (let x = 0; x < LOT.cols; x++) for (let z = 0; z < LOT.rows; z++) {
    if (decor.blockedTiles.has(key(x, z)) || !decor.inBounds(x, z)) continue;
    d.position.set(LOT.x0 + x + 0.5, 0.1 + decor.buildLevel * YARD_LEVEL_HEIGHT, LOT.z0 + z + 0.5);
    d.updateMatrix();
    decor.grid.setMatrixAt(gi++, d.matrix);
  }
  decor.grid.count = gi;
  decor.grid.instanceMatrix.needsUpdate = true;
  decor.grid.computeBoundingSphere();
}

/** @param {import('../decor.js').DecorSys} decor */
export function rebuildFloor(decor) {
  const d = new THREE.Object3D();
  const cnt = {};
  for (const [k, id] of Object.entries(S[decor.fk])) {
    const m = decor.floorMeshes[id];
    if (!m) continue;
    const [x, z] = k.split(',').map(Number);
    d.position.set(decor.lot.x0 + x + 0.5, 0.012, decor.lot.z0 + z + 0.5);
    d.rotation.y = ((x * 7 + z * 13) % 4) * (Math.PI / 2) * (id === 'wood' || id === 'brick' ? 0 : 1);
    d.updateMatrix();
    cnt[id] = cnt[id] || 0;
    m.setMatrixAt(cnt[id]++, d.matrix);
  }
  for (const [id, m] of Object.entries(decor.floorMeshes)) { m.count = cnt[id] || 0; m.instanceMatrix.needsUpdate = true; }
}

/** @param {import('../decor.js').DecorSys} decor */
export function paint(decor) {
  if (!decor.active || decor.town.zone !== decor.cfg.key || !decor.cursor || !decor.floorSel) return;
  if (decor.buildLevel) return decor.refuse('铺地仅用于地面；上层请摆放楼板或地毯');
  const gx = Math.floor(decor.cursor.fx), gz = Math.floor(decor.cursor.fz);
  if (!decor.inBounds(gx, gz) || decor.blockedTiles.has(key(gx, gz))) return;
  const f = FLOOR[decor.floorSel], k = key(gx, gz);
  const before = decor.stroke ? null : decor.snapshot();
  const cost = !LOCAL_PLAY && !f.erase && S[decor.fk][k] !== f.id ? f.price || 0 : 0;
  if (f.erase) { if (!S[decor.fk][k]) return; delete S[decor.fk][k]; audio.sfx('remove'); }
  else {
    if (S[decor.fk][k] === f.id) return;
    if (!LOCAL_PLAY && f.price && (S.coins - (decor.pendingCost || 0) < f.price || !spend(f.price))) {
      if (S.coins - (decor.pendingCost || 0) < f.price) bus.emit('poor', f.price - (S.coins - (decor.pendingCost || 0)));
      decor.isDown = false; return;
    }
    S[decor.fk][k] = f.id;
    audio.sfx('place');
  }
  decor.rebuildFloor();
  if (decor.stroke) { decor.stroke.changed = true; decor.stroke.cost += cost; if (!f.erase) decor.stroke.count++; }
  else decor.recordEdit(before, f.erase ? '擦除地板' : '铺地', { cost, stats: f.erase ? {} : { floored: 1 } });
  save();
  if (!decor.continuous) decor.selectFloor(null);
  bus.emit('decorChanged');
}

/** @param {import('../decor.js').DecorSys} decor */
export function resetFloor(decor) {
  decor.finishStroke(); decor.clearHistory(true);
  S[decor.fk] = decor.cfg.defaultFloor();
  decor.rebuildFloor();
}
