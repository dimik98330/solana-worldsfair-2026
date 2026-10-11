import { translate } from './i18n';
import { useState } from 'react';
import { ArrowRight, CalendarClock, ChevronDown, ChevronRight, LockKeyhole, Minus, ReceiptText, RefreshCw, ThumbsDown, ThumbsUp, UserRound, Vote } from 'lucide-react';
import { Address, Button, Overlay } from './components';
import { useDisplayPreferences } from './display-preferences';
import { add, integer, units } from './format';
import { dateParts, timeZoneLabel } from './time-zone';
import type { ActionRequest, ChainState, Proposal } from './types';
import { useUiLanguage } from './ui-language';
import { remainingVotingWeight, votingAccountStatus } from './voting-model';
import './portfolio-vote-premium.css';

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

  return <div className="vote-page premium-voting">
    {canCreate ? <div className="vote-page-tools">
      <Button variant="primary" onClick={onCreateProposal} disabled={!canAct || Boolean(state.readOnlySnapshot)}><Vote size={22} aria-hidden="true" />{translate(language, 'Create proposal', 'Создать предложение')}</Button>
      {!canAct || state.readOnlySnapshot ? <p role="status">{state.readOnlySnapshot ? (translate(language, 'The saved snapshot is read-only.', 'Архивный снимок доступен только для просмотра.')) : disabledReason}</p> : null}
    </div> : null}
    {state.proposals.length > 0 ? <div className="vote-event-list">
      {state.proposals.map(proposal => <ProposalRecord key={proposal.id} proposal={proposal} activeWallet={activeWallet} canAct={canAct} disabledReason={disabledReason} language={language} timeZone={timeZone} network={state.network} snapshot={state.readOnlySnapshot} connected={state.connected} onAction={onAction} onReceipts={onReceipts} onConnect={onConnect} onRefresh={onRefresh} />)}
    </div> : <section className="vote-empty">
      <Vote size={28} aria-hidden="true" />
      <div><h2>{translate(language, 'No proposals yet', 'Предложений пока нет')}</h2><p>{translate(language, 'Issuer proposals will appear here with their results and voting deadline.', 'Созданные эмитентом предложения появятся здесь вместе с результатами и сроком голосования.')}</p></div>
    </section>}
  </div>;
}

function VoteWeight({ value }: { value: string | number | bigint | null | undefined }) {
  const { language } = useUiLanguage();
  const formatted = units(value);
  const long = formatted.length > 14;
  const exact = formatted === '--' ? (translate(language, 'Voting weight unavailable', 'Нет данных о весе')) : String(value);
  return <span className={`vote-weight${long ? ' is-long' : ''}`} title={exact} tabIndex={long ? 0 : undefined} aria-label={exact}><span className="vote-number">{formatted}</span></span>;
}

