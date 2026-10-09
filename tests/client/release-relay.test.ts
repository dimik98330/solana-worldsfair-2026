import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {generateKeyPairSigner} from '@solana/kit';
import {programRpc} from './helpers/program-rpc.ts';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/release-relay-'+crypto.randomUUID());
const [{buildTransaction,submitPrepared,execute},{rememberPrepared,findPrepared},{instruction},{signatureOf,AppError}]=await Promise.all([import('../../server/transactions.ts'),import('../../server/prepared.ts'),import('../../packages/client/src/program.ts'),import('../../server/rpc.ts')]);
const originalFetch=globalThis.fetch;let mode='good',sends=0,reads=0,nonce=1,beforeGenesis=()=>{};
globalThis.fetch=async(_input,init)=>{
 const request=JSON.parse(String(init?.body));let result:any=programRpc(request);
 if(result!==undefined){reads++;if(mode==='wrong'){
  const values=Array.isArray(result.value)?result.value:[result.value];for(const item of values)if(item&&!item.executable){const data=Buffer.from(item.data[0],'base64');data.writeBigUInt64LE(2n,4);if(data.length>45)data[45]^=1;item.data[0]=data.toString('base64');}
 }return Response.json({jsonrpc:'2.0',id:request.id,result});}
 switch(request.method){
  case 'getGenesisHash':beforeGenesis();result='11111111111111111111111111111111';break;
  case 'getLatestBlockhash':result={context:{slot:100},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}};break;
  case 'simulateTransaction':result={context:{slot:100},value:{err:null,unitsConsumed:1000,logs:[]}};break;
  case 'getFeeForMessage':result={context:{slot:100},value:5000};break;
  case 'sendTransaction':assert.equal(request.params[1].maxRetries,5,'Bounded validator retries use the exact originally signed bytes, not a new message');sends++;result=signatureOf(request.params[0]);break;
  case 'getSignatureStatuses':result={context:{slot:100},value:[{slot:99,err:null,confirmationStatus:'confirmed'}]};break;
  default:throw new Error('Unexpected isolated RPC '+request.method);
 }return Response.json({jsonrpc:'2.0',id:request.id,result});
};
after(()=>{globalThis.fetch=originalFetch;});
async function reviewed(){mode='good';const signer=await generateKeyPairSigner(),built=await buildTransaction([instruction('release_fixture',[],Uint8Array.of(nonce++))],signer.address,[signer]);const id=rememberPrepared(built.transactionBase64,{action:'release_fixture',wallet:signer.address,lastValidBlockHeight:built.lastValidBlockHeight,programRelease:built.programRelease});return {built,id};}
test('program release mismatch stops generated signing before any private-key signature',async()=>{
 mode='wrong';const signer=await generateKeyPairSigner(),sign=crypto.subtle.sign.bind(crypto.subtle);let signatures=0;
 crypto.subtle.sign=(async(...args:Parameters<SubtleCrypto['sign']>)=>{signatures++;return sign(...args);}) as SubtleCrypto['sign'];
 try{await assert.rejects(buildTransaction([instruction('release_fixture',[])],signer.address,[signer]),(e:any)=>e instanceof AppError&&e.code==='PROGRAM_IDENTITY_MISMATCH');assert.equal(signatures,0);assert.equal(sends,0);}finally{crypto.subtle.sign=sign;mode='good';}
});
test('upgrade after unsigned review blocks first relay and does not create a signed recovery record',async()=>{
 const {built,id}=await reviewed();mode='wrong';const before=sends;
 await assert.rejects(submitPrepared(built.transactionBase64),(e:any)=>e.code==='PROGRAM_IDENTITY_MISMATCH');assert.equal(sends,before);assert.equal(findPrepared(id)?.signature,undefined);
});
test('late wallet first relay rechecks storage budget after preparation and cannot bind/send when low',async()=>{
 const {built,id}=await reviewed(),before=sends,previous=process.env.BONDTRACE_RUNTIME_MIN_FREE_MB;
 process.env.BONDTRACE_RUNTIME_MIN_FREE_MB='999999';
 try{await assert.rejects(submitPrepared(built.transactionBase64),(e:any)=>e.code==='RUNTIME_DISK_LOW');assert.equal(sends,before);assert.equal(findPrepared(id)?.signature,undefined);}
 finally{if(previous===undefined)delete process.env.BONDTRACE_RUNTIME_MIN_FREE_MB;else process.env.BONDTRACE_RUNTIME_MIN_FREE_MB=previous;}
});
test('missing or changed review release cannot relay even when current deployment is valid',async()=>{
 const {built,id}=await reviewed();const record=findPrepared(id)!;
 const {journalWrite}=await import('../../server/journal.ts');journalWrite('prepared',id,{...record,programRelease:undefined});
 await assert.rejects(submitPrepared(built.transactionBase64),(e:any)=>e.code==='PREPARATION_VERSION_UNBOUND');
 journalWrite('prepared',id,{...record,programRelease:{...record.programRelease!,sha256:'0'.repeat(64)}});
 await assert.rejects(submitPrepared(built.transactionBase64),(e:any)=>e.code==='PREPARATION_VERSION_CHANGED');assert.equal(findPrepared(id)?.signature,undefined);
});
test('already-signed operation recovers its original receipt during program mismatch without re-relay',async()=>{
 const {built,id}=await reviewed(),first=await submitPrepared(built.transactionBase64);assert.equal(first.status,'confirmed');assert.equal(findPrepared(id)?.programRelease?.sha256,built.programRelease.sha256);
 mode='wrong';const beforeSends=sends,beforeReads=reads,recovered=await submitPrepared(built.transactionBase64);
 assert.equal(recovered.signature,first.signature);assert.equal(recovered.status,'confirmed');assert.equal(sends,beforeSends);assert.equal(reads,beforeReads);
});
test('a wallet review of a message already sent by the generated executor attaches to the existing receipt without another send',async()=>{
 mode='good';const signer=await generateKeyPairSigner(),ix=instruction('cross_mode_fixture',[],Uint8Array.of(nonce++));
 const built=await buildTransaction([ix],signer.address,[signer]);const id=rememberPrepared(built.transactionBase64,{action:'cross_mode_fixture',wallet:signer.address,lastValidBlockHeight:built.lastValidBlockHeight,programRelease:built.programRelease});
 const first=await execute([ix],signer,'cross_mode_fixture');assert.equal(first.status,'confirmed');
 mode='wrong';const before=sends,result=await submitPrepared(built.transactionBase64);assert.equal(sends,before);assert.equal(result.signature,first.signature);assert.equal(findPrepared(id)?.signature,first.signature);assert.equal(result.status,'confirmed');
});
test('a concurrent sender retaining the same signature during release verification cannot be overwritten or relayed again',async()=>{
 const {built,id}=await reviewed(),prepared=findPrepared(id)!,signature=signatureOf(built.transactionBase64);
 const {saveReceipt,receipt}=await import('../../server/journal.ts'),before=sends;
 beforeGenesis=()=>{beforeGenesis=()=>{};saveReceipt({signature,action:prepared.action,wallet:prepared.wallet,bond:prepared.bond,network:'localnet',genesisHash:built.programRelease.genesisHash,programRelease:built.programRelease,chainStatus:'confirmed',projectionStatus:'complete',operationId:'original-generated-child',submittedAt:new Date().toISOString(),slot:99});};
 const result=await submitPrepared(built.transactionBase64);assert.equal(result.signature,signature);assert.equal(result.status,'confirmed');assert.equal(sends,before);assert.equal(receipt(signature)?.operationId,'original-generated-child');assert.equal(findPrepared(id)?.signature,signature);
});
test('a different concurrent receipt context fails closed without overwriting its original owner',async()=>{
 const {built,id}=await reviewed(),signature=signatureOf(built.transactionBase64),before=sends;const {saveReceipt,receipt}=await import('../../server/journal.ts');
 beforeGenesis=()=>{beforeGenesis=()=>{};saveReceipt({signature,action:'foreign-context',wallet:'11111111111111111111111111111111',network:'localnet',genesisHash:built.programRelease.genesisHash,chainStatus:'confirmed',projectionStatus:'complete',submittedAt:new Date().toISOString(),slot:99});};
 await assert.rejects(submitPrepared(built.transactionBase64),(e:any)=>e.code==='MESSAGE_ALREADY_SUBMITTED');assert.equal(sends,before);assert.equal(receipt(signature)?.action,'foreign-context');assert.equal(findPrepared(id)?.signature,undefined);
});
test('an immutable parent release is enforced before generated signing even when another valid release is currently selected',async()=>{
 mode='good';const signer=await generateKeyPairSigner(),sign=crypto.subtle.sign.bind(crypto.subtle);let signatures=0;
 crypto.subtle.sign=(async(...args:Parameters<SubtleCrypto['sign']>)=>{signatures++;return sign(...args);}) as SubtleCrypto['sign'];
 try{await assert.rejects(buildTransaction([instruction('plan_fixture',[])],signer.address,[signer],0,{programId:(await import('../../packages/client/src/program.ts')).PROGRAM_ID,sha256:'b'.repeat(64),genesisHash:'11111111111111111111111111111111'}),(e:any)=>e.code==='PROGRAM_RELEASE_CHANGED');assert.equal(signatures,0);}finally{crypto.subtle.sign=sign;}
});
