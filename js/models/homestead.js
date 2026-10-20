// 牧场与厨房的纯模型工厂。每个实例拥有自己的合并几何和材质，允许随场景独立释放。
// 坐标：盘底/脚底 y=0，动物面向 +Z。动态模型禁止进入场景静态合批。
import * as THREE from 'three';
import { createPersonalityAnimal, animatePersonalityAnimal } from './animal-personality.js';

const TAU = Math.PI * 2;
const C = { cream: '#fff5df', porcelain: '#fff9ed', pink: '#eeb6c0', bread: '#e8b46e', toast: '#bd7f44', leaf: '#80a56a', dark: '#56483f', white: '#fffdf2', yellow: '#f5ce66', red: '#e96776' };
export const DISH_MODEL_IDS = Object.freeze(['strawberry_tart', 'pumpkin_soup', 'blueberry_muffin', 'lemon_tea', 'moon_cake', 'egg_custard', 'milk_pudding', 'egg_sandwich', 'cheese_pumpkin', 'apple_pancake', 'cherry_yogurt', 'radish_omelet', 'duck_egg_toast', 'goat_moon_milk', 'berry_trifle', 'orange_yogurt', 'peach_milk', 'pumpkin_pie', 'goat_cheese_tart', 'apple_milk_bowl', 'lemon_cheesecake', 'cherry_egg_tart', 'blueberry_yogurt', 'garden_quiche']);
export const ANIMAL_MODEL_IDS = Object.freeze(['chicken', 'cow', 'sheep', 'duck', 'goat', 'rabbit', 'alpaca']);
export const RANCH_FURNITURE_IDS = Object.freeze(['ranch_coop', 'ranch_barn', 'ranch_hutch', 'ranch_fence', 'ranch_gate', 'ranch_trough', 'ranch_hay', 'ranch_sign', 'ranch_picnic', 'ranch_cookstation', 'ranch_flower', 'ranch_lantern']);
const HOT = new Set(['strawberry_tart', 'pumpkin_soup', 'blueberry_muffin', 'lemon_tea', 'moon_cake', 'egg_custard', 'cheese_pumpkin', 'apple_pancake', 'radish_omelet', 'duck_egg_toast', 'goat_moon_milk', 'pumpkin_pie', 'goat_cheese_tart', 'apple_milk_bowl', 'cherry_egg_tart', 'garden_quiche']);

function node(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); g.userData.noMerge = true; return g;
}
function material() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: 0 }); }

// 不保留临时小零件，每个可动部位压成一个多色网格；无贴图/字体/DOM 依赖。
class Parts {
  constructor() { this.items = []; }
  add(geometry, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    geometry.applyMatrix4(transform);
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    this.items.push({ g, color: new THREE.Color(color) }); return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, 1, 1, 1, rx, ry, rz); }
  ball(rx, ry, rz, color, x = 0, y = 0, z = 0, rotation = 0, segments = 10) { return this.add(new THREE.SphereGeometry(1, segments, segments <= 8 ? 4 : 6), color, x, y, z, rx, ry, rz, 0, 0, rotation); }
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, segments = 16, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, segments), color, x, y, z, 1, 1, 1, rx, ry, rz); }
  ring(r, tube, color, x = 0, y = 0, z = 0, rx = Math.PI / 2, ry = 0, rz = 0, arc = TAU) { return this.add(new THREE.TorusGeometry(r, tube, 4, 16, arc), color, x, y, z, 1, 1, 1, rx, ry, rz); }
  shape(shape, depth, color, x = 0, y = 0, z = 0, ry = 0, bevel = .008) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10, steps: 1 });
    geo.rotateX(-Math.PI / 2); return this.add(geo, color, x, y, z, 1, 1, 1, 0, ry, 0);
  }
  mesh(name, mat = material()) {
    const count = this.items.reduce((n, p) => n + p.g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3), normal = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    let offset = 0;
    for (const { g, color } of this.items) {
      const p = g.attributes.position, n = g.attributes.normal;
      pos.set(p.array, offset * 3); normal.set(n.array, offset * 3);
      for (let i = 0; i < p.count; i++) { colors[(offset + i) * 3] = color.r; colors[(offset + i) * 3 + 1] = color.g; colors[(offset + i) * 3 + 2] = color.b; }
      offset += p.count; g.dispose();
    }
    this.items.length = 0;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const m = new THREE.Mesh(geometry, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.userData.noMerge = true; m.userData.keep = true; return m;
  }
}

