import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign, randomUUID} from 'node:crypto';
import {getAddressDecoder} from '@solana/kit';
import type {IntegrationAuthority, IntegrationState} from '../server/integrations.ts';

// Actual loopback HTTP counterparties + durable product adapter; synthetic chain DTO.
// No chain transaction or external financial service is invoked by this harness.
const dataDirectory = path.resolve('.local/integration-sandbox/' + randomUUID());
process.env.BONDTRACE_DATA_DIR = dataDirectory;
process.env.BONDTRACE_DEPLOYMENT = 'local';
process.env.BONDTRACE_NETWORK = 'localnet';
process.env.BONDTRACE_STORAGE_BACKEND = 'sqlite';
const [{createIntegrationService, integrationSigningBytes}, storage] = await Promise.all([import('../server/integrations.ts'), import('../server/storage.ts')]);
const registryPair = generateKeyPairSync('ed25519'), settlementPair = generateKeyPairSync('ed25519');
const rawPublicKey = (pair: typeof registryPair) => (pair.publicKey.export({format: 'der', type: 'spki'}) as Buffer).subarray(-32).toString('base64');
const authorities: IntegrationAuthority[] = [{authorityId: 'sandbox_registry', sourceId: 'sandbox_registry_source', publicKeyBase64: rawPublicKey(registryPair), scopes: ['registry']}, {authorityId: 'sandbox_settlement', sourceId: 'sandbox_settlement_source', publicKeyBase64: rawPublicKey(settlementPair), scopes: ['settlement-ack']}];
const key = (n: number) => String(getAddressDecoder().decode(new Uint8Array(32).fill(n)));
const chain = {network: 'localnet', genesisHash: key(1), programId: key(2), bondAddress: key(3)};
const state: IntegrationState = {connected: true, instrument: {address: chain.bondAddress, settlementMint: key(4), settlementDecimals: 6, issuedSupply: '18', redeemedSupply: '0'}, context: {commitment: 'confirmed', slot: '100', source: 'synthetic-chain-fixture'}, reconciliation: {status: 'verified'}, holders: [{wallet: key(11), units: '10'}, {wallet: key(12), units: '5'}, {wallet: key(13), units: '3'}], coupons: [{id: '0', snapshotAddress: key(5), basis: 'immutable-record-date-snapshot', entitlements: [{wallet: key(11), units: '10', amountMinor: '500000000', claimed: false}, {wallet: key(12), units: '5', amountMinor: '250000000', claimed: false}, {wallet: key(13), units: '3', amountMinor: '150000000', claimed: false}]}], redemption: null};
const stateBefore = structuredClone(state), identity = {...chain, rpcUrl: 'synthetic-chain-fixture', observedAt: new Date().toISOString()};
const deps = {authorities, readView: async () => structuredClone(state), readIdentity: async () => identity};
let service = createIntegrationService(deps);
function signed(payload: Record<string, unknown>, kind: 'registry' | 'settlement') {
  return {payload, authorityId: kind === 'registry' ? 'sandbox_registry' : 'sandbox_settlement', signatureBase64: sign(null, integrationSigningBytes(payload), kind === 'registry' ? registryPair.privateKey : settlementPair.privateKey).toString('base64')};
}
const times = () => ({issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString()});
async function body(request: http.IncomingMessage) {
  const pieces: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 65000) throw Error('Sandbox body too large'); pieces.push(chunk); }
  return JSON.parse(Buffer.concat(pieces).toString('utf8')) as Record<string, any>;
}
function server(handler: (request: http.IncomingMessage) => Promise<unknown>) {
  return http.createServer(async (request, response) => {
    try { const value = await handler(request); response.writeHead(200, {'content-type': 'application/json'}); response.end(JSON.stringify(value)); }
    catch (error) { const item = error as {status?: number; code?: string}; response.writeHead(item.status ?? 400, {'content-type': 'application/json'}); response.end(JSON.stringify({error: {code: item.code ?? 'SANDBOX_INVALID'}})); }
  });
}
async function listen(value: http.Server) {
  await new Promise<void>((resolve, reject) => { value.once('error', reject); value.listen(0, '127.0.0.1', resolve); });
  return 'http://127.0.0.1:' + (value.address() as {port: number}).port;
}
async function close(value: http.Server) { value.closeAllConnections(); await new Promise<void>((resolve, reject) => value.close(error => error ? reject(error) : resolve())); }
const counterpartAcknowledgements = new Map<string, ReturnType<typeof signed>>();
const counterparty = server(async request => {
  if (request.method !== 'POST' || request.url !== '/sandbox/acknowledgements') throw Error('Unknown sandbox route');
  const {operationId, row} = await body(request), existing = counterpartAcknowledgements.get(row.paymentId); if (existing) return existing;
  const ack = signed({domain: 'bondtrace.settlement-ack.v1', schemaVersion: 1, ackId: 'sandbox_ack_' + row.paymentId.slice(0, 16), sourceId: 'sandbox_settlement_source', nonce: 'sandbox_nonce_' + row.paymentId.slice(0, 16), sourceSequence: '1', ...times(), mode: 'sandbox', chain, operationId, paymentId: row.paymentId, outboxDigest: row.digest, beneficiaryWallet: row.payload.beneficiaryWallet, assetMint: row.payload.assetMint, assetDecimals: row.payload.assetDecimals, amountMinor: row.payload.amountMinor, externalReference: 'sandbox_ref_' + row.paymentId.slice(0, 16), status: 'simulated-settled'}, 'settlement');
  counterpartAcknowledgements.set(row.paymentId, ack); return ack;
});
const adapter = server(async request => {
  if (request.method === 'GET' && request.url === '/api/integrations/capabilities') return service.capabilities();
  if (request.method === 'GET' && request.url === '/api/integrations/settlement/sandbox_plan_01') return service.settlementStatus('sandbox_plan_01');
  if (request.method === 'GET' && request.url === '/api/integrations/audit/sandbox_plan_01') return service.auditExport('sandbox_plan_01');
  const value = await body(request);
  if (request.method === 'POST' && request.url === '/api/integrations/registry/import') return service.importRegistry(value);
  if (request.method === 'POST' && request.url === '/api/integrations/settlement/plan') return service.planSettlement(value);
  if (request.method === 'POST' && request.url === '/api/integrations/settlement/reconcile') return service.reconcileAck(value);
  throw Error('Unknown sandbox route');
});
let adapterListening = false, counterpartyListening = false;
try {
  const counterpartOrigin = await listen(counterparty); counterpartyListening = true;
  const origin = await listen(adapter); adapterListening = true;
  async function post(url: string, value: unknown) {
    const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(value), signal: AbortSignal.timeout(15000)});
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result as any;
  }
  const assertion = signed({domain: 'bondtrace.registry-attestation.v1', schemaVersion: 1, importId: 'sandbox_registry_01', sourceId: 'sandbox_registry_source', registryRef: 'sandbox_instrument_01', nonce: 'sandbox_registry_nonce_01', sourceSequence: '1', ...times(), mode: 'sandbox', chain, basis: 'current-registered-holdings', holders: state.holders.map((holder, index) => ({...holder, holderRef: 'sandbox_holder_0' + index}))}, 'registry');
  const imported = await post(origin + '/api/integrations/registry/import', assertion); assert.equal(imported.matchStatus, 'matched');
  const request = {operationId: 'sandbox_plan_01', bondAddress: chain.bondAddress, action: 'coupon', couponId: '0', registryImportId: 'sandbox_registry_01', adapter: 'sandbox-file'};
  const planned = await post(origin + '/api/integrations/settlement/plan', request); assert.equal(planned.plan.totalMinor, '900000000');
  for (const row of planned.outbox) {
    const acknowledgement = await post(counterpartOrigin + '/sandbox/acknowledgements', {operationId: planned.plan.operationId, row});
    const first = await post(origin + '/api/integrations/settlement/reconcile', acknowledgement);
    assert.deepEqual(await post(origin + '/api/integrations/settlement/reconcile', acknowledgement), first);
  }
  const before = await (await fetch(origin + '/api/integrations/settlement/sandbox_plan_01')).json() as any;
  assert.ok(before.outbox.every((row: any) => row.externalStatus === 'simulated-settled' && row.onChainStatus === 'unclaimed' && row.dispatchAllowed === false));
  storage.closeStorage(); service = createIntegrationService(deps);
  const reopened = await post(origin + '/api/integrations/settlement/plan', request);
  assert.deepEqual(reopened.plan.paymentIds, planned.plan.paymentIds);
  const audit = await (await fetch(origin + '/api/integrations/audit/sandbox_plan_01')).json() as any;
  assert.equal(audit.payload.acknowledgements.length, 3); assert.deepEqual(state, stateBefore);
  fs.mkdirSync(dataDirectory, {recursive: true}); fs.writeFileSync(path.join(dataDirectory, 'sandbox-audit.json'), JSON.stringify(audit, null, 2));
  const result = {schemaVersion: 1, passed: true, mode: 'sandbox', transport: 'actual-loopback-http', chainReadSource: 'synthetic-chain-fixture', actualChainVerified: false, partnerConnection: 'unverified', realAssets: false, matchedHolders: 3, totalMinor: '900000000', uniquePaymentIds: new Set(planned.plan.paymentIds).size, signedAcknowledgements: 3, replayAfterReopen: true, acknowledgementDidNotMutateChain: true, dataDirectory};
  fs.writeFileSync(path.join(dataDirectory, 'sandbox-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally {
  if (adapterListening) await close(adapter); if (counterpartyListening) await close(counterparty); storage.closeStorage();
}
