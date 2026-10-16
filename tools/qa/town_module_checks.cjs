// Town 重构对照：旧 Town 与当前 Town 都运行真实 Three/模型/农场/装修/存档模块。
// 仅替代浏览器画布、音频/粒子输出和渲染宿主；不替代被拆出的 Town 业务。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict'), crypto = require('crypto');
if (!vm.SourceTextModule) {
  const child = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const root = path.resolve(__dirname, '../..');
const baseline = process.env.TOWN_BASELINE || process.argv[2];
const beforeFile = baseline ? path.join(path.resolve(baseline), 'js/world/town.js') : null;
if (beforeFile && !fs.existsSync(beforeFile)) throw new Error('Missing baseline Town: ' + beforeFile);
const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
class Hub {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event = {}) { for (const callback of [...(this.listeners.get(name) || [])]) callback(event); }
}

async function load(old) {
  const modules = new Map(), timers = new Map(), storage = new Map(), writes = [], output = [], events = [], canvases = [];
  const clock = { time: new Date('2026-10-07T04:00:00.000Z').getTime(), elapsed: 1000 };
  let randomState = 1, timerId = 0;
  const seededMath = Object.create(Math);
  seededMath.random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 0x100000000; };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.time])); }
    static now() { return clock.time; }
  }
  const dom = new Hub(), canvas = new Hub();
  canvas.setPointerCapture = () => {}; canvas.width = canvas.clientWidth = 866; canvas.height = canvas.clientHeight = 412;
  const createCanvas = () => {
    const ops = [], c = { width: 300, height: 150, ops, toDataURL: () => 'data:image/png;base64,QA' };
    const ctx = new Proxy({ font: '10px sans-serif', measureText(text) { return { width: String(text).length * (parseFloat(this.font) || 10) * .6 }; } }, {
      get(target, name) { return name in target ? target[name] : (...args) => { ops.push([name, ...args]); }; },
    });
    c.getContext = type => { assert.equal(type, '2d'); return ctx; }; canvases.push(c); return c;
  };
  const document = { hidden: false, body: { classList: { contains: () => false } }, createElement: tag => {
    if (tag !== 'canvas') throw new Error('Unexpected DOM element: ' + tag); return createCanvas();
  } };
  const app = { canvas, shadowSize: 512, width: 866, height: 412, mobile: false, quality: 'high', time: 1,
    bloom: { strength: .2 }, finish: { uniforms: { focus: { value: .5 }, amount: { value: 3.2 } } },
    project(p, camera) { const v = p.clone().project(camera); return { x: (v.x + 1) * this.width / 2, y: (1 - v.y) * this.height / 2 }; },
    ray(x, y, camera) { const { THREE } = modules.get(path.join(root, 'js/core/kit.js')).namespace; const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / this.width * 2 - 1, 1 - y / this.height * 2), camera); return ray; },
  };
  const printable = value => {
    const seen = new WeakSet();
    const visit = item => {
      if (item?.isObject3D) return { type: item.type, name: item.name, position: item.position.toArray() };
      if (item?.isVector3 || item?.isVector2 || item?.isColor) return item.toArray();
      // 总线有意传递装修实例；其状态另由 snapshot 比较，不展开 town↔decor 图。
      if (item?.town && item?.cfg?.key) return { component: 'DecorSys', zone: item.cfg.key, active: item.active, pendingCost: item.pendingCost };
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[shared reference]';
        seen.add(item);
        return Array.isArray(item) ? item.map(visit) : Object.fromEntries(Object.entries(item).filter(([, val]) => typeof val !== 'function').map(([key, val]) => [key, visit(val)]));
      }
      return item;
    };
    return visit(value);
  };
  const effects = new Proxy({}, { get: (_target, name) => (...args) => output.push([name, ...args.map(printable)]) });
  const context = vm.createContext({ console, Math: seededMath, Date: ClockDate, TextEncoder, TextDecoder, URLSearchParams,
    performance: { now: () => clock.elapsed }, document, innerWidth: 866, innerHeight: 412,
    addEventListener: dom.addEventListener.bind(dom), removeEventListener: dom.removeEventListener.bind(dom),
    location: { search: '?slot=qa-town-vm', hostname: 'localhost', protocol: 'http:' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { writes.push([key, value]); storage.set(key, value); }, removeItem: key => { writes.push([key, null]); storage.delete(key); } },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  });
  context.window = context;
  const substitute = new Map([
    [path.join(root, 'js/core/app.js'), { app }], [path.join(root, 'js/core/audio.js'), { audio: effects }], [path.join(root, 'js/core/fx.js'), { fx: effects }],
  ]);
  function at(file) {
    if (modules.has(file)) return modules.get(file);
    let module;
    if (substitute.has(file)) {
      const values = substitute.get(file); module = new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context, identifier: file });
    } else {
      const source = old && file === path.join(root, 'js/world/town.js') ? beforeFile : file;
      module = new vm.SourceTextModule(fs.readFileSync(source, 'utf8'), { context, identifier: file });
    }
    modules.set(file, module); return module;
  }
  const resolve = (specifier, from) => specifier === 'three' ? path.join(root, 'node_modules/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(root, 'node_modules/three/examples/jsm', specifier.slice(13)) : path.resolve(path.dirname(from.identifier), specifier);
  const entry = at(path.join(root, 'js/world/town.js'));
  await entry.link((specifier, from) => at(resolve(specifier, from))); await entry.evaluate();
  const ns = entry.namespace, state = modules.get(path.join(root, 'js/core/state.js')).namespace;
  const emit = state.bus.emit.bind(state.bus);
  state.bus.emit = (name, ...args) => { events.push([name, ...args.map(printable)]); return emit(name, ...args); };
  randomState = 123456789;
  const town = new ns.Town();
  return { ns, town, state, app, dom, canvas, events, output, writes, timers, canvases, clock, storage,
    get: file => modules.get(path.join(root, file))?.namespace, random: () => randomState, printable };
}

