/* Entrada opcional por teclado MIDI (USB/OTG). */
import {S,app} from './state.js';
import {ac} from './audio.js';
import {mod12,chordMatches} from './theory.js';
import {pcsKey} from './dsp.js';
import {handleNote,handleChordInput} from './practice.js';
import * as ui from './ui.js';
import {connectMidi,heldNotes} from './midiin.js';

const held=heldNotes;
let midiTimer=null, midiWrongTimer=null;

export function enableMidi(statusEl){
  return connectMidi({onNoteOn, onStatus:t=>{statusEl.textContent=t;}});
}

function onNoteOn(n){
  if(S.input!=='midi') return;
  if(S.mode==='chords'){ui.renderPlayedStaff([...held].map(mod12),[...held]);ui.flashKey(n,'press',300);scheduleChord();}
  else handleNote(n,ac().currentTime,'midi');
}

/* espera a que se asienten las notas del acorde; si es incorrecto, da un margen extra antes de marcarlo */
function scheduleChord(){
  clearTimeout(midiTimer); clearTimeout(midiWrongTimer);
  midiTimer=setTimeout(()=>{
    if(held.size<3) return;
    const pcs=[...held].map(mod12), exp=app.cseq[app.P.running?app.P.idx:0];
    if(exp&&chordMatches(pcs,exp,'midi')) handleChordInput(pcs,ac().currentTime,'midi',null);
    else{
      const snap=pcsKey(pcs);
      midiWrongTimer=setTimeout(()=>{const now=[...held].map(mod12); if(held.size>=3&&pcsKey(now)===snap) handleChordInput(now,ac().currentTime,'midi',null,[...held]);},350);
    }
  },90);
}
