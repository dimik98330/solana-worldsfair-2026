import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {getAddressDecoder} from '@solana/kit';
import {getMintDecoder, getMintEncoder} from '@solana-program/token';
import {MAX_U64} from '../../packages/client/src/domain.ts';

// Synthetic account model only: these are not chain receipts, users, or live evidence.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/reconciliation-' + crypto.randomUUID());
const [{decimalAmount, reconcile}, {AppError}] = await Promise.all([import('../../server/reconciliation.ts'), import('../../server/rpc.ts')]);
type Input = Parameters<typeof reconcile>[0];
const key = (id: number) => getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i === 0 ? id : 11));
const bondAddress = key(1), mint = key(2), settlement = key(3), issuer = key(4), holder = key(5), receiver = key(6);
function model(): Input {
  return {address: bondAddress, contextSlot: 12, clock: {slot: 12n, timestamp: 150n}, missingProposalIds: [], proposals: [],
    bond: {issuer, bondMint: mint, settlementMint: settlement, vault: key(7), seriesId: 1n, name: 'Synthetic KASE example', faceValue: 1_000_000_000n, maturityTs: 300n, totalIssued: 10n, totalRedeemed: 0n, state: 1, bump: 255, nextCouponIndex: 0, principalClaimedMask: 0, holderWallets: [holder, receiver], couponTerms: [{recordTs: 100n, paymentTs: 200n, unitAmount: 50_000_000n}], redemptionUnits: []},
    bondMint: getMintDecoder().decode(getMintEncoder().encode({mintAuthority: bondAddress, freezeAuthority: bondAddress, supply: 10n, decimals: 0, isInitialized: true})),
    holders: [holder, receiver].map((owner, i) => ({address: String(key(8 + i)), mint, owner, amount: i ? 0n : 10n, state: 2, closed: false})),
    vault: {address: key(7), mint: settlement, owner: bondAddress, amount: 10_500_000_000n, state: 1, closed: false}, coupons: [null]};
}
function capture(view: Input) {
  view.bond.nextCouponIndex = 1;
  view.coupons[0] = {bond: bondAddress, index: 0, ...view.bond.couponTerms[0], capturedAt: 110n, totalUnits: 10n, claimedMask: 0, paidTotal: 0n, units: [10n, 0n], bump: 255};
  return view.coupons[0]!;
}
function redeem(view: Input, mask: number, burned: bigint) {
  view.clock.timestamp = 300n; view.bond.state = burned === 10n ? 3 : 2; view.bond.redemptionUnits = [8n, 2n]; view.bond.principalClaimedMask = mask; view.bond.totalRedeemed = burned;
  view.holders[0].amount = mask & 1 ? 0n : 8n; view.holders[1].amount = mask & 2 ? 0n : 2n;
  view.bondMint.supply = 10n - burned; view.vault.amount = 10_500_000_000n - burned * 1_000_000_000n;
}
const fails = (view: Input) => assert.throws(() => reconcile(view), (error: unknown) => error instanceof AppError && error.code === 'RECONCILIATION_FAILED');

test('KASE 10 × 1000 × 10% / 2 = 500 is exact; scheduled forecast becomes fixed and then claimable by chain Clock', () => {
  const v = model(), scheduled = reconcile(v);
  assert.deepEqual(scheduled.coupons[0].total, {baseUnits: '500000000', decimal: '500.000000', decimals: 6});
  assert.equal(scheduled.totals.scheduledCouponForecast.decimal, '500.000000');
  assert.equal(scheduled.totals.fixedAccruedCoupon.baseUnits, '0');
  assert.equal(scheduled.totals.claimableNow.baseUnits, '0');
  capture(v); const recorded = reconcile(v);
  assert.equal(recorded.coupons[0].basis, 'immutable-record-date-snapshot');
  assert.equal(recorded.totals.fixedAccruedCoupon.decimal, '500.000000');
  assert.equal(recorded.totals.claimableNow.baseUnits, '0');
  v.clock.timestamp = 200n; assert.equal(reconcile(v).totals.claimableNow.decimal, '500.000000');
  assert.equal(reconcile(v).principal.total.decimal, '10000.000000');
});

test('record-date rights survive transfer and full burn; unpaid coupons remain payable after redemption', () => {
  const v = model(), coupon = capture(v); v.holders[0].amount = 8n; v.holders[1].amount = 2n;
  assert.equal(reconcile(v).coupons[0].total.decimal, '500.000000');
  redeem(v, 1, 8n); const partial = reconcile(v);
  assert.equal(partial.supply.currentUnits, '2'); assert.equal(partial.principal.paid.decimal, '8000.000000');
  assert.equal(partial.totals.remainingObligations.decimal, '2500.000000');
  redeem(v, 3, 10n); const burned = reconcile(v);
  assert.equal(burned.supply.currentUnits, '0'); assert.equal(burned.principal.total.decimal, '10000.000000');
  assert.equal(burned.totals.claimableNow.decimal, '500.000000'); assert.equal(burned.totals.remainingObligations.decimal, '500.000000');
  coupon.claimedMask = 1; coupon.paidTotal = 500_000_000n; v.vault.amount = 0n;
  const done = reconcile(v); assert.equal(done.totals.cashPaid.decimal, '10500.000000'); assert.equal(done.totals.remainingObligations.baseUnits, '0');
});

