// 方块建模工具箱：所有模型都由这里的圆角方块 / 棱台 / 圆柱拼出来
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geoCache = new Map();
const matCache = new Map();
export const glowMats = []; // 夜晚会亮起来的材质 {m, base}

export function mat(color, o = {}) {
  const key = `${color}|${o.rough ?? 0.84}|${o.metal ?? 0}|${o.opacity ?? 1}|${o.emissive ?? ''}|${o.ei ?? 0}|${o.side ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.84,
      metalness: o.metal ?? 0,
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.ei ?? 0,
      side: o.side ?? THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

// 夜间发光材质（窗户、灯）：白天 day 强度，夜晚 night 强度
export function glow(color, emissive, day = 0.15, night = 1.6) {
  const key = `glow|${color}|${emissive}|${day}|${night}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive, emissiveIntensity: day });
    matCache.set(key, m);
    glowMats.push({ m, day, night });
  }
  return m;
}

function finish(mesh, x, y, z, o) {
  mesh.position.set(x, y, z);
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.receive ?? true;
  if (o.rx) mesh.rotation.x = o.rx;
  if (o.ry) mesh.rotation.y = o.ry;
  if (o.rz) mesh.rotation.z = o.rz;
  return mesh;
}
const material = (color, o) => (color && color.isMaterial ? color : mat(color, o));

// 圆角方块的精细程度。每个圆角方块原来固定 588 个三角形，全场几千个方块加几千株草，手机和模拟器吃不消：
//   0 = 省：小东西直接用最简单的方块（12 个三角形），其余圆角只切一刀（108 个）
//   1 = 标准：小东西 108 个，其余 300 个
// 由 app 在启动时按设备和画质档位设定；几何体有缓存，改档位后要重进游戏才完全生效
let geoDetail = 1;
export function setGeoDetail(level) { geoDetail = level ? 1 : 0; }
export function rboxGeo(w, h, d, r) {
  const rr = Math.min(r ?? Math.min(w, h, d) * 0.22, Math.min(w, h, d) * 0.5 - 0.0005);
  const small = Math.max(w, h, d) <= 0.3 || rr < 0.02;
  const seg = geoDetail ? (small ? 1 : 2) : (small ? 0 : 1);
  const key = `rb${seg}|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${rr.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = seg ? new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, rr)) : new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}

// 圆角方块，y 为中心
export function cbox(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
  const mesh = finish(new THREE.Mesh(rboxGeo(w, h, d, o.r), material(color, o)), x, y, z, o);
  // 省面数档：小零件不投影子（影子本来就小到看不出），阴影那一遍能少画四成
  if (!geoDetail && o.cast === undefined && Math.max(w, h, d) <= 0.4) mesh.castShadow = false;
  return mesh;
}
// 圆角方块，y 为底面（从地面往上搭东西更顺手）
export function box(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
  return cbox(w, h, d, color, x, y + h / 2, z, o);
}

// 圆柱 / 圆台，y 为底面
export function cyl(rt, rb, hgt, color, x = 0, y = 0, z = 0, o = {}) {
  const seg = o.seg ?? 20;
  const key = `cy|${rt}|${rb}|${hgt}|${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, hgt, seg);
    geoCache.set(key, g);
  }
  return finish(new THREE.Mesh(g, material(color, o)), x, y + hgt / 2, z, o);
}

// 四棱台（裙子、屋顶、花盆），top/bot 为边长，y 为底面
export function frustum(top, bot, hgt, color, x = 0, y = 0, z = 0, o = {}) {
  const key = `fr|${top}|${bot}|${hgt}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(top * Math.SQRT1_2, bot * Math.SQRT1_2, hgt, 4, 1);
    g.rotateY(Math.PI / 4);
    geoCache.set(key, g);
  }
  const m = finish(new THREE.Mesh(g, material(color, { ...o })), x, y + hgt / 2, z, o);
  if (o.sx) m.scale.x = o.sx;
  if (o.sz) m.scale.z = o.sz;
  return m;
}

// 人字屋顶（三棱柱），屋脊沿 z 方向，y 为底面
export function gable(w, hgt, d, color, x = 0, y = 0, z = 0, o = {}) {
  const key = `ga|${w}|${hgt}|${d}`;
  let g = geoCache.get(key);
  if (!g) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, hgt);
    s.closePath();
    g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    g.translate(0, 0, -d / 2);
    geoCache.set(key, g);
  }
  return finish(new THREE.Mesh(g, material(color, o)), x, y, z, o);
}

export function sph(r, color, x = 0, y = 0, z = 0, o = {}) {
  const key = `sp|${r}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, 18, 14);
    geoCache.set(key, g);
  }
  return finish(new THREE.Mesh(g, material(color, o)), x, y, z, o);
}

