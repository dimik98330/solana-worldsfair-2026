import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {getAddressDecoder, getAddressEncoder, address} from '@solana/kit';
import {getMintEncoder, getTokenEncoder, TOKEN_PROGRAM_ADDRESS, ASSOCIATED_TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import * as program from '../../packages/client/src/program.ts';
import {MAX_U64} from '../../packages/client/src/domain.ts';

// Synthetic account/RPC tests use a separate ignored directory, never the recorded demo.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/admin-' + crypto.randomUUID());
const [{makeAdminAction, finalizeAdminEffect, normalizeIssueTerms, requiredReserve}, {readCatalog, listCatalog, saveCatalog}, {saveFixture, fixture}, {AppError}, {readJson, writeJson, closeStorage}] = await Promise.all([
  import('../../server/admin.ts'), import('../../server/catalog.ts'), import('../../server/store.ts'), import('../../server/rpc.ts'),
  import('../../server/storage.ts'),
]);
const key = (id: number) => getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i === 0 ? id : 7));
const issuer = key(1), holder = key(2), other = key(3), settlementMint = key(4);
const genesisHash = key(8);
const legacyFixtureFile = path.join(process.env.BONDTRACE_DATA_DIR!, 'fixture.json');
const legacyFixture = {seriesId: '42', bond: await program.deriveBond(issuer, 42n), name: 'Original synthetic legacy fixture', settlementMint, createdAt: '2026-10-08T00:00:00.000Z', rateBps: 0, couponFrequency: 0, roles: {issuer}, proposalIds: [], complete: false, accelerated: false};
const legacyFixtureBytes = Buffer.from(JSON.stringify(legacyFixture, null, 2));
assert.equal(fs.existsSync(path.join(process.env.BONDTRACE_DATA_DIR!, 'metadata.sqlite')), false, 'Seed legacy data before the lazy first SQLite open');
fs.mkdirSync(path.dirname(legacyFixtureFile), {recursive: true});
fs.writeFileSync(legacyFixtureFile, legacyFixtureBytes, {flag: 'wx'});
const originalFetch = globalThis.fetch;
type SyntheticAccount = {owner: string; executable: boolean; data: [string, string]; lamports: number};
const accounts = new Map<string, SyntheticAccount>();
let now = 100n, nextSeries = 1000n;
let accountReadHook: (key: string) => void = () => {};
function store(key: string, bytes: ArrayLike<number>, owner = String(TOKEN_PROGRAM_ADDRESS)) { accounts.set(key, {owner, executable: false, data: [Buffer.from(Array.from(bytes)).toString('base64'), 'base64'], lamports: 1_000_000}); }
globalThis.fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body));
  if (request.method === 'getGenesisHash') return Response.json({jsonrpc: '2.0', id: request.id, result: genesisHash});
  assert.equal(request.method, 'getAccountInfo', 'Admin builders must only read mocked accounts');
  const requested = String(request.params[0]);
  if (requested === 'SysvarC1ock11111111111111111111111111111111') {
    const clock = Buffer.alloc(40); clock.writeBigInt64LE(now, 32);
    return Response.json({jsonrpc: '2.0', id: request.id, result: {context: {slot: 25}, value: {owner: program.SYSTEM, executable: false, data: [clock.toString('base64'), 'base64']}}});
  }
  accountReadHook(requested);
  return Response.json({jsonrpc: '2.0', id: request.id, result: {context: {slot: 25}, value: accounts.get(requested) ?? null}});
};
after(() => { globalThis.fetch = originalFetch; closeStorage(); });
const u64 = (value: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(value); return b; };
const i64 = (value: bigint) => { const b = Buffer.alloc(8); b.writeBigInt64LE(value); return b; };
const u32 = (value: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const pubkey = (value: string) => Buffer.from(getAddressEncoder().encode(address(value)));
function encodeBond(bond: ReturnType<typeof program.decodeBond>) {
  const name = Buffer.from(bond.name);
  return Buffer.concat([createHash('sha256').update('account:Bond').digest().subarray(0, 8),
    ...[bond.issuer, bond.bondMint, bond.settlementMint, bond.vault].map(pubkey), u64(bond.seriesId), u32(name.length), name,
    u64(bond.faceValue), i64(bond.maturityTs), u64(bond.totalIssued), u64(bond.totalRedeemed), Buffer.from([bond.state, bond.bump, bond.nextCouponIndex]), Buffer.alloc(2),
    u32(bond.holderWallets.length), ...bond.holderWallets.map(pubkey), u32(bond.couponTerms.length),
    ...bond.couponTerms.flatMap(c => [i64(c.recordTs), i64(c.paymentTs), u64(c.unitAmount)]), u32(bond.redemptionUnits.length), ...bond.redemptionUnits.map(u64),
  ]);
}
function settlement(decimals = 6, initialized = true, owner = String(TOKEN_PROGRAM_ADDRESS)) {
  store(settlementMint, getMintEncoder().encode({mintAuthority: issuer, supply: 100_000_000n, decimals, isInitialized: initialized, freezeAuthority: null}), owner);
}
function tokenAccount(key: string, mint: string, owner: string, amount: bigint, state = 2) {
  store(key, getTokenEncoder().encode({mint: address(mint), owner: address(owner), amount, delegate: null, delegatedAmount: 0n, closeAuthority: null, isNative: null, state}));
}
function terms(seriesId = nextSeries.toString()): Record<string, unknown> {
  return {seriesId, name: 'Test issue', settlementMint, faceValueMinor: '1000000', maturityTs: '400', coupons: [{recordTs: '200', paymentTs: '250', unitAmount: '50000'}]};
}
async function setup(options: Partial<ReturnType<typeof program.decodeBond>> = {}) {
  accounts.clear(); accountReadHook = () => {}; now = 100n; settlement();
  const seriesId = ++nextSeries, bondAddress = await program.deriveBond(issuer, seriesId), bondMint = await program.derive('bond_mint', bondAddress), vault = await program.derive('vault', bondAddress);
  const bond: ReturnType<typeof program.decodeBond> = {issuer, bondMint, settlementMint, vault, seriesId, name: 'Test issue', faceValue: 1_000_000n, maturityTs: 400n, totalIssued: 10n, totalRedeemed: 0n, state: 0, bump: 255, nextCouponIndex: 0, principalClaimedMask: 0, holderWallets: [holder], couponTerms: [{recordTs: 200n, paymentTs: 250n, unitAmount: 50_000n}], redemptionUnits: [], ...options};
  store(bondAddress, encodeBond(bond), program.PROGRAM_ID);
  store(bondMint, getMintEncoder().encode({mintAuthority: address(bondAddress), supply: bond.totalIssued, decimals: 0, isInitialized: true, freezeAuthority: address(bondAddress)}));
  tokenAccount(vault, settlementMint, bondAddress, requiredReserve(bond, bond.totalIssued), 1);
  tokenAccount(await program.ata(holder, bondMint), bondMint, holder, bond.totalIssued);
  const record = {seriesId: seriesId.toString(), bond: bondAddress, name: bond.name, settlementMint, createdAt: new Date().toISOString(), rateBps: 0, couponFrequency: 0, roles: {issuer}, proposalIds: [], complete: false, accelerated: false};
  saveFixture(record);
  return {bond, bondAddress, record};
}
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code);

