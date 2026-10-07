import {finalizeAdminEffect, adminActions} from './admin.ts';
import {readCatalog, saveCatalog} from './catalog.ts';
import {recordProposal} from './store.ts';
import {AppError} from './rpc.ts';
import {transactionSync} from './storage.ts';

export interface ConfirmedEffect {
  action: string; wallet?: string; bond?: string; params?: Record<string, unknown>; metadata?: Record<string, unknown>;
}
/** Only call after a successful receipt for the exact persisted signed message. */
export async function applyConfirmedEffect(record: ConfirmedEffect) {
  try {
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
