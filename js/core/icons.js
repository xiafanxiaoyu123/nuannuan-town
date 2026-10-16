// UI 图标全部由 3D 模型离屏渲染而来，保证界面与场景是同一套美术
import * as THREE from 'three';
import { Character, outfitToLook, randomNpcLook, DADA_LOOK, NONOY_LOOK, MARQUES_LOOK, GIOVANNI_LOOK, LAILA_LOOK } from '../models/character.js';
import { RESIDENT_LAYOUT } from '../live/people.js';
import { buildDecor, house, shopCafe, shopFlower, shopTailor, shopBoutique } from '../models/props.js';
import { cropIcon, seedBag, FOOD_BUILD, flowerModel, coinModel, mergeModel, fishModel } from '../models/items.js';
import { boat } from '../models/props.js';
import { box, group } from './kit.js';
import { CLOTH, DEFAULT_OUTFIT } from '../data.js';
import { shopBakery } from '../live/props.js';

// 原路径继续导出同一渲染函数；具体图标工厂与底层渲染器单向依赖。
import { icon, getCachedIcon } from './icon-renderer.js';
export { icon } from './icon-renderer.js';

const B = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

export function clothIcon(id) {
  const it = CLOTH[id];
  const key = 'cloth:' + id;
  const cached = getCachedIcon(key);
  if (cached !== undefined) return cached;
  const mk = () => {
    const ch = new Character(outfitToLook({ ...DEFAULT_OUTFIT, [it.cat]: id }));
    const cat = it.cat;
    if (cat === 'hair' || cat === 'acc') { ch.torso.visible = ch.armL.visible = ch.armR.visible = ch.legL.visible = ch.legR.visible = ch.back.visible = false; }
    if (cat === 'dress') { ch.head.visible = ch.back.visible = false; }
    if (cat === 'shoes') { ch.head.visible = ch.torso.visible = ch.armL.visible = ch.armR.visible = ch.back.visible = false; }
    return ch.root;
  };
  if (it.cat === 'hair') return icon(key, mk, { box: B(-0.6, 0.15, -0.5, 0.6, 1.65, 0.5), yaw: 0.5, pitch: 0.12, zoom: 1.02 });
  if (it.cat === 'acc') return icon(key, mk, { box: B(-0.6, 0.5, -0.5, 0.6, 2.0, 0.5), yaw: 0.45, pitch: 0.2, zoom: 1.0 });
  if (it.cat === 'dress') return icon(key, mk, { box: B(-0.55, -0.1, -0.4, 0.55, 0.9, 0.4), yaw: 0.45, pitch: 0.18, zoom: 1.1 });
  if (it.cat === 'shoes') return icon(key, mk, { box: B(-0.32, -0.06, -0.25, 0.32, 0.44, 0.25), yaw: 0.75, pitch: 0.35, zoom: 1.0 });
  return icon(key, mk, { box: B(-0.75, 0.0, -0.5, 0.75, 1.75, 0.5), yaw: Math.PI - 0.6, pitch: 0.18, zoom: 1.05 });
}
export const avatarIcon = (outfit, key) => icon('avatar:' + key, () => {
  const ch = new Character(outfitToLook(outfit));
  ch.torso.visible = ch.armL.visible = ch.armR.visible = ch.legL.visible = ch.legR.visible = ch.back.visible = false;
  return ch.root;
}, { box: B(-0.55, 0.62, -0.45, 0.55, 1.62, 0.45), yaw: 0.28, pitch: 0.06, zoom: 1.02 });

// 居民 / 来访角色的头像：和场景里是同一个模型
const headIcon = (key, look) => icon(key, () => {
  const ch = new Character(look);
  ch.torso.visible = ch.armL.visible = ch.armR.visible = ch.legL.visible = ch.legR.visible = ch.back.visible = false;
  return ch.root;
}, { box: B(-0.55, 0.62, -0.45, 0.55, 1.62, 0.45), yaw: 0.28, pitch: 0.06, zoom: 1.02 });
const CANON_LOOKS = { dada: DADA_LOOK, nonoy: NONOY_LOOK, marques: MARQUES_LOOK, giovanni: GIOVANNI_LOOK, laila: LAILA_LOOK };
export const npcIco = (id) => (CANON_LOOKS[id] ? headIcon('npc:' + id, CANON_LOOKS[id]) : headIcon('npc:' + id, randomNpcLook(RESIDENT_LAYOUT[id]?.look || 0)));

export const decorIcon = (id) => icon('decor:' + id, () => buildDecor(id), { yaw: 0.6, pitch: 0.4, zoom: id === 'stone' || id === 'picnic' ? 1.1 : 1 });
export const cropIco = (id) => icon('crop:' + id, () => cropIcon(id), { yaw: 0.5, pitch: 0.35 });
export const seedIco = (id) => icon('seed:' + id, () => seedBag(id), { yaw: 0.35, pitch: 0.25 });
export const foodIco = (id) => icon('food:' + id, () => FOOD_BUILD[id](), { yaw: 0.5, pitch: 0.5 });
export const flowerIco = (id) => icon('flower:' + id, () => flowerModel(id), { yaw: 0.3, pitch: 0.2, box: B(-0.4, 0.2, -0.3, 0.4, 1.0, 0.3), zoom: 1.05 });
export const coinIco = () => icon('coin', () => coinModel(), { yaw: 0.35, pitch: 0.2, zoom: 0.92 });
export const houseIcon = (tier) => icon('house:' + tier, () => house(tier), { yaw: 0.6, pitch: 0.35, size: 320 });
function pierDiorama() {
  const g = group();
  g.add(box(6, 0.3, 4.6, '#8fd8ec', 0, -0.3, 0, { r: 0.12 }));
  for (let i = 0; i < 5; i++) g.add(box(1.6, 0.14, 0.62, i % 2 ? '#d9b08a' : '#cfa37c', -1.3, 0.3, -1.5 + i * 0.68, { r: 0.04 }));
  for (const z of [-1.6, 1.4]) for (const x of [-2.1, -0.5]) g.add(box(0.2, 0.9, 0.2, '#b3855f', x, -0.2, z, { r: 0.05 }));
  const b = boat();
  b.position.set(1.4, 0, 0.3);
  b.rotation.y = 0.5;
  g.add(b);
  return g;
}
const SHOP_BUILD = { cafe: shopCafe, flower: shopFlower, tailor: shopTailor, boutique: shopBoutique, fish: pierDiorama, bakery: () => shopBakery() };
export const mergeIco = (t, lv) => icon('merge:' + t + lv, () => mergeModel(t, lv), { yaw: 0.35, pitch: 0.3 });
export const fishIco = (id) => icon('fish:' + id, () => fishModel(id), { yaw: 0.3, pitch: 0.2 });
export const shopIcon = (id) => icon('shop:' + id, () => SHOP_BUILD[id](), { yaw: 0.55, pitch: 0.36, size: 384, zoom: 1.02 });
