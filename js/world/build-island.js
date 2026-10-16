// 海风岛与两端码头：场景安装和短航行演出，不负责存档、收费或区域切换。
import { THREE, box, cbox, cyl, group, slab, textPlane, disposeSceneResources } from '../core/kit.js';
import { S, bus } from '../core/state.js';
import { BUILD_ISLAND, BUILD_LOT, BUILD_HOME_DOCK, BUILD_DOCK, BUILD_SPAWN } from './build-constants.js';
import { buildQuestProgress } from './build-island-rules.js';
export { BUILD_ISLAND, BUILD_LOT, BUILD_HOME_DOCK, BUILD_DOCK, BUILD_SPAWN } from './build-constants.js';
export { BUILD_QUEST_TITLE, BUILD_LUNCH, BUILD_STARTER_KIT, buildQuestProgress, advanceBuildQuest } from './build-island-rules.js';

const CREAM = '#fff4df', WOOD = '#dab18a', DARK_WOOD = '#ad7e5d', PINK = '#f7aec7', MINT = '#aedbc4';
const ns = { cast: false, receive: false };

function sign(title, subtitle, width = 2.6) {
  const g = group();
  for (const x of [-width * 0.34, width * 0.34]) g.add(box(0.12, 1.65, 0.12, DARK_WOOD, x, 0, 0, { r: 0.03 }));
  g.add(box(width, 0.94, 0.16, CREAM, 0, 1.1, 0, { r: 0.09 }));
  g.add(cbox(width + 0.13, 0.14, 0.24, MINT, 0, 2.08, 0, { r: 0.045 }));
  const a = textPlane(title, { size: 54, height: 0.3, color: '#6c6253' }); a.position.set(0, 1.73, 0.092);
  const b = textPlane(subtitle, { size: 40, height: 0.17, color: '#a08c75' }); b.position.set(0, 1.35, 0.092); g.add(a, b);
  return g;
}
function dock(anchor, home) {
  const g = group(anchor.x, 0, anchor.z); g.name = home ? 'build-home-dock' : 'build-island-dock';
  // 木板贴近地面，登船交互点始终位于可步行岛岸，不要求玩家走入海水。
  const extra = home ? 4 : 0, left = -2.08 - extra * .425;
  for (let i = 0; i < 10 + extra; i++) g.add(box(0.42, 0.08, 2.1, i % 2 ? WOOD : '#e9c9a0', -1.91 - extra * .425 + i * .425, 0, 0, { r: 0.015 }));
  for (const x of [left, 2.0]) for (const z of [-0.96, 0.96]) {
    g.add(cyl(0.095, 0.095, 0.75, DARK_WOOD, x, -0.05, z, { seg: 10 }));
    g.add(cyl(0.12, 0.12, 0.07, CREAM, x, 0.68, z, { seg: 10 }));
  }
  for (const z of [-0.96, 0.96]) g.add(cbox(3.9 + extra * .425, 0.045, 0.045, '#f6e8d0', -.05 - extra * .2125, .48, z, { r: .012, ...ns }));
  const board = sign(home ? '海风岛渡口' : '返回暖暖小镇', home ? '海风里的空白蓝图' : '小船随时等你回家', 2.1);
  board.position.set(0.9, 0, -2.0); g.add(board);
  const letter = group(0.92, 1.52, -1.88);
  letter.add(cbox(0.38, 0.25, 0.025, '#fffdf4', 0, 0, 0, { r: 0.015, rz: -0.12 }));
  letter.add(cbox(0.07, 0.07, 0.035, PINK, 0, 0, 0.025, { r: 0.018, rz: Math.PI / 4, ...ns }));
  g.add(letter);
  return g;
}
function littleBoat(anchor, home = false) {
  // 原后院更宽，船身要停到实际海岸外，不能半埋在草地里。
  const g = group(anchor.x - (home ? 5.2 : 3.1), -0.58, anchor.z); g.name = 'build-travel-boat'; g.userData.noMerge = true;
  g.add(cbox(3.1, 0.5, 1.3, DARK_WOOD, 0, 0.25, 0, { r: 0.22 }));
  g.add(cbox(2.77, 0.2, 1.05, WOOD, 0, 0.5, 0, { r: 0.14 }));
  for (const z of [-0.57, 0.57]) g.add(cbox(2.95, 0.28, 0.14, CREAM, 0, 0.6, z, { r: 0.06 }));
  for (const x of [-1.42, 1.42]) g.add(cbox(0.18, 0.25, 1.0, PINK, x, 0.61, 0, { r: 0.075 }));
  for (const x of [-0.73, 0.5]) g.add(cbox(0.34, 0.12, 1.02, MINT, x, 0.65, 0, { r: 0.035 }));
  g.add(box(0.07, 1.4, 0.07, DARK_WOOD, 1.0, 0.65, 0, { r: 0.02 }));
  g.add(cbox(0.55, 0.35, 0.035, PINK, 0.75, 1.85, 0, { r: 0.025 }));
  const sail = cbox(0.39, 0.13, 0.045, CREAM, 0.77, 1.85, 0.03, { r: 0.025, rz: -0.25, ...ns }); g.add(sail);
  g.add(cbox(1.7, 0.035, 0.06, DARK_WOOD, -0.15, 0.85, 0.37, { r: 0.015, ry: -0.35 }));
  g.add(cbox(0.42, 0.045, 0.2, WOOD, -0.95, 0.85, 0.65, { r: 0.035, ry: -0.35 }));
  const parcel = group(0, 0.66, -0.1); parcel.add(box(0.42, 0.28, 0.42, '#f5d5a3', 0, 0, 0, { r: 0.06 }), cbox(0.46, 0.05, 0.46, CREAM, 0, 0.3, 0, { r: 0.025 })); g.add(parcel);
  return g;
}
function islandGround() {
  const g = group(BUILD_ISLAND.cx, 0, BUILD_ISLAND.cz); g.name = 'build-island-ground';
  g.add(slab(BUILD_ISLAND.w + 7, BUILD_ISLAND.d + 7, BUILD_ISLAND.r + 3.5, 0.25, '#b9ecf2', 0, -1.35, 0, { bevel: 0.1, ...ns }));
  g.add(slab(BUILD_ISLAND.w + 2.6, BUILD_ISLAND.d + 2.6, BUILD_ISLAND.r + 1.3, 0.52, '#f8e7c9', 0, -1.27, 0, { bevel: 0.18, cast: false }));
  g.add(slab(BUILD_ISLAND.w, BUILD_ISLAND.d, BUILD_ISLAND.r, 1, '#a7dca0', 0, -1.12, 0, { bevel: 0.12, cast: false }));
  g.add(slab(BUILD_LOT.cols + 0.2, BUILD_LOT.rows + 0.2, 0.4, 0.015, '#c3e6b0', 0, -0.006, 0, { bevel: 0.008, cast: false }));
  // 岛中央完全留给玩家。海岸饰物只摆在装修格以外，不占原院子或建造区。
  for (const [x, z, s] of [[-21,-15,1],[-21,16,.85],[21,-16,1.1],[22,12,.85],[-9,-18,1],[10,18,.9],[3,-18.6,.8]]) {
    g.add(cbox(1.1*s,.5*s,.8*s,'#d6ddd7',x,.21*s,z,{r:.2}));
    g.add(cbox(.64*s,.35*s,.61*s,'#e7e9de',x+.46*s,.15*s,z+.26*s,{r:.13}));
    for (const side of [-1,1]) { g.add(box(.08,.45,.08,'#7cad79',x+side*.58,.06,z+.57,{r:.02})); g.add(cbox(.24,.15,.24,side<0?'#f3b1ca':'#fff5ca',x+side*.58,.56,z+.57,{r:.07})); }
  }
  const board = sign('海风建造工坊', '从一块地基，搭起你的想象', 2.65); board.position.set(-21, 0, -3); g.add(board);
  const desk = group(-21,0,-5);
  desk.add(box(2.5,.13,1.15,WOOD,0,.8,0,{r:.04}));
  for(const x of [-1,1])for(const z of [-.4,.4])desk.add(box(.12,.8,.12,DARK_WOOD,x,0,z,{r:.035}));
  desk.add(cbox(1.2,.015,.72,'#d4e9ed',-.15,.94,.05,{r:.025}));
  for(const x of [-.4,0,.4])desk.add(cbox(.025,.008,.5,'#f9ffff',x,.953,.05,ns));
  for(const z of [-.15,.1,.35])desk.add(cbox(.95,.008,.025,'#f9ffff',-.15,.953,z,ns));
  desk.add(cbox(.36,.12,.28,PINK,.92,.99,.06,{r:.035}));g.add(desk);
  return g;
}

