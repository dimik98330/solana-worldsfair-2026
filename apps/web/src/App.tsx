import { translate } from './i18n';
import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Activity as ActivityIcon, ArrowDownLeft, ArrowRight, ArrowUpRight, Banknote, Check, CheckCheck, ChevronRight, Clock3, FileCheck2, FlaskConical, Landmark, ListChecks, Menu, Search, X, LayoutDashboard, LoaderCircle, RefreshCw, Settings2, ShieldCheck, UsersRound, Vote, Wallet, XCircle } from 'lucide-react';
import { api, ApiError } from './api';
import {resolvePagedAction} from './paged-actions';
import {PagedOperations} from './PagedOperations';
import { add, date, decimalInput, integer, multiply, shortAddress, subtract, units } from './format';
import { Address, Badge, Button, Empty, ErrorNotice, Money, Overlay, Panel, ProofLink } from './components';
import { WalletProvider, signPreparedTransaction, useWalletConnection } from './wallet';
import {createScopedReader} from './data-reader';
import {PaymentsWorkspace} from './PaymentsWorkspace';
import { proposalTitleError } from './validation';
import {UiLanguageProvider,useUiLanguage} from './ui-language';
import { DisplayPreferencesProvider, useDisplayPreferences } from './display-preferences';
import { timeZoneLabel } from './time-zone';
import { InterfaceSettings } from './InterfaceSettings';
import { AccountPicker } from './AccountPicker';
import { WorkspaceLink } from './WorkspaceLink';
import { JudgeOverview } from './JudgeOverview';
import { VotingWorkspace } from './VotingWorkspace';
import { PaymentTable } from './PaymentTable';
import { HolderPortfolio } from './HolderPortfolio';
import { ReceiptDetails, ReceiptList } from './ReceiptDetails';
import { DisplayDate } from './DisplayDate';
import type { PaymentSelection } from './receipt-match';
import type { ActionRequest, ChainState, DemoRole, Entitlement, PreparedAction, TxRecord, View } from './types';
import { roleLabels, viewLabels } from './labels';
import { pendingKey, restoredTx } from './recovery';
import { TransactionReview } from './TransactionReview';
import './registry.css';

const navItems = [{ id: 'overview', icon: LayoutDashboard }, {id:'issuer',icon:Landmark}, { id: 'registry', icon: UsersRound }, { id: 'payments', icon: Banknote }, { id: 'portfolio', icon: Wallet }, { id: 'voting', icon: ListChecks }] as const;
const IssuerSetup = lazy(()=>import('./IssuerSetup').then(module=>({default:module.IssuerSetup})));
function initialView(): View { const view = new URLSearchParams(location.search).get('view'); return navItems.some(item => item.id === view) ? view as View : 'overview'; }

export default function App() {
  const [verifiedNetwork,setVerifiedNetwork]=useState<'localnet'|'devnet'>('localnet');
  const [selectedInstrument,setSelectedInstrument]=useState(()=>new URLSearchParams(location.search).get('instrument')||'');
  const reader=useRef(createScopedReader<ChainState>((key,signal)=>api.state(signal,key||undefined),selectedInstrument)).current;
  function chooseInstrument(value:string){if(value===selectedInstrument)return;reader.select(value);setState(null);setLoading(true);setSelectedInstrument(value);const url=new URL(location.href);if(value)url.searchParams.set('instrument',value);else url.searchParams.delete('instrument');history.replaceState(null,'',url);}
  useEffect(()=>{const onPop=()=>{const value=new URLSearchParams(location.search).get('instrument')||'';if(value===selectedInstrument)return;if(restoredTx()){const url=new URL(location.href);if(selectedInstrument)url.searchParams.set('instrument',selectedInstrument);else url.searchParams.delete('instrument');history.replaceState(null,'',url);return;}reader.select(value);setState(null);setLoading(true);setSelectedInstrument(value);};window.addEventListener('popstate',onPop);return ()=>window.removeEventListener('popstate',onPop);},[selectedInstrument,reader]);
  const [state, setState] = useState<ChainState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reading = useRef<{key:string;promise:Promise<void>} | null>(null);
  const refresh=useCallback(async(fresh=false)=>{
    const key=selectedInstrument;
    if(reading.current?.key===key){await reading.current.promise;if(!fresh)return;}
    const pending=(async()=>{const outcome=await reader.read(key);if(outcome.kind==='obsolete'||!reader.current(outcome.version))return;
      if(outcome.kind==='current'){setVerifiedNetwork(outcome.value.network);setState(outcome.value);setError('');}else setError(outcome.error instanceof Error?outcome.error.message:'Could not load chain state.');setLoading(false);
    })();const slot={key,promise:pending};reading.current=slot;await pending;if(reading.current===slot)reading.current=null;
  },[selectedInstrument,reader]);
  useEffect(() => { void refresh(); const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 12_000); return () => window.clearInterval(interval); }, [refresh]);
  return <UiLanguageProvider><DisplayPreferencesProvider><WalletProvider network={verifiedNetwork}><Console state={state} loading={loading} error={error} refresh={refresh} chooseInstrument={chooseInstrument} /></WalletProvider></DisplayPreferencesProvider></UiLanguageProvider>;
}

