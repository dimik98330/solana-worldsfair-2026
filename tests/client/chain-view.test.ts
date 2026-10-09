import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {address, getAddressDecoder, getAddressEncoder,getProgramDerivedAddress} from '@solana/kit';
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
function encodeProposal(bond: string, id: bigint, yes = 0n, mask = 0) {
  const title = Buffer.from('Synthetic vote');
  return Buffer.concat([disc('Proposal'), pk(bond), u64(id), u32(title.length), title, i64(100n), i64(250n), u64(10n), u64(yes), u64(0n), u16(mask), u32(2), u64(8n), u64(2n), Buffer.from([255])]);
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
function discoveryResponse(b: Bank, slot: number) {
  return {context: {slot}, value: [...b.accounts].filter(([_key, account]) => {
    const bytes = Buffer.from(account.data[0], 'base64');
    return account.owner === program.PROGRAM_ID && bytes.subarray(0, 8).equals(disc('Proposal')) && bytes.subarray(8, 40).equals(pk(b.bondAddress));
  }).map(([pubkey, account]) => ({pubkey, account: {...account, data: [Buffer.from(account.data[0], 'base64').subarray(0, 48).toString('base64'), 'base64']}}))};
}
function mock(b: Bank, hook?: (method: string, params: any[], calls: number) => void) {
  let calls = 0; const requests: {method: string; params: any[]}[] = [];
  const readRpc: ReadRpc = async (method, params) => {
    requests.push({method, params}); hook?.(method, params, ++calls);
    if (method === 'getAccountInfo') return {context: {slot: Math.max(50, (params[1] as any).minContextSlot ?? 0)}, value: b.accounts.get(String(params[0])) ?? null};
    if (method === 'getProgramAccounts') return discoveryResponse(b, Math.max(50, (params[1] as any).minContextSlot));
    assert.equal(method, 'getMultipleAccounts');
    return {context: {slot: 51}, value: (params[0] as string[]).map(k => b.accounts.get(k) ?? null)};
  };
  return {readRpc, requests};
}
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code);

test('rate account joins the same bank and restores annual terms without local annual metadata', async () => {
  const b=await bank(),termsAddress=await program.deriveFinancialTerms(b.bondAddress);
  const [,bump]=await getProgramDerivedAddress({programAddress:address(program.PROGRAM_ID),seeds:[Buffer.from('financial_terms'),pk(b.bondAddress)]});
  const encoded=(nominal=1_000_000_000n,unitAmount=50_000_000n,accountBond=b.bondAddress,accountBump:number=bump)=>Buffer.concat([disc('FinancialTerms'),Buffer.from([1]),pk(accountBond),u64(nominal),u16(1000),Buffer.from([2]),u64(unitAmount),Buffer.from([accountBump])]);
  b.accounts.set(termsAddress,raw(encoded(),program.PROGRAM_ID));
  const m=mock(b),view=await readChainView(b.bondAddress,{readRpc:m.readRpc});
  assert.equal(view.financialTerms?.rateBps,1000);assert.equal(view.financialTerms?.couponFrequency,2);
  assert.ok(m.requests.find(r=>r.method==='getMultipleAccounts')!.params[0].includes(termsAddress));
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_input,init)=>{const request=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:request.id,result:await m.readRpc(request.method,request.params)});};
  try{const state=await(await import('../../server/state.ts')).getState(b.bondAddress);assert.equal(state.instrument.rateBasis,'on-chain-program-validated-rate-v1');assert.equal(state.instrument.rateBps,1000);assert.equal(state.instrument.couponFrequency,2);assert.equal(state.instrument.financialTerms.contextSlot,state.context.slot);}finally{globalThis.fetch=originalFetch;}
  for(const invalid of [encoded(2_000_000_000n,100_000_000n),encoded(1_000_000_000n,50_000_000n,receiver),encoded(1_000_000_000n,50_000_000n,b.bondAddress,bump^1)]){b.accounts.set(termsAddress,raw(invalid,program.PROGRAM_ID));await rejects(readChainView(b.bondAddress,{readRpc:mock(b).readRpc}),'INVALID_FINANCIAL_TERMS');}
  b.accounts.set(termsAddress,raw(encoded()));await rejects(readChainView(b.bondAddress,{readRpc:mock(b).readRpc}),'INVALID_ACCOUNT_OWNER');
});

