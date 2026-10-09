import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {getAddressDecoder, getBase58Decoder} from '@solana/kit';
import {getMintDecoder, getMintEncoder} from '@solana-program/token';
import * as program from '../../packages/client/src/program.ts';
import type {ChainView} from '../../server/chain-view.ts';
import type {ProgramIdentity} from '../../server/program-identity.ts';
import type {CouponRunDependencies} from '../../server/coupon-run.ts';

process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/coupon-run-' + crypto.randomUUID());
const [{createCouponRunExecutor}, operations, {journalWrite, journalValues}, {closeStorage}, {normalizeRequest}, {AppError}] = await Promise.all([
  import('../../server/coupon-run.ts'), import('../../server/operations.ts'), import('../../server/journal.ts'), import('../../server/storage.ts'), import('../../server/request-contract.ts'), import('../../server/rpc.ts'),
]);
after(closeStorage);
const key = (id: number) => getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i === 0 ? id : 13));
const code = (name: string) => (error: unknown) => error instanceof AppError && error.code === name;
type Mode = 'confirm' | 'crash-before-sign' | 'crash-after-persist' | 'send-loss' | 'pending' | 'projection-pending' | 'definitive-error';
let sequence = 0;
async function fixture(count = 6) {
  const issuer = key(1), mint = key(2), registry = Array.from({length: count}, (_, i) => key(10 + i));
  const series = BigInt(++sequence), bond = await program.deriveBond(issuer, series), bondMint = await program.derive('bond_mint', bond), vault = await program.derive('vault', bond), couponAddress = await program.derive('coupon', bond, 0);
  const mintValue = (supply: bigint, decimals: number, authority: string) => getMintDecoder().decode(getMintEncoder().encode({mintAuthority: authority as any, freezeAuthority: authority as any, supply, decimals, isInitialized: true}));
  const supply = BigInt(count), view: ChainView = {address: bond, contextSlot: 100, accountCount: 12, clock: {slot: 100n, timestamp: 250n},
    bond: {issuer, bondMint, settlementMint: mint, vault, seriesId: series, name: 'Synthetic coupon run', faceValue: 1000n, maturityTs: 300n, totalIssued: supply, totalRedeemed: 0n, state: 1, bump: 255, nextCouponIndex: 1, principalClaimedMask: 0, holderWallets: registry, couponTerms: [{recordTs: 100n, paymentTs: 200n, unitAmount: 50n}], redemptionUnits: []},
    bondMint: mintValue(supply, 0, bond), settlementMint: mintValue(1_000_000n, 6, issuer),
    holders: await Promise.all(registry.map(async owner => ({address: await program.ata(owner, bondMint), owner, mint: bondMint, amount: 1n, state: 2, closed: false}))),
    vault: {address: vault, owner: bond, mint, amount: supply * 1050n, state: 1, closed: false},
    issuerSettlement: {address: await program.ata(issuer, mint), owner: issuer, mint, amount: 1000n, state: 1, closed: false},
    coupons: [{bond, index: 0, recordTs: 100n, paymentTs: 200n, capturedAt: 110n, unitAmount: 50n, totalUnits: supply, units: registry.map(() => 1n), claimedMask: 0, paidTotal: 0n, bump: 255}], couponAddresses: [couponAddress], proposals: [], missingProposalIds: [],
    proposalDiscovery: {source: 'program-accounts', commitment: 'confirmed', scope: 'discovery-slot', contextSlot: 100, verificationContextSlot: 100, financialContextSlot: 100,
      discoveredIds: [], catalogIds: [], queriedIds: [], selection: 'lowest-proposal-id', discoveredCount: 0, selectedIds: [], selectedDiscoveredCount: 0, omittedDiscoveredCount: 0,
      omittedCatalogIds: [], catalogIdsAbsentAtDiscovery: [], unverifiedPdaCount: 0, maxProposals: 32, completeAtFinancialContext: false}};
  let mode: Mode = 'confirm', genesis = String(key(4)), verifies = 0, sends = 0, invocations = 0;
  let verificationError = false, beforeSend: (() => Promise<void>) | undefined, viewHook: (() => void) | undefined;
  const receipts = new Map<string, {status: string; projectionStatus: string}>();
  const actions: string[] = [], id = 'coupon-run-' + crypto.randomUUID();
  const release = {schemaVersion: 1 as const, programId: program.PROGRAM_ID, loader: 'BPFLoaderUpgradeable' as const, programLen: 100, sha256: 'a'.repeat(64)};
  const identity = (): ProgramIdentity => ({signingAllowed: true, status: 'known-match', genesisHash: genesis, programId: program.PROGRAM_ID, expected: {...release},
    code: 'PROGRAM_MATCH', message: 'Synthetic verified bytecode', network: 'localnet', rpcUrl: 'synthetic', loaderAddress: key(6), contextSlot: 100,
    observedAt: '2026-10-08T00:00:00.000Z', observed: null, verification: {commitment: 'confirmed', scope: 'rpc-observed-deployed-bytecode', method: 'full-payload', payloadContextSlot: 100, headerContextSlot: 100, sourceToBinaryAttested: false}});
  function pay(wallets: string[]) {
    for (const wallet of wallets) {
      const i = registry.indexOf(wallet as any), coupon = view.coupons[0]!;
      assert.ok(i >= 0); if ((coupon.claimedMask & (1 << i)) !== 0) continue;
      coupon.claimedMask |= 1 << i; coupon.paidTotal += 50n; view.vault.amount -= 50n;
    }
    view.contextSlot++;
  }
  const recover: CouponRunDependencies['operationStatus'] = async childId => {
    const child = operations.findOperation(childId)!;
    const observed = receipts.get(childId) ?? {status: 'unknown', projectionStatus: 'pending'};
    operations.updateOperation(childId, {status: observed.status, chainStatus: observed.status, projectionStatus: observed.projectionStatus as 'pending' | 'complete'});
    return {...observed, signature: child.signature};
  };
  const deps: CouponRunDependencies = {network: 'localnet', demoEnabled: true, readView: async () => { viewHook?.(); return structuredClone(view); }, readGenesis: async () => genesis,
    verifyProgram: async () => { verifies++; if (verificationError) throw new Error('Synthetic release RPC failure'); return identity(); },
    fixture: () => ({complete: true, roles: {issuer}} as any), operationStatus: recover,
    demoAction: async (input, policy) => {
      invocations++; const normalized = normalizeRequest(input), childId = normalized.operationId!;
      const parent = journalValues<import('../../server/operations.ts').Operation>('operations').find(o => o.action === 'coupon_run' && (o.metadata?.plan as any)?.childOperationIds.includes(childId));
      assert.ok(parent?.metadata?.plan, 'The immutable parent plan must already be durable before the sender is called');
      const planned = parent.metadata.plan as import('../../server/coupon-run.ts').CouponRunPlan;
      assert.deepEqual(policy.requiredProgramRelease,{programId:planned.programId,sha256:planned.releaseSha256,genesisHash:planned.genesisHash});
      assert.equal(planned.operationId, parent.id);
      assert.deepEqual([...planned.groups[planned.childOperationIds.indexOf(childId)].holderWallets].sort(), normalized.params.holderWallets);
      const claim = operations.claimDemoOperation(childId, 'settle_coupon', 'issuer', normalized.params);
      if (!claim.claimed) return operations.findOperation(childId);
      actions.push(childId);
      if (mode === 'crash-before-sign') throw new Error('Synthetic process crash after lease, before signing');
      const bytes = Buffer.alloc(64); createHash('sha256').update(childId).digest().copy(bytes); bytes[63] = 1;
      const signature = getBase58Decoder().decode(bytes);
      operations.updateOperation(childId, {signature, status: 'pending', chainStatus: 'pending', projectionStatus: 'pending', wallet: issuer, bond,programRelease:{...policy.requiredProgramRelease}});
      receipts.set(childId, {status: 'unknown', projectionStatus: 'pending'});
      if (mode === 'crash-after-persist') throw new Error('Synthetic process crash before send');
      await beforeSend?.(); sends++;
      if (mode === 'definitive-error') { receipts.set(childId, {status: 'error', projectionStatus: 'complete'}); throw new Error('Synthetic definitive atomic rejection'); }
      if (mode === 'pending') { receipts.set(childId, {status: 'pending', projectionStatus: 'pending'}); return {status: 'pending'}; }
      pay(normalized.params.holderWallets as string[]);
      if (mode === 'send-loss') throw new Error('Synthetic response loss after acceptance');
      receipts.set(childId, {status: 'confirmed', projectionStatus: mode === 'projection-pending' ? 'pending' : 'complete'});
      return {status: 'confirmed', signature};
    }};
  const executor = createCouponRunExecutor(deps), input = {operationId: id, bondAddress: bond, couponId: '0'};
  function confirm(childId: string) { const c = operations.findOperation(childId)!; pay(c.params!.holderWallets as string[]); receipts.set(childId, {status: 'confirmed', projectionStatus: 'complete'}); }
  return {executor, deps, input, view, registry, release, receipts, pay, confirm, actions, identity,
    setMode: (value: Mode) => { mode = value; }, setGenesis: (value: string) => { genesis = value; }, setVerifyError: (value: boolean) => { verificationError = value; },
    setBeforeSend: (value: typeof beforeSend) => { beforeSend = value; }, setViewHook: (value: typeof viewHook) => { viewHook = value; },
    counts: () => ({sends, invocations, verifies})};
}

