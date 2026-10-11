import { translate, type UiLanguage } from './i18n';
import { amount, integer, units } from './format';
import type { PaymentSelection } from './receipt-match';
import type { ActionRequest, Entitlement } from './types';

/** A registry row can exist without historical rights. Current holdings are irrelevant. */
export function hasRecordedEntitlement(row: Pick<Entitlement, 'units' | 'amountMinor' | 'eligible'> | null | undefined): boolean {
  return Boolean(row && row.eligible !== false && (integer(row.units) ?? 0n) > 0n && (integer(row.amountMinor) ?? 0n) > 0n);
}

export function holderPaymentRequest(selection: PaymentSelection, language: UiLanguage): ActionRequest {
  const principal = selection.kind === 'principal', ru = language === 'ru';
  const tr = (en: string, russian: string) => translate(language, en, russian);
  return {
    action: principal ? 'redeem_principal' : 'claim_coupon',
    params: principal ? {} : { couponId: selection.couponId! },
    title: principal ? tr('Review principal repayment', 'Проверить погашение') : tr('Review payment', 'Проверить выплату'),
    explanation: principal
      ? language === 'kk' ? `${amount(selection.amountMinor)} есеп айырысу бірлігін алып, өтеу құқықтары жазбасындағы ${units(selection.units)} облигацияны бір мезгілде жою. Бұрынғы купон құқықтары сақталады. Бағдарлама қайталама өтеуді қабылдамайды.`
      : ru ? `Получить ${amount(selection.amountMinor)} расчётных единиц и одновременно сжечь ${units(selection.units)} облигаций из записи прав погашения. Права на прежние купоны сохраняются. Программа отклоняет повторное погашение.`
        : `Receive ${amount(selection.amountMinor)} settlement units and atomically burn ${units(selection.units)} bonds from the maturity rights record. Historical coupon rights remain. The program rejects duplicate redemption.`
      : tr('Receive the exact recorded entitlement. The program rejects duplicate claims.', 'Получить точную зафиксированную сумму. Программа отклоняет повторную выплату.'),
    amountMinor: selection.amountMinor,
  };
}
