import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// The command name is retained for compatibility. This now reports the implemented
// prototype from versioned evidence; it performs no RPC, signing, or deployment.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
function noLinks(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Report refuses symlink/junction paths');
    if (current === path.dirname(current)) break;
  }
}
function money(value) {
  assert.match(value, /^(0|[1-9][0-9]*)$/, 'Money must be an exact integer string');
  const amount = BigInt(value);
  assert.ok(amount <= (1n << 64n) - 1n, 'Money exceeds u64');
  const whole = String(amount / 1000000n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = String(amount % 1000000n).padStart(6, '0').replace(/0+$/, '');
  return whole + (fraction ? '.' + fraction : '');
}
export function buildVerificationReport(directory = process.cwd()) {
  const root = path.resolve(directory), sources = [];
  noLinks(root);
  const read = relative => {
    const file = path.resolve(root, relative);
    assert.ok(file.startsWith(root + path.sep), 'Report source escaped workspace');
    noLinks(file);
    const bytes = fs.readFileSync(file);
    sources.push({path: relative, bytes: bytes.length, sha256: digest(bytes)});
    return {bytes, value: JSON.parse(bytes.toString('utf8'))};
  };
  const release = read('programs/bondtrace/release.json').value;
  const verification = read('docs/evidence/servicing-v4-verification-20261010.json').value;
  const small = read('docs/evidence/servicing-v4-one-command-20261010.json');
  const check = read('docs/evidence/servicing-v4-one-command-check-20261010.json').value;
  const large = read('docs/evidence/servicing-v4-localnet-20261010.json');
  const summary = read('docs/evidence/servicing-v4-localnet-summary-20261010.json').value;
  const history = read('docs/evidence/servicing-v4-history-observation-20261010.json');
  assert.equal(release.releaseId, 'paged-corporate-actions-v4');
  assert.equal(release.sha256, verification.program.artifact.sha256);
  assert.equal(digest(small.bytes), check.publicReportSha256, 'One-command evidence digest differs');
  assert.equal(digest(large.bytes), summary.fullReport.sha256, 'Scale evidence digest differs');
  assert.equal(digest(history.bytes), summary.historyObservation.sha256, 'History evidence digest differs');
  assert.equal(check.passed, true);
  assert.equal(check.proofCount, small.value.proofs.length);
  assert.equal(check.liveSignatureObservation.finalized, check.proofCount);
  for (const field of ['confirmed', 'processed', 'missing', 'errors']) assert.equal(check.liveSignatureObservation[field], 0, 'Live signature check is incomplete');
  for (const cohort of [small.value, large.value]) {
    assert.equal(cohort.passed, true);
    assert.equal(cohort.plan.release.sha256, release.sha256);
    assert.equal(cohort.proofCount, cohort.proofs.length);
    assert.equal(new Set(cohort.proofs.map(p => p.signature)).size, cohort.proofCount);
    assert.equal(cohort.proofGaps.length, 0);
    assert.equal(cohort.finance.remaining, '0');
    assert.equal(cohort.finalView.bondMint.supply, '0');
    assert.equal(cohort.finalView.vault.amount, '0');
  }
  const rows = [small.value, large.value].map(cohort => `<tr><td>${escape(cohort.plan.name)}</td><td>${escape(cohort.initialHolders)} → ${escape(cohort.finalHolders)}</td><td>${escape(cohort.couponCount)}</td><td>${escape(money(cohort.finance.couponPaid))}</td><td>${escape(money(cohort.finance.principalPaid))}</td><td>${escape(cohort.finalView.bond.totalRedeemed)}</td><td>${escape(cohort.proofCount)}</td></tr>`).join('');
  const ci = verification.generalGithubCI, pg = verification.scopedPostgresqlCI;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BondTrace verification snapshot</title><style>body{font:17px/1.55 system-ui;margin:0;background:#0d1420;color:#e4eaf3}main{max-width:1100px;margin:auto;padding:32px}h1,h2{line-height:1.2}a{color:#9bc2ff}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #344154}.scroll{overflow:auto}.note{padding:16px;background:#182337;border-radius:8px}code{overflow-wrap:anywhere}footer{margin-top:32px;color:#b4c1d3}</style><main><h1>BondTrace verification snapshot</h1><p class="note">Recorded test assets on Solana localnet. This file is an offline evidence report, not a live network health check or an official judging score.</p><h2>Completed corporate-action cohorts</h2><div class="scroll"><table><thead><tr><th>Issue</th><th>Holders</th><th>Coupons</th><th>Coupon paid</th><th>Principal paid</th><th>Bonds burned</th><th>Transactions</th></tr></thead><tbody>${rows}</tbody></table></div><p>Both cohorts: zero mint supply, vault balance and remaining obligations. Recorded primary-holder example: ${escape(money(small.value.primary.couponMinor))} coupon and ${escape(money(small.value.primary.principalMinor))} principal. Voting weights remain recorded in each source report. Late coupon after burn: ${small.value.lateCouponAfterBurn && large.value.lateCouponAfterBurn ? "verified in both cohorts" : "not established for both cohorts"}.</p><h2>Finality and evidence boundaries</h2><p>The prepared launcher has ${escape(check.proofCount)}/${escape(check.proofCount)} finalized signatures observed at ${escape(check.checkedAt)}. The separate scale archive records ${escape(summary.archivedFinalityObservations.finalized)} finalized and ${escape(summary.archivedFinalityObservations.confirmed)} confirmed observations; a later passive query found ${escape(history.value.unavailableCount)} older statuses unavailable. Missing history is never promoted to fresh confirmation.</p><h2>Recorded CI</h2><p>Financial-source snapshot <code>${escape(ci.sourceCommit)}</code>: ${escape(ci.node.passed)} Node tests, ${escape(ci.ui.passed)} UI tests, ${escape(ci.rustUnit.passed)} Rust unit and ${escape(ci.compiledSbfRuntime.passed)} runtime tests passed. Node skipped ${escape(ci.node.skipped)} optional PostgreSQL cases. Separate PostgreSQL: ${escape(pg.passed)} passed, ${escape(pg.skipped)} TLS-fixture skips.</p><p>Reviewed SBF: <code>${escape(release.sha256)}</code>, ${escape(release.programLen)} bytes.</p><h2>Explicit remaining acceptance</h2><ul><li>Ordinary human Phantom signing is unverified.</li><li>Public devnet still has the separately recorded v3 program; v4 is verified locally.</li><li>External registry/settlement adapters are sandbox/shadow; a real bank/KASE partner is unverified.</li></ul><p><a href="../../README.md">English guide</a> · <a href="../../README.ru.md">Русский</a> · <a href="../../TECHNICAL.md">Architecture</a> · <a href="../../docs/evidence/servicing-v4-localnet-summary-20261010.json">Scale results</a></p><footer>Generated from ${sources.length} fixed public artifacts. Every input digest is retained in the adjacent manifest. Dates and test scopes remain attached to their original cohorts. No keys, environment files, old idea-selection plans or network requests are read.</footer></main></html>`;
  const output = path.join(root, '.local', 'reports');
  noLinks(output); fs.mkdirSync(output, {recursive: true}); noLinks(output);
  const id = 'verification-' + randomUUID(), file = path.join(output, id + '.html');
  fs.writeFileSync(file, html, {flag: 'wx'});
  const manifest = {schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'offline versioned verification report; not a fresh network assertion', reportFile: path.basename(file), reportSha256: digest(html), sources};
  fs.writeFileSync(path.join(output, id + '.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  return {file, sha256: manifest.reportSha256, sources: sources.length, scope: manifest.scope};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildVerificationReport()));
