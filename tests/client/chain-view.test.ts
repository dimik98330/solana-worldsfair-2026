import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {address, getAddressDecoder, getAddressEncoder} from '@solana/kit';
import {getMintEncoder, getTokenEncoder, TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import * as program from '../../packages/client/src/program.ts';
import type {Bond, RpcAccount, ReadRpc} from '../../server/chain-view.ts';

// Synthetic RPC banks, isolated metadata: never fetch live accounts or alter recorded demo data.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/chain-view-' + crypto.randomUUID());
const [{CLOCK_ADDRESS, readChainView}, {reconcile}, {AppError}] = await Promise.all([import('../../server/chain-view.ts'), import('../../server/reconciliation.ts'), import('../../server/rpc.ts')]);
const key = (id: number) => getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i === 0 ? id : 19));
const issuer = key(1), holder = key(2), receiver = key(3), settlementMint = key(4);
const u64 = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(v); return b; };
const i64 = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigInt64LE(v); return b; };
const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const pk = (v: string) => Buffer.from(getAddressEncoder().encode(address(v)));
const disc = (name: string) => createHash('sha256').update('account:' + name).digest().subarray(0, 8);
function encodeBond(b: Bond) {
  const name = Buffer.from(b.name);
  return Buffer.concat([disc('Bond'), ...[b.issuer, b.bondMint, b.settlementMint, b.vault].map(pk), u64(b.seriesId), u32(name.length), name, u64(b.faceValue), i64(b.maturityTs), u64(b.totalIssued), u64(b.totalRedeemed), Buffer.from([b.state, b.bump, b.nextCouponIndex]), u16(b.principalClaimedMask), u32(b.holderWallets.length), ...b.holderWallets.map(pk), u32(b.couponTerms.length), ...b.couponTerms.flatMap(c => [i64(c.recordTs), i64(c.paymentTs), u64(c.unitAmount)]), u32(b.redemptionUnits.length), ...b.redemptionUnits.map(u64)]);
}
function encodeCoupon(bond: string, terms: Bond['couponTerms'][number], units: bigint[], paid: bigint, mask: number) {
  return Buffer.concat([disc('Coupon'), pk(bond), Buffer.from([0]), i64(terms.recordTs), i64(terms.paymentTs), u64(terms.unitAmount), i64(210n), u64(10n), u16(mask), u64(paid), u32(units.length), ...units.map(u64), Buffer.from([255])]);
}
function raw(bytes: ArrayLike<number>, owner: string = TOKEN_PROGRAM_ADDRESS): RpcAccount { return {owner, executable: false, data: [Buffer.from(Array.from(bytes)).toString('base64'), 'base64']}; }
function token(mint: string, owner: string, amount: bigint, state = 2, delegate: string | null = null, closeAuthority: string | null = null) { return raw(getTokenEncoder().encode({mint: address(mint), owner: address(owner), amount, state, delegate: delegate ? address(delegate) : null, closeAuthority: closeAuthority ? address(closeAuthority) : null, delegatedAmount: 0n, isNative: null})); }
async function bank() {
  const bondAddress = await program.deriveBond(issuer, 1n), mint = await program.derive('bond_mint', bondAddress), vault = await program.derive('vault', bondAddress);
  const bond: Bond = {issuer, bondMint: mint, settlementMint, vault, seriesId: 1n, name: 'Synthetic coherent issue', faceValue: 1_000_000_000n, maturityTs: 400n, totalIssued: 10n, totalRedeemed: 0n, state: 1, bump: 255, nextCouponIndex: 0, principalClaimedMask: 0, holderWallets: [holder, receiver], couponTerms: [{recordTs: 200n, paymentTs: 300n, unitAmount: 50_000_000n}], redemptionUnits: []};
  const accounts = new Map<string, RpcAccount>();
  accounts.set(bondAddress, raw(encodeBond(bond), program.PROGRAM_ID));
  const clock = Buffer.alloc(40); clock.writeBigUInt64LE(51n, 0); clock.writeBigInt64LE(150n, 32);
  accounts.set(CLOCK_ADDRESS, raw(clock, 'Sysvar1111111111111111111111111111111111111'));
  accounts.set(mint, raw(getMintEncoder().encode({mintAuthority: bondAddress, freezeAuthority: bondAddress, supply: 10n, decimals: 0, isInitialized: true})));
  accounts.set(settlementMint, raw(getMintEncoder().encode({mintAuthority: issuer, freezeAuthority: null, supply: 20_000_000_000n, decimals: 6, isInitialized: true})));
  accounts.set(vault, token(settlementMint, bondAddress, 10_500_000_000n, 1));
  const holderAta = await program.ata(holder, mint), receiverAta = await program.ata(receiver, mint);
  accounts.set(holderAta, token(mint, holder, 8n)); accounts.set(receiverAta, token(mint, receiver, 2n));
  return {bondAddress, bond, accounts, holderAta, receiverAta};
}
type Bank = Awaited<ReturnType<typeof bank>>;
function mock(b: Bank, hook?: (method: string, params: any[], calls: number) => void) {
  let calls = 0; const requests: {method: string; params: any[]}[] = [];
  const readRpc: ReadRpc = async (method, params) => {
    requests.push({method, params}); hook?.(method, params, ++calls);
    if (method === 'getAccountInfo') return {context: {slot: 50}, value: b.accounts.get(String(params[0])) ?? null};
    assert.equal(method, 'getMultipleAccounts');
    return {context: {slot: 51}, value: (params[0] as string[]).map(k => b.accounts.get(k) ?? null)};
  };
  return {readRpc, requests};
}
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code);

