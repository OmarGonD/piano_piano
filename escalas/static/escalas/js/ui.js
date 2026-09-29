/* Todo lo que pinta en pantalla: indicación, pentagramas, teclado, medidores. */
import {$,$$} from './dom.js';
import {S,app,recKey} from './state.js';
import {fitRange,renderKeys,flashKey as flashKeyIn} from './keyboard.js';
import {ACC,SHARP_SPELL,letter,mod12,spellMidi,scaleTitle,chordName,keyTitle,toneLabel} from './theory.js';
import {ctxInfo} from './audio.js';
import {getRecord} from './api.js';
import {gt,tf,tn} from './i18n.js';

export function setMsg(t,bad){const m=$('#cueMsg');m.textContent=t;m.classList.toggle('bad',!!bad);}

/* ---------- pentagrama de la escala ---------- */
export function renderStaff(){
  const seq=app.seq;
  const steps=seq.map(n=>n.oct*7+n.l);
  const avg=steps.reduce((a,b)=>a+b,0)/steps.length;
  const bass=avg<28, bot=bass?18:30, top=bot+8, h=6, pad=16;
  const hiS=Math.max(...steps,top)+2, loS=Math.min(...steps,bot)-2;
  const hasF=seq[0].finger!=null;
  const H=(hiS-loS)*h+pad*2+(hasF?22:0);
  const y=s=>pad+(hiS-s)*h;
  const dx=40,x0=72,Wd=x0+seq.length*dx+10;
  let o=`<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="${gt('Pentagrama de la escala')}">`;
  for(let s=bot;s<=top;s+=2) o+=`<line class="sl" x1="8" x2="${Wd-8}" y1="${y(s)}" y2="${y(s)}"/>`;
  o+=`<line class="sl" x1="8" x2="8" y1="${y(top)}" y2="${y(bot)}"/>`;
  o+=`<text class="clef" x="12" y="${y(top)-10}">${bass?gt('Clave de fa'):gt('Clave de sol')}</text>`;
  if(hasF) o+=`<text class="clef" x="12" y="${H-8}">${gt('Dedos')}</text>`;
  seq.forEach((n,i)=>{
    const s=steps[i], x=x0+i*dx, yy=y(s);
    let g=`<g class="nt" id="nt${i}">`;
    for(let l=bot-2;l>=s;l-=2) g+=`<line class="ledger" x1="${x-12}" x2="${x+12}" y1="${y(l)}" y2="${y(l)}"/>`;
    for(let l=top+2;l<=s;l+=2) g+=`<line class="ledger" x1="${x-12}" x2="${x+12}" y1="${y(l)}" y2="${y(l)}"/>`;
    if(n.a) g+=`<text class="acc" x="${x-10}" y="${yy+6}" text-anchor="end">${ACC[n.a]}</text>`;
    g+=`<ellipse cx="${x}" cy="${yy}" rx="7.2" ry="5.3" transform="rotate(-20 ${x} ${yy})"/>`;
    if(hasF) g+=`<text class="fg" x="${x}" y="${H-8}" text-anchor="middle">${n.finger}</text>`;
    o+=g+'</g>';
  });
  $('#staffWrap').innerHTML=o+'</svg>';
}
export function markStaff(){
  const P=app.P, cur=P.running?P.idx:(P.idx||0);
  app.seq.forEach((n,i)=>{
    const g=document.getElementById('nt'+i); if(!g) return;
    let c='';
    if(P.idx!=null&&i<P.idx) c=P.errs&&P.errs.has(i)?'err':'ok';
    else if(i===cur&&(P.running||!P.idx)) c=P.errs&&P.errs.has(i)?'cur err':'cur';
    g.setAttribute('class','nt '+c);
  });
  const wrap=$('#staffWrap'), x=72+cur*40;
  if(x>wrap.scrollLeft+wrap.clientWidth-120||x<wrap.scrollLeft+40) wrap.scrollTo({left:Math.max(0,x-140),behavior:'smooth'});
  $('#progFill').style.width=((P.idx||0)/app.seq.length*100)+'%';
}