test('creation terms reject malformed integer, UTF-8 length, dates and schedules', () => {
  for (const changed of [
    {faceValueMinor: 1}, {faceValueMinor: '1.5'}, {faceValueMinor: '0'}, {seriesId: '-1'}, {seriesId: (MAX_U64 + 1n).toString()},
    {name: 'Я'.repeat(33)}, {name: '   '}, {name: 'name\n'}, {name: '\ud800'}, {maturityTs: (1n << 63n).toString()}, {maturityTs: '99'},
    {maturityTs: '8640000000001'},
    {coupons: 'invalid'}, {coupons: []}, {coupons: Array(9).fill({recordTs: '200', paymentTs: '250', unitAmount: '1'})},
    {coupons: [{recordTs: '100', paymentTs: '250', unitAmount: '1'}]}, {coupons: [{recordTs: '200', paymentTs: '199', unitAmount: '1'}]},
    {coupons: [{recordTs: '200', paymentTs: '401', unitAmount: '1'}]}, {coupons: [{recordTs: '200', paymentTs: '250', unitAmount: '0'}]},
    {coupons: [{recordTs: '200', paymentTs: '250', unitAmount: '1'}, {recordTs: '210', paymentTs: '249', unitAmount: '1'}]},
  ]) assert.throws(() => normalizeIssueTerms({...terms(), ...changed}, 100n));
  const normalized = normalizeIssueTerms({...terms(), coupons: JSON.stringify(terms().coupons), name: 'Я'.repeat(32)}, 100n);
  assert.equal(normalized.name.length, 32);
  assert.equal(normalized.faceValue, 1_000_000n);
  assert.equal(normalizeIssueTerms({...terms(), maturityTs: '8640000000000'}, 100n).maturityTs, 8_640_000_000_000n);
});

