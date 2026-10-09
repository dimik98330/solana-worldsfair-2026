import { useId, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowRight, Banknote, CalendarDays, ChevronDown, Landmark, ReceiptText, Wallet } from 'lucide-react';
import { Badge, Button, Money } from './components';
import { date, integer, subtract } from './format';
import type { ChainState, Coupon } from './types';
import { useUiLanguage } from './ui-language';
import { useDisplayPreferences } from './display-preferences';
import { dateParts, timeZoneLabel } from './time-zone';
import './payments-workspace.css';

export interface PaymentsWorkspaceProps {
  state: ChainState;
  principal?: string;
  coupon?: Coupon;
  tab: 'coupon' | 'redemption';
  onTab: (tab: 'coupon' | 'redemption') => void;
  onFund: () => void;
  canFund: boolean;
  fundReason: string;
  onClaims: () => void;
  onReceipts: () => void;
  scopeSelector?: ReactNode;
  children: ReactNode;
}

function PaymentDate({value, language}: {value?: string; language: 'en' | 'ru'}) {
  const {timeZone}=useDisplayPreferences();
  if (!value || Number.isNaN(Date.parse(value))) return <span>{language==='ru'?'Дата не назначена':'Not scheduled'}</span>;
  const parts=dateParts(value,timeZone,language);
  return <time dateTime={value} title={date(value,true,language)}>
    <span>{parts.date}</span>
    <span className="payments-time">{parts.time}</span>
  </time>;
}

