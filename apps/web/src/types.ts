export type DemoRole = 'issuer' | 'investor1' | 'investor2' | 'investor3';
export type View = 'overview' | 'registry' | 'payments' | 'portfolio' | 'voting' | 'issuer';
export type ActionName = 'capture_coupon' | 'claim_coupon' | 'begin_redemption' | 'redeem_principal' | 'create_vote' | 'cast_vote' | 'transfer_bonds' | 'fund_vault' | 'initialize_issue' | 'register_holder' | 'issue_units' | 'seal_issue';
export type ActionNameV2 = 'initialize_issue_v2' | 'append_schedule_v2' | 'create_registry_page_v2' | 'register_holder_v2' | 'issue_units_v2' | 'fund_vault_v2' | 'seal_issue_v2' | 'transfer_units_v2' | 'begin_coupon_v2' | 'begin_redemption_v2' | 'create_proposal_v2' | 'capture_action_page_v2' | 'finalize_action_v2' | 'claim_coupon_v2' | 'settle_coupon_v2' | 'redeem_principal_v2' | 'cast_vote_v2';
export type TxStatus = 'review' | 'preparing' | 'signing' | 'pending' | 'confirmed' | 'error' | 'cancelled' | 'unknown';
export interface Instrument {
  address: string; name: string; symbol: string; issuer: string; bondMint: string; settlementMint: string;
  faceValueMinor: string; rateBps: number; couponFrequency: number; status: 'draft' | 'active' | 'redeeming' | 'redeemed';
  issuedSupply: string; redeemedSupply: string; recordAt: string; paymentAt: string; maturityAt: string; vaultBalanceMinor: string;
  seriesId?: string; couponUnitMinor?: string; requiredReserveMinor?: string; fundingGapMinor?: string; settlementBalanceMinor?: string;
  version?: number; holderCount?: number; couponCount?: number; scheduleAppended?: number;
}
export interface Holder { wallet: string; label: string; units: string }
export interface Entitlement { wallet: string; units: string; amountMinor: string; claimed: boolean; eligible?: boolean; claimableNow?: boolean; basis?: string }
export interface PagedCapture { actionKind?: string; actionId?: string; finalized: boolean; capturedPages: number; pageCount: number; holderCount: number }
export interface Coupon {
  id: string; snapshotAddress: string; recordAt: string; paymentAt: string; recordSlot: string | number; unitAmountMinor?: string; capturedAt?: string | null;
  totalMinor: string; paidMinor: string; status: 'scheduled' | 'capturing' | 'recorded' | 'funded' | 'completed'; entitlements: Entitlement[];
  capture?: PagedCapture | null; basis?: string;
}
export interface Redemption { snapshotAddress: string; totalMinor: string; paidMinor: string; entitlements: Entitlement[] }
export interface Proposal {
  id: string; title: string; snapshotAddress: string; deadlineAt: string; yesWeight: string; noWeight: string;
  eligibleWeights: { wallet: string; units: string }[]; votedWallets: string[]; status: 'capturing' | 'open' | 'closed'; finalized?: boolean;
}
export interface ServicingRequestV2 { action: ActionNameV2; bondAddress: string; walletAddress?: string; params: Record<string, string> }
export interface ServicingActionV2 {
  id: string; action: ActionNameV2; status: 'ready' | 'waiting' | 'complete' | 'blocked'; params: Record<string, string>;
  signer: { kind: 'any-fee-payer' | 'issuer' | 'holder'; wallet: string | null };
  amountMinor: string | null; units: string | null; dueAt: string | null; reason: string | null;
  request: ServicingRequestV2 | null;
}
export interface ServicingV2 {
  schemaVersion: 2; instrumentAddress: string; contextSlot: string; chainTimestamp: string; status: string;
  fullySettled: boolean; couponOutstandingMinor: string; principalOutstandingMinor: string;
  transfer: { allowed: boolean; reason: string | null };
  capture?: PagedCapture | null;
  execution: { automatic: false; endpoint: string; requiresWalletSignature: true; requiresFreshSimulation: true; finalCouponAndPrincipal: string };
  actions: ServicingActionV2[];
  couponSettlementBatches?: { couponId: string; holderWallets: string[]; amountMinor: string; request: ServicingRequestV2 }[];
  votes?: Proposal[];
}
export interface Activity { signature: string; time: string; kind: string; status: string; explorerUrl?: string; slot?:number; account?:string; bond?:string; verification?:string }
export interface ChainState {
  readOnlySnapshot?: { capturedAt: string; source: string };
  network: 'localnet' | 'devnet'; rpcUrl: string; programId: string; connected: boolean; serverTime: string;
  instrument: Instrument | null; holders: Holder[]; coupons: Coupon[]; redemption: Redemption | null;
  proposals: Proposal[]; activity: Activity[];
  demo: { available: boolean; ready: boolean; accelerated: boolean; roleWallets: Partial<Record<DemoRole, string>> };
  instruments?: {address:string;name:string;source:string;issuer:string}[];
  schemaVersion?: 1 | 2; servicing?: ServicingV2;
}
export interface ActionRequest { action: ActionName | ActionNameV2 | 'bootstrap'; params: Record<string, string>; title: string; explanation: string; amountMinor?: string; reset?: boolean }
export interface ActionSummary {
  network: string; action: string; signer: string; instrumentAddress?: string; issueTerms?: {name:string;faceValueMinor:string;maturityTs:string;coupons?:{recordTs:string;paymentTs:string;unitAmount:string}[];couponCount?:string|number}; amountMinor?: string; token?: string;
  recipients?: string[]; tokenDecimals?: 0 | 6; feeMinor?: string; feeLamports?: string; simulation?: { success: boolean; message?: string };
}
export interface PreparedAction { operationId: string; transactionBase64: string; lastValidBlockHeight: number; summary: ActionSummary }
export interface TransactionResult { operationId?: string; signature?: string; status: string; explorerUrl?: string; message?: string }
export interface TxRecord {
  request: ActionRequest; status: TxStatus; mode: 'demo' | 'wallet'; signer: string; role: DemoRole;
  signature?: string; operationId?: string; explorerUrl?: string; message?: string; summary?: ActionSummary;
}
