/* CTI | Inteligência de Provas — análise descritiva do acervo, sem IA e sem previsão. */
(function(root){
  'use strict';
  function txt(v){return String(v == null ? '' : v).trim();}
  function eligible(q){return q && q.valida !== false && !q.dup && txt(q.exame) && txt(q.edicao) && txt(q.area || q.especialidade) && txt(q.tema);}
  function rate(n,d){return d > 0 ? 100 * n / d : 0;}
  function key(area,theme){return JSON.stringify([area,theme]);}
  function sortEditions(a,b){return a.localeCompare(b,'pt-BR',{numeric:true});}
  function analyze(index,history,exam,areaFilter){
    const all=Array.isArray(index)?index.filter(eligible):[];
    const exams=Array.from(new Set(all.map(q=>txt(q.exame)))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const selected=exams.includes(exam)?exam:(exams[0]||'');
    const base=all.filter(q=>txt(q.exame)===selected);
    const editions=Array.from(new Set(base.map(q=>txt(q.edicao)))).sort(sortEditions);
    const editionTotals=new Map(), byArea=new Map(), byTheme=new Map(), byId=new Map();
    for(const q of base){
      const ed=txt(q.edicao),area=txt(q.area||q.especialidade),theme=txt(q.tema),id=String(q.id);
      editionTotals.set(ed,(editionTotals.get(ed)||0)+1);
      const a=byArea.get(area)||{area,n:0,editions:new Set()};
      a.n++;a.editions.add(ed);byArea.set(area,a);
      const k=key(area,theme),t=byTheme.get(k)||{key:k,area,theme,n:0,editions:new Set(),editionCounts:new Map(),uniqueDone:0,correct:0,attempts:0};
      t.n++;t.editions.add(ed);t.editionCounts.set(ed,(t.editionCounts.get(ed)||0)+1);byTheme.set(k,t);
      byId.set(id,k);
    }
    const latestById=new Map(),attemptsByTheme=new Map();
    for(const h of Array.isArray(history)?history:[]){
      if(!h || h.id == null)continue;
      const id=String(h.id),k=byId.get(id);
      if(!k)continue;
      attemptsByTheme.set(k,(attemptsByTheme.get(k)||0)+1);
      // Em vez de contar a repetição da mesma questão como amostras independentes,
      // a última tentativa prevalece, em ordem cronológica quando disponível.
      const ts=Number(h.ts)||0, old=latestById.get(id);
      if(!old||ts>=old.ts)latestById.set(id,{correct:h.acertou===true,ts});
    }
    for(const [id,last] of latestById){
      const t=byTheme.get(byId.get(id));if(!t)continue;
      t.uniqueDone++;if(last.correct)t.correct++;
    }
    for(const [k,n] of attemptsByTheme){const t=byTheme.get(k);if(t)t.attempts=n;}
    const competenceCounts=new Map();
    for(const q of base){
      const label=txt(q.cobranca);
      if(!label||label==='Não classificada')continue;
      const old=competenceCounts.get(label)||{label,total:0,done:0,correct:0};
      old.total++;
      const answer=latestById.get(String(q.id));
      if(answer){old.done++;if(answer.correct)old.correct++;}
      competenceCounts.set(label,old);
    }
    // Comparação descritiva entre acervos, sem extrapolar para provas futuras.
    const examProfiles=new Map();
    for(const q of all){
      const ex=txt(q.exame),p=examProfiles.get(ex)||{exam:ex,n:0,areas:new Map(),themes:new Set(),editions:new Set()};
      p.n++;const area=txt(q.area||q.especialidade);
      p.areas.set(area,(p.areas.get(area)||0)+1);
      p.themes.add(key(area,txt(q.tema)));p.editions.add(txt(q.edicao));
      examProfiles.set(ex,p);
    }
    const currentProfile=examProfiles.get(selected);
    const comparisons=[...examProfiles.values()].filter(p=>p.exam!==selected&&currentProfile).map(p=>{
      const shared=[...currentProfile.themes].filter(k=>p.themes.has(k)).length;
      const union=new Set([...currentProfile.themes,...p.themes]).size;
      const themeOverlap=rate(shared,union);
      const categories=new Set([...currentProfile.areas.keys(),...p.areas.keys()]);
      const areaSimilarity=100-0.5*[...categories].reduce((sum,k)=>sum+Math.abs(rate(currentProfile.areas.get(k)||0,currentProfile.n)-rate(p.areas.get(k)||0,p.n)),0);
      return {exam:p.exam,score:Math.round(.6*areaSimilarity+.4*themeOverlap),
        areaSimilarity:Math.round(areaSimilarity),themeOverlap:Math.round(themeOverlap),
        sharedThemes:shared,comparableThemes:union,questions:p.n,editions:p.editions.size};
    }).sort((a,b)=>b.score-a.score||a.exam.localeCompare(b.exam,'pt-BR'));
    const areas=[...byArea.values()].map(a=>({area:a.area,n:a.n,pct:rate(a.n,base.length),editions:a.editions.size})).sort((a,b)=>b.n-a.n||a.area.localeCompare(b.area,'pt-BR'));
    const selectedArea=byArea.has(areaFilter)?areaFilter:'';
    const classificationCounts=new Map();
    let classified=0,undetermined=0;
    for(const q of base){
      if(selectedArea&&txt(q.area||q.especialidade)!==selectedArea)continue;
      const label=txt(q.cobranca);
      if(!label||label==='Não classificada'){undetermined++;continue;}
      classified++;classificationCounts.set(label,(classificationCounts.get(label)||0)+1);
    }
    const collectionCount=classified+undetermined;
    const collectionCoverage=rate(classified,collectionCount);
    const types=[...classificationCounts].map(([label,n])=>({label,n,pctClassified:rate(n,classified),pctTotal:rate(n,collectionCount)}))
      .sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label,'pt-BR'));
    const competencies=[...competenceCounts.values()].map(c=>({...c,accuracy:c.done?rate(c.correct,c.done):null,
      difficulty:c.done>=5?(c.correct/c.done<0.5?'Maior dificuldade':c.correct/c.done<0.7?'Reforçar':'Consolidar'):'Explorar',
      evidence:c.done>=5?'histórico individual':'poucas respostas'}))
      .filter(c=>!selectedArea||base.some(q=>txt(q.area||q.especialidade)===selectedArea&&txt(q.cobranca)===c.label))
      .sort((a,b)=>(a.done>=5&&a.accuracy<70?0:1)-(b.done>=5&&b.accuracy<70?0:1)||b.total-a.total);
    const subjects=[...byTheme.values()].filter(t=>!selectedArea||t.area===selectedArea);
    const maxN=Math.max(1,...subjects.map(t=>t.n));
    const themes=subjects.map(t=>{
      const n=t.uniqueDone,accuracy=n?rate(t.correct,n):null;
      const coverage=Math.min(1,n/Math.max(1,Math.min(t.n,10)));
      const frequency=t.n/maxN;
      // Prioridade é heurística do CTI, NÃO probabilidade de cobrança.
      // Com amostra individual pequena, usa risco neutro e pede diagnóstico.
      const deficit=n>=5?1-accuracy/100:0.5;
      const score=Math.round(100*(0.40*frequency+0.35*deficit+0.25*(1-coverage)));
      const difficulty=n>=5?(accuracy<50?'Alta dificuldade individual':accuracy<70?'Dificuldade moderada':'Bom domínio observado'):'Ainda não avaliada';
      return {area:t.area,theme:t.theme,n:t.n,pct:rate(t.n,base.length),difficulty,
        editions:t.editions.size,ofEditions:editions.length,uniqueDone:n,correct:t.correct,
        attempts:t.attempts,accuracy,score,confidence:n>=15?'mais ampla':n>=5?'intermediária':'limitada',
        next:n<5?'Fazer diagnóstico do tema':accuracy<70?'Reforçar decisões e revisar erros':'Consolidar com questões variadas',
        editionCounts:Object.fromEntries(t.editionCounts)};
    }).sort((a,b)=>b.score-a.score||b.n-a.n||a.theme.localeCompare(b.theme,'pt-BR'));
    const recent=editions.slice(-3),older=editions.slice(0,-3);
    const recentTotal=recent.reduce((n,ed)=>n+(editionTotals.get(ed)||0),0);
    const olderTotal=older.reduce((n,ed)=>n+(editionTotals.get(ed)||0),0);
    let changes=[];
    if(recent.length>=2&&older.length>=2&&recentTotal>=20&&olderTotal>=20){
      changes=themes.map(t=>{
        const tr=byTheme.get(key(t.area,t.theme));
        const newN=recent.reduce((n,ed)=>n+(tr.editionCounts.get(ed)||0),0);
        const oldN=older.reduce((n,ed)=>n+(tr.editionCounts.get(ed)||0),0);
        return {area:t.area,theme:t.theme,newN,oldN,
          recentRate:rate(newN,recentTotal),olderRate:rate(oldN,olderTotal),
          delta:rate(newN,recentTotal)-rate(oldN,olderTotal)};
      }).filter(x=>Math.abs(x.delta)>=1&&x.newN+x.oldN>=3).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,12);
    }
    const completed=[...latestById].filter(([id])=>!selectedArea||byTheme.get(byId.get(id))?.area===selectedArea).length;
    const totalForArea=selectedArea?(byArea.get(selectedArea)?.n||0):base.length;
    return {exam:selected,exams,editions,areas,area:selectedArea,total:base.length,totalScope:totalForArea,
      completed,coveragePct:rate(completed,totalForArea),themes,changes,
      recentEditions:recent,olderEditions:older,recentTotal,olderTotal,
      editionRows:editions.map(ed=>({edition:ed,n:editionTotals.get(ed)||0})),
      taxonomy:{types,classified,undetermined,total:collectionCount,coveragePct:collectionCoverage,provisional:true,competencies},
      comparisons,
      method:'Frequência é observada no acervo, não uma previsão; prioridade CTI = 40% relevância relativa + 35% dificuldade individual (neutra com menos de cinco questões distintas) + 25% lacuna de cobertura.'};
  }
  const api={analyze,eligible,rate};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CTI_EXAM_ANALYTICS=api;
})(typeof window!=='undefined'?window:null);
