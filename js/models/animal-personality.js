// Articulated pasture animals. Each animal owns one material and each limb owns one skeleton.
import * as THREE from 'three';
import { applyAnimalMoment } from './animal-moments.js';

const TAU = Math.PI * 2, WHITE = '#fff8e9', EYE = '#51483f';
const clamp = THREE.MathUtils.clamp;
const styles = {
  cow: { stride: .32, speed: .28, duty: .70, lift: .052, bob: .006 },
  rabbit: { stride: .30, speed: .42, duty: .52, lift: .075, bob: .043 },
  sheep: { stride: .25, speed: .31, duty: .67, lift: .045, bob: .008 },
  goat: { stride: .32, speed: .37, duty: .65, lift: .065, bob: .010 },
  alpaca: { stride: .38, speed: .34, duty: .74, lift: .060, bob: .006 },
  chicken: { stride: .17, speed: .28, duty: .62, lift: .038, bob: .011 },
  duck: { stride: .15, speed: .22, duty: .70, lift: .026, bob: .007 },
};
function group(name) { const g = new THREE.Group(); g.name = name; g.userData.noMerge = true; return g; }
class ShapeParts {
  constructor() { this.items = []; }
  add(geometry, color, bone = -1, blend = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose(); this.items.push({ g, color: new THREE.Color(color), bone, blend }); return this;
  }
  ball(x, y, z, rx, ry, rz, color, bone = -1, segments = 8, rings = 4, tilt = 0, blend = false) {
    const g = new THREE.SphereGeometry(1, segments, rings); g.scale(rx, ry, rz); g.rotateZ(tilt); g.translate(x, y, z); return this.add(g, color, bone, blend);
  }
  cone(x, y, z, top, bottom, height, color, tilt = 0) {
    const g = new THREE.CylinderGeometry(top, bottom, height, 8); g.rotateZ(tilt); g.translate(x, y, z); return this.add(g, color);
  }
  limb(profile, color) {
    // Lathe surfaces must run sole-to-hip: reversing this order exposes the culled
    // inner wall at a bent joint, which looks like a thin fold despite valid IK.
    return this.add(new THREE.LatheGeometry([...profile].reverse().map(([r, y]) => new THREE.Vector2(r, y)), 8), color, 0, 'limb');
  }
  mesh(name, material, skin = null) {
    const count = this.items.reduce((n, p) => n + p.g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    const indices = skin ? new Uint16Array(count * 4) : null, weights = skin ? new Float32Array(count * 4) : null;
    let at = 0;
    for (const { g, color, bone, blend } of this.items) {
      const a = g.attributes.position; pos.set(a.array, at * 3); normals.set(g.attributes.normal.array, at * 3);
      for (let i = 0; i < a.count; i++) {
        const n = at + i, tint = g.attributes.color;
        colors.set(tint ? [tint.getX(i), tint.getY(i), tint.getZ(i)] : [color.r, color.g, color.b], n * 3);
        if (skin) {
          if (blend) {
            if (skin.lengths.length === 3) {
              const [upperArm, forearm, metacarpus] = skin.lengths, depth = -a.getY(i), wrist = upperArm + forearm, sole = wrist + metacarpus;
              let lo = 0, amount = clamp((depth - upperArm + .035) / .070, 0, 1);
              if (depth > wrist - .030) { lo = 1; amount = clamp((depth - wrist + .030) / .060, 0, 1); }
              if (depth > sole - .075) { lo = 2; amount = clamp((depth - sole + .075) / .045, 0, 1); }
              indices.set([lo, lo + 1, 0, 0], n * 4); weights.set([1 - amount, amount, 0, 0], n * 4);
            }
            else if (blend === 'limb' && a.getY(i) < -skin.upper - skin.lower + .095) { const foot = clamp((-a.getY(i) - skin.upper - skin.lower + .095) / .060, 0, 1); indices.set([1, 2, 0, 0], n * 4); weights.set([1 - foot, foot, 0, 0], n * 4); }
            else { const lower = clamp((-a.getY(i) - skin.upper + .055) / .11, 0, 1); indices.set([0, 1, 0, 0], n * 4); weights.set([1 - lower, lower, 0, 0], n * 4); }
          }
          else { indices[n * 4] = Math.max(0, bone); weights[n * 4] = 1; }
        }
      }
      at += a.count; g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (skin) { geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4)); geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4)); }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = skin ? new THREE.SkinnedMesh(geometry, material) : new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; mesh.userData.noMerge = mesh.userData.keep = true;
    // The bind pose is deliberately straight; the actual limb is immediately posed by IK.
    if (skin) mesh.frustumCulled = false;
    return mesh;
  }
}
// A single watertight surface carries the body silhouette, soft fleece and coat.
// Shared pole/ring vertices keep normals continuous through every shallow tuft.
function roundedBody(p, { center, size, color, segments = 32, rings = 12, profile = () => [1, 1, 0], fleece = 0, tufts = 22, fleeceWidth = .048, pattern = null, regions = [], radial = null, normalField = null }) {
  const positions = [], colors = [], directions = [], indices = [], base = new THREE.Color(color);
  const anchors = Array.isArray(tufts) ? tufts : Array.from({ length: tufts }, (_, i) => {
    const y = 1 - 2 * (i + .5) / tufts, r = Math.sqrt(1 - y * y), angle = i * 2.399963229728653;
    return [Math.cos(angle) * r, y, Math.sin(angle) * r];
  });
  function vertex(theta, phi) {
    const z = Math.cos(theta), ringRadius = Math.sin(theta), x = ringRadius * Math.cos(phi), y = ringRadius * Math.sin(phi);
    const [width, height, lift, depth = 1] = profile(z, y, x);
    let px = size[0] * x * width, py = size[1] * y * height + lift, pz = size[2] * z * depth;
    let puff = 0;
    if (fleece) {
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i], dot = x * a[0] + y * a[1] + z * a[2];
        puff += Math.exp((dot - 1) / fleeceWidth) * (.86 + .14 * Math.sin(i * 1.7));
      }
      const nx = x / size[0], ny = y / size[1], nz = z / size[2], len = Math.hypot(nx, ny, nz);
      px += nx / len * fleece * puff; py += ny / len * fleece * puff; pz += nz / len * fleece * puff;
    }
    if (radial) { const distance = radial(x, y, z); px = x * distance; py = y * distance; pz = z * distance; }
    positions.push(center[0] + px, center[1] + py, center[2] + pz);
    directions.push([x, y, z]);
    const tint = pattern ? pattern(x, y, z, base.clone()) : base.clone();
    // The underside is softly warmer; fleece ridges use a very small value range.
    tint.multiplyScalar(1 - Math.max(0, -y) * .035 + (fleece ? (Math.min(1, puff) - .45) * .060 : 0));
    colors.push(tint.r, tint.g, tint.b);
  }
  vertex(0, 0);
  for (let j = 1; j < rings; j++) for (let i = 0; i < segments; i++) vertex(Math.PI * j / rings, TAU * i / segments);
  const back = positions.length / 3; vertex(Math.PI, 0);
  for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + (i + 1) % segments);
  for (let j = 0; j < rings - 2; j++) for (let i = 0; i < segments; i++) {
    const a = 1 + j * segments + i, b = 1 + j * segments + (i + 1) % segments, c = a + segments, d = b + segments;
    indices.push(a, c, b, b, c, d);
  }
  const last = 1 + (rings - 2) * segments;
  for (let i = 0; i < segments; i++) indices.push(last + i, back, last + (i + 1) % segments);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  if (normalField) {
    const attr = geometry.attributes.position, normals = geometry.attributes.normal, e = .0001;
    for (let i = 0; i < attr.count; i++) {
      const x = attr.getX(i) - center[0], y = attr.getY(i) - center[1], z = attr.getZ(i) - center[2];
      const nx = normalField(x + e, y, z) - normalField(x - e, y, z), ny = normalField(x, y + e, z) - normalField(x, y - e, z), nz = normalField(x, y, z + e) - normalField(x, y, z - e), length = Math.hypot(nx, ny, nz) || 1;
      normals.setXYZ(i, nx / length, ny / length, nz / length);
    }
  }
  p.add(regions.length ? coatBoundaries(geometry, directions, regions) : geometry, color);
}
function fusedFleece(p, { center, core, balls, color, segments, rings, blend = .06 }) {
  const soften = Math.max(.05, blend);
  function field(x, y, z) {
    const k0 = Math.hypot(x / core[0], y / core[1], z / core[2]);
    const k1 = Math.hypot(x / (core[0] * core[0]), y / (core[1] * core[1]), z / (core[2] * core[2]));
    let distance = k1 > 1e-8 ? k0 * (k0 - 1) / k1 : -Math.min(...core);
    for (const [bx, by, bz, r] of balls) {
      const other = Math.hypot(x - bx, y - by, z - bz) - r;
      const h = clamp(.5 + .5 * (other - distance) / soften, 0, 1);
      distance = other + (distance - other) * h - soften * h * (1 - h);
    }
    return distance;
  }
  function radius(x, y, z) {
    let lo = 0, hi = Math.max(...core) + .20;
    for (let step = 0; step < 20; step++) {
      const mid = (lo + hi) * .5;
      if (field(x * mid, y * mid, z * mid) <= 0) lo = mid; else hi = mid;
    }
    return (lo + hi) * .5;
  }
  roundedBody(p, { center, size: core, color, segments, rings, radial: radius });
}
// Split the existing skin at coat boundaries. Colours stay crisp without raised
// patches, texture resources, extra draws, or gaps in the underlying body.
function coatBoundaries(geometry, directions, regions) {
  const output = { position: [], normal: [], color: [] }, a = geometry.attributes;
  const point = i => ({ p: [a.position.getX(i), a.position.getY(i), a.position.getZ(i)], n: [a.normal.getX(i), a.normal.getY(i), a.normal.getZ(i)], c: [a.color.getX(i), a.color.getY(i), a.color.getZ(i)], d: directions[i] });
  const mix = (a, b, t) => Object.fromEntries(['p', 'n', 'c', 'd'].map(k => [k, a[k].map((v, i) => v + (b[k][i] - v) * t)]));
  function clip(poly, field, inside) {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = field(...a.d), fb = field(...b.d), ka = inside ? fa <= 0 : fa >= 0, kb = inside ? fb <= 0 : fb >= 0;
      if (ka) result.push(a);
      if (ka !== kb) result.push(mix(a, b, fa / (fa - fb)));
    }
    return result;
  }
  function emit(poly, tint) {
    for (let i = 1; i + 1 < poly.length; i++) for (const v of [poly[0], poly[i], poly[i + 1]]) {
      const length = Math.hypot(...v.n) || 1;
      output.position.push(...v.p); output.normal.push(...v.n.map(n => n / length)); output.color.push(...(tint || v.c));
    }
  }
  for (let i = 0; i < geometry.index.count; i += 3) {
    let pending = [[point(geometry.index.getX(i)), point(geometry.index.getX(i + 1)), point(geometry.index.getX(i + 2))]];
    for (const region of regions) {
      const next = [], color = new THREE.Color(region.color);
      for (const polygon of pending) { emit(clip(polygon, region.field, true), [color.r, color.g, color.b]); const remainder = clip(polygon, region.field, false); if (remainder.length >= 3) next.push(remainder); }
      pending = next;
    }
    for (const polygon of pending) emit(polygon);
  }
  const result = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'color']) result.setAttribute(key, new THREE.Float32BufferAttribute(output[key], 3));
  geometry.dispose(); return result;
}
function attach(parent, name, p, material, x = 0, y = 0, z = 0) {
  const g = group(name); g.position.set(x, y, z); g.add(p.mesh(name + '-mesh', material)); parent.add(g); return g;
}
function face(p, y, z, separation, size = .022, cheek = '#edc6b4') {
  for (const s of [-1, 1]) {
    p.ball(s * separation, y, z, size, size * 1.15, size * .62, EYE);
    p.ball(s * separation - size * .26, y + size * .34, z + size * .55, size * .27, size * .29, size * .18, WHITE, -1, 6, 3);
    p.ball(s * (separation + .028), y - .039, z - .006, .032, .018, .012, cheek, -1, 6, 3);
  }
}
function palette(coat) {
  const dark = coat === 2 || coat === 'black', brown = coat === 1 || coat === 'brown';
  return { dark, brown, cream: dark ? '#b5b0aa' : brown ? '#e3c5a5' : '#fff2db', light: dark ? '#cfcbc1' : brown ? '#eedac0' : '#fff7e6', fur: dark ? '#9e9890' : brown ? '#cba37d' : '#f2e4cd', skin: dark ? '#a79c92' : brown ? '#c9a383' : '#d8bfa2', pink: dark ? '#c8aba5' : '#e5bdb2' };
}

