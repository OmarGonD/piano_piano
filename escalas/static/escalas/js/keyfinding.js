/* Encontrar teclas: aparece el nombre de una nota (y a veces el dedo) y hay que tocar esa tecla.
   Es el primer ejercicio para quien nunca ha tocado: enseña dónde está cada nota antes de leer partitura. */
import {$} from './dom.js';
import {S} from './state.js';
import {mod12,letter,SHARP_SPELL} from './theory.js';
import {fitRange} from './keyboard.js';
import * as ss from './session.js';
import {gt,tf,tn} from './i18n.js';

const cfg=Object.assign({hints:'always',count:12,exact:false,any_octave:false},ss.MOD.config);
const notes=cfg.notes;
const range=cfg.range||[Math.min(...notes),Math.max(...notes)];
const anyOctave=cfg.any_octave||(!cfg.exact&&!S.strict);
const matches=(m,t)=>cfg.exact?m===t.midi:cfg.any_octave||!S.strict?mod12(m-t.midi)===0:m===t.midi;

/* «Do», o «Do♯ / Re♭» para las teclas negras (cada una tiene dos nombres) */
function nameOf(m){
  const [l,a]=SHARP_SPELL[mod12(m)];
  if(a===0) return letter(l,0);
  return letter(l,a)+' / '+letter((l+1)%7,-1);
}
/* teclas que valen como respuesta, para marcarlas en el teclado */
function answerKeys(t){
  if(cfg.exact||!anyOctave) return [t.midi];
  const out=[]; for(let m=range[0];m<=range[1];m++) if(mod12(m-t.midi)===0) out.push(m);
  return out;
}

let R={};

function buildTargets(){
  const out=[];
  while(out.length<cfg.count){
    const i=Math.floor(Math.random()*notes.length);
    const prev=out[out.length-1];
    if(prev&&(notes.length>1)&&mod12(prev.midi-notes[i])===0) continue;
    out.push({midi:notes[i],finger:cfg.fingers?cfg.fingers[i]:null});
  }
  return out;
}

function show(){
  const t=R.targets[R.idx];
  Object.assign(R,{firstTry:true,lastWrong:null,shownAt:performance.now(),locked:false});
  $('#keyName').textContent=nameOf(t.midi);
  $('#keyName').dataset.state='';
  $('#keyFinger').textContent=t.finger?tf('Dedo %(n)s',{n:t.finger}):'';
  ss.markKeys(cfg.hints==='always'?answerKeys(t):[]);
  ss.setCounter(tf('Nota %(n)s de %(total)s',{n:R.idx+1,total:R.targets.length}));
  ss.setProgress(R.idx/R.targets.length);
  ss.setMsg(gt('Busca esa tecla y tócala.'));
}

function onNote(m){
  ss.flash(m,'hit-ok');
  if(!ss.run.running||R.locked) return;
  const t=R.targets[R.idx];
  if(matches(m,t)){
    R.locked=true;
    R.times.push(performance.now()-R.shownAt);
    if(R.firstTry) R.correct++;
    $('#keyName').dataset.state='ok';
    ss.setMsg(R.firstTry?gt('¡Bien! Esa es la tecla.'):gt('Eso es.'),'ok');
    setTimeout(()=>{
      if(!ss.run.running) return;
      R.idx++;
      if(R.idx<R.targets.length) return show();
      ss.finish({accuracy:Math.round(R.correct/R.targets.length*100),errors:R.errors,
        timePerItem:ss.avg(R.times),unit:'nota',goalMs:3000});
      idle();
    },600);
  }else{
    if(R.lastWrong&&R.lastWrong.m===m&&performance.now()-R.lastWrong.t<1200) return;
    R.lastWrong={m,t:performance.now()};
    R.errors++; R.firstTry=false;
    ss.flash(m,'hit-bad');
    $('#keyName').dataset.state='bad';
    if(cfg.hints==='on_error') ss.markKeys(answerKeys(t));   // la primera vez se busca sin ayuda; al fallar se ilumina
    ss.setMsg(gt('Esa no es. Prueba con otra tecla.'),'bad');
  }
}

function idle(){
  $('#keyName').textContent='–'; $('#keyName').dataset.state=''; $('#keyFinger').textContent='';
}

ss.setup({
  range:fitRange(range[0],range[1]),
  onNote,
  onStart:()=>{
    R={targets:buildTargets(),idx:0,correct:0,errors:0,times:[]};
    show();
  },
  onStop:idle,
});
idle();
