import type { TxRecord } from './types';

// Durable recovery of an unresolved operation. The visible session lock and this
// key together prevent an accidental second submission across reloads.
export const pendingKey = 'bondtrace.unresolved-operation.v1';

export function restoredTx(): TxRecord | null {
  try {
    const tx = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    return tx && ['pending', 'unknown'].includes(tx.status) && tx.request?.title
      ? { ...tx, status: 'unknown', message: 'A previous operation needs confirmation. Check its status before submitting another.' }
      : null;
  } catch { return null; }
}
