import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {getAddressDecoder,getBase58Decoder} from '@solana/kit';
import type {CurrentTransactionProof,LegacyTransactionProof} from '../../server/transaction-proof.ts';

// Isolated synthetic provider/storage fixtures; never use the application ledger.
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/finality-'+crypto.randomUUID());
process.env.BONDTRACE_NETWORK='localnet';
const [{transactionStatus,AppError},{receipt,saveReceipt,updateReceipt},{captureRetainedProof,publicExecutionProof},{beginOperation,updateOperation,findOperation,operationStatus}]=await Promise.all([
 import('../../server/rpc.ts'),import('../../server/journal.ts'),import('../../server/proof-retention.ts'),import('../../server/operations.ts')
]);
const key=(id:number)=>String(getAddressDecoder().decode(new Uint8Array(32).fill(id)));
const originalFetch=globalThis.fetch,originalGenesis=key(7);
let genesis=originalGenesis,sequence=0,statusValue:any=null,contextSlot=200,historyRequests:string[]=[],genesisAfterRead=false;
const nextSignature=()=>getBase58Decoder().decode(new Uint8Array(64).fill(++sequence));
const value=(confirmationStatus:'processed'|'confirmed'|'finalized'|null,err:any=null,slot=100)=>({slot,err,confirmationStatus,confirmations:confirmationStatus==='finalized'?null:1});
const code=(expected:string)=>(error:unknown)=>error instanceof AppError&&error.code===expected&&!error.definitive;
function reset(){genesis=originalGenesis;statusValue=null;contextSlot=200;historyRequests=[];genesisAfterRead=false;}
globalThis.fetch=async(_input,init)=>{
 const request=JSON.parse(String(init?.body));let result:unknown;
 switch(request.method){
  case 'getGenesisHash':result=genesis;break;
  case 'getSignatureStatuses':result={context:{slot:contextSlot},value:[statusValue]};if(genesisAfterRead)genesis=key(8);break;
  case 'getTransaction':historyRequests.push(request.params[1].commitment);result=null;break;
  case 'getBlockHeight':result=2000;break;
  default:throw new Error('Unexpected finality fixture RPC '+request.method);
 }
 return Response.json({jsonrpc:'2.0',id:request.id,result});
};
after(()=>{globalThis.fetch=originalFetch;});
function seed(signature=nextSignature()){
 saveReceipt({signature,action:'finality-fixture',network:'localnet',genesisHash:originalGenesis,chainStatus:'pending',projectionStatus:'pending',submittedAt:new Date().toISOString(),lastValidBlockHeight:1000});return signature;
}
function legacyProof(signature:string):LegacyTransactionProof{
 return {schemaVersion:1,source:'retained-confirmed-rpc-transaction',signature,genesisHash:originalGenesis,slot:100,blockTime:null,capturedAt:new Date().toISOString(),commitment:'confirmed',version:0,
 genesisScope:'caller-confirmed-context-not-returned-by-getTransaction',transactionSha256:'a'.repeat(64),messageSha256:'b'.repeat(64),wireBytes:100,expectedWireMatched:true,feeLamports:'1',computeUnitsConsumed:null,accountKeys:[originalGenesis],preBalances:['10'],postBalances:['9'],preTokenBalances:[],postTokenBalances:[],independentAttestation:false};
}
function finalizedProof(signature:string):CurrentTransactionProof{
 const prior=legacyProof(signature);
 return {...prior,schemaVersion:2,source:'retained-finalized-rpc-transaction',commitment:'finalized',provenance:{source:'live-rpc',method:'getTransaction',requestedCommitment:'finalized',observedAt:prior.capturedAt}};
}

