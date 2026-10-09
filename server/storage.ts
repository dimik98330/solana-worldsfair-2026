import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {localDir,storageBackend,postgresOptions} from './config.ts';
import {PostgresDocumentStore} from './postgres-document-store.ts';
import {PostgresBridgeError} from './postgres-bridge.ts';
import {RemoteStorageError} from './remote-postgres-engine.mjs';
import {RemoteDocumentStateError} from './remote-document-state.ts';
import {materializePostgresBackup} from './postgres-backup.ts';

/** Only public metadata belongs here. Role keys remain in their existing files. */
export const schemaVersion = 1;
export const maxDocumentBytes = 8 * 1024 * 1024;
export const databasePath = path.join(localDir, 'metadata.sqlite');
const applicationId = 0x42545243; // BTRC, to reject unrelated SQLite files.
const busyTimeoutMs = 5_000;
const legacyRootDocuments = ['fixture.json', 'activity.json', 'prepared.json', 'operations.json', 'lifetimes.json'];
const rootDocuments = [...legacyRootDocuments, 'journal-migration.json', 'chain-identity.json', 'runtime-readiness.json'];
const catalogDocument = /^catalog\/[1-9A-HJ-NP-Za-km-z]{32,44}\.json$/;
const recordDocuments = [/^prepared\/[a-f0-9]{64}\.json$/, /^operations\/[A-Za-z0-9_-]{8,100}\.json$/, /^receipts\/[1-9A-HJ-NP-Za-km-z]{60,100}\.json$/];
const documentDirectories = ['catalog', 'prepared', 'operations', 'receipts'];
let database: DatabaseSync | undefined;
let transactionDepth = 0;
let savepointId = 0;
let remote:PostgresDocumentStore|undefined;

