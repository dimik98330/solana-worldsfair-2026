import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { proposalTitleError } from './validation';

test('proposal titles enforce the 96-byte boundary for ASCII, Cyrillic and emoji', () => {
  assert.equal(proposalTitleError('a'.repeat(96)), null);
  assert.match(proposalTitleError('a'.repeat(97))!, /this title uses 97/);
  assert.equal(proposalTitleError('Ж'.repeat(48)), null);
  assert.match(proposalTitleError('Ж'.repeat(49))!, /this title uses 98/);
  assert.equal(proposalTitleError('😀'.repeat(24)), null);
  assert.match(proposalTitleError('😀'.repeat(25))!, /this title uses 100/);
});
test('proposal validation handles empty input and measures the actual trimmed title', () => {
  assert.equal(proposalTitleError(' \n\t '), 'Enter a proposal title.');
  assert.equal(proposalTitleError(`  ${'a'.repeat(96)}  `), null);
  const tooLong = 'Ж'.repeat(49);
  assert.ok(proposalTitleError(tooLong));
  assert.equal(tooLong.length, 49, 'Rejected input is not truncated.');
});
