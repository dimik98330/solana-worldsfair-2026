import {test} from 'node:test';
import assert from 'node:assert/strict';
import {address,blockhash,getAddressDecoder,createNoopSigner,createTransactionMessage,setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,setTransactionMessageComputeUnitLimit,
  compileTransaction,getTransactionEncoder,getTransactionDecoder,type Instruction} from '@solana/kit';
import {makePagedDemoBatches,makePagedDemoSchedule,pagedDemoTiming,initialHolderBatchInstructions,couponSettlementBatchInstructions} from '../scripts/paged-demo-plan.ts';
import * as p from '../packages/client/src/program.ts';

test('frozen CLI groups cover each initial holder once, create each page once, and preserve late coupon exclusion',()=>{
  for(const scale of [false,true])for(const late of [false,true]) {
    const initialCount=scale?33:3,couponCount=scale?9:2,plan=makePagedDemoBatches(scale,late);
    assert.deepEqual(plan,makePagedDemoBatches(scale,late));
    assert.deepEqual(plan.initialHolders.flatMap(g=>Array.from({length:g.count},(_,i)=>g.start+i)),Array.from({length:initialCount},(_,i)=>i));
    assert.deepEqual(plan.initialHolders.filter(g=>g.createRegistryPage).map(g=>g.pageIndex),Array.from({length:Math.ceil(initialCount/8)},(_,i)=>i));
    assert.equal(plan.initialHolders.length,scale?13:1);
    for(const g of plan.initialHolders){assert.ok(g.count>0&&g.count<=3);assert.equal(Math.floor(g.start/8),Math.floor((g.start+g.count-1)/8));}
    for(let id=0;id<couponCount;id++) {
      const expected=Array.from({length:initialCount+(id===0?0:1)},(_,i)=>i).filter(i=>!(late&&id===0&&i===0));
      const groups=plan.coupons.filter(g=>g.couponIndex===id);
      assert.deepEqual(groups.flatMap(g=>g.holderIndexes),expected);
      for(const g of groups){assert.ok(g.count>0&&g.count<=4);assert.equal(g.count,g.holderIndexes.length);}
    }
    if(scale&&late)assert.equal(plan.coupons.length,80);
  }
});

test('new cohort dates allow conservative setup/vote time and retain exact schedule instants',()=>{
  const now=1_791_674_000n;
  for(const scale of [false,true]) {
    const timing=pagedDemoTiming(scale),schedule=makePagedDemoSchedule(now,scale);
    assert.equal(schedule.records[0]-now,BigInt(scale?600:180));
    assert.equal(schedule.records[1]-schedule.records[0],BigInt(scale?360:180));
    for(let i=2;i<schedule.records.length;i++)assert.equal(schedule.records[i]-schedule.records[i-1],4n);
    assert.deepEqual(schedule.payments,schedule.records.map(n=>n+1n));
    assert.equal(schedule.maturity-schedule.records.at(-1)!,60n);
    assert.equal(timing.maturityGapSeconds,60);
  }
});

const key=(n:number)=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i===0?n:71));
async function fixture(){
  const issuer=createNoopSigner(key(1)),executor=createNoopSigner(key(2)),settlementMint=key(3);
  const bond=await p.deriveBondV2(issuer.address,12n),bondMint=await p.deriveBondMintV2(bond),vault=await p.deriveVaultV2(bond);
  const holderWallets=Array.from({length:34},(_,i)=>key(i+10));
  return {issuer,executor,settlementMint,bond,bondMint,vault,holderWallets,
    holderRecords:await Promise.all(holderWallets.map(wallet=>p.deriveHolderV2(bond,wallet))),
    holdingAtas:await Promise.all(holderWallets.map(wallet=>p.ata(wallet,bondMint))),
    settlementAtas:await Promise.all(holderWallets.map(wallet=>p.ata(wallet,settlementMint))),
    units:Array.from({length:33},(_,i)=>i===0?10n:i===1?5n:i===2?3n:1n)};
}
function wire(instructions:Instruction[],payer:ReturnType<typeof createNoopSigner>){
  const message=appendTransactionMessageInstructions(instructions,setTransactionMessageLifetimeUsingBlockhash({
    blockhash:blockhash('11111111111111111111111111111111'),lastValidBlockHeight:1000n},
    setTransactionMessageFeePayerSigner(payer,createTransactionMessage({version:0}))));
  const transaction=compileTransaction(setTransactionMessageComputeUnitLimit(1_400_000,message));
  const encoded=getTransactionEncoder().encode(transaction);
  assert.deepEqual(Object.keys(getTransactionDecoder().decode(encoded).signatures),[payer.address]);
  assert.ok(encoded.length<=1232,`fixed v0 batch exceeds 1232 bytes: ${encoded.length}`);
  return encoded.length;
}

test('every fixed scale group fits actual Kit v0 encoding with compute budget and one signer, without RPC',async t=>{
  const f=await fixture(),plan=makePagedDemoBatches(true,true);let initialMax=0,couponMax=0;
  for(const group of plan.initialHolders) {
    const instructions=initialHolderBatchInstructions({...f,group,registryPage:await p.deriveRegistryPageV2(f.bond,group.pageIndex)});
    assert.equal(instructions.length,group.count*3+Number(group.createRegistryPage));
    initialMax=Math.max(initialMax,wire(instructions,f.issuer));
  }
  for(const group of plan.coupons) {
    const action=await p.deriveActionV2(f.bond,1,group.couponIndex),snapshotPages:Record<number,string>={};
    for(const holder of group.holderIndexes){const page=Math.floor(holder/8);snapshotPages[page]??=await p.deriveSnapshotPageV2(action,page);}
    const instructions=couponSettlementBatchInstructions({...f,group,action,snapshotPages});
    assert.equal(instructions.length,group.count*2);
    couponMax=Math.max(couponMax,wire(instructions,f.executor));
  }
  t.diagnostic(`Offline actual Kit v0 encoding: initial-holder max ${initialMax} bytes; coupon max ${couponMax} bytes. No simulation or chain execution claimed.`);
});

test('batch builders reject oversized, cross-page and repeated-beneficiary groups before encoding',async()=>{
  const f=await fixture(),registryPage=await p.deriveRegistryPageV2(f.bond,0);
  assert.throws(()=>initialHolderBatchInstructions({...f,registryPage,group:{start:7,count:3,pageIndex:0,createRegistryPage:false}}),/Invalid fixed/);
  assert.throws(()=>initialHolderBatchInstructions({...f,registryPage,group:{start:0,count:4,pageIndex:0,createRegistryPage:true}}),/Invalid fixed/);
  const action=await p.deriveActionV2(f.bond,1,0),snapshotPages={0:await p.deriveSnapshotPageV2(action,0)};
  assert.throws(()=>couponSettlementBatchInstructions({...f,action,snapshotPages,group:{couponIndex:0,start:0,count:5,holderIndexes:[0,1,2,3,4]}}),/Invalid fixed/);
  assert.throws(()=>couponSettlementBatchInstructions({...f,action,snapshotPages,group:{couponIndex:0,start:0,count:2,holderIndexes:[0,0]}}),/Invalid fixed/);
});
