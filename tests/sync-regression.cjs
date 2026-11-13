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
  const ns=(url.split('namespace=')[1]||'progress').split('&')[0];
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
async function browser(initial={}){
  const map=new Map(Object.entries(initial));
  const listeners={};
  let reloadCount=0;
  const document={
    readyState:'loading',cookie:'cti_csrf=dummy',
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
    document,localStorage,window:{},
    navigator:{onLine:true},TextEncoder,
    setTimeout,clearTimeout,
    fetch:backend,AbortController,
    location:{reload:()=>reloadCount++,replace:()=>reloadCount++},
    Date,JSON,Object,String,Number,Math,Error,Promise,console
  };
  context.window.window=context.window;
  vm.runInNewContext(script,context,{filename:'sync.js'});
  assert.equal(typeof listeners.DOMContentLoaded,'function');
  listeners.DOMContentLoaded();
  // Boot só consulta auth/status e nunca toca nos dados nem dispara PUT.
  await new Promise(resolve=>setImmediate(resolve));
  return {map,sync:context.window.CTI_SYNC.syncNow,status:context.window.CTI_SYNC.status,reloads:()=>reloadCount};
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
 console.log('PASS: boot inert, PC->phone, updates, conflicts, DB failures, 401, bounds, no reload');
})().catch(err=>{console.error(err);process.exitCode=1});
