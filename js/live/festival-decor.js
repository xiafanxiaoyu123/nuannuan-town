// 节日布景只按小镇日历存在；所有临时模型、动画、碰撞与独占资源成组撤除。
import { THREE, disposeSceneResources } from '../core/kit.js';
import { S, bus } from '../core/state.js';
import { live } from './api.js';
import { festivalScene, festivalTreeOrnaments, festivalGarland } from './props.js';
import { festivalBanner } from './panels.js';
import { festivalDialogue } from './festival-dialogue.js';
import { bakeFestival } from './festival-batch.js';
import { FESTIVAL_ACTIVITIES, openFestivalActivity, festivalCompleted } from './festival-events.js';

const POSTS=[[-.6,-2.4],[12.6,-2.4],[12.6,10.4],[-.6,10.4]];
const RADIUS=2.1;
function safeSites(town){
  const chosen=[],candidates=[];
  for(let z=-5;z<=16;z+=.5)for(let x=-11;x<=30;x+=.5){
    const distance=Math.hypot(x-6,z-4);if(distance<8.1||distance>23)continue;
    // 留出人物半径与道路边缘，不用布景取代已有树木、长椅或互动入口。
    if(town.blocked(x,z,RADIUS+.45)||town.onPath(x,z,RADIUS+.4)||town.inLot(x,z,RADIUS+.5))continue;
    if(town.inter.some(i=>Math.hypot(i.x-x,i.z-z)<Math.max(2.8,(i.r||1)+RADIUS+.35)))continue;
    if(town.zone==='town'&&Math.hypot(town.pos.x-x,town.pos.z-z)<RADIUS+.7)continue;
    const approaches=Array.from({length:8},(_,i)=>({x:x+Math.sin(i*Math.PI/4)*(RADIUS+.65),z:z+Math.cos(i*Math.PI/4)*(RADIUS+.65)}));
    const approach=approaches.find(p=>!town.blocked(p.x,p.z,.45));if(!approach)continue;
    candidates.push({x,z,approach});
  }
  for(const desired of [{x:-3,z:12},{x:15,z:12}]){
    candidates.sort((a,b)=>Math.hypot(a.x-desired.x,a.z-desired.z)-Math.hypot(b.x-desired.x,b.z-desired.z));
    const p=candidates.find(p=>chosen.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>RADIUS*2+1));if(p)chosen.push(p);
  }return chosen;
}

export function installFestivalDecor(game,ui=game.ui){
  if(game.festivalDecor)return game.festivalDecor;
  const town=game.town;let root=null,banner=null,id=null,source=null,disposed=false,activity=null;let circles=[],interactions=[];
  const greetings=()=>{for(const el of document.querySelectorAll('[data-festival-speaker]')){const line=festivalDialogue(el.dataset.festivalSpeaker);el.textContent=line?'「'+line+'」':'';el.hidden=!line;}};
  const completed=()=>{root?.traverse(o=>{if(o.name==='festival-completed')o.visible=festivalCompleted(id);});};
  const clear=()=>{
    activity?.close();activity=null;
    if(root){
      town.ticks=town.ticks.filter(fn=>fn!==root.userData.tick);
      town.seasons?.clearSubtree(root);town.scene.remove(root);
      if(root.userData.bakedSources)root.add(root.userData.bakedSources);
      disposeSceneResources(root);root=null;
    }
    if(circles.length){const old=new Set(circles);town.circles=town.circles.filter(c=>!old.has(c));circles=[];}
    if(interactions.length){const old=new Set(interactions);town.inter=town.inter.filter(i=>!old.has(i));interactions=[];}
    banner?.remove();banner=null;id=null;
    town.renderOptimizer?.invalidateBounds();
  };
  const refresh=(force=false)=>{
    if(disposed)return;
    const festival=live.festival(),next=festival?.id||'';
    greetings();
    // 导入/读档会替换 S；即使新旧档恰好在同一节日，也不能沿用失效的模型缓存。
    if(!force&&next===id&&source===S&&(!root||root.parent===town.scene)){completed();return;}
    clear();id=next;source=S;if(!festival)return;
    root=new THREE.Group();root.name='live-festival';root.userData.festival=next;root.userData.sites=[];
    for(let i=0;i<POSTS.length;i++){
      const [x0,z0]=POSTS[i],[x1,z1]=POSTS[(i+1)%POSTS.length];
      root.add(festivalGarland(x0,z0,x1,z1,next));
    }
    const sites=safeSites(town);
    for(let i=0;i<sites.length;i++){
      const p=sites[i],display=festivalScene(next,i?FESTIVAL_ACTIVITIES[next].scene.split('与')[1]:FESTIVAL_ACTIVITIES[next].title,i);display.position.set(p.x,0,p.z);root.add(display);
      const collision={x:p.x,z:p.z,r:RADIUS,tag:'festival'};town.circles.push(collision);circles.push(collision);root.userData.sites.push({...p,r:RADIUS});
      const interaction={id:'festival_'+i,x:p.approach.x,z:p.approach.z,r:1.9,prio:.2,zone:'town',label:()=>FESTIVAL_ACTIVITIES[next].title+(festivalCompleted(next)?' · 今日已留念':''),sub:FESTIVAL_ACTIVITIES[next].host+'邀你 · 一起完成三步小聚',act:()=>{activity?.close();activity=openFestivalActivity(game,next,p,completed);return activity;}};
      town.inter.push(interaction);interactions.push(interaction);
    }
    const trees=(town.trees||[]).filter(t=>Math.hypot(t.x-6,t.z-4)<22).sort((a,b)=>Math.hypot(a.x-6,a.z-4)-Math.hypot(b.x-6,b.z-4)).slice(0,7);
    for(const tree of trees){const ornaments=festivalTreeOrnaments(next);ornaments.position.set(tree.x,0,tree.z);root.add(ornaments);}
    root.userData.treeOrnaments=trees.length;bakeFestival(root);completed();
    town.scene.add(root);town.seasons?.scanTrees(root);town.renderOptimizer?.invalidateBounds();
    banner=festivalBanner(festival);ui.hud.querySelector('.hud-tl').append(banner);
  };
  const offDay=bus.on('newDay',()=>{activity?.close();activity=null;refresh();}),offReset=bus.on('reset',()=>refresh(true)),offMemory=bus.on('festivalMemory',completed);
  game.festivalDecor={refresh,clear,get root(){return root;},get id(){return id;},get activity(){return activity;},dispose(){if(disposed)return;disposed=true;clear();source=null;offDay();offReset();offMemory();delete game.festivalDecor;}};
  refresh();return game.festivalDecor;
}
