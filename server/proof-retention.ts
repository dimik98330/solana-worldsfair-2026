import {receipt,updateReceipt,boundReceiptFinality,retainedReceiptFinality,type ReceiptRecord} from './journal.ts';
import {transactionSync} from './storage.ts';
import {captureTransactionProof,type TransactionProofResult} from './transaction-proof.ts';
import {rpc} from './rpc.ts';
import {chainIdentity} from './chain-identity.ts';

type Capture=(input:Parameters<typeof captureTransactionProof>[0])=>Promise<TransactionProofResult>;
const capture:Capture=async input=>{
 const before=await chainIdentity();
 if(before.genesisHash!==input.genesisHash)throw new Error('Proof chain context changed');
 const result=await captureTransactionProof(input,(method,params)=>rpc(method,params,4000));
 const after=await chainIdentity();
 if(after.genesisHash!==input.genesisHash)throw new Error('Proof chain context changed');
 return result;
};
/** Optional evidence enrichment cannot turn a confirmed payment into a failed one. */
export async function captureRetainedProof(signature:string,retry=false,reader:Capture=capture){
 try{
  const claimed=transactionSync(()=>{
   const current=receipt(signature);
   if(!current||current.signature!==signature||current.chainStatus!=='confirmed'||!current.genesisHash||current.slot==null)return null;
   const commitment:'confirmed'|'finalized'=boundReceiptFinality(current)?.status==='finalized'?'finalized':'confirmed';
   const prior=current.transactionProof;
   if(prior&&(prior.commitment==='finalized'||commitment==='confirmed'))return null;
   // A newly observed finalization gets one bounded upgrade attempt. A gap does
   // not delete a previously captured confirmed proof or retry on every read.
   if(!retry&&current.proofCapture&&(current.proofCapture.commitment??'confirmed')===commitment)return null;
   const attemptId=crypto.randomUUID(),attemptedAt=new Date().toISOString();
   updateReceipt(signature,{proofCapture:{status:'pending',attemptedAt,attemptId,commitment}});
   return {current,attemptId,attemptedAt,commitment};
  });
  if(!claimed)return;
  let result:TransactionProofResult;
  try{result=await reader({signature,slot:claimed.current.slot!,genesisHash:claimed.current.genesisHash!,commitment:claimed.commitment,...(claimed.current.signedTransactionBase64?{expectedWireBase64:claimed.current.signedTransactionBase64}:{})});}
  catch{result={status:'unavailable',code:'PROOF_CAPTURE_UNAVAILABLE',message:'Execution evidence could not be captured; the retained financial status is unchanged.',attemptedAt:claimed.attemptedAt};}
  transactionSync(()=>{
   const latest=receipt(signature);
   if(!latest||latest.proofCapture?.attemptId!==claimed.attemptId||latest.transactionProof?.commitment==='finalized')return;
   if(latest.chainStatus!=='confirmed'||latest.genesisHash!==claimed.current.genesisHash||latest.slot!==claimed.current.slot||(claimed.commitment==='finalized'&&boundReceiptFinality(latest)?.status!=='finalized')){updateReceipt(signature,{proofCapture:{status:'unavailable',commitment:claimed.commitment,attemptedAt:claimed.attemptedAt,code:'PROOF_CONTEXT_CHANGED',message:'Receipt context changed during capture; no proof was attached.'}});return;}
   if(result.status==='captured'){
    const proof=result.proof;
    if(proof.signature!==signature||proof.slot!==latest.slot||proof.genesisHash!==latest.genesisHash||proof.commitment!==claimed.commitment
      ||(claimed.commitment==='finalized'&&(proof.schemaVersion!==2||proof.source!=='retained-finalized-rpc-transaction'||proof.provenance.source!=='live-rpc'||proof.provenance.method!=='getTransaction'||proof.provenance.requestedCommitment!=='finalized'))){
      updateReceipt(signature,{proofCapture:{status:'unavailable',commitment:claimed.commitment,attemptedAt:claimed.attemptedAt,code:'PROOF_CONTEXT_MISMATCH',message:'Captured proof does not match its requested receipt and commitment; prior evidence is preserved.'}});return;
    }
    updateReceipt(signature,{transactionProof:proof,proofCapture:{status:'captured',commitment:claimed.commitment,attemptedAt:claimed.attemptedAt}});
   }
   else updateReceipt(signature,{proofCapture:{status:'unavailable',commitment:claimed.commitment,attemptedAt:result.attemptedAt,code:result.code,message:result.message}});
  });
 }catch{/* Archiving is optional; normal receipt/projection recovery remains authoritative. */}
}
export function publicExecutionProof(record:ReceiptRecord|null){
 if(!record)return null;
 const proof=record.transactionProof??null,capture=record.proofCapture;
 return {proof,capture:capture?{status:capture.status,attemptedAt:capture.attemptedAt,commitment:capture.commitment??'confirmed',...(capture.code?{code:capture.code}:{}),...(capture.message?{message:capture.message}:{})}:null,
  finality:retainedReceiptFinality(record),provenance:proof?{source:'retained-observation' as const,method:'getTransaction' as const,commitment:proof.commitment,observedAt:proof.capturedAt,slot:proof.slot,signature:proof.signature,genesisHash:proof.genesisHash,schemaVersion:proof.schemaVersion}:null,
  matchesStoredReceipt:Boolean(proof&&record.chainStatus==='confirmed'&&proof.signature===record.signature&&proof.slot===record.slot&&proof.genesisHash===record.genesisHash),scope:'retained-observation-not-fresh-rpc-attestation'};
}
