import {MAX_U64} from '../packages/client/src/domain.ts';
import {AppError} from './rpc.ts';
import type {ChainView} from './chain-view.ts';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError('RECONCILIATION_FAILED', message, 503);
}
function uint(value: bigint, name: string): bigint { check(typeof value === 'bigint' && value >= 0n && value <= MAX_U64, `${name} is outside u64`); return value; }
function add(values: bigint[], name: string): bigint { return values.reduce((sum, value) => uint(sum + uint(value, name), name), 0n); }
function product(a: bigint, b: bigint, name: string): bigint { return uint(uint(a, name) * uint(b, name), name); }
function mask(value: number, units: bigint[], name: string): bigint {
  check(Number.isSafeInteger(value) && value >= 0 && value < (1 << units.length), `${name} has bits outside the registry`);
  return add(units.filter((amount, i) => { const claimed = (value & (1 << i)) !== 0; check(!claimed || amount > 0n, `${name} claims a zero entitlement`); return claimed; }), name);
}
export function decimalAmount(value: bigint, decimals = 6): string {
  uint(value, 'Display amount'); check(Number.isSafeInteger(decimals) && decimals >= 0 && decimals <= 18, 'Invalid decimal precision');
  if (!decimals) return value.toString();
  const digits = value.toString().padStart(decimals + 1, '0'); return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}
