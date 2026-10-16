// 相机商人莱拉 + 拍照系统。
// 相机：解锁拍照（暖暖举着相机自拍，也能翻过来拍别人）；自拍杆：能把镜头拉远拉近；相机支架：把相机立在地上，人走进画面里拍。
// 同人原创的小镇日常：造型对照游戏内画面，台词和道具为原创。
import { THREE, cbox, box, cyl, group, mat, glow, textPlane } from '../core/kit.js';
import { S, bus, save, spend, stat } from '../core/state.js';
import { controls } from '../core/preferences.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { h } from '../core/util.js';
import { icon, coinIco } from '../core/icons.js';
import { Character, outfitToLook, LAILA_LOOK } from '../models/character.js';
import { DEFAULT_OUTFIT } from '../data.js';
import { VISITORS, stand, near, head, btn, price, archBtn } from './visitors.js';
import { PHOTO_POSES, photoPose } from './photo-poses.js';
import { festivalDialogue } from './festival-dialogue.js';

const ns = { cast: false, receive: false };
export const GEAR = [
  { id: 'camera', name: '小镇相机', price: 1200, desc: '解锁拍照：暖暖举着相机自拍，也能翻过来拍风景和别人。' },
  { id: 'stick', name: '自拍杆', price: 800, need: 'camera', desc: '拍照时可以把镜头拉远拉近，把身后的风景也拍进去。' },
  { id: 'tripod', name: '相机支架', price: 1500, need: 'camera', desc: '把相机立在地上固定住，暖暖可以走进画面里，三秒后自动按快门。' },
];

