import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PostgresDocumentStore} from '../../server/postgres-document-store.ts';
import {postgresPolicy} from '../../server/postgres-policy.ts';
const target=process.env.BONDTRACE_TEST_PG_URL;
if(target){const url=new URL(target);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'32545');assert.equal(url.pathname,'/bondtrace_tests');}
test('real PG Worker bridge preserves nested rollback, acknowledged cache and process reopen',{skip:!target},()=>{
 const url=new URL(target!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'32545');assert.equal(url.pathname,'/bondtrace_tests');
 const options=postgresPolicy({DATABASE_URL:target!,BONDTRACE_DATABASE_TLS:'local-only',BONDTRACE_DATABASE_NAMESPACE:'bridge_'+crypto.randomUUID().replaceAll('-','')},'localnet','B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8');
 const first=new PostgresDocumentStore(options);
 try{
  const before=first.diagnostics();assert.throws(()=>first.transactionSync(()=>{first.write('fixture.json','{"units":"uncommitted"}');throw Error('first-claim-rollback');}),/first-claim-rollback/);
  assert.equal(first.read('fixture.json'),undefined);assert.equal(first.diagnostics().observedGeneration,before.observedGeneration);assert.equal(first.diagnostics().ownedGeneration,null);
  first.transactionSync(()=>{first.write('fixture.json','{"units":"9007199254740993"}');assert.throws(()=>first.transactionSync(()=>{first.write('fixture.json','{"units":"0"}');throw Error('inner');}),/inner/);assert.equal(first.read('fixture.json'),'{"units":"9007199254740993"}');first.write('activity.json','[]');});
  assert.equal(first.read('fixture.json'),'{"units":"9007199254740993"}');assert.equal(first.assertWritable().verified,true);
  assert.throws(()=>first.transactionSync(()=>{first.write('activity.json','[1]');throw Error('outer');}),/outer/);assert.equal(first.read('activity.json'),'[]');
 }finally{first.close();}
 const restored=new PostgresDocumentStore(options);try{assert.equal(restored.read('fixture.json'),'{"units":"9007199254740993"}');assert.equal(restored.read('activity.json'),'[]');assert.equal(restored.diagnostics().backend,'postgres');}finally{restored.close();}
});
test('an acknowledged engine rollback preserves the original capacity error and permits a small commit',{skip:!target},()=>{
 const options=postgresPolicy({DATABASE_URL:target!,BONDTRACE_DATABASE_TLS:'local-only',BONDTRACE_DATABASE_NAMESPACE:'limits_'+crypto.randomUUID().replaceAll('-','')},'localnet','B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8');options.maxSnapshotBytes=1024;
 const store=new PostgresDocumentStore(options);try{
  const before=store.diagnostics();
  assert.throws(()=>store.write('fixture.json',JSON.stringify('x'.repeat(940))),error=>!!error&&typeof error==='object'&&'code' in error&&error.code==='STORAGE_LIMIT');
  assert.equal(store.read('fixture.json'),undefined);assert.equal(store.diagnostics().primaryDataSha256,before.primaryDataSha256);assert.equal(store.diagnostics().ownedGeneration,null);
  store.write('fixture.json','{"ok":true}');assert.equal(store.read('fixture.json'),'{"ok":true}');assert.equal(store.assertWritable().verified,true);
 }finally{store.close();}
});
