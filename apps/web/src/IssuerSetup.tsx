import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Banknote, CalendarDays, ChevronDown, Clock3, FilePlus2, LockKeyhole, Plus, ShieldCheck, Trash2, UsersRound, WalletCards } from 'lucide-react';
import { Address, Badge, Button, Money, Panel } from './components';
import { DateTimeField } from './DateTimeField';
import { date, integer, units } from './format';
import { useDisplayPreferences } from './display-preferences';
import { captureDraftInstants, draftHasInput, issuerDraftKey, parseIssuerDraft, rebaseDraft, resolveDraftSeconds, type IssuerDraftSnapshot } from './issuer-draft';
import { dateParts, timeZoneLabel } from './time-zone';
import { addressError, issuanceError, issueReserve, localDateInput, MAX_COUPONS, MAX_HOLDERS, parseBondCount, parseSettlementAmount, utf8Error, validateIssueDraft, type CouponDraft, type IssueDraft } from './issuer-validation';
import type { ChainState } from './types';
import './issuer.css';

export interface IssuerIntent {
  action: 'initialize_issue' | 'register_holder' | 'issue_units' | 'seal_issue' | 'fund_vault';
  params: Record<string, string>;
  title: string;
  explanation: string;
  amountMinor?: string;
}
export interface IssuerSetupProps {
  state: ChainState;
  walletAddress?: string;
  canAct: boolean;
  busy: boolean;
  onAction: (request: IssuerIntent) => void;
  onChooseIssue?: (bond: string) => void;
  language?: 'ru' | 'en';
  startNew?: boolean;
  onCreationChange?: (creating: boolean) => void;
  onViewPayments?: () => void;
  onViewReceipts?: () => void;
}

function generatedSeriesId(): string {
  const random = new Uint16Array(1);
  crypto.getRandomValues(random);
  return ((BigInt(Date.now()) << 16n) | BigInt(random[0])).toString();
}
function newCoupon(): CouponDraft { return { key: crypto.randomUUID(), recordLocal: '', paymentLocal: '', amount: '' }; }
function focusInvalid(form: HTMLFormElement | null) {
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
function TextField({ id, label, hint, error, children, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; children?: ReactNode }) {
  return <div className="issuer-field"><label htmlFor={id}>{label.replace(' (required)', '')}<span className="issuer-required" aria-hidden="true">*</span></label><input id={id} name={props.name || id} required autoComplete="off" spellCheck={false} {...props} aria-invalid={Boolean(error) || undefined} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} />{hint && <p id={`${id}-hint`} className="issuer-field-hint">{hint}</p>}{error && <p id={`${id}-error`} className="issuer-field-error" aria-live="polite">{error}</p>}{children}</div>;
}
function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`issuer-note ${warning ? 'warning' : ''}`}><AlertCircle size={18} aria-hidden="true" /><div>{children}</div></div>;
}
function ChecklistRow({ index, complete, label, detail }: { index: number; complete: boolean; label: string; detail: string }) {
  return <li className={complete ? 'complete' : ''}><span className="issuer-check-icon" aria-hidden="true">{index}</span><div><strong>{label}</strong><p>{detail}</p></div></li>;
}