test('malformed holder balances and supply fail closed, but genuinely empty canonical accounts are permitted', () => {
  for (const change of [(v: Input) => v.holders[0].amount--, (v: Input) => v.bondMint.supply++, (v: Input) => v.holders[0].state = 1, (v: Input) => v.holders[0].owner = issuer, (v: Input) => v.holders[0].mint = settlement, (v: Input) => v.holders.pop()]) { const v = model(); change(v); fails(v); }
  const empty = model(); empty.holders[1].owner = issuer; empty.holders[1].closed = true; empty.holders[1].state = 0; assert.equal(reconcile(empty).status, 'verified');
});

test('coupon immutable terms, vector totals, capture sequence, payment masks and times reject corruption', () => {
  const corruptions = [
    (v: Input) => v.coupons[0] = null, (v: Input) => v.bond.nextCouponIndex = 0,
    (v: Input) => v.coupons[0]!.paymentTs++, (v: Input) => v.coupons[0]!.recordTs++, (v: Input) => v.coupons[0]!.unitAmount++,
    (v: Input) => v.coupons[0]!.units.pop(), (v: Input) => v.coupons[0]!.totalUnits--, (v: Input) => v.coupons[0]!.units[0]--,
    (v: Input) => v.coupons[0]!.claimedMask = 4, (v: Input) => v.coupons[0]!.claimedMask = 2,
    (v: Input) => v.coupons[0]!.paidTotal = 1n, (v: Input) => v.coupons[0]!.capturedAt = 99n,
    (v: Input) => v.coupons[0]!.capturedAt = 151n,
    (v: Input) => {v.coupons[0]!.claimedMask = 1; v.coupons[0]!.paidTotal = 500_000_000n;},
  ];
  for (const change of corruptions) { const v = model(); capture(v); change(v); fails(v); }
});

test('principal snapshot, masks, burned positions and terminal state are reconciled exactly', () => {
  const corruptions = [(v: Input) => v.bond.principalClaimedMask = 0, (v: Input) => v.bond.principalClaimedMask = 5,
    (v: Input) => v.bond.redemptionUnits[1] = 3n, (v: Input) => v.bond.state = 3,
    (v: Input) => {v.holders[0].amount = 1n; v.holders[1].amount = 1n;},
    (v: Input) => v.clock.timestamp = 299n];
  for (const change of corruptions) { const v = model(); capture(v); redeem(v, 1, 8n); change(v); fails(v); }
  const early = model(); early.bond.redemptionUnits = [10n, 0n]; fails(early);
});

test('proposal weights derive from the immutable vector and voted mask; individual choices are only aggregate evidence', () => {
  const v = model(); v.proposals = [{id: '9', address: key(10), value: {bond: bondAddress, proposalId: 9n, title: 'Synthetic vote', openedAt: 100n, closesAt: 250n, totalUnits: 10n, yesUnits: 8n, noUnits: 0n, ballotMask: 1, units: [8n, 2n], bump: 255}}];
  assert.equal(reconcile(v).proposals[0].votedUnits, '8');
  assert.equal(reconcile(v).proposals[0].choiceEvidence, 'proposal-aggregate-only');
  v.proposals[0].value.noUnits = 1n; fails(v); v.proposals[0].value.noUnits = 0n; v.proposals[0].value.ballotMask = 4; fails(v);
  v.proposals[0].value.ballotMask = 1; v.proposals[0].value.totalUnits = 9n; fails(v);
});

test('large base-unit amounts remain exact above Number precision; u64 overflow and sealed underfunding fail', () => {
  const v = model(); v.bond.faceValue = 9_007_199_254_740_993n; v.bond.totalIssued = 1n; v.bondMint.supply = 1n; v.holders[0].amount = 1n;
  v.bond.couponTerms[0].unitAmount = 7n; v.vault.amount = 9_007_199_254_741_000n;
  const r = reconcile(v); assert.equal(r.totals.contractual.baseUnits, '9007199254741000'); assert.equal(r.principal.total.decimal, '9007199254.740993');
  assert.equal(decimalAmount(MAX_U64), '18446744073709.551615');
  v.bond.faceValue = MAX_U64; fails(v);
  const gap = model(); gap.vault.amount--; fails(gap); gap.bond.state = 0; assert.equal(reconcile(gap).totals.fundingGap.baseUnits, '1');
});
