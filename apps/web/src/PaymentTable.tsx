import { useId, useState } from 'react';
import { ArrowRight, FileSearch, Search, SlidersHorizontal, UserRound } from 'lucide-react';
import { Address, Badge, Button, Empty, Money } from './components';
import { shortAddress, units } from './format';
import { useUiLanguage } from './ui-language';
import { WorkspaceLink } from './WorkspaceLink';
import type { ChainState, Entitlement } from './types';
import './payments-workspace.css';

interface PaymentTableProps {
  rows: Entitlement[];
  holders: ChainState['holders'];
  activeWallet?: string;
  onDetails?: (row: Entitlement) => void;
  onHolder?: (wallet: string) => void;
}

export function PaymentTable({ rows, holders, activeWallet, onDetails, onHolder }: PaymentTableProps) {
  const { language } = useUiLanguage();
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const searchId = useId();
  const statusId = useId();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const holderByWallet = new Map(holders.map(holder => [holder.wallet, holder]));
  const needle = query.trim().toLocaleLowerCase(language);
  const visibleRows = rows.filter(row => {
    const name = holderByWallet.get(row.wallet)?.label || '';
    return (status === 'all' || (status === 'paid' ? row.claimed : !row.claimed))
      && (!needle || `${name} ${row.wallet}`.toLocaleLowerCase(language).includes(needle));
  });
  const hasActions = Boolean(onDetails || onHolder);

  return <div className="payment-register">
    {rows.length > 0 ? <div className="payment-register-toolbar">
      <span className="payment-register-count" role="status">{units(visibleRows.length)} {tr('of', 'из')} {units(rows.length)} {tr('holders', 'держателей')}</span>
      <div className="payment-register-controls">
        <div className="payment-search"><label className="sr-only" htmlFor={searchId}>{tr('Search holders by name or wallet', 'Поиск держателя по имени или адресу')}</label><Search size={18} aria-hidden="true" /><input id={searchId} name="holder-search" type="search" autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} placeholder={tr('Search…', 'Поиск…')} /></div>
        <div className="payment-status-filter"><label className="sr-only" htmlFor={statusId}>{tr('Payment status', 'Статус выплаты')}</label><SlidersHorizontal size={16} aria-hidden="true" /><select id={statusId} name="payment-status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">{tr('All statuses', 'Все статусы')}</option><option value="paid">{tr('Paid', 'Выплачено')}</option><option value="unclaimed">{tr('Unclaimed', 'Не получено')}</option></select></div>
      </div>
    </div> : null}
    <div className="table-scroll entitlement-table">
      <table><caption className="sr-only">{tr('Recorded rights and payments by holder', 'Зафиксированные права и выплаты держателей')}</caption><thead><tr><th scope="col">{tr('Holder', 'Держатель')}</th><th scope="col" className="numeric">{tr('Recorded bonds', 'На дату фиксации')}</th><th scope="col" className="numeric">{tr('Payment', 'Выплата')}</th><th scope="col">{tr('Status', 'Статус')}</th>{hasActions ? <th scope="col"><span className="sr-only">{tr('Actions', 'Действия')}</span></th> : null}</tr></thead><tbody>{visibleRows.map(row => {
        const name = holderByWallet.get(row.wallet)?.label || shortAddress(row.wallet);
        return <tr key={row.wallet} className={row.wallet === activeWallet ? 'payment-active-holder' : undefined}>
          <td><div className="holder-cell"><span className="payment-holder-icon"><UserRound size={20} aria-hidden="true" /></span><div><div className="payment-holder-name">{onHolder ? <WorkspaceLink view="portfolio" holder={row.wallet} className="holder-name-link" onNavigate={() => onHolder(row.wallet)} title={tr('Open holder portfolio', 'Открыть портфель держателя')}>{name}</WorkspaceLink> : <strong>{name}</strong>}{row.wallet === activeWallet ? <span className="you-label">{tr('You', 'Вы')}</span> : null}</div><Address value={row.wallet} /></div></div></td>
          <td className="numeric number" data-label={tr('Recorded bonds', 'На дату фиксации')}><span className="payment-cell-figure">{units(row.units)}</span></td>
          <td className="numeric" data-label={tr('Payment', 'Выплата')}><span className="payment-cell-figure"><Money value={row.amountMinor} /></span></td>
          <td><Badge tone={row.claimed ? 'success' : 'neutral'}>{row.claimed ? tr('Paid', 'Выплачено') : tr('Unclaimed', 'Не получено')}</Badge></td>
          {hasActions ? <td className="table-row-action">{onDetails ? <Button variant="ghost" onClick={() => onDetails(row)} aria-label={`${tr('Payment details for', 'Детали выплаты:')} ${name}`}><FileSearch size={18} aria-hidden="true" />{tr('Details', 'Детали')}</Button> : <Button variant="ghost" onClick={() => onHolder?.(row.wallet)}>{tr('Portfolio', 'Портфель')}<ArrowRight size={18} aria-hidden="true" /></Button>}</td> : null}
        </tr>;
      })}</tbody></table>
      {rows.length === 0 ? <Empty title={tr('No recorded allocations', 'Нет зафиксированных начислений')} description={tr('Holder rights appear after the record date is captured.', 'Права держателей появятся после фиксации реестра.')} /> : visibleRows.length === 0 ? <Empty title={tr('No matching holders', 'Держатели не найдены')} description={tr('Change the name, wallet address or payment status.', 'Измените имя, адрес или статус выплаты.')} action={<Button onClick={() => { setQuery(''); setStatus('all'); }}>{tr('Clear filters', 'Сбросить фильтры')}</Button>} /> : null}
    </div>
  </div>;
}
