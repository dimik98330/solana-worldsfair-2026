import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {captureTransactionProof} from '../server/transaction-proof.ts';
import {confirmedRateEvidence, normalizeRateDescriptor} from '../server/rate-terms.ts';
import {decodeFinancialTerms,deriveFinancialTerms,PROGRAM_ID} from '../packages/client/src/program.ts';

const file = path.resolve(process.argv[2] ?? '');
if (path.dirname(file) !== path.resolve('docs/evidence') || !/^execution-[a-z0-9-]+\.json$/.test(path.basename(file))) throw new Error('Select one public docs/evidence/execution-*.json artifact');
assert.ok(fs.statSync(file).size < 20_000_000, 'Evidence exceeds its bound');
const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
function localOrigin(value: unknown) {
  assert.equal(typeof value, 'string');
  const url = new URL(value as string);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Only original loopback endpoints are supported');
  return url.origin;
}
const origin = localOrigin(evidence.origin), rpcUrl = localOrigin(evidence.rpcUrl);
let sequence = 0;
async function readRpc(method: string, params: unknown[]) {
  const id = ++sequence, response = await fetch(rpcUrl, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id, method, params}), signal: AbortSignal.timeout(15_000)});
  assert.ok(response.ok); const value = await response.json();
  assert.equal(value.id, id); assert.equal(value.jsonrpc, '2.0'); assert.equal(value.error, undefined); return value.result;
}
async function api(route: string) {
  const response = await fetch(origin + route, {signal: AbortSignal.timeout(15_000)});
  assert.ok(response.ok); return response.json();
}
assert.match(evidence.bond, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const genesisHash = await readRpc('getGenesisHash', []);
assert.equal(genesisHash, evidence.program.genesisHash, 'Different ledger: historical signatures must not be reassigned');
const health = await api('/api/health');
assert.equal(health.program.status, 'known-match');
assert.equal(health.program.observed.sha256, evidence.program.observed.sha256, 'Different deployed release');
const state = await api('/api/state?instrument=' + evidence.bond);
assert.equal(state.servicing.fullySettled, true);
if (evidence.state.instrument.rateTerms) assert.deepEqual(state.instrument.rateTerms, evidence.state.instrument.rateTerms, 'Signed annual-rate evidence must not disappear or change');
if(evidence.state.instrument.financialTerms){
  assert.ok(state.instrument.financialTerms,'Program financial terms must survive metadata recovery');
  const {contextSlot:_old,...savedTerms}=evidence.state.instrument.financialTerms,{contextSlot:_now,...currentTerms}=state.instrument.financialTerms;assert.deepEqual(currentTerms,savedTerms);
  assert.equal(currentTerms.address,await deriveFinancialTerms(evidence.bond));
  const account=await readRpc('getAccountInfo',[currentTerms.address,{encoding:'base64',commitment:'finalized'}]);assert.equal(account.value.owner,PROGRAM_ID);assert.equal(account.value.executable,false);
  const terms=decodeFinancialTerms(Buffer.from(account.value.data[0],'base64'));assert.equal(terms.bond,evidence.bond);assert.equal(terms.nominal.toString(),state.instrument.faceValueMinor);assert.equal(terms.rateBps,state.instrument.rateBps);assert.equal(terms.couponFrequency,state.instrument.couponFrequency);assert.equal(terms.unitAmount.toString(),currentTerms.couponUnitMinor);
}
for (const name of ['cashPaid', 'couponPaid', 'principalPaid', 'remainingObligations']) assert.equal(state.reconciliation.totals[name].baseUnits, evidence.state.reconciliation.totals[name].baseUnits);
assert.equal(state.instrument.vaultBalanceMinor, '0'); assert.equal(state.reconciliation.supply.mintSupplyUnits, '0');
const all = [...evidence.receipts, ...evidence.auxiliary, ...evidence.runs.flatMap((run: any) => run.groups)];
assert.ok(all.length > 0 && all.length <= 100);
const unique = new Set<string>();
for (const item of all) {
  assert.match(item.signature, /^[1-9A-HJ-NP-Za-km-z]{60,100}$/); assert.ok(!unique.has(item.signature), 'Repeated signature in lifecycle evidence'); unique.add(item.signature);
  const statuses = await readRpc('getSignatureStatuses', [[item.signature], {searchTransactionHistory: true}]);
  const status = statuses.value[0]; assert.ok(status && ['confirmed', 'finalized'].includes(status.confirmationStatus)); assert.equal(status.err, null);
  const archived = evidence.archivedProofs.find((proof: any) => proof.proof?.signature === item.signature)?.proof;
  assert.ok(archived, 'Missing original archived proof');
  if(archived.commitment==='finalized')assert.equal(status.confirmationStatus,'finalized');
  const result = await captureTransactionProof({signature: item.signature, slot: status.slot, genesisHash,commitment:archived.commitment==='finalized'?'finalized':'confirmed'}, readRpc);
  if (result.status !== 'captured') throw new Error('History gap: ' + result.code + '; this is not fresh RPC verification');
  assert.equal(result.proof.transactionSha256, archived.transactionSha256); assert.equal(result.proof.messageSha256, archived.messageSha256);
  assert.equal(result.proof.feeLamports, archived.feeLamports);
}
if (state.instrument.rateTerms) {
  const terms = state.instrument.rateTerms, created = evidence.receipts.find((item: any) => item.action === 'initialize_issue'); assert.equal(created.signature, terms.creationSignature);
  const transaction = await readRpc('getTransaction', [created.signature, {encoding: 'base64', commitment: 'confirmed', maxSupportedTransactionVersion: 0}]); assert.equal(transaction.meta.err, null);
  const descriptor = normalizeRateDescriptor({rateBps: terms.rateBps, couponFrequency: terms.couponFrequency}, BigInt(state.instrument.faceValueMinor))!;
  const verified = await confirmedRateEvidence({signature: created.signature, action: 'initialize_issue', bond: evidence.bond, wallet: state.instrument.issuer, network: 'localnet', genesisHash, chainStatus: 'confirmed', projectionStatus: 'complete', submittedAt: evidence.checkedAt, signedTransactionBase64: transaction.transaction[0]}, evidence.bond, state.instrument.issuer, state.instrument.faceValueMinor, descriptor);
  assert.equal(verified.memoSha256, terms.memoSha256);
}
console.log(JSON.stringify({passed: true, mode: 'read-only-live-localnet-verification', bond: evidence.bond, signatures: unique.size, genesisHash, programSha256: health.program.observed.sha256, couponMinor: state.reconciliation.totals.couponPaid.baseUnits, principalMinor: state.reconciliation.totals.principalPaid.baseUnits, supply: '0', vault: '0'}));
