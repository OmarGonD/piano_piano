/* Lógica de práctica: compara lo que se toca con lo esperado y calcula el resultado. */
import {$} from './dom.js';
import {S,app,save,recKey} from './state.js';
import {mod12,spellMidi,scaleTitle,chordName,keyTitle,describePcs,chordMatches} from './theory.js';
import {pcsKey} from './dsp.js';
import {ac,tone,metroStart,metroStop} from './audio.js';
import {recordAttempt} from './api.js';
import {startMic} from './mic.js';
import * as ui from './ui.js';
import {gt,tf,tn} from './i18n.js';

const matches=(m,n)=>S.strict?m===n.midi:mod12(m-n.midi)===0;

export function startPractice(){
  const c=ac(); hideResults();
  const P=app.P={running:true,idx:0,errs:new Set(),errCount:0,dev:[],lastOk:null,lastWrong:null,startT:null,gridT0:null,iv:60/S.bpm/S.npb,countIn:false};
  if(S.metro){
    const t0=c.currentTime+0.15; metroStart(t0,pulse); $('#beats').hidden=false;
    P.gridT0=t0+4*60/S.bpm; P.startT=P.gridT0; P.countIn=true;
    setTimeout(()=>{P.countIn=false;},(P.gridT0-c.currentTime)*1000);
  }
  if(S.input==='mic'&&!app.micOn) startMic();
  $('#startBtn').textContent=gt('Detener');
  ui.refresh();
}
export function stopPractice(msg){
  app.P.running=false; metroStop(); ui.renderBeats(-1); $('#beats').hidden=!S.metro;
  $('#startBtn').textContent=gt('Empezar');
  ui.refresh(); if(msg) ui.setMsg(msg);
}
function pulse(bi){
  ui.renderBeats(bi%4);
  const P=app.P;
  if(P.running&&P.countIn&&bi<4) ui.setMsg(bi<3?tf('Cuenta: %(n)s…',{n:bi+1}):gt('4… ¡ahora!'));
}
export function hideResults(){app.resultsShown=false;$('#results').hidden=true;}

