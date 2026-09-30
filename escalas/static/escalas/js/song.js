/* Canciones: por nivel, primero mano derecha, luego izquierda y luego juntas.
   Dos modos: «Espera» (la partitura avanza cuando tocas bien) y «A tempo» (avanza sola con el pulso
   y se juzga cada nota: perfecto, bien o fallada). Se puede practicar un fragmento de compases en bucle. */
import {$,readJson,store} from './dom.js';
import {S,save} from './state.js';
import {mod12} from './theory.js';
import {ac,tone,metroStart,metroStop,pauseAudio,resumeAudio,cutAudio} from './audio.js';
import {startMic,configureMic} from './mic.js';
import {recordAttempt,getRecord,savePreference} from './api.js';
import {fitRange,renderKeys,flashKey,bindKeys} from './keyboard.js';
import {scoreSvg,nameInKey} from './staff.js';
import {showLevel} from './ui.js';
import {setupInputSelector} from './inputsel.js';
import {createFalling} from './falling.js';
import {gt,tf,tn} from './i18n.js';

const SONG=readJson('song');
const HANDS={rh:gt('Mano derecha'),lh:gt('Mano izquierda'),both:gt('Manos juntas')};
const STEPS=['rh','lh','both'];
const STAR_AT=[60,80,95];       // % de notas bien para 1, 2 y 3 estrellas
const UNLOCK_AT=STAR_AT[0];     // una estrella en un paso desbloquea el siguiente
const WINDOW=10;                // columnas visibles de la partitura
const kb=$('#kb');

const saved=store.get('song:'+SONG.slug,{});
let sel={level:saved.level??SONG.arrangements[0].level,hand:saved.hand||'rh'};
if(!SONG.arrangements.some(a=>a.level===sel.level)) sel.level=SONG.arrangements[0].level;
let opts=Object.assign({mode:'wait',tempoPct:100,metro:true,loop:false},saved.opts);
const SPEEDS=[30,60,90,100,120,150];
opts.tempoPct=SPEEDS.reduce((b,x)=>Math.abs(x-opts.tempoPct)<Math.abs(b-opts.tempoPct)?x:b,100);  // valores guardados de antes
delete opts.view;  // la vista ya no se guarda aquí: sale de las preferencias del usuario
let frag={from:1,to:0};         // compases elegidos (to=0: hasta el final)
let G={running:false}, demo=null, timer=null;
const persist=()=>store.set('song:'+SONG.slug,{...sel,opts});

const arr=()=>SONG.arrangements.find(a=>a.level===sel.level);
const recKey=(level,hand,tempo)=>`song:${SONG.slug}:${level}:${hand}${tempo?':tempo':''}`;
const bestOf=(level,hand,tempo)=>(getRecord(recKey(level,hand,tempo))||{}).best||0;
const starsFor=pct=>STAR_AT.filter(x=>pct>=x).length;
const starStr=n=>'★'.repeat(n)+'☆'.repeat(3-n);
const unlocked=(level,hand)=>{const i=STEPS.indexOf(hand);return SONG.unlock_all||i===0||bestOf(level,STEPS[i-1])>=UNLOCK_AT;};
const name=m=>nameInKey(m,arr().key);
const matches=(a,b)=>S.strict?a===b:mod12(a-b)===0;
const mult=()=>1+Math.min(3,Math.floor(G.combo/10));
const bpm=()=>Math.round(arr().tempo*opts.tempoPct/100);
const nBars=()=>{const a=arr(),n=a.notes;return Math.ceil(Math.max(...n.rh.concat(n.lh).map(([t,d])=>t+d))/a.beats-1e-6);};
const fragTo=()=>frag.to||nBars();
const isFull=()=>frag.from===1&&fragTo()===nBars();

function setMsg(t,kind){const el=$('#cueMsg');el.textContent=t;el.dataset.kind=kind||'';}

/* ---------- datos ---------- */
function events(hand){
  const a=arr(), n=a.notes, fg=a.fingering||{}, pick=h=>n[h].map(([t,d,m],i)=>({t,d,m,hand:h,f:(fg[h]||[])[i]||null}));
  return hand==='both'?pick('rh').concat(pick('lh')):pick(hand);
}
/* agrupa las notas que empiezan a la vez: cada grupo es un «momento» a tocar */
function buildGroups(hand,from=1,to=Infinity){
  const byT=new Map(), beats=arr().beats;
  for(const e of events(hand)){
    const bar=Math.floor(e.t/beats+1e-6)+1;
    if(bar<from||bar>to) continue;
    const k=Math.round(e.t*1000);
    if(!byT.has(k)) byT.set(k,[]);
    byT.get(k).push({...e,state:null});
  }
  return [...byT.entries()].sort((a,b)=>a[0]-b[0])
    .map(([k,notes])=>({t:k/1000,bar:Math.floor(k/1000/beats+1e-6)+1,notes,err:false,done:false}));
}
function rangeOf(hand){
  const ms=events(hand).map(e=>e.m);
  return ms.length?[Math.min(...ms),Math.max(...ms)]:[60,72];
}

