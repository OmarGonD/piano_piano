/* Lectura de frases: una melodía corta en el pentagrama que se toca nota a nota, en orden. */
import {$} from './dom.js';
import {S} from './state.js';
import {mod12} from './theory.js';
import {fitRange} from './keyboard.js';
import {staffSvg,noteName,CLEFS} from './staff.js';
import {naturalsIn,phrase} from './notegen.js';
import * as ss from './session.js';
import {gt,tf,tn} from './i18n.js';

const cfg=Object.assign({clef:'treble',accidentals:false,length:5,count:6,max_leap:2},ss.MOD.config);
const pool=naturalsIn(cfg.low,cfg.high);
const matches=(m,t)=>S.strict?m===t.midi:mod12(m-t.midi)===0;
const width=Math.max(360,150+cfg.length*66);

let R={};
const key=(p,i)=>p*cfg.length+i;

function draw(){
  const ph=R.phrases[R.p];
  const notes=ph.map((x,i)=>{
    const erred=R.errs.has(key(R.p,i));
    if(i<R.n) return {...x,cls:erred?'err':'ok',label:erred?noteName(x):undefined};
    if(i===R.n&&!R.phraseDone) return {...x,cls:erred?'cur err':'cur',label:erred?noteName(x):undefined};
    return {...x};
  });
  $('#readStaff').innerHTML=staffSvg({clef:cfg.clef,notes,h:11,width,ariaLabel:CLEFS[cfg.clef].name});
  ss.setCounter(tf('Frase %(p)s de %(count)s · nota %(n)s de %(len)s',{p:R.p+1,count:cfg.count,n:Math.min(R.n+1,cfg.length),len:cfg.length}));
  ss.setProgress((R.p*cfg.length+R.n)/(cfg.count*cfg.length));
}
function startPhrase(){
  Object.assign(R,{n:0,phraseDone:false,lastOk:null,lastWrong:null,shownAt:performance.now()});
  draw();
  ss.setMsg(gt('Lee la frase de izquierda a derecha y tócala.'));
}

function onNote(m){
  ss.flash(m,'hit-ok');
  if(!ss.run.running||R.phraseDone) return;
  const t=R.phrases[R.p][R.n];
  if(matches(m,t)){
    const now=performance.now();
    R.times.push(now-R.shownAt); R.shownAt=now;
    R.lastOk=m; R.n++;
    if(R.n<cfg.length){ draw(); ss.setMsg(tf('Sigue: nota %(n)s.',{n:R.n+1})); return; }
    R.phraseDone=true; draw();
    ss.setMsg(gt('Frase completa.'),'ok');
    setTimeout(()=>{
      if(!ss.run.running) return;
      R.p++;
      if(R.p<cfg.count) return startPhrase();
      const total=cfg.count*cfg.length;
      ss.finish({accuracy:Math.round((total-R.errs.size)/total*100),errors:R.errors,
        timePerItem:ss.avg(R.times),unit:'nota',goalMs:1500});
      preview();
    },800);
  }else{
    // al sostener la nota anterior el micrófono puede volver a oírla: no es error
    if(R.lastOk!=null&&mod12(m-R.lastOk)===0) return;
    if(R.lastWrong&&R.lastWrong.m===m&&performance.now()-R.lastWrong.t<1200) return;
    R.lastWrong={m,t:performance.now()};
    R.errors++; R.errs.add(key(R.p,R.n));
    ss.flash(m,'hit-bad');
    draw();
    ss.setMsg(tf('Sonó %(got)s. La nota %(n)s es %(want)s.',{got:noteName(m),n:R.n+1,want:noteName(t)}),'bad');
  }
}

function preview(){
  const ex=phrase(pool,cfg.length,cfg.max_leap,cfg.accidentals).map(n=>({...n,cls:'ghost'}));
  $('#readStaff').innerHTML=staffSvg({clef:cfg.clef,notes:ex,h:11,width,ariaLabel:gt('Frase de ejemplo')});
}

ss.setup({
  range:fitRange(cfg.low,cfg.high),
  onNote,
  onStart:()=>{
    const phrases=Array.from({length:cfg.count},()=>phrase(pool,cfg.length,cfg.max_leap,cfg.accidentals));
    R={phrases,p:0,errs:new Set(),errors:0,times:[]};
    startPhrase();
  },
  onStop:preview,
});
preview();
