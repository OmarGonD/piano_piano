/* Pentagrama con clave, para ejercicios de lectura. */
import {ACC,NAT,SHARP_SPELL,letter,mod12} from './theory.js';
import {gt,tf,tn} from './i18n.js';

/* step = octava*7 + letra (Do=0 … Si=6); bottom = línea inferior; anchor = línea donde se apoya la clave */
export const CLEFS={
  treble:{bottom:30,anchor:30,glyph:'𝄞',name:gt('Clave de sol')},
  bass:{bottom:18,anchor:19,glyph:'𝄢',name:gt('Clave de fa')},
};

/* acepta un número MIDI (se escribe con sostenidos) o una nota ya escrita {midi, l, a} */
export function spell(n){
  const m=typeof n==='number'?n:n.midi;
  const [l,a]=typeof n==='object'&&n.l!=null?[n.l,n.a||0]:SHARP_SPELL[mod12(m)];
  const oct=Math.floor((m-a)/12)-1;
  return {l,a,oct,step:oct*7+l};
}
export const noteName=n=>{const s=spell(n);return letter(s.l,s.a)+s.oct;};

/* notes: [{midi, l?, a?, cls: 'cur'|'ok'|'err'|'ghost', label?}] */
export function staffSvg({clef='treble',notes=[],h=9,width=340,ariaLabel=''}){
  const C=CLEFS[clef], bot=C.bottom, top=bot+8;
  const steps=notes.map(n=>spell(n).step);
  const hiS=Math.max(top+3,...steps.map(s=>s+2)), loS=Math.min(bot-3,...steps.map(s=>s-2));
  const labels=notes.some(n=>n.label);
  const pad=10, H=(hiS-loS)*h+pad*2+(labels?26:0);
  const y=s=>pad+(hiS-s)*h;
  const x0=h*9, dx=Math.max(h*6,(width-x0-h*4)/Math.max(1,notes.length));
  let o=`<svg viewBox="0 0 ${width} ${H}" role="img" aria-label="${ariaLabel}">`;
  for(let s=bot;s<=top;s+=2) o+=`<line class="sl" x1="4" x2="${width-4}" y1="${y(s)}" y2="${y(s)}"/>`;
  o+=`<line class="sl" x1="4" x2="4" y1="${y(top)}" y2="${y(bot)}"/>`;
  o+=`<text class="clef-glyph" x="${h*1.2}" y="${y(C.anchor)}" font-size="${h*8}">${C.glyph}</text>`;
  notes.forEach((n,i)=>{
    const s=spell(n), x=x0+dx*(i+0.5), yy=y(s.step), rx=h*1.2, ry=h*0.88;
    let g=`<g class="nt ${n.cls||''}">`;
    for(let l=bot-2;l>=s.step;l-=2) g+=`<line class="ledger" x1="${x-rx*1.8}" x2="${x+rx*1.8}" y1="${y(l)}" y2="${y(l)}"/>`;
    for(let l=top+2;l<=s.step;l+=2) g+=`<line class="ledger" x1="${x-rx*1.8}" x2="${x+rx*1.8}" y1="${y(l)}" y2="${y(l)}"/>`;
    if(s.a) g+=`<text class="acc" x="${x-rx*1.6}" y="${yy+h}" text-anchor="end" font-size="${h*3.2}">${ACC[s.a]}</text>`;
    g+=`<ellipse cx="${x}" cy="${yy}" rx="${rx}" ry="${ry}" transform="rotate(-20 ${x} ${yy})"/>`;
    if(n.label) g+=`<text class="nlabel" x="${x}" y="${H-8}" text-anchor="middle">${n.label}</text>`;
    o+=g+'</g>';
  });
  return o+'</svg>';
}

/* ---------- partitura con armadura, en una clave o en pentagrama doble ---------- */
const FLAT_ORDER=[6,2,5,1,4,0,3], SHARP_ORDER=[3,0,4,1,5,2,6];  // Si Mi La Re Sol Do Fa / Fa Do Sol Re La Mi Si
const KEYSIG_STEPS={
  treble:{'-1':[34,37,33,36,32,35,31],'1':[38,35,39,36,33,37,34]},
  bass:{'-1':[20,23,19,22,18,21,17],'1':[24,21,25,22,19,23,20]},
};
export function keyAlters(k){
  const alt=[0,0,0,0,0,0,0];
  (k<0?FLAT_ORDER.slice(0,-k):SHARP_ORDER.slice(0,k)).forEach(l=>{alt[l]=k<0?-1:1;});
  return alt;
}
/* escribe una nota según la armadura: diatónicas con su letra; naturales con becuadro; el resto con bemol
   en tonalidades de bemoles y con sostenido en las de sostenidos, salvo la sensible de la relativa menor (♯) */
