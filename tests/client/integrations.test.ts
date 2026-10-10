import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {generateKeyPairSync, sign, randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {getAddressDecoder} from '@solana/kit';
import type {IntegrationAuthority, IntegrationState} from '../../server/integrations.ts';

const directory = path.resolve('.local/tests/integrations-' + randomUUID());
process.env.BONDTRACE_DATA_DIR = directory;
const [integration, storage] = await Promise.all([import('../../server/integrations.ts'), import('../../server/storage.ts')]);
after(storage.closeStorage);
const key = (n: number) => String(getAddressDecoder().decode(new Uint8Array(32).fill(n)));
const code = (name: string) => (error: unknown) => error instanceof Error && (error as {code?: string}).code === name;
let next = 0;
function setup() {
  const id = 'fixture_' + ++next, registryPair = generateKeyPairSync('ed25519'), bankPair = generateKeyPairSync('ed25519');
  const publicKey = (pair: typeof bankPair) => (pair.publicKey.export({format: 'der', type: 'spki'}) as Buffer).subarray(-32).toString('base64');
  const authorities: IntegrationAuthority[] = [{authorityId: 'registry_test', sourceId: 'registry_source', publicKeyBase64: publicKey(registryPair), scopes: ['registry']}, {authorityId: 'settlement_test', sourceId: 'settlement_source', publicKeyBase64: publicKey(bankPair), scopes: ['settlement-ack']}];
  let now = Date.parse('2026-10-10T00:00:00.000Z');
  const chain = {network: 'localnet', genesisHash: key(1), programId: key(2), bondAddress: key(40 + next)};
  const state: IntegrationState = {connected: true, instrument: {address: chain.bondAddress, settlementMint: key(3), settlementDecimals: 6, issuedSupply: '15', redeemedSupply: '0'}, context: {commitment: 'confirmed', slot: '100', chainTimestamp: '1791590400'}, reconciliation: {status: 'verified'}, holders: [{wallet: key(11), units: '10'}, {wallet: key(12), units: '5'}], coupons: [{id: '0', snapshotAddress: key(13), basis: 'immutable-record-date-snapshot', entitlements: [{wallet: key(11), units: '10', amountMinor: '500000000', claimed: false}, {wallet: key(12), units: '5', amountMinor: '250000000', claimed: false}]}], redemption: null};
  const identity = {...chain, rpcUrl: 'http://127.0.0.1:8899', observedAt: new Date(now).toISOString()};
  const deps = {authorities, readView: async () => structuredClone(state), readIdentity: async () => identity, now: () => now};
  const service = integration.createIntegrationService(deps);
  const times = () => ({issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600000).toISOString()});
  const signed = (payload: Record<string, unknown>, kind: 'registry' | 'ack' = 'registry') => ({payload, authorityId: kind === 'registry' ? 'registry_test' : 'settlement_test', signatureBase64: sign(null, integration.integrationSigningBytes(payload), kind === 'registry' ? registryPair.privateKey : bankPair.privateKey).toString('base64')});
  const registry = (overrides: Record<string, unknown> = {}) => signed({domain: 'bondtrace.registry-attestation.v1', schemaVersion: 1, importId: id + '_registry', sourceId: 'registry_source', registryRef: id + '_source', nonce: id + '_nonce', sourceSequence: '1', ...times(), mode: 'sandbox', chain, basis: 'current-registered-holdings', holders: state.holders.map((row, index) => ({...row, holderRef: id + '_holder_' + index})), ...overrides});
  const planRequest = (overrides: Record<string, unknown> = {}) => ({operationId: id + '_plan', bondAddress: chain.bondAddress, action: 'coupon', couponId: '0', registryImportId: id + '_registry', adapter: 'sandbox-file', ...overrides});
  const acknowledgement = (plan: Awaited<ReturnType<typeof service.planSettlement>>, index = 0, overrides: Record<string, unknown> = {}) => {
    const row = plan.outbox[index];
    return signed({domain: 'bondtrace.settlement-ack.v1', schemaVersion: 1, ackId: id + '_ack_' + index, sourceId: 'settlement_source', nonce: id + '_ack_nonce_' + index, sourceSequence: '1', ...times(), mode: 'sandbox', chain, operationId: plan.plan.operationId, paymentId: row.paymentId, outboxDigest: row.digest, beneficiaryWallet: row.payload.beneficiaryWallet, assetMint: row.payload.assetMint, assetDecimals: row.payload.assetDecimals, amountMinor: row.payload.amountMinor, externalReference: id + '_external_' + index, status: 'simulated-settled', ...overrides}, 'ack');
  };
  return {id, service, state, chain, deps, authorities, signed, registry, planRequest, acknowledgement, advance: (ms: number) => now += ms};
}