test('whole coupon completes fixed groups once and same-parent replay creates no additional signature', async () => {
  const f = await fixture(9), result = await f.executor.runCouponSettlement(f.input);
  assert.equal(result.status, 'completed'); assert.equal(result.totalGroups, 3); assert.equal(result.completedGroups, 3);
  assert.equal(result.desiredRightsPaid, true); assert.equal(result.signature, null); assert.equal(f.counts().sends, 3);
  assert.deepEqual(result.plan.groups.map(g => g.holderWallets.length), [4, 4, 1]);
  assert.equal(result.plan.budget.maxRunSolDebitLamports, '39000000');
  const replay = await f.executor.runCouponSettlement(f.input);
  assert.deepEqual(replay.plan, result.plan); assert.equal(f.counts().sends, 3);
  await assert.rejects(() => f.executor.runCouponSettlement({...f.input, couponId: '1'}), code('OPERATION_CONFLICT'));
});

test('sixteen recipients have a fixed four-transaction safety ceiling and no unplanned sender calls', async () => {
  const f = await fixture(16), result = await f.executor.runCouponSettlement(f.input);
  assert.equal(result.status, 'completed'); assert.equal(result.plan.groups.length, 4); assert.equal(f.counts().sends, 4);
  assert.equal(result.plan.budget.maxTransactions, 4); assert.equal(result.plan.budget.maxRunSolDebitLamports, '52000000');
  assert.equal(result.plan.groups.flatMap(g => g.holderWallets).length, 16);
  assert.equal(new Set(result.plan.childOperationIds).size, 4);
});
test('a retained child from another release is not accepted as completion or permission to send another group',async()=>{
 const f=await fixture(6),first=await f.executor.runCouponSettlement({...f.input,maxBatches:1});
 const child=operations.findOperation(first.plan.childOperationIds[0])!;
 operations.updateOperation(child.id,{programRelease:{...child.programRelease!,sha256:'b'.repeat(64)}});
 const status=await f.executor.couponRunStatus(first.operationId);assert.equal(status.status,'unknown');assert.equal(status.error?.code,'PLAN_RELEASE_MISMATCH');
 const before=f.counts().sends;const replay=await f.executor.runCouponSettlement(f.input);assert.equal(replay.status,'unknown');assert.equal(f.counts().sends,before);
});