test('financial graph is read in one confirmed context after discovery; all amounts come from the new bank', async () => {
  const b = await bank(), m = mock(b, (method) => { if (method === 'getMultipleAccounts') {b.accounts.set(b.holderAta, token(b.bond.bondMint, holder, 7n)); b.accounts.set(b.receiverAta, token(b.bond.bondMint, receiver, 3n));} });
  const view = await readChainView(b.bondAddress, {readRpc: m.readRpc});
  assert.equal(m.requests.length, 4); assert.equal(m.requests[2].params[1].minContextSlot, 50); assert.equal(m.requests[2].params[1].commitment, 'confirmed');
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
  assert.equal(m.requests.length, 4); assert.equal(state.supply.currentUnits, '0'); assert.equal(state.coupons[0].total.decimal, '500.000000');
  assert.equal(state.totals.cashPaid.decimal, '10500.000000'); assert.equal(state.totals.remainingObligations.baseUnits, '0');
});

test('maximum registry and schedule with optional financial terms fit one 63-account bank while excess catalog IDs are disclosed', async () => {
  const b = await bank(); b.bond.holderWallets = Array.from({length: 16}, (_, i) => key(20 + i));
  b.bond.maturityTs = 2000n; b.bond.couponTerms = Array.from({length: 8}, (_, i) => ({recordTs: BigInt(200 + i * 100), paymentTs: BigInt(250 + i * 100), unitAmount: 50_000_000n}));
  b.bond.totalIssued = 16n; b.accounts.set(b.bondAddress, raw(encodeBond(b.bond), program.PROGRAM_ID));
  b.accounts.set(b.bond.bondMint, raw(getMintEncoder().encode({mintAuthority: b.bondAddress, freezeAuthority: b.bondAddress, supply: 16n, decimals: 0, isInitialized: true})));
  b.accounts.set(b.bond.vault, token(settlementMint, b.bondAddress, 22_400_000_000n, 1));
  for (const wallet of b.bond.holderWallets) b.accounts.set(await program.ata(wallet, b.bond.bondMint), token(b.bond.bondMint, wallet, 1n));
  const ids = Array.from({length: 32}, (_, i) => String(i)), m = mock(b);
  const view = await readChainView(b.bondAddress, {readRpc: m.readRpc, proposalIds: () => ids});
  assert.equal(view.accountCount, 63); assert.equal(m.requests.length, 4); assert.equal(reconcile(view).supply.currentUnits, '16');
  assert.equal(view.missingProposalIds.length, 32);
  const overflow = await readChainView(b.bondAddress, {readRpc: mock(b).readRpc, proposalIds: () => [...ids, '32']});
  assert.equal(overflow.accountCount, 63); assert.deepEqual(overflow.proposalDiscovery.omittedCatalogIds, ['32']);
  assert.deepEqual(overflow.proposalDiscovery.catalogIdsAbsentAtDiscovery, [...ids, '32']);
});

test('registry change discards the entire first bank and retries discovery without mixing balances', async () => {
  const b = await bank(); let changed = false, calls = 0;
  const readRpc: ReadRpc = async (method, params) => {
    calls++;
    if (method === 'getAccountInfo') return {context: {slot: changed ? 51 : 50}, value: b.accounts.get(b.bondAddress)};
    if (method === 'getProgramAccounts') return discoveryResponse(b, (params[1] as any).minContextSlot);
    if (!changed) {
      changed = true; b.bond.holderWallets.push(key(5)); b.accounts.set(b.bondAddress, raw(encodeBond(b.bond), program.PROGRAM_ID));
      b.accounts.set(await program.ata(key(5), b.bond.bondMint), token(b.bond.bondMint, key(5), 0n));
    }
    return {context: {slot: 51}, value: (params[0] as string[]).map(k => b.accounts.get(k) ?? null)};
  };
  const view = await readChainView(b.bondAddress, {readRpc}); assert.equal(calls, 7); assert.equal(view.holders.length, 3); assert.equal(reconcile(view).status, 'verified');
});

