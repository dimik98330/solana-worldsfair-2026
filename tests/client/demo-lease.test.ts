import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/demo-lease-'+crypto.randomUUID());
const [{beginOperation,claimDemoOperation,assertDemoLease,findOperation,updateOperation},{closeStorage}]=await Promise.all([import('../../server/operations.ts'),import('../../server/storage.ts')]);
const moduleUrl=pathToFileURL(path.resolve('server/operations.ts')).href;
function child(id:string){return new Promise<any>((resolve,reject)=>{const processHandle=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',`const m=await import(${JSON.stringify(moduleUrl)});const c=m.claimDemoOperation(${JSON.stringify(id)},'fixture','test',{amount:'1'});console.log(JSON.stringify(c));`],{cwd:process.cwd(),env:{...process.env},windowsHide:true});let stdout='',stderr='';processHandle.stdout.on('data',b=>stdout+=b);processHandle.stderr.on('data',b=>stderr+=b);processHandle.on('error',reject);processHandle.on('close',code=>{try{assert.equal(code,0,stderr);resolve(JSON.parse(stdout));}catch(e){reject(e);}});});}

test('an unsigned orphan can resume the same intent, while a replaced owner is fenced before relay',()=>{
 const id='orphan_'+crypto.randomUUID();beginOperation(id,'fixture','test',{amount:'1'});
 const first=claimDemoOperation(id,'fixture','test',{amount:'1'});assert.equal(first.claimed,true);assertDemoLease(id,first.owner!);
 assert.equal(claimDemoOperation(id,'fixture','test',{amount:'1'}).claimed,false);
 updateOperation(id,{lease:{owner:first.owner!,expiresAt:0}});
 const next=claimDemoOperation(id,'fixture','test',{amount:'1'});assert.equal(next.claimed,true);assert.notEqual(next.owner,first.owner);
 assert.throws(()=>assertDemoLease(id,first.owner!),e=>(e as any).code==='OPERATION_LEASE_CHANGED');assertDemoLease(id,next.owner!);
 assert.throws(()=>claimDemoOperation(id,'fixture','test',{amount:'2'}),e=>(e as any).code==='OPERATION_CONFLICT');
});
test('a signed reference is never claimed again even after its unsigned lease expires',()=>{
 const id='signed_'+crypto.randomUUID(),first=claimDemoOperation(id,'fixture','test',{amount:'1'});
 // An isolated synthetic reference, never submitted or included in live evidence.
 updateOperation(id,{signature:'1'.repeat(64),lease:{owner:first.owner!,expiresAt:0}});
 assert.equal(claimDemoOperation(id,'fixture','test',{amount:'1'}).claimed,false);
 assert.throws(()=>assertDemoLease(id,first.owner!),e=>(e as any).code==='OPERATION_LEASE_CHANGED');
});
test('four simultaneous processes claim an unsigned orphan exactly once',async()=>{
 const id='race_'+crypto.randomUUID();beginOperation(id,'fixture','test',{amount:'1'});closeStorage();
 const values=await Promise.all(Array.from({length:4},()=>child(id)));assert.equal(values.filter(v=>v.claimed).length,1);
 const winner=values.find(v=>v.claimed);assert.equal(findOperation(id)?.lease?.owner,winner.owner);
});
test('process restart can claim an expired unsigned lease without inventing a receipt',async()=>{
 const id='restart_'+crypto.randomUUID(),first=claimDemoOperation(id,'fixture','test',{amount:'1'});
 updateOperation(id,{lease:{owner:first.owner!,expiresAt:0}});closeStorage();
 const next=await child(id);assert.equal(next.claimed,true);assert.notEqual(next.owner,first.owner);assert.equal(findOperation(id)?.signature,undefined);
});
