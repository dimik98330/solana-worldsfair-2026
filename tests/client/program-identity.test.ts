import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {address, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress} from '@solana/kit';
import {PROGRAM_ID} from '../../packages/client/src/program.ts';
import type {ProgramRelease} from '../../server/program-identity.ts';

// Isolated public byte fixtures only. No validator, release file or signer read.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/program-identity-' + crypto.randomUUID());
const {createProgramIdentityVerifier, UPGRADEABLE_LOADER} = await import('../../server/program-identity.ts');
const {AppError} = await import('../../server/rpc.ts');
const encoder = getAddressEncoder();
const key = (tag: number) => String(getAddressDecoder().decode(Uint8Array.from({length: 32}, (_value, i) => i === 0 ? tag : 17)));
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
type Account = {owner: string; executable: boolean; lamports: number; space: number; data: unknown};
type Envelope = {context: {slot: number}; value: (Account | null)[]};
async function fixture() {
  const [programData] = await getProgramDerivedAddress({programAddress: UPGRADEABLE_LOADER, seeds: [encoder.encode(PROGRAM_ID)]});
  const original = Buffer.from('7f454c460102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d', 'hex');
  let expected: unknown = {schemaVersion: 1, programId: PROGRAM_ID, loader: 'BPFLoaderUpgradeable', programLen: original.length, sha256: digest(original), releaseId: 'synthetic-unit'} satisfies ProgramRelease;
  const state = {payload: Buffer.from(original), padding: Buffer.alloc(0), genesis: key(1), deploymentSlot: 50n, authority: key(2) as string | null, reserved: Buffer.alloc(32), slot: 100};
  const calls: {method: string; params: unknown[]}[] = [];
  let hook: ((kind: 'full' | 'header' | 'genesis', count: number) => void | Promise<void>) | undefined;
  let mutate: ((envelope: Envelope, full: boolean) => void) | undefined;
  function data() {
    const program = Buffer.alloc(36); program.writeUInt32LE(2); Buffer.from(encoder.encode(programData)).copy(program, 4);
    const header = Buffer.alloc(45); header.writeUInt32LE(3); header.writeBigUInt64LE(state.deploymentSlot, 4);
    header[12] = state.authority === null ? 0 : 1;
    (state.authority === null ? state.reserved : Buffer.from(encoder.encode(address(state.authority)))).copy(header, 13);
    return [program, Buffer.concat([header, state.payload, state.padding])];
  }
  const transport = async (method: string, params: unknown[] = []) => {
    calls.push({method, params});
    if (method === 'getGenesisHash') { await hook?.('genesis', calls.length); return state.genesis; }
    assert.equal(method, 'getMultipleAccounts', 'Program identity may only read public chain identity/accounts');
    assert.deepEqual(params[0], [PROGRAM_ID, programData]);
    const config = params[1] as {dataSlice?: {offset: number; length: number}; commitment: string; minContextSlot: number};
    assert.equal(config.commitment, 'confirmed');
    if (config.dataSlice) assert.deepEqual(config.dataSlice, {offset: 0, length: 45});
    const full = !config.dataSlice;
    await hook?.(full ? 'full' : 'header', calls.length);
    const value = data().map((bytes, i) => ({owner: String(UPGRADEABLE_LOADER), executable: i === 0, lamports: 10_000_000, space: bytes.length, data: [(full ? bytes : bytes.subarray(0, 45)).toString('base64'), 'base64']}));
    const result: Envelope = {context: {slot: state.slot}, value};
    mutate?.(result, full);
    return result;
  };
  const verifier = createProgramIdentityVerifier({rpc: transport, expected: () => expected, programId: PROGRAM_ID, network: 'localnet', rpcUrl: 'synthetic-read-only'});
  return {verifier, state, calls, original, programData, transport, setExpected: (value: unknown) => { expected = value; }, getExpected: () => expected as ProgramRelease,
    setHook: (value: typeof hook) => { hook = value; }, setMutation: (value: typeof mutate) => { mutate = value; },
    fullReads: () => calls.filter(c => c.method === 'getMultipleAccounts' && !(c.params[1] as any).dataSlice).length};
}

test('exact payload and zero-only allocation padding match; mutable authority remains explicit', async () => {
  const f = await fixture(); f.state.padding = Buffer.alloc(200);
  const value = await f.verifier.assertVerifiedProgram();
  assert.equal(value.status, 'known-match'); assert.equal(value.signingAllowed, true);
  assert.equal(value.observed?.sha256, digest(f.original)); assert.equal(value.observed?.paddingBytes, 200);
  assert.equal(value.observed?.paddingZero, true); assert.equal(value.observed?.upgradeAuthority, f.state.authority);
  assert.equal(value.observed?.immutable, false); assert.equal(value.verification.sourceToBinaryAttested, false);
  assert.equal(value.verification.method, 'full-payload'); assert.equal(f.calls.length, 5);
  const second = await f.verifier.getProgramIdentity();
  assert.equal(second.status, 'known-match'); assert.equal(second.verification.method, 'cached-payload-with-fresh-headers');
  assert.equal(f.fullReads(), 1); assert.equal(f.calls.length, 9, 'Cache hits must still recheck genesis and headers on both sides');
});

