export type DemoRole = 'issuer' | 'investor1' | 'investor2' | 'investor3';
export type View = 'overview' | 'registry' | 'payments' | 'portfolio' | 'voting';
export type ActionName = 'capture_coupon' | 'claim_coupon' | 'begin_redemption' | 'redeem_principal' | 'create_vote' | 'cast_vote' | 'transfer_bonds' | 'fund_vault';
export type TxStatus = 'review' | 'preparing' | 'signing' | 'pending' | 'confirmed' | 'error' | 'cancelled' | 'unknown';
export interface Instrument {
  address: string; name: string; symbol: string; issuer: string; bondMint: string; settlementMint: string;
  faceValueMinor: string; rateBps: number; couponFrequency: number; status: 'draft' | 'active' | 'redeeming' | 'redeemed';
  issuedSupply: string; redeemedSupply: string; recordAt: string; paymentAt: string; maturityAt: string; vaultBalanceMinor: string;
}
export interface Holder { wallet: string; label: string; units: string }
export interface Entitlement { wallet: string; units: string; amountMinor: string; claimed: boolean }
export interface Coupon {
  id: string; snapshotAddress: string; recordAt: string; paymentAt: string; recordSlot: string | number;
  totalMinor: string; paidMinor: string; status: 'scheduled' | 'recorded' | 'funded' | 'completed'; entitlements: Entitlement[];
}
export interface Redemption { snapshotAddress: string; totalMinor: string; paidMinor: string; entitlements: Entitlement[] }
export interface Proposal {
  id: string; title: string; snapshotAddress: string; deadlineAt: string; yesWeight: string; noWeight: string;
  eligibleWeights: { wallet: string; units: string }[]; votedWallets: string[]; status: 'open' | 'closed';
}
export interface Activity { signature: string; time: string; kind: string; status: string; explorerUrl?: string }
export interface ChainState {
  network: 'localnet' | 'devnet'; rpcUrl: string; programId: string; connected: boolean; serverTime: string;
  instrument: Instrument | null; holders: Holder[]; coupons: Coupon[]; redemption: Redemption | null;
  proposals: Proposal[]; activity: Activity[];
  demo: { available: boolean; ready: boolean; accelerated: boolean; roleWallets: Partial<Record<DemoRole, string>> };
}
export interface ActionRequest { action: ActionName | 'bootstrap'; params: Record<string, string>; title: string; explanation: string; amountMinor?: string; reset?: boolean }
export interface ActionSummary {
  network: string; action: string; signer: string; amountMinor?: string; token?: string;
  recipients?: string[]; tokenDecimals?: 0 | 6; feeMinor?: string; feeLamports?: string; simulation?: { success: boolean; message?: string };
}
export interface PreparedAction { operationId: string; transactionBase64: string; lastValidBlockHeight: number; summary: ActionSummary }
export interface TransactionResult { operationId?: string; signature?: string; status: string; explorerUrl?: string; message?: string }
export interface TxRecord {
  request: ActionRequest; status: TxStatus; mode: 'demo' | 'wallet'; signer: string; role: DemoRole;
  signature?: string; operationId?: string; explorerUrl?: string; message?: string; summary?: ActionSummary;
}
