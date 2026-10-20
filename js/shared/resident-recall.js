// 普通主动交谈只读已经收好的真实记录；不推进日常、不补领、不新增计数。
import { CROP, FRUIT } from './farming.js';
import { FISH } from './fish-catalog.js';
import { gameDate } from './calendar.js';
import { fieldNotesError, fieldPlanError } from './resident-fieldwork.js';
import { fishingNotesError, fishingJournalError } from './fishing-journal.js';
import { performanceMetadataError } from './resident-performance.js';

const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const first = (values, valid) => Array.isArray(values) ? values.slice(0, 7).find(valid) : null;
const plantName = id => (CROP[id] || FRUIT[id])?.name;
function fieldMemory(note) {
  const name=plantName(note.result.plantId);
  if(note.route==='ripe')return `你选来写手记的${name}，我记着呢。那次亲手收下${note.result.kind==='decor'?'巨大'+name:name} ×${note.result.count}${note.result.kind==='decor'?'，收进了摆件仓库。':'。'}`;
  return note.route==='empty'?`那页${name}手记，是你从空田开始、亲手种下又浇水的。我还记得。`:`你选了那株缺水的${name}，亲手浇水后少等了约 ${note.result.savedSeconds} 秒。这就是那天的手记。`;
}
function fishMemory(note) {
  const sample=note.catch,name=FISH.find(f=>f.id===sample.fishId).name;
  const choice=!sample.treasureSeen?'那竿没遇见宝箱，鱼本身就是见闻。':sample.decision==='skip'?'看见箱子后，你选了专心收鱼。':sample.decision==='try'?sample.treasureGot?'你决定试着捞宝，把鱼和箱子都带回来了。':'你试着捞宝；箱子没带回，鱼收好了。':sample.treasureGot?'顺带带回了箱子，那竿没有另作取舍。':'水下有过箱子，那竿没有另作取舍。';
  return `你特意留下的${name}，我记着。${choice}${sample.momoAssisted?'大喵也帮你稳住了一段。':''}`;
}
function validPoem(poem) {
  return plain(poem)&&typeof poem.day==='string'&&Array.isArray(poem.lines)&&poem.lines.length>0&&poem.lines.length<=8&&Array.from(poem.lines).every(line=>typeof line==='string'&&line.length>0&&line.length<=120)&&!performanceMetadataError(poem);
}
function nextLine(id,resident,day) {
  const task=resident.day===day?resident.tasks?.[id]:null;
  if(id==='he'){
    if(task?.claimed)return '今天的手记已经收好了。小镇下个清晨 5 点，再挑一块你想观察的田吧。';
    if(task?.plan&&!fieldPlanError(task.plan))return task.plan.phase==='done'?'这次田里的动作已经记下，去我的「居民日常」收好这页反馈吧。':'这次选中的田还在手记里。打开我的「居民日常」看位置；植物变了，也可以重新选。';
    if(task)return '今天接下的巡田还没收好，去我的「居民日常」看看已有的步骤吧。';
    return '下一页想先看缺水的植物，还是眼前的成熟？在我的「居民日常」里，由你挑一块田。';
  }
  if(id==='shi'){
    if(task?.claimed)return '今天选中的鱼讯已经收好了。下个小镇清晨 5 点，再选留意收线，还是水下见闻。';
    if(task?.journal&&!fishingJournalError(task.journal))return task.journal.catches.length===2?'今天两条鱼的见闻都在，去我的「居民日常」选一条最想留下的；还没替你选。':`今天的鱼讯记了 ${task.journal.catches.length}/2 条。去钓场接着观察，成功收回的鱼才会留下来。`;
    if(task)return '先完成今天接下的鱼讯吧，已有步骤在我的「居民日常」里。';
    return '下次想留意收线，还是看看水下？在我的「居民日常」选好方向，再去钓场试一竿。';
  }
  return resident.performed===day?'今天收藏的那一句还在。想再听时，可以在我的「居民日常」重听，不会替换原来的诗签。':'想静静听，还是轻敲三句、再挑一个结尾？我的「居民日常」里，两种都可以。';
}
export function residentRecall(state,id,options={}) {
  if(!plain(state)||!['he','shi','qi'].includes(id)||!plain(options))return null;
  const resident=state.live?.residents;if(!plain(resident))return null;
  let memory,key;
  if(id==='he'){
    const note=first(resident.fieldNotes,note=>!fieldNotesError([note]));if(!note)return null;
    memory=fieldMemory(note);key=`he:${note.day}:${note.route}:${note.target.plotKey}:${note.result.plantId}`;
  }else if(id==='shi'){
    const note=first(resident.fishingNotes,note=>!fishingNotesError([note]));if(!note)return null;
    memory=fishMemory(note);key=`shi:${note.day}:${note.focus}:${note.catch.fishId}:${note.catch.decision}`;
  }else{
    const poem=first(resident.poems,validPoem);if(!poem)return null;
    const ending=poem.lines.at(-1),excerpt=ending.length>32?ending.slice(0,31)+'…':ending;
    memory=poem.performance?.mode==='echo'?`你选的末句「${excerpt}」，我还记得。下一次的结尾，也留给你来挑。`:`我们一起留下的「${excerpt}」，还在那张诗签里。`;
    key=`qi:${poem.day}:${ending}`;
  }
  const day=typeof options.day==='string'?options.day:gameDate(state.gday||0).key,lastLine=options.lastLine??state.npc?.[id]?.last;
  const next=nextLine(id,resident,day);
  if(lastLine===next)return null;
  return lastLine===memory?{kind:'next',key,text:next,pose:'wave',life:6.5}:{kind:'memory',key,text:memory,pose:'wave',life:6.5};
}
