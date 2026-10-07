import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, Banknote, Check, CheckCircle2, ChevronDown, Clock3, FilePlus2, LockKeyhole, Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { Address, Badge, Button, Money, Panel } from './components';
import { date, integer, units } from './format';
import { addressError, issuanceError, issueReserve, localDateInput, MAX_COUPONS, MAX_HOLDERS, parseBondCount, utf8Error, validateIssueDraft, type CouponDraft, type IssueDraft } from './issuer-validation';
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
}

function generatedSeriesId(): string {
  const random = new Uint16Array(1);
  crypto.getRandomValues(random);
  return ((BigInt(Date.now()) << 16n) | BigInt(random[0])).toString();
}
function newCoupon(): CouponDraft { return { key: crypto.randomUUID(), recordLocal: '', paymentLocal: '', amount: '' }; }
function focusInvalid(form: HTMLFormElement | null) {
  window.requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
function TextField({ id, label, hint, error, children, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; children?: ReactNode }) {
  return <div className="issuer-field"><label htmlFor={id}>{label}</label><input id={id} autoComplete="off" spellCheck={false} {...props} aria-invalid={Boolean(error) || undefined} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} />{hint && <p id={`${id}-hint`} className="issuer-field-hint">{hint}</p>}{error && <p id={`${id}-error`} className="issuer-field-error">{error}</p>}{children}</div>;
}
function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`issuer-note ${warning ? 'warning' : ''}`}><AlertCircle size={18} aria-hidden="true" /><div>{children}</div></div>;
}
function ChecklistRow({ complete, label, detail }: { complete: boolean; label: string; detail: string }) {
  return <li className={complete ? 'complete' : ''}><span className="issuer-check-icon">{complete ? <Check size={15} aria-hidden="true" /> : <span aria-hidden="true" />}</span><div><strong>{label}</strong><p>{detail}</p></div></li>;
}

