import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SqliteBufferJournal} from '../scripts/program-buffer-journal.ts';
import type {BufferIntent, SignedBufferEvent} from '../scripts/program-buffer.ts';

const workspace = process.cwd();
function fixture() {
  const id = 'journal_' + randomUUID().replaceAll('-', '');
  const directory = path.resolve('.local/program-buffer', id, 'journal');
  const intent: BufferIntent = {version: 1, id, network: 'localnet', endpoint: 'http://127.0.0.1:8999/',
    expectedGenesis: '11111111111111111111111111111111', bufferAddress: '11111111111111111111111111111111',
    authorityAddress: '11111111111111111111111111111111', imageSha256: 'a'.repeat(64), imageLength: 900, chunkSize: 900};
  return {intent, directory};
}
function signed(intent: BufferIntent): SignedBufferEvent {
  return {id: 'synthetic-write-event', intentId: intent.id, kind: 'write', offset: 0, length: 900,
    imageSha256: intent.imageSha256, signature: 'synthetic-signature', wireBase64: 'AQ==',
    blockhash: 'synthetic-blockhash', lastValidBlockHeight: '100', feeLamports: '5000', rentLamports: '0'};
}
test('signed wire and original lifetime survive a fresh journal connection without new signing', () => {
  const {intent, directory} = fixture(), event = signed(intent);
  let journal = new SqliteBufferJournal(workspace, directory, intent);
  journal.acquire(); journal.initialize(intent); journal.appendSigned(event);
  journal.recordObservation({eventId: event.id, signature: event.signature, status: 'unknown'});
  journal.close();
  journal = new SqliteBufferJournal(workspace, directory, intent);
  journal.acquire();
  assert.deepEqual(journal.load(), {intent, signed: [event], observations: [{eventId: event.id, signature: event.signature, status: 'unknown'}]});
  journal.close();
});
test('OS writer lock rejects another live writer and allows it after known close', () => {
  const {intent, directory} = fixture();
  const first = new SqliteBufferJournal(workspace, directory, intent), second = new SqliteBufferJournal(workspace, directory, intent);
  first.acquire(); first.initialize(intent);
  assert.throws(() => second.acquire(), /BUFFER_JOURNAL_BUSY/);
  first.close(); second.acquire(); assert.deepEqual(second.load()?.intent, intent); second.close();
});
test('same namespace cannot be rebound to another image or actor intent', () => {
  const {intent, directory} = fixture(), first = new SqliteBufferJournal(workspace, directory, intent);
  first.acquire(); first.initialize(intent); first.close();
  const other = new SqliteBufferJournal(workspace, directory, {...intent, imageSha256: 'b'.repeat(64)});
  assert.throws(() => other.acquire(), /BUFFER_INTENT_CONFLICT/);
});
test('duplicate signed events fail atomically and observation cannot invent an absent signed wire', () => {
  const {intent, directory} = fixture(), journal = new SqliteBufferJournal(workspace, directory, intent), event = signed(intent);
  journal.acquire(); journal.initialize(intent); journal.appendSigned(event);
  assert.throws(() => journal.appendSigned(event));
  assert.throws(() => journal.recordObservation({eventId: 'absent', signature: 'absent', status: 'finalized'}));
  assert.equal(journal.load()?.signed.length, 1); assert.equal(journal.load()?.observations.length, 0); journal.close();
});
test('namespace escape and symlink ancestors are rejected before SQLite creates external files', t => {
  const {intent, directory} = fixture();
  assert.throws(() => new SqliteBufferJournal(workspace, path.resolve('.local/foreign'), intent), /BOUNDARY/);
  const link = path.resolve('.local/program-buffer', 'link_' + randomUUID()), target = path.resolve('.local/tests', 'link_target_' + randomUUID());
  fs.mkdirSync(target, {recursive: true});
  try { fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) {
    if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { t.skip('OS symlink permission unavailable'); return; }
    throw error;
  }
  assert.throws(() => new SqliteBufferJournal(workspace, path.join(link, 'journal'), intent), /SYMLINK/);
  assert.deepEqual(fs.readdirSync(target), []);
  fs.unlinkSync(link);
  assert.ok(!fs.existsSync(directory));
});

test('dangling namespace junction is refused without creating its missing target', t => {
  const {intent} = fixture();
  const link = path.resolve('.local/program-buffer', 'dangling_' + randomUUID());
  const target = path.resolve('.local/tests', 'absent_' + randomUUID());
  fs.mkdirSync(path.dirname(link), {recursive:true});
  try { fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { t.skip('OS symlink permission unavailable'); return; }
    throw error;
  }
  try {
    assert.equal(fs.existsSync(link), false);
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.throws(() => new SqliteBufferJournal(workspace, path.join(link,'journal'), intent), /SYMLINK/);
    assert.equal(fs.existsSync(target), false);
  } finally { fs.unlinkSync(link); }
});
