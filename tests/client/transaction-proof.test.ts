import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {address, appendTransactionMessageInstructions, blockhash, createTransactionMessage, generateKeyPairSigner, getAddressDecoder,
  getBase58Decoder, getCompiledTransactionMessageDecoder, getCompiledTransactionMessageEncoder, getSignatureFromTransaction, getTransactionDecoder, getTransactionEncoder,
  partiallySignTransactionMessageWithSigners, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash} from '@solana/kit';
import {TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';

process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/transaction-proof-' + crypto.randomUUID());
const {captureTransactionProof} = await import('../../server/transaction-proof.ts');
const key = (id: number) => getAddressDecoder().decode(Uint8Array.from({length: 32}, (_, i) => i === 0 ? id : 21));
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
async function fixture(version: 'legacy' | 0 | 1 = 0) {
  const signer = await generateKeyPairSigner(), source = key(1), recipient = key(2), mint = key(3), genesisHash = key(4);
  const message = setTransactionMessageFeePayerSigner(signer, createTransactionMessage({version}));
  const complete = appendTransactionMessageInstructions([{programAddress: TOKEN_PROGRAM_ADDRESS, accounts: [{address: source, role: 1}, {address: recipient, role: 1}], data: Uint8Array.of(1, 2, 3)}],
    setTransactionMessageLifetimeUsingBlockhash({blockhash: blockhash('11111111111111111111111111111111'), lastValidBlockHeight: 1000n}, message));
  const signed = await partiallySignTransactionMessageWithSigners(complete), wire = Buffer.from(getTransactionEncoder().encode(signed));
  const decoded = getCompiledTransactionMessageDecoder().decode(signed.messageBytes), keys = decoded.staticAccounts.map(String), count = keys.length;
  const input = {signature: String(getSignatureFromTransaction(signed)), slot: 100, genesisHash: String(genesisHash), expectedWireBase64: wire.toString('base64')};
  const pre = Array(count).fill(2_000_000); pre[0] = 1_000_000_000;
  const post = [...pre]; post[0] -= 5000;
  const token = (account: string, amount: string) => ({accountIndex: keys.indexOf(account), mint: String(mint), owner: String(signer.address), programId: String(TOKEN_PROGRAM_ADDRESS), uiTokenAmount: {amount, decimals: 6, uiAmount: null, uiAmountString: 'ignored-display-value'}});
  const response: any = {slot: 100, blockTime: 1791417600, version, transaction: [wire.toString('base64'), 'base64'], meta: {
    err: null, fee: 5000, computeUnitsConsumed: 30_000, preBalances: pre, postBalances: post, loadedAddresses: {writable: [], readonly: []},
    preTokenBalances: [token(source, '100'), token(recipient, '0')], postTokenBalances: [token(source, '70'), token(recipient, '30')],
    logMessages: ['Untrusted provider text must never be retained'], innerInstructions: [],
  }};
  let calls = 0;
  const read = async (method: string, params: unknown[]) => { calls++; assert.equal(method, 'getTransaction'); assert.equal(params[0], input.signature);
    assert.deepEqual(params[1], {encoding: 'base64', commitment: 'confirmed', maxSupportedTransactionVersion: 1}); return response; };
  async function rewrite(change: (message: any) => void, resign = true) {
    const compiled = getCompiledTransactionMessageDecoder().decode(signed.messageBytes); change(compiled);
    const bytes = getCompiledTransactionMessageEncoder().encode(compiled);
    const signature = resign ? new Uint8Array(await crypto.subtle.sign('Ed25519', signer.keyPair.privateKey, new Uint8Array(bytes))) : signed.signatures[signer.address]!;
    const transaction = {...signed, messageBytes: bytes as any, signatures: {[signer.address]: signature as any}};
    const rewritten = Buffer.from(getTransactionEncoder().encode(transaction)).toString('base64');
    response.transaction[0] = rewritten; input.signature = String(getSignatureFromTransaction(transaction));
    delete (input as any).expectedWireBase64;
  }
  return {input, response, read, wire, signed, rewrite, calls: () => calls, keys};
}
const unavailable = (value: Awaited<ReturnType<typeof captureTransactionProof>>, expected?: string) => {
  assert.equal(value.status, 'unavailable'); if (value.status !== 'unavailable') throw new Error('Expected proof gap');
  if (expected) assert.equal(value.code, expected); assert.ok(value.attemptedAt); assert.equal('proof' in value, false);
};

test('captures exact signed legacy and v0 bytes once as compact normalized public proof', async () => {
  for (const version of ['legacy', 0] as const) {
    const f = await fixture(version), result = await captureTransactionProof(f.input, f.read);
    assert.equal(result.status, 'captured'); if (result.status !== 'captured') throw new Error('Expected captured proof');
    const p = result.proof;
    assert.equal(f.calls(), 1); assert.equal(p.source, 'retained-confirmed-rpc-transaction'); assert.equal(p.version, version);
    assert.equal(p.schemaVersion,2); if(p.schemaVersion!==2)throw new Error('Expected current proof schema');
    assert.deepEqual(p.provenance,{source:'live-rpc',method:'getTransaction',requestedCommitment:'confirmed',observedAt:p.capturedAt});
    assert.equal(p.signature, f.input.signature); assert.equal(p.slot, 100); assert.equal(p.genesisHash, f.input.genesisHash);
    assert.equal(p.genesisScope, 'caller-confirmed-context-not-returned-by-getTransaction'); assert.equal(p.independentAttestation, false);
    assert.equal(p.transactionSha256, sha(f.wire)); assert.equal(p.messageSha256, sha(new Uint8Array(f.signed.messageBytes)));
    assert.equal(p.expectedWireMatched, true); assert.equal(p.feeLamports, '5000'); assert.equal(p.computeUnitsConsumed, '30000');
    assert.equal(p.postTokenBalances.find(b => b.amount === '30')?.account, f.keys[f.response.meta.postTokenBalances[1].accountIndex]);
    assert.equal(p.preBalances[0], '1000000000'); assert.equal(p.postBalances[0], '999995000');
    const json = JSON.stringify(p); assert.ok(Buffer.byteLength(json) < 65_536);
    assert.equal(json.includes('Untrusted provider'), false); assert.equal(json.includes('transactionBase64'), false);
  }
});

test('finalized proof requires a real finalized getTransaction read; gaps cannot promote confirmed evidence',async()=>{
  const f=await fixture();let queries=0;
  const input={...f.input,commitment:'finalized' as const};
  const result=await captureTransactionProof(input,async(method,params)=>{
    queries++;assert.equal(method,'getTransaction');assert.equal(params[0],f.input.signature);
    assert.deepEqual(params[1],{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:1});return f.response;
  });
  assert.equal(queries,1);assert.equal(result.status,'captured');if(result.status!=='captured')throw new Error('Expected finalized query proof');
  assert.equal(result.proof.schemaVersion,2);assert.equal(result.proof.commitment,'finalized');assert.equal(result.proof.source,'retained-finalized-rpc-transaction');
  if(result.proof.schemaVersion!==2)throw new Error('Expected v2');assert.equal(result.proof.provenance.requestedCommitment,'finalized');
  unavailable(await captureTransactionProof(input,async()=>null),'TRANSACTION_HISTORY_UNAVAILABLE');
  unavailable(await captureTransactionProof({...input,commitment:'processed'} as any,f.read),'INVALID_PROOF_REQUEST');
});

test('unknown CU, owner/program labels and block time remain unknown without invented zero values', async () => {
  const f = await fixture(); delete f.response.meta.computeUnitsConsumed; f.response.blockTime = null;
  delete f.response.meta.preTokenBalances[0].owner; delete f.response.meta.preTokenBalances[0].programId;
  delete (f.input as any).expectedWireBase64;
  const result = await captureTransactionProof(f.input, f.read);
  assert.equal(result.status, 'captured'); if (result.status !== 'captured') throw new Error('Expected captured proof');
  assert.equal(result.proof.computeUnitsConsumed, null); assert.equal(result.proof.blockTime, null); assert.equal(result.proof.expectedWireMatched, null);
  assert.ok(result.proof.preTokenBalances.some(b => b.owner === null && b.programId === null));
});

test('absent/pruned history and transport failures return explicit gaps without a payment-error status', async () => {
  const f = await fixture(); let calls = 0;
  unavailable(await captureTransactionProof(f.input, async () => { calls++; return null; }), 'TRANSACTION_HISTORY_UNAVAILABLE');
  assert.equal(calls, 1);
  unavailable(await captureTransactionProof(f.input, async () => { throw new Error('Private provider error must not be retained'); }), 'TRANSACTION_PROOF_UNAVAILABLE');
});

test('malformed confirmed context arguments are rejected before any RPC request', async () => {
  const f = await fixture();
  for (const bad of [{signature: 'wrong'}, {signature: '1'.repeat(64)}, {slot: -1}, {slot: 1.5}, {slot: Number.MAX_SAFE_INTEGER + 1}, {genesisHash: 'wrong'}, {genesisHash: null}, {expectedWireBase64: '?'}]) {
    unavailable(await captureTransactionProof({...f.input, ...bad} as any, f.read));
  }
  assert.equal(f.calls(), 0);
});

test('slot/signature/exact-wire mismatches and unsuccessful transaction outcomes are never retained as proof', async () => {
  const slot = await fixture(); slot.response.slot++;
  unavailable(await captureTransactionProof(slot.input, slot.read), 'TRANSACTION_CONTEXT_MISMATCH');
  const sig = await fixture(); delete (sig.input as any).expectedWireBase64;
  sig.input.signature = getBase58Decoder().decode(Uint8Array.from({length: 64}, () => 7));
  unavailable(await captureTransactionProof(sig.input, sig.read), 'TRANSACTION_SIGNATURE_MISMATCH');
  const wire = await fixture(), other = await fixture(); wire.input.expectedWireBase64 = other.input.expectedWireBase64;
  unavailable(await captureTransactionProof(wire.input, wire.read), 'TRANSACTION_WIRE_MISMATCH');
  for (const err of [{InstructionError: [0, {Custom: 6000}]}, false, 0]) {
    const failed = await fixture(); failed.response.meta.err = err;
    unavailable(await captureTransactionProof(failed.input, failed.read), 'TRANSACTION_NOT_SUCCESSFUL');
  }
  const absent = await fixture(); delete absent.response.meta.err;
  unavailable(await captureTransactionProof(absent.input, absent.read), 'INVALID_EXECUTION_METADATA');
});

test('a provider cannot attach the right receipt signature to an altered message', async () => {
  const f = await fixture(); await f.rewrite(message => { message.instructions[0].data = Uint8Array.of(9, 9, 9); }, false);
  unavailable(await captureTransactionProof(f.input, f.read), 'INVALID_TRANSACTION_SIGNATURE');
});

test('missing, duplicate, out-of-range and malformed token balances leave explicit proof gaps', async () => {
  const changes: ((meta: any) => void)[] = [
    m => { delete m.preTokenBalances; }, m => { delete m.postTokenBalances; },
    m => { m.postTokenBalances.push({...m.postTokenBalances[0]}); }, m => { m.postTokenBalances[0].accountIndex = 256; },
    m => { m.postTokenBalances[0].accountIndex = -1; }, m => { m.postTokenBalances[0].accountIndex = 1.5; },
    m => { m.postTokenBalances[0].uiTokenAmount.amount = '18446744073709551616'; },
    m => { m.postTokenBalances[0].uiTokenAmount.amount = '01'; }, m => { m.postTokenBalances[0].uiTokenAmount.amount = 1; },
    m => { m.postTokenBalances[0].uiTokenAmount.amount = '-1'; }, m => { m.postTokenBalances[0].uiTokenAmount.amount = '1.1'; },
    m => { m.postTokenBalances[0].uiTokenAmount.decimals = 256; }, m => { m.postTokenBalances[0].uiTokenAmount.decimals = 1.5; },
    m => { m.postTokenBalances[0].mint = 'invalid'; }, m => { m.postTokenBalances[0].owner = 'invalid'; }, m => { m.postTokenBalances[0].programId = 'invalid'; },
    m => { m.postTokenBalances[0].uiTokenAmount.decimals = 5; }, m => { m.postTokenBalances[0].mint = String(key(9)); },
    m => { m.postTokenBalances = Array.from({length: 257}, () => m.postTokenBalances[0]); },
  ];
  for (const change of changes) { const f = await fixture(); change(f.response.meta); unavailable(await captureTransactionProof(f.input, f.read)); }
});

test('missing fee, incoherent lamport totals, unsafe integers and malformed optional metadata are rejected', async () => {
  const changes: ((response: any) => void)[] = [
    r => { delete r.meta.fee; }, r => { r.meta.fee = null; }, r => { r.meta.fee = -1; }, r => { r.meta.fee = 1.5; },
    r => { r.meta.preBalances.pop(); }, r => { r.meta.postBalances.pop(); }, r => { r.meta.postBalances[0]++; },
    r => { r.meta.preBalances[0] = Number.MAX_SAFE_INTEGER + 1; }, r => { r.meta.postBalances[0] = '100'; },
    r => { r.meta.postBalances[0] = -1; }, r => { r.meta.computeUnitsConsumed = -1; }, r => { r.meta.computeUnitsConsumed = '100'; },
    r => { r.blockTime = 0.5; }, r => { r.version = 'legacy'; }, r => { r.meta.loadedAddresses.writable = [String(key(10))]; },
  ];
  for (const change of changes) { const f = await fixture(); change(f.response); unavailable(await captureTransactionProof(f.input, f.read)); }
});

test('unsupported v1 and address-table resolution are explicit gaps rather than invented account mappings', async () => {
  const v1 = await fixture(1); unavailable(await captureTransactionProof(v1.input, v1.read), 'UNSUPPORTED_TRANSACTION_VERSION');
  const alt = await fixture(); await alt.rewrite(message => { message.addressTableLookups = [{lookupTableAddress: key(8), writableIndexes: [0], readonlyIndexes: []}]; });
  unavailable(await captureTransactionProof(alt.input, alt.read), 'UNSUPPORTED_ADDRESS_LOOKUPS');
});

test('invalid instruction indexes and noncanonical/trailing wire bytes are not retained', async () => {
  const index = await fixture(); await index.rewrite(message => { message.instructions[0].accountIndices = [200]; });
  unavailable(await captureTransactionProof(index.input, index.read), 'INVALID_INSTRUCTION_INDEX');
  const trailing = await fixture(); delete (trailing.input as any).expectedWireBase64;
  trailing.response.transaction[0] = Buffer.concat([trailing.wire, Buffer.from([1])]).toString('base64');
  unavailable(await captureTransactionProof(trailing.input, trailing.read));
});
