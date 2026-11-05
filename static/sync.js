(function(){
  'use strict';
  const META_KEY='cti_sync_meta_v1';
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
  const STATE={busy:false,available:false,last:null,error:'',timer:null};

  const getMeta=()=>{try{return JSON.parse(localStorage.getItem(META_KEY))||{namespaces:{}}}catch{return {namespaces:{}}}};
  const saveMeta=m=>{try{localStorage.setItem(META_KEY,JSON.stringify(m))}catch{}};
  const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('cti_csrf='))?.split('=').slice(1).join('=')||'');
  const raw=k=>localStorage.getItem(k);
  const fnv=s=>{s=String(s??'∅');let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
  const now=()=>Date.now();

  async function req(url,opt={}){
    const cfg=Object.assign({credentials:'same-origin',cache:'no-store'},opt||{});
    const r=await fetch(url,cfg);
    const j=await r.json().catch(()=>({}));
    if(r.status===401){location.replace('/?reason=session');throw new Error('Sessão expirada.')}
    if(!r.ok){
      const e=new Error(j.detail||j.message||'Falha na sincronização.');
      e.status=r.status;e.payload=j;throw e;
    }
    return j;
  }

  function nsMeta(meta,ns){
    meta.namespaces??={};
    meta.namespaces[ns]??={version:0,initialized:false,seen:{},modified:{}};
    return meta.namespaces[ns];
  }
  function capture(ns,mns,markChanges){
    const items={};const ts=now();
    for(const k of GROUPS[ns]){
      const r=raw(k),h=fnv(r),seen=mns.seen?.[k];
      let mod=Number(mns.modified?.[k]||0);
      if(markChanges && seen!==undefined && h!==seen){mod=ts;mns.modified[k]=mod}
      if(markChanges && seen===undefined && mns.initialized){mod=ts;mns.modified[k]=mod}
      if(r!==null || (mns.initialized && seen!==undefined)) items[k]={raw:r,modified:mod||ts};
    }
    return items;
  }
  function applyItem(k,item,mns){
    const before=raw(k),after=item?.raw==null?null:String(item.raw);
    if(after===null){ if(before!==null)localStorage.removeItem(k); }
    else if(before!==after)localStorage.setItem(k,after);
    mns.seen[k]=fnv(after);
    mns.modified[k]=Number(item?.modified||0);
    return before!==after;
  }
  function refreshSeen(ns,mns){
    for(const k of GROUPS[ns])mns.seen[k]=fnv(raw(k));
  }
  function normalizeData(d){return d&&typeof d==='object'&&d.items&&typeof d.items==='object'?d:{schema:1,items:{}}}

  async function firstSync(ns,remote,meta){
    const mns=nsMeta(meta,ns), server=normalizeData(remote.data);
    let changedLocal=false,needPut=false;
    if(Number(remote.version||0)===0){
      const local=capture(ns,mns,false);
      const items={};
      for(const [k,v] of Object.entries(local)){items[k]={raw:v.raw,modified:now()}}
      if(Object.keys(items).length){
        const saved=await req('/api/sync/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
          body:JSON.stringify({namespace:ns,base_version:0,data:{schema:1,items}})});
        mns.version=saved.version;mns.modified=Object.fromEntries(Object.entries(items).map(([k,v])=>[k,v.modified]));
      }else mns.version=0;
    }else{
      const local=capture(ns,mns,false),merged=JSON.parse(JSON.stringify(server));
      for(const k of GROUPS[ns]){
        const ri=server.items[k];
        if(ri){
          changedLocal=applyItem(k,ri,mns)||changedLocal;
        }else if(local[k]?.raw!==null){
          merged.items[k]={raw:local[k].raw,modified:now()};
          mns.modified[k]=merged.items[k].modified;needPut=true;
        }
      }
      if(needPut){
        const saved=await req('/api/sync/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
          body:JSON.stringify({namespace:ns,base_version:remote.version,data:merged})});
        mns.version=saved.version;
      }else mns.version=remote.version;
    }
    mns.initialized=true;refreshSeen(ns,mns);return changedLocal;
  }

  function merge(ns,remote,mns){
    const server=normalizeData(remote.data),merged=JSON.parse(JSON.stringify(server));
    let changedLocal=false,changedServer=false;
    const local=capture(ns,mns,true);
    for(const k of GROUPS[ns]){
      const li=local[k],ri=server.items[k];
      const lm=Number(li?.modified||mns.modified?.[k]||0),rm=Number(ri?.modified||0);
      if(ri && rm>lm){
        changedLocal=applyItem(k,ri,mns)||changedLocal;
      }else if(li && (!ri || lm>rm)){
        merged.items[k]={raw:li.raw,modified:lm||now()};changedServer=true;
      }else if(!li && ri){
        changedLocal=applyItem(k,ri,mns)||changedLocal;
      }
    }
    return {data:merged,changedLocal,changedServer};
  }

  async function syncNamespace(ns,meta,retry=true){
    const mns=nsMeta(meta,ns);
    const remote=await req('/api/sync/state?namespace='+encodeURIComponent(ns));
    if(!mns.initialized)return firstSync(ns,remote,meta);
    mns.version=Number(remote.version||0);
    const out=merge(ns,remote,mns);
    if(out.changedServer){
      try{
        const saved=await req('/api/sync/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
          body:JSON.stringify({namespace:ns,base_version:mns.version,data:out.data})});
        mns.version=saved.version;
      }catch(e){
        if(e.status===409&&retry){
          const cur=e.payload?.current||{};
          const again=merge(ns,{version:cur.version||0,data:cur.data||{}},mns);
          const saved=await req('/api/sync/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
            body:JSON.stringify({namespace:ns,base_version:Number(cur.version||0),data:again.data})});
          mns.version=saved.version;
          out.changedLocal=again.changedLocal||out.changedLocal;
        }else throw e;
      }
    }
    refreshSeen(ns,mns);return out.changedLocal;
  }

  async function syncAll(manual=false){
    if(STATE.busy||!STATE.available||!navigator.onLine)return false;
    STATE.busy=true;STATE.error='';renderStatus();
    let changed=false;const meta=getMeta();
    try{
      for(const ns of Object.keys(GROUPS))changed=(await syncNamespace(ns,meta))||changed;
      meta.lastSync=now();saveMeta(meta);STATE.last=meta.lastSync;STATE.error='';
      renderStatus();
      if(changed){
        const flag=sessionStorage.getItem('cti_sync_reload_once');
        if(!flag){sessionStorage.setItem('cti_sync_reload_once','1');location.reload();return true}
      }
      sessionStorage.removeItem('cti_sync_reload_once');
      if(manual&&typeof window.toast==='function')window.toast('Sincronização concluída.');
    }catch(e){
      STATE.error=e.message||'Sincronização indisponível.';renderStatus();
      if(manual&&typeof window.toast==='function')window.toast(STATE.error);
    }finally{STATE.busy=false;renderStatus()}
    return changed;
  }

  function statusText(){
    if(!STATE.available)return 'Aguardando ativação da conta persistente';
    if(!navigator.onLine)return 'Offline · alterações serão sincronizadas ao reconectar';
    if(STATE.busy)return 'Sincronizando…';
    if(STATE.error)return 'Sincronização pendente';
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
    }catch{STATE.available=false}
    renderStatus();
    if(STATE.available){
      const meta=getMeta();STATE.last=meta.lastSync||null;
      setTimeout(()=>syncAll(false),700);
      STATE.timer=setInterval(()=>syncAll(false),15000);
      window.addEventListener('focus',()=>syncAll(false));
      window.addEventListener('online',()=>syncAll(false));
      window.addEventListener('offline',renderStatus);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncAll(false)});
    }
  }

  window.CTI_SYNC={syncNow:()=>syncAll(true),status:()=>({available:STATE.available,last:STATE.last,error:STATE.error})};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();