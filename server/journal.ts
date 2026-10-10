import path from 'node:path';
import {localDir,network} from './config.ts';
import {readJson,writeJson,readDocuments,transactionSync} from './storage.ts';

export type FinalityLevel='processed'|'confirmed'|'finalized';
/** A timestamped RPC observation, separate from the servicing/business result. */
export interface FinalityObservation {
  schemaVersion:1; signature:string; status:FinalityLevel|null;
  source:'live-rpc'|'retained-observation'|'legacy-unknown';
  observedAt:string|null; slot:number|null; contextSlot:number|null; genesisHash:string|null;
}
export interface ReceiptRecord {
  signature:string; action:string; bond?:string; account?:string; wallet?:string; operationId?:string;
  network:string; genesisHash:string|null; chainStatus:'pending'|'confirmed'|'error'|'unknown';
  projectionStatus:'pending'|'complete'; submittedAt:string; observedAt?:string; slot?:number|null;
  lastValidBlockHeight?:number; signedTransactionBase64?:string; error?:string;
  verification?:'live-rpc'|'recorded-confirmation'|'legacy-unbound';
  finality?:FinalityObservation;
  programRelease?: {programId:string;sha256:string;genesisHash:string};
  transactionProof?:import('./transaction-proof.ts').TransactionProof;
  proofCapture?:{status:'pending'|'captured'|'unavailable';attemptedAt:string;attemptId?:string;commitment?:'confirmed'|'finalized';code?:string;message?:string};
}
/** Legacy receipts never infer a commitment level from business confirmation. */
export function boundReceiptFinality(record:ReceiptRecord):FinalityObservation|null{
  const value=record.finality,integer=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
  if(!value||value.schemaVersion!==1||value.signature!==record.signature||!['processed','confirmed','finalized',null].includes(value.status)
    ||!['live-rpc','retained-observation'].includes(value.source)||typeof value.observedAt!=='string'||!Number.isFinite(Date.parse(value.observedAt))
    ||!integer(value.slot)||value.slot!==record.slot||!integer(value.contextSlot)||value.contextSlot!<value.slot!
    ||!value.genesisHash||value.genesisHash!==record.genesisHash)return null;
  if(record.chainStatus==='confirmed'&&!['confirmed','finalized'].includes(value.status??''))return null;
  return value;
}
export function retainedReceiptFinality(record:ReceiptRecord):FinalityObservation{
  const observation=boundReceiptFinality(record);
  if(observation)return {...observation,source:'retained-observation'};
  return {schemaVersion:1,signature:record.signature,status:null,source:'legacy-unknown',observedAt:null,
    slot:Number.isSafeInteger(record.slot)&&record.slot!>=0?record.slot!:null,contextSlot:null,genesisHash:record.genesisHash};
}
const signaturePattern=/^[1-9A-HJ-NP-Za-km-z]{60,100}$/;
function receiptPath(signature:string){if(!signaturePattern.test(signature))throw new Error('Invalid receipt identifier');return path.join(localDir,'receipts',signature+'.json');}
let migrating=false;
/** Public legacy documents are archived; new records are individually addressable. */
export function migrateJournal(){
  if(migrating)return;
  // Re-read the persisted marker through the normal namespace/JSON guards.
  // Completed migrations need no writer lock on every receipt/status read.
  // There is deliberately no cached marker or TTL across calls.
  const marker=path.join(localDir,'journal-migration.json');if(readJson(marker,null))return;
  migrating=true;
  try{transactionSync(()=>{
    // Another process may have completed the atomic import after the first read.
    if(readJson(marker,null))return;
    for(const [group,pattern]of [['prepared',/^[a-f0-9]{64}$/],['operations',/^[a-zA-Z0-9_-]{8,100}$/]] as const){
      const values=readJson<Record<string,unknown>[]>(path.join(localDir,group+'.json'),[]);
      if(!Array.isArray(values))throw new Error('Legacy journal must contain an array');
      for(const value of values){if(typeof value.id!=='string'||!pattern.test(value.id))throw new Error('Legacy journal contains an invalid identifier');const file=path.join(localDir,group,value.id+'.json');if(!readJson(file,null))writeJson(file,value);}
    }
    const activity=readJson<Record<string,unknown>[]>(path.join(localDir,'activity.json'),[]);
    if(!Array.isArray(activity))throw new Error('Legacy activity must contain an array');
    for(const item of activity){
      if(typeof item.signature!=='string'||!signaturePattern.test(item.signature))throw new Error('Legacy activity contains an invalid signature');
      const file=receiptPath(item.signature);if(readJson(file,null))continue;
      writeJson(file,{signature:item.signature,action:String(item.kind??'legacy'),network,genesisHash:null,chainStatus:item.status==='confirmed'?'confirmed':'unknown',projectionStatus:'pending',submittedAt:String(item.time??''),observedAt:item.status==='confirmed'&&typeof item.time==='string'?item.time:undefined,slot:typeof item.slot==='number'&&Number.isSafeInteger(item.slot)?item.slot:null,bond:typeof item.bond==='string'?item.bond:undefined,account:typeof item.account==='string'?item.account:undefined,verification:'legacy-unbound'} satisfies ReceiptRecord);
    }
    writeJson(marker,{schemaVersion:1,migratedAt:new Date().toISOString(),legacyDocumentsPreserved:true});
  });}finally{migrating=false;}
}
export function receipt(signature:string):ReceiptRecord|null{migrateJournal();return readJson<ReceiptRecord|null>(receiptPath(signature),null);}
export function saveReceipt(value:ReceiptRecord){migrateJournal();writeJson(receiptPath(value.signature),value);}
export function updateReceipt(signature:string,change:Partial<ReceiptRecord>){return transactionSync(()=>{const prior=receipt(signature);if(!prior)return null;const next={...prior,...change,signature:prior.signature};saveReceipt(next);return next;});}
export function receipts(){migrateJournal();return readDocuments<ReceiptRecord|null>('receipts').filter((value):value is ReceiptRecord=>Boolean(value));}
export function journalPath(group:'prepared'|'operations',id:string){const pattern=group==='prepared'?/^[a-f0-9]{64}$/:/^[a-zA-Z0-9_-]{8,100}$/;if(!pattern.test(id))throw new Error('Invalid journal identifier');return path.join(localDir,group,id+'.json');}
export function journalRead<T>(group:'prepared'|'operations',id:string){migrateJournal();return readJson<T|null>(journalPath(group,id),null);}
export function journalWrite<T>(group:'prepared'|'operations',id:string,value:T){migrateJournal();writeJson(journalPath(group,id),value);}
export function journalValues<T>(group:'prepared'|'operations'){migrateJournal();return readDocuments<T|null>(group).filter((value):value is T=>value!==null);}
