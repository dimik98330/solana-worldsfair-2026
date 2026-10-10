import path from 'node:path';
import {createHash, createPublicKey, verify} from 'node:crypto';
import {address} from '@solana/kit';
import {localDir} from './config.ts';
import {readJson, writeJson, transactionSync} from './storage.ts';
import {canonicalJson} from './request-contract.ts';
import {AppError} from './rpc.ts';
import type {ChainIdentity} from './chain-identity.ts';

type Scope = {network: string; genesisHash: string; programId: string; bondAddress: string};
type Holding = {wallet: string; units: string};
type Right = Holding & {amountMinor: string; claimed: boolean};
type Snapshot = {id?: string; snapshotAddress: string; basis: string; entitlements: Right[]};
export interface IntegrationState {
  connected: boolean;
  instrument: null | {address: string; settlementMint: string; settlementDecimals: number; issuedSupply: string; redeemedSupply: string};
  context: unknown;
  reconciliation: {status: string};
  holders: Holding[];
  coupons: Snapshot[];
  redemption: Snapshot | null;
}
export interface IntegrationAuthority {authorityId: string; sourceId: string; publicKeyBase64: string; scopes: Array<'registry' | 'settlement-ack'>}
export interface IntegrationDependencies {
  readView: (bond: string) => Promise<IntegrationState>;
  readIdentity: () => Promise<ChainIdentity>;
  authorities: IntegrationAuthority[];
  now?: () => number;
}
export interface IntegrationEnvelope {payload: Record<string, unknown>; authorityId: string; signatureBase64: string}
type Verified = {envelope: IntegrationEnvelope; digest: string; fingerprint: string; sourceId: string; nonce: string; sequence: string; scope: Scope};
type RegistryRecord = {kind: 'registry-import'; schemaVersion: 1; importId: string; digest: string; envelope: IntegrationEnvelope; authorityFingerprint: string; acceptedAt: string; comparisonContext: unknown; scope: Scope; matchStatus: 'matched' | 'mismatch'; mismatches: string[]; holdingsDigest: string; holders: Array<Holding & {holderRef: string}>; legalRegistryVerified: false};
type PaymentPayload = Scope & {action: 'coupon' | 'principal'; couponId?: string; snapshotAddress: string; beneficiaryWallet: string; holderRef: string; assetMint: string; assetDecimals: number; amountMinor: string; units: string};
type Outbox = {kind: 'outbox'; schemaVersion: 1; paymentId: string; digest: string; ownerOperationId: string; payload: PaymentPayload; externalStatus: string; lastSequence: string; acknowledgementDigests: string[]; disputeDigests: string[]};
type Plan = {kind: 'settlement-plan'; schemaVersion: 1; operationId: string; requestDigest: string; digest: string; scope: Scope; registryImportId: string; registryDigest: string; adapter: 'sandbox-file'; action: 'coupon' | 'principal'; couponId?: string; snapshotAddress: string; createdAt: string; comparisonContext: unknown; paymentIds: string[]; totalMinor: string; realAssets: false; partnerConnection: 'unverified'};
type Index = {digest: string; recordId: string};
const maxRows = 1000, maxAcknowledgements = 128;
const spkiEd25519 = Buffer.from('302a300506032b6570032100', 'hex');
function fail(code: string, message: string, status = 400): never { throw new AppError(code, message, status); }
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INTEGRATION_INVALID', 'Expected a named integration object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !fields.includes(key))) fail('INTEGRATION_INVALID', 'Unsupported integration field');
  return item;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) fail('INTEGRATION_INVALID', 'Integration references require8–100 ASCII letters, digits, underscores or hyphens');
  return value;
}
function integer(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > (1n << 64n) - 1n) fail('INTEGRATION_AMOUNT', 'Use a canonical u64 integer string');
  return value;
}
function publicAddress(value: unknown): string {
  if (typeof value !== 'string') fail('INTEGRATION_INVALID', 'Expected a complete Solana public address');
  try { return String(address(value)); } catch { return fail('INTEGRATION_INVALID', 'Expected a complete Solana public address'); }
}
function base64(value: unknown, size: number): Buffer {
  if (typeof value !== 'string') fail('INTEGRATION_SIGNATURE', 'Expected canonical base64 public signature data');
  const result = Buffer.from(value, 'base64');
  if (result.length !== size || result.toString('base64') !== value) fail('INTEGRATION_SIGNATURE', 'Malformed public signature data');
  return result;
}
function bounded(value: unknown, depth = 0, count = {value: 0}) {
  if (depth > 12 || ++count.value > 12000) fail('INTEGRATION_LIMIT', 'Integration payload exceeds its structural limit');
  if (value && typeof value === 'object') for (const item of Object.values(value)) bounded(item, depth + 1, count);
}
export function integrationSigningBytes(payload: unknown): Buffer {
  bounded(payload);
  const bytes = Buffer.from('BondTrace integration v1\n' + canonicalJson(payload));
  if (bytes.length > 65000) fail('INTEGRATION_LIMIT', 'Integration payload exceeds65000 bytes');
  return bytes;
}
export function integrationDigest(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
const key = (namespace: string, value: unknown) => path.join(localDir, namespace, integrationDigest(value) + '.json');
const registryKey = (id: string) => key('integration-registry', ['import', id]);
const planKey = (id: string) => path.join(localDir, 'integration-plan', identifier(id) + '.json');
const outboxKey = (id: string) => key('integration-outbox', ['payment', id]);
function scopeOf(value: unknown): Scope {
  const scope = object(value, ['network', 'genesisHash', 'programId', 'bondAddress']);
  if (!['localnet', 'devnet'].includes(String(scope.network))) fail('INTEGRATION_SCOPE', 'Only test networks are supported', 403);
  return {network: String(scope.network), genesisHash: publicAddress(scope.genesisHash), programId: publicAddress(scope.programId), bondAddress: publicAddress(scope.bondAddress)};
}
function equalScope(a: Scope, b: Scope) { return canonicalJson(a) === canonicalJson(b); }
function stamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail('INTEGRATION_TIME', 'Use canonical UTC timestamps with milliseconds');
  const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('INTEGRATION_TIME', 'Invalid UTC timestamp');
  return parsed;
}
export function readIntegrationAuthorities(env: NodeJS.ProcessEnv = process.env): IntegrationAuthority[] {
  const raw = env.BONDTRACE_INTEGRATION_AUTHORITIES;
  if (!raw) return [];
  if (Buffer.byteLength(raw) > 32000) fail('INTEGRATION_POLICY', 'Authority policy is too large');
  let rows: unknown; try { rows = JSON.parse(raw); } catch { return fail('INTEGRATION_POLICY', 'Authority policy must be JSON'); }
  if (!Array.isArray(rows) || rows.length > 32) fail('INTEGRATION_POLICY', 'Configure at most32 public integration authorities');
  const ids = new Set<string>();
  return rows.map(value => {
    const row = object(value, ['authorityId', 'sourceId', 'publicKeyBase64', 'scopes']), authorityId = identifier(row.authorityId), sourceId = identifier(row.sourceId);
    if (ids.has(authorityId)) fail('INTEGRATION_POLICY', 'Authority identities must be unique'); ids.add(authorityId);
    base64(row.publicKeyBase64, 32);
    if (!Array.isArray(row.scopes) || !row.scopes.length || row.scopes.some(scope => !['registry', 'settlement-ack'].includes(scope))) fail('INTEGRATION_POLICY', 'Choose explicit integration authority scopes');
    return {authorityId, sourceId, publicKeyBase64: String(row.publicKeyBase64), scopes: [...new Set(row.scopes)] as IntegrationAuthority['scopes']};
  });
}

