import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {Pool, type PoolClient, type QueryResult} from 'pg';
import {RemotePostgresEngine, RemoteStorageError, maxDocumentBytes, validateRemoteDocumentBody, validateRemoteDocumentKey, type RemotePostgresPool, type RemoteEngineOptions} from '../../server/remote-postgres-engine.mjs';

const url = process.env.BONDTRACE_TEST_PG_URL;
const binding = {network: 'devnet' as const, programId: '11111111111111111111111111111111'};
const now = '2026-10-09T00:00:00.000Z';
const engines: RemotePostgresEngine[] = [], pools: Pool[] = [];
const freshNamespace = () => 'engine-' + randomUUID();
function pool() {
  assert.ok(url, 'Actual PostgreSQL tests require explicit BONDTRACE_TEST_PG_URL');
  const endpoint = new URL(url);
  assert.ok(['postgres:', 'postgresql:'].includes(endpoint.protocol) && endpoint.hostname === '127.0.0.1' && endpoint.port === '32545' && endpoint.pathname === '/bondtrace_tests', 'PostgreSQL tests require the explicitly owned isolated loopback database');
  const value = new Pool({connectionString: url, max: 1, connectionTimeoutMillis: 10000, application_name: 'bondtrace-engine-test'});
  value.on('error', () => {}); pools.push(value); return value;
}
function engine(namespace = freshNamespace(), options: Partial<RemoteEngineOptions> = {}) {
  const value = new RemotePostgresEngine({pool: pool(), namespace, ...binding, ...options});
  engines.push(value); return value;
}
function code(expected: string) { return (error: unknown) => error instanceof RemoteStorageError && error.code === expected; }
function wrapPool(base: Pool, hook: (client: PoolClient, text: string, args: unknown[]) => Promise<QueryResult>): RemotePostgresPool {
  return {
    async connect() {
      const client = await base.connect();
      return {query: ((text: string, args: unknown[]) => hook(client, text, args)) as PoolClient['query'], release: (destroy?: boolean) => client.release(destroy), on: client.on.bind(client), removeListener: client.removeListener.bind(client)};
    },
    end: () => base.end(), on: base.on.bind(base), removeListener: base.removeListener.bind(base),
  };
}
after(async () => {
  for (const value of engines) { try { await value.close(); } catch { /* Failures are asserted in their tests. */ } }
  for (const value of pools) { if (!value.ending) await value.end(); }
});

test('construction and validation are passive and need no database or credentials', async () => {
  let connections = 0;
  const value = new RemotePostgresEngine({...binding, namespace: freshNamespace(), pool: {connect: async () => { connections++; throw new Error('not called'); }, end: async () => {}}});
  assert.equal(connections, 0); assert.equal(value.health.generation, null);
  for (const key of ['fixture.json', 'prepared/' + 'a'.repeat(64) + '.json', 'operations/synthetic-123.json']) assert.equal(validateRemoteDocumentKey(key), key);
  for (const key of ['keys/private.json', '../fixture.json', 'auth.json', '.env']) assert.throws(() => validateRemoteDocumentKey(key), code('STORAGE_INVALID_PATH'));
  for (const body of ['{broken', '{"amount":1.5}', '9007199254740993', '1.0000000000000001', '1e-999', '9007199254740991.4', '"\ud800"']) assert.throws(() => validateRemoteDocumentBody(body), code('STORAGE_INVALID_JSON'));
  for (const body of ['{"amount":"18446744073709551615"}', '{"exact":1e3,"negative":-1.00,"zero":0e999}', '9007199254740991']) assert.equal(validateRemoteDocumentBody(body), body);
  assert.throws(() => validateRemoteDocumentBody(JSON.stringify('x'.repeat(maxDocumentBytes))), code('STORAGE_LIMIT'));
  await value.close();
});

