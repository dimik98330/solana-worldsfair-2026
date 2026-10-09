/** Aggregate in-memory limits; document/schema validation belongs to storage integration. */
export interface RemoteDocumentStateLimits {
  maxDocuments:number;
  maxBytes:number;
  maxSavepoints:number;
}
/** Immutable payload. The caller must bind its durable acknowledgement to this token/payload. */
export interface PreparedDocumentCommit {
  readonly token:number;
  readonly writes:ReadonlyArray<readonly [key:string,body:string]>;
}
export class RemoteDocumentStateError extends Error {
  constructor(readonly code:string,message:string){super(message);this.name='RemoteDocumentStateError';}
}
interface Savepoint {id:number;undo:Map<string,string|undefined>;bytes:number;documents:number;}
interface TransactionState {
  writes:Map<string,string>;savepoints:Savepoint[];bytes:number;documents:number;
  pending?:{token:number;snapshot:Map<string,string>};
}
const encoder=new TextEncoder();
function fail(code:string,message:string):never{throw new RemoteDocumentStateError(code,message);}

/**
 * Synchronous, upsert-only state for the existing document store. No I/O occurs here.
 * begin(snapshot) adopts an already committed remote snapshot and stages later writes.
 * Nested savepoints are LIFO; rollbackToSavepoint keeps the target until releaseSavepoint.
 * prepareCommit freezes writes; only commitAcknowledged publishes them to the committed cache.
 * An uncertain/failed acknowledgement requires rollback plus external bridge poisoning/recovery.
 */
export class RemoteDocumentState {
  #limits:Readonly<RemoteDocumentStateLimits>;
  #committed=new Map<string,string>();
  #transaction:TransactionState|undefined;
  #nextToken=0;

