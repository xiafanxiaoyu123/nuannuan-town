import { THREE } from '../core/kit.js';

// 节日布局固定后按材质合并。原零件只留在不挂场景的资源库，撤场时一并释放。
// 透明玻璃、文字贴图、完成标记仍保持独立；不会烘焙不可见或动态子树。
export function bakeFestival(root){
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),buckets=new Map(),sources=new THREE.Group();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||Array.isArray(mesh.material)||mesh.material.transparent||mesh.material.map)return;
    for(let p=mesh;p&&p!==root.parent;p=p.parent)if(!p.visible||p.userData.dynamicFestival)return;
    const key=[mesh.material.uuid,mesh.castShadow,mesh.receiveShadow].join(':');
    if(!buckets.has(key))buckets.set(key,{material:mesh.material,cast:mesh.castShadow,receive:mesh.receiveShadow,parts:[]});
    buckets.get(key).parts.push(mesh);
  });
  let count=0;
  for(const b of buckets.values()){
    const positions=[],normals=[];
    for(const mesh of b.parts){
      const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      g.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
      const p=g.getAttribute('position'),n=g.getAttribute('normal');
      for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));}
      g.dispose();mesh.parent.remove(mesh);sources.add(mesh);count++;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.computeBoundingBox();geo.computeBoundingSphere();
    const mesh=new THREE.Mesh(geo,b.material);mesh.name='festival-static-batch';mesh.castShadow=b.cast;mesh.receiveShadow=b.receive;root.add(mesh);
  }
  sources.visible=false;root.userData.bakedSources=sources;root.userData.batching={sources:count,batches:buckets.size};
  return root.userData.batching;
}
