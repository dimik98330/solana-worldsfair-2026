import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
const endpoint=process.env.BONDTRACE_TEST_PG_URL;
test('actual storage facade uses remote PG without a local database and materializes a verified backup',{skip:!endpoint},async()=>{
 const url=new URL(endpoint!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'32545');assert.equal(url.pathname,'/bondtrace_tests');
 const directory=path.resolve('.local/tests/pg-facade-'+crypto.randomUUID()),namespace='facade_'+crypto.randomUUID().replaceAll('-','');
 const source=`import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';const storage=await import('./server/storage.ts');const directory=process.env.BONDTRACE_DATA_DIR;const file=name=>path.join(directory,name);
 storage.transactionSync(()=>{storage.writeJson(file('operations/facade_record_01.json'),{amountMinor:'9007199254740993'});assert.throws(()=>storage.transactionSync(()=>{storage.writeJson(file('operations/facade_record_01.json'),{amountMinor:'0'});throw Error('rollback-inner');}),/rollback-inner/);assert.equal(storage.readJson(file('operations/facade_record_01.json'),null).amountMinor,'9007199254740993');});
 assert.throws(()=>storage.writeJson(file('activity.json'),{bad:1.5}),e=>e.code==='STORAGE_INVALID_JSON');
 const diag=storage.storageDiagnostics({integrityCheck:true});assert.equal(diag.backend,'postgres');assert.equal(diag.sqliteVersion,null);assert.equal(diag.synchronous,null);assert.equal(fs.existsSync(storage.databasePath),false);
 const backup=storage.backupStorage(file('backups/metadata.sqlite'));assert.deepEqual(backup.integrityCheck,['ok']);assert.equal(backup.source.backend,'postgres');assert.equal(fs.existsSync(backup.path+'.manifest.json'),true);
 storage.assertStorageRelayReady();storage.closeStorage();assert.equal(storage.readJson(file('operations/facade_record_01.json'),null).amountMinor,'9007199254740993');assert.equal(fs.existsSync(storage.databasePath),false);storage.closeStorage();console.log(JSON.stringify({remote:true,localDbAbsent:true,backupIntegrity:true,reopened:true}));`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:process.cwd(),windowsHide:true,env:{...process.env,BONDTRACE_DEPLOYMENT:'local',BONDTRACE_NETWORK:'localnet',BONDTRACE_STORAGE_BACKEND:'postgres',BONDTRACE_DATABASE_TLS:'local-only',BONDTRACE_DATABASE_NAMESPACE:namespace,DATABASE_URL:endpoint!,BONDTRACE_DATA_DIR:directory}});
 let output='',errors='';child.stdout.on('data',part=>output+=String(part));child.stderr.on('data',part=>errors+=String(part));
 const code=await new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('PG facade worker timeout'));},45000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',value=>{clearTimeout(timer);resolve(value);});});
 assert.equal(code,0,errors);assert.equal(JSON.parse(output).backupIntegrity,true);
});