/* ---------- pentagrama de lo que se oyó (correcto / incorrecto) ---------- */
export function renderPlayedStaff(pcs=[],midis=[],result='pending'){
  const notes=midis.length?[...new Set(midis)].sort((a,b)=>a-b):[...new Set(pcs)].sort((a,b)=>a-b).map(pc=>60+pc);
  const width=Math.max(320,notes.length*58+80);
  const steps=notes.map(m=>{const [l,a]=SHARP_SPELL[mod12(m)];return (Math.floor((m-a)/12)-1)*7+l;});
  const base=72+Math.max(0,30-Math.min(30,...steps))*6+Math.max(0,Math.max(38,...steps)-38)*6;
  const height=Math.max(122,base+42);
  const status=result==='correct'?gt('Correcta'):result==='wrong'?gt('Incorrecta'):gt('Nota detectada');
  const el=$('#playedStaff'); el.dataset.result=notes.length?result:'pending';
  let svg=`<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${notes.length?tf('Notas tocadas: %(notes)s. %(status)s',{notes:notes.map(m=>spellMidi(m).name+spellMidi(m).oct).join(', '),status}):gt('Esperando notas')}">`;
  for(let i=0;i<5;i++) svg+=`<line class="sl" x1="12" x2="${width-12}" y1="${base-i*12}" y2="${base-i*12}"/>`;
  if(!notes.length) svg+=`<text class="clef" x="24" y="${base+20}">${gt('Toca una nota para verla aquí')}</text>`;
  else svg+=`<text class="played-status" x="16" y="20">${status}</text>`;
  notes.forEach((m,i)=>{
    const pc=mod12(m), [l,a]=SHARP_SPELL[pc], oct=Math.floor((m-a)/12)-1;
    const step=oct*7+l, y=base-(step-30)*6, x=48+i*58;
    for(let s=28;s>=step;s-=2) svg+=`<line class="ledger" x1="${x-12}" x2="${x+12}" y1="${base-(s-30)*6}" y2="${base-(s-30)*6}"/>`;
    for(let s=40;s<=step;s+=2) svg+=`<line class="ledger" x1="${x-12}" x2="${x+12}" y1="${base-(s-30)*6}" y2="${base-(s-30)*6}"/>`;
    svg+=`<g class="nt ${result==='wrong'?'err':result==='correct'?'ok':'cur'}">${a?`<text class="acc" x="${x-10}" y="${y+6}" text-anchor="end">${ACC[a]}</text>`:''}<ellipse cx="${x}" cy="${y}" rx="7.2" ry="5.3" transform="rotate(-20 ${x} ${y})"/><text class="fg" x="${x}" y="${height-8}" text-anchor="middle">${letter(l,a)}${oct}</text></g>`;
  });
  el.innerHTML=svg+'</svg>';
}

/* ---------- círculo armónico ---------- */
export function renderChords(){
  $('#chordStrip').innerHTML=app.cseq.map((c,i)=>`<div class="ch" id="ch${i}"><b>${chordName(c)}</b><span>${c.roman}</span></div>`).join('');
}
export function markChords(){
  const P=app.P, cur=P.running?P.idx:(P.idx||0);
  app.cseq.forEach((c,i)=>{const el=document.getElementById('ch'+i); if(!el) return; let cl='ch';
    if(P.idx!=null&&i<P.idx) cl+=P.errs&&P.errs.has(i)?' err':' ok';
    else if(i===cur&&(P.running||!P.idx)) cl+=P.errs&&P.errs.has(i)?' cur err':' cur';
    el.className=cl;});
  const el=document.getElementById('ch'+cur), strip=$('#chordStrip');
  if(el&&strip) strip.scrollTo({left:Math.max(0,el.offsetLeft-strip.clientWidth/2+el.clientWidth/2),behavior:'smooth'});
  $('#progFill').style.width=((P.idx||0)/app.cseq.length*100)+'%';
}

