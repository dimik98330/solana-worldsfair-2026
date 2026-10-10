/** Bounded CLI orchestration only. These batch sizes are not protocol capacity claims. */
import {address, type Instruction, type TransactionSigner} from '@solana/kit';
import {getCreateAssociatedTokenIdempotentInstruction} from '@solana-program/token';
import * as p from '../packages/client/src/program.ts';

export interface InitialHolderBatch {start:number;count:number;pageIndex:number;createRegistryPage:boolean;}
export interface CouponSettlementBatch {couponIndex:number;start:number;count:number;holderIndexes:number[];}
export interface PagedDemoBatchPlan {
  version:1;initialHolderMax:3;couponSettlementMax:4;
  initialHolders:InitialHolderBatch[];coupons:CouponSettlementBatch[];
}
export interface PagedDemoTiming {firstRecordLeadSeconds:number;secondRecordGapSeconds:number;remainingRecordGapSeconds:4;maturityGapSeconds:60;}

export function makePagedDemoBatches(scale:boolean,lateCoupon:boolean):PagedDemoBatchPlan {
  const initialCount=scale?33:3,couponCount=scale?9:2;
  const initialHolders:InitialHolderBatch[]=[];
  for(let start=0;start<initialCount;) {
    const count=Math.min(3,8-start%8,initialCount-start);
    initialHolders.push({start,count,pageIndex:Math.floor(start/8),createRegistryPage:start%8===0});
    start+=count;
  }
  const coupons:CouponSettlementBatch[]=[];
  for(let couponIndex=0;couponIndex<couponCount;couponIndex++) {
    const holderCount=initialCount+(couponIndex===0?0:1);
    for(let start=couponIndex===0&&lateCoupon?1:0;start<holderCount;start+=4) {
      const count=Math.min(4,holderCount-start);
      coupons.push({couponIndex,start,count,holderIndexes:Array.from({length:count},(_,i)=>start+i)});
    }
  }
  return {version:1,initialHolderMax:3,couponSettlementMax:4,initialHolders,coupons};
}

export function pagedDemoTiming(scale:boolean):PagedDemoTiming {
  return {firstRecordLeadSeconds:scale?600:180,secondRecordGapSeconds:scale?360:180,remainingRecordGapSeconds:4,maturityGapSeconds:60};
}

export function makePagedDemoSchedule(now:bigint,scale:boolean) {
  const timing=pagedDemoTiming(scale),count=scale?9:2,first=now+BigInt(timing.firstRecordLeadSeconds);
  const records=Array.from({length:count},(_,i)=>first+(i===0?0n:BigInt(timing.secondRecordGapSeconds+(i-1)*timing.remainingRecordGapSeconds)));
  return {records,payments:records.map(record=>record+1n),maturity:records.at(-1)!+BigInt(timing.maturityGapSeconds)};
}

interface HolderAccounts {
  bond:string;bondMint:string;holderWallets:readonly string[];holderRecords:readonly string[];holdingAtas:readonly string[];
}
export function initialHolderBatchInstructions(input:HolderAccounts & {
  issuer:TransactionSigner;registryPage:string;units:readonly bigint[];group:InitialHolderBatch;
}):Instruction[] {
  const {group:g}=input;
  if(!Number.isSafeInteger(g.start)||g.start<0||!Number.isSafeInteger(g.count)||g.count<1||g.count>3
      ||Math.floor(g.start/8)!==g.pageIndex||Math.floor((g.start+g.count-1)/8)!==g.pageIndex
      ||g.createRegistryPage!==(g.start%8===0)||g.start+g.count>input.holderWallets.length)
    throw new Error('Invalid fixed initial holder batch');
  const instructions:Instruction[]=[];
  if(g.createRegistryPage)instructions.push(p.createRegistryPageV2(input.issuer.address,input.bond,input.registryPage,g.pageIndex));
  for(let i=g.start;i<g.start+g.count;i++) {
    if(!input.holderRecords[i]||!input.holdingAtas[i]||!input.units[i]||input.units[i]<=0n)throw new Error('Incomplete initial holder batch inputs');
    instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer:input.issuer,ata:address(input.holdingAtas[i]),
      owner:address(input.holderWallets[i]),mint:address(input.bondMint)}),
      p.registerHolderV2(input.issuer.address,input.bond,input.registryPage,input.holderRecords[i],input.holderWallets[i],input.holdingAtas[i],input.bondMint,i),
      p.issueUnitsV2(input.issuer.address,input.bond,input.holderRecords[i],input.bondMint,input.holdingAtas[i],input.units[i]));
  }
  return instructions;
}

export function couponSettlementBatchInstructions(input:{executor:TransactionSigner;bond:string;action:string;settlementMint:string;vault:string;
  holderWallets:readonly string[];holderRecords:readonly string[];settlementAtas:readonly string[];snapshotPages:Readonly<Record<number,string>>;group:CouponSettlementBatch;
}):Instruction[] {
  const g=input.group;
  if(!Number.isSafeInteger(g.start)||g.start<0||!Number.isSafeInteger(g.count)||g.count<1||g.count>4
      ||g.holderIndexes.length!==g.count||g.holderIndexes.some((index,i)=>index!==g.start+i)||g.start+g.count>input.holderWallets.length)
    throw new Error('Invalid fixed coupon settlement batch');
  return g.holderIndexes.flatMap(i=>{
    const snapshot=input.snapshotPages[Math.floor(i/8)];
    if(!snapshot||!input.holderRecords[i]||!input.settlementAtas[i])throw new Error('Incomplete coupon batch inputs');
    return [getCreateAssociatedTokenIdempotentInstruction({payer:input.executor,ata:address(input.settlementAtas[i]),
      owner:address(input.holderWallets[i]),mint:address(input.settlementMint)}),p.settleCouponV2({executor:input.executor.address,
      beneficiary:input.holderWallets[i],bond:input.bond,action:input.action,holderRecord:input.holderRecords[i],snapshotPage:snapshot,
      settlement:input.settlementMint,vault:input.vault,destination:input.settlementAtas[i]})];
  });
}
