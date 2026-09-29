/* Micrófono: captura, umbral de ruido adaptativo y seguimiento de notas/acordes estables.
   No conoce la página: cada página le pasa sus reacciones con configureMic(). */
import {S,app} from './state.js';
import {ac,audio} from './audio.js';
import {rms as rmsOf,yin,chromaFrom,classifyChord,pcsKey} from './dsp.js';
import {tmplLabel} from './theory.js';
import {gt,tf,tn} from './i18n.js';

const noop=()=>{};
const hooks={
  listening:()=>S.input==='mic',  // false cuando la entrada es MIDI
  mode:()=>'notes',               // 'notes' | 'chords'
  expectedChord:()=>null,         // {pcs,label} del acorde que se espera, para reconocerlo mejor
  note:noop,                      // (midi, t) nota nueva y estable
  chord:noop,                     // (pcs, t, label) acorde nuevo y estable
  hear:noop,                      // (midi|null) lo que se oye ahora
  hearLabel:noop,                 // (texto|null) acorde que se oye ahora
  tune:noop,                      // (midi|null, cents, hz) para el afinador
  chordPreview:noop,              // (pcs) acorde candidato
  level:noop, diag:noop,          // (rms, umbral) / (datos, umbral)
  error:noop, started:noop,
};
export function configureMic(h){Object.assign(hooks,h);}

let analyser=null, analyserF=null, micBuf=null, fbuf=null, wakeLock=null;
const tr={cand:null,count:0,candT:0,cur:null,silent:0,env:0,onset:false,last:0};
const cf={key:null,count:0,cur:null,silent:0};
const calib={on:false,vals:[]};
const diag={rms:0,f:0,clar:0,last:0};

export async function startMic(){
  if(app.micOn) return true;
  const c=ac();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    hooks.error(gt('Este navegador no permite usar el micrófono aquí. Abre la app en Chrome, desde una dirección https.'));
    return false;
  }
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); }
  catch(e){ hooks.error(gt('No se pudo usar el micrófono. Revisa el permiso en Chrome (ícono junto a la dirección) y vuelve a intentarlo.')); return false; }
  const src=c.createMediaStreamSource(stream);
  const hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=60;
  const lpf=c.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=2500; lpf.Q.value=0.7;
  analyser=c.createAnalyser(); analyser.fftSize=2048;
  analyserF=c.createAnalyser(); analyserF.fftSize=8192; analyserF.smoothingTimeConstant=0.3;
  src.connect(hp); hp.connect(lpf); lpf.connect(analyser); lpf.connect(analyserF);
  // salida muda: algunos navegadores no procesan nodos que no llegan al destino
  const sink=c.createGain(); sink.gain.value=0; analyser.connect(sink); analyserF.connect(sink); sink.connect(c.destination);
  try{await c.resume();}catch(e){}
  micBuf=new Float32Array(2048); fbuf=new Float32Array(analyserF.frequencyBinCount);
  app.micOn=true;
  requestWake(); hooks.started(); requestAnimationFrame(loop);
  return true;
}
async function requestWake(){try{ if('wakeLock' in navigator) wakeLock=await navigator.wakeLock.request('screen'); }catch(e){}}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&app.micOn) requestWake(); });

/* umbral de ruido adaptativo: funciona con cualquier ganancia de micrófono */
const nf={v:0,init:false};
const gateNow=()=>Math.max(2e-5,nf.v*S.sens);
function levelUpdate(buf){
  const rms=rmsOf(buf);
  if(!nf.init){nf.v=rms;nf.init=true;}
  else if(rms<nf.v) nf.v=nf.v*0.6+rms*0.4; else nf.v=Math.min(nf.v*1.003,rms);
  diag.rms=rms;
  const gate=gateNow();
  if(rms>tr.env*1.6&&rms>gate) tr.onset=true;
  tr.env=tr.env*0.75+rms*0.25;
  return {rms,gate};
}
function resetTracker(){tr.cand=null;tr.count=0;tr.onset=false;}

