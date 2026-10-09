import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {address, getAddressDecoder, getAddressEncoder, getBase58Encoder} from '@solana/kit';
import {PROGRAM_ID, derive} from '../../packages/client/src/program.ts';

// Only synthetic RPC responses; importing rpc/storage is confined to a fresh test namespace.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/proposal-discovery-' + crypto.randomUUID());
const [{discoverProposals}, {AppError}] = await Promise.all([import('../../server/proposal-discovery.ts'), import('../../server/rpc.ts')]);
const bond = getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i + 1));
const discriminator = createHash('sha256').update('account:Proposal').digest().subarray(0, 8);
async function entry(id: bigint) {
  const bytes = Buffer.alloc(48); discriminator.copy(bytes); Buffer.from(getAddressEncoder().encode(address(bond))).copy(bytes, 8); bytes.writeBigUInt64LE(id, 40);
  return {pubkey: await derive('proposal', bond, id), account: {owner: PROGRAM_ID as string, executable: false, data: [bytes.toString('base64'), 'base64']}};
}
const rejected = (response: unknown, code: string) => assert.rejects(discoverProposals(bond, 41, async () => response), (error: unknown) => error instanceof AppError && error.code === code);

test('filtered discovery uses exact 48-byte identity headers, context floor and canonical numeric order', async () => {
  const entries = await Promise.all([10n, 2n, 18_446_744_073_709_551_615n, 0n].map(entry));
  const result = await discoverProposals(bond, 41, async (method, params) => {
    assert.equal(method, 'getProgramAccounts'); assert.equal(params[0], PROGRAM_ID);
    const config = params[1] as any;
    assert.equal(config.withContext, true); assert.equal(config.minContextSlot, 41); assert.equal(config.commitment, 'confirmed'); assert.equal(config.encoding, 'base64');
    assert.deepEqual(config.dataSlice, {offset: 0, length: 48});
    assert.equal(config.filters.length, 2); assert.equal(config.filters[0].memcmp.offset, 0);
    assert.deepEqual(Buffer.from(getBase58Encoder().encode(config.filters[0].memcmp.bytes)), discriminator);
    assert.deepEqual(config.filters[1], {memcmp: {offset: 8, bytes: bond}});
    return {context: {slot: 42}, value: entries};
  });
  assert.equal(result.contextSlot, 42); assert.deepEqual(result.proposals.map(p => p.id), ['0', '2', '10', '18446744073709551615']);
});

test('empty and oversized scans remain available with a deterministic finite canonical window', async () => {
  const empty = await discoverProposals(bond, 0, async () => ({context: {slot: 0}, value: []}));
  assert.equal(empty.contextSlot, 0); assert.deepEqual(empty.proposals, []); assert.deepEqual(empty.selectedIds, []);
  const entries = await Promise.all(Array.from({length: 40}, (_, i) => entry(BigInt(i))));
  const result = await discoverProposals(bond, 41, async () => ({context: {slot: 42}, value: [...entries].reverse()}), ['0', '39', '100']);
  assert.equal(result.proposals.length, 32); assert.equal(result.discoveredIds.length, 40);
  assert.deepEqual(result.selectedIds, Array.from({length: 32}, (_, i) => String(i)));
  assert.deepEqual(result.catalogIdsAbsentAtDiscovery, ['100']);
  const reordered = await discoverProposals(bond, 41, async () => ({context: {slot: 42}, value: entries}), ['0', '39', '100']);
  assert.equal(result.headerFingerprint, reordered.headerFingerprint);
});

test('omitted headers remain cheaply validated and fingerprinted, but their PDA is explicitly outside the verified window', async () => {
  const entries = await Promise.all(Array.from({length: 33}, (_, i) => entry(BigInt(i))));
  const baseline = await discoverProposals(bond, 41, async () => ({context: {slot: 42}, value: entries}));
  // This valid pubkey is not a canonical proposal PDA. Since ID 32 is omitted,
  // it must supply neither a verified proposal nor financial values.
  entries[32].pubkey = address(bond);
  const result = await discoverProposals(bond, 41, async () => ({context: {slot: 42}, value: entries}));
  assert.equal(result.proposals.length, 32); assert.equal(result.proposals.some(p => p.id === '32'), false);
  assert.notEqual(result.headerFingerprint, baseline.headerFingerprint);
  await rejected({context: {slot: 42}, value: [...entries.slice(0, 32), {...entries[32], account: {...entries[32].account, executable: true}}]}, 'RPC_INVALID');
  await rejected({context: {slot: 42}, value: [...entries.slice(0, 32), entries[0]]}, 'INVALID_PROPOSAL_DISCOVERY');
});

test('missing, malformed and stale contextual RPC responses fail closed', async () => {
  for (const response of [null, [], {}, {value: []}, {context: {}, value: []}, {context: {slot: 40}, value: []}, {context: {slot: '42'}, value: []}, {context: {slot: NaN}, value: []}, {context: {slot: -1}, value: []}, {context: {slot: 42.5}, value: []}, {context: {slot: Number.MAX_SAFE_INTEGER + 1}, value: []}, {context: {slot: 42}}, {context: {slot: 42}, value: {}}, {context: {slot: 42}, value: [null]}]) await rejected(response, 'RPC_INVALID');
});

test('program owner, executable, encoding and identity header validation reject account substitutions', async () => {
  const good = await entry(1n);
  const response = (value: unknown) => ({context: {slot: 42}, value: [value]});
  await rejected(response({...good, pubkey: 'not-an-address'}), 'RPC_INVALID');
  await rejected(response({...good, account: {...good.account, owner: bond}}), 'INVALID_ACCOUNT_OWNER');
  for (const mutation of [{executable: true}, {executable: undefined}, {data: []}, {data: [good.account.data[0], 'base58']}, {data: [good.account.data[0], 'base64', 'extra']}, {data: [42, 'base64']}]) await rejected(response({...good, account: {...good.account, ...mutation}}), 'RPC_INVALID');
  for (const length of [0, 47, 49, 96]) await rejected(response({...good, account: {...good.account, data: [Buffer.alloc(length).toString('base64'), 'base64']}}), 'INVALID_PROPOSAL_DISCOVERY');
  await rejected(response({...good, account: {...good.account, data: ['!'.repeat(64), 'base64']}}), 'RPC_INVALID');
  for (const offset of [0, 8, 40]) {
    const header = Buffer.from(good.account.data[0], 'base64'); header[offset] ^= 1;
    await rejected(response({...good, account: {...good.account, data: [header.toString('base64'), 'base64']}}), 'INVALID_PROPOSAL_DISCOVERY');
  }
  await rejected(response({...good, pubkey: bond}), 'INVALID_PROPOSAL_DISCOVERY');
});

test('duplicate IDs/addresses and sparse response entries are rejected', async () => {
  const good = await entry(1n), other = await entry(2n);
  await rejected({context: {slot: 42}, value: [good, good]}, 'INVALID_PROPOSAL_DISCOVERY');
  await rejected({context: {slot: 42}, value: [good, {...other, pubkey: good.pubkey}]}, 'INVALID_PROPOSAL_DISCOVERY');
  await rejected({context: {slot: 42}, value: Array(1)}, 'RPC_INVALID');
});

test('RPC errors are preserved without an empty-list fallback', async () => {
  const failure = new AppError('RPC_RATE_LIMITED', 'Rate limited', 503, true);
  await assert.rejects(discoverProposals(bond, 41, async () => { throw failure; }), error => error === failure);
});
