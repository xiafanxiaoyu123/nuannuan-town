// 粒子小特效：星星、爱心、彩纸
import { THREE, rboxGeo } from './kit.js';
import { rand, pick } from './util.js';

const live = [];
const geo = rboxGeo(0.14, 0.14, 0.14, 0.04);
const mats = new Map();
function pm(color) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true });
    m.toneMapped = false;
    mats.set(color, m);
  }
  return m;
}

export const fx = {
  burst(scene, pos, o = {}) {
    const n = o.n ?? 12;
    const colors = o.colors || ['#ffd24f', '#ff8fb1', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, pm(pick(colors)).clone());
      m.position.copy(pos);
      m.position.x += rand(-0.2, 0.2) * (o.spread ?? 1);
      m.position.z += rand(-0.2, 0.2) * (o.spread ?? 1);
      const a = rand(Math.PI * 2), sp = (o.speed ?? 2.4) * rand(0.5, 1);
      const p = {
        m, life: 0, max: (o.life ?? 0.9) * rand(0.7, 1.1),
        vx: Math.cos(a) * sp, vy: (o.up ?? 3.2) * rand(0.6, 1.1), vz: Math.sin(a) * sp,
        g: o.gravity ?? 7, size: (o.size ?? 1) * rand(0.6, 1.2), spin: rand(-8, 8), scene,
      };
      m.scale.setScalar(p.size);
      m.rotation.set(rand(3), rand(3), rand(3));
      scene.add(m);
      live.push(p);
    }
  },
  confetti(scene, pos, n = 40) {
    this.burst(scene, pos, { n, colors: ['#ff8fb1', '#ffe27a', '#9fe0c5', '#8fd0f5', '#c9b6f2', '#ffffff'], speed: 4.5, up: 7, gravity: 9, life: 1.8, size: 1.1, spread: 3 });
  },
  hearts(scene, pos, n = 6) {
    this.burst(scene, pos, { n, colors: ['#ff6f91', '#ff8fb1', '#ffc2d6'], speed: 0.8, up: 2.2, gravity: 1.2, life: 1.2, size: 0.9 });
  },
  sparkle(scene, pos, n = 10, colors) {
    this.burst(scene, pos, { n, colors: colors || ['#fff3a8', '#ffd24f', '#ffffff'], speed: 1.8, up: 2.6, gravity: 4, life: 0.8, size: 0.7 });
  },
  clearScene(scene) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      if (p.scene !== scene) continue;
      p.scene.remove(p.m);
      p.m.material.dispose();
      live.splice(i, 1);
    }
  },
  update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.scene.remove(p.m);
        p.m.material.dispose();
        live.splice(i, 1);
        continue;
      }
      p.vy -= p.g * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      p.m.rotation.x += p.spin * dt;
      p.m.rotation.y += p.spin * 0.7 * dt;
      p.m.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      p.m.scale.setScalar(p.size * (k < 0.15 ? k / 0.15 : 1));
    }
  },
};
