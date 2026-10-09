import {createHash} from 'node:crypto';
import {address} from '@solana/kit';
import {derive, PROGRAM_ID} from '../packages/client/src/program.ts';
import {entitlement, hasClaim} from '../packages/client/src/domain.ts';
import {demoEnabled, network} from './config.ts';
import {readChainView, type ChainView} from './chain-view.ts';
import {reconcile} from './reconciliation.ts';
import {chainIdentity} from './chain-identity.ts';
import {assertVerifiedProgram, type ProgramIdentity} from './program-identity.ts';
import {fixture, type Fixture} from './store.ts';
import {beginOperation, findOperation, operationStatus, updateOperation, type Operation} from './operations.ts';
import {journalValues,receipt} from './journal.ts';
import {transactionSync} from './storage.ts';
import {canonicalJson, normalizeRequest} from './request-contract.ts';
import {AppError} from './rpc.ts';
import type {ActionRequest} from './actions.ts';
import type {ReviewedProgram} from './prepared.ts';

export interface CouponRunRequest {operationId: string; bondAddress: string; couponId: string; maxBatches?: number;}
type RunState = 'ready' | 'running' | 'pending' | 'unknown' | 'blocked' | 'error' | 'completed';
type RunError = {code: string; message: string};
type ImmutableSnapshot = {
  bondAddress: string; couponAddress: string; couponId: string; issuer: string; settlementMint: string; vault: string;
  bondMint: string; seriesId: string; registry: string[]; recordTs: string; paymentTs: string;
  capturedAt: string; unitAmount: string; totalUnits: string; units: string[]; bump: number;
};
interface Group {holderWallets: string[]; indices: number[]; units: string[]; amountsMinor: string[]; amountMinor: string;}
interface PlanCore {
  version: 1; operationId: string; genesisHash: string; programId: string; releaseSha256: string; releaseProgramLen: number;
  snapshot: ImmutableSnapshot; initialClaimedMask: number; initialPaidTotalMinor: string; contextSlot: number;
  groups: Group[]; budget: {maxRecipients: 16; maxBatchRecipients: 4; maxBatchAtaRentLamports: '12000000'; maxBatchFeeLamports: '1000000'; maxTransactions: number; maxRunSolDebitLamports: string; scope: string};
}
export interface CouponRunPlan extends PlanCore {digest: string; childOperationIds: string[];}
interface ChildObservation {operationId: string; status: string; signature: string | null; projectionStatus: string;}
export interface CouponRunResult {
  operationId: string; action: 'coupon_run'; status: RunState; signature: null; plan: CouponRunPlan;
  groups: (Group & ChildObservation)[]; completedGroups: number; totalGroups: number;
  desiredRightsPaid: boolean; contextSlot: number | null; error: RunError | null;
  resume: {requiresExplicitRequest: true; canResume: boolean};
  scope: 'explicit-localnet-generated-issuer';
}
export interface CouponRunDependencies {
  readView: (bond: string) => Promise<ChainView>;
  readGenesis: () => Promise<string>;
  verifyProgram: () => Promise<ProgramIdentity>;
  demoAction: (request: ActionRequest, policy: {requiredProgramRelease: ReviewedProgram}) => Promise<unknown>;
  operationStatus: (id: string) => Promise<{status: string; signature?: string | null; projectionStatus?: string}>;
  fixture: () => Fixture | null;
  network: string;
  demoEnabled: boolean;
}
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const terminal = (state: string) => ['blocked', 'error', 'completed'].includes(state);
function fail(code: string, message: string, status = 409): never { throw new AppError(code, message, status); }
function request(value: CouponRunRequest): CouponRunRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['operationId', 'bondAddress', 'couponId', 'maxBatches'].includes(key))) fail('INVALID_REQUEST', 'Coupon run accepts only operationId, bondAddress, couponId and optional maxBatches', 400);
  if (typeof value.operationId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.operationId)) fail('INVALID_OPERATION_ID', 'Retain a valid coupon run identifier before starting', 400);
  if (typeof value.couponId !== 'string' || !/^[0-7]$/.test(value.couponId)) fail('INVALID_COUPON_ID', 'Choose an explicit coupon identifier from0 to7', 400);
  if (value.maxBatches !== undefined && (!Number.isInteger(value.maxBatches) || value.maxBatches < 1 || value.maxBatches > 4)) fail('INVALID_BATCH_LIMIT', 'maxBatches must be an integer from1 to4', 400);
  let bondAddress: string; try { bondAddress = String(address(value.bondAddress)); } catch { return fail('INVALID_ADDRESS', 'Select a complete instrument address', 400); }
  return {operationId: value.operationId, bondAddress, couponId: value.couponId, maxBatches: value.maxBatches ?? 4};
}
function childId(id: string, digest: string, index: number) { return 'coupon_' + hash({operationId: id, digest, index}); }
function load(id: string): {operation: Operation; plan: CouponRunPlan} {
  const operation = findOperation(id);
  if (!operation || operation.action !== 'coupon_run') fail('OPERATION_NOT_FOUND', 'No coupon run exists for this identifier', 404);
  const saved = operation.metadata?.plan as CouponRunPlan | undefined;
  if (operation.metadata?.couponRunVersion !== 1 || !saved || saved.operationId !== id || !Array.isArray(saved.groups) || saved.groups.length > 4 || !Array.isArray(saved.childOperationIds)) fail('RECOVERY_METADATA_MISSING', 'Preserve this run: its immutable plan is unavailable', 503);
  const {digest, childOperationIds, ...core} = saved;
  if (hash(core) !== digest || canonicalJson(childOperationIds) !== canonicalJson(saved.groups.map((_group, i) => childId(id, digest, i)))) fail('PLAN_STATE_CHANGED', 'The saved coupon manifest no longer matches its fixed child identifiers');
  return {operation, plan: saved};
}
function params(plan: CouponRunPlan, i: number) {
  return normalizeRequest({action: 'settle_coupon', bondAddress: plan.snapshot.bondAddress,
    params: {couponId: plan.snapshot.couponId, holderWallets: plan.groups[i].holderWallets}}).params;
}
function child(plan: CouponRunPlan, i: number): Operation | null {
  const current = findOperation(plan.childOperationIds[i]);
  if (current && (current.action !== 'settle_coupon' || current.role !== 'issuer'
    || canonicalJson(current.params) !== canonicalJson(params(plan, i))
    || (current.wallet !== undefined && current.wallet !== plan.snapshot.issuer)
    || (current.bond !== undefined && current.bond !== plan.snapshot.bondAddress))) fail('OPERATION_CONFLICT', 'A coupon child identifier is bound to different inputs');
  if(current?.signature){const observed=receipt(current.signature)?.programRelease??current.programRelease;if(!observed||observed.programId!==plan.programId||observed.sha256!==plan.releaseSha256||observed.genesisHash!==plan.genesisHash)fail('PLAN_RELEASE_MISMATCH','The retained child was not bound to this coupon plan release; recover its original evidence before any further execution');}
  return current;
}
async function immutable(view: ChainView, couponId: string): Promise<ImmutableSnapshot> {
  reconcile(view);
  const index = Number(couponId), coupon = view.coupons[index];
  if (!coupon) fail('NO_SNAPSHOT', 'Capture this coupon record date before planning settlement', 400);
  const canonical = String(await derive('coupon', view.address, index));
  if (view.couponAddresses[index] !== canonical) fail('INVALID_INSTRUMENT', 'The coupon snapshot is not its canonical PDA');
  return {bondAddress: view.address, couponAddress: canonical, couponId, issuer: String(view.bond.issuer), settlementMint: String(view.bond.settlementMint), vault: String(view.bond.vault),
    bondMint: String(view.bond.bondMint), seriesId: view.bond.seriesId.toString(), registry: view.bond.holderWallets.map(String), recordTs: coupon.recordTs.toString(), paymentTs: coupon.paymentTs.toString(),
    capturedAt: coupon.capturedAt.toString(), unitAmount: coupon.unitAmount.toString(), totalUnits: coupon.totalUnits.toString(), units: coupon.units.map(String), bump: coupon.bump};
}
function issuer(deps: CouponRunDependencies): string {
  if (deps.network !== 'localnet' || !deps.demoEnabled) fail('COUPON_RUN_DISABLED', 'Whole-coupon execution is restricted to explicit localnet generated-issuer runs', 403);
  const f = deps.fixture();
  if (!f?.complete || !f.roles.issuer) fail('DEMO_NOT_READY', 'Initialize the generated local test identities first', 403);
  return String(address(f.roles.issuer));
}
function noOverlap(input: CouponRunRequest) {
  for (const other of journalValues<Operation>('operations')) {
    if (other.id === input.operationId || other.action !== 'coupon_run' || other.params?.bondAddress !== input.bondAddress || other.params?.couponId !== input.couponId) continue;
    if (!terminal(other.status)) fail('COUPON_RUN_ACTIVE', 'Resume the existing coupon run before starting a different identifier');
    const saved = load(other.id).plan;
    for (let i = 0; i < saved.groups.length; i++) {
      const current = child(saved, i);
      if (current?.signature && !(current.projectionStatus === 'complete' && ['confirmed', 'error'].includes(current.chainStatus ?? ''))) fail('COUPON_RUN_ACTIVE', 'An earlier run retains an unresolved signed child; recover it before a new plan');
      if (!current?.signature && current?.lease && current.lease.expiresAt > Date.now()) fail('COUPON_RUN_ACTIVE', 'An earlier unsigned child is still owned by another worker');
    }
  }
}

