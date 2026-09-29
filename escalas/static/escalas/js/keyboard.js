/* Teclado de piano en pantalla, reutilizable en cualquier página. */
import {letter,mod12,isBlack} from './theory.js';

/* amplía [lo,hi] a al menos dos octavas que empiecen en Do/Fa y terminen en Mi/Si */
export function fitRange(lo,hi){
  lo-=2; hi+=2;
  while(hi-lo<23){lo--;hi++;}
  while(![0,5].includes(mod12(lo))) lo--;
  while(![4,11].includes(mod12(hi))) hi++;
  return [lo,hi];
}

export function renderKeys(el,lo,hi){
  const whites=[];
  for(let m=lo;m<=hi;m++) if(!isBlack(m)) whites.push(m);
  const ww=100/whites.length, bw=ww*0.62;
  let html='';
  whites.forEach((m,i)=>{
    const lbl=mod12(m)===0?`<span class="lbl">${letter(0,0)}${Math.floor(m/12)-1}</span>`:'';
    html+=`<div class="key white" data-midi="${m}" style="left:${i*ww}%;width:${ww}%"><span class="fing"></span>${lbl}</div>`;
  });
  for(let m=lo;m<=hi;m++) if(isBlack(m)){
    const wi=whites.indexOf(m-1); if(wi<0) continue;
    html+=`<div class="key black" data-midi="${m}" style="left:${(wi+1)*ww-bw/2}%;width:${bw}%"><span class="fing"></span></div>`;
  }
  el.innerHTML=html;
}

export function flashKey(el,m,cls,ms){
  const k=el.querySelector(`.key[data-midi="${m}"]`); if(!k) return;
  k.classList.remove('hit-ok','hit-bad','demo','demo-rh','demo-lh'); void k.offsetWidth; k.classList.add(cls);
  clearTimeout(k._t); k._t=setTimeout(()=>k.classList.remove(cls),ms||380);
}

/* onPlay(midi, ts) al tocar una tecla; ts en el reloj de performance.now() */
export function bindKeys(el,onPlay){
  el.addEventListener('pointerdown',e=>{
    const k=e.target.closest('.key'); if(!k) return; e.preventDefault();
    onPlay(+k.dataset.midi,e.timeStamp||performance.now());
  });
}
