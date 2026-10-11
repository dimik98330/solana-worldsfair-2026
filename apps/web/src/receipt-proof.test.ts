import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedPaymentTransaction} from './receipt-match';
test('confirmed and finalized retained proofs keep exact identity; weaker or mismatched proofs are rejected',()=>{
 const entry={matchesStoredReceipt:true,proof:{signature:'exact-signature',commitment:'finalized',slot:10,accountKeys:['snapshot'],preTokenBalances:[],postTokenBalances:[]}};
 for(const commitment of ['confirmed','finalized']){
  const result=retainedPaymentTransaction({...entry,proof:{...entry.proof,commitment}},'exact-signature');assert.equal(result?.slot,10);assert.deepEqual(result?.transaction.signatures,['exact-signature']);
 }
 assert.equal(retainedPaymentTransaction(entry,'other-signature'),null);
 assert.equal(retainedPaymentTransaction({...entry,matchesStoredReceipt:false},'exact-signature'),null);
 assert.equal(retainedPaymentTransaction({...entry,proof:{...entry.proof,commitment:'processed'}},'exact-signature'),null);
 assert.equal(retainedPaymentTransaction(null,'exact-signature'),null);
});
