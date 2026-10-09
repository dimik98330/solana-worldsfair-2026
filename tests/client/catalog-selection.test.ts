import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {address, getAddressDecoder, getAddressEncoder} from '@solana/kit';
import {getMintEncoder, getTokenEncoder, TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import * as program from '../../packages/client/src/program.ts';
import type {Bond, RpcAccount} from '../../server/chain-view.ts';
import type {CatalogRecord} from '../../server/catalog.ts';

// No live RPC or recorded metadata: exercise demo-disabled reads with an isolated synthetic bank.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/catalog-selection-' + crypto.randomUUID());
process.env.BONDTRACE_ENABLE_DEMO = 'false';
const [{getState, readBond}, {saveCatalog, listCatalog}, {fixture, saveFixture}, {readJson, writeJson, closeStorage}, {AppError}, {CLOCK_ADDRESS}] = await Promise.all([
  import('../../server/state.ts'), import('../../server/catalog.ts'), import('../../server/store.ts'),
  import('../../server/storage.ts'), import('../../server/rpc.ts'), import('../../server/chain-view.ts'),
]);
const key = (id: number) => getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i === 0 ? id : 31));
const issuer = key(1), settlementMint = key(2), accounts = new Map<string, RpcAccount>();
const requests: {method: string; params: any[]}[] = [];
const u64 = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes; };
const i64 = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigInt64LE(value); return bytes; };
const u32 = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
const pubkey = (value: string) => Buffer.from(getAddressEncoder().encode(address(value)));
const raw = (bytes: ArrayLike<number>, owner: string = TOKEN_PROGRAM_ADDRESS): RpcAccount => ({owner, executable: false, data: [Buffer.from(Array.from(bytes)).toString('base64'), 'base64']});
function encodeBond(bond: Bond) {
  const name = Buffer.from(bond.name);
  return Buffer.concat([createHash('sha256').update('account:Bond').digest().subarray(0, 8),
    ...[bond.issuer, bond.bondMint, bond.settlementMint, bond.vault].map(pubkey), u64(bond.seriesId), u32(name.length), name,
    u64(bond.faceValue), i64(bond.maturityTs), u64(bond.totalIssued), u64(bond.totalRedeemed),
    Buffer.from([bond.state, bond.bump, bond.nextCouponIndex]), Buffer.alloc(2), u32(0), u32(1),
    ...bond.couponTerms.flatMap(coupon => [i64(coupon.recordTs), i64(coupon.paymentTs), u64(coupon.unitAmount)]), u32(0),
  ]);
}
async function issue(seriesId: number, createdAt: string): Promise<CatalogRecord> {
  const bondAddress = await program.deriveBond(issuer, BigInt(seriesId)), bondMint = await program.derive('bond_mint', bondAddress), vault = await program.derive('vault', bondAddress);
  const bond: Bond = {issuer, bondMint, settlementMint, vault, seriesId: BigInt(seriesId), name: 'Synthetic draft ' + seriesId,
    faceValue: 9_007_199_254_740_993n, maturityTs: 400n, totalIssued: 0n, totalRedeemed: 0n, state: 0, bump: 255,
    nextCouponIndex: 0, principalClaimedMask: 0, holderWallets: [], couponTerms: [{recordTs: 200n, paymentTs: 300n, unitAmount: 7n}], redemptionUnits: []};
  accounts.set(bondAddress, raw(encodeBond(bond), program.PROGRAM_ID));
  accounts.set(bondMint, raw(getMintEncoder().encode({mintAuthority: address(bondAddress), freezeAuthority: address(bondAddress), supply: 0n, decimals: 0, isInitialized: true})));
  accounts.set(vault, raw(getTokenEncoder().encode({mint: address(settlementMint), owner: address(bondAddress), amount: 0n, state: 1, delegate: null, delegatedAmount: 0n, closeAuthority: null, isNative: null})));
  return {seriesId: String(seriesId), bond: bondAddress, name: bond.name, settlementMint, createdAt, rateBps: 0, couponFrequency: 0,
    roles: {issuer}, proposalIds: [], complete: false, accelerated: false, source: 'wallet'};
}
const clock = Buffer.alloc(40); clock.writeBigUInt64LE(51n, 0); clock.writeBigInt64LE(150n, 32);
accounts.set(CLOCK_ADDRESS, raw(clock, 'Sysvar1111111111111111111111111111111111111'));
accounts.set(settlementMint, raw(getMintEncoder().encode({mintAuthority: address(issuer), freezeAuthority: null, supply: 0n, decimals: 6, isInitialized: true})));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body)); requests.push(request);
  assert.equal(request.params[1]?.commitment, 'confirmed');
  let result;
  if (request.method === 'getAccountInfo') result = {context: {slot: 50}, value: accounts.get(request.params[0]) ?? null};
  else if (request.method === 'getProgramAccounts') result = {context: {slot: 51}, value: []};
  else {
    assert.equal(request.method, 'getMultipleAccounts', 'Read path must never submit a transaction');
    result = {context: {slot: 51}, value: request.params[0].map((account: string) => accounts.get(account) ?? null)};
  }
  return Response.json({jsonrpc: '2.0', id: request.id, result});
};
after(() => { globalThis.fetch = originalFetch; closeStorage(); });
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code);
const first = await issue(1, '2026-10-08T00:00:00.000Z'), second = await issue(2, '2026-10-09T00:00:00.000Z');
const catalogFile = (record: CatalogRecord) => path.join(process.env.BONDTRACE_DATA_DIR!, 'catalog', record.bond + '.json');