  constructor(limits:RemoteDocumentStateLimits,initial:ReadonlyMap<string,string>=new Map()){
    for(const value of [limits.maxDocuments,limits.maxBytes,limits.maxSavepoints]){
      if(!Number.isSafeInteger(value)||value<1)fail('INVALID_LIMIT','Document-state limits must be positive safe integers');
    }
    this.#limits=Object.freeze({...limits});
    this.#committed=this.#copySnapshot(initial).snapshot;
  }
  get phase():'idle'|'active'|'awaiting-ack'{return !this.#transaction?'idle':this.#transaction.pending?'awaiting-ack':'active';}

  /** Input maps are copied; a rejected begin cannot replace the previous committed cache. */
  begin(snapshot:ReadonlyMap<string,string>=this.#committed):void{
    if(this.#transaction)fail('TRANSACTION_ACTIVE','Finish the existing root transaction before beginning another');
    const checked=this.#copySnapshot(snapshot);
    this.#committed=checked.snapshot;
    this.#transaction={writes:new Map(),savepoints:[],bytes:checked.bytes,documents:checked.snapshot.size};
  }
  get(key:string):string|undefined{return this.#transaction?.writes.get(key)??this.#committed.get(key);}
  /** Detached effective snapshot, ordered by key and including this transaction's own writes. */
  list():Map<string,string>{return new Map([...this.#effectiveSnapshot()].sort(([left],[right])=>left<right?-1:left>right?1:0));}
  /** Detached acknowledged baseline; staged changes are never exposed by this method. */
  committedSnapshot():Map<string,string>{return new Map(this.#committed);}

  set(key:string,body:string):void{
    const transaction=this.#writable(),nextSize=this.#entryBytes(key,body),previous=this.get(key);
    const bytes=transaction.bytes+nextSize-(previous===undefined?0:this.#entryBytes(key,previous));
    const documents=transaction.documents+(previous===undefined?1:0);
    this.#checkLimits(documents,bytes);
    const savepoint=transaction.savepoints.at(-1);
    if(savepoint&&!savepoint.undo.has(key))savepoint.undo.set(key,transaction.writes.get(key));
    if(body===this.#committed.get(key))transaction.writes.delete(key);else transaction.writes.set(key,body);
    transaction.bytes=bytes;transaction.documents=documents;
  }
  savepoint():number{
    const transaction=this.#writable();
    if(transaction.savepoints.length>=this.#limits.maxSavepoints)fail('STATE_LIMIT','Document-state savepoint limit exceeded');
    const id=this.#token();
    transaction.savepoints.push({id,undo:new Map(),bytes:transaction.bytes,documents:transaction.documents});
    return id;
  }
  rollbackToSavepoint(id:number):void{
    const transaction=this.#writable(),savepoint=this.#topSavepoint(transaction,id);
    for(const [key,previous] of savepoint.undo){if(previous===undefined)transaction.writes.delete(key);else transaction.writes.set(key,previous);}
    transaction.bytes=savepoint.bytes;transaction.documents=savepoint.documents;savepoint.undo.clear();
  }
  releaseSavepoint(id:number):void{
    const transaction=this.#writable(),savepoint=this.#topSavepoint(transaction,id);
    transaction.savepoints.pop();
    const parent=transaction.savepoints.at(-1);
    if(parent)for(const [key,previous] of savepoint.undo)if(!parent.undo.has(key))parent.undo.set(key,previous);
  }
  prepareCommit():PreparedDocumentCommit{
    const transaction=this.#writable();
    if(transaction.savepoints.length)fail('SAVEPOINTS_ACTIVE','Release nested savepoints before preparing a root commit');
    const token=this.#token(),snapshot=this.#effectiveSnapshot();
    const writes=[...transaction.writes].sort(([left],[right])=>left<right?-1:left>right?1:0)
      .map(([key,body])=>Object.freeze([key,body] as const));
    transaction.pending={token,snapshot};
    return Object.freeze({token,writes:Object.freeze(writes)});
  }
  /** This method does not prove durability; call it only after an exact external durable ack. */
  commitAcknowledged(token:number):void{
    const transaction=this.#active();
    if(!transaction.pending||transaction.pending.token!==token)fail('COMMIT_TOKEN_MISMATCH','No matching prepared commit awaits acknowledgement');
    this.#committed=transaction.pending.snapshot;this.#transaction=undefined;
  }
  /** Discards all staged/nested/pending work. An already acknowledged baseline is preserved. */
  rollback():void{this.#active();this.#transaction=undefined;}

  #active():TransactionState{
    if(!this.#transaction)fail('TRANSACTION_REQUIRED','Begin a root transaction first');
    return this.#transaction;
  }
  #writable():TransactionState{
    const transaction=this.#active();
    if(transaction.pending)fail('COMMIT_PREPARED','Prepared writes cannot change before acknowledgement or rollback');
    return transaction;
  }
  #topSavepoint(transaction:TransactionState,id:number):Savepoint{
    const savepoint=transaction.savepoints.at(-1);
    if(!savepoint||savepoint.id!==id)fail('SAVEPOINT_ORDER','Only the innermost active savepoint can be changed');
    return savepoint;
  }
  #token():number{
    if(this.#nextToken===Number.MAX_SAFE_INTEGER)fail('TOKEN_LIMIT','Document-state token space exhausted');
    return ++this.#nextToken;
  }
  #entryBytes(key:string,body:string):number{
    if(typeof key!=='string'||typeof body!=='string')fail('INVALID_DOCUMENT','Document keys and bodies must be strings');
    if(key.length+body.length>this.#limits.maxBytes)fail('STATE_LIMIT','Document-state byte limit exceeded');
    return encoder.encode(key).byteLength+encoder.encode(body).byteLength;
  }
  #checkLimits(documents:number,bytes:number):void{
    if(documents>this.#limits.maxDocuments||!Number.isSafeInteger(bytes)||bytes>this.#limits.maxBytes)fail('STATE_LIMIT','Document-state snapshot limit exceeded');
  }
  #copySnapshot(input:ReadonlyMap<string,string>){
    const snapshot=new Map<string,string>();let bytes=0;
    for(const [key,body] of input){bytes+=this.#entryBytes(key,body);snapshot.set(key,body);this.#checkLimits(snapshot.size,bytes);}
    return {snapshot,bytes};
  }
  #effectiveSnapshot():Map<string,string>{
    const snapshot=new Map(this.#committed);
    if(this.#transaction)for(const [key,body] of this.#transaction.writes)snapshot.set(key,body);
    return snapshot;
  }
}