// A leg is a single draw call, with a real knee/hock and independently levelled foot.
// Shape recipes below are species specific; only the solver and resource plumbing are shared.
function articulatedLeg(parent, material, spec, draw) {
  const { x, y, z, upper, lower, role, bend, phaseOffset = 0, restZ = 0 } = spec;
  const lengths = spec.lengths || [upper, lower], front = lengths.length === 3;
  const jointNames = front ? ['shoulder', 'elbow', 'carpus', 'foot'] : ['upper', 'lower', 'foot'];
  const segmentNames = front ? ['upper-arm', 'forearm', 'metacarpus'] : ['upper-limb', 'lower-limb'];
  const p = new ShapeParts(); draw(p, ...lengths);
  if (front) {
    // Shoulder skin blends inward into the existing chest, while the elbow and
    // distal limb keep their solved locations. No separate shoulder ball/cap.
    const inset = -Math.sign(x) * (spec.upperInset || .025), span = lengths[0] + .020;
    for (const { g } of p.items) {
      const pos = g.attributes.position, normal = g.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const u = clamp((pos.getY(i) + lengths[0]) / span, 0, 1), amount = u * u * (3 - 2 * u);
        pos.setX(i, pos.getX(i) + inset * amount);
        const nx = normal.getX(i), ny = normal.getY(i) - inset * 6 * u * (1 - u) / span * nx, nz = normal.getZ(i), norm = Math.hypot(nx, ny, nz) || 1;
        normal.setXYZ(i, nx / norm, ny / norm, nz / norm);
      }
    }
  }
  const mesh = p.mesh(role + '-skin', material, { upper, lower, lengths });
  const bones = jointNames.map(n => { const b = new THREE.Bone(); b.name = role + '-' + n; return b; });
  for (let i = 1; i < bones.length; i++) { bones[i].position.y = -lengths[i - 1]; bones[i - 1].add(bones[i]); } mesh.add(bones[0]);
  const skeleton = new THREE.Skeleton(bones); mesh.bind(skeleton);
  const limb = group('leg:' + role); limb.position.set(x, y, z); limb.add(mesh); parent.add(limb);
  const attr = mesh.geometry.attributes.position, skin = mesh.geometry.attributes.skinIndex, footVertexIndices = [];
  const footBoneIndex = lengths.length, totalLength = lengths.reduce((sum, v) => sum + v, 0);
  for (let i = 0; i < attr.count; i++) if (skin.getX(i) === footBoneIndex && Math.abs(attr.getY(i) + totalLength) < .00001) footVertexIndices.push(i);
  limb.userData.rig = { mesh, bones, lengths, jointNames, segmentNames, footBoneIndex, hip: [x, y, z], bend, role, phaseOffset, restZ, footVertexIndices, footTarget: { x, y: 0, z: z + restZ }, contact: true, phase: 0, jointAngles: new Array(lengths.length).fill(0), carpusRest: spec.carpusRest || .04, carpusSwing: spec.carpusSwing || .58 };
  return limb;
}
function cowLeg(p, a, b, c, back) {
  const h = a + b;
  p.limb([[0,.070],[.071,.045],[back?.085:.078,-.025],[.076,-a*.55],[.064,-a+.045],[.066,-a],[.059,-a-.045],[.048,-h+.095],[.048,-h+.047],[0,-h+.041]],c.cream);
  for (const s of [-1, 1]) p.ball(s * .039, -h + .040, .025, .043, .040, .087, '#aa9580', 2);
}
function cowForeleg(p, a, b, c, palette) {
  const wrist = a + b, h = wrist + c;
  p.limb([[0,.050],[.052,.022],[.058,-.035],[.052,-a+.030],[.050,-a],[.049,-a-.035],[.040,-wrist+.035],[.043,-wrist],[.038,-wrist-.035],[.036,-h+.095],[.044,-h+.052],[0,-h+.040]],palette.cream);
  for (const s of [-1,1]) p.ball(s*.039,-h+.040,.025,.043,.040,.087,'#aa9580',3);
}
function sheepForeleg(p,a,b,c,palette,shorn) {
  const wrist=a+b,h=wrist+c;
  p.limb([[0,.045],[shorn?.048:.061,.018],[shorn?.050:.066,-.028],[.049,-a+.026],[.044,-a],[.041,-a-.030],[.031,-wrist+.030],[.035,-wrist],[.030,-wrist-.030],[.030,-h+.072],[.034,-h+.044],[0,-h+.035]],shorn?palette.skin:palette.cream);
  if(!shorn)for(const s of[-1,1])p.ball(s*.030,-.065,.004,.031,.037,.037,palette.cream,0,6,3);
  for(const s of[-1,1])p.ball(s*.028,-h+.029,.023,.030,.029,.057,'#ae9c84',3,6,4);
}
function goatForeleg(p,a,b,c,palette) {
  const wrist=a+b,h=wrist+c;
  p.limb([[0,.048],[.047,.019],[.052,-.030],[.044,-a+.030],[.039,-a],[.036,-a-.034],[.027,-wrist+.030],[.031,-wrist],[.025,-wrist-.034],[.024,-h+.085],[.028,-h+.048],[0,-h+.038]],palette.fur);
  for(const s of[-1,1])p.ball(s*.024,-h+.026,.023,.026,.026,.053,'#a58b74',3,6,4);
}
function alpacaForeleg(p,a,b,c,palette,shorn) {
  const wrist=a+b,h=wrist+c;
  p.limb([[0,.048],[shorn?.040:.055,.021],[shorn?.044:.058,-.035],[shorn?.037:.048,-a+.030],[.037,-a],[.033,-a-.037],[.027,-wrist+.032],[.031,-wrist],[.025,-wrist-.035],[.024,-h+.095],[.026,-h+.074],[.029,-h+.048],[0,-h+.034]],palette.cream);
  for(const s of[-1,1])p.ball(s*.029,-h+.026,.032,.033,.026,.071,palette.fur,3);
}
function rabbitForeleg(p,a,b,c,palette) {
  const wrist=a+b,h=wrist+c;
  p.limb([[0,.032],[.026,.013],[.030,-.025],[.030,-a+.024],[.031,-a],[.028,-a-.025],[.025,-wrist+.026],[.029,-wrist],[.024,-wrist-.026],[.033,-h+.030],[0,-h+.025]],palette.cream);
  p.ball(0,-h+.028,.036,.047,.028,.079,palette.light,3,10,4);
}
function rabbitLeg(p, a, b, c, back) {
  const h = a + b;
  if (back) {
    p.ball(0, -.015, -.016, .094, .110, .112, c.fur, 0, 12, 6);
    p.limb([[0,.038],[.067,.016],[.063,-.075],[.049,-a+.045],[.048,-a],[.037,-a-.040],[.030,-h+.100],[.038,-h+.050],[0,-h+.040]],c.cream);
    p.ball(0, -h + .034, .069, .074, .034, .158, c.light, 2, 12, 5);
    p.ball(0, -h + .047, .151, .043, .014, .046, '#e9d0c7', 2);
  } else {
    p.limb([[0,.035],[.042,.015],[.046,-.035],[.034,-a+.032],[.035,-a],[.029,-a-.030],[.027,-h+.055],[.034,-h+.030],[0,-h+.025]],c.cream);
    p.ball(0, -h + .028, .036, .047, .028, .079, c.light, 2, 10, 4);
  }
}

