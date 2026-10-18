// 大纸鹤环镇旅行：复用场景中的纸鹤，只把鹤身带离检修支架。
import { THREE } from '../core/kit.js';
import { S, bus, save } from '../core/state.js';
import { h } from '../core/util.js';
import { audio } from '../core/audio.js';

export const CRANE_RIDE_SECONDS = 42;
const RISE = 4, LAP = 34;
const smooth = n => { n = Math.max(0, Math.min(1, n)); return n * n * (3 - 2 * n); };

export function installCraneRide(game, stand, bird) {
  const town = game.town, ui = game.ui;
  if (town.craneRide) town.craneRide.dispose();
  const departure = new THREE.Vector3();
  stand.updateMatrixWorld(true); bird.getWorldPosition(departure);
  const cruise = departure.clone().setY(14);
  const route = new THREE.CatmullRomCurve3([
    cruise, new THREE.Vector3(-29, 14, 15), new THREE.Vector3(-39, 15, 0),
    new THREE.Vector3(-26, 14, -16), new THREE.Vector3(7, 15, -17),
    new THREE.Vector3(35, 14, -10), new THREE.Vector3(39, 15, 6),
    new THREE.Vector3(23, 14, 17),
  ], true, 'catmullrom', 0.35);
  const point = new THREE.Vector3(), tangent = new THREE.Vector3(), local = new THREE.Vector3();
  const look = new THREE.Vector3(), follow = new THREE.Vector3(), aim = new THREE.Object3D();
  const savedLocal = bird.position.clone(), savedRotation = bird.rotation.clone();
  const basePlayer = town.updatePlayer, baseZone = town.setZone, baseMode = town.setMode;
  const baseExit = town.onExit, baseModal = town.setModal, baseInter = town.allInter;
  let ride = null, disposed = false;

  const nearby = () => town.zone === 'town' && Math.hypot(town.pos.x - departure.x, town.pos.z - departure.z) < 3.5;
  const allowed = () => !disposed && !ride && nearby() && town.active && !game.busy && !town.photoOn && !town.decor.active && town.camMode === 'play';
  const noInput = () => { town.keys.clear(); town.moveTo = null; town.stick.x = town.stick.y = 0; town.cur = null; town.curLabel = null; bus.emit('prompt', null); };

  function applyRider(dt = 0) {
    if (!ride) return;
    const p = town.player;
    p.setPose('idle'); p.targetMove = p.move = 0;
    p.update(dt);
    p.root.position.copy(point).add(new THREE.Vector3(0, 0.17, 0));
    p.root.rotation.set(0, ride.heading + Math.PI / 2, 0);
    p.body.position.y = 0.43; p.body.rotation.x = -0.04;
    p.legL.rotation.x = p.legR.rotation.x = -Math.PI / 2;
    p.armL.rotation.x = p.armR.rotation.x = -0.45;
    p.armL.rotation.z = -0.08; p.armR.rotation.z = 0.08;
    if (p.shadowBlob) p.shadowBlob.visible = false;
    town.pos.copy(point); town.pos.y = 0;
  }

  function end(reason = 'complete') {
    if (!ride) return false;
    const old = ride; ride = null;
    stand.userData.riding = false; stand.userData.fly = 0;
    bird.position.copy(savedLocal); bird.rotation.copy(savedRotation);
    bird.userData.flap?.(0, 0);
    town.pos.copy(old.pos); town.player.root.position.copy(old.pos);
    town.player.root.rotation.copy(old.rotation); town.player.setPose(old.pose);
    town.player.update(0); town.player.body.position.y = old.bodyY;
    town.player.legL.rotation.x = town.player.legR.rotation.x = 0;
    if (town.player.shadowBlob) town.player.shadowBlob.visible = old.shadowVisible;
    town.faceTarget = old.face; town.lock = old.lock;
    town.camYaw = old.camYaw; town.camPitch = old.camPitch; town.zoom = old.zoom;
    Object.assign(town.rig, old.rig); Object.assign(town.goal, old.goal);
    town.cine = old.cine; town.camera.position.copy(old.cameraPosition); town.camera.quaternion.copy(old.cameraQuaternion);
    town.camera.fov = old.fov; town.camera.near = old.near; town.camera.updateProjectionMatrix();
    baseMode.call(town, old.mode); baseModal.call(town, old.modal); town.camSnap = false;
    game.busy = old.busy; noInput();
    old.overlay.remove(); ui.showHUD(old.hudVisible);
    town.renderOptimizer?.invalidateBounds();
    if (reason === 'complete' || reason === 'return') ui.toast(reason === 'complete' ? '绕小镇飞了一圈，大纸鹤稳稳回到了原地' : '大纸鹤已带你回到出发处');
    return true;
  }

  function step(dt, time = 0) {
    if (!ride) return;
    if (!town.active || town.zone !== 'town' || town.camMode !== 'craneRide') { end('exit'); return; }
    ride.elapsed = Math.min(CRANE_RIDE_SECONDS, ride.elapsed + Math.max(0, dt));
    const elapsed = ride.elapsed;
    let targetHeading;
    if (elapsed < RISE) {
      point.copy(departure).lerp(cruise, smooth(elapsed / RISE));
      route.getTangentAt(0, tangent);
      targetHeading = Math.atan2(-tangent.z, tangent.x);
    } else if (elapsed < RISE + LAP) {
      const progress = smooth((elapsed - RISE) / LAP);
      route.getPointAt(progress, point); route.getTangentAt(progress, tangent);
      targetHeading = Math.atan2(-tangent.z, tangent.x);
    } else {
      point.copy(cruise).lerp(departure, smooth((elapsed - RISE - LAP) / RISE));
      targetHeading = stand.rotation.y;
    }
    const delta = Math.atan2(Math.sin(targetHeading - ride.heading), Math.cos(targetHeading - ride.heading));
    ride.heading += delta * (1 - Math.exp(-2.2 * dt));
    local.copy(point); stand.worldToLocal(local); bird.position.copy(local);
    bird.rotation.set(0, ride.heading - stand.rotation.y, 0);
    bird.userData.flap?.(time * 4.2, 0.19);
    applyRider(0);
    ride.progress.textContent = elapsed < RISE ? '正在平稳起飞' : elapsed >= RISE + LAP ? '正在返回出发处' : `环镇飞行 · ${Math.min(100, Math.round((elapsed - RISE) / LAP * 100))}%`;
    if (elapsed >= CRANE_RIDE_SECONDS) end();
  }

  function start() {
    if (!allowed() || ui.modals) return false;
    game.cancelGuidance?.();
    const progress = h('span', { role: 'status', 'aria-live': 'off' }, '正在平稳起飞');
    const back = h('button', { type: 'button', class: 'btn alt sm', 'data-crane-return': '', onclick: () => end('return') }, '提前返回');
    const overlay = h('div', { class: 'crane-ride-overlay', style: {
      position: 'fixed', inset: '0', zIndex: '90', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-end', padding: 'max(16px, env(safe-area-inset-top)) 14px max(20px, env(safe-area-inset-bottom))',
      pointerEvents: 'auto', touchAction: 'none', boxSizing: 'border-box',
    } }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '100%', flexWrap: 'wrap', justifyContent: 'center', padding: '10px 16px', borderRadius: '24px', background: 'rgba(255,249,239,.94)', color: '#655047', boxShadow: '0 3px 16px #4f3b3424' } }, progress, back));
    ride = { elapsed: 0, progress, overlay, heading: stand.rotation.y,
      pos: town.pos.clone(), rotation: town.player.root.rotation.clone(), face: town.faceTarget,
      pose: town.player.pose, bodyY: town.player.body.position.y, shadowVisible: town.player.shadowBlob?.visible,
      busy: game.busy, modal: town.modal, mode: town.camMode, lock: town.lock,
      hudVisible: !ui.hud.classList.contains('off'), cine: town.cine, camYaw: town.camYaw, camPitch: town.camPitch,
      zoom: town.zoom, rig: { ...town.rig }, goal: { ...town.goal }, fov: town.camera.fov, near: town.camera.near,
      cameraPosition: town.camera.position.clone(), cameraQuaternion: town.camera.quaternion.clone(),
    };
    point.copy(departure); stand.userData.fly = 0; stand.userData.riding = true;
    game.busy = true; baseMode.call(town, 'craneRide'); baseModal.call(town, true); town.lock = 0;
    noInput(); ui.showHUD(false); ui.root.append(overlay);
    town.cine = (_time, _dt, camera) => {
      if (!ride) return;
      const entrance = smooth(ride.elapsed / RISE), exit = smooth((CRANE_RIDE_SECONDS - ride.elapsed) / RISE);
      const blend = Math.min(entrance, exit);
      follow.copy(point).add(new THREE.Vector3(9, 6.5, 11));
      look.copy(point).y += 0.9;
      aim.position.copy(follow); aim.lookAt(look); aim.rotateY(Math.PI);
      camera.position.copy(ride.cameraPosition).lerp(follow, blend);
      camera.quaternion.copy(ride.cameraQuaternion).slerp(aim.quaternion, blend);
    };
    applyRider(0); audio.sfx('success');
    S.tut.craneRide = 1; save();
    town.renderOptimizer?.invalidateBounds();
    return true;
  }

  function panel() {
    if (!allowed() || ui.modals) return false;
    let modal;
    const button = h('button', { type: 'button', class: 'btn', 'data-crane-board': '', onclick: () => { modal.close(true); start(); } }, '乘坐 · 环镇一周');
    modal = ui.modal(h('div', { class: 'crane-ride-intro' }, h('h2', {}, '大纸鹤环镇旅行'),
      h('p', {}, '坐上诺诺伊检修好的大纸鹤，从广场起飞，掠过屋顶、海岸和小镇街道，再回到你上鹤前站的位置。'),
      h('p', {}, '约 42 秒，免费乘坐。旅途中镜头自动跟随，移动和其他操作暂时停用；想提前结束，点“提前返回”即可安全回到出发处。'),
      h('div', { class: 'row' }, button)), { ribbon: S.tut.craneRide ? '小镇旅行' : '第一次乘坐', cls: 'live-modal' });
    return modal;
  }

  const tick = (time, dt) => step(dt, time);
  const wrappedPlayer = function (dt) { if (ride) { noInput(); applyRider(dt); return; } return basePlayer.call(this, dt); };
  const wrappedZone = function (...args) { if (ride) end('exit'); return baseZone.apply(this, args); };
  const wrappedMode = function (mode) { if (ride && mode !== 'craneRide') end('exit'); return baseMode.call(this, mode); };
  const wrappedExit = function (...args) { end('exit'); return baseExit.apply(this, args); };
  const wrappedModal = function (on) { return baseModal.call(this, ride ? true : on); };
  const wrappedInter = function () { return ride ? [] : baseInter.call(this); };
  town.updatePlayer = wrappedPlayer; town.setZone = wrappedZone; town.setMode = wrappedMode;
  town.onExit = wrappedExit; town.setModal = wrappedModal; town.allInter = wrappedInter;
  town.ticks.push(tick);
  const it = { id: 'craneRide', x: departure.x, z: departure.z + 1.8, r: 2, prio: 0.4, label: '乘坐大纸鹤', sub: '免费环镇一周，自动回到原地', act: panel };
  town.inter.push(it);
  const off = bus.on('reset', () => end('exit'));
  const api = { start, panel, end, step, duration: CRANE_RIDE_SECONDS, departure: departure.clone(), get active() { return !!ride; }, get elapsed() { return ride?.elapsed || 0; },
    dispose() {
      end('exit'); disposed = true; off(); town.ticks = town.ticks.filter(fn => fn !== tick); town.inter = town.inter.filter(entry => entry !== it);
      for (const [name, wrapped, base] of [['updatePlayer', wrappedPlayer, basePlayer], ['setZone', wrappedZone, baseZone], ['setMode', wrappedMode, baseMode], ['onExit', wrappedExit, baseExit], ['setModal', wrappedModal, baseModal], ['allInter', wrappedInter, baseInter]]) if (town[name] === wrapped) town[name] = base;
      if (town.craneRide === api) delete town.craneRide;
    },
  };
  town.craneRide = api; return api;
}