function plate(p, color = C.porcelain, radius = .30) {
  p.cyl(radius, radius * .83, .035, color, 0, .0175, 0, 24);
  p.ring(radius * .92, .016, color, 0, .038, 0);
  p.cyl(radius * .74, radius * .77, .012, '#f0e6d7', 0, .037, 0, 24);
}
function bowl(p, color = C.pink, radius = .26, height = .19) {
  // 开口碗：侧壁轮廓保留外壁和内沿，汤面遮住碗内底，空盘时仍能看见凹面。
  const geo = new THREE.LatheGeometry([new THREE.Vector2(.12, 0), new THREE.Vector2(.15, .018), new THREE.Vector2(radius, height - .018), new THREE.Vector2(radius, height), new THREE.Vector2(radius - .023, height), new THREE.Vector2(.125, .04), new THREE.Vector2(0, .04)], 20);
  p.add(geo, color); p.ring(radius - .009, .012, C.cream, 0, height - .004, 0);
}
function leaf(p, x, y, z, size = .055, rotation = -.5) { p.ball(size, .009, size * .42, C.leaf, x, y, z, rotation, 8); }
function berry(p, x, y, z, size = .05, color = C.red) {
  p.ball(size * .82, size, size * .72, color, x, y, z, -.16, 10);
  for (let i = 0; i < 3; i++) p.box(.008, .012, .004, '#ffe4a2', x + (i - 1) * size * .3, y + (i % 2 ? .008 : -.017), z + size * .69, 0, 0, .2);
  leaf(p, x, y + size * .86, z, size * .72);
}
function cherry(p, x, y, z, size = .036) {
  p.ball(size, size, size, '#c85b70', x, y, z, 0, 10);
  p.box(.009, .07, .009, '#6c8752', x + .009, y + .06, z, 0, 0, -.3);
}
function creamSwirl(p, x, y, z, radius = .08) {
  p.cyl(radius, radius * 1.12, .025, C.white, x, y + .012, z, 14);
  p.cyl(radius * .6, radius, .035, C.white, x, y + .042, z, 14);
  p.ball(radius * .33, .025, radius * .33, C.white, x + .008, y + .068, z, 0, 8);
}
function triangle(size) { const s = new THREE.Shape(); s.moveTo(-size, -size * .7); s.lineTo(size, -size * .7); s.lineTo(-size, size * .85); s.closePath(); return s; }
function pieSector(radius, start = .45, arc = TAU - .95) { const s = new THREE.Shape(); s.moveTo(0, 0); s.absarc(0, 0, radius, start, start + arc, false); s.lineTo(0, 0); s.closePath(); return s; }
function tartShell(p, x, z, radius, y, state, quality, filling) {
  const crust = foodColor(state, quality);
  p.cyl(radius, radius * .84, .045, crust, x, y, z, 12);
  p.cyl(radius * .83, radius * .83, .019, filling, x, y + .025, z, 12);
  for (let i = 0; i < 10; i++) { const a = i * TAU / 10; p.cyl(.011, .012, .039, crust, x + Math.cos(a) * radius * .93, y + .018, z + Math.sin(a) * radius * .93, 5); }
}
function citrusSlice(p, x, y, z, radius = .068, orange = false, tilt = 0) {
  p.cyl(radius, radius, .016, orange ? '#e8a14e' : '#e9cc60', x, y, z, 12, tilt);
  p.cyl(radius * .82, radius * .82, .018, orange ? '#ffd28a' : '#fff0ac', x, y + .004, z, 12, tilt);
  for (let i = 0; i < 6; i++) p.box(.003, .004, radius * 1.55, '#fff5d6', x, y + .016, z, 0, i * Math.PI / 3);
}
function star(radius = .035) {
  const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? radius * .44 : radius; const x = Math.sin(a) * r, y = Math.cos(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s;
}
function cookingState(phase) {
  if (phase === 'empty' || phase === 'eaten') return -1;
  if (phase === 'raw' || phase === 'prep' || phase === 'ingredients') return 0;
  if (phase === 'cooking' || phase === 'cook') return .5;
  return typeof phase === 'number' && Number.isFinite(phase) ? THREE.MathUtils.clamp(phase, 0, 1) : 1;
}
function foodColor(state, quality) {
  return state < .25 ? '#f3dfb6' : state < .75 ? '#eac487' : quality === 0 ? '#d5a064' : C.bread;
}

const DISH_BUILD = {
  strawberry_tart(p, state, quality, variant) {
    const pastry = foodColor(state, quality); p.cyl(.236, .218, .075, pastry, 0, .079, 0, 20);
    p.cyl(.213, .213, .018, C.cream, 0, .123, 0, 20);
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16; p.cyl(.018, .017, .065, pastry, Math.sin(a) * .228, .105, Math.cos(a) * .228, 6); }
    const n = state < .25 ? 2 : quality > 0 ? 6 : 5;
    for (let i = 0; i < n; i++) { const a = i * TAU / 6; berry(p, Math.cos(a) * .126, .174, Math.sin(a) * .126, .048); }
    if (state > .5) berry(p, 0, .177, 0, .049);
    if (['milk', 'milky', 'creamy'].includes(variant)) creamSwirl(p, 0, .185, 0, .047);
  },
  pumpkin_soup(p, state, quality, variant) {
    p.cyl(.232, .232, .014, state < .5 ? '#f2ca8b' : '#efa75f', 0, .164, 0, 24);
    for (let i = 0; i < (state < .5 ? 6 : 3); i++) { const a = i * 2.4; p.box(.065, .038, .055, '#e58942', Math.cos(a) * .12, .183, Math.sin(a) * .11, 0, a, 0); }
    if (state > .25) {
      p.ring(.095, .008, C.cream, 0, .178, 0, Math.PI / 2, 0, .4, Math.PI * 1.5);
      p.ring(.052, .008, C.cream, 0, .179, 0, Math.PI / 2, 0, -.4, Math.PI * 1.6);
      leaf(p, -.08, .193, -.055, .047);
    }
    if (['milk', 'milky', 'creamy'].includes(variant)) creamSwirl(p, .07, .177, .06, .043);
  },
  blueberry_muffin(p, state, quality) {
    p.cyl(.17, .125, .16, '#dbaea0', 0, .125, 0, 16);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; p.box(.009, .13, .009, '#f2d4bf', Math.sin(a) * .147, .128, Math.cos(a) * .147, 0, a, 0); }
    p.ball(.198, state < .5 ? .065 : .126, .198, foodColor(state, quality), 0, .219, 0, 0, 16);
    for (const [x, y, z] of [[-.10, .328, .045], [.10, .323, .064], [.01, .354, -.015], [-.054, .322, -.105], [.1, .318, -.092]]) p.ball(.031, .027, .03, '#646ea6', x, state < .5 ? y - .06 : y, z, 0, 8);
    if (state > .5) for (const z of [-.065, 0, .065]) p.box(.19, .006, .011, '#fff5db', 0, .345 - Math.abs(z) * .2, z, 0, .3, 0);
  },
  lemon_tea(p, state) {
    p.cyl(.166, .147, .015, '#deac65', 0, state < .25 ? .10 : .241, 0, 20);
    const sliceY = state < .25 ? .135 : .261;
    p.cyl(.066, .066, .017, '#f5d56c', -.065, sliceY, .012, 12);
    p.cyl(.052, .052, .019, '#fff1b3', -.065, sliceY + .003, .012, 12);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; p.box(.0035, .005, .086, '#e9c761', -.065, sliceY + .015, .012, 0, a, 0); }
    for (const [x, z] of [[.06, .045], [.065, -.06], [-.005, -.09]]) p.box(.042, .027, .036, '#efa7a0', x, sliceY - .005, z, 0, .3, 0);
    leaf(p, .04, sliceY + .018, .095, .036);
  },
  moon_cake(p, state) {
    const moon = new THREE.Shape(); moon.moveTo(.12, .19); moon.bezierCurveTo(-.19, .23, -.28, -.13, -.07, -.19); moon.bezierCurveTo(.035, -.23, .13, -.17, .17, -.11); moon.bezierCurveTo(-.035, -.19, -.11, .10, .12, .19); moon.closePath();
    p.shape(moon, .085, state < .5 ? '#ded8ed' : '#d2bce3', 0, .055, 0);
    p.shape(star(.043), .014, '#f8df88', .092, .071, -.055, .2);
    p.shape(star(.023), .012, C.white, -.145, .151, .02, -.4);
    cherry(p, -.09, .181, -.125, .035);
  },
  egg_custard(p, state) {
    p.cyl(.216, .216, .016, state < .5 ? '#e7bc5e' : '#f6df8e', 0, .149, 0, 24);
    if (state < .25) { p.ball(.073, .025, .073, '#e9a543', .025, .167, 0, 0, 12); }
    else for (const [x, z, r] of [[-.05, -.02, .5], [.044, .05, -.6], [.018, -.067, -.3]]) p.box(.046, .008, .012, '#8cae68', x, .164, z, 0, r, 0);
  },
  milk_pudding(p, state) {
    p.cyl(.137, .185, state < .5 ? .13 : .205, '#f6df9e', 0, state < .5 ? .108 : .146, 0, 20);
    p.cyl(.139, .148, .022, state < .5 ? '#d7b37b' : '#b8794c', 0, state < .5 ? .18 : .256, 0, 20);
    p.cyl(.203, .203, .009, '#dcb278', 0, .05, 0, 20);
    if (state > .5) { creamSwirl(p, -.038, .267, -.015, .039); cherry(p, .045, .296, .015, .028); }
  },
  egg_sandwich(p, state) {
    for (const [x, z, ry] of [[-.095, .04, -.2], [.105, -.055, Math.PI - .18]]) {
      p.shape(triangle(.12), .025, C.toast, x, .055, z, ry, .004);
      p.shape(triangle(.111), .025, '#f8e6bd', x, .065, z, ry, .004);
      p.shape(triangle(.112), .017, '#8aaf70', x, .098, z, ry, .003);
      p.shape(triangle(.11), .027, C.white, x, .123, z, ry, .003);
      p.ball(.035, .017, .035, '#eac05b', x, .151, z, 0, 8);
      p.shape(triangle(.115), .01, '#e99b9b', x, .16, z, ry, .003);
      if (state > .25) { p.shape(triangle(.12), .033, C.toast, x, .178, z, ry, .004); p.shape(triangle(.112), .012, '#f8e6bd', x, .209, z, ry, .003); }
    }
  },
  cheese_pumpkin(p, state) {
    for (const [x, z, r] of [[-.12, -.065, -.2], [0, -.06, .2], [.12, -.05, -.1], [-.10, .065, .2], [.04, .065, -.2], [.14, .075, .1]]) {
      p.box(.091, .078, .088, '#eaa05f', x, .114, z, 0, r, 0);
      if (state > .25) p.ball(.068, .02, .064, '#f5d47c', x, .161, z, 0, 8);
    }
    if (state > .5) for (const [x, z] of [[-.12, -.04], [.03, -.07], [.15, .065], [-.06, .07]]) p.ball(.023, .006, .016, '#c58a4d', x, .183, z, 0, 8);
    leaf(p, .03, .192, .02, .045);
  },
  apple_pancake(p, state, quality) {
    for (let i = 0; i < (state < .25 ? 1 : 3); i++) {
      p.cyl(.207 - i * .009, .21 - i * .009, .037, foodColor(state, quality), 0, .068 + i * .039, 0, 20);
      p.cyl(.189 - i * .008, .189 - i * .008, .006, '#edcb89', 0, .089 + i * .039, 0, 20);
    }
    if (state > .25) {
      p.cyl(.12, .126, .008, '#c28b4e', -.025, .174, .025, 16);
      for (let i = 0; i < 4; i++) {
        const a = -.5 + i * .37; p.ball(.068, .015, .026, '#e99a87', Math.sin(a) * .115, .184 + i * .006, -.07 + Math.cos(a) * .028, a, 10);
        p.ball(.057, .016, .018, '#f9e3ae', Math.sin(a) * .115, .187 + i * .006, -.068 + Math.cos(a) * .028, a, 10);
      }
      p.box(.051, .028, .044, '#f7e2a2', -.095, .192, .062, 0, .25, 0);
    }
  },
  cherry_yogurt(p, state) {
    p.cyl(.145, .12, .075, '#f4e9d7', 0, .081, 0, 20);
    p.cyl(.151, .145, .05, '#d98795', 0, .143, 0, 20);
    if (state > .25) { p.cyl(.166, .151, .11, C.white, 0, .223, 0, 20); p.cyl(.166, .166, .014, '#e0a2ae', 0, .286, 0, 20); }
    const top = state > .25 ? .32 : .193; cherry(p, -.044, top, .027, .037); cherry(p, .039, top + .012, -.023, .034); leaf(p, .045, top + .048, .03, .043);
  },
  radish_omelet(p, state) {
    if (state < .25) { p.cyl(.21, .21, .016, '#f3d17a', 0, .065, 0, 20); for (const x of [-.09, .01, .10]) p.box(.04, .02, .032, '#e9a2a2', x, .086, .02); return; }
    for (const [x, z, width] of [[-.105, -.015, .12], [.046, .014, .105], [.16, .05, .078]]) {
      p.cyl(.078, .078, width, '#e8bc66', x, .126, z, 16, 0, 0, Math.PI / 2);
      p.cyl(.062, .062, .006, '#f7dc8a', x + width / 2 + .004, .126, z, 16, 0, 0, Math.PI / 2);
      p.ring(.044, .008, '#eaa4a0', x + width / 2 + .008, .126, z, 0, Math.PI / 2, 0, Math.PI * 1.8);
      p.ring(.022, .007, '#eaa4a0', x + width / 2 + .009, .126, z, 0, Math.PI / 2, 0, Math.PI * 1.8);
      p.ball(.004, .012, .009, C.leaf, x + width / 2 + .013, .124, z + .018, 0, 6);
    }
    leaf(p, -.08, .055, .16, .06); leaf(p, -.01, .055, .17, .05, .4);
  },
  duck_egg_toast(p, state, quality) {
    // Square crust, soft inner crumb and an asymmetric sunny duck egg.
    p.box(.365, .060, .33, state < .5 ? '#d8b17d' : '#b8814b', 0, .08, 0, 0, -.14);
    p.box(.326, .018, .292, foodColor(state, quality), 0, .118, 0, 0, -.14);
    if (state > .25) {
      p.ball(.142, .017, .115, C.white, -.018, .139, -.014, 0, 12);
      p.ball(.079, .016, .067, C.white, .098, .14, .048, 0, 10);
    }
    p.ball(.063, state < .5 ? .039 : .031, .063, '#edbc4e', .006, .16, -.016, 0, 12);
    if (state > .5) { p.box(.034, .006, .008, C.leaf, -.085, .16, .045, 0, .6); p.box(.03, .006, .008, C.leaf, .069, .161, -.086, 0, -.3); }
    leaf(p, -.135, .06, .145, .065); leaf(p, -.07, .058, .17, .047, .3);
  },
  goat_moon_milk(p, state) {
    p.cyl(.144, .144, .012, state < .5 ? '#f2e7d2' : '#e2d4ec', 0, .291, 0, 20);
    if (state > .25) {
      p.ring(.079, .012, '#fff9ed', 0, .303, 0, Math.PI / 2, 0, .4, Math.PI * 1.55);
      p.shape(star(.036), .008, '#f1dc99', .056, .31, .035, -.35);
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; p.ball(.025, .008, .014, '#bdacd4', -.06 + Math.cos(a) * .027, .31, -.055 + Math.sin(a) * .027, a, 6); }
      p.ball(.012, .009, .012, '#ffe7a7', -.06, .32, -.055, 0, 6);
    }
  },
  berry_trifle(p, state) {
    const base = .10;
    p.cyl(.148, .128, .065, '#e7c388', 0, base, 0, 16);
    p.cyl(.16, .147, .065, '#eeb5bf', 0, base + .061, 0, 16);
    p.cyl(.173, .16, .065, C.cream, 0, base + .126, 0, 16);
    if (state > .25) {
      p.cyl(.18, .172, .047, '#b7a0c9', 0, base + .182, 0, 16);
      creamSwirl(p, .011, .309, -.01, .08);
      berry(p, -.08, .341, .05, .044);
      for (const [x, z] of [[.087, .035], [.062, -.073], [-.052, -.075]]) p.ball(.027, .026, .027, '#6976ae', x, .339, z, 0, 8);
    }
  },
  orange_yogurt(p, state) {
    p.cyl(.221, .221, .016, '#fff4dd', 0, .146, 0, 20);
    if (state > .25) {
      for (const [x, z, r] of [[-.09, -.035, -.2], [.045, -.071, .3], [.1, .054, .6]]) citrusSlice(p, x, .166, z, .066, true, r * .10);
      p.ring(.137, .007, '#f2c78e', 0, .158, 0, Math.PI / 2, 0, .1, Math.PI * 1.3);
      leaf(p, -.07, .191, .10, .053);
    } else for (const x of [-.06, .06]) p.box(.075, .04, .06, '#efb76b', x, .18, 0, 0, .3);
  },
  peach_milk(p, state) {
    p.cyl(.105, .088, .125, '#e7a9ac', 0, .1025, 0, 16);
    p.cyl(.119, .106, state > .25 ? .168 : .085, '#fae9df', 0, state > .25 ? .249 : .207, 0, 16);
    if (state > .25) {
      p.cyl(.122, .12, .02, '#efc5c3', 0, .342, 0, 16);
      p.ball(.044, .015, .075, '#e79d9d', -.021, .36, .018, -.25, 10); p.ball(.033, .017, .064, '#ffe0c5', -.017, .363, .02, -.25, 10);
      leaf(p, .067, .365, .02, .036); p.cyl(.009, .009, .17, '#a2bdb1', .063, .409, -.049, 8, 0, 0, -.13);
    }
  },
  pumpkin_pie(p, state, quality) {
    p.shape(pieSector(.235), .058, foodColor(state, quality), 0, .052, 0, 0, .006);
    p.shape(pieSector(.208), state < .5 ? .025 : .049, '#e7a24f', 0, .107, 0, 0, .004);
    for (let i = 0; i < 14; i++) { const a = .49 + i * (TAU - 1.06) / 13; p.ball(.018, .015, .024, '#e9bf7c', Math.cos(a) * .22, .125, -Math.sin(a) * .22, a, 6); }
    if (state > .5) { creamSwirl(p, -.06, .166, -.02, .046); p.box(.085, .008, .011, '#b7824c', -.1, .173, .064, 0, -.4); }
  },
  goat_cheese_tart(p, state, quality) {
    for (const [x, z] of [[-.115, .062], [.114, .068], [0, -.127]]) {
      tartShell(p, x, z, .099, .078, state, quality, state < .25 ? '#e4d5ae' : '#fff2d5');
      if (state > .5) { p.box(.042, .028, .035, '#fff9e8', x, .132, z, 0, .3); leaf(p, x + .025, .135, z + .026, .029); }
    }
  },
  apple_milk_bowl(p, state) {
    p.cyl(.22, .22, .014, state < .5 ? '#ecd7b2' : '#f7e3bc', 0, .169, 0, 20);
    for (let i = 0; i < 10; i++) { const a = i * 2.39; p.ball(.014, .008, .024, '#d7b584', Math.cos(a) * (.09 + .007 * i), .182, Math.sin(a) * .14, a, 6); }
    if (state > .25) for (let i = 0; i < 4; i++) { const a = -.6 + i * .38; p.ball(.068, .015, .027, '#d5927e', Math.sin(a) * .095, .198 + i * .007, -.048, a, 8); p.ball(.055, .016, .018, '#ffe9ba', Math.sin(a) * .095, .201 + i * .007, -.045, a, 8); }
    p.box(.13, .013, .017, '#ae8056', .029, .199, .102, 0, -.35);
  },
  lemon_cheesecake(p, state) {
    const wedge = triangle(.205);
    p.shape(wedge, .034, '#c39c68', .019, .054, .008, -.12, .004);
    p.shape(wedge, state < .5 ? .075 : .151, '#fff0cb', .019, .088, .008, -.12, .004);
    if (state > .25) {
      p.shape(wedge, .019, '#eed274', .019, .242, .008, -.12, .003);
      citrusSlice(p, -.073, .276, -.044, .062);
      creamSwirl(p, .035, .264, -.075, .032); leaf(p, -.105, .292, .038, .035);
    }
  },
  cherry_egg_tart(p, state, quality) {
    for (const [x, z] of [[-.116, -.027], [.112, .051]]) {
      tartShell(p, x, z, .126, .085, state, quality, state < .5 ? '#ead08b' : '#f3cc70');
      if (state > .5) { p.ball(.028, .004, .017, '#c58b55', x + .035, .123, z - .041, 0, 8); cherry(p, x - .023, .155, z + .01, .033); }
    }
  },
  blueberry_yogurt(p, state) {
    p.cyl(.111, .087, .13, '#b4a4cf', 0, .15, 0, 16);
    p.cyl(.135, .112, .09, '#f5eddf', 0, .258, 0, 16);
    if (state > .25) {
      for (let i = 0; i < 4; i++) { const r = .115 - i * .023; p.ring(r, .026, i % 2 ? '#b4a3d0' : '#fff6e7', .006 * i, .319 + i * .035, 0); }
      p.ball(.028, .032, .026, '#e7dcf0', .027, .452, 0, 0, 8);
      for (const [x, z] of [[-.078, .063], [.068, .077], [.091, -.05]]) p.ball(.027, .027, .027, '#6273a3', x, .34, z, 0, 8);
    }
  },
  garden_quiche(p, state, quality) {
    const crust = foodColor(state, quality); p.cyl(.236, .213, .062, crust, 0, .083, 0, 18);
    p.cyl(.21, .21, .022, state < .5 ? '#edcc83' : '#f6dca0', 0, .126, 0, 18);
    p.ring(.223, .017, crust, 0, .119, 0);
    for (const [x, z] of [[-.108, -.055], [.055, -.108], [.115, .06], [-.07, .10]]) {
      p.cyl(.053, .053, .012, '#d38b93', x, .147, z, 12); p.cyl(.042, .042, .014, '#f4cecb', x, .15, z, 12);
      leaf(p, x + .028, .166, z + .027, .032);
    }
    if (state > .5) for (const [x, z] of [[-.03, -.04], [.07, .016], [-.005, .10]]) p.box(.072, .006, .014, '#fff0c4', x, .172, z, 0, .5);
  },
};

