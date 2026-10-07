import fs from 'node:fs';
import path from 'node:path';
import {appendTransactionMessageInstructions,compileTransaction,createKeyPairSignerFromBytes,createNoopSigner,createTransactionMessage,generateKeyPairSigner,getBase64EncodedWireTransaction,getTransactionEncoder,getBase58Decoder,getAddressEncoder,partiallySignTransactionMessageWithSigners,pipe,setTransactionMessageComputeUnitLimit,setTransactionMessageFeePayer,setTransactionMessageFeePayerSigner,setTransactionMessageLifetimeUsingBlockhash,type Instruction,type KeyPairSigner,address} from '@solana/kit';
import {getTransactionDecoder} from '@solana/kit';
import {applyConfirmedEffect} from './effects.ts';
import {transactionSync} from './storage.ts';
import {chainIdentity} from './chain-identity.ts';
import {receipt,saveReceipt,updateReceipt} from './journal.ts';
import {completePreparedProjection} from './prepared.ts';
import {operationStatus} from './operations.ts';
import {localDir,network} from './config.ts';
import {AppError,awaitConfirmation,explorer,rpc,signatureOf,rememberLifetime,validTransactionError} from './rpc.ts';
import {recordActivity,recordProposal} from './store.ts';
import {requirePrepared,completePrepared,setPreparedStatus} from './prepared.ts';
const keysDir=path.join(localDir,'keys');fs.mkdirSync(keysDir,{recursive:true});
const knownRoles=new Set(['issuer','investor1','investor2','investor3','settlement-mint']);
export async function demoSigner(role:string):Promise<KeyPairSigner>{
  if(!knownRoles.has(role))throw new AppError('INVALID_DEMO_ROLE','Only fixed generated demo roles are allowed');
  const location=path.join(keysDir,role+'-keypair.json');
  if(fs.existsSync(location))return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(fs.readFileSync(location,'utf8'))),true);
  const key=await generateKeyPairSigner(true);const raw=await crypto.subtle.exportKey('pkcs8',key.keyPair.privateKey);const privateSeed=Buffer.from(raw).subarray(-32);const publicBytes=getAddressEncoder().encode(key.address);fs.writeFileSync(location,JSON.stringify([...privateSeed,...publicBytes]),{flag:'wx',mode:0o600});return key;
}
export interface SimulationSummary {success:boolean;computeUnits:string;message?:string;}
export async function buildTransaction(instructions:Instruction[],payerAddress:string,signers:KeyPairSigner[]=[],version:0|1=0){
  const latest=await rpc('getLatestBlockhash',[{commitment:'confirmed'}]);
  if(!latest||typeof latest.value?.blockhash!=='string'||!Number.isSafeInteger(latest.value.lastValidBlockHeight)||latest.value.lastValidBlockHeight<0)throw new AppError('RPC_INVALID','The RPC returned an invalid transaction lifetime',503,true);
  const lifetime={blockhash:latest.value.blockhash,lastValidBlockHeight:BigInt(latest.value.lastValidBlockHeight)};
  const payer=signers.find(s=>s.address===payerAddress)??createNoopSigner(address(payerAddress));
  let message:any=pipe(createTransactionMessage({version}),m=>setTransactionMessageFeePayerSigner(payer,m),m=>setTransactionMessageLifetimeUsingBlockhash(lifetime,m),m=>appendTransactionMessageInstructions(instructions,m),m=>setTransactionMessageComputeUnitLimit(1_400_000,m));
  // Version 0 is an explicit localnet/wallet compatibility path. Simulation sizes its CU cap.
  let signed=await partiallySignTransactionMessageWithSigners(message);
  let wire=Buffer.from(getTransactionEncoder().encode(signed));
  let simulation=await rpc('simulateTransaction',[wire.toString('base64'),{encoding:'base64',sigVerify:false,commitment:'confirmed'}]);
  if(!simulation?.value||!Object.hasOwn(simulation.value,'err')||!validTransactionError(simulation.value.err)||!Number.isSafeInteger(simulation.context?.slot)||simulation.context.slot<0||!Number.isSafeInteger(simulation.value.unitsConsumed)||simulation.value.unitsConsumed<0||simulation.value.unitsConsumed>1_400_000)throw new AppError('RPC_INVALID','The RPC simulation result is incomplete or inconsistent',503,true);
  if(simulation.value.err){const logs=String(simulation.value.logs?.join(' ')??'');const friendly:Record<string,string>={VotingClosed:'The voting window has closed. No ballot was submitted.',TooEarly:'This action is not due on the chain clock yet.',RecordDateLocked:'Capture the due record date before transferring bonds.',Matured:'This issue has reached maturity; transfers and new proposals are closed.',AlreadyClaimed:'This payment was already claimed. No second payment was submitted.',AlreadyVoted:'This holder already voted on the proposal.',InsufficientReserve:'The settlement reserve does not cover this action.',UnauthorizedIssuer:'Only the issue issuer may perform this action.'};const code=Object.keys(friendly).find(name=>logs.includes('Error Code: '+name+'.'));throw new AppError(code?code.replace(/([a-z])([A-Z])/g,'$1_$2').toUpperCase():'SIMULATION_FAILED',code?friendly[code]:'The chain simulation rejected this action. Refresh the current state and review the inputs.');}
  const used=BigInt(simulation.value.unitsConsumed??0);const limit=Math.min(1_400_000,Math.max(10_000,Math.ceil(Number(used)*1.2)+1000));
  message=setTransactionMessageComputeUnitLimit(limit,message);signed=await partiallySignTransactionMessageWithSigners(message);wire=Buffer.from(getTransactionEncoder().encode(signed));
  const maximum=version===1?4096:1232;if(wire.length>maximum)throw new AppError('TRANSACTION_TOO_LARGE',`Transaction ${wire.length} bytes exceeds ${maximum}`);
  const fee=await rpc('getFeeForMessage',[Buffer.from(signed.messageBytes).toString('base64'),{commitment:'confirmed'}]);
  if(!fee||!Number.isSafeInteger(fee.value)||fee.value<0)throw new AppError('FEE_UNAVAILABLE','The RPC could not quote this message fee. Prepare a fresh review before signing.',503,true);
  return {transactionBase64:wire.toString('base64'),lastValidBlockHeight:Number(lifetime.lastValidBlockHeight),feeLamports:String(fee.value),simulation:{success:true,computeUnits:used.toString()},bytes:wire.length,version};
}
export async function execute(instructions:Instruction[],actor:KeyPairSigner,kind:string,additionalSigners:KeyPairSigner[]=[],accountAddress?:string,onSubmitted?:(signature:string)=>void,bondAddress?:string){
 if(onSubmitted?.constructor.name==='AsyncFunction')throw new AppError('INVALID_CALLBACK','Submission persistence must be synchronous',503);
 const identity=await chainIdentity(),prepared=await buildTransaction(instructions,String(actor.address),[actor,...additionalSigners],0);
 const signature=signatureOf(prepared.transactionBase64);
 transactionSync(()=>{const previous=receipt(signature);if(previous)throw new AppError('MESSAGE_ALREADY_SUBMITTED','This exact signed message already has a retained receipt. Recover the existing identifier; a distinct operation needs a fresh blockhash.',409);saveReceipt({signature,action:kind,wallet:actor.address,network,genesisHash:identity.genesisHash,chainStatus:'pending',projectionStatus:'pending',submittedAt:new Date().toISOString(),lastValidBlockHeight:prepared.lastValidBlockHeight,signedTransactionBase64:prepared.transactionBase64,bond:bondAddress,account:accountAddress});rememberLifetime(signature,prepared.lastValidBlockHeight);const result=onSubmitted?.(signature) as unknown;if(result&&typeof(result as any).then==='function'){Promise.resolve(result).catch(()=>{});throw new AppError('INVALID_CALLBACK','Submission persistence must complete synchronously',503);}});
 const retained=receipt(signature)!;
 if(retained.chainStatus==='confirmed'){const result=await awaitConfirmation(signature);return {...result,simulation:prepared.simulation,bytes:prepared.bytes};}
 try{const returned=await rpc<string>('sendTransaction',[prepared.transactionBase64,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:1}]);if(returned!==signature)throw new Error('Unexpected RPC signature');}
 catch(error){if(error instanceof AppError&&error.definitive){updateReceipt(signature,{chainStatus:'error',projectionStatus:'complete',error:error.message});throw error;}throw new AppError('UNKNOWN_STATUS','Submission response was interrupted. Recover the retained receipt before another signature.',503);}
 let result;try{result=await awaitConfirmation(signature);}catch(error){if(error instanceof AppError&&error.code==='TRANSACTION_FAILED'){updateReceipt(signature,{chainStatus:'error',projectionStatus:'complete',error:error.message});throw error;}throw new AppError('UNKNOWN_STATUS','Confirmation is unavailable. Retain the saved signature and recovery identifier.',503);}
 // The generic signer has no catalog projection. Action-specific callers reconcile theirs.
 if(result.status==='confirmed'&&!['initialize_issue','register_holder','issue_units','seal_issue','create_vote'].includes(kind))updateReceipt(signature,{projectionStatus:'complete'});
 return {...result,simulation:prepared.simulation,bytes:prepared.bytes};
}
export async function submitPrepared(signedTransactionBase64:string){
 if(typeof signedTransactionBase64!=='string'||!signedTransactionBase64.length||signedTransactionBase64.length>12000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signedTransactionBase64))throw new AppError('INVALID_TRANSACTION','Use a valid bounded base64 transaction');
 const prepared=requirePrepared(signedTransactionBase64),decoded=getTransactionDecoder().decode(Buffer.from(signedTransactionBase64,'base64'));
 if(!(prepared.wallet in decoded.signatures))throw new AppError('INVALID_SIGNATURE','The reviewed wallet must sign the exact message');
 for(const[wallet,signature]of Object.entries(decoded.signatures)){if(!signature||signature.length!==64)throw new AppError('INVALID_SIGNATURE','Every required signature must be present');const key=await crypto.subtle.importKey('raw',new Uint8Array(getAddressEncoder().encode(address(wallet))),{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',key,new Uint8Array(signature),new Uint8Array(decoded.messageBytes)))throw new AppError('INVALID_SIGNATURE','A required signature does not verify against the reviewed message');}
 if(prepared.signature)return recoverPrepared(prepared.id);
 const expected=signatureOf(signedTransactionBase64),identity=await chainIdentity();let already=false;
 transactionSync(()=>{const current=requirePrepared(signedTransactionBase64);if(current.signature){already=true;return;}completePrepared(prepared.id,expected);rememberLifetime(expected,prepared.lastValidBlockHeight!);saveReceipt({signature:expected,action:prepared.action,wallet:prepared.wallet,operationId:prepared.id,network,genesisHash:identity.genesisHash,chainStatus:'pending',projectionStatus:'pending',submittedAt:new Date().toISOString(),lastValidBlockHeight:prepared.lastValidBlockHeight,signedTransactionBase64,bond:prepared.bond,account:prepared.account});});
 if(already)return operationStatus(prepared.id);
 try{const returned=await rpc<string>('sendTransaction',[signedTransactionBase64,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:1}]);if(returned!==expected)throw new Error('Unexpected RPC signature');}
 catch(error){if(error instanceof AppError&&error.definitive){transactionSync(()=>{setPreparedStatus(prepared.id,'error',error.message);updateReceipt(expected,{chainStatus:'error',projectionStatus:'complete',error:error.message});});throw error;}throw new AppError('UNKNOWN_STATUS','Submission response was interrupted. Recover the same operation identifier; no second signature is needed.',503);}
 try{await awaitConfirmation(expected);}catch(error){if(error instanceof AppError&&error.code==='TRANSACTION_FAILED'){transactionSync(()=>{setPreparedStatus(prepared.id,'error',error.message);updateReceipt(expected,{chainStatus:'error',projectionStatus:'complete',error:error.message});});throw error;}throw new AppError('UNKNOWN_STATUS','Confirmation is unavailable. Recover the stored operation without re-signing.',503);}
 return operationStatus(prepared.id);
}

async function recoverPrepared(id:string){try{return await operationStatus(id);}catch(error){if(error instanceof AppError&&error.code==='TRANSACTION_FAILED')throw error;throw new AppError('UNKNOWN_STATUS','A signed receipt exists; recovery could not complete. Retain the same operation identifier.',503);}}
