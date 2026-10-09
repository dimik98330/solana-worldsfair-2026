import {RemoteDocumentState} from './remote-document-state.ts';
import {PostgresBridge,PostgresBridgeError} from './postgres-bridge.ts';
import type {PostgresPolicy} from './postgres-policy.ts';
import {validateRemoteDocumentBody,validateRemoteDocumentKey,type RemoteSnapshot} from './remote-postgres-engine.mjs';
/** Root callbacks remain synchronous; publication occurs only after the exact COMMIT reply. */
export class PostgresDocumentStore {
 #bridge:PostgresBridge;#state:RemoteDocumentState;#depth=0;#closed=false;#snapshot:RemoteSnapshot;#limits:{maxDocuments:number;maxBytes:number;maxSavepoints:number};
 constructor(options:PostgresPolicy){
  this.#limits={maxDocuments:100000,maxBytes:options.maxSnapshotBytes,maxSavepoints:100};this.#bridge=new PostgresBridge(options);
  try{this.#snapshot=this.#bridge.initialize();this.#state=new RemoteDocumentState(this.#limits,this.#map(this.#snapshot));}
  catch(error){this.#bridge.close();throw error;}
 }
 #map(snapshot:RemoteSnapshot){const result=new Map<string,string>();for(const row of snapshot.documents){validateRemoteDocumentKey(row.key);validateRemoteDocumentBody(row.body);if(result.has(row.key))throw new PostgresBridgeError('STORAGE_SCHEMA');result.set(row.key,row.body);}return result;}
 #guard(){if(this.#closed||this.#bridge.health.closed)throw new PostgresBridgeError('STORAGE_CLOSED');if(this.#bridge.health.poisoned)throw new PostgresBridgeError('STORAGE_POISONED');}
 #sync(callback:Function){if(['AsyncFunction','AsyncGeneratorFunction'].includes(callback.constructor.name))throw new PostgresBridgeError('STORAGE_ASYNC');}
 transactionSync<T>(callback:()=>T):T{
  this.#guard();this.#sync(callback);const outer=this.#depth===0;
  let savepoint:number|undefined;const acknowledgedBefore=outer?this.#state.committedSnapshot():undefined;
  if(outer){const observed=this.#bridge.begin();try{this.#state.begin(this.#map(observed));}catch(error){this.#bridge.rollback();throw error;}}
  else savepoint=this.#state.savepoint();
  this.#depth++;
  try{
   const result=callback();
   if(result!==null&&(typeof result==='object'||typeof result==='function')&&typeof(result as {then?:unknown}).then==='function'){void Promise.resolve(result).catch(()=>{});throw new PostgresBridgeError('STORAGE_ASYNC');}
   if(outer){
    const commit=this.#state.prepareCommit(),expected=this.#state.list();
    const ack=this.#bridge.commit(commit.writes.map(([key,body])=>({key,body})));
    const actual=this.#map(ack);
    if(actual.size!==expected.size||[...expected].some(([key,body])=>actual.get(key)!==body)){this.#bridge.close();throw new PostgresBridgeError('STORAGE_ACK_MISMATCH');}
    this.#state.commitAcknowledged(commit.token);this.#snapshot=ack;
   }else this.#state.releaseSavepoint(savepoint!);
   return result;
  }catch(error){
   if(outer){try{if(this.#bridge.health.activeTransaction&&!this.#bridge.health.poisoned&&!this.#bridge.health.closed)this.#bridge.rollback();}finally{this.#state=new RemoteDocumentState(this.#limits,acknowledgedBefore!);}}
   else{this.#state.rollbackToSavepoint(savepoint!);this.#state.releaseSavepoint(savepoint!);}
   throw error;
  }finally{this.#depth--;}
 }
 read(key:string){this.#guard();return this.#state.get(validateRemoteDocumentKey(key));}
 write(key:string,body:string){validateRemoteDocumentKey(key);validateRemoteDocumentBody(body);this.transactionSync(()=>this.#state.set(key,body));}
 keys(){this.#guard();return [...this.#state.list().keys()];}
 diagnostics(refresh=false){
  this.#guard();if(refresh&&this.#depth===0){this.#snapshot=this.#bridge.call<RemoteSnapshot>('hydrate');this.#state.begin(this.#map(this.#snapshot));this.#state.rollback();}
  return {backend:'postgres' as const,cacheSource:'acknowledged-primary-snapshot' as const,documentCount:this.#snapshot.documents.length,migrationCount:this.#snapshot.legacyImports.length,schemaVersion:1,snapshotBytes:this.#snapshot.bytes,observedGeneration:this.#snapshot.generation,ownedGeneration:this.#bridge.health.generation??null,acknowledgedAt:this.#snapshot.acknowledgedAt,primaryDataSha256:this.#snapshot.dataSha256,poisoned:this.#bridge.health.poisoned};
 }
 exportSnapshot(){this.#guard();if(this.#depth)throw new PostgresBridgeError('STORAGE_TRANSACTION');return this.#bridge.exportSnapshot();}
 assertWritable(){this.#guard();if(this.#bridge.health.generation===null||this.#bridge.health.generation===undefined)this.transactionSync(()=>{});return this.#bridge.assertWriter();}
 close(){if(this.#closed)return;if(this.#depth)throw new PostgresBridgeError('STORAGE_TRANSACTION');this.#closed=true;this.#bridge.close();}
}
