import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {getAddressDecoder,getBase58Decoder} from '@solana/kit';
import {getMintDecoder,getMintEncoder} from '@solana-program/token';
import * as program from '../../packages/client/src/program.ts';
import type {ChainView} from '../../server/chain-view.ts';
import type {ProgramIdentity} from '../../server/program-identity.ts';
import type {LifecycleRunDependencies,LifecycleRunRequest} from '../../server/lifecycle-run.ts';

process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/lifecycle-run-'+crypto.randomUUID());
const [{createLifecycleRunCoordinator},{createCouponRunExecutor},operations,journal,{closeStorage},{AppError},{normalizeRequest}]=await Promise.all([
 import('../../server/lifecycle-run.ts'),import('../../server/coupon-run.ts'),import('../../server/operations.ts'),import('../../server/journal.ts'),import('../../server/storage.ts'),import('../../server/rpc.ts'),import('../../server/request-contract.ts')
]);
after(closeStorage);
const key=(id:number)=>getAddressDecoder().decode(new Uint8Array(32).fill(id));
const code=(name:string)=>(error:unknown)=>error instanceof AppError&&error.code===name;
let sequence=0;
async function setup(count=2){
 const issuer=key(1),mint=key(2),genesis=String(key(3)),series=BigInt(++sequence),bond=await program.deriveBond(issuer,series),bondMint=await program.derive('bond_mint',bond),vault=await program.derive('vault',bond),registry=Array.from({length:count},(_,i)=>key(10+i));
 const minted=(supply:bigint,decimals:number,owner:string)=>getMintDecoder().decode(getMintEncoder().encode({mintAuthority:owner as any,freezeAuthority:owner as any,supply,decimals,isInitialized:true}));
 const view:ChainView={address:bond,contextSlot:100,clock:{slot:100n,timestamp:90n},accountCount:10,
  bond:{issuer,bondMint,settlementMint:mint,vault,seriesId:series,name:'Synthetic lifecycle',faceValue:1000n,maturityTs:300n,totalIssued:BigInt(count),totalRedeemed:0n,state:1,bump:255,nextCouponIndex:0,principalClaimedMask:0,holderWallets:registry,couponTerms:[{recordTs:100n,paymentTs:200n,unitAmount:50n}],redemptionUnits:[]},
  bondMint:minted(BigInt(count),0,bond),settlementMint:minted(1000000n,6,issuer),
  holders:await Promise.all(registry.map(async owner=>({address:await program.ata(owner,bondMint),owner,mint:bondMint,amount:1n,state:2,closed:false}))),
  vault:{address:vault,owner:bond,mint,amount:BigInt(count)*1050n+9n,state:1,closed:false},issuerSettlement:{address:await program.ata(issuer,mint),owner:issuer,mint,amount:1n,state:1,closed:false},
  coupons:[null],couponAddresses:[await program.derive('coupon',bond,0)],proposals:[],missingProposalIds:[],
  proposalDiscovery:{source:'program-accounts',commitment:'confirmed',scope:'discovery-slot',contextSlot:100,verificationContextSlot:100,financialContextSlot:100,discoveredIds:[],catalogIds:[],queriedIds:[],selection:'lowest-proposal-id',discoveredCount:0,selectedIds:[],selectedDiscoveredCount:0,omittedDiscoveredCount:0,omittedCatalogIds:[],catalogIdsAbsentAtDiscovery:[],unverifiedPdaCount:0,maxProposals:32,completeAtFinancialContext:false}
 };
 const release={programId:program.PROGRAM_ID,sha256:'a'.repeat(64),genesisHash:genesis};
 const identity:ProgramIdentity={signingAllowed:true,status:'known-match',programId:program.PROGRAM_ID,genesisHash:genesis,
  expected:{schemaVersion:1,programId:program.PROGRAM_ID,loader:'BPFLoaderUpgradeable',programLen:100,sha256:release.sha256},code:'PROGRAM_MATCH',message:'Synthetic release',network:'localnet',rpcUrl:'synthetic',loaderAddress:key(4),contextSlot:100,observedAt:new Date().toISOString(),observed:null,
  verification:{commitment:'confirmed',scope:'rpc-observed-deployed-bytecode',method:'full-payload',payloadContextSlot:100,headerContextSlot:100,sourceToBinaryAttested:false}};
 let time=1000,mode:'normal'|'before-child-sign'|'after-child-sign'='normal',sends=0,callbacks=0,generatedIssuer=issuer,network='localnet',currentGenesis=genesis;
 let sendHook:(id:string)=>Promise<void>=async()=>{};
 const statuses=new Map<string,{status:string;projectionStatus:string}>(),ids:string[]=[],actions:string[]=[];
 function apply(action:string,params:Record<string,unknown>){
  if(action==='capture_coupon'){assert.equal(params.couponId,'0');assert.equal(view.bond.nextCouponIndex,0);view.coupons[0]={bond,index:0,recordTs:100n,paymentTs:200n,capturedAt:view.clock.timestamp,unitAmount:50n,totalUnits:BigInt(count),units:registry.map(()=>1n),claimedMask:0,paidTotal:0n,bump:255};view.bond.nextCouponIndex=1;}
  else if(action==='settle_coupon'){const c=view.coupons[0]!;for(const wallet of params.holderWallets as string[]){const i=registry.indexOf(wallet as any);assert.ok(i>=0);assert.equal(c.claimedMask&(1<<i),0);c.claimedMask|=1<<i;c.paidTotal+=50n;view.vault.amount-=50n;}}
  else if(action==='begin_redemption'){assert.equal(view.bond.state,1);view.bond.state=2;view.bond.redemptionUnits=registry.map(()=>1n);}
  else throw new Error('Forbidden synthetic dispatch '+action);
  view.contextSlot++;view.clock.slot=BigInt(view.contextSlot);
 }
 const recover:LifecycleRunDependencies['operationStatus']=async id=>{const child=operations.findOperation(id)!;const result=statuses.get(id)??{status:'unknown',projectionStatus:'pending'};operations.updateOperation(id,{status:result.status,chainStatus:result.status,projectionStatus:result.projectionStatus as any});return {...result,signature:child.signature};};
 const demoAction:LifecycleRunDependencies['demoAction']=async(input,policy)=>{
  callbacks++;input=normalizeRequest(input);const id=input.operationId!;ids.push(id);actions.push(input.action);
  const parent=journal.journalValues<import('../../server/operations.ts').Operation>('operations').find(o=>o.action==='lifecycle_run'&&(o.metadata?.plan as any)?.stages.some((s:any)=>s.operationId===id));
  if(input.action!=='settle_coupon'){assert.ok(parent);assert.ok((parent!.metadata!.dispatches as any)[id]);assert.ok(operations.findOperation(id),'Direct child must be durable before sender callback');}
  assert.deepEqual(policy.requiredProgramRelease,release);
  if(mode==='before-child-sign')throw new Error('Synthetic crash after child persist before sign');
  const claim=operations.claimDemoOperation(id,input.action,'issuer',input.params??{});if(!claim.claimed)return operations.findOperation(id);
  const bytes=Buffer.alloc(64,1);createHash('sha256').update(id).digest().copy(bytes);const signature=getBase58Decoder().decode(bytes);
  operations.updateOperation(id,{signature,status:'pending',chainStatus:'pending',projectionStatus:'pending',wallet:issuer,bond,programRelease:{...release}});statuses.set(id,{status:'unknown',projectionStatus:'pending'});
  if(mode==='after-child-sign')throw new Error('Synthetic crash after retaining signed child');
  await sendHook(id);sends++;apply(input.action,input.params??{});statuses.set(id,{status:'confirmed',projectionStatus:'complete'});return {status:'confirmed',signature};
 };
 const coupon=createCouponRunExecutor({readView:async()=>structuredClone(view),readGenesis:async()=>currentGenesis,verifyProgram:async()=>structuredClone(identity),fixture:()=>({complete:true,roles:{issuer:generatedIssuer}} as any),network:'localnet',demoEnabled:true,demoAction,operationStatus:recover});
 const deps:LifecycleRunDependencies={readView:async()=>structuredClone(view),readGenesis:async()=>currentGenesis,verifyProgram:async()=>structuredClone(identity),fixture:()=>({complete:true,roles:{issuer:generatedIssuer}} as any),network:'localnet',demoEnabled:true,demoAction,operationStatus:recover,runCouponSettlement:coupon.runCouponSettlement,couponRunStatus:coupon.couponRunStatus,now:()=>time};
 Object.defineProperty(deps,'network',{get:()=>network});
 const input:LifecycleRunRequest={operationId:'lifecycle-'+crypto.randomUUID(),bondAddress:bond,mode:'explicit-localnet-generated-issuer',maxTransactions:4};
 const executor=createLifecycleRunCoordinator(deps);
 function redeemExternally(){assert.equal(view.bond.state,2);view.bond.totalRedeemed=view.bond.totalIssued;view.bond.principalClaimedMask=(1<<count)-1;view.bond.state=3;view.bondMint.supply=0n;for(const h of view.holders)h.amount=0n;view.vault.amount-=BigInt(count)*1000n;view.contextSlot++;}
 return {executor,deps,input,view,identity,ids,actions,statuses,apply,redeemExternally,
  counts:()=>({sends,callbacks}),setTime:(value:number)=>{time=value;},setMode:(value:typeof mode)=>{mode=value;},setIssuer:(value:typeof issuer)=>{generatedIssuer=value;},setNetwork:(value:string)=>{network=value;},setGenesis:(value:string)=>{currentGenesis=value;},setHook:(value:typeof sendHook)=>{sendHook=value;},
  confirm:(id:string)=>{const child=operations.findOperation(id)!;apply(child.action,child.params??{});statuses.set(id,{status:'confirmed',projectionStatus:'complete'});}};
}

