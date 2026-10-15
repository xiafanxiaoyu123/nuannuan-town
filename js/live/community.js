// 面包房之后的公共建设：分期出资、可见施工进度、建成后的纪念物。
import { THREE, box, cbox, cyl, slab, group, textPlane, disposeSceneResources } from '../core/kit.js';
import { S, bus, save, spend } from '../core/state.js';
import { gameDayNo, gameDate } from '../core/gametime.js';
import { h } from '../core/util.js';
import { DECOR_BUILD, treeSakura } from '../models/props.js';

export const COMMUNITY_PROJECTS = [
  { id: 'garden', name: '邻里花园', color: '#75b88d', require: '先完成麦香面包房的全部建设',
    phases: [{name:'清理与围边',cost:1200,note:'铺好花园边界，保留前方通道'}, {name:'种下花木',cost:2200,note:'栽下樱花树与四季花圃'}, {name:'花园落成',cost:3600,note:'放好长椅，立起共同建设的纪念牌'}],
    memory:'从一块空地到一处可以停下脚步的小花园，是大家一点点添起来的。走过这里的人，都可以在花影下歇一会儿。' },
  { id: 'shore', name: '海风休憩点', color: '#77a7c3', require: '先建成邻里花园',
    phases: [{name:'铺好木台',cost:1800,note:'在东南海岸的空位铺出观景木台'}, {name:'搭起遮阴架',cost:3200,note:'加上靠背和一处遮阳棚'}, {name:'海风落成纪念',cost:5000,note:'装好望海长椅、风向标与纪念牌'}],
    memory:'一起出资修好的木台，留住了脚步，没留住海风。忙完以后来这里看海，今天也可以到此为止。' },
];
const def = (id) => COMMUNITY_PROJECTS.find(project=>project.id===id);
const integer = n=>Number.isSafeInteger(n)&&n>=0;
function state() {
  if(!S.live.community||typeof S.live.community!=='object'||Array.isArray(S.live.community))S.live.community={version:1,projects:{}};
  const c=S.live.community;c.version=1;
  if(!c.projects||typeof c.projects!=='object'||Array.isArray(c.projects))c.projects={};
  for(const p of COMMUNITY_PROJECTS){let r=c.projects[p.id];if(!r||typeof r!=='object'||Array.isArray(r))r=c.projects[p.id]={phase:0,paid:0};
    r.phase=integer(r.phase)?Math.min(3,r.phase):0;r.paid=integer(r.paid)?Math.min(r.paid,p.phases[r.phase]?.cost||0):0;
    // 兼容旧/导入快照恰好停在本期满额的情况，不让工程卡在“还需0”却无法前进。
    if(r.phase<3&&r.paid===p.phases[r.phase].cost){r.phase++;r.paid=0;}
    if(r.phase===3) {r.paid=0;if(!integer(r.finishedDay))r.finishedDay=gameDayNo();}else delete r.finishedDay;
  }return c;
}
const funding=new Set();
export const community={
  state,
  info(id){const d=def(id);if(!d)return null;const r=state().projects[id];return {...d,...r,done:r.phase===3,unlocked:id==='garden'?(S.live.project?.phase||0)>=3:state().projects.garden.phase===3};},
  fund(id,amount,expectedPhase){const info=this.info(id);if(!info||!info.unlocked||info.done||!Number.isSafeInteger(amount)||amount<=0||funding.has(id)||(expectedPhase!==undefined&&expectedPhase!==info.phase))return {ok:false,paid:0};
    const r=state().projects[id],payment=Math.min(amount,info.phases[r.phase].cost-r.paid);if(payment<=0)return {ok:false,paid:0};
    funding.add(id);try{if(!spend(payment))return {ok:false,paid:0};r.paid+=payment;if(r.paid===info.phases[r.phase].cost){r.phase++;r.paid=0;if(r.phase===3)r.finishedDay=gameDayNo();}
      save();bus.emit('communityChanged',id);return {ok:true,paid:payment,phase:r.phase,done:r.phase===3};
    }finally{funding.delete(id);}
  },
};

