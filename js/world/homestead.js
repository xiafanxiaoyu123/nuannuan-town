import { THREE, group, textPlane, disposeSceneResources } from '../core/kit.js';
import { S, bus, save } from '../core/state.js';
import { applyHomesteadAction } from '../core/homestead-actions.js';
import { DECO, YARDS, CROP, CROPS, FRUIT, FRUITS } from '../data.js';
import { Character, randomNpcLook } from '../models/character.js';
import { RESIDENT_LAYOUT } from '../live/people.js';
import { createAnimal, animateAnimal, createDish, animateDish, createRanchProp, disposeHomesteadModel } from '../models/homestead.js';
import { ensureHomestead, advanceHomestead, getAnimalHousing, parseDishKey, RECIPE, ANIMAL, PANTRY } from '../shared/homestead.js';
import { installHomesteadUI } from '../live/homestead-panels.js';
import { photo } from '../live/photo.js';
import { LOT } from './town/layout.js';
import { planAnimalStep, recordAnimalStep, turnAnimalToward } from './animal-locomotion.js';
import { yardSurfaceAt, isYardStructure } from './yard-building.js';
import { createAnimalResponse, queueAnimalResponse, stepAnimalResponse, clearAnimalResponse } from '../shared/animal-response.js';
import { describeTeaGuest, teaGuestLine } from '../shared/tea-hospitality.js';
import { treeInfo, plotRemain } from './farm.js';
import { recordLifeEvent } from '../core/life-discoveries-actions.js';
import { createAnimalWalk, advanceAnimalWalk, animalWalkPersonality } from '../shared/animal-walk.js';
import { createAnimalWalkPath, recordAnimalWalkPath, nextAnimalWalkPoint, animalSegmentClear } from './animal-walk-path.js';
import { createAnimalReturnNavigator, nextAnimalReturnPoint } from './animal-return-path.js';
import { createAnimalMoment, advanceAnimalMoment } from '../shared/animal-moment.js';
const surfaceId = (zone, e) => [zone, e.id, e.gx, e.gz, e.rot || 0, e.level || 0].join('_');

