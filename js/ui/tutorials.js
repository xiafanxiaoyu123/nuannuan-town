// 完成进度与设备提示记录分开：读完才算已读，自动提示每个版本只展示一次。
import { S, save } from '../core/state.js';
import { TUTORIALS } from '../data.js';
import { app } from '../core/app.js';
import { h } from '../core/util.js';
import { audio } from '../core/audio.js';

export const tutorialVersion = id => TUTORIALS[id]?.version || 1;
export const tutorialRead = id => Number(S.tut?.[id] || 0) >= tutorialVersion(id);
export const tutorialAutoSkipReason = id => tutorialRead(id) ? 'read' :
  S.settings.autoTutorials === false ? 'disabled' :
  Number(S.settings.tutorialSeen?.[id] || 0) >= tutorialVersion(id) ? 'seen' : '';
export function tutorialPreferenceControl() {
  const button=h('button',{type:'button',class:'btn alt sm','data-auto-tutorials':'',onclick:()=>{
    S.settings.autoTutorials=S.settings.autoTutorials===false;save();render();
  }});
  const render=()=>{const enabled=S.settings.autoTutorials!==false;button.textContent=enabled?'自动引导：开':'自动引导：关';button.setAttribute('aria-pressed',String(enabled));};
  render();
  return h('div',{class:'tutorial-preference'},button,h('p',{class:'fine'},'每条引导只自动展示一次。关闭后仍可在「玩法帮助」中随时查看；不会重置任务或已读进度。'));
}
// 面板首次引导在原弹窗内展示；原DOM保持连接和监听，完成后恢复。
const PANEL_TUTORIALS = [
  ['.photo-shop','photoShop'],['.companion-panel','companion'],['.community-panel','community'],
  ['.piano-player','piano'],['.arch','visitors'],['.fortune','fun'],['.ach','achievements'],['.tasks','tasks'],
  ['.calendar-panel','calendar'],['.save-transfer','save'],['.controls-settings','controls'],
  ['.performance-settings','performance'],['.decor-plans','layouts'],['.home-reading','furniture'],
  ['.daily','daily'],['.book','book'],['.build','project'],['.fest','festival'],
  ['.res-hub,.res-panel','residents'],['.visit','visits'],['.milepanel','milestones'],
  ['.recycle','recycle'],['.home','expansion'],['.req','req'],['.settings','settings'],['.cn','visitors'],
];

