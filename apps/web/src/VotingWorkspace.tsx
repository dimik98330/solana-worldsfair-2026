import { ArrowRight, CalendarDays, FileText, ReceiptText, Vote } from 'lucide-react';
import { Address, Badge, Button } from './components';
import { useDisplayPreferences } from './display-preferences';
import { add, units } from './format';
import { dateParts, timeZoneLabel } from './time-zone';
import type { ActionRequest, ChainState, Proposal } from './types';
import { useUiLanguage } from './ui-language';
import { remainingVotingWeight, votingAccountStatus } from './voting-model';
import './voting-workspace.css';

export interface VotingWorkspaceProps {
  state: ChainState;
  activeWallet?: string;
  canAct: boolean;
  disabledReason: string;
  onAction: (request: ActionRequest) => void;
  onReceipts: () => void;
  onCreateProposal?: () => void;
}

export function VotingWorkspace({ state, activeWallet, canAct, disabledReason, onAction, onReceipts, onCreateProposal }: VotingWorkspaceProps) {
  const { language } = useUiLanguage();
  const { timeZone } = useDisplayPreferences();
  const ru = language === 'ru';
  const isIssuer = Boolean(activeWallet && state.instrument?.issuer === activeWallet);
  const canCreate = isIssuer && state.instrument?.status === 'active' && Boolean(onCreateProposal);

  return <div className="voting-workspace">
    <div className="voting-workspace-toolbar">
      <p>{ru ? 'Вес голоса фиксируется количеством облигаций на дату записи прав.' : 'Voting weight is the bond quantity on the recorded rights date.'}</p>
      {canCreate ? <Button variant="primary" onClick={onCreateProposal} disabled={!canAct}><Vote size={18} aria-hidden="true" />{ru ? 'Создать предложение' : 'Create proposal'}</Button> : null}
    </div>
    {state.proposals.length > 0 ? <div className="voting-proposals">
      {state.proposals.map(proposal => <ProposalRecord key={proposal.id} proposal={proposal} activeWallet={activeWallet} canAct={canAct} disabledReason={disabledReason} language={language} timeZone={timeZone} onAction={onAction} onReceipts={onReceipts} />)}
    </div> : <section className="voting-empty">
      <Vote size={28} aria-hidden="true" />
      <div><h2>{ru ? 'Голосований пока нет' : 'No proposals yet'}</h2><p>{ru ? 'Здесь появятся предложения эмитента и зафиксированные голоса держателей.' : 'Issuer proposals and recorded holder ballots will appear here.'}</p></div>
    </section>}
    {canCreate && !canAct && disabledReason ? <p className="voting-unavailable" role="status">{disabledReason}</p> : null}
  </div>;
}

