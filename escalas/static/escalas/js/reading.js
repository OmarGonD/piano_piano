/* Lectura de notas: aparece una nota en el pentagrama y hay que tocarla en el piano. */
import {$} from './dom.js';
import {S} from './state.js';
import {mod12} from './theory.js';
import {fitRange} from './keyboard.js';
import {staffSvg,noteName,CLEFS} from './staff.js';
import {naturalsIn,randomNotes} from './notegen.js';
import * as ss from './session.js';
import {gt,tf,tn} from './i18n.js';

const cfg=Object.assign({clef:'treble',accidentals:false,count:15},ss.MOD.config);
const pool=naturalsIn(cfg.low,cfg.high);
const matches=(m,t)=>S.strict?m===t.midi:mod12(m-t.midi)===0;
/* en "mixed" cada nota va en su clave; el Do central puede salir en cualquiera de las dos */
const clefFor=n=>cfg.clef!=='mixed'?cfg.clef:n.midi<60?'bass':n.midi>60?'treble':(Math.random()<0.5?'bass':'treble');

let R={};

function draw(notes,clef){
  $('#readStaff').innerHTML=staffSvg({clef,notes,h:11,width:360,ariaLabel:CLEFS[clef].name});
}
function show(){
  const t=R.targets[R.idx];
  Object.assign(R,{firstTry:true,lastWrong:null,shownAt:performance.now(),locked:false});
  draw([{...t,cls:'cur'}],t.clef);
  ss.setCounter(`Nota ${R.idx+1} de ${R.targets.length}`);
  ss.setProgress(R.idx/R.targets.length);
  ss.setMsg(gt('¿Qué nota es? Tócala en el piano.'));
}

function onNote(m){
  ss.flash(m,'hit-ok');
  if(!ss.run.running||R.locked) return;
  const t=R.targets[R.idx];
  if(matches(m,t)){
    R.locked=true;
    R.times.push(performance.now()-R.shownAt);
    if(R.firstTry) R.correct++;
    draw([{...t,cls:'ok',label:noteName(t)}],t.clef);
    ss.setMsg(R.firstTry?tf('¡Bien! Es %(note)s.',{note:noteName(t)}):tf('Eso es: %(note)s.',{note:noteName(t)}),'ok');
    setTimeout(()=>{
      if(!ss.run.running) return;
      R.idx++;
      if(R.idx<R.targets.length) return show();
      ss.finish({accuracy:Math.round(R.correct/R.targets.length*100),errors:R.errors,
        timePerItem:ss.avg(R.times),unit:'nota',goalMs:2000});
      preview();
    },650);
  }else{
    // ignora el mismo error repetido (resonancia o rebote del micrófono)
    if(R.lastWrong&&R.lastWrong.m===m&&performance.now()-R.lastWrong.t<1200) return;
    R.lastWrong={m,t:performance.now()};
    R.errors++; R.firstTry=false;
    ss.flash(m,'hit-bad');
    // la nota tocada se dibuja solo si está cerca; si no, basta con el mensaje
    const played=Math.abs(m-t.midi)<=12?[{midi:m,cls:'err ghost',label:`tocaste ${noteName(m)}`}]:[];
    draw([{...t,cls:'cur err',label:noteName(t)},...played],t.clef);
    ss.setMsg(tf('Sonó %(got)s. La nota escrita es %(want)s: búscala.',{got:noteName(m),want:noteName(t)}),'bad');
  }
}

/* antes de empezar: la nota más grave y la más aguda del módulo */
function preview(){
  const lo=pool[0], hi=pool[pool.length-1];
  const clef=cfg.clef==='mixed'?'treble':cfg.clef;
  draw(cfg.clef==='mixed'?[]:[{...lo,cls:'ghost',label:noteName(lo)},{...hi,cls:'ghost',label:noteName(hi)}],clef);
}

ss.setup({
  range:fitRange(cfg.low,cfg.high),
  onNote,
  onStart:()=>{
    const targets=randomNotes(pool,cfg.count,cfg.accidentals).map(n=>({...n,clef:clefFor(n)}));
    R={targets,idx:0,correct:0,errors:0,times:[]};
    show();
  },
  onStop:preview,
});
preview();
