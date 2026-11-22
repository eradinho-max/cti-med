'use strict';
/* Auditoria de catálogo real: não grava dados e não depende de login/Neon. */
const assert=require('node:assert/strict');
const raw=require('../banco_completo_questoes_revalida_e_enamed.json');
const {analyze,eligible}=require('../static/inteligencia-core.js');
assert.ok(Array.isArray(raw)&&raw.length>0,'catálogo não carregado');
const idx=raw.map(q=>({
 id:q.id,exame:q.exame,edicao:q.edicao,numero:q.numero,
 area:q.especialidade,tema:q.tema,
 valida:q.qualidade==='ok'&&q.gabarito_oficial!=='ANULADA',
 dup:q.duplicata_de||null,img:!!q.tem_imagem
}));
const good=idx.filter(eligible),examNames=[...new Set(good.map(q=>q.exame))];
const reports=[];
for(const exam of examNames){
 const d=analyze(idx,[],exam,'');
 const filtered=good.filter(q=>q.exame===exam);
 assert.equal(d.total,filtered.length,'quantidade da prova '+exam);
 assert.equal(d.areas.reduce((sum,a)=>sum+a.n,0),d.total,'áreas '+exam);
 assert.equal(d.themes.reduce((sum,t)=>sum+t.n,0),d.total,'temas '+exam);
 assert.equal(d.editionRows.reduce((sum,t)=>sum+t.n,0),d.total,'edições '+exam);
 assert.equal(d.completed,0,'sem histórico não pode inventar desempenho');
 assert.equal(d.changes.length>0,d.recentEditions.length>=2&&d.olderEditions.length>=2&&d.recentTotal>=20&&d.olderTotal>=20&&d.changes.length>0);
 for(const t of d.themes){
  assert.ok(t.editions>=1&&t.editions<=d.editions.length);
  assert.ok(t.score>=0&&t.score<=100);
  assert.equal(t.uniqueDone,0);
  assert.equal(Object.values(t.editionCounts).reduce((a,b)=>a+b,0),t.n);
  assert.ok(filtered.some(q=>q.area===t.area&&q.tema===t.theme),'tema precisa existir '+exam+':'+t.theme);
 }
 const mostCommon=d.themes.slice().sort((a,b)=>b.n-a.n)[0];
 if(mostCommon){
  const question=filtered.find(q=>q.area===mostCommon.area&&q.tema===mostCommon.theme);
  const correctHistory=[{id:question.id,exame:exam,area:question.area,tema:question.tema,acertou:true,ts:100}];
  const d2=analyze(idx,correctHistory,exam,'');
  const t2=d2.themes.find(t=>t.area===mostCommon.area&&t.theme===mostCommon.theme);
  assert.equal(t2.uniqueDone,1,'correlação do histórico por ID '+exam);
  assert.equal(t2.correct,1);
  assert.equal(d2.completed,1);
 }
 reports.push({exam,questions:d.total,editions:d.editions.length,areas:d.areas.length,themes:d.themes.length,trendPairs:d.changes.length});
}
assert.equal(reports.reduce((sum,d)=>sum+d.questions,0),good.length);
assert.ok(reports.length>=1);
console.log('REAL_CATALOG_AUDIT '+JSON.stringify({raw:raw.length,indexed:idx.length,eligible:good.length,exams:reports}));
