import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

// These processes use only synthetic public metadata in a fresh ignored namespace.
const base=path.resolve('.local/tests/storage-open-contention-'+randomUUID()),directory=path.join(base,'main');
fs.mkdirSync(directory,{recursive:true});
Object.assign(process.env,{BONDTRACE_DATA_DIR:directory,BONDTRACE_NETWORK:'localnet',BONDTRACE_DEPLOYMENT:'local',BONDTRACE_STORAGE_BACKEND:'sqlite'});
const storage=await import('../../server/storage.ts');
const storageUrl=pathToFileURL(path.resolve('server/storage.ts')).href;
const file=(name:string)=>path.join(directory,name),op='operations/storage_recovery_same_id.json';
storage.writeJson(file('fixture.json'),{value:'old-committed'});
storage.writeJson(file(op),{id:'storage_recovery_same_id',signature:'synthetic-retained-signature',chainStatus:'confirmed',projectionStatus:'pending',updates:0});
storage.closeStorage();
after(()=>storage.closeStorage());
const digest=(name:string)=>createHash('sha256').update(fs.readFileSync(name)).digest('hex');
function env(target=directory){return{...process.env,BONDTRACE_DATA_DIR:target,BONDTRACE_NETWORK:'localnet',BONDTRACE_DEPLOYMENT:'local',BONDTRACE_STORAGE_BACKEND:'sqlite'};}
function child(source:string,target=directory){return new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
  const worker=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:process.cwd(),env:env(target),windowsHide:true});
  let stdout='',stderr='';worker.stdout.on('data',bytes=>{stdout+=String(bytes);});worker.stderr.on('data',bytes=>{stderr+=String(bytes);});worker.once('error',reject);
  const timer=setTimeout(()=>{worker.kill();reject(new Error('Isolated storage contention worker timed out'));},40_000);
  worker.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
});}
const prelude=`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import * as storage from ${JSON.stringify(storageUrl)};const directory=process.env.BONDTRACE_DATA_DIR;const file=name=>path.join(directory,name);
globalThis.fetch=()=>{throw new Error('Storage regression must never make an RPC/HTTP request');};\n`;
async function success(source:string,target=directory){const result=await child(prelude+source,target);assert.equal(result.code,0,result.stderr);return JSON.parse(result.stdout.trim()||'null');}

/** A real separate writer stages a changed document AND a new document, then
 * holds BEGIN IMMEDIATE until the parent explicitly releases it over IPC. */
async function reservedWriter(target=directory){
  let worker:ChildProcess;
  const released=new Promise<void>((resolve,reject)=>{
    const source=`import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(path.toNamespacedPath(path.join(process.env.BONDTRACE_DATA_DIR,'metadata.sqlite')));db.exec('PRAGMA busy_timeout=5000;BEGIN IMMEDIATE');
db.prepare('UPDATE documents SET body=? WHERE key=?').run(JSON.stringify({value:'new-after-commit'}),'fixture.json');
db.prepare('INSERT INTO documents(key,body,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run('operations/uncommitted_document_01.json',JSON.stringify({value:'uncommitted-new-document'}),new Date().toISOString());
process.send({phase:'reserved',pid:process.pid});process.on('message',message=>{if(message?.type==='commit'){db.exec('COMMIT');db.close();process.send({phase:'committed'});process.disconnect();}});`;
    worker=spawn(process.execPath,['--input-type=module','--eval',source],{cwd:process.cwd(),env:env(target),stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
    worker.once('error',reject);worker.once('exit',code=>code===0?resolve():reject(new Error('Reserved writer exited with '+code)));
  });
  // Observe a genuine IPC handshake rather than sleeping and guessing when the lock exists.
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Reserved writer did not acquire its lock')),15_000);
    worker!.on('message',message=>{if((message as {phase?:string}).phase==='reserved'){clearTimeout(timer);resolve();}});
    worker!.once('error',error=>{clearTimeout(timer);reject(error);});});
  return{worker:worker!,async commit(){worker!.send({type:'commit'});await released;},async stop(){if(worker!.exitCode===null){worker!.kill();await released.catch(()=>{});}}};
}

