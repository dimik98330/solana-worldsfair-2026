import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSigner} from '@solana/kit';
import {getTransferSolInstruction} from '@solana-program/system';
import {demoSigner, execute} from '../server/transactions.ts';
import {network, localDir, rpcUrl} from '../server/config.ts';
import {receipt} from '../server/journal.ts';
import {rpc} from '../server/rpc.ts';

const release = JSON.parse(fs.readFileSync('programs/bondtrace/release.json', 'utf8'));
const runtime = JSON.parse(fs.readFileSync(path.join('.local/backend-execution', release.sha256.slice(0, 12), 'runtime.json'), 'utf8'));
assert.equal(network, 'localnet'); assert.equal(localDir, path.resolve(runtime.dataDirectory)); assert.equal(rpcUrl, runtime.rpcUrl);
const actor = await demoSigner('issuer'), beneficiary = await generateKeyPairSigner();
const minimumRent = await rpc<number>('getMinimumBalanceForRentExemption', [0]);
assert.ok(Number.isSafeInteger(minimumRent) && minimumRent > 0); const amount = BigInt(minimumRent);
const before = await rpc('getBalance', [beneficiary.address, {commitment: 'confirmed'}]); assert.equal(before.value, 0);
const originalFetch = globalThis.fetch; let signature = '', stoppedBeforeSend = 0;
globalThis.fetch = async (input, init) => {
  if (String(input) === rpcUrl && init?.body && JSON.parse(String(init.body)).method === 'sendTransaction') {
    stoppedBeforeSend++; throw new TypeError('Injected interruption before the first RPC relay');
  }
  return originalFetch(input, init);
};
try {
  await assert.rejects(execute([getTransferSolInstruction({source: actor, destination: beneficiary.address, amount})], actor, 'audit_rebroadcast_transfer', [], undefined, value => {signature = value;}), (error: any) => error.code === 'UNKNOWN_STATUS');
} finally {globalThis.fetch = originalFetch;}
assert.equal(stoppedBeforeSend, 1); assert.ok(signature); assert.equal(receipt(signature)?.chainStatus, 'pending');
assert.equal((await rpc('getBalance', [beneficiary.address, {commitment: 'confirmed'}])).value, 0);
async function resend() {
  const response = await fetch(runtime.apiOrigin + '/api/transactions/' + signature + '/rebroadcast', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}', signal: AbortSignal.timeout(30_000)});
  assert.equal(response.status, 200); const value = await response.json(); assert.equal(value.signature, signature); assert.equal(value.status, 'confirmed'); return value;
}
const first = await resend(), replay = await resend(); assert.equal(replay.signature, first.signature);
assert.equal(BigInt((await rpc('getBalance', [beneficiary.address, {commitment: 'confirmed'}])).value), amount);
const evidenceFile = `docs/evidence/rebroadcast-audit-${Date.now()}-${crypto.randomUUID()}.json`;
const report = {checkedAt: new Date().toISOString(), network, origin: runtime.apiOrigin, rpcUrl, programSha256: release.sha256, signature, beneficiary: beneficiary.address, transferLamports: amount.toString(), checks: {faultAfterDurableCommitBeforeRpcRelay: true, recipientBalanceBeforeRelayZero: true, separateApiProcessRecoveredSameSignedBytes: true, completedReplayNoSecondTransfer: true}, first, replay};
fs.writeFileSync(evidenceFile, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({passed: true, signature, transferLamports: amount.toString(), evidenceFile}));
