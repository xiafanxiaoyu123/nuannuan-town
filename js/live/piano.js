import { audio } from '../core/audio.js';
import { app } from '../core/app.js';
import { bus } from '../core/state.js';
import { h } from '../core/util.js';
import { PIANO_ROWS, pianoNote } from './piano-data.js';

// 每个音只有4个渐弱泛音，同时最多16个音；关闭面板/失焦立即回收全部声音节点。
export class PianoVoices {
  constructor(ctx,output){this.ctx=ctx;this.output=output;this.voices=new Map();this.disposed=false;}
  start(note){
    if(this.disposed||!note)return false;
    this.voices.get(note.code)?.stop();
    if(this.voices.size>=16)this.voices.values().next().value.stop();
    const ctx=this.ctx,now=ctx.currentTime,envelope=ctx.createGain(),parts=[];
    envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(.21,now+.006);envelope.connect(this.output);
    let finished=0,stopped=false,released=false;
    const cleanup=()=>{if(++finished<parts.length)return;envelope.disconnect();if(this.voices.get(note.code)===voice)this.voices.delete(note.code);};
    const voice={note,release:()=>{
      if(stopped||released)return;released=true;const t=ctx.currentTime;
      if(envelope.gain.cancelAndHoldAtTime)envelope.gain.cancelAndHoldAtTime(t);else{envelope.gain.cancelScheduledValues(t);envelope.gain.setValueAtTime(.21,t);}
      envelope.gain.exponentialRampToValueAtTime(.0001,t+.19);
      for(const {osc}of parts)try{osc.stop(t+.22);}catch{}
    },stop:()=>{
      if(stopped)return;stopped=true;envelope.gain.cancelScheduledValues(ctx.currentTime);envelope.gain.setValueAtTime(0,ctx.currentTime);
      for(const {osc,gain}of parts){try{osc.stop();}catch{}osc.disconnect();gain.disconnect();}
      envelope.disconnect();if(this.voices.get(note.code)===voice)this.voices.delete(note.code);
    }};
    for(const [harmonic,level,decay]of [[1,1,3.8],[2,.3,1.65],[3,.11,.8],[4,.045,.32]]){
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(note.hz*harmonic,now);
      gain.gain.setValueAtTime(level,now);gain.gain.exponentialRampToValueAtTime(.0001,now+decay);
      osc.connect(gain).connect(envelope);parts.push({osc,gain});osc.onended=()=>{osc.disconnect();gain.disconnect();cleanup();};
    }
    this.voices.set(note.code,voice);for(const {osc}of parts){osc.start(now);osc.stop(now+4.1);}return true;
  }
  release(code){this.voices.get(code)?.release();}
  clear(){for(const voice of [...this.voices.values()])voice.stop();}
  dispose(){this.clear();this.disposed=true;}
}