export function IssuerSetup({ state, walletAddress, canAct, busy, onAction }: IssuerSetupProps) {
  const instrument = state.instrument;
  const id = useId();
  const [holderWallet, setHolderWallet] = useState('');
  const [holderLabel, setHolderLabel] = useState('');
  const [registrationTried, setRegistrationTried] = useState(false);
  const [selectedHolder, setSelectedHolder] = useState('');
  const [bondCount, setBondCount] = useState('');
  const [issuanceTried, setIssuanceTried] = useState(false);
  const [newOpen, setNewOpen] = useState(instrument?.status !== 'draft');
  const [clockTick, setClockTick] = useState(0);
  const registerForm = useRef<HTMLFormElement>(null), issuanceForm = useRef<HTMLFormElement>(null);
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
  const connectedHint = busy ? 'Finish the current transaction before starting another.' : !state.connected ? 'Chain state is unavailable. Refresh the connection.' : !walletAddress ? 'Choose a signing wallet or the explicit test issuer role above.' : !canAct ? 'Resolve the current operation or refresh chain state before continuing.' : !isIssuer ? 'Choose this issue’s issuer wallet to manage its draft.' : !beforeCutoff ? 'The first record date has passed. This draft can no longer be placed or activated.' : '';
  const walletProblem = addressError(holderWallet) || (state.holders.some(holder => holder.wallet === holderWallet.trim()) ? 'This wallet is already registered for this issue.' : null);
  const labelProblem = utf8Error(holderLabel, 'Holder label');
  const countProblem = instrument ? issuanceError(bondCount, instrument.issuedSupply, reserve.unitMinor) : 'Select an issue first.';
  const holderProblem = state.holders.some(holder => holder.wallet === selectedHolder) ? null : 'Choose a registered holder.';
  const registeredFull = state.holders.length >= MAX_HOLDERS;
  const supplyPositive = (integer(instrument?.issuedSupply) ?? 0n) > 0n;
  const reserveReady = reserve.gapMinor === '0' && reserve.requiredMinor != null && supplyPositive;
  const remainingBalance = (instrument as typeof instrument & { settlementBalanceMinor?: string } | null)?.settlementBalanceMinor;
  const funderEnough = remainingBalance == null || (integer(remainingBalance) != null && integer(remainingBalance)! >= (integer(reserve.gapMinor) ?? 0n));

  useEffect(() => {
    if (issueAddress.current !== instrument?.address) {
      issueAddress.current = instrument?.address;
      setHolderWallet(''); setHolderLabel(''); setBondCount(''); setRegistrationTried(false); setIssuanceTried(false); pendingHolder.current = '';
      setSelectedHolder(state.holders[0]?.wallet || '');
      if (instrument?.status === 'draft') setNewOpen(false);
    } else if (pendingHolder.current && state.holders.some(holder => holder.wallet === pendingHolder.current)) {
      setSelectedHolder(pendingHolder.current); pendingHolder.current = '';
      setHolderWallet(''); setHolderLabel(''); setRegistrationTried(false);
    } else if (!state.holders.some(holder => holder.wallet === selectedHolder)) setSelectedHolder(state.holders[0]?.wallet || '');
  }, [instrument?.address, instrument?.status, state.holders, selectedHolder]);

  function register(event: FormEvent) {
    event.preventDefault(); setRegistrationTried(true);
    if (walletProblem || labelProblem) { focusInvalid(registerForm.current); return; }
    if (!canAdmin || registeredFull || !instrument) return;
    pendingHolder.current = holderWallet.trim();
    onAction({ action: 'register_holder', params: { holderWallet: holderWallet.trim(), label: holderLabel.trim() }, title: 'Register holder', explanation: 'Add this wallet to the confirmed holder registry. Its bond account is created and kept frozen outside allowed transfers. The display label is local metadata, not identity verification.' });
  }
  function issue(event: FormEvent) {
    event.preventDefault(); setIssuanceTried(true);
    if (countProblem || holderProblem) { focusInvalid(issuanceForm.current); return; }
    if (!canAdmin || !instrument) return;
    const count = parseBondCount(bondCount); if (!count.value) return;
    onAction({ action: 'issue_units', params: { holderWallet: selectedHolder, units: count.value }, title: 'Issue bonds', explanation: `Place ${units(count.value)} whole bonds with the selected registered holder. This increases the required reserve for principal and every fixed coupon. No settlement funds are collected by this placement action.` });
  }

  return <div className="issuer-desk">
    <div className="page-heading"><div><p className="eyebrow">Issue administration</p><h1>Issuer desk</h1><p>Set terms, place bonds and secure every payment before activation.</p></div><Badge tone="blue">{state.network} · Test assets</Badge></div>
    {instrument && <section className="issuer-current" aria-label="Selected issue"><div className="issuer-current-title"><span className="issuer-section-icon"><ShieldCheck size={20} aria-hidden="true" /></span><div><p className="eyebrow">Selected on-chain issue</p><h2>{instrument.name}</h2></div><Badge tone={draft ? 'warning' : instrument.status === 'active' ? 'blue' : 'neutral'}>{draft ? 'Draft · not activated' : instrument.status === 'active' ? 'Active' : instrument.status === 'redeeming' ? 'Redemption open' : 'Redeemed'}</Badge></div><dl className="issuer-current-facts"><div><dt>Issue address</dt><dd><Address value={instrument.address} /></dd></div><div><dt>Issuer authority</dt><dd><Address value={instrument.issuer} /></dd></div><div><dt>Bonds issued</dt><dd className="number">{units(instrument.issuedSupply)}</dd></div><div><dt>First record date</dt><dd>{date(instrument.recordAt, true)}</dd></div></dl></section>}
    {draft && instrument ? <>
      {connectedHint && <Notice warning><p>{connectedHint}</p></Notice>}
      <div className="issuer-workspace-grid">
        <div className="issuer-placement">
          <Panel title="Register and place" label="01 · Holder registry" action={<Badge>{state.holders.length} / {MAX_HOLDERS} wallets</Badge>}>
            <div className="issuer-panel-body"><p className="issuer-intro">Register a wallet first, then issue whole bonds to it. Only the issuer can place this draft.</p>
              <form ref={registerForm} className="issuer-form" noValidate onSubmit={register}>
                <fieldset disabled={busy}><legend className="issuer-form-legend"><UsersRound size={17} aria-hidden="true" />Add a holder</legend>
                  <TextField id={`${id}-holder-wallet`} label="Holder wallet (required)" value={holderWallet} onChange={event => setHolderWallet(event.target.value)} onBlur={() => { if (holderWallet) setRegistrationTried(true); }} error={registrationTried ? walletProblem || undefined : undefined} hint="Full Solana wallet address. Registration is specific to this issue." autoCapitalize="none" />
                  <TextField id={`${id}-holder-label`} label="Display label (required)" value={holderLabel} onChange={event => setHolderLabel(event.target.value)} onBlur={() => { if (holderLabel) setRegistrationTried(true); }} error={registrationTried ? labelProblem || undefined : undefined} hint="Up to 64 UTF-8 bytes. A local label; it does not verify the holder’s identity." />
                </fieldset><div className="issuer-form-action"><Button type="submit" disabled={!canAdmin || registeredFull} busy={busy}><Plus size={16} aria-hidden="true" />Review registration</Button>{registeredFull && <p className="issuer-field-hint">Registry limit reached. This program allows 16 holders.</p>}</div>
              </form>
              <div className="issuer-holder-list" aria-label="Confirmed registered holders">
                <div className="issuer-list-heading"><h3>Confirmed holders</h3><span className="issuer-field-hint">Read from chain</span></div>
                {state.holders.length ? <ul>{state.holders.map(holder => <li key={holder.wallet}><div><strong>{holder.label}</strong><Address value={holder.wallet} /></div><span className="number">{units(holder.units)}<small>bonds</small></span></li>)}</ul> : <div className="issuer-inline-empty"><UsersRound size={20} aria-hidden="true" /><div><strong>No holders registered</strong><p>Add the first wallet above to begin placement.</p></div></div>}
              </div>
              <form ref={issuanceForm} className="issuer-form issuer-issue-form" noValidate onSubmit={issue}>
                <fieldset disabled={busy}><legend className="issuer-form-legend"><FilePlus2 size={17} aria-hidden="true" />Place bonds</legend><div className="issuer-field"><label htmlFor={`${id}-target`}>Registered holder (required)</label><select id={`${id}-target`} value={selectedHolder} disabled={!state.holders.length || busy} onChange={event => setSelectedHolder(event.target.value)} aria-invalid={issuanceTried && Boolean(holderProblem) || undefined} aria-describedby={issuanceTried && holderProblem ? `${id}-target-error` : undefined}><option value="">Choose a holder</option>{state.holders.map(holder => <option value={holder.wallet} key={holder.wallet}>{holder.label} · {holder.wallet}</option>)}</select>{issuanceTried && holderProblem && <p id={`${id}-target-error`} className="issuer-field-error">{holderProblem}</p>}</div>
                  <TextField id={`${id}-bond-count`} label="Number of bonds (required)" inputMode="numeric" value={bondCount} onChange={event => setBondCount(event.target.value)} onBlur={() => { if (bondCount) setIssuanceTried(true); }} error={issuanceTried ? countProblem || undefined : undefined} hint="Whole bonds only. Placement increases all principal and coupon obligations." />
                </fieldset><Button type="submit" variant="primary" disabled={!canAdmin || !state.holders.length} busy={busy}>Review placement<ArrowRight size={16} aria-hidden="true" /></Button>
              </form>
            </div>
          </Panel>
        </div>
        <aside className="issuer-reserve-column">
          <Panel title="Secure the full reserve" label="02 · Prefunding" className="issuer-reserve-panel">
            <div className="issuer-panel-body"><p className="issuer-intro">The vault must cover every issued bond’s nominal and all scheduled coupons.</p><dl className="issuer-reserve-breakdown"><div><dt>Principal</dt><dd><Money value={reserve.principalMinor} /></dd></div><div><dt>All fixed coupons</dt><dd><Money value={reserve.couponMinor} /></dd></div><div className="total"><dt>Required reserve</dt><dd><Money value={reserve.requiredMinor} /></dd></div><div><dt>In the vault</dt><dd><Money value={instrument.vaultBalanceMinor} /></dd></div></dl>
              <div className="issuer-gap" role="status" aria-live="polite" aria-atomic="true"><div><span>{reserveReady ? 'Fully reserved' : 'Still to fund'}</span>{reserveReady && <CheckCircle2 size={19} aria-hidden="true" />}</div><Money value={reserve.gapMinor} /><small>test settlement units · 6 decimals</small></div>
              {reserve.error && <p className="issuer-field-error" role="alert">{reserve.error}</p>}
              {remainingBalance != null && <p className="issuer-balance-hint">Issuer settlement balance: <Money value={remainingBalance} /></p>}
              {!funderEnough && <p className="issuer-field-error">Issuer settlement balance does not cover the gap. Fund the issuer’s settlement account with test assets first.</p>}
              <Button disabled={!canAdmin || !supplyPositive || !reserve.gapMinor || reserve.gapMinor === '0' || Boolean(reserve.error) || !funderEnough} busy={busy} onClick={() => { if (!canAdmin || !reserve.gapMinor || reserve.gapMinor === '0') return; onAction({ action: 'fund_vault', params: { amountMinor: reserve.gapMinor }, title: 'Fund required reserve', explanation: 'Transfer exactly the current funding gap from the issuer’s test settlement account to this issue’s vault. There is no issuer withdrawal instruction. The transaction is simulated before signing.', amountMinor: reserve.gapMinor }); }}><Banknote size={16} aria-hidden="true" />Review vault funding</Button><p className="issuer-field-hint">Only the current gap is transferred. Adding more bonds increases the reserve.</p>
            </div>
          </Panel>
          <Panel title="Activate the issue" label="03 · Final check" className="issuer-activation-panel">
            <div className="issuer-panel-body"><ul className="issuer-checklist"><ChecklistRow complete={true} label="Terms recorded" detail={`${state.coupons.length} fixed coupon${state.coupons.length === 1 ? '' : 's'} · immutable on-chain terms`} /><ChecklistRow complete={state.holders.length > 0} label="Holders registered" detail={`${state.holders.length} confirmed wallet${state.holders.length === 1 ? '' : 's'}`} /><ChecklistRow complete={supplyPositive} label="Bonds placed" detail={`${units(instrument.issuedSupply)} whole bonds issued`} /><ChecklistRow complete={reserveReady} label="Payments fully reserved" detail={reserveReady ? 'Nominal and all coupons covered' : 'Fund the vault before activation'} /><ChecklistRow complete={beforeCutoff} label="Before first record date" detail={date(instrument.recordAt, true)} /></ul>
              <div className="issuer-seal-warning"><LockKeyhole size={18} aria-hidden="true" /><p>Activation closes registration and placement permanently for this test issue. The terms and issued supply cannot be edited afterwards.</p></div><Button variant="primary" disabled={!canAdmin || !reserveReady || !state.holders.length || Boolean(reserve.error)} busy={busy} onClick={() => { if (!canAdmin || !reserveReady) return; onAction({ action: 'seal_issue', params: {}, title: 'Activate and seal issue', explanation: 'Seal this draft and begin its corporate-action lifecycle. This permanently closes holder registration and additional issuance for this test issue. Principal and every fixed coupon are prefunded; the program rechecks supply and reserves.', amountMinor: reserve.requiredMinor }); }}>Review activation<ArrowRight size={16} aria-hidden="true" /></Button><p className="issuer-field-hint">Review → simulation → explicit signature → confirmed chain state.</p>
            </div>
          </Panel>
        </aside>
      </div>
    </> : instrument && <div className="issuer-stage-note"><ShieldCheck size={21} aria-hidden="true" /><div><strong>{instrument.status === 'active' ? 'This issue is activated' : instrument.status === 'redeeming' ? 'Principal redemption is open' : 'Principal redemption is complete'}</strong><p>{instrument.status === 'active' ? 'Holder registration and additional issuance are closed. Use Payments and Voting for scheduled corporate actions.' : instrument.status === 'redeeming' ? 'Current holders can redeem principal in My portfolio. Recorded coupon rights remain payable to their snapshot owners.' : 'Issued principal has been redeemed. Any unpaid recorded coupons remain claimable by their snapshot owners.'} Create a separate issue below for new terms.</p></div></div>}
    <Panel className="issuer-create-panel"><button type="button" className="issuer-create-toggle" aria-expanded={newOpen} aria-controls={`${id}-create-form`} onClick={() => setNewOpen(value => !value)}><span className="issuer-section-icon"><FilePlus2 size={21} aria-hidden="true" /></span><span><span className="eyebrow">New on-chain issue</span><strong>{instrument ? 'Create another issue' : 'Create your first issue'}</strong><span className="issuer-field-hint">Define the nominal, settlement mint and fixed coupon schedule.</span></span><ChevronDown className={newOpen ? 'expanded' : ''} size={20} aria-hidden="true" /></button><div id={`${id}-create-form`} hidden={!newOpen}><NewIssueForm state={state} walletAddress={walletAddress} canAct={canAct} busy={busy} nowSeconds={nowSeconds} onAction={onAction} /></div></Panel>
    <p className="issuer-footnote"><Clock3 size={15} aria-hidden="true" />All amounts and lifecycle stages above come from supplied chain state. Operations update this desk only after confirmation.</p>
  </div>;
}