test('startup before record date persists immutable manifest, exposes barrier and never sends on plan or status',async()=>{
 const f=await setup(),planned=await f.executor.planLifecycleRun(f.input);assert.equal(planned.status,'waiting_date');assert.equal(planned.signature,null);assert.equal(planned.barriers[0].dueTs,'100');assert.equal(planned.plan.stages.length,3);assert.equal(planned.plan.instrument.registry.length,2);
 await f.executor.lifecycleRunStatus(f.input.operationId);await f.executor.runLifecycle(f.input);assert.equal(f.counts().sends,0);assert.equal(f.counts().callbacks,0);
});

test('durable direct children use the real normalized action contract including instrument binding',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;const first=await f.executor.runLifecycle({...f.input,maxTransactions:1}),capture=first.plan.stages[0];
 assert.equal(capture.params.bondAddress,f.input.bondAddress);assert.deepEqual(operations.findOperation(capture.operationId)?.params,normalizeRequest({action:'capture_coupon',bondAddress:f.input.bondAddress,params:{couponId:'0'}}).params);
 closeStorage();const resumed=await createLifecycleRunCoordinator(f.deps).runLifecycle(f.input);assert.equal(resumed.status,'awaiting_holder_signature');
 const redemption=resumed.plan.stages.at(-1)!;assert.deepEqual(operations.findOperation(redemption.operationId)?.params,normalizeRequest({action:'begin_redemption',bondAddress:f.input.bondAddress,params:{}}).params);
 assert.equal(f.ids.filter(id=>id===capture.operationId).length,1);assert.equal(f.counts().sends,3);
});

