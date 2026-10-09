import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

export const remoteSchemaVersion = 1;
export const remoteBackendVersion = 'remote-postgres-v1';
export const remoteApplicationId = 'bondtrace-public-metadata';
export const maxDocumentBytes = 8 * 1024 * 1024;
export const defaultMaxSnapshotBytes = 32 * 1024 * 1024;

const roots = new Set(['fixture.json', 'activity.json', 'prepared.json', 'operations.json', 'lifetimes.json', 'journal-migration.json', 'chain-identity.json', 'runtime-readiness.json']);
const publicKeys = [/^catalog\/[1-9A-HJ-NP-Za-km-z]{32,44}\.json$/, /^prepared\/[a-f0-9]{64}\.json$/, /^operations\/[A-Za-z0-9_-]{8,100}\.json$/, /^receipts\/[1-9A-HJ-NP-Za-km-z]{60,100}\.json$/];
const tableSql = {
  documents: 'CREATE TABLE bondtrace_metadata.documents (namespace TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(namespace, key))',
  storage_meta: 'CREATE TABLE bondtrace_metadata.storage_meta (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(namespace, key))',
  legacy_imports: 'CREATE TABLE bondtrace_metadata.legacy_imports (namespace TEXT NOT NULL, document_key TEXT NOT NULL, source_sha256 TEXT NOT NULL, source_bytes BIGINT NOT NULL, imported_at TEXT NOT NULL, PRIMARY KEY(namespace, document_key))',
  bondtrace_remote_meta: 'CREATE TABLE bondtrace_metadata.bondtrace_remote_meta (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(namespace, key))',
};
const columns = {
  documents: [['namespace', 'text'], ['key', 'text'], ['body', 'text'], ['updated_at', 'text']],
  storage_meta: [['namespace', 'text'], ['key', 'text'], ['value', 'text']],
  legacy_imports: [['namespace', 'text'], ['document_key', 'text'], ['source_sha256', 'text'], ['source_bytes', 'bigint'], ['imported_at', 'text']],
  bondtrace_remote_meta: [['namespace', 'text'], ['key', 'text'], ['value', 'text']],
};
const utf8 = value => Buffer.byteLength(value, 'utf8');

// These messages deliberately never attach SDK errors, SQL, endpoints or tokens.
const messages = {
  STORAGE_INVALID_PATH: 'Only approved public metadata documents can be stored',
  STORAGE_INVALID_JSON: 'Public metadata requires valid JSON with safe integer numbers and exact monetary strings',
  STORAGE_LIMIT: 'Remote metadata capacity exceeded; existing records were retained',
  STORAGE_SCHEMA: 'Unrecognized or incompatible remote metadata schema; existing data was retained',
  STORAGE_BINDING: 'Remote metadata namespace, network or program binding does not match',
  STORAGE_TRANSACTION: 'Remote metadata allows one active root transaction and one command at a time',
  STORAGE_FENCED: 'This metadata writer was replaced; explicit restart and recovery are required',
  STORAGE_TIMEOUT: 'Remote metadata deadline expired; explicit restart and recovery are required',
  STORAGE_REMOTE: 'Remote metadata acknowledgement failed; explicit restart and recovery are required',
  STORAGE_POISONED: 'Remote metadata is blocked; explicit restart and recovery are required',
  STORAGE_CLOSED: 'Remote metadata engine is closed',
  STORAGE_CONFIG: 'Remote metadata engine configuration is invalid',
  STORAGE_DURABILITY: 'Remote metadata transaction durability mode could not be verified',
};
export class RemoteStorageError extends Error {
  constructor(code) { super(messages[code] ?? messages.STORAGE_REMOTE); this.name = 'StorageError'; this.code = code; }
}
const fail = code => { throw new RemoteStorageError(code); };

