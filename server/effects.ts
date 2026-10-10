import {finalizeAdminEffect, adminActions} from './admin.ts';
import {readCatalog, saveCatalog} from './catalog.ts';
import {recordProposal} from './store.ts';
import {AppError} from './rpc.ts';
import {transactionSync} from './storage.ts';
import {programAccount} from './state.ts';
import * as program from '../packages/client/src/program.ts';
import {v2ActionNames} from './v2-contract.ts';
import {compactV2CatalogProjection} from './v2-catalog-projection.ts';

export interface ConfirmedEffect {
  action: string; signature?: string; wallet?: string; bond?: string; params?: Record<string, unknown>; metadata?: Record<string, unknown>;
}
/** Only call after a successful receipt for the exact persisted signed message. */
export async function applyConfirmedEffect(record: ConfirmedEffect) {
  try {
  if(v2ActionNames.has(record.action)){
    if(!record.bond)throw new AppError('RECOVERY_METADATA_MISSING','The confirmed paged instrument address is missing',503);
    const raw=await programAccount(record.bond);if(!raw)throw new AppError('MISSING_REQUIRED_ACCOUNT','The confirmed paged instrument is unavailable',503);
    const bond=program.decodeBondV2(raw.bytes);
    if(await program.deriveBondV2(bond.issuer,bond.seriesId)!==record.bond)throw new AppError('INSTRUMENT_MISMATCH','Paged instrument address disagrees with its on-chain issuer and series');
    if(record.action==='initialize_issue_v2'&&(record.wallet!==bond.issuer||String(record.params?.seriesId)!==String(bond.seriesId)))throw new AppError('INSTRUMENT_MISMATCH','Creation receipt is not bound to the observed paged instrument');
    let holderLabel:{wallet:string;label:string}|undefined;
    if(record.action==='register_holder_v2'&&record.params?.label){
      const wallet=String(record.params.holderWallet),account=await programAccount(await program.deriveHolderV2(record.bond,wallet));
      if(!account)throw new AppError('MISSING_REQUIRED_ACCOUNT','The confirmed paged holder record is unavailable');
      const holder=program.decodeHolderV2(account.bytes);if(holder.bond!==record.bond||holder.wallet!==wallet)throw new AppError('INSTRUMENT_MISMATCH','Holder metadata does not match its confirmed record');
      holderLabel={wallet,label:String(record.params.label)};
    }
    if(record.action==='create_proposal_v2'){
      const id=Number(record.params?.proposalId);if(!Number.isSafeInteger(id)||id<0||id>4294967295)throw new AppError('RECOVERY_METADATA_MISSING','Keep the confirmed proposal identifier',503);
      const account=await programAccount(await program.deriveActionV2(record.bond,3,id));if(!account)throw new AppError('MISSING_REQUIRED_ACCOUNT','The confirmed proposal is unavailable');
      const action=program.decodeActionV2(account.bytes);if(action.bond!==record.bond||action.kind!==3||action.id!==id)throw new AppError('INSTRUMENT_MISMATCH','Proposal projection differs from its on-chain identity');
    }
    transactionSync(()=>{
      const previous=readCatalog(record.bond!);
      if(previous&&(previous.roles.issuer!==bond.issuer||previous.seriesId!==String(bond.seriesId)||previous.settlementMint!==bond.settlementMint))throw new AppError('INSTRUMENT_MISMATCH','Existing catalog identity differs from the confirmed paged instrument');
      const proposalIds=previous?.proposalIds??[];
      saveCatalog(compactV2CatalogProjection({...(previous??{}),protocolVersion:2,seriesId:String(bond.seriesId),bond:record.bond!,name:bond.name,settlementMint:bond.settlementMint,createdAt:previous?.createdAt??new Date().toISOString(),rateBps:bond.rateBps,couponFrequency:bond.couponFrequency,roles:previous?.roles??{issuer:String(bond.issuer)},proposalIds:record.action==='create_proposal_v2'?[...new Set([...proposalIds,String(record.params!.proposalId)])]:proposalIds,complete:bond.state>0,accelerated:previous?.accelerated??false,source:previous?.source??'wallet',...(holderLabel?{holderLabels:{...previous?.holderLabels,[holderLabel.wallet]:holderLabel.label}}:{})}));
    });
    return;
  }
  if (adminActions.has(record.action)) {
    if (!record.wallet) throw new AppError('RECOVERY_METADATA_MISSING', 'Keep this receipt: issuer recovery metadata is missing', 503);
    await finalizeAdminEffect({...record, wallet: record.wallet});
  }
  if (record.action === 'create_vote' && record.bond) {
    if(typeof record.params?.proposalId!=='string'||!/^\d{1,20}$/.test(record.params.proposalId))throw new AppError('RECOVERY_METADATA_MISSING','The confirmed proposal identifier is missing',503);
    transactionSync(()=>{
    recordProposal(record.bond!, record.params!.proposalId as string);
    const item = readCatalog(record.bond!);
    if (item && !item.proposalIds.includes(String(record.params?.proposalId ?? 1))) {
      saveCatalog({...item, proposalIds: [...item.proposalIds, String(record.params?.proposalId ?? 1)]});
    }
    });
  }
  } catch {
    // The signed chain operation already succeeded. A local projection failure is
    // recoverable uncertainty, never permission to sign the financial action again.
    throw new AppError('UNKNOWN_STATUS', 'The chain receipt is confirmed, but workspace reconciliation is incomplete. Recover the existing operation before preparing another signature.', 503, false);
  }
}
