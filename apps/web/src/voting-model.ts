import { add, integer, subtract } from './format';
import type { Proposal } from './types';

export type VotingAccountStatus = 'closed' | 'not_selected' | 'voted' | 'ineligible' | 'eligible' | 'unknown';

/** Viewing an account never grants it ballot authority. */
export function votingAccountStatus(proposal: Proposal, activeWallet?: string): VotingAccountStatus {
  if (proposal.status === 'closed') return 'closed';
  if (!activeWallet) return 'not_selected';
  if (proposal.votedWallets.includes(activeWallet)) return 'voted';
  const eligible = proposal.eligibleWeights.find(item => item.wallet === activeWallet);
  if (!eligible) return 'ineligible';
  const weight = integer(eligible.units);
  if (weight === null || weight < 0n) return 'unknown';
  return weight > 0n ? 'eligible' : 'ineligible';
}

export function remainingVotingWeight(proposal: Proposal): string | undefined {
  const weights = [proposal.yesWeight, proposal.noWeight, ...proposal.eligibleWeights.map(item => item.units)];
  if (weights.some(value => { const exact = integer(value); return exact === null || exact < 0n; })) return undefined;
  const total = add(proposal.eligibleWeights.map(item => item.units));
  const cast = add([proposal.yesWeight, proposal.noWeight]);
  const remaining = subtract(total, cast);
  const exact = integer(remaining);
  return exact !== null && exact >= 0n ? remaining : undefined;
}
