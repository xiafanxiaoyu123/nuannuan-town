// 人物与大喵的移动、姿势、换装和浇水；字段及动画对象继续保留在 Town 上。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { THREE } from '../../core/kit.js';
import { outfitToLook } from '../../models/character.js';
import { audio } from '../../core/audio.js';
import { fx } from '../../core/fx.js';
import { S, stat } from '../../core/state.js';
import { clamp, angleLerp } from '../../core/util.js';
import { outfitFx } from '../../live/effects.js';
import { yardStepAllowed } from '../yard-building.js';

export function act(town, pose, dur = 0.6) {
  town.player.setPose(pose);
  town.lock = dur;
  town.moveTo = null;
}

export function face(town, x, z) {
  town.faceTarget = Math.atan2(x - town.pos.x, z - town.pos.z);
}

export function refreshOutfit(town) {
  town.player.setLook(outfitToLook(town.farm?.harvestLook || S.outfit));
  town.momo.setCloak?.(S.momoCloak);
}

export function celebrate(town) {
  town.player.setPose('cheer');
  town.lock = 1.4;
  fx.confetti(town.scene, town.pos.clone().setY(1.5), 36);
}

export function updatePlayer(town, dt) {
  const pl = town.player;
  if (town.zone === 'build') {
    const surface = town.yardHeightAt(town.pos.x, town.pos.z, town.pos.y);
    // A tall stair side is a movement blocker, never an upward snap target.
    if (surface <= town.pos.y || yardStepAllowed(town.pos.y, surface)) town.pos.y = surface;
  }
  let mx = 0, mz = 0;
  if (town.lock > 0) {
    town.lock -= dt;
    if (town.lock <= 0) pl.setPose('idle');
  } else if (town.decor.active && !town.modal) {
    const k = town.keys;
    const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const iy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    town.decor.panBy(ix * 16 * dt, iy * 16 * dt);
  } else if (!town.frozen && !town.decor.active) {
    const k = town.keys;
    const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + town.stick.x;
    const iy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + town.stick.y;
    if (ix || iy) {
      if (town.stick.x || town.stick.y) town.moveTo = null;
      const yaw = town.rig.yaw;
      mx = -Math.sin(yaw) * iy + Math.cos(yaw) * ix;
      mz = -Math.cos(yaw) * iy - Math.sin(yaw) * ix;
    } else if (town.moveTo) {
      const t = town.moveTo;
      const dx = t.x - town.pos.x, dz = t.z - town.pos.z, d = Math.hypot(dx, dz);
      const stop = t.hit ? Math.max(0.6, t.hit.r * 0.55) : 0.15;
      if (d < stop || t.stuck > 0.5) {
        town.moveTo = null;
        if (t.hit && d < t.hit.r + 0.4) { town.cur = town.findInter() || town.cur; if (town.cur && town.cur.id === t.hit.id) town.interact(); }
      } else { mx = dx / d; mz = dz / d; }
    }
  }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    const sp = 5.6 * (1 + outfitFx(S.outfit, 'trip'));
    const ox = town.pos.x, oz = town.pos.z;
    if (town.zone === 'build') town.moveOnYard(mx * sp * dt, mz * sp * dt);
    else {
      town.pos.x += mx * sp * dt;
      town.pos.z += mz * sp * dt;
      town.resolve(town.pos, 0.36);
    }
    const moved = Math.hypot(town.pos.x - ox, town.pos.z - oz);
    if (town.moveTo) town.moveTo.stuck += moved < sp * dt * 0.25 ? dt : -town.moveTo.stuck;
    town.faceTarget = Math.atan2(mx, mz);
    pl.targetMove = 1;
    town.stepAcc += dt;
    if (town.stepAcc > 0.27) {
      town.stepAcc = 0;
      audio.sfx('step');
      fx.burst(town.scene, town.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), { n: 2, colors: ['#ffffff', '#eef9e2'], speed: 0.5, up: 0.9, gravity: 1.6, life: 0.45, size: 0.5 });
    }
  } else pl.targetMove = 0;
  if (town.faceTarget !== undefined) pl.root.rotation.y = angleLerp(pl.root.rotation.y, town.faceTarget, 1 - Math.exp(-13 * dt));
  pl.root.position.copy(town.pos);
  pl.update(dt);

  // 大喵跟随；在后院时它会自己去给缺水的田浇水
  const m = town.momo, mp = m.root.position;
  let bx = town.pos.x - Math.sin(pl.root.rotation.y) * 1.0 + Math.cos(pl.root.rotation.y) * 0.7;
  let bz = town.pos.z - Math.cos(pl.root.rotation.y) * 1.0 - Math.sin(pl.root.rotation.y) * 0.7;
  if (town.zone === 'home' && !town.decor.active && S.settings.momoWater !== false) {
    town.momoCd = (town.momoCd || 0) - dt;
    let job = town.momoJob;
    if (job && (!town.farm.thirsty(job) || Math.hypot(job.obj.position.x - town.pos.x, job.obj.position.z - town.pos.z) > 16)) job = town.momoJob = null;
    if (!job && town.momoCd <= 0) { job = town.momoJob = town.farm.thirstyNear(town.pos.x, town.pos.z, 12); town.momoT = 0; }
    if (job) {
      const jp = job.obj.position, off = job.e.id === 'bigplot' ? 1.9 : 1.4;
      bx = jp.x + off; bz = jp.z + 0.2;
      if (Math.hypot(bx - mp.x, bz - mp.z) < 0.6) {
        m.root.rotation.y = angleLerp(m.root.rotation.y, Math.atan2(jp.x - mp.x, jp.z - mp.z), 1 - Math.exp(-10 * dt));
        if ((town.momoT += dt) > 0.7) {
          if (town.farm.applyWater(job)) { audio.sfx('water'); fx.hearts(town.scene, mp.clone().setY(1.3), 2); stat('momo_water'); stat('watered'); } // 大喵浇的也算在暖暖的浇水次数里
          town.momoJob = null;
          town.momoCd = 1.6;
        }
      }
    }
  } else town.momoJob = null;
  const dx = bx - mp.x, dz = bz - mp.z, d = Math.hypot(dx, dz);
  if (d > 0.5) {
    const sp = Math.min(7.5, d * 3.2);
    mp.x += (dx / d) * sp * dt;
    mp.z += (dz / d) * sp * dt;
    m.root.rotation.y = angleLerp(m.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
    m.targetMove = clamp(sp / 4);
  } else {
    m.targetMove = 0;
    m.root.rotation.y = angleLerp(m.root.rotation.y, Math.atan2(town.pos.x - mp.x, town.pos.z - mp.z), 1 - Math.exp(-4 * dt));
  }
  mp.y = town.yardHeightAt(mp.x, mp.z);
  m.update(dt);
}
