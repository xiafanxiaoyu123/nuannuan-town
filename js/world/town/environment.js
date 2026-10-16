// 灯光、天空和氛围对象的构建与逐帧更新；镇历推进和夜景表现保持同一路径。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { THREE, cbox, group, mat, glowMats } from '../../core/kit.js';
import * as P from '../../models/props.js';
import { app } from '../../core/app.js';
import { S, bus, save } from '../../core/state.js';
import { clamp, lerp, seeded } from '../../core/util.js';
import { daySeconds, creativeTimePaused } from '../../core/preferences.js';
import { HOME, HOUSE_POS } from './layout.js';

// 昼夜关键帧
const C = (h) => new THREE.Color(h);
const SKY = [
  { t: 0.0, top: C('#9ec9ff'), bot: C('#ffdbe6'), sun: C('#ffd9b8'), si: 2.2, hs: C('#fff4f0'), hg: C('#ffd9c8'), hi: 1.0, n: 0.2 },
  { t: 0.1, top: C('#79c2ff'), bot: C('#dff3ff'), sun: C('#fff4e0'), si: 2.7, hs: C('#f4fbff'), hg: C('#ffe2cf'), hi: 1.2, n: 0 },
  { t: 0.56, top: C('#79c2ff'), bot: C('#dff3ff'), sun: C('#fff4e0'), si: 2.7, hs: C('#f4fbff'), hg: C('#ffe2cf'), hi: 1.2, n: 0 },
  { t: 0.68, top: C('#8f9df2'), bot: C('#ffc6a6'), sun: C('#ffae78'), si: 2.2, hs: C('#ffe2e2'), hg: C('#ffc9b8'), hi: 0.95, n: 0.4 },
  { t: 0.77, top: C('#2a2e6e'), bot: C('#7377c4'), sun: C('#aebaff'), si: 1.0, hs: C('#99a4ff'), hg: C('#5a579c'), hi: 0.8, n: 1 },
  { t: 0.93, top: C('#2a2e6e'), bot: C('#7377c4'), sun: C('#aebaff'), si: 1.0, hs: C('#99a4ff'), hg: C('#5a579c'), hi: 0.8, n: 1 },
  { t: 1.0, top: C('#9ec9ff'), bot: C('#ffdbe6'), sun: C('#ffd9b8'), si: 2.2, hs: C('#fff4f0'), hg: C('#ffd9c8'), hi: 1.0, n: 0.2 },
];

export function buildLights(town) {
  town.hemi = new THREE.HemisphereLight(0xffffff, 0xffe9da, 1.9);
  town.sun = new THREE.DirectionalLight(0xfff4e0, 3);
  const s = town.sun;
  s.castShadow = true;
  s.shadow.mapSize.set(app.shadowSize, app.shadowSize);
  const c = s.shadow.camera;
  c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 90;
  s.shadow.bias = -0.0004;
  s.shadow.normalBias = 0.05;
  town.scene.add(town.hemi, s, s.target);
  town.nightLights = [[6, 3.4, 4], [HOUSE_POS.x, 3, HOUSE_POS.z + 4], [-5, 3.2, -9], [14.5, 3.2, -9], [22, 3.2, 3]].map(([x, y, z]) => {
    const l = new THREE.PointLight(0xffc98a, 0, 18, 1.5);
    l.position.set(x, y, z);
    town.scene.add(l);
    return l;
  });
}

export function buildSky(town) {
  town.skyU = { top: { value: C('#79c2ff') }, bot: { value: C('#dff3ff') } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: town.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, bot; varying vec3 vP;
          void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bot, top, smoothstep(-0.02, 0.55, h)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
    })
  );
  sky.renderOrder = -10;
  town.scene.add(sky);
  town.sky = sky;
  town.scene.fog = new THREE.Fog(0xdff3ff, 80, 260);
  // 星星
  const n = 260, pos = new Float32Array(n * 3);
  const rnd = seeded(99);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.3;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * 300;
    pos[i * 3 + 1] = Math.sin(e) * 300;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 300;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  town.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  town.scene.add(town.stars);
  // 月亮 / 太阳只做成天空里的一个发光方块
  town.moon = cbox(14, 14, 14, new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false, transparent: true }), -150, 170, -200, { r: 4, cast: false, receive: false });
  town.scene.add(town.moon);
}

