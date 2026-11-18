/* CTI PWA: start before authentication, independent of application startup. */
(function(){
  'use strict';
  let prompt=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const buttons=()=>document.querySelectorAll('[data-pwa-install]');
  function render(){buttons().forEach(b=>{b.hidden=standalone();b.disabled=false;});}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;render();});
  window.addEventListener('appinstalled',()=>{prompt=null;buttons().forEach(b=>{b.hidden=true;});});
  async function install(){
    if(standalone())return;
    if(prompt){
      const event=prompt;prompt=null;
      try{await event.prompt();await event.userChoice;}catch{showHelp();}
      return;
    }
    showHelp();
  }
  function showHelp(){
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    alert(ios?'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Se disponível, ative Abrir como app.':'Abra o CTI no Chrome ou Edge, fora do modo anônimo e de navegadores internos. No menu do navegador, escolha Instalar app ou Adicionar à tela inicial. Se ainda não estiver disponível, tente novamente após a página carregar.');
  }
  function init(){buttons().forEach(b=>b.addEventListener('click',install));render();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  if('serviceWorker' in navigator&&window.isSecureContext){
    // No dependency on /api/auth/status or on the private study scripts.
    navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(()=>{
      return navigator.serviceWorker.getRegistrations().then(rs=>Promise.allSettled(rs.filter(r=>r.scope.endsWith('/static/')).map(r=>r.unregister())));
    }).catch(e=>console.warn('CTI: service worker indisponível',e.name));
  }
})();