export function openPiano(game,rec,isPresent=()=>true){
  if(game.pianoSession||app.view!==game.town||!['house','build'].includes(game.town.zone)||game.busy||game.town.decor.active||game.town.photoOn||!isPresent())return null;
  const ui=game.ui,town=game.town,wasPaused=audio.musicPaused,musicMode=audio.mode;
  const zone=town.zone;
  audio.init();audio.pauseMusic();town.keys.clear();town.stick.x=town.stick.y=0;town.moveTo=null;
  const voices=audio.ctx?new PianoVoices(audio.ctx,audio.sfxBus):null;
  const abort=new AbortController(),buttons=new Map(),held=new Map(),pointers=new Map(),offs=[];
  let dialog,closed=false,latch=false,space=false,poseTimer;
  const body=h('div',{class:'piano-player'},h('div',{class:'piano-title'},h('div',{},h('h2',{},'小屋钢琴'),h('p',{},'三排七音 · 点琴键，或按对应字母'))));
  const status=h('p',{class:'piano-status','aria-live':'polite'},voices?'从任意一颗琴键开始吧':'这个浏览器暂不支持音频，请换一个浏览器试试');
  const active=()=>!closed&&app.view===town&&town.zone===zone&&isPresent()&&body.style.display!=='none'&&!dialog?.box.querySelector('.tutorial-guide');
  const pedal=()=>latch||space;
  const refreshPedal=()=>{sustain.setAttribute('aria-pressed',String(pedal()));sustain.textContent=pedal()?'延音：开':'延音：关';if(!pedal())for(const code of voices?.voices.keys()||[])if(!held.has(code))voices.release(code);};
  const release=(code,source)=>{
    const sources=held.get(code);if(!sources)return;sources.delete(source);if(sources.size)return;
    held.delete(code);buttons.get(code)?.setAttribute('aria-pressed','false');if(!pedal())voices?.release(code);
  };
  const releaseAll=()=>{held.clear();pointers.clear();space=false;for(const button of buttons.values())button.setAttribute('aria-pressed','false');voices?.clear();refreshPedal();clearTimeout(poseTimer);town.player.setPose('idle');};
  const press=(code,source)=>{
    const note=pianoNote(code);if(!note||!active()||!voices)return false;
    audio.init();let sources=held.get(code);if(sources?.has(source))return false;
    if(!sources){sources=new Set();held.set(code,sources);voices.start(note);}
    sources.add(source);buttons.get(code)?.setAttribute('aria-pressed','true');status.textContent=`${note.name} · ${note.solfege} · ${note.hz.toFixed(1)} Hz`;
    town.player.setPose('work');clearTimeout(poseTimer);poseTimer=setTimeout(()=>{if(!closed)town.player.setPose('idle');},260);return true;
  };
  const rows=h('div',{class:'piano-rows'});
  for(const row of PIANO_ROWS){
    const keys=h('div',{class:'piano-keys',role:'group','aria-label':row.label});
    for(const note of row.notes){
      const button=h('button',{class:'piano-key','data-piano-key':note.code,'aria-label':`${row.label}${note.name}，${note.solfege}，键盘${note.key}`,'aria-pressed':'false',type:'button'},
        h('span',{class:'piano-degree'},note.degree),h('span',{class:'piano-note-name'},note.name),h('kbd',{},note.key));
      buttons.set(note.code,button);
      button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();if(press(note.code,'pointer:'+e.pointerId)){pointers.set(e.pointerId,note.code);try{button.setPointerCapture(e.pointerId);}catch{}}});
      const end=e=>{const code=pointers.get(e.pointerId);if(!code)return;pointers.delete(e.pointerId);release(code,'pointer:'+e.pointerId);};
      button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
      // 键盘焦点下的Enter/空格click也能奏响，避免只支持指针而漏掉辅助输入。
      button.addEventListener('click',e=>{if(e.detail===0&&press(note.code,'accessibility'))release(note.code,'accessibility');});
      keys.append(button);
    }
    rows.append(h('section',{class:'piano-row'},h('div',{class:'piano-row-label'},h('b',{},row.label),h('span',{},`C${row.octave}—B${row.octave}`)),keys));
  }
  const sustain=h('button',{class:'btn alt sm','data-piano-sustain':'','aria-pressed':'false',onclick:()=>{if(!active())return;latch=!latch;refreshPedal();}},'延音：关');
  body.append(rows,status,h('div',{class:'piano-actions'},sustain,h('button',{class:'btn alt sm','data-piano-stop':'',onclick:()=>{releaseAll();status.textContent='声音已停止，随时可以继续弹';}},'全部止音'),h('button',{class:'btn sm','data-piano-close':'',onclick:()=>dialog.close()},'离开钢琴')),
    h('p',{class:'piano-hint'},'上排 Q W E R T Y U · 中排 A S D F G H J · 下排 Z X C V B N M。支持同时按多个音；按住空格使用延音踏板。'));
  const endKey=e=>{if(e.code==='Space'){space=false;refreshPedal();}release(e.code,'keyboard');};
  window.addEventListener('keydown',e=>{
    if(!active()||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName))return;
    if(e.code!=='Space'&&!pianoNote(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
    if(e.code==='Space'){space=true;refreshPedal();}else press(e.code,'keyboard');
  },{capture:true,signal:abort.signal});
  window.addEventListener('keyup',e=>{if((e.code==='Space'&&space)||held.get(e.code)?.has('keyboard')){endKey(e);if(!closed){e.preventDefault();e.stopImmediatePropagation();}}},{capture:true,signal:abort.signal});
  window.addEventListener('blur',releaseAll,{signal:abort.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();},{signal:abort.signal});
  const close=()=>{
    if(closed)return;closed=true;releaseAll();voices?.dispose();abort.abort();offs.forEach(off=>off());clearInterval(contextTimer);
    if(game.pianoSession===session)delete game.pianoSession;
    if(!wasPaused&&audio.mode===musicMode&&!app.suspended)audio.resumeMusic();
  };
  dialog=ui.modal(body,{ribbon:'自由弹奏',cls:'piano-modal',onClose:close});
  const session={press,release,releaseAll,close:()=>dialog.close(true),voices,body,get held(){return held;},get closed(){return closed;}};
  game.pianoSession=session;
  for(const event of ['zoneChanged','reset','decorMode'])offs.push(bus.on(event,()=>dialog.close(true)));
  offs.push(bus.on('decorChanged',()=>{if(!isPresent())dialog.close(true);}));
  const contextTimer=setInterval(()=>{if(app.view!==town||town.zone!==zone||!isPresent())dialog.close(true);},100);
  return session;
}