export function torus(r, tube, color, x = 0, y = 0, z = 0, o = {}) {
  const key = `to|${r}|${tube}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.TorusGeometry(r, tube, 10, 24);
    geoCache.set(key, g);
  }
  return finish(new THREE.Mesh(g, material(color, o)), x, y, z, o);
}

export function group(x = 0, y = 0, z = 0, ...children) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const c of children.flat()) if (c) g.add(c);
  return g;
}

// 圆角矩形平面形状（岛屿、地毯等）
export function roundRectShape(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
export function slab(w, d, r, hgt, color, x = 0, y = 0, z = 0, o = {}) {
  const g = new THREE.ExtrudeGeometry(roundRectShape(w, d, r), {
    depth: hgt, bevelEnabled: true, bevelSize: o.bevel ?? 0.12, bevelThickness: o.bevel ?? 0.12, bevelSegments: 3, curveSegments: 12,
  });
  g.rotateX(-Math.PI / 2);
  const m = finish(new THREE.Mesh(g, material(color, o)), x, y, z, o);
  return m;
}

// 文字贴图牌子
export function textPlane(text, o = {}) {
  const fs = o.size ?? 64;
  const font = `${o.weight ?? 400} ${fs}px ${o.font ?? '"ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif'}`;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.font = font;
  const padX = o.padX ?? fs * 0.5, padY = o.padY ?? fs * 0.3;
  const tw = Math.ceil(ctx.measureText(text).width);
  c.width = tw + padX * 2;
  c.height = fs + padY * 2;
  ctx = c.getContext('2d');
  if (o.bg) {
    ctx.fillStyle = o.bg;
    const r = o.radius ?? c.height / 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, r);
    ctx.fill();
  }
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = o.color ?? '#5b4252';
  ctx.fillText(text, c.width / 2, c.height / 2 + fs * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const hgt = o.height ?? 0.5;
  const wid = (hgt * c.width) / c.height;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(wid, hgt),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, alphaTest: 0.02 })
  );
  m.userData.width = wid;
  return m;
}

export function setShadow(obj, cast = true, receive = true) {
  obj.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return obj;
}

// 把一个 Group 临时染色（装修模式的虚影）
export function tintClone(obj, color, opacity = 0.6) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const g = obj.clone(true);
  g.traverse((c) => {
    if (c.isMesh) {
      c.material = m;
      c.castShadow = false;
      c.receiveShadow = false;
    }
  });
  return g;
}

// 仅用于不再复用的独立场景（例如打烊后的小游戏）。工具箱里的几何/材质
// 同时被小镇、衣橱和图标渲染器使用，必须保留；只释放场景独占的资源。
export function disposeSceneResources(scene) {
  const shared = new Set([...geoCache.values(), ...matCache.values()]);
  for (const m of matCache.values()) for (const v of Object.values(m)) if (v?.isTexture) shared.add(v);
  const disposed = new Set();
  const release = (resource) => {
    if (!resource || shared.has(resource) || disposed.has(resource)) return;
    disposed.add(resource);
    resource.dispose?.();
  };
  const releaseMaterial = (material) => {
    if (!material || shared.has(material)) return;
    for (const value of Object.values(material)) if (value?.isTexture) release(value);
    release(material);
  };
  scene.traverse((obj) => {
    release(obj.geometry);
    for (const m of [obj.material].flat()) releaseMaterial(m);
    releaseMaterial(obj.customDepthMaterial);
    releaseMaterial(obj.customDistanceMaterial);
    // 阴影的 render target 与实例矩阵都不归 geometry/material.dispose 管。
    if (obj.shadow) release(obj.shadow);
    if (obj.isInstancedMesh) release(obj);
  });
  if (scene.background?.isTexture) release(scene.background);
  if (scene.environment?.isTexture) release(scene.environment);
}

export { THREE };

// 把一个模型里不会动的零件按材质合并成几块大网格（原来的小零件从模型里移除），大幅减少每帧的绘制次数。
// keep：要做动画的节点（连同它们的子节点）保持原样。带贴图、半透明、隐藏的零件也不动。返回合并掉的零件数。
export function mergeStatic(root, keep = []) {
  if (!root || root.userData.merged) return 0;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const skip = new Set();
  for (const k of keep) if (k && k.traverse) k.traverse((o) => skip.add(o));
  const hidden = (o) => { for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible) return true; return false; };
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o === root || skip.has(o) || o.isInstancedMesh || o.children.length || Array.isArray(o.material)) return;
    const mt = o.material;
    if (!mt || mt.transparent || mt.map || mt.side === THREE.DoubleSide || o.userData.keep || hidden(o) || !o.geometry.attributes.normal) return;
    m4.multiplyMatrices(inv, o.matrixWorld);
    if (m4.determinant() < 0) return; // 镜像过的零件合并后正反面会反，留着
    const key = mt.uuid + '|' + o.castShadow + '|' + o.receiveShadow;
    if (!buckets.has(key)) buckets.set(key, { mt, cast: o.castShadow, receive: o.receiveShadow, list: [] });
    buckets.get(key).list.push([o, m4.clone()]);
  });
  let n = 0;
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = b.list.map(([o, mx]) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      g.applyMatrix4(mx);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mt);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.receive; mesh.name = 'static-merged';
    for (const [o] of b.list) { o.parent.remove(o); n++; }
    root.add(mesh);
  }
  root.userData.merged = true;
  return n;
}
