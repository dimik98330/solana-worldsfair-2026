import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addressError, issuanceError, issueReserve, localDateInput, localDateSeconds, parseBondCount, parseSettlementAmount, U64_MAX, utf8Error, validateIssueDraft, type IssueDraft } from './issuer-validation';
import type { ChainState } from './types';

const mint = '11111111111111111111111111111111';
const now = 1_800_000_000;
function draft(): IssueDraft {
  return { seriesId: '12', name: 'Test bond', settlementMint: mint, faceValue: '1000.000001', maturityLocal: localDateInput(now + 500), coupons: [{ key: 'a', recordLocal: localDateInput(now + 100), paymentLocal: localDateInput(now + 200), amount: '50.000001' }, { key: 'b', recordLocal: localDateInput(now + 300), paymentLocal: localDateInput(now + 500), amount: '20' }] };
}
function state(supply = '18', face = '1000000000', coupon = '900000000', vault = '0'): ChainState {
  return { instrument: { issuedSupply: supply, faceValueMinor: face, vaultBalanceMinor: vault }, coupons: [{ totalMinor: coupon }] } as unknown as ChainState;
}

test('settlement input remains exact through six decimals and the u64 boundary', () => {
  assert.deepEqual(parseSettlementAmount('1000.000001'), { value: '1000000001', error: null });
  assert.equal(parseSettlementAmount('0.000001').value, '1');
  assert.equal(parseSettlementAmount('18' + '446744073709.551615').value, U64_MAX.toString());
  assert.match(parseSettlementAmount('18446744073709.551616').error!, /exceeds/);
  assert.equal(parseSettlementAmount(' 0001.10 ').value, '1100000');
});
test('settlement amounts reject zero, negatives, fractions below precision, exponents and formatted copy', () => {
  for (const value of ['0', '0.000000', '-1', '+1', '.5', '1.', '1.0000001', '1e3', '1,000', 'NaN', 'Infinity', '']) assert.ok(parseSettlementAmount(value).error, value);
});
test('whole-bond input accepts exact integers and rejects overflow/fractions', () => {
  assert.equal(parseBondCount(U64_MAX.toString()).value, U64_MAX.toString());
  assert.equal(parseBondCount('0018').value, '18');
  for (const value of ['0', '-1', '1.5', '1e2', (U64_MAX + 1n).toString()]) assert.ok(parseBondCount(value).error);
});
test('UTF-8 limits measure trimmed ASCII, Cyrillic and emoji without truncation', () => {
  assert.equal(utf8Error('a'.repeat(64)), null);
  assert.equal(utf8Error('Ж'.repeat(32)), null);
  assert.equal(utf8Error('😀'.repeat(16)), null);
  assert.equal(utf8Error(`  ${'Ж'.repeat(32)}  `), null);
  assert.match(utf8Error('Ж'.repeat(33))!, /66 UTF-8 bytes/);
  assert.ok(utf8Error('  '));
  assert.match(utf8Error('Name\u0000suffix')!, /control/);
});
test('address validation checks decoded byte length as well as alphabet', () => {
  assert.equal(addressError(mint), null);
  for (const value of ['1111', '0'.repeat(32), '1'.repeat(44), '']) assert.ok(addressError(value), value);
});
test('local datetimes round-trip exact seconds and reject impossible calendar values', () => {
  assert.equal(localDateSeconds(localDateInput(now)), now);
  for (const value of ['2026-02-30T10:00', '2026-01-01T25:00', '2026-01-01', '', 'bad']) assert.equal(localDateSeconds(value), null, value);
});
test('issue terms serialize exact minor units and UTC seconds; payments may equal record/maturity', () => {
  const input = draft(); input.coupons[0].paymentLocal = input.coupons[0].recordLocal;
  const result = validateIssueDraft(input, now);
  assert.deepEqual(result.errors, {});
  assert.equal(result.params?.faceValueMinor, '1000000001');
  assert.equal(result.unitReserveMinor, '1070000002');
  assert.deepEqual(JSON.parse(result.params!.coupons)[0], { recordTs: String(now + 100), paymentTs: String(now + 100), unitAmount: '50000001' });
});
test('issue schedule rejects past/duplicate records, payment reversal and payment after maturity', () => {
  const input = draft(); input.coupons[0].recordLocal = localDateInput(now); input.coupons[1].recordLocal = localDateInput(now);
  let result = validateIssueDraft(input, now); assert.ok(result.errors['coupon.a.recordLocal']); assert.ok(result.errors['coupon.b.recordLocal']); assert.equal(result.params, null);
  const reversed = draft(); reversed.coupons[0].paymentLocal = localDateInput(now + 99); reversed.coupons[1].paymentLocal = localDateInput(now + 501);
  result = validateIssueDraft(reversed, now); assert.ok(result.errors['coupon.a.paymentLocal']); assert.ok(result.errors['coupon.b.paymentLocal']);
  const paymentOrder = draft(); paymentOrder.coupons[0].paymentLocal = localDateInput(now + 450); paymentOrder.coupons[1].paymentLocal = localDateInput(now + 400);
  assert.ok(validateIssueDraft(paymentOrder, now).errors['coupon.b.paymentLocal']);
});
test('one-to-eight coupon and per-bond reserve overflow limits match the artifact', () => {
  const input = draft(); input.coupons = []; assert.ok(validateIssueDraft(input, now).errors.schedule);
  const overflow = draft(); overflow.faceValue = '18446744073709.551615'; assert.match(validateIssueDraft(overflow, now).errors.schedule, /exceeds/);
  const nine = draft(); nine.coupons = Array.from({ length: 9 }, (_, index) => ({ key: String(index), recordLocal: localDateInput(now + index + 1), paymentLocal: localDateInput(now + index + 1), amount: '1' })); assert.ok(validateIssueDraft(nine, now).errors.schedule);
  assert.ok(validateIssueDraft(draft(), NaN).errors.schedule);
});
test('draft reserve uses exact chain amounts, calculates only the positive gap and rejects unknown/overflow', () => {
  assert.deepEqual(issueReserve(state()), { principalMinor: '18000000000', couponMinor: '900000000', requiredMinor: '18900000000', gapMinor: '18900000000', unitMinor: '1050000000' });
  assert.equal(issueReserve(state('18', '1000000000', '900000000', '20000000000')).gapMinor, '0');
  assert.ok(issueReserve(state('18', 'bad')).error);
  assert.ok(issueReserve(state(U64_MAX.toString(), '2', '0')).error);
});
test('enriched per-bond coupon terms work before placement and authoritative reserve disagreements block actions', () => {
  const zero = state('0', '1000000000', '0'); (zero.coupons[0] as typeof zero.coupons[0] & { unitAmountMinor: string }).unitAmountMinor = '50000000';
  assert.equal(issueReserve(zero).unitMinor, '1050000000');
  const inconsistent = state(); (inconsistent.instrument as NonNullable<ChainState['instrument']> & { requiredReserveMinor: string }).requiredReserveMinor = '1'; assert.match(issueReserve(inconsistent).error!, /disagree/);
});
test('placement guards both aggregate supply and reserve multiplication overflow', () => {
  assert.equal(issuanceError('18', '0', '1050000000'), null);
  assert.match(issuanceError('1', U64_MAX.toString(), '1')!, /supply/);
  assert.match(issuanceError('2', '0', U64_MAX.toString())!, /reserve/);
  assert.match(issuanceError('1', 'bad')!, /unavailable/);
});
