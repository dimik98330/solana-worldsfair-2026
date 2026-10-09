import {workerData} from 'node:worker_threads';
import {Pool} from 'pg';
import {RemotePostgresEngine} from './remote-postgres-engine.mjs';
const {port,options}=workerData;
let engine;
try{engine=new RemotePostgresEngine({...options,pool:new Pool(options.connection)});}catch{engine=null;}
const methods=new Set(['initialize','hydrate','begin','commit','rollback','exportSnapshot','assertWriter','close']);
let queue=Promise.resolve();
port.on('message',request=>{
 queue=queue.then(async()=>{
  const {id,method,args,signal}=request;
  let reply;
  try{
   if(!engine||!Number.isSafeInteger(id)||!methods.has(method)||!Array.isArray(args)||!(signal instanceof Int32Array)||signal.length!==1)throw new Error('Invalid bridge request');
   const value=await engine[method](...args);reply={id,ok:true,value,health:engine.health};
  }catch(error){const code=typeof error?.code==='string'&&/^STORAGE_[A-Z_]{1,64}$/.test(error.code)?error.code:'STORAGE_REMOTE';reply={id,ok:false,code,health:engine?.health??{poisoned:true,closed:true}};}
  port.postMessage(reply);Atomics.store(signal,0,1);Atomics.notify(signal,0);
 }).catch(()=>{try{port.postMessage({fatal:true,code:'STORAGE_REMOTE'});}catch{}});
});
