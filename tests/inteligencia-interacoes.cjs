'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {analyze}=require('../static/inteligencia-core.js');
const index=[
 {id:1,exame:'Revalida INEP',edicao:'2024',area:'Clínica Médica',tema:'Diabetes',valida:true,dup:null},
 {id:2,exame:'Revalida INEP',edicao:'2025',area:'Cirurgia Geral',tema:'Trauma',valida:true,dup:null},
 {id:3,exame:'CONAREM',edicao:'2025',area:'Clínica Médica',tema:'Diabetes',valida:true,dup:null}
],hist=[{id:1,acertou:false,ts:2}];
const elements={};
const actions=[];
const actionButtons=['train','review','cera'].map(type=>({
  dataset:{intType:type,intAction:'0'},onclick:null
}));
const tabs=[{dataset:{intTab:'historico'},onclick:null}];
const root={
 innerHTML:'',querySelectorAll(selector){
  if(selector==='[data-int-action]')return actionButtons;
  if(selector==='[data-int-tab]')return tabs;
  return [];
 }};
elements['#ctiInteligenciaHub']=root;
elements['#ctiIntExame']={value:'',onchange:null};
elements['#ctiIntArea']={value:'',onchange:null};
elements['#view-inteligencia']={classList:{contains:()=>true}};
const document={querySelector:s=>elements[s]||null,addEventListener:()=>{},hidden:false};
const window={
 CTI_EXAM_ANALYTICS:{analyze},
 treinarArea:(...a)=>actions.push(['train',...a]),
 abrirReforco:(...a)=>actions.push(['review',...a]),
 CTI_CERA:{selectTopic:(...a)=>{actions.push(['cera',...a]);return true;}}
};
const sandbox={document,window,INDICE:index,HIST:hist,console,mostrar:()=>{}};
vm.runInNewContext(fs.readFileSync('static/inteligencia.js','utf8'),sandbox,{filename:'inteligencia.js'});
window.CTI_INTELIGENCIA.refresh();
assert.ok(root.innerHTML.includes('Revalida INEP'));
assert.ok(root.innerHTML.includes('CONAREM'));
assert.ok(root.innerHTML.includes('Minha estratégia'));
assert.ok(root.innerHTML.includes('Diabetes'));
const top=analyze(index,hist,'CONAREM','').themes[0];
assert.equal(top.theme,'Diabetes');
elements['#ctiIntExame'].onchange({target:{value:'CONAREM'}});
assert.equal(window.CTI_INTELIGENCIA.status().exam,'CONAREM','exam selector must change analysis');
assert.equal(window.CTI_INTELIGENCIA.status().area,'');
for(const button of actionButtons)button.onclick();
assert.deepEqual(actions,[
 ['train','Clínica Médica','Diabetes'],
 ['review','Diabetes','Clínica Médica'],
 ['cera','Clínica Médica','Diabetes']
],'CTI existing modules must receive exact matched topic and area');
elements['#ctiIntArea'].onchange({target:{value:'Clínica Médica'}});
assert.equal(window.CTI_INTELIGENCIA.status().area,'Clínica Médica');
tabs[0].onclick();
assert.ok(root.innerHTML.includes('Recorrência dos temas'));
assert.ok(root.innerHTML.includes('Clínica Médica'));
console.log('PASS UI filters and action handlers: training, review, CERA, exact catalog coordinates');
