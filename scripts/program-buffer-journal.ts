import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import type {BufferIntent, BufferJournal, BufferJournalState, SignedBufferEvent, BufferObservation} from './program-buffer.ts';

const MAX_JSON_BYTES = 32768;
function fail(code: string): never { throw new Error(code); }
function plainAncestors(file: string): void {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    try {
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink()) fail('BUFFER_JOURNAL_SYMLINK');
      if (info.isFile() && info.nlink > 1) fail('BUFFER_JOURNAL_HARDLINK');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (current === path.dirname(current)) break;
  }
}
function json(value: unknown): string {
  const result = JSON.stringify(value);
  if (typeof result !== 'string' || Buffer.byteLength(result) > MAX_JSON_BYTES) fail('BUFFER_JOURNAL_RECORD_SIZE');
  return result;
}
function canonicalIntent(intent: BufferIntent): string {
  return json({
    version: intent.version, id: intent.id, network: intent.network, endpoint: intent.endpoint,
    expectedGenesis: intent.expectedGenesis, bufferAddress: intent.bufferAddress,
    authorityAddress: intent.authorityAddress, imageSha256: intent.imageSha256,
    imageLength: intent.imageLength, chunkSize: intent.chunkSize,
  });
}
/** CLI-only durable journal. A second SQLite database holds an OS writer lock across RPC waits;
 * the metadata database commits each signed wire with DELETE/EXTRA before any network send.
 * Crash releases the OS lock without deleting intents or relying on stale PID/lease guesses. */
export class SqliteBufferJournal implements BufferJournal {
  readonly directory: string;
  private lock: DatabaseSync | null = null;
  private metadata: DatabaseSync | null = null;
  private poisoned = false;
  private readonly expectedIntent: string;

