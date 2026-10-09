import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDraftInstants, issuerDraftKey, parseIssuerDraft, rebaseDraft, resolveDraftSeconds, type IssuerDraftSnapshot } from './issuer-draft';
import { validateIssueDraft } from './issuer-validation';

const draft: IssuerDraftSnapshot = {
  version: 1, timeZone: 'Asia/Qyzylorda', instants: {}, step: 2, testDates: true,
  draft: { seriesId: '123', name: 'Saved issue', settlementMint: '11111111111111111111111111111111', faceValue: '1000.000001', maturityLocal: '2026-10-10T00:00:37',
    coupons: [{ key: 'fixed-a', amount: '50.000001', recordLocal: '2026-10-09T00:00:32', paymentLocal: '2026-10-09T00:00:37' }] },
};

test('saved creation draft restores step, exact decimal input, stable keys and pending identity', () => {
  const snapshot = { ...draft, pendingCreation: { seriesId: draft.draft.seriesId, issuer: 'holder-public-address' } };
  const restored = parseIssuerDraft(JSON.stringify(snapshot));
  assert.ok(restored);
  assert.equal(restored.step, 2);
  assert.equal(restored.testDates, true);
  assert.equal(restored.draft.faceValue, '1000.000001');
  assert.equal(restored.draft.coupons[0].key, 'fixed-a');
  assert.deepEqual(restored.pendingCreation, snapshot.pendingCreation);
  assert.equal(restored.instants['coupon.fixed-a.paymentLocal'].seconds - restored.instants['coupon.fixed-a.recordLocal'].seconds, 5);
  assert.notEqual(issuerDraftKey('localnet', 'a'), issuerDraftKey('localnet', 'b'));
  assert.notEqual(issuerDraftKey('localnet', 'a'), issuerDraftKey('devnet', 'a'));
});

test('restoration rejects unknown versions, malformed fields, duplicate coupon keys and mismatched pending issue', () => {
  const duplicate = { ...draft, draft: { ...draft.draft, coupons: [...draft.draft.coupons, draft.draft.coupons[0]] } };
  for (const input of ['bad JSON', JSON.stringify({ ...draft, version: 2 }), JSON.stringify({ ...draft, step: 10 }), JSON.stringify({ ...draft, timeZone: 'bad' }), JSON.stringify(duplicate),
    JSON.stringify({ ...draft, pendingCreation: { seriesId: 'other', issuer: 'public-address' } })]) assert.equal(parseIssuerDraft(input), null);
});

test('changing display zone crosses the date boundary but preserves review UTC seconds and exact amounts', () => {
  const initial = parseIssuerDraft(JSON.stringify(draft))!;
  const utc = rebaseDraft(initial, 'UTC');
  assert.equal(utc.draft.coupons[0].recordLocal, '2026-10-08T19:00:32');
  const browserElsewhere = rebaseDraft(utc, 'America/New_York');
  const before = validateIssueDraft(initial.draft, 1_791_460_000, initial.timeZone, initial.instants);
  const after = validateIssueDraft(browserElsewhere.draft, 1_791_460_000, browserElsewhere.timeZone, browserElsewhere.instants);
  assert.ok(before.params);
  assert.deepEqual(after.params, before.params);
  assert.deepEqual(rebaseDraft(browserElsewhere, 'Asia/Qyzylorda').draft, initial.draft);
});

test('a known instant survives a selected-zone DST fold while a newly edited ambiguous time is rejected', () => {
  const unique = { ...draft, timeZone: 'UTC', draft: { ...draft.draft, maturityLocal: '2026-11-02T00:00:00', coupons: [{ ...draft.draft.coupons[0], recordLocal: '2026-11-01T05:30:32', paymentLocal: '2026-11-01T05:30:37' }] } };
  const initial = { ...unique, instants: captureDraftInstants(unique.draft, 'UTC') };
  const ny = rebaseDraft(initial, 'America/New_York');
  const input = ny.draft.coupons[0].paymentLocal;
  assert.equal(input, '2026-11-01T01:30:37');
  const retained = ny.instants['coupon.fixed-a.paymentLocal'];
  assert.equal(resolveDraftSeconds(input, 'America/New_York', retained), initial.instants['coupon.fixed-a.paymentLocal'].seconds);
  assert.equal(resolveDraftSeconds(input, 'America/New_York'), null);
  assert.equal(resolveDraftSeconds('2026-11-01T01:31:37', 'America/New_York', retained), null);
  const restored = parseIssuerDraft(JSON.stringify(ny))!;
  assert.equal(restored.instants['coupon.fixed-a.paymentLocal'].seconds, retained.seconds);
  assert.deepEqual(validateIssueDraft(restored.draft, 1_790_000_000, restored.timeZone, restored.instants).params,
    validateIssueDraft(initial.draft, 1_790_000_000, initial.timeZone, initial.instants).params);
});