function Console({ state, loading, error, refresh,chooseInstrument }: { state: ChainState | null; loading: boolean; error: string; refresh: (fresh?: boolean) => Promise<void>;chooseInstrument:(value:string)=>void }) {
  const {language,setLanguage,t}=useUiLanguage();
  const {timeZone}=useDisplayPreferences();
  const [view, setView] = useState<View>(initialView);
  const [mode, setMode] = useState<'demo' | 'wallet'>(()=>restoredTx()?.mode||'wallet');
  const [creating,setCreating]=useState(false);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [registryQuery,setRegistryQuery]=useState('');
  const [registryMode,setRegistryMode]=useState<'rights'|'positions'>('rights');
  const [role, setRole] = useState<DemoRole>('issuer');
  const [tx, setTx] = useState<TxRecord | null>(restoredTx);
  const [txOpen, setTxOpen] = useState(Boolean(tx));
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [viewedHolder,setViewedHolder]=useState(()=>new URLSearchParams(location.search).get('holder')||'');
  const [paymentDetail,setPaymentDetail]=useState<PaymentSelection|null>(null);
  const [receiptFilter,setReceiptFilter]=useState<'coupon'|'principal'|'voting'|undefined>();
  const [walletError, setWalletError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'coupon' | 'redemption'>(()=>new URLSearchParams(location.search).get('payment')==='principal'?'redemption':'coupon');
  const [form, setForm] = useState<'fund' | 'transfer' | 'vote' | null>(null);
  const [formValue, setFormValue] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formError, setFormError] = useState('');
  const confirming = useRef(false);
  const wallet = useWalletConnection();
  const activeWallet = mode === 'demo' ? state?.demo.roleWallets[role] : wallet.connected?.account.address;
  const instrument = state?.instrument;
  const issuer = Boolean(activeWallet && instrument && activeWallet === instrument.issuer);
  const [couponChoice,setCouponChoice]=useState(()=>new URLSearchParams(location.search).get('coupon')||'');
  const capturedCoupons=state?.coupons.filter(coupon=>coupon.snapshotAddress)||[];
  const latestCoupon=capturedCoupons.find(c=>c.id===couponChoice)||capturedCoupons.find(c=>c.status!=='completed')||capturedCoupons.at(-1);
  const scheduledCoupon = state?.coupons.find(coupon => coupon.status === 'scheduled');
  const recordDue = Boolean(state && scheduledCoupon && new Date(state.serverTime).getTime() >= new Date(scheduledCoupon.recordAt).getTime());
  const maturityDue = Boolean(state && instrument && new Date(state.serverTime).getTime() >= new Date(instrument.maturityAt).getTime());
  const unsettled = tx?.status === 'pending' || tx?.status === 'unknown';
  const busy = Boolean(tx && ['preparing', 'signing', 'pending'].includes(tx.status));
  const usable = Boolean(state?.connected && !state.readOnlySnapshot && instrument && !error && !busy && !unsettled && activeWallet);
  const captureBusy = Boolean(state?.servicing?.capture && !state.servicing.capture.finalized);
  const supply = instrument ? subtract(instrument.issuedSupply, instrument.redeemedSupply) : undefined;
  const principal = instrument ? multiply(supply, instrument.faceValueMinor) : undefined;
  const totalDue = add([principal, ...(state?.coupons.filter(coupon => coupon.status !== 'completed').map(coupon => subtract(coupon.totalMinor, coupon.paidMinor)) || [])]);
  const vaultReady = Boolean(integer(instrument?.vaultBalanceMinor) != null && integer(totalDue) != null && integer(instrument?.vaultBalanceMinor)! >= integer(totalDue)!);

  useEffect(() => {
    try { if (tx && ['pending', 'unknown'].includes(tx.status)) localStorage.setItem(pendingKey, JSON.stringify(tx)); else localStorage.removeItem(pendingKey); } catch { /* Storage unavailable: the visible session lock still applies. */ }
  }, [tx]);
  useEffect(() => { if (!busy) { setPrepared(null); if (tx?.status === 'review') { setTx(null); setTxOpen(false); } } }, [activeWallet, mode,instrument?.address]);
  useEffect(()=>{if(state&&!state.demo.available&&!unsettled&&!busy)setMode('wallet');},[state?.demo.available,unsettled,busy]);
  useEffect(() => { const onPop = () => {setView(initialView());setCreating(false);const params=new URLSearchParams(location.search);setTab(params.get('payment')==='principal'?'redemption':'coupon');setViewedHolder(params.get('holder')||'');setCouponChoice(params.get('coupon')||'');}; window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  useEffect(()=>{setPaymentDetail(null);},[instrument?.address]);
  function navigate(next: View, payment?:'coupon'|'principal', holder?:string, couponId?:string) { if(next!=='issuer')setCreating(false);setView(next);if(payment)setTab(payment==='principal'?'redemption':'coupon');if(holder)setViewedHolder(holder);if(couponId!==undefined)setCouponChoice(couponId); const url = new URL(location.href); url.searchParams.set('view', next);if(payment)url.searchParams.set('payment',payment);if(holder)url.searchParams.set('holder',holder);if(couponId!==undefined)url.searchParams.set('coupon',couponId);if(url.href!==location.href)history.pushState(null, '', url); }
  function chooseCoupon(value:string){setCouponChoice(value);const url=new URL(location.href);url.searchParams.set('coupon',value);history.replaceState(null,'',url);}
  function openReceipts(filter?:'coupon'|'principal'|'voting'){setReceiptFilter(filter);setProofOpen(true);}
  function selectHolder(holder:string){setViewedHolder(holder);navigate('portfolio',undefined,holder);}
  function inspectPayment(row:Entitlement,kind:'coupon'|'principal') {const source=kind==='coupon'?latestCoupon:state?.redemption;if(!source)return;const perBond=kind==='principal'?instrument?.faceValueMinor:latestCoupon?.unitAmountMinor;setPaymentDetail({...row,kind,couponId:kind==='coupon'?latestCoupon?.id:undefined,snapshotAddress:source.snapshotAddress,recordAt:kind==='coupon'?latestCoupon?.recordAt:instrument?.maturityAt,paymentAt:kind==='coupon'?latestCoupon?.paymentAt:instrument?.maturityAt,unitAmountMinor:perBond});}
  async function readAgain() { setRefreshing(true); await refresh(); setRefreshing(false); }

  async function queue(request: ActionRequest) {
    if (state?.readOnlySnapshot) { setNetworkOpen(true); return; }
    if (unsettled || busy) { setTxOpen(true); return; }
    if (request.action !== 'bootstrap' && !activeWallet) { setWalletOpen(true); return; }
    request={...request,params:{...request.params,...(!['initialize_issue','initialize_issue_v2','bootstrap'].includes(request.action)&&instrument?{bondAddress:instrument.address}:{})}};
    let next: TxRecord = { request, status: 'review', mode: request.action === 'bootstrap' ? 'demo' : mode, role: request.action === 'bootstrap' ? 'issuer' : role, signer: request.action === 'bootstrap' ? '' : activeWallet || '', operationId: crypto.randomUUID() };
    try{request=resolvePagedAction(request,state);next={...next,request};}catch(failure){setPrepared(null);setTx({...next,status:'error',message:failure instanceof Error?failure.message:'The paged action could not be reviewed.'});setTxOpen(true);return;}
    setPrepared(null); setTx(next); setTxOpen(true);
    if (request.action !== 'bootstrap' && activeWallet) {
      setTx({ ...next, status: 'preparing' });
      try {
        const result = await api.prepare(request.action, activeWallet, request.params);
        if (result.summary.signer !== activeWallet || result.summary.network !== state?.network || (!['initialize_issue','initialize_issue_v2'].includes(request.action)&&result.summary.instrumentAddress!==instrument?.address)) throw new Error('The prepared transaction no longer matches your wallet or network. Refresh the preview.');
        setPrepared(result); setTx({ ...next, status: 'review', operationId: next.mode === 'wallet' ? result.operationId : next.operationId, summary: result.summary });
      } catch (failure) { setTx({ ...next, status: 'error', message: failure instanceof Error ? failure.message : 'The transaction could not be prepared.' }); }
    }
  }
  async function track(next: TxRecord, initialStatus?: string) {
    const confirmed=()=>{setTx({...next,status:'confirmed'});if(['initialize_issue','initialize_issue_v2'].includes(next.request.action)&&next.summary?.instrumentAddress){setCreating(false);chooseInstrument(next.summary.instrumentAddress);}};
    if (['failed', 'error', 'expired'].includes(initialStatus || '')) { setTx({ ...next, status: 'error', message: 'The existing operation was rejected or expired. No automatic retry was made.' }); await refresh(); return; }
    if (!next.signature) { setTx({ ...next, status: 'unknown', message: 'No signature was returned. Read the chain state before proceeding; this operation will not be resubmitted automatically.' }); return; }
    if (['confirmed', 'finalized'].includes(initialStatus || '')) { confirmed(); await refresh(true); return; }
    setTx({ ...next, status: 'pending' });
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const result = next.operationId?await api.operation(next.operationId):await api.status(next.signature);
        if (['confirmed', 'finalized'].includes(result.status)) { confirmed(); await refresh(true); return; }
        if (['failed', 'error', 'expired'].includes(result.status)) { setTx({ ...next, status: 'error', message: 'The network rejected this transaction. Refresh the chain state before preparing another.' }); await refresh(); return; }
      } catch { /* A read failure must not trigger a second mutation. */ }
      await new Promise(resolve => window.setTimeout(resolve, 1500));
    }
    setTx({ ...next, status: 'unknown', message: 'Confirmation is taking longer than expected. Check this signature; submitting again could duplicate an operation.' });
    await refresh();
  }
  async function reconcile() {
    if (!tx || confirming.current) return;
    if (!tx.operationId) { if (tx.signature) await track(tx); else await readAgain(); return; }
    confirming.current=true;
    setRefreshing(true);
    try {
      const result = tx.request.action==='bootstrap'?await api.bootstrap(tx.request.reset,tx.operationId):tx.mode==='demo'&&!tx.signature?await api.demoAction(tx.request.action,tx.role,tx.request.params,tx.operationId):await api.operation(tx.operationId);
      if (['error', 'failed', 'expired'].includes(result.status)) { setTx({ ...tx, status: 'error', message: result.message || 'This operation was rejected before confirmation. Read the updated state before preparing another.' }); await refresh(); }
      else if (result.signature) await track({ ...tx, signature: result.signature, explorerUrl: result.explorerUrl || tx.explorerUrl }, result.status);
      else { setTx({ ...tx, status: 'unknown', message: 'The service is still checking this operation. Keep the existing operation ID; no new transaction has been submitted.' }); await refresh(); }
    } catch (failure) { setTx({ ...tx, status: 'unknown', message: failure instanceof Error ? failure.message : 'The operation could not be read yet.' }); }
    finally { confirming.current=false;setRefreshing(false); }
  }
  async function confirm() {
    if (state?.readOnlySnapshot) { setNetworkOpen(true); return; }
    if (!tx || tx.status !== 'review' || !state || confirming.current) return;
    const current = { ...tx };
    if (current.request.action !== 'bootstrap' && current.signer !== activeWallet) { setTx({ ...current, status: 'error', message: 'The active wallet changed. Prepare a new preview.' }); return; }
    if(!['initialize_issue','initialize_issue_v2','bootstrap'].includes(current.request.action)&&current.request.params.bondAddress!==instrument?.address){setTx({...current,status:'error',message:'The selected instrument changed. Prepare a new review.'});return;}
    let submitted = false;
    confirming.current = true;
    try {
      let result;
      if (current.mode === 'demo') {
        try { localStorage.setItem(pendingKey, JSON.stringify({ ...current, status: 'pending' })); } catch { /* Visible operation lock still prevents resubmission. */ }
        setTx({ ...current, status: 'pending', message: 'Submitting through the workspace signer…' }); submitted = true;
        result = current.request.action === 'bootstrap' ? await api.bootstrap(current.request.reset, current.operationId) : await api.demoAction(current.request.action, current.role, current.request.params, current.operationId!);
      } else {
        if (!prepared || !wallet.connected) throw new Error('Reconnect your wallet and prepare a new transaction.');
        if (prepared.summary.simulation?.success !== true) throw new Error('A successful network simulation is required before signing. The API has not provided one.');
        setTx({ ...current, status: 'signing' });
        const signed = await signPreparedTransaction(wallet.connected, state.network, prepared.transactionBase64, {lastValidBlockHeight: prepared.lastValidBlockHeight});
        try { localStorage.setItem(pendingKey, JSON.stringify({ ...current, status: 'pending' })); } catch { /* Visible operation lock still prevents resubmission. */ }
        setTx({ ...current, status: 'pending' }); submitted = true;
        result = await api.submit(signed);
      }
      await track({ ...current, operationId: result.operationId || current.operationId, signature: result.signature, explorerUrl: result.explorerUrl, status: 'pending' }, result.status);
      if (current.request.action === 'bootstrap') { setMode('demo'); setRole('issuer'); navigate('overview'); }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'The operation could not complete.';
      const cancelled = !submitted && /reject|declin|cancel/i.test(message);
      const unknown = submitted && (!(failure instanceof ApiError) || failure.uncertain);
      setTx({ ...current, status: cancelled ? 'cancelled' : unknown ? 'unknown' : 'error', message });
    } finally { confirming.current = false; }
  }
  function openForm(next: 'fund' | 'transfer' | 'vote') { setForm(next); setFormValue(''); setFormTarget(''); setFormError(''); }
  function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (form === 'fund') {
      const minor = decimalInput(formValue);
      if (!minor || BigInt(minor) <= 0n) { setFormError('Enter a positive amount with up to 6 decimal places.'); return; }
      setForm(null); void queue({ action: 'fund_vault', params: { amountMinor: minor }, title: 'Fund settlement vault', explanation: 'Move settlement tokens from the issuer to the issue reserve.', amountMinor: minor });
    } else if (form === 'transfer') {
      const holding = state?.holders.find(holder => holder.wallet === activeWallet);
      if (!/^\d+$/.test(formValue) || BigInt(formValue) <= 0n || BigInt(formValue) > (integer(holding?.units) || 0n)) { setFormError('Enter a whole quantity within your current holding.'); return; }
      if (!formTarget || formTarget === activeWallet || !state?.holders.some(holder => holder.wallet === formTarget)) { setFormError('Choose another registered holder.'); return; }
      setForm(null); void queue({ action: 'transfer_bonds', params: { targetWallet: formTarget, units: formValue }, title: 'Transfer registered bonds', explanation: `Transfer ${units(formValue)} bonds to a registered holder. Existing snapshot rights stay with their recorded owner.` });
    } else if (form === 'vote') {
      const titleError = proposalTitleError(formValue);
      if (titleError) { setFormError(titleError); document.getElementById('action-value')?.focus(); return; }
      setForm(null); void queue({ action: 'create_vote', params: { title: formValue.trim(), proposalId: (state!.proposals.reduce((max, proposal) => (integer(proposal.id) || 0n) > max ? integer(proposal.id)! : max, 0n) + 1n).toString() }, title: 'Open holder vote', explanation: 'Create a proposal using fixed holder weights from an on-chain snapshot.' });
    }
  }
  const captureRequest: ActionRequest = { action: 'capture_coupon', params: { couponId: scheduledCoupon?.id || '0' }, title: 'Capture coupon record date', explanation: 'Freeze the current registered holdings. Later transfers will not change this coupon’s entitlement.' };
  const redemptionRequest: ActionRequest = { action: 'begin_redemption', params: {}, title: 'Open principal redemption', explanation: 'Freeze the maturity positions for repayment. Each redeemed position is retired from circulation.', amountMinor: principal };
  const registryHolders = state?.holders.filter(holder => `${holder.label} ${holder.wallet}`.toLowerCase().includes(registryQuery.trim().toLowerCase())) ?? [];

  return <div className="app-shell">
    <a className="skip-link" href="#main">{t("Skip to content")}</a>
    <aside className="sidebar" data-expanded={mobileNavOpen}>
      <div className="brand-row">
      <a className="brand" href={`?${new URLSearchParams({view:'overview',...(instrument?{instrument:instrument.address}:{})})}`} onClick={event=>{event.preventDefault();navigate('overview');}} aria-label={t("BondTrace overview")}><img className="brand-lockup" src="/brand/bondtrace-lettering.svg" width="254" height="44" alt="BondTrace" /></a><button type="button" className="icon-button mobile-menu" aria-label={translate(language, 'Navigation menu', 'Меню разделов')} aria-expanded={mobileNavOpen} aria-controls="workspace-nav" onClick={()=>setMobileNavOpen(!mobileNavOpen)}>{mobileNavOpen?<X size={21}/>:<Menu size={21}/>}</button></div>

      <nav id="workspace-nav" aria-label={t("Main navigation")}>{navItems.map((item,index) => <Fragment key={item.id}>{index===0&&<span className="nav-section-label">{translate(language, 'Issue management', 'Управление выпуском')}</span>}{index===4&&<span className="nav-section-label">{translate(language, 'Holder workspace', 'Для держателя')}</span>}<WorkspaceLink view={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onNavigate={() => {navigate(item.id);setMobileNavOpen(false);}}><item.icon size={21} strokeWidth={2} aria-hidden="true" /><span>{item.id==='issuer'?(translate(language, 'Issue', 'Выпуск')):item.id==='registry'?(translate(language, 'Holders', 'Держатели')):item.id==='voting'?(translate(language, 'Voting', 'Голосования')):t(viewLabels[item.id])}</span>{view === item.id && <ChevronRight size={16} className="nav-arrow" aria-hidden="true" />}</WorkspaceLink></Fragment>)}<button type="button" className="nav-item mobile-receipts" onClick={()=>{setProofOpen(true);setMobileNavOpen(false);}}><ShieldCheck size={19} aria-hidden="true"/>{t("Receipts & activity")}</button></nav>
      <div className="sidebar-bottom"><button type="button" className="sidebar-proof" onClick={() => setProofOpen(true)}><ShieldCheck size={18} aria-hidden="true" />{translate(language, 'Activity log', 'История операций')}<ArrowUpRight size={15} aria-hidden="true" /></button></div>
    </aside>
    <div className="workspace">
      <header className="topbar unified-toolbar">
        <div className="shell-issue">{view==='issuer'&&creating ? <div className="creation-context"><Landmark size={18} aria-hidden="true" /><strong>{translate(language, 'Issuer workspace', 'Кабинет эмитента')}</strong></div> : instrument && <div className="selected-issue-name"><Landmark size={18} aria-hidden="true" /><span>{instrument.name}</span></div>}<button type="button" className="network-chip" onClick={()=>setNetworkOpen(true)} title={state?.readOnlySnapshot?(translate(language, 'Saved localnet snapshot — read-only', 'Архивный снимок localnet — только просмотр')):state?.network?`Solana ${state.network}`:t('RPC offline')} aria-label={translate(language, 'Test network details', 'Сведения о тестовой сети')}><span className={`network-dot${state?.readOnlySnapshot?' snapshot':state?.connected&&!error?' live':' off'}`} aria-hidden="true"/><span className="network-label-full">{state?.readOnlySnapshot?(translate(language, 'Saved snapshot', 'Архивный снимок')):state?.connected&&!error?(translate(language, 'Test network', 'Тестовая сеть')):(translate(language, 'Offline', 'Нет связи'))}</span><span className="network-label-short">{state?.readOnlySnapshot?(translate(language, 'Saved', 'Архив')):state?.connected&&!error?(translate(language, 'Test', 'Тест')):(translate(language, 'Offline', 'Нет связи'))}</span></button></div>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label={t('Interface language')}><button type="button" aria-label="Қазақша" aria-pressed={language==='kk'} onClick={()=>setLanguage('kk')}>KZ</button><button type="button" aria-pressed={language==='ru'} onClick={()=>setLanguage('ru')}>RU</button><button type="button" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>EN</button></div>
          <Button className="settings-trigger toolbar-command" onClick={()=>setSettingsOpen(true)} aria-label={translate(language, 'Preferences', 'Настройки')} title={translate(language, 'Preferences', 'Настройки')}><Settings2 size={20} aria-hidden="true"/><span className="toolbar-command-label">{translate(language, 'Settings', 'Настройки')}</span></Button>
          <Button className="account-trigger" disabled={loading||!state?.connected||busy||unsettled} onClick={()=>setWalletOpen(true)}><Wallet size={18} aria-hidden="true" /><span className="account-caption"><span>{mode==='demo'?t(roleLabels[role]):wallet.connected?wallet.connected.wallet.name:t('Account')}</span>{mode==='wallet'&&wallet.connected&&<small className="account-address">{shortAddress(wallet.connected.account.address,4)}</small>}</span><ChevronRight size={16} aria-hidden="true" /></Button>
          <Button className="refresh-trigger toolbar-command" onClick={readAgain} aria-label={t('Refresh chain state')} disabled={refreshing}><RefreshCw size={20} className={refreshing?'spin':''} aria-hidden="true"/><span className="toolbar-command-label">{translate(language, 'Refresh', 'Обновить')}</span></Button>
        </div>
      </header>
      <main id="main" className="main-content" data-view={view}>
        {error && <ErrorNotice message={language==='en'?error:translate(language,'The network is unavailable. Refresh the data to continue.','Не удалось прочитать данные сети. Проверьте подключение API и RPC и повторите загрузку.')} action={<Button onClick={readAgain} busy={refreshing}>{t("Read state again")}</Button>} />}
        {!error && state && !state.connected && <ErrorNotice message={translate(language, 'The API is reachable, but the Solana RPC is unavailable. Amounts and actions remain disabled until the chain can be read.', 'API доступен, но сеть Solana не отвечает. Суммы и операции недоступны до восстановления связи.')} action={<Button onClick={readAgain} busy={refreshing}>{t("Check connection")}</Button>} />}
        {unsettled && <div className="notice warning" role="status"><Clock3 size={20} aria-hidden="true" /><div><strong>{t("One operation needs verification")}</strong><p>{t("Further submissions are paused until its network status is known.")}</p></div><Button onClick={() => setTxOpen(true)}>{t("Check operation")}</Button></div>}
        {(error || (state && !state.connected)) && !instrument ? <div className="connection-state"><h1>{t(viewLabels[view])}</h1><p>{translate(language, 'Issue data is temporarily unavailable. Retry the connection to return to this workspace.', 'Данные выпуска временно недоступны. Повторите загрузку — создавать новый выпуск не нужно.')}</p></div> : view==='issuer'&&state?<Suspense fallback={<Loading/>}><IssuerSetup language={language} startNew={creating} onCreationChange={setCreating} state={state} walletAddress={activeWallet} canAct={Boolean(state.connected&&!state.readOnlySnapshot&&!error&&!busy&&!unsettled&&activeWallet)} busy={busy||Boolean(unsettled)} onAction={request=>void queue(request)} onChooseIssue={chooseInstrument} onViewPayments={selection=>navigate('payments',selection?.kind==='principal'?'principal':'coupon',undefined,selection?.couponId)} onViewReceipts={()=>openReceipts()}/></Suspense>:loading ? <Loading /> : !instrument ? <FirstRun onCreate={() => {setCreating(true);navigate('issuer');}} available={Boolean(state?.demo.available && state.connected)} network={state?.network} busy={busy} onStart={() => queue({ action: 'bootstrap', params: {}, title: 'Open example workspace', explanation: 'Create generated issuer and holder accounts, an example issue and a reserved settlement balance in the current sandbox network.' })} /> : <>
          {!['payments','overview'].includes(view)&&<PageHeading view={view} />}

          {view==='overview'&&<JudgeOverview state={state!} onNavigate={(next,payment,couponId)=>navigate(next,payment,undefined,couponId)} onReceipts={()=>openReceipts()} onCreate={()=>{setCreating(true);navigate('issuer');}}/>}
          {view === 'registry' && <section className="registry-view">
            <div className="registry-view-toolbar"><div className="workspace-view-switch" role="group" aria-label={translate(language, 'Registry view', 'Вид реестра')}><button type="button" aria-pressed={registryMode==='rights'&&Boolean(latestCoupon)} disabled={!latestCoupon} onClick={()=>setRegistryMode('rights')}>{translate(language, 'Payment rights', 'Права на выплаты')}</button><button type="button" aria-pressed={registryMode==='positions'||!latestCoupon} onClick={()=>setRegistryMode('positions')}>{translate(language, 'Current positions', 'Текущие позиции')}</button></div><Button variant="ghost" onClick={()=>setProofOpen(true)}>{translate(language, 'Activity', 'История')}</Button></div>
            {(registryMode==='positions'||!latestCoupon)&&<>
            <div className="section-summary"><div><h2>{translate(language, 'Current positions', 'Текущие позиции')} <span>· {units(state!.holders.length)} {t('holders')}</span></h2><p>{instrument.status==='redeemed'?(translate(language, 'Bonds are redeemed. See Payment rights for historical allocations.', 'Облигации погашены. Начисления доступны во вкладке «Права на выплаты».')):(translate(language, 'Current bond balances. Coupon rights are recorded separately.', 'Баланс облигаций сейчас. Права на купон фиксируются отдельно.'))}</p></div>{scheduledCoupon&&<div className="registry-capture"><Button variant="primary" disabled={!usable || !recordDue || captureBusy || instrument.status !== 'active'} onClick={()=>void queue(captureRequest)}>{t('Capture record date')}<ArrowRight size={16} aria-hidden="true"/></Button>{(!usable||!recordDue||captureBusy)&&<small>{!activeWallet?(translate(language, 'Connect an account to pay the transaction fee.', 'Подключите аккаунт для оплаты комиссии.')):captureBusy?(translate(language, 'Complete the current capture below.', 'Завершите текущую фиксацию ниже.')):!recordDue?(translate(language, 'Record date has not arrived.', 'Ожидается дата фиксации.')):translate(language, 'Check the current operation first.', 'Сначала проверьте текущую операцию.')}</small>}</div>}</div>
            <Panel>
              <div className="registry-toolbar"><label className="registry-search"><Search size={18} aria-hidden="true"/><span className="sr-only">{translate(language, 'Search holder or address', 'Поиск держателя или адреса')}</span><input type="search" value={registryQuery} onChange={event=>setRegistryQuery(event.target.value)} placeholder={translate(language, 'Holder or wallet address', 'Держатель или адрес')}/></label><span>{units(registryHolders.length)} {t('holders')}</span></div>
              <div className="table-scroll"><table className="positions-table"><caption className="sr-only">{t('Registered holders and current positions')}</caption><thead><tr><th>{t('Registered holder')}</th><th className="numeric">{translate(language, 'Bonds now', 'Облигации сейчас')}</th><th className="numeric">{t('Face-value position')}</th><th><span className="sr-only">{translate(language, 'Actions', 'Действия')}</span></th></tr></thead><tbody>{registryHolders.map(holder=><tr key={holder.wallet}><td><div className="holder-cell"><span className="holder-number" aria-hidden="true"><UsersRound size={18}/></span><div className="registry-holder-identity"><WorkspaceLink view="portfolio" holder={holder.wallet} className="holder-name-link" onNavigate={()=>selectHolder(holder.wallet)} title={translate(language, 'Open holder portfolio', 'Открыть портфель держателя')}>{holder.label}</WorkspaceLink><Address value={holder.wallet}/></div></div></td><td className="numeric number" data-label={translate(language, 'Bonds now', 'Облигации сейчас')}>{units(holder.units)}</td><td className="numeric" data-label={translate(language, 'Face value', 'Номинал')}><Money value={multiply(holder.units,instrument.faceValueMinor)}/></td><td><Button variant="ghost" onClick={()=>selectHolder(holder.wallet)}>{translate(language, 'Portfolio', 'Портфель')}<ArrowRight size={18} aria-hidden="true"/></Button></td></tr>)}</tbody></table></div>
              {registryHolders.length===0&&<Empty title={state!.holders.length===0?t('The registry is empty'):(translate(language, 'No matching holders', 'Держатель не найден'))} description={state!.holders.length===0?t('Issue bonds to registered holders before capturing corporate-action rights.'):(translate(language, 'Try a different holder name or wallet address.', 'Измените имя или адрес в поиске.'))} action={registryQuery?<Button onClick={()=>setRegistryQuery('')}>{translate(language, 'Clear search', 'Сбросить поиск')}</Button>:undefined}/>}</Panel>
            </>}
            {latestCoupon&&registryMode==='rights'&&<Panel className="registry-rights" title={translate(language, 'Payment recipients', 'Получатели выплаты')} label={timeZoneLabel(timeZone,language)} action={<div className="registry-record-choice">{capturedCoupons.length>1&&<label><span className="sr-only">{t("Recorded rights")}</span><select value={latestCoupon.id} onChange={event=>chooseCoupon(event.target.value)}>{capturedCoupons.map(c=><option key={c.id} value={c.id}>{t("Coupon")} {units((integer(c.id) ?? 0n)+1n)} · {c.status==="completed"?t("Paid"):(translate(language, "Recorded rights", "Права на выплату"))}</option>)}</select></label>}<div className="registry-record-date"><span>{translate(language, 'Record date', 'Фиксация прав')}</span><DisplayDate value={latestCoupon.recordAt}/></div></div>}><PaymentTable rows={latestCoupon.entitlements} holders={state!.holders} activeWallet={activeWallet} onDetails={row=>inspectPayment(row,'coupon')} onHolder={selectHolder}/><details className="snapshot-disclosure"><summary>{translate(language, 'On-chain rights record', 'Запись прав в сети')}</summary><dl><div><dt>{t('Record slot')}</dt><dd className="number">{units(latestCoupon.recordSlot)}</dd></div><div><dt>{t('Snapshot account')}</dt><dd><Address value={latestCoupon.snapshotAddress} full/></dd></div></dl></details></Panel>}
          </section>}
          {view==='payments'&&<PaymentsWorkspace state={state!} principal={principal} coupon={latestCoupon} tab={tab} onTab={value=>navigate('payments',value==='redemption'?'principal':'coupon')} onFund={()=>openForm('fund')} canFund={usable&&issuer} fundReason={!activeWallet?(translate(language, 'Connect the issuer account to add funds.', 'Подключите аккаунт эмитента, чтобы пополнить резерв.')):!issuer?(translate(language, 'Only this issue’s issuer can add funds.', 'Резерв пополняет только эмитент этого выпуска.')):!usable?(translate(language, 'Resolve the current operation and refresh the issue first.', 'Сначала завершите текущую операцию и обновите данные.')) : ''} onContinueCapture={()=>navigate('issuer')} onClaims={()=>navigate('portfolio')} onReceipts={()=>openReceipts(tab==='coupon'?'coupon':'principal')} scopeSelector={capturedCoupons.length>1?<label className="payment-picker"><span className="sr-only">{t('Recorded rights')}</span><select value={latestCoupon?.id||''} onChange={event=>chooseCoupon(event.target.value)}>{capturedCoupons.map(c=><option key={c.id} value={c.id}>{t('Coupon')} {Number(c.id)+1} · {date(c.recordAt,false,language)}</option>)}</select></label>:undefined}>{tab === 'coupon' ? latestCoupon ? <><PaymentTable rows={latestCoupon.entitlements} holders={state!.holders} activeWallet={activeWallet} onDetails={row=>inspectPayment(row,'coupon')} onHolder={selectHolder}/></> : <Empty title={t("Capture the record date first")} description={translate(language, 'Coupon claims become available after the rights snapshot is finalized and the payment date arrives.', 'Купон доступен после завершения фиксации прав и наступления даты выплаты.')} action={<Button variant="primary" disabled={!usable || !activeWallet || !recordDue || Boolean(state?.servicing?.capture&&!state.servicing.capture.finalized)} onClick={() => queue(captureRequest)}>{t("Capture record date")}</Button>} icon={<FileCheck2 size={25} />} /> : state!.redemption ? <><PaymentTable rows={state!.redemption.entitlements} holders={state!.holders} activeWallet={activeWallet} onDetails={row=>inspectPayment(row,'principal')} onHolder={selectHolder}/></> : <Empty title={t("Principal redemption is not open")} description={`Maturity: ${date(instrument.maturityAt, true, language)}. Opening redemption freezes positions and prevents further transfers.`} action={<Button variant="primary" disabled={!usable || !activeWallet || instrument.status !== 'active' || !maturityDue || Boolean(state?.servicing?.capture&&!state.servicing.capture.finalized)} onClick={() => queue(redemptionRequest)}>{t("Open redemption")}</Button>} icon={<Landmark size={25} />} />}</PaymentsWorkspace>}
          {['registry','payments','voting'].includes(view)&&instrument.version===2&&<PagedOperations key={instrument.address} state={state!} activeWallet={activeWallet} usable={usable} onQueue={queue}/>}
          {view==='portfolio'&&<HolderPortfolio state={state!} activeWallet={activeWallet} viewedWallet={state!.holders.some(h=>h.wallet===viewedHolder)?viewedHolder:undefined} onSelect={selectHolder} usable={usable} onQueue={queue} onTransfer={()=>openForm('transfer')} onConnect={()=>setWalletOpen(true)} onReceipt={setPaymentDetail} onHistory={()=>setProofOpen(true)}/>}
          {view==='voting'&&<VotingWorkspace state={state!} activeWallet={activeWallet} canAct={usable} disabledReason={!activeWallet?(translate(language, 'Choose a signing account.', 'Выберите аккаунт подписи.')):!usable?(translate(language, 'Refresh the issue and resolve the current operation.', 'Обновите данные и проверьте текущую операцию.')) : ''} onAction={request=>void queue(request)} onReceipts={()=>openReceipts('voting')} onCreateProposal={()=>openForm('vote')} onConnect={()=>{if(busy||unsettled){setTxOpen(true);return;}setWalletOpen(true);}} onRefresh={()=>void readAgain()}/>}
        </>}
        {view==='issuer'&&!creating&&instrument?.version===2&&state&&<PagedOperations key={instrument.address} state={state} activeWallet={activeWallet} usable={usable} onQueue={queue}/>}
      </main>
    </div>
    <Overlay open={networkOpen} onClose={()=>setNetworkOpen(false)} title={translate(language, 'Test environment', 'Тестовая среда')}><div className="dialog-body"><Badge tone="blue">{state?.network?`Solana ${state.network}`:(translate(language, 'Network unavailable', 'Сеть недоступна'))}</Badge><p>{state?.readOnlySnapshot?(translate(language, 'Saved localnet snapshot. Read-only: operations cannot be signed or submitted.', 'Архивный снимок localnet. Только просмотр: операции не подписываются и не отправляются.')):state?.network==='localnet'?(translate(language, 'Solana runs locally on this computer. Payments use test tokens.', 'Локальная сеть Solana работает на этом компьютере. Выплаты выполняются тестовыми токенами.')):state?.network==='devnet'?(translate(language, 'Solana’s public test network is used to verify this prototype. Payments use test tokens.', 'Публичная тестовая сеть Solana для проверки прототипа. Выплаты выполняются тестовыми токенами.')):(translate(language, 'The network is currently unavailable. Refresh the data to continue.', 'Сейчас нет связи с сетью. Обновите данные, чтобы продолжить.'))}</p>{state?.readOnlySnapshot&&<p>{translate(language, 'Captured: ', 'Снимок сохранён: ')}{date(state.readOnlySnapshot.capturedAt,true,language,timeZone)}</p>}{!state?.connected&&<Button onClick={readAgain} busy={refreshing}>{translate(language, 'Refresh data', 'Обновить данные')}</Button>}</div></Overlay>
    <Overlay open={proofOpen} onClose={()=>setProofOpen(false)} title={translate(language, 'Activity log', 'История операций')} drawer><div className="proof-summary"><div className="receipt-filter" role="group" aria-label={translate(language, 'Action type', 'Тип действия')}>{([{id:undefined,en:'All',ru:'Все'},{id:'coupon',en:'Coupon',ru:'Купон'},{id:'principal',en:'Principal',ru:'Номинал'},{id:'voting',en:'Voting',ru:'Голосование'}] as const).map(item=><button key={item.en} type="button" aria-pressed={receiptFilter===item.id} onClick={()=>setReceiptFilter(item.id)}>{translate(language, item.en, item.ru)}</button>)}</div><p className="zone-caption">{timeZoneLabel(timeZone,language)} · Solana {state?.network??'—'}</p><details className="receipt-context"><summary>{translate(language, 'Issue & program', 'Выпуск и программа')}</summary>{instrument&&<><p>{instrument.name}</p><Address value={instrument.address} full/></>}{state?.programId&&<Address value={state.programId} full/>}</details>{Boolean(state?.instruments&&state.instruments.length>1)&&<details className="issue-history"><summary>{translate(language, 'Other issues', 'Другие выпуски')}</summary><div className="issue-history-list">{state!.instruments!.map(item=><button type="button" key={item.address} disabled={busy||Boolean(unsettled)} aria-current={item.address===instrument?.address?'true':undefined} onClick={()=>{chooseInstrument(item.address);setProofOpen(false);}}><span>{item.name}</span><small>{shortAddress(item.address,5)}</small></button>)}</div></details>}</div>{state?<ReceiptList state={state} filter={receiptFilter}/>:<Empty title={t('No chain state available')} description={t('Connect the API and RPC to read confirmed activity.')}/>}</Overlay>
    <Overlay open={settingsOpen} onClose={()=>setSettingsOpen(false)} title={translate(language, 'Preferences', 'Настройки')}><InterfaceSettings now={state?.serverTime}/></Overlay>
    <Overlay open={Boolean(paymentDetail)} onClose={()=>setPaymentDetail(null)} title={paymentDetail?.kind==='principal'?(translate(language, 'Principal repayment', 'Возврат номинала')):(translate(language, 'Coupon payment', 'Выплата купона'))}>{state&&paymentDetail&&<ReceiptDetails state={state} selection={paymentDetail} onPortfolio={()=>{selectHolder(paymentDetail.wallet);setPaymentDetail(null);}} onAllReceipts={()=>{openReceipts(paymentDetail.kind);setPaymentDetail(null);}}/>}</Overlay>
    <Overlay open={walletOpen} onClose={() => setWalletOpen(false)} title={translate(language, 'Account', 'Аккаунт')} className="account-dialog">
      <AccountPicker open={walletOpen} holders={state?.holders || []} selectedHolder={view==='portfolio'?(state?.holders.some(holder=>holder.wallet===viewedHolder)?viewedHolder:activeWallet||state?.holders[0]?.wallet):undefined} onHolder={value=>{selectHolder(value);setWalletOpen(false);}} onSettings={()=>{setWalletOpen(false);setSettingsOpen(true);}} onClose={()=>setWalletOpen(false)}>
          {walletError&&<div className="notice error" role="alert">{walletError}</div>}
          {wallet.connected?<><div className="account-connected"><strong>{wallet.connected.wallet.name}</strong><Address value={wallet.connected.account.address}/></div><div className="account-actions"><Button variant="primary" onClick={()=>{setMode('wallet');setWalletOpen(false);}}>{t('Use my wallet')}<ArrowRight size={16} aria-hidden="true" /></Button><Button onClick={async()=>{try{await wallet.disconnect();setWalletError('');}catch(failure){setWalletError(failure instanceof Error?failure.message:'Could not disconnect wallet.');}}}>{t('Disconnect wallet')}</Button></div></>
          :wallet.wallets.length?<div className="wallet-list">{wallet.wallets.map(available=><Button key={available.name} variant="primary" disabled={wallet.status==='connecting'} busy={wallet.status==='connecting'} onClick={async()=>{try{setWalletError('');await wallet.connect(available);setMode('wallet');setWalletOpen(false);}catch(failure){setWalletError(failure instanceof Error?failure.message:'Unlock your wallet and try connecting again.');}}}><Wallet size={18} aria-hidden="true" />{available.name}<ArrowRight size={16} aria-hidden="true" /></Button>)}</div>
          :<div className="account-unavailable"><p>{t('No compatible wallet detected')}</p><a className="button secondary" href="https://solana.com/solana-wallets" target="_blank" rel="noreferrer">{t('Wallets on Solana')}<ArrowUpRight size={17} aria-hidden="true" /></a></div>}
        {state?.demo.available&&<details className="example-accounts" open={mode==='demo'}><summary><FlaskConical size={18} aria-hidden="true" />{translate(language, 'Test signing accounts', 'Тестовые аккаунты подписи')}</summary><p>{translate(language, 'Choosing an account enables signing test operations with that account.', 'Выбор аккаунта включает подписание тестовых операций этим аккаунтом.')}</p><div className="account-role-list">{Object.entries(roleLabels).map(([id,label])=><Button key={id} aria-pressed={mode==='demo'&&role===id} disabled={busy||unsettled} onClick={()=>{setRole(id as DemoRole);setMode('demo');setWalletOpen(false);}}>{id==='issuer'?<Landmark size={18} aria-hidden="true" />:<UsersRound size={18} aria-hidden="true" />}{t(label)}<ArrowRight size={16} aria-hidden="true" /></Button>)}</div></details>}
      </AccountPicker>
    </Overlay>
    <Overlay closeDisabled={busy} open={txOpen} onClose={() => { if (!busy) setTxOpen(false); }} title={tx?.request.title || t("Review operation")}>{tx && <TransactionReview tx={tx} state={state} prepared={prepared} onConfirm={confirm} onClose={() => setTxOpen(false)} onCheck={reconcile} />}</Overlay>
    <Overlay open={Boolean(form)} onClose={() => setForm(null)} title={form === 'fund' ? 'Add settlement reserve' : form === 'transfer' ? 'Transfer registered bonds' : 'Create a holder proposal'}><form className="dialog-body action-form" onSubmit={submitForm}><p>{form === 'fund' ? 'Transfer from the issuer settlement account. Amounts preserve all 6 decimals.' : form === 'transfer' ? 'Only registered holders can receive bonds. Prior snapshot rights remain fixed.' : 'Holder votes use the recorded bond quantity as weight.'}</p>{form === 'transfer' && <label htmlFor="target-wallet">{t("Registered recipient")}<select id="target-wallet" value={formTarget} onChange={event => setFormTarget(event.target.value)} required><option value="">{t("Choose a registered holder")}</option>{state?.holders.filter(holder => holder.wallet !== activeWallet).map(holder => <option key={holder.wallet} value={holder.wallet}>{holder.label || shortAddress(holder.wallet)}</option>)}</select></label>}<label htmlFor="action-value">{form === 'vote' ? 'Proposal title' : form === 'fund' ? t("Settlement amount") : t("Bond quantity")}<input id="action-value" type="text" inputMode={form === 'vote' ? 'text' : form === 'fund' ? 'decimal' : 'numeric'} autoComplete="off" value={formValue} onChange={event => {setFormValue(event.target.value);setFormError('');}} maxLength={form === 'vote' ? undefined : 32} aria-invalid={Boolean(formError)} aria-describedby={formError ? 'form-error' : undefined} required /></label>{formError && <p className="field-error" id="form-error" role="alert">{formError}</p>}<div className="dialog-actions"><Button onClick={() => setForm(null)}>{t("Cancel")}</Button><Button variant="primary" type="submit">{t("Review action")}<ArrowRight size={16} aria-hidden="true" /></Button></div></form></Overlay>
  </div>;
}