  constructor(workspace: string, directory: string, readonly intent: BufferIntent) {
    const base = path.resolve(workspace, '.local', 'program-buffer');
    this.directory = path.resolve(directory);
    const relative = path.relative(base, this.directory);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('BUFFER_JOURNAL_BOUNDARY');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(intent.id)) fail('BUFFER_JOURNAL_ID');
    plainAncestors(this.directory);
    this.expectedIntent = canonicalIntent(intent);
  }

  acquire(): void {
    if (this.lock || this.metadata || this.poisoned) fail('BUFFER_JOURNAL_STATE');
    plainAncestors(this.directory);
    fs.mkdirSync(this.directory, {recursive: true, mode: 0o700});
    plainAncestors(this.directory);
    const lockPath = path.join(this.directory, 'writer-lock.sqlite');
    const metadataPath = path.join(this.directory, 'journal.sqlite');
    plainAncestors(lockPath); plainAncestors(metadataPath);
    let lock: DatabaseSync | null = null, metadata: DatabaseSync | null = null;
    try {
      lock = new DatabaseSync(lockPath);
      lock.exec('PRAGMA busy_timeout=0; PRAGMA synchronous=EXTRA; BEGIN EXCLUSIVE');
      plainAncestors(lockPath); plainAncestors(metadataPath);
      metadata = new DatabaseSync(metadataPath);
      const tables = metadata.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name: string}[];
      if (tables.some(row => !['intent', 'signed', 'observations', 'sqlite_sequence'].includes(row.name))) fail('BUFFER_JOURNAL_FOREIGN_DATABASE');
      const version = metadata.prepare('PRAGMA user_version').get() as {user_version: number};
      if (![0, 1].includes(version.user_version)) fail('BUFFER_JOURNAL_SCHEMA');
      metadata.exec('PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA foreign_keys=ON;');
      metadata.exec('BEGIN IMMEDIATE');
      metadata.exec('CREATE TABLE IF NOT EXISTS intent (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS signed (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, json TEXT NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS observations (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES signed(id), json TEXT NOT NULL) STRICT; PRAGMA user_version=1;');
      metadata.exec('COMMIT');
      const integrity = metadata.prepare('PRAGMA quick_check').all() as Record<string, unknown>[];
      if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') fail('BUFFER_JOURNAL_INTEGRITY');
      plainAncestors(lockPath); plainAncestors(metadataPath);
      this.lock = lock; this.metadata = metadata;
      const current = this.load();
      if (current && canonicalIntent(current.intent) !== this.expectedIntent) fail('BUFFER_INTENT_CONFLICT');
    } catch (error) {
      try { metadata?.close(); } catch {}
      try { lock?.exec('ROLLBACK'); } catch {}
      try { lock?.close(); } catch {}
      this.lock = null; this.metadata = null;
      if (String((error as Error).message).includes('locked')) fail('BUFFER_JOURNAL_BUSY');
      throw error;
    }
  }

  private database(): DatabaseSync {
    if (this.poisoned || !this.lock || !this.metadata) fail('BUFFER_JOURNAL_NOT_OWNED');
    plainAncestors(this.directory);
    plainAncestors(path.join(this.directory, 'writer-lock.sqlite'));
    plainAncestors(path.join(this.directory, 'journal.sqlite'));
    return this.metadata;
  }

  private transaction(change: (db: DatabaseSync) => void): void {
    const db = this.database();
    let began = false, committing = false;
    try {
      db.exec('BEGIN IMMEDIATE'); began = true;
      change(db);
      committing = true; db.exec('COMMIT'); began = false;
    } catch (error) {
      if (committing) this.poisoned = true;
      if (began) { try { db.exec('ROLLBACK'); } catch { this.poisoned = true; } }
      throw error;
    }
  }

  load(): BufferJournalState | null {
    const db = this.database();
    const row = db.prepare('SELECT json FROM intent WHERE id=1').get() as {json: string} | undefined;
    if (!row) return null;
    const intent = JSON.parse(row.json) as BufferIntent;
    if (canonicalIntent(intent) !== this.expectedIntent) fail('BUFFER_INTENT_CONFLICT');
    const signed = db.prepare('SELECT json FROM signed ORDER BY seq').all() as {json: string}[];
    const observations = db.prepare('SELECT json FROM observations ORDER BY seq').all() as {json: string}[];
    return {intent, signed: signed.map(r => JSON.parse(r.json)), observations: observations.map(r => JSON.parse(r.json))};
  }

  initialize(intent: BufferIntent): void {
    if (canonicalIntent(intent) !== this.expectedIntent) fail('BUFFER_INTENT_CONFLICT');
    const current = this.load();
    if (current) { assert.deepEqual(current.intent, intent); return; }
    this.transaction(db => { db.prepare('INSERT INTO intent(id,json) VALUES(1,?)').run(this.expectedIntent); });
  }

  appendSigned(event: SignedBufferEvent): void {
    const current = this.load();
    if (!current || event.intentId !== this.intent.id || event.imageSha256 !== this.intent.imageSha256) fail('BUFFER_INTENT_CONFLICT');
    if (typeof event.id !== 'string' || !event.id || event.id.length > 160) fail('BUFFER_JOURNAL_EVENT_ID');
    if (typeof event.wireBase64 !== 'string' || !event.wireBase64 || event.wireBase64.length > 16384) fail('BUFFER_JOURNAL_WIRE');
    for (const value of [event.feeLamports, event.rentLamports, event.lastValidBlockHeight]) {
      if (!/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > (1n << 64n) - 1n) fail('BUFFER_JOURNAL_U64');
    }
    this.transaction(db => { db.prepare('INSERT INTO signed(id,json) VALUES(?,?)').run(event.id, json(event)); });
  }

  recordObservation(observation: BufferObservation): void {
    if (!this.load()) fail('BUFFER_JOURNAL_NOT_INITIALIZED');
    this.transaction(db => { db.prepare('INSERT INTO observations(event_id,json) VALUES(?,?)').run(observation.eventId, json(observation)); });
  }

  close(): void {
    try { this.metadata?.close(); } finally {
      this.metadata = null;
      try { this.lock?.exec('ROLLBACK'); } finally { this.lock?.close(); this.lock = null; }
    }
  }
}
