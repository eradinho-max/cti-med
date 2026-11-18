'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('static/cti-app-v31.js','utf8');
const ctx=vm.createContext({});
const core=src.slice(src.indexOf('const SIM_SEG_POR_QUESTAO'),src.indexOf('function simMedida'));
vm.runInContext(core,ctx);
const result=vm.runInContext(`(()=>{
 const s={tempos:{},tempoAtivo:null,tempoInicio:0,tempoPorQuestaoSec:120,questoes:[{id:1},{id:2},{id:3}],respostas:{1:{sel:'A',acertou:true},2:{sel:'B',acertou:false},3:{sel:null,acertou:false}}};
 simTempoAtivo(s,1,1000);simTempoAtivo(s,1,11000);simTempoAtivo(s,2,61000);
 simTempoAtivo(s,null,201000);simTempoAtivo(s,1,301000);simTempoAtivo(s,null,331000);
 return {a:simTempoEscolhido(90),b:simTempoEscolhido(-5),report:simRelatorio(s)};
})()`,ctx);
assert.equal(result.a,90);assert.equal(result.b,180);assert.equal(result.report.media,115);
assert.equal(result.report.mediaCertas,90);assert.equal(result.report.mediaErradas,140);
assert.equal(result.report.brancas,1);assert.equal(result.report.lentas[0].i,2);
assert.ok(src.includes("onclick = () => finalizarProva(false)"));
assert.ok(src.includes("sess._enviando=true"));
assert.ok(src.includes("Correção incompleta"));
console.log('PASS timing, revisits, hidden intervals, averages and submission guards');
