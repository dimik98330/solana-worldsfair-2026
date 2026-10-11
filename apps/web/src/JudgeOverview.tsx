import { ArrowRight, Banknote, Clock3, FilePlus2, Landmark, ReceiptText, Vote } from 'lucide-react';
import { Address, Badge, Button, Money } from './components';
import { add, integer, subtract, units } from './format';
import { DisplayDate } from './DisplayDate';
import { useDisplayPreferences } from './display-preferences';
import { timeZoneLabel } from './time-zone';
import type { ChainState, View } from './types';
import { useUiLanguage } from './ui-language';
import { receiptLabels } from './ReceiptDetails';
import './overview-clarity.css';

export interface JudgeOverviewProps {
  state: ChainState;
  onNavigate: (view: View, tab?: 'coupon' | 'principal', couponId?: string) => void;
  onReceipts: () => void;
  onCreate: () => void;
}

export function JudgeOverview({ state, onNavigate, onReceipts, onCreate }: JudgeOverviewProps) {
  const { language, tr } = useUiLanguage();
  const { timeZone } = useDisplayPreferences();
  const instrument = state.instrument;
  const coupon = state.coupons.filter(item => ['recorded', 'funded', 'completed'].includes(item.status)).at(-1);
  const couponCapturing = state.coupons.some(item => item.status === 'capturing');
  const principal = state.redemption;
  const proposal = state.proposals.at(-1);
  const couponTotal = integer(coupon?.totalMinor);
  const couponPaid = integer(coupon?.paidMinor);
  const couponSettled = Boolean(coupon && couponTotal !== null && couponPaid !== null && couponPaid === couponTotal && coupon.status === 'completed');
  const principalTotal = integer(principal?.totalMinor);
  const principalPaid = integer(principal?.paidMinor);
  const principalSettled = Boolean(principal && principalTotal !== null && principalPaid !== null && principalTotal === principalPaid && instrument?.status === 'redeemed');
  const outstandingUnits = instrument ? subtract(instrument.issuedSupply, instrument.redeemedSupply) : undefined;
  const lifeStage = instrument ? [
    { label: tr('Terms', 'Условия'), done: true },
    { label: tr('Placement', 'Размещение'), done: (integer(instrument.issuedSupply) ?? 0n) > 0n },
    { label: tr('Reserve', 'Резерв'), done: instrument.status !== 'draft' },
    { label: tr('Active', 'Активен'), done: ['active', 'redeeming', 'redeemed'].includes(instrument.status) },
    { label: tr('Redeemed', 'Погашен'), done: instrument.status === 'redeemed' },
  ] : [];
  const currentLife = lifeStage.findIndex(stage => !stage.done);
  const eligibleWeight = proposal ? add(proposal.eligibleWeights.map(item => item.units)) : undefined;
  const couponId = integer(coupon?.id);
  const issueStatus = instrument?.status === 'redeemed' ? tr('Redeemed', 'Погашен')
    : instrument?.status === 'redeeming' ? tr('Redemption open', 'Погашение открыто')
      : instrument?.status === 'active' ? tr('Active', 'Активен') : tr('Draft', 'Черновик');
  const recentActivity = state.activity.slice(0, 3);
  const isConfirmed = (status: string) => status === 'confirmed' || status === 'finalized';
  const neutralActivityNames: Record<string, string> = {
    capture_coupon: tr('Record coupon rights', 'Фиксация купонных прав'),
    claim_coupon: tr('Coupon payment', 'Купонная выплата'),
    settle_coupon: tr('Coupon payment', 'Купонная выплата'),
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
    capture_action_page: tr('Capture page', 'Фиксация страницы'),
    finalize_action: tr('Snapshot', 'Снимок'),
  };
  const activityName = (kind: string, status: string) => {
    if (isConfirmed(status) && receiptLabels[kind]) return tr(receiptLabels[kind][0], receiptLabels[kind][1]);
    const base = kind.replace(/_v2$/, '');
    const aliases: Record<string, string> = {begin_coupon:'capture_coupon',create_proposal:'create_vote',transfer_units:'transfer_bonds',register_receiver:'register_holder'};
    return neutralActivityNames[aliases[base] || base] || kind.replaceAll('_', ' ');
  };


  const couponName = coupon ? tr('Coupon', 'Купон') + ' ' + units(couponId === null ? undefined : couponId + 1n) : tr('Coupon', 'Купон');
  return <div className="clear-overview">
    <h1 className="sr-only">{tr('Overview', 'Обзор')}</h1>
    <section className="clear-payment-section" aria-labelledby="overview-payments-title">
      <div className="clear-section-heading"><div><h2 id="overview-payments-title">{tr('Issue payments', 'Выплаты по выпуску')}</h2><p>{tr('Latest recorded coupon and principal repayment', 'Последний зафиксированный купон и возврат номинала')}</p></div><Button onClick={onCreate}><FilePlus2 size={18} aria-hidden="true" />{tr('Create an issue', 'Создать выпуск')}</Button></div>
      <div className="clear-payment-grid">
        <article className="clear-payment-card">
          <header><Banknote size={22} aria-hidden="true" /><div><h3>{couponName}</h3><p>{tr('Bond income', 'Доход по облигациям')}</p></div><Badge tone={couponSettled ? 'success' : coupon ? 'blue' : 'neutral'}>{couponSettled ? tr('Paid', 'Выплачен') : coupon ? tr('Rights recorded', 'Права зафиксированы') : couponCapturing ? tr('Recording rights', 'Фиксируются права') : tr('Scheduled', 'По расписанию')}</Badge></header>
          {coupon ? <><div className="clear-payment-total"><span>{tr('Total coupon amount', 'Общая сумма купона')}</span><Money value={coupon.totalMinor} unit /></div><dl className="clear-payment-breakdown"><div><dt>{tr('Already paid', 'Уже выплачено')}</dt><dd><Money value={coupon.paidMinor} /></dd></div><div><dt>{tr('Still to pay', 'Осталось выплатить')}</dt><dd><Money value={subtract(coupon.totalMinor, coupon.paidMinor)} /></dd></div></dl><dl className="clear-payment-context"><div><dt>{tr('Payment date', 'Дата выплаты')}</dt><dd><DisplayDate value={coupon.paymentAt} /></dd></div><div><dt>{tr('Recipients', 'Получателей')}</dt><dd className="number">{units(coupon.entitlements.length)}</dd></div></dl></> : <p className="clear-no-record">{tr('Payment amounts appear after holder rights are recorded.', 'Суммы появятся после фиксации прав держателей.')}</p>}
          <footer><Button onClick={() => onNavigate('payments', 'coupon', coupon?.id)}>{coupon ? tr('Coupon recipients', 'Получатели купона') : tr('Open payments', 'Перейти к выплатам')}<ArrowRight size={17} aria-hidden="true" /></Button></footer>
        </article>
        <article className="clear-payment-card">
          <header><Landmark size={22} aria-hidden="true" /><div><h3>{tr('Principal repayment', 'Возврат номинала')}</h3><p>{tr('Repayment of the principal to holders', 'Возврат основной суммы держателям')}</p></div><Badge tone={principalSettled ? 'success' : principal ? 'blue' : 'neutral'}>{principalSettled ? tr('Repaid', 'Возвращён') : principal ? tr('Redemption open', 'Погашение открыто') : tr('Scheduled', 'По расписанию')}</Badge></header>
          {principal ? <><div className="clear-payment-total"><span>{tr('Total principal amount', 'Общая сумма номинала')}</span><Money value={principal.totalMinor} unit /></div><dl className="clear-payment-breakdown"><div><dt>{tr('Already repaid', 'Уже возвращено')}</dt><dd><Money value={principal.paidMinor} /></dd></div><div><dt>{tr('Still to repay', 'Осталось вернуть')}</dt><dd><Money value={subtract(principal.totalMinor, principal.paidMinor)} /></dd></div></dl><dl className="clear-payment-context"><div><dt>{tr('Maturity date', 'Дата погашения')}</dt><dd><DisplayDate value={instrument?.maturityAt} /></dd></div><div><dt>{tr('Bonds retired', 'Облигаций погашено')}</dt><dd className="number">{units(instrument?.redeemedSupply)}</dd></div></dl></> : <><p className="clear-no-record">{tr('Principal allocations appear when redemption opens.', 'Суммы появятся после открытия погашения.')}</p><dl className="clear-payment-context"><div><dt>{tr('Maturity date', 'Дата погашения')}</dt><dd><DisplayDate value={instrument?.maturityAt}/></dd></div><div><dt>{tr('Bonds outstanding', 'Облигаций в обращении')}</dt><dd className="number">{units(outstandingUnits)}</dd></div></dl></>}
          <footer><Button onClick={() => onNavigate('payments', 'principal')}>{tr('Repayment recipients', 'Получатели погашения')}<ArrowRight size={17} aria-hidden="true" /></Button></footer>
        </article>
      </div>
      <p className="clear-payment-zone"><Clock3 size={15} aria-hidden="true" />{tr('Time zone', 'Часовой пояс')}: {timeZoneLabel(timeZone, language)} · {tr('Amounts in settlement units', 'Суммы в расчётных единицах')}</p>
    </section>
    <div className="clear-secondary-grid">
      <section className="clear-vote-panel"><header><Vote size={20} aria-hidden="true" /><h2>{tr('Holder voting', 'Голосование держателей')}</h2>{proposal && <Badge tone={proposal.status === 'open' ? 'blue' : 'neutral'}>{proposal.status === 'closed' ? tr('Closed', 'Завершено') : proposal.status === 'capturing' ? tr('Recording rights', 'Фиксируются права') : tr('Open', 'Открыто')}</Badge>}</header>{proposal ? <><h3 translate="no">{proposal.title}</h3><dl className="clear-vote-values"><div><dt>{tr('For', 'За')}</dt><dd className="number">{units(proposal.yesWeight)}</dd></div><div><dt>{tr('Against', 'Против')}</dt><dd className="number">{units(proposal.noWeight)}</dd></div><div><dt>{tr('Total voting rights', 'Всего прав голоса')}</dt><dd className="number">{units(eligibleWeight)}</dd></div></dl></> : <p>{tr('No proposal yet.', 'Предложений пока нет.')}</p>}<Button variant="ghost" onClick={() => onNavigate('voting')}>{tr('Voting details', 'Результаты голосования')}<ArrowRight size={17} aria-hidden="true" /></Button></section>
      <section className="clear-activity-panel"><header><ReceiptText size={20} aria-hidden="true" /><h2>{tr('Recent operations', 'Последние операции')}</h2></header>{recentActivity.length ? <ul>{recentActivity.map((item,index) => <li key={item.signature + '-' + index}><div><strong>{activityName(item.kind, item.status)}</strong>{isConfirmed(item.status) && <span className="muted">{tr('Observed confirmation', 'Подтверждение отмечено')}</span>}<DisplayDate value={item.time} /></div><Badge tone={item.status === 'confirmed' ? 'success' : item.status === 'error' ? 'error' : 'neutral'}>{item.status === 'confirmed' ? tr('Confirmed', 'Подтверждено') : item.status === 'error' ? tr('Failed', 'Ошибка') : item.status}</Badge></li>)}</ul> : <p>{tr('No operations yet.', 'Операций пока нет.')}</p>}<Button variant="ghost" onClick={onReceipts}>{tr('Activity log', 'История операций')}<ArrowRight size={17} aria-hidden="true" /></Button></section>
    </div>
    {instrument && <details className="clear-issue-details"><summary>{tr('Issue terms and accounts', 'Условия и реквизиты выпуска')}</summary><div><ol className="clear-lifecycle" aria-label={tr('Issue lifecycle', 'Этапы выпуска')}>{lifeStage.map((stage,index) => <li key={stage.label} aria-current={index === currentLife ? 'step' : undefined}><span>{index+1}</span>{stage.label}</li>)}</ol><dl className="clear-issue-facts"><div><dt>{tr('Face value per bond', 'Номинал одной облигации')}</dt><dd><Money value={instrument.faceValueMinor} unit /></dd></div><div><dt>{tr('Bonds issued', 'Облигаций размещено')}</dt><dd>{units(instrument.issuedSupply)}</dd></div><div><dt>{tr('Bonds outstanding', 'Облигаций в обращении')}</dt><dd>{units(outstandingUnits)}</dd></div><div><dt>{tr('Issue address', 'Адрес выпуска')}</dt><dd><Address value={instrument.address} /></dd></div><div><dt>{tr('Issuer account', 'Кошелёк эмитента')}</dt><dd><Address value={instrument.issuer} /></dd></div></dl><Button onClick={() => onNavigate('issuer')}>{tr('Manage issue', 'Управление выпуском')}<ArrowRight size={17} aria-hidden="true" /></Button></div></details>}
  </div>;
}