function buildCow(g, mat, c) {
  const b = new ShapeParts(), h = new ShapeParts(), t = new ShapeParts();
  const spot = c.brown ? '#af8569' : c.dark ? '#7e7971' : '#8b7b6b';
  roundedBody(b, { center: [0, .59, -.075], size: [.355, .307, .49], color: c.light, segments: 24, rings: 9,
    profile: (z, y) => [1.015 + .035 * Math.exp(-Math.pow((z - .4) / .5, 2)) + .025 * Math.exp(-Math.pow((z + .55) / .4, 2)), 1 + (y < -.5 ? .04 * Math.exp(-Math.pow((z + .15) / .35, 2)) : .012), .010 * z],
    regions: [
      { color: spot, field: (x, y, z) => Math.max(x + .35, ((y - .16) / .42) ** 2 + ((z + .28) / .40) ** 2 - 1) },
      { color: spot, field: (x, y, z) => Math.max(.35 - x, ((y - .23) / .40) ** 2 + ((z - .04) / .35) ** 2 - 1) },
      { color: spot, field: (x, y, z) => Math.max(.50 - y, ((x - .24) / .38) ** 2 + ((z + .23) / .34) ** 2 - 1) },
    ] });
  b.ball(0, .335, -.15, .12, .065, .14, c.pink, -1, 8, 4);
  const body = attach(g, 'body', b, mat), legs = [];
  for (const s of [-1, 1]) {
    const side=s<0?'-left':'-right', phase=s>0?.5:0;
    legs.push(articulatedLeg(body,mat,{x:s*.225,y:.405,z:-.34,upper:.24,lower:.205,role:'hind'+side,bend:-1,restZ:.018,phaseOffset:phase+.25},(p,a,b)=>cowLeg(p,a,b,c,true)));
    legs.push(articulatedLeg(body,mat,{x:s*.225,y:.550,z:.235,lengths:[.170,.255,.190],role:'front'+side,bend:-1,restZ:-.034,phaseOffset:phase,carpusRest:.035,carpusSwing:.52,upperInset:.055},(p,a,b,q)=>cowForeleg(p,a,b,q,c)));
  }
  h.ball(0, .025, 0, .25, .235, .225, c.light, -1, 18, 8);
  h.ball(0, -.095, .178, .223, .115, .140, c.pink, -1, 16, 8);
  for (const s of [-1, 1]) {
    h.ball(s * .080, -.081, .303, .023, .015, .009, '#ac8379');
    h.ball(s * .258, .10, -.012, .111, .055, .063, c.cream, -1, 10, 5, s * .25);
    h.ball(s * .271, .108, .039, .062, .025, .015, c.pink);
    h.cone(s * .136, .249, -.054, .006, .031, .097, '#d6be96', -s * .25);
  }
  h.ball(-.105, .073, .198, .064, .077, .022, spot); face(h, .038, .214, .102, .024, c.pink);
  const head = attach(body, 'head', h, mat, 0, .765, .43);
  t.ball(0, -.14, 0, .021, .16, .022, c.fur); t.ball(0, -.288, .004, .037, .057, .039, spot);
  const tail = attach(body, 'tail', t, mat, 0, .67, -.55); return { body, head, legs, tail, wings: [] };
}
function buildRabbit(g, mat, c) {
  const b = new ShapeParts(), h = new ShapeParts(), t = new ShapeParts();
  const rabbitChest = new THREE.Color(c.light);
  roundedBody(b, { center: [0, .275, -.035], size: [.205, .232, .29], color: c.cream, segments: 28, rings: 10,
    profile: z => [1.06 - .14 * z, 1 - .10 * z, -.025 * z],
    pattern: (x, y, z, base) => base.lerp(rabbitChest, THREE.MathUtils.smoothstep(z, .1, .75) * .65) });
  const body = attach(g, 'body', b, mat), legs = [];
  for(const s of[-1,1]){
    const side=s<0?'-left':'-right';
    legs.push(articulatedLeg(body,mat,{x:s*.143,y:.246,z:-.13,upper:.19,lower:.18,bend:-1,restZ:.022,role:'hind'+side,phaseOffset:.16},(p,a,b)=>rabbitLeg(p,a,b,c,true)));
    legs.push(articulatedLeg(body,mat,{x:s*.105,y:.290,z:.155,lengths:[.090,.135,.105],bend:-1,restZ:-.010,role:'front'+side,phaseOffset:0,carpusRest:.10,carpusSwing:.62,upperInset:.022},(p,a,b,q)=>rabbitForeleg(p,a,b,q,c)));
  }
  h.ball(0, .016, .014, .168, .16, .151, c.cream, -1, 18, 8);
  h.ball(-.044, -.047, .139, .055, .043, .043, c.light, -1, 10, 5); h.ball(.044, -.047, .139, .055, .043, .043, c.light, -1, 10, 5);
  for (const s of [-1, 1]) {
    h.ball(s * .075, .278, -.009, .045, .191, .033, c.cream, -1, 12, 6, -s * .105);
    h.ball(s * .077, .279, .021, .022, .145, .011, c.pink, -1, 10, 5, -s * .105);
  }
  face(h, .035, .141, .078, .020, c.pink); h.ball(0, -.035, .183, .022, .016, .012, '#c28e8d');
  const head = attach(body, 'head', h, mat, 0, .417, .17);
  t.ball(0, 0, 0, .077, .077, .077, c.light, -1, 12, 6); const tail = attach(body, 'tail', t, mat, 0, .27, -.316);
  return { body, head, legs, tail, wings: [] };
}