/* una nota cuenta cuando se oye igual en 2 cuadros seguidos; se repite solo con un nuevo ataque */
function processFrame(buf,sr,t){
  const {rms,gate}=levelUpdate(buf);
  if(!hooks.listening()||t<audio.muteUntil){resetTracker();tr.cur=null;return null;}
  const r=rms>gate*0.5?yin(buf,sr):null;
  diag.f=r?r.f:0; diag.clar=r?r.clarity:0;
  const voiced=r&&((rms>=gate&&r.clarity>=0.7)||(r.clarity>=0.9&&rms>=gate*0.5));
  if(!voiced){
    tr.silent++; tr.cand=null; tr.count=0;
    if(tr.silent===6){hooks.hear(null);hooks.tune(null);}
    if(tr.silent>6){tr.cur=null;tr.onset=false;}
    return null;
  }
  tr.silent=0;
  const mf=69+12*Math.log2(r.f/440), m=Math.round(mf);
  if(m<21||m>108) return null;
  hooks.tune(m,(mf-m)*100,r.f);
  if(m===tr.cand) tr.count++; else {tr.cand=m;tr.count=1;tr.candT=t;}
  hooks.hear(m);
  if(tr.count>=2&&(m!==tr.cur||tr.onset)){
    tr.cur=m; tr.onset=false;
    return {m,t:tr.candT-(buf.length/2/sr)-S.latency/1000};
  }
  return null;
}

function processChordFrame(buf,sr,t){
  const lv=levelUpdate(buf);
  if(!hooks.listening()||t<audio.muteUntil){cf.key=null;cf.count=0;cf.cur=null;return null;}
  if(lv.rms<lv.gate){cf.silent++;cf.key=null;cf.count=0;if(cf.silent===6)hooks.hearLabel(null);if(cf.silent>6){cf.cur=null;tr.onset=false;}return null;}
  cf.silent=0;
  analyserF.getFloatFrequencyData(fbuf);
  const exp=hooks.expectedChord();
  const r=classifyChord(chromaFrom(fbuf,sr,analyserF.fftSize),exp?exp.pcs:null);
  diag.clar=r.bs; diag.f=0;
  let res=null;
  if(exp&&r.es>0.6&&r.es>=r.bs-0.03) res={pcs:exp.pcs,label:exp.label};
  else if(r.bs>0.75) res={pcs:r.best.pcs,label:tmplLabel(r.best)};
  if(!res){cf.key=null;cf.count=0;return null;}
  hooks.hearLabel(res.label);
  const key=pcsKey(res.pcs);
  if(cf.key!==key) hooks.chordPreview(res.pcs);
  if(key===cf.key) cf.count++; else {cf.key=key;cf.count=1;}
  if(cf.count>=3&&(key!==cf.cur||tr.onset)){cf.cur=key;tr.onset=false;return {pcs:res.pcs,label:res.label,t};}
  return null;
}

function loop(){
  if(!app.micOn) return;
  requestAnimationFrame(loop);
  const now=performance.now(); if(now-tr.last<20) return; tr.last=now;
  analyser.getFloatTimeDomainData(micBuf);
  if(calib.on){calib.vals.push(rmsOf(micBuf));return;}
  const c=ac();
  if(hooks.mode()==='chords'){
    const ce=processChordFrame(micBuf,c.sampleRate,c.currentTime);
    report(now);
    if(ce) hooks.chord(ce.pcs,ce.t,ce.label);
    return;
  }
  const ev=processFrame(micBuf,c.sampleRate,c.currentTime);
  report(now);
  if(ev) hooks.note(ev.m,ev.t);
}
function report(now){
  hooks.level(diag.rms,gateNow());
  if(now-diag.last>250){diag.last=now;hooks.diag(diag,gateNow());}
}

/* mide el ruido de fondo durante 2 s de silencio */
export async function calibrate(){
  const ok=await startMic(); if(!ok) return false;
  calib.vals=[]; calib.on=true;
  await new Promise(r=>setTimeout(r,2000));
  calib.on=false;
  const v=calib.vals.slice().sort((a,b)=>a-b);
  if(v.length){nf.v=v[Math.floor(v.length*0.9)];nf.init=true;}
  return true;
}