test('signed registry and exact immutable settlement acknowledge without changing a chain claim or burn', async () => {
  const f = setup(), before = structuredClone(f.state), imported = await f.service.importRegistry(f.registry());
  assert.equal(imported.matchStatus, 'matched'); assert.equal(imported.legalRegistryVerified, false);
  const plan = await f.service.planSettlement(f.planRequest());
  assert.equal(plan.plan.totalMinor, '750000000'); assert.equal(plan.outbox.length, 2);
  const ack = f.acknowledgement(plan), receipt = await f.service.reconcileAck(ack);
  assert.equal(receipt.disposition, 'accepted'); assert.equal(receipt.bankSettlementVerified, false);
  assert.deepEqual(await f.service.reconcileAck(ack), receipt);
  assert.deepEqual(f.state, before);
  const status = await f.service.settlementStatus(plan.plan.operationId);
  assert.equal(status.outbox[0].externalStatus, 'simulated-settled'); assert.equal(status.outbox[0].onChainStatus, 'unclaimed'); assert.equal(status.outbox[0].dispatchAllowed, false);
  const exported = await f.service.auditExport(plan.plan.operationId);
  assert.equal(exported.integrity.payloadSha256, integration.integrationDigest(exported.payload));
  assert.equal(exported.payload.scope.bankOrKaseIntegration, false);
});

test('unsigned, tampered, untrusted, wrong-scope and noncanonical registry assertions reject before persistence', async () => {
  const f = setup(), valid = f.registry();
  await assert.rejects(f.service.importRegistry({...valid, signatureBase64: ''}), code('INTEGRATION_SIGNATURE'));
  await assert.rejects(f.service.importRegistry({...valid, payload: {...valid.payload, sourceSequence: '2'}}), code('INTEGRATION_SIGNATURE'));
  await assert.rejects(f.service.importRegistry({...valid, authorityId: 'unknown_authority'}), code('INTEGRATION_AUTHORITY'));
  await assert.rejects(f.service.importRegistry(f.signed({...valid.payload, chain: {...f.chain, genesisHash: key(90)}})), code('INTEGRATION_SCOPE'));
  await assert.rejects(f.service.importRegistry(f.registry({holders: [{wallet: key(11), units: '010', holderRef: 'holder_ref_01'}]})), code('INTEGRATION_AMOUNT'));
  assert.throws(() => f.service.registryStatus(f.id + '_registry'), code('INTEGRATION_NOT_FOUND'));
});

test('registry mismatch is retained honestly and cannot generate a settlement plan', async () => {
  const f = setup(), changed = f.registry({holders: [{wallet: key(11), units: '11', holderRef: 'holder_ref_01'}, {wallet: key(12), units: '4', holderRef: 'holder_ref_02'}]});
  const result = await f.service.importRegistry(changed); assert.equal(result.matchStatus, 'mismatch'); assert.ok(result.mismatches.length);
  await assert.rejects(f.service.planSettlement(f.planRequest()), code('INTEGRATION_REGISTRY'));
});

test('registry IDs, nonces, source sequences and expiry fence replay without overwriting accepted bytes', async () => {
  const f = setup(), envelope = f.registry(), original = await f.service.importRegistry(envelope);
  await assert.rejects(f.service.importRegistry(f.registry({sourceSequence: '2'})), code('INTEGRATION_CONFLICT'));
  await assert.rejects(f.service.importRegistry(f.registry({importId: f.id + '_different', sourceSequence: '2'})), code('INTEGRATION_CONFLICT'));
  await assert.rejects(f.service.importRegistry(f.registry({importId: f.id + '_stale', nonce: f.id + '_new_nonce', sourceSequence: '1'})), code('INTEGRATION_STALE'));
  f.advance(3600001); assert.deepEqual(await f.service.importRegistry(envelope), original);
  await assert.rejects(f.service.importRegistry({...envelope, payload: {...envelope.payload, importId: f.id + '_expired'}}), code('INTEGRATION_SIGNATURE'));
  assert.deepEqual(f.service.registryStatus(f.id + '_registry'), original);
});

