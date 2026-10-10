import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PagedOperations } from './PagedOperations';
import { canRegisterPagedHolder, nextPagedOperations, pagedRegistrationError, pagedRegistrationRequest, resolvePagedAction } from './paged-actions';
import type { ActionName, ActionNameV2, ActionRequest, ChainState, ServicingActionV2 } from './types';

const issuer = '11111111111111111111111111111111';
const receiver = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const bond = 'B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8';
const request = (action: ActionRequest['action'], params: Record<string, string> = {}): ActionRequest => ({ action, params, title: 'Review', explanation: 'Review one operation.' });
function state(): ChainState {
  return {
    connected: true, network: 'localnet', rpcUrl: 'http://127.0.0.1:8899', programId: bond,
    serverTime: '2030-01-01T00:00:00.000Z', schemaVersion: 2,
    instrument: { address: bond, issuer, name: 'Paged test', symbol: 'TEST', bondMint: bond, settlementMint: receiver, faceValueMinor: '1000000', rateBps: 0, couponFrequency: 0, status: 'active', issuedSupply: '18', redeemedSupply: '0', recordAt: '2030-01-01T01:00:00.000Z', paymentAt: '2030-01-01T02:00:00.000Z', maturityAt: '2030-01-02T00:00:17.000Z', vaultBalanceMinor: '19000000', version: 2, holderCount: 18, couponCount: 10, scheduleAppended: 10 },
    holders: [{ wallet: issuer, label: 'Issuer', units: '18' }], coupons: [], redemption: null, proposals: [], activity: [],
    demo: { available: false, ready: false, accelerated: false, roleWallets: {} },
    servicing: { schemaVersion: 2, instrumentAddress: bond, contextSlot: '9', chainTimestamp: '1893456000', status: 'active', fullySettled: false, couponOutstandingMinor: '1000000', principalOutstandingMinor: '18000000', transfer: { allowed: true, reason: null }, execution: { automatic: false, endpoint: '/api/actions/prepare', requiresWalletSignature: true, requiresFreshSimulation: true, finalCouponAndPrincipal: 'separate-claims-historical-coupon-rights-survive-burn' }, actions: [] },
  };
}
function step(action: ActionNameV2, params: Record<string, string> = { actionKind: '2', actionId: '0' }, kind: 'any-fee-payer' | 'issuer' | 'holder' = 'any-fee-payer'): ServicingActionV2 {
  return { id: action, action, params, status: 'ready', signer: { kind, wallet: kind === 'issuer' ? issuer : null }, amountMinor: null, units: null, dueAt: null, reason: null, request: { action, bondAddress: bond, params } };
}

