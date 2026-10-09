import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Every worker uses generated TEST signers and mocked RPC in its own ignored namespace.
// No live RPC, live receipts, real funds or application keys are accessed.
const source=String.raw`
import {programRpc} from './tests/client/helpers/program-rpc.ts';
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {getAddressDecoder,address} from '@solana/kit';import {getMintEncoder,TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
const directory=process.env.BONDTRACE_DATA_DIR,id=process.env.BOOTSTRAP_TEST_ID,scenario=process.env.BOOTSTRAP_TEST_SCENARIO;
const logFile=path.join(directory,'synthetic-transport.json');
let log=fs.existsSync(logFile)?JSON.parse(fs.readFileSync(logFile,'utf8')):{sends:[],airdrops:0};
const storeLog=()=>fs.writeFileSync(logFile,JSON.stringify(log));
const key=n=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i===0?n:7));
const genesis=process.env.BONDTRACE_NETWORK==='devnet'?'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':key(9);
let failure=true,activeId=id,apis,blockReset=false;
function bondBytes(plan){
 const u64=value=>{const bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(BigInt(value));return bytes;};
 const i64=value=>{const bytes=Buffer.alloc(8);bytes.writeBigInt64LE(BigInt(value));return bytes;};
 const u32=value=>{const bytes=Buffer.alloc(4);bytes.writeUInt32LE(value);return bytes;};
 const pubkey=value=>Buffer.from(program.pubkeyBytes(value)),name=Buffer.from(plan.name);
 return Buffer.concat([createHash('sha256').update('account:Bond').digest().subarray(0,8),...[plan.roles.issuer,plan.bondMint,plan.settlementMint,plan.vault].map(pubkey),u64(plan.seriesId),u32(name.length),name,u64(plan.faceValueMinor),i64(plan.maturityTs),u64('10'),u64('0'),Buffer.from([0,255,0]),Buffer.alloc(2),u32(1),pubkey(plan.roles.investor1),u32(1),i64(plan.recordTs),i64(plan.paymentTs),u64(plan.couponMinor),u32(0)]);
}
globalThis.fetch=async(_url,init)=>{
 const request=JSON.parse(String(init.body));let result;
 const deployment=programRpc(request);if(deployment!==undefined)return Response.json({jsonrpc:'2.0',id:request.id,result:deployment});
 const current=apis?.findOperation(activeId),plan=current?.metadata?.bootstrapPlan;
 const next=plan?.steps.find(step=>apis.findOperation(step.operationId)?.status!=='confirmed');
 switch(request.method){
 case 'getGenesisHash':result=genesis;break;
 case 'getAccountInfo':{
  if(request.params[0]==='SysvarC1ock11111111111111111111111111111111'){const clock=Buffer.alloc(40);clock.writeBigInt64LE(activeId===id?100n:1000n,32);result={context:{slot:25},value:{owner:'11111111111111111111111111111111',executable:false,data:[clock.toString('base64'),'base64']}};}
  else if(log.mint&&request.params[0]===log.mint.address){const data=getMintEncoder().encode({mintAuthority:address(log.mint.issuer),supply:0n,decimals:6,isInitialized:true,freezeAuthority:null});result={context:{slot:25},value:{owner:TOKEN_PROGRAM_ADDRESS,executable:false,data:[Buffer.from(data).toString('base64'),'base64']}};}
  else if(apis?.findOperation(id)?.metadata?.bootstrapPlan?.bond===request.params[0]&&log.sends.some(item=>item.step==='issue'&&item.bond===request.params[0])){result={context:{slot:25},value:{owner:program.PROGRAM_ID,executable:false,data:[bondBytes(apis.findOperation(id).metadata.bootstrapPlan).toString('base64'),'base64']}};}
  else result={context:{slot:25},value:null};break;
 }
 case 'getMinimumBalanceForRentExemption':result=1461600;break;
 case 'getBalance':result={context:{slot:25},value:['airdrop-loss','devnet-empty'].includes(scenario)?0:2000000000};break;
 case 'requestAirdrop':assert.ok(plan,'Plan must be durable before even a faucet request');assert.equal(apis.findOperation(next.operationId).metadata.airdropRequestStarted,true);log.airdrops++;storeLog();throw new TypeError('Synthetic faucet response loss');
 case 'getLatestBlockhash':result={context:{slot:25},value:{blockhash:activeId===id?'11111111111111111111111111111111':key(30),lastValidBlockHeight:activeId===id?1000:2000}};break;
 case 'simulateTransaction':result={context:{slot:25},value:{err:failure&&(['before-send','reset-partial'].includes(scenario)&&next.id==='issue'||scenario==='reset-real-partial'&&next.id==='holder_1')?{InstructionError:[0,{Custom:6001}]}:null,unitsConsumed:1000,logs:[]}};break;
 case 'getFeeForMessage':result={context:{slot:25},value:5000};break;
 case 'sendTransaction':{
  const signature=apis.signatureOf(request.params[0]);assert.ok(plan,'Immutable plan must exist before send');
  const step=plan.steps.find(step=>apis.findOperation(step.operationId)?.signature===signature);assert.ok(step,'Child signature must persist before send');
  const retained=apis.receipt(signature);assert.equal(retained.genesisHash,genesis);assert.equal(apis.readJson(path.join(directory,'lifetimes.json'),{})[signature],activeId===id?1000:2000);
  assert.equal(current.metadata.bootstrapPlanDigest,apis.findOperation(step.operationId).metadata.planDigest);
  assert.equal(log.sends.some(item=>item.signature===signature),false,'No exact message may be sent twice');
  log.sends.push({step:step.id,signature,bond:plan.bond,seriesId:plan.seriesId});if(step.id==='mint')log.mint={address:plan.settlementMint,issuer:plan.roles.issuer};storeLog();
  if(step.id==='funding'&&scenario==='crash')process.exit(41);
  if(step.id==='funding'&&scenario==='loss'&&failure)throw new TypeError('Synthetic accepted send response loss');
  result=signature;break;
 }
 case 'getSignatureStatuses':{
  const signature=request.params[0][0],sent=log.sends.find(item=>item.signature===signature);
  result={context:{slot:101},value:[(scenario==='unknown'||blockReset)&&sent?.step==='funding'?null:{err:scenario==='error'&&sent?.step==='funding'?{InstructionError:[0,{Custom:6001}]}:null,slot:100,confirmationStatus:scenario==='pending'&&sent?.step==='funding'?'processed':'confirmed'}]};break;
 }
 case 'getBlockHeight':result=2000;break;
 default:throw new Error('Unexpected mocked method '+request.method);
 }
 return Response.json({jsonrpc:'2.0',id:request.id,result});
};
const [{bootstrap,bootstrapStatus},{findOperation,operationStatus},{fixture,saveFixture},{readCatalog},{readJson,closeStorage},{receipt},{signatureOf},program]=await Promise.all([
 import('./server/seed.ts'),import('./server/operations.ts'),import('./server/store.ts'),import('./server/catalog.ts'),import('./server/storage.ts'),import('./server/journal.ts'),import('./server/rpc.ts'),import('./packages/client/src/program.ts')]);
apis={findOperation,readJson,receipt,signatureOf};
const oldFixture={seriesId:'42',bond:await program.deriveBond(key(7),42n),name:'Archived synthetic fixture',settlementMint:key(4),createdAt:'2026-10-08T00:00:00.000Z',rateBps:0,couponFrequency:0,roles:{issuer:key(7)},proposalIds:[],complete:true,accelerated:true};
if(!fixture())saveFixture(oldFixture);
let outcome;
try{outcome=await bootstrap(true,id);}catch(error){outcome={code:error.code??error.name};}
if(scenario==='before-send'){
 assert.equal(outcome.code,'SIMULATION_FAILED');const frozen=JSON.stringify(findOperation(id).metadata.bootstrapPlan);failure=false;
 outcome=await bootstrap(true,id);assert.equal(JSON.stringify(findOperation(id).metadata.bootstrapPlan),frozen);
}
if(['reset-partial','reset-real-partial'].includes(scenario)){
 assert.equal(outcome.code,'SIMULATION_FAILED');const old=findOperation(id),previousPlan=JSON.stringify(old.metadata.bootstrapPlan),oldBond=old.bond;
 failure=false;activeId='replacement_'+id;outcome=await bootstrap(true,activeId);
 assert.equal(outcome.status,'confirmed');assert.notEqual(outcome.bond,oldBond);
 if(scenario==='reset-partial')assert.equal(readCatalog(oldBond),null,'Never archive a phantom reserved fixture without a chain issue');
 else {assert.equal(readCatalog(oldBond).bond,oldBond);assert.equal(readCatalog(oldBond).complete,false);assert.equal(readCatalog(oldBond).source,'demo');}
 assert.equal(findOperation(activeId).metadata.bootstrapPlan.recordTs,'1090');
 assert.equal(bootstrapStatus(id).status,'superseded');assert.equal(JSON.stringify(findOperation(id).metadata.bootstrapPlan),previousPlan);
 const count=log.sends.length;await assert.rejects(()=>bootstrap(true,id),error=>error.code==='BOOTSTRAP_SUPERSEDED');assert.equal(log.sends.length,count);
}
if(['loss','unknown','before-send','resume','devnet-empty','airdrop-loss','funded'].includes(scenario)){
 const sends=log.sends.length,airdrops=log.airdrops;
 const local=bootstrapStatus(id);assert.ok(local.bootstrap);
 const observed=await operationStatus(id);assert.ok(observed);
 assert.equal(log.sends.length,sends,'Status GET may not advance an unsubmitted step');assert.equal(log.airdrops,airdrops);
}
if(scenario==='resume'&&outcome.status==='confirmed'||scenario==='before-send'||scenario==='funded'){
 assert.equal(outcome.status,'confirmed');assert.equal(fixture().complete,true);assert.equal(readCatalog(oldFixture.bond).name,oldFixture.name);
 const count=log.sends.length;const again=await bootstrap(true,id);assert.equal(again.status,'confirmed');assert.equal(log.sends.length,count);
}
const value=findOperation(activeId),snapshot=bootstrapStatus(activeId);
if(scenario==='loss'){
 activeId='different_'+id;blockReset=true;
 await assert.rejects(()=>bootstrap(true,activeId),error=>error.code==='BOOTSTRAP_INCOMPLETE');activeId=id;blockReset=false;
}
const finalFixture=fixture();closeStorage();console.log(JSON.stringify({outcome,plan:value.metadata?.bootstrapPlan,planDigest:value.metadata?.bootstrapPlanDigest,snapshot,log,fixture:finalFixture}));
`;
function namespace(){const directory=path.resolve('.local/tests/bootstrap-'+randomUUID());fs.mkdirSync(directory,{recursive:true});return directory;}
function worker(directory:string,id:string,scenario:string,network='localnet'){
 return new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:process.cwd(),env:{...process.env,BONDTRACE_DATA_DIR:directory,BOOTSTRAP_TEST_ID:id,BOOTSTRAP_TEST_SCENARIO:scenario,BONDTRACE_NETWORK:network,SOLANA_RPC_URL:network==='devnet'?'https://api.devnet.solana.com':'http://127.0.0.1:8899'},windowsHide:true});
  let stdout='',stderr='';child.stdout.on('data',value=>{stdout+=String(value);});child.stderr.on('data',value=>{stderr+=String(value);});child.once('error',reject);
  // Reset/before-send scenarios execute two complete bootstrap phases in one
  // child. Keep the original per-phase bound without timing out a cold clone
  // under the suite's four concurrent workers. Financial assertions are unchanged.
  const phases=scenario.startsWith('reset-')||scenario==='before-send'?2:1;
  // The devnet fixture deliberately exercises the real bounded RPC admission
  // policy, including 1,250 ms same-method gaps, despite intercepting all HTTP.
  const perPhaseMs=network==='devnet'?180000:45000;
  const timer=setTimeout(()=>{child.kill();reject(new Error('Synthetic bootstrap worker timeout: '+scenario));},perPhaseMs*phases);
  child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
 });
}
async function result(directory:string,id:string,scenario:string,network='localnet'){
 const value=await worker(directory,id,scenario,network);assert.equal(value.code,0,value.stderr);return JSON.parse(value.stdout);
}
test('lost mint funding response preserves one frozen issue and resumes after process restart without duplicate sends',async()=>{
 const directory=namespace(),id='bootstrap_'+randomUUID();
 const first=await result(directory,id,'loss');assert.equal(first.outcome.code,'UNKNOWN_STATUS');assert.deepEqual(first.log.sends.map((item:any)=>item.step),['mint','funding']);
 const final=await result(directory,id,'resume');assert.equal(final.outcome.status,'confirmed');assert.equal(final.planDigest,first.planDigest);assert.deepEqual(final.plan,first.plan);
 assert.deepEqual(final.log.sends.map((item:any)=>item.step),['mint','funding','issue','holder_0','holder_1','holder_2','seal']);assert.equal(final.snapshot.bootstrap.completedSteps,11);
});
test('unknown retained child blocks every new issue/funding send and status reads remain passive',async()=>{
 const directory=namespace(),id='bootstrap_'+randomUUID();await result(directory,id,'loss');
 const value=await result(directory,id,'unknown');assert.equal(value.outcome.code,'UNKNOWN_STATUS');assert.equal(value.log.sends.length,2);assert.equal(value.snapshot.bootstrap.nextStep.id,'funding');
 const pending=await result(directory,id,'pending');assert.equal(pending.outcome.code,'UNKNOWN_STATUS');assert.equal(pending.log.sends.length,2);assert.equal(pending.snapshot.bootstrap.nextStep.chainStatus,'pending');
 const rejected=await result(directory,id,'error');assert.equal(rejected.outcome.code,'BOOTSTRAP_STEP_REJECTED');assert.equal(rejected.log.sends.length,2);assert.equal(rejected.snapshot.bootstrap.nextStep.chainStatus,'error');assert.equal(rejected.snapshot.bootstrap.canResume,false);
});
test('crash after persistence and send resumes exact child signatures from SQLite',async()=>{
 const directory=namespace(),id='bootstrap_'+randomUUID();const crash=await worker(directory,id,'crash');assert.equal(crash.code,41);
 const value=await result(directory,id,'resume');assert.equal(value.outcome.status,'confirmed');assert.equal(value.log.sends.filter((item:any)=>item.step==='funding').length,1);assert.equal(value.log.sends.filter((item:any)=>item.step==='issue').length,1);
});
test('failure before issue submission advances the same plan on explicit retry without reminting',async()=>{
 const value=await result(namespace(),'bootstrap_'+randomUUID(),'before-send');assert.equal(value.outcome.status,'confirmed');assert.equal(value.log.sends.filter((item:any)=>item.step==='funding').length,1);
});
test('lost localnet faucet response is durably blocked and never requested a second time',async()=>{
 const directory=namespace(),id='bootstrap_'+randomUUID();const first=await result(directory,id,'airdrop-loss');assert.equal(first.log.airdrops,1);assert.equal(first.log.sends.length,0);
 const second=await result(directory,id,'airdrop-loss');assert.equal(second.outcome.code,'UNKNOWN_STATUS');assert.equal(second.log.airdrops,1);assert.equal(second.log.sends.length,0);assert.equal(second.snapshot.bootstrap.canCheckFunding,true);
 const funded=await result(directory,id,'funded');assert.equal(funded.outcome.status,'confirmed');assert.equal(funded.log.airdrops,1);assert.equal(funded.snapshot.bootstrap.steps[0].fundingVerification,'balance-only');assert.equal(funded.snapshot.bootstrap.steps[0].chainStatus,'not_submitted');
});
test('devnet requires explicit test SOL and resumes the same frozen plan without automatic airdrop',async()=>{
 const directory=namespace(),id='bootstrap_'+randomUUID();const first=await result(directory,id,'devnet-empty','devnet');assert.equal(first.outcome.code,'TEST_SOL_REQUIRED');assert.equal(first.log.airdrops,0);assert.equal(first.log.sends.length,0);
 const value=await result(directory,id,'funded','devnet');assert.equal(value.outcome.status,'confirmed');assert.equal(value.planDigest,first.planDigest);assert.equal(value.log.airdrops,0);
});
test('explicit new reset preserves a reconciled old plan, supersedes it and does not catalog a phantom issue',async()=>{
 const value=await result(namespace(),'bootstrap_'+randomUUID(),'reset-partial');assert.equal(value.outcome.status,'confirmed');assert.equal(value.snapshot.bootstrap.completedSteps,11);
});
test('expired partial issue is archived only after chain identity/account/receipts verify, then old sends are disabled',async()=>{
 const value=await result(namespace(),'bootstrap_'+randomUUID(),'reset-real-partial');assert.equal(value.outcome.status,'confirmed');assert.equal(value.snapshot.bootstrap.completedSteps,11);
});