export function buildAmbient(town) {
  const rnd = seeded(77);
  town.clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = P.cloud(1.2 + rnd() * 1.6);
    c.position.set(-90 + rnd() * 180, 15 + rnd() * 9, -70 + rnd() * 90);
    c.userData.sp = 0.5 + rnd() * 0.7;
    town.scene.add(c);
    town.clouds.push(c);
  }
  town.balloon = P.balloonAir();
  town.balloon.position.set(-38, 15, -34);
  town.balloon.scale.setScalar(1.4);
  town.scene.add(town.balloon);
  // 花瓣、落叶和雪花统一由四季系统维护。
  // 蝴蝶
  town.bflies = [];
  const bc = ['#ffe27a', '#ffffff', '#c9b6f2', '#8fd0f5', '#ff9fbd'];
  for (let i = 0; i < 7; i++) {
    const g = group();
    const m = mat(bc[i % bc.length], { side: THREE.DoubleSide, emissive: bc[i % bc.length], ei: 0.3 });
    const l = group(0, 0, 0, cbox(0.16, 0.012, 0.2, m, -0.08, 0, 0, { r: 0.005, cast: false }));
    const r = group(0, 0, 0, cbox(0.16, 0.012, 0.2, m, 0.08, 0, 0, { r: 0.005, cast: false }));
    g.add(l, r);
    town.scene.add(g);
    town.bflies.push({ g, l, r, cx: -24 + rnd() * 48, cz: -6 + rnd() * 20, rad: 1 + rnd() * 2, ph: rnd() * 6, sp: 0.5 + rnd() * 0.6 });
  }
}

export function applySky(town, dt) {
  if (town.camMode !== 'title' && !(creativeTimePaused() && (town.camMode === 'decor' || town.photoOn))) {
    const c = S.clock + dt / daySeconds(), days = Math.floor(c);
    // 昼夜走完一圈（清晨 5 点）就是小镇新的一天
    S.clock = c % 1;
    if (days > 0) { S.gday = (S.gday || 0) + days; save(); bus.emit('newDay', S.gday); }
  }
  const t = S.clock;
  let i = 0;
  while (i < SKY.length - 2 && t > SKY[i + 1].t) i++;
  const a = SKY[i], b = SKY[i + 1];
  const k = clamp((t - a.t) / (b.t - a.t));
  town.skyU.top.value.lerpColors(a.top, b.top, k);
  town.skyU.bot.value.lerpColors(a.bot, b.bot, k);
  town.sun.color.lerpColors(a.sun, b.sun, k);
  town.sun.intensity = lerp(a.si, b.si, k);
  town.hemi.color.lerpColors(a.hs, b.hs, k);
  town.hemi.groundColor.lerpColors(a.hg, b.hg, k);
  town.hemi.intensity = lerp(a.hi, b.hi, k);
  const n = (town.night = lerp(a.n, b.n, k));
  town.scene.fog.color.copy(town.skyU.bot.value);
  town.waterU.horizon.value.copy(town.skyU.bot.value);
  town.waterU.colA.value.set('#a6ecf2').lerp(C('#6c7fd6'), n * 0.8);
  town.waterU.colB.value.set('#6fcdf0').lerp(C('#3c4aa6'), n * 0.85);
  town.waterU.foam.value.set('#ffffff').lerp(C('#c2c8ff'), n * 0.6);
  town.stars.material.opacity = clamp((n - 0.5) * 2);
  town.moon.material.opacity = clamp((n - 0.4) * 1.8);
  // 夜景保留温暖的灯光层次，但压低店铺与路灯的峰值，避免移动网页夜间泛白刺眼。
  for (const g of glowMats) g.m.emissiveIntensity = lerp(g.day, g.night * 0.78, clamp(n * 1.2));
  for (const l of town.nightLights) l.intensity = clamp(n * 1.2) * 18;
  // 太阳方位随时间缓慢移动
  const sx = lerp(-16, 14, clamp(t / 0.72));
  town.sunOff = town.sunOff || new THREE.Vector3();
  town.sunOff.set(n > 0.9 ? -10 : sx, 24, 13);
  app.bloom.strength = town.active ? 0.2 + n * 0.3 : app.bloom.strength;
}

