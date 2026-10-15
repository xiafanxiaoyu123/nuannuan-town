// 最高级小屋的格线隔断。墙和门洞有真实碰撞，方案和撤销使用同一份数据。
import { THREE, group, mat, disposeSceneResources } from '../core/kit.js';
import { S, bus, save } from '../core/state.js';
import { housePlan } from './house-plan.js';
import { DECO } from '../data.js';
import { partitionSurfaceData, straightWallRun, wallStroke, movedWallRun, snappedWallCandidate, wallJunctions } from './partition-geometry.js';

const overlap = (a,b) => a.x0 < b.x1 - .001 && a.x1 > b.x0 + .001 && a.z0 < b.z1 - .001 && a.z1 > b.z0 + .001;
const hit = (r,x,z,pad=0) => {
  const dx=x-Math.max(r.x0,Math.min(r.x1,x)), dz=z-Math.max(r.z0,Math.min(r.z1,z));
  return dx*dx+dz*dz < pad*pad || (x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1);
};
export const partitionLength = w => w.kind === 'door' ? 2 : 1;
export function partitionRects(w, plan=housePlan(S.house)) {
  const x=plan.x0+w.gx,z=plan.z0+w.gz,len=partitionLength(w),parts=w.kind==='door'?[[0,.22],[len-.22,len]]:[[0,len]];
  return parts.map(([a,b])=>w.axis==='x'?{x0:x+a,x1:x+b,z0:z-.25,z1:z+.25,tag:'partition'}:{x0:x-.25,x1:x+.25,z0:z+a,z1:z+b,tag:'partition'});
}
export function partitionJunctionRects(walls,plan=housePlan(S.house)){
  return wallJunctions(walls).map(p=>({x0:plan.x0+p.x-.25,x1:plan.x0+p.x+.25,z0:plan.z0+p.z-.25,z1:plan.z0+p.z+.25,tag:'partition'}));
}
export function partitionModel(w) {
  const g=group();
  for(const mesh of partitionBatches([{...w,gx:0,gz:0}],{x0:0,z0:0,cols:34,rows:23}))g.add(mesh);
  g.userData.partition={...w};return g;
}

// 每次提交才构建并集，最多三种材质的三次绘制。独占几何在下一次重建时释放。
export function partitionBatches(walls, plan=housePlan(S.house), options={}) {
  const data=partitionSurfaceData(walls,plan,options),colors=['#fbe9dc','#f7c3d2','#ffffff'];
  return data.positions.flatMap((positions,i)=>{
    if(!positions.length)return [];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals[i],3));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,mat(colors[i]));mesh.name='partition-surface';mesh.position.set(plan.x0,0,plan.z0);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.partitionSurface={color:i,quads:positions.length/18};return [mesh];
  });
}