// 模型只呈现存档中的实例；背包、桌面和招待中的菜从不同时计数。
export function installHomestead(game, ui) {
  if (game.homesteadWorld) return game.homesteadWorld;
  const town = game.town, animals = new Map(), dishes = new Map(), guests = [];
  const off = [], baseAllInter = town.allInter;
  let dirty = true, lastTick = 0, lastState = S, teaId = '', closed = false;
  let animalWalk = null, walkSerial = 0, walkStarting = false, walkRetryAt = 0;
  const pendingWalkEvents = [], viewPoint = new THREE.Vector3();
  let returnNavigator = null, returnNavDirty = false;
  // 地形、畜舍和餐桌均由家园及玩家装修系统拥有。
  const isEditing = () => Object.values(town.decors).some(decor => decor?.active);
  let housing = getAnimalHousing(S);
  const act = action => {
    const result = applyHomesteadAction(action, Date.now());
    if (result.ok) { bus.emit('homesteadChanged', { ...result, ...action, action: action.type }); ui.refreshAll(); }
    if (result.message) ui.toast(result.message);
    return result;
  };
  function allSurfaces() {
    const out = [];
    for (const zone of ['home', 'house', 'build']) for (const rec of town.decors[zone]?.entries || []) {
      const e = rec.e;
      // 桌面中央原有花瓶，左右两侧留出真实可用的位置；中岛前侧避开砧板和水果。
      if (!['dining', 'kitchen_island', 'ranch_picnic'].includes(e.id) || !rec.obj.parent) continue;
      const id = surfaceId(zone, e);
      out.push({ id, zone, rec, object: rec.obj, canHost: e.id !== 'kitchen_island', name: `${zone === 'house' ? '小屋' : zone === 'home' ? '后院' : '工坊'} · ${DECO[e.id].name}`,
        anchors: e.id === 'ranch_picnic' ? (rec.obj.userData.surfaceAnchors || [[-.70, -.33], [.70, -.33], [-.70, .33], [.70, .33]]).map((anchor,i)=>({id:'a'+i,label:'座位 '+(i+1),x:anchor.x ?? anchor[0],y:(rec.obj.userData.tableY || .84)+.012,z:anchor.z ?? anchor[1]})) : [-.46, .46].map((x, i) => ({ id: 'a' + i, label: i ? '右侧' : '左侧', x, y: e.id === 'dining' ? .865 : .98, z: e.id === 'dining' ? 0 : .62 })) });
    }
    return out;
  }
  const findSurface = id => allSurfaces().find(s => s.id === id);
  const pointOf = (s, a) => { s.object.updateWorldMatrix(true, false); return s.object.localToWorld(new THREE.Vector3(a.x, a.y, a.z)); };
  function syncDishes() {
    const h = ensureHomestead(S), surfaces = new Map(allSurfaces().map(s => [s.id, s]));
    let returned = false, failed = '';
    for (const p of [...h.placed]) {
      const surface = surfaces.get(p.surface), anchor = surface?.anchors.find(a => a.id === p.anchor);
      if (!surface || !anchor || surface.zone !== p.zone) {
        const result = applyHomesteadAction({ type: 'retrieve', instanceId: p.id }); returned ||= result.ok;
        if (!result.ok) failed = result.message;
      }
    }
    if (returned) ui.toast('桌面位置改变了，料理已放回成品柜');
    if (failed) ui.toast(failed);
    const current = ensureHomestead(S).placed, ids = new Set(current.map(p => p.id));
    for (const [id, model] of dishes) if (!ids.has(id)) { disposeHomesteadModel(model); dishes.delete(id); }
    for (const p of current) {
      const s = surfaces.get(p.surface), a = s?.anchors.find(v => v.id === p.anchor), parsed = parseDishKey(p.key);
      if (!s || !a || !parsed) { const old = dishes.get(p.id); if (old) old.visible = false; continue; }
      let model = dishes.get(p.id);
      if (!model) { model = createDish(parsed.recipe, parsed); model.name = 'placed-dish-' + p.id; dishes.set(p.id, model); town.scene.add(model); }
      model.position.copy(pointOf(s, a)); model.rotation.y = s.object.rotation.y + p.rotation * Math.PI / 2;
      // 茶会暂借同一张桌：存档里的陈列不动，演出结束后恢复显示，避免双层餐盘。
      model.visible = p.zone === town.zone && !(ensureHomestead(S).tea && p.surface === ensureHomestead(S).tea.surface);
    }
  }
  function disposeAnimal(rec) {
    clearReturnRoute(rec);
    clearAnimalResponse(rec.response);
    disposeHomesteadModel(rec.model);
    for (const node of [rec.status, rec.nameTag]) if (node) { node.removeFromParent(); disposeSceneResources(node); }
  }
  function freePoint(x, z) {
    const y = YARDS[(S.yardLv || 1) - 1];
    return x > LOT.x0 + .45 && x < LOT.x0 + y.x1 + .55 && z > LOT.z0 + .45 && z < LOT.z0 + y.z1 + .55 && !town.blocked(x, z, .28);
  }
  function animalHome(a, index) {
    const key = housing.assignments[a.id], home = housing.homes.find(h => h.key === key);
    const rec = (town.decors.home?.entries || []).find(r => surfaceId('home', r.e) === key);
    if (!home || !rec) return null;
    rec.obj.updateWorldMatrix(true, false);
    const center = rec.obj.getWorldPosition(new THREE.Vector3()), slot = home.animalIds.indexOf(a.id), size = DECO[home.id].size;
    const unoccupied = (x,z) => freePoint(x,z) && ![...animals.values()].some(r=>r.index<index && r.home && !r.home.noSpace && Math.hypot(r.home.x-x,r.home.z-z)<.7);
    for (let ring=0;ring<10;ring++) for(let step=0;step<24;step++) {
      const angle=rec.obj.rotation.y+(slot*6+step)*Math.PI/12, radius=Math.max(...size)*.5+.55+ring*.65;
      const x=center.x+Math.sin(angle)*radius,z=center.z+Math.cos(angle)*radius;
      if(unoccupied(x,z)) return {x,z,key,yaw:rec.obj.rotation.y};
    }
    // 密集装修先寻找真实空地，不把动物塞进实体棚舍中。
    const yard=YARDS[(S.yardLv||1)-1];let candidate=null,nearest=Infinity;
    for(let x=LOT.x0+.7;x<LOT.x0+yard.x1+.3;x+=.8)for(let z=LOT.z0+.7;z<LOT.z0+yard.z1+.3;z+=.8){
      const distance=Math.hypot(x-center.x,z-center.z);
      if(distance<nearest&&unoccupied(x,z)){nearest=distance;candidate={x,z,key,yaw:rec.obj.rotation.y,waiting:true};}
    }
    if(candidate)return candidate;
    const box=new THREE.Box3().setFromObject(rec.obj);
    return {x:center.x,z:center.z,key,yaw:rec.obj.rotation.y,noSpace:true,markerY:Number.isFinite(box.max.y)?box.max.y+.35:2.4};
  }
  function canAnimalMove(from,x,z) {
    return freePoint(x,z) && animalSegmentClear(from,{x,z},town.rects,town.circles);
  }
  function clearReturnRoute(rec) {
    returnNavigator?.cancel(rec);rec.returnRoute=null;rec.returnBlocked=false;rec.blockedFor=0;
  }
  function invalidateReturnRoutes() {
    returnNavigator?.dispose();returnNavigator=null;returnNavDirty=false;
    for(const rec of animals.values())clearReturnRoute(rec);
  }
  function returnNavigation() {
    if(returnNavDirty)invalidateReturnRoutes();
    if(!returnNavigator){const yard=YARDS[(S.yardLv||1)-1];returnNavigator=createAnimalReturnNavigator({bounds:{x0:LOT.x0+.45,x1:LOT.x0+yard.x1+.55,z0:LOT.z0+.45,z1:LOT.z0+yard.z1+.55},rects:town.rects,circles:town.circles});}
    return returnNavigator;
  }
  function homeTarget(a,rec) {
    const model=rec.model,goal={x:rec.home.x,z:rec.home.z},homeDistance=Math.hypot(model.position.x-goal.x,model.position.z-goal.z);
    if(homeDistance<.25||canAnimalMove(model.position,goal.x,goal.z)){
      clearReturnRoute(rec);rec.routeState=homeDistance<.25?'home':'returning';return goal;
    }
    const nav=returnNavigation();
    let route=rec.returnRoute;
    if(!route||route.source!==S||route.homeKey!==rec.home.key||route.goal.x!==goal.x||route.goal.z!==goal.z){
      clearReturnRoute(rec);route=rec.returnRoute={source:S,homeKey:rec.home.key,goal,points:null,replans:0};nav.request(rec,model.position,goal);
    }
    const state=nav.view(rec);
    rec.routeState=state?.state||'blocked';rec.returnBlocked=rec.routeState==='blocked';
    if(rec.routeState!=='returning')return null;
    if(!route.points)route.points=state.points.map(p=>({...p}));
    const target=nextAnimalReturnPoint(route.points,model.position,(from,to)=>canAnimalMove(from,to.x,to.z));
    if(!target){rec.routeState='blocked';rec.returnBlocked=true;}
    return target;
  }
  function nameTag(a, blocked = false) {
    const tag = group(), gold = a.love >= 100 && !blocked;
    const label = textPlane(a.name + (blocked ? ' · 请留出空地' : ''), { height: .23, size: 56, weight: 700, color: blocked ? '#985b36' : gold ? '#765a2c' : '#765b50', bg: '#fff5df' });
    if (gold) {
      const rim = new THREE.Mesh(new THREE.PlaneGeometry((label.userData.width || .8) + .055, .285), new THREE.MeshBasicMaterial({ color: '#d9ad52' }));
      rim.position.z = -.008; tag.add(rim);
    }
    tag.add(label); tag.name = 'animal-name-' + a.id; tag.userData.noMerge = true; tag.userData.gold = gold; town.scene.add(tag); return tag;
  }
  function animalStatus(a, rec, now) {
    const ready = a.ready + a.readyPrime, supplied = a.feed + a.emergency > 0 || a.cycleAt > now;
    const signature = [a.kind, ready, supplied, rec.home.key].join(':');
    if (signature !== rec.statusKey) {
      if (rec.status) { rec.status.removeFromParent(); disposeSceneResources(rec.status); }
      rec.status = group(); rec.status.name = 'animal-produce-' + a.id;
      // 不自动生成永久食槽和围栏，只显示已产出的收集物。
      if (ready) {
        const type = ['chicken','duck'].includes(a.kind) ? 'nest' : ['cow','goat'].includes(a.kind) ? 'milk_bucket' : 'wool';
        const produce=createRanchProp(type,{count:ready}); produce.scale.setScalar(.65); rec.status.add(produce);
      }
      town.scene.add(rec.status); rec.statusKey=signature;
    }
    rec.status.position.set(rec.home.x+.45,0,rec.home.z+.35);
    if (ready < rec.ready && ['sheep','alpaca'].includes(a.kind)) rec.shornUntil = now + ANIMAL[a.kind].cycleMs * .2 * (a.cycleEmergency ? 2 : 1);
    const shorn = ['sheep','alpaca'].includes(a.kind) && (rec.shornUntil || 0) > now;
    if (shorn !== rec.model.userData.shorn) {
      const old = rec.model, model = createAnimal(a.kind, { coat: a.look, shorn }); model.position.copy(old.position); model.quaternion.copy(old.quaternion);
      town.scene.add(model); rec.model = model; disposeHomesteadModel(old);
    }
    rec.ready = ready;
    const blocked=rec.home.noSpace||rec.returnBlocked;
    const tagKey = `${a.name}:${a.love >= 100}:${!!blocked}`;
    if (tagKey !== rec.tagKey) { if (rec.nameTag) { rec.nameTag.removeFromParent(); disposeSceneResources(rec.nameTag); } rec.nameTag = nameTag(a,blocked); rec.tagKey = tagKey; }
  }
  function syncAnimals() {
    const h=ensureHomestead(S); housing=getAnimalHousing(S);
    const housed=new Set(Object.keys(housing.assignments).filter(id=>housing.assignments[id]));
    for(const [id,rec] of animals) if(!housed.has(id)){disposeAnimal(rec);animals.delete(id);}
    h.animals.forEach((a,i)=>{
      const home=animalHome(a,i); if(!home)return;
      let rec=animals.get(a.id);
      if(!rec){const model=createAnimal(a.kind,{coat:a.look});model.position.set(home.x,0,home.z);town.scene.add(model);rec={model,love:a.love,ready:a.ready+a.readyPrime,response:createAnimalResponse(),index:i,callUntil:0};animals.set(a.id,rec);}
      if(rec.home?.key!==home.key || rec.home?.noSpace || !freePoint(rec.model.position.x,rec.model.position.z)){rec.model.position.set(home.x,0,home.z);rec.callUntil=0;rec.callRemaining=0;rec.photoPose=false;rec.returnToHome=false;clearReturnRoute(rec);}
      rec.home=home;rec.love=a.love;rec.index=i;animalStatus(a,rec,Date.now());
    });
  }
  function clearGuests() {
    guests.splice(0).forEach(g=>{
      if(g.borrowed){if(g.seated && town.zone===g.zone){g.root.position.set(town.pos.x+.8,town.pos.y,town.pos.z+.4);g.actor.targetMove=0;}if(g.actor.head)g.actor.head.rotation.x=g.headX||0;}
      else {g.root.removeFromParent();disposeSceneResources(g.root);}
    });teaId='';
  }
  function clearStandingPoint(point, zone, radius = .36) {
    const decor=town.decors[zone],lot=decor?.lot;
    if(lot&&(point.x<lot.x0+radius||point.z<lot.z0+radius||point.x>lot.x0+lot.cols-radius||point.z>lot.z0+lot.rows-radius))return false;
    if(zone==='home'&&!freePoint(point.x,point.z))return false;
    if(zone==='build'&&lot){
      const height=yardSurfaceAt(decor.entries.map(rec=>rec.e),DECO,point.x-lot.x0,point.z-lot.z0,point.y);
      if(Math.abs(height-point.y)>.08)return false;
    }
    for(const r of town.rects||[]){
      if(r.y1!==undefined&&r.y1<=point.y+.06||r.y0!==undefined&&r.y0>=point.y+1.7)continue;
      if(point.x>r.x0-radius&&point.x<r.x1+radius&&point.z>r.z0-radius&&point.z<r.z1+radius)return false;
    }
    for(const c of town.circles||[])if(Math.hypot(point.x-c.x,point.z-c.z)<c.r+radius)return false;
    return true;
  }
  function tableStandingPoints(table,count=2) {
    const size=DECO[table.rec.e.id]?.size||[3,2],w=size[0]/2+.58,d=size[1]/2+.58;
    const candidates=[[-.70,d],[.70,d],[-.70,-d],[.70,-d],[-w,-.45],[-w,.45],[w,-.45],[w,.45],[0,d+.5],[0,-d-.5]];
    const center=pointOf(table,{x:0,y:-.05,z:0}),points=[];
    for(const [x,z] of candidates){
      const p=pointOf(table,{x,y:-.05,z});
      if(clearStandingPoint(p,table.zone)&&points.every(v=>v.seat.distanceTo(p)>.8))points.push({seat:p,yaw:Math.atan2(center.x-p.x,center.z-p.z)});
      if(points.length>=count)break;
    }
    return points;
  }
  function troughStatus(rec) {
    let nearest=null,distance=Infinity;
    for(const home of housing.homes){
      const building=town.decors.home.entries.find(v=>surfaceId('home',v.e)===home.key);
      if(!building)continue;const d=building.obj.position.distanceTo(rec.obj.position);
      if(d<distance){distance=d;nearest=home;}
    }
    if(!nearest||distance>12)return {housingKey:'',label:'附近没有住处 · 先在食槽旁摆放鸡舍、畜棚或兔窝',filled:false};
    const residents=S.homestead.animals.filter(a=>nearest.animalIds.includes(a.id));
    const feed=residents.reduce((n,a)=>n+a.feed,0),emergency=residents.reduce((n,a)=>n+a.emergency,0),hungry=residents.filter(a=>!a.feed&&!a.emergency&&!a.cycleAt).length;
    return {housingKey:nearest.key,feed,emergency,hungry,filled:feed+emergency>0,label:`${nearest.name} · ${residents.length}只 · 待用饲料${feed} / 草料${emergency}${hungry?' · '+hungry+'只缺料':!residents.length?' · 还没有动物':' · 正常照料中'}`};
  }
  function syncTroughs(){for(const rec of town.decors.home?.entries||[])if(rec.e.id==='ranch_trough')rec.obj.userData.setFeedFilled?.(troughStatus(rec).filled);}
  function cancelTea(tea,message){
    const result=applyHomesteadAction({type:'teaCancel',taskId:tea.id});
    if(result.ok){ui.toast(message);ui.refreshAll();}else ui.toast(result.message||'招待暂时无法结束，请稍后重试');
    clearGuests();return result.ok;
  }
  function syncGuests() {
    let tea=ensureHomestead(S).tea;
    const table=tea&&findSurface(tea.surface);
    if(tea && (!table || !table.canHost || table.anchors.length<tea.keys.length)){
      cancelTea(tea,'招待餐桌移动或收起了，料理已退回冰箱');return;
    }
    if(!tea||table.zone!==town.zone){clearGuests();return;}
    const seats=tableStandingPoints(table,tea.guests.length);
    if(seats.length<tea.guests.length){cancelTea(tea,'桌边没有足够的站立空地，本场料理已退回冰箱。请为来客留出通道');return;}
    if(tea.id===teaId){let i=0;for(const g of guests)if(!g.dish)Object.assign(g,seats[i++]);return;}
    clearGuests();if(!tea)return;teaId=tea.id;
    tea.guests.forEach((id,i)=>{
      const {seat,yaw}=seats[i];
      if(id==='momo')guests.push({id,root:town.momo.root,actor:town.momo,borrowed:true,seat,zone:table.zone,yaw,seated:false,headX:town.momo.head?.rotation.x||0});
      else {const ch=new Character(randomNpcLook(RESIDENT_LAYOUT[id]?.look||0));ch.root.position.copy(seat);ch.root.rotation.y=yaw;ch.setPose?.('wave');town.scene.add(ch.root);guests.push({id,root:ch.root,actor:ch,seat,yaw,zone:table.zone});}
    });
    tea.keys.forEach((key,i)=>{const p=parseDishKey(key),model=createDish(p.recipe,p);model.position.copy(pointOf(table,table.anchors[i]));model.rotation.y=table.object.rotation.y;model.name='tea-dish-'+i;town.scene.add(model);guests.push({root:model,dish:true,zone:table.zone});});
  }
  function sync(){dirty=false;syncAnimals();syncGuests();syncDishes();syncTroughs();town.renderOptimizer?.invalidateBounds();}
  function bindCurrentState() {
    if (lastState !== S) {
      animalWalk = null; pendingWalkEvents.length = 0;
      invalidateReturnRoutes();
      lastState = S; dirty = true;
      for (const model of dishes.values()) disposeHomesteadModel(model);
      for (const rec of animals.values()) disposeAnimal(rec);
      dishes.clear(); animals.clear(); clearGuests();
    }
  }
  const layoutStamp = () => JSON.stringify((S.placed || []).map(e => [e.id,e.gx,e.gz,e.rot||0,e.level||0]));
  function sceneUsable() {
    return !closed && town.zone === 'home' && !isEditing() && !town.modal && !game.busy && !photo.on && !town.photoOn && town.camMode === 'play' && !document.hidden && document.hasFocus() && window.innerWidth >= window.innerHeight && !document.documentElement.classList.contains('landscape-required');
  }
  function animalInView(rec) {
    town.camera.updateMatrixWorld();
    viewPoint.copy(rec.model.position); viewPoint.y += (rec.model.userData.height || .6) * .5;
    viewPoint.applyMatrix4(town.camera.matrixWorldInverse);
    if (viewPoint.z >= -town.camera.near) return false;
    viewPoint.applyMatrix4(town.camera.projectionMatrix);
    return Number.isFinite(viewPoint.z) && viewPoint.z >= -1 && viewPoint.z <= 1 && Math.abs(viewPoint.x) <= 1.05 && Math.abs(viewPoint.y) <= 1.05;
  }
  function walkStops(a) {
    const homes = getAnimalHousing(S), ownHome = homes.assignments[a.id], stops = [];
    for (const rec of town.decors.home?.entries || []) {
      if (!S.placed?.includes(rec.e) || !rec.obj.parent) continue;
      const id=rec.e.id,key=surfaceId('home',rec.e),kind=key===ownHome?'home':({ranch_hay:'hay',ranch_trough:'trough',ranch_flower:'flowers'})[id];
      if(!kind)continue;
      const def=DECO[id], [w,d]=def.size;
      for(const [x,z] of [[0,d/2+.6],[0,-d/2-.6],[w/2+.6,0],[-w/2-.6,0]]){
        const p=rec.obj.localToWorld(new THREE.Vector3(x,0,z));
        if(freePoint(p.x,p.z))stops.push({key,kind,name:def.name,position:{x:p.x,z:p.z},entry:rec});
      }
    }
    return stops;
  }
  function nearestWalkStop(walk,rec) {
    let best=null,score=Infinity;
    for(const stop of walk.stops){
      const a=Math.hypot(rec.model.position.x-stop.position.x,rec.model.position.z-stop.position.z),p=Math.hypot(town.pos.x-stop.position.x,town.pos.z-stop.position.z);
      const candidateScore=a+p+(walk.logic.visitedKeys.includes(stop.key)?100:0);
      if(a<=2.2&&p<=2.2&&candidateScore<score&&canAnimalMove(rec.model.position,stop.position.x,stop.position.z)&&canAnimalMove(town.pos,stop.position.x,stop.position.z)){best=stop;score=candidateScore;}
    }
    return best;
  }
  function retryWalkEvents() {
    if(closed)return false;
    for(let i=0;i<pendingWalkEvents.length;){
      const pending=pendingWalkEvents[i];
      if(pending.source!==S){pendingWalkEvents.splice(i,1);continue;}
      const result=recordLifeEvent(pending.event,pending.source);
      if(!result.ok)return false;
      pendingWalkEvents.splice(i,1);
    }
    return true;
  }
  function stopWalk(expectedId,returnHome=true) {
    if(!animalWalk || expectedId!==undefined&&animalWalk.id!==expectedId)return false;
    const rec=animals.get(animalWalk.animalId);if(rec){rec.returnToHome=returnHome&&Math.hypot(rec.model.position.x-rec.home.x,rec.model.position.z-rec.home.z)>.25;rec.routeState=rec.returnToHome?'returning':null;}
    animalWalk=null;return true;
  }
  function startWalkMoment(walk,a,rec,stop) {
    const entry=stop.entry;
    if(!entry||!S.placed?.includes(entry.e)||!entry.obj.parent)return;
    entry.obj.updateWorldMatrix(true,false);
    const center=entry.obj.getWorldPosition(new THREE.Vector3()),local=entry.obj.worldToLocal(rec.model.position.clone()),[w,d]=DECO[entry.e.id].size;
    const edgeDistance=Math.hypot(Math.max(0,Math.abs(local.x)-w/2),Math.max(0,Math.abs(local.z)-d/2));
    const state=createAnimalMoment({species:a.kind,place:stop.kind,personality:a.personality,near:edgeDistance<=1});
    if(state)walk.moment={source:S,walkId:walk.id,rec,stop,entry,state,lookAt:{x:center.x,z:center.z},player:{x:town.pos.x,z:town.pos.z}};
  }
  function stepWalkMoment(walk,rec,frame,eligible,careShown) {
    const moment=walk.moment;if(!moment)return;
    const stop=moment.stop,entry=moment.entry;
    const valid=moment.source===S&&moment.walkId===walk.id&&moment.rec===rec&&
      S.placed?.includes(entry.e)&&(town.decors.home?.entries||[]).includes(entry)&&entry.obj.parent&&surfaceId('home',entry.e)===stop.key;
    // 只托管当前角落的一次短动作；玩家迈步或新照料会立即释放，不积压过时演出。
    const moved=Math.hypot(town.pos.x-moment.player.x,town.pos.z-moment.player.z)>.03;
    const left=Math.hypot(town.pos.x-stop.position.x,town.pos.z-stop.position.z)>2.2||Math.hypot(rec.model.position.x-stop.position.x,rec.model.position.z-stop.position.z)>2.2;
    if(!valid||careShown||rec.response.active||rec.response.pending.length||rec.callRemaining>0||moved||left){walk.moment=null;return;}
    moment.state=advanceAnimalMoment(moment.state,frame,{eligible});
    if(!moment.state){walk.moment=null;return;}
    if(eligible)rec.model.rotation.y=turnAnimalToward(rec.model.rotation.y,Math.atan2(moment.lookAt.x-rec.model.position.x,moment.lookAt.z-rec.model.position.z),frame*1.8);
  }
  function updateWalk(a,rec,frame,eligible,careShown=false) {
    const walk=animalWalk;if(!walk||walk.animalId!==a.id)return;
    walk.visible=sceneUsable();walk.paused=!eligible;
    stepWalkMoment(walk,rec,frame,eligible,careShown);
    const trail=recordAnimalWalkPath(walk.path,town.pos,frame,eligible,canAnimalMove);
    if(trail.invalid){stopWalk(walk.id);ui.toast(trail.reason);return;}
    let blocked=!trail.ok;
    if(eligible&&trail.ok&&!careShown&&!rec.response.active&&!walk.moment){
      const next=nextAnimalWalkPoint(walk.path,rec.model.position,animalWalkPersonality(a.personality).followDistance,canAnimalMove);
      blocked=next.blocked;
      if(next.target){
          const step=planAnimalStep(a.kind,rec.model.position,rec.model.rotation.y,next.target,frame,2.2);
        rec.model.rotation.y=step.yaw;
        if(canAnimalMove(rec.model.position,step.x,step.z))rec.model.position.set(step.x,0,step.z);else blocked=true;
      }
    }
    const stop=eligible?(walk.moment?.stop||nearestWalkStop(walk,rec)):null,result=advanceAnimalWalk(walk.logic,{dt:frame,eligible,player:town.pos,animal:rec.model.position,blocked,stop});
    walk.logic=result.session;walk.phase=result.status;walk.status=({following:'一起慢慢走',waiting:'等等伙伴',settling:'在这里歇一会儿',arrived:'记住这个角落',paused:'散步暂停'})[result.status]||'一起散步';
    walk.detail=trail.ok?result.line:trail.reason;
    if(walk.visible&&!eligible)walk.detail=Math.hypot(town.pos.x-rec.model.position.x,town.pos.z-rec.model.position.z)>6?'离伙伴有点远啦，回头靠近一些，等它一起走':'转向看看伙伴，等它回到画面里再一起走';
    if(result.status==='cancelled'){stopWalk(walk.id);ui.toast(result.line);return;}
    if(result.event){
      walk.visited.push({kind:stop.kind,name:stop.name,text:result.line});
      pendingWalkEvents.push({source:walk.source,event:result.event});
      retryWalkEvents();
      if(!careShown&&!rec.response.active&&!rec.response.pending.length&&!rec.callRemaining)startWalkMoment(walk,a,rec,stop);
    }
  }
  function tick(time, dt) {
    if (closed) return;
    bindCurrentState();
    const now = Date.now();
    const editing = isEditing();
    if (!editing && (now - lastTick >= 1000 || now < lastTick)) {
      lastTick = now; const before = JSON.stringify(S.homestead?.animals);
      advanceHomestead(S, now);
      if (JSON.stringify(S.homestead.animals) !== before) { save(); dirty = true; }
      for (const a of S.homestead.animals) { const rec = animals.get(a.id); if (rec) animalStatus(a, rec, now); }
      syncTroughs();
    }
    if (dirty && !editing) { if(animalWalk&&layoutStamp()!==animalWalk.layout)stopWalk(animalWalk.id); sync(); }
    if(animalWalk && (animalWalk.source!==S || town.zone!=='home' || !animals.has(animalWalk.animalId) || animals.get(animalWalk.animalId).home.key!==animalWalk.homeKey))stopWalk(animalWalk.id);
    const walkPaused=!!animalWalk&&!sceneUsable();
    if(walkPaused){
      const a=S.homestead.animals.find(a=>a.id===animalWalk.animalId),rec=animals.get(animalWalk.animalId);
      if(a&&rec)updateWalk(a,rec,0,false);
    }
    if(pendingWalkEvents.length&&sceneUsable()&&now-walkRetryAt>=5000){walkRetryAt=now;retryWalkEvents();}
    if(returnNavDirty)invalidateReturnRoutes();
    const returnEligible=sceneUsable();
    if(returnEligible)returnNavigator?.tick();
    for(const a of S.homestead.animals){
      const rec=animals.get(a.id);if(!rec)continue;
      const visible=town.zone==='home';rec.model.visible=visible&&!rec.home.noSpace;if(rec.status)rec.status.visible=visible&&!editing&&!rec.home.noSpace;if(rec.nameTag)rec.nameTag.visible=false;
      if(!visible||editing){
        // 暂停已有短回应时只收起一次姿态，随后保持原有装修冻结，不空转骨骼。
        if(rec.responseShown){animateAnimal(rec.model,time,'idle',{distance:rec.walkDistance||0,speed:0,dt:0});rec.responseShown=false;}
        continue;
      }
      if(rec.home.noSpace){if(rec.nameTag){rec.nameTag.visible=true;rec.nameTag.position.set(rec.home.x,rec.home.markerY,rec.home.z);rec.nameTag.quaternion.copy(town.camera.quaternion);}continue;}
      const phase=time*.22+rec.index*1.8,sleeping=town.night>.7;
      const visibleResponse=sceneUsable()&&animalInView(rec)&&Math.hypot(town.pos.x-rec.model.position.x,town.pos.z-rec.model.position.z)<=6;
      const called=rec.callRemaining>0||(rec.photoPose&&photo.on);
      if(rec.callRemaining>0&&visibleResponse)rec.callRemaining=Math.max(0,rec.callRemaining-Math.max(0,Math.min(.1,dt||0)));
      // 短回应只在玩家能看见时计时；完成弹窗、远离、后台等不会提前耗尽。
      const canRespond=!called&&visibleResponse;
      const response=stepAnimalResponse(rec.response,dt,canRespond);
      const petting=response==='pet',feeding=response==='feed';
      if(rec.returnToHome&&Math.hypot(rec.model.position.x-rec.home.x,rec.model.position.z-rec.home.z)<.25){rec.returnToHome=false;clearReturnRoute(rec);}
      const roaming=a.grazing&&!rec.returnToHome&&!sleeping&&!called&&!petting&&!feeding;
      const {x:cx,z:cz}=rec.home,model=rec.model,beforeX=model.position.x,beforeZ=model.position.z;
      const frame=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;let tx=cx,tz=cz;
      if(animalWalk?.animalId===a.id){
        rec.routeState='walking';
        if(!walkPaused)updateWalk(a,rec,frame,visibleResponse,!!response||called);
      }else if(called){
        model.rotation.y=turnAnimalToward(model.rotation.y,Math.atan2(town.pos.x-beforeX,town.pos.z-beforeZ),frame*3);
      }else if(!petting&&!feeding){
        if(roaming){if(rec.returnRoute)clearReturnRoute(rec);rec.routeState='roaming';}
        if(roaming&&a.love>=50&&Math.hypot(town.pos.x-cx,town.pos.z-cz)<3){tx=town.pos.x-.9;tz=town.pos.z-.9;}
        else if(roaming){tx+=Math.sin(phase)*1.1;tz+=Math.cos(phase)*.7;}
        const target=roaming?{x:tx,z:tz}:returnEligible?homeTarget(a,rec):null;
        if(target){
          const step=planAnimalStep(a.kind,model.position,model.rotation.y,target,frame);
          model.rotation.y=step.yaw;
          if((step.x!==beforeX||step.z!==beforeZ)&&canAnimalMove(model.position,step.x,step.z))model.position.set(step.x,0,step.z);
        }
        const returning=!roaming&&Math.hypot(tx-beforeX,tz-beforeZ)>.25;
        if(roaming||returnEligible)rec.blockedFor=target&&returning&&Math.hypot(model.position.x-beforeX,model.position.z-beforeZ)<.0001?(rec.blockedFor||0)+frame:0;
        if(returnEligible&&rec.blockedFor>1.2){
          if(rec.returnRoute&&rec.returnRoute.replans<2){rec.returnRoute.replans++;rec.returnRoute.points=null;returnNavigation().request(rec,model.position,rec.returnRoute.goal);rec.routeState='searching';rec.blockedFor=0;}
          else{rec.routeState='blocked';rec.returnBlocked=true;}
        }
      }
      const motion=recordAnimalStep(rec,beforeX,beforeZ,frame),walking=motion.speed>.008;
      const atHome=Math.hypot(model.position.x-cx,model.position.z-cz)<.25;
      const moment=animalWalk?.animalId===a.id?animalWalk.moment?.state:null;
      if(moment){motion.moment=moment;if(!visibleResponse)motion.dt=0;}
      animateAnimal(model,time,petting?'pet':called?'call':feeding?'eat':walking?'walk':moment?'idle':sleeping&&atHome?'sleep':'idle',motion);
      rec.responseShown=!!response;
      if(rec.nameTag){rec.nameTag.visible=a.love>=100||rec.returnBlocked||Math.hypot(town.pos.x-model.position.x,town.pos.z-model.position.z)<4;rec.nameTag.position.copy(model.position);rec.nameTag.position.y+=model.userData.height+.11;rec.nameTag.quaternion.copy(town.camera.quaternion);}
    }
    let effects = 0;
    const dishEffect = model => { animateDish(model, time); const steam = model.userData.parts?.steam; if (steam?.visible) steam.visible = effects++ < 4; };
    const surfaceIds = new Set(allSurfaces().map(s=>s.id));
    for(const p of S.homestead.placed){const model=dishes.get(p.id);if(!model)continue;model.visible=p.zone===town.zone&&surfaceIds.has(p.surface)&&!(S.homestead.tea&&p.surface===S.homestead.tea.surface);if(model.visible)dishEffect(model);}
    guests.forEach(g=>{
      const visible=town.zone===g.zone&&!editing;if(!g.borrowed)g.root.visible=visible;if(!visible)return;
      if(g.dish){dishEffect(g.root);return;}
      g.root.position.copy(g.seat);g.root.rotation.y=g.yaw;g.actor.targetMove=0;
      const tea=S.homestead.tea,fraction=tea?Math.min(1,(now-tea.startedAt)/Math.max(1,tea.readyAt-tea.startedAt)):1;
      const stage=fraction<.18?0:fraction<.45?1:fraction<.8?2:3;
      const servedKey=tea?.served?.[g.id]||'',stageKey=`${stage}:${servedKey}`;
      if(g.stageKey!==stageKey){
        const tasting=!!servedKey&&servedKey!==g.servedKey;
        g.stageKey=stageKey;g.servedKey=servedKey;g.stage=tasting?2:stage;
        const guest=describeTeaGuest(S,tea,g.id);
        g.actor.setPose?.(['wave','idle','carry','photo_happy'][g.stage]);
        const speaker=stage<2?tea?.guests[0]:tea?.guests[tea.guests.length-1];
        if(guest&&(tasting||g.id===speaker))bus.emit('bubble',{obj:g.root,name:guest.name,text:teaGuestLine(S,tea,g.id,g.stage),life:4.5,zone:g.zone,teaId:tea.id});
      }
      if(g.borrowed){g.seated=true;if(g.actor.head)g.actor.head.rotation.x=(g.headX||0)+(g.stage===2?.10+Math.sin(time*2)*.035:0);}
      else g.actor?.update?.(dt);
    });
  }
  function wrappedAllInter() {
    const list = baseAllInter.call(this);
    if (this.photoOn || this.camMode !== 'play' || this.decor.active) return list;
    // Prompts are re-resolved on click. Anchor them to the saved entity rather
    // than this transient descriptor; a new save must also invalidate old input.
    const push = (target, id, x, z, label, fn, r = 2.4, sub = '') => list.push({ id, x, z, r, label, sub, target, targetState: S, act: fn });
    if(this.zone==='home'){
      for(const rec of town.decors.home.entries){
        const id=rec.e.id,p=rec.obj.position;
        if(DECO[id]?.ranchHousing)push(rec.e,surfaceId('home',rec.e),p.x,p.z,`${DECO[id].name} · 照顾住在这里的动物`,()=>game.homesteadUI.openRanch({housingKey:surfaceId('home',rec.e)}));
        if(id==='ranch_sign')push(rec.e,surfaceId('home',rec.e),p.x,p.z,'牧场手账 · 照顾动物',()=>game.homesteadUI.openRanch());
        if(id==='ranch_cookstation')push(rec.e,surfaceId('home',rec.e),p.x,p.z,'田园料理台 · 烹饪',()=>game.homesteadUI.openKitchen());
        if(id==='ranch_trough'){const status=troughStatus(rec);push(rec.e,surfaceId('home',rec.e),p.x,p.z,'食槽 · 照料与投喂',()=>game.homesteadUI.openRanch({housingKey:status.housingKey}),2.4,status.label);}
      }
      for(const a of S.homestead.animals){
        const rec=animals.get(a.id);if(!rec)continue;const p=rec.model.position,ready=a.ready+a.readyPrime,space=api.getAnimalSpaceStatus(a.id);
        push(a,'animal_'+a.id,p.x,p.z,`照顾${a.name}`,()=>game.homesteadUI.openAnimalActions(a.id),2.4,space.status==='blocked'?space.message:`${ANIMAL[a.kind].name} · 待收 ${ready}`);
        if(ready&&!rec.home.noSpace&&rec.status){const pos=rec.status.position;push(a,'produce_'+a.id,pos.x,pos.z,`收取${a.name}的${PANTRY[ANIMAL[a.kind].product]?.name||'产物'} ×${ready}`,()=>game.homesteadUI.openAnimalActivity(a.id,'collect'),2.2,`${a.readyPrime?'含优选 '+a.readyPrime+' 份 · ':''}亲手收好后放入食材柜`);}
      }
    }
    for(const table of allSurfaces()){
      if(table.zone!==this.zone||Math.abs(table.object.position.y-this.pos.y)>.2)continue;
      const active=S.homestead.tea?.surface===table.id,tea=S.homestead.tea;
      if(active){const remaining=Math.max(0,Math.ceil((tea.readyAt-Date.now())/1000));push(tea,'tea_'+tea.id,table.object.position.x,table.object.position.z,remaining?'招待进行中 · '+remaining+'秒':'朋友还在桌边 · 继续招待',()=>game.homesteadUI.openTea({surface:table.id,zone:table.zone}),3,remaining?'点餐桌可继续查看这场招待':'继续给朋友递菜，或在面板里收好这份回忆');}
      else if(table.rec.e.id==='ranch_picnic')push(table.rec.e,table.id,table.object.position.x,table.object.position.z,'野餐桌 · 摆盘与招待',()=>game.homesteadUI.openTable({surface:table.id,zone:table.zone}),2.6);
    }
    for (const p of S.homestead.placed) {
      const model = dishes.get(p.id); if (!model?.visible || p.zone !== this.zone || Math.abs(model.position.y - this.pos.y) > 1.5) continue;
      push(p,'dish_' + p.id, model.position.x, model.position.z, `品尝与整理 · ${RECIPE[parseDishKey(p.key).recipe].name}`, () => game.homesteadUI.openDishActions(p.id), 2.2);
    }
    return list;
  }
  async function goHome(){
    if(town.zone==='home')return true;const source=S;
    if(town.zone==='build')await game.buildIslandAction('return');else await game.travel('home');
    return !closed&&S===source&&town.zone==='home';
  }
  function approach(point,zone='home',extraClear=()=>true){
    for(const radius of [.9,1.3,1.8,2.4])for(let i=0;i<12;i++){
      const p=new THREE.Vector3(point.x+Math.sin(i*Math.PI/6)*radius,point.y||0,point.z+Math.cos(i*Math.PI/6)*radius);
      if(clearStandingPoint(p,zone)&&extraClear(p)){town.pos.copy(p);town.player.root.position.copy(p);town.moveTo=null;town.camSnap=true;town.face?.(point.x,point.z);return true;}
    }
    return false;
  }
  // 只读备餐目的地：沿用农田的实际交互与生长状态，不推进收获，也不改当前种子。
  function ingredientTarget(cropId) {
    const fruit = Object.hasOwn(FRUIT, cropId), crop = fruit ? FRUIT[cropId] : CROPS.find(item => item.id === cropId);
    if (!crop) return { cropId, status: 'invalid', label: '暂时没有对应的田园材料', detail: '请选择有效的作物或水果。' };
    const field = fruit ? '果树田' : '田地', plots = (town.decors.home?.entries || []).filter(rec => rec.e.id === (fruit ? 'bigplot' : 'plot'));
    const base = { cropId, fruit };
    if (!plots.length) return { ...base, status: 'missing', label: `还没有${field}`, detail: `先在家园摆放${field}，就能种${crop.name}。` };
    let target = null, empty = null;
    for (const rec of plots) {
      const plant = town.farm.state(rec);
      if (!plant) { empty ||= rec; continue; }
      if ((fruit ? plant.tree : plant.crop) !== cropId) continue;
      const interaction = town.farm.buildPlotInter(rec), ready = ['harvest', 'pickFruit'].includes(interaction.action);
      if (!target || ready && !target.ready) target = { rec, plant, interaction, ready };
    }
    if (!target && !empty) return { ...base, status: 'occupied', label: `${field}都种着其他植物`, detail: fruit ? `当前没有${crop.name}或空果树田。可以另摆一块果树田；不会替换或清空已有果树。` : `当前没有${crop.name}或空田地。可以等现有作物收好，或另摆一块田地；不会替换或清空已有植物。` };
    const rec = target?.rec || empty, position = { x: rec.obj.position.x, y: rec.obj.position.y, z: rec.obj.position.z }, plotKey = `${rec.e.gx},${rec.e.gz}`;
    if (!target) {
      const free = !fruit && (S.seeds?.[cropId] || 0) > 0;
      return { ...base, status: 'empty', label: `空${field}可以种${crop.name}`, detail: free ? `有免费种子 ×${S.seeds[cropId]}。到田边选好种子后，再亲手播种。` : `${fruit ? '树苗' : '种子'}需要 ${fruit ? crop.price : crop.seed} 噗灵。到田边选择后，再亲手决定是否种下。`, position, plotKey, action: fruit ? 'plantTree' : 'plant' };
    }
    const { interaction, plant, ready } = target, status = ready ? 'ready' : interaction.action === 'water' ? 'water' : 'growing';
    return { ...base, status, label: interaction.label, detail: interaction.sub || (ready ? '亲手收获后，就能放进料理材料里。' : `${crop.name}正在慢慢长大。`), position, plotKey, action: interaction.action || null, remain: fruit ? treeInfo(plant).remain : plotRemain(plant) };
  }
  // 巡田使用同一块真实田的交互状态；这里只读，不替玩家选种或照料。
  function fieldTargets() {
    return town.farm.recs().filter(rec => town.farm.currentPlot(rec)).map(rec => {
      const p = town.farm.state(rec), interaction = town.farm.buildPlotInter(rec), fruit = rec.e.id === 'bigplot';
      const crop = p && (fruit ? FRUIT[p.tree] : CROP[p.crop]), plotKey = `${rec.e.gx},${rec.e.gz}`;
      return {
        key: plotKey, plotKey, plotId: rec.e.id, gx: rec.e.gx, gz: rec.e.gz,
        plantId: p ? p.tree || p.crop : null, plantedAt: p?.t0 ?? null, fruit,
        name: crop?.name || (fruit ? '空果树田' : '空田地'), action: interaction.action || null,
        label: interaction.label, detail: interaction.sub || '', remain: p ? fruit ? treeInfo(p).remain : plotRemain(p) : 0,
        position: { x: rec.obj.position.x, y: rec.obj.position.y, z: rec.obj.position.z },
      };
    });
  }
  function exactField(target) {
    if (!target || !['plot', 'bigplot'].includes(target.plotId) || typeof target.plotKey !== 'string') return null;
    return fieldTargets().find(field => field.plotKey === target.plotKey && field.plotId === target.plotId &&
      field.plantId === target.plantId && field.plantedAt === target.plantedAt) || null;
  }
  async function openFurnitureCatalog(zone, { category = 'all', search = '' } = {}) {
    const source = S;
    if (closed || game.busy) return false;
    if (town.decor.active && town.zone !== zone) { ui.toast('先完成当前区域的装修，再去准备新的摆件吧'); return false; }
    if (town.zone !== zone) {
      if (town.zone === 'build' && !(await goHome())) return false;
      if (S !== source || closed) return false;
      if (town.zone !== zone) await game.travel(zone);
    }
    if (S !== source || closed || town.zone !== zone) return false;
    await game.openDecor();
    if (S !== source || closed || town.zone !== zone || !town.decor.active) return false;
    // 只打开可见的家具目录，不选择或落下任何摆件；旧搜索与仅看仓库不能遮住目标。
    ui.decorCategory = category;
    ui.decorOwnedOnly = false;
    ui.decorSearch = search;
    if (ui.decorSearchInput) ui.decorSearchInput.value = search;
    if (ui.setDecorTab) ui.setDecorTab('furn'); else ui.decorTab = 'furn';
    ui.refreshDecor();
    if (ui.decorList) ui.decorList.scrollLeft = 0;
    return true;
  }
  const api = {
    getSurfaces: () => allSurfaces().map(({ id, zone, name, anchors, canHost }) => ({ id, zone, name, canHost, anchors: anchors.map(({ id, label }) => ({ id, label })) })),
    resolveSurface: findSurface,
    contextFor: rec => { const s = allSurfaces().find(s => s.rec === rec); return s ? { surface: s.id, zone: s.zone } : {}; },
    visitRanch: goHome,
    getAnimalSpaceStatus(id){
      const key=getAnimalHousing(S).assignments[id],rec=lastState===S?animals.get(id):null;
      if(!key)return {status:'unhoused',housingKey:'',canWalk:false,routeState:'blocked',message:'等待安置 · 先摆放适合它的住处'};
      if(!rec||rec.home.noSpace||!freePoint(rec.model.position.x,rec.model.position.z))return {status:'blocked',housingKey:key,canWalk:false,routeState:'blocked',message:'住处附近没有安全空地，请移开一些家具或围栏'};
      const a=ensureHomestead(S).animals.find(a=>a.id===id),routeState=animalWalk?.animalId===id?'walking':a?.grazing&&!rec.returnToHome&&town.night<=.7?'roaming':rec.routeState||'home';
      const message=({walking:'正在陪你一起散步',roaming:'正在家园自由活动',searching:'正在找回窝的小路',returning:'正沿小路回窝',blocked:'暂时没找到回窝的小路，请留出更宽的通道。',home:rec.home.waiting?'住处旁较拥挤，暂在家园空地等候':'已在家园安置'})[routeState];
      return {status:routeState==='blocked'?'blocked':'ready',housingKey:key,canWalk:true,routeState,message};
    },
    async visitAnimal(id){const source=S;if(!(await goHome())||source!==S)return false;if(dirty)sync();const rec=animals.get(id);if(!rec)return false;const ok=approach(rec.model.position);if(!ok||rec.home.noSpace)ui.toast(api.getAnimalSpaceStatus(id).message);return ok;},
    async startAnimalWalk(id) {
      if(closed||walkStarting)return false;
      if(animalWalk){ui.toast('先结束这次散步，再邀请另一位伙伴吧');return false;}
      const source=S;
      if(game.busy||isEditing()||photo.on||town.photoOn){ui.toast('先结束当前操作，再邀请伙伴散步吧');return false;}
      if(!ensureHomestead(S).animals.some(a=>a.id===id)||!getAnimalHousing(S).assignments[id]){ui.toast('先为伙伴摆好住处，再邀请它一起散步吧');return false;}
      walkStarting=true;
      try{
        if(!(await goHome())||closed||S!==source||town.zone!=='home'||game.busy||isEditing()||photo.on||town.photoOn)return false;
        if(dirty)sync();
        const a=ensureHomestead(S).animals.find(a=>a.id===id),rec=animals.get(id);
        if(!a||!rec||rec.home.noSpace){ui.toast('伙伴身旁有些拥挤，请先留出一小块空地');return false;}
        if(!approach(rec.model.position,'home',p=>canAnimalMove(rec.model.position,p.x,p.z))){ui.toast('伙伴身旁没有连通的空地，请先留出一条小路');return false;}
        const logic=createAnimalWalk({animalId:id,kind:a.kind,personality:a.personality,start:rec.model.position});
        if(!logic)return false;
          clearReturnRoute(rec);
          rec.returnToHome=false;
        rec.callRemaining=0;rec.photoPose=false;rec.returnBlocked=false;rec.blockedFor=0;
        animalWalk={id:++walkSerial,source,animalId:id,name:a.name,homeKey:rec.home.key,layout:layoutStamp(),logic,path:createAnimalWalkPath(rec.model.position,town.pos),stops:walkStops(a),visited:[],visible:false,paused:true,phase:'following',status:'一起慢慢走',detail:'已经来到伙伴身边，慢慢走，带它认识你布置的家园'};
        ui.toast(`${a.name}准备好啦，慢慢走，回头等一等它`);return true;
      }finally{walkStarting=false;}
    },
    getAnimalWalkState() {
      if(!animalWalk||animalWalk.source!==S||closed)return null;
      const walk=animalWalk,visible=sceneUsable(),savePending=pendingWalkEvents.some(p=>p.source===S);
      const moment=walk.moment?.state;
      return {id:walk.id,active:true,animalId:walk.animalId,name:walk.name,phase:walk.phase,status:walk.status,detail:savePending?'散步见闻暂未写入本机，释放空间后可以重试保存':moment?.label||walk.detail,visited:walk.visited.map(v=>({...v})),savePending,visible,paused:walk.paused||!visible,moment:moment?{species:moment.species,place:moment.place,near:moment.near,age:moment.age,duration:moment.duration,phase:moment.phase,label:moment.label}:null};
    },
    stopAnimalWalk: stopWalk,
    retryAnimalWalkSave(expectedId) {
      if(closed||!animalWalk||animalWalk.source!==S||expectedId!==undefined&&animalWalk.id!==expectedId)return false;
      return retryWalkEvents();
    },
    getIngredientTarget: ingredientTarget,
    getFieldTargets: fieldTargets,
    async visitFarm({fruit=false,cropId,target}={}){
      const source=S;
      if(target!==undefined){
        if(closed||game.busy||town.decor.active)return false;
        const expected={...target},initial=exactField(expected);
        if(!initial){ui.toast('这块田的植物或位置已经变了，请回到青禾手记重新观察');return false;}
        if(cropId!==undefined){
          const crop=Object.hasOwn(FRUIT,cropId)?FRUIT[cropId]:CROPS.find(item=>item.id===cropId);
          if(!crop||initial.fruit!==Object.hasOwn(FRUIT,cropId)||initial.plantId&&initial.plantId!==cropId){ui.toast('这块田不适合所选的种子，请重新观察');return false;}
        }
        if(!(await goHome())||source!==S||closed||town.zone!=='home'||town.decor.active)return false;
        const actual=exactField(expected);
        if(!actual){ui.toast('这块田的植物或位置已经变了，请回到青禾手记重新观察');return false;}
        if(!approach(actual.position)){ui.toast('田边暂时没有安全落脚处，请为这块田留出通道');return false;}
        if(actual.plantId===null&&cropId!==undefined){
          if(actual.fruit)town.farm.pickSapling(FRUITS.findIndex(item=>item.id===cropId));
          else town.farm.pickSeed(CROPS.findIndex(item=>item.id===cropId));
        }
        ui.toast(`${actual.label}${actual.detail?' · '+actual.detail:''}`);
        return true;
      }
      if(cropId!==undefined&&ingredientTarget(cropId).status==='invalid'){ui.toast('暂时没有找到对应的作物或水果');return false;}
      if(!(await goHome())||source!==S||closed)return false;
      if(cropId!==undefined){
        const target=ingredientTarget(cropId);
        if(!target.position){ui.toast(target.detail);return false;}
        if(!approach(target.position)){ui.toast('田边暂时没有安全落脚处，请为这块田留出通道');return false;}
        if(target.status==='empty'){
          if(target.fruit)town.farm.pickSapling(FRUITS.findIndex(item=>item.id===cropId));
          else town.farm.pickSeed(CROPS.findIndex(item=>item.id===cropId));
          ui.toast(`已选好${CROP[cropId].name}${target.fruit?'树苗':'种子'}，由你决定是否种下`);
        }else ui.toast(`${target.label}${target.detail?' · '+target.detail:''}`);
        return true;
      }
      const rec=town.decors.home.entries.find(v=>v.e.id===(fruit?'bigplot':'plot'));
      if(!rec){ui.toast(fruit?'家园还没有果树田，在装修中摆放果树田后，就能种水果啦':'家园还没有田地，在装修中摆放田地后，就能种料理材料啦');return true;}
      return approach(rec.obj.position);
    },
    leaveRanch: () => game.travel('town'),
    async buildFurniture(furnitureId, zone) {
      const def = typeof furnitureId === 'string' && Object.hasOwn(DECO, furnitureId) ? DECO[furnitureId] : null;
      if (!def || isYardStructure(furnitureId)) { ui.toast('暂时没有找到适合家园的这件摆件'); return false; }
      const target = zone ?? (def.indoor === true ? 'house' : 'home');
      if (!['home', 'house'].includes(target) || def.indoor !== 'both' && (def.indoor === true) !== (target === 'house')) { ui.toast('这件摆件不适合放在所选区域'); return false; }
      if (def.only && !(S.decor[furnitureId] > 0)) { ui.toast('这件纪念摆件还没有收入仓库，先完成对应的活动吧'); return false; }
      return openFurnitureCatalog(target, { search: def.name });
    },
    buildRanch: () => openFurnitureCatalog('home', { category: 'ranch' }),
    async visitTea(){
      const source=S,meal=ensureHomestead(S).tea,initial=meal&&findSurface(meal.surface);if(!initial)return;
      if(town.zone!==initial.zone){
        if(town.zone==='build'&&!(await goHome()))return;
        if(S!==source||closed)return;
        if(town.zone!==initial.zone){if(initial.zone==='home')await goHome();else await game.travel(initial.zone);}
      }
      const current=ensureHomestead(S).tea,table=current&&findSurface(current.surface);
      if(S!==source||closed||current?.id!==meal.id||!table||town.zone!==table.zone)return;
      const points=tableStandingPoints(table,5),p=points.find(v=>guests.every(g=>!g.seat||g.seat.distanceTo(v.seat)>.8))?.seat;
      if(p){town.pos.copy(p);town.player.root.position.copy(p);town.moveTo=null;town.camSnap=true;town.face?.(table.object.position.x,table.object.position.z);}else ui.toast('桌边有些拥挤，请在旁边留一点空地');
    },
    async callAnimal(id) {
      if(animalWalk){ui.toast('正在一起散步，先结束散步再呼唤伙伴吧');return false;}
      const source = S;
      const a = ensureHomestead(S).animals.find(a => a.id === id);
      if (!a || a.love < 20) { ui.toast(a ? '亲密达到20后，它就会回应你的呼唤啦' : '这只动物暂时不在牧场'); return false; }
      if (!getAnimalHousing(S).assignments[id]) { ui.toast('先在家园摆出适合它的住处吧'); return false; }
      if (!(await goHome())) return false;
      if (closed || town.zone !== 'home' || S !== source) return false;
      if(animalWalk){ui.toast('正在一起散步，先结束散步再呼唤伙伴吧');return false;}
      if (dirty) sync();
      const rec = animals.get(id); if (!rec) return false;
      if(rec.home.noSpace){ui.toast(api.getAnimalSpaceStatus(id).message);return false;}
      if(!approach(rec.model.position,'home',p=>canAnimalMove(rec.model.position,p.x,p.z))){ui.toast('伙伴身边有些拥挤，请先留出一条小路');return false;}
      rec.callRemaining = 6.5; rec.photoPose = false;
      town.face?.(rec.model.position.x, rec.model.position.z); ui.toast(`${a.name}听到了，正朝你望过来`); return true;
    },
    async photoAnimal(id) {
      if(animalWalk){ui.toast('先结束散步，再邀请伙伴一起合影吧');return false;}
      const source = S;
      const a = ensureHomestead(S).animals.find(a => a.id === id);
      if (!a || a.love < 80) { ui.toast(a ? '亲密达到80后，可以邀请它一起合影' : '这只动物暂时不在牧场'); return false; }
      if (!S.live?.photo?.camera) { ui.toast('先到莱拉的相机摊购买小镇相机，再来和动物合影吧'); return false; }
      if (photo.on || game.busy || town.decor.active) { ui.toast('先结束当前拍照或操作，再邀请动物合影'); return false; }
      if (!getAnimalHousing(S).assignments[id]) { ui.toast('先在家园摆出适合它的住处吧'); return false; }
      if (!(await goHome())) return false;
      if (closed || town.zone !== 'home' || S !== source) return false;
      if (dirty) sync();
      const rec = animals.get(id); if (!rec) return false;
      if(rec.home.noSpace){ui.toast(api.getAnimalSpaceStatus(id).message);return false;}
      if(!approach(rec.model.position)){ui.toast('动物身边有些拥挤，请先留出合影的空地');return false;}
      rec.callRemaining = 15; rec.photoPose = true;
      if (town.player?.root) town.player.root.rotation.y = 0; town.faceTarget = 0; town.moveTo = null; town.camSnap = true;
      photo.enter(game);
      if (!photo.on) { rec.photoPose = false; ui.toast('相机暂时没有打开，请结束当前操作后再试'); return false; }
      ui.toast(`和${a.name}站好啦，使用相机按钮记录这份亲密`); return true;
    },
    sync: () => { dirty = true; }, act,
    get animals() { return animals; }, get dishes() { return dishes; },
    dispose() {
      animalWalk=null;pendingWalkEvents.length=0;
      closed = true; off.forEach(fn => fn()); game.homesteadUI?.dispose();
      invalidateReturnRoutes();
      if (town.allInter === wrappedAllInter) town.allInter = baseAllInter;
      town.ticks = town.ticks.filter(fn => fn !== tick);
      for (const m of dishes.values()) disposeHomesteadModel(m); for (const r of animals.values()) disposeAnimal(r);
      clearGuests(); delete game.homesteadWorld;
    },
  };
  game.homesteadWorld = api; game.homesteadUI = installHomesteadUI(game, ui);
  town.allInter = wrappedAllInter; town.ticks.push(tick);
  for (const event of ['homesteadChanged', 'decorChanged', 'decorHistoryChanged', 'decorMode', 'stateReplaced', 'reset', 'houseResized', 'zoneChanged']) off.push(bus.on(event, result => {
    bindCurrentState();
    dirty = true;
    if(['decorChanged','decorHistoryChanged','houseResized'].includes(event))returnNavDirty=true;
    if(animalWalk&&['decorChanged','decorHistoryChanged','houseResized'].includes(event)&&layoutStamp()!==animalWalk.layout)stopWalk(animalWalk.id);
    if(event==='zoneChanged'&&town.zone==='home')returnNavDirty=true;
    if(event==='homesteadChanged'&&(result?.action||result?.type)==='graze'){const rec=animals.get(result.animalId);if(rec){clearReturnRoute(rec);rec.returnToHome=false;rec.routeState=null;}}
    if (event === 'homesteadChanged' && (result?.action || result?.type) === 'graze' && result.animalId === animalWalk?.animalId) stopWalk(animalWalk.id,false);
    if (!isEditing() && (event === 'decorChanged' || event === 'decorMode' && result === false)) {
      advanceHomestead(S, Date.now());
      save();
    }
    if (event === 'homesteadChanged' && ['feed', 'pet'].includes(result?.action || result?.type)) {
      const action=result.action||result.type;
      // 只接调用方写盘成功后发布的事件；新档在首帧之前操作也绑定新实例。
      syncAnimals();
      for (const [id, rec] of animals) if (action==='feed'?result.fedIds?.includes(id):result.animalId === id) {
        if(animalWalk?.animalId===id)animalWalk.moment=null;
        queueAnimalResponse(rec.response,action);
      }
    }
    if(event==='homesteadChanged'&&['eat','eatPlaced'].includes(result?.action||result?.type)&&!isEditing()&&!photo.on&&!town.photoOn&&town.camMode==='play'&&!S.homestead.tea)town.act?.('carry',1.2);
  }));
  ensureHomestead(S); advanceHomestead(S); sync(); return api;
}
