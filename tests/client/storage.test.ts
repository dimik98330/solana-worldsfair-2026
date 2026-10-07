import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

// Every process is scoped to synthetic metadata under ignored .local/tests.
function isolated(label: string) {
  const directory = path.resolve('.local/tests/storage-' + label + '-' + randomUUID());
  assert.ok(directory.startsWith(path.resolve('.local/tests') + path.sep));
  fs.mkdirSync(directory, {recursive: true});
  return directory;
}
const directory = isolated('main');
process.env.BONDTRACE_DATA_DIR = directory;
const file = (name: string) => path.join(directory, name);
const bond = '11111111111111111111111111111111';
const legacy: Record<string, unknown> = {
  'fixture.json': {name: 'Synthetic legacy metadata', amount: '18446744073709551615'},
  'activity.json': Array.from({length: 220}, (_, index) => ({signature: 'synthetic-' + index, status: index % 2 ? 'unknown' : 'pending'})),
  'prepared.json': [{id: 'prepared-synthetic', signature: 'signed-synthetic', status: 'unknown'}],
  'operations.json': [{id: 'operation-synthetic', signature: 'signed-synthetic', status: 'pending'}],
  'lifetimes.json': {'signed-synthetic': 100},
  ['catalog/' + bond + '.json']: {bond, name: 'Synthetic catalog metadata'},
};
fs.mkdirSync(file('catalog'));
fs.mkdirSync(file('keys'));
fs.mkdirSync(file('prepared'));
const neverImportPrepared = 'prepared/' + 'a'.repeat(64) + '.json';
fs.writeFileSync(file(neverImportPrepared), JSON.stringify({name: 'Never import nonlegacy namespace files'}));
for (const [key, value] of Object.entries(legacy)) fs.writeFileSync(file(key), JSON.stringify(value));
// Intentionally malformed sentinels, never actual key material.
for (const name of ['keys/do-not-import.json', 'issuer.keypair.json', 'credentials.json', 'auth.json', '.env']) fs.writeFileSync(file(name), 'NOT PUBLIC METADATA');
const sourceHashes = Object.fromEntries(Object.keys(legacy).map(key => [key, hash(file(key))]));
const storage = await import('../../server/storage.ts');
after(() => storage.closeStorage());
function hash(filename: string) { return createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); }
function isStorageCode(code: string) { return (error: unknown) => error instanceof storage.StorageError && error.code === code; }
const storageUrl = pathToFileURL(path.resolve('server/storage.ts')).href;
function worker(source: string, dataDirectory = directory) {
  return new Promise<{code: number | null; stdout: string; stderr: string}>((resolve, reject) => {
    const prelude = `import fs from 'node:fs'; import path from 'node:path'; import {DatabaseSync} from 'node:sqlite'; import * as storage from ${JSON.stringify(storageUrl)}; const directory = process.env.BONDTRACE_DATA_DIR; const file = name => path.join(directory, name);\n`;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', prelude + source], {cwd: process.cwd(), env: {...process.env, BONDTRACE_DATA_DIR: dataDirectory}, windowsHide: true});
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated storage worker timed out')); }, 30_000);
    child.once('close', code => { clearTimeout(timer); resolve({code, stdout, stderr}); });
  });
}
async function success(source: string, dataDirectory = directory) {
  const result = await worker(source, dataDirectory);
  assert.equal(result.code, 0, result.stderr);
  return result;
}