// ————— 模型 —————
function cameraModel() {
  const g = group();
  g.add(cbox(0.5, 0.32, 0.22, '#5a4a40', 0, 0, 0, { r: 0.05 }));
  g.add(cbox(0.5, 0.1, 0.23, '#d9b98a', 0, 0.24, 0, { r: 0.03 }));
  g.add(cyl(0.13, 0.13, 0.14, '#3a2f2b', 0, 0.16, 0.14, { seg: 14, rx: Math.PI / 2 }));
  g.add(cyl(0.09, 0.09, 0.03, mat('#8fd0f5', { rough: 0.1, metal: 0.3 }), 0, 0.16, 0.2, { seg: 14, rx: Math.PI / 2, ...ns }));
  g.add(cbox(0.12, 0.07, 0.1, '#e2623c', -0.14, 0.34, 0, { r: 0.02 }));
  g.add(cbox(0.1, 0.06, 0.08, '#fff6dc', 0.15, 0.34, 0.02, { r: 0.02 }));
  return g;
}
function stickModel() {
  const g = group();
  g.add(box(0.075, 0.32, 0.075, '#e2623c', 0, 0, 0, { r: 0.03 }));
  g.add(box(0.045, 0.7, 0.045, '#cfd6e0', 0, 0.32, 0, { r: 0.015 }));
  g.add(box(0.03, 0.42, 0.03, '#eef1f6', 0, 1.02, 0, { r: 0.01 }));
  g.add(cbox(0.2, 0.05, 0.08, '#5a4a40', 0, 1.45, 0, { r: 0.02 }));
  const c = cameraModel(); c.scale.setScalar(0.5); c.position.set(0, 1.5, 0); g.add(c);
  g.rotation.z = -0.5;
  const w = group(); w.add(g); return w;
}
// 三脚架：三条腿从顶上的云台座向外撑开，中间一根可升降的中轴和三根拉杆，顶上是带手柄的云台
function tripodModel(withCam = true) {
  const g = group();
  const H = 1.12, WOODC = '#8a6a45', METAL = '#5a4a40';
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const yawG = group(0, H, 0); yawG.rotation.y = a;
    const leg = group(0.05, 0, 0); leg.rotation.z = 0.36; // 腿从顶上往外、往下撑
    leg.add(cbox(0.06, 0.62, 0.06, WOODC, 0, -0.31, 0, { r: 0.02 }));
    leg.add(cbox(0.045, 0.6, 0.045, '#a9865c', 0, -0.9, 0, { r: 0.015 }));
    leg.add(cbox(0.075, 0.05, 0.075, METAL, 0, -0.6, 0, { r: 0.015 }));
    leg.add(cbox(0.07, 0.06, 0.07, '#3a2f2b', 0, -1.19, 0, { r: 0.02 }));
    yawG.add(leg);
    // 拉杆：从中轴下端连到腿的中段
    const brace = cbox(0.3, 0.025, 0.025, METAL, 0.17, -0.6, 0, { r: 0.008, rz: 0.2 });
    yawG.add(brace);
    g.add(yawG);
  }
  g.add(cyl(0.035, 0.035, 0.62, '#cfd6e0', 0, H - 0.56, 0, { seg: 8 }));
  g.add(cyl(0.1, 0.12, 0.09, METAL, 0, H - 0.03, 0, { seg: 10 }));
  g.add(cyl(0.06, 0.06, 0.07, '#cfd6e0', 0, H + 0.06, 0, { seg: 8 }));
  g.add(cbox(0.2, 0.04, 0.14, METAL, 0, H + 0.15, 0, { r: 0.012 }));
  g.add(cbox(0.03, 0.03, 0.3, METAL, 0.09, H + 0.1, -0.16, { r: 0.01, rx: 0.5 }));
  g.add(cbox(0.045, 0.045, 0.1, '#e2623c', 0.09, H + 0.03, -0.31, { r: 0.015, rx: 0.5 }));
  if (withCam) { const c = cameraModel(); c.scale.setScalar(0.7); c.position.set(0, H + 0.17, 0); g.add(c); }
  return g;
}
function stall() {
  const g = group();
  g.add(box(1.9, 0.76, 0.8, '#6b6b4e', 0, 0, 0, { r: 0.08 }));
  g.add(box(2.04, 0.08, 0.94, '#d9b98a', 0, 0.76, 0, { r: 0.03 }));
  const t = textPlane('拍照道具', { color: '#fff6dc', height: 0.22, size: 44 });
  t.position.set(0, 0.42, 0.41);
  g.add(t);
  [-0.6, 0, 0.55].forEach((x, i) => { const c = cameraModel(); c.scale.setScalar(0.6 + (i % 2) * 0.1); c.position.set(x, 0.84, 0.05); c.rotation.y = (i - 1) * 0.3; g.add(c); });
  const tp = tripodModel(); tp.position.set(1.5, 0, 0.2); tp.rotation.y = -0.5; g.add(tp);
  // 身后拉一根绳，夹着几张洗好的照片
  for (const sx of [-1, 1]) g.add(box(0.07, 2.3, 0.07, '#8a6a45', sx * 1.05, 0, -0.5, { r: 0.025 }));
  const photos = [];
  for (let i = 0; i < 6; i++) {
    const u = i / 5, x = -0.9 + u * 1.8, y = 2.16 - Math.sin(u * Math.PI) * 0.18;
    const ph = group(x, y, -0.5);
    ph.add(cbox(0.3, 0.36, 0.02, '#ffffff', 0, -0.2, 0, { r: 0.01, ...ns }));
    ph.add(cbox(0.24, 0.22, 0.022, ['#8fd0f5', '#ffc2d6', '#a9e3a0', '#ffe27a', '#c9b6f2', '#ffb38a'][i], 0, -0.14, 0.002, ns));
    ph.add(cbox(0.05, 0.08, 0.04, '#e2623c', 0, 0, 0, { r: 0.01 }));
    ph.userData.ph = i; g.add(ph); photos.push(ph);
  }
  g.add(cbox(2.1, 0.02, 0.02, '#8a6a45', 0, 2.1, -0.5, ns));
  g.userData.dyn = photos;
  g.userData.tick = (time) => photos.forEach((p) => { p.rotation.z = Math.sin(time * 1.3 + p.userData.ph) * 0.1; });
  return g;
}
const gearIco = (id) => icon('gear:' + id, () => (id === 'camera' ? cameraModel() : id === 'stick' ? stickModel() : tripodModel()), { yaw: 0.5, pitch: 0.3 });
// 商品缩略图使用真实角色动作，只渲染到图标；预览不解锁姿势，也不计拍照次数。
const poseIco = pose => icon('photo-pose:' + pose.id, () => {
  const ch = new Character(outfitToLook(DEFAULT_OUTFIT));
  ch.t = ch.phase = 0; ch.blinkT = 20; ch.setPose(pose.motion);
  for (let i = 0; i < 24; i++) ch.update(1 / 30);
  return ch.root;
}, { yaw: 0.2, pitch: 0.12, zoom: 1.05 });
export function ownsPhotoPose(id) {
  const pose = photoPose(id);
  return !!pose && (!pose.price || (S.live.photo.poses || []).includes(id));
}
const canShop = game => app.view === game.town && !game.busy && !game.town.decor.active && !game.town.photoOn && near(game, VISITORS.laila);
let buyingPose = false;
export function buyPhotoPose(game, id) {
  const pose = photoPose(id), fail = error => ({ ok: false, error });
  if (!pose?.price) return fail('这个姿势无需购买');
  if (!canShop(game)) return fail('走到莱拉的摊子前再购买姿势吧');
  if (!S.live.photo.camera) return fail('先拥有小镇相机，再学习拍照姿势');
  if (ownsPhotoPose(id)) return fail('已经学会这个姿势，不用重复购买');
  if (buyingPose) return fail('正在学习，请稍等一下');
  buyingPose = true;
  try {
    if (!spend(pose.price)) return fail('噗灵不足，先攒一点再来吧');
    S.live.photo.poses = [...(S.live.photo.poses || []), id];
    save(); bus.emit('photoPosesChanged'); audio.sfx('buy');
    return { ok: true, pose };
  } finally { buyingPose = false; }
}

