import {hasClaim} from '../packages/client/src/domain.ts';
import {isoTimestamp, reconcile} from './reconciliation.ts';

type View = Parameters<typeof reconcile>[0];
type Action = {
  id: string; action: string; status: 'ready'|'waiting'|'blocked'|'complete';
  dueAt: string; signer: {kind: 'issuer'|'holder'|'any-fee-payer'; wallet: string|null};
  reason: string|null; amountMinor: string|null; units: string|null;
  params: Record<string, string>; walletAddress?: string;
};

/** An advisory plan for this exact bank, never an authorization or an automatic signer. */
export function buildServicing(view: View, financial = reconcile(view)) {
  const {bond, clock} = view, actions: Action[] = [], now = clock.timestamp;
  const couponSettlementBatches:{couponId:string;holderWallets:string[];amountMinor:string;request:{action:string;bondAddress:string;params:{couponId:string;holderWallets:string[]}}}[]=[];
  const push = (item: Action) => actions.push(item);
  const issuer = {kind: 'issuer' as const, wallet: String(bond.issuer)};
  const firstRecord = bond.couponTerms[0].recordTs;
  if (bond.state === 0) {
    const reason = now >= firstRecord ? 'draft-record-date-passed' : bond.totalIssued === 0n ? 'no-issued-units' : BigInt(financial.totals.fundingGap.baseUnits) > 0n ? 'reserve-incomplete' : null;
    push({id: 'seal', action: 'seal_issue', status: reason ? 'blocked' : 'ready', dueAt: isoTimestamp(firstRecord), signer: issuer, reason, amountMinor: null, units: null, params: {}, walletAddress: String(bond.issuer)});
  }
  bond.couponTerms.forEach((terms, index) => {
    const snapshot = view.coupons[index], couponId = String(index), dueAt = isoTimestamp(terms.recordTs);
    const reason = bond.state === 0 ? 'issue-not-active' : index !== bond.nextCouponIndex ? 'earlier-record-date-required' : now < terms.recordTs ? 'record-date-not-reached' : null;
    push({id: `coupon:${index}:capture`, action: 'capture_coupon', status: snapshot ? 'complete' : reason ? (reason === 'record-date-not-reached' ? 'waiting' : 'blocked') : 'ready', dueAt, signer: {kind: 'any-fee-payer', wallet: null}, reason: snapshot ? null : reason, amountMinor: null, units: null, params: {couponId}});
    // No current holdings are presented as an immutable right before capture.
    if (!snapshot) return;
    snapshot.units.forEach((units, position) => {
      if (units === 0n) return;
      const wallet = String(bond.holderWallets[position]), paid = hasClaim(snapshot.claimedMask, position), payable = now >= terms.paymentTs;
      push({id: `coupon:${index}:${wallet}`, action: 'claim_coupon', status: paid ? 'complete' : payable ? 'ready' : 'waiting', dueAt: isoTimestamp(terms.paymentTs), signer: {kind: 'holder', wallet}, walletAddress: wallet, reason: paid || payable ? null : 'payment-date-not-reached', amountMinor: (units * terms.unitAmount).toString(), units: units.toString(), params: {couponId}});
    });
    if(now>=terms.paymentTs){
      const outstanding=snapshot.units.flatMap((units,position)=>units>0n&&!hasClaim(snapshot.claimedMask,position)?[{wallet:String(bond.holderWallets[position]),amount:units*terms.unitAmount}]:[]);
      for(let start=0;start<outstanding.length;start+=4){const rows=outstanding.slice(start,start+4),holderWallets=rows.map(row=>row.wallet).sort();couponSettlementBatches.push({couponId,holderWallets,amountMinor:rows.reduce((sum,row)=>sum+row.amount,0n).toString(),request:{action:'settle_coupon',bondAddress:view.address,params:{couponId,holderWallets}}});}
    }
  });
  const redemptionReason = bond.state === 0 ? 'issue-not-active' : now < bond.maturityTs ? 'maturity-not-reached' : bond.nextCouponIndex !== bond.couponTerms.length ? 'coupon-records-incomplete' : null;
  push({id: 'redemption:open', action: 'begin_redemption', status: bond.state >= 2 ? 'complete' : redemptionReason ? (redemptionReason === 'maturity-not-reached' ? 'waiting' : 'blocked') : 'ready', dueAt: isoTimestamp(bond.maturityTs), signer: {kind:'any-fee-payer',wallet:null}, reason: bond.state >= 2 ? null : redemptionReason, amountMinor: null, units: null, params: {}});
  if (bond.state >= 2) bond.redemptionUnits.forEach((units, position) => {
    if (units === 0n) return;
    const wallet = String(bond.holderWallets[position]);
    push({id: `principal:${wallet}`, action: 'redeem_principal', status: hasClaim(bond.principalClaimedMask, position) ? 'complete' : 'ready', dueAt: isoTimestamp(bond.maturityTs), signer: {kind: 'holder', wallet}, walletAddress: wallet, reason: null, amountMinor: (units * bond.faceValue).toString(), units: units.toString(), params: {}});
  });
  const votes = view.proposals.map(({id, address, value}) => ({
    id, address, title: value.title, openedAt: isoTimestamp(value.openedAt), closesAt: isoTimestamp(value.closesAt),
    status: now >= value.closesAt ? 'closed' : 'open', outcomeBasis: 'recorded-weights-no-execution-policy',
    eligibleUnits: value.totalUnits.toString(), yesUnits: value.yesUnits.toString(), noUnits: value.noUnits.toString(),
    eligibleVoters: value.units.flatMap((units, i) => units === 0n ? [] : [{wallet: String(bond.holderWallets[i]), units: units.toString(), voted: hasClaim(value.ballotMask, i), canVote: now < value.closesAt && !hasClaim(value.ballotMask, i)}]),
  }));
  const unpaidCoupons = BigInt(financial.totals.remainingObligations.baseUnits) - BigInt(financial.principal.remaining.baseUnits);
  const dueRecord = bond.state === 1 && bond.nextCouponIndex < bond.couponTerms.length && now >= bond.couponTerms[bond.nextCouponIndex].recordTs;
  const transferReason = bond.state !== 1 ? 'issue-not-active' : now >= bond.maturityTs ? 'maturity-reached' : dueRecord ? 'record-date-awaits-capture' : null;
  return {
    schemaVersion: 1, instrumentAddress: view.address, contextSlot: String(view.contextSlot), chainTimestamp: now.toString(),
    status: bond.state === 0 ? (now >= firstRecord ? 'expired-draft' : 'draft') : bond.state === 3 ? (unpaidCoupons > 0n ? 'principal-redeemed-coupons-outstanding' : 'settled') : bond.state === 2 ? 'redeeming' : now >= bond.maturityTs ? 'maturity-due' : 'active',
    fullySettled: bond.state === 3 && financial.totals.remainingObligations.baseUnits === '0',
    couponOutstandingMinor: unpaidCoupons.toString(), principalOutstandingMinor: financial.principal.remaining.baseUnits,
    transfer: {allowed: transferReason === null, reason: transferReason},
    execution: {automatic: false, endpoint: '/api/actions/prepare', requiresWalletSignature: true, requiresFreshSimulation: true, finalCouponAndPrincipal: 'separate-claims-historical-coupon-rights-survive-burn'},
    actions: actions.map(item => ({...item, request: item.status === 'ready' ? {action: item.action, bondAddress: view.address, ...(item.walletAddress ? {walletAddress: item.walletAddress} : {}), params: item.params} : null})),
    couponSettlementBatches, votes, votingCoverage: view.proposalDiscovery ?? {source: 'supplied-identifiers-only', completeAtFinancialContext: false},
  };
}