function Loading() {
  const {t,language}=useUiLanguage();
 return <div className="loading-layout" aria-busy="true" aria-label={t("Reading the instrument from Solana")}><div className="skeleton heading-skeleton" /><div className="skeleton hero-skeleton" /><div className="skeleton rail-skeleton" /><div className="skeleton table-skeleton" /></div>; }
function FirstRun({ available, busy, onStart, onCreate }: { available: boolean; network?: string; busy: boolean; onStart: () => void; onCreate: () => void }) {
  const {t,language}=useUiLanguage();

  return <section><h1>{translate(language, 'Issues', 'Выпуски')}</h1><Panel><Empty title={translate(language, 'No issues yet', 'Пока нет выпусков')} description={translate(language, 'Create an issue or prepare a test example.', 'Создайте выпуск или подготовьте тестовый пример.')} action={<div className="intro-actions"><Button variant="primary" onClick={onCreate}>{t('Create an issue')}<ArrowRight size={17} aria-hidden="true"/></Button><Button disabled={!available||busy} busy={busy} onClick={onStart}>{t('Open example workspace')}</Button></div>}/></Panel></section>;
}
function PageHeading({view}:{view:View}) { const {t}=useUiLanguage(); return <h1 className="sr-only">{t(viewLabels[view])}</h1>; }