test('immutable loader metadata preserves the fixed45 offset even with old reserved authority bytes', async () => {
  const f = await fixture(); f.state.authority = null; f.state.reserved = Buffer.alloc(32, 7);
  const value = await f.verifier.getProgramIdentity();
  assert.equal(value.status, 'known-match'); assert.equal(value.observed?.upgradeAuthority, null);
  assert.equal(value.observed?.immutable, true); assert.equal(value.observed?.sha256, digest(f.original));
  f.state.authority = '11111111111111111111111111111111';
  const systemAuthority = await f.verifier.getProgramIdentity();
  assert.equal(systemAuthority.status, 'known-match');
  assert.equal(systemAuthority.observed?.immutable, false, 'Some(System Program) is not the loader None variant');
});

test('bytecode mismatch, nonzero padding and short payload fail closed but remain reportable', async () => {
  for (const kind of ['hash', 'padding', 'short'] as const) {
    const f = await fixture();
    if (kind === 'hash') f.state.payload[5] ^= 1;
    if (kind === 'padding') f.state.padding = Buffer.from([0, 0, 1]);
    if (kind === 'short') f.state.payload = f.state.payload.subarray(0, 16);
    const value = await f.verifier.getProgramIdentity();
    assert.equal(value.status, 'mismatch', kind); assert.equal(value.signingAllowed, false);
    assert.equal(value.code, {hash: 'PROGRAM_BYTECODE_MISMATCH', padding: 'PROGRAM_PADDING_MISMATCH', short: 'PROGRAM_LENGTH_MISMATCH'}[kind]);
    await assert.rejects(() => f.verifier.assertVerifiedProgram(), error => error instanceof AppError && error.code === 'PROGRAM_IDENTITY_MISMATCH' && error.status === 409);
  }
});

test('spoofed owners, flags, typed layouts and a noncanonical ProgramData pointer cannot match', async () => {
  const changes: ((value: Envelope) => void)[] = [
    v => { v.value[0]!.owner = key(8); }, v => { v.value[1]!.owner = key(8); },
    v => { v.value[0]!.executable = false; }, v => { v.value[1]!.executable = true; },
    v => { const bytes = Buffer.from((v.value[0]!.data as string[])[0], 'base64'); bytes.writeUInt32LE(1); (v.value[0]!.data as string[])[0] = bytes.toString('base64'); },
    v => { const bytes = Buffer.from((v.value[1]!.data as string[])[0], 'base64'); bytes.writeUInt32LE(2); (v.value[1]!.data as string[])[0] = bytes.toString('base64'); },
    v => { const bytes = Buffer.from((v.value[1]!.data as string[])[0], 'base64'); bytes[12] = 2; (v.value[1]!.data as string[])[0] = bytes.toString('base64'); },
    v => { const bytes = Buffer.from((v.value[0]!.data as string[])[0], 'base64'); Buffer.from(encoder.encode(address(key(8)))).copy(bytes, 4); (v.value[0]!.data as string[])[0] = bytes.toString('base64'); },
  ];
  for (const change of changes) {
    const f = await fixture(); f.setMutation(change);
    assert.equal((await f.verifier.getProgramIdentity()).status, 'mismatch'); assert.equal(f.fullReads(), 0);
  }
});

test('malformed RPC account envelopes, truncated bytes and missing accounts are unavailable', async () => {
  const changes: ((value: Envelope) => void)[] = [
    v => { v.value[1] = null; }, v => { v.value.pop(); }, v => { v.context.slot = -1; }, v => { v.context.slot = 100.5; },
    v => { (v.value[1] as any).space = '80'; }, v => { v.value[1]!.space = 44; }, v => { v.value[1]!.lamports = 0; },
    v => { v.value[1]!.data = ['', 'base64']; }, v => { v.value[1]!.data = ['?', 'base64']; },
    v => { (v.value[1]!.data as string[])[1] = 'base64+zstd'; }, v => { (v.value[1]!.data as string[]).push('extra'); },
    v => { v.value[1]!.owner = 'not-a-public-key'; }, v => { (v.value[1] as any).executable = 0; },
  ];
  for (const change of changes) {
    const f = await fixture(); f.setMutation(change);
    const value = await f.verifier.getProgramIdentity(); assert.equal(value.status, 'unavailable'); assert.equal(value.signingAllowed, false);
  }
  const f = await fixture();
  const unavailable = createProgramIdentityVerifier({rpc: async () => { throw new Error('synthetic connection loss'); }, expected: f.getExpected()});
  assert.equal((await unavailable.getProgramIdentity()).status, 'unavailable');
  await assert.rejects(() => unavailable.assertVerifiedProgram(), error => error instanceof AppError && error.code === 'PROGRAM_IDENTITY_UNAVAILABLE' && error.status === 503);
});

