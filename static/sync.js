(function(){
  'use strict';
  // Sync fail-safe: modo automático opt-in pelo servidor, sem bloquear o carregamento.
  const META_KEY='cti_sync_meta_safe_v2';
  const GROUPS={
    progress:[
      'medquest_historico','medquest_erros','medquest_horas','medquest_missao','medquest_planner','medquest_prova','medquest_semente',
      'cti_exam_focus_v29','cti_favoritos','cti_metas','cti_perfil','cti_destaque','medquest_theme'
    ],
    study:[
      'cti_study_flashcards_v32','cti_study_highlights_v32','cti_study_notes_v32','cti_material_estudo_v1','cti_flashcards_erros_v31','cti_cera_v1'
    ],
    training:[
      'cti_2fase','cti_doc_treinos','cti_simulados','cti_mini_estacao_hist_v2','cti_diagnostico_inicial_v31','cti_planner_exec'
    ]
  };
  const STATE={busy:false,available:false,automatic:false,last:null,error:'',received:false,deferred:false};
  let autoTimer=null, autoDue=0, lastAttempt=0, autoPaused=false, retryAfter=0, queuedDelay=null;
  const AUTO_MIN=5000, AUTO_NEXT=15000, AUTO_RETRY=120000, AUTO_WRITE=1000;
  const SYNC_KEYS=new Set(Object.values(GROUPS).flat());
  const canReceive=()=>window.CTI_SYNC_VIEW?.canReceive?.()===true;
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
      if(response.status===401){const e=new Error('Sessão expirada. Entre novamente para sincronizar.');e.status=401;throw e;}
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
      // Snapshot coerente: nenhuma resposta pode intercalar as leituras desta seção.
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

  // Valores criados automaticamente no primeiro acesso não devem bloquear
  // a recuperação do progresso já salvo na conta.
  function bootstrapGeneratedKey(ns,key,localRaw,remoteRaw){
    if(ns!=='progress'||localRaw===null||remoteRaw===null)return false;
    if(key==='medquest_semente')return true; // semente aleatória, não é resposta do aluno
    if(key!=='cti_destaque')return false;
    try{
      const local=JSON.parse(localRaw),remote=JSON.parse(remoteRaw);
      // Nunca descartar resposta efetivamente marcada no dispositivo.
      return !!(local&&remote&&typeof local==='object'&&typeof remote==='object'
        &&!local.resp&&local.id&&remote.id&&local.data&&remote.data);
    }catch{return false}
  }

  function backupBootstrapValues(ns,received){
    const changed=received.filter(item=>item.backupRaw!==undefined);
    if(!changed.length)return;
    const key='cti_sync_bootstrap_backups_v1';
    let prior=[];
    try{
      const saved=localStorage.getItem(key);
      if(saved!==null){
        prior=JSON.parse(saved);
        if(!Array.isArray(prior))throw new Error('Backup inválido');
      }
      const time=now();
      const added=changed.map(item=>({namespace:ns,key:item.key,raw:item.backupRaw,savedAt:time}));
      localStorage.setItem(key,JSON.stringify(prior.concat(added).slice(-20)));
    }catch{
      throw new Error('Não foi possível preservar a cópia local antes da sincronização. Nenhum dado foi substituído.');
    }
  }

  // Apenas históricos de tentativas: unir registros imutáveis de dois aparelhos.
  // Não aplica a progresso editável, missões, flashcards, notas ou respostas ativas.
  // Conflitos reais (mesmo evento com conteúdos distintos) permanecem bloqueados.
  function mergeAttempts(key,localRaw,remoteRaw){
    if(key!=='medquest_historico'||localRaw===null||remoteRaw===null)return null;
    let a,b;
    try{a=JSON.parse(localRaw);b=JSON.parse(remoteRaw)}catch{return null}
    if(!Array.isArray(a)||!Array.isArray(b)||!a.length||!b.length)return null;
    if(a.length>20000||b.length>20000)return null;
    const idOf=item=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||
         !Number.isFinite(Number(item.ts))||Number(item.ts)<=0||
         !Number.isFinite(Number(item.id))||Number(item.id)<=0)return null;
      return [String(item.id),String(item.ts),String(item.origem||'')].join(':');
    };
    const byEvent=new Map(),all=[];
    for(const x of b.concat(a)){
      const id=idOf(x);if(!id)return null;
      const prior=byEvent.get(id);
      if(prior!==undefined){
        // Eventos iguais podem ser enviados pelos dois dispositivos.
        if(JSON.stringify(prior)!==JSON.stringify(x))return null;
      }else{byEvent.set(id,x);all.push(x)}
    }
    // Não ressuscitar dados após limpeza nem truncar histórico silenciosamente.
    if(all.length>20000)return null;
    all.sort((x,y)=>Number(x.ts)-Number(y.ts)||Number(x.id)-Number(y.id));
    const raw=JSON.stringify(all);
    return raw.length<=MAX_KEY_CHARS?raw:null;
  }

  // Estas duas estruturas são diferentes do histórico: são coleções por ID.
  // Mescla conservadora, sem avançar estágio/revisão em caso de dúvida.
  // Coleções vazias não são mescladas para não reverter uma exclusão deliberada.
  function mergeLearningRecords(key,localRaw,remoteRaw){
    if(!['medquest_erros','cti_flashcards_erros_v31'].includes(key)
       ||localRaw===null||remoteRaw===null)return null;
    let local,remote;
    try{local=JSON.parse(localRaw);remote=JSON.parse(remoteRaw)}catch{return null}
    const errors=key==='medquest_erros';
    if(errors?(!Array.isArray(local)||!Array.isArray(remote)):
       (!local||!remote||typeof local!=='object'||typeof remote!=='object'
        ||Array.isArray(local)||Array.isArray(remote)))return null;
    const localEntries=errors?local:Object.values(local);
    const remoteEntries=errors?remote:Object.values(remote);
    if(!localEntries.length||!remoteEntries.length||
       localEntries.length>5000||remoteEntries.length>5000)return null;
    const byId=new Map();
    const validId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
    for(const [source,items] of [['remote',remoteEntries],['local',localEntries]]){
      const seen=new Set();
      for(const item of items){
        if(!item||typeof item!=='object'||Array.isArray(item)||!validId(item.id))return null;
        const id=String(item.id);
        if(seen.has(id))return null;seen.add(id);
        const prev=byId.get(id);
        if(!prev){byId.set(id,{remote:source==='remote'?item:null,local:source==='local'?item:null});}
        else prev[source]=item;
      }
    }
    const positive=(n,fallback)=>Number.isFinite(Number(n))&&Number(n)>=0?Number(n):fallback;
    const dates=(a,b)=>[a,b].filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v));
    const merged=new Map();
    for(const [id,pair] of byId){
      const a=pair.remote,b=pair.local;
      if(!a||!b){merged.set(id,a||b);continue;}
      if(JSON.stringify(a)===JSON.stringify(b)){merged.set(id,a);continue;}
      if(errors){
        const aMaster=a.dominada===true,bMaster=b.dominada===true;
        const active=!(aMaster&&bMaster);
        const first=dates(a.adicionado,b.adicionado);
        const due=dates(a.proxima,b.proxima);
        const aReason=String(a.motivo||'nao_classificado');
        const bReason=String(b.motivo||'nao_classificado');
        const reason=aReason==='nao_classificado'?bReason:aReason;
        const stage=active?Math.min(positive(a.estagio,0),positive(b.estagio,0)):
          Math.max(positive(a.estagio,0),positive(b.estagio,0));
        merged.set(id,{
          ...a,
          id:Number(id),
          area:a.area||b.area||'',
          tema:a.tema||b.tema||'',
          adicionado:first.length?first.sort()[0]:a.adicionado||b.adicionado||null,
          erros:Math.max(1,positive(a.erros,1),positive(b.erros,1)),
          motivo:reason,
          dominada:!active,
          estagio:Math.min(3,stage),
          status:active?(stage>0?'em_andamento':'aberto'):'resolvido',
          proxima:active?(due.length?due.sort()[0]:a.proxima||b.proxima||null):null
        });
      }else{
        const aLast=dates(a.ultima,null)[0]||'',bLast=dates(b.ultima,null)[0]||'';
        const aReps=positive(a.reps,0),bReps=positive(b.reps,0);
        const latest=bLast>aLast?b:aLast>bLast?a:bReps>aReps?b:a;
        const due=dates(a.proxima,b.proxima);
        const content=(key)=>String(latest[key]||a[key]||b[key]||'');
        merged.set(id,{
          ...a,...b,id:Number(id),
          area:content('area'),tema:content('tema'),
          frente:content('frente').slice(0,220),
          verso:content('verso').slice(0,700),
          reps:Math.max(aReps,bReps),
          intervalo:Math.max(1,Math.min(positive(a.intervalo,1),positive(b.intervalo,1))),
          ultima:aLast>bLast?aLast:bLast||null,
          proxima:due.length?due.sort()[0]:latest.proxima||null
        });
      }
    }
    const sorted=[...merged.entries()].sort((x,y)=>Number(x[0])-Number(y[0]));
    const out=errors?sorted.map(x=>x[1]):Object.fromEntries(sorted);
    const raw=JSON.stringify(out);
    return raw.length<=MAX_KEY_CHARS?raw:null;
  }

  // Um merge não pode substituir dados em servidor ou dispositivo sem backup
  // das DUAS versões. Mantém apenas a versão mais recente de cada par.
  function backupMerges(ns,items){
    if(!items.length)return;
    const key='cti_sync_merge_backups_v1';
    try{
      let previous=[];
      const prior=localStorage.getItem(key);
      if(prior!==null){previous=JSON.parse(prior);if(!Array.isArray(previous))throw 0;}
      const added=items.map(item=>({
        namespace:ns,key:item.key,localRaw:item.backupRaw,
        remoteRaw:item.remoteBackupRaw,savedAt:now()
      }));
      localStorage.setItem(key,JSON.stringify(previous.concat(added).slice(-8)));
    }catch{
      throw new Error('Não foi possível salvar o backup dos dois aparelhos. Nenhum dado foi substituído.');
    }
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
      if((!initialized||base===undefined)&&changedLocal&&changedRemote&&!same
        &&bootstrapGeneratedKey(ns,key,localRaw,remoteRaw)){
        received.push({key,raw:remoteRaw,backupRaw:localRaw});
      }else if((!initialized||base===undefined)&&changedLocal&&changedRemote&&!same
        &&mergeLearningRecords(key,localRaw,remoteRaw)!==null){
        const merged=mergeLearningRecords(key,localRaw,remoteRaw);
        data.items[key]={raw:merged,modified:now()};
        changedServer=true;
        received.push({key,raw:merged,backupRaw:localRaw,
                       remoteBackupRaw:remoteRaw,merged:true});
      }else if(changedLocal&&changedRemote&&!same){
        const merged=mergeAttempts(key,localRaw,remoteRaw) ??
                     mergeLearningRecords(key,localRaw,remoteRaw);
        if(merged!==null){
          data.items[key]={raw:merged,modified:now()};
          changedServer=true;
          received.push({key,raw:merged,backupRaw:localRaw,
                         remoteBackupRaw:remoteRaw,merged:true});
        }else conflicts.push(key);
      }else if(changedLocal&&!same){
        data.items[key]={raw:localRaw,modified:now()};
        changedServer=true;
      }else if(changedRemote&&!same){
        received.push({key,raw:remoteRaw});
      }else if(!same){
        conflicts.push(key);
      }
    }
    return {data,received,changedServer,conflicts};
  }

  async function syncNamespace(ns,meta){
    const remote=await req('/api/sync/state?namespace='+encodeURIComponent(ns));
    const local=await capture(ns);
    const previous=meta.namespaces[ns]||{initialized:false,version:0,seen:{}};
    const p=plan(ns,local,remote,previous);
    // Mesmo com tela ativa, enviar mudanças locais independentes é seguro.
    // O recebimento continua bloqueado até a tela estar segura.
    // Backup do merge deve preceder qualquer PUT, mesmo com a tela ocupada.
    backupMerges(ns,p.received.filter(item=>item.merged));
    if(p.received.length&&canReceive())backupBootstrapValues(ns,p.received.filter(item=>!item.merged));
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
    // Após a rede, confirme novamente que a tela e o snapshot são seguros.
    if(p.received.length&&(!canReceive()||p.received.some(item=>localStorage.getItem(item.key)!==local[item.key]))){
      // If PUT succeeded, advance only the confirmed keys; pending downloads keep their old baseline.
      if(p.changedServer){
        const pending=new Set(p.received.map(item=>item.key).concat(p.conflicts));
        const seen=Object.assign({},previous.seen||{});
        for(const key of GROUPS[ns])if(!pending.has(key))seen[key]=fnv(local[key]);
        meta.namespaces[ns]={initialized:true,version,seen};saveMeta(meta);
      }
      return {deferred:true,received:false,conflicts:p.conflicts.map(key=>ns+': '+key)};
    }
    // Atualização local e memória no mesmo turno; não ceder entre registros recebidos.
    for(const item of p.received){
      if(item.raw===null)localStorage.removeItem(item.key);
      else localStorage.setItem(item.key,item.raw);
      local[item.key]=item.raw;
    }
    if(STATE.automatic&&p.received.length)window.CTI_SYNC_VIEW.apply(p.received.map(item=>item.key));
    const seen=Object.assign({},previous.seen||{});
    for(const key of GROUPS[ns]){
      await pause();
      if(p.conflicts.includes(key)){
        // Preservar o baseline anterior: nunca marcar divergência como resolvida.
        delete seen[key];
      }else{
        seen[key]=fnv(local[key]);
      }
    }
    meta.namespaces[ns]={initialized:true,version,seen};
    saveMeta(meta);
    return {received:p.received.length>0,deferred:false,
            conflicts:p.conflicts.map(key=>ns+': '+key)};
  }

  function cancelAuto(){
    if(autoTimer!==null){clearTimeout(autoTimer);autoTimer=null;autoDue=0;}
  }
  function scheduleAuto(delay=AUTO_NEXT){
    if(!STATE.automatic||!STATE.available||autoPaused||!navigator.onLine||document.hidden){cancelAuto();return;}
    if(STATE.busy){queuedDelay=queuedDelay===null?delay:Math.min(queuedDelay,delay);return;}
    const wait=Math.max(delay,AUTO_MIN-(now()-lastAttempt),retryAfter-now(),0);
    const due=now()+wait;
    // A later notification must never postpone an already scheduled upload.
    if(autoTimer!==null&&autoDue<=due)return;
    cancelAuto();autoDue=due;
    autoTimer=setTimeout(async()=>{
      autoTimer=null;autoDue=0;
      if(!STATE.automatic||autoPaused||document.hidden||!navigator.onLine)return;
      if(STATE.busy){scheduleAuto(AUTO_WRITE);return;}
      await syncAll(false);
    },wait);
  }
  function notifyChange(key){
    if(SYNC_KEYS.has(key))scheduleAuto(AUTO_WRITE);
  }

  async function syncAll(manual=false){
    if(STATE.busy||!STATE.available||!navigator.onLine)return false;
    // Uma execução por aba; sem reload e com intervalo mínimo automático.
    if(manual){autoPaused=false;retryAfter=0;cancelAuto();}
    lastAttempt=now();
    STATE.busy=true;STATE.error='';STATE.deferred=false;renderStatus();
    let received=false;
    const meta=getMeta(),problems=[];
    try{
      for(const ns of Object.keys(GROUPS)){
        try{
          const result=await syncNamespace(ns,meta);
          received=result.received||received;
          STATE.deferred=result.deferred||STATE.deferred;
          if(result.conflicts?.length)problems.push('Conflito em '+result.conflicts.join(', '));
        }catch(e){
          problems.push(e.message||'Falha de sincronização em '+ns);
          if(e.status===401){autoPaused=true;break}
          if(/^O estado remoto foi reiniciado/.test(e.message||'')){autoPaused=true;break}
        }
      }
      if(!problems.length&&!STATE.deferred){meta.lastSync=now();saveMeta(meta);STATE.last=meta.lastSync;}
      STATE.received=received&&!STATE.automatic;
      STATE.error=problems.join(' · ').slice(0,450);
      retryAfter=problems.length?now()+AUTO_RETRY:0;
      if(manual&&typeof window.toast==='function'){
        window.toast(STATE.error|| (STATE.deferred?'Volte ao painel para concluir a recuperação dos dados.':received&&!STATE.automatic?'Dados recebidos. Atualize a página para vê-los.':'Sincronização concluída.'));
      }
      return !problems.length;
    }catch(e){
      STATE.error=e.message||'Sincronização indisponível.';
      retryAfter=now()+AUTO_RETRY;
      if(e.status===401||/^Conflito em |^O estado remoto foi reiniciado/.test(STATE.error))autoPaused=true;
      if(manual&&typeof window.toast==='function')window.toast(STATE.error);
      return false;
    }finally{
      STATE.busy=false;renderStatus();
      const delay=queuedDelay;queuedDelay=null;
      scheduleAuto(STATE.error?AUTO_RETRY:delay===null?AUTO_NEXT:delay);
    }
  }

  function statusText(){
    if(!STATE.available)return 'Sincronização ainda não disponível';
    if(!navigator.onLine)return 'Offline · alterações serão sincronizadas ao reconectar';
    if(STATE.busy)return 'Sincronizando…';
    if(STATE.error)return 'Sincronização pendente · '+STATE.error;
    if(STATE.deferred)return 'Dados disponíveis · volte ao painel para receber';
    if(STATE.received)return 'Dados recebidos · atualize a página para visualizá-los';
    if(STATE.last)return 'Sincronizado · '+new Date(STATE.last).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return 'Pronto para sincronizar';
  }
  function renderStatus(){
    document.querySelectorAll('[data-sync-status]').forEach(el=>el.textContent=statusText());
    document.querySelectorAll('[data-sync-now]').forEach(b=>b.disabled=STATE.busy||!STATE.available||!navigator.onLine);
    const badge=document.getElementById('btnConta');
    if(badge){badge.title=statusText();badge.setAttribute('aria-label','Conta e sincronização: '+statusText());
      const dot=badge.querySelector('[data-sync-dot]');if(dot)dot.style.background=STATE.error?'#dc2626':!navigator.onLine?'#64748b':STATE.busy||STATE.deferred?'#d97706':STATE.last?'#16a34a':'#64748b';}
  }

  function ensureUI(){
    if(document.getElementById('ctiAccountDialog'))return;
    const header=document.querySelector('.hdr-act');
    if(header&&!document.getElementById('btnConta')){
      const b=document.createElement('button');b.className='icon-btn';b.id='btnConta';b.title='Conta e sincronização';
      b.innerHTML='<svg class="i"><use href="#i-lock"/></svg><span data-sync-dot aria-hidden="true" style="position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:50%;background:#64748b;pointer-events:none"></span>';b.style.position='relative';header.insertBefore(b,document.getElementById('btnLogout'));b.onclick=openAccount;
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
      STATE.automatic=STATE.available&&st.sync_auto_available===true;
      if(!st.password_change_available){
        const box=document.querySelector('.account-password-box');
        if(box)box.innerHTML='<h3>Alteração de senha</h3><p class="small muted">A troca de senha dentro do CTI ainda não está disponível nesta modalidade de conta.</p>';
      }
    }catch(e){
      STATE.available=false;
      STATE.error='';
    }
    renderStatus();
    if(STATE.automatic){
      window.addEventListener('online',()=>{renderStatus();scheduleAuto(1000)});
      window.addEventListener('offline',()=>{cancelAuto();renderStatus()});
      const wake=()=>{renderStatus();scheduleAuto(AUTO_WRITE)};
      window.addEventListener('pageshow',wake);
      window.addEventListener('focus',wake);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAuto();else wake()});
      scheduleAuto(AUTO_WRITE);
    }
  }

  window.CTI_SYNC={syncNow:()=>syncAll(true),status:()=>({available:STATE.available,automatic:STATE.automatic,last:STATE.last,error:STATE.error,deferred:STATE.deferred}),onDashboard:()=>scheduleAuto(AUTO_WRITE),notifyChange};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();