function ProposalRecord({ proposal, activeWallet, canAct, disabledReason, language, timeZone, onAction, onReceipts }: {
  proposal: Proposal;
  activeWallet?: string;
  canAct: boolean;
  disabledReason: string;
  language: 'en' | 'ru';
  timeZone: string;
  onAction: (request: ActionRequest) => void;
  onReceipts: () => void;
}) {
  const ru = language === 'ru';
  const eligible = proposal.eligibleWeights.find(item => item.wallet === activeWallet);
  const accountStatus = votingAccountStatus(proposal, activeWallet);
  const hasRights = accountStatus === 'eligible';
  const voted = Boolean(activeWallet && proposal.votedWallets.includes(activeWallet));
  const closed = proposal.status === 'closed';
  const eligibleTotal = add(proposal.eligibleWeights.map(item => item.units));
  const remainingWeight = remainingVotingWeight(proposal);
  const uniqueVoters = new Set(proposal.votedWallets).size;
  const deadline = dateParts(proposal.deadlineAt, timeZone, language);
  const accountMessage = !activeWallet
    ? (ru ? 'Для голосования выберите аккаунт подписи в меню аккаунта.' : 'Choose a signing account in the account menu to vote.')
    : voted
      ? (ru ? 'Ваш голос учтён. Изменить его нельзя.' : 'Your ballot is recorded and cannot be replaced.')
      : accountStatus === 'unknown'
        ? (ru ? 'Вес этого аккаунта недоступен. Обновите данные выпуска.' : 'This account’s voting weight is unavailable. Refresh the issue data.')
        : !hasRights
          ? (ru ? 'У этого аккаунта нет права голоса на дату фиксации.' : 'This account has no voting rights on the record date.')
          : (ru ? 'Один голос с зафиксированным весом. После подписи изменить выбор нельзя.' : 'One ballot with your recorded weight. The choice cannot be changed after signing.');
  function cast(choice: 'yes' | 'no') {
    if (!canAct || !hasRights || voted || closed) return;
    onAction({
      action: 'cast_vote',
      params: { proposalId: proposal.id, choice },
      title: ru ? `Проверить голос ${choice === 'yes' ? 'за' : 'против'}` : `Review vote ${choice === 'yes' ? 'for' : 'against'}`,
      explanation: ru ? `${proposal.title}. Зафиксированный вес: ${units(eligible?.units)} облигаций. Изменить поданный голос нельзя.` : `${proposal.title}. Your recorded voting weight is ${units(eligible?.units)} bonds. A ballot cannot be replaced.`,
    });
  }

  return <section className={`voting-record${closed ? ' is-closed' : ''}`}>
    <div className="voting-record-heading">
      <div><h2>{proposal.title}</h2><p><FileText size={15} aria-hidden="true" />{ru ? 'Предложение' : 'Proposal'} <span className="number">{units(proposal.id)}</span></p></div>
      <Badge tone={closed ? 'neutral' : 'blue'}>{closed ? (ru ? 'Завершено' : 'Closed') : (ru ? 'Приём голосов' : 'Voting open')}</Badge>
    </div>
    <div className="voting-record-layout">
      <div className="voting-result-main">
        <table className="voting-result-table">
          <caption>{closed ? (ru ? 'Результат голосования' : 'Recorded result') : (ru ? 'Зафиксированные голоса' : 'Recorded ballots')}</caption>
          <thead><tr><th scope="col">{ru ? 'Выбор' : 'Choice'}</th><th scope="col">{ru ? 'Вес в облигациях' : 'Weight in bonds'}</th></tr></thead>
          <tbody>
            <tr><th scope="row">{ru ? 'За' : 'For'}</th><td className="number">{units(proposal.yesWeight)}</td></tr>
            <tr><th scope="row">{ru ? 'Против' : 'Against'}</th><td className="number">{units(proposal.noWeight)}</td></tr>
            <tr className="voting-not-cast"><th scope="row">{ru ? 'Не проголосовали' : 'Not cast'}</th><td className="number">{units(remainingWeight)}</td></tr>
          </tbody>
        </table>
        <dl className="voting-result-summary"><div><dt>{ru ? 'Всего прав голоса' : 'Eligible weight'}</dt><dd className="number">{units(eligibleTotal)}</dd></div><div><dt>{ru ? 'Аккаунтов проголосовало' : 'Accounts that voted'}</dt><dd className="number">{units(uniqueVoters)}</dd></div></dl>
        <div className="voting-record-footer"><Button variant="ghost" onClick={onReceipts}><ReceiptText size={18} aria-hidden="true" />{ru ? 'Подтверждения голосов' : 'Ballot receipts'}<ArrowRight size={16} aria-hidden="true" /></Button></div>
      </div>
      <aside className="voting-record-inspector" aria-label={ru ? 'Данные и действие голосования' : 'Vote details and action'}>
        <dl className="voting-deadline"><div><dt><CalendarDays size={17} aria-hidden="true" />{ru ? 'Приём голосов до' : 'Ballot deadline'}</dt><dd><time dateTime={proposal.deadlineAt} title={proposal.deadlineAt}><span>{deadline.date}</span><span className="voting-clock">{deadline.time}</span></time><small>{timeZoneLabel(timeZone, language)}</small></dd></div></dl>
        {!closed ? <section className="voting-ballot-controls"><h3><Vote size={18} aria-hidden="true" />{ru ? 'Ваш голос' : 'Your ballot'}</h3>{activeWallet ? <dl className="voting-account-weight"><div><dt>{ru ? 'Зафиксированный вес' : 'Recorded weight'}</dt><dd><strong className="number">{accountStatus === 'unknown' ? units(undefined) : eligible ? units(eligible.units) : '0'}</strong><span>{ru ? 'облигаций' : 'bonds'}</span></dd></div></dl> : null}<p>{accountMessage}</p>{hasRights && !voted ? <><div className="voting-ballot-buttons"><Button disabled={!canAct} onClick={() => cast('no')}>{ru ? 'Против' : 'Against'}</Button><Button variant="primary" disabled={!canAct} onClick={() => cast('yes')}>{ru ? 'За' : 'Vote for'}<Vote size={17} aria-hidden="true" /></Button></div>{!canAct && disabledReason ? <p className="voting-unavailable" role="status">{disabledReason}</p> : null}</> : null}</section> : null}
        <details className="voting-technical-details"><summary>{ru ? 'Запись прав голоса' : 'Voting rights record'}</summary><Address value={proposal.snapshotAddress} /><p>{ru ? 'Права сохранены отдельно от текущего портфеля.' : 'Rights are recorded separately from current holdings.'}</p></details>
      </aside>
    </div>
  </section>;
}
