// Real r170 geometry/material checks. Only unrelated model factories are stubbed and fail if called.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
if(!vm.SourceTextModule){const c=require('node:child_process').spawnSync(process.execPath,['--experimental-vm-modules','--no-warnings',__filename,...process.argv.slice(2)],{stdio:'inherit'});process.exit(c.status??1);}
const root=path.resolve(__dirname,'../..'),args=process.argv.slice(2),opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const source=path.resolve(opt('--source',root)),out=opt('--out',process.env.LIVE_QA_OUT?path.join(process.env.LIVE_QA_OUT,'report.json'):null),checks=[];
if(out)assert(!fs.existsSync(out),'Use a new report path');
const check=async(name,fn)=>{const detail=await fn();checks.push({name,pass:true,...(detail===undefined?{}:{detail})});console.log('PASS '+name);};
(async()=>{
  const THREE=await import(pathToFileURL(path.join(root,'node_modules/three/build/three.module.js')).href);
  const rounded=await import(pathToFileURL(path.join(root,'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href);
  const utils=await import(pathToFileURL(path.join(root,'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js')).href);
  assert.equal(THREE.REVISION,'170');
  const context=vm.createContext({console}),modules=new Map(),unused=()=>{throw Error('Unrelated factory executed');};
  const synth=(name,values)=>{const m=new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:name});modules.set(name,m);return m;};
  synth('three',THREE);synth('three/addons/geometries/RoundedBoxGeometry.js',rounded);synth('three/addons/utils/BufferGeometryUtils.js',utils);
  synth('character.js',{Momo:unused});synth('items.js',{cropModel:unused});synth('house-furniture.js',{HOUSE_FURNITURE_BUILD:{}});synth('yard-building.js',{buildYardBuilding:unused});
  const kit=new vm.SourceTextModule(fs.readFileSync(path.join(source,'js/core/kit.js'),'utf8'),{context,identifier:'kit.js'});modules.set('kit.js',kit);
  const props=new vm.SourceTextModule(fs.readFileSync(path.join(source,'js/models/props.js'),'utf8'),{context,identifier:'props.js'});modules.set('props.js',props);
  await props.link(spec=>modules.get(spec)||modules.get(path.basename(spec))||assert.fail('Unexpected import '+spec));await props.evaluate();
  const K=kit.namespace,P=props.namespace,models=[['bench',()=>P.DECOR_BUILD.bench(),9,3],['lamp',()=>P.streetLamp(),5,2]];
  const meshes=obj=>{const a=[];obj.traverse(o=>{if(o.isMesh)a.push(o);});return a;};
  function shape(obj){obj.updateMatrixWorld(true);const result=new Map();for(const m of meshes(obj)){
    const key=m.material.uuid+'|'+m.castShadow+'|'+m.receiveShadow;if(!result.has(key))result.set(key,[]);
    const arr=result.get(key),g=m.geometry,normal=new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    for(let i=0;i<(g.index?.count??g.attributes.position.count);i++){const j=g.index?g.index.getX(i):i;
      arr.push(...new THREE.Vector3().fromBufferAttribute(g.attributes.position,j).applyMatrix4(m.matrixWorld).toArray(),...new THREE.Vector3().fromBufferAttribute(g.attributes.normal,j).applyNormalMatrix(normal).toArray());}}
    return result;}
  for(const[name,factory,count,merged]of models){
    await check(name+' preserves world triangles/normals, exact materials and shadow flags',()=>{
      for(const angle of [0,Math.PI/2,Math.PI,.712]){const obj=factory();obj.position.set(12.6,.3,-7.5);obj.rotation.y=angle;
        assert.equal(meshes(obj).length,count);obj.traverse(o=>assert.deepEqual(Object.keys(o.userData),[],'No child metadata/tick to discard'));
        const before=shape(obj),pos=obj.position.toArray(),rot=obj.rotation.toArray();K.mergeStatic(obj);const after=shape(obj);
        assert.equal(meshes(obj).length,merged);assert.deepEqual(obj.position.toArray(),pos);assert.deepEqual(obj.rotation.toArray(),rot);
        assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort());
        for(const[key,a]of before){const b=after.get(key);assert.equal(b.length,a.length);for(let i=0;i<a.length;i++)assert(Math.abs(a[i]-b[i])<2e-6,`${name} geometry ${i}: ${a[i]} != ${b[i]}`);}
        assert.equal(K.mergeStatic(obj),0,'Second merge must be idempotent');assert.equal(meshes(obj).length,merged);
      }
    });
    await check(name+' releases owned merged geometry once without disposing cached originals/materials',()=>{
      const obj=factory(),originals=new Set(meshes(obj).map(m=>m.geometry)),materials=new Set(meshes(obj).map(m=>m.material));let sharedReleased=0;
      for(const resource of [...originals,...materials])resource.addEventListener('dispose',()=>sharedReleased++);
      K.mergeStatic(obj);const owned=meshes(obj).map(m=>m.geometry).filter(g=>!originals.has(g)),seen=new Map();
      for(const g of owned)g.addEventListener('dispose',()=>seen.set(g,(seen.get(g)||0)+1));
      K.disposeSceneResources(obj);assert(owned.length>0);assert.equal(seen.size,owned.length);for(const n of seen.values())assert.equal(n,1);assert.equal(sharedReleased,0);
      assert.equal(meshes(factory()).length,count,'Factory remains unmerged for editable furniture');
      return{beforeMeshes:count,afterMeshes:merged,ownedGeometries:owned.length,ownedAttributeBytes:owned.reduce((sum,g)=>sum+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength||0),0)};
    });
  }
  await check('lamp retains night material binding and unshadowed light lens',()=>{
    const lamp=P.streetLamp(),lens=meshes(lamp).find(m=>!m.castShadow),material=lens.material,entry=K.glowMats.find(e=>e.m===material);
    assert(entry&&entry.day===.1&&entry.night===3);K.mergeStatic(lamp);assert(meshes(lamp).includes(lens));assert.equal(lens.material,material);assert.equal(lens.receiveShadow,false);
    for(const level of [entry.day,entry.night]){entry.m.emissiveIntensity=level;assert.equal(lens.material.emissiveIntensity,level);}entry.m.emissiveIntensity=entry.day;
  });
  await check('only fixed scene call sites opt in, collision declarations remain',()=>{
    const scenery=fs.readFileSync(path.join(source,'js/world/town/scenery.js'),'utf8');
    assert(scenery.includes('mergeStatic(bench)')&&scenery.includes('mergeStatic(lamp)'));
    assert(scenery.includes('town.addCircle(x, z, 0.8)')&&scenery.includes('town.addCircle(x, z, 0.25)'));
    assert(!fs.readFileSync(path.join(source,'js/models/props.js'),'utf8').includes('mergeStatic('));
  });
  const report={pass:true,checks,source,three:THREE.REVISION,note:'Real geometry, materials, glow bindings and resource ownership; browser pixels and live Town interaction are separate evidence.'};
  if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));}console.log(checks.length+'/'+checks.length+' PASS');
})().catch(error=>{if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify({pass:false,checks,error:error.stack},null,2));}console.error(error);process.exitCode=1;});
