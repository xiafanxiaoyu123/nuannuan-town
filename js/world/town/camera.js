// 标题/游玩/装修镜头、建造楼层可见性及后处理；仅显式读写同一个 Town。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { app } from '../../core/app.js';
import { bus } from '../../core/state.js';
import { DECO } from '../../data.js';
import { damp } from '../../core/util.js';
import { YARD_LEVEL_HEIGHT, isBuildRoof, yardLevel, yardFootprint } from '../yard-building.js';
import { BUILD_LOT } from '../build-constants.js';

export function resetCam(town) {
  town.camYaw = 0;
  town.camPitch = 0;
  town.zoom = 28;
}

export function updateBuildRoofView(town) {
  const decor = town.decors?.build;
  if (!decor) return;
  const level = Math.floor((town.pos.y + .2) / YARD_LEVEL_HEIGHT);
  const x = town.pos.x - BUILD_LOT.x0, z = town.pos.z - BUILD_LOT.z0;
  const inBuild = town.zone === 'build', isRoof = isBuildRoof;
  let roofCovered = false, covered = false, onStairs = false;
  if (inBuild && !decor.active) for (const e of decor.structures) {
    if (!isRoof(e.id) && e.id !== 'yard_slab' && e.id !== 'yard_stairs') continue;
    const f = yardFootprint(e, DECO);
    if (x < f.x0 || x >= f.x1 || z < f.z0 || z >= f.z1) continue;
    const base = yardLevel(e) * YARD_LEVEL_HEIGHT;
    if (e.id === 'yard_stairs') {
      // Keep the cutaway while crossing an open stairwell. Walking underneath
      // an upstairs stair does not count as climbing that stair.
      if (town.pos.y > base + .01 && town.pos.y <= base + YARD_LEVEL_HEIGHT + .25) onStairs = true;
    } else if (yardLevel(e) > level) {
      covered = true;
      if (isRoof(e.id)) roofCovered = true;
    }
  }
  // Photography keeps its existing roof-only view; first-person/selfie and
  // fixed-tripod shots must not unexpectedly lose the upper building facade.
  const cutaway = inBuild && !town.photoOn && (decor.active || covered || onStairs);
  const cutLevel = decor.active ? decor.buildLevel : level;
  town.buildCutawayLevel = cutaway ? cutLevel : null;
  let changed = false;
  for (const rec of decor.entries) {
    const roofHidden = isRoof(rec.e.id) && inBuild && (decor.active ? town.buildRoofsHidden : roofCovered && yardLevel(rec.e) > level);
    // In the editor the explicit roof button takes priority over sectioning:
    // "show roofs" must still reveal the facade even while editing floor one.
    const aboveCut = cutaway && yardLevel(rec.e) > cutLevel && !(decor.active && isRoof(rec.e.id));
    const dragging = decor.furnitureDrag?.active && decor.furnitureDrag.rec === rec;
    const visible = !roofHidden && !aboveCut && !dragging;
    if (rec.obj.visible !== visible) { rec.obj.visible = visible; changed = true; }
  }
  if (changed) town.renderOptimizer?.invalidateDecor();
}

export function updateCamera(town, dt, time) {
  // 镜头
  const g = town.goal, r = town.rig;
  if (town.camMode === 'title') {
    g.y = 0;
    g.x = -2; g.z = -1; g.dist = 50; g.pitch = 0.6; g.yaw = 0.52 + Math.sin(time * 0.12) * 0.28;
  } else if (town.camMode === 'decor') {
    g.y = town.decor.buildLevel * YARD_LEVEL_HEIGHT;
    const dl = town.decor.lot;
    g.x = dl.x0 + dl.cols / 2 + town.decor.pan.x;
    g.z = dl.z0 + dl.rows / 2 + town.decor.cfg.dz + town.decor.pan.z;
    g.dist = town.decor.zoom;
    g.pitch = town.decor.viewPitch ?? 1.0;
    g.yaw = town.decor.viewYaw ?? 0.25;
  } else {
    g.y = town.pos.y;
    g.x = town.pos.x; g.z = town.pos.z; g.dist = town.zoom; g.pitch = 0.74 + town.camPitch; g.yaw = 0.52 + town.camYaw;
  }
  const kk = town.camSnap ? 1 : 1 - Math.exp(-(town.camMode === 'play' ? 5 : 2.6) * dt);
  town.camSnap = false;
  for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'dist']) r[key] += (g[key] - r[key]) * kk;
  // 彩蛋：镜头真的钻到人物脚下、开始往上看时 —— 不可以，弹回去（这次拖动作废，松手再拖才继续）
  if (town.camMode === 'play' && !town.peekHold && r.pitch < -0.13) {
    town.peekHold = true;
    town.camPitch = -0.3;
    bus.emit('peek');
  }
  const cp = Math.cos(r.pitch), sp = Math.sin(r.pitch);
  town.camera.position.set(r.x + Math.sin(r.yaw) * cp * r.dist, 1 + r.y + sp * r.dist, r.z + Math.cos(r.yaw) * cp * r.dist);
  town.camera.lookAt(r.x, 1 + r.y, r.z);
  if (town.cine) town.cine(time, dt, town.camera);
  town.sun.target.position.set(r.x, 0, r.z);
  town.sun.position.set(r.x + town.sunOff.x, town.sunOff.y, r.z + town.sunOff.z);
  town.sky.position.copy(town.camera.position);
  town.stars.position.copy(town.camera.position);
  town.waterU.time.value = time;
  town.waterU.cam.value.set(r.x, r.z);
}

export function updatePostProcessing(town, dt) {
  // 航行显示的是船上的角色副本；岸上隐藏角色不能继续充当移轴焦点。
  const passenger = town.buildIslandPort?.travelFocus();
  if (passenger) town.camera.updateMatrixWorld(); // 切近景的第一帧也使用当前镜头。
  const sp2 = app.project(passenger || town.pos, town.camera);
  const focus = town.camMode === 'play' ? 1 - sp2.y / app.height : 0.5;
  app.finish.uniforms.focus.value = passenger ? Math.max(0, Math.min(1, focus)) : damp(app.finish.uniforms.focus.value, focus, 4, dt);
  // 拍照时关掉移轴模糊，整张画面都要清楚
  if (town.photoOn) app.finish.uniforms.amount.value = 0;
  else app.finish.uniforms.amount.value = damp(app.finish.uniforms.amount.value, town.camMode === 'decor' ? 1.2 : 3.2, 4, dt);
}
