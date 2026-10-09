import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getTransactionDecoder,getTransactionEncoder} from '@solana/kit';
import {demoSigner,execute} from '../server/transactions.ts';
import {getCloseAccountInstruction,getCreateAssociatedTokenIdempotentInstruction} from '@solana-program/token';
import {getTransferSolInstruction} from '@solana-program/system';
import {ata} from '../packages/client/src/program.ts';
import {canonicalJson} from '../server/request-contract.ts';
import {createHash} from 'node:crypto';
import {network,fixtureFile,localDir} from '../server/config.ts';
import {chainClock,rpc} from '../server/rpc.ts';
import {fixture} from '../server/store.ts';

if(network!=='localnet')throw new Error('This reproduction targets localnet only');
if(localDir!==path.resolve('.local/backend-servicing/data'))throw new Error('Use the isolated .local/backend-servicing/data namespace');
const endpoint=process.env.BONDTRACE_API_ORIGIN;
if(!endpoint)throw new Error('Set BONDTRACE_API_ORIGIN to the isolated servicing API');
const apiOrigin=new URL(endpoint);if(apiOrigin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(apiOrigin.hostname)||apiOrigin.username||apiOrigin.password||apiOrigin.pathname!=='/'||apiOrigin.search||apiOrigin.hash)throw new Error('Issuer reproduction API must use an explicit loopback HTTP origin');
const issuer=await demoSigner('issuer'),a=await demoSigner('investor1'),b=await demoSigner('investor2');
const originalFixture=fs.existsSync(fixtureFile)?fs.readFileSync(fixtureFile):null;
const originalLogicalFixture=JSON.stringify(fixture());
const evidenceFile=process.env.BONDTRACE_EVIDENCE_FILE??'docs/evidence/servicing-lifecycle-localnet.json';
if(!/^docs\/evidence\/[a-z0-9-]+\.json$/.test(evidenceFile))throw new Error('Evidence output must be a named JSON file inside docs/evidence');
fs.mkdirSync(path.dirname(evidenceFile),{recursive:true});
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
  const wire=Buffer.from(getTransactionEncoder().encode(signed)).toString('base64');
  let result=await call('/api/transactions/submit',{signedTransactionBase64:wire});
  for(let attempts=0;result.status!=='confirmed'&&attempts<30;attempts++){await new Promise(r=>setTimeout(r,750));result=await call('/api/operations/'+prepared.operationId);}
  assert.equal(result.status,'confirmed');assert.ok(result.signature);
  if(name==='initialize_issue')bond=prepared.summary.instrumentAddress;
  const recovered=await call('/api/operations/'+prepared.operationId);assert.equal(recovered.signature,result.signature);assert.equal(recovered.status,'confirmed');assert.equal(recovered.projectionStatus,'complete');
  receipts.push({action:name,signer:signer.address,bond,signature:result.signature,operationId:prepared.operationId,simulation:prepared.summary.simulation,recovered:true});
  fs.mkdirSync('.local/backend-servicing',{recursive:true});fs.writeFileSync('.local/backend-servicing/checkpoint.json',JSON.stringify({bond,receipts},null,2));
  console.log(JSON.stringify({action:name,bond,signature:result.signature,status:result.status}));return result;
}
async function state(){return call('/api/state?instrument='+bond);}
async function due(time:bigint){while((await chainClock()).timestamp<time)await new Promise(r=>setTimeout(r,1000));}
const clock=(await chainClock()).timestamp;
const record1=clock+90n,record2=clock+125n,maturity=clock+175n;
await action('initialize_issue',issuer,{seriesId:String(Date.now()),name:'BondTrace · Servicing regression',settlementMint:initial.instrument.settlementMint,faceValueMinor:'1000000000',maturityTs:maturity.toString(),coupons:[{recordTs:record1.toString(),paymentTs:(record1+1n).toString(),unitAmount:'50000000'},{recordTs:record2.toString(),paymentTs:(record2+1n).toString(),unitAmount:'25000000'}]},true);
assert.ok((await state()).instruments.some((i:any)=>i.address===bond));
const auxiliaryReceipts:any[]=[];
for(const[holder,quantity,label]of [[a,10,'Operator holder A'],[b,5,'Operator holder B']] as const){
  await action('register_holder',issuer,{holderWallet:holder.address,label});
  const mint=(await state()).instrument.bondMint,holderAta=await ata(holder.address,mint);
  const closed=await execute([getCloseAccountInstruction({account:holderAta,destination:holder.address,owner:holder})],holder,'servicing_close_empty',[],holderAta,undefined,bond);
  assert.equal(closed.status,'confirmed');auxiliaryReceipts.push({action:'close-empty-ata',wallet:holder.address,signature:closed.signature});
  if(holder===a){const rent=await rpc<number>('getMinimumBalanceForRentExemption',[0]);assert.ok(Number.isSafeInteger(rent)&&rent>0);const prefunded=await execute([getTransferSolInstruction({source:holder,destination:holderAta,amount:BigInt(rent)})],holder,'servicing_prefund_empty',[],holderAta,undefined,bond);assert.equal(prefunded.status,'confirmed');auxiliaryReceipts.push({action:'prefund-empty-ata',wallet:holder.address,lamports:String(rent),signature:prefunded.signature});}
  // First holder lets the issuer API recreate the ATA; second restores an initialized ATA independently.
  if(holder===b){const restored=await execute([getCreateAssociatedTokenIdempotentInstruction({payer:holder,ata:holderAta,owner:holder.address,mint})],holder,'servicing_restore_empty',[],holderAta,undefined,bond);assert.equal(restored.status,'confirmed');auxiliaryReceipts.push({action:'restore-empty-ata',wallet:holder.address,signature:restored.signature});}
  await action('issue_units',issuer,{holderWallet:holder.address,units:String(quantity)});
}
let read=await state();assert.equal(read.instrument.requiredReserveMinor,'16125000000');assert.equal(read.instrument.fundingGapMinor,'16125000000');
await action('fund_vault',issuer,{amountMinor:read.instrument.fundingGapMinor});await action('seal_issue',issuer);assert.equal((await state()).instrument.status,'active');
await action('create_vote',issuer,{proposalId:'1',title:'Approve the next disclosure pack'});await action('cast_vote',a,{proposalId:'1',choice:'yes'});
await due(record1);await action('capture_coupon',issuer,{couponId:'0'});await action('transfer_bonds',a,{targetWallet:b.address,units:'2'});
await due(record2);await action('capture_coupon',issuer,{couponId:'1'});
read=await state();assert.equal(read.coupons[0].entitlements[0].amountMinor,'500000000');assert.equal(read.coupons[1].entitlements[0].amountMinor,'200000000');
await due(maturity);await action('begin_redemption',issuer);await action('redeem_principal',a);await action('redeem_principal',b);
const principalOnly=await call('/api/servicing?instrument='+bond);assert.equal(principalOnly.servicing.status,'principal-redeemed-coupons-outstanding');assert.equal(principalOnly.servicing.fullySettled,false);assert.equal(principalOnly.servicing.couponOutstandingMinor,'1125000000');
for(const id of ['0','1'])for(const holder of [a,b])await action('claim_coupon',holder,{couponId:id});
read=await state();assert.equal(read.instrument.redeemedSupply,'15');assert.equal(read.instrument.vaultBalanceMinor,'0');assert.equal(read.redemption.paidMinor,'15000000000');assert.deepEqual(read.coupons.map((c:any)=>c.paidMinor),['750000000','375000000']);assert.equal(read.proposals[0].yesWeight,'10');assert.equal(read.reconciliation.status,'verified');assert.equal(read.reconciliation.totals.cashPaid.baseUnits,'16125000000');assert.equal(read.reconciliation.totals.fundingGap.baseUnits,'0');assert.equal(fs.existsSync(fixtureFile),originalFixture!==null);if(originalFixture)assert.ok(fs.readFileSync(fixtureFile).equals(originalFixture));assert.equal(JSON.stringify(fixture()),originalLogicalFixture);
assert.equal(read.servicing.fullySettled,true);assert.deepEqual(read.proposalDiscovery.discoveredIds,['1']);
const exported=await call('/api/evidence?instrument='+bond);assert.equal(exported.integrity.payloadSha256,createHash('sha256').update(canonicalJson(exported.payload)).digest('hex'));assert.equal(exported.payload.reconciliation.totals.cashPaid.baseUnits,'16125000000');
fs.writeFileSync(evidenceFile,JSON.stringify({checkedAt:new Date().toISOString(),scope:'Real localnet unsigned API and generated test signer relay against the corrected SBF. Closed and recreated registered ATAs, two coupons, voting, principal burn then historical coupons, servicing states and evidence export. Not human-wallet/devnet or production proof.',origin:endpoint,chainIdentity:read.chainIdentity,bond,receipts,auxiliaryReceipts,principalOnly:principalOnly.servicing,evidenceDigest:exported.integrity,state:read},null,2)+'\n');
console.log(JSON.stringify({passed:true,bond,transactions:receipts.length,auxiliaryTransactions:auxiliaryReceipts.length,couponUnits:1125,principalUnits:15000,burned:15,legacyFixtureUnchanged:true}));