export class TutorialManager {
  constructor(ui) { this.ui=ui;this.queue=[];this.active=null;this.timer=null; }
  context(options={}) {
    const view=app.view,zone=view===this.ui.game.town?view.zone:null,source=S;
    return {view,valid:()=>S===source&&app.view===view&&!view?.dead&&(!zone||view.zone===zone)&&
      (!options.panel||(!options.panel.veil._closed&&options.panel.veil.isConnected))&&(!options.valid||options.valid())};
  }
  request(id,force=false,options={}) {
    if(!TUTORIALS[id])return Promise.resolve({completed:true,reason:'read'});
    const ctx=this.context(options),existing=[this.active,...this.queue].find(r=>r&&r.id===id&&r.view===ctx.view&&r.panel===options.panel&&!r.finished&&this.valid(r));
    if(existing)return existing.promise;
    const skip=tutorialAutoSkipReason(id);
    if(!force&&skip)return Promise.resolve({completed:true,reason:skip});
    const r={id,force,...ctx,panel:options.panel,finished:false};
    r.promise=new Promise(resolve=>r.resolve=resolve);this.queue.push(r);this.pump();return r.promise;
  }
  attachPanel(panel,content) {
    const activity=content?.matches?.('.festival-workshop')?content:content?.querySelector?.('.festival-workshop');
    const id=activity?({sakura:'springWreath',summer:'summerDrum',harvest:'harvestBasket',snow:'winterSnowman'}[activity.dataset.festival]):PANEL_TUTORIALS.find(([selector])=>content?.matches?.(selector)||content?.querySelector?.(selector))?.[1];
    if(id)this.request(id,false,{panel});
  }
  valid(r) { try{return !!r.valid();}catch{return false;} }
  schedule() { if(!this.timer&&(this.active||this.queue.length))this.timer=setTimeout(()=>{this.timer=null;this.pump();},100); }
  pump() {
    for(const r of [...this.queue])if(!this.valid(r))this.finish(r,false,'context');
    if(this.active&&!this.valid(this.active))this.finish(this.active,false,'context');
    if(this.active){this.schedule();return;}
    const veils=[...this.ui.root.querySelectorAll(':scope > .veil')].filter(e=>!e._closed),top=veils.at(-1);
    const r=this.queue.find(r=>r.panel?top===r.panel.veil:!this.ui.modals);
    if(r&&!this.ui.irisEl?.classList.contains('closed')){
      this.queue.splice(this.queue.indexOf(r),1);
      const skip=tutorialAutoSkipReason(r.id);
      if(!r.force&&skip){this.finish(r,true,skip);return;}
      this.active=r;this.show(r);
    }
    this.schedule();
  }
  show(r) {
    let page=0;const T=TUTORIALS[r.id],body=h('div',{class:'tutbody'}),dots=h('div',{class:'tutdots'});
    const prev=h('button',{class:'btn alt sm','data-tutorial-prev':'',onclick:()=>{page--;render();audio.sfx('tab');}},'上一步');
    const next=h('button',{class:'btn','data-tutorial-next':'',onclick:()=>{audio.sfx('tab');if(page<T.pages.length-1){page++;render();}else this.finish(r,true,'complete');}});
    const later=h('button',{class:'btn alt sm','data-tutorial-later':'',onclick:()=>this.finish(r,false,'dismissed')},'先玩，稍后查看');
    const render=()=>{const p=T.pages[page];body.replaceChildren(h('div',{class:'tutnum num'},page+1),h('h3',{},p.h),h('p',{},p.p));dots.replaceChildren(...T.pages.map((_,i)=>h('i',{class:i===page?'on':''})));prev.disabled=page===0;next.textContent=page===T.pages.length-1?'知道了，开始使用':'下一步';};
    render();r.guide=h('div',{class:'tut tutorial-guide','data-tutorial':r.id},h('h2',{},T.title),body,dots,h('div',{class:'row',style:{flexWrap:'wrap',gap:'.5rem'}},prev,next,later),h('p',{class:'fine'},'本条引导不再自动重复，可在设置 → 玩法帮助中重看。'));
    if(r.panel){r.content=r.panel.content;r.display=r.content.style.display;r.content.style.display='none';r.panel.box.append(r.guide);}
    else r.modal=this.ui.modal(r.guide,{ribbon:'玩法教程',tutorial:true,onClose:()=>this.finish(r,false,'dismissed')});
    // 设备偏好在云同步时保留，避免仅看过提示就产生进度冲突。
    S.settings.tutorialSeen??={};S.settings.tutorialSeen[r.id]=tutorialVersion(r.id);save();
    next.focus({preventScroll:true});
  }
  finish(r,completed,reason) {
    if(!r||r.finished)return;r.finished=true;
    completed=completed&&this.valid(r);
    if(completed&&reason==='complete'){S.tut[r.id]=tutorialVersion(r.id);save();}
    this.queue=this.queue.filter(x=>x!==r);if(this.active===r)this.active=null;
    if(r.content)r.content.style.display=r.display;r.guide?.remove();r.modal?.close(true);
    r.resolve({completed,reason});
    if(!this.active&&!this.queue.length){clearTimeout(this.timer);this.timer=null;}
    else this.schedule();
  }
  panelClosed(panel) { for(const r of [this.active,...this.queue])if(r?.panel===panel)this.finish(r,false,'closed');this.schedule(); }
  beforeModal() { if(this.active&&!this.active.panel)this.finish(this.active,false,'interrupted'); }
  cancelAll(reason='context') { for(const r of [this.active,...this.queue])this.finish(r,false,reason);clearTimeout(this.timer);this.timer=null; }
  cancelView(view) { for(const r of [this.active,...this.queue])if(r?.view===view)this.finish(r,false,'context'); }
}
