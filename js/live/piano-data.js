// 三排七音：音域C3–B5，中央C为C4（261.63Hz），完全由本地WebAudio合成。
const STEPS = [0, 2, 4, 5, 7, 9, 11], NAMES = ['C','D','E','F','G','A','B'];
const SOLFEGE = ['Do','Re','Mi','Fa','Sol','La','Si'];
export const PIANO_ROWS = Object.freeze([
  {label:'高音',octave:5,keys:'QWERTYU'},
  {label:'中音',octave:4,keys:'ASDFGHJ'},
  {label:'低音',octave:3,keys:'ZXCVBNM'},
].map(row => Object.freeze({...row, notes:Object.freeze([...row.keys].map((key,i)=>{
  const midi=(row.octave+1)*12+STEPS[i];
  return Object.freeze({key,code:'Key'+key,midi,hz:440*Math.pow(2,(midi-69)/12),name:NAMES[i]+row.octave,solfege:SOLFEGE[i],degree:i+1,octave:row.octave});
}))})));
export const PIANO_NOTES=Object.freeze(PIANO_ROWS.flatMap(row=>row.notes));
export const pianoNote=code=>PIANO_NOTES.find(note=>note.code===code)||null;