test('a per-call batch cap allows same-plan resume without changing beneficiaries, child IDs or first signature', async () => {
  const f = await fixture(6);
  const first = await f.executor.runCouponSettlement({...f.input, maxBatches: 1});
  assert.equal(first.status, 'ready'); assert.equal(first.completedGroups, 1); assert.equal(f.counts().sends, 1);
  assert.equal(first.resume.canResume, true);
  const firstSignature = first.groups[0].signature;
  assert.ok(firstSignature); assert.equal(first.groups[1].signature, null);
  assert.equal('maxBatches' in first.plan, false);
  assert.deepEqual(operations.findOperation(f.input.operationId)!.params, {bondAddress: f.input.bondAddress, couponId: '0'});
  const restarted = createCouponRunExecutor(f.deps);
  assert.equal((await restarted.couponRunStatus(f.input.operationId)).status, 'ready'); assert.equal(f.counts().sends, 1);
  const resumed = await restarted.runCouponSettlement({...f.input, maxBatches: 4});
  assert.equal(resumed.status, 'completed'); assert.equal(f.counts().sends, 2);
  assert.deepEqual(resumed.plan, first.plan); assert.equal(resumed.groups[0].signature, firstSignature);
});

test('invalid invocation batch caps are rejected before planning or signing', async () => {
  const f = await fixture();
  for (const maxBatches of [0, -1, 5, 1.5, '1', null, true, NaN]) {
    await assert.rejects(() => f.executor.runCouponSettlement({...f.input, maxBatches: maxBatches as number}), code('INVALID_BATCH_LIMIT'));
  }
  assert.equal(operations.findOperation(f.input.operationId), null); assert.equal(f.counts().invocations, 0);
});