function NewIssueForm({ state, walletAddress, canAct, busy, nowSeconds, onAction }: Omit<IssuerSetupProps, 'onChooseIssue'> & { nowSeconds: number }) {
  const id = useId();
  const [draft, setDraft] = useState<IssueDraft>(() => ({ seriesId: generatedSeriesId(), name: '', settlementMint: state.instrument?.settlementMint || '', faceValue: '', maturityLocal: '', coupons: [newCoupon()] }));
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [tried, setTried] = useState(false);
  const [testDates, setTestDates] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const pendingCreation = useRef<{ seriesId: string; issuer: string } | null>(null);
  const confirmedSeries = (state.instrument as typeof state.instrument & { seriesId?: string } | null)?.seriesId;
  const validation = validateIssueDraft(draft, nowSeconds);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const canCreate = Boolean(canAct && !busy && walletAddress && state.connected && Number.isSafeInteger(nowSeconds));
  const creationHint = busy ? 'Finish the current transaction before creating another issue.' : !state.connected ? 'Refresh the chain connection before creating an issue.' : !walletAddress ? 'Choose a signing wallet or the explicit test issuer role above.' : !canAct ? 'Resolve the current operation or refresh chain state first.' : '';
  function fieldError(key: string) { return tried || touched.has(key) ? validation.errors[key] : undefined; }
  function touch(key: string) { setTouched(previous => new Set([...previous, key])); }
  useEffect(() => {
    const pending = pendingCreation.current;
    if (!pending || confirmedSeries !== pending.seriesId || state.instrument?.issuer !== pending.issuer) return;
    pendingCreation.current = null;
    setDraft({ seriesId: generatedSeriesId(), name: '', settlementMint: state.instrument.settlementMint, faceValue: '', maturityLocal: '', coupons: [newCoupon()] });
    setTouched(new Set()); setTried(false); setTestDates(false);
  }, [confirmedSeries, state.instrument?.issuer, state.instrument?.settlementMint]);
  function update(key: keyof Omit<IssueDraft, 'coupons'>, value: string) { setDraft(previous => ({ ...previous, [key]: value })); if (key === 'maturityLocal') setTestDates(false); }
  function updateCoupon(key: string, field: keyof Omit<CouponDraft, 'key'>, value: string) { setDraft(previous => ({ ...previous, coupons: previous.coupons.map(coupon => coupon.key === key ? { ...coupon, [field]: value } : coupon) })); if (field !== 'amount') setTestDates(false); }
  function shortDates() {
    const first = nowSeconds + 15 * 60;
    setDraft(previous => ({ ...previous, coupons: previous.coupons.map((coupon, index) => ({ ...coupon, recordLocal: localDateInput(first + index * 20 * 60), paymentLocal: localDateInput(first + index * 20 * 60 + 10 * 60) })), maturityLocal: localDateInput(first + previous.coupons.length * 20 * 60) }));
    setTestDates(true);
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setTried(true);
    if (!validation.params) { focusInvalid(form.current); return; }
    if (!canCreate) return;
    pendingCreation.current = { seriesId: draft.seriesId, issuer: walletAddress! };
    onAction({ action: 'initialize_issue', params: { ...validation.params }, title: 'Create a new bond issue', explanation: 'Initialize a separate test issue with the selected signing wallet as issuer. Nominal, settlement mint, maturity and fixed coupon amounts are stored on-chain and cannot be edited. No bonds are issued and no reserve is deposited by this operation.' });
  }

  return <form ref={form} className="issuer-new-form" noValidate onSubmit={submit}>
    <div className="issuer-new-intro"><p>The selected signer becomes the issuer. This creates a draft; registration, placement, prefunding and activation follow as separate reviewed transactions.</p>{walletAddress && <span>Issuer signer <Address value={walletAddress} /></span>}</div>
    {creationHint && <Notice warning><p>{creationHint}</p></Notice>}
    <fieldset disabled={busy}><legend className="issuer-form-legend">Issue terms</legend><div className="issuer-fields-grid">
      <TextField id={`${id}-name`} label="Issue name (required)" value={draft.name} onChange={event => update('name', event.target.value)} onBlur={() => touch('name')} error={fieldError('name')} hint={`${new TextEncoder().encode(draft.name.trim()).byteLength} / 64 UTF-8 bytes. Terms cannot be edited after creation.`} />
      <TextField id={`${id}-face`} label="Nominal per bond (required)" value={draft.faceValue} inputMode="decimal" onChange={event => update('faceValue', event.target.value)} onBlur={() => touch('faceValue')} error={fieldError('faceValue')} hint="Test settlement units. Positive amount, up to 6 decimals." />
      <TextField id={`${id}-mint`} className="issuer-address-input" label="Settlement mint (required)" value={draft.settlementMint} onChange={event => update('settlementMint', event.target.value)} onBlur={() => touch('settlementMint')} error={fieldError('settlementMint')} hint="Existing classic SPL test mint with exactly 6 decimals. The server validates mint ownership and precision." autoCapitalize="none" />
      <TextField id={`${id}-maturity`} type="datetime-local" step="1" label="Maturity date and time (required)" value={draft.maturityLocal} onChange={event => update('maturityLocal', event.target.value)} onBlur={() => touch('maturityLocal')} error={fieldError('maturityLocal')} hint={`Your timezone: ${timezone}. Stored as an absolute UTC timestamp.`} />
    </div></fieldset>
    <fieldset disabled={busy} className="issuer-coupon-fieldset"><legend className="issuer-form-legend">Fixed coupon schedule</legend><div className="issuer-schedule-intro"><p>Each amount is a fixed payment per bond. Record dates strictly increase; payments follow record dates and cannot exceed maturity.</p><Button onClick={shortDates} disabled={busy || !Number.isSafeInteger(nowSeconds)}><Clock3 size={16} aria-hidden="true" />Use short test dates</Button></div>
      {testDates && <p className="issuer-test-date-note"><Badge tone="warning">Short test schedule</Badge>First record date is 15 minutes after the last setup click. Register, place, fund and activate beforehand. The clock runs in real time.</p>}
      <div className="issuer-coupon-list">{draft.coupons.map((coupon, index) => <fieldset className="issuer-coupon-row" key={coupon.key}><legend>Coupon <span className="number">{String(index + 1).padStart(2, '0')}</span></legend><div className="issuer-coupon-fields">
        <TextField id={`${id}-${coupon.key}-record`} type="datetime-local" step="1" label="Record date (required)" value={coupon.recordLocal} onChange={event => updateCoupon(coupon.key, 'recordLocal', event.target.value)} onBlur={() => touch(`coupon.${coupon.key}.recordLocal`)} error={fieldError(`coupon.${coupon.key}.recordLocal`)} />
        <TextField id={`${id}-${coupon.key}-payment`} type="datetime-local" step="1" label="Payment date (required)" value={coupon.paymentLocal} onChange={event => updateCoupon(coupon.key, 'paymentLocal', event.target.value)} onBlur={() => touch(`coupon.${coupon.key}.paymentLocal`)} error={fieldError(`coupon.${coupon.key}.paymentLocal`)} />
        <TextField id={`${id}-${coupon.key}-amount`} label="Coupon per bond (required)" inputMode="decimal" value={coupon.amount} onChange={event => updateCoupon(coupon.key, 'amount', event.target.value)} onBlur={() => touch(`coupon.${coupon.key}.amount`)} error={fieldError(`coupon.${coupon.key}.amount`)} hint="Test units · up to 6 decimals" />
      </div><Button variant="ghost" className="issuer-remove-coupon" aria-label={`Remove coupon ${index + 1}`} disabled={draft.coupons.length === 1 || busy} onClick={() => { setDraft(previous => ({ ...previous, coupons: previous.coupons.filter(row => row.key !== coupon.key) })); window.requestAnimationFrame(() => form.current?.querySelector<HTMLButtonElement>('[data-add-coupon]')?.focus()); }}><Trash2 size={16} aria-hidden="true" /><span>Remove</span></Button></fieldset>)}</div>
      <div className="issuer-schedule-footer"><Button data-add-coupon onClick={() => { const coupon = newCoupon(); setDraft(previous => ({ ...previous, coupons: [...previous.coupons, coupon] })); window.requestAnimationFrame(() => document.getElementById(`${id}-${coupon.key}-record`)?.focus()); }} disabled={busy || draft.coupons.length >= MAX_COUPONS}><Plus size={16} aria-hidden="true" />Add coupon</Button><span className="issuer-field-hint"><span className="number">{draft.coupons.length} / {MAX_COUPONS}</span> coupons · timezone {timezone}</span></div>
    </fieldset>
    {tried && validation.errors.schedule && <p className="issuer-field-error" role="alert">{validation.errors.schedule}</p>}
    <div className="issuer-terms-summary"><div><ShieldCheck size={20} aria-hidden="true" /><div><strong>Reserve required per bond</strong><p>Nominal plus the complete fixed coupon schedule. Final reserve depends on how many bonds are placed.</p></div></div><Money value={validation.unitReserveMinor} unit /></div>
    <div className="issuer-create-footer"><div><span className="issuer-field-hint">Issue identifier</span><code className="number">{draft.seriesId}</code><p className="issuer-field-hint">Generated once for this form. Creation is confirmed by chain state.</p>{fieldError('seriesId') && <p className="issuer-field-error">{fieldError('seriesId')}</p>}</div><Button type="submit" variant="primary" disabled={!canCreate} busy={busy}>Review issue creation<ArrowRight size={16} aria-hidden="true" /></Button></div>
    <p className="issuer-field-hint">Test-network prototype. These records do not establish regulatory approval, KYC, banking settlement or a production bond offering.</p>
  </form>;
}
