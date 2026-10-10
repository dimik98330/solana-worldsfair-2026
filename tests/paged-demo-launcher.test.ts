import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertPagedDemoNamespace, assertSamePagedLaunchPlan, makePagedLaunchPlan, pagedDemoArguments, retainPagedLaunchPlan } from '../scripts/paged-demo-launcher.ts';

const release = { releaseId: 'paged-corporate-actions-v4', sha256: 'a'.repeat(64) };
function fixture(t: { after(fn: () => void): void }) {
  const prefix = path.join(os.tmpdir(), 'bondtrace-paged-launcher-'), root = fs.mkdtempSync(prefix);
  t.after(() => { const absolute = path.resolve(root); assert.ok(absolute.startsWith(path.resolve(prefix)) && absolute !== path.resolve(prefix)); fs.rmSync(absolute, { recursive: true }); });
  return { root, dataDirectory: path.join(root, '.local/backend-execution', release.sha256.slice(0, 12), 'data'), rpcUrl: 'http://127.0.0.1:8999', release };
}

test('raw paged namespace remains available without a promoted release; reviewed v4 admits exactly its hash/data', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => assertPagedDemoNamespace(path.join(f.root, '.local/paged-demo/example/data'), f.root));
  assert.doesNotThrow(() => assertPagedDemoNamespace('.local/paged-demo/quick/data', f.root));
  assert.doesNotThrow(() => assertPagedDemoNamespace(f.dataDirectory, f.root, release));
  assert.throws(() => assertPagedDemoNamespace(f.dataDirectory, f.root, { ...release, releaseId: 'financial-terms-lifecycle-v3' }), /reviewed/);
});

test('default data, old release namespaces, lookalike descendants and paths outside ignored root fail closed', t => {
  const f = fixture(t);
  for (const relative of ['.local/data', '.local/backend-execution/' + 'b'.repeat(12) + '/data', '.local/backend-execution/' + 'a'.repeat(12) + '/data/child', '.local/backend-execution/' + 'a'.repeat(12) + '/other', '.local/other/paged-demo/data', '.local/paged-demo/../../data', '../outside', '.local-other/paged-demo/data']) {
    assert.throws(() => assertPagedDemoNamespace(path.resolve(f.root, relative), f.root, release), /Data|reviewed/, relative);
  }
  for (const invalidRelease of [null, {}, { ...release, releaseId: 'paged-corporate-actions-v4-copy' }, { ...release, sha256: 'a'.repeat(12) }, { ...release, sha256: 'A'.repeat(64) }]) assert.throws(() => assertPagedDemoNamespace(f.dataDirectory, f.root, invalidRelease), /reviewed/);
});

test('default quick/scale and late modes retain deterministic distinct IDs and explicit CLI arguments', t => {
  const f = fixture(t), ids = new Set<string>();
  for (const scale33 of [false, true]) for (const lateCoupon of [false, true]) {
    const plan = makePagedLaunchPlan({ ...f, scale33, lateCoupon }); ids.add(plan.operationId);
    assert.deepEqual(plan, makePagedLaunchPlan({ ...f, scale33, lateCoupon }));
    assert.deepEqual(pagedDemoArguments(plan), [...(scale33 ? ['--scale33'] : []), ...(lateCoupon ? ['--late-coupon'] : []), '--operation-id', plan.operationId]);
    assert.equal(plan.programSha256, release.sha256);
  }
  assert.equal(ids.size, 4);
  const explicit = makePagedLaunchPlan({ ...f, operationId: 'saved_financial_intent_123', scale33: true, lateCoupon: true });
  assert.equal(pagedDemoArguments(explicit).at(-1), 'saved_financial_intent_123');
});

test('unsafe IDs, remote/authenticated RPC and malformed flags reject before any data is created', t => {
  const f = fixture(t);
  for (const operationId of ['short', '../escape_123', 'safe;command_123', 'with space', 'a'.repeat(81), '']) assert.throws(() => retainPagedLaunchPlan({ ...f, operationId }), /Operation ID/);
  for (const rpcUrl of ['https://api.devnet.solana.com', 'http://user:secret@127.0.0.1:8999', 'http://127.0.0.1:8999?token=x', 'http://127.0.0.1:8999#fragment', 'file:///tmp/rpc']) assert.throws(() => retainPagedLaunchPlan({ ...f, rpcUrl }), /loopback/);
  assert.throws(() => makePagedLaunchPlan({ ...f, scale33: 'true' as unknown as boolean }), /booleans/);
  assert.equal(fs.existsSync(f.dataDirectory), false);
});

test('same-ID resume retains identical plan bytes and never replaces financial metadata or signatures', t => {
  const f = fixture(t), first = retainPagedLaunchPlan({ ...f, scale33: true, lateCoupon: true });
  const before = fs.readFileSync(first.planFile), metadata = path.join(f.dataDirectory, 'historical-signatures.json');
  fs.writeFileSync(metadata, '{"signature":"retained-public-receipt"}\n');
  const second = retainPagedLaunchPlan({ ...f, scale33: true, lateCoupon: true, operationId: first.plan.operationId });
  assert.equal(second.planFile, first.planFile);
  assert.deepEqual(fs.readFileSync(second.planFile), before);
  assert.equal(fs.readFileSync(metadata, 'utf8'), '{"signature":"retained-public-receipt"}\n');
  assert.deepEqual(second.args, first.args);
});

test('an existing launcher ID rejects changed immutable flags and runtime instead of making a new financial intent', t => {
  const f = fixture(t), operationId = 'same_id_must_resume_v4', initial = retainPagedLaunchPlan({ ...f, operationId, lateCoupon: true });
  const before = fs.readFileSync(initial.planFile);
  for (const changed of [{ scale33: true, lateCoupon: true }, { scale33: false, lateCoupon: false }, { rpcUrl: 'http://127.0.0.1:8998', lateCoupon: true }]) {
    assert.throws(() => retainPagedLaunchPlan({ ...f, operationId, ...changed }), /Saved paged lifecycle ID/);
    assert.deepEqual(fs.readFileSync(initial.planFile), before);
  }
  assert.throws(() => assertSamePagedLaunchPlan({ ...initial.plan, programSha256: 'b'.repeat(64) }, initial.plan), /Saved/);
  assert.throws(() => assertSamePagedLaunchPlan({ ...initial.plan, extra: 'unreviewed' }, initial.plan), /Saved/);
});

test('malformed saved plan remains untouched and cannot silently reset the saved intent', t => {
  const f = fixture(t), first = retainPagedLaunchPlan(f);
  fs.writeFileSync(first.planFile, '{"operationId":"corrupt-but-retained"}\n');
  assert.throws(() => retainPagedLaunchPlan(f), /Saved paged lifecycle ID/);
  assert.equal(fs.readFileSync(first.planFile, 'utf8'), '{"operationId":"corrupt-but-retained"}\n');
});

test('an ignored namespace cannot redirect plan writes through a directory link', t => {
  const f = fixture(t), ignored = path.join(f.root, '.local'), destination = path.join(f.root, 'linked-destination');
  fs.mkdirSync(ignored); fs.mkdirSync(destination);
  fs.symlinkSync(destination, path.join(ignored, 'paged-demo'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => retainPagedLaunchPlan({ ...f, dataDirectory: path.join(ignored, 'paged-demo/run/data') }), /cannot traverse links/);
  assert.deepEqual(fs.readdirSync(destination), []);
});
