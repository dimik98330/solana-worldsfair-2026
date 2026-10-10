import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Proposal } from './types';
import { remainingVotingWeight, votingAccountStatus } from './voting-model';

const proposal: Proposal = {
  id: '0', title: 'Holder decision', snapshotAddress: 'snapshot', deadlineAt: '2026-10-08T08:00:00Z',
  yesWeight: '10', noWeight: '5', eligibleWeights: [{ wallet: 'holder', units: '10' }, { wallet: 'other', units: '5' }, { wallet: 'absent', units: '3' }],
  votedWallets: ['other'], status: 'open',
};

test('ballot state distinguishes no account, no rights, recorded ballot and closed event', () => {
  assert.equal(votingAccountStatus(proposal), 'not_selected');
  assert.equal(votingAccountStatus(proposal, 'issuer'), 'ineligible');
  assert.equal(votingAccountStatus(proposal, 'other'), 'voted');
  assert.equal(votingAccountStatus(proposal, 'holder'), 'eligible');
  assert.equal(votingAccountStatus({ ...proposal, status: 'closed' }, 'holder'), 'closed');
  assert.equal(votingAccountStatus({ ...proposal, status: 'closed' }), 'closed');
  assert.equal(votingAccountStatus({ ...proposal, status: 'capturing' }, 'holder'), 'capturing');
  assert.equal(votingAccountStatus({ ...proposal, status: 'capturing' }), 'capturing');
});

test('invalid and zero voting weights never permit a ballot', () => {
  assert.equal(votingAccountStatus({ ...proposal, eligibleWeights: [{ wallet: 'holder', units: '0' }] }, 'holder'), 'ineligible');
  assert.equal(votingAccountStatus({ ...proposal, eligibleWeights: [{ wallet: 'holder', units: 'NaN' }] }, 'holder'), 'unknown');
  assert.equal(votingAccountStatus({ ...proposal, eligibleWeights: [{ wallet: 'holder', units: '-1' }] }, 'holder'), 'unknown');
});

test('uncast weight stays exact and inconsistent totals remain unknown', () => {
  assert.equal(remainingVotingWeight(proposal), '3');
  assert.equal(remainingVotingWeight({ ...proposal, yesWeight: '9007199254740993123456', noWeight: '1', eligibleWeights: [{ wallet: 'holder', units: '9007199254740993123460' }] }), '3');
  assert.equal(remainingVotingWeight({ ...proposal, yesWeight: '19' }), undefined);
  assert.equal(remainingVotingWeight({ ...proposal, noWeight: 'NaN' }), undefined);
  assert.equal(remainingVotingWeight({ ...proposal, noWeight: '-1' }), undefined);
});