test('continuously changing discovery is bounded at three attempts and yields a retryable failure', async () => {
  const b = await bank(); let calls = 0, context = 50;
  const readRpc: ReadRpc = async (method, params) => {
    calls++;
    if (method === 'getAccountInfo') return {context: {slot: context}, value: b.accounts.get(b.bondAddress)};
    if (method === 'getProgramAccounts') return discoveryResponse(b, (params[1] as any).minContextSlot);
    b.bond.holderWallets.reverse(); context++;
    b.accounts.set(b.bondAddress, raw(encodeBond(b.bond), program.PROGRAM_ID));
    return {context: {slot: context}, value: (params[0] as string[]).map(k => b.accounts.get(k) ?? null)};
  };
  await assert.rejects(readChainView(b.bondAddress, {readRpc}), (e: unknown) => e instanceof AppError && e.code === 'CHAIN_VIEW_CHANGED' && e.retryable);
  assert.equal(calls, 9);
});

test('proposal list races retry; genuinely missing proposal is explicitly identified and malformed account is rejected', async () => {
  const b = await bank(); let reads = 0;
  const m = mock(b); const readRpc: ReadRpc = async (method, params) => { const response = await m.readRpc(method, params); if (method === 'getAccountInfo') response.context.slot = reads ? 51 : 50; return response; };
  const view = await readChainView(b.bondAddress, {readRpc, proposalIds: () => ++reads === 1 ? [] : ['9']});
  assert.equal(m.requests.length, 8); assert.deepEqual(view.missingProposalIds, ['9']);
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
    assert.equal(state.slot, '51'); assert.equal(state.context.accountCount, 10); assert.equal(state.instrument.faceValueDecimal, '1000.000000');
    assert.equal(state.coupons[0].totalMinor, '500000000'); assert.equal(state.coupons[0].recordSlot, ''); assert.equal(state.coupons[0].capturedAt, null);
    assert.equal(state.coupons[0].basis, 'scheduled-forecast'); assert.equal(state.reconciliation.totals.remainingObligations.decimal, '10500.000000'); assert.equal(m.requests.length, 4);
  } finally { globalThis.fetch = originalFetch; }
});

test('uncatalogued proposals are discovered while all proposal values come only from the coherent bank', async () => {
  const b = await bank(), proposalAddress = await program.derive('proposal', b.bondAddress, 9n);
  b.accounts.set(proposalAddress, raw(encodeProposal(b.bondAddress, 9n), program.PROGRAM_ID));
  const m = mock(b, method => { if (method === 'getMultipleAccounts') b.accounts.set(proposalAddress, raw(encodeProposal(b.bondAddress, 9n, 8n, 1), program.PROGRAM_ID)); });
  const view = await readChainView(b.bondAddress, {readRpc: m.readRpc, proposalIds: () => ['10']});
  assert.deepEqual(view.proposals.map(p => [p.id, p.value.yesUnits]), [['9', 8n]]);
  assert.deepEqual(view.missingProposalIds, ['10']);
  assert.deepEqual(view.proposalDiscovery, {source: 'program-accounts', commitment: 'confirmed', scope: 'discovery-slot', contextSlot: 50, verificationContextSlot: 51, financialContextSlot: 51, discoveredIds: ['9'], catalogIds: ['10'], queriedIds: ['9', '10'], selection: 'lowest-proposal-id', discoveredCount: 1, selectedIds: ['9', '10'], selectedDiscoveredCount: 1, omittedDiscoveredCount: 0, omittedCatalogIds: [], catalogIdsAbsentAtDiscovery: ['10'], unverifiedPdaCount: 0, maxProposals: 32, completeAtFinancialContext: false});
  assert.equal(m.requests.filter(r => r.method === 'getMultipleAccounts').length, 1);
});