test('lazy storage imports only public legacy metadata atomically and retains every pending record', () => {
  assert.equal(fs.existsSync(file('metadata.sqlite')), false, 'Importing the module must not open or migrate a database');
  const original = fs.readFileSync;
  const originalOpen = fs.openSync;
  const reads: string[] = [];
  fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    if (typeof args[0] === 'string') reads.push(args[0]);
    return Reflect.apply(original, fs, args);
  }) as typeof fs.readFileSync;
  fs.openSync = ((...args: Parameters<typeof fs.openSync>) => {
    const filename = String(args[0]);
    reads.push(filename);
    if (/(?:keys|keypair|credentials|auth\.json|\.env)/i.test(filename)) throw new Error('Credential sentinel must never be opened');
    return Reflect.apply(originalOpen, fs, args);
  }) as typeof fs.openSync;
  try {
    for (const [key, value] of Object.entries(legacy)) assert.deepEqual(storage.readJson(file(key), null), value);
  } finally { fs.readFileSync = original; fs.openSync = originalOpen; }
  assert.equal(reads.some(name => /(?:keys|keypair|credentials|auth\.json|\.env)/i.test(name)), false);
  for (const [key, value] of Object.entries(sourceHashes)) assert.equal(hash(file(key)), value, 'Legacy bytes changed');
  assert.equal(storage.readJson<Array<{status: string}>>(file('activity.json'), []).length, 220);
  assert.equal(storage.readJson(file(neverImportPrepared), null), null);
  const db = new DatabaseSync(storage.databasePath, {readOnly: true});
  try {
    const imports = db.prepare('SELECT document_key, source_sha256 FROM legacy_imports').all();
    assert.equal(imports.length, 6);
    for (const row of imports) assert.equal(row.source_sha256, sourceHashes[String(row.document_key)]);
    assert.ok(db.prepare('SELECT value FROM storage_meta WHERE key = ?').get('legacy_import_complete'));
  } finally { db.close(); }
  assert.deepEqual(storage.listDocuments('catalog'), [file('catalog/' + bond + '.json')]);
  assert.deepEqual(storage.listDocuments(path.join(directory, 'catalog')), [file('catalog/' + bond + '.json')]);
  const diagnostic = storage.storageDiagnostics({integrityCheck: true});
  assert.equal(diagnostic.schemaVersion, 1);
  assert.equal(diagnostic.journalMode, 'delete');
  assert.equal(diagnostic.synchronous, 3);
  assert.equal(diagnostic.busyTimeoutMs, 5_000);
  assert.equal(diagnostic.documentCount, 6);
  assert.deepEqual(diagnostic.integrityCheck, ['ok']);
  assert.deepEqual(storage.storageDiagnostics().integrityCheck, [], 'Routine diagnostics do not rescan the database');
});

