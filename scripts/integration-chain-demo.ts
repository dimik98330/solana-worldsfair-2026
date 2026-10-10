/** Actual built-product HTTP + direct read-only localnet RPC shadow verifier.
 * It signs only integration attestations, never Solana transactions. No product
 * server modules are imported: running this file cannot select/create its DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,sign,verify,randomUUID,type KeyObject} from 'node:crypto';
import {address,getAddressDecoder,getAddressEncoder,getProgramDerivedAddress} from '@solana/kit';
import {getMintDecoder,getTokenDecoder,TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import * as p from '../packages/client/src/program.ts';
import {couponPerBond} from '../packages/client/src/domain.ts';

type Json=Record<string,any>;
type Scope={network:'localnet';genesisHash:string;programId:string;bondAddress:string};
type PublicAuthority={authorityId:string;sourceId:string;publicKeyBase64:string};
type Authority=PublicAuthority & {privateKey:KeyObject};
type Envelope={payload:Json;authorityId:string;signatureBase64:string};
type Selected={couponId:string;wallet:string;snapshotAddress:string;units:string;amountMinor:string};
type RawAccount={owner:string;executable:boolean;data:[string,string]};
type Graph={scope:Scope;revision:string;root:ReturnType<typeof p.decodeBondV2>;holders:{wallet:string;units:string}[];
  selected:Selected;financial:Json;accounts:{address:string;owner:string|null;dataBase64:string|null}[];accountSha256:string;
  slots:{start:number;end:number};clock:{slot:string;timestamp:string};finalizedRight:Json};
type Run={schemaVersion:1;origin:string;instrument:string;operationId:string;createdAt:string;authorityFingerprints:string[];
  scope:Scope;release:Json;selected:Selected;baseline:Graph;baselineHttp:Json;registryEnvelope:Envelope;planRequest:Json;
  immutableDigest?:string;ackEnvelope?:Envelope;ackEnvelopeDigest?:string;responses?:Json;stage:string};
const loader='BPFLoaderUpgradeab1e11111111111111111111111';
const clockAddress='SysvarC1ock11111111111111111111111111111111';
const maxU64=(1n<<64n)-1n,spkiPrefix=Buffer.from('302a300506032b6570032100','hex');
const argv=process.argv.slice(2);
if(argv.includes('--self-test'))selfTest();
else if(argv.includes('--help'))console.log('Usage: node --import tsx scripts/integration-chain-demo.ts --origin http://127.0.0.1:3190 --instrument <BondV2> --authority-file .local/<generated-authorities.json> --output-dir .local/<owned-public-evidence> [--operation-id ID] [--resume] [--amount-minor 500000000]\nOperator Basic credentials: BONDTRACE_HTTP_USER / BONDTRACE_HTTP_PASSWORD environment only. --self-test performs pure checks without HTTP/RPC/files.');
else await main().catch(error=>{console.error(JSON.stringify({passed:false,code:(error as {code?:string})?.code??'INTEGRATION_VERIFIER_STOPPED',
  message:error instanceof Error?error.message:'Verifier stopped; preserve the same public descriptor and operation ID'}));process.exitCode=1;});

async function main(){
  const options=parseArgs(argv),origin=localOrigin(options.origin),instrument=publicKey(options.instrument),resume=options.resume===true;
  const authorityFile=ignoredPath(options['authority-file'],false),outputDir=ignoredPath(options['output-dir'],true);
  const descriptor=readPrivateDescriptor(authorityFile),registry=descriptor.registry,settlement=descriptor.settlement;
  const publicAuthorities=[publicAuthority(registry),publicAuthority(settlement)];
  const fingerprints=publicAuthorities.map(value=>sha(Buffer.from(value.publicKeyBase64,'base64')));
  const operationId=identifier(options['operation-id']??'chain_shadow_'+hash({origin,instrument,fingerprints}).slice(0,48));
  const expectedAmount=uint(options['amount-minor']??'500000000');if(expectedAmount===0n)throw new Error('Select a positive coupon amount');
  const user=process.env.BONDTRACE_HTTP_USER,password=process.env.BONDTRACE_HTTP_PASSWORD;
  if(Boolean(user)!==Boolean(password))throw new Error('Set both operator credential environment variables, or neither');
  const basic=user&&password?'Basic '+Buffer.from(user+':'+password).toString('base64'):undefined;
  const secretNeedles=[password,basic,registry.privateKey.export({format:'pem',type:'pkcs8'}).toString(),settlement.privateKey.export({format:'pem',type:'pkcs8'}).toString()].filter((n):n is string=>Boolean(n));
  const runFile=path.join(outputDir,'run-'+operationId+'.json'),transcript:Json[]=[];
  const transcriptFile=path.join(outputDir,'transport-'+operationId+'-'+Date.now()+'-'+randomUUID().slice(0,8)+'.json');
  const log=(value:Json)=>console.log(JSON.stringify(value));
  const write=(file:string,value:unknown,create=false)=>{const encoded=JSON.stringify(value,(_key,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
    if(secretNeedles.some(secret=>encoded.includes(secret)||encoded.includes(JSON.stringify(secret).slice(1,-1)))||/"(?:privateKeyPem|privateKey|password|authorization)"\s*:/i.test(encoded))throw new Error('Public artifact contains a restricted credential field');
    const temporary=file+'.tmp-'+randomUUID();const fd=fs.openSync(temporary,'wx',0o600);try{fs.writeFileSync(fd,encoded);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(create&&fs.existsSync(file)){fs.unlinkSync(temporary);throw new Error('Existing descriptor requires --resume; never replace an immutable run');}
    fs.renameSync(temporary,file);};
  const http=async(route:string,body?:unknown)=>{
    const url=new URL(route,origin);if(url.origin!==origin||url.username||url.password)throw new Error('Cross-origin product request rejected');
    const response=await fetch(url,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{accept:'application/json',origin,
      ...(body===undefined?{}:{'content-type':'application/json'}),...(basic?{authorization:basic}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45_000)});
    rejectRedirect(response.status);const bytes=await boundedBody(response,8*1024*1024);
    if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw new Error('Product endpoint did not return JSON');
    let value:Json;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('Malformed product JSON');}
    transcript.push({method:body===undefined?'GET':'POST',route,status:response.status,...(body===undefined?{}:{request:body}),response:value});
    write(transcriptFile,transcript);
    if(!response.ok){const error=Object.assign(new Error('Product HTTP '+response.status+' '+String(value?.error?.code??'REQUEST_REJECTED')),{status:response.status});throw error;}
    return value;
  };
  const health=await http('/api/health'),built=await verifyBuiltUi(origin,basic),capabilities=await http('/api/integrations/capabilities');
  checkHealth(health,instrument);checkCapabilities(capabilities,publicAuthorities);
  const rpcUrl=localRpc(health.chain.rpcUrl);let rpcId=0;
  const rpc=async(method:string,params:unknown[]=[])=>{
    if(!['getGenesisHash','getAccountInfo','getMultipleAccounts'].includes(method))throw new Error('This verifier has no permitted RPC write or signing method');
    const id=++rpcId,response=await fetch(rpcUrl,{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(30_000)});
    rejectRedirect(response.status);if(!response.ok)throw new Error('Local RPC transport rejected the read');
    let envelope:Json;try{envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(response,16*1024*1024)));}catch{throw new Error('Malformed direct RPC JSON');}
    if(envelope.jsonrpc!=='2.0'||envelope.id!==id||envelope.error||!Object.hasOwn(envelope,'result'))throw new Error('Direct RPC returned a failed or mismatched read');
    return envelope.result;
  };
  const release=await verifyRelease(health,rpc),state=await http('/api/state?instrument='+encodeURIComponent(instrument));
  checkState(state,instrument);
  const chosen=selectRight(state,expectedAmount),baseline=await readGraph(state,instrument,chosen,health,rpc);
  const baselineHttp=financialProjection(state);let run:Run;
  if(resume){
    if(!fs.existsSync(runFile))throw new Error('--resume requires the original public run descriptor');
    run=JSON.parse(fs.readFileSync(runFile,'utf8')) as Run;
    if(run.schemaVersion!==1||run.origin!==origin||run.instrument!==instrument||run.operationId!==operationId
        ||hash(run.authorityFingerprints)!==hash(fingerprints)||hash(run.scope)!==hash(baseline.scope)||hash(run.release)!==hash(release)
        ||hash(run.selected)!==hash(chosen))throw new Error('Resume differs from the immutable origin/instrument/release/authority/right descriptor');
    assert.equal(run.baseline.accountSha256,baseline.accountSha256,'On-chain graph changed since the retained run');
    assert.deepEqual(run.baselineHttp,baselineHttp,'HTTP financial state changed since the retained run');
    assert.equal(run.immutableDigest,runDigest(run),'Immutable run descriptor changed');
    assertEnvelope(run.registryEnvelope,registry);
    if(run.ackEnvelope){assertEnvelope(run.ackEnvelope,settlement);assert.equal(run.ackEnvelopeDigest,sha(signingBytes(run.ackEnvelope.payload)));}
  }else{
    if(fs.existsSync(runFile))throw new Error('Run already exists; use --resume with exactly the same options');
    const suffix=hash({operationId,scope:baseline.scope}).slice(0,24),times=validityTimes();
    const registryEnvelope=signed({domain:'bondtrace.registry-attestation.v1',schemaVersion:1,importId:'registry_'+suffix,
      sourceId:registry.sourceId,registryRef:'registry_ref_'+suffix,nonce:'registry_nonce_'+suffix,sourceSequence:'1',...times,
      mode:'shadow',chain:baseline.scope,basis:'current-registered-holdings',holders:baseline.holders.map((holder,index)=>({holderRef:'holder_'+suffix+'_'+index,...holder}))},registry);
    run={schemaVersion:1,origin,instrument,operationId,createdAt:new Date().toISOString(),authorityFingerprints:fingerprints,
      scope:baseline.scope,release,selected:chosen,baseline,baselineHttp,registryEnvelope,
      planRequest:{operationId,bondAddress:instrument,action:'coupon',couponId:chosen.couponId,registryImportId:registryEnvelope.payload.importId,
        adapter:'sandbox-file',holderWallets:[chosen.wallet],snapshotAddress:chosen.snapshotAddress},stage:'requests-retained'};
    run.immutableDigest=runDigest(run);
    write(runFile,run,true);
  }
  assert.deepEqual(run.registryEnvelope.payload.chain,run.scope);assert.equal(run.registryEnvelope.payload.basis,'current-registered-holdings');
  assert.equal(run.registryEnvelope.payload.sourceId,registry.sourceId);
  assert.deepEqual(run.registryEnvelope.payload.holders.map((h:Json)=>({wallet:h.wallet,units:h.units})),run.baseline.holders);
  assert.deepEqual(run.planRequest,{operationId,bondAddress:instrument,action:'coupon',couponId:chosen.couponId,
    registryImportId:run.registryEnvelope.payload.importId,adapter:'sandbox-file',holderWallets:[chosen.wallet],snapshotAddress:chosen.snapshotAddress});
  const save=(stage:string,responses?:Json)=>{run.stage=stage;run.responses={...run.responses,...responses};write(runFile,run);};
  log({stage:'verified-real-chain',operationId,instrument,amountMinor:chosen.amountMinor,holder:chosen.wallet,
    genesisHash:run.scope.genesisHash,releaseSha256:release.sha256,graphSha256:baseline.accountSha256,builtUiSha256:built.assetSha256});
  // The exact signed metadata requests are durable BEFORE the HTTP mutation.
  save('registry-request-retained');const imported=await http('/api/integrations/registry/import',run.registryEnvelope);
  assert.equal(imported.digest,sha(signingBytes(run.registryEnvelope.payload)));assert.equal(imported.matchStatus,'matched');
  assert.equal(imported.legalRegistryVerified,false);assert.deepEqual(imported.scope,run.scope);
  assert.deepEqual(await http('/api/integrations/registry/import',run.registryEnvelope),imported,'Registry replay must return the same retained record');
  save('registry-confirmed',{registry:imported});
  save('plan-request-retained');const planned=await http('/api/integrations/settlement/plan',run.planRequest);
  assert.equal(planned.plan.requestDigest,hash(run.planRequest));assert.equal(planned.plan.operationId,operationId);
  assert.equal(planned.plan.totalMinor,chosen.amountMinor);assert.equal(planned.plan.realAssets,false);assert.equal(planned.plan.partnerConnection,'unverified');
  assert.deepEqual(planned.plan.scope,run.scope);assert.equal(planned.outbox.length,1);
  const row=planned.outbox[0];assert.equal(row.digest,hash(row.payload));assert.equal(row.payload.beneficiaryWallet,chosen.wallet);
  assert.equal(row.payload.amountMinor,chosen.amountMinor);assert.equal(row.payload.units,chosen.units);assert.equal(row.payload.snapshotAddress,chosen.snapshotAddress);
  assert.equal(row.payload.assetMint,state.instrument.settlementMint);assert.equal(row.payload.assetDecimals,6);
  assert.equal(row.paymentId,hash({...run.scope,action:'coupon',couponId:chosen.couponId,snapshotAddress:chosen.snapshotAddress,beneficiaryWallet:chosen.wallet}));
  assert.deepEqual((await http('/api/integrations/settlement/plan',run.planRequest)).plan.paymentIds,planned.plan.paymentIds);
  save('plan-confirmed',{planned});
  if(!run.ackEnvelope){const suffix=row.paymentId.slice(0,24);run.ackEnvelope=signed({domain:'bondtrace.settlement-ack.v1',schemaVersion:1,
    ackId:'ack_'+suffix,sourceId:settlement.sourceId,nonce:'ack_nonce_'+suffix,sourceSequence:'1',...validityTimes(),mode:'shadow',chain:run.scope,
    operationId,paymentId:row.paymentId,outboxDigest:row.digest,beneficiaryWallet:chosen.wallet,assetMint:row.payload.assetMint,assetDecimals:row.payload.assetDecimals,
    amountMinor:chosen.amountMinor,externalReference:'shadow_ref_'+suffix,status:'simulated-settled'},settlement);
    run.ackEnvelopeDigest=sha(signingBytes(run.ackEnvelope.payload));}
  assertEnvelope(run.ackEnvelope,settlement);assert.equal(run.ackEnvelope.payload.outboxDigest,row.digest);
  assert.equal(run.ackEnvelopeDigest,sha(signingBytes(run.ackEnvelope.payload)));assert.deepEqual(run.ackEnvelope.payload.chain,run.scope);
  assert.equal(run.ackEnvelope.payload.operationId,operationId);assert.equal(run.ackEnvelope.payload.paymentId,row.paymentId);
  assert.equal(run.ackEnvelope.payload.beneficiaryWallet,chosen.wallet);assert.equal(run.ackEnvelope.payload.assetMint,row.payload.assetMint);
  assert.equal(run.ackEnvelope.payload.assetDecimals,row.payload.assetDecimals);assert.equal(run.ackEnvelope.payload.amountMinor,chosen.amountMinor);
  assert.equal(run.ackEnvelope.payload.status,'simulated-settled');assert.equal(run.ackEnvelope.payload.sourceId,settlement.sourceId);
  save('ack-request-retained');const ack=await http('/api/integrations/settlement/reconcile',run.ackEnvelope);
  assert.equal(ack.digest,sha(signingBytes(run.ackEnvelope.payload)));assert.equal(ack.disposition,'accepted');assert.equal(ack.bankSettlementVerified,false);
  const replay=await http('/api/integrations/settlement/reconcile',run.ackEnvelope);assert.deepEqual(replay,ack,'ACK replay must return the same receipt');
  const status=await http('/api/integrations/settlement/'+operationId);checkShadowStatus(status,row.paymentId);
  const audit=await http('/api/integrations/audit/'+operationId);
  assert.equal(audit.integrity.algorithm,'sha256');assert.equal(audit.integrity.payloadSha256,hash(audit.payload));
  assert.equal(audit.integrity.meaning,'integrity-only-not-independent-attestation');
  assert.equal(audit.payload.scope.acknowledgementDoesNotMutateChain,true);assert.equal(audit.payload.scope.bankOrKaseIntegration,false);
  assert.equal(audit.payload.scope.independentlyAttested,false);assert.equal(audit.payload.acknowledgements.length,1);
  checkShadowStatus(audit.payload.settlement,row.paymentId);
  const afterHealth=await http('/api/health');checkHealth(afterHealth,instrument);
  const afterRelease=await verifyRelease(afterHealth,rpc);assert.deepEqual(afterRelease,release,'Observed deployed bytecode changed');
  const afterState=await http('/api/state?instrument='+encodeURIComponent(instrument));checkState(afterState,instrument);
  const after=await readGraph(afterState,instrument,chosen,afterHealth,rpc);
  assert.equal(after.accountSha256,run.baseline.accountSha256,'Shadow requests changed or raced the actual on-chain graph');
  assert.deepEqual(financialProjection(afterState),run.baselineHttp,'Shadow requests changed or raced HTTP financial state');
  save('verified',{ack,status,audit});
  const result={schemaVersion:1,passed:true,checkedAt:new Date().toISOString(),operationId,instrument,origin,
    scope:{actualBuiltProductHttp:true,actualDirectRpc:true,network:'localnet',generatedIntegrationAuthorities:true,realAssets:false,
      bankOrKaseIntegration:false,partnerConnection:'unverified',independentlyAttested:false,solanaTransactionsSigned:0,rpcWrites:0,
      processRestartVerified:false,resumedExactDescriptor:resume},selected:chosen,built,release,before:run.baseline,after,
    onChainFinancialChange:false,externalStatus:'simulated-settled',onChainStatus:'unclaimed',dispatchAllowed:false,
    registryReplayIdentical:true,ackReplayIdentical:true,auditPayloadSha256:audit.integrity.payloadSha256,audit,transcript};
  const resultFile=path.join(outputDir,'result-'+operationId+'-'+Date.now()+'.json');write(resultFile,result,true);
  log({passed:true,operationId,instrument,amountMinor:chosen.amountMinor,externalStatus:'simulated-settled',onChainStatus:'unclaimed',
    dispatchAllowed:false,onChainFinancialChange:false,beforeGraphSha256:run.baseline.accountSha256,afterGraphSha256:after.accountSha256,resultFile,
    bankOrKaseIntegration:false,processRestartVerified:false});
}

async function readGraph(state:Json,instrument:string,selected:Selected,health:Json,rpc:(method:string,params?:unknown[])=>Promise<any>):Promise<Graph>{
  const scope:Scope={network:'localnet',genesisHash:publicKey(health.chain.genesisHash),programId:String(p.PROGRAM_ID),bondAddress:instrument};
  for(let attempt=0;attempt<3;attempt++){
    const first=await rpc('getAccountInfo',[instrument,{encoding:'base64',commitment:'confirmed'}]);let end=slot(first?.context?.slot),start=end;
    const rootBytes=accountBytes(first.value,p.PROGRAM_ID),root=p.decodeBondV2(rootBytes);
    assert.equal(await p.deriveBondV2(root.issuer,root.seriesId),instrument);assert.equal(await p.deriveBondMintV2(instrument),root.bondMint);
    assert.equal(await p.deriveVaultV2(instrument),root.vault);assert.equal(root.scheduleAppended,root.couponCount);
    if(root.holderCount<1||root.holderCount>1000||root.couponCount<1||root.couponCount>64)throw new Error('Instrument exceeds this bounded shadow verifier graph scope');
    const cache=new Map<string,RawAccount|null>([[instrument,first.value]]);
    const batch=async(keys:string[])=>{const missing=[...new Set(keys)].filter(key=>!cache.has(key));if(cache.size+missing.length>4096)throw new Error('Bounded graph read limit exceeded');
      for(let at=0;at<missing.length;at+=100){const part=missing.slice(at,at+100),result=await rpc('getMultipleAccounts',[part,{encoding:'base64',commitment:'confirmed',minContextSlot:end}]);
        const next=slot(result?.context?.slot);if(next<end||!Array.isArray(result.value)||result.value.length!==part.length)throw new Error('Direct RPC returned torn or incomplete account response');end=next;
        part.forEach((key,i)=>cache.set(key,result.value[i]));}};
    const registryKeys=await Promise.all(Array.from({length:Math.ceil(root.holderCount/8)},(_,i)=>p.deriveRegistryPageV2(instrument,i)));
    const scheduleKeys=await Promise.all(Array.from({length:Math.ceil(root.couponCount/8)},(_,i)=>p.deriveSchedulePageV2(instrument,i)));
    const voteIds=(state.proposals??[]).map((v:Json)=>Number(uint(v.id))).filter((n:number)=>Number.isSafeInteger(n)&&n<=0xffffffff);
    const actionRefs=[...Array.from({length:root.couponCount},(_,id)=>({kind:1 as p.ActionKindV2,id})),{kind:2 as p.ActionKindV2,id:0},...voteIds.map((id:number)=>({kind:3 as p.ActionKindV2,id}))];
    const actionKeys=await Promise.all(actionRefs.map(a=>p.deriveActionV2(instrument,a.kind,a.id)));
    await batch([...registryKeys,...scheduleKeys,...actionKeys]);
    const wallets:string[]=[];
    for(let page=0;page<registryKeys.length;page++){const registry=p.decodeRegistryPageV2(accountBytes(cache.get(registryKeys[page]),p.PROGRAM_ID));
      assert.equal(registry.bond,instrument);assert.equal(registry.index,page);assert.equal(registry.wallets.length,Math.min(8,root.holderCount-page*8));wallets.push(...registry.wallets);}
    assert.equal(new Set(wallets).size,wallets.length);
    const schedule=[];
    for(let page=0;page<scheduleKeys.length;page++){const value=p.decodeSchedulePageV2(accountBytes(cache.get(scheduleKeys[page]),p.PROGRAM_ID));assert.equal(value.bond,instrument);assert.equal(value.index,page);schedule.push(...value.terms);}
    assert.equal(schedule.length,root.couponCount);let previousRecord=0n,previousPayment=0n;
    for(const terms of schedule){assert.ok(terms.recordTs>previousRecord&&terms.paymentTs>previousPayment&&terms.paymentTs>=terms.recordTs&&terms.paymentTs<=root.maturityTs);
      if(root.rateBps||root.couponFrequency)assert.equal(terms.unitAmount,couponPerBond(root.faceValue,root.rateBps,root.couponFrequency));previousRecord=terms.recordTs;previousPayment=terms.paymentTs;}
    const records=await Promise.all(wallets.map(wallet=>p.deriveHolderV2(instrument,wallet)));
    const atas=await Promise.all(wallets.map(wallet=>p.ata(wallet,root.bondMint)));
    const cashAtas=await Promise.all(wallets.map(wallet=>p.ata(wallet,root.settlementMint)));
    const actions=actionKeys.flatMap((key,index)=>{const raw=cache.get(key);if(!raw)return[];const value=p.decodeActionV2(accountBytes(raw,p.PROGRAM_ID));
      assert.equal(value.bond,instrument);assert.equal(value.kind,actionRefs[index].kind);assert.equal(value.id,actionRefs[index].id);return[{key,value}];});
    const snapshotRefs=await Promise.all(actions.flatMap(a=>Array.from({length:a.value.capturedPages},(_,page)=>({a,page}))).map(async row=>({...row,key:await p.deriveSnapshotPageV2(row.a.key,row.page)})));
    await batch([root.bondMint,root.settlementMint,root.vault,await p.ata(root.issuer,root.settlementMint),...records,...atas,...cashAtas,...snapshotRefs.map(r=>r.key)]);
    const mint=getMintDecoder().decode(accountBytes(cache.get(root.bondMint),TOKEN_PROGRAM_ADDRESS));assert.equal(mint.decimals,0);assert.equal(mint.isInitialized,true);
    for(const authority of [mint.mintAuthority,mint.freezeAuthority]){assert.equal(authority.__option,'Some');if(authority.__option==='Some')assert.equal(authority.value,instrument);}
    const settlement=getMintDecoder().decode(accountBytes(cache.get(root.settlementMint),TOKEN_PROGRAM_ADDRESS));assert.equal(settlement.decimals,6);assert.equal(settlement.isInitialized,true);
    const vault=getTokenDecoder().decode(accountBytes(cache.get(root.vault),TOKEN_PROGRAM_ADDRESS));assert.equal(vault.mint,root.settlementMint);assert.equal(vault.owner,instrument);assert.equal(vault.state,1);
    const holders=wallets.map((wallet,index)=>{const record=p.decodeHolderV2(accountBytes(cache.get(records[index]),p.PROGRAM_ID));assert.equal(record.bond,instrument);assert.equal(record.wallet,wallet);assert.equal(record.index,index);
      const raw=cache.get(atas[index]);if(!raw)return{wallet,units:'0'};
      const token=getTokenDecoder().decode(accountBytes(raw,TOKEN_PROGRAM_ADDRESS));assert.equal(token.owner,wallet);assert.equal(token.mint,root.bondMint);if(token.amount>0n)assert.equal(token.state,2);
      assert.equal(token.delegate.__option,'None');assert.equal(token.closeAuthority.__option,'None');return{wallet,units:String(token.amount)};});
    assert.equal(holders.reduce((sum,h)=>sum+BigInt(h.units),0n),mint.supply);assert.equal(mint.supply,root.totalIssued-root.totalRedeemed);
    let couponPaid=0n,principalPaid=0n;const ballots:string[]=[];
    for(const action of actions){let sum=0n,claimed=0n,paid=0n;
      for(const ref of snapshotRefs.filter(ref=>ref.a.key===action.key)){const page=p.decodeSnapshotPageV2(accountBytes(cache.get(ref.key),p.PROGRAM_ID));assert.equal(page.action,action.key);assert.equal(page.index,ref.page);
        assert.equal(page.units.length,Math.min(8,action.value.holderCount-ref.page*8));sum+=page.units.reduce((a,b)=>a+b,0n);
        const paidUnits=page.units.filter((_,i)=>(page.claimedMask&(1<<i))!==0).reduce((a,b)=>a+b,0n);claimed+=paidUnits;paid+=page.paidTotal;assert.equal(page.paidTotal,paidUnits*action.value.unitAmount);
        if(action.value.kind===3)for(let i=0;i<page.units.length;i++)if(page.votedMask&(1<<i))ballots.push(await p.deriveBallotV2(action.key,wallets[ref.page*8+i]));}
      assert.equal(sum,action.value.totalUnits);assert.equal(claimed,action.value.claimedUnits);assert.equal(paid,action.value.paidTotal);
      if(action.value.finalized)assert.equal(sum,root.totalIssued);
      if(action.value.kind===1)couponPaid+=paid;if(action.value.kind===2)principalPaid+=paid;
    }
    await batch(ballots);
    const last=await rpc('getAccountInfo',[instrument,{encoding:'base64',commitment:'confirmed',minContextSlot:end}]);const lastSlot=slot(last.context?.slot);if(lastSlot<end)throw new Error('Direct RPC revision-fence context regressed');end=lastSlot;
    if(!accountBytes(last.value,p.PROGRAM_ID).equals(rootBytes))continue;
    if(await rpc('getGenesisHash')!==scope.genesisHash)throw new Error('Direct RPC genesis changed during graph read');
    const action=actions.find(a=>a.key===selected.snapshotAddress);if(!action||action.value.kind!==1||!action.value.finalized)throw new Error('Selected coupon is absent, forecast, or capture is not finalized');
    assert.equal(String(action.value.id),selected.couponId);const holderIndex=wallets.indexOf(selected.wallet);
    if(holderIndex<0||holderIndex>=action.value.holderCount)throw new Error('Selected beneficiary is outside the immutable snapshot prefix');
    const snapshotKey=await p.deriveSnapshotPageV2(action.key,Math.floor(holderIndex/8)),snapshot=p.decodeSnapshotPageV2(accountBytes(cache.get(snapshotKey),p.PROGRAM_ID));
    if(snapshot.claimedMask&(1<<(holderIndex%8)))throw new Error('Selected right is already paid on-chain');
    assert.equal(String(snapshot.units[holderIndex%8]),selected.units);assert.equal(String(snapshot.units[holderIndex%8]*action.value.unitAmount),selected.amountMinor);
    // Finalized bank reads are additional evidence; capture finalization alone
    // must not be mislabeled as consensus transaction finality.
    const final=await rpc('getMultipleAccounts',[[action.key,snapshotKey],{encoding:'base64',commitment:'finalized'}]);
    const fa=p.decodeActionV2(accountBytes(final?.value?.[0],p.PROGRAM_ID)),fp=p.decodeSnapshotPageV2(accountBytes(final?.value?.[1],p.PROGRAM_ID));
    if(!fa.finalized||fa.kind!==1||fp.claimedMask&(1<<(holderIndex%8)))throw new Error('Selected right is unknown, not finalized at the queried bank, or already paid');
    assert.equal(fa.bond,instrument);assert.equal(fa.id,action.value.id);assert.equal(fp.action,action.key);assert.equal(fp.units[holderIndex%8],snapshot.units[holderIndex%8]);assert.equal(fa.unitAmount,action.value.unitAmount);
    const clock=await rpc('getAccountInfo',[clockAddress,{encoding:'base64',commitment:'confirmed'}]),clockBytes=accountBytes(clock.value,'Sysvar1111111111111111111111111111111111111');assert.equal(clockBytes.length,40);
    const clockTimestamp=clockBytes.readBigInt64LE(32);if(clockTimestamp<action.value.paymentTs)throw new Error('Coupon payment is not due on the actual chain clock');
    assert.equal(state.context.revision,String(root.revision));assert.equal(state.instrument.bondMint,root.bondMint);assert.equal(state.instrument.settlementMint,root.settlementMint);
    assert.equal(state.instrument.issuedSupply,String(root.totalIssued));assert.equal(state.instrument.redeemedSupply,String(root.totalRedeemed));assert.equal(state.instrument.vaultBalanceMinor,String(vault.amount));
    assert.deepEqual(state.holders.map((h:Json)=>({wallet:h.wallet,units:h.units})),holders);
    const financial={issuedSupply:String(root.totalIssued),redeemedSupply:String(root.totalRedeemed),mintSupply:String(mint.supply),vaultMinor:String(vault.amount),couponPaid:String(couponPaid),principalPaid:String(principalPaid),revision:String(root.revision)};
    assert.equal(state.reconciliation.totals.couponPaid.baseUnits,financial.couponPaid);assert.equal(state.reconciliation.totals.principalPaid.baseUnits,financial.principalPaid);
    const accounts=[...cache].sort(([a],[b])=>a.localeCompare(b)).map(([key,raw])=>({address:key,owner:raw?.owner??null,dataBase64:raw?accountBytes(raw).toString('base64'):null}));
    return{scope,revision:String(root.revision),root,holders,selected,financial,accounts,accountSha256:hash(accounts),slots:{start,end},
      clock:{slot:String(clockBytes.readBigUInt64LE(0)),timestamp:String(clockTimestamp)},finalizedRight:{commitment:'finalized',contextSlot:slot(final.context?.slot),
        actionAddress:action.key,snapshotPageAddress:snapshotKey,actionDataSha256:sha(accountBytes(final.value[0],p.PROGRAM_ID)),snapshotDataSha256:sha(accountBytes(final.value[1],p.PROGRAM_ID)),
        claimed:false,amountMinor:selected.amountMinor,captureFinalized:true}};
  }
  throw new Error('On-chain revision changed during three bounded graph reads');
}

async function verifyRelease(health:Json,rpc:(method:string,params?:unknown[])=>Promise<any>){
  const expected=JSON.parse(fs.readFileSync(new URL('../programs/bondtrace/release.json',import.meta.url),'utf8')) as Json;
  assert.equal(expected.programId,p.PROGRAM_ID);assert.equal(health.program.expected.sha256,expected.sha256);assert.equal(health.program.expected.programLen,expected.programLen);
  if(!Number.isSafeInteger(expected.programLen)||expected.programLen<1||expected.programLen>10*1024*1024||!/^[a-f0-9]{64}$/.test(expected.sha256))throw new Error('Invalid local release descriptor');
  const genesis=await rpc('getGenesisHash');assert.equal(genesis,health.chain.genesisHash);
  const program=await rpc('getAccountInfo',[p.PROGRAM_ID,{encoding:'base64',commitment:'confirmed'}]);assert.equal(program.value?.executable,true);assert.equal(program.value?.owner,loader);
  const bytes=accountBytes(program.value,loader,true);assert.equal(bytes.length,36);assert.equal(bytes.readUInt32LE(0),2);
  const dataAddress=String(getAddressDecoder().decode(bytes.subarray(4))),[canonical]=await getProgramDerivedAddress({programAddress:address(loader),seeds:[bytes32(p.PROGRAM_ID)]});assert.equal(dataAddress,canonical);
  const data=await rpc('getAccountInfo',[dataAddress,{encoding:'base64',commitment:'confirmed'}]),payload=accountBytes(data.value,loader);
  assert.equal(payload.readUInt32LE(0),3);if(payload.length<45+expected.programLen)throw new Error('Deployed bytecode is truncated');
  assert.equal(sha(payload.subarray(45,45+expected.programLen)),expected.sha256);if(payload.subarray(45+expected.programLen).some(n=>n!==0))throw new Error('Unexpected nonzero deployed padding');
  return {programId:String(p.PROGRAM_ID),genesisHash:genesis,sha256:expected.sha256,programLen:expected.programLen,programDataAddress:dataAddress,
    programHeaderSha256:sha(bytes),programDataHeaderSha256:sha(payload.subarray(0,45)),verification:'actual-confirmed-RPC-deployed-payload',sourceToBinaryAttested:false};
}

function parseArgs(values:string[]):Json{
  const allowed=new Set(['origin','instrument','authority-file','output-dir','operation-id','amount-minor','resume']);const result:Json={};
  for(let i=0;i<values.length;i++){const name=values[i].replace(/^--/,'');if(!values[i].startsWith('--')||!allowed.has(name)||Object.hasOwn(result,name))throw new Error('Unknown or repeated verifier option');
    if(name==='resume')result[name]=true;else{const value=values[++i];if(!value||value.startsWith('--'))throw new Error('Missing verifier option');result[name]=value;}}
  for(const name of ['origin','instrument','authority-file','output-dir'])if(typeof result[name]!=='string')throw new Error('Missing --'+name);
  return result;
}
function localOrigin(value:unknown){if(typeof value!=='string')throw new Error('Explicit product origin is required');const url=new URL(value);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Only a plain loopback HTTP product origin is permitted');return url.origin;}
function localRpc(value:unknown){if(typeof value!=='string')throw new Error('Health omitted the local RPC URL');const url=new URL(value);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw new Error('Only a plain loopback HTTP RPC is permitted');return url.href;}
function rejectRedirect(status:number){if(status>=300&&status<400)throw new Error('HTTP redirects are rejected, including cross-origin redirects');}
function publicKey(value:unknown){if(typeof value!=='string')throw new Error('Expected a complete public address');return String(address(value));}
function identifier(value:unknown){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(value))throw new Error('Invalid immutable integration identifier');return value;}
function uint(value:unknown){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value))throw new Error('Expected a canonical integer string');const result=BigInt(value);if(result>maxU64)throw new Error('u64 amount overflow');return result;}
function slot(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid direct RPC context slot');return value;}
function bytes32(value:string){return new Uint8Array(getAddressEncoder().encode(address(value)));}
function sha(value:Buffer|string){return createHash('sha256').update(value).digest('hex');}
function canonicalJson(value:unknown):string{
  let count=0;const normalize=(item:unknown,depth=0):unknown=>{
    if(depth>12||++count>12000)throw new Error('Canonical integration payload exceeds its structural bound');
    if(item===null||typeof item==='string'||typeof item==='boolean')return item;
    if(typeof item==='number'){if(!Number.isSafeInteger(item))throw new Error('Numeric values must be exact safe integers');return item;}
    if(typeof item==='bigint')return item.toString();if(Array.isArray(item))return item.map(v=>normalize(v,depth+1));
    if(typeof item==='object'&&item){const result:Json={};for(const key of Object.keys(item).sort()){if(['__proto__','prototype','constructor'].includes(key))throw new Error('Unsupported canonical key');const value=(item as Json)[key];if(value!==undefined)result[key]=normalize(value,depth+1);}return result;}
    throw new Error('Unsupported canonical integration value');};return JSON.stringify(normalize(value));
}
function hash(value:unknown){return sha(canonicalJson(value));}
function runDigest(run:Run){return hash({schemaVersion:run.schemaVersion,origin:run.origin,instrument:run.instrument,operationId:run.operationId,
  createdAt:run.createdAt,authorityFingerprints:run.authorityFingerprints,scope:run.scope,release:run.release,selected:run.selected,
  baselineAccountSha256:run.baseline.accountSha256,baselineHttp:run.baselineHttp,registryEnvelope:run.registryEnvelope,planRequest:run.planRequest});}
function signingBytes(payload:unknown){const bytes=Buffer.from('BondTrace integration v1\n'+canonicalJson(payload));if(bytes.length>65000)throw new Error('Signed integration payload exceeds 65000 bytes');return bytes;}
function publicAuthority(value:Authority):PublicAuthority{return{authorityId:value.authorityId,sourceId:value.sourceId,publicKeyBase64:value.publicKeyBase64};}
function signed(payload:Json,authority:Authority):Envelope{return{payload,authorityId:authority.authorityId,signatureBase64:sign(null,signingBytes(payload),authority.privateKey).toString('base64')};}
function assertEnvelope(envelope:Envelope,authority:Authority){assert.equal(envelope.authorityId,authority.authorityId);const sig=Buffer.from(envelope.signatureBase64,'base64');
  if(sig.length!==64||sig.toString('base64')!==envelope.signatureBase64||!verify(null,signingBytes(envelope.payload),createPublicKey(authority.privateKey),sig))throw new Error('Immutable public envelope signature does not verify');}
function validityTimes(){return{issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60*60_000).toISOString()};}
function ignoredPath(value:unknown,directory:boolean){if(typeof value!=='string')throw new Error('Explicit ignored path is required');const absolute=path.resolve(value),root=path.resolve('.local'),relative=path.relative(root,absolute);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Authority and evidence files must remain under the ignored .local workspace');
  let current=path.parse(absolute).root;const parts=absolute.slice(current.length).split(path.sep).filter(Boolean);
  for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]);if(fs.existsSync(current)){const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||(i<parts.length-1||directory)&&!stat.isDirectory())throw new Error('Ignored paths must have regular non-linked ancestors');}
    else if(i<parts.length-1||directory)fs.mkdirSync(current,{mode:0o700});else throw new Error('Generated authority descriptor is missing');}
  return absolute;
}
function parseAuthority(raw:unknown):Authority{
  try{if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['authorityId','sourceId','publicKeyBase64','privateKeyPem'].includes(k)))throw new Error();const row=raw as Json;
    const authorityId=identifier(row.authorityId),sourceId=identifier(row.sourceId),publicBytes=Buffer.from(row.publicKeyBase64,'base64');
    if(publicBytes.length!==32||publicBytes.toString('base64')!==row.publicKeyBase64||typeof row.privateKeyPem!=='string'||row.privateKeyPem.length>8192)throw new Error();
    const privateKey=createPrivateKey(row.privateKeyPem);if(privateKey.asymmetricKeyType!=='ed25519')throw new Error();
    const actual=createPublicKey(privateKey).export({format:'der',type:'spki'}) as Buffer;if(!actual.equals(Buffer.concat([spkiPrefix,publicBytes])))throw new Error();
    return{authorityId,sourceId,publicKeyBase64:row.publicKeyBase64,privateKey};
  }catch{throw new Error('Generated integration authority descriptor failed Ed25519/key-pair validation');}
}
function readPrivateDescriptor(file:string){if(!fs.statSync(file).isFile()||fs.statSync(file).size>32768)throw new Error('Generated descriptor must be a bounded regular JSON file');
  let value:Json;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('Generated authority descriptor is not valid JSON');}
  if(value.schemaVersion!==1||Object.keys(value).some(k=>!['schemaVersion','registry','settlement'].includes(k)))throw new Error('Unsupported generated authority descriptor format');
  const registry=parseAuthority(value.registry),settlement=parseAuthority(value.settlement);
  if(registry.authorityId===settlement.authorityId||registry.publicKeyBase64===settlement.publicKeyBase64)throw new Error('Configure two distinct generated authorities');return{registry,settlement};}
function accountBytes(value:RawAccount|null|undefined,owner?:string,executable=false){if(!value||typeof value.owner!=='string'||value.executable!==executable||!Array.isArray(value.data)||value.data.length!==2||value.data[1]!=='base64'||typeof value.data[0]!=='string')throw new Error('Invalid direct RPC account envelope');
  if(owner&&value.owner!==owner)throw new Error('Direct RPC account owner differs from canonical program');const bytes=Buffer.from(value.data[0],'base64');if(bytes.toString('base64')!==value.data[0])throw new Error('Noncanonical RPC account base64');return bytes;}
function checkHealth(health:Json,_instrument:string){if(health.status!=='ok'||health.chain?.network!=='localnet'||health.program?.network!=='localnet'||health.program?.status!=='known-match'||health.program?.signingAllowed!==true)throw new Error('Product health must identify a verified matching localnet release');
  assert.equal(health.chain.programId,p.PROGRAM_ID);assert.equal(health.program.programId,p.PROGRAM_ID);assert.equal(health.program.genesisHash,health.chain.genesisHash);publicKey(health.chain.genesisHash);}
function checkCapabilities(value:Json,authorities:PublicAuthority[]){if(value.mode!=='shadow'||value.enabled!==true||value.realAssets!==false||value.partnerConnection!=='unverified'||value.bankOrKaseIntegration!==false||!value.adapters?.includes('sandbox-file'))throw new Error('Expected the explicitly nonexecuting shadow integration adapter');
  for(const [i,authority]of authorities.entries()){const entry=value.authorities?.find((row:Json)=>row.authorityId===authority.authorityId&&row.sourceId===authority.sourceId);if(!entry?.scopes?.includes(i===0?'registry':'settlement-ack'))throw new Error('Product has not configured the expected generated authority purpose');}}
function checkState(value:Json,instrument:string){if(value.connected!==true||value.network!=='localnet'||value.instrument?.address!==instrument||value.instrument?.version!==2||value.reconciliation?.status!=='verified'||value.context?.commitment!=='confirmed'||value.context?.sameBank!==false)throw new Error('Actual coherent paged instrument state is required');
  if(!Array.isArray(value.holders)||!Array.isArray(value.coupons)||value.instrument.settlementDecimals!==6)throw new Error('Incomplete financial state');}
function selectRight(state:Json,amount:bigint):Selected{
  for(const coupon of state.coupons??[]){if(coupon.basis!=='immutable-record-date-snapshot'||coupon.capture?.finalized!==true||coupon.status!=='funded')continue;
    for(const right of coupon.entitlements??[]){if(right.claimed!==false||right.eligible!==true||right.claimableNow!==true||right.basis!=='immutable-record-date-snapshot')continue;
      if(uint(right.amountMinor)!==amount||uint(right.units)===0n)continue;
      return{couponId:String(uint(coupon.id)),wallet:publicKey(right.wallet),snapshotAddress:publicKey(coupon.snapshotAddress),units:String(uint(right.units)),amountMinor:String(amount)};}}
  throw new Error('No matching positive unpaid due finalized coupon right exists; forecast/unknown/paid rights are excluded');
}
function financialProjection(state:Json){const i=state.instrument;
  const rights=(rows:Json[])=>rows.map(r=>({wallet:r.wallet,units:r.units,amountMinor:r.amountMinor,claimed:r.claimed,eligible:r.eligible,basis:r.basis}));
  return{instrument:{address:i.address,bondMint:i.bondMint,settlementMint:i.settlementMint,issuedSupply:i.issuedSupply,redeemedSupply:i.redeemedSupply,
    status:i.status,revision:i.revision,vaultBalanceMinor:i.vaultBalanceMinor},holders:state.holders.map((h:Json)=>({wallet:h.wallet,units:h.units,tokenAccount:h.tokenAccount})),
    coupons:state.coupons.map((c:Json)=>({id:c.id,snapshotAddress:c.snapshotAddress,basis:c.basis,totalMinor:c.totalMinor,paidMinor:c.paidMinor,entitlements:rights(c.entitlements)})),
    redemption:state.redemption?{snapshotAddress:state.redemption.snapshotAddress,paidMinor:state.redemption.paidMinor,entitlements:rights(state.redemption.entitlements)}:null,
    totals:{couponPaid:state.reconciliation.totals.couponPaid.baseUnits,principalPaid:state.reconciliation.totals.principalPaid.baseUnits,remaining:state.reconciliation.totals.remainingObligations.baseUnits}};
}
function checkShadowStatus(value:Json,paymentId:string){assert.equal(value.realAssets,false);assert.equal(value.partnerConnection,'unverified');assert.equal(value.outbox.length,1);const row=value.outbox[0];assert.equal(row.paymentId,paymentId);assert.equal(row.externalStatus,'simulated-settled');assert.equal(row.onChainStatus,'unclaimed');assert.equal(row.dispatchAllowed,false);assert.equal(row.acknowledgementDigests.length,1);assert.equal(row.disputeDigests.length,0);}
async function boundedBody(response:Response,maximum:number){const declared=response.headers.get('content-length');if(declared&&Number(declared)>maximum)throw new Error('Transport body exceeds its configured bound');
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty transport body');const pieces:Buffer[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>maximum){await reader.cancel();throw new Error('Transport body exceeds its configured bound');}pieces.push(Buffer.from(chunk.value));}return Buffer.concat(pieces);}
async function verifyBuiltUi(origin:string,basic?:string){const response=await fetch(origin+'/',{redirect:'manual',headers:basic?{authorization:basic}:{},signal:AbortSignal.timeout(30_000)});rejectRedirect(response.status);
  if(!response.ok||!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')??''))throw new Error('Actual built product HTML was not served');
  const html=await boundedBody(response,2*1024*1024),text=html.toString('utf8'),src=text.match(/<script[^>]+src=["']([^"']+)["']/i)?.[1];
  if(!src||!text.includes('id="root"'))throw new Error('Expected built application entry and root element');const url=new URL(src,origin);if(url.origin!==origin||!/^\/assets\//.test(url.pathname)||url.search||url.hash)throw new Error('Built entry asset must remain on the product origin');
  const asset=await fetch(url,{redirect:'manual',headers:basic?{authorization:basic}:{},signal:AbortSignal.timeout(30_000)});rejectRedirect(asset.status);if(!asset.ok||!/(?:javascript|ecmascript)/i.test(asset.headers.get('content-type')??''))throw new Error('Built JavaScript asset is unavailable');
  return{htmlSha256:sha(html),assetPath:url.pathname,assetSha256:sha(await boundedBody(asset,4*1024*1024)),scope:'Actual HTTP HTML and hashed same-origin built entry asset'};
}
function selfTest(){
  let checks=0;const check=(fn:()=>void)=>{fn();checks++;};
  const pair=generateKeyPairSync('ed25519'),publicKeyBase64=(pair.publicKey.export({type:'spki',format:'der'}) as Buffer).subarray(-32).toString('base64');
  const authority=parseAuthority({authorityId:'pure_registry',sourceId:'pure_registry_source',publicKeyBase64,privateKeyPem:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()});
  check(()=>assert.equal(localOrigin('http://127.0.0.1:3190/'),'http://127.0.0.1:3190'));
  check(()=>{for(const url of ['https://example.org','http://user:secret@127.0.0.1:3190','http://127.0.0.1:3190/other','http://127.0.0.1:3190/?token=secret'])assert.throws(()=>localOrigin(url));assert.throws(()=>rejectRedirect(302));assert.throws(()=>localRpc('https://api.mainnet-beta.solana.com'));});
  check(()=>{assert.equal(canonicalJson({z:2,a:[1n,true]}),'{"a":["1",true],"z":2}');assert.throws(()=>canonicalJson({amount:1.5}));assert.throws(()=>canonicalJson(JSON.parse('{"__proto__":1}')));});
  const payload={domain:'bondtrace.registry-attestation.v1',schemaVersion:1,chain:{network:'localnet',bondAddress:p.PROGRAM_ID},issuedAt:'2026-10-10T00:00:00.000Z',expiresAt:'2026-10-10T01:00:00.000Z'};
  check(()=>{const envelope=signed(payload,authority);assertEnvelope(envelope,authority);assert.throws(()=>assertEnvelope({...envelope,payload:{...payload,chain:{...payload.chain,bondAddress:'11111111111111111111111111111111'}}},authority));});
  check(()=>{assert.equal(hash({b:2,a:1}),hash({a:1,b:2}));assert.notEqual(hash({a:1}),hash({a:2}));});
  const right={wallet:String(p.PROGRAM_ID),units:'10',amountMinor:'500000000',claimed:false,eligible:true,claimableNow:true,basis:'immutable-record-date-snapshot'};
  const coupon={id:'0',snapshotAddress:String(p.PROGRAM_ID),status:'funded',basis:'immutable-record-date-snapshot',capture:{finalized:true},entitlements:[right]};
  check(()=>{assert.equal(selectRight({coupons:[coupon]},500000000n).units,'10');for(const bad of [{...coupon,basis:'scheduled-forecast'},{...coupon,capture:{finalized:false}},
    {...coupon,entitlements:[{...right,claimed:true}]},{...coupon,entitlements:[{...right,claimed:undefined}]},{...coupon,entitlements:[{...right,claimableNow:false}]},{...coupon,status:'unknown'}])assert.throws(()=>selectRight({coupons:[bad]},500000000n));});
  console.log(JSON.stringify({passed:true,pureChecks:checks,scope:'Pure URL/canonical-signature/hash/entitlement validation fixtures only',httpRequests:0,rpcReads:0,rpcWrites:0,actualChainVerified:false}));
}