function ProposalRecord({ proposal, activeWallet, canAct, disabledReason, language, timeZone, network, snapshot, connected, onAction, onReceipts, onConnect, onRefresh }: {
  proposal: Proposal;
  activeWallet?: string;
  canAct: boolean;
  disabledReason: string;
  language: 'en' | 'ru' | 'kk';
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
  const capturing = proposal.status === 'capturing';
  const eligibleTotal = add(proposal.eligibleWeights.map(item => item.units));
  const remainingWeight = remainingVotingWeight(proposal);
  const uniqueVoters = new Set(proposal.votedWallets).size;
  const deadline = dateParts(proposal.deadlineAt, timeZone, language);
  const archivedAt = snapshot ? dateParts(snapshot.capturedAt, timeZone, language) : undefined;
  const unavailable = Boolean(snapshot) || !connected || !canAct;
  const unavailableMessage = snapshot
    ? (translate(language, 'This is a saved snapshot. Voting is unavailable in the archive.', 'Это архивный снимок. Отправить голос из архива нельзя.'))
    : !connected
      ? (translate(language, 'The network is unavailable. Refresh the data to check voting rights.', 'Связь с сетью недоступна. Обновите данные, чтобы проверить право голоса.'))
      : disabledReason || (translate(language, 'Voting is unavailable. Refresh the data and check the current operation.', 'Голосование сейчас недоступно. Обновите данные и проверьте текущую операцию.'));

  const totalWeight = integer(eligibleTotal) ?? 0n;
  const pct = (value: string | number | bigint | null | undefined) => { const n = integer(value) ?? 0n; return totalWeight > 0n ? Number(n * 10000n / totalWeight) / 100 : 0; };
  const pctFor = pct(proposal.yesWeight), pctAgainst = pct(proposal.noWeight), pctRest = pct(remainingWeight);

  function cast(choice: 'yes' | 'no') {    if (!canAct || !hasRights || voted || closed || capturing || snapshot || !connected) return;
    onAction({
      action: 'cast_vote',
      params: { proposalId: proposal.id, choice },
      title: translate(language,'Review action','Проверить операцию') + ' · ' + translate(language,choice==='yes'?'For':'Against',choice==='yes'?'За':'Против'),
      explanation: `${proposal.title}. ${translate(language,'Recorded weight','Зафиксированный вес')}: ${units(eligible?.units)} ${translate(language,'bonds','облигаций')}. ${translate(language,'Your choice cannot be changed after signing.','После подписи изменить выбор нельзя.')}`,
    });
  }

  const receiptButton = <Button variant="ghost" onClick={onReceipts}><ReceiptText size={18} aria-hidden="true" />{translate(language, 'Vote history', 'История голосов')}<ArrowRight size={16} aria-hidden="true" /></Button>;
  const connectButton = onConnect ? <Button variant="primary" onClick={onConnect}><UserRound size={22} aria-hidden="true" />{activeWallet ? (translate(language, 'Choose another account', 'Выбрать другой аккаунт')) : (translate(language, 'Choose account', 'Выбрать аккаунт'))}</Button> : null;
  const refreshButton = onRefresh && !snapshot ? <Button onClick={onRefresh}><RefreshCw size={20} aria-hidden="true" />{translate(language, 'Refresh data', 'Обновить данные')}</Button> : null;

  return <section className={`vote-event${closed ? ' is-closed' : ''}`}>
    <header className="vote-event-heading">
      <div className="vote-event-identity">
        <h2 translate="no">{proposal.title}</h2>
        <div className="vote-event-meta"><span>{translate(language, 'Proposal', 'Предложение')} <span className="vote-number">{units(proposal.id)}</span></span><span className={`vote-status ${closed ? 'closed' : 'open'}`}>{closed || capturing ? <LockKeyhole size={20} aria-hidden="true" /> : <Vote size={20} aria-hidden="true" />}{capturing ? (translate(language, 'Capturing voting rights', 'Фиксируются права')) : closed ? (translate(language, 'Voting closed', 'Голосование завершено')) : (translate(language, 'Voting open', 'Приём голосов открыт'))}</span></div>
      </div>
      <Button variant="ghost" className="vote-details-trigger" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog">{translate(language, 'Details', 'Реквизиты')}<ChevronRight size={16} aria-hidden="true" /></Button>
    </header>

    <div className="vote-event-body">
      <div className="vote-outcome">
        <div className="vote-outcome-heading"><h3>{translate(language, 'Results', 'Результаты')}</h3><span>{translate(language, 'Weight in bonds', 'Вес в облигациях')}</span></div>
        <dl className="vote-participation">
          <div><dt>{translate(language, 'Total weight', 'Общий вес')}</dt><dd className="vote-number"><VoteWeight value={eligibleTotal} /></dd></div>
          <div><dt>{translate(language, 'Accounts voted', 'Проголосовало аккаунтов')}</dt><dd className="vote-number">{units(uniqueVoters)}</dd></div>
        </dl>
        <div className="vote-bar" role="img" aria-label={`${translate(language, 'For', 'За')} ${units(proposal.yesWeight)}, ${translate(language, 'against', 'против')} ${units(proposal.noWeight)}, ${translate(language, 'not cast', 'не подано')} ${units(remainingWeight)} ${translate(language, 'of', 'из')} ${units(eligibleTotal)}`}>
          {pctFor > 0 ? <span className="vote-bar-seg for" style={{ width: `${pctFor}%` }} /> : null}
          {pctAgainst > 0 ? <span className="vote-bar-seg against" style={{ width: `${pctAgainst}%` }} /> : null}
          {pctRest > 0 ? <span className="vote-bar-seg rest" style={{ width: `${pctRest}%` }} /> : null}
        </div>
        <ul className="vote-legend">
          <li className="for"><span className="vote-legend-label"><ThumbsUp size={20} aria-hidden="true" />{translate(language, 'For', 'За')}</span><VoteWeight value={proposal.yesWeight} /><small>{Math.round(pctFor)}%</small></li>
          <li className="against"><span className="vote-legend-label"><ThumbsDown size={20} aria-hidden="true" />{translate(language, 'Against', 'Против')}</span><VoteWeight value={proposal.noWeight} /><small>{Math.round(pctAgainst)}%</small></li>
          <li className="rest"><span className="vote-legend-label"><Minus size={20} aria-hidden="true" />{translate(language, 'Not cast', 'Не подано')}</span><VoteWeight value={remainingWeight} /><small>{Math.round(pctRest)}%</small></li>
        </ul>
        <details className="vote-outcome-footer"><summary>{translate(language, 'How votes are counted', 'Как учитываются голоса')}<ChevronDown size={16} aria-hidden="true" /></summary>
          <p className="vote-weight-note">{translate(language, 'Voting weight is the bond quantity in the rights record. Transfers or redemption do not change it.', 'Вес голоса — количество облигаций из записи прав. Перевод или погашение не меняют зафиксированный вес.')}</p>
        </details>
      </div>

      <aside className="vote-ballot" aria-label={translate(language, 'Ballot action', 'Действие голосования')}>
        <div className="vote-deadline"><CalendarClock size={20} aria-hidden="true" /><div><span>{closed ? (translate(language, 'Voting ended at', 'Голоса принимались до')) : (translate(language, 'Voting ends at', 'Голоса принимаются до'))}</span><time dateTime={proposal.deadlineAt} title={proposal.deadlineAt}><span>{deadline.date}</span><span className="vote-clock">{deadline.time}</span></time><small>{timeZoneLabel(timeZone, language)}</small></div></div>
        <div className="vote-ballot-content">
        {capturing ? <><h3><LockKeyhole size={22} aria-hidden="true" />{translate(language, 'Capturing voting rights', 'Фиксируются права')}</h3><p role="status">{translate(language, 'Voting becomes available after every snapshot page is finalized. Continue capture in issue operations.', 'До завершения всех страниц снимка голосование недоступно. Продолжите фиксацию в операциях выпуска.')}</p>{refreshButton}</>
          : closed ? receiptButton
          : snapshot || !connected ? <><h3>{snapshot ? (translate(language, 'Archived proposal', 'Архивное голосование')) : (translate(language, 'Network data unavailable', 'Данные сети недоступны'))}</h3><p role="status">{unavailableMessage}</p>{snapshot ? receiptButton : refreshButton}</>
          : !activeWallet ? <><h3><UserRound size={22} aria-hidden="true" />{translate(language, 'Choose a signing account', 'Выберите аккаунт подписи')}</h3><p>{translate(language, 'Voting rights are checked for the signing account, separately from the portfolio you are viewing.', 'Право голоса проверяется для аккаунта подписи, отдельно от просматриваемого портфеля.')}</p>{connectButton}</>
          : voted ? <><h3><Vote size={22} aria-hidden="true" />{translate(language, 'Your ballot is recorded', 'Ваш голос уже учтён')}</h3><p>{translate(language, 'You cannot vote again or replace your choice.', 'Повторно проголосовать или изменить выбор нельзя.')}</p>{receiptButton}</>
          : accountStatus === 'unknown' ? <><h3>{translate(language, 'Voting weight unavailable', 'Вес голоса недоступен')}</h3><p role="status">{translate(language, 'This account’s voting weight could not be determined. Refresh the data before voting.', 'Не удалось определить вес этого аккаунта. Обновите данные перед голосованием.')}</p>{refreshButton}</>
          : !hasRights ? <><h3>{translate(language, 'No voting rights', 'Нет права голоса')}</h3><p>{translate(language, 'The signing account has no positive weight in this proposal’s rights record.', 'У аккаунта подписи нет положительного веса в записи прав этого предложения.')}</p>{connectButton}</>
          : <><h3><Vote size={22} aria-hidden="true" />{translate(language, 'Your ballot', 'Ваш голос')}</h3><dl className="vote-your-weight"><div><dt>{translate(language, 'Recorded weight', 'Зафиксированный вес')}</dt><dd><VoteWeight value={eligible?.units} /><span>{translate(language, 'bonds', 'облигаций')}</span></dd></div></dl><p>{translate(language, 'Your choice cannot be changed after signing.', 'После подписи изменить выбор нельзя.')}</p><div className="vote-choice-buttons"><Button variant="primary" disabled={unavailable} onClick={() => cast('yes')}><ThumbsUp size={22} aria-hidden="true" />{translate(language, 'Vote for', 'Голосовать за')}</Button><Button disabled={unavailable} onClick={() => cast('no')}><ThumbsDown size={22} aria-hidden="true" />{translate(language, 'Vote against', 'Голосовать против')}</Button></div>{unavailable ? <><p className="vote-blocked" role="status">{unavailableMessage}</p>{refreshButton}</> : null}</>}
        </div>
      </aside>
    </div>

    <Overlay open={detailsOpen} onClose={() => setDetailsOpen(false)} title={translate(language, 'Voting details', 'Данные голосования')} className="vote-inspection-dialog">
      <div className="vote-inspection">
        <h3 translate="no">{proposal.title}</h3>
        <dl>
          <div><dt>{translate(language, 'Proposal', 'Предложение')}</dt><dd className="vote-number">{units(proposal.id)}</dd></div>
          <div><dt>{translate(language, 'Network', 'Сеть')}</dt><dd>{network === 'localnet' ? 'Localnet' : 'Devnet'}{snapshot ? (translate(language, ' · saved snapshot', ' · архивный снимок')) : (translate(language, ' · test network', ' · тестовая сеть'))}</dd></div>
          <div><dt>{translate(language, 'Voting deadline', 'Срок голосования')}</dt><dd><time dateTime={proposal.deadlineAt}><span>{deadline.date}</span><span className="vote-clock">{deadline.time}</span></time><span className="vote-time-zone">{timeZoneLabel(timeZone, language)}</span><code>{proposal.deadlineAt}</code></dd></div>
          {snapshot && archivedAt ? <div><dt>{translate(language, 'Snapshot captured', 'Снимок сохранён')}</dt><dd><time dateTime={snapshot.capturedAt}><span>{archivedAt.date}</span><span className="vote-clock">{archivedAt.time}</span></time></dd></div> : null}
          <div><dt>{translate(language, 'Voting rights record address', 'Адрес записи прав')}</dt><dd><Address value={proposal.snapshotAddress} full /></dd></div>
          {activeWallet ? <div><dt>{translate(language, 'Signing account', 'Аккаунт подписи')}</dt><dd><Address value={activeWallet} full /></dd></div> : null}
        </dl>
        <p>{translate(language, 'Voting rights are stored separately from current holdings. Each account can submit one ballot with its recorded weight; a ballot cannot be replaced.', 'Права сохранены отдельно от текущего портфеля. Каждый аккаунт может подать один голос со своим зафиксированным весом; заменить голос нельзя.')}</p>
        {snapshot ? <p role="status">{translate(language, 'The archive is read-only and does not verify the current network state.', 'Архив доступен только для просмотра и не подтверждает текущее состояние сети.')}</p> : null}
        <div className="vote-inspection-actions"><Button onClick={() => setDetailsOpen(false)}>{translate(language, 'Close details', 'Закрыть данные')}</Button></div>
      </div>
    </Overlay>
  </section>;
}
