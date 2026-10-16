// 共用离屏渲染器与PNG缓存：只依赖Three/资源管理，不依赖具体模型工厂。
import * as THREE from 'three';
import { disposeSceneResources } from './kit.js';

let R, scene, cam, holder;
const cache = new Map();
const SIZE = 192;

function setup() {
  const c = document.createElement('canvas');
  R = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);
  R.setSize(SIZE, SIZE, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.NeutralToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe2cf, 1.45));
  const d = new THREE.DirectionalLight(0xfff6ea, 2.3);
  d.position.set(-3, 5, 4);
  scene.add(d);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  holder = new THREE.Group();
  scene.add(holder);
}

export function icon(key, build, o = {}) {
  if (cache.has(key)) return cache.get(key);
  if (!R) setup();
  const size = o.size || SIZE;
  R.setSize(size, size, false);
  const obj = build();
  holder.add(obj);
  try {
    obj.updateMatrixWorld(true);
    const box = o.box || new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const half = (Math.max(s.x, s.y, s.z) * 0.6) / (o.zoom || 1);
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    const yaw = o.yaw ?? 0.55, pitch = o.pitch ?? 0.42;
    cam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * 30, c.y + Math.sin(pitch) * 30, c.z + Math.cos(yaw) * Math.cos(pitch) * 30);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    R.render(scene, cam);
    const url = R.domElement.toDataURL('image/png');
    cache.set(key, url);
    return url;
  } finally {
    holder.remove(obj);
    // 图标已缓存为PNG，临时模型不再需要；只回收独占资源，保留kit共享缓存。
    disposeSceneResources(obj);
    R.renderLists.dispose();
  }
}

export const getCachedIcon = (key) => cache.get(key);