test('acquisition failures are sanitized, poison once and never retry', async () => {
  let connections = 0;
  const value = new RemotePostgresEngine({...binding, namespace: freshNamespace(), pool: {connect: async () => { connections++; throw new Error('postgresql://secret:password@private SQL'); }, end: async () => {}}});
  await assert.rejects(value.begin(), error => { assert.ok(code('STORAGE_REMOTE')(error)); assert.doesNotMatch(String(error), /secret|password|private|SQL/); assert.equal((error as Error).cause, undefined); return true; });
  assert.equal(value.health.poisoned, true); await assert.rejects(value.begin(), code('STORAGE_POISONED')); assert.equal(connections, 1);
  await value.close();
});

test('a timed-out acquisition never admits a late client into a newer command', async () => {
  let resolve!: (client: Pick<PoolClient, 'query' | 'release'>) => void, destroyed = false;
  const pending = new Promise<Pick<PoolClient, 'query' | 'release'>>(done => { resolve = done; });
  const value = new RemotePostgresEngine({...binding, namespace: freshNamespace(), transactionTimeoutMs: 50, pool: {connect: () => pending, end: async () => {}}});
  await assert.rejects(value.begin(), code('STORAGE_TIMEOUT'));
  resolve({query: (() => { throw new Error('must never query late client'); }) as PoolClient['query'], release: destroy => { destroyed = Boolean(destroy); }});
  await new Promise(done => setTimeout(done, 0));
  assert.equal(destroyed, true); assert.equal(value.health.poisoned, true); await value.close();
});

test('malformed BEGIN acknowledgement destroys reserved client and cannot authorize writes', async () => {
  let queries = 0, destroyed = false;
  const value = new RemotePostgresEngine({...binding, namespace: freshNamespace(), pool: {connect: async () => ({query: (async () => { queries++; return {rows: [], command: 'ROLLBACK'}; }) as unknown as PoolClient['query'], release: destroy => { destroyed = Boolean(destroy); }}), end: async () => {}}});
  await assert.rejects(value.begin(), code('STORAGE_REMOTE'));
  assert.equal(queries, 1); assert.equal(destroyed, true); assert.equal(value.health.poisoned, true); await value.close();
});