test('full reserve uses exact u64 math for every coupon and the complete supply', () => {
  const bond = {faceValue: 9_007_199_254_740_993n, couponTerms: [{recordTs: 200n, paymentTs: 250n, unitAmount: 7n}, {recordTs: 300n, paymentTs: 350n, unitAmount: 11n}]};
  assert.equal(requiredReserve(bond, 3n), 27_021_597_764_223_033n);
  assert.throws(() => requiredReserve({...bond, faceValue: MAX_U64}, 1n), /reserve exceeds/);
  assert.throws(() => requiredReserve(bond, MAX_U64), /reserve exceeds/);
  assert.throws(() => requiredReserve({...bond, couponTerms: [{recordTs: 200n, paymentTs: 250n, unitAmount: -1n}]}, 1n), /positive coupons/);
  assert.throws(() => normalizeIssueTerms({...terms(), faceValueMinor: MAX_U64.toString()}, 100n), /reserve exceeds/);
});

test('initialize builds exact immutable metadata, verifies mint and blocks duplicate series', async () => {
  const {bondAddress} = await setup();
  const input = terms((++nextSeries).toString()), built = await makeAdminAction({action: 'initialize_issue', params: input}, issuer);
  assert.equal(built.instructions.length, 1); assert.equal(built.summary.instrumentAddress, built.bondAddress);
  assert.equal(built.metadata?.faceValueMinor, '1000000'); assert.notEqual(built.bondAddress, bondAddress);
  settlement(9); await rejects(makeAdminAction({action: 'initialize_issue', params: input}, issuer), 'INVALID_MINT');
  settlement(6, false); await rejects(makeAdminAction({action: 'initialize_issue', params: input}, issuer), 'INVALID_MINT');
  settlement(6, true, program.SYSTEM); await rejects(makeAdminAction({action: 'initialize_issue', params: input}, issuer), 'INVALID_MINT');
  settlement(); store(built.bondAddress, Buffer.alloc(8), program.PROGRAM_ID);
  await rejects(makeAdminAction({action: 'initialize_issue', params: input}, issuer), 'ISSUE_EXISTS');
});

