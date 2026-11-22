/* CTI | Interface da Inteligência de Provas.
   Somente leitura: preserva banco, Planner, Desempenho e CERA. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const num=n=>Number(n||0).toLocaleString('pt-BR');
  const percent=x=>Number(x||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const state={exam:'',area:'',tab:'estrategia',ready:false,sort:'prioridade'};
  const root=$('#ctiInteligenciaHub');
  function data(){
    if(typeof INDICE==='undefined'||!Array.isArray(INDICE)||!INDICE.length)return null;
    const hist=typeof HIST==='undefined'?[]:HIST;
    return window.CTI_EXAM_ANALYTICS?.analyze(INDICE,hist,state.exam,state.area)||null;
  }
  function option(value,label,selected){return '<option value="'+escape(value)+'"'+(selected?' selected':'')+'>'+escape(label)+'</option>';}
  function bar(label,value,annotation){
    return '<div class="cti-int-bar"><div class="cti-int-bar-head"><span>'+escape(label)+'</span><b>'+percent(value)+'</b></div><div class="cti-int-track"><i style="width:'+Math.max(0,Math.min(100,value))+'%"></i></div>'+(annotation?'<span class="small muted">'+escape(annotation)+'</span>':'')+'</div>';
  }
  function renderTabs(){
    return '<div class="cti-int-tabs" role="tablist" aria-label="Análises disponíveis">'+[
      ['estrategia','Minha estratégia'],['historico','Raio-X da prova'],['tipos','Como a banca cobra'],['mudancas','Evolução histórica']
    ].map(([id,title])=>'<button type="button" role="tab" data-int-tab="'+id+'" aria-selected="'+(state.tab===id)+'" class="'+(state.tab===id?'on':'')+'">'+title+'</button>').join('')+'</div>';
  }
  function status(text){root.innerHTML='<div class="card"><p class="small muted">'+escape(text)+'</p></div>';}
  function note(){
    return '<p class="small muted cti-int-note">A análise descreve exclusivamente o acervo disponível no CTI. Frequência passada não garante repetição futura. A distribuição de tipos de cobrança é uma triagem textual provisória, não uma classificação validada. Questões incertas permanecem sem classificação. Dificuldade e comparações entre provas exigem dados validados.</p>';
  }
  function render(){
    if(!root)return;
    const d=data();
    if(!d){status('Aguardando o carregamento do catálogo. Nenhuma estatística estimada será exibida sem dados.');return;}
    state.exam=d.exam;state.area=d.area;state.ready=true;
    if(!d.exams.length){status('Nenhuma prova com questões indexadas disponíveis.');return;}
    const areaOptions=[option('','Todas as áreas',!d.area),...d.areas.map(a=>option(a.area,a.area,a.area===d.area))].join('');
    const tools='<div class="card cti-int-selectors"><label class="f">Exame<select id="ctiIntExame">'+d.exams.map(x=>option(x,x,x===d.exam)).join('')+'</select></label><label class="f">Área<select id="ctiIntArea">'+areaOptions+'</select></label></div>';
    const kpis='<div class="cti-int-kpis">'+[
      ['Questões indexadas',num(d.total)],['Edições representadas',num(d.editions.length)],
      ['Temas no filtro',num(d.themes.length)],['Cobertura pessoal',num(d.completed)+' / '+num(d.totalScope)]
    ].map(([label,value])=>'<div class="cti-int-kpi"><span class="small muted">'+label+'</span><strong>'+escape(value)+'</strong></div>').join('')+'</div>';
    root.innerHTML=tools+kpis+renderTabs()+(state.tab==='estrategia'?strategy(d):state.tab==='historico'?historical(d):state.tab==='tipos'?classifications(d):changes(d))+note();
    $('#ctiIntExame').onchange=e=>{state.exam=e.target.value;state.area='';render();};
    $('#ctiIntArea').onchange=e=>{state.area=e.target.value;render();};
    root.querySelectorAll('[data-int-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.intTab;render();});
    root.querySelectorAll('[data-int-action]').forEach(b=>b.onclick=()=>{
      const i=Number(b.dataset.intAction),t=d.themes[i];if(!t)return;
      if(b.dataset.intType==='train'){
        if(typeof window.treinarArea==='function')window.treinarArea(t.area,t.theme);
      } else if(b.dataset.intType==='review'){
        if(typeof window.abrirReforco==='function')window.abrirReforco(t.theme,t.area);
      }else if(b.dataset.intType==='cera'){
        if(typeof window.CTI_CERA?.selectTopic==='function')window.CTI_CERA.selectTopic(t.area,t.theme);
        else window.CTI_CERA?.open?.();
      }
    });
  }
  function strategy(d){
    if(!d.themes.length)return '<div class="card"><p>Não há temas disponíveis para este filtro.</p></div>';
    const rows=d.themes.slice(0,15);
    const insufficient=rows.filter(t=>t.uniqueDone<5).length;
    return '<div class="card cti-int-summary"><h3>Prioridades de aprendizagem</h3><p class="small muted">Cruza frequência relativa, sua última resposta por questão distinta e lacunas de cobertura. A pontuação é uma <b>heurística de estudo, não uma previsão da banca</b>.</p>'+
      '<p class="small muted">'+insufficient+' dos '+rows.length+' temas prioritários ainda têm menos de cinco questões distintas respondidas, exigindo diagnóstico antes de conclusões sobre domínio.</p></div>'+
      '<div class="cti-int-list">'+rows.map(t=>{
        const idx=d.themes.indexOf(t);
        return '<article class="card cti-int-topic"><div class="cti-int-topic-head"><div><b>'+escape(t.theme)+'</b><div class="small muted">'+escape(t.area)+'</div></div><span class="pill">Prioridade '+t.score+'/100</span></div>'+
        '<div class="cti-int-topic-facts"><span>'+num(t.n)+' questões no acervo</span><span>'+t.editions+'/'+t.ofEditions+' edições</span><span>'+(t.accuracy===null?'Sem respostas':percent(t.accuracy)+' acertos')+' · '+t.uniqueDone+' distintas</span></div>'+
        '<p class="small muted">'+escape(t.next)+' · Evidência individual '+escape(t.confidence)+'</p>'+
        '<div class="row cti-int-actions"><button class="btn sm" type="button" data-int-type="train" data-int-action="'+idx+'">Treinar tema</button><button class="btn sec sm" type="button" data-int-type="review" data-int-action="'+idx+'">Revisar conteúdo</button><button class="btn sec sm" type="button" data-int-type="cera" data-int-action="'+idx+'">Método CERA</button></div></article>';
      }).join('')+'</div>';
  }
  function historical(d){
    return '<div class="card"><h3>Distribuição por especialidade</h3><p class="small muted">Proporção sobre '+num(d.total)+' questões elegíveis. Reflete o acervo indexado, que pode não conter todas as edições completas.</p>'+
      (d.areas.length?d.areas.map(a=>bar(a.area,a.pct,num(a.n)+' questões · '+a.editions+' edição(ões)')).join(''):'<p>Sem dados.</p>')+'</div>'+
      '<div class="card"><h3>Recorrência dos temas</h3><p class="small muted">Contagem observada por edição, não probabilidade da próxima prova.</p>'+
      (d.themes.length?'<div class="cti-int-table-wrap"><table><thead><tr><th>Tema</th><th>Questões</th><th>Edições</th><th>Proporção</th></tr></thead><tbody>'+
        d.themes.slice().sort((a,b)=>b.n-a.n).slice(0,25).map(t=>'<tr><td><b>'+escape(t.theme)+'</b><div class="small muted">'+escape(t.area)+'</div></td><td>'+num(t.n)+'</td><td>'+t.editions+'/'+t.ofEditions+'</td><td>'+percent(t.pct)+'</td></tr>').join('')+'</tbody></table></div>':'<p>Sem temas no filtro.</p>')+'</div>';
  }
  function classifications(d){
    const t=d.taxonomy||{types:[],classified:0,undetermined:d.totalScope,total:d.totalScope,coveragePct:0};
    const sufficient=t.total>=30&&t.classified>=20&&t.coveragePct>=60;
    return '<div class="card"><h3>Como a banca cobra — triagem textual</h3>'+
      '<p class="small muted">Classificação automática baseada em expressões da pergunta. Não é avaliação clínica humana nem rótulo oficial da banca. Ausência de rótulo não significa ausência de conteúdo.</p>'+
      '<div class="cti-int-kpis"><div class="cti-int-kpi"><span class="small muted">Classificadas provisoriamente</span><strong>'+num(t.classified)+'/'+num(t.total)+'</strong></div>'+
      '<div class="cti-int-kpi"><span class="small muted">Sem classificação</span><strong>'+num(t.undetermined)+'</strong></div>'+
      '<div class="cti-int-kpi"><span class="small muted">Cobertura da triagem</span><strong>'+percent(t.coveragePct)+'</strong></div>'+
      '<div class="cti-int-kpi"><span class="small muted">Confiabilidade para orientar estudo</span><strong>Não validada</strong></div></div>'+
      (!sufficient?'<p class="small muted"><b>Leitura restrita:</b> a cobertura textual é insuficiente para interpretar a distribuição como perfil de cobrança da prova.</p>':'<p class="small muted"><b>Leitura exploratória:</b> a cobertura é suficiente para mostrar a distribuição dos rótulos provisórios, mas exige revisão humana para orientar prioridades individuais.</p>')+
      (sufficient&&t.types.length?t.types.map(x=>bar(x.label,x.pctClassified,num(x.n)+' rótulos · '+percent(x.pctTotal)+' do acervo analisado')).join(''):!sufficient?'<p class="small muted">Distribuição ocultada para evitar interpretação indevida de uma amostra de baixa cobertura.</p>':'<p class="small muted">Não há rótulos definidos neste filtro.</p>')+
      '<p class="small muted">Os percentuais das barras são calculados sobre as questões classificadas, não sobre todas as questões. Nenhum desses rótulos altera o cálculo de prioridade, o CERA ou os simulados.</p></div>';
  }
  function changes(d){
    const enough=d.recentEditions.length>=2&&d.olderEditions.length>=2&&d.recentTotal>=20&&d.olderTotal>=20;
    return '<div class="card"><h3>Questões disponíveis por edição</h3><p class="small muted">A variação no acervo não implica mudança na prova. Utilize apenas edições completas e comparáveis para interpretação de tendências.</p>'+
      (d.editionRows.length?d.editionRows.map(ed=>bar(ed.edition,d.total?100*ed.n/d.total:0,num(ed.n)+' questões')).join(''):'<p>Sem edições.</p>')+'</div>'+
      '<div class="card"><h3>Variação descritiva dos temas</h3>'+
      (!enough?'<p class="small muted">Comparação indisponível: são necessárias pelo menos duas edições recentes, duas anteriores e vinte questões em cada período.</p>':
        '<p class="small muted">Edições recentes: '+escape(d.recentEditions.join(', '))+' ('+num(d.recentTotal)+' questões). Anteriores: '+escape(d.olderEditions.join(', '))+' ('+num(d.olderTotal)+' questões). Diferenças calculadas pela participação no acervo de cada período, sem teste de significância.</p>'+
        (d.changes.length?'<div class="cti-int-table-wrap"><table><thead><tr><th>Tema</th><th>Recentes</th><th>Anteriores</th><th>Diferença</th></tr></thead><tbody>'+d.changes.map(t=>
          '<tr><td>'+escape(t.theme)+'</td><td>'+percent(t.recentRate)+' ('+t.newN+')</td><td>'+percent(t.olderRate)+' ('+t.oldN+')</td><td>'+ (t.delta>0?'+':'')+percent(t.delta)+' p.p.</td></tr>').join('')+'</tbody></table></div>':'<p class="small muted">Sem diferenças relevantes para os critérios descritivos selecionados.</p>'))+'</div>';
  }
  window.CTI_INTELIGENCIA={refresh:render,open:()=>{if(typeof mostrar==='function')mostrar('inteligencia');},status:()=>({ready:state.ready,exam:state.exam,area:state.area})};
  if(root)render();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('#view-inteligencia')?.classList.contains('on'))render();});
})();
