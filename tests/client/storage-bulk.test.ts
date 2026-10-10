import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

// Every file/connection below belongs to fresh synthetic public metadata, never live data.
const directory = path.resolve('.local/tests/storage-bulk-' + crypto.randomUUID());
fs.mkdirSync(directory, {recursive: true});
process.env.BONDTRACE_DATA_DIR = directory;
const storage = await import('../../server/storage.ts');
after(() => storage.closeStorage());
const file = (key: string) => path.join(directory, key);
const rowKey = (index: number) => `operations/row_${String(index).padStart(6, '0')}.json`;
const storageCode = (code: string) => (error: unknown) => error instanceof storage.StorageError && error.code === code;
const replaceLstat = (replacement: typeof fs.lstatSync) => { Object.assign(fs, {lstatSync: replacement}); };
function edit(callback: (db: DatabaseSync) => void) {
  storage.storageDiagnostics();
  const db = new DatabaseSync(path.toNamespacedPath(storage.databasePath));
  try { callback(db); } finally { db.close(); }
}
function seed(count: number) {
  edit(db => {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("DELETE FROM documents WHERE key LIKE 'operations/%'").run();
      const insert = db.prepare('INSERT INTO documents(key,body,updated_at) VALUES(?,?,?)');
      for (let index = 0; index < count; index++) insert.run(rowKey(index), JSON.stringify({id: index, version: 0, amount: '18446744073709551615'}), '2026-10-10T00:00:00.000Z');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
}

test('bulk reads preserve logical-key order, exact amounts, approved integration groups and empty prefixes', () => {
  seed(10);
  assert.deepEqual(storage.readDocuments<{id: number; amount: string}>('operations').map(row => [row.id, row.amount]), Array.from({length: 10}, (_, index) => [index, '18446744073709551615']));
  assert.equal(storage.readDocuments('receipts').length, 0);
  const key = 'integration-outbox/' + 'a'.repeat(64) + '.json';
  storage.writeJson(file(key), {id: 'integration', value: '9007199254740993'});
  assert.deepEqual(storage.readDocuments('integration-outbox'), [{id: 'integration', value: '9007199254740993'}]);
  assert.deepEqual(storage.readDocuments(file(key)), [{id: 'integration', value: '9007199254740993'}]);
});

test('unapproved/outside prefixes, malformed stored keys and inexact JSON fail closed', () => {
  for (const prefix of ['../outside', 'keys', 'operations/../../fixture.json', 'operations\0']) assert.throws(() => storage.readDocuments(prefix), storageCode('STORAGE_INVALID_PATH'));
  edit(db => db.prepare('INSERT INTO documents(key,body,updated_at) VALUES(?,?,?)').run('unexpected.json', '{}', 'now'));
  try { assert.throws(() => storage.readDocuments('operations'), storageCode('STORAGE_INVALID_PATH')); }
  finally { edit(db => db.prepare('DELETE FROM documents WHERE key=?').run('unexpected.json')); }
  edit(db => db.prepare('UPDATE documents SET body=? WHERE key=?').run('{"amount":9007199254740992}', rowKey(0)));
  assert.throws(() => storage.readDocuments('operations'), storageCode('STORAGE_INVALID_JSON'));
  seed(10);
});

test('actual logical-row junction and group junction are rejected even for empty collections', () => {
  seed(2);
  const target = file('bulk-link-target'); fs.mkdirSync(target, {recursive: true});
  fs.mkdirSync(file('operations'), {recursive: true});
  const logicalRow = file(rowKey(0));
  fs.symlinkSync(target, logicalRow, process.platform === 'win32' ? 'junction' : 'dir');
  try { assert.throws(() => storage.readDocuments('operations'), storageCode('STORAGE_UNSAFE_PATH')); }
  finally { fs.unlinkSync(logicalRow); }
  fs.symlinkSync(target, file('receipts'), process.platform === 'win32' ? 'junction' : 'dir');
  try { assert.throws(() => storage.readDocuments('receipts'), storageCode('STORAGE_UNSAFE_PATH')); }
  finally { fs.unlinkSync(file('receipts')); }
});

test('fresh post-read group guard catches a junction introduced during logical-row validation', () => {
  seed(2);
  const original = fs.lstatSync, group = file('operations'), target = file('bulk-link-target');
  let replaced = false;
  replaceLstat(((...args: Parameters<typeof fs.lstatSync>) => {
    if (!replaced && String(args[0]) === file(rowKey(0))) {
      replaced = true; fs.rmdirSync(group); fs.symlinkSync(target, group, process.platform === 'win32' ? 'junction' : 'dir');
    }
    return Reflect.apply(original, fs, args);
  }) as typeof fs.lstatSync);
  try { assert.throws(() => storage.readDocuments('operations'), storageCode('STORAGE_UNSAFE_PATH')); assert.ok(replaced); }
  finally { replaceLstat(original); if (replaced) { fs.unlinkSync(group); fs.mkdirSync(group); } }
});

test('namespace ancestor replacement is refused after close and successful reopen retains the same records', () => {
  seed(2); storage.closeStorage();
  const moved = directory + '-owned-original';
  const ownedRoot = path.resolve('.local/tests') + path.sep;
  assert.ok(path.resolve(directory).startsWith(ownedRoot) && path.resolve(moved).startsWith(ownedRoot));
  fs.renameSync(directory, moved);
  try {
    fs.symlinkSync(moved, directory, process.platform === 'win32' ? 'junction' : 'dir');
    try { assert.throws(() => storage.readDocuments('operations'), storageCode('STORAGE_UNSAFE_PATH')); }
    finally { fs.unlinkSync(directory); }
  } finally { fs.renameSync(moved, directory); }
  assert.equal(storage.readDocuments('operations').length, 2);
});

test('bulk snapshot includes own writes but rollback and reopen cannot publish uncommitted rows', () => {
  seed(2);
  assert.throws(() => storage.transactionSync(() => {
    storage.writeJson(file(rowKey(0)), {id: 0, version: 7});
    assert.equal(storage.readDocuments<{version: number}>('operations')[0].version, 7);
    throw new Error('Synthetic rollback');
  }), /Synthetic rollback/);
  storage.closeStorage();
  assert.deepEqual(storage.readDocuments<{version: number}>('operations').map(row => row.version), [0, 0]);
  const diagnostics = storage.storageDiagnostics();
  assert.equal(diagnostics.journalMode, 'delete'); assert.equal(diagnostics.synchronous, 3);
});

test('one SELECT stays coherent when an actual second process commits every row during filesystem checks', () => {
  seed(100);
  const original = fs.lstatSync, originalPrepare = DatabaseSync.prototype.prepare;
  let documentSelects = 0;
  Object.assign(DatabaseSync.prototype, {prepare(sql: string) {
    if (/^SELECT\b.*\bFROM documents\b/i.test(sql)) documentSelects++;
    return Reflect.apply(originalPrepare, this, [sql]);
  }});
  let committed = false;
  replaceLstat(((...args: Parameters<typeof fs.lstatSync>) => {
    if (!committed && String(args[0]) === file(rowKey(50))) {
      committed = true;
      const source = `import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1]); db.exec("BEGIN IMMEDIATE; UPDATE documents SET body=json_set(body,'$.version',1) WHERE key LIKE 'operations/%'; COMMIT"); db.close();`;
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source, path.toNamespacedPath(storage.databasePath)], {windowsHide: true, encoding: 'utf8', timeout: 15000});
      assert.equal(child.status, 0, child.stderr);
    }
    return Reflect.apply(original, fs, args);
  }) as typeof fs.lstatSync);
  let observed: {version: number}[];
  try { observed = storage.readDocuments<{version: number}>('operations'); }
  finally { replaceLstat(original); Object.assign(DatabaseSync.prototype, {prepare: originalPrepare}); }
  assert.ok(committed); assert.equal(observed!.length, 100);
  assert.equal(documentSelects, 1, 'Bulk metadata must come from one SELECT');
  assert.ok(observed!.every(row => row.version === 0), 'The already selected snapshot must not mix old and new committed rows');
  assert.ok(storage.readDocuments<{version: number}>('operations').every(row => row.version === 1));
});

test('logical-row guard cost grows by one lstat per row, with bounded ancestor scans', () => {
  function probes(count: number) {
    seed(count);
    const original = fs.lstatSync; let calls = 0;
    replaceLstat(((...args: Parameters<typeof fs.lstatSync>) => { calls++; return Reflect.apply(original, fs, args); }) as typeof fs.lstatSync);
    try { assert.equal(storage.readDocuments('operations').length, count); }
    finally { replaceLstat(original); }
    return calls;
  }
  const small = probes(10), large = probes(100);
  assert.equal(large - small, 90, `10 rows=${small}, 100 rows=${large}; ancestor checks must not repeat per row`);
  assert.ok(large < 500, `Bulk read made ${large} lstat calls`);
});
