/* Récords: vienen embebidos en la página y se actualizan al guardar cada intento en el servidor. */
import {readJson} from './dom.js';
import {track} from './analytics.js';

const cache=new Map(Object.entries(readJson('records')||{}));
const csrf=()=>{const m=document.querySelector('meta[name="csrf-token"]');return m?m.content:'';};

export const getRecord=key=>cache.get(key)||null;

export async function recordAttempt(a){
  // actualización optimista: la UI no espera a la red
  const r=Object.assign({best:0,bpm:0,runs:0},cache.get(a.config_key));
  track('attempt_completed',{practice_mode:a.mode,item:a.title,accuracy:a.accuracy,errors:a.errors,duration_s:a.duration,bpm:a.bpm});
  r.runs++; r.best=Math.max(r.best,a.accuracy);
  if(a.bpm&&a.accuracy===100) r.bpm=Math.max(r.bpm||0,a.bpm);
  cache.set(a.config_key,r);
  try{
    const res=await fetch(window.ESCALAS_URLS.attempts,{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json','X-CSRFToken':csrf()},body:JSON.stringify(a)});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    cache.set(a.config_key,data.record);
    return data.record;
  }catch(e){
    console.warn('No se pudo guardar el intento en el servidor',e);
    return r;
  }
}

/* guarda una preferencia del usuario (p. ej. song_view) sin salir de la página */
export async function savePreference(name,value){
  try{
    const res=await fetch(window.ESCALAS_URLS.preferences,{method:'POST',credentials:'same-origin',
      headers:{'Accept':'application/json','X-CSRFToken':csrf()},body:new URLSearchParams({[name]:value})});
    if(!res.ok) throw new Error('HTTP '+res.status);
  }catch(e){
    console.warn('No se pudo guardar la preferencia',e);
  }
}
