import path from 'node:path';
import {localDir,network} from './config.ts';
import {readJson,writeJson,listDocuments,transactionSync} from './storage.ts';

export interface ReceiptRecord {
  signature:string; action:string; bond?:string; account?:string; wallet?:string; operationId?:string;
  network:string; genesisHash:string|null; chainStatus:'pending'|'confirmed'|'error'|'unknown';
  projectionStatus:'pending'|'complete'; submittedAt:string; observedAt?:string; slot?:number|null;
  lastValidBlockHeight?:number; signedTransactionBase64?:string; error?:string;
  verification?:'live-rpc'|'recorded-confirmation'|'legacy-unbound';
}
const signaturePattern=/^[1-9A-HJ-NP-Za-km-z]{60,100}$/;
function receiptPath(signature:string){if(!signaturePattern.test(signature))throw new Error('Invalid receipt identifier');return path.join(localDir,'receipts',signature+'.json');}
let migrating=false;
/** Public legacy documents are archived; new records are individually addressable. */
export function migrateJournal(){
  if(migrating)return;migrating=true;
  try{transactionSync(()=>{
    const marker=path.join(localDir,'journal-migration.json');if(readJson(marker,null))return;
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
export function receipts(){migrateJournal();return listDocuments('receipts').map(file=>readJson<ReceiptRecord|null>(file,null)).filter((value):value is ReceiptRecord=>Boolean(value));}
export function journalPath(group:'prepared'|'operations',id:string){const pattern=group==='prepared'?/^[a-f0-9]{64}$/:/^[a-zA-Z0-9_-]{8,100}$/;if(!pattern.test(id))throw new Error('Invalid journal identifier');return path.join(localDir,group,id+'.json');}
export function journalRead<T>(group:'prepared'|'operations',id:string){migrateJournal();return readJson<T|null>(journalPath(group,id),null);}
export function journalWrite<T>(group:'prepared'|'operations',id:string,value:T){migrateJournal();writeJson(journalPath(group,id),value);}
export function journalValues<T>(group:'prepared'|'operations'){migrateJournal();return listDocuments(group).map(file=>readJson<T|null>(file,null)).filter((value):value is T=>value!==null);}
