/* Base común de las páginas de módulo: micrófono, teclado, empezar/detener, resultados y récord.
   Cada tipo de ejercicio (reading.js, melody.js, chordplay.js) solo aporta su lógica. */
import {$,readJson} from './dom.js';
import {S,save} from './state.js';
import {mod12,chordMatches} from './theory.js';
import {heldNotes} from './midiin.js';
import {setupInputSelector} from './inputsel.js';
import {ac,tone} from './audio.js';
import {startMic,configureMic} from './mic.js';
import {recordAttempt,getRecord} from './api.js';
import {renderKeys,flashKey,bindKeys} from './keyboard.js';
import {noteName} from './staff.js';
import {showLevel} from './ui.js';
import {gt,tf,tn} from './i18n.js';

export const MOD=readJson('module');
let chordTimer=null;
export const run={running:false,startedAt:0};
const kb=$('#kb');

export function setMsg(t,kind){const el=$('#cueMsg');el.textContent=t;el.dataset.kind=kind||'';}
export const setCounter=t=>{$('#counter').textContent=t;};
export const setProgress=frac=>{$('#progFill').style.width=(frac*100)+'%';};
export const hearingText=t=>{$('#hearing').innerHTML=`${gt('Oyendo:')} <b>${t??'–'}</b>`;};
export const flash=(m,cls,ms)=>flashKey(kb,m,cls,ms);
export function markKeys(midis){kb.querySelectorAll('.key').forEach(k=>k.classList.toggle('expect',midis.includes(+k.dataset.midi)));}
export const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const fmtSec=ms=>(ms/1000).toLocaleString(document.documentElement.lang||undefined,{minimumFractionDigits:1,maximumFractionDigits:1})+' s';

export function updateRecord(){
  const r=getRecord(MOD.key);
  $('#record').innerHTML=r?tn('Tu mejor ronda: <b>%(best)s</b> · %(n)s intento.','Tu mejor ronda: <b>%(best)s</b> · %(n)s intentos.',r.runs,{best:r.best+'%'}):gt('Aún no has hecho este módulo.');
}

/* termina la ronda: guarda el intento y muestra el resumen */
export function finish({accuracy,errors,timePerItem,unit,goalMs}){
  run.running=false;
  $('#startBtn').textContent=gt('Empezar');
  setProgress(1); setCounter(''); markKeys([]);
  const dur=(performance.now()-run.startedAt)/1000;
  recordAttempt({mode:'module',config_key:MOD.key,title:MOD.title,accuracy,errors,
    duration:Math.round(dur*10)/10,bpm:null,timing_ms:Math.round(timePerItem)}).then(updateRecord);
  updateRecord();
  const fluent=timePerItem<goalMs;
  const chord=unit==='acorde';
  const advice=accuracy===100&&fluent?gt('Ronda perfecta y fluida. Ya puedes pasar al siguiente módulo.')
    :accuracy===100?(chord?tf('Todo bien. Ahora intenta ir más rápido: la meta es menos de %(t)s por acorde.',{t:fmtSec(goalMs)}):tf('Todo bien. Ahora intenta ir más rápido: la meta es menos de %(t)s por nota.',{t:fmtSec(goalMs)}))
    :gt('Repite hasta acertar todo a la primera.');
  const res=$('#results');
  res.innerHTML=`<h2>${accuracy===100?gt('Ronda perfecta'):gt('Ronda completa')}</h2>
    <div class="stats">
      <div><b>${accuracy}%</b><span>${gt('a la primera')}</span></div>
      <div><b>${errors}</b><span>${gt('errores')}</span></div>
      <div><b>${fmtSec(timePerItem)}</b><span>${chord?gt('por acorde'):gt('por nota')}</span></div>
    </div><p>${advice}</p>`;
  res.hidden=false;
  setMsg(accuracy===100?gt('¡Muy bien!'):gt('Sigue practicando.'),accuracy===100?'ok':'');
}

/*
  setup({
    range:[lo,hi],              teclado en pantalla
    micMode:'notes'|'chords',
    expectedChord:()=>{pcs,label}|null,
    onStart(), onStop(),
    onNote(midi, src),          notas (micrófono o pantalla en modo notas)
    onChord(pcs, src, label),   acordes del micrófono
    onKey(midi),                tecla de pantalla (por defecto: onNote)
  })
*/
export function setup(o){
  const onKey=o.onKey||(m=>o.onNote(m,'touch'));
  configureMic({
    listening:()=>S.input!=='midi',
    mode:()=>o.micMode||'notes',
    expectedChord:o.expectedChord||(()=>null),
    note:m=>o.onNote&&o.onNote(m,'mic'),
    chord:(pcs,t,label)=>o.onChord&&o.onChord(pcs,'mic',label),
    hear:m=>hearingText(m==null?null:noteName(m)),
    hearLabel:hearingText,
    level:showLevel,
    error:msg=>setMsg(msg,'bad'),
    started:()=>{const b=$('#micBtn');b.textContent=gt('Micrófono activo');b.classList.add('live');},
  });
  $('#micBtn').onclick=()=>startMic();
  $('#startBtn').onclick=()=>{
    if(run.running){
      run.running=false; $('#startBtn').textContent=gt('Empezar'); markKeys([]);
      o.onStop&&o.onStop(); setMsg(gt('Ronda detenida.'));
      return;
    }
    ac(); run.running=true; run.startedAt=performance.now();
    $('#results').hidden=true; $('#intro').hidden=true;
    $('#startBtn').textContent=gt('Detener');
    if(S.input!=='midi') startMic();
    o.onStart();
  };
  setupInputSelector({onNoteOn:m=>{
    flash(m,'press',300);
    if(o.micMode!=='chords') return o.onNote(m,'midi');
    // acordes por MIDI: se evalúan cuando se asientan las notas; si no coinciden, un margen extra
    clearTimeout(chordTimer);
    chordTimer=setTimeout(()=>{
      if(heldNotes.size<3) return;
      const pcs=[...heldNotes].map(mod12), exp=o.expectedChord&&o.expectedChord();
      if(exp&&chordMatches(pcs,exp,'midi')) return o.onChord(pcs,'midi');
      const snap=pcs.slice().sort().join();
      chordTimer=setTimeout(()=>{const now=[...heldNotes].map(mod12);
        if(now.length>=3&&now.slice().sort().join()===snap) o.onChord(now,'midi');},350);
    },90);
  }});
  const strict=$('#strictChk');
  if(strict){strict.checked=S.strict;strict.onchange=e=>{S.strict=e.target.checked;save();};}
  renderKeys(kb,o.range[0],o.range[1]);
  bindKeys(kb,m=>{const c=ac();tone(m,c.currentTime,0.7);onKey(m);});
  updateRecord();
  setMsg(S.input==='midi'?gt('Pulsa Empezar y toca en tu teclado MIDI.')
    :gt('Pulsa Empezar y activa el micrófono. También puedes responder en el teclado de la pantalla.'));
}
