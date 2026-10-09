import { ArrowDownLeft, ArrowRight, ArrowRightLeft, CalendarDays, FileSearch, FileText, Wallet } from 'lucide-react';
import { Address, Badge, Button, Empty, Money } from './components';
import { add, integer, multiply, units } from './format';
import { maySignForHolder, type PaymentSelection } from './receipt-match';
import { useUiLanguage } from './ui-language';
import { useDisplayPreferences } from './display-preferences';
import { timeZoneLabel } from './time-zone';
import type { ActionRequest, ChainState, Entitlement } from './types';
import { DisplayDate } from './DisplayDate';
import './voting-workspace.css';

export function HolderPortfolio({ state, activeWallet, viewedWallet, onSelect, usable, onQueue, onTransfer, onConnect, onReceipt }: {
  state: ChainState;
  activeWallet?: string;
  viewedWallet?: string;
  onSelect: (wallet: string) => void;
  usable: boolean;
  onQueue: (request: ActionRequest) => Promise<void>;
  onTransfer: () => void;
  onConnect: () => void;
  onReceipt: (selection: PaymentSelection) => void;
}) {
  const { language } = useUiLanguage();
  const { timeZone } = useDisplayPreferences();
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const selected = viewedWallet || activeWallet || state.holders[0]?.wallet;
  const holding = state.holders.find(item => item.wallet === selected);
  const instrument = state.instrument;
  const signing = Boolean(selected && maySignForHolder(activeWallet, selected, usable));

  if (!selected || !instrument) return <section className="holder-portfolio-empty">
    <Empty title={tr('No holder selected', 'Держатель не выбран')} description={tr('Registered holders appear here after placement.', 'Держатели появятся здесь после размещения облигаций.')} icon={<Wallet size={24} aria-hidden="true" />} action={<Button onClick={onConnect}>{tr('Choose account', 'Выбрать аккаунт')}<ArrowRight size={18} aria-hidden="true" /></Button>} />
  </section>;

  const available = state.coupons
    .filter(coupon => coupon.snapshotAddress && Date.parse(coupon.paymentAt) <= Date.parse(state.serverTime) && ['funded', 'completed'].includes(coupon.status))
    .map(coupon => coupon.entitlements.find(row => row.wallet === selected))
    .filter((row): row is Entitlement => Boolean(row && !row.claimed));
  const rows: { selection: PaymentSelection; title: string; eligible: boolean }[] = state.coupons.filter(coupon => coupon.snapshotAddress).map(coupon => {
    const row = coupon.entitlements.find(item => item.wallet === selected);
    return {
      selection: { ...(row ?? { wallet: selected, units: '0', amountMinor: '0', claimed: false }), kind: 'coupon', couponId: coupon.id, snapshotAddress: coupon.snapshotAddress, recordAt: coupon.recordAt, paymentAt: coupon.paymentAt, unitAmountMinor: coupon.unitAmountMinor },
      title: `${tr('Coupon', 'Купон')} ${units(BigInt(coupon.id) + 1n)}`,
      eligible: Boolean(row),
    };
  });
  if (state.redemption) {
    const row = state.redemption.entitlements.find(item => item.wallet === selected);
    rows.push({ selection: { ...(row ?? { wallet: selected, units: '0', amountMinor: '0', claimed: false }), kind: 'principal', snapshotAddress: state.redemption.snapshotAddress, recordAt: instrument.maturityAt, paymentAt: instrument.maturityAt, unitAmountMinor: instrument.faceValueMinor }, title: tr('Principal repayment', 'Возврат номинала'), eligible: Boolean(row) });
  }
  const transferAvailable = signing && Boolean(holding) && (integer(holding?.units) ?? 0n) > 0n && instrument.status === 'active';

  return <div className="holder-portfolio-workspace">
    <section className="portfolio-account" aria-label={tr('Selected holder', 'Выбранный держатель')}>
      <div className="portfolio-account-identity">
        <span className="portfolio-account-icon"><Wallet size={22} aria-hidden="true" /></span>
        <div><h2>{holding?.label || tr('Connected account', 'Подключённый аккаунт')}</h2><Address value={selected} /></div>
        <Badge tone={selected === activeWallet ? 'blue' : 'neutral'}>{selected === activeWallet ? tr('Signing account', 'Аккаунт подписи') : tr('View only', 'Только просмотр')}</Badge>
      </div>
      <div className="portfolio-account-controls">
        <label className="portfolio-holder-select"><span className="sr-only">{tr('Holder', 'Держатель')}</span><select name="portfolio-holder" value={selected} onChange={event => onSelect(event.target.value)}>{!holding && <option value={selected}>{tr('Connected account', 'Подключённый аккаунт')}</option>}{state.holders.map(holder => <option key={holder.wallet} value={holder.wallet}>{holder.label || holder.wallet}</option>)}</select></label>
        <Button disabled={!transferAvailable} onClick={onTransfer}>{tr('Transfer bonds', 'Передать облигации')}<ArrowRightLeft size={20} aria-hidden="true" /></Button>
      </div>
      {selected !== activeWallet ? <p className="portfolio-account-note">{tr('Viewing this holder does not grant signing rights.', 'Просмотр держателя не даёт права подписи.')} <button className="text-link" type="button" onClick={onConnect}>{tr('Choose signing account', 'Выбрать аккаунт подписи')}</button></p> : !usable ? <p className="portfolio-account-note" role="status">{state.readOnlySnapshot ? tr('Saved snapshot · read only.', 'Архивный снимок · только просмотр.') : tr('Refresh the issue and resolve the current operation to sign.', 'Обновите данные выпуска и завершите текущую операцию для подписи.')}</p> : null}
    </section>

    <dl className="portfolio-balance-strip">
      <div><dt>{tr('Bonds held', 'Облигаций в портфеле')}</dt><dd className="number">{units(holding?.units ?? '0')}</dd>{instrument.status === 'redeemed' ? <span>{tr('After redemption', 'После погашения')}</span> : null}</div>
      <div><dt>{tr('Current face value', 'Текущий номинал')}</dt><dd><Money value={multiply(holding?.units ?? '0', instrument.faceValueMinor)} /></dd><span>{tr('Settlement units', 'Расчётные единицы')}</span></div>
      <div><dt>{tr('Coupon available', 'Купон к получению')}</dt><dd><Money value={add(available.map(row => row.amountMinor))} /></dd><span>{tr('Settlement units', 'Расчётные единицы')}</span></div>
    </dl>

    <section className="portfolio-payment-register" aria-labelledby="portfolio-payments-title">
      <div className="portfolio-register-heading"><h2 id="portfolio-payments-title"><FileText size={20} aria-hidden="true" />{tr('Recorded payments', 'Зафиксированные выплаты')}</h2><p><CalendarDays size={16} aria-hidden="true" />{timeZoneLabel(timeZone, language)}</p></div>
      {rows.length ? <>
        <div className="portfolio-register-columns" aria-hidden="true"><span>{tr('Payment & recorded position', 'Выплата и позиция')}</span><span>{tr('Amount', 'Сумма')}</span><span>{tr('Payment date', 'Дата выплаты')}</span><span>{tr('Status & action', 'Статус и действие')}</span></div>
        <div className="portfolio-payment-rows">{rows.map(({ selection, title, eligible }) => {
          const paymentOpen = selection.kind === 'principal' || Boolean(selection.paymentAt && Date.parse(selection.paymentAt) <= Date.parse(state.serverTime) && state.coupons.some(coupon => coupon.id === selection.couponId && ['funded', 'completed'].includes(coupon.status)));
          return <article key={`${selection.kind}-${selection.couponId ?? 'principal'}`} className="portfolio-payment-row">
            <div className="portfolio-payment-name"><h3>{title}</h3><p>{eligible ? `${units(selection.units)} ${tr('bonds on record date', 'облигаций на дату фиксации')}` : tr('No recorded right', 'Нет зафиксированного права')}</p><div className="portfolio-record-date"><span>{tr('Record date', 'Дата фиксации')}</span><DisplayDate value={selection.recordAt} /></div></div>
            <div className="portfolio-payment-amount"><span className="portfolio-mobile-label">{tr('Amount', 'Сумма')}</span><Money value={eligible ? selection.amountMinor : undefined} /></div>
            <div className="portfolio-payment-date"><span className="portfolio-mobile-label">{tr('Payment date', 'Дата выплаты')}</span><DisplayDate value={selection.paymentAt} /></div>
            <div className="portfolio-payment-actions"><Badge tone={selection.claimed ? 'success' : 'neutral'}>{!eligible ? tr('Not eligible', 'Нет права') : selection.claimed ? tr('Paid', 'Выплачено') : paymentOpen ? tr('Unclaimed', 'Не получено') : tr('Scheduled', 'Запланировано')}</Badge><div>{eligible ? <Button variant="ghost" onClick={() => onReceipt(selection)}><FileSearch size={18} aria-hidden="true" />{tr('Payment details', 'Детали выплаты')}</Button> : null}{eligible && !selection.claimed ? <Button variant="primary" disabled={!signing || !paymentOpen || (integer(selection.amountMinor) ?? 0n) <= 0n} onClick={() => void onQueue({ action: selection.kind === 'coupon' ? 'claim_coupon' : 'redeem_principal', params: selection.kind === 'coupon' ? { couponId: selection.couponId! } : {}, title: tr('Review payment', 'Проверить выплату'), explanation: tr('Receive the exact recorded entitlement. The program rejects duplicate claims.', 'Получить точную зафиксированную сумму. Программа отклоняет повторную выплату.'), amountMinor: selection.amountMinor })}><ArrowDownLeft size={17} aria-hidden="true" />{tr('Claim', 'Получить')}</Button> : null}</div></div>
          </article>;
        })}</div>
      </> : <div className="portfolio-payments-empty"><FileText size={22} aria-hidden="true" /><div><h3>{tr('No recorded payments', 'Выплаты не зафиксированы')}</h3><p>{tr('Payments appear here when rights are recorded for this issue.', 'Выплаты появятся после фиксации прав по этому выпуску.')}</p></div></div>}
    </section>
  </div>;
}