test('catalog validates address paths and metadata, preserves the legacy fixture, pins identity', async () => {
  const {record} = await setup(), before = fs.readFileSync(legacyFixtureFile);
  assert.ok(before.equals(legacyFixtureBytes), 'The original pre-migration JSON must remain byte-for-byte intact');
  assert.deepEqual(fixture(), record, 'The current fixture must come from SQLite rather than stale legacy JSON');
  assert.notEqual(record.bond, legacyFixture.bond);
  assert.equal(readCatalog(record.bond)?.source, 'demo');
  saveCatalog({...record, source: 'demo', holderLabels: {[holder]: 'Investor'}});
  assert.equal(listCatalog().filter(value => value.bond === record.bond).length, 1);
  assert.ok(fs.readFileSync(legacyFixtureFile).equals(before));
  assert.deepEqual(fixture(), record);
  assert.throws(() => readCatalog('../fixture'), /catalog address/);
  assert.throws(() => saveCatalog({...record, source: 'demo', seriesId: '999'}), /identity cannot/);
  assert.throws(() => saveCatalog({...record, source: 'demo', settlementMint: other}), /identity cannot/);
  assert.throws(() => saveCatalog({...record, source: 'demo', roles: {issuer: other}}), /identity cannot/);
  assert.throws(() => saveCatalog({...record, source: 'wallet', holderLabels: {[holder]: 'X'.repeat(65)}}), /catalog text/);
  assert.throws(() => saveCatalog({...record, source: 'wallet', rateBps: 1000}), /annual rate/);
  const catalogFile = path.join(process.env.BONDTRACE_DATA_DIR!, 'catalog', record.bond + '.json');
  const persisted = readJson(catalogFile, null);
  assert.ok(persisted);
  assert.equal(fs.existsSync(catalogFile), false, 'Current catalog documents do not require JSON files');
  writeJson(catalogFile, {...record, bond: other, source: 'demo'});
  assert.throws(() => readCatalog(record.bond), /address does not match/);
  writeJson(catalogFile, persisted);
});

