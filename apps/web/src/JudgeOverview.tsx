import { ArrowRight, Banknote, FilePlus2, Landmark, ReceiptText, Vote } from 'lucide-react';
import { Address, Badge, Button, Money } from './components';
import { add, integer, subtract, units } from './format';
import { DisplayDate } from './DisplayDate';
import { useDisplayPreferences } from './display-preferences';
import { timeZoneLabel } from './time-zone';
import type { ChainState, View } from './types';
import { useUiLanguage } from './ui-language';
import './judge-overview.css';

export interface JudgeOverviewProps {
  state: ChainState;
  onNavigate: (view: View, tab?: 'coupon' | 'principal') => void;
  onReceipts: () => void;
  onCreate: () => void;
}

export function JudgeOverview({ state, onNavigate, onReceipts, onCreate }: JudgeOverviewProps) {
  const { language } = useUiLanguage();
  const { timeZone } = useDisplayPreferences();
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const instrument = state.instrument;
  const coupon = state.coupons.filter(item => item.status !== 'scheduled').at(-1);
  const principal = state.redemption;
  const proposal = state.proposals.at(-1);
  const couponTotal = integer(coupon?.totalMinor);
  const couponPaid = integer(coupon?.paidMinor);
  const couponSettled = Boolean(coupon && couponTotal !== null && couponPaid !== null && couponPaid === couponTotal && coupon.status === 'completed');
  const principalTotal = integer(principal?.totalMinor);
  const principalPaid = integer(principal?.paidMinor);
  const principalSettled = Boolean(principal && principalTotal !== null && principalPaid !== null && principalTotal === principalPaid && instrument?.status === 'redeemed');
  const outstandingUnits = instrument ? subtract(instrument.issuedSupply, instrument.redeemedSupply) : undefined;
  const eligibleWeight = proposal ? add(proposal.eligibleWeights.map(item => item.units)) : undefined;
  const couponId = integer(coupon?.id);
  const issueStatus = instrument?.status === 'redeemed' ? tr('Redeemed', 'Погашен')
    : instrument?.status === 'redeeming' ? tr('Redemption open', 'Погашение открыто')
      : instrument?.status === 'active' ? tr('Active', 'Активен') : tr('Draft', 'Черновик');
  const recentActivity = state.activity.slice(0, 3);
  const activityNames: Record<string, string> = {
    capture_coupon: tr('Record coupon rights', 'Фиксация купонных прав'),
    claim_coupon: tr('Coupon payment', 'Купонная выплата'),
    begin_redemption: tr('Open redemption', 'Открытие погашения'),
    redeem_principal: tr('Principal repayment', 'Возврат номинала'),
    create_vote: tr('Create proposal', 'Создание предложения'),
    cast_vote: tr('Holder vote', 'Голос держателя'),
    transfer_bonds: tr('Bond transfer', 'Перевод облигаций'),
    fund_vault: tr('Reserve funding', 'Пополнение резерва'),
    initialize_issue: tr('Create issue', 'Создание выпуска'),
    register_holder: tr('Register holder', 'Регистрация держателя'),
    issue_units: tr('Place bonds', 'Размещение облигаций'),
    seal_issue: tr('Activate issue', 'Активация выпуска'),
  };

  return <div className="judge-overview">
    <header className="judge-overview-heading">
      <h1>{tr('Overview', 'Обзор')}</h1>
      <Button variant="primary" onClick={onCreate}><FilePlus2 size={18} aria-hidden="true" />{tr('Create an issue', 'Создать выпуск')}</Button>
    </header>
    <div className="overview-workbench">
      <div className="overview-main-records">
        <section className="overview-payment-book" aria-label={tr('Issue payments', 'Выплаты по выпуску')}>
          <header className="overview-section-heading"><h2>{tr('Payment ledger', 'Реестр выплат')}</h2><span>{tr('Settlement units', 'Расчётные единицы')}</span></header>
          <article className="overview-payment-record">
            <div className="overview-payment-identity">
              <Banknote size={22} aria-hidden="true" />
              <div><h3>{tr('Coupon payment', 'Купонная выплата')}</h3><p>{coupon ? `${tr('Coupon', 'Купон')} ${units(couponId === null ? undefined : couponId + 1n)}` : tr('Awaiting record date', 'Ожидает фиксации прав')}</p></div>
              <Badge tone={couponSettled ? 'success' : coupon ? 'blue' : 'neutral'}>{couponSettled ? tr('Paid', 'Выплачен') : coupon ? tr('Rights recorded', 'Права зафиксированы') : tr('Scheduled', 'По расписанию')}</Badge>
            </div>
            {coupon ? <dl className="overview-payment-values">
              <div><dt>{tr('Recorded', 'Начислено')}</dt><dd><Money value={coupon.totalMinor} /></dd></div>
              <div><dt>{tr('Paid', 'Выплачено')}</dt><dd><Money value={coupon.paidMinor} /></dd></div>
              <div><dt>{tr('Left to pay', 'Осталось')}</dt><dd><Money value={subtract(coupon.totalMinor, coupon.paidMinor)} /></dd></div>
            </dl> : <p className="overview-record-empty">{tr('Allocations appear when holder rights are recorded.', 'Начисления появятся после фиксации держателей.')}</p>}
            <footer className="overview-payment-footer">
              <div>{coupon ? <><DisplayDate value={coupon.paymentAt} /><span>{units(coupon.entitlements.length)} {tr('recipients', 'получателей')}</span></> : null}</div>
              <Button variant="ghost" onClick={() => onNavigate('payments', 'coupon')}>{tr('View coupon', 'Посмотреть купон')}<ArrowRight size={17} aria-hidden="true" /></Button>
            </footer>
          </article>
          <article className="overview-payment-record">
            <div className="overview-payment-identity">
              <Landmark size={22} aria-hidden="true" />
              <div><h3>{tr('Principal redemption', 'Погашение облигаций')}</h3><p>{units(instrument?.redeemedSupply)} {tr('bonds retired', 'облигаций погашено')}</p></div>
              <Badge tone={principalSettled ? 'success' : principal ? 'blue' : 'neutral'}>{principalSettled ? tr('Redeemed', 'Погашен') : principal ? tr('Redemption open', 'Погашение открыто') : tr('Scheduled', 'По расписанию')}</Badge>
            </div>
            {principal ? <dl className="overview-payment-values">
              <div><dt>{tr('Recorded', 'Начислено')}</dt><dd><Money value={principal.totalMinor} /></dd></div>
              <div><dt>{tr('Paid', 'Выплачено')}</dt><dd><Money value={principal.paidMinor} /></dd></div>
              <div><dt>{tr('Left to pay', 'Осталось')}</dt><dd><Money value={subtract(principal.totalMinor, principal.paidMinor)} /></dd></div>
            </dl> : <p className="overview-record-empty">{tr('Redemption rights have not been recorded yet.', 'Права на погашение ещё не зафиксированы.')}</p>}
            <footer className="overview-payment-footer">
              <div>{instrument ? <DisplayDate value={instrument.maturityAt} /> : null}</div>
              <Button variant="ghost" onClick={() => onNavigate('payments', 'principal')}>{tr('View redemption', 'Посмотреть погашение')}<ArrowRight size={17} aria-hidden="true" /></Button>
            </footer>
          </article>
          <p className="overview-timezone">{timeZoneLabel(timeZone, language)}</p>
        </section>
        <section className="overview-voting-book" aria-label={tr('Holder voting', 'Голосование держателей')}>
          <div className="overview-vote-description"><Vote size={22} aria-hidden="true" /><div><h2>{tr('Holder voting', 'Голосование держателей')}</h2><p>{proposal?.title || tr('No proposal yet.', 'Предложений пока нет.')}</p></div></div>
          {proposal ? <div className="overview-vote-state">
            <Badge tone={proposal.status === 'open' ? 'blue' : 'neutral'}>{proposal.status === 'closed' ? tr('Closed', 'Завершено') : tr('Voting open', 'Приём голосов')}</Badge>
            <dl className="overview-vote-tally"><div><dt>{tr('For', 'За')}</dt><dd className="number">{units(proposal.yesWeight)}</dd></div><div><dt>{tr('Against', 'Против')}</dt><dd className="number">{units(proposal.noWeight)}</dd></div></dl>
            <p>{units(eligibleWeight)} {tr('eligible bonds', 'облигаций с правом голоса')}</p>
          </div> : null}
          <Button variant="ghost" onClick={() => onNavigate('voting')}>{tr('View voting', 'Посмотреть голоса')}<ArrowRight size={17} aria-hidden="true" /></Button>
        </section>
      </div>
      <aside className="overview-issue-inspector" aria-label={tr('Issue details and receipts', 'Условия выпуска и подтверждения')}>
        {instrument ? <section className="overview-terms">
          <header><Landmark size={20} aria-hidden="true" /><h2>{tr('Current issue', 'Текущий выпуск')}</h2></header>
          <h3>{instrument.name}</h3><Badge tone={instrument.status === 'redeemed' ? 'success' : instrument.status === 'active' ? 'blue' : 'neutral'}>{issueStatus}</Badge>
          <dl className="overview-issue-facts">
            <div><dt>{tr('Face value per bond', 'Номинал облигации')}</dt><dd><Money value={instrument.faceValueMinor} /><span>{tr('settlement units', 'расчётных единиц')}</span></dd></div>
            <div><dt>{tr('Issued', 'Размещено')}</dt><dd><span className="number">{units(instrument.issuedSupply)}</span><span>{tr('bonds', 'облигаций')}</span></dd></div>
            <div><dt>{tr('Outstanding', 'В обращении')}</dt><dd><span className="number">{units(outstandingUnits)}</span><span>{tr('bonds', 'облигаций')}</span></dd></div>
            <div><dt>{tr('Maturity', 'Дата погашения')}</dt><dd><DisplayDate value={instrument.maturityAt} /></dd></div>
          </dl>
          <details className="overview-issue-addresses"><summary>{tr('Issue accounts', 'Аккаунты выпуска')}</summary><dl><div><dt>{tr('Issue', 'Выпуск')}</dt><dd><Address value={instrument.address} /></dd></div><div><dt>{tr('Issuer', 'Эмитент')}</dt><dd><Address value={instrument.issuer} /></dd></div></dl></details>
          <Button onClick={() => onNavigate('issuer')}>{tr('Issuer desk', 'Кабинет эмитента')}<ArrowRight size={17} aria-hidden="true" /></Button>
        </section> : null}
        <section className="overview-receipts">
          <header className="overview-section-heading"><h2><ReceiptText size={20} aria-hidden="true" />{tr('Recent operations', 'Последние операции')}</h2></header>
          {recentActivity.length ? <ul>{recentActivity.map((item, index) => <li key={`${item.signature}-${index}`}>
            <strong>{activityNames[item.kind] || item.kind}</strong><DisplayDate value={item.time} />
            <Badge tone={item.status === 'confirmed' ? 'success' : item.status === 'error' ? 'error' : 'neutral'}>{item.status === 'confirmed' ? tr('Confirmed', 'Подтверждено') : item.status === 'error' ? tr('Failed', 'Ошибка') : item.status}</Badge>
          </li>)}</ul> : <p>{tr('No operations recorded yet.', 'Записанных операций пока нет.')}</p>}
          <Button variant="ghost" onClick={onReceipts}>{tr('All receipts', 'Все подтверждения')}<ArrowRight size={17} aria-hidden="true" /></Button>
        </section>
      </aside>
    </div>
  </div>;
}