// ————— 莱拉的摊子 —————
const LINES = ['最近在小镇拍到好多有意思的瞬间，真想马上拿去琢磨新道具……咳，跑题了。要看看拍照的家伙吗？', '光线好的时候别光顾着赶路，停下来拍一张。照片不会骗人，它只是比你记得更清楚。', '拍别人之前先打个招呼，这是我的规矩。大喵除外，它不听。'];
export function lailaPanel(game) {
  const ui = game.ui, L = VISITORS.laila;
  let m, offDay, say = null;
  const body = h('div', { class: 'cn photo-shop' });
  const greeting = h('p', { class: 'say festival-say' });
  const refreshGreeting = () => {
    const line = festivalDialogue('laila');
    greeting.hidden = !line; greeting.textContent = line ? `「${line}」` : '';
  };
  const render = () => {
    const own = S.live.photo;
    refreshGreeting();
    body.replaceChildren(head(L), greeting, h('p', { class: 'say' }, `「${say || LINES[(S.gday || 0) % LINES.length]}」`),
      h('div', { class: 'shop-list' }, GEAR.map((it) => {
        const has = !!own[it.id], locked = it.need && !own[it.need];
        return h('div', { class: 'cn-block shop-item' + (has ? ' ok' : '') },
          h('img', { src: gearIco(it.id), alt: '' }),
          h('div', {}, h('h4', {}, it.name, has && h('em', {}, '已拥有')), h('p', {}, it.desc)),
          has ? h('span', { class: 'rw' }, '在用了') : locked ? h('span', { class: 'rw' }, '先买相机') : btn('gold sm', ['买 ', price(it.price)], () => {
            if (!canShop(game)) { ui.toast('走到莱拉的摊子前再买吧'); return; }
            if (S.live.photo[it.id] || (it.need && !S.live.photo[it.need]) || !spend(it.price)) return;
            S.live.photo[it.id] = true; save(); stat('photo_gear');
            audio.sfx('buy');
            say = it.id === 'camera' ? '好眼光！右下角多了个相机按钮，点它就能拍。先对着自己来一张？' : it.id === 'stick' ? '有了它，拍照时拖右边的滑条就能拉远拉近，身后的风景也装得下。' : '把它往地上一立，按「放下支架」，人走进去，三秒后咔嚓。';
            ui.toast(`买下了「${it.name}」`, { icon: gearIco(it.id), kind: 'live-reward' });
            bus.emit('photoGear'); render();
          }));
      })),
      h('h3', { class: 'photo-shop-title' }, '莱拉的镜头姿势课'),
      h('p', { class: 'fine' }, '站好、开心、转圈免费使用。新姿势一次购买，永久学会；自拍和支架中都会持续循环。图片是动作中的一个瞬间。'),
      h('div', { class: 'photo-pose-shop' }, PHOTO_POSES.filter(p => p.price > 0).map(pose => {
        const has = ownsPhotoPose(pose.id);
        return h('div', { class: 'photo-pose-sale' },
          h('img', { src: poseIco(pose), alt: pose.desc }),
          h('div', {}, h('h4', {}, pose.name), h('p', {}, pose.desc),
            has ? h('span', { class: 'photo-pose-owned' }, '已学会') : h('button', {
              class: 'btn gold sm', 'data-buy-pose': pose.id, disabled: !own.camera,
              onclick: () => {
                const result = buyPhotoPose(game, pose.id);
                if (!result.ok) { ui.toast(result.error); render(); return; }
                say = `学会了「${pose.name}」！打开相机，在姿势栏直接选它就行。`;
                ui.toast(`学会了「${pose.name}」`, { kind: 'live-reward' }); render();
              },
            }, own.camera ? ['学会 · ', price(pose.price)] : '先买相机')));
      })),
      h('div', { class: 'row cn-act' }, archBtn(game, 'laila', () => m), own.camera ? btn('', '现在就拍一张', () => { m.close(true); photo.enter(game); }) : btn('alt sm', '下次再来', () => m.close())));
  };
  render();
  m = ui.modal(body, { ribbon: '来访', cls: 'live-modal', onClose: () => offDay?.() });
  offDay = bus.on('newDay', refreshGreeting);
  return m;
}

// ————— 拍照模式 —————
// 三种机位：自拍（相机在暖暖面前回头看她）、拍别人（从她眼前往外看）、支架（相机立在原地不动）。
// 任何机位下都可以走动；整张画面保持清晰（拍照期间关掉小镇平时的移轴模糊），出片时再提高分辨率重画一帧。
const PHOTO_FILTERS = [
  { id: 'none', name: '原色', css: '' },
  { id: 'warm', name: '暖阳', css: 'sepia(0.18) saturate(1.18) brightness(1.03)' },
  { id: 'cool', name: '清透', css: 'saturate(1.12) contrast(1.04) hue-rotate(-6deg) brightness(1.03)' },
  { id: 'dream', name: '柔梦', css: 'saturate(1.15) brightness(1.05) contrast(0.96)' },
];
const P = { on: false, mode: 'selfie', yaw: 0, pitch: 0.1, dist: 2.4, fov: 50, fixed: null, timer: 0, pose: 'stand', grid: false, filterIdx: 0 };
const playback = { time: 0, active: false, handheld: true };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let el = null, game0 = null, tripodObj = null, saved = null, last = null;
const isMoving = town => !!(town.stick.x || town.stick.y || town.moveTo || town.keys.has('KeyW') || town.keys.has('KeyA') || town.keys.has('KeyS') || town.keys.has('KeyD') || town.keys.has('ArrowUp') || town.keys.has('ArrowDown') || town.keys.has('ArrowLeft') || town.keys.has('ArrowRight'));
function syncPose(town) {
  const posing = P.mode === 'selfie' || !!P.fixed, moving = isMoving(town);
  playback.active = posing && !moving && !town.modal;
  playback.handheld = P.mode === 'selfie' && !P.fixed;
  town.player.setPose(posing && !moving ? photoPose(P.pose).motion : 'idle');
  return moving;
}

