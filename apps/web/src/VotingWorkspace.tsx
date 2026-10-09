import { useState } from 'react';
import { ArrowRight, CalendarClock, FileSearch, LockKeyhole, Minus, ReceiptText, RefreshCw, ThumbsDown, ThumbsUp, UserRound, Vote } from 'lucide-react';
import { Address, Button, Overlay } from './components';
import { useDisplayPreferences } from './display-preferences';
import { add, units } from './format';
import { dateParts, timeZoneLabel } from './time-zone';
import type { ActionRequest, ChainState, Proposal } from './types';
import { useUiLanguage } from './ui-language';
import { remainingVotingWeight, votingAccountStatus } from './voting-model';
import './voting-page.css';

export interface VotingWorkspaceProps {
  state: ChainState;
  activeWallet?: string;
  canAct: boolean;
  disabledReason: string;
  onAction: (request: ActionRequest) => void;
  onReceipts: () => void;
  onCreateProposal?: () => void;
  onConnect?: () => void;
  onRefresh?: () => void;
}

export function VotingWorkspace({ state, activeWallet, canAct, disabledReason, onAction, onReceipts, onCreateProposal, onConnect, onRefresh }: VotingWorkspaceProps) {
  const { language } = useUiLanguage();
  const { timeZone } = useDisplayPreferences();
  const ru = language === 'ru';
  const isIssuer = Boolean(activeWallet && state.instrument?.issuer === activeWallet);
  const canCreate = isIssuer && state.instrument?.status === 'active' && Boolean(onCreateProposal);

  return <div className="vote-page">
    {canCreate ? <div className="vote-page-tools">
      <Button variant="primary" onClick={onCreateProposal} disabled={!canAct || Boolean(state.readOnlySnapshot)}><Vote size={22} aria-hidden="true" />{ru ? 'Создать предложение' : 'Create proposal'}</Button>
      {!canAct || state.readOnlySnapshot ? <p role="status">{state.readOnlySnapshot ? (ru ? 'Архивный снимок доступен только для просмотра.' : 'The saved snapshot is read-only.') : disabledReason}</p> : null}
    </div> : null}
    {state.proposals.length > 0 ? <div className="vote-event-list">
      {state.proposals.map(proposal => <ProposalRecord key={proposal.id} proposal={proposal} activeWallet={activeWallet} canAct={canAct} disabledReason={disabledReason} language={language} timeZone={timeZone} network={state.network} snapshot={state.readOnlySnapshot} connected={state.connected} onAction={onAction} onReceipts={onReceipts} onConnect={onConnect} onRefresh={onRefresh} />)}
    </div> : <section className="vote-empty">
      <Vote size={28} aria-hidden="true" />
      <div><h2>{ru ? 'Предложений пока нет' : 'No proposals yet'}</h2><p>{ru ? 'Созданные эмитентом предложения появятся здесь вместе с результатами и сроком голосования.' : 'Issuer proposals will appear here with their results and voting deadline.'}</p></div>
    </section>}
  </div>;
}

function VoteWeight({ value }: { value: string | number | bigint | null | undefined }) {
  const { language } = useUiLanguage();
  const formatted = units(value);
  const long = formatted.length > 14;
  const exact = formatted === '--' ? (language === 'ru' ? 'Нет данных о весе' : 'Voting weight unavailable') : String(value);
  return <span className={`vote-weight${long ? ' is-long' : ''}`} title={exact} tabIndex={long ? 0 : undefined} aria-label={exact}><span className="vote-number">{formatted}</span></span>;
}

