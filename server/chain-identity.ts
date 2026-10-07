import path from 'node:path';
import {address} from '@solana/kit';
import {network,rpcUrl,localDir} from './config.ts';
import {PROGRAM_ID} from '../packages/client/src/program.ts';
import {rpc,AppError} from './rpc.ts';
import {readJson,writeJson,transactionSync} from './storage.ts';
export interface ChainIdentity {network:string;genesisHash:string;programId:string;rpcUrl:string;observedAt:string;}
const file=path.join(localDir,'chain-identity.json');
const devnetGenesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
/** Recheck on each financial request; a changed ledger never inherits old confirmations. */
export async function chainIdentity():Promise<ChainIdentity>{
  const value=await rpc<unknown>('getGenesisHash');
  if(typeof value!=='string')throw new AppError('NETWORK_IDENTITY_UNAVAILABLE','The RPC did not return a valid chain identity',503,true);
  try{address(value);}catch{throw new AppError('NETWORK_IDENTITY_UNAVAILABLE','The RPC chain identity is malformed',503,true);}
  if(network==='devnet'&&value!==devnetGenesis)throw new AppError('NETWORK_MISMATCH','The configured RPC is not the permitted devnet cluster',409);
  return transactionSync(()=>{
    const prior=readJson<ChainIdentity|null>(file,null);
    if(prior&&(prior.network!==network||prior.genesisHash!==value||prior.programId!==PROGRAM_ID))throw new AppError('CHAIN_IDENTITY_CHANGED','The test ledger changed. Preserve existing receipts and use a separate workspace namespace before signing.',409);
    const current={network,genesisHash:value,programId:String(PROGRAM_ID),rpcUrl,observedAt:new Date().toISOString()};
    if(!prior)writeJson(file,current);return current;
  });
}