test('new proposal during read retries the whole bank; response order alone does not create a race', async () => {
  const b = await bank(), first = await program.derive('proposal', b.bondAddress, 1n), second = await program.derive('proposal', b.bondAddress, 2n);
  b.accounts.set(first, raw(encodeProposal(b.bondAddress, 1n), program.PROGRAM_ID));
  const m = mock(b, method => { if (method === 'getMultipleAccounts') b.accounts.set(second, raw(encodeProposal(b.bondAddress, 2n), program.PROGRAM_ID)); });
  let discoveries = 0;
  const view = await readChainView(b.bondAddress, {readRpc: async (method, params) => {
    const response = await m.readRpc(method, params);
    if (method === 'getProgramAccounts' && ++discoveries % 2 === 0) response.value.reverse();
    return response;
  }});
  assert.deepEqual(view.proposals.map(p => p.id), ['1', '2']);
  assert.equal(m.requests.filter(r => r.method === 'getMultipleAccounts').length, 2);
  assert.equal(view.proposalDiscovery.contextSlot, 51);
});

test('continuous proposal set changes and disappearance never expose a partial result', async () => {
  for (const disappears of [false, true]) {
    const b = await bank(); let count = 0;
    const known = await program.derive('proposal', b.bondAddress, 0n);
    b.accounts.set(known, raw(encodeProposal(b.bondAddress, 0n), program.PROGRAM_ID));
    const m = mock(b);
    await rejects(readChainView(b.bondAddress, {readRpc: async (method, params) => {
      if (method === 'getMultipleAccounts') {
        if (!disappears) { count++; b.accounts.set(await program.derive('proposal', b.bondAddress, BigInt(count)), raw(encodeProposal(b.bondAddress, BigInt(count)), program.PROGRAM_ID)); }
        const response = await m.readRpc(method, params);
        if (disappears) response.value[(params[0] as string[]).indexOf(known)] = null;
        return response;
      }
      return m.readRpc(method, params);
    }}), 'CHAIN_VIEW_CHANGED');
    assert.equal(m.requests.filter(r => r.method === 'getMultipleAccounts').length, 3);
  }
});

test('combined discovery overflow preserves cash state while substituted selected identity fails closed', async () => {
  const b = await bank(), proposalAddress = await program.derive('proposal', b.bondAddress, 99n);
  b.accounts.set(proposalAddress, raw(encodeProposal(b.bondAddress, 99n), program.PROGRAM_ID));
  const overflow = await readChainView(b.bondAddress, {readRpc: mock(b).readRpc, proposalIds: () => Array.from({length: 32}, (_, i) => String(i))});
  assert.equal(overflow.proposals.length, 0); assert.equal(overflow.proposalDiscovery.omittedDiscoveredCount, 1);
  assert.equal(overflow.proposalDiscovery.unverifiedPdaCount, 1); assert.equal(reconcile(overflow).totals.remainingObligations.baseUnits, '10500000000');
  const m = mock(b);
  await rejects(readChainView(b.bondAddress, {readRpc: async (method, params) => {
    const response = await m.readRpc(method, params);
    if (method === 'getMultipleAccounts') response.value[(params[0] as string[]).indexOf(proposalAddress)] = raw(encodeProposal(b.bondAddress, 98n), program.PROGRAM_ID);
    return response;
  }}), 'INVALID_PROGRAM_ACCOUNT');
});

