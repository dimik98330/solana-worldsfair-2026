import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {address,getAddressDecoder,getTransactionDecoder,getTransactionEncoder,createTransactionMessage,setTransactionMessageFeePayerSigner,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,createNoopSigner,compileTransaction,setTransactionMessageComputeUnitLimit} from '@solana/kit';
import {getTokenEncoder,TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/coupon-settlement-'+crypto.randomUUID());
const [{makeCouponSettlement},{normalizeRequest},{AppError},program]=await Promise.all([import('../../server/coupon-settlement.ts'),import('../../server/request-contract.ts'),import('../../server/rpc.ts'),import('../../packages/client/src/program.ts')]);
type View=Awaited<ReturnType<NonNullable<Parameters<typeof makeCouponSettlement>[2]>['readView']>>;
const key=(n:number)=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i===0?n:49));
async function model(){
 const issuer=key(1),bondAddress=await program.deriveBond(issuer,2n),mint=await program.derive('bond_mint',bondAddress),vault=await program.derive('vault',bondAddress),settlement=key(2),holders=[key(3),key(4),key(5),key(6)],coupon=await program.derive('coupon',bondAddress,0);
 const view={address:bondAddress,contextSlot:10,clock:{slot:10n,timestamp:250n},accountCount:11,couponAddresses:[coupon],missingProposalIds:[],proposals:[],
  bond:{issuer,bondMint:mint,settlementMint:settlement,vault,seriesId:2n,name:'Synthetic settlement',faceValue:1000_000000n,maturityTs:400n,totalIssued:4n,totalRedeemed:0n,state:1,bump:255,nextCouponIndex:1,principalClaimedMask:0,holderWallets:holders,couponTerms:[{recordTs:200n,paymentTs:250n,unitAmount:50_000000n}],redemptionUnits:[]},
  bondMint:{supply:4n},holders:holders.map(owner=>({address:key(7),owner,mint,amount:1n,state:2,closed:false})),vault:{address:vault,owner:bondAddress,mint:settlement,amount:4200_000000n,state:1,closed:false},coupons:[{bond:bondAddress,index:0,recordTs:200n,paymentTs:250n,unitAmount:50_000000n,capturedAt:200n,totalUnits:4n,claimedMask:0,paidTotal:0n,units:[1n,1n,1n,1n],bump:255}]} as unknown as View;
 const deps={readView:async()=>view,readAccount:async(_key:string)=>({slot:10,value:null as any}),rent:async()=>2039280};
 const request=()=>normalizeRequest({action:'settle_coupon',bondAddress,walletAddress:issuer,params:{couponId:'0',holderWallets:holders}});
 return {view,deps,request,issuer,holders};
}
test('four-beneficiary settlement pins exact recipients/amounts, separates payer rent and fits legacy wire limit',async()=>{
 const m=await model(),built=await makeCouponSettlement(m.request(),m.issuer,m.deps);
 assert.equal(built.instructions.length,8);assert.equal(built.amount,200_000000n);assert.equal(built.summary.estimatedAtaRentLamports,'8157120');assert.equal(built.summary.settlementSource,m.view.bond.vault);
 assert.equal(built.summary.beneficiarySignaturesRequired,false);for(const item of built.summary.payments){assert.equal(item.amountMinor,'50000000');assert.equal(item.destination,await program.ata(item.wallet,m.view.bond.settlementMint));}
 const payer=createNoopSigner(m.issuer);let message=setTransactionMessageFeePayerSigner(payer,createTransactionMessage({version:0}));message=setTransactionMessageLifetimeUsingBlockhash({blockhash:address('11111111111111111111111111111111') as any,lastValidBlockHeight:100n},message) as any;message=appendTransactionMessageInstructions(built.instructions,message) as any;
 const tx=compileTransaction(setTransactionMessageComputeUnitLimit(1_400_000,message) as any),wire=getTransactionEncoder().encode(tx);assert.ok(wire.length<=1232,`wire bytes ${wire.length}`);assert.deepEqual(Object.keys(getTransactionDecoder().decode(wire).signatures),[m.issuer]);
});
test('closed prefunded ATA rent topup and existing recipient account are quoted independently from settlement',async()=>{
 const m=await model();let n=0;m.deps.readAccount=async()=>({slot:10,value:++n===1?{owner:program.SYSTEM,executable:false,lamports:890880,data:['','base64']}:null});
 const built=await makeCouponSettlement(m.request(),m.issuer,m.deps);assert.equal(built.summary.estimatedAtaRentLamports,String(8157120-890880));assert.equal(built.summary.amountMinor,'200000000');
});
test('early, duplicate, zero and foreign beneficiaries cannot create a settlement transaction',async()=>{
 const fails=(promise:Promise<unknown>,code:string)=>assert.rejects(promise,(e:any)=>e instanceof AppError&&e.code===code);
 let m=await model();m.view.clock.timestamp=249n;await fails(makeCouponSettlement(m.request(),m.issuer,m.deps),'TOO_EARLY');
 m=await model();m.view.coupons[0]!.claimedMask=1;m.view.coupons[0]!.paidTotal=50_000000n;m.view.vault.amount-=50_000000n;await fails(makeCouponSettlement(m.request(),m.issuer,m.deps),'ALREADY_CLAIMED');
 m=await model();m.view.coupons[0]!.units=[0n,2n,1n,1n];await fails(makeCouponSettlement(m.request(),m.issuer,m.deps),'NO_ENTITLEMENT');
 m=await model();const request=m.request();request.params.holderWallets=[key(20)];await fails(makeCouponSettlement(request,m.issuer,m.deps),'NOT_HOLDER');
});
test('empty recipient ATA with a different owner and excessive or unavailable rent fail closed',async()=>{
 const m=await model();m.deps.readAccount=async()=>({slot:10,value:{owner:TOKEN_PROGRAM_ADDRESS,executable:false,lamports:2039280,data:[Buffer.from(getTokenEncoder().encode({mint:m.view.bond.settlementMint,owner:m.issuer,amount:0n,state:1,delegate:null,closeAuthority:null,delegatedAmount:0n,isNative:null})).toString('base64'),'base64']}});
 await assert.rejects(makeCouponSettlement(m.request(),m.issuer,m.deps),/no longer belongs/);
 const first=(m.request().params.holderWallets as string[])[0];m.deps.readAccount=async()=>({slot:10,value:{owner:TOKEN_PROGRAM_ADDRESS,executable:false,lamports:2039280,data:[Buffer.from(getTokenEncoder().encode({mint:m.view.bond.settlementMint,owner:address(first),amount:0n,state:2,delegate:null,closeAuthority:null,delegatedAmount:0n,isNative:null})).toString('base64'),'base64']}});
 await assert.rejects(makeCouponSettlement(m.request(),m.issuer,m.deps),(e:any)=>e.code==='BENEFICIARY_ACCOUNT_FROZEN');
 const costly=await model();costly.deps.rent=async()=>4_000_000;await assert.rejects(makeCouponSettlement(costly.request(),costly.issuer,costly.deps),/budget/);
 costly.deps.rent=async()=>NaN;await assert.rejects(makeCouponSettlement(costly.request(),costly.issuer,costly.deps),/quote/);
});
test('batch contract rejects user-supplied payout amounts, repeated recipients and oversized batches',async()=>{
 const m=await model(),request=m.request();
 for(const params of [{...request.params,amountMinor:'1'},{...request.params,holderWallets:[]},{...request.params,holderWallets:[...m.holders,key(20)]},{...request.params,holderWallets:[m.holders[0],m.holders[0]]},{...request.params,couponId:0}])assert.throws(()=>normalizeRequest({...request,params}));
 assert.deepEqual(normalizeRequest({...request,params:{...request.params,holderWallets:[...m.holders].reverse()}}),request);
});
