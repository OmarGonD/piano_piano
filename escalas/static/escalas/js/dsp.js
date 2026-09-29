/* Procesamiento de señal puro (sin DOM ni estado de la app): altura por YIN y acordes por cromagrama. */
const mod12=x=>((x%12)+12)%12;

export function rms(buf){let q=0;for(let i=0;i<buf.length;i++) q+=buf[i]*buf[i];return Math.sqrt(q/buf.length);}

/* YIN: devuelve la frecuencia fundamental y qué tan periódica es la señal (claridad 0–1) */
let yinD=null;
export function yin(buf,sr){
  const W=1024, tMin=Math.floor(sr/2200), tMax=Math.min(W-1,Math.floor(sr/50));
  if(!yinD||yinD.length<tMax+1) yinD=new Float32Array(tMax+1);
  const d=yinD; d[0]=1; let run=0;
  for(let tau=1;tau<=tMax;tau++){
    let s=0; for(let j=0;j<W;j++){const df=buf[j]-buf[j+tau]; s+=df*df;}
    run+=s; d[tau]=run>0?s*tau/run:1;
  }
  let tau=-1;
  for(let t=tMin;t<=tMax;t++){ if(d[t]<0.2){ while(t+1<=tMax&&d[t+1]<d[t]) t++; tau=t; break; } }
  if(tau<0) return null;
  let bt=tau;
  if(tau>1&&tau<tMax){const a=d[tau-1],b=d[tau],c=d[tau+1],den=a+c-2*b; if(den) bt=tau+(a-c)/(2*den);}
  return {f:sr/bt,clarity:1-d[tau]};
}

/* ---------- acordes ---------- */
export const QUALS={M:[0,4,7],m:[0,3,7],dim:[0,3,6],'7':[0,4,7,10],m7:[0,3,7,10]};
export const QSUF={M:'',m:'m',dim:'°','7':'7',m7:'m7'};
export function chordTemplate(pcs){const t=new Float32Array(12);pcs.forEach(p=>{t[p]+=1;t[(p+7)%12]+=0.2;t[(p+4)%12]+=0.08;});return t;}
export const ALLCH=[];
for(let r=0;r<12;r++) for(const q in QUALS){const pcs=QUALS[q].map(i=>(r+i)%12);ALLCH.push({r,q,pcs,t:chordTemplate(pcs)});}
export function cosSim(a,b){let d=0,na=0,nb=0;for(let i=0;i<12;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return na&&nb?d/Math.sqrt(na*nb):0;}
export function chromaFrom(fb,sr,n){
  const c=new Float32Array(12),binHz=sr/n,lo=Math.max(2,Math.floor(80/binHz)),hi=Math.min(fb.length-2,Math.ceil(2000/binHz));
  let mx=-Infinity;for(let k=lo;k<=hi;k++) if(fb[k]>mx) mx=fb[k];
  for(let k=lo;k<=hi;k++){const v=fb[k]; if(v<mx-35||!(v>fb[k-1]&&v>=fb[k+1])) continue;
    const a=fb[k-1],cc=fb[k+1],den=a-2*v+cc,p=den?0.5*(a-cc)/den:0,f=(k+p)*binHz;
    const mf=69+12*Math.log2(f/440),rm=Math.round(mf); if(Math.abs(mf-rm)>0.3) continue;
    c[mod12(rm)]+=Math.pow(10,v/20);}
  return c;
}
export function classifyChord(ch,expPcs){
  let best=null,bs=-1;for(const c of ALLCH){const s=cosSim(ch,c.t);if(s>bs){bs=s;best=c;}}
  let es=0;if(expPcs){es=cosSim(ch,chordTemplate(expPcs));if(expPcs.length===4)es=Math.max(es,cosSim(ch,chordTemplate(expPcs.slice(0,3))));}
  return {best,bs,es};
}
export const pcsKey=p=>[...new Set(p)].sort((a,b)=>a-b).join(',');