function sheepLeg(p, a, b, c, back, shorn) {
  const h = a + b;
  // Fleece ends in a scalloped cuff; short exposed forearms and rear hocks differ.
  p.limb([[0,.053],[shorn?.055:.077,.026],[shorn?.060:.076,-.040],[.057,-a+.055],[.043,-a+.020],[.044,-a],[.037,-a-.040],[.034,-h+.060],[0,-h+.040]],shorn?c.skin:c.cream);
  if (!shorn) for (const s of [-1, 1]) p.ball(s * .035, -.079, .006, .035, .041, .041, c.cream, 0, 6, 3);
  for (const s of [-1, 1]) p.ball(s * .028, -h + .029, .023, .030, .029, .057, '#ae9c84', 2, 6, 4);
}
function goatLeg(p, a, b, c, back) {
  const h = a + b;
  // The hind thigh is long and set forward; the hock points behind the body.
  p.limb([[0,.054],[back?.057:.048,.025],[back?.060:.050,-.052],[.044,-a+.055],[.038,-a+.020],[.042,-a],[.031,-a-.045],[.025,-h+.100],[.029,-h+.050],[0,-h+.040]],c.fur);
  for (const s of [-1, 1]) p.ball(s * .024, -h + .026, .023, .026, .026, .053, '#a58b74', 2, 6, 4);
}
function alpacaLeg(p, a, b, c, back, shorn) {
  const h = a + b;
  p.limb([[0,.058],[shorn?.044:.064,.030],[shorn?.047:.065,-.045],[shorn?.040:.058,-a+.085],[.039,-a+.025],[.040,-a],[.030,-a-.055],[.025,-h+.11],[.029,-h+.052],[0,-h+.035]],c.cream);
  // Two soft oval toes, no hard block hoof; warm toe pads peek out of the fur.
  for (const s of [-1, 1]) {
    p.ball(s * .029, -h + .026, .032, .033, .026, .071, c.fur, 2);
    p.ball(s * .029, -h + .026, .089, .017, .014, .018, '#baa08b', 2, 6, 3);
  }
}
function chickenLeg(p, a, b, c) {
  const h = a + b;
  p.ball(0, -.035, -.006, .051, .079, .058, c.cream, 0);
  p.limb([[0,-a+.050],[.020,-a+.040],[.024,-a+.015],[.025,-a],[.018,-a-.028],[.016,-h+.050],[.023,-h+.022],[0,-h+.015]],'#dab477');
  p.ball(0, -h + .021, 0, .030, .021, .031, '#e2bc7c', 2);
  for (const s of [-1, 0, 1]) p.ball(s * .025, -h + .012, .036, .011, .012, s === 0 ? .061 : .047, '#e2bc7c', 2, 6, 4);
  p.ball(0, -h + .013, -.034, .011, .013, .036, '#cfa66a', 2, 6, 3);
}
function duckLeg(p, a, b, c) {
  const h = a + b;
  p.ball(0, -.026, -.012, .050, .062, .055, c.cream, 0);
  p.limb([[0,-a+.040],[.025,-a+.026],[.027,-a],[.023,-a-.028],[.022,-h+.048],[.027,-h+.018],[0,-h+.012]],'#ddb376');
  const web = new THREE.Shape(); web.moveTo(-.021, -.030); web.quadraticCurveTo(-.040, -.014, -.073, .060); web.quadraticCurveTo(-.077, .084, -.047, .079); web.quadraticCurveTo(-.021, .097, 0, .080); web.quadraticCurveTo(.025, .097, .048, .078); web.quadraticCurveTo(.078, .082, .071, .059); web.quadraticCurveTo(.031, -.016, .020, -.030); web.closePath();
  const geo = new THREE.ExtrudeGeometry(web, { depth: .014, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 1, curveSegments: 3, steps: 1 }); geo.rotateX(-Math.PI / 2); geo.translate(0, -h + .004, 0); p.add(geo, '#e5b97c', 2);
}
function buildSheep(g, mat, c, shorn) {
  const b = new ShapeParts(), h = new ShapeParts(), t = new ShapeParts();
  if (shorn) roundedBody(b, { center: [0, .45, -.025], size: [.275, .234, .343], color: c.skin, segments: 24, rings: 16,
    profile: z => [1.025 - .025 * z, 1.015 - .015 * z, .005 * z] });
  else {
    // Real round caps merge into the underlying torso. This preserves circular
    // cloud arcs and shallow valleys instead of turning the whole sheep polygonal.
    const core = [.275, .234, .343], balls = Array.from({ length: 18 }, (_, i) => {
      const y = 1 - 2 * (i + .5) / 18, r = Math.sqrt(1 - y * y), angle = i * 2.399963229728653;
      return [core[0] * Math.cos(angle) * r * .83, core[1] * y * .83, core[2] * Math.sin(angle) * r * .83, .107 + .006 * Math.sin(i * 1.7)];
    });
    fusedFleece(b, { center: [0, .45, -.025], core, balls, color: c.cream, segments: 32, rings: 24, blend: .060 });
  }
  const body = attach(g, 'body', b, mat), legs = [];
  for(const s of[-1,1]){
    const side=s<0?'-left':'-right',phase=s>0?.5:0;
    legs.push(articulatedLeg(body,mat,{x:s*.168,y:.315,z:-.215,upper:.185,lower:.172,bend:-1,restZ:.016,role:'hind'+side,phaseOffset:phase+.50},(p,a,b)=>sheepLeg(p,a,b,c,true,shorn)));
    legs.push(articulatedLeg(body,mat,{x:s*.168,y:.435,z:.180,lengths:[.125,.185,.160],bend:-1,restZ:-.024,role:'front'+side,phaseOffset:phase,carpusRest:.045,carpusSwing:.55},(p,a,b,q)=>sheepForeleg(p,a,b,q,c,shorn)));
  }
  h.ball(0, -.008, .020, .150, .166, .151, c.skin, -1, 18, 8);
  h.ball(0, -.085, .125, .123, .072, .101, c.fur, -1, 12, 6);
  for (const s of [-1,1]) { h.ball(s*.165,.032,.012,.094,.039,.052,c.skin,-1,10,5,-s*.30); h.ball(s*.175,.037,.054,.052,.021,.012,c.pink,-1,6,3); }
  if (!shorn) fusedFleece(h, { center: [0, .115, .015], core: [.130, .046, .075], balls: [[-.075, .006, 0, .064], [0, .014, .005, .070], [.075, .006, 0, .064]], color: c.light, segments: 24, rings: 5, blend: .018 });
  face(h,.014,.163,.073,.020,c.pink); h.ball(0,-.076,.222,.024,.015,.012,'#927f6c',-1,6,3);
  const head=attach(body,'head',h,mat,0,.536,.305);
  t.ball(0,0,0,.063,.080,.073,c.cream,-1,10,5); const tail=attach(body,'tail',t,mat,0,.445,-.355);
  return {body,head,legs,tail,wings:[]};
}
function buildGoat(g, mat, c) {
  const b=new ShapeParts(),h=new ShapeParts(),t=new ShapeParts();
  const goatChest = new THREE.Color(c.cream);
  roundedBody(b, { center: [0, .535, -.025], size: [.246, .237, .39], color: c.fur, segments: 28, rings: 11,
    profile: z => [1.025 + .030 * z, 1 + .055 * Math.max(0, z), .012 * z],
    pattern: (x, y, z, base) => base.lerp(goatChest, THREE.MathUtils.smoothstep(z, .05, .7) * .7) });
  const body=attach(g,'body',b,mat),legs=[];
  for(const s of[-1,1]){
    const side=s<0?'-left':'-right',phase=s>0?.5:0;
    legs.push(articulatedLeg(body,mat,{x:s*.154,y:.385,z:-.245,upper:.245,lower:.215,bend:-1,restZ:.018,role:'hind'+side,phaseOffset:phase+.48},(p,a,b)=>goatLeg(p,a,b,c,true)));
    legs.push(articulatedLeg(body,mat,{x:s*.154,y:.530,z:.210,lengths:[.160,.225,.180],bend:-1,restZ:-.034,role:'front'+side,phaseOffset:phase,carpusRest:.04,carpusSwing:.62},(p,a,b,q)=>goatForeleg(p,a,b,q,c)));
  }
  h.ball(0,.010,.018,.159,.19,.149,c.cream,-1,18,8); h.ball(0,-.085,.135,.119,.078,.123,c.fur,-1,12,6);
  for(const s of [-1,1]) { h.ball(s*.173,.062,-.006,.104,.040,.052,c.fur,-1,10,5,s*.30); h.ball(s*.183,.068,.033,.058,.020,.013,c.pink,-1,6,3); h.cone(s*.096,.267,-.059,.006,.029,.236,'#baa280',-s*.20); }
  h.ball(0,-.204,.111,.035,.080,.040,c.light,-1,8,5); face(h,.030,.153,.074,.020,c.pink); h.ball(0,-.080,.252,.025,.014,.010,'#947b65',-1,6,3);
  const head=attach(body,'head',h,mat,0,.671,.325); t.ball(0,.025,0,.051,.102,.051,c.light,-1,10,5,-.25); const tail=attach(body,'tail',t,mat,0,.595,-.395);
  return {body,head,legs,tail,wings:[]};
}
function buildAlpaca(g,mat,c,shorn){
  const b=new ShapeParts(),h=new ShapeParts(),t=new ShapeParts();
  roundedBody(b, { center: [0, .63, -.065], size: shorn ? [.235, .235, .385] : [.283, .241, .398], color: c.cream, segments: 24, rings: 10,
    profile: z => [1.02 + .025 * z, 1 + .035 * Math.max(0, z), .014 * z], fleece: shorn ? .001 : .016, tufts: 20, fleeceWidth: .065 });
  const body=attach(g,'body',b,mat),legs=[];
  for(const s of[-1,1]){
    const side=s<0?'-left':'-right',phase=s>0?.5:0;
    legs.push(articulatedLeg(body,mat,{x:s*.167,y:.467,z:-.275,upper:.265,lower:.258,bend:-1,restZ:.016,role:'hind'+side,phaseOffset:phase+.08},(p,a,b)=>alpacaLeg(p,a,b,c,true,shorn)));
    legs.push(articulatedLeg(body,mat,{x:s*.167,y:.650,z:.195,lengths:[.160,.285,.245],bend:-1,restZ:-.031,role:'front'+side,phaseOffset:phase,carpusRest:.035,carpusSwing:.48,upperInset:.035},(p,a,b,q)=>alpacaForeleg(p,a,b,q,c,shorn)));
  }
  h.ball(0,-.23,-.036,shorn?.091:.108,.30,.108,c.cream,-1,16,8);
  h.ball(0,.037,.018,.150,.153,.142,c.cream,-1,18,8);
  h.ball(0,-.033,.137,.112,.073,.112,c.fur,-1,12,6);
  for(const s of[-1,1]){h.ball(s*.087,.247,-.012,.039,.105,.036,c.cream,-1,10,5,-s*.12);h.ball(s*.088,.251,.019,.019,.072,.011,c.pink,-1,8,4);}
  if(!shorn)for(const x of[-.063,0,.063])h.ball(x,.157,.055,.057,.052,.062,c.light,-1,8,4);
  face(h,.044,.145,.071,.020,c.pink);h.ball(0,-.025,.241,.023,.014,.011,'#9b816d',-1,6,3);
  const head=attach(body,'head',h,mat,0,1.03,.28);t.ball(0,.008,0,.046,.096,.050,c.cream,-1,8,5,-.22);const tail=attach(body,'tail',t,mat,0,.66,-.447);
  return{body,head,legs,tail,wings:[]};
}
function buildChicken(g,mat,c){
  const b=new ShapeParts(),h=new ShapeParts(),tail=new ShapeParts();
  roundedBody(b, { center: [0, .305, -.018], size: [.226, .235, .242], color: c.cream, segments: 28, rings: 9,
    profile: z => [1.035 + .025 * z, 1.015 + .025 * z, .015 * z] });
  const body=attach(g,'body',b,mat),legs=[],wings=[];
  for(const s of[-1,1]){legs.push(articulatedLeg(body,mat,{x:s*.083,y:.177,z:.025,upper:.095,lower:.118,bend:-1,restZ:.018,role:s<0?'left':'right',phaseOffset:s<0?0:.5},(p,a,q)=>chickenLeg(p,a,q,c)));const w=new ShapeParts();w.ball(0,-.025,0,.058,.138,.137,c.fur,-1,12,6,s*.10);wings.push(attach(body,'wing',w,mat,s*.204,.327,-.033));}
  h.ball(0,.019,0,.157,.161,.147,c.cream,-1,20,10);
  for(const[x,y]of[[-.054,.170],[0,.192],[.054,.168]])h.ball(x,y,-.012,.033,.053,.025,'#df9997',-1,8,4);
  h.ball(0,-.023,.139,.025,.041,.023,'#d59391',-1,8,4);h.ball(0,.018,.162,.046,.027,.057,'#e1b063',-1,10,5);face(h,.065,.132,.067,.017,c.pink);
  const head=attach(body,'head',h,mat,0,.435,.138);
  for(const[x,y,z,r]of[[-.06,.015,0,-.22],[0,.045,-.020,0],[.06,.015,0,.22]])tail.ball(x,y,z,.047,.124,.043,c.fur,-1,10,5,r);
  const tailNode=attach(body,'tail',tail,mat,0,.374,-.232);return{body,head,legs,tail:tailNode,wings};
}
function buildDuck(g,mat,c){
  const b=new ShapeParts(),h=new ShapeParts(),t=new ShapeParts();
  roundedBody(b, { center: [0, .272, -.070], size: [.231, .187, .320], color: c.cream, segments: 28, rings: 8,
    profile: z => [1.03 + .035 * z, 1 - .04 * z, -.012 * z] });
  const body=attach(g,'body',b,mat),legs=[],wings=[];
  for(const s of[-1,1]){legs.push(articulatedLeg(body,mat,{x:s*.088,y:.157,z:.007,upper:.088,lower:.104,bend:-1,restZ:.016,role:s<0?'left':'right',phaseOffset:s<0?0:.5},(p,a,q)=>duckLeg(p,a,q,c)));const w=new ShapeParts();w.ball(0,-.020,0,.052,.110,.176,c.fur,-1,12,6);wings.push(attach(body,'wing',w,mat,s*.218,.287,-.105));}
  h.ball(0,-.060,-.024,.086,.116,.090,c.cream,-1,12,6);h.ball(0,.035,.017,.154,.152,.155,c.dark?'#86a18d':c.cream,-1,20,10);
  h.ball(0,-.022,.189,.101,.029,.105,'#e9bc72',-1,14,6);h.ball(0,-.035,.188,.097,.015,.098,'#d7a565',-1,10,4);
  for(const s of[-1,1])h.ball(s*.034,-.005,.243,.008,.004,.008,'#b89662',-1,6,3);face(h,.065,.154,.068,.018,c.pink);
  const head=attach(body,'head',h,mat,0,.433,.163);t.ball(0,.025,-.02,.092,.058,.14,c.cream,-1,12,6);const tail=attach(body,'tail',t,mat,0,.323,-.326);
  return{body,head,legs,tail,wings};
}