test('BigInt remains exact JSON text and invalid/oversized updates cannot replace stored records', () => {
  storage.writeJson(file('fixture.json'), {amount: (1n << 64n) - 1n, counter: 1});
  assert.deepEqual(storage.readJson(file('fixture.json'), null), {amount: '18446744073709551615', counter: 1});
  const before = storage.readJson(file('fixture.json'), null);
  for (const invalid of [1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => storage.writeJson(file('fixture.json'), {amount: invalid}), isStorageCode('STORAGE_INVALID_JSON'));
  const cycle: {self?: unknown} = {}; cycle.self = cycle;
  assert.throws(() => storage.writeJson(file('fixture.json'), cycle), isStorageCode('STORAGE_INVALID_JSON'));
  assert.throws(() => storage.writeJson(file('fixture.json'), undefined), isStorageCode('STORAGE_INVALID_JSON'));
  assert.throws(() => storage.writeJson(file('fixture.json'), {large: 'x'.repeat(storage.maxDocumentBytes)}), isStorageCode('STORAGE_LIMIT'));
  assert.deepEqual(storage.readJson(file('fixture.json'), null), before);
  const current = storage.updateJson(file('fixture.json'), {amount: '0', counter: 0}, value => ({...value, counter: value.counter + 1}));
  assert.equal(current.counter, 2);
  assert.equal(current.amount, '18446744073709551615');
});

test('signature, lifetime, operation and activity writes commit or roll back together', async () => {
  storage.transactionSync(() => {
    storage.writeJson(file('prepared.json'), [{id: 'prepared', signature: 'accepted', status: 'unknown'}]);
    storage.writeJson(file('operations.json'), [{id: 'operation', signature: 'accepted', status: 'pending'}]);
    storage.writeJson(file('lifetimes.json'), {accepted: 12345});
    storage.writeJson(file('activity.json'), [{signature: 'accepted', status: 'pending'}]);
  });
  const documents = ['prepared.json', 'operations.json', 'lifetimes.json', 'activity.json'];
  const before = documents.map(key => storage.readJson(file(key), null));
  assert.throws(() => storage.transactionSync(() => {
    for (const key of documents) storage.writeJson(file(key), {signature: 'not-committed'});
    throw new Error('Synthetic failure before RPC send');
  }), /Synthetic failure/);
  assert.deepEqual(documents.map(key => storage.readJson(file(key), null)), before);
  const restarted = await success(`console.log(JSON.stringify(['prepared.json','operations.json','lifetimes.json','activity.json'].map(key => storage.readJson(file(key), null)))); storage.closeStorage();`);
  assert.deepEqual(JSON.parse(restarted.stdout), before);
  assert.match(restarted.stderr, /ExperimentalWarning.*SQLite/i, 'The runtime experimental warning must remain visible');
});

test('nested savepoints isolate failed inner work and an outer failure undoes released inner writes', () => {
  storage.writeJson(file('fixture.json'), {counter: 0});
  storage.transactionSync(() => {
    storage.updateJson(file('fixture.json'), {counter: 0}, value => ({counter: value.counter + 1}));
    assert.throws(() => storage.transactionSync(() => {
      storage.writeJson(file('fixture.json'), {counter: 99});
      throw new Error('inner failed');
    }), /inner failed/);
    assert.equal(storage.readJson(file('fixture.json'), {counter: 0}).counter, 1);
    storage.updateJson(file('fixture.json'), {counter: 0}, value => ({counter: value.counter + 1}));
  });
  assert.equal(storage.readJson(file('fixture.json'), {counter: 0}).counter, 2);
  assert.throws(() => storage.transactionSync(() => {
    storage.transactionSync(() => storage.writeJson(file('fixture.json'), {counter: 100}));
    throw new Error('outer failed');
  }), /outer failed/);
  assert.equal(storage.readJson(file('fixture.json'), {counter: 0}).counter, 2);
  let invoked = false;
  assert.throws(() => storage.transactionSync(async () => { invoked = true; }), isStorageCode('STORAGE_ASYNC'));
  assert.equal(invoked, false);
  assert.throws(() => storage.transactionSync(() => {
    storage.writeJson(file('fixture.json'), {counter: 999});
    return Promise.resolve('not synchronous');
  }), isStorageCode('STORAGE_ASYNC'));
  assert.equal(storage.readJson(file('fixture.json'), {counter: 0}).counter, 2);
  storage.transactionSync(() => assert.throws(() => storage.closeStorage(), isStorageCode('STORAGE_TRANSACTION')));
});

test('completed migration never replays changed, corrupt or newly created legacy JSON after restart', async () => {
  storage.writeJson(file('fixture.json'), {name: 'Canonical database state'});
  fs.writeFileSync(file('fixture.json'), '{broken stale legacy JSON');
  const extraBond = '22222222222222222222222222222222';
  fs.writeFileSync(file('catalog/' + extraBond + '.json'), JSON.stringify({name: 'stale catalog file'}));
  storage.closeStorage();
  assert.deepEqual(storage.readJson(file('fixture.json'), null), {name: 'Canonical database state'});
  assert.equal(storage.readJson(file('catalog/' + extraBond + '.json'), null), null);
  const result = await success(`console.log(JSON.stringify({fixture:storage.readJson(file('fixture.json'),null), migrations:storage.storageDiagnostics().migrationCount})); storage.closeStorage();`);
  assert.deepEqual(JSON.parse(result.stdout), {fixture: {name: 'Canonical database state'}, migrations: 6});
});

test('path traversal, credential names and unsafe catalog prefixes fail before access', () => {
  for (const name of ['keys/do-not-import.json', 'issuer.keypair.json', 'auth.json', 'credentials.json', '.env', '../fixture.json']) {
    assert.throws(() => storage.readJson(file(name), null), isStorageCode('STORAGE_INVALID_PATH'));
    assert.throws(() => storage.writeJson(file(name), {}), isStorageCode('STORAGE_INVALID_PATH'));
  }
  assert.throws(() => storage.readJson('fixture.json', null), isStorageCode('STORAGE_INVALID_PATH'));
  for (const prefix of ['../', '../other', 'keys', "catalog/' OR 1=1 --"]) assert.throws(() => storage.listDocuments(prefix), isStorageCode('STORAGE_INVALID_PATH'));
});

test('per-record jobs, receipt journals and chain identity support independent atomic documents', () => {
  const prepared = 'prepared/' + 'b'.repeat(64) + '.json';
  const operation = 'operations/synthetic-job_123.json';
  const receipt = 'receipts/' + '1'.repeat(88) + '.json';
  storage.transactionSync(() => {
    storage.writeJson(file(prepared), {signature: 'synthetic-receipt', status: 'unknown'});
    storage.writeJson(file(operation), {signature: 'synthetic-receipt', status: 'pending'});
    storage.writeJson(file(receipt), {lastValidBlockHeight: 123, status: 'unknown'});
    storage.writeJson(file('journal-migration.json'), {version: 1});
    storage.writeJson(file('chain-identity.json'), {genesisHash: 'synthetic-genesis'});
  });
  assert.deepEqual(storage.listDocuments('prepared'), [file(prepared)]);
  assert.deepEqual(storage.listDocuments(path.join(directory, 'operations')), [file(operation)]);
  assert.deepEqual(storage.listDocuments('receipts'), [file(receipt)]);
  assert.equal(fs.existsSync(file(operation)), false, 'Logical documents require no legacy JSON file');
  assert.equal(storage.readJson(file(prepared), {status: ''}).status, 'unknown');
  for (const invalid of ['prepared/secret.json', 'operations/short.json', 'receipts/auth.json', 'receipts/' + '0'.repeat(88) + '.json', 'operations/runtime.keypair.json']) assert.throws(() => storage.writeJson(file(invalid), {}), isStorageCode('STORAGE_INVALID_PATH'));
});

test('a corrupt legacy source rolls back the entire import and preserves original bytes', async () => {
  const badDirectory = isolated('corrupt-legacy');
  fs.writeFileSync(path.join(badDirectory, 'activity.json'), '[{"status":"pending"}]');
  fs.writeFileSync(path.join(badDirectory, 'operations.json'), '{corrupt');
  const hashes = ['activity.json', 'operations.json'].map(name => hash(path.join(badDirectory, name)));
  const result = await success(`try { storage.readJson(file('activity.json'),[]); throw new Error('Expected migration rejection'); } catch(error) { if(error.code !== 'STORAGE_INVALID_JSON') throw error; console.log(error.code); }`, badDirectory);
  assert.match(result.stdout, /STORAGE_INVALID_JSON/);
  assert.deepEqual(['activity.json', 'operations.json'].map(name => hash(path.join(badDirectory, name))), hashes);
  const db = new DatabaseSync(path.join(badDirectory, 'metadata.sqlite'), {readOnly: true});
  try {
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 0);
    assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type='table'").get()!.count, 0);
  } finally { db.close(); }
});