test('financial graph is read in one confirmed context after discovery; all amounts come from the new bank', async () => {
  const b = await bank(), m = mock(b, (method) => { if (method === 'getMultipleAccounts') {b.accounts.set(b.holderAta, token(b.bond.bondMint, holder, 7n)); b.accounts.set(b.receiverAta, token(b.bond.bondMint, receiver, 3n));} });
  const view = await readChainView(b.bondAddress, {readRpc: m.readRpc});
  assert.equal(m.requests.length, 2); assert.equal(m.requests[1].params[1].minContextSlot, 50); assert.equal(m.requests[1].params[1].commitment, 'confirmed');
  assert.equal(view.contextSlot, 51); assert.deepEqual(view.holders.map(h => h.amount), [7n, 3n]);
  assert.equal(reconcile(view).supply.currentUnits, '10'); assert.equal(view.issuerSettlement.closed, true);
});

test('redemption during discovery exposes only the fully paid and burned bank, with historical coupon rights preserved', async () => {
  const b = await bank();
  const m = mock(b, (method) => {
    if (method !== 'getMultipleAccounts') return;
    b.bond.state = 3; b.bond.nextCouponIndex = 1; b.bond.totalRedeemed = 10n; b.bond.principalClaimedMask = 3; b.bond.redemptionUnits = [8n, 2n];
    b.accounts.set(b.bondAddress, raw(encodeBond(b.bond), program.PROGRAM_ID));
    b.accounts.set(b.bond.bondMint, raw(getMintEncoder().encode({mintAuthority: b.bondAddress, freezeAuthority: b.bondAddress, supply: 0n, decimals: 0, isInitialized: true})));
    b.accounts.set(b.holderAta, token(b.bond.bondMint, holder, 0n)); b.accounts.set(b.receiverAta, token(b.bond.bondMint, receiver, 0n));
    b.accounts.set(b.bond.vault, token(settlementMint, b.bondAddress, 0n, 1));
    const clock = Buffer.alloc(40); clock.writeBigUInt64LE(51n, 0); clock.writeBigInt64LE(400n, 32);
    b.accounts.set(CLOCK_ADDRESS, raw(clock, 'Sysvar1111111111111111111111111111111111111'));
  });
  b.accounts.set(await program.derive('coupon', b.bondAddress, 0), raw(encodeCoupon(b.bondAddress, b.bond.couponTerms[0], [10n, 0n], 500_000_000n, 1), program.PROGRAM_ID));
  const state = reconcile(await readChainView(b.bondAddress, {readRpc: m.readRpc}));
  assert.equal(m.requests.length, 2); assert.equal(state.supply.currentUnits, '0'); assert.equal(state.coupons[0].total.decimal, '500.000000');
  assert.equal(state.totals.cashPaid.decimal, '10500.000000'); assert.equal(state.totals.remainingObligations.baseUnits, '0');
});

