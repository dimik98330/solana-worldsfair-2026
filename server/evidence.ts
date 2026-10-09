import {createHash} from 'node:crypto';
import {canonicalJson} from './request-contract.ts';
import type {ChainIdentity} from './chain-identity.ts';
import type {Activity} from './store.ts';
import {AppError} from './rpc.ts';

type ReportState = {
  instrument: {address: string; [key: string]: unknown}|null;
  context?: unknown; holders: unknown[]; coupons: unknown[]; redemption: unknown;
  proposals: unknown[]; reconciliation?: unknown; servicing?: unknown;
  activity: Activity[]; proposalDiscovery?: unknown;
};

/** Export only public read-model evidence; journal payloads/signers never enter this object. */
export function buildEvidenceReport(state: ReportState, identity: ChainIdentity,lookupProof?:(signature:string)=>unknown) {
  if (!state.instrument) throw new AppError('NO_INSTRUMENT', 'Select a confirmed instrument before exporting evidence', 404);
  const payload = {
    schema: 'bondtrace.corporate-action-evidence.v1',
    chain: {network: identity.network, genesisHash: identity.genesisHash, programId: identity.programId, rpcUrl: identity.rpcUrl},
    context: state.context,
    scope: {
      settlement: 'test-spl-token-transfers', realAssets: false, bankOrKaseIntegration: false,
      snapshot: 'current-confirmed-state-not-historical-archive',
      recordDate: 'scheduled-timestamp-transfer-lock-until-permissionless-capture',
      transactionHistory: 'locally-retained-receipts-not-complete-chain-history',
      receiptVerification: 'retained-observation-not-refetched-by-export',
      voting: 'snapshot-weighted-ballots-no-automatic-terms-amendment',
      independentlyAttested: false,
    },
    instrument: state.instrument, holders: state.holders, coupons: state.coupons,
    redemption: state.redemption, proposals: state.proposals,
    proposalDiscovery: state.proposalDiscovery ?? null,
    reconciliation: state.reconciliation, servicing: state.servicing,
    // Explicit whitelist prevents future receipt fields (e.g. signed bytes) leaking into exports.
    receipts: state.activity.map(item => ({
      signature: item.signature, action: item.kind, status: item.status,
      observedAt: item.time, slot: item.slot ?? null, account: item.account ?? null,
      instrumentAddress: item.bond ?? null, verification: item.verification ?? 'legacy-unbound',
      explorerUrl: item.explorerUrl,
      executionProof: lookupProof?.(item.signature) ?? null,
    })),
  };
  return {payload, integrity: {algorithm: 'sha256', canonicalization: 'recursively-sorted-json-object-keys', payloadSha256: createHash('sha256').update(canonicalJson(payload)).digest('hex'), meaning: 'export-integrity-only-not-a-signature-or-on-chain-commitment'}};
}