test('processed → confirmed → finalized → pruned keeps actual finality separate from business confirmation',async()=>{
 reset();const signature=seed();
 statusValue=value('processed');let result=await transactionStatus(signature);
 assert.equal(result.status,'pending');assert.equal(result.finality.status,'processed');assert.equal(result.finality.source,'live-rpc');assert.equal(historyRequests.length,0);
 statusValue=value('confirmed');contextSlot++;result=await transactionStatus(signature);
 assert.equal(result.status,'confirmed');assert.equal(result.finality.status,'confirmed');assert.equal(result.finality.signature,signature);assert.equal(result.finality.slot,100);assert.equal(result.finality.contextSlot,201);assert.ok(result.finality.observedAt);assert.deepEqual(historyRequests,['confirmed']);
 statusValue=value('finalized');contextSlot++;result=await transactionStatus(signature);
 assert.equal(result.status,'confirmed');assert.equal(result.finality.status,'finalized');assert.equal(result.finality.source,'live-rpc');assert.deepEqual(historyRequests,['confirmed','finalized']);
 const observed=structuredClone(result.finality);statusValue=null;contextSlot++;
 result=await transactionStatus(signature);
 assert.equal(result.status,'confirmed');assert.equal(result.verification,'recorded-confirmation');assert.deepEqual(result.finality,{...observed,source:'retained-observation'});assert.deepEqual(historyRequests,['confirmed','finalized']);
 assert.equal(receipt(signature)?.chainStatus,'confirmed');assert.equal(receipt(signature)?.finality?.status,'finalized');
});

test('pruned legacy confirmation and unbound receipt never infer finalized',async()=>{
 reset();const signature=seed();updateReceipt(signature,{chainStatus:'confirmed',slot:100,verification:'live-rpc'});
 let result=await transactionStatus(signature);assert.equal(result.status,'confirmed');assert.equal(result.finality.status,null);assert.equal(result.finality.source,'legacy-unknown');
 const unbound=seed();updateReceipt(unbound,{chainStatus:'confirmed',genesisHash:null,slot:100,verification:'legacy-unbound'});
 result=await transactionStatus(unbound);assert.equal(result.status,'unknown');assert.equal(result.finality.status,null);assert.equal(result.finality.genesisHash,null);assert.equal(receipt(unbound)?.genesisHash,null);
});

test('a processed execution error remains pending; confirmed/finalized error remains a retained rejection',async()=>{
 reset();const signature=seed(),error={InstructionError:[0,{Custom:6001}]};statusValue=value('processed',error);
 let result=await transactionStatus(signature);assert.equal(result.status,'pending');assert.equal(result.finality.status,'processed');
 statusValue=value('confirmed',error);contextSlot++;result=await transactionStatus(signature);assert.equal(result.status,'error');assert.equal(result.finality.status,'confirmed');
 statusValue=value('finalized',error);contextSlot++;result=await transactionStatus(signature);assert.equal(result.status,'error');assert.equal(result.finality.status,'finalized');
 const saved=structuredClone(result.finality);statusValue=null;contextSlot++;result=await transactionStatus(signature);
 assert.equal(result.status,'error');assert.equal(result.verification,'recorded-rejection');assert.deepEqual(result.finality,{...saved,source:'retained-observation'});assert.deepEqual(historyRequests,[]);
});

test('malformed statuses and a forged retained binding fail closed without financial terminal updates',async()=>{
 reset();const signature=seed(),saved=structuredClone(receipt(signature));
 for(const bad of [value('finalized',null,201),{...value('confirmed'),err:false},{...value('finalized'),confirmations:3},{...value('confirmed'),confirmations:-1},{...value('confirmed'),status:{Err:{InstructionError:[0,{Custom:6001}]}}},{...value('confirmed'),confirmationStatus:'unknown'}]){
  statusValue=bad;await assert.rejects(()=>transactionStatus(signature),code('RPC_INVALID'));assert.deepEqual(receipt(signature),saved);
 }
 statusValue=value('confirmed');await transactionStatus(signature);const confirmed=receipt(signature)!;
 updateReceipt(signature,{finality:{...confirmed.finality!,signature:nextSignature()}});
 await assert.rejects(()=>transactionStatus(signature),code('RECEIPT_FINALITY_INVALID'));assert.equal(receipt(signature)?.chainStatus,'confirmed');
});

