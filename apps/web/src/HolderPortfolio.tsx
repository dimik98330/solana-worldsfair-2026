import { ArrowDownLeft, ArrowRight, ArrowRightLeft, CalendarDays, ChevronDown, ChevronRight, FileText, Wallet } from 'lucide-react';
import { Address, Badge, Button, Empty, Money } from './components';
import { add, integer, multiply, units } from './format';
import { maySignForHolder, type PaymentSelection } from './receipt-match';
import { useUiLanguage } from './ui-language';
import { useDisplayPreferences } from './display-preferences';
import { timeZoneLabel } from './time-zone';
import type { ActionRequest, ChainState, Entitlement } from './types';
import { DisplayDate } from './DisplayDate';
import { hasRecordedEntitlement, holderPaymentRequest } from './payment-model';
import './portfolio-vote-premium.css';

export function HolderPortfolio({ state, activeWallet, viewedWallet, onSelect, usable, onQueue, onTransfer, onConnect, onReceipt, onHistory }: {
  state: ChainState;
  activeWallet?: string;
  viewedWallet?: string;
  onSelect: (wallet: string) => void;
  usable: boolean;
  onQueue: (request: ActionRequest) => Promise<void>;
  onTransfer: () => void;
  onConnect: () => void;
  onReceipt: (selection: PaymentSelection) => void;
  onHistory?: () => void;
}) {
  const { language, tr } = useUiLanguage();
  const { timeZone } = useDisplayPreferences();
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
    .filter((row): row is Entitlement => Boolean(hasRecordedEntitlement(row) && row && !row.claimed));
  const rows: { selection: PaymentSelection; title: string; eligible: boolean }[] = state.coupons.filter(coupon => coupon.snapshotAddress).map(coupon => {
    const row = coupon.entitlements.find(item => item.wallet === selected);
    return {
      selection: { ...(row ?? { wallet: selected, units: '0', amountMinor: '0', claimed: false }), kind: 'coupon', couponId: coupon.id, snapshotAddress: coupon.snapshotAddress, recordAt: coupon.recordAt, paymentAt: coupon.paymentAt, unitAmountMinor: coupon.unitAmountMinor },
      title: `${tr('Coupon', 'Купон')} ${units(BigInt(coupon.id) + 1n)}`,
      eligible: hasRecordedEntitlement(row),
    };
  });
  if (state.redemption) {
    const row = state.redemption.entitlements.find(item => item.wallet === selected);
    rows.push({ selection: { ...(row ?? { wallet: selected, units: '0', amountMinor: '0', claimed: false }), kind: 'principal', snapshotAddress: state.redemption.snapshotAddress, recordAt: instrument.maturityAt, paymentAt: instrument.maturityAt, unitAmountMinor: instrument.faceValueMinor }, title: tr('Principal repayment', 'Возврат номинала'), eligible: hasRecordedEntitlement(row) });
  }
  const transferAvailable = signing && Boolean(holding) && (integer(holding?.units) ?? 0n) > 0n && instrument.status === 'active' && state.servicing?.transfer.allowed !== false;

  const received = add(rows.filter(row => row.eligible && row.selection.claimed).map(row => row.selection.amountMinor));

  return <div className="holder-portfolio-workspace premium-portfolio">
    <div className="portfolio-holder-toolbar">
      <label className="portfolio-account-picker"><span>{tr('Holder', 'Держатель')}</span><select name="portfolio-holder" value={selected} onChange={event => onSelect(event.target.value)}>{!holding ? <option value={selected}>{tr('Connected account', 'Подключённый аккаунт')}</option> : null}{state.holders.map(holder => <option key={holder.wallet} value={holder.wallet}>{holder.label || holder.wallet}</option>)}</select></label>
      <Badge tone={selected === activeWallet ? 'blue' : 'neutral'}>{selected === activeWallet ? tr('Signing account', 'Аккаунт подписи') : tr('View only', 'Только просмотр')}</Badge>
      {onHistory && <Button variant="ghost" onClick={onHistory}>{tr('History', 'История')}</Button>}<Button className="portfolio-transfer-button" disabled={!transferAvailable} onClick={onTransfer}><ArrowRightLeft size={17} aria-hidden="true" />{tr('Transfer bonds', 'Передать облигации')}</Button>
    </div>

    <dl className="portfolio-payment-summary">
      <div><dt>{tr('Received', 'Получено')}</dt><dd><Money value={received} /></dd></div>
      <div><dt>{tr('Coupon available', 'Купон к получению')}</dt><dd><Money value={add(available.map(row => row.amountMinor))} /></dd></div>
      {instrument.status !== 'redeemed' ? <div><dt>{tr('Bonds held', 'Облигаций')}</dt><dd className="number">{units(holding?.units ?? '0')}</dd></div> : <div className="portfolio-summary-status"><dt className="sr-only">{tr('Issue status', 'Статус выпуска')}</dt><dd>{tr('Bonds redeemed', 'Облигации погашены')}</dd></div>}
    </dl>

    <section className="portfolio-ledger" aria-labelledby="portfolio-payments-title">
      <div className="portfolio-ledger-heading"><h2 id="portfolio-payments-title">{tr('Payments', 'Выплаты')}<span>{units(rows.length)}</span></h2><p><CalendarDays size={16} aria-hidden="true" />{timeZoneLabel(timeZone, language)}</p></div>
      {rows.length ? <>
        <div className="portfolio-ledger-columns" aria-hidden="true"><span>{tr('Payment', 'Выплата')}</span><span>{tr('Payment date', 'Дата выплаты')}</span><span>{tr('Amount', 'Сумма')}</span><span>{tr('Status', 'Статус')}</span></div>
        <div className="portfolio-ledger-rows">{rows.map(({ selection, title, eligible }) => {
          const paymentOpen = selection.kind === 'principal' || Boolean(selection.paymentAt && Date.parse(selection.paymentAt) <= Date.parse(state.serverTime) && state.coupons.some(coupon => coupon.id === selection.couponId && ['funded', 'completed'].includes(coupon.status)));
          return <article key={`${selection.kind}-${selection.couponId ?? 'principal'}`} className="portfolio-payment-row">
            <div className="portfolio-ledger-name"><h3>{title}</h3><details className="portfolio-record-info"><summary>{eligible ? `${units(selection.units)} ${tr('bonds recorded', 'облигаций зафиксировано')}` : tr('No recorded right', 'Нет права на выплату')}<ChevronDown size={14} aria-hidden="true" /></summary><div><span>{tr('Record date', 'Дата фиксации')}</span><DisplayDate value={selection.recordAt} /></div></details></div>
            <div className="portfolio-ledger-date"><span className="sr-only">{tr('Payment date', 'Дата выплаты')}: </span><DisplayDate value={selection.paymentAt} /></div>
            <div className="portfolio-ledger-amount"><span className="sr-only">{tr('Amount', 'Сумма')}: </span><Money value={eligible ? selection.amountMinor : undefined} /></div>
            <div className="portfolio-ledger-status"><Badge tone={selection.claimed ? 'success' : 'neutral'}>{!eligible ? tr('Not eligible', 'Нет права') : selection.claimed ? tr('Paid', 'Выплачено') : paymentOpen ? tr('Unclaimed', 'Не получено') : tr('Scheduled', 'Запланировано')}</Badge><div className="portfolio-ledger-actions">{eligible ? <Button variant="ghost" onClick={() => onReceipt(selection)} aria-label={`${tr('Details', 'Подробнее')}: ${title}`}>{tr('Details', 'Подробнее')}<ChevronRight size={16} aria-hidden="true" /></Button> : null}{eligible && !selection.claimed ? <Button variant="primary" disabled={!signing || !paymentOpen || (integer(selection.amountMinor) ?? 0n) <= 0n} onClick={() => void onQueue(holderPaymentRequest(selection, language))}><ArrowDownLeft size={17} aria-hidden="true" />{tr('Claim', 'Получить')}</Button> : null}</div></div>
          </article>;
        })}</div>
      </> : <div className="portfolio-payments-empty"><FileText size={22} aria-hidden="true" /><div><h3>{tr('No payments yet', 'Выплат пока нет')}</h3><p>{tr('Payments appear after the issue records holder rights.', 'Выплаты появятся после фиксации прав держателей.')}</p></div></div>}
    </section>

    <details className="portfolio-position-details">
      <summary>{tr('Position & account details', 'Позиция и реквизиты')}<ChevronDown size={18} aria-hidden="true" /></summary>
      <div className="portfolio-position-content">
        <dl><div><dt>{tr('Current bonds held', 'Облигаций сейчас')}</dt><dd className="number">{units(holding?.units ?? '0')}</dd></div><div><dt>{tr('Current face value', 'Текущий номинал')}</dt><dd><Money value={multiply(holding?.units ?? '0', instrument.faceValueMinor)} /></dd></div><div><dt>{tr('Wallet address', 'Адрес кошелька')}</dt><dd><Address value={selected} /></dd></div></dl>
        <p>{tr('Amounts are shown in settlement units.', 'Суммы указаны в расчётных единицах.')}</p>
        {selected !== activeWallet ? <div className="portfolio-signing-context"><p>{tr('Viewing this holder does not grant signing rights.', 'Просмотр держателя не даёт права подписи.')}</p><Button onClick={onConnect}>{tr('Choose signing account', 'Выбрать аккаунт подписи')}<ArrowRight size={16} aria-hidden="true" /></Button></div> : !usable ? <p role="status">{state.readOnlySnapshot ? tr('Saved snapshot · read only.', 'Архивный снимок · только просмотр.') : tr('Refresh the issue and resolve the current operation to sign.', 'Обновите данные выпуска и завершите текущую операцию для подписи.')}</p> : null}
      </div>
    </details>
  </div>;
}
