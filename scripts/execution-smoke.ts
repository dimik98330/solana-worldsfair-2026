import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSigner,getTransactionDecoder,getTransactionEncoder,type KeyPairSigner} from '@solana/kit';
import {getTransferSolInstruction} from '@solana-program/system';
import {getMintToInstruction} from '@solana-program/token';
import {demoSigner,execute} from '../server/transactions.ts';
import {network,localDir,rpcUrl} from '../server/config.ts';
import {chainClock,rpc} from '../server/rpc.ts';
import {canonicalJson} from '../server/request-contract.ts';
import {createHash} from 'node:crypto';
import {ata} from '../packages/client/src/program.ts';
import {execFileSync} from 'node:child_process';

const release=JSON.parse(fs.readFileSync('programs/bondtrace/release.json','utf8'));
const runtime=JSON.parse(fs.readFileSync(path.join('.local/backend-execution',release.sha256.slice(0,12),'runtime.json'),'utf8'));
assert.equal(network,'localnet');assert.equal(localDir,path.resolve(runtime.dataDirectory));assert.equal(rpcUrl,runtime.rpcUrl);
const origin=runtime.apiOrigin,receipts:any[]=[],auxiliary:any[]=[],runs:any[]=[],negativeChecks:string[]=[];
const evidenceFile=process.env.BONDTRACE_EXECUTION_EVIDENCE??'docs/evidence/execution-lifecycle-localnet.json';
if(!/^docs\/evidence\/execution-[a-z0-9-]+\.json$/.test(evidenceFile))throw new Error('Use a named execution evidence JSON inside docs/evidence');
if(fs.existsSync(evidenceFile))throw new Error('Preserve the previous evidence; choose a new BONDTRACE_EXECUTION_EVIDENCE filename');
async function api(route:string,body?:unknown){
 let response:Response|undefined;
 for(let attempt=0;attempt<3;attempt++){
  try{response=await fetch(origin+route,{method:body?'POST':'GET',headers:{connection:'close',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});break;}
  catch(error){if(body||attempt===2)throw error;await new Promise(r=>setTimeout(r,300));}
 }
 const value=await response!.json();if(!response!.ok)throw new Error(JSON.stringify({route,status:response!.status,error:value.error}));return value;
}
async function rejectPrepare(body:unknown,code:string){const r=await fetch(origin+'/api/actions/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,400);assert.equal((await r.json()).error.code,code);negativeChecks.push(code);}
const health=await api('/api/health');assert.equal(health.program.status,'known-match');assert.equal(health.program.observed.sha256,release.sha256);
const initial=await api('/api/state');assert.ok(initial.instrument?.settlementMint,'Bootstrap this isolated runtime first');
const issuer=await demoSigner('issuer'),holders=await Promise.all(Array.from({length:6},()=>generateKeyPairSigner()));
assert.equal(initial.instrument.issuer,issuer.address);
// This isolated fixture mint is controlled by the generated test issuer. A
// second smoke must explicitly provision its test settlement units, not assume
// the original bootstrap balance survived an earlier completed lifecycle.
const fundingGap=27_500_000_000n-BigInt(initial.instrument.settlementBalanceMinor);
if(fundingGap>0n){const source=await ata(issuer.address,initial.instrument.settlementMint);const funded=await execute([getMintToInstruction({mint:initial.instrument.settlementMint,token:source,mintAuthority:issuer,amount:fundingGap})],issuer,'execution_test_settlement_funding',[],initial.instrument.settlementMint);assert.equal(funded.status,'confirmed');auxiliary.push({kind:'test-settlement-token-mint',amountMinor:fundingGap.toString(),signature:funded.signature});}
for(const holder of holders){const sent=await execute([getTransferSolInstruction({source:issuer,destination:holder.address,amount:10_000_000n})],issuer,'execution_holder_test_funding');assert.equal(sent.status,'confirmed');auxiliary.push({kind:'test-sol-funding',wallet:holder.address,signature:sent.signature});}
let bond='';
async function action(name:string,signer:KeyPairSigner,params:Record<string,unknown>={}){
 const prepared=await api('/api/actions/prepare',{action:name,walletAddress:signer.address,...(bond?{bondAddress:bond}:{}),params});
 assert.equal(prepared.programRelease.sha256,release.sha256);assert.equal(prepared.summary.simulation.success,true);
 const decoded=getTransactionDecoder().decode(Buffer.from(prepared.transactionBase64,'base64'));
 const signature=new Uint8Array(await crypto.subtle.sign('Ed25519',signer.keyPair.privateKey,new Uint8Array(decoded.messageBytes)));
 const wire=Buffer.from(getTransactionEncoder().encode({...decoded,signatures:{...decoded.signatures,[signer.address]:signature as any}})).toString('base64');
 let result=await api('/api/transactions/submit',{signedTransactionBase64:wire});
 for(let attempt=0;result.status!=='confirmed'&&attempt<20;attempt++){await new Promise(r=>setTimeout(r,500));result=await api('/api/operations/'+prepared.operationId);}
 assert.equal(result.status,'confirmed');if(name==='initialize_issue')bond=prepared.summary.instrumentAddress;
 const retained=await api('/api/operations/'+prepared.operationId);assert.equal(retained.signature,result.signature);assert.equal(retained.projectionStatus,'complete');
 receipts.push({action:name,wallet:signer.address,signature:result.signature,operationId:prepared.operationId,summary:prepared.summary,bytes:prepared.bytes});
 console.log(JSON.stringify({action:name,status:result.status,bond,signature:result.signature}));return result;
}
const state=()=>api('/api/state?instrument='+bond);
async function due(ts:bigint){const deadline=Date.now()+300000;while((await chainClock()).timestamp<ts){if(Date.now()>deadline)throw new Error('Chain clock did not reach the scheduled date');await new Promise(r=>setTimeout(r,800));}}
const start=(await chainClock()).timestamp,record1=start+100n,record2=start+140n,maturity=start+190n;
await action('initialize_issue',issuer,{seriesId:String(Date.now()),name:'BondTrace · Audited rate lifecycle',settlementMint:initial.instrument.settlementMint,faceValueMinor:'1000000000',rateBps:'1000',couponFrequency:'2',maturityTs:String(maturity),coupons:[{recordTs:String(record1),paymentTs:String(record1+1n),unitAmount:'50000000'},{recordTs:String(record2),paymentTs:String(record2+1n),unitAmount:'50000000'}]});
const quantities=[10,5,3,2,4,1];
for(let i=0;i<holders.length;i++){await action('register_holder',issuer,{holderWallet:holders[i].address,label:'Execution holder '+(i+1)});await action('issue_units',issuer,{holderWallet:holders[i].address,units:String(quantities[i])});}
let read=await state();assert.equal(read.instrument.requiredReserveMinor,'27500000000');assert.equal(read.instrument.rateBps,1000);assert.equal(read.instrument.couponFrequency,2);
await action('fund_vault',issuer,{amountMinor:read.instrument.fundingGapMinor});await action('seal_issue',issuer);
await action('create_vote',issuer,{proposalId:'11',title:'Approve the next disclosure schedule'});await action('cast_vote',holders[0],{proposalId:'11',choice:'yes'});await action('cast_vote',holders[1],{proposalId:'11',choice:'no'});
await due(record1);await action('capture_coupon',holders[5],{couponId:'0'});await action('transfer_bonds',holders[0],{targetWallet:holders[1].address,units:'2'});
await due(record1+1n);await action('claim_coupon',holders[0],{couponId:'0'});
read=await state();assert.equal(read.coupons[0].entitlements[0].amountMinor,'500000000');assert.equal(read.servicing.couponSettlementBatches[0].holderWallets.length,4);
await rejectPrepare({action:'settle_coupon',walletAddress:issuer.address,bondAddress:bond,params:{couponId:'0',holderWallets:[(await generateKeyPairSigner()).address]}},'NOT_HOLDER');
const runId='coupon-execution-'+crypto.randomUUID();const first=await api('/api/demo/coupon-run',{operationId:runId,bondAddress:bond,couponId:'0',maxBatches:1});
assert.equal(first.status,'ready');assert.equal(first.totalGroups,2);assert.equal(first.completedGroups,1);assert.equal(first.groups[0].holderWallets.length,4);assert.equal(first.groups[0].status,'confirmed');
const firstSignature=first.groups[0].signature,firstTx=await rpc<any>('getTransaction',[firstSignature,{encoding:'base64',commitment:'confirmed',maxSupportedTransactionVersion:1}]);assert.equal(firstTx.meta.err,null);const batchBytes=Buffer.from(firstTx.transaction[0],'base64').length;assert.ok(batchBytes<=1232);assert.ok(firstTx.meta.computeUnitsConsumed>0);
const detailed=await rpc<any>('getTransaction',[firstSignature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:1}]);
for(let i=0;i<first.groups[0].holderWallets.length;i++){const destination=await ata(first.groups[0].holderWallets[i],initial.instrument.settlementMint),accountIndex=detailed.transaction.message.accountKeys.indexOf(destination);assert.ok(accountIndex>=0);assert.equal(detailed.meta.preBalances[accountIndex],0);assert.ok(!detailed.meta.preTokenBalances.some((b:any)=>b.accountIndex===accountIndex));assert.equal(detailed.meta.postTokenBalances.find((b:any)=>b.accountIndex===accountIndex)?.uiTokenAmount.amount,first.groups[0].amountsMinor[i]);}
// Restart only the launcher-recorded isolated API after the request completed.
// The launcher checks PID, start time, listener and genesis; no transaction is in flight.
console.log(JSON.stringify({stage:'restart-api',bond,operationId:runId,firstSignature,batchBytes}));
execFileSync('pwsh',['-NoProfile','-File','scripts/backend-runtime.ps1','-RpcPort',String(new URL(runtime.rpcUrl).port),'-ApiPort',String(new URL(origin).port),'-RestartApi'],{cwd:process.cwd(),windowsHide:true,timeout:60000,stdio:'ignore'});
const passive=await api('/api/operations/'+runId);assert.equal(passive.groups[0].signature,firstSignature);assert.equal(passive.completedGroups,1);assert.equal(passive.plan.digest,first.plan.digest);
const completed=await api('/api/demo/coupon-run',{operationId:runId,bondAddress:bond,couponId:'0'});assert.equal(completed.status,'completed');assert.equal(completed.completedGroups,2);assert.equal(completed.groups[0].signature,firstSignature);assert.equal(completed.desiredRightsPaid,true);
const replay=await api('/api/demo/coupon-run',{operationId:runId,bondAddress:bond,couponId:'0'});assert.deepEqual(replay.groups.map((g:any)=>g.signature),completed.groups.map((g:any)=>g.signature));runs.push(completed);
await rejectPrepare({action:'claim_coupon',walletAddress:holders[1].address,bondAddress:bond,params:{couponId:'0'}},'ALREADY_CLAIMED');
await due(record2);await action('capture_coupon',issuer,{couponId:'1'});read=await state();assert.equal(read.coupons[1].entitlements[0].amountMinor,'400000000');
await due(maturity);await action('begin_redemption',issuer);for(const holder of holders)await action('redeem_principal',holder);
read=await state();assert.equal(read.servicing.status,'principal-redeemed-coupons-outstanding');assert.equal(read.instrument.redeemedSupply,'25');
const late=await api('/api/demo/coupon-run',{operationId:'late-coupon-'+crypto.randomUUID(),bondAddress:bond,couponId:'1'});assert.equal(late.status,'completed');runs.push(late);
read=await state();assert.equal(read.servicing.fullySettled,true);assert.equal(read.reconciliation.totals.cashPaid.baseUnits,'27500000000');assert.equal(read.reconciliation.totals.couponPaid.baseUnits,'2500000000');assert.equal(read.reconciliation.totals.principalPaid.baseUnits,'25000000000');assert.equal(read.reconciliation.totals.remainingObligations.baseUnits,'0');assert.equal(read.instrument.vaultBalanceMinor,'0');assert.equal(read.reconciliation.supply.mintSupplyUnits,'0');assert.equal(read.proposals[0].yesWeight,'10');assert.equal(read.proposals[0].noWeight,'5');
const exported=await api('/api/evidence?instrument='+bond);assert.equal(exported.integrity.payloadSha256,createHash('sha256').update(canonicalJson(exported.payload)).digest('hex'));
const archivedProofs=[];
for(const item of [...receipts,...auxiliary,...runs.flatMap(run=>run.groups)]){let evidence=await api('/api/transactions/'+item.signature+'/proof');for(let attempt=0;evidence.executionProof?.capture?.status!=='captured'&&attempt<3;attempt++){await new Promise(r=>setTimeout(r,200));evidence=await api('/api/transactions/'+item.signature+'/proof?retry=true');}assert.equal(evidence.status,'confirmed');assert.equal(evidence.executionProof?.capture?.status,'captured');assert.equal(evidence.executionProof?.matchesStoredReceipt,true);assert.equal(evidence.executionProof.proof.signature,item.signature);assert.equal(evidence.executionProof.proof.expectedWireMatched,true);archivedProofs.push(evidence.executionProof);}
const result={checkedAt:new Date().toISOString(),scope:'Actual isolated localnet corrected SBF; external generated test signing and generated-issuer event execution. No human wallet/devnet/fiat/production proof.',origin,rpcUrl,bond,program:health.program,receipts,auxiliary,runs,archivedProofs,checks:{allSixBeneficiariesPaid:true,holderClaimAndOperatorSettlementShareMask:true,permissionlessCapture:true,recordRightsSurviveTransferAndBurn:true,apiRestartBetweenBatches:true,sameRunReplayNoNewSignature:true,firstBatchFourNewRecipientAtas:true,firstBatchBytes:batchBytes,firstBatchComputeUnits:firstTx.meta.computeUnitsConsumed,negativeChecks},state:read,evidenceDigest:exported.integrity};
fs.writeFileSync(evidenceFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,bond,walletTransactions:receipts.length,operatorTransactions:runs.flatMap(r=>r.groups).length,auxiliaryTransactions:auxiliary.length,couponUnits:2500,principalUnits:25000,burned:25,batchBytes,evidenceFile}));