test('review-only exposes usable unsigned action and never dispatches even at maturity',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;const result=await f.executor.runLifecycle({...f.input,mode:'review-only'});assert.equal(result.status,'ready');assert.equal(result.readyActionRequest?.action,'capture_coupon');assert.equal(result.readyActionRequest?.walletAddress,String(f.view.bond.issuer));assert.equal(f.counts().callbacks,0);
});

test('full issuer lifecycle captures, uses coupon-run, opens redemption and stops at holder signature',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;const result=await f.executor.runLifecycle(f.input);
 assert.equal(result.status,'awaiting_holder_signature');assert.deepEqual(f.actions,['capture_coupon','settle_coupon','begin_redemption']);assert.equal(f.counts().sends,3);assert.equal(result.barriers.length,2);assert.equal(result.barriers[0].request?.action,'redeem_principal');assert.equal(result.financialClosure.principalRemainingMinor,'2000');assert.equal(result.signature,null);
 await f.executor.lifecycleRunStatus(f.input.operationId);await f.executor.runLifecycle(f.input);assert.equal(f.counts().sends,3);assert.equal(f.view.bond.totalRedeemed,0n);
});

test('maxTransactions binds invocation scheduling and completed same-ID replay adds no sends',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;const first=await f.executor.runLifecycle({...f.input,maxTransactions:1});assert.equal(f.counts().sends,1);assert.equal(first.status,'ready');assert.equal(first.readyActionRequest?.action,'settle_coupon');
 const next=await f.executor.runLifecycle({...f.input,maxTransactions:2});assert.equal(next.status,'awaiting_holder_signature');assert.deepEqual(next.plan,first.plan);assert.equal(f.counts().sends,3);
});

