(function(){
  'use strict';

  const CACHE_KEY='cti_material_estudo_v1';
  const FLASH_KEY='cti_study_flashcards_v32';
  const VERSION=1;
  const state={material:null,source:null,tab:'sheet',busy:false};

  const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
  const set=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('cti_csrf='))?.split('=').slice(1).join('=')||'');
  const today=()=>new Date().toLocaleDateString('sv-SE');
  const uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);

  function cache(){return get(CACHE_KEY,{})}
  function sourceNow(){
    try{
      if(typeof viewAtual==='function' && viewAtual()==='quiz' && typeof S!=='undefined' && S?.questoes?.length){
        const q=S.questoes[S.idx||0], r=S.respostas?.[q.id];
        if(!r) return null;
        if(S.modo==='prova' && !S.finalizado) return null;
        return {
          key:'q:'+q.id,
          type:'question',
          title:q.tema||q.especialidade||('Questão '+q.id),
          area:q.especialidade||q.area||'',
          theme:q.tema||'',
          context:{origin:'question',questionId:q.id,answered:true,selectedOption:r.sel||null,mode:S.modo||'treino'}
        };
      }
      if(typeof viewAtual==='function' && viewAtual()==='segunda' && typeof F2S!=='undefined' && F2S?.est && F2S.fase==='resultado'){
        const e=F2S.est;
        const lost=(e.checklist||[]).filter(it=>!it.anulado&&(F2S.marc?.[it.n]??0)<Number(it.max||0)).map(it=>Number(it.n));
        return {
          key:'s:'+e.id,
          type:'station',
          title:e.titulo||e.area||'Estação',
          area:e.area||'',
          theme:e.titulo||'',
          context:{origin:'fase2',stationId:e.id,phase:'resultado',lostItems:lost}
        };
      }
    }catch{}
    return null;
  }

  function ensureModal(){
    if(document.getElementById('mb33Modal')) return;
    const m=document.createElement('div');
    m.id='mb33Modal';m.className='mb33-modal';m.hidden=true;
    m.innerHTML=`
      <div class="mb33-backdrop" data-mb33-close></div>
      <section class="mb33-dialog" role="dialog" aria-modal="true" aria-labelledby="mb33Title">
        <header class="mb33-head">
          <div><span class="pill pri">Material de Estudo</span><h2 id="mb33Title">Revisão do tema</h2><p id="mb33Meta" class="small muted"></p></div>
          <button class="btn sec sm" data-mb33-close>Fechar</button>
        </header>
        <div class="mb33-tabs"><button class="on" data-tab="sheet">Folha de Estudo</button><button data-tab="flash">Flashcards</button></div>
        <div class="mb33-actions">
          <button class="btn sec sm" id="mb33SaveFlash">Salvar flashcards no Caderno</button>
          <button class="btn sec sm" id="mb33Print">PDF / Imprimir</button>
          <button class="btn sec sm" id="mb33Regenerate">Regenerar</button>
        </div>
        <div id="mb33Status" class="mb33-status small muted"></div>
        <main id="mb33Body" class="mb33-body"></main>
      </section>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-mb33-close]').forEach(b=>b.onclick=close);
    m.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});
    document.getElementById('mb33SaveFlash').onclick=saveFlashcards;
    document.getElementById('mb33Print').onclick=()=>window.print();
    document.getElementById('mb33Regenerate').onclick=()=>regenerate();
  }

  function close(){const m=document.getElementById('mb33Modal');if(m)m.hidden=true;document.documentElement.classList.remove('mb33-open')}
  function openModal(){ensureModal();document.getElementById('mb33Modal').hidden=false;document.documentElement.classList.add('mb33-open')}

  async function apiStudy(src,force=false){
    const c=cache();
    if(!force && c[src.key]?.material) return c[src.key].material;
    const r=await fetch('/api/kotu/estudo',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
      body:JSON.stringify({context:src.context})
    });
    const j=await r.json().catch(()=>({}));
    if(r.status===401){location.replace('/?reason=session');throw new Error('Sessão expirada.')}
    if(!r.ok)throw new Error(j.detail||j.message||'Não foi possível gerar o material.');
    if(!j.ok||!j.material)throw new Error(j.message||'Não foi possível gerar o material.');
    c[src.key]={schema:VERSION,created:Date.now(),source:src,material:j.material,model:j.meta?.model||''};
    set(CACHE_KEY,c);
    return j.material;
  }

  async function open(src=sourceNow(),force=false){
    if(!src)return;
    state.source=src;state.tab='sheet';state.busy=true;state.material=null;
    openModal();render();
    try{state.material=await apiStudy(src,force)}
    catch(e){state.material={__error:e.message||'Não foi possível gerar o material.'}}
    finally{state.busy=false;render()}
  }

  async function regenerate(){
    if(!state.source||state.busy)return;
    if(!confirm('Regenerar este material? Isso fará uma nova chamada à IA e substituirá a versão salva neste navegador.'))return;
    const c=cache();delete c[state.source.key];set(CACHE_KEY,c);
    await open(state.source,true);
  }

  function list(title,arr){
    arr=Array.isArray(arr)?arr.filter(Boolean):[];
    if(!arr.length)return '';
    return `<section><h3>${esc(title)}</h3><ul>${arr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`;
  }
  function objList(title,arr,fields){
    arr=Array.isArray(arr)?arr:[];
    if(!arr.length)return '';
    return `<section><h3>${esc(title)}</h3><div class="mb33-cards">${arr.map(x=>`<article>${fields.map(([k,l])=>x?.[k]?`<p><b>${esc(l)}:</b> ${esc(x[k])}</p>`:'').join('')}</article>`).join('')}</div></section>`;
  }
  function sheet(m){
    const sf=m.segunda_fase||{};
    return `<article class="mb33-sheet">
      <div class="mb33-title"><h1>${esc(m.titulo||'Material de estudo')}</h1>${m.subtitulo?`<p>${esc(m.subtitulo)}</p>`:''}<span>${esc(m.area||'')}${m.tema?' · '+esc(m.tema):''}</span></div>
      ${m.o_que_foi_testado?`<section><h3>O que foi testado</h3><p>${esc(m.o_que_foi_testado)}</p></section>`:''}
      ${list('Essenciais',m.essenciais)}
      ${list('Raciocínio',m.raciocinio)}
      ${list('Quadro clínico',m.quadro_clinico)}
      ${list('Diagnóstico',m.diagnostico)}
      ${objList('Diferenciais',m.diferenciais,[['nome','Diagnóstico'],['como_diferenciar','Como diferenciar']])}
      ${list('Conduta',m.conduta)}
      ${objList('Farmacologia',m.farmacologia,[['item','Item'],['dose','Dose'],['observacao','Observação']])}
      ${list('Red flags',m.red_flags)}
      ${list('Pegadinhas de prova',m.pegadinhas)}
      ${list('Dicas',m.tips)}
      ${list('Além da questão',m.alem_da_questao)}
      ${list('Roteiro de 10 minutos',sf.roteiro_10min)}
      ${list('Frases que pontuam',sf.frases_que_pontuam)}
      ${list('Erros comuns',sf.erros_comuns)}
      ${m.fechamento?`<section><h3>Fechamento</h3><p>${esc(m.fechamento)}</p></section>`:''}
    </article>`;
  }
  function flash(m){
    const a=Array.isArray(m.flashcards)?m.flashcards:[];
    if(!a.length)return '<div class="empty">Nenhum flashcard foi gerado.</div>';
    return `<div class="mb33-flash-grid">${a.map((x,i)=>`<article><span class="tiny muted">Flashcard ${i+1}</span><h3>${esc(x.frente)}</h3><div class="mb33-flash-back"><b>Resposta</b><p>${esc(x.verso)}</p></div></article>`).join('')}</div>`;
  }

  function render(){
    ensureModal();
    const src=state.source, m=state.material, body=document.getElementById('mb33Body'), status=document.getElementById('mb33Status');
    if(src){document.getElementById('mb33Title').textContent=src.title||'Material de Estudo';document.getElementById('mb33Meta').textContent=[src.area,src.theme].filter(Boolean).join(' · ')}
    document.querySelectorAll('#mb33Modal [data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===state.tab));
    document.getElementById('mb33SaveFlash').hidden=state.tab!=='flash';
    if(state.busy){status.textContent='Gerando o material pela primeira vez. Depois ele ficará salvo neste navegador.';body.innerHTML='<div class="mb33-loading"><span></span><b>Preparando material de estudo…</b></div>';return}
    status.textContent=src&&cache()[src.key]?.material?'Material salvo neste navegador. Reabrir não consome nova chamada de IA.':'';
    if(!m){body.innerHTML='<div class="empty">Sem material.</div>';return}
    if(m.__error){body.innerHTML=`<div class="fb bad">${esc(m.__error)}</div>`;return}
    body.innerHTML=state.tab==='flash'?flash(m):sheet(m);
  }

  function saveFlashcards(){
    const m=state.material,src=state.source;if(!m||m.__error||!src)return;
    const cards=Array.isArray(m.flashcards)?m.flashcards.filter(x=>x?.frente&&x?.verso):[];
    if(!cards.length)return;
    const f=get(FLASH_KEY,{});
    let added=0;
    cards.forEach((x,i)=>{
      const id='ai:'+src.key+':'+i;
      if(f[id])return;
      f[id]={id,qid:src.type==='question'?Number(src.context.questionId):null,stationId:src.type==='station'?src.context.stationId:null,source:'ai-material',area:src.area||m.area||'',tema:src.theme||m.tema||'',frente:String(x.frente).slice(0,400),verso:String(x.verso).slice(0,900),proxima:today(),intervalo:1,reps:0,created:Date.now()};
      added++;
    });
    set(FLASH_KEY,f);
    if(typeof toast==='function')toast(added?added+' flashcards adicionados ao Caderno.':'Esses flashcards já estão no Caderno.');
  }

  function inject(){
    const src=sourceNow();
    const oldQ=document.getElementById('mb33QuestionCTA'), oldS=document.getElementById('mb33StationCTA');
    if(!src){oldQ?.remove();oldS?.remove();return}
    const id=src.type==='question'?'mb33QuestionCTA':'mb33StationCTA';
    if(document.getElementById(id))return;
    const btn=document.createElement('div');btn.id=id;btn.className='mb33-cta';
    const cached=!!cache()[src.key]?.material;
    btn.innerHTML=`<div><b>${src.type==='question'?'Material de Estudo':'Material da Estação'}</b><span>${cached?'Abrir material salvo':'Gerar folha de estudo + flashcards + PDF'}</span></div><button class="btn sm">${cached?'Abrir':'Gerar material'}</button>`;
    btn.querySelector('button').onclick=()=>open(src,false);
    if(src.type==='question'){
      const anchor=document.getElementById('qzIA')||document.getElementById('qzFb');
      anchor?.insertAdjacentElement('afterend',btn);
    }else{
      const anchor=document.getElementById('f2Est');
      anchor?.prepend(btn);
    }
  }

  window.CTI_MB33={openCurrent:()=>open(sourceNow(),false),open,sourceNow};
  ensureModal();
  new MutationObserver(()=>inject()).observe(document.body,{subtree:true,childList:true});
  setTimeout(inject,500);
})();