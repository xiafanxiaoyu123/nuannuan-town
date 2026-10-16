import { THREE } from '../core/kit.js';

// 只在同步绘制期间筛选场景根节点。parent、visible和游戏持有的原对象始终不变，
// 绘制结束（包括异常）立即恢复完整列表，装修/拍照射线和季节登记仍操作真实模型。
export class ScenePerformance {
  constructor(town) {
    this.town=town;this.bounds=new WeakMap();this.decorCaches=new Map();this.revision=0;
    this.box=new THREE.Box3();this.stats={};this.enabled=true;
    this.renderFrames=[];this.renderDepth=0;
  }
  invalidateDecor(){this.revision++;}
  invalidateBounds(){this.bounds=new WeakMap();}
  range(root){
    if(root.isLight || root.userData.renderGlobal)return null;
    let range=this.bounds.get(root);
    if(!range){
      this.box.setFromObject(root);
      if(this.box.isEmpty())return null;
      // 跨区域的海面、天空、全镇积雪等保留；常规根节点的跨度远小于岛间距。
      const width=this.box.max.x-this.box.min.x;
      if(width>180)return null;
      range={offset:(this.box.min.x+this.box.max.x)/2-root.position.x,radius:width/2};
      this.bounds.set(root,range);
    }
    return range;
  }
  near(root,x){const b=this.range(root);return !b || Math.abs(root.position.x+b.offset-x)<180+b.radius;}
  eligible(rec){
    const o=rec.obj;
    return !rec.tick && !o.userData.seasonalPlant && rec.e.id!=='plot' && rec.e.id!=='bigplot' && o.visible &&
      Math.abs(o.scale.x-1)<1e-6 && Math.abs(o.scale.y-1)<1e-6 && Math.abs(o.scale.z-1)<1e-6;
  }
  buildDecor(decor,sources){
    const previous=this.decorCaches.get(decor);if(previous)for(const b of previous.batches)b.dispose();
    const buckets=new Map(),replaced=new Set();
    for(const rec of sources){
      const parts=[];let valid=true;rec.obj.updateWorldMatrix(true,true);
      rec.obj.traverse(o=>{
        if(!o.visible)valid=false;
        if(!o.isMesh)return;
        if(o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || o.morphTargetInfluences || o.isSkinnedMesh || !o.visible){valid=false;return;}
        parts.push(o);
      });
      if(!valid||!parts.length)continue;
      replaced.add(rec.obj);
      for(const mesh of parts){
        // 分成约10米的小块，避免一个实例批次把整间屋外的家具都提交给GPU。
        const cell=Math.floor(mesh.matrixWorld.elements[12]/10)+','+Math.floor(mesh.matrixWorld.elements[14]/10);
        const key=[cell,mesh.geometry.uuid,mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,mesh.layers.mask].join('|');
        if(!buckets.has(key))buckets.set(key,{mesh,matrices:[]});buckets.get(key).matrices.push(mesh.matrixWorld.clone());
      }
    }
    const batches=[];
    for(const {mesh,matrices}of buckets.values()){
      const batch=new THREE.InstancedMesh(mesh.geometry,mesh.material,matrices.length);
      batch.name='static-furniture-batch';batch.castShadow=mesh.castShadow;batch.receiveShadow=mesh.receiveShadow;
      batch.renderOrder=mesh.renderOrder;batch.layers.mask=mesh.layers.mask;
      matrices.forEach((matrix,i)=>batch.setMatrixAt(i,matrix));batch.computeBoundingBox();batch.computeBoundingSphere();batches.push(batch);
    }
    const cache={sources,batches,replaced,revision:this.revision};this.decorCaches.set(decor,cache);return cache;
  }
  furniture(decor){
    const cache=this.decorCaches.get(decor),entries=decor.entries;
    if(!cache||cache.revision!==this.revision)return this.buildDecor(decor,entries.filter(rec=>this.eligible(rec)));
    // 入场缩放/显隐会在 revision 不变时改变资格，仍逐帧检查；命中时不创建 sources。
    let count=0,sources=null;
    for(let i=0;i<entries.length;i++){
      if(!(i in entries))continue;
      const rec=entries[i];if(!this.eligible(rec))continue;
      if(sources)sources.push(rec);
      else if(rec!==cache.sources[count]){sources=cache.sources.slice(0,count);sources.push(rec);}
      count++;
    }
    if(sources||count!==cache.sources.length)return this.buildDecor(decor,sources||cache.sources.slice(0,count));
    return cache;
  }
  render(draw,camera=this.town.camera){
    if(!this.enabled)return draw();
    const scene=this.town.scene,original=scene.children,x=camera.position.x;
    // 缓冲只供本次同步 draw 使用；嵌套绘制用下一层，不能改写外层正在绘制的列表。
    const depth=this.renderDepth++;
    const frame=this.renderFrames[depth]||(this.renderFrames[depth]={selected:[],replaced:new Set(),batches:[]});
    const {selected,replaced,batches}=frame;
    try{
      for(const root of original)if(this.near(root,x))selected.push(root);
      const activeRoots=selected.length;
      for(const decor of Object.values(this.town.decors)){
        if(Math.abs(decor.lot.x0+decor.lot.cols/2-x)>180)continue;
        const cache=this.furniture(decor);
        for(const root of cache.replaced)replaced.add(root);
        for(const batch of cache.batches)batches.push(batch);
      }
      let kept=0;
      for(let i=0;i<selected.length;i++)if(!replaced.has(selected[i]))selected[kept++]=selected[i];
      selected.length=kept;
      for(const batch of batches)selected.push(batch);
      this.stats={totalRoots:original.length,activeRoots,skippedRoots:original.length-activeRoots,batchedRoots:replaced.size,batches:batches.length};
      scene.children=selected;
      const result=draw();
      // 通常 draw 返回 undefined；若调用者直接返回列表，保留该返回值并换一个缓冲。
      if(result===selected)frame.selected=[];
      return result;
    }finally{
      scene.children=original;
      if(frame.selected===selected)selected.length=0;
      batches.length=0;replaced.clear();
      this.renderDepth--;
    }
  }
  dispose(){for(const cache of this.decorCaches.values())for(const batch of cache.batches)batch.dispose();this.decorCaches.clear();this.renderFrames.length=0;}
}
