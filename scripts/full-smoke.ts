import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.BONDTRACE_ORIGIN??'http://127.0.0.1:3000';
const proofs:unknown[]=[];
async function api(path:string,body?:unknown){const res=await fetch(base+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const value=await res.json();if(!res.ok)throw new Error(value.error?.code+': '+value.error?.message);return value;}
async function action(name:string,role:string,params:Record<string,string>={},operationId=crypto.randomUUID()){const result=await api('/api/demo/action',{action:name,role,params,operationId});assert.equal(result.status,'confirmed');assert.ok(result.signature);proofs.push({action:name,role,...result});console.log(JSON.stringify({action:name,status:result.status,signature:result.signature}));return result;}
async function waitUntil(target:string){const limit=Date.now()+480000;while(Date.now()<limit){const s=await api('/api/state');if(Date.parse(s.serverTime)>=Date.parse(target))return;await new Promise(resolve=>setTimeout(resolve,1800));}throw new Error('Chain-clock deadline did not arrive');}
await api('/api/demo/bootstrap',{reset:true,operationId:crypto.randomUUID()});let s=await api('/api/state');assert.equal(s.holders.length,3);assert.equal(s.instrument.issuedSupply,'18');assert.equal(s.instrument.vaultBalanceMinor,'18900000000');assert.equal(s.coupons[0].totalMinor,'900000000');
await action('create_vote','issuer',{proposalId:'1',title:'Продолжить выпуск новой серии?'});await action('cast_vote','investor1',{proposalId:'1',choice:'yes'});
s=await api('/api/state');assert.equal(s.proposals[0].yesWeight,'10');
try{await api('/api/demo/action',{action:'cast_vote',role:'investor1',params:{proposalId:'1',choice:'no'},operationId:crypto.randomUUID()});assert.fail('Second ballot passed');}catch(error){assert.match(String(error),/SIMULATION_FAILED|already.*ballot|AlreadyVoted/);}
console.log('Waiting for real on-chain record date');await waitUntil(s.instrument.recordAt);
await action('capture_coupon','issuer',{couponId:'0'});
await action('transfer_bonds','investor1',{targetWallet:s.demo.roleWallets.investor2,units:'2'});
s=await api('/api/state');assert.equal(s.holders[0].units,'8');assert.equal(s.coupons[0].entitlements[0].units,'10');assert.equal(s.coupons[0].entitlements[0].amountMinor,'500000000');
await waitUntil(s.instrument.paymentAt);const claimId=crypto.randomUUID();const paid=await action('claim_coupon','investor1',{couponId:'0'},claimId);
const replay=await api('/api/demo/action',{action:'claim_coupon',role:'investor1',params:{couponId:'0'},operationId:claimId});assert.equal(replay.signature,paid.signature);assert.equal(replay.status,'confirmed');const recovered=await api('/api/operations/'+claimId);assert.equal(recovered.signature,paid.signature);
try{await api('/api/demo/action',{action:'claim_coupon',role:'investor1',params:{couponId:'0'},operationId:crypto.randomUUID()});assert.fail('Duplicate coupon passed');}catch(error){assert.match(String(error),/ALREADY_CLAIMED/);}
await action('claim_coupon','investor2',{couponId:'0'});await action('claim_coupon','investor3',{couponId:'0'});
s=await api('/api/state');assert.equal(s.coupons[0].status,'completed');assert.equal(s.coupons[0].paidMinor,'900000000');assert.equal(s.instrument.vaultBalanceMinor,'18000000000');
console.log('Waiting for real on-chain maturity');await waitUntil(s.instrument.maturityAt);
await action('begin_redemption','issuer');for(const role of ['investor1','investor2','investor3'])await action('redeem_principal',role);
s=await api('/api/state');assert.equal(s.instrument.status,'redeemed');assert.equal(s.instrument.redeemedSupply,'18');assert.equal(s.instrument.vaultBalanceMinor,'0');assert.equal(s.redemption.paidMinor,'18000000000');assert.ok(s.holders.every((holder:any)=>holder.units==='0'));
try{await api('/api/demo/action',{action:'redeem_principal',role:'investor1',params:{},operationId:crypto.randomUUID()});assert.fail('Duplicate principal passed');}catch(error){assert.match(String(error),/ALREADY_CLAIMED/);}
const report={checkedAt:new Date().toISOString(),origin:base,network:s.network,instrument:s.instrument,checks:{exactEntitlement:true,historicalCouponAfterTransfer:true,oneBallot:true,duplicateCouponRejected:true,recoveryAndReplay:true,atomicPrincipalAndBurn:true,duplicatePrincipalRejected:true,zeroFinalSupplyAndVault:true},proofs};
fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync(`docs/evidence/full-smoke-${s.network}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({result:'passed',network:s.network,proofCount:proofs.length}));
