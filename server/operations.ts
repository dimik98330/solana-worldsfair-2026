import {createHash} from 'node:crypto';
import {AppError,transactionStatus} from './rpc.ts';
import {findPrepared,setPreparedStatus,completePreparedProjection,type PreparedRecord} from './prepared.ts';
import {applyConfirmedEffect} from './effects.ts';
import {journalRead,journalWrite,journalValues,updateReceipt} from './journal.ts';
import {transactionSync} from './storage.ts';
import {canonicalJson,normalizeRequest,actionNames} from './request-contract.ts';
import {chainIdentity} from './chain-identity.ts';
export interface Operation {id:string;digest:string;action:string;role:string;status:string;signature?:string;error?:string;createdAt:string;wallet?:string;bond?:string;params?:Record<string,unknown>;metadata?:Record<string,unknown>;chainStatus?:string;projectionStatus?:'pending'|'complete';lease?:{owner:string;expiresAt:number};programRelease?:import('./prepared.ts').ReviewedProgram;}
export function findOperation(id:string){return /^[a-zA-Z0-9_-]{8,100}$/.test(id)?journalRead<Operation>('operations',id):null;}
export function beginOperation(id:string,action:string,role:string,params:unknown){
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new AppError('INVALID_OPERATION_ID','Invalid recovery ID');
 return transactionSync(()=>{if(findPrepared(id))throw new AppError('RECOVERY_ID_CONFLICT','This recovery identifier belongs to a wallet review. Preserve its existing receipt and use its original recovery flow.',409);const digest=createHash('sha256').update(canonicalJson({action,role,params})).digest('hex');const found=findOperation(id);if(found){if(found.digest!==digest){let compatible=false;try{const saved=actionNames.has(action)&&found.params?normalizeRequest({action,bondAddress:found.bond,params:found.params}).params:found.params;compatible=found.action===action&&found.role===role&&saved!==undefined&&canonicalJson(saved)===canonicalJson(params);}catch{}if(!compatible)throw new AppError('OPERATION_CONFLICT','Recovery ID is bound to different action inputs',409);journalWrite('operations',id,{...found,digest});}return {operation:found,new:false};}
 const unresolved=journalValues<Operation>('operations').filter(o=>o.signature&&o.chainStatus!=='error'&&(o.chainStatus!=='confirmed'||o.projectionStatus!=='complete'));if(unresolved.length>=100)throw new AppError('RECOVERY_CAPACITY','Recover unresolved signed operations before creating another intent',409);
 const operation:Operation={id,digest,action,role,status:'preparing',params:params as Record<string,unknown>,createdAt:new Date().toISOString()};journalWrite('operations',id,operation);return {operation,new:true};});
}
export function updateOperation(id:string,change:Partial<Operation>){transactionSync(()=>{const found=findOperation(id);if(found)journalWrite('operations',id,{...found,...change,id:found.id});});}
/** Explicitly resume only unsigned work. A fenced owner cannot relay after replacement. */
export function claimDemoOperation(id:string,action:string,role:string,params:unknown){return transactionSync(()=>{
 const existing=beginOperation(id,action,role,params),operation=existing.operation;
 if(operation.signature||operation.status==='error'||(operation.lease&&operation.lease.expiresAt>Date.now()))return {claimed:false,operation,owner:null};
 const owner=crypto.randomUUID();updateOperation(id,{status:'preparing',error:undefined,lease:{owner,expiresAt:Date.now()+120000}});
 return {claimed:true,operation:findOperation(id)!,owner};
});}
export function assertDemoLease(id:string,owner:string){const current=findOperation(id);if(!current||current.signature||current.lease?.owner!==owner||current.lease.expiresAt<=Date.now())throw new AppError('OPERATION_LEASE_CHANGED','Another process owns this preparation or its lease expired. Recover the same identifier before another send.',409);}
async function reconcile(record:Operation|PreparedRecord,kind:'operations'|'prepared'){
 if(!record.signature)throw new AppError('RECOVERY_METADATA_MISSING','Retain this operation identifier and review its saved metadata',503);
 const result=await transactionStatus(record.signature);
 transactionSync(()=>{if(kind==='prepared')setPreparedStatus(record.id,result.status);else updateOperation(record.id,{status:result.status,chainStatus:result.status,...(result.status==='error'?{projectionStatus:'complete'}:{})});});
 if(result.status==='confirmed'){
  try{if(record.projectionStatus!=='complete')await applyConfirmedEffect(record);}catch{throw new AppError('UNKNOWN_STATUS','The chain receipt is confirmed; local reconciliation remains pending. Recover this same identifier before another signature.',503);}
  transactionSync(()=>{updateReceipt(record.signature!,{projectionStatus:'complete'});if(kind==='prepared')completePreparedProjection(record.id);else updateOperation(record.id,{status:'confirmed',chainStatus:'confirmed',projectionStatus:'complete',error:undefined});});
 }
 return {...result,operationId:record.id,chainStatus:result.status,projectionStatus:result.status==='confirmed'?'complete':result.status==='error'?'complete':'pending'};
}
export async function operationStatus(id:string){
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new AppError('INVALID_OPERATION_ID','Invalid recovery ID');
 const {operation,prepared}=transactionSync(()=>({operation:findOperation(id),prepared:findPrepared(id)}));
 if(operation&&prepared)throw new AppError('RECOVERY_ID_CONFLICT','This legacy identifier belongs to two different operations. Preserve both records and recover any known transaction by its signature; do not sign either action again.',409);
 const record=operation??prepared;if(!record)throw new AppError('OPERATION_NOT_FOUND','No stored operation exists for this ID',404);
 if(operation?.action==='coupon_run')return (await import('./coupon-run.ts')).couponRunStatus(id);
 if(operation?.action==='lifecycle_run')return (await import('./lifecycle-run.ts')).lifecycleRunStatus(id);
 if(operation?.action==='bootstrap'&&operation.metadata?.bootstrapVersion===1){await chainIdentity();const status=(await import('./seed.ts')).bootstrapStatus(id);if(status.signature&&status.status==='confirmed'){const result=await transactionStatus(status.signature);return {...status,...result};}return status;}
 // Even an old locally stored error must be reconciled if a signed reference exists.
 if(record.signature)return reconcile(record,operation?'operations':'prepared');
 if(record.status==='error')return {operationId:id,status:'error',signature:null,error:record.error??'Operation rejected before submission',chainStatus:'not_submitted',projectionStatus:'not_applicable'};
 return {operationId:id,status:record.status??'prepared',signature:null,error:record.error??null,chainStatus:'not_submitted',projectionStatus:'not_applicable',...(operation?{resume:{requiresExplicitRequest:true,canResume:!operation.lease||operation.lease.expiresAt<=Date.now(),availableAfter:operation.lease?new Date(operation.lease.expiresAt).toISOString():null}}:{})};
}