export function IssuerSetup({ state, walletAddress, canAct, busy, onAction, language = 'en', startNew = false, onCreationChange, onViewPayments, onViewReceipts }: IssuerSetupProps) {
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const instrument = state.instrument;
  const id = useId();
  const [holderWallet, setHolderWallet] = useState('');
  const [holderLabel, setHolderLabel] = useState('');
  const [registrationTouched, setRegistrationTouched] = useState({ wallet: false, label: false });
  const [selectedHolder, setSelectedHolder] = useState('');
  const [bondCount, setBondCount] = useState('');
  const [issuanceTried, setIssuanceTried] = useState(false);
  const [countTouched, setCountTouched] = useState(false);
  const [internalNewOpen, setInternalNewOpen] = useState(startNew || !instrument);
  const newOpen = onCreationChange ? startNew || !instrument : internalNewOpen;
  function setNewOpen(open: boolean) { setInternalNewOpen(open); onCreationChange?.(open); }
  const { timeZone } = useDisplayPreferences();
  const [registerOpen, setRegisterOpen] = useState(!state.holders.length);
  const [clockTick, setClockTick] = useState(0);
  const registerForm = useRef<HTMLFormElement>(null), issuanceForm = useRef<HTMLFormElement>(null);
  const [invalidFocusRequest, setInvalidFocusRequest] = useState<{ target: 'register' | 'issuance'; sequence: number }>({ target: 'register', sequence: 0 });
  useLayoutEffect(() => {
    if (!invalidFocusRequest.sequence) return;
    focusInvalid(invalidFocusRequest.target === 'register' ? registerForm.current : issuanceForm.current);
  }, [invalidFocusRequest]);
  const serverAnchor = useRef({ time: state.serverTime, received: Date.now() });
  const pendingHolder = useRef('');
  const issueAddress = useRef(instrument?.address);
  const reserve = useMemo(() => issueReserve(state), [state]);
  // Advance supplied chain time between reads so the cutoff disables actions without another click.
  if (serverAnchor.current.time !== state.serverTime) serverAnchor.current = { time: state.serverTime, received: Date.now() };
  useEffect(() => { const timer = window.setInterval(() => setClockTick(value => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  const nowSeconds = Math.floor((Date.parse(serverAnchor.current.time) + Date.now() - serverAnchor.current.received) / 1000);
  void clockTick;
  const cutoff = instrument ? Date.parse(instrument.recordAt) / 1000 : NaN;
  const beforeCutoff = Number.isSafeInteger(nowSeconds) && Number.isFinite(cutoff) && nowSeconds < cutoff;
  const isIssuer = Boolean(walletAddress && walletAddress === instrument?.issuer);
  const draft = instrument?.status === 'draft';
  const canAdmin = Boolean(draft && isIssuer && canAct && !busy && state.connected && beforeCutoff);
  const connectedHint = state.readOnlySnapshot ? tr('Saved snapshot is read-only. Use the live test network to submit an issue.', 'Сохранённый снимок доступен только для просмотра. Для создания выпуска нужна действующая тестовая сеть.') : busy ? tr('Finish the current transaction first.', 'Сначала завершите текущую операцию.') : !state.connected ? tr('Refresh the chain connection.', 'Обновите подключение к сети.') : !walletAddress ? tr('Connect a wallet or choose the workspace issuer.', 'Подключите кошелёк или выберите эмитента в рабочем пространстве.') : !canAct ? tr('Resolve the current operation or refresh chain state.', 'Завершите текущую операцию или обновите данные сети.') : !isIssuer ? tr('Choose this issue’s issuer wallet to manage placement.', 'Для размещения выберите кошелёк эмитента этого выпуска.') : !beforeCutoff ? tr('The first record date has passed. Placement and activation are closed.', 'Первый срез уже прошёл. Размещение и активация недоступны.') : '';
  const walletProblem = addressError(holderWallet) || (state.holders.some(holder => holder.wallet === holderWallet.trim()) ? 'This wallet is already registered for this issue.' : null);
  const labelProblem = utf8Error(holderLabel, 'Holder label');
  const countProblem = instrument ? issuanceError(bondCount, instrument.issuedSupply, reserve.unitMinor) : 'Select an issue first.';
  const holderProblem = state.holders.some(holder => holder.wallet === selectedHolder) ? null : 'Choose a registered holder.';
  const registeredFull = state.holders.length >= MAX_HOLDERS;
  const supplyPositive = (integer(instrument?.issuedSupply) ?? 0n) > 0n;
  const reserveReady = reserve.gapMinor === '0' && reserve.requiredMinor != null && supplyPositive;
  const remainingBalance = (instrument as typeof instrument & { settlementBalanceMinor?: string } | null)?.settlementBalanceMinor;
  const funderEnough = remainingBalance == null || (integer(remainingBalance) != null && integer(remainingBalance)! >= (integer(reserve.gapMinor) ?? 0n));
  const registrationHint = connectedHint || (registeredFull ? tr('Registry limit reached: 16 holders.', 'Достигнут предел: 16 держателей.') : '');
  const placementHint = connectedHint || (!state.holders.length ? tr('Register a holder before placing bonds.', 'Перед размещением зарегистрируйте держателя.') : '');
  const fundingHint = connectedHint || (!supplyPositive ? tr('Place at least one bond before funding.', 'Сначала разместите хотя бы одну облигацию.') : reserve.error ? localizedIssuerError(reserve.error, language) : !reserve.gapMinor ? tr('The funding gap is unavailable. Refresh chain state.', 'Сумма пополнения недоступна. Обновите данные сети.') : reserve.gapMinor === '0' ? tr('The vault already covers the full reserve.', 'В хранилище уже есть весь необходимый резерв.') : !funderEnough ? tr('Add settlement assets to the issuer’s account first.', 'Сначала пополните расчётный счёт эмитента.') : '');
  const activationHint = connectedHint || (!state.holders.length ? tr('Register a holder first.', 'Сначала зарегистрируйте держателя.') : !supplyPositive ? tr('Place bonds first.', 'Сначала разместите облигации.') : reserve.error ? localizedIssuerError(reserve.error, language) : !reserveReady ? tr('Cover principal and all coupons before activation.', 'До активации обеспечьте номинал и все купоны.') : '');

  useEffect(() => {
    if (issueAddress.current !== instrument?.address) {
      issueAddress.current = instrument?.address;
      setHolderWallet(''); setHolderLabel(''); setBondCount(''); setRegistrationTouched({ wallet: false, label: false }); setIssuanceTried(false); setCountTouched(false); pendingHolder.current = '';
      setSelectedHolder(state.holders[0]?.wallet || '');
      setRegisterOpen(!state.holders.length);
      if (instrument?.status === 'draft') setNewOpen(false);
    } else if (pendingHolder.current && state.holders.some(holder => holder.wallet === pendingHolder.current)) {
      setSelectedHolder(pendingHolder.current); pendingHolder.current = '';
      setHolderWallet(''); setHolderLabel(''); setRegistrationTouched({ wallet: false, label: false });
      setRegisterOpen(false);
    } else if (!state.holders.some(holder => holder.wallet === selectedHolder)) setSelectedHolder(state.holders[0]?.wallet || '');
  }, [instrument?.address, instrument?.status, state.holders, selectedHolder]);

  function register(event: FormEvent) {
    event.preventDefault(); setRegistrationTouched({ wallet: true, label: true });
    if (walletProblem || labelProblem) { setInvalidFocusRequest(previous => ({ target: 'register', sequence: previous.sequence + 1 })); return; }
    if (!canAdmin || registeredFull || !instrument) return;
    pendingHolder.current = holderWallet.trim();
    onAction({ action: 'register_holder', params: { holderWallet: holderWallet.trim(), label: holderLabel.trim() }, title: 'Register holder', explanation: 'Add this wallet to the confirmed holder registry. Its bond account is created and kept frozen outside allowed transfers. The display label is local metadata, not identity verification.' });
  }
  function issue(event: FormEvent) {
    event.preventDefault(); setIssuanceTried(true); setCountTouched(true);
    if (countProblem || holderProblem) { setInvalidFocusRequest(previous => ({ target: 'issuance', sequence: previous.sequence + 1 })); return; }
    if (!canAdmin || !instrument) return;
    const count = parseBondCount(bondCount); if (!count.value) return;
    onAction({ action: 'issue_units', params: { holderWallet: selectedHolder, units: count.value }, title: 'Issue bonds', explanation: `Place ${units(count.value)} whole bonds with the selected registered holder. This increases the required reserve for principal and every fixed coupon. No settlement funds are collected by this placement action.` });
  }

  const phases = [
    { label: tr('Terms', 'Условия'), detail: tr('Nominal & schedule', 'Номинал и расписание'), complete: true },
    { label: tr('Placement', 'Размещение'), detail: `${state.holders.length} ${tr('registered holders', 'держателей')}`, complete: state.holders.length > 0 && supplyPositive },
    { label: tr('Reserve', 'Резерв'), detail: reserveReady ? tr('Fully covered', 'Обеспечен') : tr('Cover all payments', 'Обеспечьте выплаты'), complete: reserveReady },
    { label: tr('Activate', 'Активация'), detail: draft ? tr('Close placement', 'Завершите размещение') : tr('Issue activated', 'Выпуск активирован'), complete: !draft },
  ];
  const currentPhase = phases.findIndex(phase => !phase.complete);
  const outstandingCoupons = state.coupons.filter(coupon => coupon.snapshotAddress && coupon.entitlements.some(entitlement => !entitlement.claimed));
  const recordedCoupons = state.coupons.filter(coupon => coupon.snapshotAddress);
  const paidCouponAmounts = state.coupons.map(coupon => integer(coupon.paidMinor));
  const couponsPaidMinor = paidCouponAmounts.some(value => value == null) ? undefined : paidCouponAmounts.reduce<bigint>((sum, value) => sum + value!, 0n).toString();
  const issuerStateDescription = draft ? tr('Manage placement and payment reserve.', 'Управляйте размещением и резервом выплат.')
    : instrument?.status === 'active' ? tr('Placement is closed. Service the payment schedule.', 'Размещение закрыто. Выполняйте расписание выплат.')
    : instrument?.status === 'redeeming' ? tr('Principal repayment is available to recorded holders.', 'Держателям зафиксированных прав доступно погашение.')
    : outstandingCoupons.length ? tr('Principal is repaid. Recorded coupon rights remain.', 'Номинал погашен. Сохранены невыплаченные купонные права.')
    : tr('Principal and all recorded coupons are paid.', 'Номинал и все зафиксированные купоны выплачены.');
  const firstRecordDate = instrument ? dateParts(instrument.recordAt, timeZone, language) : null;

  return <div className="issuer-desk">
    <div className="page-heading">
      <div><h1>{newOpen ? tr('New issue', 'Новый выпуск') : tr('Issuer desk', 'Кабинет эмитента')}</h1>{!newOpen && <p>{issuerStateDescription}</p>}</div>
      {instrument && (newOpen ? <Button disabled={busy} onClick={() => setNewOpen(false)}><ArrowLeft size={16} aria-hidden="true" />{tr('Back to current issue', 'К текущему выпуску')}</Button> : <Button onClick={() => { setNewOpen(true); window.requestAnimationFrame(() => document.getElementById(`${id}-create-form`)?.querySelector<HTMLInputElement>('input')?.focus()); }}><Plus size={16} aria-hidden="true" />{tr('New issue', 'Новый выпуск')}</Button>)}
    </div>
    <div className="issuer-management" hidden={newOpen}>
    {instrument && <section className="issuer-current" aria-label={tr('Selected issue', 'Выбранный выпуск')}>
      <div className="issuer-current-title"><div><h2>{instrument.name}</h2>{draft && <p>{tr('Complete placement before the first record date.', 'Завершите размещение до первого среза держателей.')}</p>}</div><Badge tone={draft ? 'warning' : instrument.status === 'active' ? 'blue' : 'success'}>{draft ? tr('Draft', 'Черновик') : instrument.status === 'active' ? tr('Active', 'Активен') : instrument.status === 'redeeming' ? tr('Redemption open', 'Погашение открыто') : tr('Redeemed', 'Погашен')}</Badge></div>
      <dl className="issuer-current-facts">
        <div><dt>{tr('Issue address', 'Адрес выпуска')}</dt><dd><Address value={instrument.address} /></dd></div>
        <div><dt>{tr('Issuer authority', 'Кошелёк эмитента')}</dt><dd><Address value={instrument.issuer} /></dd></div>
        <div><dt>{tr('Bonds placed', 'Облигаций размещено')}</dt><dd className="number">{units(instrument.issuedSupply)}</dd></div>
        <div><dt>{tr('First record date', 'Первый срез держателей')}</dt><dd className="issuer-date"><span>{firstRecordDate?.date}</span><span>{firstRecordDate?.time}</span></dd></div>
      </dl>
      <p className="issuer-date-zone">{tr('Times in', 'Время в поясе')} {timeZoneLabel(timeZone, language)}</p>
      {draft && <ol className="issuer-phase-rail" aria-label={tr('Issue setup progress', 'Готовность выпуска')}>{phases.map((phase, index) => <li className={`${phase.complete ? 'complete' : ''} ${index === currentPhase ? 'current' : ''}`} key={phase.label} aria-current={index === currentPhase ? 'step' : undefined}><span className="issuer-phase-marker">{index + 1}</span><div><strong>{phase.label}</strong><span>{phase.detail}</span></div></li>)}</ol>}
    </section>}
    {draft && instrument ? <>
      {connectedHint && <Notice warning><p>{connectedHint}</p></Notice>}
      <div className="issuer-workspace-grid">
        <div className="issuer-placement">
          <Panel title={tr('Register & place', 'Регистрация и размещение')} action={<Badge>{state.holders.length} / {MAX_HOLDERS} {tr('holders', 'держателей')}</Badge>}>
            <div className="issuer-panel-body">
              <p className="issuer-intro">{tr('Register a wallet, then allocate whole bonds to it.', 'Зарегистрируйте кошелёк, затем разместите на нём целые облигации.')}</p>
              <div className="issuer-holder-list" aria-label={tr('Confirmed registered holders', 'Зарегистрированные держатели')}>
                {state.holders.length ? <ul>{state.holders.map(holder => <li key={holder.wallet}><div><strong>{holder.label}</strong><Address value={holder.wallet} /></div><span className="number">{units(holder.units)}<small>{tr('bonds', 'облигаций')}</small></span></li>)}</ul> : <div className="issuer-inline-empty"><UsersRound size={22} aria-hidden="true" /><div><strong>{tr('Start with a holder wallet', 'Начните с кошелька держателя')}</strong><p>{tr('Register its address, then allocate the bonds.', 'Зарегистрируйте адрес, затем разместите облигации.')}</p></div></div>}
              </div>
              <button type="button" className="issuer-inline-toggle" aria-expanded={registerOpen} aria-controls={`${id}-register-form`} disabled={busy || registeredFull} onClick={() => setRegisterOpen(value => !value)}><Plus size={16} aria-hidden="true" />{tr('Add holder', 'Добавить держателя')}<ChevronDown className={registerOpen ? 'expanded' : ''} size={16} aria-hidden="true" /></button>
              {registeredFull && <p className="issuer-field-hint">{tr('Registry limit reached:', 'Достигнут предел:')} {MAX_HOLDERS} {tr('holders', 'держателей')}.</p>}
              <div id={`${id}-register-form`} hidden={!registerOpen}>
                <form ref={registerForm} className="issuer-form issuer-register-form" noValidate onSubmit={register}>
                  <fieldset disabled={busy}><legend className="issuer-form-legend">{tr('Holder details', 'Данные держателя')}</legend>
                    <TextField id={`${id}-holder-wallet`} label={tr('Solana wallet', 'Кошелёк Solana')} value={holderWallet} onChange={event => { setHolderWallet(event.target.value); setRegistrationTouched(previous => ({ ...previous, wallet: false })); }} onBlur={() => setRegistrationTouched(previous => ({ ...previous, wallet: true }))} error={registrationTouched.wallet ? localizedIssuerError(walletProblem, language) : undefined} hint={tr('Paste the complete wallet address.', 'Вставьте полный адрес кошелька.')} autoCapitalize="none" />
                    <TextField id={`${id}-holder-label`} label={tr('Holder label', 'Имя держателя')} value={holderLabel} onChange={event => { setHolderLabel(event.target.value); setRegistrationTouched(previous => ({ ...previous, label: false })); }} onBlur={() => setRegistrationTouched(previous => ({ ...previous, label: true }))} error={registrationTouched.label ? localizedIssuerError(labelProblem, language) : undefined} hint={tr('Internal label; it does not verify identity.', 'Внутреннее имя. Оно не подтверждает личность.')} />
                  </fieldset>
                  <div className="issuer-form-action"><Button type="submit" disabled={!canAdmin || registeredFull} busy={busy}>{tr('Review registration', 'Проверить регистрацию')}<ArrowRight size={16} aria-hidden="true" /></Button>{registrationHint && <p className="issuer-action-reason">{registrationHint}</p>}</div>
                </form>
              </div>
              <form ref={issuanceForm} className="issuer-form issuer-issue-form" noValidate onSubmit={issue}>
                <fieldset disabled={busy}><legend className="issuer-form-legend"><FilePlus2 size={17} aria-hidden="true" />{tr('Place bonds', 'Разместить облигации')}</legend>
                  <div className="issuer-field"><label htmlFor={`${id}-target`}>{tr('Registered holder', 'Зарегистрированный держатель')}<span className="issuer-required" aria-hidden="true">*</span></label><select id={`${id}-target`} required value={selectedHolder} disabled={!state.holders.length || busy} onChange={event => setSelectedHolder(event.target.value)} aria-invalid={issuanceTried && Boolean(holderProblem) || undefined} aria-describedby={issuanceTried && holderProblem ? `${id}-target-error` : undefined}><option value="">{tr('Choose a holder', 'Выберите держателя')}</option>{state.holders.map(holder => <option value={holder.wallet} key={holder.wallet}>{holder.label} · {holder.wallet}</option>)}</select>{issuanceTried && holderProblem && <p id={`${id}-target-error`} className="issuer-field-error">{localizedIssuerError(holderProblem, language)}</p>}</div>
                  <TextField id={`${id}-bond-count`} label={tr('Number of bonds', 'Количество облигаций')} inputMode="numeric" value={bondCount} onChange={event => { setBondCount(event.target.value); setCountTouched(false); }} onBlur={() => setCountTouched(true)} error={countTouched ? localizedIssuerError(countProblem, language) : undefined} hint={tr('Whole bonds only. Placement increases the required reserve.', 'Только целые облигации. Размещение увеличивает необходимый резерв.')} />
                </fieldset>
                <Button type="submit" variant="primary" disabled={!canAdmin || !state.holders.length} busy={busy}>{tr('Review placement', 'Проверить размещение')}<ArrowRight size={16} aria-hidden="true" /></Button>
                {placementHint && <p className="issuer-action-reason">{placementHint}</p>}
              </form>
            </div>
          </Panel>
        </div>
        <aside className="issuer-reserve-column" aria-label={tr('Reserve and activation', 'Резерв и активация')}>
          <Panel title={tr('Payment reserve', 'Резерв выплат')} className="issuer-reserve-panel">
            <div className="issuer-panel-body">
              <dl className="issuer-reserve-breakdown">
                <div><dt>{tr('Principal', 'Номинал')}</dt><dd><Money value={reserve.principalMinor} /></dd></div>
                <div><dt>{tr('Fixed coupons', 'Фиксированные купоны')}</dt><dd><Money value={reserve.couponMinor} /></dd></div>
                <div className="total"><dt>{tr('Required reserve', 'Необходимый резерв')}</dt><dd><Money value={reserve.requiredMinor} /></dd></div>
                <div><dt>{tr('Already in vault', 'Уже в хранилище')}</dt><dd><Money value={instrument.vaultBalanceMinor} /></dd></div>
              </dl>
              <div className={`issuer-gap ${reserveReady ? 'covered' : ''}`} role="status" aria-live="polite" aria-atomic="true"><div><span>{reserveReady ? tr('Fully reserved', 'Полностью обеспечен') : tr('Amount to fund', 'Нужно пополнить')}</span></div><Money value={reserve.gapMinor} /><small>{tr('settlement units', 'расчётные единицы')}</small></div>
              {reserve.error && <p className="issuer-field-error" role="alert">{localizedIssuerError(reserve.error, language)}</p>}
              {remainingBalance != null && <p className="issuer-balance-hint">{tr('Available to issuer:', 'Доступно эмитенту:')} <Money value={remainingBalance} /></p>}
              {!funderEnough && <p className="issuer-field-error">{tr('The issuer’s settlement account cannot cover the gap.', 'На расчётном счёте эмитента не хватает средств.')}</p>}
              <Button disabled={!canAdmin || !supplyPositive || !reserve.gapMinor || reserve.gapMinor === '0' || Boolean(reserve.error) || !funderEnough} busy={busy} onClick={() => { if (!canAdmin || !reserve.gapMinor || reserve.gapMinor === '0') return; onAction({ action: 'fund_vault', params: { amountMinor: reserve.gapMinor }, title: 'Fund required reserve', explanation: 'Transfer exactly the current funding gap from the issuer’s settlement account to this issue’s vault. There is no issuer withdrawal instruction. The transaction is simulated before signing.', amountMinor: reserve.gapMinor }); }}><Banknote size={16} aria-hidden="true" />{tr('Review funding', 'Проверить пополнение')}</Button>
              {fundingHint && <p className="issuer-action-reason">{fundingHint}</p>}
              <p className="issuer-field-hint">{tr('Transfers only the gap. More bonds require a larger reserve.', 'Переводится только недостающая сумма. Дополнительные облигации увеличивают резерв.')}</p>
            </div>
          </Panel>
          <Panel title={tr('Ready to activate?', 'Готовы к активации?')} className="issuer-activation-panel">
            <div className="issuer-panel-body">
              <ul className="issuer-checklist">
                <ChecklistRow index={1} complete={true} label={tr('Terms recorded', 'Условия зафиксированы')} detail={`${state.coupons.length} ${tr('fixed coupons', 'фиксированных купонов')}`} />
                <ChecklistRow index={2} complete={state.holders.length > 0} label={tr('Holders registered', 'Держатели зарегистрированы')} detail={`${state.holders.length} ${tr('confirmed wallets', 'кошельков')}`} />
                <ChecklistRow index={3} complete={supplyPositive} label={tr('Bonds placed', 'Облигации размещены')} detail={`${units(instrument.issuedSupply)} ${tr('whole bonds', 'целых облигаций')}`} />
                <ChecklistRow index={4} complete={reserveReady} label={tr('Payments covered', 'Выплаты обеспечены')} detail={reserveReady ? tr('Principal and all coupons', 'Номинал и все купоны') : tr('Fund the vault first', 'Сначала пополните резерв')} />
                <ChecklistRow index={5} complete={beforeCutoff} label={tr('Before first record date', 'До первого среза')} detail={date(instrument.recordAt, true, language)} />
              </ul>
              <div className="issuer-seal-warning"><LockKeyhole size={16} aria-hidden="true" /><p>{tr('Activation permanently closes registration and placement.', 'Активация навсегда завершает регистрацию и размещение.')}</p></div>
              <Button variant="primary" disabled={!canAdmin || !reserveReady || !state.holders.length || Boolean(reserve.error)} busy={busy} onClick={() => { if (!canAdmin || !reserveReady) return; onAction({ action: 'seal_issue', params: {}, title: 'Activate and seal issue', explanation: 'Seal this draft and begin its corporate-action lifecycle. This permanently closes holder registration and additional issuance. Principal and every fixed coupon are prefunded; the program rechecks supply and reserves.', amountMinor: reserve.requiredMinor }); }}>{tr('Review activation', 'Проверить активацию')}<ArrowRight size={16} aria-hidden="true" /></Button>
              {activationHint && <p className="issuer-action-reason">{activationHint}</p>}
            </div>
          </Panel>
        </aside>
      </div>
    </> : instrument && <section className="issuer-servicing" aria-label={tr('Servicing results', 'Результаты обслуживания')}>
      <dl className="issuer-servicing-results"><div><dt>{tr('Coupon payments', 'Купонные выплаты')}</dt><dd><Money value={couponsPaidMinor} /></dd><p>{!recordedCoupons.length ? tr('Holder rights have not been recorded yet', 'Права держателей ещё не зафиксированы') : outstandingCoupons.length ? tr('Recorded claims remain unpaid', 'Есть невыплаченные зафиксированные права') : tr('All recorded claims are paid', 'Все зафиксированные права оплачены')}</p></div><div><dt>{tr('Principal repaid', 'Номинал погашен')}</dt><dd><Money value={state.redemption?.paidMinor} /></dd><p>{units(instrument.redeemedSupply)} {tr('bonds redeemed', 'облигаций погашено')}</p></div></dl>
      <div className="issuer-servicing-actions">{onViewPayments && <Button onClick={onViewPayments}>{tr('View payments', 'Посмотреть выплаты')}<ArrowRight size={16} aria-hidden="true" /></Button>}{onViewReceipts && <Button variant="ghost" onClick={onViewReceipts}>{tr('View history', 'Посмотреть историю')}<ArrowRight size={16} aria-hidden="true" /></Button>}</div>
    </section>}
    </div>
    <div id={`${id}-create-form`} hidden={!newOpen}><NewIssueForm key={issuerDraftKey(state.network, walletAddress)} state={state} walletAddress={walletAddress} canAct={canAct} busy={busy} nowSeconds={nowSeconds} onAction={onAction} language={language} /></div>
  </div>;
}
function NewIssueForm({ state, walletAddress, canAct, busy, nowSeconds, onAction, language = 'en' }: Omit<IssuerSetupProps, 'onChooseIssue'> & { nowSeconds: number }) {
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const id = useId();
  const { timeZone } = useDisplayPreferences();
  const storageKey = issuerDraftKey(state.network, walletAddress);
  function emptySnapshot(): IssuerDraftSnapshot { return { version: 1, timeZone, instants: {}, step: 0, testDates: false,
    draft: { seriesId: generatedSeriesId(), name: '', settlementMint: state.instrument?.settlementMint || '', faceValue: '', maturityLocal: '', coupons: [newCoupon()] } }; }
  const [snapshot, setSnapshot] = useState<IssuerDraftSnapshot>(() => {
    try {
      const stored = parseIssuerDraft(localStorage.getItem(storageKey))
        || (walletAddress ? parseIssuerDraft(localStorage.getItem(issuerDraftKey(state.network))) : null);
      return stored ? rebaseDraft(stored, timeZone) : emptySnapshot();
    } catch { return emptySnapshot(); }
  });
  const current = snapshot.timeZone === timeZone ? snapshot : rebaseDraft(snapshot, timeZone);
  const { draft, step, testDates } = current;
  function setDraft(updater: IssueDraft | ((previous: IssueDraft) => IssueDraft)) {
    setSnapshot(previous => {
      const active = previous.timeZone === timeZone ? previous : rebaseDraft(previous, timeZone);
      return { ...active, draft: typeof updater === 'function' ? updater(active.draft) : updater };
    });
  }
  function setStep(next: number) { setSnapshot(previous => ({ ...previous, step: next })); }
  function setTestDates(next: boolean) { setSnapshot(previous => ({ ...previous, testDates: next })); }
  const [storageProblem, setStorageProblem] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [tried, setTried] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [focusRequest, setFocusRequest] = useState<{ target: 'error' | 'heading'; sequence: number }>({ target: 'error', sequence: 0 });
  // Event state updates commit together. Focus only after error attributes and
  // the requested step exist; blur/typing updates never request focus.
  useLayoutEffect(() => {
    if (!focusRequest.sequence) return;
    if (focusRequest.target === 'heading') { stepHeading.current?.focus(); return; }
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) invalid.focus();
    else form.current?.querySelector<HTMLElement>('[role="alert"][tabindex]')?.focus();
  }, [focusRequest]);
  const pendingCreation = useRef<{ seriesId: string; issuer: string } | null>(snapshot.pendingCreation || null);
  const confirmedSeries = state.instrument?.seriesId;
  const validation = validateIssueDraft(draft, nowSeconds, timeZone, current.instants);
  // Keep exact amounts readable if a date expires while the user is reviewing.
  // validateIssueDraft remains the authority for whether an intent can be created.
  const reviewFace = parseSettlementAmount(draft.faceValue).value;
  const reviewCoupons = draft.coupons.map(coupon => parseSettlementAmount(coupon.amount).value);
  const reviewReserve = reviewFace && reviewCoupons.every(value => value !== null)
    ? reviewCoupons.reduce<bigint>((total, value) => total + BigInt(value!), BigInt(reviewFace)).toString()
    : undefined;
  const timezone = timeZoneLabel(timeZone, language);
  const canCreate = Boolean(canAct && !busy && walletAddress && state.connected && Number.isSafeInteger(nowSeconds));
  const creationHint = state.readOnlySnapshot ? tr('Saved snapshot is read-only. Use the live test network to submit an issue.', 'Сохранённый снимок доступен только для просмотра. Для создания выпуска нужна действующая тестовая сеть.') : busy ? tr('Finish the current transaction first.', 'Сначала завершите текущую операцию.') : !state.connected ? tr('Refresh the chain connection to continue.', 'Обновите подключение к сети, чтобы продолжить.') : !walletAddress ? tr('Connect a wallet or choose the workspace issuer.', 'Подключите кошелёк или выберите эмитента в рабочем пространстве.') : !canAct ? tr('Resolve the current operation or refresh chain state.', 'Завершите текущую операцию или обновите данные сети.') : '';
  const termKeys = ['name', 'faceValue', 'settlementMint', 'seriesId'];
  function fieldError(key: string) { return touched.has(key) ? localizedIssuerError(validation.errors[key], language) : undefined; }
  function touch(key: string) { setTouched(previous => new Set([...previous, key])); }
  function clearError(key: string) { setTouched(previous => { if (!previous.has(key)) return previous; const next = new Set(previous); next.delete(key); return next; }); }
  function focusError() { setFocusRequest(previous => ({ target: 'error', sequence: previous.sequence + 1 })); }
  function goTo(next: number) { setStep(next); setFocusRequest(previous => ({ target: 'heading', sequence: previous.sequence + 1 })); }
  useEffect(() => {
    if (snapshot.timeZone !== timeZone) setSnapshot(previous => rebaseDraft(previous, timeZone));
  }, [snapshot.timeZone, timeZone]);
  function persist(next: IssuerDraftSnapshot) {
    try {
      const changedMint = next.draft.settlementMint !== (state.instrument?.settlementMint || '');
      if (!draftHasInput(next.draft) && !changedMint && !next.pendingCreation) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify({ ...next, instants: captureDraftInstants(next.draft, next.timeZone, next.instants) }));
      setStorageProblem(false);
    } catch { setStorageProblem(true); }
  }
  useEffect(() => { persist({ ...current, ...(pendingCreation.current ? { pendingCreation: pendingCreation.current } : {}) }); }, [snapshot, timeZone, storageKey]);
  useEffect(() => {
    const pending = pendingCreation.current;
    if (!pending || confirmedSeries !== pending.seriesId || state.instrument?.issuer !== pending.issuer) return;
    pendingCreation.current = null;
    try {
      localStorage.removeItem(storageKey);
      const anonymousKey = issuerDraftKey(state.network);
      const anonymous = parseIssuerDraft(localStorage.getItem(anonymousKey));
      if (anonymous?.draft.seriesId === pending.seriesId) localStorage.removeItem(anonymousKey);
    } catch { /* Input remains usable without browser storage. */ }
    setSnapshot(emptySnapshot());
    setTouched(new Set()); setTried(false); setAdvancedOpen(false);
  }, [confirmedSeries, state.instrument?.issuer, state.instrument?.settlementMint]);
  function update(key: keyof Omit<IssueDraft, 'coupons'>, value: string) { setDraft(previous => ({ ...previous, [key]: value })); clearError(key); if (key === 'maturityLocal') setTestDates(false); }
  function updateCoupon(key: string, field: keyof Omit<CouponDraft, 'key'>, value: string) { setDraft(previous => ({ ...previous, coupons: previous.coupons.map(coupon => coupon.key === key ? { ...coupon, [field]: value } : coupon) })); clearError(`coupon.${key}.${field}`); if (field !== 'amount') setTestDates(false); }
  function shortDates() {
    const first = Math.ceil((nowSeconds + 15 * 60) / 60) * 60;
    setDraft(previous => ({ ...previous, coupons: previous.coupons.map((coupon, index) => ({ ...coupon, recordLocal: localDateInput(first + index * 20 * 60, timeZone), paymentLocal: localDateInput(first + index * 20 * 60 + 10 * 60, timeZone) })), maturityLocal: localDateInput(first + previous.coupons.length * 20 * 60, timeZone) }));
    setTestDates(true);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (step === 0) {
      setTouched(previous => new Set([...previous, ...termKeys]));
      if (termKeys.some(key => validation.errors[key])) { if (validation.errors.settlementMint || validation.errors.seriesId) setAdvancedOpen(true); focusError(); return; }
      setTried(false); goTo(1); return;
    }
    setTried(true);
    setTouched(previous => new Set([...previous, ...Object.keys(validation.errors)]));
    if (!validation.params) {
      const invalidTerms = termKeys.some(key => validation.errors[key]);
      setStep(invalidTerms ? 0 : 1);
      if (validation.errors.settlementMint || validation.errors.seriesId) setAdvancedOpen(true);
      focusError(); return;
    }
    if (step === 1) { setTried(false); goTo(2); return; }
    if (!canCreate) return;
    pendingCreation.current = { seriesId: draft.seriesId, issuer: walletAddress! };
    persist({ ...current, pendingCreation: pendingCreation.current });
    onAction({ action: 'initialize_issue', params: { ...validation.params }, title: tr('Create a new bond issue', 'Создать новый выпуск'), explanation: tr('Create a separate issue with the selected signer as issuer. Nominal, settlement mint, maturity and fixed coupons become immutable. Bonds and reserve funding are added in separate operations.', 'Создать отдельный выпуск с выбранным кошельком эмитента. Номинал, расчётный токен, погашение и фиксированные купоны нельзя будет изменить. Размещение облигаций и пополнение резерва выполняются отдельно.') });
  }
  function readableDate(key: string, value: string) {
    const seconds = resolveDraftSeconds(value, timeZone, current.instants[key]);
    if (seconds == null) return tr('Not set', 'Не задано');
    const parts = dateParts(new Date(seconds * 1000).toISOString(), timeZone, language);
    return <span className="issuer-date"><span>{parts.date}</span><span>{parts.time}</span></span>;
  }
  const steps = [{ name: tr('Terms', 'Условия'), Icon: FilePlus2 }, { name: tr('Schedule', 'Расписание'), Icon: CalendarDays }, { name: tr('Review', 'Проверка'), Icon: ShieldCheck }];
  const stepCopy = [
    { title: tr('Issue terms', 'Условия выпуска'), detail: tr('Give the issue a name and set the principal repaid for each bond.', 'Назовите выпуск и укажите сумму возврата за одну облигацию.') },
    { title: tr('Payment schedule', 'Расписание выплат'), detail: tr('Choose when holder rights are recorded and payments become available.', 'Укажите, когда фиксируются права держателей и открываются выплаты.') },
    { title: tr('Review your issue', 'Проверьте выпуск'), detail: tr('Check the fixed terms below. The next screen shows the transaction to sign.', 'Проверьте условия. На следующем экране появится транзакция для подписи.') },
  ][step];

  const StepIcon = steps[step].Icon;

  return <form ref={form} className="issuer-flow" data-step={step} aria-busy={busy} noValidate onSubmit={submit}>
    <ol className="issuer-flow-steps" aria-label={tr('Creation steps', 'Этапы создания')}>{steps.map(({ name }, index) => <li className={`${index === step ? 'current' : ''} ${index < step ? 'complete' : ''}`} key={name} aria-current={index === step ? 'step' : undefined}><button type="button" disabled={busy || index > step} onClick={() => { if (index < step) { setTried(false); goTo(index); } }}><span className="flow-step-index" aria-hidden="true">{index + 1}</span><span>{name}</span>{index === step && <span className="sr-only">{tr('Current step', 'Текущий этап')}</span>}</button></li>)}</ol>
    <div className="issuer-flow-body">
      <div className="issuer-flow-heading"><div className="issuer-flow-title"><StepIcon size={22} aria-hidden="true" /><h2 tabIndex={-1} ref={stepHeading}>{stepCopy.title}</h2></div><p>{stepCopy.detail}</p></div>
      <div className="issuer-flow-content">
      {step === 2 && creationHint && <Notice warning><p>{creationHint}</p></Notice>}
      {step === 0 && <fieldset disabled={busy} className="issuer-flow-terms"><legend className="sr-only">{tr('Issue terms', 'Условия выпуска')}</legend>
        <TextField id={`${id}-name`} label={tr('Issue name', 'Название выпуска')} placeholder={tr('e.g. October bond issue', 'Например, октябрьский выпуск')} value={draft.name} onChange={event => update('name', event.target.value)} onBlur={() => touch('name')} error={fieldError('name')} />
        <TextField id={`${id}-face`} label={tr('Nominal per bond', 'Номинал одной облигации')} placeholder="1000" value={draft.faceValue} inputMode="decimal" onChange={event => update('faceValue', event.target.value)} onBlur={() => touch('faceValue')} error={fieldError('faceValue')} hint={tr('Amount repaid at maturity. Settlement units, up to 6 decimal places.', 'Сумма при погашении. Расчётные единицы, до 6 знаков после точки.')} />
        <details className="issuer-technical-details" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary><ChevronDown size={16} aria-hidden="true" />{tr('Settlement token & technical details', 'Расчётный токен и технические данные')}</summary><div>
          <TextField id={`${id}-mint`} label={tr('Settlement token address', 'Адрес расчётного токена')} value={draft.settlementMint} onChange={event => update('settlementMint', event.target.value)} onBlur={() => touch('settlementMint')} error={fieldError('settlementMint')} hint={tr('Use an existing classic SPL mint with exactly 6 decimals.', 'Нужен существующий classic SPL токен с точностью 6 знаков.')} autoCapitalize="none" />
          <p className="issuer-field-hint">{tr('Name limit:', 'Ограничение названия:')} {new TextEncoder().encode(draft.name.trim()).byteLength} / 64 UTF-8 {tr('bytes', 'байт')}.</p>
          <p className="issuer-field-hint">{tr('Issue identifier', 'Идентификатор выпуска')}: <code>{draft.seriesId}</code></p>
          {fieldError('seriesId') && <p className="issuer-field-error" role="alert" tabIndex={-1}>{fieldError('seriesId')}</p>}
        </div></details>
      </fieldset>}
      {step === 0 && <aside className="issuer-term-summary" aria-label={tr('Draft financial terms', 'Финансовые условия черновика')}><h3><Banknote size={19} aria-hidden="true" />{tr('Per bond', 'На облигацию')}</h3><dl><div><dt>{tr('Principal', 'Номинал')}</dt><dd><Money value={reviewFace ?? undefined} /></dd></div><div><dt>{tr('Fixed coupons', 'Фиксированные купоны')}</dt><dd>{draft.coupons.length}</dd></div><div><dt>{tr('Total reserve', 'Полный резерв')}</dt><dd><Money value={reviewReserve} /></dd></div></dl><p>{tr('Settlement units · 6 decimal places', 'Расчётные единицы · 6 знаков')}</p><div className="issuer-term-authority"><WalletCards size={17} aria-hidden="true" /><span>{tr('Issuer account', 'Кошелёк эмитента')}<Address value={walletAddress} /></span></div></aside>}
      {step === 1 && <fieldset disabled={busy} className="issuer-flow-schedule"><legend className="sr-only">{tr('Payment schedule', 'Расписание выплат')}</legend>
        <div className="issuer-schedule-toolbar"><p><Clock3 size={16} aria-hidden="true" />{tr('All dates and times:', 'Все даты и время:')} <strong>{timezone}</strong></p><Button onClick={shortDates} disabled={busy || !Number.isSafeInteger(nowSeconds)}><Clock3 size={16} aria-hidden="true" />{tr('Fill a 15-minute example', 'Пример через 15 минут')}</Button></div>
        {testDates && <p className="issuer-field-hint">{tr('First record starts in about 15 minutes. Register, place, fund and activate beforehand.', 'Первый срез примерно через 15 минут. До него зарегистрируйте держателей, разместите облигации, пополните резерв и активируйте выпуск.')}</p>}
        <div className="issuer-flow-coupons">{draft.coupons.map((coupon, index) => <fieldset className="issuer-flow-coupon" key={coupon.key}><legend className="sr-only">{tr('Coupon', 'Купон')} {index + 1}</legend>
          <div className="issuer-flow-coupon-top"><h3><CalendarDays size={19} aria-hidden="true" />{tr('Coupon', 'Купон')} {index + 1}</h3>
            <Button variant="ghost" aria-label={`${tr('Remove coupon', 'Удалить купон')} ${index + 1}`} disabled={draft.coupons.length === 1 || busy} onClick={() => { setDraft(previous => ({ ...previous, coupons: previous.coupons.filter(row => row.key !== coupon.key) })); window.requestAnimationFrame(() => form.current?.querySelector<HTMLButtonElement>('[data-add-coupon]')?.focus()); }}><Trash2 size={16} aria-hidden="true" />{tr('Remove', 'Удалить')}</Button>
          </div>
          <div className="issuer-flow-date-pair">
            <TextField id={`${id}-${coupon.key}-amount`} label={tr('Payment per bond', 'Выплата на облигацию')} placeholder="0.00" inputMode="decimal" value={coupon.amount} onChange={event => updateCoupon(coupon.key, 'amount', event.target.value)} onBlur={() => touch(`coupon.${coupon.key}.amount`)} error={fieldError(`coupon.${coupon.key}.amount`)} hint={tr('Settlement units, up to 6 decimal places.', 'Расчётные единицы, до 6 знаков после точки.')} />
            <DateTimeField id={`${id}-${coupon.key}-record`} label={tr('Record date', 'Дата среза держателей')} value={coupon.recordLocal} onChange={value => updateCoupon(coupon.key, 'recordLocal', value)} error={fieldError(`coupon.${coupon.key}.recordLocal`)} hint={tr('Fixes who is entitled to this coupon.', 'Определяет, кому принадлежит право на этот купон.')} disabled={busy} language={language} timeZone={timeZone} />
            <DateTimeField id={`${id}-${coupon.key}-payment`} label={tr('Payment date', 'Дата выплаты')} value={coupon.paymentLocal} onChange={value => updateCoupon(coupon.key, 'paymentLocal', value)} error={fieldError(`coupon.${coupon.key}.paymentLocal`)} hint={tr('Claims open at this time, after the record.', 'С этого времени можно получить выплату. Не раньше среза.')} disabled={busy} language={language} timeZone={timeZone} />
          </div>
        </fieldset>)}</div>
        <div className="issuer-schedule-footer"><Button data-add-coupon onClick={() => { const coupon = newCoupon(); setDraft(previous => ({ ...previous, coupons: [...previous.coupons, coupon] })); window.requestAnimationFrame(() => document.getElementById(`${id}-${coupon.key}-amount`)?.focus()); }} disabled={busy || draft.coupons.length >= MAX_COUPONS}><Plus size={16} aria-hidden="true" />{tr('Add coupon', 'Добавить купон')}</Button><span className="issuer-field-hint">{draft.coupons.length} / {MAX_COUPONS}</span></div>
        <div className="issuer-flow-maturity"><div className="issuer-maturity-principal"><Banknote size={21} aria-hidden="true" /><div><span>{tr('Principal per bond', 'Номинал на облигацию')}</span><Money value={reviewFace ?? undefined} /></div></div><DateTimeField id={`${id}-maturity`} label={tr('Principal repayment', 'Погашение номинала')} value={draft.maturityLocal} onChange={value => update('maturityLocal', value)} error={fieldError('maturityLocal')} hint={tr('Final repayment date. Every coupon payment must be on or before it.', 'Дата возврата номинала. Все купоны должны выплачиваться до неё или в этот день.')} disabled={busy} language={language} timeZone={timeZone} /></div>
        {tried && validation.errors.schedule && <p className="issuer-field-error" role="alert" tabIndex={-1}>{localizedIssuerError(validation.errors.schedule, language)}</p>}
      </fieldset>}
      {step === 2 && <div className="issuer-flow-review">
        {!validation.params && <Notice warning><p>{tr('Some terms or dates need updating. Select “Check fields” to return to them.', 'Некоторые условия или даты нужно обновить. Нажмите «Проверить поля», чтобы вернуться к ним.')}</p></Notice>}
        <dl className="issuer-review-terms"><div><dt>{tr('Issue name', 'Название выпуска')}</dt><dd>{draft.name.trim()}</dd></div><div><dt>{tr('Nominal per bond', 'Номинал одной облигации')}</dt><dd><Money value={reviewFace ?? undefined} /></dd></div><div><dt>{tr('Principal repayment', 'Погашение номинала')}</dt><dd>{readableDate('maturityLocal', draft.maturityLocal)}</dd></div><div><dt>{tr('Reserve per bond', 'Резерв на облигацию')}</dt><dd><Money value={reviewReserve} /></dd></div></dl>
        <p className="issuer-review-unit">{tr('Amounts in settlement units. Reserve covers principal and all fixed coupons.', 'Суммы в расчётных единицах. Резерв покрывает номинал и все фиксированные купоны.')}</p>
        <div className="issuer-review-coupons"><h3><CalendarDays size={18} aria-hidden="true" />{tr('Coupon payments', 'Купонные выплаты')}</h3>{draft.coupons.map((coupon, index) => <div key={coupon.key}><strong>{tr('Coupon', 'Купон')} {index + 1}</strong><dl><div><dt>{tr('Per bond', 'На облигацию')}</dt><dd><Money value={reviewCoupons[index] ?? undefined} /></dd></div><div><dt>{tr('Record', 'Срез')}</dt><dd>{readableDate(`coupon.${coupon.key}.recordLocal`, coupon.recordLocal)}</dd></div><div><dt>{tr('Payment', 'Выплата')}</dt><dd>{readableDate(`coupon.${coupon.key}.paymentLocal`, coupon.paymentLocal)}</dd></div></dl></div>)}</div>
        <p className="issuer-field-hint">{tr('Timezone', 'Часовой пояс')}: {timezone}</p>
        <details className="issuer-technical-details" open><summary><ChevronDown size={16} aria-hidden="true" />{tr('Token and signing authority', 'Токен и кошелёк эмитента')}</summary><div><dl className="issuer-review-authority"><div><dt>{tr('Settlement token', 'Расчётный токен')}</dt><dd><Address value={draft.settlementMint.trim()} full /></dd></div><div><dt>{tr('Issuer wallet', 'Кошелёк эмитента')}</dt><dd><Address value={walletAddress} full /></dd></div><div><dt>{tr('Issue identifier', 'Идентификатор выпуска')}</dt><dd><code>{draft.seriesId}</code></dd></div></dl></div></details>
        <p className="issuer-review-lock"><LockKeyhole size={18} aria-hidden="true" />{tr('Creation fixes these terms. It does not place bonds or transfer the reserve.', 'Создание фиксирует эти условия. Облигации и резерв добавляются отдельными операциями.')}</p>
      </div>}
      </div>
    </div>
    <div className="issuer-flow-footer"><div className="issuer-flow-back">{step > 0 && <Button disabled={busy} onClick={() => { setTried(false); goTo(step - 1); }}><ArrowLeft size={16} aria-hidden="true" />{tr('Back', 'Назад')}</Button>}<span className="issuer-field-hint">{storageProblem ? tr('Browser storage is unavailable. Keep this form open to retain your draft.', 'Хранилище браузера недоступно. Не закрывайте форму, чтобы сохранить черновик.') : draftHasInput(draft) ? tr('Draft saved on this browser', 'Черновик сохранён в этом браузере') : tr('Check the terms before signing', 'Проверьте условия перед подписью')}</span></div><Button type="submit" variant="primary" disabled={busy || (step === 2 && !canCreate)} busy={busy}>{step === 0 ? tr('Plan payments', 'Настроить выплаты') : step === 1 ? tr('Check terms', 'Проверить условия') : !validation.params ? tr('Check fields', 'Проверить поля') : tr('Review transaction', 'Проверить транзакцию')}<ArrowRight size={16} aria-hidden="true" /></Button></div>
  </form>;
}

function localizedIssuerError(message: string | undefined | null, language: 'ru' | 'en'): string | undefined {
  if (!message) return undefined;
  if (language === 'en') return message;
  const errors: Record<string, string> = {
    'Enter issue name.': 'Укажите название выпуска.',
    'Enter a complete, valid Solana address (32-byte base58).': 'Укажите полный корректный адрес Solana.',
    'Enter a positive amount with a decimal point and up to 6 decimals. No commas or exponents.': 'Укажите положительную сумму: точка и до 6 знаков после неё. Без запятых и степени.',
    'Amount must be greater than zero.': 'Сумма должна быть больше нуля.',
    'Choose a valid maturity date and time.': 'Выберите дату и время погашения.',
    'Maturity must be in the future.': 'Погашение должно быть в будущем.',
    'Choose a valid record date and time.': 'Выберите дату и время среза держателей.',
    'Choose a valid payment date and time.': 'Выберите дату и время выплаты.',
    'First record date must be in the future. Allow time to register, issue, fund and activate.': 'Первый срез должен быть в будущем. Оставьте время на регистрацию, размещение, резерв и активацию.',
    'Record date must be later than the previous coupon record date.': 'Срез должен быть позже среза предыдущего купона.',
    'Payment cannot precede this coupon record date.': 'Выплата не может быть раньше среза этого купона.',
    'Payment cannot precede the previous coupon payment.': 'Выплата не может быть раньше выплаты предыдущего купона.',
    'Payment must be on or before maturity.': 'Выплата должна быть не позже погашения.',
    'Chain time is unavailable. Refresh the connection before creating an issue.': 'Время сети недоступно. Обновите подключение.',
    'Nominal plus all coupons per bond exceeds the on-chain integer limit. Reduce the amounts.': 'Номинал и купоны превышают лимит на облигацию. Уменьшите суммы.',
    'Issue identifier is invalid. Start a new issue form.': 'Идентификатор выпуска некорректен. Начните новый выпуск.',
    'Choose a registered holder.': 'Выберите зарегистрированного держателя.',
    'This wallet is already registered for this issue.': 'Этот кошелёк уже зарегистрирован в выпуске.',
    'Enter holder label.': 'Укажите имя держателя.',
    'Select an issue first.': 'Сначала выберите выпуск.',
    'Enter a whole number of bonds. Fractions and exponents are not accepted.': 'Укажите целое количество облигаций, без дробей и степени.',
    'Issue at least 1 bond.': 'Разместите хотя бы одну облигацию.',
    'Bond count exceeds the on-chain integer limit.': 'Количество облигаций превышает допустимый предел.',
    'Current supply is unavailable. Refresh chain state.': 'Объём выпуска недоступен. Обновите данные сети.',
    'Total issued supply would exceed the on-chain integer limit.': 'Общий объём выпуска превысит допустимый предел.',
    'The full reserve for this supply would exceed the on-chain integer limit. Issue fewer bonds.': 'Резерв для такого объёма превысит допустимый предел. Уменьшите количество облигаций.',
    'Reserve data is incomplete. Refresh chain state before funding or activation.': 'Данные резерва неполны. Обновите данные сети перед пополнением или активацией.',
    'Coupon amounts are unavailable. Refresh chain state.': 'Суммы купонов недоступны. Обновите данные сети.',
    'The reserve exceeds the on-chain integer limit. Do not fund this issue.': 'Резерв превышает допустимый предел. Не пополняйте этот выпуск.',
    'Reserve totals disagree. Refresh chain state before continuing.': 'Суммы резерва не совпадают. Обновите данные сети перед продолжением.',
  };
  if (errors[message]) return errors[message];
  if (message.startsWith('Issue name uses ')) return 'Название превышает 64 UTF-8 байта. Сократите его.';
  if (message.startsWith('Issue name cannot contain ')) return 'Название должно быть одной строкой без управляющих символов.';
  if (message.startsWith('Holder label uses ')) return 'Имя держателя превышает 64 UTF-8 байта. Сократите его.';
  if (message.startsWith('Holder label cannot contain ')) return 'Имя должно быть одной строкой без управляющих символов.';
  if (message.startsWith('Amount exceeds ')) return 'Сумма превышает допустимый предел.';
  if (message.startsWith('Add between ')) return 'Добавьте от 1 до 8 купонов.';
  return message;
}
