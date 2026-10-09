import {address,createNoopSigner,type Instruction} from '@solana/kit';
import {getCreateAssociatedTokenIdempotentInstruction} from '@solana-program/token';
import * as program from '../packages/client/src/program.ts';
import {entitlement,hasClaim} from '../packages/client/src/domain.ts';
import {readChainView,decodeTokenBalance,type ChainView} from './chain-view.ts';
import {reconcile} from './reconciliation.ts';
import {account,AppError,rpc} from './rpc.ts';
import {normalizeRequest,type ContractRequest} from './request-contract.ts';
import {network} from './config.ts';

type Dependencies={readView:(key:string)=>Promise<ChainView>;readAccount:typeof account;rent:()=>Promise<number>};
const defaults:Dependencies={readView:readChainView,readAccount:account,rent:()=>rpc<number>('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}])};
export async function makeCouponSettlement(input:ContractRequest,wallet:string,deps:Dependencies=defaults){
  const request=normalizeRequest(input),actor=address(wallet),bondAddress=request.bondAddress;
  if(request.action!=='settle_coupon'||!bondAddress)throw new AppError('MISSING_INSTRUMENT','Select an instrument for coupon settlement');
  const view=await deps.readView(bondAddress);reconcile(view);
  const index=Number(request.params.couponId),snapshot=view.coupons[index];
  if(!snapshot)throw new AppError('NO_SNAPSHOT','Capture this coupon record date before settlement');
  if(view.clock.timestamp<snapshot.paymentTs)throw new AppError('TOO_EARLY','The coupon payment date has not arrived');
  const holders=request.params.holderWallets as string[],instructions:Instruction[]=[],payments:{wallet:string;destination:string;units:string;amountMinor:string}[]=[];
  const payer=createNoopSigner(actor),rent=await deps.rent();
  if(!Number.isSafeInteger(rent)||rent<1)throw new AppError('RENT_UNAVAILABLE','The RPC could not quote token-account rent',503,true);
  let amount=0n,ataRent=0n;
  for(const holder of holders){
    const position=view.bond.holderWallets.indexOf(address(holder));
    if(position<0)throw new AppError('NOT_HOLDER','Every beneficiary must belong to the sealed registry');
    if(hasClaim(snapshot.claimedMask,position))throw new AppError('ALREADY_CLAIMED','A selected beneficiary has already received this coupon; review the remaining rights');
    const units=snapshot.units[position],payment=entitlement(snapshot.unitAmount,units);
    if(!payment)throw new AppError('NO_ENTITLEMENT','A selected beneficiary has no right in this coupon snapshot');
    const destination=await program.ata(holder,view.bond.settlementMint),existing=await deps.readAccount(destination);
    const balance=decodeTokenBalance(existing.value,destination,view.bond.settlementMint,holder,true,false);
    if(!balance.closed&&balance.owner!==holder)throw new AppError('WRONG_TOKEN_AUTHORITY','The beneficiary ATA no longer belongs to that beneficiary');
    if(!balance.closed&&balance.state===2)throw new AppError('BENEFICIARY_ACCOUNT_FROZEN',`Settlement account for ${holder} is frozen; no batch was submitted.`);
    if(balance.closed){const prefunded=existing.value?.lamports??0;if(!Number.isSafeInteger(prefunded)||prefunded<0)throw new AppError('RPC_INVALID','Beneficiary account lamports are invalid',503);ataRent+=BigInt(Math.max(0,rent-prefunded));}
    instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer,ata:destination,owner:address(holder),mint:view.bond.settlementMint}),program.settleCoupon(actor,holder,bondAddress,view.couponAddresses[index],view.bond.settlementMint,view.bond.vault,destination,index));
    payments.push({wallet:holder,destination,units:units.toString(),amountMinor:payment.toString()});amount+=payment;
  }
  if(ataRent>12_000_000n)throw new AppError('SETTLEMENT_RENT_LIMIT','The batch exceeds the test-SOL account-creation budget; no transaction was prepared',409);
  return {instructions,bondAddress,proofAccount:view.couponAddresses[index],amount,metadata:undefined as Record<string,unknown>|undefined,
    summary:{network,action:'settle_coupon',signer:String(actor),feePayer:String(actor),instrumentAddress:bondAddress,amountMinor:amount.toString(),token:String(view.bond.settlementMint),tokenDecimals:6,recipients:holders,payments,settlementSource:String(view.bond.vault),couponId:String(index),entitlementContextSlot:String(view.contextSlot),estimatedAtaRentLamports:ataRent.toString(),ataRentBasis:'current-account-state-estimate-separate-from-transaction-fee',beneficiarySignaturesRequired:false}};
}
