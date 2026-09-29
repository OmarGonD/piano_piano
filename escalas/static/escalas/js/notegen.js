/* Generación de notas y frases al azar para los ejercicios de lectura. Cada nota es {midi, l, a}. */
import {NAT,mod12,isBlack} from './theory.js';

const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const natural=m=>({midi:m,l:NAT.indexOf(mod12(m)),a:0});

export function naturalsIn(lo,hi){
  const out=[]; for(let m=lo;m<=hi;m++) if(!isBlack(m)) out.push(natural(m));
  return out;
}

/* ♯ solo sobre Do Re Fa Sol La y ♭ solo sobre Re Mi Sol La Si: evita Mi♯, Si♯, Fa♭ y Do♭ */
const SHARPABLE=[0,1,3,4,5], FLATTABLE=[1,2,4,5,6];
function alter(n,prob){
  if(Math.random()>=prob) return n;
  const opts=[];
  if(SHARPABLE.includes(n.l)) opts.push(1);
  if(FLATTABLE.includes(n.l)) opts.push(-1);
  if(!opts.length) return n;
  const a=pick(opts);
  return {midi:n.midi+a,l:n.l,a};
}
const samePc=(a,b)=>a&&b&&mod12(a.midi-b.midi)===0;

/* notas sueltas, sin repetir la anterior: cada respuesta necesita un ataque nuevo */
export function randomNotes(pool,count,accidentals){
  const out=[];
  while(out.length<count){
    const n=alter(pick(pool),accidentals?0.5:0);
    if(samePc(n,out[out.length-1])) continue;
    out.push(n);
  }
  return out;
}

/* frase melódica: paseo por la escala natural con saltos de hasta maxLeap grados */
export function phrase(pool,length,maxLeap,accidentals){
  let i=Math.floor(pool.length/4+Math.random()*pool.length/2);
  const out=[alter(pool[i],accidentals?0.3:0)];
  while(out.length<length){
    let step=0;
    while(step===0) step=Math.round((Math.random()*2-1)*maxLeap);
    const j=i+step;
    if(j<0||j>=pool.length) continue;
    const n=alter(pool[j],accidentals?0.3:0);
    if(samePc(n,out[out.length-1])) continue;
    i=j; out.push(n);
  }
  return out;
}