function placard(text,color){const g=group();g.add(box(.12,1.05,.12,'#bb946c',0,0,0,{r:.03}),cbox(1.35,.7,.12,'#fff8e9',0,1.05,0,{r:.07}));
  const label=textPlane(text,{color,height:.2,size:48});label.position.set(0,1.07,.075);g.add(label);return g;
}
function flowerBed(g,x,z,full){g.add(box(1.0,.23,1.0,'#c99b77',x,0,z,{r:.08}),box(.87,.04,.87,'#967558',x,.23,z,{r:.04}));
  if(full)for(const [dx,dz,c]of [[-.22,-.19,'#ffc0d4'],[.2,.13,'#ffe498'],[-.14,.23,'#c8baf0'],[.21,-.2,'#ffffff']]){g.add(box(.06,.36,.06,'#82b97e',x+dx,.25,z+dz,{r:.02}),cbox(.3,.18,.3,c,x+dx,.62,z+dz,{r:.08}));}
}
function model(id,phase){const g=group();g.name='community-'+id;g.userData.community={id,phase};
  if(!phase){const sign=placard(def(id).name,'#7e695a');sign.position.set(0,0,-.6);g.add(sign);for(const x of [-1.3,1.3])g.add(box(.45,.35,.45,'#d4b388',x,0,-.6,{r:.04}));return g;}
  if(id==='garden'){
    g.add(slab(3.7,2.65,.38,.06,'#f2dbc0',0,-.05,0,{cast:false,bevel:.015}));flowerBed(g,-1.22,-.58,phase>=2);flowerBed(g,1.22,-.58,phase>=2);
    if(phase>=2){const tree=treeSakura(.45);tree.position.set(-1.18,.24,-.6);g.add(tree);g.children[g.children.length-1].userData.communityTree=true;}
    if(phase>=3){const b=DECOR_BUILD.bench();b.scale.setScalar(.68);b.position.set(0,.06,.55);g.add(b);const sign=placard('邻里花园','#568967');sign.scale.setScalar(.63);sign.position.set(1.25,.04,.45);g.add(sign);}
  }else{
    g.add(slab(3.7,2.65,.24,.12,'#d2ae88',0,-.02,0,{cast:false,bevel:.018}));for(let i=-3;i<=3;i++)g.add(box(.025,.01,2.5,'#b88f6b',i*.48,.1,0,{cast:false}));
    if(phase>=2){for(const x of [-1.55,1.55])g.add(box(.13,2.3,.13,'#c9a078',x,.1,-.92,{r:.04}));const roof=cbox(3.65,.13,1.65,'#b8d8dd',0,2.4,-.35,{r:.04,rx:.06});roof.userData.seasonalRoof=true;g.add(roof);}
    if(phase>=3){const b=DECOR_BUILD.bench();b.scale.setScalar(.82);b.position.set(0,.12,-.35);g.add(b);const sign=placard('听一会儿海风','#608fa3');sign.scale.setScalar(.62);sign.position.set(1.25,.12,.65);g.add(sign);
      g.add(box(.05,.75,.05,'#fff5d8',-1.55,2.42,-.92,{r:.015}),cbox(.5,.18,.06,'#e6a382',-1.37,3.06,-.92,{r:.04}));}
  }return g;
}
const insideIsland=(x,z)=>{const qx=Math.abs(x)-36,qz=Math.abs(z)-12;return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-9<-.65;};
function safeSite(town,id){const desired=id==='garden'?{x:32.4,z:8.4}:{x:39.2,z:13.5};
  const options=[];for(let z=id==='garden'?7.6:11.3;z<=(id==='garden'?11.6:17);z+=.5)for(let x=id==='garden'?29.5:31.5;x<=41;x+=.5)options.push({x,z});
  options.sort((a,b)=>Math.hypot(a.x-desired.x,a.z-desired.z)-Math.hypot(b.x-desired.x,b.z-desired.z));
  return options.find(p=>{for(let x=-2.05;x<=2.05;x+=.41)for(let z=-1.55;z<=2.3;z+=.385){const xx=p.x+x,zz=p.z+z;if(!insideIsland(xx,zz)||town.blocked(xx,zz,.4)||town.onPath(xx,zz,.5))return false;}
    return !town.inter.some(i=>Math.hypot(i.x-p.x,i.z-p.z)<3.2);
  });
}
function memoryPanel(game,id){const p=community.info(id);if(!p?.done)return null;
  return game.ui.modal(h('div',{class:'cn community-memory'},h('h2',{},p.name+' · 落成纪念'),h('p',{class:'cn-tag'},gameDate(p.finishedDay).key),h('p',{class:'say'},p.memory),h('p',{},`这项公共建设共投入 ${p.phases.reduce((sum,a)=>sum+a.cost,0).toLocaleString()} 噗灵。`),h('p',{},id==='garden'?'樱花树会跟着小镇四季换装，长椅前的通道留给每一个来访的人。':'抬头看看风向标，再望一会儿海。不需要再付钱，也不用赶着完成什么。')),{ribbon:'小镇共同记忆',cls:'live-modal'});
}
function groundCoverRecords(town,site){
  // 记录地块内野草/野花的原矩阵：施工才隐藏，清档回规划阶段时完整恢复。
  const meshes=new Set([...(town.seasons?.flowers.keys()||[]),...[...(town.seasons?.grounds||[])].filter(([,r])=>r.kind==='grass').map(([m])=>m)]);
  const local=new THREE.Matrix4(),world=new THREE.Matrix4(),records=[];
  for(const mesh of meshes){if(!mesh.isInstancedMesh)continue;mesh.updateWorldMatrix(true,false);
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,local);world.multiplyMatrices(mesh.matrixWorld,local);const x=world.elements[12],z=world.elements[14];
      if(Math.abs(x-site.x)<1.9&&Math.abs(z-site.z)<1.4)records.push({mesh,index:i,matrix:local.clone()});}
  }return records;
}
function setGroundCover(records,hidden){const zero=new THREE.Vector3(0,0,0),matrix=new THREE.Matrix4();
  for(const r of records){matrix.copy(r.matrix);if(hidden)matrix.scale(zero);r.mesh.setMatrixAt(r.index,matrix);r.mesh.instanceMatrix.needsUpdate=true;}
}
export function communityPanel(game){const body=h('div',{class:'cn community-panel'});let dialog;
  const render=()=>body.replaceChildren(h('h2',{},'一起建设小镇'),h('p',{class:'say'},'面包房之后，再为小镇留下一处花园、一处听海风的地方。可以分次出资，进度会一直保存。'),
    ...COMMUNITY_PROJECTS.map(d=>{const p=community.info(d.id),phase=p.phases[p.phase],remaining=phase?phase.cost-p.paid:0;
      const pay=(amount)=>{const result=community.fund(d.id,amount,p.phase);if(result.ok){game.ui.toast(result.done?`${p.name}建好了！去看看落成纪念吧`:`向${p.name}出资 ${result.paid} 噗灵`);render();}};
      return h('section',{class:'cn-block'+(p.done?' ok':''),'data-community-project':p.id},h('h4',{},p.name,h('em',{class:!p.unlocked?'no':''},p.done?'已落成':`${p.phase}/3 期`)),
        !p.unlocked&&h('p',{},p.require),...p.phases.map((a,i)=>h('p',{},`${i<p.phase?'✓':i===p.phase?'→':'○'} 第${i+1}期 · ${a.name} · ${a.cost.toLocaleString()} 噗灵`,h('br'),a.note)),
        p.done?h('button',{class:'btn alt sm',onclick:()=>{dialog.close(true);memoryPanel(game,p.id);}},'重看落成纪念'):
        h('div',{},h('p',{},`本期已出资 ${p.paid.toLocaleString()} / ${phase.cost.toLocaleString()} · 还需 ${remaining.toLocaleString()}`),h('div',{class:'row cn-act'},
          h('button',{class:'btn alt sm',disabled:!p.unlocked||S.coins<Math.min(100,remaining),onclick:()=>pay(100),'data-community-fund':p.id},`出资 ${Math.min(100,remaining)}`),
          h('button',{class:'btn gold sm',disabled:!p.unlocked||S.coins<remaining,onclick:()=>pay(remaining)},`完成本期 · ${remaining.toLocaleString()}`))),
        h('p',{},game.communitySites?.[p.id]?`位置：${p.id==='garden'?'小镇东侧，达达登记桌的西南边':'小镇东南海岸'}。${p.done?'走到纪念牌旁可以互动。':''}`:'规划位置正在准备。'));
    }));render();dialog=game.ui.modal(body,{ribbon:'公共建设',cls:'live-modal'});return dialog;
}
export function installCommunity(game,ui=game.ui){state();if(game.communityInstalled)return;game.communityInstalled=true;ui.communityPanel=()=>communityPanel(game);
  const town=game.town;game.communitySites={};game.communityCover={};const roots=new Map();
  for(const d of COMMUNITY_PROJECTS){const site=safeSite(town,d.id);if(!site){console.warn('公共建设暂未找到安全空位：'+d.id);continue;}game.communitySites[d.id]=site;
    game.communityCover[d.id]=groundCoverRecords(town,site);
    town.addRect(site.x-1.92,site.x+1.92,site.z-1.39,site.z+1.39,'community');
    town.inter.push({id:'community_'+d.id,x:site.x,z:site.z+2.02,r:1.8,prio:.12,label:()=>community.info(d.id).done?d.name+' · 落成纪念':d.name+' · 分期建设',act:()=>{if(community.info(d.id).done){town.act('cheer',.6);memoryPanel(game,d.id);}else communityPanel(game);}});
  }
  const rebuild=()=>{for(const d of COMMUNITY_PROJECTS){const site=game.communitySites[d.id];if(!site)continue;const phase=community.info(d.id).phase,old=roots.get(d.id);if(old?.userData.community.phase===phase)continue;
      if(old){town.seasons?.clearSubtree(old);town.scene.remove(old);disposeSceneResources(old);}setGroundCover(game.communityCover[d.id],phase>0);const root=model(d.id,phase);root.position.set(site.x,0,site.z);town.scene.add(root);roots.set(d.id,root);town.seasons?.scanTrees(root);}
  };
  rebuild();bus.on('communityChanged',rebuild);bus.on('reset',()=>{state();rebuild();});game.rebuildCommunity=rebuild;
}
