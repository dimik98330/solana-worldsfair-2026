import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {generateKeyPairSigner} from '@solana/kit';
import {programRpc} from './helpers/program-rpc.ts';
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/rebroadcast-' + crypto.randomUUID());
const [{rebroadcastTransaction}, {buildTransaction}, {instruction}, {rememberPrepared, completePrepared}, {saveReceipt, receipt, updateReceipt}, {signatureOf, rememberLifetime}, {operationStatus}] = await Promise.all([
  import('../../server/rebroadcast.ts'), import('../../server/transactions.ts'), import('../../packages/client/src/program.ts'), import('../../server/prepared.ts'), import('../../server/journal.ts'), import('../../server/rpc.ts'), import('../../server/operations.ts')
]);
const originalFetch = globalThis.fetch;
let landed = false, height = 500, sends = 0, sentBytes = '', sendLoss = false;
globalThis.fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body));
  const deployment = programRpc(request);
  if (deployment !== undefined) return Response.json({jsonrpc: '2.0', id: request.id, result: deployment});
  let result: unknown;
  switch (request.method) {
    case 'getGenesisHash': result = '11111111111111111111111111111111'; break;
    case 'getLatestBlockhash': result = {value: {blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000}, context: {slot: 1}}; break;
    case 'simulateTransaction': result = {value: {err: null, unitsConsumed: 1000}, context: {slot: 1}}; break;
    case 'getFeeForMessage': result = {value: 5000}; break;
    case 'getSignatureStatuses': result = {context: {slot: 101}, value: [landed ? {err: null, slot: 100, confirmationStatus: 'confirmed'} : null]}; break;
    case 'getBlockHeight': result = height; break;
    case 'sendTransaction': sends++; sentBytes = request.params[0]; landed = true; if (sendLoss) throw new TypeError('Response lost after relay'); result = signatureOf(sentBytes); break;
    case 'getTransaction': result = null; break;
    default: throw new Error('Unexpected synthetic RPC: ' + request.method);
  }
  return Response.json({jsonrpc: '2.0', id: request.id, result});
};
after(() => {globalThis.fetch = originalFetch;});
async function interrupted(tag: number) {
  landed = false; height = 500; sendLoss = false;
  const signer = await generateKeyPairSigner();
  const built = await buildTransaction([instruction('cast_vote', [[signer.address, 'sw']], Uint8Array.of(tag))], signer.address, [signer]);
  const id = rememberPrepared(built.transactionBase64, {action: 'rebroadcast_fixture', wallet: signer.address, lastValidBlockHeight: 1000, programRelease: built.programRelease});
  const signature = signatureOf(built.transactionBase64);
  // The real relay commits these records before its first send; emulate a crash at that boundary.
  saveReceipt({signature, action: 'rebroadcast_fixture', wallet: signer.address, network: 'localnet', genesisHash: built.programRelease.genesisHash, programRelease: built.programRelease, chainStatus: 'pending', projectionStatus: 'pending', submittedAt: new Date().toISOString(), lastValidBlockHeight: 1000, signedTransactionBase64: built.transactionBase64});
  rememberLifetime(signature, 1000); completePrepared(id, signature);
  return {id, signature, built};
}
test('commit-before-relay can explicitly send the original bytes once; GET and completed replay never send', async () => {
  const {id, signature, built} = await interrupted(1), before = sends;
  assert.equal((await operationStatus(id)).status, 'pending'); assert.equal(sends, before);
  assert.equal((await rebroadcastTransaction(signature)).status, 'confirmed');
  assert.equal(sentBytes, built.transactionBase64); assert.equal(sends, before + 1);
  assert.equal((await rebroadcastTransaction(signature, id)).signature, signature); assert.equal(sends, before + 1);
});
test('lost response retains uncertainty and the same signature; passive recovery observes acceptance', async () => {
  const {id, signature} = await interrupted(2), before = sends; sendLoss = true;
  await assert.rejects(rebroadcastTransaction(signature), (e: any) => e.code === 'UNKNOWN_STATUS');
  assert.equal(receipt(signature)?.chainStatus, 'pending');
  assert.equal((await operationStatus(id)).status, 'confirmed'); assert.equal(sends, before + 1);
});
test('expired messages, foreign release, changed wire and unrelated identifiers cannot relay', async () => {
  let value = await interrupted(3), before = sends; height = 1001;
  await assert.rejects(rebroadcastTransaction(value.signature), (e: any) => e.code === 'REBROADCAST_EXPIRED'); assert.equal(sends, before);
  value = await interrupted(4); updateReceipt(value.signature, {programRelease: {...value.built.programRelease, sha256: '0'.repeat(64)}});
  await assert.rejects(rebroadcastTransaction(value.signature), (e: any) => e.code === 'PREPARATION_VERSION_CHANGED'); assert.equal(sends, before);
  value = await interrupted(5);
  await assert.rejects(rebroadcastTransaction(value.signature, 'unknown-operation'), (e: any) => e.code === 'OPERATION_NOT_FOUND');
  const raw = Buffer.from(value.built.transactionBase64, 'base64'); raw[raw.length - 1] ^= 1; updateReceipt(value.signature, {signedTransactionBase64: raw.toString('base64')});
  await assert.rejects(rebroadcastTransaction(value.signature), (e: any) => e.code === 'INVALID_SIGNATURE'); assert.equal(sends, before);
});
