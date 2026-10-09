import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RemoteDocumentState,RemoteDocumentStateError} from '../../server/remote-document-state.ts';

const limits={maxDocuments:32,maxBytes:4096,maxSavepoints:8};
const state=(entries:[string,string][]=[])=>new RemoteDocumentState(limits,new Map(entries));
const code=(expected:string)=>(error:unknown)=>error instanceof RemoteDocumentStateError&&error.code===expected;

test('own reads include staged updates/new documents while the acknowledged baseline changes only after ack',()=>{
 const documents=state([['receipt','pending']]);documents.begin();documents.set('receipt','confirmed');documents.set('intent','bound');
 assert.equal(documents.get('receipt'),'confirmed');assert.deepEqual([...documents.list()],[['intent','bound'],['receipt','confirmed']]);
 assert.deepEqual([...documents.committedSnapshot()],[['receipt','pending']]);
 const commit=documents.prepareCommit();assert.deepEqual(commit.writes,[['intent','bound'],['receipt','confirmed']]);
 assert.equal(documents.phase,'awaiting-ack');assert.deepEqual([...documents.committedSnapshot()],[['receipt','pending']]);
 documents.commitAcknowledged(commit.token);assert.equal(documents.phase,'idle');assert.equal(documents.get('receipt'),'confirmed');assert.equal(documents.get('intent'),'bound');
});

test('caught inner failure restores only inner changes and permits the outer transaction to continue',()=>{
 const documents=state([['receipt','pending']]);documents.begin();documents.set('receipt','outer');
 const inner=documents.savepoint();
 try{documents.set('receipt','inner');documents.set('inner-only','discard');throw Error('Synthetic local projection failure');}
 catch{documents.rollbackToSavepoint(inner);documents.releaseSavepoint(inner);}
 assert.equal(documents.get('receipt'),'outer');assert.equal(documents.get('inner-only'),undefined);
 documents.set('continued','retained');documents.commitAcknowledged(documents.prepareCommit().token);
 assert.deepEqual([...documents.list()],[['continued','retained'],['receipt','outer']]);
});

test('releasing an inner savepoint still allows the enclosing savepoint to undo its entire scope',()=>{
 const documents=state([['amount','exact-original']]);documents.begin();documents.set('root','retained');
 const outer=documents.savepoint();documents.set('amount','outer');
 const inner=documents.savepoint();documents.set('amount','inner');documents.set('released-inner','discard');documents.releaseSavepoint(inner);
 documents.set('after-release','discard');documents.rollbackToSavepoint(outer);
 assert.equal(documents.get('amount'),'exact-original');assert.equal(documents.get('root'),'retained');
 assert.equal(documents.get('released-inner'),undefined);assert.equal(documents.get('after-release'),undefined);
 documents.releaseSavepoint(outer);documents.commitAcknowledged(documents.prepareCommit().token);
 assert.deepEqual([...documents.list()],[['amount','exact-original'],['root','retained']]);
});

test('rollback to a savepoint keeps its original boundary for further writes and another rollback',()=>{
 const documents=state();documents.begin();const point=documents.savepoint();
 documents.set('first','discard');documents.rollbackToSavepoint(point);documents.set('second','also discard');documents.rollbackToSavepoint(point);
 assert.equal(documents.list().size,0);assert.throws(()=>documents.prepareCommit(),code('SAVEPOINTS_ACTIVE'));
 documents.set('third','keep');documents.releaseSavepoint(point);documents.commitAcknowledged(documents.prepareCommit().token);
 assert.deepEqual([...documents.list()],[['third','keep']]);
});

test('root rollback discards nested and pending work, and late ack cannot publish into a later transaction',()=>{
 const documents=state([['receipt','pending']]);documents.begin();documents.set('receipt','unacknowledged');documents.savepoint();documents.set('child','discard');documents.rollback();
 assert.deepEqual([...documents.list()],[['receipt','pending']]);
 documents.begin();documents.set('receipt','first commit');const failed=documents.prepareCommit();
 // The durable writer failed or its result was unknown: no acknowledgement is supplied.
 assert.deepEqual([...documents.committedSnapshot()],[['receipt','pending']]);documents.rollback();
 assert.deepEqual([...documents.list()],[['receipt','pending']]);
 documents.begin();documents.set('receipt','second commit');const current=documents.prepareCommit();
 assert.throws(()=>documents.commitAcknowledged(failed.token),code('COMMIT_TOKEN_MISMATCH'));
 assert.deepEqual([...documents.committedSnapshot()],[['receipt','pending']]);documents.commitAcknowledged(current.token);
 assert.equal(documents.get('receipt'),'second commit');
});

