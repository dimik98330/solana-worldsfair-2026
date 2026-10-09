import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSigner,getTransactionDecoder,getTransactionEncoder,type KeyPairSigner} from '@solana/kit';
import {getTransferSolInstruction} from '@solana-program/system';
import {getMintToInstruction} from '@solana-program/token';
import {demoSigner,execute} from '../server/transactions.ts';
import {network,localDir,rpcUrl} from '../server/config.ts';
import {chainClock,rpc,signatureOf} from '../server/rpc.ts';
import {canonicalJson} from '../server/request-contract.ts';
import {ata,deriveFinancialTerms} from '../packages/client/src/program.ts';
import type {LifecycleRunResult} from '../server/lifecycle-run.ts';
import type {CouponRunResult} from '../server/coupon-run.ts';

// Explicit test-only driver. Importing/running this file sends generated localnet
// transactions; it is intentionally excluded from passive verification/tests.
const release=JSON.parse(fs.readFileSync('programs/bondtrace/release.json','utf8'));
const runtimeFile=path.join('.local/backend-execution',release.sha256.slice(0,12),'runtime.json');
const runtime=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));
assert.equal(network,'localnet');assert.equal(localDir,path.resolve(runtime.dataDirectory));assert.equal(rpcUrl,runtime.rpcUrl);
assert.equal(runtime.ledgerStorage,'wsl-native','Use the recorded isolated native runtime');assert.equal(runtime.readiness.status,'ready');
const origin=runtime.apiOrigin as string,runTag=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,17)+'-'+crypto.randomUUID().slice(0,8);
const evidenceFile=process.env.BONDTRACE_STRENGTH_EVIDENCE??process.env.BONDTRACE_EXECUTION_EVIDENCE??`docs/evidence/execution-strengthening-${runTag}.json`;
assert.match(evidenceFile,/^docs\/evidence\/execution-[a-z0-9-]+\.json$/);assert.equal(fs.existsSync(evidenceFile),false,'Preserve previous evidence');
const progressFile=path.join(path.dirname(runtimeFile),`strength-progress-${runTag}.json`);
const receipts:any[]=[],auxiliary:any[]=[],runs:CouponRunResult[]=[],jobs:{stage:string;result:LifecycleRunResult}[]=[],snapshots:{stage:string;state:any}[]=[],progress:any[]=[];
let bond='',parentId='lifecycle-strength-'+crypto.randomUUID();
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function checkpoint(stage:string,detail:Record<string,unknown>={}){
 progress.push({at:new Date().toISOString(),stage,...detail});
 // Public identifiers only: no signer/keypair/raw wire is written here.
 fs.writeFileSync(progressFile,JSON.stringify({scope:'public test recovery metadata',origin,rpcUrl,bond,parentId,receipts,auxiliary,progress},null,2)+'\n');
 console.log(JSON.stringify({stage,bond,parentId,...detail}));
}
async function api<T=any>(route:string,body?:unknown,timeoutMs=90000):Promise<T>{
 let response:Response|undefined;
 for(let attempt=0;attempt<3;attempt++){
  try{response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{connection:'close',...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});break;}
  catch(error){if(body!==undefined||attempt===2)throw error;await pause(300);}
 }
 const value=await response!.json();if(!response!.ok)throw new Error(JSON.stringify({route,status:response!.status,error:value.error}));return value;
}
const state=()=>api('/api/state?instrument='+bond);
async function observe(stage:string){const value=await state();snapshots.push({stage,state:value});return value;}
async function due(ts:bigint){const deadline=Date.now()+420000;while((await chainClock()).timestamp<ts){if(Date.now()>deadline)throw new Error('Chain clock did not reach the saved contractual date');await pause(800);}}
async function action(name:string,signer:KeyPairSigner,params:Record<string,unknown>={}){
 const prepared=await api('/api/actions/prepare',{action:name,walletAddress:signer.address,...(bond?{bondAddress:bond}:{}),params});
 assert.equal(prepared.programRelease.sha256,release.sha256);assert.equal(prepared.programRelease.genesisHash,runtime.genesisHash);assert.equal(prepared.summary.simulation.success,true);
 const decoded=getTransactionDecoder().decode(Buffer.from(prepared.transactionBase64,'base64'));
 const signatureBytes=new Uint8Array(await crypto.subtle.sign('Ed25519',signer.keyPair.privateKey,new Uint8Array(decoded.messageBytes)));
 const wire=Buffer.from(getTransactionEncoder().encode({...decoded,signatures:{...decoded.signatures,[signer.address]:signatureBytes as any}})).toString('base64'),signature=signatureOf(wire);
 if(name==='initialize_issue')bond=prepared.summary.instrumentAddress;
 const record={action:name,wallet:signer.address,signature,operationId:prepared.operationId,summary:prepared.summary,bytes:prepared.bytes};receipts.push(record);
 checkpoint('before-wallet-submit',{action:name,signature,operationId:prepared.operationId});
 // Exactly one POST for these bytes. Unknown transport/outcome stops this driver;
 // retained operation ID/signature in progress identifies recovery without re-sign.
 let result=await api('/api/transactions/submit',{signedTransactionBase64:wire});
 for(let attempt=0;result.status!=='confirmed'&&attempt<20;attempt++){
  if(result.status==='error')throw new Error('The retained transaction was rejected: '+prepared.operationId);
  await pause(500);result=await api('/api/operations/'+prepared.operationId);
 }
 assert.equal(result.status,'confirmed','Recover this existing operation before a new signature: '+prepared.operationId);assert.equal(result.signature,signature);
 const retained=await api('/api/operations/'+prepared.operationId);assert.equal(retained.signature,signature);assert.equal(retained.projectionStatus,'complete');
 checkpoint('wallet-confirmed',{action:name,signature,operationId:prepared.operationId});return result;
}
function jobInput(maxTransactions:number){return {operationId:parentId,bondAddress:bond,mode:'explicit-localnet-generated-issuer',maxTransactions};}
async function job(stage:string,maxTransactions:number){
 checkpoint('before-explicit-lifecycle-resume',{stageName:stage,maxTransactions});
 const result=await api<LifecycleRunResult>('/api/lifecycle/resume',jobInput(maxTransactions));jobs.push({stage,result});
 checkpoint('lifecycle-observed',{stageName:stage,status:result.status,digest:result.plan.digest,signatures:result.stages.flatMap(s=>s.signatures)});
 assert.ok(!['pending','unknown','blocked','error','running'].includes(result.status),'Recover this same parent/children before any new financial POST: '+parentId);return result;
}
function restart(kind:'Api'|'Validator'){
 checkpoint('controlled-runtime-restart',{kind,recordedLedger:runtime.ledger});
 execFileSync('pwsh',['-NoProfile','-File','scripts/backend-runtime.ps1','-RpcPort',String(new URL(rpcUrl).port),'-ApiPort',String(new URL(origin).port),'-Restart'+kind],{cwd:process.cwd(),windowsHide:true,timeout:kind==='Validator'?240000:90000,stdio:'ignore'});
 const reopened=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));assert.equal(reopened.genesisHash,runtime.genesisHash);assert.equal(reopened.ledger,runtime.ledger);assert.equal(reopened.dataDirectory,runtime.dataDirectory);assert.equal(reopened.programSha256,release.sha256);assert.equal(reopened.readiness.status,'ready');
 return reopened;
}
async function main(){
 const health=await api('/api/health');assert.equal(health.program.status,'known-match');assert.equal(health.program.observed.sha256,release.sha256);assert.equal(health.chain.genesisHash,runtime.genesisHash);
 const html=await fetch(origin,{signal:AbortSignal.timeout(15000)});assert.ok(html.ok);assert.match(await html.text(),/<script[^>]+type="module"/);
 const initial=await api('/api/state');assert.ok(initial.instrument?.settlementMint,'Bootstrap the recorded test runtime first');
 const issuer=await demoSigner('issuer'),holders=await Promise.all(Array.from({length:6},()=>generateKeyPairSigner()));assert.equal(initial.instrument.issuer,issuer.address);
 // Test funds only, same original generated issuer/mint. No real asset or airdrop.
 const tokenGap=27_500_000_000n-BigInt(initial.instrument.settlementBalanceMinor);
 if(tokenGap>0n){const source=await ata(issuer.address,initial.instrument.settlementMint),funded=await execute([getMintToInstruction({mint:initial.instrument.settlementMint,token:source,mintAuthority:issuer,amount:tokenGap})],issuer,'strength_test_settlement_funding',[],initial.instrument.settlementMint);assert.equal(funded.status,'confirmed');auxiliary.push({kind:'test-settlement-token-mint',amountMinor:tokenGap.toString(),signature:funded.signature});checkpoint('test-settlement-funded',{signature:funded.signature});}
 for(const holder of holders){const funded=await execute([getTransferSolInstruction({source:issuer,destination:holder.address,amount:10_000_000n})],issuer,'strength_holder_test_funding');assert.equal(funded.status,'confirmed');auxiliary.push({kind:'test-sol-funding',wallet:holder.address,signature:funded.signature});checkpoint('test-holder-funded',{wallet:holder.address,signature:funded.signature});}
 const start=(await chainClock()).timestamp,record1=start+180n,record2=start+240n,maturity=start+300n;
 await action('initialize_issue',issuer,{seriesId:String(Date.now()),name:'BondTrace · Strengthened lifecycle',settlementMint:initial.instrument.settlementMint,faceValueMinor:'1000000000',rateBps:'1000',couponFrequency:'2',maturityTs:String(maturity),coupons:[{recordTs:String(record1),paymentTs:String(record1+1n),unitAmount:'50000000'},{recordTs:String(record2),paymentTs:String(record2+1n),unitAmount:'50000000'}]});
 const quantities=[10,5,3,2,4,1];
 for(let i=0;i<holders.length;i++){await action('register_holder',issuer,{holderWallet:holders[i].address,label:'Strength holder '+(i+1)});await action('issue_units',issuer,{holderWallet:holders[i].address,units:String(quantities[i])});}
 let read=await observe('draft-rate-on-chain');const terms=read.instrument.financialTerms;
 assert.equal(read.instrument.rateBasis,'on-chain-program-validated-rate-v1');assert.equal(terms.address,await deriveFinancialTerms(bond));assert.equal(terms.bond,bond);assert.equal(terms.version,1);assert.equal(terms.faceValueMinor,'1000000000');assert.equal(terms.rateBps,1000);assert.equal(terms.couponFrequency,2);assert.equal(terms.couponUnitMinor,'50000000');assert.equal(terms.contextSlot,read.context.slot);assert.equal(read.instrument.requiredReserveMinor,'27500000000');
 await action('fund_vault',issuer,{amountMinor:'27500000000'});await action('seal_issue',issuer);await action('create_vote',issuer,{proposalId:'21',title:'Approve the next disclosure schedule'});await action('cast_vote',holders[0],{proposalId:'21',choice:'yes'});await action('cast_vote',holders[1],{proposalId:'21',choice:'no'});
 read=await observe('sealed-before-date');assert.equal(read.proposals[0].yesWeight,'10');assert.equal(read.proposals[0].noWeight,'5');assert.ok((await chainClock()).timestamp<record1,'Setup exceeded its before-record-date test budget; preserve this instrument instead of creating another one');
 const signaturesBefore=read.activity.filter((a:any)=>a.bond===bond).map((a:any)=>a.signature).sort();
 const planned=await api<LifecycleRunResult>('/api/lifecycle/plan',jobInput(1));assert.equal(planned.status,'waiting_date');assert.equal(planned.signature,null);assert.equal(planned.stages.every(s=>s.signature===null&&s.signatures.length===0),true);
 const early=await job('before-date-no-send',1);assert.equal(early.status,'waiting_date');assert.equal(early.plan.digest,planned.plan.digest);read=await state();assert.deepEqual(read.activity.filter((a:any)=>a.bond===bond).map((a:any)=>a.signature).sort(),signaturesBefore);
 await due(record1);const captured=await job('capture-first-record',1);assert.ok(captured.stages[0].signature);assert.equal(captured.plan.digest,planned.plan.digest);
 await action('transfer_bonds',holders[0],{targetWallet:holders[1].address,units:'2'});await due(record1+1n);await action('claim_coupon',holders[0],{couponId:'0'});
 read=await observe('first-historical-rights');assert.equal(read.holders[0].units,'8');assert.equal(read.coupons[0].entitlements[0].units,'10');assert.equal(read.coupons[0].entitlements[0].amountMinor,'500000000');assert.equal(read.coupons[0].entitlements[0].claimed,true);
 const firstBatchJob=await job('first-coupon-first-batch',1),coupon0Stage=firstBatchJob.plan.stages.find(s=>s.kind==='coupon_run'&&s.couponId==='0')!;
 const first=await api<CouponRunResult>('/api/operations/'+coupon0Stage.operationId);assert.equal(first.status,'ready');assert.equal(first.totalGroups,2);assert.equal(first.completedGroups,1);assert.equal(first.groups[0].holderWallets.length,4);assert.equal(first.groups[1].holderWallets.length,1);
 const firstSignature=first.groups[0].signature!;assert.ok(firstSignature);const firstTx=await rpc<any>('getTransaction',[firstSignature,{encoding:'base64',commitment:'confirmed',maxSupportedTransactionVersion:1}]);assert.equal(firstTx.meta.err,null);const batchBytes=Buffer.from(firstTx.transaction[0],'base64').length;assert.ok(batchBytes<=1232);assert.ok(firstTx.meta.computeUnitsConsumed>0);
 restart('Api');const passive=await api<LifecycleRunResult>('/api/lifecycle/'+parentId),retainedBatch=await api<CouponRunResult>('/api/operations/'+coupon0Stage.operationId);
 assert.equal(passive.plan.digest,planned.plan.digest);assert.equal(passive.stages[0].signature,captured.stages[0].signature);assert.equal(retainedBatch.groups[0].signature,firstSignature);assert.equal(retainedBatch.completedGroups,1);
 await job('first-coupon-second-batch-after-api-restart',1);const coupon0=await api<CouponRunResult>('/api/operations/'+coupon0Stage.operationId);assert.equal(coupon0.status,'completed');assert.equal(coupon0.completedGroups,2);assert.equal(coupon0.groups[0].signature,firstSignature);runs.push(coupon0);
 await due(record2);await job('capture-second-record',1);read=await observe('second-record-current-holdings');assert.equal(read.coupons[1].entitlements[0].units,'8');assert.equal(read.coupons[1].entitlements[0].amountMinor,'400000000');
 await due(record2+1n);const secondJob=await job('second-coupon-batches',2),coupon1Stage=secondJob.plan.stages.find(s=>s.kind==='coupon_run'&&s.couponId==='1')!;
 const coupon1=await api<CouponRunResult>('/api/operations/'+coupon1Stage.operationId);assert.equal(coupon1.status,'completed');assert.equal(coupon1.totalGroups,2);assert.equal(coupon1.completedGroups,2);runs.push(coupon1);
 await due(maturity);const holderBarrier=await job('open-redemption-holder-boundary',1);assert.equal(holderBarrier.status,'awaiting_holder_signature');assert.equal(holderBarrier.barriers.length,6);assert.equal(holderBarrier.barriers.every(b=>b.kind==='holder-signature'&&b.request?.action==='redeem_principal'),true);assert.equal(holderBarrier.financialClosure.principalRemainingMinor,'25000000000');
 const beforePrincipal=await state();assert.equal(beforePrincipal.instrument.redeemedSupply,'0');await api('/api/lifecycle/'+parentId);assert.equal((await state()).instrument.redeemedSupply,'0');
 for(const holder of holders)await action('redeem_principal',holder);
 const closed=await api<LifecycleRunResult>('/api/lifecycle/'+parentId);jobs.push({stage:'financially-closed',result:closed});assert.equal(closed.status,'financially_closed');assert.equal(closed.signature,null);assert.equal(closed.financialClosure.closed,true);assert.equal(closed.financialClosure.remainingObligationsMinor,'0');assert.equal(closed.financialClosure.mintSupplyUnits,'0');assert.equal(closed.financialClosure.redeemedUnits,'25');assert.equal(closed.finality.status,'unknown');assert.equal(closed.finality.finalityPending,true);assert.ok(closed.finality.unlinkedExternalEvents.includes('holder-principal-signatures-not-linked-to-parent'));
 for(const stage of closed.stages.filter(s=>s.signature)){const descriptor=closed.plan.stages.find(s=>s.operationId===stage.operationId)!;receipts.push({action:descriptor.kind,wallet:issuer.address,signature:stage.signature,operationId:stage.operationId,via:'durable-lifecycle-generated-issuer'});}
 const replay=await job('closed-explicit-replay-no-new-signature',4);assert.deepEqual(replay.stages.flatMap(s=>s.signatures),closed.stages.flatMap(s=>s.signatures));assert.equal(replay.plan.digest,planned.plan.digest);
 read=await observe('financially-closed');assert.equal(read.servicing.fullySettled,true);assert.equal(read.reconciliation.totals.cashPaid.baseUnits,'27500000000');assert.equal(read.reconciliation.totals.couponPaid.baseUnits,'2500000000');assert.equal(read.reconciliation.totals.principalPaid.baseUnits,'25000000000');assert.equal(read.reconciliation.totals.remainingObligations.baseUnits,'0');assert.equal(read.instrument.vaultBalanceMinor,'0');assert.equal(read.reconciliation.supply.mintSupplyUnits,'0');assert.equal(read.proposals[0].yesWeight,'10');assert.equal(read.proposals[0].noWeight,'5');
 const all=[...receipts,...auxiliary,...runs.flatMap(r=>r.groups)],unique=new Set(all.map(item=>item.signature));assert.equal(unique.size,all.length,'Every actual signature must be counted exactly once');
 const finalityBySignature=new Map<string,any>(),pending=new Set<string>(unique),deadline=Date.now()+60000;
 while(pending.size&&Date.now()<deadline){for(const signature of [...pending]){if(Date.now()>=deadline)break;const observed=await api('/api/transactions/'+signature,undefined,15000);assert.equal(observed.status,'confirmed');assert.equal(observed.finality.signature,signature);assert.equal(observed.finality.genesisHash,runtime.genesisHash);finalityBySignature.set(signature,observed);if(observed.finality.status==='finalized'&&observed.finality.source==='live-rpc')pending.delete(signature);}if(pending.size)await pause(600);}
 assert.equal(pending.size,0,'Bounded live finality verification timed out; no absent history is promoted');
 const archivedProofs:any[]=[];
 for(const item of all){let observed=await api('/api/transactions/'+item.signature+'/proof');if(observed.executionProof?.proof?.commitment!=='finalized')observed=await api('/api/transactions/'+item.signature+'/proof?retry=true');assert.equal(observed.status,'confirmed');assert.equal(observed.executionProof?.capture?.status,'captured');assert.equal(observed.executionProof?.matchesStoredReceipt,true);assert.equal(observed.executionProof.proof.signature,item.signature);assert.equal(observed.executionProof.proof.expectedWireMatched,true);assert.equal(observed.executionProof.proof.schemaVersion,2);assert.equal(observed.executionProof.proof.commitment,'finalized');assert.equal(observed.executionProof.proof.source,'retained-finalized-rpc-transaction');assert.equal(observed.executionProof.proof.provenance.requestedCommitment,'finalized');assert.equal(observed.executionProof.provenance.source,'retained-observation');archivedProofs.push(observed.executionProof);}
 const beforeRestart={genesis:await rpc('getGenesisHash'),totals:read.reconciliation.totals,supply:read.reconciliation.supply,terms:read.instrument.financialTerms,digest:closed.plan.digest,signatures:[...unique].sort()};
 const restarted=restart('Validator'),afterHealth=await api('/api/health');assert.equal(afterHealth.program.status,'known-match');assert.equal(afterHealth.chain.genesisHash,beforeRestart.genesis);const after=await observe('native-validator-restart');assert.deepEqual(after.reconciliation.totals,beforeRestart.totals);assert.deepEqual(after.reconciliation.supply,beforeRestart.supply);
 const {contextSlot:_beforeSlot,...beforeTerms}=beforeRestart.terms,{contextSlot:_afterSlot,...afterTerms}=after.instrument.financialTerms;assert.deepEqual(afterTerms,beforeTerms);
 const afterJob=await api<LifecycleRunResult>('/api/lifecycle/'+parentId);assert.equal(afterJob.status,'financially_closed');assert.equal(afterJob.plan.digest,beforeRestart.digest);assert.deepEqual(afterJob.stages.flatMap(s=>s.signatures).sort(),closed.stages.flatMap(s=>s.signatures).sort());assert.equal(afterJob.finality.finalityPending,true);
 for(const signature of unique){const observed=await api('/api/transactions/'+signature);assert.equal(observed.status,'confirmed');assert.equal(observed.finality.status,'finalized');assert.ok(['live-rpc','retained-observation'].includes(observed.finality.source));assert.equal(observed.finality.genesisHash,runtime.genesisHash);}
 const exported=await api('/api/evidence?instrument='+bond);assert.equal(exported.integrity.payloadSha256,createHash('sha256').update(canonicalJson(exported.payload)).digest('hex'));
 const result={checkedAt:new Date().toISOString(),scope:'Actual isolated native localnet strengthened release; generated external test signatures and explicit issuer lifecycle execution. No human wallet/devnet/real assets/production proof.',origin,rpcUrl,bond,parentId,program:health.program,receipts,auxiliary,runs,jobs,snapshots,archivedProofs,finality:[...finalityBySignature.values()],runtimeRestart:{beforeGenesis:beforeRestart.genesis,afterGenesis:afterHealth.chain.genesisHash,ledger:restarted.ledger,storage:restarted.ledgerStorage,readiness:restarted.readiness},checks:{onChainAtomicRateTerms:true,beforeDateNoTransaction:true,recordRightsSurviveTransfer:true,externalHolderCouponPlusTwoIssuerBatches:true,apiRestartFixedParentDigestAndChildSignature:true,principalOnlyExternalHolderSigning:true,financialClosureSeparateFromAggregateFinality:true,allActualTransactionsObservedFinalized:true,finalizedRpcProofs:true,nativeValidatorRestartWithoutReset:true,sameParentReplayNoNewSignature:true,firstBatchBytes:batchBytes,firstBatchComputeUnits:firstTx.meta.computeUnitsConsumed},counts:{walletAndDirectIssuerReceipts:receipts.length,couponBatchReceipts:runs.flatMap(r=>r.groups).length,auxiliaryTransactions:auxiliary.length,distinctTransactions:unique.size},state:after,evidenceDigest:exported.integrity};
 fs.writeFileSync(evidenceFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});checkpoint('strengthening-complete',{evidenceFile,distinctTransactions:unique.size});console.log(JSON.stringify({passed:true,bond,parentId,evidenceFile,distinctTransactions:unique.size,couponMinor:'2500000000',principalMinor:'25000000000',burned:'25',aggregateFinality:'unknown-unlinked-external-holder-signatures'}));
}
try{await main();}catch(error){checkpoint('stopped-preserve-recovery',{message:error instanceof Error?error.message:'Driver interrupted',progressFile});throw error;}