test('maximum registry, schedule and catalog fit one 62-account bank; proposal capacity rejects excess', async () => {
  const b = await bank(); b.bond.holderWallets = Array.from({length: 16}, (_, i) => key(20 + i));
  b.bond.maturityTs = 2000n; b.bond.couponTerms = Array.from({length: 8}, (_, i) => ({recordTs: BigInt(200 + i * 100), paymentTs: BigInt(250 + i * 100), unitAmount: 50_000_000n}));
  b.bond.totalIssued = 16n; b.accounts.set(b.bondAddress, raw(encodeBond(b.bond), program.PROGRAM_ID));
  b.accounts.set(b.bond.bondMint, raw(getMintEncoder().encode({mintAuthority: b.bondAddress, freezeAuthority: b.bondAddress, supply: 16n, decimals: 0, isInitialized: true})));
  b.accounts.set(b.bond.vault, token(settlementMint, b.bondAddress, 22_400_000_000n, 1));
  for (const wallet of b.bond.holderWallets) b.accounts.set(await program.ata(wallet, b.bond.bondMint), token(b.bond.bondMint, wallet, 1n));
  const ids = Array.from({length: 32}, (_, i) => String(i)), m = mock(b);
  const view = await readChainView(b.bondAddress, {readRpc: m.readRpc, proposalIds: () => ids});
  assert.equal(view.accountCount, 62); assert.equal(m.requests.length, 2); assert.equal(reconcile(view).supply.currentUnits, '16');
  assert.equal(view.missingProposalIds.length, 32);
  await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc, proposalIds: () => [...ids, '32']}), 'INVALID_CATALOG');
});

test('registry change discards the entire first bank and retries discovery without mixing balances', async () => {
  const b = await bank(); let changed = false, calls = 0;
  const readRpc: ReadRpc = async (method, params) => {
    calls++;
    if (method === 'getAccountInfo') return {context: {slot: changed ? 51 : 50}, value: b.accounts.get(b.bondAddress)};
    if (!changed) {
      changed = true; b.bond.holderWallets.push(key(5)); b.accounts.set(b.bondAddress, raw(encodeBond(b.bond), program.PROGRAM_ID));
      b.accounts.set(await program.ata(key(5), b.bond.bondMint), token(b.bond.bondMint, key(5), 0n));
    }
    return {context: {slot: 51}, value: (params[0] as string[]).map(k => b.accounts.get(k) ?? null)};
  };
  const view = await readChainView(b.bondAddress, {readRpc}); assert.equal(calls, 4); assert.equal(view.holders.length, 3); assert.equal(reconcile(view).status, 'verified');
});

test('continuously changing discovery is bounded at three attempts and yields a retryable failure', async () => {
  const b = await bank(); let calls = 0, context = 50;
  const readRpc: ReadRpc = async (method, params) => {
    calls++;
    if (method === 'getAccountInfo') return {context: {slot: context}, value: b.accounts.get(b.bondAddress)};
    b.bond.holderWallets.reverse(); context++;
    b.accounts.set(b.bondAddress, raw(encodeBond(b.bond), program.PROGRAM_ID));
    return {context: {slot: context}, value: (params[0] as string[]).map(k => b.accounts.get(k) ?? null)};
  };
  await assert.rejects(readChainView(b.bondAddress, {readRpc}), (e: unknown) => e instanceof AppError && e.code === 'CHAIN_VIEW_CHANGED' && e.retryable);
  assert.equal(calls, 6);
});

test('proposal list races retry; genuinely missing proposal is explicitly identified and malformed account is rejected', async () => {
  const b = await bank(); let reads = 0;
  const m = mock(b); const readRpc: ReadRpc = async (method, params) => { const response = await m.readRpc(method, params); if (method === 'getAccountInfo') response.context.slot = reads ? 51 : 50; return response; };
  const view = await readChainView(b.bondAddress, {readRpc, proposalIds: () => ++reads === 1 ? [] : ['9']});
  assert.equal(m.requests.length, 4); assert.deepEqual(view.missingProposalIds, ['9']);
  b.accounts.set(await program.derive('proposal', b.bondAddress, 9n), raw(Buffer.alloc(100), program.PROGRAM_ID));
  await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc, proposalIds: () => ['9']}), 'INVALID_PROGRAM_ACCOUNT');
});

