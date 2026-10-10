import { isAddress } from '@solana/kit';
import type { ActionName, ActionNameV2, ActionRequest, ChainState, ServicingActionV2 } from './types';

const pagedNames: Partial<Record<ActionName, ActionNameV2>> = {
  capture_coupon: 'begin_coupon_v2', claim_coupon: 'claim_coupon_v2',
  begin_redemption: 'begin_redemption_v2', redeem_principal: 'redeem_principal_v2',
  create_vote: 'create_proposal_v2', cast_vote: 'cast_vote_v2',
  transfer_bonds: 'transfer_units_v2', fund_vault: 'fund_vault_v2',
  register_holder: 'register_holder_v2', issue_units: 'issue_units_v2', seal_issue: 'seal_issue_v2',
};
const v2Names = new Set<ActionNameV2>([
  'initialize_issue_v2', 'append_schedule_v2', 'create_registry_page_v2', 'register_holder_v2',
  'issue_units_v2', 'fund_vault_v2', 'seal_issue_v2', 'transfer_units_v2', 'begin_coupon_v2',
  'begin_redemption_v2', 'create_proposal_v2', 'capture_action_page_v2', 'finalize_action_v2',
  'claim_coupon_v2', 'settle_coupon_v2', 'redeem_principal_v2', 'cast_vote_v2',
]);

/** Translate one explicit review request. This never sends or adds follow-up operations. */
export function resolvePagedAction(request: ActionRequest, state: ChainState | null | undefined): ActionRequest {
  if (state?.instrument?.version !== 2 || request.action === 'bootstrap' || request.action === 'initialize_issue') return request;
  const action = (Object.hasOwn(pagedNames, request.action) ? pagedNames[request.action as ActionName] : undefined) ?? (v2Names.has(request.action as ActionNameV2) ? request.action as ActionNameV2 : null);
  if (!action) throw new Error('Unsupported paged action. Refresh the issue before preparing an operation.');
  const params = { ...request.params };
  if (request.action === 'create_vote') {
    const maturity = state.instrument.maturityAt, milliseconds = Date.parse(maturity);
    if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds % 1000 !== 0 || new Date(milliseconds).toISOString() !== maturity) {
      throw new Error('The exact maturity time is unavailable. Refresh the issue before creating a proposal.');
    }
    params.closesAt = (BigInt(milliseconds) / 1000n).toString();
  }
  const captureReview = request.action === 'capture_coupon' ? { title: 'Open coupon snapshot', explanation: 'Open paged capture for this coupon. Rights are created only after every page is captured and the snapshot is finalized.' }
    : request.action === 'begin_redemption' ? { title: 'Open maturity snapshot', explanation: 'Open paged capture at maturity. Principal claims become available after every page is captured and the snapshot is finalized.' }
      : request.action === 'create_vote' ? { title: 'Open proposal snapshot', explanation: 'Open paged holder capture for this proposal. Voting starts after every page is captured and the snapshot is finalized; the vote closes at issue maturity.' } : {};
  return { ...request, ...captureReview, action, params };
}

function servicingMatches(state: ChainState): boolean {
  return state.instrument?.version === 2 && state.servicing?.schemaVersion === 2 && state.servicing.instrumentAddress === state.instrument.address;
}
function actionable(state: ChainState, activeWallet: string | undefined, usable: boolean): boolean {
  return usable && state.connected && !state.readOnlySnapshot && Boolean(activeWallet) && servicingMatches(state);
}
function counter(value: string | undefined): boolean {
  return typeof value === 'string' && /^\d{1,10}$/.test(value) && BigInt(value) <= 4294967295n;
}

