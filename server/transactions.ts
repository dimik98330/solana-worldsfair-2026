import fs from 'node:fs';
import path from 'node:path';
import {appendTransactionMessageInstructions,compileTransaction,createKeyPairSignerFromBytes,createNoopSigner,createTransactionMessage,generateKeyPairSigner,getBase64EncodedWireTransaction,getTransactionEncoder,getBase58Decoder,getAddressEncoder,partiallySignTransactionMessageWithSigners,pipe,setTransactionMessageComputeUnitLimit,setTransactionMessageFeePayer,setTransactionMessageFeePayerSigner,setTransactionMessageLifetimeUsingBlockhash,type Instruction,type KeyPairSigner,address} from '@solana/kit';
import {localDir,network} from './config.ts';
import {AppError,awaitConfirmation,explorer,rpc,signatureOf,rememberLifetime} from './rpc.ts';
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
  const lifetime={blockhash:latest.value.blockhash,lastValidBlockHeight:BigInt(latest.value.lastValidBlockHeight)};
  const payer=signers.find(s=>s.address===payerAddress)??createNoopSigner(address(payerAddress));
  let message:any=pipe(createTransactionMessage({version}),m=>setTransactionMessageFeePayerSigner(payer,m),m=>setTransactionMessageLifetimeUsingBlockhash(lifetime,m),m=>appendTransactionMessageInstructions(instructions,m),m=>setTransactionMessageComputeUnitLimit(1_400_000,m));
  // Version 0 is an explicit localnet/wallet compatibility path. Simulation sizes its CU cap.
  let signed=await partiallySignTransactionMessageWithSigners(message);
  let wire=Buffer.from(getTransactionEncoder().encode(signed));
  let simulation=await rpc('simulateTransaction',[wire.toString('base64'),{encoding:'base64',sigVerify:false,commitment:'confirmed'}]);
  if(simulation.value.err){const logs=String(simulation.value.logs?.join(' ')??'');const friendly:Record<string,string>={VotingClosed:'The voting window has closed. No ballot was submitted.',TooEarly:'This action is not due on the chain clock yet.',RecordDateLocked:'Capture the due record date before transferring bonds.',Matured:'This issue has reached maturity; transfers and new proposals are closed.',AlreadyClaimed:'This payment was already claimed. No second payment was submitted.',AlreadyVoted:'This holder already voted on the proposal.',InsufficientReserve:'The settlement reserve does not cover this action.',UnauthorizedIssuer:'Only the issue issuer may perform this action.'};const code=Object.keys(friendly).find(name=>logs.includes('Error Code: '+name+'.'));throw new AppError(code?code.replace(/([a-z])([A-Z])/g,'$1_$2').toUpperCase():'SIMULATION_FAILED',code?friendly[code]:'The chain simulation rejected this action. Refresh the current state and review the inputs.');}
  const used=BigInt(simulation.value.unitsConsumed??0);const limit=Math.min(1_400_000,Math.max(10_000,Math.ceil(Number(used)*1.2)+1000));
  message=setTransactionMessageComputeUnitLimit(limit,message);signed=await partiallySignTransactionMessageWithSigners(message);wire=Buffer.from(getTransactionEncoder().encode(signed));
  const maximum=version===1?4096:1232;if(wire.length>maximum)throw new AppError('TRANSACTION_TOO_LARGE',`Transaction ${wire.length} bytes exceeds ${maximum}`);
  const fee=await rpc('getFeeForMessage',[Buffer.from(signed.messageBytes).toString('base64'),{commitment:'confirmed'}]);
  return {transactionBase64:wire.toString('base64'),lastValidBlockHeight:Number(lifetime.lastValidBlockHeight),feeLamports:String(fee.value??0),simulation:{success:true,computeUnits:used.toString()},bytes:wire.length,version};
}
export async function execute(instructions:Instruction[],actor:KeyPairSigner,kind:string,additionalSigners:KeyPairSigner[]=[],accountAddress?:string,onSubmitted?:(signature:string)=>void){
  const prepared=await buildTransaction(instructions,String(actor.address),[actor,...additionalSigners],0);
  // Builders carry additional mint signers where necessary; signing remains inside generated test harness.
  const signature=signatureOf(prepared.transactionBase64);
  rememberLifetime(signature,prepared.lastValidBlockHeight);
  onSubmitted?.(signature);
  recordActivity({signature,time:new Date().toISOString(),kind,status:'pending',explorerUrl:explorer(signature),account:accountAddress});
  try{const returned=await rpc<string>('sendTransaction',[prepared.transactionBase64,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:1}]);if(returned!==signature)throw new Error('Unexpected RPC signature');}catch(error){if(error instanceof AppError&&error.definitive){recordActivity({signature,time:new Date().toISOString(),kind,status:'error',explorerUrl:explorer(signature),account:accountAddress});throw error;}throw new AppError('UNKNOWN_STATUS','Submission response was interrupted. Recover the saved signature before preparing another transaction',503,false);}
  let result;try{result=await awaitConfirmation(signature);}catch(error){if(error instanceof AppError&&error.code==='TRANSACTION_FAILED')throw error;throw new AppError('UNKNOWN_STATUS','Confirmation could not be read. Recover the saved signature before preparing another transaction',503,false);}
  recordActivity({signature,time:new Date().toISOString(),kind,status:result.status,slot:result.slot,explorerUrl:explorer(signature),account:accountAddress});
  return {...result,simulation:prepared.simulation,bytes:prepared.bytes};
}
export async function submitPrepared(signedTransactionBase64:string){
  if(typeof signedTransactionBase64!=='string'||signedTransactionBase64.length>12_000||!/[A-Za-z0-9+/]/.test(signedTransactionBase64))throw new AppError('INVALID_TRANSACTION','Invalid encoded transaction');
  const prepared=requirePrepared(signedTransactionBase64);
  const expected=signatureOf(signedTransactionBase64);
  if(prepared.signature)return {...await awaitConfirmation(prepared.signature),operationId:prepared.id,explorerUrl:explorer(prepared.signature)};
  completePrepared(prepared.id,expected);
  if(prepared.lastValidBlockHeight!==undefined)rememberLifetime(expected,prepared.lastValidBlockHeight);
  const signature=expected;
  recordActivity({signature,time:new Date().toISOString(),kind:prepared.action,status:'pending',explorerUrl:explorer(signature),account:prepared.account});
  try{const returned=await rpc<string>('sendTransaction',[signedTransactionBase64,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:1}]);if(returned!==expected)throw new Error('Unexpected RPC signature');}catch(error){if(error instanceof AppError&&error.definitive){setPreparedStatus(prepared.id,'error',error.message);recordActivity({signature,time:new Date().toISOString(),kind:prepared.action,status:'error',explorerUrl:explorer(signature),account:prepared.account});throw error;}throw new AppError('UNKNOWN_STATUS','Submission response was interrupted. Recover this operation ID before preparing another transaction',503,false);}
  let result;try{result=await awaitConfirmation(signature);}catch(error){if(error instanceof AppError&&error.code==='TRANSACTION_FAILED'){setPreparedStatus(prepared.id,'error',error.message);throw error;}throw new AppError('UNKNOWN_STATUS','Confirmation could not be read. Recover this operation ID before preparing another transaction',503,false);}
  setPreparedStatus(prepared.id,result.status);
  recordActivity({signature,time:new Date().toISOString(),kind:prepared.action,status:result.status,slot:result.slot,explorerUrl:explorer(signature),account:prepared.account});
  if(result.status==='confirmed'&&prepared.action==='create_vote'&&prepared.bond)recordProposal(prepared.bond,String(prepared.params?.proposalId??1));
  return {...result,operationId:prepared.id,explorerUrl:explorer(signature)};
}
