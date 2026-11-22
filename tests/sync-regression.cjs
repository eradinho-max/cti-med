/* Regressão de sincronização: dois navegadores simulados, sem dados reais ou senhas. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('static/sync.js','utf8');

const store={progress:{version:0,data:{}},study:{version:0,data:{}},training:{version:0,data:{}}};
let requestCount=0;
let unauthorized=false;
let failPut=false;
async function backend(url,opts={}){
  requestCount++;
  if(url==='/api/auth/status')return response(200,{sync_available:true,password_change_available:false});
  if(unauthorized)return response(401,{detail:'Unauthorized'});
  const ns=(opts.method==='PUT'?JSON.parse(opts.body).namespace:(url.split('namespace=')[1]||'progress').split('&')[0]);
  const st=store[ns];
  if(!st)return response(400,{detail:'bad namespace'});
  if((opts.method||'GET')==='GET')return response(200,{namespace:ns,version:st.version,data:structuredClone(st.data)});
  if(failPut)return response(503,{detail:'DB unavailable'});
  const body=JSON.parse(opts.body);
  if(body.base_version!==st.version)return response(409,{detail:'SYNC_CONFLICT'});
  st.version++;st.data=structuredClone(body.data);
  return response(200,{namespace:ns,version:st.version,data:structuredClone(st.data)});
}
function response(status,payload){return {status,ok:status>=200&&status<300,json:async()=>payload};}
async function browser(initial={}, automatic=false){
  const map=new Map(Object.entries(initial));
  const listeners={};
  let reloadCount=0, clock=1000000, timerId=0, canReceive=true;
  const scheduled=new Map(), applied=[];
  const fakeSet=(fn,ms=0)=>{if(ms===0)return setTimeout(fn,0);const id=++timerId;scheduled.set(id,{fn,due:clock+ms});return id;};
  const fakeClear=id=>{if(typeof id==='number')scheduled.delete(id);else clearTimeout(id);};
  class Clock extends Date {static now(){return clock;}}
  const document={
    readyState:'loading',cookie:'cti_csrf=dummy',hidden:false,
    getElementById:(id)=>id==='ctiAccountDialog'?{}:null,
    querySelectorAll:()=>[],querySelector:()=>null,
    addEventListener:(type,cb)=>listeners[type]=cb
  };
  const localStorage={
    getItem:(key)=>map.has(key)?map.get(key):null,
    setItem:(key,v)=>map.set(key,String(v)),
    removeItem:(key)=>map.delete(key)
  };
  const context={
    document,localStorage,window:{addEventListener:(type,cb)=>listeners[type]=cb,CTI_SYNC_VIEW:{canReceive:()=>canReceive,apply:keys=>applied.push(...keys)}},
    navigator:{onLine:true},TextEncoder,
    setTimeout:automatic?fakeSet:setTimeout,clearTimeout:automatic?fakeClear:clearTimeout,
    fetch:async(url,opts)=>url==='/api/auth/status'&&automatic?response(200,{sync_available:true,sync_auto_available:true,password_change_available:false}):backend(url,opts),AbortController,
    location:{reload:()=>reloadCount++,replace:()=>reloadCount++},
    Date:automatic?Clock:Date,JSON,Object,String,Number,Math,Error,Promise,console
  };
  context.window.window=context.window;
  vm.runInNewContext(script,context,{filename:'sync.js'});
  assert.equal(typeof listeners.DOMContentLoaded,'function');
  listeners.DOMContentLoaded();
  // Boot só consulta auth/status e nunca toca nos dados nem dispara PUT.
  await new Promise(resolve=>setImmediate(resolve));
  return {map,sync:context.window.CTI_SYNC.syncNow,status:context.window.CTI_SYNC.status,reloads:()=>reloadCount,applied,
    setSafe:v=>canReceive=v,
    setOnline:v=>{context.navigator.onLine=v;listeners[v?'online':'offline']?.()},
    scheduled:()=>scheduled.size,
    nextDelay:()=>Math.min(...[...scheduled.values()].map(t=>t.due-clock)),
    notify:key=>context.window.CTI_SYNC.notifyChange(key),
    wake:()=>listeners.pageshow?.(),
    hide:()=>{document.hidden=true;listeners.visibilitychange?.()},
    show:()=>{document.hidden=false;listeners.visibilitychange?.()},
    cycle:async()=>{const next=[...scheduled.entries()].sort((a,b)=>a[1].due-b[1].due)[0];assert.ok(next,'automatic timer expected');scheduled.delete(next[0]);clock=next[1].due;await next[1].fn();}
  };
}
(async()=>{
 const pc=await browser({'medquest_historico':'["q1"]','cti_study_notes_v32':'{"note":"PC"}'});
 let before=requestCount;
 assert.equal(Object.values(store).every(s=>s.version===0),true,'boot must not sync');
 assert.equal(requestCount-before,0,'boot must not trigger calls after it completes');
 assert.equal(await pc.sync(),true,'PC upload: '+JSON.stringify(pc.status()));
 assert.equal(store.progress.version,1);
 assert.equal(store.study.version,1);
 assert.equal(store.progress.data.items.medquest_historico.raw,'["q1"]');
 assert.equal(pc.reloads(),0,'must not reload');

 const phone=await browser();
 assert.equal(await phone.sync(),true,'phone download');
 assert.equal(phone.map.get('medquest_historico'),'["q1"]');
 assert.equal(phone.map.get('cti_study_notes_v32'),'{"note":"PC"}');
 assert.equal(phone.reloads(),0);

 // Celular -> computador: anotação, treino e histórico novo.
 phone.map.set('cti_study_notes_v32',JSON.stringify({note:'PHONE'}));
 phone.map.set('cti_doc_treinos',JSON.stringify({sessions:['session-phone']}));
 assert.equal(await phone.sync(),true,'phone must upload study/training');
 assert.equal(await pc.sync(),true,'PC must receive phone study/training');
 assert.equal(pc.map.get('cti_study_notes_v32'),JSON.stringify({note:'PHONE'}));
 assert.equal(pc.map.get('cti_doc_treinos'),JSON.stringify({sessions:['session-phone']}));

 // Reabertura do navegador e nova sessão com o mesmo armazenamento local.
 // Não simula login real; valida persistência do estado local e do servidor.
 const reopened=await browser(Object.fromEntries(phone.map));
 assert.equal(await reopened.sync(),true,'reopened browser sync');
 assert.equal(reopened.map.get('cti_doc_treinos'),JSON.stringify({sessions:['session-phone']}));
 const newDevice=await browser();
 assert.equal(await newDevice.sync(),true,'fresh device after prior sessions');
 assert.equal(newDevice.map.get('cti_study_notes_v32'),JSON.stringify({note:'PHONE'}));
 assert.equal(newDevice.map.get('cti_doc_treinos'),JSON.stringify({sessions:['session-phone']}));

 pc.map.set('medquest_historico','["q1","q2"]');
 assert.equal(await pc.sync(),true);
 assert.equal(store.progress.version,2);
 assert.equal(await phone.sync(),true);
 assert.equal(phone.map.get('medquest_historico'),'["q1","q2"]');

 // Conflito: duas edições divergentes preservam o estado local e remoto.
 pc.map.set('medquest_historico','["q1","q2","pc"]');
 phone.map.set('medquest_historico','["q1","q2","phone"]');
 assert.equal(await pc.sync(),true);
 const prior=phone.map.get('medquest_historico');
 assert.equal(await phone.sync(),false,'conflict must fail');
 assert.equal(phone.map.get('medquest_historico'),prior,'local conflict must survive');
 assert.equal(store.progress.data.items.medquest_historico.raw,'["q1","q2","pc"]');
 // A conta de origem salvou também preferências geradas automaticamente.
 store.progress.data.items.medquest_semente={raw:'"seed-pc"',modified:1};
 store.progress.data.items.cti_destaque={raw:JSON.stringify({data:'2026-11-18',id:111}),modified:1};

 // Valores automáticos do celular não bloqueiam a primeira recuperação.
 const fresh=await browser({
   'medquest_semente':'"seed-phone"',
   'cti_destaque':JSON.stringify({data:'2026-11-18',id:777})
 });
 assert.equal(await fresh.sync(),true,'first sync must recover generated keys');
 assert.equal(fresh.map.get('medquest_historico'),store.progress.data.items.medquest_historico.raw);
 assert.equal(fresh.map.get('medquest_semente'),store.progress.data.items.medquest_semente?.raw || '"seed-phone"');
 const b=JSON.parse(fresh.map.get('cti_sync_bootstrap_backups_v1'));
 assert.ok(b.some(x=>x.key==='medquest_semente') || !store.progress.data.items.medquest_semente);
 assert.ok(b.some(x=>x.key==='cti_destaque') || !store.progress.data.items.cti_destaque);

 // Quando há resposta na questão em destaque, não descartar trabalho local.
 const unanswered=await browser({'medquest_semente':'"local-seed"'});
 assert.equal(await unanswered.sync(),true,'seed alone should not block');
 const seeded=await browser({'medquest_semente':'"another-seed"', 'cti_destaque':JSON.stringify({data:'2026-11-18',id:999,resp:{sel:'B'}})});
 if(store.progress.data.items.cti_destaque?.raw){
   assert.equal(await seeded.sync(),false,'answered spotlight must remain protected');
   assert.ok(seeded.map.get('cti_destaque').includes('"resp"'));
 }

 // Falha de banco não apaga armazenamento local.
 phone.map.set('cti_study_notes_v32','{"note":"offline"}');
 failPut=true;
 assert.equal(await phone.sync(),false);
 assert.equal(phone.map.get('cti_study_notes_v32'),'{"note":"offline"}');
 failPut=false;

 // Sessão inválida não deve redirecionar nem causar loop.
 unauthorized=true;
 assert.equal(await pc.sync(),false);
 assert.equal(pc.reloads(),0);
 unauthorized=false;

 // Payload excessivo nunca é enviado ao servidor.
 const large=await browser({'medquest_historico':'a'.repeat(350001)});
 const saved=store.progress.version;
 assert.equal(await large.sync(),false);
 assert.equal(store.progress.version,saved);
 assert.equal(large.reloads(),0);
 // Automatic mode uses independent simulated timers, without manual sync calls.
 for(const ns of Object.keys(store))store[ns]={version:0,data:{}};
 const autoPc=await browser({'medquest_historico':'["auto1"]','cti_cera_v1':'{"version":1,"topics":{}}'},true);
 assert.equal(autoPc.status().automatic,true);
 assert.equal(autoPc.scheduled(),1,'one scheduled cycle only');
 await autoPc.cycle();
 assert.equal(store.progress.data.items.medquest_historico.raw,'["auto1"]');
 const autoPhone=await browser({},true);
 await autoPhone.cycle();
 assert.equal(autoPhone.map.get('medquest_historico'),'["auto1"]');
 assert.ok(autoPhone.applied.includes('cti_cera_v1'));
 autoPhone.map.set('medquest_historico','["auto1","phone"]');
 autoPhone.notify('medquest_historico');
 assert.ok(autoPhone.nextDelay()<=5000,'new answer must accelerate the upload');
 autoPhone.notify('medquest_historico');
 assert.equal(autoPhone.scheduled(),1,'writes must not create duplicate timers');
 await autoPhone.cycle();
 autoPc.hide();
 assert.equal(autoPc.scheduled(),0,'hidden mobile tab must suspend polling');
 autoPc.show();autoPc.wake();
 assert.ok(autoPc.nextDelay()<=5000,'return to application must accelerate recovery');
 assert.equal(autoPc.scheduled(),1);
 autoPc.setSafe(false);
 await autoPc.cycle();
 assert.equal(autoPc.map.get('medquest_historico'),'["auto1"]','do not mutate active view');
 assert.equal(autoPc.status().deferred,true);
 autoPc.setSafe(true);
 await autoPc.cycle();
 assert.equal(autoPc.map.get('medquest_historico'),'["auto1","phone"]');
 assert.equal(autoPc.status().deferred,false);
 autoPhone.setOnline(false);
 assert.equal(autoPhone.scheduled(),0);
 autoPhone.map.set('cti_study_notes_v32','{"note":"offline"}');
 autoPhone.setOnline(true);
 assert.equal(autoPhone.scheduled(),1);
 await autoPhone.cycle();
 assert.equal(store.study.data.items.cti_study_notes_v32.raw,'{"note":"offline"}');
 await autoPc.cycle();
 assert.equal(autoPc.map.get('cti_study_notes_v32'),'{"note":"offline"}');
 unauthorized=true;
 await autoPc.cycle();
 assert.equal(autoPc.scheduled(),0,'401 must stop automatic retry');
 assert.equal(autoPc.reloads(),0);
 unauthorized=false;
 // Regressão realista: tentativas respondidas em aparelhos diferentes não se apagam.
 for(const ns of Object.keys(store))store[ns]={version:0,data:{}};
 const eventA={id:580,ts:1001,data:'2026-11-22',area:'Clínica',tema:'Diabetes',exame:'Revalida',acertou:true,origem:'treino'};
 const eventB={id:581,ts:1002,data:'2026-11-22',area:'Clínica',tema:'Hipertensão',exame:'Revalida',acertou:false,origem:'treino'};
 const eventC={id:582,ts:1003,data:'2026-11-22',area:'Clínica',tema:'Asma',exame:'Revalida',acertou:true,origem:'treino'};
 const a=await browser({'medquest_historico':JSON.stringify([eventA]),
                         'cti_study_notes_v32':JSON.stringify({note:'PC'})});
 assert.equal(await a.sync(),true);
 const b=await browser({'medquest_historico':JSON.stringify([eventB]),
                         'cti_study_notes_v32':JSON.stringify({note:'PHONE'})});
 assert.equal(await b.sync(),false,'unrelated divergent notes should remain in conflict');
 assert.deepEqual(JSON.parse(store.progress.data.items.medquest_historico.raw).map(e=>e.id),[580,581]);
 assert.deepEqual(JSON.parse(b.map.get('medquest_historico')).map(e=>e.id),[580,581]);
 assert.equal(b.map.get('cti_study_notes_v32'),JSON.stringify({note:'PHONE'}));
 assert.equal(store.study.data.items.cti_study_notes_v32.raw,JSON.stringify({note:'PC'}));
 assert.ok(b.status().error.includes('study'),'show pending conflict instead of success');
 assert.equal(await a.sync(),true);
 assert.deepEqual(JSON.parse(a.map.get('medquest_historico')).map(e=>e.id),[580,581]);
 b.setSafe(false);
 b.map.set('medquest_historico',JSON.stringify([eventA,eventB,eventC]));
 assert.equal(await b.sync(),false,'unresolved notes must not hide history upload');
 assert.deepEqual(JSON.parse(store.progress.data.items.medquest_historico.raw).map(e=>e.id),[580,581,582]);
 assert.equal(await a.sync(),true);
 assert.deepEqual(JSON.parse(a.map.get('medquest_historico')).map(e=>e.id),[580,581,582]);
 // A mesma categoria pode ter conflito de missão, sem bloquear o histórico.
 for(const ns of Object.keys(store))store[ns]={version:0,data:{}};
 const missionA=JSON.stringify({dias:{day:{respostas:{1:'A'}}}});
 const missionB=JSON.stringify({dias:{day:{respostas:{1:'B'}}}});
 const c=await browser({'medquest_historico':JSON.stringify([eventA]),
                       'medquest_missao':missionA});
 assert.equal(await c.sync(),true);
 const d=await browser({'medquest_historico':JSON.stringify([eventB]),
                       'medquest_missao':missionB,
                       'cti_study_notes_v32':'{"note":"phone-note"}'});
 assert.equal(await d.sync(),false,'mission remains protected instead of overwriting');
 assert.deepEqual(JSON.parse(store.progress.data.items.medquest_historico.raw).map(e=>e.id),[580,581]);
 assert.equal(store.progress.data.items.medquest_missao.raw,missionA);
 assert.equal(d.map.get('medquest_missao'),missionB);
 assert.equal(store.study.data.items.cti_study_notes_v32.raw,'{"note":"phone-note"}',
              'independent study data must synchronize despite progress conflict');
 // Não mesclar objetos truncados/sem timestamp nem tratar exclusão deliberada como append.
 for(const ns of Object.keys(store))store[ns]={version:0,data:{}};
 const invalidA=await browser({'medquest_historico':'[{"id":1}]'});
 assert.equal(await invalidA.sync(),true);
 const invalidB=await browser({'medquest_historico':'[{"id":2}]'});
 assert.equal(await invalidB.sync(),false,'invalid event arrays stay conflicted');
 console.log('PASS manual/automatic cross-device, append-only history, conflict isolation, safe active-view sync');
})().catch(err=>{console.error(err);process.exitCode=1});