test('registration creates only canonical idempotent ATA and enforces issuer, draft, date, duplicates and cap', async () => {
  let setupResult = await setup();
  const built = await makeAdminAction({action: 'register_holder', bondAddress: setupResult.bondAddress, params: {holderWallet: other, label: 'New holder'}}, issuer);
  assert.equal(built.instructions.length, 2); assert.equal(built.instructions[0].programAddress, ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  assert.equal(built.instructions[0].accounts?.[1].address, await program.ata(other, setupResult.bond.bondMint));
  await rejects(makeAdminAction({action: 'register_holder', bondAddress: setupResult.bondAddress, params: {holderWallet: other}}, other), 'UNAUTHORIZED_ISSUER');
  await rejects(makeAdminAction({action: 'register_holder', bondAddress: setupResult.bondAddress, params: {holderWallet: holder}}, issuer), 'ALREADY_REGISTERED');
  now = 200n; await rejects(makeAdminAction({action: 'register_holder', bondAddress: setupResult.bondAddress, params: {holderWallet: other}}, issuer), 'RECORD_DATE_PASSED');
  setupResult = await setup({state: 1}); await rejects(makeAdminAction({action: 'register_holder', bondAddress: setupResult.bondAddress, params: {holderWallet: other}}, issuer), 'INVALID_PHASE');
  setupResult = await setup({holderWallets: Array.from({length: 16}, (_, i) => key(20 + i))});
  await rejects(makeAdminAction({action: 'register_holder', bondAddress: setupResult.bondAddress, params: {holderWallet: other}}, issuer), 'REGISTRY_FULL');
});

test('issuance pins holder/supply baseline and rejects unregistered, zero and overflow', async () => {
  const {bond, bondAddress} = await setup(), request = {action: 'issue_units', bondAddress, params: {holderWallet: holder, units: '3'}};
  const built = await makeAdminAction(request, issuer);
  assert.equal(built.amount, 3n); assert.equal(built.summary.tokenDecimals, 0); assert.deepEqual(built.summary.recipients, [holder]);
  assert.equal(built.metadata?.beforeTotalIssued, '10'); assert.equal(built.metadata?.beforeHolderUnits, '10');
  await rejects(makeAdminAction({...request, params: {holderWallet: other, units: '3'}}, issuer), 'NOT_HOLDER');
  await rejects(makeAdminAction({...request, params: {holderWallet: holder, units: '0'}}, issuer), 'INVALID_TERMS');
  await rejects(makeAdminAction({...request, params: {holderWallet: holder, units: MAX_U64.toString()}}, issuer), 'AMOUNT_OVERFLOW');
  tokenAccount(await program.ata(holder, bond.bondMint), bond.bondMint, holder, 10n, 1);
  await rejects(makeAdminAction(request, issuer), 'INVALID_HOLDER');
});

test('issuance restores a closed registered ATA and accepts only an empty recreated account', async () => {
  const {bond, bondAddress} = await setup({totalIssued: 0n});
  const holderAta = await program.ata(holder, bond.bondMint);
  const request = {action: 'issue_units', bondAddress, params: {holderWallet: holder, units: '3'}};
  accounts.delete(holderAta);
  const missing = await makeAdminAction(request, issuer);
  assert.equal(missing.instructions.length, 2);
  assert.equal(missing.instructions[0].programAddress, ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  assert.equal(missing.instructions[0].accounts?.[1].address, holderAta);
  assert.equal(missing.metadata?.beforeHolderUnits, '0');
  assert.equal(missing.metadata?.beforeTotalIssued, '0');

  tokenAccount(holderAta, bond.bondMint, holder, 0n, 1);
  const recreated = await makeAdminAction(request, issuer);
  assert.equal(recreated.instructions.length, 1);
  assert.equal(recreated.metadata?.beforeHolderUnits, '0');
  tokenAccount(holderAta, bond.bondMint, holder, 1n, 1);
  await rejects(makeAdminAction(request, issuer), 'INVALID_HOLDER');
  tokenAccount(holderAta, bond.bondMint, other, 0n, 1);
  await rejects(makeAdminAction(request, issuer), 'INVALID_TOKEN_ACCOUNT');
  tokenAccount(holderAta, settlementMint, holder, 0n, 1);
  await rejects(makeAdminAction(request, issuer), 'INVALID_TOKEN_ACCOUNT');
  for (const override of [{delegate: other}, {closeAuthority: other}]) {
    store(holderAta, getTokenEncoder().encode({mint: bond.bondMint, owner: holder, amount: 0n, delegate: null, delegatedAmount: 0n, closeAuthority: null, isNative: null, state: 1, ...override}));
    await rejects(makeAdminAction(request, issuer), 'INVALID_TOKEN_ACCOUNT');
  }
});

test('issuance restores a lamport-funded system-owned canonical ATA but rejects malformed vacancies', async () => {
  const {bond, bondAddress} = await setup({totalIssued: 0n});
  const holderAta = await program.ata(holder, bond.bondMint);
  const request = {action: 'issue_units', bondAddress, params: {holderWallet: holder, units: '3'}};
  const vacant = {owner: program.SYSTEM, executable: false, data: ['', 'base64'] as [string, string], lamports: 1};
  accounts.set(holderAta, vacant);
  const restored = await makeAdminAction(request, issuer);
  assert.equal(restored.instructions.length, 2);
  assert.equal(restored.instructions[0].programAddress, ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  assert.equal(restored.instructions[0].accounts?.[1].address, holderAta);
  assert.equal(restored.metadata?.beforeHolderUnits, '0');

  for (const invalid of [
    {...vacant, data: ['AA==', 'base64']}, {...vacant, data: ['', 'base64+zstd']},
    {...vacant, data: ['', 'base64', 'extra']}, {...vacant, data: [null, 'base64']},
    {...vacant, data: ['']}, {...vacant, data: null}, {...vacant, data: ['#', 'base64']},
    {...vacant, executable: true}, {...vacant, executable: undefined}, {...vacant, owner: other},
    {...vacant, lamports: -1}, {...vacant, lamports: 1.5}, {...vacant, lamports: '1'},
    {...vacant, lamports: undefined}, {...vacant, lamports: Number.MAX_SAFE_INTEGER + 1}, {...vacant, space: 165},
  ]) {
    accounts.set(holderAta, invalid as unknown as SyntheticAccount);
    await rejects(makeAdminAction(request, issuer), 'INVALID_TOKEN_ACCOUNT');
  }

  // Registration uses the same optional canonical ATA validation.
  const newAta = await program.ata(other, bond.bondMint);
  accounts.set(newAta, {...vacant, lamports: 2});
  const registered = await makeAdminAction({action: 'register_holder', bondAddress, params: {holderWallet: other}}, issuer);
  assert.equal(registered.instructions[0].programAddress, ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  assert.equal(registered.instructions[0].accounts?.[1].address, newAta);
});

test('seal requires exact full reserve and matching mint supply/authority', async () => {
  const {bond, bondAddress} = await setup(), request = {action: 'seal_issue', bondAddress};
  const built = await makeAdminAction(request, issuer); assert.equal(built.metadata?.requiredReserveMinor, '10500000');
  tokenAccount(bond.vault, settlementMint, bondAddress, 10_500_000n, 2);
  await rejects(makeAdminAction(request, issuer), 'VAULT_FROZEN');
  tokenAccount(bond.vault, settlementMint, bondAddress, 10_499_999n, 1);
  await rejects(makeAdminAction(request, issuer), 'INSUFFICIENT_RESERVE');
  tokenAccount(bond.vault, settlementMint, bondAddress, 10_500_000n, 1);
  store(bond.bondMint, getMintEncoder().encode({mintAuthority: address(bondAddress), freezeAuthority: address(bondAddress), supply: 9n, decimals: 0, isInitialized: true}));
  await rejects(makeAdminAction(request, issuer), 'SUPPLY_MISMATCH');
  store(bond.bondMint, getMintEncoder().encode({mintAuthority: other, freezeAuthority: address(bondAddress), supply: 10n, decimals: 0, isInitialized: true}));
  await rejects(makeAdminAction(request, issuer), 'INVALID_MINT');
});

test('optional annual rate derives exact coupons and adds a signed creation memo without changing fixed schedules', async () => {
  await setup();
  const input = {...terms((++nextSeries).toString()), rateBps: '01000', couponFrequency: '02', coupons: [{recordTs: '200', paymentTs: '250'}]};
  const normalized = normalizeIssueTerms(input, now);
  assert.deepEqual(normalized.rateDescriptor, {rateBps: '1000', couponFrequency: '2', couponUnitMinor: '50000'});
  assert.equal(normalized.coupons[0].unitAmount, 50_000n);
  const built = await makeAdminAction({action: 'initialize_issue', params: input}, issuer);
  assert.equal(built.instructions.length, 2);
  assert.equal(String(built.instructions[1].programAddress), 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  assert.equal(built.instructions[1].accounts?.[0].address, issuer);
  assert.equal(built.instructions[1].accounts?.[0].role, 2);
  assert.equal(built.metadata?.rateBps, '1000'); assert.equal(built.metadata?.couponFrequency, '2');
  assert.equal(readCatalog(built.bondAddress), null, 'Unsigned preparation cannot create annual-rate provenance');
  const newBond = {...(await setup()).bond, seriesId: normalized.seriesId, bondMint: await program.derive('bond_mint', built.bondAddress), vault: await program.derive('vault', built.bondAddress), name: normalized.name, faceValue: normalized.faceValue, maturityTs: normalized.maturityTs, couponTerms: normalized.coupons};
  store(built.bondAddress, encodeBond(newBond), program.PROGRAM_ID);
  await rejects(finalizeAdminEffect({action: 'initialize_issue', wallet: issuer, bond: built.bondAddress, metadata: built.metadata}), 'RATE_EVIDENCE_PENDING');
  assert.equal(readCatalog(built.bondAddress), null, 'Terms require a successful exact signed receipt before projection');
  const irregular = {...terms(), coupons: [{recordTs: '200', paymentTs: '250', unitAmount: '50000'}, {recordTs: '300', paymentTs: '350', unitAmount: '25000'}]};
  assert.equal(normalizeIssueTerms(irregular, now).rateDescriptor, undefined);
});

test('confirmed creation reconciliation pins issuer, series, mint and complete immutable schedule', async () => {
  const {record} = await setup();
  const input = terms((++nextSeries).toString()), built = await makeAdminAction({action: 'initialize_issue', params: input}, issuer);
  assert.equal(readCatalog(built.bondAddress), null, 'Preparation must not persist metadata');
  const termsData = normalizeIssueTerms(input, now);
  const newBond = {...program.decodeBond(encodeBond((await setup()).bond)), issuer, seriesId: termsData.seriesId,
    bondMint: await program.derive('bond_mint', built.bondAddress), vault: await program.derive('vault', built.bondAddress),
    faceValue: termsData.faceValue, maturityTs: termsData.maturityTs, couponTerms: termsData.coupons, totalIssued: 0n, holderWallets: [], name: termsData.name};
  store(built.bondAddress, encodeBond(newBond), program.PROGRAM_ID);
  const effect = {action: 'initialize_issue', wallet: issuer, bond: built.bondAddress, metadata: built.metadata};
  await rejects(finalizeAdminEffect({...effect, wallet: other}), 'UNAUTHORIZED_ISSUER');
  await rejects(finalizeAdminEffect({...effect, metadata: {...built.metadata, seriesId: '999'}}), 'INSTRUMENT_MISMATCH');
  await rejects(finalizeAdminEffect({...effect, metadata: {...built.metadata, settlementMint: other}}), 'INSTRUMENT_MISMATCH');
  await rejects(finalizeAdminEffect({...effect, metadata: {...built.metadata, faceValueMinor: '1'}}), 'INSTRUMENT_MISMATCH');
  assert.equal(readCatalog(built.bondAddress), null);
  now = 500n; await finalizeAdminEffect(effect);
  assert.equal(readCatalog(built.bondAddress)?.seriesId, termsData.seriesId.toString());
  assert.equal(readCatalog(built.bondAddress)?.rateBps, 0); assert.equal(readCatalog(built.bondAddress)?.couponFrequency, 0);
  assert.notEqual(fixture()?.bond, built.bondAddress); assert.notEqual(record.bond, built.bondAddress);
});

test('reconciliation requires real chain effects and tolerates delayed recovery after later lifecycle actions', async () => {
  const {bond, bondAddress} = await setup();
  const built = await makeAdminAction({action: 'issue_units', bondAddress, params: {holderWallet: holder, units: '3'}}, issuer);
  const effect = {action: 'issue_units', wallet: issuer, bond: bondAddress, metadata: built.metadata};
  await rejects(finalizeAdminEffect(effect), 'CONFIRMED_EFFECT_MISSING');
  const later = {...bond, totalIssued: 13n, totalRedeemed: 13n, state: 3};
  store(bondAddress, encodeBond(later), program.PROGRAM_ID); accounts.delete(await program.ata(holder, bond.bondMint));
  await finalizeAdminEffect(effect); assert.equal(readCatalog(bondAddress)?.complete, true);
  const register = {action: 'register_holder', wallet: issuer, bond: bondAddress, metadata: {holderWallet: other, label: 'Synthetic holder'}};
  await rejects(finalizeAdminEffect(register), 'CONFIRMED_EFFECT_MISSING');
  store(bondAddress, encodeBond({...later, holderWallets: [holder, other]}), program.PROGRAM_ID);
  await finalizeAdminEffect(register); assert.equal(readCatalog(bondAddress)?.holderLabels?.[other], 'Synthetic holder');
  store(bondAddress, encodeBond(later), program.SYSTEM);
  await rejects(finalizeAdminEffect(effect), 'INVALID_ACCOUNT_OWNER');
});

test('awaited reconciliation preserves catalog effects committed by another request', async () => {
  const {bond, bondAddress} = await setup();
  const built = await makeAdminAction({action: 'issue_units', bondAddress, params: {holderWallet: holder, units: '3'}}, issuer);
  const issued = {...bond, totalIssued: 13n}, holderAta = await program.ata(holder, bond.bondMint);
  store(bondAddress, encodeBond(issued), program.PROGRAM_ID); tokenAccount(holderAta, bond.bondMint, holder, 13n);
  accountReadHook = key => {
    if (key !== holderAta) return;
    accountReadHook = () => {};
    store(bondAddress, encodeBond({...issued, state: 1}), program.PROGRAM_ID);
    saveCatalog({...readCatalog(bondAddress)!, proposalIds: ['7'], holderLabels: {[other]: 'Concurrent holder'}, complete: true});
  };
  await finalizeAdminEffect({action: 'issue_units', wallet: issuer, bond: bondAddress, metadata: built.metadata});
  assert.deepEqual(readCatalog(bondAddress)?.proposalIds, ['7']);
  assert.equal(readCatalog(bondAddress)?.holderLabels?.[other], 'Concurrent holder');
  assert.equal(readCatalog(bondAddress)?.complete, true);
});
