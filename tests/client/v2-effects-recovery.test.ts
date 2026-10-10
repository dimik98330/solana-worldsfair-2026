import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {address, generateKeyPairSigner, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress, getTransactionDecoder} from '@solana/kit';
import {programRpc} from './helpers/program-rpc.ts';
import * as program from '../../packages/client/src/program.ts';

// Synthetic confirmed RPC only; real Kit Ed25519 messages and real SQLite recovery.
// This does not execute SBF, use a live wallet/RPC, or export any generated private key.
const directory = path.resolve('.local/tests/v2-effects-recovery-' + crypto.randomUUID());
process.env.BONDTRACE_DATA_DIR = directory;
fs.mkdirSync(directory, {recursive: true});
const key = (value: number) => getAddressDecoder().decode(new Uint8Array(32).fill(value));
const legacy = {seriesId: '17', bond: await program.deriveBond(key(7), 17n), name: 'Preserved synthetic V1 fixture', settlementMint: key(4), createdAt: '2026-10-08T00:00:00.000Z', rateBps: 0, couponFrequency: 0, roles: {issuer: key(7)}, proposalIds: [], complete: true, accelerated: false};
const legacyFile = path.join(directory, 'fixture.json'), legacyBytes = Buffer.from(JSON.stringify(legacy, null, 2));
fs.writeFileSync(legacyFile, legacyBytes, {flag: 'wx'});
const [transactions, operations, journal, catalog, storage, rpc, store] = await Promise.all([
  import('../../server/transactions.ts'), import('../../server/operations.ts'), import('../../server/journal.ts'),
  import('../../server/catalog.ts'), import('../../server/storage.ts'), import('../../server/rpc.ts'), import('../../server/store.ts'),
]);
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; storage.closeStorage(); });
const u32 = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
const u16 = (value: number) => { const bytes = Buffer.alloc(2); bytes.writeUInt16LE(value); return bytes; };
const u64 = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes; };
const i64 = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigInt64LE(value); return bytes; };
const pk = (value: string) => Buffer.from(getAddressEncoder().encode(address(value)));
function encodeBond(bond: ReturnType<typeof program.decodeBondV2>) {
  const bytes = Buffer.concat([createHash('sha256').update('account:BondV2').digest().subarray(0, 8), Buffer.from([2]),
    ...[bond.issuer, bond.bondMint, bond.settlementMint, bond.vault].map(pk), u64(bond.seriesId), u64(bond.faceValue),
    u16(bond.rateBps), Buffer.from([bond.couponFrequency]), i64(bond.maturityTs), u64(bond.totalIssued), u64(bond.totalRedeemed),
    Buffer.from([bond.state, bond.bump]), u64(bond.revision), ...[bond.holderCount, bond.couponCount, bond.scheduleAppended, bond.nextCouponIndex].map(u32),
    ...[bond.firstRecordTs, bond.nextRecordTs, bond.lastRecordTs, bond.lastPaymentTs].map(i64), u64(bond.couponUnitTotal),
    Buffer.from([bond.activeKind]), u32(bond.activeId), u32(Buffer.byteLength(bond.name)), Buffer.from(bond.name)]);
  assert.ok(bytes.length <= 319); return Buffer.concat([bytes, Buffer.alloc(319 - bytes.length)]);
}
function sqlLiteral(value: string) { return "'" + value.replaceAll("'", "''") + "'"; }
function database(callback: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(path.toNamespacedPath(storage.databasePath));
  try { callback(db); } finally { db.close(); }
}

