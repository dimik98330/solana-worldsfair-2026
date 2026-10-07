import {getCreateAssociatedTokenIdempotentInstruction} from '@solana-program/token';
import {address,createNoopSigner,type Instruction} from '@solana/kit';
import * as program from '../packages/client/src/program.ts';
import {entitlement,hasClaim,uint} from '../packages/client/src/domain.ts';
import {readBond,programAccount} from './state.ts';
import {AppError,chainClock,explorer} from './rpc.ts';
import {fixture,saveFixture} from './store.ts';
import {buildTransaction,demoSigner,execute} from './transactions.ts';
import {demoEnabled,network} from './config.ts';
import {rememberPrepared} from './prepared.ts';
import {beginOperation,operationStatus,updateOperation} from './operations.ts';
export const supportedActions=new Set(['capture_coupon','claim_coupon','begin_redemption','redeem_principal','create_vote','cast_vote','transfer_bonds','fund_vault']);
export type ActionRequest={action:string;walletAddress?:string;role?:string;operationId?:string;requestId?:string;params?:Record<string,unknown>};
export async function makeAction(request:ActionRequest,wallet:string){
  if(!supportedActions.has(request.action))throw new AppError('UNKNOWN_ACTION','Unsupported corporate action');
  let actor:string;try{actor=String(address(wallet));}catch{throw new AppError('INVALID_WALLET','Invalid wallet address');}
  const read=await readBond();if(!read)throw new AppError('NO_INSTRUMENT','Create a test instrument first');
  const {bond,address:bondAddress}=read;const params=request.params??{};const instructions:Instruction[]=[];let amount:bigint|undefined;let proofAccount=bondAddress;let token=String(bond.settlementMint),recipients=[actor],tokenDecimals=6;
  const index=Number(params.couponId??params.index??0);if(!Number.isSafeInteger(index)||index<0||index>=bond.couponTerms.length)throw new AppError('INVALID_COUPON_ID','Coupon index is outside this schedule');
  const position=bond.holderWallets.indexOf(address(actor));
  const allHolders=await Promise.all(bond.holderWallets.map(key=>program.ata(key,bond.bondMint)));
  const recipient=await program.ata(actor,bond.settlementMint);const actorSigner=createNoopSigner(address(actor));
  const ensureSettlement=()=>instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer:actorSigner,ata:recipient,owner:address(actor),mint:bond.settlementMint}));
  switch(request.action){
    case 'capture_coupon':{const coupon=await program.derive('coupon',bondAddress,index);proofAccount=coupon;instructions.push(program.captureCoupon(actor,bondAddress,coupon,bond.bondMint,index,allHolders));break;}
    case 'claim_coupon':{if(position<0)throw new AppError('NOT_HOLDER','Wallet is not registered');const coupon=await program.derive('coupon',bondAddress,index),raw=await programAccount(coupon);if(!raw)throw new AppError('NO_SNAPSHOT','Capture the record date first');const data=program.decodeCoupon(raw.bytes);if(hasClaim(data.claimedMask,position))throw new AppError('ALREADY_CLAIMED','This coupon has already been paid');amount=entitlement(data.unitAmount,data.units[position]);if(!amount)throw new AppError('NO_ENTITLEMENT','This snapshot grants no coupon');ensureSettlement();instructions.push(program.claimCoupon(actor,bondAddress,coupon,bond.settlementMint,bond.vault,recipient,index));break;}
    case 'begin_redemption':{instructions.push(program.beginRedemption(actor,bondAddress,bond.bondMint,allHolders));break;}
    case 'redeem_principal':{if(position<0)throw new AppError('NOT_HOLDER','Wallet is not registered');if(bond.state<2)throw new AppError('NO_REDEMPTION','Open redemption at maturity first');if(hasClaim(bond.principalClaimedMask,position))throw new AppError('ALREADY_CLAIMED','Principal has already been paid');amount=entitlement(bond.faceValue,bond.redemptionUnits[position]);ensureSettlement();instructions.push(program.redeemPrincipal(actor,bondAddress,bond.bondMint,allHolders[position],bond.settlementMint,bond.vault,recipient));break;}
    case 'create_vote':{const id=uint(String(params.proposalId??1),'proposal ID');const title=typeof params.title==='string'?params.title:'Approve the next test series';const clock=await chainClock();const closes=bond.maturityTs;if(closes<=clock.timestamp)throw new AppError('MATURED','New votes cannot open after maturity');const proposal=await program.derive('proposal',bondAddress,id);proofAccount=proposal;instructions.push(program.createProposal(actor,bondAddress,proposal,bond.bondMint,id,title,closes,allHolders));break;}
    case 'cast_vote':{const id=uint(String(params.proposalId??1),'proposal ID'),proposal=await program.derive('proposal',bondAddress,id),ballot=await program.derive('ballot',proposal,actor);const choice=params.choice??params.support;if(!['yes','no',true,false,'true','false'].includes(choice as any))throw new AppError('INVALID_VOTE','Vote must explicitly be yes/no');instructions.push(program.castVote(actor,bondAddress,proposal,ballot,choice==='yes'||choice===true||choice==='true'));break;}
    case 'transfer_bonds':{if(position<0)throw new AppError('NOT_HOLDER','Wallet is not registered');const target=String(params.targetWallet??params.destination??'');if(!bond.holderWallets.includes(address(target)))throw new AppError('UNREGISTERED_DESTINATION','Only registered holders may receive this permissioned instrument');const units=uint(params.units,'bond units');if(!units)throw new AppError('INVALID_AMOUNT','Bond units must be greater than zero');amount=units;token=String(bond.bondMint);tokenDecimals=0;recipients=[target];const destination=await program.ata(target,bond.bondMint);instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer:actorSigner,ata:destination,owner:address(target),mint:bond.bondMint}),program.transferUnits(actor,bondAddress,bond.bondMint,allHolders[position],destination,units));break;}
    case 'fund_vault':{amount=uint(params.amountMinor??'1000000','funding amount');if(!amount)throw new AppError('INVALID_AMOUNT','Funding must be greater than zero');recipients=[String(bond.vault)];instructions.push(program.fundVault(actor,bondAddress,bond.settlementMint,recipient,bond.vault,amount));break;}
  }
  return {instructions,bondAddress,proofAccount,amount,summary:{network,action:request.action,signer:actor,...(amount!==undefined?{amountMinor:amount.toString(),token,tokenDecimals,recipients}:{})}};
}
export async function prepareAction(request:ActionRequest){const built=await makeAction(request,String(request.walletAddress??''));const prepared=await buildTransaction(built.instructions,built.summary.signer,[],0);const operationId=rememberPrepared(prepared.transactionBase64,{action:request.action,wallet:built.summary.signer,bond:built.bondAddress,account:built.proofAccount,lastValidBlockHeight:prepared.lastValidBlockHeight,params:request.params});return {...prepared,operationId,summary:{...built.summary,simulation:prepared.simulation,feeLamports:prepared.feeLamports}};}
let demoBusy=false;
export async function demoAction(request:ActionRequest){
  if(!demoEnabled)throw new AppError('DEMO_DISABLED','Generated demo signer mode is disabled',403);
  if(demoBusy)throw new AppError('ACTION_PENDING','Wait for the current test operation',409);
  const f=fixture();if(!f?.complete)throw new AppError('DEMO_NOT_READY','Initialize the test instrument first');
  const role=String(request.role??'');if(!['issuer','investor1','investor2','investor3'].includes(role))throw new AppError('INVALID_DEMO_ROLE','Choose a generated demo role');
  const operationId=request.operationId??request.requestId??crypto.randomUUID();const existing=beginOperation(operationId,request.action,role,request.params??{});if(!existing.new)return operationStatus(operationId);
  demoBusy=true;try{
    const signer=await demoSigner(role);if(signer.address!==f.roles[role])throw new AppError('DEMO_SIGNER_MISMATCH','Generated test signer does not match fixture',403);
    if(request.action==='transfer_bonds'&&!Object.values(f.roles).includes(String(request.params?.targetWallet??request.params?.destination??'')))throw new AppError('EXTERNAL_DESTINATION','Demo transfers may only target this fixture',403);
    const built=await makeAction(request,signer.address),signedIxs=built.instructions.map(ix=>({...ix,accounts:ix.accounts?.map(meta=>meta.address===signer.address&&meta.role>=2?{...meta,signer}:meta)}));
    const result=await execute(signedIxs,signer,request.action,[],built.proofAccount,signature=>updateOperation(operationId,{signature,status:'pending'}));
    updateOperation(operationId,{status:result.status});
    if(request.action==='create_vote'&&result.status==='confirmed'){const latest=fixture()!;const id=String(request.params?.proposalId??1);if(!latest.proposalIds.includes(id))latest.proposalIds.push(id);saveFixture(latest);}
    return {...result,operationId};
  }catch(error){updateOperation(operationId,{status:error instanceof AppError&&error.code==='UNKNOWN_STATUS'?'pending':'error',error:error instanceof Error?error.message:'Operation failed'});throw error;}finally{demoBusy=false;}
}
