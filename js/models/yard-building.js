import { THREE, group, box, cbox, mat } from '../core/kit.js';
import { YARD_LEVEL_HEIGHT, BUILD_STAIRS_STEPS } from '../world/yard-building.js';
import { BUILD_SLOPED_ROOF_IDS, BUILD_SLOPED_ROOF_BASE, BUILD_SLOPED_ROOF_RISE, roofProfileHeight } from '../world/build-roof-profiles.js';

const CREAM='#eee2cf',WOOD='#c49970',LIGHT='#efd0a8',MINT='#8dc5b7';

// Connection faces are square-cut. Rounded ends otherwise leave a bright seam
// between two grid-aligned pieces, even when their logical edges coincide.
function squareBox(w,h,d,color,x=0,y=0,z=0) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),color?.isMaterial?color:mat(color));
  mesh.position.set(x,y+h/2,z);mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function profileMesh(shape,depth,color,z) {
  const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:24}),mat(color));
  mesh.position.z=z;mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function wallEdges(g,h,base=true) {
  for(const x of [-.93,.93])g.add(squareBox(.14,h,.19,WOOD,x,0,-.5));
  // Full-width rails stop exactly at the two grid endpoints, including windows.
  g.add(squareBox(2,.13,.2,LIGHT,0,h-.15,-.5));
  if(base)g.add(squareBox(2,.13,.2,LIGHT,0,.04,-.5));
}
function slopedRoof(id) {
  const positions=[],colors=[];
  const palette={body:new THREE.Color(MINT),stripe:new THREE.Color('#b4ddd0'),side:new THREE.Color('#75ae9f'),bottom:new THREE.Color('#679889')};
  const triangle=(a,b,c,color)=>{
    for(const p of [a,b,c]){positions.push(...p);colors.push(color.r,color.g,color.b);}
  };
  const top=(x,z)=>[x,roofProfileHeight(id,x,z),z];
  const topTriangle=(a,b,c)=>{
    const rise=((a[1]+b[1]+c[1])/3-BUILD_SLOPED_ROOF_BASE)/BUILD_SLOPED_ROOF_RISE;
    const stripe=[.25,.5,.75].some(edge=>rise>edge-.015&&rise<edge);
    triangle(a,b,c,stripe?palette.stripe:palette.body);
  };
  // Cut the colour bands into the actual surface, not a coplanar overlay.
  // A square grid with the same x/z divisions also preserves the x=z hip/valley.
  const grid=[-1,-.53,-.5,-.03,0,.47,.5,1];
  for(let ix=0;ix<grid.length-1;ix++)for(let iz=0;iz<grid.length-1;iz++){
    const a=top(grid[ix],grid[iz]),b=top(grid[ix+1],grid[iz]);
    const c=top(grid[ix+1],grid[iz+1]),d=top(grid[ix],grid[iz+1]);
    topTriangle(a,d,c);topTriangle(a,c,b);
  }
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(let i=0;i<4;i++){
    const [x,z]=corners[i],[nx,nz]=corners[(i+1)%4],a=[x,0,z],b=[nx,0,nz];
    triangle(a,top(x,z),top(nx,nz),palette.side);triangle(a,top(nx,nz),b,palette.side);
  }
  triangle([-1,0,-1],[1,0,-1],[1,0,1],palette.bottom);
  triangle([-1,0,-1],[1,0,1],[-1,0,1],palette.bottom);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.84}));
  mesh.castShadow=mesh.receiveShadow=true;mesh.userData.roofProfile=id;
  return mesh;
}
export function buildYardBuilding(id) {
  const g=group(),h=YARD_LEVEL_HEIGHT;
  if(id==='yard_slab'){
    // Ground turf is slightly raised: expose the same thin deck at every level.
    g.add(box(2,.16,2,WOOD,0,-.16,0,{r:.015}));
    for(let i=0;i<5;i++)g.add(box(1.996,.04,.392,i%2?'#e5bb8b':LIGHT,0,0,-.8+i*.4,{r:.005}));
  }else if(id==='yard_foundation'){
    g.add(box(2,.235,2,CREAM,0,-.22,0,{r:.02}));
    // Foundation and wood floor can occupy the same cells; keep the stone below the planks.
    g.add(box(1.97,.01,1.97,'#faf2e6',0,.015,0,{r:.004}));
    for(const x of [-.5,.5])g.add(cbox(.012,.006,1.96,'#d9c9b4',x,.028,0,{r:.001}));
  }else if(id==='yard_column'){
    g.add(box(.3,h,.3,CREAM,0,0,0,{r:.025}));
    for(const y of [0,h-.12])g.add(box(.43,.12,.43,WOOD,0,y,0,{r:.02}));
    g.add(cbox(.04,h-.4,.035,'#faf1e4',-.11,h/2,-.157,{r:.008}));
  }else if(id==='yard_stairs'){
    const depth=3/BUILD_STAIRS_STEPS;
    // One closed stepped solid avoids internal coincident faces and tiny gaps
    // between rounded risers. Timber tops match the floor's +.04 visual skin.
    const side=new THREE.Shape();side.moveTo(-1.5,0);side.lineTo(1.5,0);side.lineTo(1.5,h);
    for(let i=BUILD_STAIRS_STEPS-1;i>=0;i--){const z=-1.5+i*depth;side.lineTo(z,(i+1)*h/BUILD_STAIRS_STEPS);side.lineTo(z,i*h/BUILD_STAIRS_STEPS);}
    side.closePath();const body=profileMesh(side,2,CREAM,0);body.geometry.rotateY(-Math.PI/2);body.geometry.translate(1,0,0);g.add(body);
    for(let i=0;i<BUILD_STAIRS_STEPS;i++){
      const step=(i+1)*h/BUILD_STAIRS_STEPS,z=-1.5+(i+.5)*depth;
      g.add(squareBox(2,.04,depth,i%2?'#e5bb8b':LIGHT,0,step,z));
    }
  }else if(id==='yard_wall'){
    g.add(squareBox(1.72,h,.16,CREAM,0,0,-.5));wallEdges(g,h);
    g.add(box(1.72,.02,.018,'#d8c6ad',0,.92,-.58,{r:.003}));
  }else if(id==='yard_door'){
    // Match the physical passage: +/- .76 jambs, spring line 2, apex 2.76.
    // The OUTER outline stays rectangular so a wall/roof can join every corner.
    const frame=new THREE.Shape();frame.moveTo(-.86,0);frame.lineTo(-.86,h);frame.lineTo(.86,h);frame.lineTo(.86,0);frame.lineTo(.76,0);frame.lineTo(.76,2);frame.absarc(0,2,.76,0,Math.PI,false);frame.lineTo(-.76,0);frame.closePath();
    g.add(profileMesh(frame,.18,CREAM,-.59));wallEdges(g,h,false);
    const arch=new THREE.Shape();arch.moveTo(-.9,2);arch.absarc(0,2,.9,Math.PI,0,true);arch.lineTo(.76,2);arch.absarc(0,2,.76,0,Math.PI,false);arch.closePath();
    g.add(profileMesh(arch,.21,LIGHT,-.605));
    for(const x of [-.83,.83])g.add(squareBox(.14,2,.21,LIGHT,x,0,-.5));
    for(const x of [-.88,.88])g.add(squareBox(.24,.17,.22,WOOD,x,0,-.5));
  }else if(id==='yard_window'){
    g.add(squareBox(1.72,.9,.16,CREAM,0,0,-.5));g.add(squareBox(1.72,.4,.16,CREAM,0,2.6,-.5));wallEdges(g,h);
    for(const x of [-.82,.82])g.add(squareBox(.08,1.7,.2,LIGHT,x,.9,-.5));
    g.add(box(1.56,1.66,.035,mat('#b6e5e9',{opacity:.44,rough:.16}),0,.94,-.5,{r:.002,cast:false}));
    g.add(box(1.56,.09,.2,LIGHT,0,1.74,-.5,{r:.008}));g.add(box(.08,1.58,.2,LIGHT,0,.98,-.5,{r:.008}));
    // The sill is inset between the end posts, never 2.03 units across a 2-unit tile.
    for(const y of [.86,2.56])g.add(squareBox(1.72,.12,.24,LIGHT,0,y,-.5));
  }else if(id==='yard_railing'){
    for(const x of [-.93,.93])g.add(squareBox(.14,1.05,.14,WOOD,x,0,-.5));
    g.add(squareBox(.12,1.05,.12,WOOD,0,0,-.5));
    for(const y of [.18,.94])g.add(squareBox(2,.11,.16,LIGHT,0,y,-.5));
    for(const x of [-.62,-.31,.31,.62])g.add(box(.07,.65,.07,CREAM,x,.29,-.5,{r:.012}));
  }else if(BUILD_SLOPED_ROOF_IDS.includes(id)){
    g.add(slopedRoof(id));
  }else if(id==='yard_roof'){
    // The general-purpose gable helper adds a .06 bevel outside its footprint.
    // Modular roofs need exact endpoints, otherwise adjacent caps intersect.
    const triangle=new THREE.Shape();triangle.moveTo(-1,0);triangle.lineTo(1,0);triangle.lineTo(0,1.08);triangle.closePath();g.add(profileMesh(triangle,2,MINT,-1));
    for(const z of [-.94,-.47,0,.47,.94])for(const side of [-1,1])g.add(cbox(1.43,.024,.025,'#b4ddd0',side*.5,.55,z,{rz:-side*Math.atan(1.08),r:.003}));
    g.add(squareBox(.13,.06,2,'#75ae9f',0,1.04,0));
  }else if(id==='yard_roof_flat'){
    // Terrace caps meet the same walking plane as stair landings and slabs.
    g.add(box(2,.14,2,CREAM,0,-.14,0,{r:.015}));
    g.add(box(1.95,.025,1.95,'#f8f0e3',0,0,0,{r:.015}));
    for(const z of [-.5,.5])g.add(cbox(1.96,.006,.014,'#d8c6ad',0,.03,z,{r:.001}));
  }
  g.userData.yardStructure=id;g.userData.buildStructure=id;return g;
}