test('settled lower commitment, changed slot/context, or contradictory outcome preserves payment recovery',async()=>{
 reset();const signature=seed();statusValue=value('finalized');await transactionStatus(signature);
 const operationId='finality-operation-'+crypto.randomUUID();beginOperation(operationId,'finality-fixture','test',{});updateOperation(operationId,{signature,status:'confirmed',chainStatus:'confirmed',projectionStatus:'complete'});
 const saved=structuredClone(receipt(signature));
 for(const [bad,slot,expected]of [
  [value('confirmed'),201,'RPC_REGRESSION'],[value('processed'),201,'RPC_REGRESSION'],[value('finalized',null,101),201,'RPC_RECEIPT_CONFLICT'],
  [value('finalized',{InstructionError:[0,{Custom:6001}]}),201,'RPC_RECEIPT_CONFLICT'],[value('finalized'),199,'RPC_REGRESSION']
 ] as const){statusValue=bad;contextSlot=slot;await assert.rejects(()=>operationStatus(operationId),code(expected));assert.deepEqual(receipt(signature),saved);assert.equal(findOperation(operationId)?.status,'confirmed');assert.equal(findOperation(operationId)?.signature,signature);}
 statusValue=null;contextSlot=202;const recovered=await operationStatus(operationId);assert.equal(recovered.status,'confirmed');
 assert.ok('finality' in recovered);if(!('finality' in recovered))throw new Error('Expected receipt finality');assert.equal(recovered.finality?.source,'retained-observation');
});

test('a changed genesis before or during status query cannot attach a new observation',async()=>{
 reset();const signature=seed(),saved=structuredClone(receipt(signature));statusValue=value('confirmed');genesis=key(8);
 await assert.rejects(()=>transactionStatus(signature),code('CHAIN_IDENTITY_CHANGED'));assert.deepEqual(receipt(signature),saved);
 genesis=originalGenesis;genesisAfterRead=true;await assert.rejects(()=>transactionStatus(signature),code('CHAIN_IDENTITY_CHANGED'));assert.deepEqual(receipt(signature),saved);reset();
});

test('finalization capture upgrades v1 once, retains it on a gap, and rejects proof signature/commitment mismatches',async()=>{
 reset();const signature=seed();statusValue=value('finalized');await transactionStatus(signature);
 updateReceipt(signature,{transactionProof:legacyProof(signature)});let calls=0;
 const gap=async(input:any)=>{calls++;assert.equal(input.commitment,'finalized');return {status:'unavailable' as const,code:'TRANSACTION_HISTORY_UNAVAILABLE',message:'Synthetic finalized query absent',attemptedAt:new Date().toISOString()};};
 await captureRetainedProof(signature,true,gap);await captureRetainedProof(signature,false,gap);assert.equal(calls,1);assert.equal(receipt(signature)?.transactionProof?.schemaVersion,1);assert.equal(publicExecutionProof(receipt(signature))?.provenance?.commitment,'confirmed');
 await captureRetainedProof(signature,true,async()=>({status:'captured',proof:finalizedProof(nextSignature())}));assert.equal(receipt(signature)?.proofCapture?.code,'PROOF_CONTEXT_MISMATCH');assert.equal(receipt(signature)?.transactionProof?.schemaVersion,1);
 await captureRetainedProof(signature,true,async()=>({status:'captured',proof:legacyProof(signature)}));assert.equal(receipt(signature)?.proofCapture?.code,'PROOF_CONTEXT_MISMATCH');
 await captureRetainedProof(signature,true,async()=>({status:'captured',proof:finalizedProof(signature)}));assert.equal(receipt(signature)?.transactionProof?.schemaVersion,2);assert.equal(receipt(signature)?.transactionProof?.commitment,'finalized');
 const publicProof=publicExecutionProof(receipt(signature))!;assert.equal(publicProof.matchesStoredReceipt,true);assert.equal(publicProof.provenance?.source,'retained-observation');assert.equal(publicProof.finality.source,'retained-observation');
 await captureRetainedProof(signature,true,gap);assert.equal(calls,1);
});

test('retained proof display checks the transaction signature and does not relabel legacy evidence',()=>{
 reset();const signature=seed();updateReceipt(signature,{chainStatus:'confirmed',slot:100,transactionProof:legacyProof(nextSignature())});
 assert.equal(publicExecutionProof(receipt(signature))?.matchesStoredReceipt,false);assert.equal(publicExecutionProof(receipt(signature))?.finality.status,null);
});
