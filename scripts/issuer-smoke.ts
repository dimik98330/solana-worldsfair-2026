import fs from 'node:fs';
import assert from 'node:assert/strict';
import {getTransactionDecoder,getTransactionEncoder} from '@solana/kit';
import {demoSigner} from '../server/transactions.ts';
import {network,fixtureFile} from '../server/config.ts';
import {chainClock} from '../server/rpc.ts';
import {fixture} from '../server/store.ts';

if(network!=='localnet')throw new Error('This reproduction targets localnet only');
const endpoint='http://127.0.0.1:3000';
const issuer=await demoSigner('issuer'),a=await demoSigner('investor1'),b=await demoSigner('investor2');
const originalFixture=fs.readFileSync(fixtureFile);
const originalLogicalFixture=JSON.stringify(fixture());
const evidenceFile=process.env.BONDTRACE_EVIDENCE_FILE??'docs/evidence/issuer-lifecycle-localnet.json';
if(!/^docs\/evidence\/[a-z0-9-]+\.json$/.test(evidenceFile))throw new Error('Evidence output must be a named JSON file inside docs/evidence');
const initial=await (await fetch(endpoint+'/api/state')).json();
assert.equal(initial.network,'localnet');assert.equal(initial.connected,true);
let bond='';const receipts:any[]=[];
async function call(route:string,body?:unknown){const response=await fetch(endpoint+route,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});const value=await response.json();if(!response.ok)throw new Error(JSON.stringify({status:response.status,error:value.error,route}));return value;}
async function action(name:string,signer:typeof issuer,params:Record<string,unknown>={},checkBadSignature=false){
  const prepared=await call('/api/actions/prepare',{action:name,walletAddress:signer.address,params:{...params,...(bond?{bondAddress:bond}:{})}});
  const decoded=getTransactionDecoder().decode(Buffer.from(prepared.transactionBase64,'base64'));
  assert.equal(prepared.summary.signer,signer.address);assert.equal(prepared.summary.network,'localnet');assert.equal(prepared.summary.simulation.success,true);
  const signature=new Uint8Array(await crypto.subtle.sign('Ed25519',signer.keyPair.privateKey,new Uint8Array(decoded.messageBytes)));
  const signed={...decoded,signatures:{...decoded.signatures,[signer.address]:signature as any}};
  if(checkBadSignature){const invalid=Uint8Array.from(signature);invalid[0]^=1;const bad=Buffer.from(getTransactionEncoder().encode({...signed,signatures:{...signed.signatures,[signer.address]:invalid as any}})).toString('base64');const rejected=await fetch(endpoint+'/api/transactions/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({signedTransactionBase64:bad})});assert.equal(rejected.status,400);assert.equal((await rejected.json()).error.code,'INVALID_SIGNATURE');}
  if(name==='initialize_issue'&&process.env.BONDTRACE_SMOKE_RESTART_GATE==='true'){
    fs.writeFileSync('.local/backend-focus/restart-gate.json',JSON.stringify({stage:'unsigned-prepared',operationId:prepared.operationId,instrument:prepared.summary.instrumentAddress,resume:false}));
    const started=Date.now();while(!JSON.parse(fs.readFileSync('.local/backend-focus/restart-gate.json','utf8')).resume){if(Date.now()-started>120000)throw new Error('Restart gate timed out before any chain relay');await new Promise(r=>setTimeout(r,500));}
    const retained=await call('/api/operations/'+prepared.operationId);assert.equal(retained.chainStatus,'not_submitted');
  }
  const wire=Buffer.from(getTransactionEncoder().encode(signed)).toString('base64');
  let result=await call('/api/transactions/submit',{signedTransactionBase64:wire});
  for(let attempts=0;result.status!=='confirmed'&&attempts<30;attempts++){await new Promise(r=>setTimeout(r,750));result=await call('/api/operations/'+prepared.operationId);}
  assert.equal(result.status,'confirmed');assert.ok(result.signature);
  if(name==='initialize_issue')bond=prepared.summary.instrumentAddress;
  const recovered=await call('/api/operations/'+prepared.operationId);assert.equal(recovered.signature,result.signature);assert.equal(recovered.status,'confirmed');assert.equal(recovered.projectionStatus,'complete');
  receipts.push({action:name,signer:signer.address,bond,signature:result.signature,operationId:prepared.operationId,simulation:prepared.summary.simulation,recovered:true});
  fs.mkdirSync('.local/issuer-smoke',{recursive:true});fs.writeFileSync('.local/issuer-smoke/checkpoint.json',JSON.stringify({bond,receipts},null,2));
  console.log(JSON.stringify({action:name,bond,signature:result.signature,status:result.status}));return result;
}
async function state(){return call('/api/state?instrument='+bond);}
async function due(time:bigint){while((await chainClock()).timestamp<time)await new Promise(r=>setTimeout(r,1000));}
const clock=(await chainClock()).timestamp;
const record1=clock+90n,record2=clock+125n,maturity=clock+175n;
await action('initialize_issue',issuer,{seriesId:String(Date.now()),name:'BondTrace · Operator lifecycle',settlementMint:initial.instrument.settlementMint,faceValueMinor:'1000000000',maturityTs:maturity.toString(),coupons:[{recordTs:record1.toString(),paymentTs:(record1+1n).toString(),unitAmount:'50000000'},{recordTs:record2.toString(),paymentTs:(record2+1n).toString(),unitAmount:'25000000'}]},true);
assert.ok((await state()).instruments.some((i:any)=>i.address===bond));
for(const[holder,quantity,label]of [[a,10,'Operator holder A'],[b,5,'Operator holder B']] as const){await action('register_holder',issuer,{holderWallet:holder.address,label});await action('issue_units',issuer,{holderWallet:holder.address,units:String(quantity)});}
let read=await state();assert.equal(read.instrument.requiredReserveMinor,'16125000000');assert.equal(read.instrument.fundingGapMinor,'16125000000');
await action('fund_vault',issuer,{amountMinor:read.instrument.fundingGapMinor});await action('seal_issue',issuer);assert.equal((await state()).instrument.status,'active');
await action('create_vote',issuer,{proposalId:'1',title:'Approve the next disclosure pack'});await action('cast_vote',a,{proposalId:'1',choice:'yes'});
await due(record1);await action('capture_coupon',issuer,{couponId:'0'});await action('transfer_bonds',a,{targetWallet:b.address,units:'2'});
await due(record2);await action('capture_coupon',issuer,{couponId:'1'});
read=await state();assert.equal(read.coupons[0].entitlements[0].amountMinor,'500000000');assert.equal(read.coupons[1].entitlements[0].amountMinor,'200000000');
await due(maturity);await action('begin_redemption',issuer);await action('redeem_principal',a);await action('redeem_principal',b);
for(const id of ['0','1'])for(const holder of [a,b])await action('claim_coupon',holder,{couponId:id});
read=await state();assert.equal(read.instrument.redeemedSupply,'15');assert.equal(read.instrument.vaultBalanceMinor,'0');assert.equal(read.redemption.paidMinor,'15000000000');assert.deepEqual(read.coupons.map((c:any)=>c.paidMinor),['750000000','375000000']);assert.equal(read.proposals[0].yesWeight,'10');assert.equal(read.reconciliation.status,'verified');assert.equal(read.reconciliation.totals.cashPaid.baseUnits,'16125000000');assert.equal(read.reconciliation.totals.fundingGap.baseUnits,'0');assert.ok(fs.readFileSync(fixtureFile).equals(originalFixture));assert.equal(JSON.stringify(fixture()),originalLogicalFixture);
fs.writeFileSync(evidenceFile,JSON.stringify({checkedAt:new Date().toISOString(),scope:'Real unsigned API preparation and exact-message external generated test signer relay through the built same-origin app; not a human wallet/devnet test. Two coupons, historical claims after redemption; legacy demo fixture unchanged.',unsignedPreparationSurvivedApiRestart:process.env.BONDTRACE_SMOKE_RESTART_GATE==='true',bond,receipts,state:read},null,2)+'\n');
console.log(JSON.stringify({passed:true,bond,transactions:receipts.length,couponUnits:1125,principalUnits:15000,burned:15,legacyFixtureUnchanged:true}));
