import { useId, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { ArrowRight, Layers3, LockKeyhole, UserPlus } from 'lucide-react';
import { Button, Overlay, Panel } from './components';
import { units } from './format';
import { canRegisterPagedHolder, nextPagedOperations, pagedRegistrationError, pagedRegistrationRequest, type PagedRegistrationError } from './paged-actions';
import type { ActionRequest, ChainState, ServicingActionV2 } from './types';
import { useUiLanguage } from './ui-language';

export interface PagedOperationsProps {
  state: ChainState;
  activeWallet?: string;
  usable: boolean;
  onQueue: (request: ActionRequest) => void | Promise<void>;
}

// Uses the existing global action-form controls; issuer/calendar chunks remain lazy.
function TextField({ id, label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string; error?: string }) {
  return <div>
    <label htmlFor={id}>{label}<input {...props} id={id} name={id} type="text" autoComplete="off" spellCheck={false} aria-invalid={Boolean(error) || undefined} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} /></label>
    {hint && <p id={`${id}-hint`} className="issuer-field-hint">{hint}</p>}
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
  </div>;
}

export function PagedOperations({ state, activeWallet, usable, onQueue }: PagedOperationsProps) {
  const { language } = useUiLanguage();
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const formId = useId(), formRef = useRef<HTMLFormElement>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [holderWallet, setHolderWallet] = useState(''), [label, setLabel] = useState('');
  const [problem, setProblem] = useState<PagedRegistrationError | null>(null);
  const issue = state.instrument, servicing = state.servicing;
  if (issue?.version !== 2 || servicing?.schemaVersion !== 2 || servicing.instrumentAddress !== issue.address) return null;

  const operations = nextPagedOperations(state, activeWallet, usable);
  const canRegister = canRegisterPagedHolder(state, activeWallet, usable);
  const capture = servicing.capture;
  const validCaptureCounts = capture && [capture.capturedPages, capture.pageCount, capture.holderCount].every(n => Number.isSafeInteger(n) && n >= 0) && capture.capturedPages <= capture.pageCount;
  const stageNames: Record<string, [string, string]> = {
    draft: ['Draft', 'Черновик'], active: ['Active', 'Активен'], 'maturity-due': ['Maturity due', 'Наступило погашение'],
    redeeming: ['Redemption open', 'Погашение открыто'], settled: ['Settled', 'Выплаты завершены'],
    'principal-redeemed-coupons-outstanding': ['Principal redeemed · coupons outstanding', 'Номинал погашен · остались купоны'],
  };
  const errorText: Record<PagedRegistrationError, string> = {
    unavailable: tr('Registration is unavailable. Close this form and refresh the issue before reviewing again.', 'Регистрация недоступна. Закройте форму и обновите выпуск перед новой проверкой.'),
    'invalid-address': tr('Enter a complete, valid Solana public address.', 'Введите полный действительный публичный адрес Solana.'),
    'already-registered': tr('This wallet is already registered for this issue.', 'Этот кошелёк уже зарегистрирован в выпуске.'),
    'invalid-label': tr('Use a single-line label of at most 64 UTF-8 bytes.', 'Укажите название в одну строку, не более 64 байт UTF-8.'),
  };
  function operationLabel(item: ServicingActionV2): string {
    if (item.action === 'seal_issue_v2') return tr('Activate issue', 'Активировать выпуск');
    if (item.action === 'begin_coupon_v2') return tr(`Open coupon snapshot · ID ${item.request!.params.couponId}`, `Открыть фиксацию купона · ID ${item.request!.params.couponId}`);
    if (item.action === 'begin_redemption_v2') return tr('Open maturity snapshot', 'Открыть фиксацию погашения');
    if (item.action === 'finalize_action_v2') return tr('Finalize snapshot', 'Завершить фиксацию');
    const pageIndex = item.request?.params.pageIndex;
    return /^\d+$/.test(pageIndex || '') ? tr(`Capture page ${BigInt(pageIndex!) + 1n}`, `Зафиксировать страницу ${BigInt(pageIndex!) + 1n}`) : tr('Capture next page', 'Зафиксировать следующую страницу');
  }
  function queueStep(item: ServicingActionV2) {
    // Eligibility is re-read from current props; normal App review/simulation remains required.
    const ready = nextPagedOperations(state, activeWallet, usable).find(next => next === item);
    if (!ready?.request) return;
    const request = ready.request;
    void onQueue({
      action: request.action, params: { ...request.params, bondAddress: request.bondAddress }, title: operationLabel(ready),
      explanation: ready.action === 'finalize_action_v2'
        ? tr('Finalize the captured holder pages. This transaction creates the snapshot rights.', 'Завершить фиксацию страниц держателей. Эта операция создаёт права по снимку.')
        : ready.action === 'seal_issue_v2'
          ? tr('Activate the fully reserved issue with its complete coupon schedule.', 'Активировать полностью обеспеченный выпуск с полным расписанием купонов.')
          : ready.action === 'begin_coupon_v2' || ready.action === 'begin_redemption_v2'
            ? tr('Open the selected paged snapshot. Rights are created only after every page is captured and the snapshot is finalized.', 'Открыть выбранный постраничный снимок. Права появятся после фиксации всех страниц и завершения снимка.')
          : tr('Capture only the next holder page. Rights remain unavailable until all pages are captured and the snapshot is finalized.', 'Зафиксировать только следующую страницу держателей. Права появятся после фиксации всех страниц и завершения снимка.'),
    });
  }
  function register(event: FormEvent) {
    event.preventDefault();
    const error = pagedRegistrationError(state, activeWallet, usable, holderWallet, label);
    setProblem(error);
    if (error) {
      formRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(`${formId}-${error === 'invalid-label' ? 'label' : 'wallet'}`)}`)?.focus();
      return;
    }
    const request = pagedRegistrationRequest(state, activeWallet, usable, holderWallet, label);
    if (!request) return;
    setOpenFor(null);
    void onQueue({ ...request, title: tr('Register holder', 'Зарегистрировать держателя'), explanation: tr(request.explanation, 'Зарегистрировать получателя с нулевым балансом. Новые облигации и права по прежним снимкам не создаются.') });
  }
  const unavailable = !state.connected ? tr('Connection unavailable. Refresh chain state to continue.', 'Нет связи. Обновите данные сети, чтобы продолжить.')
    : state.readOnlySnapshot ? tr('Saved snapshot · operations unavailable.', 'Архивный снимок · операции недоступны.')
      : !activeWallet ? tr('Choose a signing account to review the next operation.', 'Выберите аккаунт подписи для проверки следующей операции.')
        : !usable ? tr('Resolve the current operation before preparing another.', 'Завершите проверку текущей операции перед следующей.')
          : tr('No snapshot page is ready for review.', 'Нет страницы снимка, готовой к проверке.');
  return <>
    <Panel title={tr('Paged operations', 'Постраничные операции')} action={canRegister && <Button onClick={() => { setProblem(null); setOpenFor(issue.address); }}><UserPlus size={18} aria-hidden="true" />{tr('Add holder', 'Добавить держателя')}</Button>}>
      <div className="dialog-body">
        <dl className="review-facts">
          <div><dt>{tr('Stage', 'Этап')}</dt><dd>{stageNames[servicing.status] ? tr(...stageNames[servicing.status]) : tr('Unavailable', 'Недоступно')}</dd></div>
          <div><dt>{tr('Registered holders', 'Держателей в реестре')}</dt><dd className="number">{units(issue.holderCount)}</dd></div>
          <div><dt>{tr('Coupon terms appended', 'Добавлено условий купонов')}</dt><dd className="number">{units(issue.scheduleAppended)} / {units(issue.couponCount)}</dd></div>
          {capture && <div><dt>{tr('Snapshot', 'Снимок')}</dt><dd>{capture.actionKind === '1' ? tr('Coupon', 'Купон') : capture.actionKind === '2' ? tr('Principal', 'Номинал') : capture.actionKind === '3' ? tr('Vote', 'Голосование') : tr('Unavailable', 'Недоступно')}{capture.actionId !== undefined && <> · ID <span className="number">{capture.actionId}</span></>}</dd></div>}
          {validCaptureCounts && <div><dt>{tr('Pages captured', 'Зафиксировано страниц')}</dt><dd className="number">{units(capture.capturedPages)} / {units(capture.pageCount)}</dd></div>}
        </dl>
        {capture && <p role="status">{capture.finalized ? tr('Snapshot finalized.', 'Фиксация снимка завершена.') : tr('Capture in progress. Rights are created after finalization.', 'Фиксация продолжается. Права появятся после её завершения.')}</p>}
        {operations.length ? <div className="dialog-actions">{operations.map(item => <Button key={item.id} variant="primary" onClick={() => queueStep(item)}>{item.action === 'seal_issue_v2' ? <LockKeyhole size={18} aria-hidden="true" /> : <Layers3 size={18} aria-hidden="true" />}{operationLabel(item)}<ArrowRight size={16} aria-hidden="true" /></Button>)}</div> : <p>{unavailable}</p>}
      </div>
    </Panel>
    <Overlay open={openFor === issue.address} onClose={() => setOpenFor(null)} title={tr('Register holder', 'Регистрация держателя')}>
      <form ref={formRef} className="dialog-body action-form" noValidate onSubmit={register}>
        <p>{tr('Register a zero-balance receiver. Existing coupon and vote snapshots are unchanged.', 'Зарегистрируйте получателя с нулевым балансом. Прежние снимки купонов и голосований сохраняются.')}</p>
        <TextField id={`${formId}-wallet`} label={tr('Wallet public address (required)', 'Публичный адрес кошелька (обязательно)')} value={holderWallet} required onChange={event => { setHolderWallet(event.target.value); setProblem(null); }} error={problem === 'invalid-address' || problem === 'already-registered' ? errorText[problem] : undefined} />
        <TextField id={`${formId}-label`} label={tr('Holder label (optional)', 'Название держателя (необязательно)')} value={label} onChange={event => { setLabel(event.target.value); setProblem(null); }} error={problem === 'invalid-label' ? errorText[problem] : undefined} />
        {(problem === 'unavailable' || !canRegister) && <p className="field-error" role="alert">{errorText.unavailable}</p>}
        <div className="dialog-actions"><Button onClick={() => setOpenFor(null)}>{tr('Cancel', 'Отмена')}</Button><Button type="submit" variant="primary" disabled={!canRegister}>{tr('Review registration', 'Проверить регистрацию')}<ArrowRight size={16} aria-hidden="true" /></Button></div>
      </form>
    </Overlay>
  </>;
}