/** Presentation only: the parent retains permissions, operation reviews and recovery. */
export function PaymentsWorkspace({
  state, principal, coupon, tab, onTab, onFund, canFund, fundReason,
  onClaims, onReceipts, scopeSelector, children,
}: PaymentsWorkspaceProps) {
  const { language } = useUiLanguage();
  const {timeZone}=useDisplayPreferences();
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const headingId = useId();
  const fundingReasonId = useId();
  const instrument = state.instrument;
  const selected = tab === 'coupon' ? coupon : state.redemption;
  const recorded = state.connected && selected?.snapshotAddress ? selected : undefined;
  const remaining = subtract(recorded?.totalMinor, recorded?.paidMinor);
  const unpaidCoupon = state.connected && coupon?.snapshotAddress
    ? subtract(coupon.totalMinor, coupon.paidMinor) : undefined;
  const couponIndex = integer(coupon?.id);
  const couponName = couponIndex != null
    ? `${tr('Coupon', 'Купон')} ${(couponIndex + 1n).toString()}`
    : tr('Coupon payment', 'Выплата купона');
  const paymentName = tab === 'coupon' ? couponName : tr('Principal repayment', 'Возврат номинала');
  const timezone = timeZoneLabel(timeZone,language);
  const settled=instrument?.status==='redeemed'&&state.redemption&&subtract(state.redemption.totalMinor,state.redemption.paidMinor)==='0'&&state.coupons.every(item=>subtract(item.totalMinor,item.paidMinor)==='0');
  const outcome = !state.connected ? tr('Chain unavailable', 'Нет связи с сетью')
    : !recorded ? tr('Rights not recorded', 'Права ещё не зафиксированы')
      : remaining === undefined ? tr('Amount unavailable', 'Сумма недоступна')
        : remaining === '0' ? tr('Paid in full', 'Полностью выплачено')
          : tr('Unpaid rights remain', 'Есть неполученные выплаты');

  return <section className="payments-workspace" aria-labelledby={headingId}>
    <header className="payments-heading">
      <div><h1 id={headingId}>{tr('Payments', 'Выплаты')}</h1></div>
      <Button variant="ghost" onClick={onReceipts}><ReceiptText size={17} aria-hidden="true" />{tr('Receipts', 'Подтверждения')}</Button>
    </header>

    <div className="payments-layout">
      <section className="payments-ledger" aria-label={tr('Payment registry', 'Реестр выплат')}>
        <div className="payments-ledger-toolbar">
          <div className="payments-switch" role="group" aria-label={tr('Payment type', 'Тип выплаты')}>
            <button type="button" aria-pressed={tab === 'coupon'} onClick={() => onTab('coupon')}><Banknote size={18} aria-hidden="true" />{tr('Coupon', 'Купон')}</button>
            <button type="button" aria-pressed={tab === 'redemption'} onClick={() => onTab('redemption')}><Landmark size={18} aria-hidden="true" />{tr('Principal', 'Номинал')}</button>
          </div>
          {tab === 'coupon' && scopeSelector ? <div className="payments-scope">{scopeSelector}</div> : null}
        </div>

        <div className="payments-selection">
          <div className="payments-selection-title"><h2>{paymentName}</h2><Badge tone={remaining === '0' && recorded ? 'success' : 'neutral'}>{outcome}</Badge></div>
          <div className="payments-selection-context"><dl className="payments-dates">
            {tab === 'coupon' ? <>
              <div><dt><CalendarDays size={16} aria-hidden="true" />{tr('Record date', 'Дата фиксации прав')}</dt><dd><PaymentDate value={coupon?.recordAt ?? instrument?.recordAt} language={language}/></dd></div>
              <div><dt><CalendarDays size={16} aria-hidden="true" />{tr('Payment date', 'Дата выплаты')}</dt><dd><PaymentDate value={coupon?.paymentAt ?? instrument?.paymentAt} language={language}/></dd></div>
            </> : <div><dt><CalendarDays size={16} aria-hidden="true" />{tr('Maturity', 'Дата погашения')}</dt><dd><PaymentDate value={instrument?.maturityAt} language={language}/></dd></div>}
          </dl>
          <p className="payments-timezone">{timezone}</p></div>
        </div>

        <dl className="payments-reconciliation" aria-label={tr('Selected payment reconciliation in settlement units', 'Сверка выбранной выплаты в расчётных единицах')}>
          <div><dt>{tr('Total recorded', 'Начислено')}</dt><dd><Money value={recorded?.totalMinor} /></dd></div>
          <div><dt>{tr('Paid', 'Выплачено')}</dt><dd><Money value={recorded?.paidMinor} /></dd></div>
          <div className="payments-remaining"><dt>{tr('Left to pay', 'Осталось')}</dt><dd><Money value={remaining} /></dd></div>
        </dl>
        <div className="payments-records">{children}</div>
      </section>

      <aside className="payments-inspector" aria-label={tr('Issue reserve and holder actions', 'Резерв выпуска и действия держателя')}>
        {settled&&<section className="payments-complete"><h2><ReceiptText size={18} aria-hidden="true"/>{tr('Payments complete','Выплаты завершены')}</h2><p>{tr('Principal repaid. All recorded coupons paid.','Номинал возвращён. Все зафиксированные купоны выплачены.')}</p><Button onClick={onReceipts}>{tr('View receipts','Открыть подтверждения')}<ArrowRight size={16} aria-hidden="true"/></Button></section>}
        <details className="payments-reserve" open={!settled}>
          <summary><Landmark size={18} aria-hidden="true" />{tr('Issue reserve', 'Резерв выпуска')}<ChevronDown className="reserve-chevron" size={18} aria-hidden="true"/></summary>
          <p className="payments-unit">{tr('Settlement units', 'Расчётные единицы')}</p>
          <dl className="payments-balances">
            <div><dt>{tr('Available reserve', 'Средства в резерве')}</dt><dd><Money value={state.connected ? instrument?.vaultBalanceMinor : undefined} /></dd></div>
            <div><dt>{tr('Principal outstanding', 'Номинал к возврату')}</dt><dd><Money value={state.connected ? principal : undefined} /></dd></div>
            <div><dt>{tr('Selected coupon unpaid', 'Остаток выбранного купона')}</dt><dd><Money value={unpaidCoupon} /></dd></div>
            <div><dt>{tr('Nominal per bond', 'Номинал облигации')}</dt><dd><Money value={state.connected ? instrument?.faceValueMinor : undefined} /></dd></div>
          </dl>
          {!settled&&<><Button onClick={onFund} disabled={!canFund} aria-describedby={!canFund && fundReason ? fundingReasonId : undefined}><ArrowDownLeft size={16} aria-hidden="true" />{tr('Add reserve', 'Пополнить резерв')}</Button>
          {!canFund && fundReason ? <p className="payments-help" id={fundingReasonId}>{fundReason}</p> : null}</>}
          {settled&&<p className="payments-help">{tr('Balances after redemption.','Остатки после погашения.')}</p>}
        </details>
        <section className="payments-holder-action">
          <h2><Wallet size={18} aria-hidden="true" />{tr('Holder payments', 'Выплаты держателю')}</h2>
          <Button onClick={onClaims}>{tr('Holder portfolio', 'Портфель держателя')}<ArrowRight size={16} aria-hidden="true" /></Button>
        </section>
      </aside>
    </div>
  </section>;
}
