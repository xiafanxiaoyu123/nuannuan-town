import { THREE, cbox, cyl, frustum, torus, group, rboxGeo } from '../core/kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeMomoCloak } from './momo-cloaks.js';

// 小配件用四棱台 / 低边圆柱，避免每颗珠子都带圆角方块的细分面。
const tiny = { cast: false, receive: false };
const block = (w,h,d,col,x,y,z,o={}) => frustum(w,w,h,col,x,y-h/2,z,{sz:d/w,...tiny,...o});
function bow(g,col,x,y,z,s=1,trim=col) {
  for(const sx of [-1,1]) {
    g.add(block(.115*s,.083*s,.042*s,col,x+sx*.073*s,y,z,{rz:sx*.3}));
    g.add(block(.04*s,.10*s,.025*s,trim,x+sx*.045*s,y-.075*s,z-.008,{rz:-sx*.25}));
  }
  g.add(block(.056*s,.063*s,.05*s,trim,x,y,z+.012));
}
function bead(g,col,x,y,z,s=.021) { g.add(cyl(s,s,s,col,x,y-s/2,z,{seg:6,rx:Math.PI/2,...tiny})); }
function star(g,col,x,y,z,s=.032) {
  g.add(block(s*.5,s*2,.016,col,x,y,z));
  g.add(block(s*2,s*.5,.018,col,x,y,z));
  g.add(block(s,s,.018,col,x,y,z,{rz:Math.PI/4}));
}
function hood(g,col,inner,trim=col,{tall=false}={}) {
  g.add(cbox(.74,.24,.62,col,0,.5,-.02,{r:.11}));
  g.add(cbox(.74,.62,.16,col,0,.3,-.26,{r:.07}));
  for(const sx of [-1,1]) {
    g.add(cbox(.12,.56,.5,col,sx*.33,.28,-.04,{r:.05}));
    g.add(cbox(.07,.4,.06,trim,sx*.30,.3,.254,{r:.025}));
    g.add(frustum(.035,.3,tall?.49:.3,col,sx*.24,.6,-.02,{sz:.55,rz:-sx*.22}));
    g.add(frustum(.018,.17,tall?.36:.18,inner,sx*.24,.63,.065,{sz:.36,rz:-sx*.22,...tiny}));
  }
  g.add(cbox(.68,.048,.06,trim,0,.512,.279,{r:.017}));
}
function cape(g,col,hem=col,{long=false}={}) {
  g.add(frustum(.5,.78,.2,col,0,.42,0,{sz:.8}));
  for(let i=0;i<10;i++) {
    const a=i*Math.PI/5;
    g.add(frustum(.16,.025,.1,i%2?col:hem,Math.sin(a)*.36,.33,Math.cos(a)*.29,{sz:.5,ry:a}));
  }
  if(long) g.add(frustum(.64,.7,.21,col,0,.24,-.22,{sz:.3}));
}
function frill(g,col,x,y,z,count=12,rx=.34,ry=.25) {
  for(let i=0;i<count;i++) {
    const a=i/(count-1)*Math.PI*1.12;
    const xx=x+Math.cos(a)*rx, yy=y-Math.sin(a)*ry;
    g.add(block(.075,.065,.032,col,xx,yy,z,{rz:a}));
  }
}
function stitchedEars(g,col,height=.3) {
  for(const sx of [-1,1]) for(let i=0;i<5;i++)
    g.add(block(.026,.008,.012,col,sx*(.18+i*.019),.68+i*height*.12,.086,{rz:sx*.5}));
}

// Geometries are owned by this particular cloak. Only kit materials are shared.
// Momo.setCloak and ordinary scene/icon cleanup can dispose these safely.
// Cache the merged template per cloak ID and clone each mesh geometry so
// repeated setCloak/icon calls avoid re-running mergeGeometries from scratch.
const templateCache = new Map();

function cloneBatchedGroup(template) {
  const output = new THREE.Group();
  output.name = template.name;
  for (const child of template.children) {
    const geometry = child.geometry.clone();
    if (child.geometry.boundingBox) geometry.boundingBox = child.geometry.boundingBox.clone();
    if (child.geometry.boundingSphere) geometry.boundingSphere = child.geometry.boundingSphere.clone();
    const m = new THREE.Mesh(geometry, child.material);
    m.castShadow = child.castShadow;
    m.receiveShadow = child.receiveShadow;
    output.add(m);
  }
  output.userData = { momoCloak: template.userData.momoCloak, features: [...template.userData.features] };
  return output;
}