function money(value: bigint) { return {baseUnits: uint(value, 'Money').toString(), decimal: decimalAmount(value), decimals: 6}; }
export function isoTimestamp(value: bigint): string {
  check(value >= -8_640_000_000_000n && value <= 8_640_000_000_000n, 'Timestamp is outside supported display range');
  return new Date(Number(value * 1000n)).toISOString();
}
/** Checks program invariants against one bank; no local activity or floating point determines money. */
export function reconcile(view: Pick<ChainView, 'address'|'bond'|'bondMint'|'holders'|'vault'|'coupons'|'proposals'|'clock'|'contextSlot'|'missingProposalIds'>) {
  const {bond, holders, coupons, clock, address} = view, count = bond.holderWallets.length;
  check(count <= 16 && new Set(bond.holderWallets).size === count, 'Registry must contain unique wallets within capacity');
  check(Number.isSafeInteger(bond.state) && bond.state >= 0 && bond.state <= 3, 'Invalid instrument state');
  uint(bond.totalIssued, 'Issued units'); uint(bond.totalRedeemed, 'Redeemed units');
  check(bond.faceValue > 0n && bond.totalRedeemed <= bond.totalIssued, 'Invalid face value or redeemed supply');
  check(holders.length === count, 'Holder balances are incomplete');
  holders.forEach((holder, i) => {
    uint(holder.amount, 'Holder units');
    check(holder.mint === bond.bondMint && (holder.amount === 0n || holder.owner === bond.holderWallets[i]), 'Holder mint or authority mismatch');
    check(holder.amount === 0n || (!holder.closed && holder.state === 2), 'Positive holder balance is not frozen');
  });
  const current = add(holders.map(h => h.amount), 'Current units'), expected = bond.totalIssued - bond.totalRedeemed;
  check(current === uint(view.bondMint.supply, 'Mint supply') && current === expected, 'Holdings, mint supply and issued-minus-redeemed differ');
  check(coupons.length === bond.couponTerms.length && coupons.length >= 1 && coupons.length <= 8, 'Coupon schedule or graph is incomplete');
  check(Number.isSafeInteger(bond.nextCouponIndex) && bond.nextCouponIndex >= 0 && bond.nextCouponIndex <= coupons.length, 'Invalid capture sequence');
  check(bond.state !== 0 || bond.nextCouponIndex === 0, 'Draft instrument cannot contain captured coupons');
  let priorRecord: bigint | null = null, priorPayment: bigint | null = null, priorCapture: bigint | null = null;
  const couponReports = bond.couponTerms.map((terms, index) => {
    check(terms.unitAmount > 0n && terms.recordTs <= terms.paymentTs && terms.paymentTs <= bond.maturityTs && (priorRecord === null || terms.recordTs > priorRecord) && (priorPayment === null || terms.paymentTs >= priorPayment), 'Invalid immutable coupon schedule');
    priorRecord = terms.recordTs; priorPayment = terms.paymentTs;
    const total = product(terms.unitAmount, bond.totalIssued, 'Coupon total'), snapshot = coupons[index];
    check(Boolean(snapshot) === (index < bond.nextCouponIndex), 'Coupon existence does not match sequential capture state');
    if (!snapshot) return {index: String(index), basis: 'scheduled-forecast' as const, captured: false, total: money(total), paid: money(0n), remaining: money(total), fixedAccrued: money(0n), claimable: money(0n)};
    check(snapshot.bond === address && snapshot.index === index && snapshot.recordTs === terms.recordTs && snapshot.paymentTs === terms.paymentTs && snapshot.unitAmount === terms.unitAmount, 'Captured coupon differs from immutable terms');
    check(snapshot.units.length === count && add(snapshot.units, 'Coupon snapshot units') === bond.totalIssued && snapshot.totalUnits === bond.totalIssued, 'Coupon snapshot supply is inconsistent');
    check(snapshot.capturedAt >= terms.recordTs && snapshot.capturedAt <= clock.timestamp && (priorCapture === null || snapshot.capturedAt >= priorCapture), 'Coupon capture time is inconsistent');
    priorCapture = snapshot.capturedAt;
    const claimedUnits = mask(snapshot.claimedMask, snapshot.units, 'Coupon claim mask'), paid = product(terms.unitAmount, claimedUnits, 'Coupon paid');
    check(snapshot.paidTotal === paid && paid <= total, 'Coupon paid total differs from claimed exact entitlements');
    check(!snapshot.claimedMask || clock.timestamp >= terms.paymentTs, 'Coupon payment precedes its payment date');
    const remaining = total - paid;
    return {index: String(index), basis: 'immutable-record-date-snapshot' as const, captured: true, total: money(total), paid: money(paid), remaining: money(remaining), fixedAccrued: money(total), claimable: money(clock.timestamp >= terms.paymentTs ? remaining : 0n)};
  });
  if (bond.state < 2) check(bond.totalRedeemed === 0n && bond.principalClaimedMask === 0 && bond.redemptionUnits.length === 0, 'Principal redemption exists before its snapshot');
  else {
    check(bond.totalIssued > 0n && bond.nextCouponIndex === coupons.length && bond.redemptionUnits.length === count && add(bond.redemptionUnits, 'Redemption snapshot units') === bond.totalIssued, 'Redemption snapshot or captured coupons are incomplete');
    check(clock.timestamp >= bond.maturityTs, 'Redemption precedes maturity');
    check(mask(bond.principalClaimedMask, bond.redemptionUnits, 'Principal claim mask') === bond.totalRedeemed, 'Principal mask does not account for all redeemed units');
    holders.forEach((holder, i) => check(holder.amount === ((bond.principalClaimedMask & (1 << i)) ? 0n : bond.redemptionUnits[i]), 'Current balance differs from remaining redemption snapshot'));
    check((bond.state === 3) === (bond.totalRedeemed === bond.totalIssued), 'Final instrument state differs from redeemed supply');
  }
  check(bond.state === 0 || (bond.totalIssued > 0n && count > 0), 'Sealed instrument has no issued units');
  const principalTotal = product(bond.faceValue, bond.totalIssued, 'Principal total'), principalPaid = product(bond.faceValue, bond.totalRedeemed, 'Principal paid'), principalRemaining = principalTotal - principalPaid;
  const couponTotal = add(couponReports.map(c => BigInt(c.total.baseUnits)), 'All coupon totals');
  const couponPaid = add(couponReports.map(c => BigInt(c.paid.baseUnits)), 'All coupon payments');
  const couponRemaining = couponTotal - couponPaid;
  const contractualTotal = add([principalTotal, couponTotal], 'Contractual reserve'), obligations = add([principalRemaining, couponRemaining], 'Remaining obligations');
  const balance = uint(view.vault.amount, 'Vault balance'), gap = obligations > balance ? obligations - balance : 0n, surplus = balance > obligations ? balance - obligations : 0n;
  check(view.vault.mint === bond.settlementMint && view.vault.owner === address && !view.vault.closed && view.vault.state === 1, 'Vault identity or transfer state is inconsistent');
  // Draft reserve may be incomplete; after seal the program requires complete prefunding.
  check(bond.state === 0 || gap === 0n, 'Sealed instrument is underfunded');
  const proposalReports = view.proposals.map(({id, value: p}) => {
    check(p.bond === address && p.proposalId.toString() === id && p.units.length === count && p.totalUnits === bond.totalIssued && add(p.units, 'Proposal snapshot') === p.totalUnits, 'Proposal registry or snapshot total is inconsistent');
    check(p.openedAt < p.closesAt && p.closesAt <= bond.maturityTs && p.openedAt <= clock.timestamp, 'Proposal dates are inconsistent');
    const voted = mask(p.ballotMask, p.units, 'Proposal ballot mask');
    check(add([p.yesUnits, p.noUnits], 'Voted weight') === voted, 'Proposal yes/no weights differ from ballot-mask weights');
    return {id, eligibleUnits: p.totalUnits.toString(), votedUnits: voted.toString(), yesUnits: p.yesUnits.toString(), noUnits: p.noUnits.toString(), remainingUnits: (p.totalUnits - voted).toString(), choiceEvidence: 'proposal-aggregate-only' as const};
  });
  const fixedAccrued = add(couponReports.map(c => BigInt(c.fixedAccrued.baseUnits)), 'Fixed accrued coupons');
  const couponClaimable = add(couponReports.map(c => BigInt(c.claimable.baseUnits)), 'Claimable coupons');
  const principalClaimable = bond.state === 2 ? principalRemaining : 0n;
  return {
    status: 'verified' as const, basis: 'single-confirmed-rpc-context' as const, contextSlot: String(view.contextSlot), clockSlot: clock.slot.toString(), chainTimestamp: clock.timestamp.toString(),
    supply: {issuedUnits: bond.totalIssued.toString(), redeemedUnits: bond.totalRedeemed.toString(), currentUnits: current.toString(), mintSupplyUnits: view.bondMint.supply.toString()},
    principal: {basis: bond.state >= 2 ? 'immutable-maturity-snapshot' : 'current-holdings-forecast', total: money(principalTotal), paid: money(principalPaid), remaining: money(principalRemaining), claimable: money(principalClaimable)},
    coupons: couponReports,
    totals: {contractual: money(contractualTotal), principalPaid: money(principalPaid), couponPaid: money(couponPaid), cashPaid: money(add([principalPaid, couponPaid], 'All cash payments')), remainingObligations: money(obligations), scheduledCouponForecast: money(couponTotal - fixedAccrued), fixedAccruedCoupon: money(fixedAccrued), claimableNow: money(add([principalClaimable, couponClaimable], 'All claimable payments')), vault: money(balance), fundingGap: money(gap), surplus: money(surplus)},
    proposals: proposalReports, missingProposalIds: [...view.missingProposalIds], proposalCoverageComplete: view.missingProposalIds.length === 0, proposalDiscovery: 'local-catalog-identifiers-only' as const,
  };
}
