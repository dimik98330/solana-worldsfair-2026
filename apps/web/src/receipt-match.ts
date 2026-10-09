import type { Activity } from './types';

export interface PaymentSelection { wallet: string; units: string; amountMinor: string; claimed: boolean; kind: 'coupon' | 'principal'; couponId?: string; snapshotAddress: string; recordAt?: string; paymentAt?: string; unitAmountMinor?: string }
type Balance = { accountIndex: number; mint: string; owner?: string | null; uiTokenAmount?: { amount: string }; amount?: string };
export interface PublicTransaction { slot: number; blockTime?: number | null; meta: { err: unknown; preTokenBalances?: Balance[]; postTokenBalances?: Balance[] }; transaction: { signatures: string[]; message: { accountKeys: (string | { pubkey: string })[] } } }

/** Exact beneficiary + mint + snapshot + integer delta. Never map a receipt by row order. */
export function matchesPayment(tx: PublicTransaction, receipt: Activity, selection: PaymentSelection, mint: string): boolean {
  if (!tx?.meta || !Array.isArray(tx.transaction?.signatures) || !Array.isArray(tx.transaction?.message?.accountKeys)) return false;
  if (tx.meta.err !== null || !tx.transaction.signatures.includes(receipt.signature)) return false;
  if (receipt.slot != null && receipt.slot !== tx.slot) return false;
  const keys = tx.transaction.message.accountKeys.map(key => typeof key === 'string' ? key : key.pubkey);
  if (!selection.snapshotAddress || !keys.includes(selection.snapshotAddress)) return false;
  const expected = selection.kind === 'coupon' ? ['claim_coupon', 'settle_coupon'] : ['redeem_principal'];
  if (!expected.includes(receipt.kind)) return false;
  const pre = tx.meta.preTokenBalances ?? [], post = tx.meta.postTokenBalances ?? [];
  let delta = 0n;
  try {
    for (const item of post.filter(item => item.mint === mint && item.owner === selection.wallet)) {
      const before = pre.find(old => old.accountIndex === item.accountIndex && old.mint === mint);
      delta += BigInt(item.uiTokenAmount?.amount ?? item.amount ?? '0') - BigInt(before?.uiTokenAmount?.amount ?? before?.amount ?? '0');
    }
    return delta > 0n && delta === BigInt(selection.amountMinor);
  } catch { return false; }
}

export function paymentReceipts(activity: Activity[], selection: PaymentSelection): Activity[] {
  const kinds = selection.kind === 'coupon' ? ['claim_coupon', 'settle_coupon'] : ['redeem_principal'];
  return activity.filter(item => kinds.includes(item.kind) && ['confirmed', 'finalized'].includes(item.status));
}

export function maySignForHolder(activeWallet:string|undefined, viewedWallet:string, usable:boolean):boolean {
  return Boolean(usable && activeWallet && activeWallet === viewedWallet);
}
