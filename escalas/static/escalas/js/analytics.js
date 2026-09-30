/* Eventos para Google Tag Manager: se empujan al dataLayer y en GTM se enlazan a la etiqueta GA4. */
export function track(event,params={}){
  try{ (window.dataLayer=window.dataLayer||[]).push({event,...params}); }catch(e){}
}