function addSteam(root, height) {
  const geo = new THREE.TorusGeometry(.029, .0048, 3, 12, Math.PI * 1.55);
  const mat = new THREE.MeshBasicMaterial({ color: '#fff9ee', transparent: true, opacity: .44, depthWrite: false });
  const steam = new THREE.InstancedMesh(geo, mat, 3); steam.name = 'dish-steam'; steam.userData.noMerge = true; steam.frustumCulled = false;
  steam.userData.height = height; root.add(steam); root.userData.parts.steam = steam;
}

/** phase: raw/cooking/done/empty 或 0..1；quality: 0/1/2 或 home/tasty/fine。 */
export function createDish(id, { quality = 1, variant = 'base', phase = 'done' } = {}) {
  const known = DISH_MODEL_IDS.includes(id), dishId = known ? id : 'egg_custard';
  const q = quality === 'fine' || quality === '精致' ? 2 : quality === 'home' || quality === 'normal' || quality === '家常' ? 0 : Number.isFinite(Number(quality)) ? Math.max(0, Math.min(2, Number(quality))) : 1;
  const state = cookingState(phase), g = node(`dish:${id}`), crockery = new Parts(), food = new Parts(), mat = material();
  g.userData = { noMerge: true, kind: 'homestead-dish', dishId: id, modelId: dishId, fallback: !known, quality: q, variant, phase, parts: {}, anchor: { tableY: 0, carryY: 0 } };
  if (dishId === 'pumpkin_soup') bowl(crockery, '#eab7a5', .26, .19);
  else if (dishId === 'egg_custard') bowl(crockery, '#b9cbbb', .244, .178);
  else if (dishId === 'orange_yogurt') bowl(crockery, '#b4d2cd', .247, .166);
  else if (dishId === 'apple_milk_bowl') bowl(crockery, '#d6b08f', .247, .19);
  else if (dishId === 'goat_moon_milk') {
    plate(crockery, '#dfd6e8', .25); bowl(crockery, '#d6c7e4', .163, .311);
    crockery.ring(.062, .018, '#c5b5d4', .197, .175, 0, 0, 0, -.55, Math.PI * 1.65);
    crockery.ring(.041, .009, '#f5e8ba', 0, .168, .154, 0, 0, .3, Math.PI * 1.55);
  } else if (['berry_trifle', 'blueberry_yogurt'].includes(dishId)) {
    const trifle = dishId === 'berry_trifle', rim = trifle ? .187 : .143;
    crockery.cyl(.108, .11, .024, '#ceded7', 0, .012, 0, 16);
    crockery.cyl(.033, .04, .045, '#e3ece1', 0, .045, 0, 10);
    crockery.ring(rim, .011, '#c7d8ce', 0, .312, 0);
    for (const a of [-1, 1.1, 3.1]) crockery.box(.007, .221, .007, '#dbe7de', Math.cos(a) * (rim - .019), .194, Math.sin(a) * (rim - .019), 0, 0, -.075 * Math.cos(a));
  } else if (dishId === 'peach_milk') {
    crockery.cyl(.1, .1, .025, '#cbdcd5', 0, .0125, 0, 16);
    crockery.ring(.13, .009, '#d4e3dc', 0, .35, 0);
    for (const a of [-1, 1, 2.8]) crockery.box(.006, .321, .006, '#e3eee5', Math.cos(a) * .113, .181, Math.sin(a) * .113, 0, 0, -.035 * Math.cos(a));
  }
  else if (dishId === 'lemon_tea') {
    plate(crockery, C.porcelain, .28); bowl(crockery, '#e4c9aa', .185, .277);
    crockery.ring(.07, .021, '#e4c9aa', .216, .167, 0, 0, 0, -.6, Math.PI * 1.65);
  } else if (dishId === 'cherry_yogurt') {
    crockery.cyl(.141, .126, .03, '#c6d9d4', 0, .015, 0, 20);
    crockery.ring(.174, .012, '#c6d9d4', 0, .286, 0);
    for (const a of [-.8, .9, 2.7]) crockery.box(.008, .25, .008, '#e1eeeb', Math.cos(a) * .156, .15, Math.sin(a) * .156, 0, 0, -.06 * Math.cos(a));
  } else if (dishId === 'cheese_pumpkin') {
    crockery.box(.48, .035, .32, '#c7c5b9', 0, .0175, 0);
    crockery.box(.50, .07, .025, '#d4d3c5', 0, .065, -.165); crockery.box(.50, .07, .025, '#d4d3c5', 0, .065, .165);
    crockery.box(.025, .07, .32, '#d4d3c5', -.25, .065, 0); crockery.box(.025, .07, .32, '#d4d3c5', .25, .065, 0);
    for (const x of [-.295, .295]) crockery.ring(.047, .013, '#c7c5b9', x, .06, 0);
  } else plate(crockery, dishId === 'moon_cake' ? '#d8d5e9' : C.porcelain);
  g.add(crockery.mesh('dish-crockery', mat));
  if (state >= 0) {
    DISH_BUILD[dishId](food, state, q, variant);
    const foodMesh = food.mesh('dish-food', mat); g.add(foodMesh); g.userData.parts.food = foodMesh;
    const bounds = new THREE.Box3().setFromObject(g); g.userData.foodHeight = bounds.max.y;
    if (HOT.has(dishId) && state >= .5) addSteam(g, bounds.max.y + .035);
    if (dishId === 'cheese_pumpkin' && state >= .75) {
      const strings = new Parts(); for (const x of [-.06, 0, .06]) strings.box(.005, .10, .005, '#f8e0a0', x, .05, 0);
      const m = strings.mesh('cheese-pull', mat); m.position.set(0, .17, 0); m.visible = false; g.add(m); g.userData.parts.cheese = m;
    }
  }
  animateDish(g, 0); delete g.userData.animationStart;
  return g;
}