test('all eleven existing financial/action names map only for instrument version 2', () => {
  const s = state();
  const mappings: [ActionName, ActionNameV2][] = [
    ['capture_coupon', 'begin_coupon_v2'], ['claim_coupon', 'claim_coupon_v2'], ['begin_redemption', 'begin_redemption_v2'], ['redeem_principal', 'redeem_principal_v2'], ['create_vote', 'create_proposal_v2'], ['cast_vote', 'cast_vote_v2'], ['transfer_bonds', 'transfer_units_v2'], ['fund_vault', 'fund_vault_v2'], ['register_holder', 'register_holder_v2'], ['issue_units', 'issue_units_v2'], ['seal_issue', 'seal_issue_v2'],
  ];
  for (const [generic, paged] of mappings) {
    const original = request(generic, { bondAddress: bond, couponId: '4294967295', proposalId: '4294967294', units: '18446744073709551615' });
    const resolved = resolvePagedAction(original, s);
    assert.equal(resolved.action, paged);
    assert.equal(resolved.params.couponId, '4294967295');
    assert.equal(resolved.params.proposalId, '4294967294');
    assert.equal(resolved.params.units, '18446744073709551615');
    assert.equal(resolved.params.bondAddress, bond);
    assert.equal(original.action, generic, 'pure mapping never mutates a queued request');
    for (const version of [undefined, 1, 3]) {
      const legacy = state(); legacy.instrument!.version = version;
      assert.strictEqual(resolvePagedAction(original, legacy), original);
    }
    assert.strictEqual(resolvePagedAction(original, null), original);
  }
});
test('bootstrap and existing initialize remain legacy even when a paged issue is selected', () => {
  for (const action of ['bootstrap', 'initialize_issue'] as const) {
    const original = request(action, { coupons: '[immutable draft]' });
    assert.strictEqual(resolvePagedAction(original, state()), original);
  }
});
test('all seventeen explicit v2 action identities survive without hidden steps or fallback', () => {
  const actions: ActionNameV2[] = ['initialize_issue_v2', 'append_schedule_v2', 'create_registry_page_v2', 'register_holder_v2', 'issue_units_v2', 'fund_vault_v2', 'seal_issue_v2', 'transfer_units_v2', 'begin_coupon_v2', 'begin_redemption_v2', 'create_proposal_v2', 'capture_action_page_v2', 'finalize_action_v2', 'claim_coupon_v2', 'settle_coupon_v2', 'redeem_principal_v2', 'cast_vote_v2'];
  for (const action of actions) {
    const original = request(action, { actionKind: '3', actionId: '4294967295', pageIndex: '37' });
    assert.deepEqual(resolvePagedAction(original, state()), original);
  }
  for (const unknown of ['unknown_action', 'constructor', '__proto__']) assert.throws(() => resolvePagedAction(request(unknown as ActionName), state()), /Unsupported paged action/);
});
test('proposal close time uses exact maturity seconds, overrides stale generic close, and rejects uncertain times', () => {
  const s = state(), original = request('create_vote', { title: 'Terms', proposalId: '4294967295', closesAt: '1' });
  assert.equal(resolvePagedAction(original, s).params.closesAt, '1893542417');
  assert.equal(original.params.closesAt, '1');
  for (const maturity of ['', 'unknown', '2030-01-02', '2030-01-02T00:00:17.001Z', '1970-01-01T00:00:00.000Z']) {
    s.instrument!.maturityAt = maturity;
    assert.throws(() => resolvePagedAction(original, s), /exact maturity time/);
  }
});
test('opening captures does not describe rights as finalized', () => {
  for (const action of ['capture_coupon', 'begin_redemption', 'create_vote'] as const) {
    const resolved = resolvePagedAction(request(action), state());
    assert.match(resolved.explanation, /after every page|after all pages/);
    assert.doesNotMatch(resolved.title, /fixed rights/i);
  }
});
test('only the next permissionless snapshot DTO is selected; hundreds of claims never become buttons', () => {
  const s = state(), capture = step('capture_action_page_v2', { actionKind: '3', actionId: '4294967295', pageIndex: '2' }), finalize = step('finalize_action_v2', { actionKind: '3', actionId: '4294967295' });
  s.servicing!.actions = [finalize, ...Array.from({ length: 300 }, () => step('claim_coupon_v2', { couponId: '8' }, 'holder')), capture, step('capture_action_page_v2', { actionKind: '3', actionId: '4294967295', pageIndex: '3' })];
  assert.deepEqual(nextPagedOperations(s, receiver, true), [capture]);
  assert.deepEqual(capture.request!.params, { actionKind: '3', actionId: '4294967295', pageIndex: '2' });
  capture.status = 'complete';
  assert.deepEqual(nextPagedOperations(s, receiver, true), [s.servicing!.actions.at(-1)]);
  s.servicing!.actions.pop();
  assert.deepEqual(nextPagedOperations(s, receiver, true), [finalize]);
});
test('seal comes from the ready issuer DTO and is unavailable to another signing wallet', () => {
  const s = state(), seal = step('seal_issue_v2', {}, 'issuer'); s.instrument!.status = 'draft'; s.servicing!.actions = [seal];
  assert.deepEqual(nextPagedOperations(s, issuer, true), [seal]);
  assert.deepEqual(nextPagedOperations(s, receiver, true), []);
  seal.status = 'blocked';
  assert.deepEqual(nextPagedOperations(s, issuer, true), []);
});
test('unready, malformed and mismatched requests fail closed', () => {
  const s = state();
  for (const status of ['waiting', 'blocked', 'complete', 'future-status']) {
    s.servicing!.actions = [{ ...step('finalize_action_v2'), status } as ServicingActionV2];
    assert.deepEqual(nextPagedOperations(s, receiver, true), []);
  }
  const invalid = step('finalize_action_v2'); invalid.request!.bondAddress = issuer;
  s.servicing!.actions = [invalid]; assert.deepEqual(nextPagedOperations(s, receiver, true), []);
  invalid.request!.bondAddress = bond; invalid.request!.action = 'claim_coupon_v2';
  assert.deepEqual(nextPagedOperations(s, receiver, true), []);
  invalid.request!.action = invalid.action; invalid.request!.params = { actionId: 9007199254740993 as unknown as string };
  assert.deepEqual(nextPagedOperations(s, receiver, true), []);
  for (const params of [{ actionKind: '2', actionId: '1' }, { actionKind: '4', actionId: '0' }, { actionKind: '1', actionId: '4294967296' }, { actionKind: '1', actionId: 'NaN' }]) {
    invalid.request!.params = params;
    assert.deepEqual(nextPagedOperations(s, receiver, true), []);
  }
  s.servicing!.actions = null as unknown as ServicingActionV2[];
  assert.deepEqual(nextPagedOperations(s, receiver, true), []);
});
test('connection, snapshot, operation lock, signing identity and schema gates disable all new actions', () => {
  const change: ((s: ChainState) => void)[] = [s => { s.connected = false; }, s => { s.readOnlySnapshot = { capturedAt: s.serverTime, source: 'test fixture' }; }, s => { s.instrument!.version = 1; }, s => { s.servicing!.schemaVersion = 3 as 2; }, s => { s.servicing!.instrumentAddress = issuer; }];
  for (const mutate of change) {
    const s = state(); s.servicing!.actions = [step('finalize_action_v2')]; mutate(s);
    assert.deepEqual(nextPagedOperations(s, issuer, true), []);
    assert.equal(canRegisterPagedHolder(s, issuer, true), false);
  }
  const s = state(); s.servicing!.actions = [step('finalize_action_v2')];
  assert.deepEqual(nextPagedOperations(s, undefined, true), []);
  assert.deepEqual(nextPagedOperations(s, issuer, false), []);
  assert.equal(canRegisterPagedHolder(s, issuer, false), false);
});
test('post-activation registration is issuer-only and follows the exact transfer gate', () => {
  const s = state();
  assert.equal(canRegisterPagedHolder(s, issuer, true), true);
  assert.equal(canRegisterPagedHolder(s, receiver, true), false);
  for (const status of ['draft', 'redeeming', 'redeemed'] as const) { s.instrument!.status = status; assert.equal(canRegisterPagedHolder(s, issuer, true), false); }
  s.instrument!.status = 'active'; s.servicing!.transfer = { allowed: false, reason: 'capture-in-progress' };
  assert.equal(canRegisterPagedHolder(s, issuer, true), false);
  s.servicing!.transfer = undefined as never;
  assert.equal(canRegisterPagedHolder(s, issuer, true), false);
});
test('registration validates the address, uniqueness and optional UTF-8 label without adding units or historical rights', () => {
  const s = state();
  assert.equal(pagedRegistrationError(s, issuer, true, 'broken', ''), 'invalid-address');
  assert.equal(pagedRegistrationError(s, issuer, true, issuer, ''), 'already-registered');
  assert.equal(pagedRegistrationError(s, issuer, true, receiver, 'Ж'.repeat(32)), null);
  assert.equal(pagedRegistrationError(s, issuer, true, receiver, 'Ж'.repeat(33)), 'invalid-label');
  assert.equal(pagedRegistrationError(s, issuer, true, receiver, 'first\nsecond'), 'invalid-label');
  const queued = pagedRegistrationRequest(s, issuer, true, ` ${receiver} `, ' Receiver ');
  assert.equal(queued?.action, 'register_holder_v2');
  assert.deepEqual(queued?.params, { bondAddress: bond, holderWallet: receiver, label: 'Receiver' });
  assert.deepEqual(pagedRegistrationRequest(s, issuer, true, receiver, '')?.params, { bondAddress: bond, holderWallet: receiver });
  assert.equal(pagedRegistrationRequest(s, receiver, true, receiver, ''), null);
  assert.equal(s.holders.length, 1);
  assert.match(queued!.explanation, /zero-balance/);
});
test('rendered paged surface shows actual counts, one next page and no holder claim expansion', () => {
  const s = state();
  s.servicing!.capture = { actionKind: '1', actionId: '9', finalized: false, capturedPages: 2, pageCount: 3, holderCount: 18 };
  s.servicing!.actions = [step('capture_action_page_v2', { actionKind: '1', actionId: '9', pageIndex: '2' }), ...Array.from({ length: 300 }, () => step('claim_coupon_v2', { couponId: '9' }, 'holder'))];
  let queued = 0;
  const markup = renderToStaticMarkup(createElement(PagedOperations, { state: s, activeWallet: receiver, usable: true, onQueue: () => { queued++; } }));
  assert.match(markup, /Pages captured/);
  assert.match(markup, /2 \/ 3/);
  assert.match(markup, /Capture page 3/);
  assert.match(markup, /Rights are created after finalization/);
  assert.doesNotMatch(markup, />Finalize snapshot</);
  assert.doesNotMatch(markup, /claim_coupon_v2|>Add holder</);
  assert.equal(queued, 0, 'rendering never queues a signing request');
});
test('rendered form entry is issuer-only and offline state retains the stage without active controls', () => {
  const s = state();
  const issuerMarkup = renderToStaticMarkup(createElement(PagedOperations, { state: s, activeWallet: issuer, usable: true, onQueue: () => {} }));
  assert.match(issuerMarkup, />Add holder</);
  s.connected = false;
  const offline = renderToStaticMarkup(createElement(PagedOperations, { state: s, activeWallet: issuer, usable: true, onQueue: () => {} }));
  assert.match(offline, /Connection unavailable/);
  assert.match(offline, />Active</);
  assert.doesNotMatch(offline, />Add holder</);
  s.instrument!.version = 1;
  assert.equal(renderToStaticMarkup(createElement(PagedOperations, { state: s, activeWallet: issuer, usable: true, onQueue: () => {} })), '');
});
test('ready next coupon and maturity begin DTOs are permissionless, explicit, and retain exact coupon ID', () => {
  const s = state(), coupon = step('begin_coupon_v2', { couponId: '9' }), maturity = step('begin_redemption_v2', {});
  s.servicing!.actions = [coupon, maturity];
  assert.deepEqual(nextPagedOperations(s, receiver, true), [coupon]);
  const markup = renderToStaticMarkup(createElement(PagedOperations, { state: s, activeWallet: receiver, usable: true, onQueue: () => { throw new Error('render must never queue'); } }));
  assert.match(markup, /Open coupon snapshot · ID 9/);
  coupon.status = 'complete'; assert.deepEqual(nextPagedOperations(s, receiver, true), [maturity]);
  assert.match(renderToStaticMarkup(createElement(PagedOperations, { state: s, activeWallet: receiver, usable: true, onQueue: () => {} })), /Open maturity snapshot/);
  for (const invalid of [step('begin_coupon_v2', { couponId: '4294967296' }), step('begin_coupon_v2', { couponId: '9', units: '1' }), step('begin_redemption_v2', { actionId: '1' }), step('begin_redemption_v2', {}, 'holder')]) {
    s.servicing!.actions = [invalid]; assert.deepEqual(nextPagedOperations(s, receiver, true), []);
  }
});
