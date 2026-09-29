/* Tocar acordes: aparece un cifrado (o una progresión) y hay que tocar el acorde. */
import {$} from './dom.js';
import {mod12,parseChord,chordName,chordVoicing,toneNames,chordMatches,describePcs} from './theory.js';
import {pcsKey} from './dsp.js';
import * as ss from './session.js';
import {gt,tf,tn} from './i18n.js';

const cfg=Object.assign({hints:'always',count:12,laps:1},ss.MOD.config);
const pool=(cfg.chords||[]).map(parseChord);

let R={};

function buildItems(){
  if(cfg.sequences){
    const out=[];
    for(let lap=0;lap<cfg.laps;lap++) for(const seq of cfg.sequences) seq.chords.forEach(s=>out.push({...parseChord(s),group:seq.name}));
    return out;
  }
  const out=[];
  while(out.length<cfg.count){
    const c=pool[Math.floor(Math.random()*pool.length)];
    if(out.length&&out[out.length-1].sym===c.sym) continue;
    out.push({...c});
  }
  return out;
}

function renderStrip(items,cur){
  $('#chordStrip').innerHTML=items.map((c,i)=>{
    let cl='ch';
    if(i<cur) cl+=R.errs.has(i)?' err':' ok';
    else if(i===cur) cl+=R.errs&&R.errs.has(i)?' cur err':' cur';
    return `<div class="${cl}" id="ch${i}"><b>${chordName(c)}</b></div>`;
  }).join('');
  const el=document.getElementById('ch'+cur), strip=$('#chordStrip');
  if(el) strip.scrollTo({left:Math.max(0,el.offsetLeft-strip.clientWidth/2+el.clientWidth/2),behavior:'smooth'});
}
function showHints(c,on){
  $('#chordNotes').innerHTML=on?tf('Notas: <strong>%(notes)s</strong>',{notes:toneNames(c)}):gt('Tócalo de memoria. Si fallas, verás sus notas.');
  ss.markKeys(on?chordVoicing(c):[]);
}
function show(){
  const c=R.items[R.idx];
  Object.assign(R,{firstTry:true,lastWrong:null,shownAt:performance.now(),locked:false,touch:[]});
  $('#chordName').textContent=chordName(c);
  $('#chordName').dataset.state='';
  $('#chordGroup').textContent=c.group||'';
  showHints(c,cfg.hints==='always');
  renderStrip(R.items,R.idx);
  ss.setCounter(tf('Acorde %(n)s de %(total)s',{n:R.idx+1,total:R.items.length}));
  ss.setProgress(R.idx/R.items.length);
  ss.setMsg(gt('Toca el acorde.'));
}

function onChord(pcs,src,label){
  if(!ss.run.running||R.locked) return;
  const c=R.items[R.idx];
  if(chordMatches(pcs,c,src)){
    R.locked=true;
    R.times.push(performance.now()-R.shownAt);
    if(R.firstTry) R.correct++;
    R.lastOk=pcsKey(pcs);
    chordVoicing(c).forEach(m=>ss.flash(m,'hit-ok',500));
    $('#chordName').dataset.state='ok';
    ss.setMsg(tf('¡Bien! %(chord)s.',{chord:chordName(c)}),'ok');
    setTimeout(()=>{
      if(!ss.run.running) return;
      R.idx++;
      if(R.idx<R.items.length) return show();
      renderStrip(R.items,R.items.length);
      ss.finish({accuracy:Math.round(R.correct/R.items.length*100),errors:R.errors,
        timePerItem:ss.avg(R.times),unit:'acorde',goalMs:3000});
    },550);
  }else{
    const k=pcsKey(pcs);
    // el acorde anterior aún suena: no es error
    if(R.lastOk===k) return;
    if(R.lastWrong&&R.lastWrong.k===k&&performance.now()-R.lastWrong.t<1500) return;
    R.lastWrong={k,t:performance.now()};
    R.errors++; R.firstTry=false; R.errs.add(R.idx);
    $('#chordName').dataset.state='bad';
    showHints(c,true);
    renderStrip(R.items,R.idx);
    ss.setMsg(tf('Sonó %(got)s. Busca %(want)s.',{got:label||describePcs(pcs),want:chordName(c)}),'bad');
  }
}

/* en la pantalla se juntan las teclas tocadas en los últimos ~2 s */
function onKey(m){
  ss.flash(m,'press',300);
  if(!ss.run.running||R.locked) return;
  const now=performance.now(), c=R.items[R.idx];
  R.touch=R.touch.filter(x=>now-x.t<1800); R.touch.push({m,t:now});
  const pcs=[...new Set(R.touch.map(x=>mod12(x.m)))];
  if(chordMatches(pcs,c,'touch')||pcs.length>=c.pcs.length){R.touch=[];onChord(pcs,'touch');}
}

function preview(){
  const items=cfg.sequences?cfg.sequences.flatMap(s=>s.chords.map(parseChord)):pool;
  R={errs:new Set()};
  renderStrip(items,-1);
  $('#chordName').textContent=chordName(items[0]);
  $('#chordName').dataset.state='';
  $('#chordGroup').textContent=cfg.sequences?cfg.sequences[0].name:'';
  showHints(items[0],cfg.hints==='always');
  ss.markKeys([]);
}

ss.setup({
  range:[48,83],
  micMode:'chords',
  expectedChord:()=>{const c=ss.run.running&&R.items&&R.items[R.idx];return c?{pcs:c.pcs,label:chordName(c)}:null;},
  onChord, onKey,
  onNote:()=>{},
  onStart:()=>{R={items:buildItems(),idx:0,correct:0,errors:0,errs:new Set(),times:[],lastOk:null};show();},
  onStop:preview,
});
preview();
