import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {address, appendTransactionMessageInstructions, blockhash, compileTransaction, createTransactionMessage, getBase58Decoder, getTransactionEncoder, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash} from '@solana/kit';

// Public synthetic metadata only; no live RPC, persisted signer or fixture.
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/operation-identity-' + crypto.randomUUID());
const [{beginOperation, findOperation, operationStatus}, {rememberPrepared, findPrepared, requirePrepared, completePrepared}, {journalWrite, saveReceipt}, {closeStorage}, {AppError, transactionStatus}] = await Promise.all([
  import('../../server/operations.ts'), import('../../server/prepared.ts'), import('../../server/journal.ts'), import('../../server/storage.ts'), import('../../server/rpc.ts'),
]);
const wallet = address('11111111111111111111111111111111');
const originalFetch = globalThis.fetch;
let rpcCalls = 0;
globalThis.fetch = async () => { rpcCalls++; throw new Error('No RPC permitted in identifier reservation tests'); };
after(() => { globalThis.fetch = originalFetch; closeStorage(); });
const conflict = (error: unknown) => error instanceof AppError && error.code === 'RECOVERY_ID_CONFLICT' && error.status === 409;
function message(tag: number) {
  const value = setTransactionMessageFeePayer(wallet, createTransactionMessage({version: 0}));
  const lifetime = setTransactionMessageLifetimeUsingBlockhash({blockhash: blockhash(wallet), lastValidBlockHeight: 1000n}, value);
  const transaction = compileTransaction(appendTransactionMessageInstructions([{programAddress: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), data: Uint8Array.of(tag)}], lifetime));
  return {base64: Buffer.from(getTransactionEncoder().encode(transaction)).toString('base64'), id: createHash('sha256').update(Buffer.from(transaction.messageBytes)).digest('hex')};
}
const details = {action: 'identity_fixture', wallet, lastValidBlockHeight: 1000};

test('a wallet review reserves its identifier against a later demo intent without changing replay', () => {
  const {base64, id} = message(1);
  assert.equal(rememberPrepared(base64, details), id);
  const before = findPrepared(id);
  assert.throws(() => beginOperation(id, 'fund_vault', 'issuer', {amountMinor: '1'}), conflict);
  assert.deepEqual(findPrepared(id), before);
  assert.equal(findOperation(id), null);
  assert.equal(rememberPrepared(base64, details), id);
  assert.equal(requirePrepared(base64).id, id);
  assert.equal(rpcCalls, 0);
});

test('a demo intent reserves its identifier against a later wallet review without changing replay', () => {
  const {base64, id} = message(2), params = {amountMinor: '1'};
  const first = beginOperation(id, 'fund_vault', 'issuer', params);
  assert.throws(() => rememberPrepared(base64, details), conflict);
  assert.equal(findPrepared(id), null);
  assert.deepEqual(findOperation(id), first.operation);
  assert.equal(beginOperation(id, 'fund_vault', 'issuer', params).new, false);
  assert.equal(rpcCalls, 0);
});

test('legacy ambiguous rows cannot report another operation or relay a prepared message, and known signatures remain readable', async () => {
  const {base64, id} = message(3);
  rememberPrepared(base64, details);
  const signature = getBase58Decoder().decode(Uint8Array.from({length: 64}, () => 17));
  completePrepared(id, signature);
  saveReceipt({signature, action: details.action, network: 'localnet', genesisHash: wallet, chainStatus: 'confirmed', projectionStatus: 'complete', submittedAt: '2026-10-08T00:00:00.000Z', slot: 100});
  journalWrite('operations', id, {id, digest: 'synthetic-legacy', action: 'fund_vault', role: 'issuer', status: 'error', error: 'Unrelated unsigned error', createdAt: '2026-10-08T00:00:00.000Z'});
  const before = {prepared: findPrepared(id), operation: findOperation(id)};
  assert.throws(() => requirePrepared(base64), conflict);
  await assert.rejects(() => operationStatus(id), conflict);
  assert.deepEqual({prepared: findPrepared(id), operation: findOperation(id)}, before);
  assert.equal(rpcCalls, 0);

  const rejectFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      const result = request.method === 'getGenesisHash' ? wallet : request.method === 'getSignatureStatuses' ? {context: {slot: 101}, value: [{slot: 100, err: null, confirmationStatus: 'confirmed'}]} : undefined;
      assert.ok(result, 'Signature recovery cannot send a transaction');
      return Response.json({jsonrpc: '2.0', id: request.id, result});
    };
    assert.equal((await transactionStatus(signature)).status, 'confirmed');
  } finally { globalThis.fetch = rejectFetch; }
});

test('concurrent processes reserve exactly one namespace for a shared recovery identifier', async () => {
  const {base64, id} = message(4);
  const moduleUrl = (name: string) => pathToFileURL(path.resolve('server', name + '.ts')).href;
  const source = `
    const [{beginOperation},{rememberPrepared},{closeStorage}]=await Promise.all([import(${JSON.stringify(moduleUrl('operations'))}),import(${JSON.stringify(moduleUrl('prepared'))}),import(${JSON.stringify(moduleUrl('storage'))})]);
    const chunks=[]; for await(const chunk of process.stdin)chunks.push(chunk); const input=JSON.parse(Buffer.concat(chunks).toString());
    try{if(input.kind==='operations')beginOperation(input.id,'fund_vault','issuer',{amountMinor:'1'});else rememberPrepared(input.base64,input.details);process.stdout.write('created');}
    catch(error){if(error.code!=='RECOVERY_ID_CONFLICT')throw error;process.stdout.write('conflict');}finally{closeStorage();}
  `;
  const worker = (kind: string) => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {cwd: process.cwd(), env: {...process.env}, windowsHide: true});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Namespace reservation worker timed out')); }, 15_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(stderr)); });
    child.stdin.end(JSON.stringify({kind, id, base64, details}));
  });
  assert.deepEqual((await Promise.all([worker('operations'), worker('prepared')])).sort(), ['conflict', 'created']);
  assert.notEqual(Boolean(findOperation(id)), Boolean(findPrepared(id)));
});
