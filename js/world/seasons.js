// 四季只跟随小镇日历。登记过的户外草地、树冠与屋顶才变化；家具、农田和铺地保留原样。
import { THREE, rboxGeo } from '../core/kit.js';
import { S } from '../core/state.js';
import { app } from '../core/app.js';
import { gameDate } from '../core/gametime.js';
import { seeded } from '../core/util.js';

export const SEASONS = {
  spring: { name: '春', ground: '#a5df8c', patch: '#b3e69b', grass: '#8fcf78', leaf: ['#95d989', '#b5e9a0', '#7fcc89'], sakura: ['#ffc2d6', '#ffd6e3', '#ffadc9'], pine: ['#78c998', '#8cd8a7', '#a1e3b8'], particle: '#ffb7cf', sky: '#f7e9f0' },
  summer: { name: '夏', ground: '#82c974', patch: '#98d783', grass: '#64b05e', leaf: ['#58b875', '#80d387', '#47a76c'], sakura: ['#70c783', '#96d99a', '#59b875'], pine: ['#53a878', '#68bb88', '#86cea0'], particle: '#fff0a3', sky: '#a5d9ff' },
  autumn: { name: '秋', ground: '#c9cd84', patch: '#ddcf8e', grass: '#c6ad69', leaf: ['#e7a24f', '#f5ca6c', '#d5814e'], sakura: ['#e89665', '#f4ba7a', '#d67758'], pine: ['#7aa37a', '#8db184', '#adbf92'], particle: '#de964d', sky: '#ffe4bf' },
  winter: { name: '冬', ground: '#e6eff4', patch: '#f5f9fc', grass: '#c5d2c7', leaf: ['#a4bcb3', '#c1d2c7', '#90aaa8'], sakura: ['#b0bec8', '#c4cdd5', '#99afbc'], pine: ['#648e88', '#7da7a0', '#95bcb0'], particle: '#f8fcff', sky: '#d7e8f4' },
};

export function seasonForMonth(month) {
  return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
}

const MAX_SNOW = 4096, MAX_PARTICLES = 108;
const isOutside = (object) => {
  object.updateWorldMatrix(true, false);
  return object.matrixWorld.elements[12] < 100;
};