test('interruption after durable unsigned child resumes after executor restart with exactly the same child ID',async()=>{
 const f=await setup();f.view.clock.timestamp=110n;f.setMode('before-child-sign');const first=await f.executor.runLifecycle(f.input);assert.equal(first.status,'unknown');assert.equal(f.counts().sends,0);const childId=first.plan.stages[0].operationId;assert.ok(operations.findOperation(childId));assert.equal(operations.findOperation(childId)?.signature,undefined);
 closeStorage();f.setMode('normal');const resumed=await createLifecycleRunCoordinator(f.deps).runLifecycle(f.input);assert.equal(resumed.status,'waiting_date');assert.equal(f.counts().sends,1);assert.deepEqual(f.ids,[childId,childId]);
});

test('unknown signed child blocks new sends and restart preserves its exact recovery reference',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;f.setMode('after-child-sign');const first=await f.executor.runLifecycle(f.input);assert.equal(first.status,'unknown');const childId=first.plan.stages[0].operationId,signature=operations.findOperation(childId)!.signature;
 assert.ok(signature);closeStorage();f.setMode('normal');await createLifecycleRunCoordinator(f.deps).runLifecycle(f.input);assert.equal(f.counts().callbacks,1);assert.equal(operations.findOperation(childId)?.signature,signature);
 f.confirm(childId);const resumed=await f.executor.runLifecycle(f.input);assert.equal(resumed.status,'awaiting_holder_signature');assert.equal(f.counts().sends,2);assert.equal(f.ids.filter(id=>id===childId).length,1);
});

test('nested unknown coupon-group signature prevents other groups and redemption until same child recovers',async()=>{
 const f=await setup(6);f.view.clock.timestamp=310n;await f.executor.runLifecycle({...f.input,maxTransactions:1});f.setMode('after-child-sign');const interrupted=await f.executor.runLifecycle({...f.input,maxTransactions:1});assert.equal(interrupted.status,'unknown');const groupId=f.ids[1],signature=operations.findOperation(groupId)!.signature;
 f.setMode('normal');closeStorage();await createLifecycleRunCoordinator(f.deps).runLifecycle(f.input);assert.equal(f.counts().callbacks,2);assert.equal(operations.findOperation(groupId)?.signature,signature);assert.equal(f.view.bond.state,1);
 f.confirm(groupId);const recovered=await f.executor.runLifecycle(f.input);assert.equal(recovered.status,'awaiting_holder_signature');assert.equal(f.ids.filter(id=>id===groupId).length,1);assert.equal(f.view.coupons[0]!.paidTotal,300n);
});

test('replaced in-flight parent lease fences the prior owner before another child dispatch',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;f.setHook(async()=>{operations.updateOperation(f.input.operationId,{lease:{owner:'replacement-worker',expiresAt:500000}});});
 await assert.rejects(()=>f.executor.runLifecycle(f.input),code('LIFECYCLE_LEASE_CHANGED'));assert.equal(f.counts().sends,1);assert.equal(f.counts().callbacks,1);assert.equal(operations.findOperation(f.input.operationId)?.lease?.owner,'replacement-worker');
});

test('a sender returning without a durable signature is not retried implicitly within the same financial POST',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;let callbacks=0;f.deps.demoAction=async()=>{callbacks++;};
 const result=await createLifecycleRunCoordinator(f.deps).runLifecycle(f.input);assert.equal(result.status,'unknown');assert.equal(result.error?.code,'CHILD_OUTCOME_MISSING');assert.equal(callbacks,1);
});

test('same ID input changes, other active parent and forged child inputs cannot claim execution',async()=>{
 const f=await setup();await f.executor.planLifecycleRun(f.input);
 await assert.rejects(()=>f.executor.planLifecycleRun({...f.input,mode:'review-only'}),code('OPERATION_CONFLICT'));
 await assert.rejects(()=>f.executor.planLifecycleRun({...f.input,operationId:'lifecycle-'+crypto.randomUUID()}),code('LIFECYCLE_RUN_ACTIVE'));
 const planned=await f.executor.lifecycleRunStatus(f.input.operationId),childId=planned.plan.stages[0].operationId;operations.beginOperation(childId,'capture_coupon','issuer',{couponId:'1'});f.view.clock.timestamp=310n;
 const state=await f.executor.runLifecycle(f.input);assert.equal(state.status,'blocked');assert.equal(state.error?.code,'OPERATION_CONFLICT');assert.equal(f.counts().callbacks,0);
});

