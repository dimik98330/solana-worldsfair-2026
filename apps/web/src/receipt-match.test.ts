import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPayment, maySignForHolder, type PublicTransaction, type PaymentSelection } from './receipt-match';
const selection:PaymentSelection={wallet:'holder',units:'10',amountMinor:'500000000',claimed:true,kind:'coupon',snapshotAddress:'snapshot'};
const receipt={signature:'signature',kind:'claim_coupon',status:'confirmed',time:'2026-10-08T00:00:00Z'};
const tx:PublicTransaction={slot:10,meta:{err:null,preTokenBalances:[{accountIndex:2,mint:'settlement',owner:'holder',uiTokenAmount:{amount:'999999999999999999'}}],postTokenBalances:[{accountIndex:2,mint:'settlement',owner:'holder',uiTokenAmount:{amount:'1000000000499999999'}}]},transaction:{signatures:['signature'],message:{accountKeys:['bond','snapshot','holder-ata']}}};
test('associate exact transfer with its beneficiary and recorded snapshot above Number precision',()=>assert.equal(matchesPayment(tx,receipt,selection,'settlement'),true));
test('do not associate receipt by amount alone, signer, order or different coupon',()=>{
  assert.equal(matchesPayment(tx,receipt,{...selection,wallet:'other'},'settlement'),false);
  assert.equal(matchesPayment(tx,receipt,{...selection,snapshotAddress:'different'},'settlement'),false);
  assert.equal(matchesPayment(tx,receipt,selection,'other-mint'),false);
  assert.equal(matchesPayment(tx,{...receipt,signature:'other'},selection,'settlement'),false);
  assert.equal(matchesPayment(tx,{...receipt,kind:'fund_vault'},selection,'settlement'),false);
  assert.equal(matchesPayment({...tx,meta:{...tx.meta,err:{failed:true}}},receipt,selection,'settlement'),false);
  assert.equal(matchesPayment(tx,{...receipt,slot:11},selection,'settlement'),false);
});
test('read-only holder selection never grants signer authority',()=>{
  assert.equal(maySignForHolder(undefined,'holder',true),false);
  assert.equal(maySignForHolder('other','holder',true),false);
  assert.equal(maySignForHolder('holder','holder',false),false);
  assert.equal(maySignForHolder('holder','holder',true),true);
});