/** Shadow integration only: no dispatcher, signer, RPC send or on-chain mutation is accepted here. */
export function createIntegrationService(deps: IntegrationDependencies) {
  const authorities = readIntegrationAuthorities({BONDTRACE_INTEGRATION_AUTHORITIES: JSON.stringify(deps.authorities)}), now = deps.now ?? Date.now;
  const timestamp = () => new Date(now()).toISOString();
  function verified(value: unknown, purpose: 'registry' | 'settlement-ack'): Verified {
    const raw = object(value, ['payload', 'authorityId', 'signatureBase64']), authorityId = identifier(raw.authorityId), authority = authorities.find(item => item.authorityId === authorityId);
    if (!authority || !authority.scopes.includes(purpose)) fail('INTEGRATION_AUTHORITY', 'No configured authority for this integration scope', 403);
    const fields = purpose === 'registry'
      ? ['domain', 'schemaVersion', 'importId', 'sourceId', 'registryRef', 'nonce', 'sourceSequence', 'issuedAt', 'expiresAt', 'mode', 'chain', 'basis', 'holders']
      : ['domain', 'schemaVersion', 'ackId', 'sourceId', 'nonce', 'sourceSequence', 'issuedAt', 'expiresAt', 'mode', 'chain', 'operationId', 'paymentId', 'outboxDigest', 'beneficiaryWallet', 'assetMint', 'assetDecimals', 'amountMinor', 'externalReference', 'status'];
    const payload = object(raw.payload, fields);
    if (payload.schemaVersion !== 1 || payload.domain !== (purpose === 'registry' ? 'bondtrace.registry-attestation.v1' : 'bondtrace.settlement-ack.v1') || !['sandbox', 'shadow'].includes(String(payload.mode))) fail('INTEGRATION_SCOPE', 'Unsupported integration schema or mode', 403);
    if (payload.sourceId !== authority.sourceId) fail('INTEGRATION_AUTHORITY', 'The source is not assigned to this authority', 403);
    const bytes = integrationSigningBytes(payload), signature = base64(raw.signatureBase64, 64), publicKey = base64(authority.publicKeyBase64, 32);
    if (!verify(null, bytes, createPublicKey({key: Buffer.concat([spkiEd25519, publicKey]), format: 'der', type: 'spki'}), signature)) fail('INTEGRATION_SIGNATURE', 'The integration signature does not verify');
    return {envelope: {payload, authorityId, signatureBase64: String(raw.signatureBase64)}, digest: createHash('sha256').update(bytes).digest('hex'), fingerprint: createHash('sha256').update(publicKey).digest('hex'), sourceId: authority.sourceId, nonce: identifier(payload.nonce), sequence: integer(payload.sourceSequence), scope: scopeOf(payload.chain)};
  }
  function fresh(item: Verified) {
    const issued = stamp(item.envelope.payload.issuedAt), expires = stamp(item.envelope.payload.expiresAt);
    if (expires <= now() || issued > now() + 60000 || expires <= issued || expires - issued > 86400000) fail('INTEGRATION_EXPIRED', 'The new integration envelope is outside its transport validity window', 409);
  }
  async function coherent(scope: Scope) {
    const first = await deps.readIdentity(), view = await deps.readView(scope.bondAddress), last = await deps.readIdentity();
    if (![first, last].every(identity => identity.network === scope.network && identity.genesisHash === scope.genesisHash && identity.programId === scope.programId)) fail('INTEGRATION_SCOPE', 'The integration is bound to another test chain or program', 409);
    if (!view.connected || !view.instrument || view.instrument.address !== scope.bondAddress || view.reconciliation?.status !== 'verified' || !view.context || typeof view.context !== 'object') fail('INTEGRATION_CHAIN_UNAVAILABLE', 'An exact coherent instrument view is required', 503);
    return view;
  }
  function holdings(view: IntegrationState) {
    if (!Array.isArray(view.holders) || !view.holders.length || view.holders.length > maxRows) fail('INTEGRATION_LIMIT', 'Registry must contain1–1000 holders');
    const result = view.holders.map(row => ({wallet: publicAddress(row.wallet), units: integer(row.units)}));
    if (new Set(result.map(row => row.wallet)).size !== result.length || result.reduce((total, row) => total + BigInt(row.units), 0n) !== BigInt(integer(view.instrument!.issuedSupply)) - BigInt(integer(view.instrument!.redeemedSupply))) fail('INTEGRATION_CHAIN_UNAVAILABLE', 'The exact chain registry does not reconcile', 503);
    return result;
  }
  function registryStatus(id: string): RegistryRecord {
    const record = readJson<RegistryRecord | null>(registryKey(identifier(id)), null);
    if (!record) fail('INTEGRATION_NOT_FOUND', 'Registry receipt not found', 404); return record;
  }
  async function importRegistry(value: unknown) {
    const item = verified(value, 'registry'), payload = item.envelope.payload, id = identifier(payload.importId);
    const prior = readJson<RegistryRecord | null>(registryKey(id), null);
    if (prior) { if (prior.digest !== item.digest) fail('INTEGRATION_CONFLICT', 'This import identity already binds different signed bytes', 409); return prior; }
    fresh(item);
    if (payload.basis !== 'current-registered-holdings' || !Array.isArray(payload.holders) || !payload.holders.length || payload.holders.length > maxRows) fail('INTEGRATION_INVALID', 'Supply a complete current registry assertion');
    const registryRef = identifier(payload.registryRef), refs = new Set<string>(), wallets = new Set<string>();
    const rows = payload.holders.map(value => {
      const row = object(value, ['holderRef', 'wallet', 'units']), holderRef = identifier(row.holderRef), wallet = publicAddress(row.wallet), units = integer(row.units);
      if (refs.has(holderRef) || wallets.has(wallet)) fail('INTEGRATION_INVALID', 'Registry holder references and wallets must be unique'); refs.add(holderRef); wallets.add(wallet); return {holderRef, wallet, units};
    });
    const view = await coherent(item.scope), current = holdings(view), mismatches: string[] = [];
    if (rows.length !== current.length) mismatches.push('holder-count');
    for (let index = 0; index < Math.max(rows.length, current.length); index++) if (rows[index]?.wallet !== current[index]?.wallet || rows[index]?.units !== current[index]?.units) mismatches.push('holder-row-' + index);
    return transactionSync(() => {
      const existing = readJson<RegistryRecord | null>(registryKey(id), null);
      if (existing) { if (existing.digest !== item.digest) fail('INTEGRATION_CONFLICT', 'Concurrent registry identity conflict', 409); return existing; }
      const nonceFile = key('integration-registry', ['nonce', item.sourceId, item.nonce]), headFile = key('integration-registry', ['head', item.sourceId, item.scope, registryRef]);
      const nonce = readJson<Index | null>(nonceFile, null), head = readJson<{sequence: string} | null>(headFile, null);
      if (nonce && nonce.digest !== item.digest) fail('INTEGRATION_CONFLICT', 'The signed source nonce is already consumed', 409);
      if (head && BigInt(item.sequence) <= BigInt(head.sequence)) fail('INTEGRATION_STALE', 'A new registry assertion must advance its source sequence', 409);
      const record: RegistryRecord = {kind: 'registry-import', schemaVersion: 1, importId: id, digest: item.digest, envelope: item.envelope, authorityFingerprint: item.fingerprint, acceptedAt: timestamp(), comparisonContext: view.context, scope: item.scope, matchStatus: mismatches.length ? 'mismatch' : 'matched', mismatches, holdingsDigest: integrationDigest(current), holders: rows, legalRegistryVerified: false};
      writeJson(registryKey(id), record); writeJson(nonceFile, {digest: item.digest, recordId: id}); writeJson(headFile, {sequence: item.sequence}); return record;
    });
  }
  function storedPlan(id: string): Plan {
    const plan = readJson<Plan | null>(planKey(id), null); if (!plan) fail('INTEGRATION_NOT_FOUND', 'Settlement plan not found', 404); return plan;
  }
  const rowsFor = (plan: Plan) => plan.paymentIds.map(id => {
    const row = readJson<Outbox | null>(outboxKey(id), null);
    if (!row || row.paymentId !== id || row.ownerOperationId !== plan.operationId || row.digest !== integrationDigest(row.payload) || !equalScope({network: row.payload.network, genesisHash: row.payload.genesisHash, programId: row.payload.programId, bondAddress: row.payload.bondAddress}, plan.scope)) fail('INTEGRATION_STORAGE', 'Settlement manifest is incomplete or inconsistent', 503);
    return row;
  });
  async function planSettlement(value: unknown) {
    bounded(value);
    const request = object(value, ['operationId', 'bondAddress', 'action', 'couponId', 'registryImportId', 'adapter', 'holderWallets', 'snapshotAddress']);
    const id = identifier(request.operationId), requestDigest = integrationDigest(request), existing = readJson<Plan | null>(planKey(id), null);
    if (existing) { if (existing.requestDigest !== requestDigest) fail('INTEGRATION_CONFLICT', 'This plan identity already binds another intent', 409); return {plan: existing, outbox: rowsFor(existing)}; }
    if (request.adapter !== 'sandbox-file' || !['coupon', 'principal'].includes(String(request.action))) fail('INTEGRATION_ADAPTER', 'Only the nonexecuting sandbox file adapter is enabled', 422);
    const action = request.action as 'coupon' | 'principal', registry = registryStatus(identifier(request.registryImportId)), bond = publicAddress(request.bondAddress);
    if (registry.scope.bondAddress !== bond || registry.matchStatus !== 'matched') fail('INTEGRATION_REGISTRY', 'A matching registry assertion for this instrument is required', 409);
    const view = await coherent(registry.scope), current = holdings(view);
    if (integrationDigest(current) !== registry.holdingsDigest) fail('INTEGRATION_REGISTRY_STALE', 'Current holdings changed; import a fresh signed registry assertion', 409);
    const couponId = action === 'coupon' ? integer(request.couponId) : undefined;
    if (action === 'principal' && request.couponId !== undefined) fail('INTEGRATION_INVALID', 'Principal has no coupon index');
    const snapshot = action === 'coupon' ? view.coupons.find(row => row.id === couponId) : view.redemption;
    if (!snapshot || !snapshot.snapshotAddress || snapshot.basis !== (action === 'coupon' ? 'immutable-record-date-snapshot' : 'immutable-maturity-snapshot')) fail('INTEGRATION_FORECAST', 'Only an already immutable entitlement snapshot can be planned', 409);
    const snapshotAddress = publicAddress(snapshot.snapshotAddress);
    if (request.snapshotAddress !== undefined && publicAddress(request.snapshotAddress) !== snapshotAddress) fail('INTEGRATION_SNAPSHOT', 'The requested entitlement snapshot changed', 409);
    let selected: Set<string> | undefined;
    if (request.holderWallets !== undefined) {
      if (!Array.isArray(request.holderWallets) || !request.holderWallets.length || request.holderWallets.length > maxRows) fail('INTEGRATION_LIMIT', 'Select1–1000 unique beneficiaries');
      selected = new Set(request.holderWallets.map(publicAddress)); if (selected.size !== request.holderWallets.length) fail('INTEGRATION_INVALID', 'Beneficiaries must be unique');
    }
    if (!Array.isArray(snapshot.entitlements) || snapshot.entitlements.length > maxRows || snapshot.entitlements.some(row => typeof row.claimed !== 'boolean')) fail('INTEGRATION_CHAIN_UNAVAILABLE', 'Invalid entitlement rows', 503);
    const rights = snapshot.entitlements.filter(row => !selected || selected.has(row.wallet));
    if (selected && rights.length !== selected.size) fail('INTEGRATION_BENEFICIARY', 'An explicitly selected beneficiary has no snapshot right', 409);
    const assetMint = publicAddress(view.instrument!.settlementMint), assetDecimals = view.instrument!.settlementDecimals;
    if (!Number.isInteger(assetDecimals) || assetDecimals < 0 || assetDecimals > 18) fail('INTEGRATION_CHAIN_UNAVAILABLE', 'Invalid settlement token precision', 503);
    const payable = rights.filter(row => !row.claimed && BigInt(integer(row.amountMinor)) > 0n);
    if (selected && payable.length !== selected.size) fail('INTEGRATION_ALREADY_PAID', 'A selected right is zero or already paid', 409);
    if (!payable.length) fail('INTEGRATION_ALREADY_PAID', 'There are no positive unpaid rights to plan', 409);
    const outbox = payable.map(row => {
      const wallet = publicAddress(row.wallet), holder = registry.holders.find(holder => holder.wallet === wallet);
      if (!holder) fail('INTEGRATION_BENEFICIARY', 'Snapshot wallet has no registry mapping', 409);
      const payload: PaymentPayload = {...registry.scope, action, ...(couponId === undefined ? {} : {couponId}), snapshotAddress, beneficiaryWallet: wallet, holderRef: holder.holderRef, assetMint, assetDecimals, amountMinor: integer(row.amountMinor), units: integer(row.units)};
      const paymentId = integrationDigest({...registry.scope, action, ...(couponId === undefined ? {} : {couponId}), snapshotAddress, beneficiaryWallet: wallet});
      return {kind: 'outbox', schemaVersion: 1, paymentId, digest: integrationDigest(payload), ownerOperationId: id, payload, externalStatus: 'planned', lastSequence: '0', acknowledgementDigests: [], disputeDigests: []} as Outbox;
    });
    if (new Set(outbox.map(row => row.paymentId)).size !== outbox.length) fail('INTEGRATION_CHAIN_UNAVAILABLE', 'Duplicate immutable entitlement identity', 503);
    const core = {scope: registry.scope, registryImportId: registry.importId, registryDigest: registry.digest, adapter: 'sandbox-file' as const, action, ...(couponId === undefined ? {} : {couponId}), snapshotAddress, paymentIds: outbox.map(row => row.paymentId), totalMinor: integer(outbox.reduce((sum, row) => sum + BigInt(row.payload.amountMinor), 0n).toString())};
    const plan: Plan = {kind: 'settlement-plan', schemaVersion: 1, operationId: id, requestDigest, digest: integrationDigest(core), ...core, createdAt: timestamp(), comparisonContext: view.context, realAssets: false, partnerConnection: 'unverified'};
    return transactionSync(() => {
      const prior = readJson<Plan | null>(planKey(id), null);
      if (prior) { if (prior.requestDigest !== requestDigest) fail('INTEGRATION_CONFLICT', 'Concurrent settlement intent conflict', 409); return {plan: prior, outbox: rowsFor(prior)}; }
      for (const row of outbox) if (readJson(outboxKey(row.paymentId), null)) fail('INTEGRATION_OBLIGATION_EXISTS', 'This economic obligation already has an outbox identity; recover its original plan', 409);
      writeJson(planKey(id), plan); for (const row of outbox) writeJson(outboxKey(row.paymentId), row); return {plan, outbox};
    });
  }
  async function settlementStatus(id: string) {
    const plan = storedPlan(identifier(id)), view = await coherent(plan.scope), snapshot = plan.action === 'coupon' ? view.coupons.find(row => row.id === plan.couponId) : view.redemption;
    const outbox = rowsFor(plan).map(row => {
      const right = snapshot?.snapshotAddress === row.payload.snapshotAddress ? snapshot.entitlements.find(right => right.wallet === row.payload.beneficiaryWallet) : undefined;
      const onChainStatus = !right || typeof right.claimed !== 'boolean' ? 'unknown' : right.claimed ? 'claimed' : 'unclaimed';
      return {...row, onChainStatus, dispatchAllowed: false as const};
    });
    return {plan, outbox, realAssets: false, partnerConnection: 'unverified', chainContext: view.context};
  }
  async function reconcileAck(value: unknown) {
    const item = verified(value, 'settlement-ack'), p = item.envelope.payload, ackId = identifier(p.ackId), operationId = identifier(p.operationId), paymentId = String(p.paymentId);
    if (!/^[a-f0-9]{64}$/.test(paymentId) || typeof p.outboxDigest !== 'string' || !/^[a-f0-9]{64}$/.test(p.outboxDigest)) fail('INTEGRATION_INVALID', 'Expected exact outbox hashes');
    const receiptFile = key('integration-ack', ['receipt', item.digest]), prior = readJson<Record<string, unknown> | null>(receiptFile, null);
    if (prior) return prior;
    fresh(item); const plan = storedPlan(operationId); if (!equalScope(plan.scope, item.scope)) fail('INTEGRATION_SCOPE', 'Acknowledgement targets another chain or instrument', 409);
    if (!plan.paymentIds.includes(paymentId)) fail('INTEGRATION_NOT_FOUND', 'Payment does not belong to this settlement plan', 404);
    publicAddress(p.beneficiaryWallet); publicAddress(p.assetMint); integer(p.amountMinor); identifier(p.externalReference);
    if (!['accepted', 'simulated-settled', 'rejected', 'unknown'].includes(String(p.status)) || !Number.isInteger(p.assetDecimals)) fail('INTEGRATION_INVALID', 'Unsupported sandbox acknowledgement status or precision');
    // No RPC send/claim/burn path exists. Metadata acknowledgement remains separate.
    return transactionSync(() => {
      const existing = readJson<Record<string, unknown> | null>(receiptFile, null); if (existing) return existing;
      const row = readJson<Outbox | null>(outboxKey(paymentId), null); if (!row) fail('INTEGRATION_STORAGE', 'Missing durable outbox row', 503);
      if (row.acknowledgementDigests.length + row.disputeDigests.length >= maxAcknowledgements) fail('INTEGRATION_LIMIT', 'Acknowledgement history is full; retain this unresolved obligation', 429);
      const indexFile = key('integration-ack', ['ack-id', item.sourceId, ackId]), nonceFile = key('integration-ack', ['nonce', item.sourceId, item.nonce]), refFile = key('integration-ack', ['reference', item.sourceId, p.externalReference]);
      const indices = [indexFile, nonceFile].map(file => readJson<Index | null>(file, null)), ref = readJson<Index | null>(refFile, null);
      const mismatch = p.outboxDigest !== row.digest || p.beneficiaryWallet !== row.payload.beneficiaryWallet || p.assetMint !== row.payload.assetMint || p.assetDecimals !== row.payload.assetDecimals || p.amountMinor !== row.payload.amountMinor || indices.some(index => index && index.digest !== item.digest) || Boolean(ref && ref.recordId !== paymentId);
      const stale = row.acknowledgementDigests.length > 0 && BigInt(item.sequence) <= BigInt(row.lastSequence);
      const terminalConflict = !stale && ['simulated-settled', 'rejected', 'disputed'].includes(row.externalStatus) && p.status !== row.externalStatus;
      const disputed = mismatch || terminalConflict;
      const receipt = {schemaVersion: 1, ackId, operationId, paymentId, digest: item.digest, authorityFingerprint: item.fingerprint, envelope: item.envelope, receivedAt: timestamp(), disposition: disputed ? 'disputed' : stale ? 'stale' : 'accepted', realAssets: false, bankSettlementVerified: false};
      writeJson(receiptFile, receipt);
      if (disputed) { row.externalStatus = 'disputed'; row.disputeDigests.push(item.digest); }
      else { row.acknowledgementDigests.push(item.digest); if (!stale) { row.externalStatus = String(p.status); row.lastSequence = item.sequence; } }
      if (!disputed && !stale) { writeJson(indexFile, {digest: item.digest, recordId: paymentId}); writeJson(nonceFile, {digest: item.digest, recordId: paymentId}); writeJson(refFile, {digest: item.digest, recordId: paymentId}); }
      writeJson(outboxKey(paymentId), row); return receipt;
    });
  }
  async function auditExport(id: string) {
    const status = await settlementStatus(id), registry = registryStatus(status.plan.registryImportId);
    const acknowledgements = status.outbox.flatMap(row => [...row.acknowledgementDigests, ...row.disputeDigests].map(digest => readJson<Record<string, unknown> | null>(key('integration-ack', ['receipt', digest]), null)));
    const payload = {schema: 'bondtrace.integration-shadow-audit.v1', exportedAt: timestamp(), scope: {realAssets: false, partnerConnection: 'unverified', bankOrKaseIntegration: false, independentlyAttested: false, acknowledgementDoesNotMutateChain: true}, registry, settlement: status, acknowledgements};
    return {payload, integrity: {algorithm: 'sha256', payloadSha256: integrationDigest(payload), meaning: 'integrity-only-not-independent-attestation'}};
  }
  function capabilities() { return {schemaVersion: 1, mode: 'shadow', enabled: authorities.length > 0, adapters: ['sandbox-file'], authorities: authorities.map(({authorityId, sourceId, scopes}) => ({authorityId, sourceId, scopes})), realAssets: false, partnerConnection: 'unverified', bankOrKaseIntegration: false, maxRegistryRows: maxRows}; }
  return {capabilities, importRegistry, registryStatus, planSettlement, settlementStatus, reconcileAck, auditExport};
}
