import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {getTransactionDecoder} from '@solana/kit';
import {localDir} from './config.ts';
import {AppError} from './rpc.ts';
import {jsonWrite} from './store.ts';
const file=path.join(localDir,'prepared.json');
export interface PreparedRecord {id:string;action:string;wallet:string;expiresAt:number;lastValidBlockHeight?:number;status?:string;error?:string;bond?:string;account?:string;params?:Record<string,unknown>;signature?:string;}
function records():PreparedRecord[]{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];}
function identity(base64:string){const transaction=getTransactionDecoder().decode(Buffer.from(base64,'base64'));return createHash('sha256').update(Buffer.from(transaction.messageBytes)).digest('hex');}
export function findPrepared(id:string){return records().find(record=>record.id===id)??null;}
export function rememberPrepared(base64:string,details:Omit<PreparedRecord,'id'|'expiresAt'>){const id=identity(base64);const previous=records();const existing=previous.find(r=>r.id===id);if(existing?.signature)return id;const value={...details,id,status:'prepared',expiresAt:Date.now()+120_000};const retained=previous.filter(r=>r.id!==id&&(r.signature||r.expiresAt>Date.now()));if(retained.length>=100&&retained.every(r=>r.signature&&r.status!=='confirmed'&&r.status!=='error'))throw new AppError('RECOVERY_CAPACITY','Resolve previous submitted operations before preparing more',409);jsonWrite(file,[value,...retained.filter(r=>r.signature&&r.status!=='confirmed'&&r.status!=='error'),...retained.filter(r=>!r.signature||r.status==='confirmed'||r.status==='error').slice(0,100)]);return id;}
export function requirePrepared(base64:string){const id=identity(base64),record=records().find(r=>r.id===id);if(!record)throw new AppError('UNRECOGNIZED_TRANSACTION','Only the exact transaction prepared by BondTrace may be relayed',403);if(record.expiresAt<Date.now()&&!record.signature)throw new AppError('PREPARATION_EXPIRED','Refresh the preview; the old transaction is no longer relayed');return record;}
export function completePrepared(id:string,signature:string){const previous=records();const record=previous.find(r=>r.id===id);if(record){record.signature=signature;record.status='pending';jsonWrite(file,previous);}}
export function setPreparedStatus(id:string,status:string,error?:string){const previous=records();const record=previous.find(r=>r.id===id);if(record){record.status=status;if(error)record.error=error;jsonWrite(file,previous);}}