function ProposalRecord({ proposal, activeWallet, canAct, disabledReason, language, timeZone, network, snapshot, connected, onAction, onReceipts, onConnect, onRefresh }: {
  proposal: Proposal;
  activeWallet?: string;
  canAct: boolean;
  disabledReason: string;
  language: 'en' | 'ru';
  timeZone: string;
  network: ChainState['network'];
  snapshot: ChainState['readOnlySnapshot'];
  connected: boolean;
  onAction: (request: ActionRequest) => void;
  onReceipts: () => void;
  onConnect?: () => void;
  onRefresh?: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const archivedAt = snapshot ? dateParts(snapshot.capturedAt, timeZone, language) : undefined;
  const unavailable = Boolean(snapshot) || !connected || !canAct;
  const unavailableMessage = snapshot
    ? (ru ? 'Это архивный снимок. Отправить голос из архива нельзя.' : 'This is a saved snapshot. Voting is unavailable in the archive.')
    : !connected
      ? (ru ? 'Связь с сетью недоступна. Обновите данные, чтобы проверить право голоса.' : 'The network is unavailable. Refresh the data to check voting rights.')
      : disabledReason || (ru ? 'Голосование сейчас недоступно. Обновите данные и проверьте текущую операцию.' : 'Voting is unavailable. Refresh the data and check the current operation.');

  function cast(choice: 'yes' | 'no') {
    if (!canAct || !hasRights || voted || closed || snapshot || !connected) return;
    onAction({
      action: 'cast_vote',
      params: { proposalId: proposal.id, choice },
      title: ru ? `Проверить голос ${choice === 'yes' ? 'за' : 'против'}` : `Review vote ${choice === 'yes' ? 'for' : 'against'}`,
      explanation: ru ? `${proposal.title}. Зафиксированный вес: ${units(eligible?.units)} облигаций. Изменить поданный голос нельзя.` : `${proposal.title}. Your recorded voting weight is ${units(eligible?.units)} bonds. A ballot cannot be replaced.`,
    });
  }

  const receiptButton = <Button variant={closed || voted ? 'primary' : 'secondary'} onClick={onReceipts}><ReceiptText size={22} aria-hidden="true" />{ru ? 'Открыть историю голосов' : 'View vote history'}<ArrowRight size={20} aria-hidden="true" /></Button>;
  const connectButton = onConnect ? <Button variant="primary" onClick={onConnect}><UserRound size={22} aria-hidden="true" />{activeWallet ? (ru ? 'Выбрать другой аккаунт' : 'Choose another account') : (ru ? 'Выбрать аккаунт' : 'Choose account')}</Button> : null;
  const refreshButton = onRefresh && !snapshot ? <Button onClick={onRefresh}><RefreshCw size={20} aria-hidden="true" />{ru ? 'Обновить данные' : 'Refresh data'}</Button> : null;

  return <section className={`vote-event${closed ? ' is-closed' : ''}`}>
    <header className="vote-event-heading">
      <div className="vote-event-identity">
        <h2 translate="no">{proposal.title}</h2>
        <div className="vote-event-meta"><span>{ru ? 'Предложение' : 'Proposal'} <span className="vote-number">{units(proposal.id)}</span></span><span className={`vote-status ${closed ? 'closed' : 'open'}`}>{closed ? <LockKeyhole size={20} aria-hidden="true" /> : <Vote size={20} aria-hidden="true" />}{closed ? (ru ? 'Голосование завершено' : 'Voting closed') : (ru ? 'Приём голосов открыт' : 'Voting open')}</span></div>
      </div>
      <Button className="vote-details-trigger" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog"><FileSearch size={22} aria-hidden="true" />{ru ? 'Проверить данные' : 'Inspect details'}</Button>
    </header>

    <div className="vote-event-body">
      <div className="vote-tallies">
        <table className="vote-results-table">
          <caption><span>{closed ? (ru ? 'Результаты голосования' : 'Voting results') : (ru ? 'Текущие результаты' : 'Current results')}</span><span>{ru ? 'Вес в облигациях' : 'Weight in bonds'}</span></caption>
          <tbody>
            <tr><th scope="row"><span><ThumbsUp size={22} aria-hidden="true" />{ru ? 'За' : 'For'}</span></th><td className="vote-number"><VoteWeight value={proposal.yesWeight} /></td></tr>
            <tr><th scope="row"><span><ThumbsDown size={22} aria-hidden="true" />{ru ? 'Против' : 'Against'}</span></th><td className="vote-number"><VoteWeight value={proposal.noWeight} /></td></tr>
            <tr className="vote-remaining"><th scope="row"><span><Minus size={22} aria-hidden="true" />{ru ? 'Не подано' : 'Not cast'}</span></th><td className="vote-number"><VoteWeight value={remainingWeight} /></td></tr>
          </tbody>
        </table>
        <dl className="vote-participation">
          <div><dt>{ru ? 'Всего прав, облигаций' : 'Total eligible bonds'}</dt><dd className="vote-number"><VoteWeight value={eligibleTotal} /></dd></div>
          <div><dt>{ru ? 'Аккаунтов проголосовало' : 'Accounts that voted'}</dt><dd className="vote-number">{units(uniqueVoters)}</dd></div>
        </dl>
      </div>

      <div className="vote-event-context">
        <h3><CalendarClock size={22} aria-hidden="true" />{closed ? (ru ? 'Голоса принимались до' : 'Voting ended at') : (ru ? 'Голоса принимаются до' : 'Voting ends at')}</h3>
        <time dateTime={proposal.deadlineAt} title={proposal.deadlineAt}><span>{deadline.date}</span><span className="vote-clock">{deadline.time}</span></time>
        <p className="vote-time-zone">{timeZoneLabel(timeZone, language)}</p>
        <div className="vote-rights-note"><h3>{ru ? 'Вес голоса' : 'Voting weight'}</h3><p>{ru ? 'Количество облигаций из записи прав. Перевод или погашение облигаций не меняет зафиксированный вес.' : 'Bond quantity in the rights record. Transfers or redemption do not change the recorded weight.'}</p></div>
      </div>

      <aside className="vote-ballot" aria-label={ru ? 'Действие голосования' : 'Ballot action'}>
        {closed ? <><h3><LockKeyhole size={22} aria-hidden="true" />{ru ? 'Приём голосов завершён' : 'Ballot closed'}</h3><p>{ru ? 'Новые голоса не принимаются. Поданные голоса сохранены в записях операций.' : 'New ballots are no longer accepted. Recorded ballots are available in the operation receipts.'}</p>{receiptButton}</>
          : snapshot || !connected ? <><h3>{snapshot ? (ru ? 'Архивное голосование' : 'Archived proposal') : (ru ? 'Данные сети недоступны' : 'Network data unavailable')}</h3><p role="status">{unavailableMessage}</p>{snapshot ? receiptButton : refreshButton}</>
          : !activeWallet ? <><h3><UserRound size={22} aria-hidden="true" />{ru ? 'Выберите аккаунт подписи' : 'Choose a signing account'}</h3><p>{ru ? 'Право голоса проверяется для аккаунта подписи, отдельно от просматриваемого портфеля.' : 'Voting rights are checked for the signing account, separately from the portfolio you are viewing.'}</p>{connectButton}</>
          : voted ? <><h3><Vote size={22} aria-hidden="true" />{ru ? 'Ваш голос уже учтён' : 'Your ballot is recorded'}</h3><p>{ru ? 'Повторно проголосовать или изменить выбор нельзя.' : 'You cannot vote again or replace your choice.'}</p>{receiptButton}</>
          : accountStatus === 'unknown' ? <><h3>{ru ? 'Вес голоса недоступен' : 'Voting weight unavailable'}</h3><p role="status">{ru ? 'Не удалось определить вес этого аккаунта. Обновите данные перед голосованием.' : 'This account’s voting weight could not be determined. Refresh the data before voting.'}</p>{refreshButton}</>
          : !hasRights ? <><h3>{ru ? 'Нет права голоса' : 'No voting rights'}</h3><p>{ru ? 'У аккаунта подписи нет положительного веса в записи прав этого предложения.' : 'The signing account has no positive weight in this proposal’s rights record.'}</p>{connectButton}</>
          : <><h3><Vote size={22} aria-hidden="true" />{ru ? 'Ваш голос' : 'Your ballot'}</h3><dl className="vote-your-weight"><div><dt>{ru ? 'Зафиксированный вес' : 'Recorded weight'}</dt><dd><VoteWeight value={eligible?.units} /><span>{ru ? 'облигаций' : 'bonds'}</span></dd></div></dl><p>{ru ? 'После подписи изменить выбор нельзя.' : 'Your choice cannot be changed after signing.'}</p><div className="vote-choice-buttons"><Button variant="primary" disabled={unavailable} onClick={() => cast('yes')}><ThumbsUp size={22} aria-hidden="true" />{ru ? 'Проверить голос за' : 'Review vote for'}</Button><Button disabled={unavailable} onClick={() => cast('no')}><ThumbsDown size={22} aria-hidden="true" />{ru ? 'Проверить голос против' : 'Review vote against'}</Button></div>{unavailable ? <><p className="vote-blocked" role="status">{unavailableMessage}</p>{refreshButton}</> : null}</>}
      </aside>
    </div>

    <Overlay open={detailsOpen} onClose={() => setDetailsOpen(false)} title={ru ? 'Данные голосования' : 'Voting details'} className="vote-inspection-dialog">
      <div className="vote-inspection">
        <h3 translate="no">{proposal.title}</h3>
        <dl>
          <div><dt>{ru ? 'Предложение' : 'Proposal'}</dt><dd className="vote-number">{units(proposal.id)}</dd></div>
          <div><dt>{ru ? 'Сеть' : 'Network'}</dt><dd>{network === 'localnet' ? 'Localnet' : 'Devnet'}{snapshot ? (ru ? ' · архивный снимок' : ' · saved snapshot') : (ru ? ' · тестовая сеть' : ' · test network')}</dd></div>
          <div><dt>{ru ? 'Срок голосования' : 'Voting deadline'}</dt><dd><time dateTime={proposal.deadlineAt}><span>{deadline.date}</span><span className="vote-clock">{deadline.time}</span></time><span className="vote-time-zone">{timeZoneLabel(timeZone, language)}</span><code>{proposal.deadlineAt}</code></dd></div>
          {snapshot && archivedAt ? <div><dt>{ru ? 'Снимок сохранён' : 'Snapshot captured'}</dt><dd><time dateTime={snapshot.capturedAt}><span>{archivedAt.date}</span><span className="vote-clock">{archivedAt.time}</span></time></dd></div> : null}
          <div><dt>{ru ? 'Адрес записи прав' : 'Voting rights record address'}</dt><dd><Address value={proposal.snapshotAddress} full /></dd></div>
          {activeWallet ? <div><dt>{ru ? 'Аккаунт подписи' : 'Signing account'}</dt><dd><Address value={activeWallet} full /></dd></div> : null}
        </dl>
        <p>{ru ? 'Права сохранены отдельно от текущего портфеля. Каждый аккаунт может подать один голос со своим зафиксированным весом; заменить голос нельзя.' : 'Voting rights are stored separately from current holdings. Each account can submit one ballot with its recorded weight; a ballot cannot be replaced.'}</p>
        {snapshot ? <p role="status">{ru ? 'Архив доступен только для просмотра и не подтверждает текущее состояние сети.' : 'The archive is read-only and does not verify the current network state.'}</p> : null}
        <div className="vote-inspection-actions"><Button onClick={() => setDetailsOpen(false)}>{ru ? 'Закрыть данные' : 'Close details'}</Button></div>
      </div>
    </Overlay>
  </section>;
}