test('parent fenced lease prevents concurrent dispatch and stale owner cannot continue',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;let blocked!:(value:void)=>void;let entered!:(value:void)=>void;const waiting=new Promise<void>(resolve=>{entered=resolve;});
 f.setHook(async()=>{entered();await new Promise<void>(resolve=>{blocked=resolve;});});
 const first=f.executor.runLifecycle({...f.input,maxTransactions:1});await waiting;const concurrent=await f.executor.runLifecycle(f.input);assert.equal(concurrent.error?.code,'LIFECYCLE_LEASE_ACTIVE');assert.equal(f.counts().callbacks,1);blocked();await first;
 const parent=operations.findOperation(f.input.operationId)!;operations.updateOperation(parent.id,{lease:{owner:'other-worker',expiresAt:500000}});const second=await f.executor.runLifecycle(f.input);assert.equal(second.error?.code,'LIFECYCLE_LEASE_ACTIVE');assert.equal(f.counts().callbacks,1);
});

test('generated mode rejects foreign issuer, devnet, disabled demo and malformed contracts before dispatch',async()=>{
 const f=await setup();f.setIssuer(key(9));await assert.rejects(()=>f.executor.runLifecycle(f.input),code('UNAUTHORIZED_ISSUER'));assert.equal(operations.findOperation(f.input.operationId),null);
 f.setIssuer(f.view.bond.issuer);f.setNetwork('devnet');await assert.rejects(()=>f.executor.runLifecycle(f.input),code('LIFECYCLE_EXECUTION_DISABLED'));f.setNetwork('localnet');f.deps.demoEnabled=false;await assert.rejects(()=>f.executor.runLifecycle(f.input),code('LIFECYCLE_EXECUTION_DISABLED'));f.deps.demoEnabled=true;
 for(const bad of [{mode:'auto'},{maxTransactions:0},{maxTransactions:5},{maxTransactions:1.5},{extra:'no'},{operationId:'x'}])await assert.rejects(()=>f.executor.runLifecycle({...f.input,...bad} as any));assert.equal(f.counts().callbacks,0);
});

test('changed immutable terms, release or genesis blocks the preserved manifest',async()=>{
 const terms=await setup();await terms.executor.planLifecycleRun(terms.input);terms.view.bond.couponTerms[0].unitAmount=51n;terms.view.vault.amount+=2n;const changed=await terms.executor.runLifecycle(terms.input);assert.equal(changed.status,'blocked');assert.equal(changed.error?.code,'PLAN_STATE_CHANGED');assert.equal(terms.counts().callbacks,0);
 const release=await setup();await release.executor.planLifecycleRun(release.input);release.identity.expected!.sha256='b'.repeat(64);const wrong=await release.executor.runLifecycle(release.input);assert.equal(wrong.status,'blocked');assert.equal(wrong.error?.code,'PROGRAM_RELEASE_CHANGED');
 const chain=await setup();await chain.executor.planLifecycleRun(chain.input);chain.setGenesis(String(key(99)));const mismatch=await chain.executor.runLifecycle(chain.input);assert.equal(mismatch.status,'blocked');assert.equal(mismatch.error?.code,'CHAIN_IDENTITY_CHANGED');
});

test('external manual events are satisfied without invented signatures; zero obligations closes despite surplus and finality remains unknown',async()=>{
 const f=await setup();await f.executor.planLifecycleRun(f.input);f.view.clock.timestamp=310n;f.apply('capture_coupon',{couponId:'0'});f.apply('settle_coupon',{holderWallets:f.view.bond.holderWallets});f.apply('begin_redemption',{});f.redeemExternally();
 const result=await f.executor.lifecycleRunStatus(f.input.operationId);assert.equal(result.status,'financially_closed');assert.equal(result.financialClosure.closed,true);assert.equal(result.financialClosure.surplusMinor,'9');assert.equal(result.financialClosure.remainingObligationsMinor,'0');assert.equal(result.finality.status,'unknown');assert.equal(result.finality.finalityPending,true);assert.equal(result.finality.observations.length,0);assert.equal(result.stages.every(s=>s.status==='satisfied_external'&&s.signature===null),true);
 await f.executor.runLifecycle(f.input);assert.equal(f.counts().callbacks,0);
});

test('issuer completion plus external holder redemption closes finances without falsely claiming lifecycle finalized',async()=>{
 const f=await setup();f.view.clock.timestamp=310n;const issuer=await f.executor.runLifecycle(f.input);assert.equal(issuer.status,'awaiting_holder_signature');f.redeemExternally();const closed=await createLifecycleRunCoordinator(f.deps).lifecycleRunStatus(f.input.operationId);assert.equal(closed.status,'financially_closed');assert.equal(closed.finality.finalityPending,true);assert.ok(closed.finality.unlinkedExternalEvents.includes('holder-principal-signatures-not-linked-to-parent'));assert.equal(f.counts().sends,3);
});