const BUILD = { cow: buildCow, rabbit: buildRabbit, sheep: buildSheep, goat: buildGoat, alpaca: buildAlpaca, chicken: buildChicken, duck: buildDuck };
export function createPersonalityAnimal(species, { coat = 'cream', shorn = false } = {}) {
  const g = group('animal:' + species), material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82 });
  const parts = BUILD[species](g, material, palette(coat), shorn);
  const hearts = new ShapeParts(); hearts.ball(-.023, 0, 0, .033, .035, .012, '#dc8caa', -1, 8, 4, -.5); hearts.ball(.023, 0, 0, .033, .035, .012, '#dc8caa', -1, 8, 4, .5);
  parts.heart = attach(g, 'pet-heart', hearts, material); parts.heart.visible = false;
  const style = styles[species];
  g.userData = { noMerge: true, kind: 'homestead-animal', species, coat, shorn: !!shorn, parts, floorY: 0, height: 1, bodyBaseY: 0, headBase: { x: parts.head.position.x, y: parts.head.position.y, z: parts.head.position.z }, locomotion: { ...style, phase: 0, cycleDistance: 0, species } };
  animatePersonalityAnimal(g, 0, 'idle');
  parts.legs.forEach(l => l.userData.rig.mesh.computeBoundingBox());
  g.userData.height = new THREE.Box3().setFromObject(parts.body).max.y + .05; parts.heart.position.set(0, g.userData.height, .12);
  return g;
}
function poseLeg(limb, targetY, targetZ, bodyY, stepLift = .05) {
  const rig = limb.userData.rig, [a, b, c] = rig.lengths, y = targetY - bodyY - rig.hip[1], z = targetZ - rig.hip[2];
  if (rig.lengths.length === 3) {
    // The elbow is a high, caudal joint hidden by the chest. The exposed lower
    // joint is the carpus: almost straight under load, flexed during recovery.
    // Treat forearm+metacarpus as one virtual link, solve shoulder/elbow, then
    // unpack its angle into the two physical links without changing the foot.
    const wrist = THREE.MathUtils.lerp(rig.carpusRest, rig.carpusSwing, clamp(targetY / stepLift, 0, 1));
    const effective = Math.sqrt(b * b + c * c + 2 * b * c * Math.cos(wrist));
    const reachSquared = y * y + z * z;
    const virtualElbow = -Math.acos(clamp((reachSquared - a * a - effective * effective) / (2 * a * effective), -.99999, .99999));
    const shoulder = Math.atan2(-z, -y) - Math.atan2(effective * Math.sin(virtualElbow), a + effective * Math.cos(virtualElbow));
    const elbow = virtualElbow - Math.atan2(c * Math.sin(wrist), b + c * Math.cos(wrist));
    rig.bones[0].rotation.x = shoulder; rig.bones[1].rotation.x = elbow; rig.bones[2].rotation.x = wrist; rig.bones[3].rotation.x = -shoulder - elbow - wrist;
    rig.jointAngles[0] = shoulder; rig.jointAngles[1] = elbow; rig.jointAngles[2] = wrist;
    rig.footTarget.y = targetY; rig.footTarget.z = targetZ; return;
  }
  const distance = Math.hypot(y, z), knee = rig.bend * Math.acos(clamp((distance * distance - a * a - b * b) / (2 * a * b), -.99999, .99999));
  const upper = Math.atan2(-z, -y) - Math.atan2(b * Math.sin(knee), a + b * Math.cos(knee));
  rig.bones[0].rotation.x = upper; rig.bones[1].rotation.x = knee; rig.bones[2].rotation.x = -upper - knee;
  rig.jointAngles[0] = upper; rig.jointAngles[1] = knee; rig.footTarget.y = targetY; rig.footTarget.z = targetZ;
}
export function animatePersonalityAnimal(g, t = 0, action = 'idle', motion) {
  const d = g?.userData; if (!d?.locomotion) return;
  const moment = action === 'idle' && motion?.moment?.species === d.species ? motion.moment : null;
  const time = Number.isFinite(moment?.age) ? moment.age : Number.isFinite(t) ? t : 0, { body, head, legs, tail, wings, heart } = d.parts, cfg = styles[d.species];
  const walk = action === 'walk' || action === 'follow', eat = action === 'eat' || action === 'feed', pet = action === 'pet' || action === 'brush', sleep = action === 'sleep';
  const distance = walk ? (Number.isFinite(motion?.distance) ? motion.distance : time * cfg.speed) : 0;
  const cycle = distance / cfg.stride, phase = ((cycle % 1) + 1) % 1, wave = Math.sin(phase * TAU);
  const bounce = d.species === 'rabbit' ? Math.pow(Math.max(0, Math.sin((phase - .40) * TAU)), 2) : Math.abs(wave);
  // Only live-world playback keeps a brief transition history. Gallery calls stay
  // seekable and deterministic, including jumping straight from sleep to idle.
  if (motion && d.motionState && d.motionState.walk !== walk) {
    const feet = legs.map(l => ({ ...l.userData.rig.footTarget }));
    const order = feet.map((_, i) => i).sort((a, b) => feet[b].y - feet[a].y);
    d.stepTransition = { age: 0, bodyY: body.position.y, feet, order, distance: d.motionState.distance };
  }
  if (!motion) { d.motionState = null; d.stepTransition = null; }
  let blend = 1;
  if (d.stepTransition) { d.stepTransition.age += clamp(Number.isFinite(motion?.dt) ? motion.dt : 0, 0, .1); const u = clamp(d.stepTransition.age / .30, 0, 1); blend = u * u * (3 - 2 * u); }
  const desiredBodyY = sleep ? -.035 : walk ? bounce * cfg.bob : 0;
  body.position.y = d.stepTransition ? THREE.MathUtils.lerp(d.stepTransition.bodyY, desiredBodyY, blend) : desiredBodyY;
  body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
  // Sway the torso surface, never the common root carrying grounded limbs.
  const torso = body.children.find(o => o.isMesh);
  if (torso) torso.rotation.set(walk && d.species === 'rabbit' ? wave * .026 : 0, 0, walk && d.species === 'duck' ? wave * .033 : walk && d.species === 'cow' ? wave * .010 : 0);
  head.position.set(d.headBase.x, d.headBase.y, d.headBase.z);
  if (walk) { head.position.z += d.species === 'chicken' ? wave * .018 : d.species === 'rabbit' ? wave * -.009 : 0; head.position.y += d.species === 'sheep' ? wave * .006 : d.species === 'alpaca' ? wave * -.004 : 0; }
  head.rotation.set(eat ? .37 + Math.sin(time * 6) * .05 : sleep ? .18 : walk ? wave * (d.species === 'rabbit' ? -.07 : .025) : Math.sin(time * 1.6) * .016, pet ? Math.sin(time * 2.8) * .13 : action === 'call' ? Math.sin(time * 2) * .10 : Math.sin(time * .7) * .035, pet ? -.10 : 0);
  if (walk && d.species === 'duck') head.rotation.z = -wave * .021;
  for (const [index, l] of legs.entries()) {
    const r = l.userData.rig, u = walk ? ((cycle + r.phaseOffset) % 1 + 1) % 1 : 0;
    let z = r.hip[2] + r.restZ, y = 0; r.contact = !walk || u < cfg.duty;
    if (walk) {
      if (r.contact) z += cfg.stride * (cfg.duty / 2 - u);
      else { const v = (u - cfg.duty) / (1 - cfg.duty), smooth = v * v * (3 - 2 * v); z += cfg.stride * cfg.duty * (smooth - .5); y = Math.sin(v * Math.PI) * cfg.lift; }
    }
    if (d.stepTransition && blend < 1) {
      const from = d.stepTransition.feet[index];
      // Airborne feet land first. At least one grounded foot stays planted until
      // an earlier foot has landed; simultaneous four-foot hover is avoided.
      const duration = legs.length === 2 ? .15 : .13, interval = legs.length === 2 ? .15 : .17 / 3;
      const v = clamp((d.stepTransition.age - d.stepTransition.order.indexOf(index) * interval) / duration, 0, 1), settle = v * v * (3 - 2 * v);
      const heldZ = from.z - (Number.isFinite(motion?.distance) ? motion.distance - d.stepTransition.distance : 0);
      y = THREE.MathUtils.lerp(from.y, y, settle) + Math.sin(settle * Math.PI) * Math.min(.024, Math.abs(heldZ - z) * .25);
      z = THREE.MathUtils.lerp(heldZ, z, settle); r.contact = y < .00001 && (v === 0 || v === 1);
    }
    r.phase = u; poseLeg(l, y, z, body.position.y, cfg.lift);
  }
  // A biped can finish its first settling step exactly while the other foot is
  // entering swing. A tiny whole-body crouch keeps support through that overlap;
  // all limb targets move with the torso, so IK lengths and joint shape stay exact.
  if (d.stepTransition && d.species !== 'rabbit') {
    const supportGap = Math.min(...legs.map(l => l.userData.rig.footTarget.y));
    if (supportGap > .000001) { body.position.y -= supportGap; for (const l of legs) { const r = l.userData.rig; r.footTarget.y -= supportGap; if (r.footTarget.y < .00001) r.contact = true; } }
  }
  if (tail) tail.rotation.set(0, Math.sin(time * (pet ? 6 : 2.3)) * (pet ? .22 : .08), Math.sin(time * 1.8) * .06);
  for (const [i, wing] of wings.entries()) wing.rotation.z = (i ? 1 : -1) * (pet ? .18 + Math.sin(time * 8) * .10 : walk ? .025 + wave * .035 : .02);
  heart.visible = pet; heart.position.y = d.height + .02 + (pet ? Math.sin(time * 3) * .014 : 0); heart.rotation.y = pet ? Math.sin(time * 2) * .14 : 0;
  if (moment) applyAnimalMoment(d.parts, moment);
  d.locomotion.phase = phase; d.locomotion.cycleDistance = distance;
  if (motion) d.motionState = { walk, distance: Number.isFinite(motion.distance) ? motion.distance : distance };
  if (blend >= 1) d.stepTransition = null;
  g.updateMatrixWorld(true); for (const l of legs) l.userData.rig.mesh.skeleton.update();
}