test('missing or malformed release descriptors never borrow an earlier cache decision', async () => {
  const f = await fixture(), descriptor = f.getExpected();
  assert.equal((await f.verifier.getProgramIdentity()).status, 'known-match');
  for (const invalid of [null, {}, {...descriptor, programId: key(3)}, {...descriptor, loader: 'native'}, {...descriptor, schemaVersion: 2},
    {...descriptor, programLen: 0}, {...descriptor, programLen: 2.5}, {...descriptor, programLen: 20_000_000}, {...descriptor, sha256: '0'}, {...descriptor, releaseId: '../untrusted'}]) {
    f.setExpected(invalid); const value = await f.verifier.getProgramIdentity();
    assert.equal(value.status, 'unavailable'); assert.equal(value.code, 'RELEASE_DESCRIPTOR_INVALID');
  }
  f.setExpected(descriptor); assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
});

test('a warm match never masks transport failure or a missing later ProgramData account', async () => {
  const f = await fixture(); await f.verifier.getProgramIdentity();
  f.setHook(() => { throw new Error('Synthetic outage after a cached match'); });
  assert.equal((await f.verifier.getProgramIdentity()).status, 'unavailable');
  f.setHook(undefined); assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
  f.setMutation(value => { value.value[1] = null; });
  assert.equal((await f.verifier.getProgramIdentity()).status, 'unavailable');
  f.setMutation(undefined); assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
});

test('a new deployment slot, authority, reserved header, allocation or release descriptor invalidates cached bytes', async () => {
  const f = await fixture(); await f.verifier.getProgramIdentity();
  f.state.deploymentSlot++; assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
  f.state.authority = key(7); assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
  f.state.authority = null; await f.verifier.getProgramIdentity();
  f.state.reserved[0] = 1; assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
  f.state.padding = Buffer.alloc(12); assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
  f.setExpected({...f.getExpected(), releaseId: 'synthetic-new-descriptor'});
  assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
  f.state.deploymentSlot++; f.state.payload[6] ^= 1;
  assert.equal((await f.verifier.getProgramIdentity()).status, 'mismatch', 'An unknown upgrade cannot inherit the old matching hash');
});

test('genesis reset clears payload cache and old slot floor; a reset during a check is unavailable', async () => {
  const f = await fixture(); await f.verifier.getProgramIdentity();
  f.state.genesis = key(4); f.state.slot = 80;
  assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
  let seenGenesis = 0;
  f.setHook(kind => { if (kind === 'genesis' && ++seenGenesis === 2) f.state.genesis = key(5); });
  const changed = await f.verifier.getProgramIdentity();
  assert.equal(changed.status, 'unavailable'); assert.equal(changed.code, 'CHAIN_CHANGED_DURING_CHECK');
  f.setHook(undefined); assert.equal((await f.verifier.getProgramIdentity()).verification.method, 'full-payload');
});

test('upgrade races between header/full/final reads are rejected and do not poison the next check', async () => {
  for (const point of ['full', 'final-header'] as const) {
    const f = await fixture(); let headers = 0;
    f.setHook(kind => { if (kind === 'header') headers++; if ((point === 'full' && kind === 'full') || (point === 'final-header' && kind === 'header' && headers === 2)) { f.state.deploymentSlot++; f.state.payload[4] ^= 1; } });
    const result = await f.verifier.getProgramIdentity();
    assert.equal(result.status, 'unavailable', point); assert.equal(result.code, 'PROGRAM_CHANGED_DURING_CHECK');
    f.setHook(undefined); assert.equal((await f.verifier.getProgramIdentity()).status, 'mismatch');
  }
  const cached = await fixture(); await cached.verifier.getProgramIdentity(); let headers = 0;
  cached.setHook(kind => { if (kind === 'header' && ++headers === 2) cached.state.deploymentSlot++; });
  assert.equal((await cached.verifier.getProgramIdentity()).code, 'PROGRAM_CHANGED_DURING_CHECK');
});

test('a deployment cannot authorize signing in its own slot, with a future slot, or via stale context', async () => {
  const f = await fixture(); f.state.deploymentSlot = 100n;
  assert.equal((await f.verifier.getProgramIdentity()).code, 'PROGRAM_NOT_ACTIVE');
  f.state.deploymentSlot = 101n; assert.equal((await f.verifier.getProgramIdentity()).code, 'RPC_INVALID');
  f.state.deploymentSlot = 50n; assert.equal((await f.verifier.getProgramIdentity()).status, 'known-match');
  f.state.slot = 99; assert.equal((await f.verifier.getProgramIdentity()).code, 'RPC_INVALID');
});

test('concurrent callers serialize observations and a failed devnet identity cannot authorize signatures', async () => {
  const f = await fixture();
  const result = await Promise.all([f.verifier.getProgramIdentity(), f.verifier.getProgramIdentity(), f.verifier.getProgramIdentity()]);
  assert.deepEqual(result.map(r => r.verification.method), ['full-payload', 'cached-payload-with-fresh-headers', 'cached-payload-with-fresh-headers']);
  assert.equal(f.fullReads(), 1);
  const devnet = createProgramIdentityVerifier({rpc: f.transport, expected: f.getExpected(), network: 'devnet'});
  assert.equal((await devnet.getProgramIdentity()).code, 'NETWORK_MISMATCH');
});
