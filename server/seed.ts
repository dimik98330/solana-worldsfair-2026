import {createHash} from 'node:crypto';
import {address,lamports,type KeyPairSigner,type Instruction} from '@solana/kit';
import {getCreateAccountInstruction} from '@solana-program/system';
import {getCreateAssociatedTokenIdempotentInstruction,getInitializeMint2Instruction,getMintToInstruction,getMintSize,getMintDecoder,TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import {ata,fundVault,initializeIssue,issueUnits,registerHolder,sealIssue,decodeBond,PROGRAM_ID} from '../packages/client/src/program.ts';
import {couponPerBond,SETTLEMENT_SCALE} from '../packages/client/src/domain.ts';
import {AppError,account,awaitConfirmation,chainClock,rpc,transactionStatus,explorer} from './rpc.ts';
import {activities,fixture,saveFixture,type Fixture} from './store.ts';
import {demoSigner,execute} from './transactions.ts';
import {network} from './config.ts';
import {beginOperation,findOperation,updateOperation,type Operation} from './operations.ts';
import {readCatalog,saveCatalog} from './catalog.ts';
import {transactionSync} from './storage.ts';
import {chainIdentity} from './chain-identity.ts';
import {saveReceipt,updateReceipt,journalValues,receipt} from './journal.ts';
import {canonicalJson} from './request-contract.ts';

const investorRoles=['investor1','investor2','investor3'] as const;
type FundingRole='issuer'|typeof investorRoles[number];
interface BootstrapStep {id:string;operationId:string;kind:string;fundingRole?:FundingRole;investorIndex?:number;}
export interface BootstrapPlan {
  version:1;network:string;genesisHash:string;seriesId:string;bond:string;bondMint:string;vault:string;
  settlementMint:string;source:string;name:string;createdAt:string;roles:Record<string,string>;
  faceValueMinor:string;couponMinor:string;recordTs:string;paymentTs:string;maturityTs:string;
  settlementFundingMinor:string;reserveMinor:string;holdings:string[];createMint:boolean;mintRentLamports:string;
  steps:BootstrapStep[];
}
interface ExistingBootstrap {bond:string;signature:string;genesisHash:string;}
interface Replacement {ownerId:string;archive:Fixture|null;children:{id:string;signature:string|null;airdropStarted:boolean;observedStatus:'confirmed'|'error'|null}[];}
let pending:{id:string;promise:Promise<unknown>}|null=null;
const parent=(id:string)=>{const value=findOperation(id);if(!value||value.action!=='bootstrap')throw new AppError('OPERATION_NOT_FOUND','No bootstrap operation exists for this identifier',404);return value;};
const digest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const childId=(id:string,step:string)=>'bootstrap_'+createHash('sha256').update(id+':'+step).digest('hex').slice(0,48);
function storedPlan(value:Operation):BootstrapPlan|null {
  const plan=value.metadata?.bootstrapPlan as BootstrapPlan|undefined;
  if(!plan)return null;
  if(plan.version!==1||plan.network!==network||value.metadata?.bootstrapPlanDigest!==digest(plan)||!Array.isArray(plan.steps)||plan.steps.length!==11)throw new AppError('BOOTSTRAP_PLAN_INVALID','The immutable bootstrap plan cannot be verified; preserve its operation identifier',409);
  return plan;
}
/** Pure local status. GET must never call bootstrap(), which may submit new child steps. */
export function bootstrapStatus(id:string){
  const value=parent(id),plan=storedPlan(value);
  const steps=plan?.steps.map(step=>{const operation=findOperation(step.operationId);return {id:step.id,operationId:step.operationId,kind:step.kind,status:operation?.status??'not_started',signature:operation?.signature??null,chainStatus:operation?.chainStatus??'not_submitted',projectionStatus:operation?.projectionStatus??'pending',fundingVerification:operation?.metadata?.fundingVerification??null,error:operation?.error??null};})??[];
  const completedSteps=steps.filter(step=>step.status==='confirmed'&&step.projectionStatus==='complete').length;
  const nextStep=steps.find(step=>step.status!=='confirmed'||step.projectionStatus!=='complete')??null;
  const blockedAirdrop=nextStep&&!nextStep.signature&&nextStep.status==='unknown';
  const canCheckFunding=Boolean(blockedAirdrop&&nextStep?.kind==='test_sol_funding');
  return {operationId:id,status:value.status,signature:value.signature??null,bond:value.bond??plan?.bond??null,accelerated:true,
    explorerUrl:value.signature?explorer(value.signature):null,
    chainStatus:value.chainStatus??'not_submitted',projectionStatus:value.projectionStatus??'pending',error:value.error??null,
    bootstrap:{version:1,mode:plan?'planned':value.metadata?.bootstrapExisting?'existing':'planning',reset:value.params?.reset===true,planDigest:value.metadata?.bootstrapPlanDigest??null,completedSteps,totalSteps:steps.length,nextStep,steps,
      canResume:!['confirmed','superseded'].includes(value.status)&&!value.metadata?.bootstrapBlocked&&(!blockedAirdrop||canCheckFunding)&&nextStep?.status!=='error',canCheckFunding,supersededBy:value.metadata?.bootstrapSupersededBy??null,requiresExplicitResume:!['confirmed','superseded'].includes(value.status),resumeOperationId:value.metadata?.bootstrapBlockedBy??id}};
}
function progress(id:string,status:string,error?:string){
  transactionSync(()=>{const value=parent(id);if(value.status==='superseded'||value.status==='confirmed'&&status!=='confirmed')return;const snapshot=bootstrapStatus(id);updateOperation(id,{status,projectionStatus:status==='confirmed'?'complete':'pending',error,
    metadata:{...value.metadata,bootstrapProgress:{state:status,completedSteps:snapshot.bootstrap.completedSteps,totalSteps:snapshot.bootstrap.totalSteps,nextStepId:snapshot.bootstrap.nextStep?.id??null,updatedAt:new Date().toISOString(),requiresExplicitResume:status!=='confirmed'}}});});
}
export async function bootstrap(reset=false,requestedId:string=crypto.randomUUID()){
  if(typeof reset!=='boolean')throw new AppError('INVALID_REQUEST','Bootstrap reset must be a boolean');
  if(pending&&pending.id!==requestedId)throw new AppError('ACTION_PENDING','Another bootstrap is active; retain that recovery identifier',409);
  const existing=beginOperation(requestedId,'bootstrap','issuer',{reset});
  if(pending)return pending.promise;
  if(existing.new)updateOperation(requestedId,{metadata:{bootstrapVersion:1,bootstrapProgress:{state:'planning',requiresExplicitResume:true}}});
  const promise=resume(reset,requestedId).catch(error=>{
    const value=parent(requestedId),plan=storedPlan(value),next=plan?.steps.find(step=>findOperation(step.operationId)?.status!=='confirmed');
    const retained=next?findOperation(next.operationId):null;
    const state=retained?.chainStatus==='error'?'error':retained?.signature||retained?.metadata?.airdropRequestStarted?'unknown':error instanceof AppError&&error.code==='TEST_SOL_REQUIRED'?'funding_required':'partial';
    progress(requestedId,state,error instanceof Error?error.message:'Bootstrap remains incomplete');throw error;
  }).finally(()=>{pending=null;});
  pending={id:requestedId,promise};return promise;
}
async function resume(reset:boolean,id:string){
  let value=parent(id),plan=storedPlan(value);
  if(value.metadata?.bootstrapSupersededBy)throw new AppError('BOOTSTRAP_SUPERSEDED','This immutable plan was superseded by '+value.metadata.bootstrapSupersededBy+'; its steps will not be sent',409);
  const identity=await chainIdentity();
  if(!plan){
    const reference=value.metadata?.bootstrapExisting as ExistingBootstrap|undefined;
    if(reference)return verifyExisting(id,reference);
    const current=fixture();
    if(current?.complete&&!reset){
      const signature=value.signature??current.bootstrapSignature??activities().find(a=>a.kind==='fund_and_seal'&&Date.parse(a.time)>=Date.parse(current.createdAt))?.signature;
      if(!signature)throw new AppError('BOOTSTRAP_PROOF_MISSING','The complete fixture has no verifiable setup receipt');
      const retained={bond:current.bond,signature,genesisHash:identity.genesisHash};
      updateOperation(id,{bond:current.bond,signature,metadata:{...value.metadata,bootstrapExisting:retained}});
      return verifyExisting(id,retained);
    }
    if(value.metadata?.bootstrapVersion!==1)throw new AppError('BOOTSTRAP_PLAN_MISSING','This older partial bootstrap has no immutable plan. Preserve its issue and receipts; do not repeat setup under a new identifier',409);
    let replacement:Replacement|undefined;
    if(current&&!current.complete)replacement=await replacementFor(id,current,reset);
    const signers=await signerSet();
    plan=await makePlan(id,identity.genesisHash,signers);
    plan=transactionSync(()=>{
      value=parent(id);const committed=storedPlan(value);if(committed)return committed;
      const latest=fixture();
      if(latest?.bond!==current?.bond||latest&&!latest.complete&&!replacement)throw new AppError('BOOTSTRAP_INCOMPLETE','Another setup reserved this fixture; resume its existing identifier',409);
      if(replacement){
        for(const observed of replacement.children){const child=findOperation(observed.id);if((child?.signature??null)!==observed.signature||Boolean(child?.metadata?.airdropRequestStarted)!==observed.airdropStarted)throw new AppError('BOOTSTRAP_INCOMPLETE','A previous child changed during reset review; reconcile it again before reset',409);if(observed.observedStatus)updateOperation(observed.id,{status:observed.observedStatus,chainStatus:observed.observedStatus,projectionStatus:'complete',...(observed.observedStatus==='confirmed'?{error:undefined}:{})});}
        const previous=parent(replacement.ownerId);updateOperation(previous.id,{status:'superseded',metadata:{...previous.metadata,bootstrapSupersededBy:id}});
        if(replacement.archive){const archived=readCatalog(replacement.archive.bond);saveCatalog(archived?{...archived,complete:false}:{...replacement.archive,source:'demo'});}
      }else if(latest){const archived=readCatalog(latest.bond);saveCatalog(archived??{...latest,source:'demo'});}
      const frozen=plan!;
      saveFixture(planFixture(frozen));
      updateOperation(id,{bond:frozen.bond,wallet:frozen.roles.issuer,status:'partial',metadata:{...value.metadata,bootstrapVersion:1,bootstrapPlan:frozen,bootstrapPlanDigest:digest(frozen)}});
      return frozen;
    });
  }
  if(plan.genesisHash!==identity.genesisHash)throw new AppError('CHAIN_IDENTITY_CHANGED','Bootstrap belongs to its original test ledger',409);
  if(parent(id).status==='confirmed')return bootstrapStatus(id);
  assertActive(id,plan);
  const signers=await signerSet();
  for(const role of ['issuer',...investorRoles] as const)if(signers[role].address!==plan.roles[role])throw new AppError('DEMO_SIGNER_MISMATCH','The generated role does not match the frozen bootstrap plan',409);
  if(signers.mint.address!==plan.settlementMint)throw new AppError('DEMO_SIGNER_MISMATCH','The settlement signer does not match the frozen bootstrap plan',409);
  for(const step of plan.steps){await runStep(id,plan,step,signers);progress(id,'partial');}
  const final=findOperation(plan.steps.at(-1)!.operationId);
  if(!final?.signature||final.status!=='confirmed')throw new AppError('UNKNOWN_STATUS','Final setup proof remains unresolved',503);
  transactionSync(()=>{
    const current=fixture();if(current?.bond!==plan!.bond)throw new AppError('BOOTSTRAP_FIXTURE_CHANGED','The selected fixture changed; preserve the completed setup receipt',409);
    const complete={...current,complete:true,bootstrapSignature:final.signature};
    saveFixture(complete);saveCatalog({...complete,source:'demo'});
    updateOperation(id,{signature:final.signature,status:'confirmed',chainStatus:'confirmed',projectionStatus:'complete',error:undefined});
    progress(id,'confirmed');
  });
  return bootstrapStatus(id);
}
function assertActive(id:string,plan:BootstrapPlan){if(parent(id).metadata?.bootstrapSupersededBy||fixture()?.bond!==plan.bond)throw new AppError('BOOTSTRAP_SUPERSEDED','This plan no longer owns the active fixture; its unsubmitted steps will not be sent',409);}
async function replacementFor(id:string,current:Fixture,reset:boolean):Promise<Replacement>{
  const owner=journalValues<Operation>('operations').find(item=>item.action==='bootstrap'&&(item.metadata?.bootstrapPlan as BootstrapPlan|undefined)?.bond===current.bond);
  const blocked=()=>{const value=parent(id);updateOperation(id,{metadata:{...value.metadata,bootstrapBlocked:true,bootstrapBlockedBy:owner?.id??null}});throw new AppError('BOOTSTRAP_INCOMPLETE','An incomplete fixture exists. Resume '+(owner?.id??'its original bootstrap identifier')+'; reset cannot discard unresolved signed steps',409);};
  if(!reset||!owner)return blocked();
  const plan=storedPlan(owner);if(!plan)return blocked();
  const children:Replacement['children']=[];
  let issueConfirmed=false;
  for(const step of plan.steps){
    const child=findOperation(step.operationId);const signature=child?.signature??null,airdropStarted=Boolean(child?.metadata?.airdropRequestStarted);
    let observedStatus:'confirmed'|'error'|null=null;
    if(!signature&&airdropStarted)return blocked();
    if(signature){const result=await transactionStatus(signature);if(result.status!=='confirmed'&&result.status!=='error')return blocked();observedStatus=result.status;if(step.id==='issue'&&result.status==='confirmed')issueConfirmed=true;}
    children.push({id:step.operationId,signature,airdropStarted,observedStatus});
  }
  const raw=await account(current.bond);let archive:Fixture|null=null;
  if(raw.value){
    if(raw.value.executable||raw.value.owner!==PROGRAM_ID)throw new AppError('INVALID_ACCOUNT_OWNER','The previous partial issue is not owned by BondTrace',409);
    const bond=decodeBond(Buffer.from(raw.value.data?.[0]??'','base64'));
    if(bond.issuer!==plan.roles.issuer||bond.settlementMint!==plan.settlementMint||bond.bondMint!==plan.bondMint||bond.vault!==plan.vault||bond.seriesId.toString()!==plan.seriesId)throw new AppError('INSTRUMENT_MISMATCH','The previous partial issue does not match its frozen plan',409);
    archive=current;
  }else if(issueConfirmed)throw new AppError('BOOTSTRAP_PROOF_MISSING','A confirmed issue account is unavailable; reset cannot assume it never existed',409);
  const value=parent(id);updateOperation(id,{metadata:{...value.metadata,bootstrapBlocked:false,bootstrapReplaces:owner.id}});
  return {ownerId:owner.id,archive,children};
}
async function verifyExisting(id:string,reference:ExistingBootstrap){
  const identity=await chainIdentity();if(identity.genesisHash!==reference.genesisHash)throw new AppError('CHAIN_IDENTITY_CHANGED','Setup proof belongs to another test ledger',409);
  const result=await transactionStatus(reference.signature);
  updateOperation(id,{signature:reference.signature,bond:reference.bond,status:result.status,chainStatus:result.status,projectionStatus:result.status==='confirmed'?'complete':'pending'});
  if(result.status!=='confirmed')throw new AppError('UNKNOWN_STATUS','Existing setup proof remains unresolved; no new issue was created',503);
  return {...result,bond:reference.bond,operationId:id,accelerated:true};
}
async function signerSet(){return {issuer:await demoSigner('issuer'),mint:await demoSigner('settlement-mint'),investor1:await demoSigner('investor1'),investor2:await demoSigner('investor2'),investor3:await demoSigner('investor3')};}
type Signers=Awaited<ReturnType<typeof signerSet>>;
function planFixture(plan:BootstrapPlan):Fixture{return {seriesId:plan.seriesId,bond:plan.bond,name:plan.name,settlementMint:plan.settlementMint,createdAt:plan.createdAt,rateBps:1000,couponFrequency:2,roles:plan.roles,proposalIds:[],complete:false,accelerated:true};}
async function validateMint(mint:string,issuer:string){
  const raw=await account(mint);if(!raw.value)return false;
  if(raw.value.owner!==TOKEN_PROGRAM_ADDRESS||raw.value.executable)throw new AppError('INVALID_MINT','Generated settlement address must be a classic SPL mint');
  const bytes=Buffer.from(raw.value.data?.[0]??'','base64');if(bytes.length!==82)throw new AppError('INVALID_MINT','Generated settlement mint has invalid account data');
  const value=getMintDecoder().decode(bytes);
  if(!value.isInitialized||value.decimals!==6||value.mintAuthority.__option!=='Some'||value.mintAuthority.value!==issuer)throw new AppError('INVALID_MINT','Settlement mint authority/decimals do not match the demo issuer');
  return true;
}
async function makePlan(id:string,genesisHash:string,signers:Signers):Promise<BootstrapPlan>{
  const clock=await chainClock(),series=BigInt('0x'+createHash('sha256').update(genesisHash+':'+id).digest('hex').slice(0,16));
  const face=1000n*SETTLEMENT_SCALE,coupon=couponPerBond(face,1000,2),record=clock.timestamp+(network==='localnet'?90n:180n),payment=record+5n,maturity=record+300n;
  const creation=await initializeIssue(signers.issuer.address,signers.mint.address,series,'BondTrace · Test Series',face,maturity,[{recordTs:record,paymentTs:payment,unitAmount:coupon}]);
  const createMint=!await validateMint(signers.mint.address,signers.issuer.address);
  const rent=createMint?await rpc<number>('getMinimumBalanceForRentExemption',[getMintSize()]):0;
  if(!Number.isSafeInteger(rent)||rent<0)throw new AppError('RPC_INVALID','The mint rent quote is unavailable',503);
  const fundingSteps=['issuer',...investorRoles].map(role=>({id:'sol_'+role,operationId:childId(id,'sol_'+role),kind:'test_sol_funding',fundingRole:role as FundingRole}));
  const transactionSteps=[{id:'mint',kind:'test_settlement_mint'},{id:'funding',kind:'test_settlement_funding'},{id:'issue',kind:'initialize_issue'},...investorRoles.map((_,i)=>({id:'holder_'+i,kind:'register_and_issue',investorIndex:i})),{id:'seal',kind:'fund_and_seal'}];
  return {version:1,network,genesisHash,seriesId:series.toString(),bond:creation.bond,bondMint:creation.mint,vault:creation.vault,
    settlementMint:String(signers.mint.address),source:await ata(signers.issuer.address,signers.mint.address),name:'BondTrace · Test Series',createdAt:new Date().toISOString(),
    roles:{issuer:String(signers.issuer.address),...Object.fromEntries(investorRoles.map(role=>[role,String(signers[role].address)]))},
    faceValueMinor:face.toString(),couponMinor:coupon.toString(),recordTs:record.toString(),paymentTs:payment.toString(),maturityTs:maturity.toString(),
    settlementFundingMinor:(50_000n*SETTLEMENT_SCALE).toString(),reserveMinor:((face+coupon)*18n).toString(),holdings:['10','5','3'],createMint,mintRentLamports:String(rent),
    steps:[...fundingSteps,...transactionSteps.map(step=>({...step,operationId:childId(id,step.id)}))]};
}
function completeStep(step:BootstrapStep){transactionSync(()=>{const value=findOperation(step.operationId)!;updateOperation(step.operationId,{status:'confirmed',chainStatus:value.signature?'confirmed':'not_submitted',projectionStatus:'complete',error:undefined});if(value.signature)updateReceipt(value.signature,{projectionStatus:'complete'});});}
async function reconcileStep(step:BootstrapStep){
  const value=findOperation(step.operationId)!;
  if(!value.signature){if(value.status==='confirmed'&&value.projectionStatus==='complete')return true;if(value.metadata?.airdropRequestStarted&&!step.fundingRole)throw new AppError('UNKNOWN_STATUS','An external response was lost; preserve this child identifier',503);return false;}
  const result=await transactionStatus(value.signature);
  updateOperation(step.operationId,{status:result.status,chainStatus:result.status,...(result.status==='error'?{projectionStatus:'complete',error:'The retained step was rejected'}:{})});
  if(result.status==='confirmed'){completeStep(step);return true;}
  if(result.status==='error')throw new AppError('BOOTSTRAP_STEP_REJECTED','A retained bootstrap transaction was rejected; preserve the plan and do not sign a replacement automatically',409);
  throw new AppError('UNKNOWN_STATUS','This bootstrap step remains pending or unknown. Recover its retained signature before continuing',503);
}
async function runStep(id:string,plan:BootstrapPlan,step:BootstrapStep,signers:Signers){
  const params={parentOperationId:id,stepId:step.id,planDigest:digest(plan)};
  beginOperation(step.operationId,'bootstrap_step','issuer',params);
  transactionSync(()=>{assertActive(id,plan);const current=findOperation(step.operationId);updateOperation(step.operationId,{bond:plan.bond,wallet:plan.roles.issuer,metadata:{...current?.metadata,...params}});});
  if(await reconcileStep(step))return;
  if(step.fundingRole){await ensureSol(id,plan,step,signers[step.fundingRole]);return;}
  if(step.id==='mint'&&!plan.createMint){if(!await validateMint(plan.settlementMint,plan.roles.issuer))throw new AppError('INVALID_MINT','The frozen preexisting settlement mint disappeared');completeStep(step);return;}
  const instructions=await instructionsFor(plan,step,signers);
  try{
    const result=await execute(instructions,signers.issuer,step.kind,step.id==='mint'?[signers.mint]:[],plan.bond,signature=>{
      assertActive(id,plan);
      const current=findOperation(step.operationId);
      if(current?.signature)throw new AppError('BOOTSTRAP_STEP_BOUND','The child already has a retained signature; recover it instead of sending again',409);
      const retained=receipt(signature);
      if(retained?.bond!==plan.bond||retained.action!==step.kind)throw new AppError('BOOTSTRAP_SIGNATURE_REUSE','This message already belongs to another issue; explicitly resume after a fresh blockhash is available',503,true);
      updateOperation(step.operationId,{signature,status:'pending',chainStatus:'pending',projectionStatus:'pending'});
      progress(id,'pending');
    },plan.bond);
    updateOperation(step.operationId,{status:result.status,chainStatus:result.status});
    if(result.status!=='confirmed')throw new AppError('UNKNOWN_STATUS','The bootstrap child receipt remains unresolved',503);
    completeStep(step);
  }catch(error){
    const retained=findOperation(step.operationId);
    if(retained?.signature&&!(retained.status==='confirmed'&&retained.projectionStatus==='complete')){
      const rejected=error instanceof AppError&&(error.definitive||error.code==='TRANSACTION_FAILED');
      updateOperation(step.operationId,{status:rejected?'error':'unknown',...(rejected?{chainStatus:'error',projectionStatus:'complete'}:{}),error:error instanceof Error?error.message:'Retained receipt needs recovery'});
    }
    throw error;
  }
}
async function ensureSol(id:string,plan:BootstrapPlan,step:BootstrapStep,signer:KeyPairSigner){
  const balance=await rpc<unknown>('getBalance',[signer.address,{commitment:'confirmed'}]);
  const actual=typeof balance==='number'?balance:(balance as {value?:unknown})?.value;
  if(typeof actual!=='number'||!Number.isSafeInteger(actual)||actual<0)throw new AppError('RPC_INVALID','The test SOL balance is unavailable',503);
  if(actual>=100_000_000){transactionSync(()=>{const current=findOperation(step.operationId)!;updateOperation(step.operationId,{metadata:{...current.metadata,fundingVerification:'balance-only',fundingObservedLamports:String(actual),fundingObservedAt:new Date().toISOString(),...(current.metadata?.airdropRequestStarted?{airdropOutcome:'unknown'}:{})}});completeStep(step);});return;}
  if(network==='devnet'){updateOperation(step.operationId,{status:'funding_required',error:'Fund '+signer.address+' with test SOL before explicitly resuming this operation'});throw new AppError('TEST_SOL_REQUIRED','Devnet role '+signer.address+' needs test SOL. Automatic devnet faucet retries are disabled',409);}
  transactionSync(()=>{assertActive(id,plan);const current=findOperation(step.operationId)!;if(current.signature||current.metadata?.airdropRequestStarted)throw new AppError('UNKNOWN_STATUS','This faucet request is already retained and will not be repeated',503);updateOperation(step.operationId,{status:'unknown',metadata:{...current.metadata,airdropRequestStarted:true}});progress(id,'pending');});
  const signature=await rpc<string>('requestAirdrop',[signer.address,2_000_000_000,{commitment:'confirmed'}]);
  if(typeof signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature))throw new AppError('UNKNOWN_STATUS','The faucet response did not supply a usable receipt; do not repeat automatically',503);
  transactionSync(()=>{updateOperation(step.operationId,{signature,status:'pending',chainStatus:'pending'});saveReceipt({signature,action:step.kind,wallet:String(signer.address),operationId:step.operationId,network,genesisHash:plan.genesisHash,chainStatus:'pending',projectionStatus:'pending',submittedAt:new Date().toISOString()});progress(id,'pending');});
  const result=await awaitConfirmation(signature);
  updateOperation(step.operationId,{status:result.status,chainStatus:result.status});
  if(result.status!=='confirmed')throw new AppError('UNKNOWN_STATUS','The saved faucet receipt remains unresolved; do not repeat automatically',503);
  completeStep(step);
}
async function instructionsFor(plan:BootstrapPlan,step:BootstrapStep,signers:Signers):Promise<Instruction[]>{
  switch(step.id){
    case 'mint':return [getCreateAccountInstruction({payer:signers.issuer,newAccount:signers.mint,lamports:lamports(BigInt(plan.mintRentLamports)),space:getMintSize(),programAddress:TOKEN_PROGRAM_ADDRESS}),getInitializeMint2Instruction({mint:address(plan.settlementMint),decimals:6,mintAuthority:signers.issuer.address})];
    case 'funding':return [getCreateAssociatedTokenIdempotentInstruction({payer:signers.issuer,ata:address(plan.source),owner:signers.issuer.address,mint:address(plan.settlementMint)}),getMintToInstruction({mint:address(plan.settlementMint),token:address(plan.source),mintAuthority:signers.issuer,amount:BigInt(plan.settlementFundingMinor)})];
    case 'issue':return [(await initializeIssue(plan.roles.issuer,plan.settlementMint,BigInt(plan.seriesId),plan.name,BigInt(plan.faceValueMinor),BigInt(plan.maturityTs),[{recordTs:BigInt(plan.recordTs),paymentTs:BigInt(plan.paymentTs),unitAmount:BigInt(plan.couponMinor)}])).ix];
    case 'seal':return [fundVault(plan.roles.issuer,plan.bond,plan.settlementMint,plan.source,plan.vault,BigInt(plan.reserveMinor)),sealIssue(plan.roles.issuer,plan.bond,plan.bondMint,plan.vault)];
    default:{const index=step.investorIndex;if(index===undefined||index<0||index>=investorRoles.length)throw new AppError('BOOTSTRAP_PLAN_INVALID','Unknown bootstrap child step');const investor=signers[investorRoles[index]],holding=await ata(investor.address,plan.bondMint),settlement=await ata(investor.address,plan.settlementMint);return [getCreateAssociatedTokenIdempotentInstruction({payer:signers.issuer,ata:holding,owner:investor.address,mint:address(plan.bondMint)}),getCreateAssociatedTokenIdempotentInstruction({payer:signers.issuer,ata:settlement,owner:investor.address,mint:address(plan.settlementMint)}),registerHolder(plan.roles.issuer,plan.bond,investor.address,holding,plan.bondMint),issueUnits(plan.roles.issuer,plan.bond,plan.bondMint,holding,BigInt(plan.holdings[index]))];}
  }
}