test('cold initialized reader sees committed data while a real RESERVED writer holds uncommitted metadata',async()=>{
  const writer=await reservedWriter();
  try{
    const observed=await success(`console.log(JSON.stringify({old:storage.readJson(file('fixture.json'),null),newDocument:storage.readJson(file('operations/uncommitted_document_01.json'),null),diagnostics:storage.storageDiagnostics({integrityCheck:true})}));storage.closeStorage();`);
    assert.equal(writer.worker.exitCode,null,'Writer must still hold its transaction when cold reader completes');
    assert.deepEqual(observed.old,{value:'old-committed'});assert.equal(observed.newDocument,null);
    assert.equal(observed.diagnostics.journalMode,'delete');assert.equal(observed.diagnostics.synchronous,3);assert.equal(observed.diagnostics.busyTimeoutMs,5000);assert.deepEqual(observed.diagnostics.integrityCheck,['ok']);
    await writer.commit();
    const after=await success(`console.log(JSON.stringify({value:storage.readJson(file('fixture.json'),null),newDocument:storage.readJson(file('operations/uncommitted_document_01.json'),null)}));storage.closeStorage();`);
    assert.deepEqual(after,{value:{value:'new-after-commit'},newDocument:{value:'uncommitted-new-document'}});
  }finally{await writer.stop();}
});

test('real writer contention returns typed STORAGE_BUSY with callback zero and preserves same-ID recovery',async()=>{
  storage.writeJson(file(op),{id:'storage_recovery_same_id',signature:'synthetic-retained-signature',chainStatus:'confirmed',projectionStatus:'pending',updates:0});storage.closeStorage();
  const writer=await reservedWriter();
  try{
    const observed=await success(`storage.readJson(file('fixture.json'),null);let callbacks=0,error;
try{storage.transactionSync(()=>{callbacks++;storage.writeJson(file(${JSON.stringify(op)}),{updates:999});});}catch(value){error=value;}
assert(error instanceof storage.StorageError);assert.equal(error.code,'STORAGE_BUSY');assert.equal(error.cause.code,'ERR_SQLITE_ERROR');assert.equal(error.cause.errcode&255,5);assert.equal(callbacks,0);
const original=storage.readJson(file(${JSON.stringify(op)}),null);assert.equal(original.signature,'synthetic-retained-signature');assert.equal(original.updates,0);
// Fault injection is limited to cleanup. The original BUSY is still produced by
// the real external SQLite lock; uncertainty must never become typed BUSY.
const exec=DatabaseSync.prototype.exec;let aggregate;
DatabaseSync.prototype.exec=function(sql){if(sql==='ROLLBACK')throw new Error('Injected rollback uncertainty');return Reflect.apply(exec,this,[sql]);};
try{storage.transactionSync(()=>{callbacks++;});}catch(value){aggregate=value;}finally{DatabaseSync.prototype.exec=exec;}
assert(aggregate instanceof AggregateError);assert.equal(aggregate.errors[0].code,'ERR_SQLITE_ERROR');assert.equal(aggregate.errors[0].errcode&255,5);assert.equal(callbacks,0);
// Explicit test cleanup after the injected failure; never a production retry.
// close() itself rolls back the empty probe transaction without invoking callbacks.
storage.closeStorage();console.log(JSON.stringify({code:error.code,causeCode:error.cause.code,causeErrcode:error.cause.errcode,callbacks,original,rollbackUncertainty:'AggregateError'}));`);
    assert.equal(writer.worker.exitCode,null);assert.equal(observed.callbacks,0);assert.equal(observed.code,'STORAGE_BUSY');assert.equal(observed.rollbackUncertainty,'AggregateError');
    await writer.commit();
    const recovered=await success(`storage.transactionSync(()=>{const value=storage.readJson(file(${JSON.stringify(op)}),null);assert.equal(value.signature,'synthetic-retained-signature');storage.writeJson(file(${JSON.stringify(op)}),{...value,projectionStatus:'complete',updates:value.updates+1});});console.log(JSON.stringify(storage.readJson(file(${JSON.stringify(op)}),null)));storage.closeStorage();`);
    assert.deepEqual(recovered,{id:'storage_recovery_same_id',signature:'synthetic-retained-signature',chainStatus:'confirmed',projectionStatus:'complete',updates:1});
  }finally{await writer.stop();}
});