test('forecasts, paid/zero selected rights, changed registry and conflicting/double plans cannot create new obligations', async () => {
  const f = setup(); await f.service.importRegistry(f.registry());
  f.state.coupons[0].basis = 'scheduled-forecast'; await assert.rejects(f.service.planSettlement(f.planRequest()), code('INTEGRATION_FORECAST'));
  f.state.coupons[0].basis = 'immutable-record-date-snapshot'; f.state.coupons[0].entitlements[0].claimed = true;
  await assert.rejects(f.service.planSettlement(f.planRequest({holderWallets: [key(11)]})), code('INTEGRATION_ALREADY_PAID'));
  f.state.coupons[0].entitlements[0].claimed = false;
  const first = await f.service.planSettlement(f.planRequest({holderWallets: [key(11)], snapshotAddress: key(13)})); assert.equal(first.plan.totalMinor, '500000000');
  await assert.rejects(f.service.planSettlement(f.planRequest({holderWallets: [key(12)]})), code('INTEGRATION_CONFLICT'));
  await assert.rejects(f.service.planSettlement(f.planRequest({operationId: f.id + '_another', holderWallets: [key(11)]})), code('INTEGRATION_OBLIGATION_EXISTS'));
  f.state.holders[0].units = '9'; f.state.holders[1].units = '6';
  await assert.rejects(f.service.planSettlement(f.planRequest({operationId: f.id + '_changed'})), code('INTEGRATION_REGISTRY_STALE'));
});

test('historic coupon rights survive changed current holdings and principal retirement', async () => {
  const f = setup(); f.state.holders[0].units = '0'; f.state.holders[1].units = '0'; f.state.instrument!.redeemedSupply = '15';
  await f.service.importRegistry(f.registry());
  const plan = await f.service.planSettlement(f.planRequest());
  assert.deepEqual(plan.outbox.map(row => row.payload.units), ['10', '5']); assert.equal(plan.plan.totalMinor, '750000000');
});

