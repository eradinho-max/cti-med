(function(){
  'use strict';
  if (document.getElementById('kotuRoot')) return;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cookie=n=>document.cookie.split('; ').find(x=>x.startsWith(n+'='))?.split('=').slice(1).join('=')||'';
  const csrf=()=>decodeURIComponent(cookie('cti_csrf')||'');
  const K={msgs:[],busy:false,ctrl:null,ctx:null,open:false};
  const AV='/static/img/kotu-avatar.webp';

  function view(){
    try{return typeof viewAtual==='function'?viewAtual():'painel'}catch{return 'painel'}
  }
  function ctx(){
    try{
      if(view()==='quiz' && typeof S!=='undefined' && S && Array.isArray(S.questoes) && S.questoes.length){
        const q=S.questoes[S.idx||0], r=S.respostas?.[q.id], selected=r?.sel||S.selecao?.[q.id]||null;
        const answered=!!r || !!S.finalizado;
        return {
          label:'Questão · '+(q.tema||q.especialidade||''),
          locked:S.modo==='prova'&&!S.finalizado,
          payload:{origin:S.modo==='prova'?'exam':'question',questionId:q.id,answered,selectedOption:selected,mode:S.modo||'treino'}
        };
      }
      if(view()==='segunda' && typeof F2S!=='undefined' && F2S?.est){
        const e=F2S.est;
        return {
          label:'2ª Fase · '+(e.titulo||e.area||'Estação'),
          locked:false,
          payload:{origin:'fase2',stationId:e.id,phase:F2S.fase||'estacao',lostItems:[]}
        };
      }
    }catch{}
    return {label:'CTi · '+view(),locked:false,payload:{origin:view()}};
  }
  function md(s){
    s=esc(s||'');
    s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/^### (.+)$/gm,'<h4>$1</h4>');
    s=s.replace(/^[-•] (.+)$/gm,'<li>$1</li>');
    s=s.replace(/(?:<li>.*?<\/li>\n?)+/gs,m=>'<ul>'+m+'</ul>');
    return s.split(/\n{2,}/).map(x=>/^<(ul|h4)/.test(x)?x:'<p>'+x.replace(/\n/g,'<br>')+'</p>').join('');
  }
  function mount(){
    const root=document.createElement('div'); root.id='kotuRoot'; root.innerHTML=`
      <button class="kotu-launch" id="kotuLaunch" aria-label="Abrir Kotu"><img src="${AV}" alt=""><span>Kotu</span></button>
      <section class="kotu-panel" id="kotuPanel" hidden aria-label="Kotu, IA do CTi">
        <header><img src="${AV}" alt=""><div><b>Kotu</b><small>IA do CTi</small></div><button id="kotuClose" aria-label="Fechar">×</button></header>
        <div class="kotu-context" id="kotuContext"></div>
        <div class="kotu-lock" id="kotuLock" hidden><b>Modo Prova</b><p>Para preservar o simulado, o Kotu fica bloqueado até a entrega.</p></div>
        <div class="kotu-msgs" id="kotuMsgs"></div>
        <div class="kotu-chips" id="kotuChips"></div>
        <form class="kotu-form" id="kotuForm"><textarea id="kotuInput" rows="1" maxlength="2500" placeholder="Pergunte ao Kotu…"></textarea><button type="submit" id="kotuSend">Enviar</button></form>
      </section>`;
    document.body.appendChild(root);
    document.getElementById('kotuLaunch').onclick=open;
    document.getElementById('kotuClose').onclick=close;
    document.getElementById('kotuForm').onsubmit=e=>{e.preventDefault();send(document.getElementById('kotuInput').value)};
    let syncQueued=false;
    const scheduleSync=()=>{
      if(!K.open||syncQueued)return;
      syncQueued=true;
      requestAnimationFrame(()=>{syncQueued=false;sync(false)});
    };
    // Observa apenas mudança de classes de navegação. Não observa childList:
    // o próprio render do Kotu altera filhos e antes causava loop de MutationObserver.
    new MutationObserver(scheduleSync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('popstate',scheduleSync);
    window.addEventListener('hashchange',scheduleSync);
  }
  function open(){K.open=true;document.getElementById('kotuPanel').hidden=false;sync(true);setTimeout(()=>document.getElementById('kotuInput')?.focus(),30)}
  function close(){K.open=false;document.getElementById('kotuPanel').hidden=true}
  let LAST_CTX='';
  function sync(force=false){
    const c=ctx();
    const sig=JSON.stringify(c.payload||{})+'|'+c.label+'|'+String(c.locked);
    if(!force && sig===LAST_CTX)return;
    LAST_CTX=sig; K.ctx=c;
    document.getElementById('kotuContext').textContent='Contexto: '+c.label;
    document.getElementById('kotuLock').hidden=!c.locked;
    document.getElementById('kotuMsgs').hidden=c.locked;
    document.getElementById('kotuChips').hidden=c.locked;
    document.getElementById('kotuForm').hidden=c.locked;
    if(c.locked)return;
    let chips=[['O que estudar agora?','Analise meu contexto atual e diga o que devo priorizar agora.']];
    if(c.payload.origin==='question'){
      chips=c.payload.answered?
        [['Explique a questão','Explique o raciocínio desta questão de forma objetiva.'],['Por que errei?','Explique meu erro de raciocínio nesta questão.'],['Flashcards','Crie 5 flashcards deste tema.'],['Material do tema','__STUDY__']]:
        [['Explique o conceito','Explique o conceito central sem revelar a resposta.'],['Como raciocinar?','Mostre como organizar o raciocínio sem dar spoiler.']];
    } else if(c.payload.origin==='fase2'){
      chips=[['Roteiro de 10 min','Monte um roteiro de 10 minutos para esta estação sem violar a fase atual.'],['Diferenciais','Quais diferenciais devo considerar aqui?'],['Material da estação','__STUDY__']];
    }
    document.getElementById('kotuChips').innerHTML=chips.map(([a,b])=>'<button type="button" data-p="'+esc(b)+'">'+esc(a)+'</button>').join('');
    document.querySelectorAll('#kotuChips button').forEach(b=>b.onclick=()=>b.dataset.p==='__STUDY__'?study():send(b.dataset.p));
    render();
  }
  function render(){
    const box=document.getElementById('kotuMsgs'); if(!box)return;
    let h='<div class="kotu-m"><img src="'+AV+'" alt=""><div class="kotu-b"><strong>Kotu</strong><br>Posso explicar questões, revisar temas e ajudar na 2ª fase.</div></div>';
    for(const m of K.msgs){
      h += m.role==='user'
        ? '<div class="kotu-m user"><div class="kotu-b">'+esc(m.content)+'</div></div>'
        : '<div class="kotu-m"><img src="'+AV+'" alt=""><div class="kotu-b '+(m.role==='error'?'err':'')+'">'+(m.role==='error'?esc(m.content):md(m.content))+'</div></div>';
    }
    if(K.busy)h+='<div class="kotu-m"><img src="'+AV+'" alt=""><div class="kotu-b">Pensando…</div></div>';
    box.innerHTML=h; box.scrollTop=box.scrollHeight;
  }
  async function call(url,body){
    const r=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({}));
    if(r.status===401){location.replace('/?reason=session');throw new Error('Sessão expirada.')}
    if(r.status===423)throw new Error(j.detail||'Kotu bloqueado no Modo Prova.');
    if(!r.ok)throw new Error(j.detail||j.message||'Falha no servidor.');
    return j;
  }
  async function send(text){
    text=String(text||'').trim().slice(0,2500); if(!text||K.busy)return;
    const input=document.getElementById('kotuInput'); if(input)input.value='';
    const c=ctx(); if(c.locked)return sync(true);
    const hist=K.msgs.filter(m=>m.role==='user'||m.role==='assistant').slice(-8).map(m=>({role:m.role,content:m.content}));
    K.msgs.push({role:'user',content:text});K.busy=true;render();
    try{
      const j=await call('/api/kotu/chat',{message:text,history:hist,context:c.payload});
      if(!j.ok||!j.reply)throw new Error(j.message||'Kotu está temporariamente indisponível.');
      K.msgs.push({role:'assistant',content:j.reply});
    }catch(e){K.msgs.push({role:'error',content:e.message||'Kotu está indisponível.'})}
    K.busy=false;render();
  }
  async function study(){
    const c=ctx(); if(c.locked)return;
    if(window.CTI_MB33?.openCurrent){ window.CTI_MB33.openCurrent(); return; }
    K.busy=true;render();
    try{
      const j=await call('/api/kotu/estudo',{context:c.payload});
      if(!j.ok||!j.material)throw new Error(j.message||'Não foi possível gerar o material.');
      const m=j.material;
      const txt=[
        '# '+(m.titulo||'Material de estudo'),
        m.subtitulo||'',
        '\n## O que foi testado\n'+(m.o_que_foi_testado||''),
        '\n## Essenciais\n'+(m.essenciais||[]).map(x=>'• '+x).join('\n'),
        '\n## Raciocínio\n'+(m.raciocinio||[]).map((x,i)=>(i+1)+'. '+x).join('\n'),
        '\n## Conduta\n'+(m.conduta||[]).map(x=>'• '+x).join('\n'),
        '\n## Além da questão\n'+(m.alem_da_questao||[]).map(x=>'• '+x).join('\n'),
        '\n## Flashcards\n'+(m.flashcards||[]).map(x=>'P: '+x.frente+'\nR: '+x.verso).join('\n\n')
      ].filter(Boolean).join('\n');
      K.msgs.push({role:'assistant',content:txt});
    }catch(e){K.msgs.push({role:'error',content:e.message||'Não foi possível gerar o material.'})}
    K.busy=false;render();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();