function snapshot(h, withScene = false) {
  const t = h.town, point = p => p?.toArray?.() || p;
  const result = {
    ownFields: Object.keys(t).sort(), state: clone(h.state.S), writes: h.writes.map(([key, value]) => [key, value && JSON.parse(value)]),
    events: clone(h.events), output: clone(h.output), random: h.random(),
    player: { pos: point(t.pos), root: point(t.player.root.position), angle: t.player.root.rotation.y, targetMove: t.player.targetMove, pose: t.player.pose },
    momo: { pos: point(t.momo.root.position), angle: t.momo.root.rotation.y, targetMove: t.momo.targetMove },
    view: { zone: t.zone, rig: t.rig, goal: t.goal, zoom: t.zoom, yaw: t.camYaw, pitch: t.camPitch, snap: t.camSnap,
      mode: t.camMode, frozen: t.frozen, lock: t.lock, night: t.night, camera: point(t.camera.position), cameraQ: t.camera.quaternion.toArray(),
      current: t.cur?.id, label: t.curLabel, moveTo: t.moveTo && { ...t.moveTo, hit: t.moveTo.hit?.id }, water: [point(t.waterU.ctr.value), point(t.waterU.hsz.value), t.waterU.rad.value] },
    npcs: t.npcs.map(n => ({ id: n.def.id, pos: point(n.ch.root.position), angle: n.ch.root.rotation.y, targetMove: n.ch.targetMove,
      node: n.node, prev: n.prev, target: n.target, wait: n.wait, speed: n.speed, greet: n.greet, follow: n.follow, busy: n.busy, pose: n.pose, rs: n.rs, off: n.off })),
    rects: t.rects, circles: t.circles,
    interactions: t.inter.map(i => ({ id: i.id, x: i.x, z: i.z, r: i.r, label: typeof i.label === 'function' ? i.label() : i.label })),
    listeners: [h.dom, h.canvas].map(hub => [...hub.listeners].map(([name, callbacks]) => [name, callbacks.size])),
    layout: Object.fromEntries(['ISLAND','HOME','LOT','TOWN_HOUSE','RLOT','DOORS','RECYCLE'].map(name => [name, h.ns[name]])),
  };
  if (withScene) {
    const cache = new WeakMap(), typed = a => digest(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    const geo = g => {
      if (!cache.has(g)) cache.set(g, { type: g.type, attributes: Object.fromEntries(Object.entries(g.attributes).map(([key, a]) => [key, typed(a.array)])), index: g.index && typed(g.index.array) });
      return cache.get(g);
    };
    const material = m => ({ type: m.type, color: point(m.color), emissive: point(m.emissive), emissiveIntensity: m.emissiveIntensity,
      opacity: m.opacity, transparent: m.transparent, side: m.side, roughness: m.roughness, depthWrite: m.depthWrite,
      image: m.map?.image && { width: m.map.image.width, height: m.map.image.height, ops: m.map.image.ops },
      vertex: m.vertexShader, fragment: m.fragmentShader, uniforms: m.uniforms && h.printable(m.uniforms) });
    const nodes = [];
    t.scene.traverse(o => nodes.push({ type: o.type, name: o.name, position: point(o.position), quaternion: o.quaternion.toArray(), scale: point(o.scale),
      visible: o.visible, children: o.children.length, cast: o.castShadow, receive: o.receiveShadow,
      geometry: o.geometry && geo(o.geometry), material: o.material && (Array.isArray(o.material) ? o.material.map(material) : material(o.material)),
      count: o.count, instances: o.instanceMatrix && typed(o.instanceMatrix.array), colors: o.instanceColor && typed(o.instanceColor.array) }));
    h.sceneNodes = clone(nodes);
    result.scene = { nodes: nodes.length, sha256: digest(nodes), textures: h.canvases.length, canvasOperations: digest(h.canvases.map(c => c.ops)) };
  }
  return clone(result);
}

async function main() {
  const previous = beforeFile ? await load(true) : null, current = await load(false), checks = [];
  function test(label, run, scene = false) {
    const oldResult = previous ? run(previous) : null, newResult = run(current);
    const newSnapshot = snapshot(current, scene);
    if (previous) {
      assert.deepEqual(clone(newResult ?? null), clone(oldResult ?? null), label + ': return values');
      const oldSnapshot = snapshot(previous, scene);
      if (scene && oldSnapshot.scene.sha256 !== newSnapshot.scene.sha256) {
        const index = previous.sceneNodes.findIndex((node, i) => JSON.stringify(node) !== JSON.stringify(current.sceneNodes[i]));
        console.error('First scene difference:', index);
        assert.deepEqual(current.sceneNodes[index], previous.sceneNodes[index], 'scene node ' + index);
      }
      assert.deepEqual(newSnapshot, oldSnapshot, label + ': state/scene/events');
    }
    checks.push({ label, pass: true, ...(scene ? { scene: newSnapshot.scene } : {}) }); console.log('PASS ' + label);
  }
  test('完整场景构建、原坐标和农场/装修/季节/角色关系', h => {
    const t=h.town;
    assert.equal(t.farm.town,t);assert.equal(t.seasons.town,t);assert.equal(t.partitions.town,t);
    assert.equal(t.decors.house.lot,h.ns.RLOT);assert.equal(t.decors.home.lot,h.ns.LOT);
    assert.equal(t.npcs.length,6);assert.equal(t.farm.recs().length,6);assert.ok(t.rects.length>20&&t.circles.length>60);
    assert.deepEqual(clone(t.pos.toArray()),[-20,0,-5.1]);
  }, true);
  test('Town公开方法/访问器和参数长度一致；RLOT/DOORS旧导出保持同对象', h => {
    if (h.get('js/world/town/layout.js')) {
      assert.equal(h.ns.RLOT, h.get('js/world/town/layout.js').RLOT); assert.equal(h.ns.DOORS, h.get('js/world/town/layout.js').DOORS);
      assert.equal(h.town.decors.house.lot, h.ns.RLOT);
    }
    const names=Object.getOwnPropertyNames(h.ns.Town.prototype).sort();
    assert.equal(names.length,53);for(const name of ['update','resolve','setZone','groundPoint','buildRoom','talk','bindInput'])assert.ok(names.includes(name));
    return names.map(name => {
      const descriptor = Object.getOwnPropertyDescriptor(h.ns.Town.prototype, name);
      return [name, typeof descriptor.value, descriptor.value?.length, !!descriptor.get, !!descriptor.set];
    });
  });
  test('区域解锁、进出门落点、水面范围和额外房间边界一致', h => {
    const t = h.town, result = [];
    assert.equal(t.setZone('build'), false, 'locked island stays locked');
    h.state.S.buildQuest = { version: 1, stage: 3, rewarded: true };
    for (const zone of ['house', 'home', 'house', 'town', 'build', 'home']) {
      result.push([zone, t.setZone(zone), t.pos.toArray(), t.canDecorate, t.decor.cfg.key]);
    }
    t.rooms.qaRoom = { x0: 100, x1: 104, z0: 20, z1: 26 }; t.zone = 'qaRoom';
    const p = t.pos.clone().set(105, 0, 28); t.resolve(p, .36); assert.deepEqual(clone(p.toArray()), [104, 0, 26]);
    delete t.rooms.qaRoom; t.setZone('town'); return result;
  });
  test('道路/地块/矩形圆形碰撞和四区岛岸夹取对照468个位置', h => {
    const t = h.town, points = [];
    for (const zone of ['town','home','house','build']) {
      t.setZone(zone);
      const center = zone === 'home' ? -500 : zone === 'house' ? 500 : zone === 'build' ? h.get('js/world/build-constants.js').BUILD_ISLAND.cx : 0;
      for (let x = -48; x <= 48; x += 8) for (let z = -24; z <= 24; z += 6) {
        const p = t.pos.clone().set(center + x, 0, z); t.resolve(p, .36);
        points.push([zone, x, z, t.onPath(center + x,z), t.inLot(center + x,z), t.blocked(center + x,z), p.toArray()]);
      }
    }
    t.setZone('town'); return points;
  });
  test('真实键鼠/触摸监听处理点击、旋转、缩放、取消、失焦和输入屏蔽一致', h => {
    const t = h.town, cv = h.canvas, results = [];
    t.onEnter(); t.setMode('play'); t.setModal(false); t.update(0, h.app.time); t.scene.updateMatrixWorld(true); t.camera.updateMatrixWorld(true);
    const emit = (hub,name,extra={}) => {
      let prevented = false;
      hub.emit(name,{ target:cv, repeat:false, pointerId:1, clientX:400, clientY:200, pointerType:'touch', preventDefault:()=>{prevented=true;}, ...extra });
      return prevented;
    };
    results.push(emit(h.dom,'keydown',{code:'KeyW'}), [...t.keys]); emit(h.dom,'keyup',{code:'KeyW'});
    emit(h.dom,'keydown',{code:'KeyA'}); emit(h.dom,'blur'); assert.equal(t.keys.size,0);
    emit(cv,'pointerdown'); emit(cv,'pointerup'); results.push(t.moveTo && [t.moveTo.x,t.moveTo.z,t.moveTo.hit?.id]);
    t.camFree=true;emit(cv,'pointerdown');emit(cv,'pointermove',{clientX:450,clientY:220});emit(cv,'pointerup',{clientX:450,clientY:220});
    results.push(t.camYaw,t.camPitch);t.camFree=false;
    emit(cv,'pointerdown',{clientX:300});emit(cv,'pointerdown',{pointerId:2,clientX:500});emit(cv,'pointermove',{pointerId:2,clientX:650});
    results.push(t.zoom);emit(h.dom,'pointercancel',{pointerId:2});emit(h.dom,'pointercancel');
    emit(cv,'wheel',{deltaY:1});results.push(t.zoom);
    t.setModal(true);const oldZoom=t.zoom;emit(cv,'wheel',{deltaY:1});assert.equal(t.zoom,oldZoom);t.setModal(false);
    t.resetCam();t.moveTo=null;return results;
  });
  test('120帧完整update保留玩家/大喵/NPC/提示/镜头/季节更新和状态事件顺序', h => {
    const t = h.town;
    t.setZone('town', -20, 4);t.setMode('play');t.setModal(false);t.keys.add('KeyD');
    for(let i=0;i<120;i++){
      const dt=i%5===0?.035:1/60;h.app.time+=dt;h.clock.elapsed+=dt*1000;
      if(i===40){t.keys.clear();t.stick.x=.4;t.stick.y=.7;}
      if(i===80){t.stick.x=t.stick.y=0;t.moveTo={x:-20,z:4,hit:null,stuck:0};}
      t.update(dt,h.app.time);
    }
    t.moveTo=null;t.stick.x=t.stick.y=0;t.keys.clear();h.state.flushSave();
  }, true);
  test('居民聊天初见、礼物、好友和夜间秘密沿用真实奖励与保存次数', h => {
    const t=h.town, result=[];
    for(const n of t.npcs){
      h.state.S.npc[n.def.id]={t:0};n.follow=0;t.night=n.def.egg==='night'?.9:0;
      const coins=h.state.S.coins;
      for(let i=0;i<12;i++)t.talk(n);
      result.push([n.def.id,h.state.S.npc[n.def.id],h.state.S.coins-coins]);
    }
    h.state.flushSave();assert.ok(result.every(([, ,coins])=>coins>=360),'gift and friendship thresholds still reward');return result;
  });
  test('标题/创作暂停不推进镇历；正常跨日更新时钟、保存与newDay顺序一致', h => {
    const t=h.town,s=h.state.S,result=[];
    for(const [mode,paused,photo,dt]of [['title',false,false,10],['decor',true,false,10],['play',true,true,10],['play',false,false,2]]){
      s.clock=.999;s.settings.pauseCreativeTime=paused;t.setMode(mode);t.photoOn=photo;
      const before=s.gday;t.applySky(dt);result.push([mode,paused,photo,s.clock,s.gday-before]);
      if(mode==='title'||paused)assert.equal(s.clock,.999);else assert.equal(s.gday,before+1);
    }
    s.settings.pauseCreativeTime=false;t.photoOn=false;t.setMode('play');h.state.flushSave();return result;
  });
  test('房屋1→2→3→1重建保留坐标引用，旧根/独占资源释放且不积累门标记', h => {
    const t=h.town, lot=h.ns.RLOT, doors=h.ns.DOORS, counts=[];
    for(const level of [2,3,1,3]){
      const old=t.roomRoot,materials=new Set(),geometries=new Set();let released=0;
      old.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});
      for(const resource of [...materials,...geometries])resource.addEventListener('dispose',()=>released++);
      h.state.S.house=level;t.rebuildHouse();
      assert.equal(h.ns.RLOT,lot);assert.equal(h.ns.DOORS,doors);assert.equal(t.decors.house.lot,lot);assert.equal(old.parent,null);assert.ok(released>0,'owned room resources disposed');
      const measure=()=>[t.scene.children.filter(n=>n.name==='player-house-interior').length,t.roomMarkers.length,t.roomRects.length,t.inter.filter(i=>['frontDoor','backDoor','closet','blueprint'].includes(i.id)).length];
      const before=measure();t.rebuildHouse();assert.deepEqual(measure(),before);assert.equal(before[0],1);assert.equal(before[3],4);
      counts.push([level,lot.cols,lot.rows,...before,released]);
    }
    return counts;
  }, true);
  test('院界扩建反复重建释放旧根和登记，不增加标记/碰撞或改变已铺地数据', h => {
    const t=h.town, data=h.get('js/data.js'),result=[],floor=clone(h.state.S.floor);
    for(const level of [1,2,data.YARDS.length,1,2]){
      const old=t.yardFx;h.state.S.yardLv=level;t.rebuildYard(false);assert.equal(old.parent,null);
      const measure=()=>[t.rects.length,t.markers.length,t.inter.filter(i=>i.id==='yardSign').length,t.seasons.grounds.size,t.seasons.plants.size,t.seasons.flowers.size];
      const before=measure();t.rebuildYard(false);assert.deepEqual(measure(),before);result.push([level,...before]);
    }
    assert.deepEqual(clone(h.state.S.floor),floor);return result;
  }, true);
  test('真实建造楼梯上下、楼板下行走和屋顶截面结果一致', h => {
    const t=h.town,d=t.decors.build,data=h.get('js/data.js'),yard=h.get('js/world/yard-building.js'),result=[];
    const e=(id,gx,gz,level=0,rot=0)=>({id,gx,gz,level,rot});t.setZone('build');t.setMode('play');t.lock=0;
    for(let r=0;r<4;r++){
      const stair=e('yard_stairs',10,10,0,r),f=yard.yardFootprint(stair,data.DECO),a=r*Math.PI/2,dx=Math.round(Math.sin(a)),dz=Math.round(Math.cos(a)),cx=10+f.w/2,cz=10+f.d/2;
      const lx=dx===1?13:dx===-1?8:10,lz=dz===1?13:dz===-1?8:10,p=[stair,e('yard_slab',lx,lz,1),e('yard_column',lx,lz)];
      assert.equal(d.validateYard(p).ok,true);d.rebuildObjects(p,{});t.pos.set(d.lot.x0+cx-dx*1.75,0,d.lot.z0+cz-dz*1.75);
      t.moveOnYard(dx*4.2,dz*4.2);assert.equal(t.pos.y,3);result.push(t.pos.toArray());t.moveOnYard(-dx*4.2,-dz*4.2);assert.equal(t.pos.y,0);result.push(t.pos.toArray());
    }
    d.rebuildObjects([e('yard_slab',10,10,1),e('yard_roof_flat',10,10,2)],{});t.pos.set(d.lot.x0+11,0,d.lot.z0+9);t.moveOnYard(0,3);assert.equal(t.pos.y,0);
    t.pos.set(d.lot.x0+11,0,d.lot.z0+11);t.updateBuildRoofView();result.push(d.entries.map(rec=>[rec.e.id,rec.obj.visible]));assert.ok(d.entries.every(rec=>!rec.obj.visible));
    t.photoOn=true;t.updateBuildRoofView();result.push(d.entries.map(rec=>[rec.e.id,rec.obj.visible]));t.photoOn=false;
    d.rebuildObjects([],{});t.setZone('town');return result;
  });
  test('静态合批保留角色/动画对象；退出场景清理与内存存档重载一致', h => {
    const t=h.town,player=t.player,momo=t.momo,merged=t.optimizeStatic();assert.ok(merged>0);
    assert.equal(t.player,player);assert.equal(t.momo,momo);assert.equal(player.root.parent,t.scene);assert.equal(momo.root.parent,t.scene);
    t.onExit();assert.equal(t.active,false);assert.equal(t.keys.size,0);assert.equal(t.farm.carry,null);
    h.state.flushSave();const saved=clone(h.state.S);assert.equal(h.state.load(),true);
    // 真实 load 会为尚未打开UI的新档补这两个既有教程默认值。
    saved.settings={autoTutorials:true,tutorialSeen:{},...saved.settings};
    assert.deepEqual(clone(h.state.S),saved);return merged;
  });
  console.log(`Town checks: ${checks.length} passed; old-implementation comparison ${previous ? 'enabled' : 'not requested'}.`);
  if (process.env.TOWN_QA_OUT) {
    const out = path.resolve(process.env.TOWN_QA_OUT); fs.mkdirSync(out, { recursive: true });
    const sourceFiles=['js/world/town.js',...fs.readdirSync(path.join(root,'js/world/town')).filter(name=>name.endsWith('.js')).map(name=>'js/world/town/'+name)];
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ pass: true, before: beforeFile ? { file: beforeFile, sha256: digest(fs.readFileSync(beforeFile, 'utf8')) } : null,
      sourceFiles:sourceFiles.map(file=>{const text=fs.readFileSync(path.join(root,file),'utf8');return{file,bytes:Buffer.byteLength(text),lines:text.trimEnd().split(/\r?\n/).length,sha256:digest(text)};}),
      checks, scope: 'Actual Town, Three, models, farm, decor, seasons and in-memory state; canvas/audio/render-host boundary substitutes. Not a physical-device check.' }, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