test('an unsigned crash persists the exact manifest; expired child lease resumes only its original ID', async () => {
  const f = await fixture(); f.setMode('crash-before-sign');
  const interrupted = await f.executor.runCouponSettlement(f.input), first = interrupted.plan.childOperationIds[0];
  assert.equal(interrupted.status, 'pending'); assert.equal(f.counts().sends, 0);
  const child = operations.findOperation(first)!;
  operations.updateOperation(first, {lease: {...child.lease!, expiresAt: 0}});
  const passive = await f.executor.couponRunStatus(f.input.operationId);
  assert.equal(passive.status, 'ready'); assert.equal(f.counts().invocations, 1, 'GET must not invoke sender');
  f.setMode('confirm'); const resumed = await f.executor.runCouponSettlement(f.input);
  assert.equal(resumed.status, 'completed'); assert.deepEqual(resumed.plan, interrupted.plan);
  assert.equal(f.actions[0], f.actions[1]); assert.equal(f.counts().sends, 2);
});

test('a crash after durable signature and before send stays unknown; retry never re-signs or rebroadcasts', async () => {
  const f = await fixture(); f.setMode('crash-after-persist');
  const result = await f.executor.runCouponSettlement(f.input);
  assert.equal(result.status, 'unknown'); assert.equal(f.counts().sends, 0); assert.equal(f.counts().invocations, 1);
  f.setMode('confirm'); const resumed = await f.executor.runCouponSettlement(f.input);
  assert.equal(resumed.status, 'unknown'); assert.equal(f.counts().invocations, 1);
  await assert.rejects(() => f.executor.runCouponSettlement({...f.input, operationId: 'replacement-' + crypto.randomUUID()}), code('COUPON_RUN_ACTIVE'));
});

test('lost response and confirmed-projection-pending stop later groups; passive recovery never sends', async () => {
  for (const mode of ['send-loss', 'projection-pending'] as const) {
    const f = await fixture(); f.setMode(mode);
    const initial = await f.executor.runCouponSettlement(f.input);
    assert.equal(initial.status, mode === 'send-loss' ? 'unknown' : 'pending'); assert.equal(f.counts().sends, 1);
    const childId = initial.plan.childOperationIds[0], signature = operations.findOperation(childId)!.signature;
    f.confirm(childId); const recovered = await f.executor.couponRunStatus(f.input.operationId);
    assert.equal(recovered.status, 'ready'); assert.equal(f.counts().sends, 1);
    f.setMode('confirm'); const resumed = await f.executor.runCouponSettlement(f.input);
    assert.equal(resumed.status, 'completed'); assert.equal(f.counts().sends, 2);
    assert.equal(operations.findOperation(childId)!.signature, signature);
  }
});

test('two worker instances share durable child ownership and cannot report completion while the first child is pending', async () => {
  const f = await fixture(); let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  f.setBeforeSend(async () => { entered(); await held; });
  const first = f.executor.runCouponSettlement(f.input); await started;
  const second = createCouponRunExecutor(f.deps);
  const observed = await second.runCouponSettlement(f.input);
  assert.equal(observed.status, 'unknown'); assert.equal(f.counts().sends, 0); assert.equal(f.counts().invocations, 1);
  f.setBeforeSend(undefined); release();
  assert.equal((await first).status, 'completed'); assert.equal(f.counts().sends, 2);
});

