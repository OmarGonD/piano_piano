/* Punto de entrada: conecta los controles con la lógica. */
import {$} from './dom.js';
import {S,app,save} from './state.js';
import {TYPES,SCALE_TYPES} from './data.js';
import {ROOTS,letter,buildSeq,buildChords,progOptions,chordName} from './theory.js';
import {ac,tone} from './audio.js';
import {startMic,calibrate,configureMic} from './mic.js';
import {enableMidi} from './midi.js';
import {startPractice,stopPractice,hideResults,handleNote,handleChordInput,playScale,playChords,stopDemo} from './practice.js';
import * as ui from './ui.js';
import {gt,tf,tn} from './i18n.js';

configureMic({
  mode:()=>S.mode==='chords'?'chords':'notes',
  expectedChord:()=>{const c=app.cseq[app.P.running?app.P.idx:0];return c?{pcs:c.pcs,label:chordName(c)}:null;},
  note:(m,t)=>handleNote(m,t,'mic'),
  chord:(pcs,t,label)=>handleChordInput(pcs,t,'mic',label),
  hear:ui.hearing, hearLabel:ui.hearingText,
  tune:(m,cents,f)=>{ if(S.mode==='free') ui.showFree(m,cents,f); },
  chordPreview:pcs=>ui.renderPlayedStaff(pcs),
  level:ui.showLevel, diag:ui.showDiag,
  error:msg=>ui.setMsg(msg,true), started:ui.updateMicUI,
});

function rebuild(){
  stopDemo(); if(app.P.running) stopPractice(); app.P={running:false}; hideResults();
  fillProgSel(); buildSeq(); buildChords();
  ui.renderStaff(); ui.renderPlayedStaff(); ui.renderChords(); ui.renderKeyboard(); ui.refresh(); ui.updateRecord();
  if(S.mode==='free') ui.showFree(null);
}
function onChange(key){
  if(key==='notation') fillSelects();
  if(key==='input'){ ui.updateMicUI(); if(S.input==='midi') enableMidi($('#midiStatus')); else $('#midiStatus').textContent=''; ui.refresh(); return; }
  rebuild();
}

/* ---------- selectores ---------- */
function bindSeg(id,key,parse){
  const el=$(id);
  const sync=()=>el.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(String(S[key])===b.dataset.v)));
  el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S[key]=parse?parse(b.dataset.v):b.dataset.v;save();sync();onChange(key);});
  sync();
}
function fillSelects(){
  $('#rootSel').innerHTML=ROOTS.map(([l,a],i)=>`<option value="${i}">${letter(l,a)}</option>`).join('');
  $('#typeSel').innerHTML=SCALE_TYPES.map(t=>`<option value="${t.slug}">${t.name}${t.description?` (${t.description})`:''}</option>`).join('');
  $('#rootSel').value=S.root; $('#typeSel').value=S.type;
}
function fillProgSel(){
  const opts=progOptions();
  if(opts.length&&!opts.some(p=>p.id===S.prog)) S.prog=opts[0].id;
  $('#progSel').innerHTML=opts.map(p=>`<option value="${p.id}">${p.label}</option>`).join('');
  $('#progSel').value=S.prog;
}

bindSeg('#modeSeg','mode');
bindSeg('#octSeg','octaves',Number);
bindSeg('#dirSeg','dir');
bindSeg('#inputSeg','input');
bindSeg('#notSeg','notation');
bindSeg('#keySeg','keyMode');
bindSeg('#lapSeg','laps',Number);
bindSeg('#voiceSeg','voicing');
fillSelects();
$('#progSel').onchange=e=>{S.prog=e.target.value;save();rebuild();};
$('#rootSel').onchange=e=>{S.root=+e.target.value;save();rebuild();};
$('#typeSel').onchange=e=>{if(TYPES[e.target.value]){S.type=e.target.value;save();rebuild();}};
$('#startSel').value=S.startOct;
$('#startSel').onchange=e=>{S.startOct=+e.target.value;save();rebuild();};

/* ---------- metrónomo ---------- */
$('#metroChk').checked=S.metro; $('#metroOpts').hidden=!S.metro;
$('#metroChk').onchange=e=>{S.metro=e.target.checked;$('#metroOpts').hidden=!S.metro;save();if(app.P.running)stopPractice();ui.refresh();};
$('#npbSel').value=S.npb; $('#npbSel').onchange=e=>{S.npb=+e.target.value;save();};
$('#autoChk').checked=S.autoTempo; $('#autoChk').onchange=e=>{S.autoTempo=e.target.checked;save();};
$('#bpmDown').onclick=()=>{S.bpm=Math.max(30,S.bpm-4);save();ui.updateBpm();};
$('#bpmUp').onclick=()=>{S.bpm=Math.min(240,S.bpm+4);save();ui.updateBpm();};
ui.updateBpm();

/* ---------- acciones ---------- */
$('#startBtn').onclick=()=>{ if(app.P.running) stopPractice(gt('Práctica detenida.')); else { stopDemo(); startPractice(); } };
$('#listenBtn').onclick=()=>S.mode==='chords'?playChords():playScale();
$('#micBtn').onclick=async()=>{ if(S.input==='midi'){openSettings();return;} const ok=await startMic(); if(ok) ui.refresh(); };
$('#fsBtn').onclick=()=>{ const d=document.documentElement; try{ if(document.fullscreenElement) document.exitFullscreen(); else if(d.requestFullscreen) d.requestFullscreen(); }catch(e){} };

/* ---------- ajustes ---------- */
const dlg=$('#setDlg');
function openSettings(){ if(typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open',''); if(S.input==='midi') enableMidi($('#midiStatus')); }
$('#setBtn').onclick=openSettings;
const sensFromSlider=v=>6-v/100*4.6;
const sliderFromSens=f=>Math.round((6-f)/4.6*100);
$('#sensRange').value=sliderFromSens(S.sens);
$('#sensRange').oninput=e=>{S.sens=sensFromSlider(+e.target.value);save();};
$('#diagChk').checked=S.diag; $('#diag').hidden=!S.diag;
$('#diagChk').onchange=e=>{S.diag=e.target.checked;$('#diag').hidden=!S.diag;save();};
$('#strictChk').checked=S.strict; $('#strictChk').onchange=e=>{S.strict=e.target.checked;save();ui.updateRecord();};
$('#latRange').value=S.latency; $('#latOut').textContent=S.latency+' ms';
$('#latRange').oninput=e=>{S.latency=+e.target.value;$('#latOut').textContent=S.latency+' ms';save();};
$('#calBtn').onclick=async()=>{
  $('#calTxt').textContent=gt('Silencio 2 segundos…');
  const ok=await calibrate();
  $('#calTxt').textContent=ok?gt('Listo, ruido de fondo medido.'):gt('Primero activa el micrófono.');
  ui.updateMicUI();
};

/* ---------- teclado en pantalla ---------- */
$('#kb').addEventListener('pointerdown',e=>{
  const k=e.target.closest('.key'); if(!k) return; e.preventDefault();
  const m=+k.dataset.midi, c=ac();
  tone(m,c.currentTime,0.7);
  handleNote(m,c.currentTime,'touch');
});

/* ---------- inicio ---------- */
if(!SCALE_TYPES.length){
  ui.setMsg(gt('No hay escalas activas. Agrégalas desde el admin de Django.'),true);
}else{
  rebuild(); ui.updateMicUI();
  if(S.input==='midi') enableMidi($('#midiStatus'));
}