test('snapshot inputs and result maps are detached from retained state; prepared payload is immutable',()=>{
 const initial=new Map([['receipt','original']]),documents=new RemoteDocumentState(limits,initial);initial.set('receipt','mutated caller input');
 assert.equal(documents.get('receipt'),'original');
 const snapshot=new Map([['receipt','remote baseline']]);documents.begin(snapshot);snapshot.clear();
 const visible=documents.list();visible.set('receipt','mutated result');documents.committedSnapshot().clear();
 assert.equal(documents.get('receipt'),'remote baseline');documents.set('receipt','new exact value');const commit=documents.prepareCommit();
 assert.throws(()=>{(commit.writes as [string,string][]).push(['injected','value']);},TypeError);
 assert.throws(()=>{(commit.writes[0] as [string,string])[1]='changed payload';},TypeError);
 documents.commitAcknowledged(commit.token);documents.list().clear();assert.equal(documents.get('receipt'),'new exact value');assert.equal(documents.get('injected'),undefined);
});

test('invalid transitions and out-of-order savepoints do not corrupt staged or acknowledged values',()=>{
 const documents=state([['receipt','pending']]);
 for(const action of [()=>documents.set('x','y'),()=>documents.savepoint(),()=>documents.prepareCommit(),()=>documents.commitAcknowledged(1),()=>documents.rollback()])assert.throws(action,code('TRANSACTION_REQUIRED'));
 documents.begin();documents.set('receipt','staged');assert.throws(()=>documents.begin(new Map([['wrong','snapshot']])),code('TRANSACTION_ACTIVE'));
 assert.equal(documents.get('receipt'),'staged');const outer=documents.savepoint(),inner=documents.savepoint();
 assert.throws(()=>documents.rollbackToSavepoint(outer),code('SAVEPOINT_ORDER'));assert.throws(()=>documents.releaseSavepoint(outer),code('SAVEPOINT_ORDER'));
 documents.releaseSavepoint(inner);documents.releaseSavepoint(outer);const commit=documents.prepareCommit();
 assert.throws(()=>documents.set('late','write'),code('COMMIT_PREPARED'));assert.throws(()=>documents.savepoint(),code('COMMIT_PREPARED'));assert.throws(()=>documents.prepareCommit(),code('COMMIT_PREPARED'));
 assert.throws(()=>documents.commitAcknowledged(commit.token+1),code('COMMIT_TOKEN_MISMATCH'));assert.equal(documents.get('late'),undefined);
 documents.commitAcknowledged(commit.token);assert.throws(()=>documents.commitAcknowledged(commit.token),code('TRANSACTION_REQUIRED'));
 assert.equal(documents.get('receipt'),'staged');
});

test('transaction limits count UTF-8 bytes and reject changes atomically, including rejected refreshes',()=>{
 const configured={maxDocuments:2,maxBytes:12,maxSavepoints:1},documents=new RemoteDocumentState(configured,new Map([['a','one']]));configured.maxBytes=1000;
 documents.begin();const point=documents.savepoint();documents.set('b','éé');
 assert.throws(()=>documents.set('a','éééé'),code('STATE_LIMIT'));assert.equal(documents.get('a'),'one');
 assert.throws(()=>documents.set('c','x'),code('STATE_LIMIT'));assert.throws(()=>documents.savepoint(),code('STATE_LIMIT'));
 documents.rollbackToSavepoint(point);documents.releaseSavepoint(point);documents.set('c','x');documents.commitAcknowledged(documents.prepareCommit().token);
 assert.deepEqual([...documents.list()],[['a','one'],['c','x']]);
 assert.throws(()=>documents.begin(new Map([['too-large','éééé']])),code('STATE_LIMIT'));assert.equal(documents.phase,'idle');assert.equal(documents.get('a'),'one');
});

test('reverting a staged value to its baseline produces no spurious remote write and survives nested undo',()=>{
 const documents=state([['receipt','baseline']]);documents.begin();documents.set('receipt','outer');const point=documents.savepoint();
 documents.set('receipt','baseline');assert.equal(documents.get('receipt'),'baseline');documents.rollbackToSavepoint(point);documents.releaseSavepoint(point);
 assert.equal(documents.get('receipt'),'outer');documents.set('receipt','baseline');const commit=documents.prepareCommit();assert.deepEqual(commit.writes,[]);
 documents.commitAcknowledged(commit.token);assert.equal(documents.get('receipt'),'baseline');
});

test('instances sharing the same input snapshot keep independent transaction and acknowledgement state',()=>{
 const snapshot=new Map([['receipt','shared baseline']]),first=new RemoteDocumentState(limits,snapshot),second=new RemoteDocumentState(limits,snapshot);
 first.begin();second.begin();first.set('receipt','first acknowledged');second.set('receipt','second unacknowledged');
 first.commitAcknowledged(first.prepareCommit().token);
 assert.equal(first.get('receipt'),'first acknowledged');assert.equal(second.get('receipt'),'second unacknowledged');
 assert.equal(second.committedSnapshot().get('receipt'),'shared baseline');second.rollback();
 assert.equal(second.get('receipt'),'shared baseline');assert.equal(snapshot.get('receipt'),'shared baseline');
 assert.equal(first.get('receipt'),'first acknowledged');
});
