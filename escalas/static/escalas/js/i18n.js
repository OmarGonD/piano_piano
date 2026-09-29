/* Traducciones del JavaScript. Los textos originales están en español y hacen de clave; el catálogo lo sirve
   Django (/jsi18n/) según el idioma del usuario. Sin catálogo, los textos salen tal cual. */
const fill=(s,o)=>o?s.replace(/%\((\w+)\)s/g,(_,k)=>o[k]):s;
export const gt=s=>window.gettext?window.gettext(s):s;
/* con variables con nombre: tf('Nota %(n)s de %(total)s',{n:1,total:5}) */
export const tf=(s,o)=>fill(gt(s),o);
/* plural: tn('%(n)s intento','%(n)s intentos',n,{n}) */
export const tn=(one,many,n,o)=>fill(window.ngettext?window.ngettext(one,many,n):(n===1?one:many),{n,...o});