export class StorageError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
  }
}
function fail(code: string, message: string): never { throw new StorageError(code, message); }
function withRemote<T>(callback:(store:PostgresDocumentStore)=>T):T{
 try{
  if(!remote){safeNamespace();if(statIfPresent(databasePath)||legacyFiles().length)fail('STORAGE_MIGRATION_REQUIRED','Choose an empty scratch namespace; local metadata must be explicitly migrated, never replaced');remote=new PostgresDocumentStore(postgresOptions!);}
  return callback(remote);
 }catch(error){if(error instanceof PostgresBridgeError||error instanceof RemoteStorageError||error instanceof RemoteDocumentStateError)throw new StorageError(error.code.startsWith('STORAGE_')?error.code:'STORAGE_LIMIT','Remote public metadata could not be acknowledged; retain existing identifiers and stop new relays');throw error;}
}
function isWithin(directory: string, target: string) {
  const relative = path.relative(directory, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function statIfPresent(file: string): fs.Stats | undefined {
  try { return fs.lstatSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
/** Reject junctions/symlinks in every existing ancestor, including ignored .local. */
function safeDirectories(directory: string) {
  let current = path.parse(directory).root;
  const pieces = directory.slice(current.length).split(path.sep).filter(Boolean);
  for (const piece of pieces) {
    current = path.join(current, piece);
    const info = statIfPresent(current);
    if (!info) return;
    if (info.isSymbolicLink() || !info.isDirectory()) fail('STORAGE_UNSAFE_PATH', 'Storage requires regular local directories');
  }
}
function safeFile(file: string) {
  safeDirectories(path.dirname(file));
  const info = statIfPresent(file);
  if (info && (info.isSymbolicLink() || !info.isFile())) fail('STORAGE_UNSAFE_PATH', 'Storage requires regular local files');
  return info;
}
function safeNamespace() {
  const ignoredRoot = path.resolve('.local');
  if (!path.isAbsolute(localDir) || !isWithin(ignoredRoot, localDir) || localDir === ignoredRoot) fail('STORAGE_INVALID_PATH', 'Storage must stay inside the ignored project .local directory');
  safeDirectories(localDir);
  for (const suffix of ['', '-journal', '-wal', '-shm']) safeFile(databasePath + suffix);
}
function validKey(key: string) {
  if (!rootDocuments.includes(key) && !catalogDocument.test(key) && !recordDocuments.some(pattern => pattern.test(key))) fail('STORAGE_INVALID_PATH', 'Only approved public metadata documents can be stored');
  return key;
}
function documentKey(file: string) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0')) fail('STORAGE_INVALID_PATH', 'A document requires an absolute local path');
  const resolved = path.resolve(file);
  if (!isWithin(localDir, resolved) || resolved === localDir) fail('STORAGE_INVALID_PATH', 'Document path must remain inside its storage namespace');
  const key = validKey(path.relative(localDir, resolved).split(path.sep).join('/'));
  safeNamespace();
  safeFile(resolved);
  return key;
}
function stringify(value: unknown) {
  let body: string | undefined;
  try {
    body = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'bigint') return item.toString();
      if (typeof item === 'number' && !Number.isSafeInteger(item)) fail('STORAGE_INVALID_JSON', 'Numbers must be safe integers; monetary values require decimal strings or BigInt');
      return item;
    });
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('STORAGE_INVALID_JSON', 'Document cannot be represented as JSON', {cause: error});
  }
  if (body === undefined) fail('STORAGE_INVALID_JSON', 'Document must contain a JSON value');
  if (Buffer.byteLength(body, 'utf8') > maxDocumentBytes) fail('STORAGE_LIMIT', 'Document exceeds the storage byte limit; existing records were retained');
  return body;
}
function parse<T>(body: string): T {
  if (Buffer.byteLength(body, 'utf8') > maxDocumentBytes) fail('STORAGE_LIMIT', 'Stored document exceeds the storage byte limit');
  try {
    const value: unknown = JSON.parse(body);
    stringify(value); // Also rejects lossy numeric legacy values, NaN and overflow.
    return value as T;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('STORAGE_INVALID_JSON', 'Stored public metadata is not valid JSON', {cause: error});
  }
}
function integrity(db: DatabaseSync) {
  const results = db.prepare('PRAGMA integrity_check').all().map(row => String(row.integrity_check));
  if (results.length !== 1 || results[0] !== 'ok') fail('STORAGE_CORRUPT', 'SQLite integrity check failed; database was retained for recovery');
  return results;
}
function legacyFiles() {
  // This list is deliberately narrower than the current database document namespaces.
  const files = legacyRootDocuments.map(key => path.join(localDir, key)).filter(file => safeFile(file));
  const directory = path.join(localDir, 'catalog');
  safeDirectories(directory);
  if (statIfPresent(directory)) {
    for (const entry of fs.readdirSync(directory)) {
      if (catalogDocument.test('catalog/' + entry)) {
        const file = path.join(directory, entry);
        safeFile(file);
        files.push(file);
      }
    }
  }
  return files.sort();
}
function importLegacy(db: DatabaseSync) {
  if (db.prepare('SELECT value FROM storage_meta WHERE key = ?').get('legacy_import_complete')) return;
  const insert = db.prepare('INSERT INTO documents (key, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING');
  const mark = db.prepare('INSERT INTO legacy_imports (document_key, source_sha256, source_bytes, imported_at) VALUES (?, ?, ?, ?)');
  for (const file of legacyFiles()) {
    const before = safeFile(file)!;
    if (before.size > maxDocumentBytes) fail('STORAGE_LIMIT', 'Legacy public metadata exceeds the storage byte limit');
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const opened = fs.fstatSync(descriptor);
      // Windows lstat reports dev=0 while fstat returns a volume id; file id is stable.
      if (!opened.isFile() || opened.size > maxDocumentBytes || (before.dev !== 0 && opened.dev !== before.dev) || opened.ino !== before.ino) fail('STORAGE_UNSAFE_PATH', 'Legacy metadata changed while opening');
      bytes = fs.readFileSync(descriptor);
      const after = fs.fstatSync(descriptor);
      if (bytes.byteLength > maxDocumentBytes || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) fail('STORAGE_UNSAFE_PATH', 'Legacy metadata changed while reading');
      const current = safeFile(file);
      if (!current || current.ino !== opened.ino || current.size !== opened.size || current.mtimeMs !== opened.mtimeMs) fail('STORAGE_UNSAFE_PATH', 'Legacy metadata path changed while reading');
    } finally { fs.closeSync(descriptor); }
    let source: string;
    try { source = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch { return fail('STORAGE_INVALID_JSON', 'Legacy public metadata is not valid UTF-8'); }
    const body = stringify(parse(source)), key = documentKey(file), now = new Date().toISOString();
    insert.run(key, body, now);
    mark.run(key, createHash('sha256').update(bytes).digest('hex'), bytes.byteLength, now);
  }
  // An absent file is absent at the migration boundary. Never replay stale JSON later.
  db.prepare('INSERT INTO storage_meta (key, value) VALUES (?, ?)').run('legacy_import_complete', new Date().toISOString());
}
function openDatabase() {
  safeNamespace();
  if (database) return database;
  fs.mkdirSync(localDir, {recursive: true});
  safeNamespace();
  if (!statIfPresent(databasePath)) {
    try { fs.closeSync(fs.openSync(databasePath, 'wx', 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  safeNamespace();
  // SQLite's Windows VFS also opens a longer rollback-journal filename.
  // Node fs supports long paths already; give SQLite the extended absolute path too.
  const db = new DatabaseSync(path.toNamespacedPath(databasePath), {enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false, allowExtension: false});
  let begun = false;
  try {
    // EXTRA includes FULL and syncs the containing directory after DELETE-journal unlink.
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA trusted_schema = OFF; PRAGMA temp_store = MEMORY; PRAGMA synchronous = EXTRA;');
    db.exec('BEGIN IMMEDIATE'); begun = true;
    // Inspect schema and migration marker under the same lock, including first-open races.
    const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
    const identity = Number(db.prepare('PRAGMA application_id').get()!.application_id);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
    if (version !== 0 && (version !== schemaVersion || identity !== applicationId)) fail('STORAGE_SCHEMA', 'Unsupported or unrelated SQLite storage; no migration was attempted');
    if (version === 0 && (identity !== 0 || tables.length !== 0)) fail('STORAGE_SCHEMA', 'Unrecognized SQLite storage; existing database was retained');
    integrity(db);
    const journal = String(db.prepare('PRAGMA journal_mode').get()!.journal_mode);
    // New SQLite files use DELETE. Do not silently convert an unexpected WAL database.
    if (journal !== 'delete') fail('STORAGE_SCHEMA', 'SQLite storage requires the DELETE rollback journal');
    if (version === 0) {
      db.exec(`CREATE TABLE IF NOT EXISTS documents (
        key TEXT PRIMARY KEY NOT NULL,
        body TEXT NOT NULL CHECK (json_valid(body)),
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS storage_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS legacy_imports (
        document_key TEXT PRIMARY KEY NOT NULL,
        source_sha256 TEXT NOT NULL,
        source_bytes INTEGER NOT NULL,
        imported_at TEXT NOT NULL
      ) STRICT;
      PRAGMA application_id = 1112822339;
      PRAGMA user_version = 1;`);
    }
    importLegacy(db);
    db.exec('COMMIT'); begun = false;
    fs.chmodSync(databasePath, 0o600);
    database = db;
    return db;
  } catch (error) {
    try { if (begun) db.exec('ROLLBACK'); } finally { db.close(); }
    throw error;
  }
}
function rejectAsync(callback: Function) {
  if (callback.constructor.name === 'AsyncFunction' || callback.constructor.name === 'AsyncGeneratorFunction') fail('STORAGE_ASYNC', 'Storage transactions require synchronous callbacks');
}
function rejectThenable(value: unknown) {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && typeof (value as {then?: unknown}).then === 'function') {
    // Consume a rejected promise while rolling back; callers must never await in this scope.
    void Promise.resolve(value).catch(() => {});
    fail('STORAGE_ASYNC', 'Storage transactions cannot return a promise or thenable');
  }
}
/** BEGIN IMMEDIATE protects read/modify/write across processes; nested calls use savepoints. */
export function transactionSync<T>(callback: () => T): T {
  rejectAsync(callback);
  if(storageBackend==='postgres')return withRemote(store=>store.transactionSync(()=>{const result=callback();rejectThenable(result);safeNamespace();return result;}));
  const db = openDatabase(), outer = transactionDepth === 0, savepoint = 'bondtrace_' + ++savepointId;
  db.exec(outer ? 'BEGIN IMMEDIATE' : 'SAVEPOINT ' + savepoint);
  transactionDepth++;
  try {
    const result = callback();
    rejectThenable(result);
    safeNamespace();
    db.exec(outer ? 'COMMIT' : 'RELEASE SAVEPOINT ' + savepoint);
    return result;
  } catch (error) {
    try { db.exec(outer ? 'ROLLBACK' : 'ROLLBACK TO SAVEPOINT ' + savepoint + '; RELEASE SAVEPOINT ' + savepoint); }
    catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Storage operation failed and rollback could not be verified'); }
    throw error;
  } finally { transactionDepth--; }
}
export function readJson<T>(absoluteFile: string, fallback: T): T {
  const key = documentKey(absoluteFile);
  if(storageBackend==='postgres')return withRemote(store=>{const body=store.read(key);return body===undefined?fallback:parse<T>(body);});
  const db = openDatabase();
  const row = db.prepare('SELECT body FROM documents WHERE key = ?').get(key);
  return row ? parse<T>(String(row.body)) : fallback;
}
export function writeJson(absoluteFile: string, value: unknown): void {
  const key = documentKey(absoluteFile), body = stringify(value);
  if(storageBackend==='postgres'){withRemote(store=>store.write(key,body));return;}
  transactionSync(() => {
    openDatabase().prepare('INSERT INTO documents (key, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at').run(key, body, new Date().toISOString());
  });
}
export function updateJson<T>(absoluteFile: string, fallback: T, mutator: (current: T) => T): T {
  rejectAsync(mutator);
  documentKey(absoluteFile);
  return transactionSync(() => {
    const current = readJson(absoluteFile, structuredClone(fallback)), next = mutator(current);
    rejectThenable(next);
    writeJson(absoluteFile, next);
    return parse<T>(stringify(next));
  });
}
/** Returns absolute logical filenames; these files need not exist after legacy import. */
export function listDocuments(prefix?: string): string[] {
  let keyPrefix = '';
  if (prefix !== undefined) {
    const candidate = path.isAbsolute(prefix) ? path.resolve(prefix) : path.resolve(localDir, prefix);
    if (!isWithin(localDir, candidate)) fail('STORAGE_INVALID_PATH', 'Document prefix must remain inside its storage namespace');
    keyPrefix = path.relative(localDir, candidate).split(path.sep).join('/').replace(/\/$/, '');
    if (keyPrefix && !documentDirectories.includes(keyPrefix)) validKey(keyPrefix);
    safeDirectories(documentDirectories.includes(keyPrefix) ? candidate : path.dirname(candidate));
  }
  const keys=storageBackend==='postgres'?withRemote(store=>store.keys()):openDatabase().prepare('SELECT key FROM documents ORDER BY key').all().map(row=>String(row.key));
  return keys.map(key => validKey(key))
    .filter(key => !keyPrefix || key === keyPrefix || key.startsWith(keyPrefix + '/'))
    .map(key => path.join(localDir, ...key.split('/')));
}
export interface StorageDiagnostics {
  backend?:'sqlite'|'postgres';databasePath: string; schemaVersion: number; sqliteVersion: string|null; journalMode: string;
  synchronous: number|null; busyTimeoutMs: number|null; documentCount: number; migrationCount: number; integrityCheck: string[];
  remote?:ReturnType<PostgresDocumentStore['diagnostics']>;
}
export function storageDiagnostics(options: {integrityCheck?: boolean} = {}): StorageDiagnostics {
  if(storageBackend==='postgres')return withRemote(store=>{const observation=store.diagnostics(true);if(options.integrityCheck)store.exportSnapshot();return {backend:'postgres',databasePath:'remote-postgresql-public-metadata',schemaVersion:1,sqliteVersion:null,journalMode:'provider-managed-WAL',synchronous:null,busyTimeoutMs:null,documentCount:observation.documentCount,migrationCount:observation.migrationCount,integrityCheck:options.integrityCheck?['consistent-public-document-export-validated']:[],remote:observation};});
  const db = openDatabase();
  return {
    backend:'sqlite',databasePath, schemaVersion: Number(db.prepare('PRAGMA user_version').get()!.user_version),
    sqliteVersion: String(db.prepare('SELECT sqlite_version() AS version').get()!.version),
    journalMode: String(db.prepare('PRAGMA journal_mode').get()!.journal_mode),
    synchronous: Number(db.prepare('PRAGMA synchronous').get()!.synchronous),
    busyTimeoutMs: Number(db.prepare('PRAGMA busy_timeout').get()!.timeout),
    documentCount: Number(db.prepare('SELECT count(*) AS count FROM documents').get()!.count),
    migrationCount: Number(db.prepare('SELECT count(*) AS count FROM legacy_imports').get()!.count), integrityCheck: options.integrityCheck ? integrity(db) : [],
  };
}
export function verifyStorageIntegrity(): string[] {if(storageBackend==='postgres'){withRemote(store=>store.exportSnapshot());return ['consistent-public-document-export-validated'];}return integrity(openDatabase()); }
/** Fresh writer fencing before signing or sending; native SQLite uses its existing local guards. */
export function assertStorageRelayReady(){if(storageBackend==='postgres')withRemote(store=>store.assertWritable());}
/** Explicit readiness POST probes only this public metadata marker, never a financial intent. */
export function verifyStorageWrite(): {verified: true; checkedAt: string} {
  const marker = path.join(localDir, 'runtime-readiness.json'), nonce = crypto.randomUUID(), checkedAt = new Date().toISOString();
  transactionSync(() => {writeJson(marker, {nonce, checkedAt}); if (readJson<{nonce: string}|null>(marker, null)?.nonce !== nonce) fail('STORAGE_INTEGRITY', 'Readiness write/read verification failed');});
  return {verified: true, checkedAt};
}
/** A consistent public-metadata snapshot. No automatic restore, overwrite or key backup. */
export function backupStorage(absoluteDestination: string) {
  if (!path.isAbsolute(absoluteDestination) || !isWithin(localDir, path.resolve(absoluteDestination)) || path.extname(absoluteDestination) !== '.sqlite') fail('STORAGE_INVALID_PATH', 'Backup must be a .sqlite file inside its ignored storage namespace');
  if (transactionDepth !== 0) fail('STORAGE_TRANSACTION', 'Backup requires a completed transaction');
  const destination = path.resolve(absoluteDestination);
  if(destination===databasePath)fail('STORAGE_BACKUP_EXISTS','A backup cannot replace the active metadata filename');
  if (safeFile(destination)) fail('STORAGE_BACKUP_EXISTS', 'Backup destination already exists and will not be overwritten');
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  safeFile(destination);
  if(storageBackend==='postgres')return withRemote(store=>materializePostgresBackup(store.exportSnapshot(),destination));
  const db = openDatabase();
  fs.closeSync(fs.openSync(destination, 'wx', 0o600));
  db.prepare('VACUUM INTO ?').run(path.toNamespacedPath(destination));
  safeFile(destination);
  const backup = new DatabaseSync(path.toNamespacedPath(destination), {readOnly: true, allowExtension: false});
  try {
    integrity(backup);
    if (Number(backup.prepare('PRAGMA user_version').get()!.user_version) !== schemaVersion || Number(backup.prepare('PRAGMA application_id').get()!.application_id) !== applicationId) fail('STORAGE_SCHEMA', 'Backup identity did not match this storage schema');
    return {path: destination, schemaVersion, bytes: fs.statSync(destination).size, sha256: createHash('sha256').update(fs.readFileSync(destination)).digest('hex'), integrityCheck: ['ok']};
  } finally { backup.close(); }
}
export function closeStorage(): void {
  if(storageBackend==='postgres'){if(remote){withRemote(store=>store.close());remote=undefined;}return;}
  if (transactionDepth !== 0) fail('STORAGE_TRANSACTION', 'Cannot close storage while a transaction is active');
  if (database) { database.close(); database = undefined; }
}
