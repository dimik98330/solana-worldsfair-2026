import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {address,getAddressDecoder,getAddressEncoder,getProgramDerivedAddress,pipe,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,setTransactionMessageComputeUnitLimit,compileTransaction,getTransactionEncoder} from '@solana/kit';
import {createHash} from 'node:crypto';
import {getMintEncoder,getTokenEncoder,TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import * as program from '../../packages/client/src/program.ts';
import type {ReadRpc,RpcAccount} from '../../server/chain-view.ts';
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/v2-' + crypto.randomUUID());
const {normalizeV2Request} = await import('../../server/v2-contract.ts');
const {readV2View,readV2State,readV2Page,makeV2Action,reconcileV2} = await import('../../server/v2.ts');
const wallet = getAddressDecoder().decode(new Uint8Array(32).fill(7));
test('v2 normalizer keeps exact amounts and allows u32 coupon identifiers beyond legacy eight', () => {
  assert.deepEqual(normalizeV2Request({action:'begin_coupon_v2',bondAddress:wallet,params:{index:8}}).params,{bondAddress:wallet,couponId:'8'});
  assert.equal(normalizeV2Request({action:'fund_vault_v2',params:{amountMinor:'18446744073709551615'}}).params.amountMinor,'18446744073709551615');
});
test('v2 normalizer fails closed for aliases, unsafe money and schedule page overflow', () => {
  for(const request of [
    {action:'begin_coupon_v2',params:{couponId:'8',index:'9'}},
    {action:'fund_vault_v2',params:{amountMinor:9007199254740992}},
    {action:'begin_coupon_v2',params:{couponId:'4294967296'}},
    {action:'append_schedule_v2',params:{pageIndex:'0',coupons:Array(9).fill({recordTs:'100',paymentTs:'101',unitAmount:'1'})}},
    {action:'fund_vault_v2',operationId:'recover_123',requestId:'recover_456',params:{amountMinor:'1'}},
    {action:'initialize_issue_v2',params:{seriesId:'1',name:'No rounding',settlementMint:wallet,faceValueMinor:'1000',maturityTs:'2000',couponCount:'9',rateBps:'1001',couponFrequency:'2'}},
  ]) assert.throws(()=>normalizeV2Request(request));
});

// Synthetic confirmed RPC observations. These tests do not claim SBF execution.
const key=(id:number)=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i<2?(id>>>(i*8))&255:19));
const issuer=key(1),settlement=key(2),pk=(s:string)=>Buffer.from(getAddressEncoder().encode(address(s)));
const u32=(v:number)=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
const u16=(v:number)=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;};
const u64=(v:bigint)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(v);return b;};
const i64=(v:bigint)=>{const b=Buffer.alloc(8);b.writeBigInt64LE(v);return b;};
const str=(v:string)=>[u32(Buffer.byteLength(v)),Buffer.from(v)];
const disc=(s:string)=>createHash('sha256').update('account:'+s).digest().subarray(0,8);
const padded=(name:string,size:number,parts:Uint8Array[])=>{const b=Buffer.concat([disc(name),...parts]);assert.ok(b.length<=size);return Buffer.concat([b,Buffer.alloc(size-b.length)]);};
const raw=(bytes:ArrayLike<number>,owner:string=program.PROGRAM_ID):RpcAccount=>({owner,executable:false,data:[Buffer.from(Array.from(bytes)).toString('base64'),'base64']});
const token=(mint:string,owner:string,amount:bigint,state=2)=>raw(getTokenEncoder().encode({mint:address(mint),owner:address(owner),amount,state,delegate:null,closeAuthority:null,delegatedAmount:0n,isNative:null}),TOKEN_PROGRAM_ADDRESS);
async function bump(seed:string,seeds:Uint8Array[]){return (await getProgramDerivedAddress({programAddress:program.PROGRAM_ID,seeds:[Buffer.from(seed),...seeds]}))[1];}
type B=ReturnType<typeof program.decodeBondV2>;
function encodeBond(b:B){return padded('BondV2',319,[Buffer.from([2]),...[b.issuer,b.bondMint,b.settlementMint,b.vault].map(pk),u64(b.seriesId),u64(b.faceValue),u16(b.rateBps),Buffer.from([b.couponFrequency]),i64(b.maturityTs),u64(b.totalIssued),u64(b.totalRedeemed),Buffer.from([b.state,b.bump]),u64(b.revision),...[b.holderCount,b.couponCount,b.scheduleAppended,b.nextCouponIndex].map(u32),...[b.firstRecordTs,b.nextRecordTs,b.lastRecordTs,b.lastPaymentTs].map(i64),u64(b.couponUnitTotal),Buffer.from([b.activeKind]),u32(b.activeId),...str(b.name)]);}
async function bank(holderCount=33,couponCount=9){
  const bondAddress=await program.deriveBondV2(issuer,1n),mint=await program.deriveBondMintV2(bondAddress),vault=await program.deriveVaultV2(bondAddress),wallets=Array.from({length:holderCount},(_,i)=>key(10+i));
  const schedule=Array.from({length:couponCount},(_,i)=>({recordTs:BigInt(200+i*100),paymentTs:BigInt(250+i*100),unitAmount:50n}));
  const bond:B={version:2,issuer,bondMint:mint,settlementMint:settlement,vault,seriesId:1n,faceValue:1000n,rateBps:1000,couponFrequency:2,maturityTs:2000n,totalIssued:BigInt(holderCount),totalRedeemed:0n,state:1,bump:await bump('bond_v2',[pk(issuer),u64(1n)]),revision:1n,holderCount,couponCount,scheduleAppended:couponCount,nextCouponIndex:0,firstRecordTs:200n,nextRecordTs:200n,lastRecordTs:schedule.at(-1)!.recordTs,lastPaymentTs:schedule.at(-1)!.paymentTs,couponUnitTotal:50n*BigInt(couponCount),activeKind:0,activeId:0,name:'Paged issue'};
  const accounts=new Map<string,RpcAccount>(),write=()=>accounts.set(bondAddress,raw(encodeBond(bond)));
  const clock=(timestamp:bigint)=>{const b=Buffer.alloc(40);b.writeBigUInt64LE(51n);b.writeBigInt64LE(timestamp,32);accounts.set('SysvarC1ock11111111111111111111111111111111',raw(b,'Sysvar1111111111111111111111111111111111111'));};
  const supply=(n:bigint)=>accounts.set(mint,raw(getMintEncoder().encode({mintAuthority:bondAddress,freezeAuthority:bondAddress,supply:n,decimals:0,isInitialized:true}),TOKEN_PROGRAM_ADDRESS));
  const reserve=(n:bigint)=>accounts.set(vault,token(settlement,bondAddress,n,1));
  clock(150n);supply(bond.totalIssued);reserve((bond.faceValue+bond.couponUnitTotal)*bond.totalIssued);write();
  accounts.set(settlement,raw(getMintEncoder().encode({mintAuthority:issuer,freezeAuthority:null,supply:9999999n,decimals:6,isInitialized:true}),TOKEN_PROGRAM_ADDRESS));
  for(let i=0;i<Math.ceil(holderCount/8);i++){const k=await program.deriveRegistryPageV2(bondAddress,i),w=wallets.slice(i*8,i*8+8);accounts.set(k,raw(padded('RegistryPageV2',305,[pk(bondAddress),u32(i),Buffer.from([await bump('registry_v2',[pk(bondAddress),u32(i)])]),u32(w.length),...w.map(pk)])));}
  for(let i=0;i<Math.ceil(couponCount/8);i++){const k=await program.deriveSchedulePageV2(bondAddress,i),t=schedule.slice(i*8,i*8+8);accounts.set(k,raw(padded('SchedulePageV2',241,[pk(bondAddress),u32(i),Buffer.from([await bump('schedule_v2',[pk(bondAddress),u32(i)])]),u32(t.length),...t.flatMap(c=>[i64(c.recordTs),i64(c.paymentTs),u64(c.unitAmount)])])));}
  for(let i=0;i<wallets.length;i++){const w=wallets[i],h=await program.deriveHolderV2(bondAddress,w);accounts.set(h,raw(padded('HolderV2',77,[pk(bondAddress),pk(w),u32(i),Buffer.from([await bump('holder_v2',[pk(bondAddress),pk(w)])])])));accounts.set(await program.ata(w,mint),token(mint,w,1n));}
  return {bondAddress,bond,accounts,wallets,schedule,write,clock,supply,reserve};
}
type Bank=Awaited<ReturnType<typeof bank>>;
function mock(b:Bank,hook?:(method:string,params:any[],calls:number)=>void){let calls=0;const requests:{method:string;params:any[]}[]=[];const readRpc:ReadRpc=async(method,params)=>{requests.push({method,params});hook?.(method,params,++calls);const slot=Math.max(51,(params[1] as any)?.minContextSlot??0);if(method==='getAccountInfo')return {context:{slot},value:b.accounts.get(String(params[0]))??null};assert.equal(method,'getMultipleAccounts');assert.ok((params[0] as string[]).length<=100);return {context:{slot},value:(params[0] as string[]).map(k=>b.accounts.get(k)??null)};};return {readRpc,requests};}
async function addAction(b:Bank,kind:1|2|3,id:number,options:{holders?:number;pages?:number;claimed?:number[];votes?:Record<number,boolean>;finalized?:boolean}={}){
  const h=options.holders??b.bond.holderCount,pages=options.pages??Math.ceil(h/8),finalized=options.finalized??true,k=await program.deriveActionV2(b.bondAddress,kind,id),claimed=options.claimed??[],votes=options.votes??{},units=Array(h).fill(1n) as bigint[];
  // Appended zero-balance holders are outside historical snapshots.
  const unit=kind===1?b.schedule[id].unitAmount:kind===2?b.bond.faceValue:0n,record=kind===1?b.schedule[id].recordTs:kind===2?b.bond.maturityTs:100n,payment=kind===1?b.schedule[id].paymentTs:kind===2?b.bond.maturityTs:0n;
  const capturedUnits=units.slice(0,pages*8),yes=Object.values(votes).filter(Boolean).length,no=Object.values(votes).filter(v=>!v).length;
  b.accounts.set(k,raw(padded('ActionV2',235,[pk(b.bondAddress),Buffer.from([kind]),u32(id),i64(record),i64(payment),u64(unit),i64(kind===3?100n:record),i64(kind===3?1900n:0n),u32(h),u32(pages),u64(BigInt(capturedUnits.length)),u64(unit*BigInt(claimed.length)),u64(BigInt(claimed.length)),u64(BigInt(yes)),u64(BigInt(no)),Buffer.from([Number(finalized),await bump('action_v2',[pk(b.bondAddress),Uint8Array.of(kind),u32(id)])]),...str(kind===3?'Fixed-weight vote':'')])));
  for(let page=0;page<pages;page++){const pageUnits=units.slice(page*8,page*8+8),mask=claimed.filter(i=>Math.floor(i/8)===page).reduce((m,i)=>m|(1<<(i%8)),0),voted=Object.keys(votes).map(Number).filter(i=>Math.floor(i/8)===page).reduce((m,i)=>m|(1<<(i%8)),0),snap=await program.deriveSnapshotPageV2(k,page);b.accounts.set(snap,raw(padded('SnapshotPageV2',123,[pk(k),u32(page),Buffer.from([mask,voted]),u64(unit*BigInt(claimed.filter(i=>Math.floor(i/8)===page).length)),Buffer.from([await bump('snapshot_v2',[pk(k),u32(page)])]),u32(pageUnits.length),...pageUnits.map(u64)])));}
  for(const [index,support]of Object.entries(votes)){const voter=b.wallets[Number(index)],ballot=await program.deriveBallotV2(k,voter);b.accounts.set(ballot,raw(padded('BallotV2',82,[pk(k),pk(voter),u64(1n),Buffer.from([Number(support),await bump('ballot_v2',[pk(k),pk(voter)])])])));}
  return k;
}
test('paged reader reconciles 33 holders and nine coupons across RPC batches with explicit slot-range scope',async()=>{
  const b=await bank(),m=mock(b),view=await readV2View(b.bondAddress,{readRpc:m.readRpc}),state=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});
  assert.equal(view.holders.length,33);assert.equal(view.schedule.length,9);assert.equal(reconcileV2(view).contractual,47850n);assert.equal(state.context.sameBank,false);assert.equal(state.reconciliation.totals.remainingObligations.baseUnits,'47850');assert.equal(state.instrument.rateBasis,'on-chain-program-validated-rate-v2');
  assert.ok(m.requests.every(r=>r.method!=='getMultipleAccounts'||r.params[0].length<=100));
});
test('partial capture grants no fixed/claimable entitlements and missing expected page fails closed',async()=>{
  const b=await bank();b.bond.activeKind=1;b.bond.activeId=0;b.clock(300n);b.write();const action=await addAction(b,1,0,{pages:1,finalized:false});
  const state=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});assert.equal(state.coupons[0].status,'capturing');assert.equal(state.coupons[0].snapshotAddress,'');assert.equal(state.coupons[0].captureAddress,action);assert.equal(state.coupons[0].claimableMinor,'0');assert.equal(state.coupons[0].basis,'partial-capture-not-finalized');assert.ok(state.coupons[0].entitlements.every(e=>!e.eligible&&!e.claimableNow));
  b.accounts.delete(await program.deriveSnapshotPageV2(action,0));await assert.rejects(readV2View(b.bondAddress,{readRpc:mock(b).readRpc}),/SnapshotPageV2 account is absent/);
});
test('33-holder nine-coupon full settlement reconciles coupon masks, principal burns, supply and empty reserve',async()=>{
  const b=await bank();b.bond.nextCouponIndex=9;b.bond.nextRecordTs=b.bond.maturityTs;b.bond.state=3;b.bond.totalRedeemed=33n;b.clock(2000n);b.supply(0n);b.reserve(0n);b.write();const claimed=Array.from({length:33},(_,i)=>i);
  for(let i=0;i<9;i++)await addAction(b,1,i,{claimed});await addAction(b,2,0,{claimed});for(const w of b.wallets)b.accounts.set(await program.ata(w,b.bond.bondMint),token(b.bond.bondMint,w,0n));
  const state=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});assert.equal(state.coupons.length,9);assert.equal(state.reconciliation.totals.cashPaid.baseUnits,'47850');assert.equal(state.reconciliation.totals.remainingObligations.baseUnits,'0');assert.equal(state.reconciliation.supply.currentUnits,'0');assert.equal(state.servicing.fullySettled,true);
  const snap=await program.deriveSnapshotPageV2(await program.deriveActionV2(b.bondAddress,1,8),4),original=b.accounts.get(snap)!;const bytes=Buffer.from(original.data[0],'base64');bytes.writeBigUInt64LE(0n,46);b.accounts.set(snap,raw(bytes));await assert.rejects(readV2View(b.bondAddress,{readRpc:mock(b).readRpc}),/paid total/);
});
test('revision race discards its mixed graph and retries at most three times',async()=>{
  const b=await bank();let raced=false;const m=mock(b,(method)=>{if(method==='getMultipleAccounts'&&!raced){raced=true;b.bond.revision++;b.write();}}),v=await readV2View(b.bondAddress,{readRpc:m.readRpc});assert.equal(v.bond.revision,2n);assert.equal(m.requests.filter(r=>r.method==='getAccountInfo').length,4);
  const unstable=mock(b,method=>{if(method==='getMultipleAccounts'){b.bond.revision++;b.write();}});await assert.rejects(readV2View(b.bondAddress,{readRpc:unstable.readRpc}),/three bounded/);assert.equal(unstable.requests.filter(r=>r.method==='getAccountInfo').length,6);
});
test('reader validates canonical PDA/bump, program owner, mint and frozen positive holder balances',async()=>{
  for(const damage of ['bump','owner','mint','frozen','length','rate'] as const){const b=await bank();if(damage==='bump'){b.bond.bump^=1;b.write();}if(damage==='owner'){const k=await program.deriveRegistryPageV2(b.bondAddress,0);b.accounts.set(k,{...b.accounts.get(k)!,owner:TOKEN_PROGRAM_ADDRESS});}if(damage==='mint')b.accounts.set(await program.ata(b.wallets[0],b.bond.bondMint),token(settlement,b.wallets[0],1n));if(damage==='frozen')b.accounts.set(await program.ata(b.wallets[0],b.bond.bondMint),token(b.bond.bondMint,b.wallets[0],1n,1));if(damage==='length')b.accounts.set(b.bondAddress,raw(Buffer.concat([encodeBond(b.bond),Buffer.from([0])])));if(damage==='rate'){b.bond.rateBps=1001;b.write();}await assert.rejects(readV2View(b.bondAddress,{readRpc:mock(b).readRpc}),(e:unknown)=>e instanceof Error,damage);}
});
test('later registered holder gains zero historical coupon rights; old rights survive post-activation append',async()=>{
  const b=await bank();b.bond.totalIssued=32n;b.supply(32n);b.reserve(46400n);b.accounts.set(await program.ata(b.wallets[32],b.bond.bondMint),token(b.bond.bondMint,b.wallets[32],0n));b.bond.nextCouponIndex=1;b.bond.nextRecordTs=b.schedule[1].recordTs;b.clock(300n);b.write();await addAction(b,1,0,{holders:32});
  const state=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});assert.equal(state.coupons[0].entitlements[32].units,'0');assert.equal(state.coupons[0].entitlements[32].eligible,false);assert.equal(state.coupons[0].entitlements[0].amountMinor,'50');
  await assert.rejects(makeV2Action({action:'claim_coupon_v2',bondAddress:b.bondAddress,params:{couponId:'0'}},b.wallets[32],{readRpc:mock(b).readRpc}),/outside the historical registry prefix/);
  const built=await makeV2Action({action:'settle_coupon_v2',bondAddress:b.bondAddress,params:{couponId:'0',holderWallet:b.wallets[0]}},key(99),{readRpc:mock(b).readRpc});assert.equal(built.amount,50n);assert.equal(built.summary.signer,key(99));assert.equal(built.summary.recipients?.[0],b.wallets[0]);
});
test('three votes retain snapshot weights and verify ballot choices without metadata determining money',async()=>{
  const b=await bank();for(let i=1;i<=3;i++)await addAction(b,3,i,{votes:{0:true,1:false}});const state=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc,proposalIds:()=>['1','2','3']});assert.equal(state.proposals.length,3);assert.ok(state.proposals.every(p=>p.yesWeight==='1'&&p.noWeight==='1'&&p.eligibleWeights[32].units==='1'));
  const ballot=await program.deriveBallotV2(await program.deriveActionV2(b.bondAddress,3,2),b.wallets[0]),data=Buffer.from(b.accounts.get(ballot)!.data[0],'base64');data.writeBigUInt64LE(2n,72);b.accounts.set(ballot,raw(data));await assert.rejects(readV2View(b.bondAddress,{readRpc:mock(b).readRpc,proposalIds:()=>['1','2','3']}),/immutable snapshot weight/);
});
test('permissionless principal opening and holder redemption builders do not require issuer signature',async()=>{
  const b=await bank();b.bond.nextCouponIndex=9;b.bond.nextRecordTs=b.bond.maturityTs;b.clock(2000n);b.write();for(let i=0;i<9;i++)await addAction(b,1,i);
  const open=await makeV2Action({action:'begin_redemption_v2',bondAddress:b.bondAddress,params:{}},key(99),{readRpc:mock(b).readRpc});assert.equal(open.summary.signer,key(99));assert.ok(open.instructions.every(ix=>!ix.accounts?.some(m=>m.address===issuer&&m.role>=2)));
  b.bond.state=2;b.write();await addAction(b,2,0);const redeem=await makeV2Action({action:'redeem_principal_v2',bondAddress:b.bondAddress,params:{}},b.wallets[32],{readRpc:mock(b).readRpc});assert.equal(redeem.amount,1000n);assert.ok(redeem.instructions.every(ix=>!ix.accounts?.some(m=>m.address===issuer&&m.role>=2)));
});
test('read budget prevents unbounded derivation loops and never returns a pretend complete graph',async()=>{const b=await bank();b.bond.holderCount=10000;b.write();const m=mock(b);await assert.rejects(readV2View(b.bondAddress,{readRpc:m.readRpc}),/scoped pagination/);assert.equal(m.requests.length,1);});
test('scoped canonical pages remain bounded and explicitly cannot establish complete financial reconciliation',async()=>{const b=await bank(),m=mock(b),page=await readV2Page(b.bondAddress,'registry',4,{readRpc:m.readRpc});assert.deepEqual(page.data.wallets,[b.wallets[32]]);assert.equal(page.coverage.completeFinancialGraph,false);assert.equal(m.requests.length,3);const terms=await readV2Page(b.bondAddress,'schedule',1,{readRpc:mock(b).readRpc});assert.equal(terms.data.terms[0].unitAmount,'50');await assert.rejects(readV2Page(b.bondAddress,'schedule',2,{readRpc:mock(b).readRpc}),/not been appended/);});
test('new draft 0/9 and intermediate 8/9 schedules remain readable and append builders avoid a setup deadlock',async()=>{
  const b=await bank(0,9),first=await program.deriveSchedulePageV2(b.bondAddress,0),second=await program.deriveSchedulePageV2(b.bondAddress,1),firstRaw=b.accounts.get(first)!,secondRaw=b.accounts.get(second)!;
  b.bond.state=0;b.bond.scheduleAppended=0;b.bond.firstRecordTs=0n;b.bond.nextRecordTs=0n;b.bond.lastRecordTs=0n;b.bond.lastPaymentTs=0n;b.bond.couponUnitTotal=0n;b.accounts.delete(first);b.accounts.delete(second);b.write();
  const initial=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});assert.equal(initial.coupons.length,0);assert.equal(initial.pagination.scheduleComplete,false);assert.equal(initial.instrument.couponCount,9);
  const coupons=b.schedule.map(c=>({recordTs:String(c.recordTs),paymentTs:String(c.paymentTs),unitAmount:String(c.unitAmount)}));
  const firstBuild=await makeV2Action({action:'append_schedule_v2',bondAddress:b.bondAddress,params:{pageIndex:'0',coupons:coupons.slice(0,8)}},issuer,{readRpc:mock(b).readRpc});assert.equal(firstBuild.proofAccount,first);
  b.accounts.set(first,firstRaw);Object.assign(b.bond,{scheduleAppended:8,firstRecordTs:200n,nextRecordTs:200n,lastRecordTs:900n,lastPaymentTs:950n,couponUnitTotal:400n});b.write();
  assert.equal((await readV2State(b.bondAddress,{readRpc:mock(b).readRpc})).coupons.length,8);
  const secondBuild=await makeV2Action({action:'append_schedule_v2',bondAddress:b.bondAddress,params:{pageIndex:'1',coupons:coupons.slice(8)}},issuer,{readRpc:mock(b).readRpc});assert.equal(secondBuild.proofAccount,second);
  b.accounts.set(second,secondRaw);Object.assign(b.bond,{scheduleAppended:9,lastRecordTs:1000n,lastPaymentTs:1050n,couponUnitTotal:450n});b.write();assert.equal((await readV2State(b.bondAddress,{readRpc:mock(b).readRpc})).pagination.scheduleComplete,true);
  const created=await makeV2Action({action:'create_registry_page_v2',bondAddress:b.bondAddress,params:{pageIndex:'0'}},issuer,{readRpc:mock(b).readRpc});assert.equal(created.instructions.length,1);
  const registered=await makeV2Action({action:'register_holder_v2',bondAddress:b.bondAddress,params:{holderWallet:wallet}},issuer,{readRpc:mock(b).readRpc});assert.equal(registered.metadata?.holderIndex,'0');
  b.accounts.delete(first);await assert.rejects(readV2View(b.bondAddress,{readRpc:mock(b).readRpc}),/SchedulePageV2 account is absent/);
});
test('unpaid immutable coupon rights remain claimable after all principal units are burned',async()=>{
  const b=await bank();b.bond.nextCouponIndex=9;b.bond.nextRecordTs=b.bond.maturityTs;b.bond.state=3;b.bond.totalRedeemed=33n;b.clock(2000n);b.supply(0n);b.reserve(14850n);b.write();
  for(let i=0;i<9;i++)await addAction(b,1,i);await addAction(b,2,0,{claimed:Array.from({length:33},(_,i)=>i)});for(const w of b.wallets)b.accounts.set(await program.ata(w,b.bond.bondMint),token(b.bond.bondMint,w,0n));
  const state=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});assert.equal(state.holders[32].units,'0');assert.equal(state.coupons[8].entitlements[32].units,'1');assert.equal(state.coupons[8].entitlements[32].claimableNow,true);assert.equal(state.reconciliation.totals.remainingObligations.baseUnits,'14850');assert.equal(state.servicing.fullySettled,false);
  const claim=await makeV2Action({action:'claim_coupon_v2',bondAddress:b.bondAddress,params:{couponId:'8'}},b.wallets[32],{readRpc:mock(b).readRpc});assert.equal(claim.amount,50n);assert.equal(claim.summary.token,settlement);
});
test('holder claim and permissionless settlement both reject the same already-paid snapshot bit',async()=>{
  const b=await bank();b.bond.nextCouponIndex=1;b.bond.nextRecordTs=b.schedule[1].recordTs;b.clock(300n);b.reserve(47800n);b.write();await addAction(b,1,0,{claimed:[0]});
  await assert.rejects(makeV2Action({action:'claim_coupon_v2',bondAddress:b.bondAddress,params:{couponId:'0'}},b.wallets[0],{readRpc:mock(b).readRpc}),/already been paid/);
  await assert.rejects(makeV2Action({action:'settle_coupon_v2',bondAddress:b.bondAddress,params:{couponId:'0',holderWallet:b.wallets[0]}},key(99),{readRpc:mock(b).readRpc}),/already been paid/);
});
test('v2 catalog history 64→65→512 retains bounded financial reads and explicitly selected old votes',async()=>{
  const {saveCatalog}=await import('../../server/catalog.ts'),b=await bank(1,1),created=new Set<number>();b.bond.nextCouponIndex=1;b.bond.nextRecordTs=b.bond.maturityTs;b.clock(300n);b.write();await addAction(b,1,0);
  for(const length of [64,65,512]){
    const proposalIds=Array.from({length},(_,i)=>String(i+1));
    for(const id of proposalIds.slice(-64).map(Number)){if(!created.has(id)){await addAction(b,3,id);created.add(id);}}
    saveCatalog({protocolVersion:2,seriesId:'1',bond:b.bondAddress,name:b.bond.name,settlementMint:settlement,createdAt:'2026-10-10T00:00:00.000Z',rateBps:1000,couponFrequency:2,roles:{issuer},proposalIds,complete:true,accelerated:false,source:'wallet'});
    const state=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});assert.equal(state.proposals.length,64);assert.equal(state.proposalDiscovery.knownCount,length);assert.equal(state.proposalDiscovery.omittedCatalogIds.length,length-64);assert.equal(state.proposalDiscovery.completeAtFinancialContext,false);assert.equal(state.coupons[0].claimableMinor,'50');
    const claim=await makeV2Action({action:'claim_coupon_v2',bondAddress:b.bondAddress,params:{couponId:'0'}},b.wallets[0],{readRpc:mock(b).readRpc});assert.equal(claim.amount,50n);
  }
  const old=await makeV2Action({action:'cast_vote_v2',bondAddress:b.bondAddress,params:{proposalId:'1',choice:'yes'}},b.wallets[0],{readRpc:mock(b).readRpc});assert.equal(old.proofAccount,await program.deriveBallotV2(await program.deriveActionV2(b.bondAddress,3,1),b.wallets[0]));
  b.bond.activeKind=3;b.bond.activeId=0;b.write();await addAction(b,3,0,{pages:0,finalized:false});const active=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc});assert.equal(active.proposals.length,65);assert.equal(active.proposals.find(p=>p.id==='0')?.status,'capturing');
  const constrained=await readV2State(b.bondAddress,{readRpc:mock(b).readRpc,maxAccounts:40});assert.equal(constrained.coupons[0].claimableMinor,'50');assert.ok(constrained.proposals.length<64);assert.ok(constrained.context.accountCount<=40);assert.equal(constrained.pagination.completeFinancialGraph,true);
  const boundedClaim=await makeV2Action({action:'claim_coupon_v2',bondAddress:b.bondAddress,params:{couponId:'0'}},b.wallets[0],{readRpc:mock(b).readRpc,maxAccounts:40});assert.equal(boundedClaim.amount,50n);
  await assert.rejects(readV2View(b.bondAddress,{readRpc:mock(b).readRpc,proposalIds:()=>Array.from({length:513},(_,i)=>String(i))}),/bounded v2 proposal/);
});
test('one-review v2 creation binds nine exact coupons into three instructions within v0 wire capacity using chain Clock',async(t)=>{
  const b=await bank(0,9),coupons=b.schedule.map(c=>({recordTs:String(c.recordTs),paymentTs:String(c.paymentTs),unitAmount:String(c.unitAmount)})),params={seriesId:'2',name:'Composite issue',settlementMint:settlement,faceValueMinor:'1000',maturityTs:'2000',couponCount:'9',rateBps:'1000',couponFrequency:'2',coupons:JSON.stringify(coupons)};
  const originalNow=Date.now;Date.now=()=>4102444800000;let built:Awaited<ReturnType<typeof makeV2Action>>;try{built=await makeV2Action({action:'initialize_issue_v2',params},issuer,{readRpc:mock(b).readRpc});}finally{Date.now=originalNow;}
  assert.equal(built!.instructions.length,3);assert.deepEqual(built!.metadata?.coupons,coupons);assert.deepEqual(built!.summary.issueTerms?.coupons,coupons);
  const ix0=Buffer.from(built!.instructions[1].data!),ix1=Buffer.from(built!.instructions[2].data!);assert.equal(ix0.readUInt32LE(8),0);assert.equal(ix0.readUInt32LE(12),8);assert.equal(ix0.readBigInt64LE(16),200n);assert.equal(ix1.readUInt32LE(8),1);assert.equal(ix1.readUInt32LE(12),1);assert.equal(ix1.readBigInt64LE(16),1000n);
  const wireSize=(instructions:typeof built.instructions)=>{const message=pipe(createTransactionMessage({version:0}),m=>setTransactionMessageFeePayer(issuer,m),m=>setTransactionMessageLifetimeUsingBlockhash({blockhash:key(99) as any,lastValidBlockHeight:100n},m),m=>appendTransactionMessageInstructions(instructions,m),m=>setTransactionMessageComputeUnitLimit(1400000,m));return getTransactionEncoder().encode(compileTransaction(message)).length;};const nineBytes=wireSize(built!.instructions);assert.ok(nineBytes<=1232);
  const sixteen=await makeV2Action({action:'initialize_issue_v2',params:{...params,name:'A'.repeat(64),couponCount:'16',coupons:Array.from({length:16},(_,i)=>({recordTs:String(200+i*100),paymentTs:String(250+i*100),unitAmount:'50'}))}},issuer,{readRpc:mock(b).readRpc});const sixteenBytes=wireSize(sixteen.instructions);assert.equal(sixteen.instructions.length,3);assert.ok(sixteenBytes<=1232);t.diagnostic(`Unsigned v0 wire including compute budget: nine=${nineBytes}B, sixteen/max-name=${sixteenBytes}B`);
  for(const damaged of [{...params,couponCount:'10'},{...params,coupons:coupons.map((c,i)=>i===8?{...c,unitAmount:'51'}:c)},{...params,coupons:coupons.map((c,i)=>i===1?{...c,recordTs:'199'}:c)},{...params,coupons:coupons.map((c,i)=>i===8?{...c,paymentTs:'2001'}:c)},{...params,couponCount:'17',coupons:Array.from({length:17},(_,i)=>({recordTs:String(200+i),paymentTs:String(220+i),unitAmount:'50'}))}])assert.throws(()=>normalizeV2Request({action:'initialize_issue_v2',params:damaged}));
  await assert.rejects(makeV2Action({action:'initialize_issue_v2',params:{...params,coupons:coupons.map((c,i)=>i===0?{...c,recordTs:'149'}:c)}},issuer,{readRpc:mock(b).readRpc}),/chain clock/);
  assert.equal(normalizeV2Request({action:'initialize_issue_v2',params:{...params,couponCount:'4294967295',coupons:undefined}}).params.couponCount,'4294967295');
  assert.equal((normalizeV2Request({action:'initialize_issue_v2',params:{...params,rateBps:undefined,couponFrequency:undefined,coupons:coupons.map((c,i)=>i===8?{...c,unitAmount:'51'}:c)}}).params.coupons as {unitAmount:string}[])[8].unitAmount,'51');
});
test('33rd holder registration atomically creates a missing page or reuses a validated empty page with review recipient',async()=>{
  const b=await bank(32,9),w=key(100),page=await program.deriveRegistryPageV2(b.bondAddress,4),request={action:'register_holder_v2',bondAddress:b.bondAddress,params:{holderWallet:w}},options=()=>({readRpc:mock(b).readRpc,proposalIds:()=>[]});
  const missing=await makeV2Action(request,issuer,options());assert.equal(missing.instructions.length,3);assert.equal(missing.summary.recipients?.[0],w);assert.equal(missing.metadata?.holderIndex,'32');
  const pageBytes=padded('RegistryPageV2',305,[pk(b.bondAddress),u32(4),Buffer.from([await bump('registry_v2',[pk(b.bondAddress),u32(4)])]),u32(0)]);b.accounts.set(page,raw(pageBytes));const existing=await makeV2Action(request,issuer,options());assert.equal(existing.instructions.length,2);
  for(const corrupted of [raw(pageBytes,TOKEN_PROGRAM_ADDRESS),raw(Buffer.concat([Buffer.alloc(8),pageBytes.subarray(8)])),raw(Buffer.concat([pageBytes.subarray(0,44),Buffer.from([pageBytes[44]^1]),pageBytes.subarray(45)])),raw(padded('RegistryPageV2',305,[pk(b.bondAddress),u32(4),Buffer.from([await bump('registry_v2',[pk(b.bondAddress),u32(4)])]),u32(1),pk(w)]))]){b.accounts.set(page,corrupted);await assert.rejects(makeV2Action(request,issuer,options()));}
  b.accounts.set(page,raw(pageBytes));const normal=mock(b).readRpc;await assert.rejects(makeV2Action(request,issuer,{proposalIds:()=>[],readRpc:async(method,params)=>method==='getAccountInfo'&&params[0]===page?{context:{slot:50},value:b.accounts.get(page)}:normal(method,params)}),/context/);
});