test('corrupt and unrelated SQLite databases fail closed without replacing their data', async () => {
  const corruptDirectory = isolated('corrupt-database'), corruptFile = path.join(corruptDirectory, 'metadata.sqlite');
  fs.writeFileSync(corruptFile, 'Synthetic corrupt database bytes');
  const before = hash(corruptFile), failed = await worker(`storage.readJson(file('fixture.json'),null);`, corruptDirectory);
  assert.notEqual(failed.code, 0);
  assert.equal(hash(corruptFile), before);
  const unrelatedDirectory = isolated('unrelated-database'), unrelatedFile = path.join(unrelatedDirectory, 'metadata.sqlite');
  const db = new DatabaseSync(unrelatedFile); db.exec('CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES (\'retained\');'); db.close();
  const unrelatedBefore = hash(unrelatedFile);
  await success(`try { storage.readJson(file('fixture.json'),null); throw new Error('Expected schema rejection'); } catch(error) { if(error.code !== 'STORAGE_SCHEMA') throw error; }`, unrelatedDirectory);
  assert.equal(hash(unrelatedFile), unrelatedBefore);
});

test('directory junctions/symlinks in the namespace or catalog are rejected', async () => {
  const target = isolated('junction-target'), namespaceParent = isolated('junction-parent');
  const namespace = path.join(namespaceParent, 'redirected');
  fs.symlinkSync(target, namespace, process.platform === 'win32' ? 'junction' : 'dir');
  await success(`try { storage.readJson(file('fixture.json'),null); throw new Error('Expected path rejection'); } catch(error) { if(error.code !== 'STORAGE_UNSAFE_PATH') throw error; }`, namespace);
  assert.equal(fs.existsSync(path.join(target, 'metadata.sqlite')), false);
  const catalogDirectory = isolated('catalog-junction');
  fs.symlinkSync(target, path.join(catalogDirectory, 'catalog'), process.platform === 'win32' ? 'junction' : 'dir');
  await success(`try { storage.listDocuments('catalog'); throw new Error('Expected path rejection'); } catch(error) { if(error.code !== 'STORAGE_UNSAFE_PATH') throw error; }`, catalogDirectory);
});

