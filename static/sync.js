(function(){
  'use strict';
  // Sync manual, fail-safe. Nenhuma leitura massiva ou gravação é feita no boot.
  const META_KEY='cti_sync_meta_safe_v2';
  const GROUPS={
    progress:[
      'medquest_historico','medquest_erros','medquest_horas','medquest_missao','medquest_planner','medquest_prova','medquest_semente',
      'cti_exam_focus_v29','cti_favoritos','cti_metas','cti_perfil','cti_destaque','medquest_theme'
    ],
    study:[
      'cti_study_flashcards_v32','cti_study_highlights_v32','cti_study_notes_v32','cti_material_estudo_v1','cti_flashcards_erros_v31'
    ],
    training:[
      'cti_2fase','cti_doc_treinos','cti_simulados','cti_mini_estacao_hist_v2','cti_diagnostico_inicial_v31','cti_planner_exec'
    ]
  };
  const STATE={busy:false,available:false,last:null,error:'',received:false};
  const MAX_KEY_CHARS=350000;
  const MAX_REQUEST_BYTES=800000;
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  const now=()=>Date.now();
  const fnv=s=>{
    s=String(s===null?'∅':s);
    let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0).toString(36);
  };
  const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('cti_csrf='))?.split('=').slice(1).join('=')||'');
  const getMeta=()=>{
    try{
      const m=JSON.parse(localStorage.getItem(META_KEY));
      return m&&typeof m==='object'&&m.namespaces?m:{namespaces:{}};
    }catch{return {namespaces:{}}}
  };
  const saveMeta=m=>localStorage.setItem(META_KEY,JSON.stringify(m));

  async function req(url,opt={}){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const cfg=Object.assign({credentials:'same-origin',cache:'no-store',signal:controller.signal},opt||{});
      const response=await fetch(url,cfg);
      const payload=await response.json().catch(()=>({}));
      if(response.status===401)throw new Error('Sessão expirada. Entre novamente para sincronizar.');
      if(!response.ok){
        const e=new Error(typeof payload.detail==='string'&&payload.detail!=='SYNC_CONFLICT'
          ?payload.detail:'Não foi possível sincronizar. Tente novamente.');
        e.status=response.status;
        throw e;
      }
      return payload;
    }catch(e){
      if(e.name==='AbortError')throw new Error('A sincronização demorou demais. Seus dados locais foram preservados.');
      throw e;
    }finally{clearTimeout(timeout)}
  }

  async function capture(ns){
    const values={};
    for(const key of GROUPS[ns]){
      await pause(); // devolve a thread principal à interface entre as leituras
      const value=localStorage.getItem(key);
      if(value!==null&&value.length>MAX_KEY_CHARS){
        throw new Error('Os dados de '+key+' excedem o limite seguro. Nada foi substituído.');
      }
      values[key]=value;
    }
    return values;
  }

  function normalized(remote){
    const data=remote&&remote.data;
    const items=data&&typeof data==='object'&&data.items&&typeof data.items==='object'?data.items:{};
    return {schema:1,items:Object.assign({},items)};
  }

  function plan(ns,local,remote,previous){
    const data=normalized(remote);
    const received=[];
    let changedServer=false;
    const conflicts=[];
    const initialized=!!previous.initialized;
    if(initialized&&previous.version>0&&Number(remote.version||0)===0){
      throw new Error('O estado remoto foi reiniciado. Nenhum dado local foi alterado.');
    }
    for(const key of GROUPS[ns]){
      const localRaw=local[key];
      const remoteItem=data.items[key];
      const remoteRaw=remoteItem&&typeof remoteItem.raw==='string'?remoteItem.raw:null;
      const same=localRaw===remoteRaw;
      const base=previous.seen&&previous.seen[key];
      let changedLocal,changedRemote;
      if(!initialized||base===undefined){
        changedLocal=localRaw!==null;
        changedRemote=remoteRaw!==null;
      }else{
        changedLocal=fnv(localRaw)!==base;
        changedRemote=fnv(remoteRaw)!==base;
      }
      if(changedLocal&&changedRemote&&!same){
        conflicts.push(key);
      }else if(changedLocal&&!same){
        data.items[key]={raw:localRaw,modified:now()};
        changedServer=true;
      }else if(changedRemote&&!same){
        received.push({key,raw:remoteRaw});
      }else if(!same){
        conflicts.push(key);
      }
    }
    if(conflicts.length){
      throw new Error('Conflito em '+ns+' ('+conflicts.join(', ')+'). Nenhum dado foi sobrescrito. Use o dispositivo com o histórico mais completo.');
    }
    return {data,received,changedServer};
  }

  async function syncNamespace(ns,meta){
    const remote=await req('/api/sync/state?namespace='+encodeURIComponent(ns));
    const local=await capture(ns);
    const previous=meta.namespaces[ns]||{initialized:false,version:0,seen:{}};
    const p=plan(ns,local,remote,previous);
    let version=Number(remote.version||0);
    if(p.changedServer){
      const body=JSON.stringify({namespace:ns,base_version:version,data:p.data});
      if(new TextEncoder().encode(body).length>MAX_REQUEST_BYTES){
        throw new Error('O volume de '+ns+' excede o limite seguro de envio. Nenhum dado local foi apagado.');
      }
      const saved=await req('/api/sync/state',{
        method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body
      });
      version=Number(saved.version);
    }
    // Aplicação só depois da confirmação do servidor e da validação de conflitos.
    for(const item of p.received){
      await pause();
      if(item.raw===null)localStorage.removeItem(item.key);
      else localStorage.setItem(item.key,item.raw);
      local[item.key]=item.raw;
    }
    const seen={};
    for(const key of GROUPS[ns]){
      await pause();
      seen[key]=fnv(local[key]);
    }
    meta.namespaces[ns]={initialized:true,version,seen};
    saveMeta(meta);
    return p.received.length>0;
  }

  async function syncAll(manual=false){
    if(STATE.busy||!STATE.available||!navigator.onLine)return false;
    // Só executa mediante clique explícito; sem intervalos, focus ou reload.
    STATE.busy=true;STATE.error='';renderStatus();
    let received=false;
    const meta=getMeta();
    try{
      for(const ns of Object.keys(GROUPS)){
        received=(await syncNamespace(ns,meta))||received;
      }
      meta.lastSync=now();
      saveMeta(meta);
      STATE.last=meta.lastSync;
      STATE.received=received;
      if(manual&&typeof window.toast==='function'){
        window.toast(received?'Dados recebidos. Atualize a página para vê-los.':'Sincronização concluída.');
      }
      return true;
    }catch(e){
      STATE.error=e.message||'Sincronização indisponível.';
      if(manual&&typeof window.toast==='function')window.toast(STATE.error);
      return false;
    }finally{STATE.busy=false;renderStatus()}
  }

  function statusText(){
    if(!STATE.available)return 'Sincronização ainda não disponível';
    if(!navigator.onLine)return 'Offline · alterações serão sincronizadas ao reconectar';
    if(STATE.busy)return 'Sincronizando…';
    if(STATE.error)return 'Sincronização pendente';
    if(STATE.received)return 'Dados recebidos · atualize a página para visualizá-los';
    if(STATE.last)return 'Sincronizado · '+new Date(STATE.last).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return 'Pronto para sincronizar';
  }
  function renderStatus(){
    document.querySelectorAll('[data-sync-status]').forEach(el=>el.textContent=statusText());
    document.querySelectorAll('[data-sync-now]').forEach(b=>b.disabled=STATE.busy||!STATE.available||!navigator.onLine);
  }

  function ensureUI(){
    if(document.getElementById('ctiAccountDialog'))return;
    const header=document.querySelector('.hdr-act');
    if(header&&!document.getElementById('btnConta')){
      const b=document.createElement('button');b.className='icon-btn';b.id='btnConta';b.title='Conta e sincronização';
      b.innerHTML='<svg class="i"><use href="#i-lock"/></svg>';header.insertBefore(b,document.getElementById('btnLogout'));b.onclick=openAccount;
    }
    const sheet=document.querySelector('#sheet>div');
    if(sheet&&!document.getElementById('shConta')){
      const b=document.createElement('button');b.className='it';b.id='shConta';
      b.innerHTML='<svg class="i"><use href="#i-lock"/></svg>Conta e sincronização';
      const p=document.getElementById('shPerfil');sheet.insertBefore(b,p);b.onclick=()=>{document.getElementById('sheet')?.classList.remove('on');openAccount()};
    }
    const d=document.createElement('dialog');d.id='ctiAccountDialog';d.className='admin-dialog account-dialog';
    d.innerHTML=`<form method="dialog" id="ctiAccountForm">
      <div class="sec-t"><span>Conta e sincronização</span><button class="btn sec sm" type="button" id="ctiAccountClose">Fechar</button></div>
      <div class="account-sync-box"><b>Seus estudos em todos os dispositivos</b><p class="small muted">Histórico, erros, favoritos, metas, caderno, flashcards e materiais de estudo ficam associados à sua conta.</p><div class="row" style="justify-content:space-between"><span class="pill" data-sync-status></span><button class="btn sec sm" type="button" data-sync-now>Sincronizar agora</button></div></div>
      <div class="account-password-box"><h3>Alterar minha senha</h3><p class="small muted">Use uma frase-senha com pelo menos 12 caracteres. Após salvar, você fará login novamente e as outras sessões serão revogadas.</p>
        <label class="f">Senha atual<input type="password" id="ctiCurrentPassword" autocomplete="current-password" required></label>
        <label class="f">Nova senha<input type="password" id="ctiNewPassword" minlength="12" maxlength="256" autocomplete="new-password" required></label>
        <label class="f">Confirmar nova senha<input type="password" id="ctiConfirmPassword" minlength="12" maxlength="256" autocomplete="new-password" required></label>
        <button class="btn" type="submit">Salvar nova senha</button>
      </div>
    </form>`;
    document.body.appendChild(d);
    document.getElementById('ctiAccountClose').onclick=()=>d.close();
    d.querySelector('[data-sync-now]').onclick=()=>syncAll(true);
    document.getElementById('ctiAccountForm').onsubmit=changePassword;

    const admin=document.getElementById('view-admin');
    if(admin&&!document.getElementById('ctiAdminSyncCard')){
      const card=document.createElement('div');card.className='card';card.id='ctiAdminSyncCard';
      card.innerHTML='<div class="sec-t"><span>Conta e sincronização</span><span data-sync-status></span></div><p class="small muted">Gerencie sua senha pelo botão Conta no topo. O progresso desta conta pode continuar no computador, celular ou PWA.</p><button class="btn sec sm" type="button" data-sync-now>Sincronizar agora</button>';
      const setup=document.getElementById('adminSetupCard');setup?.insertAdjacentElement('afterend',card);
      card.querySelector('[data-sync-now]').onclick=()=>syncAll(true);
    }
    renderStatus();
  }

  async function openAccount(){
    ensureUI();renderStatus();document.getElementById('ctiAccountDialog').showModal();
  }
  async function changePassword(e){
    e.preventDefault();
    const cur=document.getElementById('ctiCurrentPassword').value;
    const a=document.getElementById('ctiNewPassword').value,b=document.getElementById('ctiConfirmPassword').value;
    if(a!==b){if(typeof window.toast==='function')window.toast('As novas senhas não coincidem.');return}
    if(a.length<12){if(typeof window.toast==='function')window.toast('Use pelo menos 12 caracteres.');return}
    try{
      await req('/api/account/password',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
        body:JSON.stringify({current_password:cur,new_password:a})});
      alert('Senha alterada. Entre novamente com a nova senha.');
      location.replace('/?reason=password-changed');
    }catch(err){if(typeof window.toast==='function')window.toast(err.message)}
  }

  async function boot(){
    ensureUI();
    try{
      const st=await req('/api/auth/status');
      STATE.available=!!st.sync_available;
      if(!st.password_change_available){
        const box=document.querySelector('.account-password-box');
        if(box)box.innerHTML='<h3>Alteração de senha</h3><p class="small muted">A troca de senha dentro do CTI ainda não está disponível nesta modalidade de conta.</p>';
      }
    }catch(e){
      STATE.available=false;
      STATE.error='';
    }
    renderStatus();
    // Sem sincronização no carregamento, timers, focus, visibility ou reload.
  }

  window.CTI_SYNC={syncNow:()=>syncAll(true),status:()=>({available:STATE.available,last:STATE.last,error:STATE.error})};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();