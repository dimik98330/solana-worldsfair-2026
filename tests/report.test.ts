import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';

const script = path.resolve('scripts/build-research-report.mjs');
const checkFile = 'docs/evidence/servicing-v4-one-command-check-20261010.json';
const reportFile = 'docs/evidence/servicing-v4-one-command-20261010.json';
function fixture() {
  const root = path.resolve('.local/tests/verification-report-' + randomUUID());
  // Synthetic contract fixtures keep source-only tests independent of archived
  // ledger evidence. Actual published evidence is checked by npm run report.
  const sha256 = 'e'.repeat(64), hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const cohort = (count: number, couponPaid: string, principalPaid: string) => ({
    passed: true, plan: {name: 'Synthetic report fixture', release: {sha256}},
    initialHolders: count === 37 ? 3 : 33, finalHolders: count === 37 ? 4 : 34,
    couponCount: count === 37 ? 2 : 9, lateCouponAfterBurn: true,
    primary: {couponMinor: '500000000', principalMinor: '10000000000'},
    proofs: Array.from({length: count}, (_, i) => ({signature: 'synthetic-' + i})),
    proofCount: count, proofGaps: [], finance: {couponPaid, principalPaid, remaining: '0'},
    finalView: {bondMint: {supply: '0'}, vault: {amount: '0'}, bond: {totalRedeemed: count === 37 ? '18' : '48'}},
  });
  const small = JSON.stringify(cohort(37, '1800000000', '18000000000'));
  const large = JSON.stringify(cohort(253, '21600000000', '48000000000'));
  const history = JSON.stringify({unavailableCount: 75});
  const files: Record<string, string> = {
    'programs/bondtrace/release.json': JSON.stringify({releaseId: 'paged-corporate-actions-v4', sha256, programLen: 959536}),
    'docs/evidence/servicing-v4-verification-20261010.json': JSON.stringify({
      program: {artifact: {sha256}}, generalGithubCI: {sourceCommit: 'synthetic-test-only',
        node: {passed: 352, skipped: 10}, ui: {passed: 90}, rustUnit: {passed: 3}, compiledSbfRuntime: {passed: 20}},
      scopedPostgresqlCI: {passed: 40, skipped: 3},
    }),
    [reportFile]: small,
    [checkFile]: JSON.stringify({passed: true, publicReportSha256: hash(small), proofCount: 37,
      checkedAt: 'synthetic-test-only', liveSignatureObservation: {finalized: 37, confirmed: 0, processed: 0, missing: 0, errors: 0}}),
    'docs/evidence/servicing-v4-localnet-20261010.json': large,
    'docs/evidence/servicing-v4-localnet-summary-20261010.json': JSON.stringify({
      fullReport: {sha256: hash(large)}, historyObservation: {sha256: hash(history)},
      archivedFinalityObservations: {finalized: 247, confirmed: 6},
    }),
    'docs/evidence/servicing-v4-history-observation-20261010.json': history,
  };
  for (const [name, value] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    fs.writeFileSync(path.join(root, name), value);
  }
  return root;
}
function run(root: string) {
  return spawnSync(process.execPath, [script], {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000});
}
test('report command renders verified current cohorts and discloses offline, wallet and history limits', () => {
  const root = fixture(), result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout), html = fs.readFileSync(output.file, 'utf8');
  assert.ok(output.file.startsWith(path.join(root, '.local', 'reports') + path.sep));
  for (const text of ['1,800', '18,000', '21,600', '48,000', '37/37', '75 older statuses unavailable',
    'offline evidence report', 'Phantom signing is unverified', 'Public devnet still']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('product has not been selected'));
  const manifest = JSON.parse(fs.readFileSync(output.file.replace(/\.html$/, '.json'), 'utf8'));
  assert.equal(manifest.sources.length, 7);
  assert.equal(manifest.reportSha256, createHash('sha256').update(html).digest('hex'));
});
test('changed transaction evidence is rejected before any report output is created', () => {
  const root = fixture();
  fs.appendFileSync(path.join(root, reportFile), ' ');
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /One-command evidence digest differs/);
  assert.equal(fs.existsSync(path.join(root, '.local', 'reports')), false);
});
test('an incomplete live signature observation cannot produce a passed report', () => {
  const root = fixture(), file = path.join(root, checkFile), check = JSON.parse(fs.readFileSync(file, 'utf8'));
  check.liveSignatureObservation.missing = 1;
  fs.writeFileSync(file, JSON.stringify(check));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Live signature check is incomplete/);
  assert.equal(fs.existsSync(path.join(root, '.local', 'reports')), false);
});
test('verified user-controlled instrument text remains escaped in the standalone HTML', () => {
  const root = fixture(), file = path.join(root, reportFile), report = JSON.parse(fs.readFileSync(file, 'utf8'));
  report.plan.name = '<script>alert("unsafe")</script>';
  const text = JSON.stringify(report);
  fs.writeFileSync(file, text);
  const checkPath = path.join(root, checkFile), check = JSON.parse(fs.readFileSync(checkPath, 'utf8'));
  check.publicReportSha256 = createHash('sha256').update(text).digest('hex');
  fs.writeFileSync(checkPath, JSON.stringify(check));
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(JSON.parse(result.stdout).file, 'utf8');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});