// 存照片：安卓 App 直接写进系统相册；浏览器和电脑版使用 Blob 下载。
// 部分手机浏览器会忽略 data: URL 的 download 属性，所以优先转成 blob: URL，
// 失败时保留原图链接，让玩家可以打开图片后长按保存。
function photoBlob(url) {
  try {
    const comma = String(url).indexOf(',');
    if (comma < 0) return null;
    const meta = String(url).slice(0, comma);
    const raw = atob(String(url).slice(comma + 1));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const type = /data:([^;,]+)/i.exec(meta)?.[1] || 'image/jpeg';
    return new Blob([bytes], { type });
  } catch { return null; }
}

// 尝试把照片交给系统分享面板。分享能力是可选的：桌面版、部分浏览器
// 不支持带文件分享时，调用方会回退到 Blob 下载和手动长按保存。
async function sharePhoto(url, name) {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return '';
  const blob = photoBlob(url);
  if (!blob || typeof File !== 'function') return '';
  try {
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
    if (!navigator.canShare({ files: [file] })) return '';
    await navigator.share({ files: [file], title: '暖暖的方块小镇照片' });
    return '已打开系统分享面板';
  } catch (error) {
    // 用户主动关掉分享面板不应被提示成错误；其它失败交给下载回退。
    if (error?.name === 'AbortError') return '已取消分享';
    return '';
  }
}

export function savePhoto(url, name) {
  try {
    const nat = window.NikkiNative;
    if (nat && nat.savePhoto && nat.savePhoto(url.split(',')[1], name)) return '已保存到相册';
  } catch (e) { /* 走下面的下载 */ }
  try {
    const blob = photoBlob(url);
    const href = blob && URL.createObjectURL ? URL.createObjectURL(blob) : url;
    const a = h('a', { href, download: name, style: { position: 'fixed', left: '-10000px', width: '1px', height: '1px' } });
    document.body.append(a); a.click(); setTimeout(() => a.remove(), 500);
    if (blob && href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(href), 60000);
    return /Electron/i.test(navigator.userAgent) ? '已发起保存到「图片/暖暖的方块小镇」' : app.mobile ? '已发起保存，请查看下载通知；没有下载时可长按照片保存' : '已发起下载，请查看下载目录';
  } catch (e) { return ''; }
}

