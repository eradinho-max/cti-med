'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const m=require('../static/inteligencia-core.js');
function q(id,exame,edicao,area,tema,more={}){
  return {id,exame,edicao,area,tema,valida:true,dup:null,...more};
}
const rows=[
  q(1,'REVALIDA','2023','Clínica','Diabetes'),
  q(2,'REVALIDA','2023','Clínica','Diabetes'),
  q(3,'REVALIDA','2024','Clínica','Diabetes'),
  q(4,'REVALIDA','2024','Cirurgia','Trauma'),
  q(5,'REVALIDA','2025','Clínica','Diabetes'),
  q(6,'REVALIDA','2025','Cirurgia','Trauma'),
  q(7,'REVALIDA','2026','Clínica','Diabetes'),
  q(8,'REVALIDA','2026','Clínica','Diabetes'),
  q(9,'CONAREM','2025','Clínica','Diabetes'),
  q(10,'USMLE Step 2 CK','2025','Clínica','Diabetes'),
  q(11,'REVALIDA','2026','Clínica','Diabetes',{dup:7}),
  q(12,'REVALIDA','2026','Clínica','Diabetes',{valida:false})
];
let d=m.analyze(rows,[{id:1,acertou:false,ts:1},{id:1,acertou:true,ts:2},{id:2,acertou:false,ts:3},{id:9,acertou:false,ts:5}], 'REVALIDA','');
assert.equal(d.total,8,'exclude invalid/duplicate questions');
assert.equal(d.editions.length,4);
assert.equal(d.areas.find(a=>a.area==='Clínica').n,6);
const diabetes=d.themes.find(x=>x.theme==='Diabetes');
assert.equal(diabetes.n,6);
assert.equal(diabetes.editions,4);
assert.equal(diabetes.uniqueDone,2,'repeated attempts count only last outcome per question');
assert.equal(diabetes.correct,1);
assert.equal(diabetes.accuracy,50);
assert.equal(diabetes.attempts,3);
assert.equal(diabetes.confidence,'limitada');
assert.equal(diabetes.next,'Fazer diagnóstico do tema');
assert.equal(d.completed,2);
assert.equal(d.changes.length,0,'small windows must not create trends');
assert.equal(d.areas.reduce((s,x)=>s+x.pct,0),100);
const trauma=m.analyze(rows,[],'REVALIDA','Cirurgia');
assert.equal(trauma.area,'Cirurgia');assert.equal(trauma.total,8);assert.equal(trauma.totalScope,2);
assert.equal(trauma.themes.length,1);assert.equal(trauma.themes[0].theme,'Trauma');
const conarem=m.analyze(rows,[{id:1,acertou:false}], 'CONAREM','');
assert.equal(conarem.total,1);assert.equal(conarem.completed,0,'isolate exams');
const usmle=m.analyze(rows,[],'USMLE Step 2 CK','');
assert.equal(usmle.total,1);
assert.deepEqual(m.analyze([],[],'REVALIDA','').editions,[]);
const historical=[];
for(const [ed,countD,countT] of [['2021',3,7],['2022',4,6],['2023',4,6],['2024',6,4],['2025',8,2],['2026',9,1]]){
  for(let i=0;i<countD;i++)historical.push(q('d-'+ed+'-'+i,'REVALIDA',ed,'Clínica','Diabetes'));
  for(let i=0;i<countT;i++)historical.push(q('t-'+ed+'-'+i,'REVALIDA',ed,'Cirurgia','Trauma'));
}
d=m.analyze(historical,[],'REVALIDA','');
assert.equal(d.editions.length,6);
assert.ok(d.changes.find(x=>x.theme==='Diabetes'&&x.delta>0));
assert.ok(d.changes.find(x=>x.theme==='Trauma'&&x.delta<0));
assert.equal(d.recentTotal,30);assert.equal(d.olderTotal,30);
for(const t of d.themes)assert.ok(t.score>=0&&t.score<=100);
const html=fs.readFileSync('static/index.html','utf8');
const app=fs.readFileSync('static/cti-app-v31.js','utf8');
const loader=fs.readFileSync('static/app.js','utf8');
const ui=fs.readFileSync('static/inteligencia.js','utf8');
assert.ok(html.includes('id="view-inteligencia"'));
assert.ok(html.includes('data-v="inteligencia"'));
assert.ok(html.includes('data-go="inteligencia"'));
assert.ok(app.includes("'inteligencia'")&&app.includes("CTI_INTELIGENCIA?.refresh"));
assert.ok(loader.includes('/static/inteligencia-core.js')&&loader.includes('/static/inteligencia.js'));
assert.ok(ui.includes('window.CTI_CERA.selectTopic')&&ui.includes('window.treinarArea'));
assert.ok(!ui.includes('fetch(')&&!ui.includes('localStorage.setItem'));
console.log('PASS exam analytics: edition denominators, area, recurrence, personal evidence, independent routes, no database writes');