test('a competing holder claim blocks the saved group instead of rebuilding recipients under its child ID', async () => {
  const f = await fixture(); f.setMode('crash-before-sign');
  const first = await f.executor.runCouponSettlement(f.input), childId = first.plan.childOperationIds[0];
  const c = operations.findOperation(childId)!; operations.updateOperation(childId, {lease: {...c.lease!, expiresAt: 0}});
  f.pay([first.plan.groups[0].holderWallets[0]]); f.setMode('confirm');
  const stopped = await f.executor.runCouponSettlement(f.input);
  assert.equal(stopped.status, 'blocked'); assert.equal(stopped.error?.code, 'PLAN_STATE_CHANGED'); assert.equal(f.counts().sends, 0);
  assert.deepEqual(stopped.plan, first.plan);
  const replacement = await f.executor.runCouponSettlement({...f.input, operationId: 'replacement-' + crypto.randomUUID()});
  assert.equal(replacement.status, 'completed'); assert.equal(replacement.plan.groups.flatMap(g => g.holderWallets).length, 5);
  assert.notEqual(replacement.plan.childOperationIds[0], childId);
});

test('definitive atomic failure stops the run; only an explicit new identifier can plan remaining rights', async () => {
  const f = await fixture(); f.setMode('definitive-error');
  const failed = await f.executor.runCouponSettlement(f.input);
  assert.equal(failed.status, 'error'); assert.equal(f.counts().sends, 1); assert.equal(f.view.coupons[0]!.claimedMask, 0);
  f.setMode('confirm'); assert.equal((await f.executor.runCouponSettlement(f.input)).status, 'error'); assert.equal(f.counts().sends, 1);
  const next = await f.executor.runCouponSettlement({...f.input, operationId: 'explicit-new-' + crypto.randomUUID()});
  assert.equal(next.status, 'completed'); assert.equal(f.counts().sends, 3);
  assert.ok(operations.findOperation(failed.plan.childOperationIds[0])!.signature, 'Failed receipt is preserved');
});

test('a terminal parent cannot hide an unknown signed child from the overlap check', async () => {
  const f = await fixture(); f.setMode('crash-after-persist');
  await f.executor.runCouponSettlement(f.input); operations.updateOperation(f.input.operationId, {status: 'error'});
  await assert.rejects(() => f.executor.runCouponSettlement({...f.input, operationId: 'new-blocked-' + crypto.randomUUID()}), code('COUPON_RUN_ACTIVE'));
  assert.equal(f.counts().invocations, 1);
});

test('snapshot/release/genesis changes block old groups while passive confirmed recovery survives release mismatch', async () => {
  const snapshot = await fixture(); snapshot.setMode('crash-before-sign');
  const a = await snapshot.executor.runCouponSettlement(snapshot.input), ca = operations.findOperation(a.plan.childOperationIds[0])!;
  operations.updateOperation(ca.id, {lease: {...ca.lease!, expiresAt: 0}});
  snapshot.view.coupons[0]!.capturedAt++;
  assert.equal((await snapshot.executor.runCouponSettlement(snapshot.input)).error?.code, 'PLAN_STATE_CHANGED');
  const release = await fixture(); release.setMode('crash-before-sign');
  const b = await release.executor.runCouponSettlement(release.input), cb = operations.findOperation(b.plan.childOperationIds[0])!;
  operations.updateOperation(cb.id, {lease: {...cb.lease!, expiresAt: 0}}); release.release.sha256 = 'b'.repeat(64);
  assert.equal((await release.executor.runCouponSettlement(release.input)).error?.code, 'PROGRAM_RELEASE_CHANGED');
  const chain = await fixture(); chain.setMode('crash-before-sign');
  const c = await chain.executor.runCouponSettlement(chain.input), cc = operations.findOperation(c.plan.childOperationIds[0])!;
  operations.updateOperation(cc.id, {lease: {...cc.lease!, expiresAt: 0}}); chain.setGenesis(String(key(9)));
  assert.equal((await chain.executor.runCouponSettlement(chain.input)).error?.code, 'CHAIN_IDENTITY_CHANGED');
  const done = await fixture(2); await done.executor.runCouponSettlement(done.input); const verifies = done.counts().verifies;
  done.setVerifyError(true); assert.equal((await done.executor.couponRunStatus(done.input.operationId)).status, 'completed'); assert.equal(done.counts().verifies, verifies);
});