test('concurrent new plan identities cannot create two outbox intents for the same economic right', async () => {
  const f = setup(); await f.service.importRegistry(f.registry());
  const results = await Promise.allSettled([f.service.planSettlement(f.planRequest()), f.service.planSettlement(f.planRequest({operationId: f.id + '_parallel'}))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult; assert.ok(code('INTEGRATION_OBLIGATION_EXISTS')(rejected.reason));
});

test('signed amount/beneficiary/asset/digest conflicts quarantine evidence and preserve immutable financial fields', async () => {
  for (const overrides of [{amountMinor: '1'}, {beneficiaryWallet: key(91)}, {assetMint: key(92)}, {outboxDigest: 'f'.repeat(64)}]) {
    const f = setup(); await f.service.importRegistry(f.registry()); const plan = await f.service.planSettlement(f.planRequest()), before = structuredClone(f.state);
    const receipt = await f.service.reconcileAck(f.acknowledgement(plan, 0, overrides)); assert.equal(receipt.disposition, 'disputed');
    const status = await f.service.settlementStatus(plan.plan.operationId); assert.equal(status.outbox[0].externalStatus, 'disputed'); assert.equal(status.outbox[0].payload.amountMinor, '500000000'); assert.deepEqual(f.state, before);
    assert.equal((await f.service.auditExport(plan.plan.operationId)).payload.acknowledgements.length, 1);
  }
});

test('unknown acknowledgement stays nonexecuting and external references cannot settle two obligations', async () => {
  const f = setup(); await f.service.importRegistry(f.registry()); const plan = await f.service.planSettlement(f.planRequest());
  await f.service.reconcileAck(f.acknowledgement(plan, 0, {status: 'unknown', externalReference: 'shared_reference'}));
  const status = await f.service.settlementStatus(plan.plan.operationId); assert.equal(status.outbox[0].externalStatus, 'unknown'); assert.equal(status.outbox[0].dispatchAllowed, false);
  const conflicted = await f.service.reconcileAck(f.acknowledgement(plan, 1, {externalReference: 'shared_reference'})); assert.equal(conflicted.disposition, 'disputed');
});

test('late signed status events retain history without reversing terminal acknowledgement state', async () => {
  const f = setup(); await f.service.importRegistry(f.registry()); const plan = await f.service.planSettlement(f.planRequest());
  await f.service.reconcileAck(f.acknowledgement(plan, 0, {status: 'accepted'}));
  await f.service.reconcileAck(f.acknowledgement(plan, 0, {ackId: f.id + '_final_ack', nonce: f.id + '_final_nonce', sourceSequence: '2'}));
  const late = await f.service.reconcileAck(f.acknowledgement(plan, 0, {ackId: f.id + '_late_ack', nonce: f.id + '_late_nonce', sourceSequence: '1', status: 'accepted'}));
  assert.equal(late.disposition, 'stale'); assert.equal((await f.service.settlementStatus(plan.plan.operationId)).outbox[0].externalStatus, 'simulated-settled');
  assert.equal((await f.service.auditExport(plan.plan.operationId)).payload.acknowledgements.length, 3);
});

test('failure after manifest insertion rolls back every outbox document', async () => {
  const f = setup(); await f.service.importRegistry(f.registry());
  const database = new DatabaseSync(storage.databasePath);
  database.exec("CREATE TRIGGER integration_test_failure BEFORE INSERT ON documents WHEN NEW.key LIKE 'integration-outbox/%' BEGIN SELECT RAISE(ABORT, 'synthetic outbox failure'); END;");
  try { await assert.rejects(f.service.planSettlement(f.planRequest()), /synthetic outbox failure/); }
  finally { database.exec('DROP TRIGGER integration_test_failure'); database.close(); }
  assert.equal(storage.readJson(path.join(directory, 'integration-plan', f.id + '_plan.json'), null), null);
  const successful = await f.service.planSettlement(f.planRequest()); assert.equal(successful.outbox.length, 2);
});

test('restart and restored consistent backup retain the same import, outbox IDs and acknowledgement', async () => {
  const f = setup(), registry = f.registry(); await f.service.importRegistry(registry); const plan = await f.service.planSettlement(f.planRequest()); const ack = f.acknowledgement(plan); await f.service.reconcileAck(ack);
  const backup = storage.backupStorage(path.join(directory, 'backups/integrations.sqlite'));
  storage.closeStorage();
  const restored = path.resolve('.local/tests/integration-restored-' + randomUUID()); fs.mkdirSync(restored, {recursive: true}); fs.copyFileSync(backup.path, path.join(restored, 'metadata.sqlite'), fs.constants.COPYFILE_EXCL);
  const source = `const {createIntegrationService}=await import('./server/integrations.ts');const {closeStorage}=await import('./server/storage.ts');const state=JSON.parse(process.env.INTEGRATION_TEST_STATE),identity=JSON.parse(process.env.INTEGRATION_TEST_IDENTITY);const service=createIntegrationService({authorities:JSON.parse(process.env.INTEGRATION_TEST_AUTHORITIES),readView:async()=>state,readIdentity:async()=>identity});const status=await service.settlementStatus(process.env.INTEGRATION_TEST_ID);closeStorage();console.log(JSON.stringify({paymentIds:status.plan.paymentIds,totalMinor:status.plan.totalMinor,status:status.outbox[0].externalStatus}));`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {windowsHide: true, env: {...process.env, BONDTRACE_DATA_DIR: restored, INTEGRATION_TEST_STATE: JSON.stringify(f.state), INTEGRATION_TEST_IDENTITY: JSON.stringify(await f.deps.readIdentity()), INTEGRATION_TEST_AUTHORITIES: JSON.stringify(f.authorities), INTEGRATION_TEST_ID: plan.plan.operationId}});
  let output = '', errors = ''; child.stdout.on('data', value => output += String(value)); child.stderr.on('data', value => errors += String(value));
  const exit = await new Promise<number | null>((resolve, reject) => { const timer = setTimeout(() => { child.kill(); reject(Error('Integration restart worker timed out')); }, 30000); child.once('error', reject); child.once('close', code => {clearTimeout(timer); resolve(code);}); });
  assert.equal(exit, 0, errors); assert.deepEqual(JSON.parse(output), {paymentIds: plan.plan.paymentIds, totalMinor: '750000000', status: 'simulated-settled'});
  assert.deepEqual(await f.service.importRegistry(registry), f.service.registryStatus(f.id + '_registry'));
  assert.equal((await f.service.reconcileAck(ack)).disposition, 'accepted');
});