const _transform = new THREE.Object3D();
/** t 为秒；首次调用起算短演出，调用方远处可停调；设 animationStart=null 可重播。 */
export function animateDish(g, t = 0) {
  if (!g?.userData?.parts) return;
  const time = Number.isFinite(t) ? t : 0;
  if (g.userData.animationStart == null || time < g.userData.animationStart) g.userData.animationStart = time;
  const age = Math.max(0, time - g.userData.animationStart), { food, steam, cheese } = g.userData.parts;
  if (steam) {
    steam.visible = age < 30; steam.material.opacity = .44 * Math.min(1, Math.max(0, (30 - age) / 5));
    if (steam.visible) for (let i = 0; i < 3; i++) {
      const u = (age * .55 + i / 3) % 1, fadeScale = Math.sin(u * Math.PI);
      _transform.position.set((i - 1) * .075 + Math.sin(age * 1.3 + i) * .017, steam.userData.height + u * .14, Math.sin(i * 2) * .025);
      _transform.rotation.set(0, Math.sin(i * 2.2) * .8, Math.sin(age + i) * .18);
      _transform.scale.setScalar(.55 + fadeScale * .65); _transform.updateMatrix(); steam.setMatrixAt(i, _transform.matrix);
    }
    steam.instanceMatrix.needsUpdate = true;
  }
  if (food && g.userData.modelId === 'milk_pudding') {
    const wobble = age < 1.15 ? Math.sin(age * 16) * Math.exp(-age * 4) * .045 : 0;
    food.rotation.z = wobble; food.scale.set(1 + wobble * .5, 1 - wobble, 1 + wobble * .5);
  }
  if (food && ['lemon_tea', 'pumpkin_soup', 'goat_moon_milk', 'peach_milk', 'apple_milk_bowl'].includes(g.userData.modelId)) food.position.y = age < 30 ? Math.sin(age * 2.4) * .0015 : 0;
  if (cheese) { cheese.visible = age > .12 && age < 1.2; cheese.scale.y = .4 + Math.sin(Math.min(1, age / 1.2) * Math.PI) * 1.2; }
}