test('manifest mutation and foreign child bindings cannot silently change a persisted financial intent', async () => {
  const f = await fixture(); f.setMode('crash-before-sign');
  const result = await f.executor.runCouponSettlement(f.input), parent = operations.findOperation(f.input.operationId)!;
  const mutated = structuredClone(parent); (mutated.metadata!.plan as any).groups[0].holderWallets.reverse();
  journalWrite('operations', parent.id, mutated);
  await assert.rejects(() => f.executor.runCouponSettlement(f.input), code('PLAN_STATE_CHANGED')); journalWrite('operations', parent.id, parent);
  const child = operations.findOperation(result.plan.childOperationIds[0])!;
  operations.updateOperation(child.id, {params: {...child.params, couponId: '1'}});
  assert.equal((await f.executor.couponRunStatus(parent.id)).error?.code, 'OPERATION_CONFLICT'); assert.equal(f.counts().sends, 0);
});

test('already-paid rights produce an explicit zero-child completion, with no invented signature or sender call', async () => {
  const f = await fixture(); f.pay(f.registry);
  const result = await f.executor.runCouponSettlement(f.input);
  assert.equal(result.status, 'completed'); assert.equal(result.totalGroups, 0); assert.equal(result.signature, null);
  assert.equal(result.plan.budget.maxRunSolDebitLamports, '0'); assert.equal(f.counts().invocations, 0);
});

test('new runs reject devnet, disabled demo and an issuer not owned by the generated fixture', async () => {
  const f = await fixture();
  await assert.rejects(() => createCouponRunExecutor({...f.deps, network: 'devnet'}).runCouponSettlement(f.input), code('COUPON_RUN_DISABLED'));
  await assert.rejects(() => createCouponRunExecutor({...f.deps, demoEnabled: false}).runCouponSettlement(f.input), code('COUPON_RUN_DISABLED'));
  await assert.rejects(() => createCouponRunExecutor({...f.deps, fixture: () => ({complete: true, roles: {issuer: key(8)}} as any)}).runCouponSettlement(f.input), code('UNAUTHORIZED_ISSUER'));
  assert.equal(f.counts().invocations, 0);
});

test('a fresh process reads the immutable unsigned plan without a sender or verifier call', async () => {
  const f = await fixture(); f.setMode('crash-before-sign');
  const result = await f.executor.runCouponSettlement(f.input), child = operations.findOperation(result.plan.childOperationIds[0])!;
  operations.updateOperation(child.id, {lease: {...child.lease!, expiresAt: 0}});
  const moduleUrl = pathToFileURL(path.resolve('server/coupon-run.ts')).href;
  const source = `
    import fs from 'node:fs';
    const input=JSON.parse(fs.readFileSync(0,'utf8'),(_key,value)=>value&&value.__bigint?BigInt(value.__bigint):value);
    const {createCouponRunExecutor}=await import(${JSON.stringify(moduleUrl)});
    const never=async()=>{throw new Error('Passive restart must not sign, verify a new release, or reconcile unsigned child');};
    const executor=createCouponRunExecutor({network:'localnet',demoEnabled:true,fixture:()=>null,readView:async()=>input.view,readGenesis:async()=>input.genesis,verifyProgram:never,demoAction:never,operationStatus:never});
    const status=await executor.couponRunStatus(input.id);
    process.stdout.write(JSON.stringify({status:status.status,digest:status.plan.digest,children:status.plan.childOperationIds}));
  `;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {cwd: process.cwd(), env: {...process.env}, windowsHide: true});
    let stdout = '', stderr = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Passive coupon-run restart timed out')); }, 15_000);
    child.on('error', error => { clearTimeout(timer); reject(error); }); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(stderr)); });
    child.stdin.end(JSON.stringify({id: f.input.operationId, view: f.view, genesis: String(key(4))}, (_key, value) => typeof value === 'bigint' ? {__bigint: value.toString()} : value));
  });
  const observed = JSON.parse(output); assert.equal(observed.status, 'ready'); assert.equal(observed.digest, result.plan.digest); assert.deepEqual(observed.children, result.plan.childOperationIds);
  assert.equal(f.counts().invocations, 1);
});