test('required accounts, truncated responses, RPC context regression and owner substitutions fail closed', async () => {
  for (const missing of ['bondMint', 'settlementMint', 'vault'] as const) { const b = await bank(); b.accounts.delete(b.bond[missing]); await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc}), 'MISSING_REQUIRED_ACCOUNT'); }
  const b = await bank(), m = mock(b);
  await rejects(readChainView(b.bondAddress, {readRpc: async (method, params) => {const response = await m.readRpc(method, params); if (method === 'getMultipleAccounts') response.value.pop(); return response;} }), 'RPC_INVALID');
  await rejects(readChainView(b.bondAddress, {readRpc: async (method, params) => {const response = await m.readRpc(method, params); if (method === 'getMultipleAccounts') response.context.slot = 49; return response;} }), 'RPC_INVALID');
  b.accounts.set(b.bond.vault, token(settlementMint, issuer, 10_500_000_000n, 1));
  await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc}), 'WRONG_TOKEN_AUTHORITY');
});

test('positive token accounts enforce owner/mint/authorities; zero canonical ATA exceptions mirror the program', async () => {
  const b = await bank(); b.accounts.set(b.receiverAta, token(b.bond.bondMint, issuer, 0n, 1, issuer, issuer));
  b.accounts.set(b.holderAta, token(b.bond.bondMint, holder, 10n));
  assert.equal(reconcile(await readChainView(b.bondAddress, {readRpc: mock(b).readRpc})).status, 'verified');
  b.accounts.delete(b.receiverAta); assert.equal((await readChainView(b.bondAddress, {readRpc: mock(b).readRpc})).holders[1].closed, true);
  b.accounts.set(b.holderAta, token(b.bond.bondMint, issuer, 10n)); await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc}), 'WRONG_TOKEN_AUTHORITY');
  b.accounts.set(b.holderAta, token(b.bond.bondMint, holder, 10n, 2, issuer)); await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc}), 'UNSAFE_TOKEN_AUTHORITY');
  b.accounts.set(b.holderAta, token(settlementMint, holder, 10n)); await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc}), 'WRONG_TOKEN_MINT');
});

test('Clock, mint decimals/authority and captured coupon availability are checked before exposing a financial state', async () => {
  const b = await bank(); b.accounts.set(CLOCK_ADDRESS, raw(Buffer.alloc(40), program.SYSTEM)); await rejects(readChainView(b.bondAddress, {readRpc: mock(b).readRpc}), 'INVALID_ACCOUNT_OWNER');
  const good = await bank(); good.accounts.set(good.bond.bondMint, raw(getMintEncoder().encode({mintAuthority: issuer, freezeAuthority: issuer, supply: 10n, decimals: 0, isInitialized: true}))); await rejects(readChainView(good.bondAddress, {readRpc: mock(good).readRpc}), 'INVALID_MINT_AUTHORITY');
  const captured = await bank(); captured.bond.nextCouponIndex = 1; captured.accounts.set(captured.bondAddress, raw(encodeBond(captured.bond), program.PROGRAM_ID)); await rejects(readChainView(captured.bondAddress, {readRpc: mock(captured).readRpc}), 'MISSING_REQUIRED_ACCOUNT');
});

test('getState retains GUI fields, exposes exact context/reconciliation and never invents a captured slot', async () => {
  const b = await bank(), m = mock(b), originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { const request = JSON.parse(String(init?.body)); return Response.json({jsonrpc: '2.0', id: request.id, result: await m.readRpc(request.method, request.params)}); };
  try {
    const {getState} = await import('../../server/state.ts'), state = await getState(b.bondAddress);
    assert.equal(state.slot, '51'); assert.equal(state.context.accountCount, 9); assert.equal(state.instrument.faceValueDecimal, '1000.000000');
    assert.equal(state.coupons[0].totalMinor, '500000000'); assert.equal(state.coupons[0].recordSlot, ''); assert.equal(state.coupons[0].capturedAt, null);
    assert.equal(state.coupons[0].basis, 'scheduled-forecast'); assert.equal(state.reconciliation.totals.remainingObligations.decimal, '10500.000000'); assert.equal(m.requests.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