export function installBuildIsland(town) {
  if (town.buildIslandPort) return town.buildIslandPort;
  const ground = islandGround(), homeDock = dock(BUILD_HOME_DOCK, true), buildDock = dock(BUILD_DOCK, false);
  const boats = { home: littleBoat(BUILD_HOME_DOCK, true), build: littleBoat(BUILD_DOCK) };
  for (const root of [ground, homeDock, buildDock, ...Object.values(boats)]) town.scene.add(root);
  const rects = [];
  const addRect = (x0,x1,z0,z1) => {
    const r = town.addRect?.(x0,x1,z0,z1,'build-island') || {x0,x1,z0,z1,tag:'build-island'};
    if (!town.addRect) (town.rects ||= []).push(r);rects.push(r);
  };
  for (const p of [BUILD_HOME_DOCK, BUILD_DOCK]) addRect(p.x - .22,p.x + 2.02,p.z - 2.18,p.z - 1.82);
  addRect(-722.42,-719.58,-3.18,-2.82);addRect(-722.28,-719.72,-5.59,-4.41);
  const interactions = [
    { id:'buildIslandHomeBoat',zone:'home',x:BUILD_HOME_DOCK.x+.4,z:BUILD_HOME_DOCK.z,r:2.1,prio:.2,label:()=>buildQuestProgress(S).unlocked?'乘船去海风岛':'码头来信 · 海风里的空白蓝图',sub:'独立建造空地 · 免费往返',act:()=>{if(town.zone==='home')bus.emit('buildIslandPanel',{source:'home'});} },
    { id:'buildIslandReturnBoat',zone:'build',x:BUILD_SPAWN.x,z:BUILD_SPAWN.z,r:2.1,prio:.2,label:'乘船回后院',sub:'回家照顾菜园，随时再来',act:()=>{if(town.zone==='build')bus.emit('buildIslandPanel',{source:'build'});} },
    { id:'buildIslandWorkshop',zone:'build',x:-721,z:-1.6,r:1.8,prio:.1,label:'海风建造工坊',sub:'查看蓝图与建造提示',act:()=>{if(town.zone==='build')bus.emit('buildIslandPanel',{source:'build',workshop:true});} },
  ];
  (town.inter ||= []).push(...interactions);
  const bases = Object.fromEntries(Object.entries(boats).map(([id,b])=>[id,{pos:b.position.clone(),rot:b.rotation.clone()}]));
  let sailing = null, closed = false;
  const focusPoint = new THREE.Vector3();
  const boardPassengers = boat => {
    const passengers = [];
    for (const [role, actor, x, y, scale] of [['player', town.player, -.73, .38, .82], ['momo', town.momo, .5, .7, .88]]) {
      const original = actor?.root;
      if (!original) continue;
      // 当前角色都是普通方块层级，不是 SkinnedMesh。复制变换、共用几何与材质，
      // 动画只作用于副本；结束只移除副本，绝不释放原角色仍使用的资源。
      const obj = original.clone(true), nodes = new Map();
      const mapNodes = (a, b) => { nodes.set(a, b); a.children.forEach((child, i) => mapNodes(child, b.children[i])); };
      mapNodes(original, obj);obj.name = 'build-boat-passenger';obj.userData.buildPassenger = role;
      obj.position.set(x, y, 0);obj.rotation.set(0, -Math.PI / 2, 0);obj.scale.setScalar(scale);obj.visible = true;
      const body = nodes.get(actor.body);if(body){body.position.y=0;body.rotation.set(0,0,0);}
      if(role==='player'){
        for(const leg of [actor.legL,actor.legR])nodes.get(leg)?.rotation.set(-Math.PI/2,0,0);
        nodes.get(actor.armL)?.rotation.set(-.3,0,-.12);nodes.get(actor.armR)?.rotation.set(-.3,0,.12);
        nodes.get(actor.head)?.rotation.set(.02,0,0);
      }
      obj.traverse(node=>{if(node.name==='character-contact-blob')node.visible=false;});
      passengers.push({original,obj,visible:original.visible});boat.add(obj);original.visible=false;
    }
    return passengers;
  };
  const tick = time => {
    for (const [id,b] of Object.entries(boats)) {
      if (sailing?.source===id) continue;
      b.position.y=bases[id].pos.y+Math.sin(time*1.65+(id==='home'?0:1.7))*.045;
      b.rotation.z=Math.sin(time*1.1+(id==='home'?0:1.7))*.025;
    }
    if(sailing){const p=Math.min(1,(performance.now()-sailing.start)/1600),k=p*p*(3-2*p),b=boats[sailing.source],base=bases[sailing.source];
      b.position.set(base.pos.x-3.8*k,base.pos.y+Math.sin(p*Math.PI*5)*.055,base.pos.z+Math.sin(p*Math.PI)*.42);b.rotation.y=-.15*Math.sin(p*Math.PI);b.rotation.z=Math.sin(p*Math.PI*5)*.035;
      if(p>=1)finish(true);
    }
  };
  (town.ticks ||= []).push(tick);
  const finish = result => {
    if(!sailing)return;const current=sailing;sailing=null;clearTimeout(current.timer);
    for(const passenger of current.passengers){passenger.obj.removeFromParent();passenger.original.visible=passenger.visible;}
    boats[current.source].position.copy(bases[current.source].pos);boats[current.source].rotation.copy(bases[current.source].rot);
    current.resolve(result);
  };
  const offState = bus.on('stateReplaced',()=>{if(sailing&&S!==sailing.identity)finish(false);});
  const controller = {
    ground,homeDock,buildDock,boats,interactions,rects,
    get active(){return !!sailing;},
    travelFocus() {
      const passenger = sailing?.passengers.find(p => p.obj.userData.buildPassenger === 'player');
      if (!passenger) return null;
      passenger.obj.getWorldPosition(focusPoint);
      focusPoint.y += .8;
      return focusPoint;
    },
    travel(source,destination=source==='home'?'build':'home') {
      if(closed||sailing||!boats[source]||destination!==(source==='home'?'build':'home'))return Promise.resolve(false);
      return new Promise(resolve=>{sailing={source,destination,identity:S,passengers:boardPassengers(boats[source]),start:performance.now(),resolve,timer:setTimeout(()=>finish(true),1750)};tick(performance.now()/1000);});
    },
    travelView() {
      if(!sailing)return null;const b=boats[sailing.source].position;
      return {position:new THREE.Vector3(b.x-5.5,b.y+4.6,b.z+7),target:new THREE.Vector3(b.x,b.y+.85,b.z)};
    },
    dispose(){
      if(closed)return;closed=true;finish(false);offState?.();
      for(const root of [ground,homeDock,buildDock,...Object.values(boats)]){town.scene.remove(root);disposeSceneResources(root);}
      town.inter=town.inter.filter(it=>!interactions.includes(it));town.rects=town.rects.filter(r=>!rects.includes(r));town.ticks=town.ticks.filter(fn=>fn!==tick);
      if(town.buildIslandPort===controller)delete town.buildIslandPort;
    },
  };
  town.buildIslandPort=controller;return controller;
}