export class PartitionSystem {
  constructor(town){
    this.town=town;this.rects=[];this.axis='x';
    this.root=group();this.root.name='house-partitions';town.scene.add(this.root);
    this.preview=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#8ac99c',transparent:true,opacity:.38,depthWrite:false}),723);
    this.preview.frustumCulled=false;this.preview.count=0;
    this.preview.name='partition-preview';this.preview.visible=false;this.preview.renderOrder=10;town.scene.add(this.preview);
    this.selection=new THREE.InstancedMesh(this.preview.geometry,new THREE.MeshBasicMaterial({color:'#ffc94d',transparent:true,opacity:.24,depthWrite:false}),723);
    this.selection.name='partition-selection';this.selection.frustumCulled=false;this.selection.count=0;this.selection.visible=false;this.selection.renderOrder=9;town.scene.add(this.selection);
    this.dummy=new THREE.Object3D();this.drag=null;this.moveTurns=0;
    this.rebuild();
  }
  get enabled(){return housePlan(S.house).canPartition;}
  blocks(x,z,r=.36){return this.rects.some(b=>hit(b,x,z,r));}
  lineBlocked(ax,az,bx,bz,padding=.02){const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/.08));for(let i=0;i<=n;i++)if(this.blocks(ax+(bx-ax)*i/n,az+(bz-az)*i/n,padding))return true;return false;}
  furnitureRect(e){const [a,b]=DECO[e.id].size,[w,d]=e.rot%2?[b,a]:[a,b],p=housePlan(S.house);return{x0:p.x0+e.gx+.12,x1:p.x0+e.gx+w-.12,z0:p.z0+e.gz+.12,z1:p.z0+e.gz+d-.12};}
  furnitureCollisions(e,walls=S.wallsIn||[]){
    if(this.town.decors?.house?.houseCollisionRects)return this.town.decors.house.houseCollisionRects(e,walls);
    if(e.id==='picnic'||DECO[e.id].flat)return [];
    const r=this.furnitureRect(e);
    if(e.id!=='arch'&&e.id!=='swing')return [r];
    const x=(r.x0+r.x1)/2,z=(r.z0+r.z1)/2;
    return [-1,1].map(s=>e.rot%2===0?{x0:x+s*.85-.2,x1:x+s*.85+.2,z0:z-.3,z1:z+.3}:{x0:x-.3,x1:x+.3,z0:z+s*.85-.2,z1:z+s*.85+.2});
  }
  // 家具能不能摆在这里：墙本身占着格线两侧各 0.25，家具外框只比格子缩进 0.12，按整面墙厚去比的话贴墙的那一格永远放不下。
  // 这里只拦「家具真的骑在格线上」的情况（墙芯 ±0.11），贴着墙面摆是允许的；门洞前后仍然要留出通道。
  fitsFurniture(e,walls=S.wallsIn||[]){const r=this.furnitureRect(e),p=housePlan(S.house),core=b=>b.x1-b.x0<b.z1-b.z0?{...b,x0:b.x0+.14,x1:b.x1-.14}:{...b,z0:b.z0+.14,z1:b.z1-.14};
    return !partitionJunctionRects(walls,p).some(b=>overlap(r,{x0:b.x0+.14,x1:b.x1-.14,z0:b.z0+.14,z1:b.z1-.14}))&&!walls.some(w=>{
    if(partitionRects(w).some(b=>overlap(r,w.kind==='door'?{...b,...(w.axis==='x'?{z0:b.z0+.14,z1:b.z1-.14}:{x0:b.x0+.14,x1:b.x1-.14})}:core(b))))return true;
    if(w.kind!=='door')return false;
    const x=p.x0+w.gx,z=p.z0+w.gz;return overlap(r,w.axis==='x'?{x0:x,x1:x+2,z0:z-.4,z1:z+.4}:{x0:x-.4,x1:x+.4,z0:z,z1:z+2});
  });}
  validate(walls,{placed=S.placedIn||[],quick=false}={}){
    const p=housePlan(S.house),fail=error=>({ok:false,error});
    if(!Array.isArray(walls)||walls.length>p.maxWalls)return fail(p.canPartition?'最多搭建 240 段墙或门洞':'升级到云朵城堡后解锁隔断');
    const edges=new Set(),rects=[],openings=[];
    for(const w of walls){
      if(!w||!['x','z'].includes(w.axis)||!['wall','door'].includes(w.kind)||!Number.isInteger(w.gx)||!Number.isInteger(w.gz))return fail('隔断数据无效');
      const len=partitionLength(w);
      if(w.axis==='x'?(w.gx<0||w.gx+len>p.cols||w.gz<1||w.gz>=p.rows):(w.gz<0||w.gz+len>p.rows||w.gx<1||w.gx>=p.cols))return fail('请沿屋内格线建墙');
      for(let n=0;n<len;n++){const k=w.axis+':'+(w.gx+(w.axis==='x'?n:0))+','+(w.gz+(w.axis==='z'?n:0));if(edges.has(k))return fail('这里已经有墙或门洞');edges.add(k);}
      rects.push(...partitionRects(w,p));
      if(w.kind==='door'){const x=p.x0+w.gx,z=p.z0+w.gz;openings.push(w.axis==='x'?{x0:x+.26,x1:x+1.74,z0:z-.3,z1:z+.3}:{x0:x-.3,x1:x+.3,z0:z+.26,z1:z+1.74});}
    }
    rects.push(...partitionJunctionRects(walls,p));
    if(openings.some(o=>rects.some(r=>overlap(o,r))))return fail('请保持门洞畅通，不能在洞内交叉建墙');
    const fixed=this.town.roomRects||[];
    if(rects.some(r=>fixed.some(b=>overlap(r,b))))return fail('这段墙与房间固定设施重叠，请换个位置');
    // 与摆家具使用同一套墙芯/门洞规则，不能用整套墙的装饰厚度重判家具。
    // 否则一件合法贴墙家具就会让远处建墙、移动、拆墙乃至保存方案全部失败。
    const furnitureConflict=placed.find(e=>!this.fitsFurniture(e,walls));
    if(furnitureConflict)return fail(`墙或门洞与「${DECO[furnitureConflict.id].name}」重叠，请调整位置`);
    if(this.town.zone==='house'&&rects.some(r=>hit(r,this.town.pos.x,this.town.pos.z,.36)))return fail('暖暖正站在这里，请先走开再建墙');
    const doors=[{x:500,z:p.z0+1},{x:500,z:p.z0+p.rows-1}];
    if(doors.some(v=>rects.some(r=>hit(r,v.x,v.z,.8))))return fail('请给前门和后门留出通道');
    const arrivals=[{x:500,z:p.z0+2.2},{x:500,z:p.z0+p.rows-1.8}];
    if(arrivals.some(v=>rects.some(r=>hit(r,v.x,v.z,.36))))return fail('这里是进屋的落脚处，请给门口留出空间');
    if(!quick&&walls.length){
      const graph=this.reachable(rects,doors[0]);
      if(graph.seenCount!==graph.freeCount)return fail('这个隔间会被封死，请先放门洞或留一条通道');
      const full=this.reachable([...rects,...fixed,...placed.flatMap(e=>this.furnitureCollisions(e,walls))],doors[0]);
      const targets=[doors[1],...arrivals,{x:p.x0+2.4,z:p.z0+2.5},{x:p.x0+p.cols-2.3,z:p.z0+2.5}];
      for(const w of walls)if(w.kind==='door'){const x=p.x0+w.gx,z=p.z0+w.gz;for(const side of[-1,1])targets.push(w.axis==='x'?{x:x+1,z:z+side*.8}:{x:x+side*.8,z:z+1});}
      if(this.town.zone==='house')targets.push(this.town.pos);
      if(targets.some(v=>!full.near(v.x,v.z)))return fail('隔断会挡住出入口、衣橱或角色，请调整位置');
    }
    return {ok:true,wallCount:walls.length};
  }
  reachable(rects,start){
    const p=housePlan(S.house),nx=p.cols*2,nz=p.rows*2,grid=new Uint8Array(nx*nz),seen=new Uint8Array(nx*nz),step=.5;
    let freeCount=0;
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const wx=p.x0+.25+x*step,wz=p.z0+.25+z*step;if(!rects.some(r=>hit(r,wx,wz,.36))){grid[z*nx+x]=1;freeCount++;}}
    const clear=(ax,az,bx,bz)=>{const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/.1));for(let i=0;i<=n;i++)if(rects.some(r=>hit(r,ax+(bx-ax)*i/n,az+(bz-az)*i/n,.36)))return false;return true;};
    const nearest=(wx,wz,onlySeen=false)=>{let best=-1,dist=Infinity;const cx=Math.floor((wx-p.x0)*2),cz=Math.floor((wz-p.z0)*2);for(let z=Math.max(0,cz-2);z<=Math.min(nz-1,cz+2);z++)for(let x=Math.max(0,cx-2);x<=Math.min(nx-1,cx+2);x++){const i=z*nx+x,px=p.x0+.25+x*step,pz=p.z0+.25+z*step,d=Math.hypot(px-wx,pz-wz);if((onlySeen?seen[i]:grid[i])&&d<dist&&d<.85&&clear(wx,wz,px,pz)){dist=d;best=i;}}return best;};
    const first=nearest(start.x,start.z),queue=[];if(first>=0){queue.push(first);seen[first]=1;}
    for(let i=0;i<queue.length;i++){const n=queue[i],x=n%nx,z=Math.floor(n/nx);for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz,k=zz*nx+xx;if(xx>=0&&xx<nx&&zz>=0&&zz<nz&&grid[k]&&!seen[k]){seen[k]=1;queue.push(k);}}}
    return {freeCount,seenCount:queue.length,near:(x,z)=>nearest(x,z,true)>=0};
  }
  rebuild(){
    this.cancel(null,false);
    for(const r of this.rects){const i=this.town.rects.indexOf(r);if(i>=0)this.town.rects.splice(i,1);}this.rects=[];
    const p=housePlan(S.house),walls=p.canPartition?(S.wallsIn||[]):[];this.display(walls);
    for(const w of walls)for(const r of partitionRects(w,p))this.rects.push(this.town.addRect(r.x0,r.x1,r.z0,r.z1,'partition'));
    for(const r of partitionJunctionRects(walls,p))this.rects.push(this.town.addRect(r.x0,r.x1,r.z0,r.z1,'partition'));
    this.town.decors?.house?.refreshFurnitureFits();
  }
  display(walls){
    for(const child of [...this.root.children]){this.root.remove(child);disposeSceneResources(child);}
    if(this.town.roomWallShell)this.town.roomWallShell.visible=!walls.length;
    if(walls.length)for(const mesh of partitionBatches(walls,housePlan(S.house),{shell:!!this.town.roomWallShell}))this.root.add(mesh);
    this.town.renderOptimizer?.invalidateBounds();
  }
  candidate(cursor,kind){return snappedWallCandidate(cursor,kind,this.axis,S.wallsIn||[]);}
  nearest(cursor){if(!cursor)return -1;let index=-1,best=.7;for(const [i,w]of(S.wallsIn||[]).entries()){const len=partitionLength(w),dx=cursor.fx-w.gx,dz=cursor.fz-w.gz,d=w.axis==='x'?Math.hypot(dx-Math.max(0,Math.min(len,dx)),dz):Math.hypot(dx,dz-Math.max(0,Math.min(len,dz)));if(d<best){best=d;index=i;}}return index;}
  status(decor,text=''){if(decor&&decor.wallStatus!==text){decor.wallStatus=text;bus.emit('partitionPreview',{text,dragging:!!this.drag});}}
  showPreview(mesh,walls,color,connectorWalls=walls){
    const p=housePlan(S.house),d=this.dummy;let n=0;
    const part=(w,a,b,y,h)=>{if(n>=mesh.instanceMatrix.count)return;const along=(a+b)/2;d.position.set(p.x0+w.gx+(w.axis==='x'?along:0),y+h/2,p.z0+w.gz+(w.axis==='z'?along:0));d.rotation.set(0,w.axis==='x'?0:-Math.PI/2,0);d.scale.set(b-a,h,.62);d.updateMatrix();mesh.setMatrixAt(n++,d.matrix);};
    for(const w of walls){if(w.kind==='door'){part(w,0,.22,-.02,5.04);part(w,1.78,2,-.02,5.04);part(w,.22,1.78,3.13,1.89);}else part(w,0,1,-.02,5.04);}
    // 拖动预览也画出转角补块；接上已有横竖墙时，松手前不会先看到缺口。
    for(const j of wallJunctions(connectorWalls)){
      if(n>=mesh.instanceMatrix.count)break;
      d.position.set(p.x0+j.x,2.5,p.z0+j.z);d.rotation.set(0,0,0);d.scale.set(.5,5.04,.5);d.updateMatrix();mesh.setMatrixAt(n++,d.matrix);
    }
    mesh.count=n;mesh.instanceMatrix.needsUpdate=true;mesh.material.color.set(color);mesh.visible=n>0;
  }
  begin(decor){
    if(!this.enabled||!decor.active||this.town.zone!=='house'||!decor.cursor||!['wall','door','move'].includes(decor.wallSel))return false;
    this.cancel(decor);
    const walls=(S.wallsIn||[]).map(w=>({...w})),mode=decor.wallSel,indices=mode==='move'?straightWallRun(walls,this.nearest(decor.cursor)):[];
    if(mode==='move'&&!indices.length){this.status(decor,'请按住一段直墙或门洞再拖动');return false;}
    this.drag={decor,mode,start:{...decor.cursor},height:mode==='move'?(decor.cursor.height||0):0,walls,before:decor.snapshot(),indices,turns:mode==='move'?this.moveTurns:0,axis:this.axis};
    if(mode==='move'){
      const selected=new Set(indices);this.display(walls.filter((_,i)=>!selected.has(i)));
      this.showPreview(this.selection,indices.map(i=>walls[i]),'#ffc94d');
    }
    this.updateDrag(decor);return true;
  }
  updateDrag(decor){
    const drag=this.drag;if(!drag||drag.decor!==decor||!decor.cursor)return;
    let added;
    if(drag.mode==='wall')added=wallStroke(drag.start,decor.cursor,drag.axis,drag.forcedAxis,drag.walls);
    else if(drag.mode==='door')added=[this.candidate(decor.cursor,'door')];
    else {const selected=new Set(drag.indices);added=movedWallRun(drag.walls,drag.indices,drag.start,decor.cursor,drag.turns,drag.walls.filter((_,i)=>!selected.has(i)));}
    const signature=JSON.stringify(added);if(signature===drag.signature)return;
    drag.signature=signature;drag.added=added;
    const selected=new Set(drag.indices);drag.next=[...drag.walls.filter((_,i)=>!selected.has(i)),...added];
    drag.result=this.validate(drag.next,{quick:true});
    this.showPreview(this.preview,added,drag.result.ok?'#85d69c':'#ff8099',drag.next);
    const length=added.reduce((n,w)=>n+partitionLength(w),0),label=drag.mode==='move'?'移动':drag.mode==='door'?'门洞':'直墙';
    this.status(decor,`${label} ${length} 格 · ${drag.result.ok?'松手确认，Esc 取消':drag.result.error}`);
  }
  rotate(decor){
    if(this.drag?.decor===decor){
      const drag=this.drag;if(drag.mode==='move')drag.turns++;
      else if(drag.mode==='wall'){const axis=drag.added?.[0]?.axis||drag.axis;drag.forcedAxis=axis==='x'?'z':'x';}
      else this.axis=this.axis==='x'?'z':'x';
      drag.signature=null;this.updateDrag(decor);return;
    }
    if(decor.wallSel==='move'){this.moveTurns=this.moveTurns?0:1;this.status(decor,this.moveTurns?'移动时旋转 90° · 按住墙段拖动':'保持原方向 · 按住墙段拖动');}
    else {this.axis=this.axis==='x'?'z':'x';this.updatePreview(decor);}
  }
  cancel(decor=null,restore=true){
    const drag=this.drag;if(decor&&drag&&drag.decor!==decor)return false;
    this.drag=null;this.preview.visible=false;this.selection.visible=false;
    if(drag?.mode==='move'&&restore)this.display(S.wallsIn||[]);
    this.status(decor||drag?.decor,'');return !!drag;
  }
  commit(decor,next,before,label){
    const result=this.validate(next);if(!result.ok){this.cancel(decor);this.status(decor,result.error);bus.emit('toast',result.error);return false;}
    this.cancel(decor,false);S.wallsIn=next;this.rebuild();decor.recordEdit(before,label);save();bus.emit('decorChanged');bus.emit('partitionChanged');
    if(!decor.continuous)decor.selectFloor(null);else this.updatePreview(decor);return true;
  }
  end(decor){
    const drag=this.drag;if(!drag||drag.decor!==decor)return false;
    if(!decor.cursor){this.cancel(decor);return false;}
    this.updateDrag(decor);
    if(drag.mode==='move'&&JSON.stringify(drag.indices.map(i=>drag.walls[i]))===JSON.stringify(drag.added)){this.cancel(decor);return false;}
    return this.commit(decor,drag.next,drag.before,drag.mode==='move'?'移动隔断':drag.mode==='wall'?'搭建整段墙':'搭建门洞');
  }
  updatePreview(decor){
    if(this.drag){if(this.drag.decor===decor)this.updateDrag(decor);return;}
    const kind=decor.wallSel;this.preview.visible=false;this.selection.visible=false;if(!kind||!decor.active||this.town.zone!=='house'||!this.enabled)return;
    const walls=S.wallsIn||[],index=this.nearest(decor.cursor);
    if(kind==='move'||kind==='erase'){
      const indices=kind==='move'?straightWallRun(walls,index):index>=0?[index]:[];
      this.showPreview(this.preview,indices.map(i=>walls[i]),'#ffc94d');return;
    }
    const w=this.candidate(decor.cursor,kind);if(!w)return;
    const candidateWalls=[...walls,w];const valid=this.validate(candidateWalls,{quick:true}).ok;this.showPreview(this.preview,[w],valid?'#85d69c':'#ff8099',candidateWalls);
  }
  edit(decor){
    if(!this.enabled||!decor.active||this.town.zone!=='house')return false;
    const kind=decor.wallSel,before=decor.snapshot(),next=(S.wallsIn||[]).map(w=>({...w}));
    if(kind==='move')return false;
    if(kind==='erase'){const i=this.nearest(decor.cursor);if(i<0)return false;next.splice(i,1);}else{const w=this.candidate(decor.cursor,kind);if(!w)return false;next.push(w);}
    return this.commit(decor,next,before,kind==='erase'?'拆除隔断':'搭建隔断');
  }
}