test('actual PostgreSQL engine contracts', {skip: !url ? 'BONDTRACE_TEST_PG_URL absent: actual PostgreSQL integration not executed' : false}, async t => {
  const run = (name: string, callback: () => Promise<void>) => t.test(name, async () => {
    const firstEngine = engines.length, firstPool = pools.length;
    try { await callback(); }
    finally {
      for (const value of engines.slice(firstEngine)) { try { await value.close(); } catch { /* Explicit poison cases already verified. */ } }
      for (const value of pools.slice(firstPool)) { if (!value.ending) await value.end(); }
    }
  });
  await run('real SQL persists on reopen; body stays TEXT and owner generation stays exact string', async () => {
    const namespace = freshNamespace(), first = engine(namespace);
    const empty = await first.initialize(); assert.equal(empty.generation, '0'); assert.equal(first.health.generation, null);
    await first.begin(); const committed = await first.commit([{key: 'fixture.json', body: '{"amount":"18446744073709551615","caption":"Купон • 支払","height":123}', updatedAt: now}]);
    assert.equal(first.health.generation, '1'); assert.ok(committed.acknowledgedAt); await first.close();
    const reopened = engine(namespace), snapshot = await reopened.hydrate();
    assert.deepEqual(snapshot.documents, committed.documents); assert.equal(snapshot.dataSha256, committed.dataSha256); assert.equal(reopened.health.generation, null);
    const actual = await pool().query('SELECT body, pg_typeof(body)::text AS type FROM bondtrace_metadata.documents WHERE namespace=$1', [namespace]);
    assert.equal(actual.rows[0].body, committed.documents[0].body); assert.equal(actual.rows[0].type, 'text');
  });
  await run('transaction-local synchronous commit overrides inherited off and restores the original session default', async () => {
    const namespace = freshNamespace(), base = pool(), inherited = await base.connect();
    await inherited.query("SET synchronous_commit = 'off'");
    assert.equal((await inherited.query("SELECT current_setting('synchronous_commit') AS mode")).rows[0].mode, 'off');
    inherited.release();
    const writes: string[] = [], commits: string[] = [], restored: string[] = [];
    const value = engine(namespace, {pool: wrapPool(base, async (client, text, args) => {
      assert.equal(client, inherited, 'The root transaction must retain the reserved client');
      if (/^(INSERT|UPDATE|CREATE)/.test(text)) writes.push((await client.query("SELECT current_setting('synchronous_commit') AS mode")).rows[0].mode);
      if (text === 'COMMIT') commits.push((await client.query("SELECT current_setting('synchronous_commit') AS mode")).rows[0].mode);
      const result = await client.query(text, args);
      if (text === 'COMMIT') restored.push((await client.query("SELECT current_setting('synchronous_commit') AS mode")).rows[0].mode);
      return result;
    })});
    await value.initialize(); await value.begin();
    const committed = await value.commit([{key: 'fixture.json', body: '{"signature":"durable-same-wire","amount":"18446744073709551615"}', updatedAt: now}]);
    assert.ok(writes.length > 0); assert.ok(writes.every(mode => mode === 'on')); assert.deepEqual(commits, ['on', 'on']); assert.deepEqual(restored, ['off', 'off']);
    const released = await base.connect();
    assert.equal((await released.query("SELECT current_setting('synchronous_commit') AS mode")).rows[0].mode, 'off'); released.release();
    await value.close();
    const reopened = await engine(namespace).hydrate(); assert.deepEqual(reopened.documents, committed.documents); assert.equal(reopened.dataSha256, committed.dataSha256);
  });
  await run('namespace isolation and observer hydration/export never fence an existing writer', async () => {
    const namespace = freshNamespace(), writer = engine(namespace), observer = engine(namespace), separate = engine();
    await writer.begin(); await writer.commit([{key: 'fixture.json', body: '1', updatedAt: now}]);
    assert.equal((await observer.hydrate()).generation, '1'); assert.equal((await observer.exportSnapshot()).generation, '1'); assert.equal(observer.health.generation, null);
    await assert.rejects(observer.assertWriter(), code('STORAGE_TRANSACTION'));
    await writer.begin(); await writer.commit([{key: 'fixture.json', body: '2', updatedAt: now}]); await writer.assertWriter();
    assert.equal((await separate.hydrate()).documents.length, 0); assert.equal((await observer.exportSnapshot()).documents[0].body, '2');
  });
  await run('actual namespace locks serialize same-namespace transactions while other namespaces remain independent', async () => {
    const namespace = freshNamespace(), first = engine(namespace), base = pool(), separate = engine();
    let reached!: () => void, settled = false;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    const second = engine(namespace, {pool: wrapPool(base, async (client, text, args) => { if (text.includes('pg_advisory_xact_lock(pg_catalog.hashtextextended')) reached(); return client.query(text, args); })});
    await first.begin(); await first.commit([{key: 'fixture.json', body: '1'}]); await first.begin();
    const blocked = second.begin().then(snapshot => { settled = true; return snapshot; });
    await waiting; await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(settled, false);
    try {
      await separate.begin(); await separate.rollback();
    } finally { await first.rollback(); }
    const acquired = await blocked; assert.equal(acquired.documents[0].body, '1'); assert.equal(acquired.generation, '2'); await second.rollback();
    await first.assertWriter();
  });
  await run('initial tentative claim rollback is benign; acknowledged replacement permanently fences old writer', async () => {
    const namespace = freshNamespace(), old = engine(namespace), next = engine(namespace);
    await old.begin(); await old.commit([{key: 'fixture.json', body: '1'}]);
    assert.equal((await next.begin()).generation, '2'); assert.equal(next.health.generation, null); await next.rollback();
    assert.equal(next.health.poisoned, false); await old.assertWriter();
    await old.begin(); await old.commit([{key: 'fixture.json', body: '2'}]);
    await next.begin(); await next.commit([{key: 'fixture.json', body: '3'}]);
    await assert.rejects(old.assertWriter(), code('STORAGE_FENCED')); await assert.rejects(old.begin(), code('STORAGE_POISONED'));
    assert.equal((await next.exportSnapshot()).documents[0].body, '3');
  });
  await run('root rollback retains all acknowledged metadata and releases the exact reserved client', async () => {
    const value = engine(); await value.begin(); await value.commit([{key: 'fixture.json', body: '{"counter":1}'}]);
    await value.begin(); await assert.rejects(value.begin(), code('STORAGE_TRANSACTION')); await value.rollback();
    assert.equal((await value.exportSnapshot()).documents[0].body, '{"counter":1}'); assert.equal(value.health.poisoned, false);
    // Nested caught-inner undo is exclusively exercised by remote-document-state tests.
  });
  await run('network/program/schema binding rejection retains old persisted rows', async () => {
    const namespace = freshNamespace(), value = engine(namespace); await value.begin(); await value.commit([{key: 'fixture.json', body: '1'}]);
    await assert.rejects(engine(namespace, {network: 'localnet'}).hydrate(), code('STORAGE_BINDING'));
    await assert.rejects(engine(namespace, {programId: '22222222222222222222222222222222'}).hydrate(), code('STORAGE_BINDING'));
    await pool().query('UPDATE bondtrace_metadata.bondtrace_remote_meta SET value=$2 WHERE namespace=$1 AND key=$3', [namespace, 'foreign-version', 'backend_version']);
    await assert.rejects(engine(namespace).hydrate(), code('STORAGE_SCHEMA'));
    assert.equal((await pool().query('SELECT body FROM bondtrace_metadata.documents WHERE namespace=$1', [namespace])).rows[0].body, '1');
  });
  await run('consistent export includes all three public row sets and exact hashes', async () => {
    const namespace = freshNamespace(), value = engine(namespace); await value.initialize();
    const actual = pool(), originalBody = '{"amount":"18446744073709551615"}', originalHash = createHash('sha256').update(originalBody).digest('hex');
    await actual.query('INSERT INTO bondtrace_metadata.storage_meta(namespace,key,value) VALUES($1,$2,$3)', [namespace, 'legacy_import_complete', now]);
    await actual.query('INSERT INTO bondtrace_metadata.legacy_imports(namespace,document_key,source_sha256,source_bytes,imported_at) VALUES($1,$2,$3,$4,$5)', [namespace, 'fixture.json', originalHash, String(Buffer.byteLength(originalBody)), now]);
    await value.begin(); const committed = await value.commit(['prepared.json', 'operations.json', 'lifetimes.json', 'activity.json', 'fixture.json'].map(key => ({key, body: originalBody, updatedAt: now})));
    const exported = await value.exportSnapshot(); assert.deepEqual(exported.documents, committed.documents); assert.equal(exported.storageMeta.length, 1); assert.equal(exported.legacyImports[0].sourceSha256, originalHash);
    const expected = createHash('sha256').update(JSON.stringify({documents: exported.documents, storageMeta: exported.storageMeta, legacyImports: exported.legacyImports})).digest('hex');
    assert.equal(exported.dataSha256, expected);
    assert.deepEqual((await actual.query('SELECT key,body,updated_at FROM bondtrace_metadata.documents WHERE namespace=$1 ORDER BY key COLLATE "C"', [namespace])).rows.map(row => ({key: row.key, body: row.body, updatedAt: row.updated_at})), exported.documents);
  });
  await run('invalid changes and corrupted stored JSON fail closed without changing old SQL bytes', async () => {
    const namespace = freshNamespace(), value = engine(namespace); await value.begin(); await value.commit([{key: 'fixture.json', body: '{"original":true}'}]);
    for (const body of ['{broken', '9007199254740993', '1.0000000000000001', '1e-999']) { await value.begin(); await assert.rejects(value.commit([{key: 'fixture.json', body}]), code('STORAGE_INVALID_JSON')); }
    await value.begin(); await assert.rejects(value.commit([{key: 'keys/private.json', body: '{}'}]), code('STORAGE_INVALID_PATH'));
    await value.begin(); await assert.rejects(value.commit([{key: 'fixture.json', body: '1'}, {key: 'fixture.json', body: '2'}]), code('STORAGE_INVALID_PATH'));
    assert.equal((await value.exportSnapshot()).documents[0].body, '{"original":true}');
    await pool().query('UPDATE bondtrace_metadata.documents SET body=$2 WHERE namespace=$1', [namespace, '{broken']);
    await assert.rejects(value.hydrate(), code('STORAGE_INVALID_JSON'));
    assert.equal((await pool().query('SELECT body FROM bondtrace_metadata.documents WHERE namespace=$1', [namespace])).rows[0].body, '{broken');
  });
  await run('exact 8 MiB body roundtrips; oversized replacement and aggregate overflow retain old data', async () => {
    const namespace = freshNamespace(), value = engine(namespace), body = JSON.stringify({large: 'x'.repeat(maxDocumentBytes - 12)});
    assert.equal(Buffer.byteLength(body), maxDocumentBytes); await value.begin(); await value.commit([{key: 'fixture.json', body, updatedAt: now}]);
    assert.equal((await value.exportSnapshot()).documents[0].body, body);
    await value.begin(); await assert.rejects(value.commit([{key: 'fixture.json', body: body + ' '}]), code('STORAGE_LIMIT'));
    assert.equal((await value.exportSnapshot()).documents[0].body, body);
    await assert.rejects(engine(namespace, {maxSnapshotBytes: 1024}).hydrate(), code('STORAGE_LIMIT'));
    const small = engine(undefined, {maxSnapshotBytes: 1024}); await small.begin(); await small.commit([{key: 'fixture.json', body: '1'}]);
    await small.begin(); await assert.rejects(small.commit([{key: 'activity.json', body: JSON.stringify('x'.repeat(1024))}]), code('STORAGE_LIMIT'));
    assert.deepEqual((await small.exportSnapshot()).documents.map(row => row.key), ['fixture.json']);
  });
  await run('actual COMMIT followed by lost acknowledgement poisons without retry and persists same signature', async () => {
    const namespace = freshNamespace(), base = pool(); let commits = 0;
    const value = engine(namespace, {pool: wrapPool(base, async (client, text, args) => {
      const result = await client.query(text, args); if (text === 'COMMIT') { commits++; throw new Error('postgresql://private:secret@host SQL'); } return result;
    })});
    await value.begin(); await assert.rejects(value.commit([{key: 'fixture.json', body: '{"signature":"retained-same-wire"}'}]), error => { assert.ok(code('STORAGE_REMOTE')(error)); assert.doesNotMatch(String(error), /private|secret|SQL/); return true; });
    assert.equal(commits, 1); assert.equal(value.health.poisoned, true); assert.equal(value.health.generation, null); await assert.rejects(value.begin(), code('STORAGE_POISONED'));
    const retained = await engine(namespace).hydrate(); assert.equal(retained.documents[0].body, '{"signature":"retained-same-wire"}'); assert.equal(retained.generation, '1');
  });
  await run('cache publication and owned epoch wait for exact delayed acknowledgement', async () => {
    const namespace = freshNamespace(), base = pool(); let release!: () => void, reached!: () => void, settled = false;
    const acknowledgement = new Promise<void>(resolve => { release = resolve; }), accepted = new Promise<void>(resolve => { reached = resolve; });
    const value = engine(namespace, {pool: wrapPool(base, async (client, text, args) => { const result = await client.query(text, args); if (text === 'COMMIT') { reached(); await acknowledgement; } return result; })});
    await value.begin(); const committing = value.commit([{key: 'fixture.json', body: '{"signature":"same-wire"}'}]).then(result => { settled = true; return result; });
    await accepted; assert.equal(settled, false); assert.equal(value.health.generation, null);
    assert.equal((await pool().query('SELECT body FROM bondtrace_metadata.documents WHERE namespace=$1', [namespace])).rows[0].body, '{"signature":"same-wire"}');
    await assert.rejects(value.begin(), code('STORAGE_TRANSACTION')); release(); await committing; assert.equal(value.health.generation, '1');
  });
  await run('rollback acknowledgement loss poisons and never retains tentative owner', async () => {
    const namespace = freshNamespace(), base = pool();
    const value = engine(namespace, {pool: wrapPool(base, async (client, text, args) => { const result = await client.query(text, args); if (text === 'ROLLBACK') throw new Error('private SQL rollback'); return result; })});
    await value.begin(); await assert.rejects(value.rollback(), code('STORAGE_REMOTE')); assert.equal(value.health.poisoned, true); assert.equal(value.health.generation, null);
    assert.equal((await engine(namespace).hydrate()).generation, '0');
  });
  await run('deadline covers staging and refuses to issue COMMIT after expiry', async () => {
    const namespace = freshNamespace(); await engine(namespace).initialize(); const base = pool(); let commits = 0;
    const value = engine(namespace, {transactionTimeoutMs: 500, pool: wrapPool(base, async (client, text, args) => { if (text === 'COMMIT') commits++; return client.query(text, args); })});
    await value.begin(); await new Promise(resolve => setTimeout(resolve, 550));
    await assert.rejects(value.commit([{key: 'fixture.json', body: '1'}]), error => code('STORAGE_TIMEOUT')(error) || code('STORAGE_POISONED')(error));
    assert.equal(commits, 0); assert.equal(value.health.poisoned, true); assert.equal((await engine(namespace).hydrate()).documents.length, 0);
  });
  await run('assertWriter reads fresh bindings/epoch without hydrating document rows', async () => {
    const namespace = freshNamespace(), base = pool(), queries: string[] = [];
    const value = engine(namespace, {pool: wrapPool(base, async (client, text, args) => { queries.push(text); return client.query(text, args); })});
    await value.begin(); await value.commit([{key: 'fixture.json', body: '1'}]); queries.length = 0;
    const checked = await value.assertWriter(); assert.equal(checked.verified, true); assert.equal(checked.generation, '1');
    assert.equal(queries.some(text => /SELECT key, body, updated_at FROM bondtrace_metadata.documents/.test(text)), false);
    assert.equal(queries.some(text => /pg_advisory_lock\(/.test(text)), false); assert.ok(queries.some(text => /pg_advisory_xact_lock/.test(text)));
  });
  await run('unknown tables inside the fixed app schema are rejected and retained', async () => {
    // This one test creates/removes only its unique synthetic table inside the
    // explicitly supplied isolated test DB; never run this URL against normal data.
    const namespace = freshNamespace(), value = engine(namespace); await value.initialize();
    const name = 'engine_test_' + randomUUID().replaceAll('-', ''); assert.match(name, /^engine_test_[a-f0-9]{32}$/);
    const actual = pool();
    await actual.query('CREATE TABLE bondtrace_metadata.' + name + ' (value TEXT NOT NULL)');
    try {
      await actual.query('INSERT INTO bondtrace_metadata.' + name + ' VALUES($1)', ['retained-sentinel']);
      await assert.rejects(value.hydrate(), code('STORAGE_SCHEMA'));
      assert.equal((await actual.query('SELECT value FROM bondtrace_metadata.' + name)).rows[0].value, 'retained-sentinel');
    } finally { await actual.query('DROP TABLE bondtrace_metadata.' + name); }
  });
});
