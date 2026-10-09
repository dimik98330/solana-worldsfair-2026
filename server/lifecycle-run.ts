import {createHash} from 'node:crypto';
import {address} from '@solana/kit';
import {PROGRAM_ID} from '../packages/client/src/program.ts';
import {hasClaim} from '../packages/client/src/domain.ts';
import {AppError} from './rpc.ts';
import {readChainView,type ChainView} from './chain-view.ts';
import {reconcile} from './reconciliation.ts';
import {chainIdentity} from './chain-identity.ts';
import {assertVerifiedProgram,type ProgramIdentity} from './program-identity.ts';
import {fixture,type Fixture} from './store.ts';
import {network,demoEnabled} from './config.ts';
import {beginOperation,findOperation,updateOperation,operationStatus,type Operation} from './operations.ts';
import {journalValues,receipt,retainedReceiptFinality,type FinalityObservation} from './journal.ts';
import {transactionSync} from './storage.ts';
import {canonicalJson,normalizeRequest} from './request-contract.ts';
import {runCouponSettlement,couponRunStatus,type CouponRunRequest,type CouponRunResult} from './coupon-run.ts';
import type {ActionRequest} from './actions.ts';
import type {ReviewedProgram} from './prepared.ts';

export type LifecycleMode='review-only'|'explicit-localnet-generated-issuer';
export interface LifecycleRunRequest {operationId:string;bondAddress:string;mode:LifecycleMode;maxTransactions:number;}
export type LifecycleRunState='ready'|'waiting_date'|'running'|'pending'|'unknown'|'blocked'|'error'|'awaiting_holder_signature'|'financially_closed';
type RunError={code:string;message:string};
export interface LifecycleInstrument {
 bondAddress:string;issuer:string;seriesId:string;bondMint:string;settlementMint:string;vault:string;
 registry:string[];faceValue:string;maturityTs:string;issuedUnits:string;
 couponTerms:{recordTs:string;paymentTs:string;unitAmount:string}[];
 financialTerms:{version:number;nominal:string;rateBps:number;couponFrequency:number;unitAmount:string}|null;
}
export interface LifecycleStage {operationId:string;kind:'capture_coupon'|'coupon_run'|'begin_redemption';couponId?:string;params:Record<string,unknown>;}
interface PlanCore {schemaVersion:1;operationId:string;mode:LifecycleMode;genesisHash:string;programId:string;releaseSha256:string;releaseProgramLen:number;instrument:LifecycleInstrument;plannedAt:string;contextSlot:number;}
export interface LifecycleRunPlan extends PlanCore {digest:string;stages:LifecycleStage[];}
export interface LifecycleStageObservation {
 operationId:string;kind:LifecycleStage['kind'];couponId?:string;status:string;signature:string|null;
 signatures:string[];projectionStatus:string;externallySatisfied:boolean;
}
export interface LifecycleRunResult {
 operationId:string;action:'lifecycle_run';status:LifecycleRunState;signature:null;plan:LifecycleRunPlan;
 stages:LifecycleStageObservation[];contextSlot:number|null;chainTimestamp:string|null;
 readyActionRequest:ActionRequest|null;barriers:{kind:string;message:string;dueTs?:string;wallet?:string;amountMinor?:string;request?:ActionRequest}[];
 financialClosure:{closed:boolean;remainingObligationsMinor:string|null;principalRemainingMinor:string|null;mintSupplyUnits:string|null;issuedUnits:string;redeemedUnits:string|null;surplusMinor:string|null};
 finality:{status:'pending'|'unknown'|'finalized';finalityPending:boolean;observations:FinalityObservation[];unlinkedExternalEvents:string[]};
 error:RunError|null;resume:{requiresExplicitRequest:true;canResume:boolean};scope:LifecycleMode;
}
export interface LifecycleRunDependencies {
 readView:(bond:string)=>Promise<ChainView>;readGenesis:()=>Promise<string>;verifyProgram:()=>Promise<ProgramIdentity>;
 demoAction:(request:ActionRequest,policy:{requiredProgramRelease:ReviewedProgram})=>Promise<unknown>;
 operationStatus:(id:string)=>Promise<{status:string;signature?:string|null;projectionStatus?:string;finality?:FinalityObservation}>;
 runCouponSettlement:(request:CouponRunRequest)=>Promise<CouponRunResult>;couponRunStatus:(id:string)=>Promise<CouponRunResult>;
 fixture:()=>Fixture|null;network:string;demoEnabled:boolean;now?:()=>number;
}
const hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
function fail(code:string,message:string,status=409):never{throw new AppError(code,message,status);}
const locked=(status:string)=>status==='blocked'||status==='error';
function request(raw:LifecycleRunRequest):LifecycleRunRequest{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['operationId','bondAddress','mode','maxTransactions'].includes(k)))fail('INVALID_REQUEST','Lifecycle request accepts operationId, bondAddress, mode and maxTransactions only',400);
 if(typeof raw.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(raw.operationId))fail('INVALID_OPERATION_ID','Retain a valid lifecycle recovery identifier',400);
 if(!['review-only','explicit-localnet-generated-issuer'].includes(raw.mode))fail('INVALID_EXECUTION_MODE','Select review-only or explicit localnet generated-issuer mode',400);
 if(!Number.isInteger(raw.maxTransactions)||raw.maxTransactions<1||raw.maxTransactions>4)fail('INVALID_TRANSACTION_LIMIT','maxTransactions must be an integer from 1 to 4',400);
 let bondAddress:string;try{bondAddress=String(address(raw.bondAddress));}catch{return fail('INVALID_ADDRESS','Select a complete instrument address',400);}
 return {...raw,bondAddress};
}
function instrument(view:ChainView):LifecycleInstrument{
 reconcile(view);
 if(view.bond.state===0)fail('ISSUE_NOT_SEALED','Seal the instrument and registry before creating a lifecycle manifest',400);
 const b=view.bond,t=view.financialTerms;
 return {bondAddress:view.address,issuer:String(b.issuer),seriesId:b.seriesId.toString(),bondMint:String(b.bondMint),settlementMint:String(b.settlementMint),vault:String(b.vault),
 registry:b.holderWallets.map(String),faceValue:b.faceValue.toString(),maturityTs:b.maturityTs.toString(),issuedUnits:b.totalIssued.toString(),
 couponTerms:b.couponTerms.map(c=>({recordTs:c.recordTs.toString(),paymentTs:c.paymentTs.toString(),unitAmount:c.unitAmount.toString()})),
 financialTerms:t?{version:t.version,nominal:t.nominal.toString(),rateBps:t.rateBps,couponFrequency:t.couponFrequency,unitAmount:t.unitAmount.toString()}:null};
}
function stages(core:PlanCore,digest:string):LifecycleStage[]{
 const result:LifecycleStage[]=[];
 for(let i=0;i<core.instrument.couponTerms.length;i++)for(const kind of ['capture_coupon','coupon_run'] as const){const couponId=String(i);
  const params=kind==='coupon_run'?{couponId}:normalizeRequest({action:kind,bondAddress:core.instrument.bondAddress,params:{couponId}}).params;
  result.push({operationId:'life_'+hash({parent:core.operationId,digest,kind,couponId}),kind,couponId,params});
 }
 result.push({operationId:'life_'+hash({parent:core.operationId,digest,kind:'begin_redemption'}),kind:'begin_redemption',params:normalizeRequest({action:'begin_redemption',bondAddress:core.instrument.bondAddress,params:{}}).params});return result;
}
function binding(plan:LifecycleRunPlan){return {bondAddress:plan.instrument.bondAddress,mode:plan.mode};}
function load(id:string):{operation:Operation;plan:LifecycleRunPlan}{
 const operation=findOperation(id);if(!operation||operation.action!=='lifecycle_run')fail('OPERATION_NOT_FOUND','No lifecycle run exists for this identifier',404);
 const plan=operation.metadata?.plan as LifecycleRunPlan|undefined;
 if(operation.metadata?.lifecycleRunVersion!==1||!plan||plan.schemaVersion!==1||plan.operationId!==id||!Array.isArray(plan.stages)||plan.stages.length>17)fail('RECOVERY_METADATA_MISSING','Retain this run: its immutable lifecycle manifest is unavailable',503);
 const {digest,stages:fixed,...core}=plan;
 if(hash(core)!==digest||canonicalJson(stages(core,digest))!==canonicalJson(fixed)||canonicalJson(operation.params)!==canonicalJson(binding(plan)))fail('PLAN_STATE_CHANGED','The saved lifecycle manifest or child identifiers changed');
 return {operation,plan};
}
function stageChild(plan:LifecycleRunPlan,stage:LifecycleStage){
 const c=findOperation(stage.operationId);if(!c)return null;
 const expected=stage.kind==='coupon_run'?{bondAddress:plan.instrument.bondAddress,couponId:stage.couponId}:stage.params;
 if(c.action!==stage.kind||c.role!=='issuer'||canonicalJson(c.params)!==canonicalJson(expected)||(c.bond!==undefined&&c.bond!==plan.instrument.bondAddress)||(c.wallet!==undefined&&c.wallet!==plan.instrument.issuer))fail('OPERATION_CONFLICT','A lifecycle child identifier is bound to different inputs');
 if(c.signature){const release=receipt(c.signature)?.programRelease??c.programRelease;if(!release||release.programId!==plan.programId||release.sha256!==plan.releaseSha256||release.genesisHash!==plan.genesisHash)fail('PLAN_RELEASE_MISMATCH','A signed lifecycle child belongs to another release');}
 if(stage.kind==='coupon_run'){
  const p=c.metadata?.plan as CouponRunResult['plan']|undefined;
  if(!p||p.programId!==plan.programId||p.genesisHash!==plan.genesisHash||p.releaseSha256!==plan.releaseSha256||p.releaseProgramLen!==plan.releaseProgramLen)fail('PLAN_RELEASE_MISMATCH','A coupon run is bound to another lifecycle release');
 }
 return c;
}
function completed(view:ChainView,stage:LifecycleStage){
 if(stage.kind==='begin_redemption')return view.bond.state>=2;
 const snapshot=view.coupons[Number(stage.couponId)];
 return stage.kind==='capture_coupon'?Boolean(snapshot):Boolean(snapshot&&snapshot.units.every((u,i)=>u===0n||hasClaim(snapshot.claimedMask,i)));
}
export function createLifecycleRunCoordinator(deps:LifecycleRunDependencies){
 const now=deps.now??Date.now;
 function generatedIssuer(){
  if(deps.network!=='localnet'||!deps.demoEnabled)fail('LIFECYCLE_EXECUTION_DISABLED','Generated lifecycle execution is restricted to explicit localnet test mode',403);
  const f=deps.fixture();if(!f?.complete||!f.roles.issuer)fail('DEMO_NOT_READY','Initialize the generated local issuer first',403);
  try{return String(address(f.roles.issuer));}catch{return fail('DEMO_SIGNER_MISMATCH','The generated issuer identity is invalid',403);}
 }
 async function verify(plan?:LifecycleRunPlan){
  const identity=await deps.verifyProgram();
  if(!identity.signingAllowed||!identity.expected||!identity.genesisHash||identity.programId!==PROGRAM_ID)fail('PROGRAM_IDENTITY_UNAVAILABLE','A verified expected release is required for this lifecycle',503);
  if(plan&&(identity.genesisHash!==plan.genesisHash||identity.programId!==plan.programId||identity.expected.sha256!==plan.releaseSha256||identity.expected.programLen!==plan.releaseProgramLen))fail('PROGRAM_RELEASE_CHANGED','The lifecycle is bound to another verified release');
  return identity;
 }
 async function planLifecycleRun(raw:LifecycleRunRequest):Promise<LifecycleRunResult>{
  const input=request(raw);
  if(input.mode==='explicit-localnet-generated-issuer')generatedIssuer();
  const existing=findOperation(input.operationId);
  if(existing){transactionSync(()=>{beginOperation(input.operationId,'lifecycle_run','issuer',{bondAddress:input.bondAddress,mode:input.mode});load(input.operationId);});return lifecycleRunStatus(input.operationId);}
  const identity=await verify(),view=await deps.readView(input.bondAddress),fixed=instrument(view);
  if(fixed.bondAddress!==input.bondAddress)fail('INVALID_INSTRUMENT','The coherent view does not match the selected instrument');
  if(input.mode==='explicit-localnet-generated-issuer'&&generatedIssuer()!==fixed.issuer)fail('UNAUTHORIZED_ISSUER','The generated fixture issuer must own this selected instrument',403);
  if(await deps.readGenesis()!==identity.genesisHash)fail('CHAIN_IDENTITY_CHANGED','The ledger changed while planning this lifecycle');
  const core:PlanCore={schemaVersion:1,operationId:input.operationId,mode:input.mode,genesisHash:identity.genesisHash!,programId:identity.programId,releaseSha256:identity.expected!.sha256,releaseProgramLen:identity.expected!.programLen,instrument:fixed,contextSlot:view.contextSlot,plannedAt:new Date(now()).toISOString()};
  const digest=hash(core),plan:LifecycleRunPlan={...core,digest,stages:stages(core,digest)};
  transactionSync(()=>{
   if(findOperation(input.operationId)){beginOperation(input.operationId,'lifecycle_run','issuer',binding(plan));return;}
   if(input.mode==='explicit-localnet-generated-issuer')for(const other of journalValues<Operation>('operations'))if(other.action==='lifecycle_run'&&other.params?.bondAddress===input.bondAddress&&other.params?.mode===input.mode&&other.status!=='financially_closed')fail('LIFECYCLE_RUN_ACTIVE','Resume the existing lifecycle identifier before creating another execution manifest');
   beginOperation(input.operationId,'lifecycle_run','issuer',binding(plan));updateOperation(input.operationId,{status:'ready',wallet:fixed.issuer,bond:fixed.bondAddress,metadata:{lifecycleRunVersion:1,plan,dispatches:{},observations:[]}});
  });
  return lifecycleRunStatus(input.operationId);
 }
 function save(plan:LifecycleRunPlan,state:Omit<LifecycleRunResult,'operationId'|'action'|'signature'|'plan'|'scope'|'resume'>){
  return transactionSync(()=>{
   const latest=load(plan.operationId);if(latest.plan.digest!==plan.digest)fail('PLAN_STATE_CHANGED','The lifecycle manifest changed while recording observations');
   if(locked(latest.operation.status)&&!locked(state.status)){state.status=latest.operation.status as LifecycleRunState;state.error=(latest.operation.metadata?.runError as RunError)??state.error;}
   updateOperation(plan.operationId,{status:state.status,error:state.error?.message,metadata:{...latest.operation.metadata,observations:state.stages,runError:state.error,progressContextSlot:state.contextSlot}});
   return {...state,operationId:plan.operationId,action:'lifecycle_run' as const,signature:null,plan,scope:plan.mode,resume:{requiresExplicitRequest:true as const,canResume:!locked(state.status)&&state.status!=='financially_closed'}};
  });
 }
 async function lifecycleRunStatus(id:string):Promise<LifecycleRunResult>{
  const {plan}=load(id),observations:LifecycleStageObservation[]=[];
  let view:ChainView|undefined;
  const base=()=>({stages:observations,contextSlot:view?.contextSlot??null,chainTimestamp:view?.clock.timestamp.toString()??null,readyActionRequest:null,barriers:[],
   financialClosure:{closed:false,remainingObligationsMinor:null,principalRemainingMinor:null,mintSupplyUnits:null,issuedUnits:plan.instrument.issuedUnits,redeemedUnits:null,surplusMinor:null},
   finality:{status:'unknown' as const,finalityPending:true,observations:[] as FinalityObservation[],unlinkedExternalEvents:[] as string[]}});
  try{
   const linked:FinalityObservation[]=[];let unresolved:LifecycleStageObservation|undefined;
   for(const stage of plan.stages){
    const c=stageChild(plan,stage);let observation:LifecycleStageObservation={...stage,status:'not_submitted',signature:null,signatures:[],projectionStatus:'not_applicable',externallySatisfied:false};
    if(c?.signature){
     try{const fresh=await deps.operationStatus(c.id);if(fresh.signature!==c.signature)fail('OPERATION_CONFLICT','Lifecycle child recovery returned another signature');observation={...observation,status:fresh.status,signature:c.signature,signatures:[c.signature],projectionStatus:fresh.projectionStatus??'pending'};
      if(fresh.finality&&(!transactionFinality(fresh.finality)||fresh.finality.signature!==c.signature||fresh.finality.genesisHash!==plan.genesisHash))fail('CHILD_FINALITY_INVALID','The recovered finality observation is not bound to this transaction and ledger');
      const recorded=receipt(c.signature);linked.push(fresh.finality??(recorded?retainedReceiptFinality(recorded):{schemaVersion:1,signature:c.signature,status:null,source:'legacy-unknown',slot:null,contextSlot:null,observedAt:null,genesisHash:plan.genesisHash}));
     }catch{observation={...observation,status:'unknown',signature:c.signature,signatures:[c.signature],projectionStatus:'pending'};}
    }else if(c&&stage.kind==='coupon_run'){
     const run=await deps.couponRunStatus(c.id);observation={...observation,status:run.status,signatures:run.groups.flatMap(g=>g.signature?[g.signature]:[]),projectionStatus:run.status==='completed'?'complete':'pending'};
     for(const signature of observation.signatures){const record=receipt(signature);linked.push(record?retainedReceiptFinality(record):{schemaVersion:1,signature,status:null,source:'legacy-unknown',slot:null,contextSlot:null,observedAt:null,genesisHash:plan.genesisHash});}
    }else if(c)observation.status=c.status==='error'?'error':c.lease&&c.lease.expiresAt>now()?'preparing':'not_submitted';
    observations.push(observation);
    if(observation.signature&&!(['confirmed','error'].includes(observation.status)&&observation.projectionStatus==='complete')||observation.kind==='coupon_run'&&['unknown','pending','running'].includes(observation.status)||observation.status==='preparing')unresolved??=observation;
   }
   if(unresolved)return save(plan,{...base(),status:unresolved.status==='unknown'?'unknown':'pending',error:{code:'CHILD_RECOVERY_REQUIRED',message:'Recover the retained child before any further signature.'}});
   if(observations.some(o=>o.status==='error'||o.status==='blocked'))return save(plan,{...base(),status:'error',error:{code:'CHILD_FAILED',message:'A lifecycle child failed or was blocked. Preserve its fixed recovery identifier.'}});
   if(await deps.readGenesis()!==plan.genesisHash)fail('CHAIN_IDENTITY_CHANGED','This lifecycle belongs to another test ledger');
   await verify(plan);view=await deps.readView(plan.instrument.bondAddress);
   if(canonicalJson(instrument(view))!==canonicalJson(plan.instrument))fail('PLAN_STATE_CHANGED','The sealed registry or immutable lifecycle terms changed');
   if(await deps.readGenesis()!==plan.genesisHash)fail('CHAIN_IDENTITY_CHANGED','The ledger changed during lifecycle reconciliation');
   const financial=reconcile(view),external:string[]=[];
   for(let i=0;i<plan.stages.length;i++){
    const stage=plan.stages[i],o=observations[i],done=completed(view,stage),linkedComplete=o.signature?o.status==='confirmed'&&o.projectionStatus==='complete':stage.kind==='coupon_run'&&o.status==='completed';
    if(linkedComplete&&!done)return save(plan,{...base(),status:'unknown',error:{code:'CHAIN_EFFECT_PENDING',message:'A confirmed child effect is absent from the coherent view; recover the same lifecycle.'}});
    if(done&&!linkedComplete){o.status='satisfied_external';o.externallySatisfied=true;o.projectionStatus='not_applicable';external.push(stage.operationId);}
   }
   const closed=financial.totals.remainingObligations.baseUnits==='0'&&financial.principal.remaining.baseUnits==='0'&&view.bondMint.supply===0n&&view.bond.totalRedeemed===view.bond.totalIssued&&view.coupons.every(Boolean);
   if(view.bond.totalRedeemed>0n)external.push('holder-principal-signatures-not-linked-to-parent');
   const finalityStatus=closed&&external.length===0&&linked.length>0&&linked.every(o=>o.status==='finalized')?'finalized':external.length?'unknown':'pending';
   const common={...base(),financialClosure:{closed,remainingObligationsMinor:financial.totals.remainingObligations.baseUnits,principalRemainingMinor:financial.principal.remaining.baseUnits,mintSupplyUnits:view.bondMint.supply.toString(),issuedUnits:plan.instrument.issuedUnits,redeemedUnits:view.bond.totalRedeemed.toString(),surplusMinor:financial.totals.surplus.baseUnits},finality:{status:finalityStatus as 'pending'|'unknown'|'finalized',finalityPending:finalityStatus!=='finalized',observations:linked,unlinkedExternalEvents:external}};
   if(closed)return save(plan,{...common,status:'financially_closed',error:null});
   const candidates=plan.stages.filter((stage,i)=>!completed(view!,stage)&&!observations[i].signature&&observations[i].status!=='completed');
   let dueTs:string|undefined,next:LifecycleStage|undefined;
   for(const stage of candidates){
    const term=stage.couponId!==undefined?plan.instrument.couponTerms[Number(stage.couponId)]:null;
    if(stage.kind==='capture_coupon'){if(Number(stage.couponId)!==view.bond.nextCouponIndex)continue;if(view.clock.timestamp>=BigInt(term!.recordTs)){next=stage;break;}dueTs??=term!.recordTs;}
    if(stage.kind==='coupon_run'&&view.coupons[Number(stage.couponId)]){if(view.clock.timestamp>=BigInt(term!.paymentTs)){next=stage;break;}dueTs??=term!.paymentTs;}
    if(stage.kind==='begin_redemption'&&view.bond.nextCouponIndex===view.bond.couponTerms.length){if(view.clock.timestamp>=view.bond.maturityTs){next=stage;break;}dueTs??=plan.instrument.maturityTs;}
   }
   if(next){
    let readyActionRequest:ActionRequest;
    if(next.kind==='coupon_run'){
     const snapshot=view.coupons[Number(next.couponId)]!,holderWallets=plan.instrument.registry.filter((_w,i)=>snapshot.units[i]>0n&&!hasClaim(snapshot.claimedMask,i)).slice(0,4).sort();
     readyActionRequest={action:'settle_coupon',bondAddress:plan.instrument.bondAddress,walletAddress:plan.instrument.issuer,params:{couponId:next.couponId,holderWallets}};
    }else readyActionRequest={action:next.kind,bondAddress:plan.instrument.bondAddress,walletAddress:plan.instrument.issuer,params:next.params};
    return save(plan,{...common,status:'ready',readyActionRequest,error:null});
   }
   if(view.bond.state>=2&&financial.principal.remaining.baseUnits!=='0'){
    const barriers=view.bond.redemptionUnits.flatMap((units,i)=>units>0n&&!hasClaim(view!.bond.principalClaimedMask,i)?[{kind:'holder-signature',message:'The registered holder must review and sign principal redemption.',wallet:plan.instrument.registry[i],amountMinor:(units*view!.bond.faceValue).toString(),request:{action:'redeem_principal',bondAddress:plan.instrument.bondAddress,walletAddress:plan.instrument.registry[i],params:{}}}]:[]);
    return save(plan,{...common,status:'awaiting_holder_signature',barriers,error:null});
   }
   return save(plan,{...common,status:'waiting_date',barriers:[{kind:'chain-date',message:'The next contractual record, payment or maturity date has not arrived.',...(dueTs?{dueTs}:{})}],error:null});
  }catch(error){return save(plan,{...base(),status:error instanceof AppError&&['CHAIN_IDENTITY_CHANGED','PROGRAM_RELEASE_CHANGED','PLAN_STATE_CHANGED','OPERATION_CONFLICT','PLAN_RELEASE_MISMATCH'].includes(error.code)?'blocked':'unknown',error:{code:error instanceof AppError?error.code:'LIFECYCLE_UNAVAILABLE',message:'Lifecycle recovery is unavailable. Preserve its manifest, child identifiers and signatures.'}});}
 }
 async function runLifecycle(raw:LifecycleRunRequest):Promise<LifecycleRunResult>{
  const input=request(raw);await planLifecycleRun(input);const {plan}=load(input.operationId);
  if(plan.mode==='review-only')return lifecycleRunStatus(input.operationId);
  if(generatedIssuer()!==plan.instrument.issuer)fail('UNAUTHORIZED_ISSUER','The generated issuer no longer owns this lifecycle',403);
  const owner=transactionSync(()=>{const current=load(plan.operationId).operation;if(current.lease&&current.lease.expiresAt>now())return null;const owner=crypto.randomUUID();updateOperation(plan.operationId,{lease:{owner,expiresAt:now()+120000}});return owner;});
  if(!owner){const state=await lifecycleRunStatus(plan.operationId);return {...state,status:state.status==='ready'?'pending':state.status,error:{code:'LIFECYCLE_LEASE_ACTIVE',message:'Another worker owns this lifecycle. Preserve the same recovery identifier.'}};}
  try{
   let budget=input.maxTransactions;
   while(budget>0){
    const state=await lifecycleRunStatus(plan.operationId);if(state.status!=='ready')return state;
    // Select from ready control, not an earlier future stage.
    const stage=plan.stages.find(s=>state.readyActionRequest?.action==='settle_coupon'?s.kind==='coupon_run'&&s.couponId===state.readyActionRequest.params?.couponId:s.kind===state.readyActionRequest?.action&&s.couponId===state.readyActionRequest.params?.couponId);
    if(!stage)return state;
    await verify(plan);if(generatedIssuer()!==plan.instrument.issuer)fail('UNAUTHORIZED_ISSUER','The generated issuer identity changed',403);
    transactionSync(()=>{
     const latest=load(plan.operationId),lease=latest.operation.lease;if(lease?.owner!==owner||lease.expiresAt<=now())fail('LIFECYCLE_LEASE_CHANGED','Another worker owns this lifecycle; no new child may be sent');
     const c=stageChild(plan,stage);if(c?.signature||c?.status==='error'||c?.lease&&c.lease.expiresAt>now())fail('CHILD_RECOVERY_REQUIRED','Recover the existing child before dispatch');
     if(stage.kind!=='coupon_run')beginOperation(stage.operationId,stage.kind,'issuer',stage.params);
     const dispatchRequest=stage.kind==='coupon_run'
       ?{operationId:stage.operationId,bondAddress:plan.instrument.bondAddress,couponId:stage.couponId,maxBatches:budget}
       :{action:stage.kind,operationId:stage.operationId,bondAddress:plan.instrument.bondAddress,role:'issuer',params:stage.params};
     updateOperation(plan.operationId,{status:'running',metadata:{...latest.operation.metadata,dispatches:{
       ...((latest.operation.metadata?.dispatches as Record<string,unknown>)??{}),
       [stage.operationId]:{persistedAt:new Date(now()).toISOString(),owner,request:dispatchRequest}
     }}});
    });
    try{
     if(stage.kind==='coupon_run'){
      const before=findOperation(stage.operationId)?(await deps.couponRunStatus(stage.operationId)).completedGroups:0;
      const result=await deps.runCouponSettlement({operationId:stage.operationId,bondAddress:plan.instrument.bondAddress,couponId:stage.couponId!,maxBatches:budget});
      budget-=Math.max(1,result.completedGroups-before);if(['unknown','pending','running','blocked','error'].includes(result.status))return lifecycleRunStatus(plan.operationId);
     }else{await deps.demoAction({action:stage.kind,role:'issuer',operationId:stage.operationId,bondAddress:plan.instrument.bondAddress,params:stage.params},{requiredProgramRelease:{programId:plan.programId,sha256:plan.releaseSha256,genesisHash:plan.genesisHash}});budget--;}
    }catch{const state=await lifecycleRunStatus(plan.operationId);return state.status==='ready'?{...state,status:'unknown',error:{code:'CHILD_PREPARATION_INTERRUPTED',message:'Explicitly resume this same lifecycle after child preparation interrupted.'}}:state;}
    const dispatched=findOperation(stage.operationId);
    if(!dispatched||(stage.kind!=='coupon_run'&&!dispatched.signature&&dispatched.status!=='error')){const state=await lifecycleRunStatus(plan.operationId);return {...state,status:'unknown',error:{code:'CHILD_OUTCOME_MISSING',message:'No durable signed child result exists; recover this same lifecycle explicitly.'}};}
   }
   return lifecycleRunStatus(plan.operationId);
  }finally{transactionSync(()=>{const current=findOperation(plan.operationId);if(current?.lease?.owner===owner)updateOperation(plan.operationId,{lease:undefined});});}
 }
 return {planLifecycleRun,runLifecycle,lifecycleRunStatus};
}
function transactionFinality(value:unknown):value is FinalityObservation{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>,slot=(n:unknown)=>n===null||typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 return v.schemaVersion===1&&typeof v.signature==='string'&&(v.status===null||v.status==='processed'||v.status==='confirmed'||v.status==='finalized')
  &&['live-rpc','retained-observation','legacy-unknown'].includes(String(v.source))&&(v.observedAt===null||typeof v.observedAt==='string')
  &&slot(v.slot)&&slot(v.contextSlot)&&(v.genesisHash===null||typeof v.genesisHash==='string');
}
const coordinator=createLifecycleRunCoordinator({readView:readChainView,readGenesis:async()=>(await chainIdentity()).genesisHash,verifyProgram:assertVerifiedProgram,
 demoAction:async(input,policy)=>(await import('./actions.ts')).demoAction(input,policy),
 operationStatus:async id=>{
  const child=findOperation(id);if(child?.action==='lifecycle_run'||child?.action==='coupon_run')fail('CHILD_OPERATION_INVALID','A direct lifecycle child must be a transaction operation');
  const result=await operationStatus(id),observed='finality'in result?result.finality:undefined;
  return {status:result.status,signature:'signature'in result&&typeof result.signature==='string'?result.signature:null,
   projectionStatus:'projectionStatus'in result&&typeof result.projectionStatus==='string'?result.projectionStatus:undefined,
   ...(transactionFinality(observed)?{finality:observed}:{})};
 },runCouponSettlement,couponRunStatus,fixture,network,demoEnabled});
export const planLifecycleRun=coordinator.planLifecycleRun;
export const runLifecycle=coordinator.runLifecycle;
export const lifecycleRunStatus=coordinator.lifecycleRunStatus;