export function spellInKey(m,k){
  const alt=keyAlters(k), pc=mod12(m);
  for(let l=0;l<7;l++) if(mod12(NAT[l]+alt[l])===pc) return {midi:m,l,a:alt[l]};
  for(let l=0;l<7;l++) if(NAT[l]===pc) return {midi:m,l,a:0};  // natural fuera de la armadura: ♮
  const leading=mod12(7*k-3-1);
  const up=pc!==leading&&k<0;  // usar la letra de arriba con bemol
  for(let l=0;l<7;l++) if(mod12(NAT[l]+alt[l])===mod12(pc+(up?1:-1))) return {midi:m,l,a:alt[l]+(up?-1:1)};
  const [l,a]=SHARP_SPELL[pc]; return {midi:m,l,a};
}
export const nameInKey=(m,k)=>noteName(spellInKey(m,k));

/* figura de una duración en tiempos (negra = 1): la mayor que no la supere */
const FIGURES=[[4,'w',false],[3,'h',true],[2,'h',false],[1.5,'q',true],[1,'q',false],[0.75,'e',true],[0.5,'e',false],[0.25,'s',false]];
export function figure(d){
  const f=FIGURES.find(([v])=>d>=v-1e-6)||FIGURES[FIGURES.length-1];
  return {kind:f[1],dot:f[2],flags:f[1]==='e'?1:f[1]==='s'?2:0};
}