/** 七种动物各有独立体态与分节骨骼；未知 ID 保留小鸡兜底。 */
export function createAnimal(species = 'chicken', options = {}) {
  return createPersonalityAnimal(ANIMAL_MODEL_IDS.includes(species) ? species : 'chicken', options);
}

/** t 为秒；motion 可传真实累计距离 distance、速度 speed 与 dt。 */
export function animateAnimal(g, t = 0, action = 'idle', motion) {
  return animatePersonalityAnimal(g, t, action, motion);
}

/** 静态牧场陈设；type 为 coop/shed/trough/fence/nest/milk_bucket/wool。 */
export function createRanchProp(type = 'trough', { filled = true, count = 3 } = {}) {
  if (RANCH_FURNITURE_IDS.includes(type)) return createRanchFurniture(type, { filled });
  const g = node(`ranch:${type}`), p = new Parts(), wood = '#c4a27f', pale = '#eddfc4', roof = '#c5a4ab';
  if (type === 'coop' || type === 'shed') {
    const shed = type === 'shed', w = shed ? 2.3 : 1.45, h = shed ? 1.6 : 1.05, d = shed ? 1.65 : 1.15;
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) p.box(.11, h, .11, wood, x, h / 2, z);
    p.box(w, h * .8, .09, pale, 0, h * .4, -d / 2);
    for (const x of [-w / 2, w / 2]) p.box(.09, h * .55, d, pale, x, h * .275, 0);
    for (const x of [-w * .29, w * .29]) p.box(w * .62, .12, d + .28, roof, x, h + .14, 0, 0, 0, x < 0 ? .25 : -.25);
    p.box(.13, .13, d + .3, '#d9b7bd', 0, h + .30, 0);
    if (!shed) { p.box(.7, .055, .65, wood, 0, .06, .72, -.10); p.cyl(.17, .17, .025, '#d8bd7c', 0, .02, .10, 12); }
  } else if (type === 'fence') {
    for (const x of [-.6, .6]) { p.box(.11, .72, .11, pale, x, .36, 0); p.cyl(0, .082, .10, pale, x, .77, 0, 4, 0, Math.PI / 4); }
    for (const y of [.25, .54]) p.box(1.3, .09, .055, wood, 0, y, 0);
  } else if (type === 'nest') {
    p.cyl(.23, .2, .06, '#d6ba7c', 0, .03, 0, 12); p.ring(.20, .035, '#dec487', 0, .074, 0);
    for (const [x, z] of [[-.07, -.055], [.065, -.045], [-.06, .065], [.065, .07]].slice(0, Math.max(0, Math.min(4, Math.floor(count))))) p.ball(.048, .065, .048, '#fff2d6', x, .102, z, .15, 10);
  } else if (type === 'milk_bucket') {
    p.cyl(.17, .12, .28, '#bcc8c7', 0, .14, 0, 16); p.cyl(.15, .15, .012, '#fff8e6', 0, .277, 0, 16); p.ring(.173, .014, '#d7e0dc', 0, .28, 0); p.ring(.17, .014, '#bcc8c7', 0, .28, 0, 0, 0, 0, Math.PI);
  } else if (type === 'wool') {
    for (const [x, z] of [[-.11, -.04], [.08, -.04], [-.02, .11]]) p.ball(.13, .12, .13, '#f9edd6', x, .12, z, 0, 8);
    p.ball(.13, .13, .13, '#fff4df', 0, .24, 0, 0, 8);
  } else {
    p.box(.86, .07, .34, wood, 0, .055, 0);
    for (const z of [-.18, .18]) p.box(.92, .19, .045, pale, 0, .13, z);
    for (const x of [-.45, .45]) p.box(.05, .19, .39, pale, x, .13, 0);
    if (filled) for (let i = 0; i < 7; i++) p.box(.10, .04, .17, i % 2 ? '#a8b77a' : '#b6bd80', -.32 + i * .10, .12, (i % 2 - .5) * .07, 0, i * .5, 0);
  }
  g.add(p.mesh(type)); g.userData.kind = 'ranch-prop'; g.userData.propType = type; return g;
}