export const photo = {
  get on() { return P.on; },
  get currentPose() { return P.pose; },
  get timer() { return P.timer; },
  get poseTime() { return playback.time; },
  enter(game) {
    const town = game.town, ui = game.ui;
    if (P.on || !S.live.photo.camera || game.busy || app.view !== town || town.decor.active) return;
    game0 = game;
    Object.assign(P, { on: true, mode: 'selfie', fixed: null, dist: 2.4, pitch: 0.1, fov: 50, timer: 0, pose: 'stand', grid: false, filterIdx: 0 });
    playback.time = 0; playback.active = true; playback.handheld = true;
    town.player.photoPlayback = playback;
    P.yaw = town.player.root.rotation.y;
    saved = { fov: town.camera.fov, near: town.camera.near, cine: town.cine, bodyYaw: town.player.body.rotation.y };
    town.photoOn = true;
    app.finish.uniforms.amount.value = 0;
    ui.hud.classList.add('photo');
    town.moveTo = null; town.keys.clear();
    syncPose(town);
    town.cine = (time, dt, cam) => this.rig(town, cam, dt);
    this.buildUI(game);
    ui.tutorial('photo', false, { valid: () => this.on });
    audio.sfx('equip');
  },
  exit() {
    if (!P.on) return;
    const town = game0.town;
    P.on = false; P.timer = 0; P.pose = 'stand'; P.grid = false; P.filterIdx = 0; playback.active = false; playback.time = 0;
    if (app.canvas?.style) app.canvas.style.filter = '';
    town.photoOn = false;
    town.cine = saved.cine || null;
    town.camera.near = saved.near; town.camera.fov = saved.fov; town.camera.updateProjectionMatrix();
    app.fitCamera(town);
    town.frozen = !!town.modal; town.camSnap = true;
    town.player.root.visible = true; town.momo.root.visible = true;
    town.player.setPose('idle'); // 收起相机，姿势回到平常的样子
    delete town.player.photoPlayback;
    town.player.body.rotation.y = saved.bodyYaw; town.player.photoTurning = false;
    town.stick.x = 0; town.stick.y = 0;
    if (town.markers) for (const mk of town.markers) mk.visible = true;
    if (tripodObj) { town.scene.remove(tripodObj); tripodObj = null; }
    game0.ui.hud.classList.remove('photo');
    el && el.remove(); el = null;
    audio.sfx('tab');
  },
  // 每帧摆镜头
  rig(town, cam, dt = 1 / 60) {
    if (!P.on) return;
    const p = town.pos, pl = town.player;
    if (town.markers) for (const mk of town.markers) mk.visible = false;
    town.frozen = !!town.modal; // 拍照时也能走动
    const moving = syncPose(town);
    if (P.fixed) {
      cam.position.copy(P.fixed.pos); cam.quaternion.copy(P.fixed.quat);
      pl.root.visible = true; town.momo.root.visible = true;
      town.rig.yaw = P.fixed.yaw;
    } else {
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
      if (P.mode === 'selfie') {
        pl.root.visible = true; town.momo.root.visible = true;
        town.rig.yaw = P.yaw; // 轮盘 / 方向键按镜头方向走
        if (!moving) { town.faceTarget = P.yaw; pl.root.rotation.y = P.yaw; }
        const hy = p.y + 1.12;
        // 竖屏画面窄，同样的距离脸会撑满，按宽高比把相机再拉远一些
        const dist = P.dist * Math.max(1, Math.min(2.4, 1.25 / cam.aspect));
        cam.position.set(p.x + sy * cp * dist, Math.max(p.y + 0.25, hy + 0.08 + sp * dist), p.z + cy * cp * dist);
        cam.lookAt(p.x, hy - Math.min(0.4, (P.dist - 2.0) * 0.12), p.z);
      } else {
        pl.root.visible = false; town.momo.root.visible = false; // 从暖暖眼前往外看：自己和脚边的大喵都不入镜
        town.rig.yaw = P.yaw + Math.PI;
        if (!moving) { town.faceTarget = P.yaw; pl.root.rotation.y = P.yaw; }
        cam.position.set(p.x + sy * 0.3, p.y + 1.2, p.z + cy * 0.3);
        cam.lookAt(cam.position.x + sy * cp * 10, cam.position.y - sp * 10, cam.position.z + cy * cp * 10);
      }
    }
    cam.fov = P.fov; cam.near = 0.12; cam.updateProjectionMatrix();
    app.finish.uniforms.amount.value = 0;
    if (P.timer > 0 && !town.modal) {
      P.timer -= dt;
      const n = Math.ceil(P.timer);
      if (el && el._count.textContent !== String(n)) { el._count.textContent = n > 0 ? n : ''; if (n > 0) audio.sfx('tick'); }
      if (P.timer <= 0) this.shoot();
    }
  },
  setPose(id) {
    if (Number.isInteger(id)) id = PHOTO_POSES[id]?.id;
    const pose = photoPose(id);
    if (!P.on || !game0 || app.view !== game0.town || (!P.fixed && P.mode !== 'selfie') || !pose || !ownsPhotoPose(id)) return false;
    if (P.pose !== id) { P.pose = id; playback.time = 0; }
    syncPose(game0.town);
    this.refreshUI(); return true;
  },
  setFixed(on) {
    if (!P.on || !game0 || app.view !== game0.town || (on && !S.live.photo.tripod) || !!P.fixed === !!on) return false;
    const town = game0.town, ui = game0.ui;
    if (on) {
      const fwd = new THREE.Vector3(); town.camera.getWorldDirection(fwd);
      P.fixed = { pos: town.camera.position.clone(), quat: town.camera.quaternion.clone(), yaw: Math.atan2(-fwd.x, -fwd.z) };
      const surface = town.yardHeightAt?.(P.fixed.pos.x, P.fixed.pos.z) || 0;
      P.fixed.pos.y = Math.max(P.fixed.pos.y, surface + 1.2);
      tripodObj = tripodModel(false);
      tripodObj.userData.photoTripod = true;
      // 使用相机正下方的实际地面 / 楼板高度；固定后不随人物上下楼漂移。
      // 只延长竖向支撑，避免从高处俯拍时把脚架底座放大到整个平台。
      const bounds = new THREE.Box3().setFromObject(tripodObj);
      const scaleY = (P.fixed.pos.y - surface - 0.22) / (bounds.max.y - bounds.min.y);
      const widthScale = clamp(scaleY, 0.7, 1.8);
      tripodObj.scale.set(widthScale, scaleY, widthScale);
      tripodObj.position.set(P.fixed.pos.x, surface - bounds.min.y * scaleY, P.fixed.pos.z);
      tripodObj.rotation.y = P.fixed.yaw + Math.PI;
      town.scene.add(tripodObj);
      ui.toast('支架放好了：走进画面摆好位置，按快门后 3 秒拍');
    } else {
      P.fixed = null; P.timer = 0;
      if (el) el._count.textContent = '';
      if (tripodObj) { town.scene.remove(tripodObj); tripodObj = null; }
      P.yaw = town.player.root.rotation.y;
    }
    syncPose(town); this.refreshUI(); return true;
  },
  press() {
    if (!P.on || !game0 || app.view !== game0.town || game0.town.modal) return false;
    if (P.timer > 0) return;
    if (P.fixed) { P.timer = 3; return; }
    this.shoot();
  },
  shoot() {
    if (!P.on || !game0 || app.view !== game0.town) return false;
    const town = game0.town, ui = game0.ui, cam = town.camera;
    P.timer = 0;
    if (el) el._count.textContent = '';
    if (tripodObj) tripodObj.visible = false;
    // 出片：把渲染分辨率临时提高（长边约 2400 像素），重画一帧再取图，拍完恢复
    const oldPR = app.pixelRatio, w = app.width, hh = app.height;
    let url = '';
    try {
      app.pixelRatio = clamp(2400 / Math.max(w, hh), oldPR, 3);
      app.resize();
      cam.fov = P.fov; cam.near = 0.12; cam.updateProjectionMatrix();
      app.finish.uniforms.amount.value = 0;
      if (app.usePost) app.composer.render(0); else app.renderer.render(town.scene, cam);
      url = app.canvas.toDataURL('image/jpeg', 0.93);
    } catch (e) { /* 取图失败 */ }
    app.pixelRatio = oldPR; app.resize();
    cam.fov = P.fov; cam.near = 0.12; cam.updateProjectionMatrix();
    if (tripodObj) tripodObj.visible = true;
    audio.tone({ f: 1800, f2: 900, dur: 0.06, vol: 0.12, type: 'square' });
    audio.tone({ f: 700, f2: 300, dur: 0.09, vol: 0.1, type: 'square', t: audio.now() + 0.07 });
    const flash = h('div', { class: 'photo-flash' });
    document.body.append(flash);
    setTimeout(() => flash.remove(), 420);
    if (!url) { ui.toast('这张没拍成，再试一次'); return; }
    S.live.photo.shots = (S.live.photo.shots || 0) + 1; stat('photos'); save();
    const n = S.live.photo.shots, name = `暖暖的方块小镇-照片${String(n).padStart(3, '0')}.jpg`;
    bus.emit('photoTaken', { shot: n, zone: town.zone, mode: P.mode, pose: P.pose, camera: town.camera, player: town.player.root });
    const msg = savePhoto(url, name);
    last = { url, name, n };
    // 左下角弹一张小拍立得，几秒后自己收起；点它可以放大看
    if (el) {
      el._thumb.replaceChildren(h('img', { src: url, alt: '' }), h('span', {}, msg || '保存失败，点开后长按图片保存'));
      el._thumb.classList.remove('show'); void el._thumb.offsetWidth; el._thumb.classList.add('show');
      el._shots.textContent = `已拍 ${n}`;
    }
  },
  view() {
    if (!last) return;
    const ui = game0.ui;
    let m;
    const share = h('button', { class: 'btn alt', onclick: async () => {
      const shared = await sharePhoto(last.url, last.name);
      if (shared) { ui.toast(shared); return; }
      const r = savePhoto(last.url, last.name);
      ui.toast(r || '保存未完成，请长按图片保存');
    } }, '分享照片');
    m = ui.modal(h('div', { class: 'photo-result' },
      h('div', { class: 'polaroid' }, h('a', { href: last.url, target: '_blank', rel: 'noopener', title: '打开照片后可长按保存' }, h('img', { src: last.url, alt: '刚拍的照片' })), h('span', {}, `小镇的第 ${last.n} 张照片 · 可长按图片保存`)),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('a', { class: 'btn gold photo-download', href: last.url, download: last.name, title: '下载照片；手机也可以长按上方图片保存' }, '下载照片'),
        share,
        h('button', { class: 'btn alt', onclick: () => { const r = savePhoto(last.url, last.name); ui.toast(r || '保存未完成，请长按图片保存'); } }, '再存一份'),
        h('button', { class: 'btn alt', onclick: () => m.close() }, '继续拍'))), { ribbon: '咔嚓', cls: 'live-modal' });
  },
  buildUI(game) {
    const ui = game.ui, own = S.live.photo;
    const b = (cls, label, fn) => h('button', { class: 'pbtn ' + cls, onclick: (e) => { e.stopPropagation(); audio.init(); audio.sfx('tab'); fn(); } }, label);
    const pad = h('div', { class: 'photo-pad' });
    const count = h('div', { class: 'photo-count' });
    const zoom = h('input', { type: 'range', min: 0, max: 100, value: 0, class: 'photo-zoom', 'aria-label': '镜头远近' });
    const setZoom = (k) => { k = clamp(k, 0, 1); if (P.mode === 'selfie' && !P.fixed) P.dist = 2.0 + k * 5; else P.fov = 62 - k * 40; zoom.value = Math.round(k * 100); };
    const zoomNow = () => (P.mode === 'selfie' && !P.fixed ? (P.dist - 2.0) / 5 : (62 - P.fov) / 40);
    zoom.addEventListener('input', () => setZoom(zoom.value / 100));
    let warned = 0;
    const needStick = () => { if (own.stick) return false; if (Date.now() - warned > 3000) { warned = Date.now(); ui.toast('想拉远拉近，要先在莱拉那里买一根自拍杆'); } return true; };
    // 拖动转镜头；滚轮 / 双指 = 远近（要有自拍杆）
    const pts = new Map();
    let pinch = 0;
    pad.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { pad.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器 */ } if (pts.size === 2) { const [a, c] = [...pts.values()]; pinch = Math.hypot(a.x - c.x, a.y - c.y); } });
    pad.addEventListener('pointermove', (e) => {
      const o = pts.get(e.pointerId);
      if (!o) return;
      if (pts.size >= 2) {
        o.x = e.clientX; o.y = e.clientY;
        const [a, c] = [...pts.values()], d = Math.hypot(a.x - c.x, a.y - c.y);
        if (pinch && Math.abs(d - pinch) > 4) { if (!needStick()) setZoom(zoomNow() + (pinch - d) * (P.mode === 'selfie' && !P.fixed ? 0.004 : -0.004)); pinch = d; }
        return;
      }
      const dx = e.clientX - o.x, dy = e.clientY - o.y;
      o.x = e.clientX; o.y = e.clientY;
      if (P.fixed) return;
      // 相机的屏幕右方始终对应 yaw 减小；拍别人时镜头前后翻转，
      // 不能把手势也反转。pitch 增大是低头，两种机位都与向下拖动一致。
      const sensitivity = controls().cameraSensitivity;
      P.yaw -= dx * (P.mode === 'selfie' ? 0.008 : 0.0048) * sensitivity;
      P.pitch = clamp(P.pitch + dy * 0.006 * sensitivity, P.mode === 'selfie' ? -0.25 : -0.7, P.mode === 'selfie' ? 1.0 : 0.6);
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    pad.addEventListener('wheel', (e) => { e.preventDefault(); if (!needStick()) setZoom(zoomNow() + (e.deltaY > 0 ? 0.06 : -0.06) * (P.mode === 'selfie' && !P.fixed ? 1 : -1)); }, { passive: false });
    const modeBtn = b('', '', () => { if (P.fixed) return; P.mode = P.mode === 'selfie' ? 'front' : 'selfie'; P.pitch = P.mode === 'selfie' ? 0.1 : 0; P.fov = 50; P.dist = 2.4; P.yaw += Math.PI; syncPose(game.town); this.refreshUI(); });
    const poseBtn = b('', '姿势', () => { posePanel.hidden = !posePanel.hidden; poseBtn.setAttribute('aria-expanded', String(!posePanel.hidden)); });
    poseBtn.setAttribute('aria-expanded', 'true'); poseBtn.setAttribute('aria-controls', 'photo-pose-panel');
    const poseNote = h('span', { class: 'photo-pose-note', 'aria-live': 'polite' });
    const poseList = h('div', { class: 'photo-pose-list', role: 'group', 'aria-label': '直接选择拍照姿势' }, PHOTO_POSES.map(pose => h('button', {
      class: 'photo-pose-option', 'data-photo-pose': pose.id, 'aria-pressed': 'false',
      onclick: () => {
        if (!ownsPhotoPose(pose.id)) { ui.toast(`「${pose.name}」可在莱拉处花 ${pose.price} 噗灵学会`); return; }
        this.setPose(pose.id);
      },
    }, h('img', { src: poseIco(pose), alt: '' }), h('b', {}, pose.name), h('small', {}, pose.price ? `${pose.price} 噗灵` : '免费'))));
    const posePanel = h('section', { id: 'photo-pose-panel', class: 'photo-pose-panel', 'aria-label': '拍照姿势' }, poseNote, poseList);
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'wheel']) posePanel.addEventListener(event, e => e.stopPropagation());
    poseList.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { poseList.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    const triBtn = b('', '', () => this.setFixed(!P.fixed));
    const gridBtn = b('', '九宫格', () => { P.grid = !P.grid; this.refreshUI(); });
    const cardBtn = b('', '明信片框', () => { P.postcard = !P.postcard; this.refreshUI(); });
    const lookBtn = b('', '👀看镜头', () => {
      const town = game.town;
      const camPos = town.camera.position;
      const pYaw = Math.atan2(camPos.x - town.pos.x, camPos.z - town.pos.z);
      town.faceTarget = pYaw;
      town.player.root.rotation.y = pYaw;
      if (town.momo?.root) {
        const mPos = town.momo.root.position;
        town.momo.root.rotation.y = Math.atan2(camPos.x - mPos.x, camPos.z - mPos.z);
      }
      ui.toast('暖暖与大喵已看向镜头 ✨');
    });
    const filterBtn = b('', '滤镜·原色', () => { P.filterIdx = (P.filterIdx + 1) % PHOTO_FILTERS.length; this.refreshUI(); });
    const shutter = h('button', { class: 'pshutter', 'aria-label': '快门', onclick: (e) => { e.stopPropagation(); audio.init(); this.press(); } }, h('i'));
    const thumb = h('button', { class: 'photo-thumb', 'aria-label': '看刚拍的照片', onclick: (e) => { e.stopPropagation(); this.view(); } });
    const shots = h('span', { class: 'pbtn ghost num' }, `已拍 ${own.shots || 0}`);
    const stampEl = h('div', { class: 'photo-postcard-stamp' }, h('b', {}, '📮 暖暖的方块小镇'), h('small', {}, 'COZY BLOCK TOWN · 旅途留念'));
    const frameEl = h('div', { class: 'photo-frame' }, stampEl);
    el = h('div', { class: 'photo-ui' }, pad, frameEl, count,
      h('div', { class: 'photo-top' }, h('span', { class: 'photo-tip' }), gridBtn, cardBtn, lookBtn, filterBtn, shots),
      h('button', { class: 'photo-exit', 'aria-label': '退出拍照', onclick: (e) => { e.stopPropagation(); audio.init(); this.exit(); } }, '✕ 退出'),
      own.stick ? h('label', { class: 'photo-zoomwrap' }, h('span', {}, '远'), zoom, h('span', {}, '近')) : null,
      thumb, posePanel,
      h('div', { class: 'photo-bar' }, modeBtn, poseBtn, shutter, own.tripod ? triBtn : h('span', { class: 'pbtn ghost' }, '支架未购买')));
    Object.assign(el, { _count: count, _pad: pad, _frame: frameEl, _grid: gridBtn, _card: cardBtn, _filter: filterBtn, _mode: modeBtn, _pose: poseBtn, _poseList: poseList, _poseNote: poseNote, _tri: triBtn, _tip: el.querySelector('.photo-tip'), _zoom: zoom, _zoomNow: zoomNow, _thumb: thumb, _shots: shots });
    ui.root.append(el);
    this.refreshUI();
  },
  refreshUI() {
    if (!el) return;
    const fixed = !!P.fixed;
    el._mode.textContent = P.mode === 'selfie' ? '自拍 → 拍别人' : '拍别人 → 自拍';
    el._mode.classList.toggle('off', fixed);
    el._mode.disabled = fixed;
    if (el._frame) {
      el._frame.classList.toggle('grid-on', !!P.grid);
      el._frame.classList.toggle('postcard-on', !!P.postcard);
    }
    if (el._grid) el._grid.setAttribute('aria-pressed', String(!!P.grid));
    if (el._card) el._card.setAttribute('aria-pressed', String(!!P.postcard));
    const flt = PHOTO_FILTERS[P.filterIdx] || PHOTO_FILTERS[0];
    if (el._filter) el._filter.textContent = `滤镜·${flt.name}`;
    if (app.canvas?.style) app.canvas.style.filter = flt.css;
    const canPose = P.mode === 'selfie' || fixed;
    el._poseNote.textContent = canPose ? `${photoPose(P.pose).name} · 循环播放，移动时暂停` : '正在拍别人，切回自拍或放下支架后继续动作';
    for (const button of el._poseList.children) {
      const id = button.dataset.photoPose, owned = ownsPhotoPose(id);
      button.disabled = !canPose;
      button.setAttribute('aria-pressed', String(id === P.pose && canPose));
      button.setAttribute('aria-disabled', String(!owned || !canPose));
      button.dataset.locked = String(!owned);
      button.querySelector('small').textContent = owned ? photoPose(id).price ? '已学会' : '免费' : `${photoPose(id).price} 噗灵`;
    }
    el._tri.textContent = fixed ? '收起支架' : '放下支架';
    el._tip.textContent = fixed ? '支架已固定 · 走进画面，按快门 3 秒后拍' : P.mode === 'selfie' ? '自拍 · 拖动画面换角度' : '拍别人 · 拖动画面转镜头';
    el._zoom.value = Math.round(clamp(el._zoomNow(), 0, 1) * 100);
    el.classList.toggle('fixed', fixed);
  },
};

