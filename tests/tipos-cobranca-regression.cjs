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
assert.ok(source.includes('Não validada'));
assert.ok(source.includes('Nenhum desses rótulos altera'));
const indexMain=fs.readFileSync('main.py','utf8');
assert.ok(indexMain.includes('\"cobranca\": TIPOS_COBRANCA.get'));
console.log('PASS taxonomy distribution, unknown denominator, area/exam isolation, visible limitations');
