'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const core=require('../static/inteligencia-core.js');
const items=[
 {id:1,exame:'Revalida INEP',edicao:'2025',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Tratamento e conduta'},
 {id:2,exame:'Revalida INEP',edicao:'2025',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Diagnóstico'},
 {id:3,exame:'Revalida INEP',edicao:'2025',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Não classificada'},
 {id:4,exame:'Revalida INEP',edicao:'2026',area:'Cirurgia',tema:'Trauma',valida:true,dup:null,cobranca:'Diagnóstico'},
 {id:5,exame:'CONAREM',edicao:'2026',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Não classificada'},
 {id:6,exame:'Revalida INEP',edicao:'2026',area:'Cirurgia',tema:'Trauma',valida:false,dup:null,cobranca:'Diagnóstico'}
];
const d=core.analyze(items,[],'Revalida INEP','');
assert.deepEqual([d.taxonomy.total,d.taxonomy.classified,d.taxonomy.undetermined],[4,3,1]);
const types=Object.fromEntries(d.taxonomy.types.map(x=>[x.label,x]));
assert.equal(types['Diagnóstico'].n,2);
assert.equal(types['Tratamento e conduta'].n,1);
assert.equal(Math.round(types['Diagnóstico'].pctClassified),67);
assert.equal(Math.round(types['Diagnóstico'].pctTotal),50);
const cl=core.analyze(items,[],'Revalida INEP','Clínica');
assert.equal(cl.taxonomy.total,3);
assert.equal(cl.taxonomy.undetermined,1);
assert.equal(cl.taxonomy.classified,2);
const co=core.analyze(items,[],'CONAREM','');
assert.equal(co.taxonomy.classified,0);
assert.equal(co.taxonomy.undetermined,1);
assert.equal(co.taxonomy.types.length,0);
const source=fs.readFileSync('static/inteligencia.js','utf8');
assert.ok(source.includes("['tipos','Como a banca cobra']"));
assert.ok(source.includes('Natureza dos rótulos'));
assert.ok(source.includes('Não há itens classificados neste filtro.'));
assert.ok(source.includes('sufficient&&t.types.length'));
assert.ok(source.includes('os rótulos não alteram gabaritos nem notas'));
const cmp=d.comparisons.find(x=>x.exam==='CONAREM');
assert.ok(cmp,'comparação com CONAREM deve existir');
assert.ok(cmp.score>=0&&cmp.score<=100);
assert.ok(cmp.themeOverlap>=0&&cmp.themeOverlap<=100);
assert.ok(source.includes("['comparar','Comparar provas']"));
assert.ok(source.includes("function comparisons(d)"));
const hist=[];
for(let n=1;n<=5;n++)hist.push({id:n,acertou:n===1,ts:n});
const extended=items.slice(0,4);
extended.push(
 {id:7,exame:'Revalida INEP',edicao:'2026',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Tratamento e conduta'},
 {id:8,exame:'Revalida INEP',edicao:'2026',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Tratamento e conduta'},
 {id:9,exame:'Revalida INEP',edicao:'2026',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Tratamento e conduta'},
 {id:10,exame:'Revalida INEP',edicao:'2026',area:'Clínica',tema:'Diabetes',valida:true,dup:null,cobranca:'Tratamento e conduta'}
);
const extendedHist=[{id:1,acertou:false,ts:1},{id:2,acertou:true,ts:2},{id:7,acertou:false,ts:3},{id:8,acertou:false,ts:4},{id:9,acertou:false,ts:5},{id:10,acertou:false,ts:6}];
const e=core.analyze(extended,extendedHist,'Revalida INEP','Clínica');
const tr=e.themes.find(t=>t.theme==='Diabetes');
assert.ok(tr.weakCompetence==='Tratamento e conduta');
assert.ok(tr.next.includes('tratamento e conduta'));
assert.equal(tr.difficulty,'Alta dificuldade individual');
const treatment=e.taxonomy.competencies.find(x=>x.label==='Tratamento e conduta');
assert.equal(treatment.done,5);
assert.equal(treatment.correct,0);
assert.equal(treatment.difficulty,'Maior dificuldade');
const indexMain=fs.readFileSync('main.py','utf8');
assert.ok(indexMain.includes('\"cobranca\": TIPOS_COBRANCA.get'));
console.log('PASS taxonomy distribution, unknown denominator, area/exam isolation, visible limitations');