export function validateRemoteDocumentKey(key) {
  if (typeof key !== 'string' || (!roots.has(key) && !publicKeys.some(pattern => pattern.test(key)))) fail('STORAGE_INVALID_PATH');
  return key;
}
export function validateRemoteDocumentBody(body) {
  if (typeof body !== 'string') fail('STORAGE_INVALID_JSON');
  if (utf8(body) > maxDocumentBytes) fail('STORAGE_LIMIT');
  if (Buffer.from(body, 'utf8').toString('utf8') !== body) fail('STORAGE_INVALID_JSON');
  try {
    JSON.parse(body, (_key, value) => {
      if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('STORAGE_INVALID_JSON');
      return value;
    });
    // JSON.parse can round a fractional/underflow token into a safe integer.
    // Check the original numeric spelling outside strings as exact decimal text.
    for (let index = 0; index < body.length; index++) {
      if (body[index] === '"') {
        for (index++; index < body.length && body[index] !== '"'; index++) if (body[index] === '\\') index++;
      } else if (body[index] === '-' || /[0-9]/.test(body[index])) {
        const start = index;
        while (index + 1 < body.length && /[0-9eE+.\-]/.test(body[index + 1])) index++;
        const token = body.slice(start, index + 1);
        const parts = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
        if (!parts) fail('STORAGE_INVALID_JSON');
        let digits = (parts[1] + (parts[2] ?? '')).replace(/^0+/, '');
        if (digits === '') continue;
        const exponent = Number(parts[3] ?? '0'), shift = exponent - (parts[2]?.length ?? 0);
        if (!Number.isSafeInteger(exponent)) fail('STORAGE_INVALID_JSON');
        if (shift < 0) {
          if (-shift >= digits.length || !/^0*$/.test(digits.slice(shift))) fail('STORAGE_INVALID_JSON');
          digits = digits.slice(0, shift);
        } else {
          if (digits.length + shift > 16) fail('STORAGE_INVALID_JSON');
          digits += '0'.repeat(shift);
        }
        if (digits.length > 16 || BigInt(digits) > BigInt(Number.MAX_SAFE_INTEGER)) fail('STORAGE_INVALID_JSON');
      }
    }
  } catch (error) { if (error instanceof RemoteStorageError) throw error; fail('STORAGE_INVALID_JSON'); }
  return body;
}
function timestamp(value) {
  if (typeof value !== 'string' || value.length !== 24 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('STORAGE_SCHEMA');
  return value;
}
function decimal(value) {
  if (typeof value === 'bigint') { if (value < 0n) fail('STORAGE_SCHEMA'); return value; }
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || value < 0) fail('STORAGE_SCHEMA'); return BigInt(value); }
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,99})$/.test(value)) fail('STORAGE_SCHEMA');
  return BigInt(value);
}
function uniqueRows(rows, getKey) {
  const seen = new Set();
  for (const row of rows) { const key = getKey(row); if (seen.has(key)) fail('STORAGE_SCHEMA'); seen.add(key); }
}

/** Finite operations over one reserved pg Pool client for each BEGIN..COMMIT.
 * The synchronous caller owns staging/nested undo. No driver/config import or I/O
 * occurs at construction. All cooperating writers serialize each namespace with
 * transaction-scoped advisory locks; no session locks survive pooler reuse.
 */