test('an actual process restart after maxBatches1 resumes the second group and preserves the first receipt', async () => {
  const f = await fixture(6), first = await f.executor.runCouponSettlement({...f.input, maxBatches: 1});
  const url = (name: string) => pathToFileURL(path.resolve('server', name + '.ts')).href;
  const source = `
    import fs from 'node:fs'; import assert from 'node:assert/strict'; import {createHash} from 'node:crypto'; import {getBase58Decoder} from '@solana/kit';
    const input=JSON.parse(fs.readFileSync(0,'utf8'),(_key,value)=>value&&value.__bigint?BigInt(value.__bigint):value);
    const [{createCouponRunExecutor},operations]=await Promise.all([import(${JSON.stringify(url('coupon-run'))}),import(${JSON.stringify(url('operations'))})]);
    let sends=0; const view=input.view;
    const status=async id=>{const child=operations.findOperation(id);return {status:child.chainStatus??child.status,signature:child.signature,projectionStatus:child.projectionStatus};};
    const executor=createCouponRunExecutor({network:'localnet',demoEnabled:true,fixture:()=>({complete:true,roles:{issuer:view.bond.issuer}}),readView:async()=>view,readGenesis:async()=>input.identity.genesisHash,verifyProgram:async()=>input.identity,operationStatus:status,
      demoAction:async (request,policy)=>{
        const claim=operations.claimDemoOperation(request.operationId,'settle_coupon','issuer',request.params);if(!claim.claimed)return status(request.operationId);
        const bytes=Buffer.alloc(64);createHash('sha256').update(request.operationId).digest().copy(bytes);bytes[63]=2;const signature=getBase58Decoder().decode(bytes);
        operations.updateOperation(request.operationId,{signature,chainStatus:'pending',status:'pending',projectionStatus:'pending',wallet:view.bond.issuer,bond:view.address,programRelease:policy.requiredProgramRelease});
        assert.ok(operations.findOperation(input.input.operationId).metadata.plan);sends++;
        for(const wallet of request.params.holderWallets){const i=view.bond.holderWallets.indexOf(wallet),coupon=view.coupons[0];assert.equal(coupon.claimedMask&(1<<i),0);const amount=coupon.unitAmount*coupon.units[i];coupon.claimedMask|=1<<i;coupon.paidTotal+=amount;view.vault.amount-=amount;}
        operations.updateOperation(request.operationId,{chainStatus:'confirmed',status:'confirmed',projectionStatus:'complete'});return {status:'confirmed',signature};
      }});
    const before=await executor.couponRunStatus(input.input.operationId);assert.equal(before.status,'ready');assert.equal(sends,0);
    const result=await executor.runCouponSettlement({...input.input,maxBatches:4});
    process.stdout.write(JSON.stringify({status:result.status,digest:result.plan.digest,firstSignature:result.groups[0].signature,childIds:result.plan.childOperationIds,sends}));
  `;
  const raw = await new Promise<string>((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {cwd: globalThis.process.cwd(), env: {...globalThis.process.env}, windowsHide: true});
    let stdout = '', stderr = ''; process.stdout.on('data', data => { stdout += data; }); process.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => { process.kill(); reject(new Error('Coupon run continuation process timed out')); }, 15_000);
    process.once('error', error => { clearTimeout(timer); reject(error); }); process.once('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(stderr)); });
    process.stdin.end(JSON.stringify({input: f.input, view: f.view, identity: f.identity()}, (_key, value) => typeof value === 'bigint' ? {__bigint: value.toString()} : value));
  });
  const resumed = JSON.parse(raw); assert.equal(resumed.status, 'completed'); assert.equal(resumed.sends, 1);
  assert.equal(resumed.firstSignature, first.groups[0].signature); assert.equal(resumed.digest, first.plan.digest);
  assert.deepEqual(resumed.childIds, first.plan.childOperationIds);
});
