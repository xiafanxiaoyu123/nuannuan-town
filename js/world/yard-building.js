// Renderer-free building rules shared by placement, save validation and movement.
import { BUILD_LEVEL_HEIGHT, MAX_BUILD_LEVEL, MAX_BUILD_FLOOR } from './build-constants.js';
import { BUILD_SLOPED_ROOF_IDS } from './build-roof-profiles.js';
export const YARD_LEVEL_HEIGHT = BUILD_LEVEL_HEIGHT;
export const MAX_YARD_LEVEL = MAX_BUILD_LEVEL;
export const maxBuildBaseLevel = id => id === 'yard_foundation' ? 0 : isBuildRoof(id) ? MAX_YARD_LEVEL : id === 'yard_stairs' ? MAX_BUILD_FLOOR - 1 : MAX_BUILD_FLOOR;
export const MAX_BUILD_SPAN = 5;
export const BUILD_STEP_HEIGHT = 0.25;
export const BUILD_STAIRS_STEPS = 15;
const ROOFS = new Set(['yard_roof','yard_roof_flat',...BUILD_SLOPED_ROOF_IDS]);
const STRUCTURES = new Set(['yard_foundation','yard_column','yard_slab','yard_stairs','yard_wall','yard_door','yard_window','yard_railing',...ROOFS]);
const WALLS = new Set(['yard_wall','yard_door','yard_window']);
const EDGES = new Set([...WALLS,'yard_railing']);
export const isBuildStructure = id => STRUCTURES.has(id);
export const isYardStructure = isBuildStructure;
export const isBuildEdge = id => EDGES.has(id);
export const isBuildRoof = id => ROOFS.has(id);
export const yardLevel = e => Number.isInteger(e?.level) ? e.level : 0;
export const yardCellKey = (x,z,level=0) => `${x},${z},${level}`;
const cell = (x,z) => `${x},${z}`;
export function yardFootprint(e,defs) {
  const size=defs[e?.id]?.size;if(!size)return null;
  const [w,d]=(e.rot||0)%2?[size[1],size[0]]:size;
  return {x0:e.gx,x1:e.gx+w,z0:e.gz,z1:e.gz+d,w,d};
}
export function buildCells(e,defs) {
  const f=yardFootprint(e,defs),cells=[];if(!f)return cells;
  for(let x=f.x0;x<f.x1;x++)for(let z=f.z0;z<f.z1;z++)cells.push([x,z]);return cells;
}
export function buildEdges(e) {
  const {gx:x,gz:z}=e,l=yardLevel(e),r=e.rot||0;
  if(r===0)return [`h,${x},${z},${l}`,`h,${x+1},${z},${l}`];
  if(r===1)return [`v,${x},${z},${l}`,`v,${x},${z+1},${l}`];
  if(r===2)return [`h,${x},${z+1},${l}`,`h,${x+1},${z+1},${l}`];
  return [`v,${x+1},${z},${l}`,`v,${x+1},${z+1},${l}`];
}
function crossedEdge(x,z,dx,dz,l) {return dx?`v,${x+(dx>0?1:0)},${z},${l}`:`h,${x},${z+(dz>0?1:0)},${l}`;}
function addWallAnchors(anchors,e) {
  // A load-bearing edge supports floor cells on either side of that edge.
  for(const edge of buildEdges(e)){
    const [axis,xText,zText]=edge.split(','),x=Number(xText),z=Number(zText);
    anchors.add(cell(x,z));anchors.add(axis==='h'?cell(x,z-1):cell(x-1,z));
  }
}
function roomIndex(records,defs) {
  const covers=new Set(),tops=new Map(),walls=new Set();
  for(const e of records){
    const level=yardLevel(e);
    if(ROOFS.has(e.id)||e.id==='yard_slab')for(const [x,z]of buildCells(e,defs)){
      covers.add(yardCellKey(x,z,level));
      tops.set(cell(x,z),Math.max(tops.get(cell(x,z))||0,level));
    }
    if(WALLS.has(e.id))for(const k of buildEdges(e))walls.add(k);
  }
  return {covers,tops,walls,closed:new Map()};
}
function interiorFrom(index,e,defs) {
  const level=yardLevel(e),footprint=buildCells(e,defs);
  for(const [sx,sz]of footprint){
    const start=yardCellKey(sx,sz,level);
    if(!index.closed.has(start)){
      const queue=[[sx,sz,level]],seen=new Set([start]);let closed=true;
      const visit=(x,z,l)=>{
        const k=yardCellKey(x,z,l);if(seen.has(k))return;
        seen.add(k);queue.push([x,z,l]);
      };
      for(let i=0;i<queue.length;i++){
        const [x,z,l]=queue[i];
        // An uncovered column leads outside. This also bounds the flood fill.
        if((index.tops.get(cell(x,z))||0)<=l){closed=false;continue;}
        for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(!index.walls.has(crossedEdge(x,z,dx,dz,l)))visit(x+dx,z+dz,l);
        // Upper floors are ceilings below. Open stairwells can connect rooms
        // across storeys, provided the whole connected space remains enclosed.
        if(!index.covers.has(yardCellKey(x,z,l+1)))visit(x,z,l+1);
        if(l>0&&!index.covers.has(yardCellKey(x,z,l)))visit(x,z,l-1);
      }
      for(const k of seen)index.closed.set(k,closed);
    }
    if(!index.closed.get(start))return false;
  }
  return footprint.length>0;
}
export function isBuildInterior(records,defs,e) {return interiorFrom(roomIndex(records,defs),e,defs);}
export function buildInteriorChecker(records,defs) {
  const index=roomIndex(records,defs);
  return e=>interiorFrom(index,e,defs);
}
function spread(cells,seeds) {
  const distances=new Map(),queue=[];
  for(const k of seeds)if(cells.has(k)){distances.set(k,0);queue.push(k);}
  for(let i=0;i<queue.length;i++){
    const k=queue[i],d=distances.get(k);if(d>=MAX_BUILD_SPAN)continue;
    const [x,z]=k.split(',').map(Number);
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const n=cell(x+dx,z+dz);if(cells.has(n)&&!distances.has(n)){distances.set(n,d+1);queue.push(n);}}
  }
  return distances;
}
export function validateYardLayout(records,defs,options={}) {
  let maxDistance=0;const supportMap={},roofSupportMap={};
  const fail=error=>({ok:false,error,maxDistance,supportMap,roofSupportMap});
  if(!Array.isArray(records))return fail('建造布局无效');
  const maxLevel=options.legacyHeight?4:MAX_YARD_LEVEL;
  const volume=new Map(),under=new Map(),edges=new Set(),foundation=new Set();
  const floors=Array.from({length:maxLevel+1},()=>new Set()),roofs=Array.from({length:maxLevel+1},()=>new Set());
  const columns=new Set(),rootColumns=new Set(),rootWalls=new Set(),rootWallEdges=new Set();
  for(const e of records){
    const def=defs[e?.id],level=yardLevel(e),rot=e?.rot??0;
    if(!def||!Number.isInteger(e.gx)||!Number.isInteger(e.gz)||!Number.isInteger(rot)||rot<0||rot>3||(e.level!==undefined&&!Number.isInteger(e.level))||level<0||level>maxLevel)return fail('家具位置或楼层无效');
    if(options.zone&&options.zone!=='build'&&isBuildStructure(e.id))return fail('建筑只能在独立建造岛搭建');
    if(e.id==='yard_foundation'&&level!==0)return fail('地基只能放在地面');
    if(options.legacyHeight){if((['yard_column','yard_stairs'].includes(e.id)||WALLS.has(e.id))&&level>=maxLevel)return fail('旧建筑支撑层级无效');}
    else if(level>maxBuildBaseLevel(e.id))return fail(e.id==='yard_stairs'?'房屋最多3楼：阶梯只能从1楼通往2楼，或从2楼通往3楼':'房屋最多3楼，三楼上方只可放置封顶屋顶');
    if(ROOFS.has(e.id)&&level===0)return fail('屋顶需盖在房间上一层，先在下面搭建承重柱或墙');
    if(['plot','bigplot','pond'].includes(e.id))return fail('田地、果树田和池塘请放在原来的后院');
    const cells=buildCells(e,defs);
    if(!cells.length)return fail('建筑尺寸无效');
    for(const [x,z]of cells)if(options.inBounds&&!options.inBounds(x,z)||options.blocked?.has(cell(x,z)))return fail('物件超出建造岛范围或挡住入口');
    if(EDGES.has(e.id)){for(const k of buildEdges(e)){if(edges.has(k))return fail('同一条边不能重复搭墙、门窗或栏杆');edges.add(k);}}
    else for(const [x,z]of cells){
      const k=yardCellKey(x,z,level),c=cell(x,z);
      if(e.id==='yard_slab'){if(floors[level].has(c))return fail('同层楼板发生重叠');floors[level].add(c);}
      else if(ROOFS.has(e.id)){if(roofs[level].has(c))return fail('同层屋顶发生重叠');roofs[level].add(c);}
      else if(e.id==='yard_foundation'){if(foundation.has(c))return fail('地基发生重叠');foundation.add(c);}
      else {const layer=def.under?under:volume;if(layer.has(k))return fail('同层的家具、柱子或阶梯发生重叠');layer.set(k,e);if(e.id==='yard_column')columns.add(k);}
    }
  }
  for(const e of records){
    const def=defs[e.id];
    if(def.flat||def.under||EDGES.has(e.id)||ROOFS.has(e.id)||['yard_slab','yard_foundation'].includes(e.id))continue;
    const f=yardFootprint(e,defs),l=yardLevel(e);
    for(let x=f.x0+1;x<f.x1;x++)for(let z=f.z0;z<f.z1;z++)if(edges.has(`v,${x},${z},${l}`))return fail('墙、门窗或栏杆不能穿过家具和阶梯内部，请挪到物件外侧');
    for(let z=f.z0+1;z<f.z1;z++)for(let x=f.x0;x<f.x1;x++)if(edges.has(`h,${x},${z},${l}`))return fail('墙、门窗或栏杆不能穿过家具和阶梯内部，请挪到物件外侧');
  }
  // Only an unbroken vertical chain from ground creates a new load-bearing root.
  for(let l=0;l<maxLevel;l++)for(const k of columns){const [x,z,level]=k.split(',').map(Number);if(level===l&&(l===0||rootColumns.has(yardCellKey(x,z,l-1))))rootColumns.add(k);}
  for(let l=0;l<maxLevel;l++)for(const e of records)if(WALLS.has(e.id)&&yardLevel(e)===l){
    const wallEdges=buildEdges(e);
    if(l===0||wallEdges.every(k=>rootWallEdges.has(k.replace(/,\d+$/,`,${l-1}`)))){
      rootWalls.add(e);for(const k of wallEdges)rootWallEdges.add(k);
    }
  }
  const floorDistance=[];
  for(let l=0;l<=maxLevel;l++){
    const seeds=l===0?floors[0]:new Set([...rootColumns].filter(k=>Number(k.split(',')[2])===l-1).map(k=>k.split(',').slice(0,2).join(',')));
    if(l>0)for(const e of rootWalls)if(yardLevel(e)===l-1)addWallAnchors(seeds,e);
    const dist=spread(floors[l],seeds);floorDistance.push(dist);
    for(const k of floors[l]){const d=dist.get(k);if(d===undefined)return fail('楼板每一格都须沿相连楼板距离落地连续承重柱或墙不超过5格；断板、斜角、悬空柱墙不能续接支撑');maxDistance=Math.max(maxDistance,d);supportMap[`${k},${l}`]=d;}
  }
  // Edge pieces can be placed from either face of a floor perimeter. Their
  // storage footprint must not make an identical physical wall lose support.
  const supported=(e)=>yardLevel(e)===0||(EDGES.has(e.id)&&!options.legacyHeight
    ?buildEdges(e).every(k=>{const [axis,x0,z0]=k.split(','),x=Number(x0),z=Number(z0),dist=floorDistance[yardLevel(e)];return dist.has(cell(x,z))||dist.has(axis==='h'?cell(x,z-1):cell(x-1,z));})
    :buildCells(e,defs).every(([x,z])=>floorDistance[yardLevel(e)].has(cell(x,z))));
  for(const e of records){
    if(e.id==='yard_slab'||ROOFS.has(e.id)||e.id==='yard_foundation')continue;
    if(e.id==='yard_column'&&rootColumns.has(yardCellKey(e.gx,e.gz,yardLevel(e))))continue;
    if(rootWalls.has(e))continue;
    if(!supported(e))return fail('上层家具或阶梯需要完整有效楼板；柱墙需从地面竖直连续连接，或站在有效楼板上');
  }
  for(let l=1;l<=maxLevel;l++){
    const anchors=new Set();
    for(const k of rootColumns){const [x,z,base]=k.split(',').map(Number);if(base===l-1)anchors.add(cell(x,z));}
    for(const e of records)if(WALLS.has(e.id)&&yardLevel(e)===l-1&&(rootWalls.has(e)||supported(e)))addWallAnchors(anchors,e);
    const dist=spread(roofs[l],anchors);
    for(const k of roofs[l]){const d=dist.get(k);if(d===undefined)return fail('屋顶需要下层墙顶或落地连续柱支撑，相连屋顶最多延伸5格');roofSupportMap[`${k},${l}`]=d;}
  }
  if(!options.legacyHeight&&!options.allowBlockedStairs&&buildStairObstructions(records,defs).length)return fail('楼板或屋顶挡住了楼梯通道：请留出楼梯上方的开口，楼板接在最高一级的外沿');
  let rooms;
  for(const e of records){const def=defs[e.id];if(def.indoor!==true&&!def.indoorOnly)continue;rooms??=roomIndex(records,defs);if(!interiorFrom(rooms,e,defs))return fail('室内家具需要墙、门窗和楼板或屋顶围合；楼梯井可连通封闭的上层，拆开外墙或天花前请先收回受影响的室内家具');}
  return {ok:true,maxDistance,supportMap,roofSupportMap};
}
// Check the centre walking corridor, including player radius and headroom.
// A correctly adjacent landing is outside these swept stair tread rectangles.
export function buildStairObstructions(records,defs) {
  const blockers=records.filter(e=>e.id==='yard_slab'||ROOFS.has(e.id)),result=[];
  for(const stairs of records){
    if(stairs.id!=='yard_stairs')continue;
    const f=yardFootprint(stairs,defs),base=yardLevel(stairs)*YARD_LEVEL_HEIGHT,a=(stairs.rot||0)*Math.PI/2,c=Math.cos(a),s=Math.sin(a);
    for(const blocker of blockers){
      // A pitched roof on the stair's own storey also occupies its low treads.
      // Only these two levels can intersect this stair and the player's head.
      if(yardLevel(blocker)<yardLevel(stairs)||yardLevel(blocker)>yardLevel(stairs)+1)continue;
      const b=yardFootprint(blocker,defs),cap=yardLevel(blocker)*YARD_LEVEL_HEIGHT,walkable=blocker.id==='yard_slab'||blocker.id==='yard_roof_flat',bottom=cap-(blocker.id==='yard_slab'?.16:blocker.id==='yard_roof_flat'?.14:0),top=cap+(walkable?0:1.1);
      let blocked=false;
      for(let i=0;i<BUILD_STAIRS_STEPS&&!blocked;i++){
        const foot=base+(i+1)*YARD_LEVEL_HEIGHT/BUILD_STAIRS_STEPS;
        if(foot+1.65<=bottom+.03||foot>=top-(walkable?.25:.03))continue;
        const run=-1.5+(i+.5)*3/BUILD_STAIRS_STEPS,cx=f.x0+f.w/2+s*run,cz=f.z0+f.d/2+c*run;
        const rx=Math.abs(s)*(.1+.36)+Math.abs(c)*.36,rz=Math.abs(c)*(.1+.36)+Math.abs(s)*.36;
        blocked=cx+rx>b.x0+1e-6&&cx-rx<b.x1-1e-6&&cz+rz>b.z0+1e-6&&cz-rz<b.z1-1e-6;
      }
      if(blocked)result.push({stairs,blocker});
    }
  }
  return result;
}
export function yardSurfaceAt(records,defs,x,z,currentY=0) {
  let height=0,blocker=0;
  for(const e of records){
    if(!['yard_slab','yard_foundation','yard_stairs','yard_roof_flat'].includes(e.id))continue;
    const f=yardFootprint(e,defs);if(!f||x<f.x0-1e-7||x>=f.x1-1e-7||z<f.z0-1e-7||z>=f.z1-1e-7)continue;
    const base=yardLevel(e)*YARD_LEVEL_HEIGHT;
    let top=base;
    if(e.id==='yard_stairs'){
      const dx=x-f.x0-f.w/2,dz=z-f.z0-f.d/2,a=(e.rot||0)*Math.PI/2,localZ=dx*Math.sin(a)+dz*Math.cos(a);
      const step=Math.max(1,Math.min(BUILD_STAIRS_STEPS,Math.floor((localZ+1.5)/3*BUILD_STAIRS_STEPS+1e-7)+1));
      top+=step*YARD_LEVEL_HEIGHT/BUILD_STAIRS_STEPS;
      if(top>currentY+BUILD_STEP_HEIGHT&&base<currentY+1.65&&top>currentY)blocker=Math.max(blocker,top);
    }
    if(top<=currentY+BUILD_STEP_HEIGHT)height=Math.max(height,top);
  }
  return Math.max(height,blocker);
}
export function yardStepAllowed(from,to) {return Number.isFinite(from)&&Number.isFinite(to)&&Math.abs(to-from)<=BUILD_STEP_HEIGHT+1e-7;}
function stairTreadAt(e,defs,x,z) {
  const f=yardFootprint(e,defs);
  if(!f||x<f.x0||x>=f.x1||z<f.z0||z>=f.z1)return null;
  const a=(e.rot||0)*Math.PI/2,run=(x-f.x0-f.w/2)*Math.sin(a)+(z-f.z0-f.d/2)*Math.cos(a);
  const step=Math.max(1,Math.min(BUILD_STAIRS_STEPS,Math.floor((run+1.5)/3*BUILD_STAIRS_STEPS+1e-7)+1));
  return yardLevel(e)*YARD_LEVEL_HEIGHT+step*YARD_LEVEL_HEIGHT/BUILD_STAIRS_STEPS;
}
// Low treads are not sideways ramps. Enter/leave through the stair ends until
// reaching the top landing. Adjacent stair runs may join across equal treads;
// ground beside a low tread is not a matching stair surface.
export function yardMoveAllowed(records,defs,from,to) {
  if(!yardStepAllowed(from.y,to.y))return false;
  for(const e of records){
    if(e.id!=='yard_stairs')continue;
    const base=yardLevel(e)*YARD_LEVEL_HEIGHT,top=base+YARD_LEVEL_HEIGHT;
    if(Math.max(from.y,to.y)+1.65<=base+.03||Math.min(from.y,to.y)>=top-BUILD_STEP_HEIGHT)continue;
    const f=yardFootprint(e,defs);if(!f)continue;
    const a=(e.rot||0)*Math.PI/2,c=Math.cos(a),s=Math.sin(a),cx=f.x0+f.w/2,cz=f.z0+f.d/2;
    const local=p=>({u:(p.x-cx)*c-(p.z-cz)*s,v:(p.x-cx)*s+(p.z-cz)*c});
    const p=local(from),q=local(to),du=q.u-p.u;
    if(Math.abs(du)<1e-9)continue;
    for(const edge of [-1,1]){
      const at=(edge-p.u)/du;
      if(at<0||at>1)continue;
      const run=p.v+(q.v-p.v)*at;
      if(run>-1.5+1e-7&&run<1.5-1e-7){
        const inside=edge-Math.sign(edge)*1e-5,outside=edge+Math.sign(edge)*1e-5;
        const h=stairTreadAt(e,defs,cx+inside*c+run*s,cz-inside*s+run*c);
        const ox=cx+outside*c+run*s,oz=cz-outside*s+run*c;
        const joined=h!==null&&records.some(other=>other!==e&&other.id==='yard_stairs'&&Math.abs((stairTreadAt(other,defs,ox,oz)??-Infinity)-h)<1e-7);
        if(!joined)return false;
      }
    }
  }
  return true;
}
// World-space rectangles. Floors are thin ceilings below and walkable above;
// the door has two jambs and an overhead lintel, leaving a real passage.
export function buildCollisionRects(e,defs,lot={x0:0,z0:0}) {
  if(!isBuildStructure(e.id))return [];
  const f=yardFootprint(e,defs),a=(e.rot||0)*Math.PI/2,c=Math.cos(a),s=Math.sin(a),cx=(lot.x0||0)+e.gx+f.w/2,cz=(lot.z0||0)+e.gz+f.d/2,base=yardLevel(e)*YARD_LEVEL_HEIGHT;
  const rect=(x,z,w,d,y0,y1,walkable=false)=>{const pts=[[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]].map(([px,pz])=>[cx+(x+px)*c+(z+pz)*s,cz-(x+px)*s+(z+pz)*c]);return {x0:Math.min(...pts.map(p=>p[0])),x1:Math.max(...pts.map(p=>p[0])),z0:Math.min(...pts.map(p=>p[1])),z1:Math.max(...pts.map(p=>p[1])),y0:base+y0,y1:base+y1,walkable};};
  if(e.id==='yard_column')return [rect(0,0,.3,.3,0,3)];
  if(e.id==='yard_slab')return [rect(0,0,2,2,-.16,0,true)];
  if(e.id==='yard_roof_flat')return [rect(0,0,2,2,-.14,0,true)];
  if(e.id==='yard_foundation')return [rect(0,0,2,2,-.22,0,true)];
  if(e.id==='yard_wall'||e.id==='yard_window')return [rect(0,-.5,2,.16,0,3)];
  if(e.id==='yard_railing')return [rect(0,-.5,2,.13,0,1.05)];
  if(e.id==='yard_door'){
    const parts=[rect(-.88,-.5,.24,.18,0,3),rect(.88,-.5,.24,.18,0,3)];
    for(let i=0;i<12;i++){const x0=-.76+i*1.52/12,x1=x0+1.52/12,y=2+Math.sqrt(Math.max(0,.76**2-Math.max(x0*x0,x1*x1)));parts.push(rect((x0+x1)/2,-.5,x1-x0,.18,y,3));}
    return parts;
  }
  if(ROOFS.has(e.id))return [rect(0,0,2,2,0,1.1)];
  return [];
}