/* rango de las notas que se ven ahora: así el hueco entre pentagramas no lo marca una nota lejana de otra parte de la canción */
function rangeOfCols(cols,hand){
  const ms=cols.flatMap(c=>c[hand].map(n=>n.midi));
  return ms.length?[Math.min(...ms),Math.max(...ms)]:null;
}

/* ---------- partitura ---------- */
function drawScore(idx=-1,groups=G.groups||buildGroups(sel.hand,frag.from,fragTo())){
  if(!groups.length){$('#songStaff').innerHTML='';return;}
  const start=Math.max(0,Math.min(Math.max(idx,0)-2,groups.length-WINDOW));
  const cols=groups.slice(start,start+WINDOW).map((g,i)=>{
    const gi=start+i, newBar=i===0||g.bar!==groups[gi-1].bar;
    let cls='';
    if(g.done) cls=g.err?'err':'ok';   // en modo espera, al acertar por fin la nota pasa de rojo a verde
    else if(gi===idx) cls=g.err?'cur err'+(g.hop?' hop':''):'cur';   // dos fallos seguidos: la nota da saltitos
    return {t:g.t,cls,bar:newBar,barNo:newBar?g.bar:null,
      rh:g.notes.filter(n=>n.hand==='rh').map(n=>({midi:n.m,d:n.d,f:n.f})),
      lh:g.notes.filter(n=>n.hand==='lh').map(n=>({midi:n.m,d:n.d,f:n.f}))};
  });
  const a=arr(), hand=sel.hand;
  const staves=hand==='rh'?['treble']:hand==='lh'?['bass']:['treble','bass'];
  $('#songStaff').innerHTML=scoreSvg({staves,key:a.key,beats:a.beats,columns:cols,
    ranges:{treble:rangeOfCols(cols,'rh'),bass:rangeOfCols(cols,'lh')},fingers:showFingers(),width:760,h:7,timeSig:start===0&&groups[0].bar===1});
}

/* ---------- lluvia de notas ---------- */
let idleCache={key:'',groups:[]}, waitPos=null;
function idleGroups(){
  const key=[sel.level,sel.hand,frag.from,fragTo()].join('|');
  if(idleCache.key!==key) idleCache={key,groups:buildGroups(sel.hand,frag.from,fragTo())};
  return idleCache.groups;
}
/* posición actual en tiempos, los momentos a dibujar y cuál toca ahora */
function fallView(){
  const a=arr(), secPerBeat=60/bpm();
  const base={fingers:showFingers(),beats:a.beats,secPerBeat,hands:sel.hand==='both'?['rh','lh']:[sel.hand]};
  if(demo) return {...base,beat:(ac().currentTime-demo.t0)/secPerBeat+demo.base,groups:demo.groups,cur:-1};
  if(G.groups&&G.mode==='tempo'&&G.t0!=null){
    const now=G.running?gameNow():G.endBeatTime??gameNow();
    return {...base,beat:(now-G.t0)/G.spb+G.base,groups:G.groups,cur:G.running?G.shown:-1};
  }
  if(G.groups&&G.mode==='wait'){
    // la lluvia baja hasta el momento pendiente y espera ahí
    const g=G.groups[Math.min(G.resolved,G.groups.length-1)];
    const target=G.resolved>=G.groups.length?g.t+1:g.t;
    waitPos=waitPos==null?target:waitPos+(target-waitPos)*0.18;
    return {...base,beat:waitPos,groups:G.groups,cur:G.running?G.resolved:-1};
  }
  const groups=idleGroups();
  waitPos=null;
  return {...base,beat:groups.length?groups[0].t-0.5:0,groups,cur:-1};
}
const fall=createFalling($('#fall'),kb,fallView);
/* la vista (partitura o lluvia de notas) es una preferencia del usuario: se cambia aquí o en Preferencias */
let view=SONG.view==='rain'?'rain':'staff';
/* al mostrar u ocultar los dedos se vuelve a dibujar lo que hay en pantalla */
function applyFingers(){
  if(G.running&&G.mode==='wait'&&G.groups&&G.groups[G.resolved]) guide(G.groups[G.resolved].notes.filter(n=>G.remaining.has(n.m)));
  else if(G.running&&G.mode==='tempo'&&G.groups) tempoTick();
  drawScore(G.running?G.resolved:-1);
}
function applyView(){
  const rain=view==='rain';
  $('#songApp').classList.toggle('falling',rain);
  $('#fall').hidden=!rain; $('#songStaff').hidden=rain;
  $('#viewSeg').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===view)));
  if(rain) fall.start(); else {fall.stop(); drawScore(G.running?G.resolved:-1);}
}
$('#viewSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.dataset.v===view)return;
  view=b.dataset.v; applyView(); savePreference('song_view',view);});

