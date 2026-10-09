import {rpcUrl,network} from './config.ts';
import {localDir} from './config.ts';
import path from 'node:path';
import {readJson,writeJson,transactionSync} from './storage.ts';
import {receipt,updateReceipt,saveReceipt,boundReceiptFinality,retainedReceiptFinality,type ReceiptRecord,type FinalityObservation,type FinalityLevel} from './journal.ts';
import {chainIdentity} from './chain-identity.ts';
import {getSignatureFromTransaction, getTransactionDecoder} from '@solana/kit';
export class AppError extends Error { constructor(readonly code:string,message:string,readonly status=400,readonly retryable=false,readonly definitive=false){super(message);} }
// Pinned Kit RPC TransactionError shape. Unknown variants fail closed rather
// than turning a malformed transport response into a financial rejection.
const transactionErrors=new Set('AccountBorrowOutstanding AccountInUse AccountLoadedTwice AccountNotFound AddressLookupTableNotFound AlreadyProcessed BlockhashNotFound CallChainTooDeep ClusterMaintenance InsufficientFundsForFee InvalidAccountForFee InvalidAccountIndex InvalidAddressLookupTableData InvalidAddressLookupTableIndex InvalidAddressLookupTableOwner InvalidLoadedAccountsDataSizeLimit InvalidProgramForExecution InvalidRentPayingAccount InvalidWritableAccount MaxLoadedAccountsDataSizeExceeded MissingSignatureForFee ProgramAccountNotFound ResanitizationNeeded SanitizeFailure SignatureFailure TooManyAccountLocks UnbalancedTransaction UnsupportedVersion WouldExceedAccountDataBlockLimit WouldExceedAccountDataTotalLimit WouldExceedMaxAccountCostLimit WouldExceedMaxBlockCostLimit WouldExceedMaxVoteCostLimit'.split(' '));
const instructionErrors=new Set('AccountAlreadyInitialized AccountBorrowFailed AccountBorrowOutstanding AccountDataSizeChanged AccountDataTooSmall AccountNotExecutable AccountNotRentExempt ArithmeticOverflow BorshIoError BuiltinProgramsMustConsumeComputeUnits CallDepth ComputationalBudgetExceeded DuplicateAccountIndex DuplicateAccountOutOfSync ExecutableAccountNotRentExempt ExecutableDataModified ExecutableLamportChange ExecutableModified ExternalAccountDataModified ExternalAccountLamportSpend GenericError IllegalOwner Immutable IncorrectAuthority IncorrectProgramId InsufficientFunds InvalidAccountData InvalidAccountOwner InvalidArgument InvalidError InvalidInstructionData InvalidRealloc InvalidSeeds MaxAccountsDataAllocationsExceeded MaxAccountsExceeded MaxInstructionTraceLengthExceeded MaxSeedLengthExceeded MissingAccount MissingRequiredSignature ModifiedProgramId NotEnoughAccountKeys PrivilegeEscalation ProgramEnvironmentSetupFailure ProgramFailedToCompile ProgramFailedToComplete ReadonlyDataModified ReadonlyLamportChange ReentrancyNotAllowed RentEpochModified UnbalancedInstruction UninitializedAccount UnsupportedProgramId UnsupportedSysvar'.split(' '));
const unsigned=(v:unknown,max=65535)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const sole=(v:unknown,key:string)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&Object.hasOwn(v,key);
export function validTransactionError(value:unknown):boolean{
 if(value===null)return true;if(typeof value==='string')return transactionErrors.has(value);
 if(sole(value,'DuplicateInstruction'))return unsigned((value as any).DuplicateInstruction);
 if(sole(value,'InstructionError')){const pair=(value as any).InstructionError;return Array.isArray(pair)&&pair.length===2&&unsigned(pair[0])&&(typeof pair[1]==='string'?instructionErrors.has(pair[1]):sole(pair[1],'Custom')&&unsigned(pair[1].Custom,4294967295));}
 for(const name of ['InsufficientFundsForRent','ProgramExecutionTemporarilyRestricted'])if(sole(value,name)){const index=(value as any)[name];return sole(index,'account_index')&&unsigned(index.account_index);}
 return false;
}
let next=0;
export async function rpc<T=any>(method:string,params:unknown[]=[],timeoutMs=18000):Promise<T>{
  const id=++next;
  let response:Response;try{response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});}catch{throw new AppError('RPC_UNAVAILABLE','The configured test RPC did not respond',503,true);}
  if(!response.ok)throw new AppError(response.status===429?'RPC_RATE_LIMITED':'RPC_UNAVAILABLE',`RPC returned HTTP ${response.status}`,503,true);
  let result:any;try{result=await response.json();}catch{throw new AppError('RPC_INVALID','The RPC response is not valid JSON',503,true);}
  if(!result||typeof result!=='object'||Array.isArray(result)||result.jsonrpc!=='2.0'||result.id!==id||(('result' in result)===('error' in result)))throw new AppError('RPC_INVALID','The RPC envelope does not match this request',503,true);
  if(result.error){
    if(typeof result.error!=='object'||!Number.isSafeInteger(result.error.code)||typeof result.error.message!=='string')throw new AppError('RPC_INVALID','The RPC error envelope is malformed',503,true);
    const definitive=method==='sendTransaction'&&result.error.code===-32002&&result.error.data?.err!=null&&validTransactionError(result.error.data.err)&&!JSON.stringify(result.error.data.err).includes('AlreadyProcessed');
    throw new AppError(definitive?'PREFLIGHT_REJECTED':'RPC_ERROR',definitive?'The chain preflight rejected this transaction; it was not relayed.':'The RPC could not complete this read. Retain any existing recovery identifier.',definitive?400:503,!definitive,definitive);
  }
  return result.result;
}
export async function account(key:string){const result=await rpc('getAccountInfo',[key,{encoding:'base64',commitment:'confirmed'}]);if(!result||!Number.isSafeInteger(result.context?.slot)||result.context.slot<0||!('value' in result)||(result.value!==null&&typeof result.value!=='object'))throw new AppError('RPC_INVALID','The RPC account response is malformed',503,true);return {slot:result.context.slot,value:result.value};}
export async function chainClock(){const {value}=await account('SysvarC1ock11111111111111111111111111111111');if(!value)throw new AppError('CLOCK_UNAVAILABLE','Chain clock unavailable',503);const data=Buffer.from(value.data[0],'base64');if(data.length<40)throw new AppError('CLOCK_INVALID','Invalid Clock account',503);return {slot:data.readBigUInt64LE(0),timestamp:data.readBigInt64LE(32)};}
export function explorer(signature:string){return network==='devnet'?`https://explorer.solana.com/tx/${signature}?cluster=devnet`:`https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;}
export function signatureOf(base64:string){try{return String(getSignatureFromTransaction(getTransactionDecoder().decode(Buffer.from(base64,'base64'))));}catch{throw new AppError('INVALID_TRANSACTION','Signed transaction bytes are invalid');}}
const lifetimeFile=path.join(localDir,'lifetimes.json');
export function rememberLifetime(signature:string,lastValidBlockHeight:number){if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<0)throw new AppError('INVALID_LIFETIME','The RPC lifetime must be a valid block height',503);transactionSync(()=>{const values=readJson<Record<string,number>>(lifetimeFile,{});values[signature]=lastValidBlockHeight;writeJson(lifetimeFile,values);});}
const finalityRank=(value:FinalityLevel|null)=>value==='finalized'?3:value==='confirmed'?2:value==='processed'?1:0;
function validateReceiptBinding(record:ReceiptRecord|null,signature:string,genesisHash:string){
  if(!record)return;
  if(record.signature!==signature||(record.genesisHash&&record.genesisHash!==genesisHash))throw new AppError('CHAIN_IDENTITY_CHANGED','This receipt belongs to a different transaction or test ledger. Keep its original namespace.',409);
  if(record.finality&&!boundReceiptFinality(record))throw new AppError('RECEIPT_FINALITY_INVALID','The retained finality observation is inconsistent. Preserve this recovery identifier before another signature.',409);
}
function assertObservationProgress(record:ReceiptRecord|null,value:any,contextSlot:number){
  if(!record||!record.genesisHash)return;
  const prior=boundReceiptFinality(record),level=value.confirmationStatus as FinalityLevel|null;
  // Settled observations must never regress into a fresh/retryable payment.
  const settled=record.chainStatus==='confirmed'||record.chainStatus==='error';
  if(prior&&contextSlot<prior.contextSlot!)throw new AppError('RPC_REGRESSION','The RPC context predates a retained observation. Recover the existing transaction without signing again.',503,true);
  if(prior&&finalityRank(level)<finalityRank(prior.status))throw new AppError('RPC_REGRESSION','The RPC returned a lower commitment than the retained observation. Recover the existing transaction without signing again.',503,true);
  if(settled&&(!['confirmed','finalized'].includes(level??'')||(record.slot!=null&&value.slot!==record.slot)))throw new AppError('RPC_RECEIPT_CONFLICT','The RPC contradicts the retained settled transaction context. Preserve its existing recovery identifier.',503,true);
  if(settled&&((record.chainStatus==='confirmed'&&value.err!==null)||(record.chainStatus==='error'&&value.err===null)))throw new AppError('RPC_RECEIPT_CONFLICT','The RPC contradicts the retained transaction outcome. Preserve its existing recovery identifier.',503,true);
  if(settled&&prior&&record.chainStatus==='error'&&record.error){
    let retainedError:unknown;try{retainedError=JSON.parse(record.error);}catch{}
    if(retainedError!=null&&validTransactionError(retainedError)&&JSON.stringify(retainedError)!==JSON.stringify(value.err))throw new AppError('RPC_RECEIPT_CONFLICT','The RPC contradicts the retained execution error. Preserve its existing recovery identifier.',503,true);
  }
}
export async function transactionStatus(signature:string){
  if(!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature))throw new AppError('INVALID_SIGNATURE','Invalid transaction signature');
  const identity=await chainIdentity();const stored=receipt(signature);
  validateReceiptBinding(stored,signature,identity.genesisHash);
  const result=await rpc('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);
  if(!result||!Number.isSafeInteger(result.context?.slot)||result.context.slot<0||!Array.isArray(result.value)||result.value.length!==1)throw new AppError('RPC_INVALID','The RPC returned an invalid receipt response',503,true);
  const value=result.value[0];
  if(value!==null&&(typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,'err')||!validTransactionError(value.err)||!Number.isSafeInteger(value.slot)||value.slot<0||value.slot>result.context.slot||!['processed','confirmed','finalized',null].includes(value.confirmationStatus)))throw new AppError('RPC_INVALID','The RPC receipt fields are inconsistent',503,true);
  if(value&&Object.hasOwn(value,'confirmations')&&(value.confirmations!==null&&!unsigned(value.confirmations,Number.MAX_SAFE_INTEGER)||value.confirmationStatus==='finalized'&&value.confirmations!==null))throw new AppError('RPC_INVALID','The RPC confirmation count is inconsistent',503,true);
  if(value&&Object.hasOwn(value,'status')){
    const legacy=value.status;
    if(!(value.err===null?sole(legacy,'Ok')&&legacy.Ok===null:sole(legacy,'Err')&&validTransactionError(legacy.Err)&&JSON.stringify(legacy.Err)===JSON.stringify(value.err)))throw new AppError('RPC_INVALID','The RPC legacy status contradicts its outcome',503,true);
  }
  // The identity cannot change between the signature read and its retention.
  await chainIdentity();
  const current=transactionSync(()=>{const row=receipt(signature);validateReceiptBinding(row,signature,identity.genesisHash);return row;});
  const priorFinality=current?boundReceiptFinality(current):null;
  if(priorFinality&&result.context.slot<priorFinality.contextSlot!)throw new AppError('RPC_REGRESSION','The RPC context predates the retained receipt. Preserve its existing recovery identifier.',503,true);
  if(!value&&current?.chainStatus==='confirmed'&&current.genesisHash===identity.genesisHash){await (await import('./proof-retention.ts')).captureRetainedProof(signature);return {signature,status:'confirmed' as const,slot:current.slot??null,error:null,explorerUrl:explorer(signature),verification:'recorded-confirmation',observedAt:current.observedAt,genesisHash:identity.genesisHash,finality:retainedReceiptFinality(current)};}
  if(!value&&current?.chainStatus==='error'&&current.genesisHash===identity.genesisHash){return {signature,status:'error' as const,slot:current.slot??null,error:current.error??'Retained definitive rejection',explorerUrl:explorer(signature),verification:'recorded-rejection',observedAt:current.observedAt,genesisHash:identity.genesisHash,finality:retainedReceiptFinality(current)};}
  const settled=value?.confirmationStatus==='confirmed'||value?.confirmationStatus==='finalized';
  let status:'pending'|'confirmed'|'error'|'unknown'=settled?(value.err?'error':'confirmed'):'pending';
  const lifetimes=readJson<Record<string,number>>(lifetimeFile,{});const last=current?.lastValidBlockHeight??lifetimes[signature];
  if(!value&&last!==undefined){const height=await rpc<number>('getBlockHeight',[{commitment:'finalized'}]);if(!Number.isSafeInteger(height)||height<0)throw new AppError('RPC_INVALID','The RPC block height is invalid',503,true);if(height>last)status='unknown';}
  if(!value&&current?.verification==='legacy-unbound')status='unknown';
  const finality:FinalityObservation=value?{schemaVersion:1,signature,status:value.confirmationStatus,source:'live-rpc',slot:value.slot,contextSlot:result.context.slot,observedAt:new Date().toISOString(),genesisHash:identity.genesisHash}
    :current?retainedReceiptFinality(current):{schemaVersion:1,signature,status:null,source:'live-rpc',slot:null,contextSlot:result.context.slot,observedAt:new Date().toISOString(),genesisHash:identity.genesisHash};
  if(value){transactionSync(()=>{const latest=receipt(signature);validateReceiptBinding(latest,signature,identity.genesisHash);assertObservationProgress(latest,value,result.context.slot);
    const observation={chainStatus:status,genesisHash:identity.genesisHash,slot:value.slot,observedAt:finality.observedAt!,verification:'live-rpc' as const,finality,error:value.err?JSON.stringify(value.err):undefined};
    if(latest)updateReceipt(signature,observation);else saveReceipt({signature,action:'observed-status',network,projectionStatus:'pending',submittedAt:observation.observedAt,...observation});});}
  if(status==='confirmed')await (await import('./proof-retention.ts')).captureRetainedProof(signature);
  return {signature,status,slot:value?.slot??null,error:value?.err??null,explorerUrl:explorer(signature),verification:'live-rpc',genesisHash:identity.genesisHash,observedAt:finality.observedAt,finality,...(status==='unknown'?{message:'An unavailable or unbound historical receipt cannot prove failure. Recover the existing operation; do not prepare another signature.'}:{})};
}
export async function awaitConfirmation(signature:string,maxMs=20000){
  const started=Date.now();let last:Awaited<ReturnType<typeof transactionStatus>>|undefined;
  while(Date.now()-started<maxMs){last=await transactionStatus(signature);if(last.status==='error')throw new AppError('TRANSACTION_FAILED',JSON.stringify(last.error));if(last.status==='confirmed'||last.status==='unknown')return last;await new Promise(resolve=>setTimeout(resolve,650));}
  return last??{signature,status:'pending' as const,slot:null,explorerUrl:explorer(signature)};
}