export class SeasonSystem {
  constructor(town) {
    this.town = town;
    this.current = seasonForMonth(gameDate().month);
    this.palette = SEASONS[this.current];
    this.grounds = new Map();
    this.plants = new Map();
    this.flowers = new Map();
    this.roofs = new Map();
    this.snowSurfaces = [];
    this.leafMaterials = new Map();
    this.snowMaterial = new THREE.MeshStandardMaterial({ color: '#f6fbff', roughness: 0.94 });
    // 全镇的树冠与屋顶雪层合并成两个实例网格；不会每棵树额外增加一组绘制调用。
    this.snowMesh = new THREE.InstancedMesh(rboxGeo(1, 1, 1, 0.15), this.snowMaterial, MAX_SNOW);
    const pineGeo = new THREE.CylinderGeometry(0.16, Math.SQRT1_2, 1, 4, 1);
    pineGeo.rotateY(Math.PI / 4);
    this.pineSnow = new THREE.InstancedMesh(pineGeo, this.snowMaterial, MAX_SNOW);
    for (const mesh of [this.snowMesh, this.pineSnow]) {
      mesh.name = 'season-snow-cover'; mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); town.scene.add(mesh);
    }
    this.particleMaterial = new THREE.MeshStandardMaterial({ color: this.palette.particle, roughness: 0.85, emissive: this.palette.particle, emissiveIntensity: 0.12 });
    this.particles = new THREE.InstancedMesh(rboxGeo(0.13, 0.055, 0.10, 0.018), this.particleMaterial, MAX_PARTICLES);
    this.particles.name = 'season-particles'; this.particles.frustumCulled = false; this.particles.count = 0;
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); town.scene.add(this.particles);
    const rnd = seeded(20303);
    this.particleData = Array.from({ length: MAX_PARTICLES }, () => ({ x: rnd() * 48 - 24, z: rnd() * 34 - 17, y: rnd() * 12, speed: 0.6 + rnd() * 0.75, phase: rnd() * Math.PI * 2, size: 0.55 + rnd() * 0.6 }));
    this._dummy = new THREE.Object3D(); this._matrix = new THREE.Matrix4();
    this._particleAcc = 1; this._snowAcc = 1; this._snowDirty = true;
    this._zone = null; this._center = new THREE.Vector2();
    this.refresh(true);
  }

  registerGround(mesh, { patch = false, vegetation = false } = {}) {
    if (!mesh?.material?.isMaterial || this.grounds.has(mesh) || !isOutside(mesh)) return mesh;
    const original = mesh.material, material = original.clone();
    // InstancedMesh 的逐株颜色由调用方保留；只调整独立的底色。
    mesh.material = material;
    const record = { original, material, kind: vegetation ? 'grass' : patch ? 'patch' : 'ground' };
    this.grounds.set(mesh, record); material.color.set(this.palette[record.kind]);
    return mesh;
  }

  registerFlowers(mesh) {
    if (!mesh || this.flowers.has(mesh) || !isOutside(mesh)) return mesh;
    this.flowers.set(mesh, { visible: mesh.visible }); mesh.visible = this.current !== 'winter';
    return mesh;
  }

  leafMaterial(kind, tone) {
    const key = `${kind}:${tone}`;
    if (!this.leafMaterials.has(key)) this.leafMaterials.set(key, new THREE.MeshStandardMaterial({ roughness: 0.87 }));
    const material = this.leafMaterials.get(key), family = kind === 'sakura' ? 'sakura' : kind === 'pine' ? 'pine' : 'leaf';
    material.color.set(this.palette[family][tone]);
    return material;
  }

  registerTree(root) {
    if (!root?.userData.seasonalPlant || this.plants.has(root) || !isOutside(root)) return root;
    // 装修的悬浮预览随手指移动，只给已经落地的物件挂季节积雪。
    for (let p = root; p; p = p.parent) if (Object.values(this.town.decors || {}).some((d) => d.ghost === p)) return root;
    const leaves = [];
    root.traverse((mesh) => { if (mesh.userData.seasonalLeaf && mesh.material?.isMaterial) leaves.push(mesh); });
    const records = leaves.map((mesh) => {
      const { kind, tone, pine } = mesh.userData.seasonalLeaf, original = mesh.material;
      mesh.material = this.leafMaterial(kind, tone);
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox, w = box.max.x - box.min.x, h = box.max.y - box.min.y, d = box.max.z - box.min.z;
      if (pine) this.snowSurfaces.push({ parent: mesh, owner: root, pine: true, width: w * 0.94, depth: d * 0.94, thickness: h * 0.64, x: 0, y: h * 0.20, z: 0, rx: 0, rz: 0 });
      else this.snowSurfaces.push({ parent: mesh, owner: root, width: w * 0.95, depth: d * 0.95, thickness: Math.min(0.24, h * 0.19), x: 0, y: box.max.y - h * 0.06, z: 0, rx: 0, rz: 0 });
      return { mesh, original };
    });
    this.plants.set(root, records); this._snowDirty = true;
    return root;
  }

  registerSnowSurface(parent, { width, depth, x = 0, y = 0, z = 0, rx = 0, rz = 0, thickness = 0.12, owner = parent } = {}) {
    if (!parent || !isOutside(parent) || !(width > 0 && depth > 0)) return null;
    // 同一父模型/局部位置重扫时复用登记。
    const old = this.snowSurfaces.find((s) => s.parent === parent && !s.pine && s.x === x && s.y === y && s.z === z);
    if (old) return old;
    const record = { parent, owner, width, depth, x, y, z, rx, rz, thickness };
    this.snowSurfaces.push(record); this._snowDirty = true; return record;
  }

  scanTrees(root) {
    if (!root) return;
    this.pruneDetached();
    root.traverse((object) => {
      if (object.userData.seasonalPlant) this.registerTree(object);
      if (object.userData.seasonalRoof && !this.roofs.has(object) && isOutside(object)) {
        object.geometry.computeBoundingBox(); const b = object.geometry.boundingBox;
        if (object.userData.seasonalRoof.gable) {
          const width = b.max.x - b.min.x, height = b.max.y - b.min.y, angle = Math.atan2(height, width / 2);
          const surfaces = [-1, 1].map((sign) => this.registerSnowSurface(object, { width: Math.hypot(width / 2, height), depth: (b.max.z - b.min.z) * 0.99,
            x: (b.min.x + b.max.x) / 2 + sign * width / 4, y: b.min.y + height / 2 + 0.055, rz: -sign * angle, thickness: 0.13 }));
          this.roofs.set(object, surfaces);
        } else {
          const surface = this.registerSnowSurface(object, { width: (b.max.x - b.min.x) * 0.98, depth: (b.max.z - b.min.z) * 0.98, y: b.max.y + 0.035, thickness: 0.13 });
          this.roofs.set(object, surface);
        }
      }
    });
  }

  pruneDetached() {
    const attached = (object) => { let p = object; while (p.parent) p = p.parent; return p === this.town.scene; };
    for (const object of [...this.plants.keys(), ...this.roofs.keys(), ...this.grounds.keys(), ...this.flowers.keys()]) {
      if (!attached(object) || !isOutside(object)) this.clearSubtree(object);
    }
  }

  clearSubtree(root) {
    if (!root) return;
    const removed = new Set(); root.traverse((object) => removed.add(object));
    for (const [mesh, record] of this.grounds) if (removed.has(mesh)) {
      mesh.material = record.original; record.material.dispose(); this.grounds.delete(mesh);
    }
    for (const [plant, records] of this.plants) if (removed.has(plant)) {
      for (const r of records) r.mesh.material = r.original;
      this.plants.delete(plant);
    }
    for (const [mesh, record] of this.flowers) if (removed.has(mesh)) { mesh.visible = record.visible; this.flowers.delete(mesh); }
    for (const mesh of this.roofs.keys()) if (removed.has(mesh)) this.roofs.delete(mesh);
    this.snowSurfaces = this.snowSurfaces.filter((s) => !removed.has(s.parent) && !removed.has(s.owner));
    this._snowDirty = true;
  }

  refresh(force = false) {
    const next = seasonForMonth(gameDate().month);
    if (!force && this.current === next) return false;
    this.current = next; this.palette = SEASONS[next];
    this.town.renderOptimizer?.invalidateDecor();
    for (const record of this.grounds.values()) record.material.color.set(this.palette[record.kind]);
    for (const [key, material] of this.leafMaterials) {
      const [kind, tone] = key.split(':'), family = kind === 'sakura' ? 'sakura' : kind === 'pine' ? 'pine' : 'leaf';
      material.color.set(this.palette[family][Number(tone)]);
    }
    for (const [mesh, record] of this.flowers) mesh.visible = next !== 'winter' && record.visible;
    this.particleMaterial.color.set(this.palette.particle); this.particleMaterial.emissive.set(this.palette.particle);
    this._snowDirty = true; this._particleAcc = 1;
    return true;
  }

  rebuildSnow() {
    let n = 0, p = 0;
    const centerX=this.town.rig?.x ?? this.town.pos?.x ?? 0;
    for (const s of this.snowSurfaces) {
      // 移动/收回家具可能由装修系统直接拆节点；不把脱离场景的旧树画回来。
      let ancestor = s.parent, visible = true;
      while (ancestor.parent) { visible = visible && ancestor.visible; ancestor = ancestor.parent; }
      if (ancestor !== this.town.scene || !visible) continue;
      s.parent.updateWorldMatrix(true, false);
      if(Math.abs(s.parent.matrixWorld.elements[12]-centerX)>180)continue;
      this._dummy.position.set(s.x, s.y, s.z); this._dummy.rotation.set(s.rx, 0, s.rz);
      this._dummy.scale.set(s.width, s.thickness, s.depth); this._dummy.updateMatrix();
      this._matrix.multiplyMatrices(s.parent.matrixWorld, this._dummy.matrix);
      if (s.pine) { if (p < MAX_SNOW) this.pineSnow.setMatrixAt(p++, this._matrix); }
      else if (n < MAX_SNOW) this.snowMesh.setMatrixAt(n++, this._matrix);
    }
    this.snowMesh.count = n; this.pineSnow.count = p;
    this.snowMesh.instanceMatrix.needsUpdate = true; this.pineSnow.instanceMatrix.needsUpdate = true;
    this._snowDirty = false;
    this._snowCenterX=centerX;
  }

  update(dt, time) {
    this.refresh();
    const t = this.town, outside = t.zone === 'town' || t.zone === 'home' || t.camMode === 'title';
    this.snowMesh.visible = this.pineSnow.visible = outside && this.current === 'winter';
    this.particles.visible = outside && this.current !== 'summer';
    // 登记/移动后刷新变换，平时雪帽以5Hz跟随树的轻微摇动；室内无需计算。
    this._snowAcc += dt;
    if(Math.abs((t.rig?.x ?? 0)-(this._snowCenterX ?? Infinity))>180)this._snowDirty=true;
    if (this.snowMesh.visible && (this._snowDirty || this._snowAcc >= 0.2)) { this.rebuildSnow(); this._snowAcc = 0; }
    if (!this.particles.visible) { this.particles.count = 0; return; }
    const low = S.settings.quality === 'low' || (app.mobile && app.quality !== 'high');
    const count = low ? 28 : this.current === 'winter' ? 96 : 56;
    const zone = t.zone || 'town', center = t.rig || t.pos || { x: 0, z: 0 };
    if (zone !== this._zone || Math.abs(center.x - this._center.x) > 12 || Math.abs(center.z - this._center.y) > 10) {
      this._zone = zone; this._center.set(center.x, center.z); this._particleAcc = 1;
    }
    this._particleAcc += dt;
    if (this._particleAcc < (low ? 1 / 15 : 1 / 30)) return;
    this._particleAcc = 0; this.particles.count = count;
    const snow = this.current === 'winter', speed = snow ? 0.55 : 0.85;
    for (let i = 0; i < count; i++) {
      const p = this.particleData[i], fall = time * p.speed * speed;
      const x = ((p.x + fall * (snow ? 0.27 : 0.55) + 1200) % 48) - 24;
      const y = ((p.y - fall) % 12 + 12) % 12 + 0.12;
      this._dummy.position.set(this._center.x + x + Math.sin(time * 0.4 + p.phase) * 0.6, y, this._center.y + p.z + Math.cos(time * 0.5 + p.phase) * 0.4);
      this._dummy.rotation.set(time * p.speed + p.phase, p.phase, time * p.speed * 0.7);
      this._dummy.scale.set(p.size, p.size * (snow ? 1.6 : 0.55), p.size);
      this._dummy.updateMatrix(); this.particles.setMatrixAt(i, this._dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.clearSubtree(this.town.scene);
    for (const m of this.leafMaterials.values()) m.dispose(); this.leafMaterials.clear();
    for (const mesh of [this.snowMesh, this.pineSnow, this.particles]) this.town.scene.remove(mesh);
    // RoundedBoxGeometry 来自 kit 共用缓存；只释放本系统独占的松树雪几何。
    this.pineSnow.geometry.dispose(); this.snowMaterial.dispose(); this.particleMaterial.dispose();
  }
}
