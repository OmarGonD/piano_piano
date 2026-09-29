import {gt,tf,tn} from './i18n.js';
/* Conexión a teclados MIDI (USB/OTG), reutilizable en cualquier página.
   connectMidi({onNoteOn(midi, ts), onNoteOff(midi, ts), onStatus(texto)}); ts en el reloj de performance.now() */
let access=null, handlers=null;
export const heldNotes=new Set();

function onMessage(e){
  const [st,n,v]=e.data, cmd=st&0xf0;
  const ts=e.timeStamp||performance.now();  // momento real de la tecla (reloj de performance)
  if(cmd===0x90&&v>0){heldNotes.add(n);handlers.onNoteOn&&handlers.onNoteOn(n,ts);}
  else if(cmd===0x80||(cmd===0x90&&v===0)){heldNotes.delete(n);handlers.onNoteOff&&handlers.onNoteOff(n,ts);}
}

export async function connectMidi(h){
  handlers=h;
  const status=h.onStatus||(()=>{});
  if(!navigator.requestMIDIAccess){status(gt('Este navegador no soporta MIDI. Usa Chrome.'));return false;}
  try{
    access=access||await navigator.requestMIDIAccess();
  }catch(e){status(gt('No se pudo acceder a MIDI. Revisa el permiso en Chrome.'));return false;}
  const bind=()=>{
    let n=0;
    access.inputs.forEach(inp=>{inp.onmidimessage=onMessage;n++;});
    status(n?tn('Teclado conectado (%(n)s entrada).','Teclado conectado (%(n)s entradas).',n):gt('No se detecta ningún teclado. Conéctalo por USB con un adaptador OTG.'));
  };
  bind(); access.onstatechange=bind;
  return true;
}
