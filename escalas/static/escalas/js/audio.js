/* Salida de audio: síntesis de notas de ejemplo y metrónomo. */
import {S} from './state.js';

let ctx=null, master=null, noiseBuf=null, paused=false;
/* mientras suena un ejemplo la app no escucha, para no detectarse a sí misma */
export const audio={muteUntil:0};

export function ac(){
  if(!ctx){
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain(); master.gain.value=0.55; master.connect(ctx.destination);
    noiseBuf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*0.03),ctx.sampleRate);
    const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  }
  if(ctx.state==='suspended'&&!paused) ctx.resume();
  return ctx;
}
/* pausa congelando el reloj de audio: lo ya programado espera y sigue al reanudar */
export function pauseAudio(){ paused=true; ac().suspend(); }
export function resumeAudio(){ paused=false; ac().resume(); }
/* corta al instante todo lo ya programado (un salto en el ejemplo no debe dejar notas viejas sonando) */
export function cutAudio(){
  if(!ctx) return;
  try{master.disconnect();}catch(e){}
  master=ctx.createGain(); master.gain.value=0.55; master.connect(ctx.destination);
}
export const ctxInfo=()=>ctx?{state:ctx.state,sampleRate:ctx.sampleRate}:null;

/* si muchas notas suenan a la vez (piezas rápidas en una tableta), cada nota usa menos armónicos para no saturar el audio */
const HARMONICS=[[1,1],[2,.42],[3,.18],[4,.09],[5,.04]];
let voices=[];
export function tone(midi,t,dur){
  const c=ac(); dur=dur||0.8;
  const now=c.currentTime;
  if(t<now+0.005) t=now+0.005;   // una nota programada en el pasado (temporizador retrasado) no debe quedar muda
  voices=voices.filter(end=>end>now); voices.push(t+dur+0.6);
  const parts=HARMONICS.slice(0,voices.length>36?1:voices.length>18?2:5); const f=440*Math.pow(2,(midi-69)/12);
  const g=c.createGain(), lp=c.createBiquadFilter();
  lp.type='lowpass'; lp.frequency.value=Math.min(9000,f*7);
  g.connect(lp); lp.connect(master);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.32,t+0.006);
  g.gain.exponentialRampToValueAtTime(0.1,t+0.3);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur+0.5);
  parts.forEach(([h,amp])=>{
    const o=c.createOscillator(), og=c.createGain();
    og.gain.value=amp; o.frequency.value=f*h*(h>1?1.0015:1);
    o.connect(og); og.connect(g); o.start(t); o.stop(t+dur+0.6);
  });
  audio.muteUntil=Math.max(audio.muteUntil,t+dur+0.45);
}

function click(t,accent){
  const c=ac(), src=c.createBufferSource(), bp=c.createBiquadFilter(), g=c.createGain();
  src.buffer=noiseBuf; bp.type='bandpass'; bp.frequency.value=accent?3200:2000; bp.Q.value=3;
  g.gain.setValueAtTime(accent?0.9:0.55,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.03);
  src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
}

/* metrónomo con planificación anticipada; onBeat(i) se llama cuando suena el pulso i */
const metro={on:false,next:0,beat:0,timer:null,onBeat:null,bpm:null,beats:4,silent:false};
/* opts: {bpm, beats (por compás, para el acento), silent (sin clic)}; sin bpm usa el de los ajustes */
export function metroStart(t0,onBeat,opts={}){
  metroStop();
  Object.assign(metro,{on:true,next:t0,beat:0,onBeat,bpm:opts.bpm||null,beats:opts.beats||4,silent:!!opts.silent});
  metro.timer=setInterval(metroTick,25); metroTick();
}
function metroTick(){
  const c=ac(), bd=60/(metro.bpm||S.bpm);
  while(metro.next<c.currentTime+0.12){
    const bi=metro.beat, cb=metro.onBeat;
    if(!metro.silent) click(metro.next,bi%metro.beats===0);
    setTimeout(()=>{ if(metro.on&&cb) cb(bi); },Math.max(0,(metro.next-c.currentTime)*1000));
    metro.next+=bd; metro.beat++;
  }
}
export function metroStop(){metro.on=false;clearInterval(metro.timer);metro.timer=null;}
