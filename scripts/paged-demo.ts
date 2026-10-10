/** Real localnet-only v2 lifecycle. Generated keys never enter the public journal.
 * Run from an isolated source workspace with an explicit ignored data namespace.
 * Re-run with the SAME operation ID to recover; unknown signatures stop the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {address, createKeyPairSignerFromBytes, generateKeyPairSigner, getAddressEncoder,
  getCompiledTransactionMessageDecoder, getTransactionDecoder, lamports, type Instruction, type KeyPairSigner} from '@solana/kit';
import {getCreateAccountInstruction} from '@solana-program/system';
import {getCreateAssociatedTokenIdempotentInstruction, getInitializeMint2Instruction, getMintSize,
  getMintToInstruction, TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import * as p from '../packages/client/src/program.ts';
import {makePagedDemoBatches,makePagedDemoSchedule,pagedDemoTiming,initialHolderBatchInstructions,couponSettlementBatchInstructions,
  type PagedDemoBatchPlan,type PagedDemoTiming,type CouponSettlementBatch} from './paged-demo-plan.ts';
import {assertPagedDemoNamespace} from './paged-demo-launcher.ts';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node --import tsx scripts/paged-demo.ts [--scale33] [--late-coupon] [--operation-id ID]');
  console.log('Requires BONDTRACE_NETWORK=localnet, SOLANA_RPC_URL=loopback, BONDTRACE_DATA_DIR=.local/paged-demo/<run>/data.');
  console.log('Default: 3 initial holders (10/5/3), one new holder, 2 coupons. --scale33: 33 initial holders, one new holder, 9 coupons.');
  console.log('--late-coupon keeps the primary first coupon unpaid until after principal burn. Same-ID reruns recover saved signatures; unknown outcomes stop.');
  console.log('Fixed groups: initial holders <=3 within one registry page, coupon recipients <=4; no automatic batch fallback.');
} else {
  await main().catch(error => {
    console.error(JSON.stringify({passed:false,code:(error as {code?:string})?.code??'PAGED_DEMO_STOPPED',
      message:error instanceof Error?error.message:'The run stopped; retain the same operation identifier.'}));
    process.exitCode = 1;
  });
}

async function main() {
  const allowed = new Set(['--scale33','--late-coupon','--operation-id']);
  for (let i=0;i<args.length;i++) {
    if (!allowed.has(args[i])) throw new Error('Unknown paged-demo argument');
    if (args[i]==='--operation-id') { if (!args[++i]) throw new Error('Missing operation identifier'); }
  }
  const scale = args.includes('--scale33'), lateCoupon = args.includes('--late-coupon');
  const idAt = args.indexOf('--operation-id');
  const runId = idAt<0 ? (scale?'paged_demo_scale_v2':'paged_demo_quick_v2') : args[idAt+1];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(runId)) throw new Error('Operation ID must contain 8 to 80 safe characters');
  if ((process.env.BONDTRACE_NETWORK??'localnet')!=='localnet'||(process.env.BONDTRACE_DEPLOYMENT??'local')!=='local')
    throw new Error('Paged demo is restricted to an isolated localnet runtime');
  if ((process.env.BONDTRACE_STORAGE_BACKEND??'sqlite')!=='sqlite'||process.env.BONDTRACE_ENABLE_DEMO==='false')
    throw new Error('Use enabled generated signing and local SQLite in the isolated namespace');
  const explicitData = process.env.BONDTRACE_DATA_DIR;
  if (!explicitData) throw new Error('Set a dedicated BONDTRACE_DATA_DIR; the original/default namespace is excluded');
  const dataPath = path.resolve(explicitData);
  let reviewedRelease:unknown;
  try {reviewedRelease=JSON.parse(fs.readFileSync(path.resolve('programs/bondtrace/release.json'),'utf8'));} catch { /* Only the original paged-demo namespace remains eligible. */ }
  assertPagedDemoNamespace(dataPath,process.cwd(),reviewedRelease);
  if(!process.env.SOLANA_RPC_URL)throw new Error('Set the isolated validator SOLANA_RPC_URL explicitly');
  const endpoint = new URL(process.env.SOLANA_RPC_URL);
  if (!['http:','https:'].includes(endpoint.protocol)||!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)
      ||endpoint.username||endpoint.password||endpoint.search||endpoint.hash) throw new Error('Use a plain loopback localnet RPC URL');
  safeDirectory(dataPath);

  // Dynamic imports occur only after the isolated namespace guard.
  const {localDir, network, rpcUrl} = await import('../server/config.ts');
  const {rpc, account, chainClock, awaitConfirmation, transactionStatus, AppError} = await import('../server/rpc.ts');
  const {execute, buildTransaction} = await import('../server/transactions.ts');
  const {beginOperation, findOperation, updateOperation, claimDemoOperation, assertDemoLease} = await import('../server/operations.ts');
  const {transactionSync} = await import('../server/storage.ts');
  const {receipt, saveReceipt, updateReceipt, journalValues} = await import('../server/journal.ts');
  const {assertVerifiedProgram} = await import('../server/program-identity.ts');
  const {chainIdentity} = await import('../server/chain-identity.ts');
  const {applyConfirmedEffect} = await import('../server/effects.ts');
  const {saveCatalog, readCatalog} = await import('../server/catalog.ts');
  const {readV2View, reconcileV2} = await import('../server/v2.ts');
  const {decodeTokenBalance} = await import('../server/chain-view.ts');
  const {captureRetainedProof, publicExecutionProof} = await import('../server/proof-retention.ts');
  type Operation = import('../server/operations.ts').Operation;
  type ReviewedProgram = import('../server/prepared.ts').ReviewedProgram;
  type Base = {version:2;runId:string;scale:boolean;lateCoupon:boolean;createdAt:string;seriesId:string;
    issuer:string;executor:string;settlementMint:string;holders:string[];initialUnits:string[];
    couponCount:number;faceValueMinor:string;couponUnitMinor:string;reserveMinor:string;mintRentLamports:string;
    bond:string;bondMint:string;vault:string;source:string;release:ReviewedProgram;batching:PagedDemoBatchPlan;timing:PagedDemoTiming};
  type Plan = Base & {name:string;recordTs:string[];paymentTs:string[];maturityTs:string;};
  const outputDir = path.join(localDir,'paged-demo-public');
  const keysDir = path.join(localDir,'paged-demo-private',digest(runId).slice(0,20));
  safeDirectory(outputDir); safeDirectory(keysDir);
  const logFile = path.join(outputDir,'requests-'+runId+'.ndjson');
  const log = (item:unknown) => {
    const line=json(item)+'\n'; const fd=fs.openSync(logFile,'a',0o600);
    try {fs.writeSync(fd,line);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    console.log(line.trimEnd());
  };
  const deployed = await assertVerifiedProgram(), identity = await chainIdentity();
  const requiredRelease:ReviewedProgram = {programId:deployed.programId,sha256:deployed.expected!.sha256,genesisHash:identity.genesisHash};
  const initialCount = scale?33:3, couponCount = scale?9:2;
  const batching=makePagedDemoBatches(scale,lateCoupon),timing=pagedDemoTiming(scale);
  const units = Array.from({length:initialCount},(_,i)=>i===0?10n:i===1?5n:i===2?3n:1n);
  const totalUnits = units.reduce((sum,n)=>sum+n,0n), face=1_000_000_000n, coupon=50_000_000n;
  const reserve = totalUnits*(face+coupon*BigInt(couponCount));
  beginOperation(runId,'paged_demo_v2','generated-test',{version:2,scale,lateCoupon});
  const issuer=await ownSigner('issuer'), executor=await ownSigner('executor'), mint=await ownSigner('settlement-mint');
  const holders:KeyPairSigner[]=[];
  for(let i=0;i<=initialCount;i++)holders.push(await ownSigner('holder-'+String(i).padStart(4,'0')));
  const addresses=holders.map(h=>String(h.address));
  let base=findOperation(runId)?.metadata?.base as Base|undefined;
  if(!base) {
    const seriesId=String(Date.now()),actualBond=await p.deriveBondV2(issuer.address,BigInt(seriesId));
    const rent=await rpc<number>('getMinimumBalanceForRentExemption',[getMintSize()]);
    if(!Number.isSafeInteger(rent)||rent<0)throw new Error('Invalid mock mint rent quotation');
    const candidate:Base={version:2,runId,scale,lateCoupon,createdAt:new Date().toISOString(),seriesId,
      issuer:issuer.address,executor:executor.address,settlementMint:mint.address,holders:addresses,
      initialUnits:units.map(String),couponCount,faceValueMinor:String(face),couponUnitMinor:String(coupon),
      reserveMinor:String(reserve),mintRentLamports:String(rent),bond:actualBond,bondMint:await p.deriveBondMintV2(actualBond),
      vault:await p.deriveVaultV2(actualBond),source:await p.ata(issuer.address,mint.address),release:requiredRelease,batching,timing};
    base=transactionSync(()=>{const old=findOperation(runId)!;if(old.metadata?.base)return old.metadata.base as Base;
      updateOperation(runId,{bond:candidate.bond,wallet:candidate.issuer,programRelease:requiredRelease,
        metadata:{...old.metadata,base:candidate,baseDigest:digest(candidate)}});return candidate;});
  }
  if(!base.batching||!base.timing)throw new AppError('PAGED_DEMO_PLAN_VERSION','This older cohort has an immutable unbatched plan. Preserve its receipts and namespace; this CLI revision requires the separately authorized new cohort.',409);
  if(digest(base)!==findOperation(runId)?.metadata?.baseDigest||base.runId!==runId||base.scale!==scale||base.lateCoupon!==lateCoupon
      ||base.issuer!==issuer.address||base.executor!==executor.address||base.settlementMint!==mint.address
      ||json(base.holders)!==json(addresses)||json(base.release)!==json(requiredRelease)
      ||json(base.batching)!==json(batching)||json(base.timing)!==json(timing))
    throw new Error('Saved plan, generated signers, program release or genesis changed; retain the original run');
  const frozen=base;
  log({stage:'starting',runId,network,rpcUrl,bond:frozen.bond,initialHolders:initialCount,couponCount,lateCoupon,
    release:frozen.release,scope:'Actual localnet; generated test signers; mock settlement token; no real assets'});
  // Recover every retained child before considering any new financial step.
  for(const operation of children())if(operation.signature&&operation.projectionStatus!=='complete')await recoverStep(operation);
  for(const [role,signer,amount] of [['issuer',issuer,2_000_000_000],['executor',executor,2_000_000_000],
      ...holders.map((h,i)=>['holder-'+i,h,100_000_000] as const)] as const)await fundTestSol(role,signer,amount);
  await step('mock-mint','mock_mint_v2',issuer,[
    getCreateAccountInstruction({payer:issuer,newAccount:mint,lamports:lamports(BigInt(frozen.mintRentLamports)),space:getMintSize(),programAddress:TOKEN_PROGRAM_ADDRESS}),
    getInitializeMint2Instruction({mint:mint.address,decimals:6,mintAuthority:issuer.address})
  ],[mint]);
  await step('mock-reserve','mock_reserve_v2',issuer,[
    getCreateAssociatedTokenIdempotentInstruction({payer:issuer,ata:address(frozen.source),owner:issuer.address,mint:mint.address}),
    getMintToInstruction({mint:mint.address,token:address(frozen.source),mintAuthority:issuer,amount:reserve})
  ]);
  let plan=findOperation(runId)?.metadata?.plan as Plan|undefined;
  if(!plan) {
    const {records,payments,maturity}=makePagedDemoSchedule((await chainClock()).timestamp,scale);
    const candidate:Plan={...frozen,name:scale?'BondTrace · Paged 33-holder cycle':'BondTrace · Paged servicing demo',
      recordTs:records.map(String),paymentTs:payments.map(String),maturityTs:String(maturity)};
    plan=transactionSync(()=>{const old=findOperation(runId)!;if(old.metadata?.plan)return old.metadata.plan as Plan;
      updateOperation(runId,{metadata:{...old.metadata,plan:candidate,planDigest:digest(candidate)}});return candidate;});
  }
  if(digest(plan)!==findOperation(runId)?.metadata?.planDigest||digest(stripDates(plan))!==digest(frozen))throw new Error('Frozen schedule plan differs');
  const planned=plan;
  const holdingAtas=await Promise.all(addresses.map(wallet=>p.ata(wallet,frozen.bondMint)));
  const settlementAtas=await Promise.all(addresses.map(wallet=>p.ata(wallet,frozen.settlementMint)));
  const holderRecords=await Promise.all(addresses.map(wallet=>p.deriveHolderV2(frozen.bond,wallet)));
  const terms: p.CouponTerms[]=planned.recordTs.map((ts,i)=>({recordTs:BigInt(ts),paymentTs:BigInt(planned.paymentTs[i]),unitAmount:coupon}));
  const created=await p.initializeIssueV2(issuer.address,mint.address,BigInt(frozen.seriesId),planned.name,face,
    BigInt(planned.maturityTs),couponCount,1000,2);
  assert.equal(created.bond,frozen.bond);
  await step('initialize','initialize_issue_v2',issuer,[created.ix]);
  await projectCatalog(false);
  for(let page=0;page<Math.ceil(couponCount/8);page++)await step('schedule-'+page,'append_schedule_v2',issuer,[
    p.appendScheduleV2(issuer.address,frozen.bond,await p.deriveSchedulePageV2(frozen.bond,page),page,terms.slice(page*8,page*8+8))]);
  for(const group of frozen.batching.initialHolders) {
    await step('initial-holders-'+group.start+'-'+group.count,'issue_units_v2',issuer,initialHolderBatchInstructions({
      issuer,bond:frozen.bond,bondMint:frozen.bondMint,registryPage:await p.deriveRegistryPageV2(frozen.bond,group.pageIndex),
      holderWallets:addresses,holderRecords,holdingAtas,units,group}),[],false,{kind:'initial-holders',...group,
      holderWallets:addresses.slice(group.start,group.start+group.count),units:units.slice(group.start,group.start+group.count).map(String)});
  }
  await step('fund-vault','fund_vault_v2',issuer,[p.fundVaultV2(issuer.address,frozen.bond,mint.address,
    frozen.source,frozen.vault,reserve)]);
  await step('seal','seal_issue_v2',issuer,[p.sealIssueV2(issuer.address,frozen.bond,frozen.bondMint,frozen.vault)]);
  await projectCatalog(true);
  const beforeRecord=await bondValue();assert.equal(beforeRecord.totalIssued,totalUnits);
  assert.equal(beforeRecord.rateBps,1000);assert.equal(beforeRecord.couponFrequency,2);
  await due(BigInt(planned.recordTs[0]));
  await openCoupon(0);
  const firstAction=await actionValue(1,0);
  if(!firstAction.finalized&&firstAction.capturedPages===0) {
    await capturePages(1,0,1);
    const checkpoint=await actionValue(1,0);assert.equal(checkpoint.capturedPages,1);
    transactionSync(()=>{const current=findOperation(runId)!;updateOperation(runId,{metadata:{...current.metadata,
      captureResume:{actionKind:1,actionId:0,capturedPages:1,frozenHolderCount:checkpoint.holderCount,observedAt:new Date().toISOString()}}});});
    log({stage:'capture-resume-checkpoint',runId,capturedPages:1,totalPages:Math.ceil(checkpoint.holderCount/8),
      scope:'Persisted on-chain cursor re-read; same process, no process-restart claim'});
  }
  await capturePages(1,0);
  const historic=await snapshotValue(1,0,0);assert.equal(historic.units[0],10n);assert.equal(historic.units[1],5n);
  if(initialCount%8===0)await step('registry-'+Math.floor(initialCount/8),'create_registry_page_v2',issuer,[
    p.createRegistryPageV2(issuer.address,frozen.bond,await p.deriveRegistryPageV2(frozen.bond,Math.floor(initialCount/8)),Math.floor(initialCount/8))]);
  await register(initialCount);
  await projectCatalog(true);
  const voteAddress=await p.deriveActionV2(frozen.bond,3,1);
  await step('vote-open','create_proposal_v2',issuer,[p.createProposalV2(issuer.address,frozen.bond,voteAddress,
    frozen.bondMint,1,'Approve the next disclosure pack',BigInt(planned.maturityTs)-1n)]);
  await projectCatalog(true,['1']);
  await capturePages(3,1);
  await step('transfer-to-new','transfer_units_v2',holders[1],[p.transferUnitsV2(holders[1].address,frozen.bond,
    frozen.bondMint,holderRecords[1],holderRecords[initialCount],holdingAtas[1],holdingAtas[initialCount],1n)]);
  for(const [index,support] of [[0,true],[2,true],[1,false]] as const)await step('vote-'+index,'cast_vote_v2',holders[index],[
    p.castVoteV2(holders[index].address,frozen.bond,voteAddress,holderRecords[index],
      await p.deriveSnapshotPageV2(voteAddress,Math.floor(index/8)),await p.deriveBallotV2(voteAddress,holders[index].address),support)]);
  const vote=await actionValue(3,1);assert.equal(vote.yesUnits,13n);assert.equal(vote.noUnits,5n);
  if(!findOperation(runId)?.metadata?.duplicateBallotRejected) {
    let rejected=false;
    try {await buildTransaction([p.castVoteV2(holders[1].address,frozen.bond,voteAddress,holderRecords[1],
      await p.deriveSnapshotPageV2(voteAddress,0),await p.deriveBallotV2(voteAddress,holders[1].address),true)],holders[1].address,[holders[1]],0,frozen.release);}
    catch(error){if(!(error instanceof AppError)||!['SIMULATION_FAILED','ALREADY_VOTED'].includes(error.code))throw error;rejected=true;}
    assert.ok(rejected,'Second vote must be rejected without relay');
    transactionSync(()=>{const old=findOperation(runId)!;updateOperation(runId,{metadata:{...old.metadata,duplicateBallotRejected:true}});});
    log({stage:'duplicate-ballot-rejected',runId,verification:'real RPC simulation; no relay'});
  }
  const old=await actionValue(1,0);assert.equal(old.holderCount,initialCount);
  assert.equal((await snapshotValue(1,0,0)).units[1]*coupon,250_000_000n);
  const newRecord=p.decodeHolderV2(await bytes(holderRecords[initialCount]));
  assert.equal(newRecord.index,initialCount);
  assert.ok(newRecord.index>=old.holderCount,'New holder has no position in the historical prefix');
  for(let index=1;index<couponCount;index++) {await due(BigInt(planned.recordTs[index]));await openCoupon(index);await capturePages(1,index);}
  const future=await snapshotValue(1,1,Math.floor(initialCount/8));
  assert.equal(future.units[initialCount%8],1n);assert.equal((await snapshotValue(1,1,0)).units[1],4n);
  for(let index=0;index<couponCount;index++) {
    await due(BigInt(planned.paymentTs[index]));const rights=await actionValue(1,index);
    assert.equal(rights.holderCount,initialCount+(index===0?0:1));
    for(const group of frozen.batching.coupons.filter(group=>group.couponIndex===index))await payCouponBatch(group);
  }
  await due(BigInt(planned.maturityTs));
  const principal=await p.deriveActionV2(frozen.bond,2,0);
  await step('principal-open','begin_redemption_v2',executor,[p.beginRedemptionV2(executor.address,frozen.bond,
    principal,frozen.bondMint)],[],true);
  await capturePages(2,0);
  for(let holder=0;holder<=initialCount;holder++)await step('principal-'+holder,'redeem_principal_v2',holders[holder],[
    p.redeemPrincipalV2(holders[holder].address,frozen.bond,principal,holderRecords[holder],
      await p.deriveSnapshotPageV2(principal,Math.floor(holder/8)),frozen.bondMint,holdingAtas[holder],mint.address,
      frozen.vault,settlementAtas[holder])],[],true);
  if(lateCoupon) {
    const raw=(await account(holdingAtas[0])).value;
    assert.equal(decodeTokenBalance(raw,holdingAtas[0],frozen.bondMint,holders[0].address).amount,0n);
    await payCoupon(0,0);
  }
  const final=await readV2View(frozen.bond,{proposalIds:()=>['1']});
  const finances=reconcileV2(final);
  assert.equal(final.bond.state,3);assert.equal(final.bond.holderCount,initialCount+1);assert.equal(final.bond.couponCount,couponCount);
  assert.equal(final.bond.totalIssued,totalUnits);assert.equal(final.bond.totalRedeemed,totalUnits);
  assert.equal(final.bondMint.supply,0n);assert.equal(final.vault.amount,0n);assert.equal(finances.remaining,0n);
  assert.equal(finances.couponPaid,coupon*totalUnits*BigInt(couponCount));assert.equal(finances.principalPaid,face*totalUnits);
  const destinationAmounts:string[]=[];
  for(let holder=0;holder<=initialCount;holder++) {
    const token=decodeTokenBalance((await account(settlementAtas[holder])).value,settlementAtas[holder],mint.address,holders[holder].address);
    const original=holder<initialCount?units[holder]:0n;
    const current=holder===1?4n:holder===initialCount?1n:original;
    const expected=current*face+(original+current*BigInt(couponCount-1))*coupon;
    assert.equal(token.amount,expected);destinationAmounts.push(String(token.amount));
  }
  assert.equal(destinationAmounts[0],String(10n*face+10n*coupon*BigInt(couponCount)));
  const records=children().filter(record=>record.signature),proofs=[];
  for(const record of records) {
    const status=await transactionStatus(record.signature!);assert.equal(status.status,'confirmed');
    await captureRetainedProof(record.signature!);
    const retained=receipt(record.signature!);assert.ok(retained);
    proofs.push({operationId:record.id,step:record.params?.stepKey,action:record.action,signature:record.signature,
      slot:retained.slot,chainStatus:retained.chainStatus,projectionStatus:retained.projectionStatus,
      programRelease:retained.programRelease??null,execution:publicExecutionProof(retained)});
  }
  const report={schemaVersion:1,passed:true,checkedAt:new Date().toISOString(),scope:'Actual matching-release localnet RPC; generated test signers; mock SPL settlement. No human wallet, devnet, production, or 10000-holder capacity claim.',
    runId,plan:planned,initialHolders:initialCount,finalHolders:initialCount+1,couponCount,
    transfers:{source:holders[1].address,destination:holders[initialCount].address,units:'1',historicSourceUnits:'5',futureSourceUnits:'4',newHistoricUnits:'0',newFutureUnits:'1'},
    primary:{initialUnits:'10',couponMinor:'500000000',principalMinor:'10000000000'},
    vote:{id:'1',yesWeight:'13',noWeight:'5',duplicateRejectedByRpcSimulation:true},
    finance:finances,finalView:final,destinationAmounts,captureResume:findOperation(runId)?.metadata?.captureResume,
    lateCouponAfterBurn:lateCoupon,proofCount:proofs.length,proofs,
    proofGaps:proofs.filter(row=>!row.execution?.proof).map(row=>({operationId:row.operationId,signature:row.signature,capture:row.execution?.capture})),
    independentAttestation:false};
  const reportFile=path.join(outputDir,'report-'+Date.now()+'-'+randomUUID().slice(0,8)+'.json');
  privateWrite(reportFile,json(report)+'\n','wx');
  transactionSync(()=>{const current=findOperation(runId)!;updateOperation(runId,{status:'confirmed',chainStatus:'confirmed',projectionStatus:'complete',
    metadata:{...current.metadata,report:{file:reportFile,sha256:digest(fs.readFileSync(reportFile)),proofCount:proofs.length,checkedAt:report.checkedAt}}});});
  log({stage:'complete',passed:true,runId,bond:frozen.bond,initialHolders:initialCount,finalHolders:initialCount+1,couponCount,
    couponPaidMinor:String(finances.couponPaid),principalPaidMinor:String(finances.principalPaid),mintSupply:'0',vaultMinor:'0',obligationsMinor:'0',
    voteYes:'13',voteNo:'5',proofCount:proofs.length,proofGaps:report.proofGaps.length,reportFile});

  async function ownSigner(role:string):Promise<KeyPairSigner> {
    if(!/^(issuer|executor|settlement-mint|holder-\d{4})$/.test(role))throw new Error('Invalid generated test key role');
    const file=path.join(keysDir,role+'.private.json');
    const read=async()=>{const values=JSON.parse(fs.readFileSync(file,'utf8')) as unknown;
      if(!Array.isArray(values)||values.length!==64||values.some(n=>!Number.isInteger(n)||n<0||n>255))throw new Error('Owned generated key file is malformed');
      return createKeyPairSignerFromBytes(Uint8Array.from(values),true);};
    if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw new Error('Owned key path must be a regular file');return read();}
    const signer=await generateKeyPairSigner(true),raw=await crypto.subtle.exportKey('pkcs8',signer.keyPair.privateKey);
    const bytes=Buffer.concat([Buffer.from(raw).subarray(-32),Buffer.from(getAddressEncoder().encode(signer.address))]);
    try{privateWrite(file,JSON.stringify([...bytes]),'wx');}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;return read();}
    return signer;
  }
  function childId(key:string){return 'paged_'+digest(runId+':'+key).slice(0,48);}
  function children(){return journalValues<Operation>('operations').filter(o=>o.params?.parentOperationId===runId);}
  async function recoverStep(operation:Operation) {
    if(!operation.signature)throw new Error('Signed step recovery requires its retained signature');
    const result=await awaitConfirmation(operation.signature,20_000);
    if(result.status!=='confirmed')throw new AppError('UNKNOWN_STATUS','Retained step '+operation.id+' is '+result.status+'; no new signature is permitted',503);
    await applyConfirmedEffect({...operation,signature:operation.signature});
    transactionSync(()=>{updateReceipt(operation.signature!,{projectionStatus:'complete'});updateOperation(operation.id,{status:'confirmed',chainStatus:'confirmed',projectionStatus:'complete',error:undefined});});
    return operation.signature;
  }
  async function step(key:string,kind:string,actor:KeyPairSigner,instructions:Instruction[],extra:KeyPairSigner[]=[],issuerAbsent=false,batch?:Record<string,unknown>) {
    const publicInstructions=instructions.map(publicInstruction);
    const operationId=childId(key),request={parentOperationId:runId,stepKey:key,signer:String(actor.address),
      instructionDigest:digest(publicInstructions),instructions:publicInstructions,release:frozen.release,
      ...(batch?{batch}:{}),
      ...(kind==='initialize_issue_v2'?{seriesId:frozen.seriesId}:{}),
      ...(kind==='create_proposal_v2'?{proposalId:'1'}:{})};
    const claimed=claimDemoOperation(operationId,kind,'generated-test',request);
    updateOperation(operationId,{wallet:actor.address,bond:frozen.bond,programRelease:frozen.release});
    if(claimed.operation.signature) {await recoverStep(findOperation(operationId)!);return claimed.operation.signature;}
    if(!claimed.claimed||!claimed.owner)throw new AppError('STEP_UNAVAILABLE','Resume the same operation after its unsigned lease or error is resolved: '+operationId,409);
    log({stage:'request-retained',runId,operationId,key,kind,signer:actor.address,bond:frozen.bond,
      request,scope:'Public instruction digest and exact request retained before signing/relay'});
    try {
      const result=await execute(instructions,actor,kind,extra,frozen.bond,signature=>{
        assertDemoLease(operationId,claimed.owner!);
        const row=receipt(signature);if(!row?.signedTransactionBase64)throw new Error('Exact signed wire is not retained');
        const wire=Buffer.from(row.signedTransactionBase64,'base64');
        const message=getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(wire).messageBytes);
        assert.equal(message.version,0);assert.ok(wire.length<=1232,'The exact retained v0 wire exceeds 1232 bytes');
        if(issuerAbsent) {
          assert.equal(message.header.numSignerAccounts,1);assert.ok(!message.staticAccounts.includes(address(frozen.issuer)),'Issuer must be absent from maturity transaction accounts');
        }
        updateReceipt(signature,{operationId});
        updateOperation(operationId,{signature,status:'pending',chainStatus:'pending',projectionStatus:'pending'});
        log({stage:'signature-retained-before-relay',runId,operationId,key,signature,issuerAbsent,wireBytes:wire.length,transactionVersion:0,
          scope:'execute callback; SQLite transaction commits before sendTransaction'});
      },frozen.bond,frozen.release);
      assert.ok(result.bytes<=1232,'The fixed v0 group must remain within 1232 wire bytes');
      if(result.status!=='confirmed')throw new AppError('UNKNOWN_STATUS','Retain '+operationId+' and its signature before resuming',503);
      await recoverStep(findOperation(operationId)!);
      log({stage:'confirmed',runId,operationId,key,signature:result.signature,bytes:result.bytes,simulation:result.simulation});
      return result.signature;
    } catch(error) {
      const current=findOperation(operationId),saved=current?.signature?receipt(current.signature):null;
      updateOperation(operationId,{status:saved?.chainStatus==='error'?'error':current?.signature?'unknown':'error',
        ...(saved?{chainStatus:saved.chainStatus,projectionStatus:saved.chainStatus==='error'?'complete':'pending'}:{}),
        error:error instanceof Error?error.message:'The exact retained step requires recovery'});
      throw error;
    }
  }
  async function fundTestSol(role:string,signer:KeyPairSigner,amount:number) {
    const operationId=childId('faucet-'+role),request={parentOperationId:runId,stepKey:'faucet-'+role,wallet:String(signer.address),lamports:String(amount),genesisHash:frozen.release.genesisHash};
    const previous=findOperation(operationId);
    if(previous?.signature){await recoverStep(previous);return;}
    if(previous?.status==='confirmed'&&previous.projectionStatus==='complete')return;
    const claimed=claimDemoOperation(operationId,'test_sol_funding_v2','generated-test',request);
    if(claimed.operation.signature){await recoverStep(claimed.operation);return;}
    if(claimed.operation.status==='confirmed')return;
    if(claimed.operation.metadata?.airdropRequestStarted)throw new AppError('UNKNOWN_STATUS','A faucet request was retained without a response; it will never be automatically repeated: '+operationId,503);
    if(!claimed.claimed||!claimed.owner)throw new AppError('STEP_UNAVAILABLE','Faucet request is already owned: '+operationId,409);
    const balance=await rpc<{value:number}>('getBalance',[signer.address,{commitment:'confirmed'}]);
    if(!Number.isSafeInteger(balance?.value)||balance.value<0)throw new Error('Invalid test SOL balance');
    if(balance.value>=amount){updateOperation(operationId,{status:'confirmed',chainStatus:'not_submitted',projectionStatus:'complete',metadata:{fundingVerification:'balance-only'}});return;}
    transactionSync(()=>{assertDemoLease(operationId,claimed.owner!);updateOperation(operationId,{status:'unknown',wallet:signer.address,
      metadata:{airdropRequestStarted:true,requestedAt:new Date().toISOString()}});});
    log({stage:'faucet-request-retained',runId,operationId,wallet:signer.address,lamports:String(amount)});
    const signature=await rpc<string>('requestAirdrop',[signer.address,amount,{commitment:'confirmed'}]);
    if(!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature))throw new AppError('UNKNOWN_STATUS','Faucet did not return a usable signature; do not repeat it',503);
    transactionSync(()=>{updateOperation(operationId,{signature,status:'pending',chainStatus:'pending'});
      saveReceipt({signature,action:'test_sol_funding_v2',wallet:signer.address,operationId,network,genesisHash:frozen.release.genesisHash,
        chainStatus:'pending',projectionStatus:'pending',submittedAt:new Date().toISOString()});});
    await recoverStep(findOperation(operationId)!);
    log({stage:'faucet-confirmed',runId,operationId,signature,wallet:signer.address});
  }
  async function bytes(key:string) {const raw=(await account(key)).value;
    if(!raw||raw.owner!==p.PROGRAM_ID||raw.executable||!Array.isArray(raw.data)||raw.data[1]!=='base64')throw new Error('Expected canonical program-owned account '+key);
    return Buffer.from(raw.data[0],'base64');}
  async function bondValue(){const value=p.decodeBondV2(await bytes(frozen.bond));assert.equal(value.issuer,frozen.issuer);return value;}
  async function actionValue(kind:p.ActionKindV2,id:number){const key=await p.deriveActionV2(frozen.bond,kind,id),value=p.decodeActionV2(await bytes(key));assert.equal(value.bond,frozen.bond);assert.equal(value.kind,kind);assert.equal(value.id,id);return value;}
  async function snapshotValue(kind:p.ActionKindV2,id:number,page:number){const action=await p.deriveActionV2(frozen.bond,kind,id);return p.decodeSnapshotPageV2(await bytes(await p.deriveSnapshotPageV2(action,page)));}
  async function register(i:number){await step('register-'+i,'register_holder_v2',issuer,[
    getCreateAssociatedTokenIdempotentInstruction({payer:issuer,ata:address(holdingAtas[i]),owner:holders[i].address,mint:address(frozen.bondMint)}),
    getCreateAssociatedTokenIdempotentInstruction({payer:issuer,ata:address(settlementAtas[i]),owner:holders[i].address,mint:mint.address}),
    p.registerHolderV2(issuer.address,frozen.bond,await p.deriveRegistryPageV2(frozen.bond,Math.floor(i/8)),holderRecords[i],
      holders[i].address,holdingAtas[i],frozen.bondMint,i)]);}
  async function openCoupon(index:number){await step('coupon-open-'+index,'begin_coupon_v2',executor,[p.beginCouponV2(executor.address,
    frozen.bond,await p.deriveActionV2(frozen.bond,1,index),await p.deriveSchedulePageV2(frozen.bond,Math.floor(index/8)),frozen.bondMint,index)]);}
  async function capturePages(kind:p.ActionKindV2,id:number,limit=Number.MAX_SAFE_INTEGER) {
    const key=await p.deriveActionV2(frozen.bond,kind,id),start=await actionValue(kind,id);
    if(start.finalized) {const known=findOperation(childId('finalize-'+kind+'-'+id));if(!known?.signature)throw new Error('Finalized action has no retained owner execution identifier');await recoverStep(known);return;}
    for(let page=start.capturedPages;page<Math.min(Math.ceil(start.holderCount/8),start.capturedPages+limit);page++)await step(
      'capture-'+kind+'-'+id+'-'+page,'capture_action_page_v2',executor,[p.captureActionPageV2(executor.address,frozen.bond,key,
        await p.deriveRegistryPageV2(frozen.bond,page),await p.deriveSnapshotPageV2(key,page),frozen.bondMint,page,
        holdingAtas.slice(page*8,Math.min(page*8+8,start.holderCount)))],[],kind===2);
    if(limit!==Number.MAX_SAFE_INTEGER)return;
    const b=await bondValue(),next=kind===1?b.nextCouponIndex+1:b.nextCouponIndex;
    await step('finalize-'+kind+'-'+id,'finalize_action_v2',executor,[p.finalizeActionV2(executor.address,frozen.bond,key,
      frozen.bondMint,await p.deriveSchedulePageV2(frozen.bond,Math.floor(Math.min(next,b.couponCount-1)/8)))],[],kind===2);
  }
  async function payCoupon(holder:number,index:number) {const action=await p.deriveActionV2(frozen.bond,1,index);
    await step('coupon-pay-'+index+'-'+holder,'settle_coupon_v2',executor,[p.settleCouponV2({executor:executor.address,
      beneficiary:holders[holder].address,bond:frozen.bond,action,holderRecord:holderRecords[holder],
      snapshotPage:await p.deriveSnapshotPageV2(action,Math.floor(holder/8)),settlement:mint.address,vault:frozen.vault,destination:settlementAtas[holder]})]);}
  async function payCouponBatch(group:CouponSettlementBatch) {
    const action=await p.deriveActionV2(frozen.bond,1,group.couponIndex),snapshotPages:Record<number,string>={};
    for(const holder of group.holderIndexes){const page=Math.floor(holder/8);snapshotPages[page]??=await p.deriveSnapshotPageV2(action,page);}
    await step('coupon-batch-'+group.couponIndex+'-'+group.start+'-'+group.count,'settle_coupon_v2',executor,
      couponSettlementBatchInstructions({executor,bond:frozen.bond,action,settlementMint:mint.address,vault:frozen.vault,
        holderWallets:addresses,holderRecords,settlementAtas,snapshotPages,group}),[],true,{kind:'coupon-settlement',...group,
        holderWallets:group.holderIndexes.map(i=>addresses[i])});
  }
  async function projectCatalog(complete:boolean,proposalIds:string[]=[]) {const chain=await bondValue(),previous=readCatalog(frozen.bond);
    assert.equal(chain.seriesId,BigInt(frozen.seriesId));assert.equal(chain.settlementMint,frozen.settlementMint);
    saveCatalog({protocolVersion:2,seriesId:frozen.seriesId,bond:frozen.bond,name:planned.name,settlementMint:frozen.settlementMint,createdAt:previous?.createdAt??frozen.createdAt,
      rateBps:1000,couponFrequency:2,roles:{issuer:frozen.issuer,executor:frozen.executor,investor1:addresses[0],investor2:addresses[1],investor3:addresses[2]},
      proposalIds:[...new Set([...(previous?.proposalIds??[]),...proposalIds])],complete:previous?.complete||complete||chain.state>0,
      accelerated:true,source:previous?.source??'demo',...(previous?.rateTerms?{rateTerms:previous.rateTerms}:{}),holderLabels:{...previous?.holderLabels,[addresses[0]]:'Primary holder',[addresses[1]]:'Historical five-unit holder',
        [addresses[2]]:'Third holder',[addresses[initialCount]]:'New holder after record'}});}
  async function due(target:bigint) {const started=Date.now();let last=-1n,announced=false;
    while(true){const now=(await chainClock()).timestamp;if(now<last)throw new Error('Chain clock regressed');last=now;if(now>=target)return;
      if(Date.now()-started>18*60_000)throw new Error('Bounded chain-clock wait expired; resume the same operation ID');
      if(!announced){log({stage:'waiting-chain-clock',runId,target:String(target),now:String(now)});announced=true;}
      await new Promise(resolve=>setTimeout(resolve,1500));}}
}

function publicInstruction(ix:Instruction){return {programAddress:String(ix.programAddress),accounts:(ix.accounts??[]).map(a=>({address:String(a.address),role:a.role})),data:Buffer.from(ix.data??[]).toString('base64')};}
function json(value:unknown){const encoded=JSON.stringify(value,(_key,v)=>typeof v==='bigint'?String(v):v);if(encoded===undefined)throw new Error('Public record is not serializable');return encoded;}
function digest(value:unknown){return createHash('sha256').update(Buffer.isBuffer(value)?value:typeof value==='string'?value:json(value)).digest('hex');}
function stripDates<T extends {name:string;recordTs:string[];paymentTs:string[];maturityTs:string}>(plan:T){const {name,recordTs,paymentTs,maturityTs,...base}=plan;return base;}
function privateWrite(file:string,body:string,flags:'wx'|'w'){const fd=fs.openSync(file,flags,0o600);try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function safeDirectory(directory:string){let current=path.parse(directory).root;
  for(const part of directory.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);
    if(fs.existsSync(current)){const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Owned namespace requires regular directories');}
    else fs.mkdirSync(current,{mode:0o700});}}
