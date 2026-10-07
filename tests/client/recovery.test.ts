import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {generateKeyPairSigner,getTransactionDecoder,getTransactionEncoder} from '@solana/kit';
// Isolated synthetic RPC transport tests. Never write fake receipts to the application fixture.
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/transport-'+crypto.randomUUID());
const [{execute,buildTransaction,submitPrepared},{instruction},{beginOperation,updateOperation,operationStatus,findOperation},{rememberPrepared,findPrepared},{saveFixture,fixture},{signatureOf,AppError,transactionStatus,validTransactionError}]=await Promise.all([
  import('../../server/transactions.ts'),import('../../packages/client/src/program.ts'),import('../../server/operations.ts'),import('../../server/prepared.ts'),import('../../server/store.ts'),import('../../server/rpc.ts')
]);
const originalFetch=globalThis.fetch;
type Mode='normal'|'send-loss'|'confirmation-loss'|'preflight'|'absent'|'processed-error';
let mode:Mode='normal',reads=0,sendHook:(wire:string)=>void=()=>{};
globalThis.fetch=async (_input,init)=>{
  const request=JSON.parse(String(init?.body));let result:any;
  switch(request.method){
    case 'getGenesisHash':result='11111111111111111111111111111111';break;
    case 'getLatestBlockhash':result={value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000},context:{slot:1}};break;
    case 'simulateTransaction':result={value:{err:null,unitsConsumed:1000,logs:[]},context:{slot:1}};break;
    case 'getFeeForMessage':result={value:5000,context:{slot:1}};break;
    case 'sendTransaction':sendHook(request.params[0]);if(mode==='send-loss')throw new TypeError('Synthetic response lost after acceptance');if(mode==='preflight')return Response.json({jsonrpc:'2.0',id:request.id,error:{code:-32002,message:'Synthetic definitive preflight rejection',data:{err:{InstructionError:[0,{Custom:6001}]}}}});result=signatureOf(request.params[0]);break;
    case 'getSignatureStatuses':reads++;if(mode==='confirmation-loss')throw new TypeError('Synthetic confirmation transport outage');result={value:[mode==='absent'||mode==='preflight'?null:{err:mode==='processed-error'?{InstructionError:[0,{Custom:6001}]}:null,slot:100,confirmationStatus:mode==='processed-error'?'processed':'confirmed'}],context:{slot:101}};break;
    case 'getBlockHeight':result=2000;break;
    default:throw new Error('Unexpected mocked RPC method '+request.method);
  }
  return Response.json({jsonrpc:'2.0',id:request.id,result});
};
after(()=>{globalThis.fetch=originalFetch;});
async function signed(actor:any,tag:number){return buildTransaction([instruction('cast_vote',[[actor.address,'sw']],Uint8Array.of(tag))],actor.address,[actor],0);}
test('ambiguous send retains its exact signature before network response and can recover',async()=>{
  const actor=await generateKeyPairSigner();const id=crypto.randomUUID();beginOperation(id,'test-only','test',{});mode='send-loss';
  sendHook=wire=>{assert.equal(findOperation(id)?.signature,signatureOf(wire));};
  await assert.rejects(execute([instruction('cast_vote',[[actor.address,'sw']],Uint8Array.of(1))],actor,'test-only',[],undefined,sig=>updateOperation(id,{signature:sig,status:'pending'})),(error:any)=>error instanceof AppError&&error.code==='UNKNOWN_STATUS');
  mode='normal';sendHook=()=>{};assert.equal((await operationStatus(id)).status,'confirmed');
});
test('confirmation-read outage remains UNKNOWN_STATUS with recoverable prepared signature',async()=>{
  const actor=await generateKeyPairSigner();mode='normal';const value=await signed(actor,2);const id=rememberPrepared(value.transactionBase64,{action:'test-only',wallet:actor.address,lastValidBlockHeight:value.lastValidBlockHeight});mode='confirmation-loss';
  await assert.rejects(submitPrepared(value.transactionBase64),(error:any)=>error instanceof AppError&&error.code==='UNKNOWN_STATUS');assert.ok(findPrepared(id)?.signature);mode='normal';assert.equal((await operationStatus(id)).status,'confirmed');
});
test('definitive rejection is terminal; unavailable receipt after lifetime remains unknown',async()=>{
  const actor=await generateKeyPairSigner();mode='normal';let value=await signed(actor,3);let id=rememberPrepared(value.transactionBase64,{action:'test-only',wallet:actor.address,lastValidBlockHeight:value.lastValidBlockHeight});mode='preflight';await assert.rejects(submitPrepared(value.transactionBase64));assert.equal((await operationStatus(id)).status,'error');
  mode='normal';value=await signed(actor,4);id=rememberPrepared(value.transactionBase64,{action:'test-only',wallet:actor.address,lastValidBlockHeight:1000});mode='send-loss';await assert.rejects(submitPrepared(value.transactionBase64));mode='absent';assert.equal((await operationStatus(id)).status,'unknown');mode='normal';
});
test('confirmed prepared proposal is discoverable in the selected fixture',async()=>{
  const actor=await generateKeyPairSigner();mode='normal';saveFixture({seriesId:'1',bond:actor.address,name:'Synthetic test fixture',settlementMint:actor.address,createdAt:new Date().toISOString(),rateBps:1000,couponFrequency:2,roles:{issuer:actor.address},proposalIds:[],complete:true,accelerated:true});const value=await signed(actor,5);rememberPrepared(value.transactionBase64,{action:'create_vote',wallet:actor.address,bond:actor.address,params:{proposalId:'3'},lastValidBlockHeight:1000});await submitPrepared(value.transactionBase64);assert.deepEqual(fixture()?.proposalIds,['3']);
});