test('confirmed V2 execute keeps projection pending; failed catalog commit survives restart and same-ID GET projects exactly once', async () => {
  const actor = await generateKeyPairSigner(), seriesId = 27001n, settlement = key(4), genesisHash = key(8);
  const built = await program.initializeIssueV2(actor.address, settlement, seriesId, 'V2 recovery test', 1_000_000n, 400n, 9, 1000, 2);
  const bump = (await getProgramDerivedAddress({programAddress: program.PROGRAM_ID, seeds: [Buffer.from('bond_v2'), pk(actor.address), u64(seriesId)]}))[1];
  const bond: ReturnType<typeof program.decodeBondV2> = {version: 2, issuer: actor.address, bondMint: address(built.mint), settlementMint: settlement, vault: address(built.vault), seriesId, faceValue: 1_000_000n, rateBps: 1000, couponFrequency: 2, maturityTs: 400n, totalIssued: 0n, totalRedeemed: 0n, state: 0, bump, revision: 0n, holderCount: 0, couponCount: 9, scheduleAppended: 0, nextCouponIndex: 0, firstRecordTs: 0n, nextRecordTs: 0n, lastRecordTs: 0n, lastPaymentTs: 0n, couponUnitTotal: 0n, activeKind: 0, activeId: 0, name: 'V2 recovery test'};
  const account = {owner: program.PROGRAM_ID, executable: false, lamports: 1_000_000, data: [encodeBond(bond).toString('base64'), 'base64']};
  const operationId = 'v2_recovery_' + crypto.randomUUID(), action = 'initialize_issue_v2';
  const params = {seriesId: seriesId.toString(), name: bond.name, settlementMint: settlement, faceValueMinor: '1000000', maturityTs: '400', couponCount: '9', rateBps: '1000', couponFrequency: '2', bondAddress: built.bond};
  operations.beginOperation(operationId, action, 'issuer', params);
  operations.updateOperation(operationId, {wallet: actor.address, bond: built.bond, projectionStatus: 'pending'});
  const catalogKey = 'catalog/' + built.bond + '.json';
  database(db => db.exec(`CREATE TABLE v2_test_catalog_audit(kind TEXT NOT NULL);
    CREATE TRIGGER v2_test_catalog_insert AFTER INSERT ON documents WHEN NEW.key=${sqlLiteral(catalogKey)} BEGIN INSERT INTO v2_test_catalog_audit VALUES('insert'); END;
    CREATE TRIGGER v2_test_catalog_update AFTER UPDATE ON documents WHEN NEW.key=${sqlLiteral(catalogKey)} BEGIN INSERT INTO v2_test_catalog_audit VALUES('update'); END;
    CREATE TRIGGER v2_test_catalog_failure BEFORE INSERT ON documents WHEN NEW.key=${sqlLiteral(catalogKey)} BEGIN SELECT RAISE(ABORT,'Synthetic catalog write failure'); END;`));
  let sends = 0, wire = '', signature = '';
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)); let result: unknown;
    const deployment = programRpc(request);
    if (deployment !== undefined) return Response.json({jsonrpc: '2.0', id: request.id, result: deployment});
    switch (request.method) {
      case 'getGenesisHash': result = genesisHash; break;
      case 'getLatestBlockhash': result = {context: {slot: 25}, value: {blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000}}; break;
      case 'simulateTransaction': result = {context: {slot: 25}, value: {err: null, unitsConsumed: 1000, logs: []}}; break;
      case 'getFeeForMessage': result = {context: {slot: 25}, value: 5000}; break;
      case 'sendTransaction': {
        sends++; wire = request.params[0]; signature = rpc.signatureOf(wire);
        const decoded = getTransactionDecoder().decode(Buffer.from(wire, 'base64'));
        assert.ok(await crypto.subtle.verify('Ed25519', actor.keyPair.publicKey, new Uint8Array(decoded.signatures[actor.address]!), new Uint8Array(decoded.messageBytes)));
        assert.equal(journal.receipt(signature)?.signedTransactionBase64, wire);
        assert.equal(operations.findOperation(operationId)?.signature, signature, 'Same ID and signature must persist before relay');
        result = signature; break;
      }
      case 'getSignatureStatuses': result = {context: {slot: 101}, value: [{err: null, slot: 100, confirmationStatus: 'confirmed'}]}; break;
      case 'getAccountInfo': result = {context: {slot: 100}, value: sends && request.params[0] === built.bond ? account : null}; break;
      case 'getTransaction': result = null; break; // No fabricated retained SBF proof.
      default: throw new Error('Unexpected synthetic V2 recovery RPC ' + request.method);
    }
    return Response.json({jsonrpc: '2.0', id: request.id, result});
  };
  const result = await transactions.execute([built.ix], actor, action, [], built.bond, submitted => {
    const release = journal.receipt(submitted)!.programRelease;
    operations.updateOperation(operationId, {signature: submitted, status: 'pending', chainStatus: 'pending', projectionStatus: 'pending', programRelease: release});
    journal.updateReceipt(submitted, {operationId});
  }, built.bond);
  operations.updateOperation(operationId, {status: result.status, chainStatus: result.status, projectionStatus: 'pending'});
  assert.equal(result.status, 'confirmed'); assert.equal(sends, 1);
  const before = journal.receipt(signature)!;
  assert.equal(before.chainStatus, 'confirmed'); assert.equal(before.projectionStatus, 'pending', 'execute must not prematurely complete a V2 catalog projection');
  assert.ok(before.programRelease); assert.equal(before.programRelease.programId, program.PROGRAM_ID);
  assert.match(before.programRelease.sha256, /^[a-f0-9]{64}$/); assert.equal(before.programRelease.genesisHash, genesisHash);
  assert.equal(before.operationId, operationId); assert.equal(before.signedTransactionBase64, wire);
  assert.equal(operations.findOperation(operationId)?.projectionStatus, 'pending');
  assert.equal(catalog.readCatalog(built.bond), null);
  await assert.rejects(operations.operationStatus(operationId), error => error instanceof rpc.AppError && error.code === 'UNKNOWN_STATUS');
  assert.equal(journal.receipt(signature)?.chainStatus, 'confirmed'); assert.equal(journal.receipt(signature)?.projectionStatus, 'pending');
  assert.equal(operations.findOperation(operationId)?.chainStatus, 'confirmed'); assert.equal(operations.findOperation(operationId)?.projectionStatus, 'pending');
  assert.equal(catalog.readCatalog(built.bond), null); assert.equal(sends, 1);
  database(db => assert.equal(db.prepare('SELECT count(*) AS count FROM v2_test_catalog_audit').get()!.count, 0, 'Aborted projection must not publish catalog or its audit'));
  const wireSha256 = createHash('sha256').update(Buffer.from(wire, 'base64')).digest('hex');
  storage.closeStorage();
  database(db => db.exec('DROP TRIGGER v2_test_catalog_failure'));
  // A new process receives public synthetic accounts/IDs only, with no signer/key.
  const source = `import assert from 'node:assert/strict'; import fs from 'node:fs'; import {createHash} from 'node:crypto'; import {DatabaseSync} from 'node:sqlite';
    import {programRpc} from './tests/client/helpers/program-rpc.ts';
    const input=JSON.parse(fs.readFileSync(0,'utf8')); let sends=0;
    globalThis.fetch=async(_url,init)=>{const r=JSON.parse(String(init.body)); let result; const deployment=programRpc(r); if(deployment!==undefined)result=deployment;
      else if(r.method==='getGenesisHash')result=input.genesisHash;
      else if(r.method==='getSignatureStatuses')result={context:{slot:101},value:[{err:null,slot:100,confirmationStatus:'confirmed'}]};
      else if(r.method==='getAccountInfo')result={context:{slot:100},value:r.params[0]===input.bond?input.account:null};
      else if(r.method==='getTransaction')result=null;
      else if(r.method==='sendTransaction'){sends++;throw new Error('Recovery must not relay');} else throw new Error('Unexpected synthetic recovery RPC '+r.method);
      return Response.json({jsonrpc:'2.0',id:r.id,result});};
    const [operations,journal,catalog,storage,store]=await Promise.all([import('./server/operations.ts'),import('./server/journal.ts'),import('./server/catalog.ts'),import('./server/storage.ts'),import('./server/store.ts')]);
    assert.equal(journal.receipt(input.signature).projectionStatus,'pending');assert.equal(operations.findOperation(input.id).projectionStatus,'pending');
    for(let n=0;n<3;n++){const result=await operations.operationStatus(input.id);assert.equal(result.status,'confirmed');assert.equal(result.signature,input.signature);assert.equal(result.projectionStatus,'complete');}
    const record=catalog.readCatalog(input.bond),receipt=journal.receipt(input.signature),operation=operations.findOperation(input.id);
    assert.equal(record.protocolVersion,2);assert.equal(record.roles.issuer,input.issuer);assert.equal(record.seriesId,input.seriesId);assert.equal(record.rateBps,1000);assert.equal(record.couponFrequency,2);assert.equal(record.source,'wallet');
    assert.equal(catalog.listCatalog().filter(r=>r.bond===input.bond).length,1);assert.equal(receipt.chainStatus,'confirmed');assert.equal(receipt.projectionStatus,'complete');assert.equal(operation.chainStatus,'confirmed');assert.equal(operation.projectionStatus,'complete');
    assert.equal(createHash('sha256').update(Buffer.from(receipt.signedTransactionBase64,'base64')).digest('hex'),input.wireSha256);assert.deepEqual(receipt.programRelease,input.release);assert.deepEqual(operation.programRelease,input.release);assert.equal(receipt.genesisHash,input.genesisHash);
    assert.deepEqual(store.fixture(),input.legacy);assert.equal(sends,0);
    const db=new DatabaseSync(storage.databasePath,{readOnly:true});const audit=Number(db.prepare('SELECT count(*) AS count FROM v2_test_catalog_audit').get().count);db.close();assert.equal(audit,1);storage.closeStorage();
    process.stdout.write(JSON.stringify({recovered:true,catalogWrites:audit,sends,signature:input.signature,wireSha256:input.wireSha256}));`;
  const recovered = await new Promise<{recovered: boolean; catalogWrites: number; sends: number}>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {cwd: process.cwd(), windowsHide: true, env: {...process.env}});
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Synthetic V2 restart recovery stalled')); }, 20000);
    child.stdout.on('data', value => { stdout += String(value); }); child.stderr.on('data', value => { stderr += String(value); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); try { assert.equal(code, 0, stderr); resolve(JSON.parse(stdout)); } catch (error) { reject(error); } });
    child.stdin.end(JSON.stringify({id: operationId, signature, bond: built.bond, issuer: actor.address, seriesId: seriesId.toString(), genesisHash, account, wireSha256, release: before.programRelease, legacy}));
  });
  assert.equal(recovered.recovered, true); assert.equal(recovered.catalogWrites, 1); assert.equal(recovered.sends, 0); assert.equal(sends, 1);
  assert.equal(journal.receipt(signature)?.projectionStatus, 'complete'); assert.equal(operations.findOperation(operationId)?.projectionStatus, 'complete');
  assert.deepEqual(store.fixture(), legacy); assert.ok(fs.readFileSync(legacyFile).equals(legacyBytes));
});
