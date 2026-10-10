import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {address,getAddressDecoder} from '@solana/kit';
import {getMintDecoder,getMintEncoder} from '@solana-program/token';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/servicing-'+crypto.randomUUID());
const {buildServicing}=await import('../../server/servicing.ts');
const {normalizeRequest}=await import('../../server/request-contract.ts');
type Input=Parameters<typeof buildServicing>[0];
const key=(n:number)=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i===0?n:91));
function model():Input{
  const bond=key(1),mint=key(2),settlement=key(3),issuer=key(4),holder=key(5);
  return {address:bond,contextSlot:10,clock:{slot:10n,timestamp:150n},missingProposalIds:[],proposals:[],
    bond:{issuer,bondMint:mint,settlementMint:settlement,vault:key(6),seriesId:1n,name:'Synthetic servicing',faceValue:1000_000000n,maturityTs:300n,totalIssued:10n,totalRedeemed:0n,state:1,bump:255,nextCouponIndex:0,principalClaimedMask:0,holderWallets:[holder,key(7)],couponTerms:[{recordTs:100n,paymentTs:200n,unitAmount:50_000000n}],redemptionUnits:[]},
    holders:[holder,key(7)].map((owner,i)=>({address:key(8+i),mint,owner,amount:i?0n:10n,state:2,closed:false})),
    bondMint:getMintDecoder().decode(getMintEncoder().encode({mintAuthority:bond,freezeAuthority:bond,supply:10n,decimals:0,isInitialized:true})),
    vault:{address:key(6),mint:settlement,owner:bond,amount:10500_000000n,state:1,closed:false},coupons:[null]};
}
function capture(v:Input){v.bond.nextCouponIndex=1;v.coupons[0]={bond:address(v.address),index:0,...v.bond.couponTerms[0],capturedAt:100n,totalUnits:10n,claimedMask:0,paidTotal:0n,units:[10n,0n],bump:255};}
test('record lock, sequential capture and exact payment rights change only with chain Clock and snapshots',()=>{
  const v=model(),before=buildServicing(v);
  assert.equal(before.transfer.allowed,false);assert.equal(before.transfer.reason,'record-date-awaits-capture');
  assert.equal(before.actions.find(a=>a.action==='capture_coupon')?.status,'ready');
  assert.equal(before.actions.some(a=>a.action==='claim_coupon'),false);
  capture(v);const recorded=buildServicing(v);assert.equal(recorded.transfer.allowed,true);
  assert.equal(recorded.actions.find(a=>a.action==='claim_coupon')?.status,'waiting');
  v.clock.timestamp=200n;const payable=buildServicing(v),claim=payable.actions.find(a=>a.action==='claim_coupon')!;
  assert.equal(claim.amountMinor,'500000000');assert.equal(claim.status,'ready');assert.equal(claim.signer.wallet,v.bond.holderWallets[0]);
  assert.equal(payable.actions.filter(a=>a.action==='claim_coupon').length,1);
  for(const item of payable.actions)if(item.request)assert.doesNotThrow(()=>normalizeRequest(item.request));
});
test('principal retirement never marks unpaid final coupons settled; claims survive full burn',()=>{
  const v=model();capture(v);v.clock.timestamp=300n;v.bond.state=3;v.bond.totalRedeemed=10n;v.bond.principalClaimedMask=1;v.bond.redemptionUnits=[10n,0n];v.holders[0].amount=0n;v.bondMint.supply=0n;v.vault.amount=500_000000n;
  const unpaid=buildServicing(v);assert.equal(unpaid.status,'principal-redeemed-coupons-outstanding');assert.equal(unpaid.fullySettled,false);
  assert.equal(unpaid.actions.find(a=>a.action==='claim_coupon')?.status,'ready');assert.equal(unpaid.actions.find(a=>a.action==='redeem_principal')?.status,'complete');
  v.coupons[0]!.claimedMask=1;v.coupons[0]!.paidTotal=500_000000n;v.vault.amount=0n;
  assert.equal(buildServicing(v).fullySettled,true);assert.equal(buildServicing(v).status,'settled');
});
test('draft expiry, underfunding, and outstanding captures are explicit actionable blockers',()=>{
  const v=model();v.bond.state=0;assert.equal(buildServicing(v).status,'expired-draft');
  v.clock.timestamp=50n;v.vault.amount=1n;assert.equal(buildServicing(v).actions[0].reason,'reserve-incomplete');
  v.vault.amount=10500_000000n;assert.equal(buildServicing(v).actions[0].status,'ready');
  v.bond.state=1;v.clock.timestamp=300n;assert.equal(buildServicing(v).actions.find(a=>a.action==='begin_redemption')?.reason,'coupon-records-incomplete');
  capture(v);const redemption=buildServicing(v).actions.find(a=>a.action==='begin_redemption')!;
  assert.equal(redemption.status,'ready');assert.deepEqual(redemption.signer,{kind:'any-fee-payer',wallet:null});assert.equal(redemption.walletAddress,undefined);
});
test('later due coupon cannot skip earlier record; voting excludes zero weights and duplicate ballots',()=>{
  const v=model();v.bond.couponTerms.push({recordTs:120n,paymentTs:220n,unitAmount:25_000000n});v.coupons.push(null);v.vault.amount+=250_000000n;
  assert.equal(buildServicing(v).actions.find(a=>a.id==='coupon:1:capture')?.reason,'earlier-record-date-required');
  v.proposals=[{id:'5',address:key(10),value:{bond:address(v.address),proposalId:5n,title:'Synthetic vote',openedAt:100n,closesAt:250n,totalUnits:10n,yesUnits:10n,noUnits:0n,ballotMask:1,units:[10n,0n],bump:255}}];
  const vote=buildServicing(v).votes[0];assert.equal(vote.eligibleVoters.length,1);assert.equal(vote.eligibleVoters[0].canVote,false);
  assert.equal(vote.outcomeBasis,'recorded-weights-no-execution-policy');
});
test('servicing fails closed on corrupt financial state',()=>{const v=model();v.bondMint.supply++;assert.throws(()=>buildServicing(v),/supply/);});
