import {getCreateAssociatedTokenIdempotentInstruction} from '@solana-program/token';
import {address,createNoopSigner,type Instruction} from '@solana/kit';
import * as program from '../packages/client/src/program.ts';
import {makeV2Action} from './v2.ts';
import {v2ActionNames} from './v2-contract.ts';
import {entitlement,hasClaim,uint} from '../packages/client/src/domain.ts';
import {readBond,programAccount} from './state.ts';
import {AppError,chainClock,explorer} from './rpc.ts';
import {fixture,saveFixture} from './store.ts';
import {buildTransaction,demoSigner,execute} from './transactions.ts';
import {demoEnabled,network} from './config.ts';
import {rememberPrepared} from './prepared.ts';
import {beginOperation,operationStatus,updateOperation} from './operations.ts';
export const supportedActions=new Set(['capture_coupon','claim_coupon','settle_coupon','begin_redemption','redeem_principal','create_vote','cast_vote','transfer_bonds','fund_vault',...v2ActionNames]);
import {makeCouponSettlement} from './coupon-settlement.ts';
import {adminActions,makeAdminAction} from './admin.ts';
import {applyConfirmedEffect} from './effects.ts';
import {normalizeRequest} from './request-contract.ts';
import {transactionSync} from './storage.ts';
import {updateReceipt} from './journal.ts';
import {findOperation,claimDemoOperation,assertDemoLease} from './operations.ts';
import {chainIdentity} from './chain-identity.ts';
import type {ReviewedProgram} from './prepared.ts';
import {receipt} from './journal.ts';
export type ActionRequest={action:string;bondAddress?:string;walletAddress?:string;role?:string;operationId?:string;requestId?:string;params?:Record<string,unknown>};
export async function makeAction(request:ActionRequest,wallet:string){
  request=normalizeRequest(request);
  if(v2ActionNames.has(request.action))return makeV2Action(request,wallet);
  if(!supportedActions.has(request.action)&&!adminActions.has(request.action))throw new AppError('UNKNOWN_ACTION','Unsupported corporate action');
  let actor:string;try{actor=String(address(wallet));}catch{throw new AppError('INVALID_WALLET','Invalid wallet address');}
  const selected=request.bondAddress??(typeof request.params?.bondAddress==='string'?request.params.bondAddress:undefined);
  if(request.action==='settle_coupon')return makeCouponSettlement({...request,bondAddress:selected,params:request.params??{}},actor);
  if(adminActions.has(request.action)){const built=await makeAdminAction({...request,bondAddress:selected},actor);return {...built,summary:{...built.summary,...(request.action==='initialize_issue'?{token:String(built.metadata?.settlementMint)}:{}),issueTerms:request.action==='initialize_issue'?built.metadata:undefined}};}
  const read=await readBond(selected);if(!read)throw new AppError('NO_INSTRUMENT','Create a test instrument first');
  const {bond,address:bondAddress}=read;const params=request.params??{};const instructions:Instruction[]=[];let amount:bigint|undefined;let proofAccount=bondAddress;let token=String(bond.settlementMint),recipients=[actor],tokenDecimals=6;
  if(['capture_coupon','claim_coupon'].includes(request.action)&&bond.couponTerms.length>1&&params.couponId===undefined)throw new AppError('MISSING_COUPON_ID','Select the coupon identifier explicitly for this schedule');
  const index=Number(params.couponId??0);if(!Number.isSafeInteger(index)||index<0||index>=bond.couponTerms.length)throw new AppError('INVALID_COUPON_ID','Coupon index is outside this schedule');
  const position=bond.holderWallets.indexOf(address(actor));
  const allHolders=await Promise.all(bond.holderWallets.map(key=>program.ata(key,bond.bondMint)));
  const recipient=await program.ata(actor,bond.settlementMint);const actorSigner=createNoopSigner(address(actor));
  const ensureSettlement=()=>instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer:actorSigner,ata:recipient,owner:address(actor),mint:bond.settlementMint}));
  switch(request.action){
    case 'capture_coupon':{const coupon=await program.derive('coupon',bondAddress,index);proofAccount=coupon;instructions.push(program.captureCoupon(actor,bondAddress,coupon,bond.bondMint,index,allHolders));break;}
    case 'claim_coupon':{if(position<0)throw new AppError('NOT_HOLDER','Wallet is not registered');const coupon=await program.derive('coupon',bondAddress,index),raw=await programAccount(coupon);if(!raw)throw new AppError('NO_SNAPSHOT','Capture the record date first');const data=program.decodeCoupon(raw.bytes);if(hasClaim(data.claimedMask,position))throw new AppError('ALREADY_CLAIMED','This coupon has already been paid');amount=entitlement(data.unitAmount,data.units[position]);if(!amount)throw new AppError('NO_ENTITLEMENT','This snapshot grants no coupon');ensureSettlement();instructions.push(program.claimCoupon(actor,bondAddress,coupon,bond.settlementMint,bond.vault,recipient,index));break;}
    case 'begin_redemption':{instructions.push(program.beginRedemption(actor,bondAddress,bond.bondMint,allHolders));break;}
    case 'redeem_principal':{if(position<0)throw new AppError('NOT_HOLDER','Wallet is not registered');if(bond.state<2)throw new AppError('NO_REDEMPTION','Open redemption at maturity first');if(hasClaim(bond.principalClaimedMask,position))throw new AppError('ALREADY_CLAIMED','Principal has already been paid');amount=entitlement(bond.faceValue,bond.redemptionUnits[position]);ensureSettlement();instructions.push(program.redeemPrincipal(actor,bondAddress,bond.bondMint,allHolders[position],bond.settlementMint,bond.vault,recipient));break;}
    case 'create_vote':{const id=uint(String(params.proposalId),'proposal ID');const title=String(params.title);const clock=await chainClock();const closes=bond.maturityTs;if(closes<=clock.timestamp)throw new AppError('MATURED','New votes cannot open after maturity');const proposal=await program.derive('proposal',bondAddress,id);proofAccount=proposal;instructions.push(program.createProposal(actor,bondAddress,proposal,bond.bondMint,id,title,closes,allHolders));break;}
    case 'cast_vote':{const id=uint(String(params.proposalId??1),'proposal ID'),proposal=await program.derive('proposal',bondAddress,id),ballot=await program.derive('ballot',proposal,actor);const choice=params.choice??params.support;if(!['yes','no',true,false,'true','false'].includes(choice as any))throw new AppError('INVALID_VOTE','Vote must explicitly be yes/no');instructions.push(program.castVote(actor,bondAddress,proposal,ballot,choice==='yes'||choice===true||choice==='true'));break;}
    case 'transfer_bonds':{if(position<0)throw new AppError('NOT_HOLDER','Wallet is not registered');const target=String(params.targetWallet??params.destination??'');if(!bond.holderWallets.includes(address(target)))throw new AppError('UNREGISTERED_DESTINATION','Only registered holders may receive this permissioned instrument');const units=uint(params.units,'bond units');if(!units)throw new AppError('INVALID_AMOUNT','Bond units must be greater than zero');amount=units;token=String(bond.bondMint);tokenDecimals=0;recipients=[target];const destination=await program.ata(target,bond.bondMint);instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer:actorSigner,ata:destination,owner:address(target),mint:bond.bondMint}),program.transferUnits(actor,bondAddress,bond.bondMint,allHolders[position],destination,units));break;}
    case 'fund_vault':{amount=uint(params.amountMinor,'funding amount');if(!amount)throw new AppError('INVALID_AMOUNT','Funding must be greater than zero');recipients=[String(bond.vault)];instructions.push(program.fundVault(actor,bondAddress,bond.settlementMint,recipient,bond.vault,amount));break;}
  }
  return {instructions,bondAddress,proofAccount,amount,metadata:undefined as Record<string,unknown>|undefined,summary:{network,action:request.action,signer:actor,instrumentAddress:bondAddress,...(amount!==undefined?{amountMinor:amount.toString(),token,tokenDecimals,recipients}:{})}};
}
export async function prepareAction(request:ActionRequest){request=normalizeRequest(request);if(!request.walletAddress)throw new AppError('MISSING_WALLET','The signing wallet address is required');if(!['initialize_issue','initialize_issue_v2'].includes(request.action)&&!request.bondAddress)throw new AppError('MISSING_INSTRUMENT','Select the instrument address explicitly before preparing a wallet transaction');await chainIdentity();const built=await makeAction(request,String(request.walletAddress??''));const prepared=await buildTransaction(built.instructions,built.summary.signer,[],0);const operationId=rememberPrepared(prepared.transactionBase64,{action:request.action,wallet:built.summary.signer,bond:built.bondAddress,account:built.proofAccount,lastValidBlockHeight:prepared.lastValidBlockHeight,programRelease:prepared.programRelease,params:{...request.params,bondAddress:built.bondAddress},metadata:built.metadata});return {...prepared,operationId,summary:{...built.summary,programRelease:prepared.programRelease,simulation:prepared.simulation,feeLamports:prepared.feeLamports}};}
let demoBusy=false;
export async function demoAction(request:ActionRequest,policy:{requiredProgramRelease?:ReviewedProgram}={}){
  request=normalizeRequest(request);
  if(!demoEnabled)throw new AppError('DEMO_DISABLED','Generated demo signer mode is disabled',403);
  if(demoBusy)throw new AppError('ACTION_PENDING','Wait for the current test operation',409);
  const f=fixture();if(!f?.complete)throw new AppError('DEMO_NOT_READY','Initialize the test instrument first');
  const role=String(request.role??'');if(!['issuer','investor1','investor2','investor3'].includes(role))throw new AppError('INVALID_DEMO_ROLE','Choose a generated demo role');
  const resolvedSigner=await demoSigner(role);if(resolvedSigner.address!==f.roles[role])throw new AppError('DEMO_SIGNER_MISMATCH','Generated signer does not match its recorded identity',403);
  const derived=request.action==='initialize_issue'?await program.deriveBond(resolvedSigner.address,BigInt(String(request.params?.seriesId))):request.action==='initialize_issue_v2'?await program.deriveBondV2(resolvedSigner.address,BigInt(String(request.params?.seriesId))):undefined;
  if(derived&&request.bondAddress&&request.bondAddress!==derived)throw new AppError('INSTRUMENT_MISMATCH','Creation target must match the selected issuer and series');
  const selected=derived??request.bondAddress??f.bond;request={...request,bondAddress:selected,params:{...request.params,bondAddress:selected}};const operationId=request.operationId??request.requestId??crypto.randomUUID();const claim=claimDemoOperation(operationId,request.action,role,request.params??{});if(!claim.claimed)return operationStatus(operationId);
  demoBusy=true;try{
    const signer=await demoSigner(role);if(signer.address!==f.roles[role])throw new AppError('DEMO_SIGNER_MISMATCH','Generated test signer does not match fixture',403);
    if(['transfer_bonds','transfer_units_v2'].includes(request.action)&&!Object.values(f.roles).includes(String(request.params?.targetWallet??request.params?.destination??'')))throw new AppError('EXTERNAL_DESTINATION','Demo transfers may only target this fixture',403);
    const built=await makeAction(request,signer.address);transactionSync(()=>{assertDemoLease(operationId,claim.owner!);updateOperation(operationId,{wallet:String(signer.address),bond:built.bondAddress,params:{...request.params,bondAddress:built.bondAddress},metadata:built.metadata});});const signedIxs=built.instructions.map(ix=>({...ix,accounts:ix.accounts?.map(meta=>meta.address===signer.address&&meta.role>=2?{...meta,signer}:meta)}));
    const result=await execute(signedIxs,signer,request.action,[],built.proofAccount,signature=>{assertDemoLease(operationId,claim.owner!);const recorded=receipt(signature)?.programRelease,required=policy.requiredProgramRelease;if(required&&(!recorded||recorded.sha256!==required.sha256||recorded.programId!==required.programId||recorded.genesisHash!==required.genesisHash))throw new AppError('PROGRAM_RELEASE_CHANGED','The signed child does not match its immutable execution plan; it was not relayed.',409);updateOperation(operationId,{signature,status:'pending',programRelease:recorded});},built.bondAddress,policy.requiredProgramRelease);
    updateOperation(operationId,{status:result.status,chainStatus:result.status,projectionStatus:'pending'});
    if(result.status==='confirmed'){await applyConfirmedEffect({action:request.action,signature:result.signature,wallet:String(signer.address),bond:built.bondAddress,params:request.params,metadata:built.metadata});transactionSync(()=>{updateReceipt(result.signature,{projectionStatus:'complete'});updateOperation(operationId,{status:'confirmed',chainStatus:'confirmed',projectionStatus:'complete'});});}return {...result,operationId,instrumentAddress:built.bondAddress};
  }catch(error){let retained:ReturnType<typeof findOperation>=null;try{retained=findOperation(operationId);}catch{}if(retained?.lease?.owner!==claim.owner)throw new AppError('UNKNOWN_STATUS','A replacement process owns this operation. Recover the same identifier.',503);if(!retained.signature&&error instanceof AppError&&error.code==='OPERATION_LEASE_CHANGED'){throw new AppError('UNKNOWN_STATUS','Preparation expired before relay. Explicitly resume this same operation identifier.',503);}if(retained.signature&&error instanceof AppError&&(error.definitive||error.code==='TRANSACTION_FAILED')){updateOperation(operationId,{status:'error',chainStatus:'error',projectionStatus:'complete',error:error.message});throw error;}if(retained?.signature||!(error instanceof AppError)){try{if(retained?.projectionStatus!=='complete')updateOperation(operationId,{status:'unknown',projectionStatus:'pending',error:error instanceof AppError?error.message:'Local reconciliation needs recovery'});}catch{}throw new AppError('UNKNOWN_STATUS','The signed operation may already be on chain. Recover its retained identifier before another signature.',503);}updateOperation(operationId,{status:'error',error:error.message});throw error;}finally{demoBusy=false;}
}