export class RemotePostgresEngine {
  #pool; #binding; #owner = randomUUID(); #generation; #active; #busy = false; #poisoned = false; #closed = false;
  #deadlineMs; #maxBytes; #acknowledgedAt; #poolError;
  constructor({pool, namespace, network, programId, transactionTimeoutMs = 10000, maxSnapshotBytes = defaultMaxSnapshotBytes}) {
    if (!pool || typeof pool.connect !== 'function' || typeof pool.end !== 'function'
      || typeof namespace !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(namespace)
      || !['devnet', 'localnet'].includes(network) || typeof programId !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(programId)
      || !Number.isSafeInteger(transactionTimeoutMs) || transactionTimeoutMs < 50 || transactionTimeoutMs > 20000
      || !Number.isSafeInteger(maxSnapshotBytes) || maxSnapshotBytes < 1024 || maxSnapshotBytes > defaultMaxSnapshotBytes) fail('STORAGE_CONFIG');
    this.#pool = pool;
    this.#binding = {application_id: remoteApplicationId, schema_version: String(remoteSchemaVersion), backend_version: remoteBackendVersion, namespace, network, program_id: programId};
    this.#deadlineMs = transactionTimeoutMs; this.#maxBytes = maxSnapshotBytes;
    this.#poolError = () => this.#poison();
    pool.on?.('error', this.#poolError);
  }
  get health() { return {closed: this.#closed, poisoned: this.#poisoned, activeTransaction: Boolean(this.#active), generation: this.#generation ?? null, acknowledgedAt: this.#acknowledgedAt ?? null}; }
  #guard() { if (this.#closed) fail('STORAGE_CLOSED'); if (this.#poisoned) fail('STORAGE_POISONED'); }
  #dispose(destroy) {
    const active = this.#active;
    if (!active || active.released) return;
    active.released = true;
    active.client.removeListener?.('error', active.onError);
    try { active.client.release(destroy); } catch { this.#poisoned = true; }
  }
  #poison() { this.#poisoned = true; this.#dispose(true); }
  async #command(callback) {
    this.#guard(); if (this.#busy) fail('STORAGE_TRANSACTION'); this.#busy = true;
    try { return await callback(); } finally { this.#busy = false; }
  }
  async #request(callback, deadline) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) { this.#poison(); fail('STORAGE_TIMEOUT'); }
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(callback),
        new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new RemoteStorageError('STORAGE_TIMEOUT')), remaining); }),
      ]);
    } catch (error) {
      this.#poison();
      throw error instanceof RemoteStorageError ? error : new RemoteStorageError('STORAGE_REMOTE');
    } finally { clearTimeout(timer); }
  }
  async #query(sql, args = [], deadline = this.#active.deadline) {
    this.#guard();
    const result = await this.#request(() => this.#active.client.query(sql, args), deadline);
    if (!result || !Array.isArray(result.rows) || typeof result.command !== 'string') { this.#poison(); fail('STORAGE_REMOTE'); }
    return result;
  }
  async #control(sql, expected, deadline) {
    const result = await this.#query(sql, [], deadline);
    if (result.command !== expected) { this.#poison(); fail('STORAGE_REMOTE'); }
  }
  async #verifyCommitMode() {
    const result = await this.#query("SELECT current_setting('synchronous_commit') AS synchronous_commit");
    if (result.rows.length !== 1 || result.rows[0].synchronous_commit !== 'on') { this.#poison(); fail('STORAGE_DURABILITY'); }
  }
  async #inspectSchema(create) {
    let result = await this.#query('SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $1', ['bondtrace_metadata']);
    if (!result.rows.length && create) {
      // Only first schema creation needs the global transaction lock.
      await this.#query('SELECT pg_catalog.pg_advisory_xact_lock($1::integer, $2::integer)', [1112822339, 1]);
      result = await this.#query('SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $1', ['bondtrace_metadata']);
      if (!result.rows.length) {
        if (this.#generation !== undefined) fail('STORAGE_SCHEMA');
        await this.#query('CREATE SCHEMA bondtrace_metadata');
        for (const sql of Object.values(tableSql)) await this.#query(sql);
      }
    }
    if (!result.rows.length && !create) fail('STORAGE_SCHEMA');
    const relations = await this.#query(`SELECT c.relname AS name, c.relkind AS kind, c.relpersistence AS persistence, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 ORDER BY c.relname`, ['bondtrace_metadata']);
    const expected = new Set([...Object.keys(tableSql), ...Object.keys(tableSql).map(name => name + '_pkey')]);
    if (relations.rows.length !== expected.size || relations.rows.some(row => !expected.has(row.name) || row.persistence !== 'p' || row.rls || row.force_rls
      || row.kind !== (row.name.endsWith('_pkey') ? 'i' : 'r'))) fail('STORAGE_SCHEMA');
    const attributes = await this.#query(`SELECT c.relname AS table_name, a.attname AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
      a.attnotnull AS required, a.attnum AS position, a.attgenerated AS generated, a.attidentity AS identity, a.atthasdef AS has_default
      FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum`, ['bondtrace_metadata']);
    const expectedColumns = Object.entries(columns).flatMap(([table, entries]) => entries.map(([name, type], index) => ({table_name: table, name, type, position: index + 1})));
    if (attributes.rows.length !== expectedColumns.length || expectedColumns.some(expectedColumn => !attributes.rows.some(row => row.table_name === expectedColumn.table_name && row.name === expectedColumn.name
      && row.type === expectedColumn.type && row.position === expectedColumn.position && row.required === true && row.generated === '' && row.identity === '' && row.has_default === false))) fail('STORAGE_SCHEMA');
    const constraints = await this.#query(`SELECT c.relname AS table_name, k.conname AS name, k.contype AS type, k.convalidated AS valid,
      pg_catalog.pg_get_constraintdef(k.oid, true) AS definition FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 ORDER BY c.relname, k.conname`, ['bondtrace_metadata']);
    if (constraints.rows.length !== 4 || constraints.rows.some(row => !Object.hasOwn(tableSql, row.table_name) || row.name !== row.table_name + '_pkey'
      || row.type !== 'p' || row.valid !== true || row.definition !== 'PRIMARY KEY (namespace, ' + (row.table_name === 'legacy_imports' ? 'document_key' : 'key') + ')')) fail('STORAGE_SCHEMA');
    const extras = await this.#query(`SELECT
      (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal)::text AS triggers,
      (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1)::text AS routines,
      (SELECT count(*) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1)::text AS policies`, ['bondtrace_metadata']);
    if (extras.rows.length !== 1 || Object.values(extras.rows[0]).some(value => decimal(value) !== 0n)) fail('STORAGE_SCHEMA');
  }
  async #metadata(create, claim) {
    const namespace = this.#binding.namespace;
    let result = await this.#query('SELECT key, value FROM bondtrace_metadata.bondtrace_remote_meta WHERE namespace = $1 ORDER BY key FOR UPDATE', [namespace]);
    if (!result.rows.length && create) {
      if (this.#generation !== undefined) fail('STORAGE_SCHEMA');
      const initial = {...this.#binding, writer_generation: '0', writer_id: ''};
      await this.#query('INSERT INTO bondtrace_metadata.bondtrace_remote_meta (namespace, key, value) SELECT $1, key, value FROM unnest($2::text[], $3::text[]) AS entry(key, value)', [namespace, Object.keys(initial), Object.values(initial)]);
      result = {rows: Object.entries(initial).map(([key, value]) => ({key, value}))};
    }
    uniqueRows(result.rows, row => row.key);
    if (result.rows.length !== 8 || result.rows.some(row => typeof row.key !== 'string' || typeof row.value !== 'string')) fail('STORAGE_SCHEMA');
    const metadata = Object.fromEntries(result.rows.map(row => [row.key, row.value]));
    for (const [key, value] of Object.entries(this.#binding)) if (metadata[key] !== value) fail(['namespace', 'network', 'program_id'].includes(key) ? 'STORAGE_BINDING' : 'STORAGE_SCHEMA');
    if (!Object.hasOwn(metadata, 'writer_id') || !Object.hasOwn(metadata, 'writer_generation')) fail('STORAGE_SCHEMA');
    const generation = decimal(metadata.writer_generation);
    if ((generation === 0n && metadata.writer_id !== '') || (generation > 0n && !/^[0-9a-f-]{36}$/.test(metadata.writer_id))) fail('STORAGE_SCHEMA');
    if (this.#generation !== undefined) {
      if (metadata.writer_id !== this.#owner || metadata.writer_generation !== this.#generation) { this.#poison(); fail('STORAGE_FENCED'); }
    } else if (claim) {
      metadata.writer_generation = (generation + 1n).toString(); metadata.writer_id = this.#owner;
      await this.#query('UPDATE bondtrace_metadata.bondtrace_remote_meta SET value = CASE key WHEN $2 THEN $3 ELSE $4 END WHERE namespace = $1 AND key IN ($2, $5)', [namespace, 'writer_generation', metadata.writer_generation, this.#owner, 'writer_id']);
    }
    return metadata;
  }
  #makeSnapshot(data, metadata) {
    const encoded = JSON.stringify(data), bytes = utf8(encoded);
    if (bytes > this.#maxBytes) fail('STORAGE_LIMIT');
    return {...data, metadata: {...metadata}, generation: metadata.writer_generation, bytes, dataSha256: createHash('sha256').update(encoded).digest('hex'), acknowledgedAt: this.#acknowledgedAt ?? null};
  }
  async #snapshot(metadata) {
    const namespace = this.#binding.namespace;
    const sizes = await this.#query(`SELECT
      (SELECT COALESCE(SUM(octet_length(key)+octet_length(body)+octet_length(updated_at)),0)::text FROM bondtrace_metadata.documents WHERE namespace=$1) AS documents,
      (SELECT COALESCE(MAX(octet_length(body)),0)::text FROM bondtrace_metadata.documents WHERE namespace=$1) AS max_body,
      (SELECT COALESCE(SUM(octet_length(key)+octet_length(value)),0)::text FROM bondtrace_metadata.storage_meta WHERE namespace=$1) AS meta,
      (SELECT COALESCE(SUM(octet_length(document_key)+octet_length(source_sha256)+octet_length(imported_at)+32),0)::text FROM bondtrace_metadata.legacy_imports WHERE namespace=$1) AS imports`, [namespace]);
    if (sizes.rows.length !== 1) fail('STORAGE_SCHEMA');
    const size = sizes.rows[0];
    if (decimal(size.documents) + decimal(size.meta) + decimal(size.imports) > BigInt(this.#maxBytes) || decimal(size.max_body) > BigInt(maxDocumentBytes)) fail('STORAGE_LIMIT');
    const docs = await this.#query('SELECT key, body, updated_at FROM bondtrace_metadata.documents WHERE namespace=$1 ORDER BY key COLLATE "C"', [namespace]);
    const meta = await this.#query('SELECT key, value FROM bondtrace_metadata.storage_meta WHERE namespace=$1 ORDER BY key COLLATE "C"', [namespace]);
    const imports = await this.#query('SELECT document_key, source_sha256, source_bytes::text, imported_at FROM bondtrace_metadata.legacy_imports WHERE namespace=$1 ORDER BY document_key COLLATE "C"', [namespace]);
    const documents = docs.rows.map(row => ({key: validateRemoteDocumentKey(row.key), body: validateRemoteDocumentBody(row.body), updatedAt: timestamp(row.updated_at)}));
    const storageMeta = meta.rows.map(row => { if (row.key !== 'legacy_import_complete' || typeof row.value !== 'string') fail('STORAGE_SCHEMA'); return {key: row.key, value: timestamp(row.value)}; });
    const legacyImports = imports.rows.map(row => {
      if (typeof row.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.source_sha256) || decimal(row.source_bytes) > BigInt(maxDocumentBytes)) fail('STORAGE_SCHEMA');
      return {documentKey: validateRemoteDocumentKey(row.document_key), sourceSha256: row.source_sha256, sourceBytes: Number(decimal(row.source_bytes)), importedAt: timestamp(row.imported_at)};
    });
    uniqueRows(documents, row => row.key); uniqueRows(storageMeta, row => row.key); uniqueRows(legacyImports, row => row.documentKey);
    return this.#makeSnapshot({documents, storageMeta, legacyImports}, metadata);
  }
  async #open(claim, create = true) {
    if (this.#active) fail('STORAGE_TRANSACTION');
    const deadline = performance.now() + this.#deadlineMs;
    const pending = Promise.resolve().then(() => this.#pool.connect()).then(client => {
      if (this.#poisoned || this.#closed) { try { client.release(true); } catch { /* Late connection cannot become usable. */ } fail('STORAGE_POISONED'); }
      return client;
    });
    const client = await this.#request(() => pending, deadline);
    if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') { this.#poison(); fail('STORAGE_REMOTE'); }
    const onError = () => this.#poison();
    this.#active = {client, deadline, claimed: claim, onError, released: false};
    client.on?.('error', onError);
    try {
      await this.#control('BEGIN ISOLATION LEVEL READ COMMITTED', 'BEGIN');
      const settings = await this.#query("SELECT set_config('statement_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $1, true), set_config('lock_timeout', $1, true), set_config('search_path', 'pg_catalog', true), set_config('synchronous_commit', 'on', true), current_setting('transaction_read_only') AS read_only, pg_catalog.pg_is_in_recovery() AS in_recovery", [String(Math.max(1, Math.ceil(deadline - performance.now())))]);
      if (settings.rows.length !== 1 || settings.rows[0].read_only !== 'off' || settings.rows[0].in_recovery !== false) fail('STORAGE_BINDING');
      await this.#verifyCommitMode();
      await this.#query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))", ['bondtrace-metadata:' + this.#binding.namespace]);
      await this.#inspectSchema(create);
      return await this.#metadata(create, claim);
    } catch (error) { return this.#failed(error); }
  }
  async #failed(error) {
    if (!(error instanceof RemoteStorageError)) this.#poison();
    if (!this.#poisoned && this.#active) await this.#rollback();
    throw error instanceof RemoteStorageError ? error : new RemoteStorageError('STORAGE_REMOTE');
  }
  async #begin(claim) {
    const metadata = await this.#open(claim);
    try { const snapshot = await this.#snapshot(metadata); this.#active.snapshot = snapshot; return structuredClone(snapshot); }
    catch (error) { return this.#failed(error); }
  }
  async begin() { return this.#command(() => this.#begin(true)); }
  async initialize() { return this.#command(async () => { await this.#begin(false); return this.#commit([]); }); }
  async hydrate() { return this.initialize(); }
  async exportSnapshot() { return this.initialize(); }
  async #commit(changes) {
    if (!this.#active?.snapshot) fail('STORAGE_TRANSACTION');
    const active = this.#active;
    try {
      if (performance.now() >= active.deadline) { await this.#rollback(); this.#poison(); fail('STORAGE_TIMEOUT'); }
      if (!Array.isArray(changes)) fail('STORAGE_INVALID_JSON');
      const seen = new Set(), now = new Date().toISOString();
      const valid = changes.map(change => {
        if (!change || typeof change !== 'object') fail('STORAGE_INVALID_JSON');
        const key = validateRemoteDocumentKey(change.key), body = validateRemoteDocumentBody(change.body);
        if (seen.has(key)) fail('STORAGE_INVALID_PATH'); seen.add(key);
        return {key, body, updatedAt: change.updatedAt === undefined ? now : timestamp(change.updatedAt)};
      });
      const documents = new Map(active.snapshot.documents.map(document => [document.key, document]));
      for (const document of valid) documents.set(document.key, document);
      const snapshot = this.#makeSnapshot({documents: [...documents.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0), storageMeta: active.snapshot.storageMeta, legacyImports: active.snapshot.legacyImports}, active.snapshot.metadata);
      const metadata = await this.#metadata(false, false);
      if (active.claimed && (metadata.writer_id !== active.snapshot.metadata.writer_id || metadata.writer_generation !== active.snapshot.generation)) { this.#poison(); fail('STORAGE_FENCED'); }
      await this.#verifyCommitMode();
      if (valid.length) await this.#query(`INSERT INTO bondtrace_metadata.documents(namespace,key,body,updated_at)
        SELECT $1, key, body, updated_at FROM unnest($2::text[], $3::text[], $4::text[]) AS entry(key,body,updated_at)
        ON CONFLICT(namespace,key) DO UPDATE SET body=EXCLUDED.body, updated_at=EXCLUDED.updated_at`, [this.#binding.namespace, valid.map(row => row.key), valid.map(row => row.body), valid.map(row => row.updatedAt)]);
      await this.#verifyCommitMode();
      await this.#control('COMMIT', 'COMMIT');
      this.#dispose(false); this.#active = undefined;
      if (this.#poisoned) fail('STORAGE_POISONED');
      if (active.claimed) this.#generation = snapshot.generation;
      this.#acknowledgedAt = new Date().toISOString(); snapshot.acknowledgedAt = this.#acknowledgedAt;
      return structuredClone(snapshot);
    } catch (error) { return this.#failed(error); }
  }
  async commit(changes = []) { return this.#command(() => this.#commit(changes)); }
  async #rollback() {
    if (!this.#active) fail('STORAGE_TRANSACTION');
    await this.#control('ROLLBACK', 'ROLLBACK', this.#active.deadline + 1000);
    this.#dispose(false); this.#active = undefined;
    if (this.#poisoned) fail('STORAGE_POISONED');
  }
  async rollback() { return this.#command(() => this.#rollback()); }
  async assertWriter() {
    return this.#command(async () => {
      if (this.#generation === undefined) fail('STORAGE_TRANSACTION');
      const metadata = await this.#open(false, false);
      await this.#rollback();
      return {verified: true, generation: metadata.writer_generation, checkedAt: new Date().toISOString()};
    });
  }
  async close() {
    if (this.#closed) return;
    if (this.#busy) fail('STORAGE_TRANSACTION'); this.#busy = true;
    try { if (this.#active && !this.#poisoned) await this.#rollback(); }
    finally {
      this.#closed = true; this.#busy = false; this.#dispose(true);
      try { await this.#request(() => this.#pool.end(), performance.now() + this.#deadlineMs); }
      finally { this.#pool.removeListener?.('error', this.#poolError); }
    }
  }
}
