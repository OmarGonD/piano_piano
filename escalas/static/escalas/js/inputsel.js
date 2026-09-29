/* Selector de entrada (micrófono o teclado MIDI) para páginas de módulo y canción. */
import {$} from './dom.js';
import {S,save} from './state.js';
import {connectMidi} from './midiin.js';

/* onNoteOn(midi, ts) recibe las notas MIDI; el micrófono se configura aparte con configureMic */
export function setupInputSelector({onNoteOn,onNoteOff}){
  const seg=$('#inputSeg'), status=$('#inputStatus'), mic=$('.top .mic');
  const apply=()=>{
    seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===S.input)));
    const midi=S.input==='midi';
    if(mic) mic.hidden=midi;
    status.textContent='';
    if(midi) connectMidi({onNoteOn:(n,ts)=>{if(S.input==='midi')onNoteOn(n,ts);},onNoteOff,onStatus:t=>{status.textContent=t;}});
  };
  seg.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.input=b.dataset.v;save();apply();});
  apply();
}
