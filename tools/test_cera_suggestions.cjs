/* Regression: CERA thematic suggestion must advance on each click. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('static/cera.js','utf8');
const begin=src.indexOf('  function ranked(rows){');
const end=src.indexOf('  function selected(rows){',begin);
assert.ok(begin>=0&&end>begin,'CERA recommendation functions must exist');
const logic=src.slice(begin,end);
const context=vm.createContext({key:(area,theme)=>JSON.stringify([area,theme])});
vm.runInContext(logic+'\nthis.nextSuggestion=nextSuggestion;',context,{timeout:500});
const rows=[
 {area:'Clínica',theme:'Alta prioridade',count:20,attempts:5,accuracy:25},
 {area:'Clínica',theme:'Média prioridade',count:15,attempts:5,accuracy:60},
 {area:'Cirurgia',theme:'Baixa prioridade',count:8,attempts:5,accuracy:85}
];
const k=x=>JSON.stringify([x.area,x.theme]);
let current=k(rows[0]);
const seen=[];
for(let i=0;i<6;i++){
 const r=context.nextSuggestion(rows,current,{});
 assert.ok(r,'Must return a suggestion');
 assert.notEqual(k(r),current,'Must not repeat current recommendation when other themes exist');
 seen.push(r.theme);
 current=k(r);
}
assert.deepEqual(seen,[
 'Média prioridade','Baixa prioridade','Alta prioridade',
 'Média prioridade','Baixa prioridade','Alta prioridade'
]);
const study={[k(rows[0])]:{stage:'review'}};
const next=context.nextSuggestion(rows,k(rows[1]),study);
assert.equal(next.theme,'Baixa prioridade','Must skip initiated themes when enough unstarted exist');
const only=context.nextSuggestion([rows[0]],k(rows[0]),{});
assert.equal(only.theme,'Alta prioridade','Single theme must remain selectable');
console.log('CERA suggestion rotation OK');
