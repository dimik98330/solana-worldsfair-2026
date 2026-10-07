import {test} from 'node:test';import assert from 'node:assert/strict';
import {canonicalJson,normalizeRequest} from '../../server/request-contract.ts';
const a='11111111111111111111111111111111',b='SysvarC1ock11111111111111111111111111111111';
test('financial operations reject missing, fractional and unsafe numeric amounts instead of inventing a deposit',()=>{
  for(const amountMinor of [undefined,0,1,'0','1.5','1e6','-1','18446744073709551616'])assert.throws(()=>normalizeRequest({action:'fund_vault',params:{amountMinor}}));
  assert.equal(normalizeRequest({action:'fund_vault',params:{amountMinor:'0000001'}}).params.amountMinor,'1');
});
test('instrument, recipient, coupon and vote alias conflicts fail before any action can be created',()=>{
  assert.throws(()=>normalizeRequest({action:'seal_issue',bondAddress:a,params:{bondAddress:b}}));
  assert.throws(()=>normalizeRequest({action:'transfer_bonds',params:{targetWallet:a,destination:b,units:'1'}}));
  assert.throws(()=>normalizeRequest({action:'claim_coupon',params:{couponId:'0',index:'1'}}));
  assert.throws(()=>normalizeRequest({action:'cast_vote',params:{proposalId:'1',choice:'yes',support:false}}));
});
test('equivalent aliases, amount spellings and object key order have one canonical recovery identity',()=>{
  const x=normalizeRequest({action:'transfer_bonds',params:{targetWallet:a,units:'003'}}),y=normalizeRequest({action:'transfer_bonds',params:{units:'3',destination:a}});
  assert.equal(canonicalJson(x.params),canonicalJson(y.params));assert.equal(canonicalJson({b:2,a:{c:3,b:1}}),canonicalJson({a:{b:1,c:3},b:2}));
});
test('proposal fields are explicit and unsafe Unicode/control values are rejected',()=>{
  assert.throws(()=>normalizeRequest({action:'create_vote',params:{}}));
  assert.throws(()=>normalizeRequest({action:'create_vote',params:{proposalId:'1',title:'bad\uD800'}}));
  assert.throws(()=>normalizeRequest({action:'create_vote',params:{proposalId:'1',title:'bad\nline'}}));
  assert.equal(normalizeRequest({action:'cast_vote',params:{proposalId:'0',support:true}}).params.choice,'yes');
});
test('contracts reject unknown amount-like inputs and retain exact schedule values at u64 limits',()=>{
  assert.throws(()=>normalizeRequest({action:'fund_vault',params:{amount:'1',amountMinor:'1'}}));
  const result=normalizeRequest({action:'initialize_issue',params:{seriesId:'1',name:'Series',settlementMint:a,faceValueMinor:'18446744073709551615',maturityTs:'3000',coupons:'[{"recordTs":"1000","paymentTs":"2000","unitAmount":"1"}]'}});
  assert.equal(result.params.faceValueMinor,'18446744073709551615');assert.deepEqual(result.params.coupons,[{recordTs:'1000',paymentTs:'2000',unitAmount:'1'}]);
});