/** Durable parent plans contain no signer keys and never replace a submitted child. */
export function createCouponRunExecutor(deps: CouponRunDependencies) {
  async function ensurePlan(input: CouponRunRequest): Promise<CouponRunPlan> {
    const signer = issuer(deps), existing = findOperation(input.operationId);
    if (existing) return transactionSync(() => { beginOperation(input.operationId, 'coupon_run', 'issuer', {bondAddress: input.bondAddress, couponId: input.couponId}); return load(input.operationId).plan; });
    const identity = await deps.verifyProgram();
    if (!identity.signingAllowed || !identity.expected || !identity.genesisHash || identity.programId !== PROGRAM_ID) fail('PROGRAM_IDENTITY_UNAVAILABLE', 'A verified expected program release is required before planning a run', 503);
    const view = await deps.readView(input.bondAddress), snapshot = await immutable(view, input.couponId);
    if (snapshot.bondAddress !== input.bondAddress || snapshot.issuer !== signer) fail('UNAUTHORIZED_ISSUER', 'The generated fixture issuer must own this selected instrument', 403);
    if (view.clock.timestamp < BigInt(snapshot.paymentTs)) fail('TOO_EARLY', 'The coupon payment date has not arrived', 400);
    if (await deps.readGenesis() !== identity.genesisHash) fail('CHAIN_IDENTITY_CHANGED', 'The ledger changed while planning the coupon run');
    const coupon = view.coupons[Number(input.couponId)]!;
    const unpaid = snapshot.registry.map((_wallet, i) => i).filter(i => BigInt(snapshot.units[i]) > 0n && !hasClaim(coupon.claimedMask, i));
    const groups: Group[] = [];
    for (let offset = 0; offset < unpaid.length; offset += 4) {
      const indices = unpaid.slice(offset, offset + 4).sort((a, b) => snapshot.registry[a] < snapshot.registry[b] ? -1 : 1);
      const amounts = indices.map(i => entitlement(BigInt(snapshot.unitAmount), BigInt(snapshot.units[i])));
      groups.push({indices, holderWallets: indices.map(i => snapshot.registry[i]), units: indices.map(i => snapshot.units[i]), amountsMinor: amounts.map(String), amountMinor: amounts.reduce((a, b) => a + b, 0n).toString()});
    }
    const core: PlanCore = {version: 1, operationId: input.operationId, genesisHash: identity.genesisHash, programId: identity.programId,
      releaseSha256: identity.expected.sha256, releaseProgramLen: identity.expected.programLen, snapshot,
      initialClaimedMask: coupon.claimedMask, initialPaidTotalMinor: coupon.paidTotal.toString(), contextSlot: view.contextSlot, groups,
      budget: {maxRecipients: 16, maxBatchRecipients: 4, maxBatchAtaRentLamports: '12000000', maxBatchFeeLamports: '1000000', maxTransactions: groups.length,
        maxRunSolDebitLamports: String(groups.length * 13_000_000), scope: 'test-SOL safety ceilings, not predicted charge'}};
    const digest = hash(core), plan: CouponRunPlan = {...core, digest, childOperationIds: groups.map((_group, i) => childId(input.operationId, digest, i))};
    return transactionSync(() => {
      const current = findOperation(input.operationId);
      if (current) { beginOperation(input.operationId, 'coupon_run', 'issuer', {bondAddress: input.bondAddress, couponId: input.couponId}); return load(input.operationId).plan; }
      noOverlap(input);
      beginOperation(input.operationId, 'coupon_run', 'issuer', {bondAddress: input.bondAddress, couponId: input.couponId});
      updateOperation(input.operationId, {status: 'ready', wallet: signer, bond: input.bondAddress, metadata: {couponRunVersion: 1, plan, observations: {}}});
      return plan;
    });
  }
  function save(plan: CouponRunPlan, status: RunState, observations: ChildObservation[], error: RunError | null, contextSlot: number | null, desiredRightsPaid: boolean): CouponRunResult {
    return transactionSync(() => {
      const latest = load(plan.operationId);
      if (latest.plan.digest !== plan.digest) fail('PLAN_STATE_CHANGED', 'The saved coupon plan changed before progress could be recorded');
      const stored = latest.operation.metadata ?? {}, prior = (stored.observations ?? {}) as Record<string, ChildObservation>;
      const merged = {...prior};
      for (const item of observations) {
        const old = merged[item.operationId];
        if (!(old?.status === 'confirmed' && old.projectionStatus === 'complete' && item.status !== 'confirmed')) merged[item.operationId] = item;
      }
      if (status === 'completed' && plan.groups.some((_group, i) => { const c = child(plan, i); return !c?.signature || c.chainStatus !== 'confirmed' || c.projectionStatus !== 'complete'; })) {
        status = 'pending'; error = {code: 'CHILD_STATUS_CHANGED', message: 'A child changed while completion was being recorded; recover this same run.'};
      }
      // A slower observer cannot reopen a blocked/failed plan. A completed run
      // may conservatively report later unavailable receipt/effect evidence.
      if (['blocked', 'error'].includes(latest.operation.status) && !terminal(status)) {
        status = latest.operation.status as RunState;
        error = stored.runError as RunError | null ?? error;
      }
      updateOperation(plan.operationId, {status, error: error?.message, metadata: {...stored, observations: merged, runError: error, progressContextSlot: contextSlot, desiredRightsPaid}});
      const groups = plan.groups.map((group, i) => ({...group, ...(merged[plan.childOperationIds[i]] ?? {operationId: plan.childOperationIds[i], status: 'not_submitted', signature: null, projectionStatus: 'not_applicable'})}));
      return {operationId: plan.operationId, action: 'coupon_run', status, signature: null, plan, groups,
        completedGroups: groups.filter(g => g.status === 'confirmed' && g.projectionStatus === 'complete').length, totalGroups: groups.length,
        desiredRightsPaid, contextSlot, error, resume: {requiresExplicitRequest: true, canResume: !terminal(status)}, scope: 'explicit-localnet-generated-issuer'};
    });
  }
  async function assess(id: string): Promise<CouponRunResult> {
    const {plan} = load(id), observations: ChildObservation[] = [];
    try {
      for (let i = 0; i < plan.groups.length; i++) {
        const c = child(plan, i);
        if (!c) { observations.push({operationId: plan.childOperationIds[i], status: 'not_submitted', signature: null, projectionStatus: 'not_applicable'}); continue; }
        if (c.signature) {
          try {
            const fresh = await deps.operationStatus(c.id);
            if (fresh.signature !== c.signature) fail('OPERATION_CONFLICT', 'Child recovery returned a different signature');
            observations.push({operationId: c.id, status: fresh.status, signature: c.signature, projectionStatus: fresh.projectionStatus ?? 'pending'});
          } catch { observations.push({operationId: c.id, status: 'unknown', signature: c.signature, projectionStatus: 'pending'}); }
        } else observations.push({operationId: c.id, status: c.status === 'error' ? 'error' : c.lease && c.lease.expiresAt > Date.now() ? 'preparing' : 'not_submitted', signature: null, projectionStatus: 'not_applicable'});
      }
      const unresolved = observations.find(o => o.signature ? !(['confirmed', 'error'].includes(o.status) && o.projectionStatus === 'complete') : o.status === 'preparing');
      if (unresolved) return save(plan, unresolved.status === 'unknown' ? 'unknown' : 'pending', observations, {code: 'CHILD_RECOVERY_REQUIRED', message: 'Recover the retained child before any further signature.'}, null, false);
      if (observations.some(o => o.status === 'error')) return save(plan, 'error', observations, {code: 'CHILD_FAILED', message: 'A child was rejected. Preserve its receipt and explicitly review a new run for remaining rights.'}, null, false);
      if (await deps.readGenesis() !== plan.genesisHash) return save(plan, 'blocked', observations, {code: 'CHAIN_IDENTITY_CHANGED', message: 'This plan belongs to another ledger; preserve its historical receipts.'}, null, false);
      const view = await deps.readView(plan.snapshot.bondAddress), observed = await immutable(view, plan.snapshot.couponId);
      if (await deps.readGenesis() !== plan.genesisHash) return save(plan, 'blocked', observations, {code: 'CHAIN_IDENTITY_CHANGED', message: 'The ledger changed while current coupon effects were being read.'}, view.contextSlot, false);
      if (canonicalJson(observed) !== canonicalJson(plan.snapshot)) return save(plan, 'blocked', observations, {code: 'PLAN_STATE_CHANGED', message: 'The immutable registry or coupon snapshot changed; the old groups cannot be reused.'}, view.contextSlot, false);
      const coupon = view.coupons[Number(plan.snapshot.couponId)]!;
      if ((coupon.claimedMask & plan.initialClaimedMask) !== plan.initialClaimedMask) return save(plan, 'blocked', observations, {code: 'PLAN_STATE_CHANGED', message: 'Previously paid rights disappeared from the current coupon state.'}, view.contextSlot, false);
      for (let i = 0; i < plan.groups.length; i++) {
        const group = plan.groups[i], paid = group.indices.map(index => hasClaim(coupon.claimedMask, index));
        if (observations[i].status === 'confirmed' && !paid.every(Boolean)) return save(plan, 'unknown', observations, {code: 'CHAIN_EFFECT_PENDING', message: 'Confirmed child effects are not yet visible in the coherent coupon view.'}, view.contextSlot, false);
        if (observations[i].status === 'not_submitted' && paid.some(Boolean)) {
          const current = child(plan, i);
          if (current?.signature || (current?.lease && current.lease.expiresAt > Date.now())) return save(plan, 'pending', observations, {code: 'CHILD_RECOVERY_REQUIRED', message: 'Another worker advanced this child; recover the same run.'}, view.contextSlot, false);
          return save(plan, 'blocked', observations, {code: 'PLAN_STATE_CHANGED', message: 'A planned beneficiary was paid outside this unsubmitted group. Review a new run; this group will not be replaced.'}, view.contextSlot, false);
        }
      }
      const paid = plan.snapshot.units.every((units, index) => units === '0' || hasClaim(coupon.claimedMask, index));
      const complete = observations.every(o => o.signature && o.status === 'confirmed' && o.projectionStatus === 'complete') && paid;
      const latest = load(id).operation;
      if (terminal(latest.status) && latest.status !== 'completed') return save(plan, latest.status as RunState, observations, latest.metadata?.runError as RunError ?? null, view.contextSlot, paid);
      return save(plan, complete ? 'completed' : 'ready', observations, null, view.contextSlot, paid);
    } catch (error) {
      return save(plan, 'unknown', observations, {code: error instanceof AppError ? error.code : 'COUPON_RUN_UNAVAILABLE', message: 'Coupon run recovery is unavailable. Preserve the same run and child identifiers.'}, null, false);
    }
  }
  async function runCouponSettlement(raw: CouponRunRequest): Promise<CouponRunResult> {
    const input = request(raw), plan = await ensurePlan(input);
    // maxBatches schedules this invocation only. It is deliberately absent
    // from request binding, the saved financial plan and deterministic child IDs.
    const maximum = Math.min(input.maxBatches!, plan.groups.length);
    for (let attempts = 0; attempts <= maximum; attempts++) {
      const state = await assess(input.operationId);
      if (state.status !== 'ready' || attempts === maximum) return state;
      const next = state.groups.findIndex(g => g.status === 'not_submitted');
      if (next < 0) return state;
      if (issuer(deps) !== plan.snapshot.issuer) return save(plan, 'blocked', state.groups, {code: 'DEMO_SIGNER_MISMATCH', message: 'The generated issuer identity changed; preserve this plan.'}, state.contextSlot, false);
      let identity: ProgramIdentity;
      try { identity = await deps.verifyProgram(); }
      catch { return save(plan, 'unknown', state.groups, {code: 'PROGRAM_IDENTITY_UNAVAILABLE', message: 'The expected release could not be verified. Resume the same run after recovery.'}, state.contextSlot, false); }
      if (!identity.signingAllowed || identity.genesisHash !== plan.genesisHash || identity.programId !== plan.programId || identity.expected?.sha256 !== plan.releaseSha256 || identity.expected.programLen !== plan.releaseProgramLen) {
        return save(plan, 'blocked', state.groups, {code: 'PROGRAM_RELEASE_CHANGED', message: 'This run is bound to a different verified release; no new child will be signed.'}, state.contextSlot, false);
      }
      const canDispatch = transactionSync(() => {
        const latest = load(input.operationId).operation, c = child(plan, next);
        if (terminal(latest.status) || c?.signature || (c?.lease && c.lease.expiresAt > Date.now()) || c?.status === 'error') return false;
        updateOperation(input.operationId, {status: 'running'}); return true;
      });
      if (!canDispatch) return assess(input.operationId);
      try { await deps.demoAction({action: 'settle_coupon', role: 'issuer', operationId: plan.childOperationIds[next], bondAddress: plan.snapshot.bondAddress, params: params(plan, next)},{requiredProgramRelease:{programId:plan.programId,sha256:plan.releaseSha256,genesisHash:plan.genesisHash}}); }
      catch {
        const result = await assess(input.operationId);
        if (result.status !== 'ready') return result;
        return save(plan, 'unknown', result.groups, {code: 'CHILD_PREPARATION_INTERRUPTED', message: 'Preparation was interrupted before a retained outcome. Explicitly resume this same run.'}, result.contextSlot, false);
      }
      // A sender must persist a child outcome. Do not loop on a callback that
      // returned without creating any durable operation record.
      if (!child(plan, next)) return save(plan, 'unknown', state.groups, {code: 'CHILD_OUTCOME_MISSING', message: 'No durable child outcome is available; explicitly recover this run.'}, state.contextSlot, false);
    }
    return assess(input.operationId);
  }
  return {runCouponSettlement, couponRunStatus: assess};
}

const defaultExecutor = createCouponRunExecutor({readView: readChainView, readGenesis: async () => (await chainIdentity()).genesisHash,
  verifyProgram: assertVerifiedProgram, demoAction: async (input,policy) => (await import('./actions.ts')).demoAction(input,policy), operationStatus, fixture, network, demoEnabled});
export const runCouponSettlement = defaultExecutor.runCouponSettlement;
export const couponRunStatus = defaultExecutor.couponRunStatus;
