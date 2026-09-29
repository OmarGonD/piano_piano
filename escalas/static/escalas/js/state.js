import {store} from './dom.js';
import {TYPES,SCALE_TYPES,PROGS} from './data.js';

export const DEF={mode:'practice',root:0,type:'major',octaves:1,dir:'updown',startOct:4,metro:false,bpm:60,npb:2,
  autoTempo:true,strict:false,latency:50,sens:2,notation:(document.documentElement.lang==='en'?'en':'es'),input:'mic',diag:true,keyMode:'major',prog:'I-vi-IV-V',laps:2,voicing:'near'};

const saved=store.get('escalas:settings',{});
delete saved.gate;
export const S=Object.assign({},DEF,saved,{v:3});
if(!TYPES[S.type]&&SCALE_TYPES.length) S.type=SCALE_TYPES[0].slug;
if(!PROGS[S.keyMode]) S.keyMode='major';
export const save=()=>store.set('escalas:settings',S);

/* estado de la sesión en curso, compartido entre módulos */
export const app={
  P:{running:false},       // práctica actual
  resultsShown:false,
  seq:[], scalePcs:new Set(),  // escala
  cseq:[], keyPcs:new Set(),   // círculo armónico
  micOn:false,
};

/* identifica ejercicios comparables para los récords */
export const recKey=()=>S.mode==='chords'
  ?['c',S.root,S.keyMode,S.prog,S.laps,S.voicing].join('-')
  :[S.root,S.type,S.octaves,S.dir,S.strict?'s':'n'].join('-');