test('more than 32 valid on-chain proposals retain a bounded financial graph and explicit omitted scope', async () => {
  const b = await bank();
  for (let id = 0n; id < 40n; id++) b.accounts.set(await program.derive('proposal', b.bondAddress, id), raw(encodeProposal(b.bondAddress, id), program.PROGRAM_ID));
  const m = mock(b);
  const view = await readChainView(b.bondAddress, {readRpc: m.readRpc, proposalIds: () => ['0', '38', '100']});
  assert.equal(view.accountCount, 42); assert.equal(view.proposals.length, 32);
  assert.deepEqual(view.proposals.map(p => p.id), Array.from({length: 32}, (_, i) => String(i)));
  assert.equal(view.proposalDiscovery.discoveredCount, 40); assert.equal(view.proposalDiscovery.selectedDiscoveredCount, 32);
  assert.equal(view.proposalDiscovery.omittedDiscoveredCount, 8); assert.equal(view.proposalDiscovery.unverifiedPdaCount, 8);
  assert.deepEqual(view.proposalDiscovery.omittedCatalogIds, ['38', '100']);
  assert.deepEqual(view.proposalDiscovery.catalogIdsAbsentAtDiscovery, ['100']);
  assert.deepEqual(view.missingProposalIds, []); assert.equal(view.proposalDiscovery.completeAtFinancialContext, false);
  const financial = reconcile(view);
  assert.equal(financial.supply.currentUnits, '10'); assert.equal(financial.totals.remainingObligations.baseUnits, '10500000000');
  assert.equal(financial.catalogProposalsResolved, false);
  assert.equal(m.requests.filter(r => r.method === 'getMultipleAccounts').length, 1);
  const resolved = await readChainView(b.bondAddress, {readRpc: mock(b).readRpc, proposalIds: () => ['0', '1']});
  assert.equal(reconcile(resolved).catalogProposalsResolved, true);
});

test('changes outside the selected window still retry against the entire discovery set fingerprint', async () => {
  const b = await bank();
  for (let id = 0n; id < 33n; id++) b.accounts.set(await program.derive('proposal', b.bondAddress, id), raw(encodeProposal(b.bondAddress, id), program.PROGRAM_ID));
  const high = await program.derive('proposal', b.bondAddress, 99n);
  const m = mock(b, method => { if (method === 'getMultipleAccounts') b.accounts.set(high, raw(encodeProposal(b.bondAddress, 99n), program.PROGRAM_ID)); });
  const view = await readChainView(b.bondAddress, {readRpc: m.readRpc});
  assert.equal(view.proposals.length, 32); assert.equal(view.proposalDiscovery.discoveredCount, 34);
  assert.equal(view.proposalDiscovery.omittedDiscoveredCount, 2);
  assert.equal(m.requests.filter(r => r.method === 'getMultipleAccounts').length, 2);
});

test('proposal discovery failure is surfaced without catalog-only fallback or financial read', async () => {
  const b = await bank(), m = mock(b), failure = new AppError('RPC_ERROR', 'Provider disabled program scan', 503, true);
  await assert.rejects(readChainView(b.bondAddress, {readRpc: (method, params) => method === 'getProgramAccounts' ? Promise.reject(failure) : m.readRpc(method, params)}), error => error === failure);
  assert.equal(m.requests.length, 1);
});

test('each read enforces the previous discovery bank as a lower bound without claiming later-bank completeness', async () => {
  const b = await bank(), m = mock(b); let scans = 0;
  const readRpc: ReadRpc = async (method, params) => {
    const response = await m.readRpc(method, params);
    if (method === 'getProgramAccounts') response.context.slot = ++scans === 1 ? 55 : 57;
    if (method === 'getMultipleAccounts') response.context.slot = 56;
    return response;
  };
  const view = await readChainView(b.bondAddress, {readRpc});
  assert.deepEqual(m.requests.slice(1).map(r => r.params[1].minContextSlot), [50, 55, 56]);
  assert.equal(view.contextSlot, 56); assert.equal(view.proposalDiscovery.contextSlot, 55);
  assert.equal(view.proposalDiscovery.verificationContextSlot, 57); assert.equal(view.proposalDiscovery.completeAtFinancialContext, false);
  for (const staleMethod of ['getMultipleAccounts', 'verification']) {
    scans = 0;
    await rejects(readChainView(b.bondAddress, {readRpc: async (method, params) => {
      const response = await readRpc(method, params);
      if (method === staleMethod || (staleMethod === 'verification' && method === 'getProgramAccounts' && scans === 2)) response.context.slot = 54;
      return response;
    }}), 'RPC_INVALID');
  }
});