test('abrupt process exit rolls back a spilled multi-document transaction on reopen', async () => {
  const crashDirectory = isolated('crash');
  await success(`storage.transactionSync(() => { storage.writeJson(file('operations.json'),[{signature:'durably-accepted',status:'unknown'}]); storage.writeJson(file('lifetimes.json'),{'durably-accepted':777}); }); storage.closeStorage();`, crashDirectory);
  const failed = await worker(`storage.transactionSync(() => { storage.writeJson(file('operations.json'),[{signature:'partial',data:'x'.repeat(4*1024*1024)}]); storage.writeJson(file('lifetimes.json'),{partial:999}); process.exit(41); });`, crashDirectory);
  assert.equal(failed.code, 41);
  assert.ok(fs.existsSync(path.join(crashDirectory, 'metadata.sqlite-journal')), 'Expected an unclean rollback journal');
  const restarted = await success(`console.log(JSON.stringify({operations:storage.readJson(file('operations.json'),[]),lifetimes:storage.readJson(file('lifetimes.json'),{}),integrity:storage.verifyStorageIntegrity()})); storage.closeStorage();`, crashDirectory);
  assert.deepEqual(JSON.parse(restarted.stdout), {operations: [{signature: 'durably-accepted', status: 'unknown'}], lifetimes: {'durably-accepted': 777}, integrity: ['ok']});
});

test('concurrent processes serialize read/modify/write without lost journal updates', async () => {
  const concurrentDirectory = isolated('concurrency');
  const original = path.join(concurrentDirectory, 'fixture.json');
  fs.writeFileSync(original, JSON.stringify({counter: 0}));
  const originalHash = hash(original);
  const runs = await Promise.all(Array.from({length: 4}, () => worker(`for(let i=0;i<40;i++) storage.updateJson(file('fixture.json'),{counter:0},value=>({counter:value.counter+1})); storage.closeStorage();`, concurrentDirectory)));
  for (const result of runs) assert.equal(result.code, 0, result.stderr);
  const final = await success(`console.log(JSON.stringify({value:storage.readJson(file('fixture.json'),null),integrity:storage.verifyStorageIntegrity()})); storage.closeStorage();`, concurrentDirectory);
  assert.deepEqual(JSON.parse(final.stdout), {value: {counter: 160}, integrity: ['ok']});
  assert.equal(hash(original), originalHash);
});

test('backup has a verified consistent snapshot, restores on restart, and never overwrites a destination', async () => {
  storage.writeJson(file('fixture.json'), {amount: '18446744073709551615', status: 'recovery-required'});
  const destination = file('backups/synthetic.sqlite');
  const backup = storage.backupStorage(destination);
  assert.equal(backup.sha256, hash(destination));
  assert.ok(backup.bytes > 0);
  assert.deepEqual(backup.integrityCheck, ['ok']);
  assert.throws(() => storage.backupStorage(destination), isStorageCode('STORAGE_BACKUP_EXISTS'));
  assert.throws(() => storage.backupStorage(path.resolve('.local/outside.sqlite')), isStorageCode('STORAGE_INVALID_PATH'));
  storage.transactionSync(() => assert.throws(() => storage.backupStorage(file('backups/in-transaction.sqlite')), isStorageCode('STORAGE_TRANSACTION')));
  const restoreDirectory = isolated('restored');
  fs.copyFileSync(destination, path.join(restoreDirectory, 'metadata.sqlite'), fs.constants.COPYFILE_EXCL);
  const restarted = await success(`console.log(JSON.stringify({fixture:storage.readJson(file('fixture.json'),null),integrity:storage.verifyStorageIntegrity()})); storage.closeStorage();`, restoreDirectory);
  assert.deepEqual(JSON.parse(restarted.stdout), {fixture: {amount: '18446744073709551615', status: 'recovery-required'}, integrity: ['ok']});
  assert.equal(hash(destination), backup.sha256);
});
