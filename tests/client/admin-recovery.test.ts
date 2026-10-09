import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {programRpc} from './helpers/program-rpc.ts';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {address, generateKeyPairSigner, getAddressDecoder, getAddressEncoder, getTransactionDecoder, getTransactionEncoder, type KeyPairSigner, type SignatureBytes} from '@solana/kit';
import {getMintEncoder, TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import * as program from '../../packages/client/src/program.ts';
import type {PreparedRecord} from '../../server/prepared.ts';
import type {Fixture} from '../../server/store.ts';

// Real Kit messages/Ed25519 signatures against synthetic RPC only. Neither RPC
// nor the on-disk evidence below belongs to the live application or demo.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/admin-recovery_' + crypto.randomUUID());
const [{prepareAction}, {submitPrepared}, {operationStatus}, {findPrepared}, {readCatalog, listCatalog}, {saveFixture, fixture}, {signatureOf, AppError}, {readJson, closeStorage}] = await Promise.all([
  import('../../server/actions.ts'), import('../../server/transactions.ts'), import('../../server/operations.ts'),
  import('../../server/prepared.ts'), import('../../server/catalog.ts'), import('../../server/store.ts'), import('../../server/rpc.ts'),
  import('../../server/storage.ts'),
]);
const originalFetch = globalThis.fetch;
type SyntheticAccount = {owner: string; executable: boolean; data: [string, string]; lamports: number};
const accounts = new Map<string, SyntheticAccount>();
const key = (id: number) => getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i === 0 ? id : 7));
const settlementMint = key(4), legacyIssuer = key(7);
const genesisHash = key(8);
const legacyFixtureFile = path.join(process.env.BONDTRACE_DATA_DIR!, 'fixture.json');
const legacyFixture: Fixture = {seriesId: '1', bond: await program.deriveBond(legacyIssuer, 1n), name: 'Original synthetic legacy fixture', settlementMint, createdAt: '2026-10-08T00:00:00.000Z', rateBps: 0, couponFrequency: 0, roles: {issuer: legacyIssuer}, proposalIds: [], complete: true, accelerated: false};
const legacyFixtureBytes = Buffer.from(JSON.stringify(legacyFixture, null, 2));
assert.equal(fs.existsSync(path.join(process.env.BONDTRACE_DATA_DIR!, 'metadata.sqlite')), false, 'Seed legacy data before the lazy first SQLite open');
fs.mkdirSync(path.dirname(legacyFixtureFile), {recursive: true});
fs.writeFileSync(legacyFixtureFile, legacyFixtureBytes, {flag: 'wx'});
let nextSeries = 2000n, sends = 0, mode: 'normal' | 'send-loss' = 'normal';
let failedAccount: string | null = null;
let onSend: (wire: string) => void = () => {};
function store(key: string, bytes: ArrayLike<number>, owner: string) {
  accounts.set(key, {owner, executable: false, data: [Buffer.from(Array.from(bytes)).toString('base64'), 'base64'], lamports: 1_000_000});
}
globalThis.fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body)); let result: unknown;
  const deployment=programRpc(request);if(deployment!==undefined)return Response.json({jsonrpc:'2.0',id:request.id,result:deployment});
  switch (request.method) {
    case 'getGenesisHash': result = genesisHash; break;
    case 'getAccountInfo': {
      const key = String(request.params[0]);
      if (sends > 0 && key === failedAccount) throw new TypeError('Synthetic post-confirm account transport failure');
      result = {context: {slot: 25}, value: accounts.get(key) ?? null}; break;
    }
    case 'getLatestBlockhash': result = {context: {slot: 25}, value: {blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000}}; break;
    case 'simulateTransaction': result = {context: {slot: 25}, value: {err: null, unitsConsumed: 1000, logs: []}}; break;
    case 'getFeeForMessage': result = {context: {slot: 25}, value: 5000}; break;
    case 'sendTransaction': {
      sends++; onSend(request.params[0]);
      if (mode === 'send-loss') throw new TypeError('Synthetic send response lost after acceptance');
      result = signatureOf(request.params[0]); break;
    }
    case 'getSignatureStatuses': result = {context: {slot: 101}, value: [{err: null, slot: 100, confirmationStatus: 'confirmed'}]}; break;
    default: throw new Error('Unexpected synthetic RPC method ' + request.method);
  }
  return Response.json({jsonrpc: '2.0', id: request.id, result});
};
after(() => { globalThis.fetch = originalFetch; closeStorage(); });
const u64 = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes; };
const i64 = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigInt64LE(value); return bytes; };
const u32 = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
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
async function setup() {
  accounts.clear(); sends = 0; mode = 'normal'; failedAccount = null; onSend = () => {};
  const actor = await generateKeyPairSigner(), seriesId = ++nextSeries;
  const clock = Buffer.alloc(40); clock.writeBigInt64LE(100n, 32);
  store('SysvarC1ock11111111111111111111111111111111', clock, program.SYSTEM);
  store(settlementMint, getMintEncoder().encode({mintAuthority: actor.address, supply: 1_000_000_000n, decimals: 6, isInitialized: true, freezeAuthority: null}), TOKEN_PROGRAM_ADDRESS);
  const currentFixture = {...legacyFixture, name: 'Current synthetic fixture', createdAt: new Date().toISOString()};
  saveFixture(currentFixture);
  assert.deepEqual(fixture(), currentFixture);
  const fixtureBytes = fs.readFileSync(legacyFixtureFile);
  assert.ok(fixtureBytes.equals(legacyFixtureBytes), 'SQLite writes must preserve the original legacy JSON bytes');
  const params = {seriesId: '0' + seriesId.toString(), name: '  Recovery issue  ', settlementMint, faceValueMinor: '1000000', maturityTs: '400', coupons: JSON.stringify([{recordTs: '200', paymentTs: '250', unitAmount: '50000'}])};
  const prepared = await prepareAction({action: 'initialize_issue', walletAddress: actor.address, params});
  const bondAddress = prepared.summary.instrumentAddress;
  const bond: ReturnType<typeof program.decodeBond> = {issuer: actor.address, bondMint: await program.derive('bond_mint', bondAddress), settlementMint, vault: await program.derive('vault', bondAddress), seriesId, name: 'Recovery issue', faceValue: 1_000_000n, maturityTs: 400n, totalIssued: 0n, totalRedeemed: 0n, state: 0, bump: 255, nextCouponIndex: 0, principalClaimedMask: 0, holderWallets: [], couponTerms: [{recordTs: 200n, paymentTs: 250n, unitAmount: 50_000n}], redemptionUnits: []};
  const normalized = {seriesId: seriesId.toString(), name: 'Recovery issue', settlementMint, faceValueMinor: '1000000', maturityTs: '400', coupons: [{recordTs: '200', paymentTs: '250', unitAmount: '50000'}]};
  assert.equal(sends, 0);
  assert.deepEqual(findPrepared(prepared.operationId)?.metadata, normalized);
  assert.deepEqual('issueTerms' in prepared.summary ? prepared.summary.issueTerms : undefined, normalized);
  assert.equal(readCatalog(bondAddress), null, 'Preparation must not write the new catalog record');
  onSend = wire => {
    const record = readJson<PreparedRecord|null>(path.join(process.env.BONDTRACE_DATA_DIR!, 'prepared', prepared.operationId + '.json'), null);
    assert.ok(record, 'The prepared per-record SQLite document must exist before send');
    assert.equal(record.signature, signatureOf(wire), 'Signature must persist before any send response');
    assert.deepEqual(record.metadata, normalized, 'Normalized metadata must persist before relay');
    assert.equal(record.wallet, actor.address); assert.equal(record.bond, bondAddress);
    store(bondAddress, encodeBond(bond), program.PROGRAM_ID);
  };
  return {actor, prepared, bondAddress, normalized, fixtureBytes, currentFixture};
}
async function signedWire(actor: KeyPairSigner, base64: string) {
  const transaction = getTransactionDecoder().decode(Buffer.from(base64, 'base64'));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', actor.keyPair.privateKey, new Uint8Array(transaction.messageBytes))) as SignatureBytes;
  return Buffer.from(getTransactionEncoder().encode({...transaction, signatures: {...transaction.signatures, [actor.address]: signature}})).toString('base64');
}
function unchangedLegacy(bytes: Buffer, expectedCurrent: Fixture) {
  assert.ok(fs.readFileSync(legacyFixtureFile).equals(bytes));
  assert.ok(bytes.equals(legacyFixtureBytes));
  assert.deepEqual(fixture(), expectedCurrent, 'Recovery must preserve the current canonical fixture independently of legacy JSON');
}
async function recoverInFreshProcess(operationId: string, expectedSignature: string, bond: string) {
  // stdin carries only public synthetic accounts/IDs/transaction signature.
  // No test signer/key material is exported or passed into this process.
  const source = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    const input=JSON.parse(fs.readFileSync(0,'utf8'));
    const accounts=new Map(input.accounts);
    let sends=0;
    globalThis.fetch=async (_url,init)=>{
      const request=JSON.parse(String(init.body)); let result;
      if(request.method==='getGenesisHash')result=input.genesisHash;
      else if(request.method==='getSignatureStatuses')result={value:[{err:null,slot:100,confirmationStatus:'confirmed'}],context:{slot:101}};
      else if(request.method==='getAccountInfo')result={value:accounts.get(request.params[0])??null,context:{slot:25}};
      else if(request.method==='sendTransaction'){sends++;throw new Error('Recovery subprocess may not send');}
      else throw new Error('Unexpected recovery RPC '+request.method);
      return Response.json({jsonrpc:'2.0',id:request.id,result});
    };
    const [{operationStatus},{findPrepared},{readCatalog}]=await Promise.all([
      import(${JSON.stringify(new URL('../../server/operations.ts', import.meta.url).href)}),
      import(${JSON.stringify(new URL('../../server/prepared.ts', import.meta.url).href)}),
      import(${JSON.stringify(new URL('../../server/catalog.ts', import.meta.url).href)})
    ]);
    const record=findPrepared(input.operationId);
    assert.equal(record.signature,input.expectedSignature);assert.ok(record.metadata);
    assert.equal(readCatalog(input.bond),null);
    const recovered=await operationStatus(input.operationId);
    const catalog=readCatalog(input.bond);
    assert.equal(recovered.status,'confirmed');assert.equal(recovered.signature,input.expectedSignature);
    assert.equal(catalog.bond,record.bond);assert.equal(catalog.roles.issuer,record.wallet);
    assert.equal(catalog.seriesId,record.metadata.seriesId);assert.equal(catalog.settlementMint,record.metadata.settlementMint);
    assert.equal(sends,0);
    process.stdout.write(JSON.stringify({status:recovered.status,signature:recovered.signature,metadataSurvived:true,matchingCatalog:true,sends}));
  `;
  return new Promise<{status: string; signature: string; metadataSurvived: boolean; matchingCatalog: boolean; sends: number}>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {cwd: process.cwd(), env: {...process.env}, windowsHide: true});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Synthetic restart recovery exceeded 15 seconds')); }, 15_000);
    child.stdout.on('data', bytes => { stdout += bytes.toString(); if (stdout.length > 16_384) child.kill(); });
    child.stderr.on('data', bytes => { stderr += bytes.toString(); if (stderr.length > 16_384) child.kill(); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); try { assert.equal(code, 0, stderr); resolve(JSON.parse(stdout)); } catch (error) { reject(error); } });
    child.stdin.end(JSON.stringify({operationId, expectedSignature, bond, genesisHash, accounts: [...accounts]}));
  });
}

test('creation send-response loss survives process restart and recovers persisted terms without a second send', async () => {
  const {actor, prepared, bondAddress, normalized, fixtureBytes, currentFixture} = await setup();
  const wire = await signedWire(actor, prepared.transactionBase64), signature = signatureOf(wire);
  mode = 'send-loss';
  await assert.rejects(submitPrepared(wire), (error: unknown) => error instanceof AppError && error.code === 'UNKNOWN_STATUS');
  assert.equal(findPrepared(prepared.operationId)?.signature, signature);
  assert.deepEqual(findPrepared(prepared.operationId)?.metadata, normalized);
  assert.equal(readCatalog(bondAddress), null); assert.equal(sends, 1);
  mode = 'normal';
  const restarted = await recoverInFreshProcess(prepared.operationId, signature, bondAddress);
  assert.equal(restarted.metadataSurvived, true); assert.equal(restarted.matchingCatalog, true); assert.equal(restarted.sends, 0);
  const sameOperation = await operationStatus(prepared.operationId);
  assert.equal(sameOperation.status, 'confirmed'); assert.equal(sameOperation.signature, signature);
  assert.equal(readCatalog(bondAddress)?.source, 'wallet'); assert.equal(listCatalog().filter(item => item.bond === bondAddress).length, 1);
  const replay = await submitPrepared(wire); assert.equal(replay.signature, signature); assert.equal(replay.status, 'confirmed');
  assert.equal(sends, 1); unchangedLegacy(fixtureBytes, currentFixture);
});

for (const failingRead of ['instrument', 'settlement mint'] as const) {
  test(`post-confirm ${failingRead} fetch failure keeps the signature and retries only metadata reconciliation`, async () => {
    const {actor, prepared, bondAddress, fixtureBytes, currentFixture} = await setup();
    const wire = await signedWire(actor, prepared.transactionBase64), signature = signatureOf(wire);
    failedAccount = failingRead === 'instrument' ? bondAddress : settlementMint;
    await assert.rejects(submitPrepared(wire), (error: unknown) => error instanceof AppError && error.code === 'UNKNOWN_STATUS');
    assert.equal(findPrepared(prepared.operationId)?.signature, signature);
    assert.notEqual(findPrepared(prepared.operationId)?.status, 'error');
    assert.equal(readCatalog(bondAddress), null); assert.equal(sends, 1);
    failedAccount = null;
    const recovered = await operationStatus(prepared.operationId);
    assert.equal(recovered.signature, signature); assert.equal(recovered.status, 'confirmed');
    assert.equal(readCatalog(bondAddress)?.roles.issuer, actor.address);
    assert.equal(listCatalog().filter(item => item.bond === bondAddress).length, 1);
    const replay = await submitPrepared(wire); assert.equal(replay.status, 'confirmed'); assert.equal(replay.signature, signature);
    assert.equal(sends, 1); unchangedLegacy(fixtureBytes, currentFixture);
  });
}