/* ---------- selección de nivel, paso, modo y fragmento ---------- */
function renderSelectors(){
  $('#levelSeg').innerHTML=SONG.arrangements.map(a=>
    `<button data-level="${a.level}" aria-pressed="${a.level===sel.level}">${a.label}<small>${starStr(starsFor(bestOf(a.level,'both')))}</small></button>`).join('');
  $('#steps').innerHTML=STEPS.map((h,i)=>{
    const lock=!unlocked(sel.level,h), best=bestOf(sel.level,h), tb=getRecord(recKey(sel.level,h,true));
    return `<button class="step${lock?' locked':''}" data-hand="${h}" aria-pressed="${h===sel.hand}"${lock?' aria-disabled="true"':''}>
      <span class="step-num">${lock?'🔒':i+1}</span>
      <span class="step-body"><b>${HANDS[h]}</b><span class="stars">${starStr(starsFor(best))}</span>
      ${tb?`<span class="step-tempo">a tempo ${tb.best}% · ${tb.bpm||'–'} BPM</span>`:''}</span>
      <span class="step-best">${best?best+'%':''}</span></button>`;
  }).join('');
  const a=arr();
  $('#arrInfo').innerHTML=`<b>${a.title}</b> · ${a.tempo} BPM${a.description?' · '+a.description:''}`;
  $('#modeSeg').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===opts.mode)));
  const tempo=opts.mode==='tempo';
  $('#rhythmBox').hidden=!tempo; $('#metroBox').hidden=!tempo;
  $('#speedSeg').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===opts.tempoPct)));
  $('#tempoOut').textContent=`${bpm()} BPM`;
  $('#metroChk').checked=opts.metro; $('#loopChk').checked=opts.loop;
}
function renderFragment(){
  const n=nBars(), opt=v=>Array.from({length:n},(_,i)=>`<option value="${i+1}"${i+1===v?' selected':''}>${i+1}</option>`).join('');
  $('#fromSel').innerHTML=opt(frag.from); $('#toSel').innerHTML=opt(fragTo());
  $('#fragInfo').textContent=isFull()?gt('Canción completa'):tf('Fragmento: compases %(from)s–%(to)s (no cuenta para estrellas)',{from:frag.from,to:fragTo()});
  $('#fragAll').hidden=isFull();
  renderSections();
}
/* secciones: si el MIDI traía marcadores («Coro», «Estrofa»…) se usan esas partes; si no, la canción
   se trocea en tandas de compases. Un toque y se practica solo esa parte */
function sectionSize(n){return n<=8?2:4;}
function renderSections(){
  const n=nBars(), size=sectionSize(n), from=frag.from, to=fragTo();
  const chip=(f,t,label,extra={})=>({f,t,label,...extra});
  let chips=[chip(1,n,gt('Todo'))];
  const named=(SONG.sections||[]).filter(x=>x.from>=1&&x.from<=x.to&&x.from<=n).map(x=>({...x,to:Math.min(x.to,n)}));
  if(named.length>1){
    chips=chips.concat(named.map(x=>chip(x.from,x.to,x.name,{chorus:x.chorus,range:x.from===x.to?`${x.from}`:`${x.from}–${x.to}`})));
  } else if(n>size){
    for(let f=1;f<=n;f+=size){const t=Math.min(n,f+size-1);chips.push(chip(f,t,f===t?`${f}`:`${f}–${t}`));}
  }
  $('#sectionChips').innerHTML=chips.map(c=>{
    const on=c.f===from&&c.t===to;
    return `<button type="button" class="chip-btn${on?' on':''}${c.chorus?' chorus':''}" data-f="${c.f}" data-t="${c.t}" aria-pressed="${on}">${c.label}${c.range?`<small>${c.range}</small>`:''}</button>`;
  }).join('');
}
$('#sectionChips').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  changeFragment(+b.dataset.f,+b.dataset.t);});
function select(level,hand){
  stopAll();
  const levelChanged=level!==sel.level;
  sel={level,hand}; persist();
  if(levelChanged) frag={from:1,to:0};
  G={running:false};
  $('#results').hidden=true;
  renderKeys(kb,...fitRange(...rangeOf(hand)));
  renderSelectors(); renderFragment(); drawScore(); updateHud(true);
  markKeys([]);
  idleMsg();
}
function idleMsg(){
  const total=buildGroups(sel.hand,frag.from,fragTo()).reduce((s,g)=>s+g.notes.length,0);
  setMsg(opts.mode==='tempo'
    ?tf('%(hand)s: %(total)s notas a %(bpm)s BPM. Tras un compás de cuenta, la partitura avanza sola.',{hand:HANDS[sel.hand],total,bpm:bpm()})
    :tf('%(hand)s: %(total)s notas. Pulsa Empezar; la partitura espera a que toques cada nota.',{hand:HANDS[sel.hand],total}));
}
$('#levelSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  const level=+b.dataset.level; select(level,unlocked(level,sel.hand)?sel.hand:'rh');});
$('#steps').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  const h=b.dataset.hand, i=STEPS.indexOf(h);
  if(!unlocked(sel.level,h)){setMsg(tf('Primero consigue una estrella (%(pct)s de notas bien) en «%(hand)s».',{pct:UNLOCK_AT+'%',hand:HANDS[STEPS[i-1]]}),'bad');return;}
  select(sel.level,h);});