function batch(source) {
  source.updateMatrixWorld(true);
  const buckets=new Map();
  source.traverse(m=>{
    if(!m.isMesh)return;
    const key=m.material.uuid+'|'+m.castShadow+'|'+m.receiveShadow;
    if(!buckets.has(key))buckets.set(key,{material:m.material,cast:m.castShadow,receive:m.receiveShadow,parts:[]});
    const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
    g.applyMatrix4(m.matrixWorld); buckets.get(key).parts.push(g);
  });
  const output=new THREE.Group();
  for(const b of buckets.values()) {
    const geometry=mergeGeometries(b.parts,false);
    for(const g of b.parts)g.dispose();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const m=new THREE.Mesh(geometry,b.material);m.castShadow=b.cast;m.receiveShadow=b.receive;output.add(m);
  }
  source.clear();
  return output;
}

export function buildMomoCloak(value) {
  const id=normalizeMomoCloak(value);
  // Keep a separate merged template for each finite geometry-detail setting.
  const key = id + ':' + rboxGeo(.74, .24, .62, .11).uuid;
  const cached = templateCache.get(key);
  if (cached) {
    return { id, body: cloneBatchedGroup(cached.body), head: cloneBatchedGroup(cached.head) };
  }
  const b=group(),h=group(),features=[];
  const white='#fff5e5',gold='#dfb864',red='#cf3546';
  if(id==='classic') {
    hood(h,'#f6c544','#e6ad2c');cape(b,'#f6c544','#e6ad2c');bow(b,'#e8425e',0,.56,.32);
    features.push('yellow-hood','red-bow','pointed-hem');
  } else if(id==='festive') {
    const orange='#e95132';hood(h,orange,white,gold);cape(b,orange,gold,{long:true});
    b.add(block(.32,.3,.055,white,0,.46,.32));
    for(const sx of [-1,1]) {
      b.add(block(.021,.3,.025,gold,sx*.17,.46,.355));
      h.add(frustum(.01,.14,.1,gold,sx*.31,.83,.012,{sz:.4,rz:-sx*.22,...tiny}));
      for(let j=0;j<3;j++)h.add(block(.012,.13,.012,gold,sx*.32+(j-1)*.014,.82,.05));
    }
    for(let i=0;i<3;i++) {
      b.add(block(.13,.013,.018,gold,0,.55-i*.078,.358));bead(b,orange,0,.55-i*.078,.374,.02);
    }
    // 同一红金主题的方块化背饰；官方宣传主要展示正面，背饰为项目改编。
    b.add(torus(.13,.014,gold,0,.43,-.31,tiny));star(b,gold,0,.43,-.331,.045);
    for(const sx of [-1,1])b.add(block(.015,.13,.015,gold,sx*.13,.3,-.32));
    h.add(block(.018,.29,.015,gold,0,.28,-.348));
    features.push('tassel-ears','knot-buttons','gold-back-medallion');
  } else if(id==='coachman') {
    const dark='#30303a',purple='#77638d';hood(h,dark,purple,gold);cape(b,dark,purple,{long:true});
    b.add(block(.33,.30,.045,purple,0,.46,.327));
    b.add(block(.36,.035,.05,white,0,.305,.33));
    for(const sx of [-1,1]) {
      b.add(block(.12,.2,.025,dark,sx*.13,.53,.36,{rz:-sx*.38}));
      b.add(block(.26,.25,.05,dark,sx*.15,.25,-.30,{rz:sx*.15}));
      b.add(block(.018,.26,.013,purple,sx*.2,.28,-.337,{rz:sx*.15}));
      h.add(block(.11,.025,.028,dark,sx*.07,.187,.307,{rz:sx*.30}));
      h.add(block(.04,.06,.025,dark,sx*.131,.209,.302,{rz:-sx*.5}));
    }
    bow(b,white,0,.615,.35,.8,dark);
    for(let i=0;i<3;i++)bead(b,white,0,.50-i*.068,.36,.014);
    h.add(torus(.094,.009,gold,-.14,.277,.313,tiny));
    for(let i=0;i<7;i++)bead(h,gold,-.255-i*.005,.23-i*.035,.28,.009);
    for(let i=0;i<4;i++)bead(h,purple,0,.43-i*.07,-.352,.017);
    stitchedEars(h,gold);
    features.push('monocle-chain','curled-moustache','striped-bow','waistcoat','split-tails');
  } else if(id==='veil') {
    const pink='#eab4d0',deep='#d775a6',lace='#fff5fa';hood(h,pink,lace,gold,{tall:true});cape(b,pink,lace,{long:true});
    for(const sx of [-1,1]) {
      h.add(block(.075,.61,.026,lace,sx*.43,.59,-.045,{rz:-sx*.10}));
      h.add(block(.044,.42,.02,pink,sx*.445,.37,-.038,{rz:-sx*.13}));
      // 耳边蕾丝、耳上月环，都是实体几何而不是贴图。
      for(let i=0;i<7;i++)bead(h,lace,sx*(.22+.023*i),1.03-i*.058,.075,.022);
      h.add(torus(.044,.009,gold,sx*.255,.78,.108,tiny));star(h,gold,sx*.28,.86,.108,.019);
      b.add(block(.075,.25,.024,lace,sx*.07,.32,-.343,{rz:-sx*.18}));
    }
    star(h,gold,0,.56,.32,.035);
    frill(h,lace,0,.4,.292,13,.305,.285);
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      bead(b,lace,Math.sin(a)*.369,.335,Math.cos(a)*.3,.036);
    }
    bow(b,deep,0,.60,.354,1.18,lace);bead(b,gold,0,.6,.395,.033);
    star(b,gold,0,.43,.387,.03);
    bow(b,deep,0,.50,-.346,.85,lace);
    for(const [x,y]of [[-.17,.26],[.16,.28],[0,.20]])star(h,gold,x,y,-.351,.027);
    features.push('tall-ears','hanging-veils','ear-lace','star-jewel','layered-frills','back-ribbons');
  } else {
    const dark='#383640',grey='#8d95a6',pearl='#e7e5f0';hood(h,dark,grey,grey);cape(b,dark,grey,{long:true});
    // 荷叶边绕脸框外侧和下沿，不横过脸颊、鼻子与嘴，保留玩偶的缝边感。
    for (const sx of [-1,1]) for (let i=0;i<7;i++)
      h.add(block(.073,.069,.035,grey,sx*(.36+Math.sin(i/6*Math.PI)*.017),.46-i*.06,.21,{rz:sx*(.1+i*.07)}));
    for (let i=0;i<9;i++)
      h.add(block(.075,.060,.034,grey,-.30+i*.075,.035-Math.sin(i/8*Math.PI)*.035,.215,{rz:(i-4)*.13}));
    stitchedEars(h,pearl);
    for(let i=0;i<14;i++) {
      const a=i*Math.PI/7;
      b.add(block(.085,.074,.032,grey,Math.sin(a)*.345,.55,Math.cos(a)*.28,{ry:a,rz:Math.sin(a)*.24}));
      bead(b,pearl,Math.sin(a)*.378,.32,Math.cos(a)*.305,.02);
    }
    bow(h,red,.28,.655,.153,1.24,red);
    for(let i=0;i<5;i++)bead(h,pearl,.25-i*.036,.64-Math.sin(i/4*Math.PI)*.10,.18,.014);
    bow(b,red,0,.59,.354,.75,pearl);bow(b,red,0,.46,-.35,1.25,red);
    for(let i=0;i<5;i++) {
      b.add(block(.017,.015,.018,pearl,0,.38-i*.03,-.345,{rz:i%2?.5:-.5}));
      h.add(block(.06,.009,.018,pearl,0,.40-i*.063,-.35,{rz:i%2?.28:-.28}));
    }
    features.push('ruffled-hood','open-face-frills','stitched-ears','red-ear-bow','pearl-chain','back-bow','doll-stitches');
  }
  const body=batch(b),head=batch(h);
  body.name='momo-cloak-body';head.name='momo-cloak-head';
  for(const g of [body,head])g.userData={momoCloak:id,features:[...features]};
  templateCache.set(key, { body, head });
  return { id, body: cloneBatchedGroup(body), head: cloneBatchedGroup(head) };
}
