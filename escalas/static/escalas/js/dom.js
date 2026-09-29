export const $=s=>document.querySelector(s);
export const $$=s=>document.querySelectorAll(s);

/* localStorage solo para preferencias de este dispositivo; puede fallar en modo privado */
export const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};

export const readJson=id=>{const el=document.getElementById(id);try{return el?JSON.parse(el.textContent):null}catch(e){return null}};
