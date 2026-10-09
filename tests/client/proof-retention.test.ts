import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {getBase58Decoder} from '@solana/kit';
import type {TransactionProof,TransactionProofResult} from '../../server/transaction-proof.ts';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/proof-retention-'+crypto.randomUUID());
const [{captureRetainedProof,publicExecutionProof},{saveReceipt,receipt,updateReceipt}]=await Promise.all([import('../../server/proof-retention.ts'),import('../../server/journal.ts')]);
const genesis='11111111111111111111111111111111';let sequence=0;
function seed(){const signature=getBase58Decoder().decode(new Uint8Array(64).fill(++sequence));saveReceipt({signature,action:'synthetic-proof-retention',network:'localnet',genesisHash:genesis,chainStatus:'confirmed',projectionStatus:'complete',submittedAt:new Date().toISOString(),slot:9,signedTransactionBase64:'synthetic-known-wire'});return signature;}
// Validation has its own RPC/cryptography tests. These injected payloads test only storage fencing.
function proof(signature:string):TransactionProof{return {schemaVersion:1,source:'retained-confirmed-rpc-transaction',signature,genesisHash:genesis,slot:9,blockTime:null,capturedAt:new Date().toISOString(),commitment:'confirmed',version:0,genesisScope:'caller-confirmed-context-not-returned-by-getTransaction',transactionSha256:'a'.repeat(64),messageSha256:'b'.repeat(64),wireBytes:100,expectedWireMatched:true,feeLamports:'1',computeUnitsConsumed:null,accountKeys:[genesis],preBalances:['10'],postBalances:['9'],preTokenBalances:[],postTokenBalances:[],independentAttestation:false};}
test('confirmed status survives an explicit proof gap and ordinary reads do not retry indefinitely',async()=>{
 const signature=seed();let calls=0;const reader=async()=>{calls++;return {status:'unavailable',code:'TRANSACTION_HISTORY_UNAVAILABLE',message:'Synthetic pruned history',attemptedAt:new Date().toISOString()} as const;};
 await captureRetainedProof(signature,false,reader);await captureRetainedProof(signature,false,reader);assert.equal(calls,1);assert.equal(receipt(signature)?.chainStatus,'confirmed');assert.equal(receipt(signature)?.proofCapture?.status,'unavailable');assert.equal(publicExecutionProof(receipt(signature))?.proof,null);
 await captureRetainedProof(signature,true,async input=>{assert.equal(input.expectedWireBase64,'synthetic-known-wire');return {status:'captured',proof:proof(signature)};});assert.equal(receipt(signature)?.proofCapture?.status,'captured');assert.equal(publicExecutionProof(receipt(signature))?.matchesStoredReceipt,true);
});
test('concurrent automatic capture has one owner and explicit retry fences a late response',async()=>{
 const signature=seed();let finish!:(value:TransactionProofResult)=>void,calls=0;
 const first=captureRetainedProof(signature,false,async()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 await captureRetainedProof(signature,false,async()=>{calls++;return {status:'captured',proof:proof(signature)};});assert.equal(calls,1);
 await captureRetainedProof(signature,true,async()=>({status:'unavailable',code:'SYNTHETIC_RETRY_GAP',message:'Explicit retry gap',attemptedAt:new Date().toISOString()}));
 finish({status:'captured',proof:proof(signature)});await first;assert.equal(receipt(signature)?.transactionProof,undefined);assert.equal(receipt(signature)?.proofCapture?.code,'SYNTHETIC_RETRY_GAP');
});
test('a changed receipt context cannot attach late proof and retained historical proof is never mislabeled current',async()=>{
 const signature=seed();await captureRetainedProof(signature,false,async()=>{updateReceipt(signature,{slot:10});return {status:'captured',proof:proof(signature)};});assert.equal(receipt(signature)?.transactionProof,undefined);assert.equal(receipt(signature)?.proofCapture?.code,'PROOF_CONTEXT_CHANGED');
 const second=seed();await captureRetainedProof(second,false,async()=>({status:'captured',proof:proof(second)}));updateReceipt(second,{chainStatus:'error'});assert.equal(publicExecutionProof(receipt(second))?.matchesStoredReceipt,false);assert.ok(publicExecutionProof(receipt(second))?.proof);assert.equal(receipt(second)?.chainStatus,'error');
});
test('unconfirmed or unbound receipts are not archived as successful execution',async()=>{
 const signature=seed();updateReceipt(signature,{chainStatus:'unknown'});let calls=0;const reader=async()=>{calls++;return {status:'captured',proof:proof(signature)} as const;};await captureRetainedProof(signature,true,reader);assert.equal(calls,0);updateReceipt(signature,{chainStatus:'confirmed',genesisHash:null});await captureRetainedProof(signature,true,reader);assert.equal(calls,0);
});
