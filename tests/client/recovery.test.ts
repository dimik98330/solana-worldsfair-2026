import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {generateKeyPairSigner} from '@solana/kit';
// Isolated synthetic RPC transport tests. Never write fake receipts to the application fixture.
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/transport-'+crypto.randomUUID());
const [{execute,buildTransaction,submitPrepared},{instruction},{beginOperation,updateOperation,operationStatus},{rememberPrepared,findPrepared},{saveFixture,fixture},{signatureOf,AppError}]=await Promise.all([
  import('../../server/transactions.ts'),import('../../packages/client/src/program.ts'),import('../../server/operations.ts'),import('../../server/prepared.ts'),import('../../server/store.ts'),import('../../server/rpc.ts')
]);
const originalFetch=globalThis.fetch;
type Mode='normal'|'send-loss'|'confirmation-loss'|'preflight'|'absent';
let mode:Mode='normal',reads=0,sendHook:(wire:string)=>void=()=>{};
globalThis.fetch=async (_input,init)=>{
  const request=JSON.parse(String(init?.body));let result:any;
  switch(request.method){
    case 'getLatestBlockhash':result={value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000},context:{slot:1}};break;
    case 'simulateTransaction':result={value:{err:null,unitsConsumed:1000,logs:[]},context:{slot:1}};break;
    case 'getFeeForMessage':result={value:5000,context:{slot:1}};break;
    case 'sendTransaction':sendHook(request.params[0]);if(mode==='send-loss')throw new TypeError('Synthetic response lost after acceptance');if(mode==='preflight')return Response.json({jsonrpc:'2.0',id:request.id,error:{code:-32002,message:'Synthetic definitive preflight rejection',data:{err:{InstructionError:[0,{Custom:6001}]}}}});result=signatureOf(request.params[0]);break;
    case 'getSignatureStatuses':reads++;if(mode==='confirmation-loss')throw new TypeError('Synthetic confirmation transport outage');result={value:[mode==='absent'?null:{err:null,slot:100,confirmationStatus:'confirmed'}],context:{slot:101}};break;
    case 'getBlockHeight':result=2000;break;
    default:throw new Error('Unexpected mocked RPC method '+request.method);
  }
  return Response.json({jsonrpc:'2.0',id:request.id,result});
};
after(()=>{globalThis.fetch=originalFetch;});
async function signed(actor:any,tag:number){return buildTransaction([instruction('cast_vote',[[actor.address,'sw']],Uint8Array.of(tag))],actor.address,[actor],0);}
test('ambiguous send retains its exact signature before network response and can recover',async()=>{
  const actor=await generateKeyPairSigner();const id=crypto.randomUUID();beginOperation(id,'test-only','test',{});mode='send-loss';
  sendHook=wire=>{const files=JSON.parse(fs.readFileSync(path.join(process.env.BONDTRACE_DATA_DIR!,'operations.json'),'utf8'));assert.equal(files.find((x:any)=>x.id===id).signature,signatureOf(wire));};
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
