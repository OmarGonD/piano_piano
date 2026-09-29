/* Lluvia de notas: las notas caen hacia el teclado y llegan a la línea cuando hay que tocarlas.
   El lienzo va justo encima del teclado y con su mismo ancho, así cada barra cae sobre su tecla. */
import {isBlack} from './theory.js';
import {gt,tf,tn} from './i18n.js';

/* mismos colores que las teclas del teclado (.key.demo-rh / .demo-lh en app.css) */
const COLORS={rh:['#FF5CA8','#C2185B'],lh:['#5CB8FF','#1F6FD1']};
const LEGEND=[['rh',gt('Mano derecha')],['lh',gt('Mano izquierda')]];
const OK='#5CC99A', BAD='#EE7582';

function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

/* view() devuelve {beat, groups, beats, secPerBeat, cur, hands} o null; se llama en cada cuadro */
export function createFalling(canvas,kb,view){
  const ctx=canvas.getContext('2d');
  let raf=0, sparks=[], lastT=0;
  const lit=new Map();  // nota -> última vez que empezó a sonar, para el destello en la línea

  function keyBoxes(){
    const boxes=new Map();
    kb.querySelectorAll('.key').forEach(k=>boxes.set(+k.dataset.midi,{x:k.offsetLeft,w:k.offsetWidth}));
    return boxes;
  }
  function fit(){
    const dpr=window.devicePixelRatio||1, w=canvas.clientWidth, h=canvas.clientHeight;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return [w,h];
  }
  function frame(ts){
    raf=requestAnimationFrame(frame);
    const dt=Math.min(0.1,(ts-(lastT||ts))/1000); lastT=ts;
    const [W,H]=fit(), v=view();
    ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#05060A'); bg.addColorStop(1,'#0C0B18');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    if(!v) return;
    const boxes=keyBoxes(), hitY=H-4;
    const ppb=H/Math.max(2,3.2/v.secPerBeat);   // unos 3 segundos a la vista

    // guías: una línea vertical en cada Do y una horizontal en cada compás
    ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.lineWidth=1;
    for(const [m,b] of boxes) if(m%12===0){ctx.beginPath();ctx.moveTo(b.x+.5,0);ctx.lineTo(b.x+.5,H);ctx.stroke();}
    const firstBar=Math.ceil(v.beat/v.beats)*v.beats;
    for(let t=firstBar;(t-v.beat)*ppb<H;t+=v.beats){
      const y=hitY-(t-v.beat)*ppb;
      ctx.strokeStyle='rgba(255,255,255,.1)';
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
    }

    for(let gi=0;gi<v.groups.length;gi++){
      const g=v.groups[gi];
      if((g.t-v.beat)*ppb>H+10) break;
      for(const n of g.notes){
        const bot=hitY-(g.t-v.beat)*ppb, top=bot-Math.max(n.d*ppb-3,8);
        if(bot<0||top>H) continue;
        const b=boxes.get(n.m); if(!b) continue;
        const pad=isBlack(n.m)?1:3, x=b.x+pad, w=b.w-pad*2;
        const played=n.state==='perfect'||n.state==='good'||n.state==='assumed'||(g.done&&!g.err);
        const missed=n.state==='miss'||(g.done&&g.err);
        const [c1,c2]=COLORS[n.hand];
        const grad=ctx.createLinearGradient(0,top,0,bot);
        grad.addColorStop(0,played?OK:missed?BAD:c2); grad.addColorStop(1,played?'#A8F0CF':missed?'#F6B3BA':c1);
        const sounding=g.t<=v.beat+1e-3&&v.beat<g.t+n.d;
        const current=gi===v.cur;
        ctx.globalAlpha=missed?.45:1;
        ctx.shadowColor=played?OK:c1; ctx.shadowBlur=sounding||current?18:6;
        roundRect(ctx,x,Math.max(top,-8),w,Math.min(bot,H)-Math.max(top,-8),5);
        ctx.fillStyle=grad; ctx.fill();
        if(current){ctx.lineWidth=2;ctx.strokeStyle='#FFFFFF';ctx.stroke();}
        ctx.shadowBlur=0; ctx.globalAlpha=1;
        if(sounding){
          const key=n.m+':'+g.t;
          if(!lit.has(key)){
            lit.set(key,ts);
            for(let i=0;i<10;i++) sparks.push({x:x+w/2,y:hitY,vx:(Math.random()-.5)*90,vy:-40-Math.random()*120,
              life:1,color:c1});
          }
        }
      }
    }
    if(lit.size>400) lit.clear();

    // línea de toque con brillo
    const glow=ctx.createLinearGradient(0,hitY-26,0,H);
    glow.addColorStop(0,'rgba(140,120,255,0)'); glow.addColorStop(1,'rgba(160,140,255,.55)');
    ctx.fillStyle=glow; ctx.fillRect(0,hitY-26,W,H-hitY+26);
    ctx.fillStyle='#D9D2FF'; ctx.shadowColor='#9B8CFF'; ctx.shadowBlur=14;
    ctx.fillRect(0,hitY,W,2); ctx.shadowBlur=0;

    // chispas
    sparks=sparks.filter(s=>(s.life-=dt*1.6)>0);
    for(const s of sparks){
      s.x+=s.vx*dt; s.y+=s.vy*dt; s.vy+=160*dt;
      ctx.globalAlpha=s.life; ctx.fillStyle=s.color;
      ctx.fillRect(s.x,s.y,2,2);
    }
    ctx.globalAlpha=1;

    // leyenda de colores: solo las manos que se están tocando
    ctx.font='600 12px system-ui,sans-serif'; ctx.textBaseline='middle';
    let lx=10;
    for(const [h,label] of LEGEND.filter(([h])=>v.hands.includes(h))){
      ctx.fillStyle=COLORS[h][0]; roundRect(ctx,lx,10,12,12,3); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.8)'; ctx.fillText(label,lx+18,16.5);
      lx+=24+ctx.measureText(label).width+14;
    }
  }
  return {
    start(){ if(!raf){lastT=0;raf=requestAnimationFrame(frame);} },
    stop(){ cancelAnimationFrame(raf); raf=0; sparks=[]; lit.clear(); },
  };
}