/** 自由摆放家具：几何不越过目录占格，所有陈设每件一网格、一材质，无常驻灯光。 */
export function createRanchFurniture(id, { filled = true } = {}) {
  if (!RANCH_FURNITURE_IDS.includes(id)) throw new Error('Unknown ranch furniture: ' + id);
  const g = node(id), p = new Parts(), wood = '#bd9571', pale = '#eadbc1', dark = '#8c6e52', roof = '#bd989f', leafColor = '#8ca570';
  const post = (x, z, height, width = .12) => p.box(width, height, width, wood, x, height / 2, z);
  const cap = (x, y, z, radius = .10) => p.cyl(0, radius, .12, pale, x, y + .06, z, 4, 0, Math.PI / 4);
  if (['ranch_coop', 'ranch_barn', 'ranch_hutch'].includes(id)) {
    const barn = id === 'ranch_barn', hutch = id === 'ranch_hutch';
    const w = barn ? 3.20 : hutch ? 1.54 : 2.25, d = barn ? 2.10 : hutch ? 1.26 : 1.85, hgt = barn ? 1.80 : hutch ? 1.10 : 1.46;
    p.box(w + .08, .10, d + .08, wood, 0, .05, 0);
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) post(x, z, hgt, .14);
    p.box(w, hgt - .10, .09, pale, 0, hgt / 2, -d / 2);
    for (const x of [-w / 2, w / 2]) p.box(.09, hgt - .10, d, pale, x, hgt / 2, 0);
    // Two sloping roof panels meet at a raised ridge; narrow front trim frames the opening.
    for (const sign of [-1, 1]) p.box(w * .58, .12, d + .30, hutch ? '#a3b8a0' : roof, sign * w * .25, hgt + w * .095, 0, 0, 0, -sign * .34);
    p.box(.13, .13, d + .33, hutch ? '#bdcbb1' : '#d3b0b5', 0, hgt + w * .19, 0);
    p.box(w + .04, .15, .12, wood, 0, hgt - .05, d / 2);
    for (let i = 0; i < 6; i++) p.box(.025, hgt * .75, .014, '#d4bf9d', -w * .42 + i * w * .168, hgt * .43, -d / 2 + .051);
    if (barn) {
      // Open stable bays, back hay and a horseshoe-shaped plaque.
      post(0, .82, 1.55, .13);
      p.box(.075, .66, 1.64, wood, 0, .45, -.06);
      for (const x of [-.82, .82]) { p.box(.66, .28, .54, '#d8bf83', x, .24, -.56); p.box(.05, .30, .56, '#b7a071', x - .15, .25, -.56); }
      p.ring(.17, .035, '#f3e3b7', 0, 1.65, d / 2 + .08, 0, 0, .27, Math.PI * 1.65);
    } else if (hutch) {
      p.box(.07, .86, .06, wood, 0, .53, d / 2);
      for (let i = 0; i < 6; i++) p.box(.014, .56, .014, '#acb9ab', -.66 + i * .12, .58, d / 2 + .014);
      for (const y of [.30, .48, .66, .84]) p.box(.68, .014, .014, '#acb9ab', -.35, y, d / 2 + .015);
      p.box(.61, .66, .05, '#c7ac86', .37, .43, d / 2);
      p.box(.26, .28, .018, dark, .37, .24, d / 2 + .03);
      p.ball(.05, .112, .021, '#fff0d4', .28, .90, d / 2 + .041, -.12, 8); p.ball(.05, .112, .021, '#fff0d4', .43, .90, d / 2 + .041, .12, 8);
      p.ball(.13, .10, .023, '#fff0d4', .355, .79, d / 2 + .043, 0, 8);
      for (const x of [-.60, -.41, -.22]) p.box(.15, .025, .28, '#aeb87a', x, .119, -.15, 0, .3);
    } else {
      p.box(.62, .88, .07, pale, -.78, .54, d / 2); p.box(.62, .88, .07, pale, .78, .54, d / 2);
      p.box(.62, .65, .035, dark, 0, .425, -d / 2 + .055);
      p.box(.72, .055, .48, wood, 0, .08, d / 2 + .22, -.10);
      for (let i = 0; i < 4; i++) p.box(.68, .021, .034, '#ddc6a4', 0, .10 + i * .011, d / 2 + .05 + i * .105);
      p.cyl(.23, .20, .035, '#d8bc79', -.71, .128, .35, 12);
      for (const x of [-.81, -.65]) p.ball(.06, .083, .06, '#fff1d6', x, .202, .35, 0, 8);
      p.box(.56, .26, .05, wood, 0, 1.28, d / 2 + .07); p.ball(.074, .10, .016, '#fff1d6', 0, 1.28, d / 2 + .105, 0, 10);
    }
  } else if (id === 'ranch_fence' || id === 'ranch_gate') {
    const gate = id === 'ranch_gate';
    for (const x of [-.85, .85]) { post(x, 0, gate ? 1.65 : .85, .13); cap(x, gate ? 1.65 : .85, 0); }
    if (gate) {
      // The center remains genuinely open, matching its walk-through catalog flag.
      p.box(1.83, .14, .16, pale, 0, 1.58, 0);
      p.box(.65, .25, .06, wood, 0, 1.37, .035);
      p.ball(.053, .069, .016, C.cream, -.10, 1.37, .074, 0, 8); p.ball(.053, .069, .016, C.cream, .10, 1.37, .074, 0, 8);
      for (const sign of [-1, 1]) for (const y of [.28, .63]) p.box(.23, .09, .055, pale, sign * .75, y, 0);
    } else {
      for (const y of [.28, .61]) p.box(1.80, .10, .065, pale, 0, y, 0);
      for (const sign of [-1, 1]) p.box(.91, .065, .035, wood, sign * .38, .44, .043, 0, 0, sign * .33);
    }
  } else if (id === 'ranch_trough') {
    p.box(1.55, .08, .57, wood, 0, .04, 0);
    for (const z of [-.29, .29]) p.box(1.65, .28, .06, pale, 0, .19, z);
    for (const x of [-.80, .80]) p.box(.07, .28, .64, pale, x, .19, 0);
    // 饲料排在同一网格末尾，用绘制范围显隐；不增加材质或常驻绘制次数。
    g.userData.feedVertexStart = p.items.reduce((sum,item)=>sum+item.g.attributes.position.count,0);
    for (let i = 0; i < 11; i++) p.box(.12, .06, .32, i % 2 ? leafColor : '#bac38b', -.67 + i * .134, .19, (i % 2 - .5) * .08, 0, i * .43);
  } else if (id === 'ranch_hay') {
    p.box(.75, .05, .74, wood, 0, .025, 0);
    p.cyl(.30, .30, .64, '#d9bd7e', 0, .35, 0, 14, Math.PI / 2);
    for (const z of [-.23, .23]) p.ring(.302, .017, '#a98e5a', 0, .35, z, 0);
    for (const r of [.085, .17, .25]) p.ring(r, .008, '#c4a569', 0, .35, .326, 0, 0, .2, Math.PI * 1.8);
  } else if (id === 'ranch_sign') {
    post(0, 0, 1.19, .12); p.box(.81, .40, .09, wood, 0, 1.03, 0);
    p.box(.72, .32, .015, '#e9d7b2', 0, 1.03, .055);
    p.ball(.14, .10, .018, C.cream, -.13, 1.04, .072, 0, 10); p.ball(.073, .08, .018, C.cream, .03, 1.10, .072, 0, 8);
    p.box(.20, .025, .018, leafColor, .20, .96, .074); p.box(.12, .025, .018, leafColor, .20, 1.03, .074);
    p.box(.44, .045, .36, dark, 0, .0225, 0);
  } else if (id === 'ranch_picnic') {
    for (const x of [-.94, .94]) for (const z of [-.35, .35]) p.box(.115, .77, .115, wood, x, .385, z);
    for (const x of [-.93, .93]) p.box(.14, .12, 1.78, dark, x, .34, 0);
    for (const z of [-.79, .79]) p.box(2.80, .09, .30, wood, 0, .435, z);
    for (let i = 0; i < 5; i++) p.box(2.65, .085, .256, i % 2 ? '#d4b48e' : '#c7a37b', 0, .7975, -.524 + i * .262);
    // The tabletop is intentionally free of decorative food; four real owned dishes fit here.
    g.userData.tableY = .84;
    g.userData.surfaceAnchors = [{ x: -.70, z: -.33 }, { x: .70, z: -.33 }, { x: -.70, z: .33 }, { x: .70, z: .33 }];
  } else if (id === 'ranch_cookstation') {
    for (const x of [-.73, .73]) for (const z of [-.30, .30]) post(x, z, .80, .10);
    p.box(1.64, .10, .83, pale, 0, .83, 0);
    p.box(1.43, .11, .64, wood, 0, .21, 0); p.box(.52, .43, .58, '#c7b193', -.40, .50, 0);
    p.box(.47, .35, .025, '#9e866c', -.40, .51, .305); p.box(.18, .025, .035, '#e9ddc2', -.40, .60, .327);
    p.ring(.16, .021, '#9c9d93', -.40, .893, 0); p.ring(.11, .013, '#aaa99a', -.40, .893, 0);
    p.box(.42, .025, .48, '#c2996e', .36, .893, .03); p.box(.24, .012, .07, '#d9dfd5', .35, .912, .04, 0, -.25); p.box(.14, .025, .045, dark, .49, .916, .075, 0, -.25);
    p.box(1.64, .15, .06, wood, 0, .92, -.39);
    for (const x of [-.12, .08]) p.cyl(.055, .052, .15, x < 0 ? '#e1c0ad' : '#b5c2a3', x, .96, -.26, 10);
  } else if (id === 'ranch_flower') {
    p.box(.76, .25, .66, wood, 0, .125, 0); p.box(.71, .025, .61, '#9c8365', 0, .26, 0);
    for (const x of [-.27, -.09, .09, .27]) p.box(.025, .20, .018, '#dfc7a3', x, .13, .34);
    for (const [x, y, z, color] of [[-.23, .53, -.12, '#e5a6b3'], [.07, .64, -.11, '#f2d78a'], [.23, .47, .13, '#dac3e3'], [-.12, .46, .15, '#f2d78a']]) {
      p.box(.018, y - .25, .018, leafColor, x, (y + .25) / 2, z); leaf(p, x + .04, y - .08, z, .07, .5);
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; p.ball(.045, .026, .045, color, x + Math.cos(a) * .055, y, z + Math.sin(a) * .055, 0, 6); }
      p.ball(.031, .031, .031, '#d6b36a', x, y + .014, z, 0, 6);
    }
  } else if (id === 'ranch_lantern') {
    p.box(.48, .08, .48, wood, 0, .04, 0); post(0, 0, 1.45, .10);
    p.box(.52, .07, .07, dark, .16, 1.42, 0); p.box(.045, .20, .045, dark, .33, 1.29, 0);
    p.box(.25, .30, .23, '#f3dfac', .29, 1.06, 0);
    for (const x of [.15, .43]) for (const z of [-.13, .13]) p.box(.025, .34, .025, dark, x, 1.06, z);
    p.cyl(.02, .22, .16, '#ac9d83', .29, 1.31, 0, 4, 0, Math.PI / 4); p.box(.32, .05, .30, dark, .29, .87, 0);
  }
  const mesh=p.mesh(id);g.add(mesh); g.userData.kind = 'ranch-furniture'; g.userData.propType = id; g.userData.decorId = id;
  if(id==='ranch_trough'){
    g.userData.setFeedFilled=value=>{g.userData.feedFilled=!!value;mesh.geometry.setDrawRange(0,value?mesh.geometry.attributes.position.count:g.userData.feedVertexStart);};
    g.userData.setFeedFilled(filled);
  }
  return g;
}

/** 可用于弹窗/缩略图/场景销毁；同一实例内材质去重，工厂无跨实例共享资源。 */
export function disposeHomesteadModel(root) {
  const geometries = new Set(), materials = new Set(), instances = new Set(), skeletons = new Set();
  root?.traverse((o) => { if (o.geometry) geometries.add(o.geometry); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); if (o.isInstancedMesh) instances.add(o); if (o.skeleton) skeletons.add(o.skeleton); });
  instances.forEach((o) => o.dispose());
  skeletons.forEach((s) => s.dispose());
  geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); root?.removeFromParent();
}