test('empty catalog without a fixture retains the empty state and chain clock', async () => {
  assert.equal(fixture(), null);
  const state = await getState();
  assert.equal(state.instrument, null); assert.deepEqual(state.instruments, []);
  assert.equal(state.serverTime, '1970-01-01T00:02:30.000Z'); assert.equal(state.demo.available, false);
});

test('demo-disabled state selects a wallet-created catalog draft through the coherent chain graph', async () => {
  saveCatalog(first); requests.length = 0;
  const before = readJson(catalogFile(first), null), state = await getState();
  assert.equal(state.instrument?.address, first.bond); assert.equal(state.instrument.status, 'draft');
  assert.equal(state.instrument.faceValueMinor, '9007199254740993'); assert.equal(state.instrument.couponUnitMinor, '7');
  assert.equal(state.reconciliation.status, 'verified'); assert.equal(state.reconciliation.contextSlot, state.context.slot);
  assert.equal(state.context.slot, '51'); assert.equal(state.demo.available, false); assert.deepEqual(state.demo.roleWallets, {});
  assert.equal(requests[0].params[0], first.bond); assert.equal(requests.filter(request => request.method === 'getMultipleAccounts').length, 1);
  assert.deepEqual(readJson(catalogFile(first), null), before); assert.equal(fixture(), null);
  assert.equal(await readBond(), null, 'Read-only default selection must not change transaction-builder defaults');
});

test('newest catalog draft is selected while explicit selection retains precedence', async () => {
  saveCatalog(second);
  assert.equal((await getState()).instrument.address, second.bond);
  assert.equal((await getState(first.bond)).instrument.address, first.bond);
  assert.equal((await getState('')).instrument, null, 'An explicit empty selection retains its existing empty-state behavior');
  await rejects(getState('invalid'), 'INVALID_ADDRESS');
  await rejects(getState(key(9)), 'INSTRUMENT_NOT_FOUND');
});

test('equal catalog timestamps use a stable address tie break regardless of insertion order', async () => {
  const records = [await issue(3, '2026-10-10T00:00:00.000Z'), await issue(4, '2026-10-10T00:00:00.000Z')].sort((a, b) => a.bond < b.bond ? -1 : 1);
  saveCatalog(records[1]); saveCatalog(records[0]);
  assert.equal((await getState()).instrument.address, records[0].bond);
});

test('legacy fixture retains precedence over the catalog without mutating its history', async () => {
  const {source: _source, ...legacy} = first; saveFixture(legacy);
  try {
    const before = fixture();
    assert.equal((await getState()).instrument.address, first.bond);
    assert.equal((await getState(second.bond)).instrument.address, second.bond);
    assert.deepEqual(fixture(), before);
  } finally { writeJson(path.join(process.env.BONDTRACE_DATA_DIR!, 'fixture.json'), null); }
});

test('malformed catalog metadata fails closed before RPC instead of silently selecting another issue', async () => {
  const before = readJson(catalogFile(first), null); writeJson(catalogFile(first), {...first, seriesId: 'invalid'}); requests.length = 0;
  try { await rejects(getState(), 'INVALID_CATALOG'); assert.equal(requests.length, 0); }
  finally { writeJson(catalogFile(first), before); }
});

test('fallback cannot substitute catalog identity or an invalid chain account for verified state', async () => {
  const selected = listCatalog()[0], before = readJson(catalogFile(selected), null);
  writeJson(catalogFile(selected), {...selected, seriesId: '999'});
  try { await rejects(getState(), 'FIXTURE_MISMATCH'); }
  finally { writeJson(catalogFile(selected), before); }
  const chainAccount = accounts.get(selected.bond)!;
  accounts.set(selected.bond, {...chainAccount, owner: program.SYSTEM});
  try { await rejects(getState(), 'INVALID_ACCOUNT_OWNER'); }
  finally { accounts.set(selected.bond, chainAccount); }
});

test('missing newest catalog account fails closed without reverting to an older or synthetic issue', async () => {
  const missing = await issue(5, '2026-10-11T00:00:00.000Z'); saveCatalog(missing); accounts.delete(missing.bond); requests.length = 0;
  await rejects(getState(), 'INSTRUMENT_NOT_FOUND');
  assert.equal(requests.length, 1); assert.equal(requests[0].params[0], missing.bond);
  assert.equal(fixture(), null); assert.deepEqual(readJson(catalogFile(missing), null), missing);
});