test('missing import marker does not bypass invalid legacy data and valid migration preserves canonical DB values',async()=>{
  const target=path.join(base,'incomplete-marker');fs.mkdirSync(target,{recursive:true});
  const filename=path.join(target,'metadata.sqlite'),legacy=path.join(target,'fixture.json'),db=new DatabaseSync(filename);
  db.exec(`CREATE TABLE documents(key TEXT PRIMARY KEY NOT NULL,body TEXT NOT NULL CHECK(json_valid(body)),updated_at TEXT NOT NULL) STRICT;
CREATE TABLE storage_meta(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL) STRICT;
CREATE TABLE legacy_imports(document_key TEXT PRIMARY KEY NOT NULL,source_sha256 TEXT NOT NULL,source_bytes INTEGER NOT NULL,imported_at TEXT NOT NULL) STRICT;
PRAGMA application_id=1112822339;PRAGMA user_version=1;`);
  db.prepare('INSERT INTO documents VALUES(?,?,?)').run('fixture.json',JSON.stringify({value:'canonical-existing'}),new Date().toISOString());db.close();
  fs.writeFileSync(legacy,'{invalid legacy JSON');const before=digest(filename),legacyBefore=digest(legacy);
  await success(`assert.throws(()=>storage.readJson(file('fixture.json'),null),error=>error instanceof storage.StorageError&&error.code==='STORAGE_INVALID_JSON');console.log('null');`,target);
  assert.equal(digest(filename),before);assert.equal(digest(legacy),legacyBefore);
  const unchanged=new DatabaseSync(filename,{readOnly:true});try{assert.equal(unchanged.prepare("SELECT value FROM storage_meta WHERE key='legacy_import_complete'").get(),undefined);}finally{unchanged.close();}
  fs.writeFileSync(legacy,JSON.stringify({value:'legacy-must-not-overwrite-canonical'}));
  const recovered=await success(`console.log(JSON.stringify({value:storage.readJson(file('fixture.json'),null),diagnostics:storage.storageDiagnostics({integrityCheck:true})}));storage.closeStorage();`,target);
  assert.deepEqual(recovered.value,{value:'canonical-existing'});assert.equal(recovered.diagnostics.migrationCount,1);assert.deepEqual(recovered.diagnostics.integrityCheck,['ok']);
});

test('cold deferred validation still rejects foreign schema, unexpected WAL and unsafe namespace paths',async()=>{
  const foreign=path.join(base,'foreign');fs.mkdirSync(foreign,{recursive:true});const foreignFile=path.join(foreign,'metadata.sqlite');
  const db=new DatabaseSync(foreignFile);db.exec('CREATE TABLE unrelated(value TEXT);INSERT INTO unrelated VALUES(\'retained\');');db.close();const before=digest(foreignFile);
  await success(`assert.throws(()=>storage.readJson(file('fixture.json'),null),error=>error instanceof storage.StorageError&&error.code==='STORAGE_SCHEMA');console.log('null');`,foreign);assert.equal(digest(foreignFile),before);
  const wal=path.join(base,'wal');fs.mkdirSync(wal,{recursive:true});fs.copyFileSync(file('metadata.sqlite'),path.join(wal,'metadata.sqlite'),fs.constants.COPYFILE_EXCL);
  const walDb=new DatabaseSync(path.join(wal,'metadata.sqlite'));walDb.exec('PRAGMA journal_mode=WAL');walDb.close();
  await success(`assert.throws(()=>storage.readJson(file('fixture.json'),null),error=>error instanceof storage.StorageError&&error.code==='STORAGE_SCHEMA');console.log('null');`,wal);
  const outside=path.join(base,'unsafe-target'),redirected=path.join(base,'unsafe-link');fs.mkdirSync(outside);fs.symlinkSync(outside,redirected,process.platform==='win32'?'junction':'dir');
  await success(`assert.throws(()=>storage.readJson(file('fixture.json'),null),error=>error instanceof storage.StorageError&&error.code==='STORAGE_UNSAFE_PATH');console.log('null');`,redirected);
  assert.equal(fs.existsSync(path.join(outside,'metadata.sqlite')),false);
});
