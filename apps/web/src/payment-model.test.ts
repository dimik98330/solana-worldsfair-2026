import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRecordedEntitlement, holderPaymentRequest } from './payment-model';
import type { PaymentSelection } from './receipt-match';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransactionReview } from './TransactionReview';
import type { TxRecord } from './types';

test('post-record zero rows and explicitly excluded rights never become available claims', () => {
  for (const row of [undefined, { units: '0', amountMinor: '0', eligible: false }, { units: '10', amountMinor: '500000000', eligible: false }, { units: '0', amountMinor: '500000000' }, { units: '10', amountMinor: '0' }, { units: 'bad', amountMinor: '500000000' }, { units: '10', amountMinor: '-1' }]) {
    assert.equal(hasRecordedEntitlement(row), false);
  }
});
test('positive historical rights remain usable without current holdings, including legacy rows', () => {
  assert.equal(hasRecordedEntitlement({ units: '10', amountMinor: '500000000', eligible: true }), true);
  assert.equal(hasRecordedEntitlement({ units: '10', amountMinor: '500000000' }), true);
  assert.equal(hasRecordedEntitlement({ units: '18446744073709551615', amountMinor: '18446744073709551615' }), true);
});
test('principal review carries exact recorded principal and burned bonds in both languages', () => {
  const selection: PaymentSelection = { kind: 'principal', wallet: 'holder', units: '10', amountMinor: '10000000000', claimed: false, snapshotAddress: 'maturity' };
  const en = holderPaymentRequest(selection, 'en'), ru = holderPaymentRequest(selection, 'ru');
  assert.equal(en.action, 'redeem_principal');
  assert.deepEqual(en.params, {});
  assert.equal(en.amountMinor, '10000000000');
  assert.match(en.explanation, /10,000 settlement units.*atomically burn 10 bonds.*Historical coupon rights remain/);
  assert.match(ru.explanation, /10,000 расчётных единиц.*сжечь 10 облигаций.*Права на прежние купоны сохраняются/);
  assert.equal(selection.units, '10');
});
test('coupon review preserves exact claim identity and never promises a burn', () => {
  const selection: PaymentSelection = { kind: 'coupon', couponId: '8', wallet: 'holder', units: '10', amountMinor: '500000001', claimed: false, snapshotAddress: 'coupon' };
  for (const language of ['en', 'ru'] as const) {
    const request = holderPaymentRequest(selection, language);
    assert.equal(request.action, 'claim_coupon');
    assert.deepEqual(request.params, { couponId: '8' });
    assert.equal(request.amountMinor, '500000001');
    assert.doesNotMatch(request.explanation, /burn|сжечь/);
  }
});

test('Kazakh principal review preserves the exact amount, burn quantity and historical rights', () => {
  const request = holderPaymentRequest({ kind: 'principal', wallet: 'holder', units: '10', amountMinor: '10000000001', claimed: false, snapshotAddress: 'maturity' }, 'kk');
  assert.equal(request.amountMinor, '10000000001');
  assert.match(request.explanation, /10,000\.000001.*10 облигацияны.*жою.*Бұрынғы купон құқықтары сақталады/);
  assert.equal(request.title, 'Өтеуді тексеру');
});

test('extracted transaction review renders the API burn summary with exact units and mint', () => {
  const tx: TxRecord = {
    request: { action: 'redeem_principal_v2', params: {}, title: 'Review', explanation: 'Principal repayment' },
    status: 'review', mode: 'wallet', signer: 'holder', role: 'investor1',
    summary: { network: 'devnet', action: 'redeem_principal_v2', signer: 'holder', amountMinor: '10000000001', retirement: { units: '10', bondMint: 'verified-bond-mint', method: 'burn', atomicWithSettlement: true, historicalCouponRightsPreserved: true } },
  };
  const html = renderToStaticMarkup(createElement(TransactionReview, { tx, state: null, prepared: null, onConfirm() {}, onClose() {}, onCheck() {} }));
  assert.match(html, /Bonds to burn/);
  assert.match(html, /verified-bond-mint/);
  assert.match(html, /Preserved after redemption/);
  assert.match(html, /10,000\.000001/);
  assert.match(html, /disabled=""[^>]*>Sign in wallet/);
});
