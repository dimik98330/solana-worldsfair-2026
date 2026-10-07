import {rpcUrl,network} from './config.ts';
import {localDir} from './config.ts';
import fs from 'node:fs';
import path from 'node:path';
import {jsonWrite,activities} from './store.ts';
import {getSignatureFromTransaction, getTransactionDecoder} from '@solana/kit';
export class AppError extends Error { constructor(readonly code:string,message:string,readonly status=400,readonly retryable=false,readonly definitive=false){super(message);} }
let next=0;
export async function rpc<T=any>(method:string,params:unknown[]=[]):Promise<T>{
  let response:Response;try{response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++next,method,params}),signal:AbortSignal.timeout(18000)});}catch{throw new AppError('RPC_UNAVAILABLE','The configured test RPC did not respond',503,true);}
  if(!response.ok)throw new AppError('RPC_UNAVAILABLE',`RPC returned HTTP ${response.status}`,503,response.status>=500);
  const result=await response.json() as {error?:{code?:number;message:string;data?:{err?:unknown}};result:T};
  if(result.error)throw new AppError('RPC_ERROR',result.error.message,400,false,result.error.code===-32002&&result.error.data?.err!=null);
  if(!('result' in result))throw new AppError('RPC_INVALID','RPC response is missing result',503);
  return result.result;
}
export async function account(key:string){const result=await rpc('getAccountInfo',[key,{encoding:'base64',commitment:'confirmed'}]);return {slot:result.context.slot,value:result.value};}
export async function chainClock(){const {value}=await account('SysvarC1ock11111111111111111111111111111111');if(!value)throw new AppError('CLOCK_UNAVAILABLE','Chain clock unavailable',503);const data=Buffer.from(value.data[0],'base64');if(data.length<40)throw new AppError('CLOCK_INVALID','Invalid Clock account',503);return {slot:data.readBigUInt64LE(0),timestamp:data.readBigInt64LE(32)};}
export function explorer(signature:string){return network==='devnet'?`https://explorer.solana.com/tx/${signature}?cluster=devnet`:`https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;}
export function signatureOf(base64:string){try{return String(getSignatureFromTransaction(getTransactionDecoder().decode(Buffer.from(base64,'base64'))));}catch{throw new AppError('INVALID_TRANSACTION','Signed transaction bytes are invalid');}}
const lifetimeFile=path.join(localDir,'lifetimes.json');
export function rememberLifetime(signature:string,lastValidBlockHeight:number){const values:Record<string,number>=fs.existsSync(lifetimeFile)?JSON.parse(fs.readFileSync(lifetimeFile,'utf8')):{};values[signature]=lastValidBlockHeight;jsonWrite(lifetimeFile,values);}
export async function transactionStatus(signature:string){if(!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature))throw new AppError('INVALID_SIGNATURE','Invalid transaction signature');const result=await rpc('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);const value=result.value[0];const observed=activities().find(item=>item.signature===signature&&item.status==='confirmed');if(!value&&observed)return {signature,status:'confirmed',slot:observed.slot??null,error:null,explorerUrl:explorer(signature),verification:'recorded-confirmation',observedAt:observed.time};let status=value?.err?'error':value?.confirmationStatus==='confirmed'||value?.confirmationStatus==='finalized'?'confirmed':'pending';if(!value&&fs.existsSync(lifetimeFile)){const last:Record<string,number>=JSON.parse(fs.readFileSync(lifetimeFile,'utf8'));if(last[signature]!==undefined){const height=await rpc<number>('getBlockHeight',[{commitment:'finalized'}]);if(height>last[signature])status='unknown';}}return {signature,status,slot:value?.slot??null,error:value?.err??null,explorerUrl:explorer(signature),verification:'live-rpc',...(status==='unknown'?{message:'The lifetime passed, but an unavailable receipt does not prove the transaction never executed. Reconcile the action before any retry.'}:{})};}
export async function awaitConfirmation(signature:string,maxMs=20000){const started=Date.now();while(Date.now()-started<maxMs){const status=await transactionStatus(signature);if(status.status==='error')throw new AppError('TRANSACTION_FAILED',JSON.stringify(status.error));if(status.status==='expired')return status;if(status.status==='confirmed')return status;await new Promise(resolve=>setTimeout(resolve,650));}return {signature,status:'pending',slot:null,explorerUrl:explorer(signature)};}