export function updateAmbient(town, dt, time) {
  const r = town.rig;
  const indoor = town.zone === 'house';
  // 氛围动画
  for (const c of town.clouds) {
    c.visible = !indoor;
    if (indoor) continue;
    // 云跟着镜头所在的岛走
    c.userData.ox = c.userData.ox ?? c.position.x;
    c.userData.oz = c.userData.oz ?? c.position.z;
    c.userData.ox += c.userData.sp * dt;
    if (c.userData.ox > 100) c.userData.ox = -100;
    c.position.x = r.x + c.userData.ox;
    c.position.z = (town.zone === 'home' ? HOME.cz : 0) + c.userData.oz;
  }
  town.balloon.visible = !indoor;
  if (!indoor) {
    town.balloon.position.set(-38 + Math.sin(time * 0.05) * 14, 15 + Math.sin(time * 0.4) * 0.8, -34 + Math.cos(time * 0.04) * 6);
    town.balloon.rotation.y = time * 0.1;
  }
  town.boat.position.y = -0.72 + Math.sin(time * 1.2) * 0.07;
  town.boat.rotation.z = Math.sin(time * 0.9) * 0.05;
  town.windmill.userData.blades.rotation.z = -time * 0.7;
  town.cafe.userData.spin.rotation.y = Math.sin(time * 0.6) * 0.3;
  const st = town.cafe.userData.steam;
  st.children.forEach((m, i) => {
    const u = (time * 0.4 + i / 3) % 1;
    m.position.y = u * 1.3;
    m.position.x = (i - 1) * 0.25 + Math.sin(time * 2 + i) * 0.1;
    m.scale.setScalar(0.5 + u * 0.9);
    m.material.opacity = 0.7 * (1 - u);
  });
  town.flower.userData.spin2.rotation.z = time * 0.3;
  town.tailor.userData.spin3.rotation.z = Math.sin(time * 0.8) * 0.25;
  town.boutique.userData.bob.position.y = 7.3 + Math.sin(time * 1.6) * 0.12;
  town.boutique.userData.bob.rotation.y = Math.sin(time * 0.8) * 0.25;
  if (town.markers) for (const m of town.markers) {
    m.position.y = m.userData.baseY + Math.sin(time * 2.4 + m.position.x) * 0.16;
    m.rotation.y = time * 1.6;
    m.visible = town.camMode === 'play';
  }
  if (town.zone === 'town' || town.camMode === 'title') for (const t of town.trees) t.m.rotation.z = Math.sin(time * 0.9 + t.ph) * 0.012;
  town.seasons.update(dt, time);
  const showBflies = town.night < 0.6 && town.seasons.current !== 'winter' && (town.zone === 'town' || town.zone === 'home' || town.camMode === 'title');
  for (const b of town.bflies) {
    b.g.visible = showBflies;
    if (!showBflies) continue;
    const a = time * b.sp + b.ph;
    b.g.position.set(b.cx + Math.cos(a) * b.rad, 0.8 + Math.sin(a * 2.3) * 0.35, b.cz + Math.sin(a * 1.3) * b.rad);
    b.g.rotation.y = -a + Math.PI / 2;
    const f = Math.sin(time * 18 + b.ph) * 0.9;
    b.l.rotation.z = f;
    b.r.rotation.z = -f;
  }
  if (town.ringT !== undefined) {
    town.ringT += dt;
    const u = clamp(town.ringT / 0.6);
    town.ring.material.opacity = town.moveTo ? 0.9 * (1 - u * 0.5) : Math.max(0, town.ring.material.opacity - dt * 3);
    town.ring.scale.setScalar(1 + Math.sin(town.ringT * 8) * 0.08);
  }
}