function showResults(title,stats,extra){
  const res=$('#results');
  res.innerHTML=`<h2>${title}</h2>
    <div class="stats">${stats.map(([v,l])=>`<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>${extra||''}
    <div class="actions" style="margin-top:12px"><button class="btn primary" id="againBtn">${gt('Repetir')}</button></div>`;
  app.resultsShown=true; res.hidden=false;
  $('#againBtn').onclick=()=>startPractice();
}
const fmtSec=s=>s.toLocaleString(document.documentElement.lang||undefined,{minimumFractionDigits:1,maximumFractionDigits:1})+' s';

function saveAttempt(title,pct,dur,timing){
  recordAttempt({mode:S.mode,config_key:recKey(),title,accuracy:pct,errors:app.P.errCount,
    duration:Math.round(dur*10)/10,bpm:S.metro?S.bpm:null,timing_ms:timing}).then(ui.updateRecord);
  ui.updateRecord();
}

/* ---------- escalas ---------- */
export function handleNote(m,t,src){
  ui.flashKey(m, S.mode==='chords'?'press':'hit-ok');
  if(S.mode==='chords'){ if(src==='touch') touchChord(m,t); return; }
  if(S.mode==='free'){ if(src!=='mic') ui.showFree(m,0,null); return; }
  let P=app.P;
  ui.renderPlayedStaff([],[m],matches(m,app.seq[P.running?P.idx:0])?'correct':'wrong');
  if(!P.running){
    if(!S.metro&&matches(m,app.seq[0])){ startPractice(); P=app.P; }
    else return;
  }
  const exp=app.seq[P.idx];
  if(matches(m,exp)){
    if(P.idx===0&&!S.metro) P.startT=t;
    if(S.metro&&P.gridT0!=null) P.dev.push((t-(P.gridT0+P.idx*P.iv))*1000);
    P.lastOk=m; P.idx++;
    if(P.idx>=app.seq.length) finish(t); else ui.refresh();
  }else{
    // el micrófono puede volver a oír la nota anterior al sostenerla: no es error
    if(P.lastOk!=null&&mod12(m-P.lastOk)===0) return;
    if(P.lastWrong&&P.lastWrong.m===m&&t-P.lastWrong.t<1.2) return;
    P.lastWrong={m,t}; P.errCount++; P.errs.add(P.idx);
    ui.flashKey(m,'hit-bad');
    const got=spellMidi(m), want=spellMidi(exp.midi);
    ui.refresh();
    ui.setMsg(tf('Sonó %(got)s. Busca %(want)s.',{got:got.name+got.oct,want:want.name+want.oct}),true);
  }
}
function finish(t){
  const P=app.P, n=app.seq.length, pct=Math.round((n-P.errs.size)/n*100);
  const dur=Math.max(0,t-(P.startT==null?t:P.startT));
  let timing='', avgAbs=null;
  if(S.metro&&P.dev.length){
    const avg=P.dev.reduce((a,b)=>a+b,0)/P.dev.length;
    avgAbs=P.dev.reduce((a,b)=>a+Math.abs(b),0)/P.dev.length;
    const trend=avg>25?gt('Tiendes a ir atrasado respecto al pulso.'):avg<-25?gt('Tiendes a adelantarte al pulso.'):gt('Vas centrado en el pulso.');
    timing=`<p>${tf('%(trend)s Desvío medio: %(ms)s ms.',{trend,ms:Math.round(avgAbs)})}</p>`;
  }
  const bpmUsed=S.bpm;
  saveAttempt(scaleTitle(),pct,dur,avgAbs==null?null:Math.round(avgAbs));
  let tempoMsg='';
  if(S.metro&&S.autoTempo&&pct===100&&avgAbs!=null&&avgAbs<70){
    S.bpm=Math.min(240,S.bpm+4); save(); ui.updateBpm();
    tempoMsg=`<p>${tf('Pasada limpia y a tiempo. Tempo subido a %(bpm)s BPM.',{bpm:S.bpm})}</p>`;
  }
  stopPractice();
  showResults(pct===100?gt('Escala limpia'):gt('Escala completa'),
    [[pct+'%',gt('notas sin error')],[P.errCount,gt('notas equivocadas')],[fmtSec(dur),gt('duración')]].concat(S.metro?[[bpmUsed,'BPM']]:[]),
    timing+tempoMsg);
  ui.markStaff();
  ui.setMsg(pct===100?gt('Muy bien. Repite o cambia de escala.'):gt('Repasa las notas en rojo del pentagrama y vuelve a intentarlo.'));
}

/* ---------- círculo armónico ---------- */
export function handleChordInput(pcs,t,src,label,midis){
  if(S.mode!=='chords') return;
  let P=app.P;
  ui.renderPlayedStaff(pcs,midis,chordMatches(pcs,app.cseq[P.running?P.idx:0],src)?'correct':'wrong');
  if(!P.running){ if(!S.metro&&chordMatches(pcs,app.cseq[0],src)){ startPractice(); P=app.P; } else return; }
  const exp=app.cseq[P.idx];
  if(chordMatches(pcs,exp,src)){
    if(P.idx===0&&!S.metro) P.startT=t;
    P.lastOk=pcsKey(pcs); P.idx++;
    exp.voice.concat([exp.bass]).forEach(m=>ui.flashKey(m,'hit-ok',500));
    if(P.idx>=app.cseq.length) finishChords(t); else ui.refresh();
  }else{
    const k=pcsKey(pcs);
    if(P.lastOk===k) return;
    if(P.lastWrong&&P.lastWrong.k===k&&t-P.lastWrong.t<1.5) return;
    P.lastWrong={k,t}; P.errCount++; P.errs.add(P.idx);
    ui.refresh();
    (midis||[]).forEach(m=>ui.flashKey(m,'hit-bad',700));
    ui.setMsg(tf('Sonó %(got)s. Busca %(want)s.',{got:label||describePcs(pcs),want:chordName(exp)}),true);
  }
}
function finishChords(t){
  const P=app.P, n=app.cseq.length, pct=Math.round((n-P.errs.size)/n*100), dur=Math.max(0,t-(P.startT==null?t:P.startT));
  saveAttempt(`${keyTitle()} · ${S.prog}`,pct,dur,null);
  stopPractice();
  showResults(pct===100?gt('Círculo limpio'):gt('Círculo completo'),
    [[pct+'%',gt('acordes sin error')],[P.errCount,gt('acordes equivocados')],[fmtSec(dur),gt('duración')]].concat(S.metro?[[S.bpm,'BPM']]:[]));
  ui.markChords(); ui.updateKeys();
  ui.setMsg(pct===100?gt('Muy bien. Repite, cambia de tonalidad o prueba otro círculo.'):gt('Repasa los acordes en rojo y vuelve a intentarlo.'));
}
/* acordes tocados en la pantalla: se juntan las notas de los últimos ~2 s */
let touchBuf=[];
function touchChord(m,t){
  touchBuf=touchBuf.filter(x=>t-x.t<1.8); touchBuf.push({m,t});
  const pcs=[...new Set(touchBuf.map(x=>mod12(x.m)))], exp=app.cseq[app.P.running?app.P.idx:0];
  ui.renderPlayedStaff(pcs,touchBuf.map(x=>x.m));
  if(chordMatches(pcs,exp,'touch')||pcs.length>=exp.pcs.length){const ms=touchBuf.map(x=>x.m);touchBuf=[];handleChordInput(pcs,t,'touch',null,ms);}
}

/* ---------- ejemplos para escuchar ---------- */
let demoTimers=[];
export function stopDemo(){demoTimers.forEach(clearTimeout);demoTimers=[];}
function playDemo(items,iv,notesOf,durOf,msg){
  const c=ac(); stopDemo(); if(app.P.running) stopPractice();
  const t0=c.currentTime+0.1;
  items.forEach((it,i)=>{
    notesOf(it).forEach(m=>tone(m,t0+i*iv,durOf(iv)));
    demoTimers.push(setTimeout(()=>notesOf(it).forEach(m=>ui.flashKey(m,'demo',iv*900)),(t0+i*iv-c.currentTime)*1000));
  });
  ui.setMsg(msg);
  demoTimers.push(setTimeout(()=>ui.refresh(),(t0+items.length*iv-c.currentTime)*1000+400));
}
export function playScale(){
  playDemo(app.seq,S.metro?60/S.bpm/S.npb:0.42,n=>[n.midi],iv=>Math.max(0.35,iv*1.1),
    gt('Escuchando. La app no detecta notas mientras suena el ejemplo.'));
}
export function playChords(){
  playDemo(app.cseq,S.metro?4*60/S.bpm:1.3,ch=>ch.voice.concat([ch.bass]),iv=>iv*0.95,
    gt('Escuchando. La app no detecta acordes mientras suena el ejemplo.'));
}