/* ---------- teclado en pantalla ---------- */
function kbRange(){
  if(S.mode!=='practice') return [48,83];
  const ms=app.seq.map(n=>n.midi);
  return fitRange(Math.min(...ms),Math.max(...ms));
}
export function renderKeyboard(){
  const [lo,hi]=kbRange();
  renderKeys($('#kb'),lo,hi);
  updateKeys();
}
export function updateKeys(){
  const P=app.P, exp=new Map(), show=P.running||!app.resultsShown;
  if(S.mode==='practice'&&show){const n=app.seq[P.running?P.idx:0]; if(n) exp.set(n.midi,n.finger);}
  if(S.mode==='chords'&&show){const c=app.cseq[P.running?P.idx:0]; if(c){c.voice.forEach(m=>exp.set(m,null)); exp.set(c.bass,null);}}
  const pcs=S.mode==='chords'?app.keyPcs:app.scalePcs;
  $$('#kb .key').forEach(k=>{
    const m=+k.dataset.midi;
    k.classList.toggle('in-scale',pcs.has(mod12(m)));
    const isExp=exp.has(m), fg=exp.get(m);
    k.classList.toggle('expect',isExp);
    const f=k.querySelector('.fing');
    if(isExp&&fg!=null){f.textContent=fg;f.classList.add('has');} else f.classList.remove('has');
  });
}
export const flashKey=(m,cls,ms)=>flashKeyIn($('#kb'),m,cls,ms);

/* ---------- indicación principal ---------- */
function showCueNote(midi,done){
  const s=spellMidi(midi);
  $('#cueNote').textContent=s.name; $('#cueOct').textContent=s.oct;
  $('#cueNote').classList.toggle('ok',!!done);
}
export function showFree(m,cents,f){
  if(m==null){$('#cueNote').textContent='–';$('#cueOct').textContent='';$('#needle').style.left='50%';$('#tunerTxt').textContent=gt('Toca una nota y mantenla.');return;}
  showCueNote(m,Math.abs(cents)<12);
  const c=Math.max(-50,Math.min(50,cents));
  $('#needle').style.left=(50+c)+'%';
  $('#tunerTxt').textContent=f?`${f.toFixed(1)} Hz · ${cents>=0?'+':''}${Math.round(cents)} cents`:gt('Nota del teclado de pantalla');
}
export function refresh(){
  const P=app.P, md=S.mode, free=md==='free';
  $$('.scale-only').forEach(e=>e.hidden=md!=='practice');
  $$('.chord-only').forEach(e=>e.hidden=md!=='chords');
  $$('.train-only').forEach(e=>e.hidden=free);
  $$('.no-chord').forEach(e=>e.hidden=md==='chords');
  $('#listenBtn').textContent=md==='chords'?gt('Escuchar el círculo'):gt('Escuchar la escala');
  $('#tuner').hidden=!free;
  $('#results').hidden=free||!app.resultsShown;
  $('#beats').hidden=free||!S.metro;
  if(free){
    $('#cueFinger').innerHTML=''; $('#cueNext').textContent='';
    if(!app.micOn&&S.input==='mic') setMsg(gt('Activa el micrófono y toca cualquier nota.'));
    else setMsg(gt('Toca una nota: verás su nombre y qué tan afinada llega.'));
    updateKeys(); return;
  }
  if(md==='chords'){
    const ci=P.running?P.idx:0, c=app.cseq[ci], nx=app.cseq[ci+1];
    if(!c){setMsg(gt('No hay círculos armónicos para esta tonalidad. Agrégalos desde el admin.'),true);return;}
    $('#cueNote').textContent=chordName(c); $('#cueNote').classList.remove('ok'); $('#cueOct').textContent='';
    $('#cueFinger').innerHTML=tf('Mano derecha: <strong>%(voice)s</strong> · Bajo: <strong>%(bass)s</strong>',{voice:c.voice.map(m=>toneLabel(m,c)).join(' – '),bass:toneLabel(c.bass,c)});
    $('#cueNext').innerHTML=nx?tf('Después: <b>%(next)s</b>',{next:chordName(nx)}):gt('Último acorde');
    if(P.running){ if(!P.countIn) setMsg(tf('%(title)s · acorde %(n)s de %(total)s',{title:keyTitle(),n:ci+1,total:app.cseq.length})); }
    else if(S.input==='mic'&&!app.micOn) setMsg(gt('Activa el micrófono para que la app te escuche. También puedes tocar los acordes en el teclado de la pantalla.'));
    else if(S.metro) setMsg(tf('%(title)s. Pulsa Empezar: habrá 4 tiempos de cuenta y luego un acorde por compás.',{title:keyTitle()}));
    else setMsg(tf('%(title)s. Toca el primer acorde para empezar.',{title:keyTitle()}));
    markChords(); updateKeys(); return;
  }
  const idx=P.running?P.idx:0, n=app.seq[idx];
  showCueNote(n.midi,false);
  $('#cueFinger').innerHTML=n.finger!=null?tf('<b>%(n)s</b> dedo',{n:n.finger}):'';
  const nx=app.seq[idx+1];
  $('#cueNext').innerHTML=nx?tf('Después: <b>%(next)s</b>',{next:spellMidi(nx.midi).name+spellMidi(nx.midi).oct}):gt('Última nota');
  if(P.running){ if(!P.countIn) setMsg(tf('%(title)s · nota %(n)s de %(total)s',{title:scaleTitle(),n:idx+1,total:app.seq.length})); }
  else if(S.input==='mic'&&!app.micOn) setMsg(gt('Activa el micrófono para que la app te escuche. También puedes tocar el teclado de la pantalla.'));
  else if(S.metro) setMsg(tf('%(title)s. Pulsa Empezar: habrá 4 tiempos de cuenta.',{title:scaleTitle()}));
  else setMsg(tf('%(title)s. Toca la primera nota para empezar.',{title:scaleTitle()}));
  markStaff(); updateKeys();
}

