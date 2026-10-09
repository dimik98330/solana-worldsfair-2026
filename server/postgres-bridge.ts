import {Worker,MessageChannel,receiveMessageOnPort,type MessagePort} from 'node:worker_threads';
import type {PostgresPolicy} from './postgres-policy.ts';
import type {RemoteSnapshot,RemoteChange} from './remote-postgres-engine.mjs';
export class PostgresBridgeError extends Error {constructor(readonly code:string){super('Remote metadata is unavailable. Retain existing recovery IDs and signatures; no new relay is permitted.');this.name='PostgresBridgeError';}}
export type PostgresCommand='initialize'|'hydrate'|'begin'|'commit'|'rollback'|'exportSnapshot'|'assertWriter'|'close';
interface Reply {id?:number;ok?:boolean;value?:unknown;code?:string;fatal?:boolean;health?:{poisoned?:boolean;closed?:boolean;generation?:string|null;acknowledgedAt?:string|null;activeTransaction?:boolean};}
/** The network/SQL event loop is in a Worker; this preserves synchronous transaction callbacks. */
export class PostgresBridge {
 #worker:Worker;#port:MessagePort;#id=0;#poisoned=false;#closed=false;#timeout:number;#health:Reply['health'];
 constructor(options:PostgresPolicy,timeoutMs=options.transactionTimeoutMs+7000){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw new PostgresBridgeError('STORAGE_CONFIG');
  this.#timeout=timeoutMs;const channel=new MessageChannel();this.#port=channel.port1;
  this.#worker=new Worker(new URL('./postgres-worker.mjs',import.meta.url),{execArgv:[],workerData:{port:channel.port2,options},transferList:[channel.port2],resourceLimits:{maxOldGenerationSizeMb:256}});
  this.#worker.on('error',()=>this.#poison());this.#worker.on('exit',code=>{if(!this.#closed&&code!==0)this.#poison();});
  this.#worker.unref();this.#port.unref();
 }
 get health(){return {...this.#health,poisoned:this.#poisoned||this.#health?.poisoned===true,closed:this.#closed};}
 #poison(){this.#poisoned=true;void this.#worker.terminate().catch(()=>{});}
 call<T=unknown>(method:PostgresCommand,...args:unknown[]):T{
  if(this.#closed)throw new PostgresBridgeError('STORAGE_CLOSED');if(this.#poisoned)throw new PostgresBridgeError('STORAGE_POISONED');
  if(this.#id===Number.MAX_SAFE_INTEGER){this.#poison();throw new PostgresBridgeError('STORAGE_LIMIT');}
  const id=++this.#id,signal=new Int32Array(new SharedArrayBuffer(4)),deadline=performance.now()+this.#timeout;
  this.#port.postMessage({id,method,args,signal});
  while(true){
   const packet=receiveMessageOnPort(this.#port);if(packet){const reply=packet.message as Reply;
    if(reply.fatal||reply.id!==id){this.#poison();throw new PostgresBridgeError('STORAGE_REMOTE');}
    this.#health=reply.health;
    if(!reply.ok){if(reply.health?.poisoned||reply.health?.closed)this.#poison();throw new PostgresBridgeError(reply.code??'STORAGE_REMOTE');}
    return reply.value as T;
   }
   const remaining=deadline-performance.now();if(remaining<=0){this.#poison();throw new PostgresBridgeError('STORAGE_TIMEOUT');}
   Atomics.wait(signal,0,0,Math.min(remaining,100));
  }
 }
 initialize(){return this.call<RemoteSnapshot>('initialize');}
 begin(){return this.call<RemoteSnapshot>('begin');}
 commit(changes:RemoteChange[]){return this.call<RemoteSnapshot>('commit',changes);}
 rollback(){this.call('rollback');}
 exportSnapshot(){return this.call<RemoteSnapshot>('exportSnapshot');}
 assertWriter(){return this.call<{verified:true;generation:string;checkedAt:string}>('assertWriter');}
 close(){if(this.#closed)return;try{if(!this.#poisoned)this.call('close');}finally{this.#closed=true;this.#port.close();void this.#worker.terminate().catch(()=>{});}}
}
