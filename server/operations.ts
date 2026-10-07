import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {localDir} from './config.ts';
import {AppError,transactionStatus} from './rpc.ts';
import {jsonWrite,recordProposal} from './store.ts';
import {findPrepared} from './prepared.ts';
export interface Operation {id:string;digest:string;action:string;role:string;status:string;signature?:string;error?:string;createdAt:string;}
const file=path.join(localDir,'operations.json');
const all=():Operation[]=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
export function beginOperation(id:string,action:string,role:string,params:unknown){
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new AppError('INVALID_OPERATION_ID','Invalid recovery ID');
  const digest=createHash('sha256').update(JSON.stringify({action,role,params})).digest('hex');const previous=all();const found=previous.find(o=>o.id===id);
  if(found){if(found.digest!==digest)throw new AppError('OPERATION_CONFLICT','Recovery ID is bound to different action inputs',409);return {operation:found,new:false};}
  const operation:Operation={id,digest,action,role,status:'preparing',createdAt:new Date().toISOString()};jsonWrite(file,[operation,...previous].slice(0,100));return {operation,new:true};
}
export function updateOperation(id:string,change:Partial<Operation>){const previous=all(),found=previous.find(o=>o.id===id);if(found){Object.assign(found,change);jsonWrite(file,previous);}}
export async function operationStatus(id:string){if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new AppError('INVALID_OPERATION_ID','Invalid recovery ID');const record=all().find(o=>o.id===id)??findPrepared(id);if(!record)throw new AppError('OPERATION_NOT_FOUND','No stored operation exists for this ID',404);if(record.status==='error')return {operationId:id,status:'error',signature:record.signature??null,error:record.error??'Operation rejected'};if(record.signature){const result=await transactionStatus(record.signature);if(result.status==='confirmed'&&record.action==='create_vote'&&'bond' in record&&record.bond)recordProposal(record.bond,String(record.params?.proposalId??1));return {...result,operationId:id};}return {operationId:id,status:record.status??'prepared',signature:null,error:record.error??null};}