/* ---------- micrófono: lo que se oye, nivel y diagnóstico ---------- */
let hearLast=null;
export function hearing(m){
  if(m===hearLast) return; hearLast=m;
  const el=$('#hearing'); if(!el) return;
  if(m==null){el.innerHTML=gt('Oyendo:')+' <b>–</b>';return;}
  const s=spellMidi(m); el.innerHTML=`${gt('Oyendo:')} <b>${s.name}${s.oct}</b>`;
}
export function hearingText(label){hearLast=undefined;const el=$('#hearing');if(el) el.innerHTML=`${gt('Oyendo:')} <b>${label||'–'}</b>`;}

const dB=v=>Math.round(20*Math.log10(v+1e-9));
export function showDiag(d,gate){
  const el=$('#diag'); if(!el||el.hidden) return;
  const c=ctxInfo();
  el.textContent=tf('Audio %(state)s · %(rate)s Hz · nivel %(level)s dB · umbral %(gate)s dB · tono %(pitch)s · claridad %(clar)s',{state:c?c.state:'–',rate:c?c.sampleRate:0,level:dB(d.rms),gate:dB(gate),pitch:d.f?d.f.toFixed(1)+' Hz':'–',clar:d.clar.toFixed(2)});
}
export function showLevel(rms,gate){
  const toPct=v=>Math.max(0,Math.min(100,(20*Math.log10(v+1e-9)+90)/80*100));
  $('#meterFill').style.width=toPct(rms)+'%';
  $('#meterFill').style.background=rms>=gate?'var(--ok)':'var(--muted)';
  $('#meterGate').style.left=toPct(gate)+'%';
}
export function updateMicUI(){
  const b=$('#micBtn');
  if(S.input==='midi'){b.textContent=gt('Entrada: MIDI');b.classList.add('live');return;}
  b.textContent=app.micOn?gt('Micrófono activo'):gt('Activar micrófono');
  b.classList.toggle('live',app.micOn);
}

/* ---------- metrónomo, tempo y récords ---------- */
export function renderBeats(active){$$('#beats i').forEach((el,i)=>el.classList.toggle('on',i===active));}
export function updateBpm(){$('#bpmOut').innerHTML=`${S.bpm} <small>BPM</small>`;}
export function updateRecord(){
  const r=getRecord(recKey());
  const chords=S.mode==='chords';
  const tail=r?(r.bpm?tf(' · limpia hasta <b>%(bpm)s BPM</b>',{bpm:r.bpm}):'')+' · '+tn('%(n)s intento','%(n)s intentos',r.runs)+'.':'';
  $('#record').innerHTML=r?(chords?tf('Tu mejor pasada en este círculo: <b>%(best)s</b>',{best:r.best+'%'}):tf('Tu mejor pasada en esta escala: <b>%(best)s</b>',{best:r.best+'%'}))+tail
    :(chords?gt('Aún no has practicado este círculo con estas opciones.'):gt('Aún no has practicado esta escala con estas opciones.'));
}
