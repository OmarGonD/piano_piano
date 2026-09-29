/* Teoría musical: nombres de notas, escalas, digitaciones y acordes. */
import {S,app} from './state.js';
import {TYPES,PROGS} from './data.js';
import {ALLCH,QSUF,pcsKey} from './dsp.js';
import {gt,tf,tn} from './i18n.js';

export const LET_ES=['Do','Re','Mi','Fa','Sol','La','Si'], LET_EN=['C','D','E','F','G','A','B'];
export const NAT=[0,2,4,5,7,9,11];
export const ACC={'-2':'𝄫','-1':'♭','0':'','1':'♯','2':'𝄪'};
export const ROOTS=[[0,0],[0,1],[1,-1],[1,0],[1,1],[2,-1],[2,0],[3,0],[3,1],[4,-1],[4,0],[4,1],[5,-1],[5,0],[5,1],[6,-1],[6,0]];
export const SHARP_SPELL=[[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];
const SEVEN=[0,1,2,3,4,5,6];

/* digitaciones de mano derecha por clase de altura de la tónica: [dedo por grado, dedo en la nota más aguda] */
const C_TYPE=[[1,2,3,1,2,3,4],5];
const FINGERINGS={
  major:{0:C_TYPE,7:C_TYPE,2:C_TYPE,9:C_TYPE,4:C_TYPE,11:C_TYPE,
    5:[[1,2,3,4,1,2,3],4],10:[[4,1,2,3,1,2,3],4],3:[[3,1,2,3,4,1,2],3],
    8:[[3,4,1,2,3,1,2],3],1:[[2,3,1,2,3,4,1],2],6:[[2,3,4,1,2,3,1],2]},
};

export const letter=(l,a)=>(S.notation==='es'?LET_ES:LET_EN)[l]+ACC[a];
export const mod12=x=>((x%12)+12)%12;
export const isBlack=m=>[1,3,6,8,10].includes(mod12(m));

/* ---------- escalas ---------- */
export function buildSeq(){
  const [rl,ra]=ROOTS[S.root]; const T=TYPES[S.type]; const L=T.letters||SEVEN;
  const up=T.intervals, down=T.descending||up;
  const rootPc=mod12(NAT[rl]+ra); const rootMidi=12*(S.startOct+1)+NAT[rl]+ra;
  const f=T.fingering&&FINGERINGS[T.fingering]?FINGERINGS[T.fingering][rootPc]:null;
  const sp=(arr,i,o,top)=>{
    const l=(rl+L[i])%7, a=mod12(rootPc+arr[i]-NAT[l]+6)-6;
    const midi=rootMidi+12*o+arr[i];
    return {midi,l,a,oct:Math.floor((midi-a)/12)-1,finger:f?(top?f[1]:f[0][i]):null};
  };
  const out=[], n=up.length;
  for(let o=0;o<S.octaves;o++) for(let i=0;i<n;i++) out.push(sp(up,i,o,false));
  out.push(sp(up,0,S.octaves,true));
  if(S.dir==='updown') for(let o=S.octaves-1;o>=0;o--) for(let i=n-1;i>=0;i--) out.push(sp(down,i,o,false));
  app.seq=out;
  app.scalePcs=new Set(up.concat(down).map(s=>mod12(rootPc+s)));
}
export function spellMidi(m){
  const n=app.seq.find(x=>mod12(x.midi)===mod12(m));
  const [l,a]=n?[n.l,n.a]:SHARP_SPELL[mod12(m)];
  return {name:letter(l,a),oct:Math.floor((m-a)/12)-1};
}
export const scaleTitle=()=>{const [l,a]=ROOTS[S.root];return letter(l,a)+' '+TYPES[S.type].name.toLowerCase();};

/* ---------- círculo armónico ---------- */
const ROMAN=['I','II','III','IV','V','VI','VII'];
export function keyScale(){
  const [rl,ra]=ROOTS[S.root]; const rootPc=mod12(NAT[rl]+ra);
  const iv=S.keyMode==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  return iv.map((s,i)=>{const l=(rl+i)%7,pc=mod12(rootPc+s);return {l,a:mod12(pc-NAT[l]+6)-6,pc};});
}
export function buildChord(sc,c){
  const tones=(c.s?[0,2,4,6]:[0,2,4]).map(k=>Object.assign({},sc[(c.d+k)%7]));
  if(c.h) tones.forEach(t=>{ if(t.pc===sc[6].pc){t.a+=1;t.pc=mod12(t.pc+1);} });
  const r=tones[0], i3=mod12(tones[1].pc-r.pc), i5=mod12(tones[2].pc-r.pc);
  const q=i3===4?(i5===8?'aug':'M'):(i5===6?'dim':'m');
  let suf={M:'',m:'m',dim:'°',aug:'+'}[q];
  if(c.s){const i7=mod12(tones[3].pc-r.pc); suf=(q==='M'&&i7===10)?'7':(q==='m'&&i7===10)?'m7':(q==='M'&&i7===11)?'maj7':(q==='dim')?'ø7':suf+'7';}
  const roman=((q==='M'||q==='aug')?ROMAN[c.d]:ROMAN[c.d].toLowerCase())+(q==='dim'?'°':'')+(c.s?'7':'');
  return {tones,pcs:tones.map(t=>t.pc),root:r,suf,roman};
}
export const chordName=c=>letter(c.root.l,c.root.a)+c.suf;
export const curProg=()=>{const L=PROGS[S.keyMode]||[];return L.find(p=>p.id===S.prog)||L[0];};
export const keyTitle=()=>{const [l,a]=ROOTS[S.root];return letter(l,a)+(S.keyMode==='minor'?' '+gt('menor'):' '+gt('mayor'));};
export function buildChords(){
  const sc=keyScale(); app.keyPcs=new Set(sc.map(x=>x.pc));
  if(S.keyMode==='minor') app.keyPcs.add(mod12(sc[6].pc+1));
  const pr=curProg();
  if(!pr){app.cseq=[];return;}
  const chords=pr.ch.map(c=>buildChord(sc,c));
  let list=[]; for(let i=0;i<S.laps;i++) list=list.concat(chords);
  if(pr.ch[pr.ch.length-1].d!==0) list.push(chords[0]);
  app.cseq=voiceChords(list);
}
/* elige la inversión de la mano derecha que menos se mueve respecto al acorde anterior */
function voiceChords(list){
  let prev=null;
  return list.map(ch=>{
    const pcs=ch.pcs,n=pcs.length,cands=[];
    for(let inv=0;inv<n;inv++){
      const order=pcs.slice(inv).concat(pcs.slice(0,inv));
      for(let base=60;base<=71;base++){
        if(mod12(base)!==order[0]) continue;
        const v=[base]; for(let k=1;k<n;k++){let m=v[k-1]+1; while(mod12(m)!==order[k]) m++; v.push(m);}
        cands.push({v,inv});
      }
    }
    const cost=v=>{let s=0;v.forEach(x=>{s+=Math.min(...prev.map(p=>Math.abs(p-x)));});prev.forEach(p=>{s+=Math.min(...v.map(x=>Math.abs(p-x)));});return s+Math.abs(v[0]-64)*0.15;};
    const pick=(!prev||S.voicing==='root')?cands.filter(c=>c.inv===0)[0]:cands.slice().sort((a,b)=>cost(a.v)-cost(b.v))[0];
    prev=pick.v;
    return Object.assign({},ch,{voice:pick.v,bass:48+ch.root.pc});
  });
}
export function progOptions(){
  const sc=keyScale();
  return (PROGS[S.keyMode]||[]).map(p=>{const cs=p.ch.map(c=>buildChord(sc,c));
    return {id:p.id,label:`${cs.map(c=>c.roman).join(' – ')}  (${cs.map(chordName).join(', ')})`};});
}
export function spellPc(pc){const d=keyScale().find(x=>x.pc===pc);const [l,a]=d?[d.l,d.a]:SHARP_SPELL[pc];return letter(l,a);}
export function toneLabel(m,c){const t=c.tones.find(x=>x.pc===mod12(m));const a=t?t.a:SHARP_SPELL[mod12(m)][1];const l=t?t.l:SHARP_SPELL[mod12(m)][0];return letter(l,a)+(Math.floor((m-a)/12)-1);}
export const tmplLabel=c=>spellPc(c.r)+QSUF[c.q];
export function describePcs(pcs){const k=pcsKey(pcs);const t=ALLCH.find(c=>pcsKey(c.pcs)===k);return t?tmplLabel(t):[...new Set(pcs)].map(spellPc).join('-');}

export function chordMatches(pcs,exp,src){
  const set=new Set(pcs);
  // por micrófono la séptima suele perderse: basta con la tríada
  const need=(src==='mic'&&exp.pcs.length===4)?exp.pcs.slice(0,3):exp.pcs;
  if(!need.every(p=>set.has(p))) return false;
  return src==='mic'||[...set].every(p=>exp.pcs.includes(p));
}

/* ---------- cifrados (C, F#m, Bb7, Cmaj7, Bdim, Dsus4…) ---------- */
const LETTER_IDX={C:0,D:1,E:2,F:3,G:4,A:5,B:6};
/* iv: semitonos desde la fundamental; deg: grado de letra de cada nota */
const CHORD_QUALS={
  '':{iv:[0,4,7],deg:[0,2,4],suf:''}, m:{iv:[0,3,7],deg:[0,2,4],suf:'m'},
  '7':{iv:[0,4,7,10],deg:[0,2,4,6],suf:'7'}, m7:{iv:[0,3,7,10],deg:[0,2,4,6],suf:'m7'},
  maj7:{iv:[0,4,7,11],deg:[0,2,4,6],suf:'maj7'}, dim:{iv:[0,3,6],deg:[0,2,4],suf:'°'},
  aug:{iv:[0,4,8],deg:[0,2,4],suf:'+'}, sus2:{iv:[0,2,7],deg:[0,1,4],suf:'sus2'}, sus4:{iv:[0,5,7],deg:[0,3,4],suf:'sus4'},
};
export function parseChord(sym){
  const m=/^([A-G])(#|b)?(maj7|m7|m|7|dim|aug|sus2|sus4)?$/.exec(sym); if(!m) return null;
  const l=LETTER_IDX[m[1]], a=m[2]==='#'?1:m[2]==='b'?-1:0, q=m[3]||'', Q=CHORD_QUALS[q];
  const rootPc=mod12(NAT[l]+a);
  const tones=Q.iv.map((iv,i)=>{const tl=(l+Q.deg[i])%7, pc=mod12(rootPc+iv);return {l:tl,a:mod12(pc-NAT[tl]+6)-6,pc};});
  return {sym,q,root:{l,a,pc:rootPc},suf:Q.suf,tones,pcs:tones.map(t=>t.pc)};
}
/* posición fundamental cerca del Do central */
export function chordVoicing(c){
  let base=60+c.root.pc; if(base>66) base-=12;
  return CHORD_QUALS[c.q].iv.map(iv=>base+iv);
}
export const toneNames=c=>c.tones.map(t=>letter(t.l,t.a)).join(' – ');