export function installPhoto(game) {
  const town = game.town, ui = game.ui, L = VISITORS.laila;
  L.open = lailaPanel;
  town.place(stall(), L.x, L.z + 0.95, 0);
  town.addRect(L.x - 1.1, L.x + 1.9, L.z + 0.4, L.z + 1.5, 'live');
  const ch = stand(game, L, LAILA_LOOK, 0, '和莱拉说话 · 相机与拍照道具');
  ch.userData.it.z = L.z + 2.4;
  // 胸前挂着的相机
  const cam = cameraModel(); cam.scale.setScalar(0.42); cam.position.set(0, 0.2, 0.2); ch.torso.add(cam);
  // HUD 右下角的拍照按钮：买了相机才出现
  const shot = h('button', { class: 'shotbtn', 'aria-label': '拍照', onclick: () => { audio.init(); audio.sfx('click'); photo.enter(game); } }, h('img', { src: gearIco('camera'), alt: '' }), h('span', {}, '拍照'));
  ui.hud.append(shot);
  const refresh = () => shot.classList.toggle('on', !!S.live.photo.camera);
  refresh();
  bus.on('photoGear', refresh); bus.on('reset', () => { photo.exit(); refresh(); });
  bus.on('zoneChanged', () => photo.exit());
  bus.on('decorMode', (on) => { if (on) photo.exit(); });
  window.addEventListener('keydown', (e) => { if (P.on && e.code === 'Escape') photo.exit(); });
  window.__photo = photo;
}