/*
  scoreSvg({
    staves:['treble'] | ['bass'] | ['treble','bass'],
    key: armadura (-7..7), beats: tiempos por compás (se dibuja el compás si timeSig),
    columns:[{t, rh:[{midi,d}], lh:[{midi,d}], cls, bar, barNo}],  bar = empieza compás
    ranges:{treble:[minMidi,maxMidi], bass:[...]},  fijos para que no salte al avanzar
    width, h, timeSig
  })
*/
export function scoreSvg({staves,key=0,beats=4,columns,ranges={},width=720,h=7,timeSig=false,fingers=false}){
  const alt=keyAlters(key), nAcc=Math.abs(key), stemLen=h*7;
  const layout=[]; let y0=h*3;
  for(const clef of staves){
    const C=CLEFS[clef], bot=C.bottom, top=bot+8;
    const r=ranges[clef], steps=r?[spell(spellInKey(r[0],key)).step,spell(spellInKey(r[1],key)).step]:[bot,top];
    let hi=Math.max(top+2,steps[1]+1)+4, lo=Math.min(bot-2,steps[0]-1)-4;  // margen para plicas
    hi=top+Math.ceil((hi-top)/3)*3; lo=bot-Math.ceil((bot-lo)/3)*3;  // por tramos: la partitura no salta con cada nota
    const base=y0;  // se fija aquí: y0 sigue creciendo para el siguiente pentagrama
    layout.push({clef,C,bot,top,mid:bot+4,hand:clef==='treble'?'rh':'lh',y:s=>base+(hi-s)*h});
    y0+=(hi-lo)*h+h;
  }
  const H=y0, x0=h*8+nAcc*h*1.7+h*2+(timeSig?h*3.5:0);
  const dx=(width-x0-h*2)/Math.max(8,columns.length);
  const colX=i=>x0+dx*(i+0.5);
  let o=`<svg viewBox="0 0 ${width} ${H}" role="img" aria-label="${gt('Partitura')}">`;
  for(const L of layout){
    for(let s=L.bot;s<=L.top;s+=2) o+=`<line class="sl" x1="4" x2="${width-4}" y1="${L.y(s)}" y2="${L.y(s)}"/>`;
    o+=`<text class="clef-glyph" x="${h*1.2}" y="${L.y(L.C.anchor)}" font-size="${h*8}">${L.C.glyph}</text>`;
    const pos=KEYSIG_STEPS[L.clef][key<0?'-1':'1'];
    for(let i=0;i<nAcc;i++) o+=`<text class="keysig" x="${h*8+i*h*1.7}" y="${L.y(pos[i])+h*(key<0?0.9:1.1)}" font-size="${h*3.4}">${key<0?'♭':'♯'}</text>`;
    if(timeSig){
      const tx=h*8+nAcc*h*1.7+h*1.8;
      o+=`<text class="timesig" x="${tx}" y="${L.y(L.mid)-h*0.15}" font-size="${h*4.4}" text-anchor="middle">${beats}</text>`;
      o+=`<text class="timesig" x="${tx}" y="${L.y(L.bot)-h*0.15}" font-size="${h*4.4}" text-anchor="middle">4</text>`;
    }
  }
  const first=layout[0], last=layout[layout.length-1];
  const sysTop=first.y(first.top), sysBot=last.y(last.bot);
  o+=`<line class="sl" x1="4" x2="4" y1="${sysTop}" y2="${sysBot}"/>`;
  columns.forEach((col,i)=>{
    if(!col.bar) return;
    const bx=colX(i)-dx/2;
    if(i>0) o+=`<line class="barline" x1="${bx}" x2="${bx}" y1="${sysTop}" y2="${sysBot}"/>`;
    if(col.barNo) o+=`<text class="barno" x="${Math.max(6,bx+3)}" y="${sysTop-h*1.2}">${col.barNo}</text>`;
  });

  // 1) cabezas, alteraciones, puntillos y datos de plica por columna y pentagrama
  const cols=columns.map(()=>({}));
  for(const L of layout){
    let shown={};  // alteraciones accidentales vigentes en el compás
    columns.forEach((col,i)=>{
      if(col.bar) shown={};
      const list=col[L.hand]||[];
      if(!list.length) return;
      const x=colX(i), rx=h*1.2, ry=h*0.86;
      const notes=list.map(n=>({...spellInKey(n.midi,key),d:n.d,f:n.f})).map(n=>({...n,s:spell(n)})).sort((a,b)=>a.s.step-b.s.step);
      const fig=figure(Math.max(...notes.map(n=>n.d)));
      let g='', prevStep=null, prevShift=false;
      let hasAcc=false; const fingerAt=[];  // acordes: los dedos van en columna a la izquierda, cada uno a la altura de su nota
      notes.forEach(n=>{
        const st=n.s.step, yy=L.y(st);
        const shift=prevStep!=null&&st-prevStep===1&&!prevShift, nx=x+(shift?rx*2:0);
        for(let l=L.bot-2;l>=st;l-=2) g+=`<line class="ledger" x1="${x-rx*1.8}" x2="${x+rx*1.8}" y1="${L.y(l)}" y2="${L.y(l)}"/>`;
        for(let l=L.top+2;l<=st;l+=2) g+=`<line class="ledger" x1="${x-rx*1.8}" x2="${x+rx*1.8}" y1="${L.y(l)}" y2="${L.y(l)}"/>`;
        const id=`${n.l}:${n.s.oct}`, current=id in shown?shown[id]:alt[n.l];
        if(n.a!==current){ hasAcc=true; shown[id]=n.a; g+=`<text class="acc" x="${x-rx*1.5}" y="${yy+h}" text-anchor="end" font-size="${h*3}">${n.a===0?'♮':ACC[n.a]}</text>`; }
        g+=`<ellipse class="${fig.kind==='w'||fig.kind==='h'?'open':''}" cx="${nx}" cy="${yy}" rx="${rx}" ry="${ry}" transform="rotate(-20 ${nx} ${yy})"/>`;
        if(fig.dot){ const onLine=(st-L.bot)%2===0; g+=`<circle class="dot" cx="${x+rx*2.1+(shift?rx*2:0)}" cy="${onLine?L.y(st+1):yy}" r="${h*0.32}"/>`; }
        if(fingers&&n.f){
          if(notes.length===1){ const above=L.hand==='rh'; g+=`<text class="fnum" x="${nx}" y="${above?yy-h*2.1:yy+h*3.6}" text-anchor="middle" font-size="${h*2.6}">${n.f}</text>`; }
          else fingerAt.push({f:n.f,yy});
        }
        prevStep=st; prevShift=shift;
      });
      if(fingerAt.length){
        const fx=x-rx*(hasAcc?5.6:2.6);
        fingerAt.forEach(e=>{ g+=`<text class="fnum" x="${fx}" y="${e.yy+h*0.9}" text-anchor="end" font-size="${h*2.4}">${e.f}</text>`; });
      }
      const steps=notes.map(n=>n.s.step);
      cols[i][L.hand]={g,fig,x,rx,lowY:L.y(steps[0]),highY:L.y(steps[steps.length-1]),
        avg:steps.reduce((a,b)=>a+b,0)/steps.length,mid:L.mid,t:col.t,beamable:fig.flags>0};
    });
  }

  // 2) plicas, barras de corcheas (por tiempo) y corchetes
  for(const L of layout){
    const seq=columns.map((c,i)=>({i,n:cols[i][L.hand]})).filter(e=>e.n);
    const groups=[];
    for(const e of seq){
      const prev=groups[groups.length-1], lastE=prev&&prev[prev.length-1];
      const sameBeat=lastE&&Math.floor(lastE.n.t+1e-6)===Math.floor(e.n.t+1e-6);
      if(e.n.beamable&&lastE&&lastE.n.beamable&&sameBeat) prev.push(e); else groups.push([e]);
    }
    for(const grp of groups){
      const ns=grp.map(e=>e.n);
      if(ns[0].fig.kind==='w') continue;
      const up=ns.reduce((a,n)=>a+n.avg,0)/ns.length<ns[0].mid;
      const sx=n=>up?n.x+n.rx*0.95:n.x-n.rx*0.95;
      if(grp.length>1){
        // barra horizontal a la altura de la plica más extrema del grupo
        const by=up?Math.min(...ns.map(n=>n.highY))-stemLen:Math.max(...ns.map(n=>n.lowY))+stemLen;
        ns.forEach(n=>{ n.stem=`<line class="stem" x1="${sx(n)}" x2="${sx(n)}" y1="${up?n.lowY:n.highY}" y2="${by}"/>`; });
        const x1=sx(ns[0]), x2=sx(ns[ns.length-1]), off=up?h*1.1:-h*1.1;
        let beam=`<line class="beam" x1="${x1}" x2="${x2}" y1="${by}" y2="${by}" stroke-width="${h*0.7}"/>`;
        ns.forEach((n,k)=>{
          if(n.fig.flags<2) return;
          const nb=ns[k+1]&&ns[k+1].fig.flags===2?ns[k+1]:null, pb=ns[k-1]&&ns[k-1].fig.flags===2?ns[k-1]:null;
          if(nb) beam+=`<line class="beam" x1="${sx(n)}" x2="${sx(nb)}" y1="${by+off}" y2="${by+off}" stroke-width="${h*0.7}"/>`;
          else if(!pb){ const dir=k<ns.length-1?1:-1; beam+=`<line class="beam" x1="${sx(n)}" x2="${sx(n)+dir*h*1.8}" y1="${by+off}" y2="${by+off}" stroke-width="${h*0.7}"/>`; }
        });
        ns[0].beam=beam;
      }else{
        const n=ns[0], x=sx(n), y1=up?n.lowY:n.highY, y2=up?n.highY-stemLen:n.lowY+stemLen;
        n.stem=`<line class="stem" x1="${x}" x2="${x}" y1="${y1}" y2="${y2}"/>`;
        for(let f=0;f<n.fig.flags;f++){
          const fy=y2+(up?1:-1)*f*h*1.4;
          n.stem+=up?`<path class="flag" d="M${x} ${fy} q${h*1.8} ${h*1.6} ${h*1.2} ${h*4.2}"/>`
                    :`<path class="flag" d="M${x} ${fy} q${h*1.8} ${-h*1.6} ${h*1.2} ${-h*4.2}"/>`;
        }
      }
    }
  }

  // 3) una <g> por columna (para colorear la nota actual, las acertadas y las falladas)
  columns.forEach((col,i)=>{
    const parts=layout.map(L=>cols[i][L.hand]).filter(Boolean);
    if(!parts.length) return;
    o+=`<g class="nt ${col.cls||''}">`+parts.map(n=>n.g+(n.stem||'')+(n.beam||'')).join('')+'</g>';
  });
  return o+'</svg>';
}