$('#modeSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  stopAll(); opts.mode=b.dataset.v; persist(); G={running:false}; renderSelectors(); drawScore(); updateHud(true); idleMsg();});
$('#speedSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||+b.dataset.v===opts.tempoPct)return;
  const beat=demo?demoBeat():null, wasPaused=demo&&demo.paused;
  if(G.running) stopAll();
  opts.tempoPct=+b.dataset.v; persist(); renderSelectors();
  if(beat!=null){ startDemo(beat); if(wasPaused) pauseDemo(); }  // el ejemplo sigue desde donde estaba, a la nueva velocidad
  else idleMsg();});
$('#metroChk').onchange=e=>{opts.metro=e.target.checked;persist();};
$('#loopChk').onchange=e=>{opts.loop=e.target.checked;persist();};
function changeFragment(from,to){
  stopAll();
  frag={from:Math.min(from,to),to:Math.max(from,to)===nBars()?0:Math.max(from,to)};
  G={running:false}; renderFragment(); drawScore(); updateHud(true); idleMsg();
}
$('#fromSel').onchange=e=>changeFragment(+e.target.value,fragTo());
$('#toSel').onchange=e=>changeFragment(frag.from,+e.target.value);
$('#fragAll').onclick=()=>changeFragment(1,nBars());