test('unsigned or cryptographically invalid signatures cannot poison a prepared recovery record',async()=>{
  mode='normal';const actor=await generateKeyPairSigner();
  const unsigned=await buildTransaction([instruction('signature_fixture',[])],actor.address);
  const id=rememberPrepared(unsigned.transactionBase64,{action:'signature_fixture',wallet:actor.address,lastValidBlockHeight:unsigned.lastValidBlockHeight});
  await assert.rejects(()=>submitPrepared(unsigned.transactionBase64),(error:unknown)=>error instanceof AppError&&error.code==='INVALID_SIGNATURE');
  assert.equal(findPrepared(id)?.signature,undefined);
  const valid=await buildTransaction([instruction('signature_fixture',[])],actor.address,[actor]);
  const decoded=getTransactionDecoder().decode(Buffer.from(valid.transactionBase64,'base64'));
  const signature=Uint8Array.from(decoded.signatures[actor.address]!);signature[0]^=1;
  const forged=Buffer.from(getTransactionEncoder().encode({...decoded,signatures:{...decoded.signatures,[actor.address]:signature as any}})).toString('base64');
  await assert.rejects(()=>submitPrepared(forged),(error:unknown)=>error instanceof AppError&&error.code==='INVALID_SIGNATURE');
  assert.equal(findPrepared(id)?.signature,undefined);
});

test('a merely processed error remains pending until the selected confirmed commitment',async()=>{
  const actor=await generateKeyPairSigner();mode='normal';const value=await signed(actor,6),signature=signatureOf(value.transactionBase64);
  mode='processed-error';assert.equal((await transactionStatus(signature)).status,'pending');
  mode='normal';assert.equal((await transactionStatus(signature)).status,'confirmed');
});

test('only actual bounded RPC transaction-error variants can become a definitive rejection',()=>{
  for(const value of [undefined,false,0,{}, {bogus:true}, 'arbitrary', {InstructionError:[-1,'InvalidArgument']},{InstructionError:[0,{Custom:-1}]},{InstructionError:[0,{Custom:4294967296}]},{InsufficientFundsForRent:{account_index:-1}}])assert.equal(validTransactionError(value),false);
  for(const value of [null,'BlockhashNotFound',{InstructionError:[0,{Custom:6001}]},{InstructionError:[2,'InvalidArgument']},{DuplicateInstruction:1},{InsufficientFundsForRent:{account_index:2}}])assert.equal(validTransactionError(value),true);
});

test('a distinct demo intent cannot silently reuse an earlier identical signed message in the same blockhash',async()=>{
  mode='normal';const actor=await generateKeyPairSigner(),first=crypto.randomUUID(),second=crypto.randomUUID();let sends=0;sendHook=()=>{sends++;};
  beginOperation(first,'repeat_fixture','test',{});beginOperation(second,'repeat_fixture','test',{});
  const ix=instruction('repeat_fixture',[[actor.address,'sw']],Uint8Array.of(8));
  await execute([ix],actor,'repeat_fixture',[],undefined,sig=>updateOperation(first,{signature:sig,status:'pending'}));
  await assert.rejects(()=>execute([ix],actor,'repeat_fixture',[],undefined,sig=>updateOperation(second,{signature:sig,status:'pending'})),error=>error instanceof AppError&&error.code==='MESSAGE_ALREADY_SUBMITTED');
  assert.equal(sends,1);assert.ok(findOperation(first)?.signature);assert.equal(findOperation(second)?.signature,undefined);sendHook=()=>{};
});