/** At most one ready begin/capture/finalize step and one issuer activation, from API DTOs. */
export function nextPagedOperations(state: ChainState, activeWallet: string | undefined, usable: boolean): ServicingActionV2[] {
  if (!actionable(state, activeWallet, usable) || !Array.isArray(state.servicing!.actions)) return [];
  const eligible = state.servicing!.actions.filter(item => {
    const request = item?.request;
    if (!item || item.status !== 'ready' || !request || !item.signer || request.action !== item.action || request.bondAddress !== state.instrument!.address) return false;
    if (request.walletAddress && request.walletAddress !== activeWallet) return false;
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params) || Object.values(request.params).some(value => typeof value !== 'string')) return false;
    if (item.action === 'capture_action_page_v2' || item.action === 'finalize_action_v2') {
      const { actionKind, actionId, pageIndex } = request.params;
      return item.signer.kind === 'any-fee-payer' && !item.signer.wallet && ['1', '2', '3'].includes(actionKind)
        && counter(actionId) && (actionKind !== '2' || actionId === '0') && (item.action !== 'capture_action_page_v2' || counter(pageIndex))
        && Object.keys(request.params).every(key => ['actionKind', 'actionId', ...(item.action === 'capture_action_page_v2' ? ['pageIndex'] : [])].includes(key));
    }
    if (item.action === 'begin_coupon_v2' || item.action === 'begin_redemption_v2') {
      return state.instrument!.status === 'active' && item.signer.kind === 'any-fee-payer' && !item.signer.wallet
        && (item.action === 'begin_coupon_v2' ? counter(request.params.couponId) && Object.keys(request.params).every(key => key === 'couponId') : Object.keys(request.params).length === 0);
    }
    return item.action === 'seal_issue_v2' && Object.keys(request.params).length === 0 && state.instrument!.status === 'draft' && item.signer.kind === 'issuer' && item.signer.wallet === state.instrument!.issuer && activeWallet === state.instrument!.issuer;
  });
  const snapshot = eligible.find(item => item.action === 'capture_action_page_v2') ?? eligible.find(item => item.action === 'finalize_action_v2') ?? eligible.find(item => item.action === 'begin_coupon_v2') ?? eligible.find(item => item.action === 'begin_redemption_v2');
  const seal = eligible.find(item => item.action === 'seal_issue_v2');
  return [...(snapshot ? [snapshot] : []), ...(seal ? [seal] : [])];
}

export function canRegisterPagedHolder(state: ChainState, activeWallet: string | undefined, usable: boolean): boolean {
  return actionable(state, activeWallet, usable) && state.instrument!.status === 'active' && activeWallet === state.instrument!.issuer && state.servicing!.transfer?.allowed === true;
}

export type PagedRegistrationError = 'unavailable' | 'invalid-address' | 'already-registered' | 'invalid-label';
export function pagedRegistrationError(state: ChainState, activeWallet: string | undefined, usable: boolean, holderWallet: string, label: string): PagedRegistrationError | null {
  if (!canRegisterPagedHolder(state, activeWallet, usable)) return 'unavailable';
  const wallet = holderWallet.trim(), trimmedLabel = label.trim();
  if (!isAddress(wallet)) return 'invalid-address';
  if (state.holders.some(holder => holder.wallet === wallet)) return 'already-registered';
  if (/[\u0000-\u001f\u007f]/u.test(trimmedLabel) || new TextEncoder().encode(trimmedLabel).byteLength > 64) return 'invalid-label';
  return null;
}

/** Review metadata only; registration creates a zero-balance receiver, never an issuance. */
export function pagedRegistrationRequest(state: ChainState, activeWallet: string | undefined, usable: boolean, holderWallet: string, label: string): ActionRequest | null {
  if (pagedRegistrationError(state, activeWallet, usable, holderWallet, label)) return null;
  return {
    action: 'register_holder_v2', params: { bondAddress: state.instrument!.address, holderWallet: holderWallet.trim(), ...(label.trim() ? { label: label.trim() } : {}) },
    title: 'Register holder', explanation: 'Register a zero-balance receiver. This does not issue bonds or add rights to past snapshots.',
  };
}