/* ---------- marcador ---------- */
function updateHud(reset){
  const total=G.total||buildGroups(sel.hand,frag.from,fragTo()).reduce((s,g)=>s+g.notes.length,0);
  $('#score').textContent=reset?0:G.score;
  $('#good').innerHTML=`${reset?0:G.good}<small> / ${total}</small>`;
  $('#combo').textContent=reset||!G.combo?'–':`${G.combo} · ×${mult()}`;
  if(reset) $('#rhythm').textContent='–';
  $('#progFill').style.width=reset?'0%':(G.resolved/G.groups.length*100)+'%';
}
function pop(text){const el=$('#pop');el.textContent=text;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');}
/* teclas esperadas; con «fingers» (nota → {dedo, mano}) cada una lleva su número de dedo */
function markKeys(midis,fingers){
  kb.querySelectorAll('.key').forEach(k=>{
    const m=+k.dataset.midi, on=midis.includes(m), f=on&&fingers?fingers[m]:null, el=k.querySelector('.fing');
    k.classList.toggle('expect',on);
    if(el){ el.textContent=f?f.f:''; el.classList.toggle('has',!!f); el.dataset.hand=f?f.hand:''; }
  });
}
const showFingers=()=>S.songFingers!==false;
/* notes: las notas (con su dedo) que toca tocar ahora */
function guide(notes){
  const on=$('#guideChk').checked;
  markKeys(on?notes.map(n=>n.m):[],on&&showFingers()?Object.fromEntries(notes.filter(n=>n.f).map(n=>[n.m,{f:n.f,hand:n.hand}])):null);
}
function addPoints(notes,factor){
  const before=mult();
  G.score+=Math.round(10*notes*before*factor);
  G.combo+=notes; G.maxCombo=Math.max(G.maxCombo,G.combo);
  if(mult()>before) pop(tf('¡Combo ×%(n)s!',{n:mult()}));
}
function breakCombo(){if(G.combo>=10) pop(gt('Combo perdido'));G.combo=0;}

/* ---------- juego: común ---------- */
function startGame(){
  stopDemo(); ac();
  if(S.input!=='midi') startMic();
  const groups=buildGroups(sel.hand,frag.from,fragTo());
  if(!groups.length){setMsg(gt('Esta versión no tiene notas para esta mano en esos compases.'),'bad');return;}
  G={running:true,mode:opts.mode,groups,resolved:0,score:0,combo:0,maxCombo:0,good:0,perfect:0,errors:0,
     total:groups.reduce((s,g)=>s+g.notes.length,0),times:[],devs:[],startedAt:performance.now(),
     prevPcs:new Set(),pass:(G.pass||0)+1,full:isFull()};
  $('#results').hidden=true; $('#startBtn').textContent=gt('Detener');
  waitPos=null;
  if(G.pass>1) return beginPlay();      // repetición automática: sin cuenta atrás
  // cuenta atrás para colocar las manos; se muestran las primeras notas con sus dedos
  guide(G.groups[0].notes);
  let left=COUNTDOWN;
  const tick=()=>{
    if(!G.running) return;
    if(left<=0){ countdownTimer=null; return beginPlay(); }
    setMsg(tf('Coloca las manos… empezamos en %(n)s',{n:left})); left--;
    countdownTimer=setTimeout(tick,1000);
  };
  tick();
}
const COUNTDOWN=5;
let countdownTimer=null;
function beginPlay(){
  markKeys([]);
  if(G.mode==='tempo') startTempo(); else nextGroup();
}
function stopAll(msg){
  clearTimeout(countdownTimer); countdownTimer=null;
  const was=G.running;
  if(was&&G.mode==='tempo'&&G.t0!=null) G.endBeatTime=gameNow();  // la lluvia se queda donde paró
  G.running=false; G.pass=0;
  clearInterval(timer); metroStop(); stopDemo();
  $('#startBtn').textContent=gt('Empezar'); markKeys([]);
  if(was&&msg) setMsg(msg);
}

/* ---------- modo espera ---------- */
function nextGroup(){
  const g=G.groups[G.resolved];
  Object.assign(G,{remaining:new Set(g.notes.map(n=>n.m)),hit:new Set(),lastWrong:null,shownAt:performance.now()});
  drawScore(G.resolved); updateHud(); guide(g.notes.filter(n=>G.remaining.has(n.m)));
  const names=[...G.remaining].sort((a,b)=>a-b).map(name);
  setMsg(names.length>1?tf('Toca juntas: %(notes)s',{notes:names.join(' + ')}):gt('Toca la nota marcada.'));
}
function waitNote(m,src){
  const g=G.groups[G.resolved];
  const target=[...G.remaining].find(x=>matches(x,m));
  if(target!=null){
    G.remaining.delete(target); G.hit.add(mod12(m));
    flashKey(kb,m,'hit-ok');
    // el micrófono oye una nota a la vez: en un momento con varias notas basta con reconocer una
    if(G.remaining.size===0||src==='mic') return completeWaitGroup(g);
    guide(g.notes.filter(n=>G.remaining.has(n.m))); setMsg(tf('Bien. Falta: %(notes)s',{notes:[...G.remaining].map(name).join(' + ')}),'ok');
    return;
  }
  const pc=mod12(m);
  if(G.prevPcs.has(pc)||G.hit.has(pc)) return;  // una nota que aún suena no es error
  if(G.lastWrong&&G.lastWrong.m===m&&performance.now()-G.lastWrong.t<1200) return;
  G.lastWrong={m,t:performance.now()};
  G.errors++; g.err=true; g.hop=(g.wrong=(g.wrong||0)+1)>=2; breakCombo();
  flashKey(kb,m,'hit-bad');
  drawScore(G.resolved); updateHud();
  setMsg(tf('Sonó %(got)s. Busca %(want)s.',{got:name(m),want:[...G.remaining].map(name).join(' + ')}),'bad');
}
function completeWaitGroup(g){
  G.times.push(performance.now()-G.shownAt);
  if(!g.err){ G.good+=g.notes.length; addPoints(g.notes.length,1); }
  g.done=true; g.err=false; g.hop=false;   // el error cuenta en la puntuación, pero la nota ya se tocó bien: verde
  G.prevPcs=new Set(g.notes.map(n=>mod12(n.m)));
  G.resolved++;
  if(G.resolved<G.groups.length) return nextGroup();
  finishGame();
}

/* ---------- modo a tempo ---------- */
function windows(spb){return {perfect:Math.min(0.1,0.2*spb),good:Math.min(0.25,0.45*spb)};}
/* reloj del juego: el de audio anclado al de performance al empezar. Así las teclas (MIDI y pantalla)
   se miden con la marca de tiempo del evento aunque la página esté ocupada dibujando. */
const gameNow=()=>G.aud0+(performance.now()-G.perf0)/1000;
const eventTime=ts=>G.aud0+(ts-G.perf0)/1000;
function startTempo(){
  const a=arr(), spb=60/bpm(), c=ac();
  const firstBarBeat=(G.groups[0].bar-1)*a.beats;
  const countIn=a.beats*spb, tStart=c.currentTime+0.3;
  G.aud0=c.currentTime; G.perf0=performance.now();
  G.spb=spb; G.win=windows(spb); G.t0=tStart+countIn;       // momento del tiempo 0 del fragmento
  G.base=firstBarBeat;
  G.groups.forEach(g=>{g.T=G.t0+(g.t-firstBarBeat)*spb;});
  G.lastT=G.groups[G.groups.length-1].T;
  metroStart(tStart,bi=>{
    if(bi<a.beats&&G.running) setMsg(bi<a.beats-1?tf('Cuenta: %(n)s…',{n:bi+1}):tf('%(n)s… ¡ahora!',{n:bi+1}));
  },{bpm:bpm(),beats:a.beats});
  if(!opts.metro) setTimeout(()=>{ if(G.running) metroStop(); },(countIn+0.3)*1000);
  G.shown=-1;
  drawScore(0); updateHud();
  // temporizador y no requestAnimationFrame: la lógica sigue aunque el navegador no dibuje cuadros
  timer=setInterval(tempoTick,30);
}
/* índice del primer momento que todavía se puede tocar */
function currentIndex(now){
  const i=G.groups.findIndex(g=>!g.done&&g.T+G.win.good>=now);
  return i<0?G.groups.length:i;
}
function tempoTick(){
  if(!G.running||G.mode!=='tempo') return clearInterval(timer);
  const now=gameNow();
  let changed=false;
  for(const g of G.groups){
    if(g.done||g.T+G.win.good>=now) continue;
    const missed=g.notes.filter(n=>!n.state);
    // con el micrófono basta con una nota del grupo; sin ninguna, se fallan todas
    if(missed.length&&!(g.micHit)){ missed.forEach(n=>{n.state='miss';}); g.err=true; breakCombo(); }
    g.done=true; G.resolved++; changed=true;
  }
  const idx=currentIndex(now);
  if(idx!==G.shown||changed){
    G.shown=idx; drawScore(idx); updateHud();
    const g=G.groups[idx]; guide(g?g.notes.filter(n=>!n.state):[]);
  }
  if(now>=G.t0) $('#progFill').style.width=Math.min(100,(now-G.t0)/(G.lastT-G.t0+G.spb)*100)+'%';
  if(G.resolved>=G.groups.length) finishGame();
}
function tempoNote(m,src,time){
  const W=G.win;
  // el momento pendiente más cercano en el tiempo que tenga esta nota sin tocar
  let best=null;
  for(const g of G.groups){
    if(g.done||Math.abs(time-g.T)>W.good) continue;
    const n=g.notes.find(n=>!n.state&&matches(n.m,m));
    if(n&&(!best||Math.abs(time-g.T)<Math.abs(time-best.g.T))) best={g,n};
  }
  if(best){
    const {g,n}=best, dev=time-g.T, perfect=Math.abs(dev)<=W.perfect;
    n.state=perfect?'perfect':'good';
    if(src==='mic') g.micHit=true;
    G.good++; if(perfect) G.perfect++;
    G.devs.push(dev*1000);
    addPoints(1,perfect?1:0.6);
    flashKey(kb,m,'hit-ok');
    $('#rhythm').textContent=perfect?gt('¡Perfecto!'):dev<0?gt('Pronto'):gt('Tarde');
    $('#rhythm').dataset.kind=perfect?'ok':'late';
    if(src==='mic') g.notes.filter(x=>!x.state).forEach(x=>{x.state='assumed';G.good++;});
    G.recent={pcs:new Set(g.notes.map(x=>mod12(x.m))),t:time};
    updateHud();
    return;
  }
  // nota que no toca ahora: se ignora si aún suena la anterior
  if(G.recent&&G.recent.pcs.has(mod12(m))&&time-G.recent.t<Math.max(1.2,G.spb*2)) return;
  if(G.lastWrong&&G.lastWrong.m===m&&time-G.lastWrong.t<1.2) return;
  G.lastWrong={m,t:time};
  G.errors++; breakCombo();
  flashKey(kb,m,'hit-bad');
  $('#rhythm').textContent=gt('Fuera de tiempo'); $('#rhythm').dataset.kind='bad';
  updateHud();
}

/* ---------- final de ronda ---------- */
function finishGame(){
  clearInterval(timer); metroStop();
  if(G.mode==='tempo') G.endBeatTime=gameNow();
  const a=arr(), hand=sel.hand, tempo=G.mode==='tempo';
  const pct=Math.round(G.good/G.total*100), stars=starsFor(pct);
  const key=recKey(a.level,hand,tempo), prev=getRecord(key)||{best:0,score:0};
  const nextHand=STEPS[STEPS.indexOf(hand)+1];
  const wasLocked=nextHand&&!unlocked(a.level,nextHand);
  const avgDev=G.devs.length?G.devs.reduce((s,x)=>s+Math.abs(x),0)/G.devs.length:null;
  G.running=false;
  drawScore(G.groups.length); updateHud();
  $('#progFill').style.width='100%';
  if(G.full){
    recordAttempt({mode:'song',config_key:key,
      title:`${SONG.title} · ${a.label} · ${HANDS[hand]}${tempo?' · a tempo':''}`,accuracy:pct,
      errors:G.errors,duration:Math.round((performance.now()-G.startedAt)/100)/10,bpm:tempo?bpm():null,
      timing_ms:tempo?Math.round(avgDev??0):Math.round(G.times.reduce((s,x)=>s+x,0)/Math.max(1,G.times.length)),
      score:G.score}).then(renderSelectors);
    renderSelectors();
  }
  // en bucle, el fragmento vuelve a empezar solo
  if(opts.loop){
    setMsg(tf('Vuelta %(pass)s: %(pct)s de notas bien%(dev)s. Otra vez…',{pass:G.pass,pct:pct+'%',dev:tempo&&avgDev!=null?tf(', desvío medio %(ms)s ms',{ms:Math.round(avgDev)}):''}),stars?'ok':'bad');
    const pass=G.pass;
    setTimeout(()=>{ if(!G.running&&G.pass===pass&&$('#startBtn').textContent===gt('Detener')) startGame(); },1600);
    return;
  }
  $('#startBtn').textContent=gt('Empezar'); markKeys([]);
  const unlockedNow=G.full&&!tempo&&wasLocked&&unlocked(a.level,nextHand);
  const nextLevel=SONG.arrangements.find(x=>x.level===a.level+1);
  const extra=[
    !G.full?`<p>${tf('Practicaste los compases %(from)s–%(to)s. Los fragmentos no cuentan para las estrellas.',{from:frag.from,to:fragTo()})}</p>`:'',
    G.full&&G.score>prev.score?`<p class="badge-new">${gt('¡Nuevo récord de puntos!')}</p>`:'',
    unlockedNow?`<p>${tf('Desbloqueaste <b>%(hand)s</b>.',{hand:HANDS[nextHand]})}</p>`:'',
    tempo&&avgDev!=null?`<p>${tf('%(advice)s Desvío medio: %(ms)s ms.',{advice:timingAdvice(G.devs),ms:Math.round(avgDev)})}</p>`:'',
    tempo&&pct>=STAR_AT[1]&&opts.tempoPct<100?`<p>${tf('Muy bien a %(bpm)s BPM. Prueba a subir el tempo.',{bpm:bpm()})}</p>`:'',
    !tempo&&hand==='both'&&stars>=2&&nextLevel?`<p>${tf('Ya dominas este nivel. Prueba <b>%(level)s</b>.',{level:nextLevel.label})}</p>`:'',
    stars===0?`<p>${tf('Necesitas %(pct)s de notas bien para la primera estrella. ¡Otra vez!',{pct:UNLOCK_AT+'%'})}</p>`:'',
  ].join('');
  const res=$('#results');
  res.innerHTML=`<div class="result-stars" aria-label="${tf('%(n)s de 3 estrellas',{n:stars})}">${starStr(stars)}</div>
    <h2>${[gt('Sigue intentando'),gt('¡Bien!'),gt('¡Muy bien!'),gt('¡Perfecto!')][stars]}${tempo?` <small>${tf('a %(bpm)s BPM',{bpm:bpm()})}</small>`:''}</h2>
    <div class="stats">
      <div><b>${G.good}<small> / ${G.total}</small></b><span>${gt('notas bien')}</span></div>
      ${tempo?`<div><b>${G.perfect}</b><span>${gt('perfectas')}</span></div>`:''}
      <div><b>${G.score}</b><span>${gt('puntos')}</span></div>
      <div><b>${G.maxCombo}</b><span>${gt('combo máximo')}</span></div>
      <div><b>${G.errors}</b><span>${gt('errores')}</span></div>
    </div>${extra}
    <div class="actions" style="margin-top:12px">
      <button class="btn primary" id="againBtn">${gt('Repetir')}</button>
      ${nextHand&&unlocked(a.level,nextHand)&&G.full&&!tempo?`<button class="btn" id="nextBtn">${tf('Siguiente: %(hand)s',{hand:HANDS[nextHand]})}</button>`:''}
    </div>`;
  res.hidden=false;
  $('#againBtn').onclick=()=>{G.pass=0;startGame();};
  const nb=$('#nextBtn'); if(nb) nb.onclick=()=>select(a.level,nextHand);
  setMsg(tf('%(pct)s de notas bien.',{pct:pct+'%'}),stars?'ok':'bad');
}
function timingAdvice(devs){
  const mean=devs.reduce((s,x)=>s+x,0)/devs.length;
  return mean>40?gt('Tiendes a tocar tarde.'):mean<-40?gt('Tiendes a adelantarte.'):gt('Vas centrado en el pulso.');
}

/* ---------- escuchar (sigue la partitura; se puede avanzar y retroceder) ---------- */
const seek={dragging:false};
function stopDemo(){
  if(!demo) return;
  if(demo.paused) resumeAudio();
  clearInterval(demo.follow); clearInterval(demo.sched); demo=null;
  cutAudio();
  $('#listenBtn').textContent=gt('Escuchar');
  $('#pauseBtn').hidden=true; $('#listenBar').hidden=true;
  drawScore();
}
function pauseDemo(){
  if(!demo) return;
  demo.paused=!demo.paused;
  if(demo.paused){ pauseAudio(); setMsg(gt('En pausa. Puedes moverte por la canción con la barra.')); }
  else { resumeAudio(); setMsg(tf('Escuchando a %(bpm)s BPM. La app no detecta notas mientras suena el ejemplo.',{bpm:bpm()})); }
  $('#pauseBtn').textContent=demo.paused?gt('Seguir'):gt('Pausa');
}
const fragStartBeat=()=>(frag.from-1)*arr().beats;
const fragEndBeat=()=>fragTo()*arr().beats;
function seekLabel(beat){
  const a=arr(), bar=Math.min(fragTo(),Math.max(frag.from,Math.floor(beat/a.beats+1e-6)+1));
  return tf('Compás %(bar)s de %(total)s',{bar,total:nBars()});
}
/* empieza (o salta a) el ejemplo desde un tiempo dado, en tiempos de la canción */
function startDemo(startBeat){
  const a=arr(), spb=60/bpm(), groups=buildGroups(sel.hand,frag.from,fragTo());
  if(!groups.length){setMsg(gt('Esta versión no tiene notas para esta mano en esos compases.'),'bad');return;}
  if(demo){ if(demo.paused) resumeAudio(); clearInterval(demo.follow); clearInterval(demo.sched); demo=null; }
  cutAudio();
  const c=ac(), t0=c.currentTime+0.15;
  const from=fragStartBeat(), endBeat=fragEndBeat();
  startBeat=Math.min(endBeat-1e-3,Math.max(from,startBeat));
  const notes=groups.flatMap(g=>g.notes.map(n=>({t:g.t,at:(g.t-startBeat)*spb,m:n.m,d:n.d,hand:n.hand})))
    .filter(n=>n.t>=startBeat-1e-6);
  const end=Math.max((endBeat-startBeat)*spb,...notes.map(n=>n.at+n.d*spb));
  demo={follow:0,sched:0,t0,base:startBeat,groups,paused:false};
  // todo va con el reloj de audio: al pausarlo se detienen a la vez el sonido, las teclas y la lluvia de notas.
  // se programa por tandas, un poco por delante: miles de notas de golpe saturan el audio y no suena nada
  let next=0, lit=0;
  const schedule=()=>{
    const now=ac().currentTime;
    while(next<notes.length&&t0+notes[next].at<now+1.5){
      const n=notes[next++];
      tone(n.m,t0+n.at,Math.max(0.25,n.d*spb*0.95));
    }
    while(lit<notes.length&&t0+notes[lit].at<=now){
      const n=notes[lit++];
      flashKey(kb,n.m,'demo-'+n.hand,Math.max(200,n.d*spb*900));
    }
    if(now>t0+end+0.6){stopDemo();idleMsg();}
  };
  schedule(); demo.sched=setInterval(schedule,25);
  let shown=-1;
  const follow=()=>{
    if(!demo) return;
    const beat=Math.min(endBeat,(ac().currentTime-t0)/spb+startBeat);
    let i=groups.findIndex(g=>g.t>beat+1e-3); i=i<0?groups.length-1:Math.max(0,i-1);
    if(i!==shown){shown=i;drawScore(i,groups);}
    if(!seek.dragging){$('#seekRange').value=Math.round(beat-from);$('#seekOut').textContent=seekLabel(beat);}
  };
  follow(); demo.follow=setInterval(follow,50);
  const r=$('#seekRange'); r.max=Math.max(1,Math.round(endBeat-from));
  $('#listenBtn').textContent=gt('Detener');
  $('#pauseBtn').hidden=false; $('#pauseBtn').textContent=gt('Pausa'); $('#listenBar').hidden=false;
  setMsg(tf('Escuchando a %(bpm)s BPM. La app no detecta notas mientras suena el ejemplo.',{bpm:bpm()}));
}
function playDemo(){
  if(demo){stopDemo();idleMsg();return;}
  if(G.running) stopAll();
  startDemo(fragStartBeat());
}
/* posición actual del ejemplo, en tiempos de la canción */
const demoBeat=()=>demo?(ac().currentTime-demo.t0)/(60/bpm())+demo.base:fragStartBeat();
function seekBars(delta){
  if(!demo) return;
  const beats=arr().beats, bar=Math.floor(demoBeat()/beats+1e-6);
  // «compás anterior» pasado el primer tiempo y medio vuelve al inicio del compás actual, como en un reproductor
  const target=delta<0&&demoBeat()-bar*beats>1.5?bar:bar+delta;
  startDemo(target*beats);
}
$('#seekBack').onclick=()=>seekBars(-1);
$('#seekFwd').onclick=()=>seekBars(1);
$('#seekStart').onclick=()=>{ if(demo) startDemo(fragStartBeat()); };
$('#seekRange').addEventListener('input',e=>{seek.dragging=true;$('#seekOut').textContent=seekLabel(fragStartBeat()+ +e.target.value);});
$('#seekRange').addEventListener('change',e=>{seek.dragging=false;if(demo) startDemo(fragStartBeat()+ +e.target.value);});

/* ---------- entradas ---------- */
/* time: en segundos de audio (micrófono) o marca de performance.now() (MIDI y pantalla) */
function onNote(m,src,time){
  if(!G.running){flashKey(kb,m,'press');return;}
  if(G.mode==='tempo') return tempoNote(m,src,src==='mic'?time:eventTime(time??performance.now()));
  waitNote(m,src);
}
configureMic({
  listening:()=>S.input!=='midi',
  note:(m,t)=>onNote(m,'mic',t),
  hear:m=>{$('#hearing').innerHTML=`Oyendo: <b>${m==null?'–':name(m)}</b>`;},
  level:showLevel,
  error:msg=>setMsg(msg,'bad'),
  started:()=>{const b=$('#micBtn');b.textContent=gt('Micrófono activo');b.classList.add('live');},
});
setupInputSelector({onNoteOn:(m,ts)=>onNote(m,'midi',ts)});
$('#micBtn').onclick=()=>startMic();
$('#startBtn').onclick=()=>G.running||$('#startBtn').textContent===gt('Detener')?stopAll(gt('Detenido.')):(G.pass=0,startGame());
$('#listenBtn').onclick=playDemo;
$('#pauseBtn').onclick=pauseDemo;
$('#guideChk').checked=S.songGuide!==false;
$('#guideChk').onchange=e=>{S.songGuide=e.target.checked;save();if(!e.target.checked)markKeys([]);};
const fingerChk=$('#fingerChk');   // si la plantilla es anterior (servidor sin recargar), no debe romper el resto
if(fingerChk){ fingerChk.checked=showFingers(); fingerChk.onchange=e=>{S.songFingers=e.target.checked;save();applyFingers();}; }
$('#strictChk').checked=S.strict;
$('#strictChk').onchange=e=>{S.strict=e.target.checked;save();};
bindKeys(kb,(m,ts)=>{const c=ac();tone(m,c.currentTime,0.6);onNote(m,'touch',ts);});

select(sel.level,unlocked(sel.level,sel.hand)?sel.hand:'rh');
applyView();
