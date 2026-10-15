import { THREE } from '../core/kit.js';

// 只在同步绘制期间筛选场景根节点。parent、visible和游戏持有的原对象始终不变，
// 绘制结束（包括异常）立即恢复完整列表，装修/拍照射线和季节登记仍操作真实模型。
export class ScenePerformance {
  constructor(town) {
    this.town=town;this.bounds=new WeakMap();this.decorCaches=new Map();this.revision=0;
    this.box=new THREE.Box3();this.stats={};this.enabled=true;
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
    return !rec.tick && !o.userData.seasonalPlant && !['plot','bigplot'].includes(rec.e.id) && o.visible &&
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
    const sources=decor.entries.filter(rec=>this.eligible(rec)),cache=this.decorCaches.get(decor);
    if(!cache||cache.revision!==this.revision||sources.length!==cache.sources.length||sources.some((rec,i)=>rec!==cache.sources[i]))return this.buildDecor(decor,sources);
    return cache;
  }
  render(draw,camera=this.town.camera){
    if(!this.enabled)return draw();
    const scene=this.town.scene,original=scene.children,x=camera.position.x;
    const active=original.filter(root=>this.near(root,x)),replaced=new Set(),batches=[];
    for(const decor of Object.values(this.town.decors)){
      if(Math.abs(decor.lot.x0+decor.lot.cols/2-x)>180)continue;
      const cache=this.furniture(decor);for(const root of cache.replaced)replaced.add(root);batches.push(...cache.batches);
    }
    const selected=active.filter(root=>!replaced.has(root));selected.push(...batches);
    this.stats={totalRoots:original.length,activeRoots:active.length,skippedRoots:original.length-active.length,batchedRoots:replaced.size,batches:batches.length};
    scene.children=selected;
    try{return draw();}finally{scene.children=original;}
  }
  dispose(){for(const cache of this.decorCaches.values())for(const batch of cache.batches)batch.dispose();this.decorCaches.clear();}
}
