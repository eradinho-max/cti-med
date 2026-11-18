(function ceraModule(){
  'use strict';
  const KEY='cti_cera_v1';
  const STEPS=[1,3,7,14,30];
  const STAGES=['C','E','R','A'];
  const $=s=>document.querySelector(s);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const today=()=>new Date().toLocaleDateString('sv-SE');
  const plus=(iso,days)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+days);return d.toLocaleDateString('sv-SE')};
  const display=iso=>iso?new Date(iso+'T12:00:00').toLocaleDateString('pt-BR'):'—';
  const fresh=()=>({version:1,active:null,topics:{}});
  function read(){
    try {const obj=JSON.parse(localStorage.getItem(KEY));return obj&&obj.version===1&&obj.topics&&typeof obj.topics==='object'?obj:fresh()}
    catch{return fresh()}
  }
  let db=read();
  const state={area:'',theme:'',answers:['','',''],reviewAnswer:'',adjustType:'',adjustText:'',reviewChecked:false,reviewRating:''};
  const key=(area,theme)=>JSON.stringify([area,theme]);
  const history=()=>typeof HIST!=='undefined'&&Array.isArray(HIST)?HIST:[];
  const current=()=>db.topics[key(state.area,state.theme)]||null;
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify(db));return true}
    catch{alert('Não foi possível salvar o CERA neste dispositivo. Verifique o espaço disponível.');return false}
  }
  function topics(){
    const src=typeof INDICE!=='undefined'&&Array.isArray(INDICE)?INDICE:[];
    const map=new Map();
    for(const q of src){
      if(!q||q.valida===false||q.dup)continue;
      const area=String(q.area||q.especialidade||'').trim(),theme=String(q.tema||'').trim();
      if(!area||!theme)continue;
      const k=key(area,theme),v=map.get(k)||{area,theme,count:0};
      v.count++;map.set(k,v);
    }
    const counts=new Map();
    for(const h of history()){
      const k=key(h.area||'',h.tema||''),v=counts.get(k)||{n:0,ok:0};
      v.n++;if(h.acertou)v.ok++;counts.set(k,v);
    }
    const out=Array.from(map.values());
    for(const t of out){const h=counts.get(key(t.area,t.theme))||{n:0,ok:0};t.attempts=h.n;t.accuracy=h.n?Math.round(100*h.ok/h.n):null}
    return out.sort((a,b)=>a.area.localeCompare(b.area,'pt-BR')||a.theme.localeCompare(b.theme,'pt-BR'));
  }
  function recommend(rows){
    return rows.slice().sort((a,b)=>{
      const aw=a.attempts>=3?(100-a.accuracy):null,bw=b.attempts>=3?(100-b.accuracy):null;
      if(aw!==null||bw!==null){if(aw===null)return 1;if(bw===null)return -1;if(aw!==bw)return bw-aw}
      return b.count-a.count;
    })[0]||null;
  }
  function selected(rows){
    let t=rows.find(x=>x.area===state.area&&x.theme===state.theme);
    if(!t&&db.active)t=rows.find(x=>key(x.area,x.theme)===db.active);
    if(!t)t=recommend(rows);
    if(t){state.area=t.area;state.theme=t.theme}
    return t;
  }
  function resetForm(){
    state.answers=['','',''];state.reviewAnswer='';state.adjustType='';state.adjustText='';state.reviewChecked=false;state.reviewRating='';
  }
  function setRecord(rec){rec.updatedAt=Date.now();db.topics[key(state.area,state.theme)]=rec;db.active=key(state.area,state.theme);return persist()}
  function practice(rec){
    if(!rec.practiceStartedAt)return [];
    return history().filter(h=>Number(h.ts||0)>=rec.practiceStartedAt&&h.area===rec.area&&h.tema===rec.theme);
  }
  function stats(){
    const all=Object.values(db.topics);
    return {started:all.length,due:all.filter(r=>r.stage==='review'&&r.nextDue&&r.nextDue<=today()).length,
      evoked:all.filter(r=>!!r.evocationAt).length,reviews:all.reduce((s,r)=>s+(r.reviews||[]).length,0)};
  }
  function header(rec,t){
    const s=stats();
    return `<div class="cera-top"><div><span class="pill pri">Método CERA · CTI</span><h2>Aprenda, recupere e aplique</h2><p class="small muted">Um percurso que conecta seus resumos, questões, erros e flashcards. As avaliações discursivas são autoavaliadas; os acertos objetivos vêm do histórico real.</p></div><div class="cera-kpis"><div><b>${s.started}</b><span>Temas iniciados</span></div><div><b>${s.due}</b><span>Revisões vencidas</span></div><div><b>${s.evoked}</b><span>Evocações</span></div><div><b>${s.reviews}</b><span>Revisões feitas</span></div></div></div>
    <div class="cera-filters"><label class="f">Área<select id="ceraArea"></select></label><label class="f">Tema<select id="ceraTheme"></select></label><button class="btn sec" type="button" data-cera="suggest">Sugerir tema</button></div>
    ${t?`<div class="cera-selected"><b>${esc(t.theme)}</b><span class="small muted">${esc(t.area)} · ${t.count} questões no banco${t.accuracy===null?'':` · acertos históricos ${t.accuracy}% (${t.attempts} tentativas)`}</span></div>`:'<div class="empty">Os temas do banco ainda não foram carregados.</div>'}
    ${rec?`<div class="cera-flow">${STAGES.map((s,i)=>`<span class="${rec.stage===s?'active':STAGES.indexOf(rec.stage)>i||rec.stage==='review'?'done':''}"><b>${s}</b>${{C:'Compreender',E:'Evocar',R:'Resolver',A:'Ajustar'}[s]}</span>`).join('')}<span class="${rec.stage==='review'?'active':''}"><b>↻</b>Revisar</span></div>`:''}`;
  }
  function panel(rec){
    if(!state.theme)return '';
    if(!rec)return `<div class="cera-panel"><h3>Iniciar uma trilha de estudo</h3><p>Comece por um tema do banco de questões. O CTI registrará a etapa atual e organizará suas próximas recuperações.</p><button class="btn" data-cera="start" type="button">Iniciar Método CERA</button></div>`;
    if(rec.stage==='C')return `<div class="cera-panel"><span class="cera-step-tag">01 · Compreender</span><h3>Estude o fundamento antes de decorar</h3><p>Revise conceito, mecanismo, achados principais, diagnósticos diferenciais e condutas aplicáveis. Use o material de reforço já existente no CTI e confira sempre suas fontes.</p><div class="cera-hint">Sugestão de estudo: aproximadamente 20 minutos, ajustáveis à complexidade do assunto. A marcação desta etapa é autodeclarada.</div><div class="cera-actions"><button class="btn sec" data-cera="summary" type="button">Abrir reforço deste tema</button><button class="btn" data-cera="understood" type="button">Concluí o estudo → Evocar</button></div></div>`;
    if(rec.stage==='E')return `<div class="cera-panel"><span class="cera-step-tag">02 · Evocar</span><h3>Responda sem consultar o material</h3><p class="small muted">Escreva de memória. Depois confronte as respostas com suas fontes. O CTI não considera texto digitado como resposta clinicamente correta sem correção.</p>${[
        `Explique o conceito e os mecanismos centrais de ${rec.theme}.`,
        `Descreva os achados, critérios ou informações que permitem reconhecer ${rec.theme}.`,
        `Quais decisões, diferenciais ou condutas são mais relevantes em ${rec.theme}?`
      ].map((q,i)=>`<label class="cera-prompt"><b>${i+1}. ${esc(q)}</b><textarea data-cera-answer="${i}" rows="3" maxlength="1600" placeholder="Responda com suas palavras, sem consulta.">${esc(state.answers[i])}</textarea></label>`).join('')}<div class="cera-actions"><button class="btn sec" type="button" data-cera="summary">Conferir no material</button><button class="btn" type="button" data-cera="evoked">Registrei e conferi → Resolver</button></div></div>`;
    if(rec.stage==='R'){
      const answers=practice(rec),correct=answers.filter(x=>x.acertou).length,n=answers.length;
      return `<div class="cera-panel"><span class="cera-step-tag">03 · Resolver</span><h3>Aplique em questões oficiais</h3><p>O CTI abre um treino de 10 questões do tema. Ao retornar, os resultados serão lidos diretamente do histórico, sem exigir que você informe uma nota.</p>
      <div class="cera-kpis cera-results"><div><b>${n}</b><span>Respondidas no ciclo</span></div><div><b>${correct}</b><span>Acertos</span></div><div><b>${n?Math.round(100*correct/n)+'%':'—'}</b><span>Taxa de acerto</span></div></div>
      ${n?'<div class="cera-hint">Este resultado mede apenas as questões respondidas neste ciclo; não é uma nota validada de domínio.</div>':'<div class="cera-hint">Nenhuma questão registrada neste ciclo. Inicie o treino e responda pelo menos uma questão.</div>'}
      <div class="cera-actions"><button class="btn sec" type="button" data-cera="train">Abrir treino de 10 questões</button><button class="btn sec" type="button" data-cera="refresh">Atualizar resultados</button><button class="btn" data-cera="resolved" type="button" ${n?'':'disabled'}>Registrar prática → Ajustar</button></div></div>`;
    }
    if(rec.stage==='A'){
      const p=rec.practice||{};
      return `<div class="cera-panel"><span class="cera-step-tag">04 · Ajustar</span><h3>Transforme erros em decisões de estudo</h3><p class="small muted">Seu treino registrou ${p.n||0} questões, com ${p.correct||0} acertos (${p.n?Math.round(100*p.correct/p.n):0}%). Identifique o tipo de lacuna antes de agendar a revisão.</p><label class="f">Principal dificuldade<select id="ceraAdjustType"><option value="">Selecione</option><option value="nenhuma">Nenhuma dificuldade relevante</option><option value="conceito">Não compreendi o conceito</option><option value="esquecimento">Esqueci uma informação</option><option value="interpretacao">Errei a interpretação do caso</option><option value="inseguranca">Acertei, mas fiquei inseguro</option></select></label><label class="f">O que devo corrigir? (opcional)<textarea id="ceraAdjustText" rows="3" maxlength="1000" placeholder="Descreva a lacuna e a resposta correta que verificou no material.">${esc(state.adjustText)}</textarea></label><div class="cera-actions"><button class="btn sec" type="button" data-cera="notebook">Abrir Caderno de Estudo</button><button class="btn" type="button" data-cera="adjusted">Agendar primeira revisão (D+1)</button></div></div>`;
    }
    if(rec.stage==='review'){
      const due=rec.nextDue<=today(),next=display(rec.nextDue),log=rec.reviews||[];
      return `<div class="cera-panel"><span class="cera-step-tag">05 · Recuperar e consolidar</span><h3>${due?'Revisão disponível':'Próxima revisão: '+next}</h3><p>${due?'Explique o conteúdo novamente sem olhar as fontes.':'Você pode antecipar a revisão se desejar. O intervalo será recalculado a partir do desempenho informado.'}</p><p class="small muted">Histórico: ${log.length} revisão(ões). Última classificação: ${esc(log.at(-1)?.rating||'não realizada')}.</p>
      <label class="cera-prompt"><b>De memória: explique os pontos fundamentais de ${esc(rec.theme)} e uma decisão ou diferenciação importante.</b><textarea id="ceraReviewAnswer" rows="4" maxlength="1600" placeholder="Responda antes de consultar o material.">${esc(state.reviewAnswer)}</textarea></label>
      <div class="cera-actions"><button class="btn sec" type="button" data-cera="summary">Conferir na fonte</button><button class="btn sec" type="button" data-cera="flashcards">Revisar flashcards</button></div>
      <label class="cera-check"><input type="checkbox" id="ceraReviewed" ${state.reviewChecked?'checked':''}> Conferi minha resposta com o material e identifiquei omissões ou erros.</label>
      <label class="f">Como foi a recuperação?<select id="ceraReviewRating"><option value="">Selecione após conferir</option><option value="seguro">Correta e segura</option><option value="parcial">Parcial ou com dúvida</option><option value="nao">Não lembrei ou estava incorreta</option></select></label>
      <div class="cera-actions"><button class="btn" type="button" data-cera="reviewed">Salvar revisão e programar próxima</button><button class="btn sec" type="button" data-cera="restart">Novo ciclo do tema</button></div></div>`;
    }
    return '';
  }
  function dueList(){
    const pending=Object.values(db.topics).filter(x=>x.stage==='review'&&x.nextDue&&x.nextDue<=today()).sort((a,b)=>a.nextDue.localeCompare(b.nextDue)).slice(0,12);
    return `<div class="cera-due"><div class="sec-t"><span>Revisões disponíveis</span><span class="pill">${pending.length}${Object.values(db.topics).filter(x=>x.stage==='review'&&x.nextDue&&x.nextDue<=today()).length>12?'+':''} exibidas</span></div>${pending.length?pending.map((r,i)=>`<button class="cera-due-item" data-cera-due="${i}" type="button"><b>${esc(r.theme)}</b><span>${esc(r.area)} · prevista para ${display(r.nextDue)}</span></button>`).join(''):'<p class="small muted">Nenhuma revisão vencida. Estude um novo tema ou consulte o calendário da sua trilha.</p>'}</div>`;
  }
  function render(){
    const root=$('#ctiCeraHub');if(!root)return;
    const all=topics(),choice=selected(all),rec=choice?current():null;
    const areas=[...new Set(all.map(x=>x.area))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    root.innerHTML=header(rec,choice)+panel(rec)+dueList()+`<p class="tiny muted cera-foot">Os intervalos D+1, D+3, D+7, D+14 e D+30 são uma programação inicial ajustável, não uma garantia de retenção. O Método CERA funciona sem chamadas obrigatórias à IA.</p>`;
    const area=$('#ceraArea'),theme=$('#ceraTheme');
    area.innerHTML=areas.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    area.value=state.area;
    const filtered=all.filter(x=>x.area===state.area);
    theme.innerHTML=filtered.map(x=>`<option value="${esc(x.theme)}">${esc(x.theme)}</option>`).join('');
    theme.value=state.theme;
    const a=$('#ceraAdjustType');if(a)a.value=state.adjustType;
    const r=$('#ceraReviewRating');if(r)r.value=state.reviewRating;
    root.oninput=e=>{
      if(e.target.matches('[data-cera-answer]'))state.answers[Number(e.target.dataset.ceraAnswer)]=e.target.value;
      else if(e.target.id==='ceraReviewAnswer')state.reviewAnswer=e.target.value;
      else if(e.target.id==='ceraAdjustText')state.adjustText=e.target.value;
    };
    root.onchange=e=>{
      if(e.target.id==='ceraArea'){
        const t=all.find(x=>x.area===e.target.value);
        if(t){state.area=t.area;state.theme=t.theme;resetForm();db.active=key(t.area,t.theme);persist()}render();
      }else if(e.target.id==='ceraTheme'){
        state.theme=e.target.value;resetForm();db.active=key(state.area,state.theme);persist();render();
      }else if(e.target.id==='ceraAdjustType')state.adjustType=e.target.value;
      else if(e.target.id==='ceraReviewRating')state.reviewRating=e.target.value;
      else if(e.target.id==='ceraReviewed')state.reviewChecked=e.target.checked;
    };
    root.onclick=e=>{
      const btn=e.target.closest('[data-cera],[data-cera-due]');if(!btn)return;
      if(btn.dataset.ceraDue!==undefined){
        const pending=Object.values(db.topics).filter(x=>x.stage==='review'&&x.nextDue&&x.nextDue<=today()).sort((a,b)=>a.nextDue.localeCompare(b.nextDue)).slice(0,12);
        const next=pending[Number(btn.dataset.ceraDue)];
        if(next){state.area=next.area;state.theme=next.theme;db.active=key(next.area,next.theme);resetForm();persist();render();root.scrollIntoView({behavior:'smooth',block:'start'})}return;
      }
      execute(btn.dataset.cera);
    };
  }
  function execute(action){
    const rec=current(),t=topics().find(x=>x.area===state.area&&x.theme===state.theme);
    if(action==='refresh'){render();return}
    if(action==='suggest'){
      const recommended=recommend(topics().filter(x=>!db.topics[key(x.area,x.theme)]))||recommend(topics());
      if(recommended){state.area=recommended.area;state.theme=recommended.theme;db.active=key(state.area,state.theme);resetForm();persist();render()}return;
    }
    if(action==='start'){
      if(!t)return;
      const r={area:t.area,theme:t.theme,stage:'C',createdAt:Date.now(),updatedAt:Date.now(),reviews:[],reviewStep:0};
      if(setRecord(r))render();return;
    }
    if(!rec)return;
    if(action==='summary'){if(typeof window.abrirReforco==='function')window.abrirReforco(rec.theme,rec.area);return}
    if(action==='notebook'||action==='flashcards'){
      const dest=$('#mb32NotebookCard');
      if(dest){dest.scrollIntoView({behavior:'smooth',block:'start'});if(action==='flashcards')dest.querySelector('#mb32ReviewBtn')?.click()}
      else if(typeof window.toast==='function')window.toast('O Caderno não está disponível nesta sessão.');
      return;
    }
    if(action==='understood'&&rec.stage==='C'){
      rec.stage='E';rec.comprehensionAt=Date.now();if(setRecord(rec)){resetForm();render()}return;
    }
    if(action==='evoked'&&rec.stage==='E'){
      const responses=state.answers.map(v=>v.trim());
      if(responses.some(v=>v.length<12)){if(typeof window.toast==='function')window.toast('Preencha as três respostas com pelo menos 12 caracteres.');return}
      rec.evocation=responses.map(v=>v.slice(0,900));rec.evocationAt=Date.now();rec.stage='R';
      if(setRecord(rec)){resetForm();render()}return;
    }
    if(action==='train'&&rec.stage==='R'){
      rec.practiceStartedAt=rec.practiceStartedAt||Date.now()-1000;
      if(setRecord(rec)&&typeof window.treinarArea==='function')window.treinarArea(rec.area,rec.theme);
      return;
    }
    if(action==='resolved'&&rec.stage==='R'){
      const attempt=practice(rec);if(!attempt.length)return;
      const correct=attempt.filter(x=>x.acertou).length;
      rec.practice={n:attempt.length,correct,wrong:attempt.length-correct,lastAt:Date.now()};
      rec.stage='A';if(setRecord(rec)){resetForm();render()}return;
    }
    if(action==='adjusted'&&rec.stage==='A'){
      if(!state.adjustType){if(typeof window.toast==='function')window.toast('Identifique a principal dificuldade.');return}
      rec.adjustment={type:state.adjustType,note:state.adjustText.trim().slice(0,1000),at:Date.now()};
      rec.nextDue=plus(today(),1);rec.reviewStep=0;rec.stage='review';
      if(setRecord(rec)){resetForm();render()}return;
    }
    if(action==='reviewed'&&rec.stage==='review'){
      if(state.reviewAnswer.trim().length<20||!state.reviewChecked||!state.reviewRating){
        if(typeof window.toast==='function')window.toast('Responda, confira o material e classifique a recuperação.');return;
      }
      const rating=state.reviewRating,old=Math.min(4,rec.reviewStep||0);
      rec.reviewStep=rating==='seguro'?Math.min(4,old+1):rating==='nao'?0:old;
      const days=rating==='seguro'?STEPS[rec.reviewStep]:rating==='nao'?1:Math.min(3,STEPS[rec.reviewStep]);
      rec.nextDue=plus(today(),days);
      rec.reviews=(rec.reviews||[]).concat({at:Date.now(),rating,response:state.reviewAnswer.trim().slice(0,700),nextDue:rec.nextDue}).slice(-15);
      if(setRecord(rec)){resetForm();render()}return;
    }
    if(action==='restart'&&rec.stage==='review'){
      if(!confirm('Iniciar novo ciclo de aprendizagem neste tema? O histórico de revisões será preservado.'))return;
      rec.stage='C';rec.practiceStartedAt=null;rec.practice=null;rec.nextDue=null;rec.reviewStep=0;rec.createdAt=Date.now();
      if(setRecord(rec)){resetForm();render()}
    }
  }
  function open(){
    const nav=$('#side [data-v="reforco"]')||$('#sheet [data-go="reforco"]');
    if(nav)nav.click();
    else if(typeof mostrar==='function')mostrar('reforco');
    setTimeout(()=>{$('#ctiCeraHub')?.scrollIntoView({behavior:'smooth',block:'start'});render()},210);
  }
  function mount(){
    if(!$('#view-reforco')||$('#ctiCeraHub'))return;
    const anchor=$('#mb32Hub')||$('#rTemas');
    if(!anchor)return;
    const section=document.createElement('section');
    section.id='ctiCeraHub';section.className='card cera-card';
    anchor.parentNode.insertBefore(section,anchor);
    const side=$('#side [data-v="reforco"]');
    if(side&&!$('#ctiCeraSide')){
      const b=document.createElement('button');b.id='ctiCeraSide';b.type='button';b.innerHTML='<span aria-hidden="true">◉</span> Método CERA';b.onclick=open;
      side.insertAdjacentElement('afterend',b);
    }
    const sheet=$('#sheet [data-go="reforco"]');
    if(sheet&&!$('#ctiCeraSheet')){
      const b=document.createElement('button');b.id='ctiCeraSheet';b.type='button';b.className='it';b.textContent='Método CERA · Aprendizagem Ativa';b.onclick=()=>{$('#sheet')?.classList.remove('on');open()};
      sheet.insertAdjacentElement('afterend',b);
    }
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-v="reforco"],[data-go="reforco"]'))setTimeout(render,180);
    },true);
    window.addEventListener('focus',()=>{if($('#view-reforco')?.classList.contains('on'))render()});
    window.CTI_CERA={open,summary:()=>stats()};
    render();
  }
  function init(){
    mount();
    if(typeof INDICE!=='undefined'&&Array.isArray(INDICE)&&INDICE.length){render();return}
    let attempts=0;const tick=()=>{if(typeof INDICE!=='undefined'&&Array.isArray(INDICE)&&INDICE.length){render();return}
      if(++attempts<80)setTimeout(tick,250);};setTimeout(tick,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
