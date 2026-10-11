import assert from 'node:assert/strict';
import test from 'node:test';
import {
  address, generateKeyPairSigner, getAddressEncoder, getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress, getSignatureFromTransaction, getTransactionDecoder, verifySignature,
} from '@solana/kit';
import {
  BUFFER_HEADER_BYTES, BUFFER_LOADER, DEVNET_GENESIS, bufferImageHash, bufferWriteInstruction,
  exactBufferU64, runBufferStage, validateBufferAccount, validateBufferEndpoint,
  type BufferIntent, type BufferJournal, type BufferJournalState, type BufferLimits,
  type BufferObservation, type BufferRpc, type SignedBufferEvent, type BufferStageOptions,
} from '../scripts/program-buffer.ts';

// Synthetic RPC/account fixtures. Signatures and wire codecs are actual pinned Kit Ed25519.
// These tests do not establish a native-validator/deployment result.
async function fixture(size = 1805, existing = true) {
  const authority = await generateKeyPairSigner(), bufferSigner = await generateKeyPairSigner();
  const image = Uint8Array.from({length: size}, (_, i) => (i * 13 + 7) % 256);
  const intent: BufferIntent = {version: 1, id: 'synthetic-buffer-fixture', network: 'localnet',
    endpoint: 'http://127.0.0.1:8999', expectedGenesis: '11111111111111111111111111111111',
    bufferAddress: bufferSigner.address, authorityAddress: authority.address,
    imageSha256: bufferImageHash(image), imageLength: image.length, chunkSize: 900};
  let state: BufferJournalState | null = null;
  let accountBytes: Uint8Array | null = existing ? new Uint8Array(size) : null;
  let count = 0, signatures = 0, sendMode: 'unknown-no-effect' | 'unknown-with-effect' | 'accepted-no-effect' | '429' | '403' | undefined;
  let observedComplete = 0, corruptFinal = false, height = 10n, historyMissing = false, failBarrier = false;
  let fee: unknown = 5000n, rent: unknown = 100000n, rpcHang = false;
  const calls: {method: string; params: readonly unknown[]}[] = [], sends: SignedBufferEvent[] = [];
  const statuses = new Map<string, unknown>();
  const journal: BufferJournal = {
    load: () => state ? structuredClone(state) : null,
    initialize(value) { state = {intent: structuredClone(value), signed: [], observations: []}; },
    appendSigned(event) { if (failBarrier) throw new Error('SYNTHETIC_FSYNC_FAILED'); state!.signed.push(structuredClone(event)); },
    recordObservation(value) { state!.observations.push(structuredClone(value)); },
  };
  const signingAuthority = {...authority, signTransactions: async (...args: Parameters<typeof authority.signTransactions>) => {
    signatures++; return authority.signTransactions(...args);
  }};
  function account() {
    if (accountBytes === null) return null;
    const bytes = Buffer.alloc(BUFFER_HEADER_BYTES + size); bytes.writeUInt32LE(1, 0); bytes[4] = 1;
    bytes.set(getAddressEncoder().encode(authority.address), 5); bytes.set(accountBytes, BUFFER_HEADER_BYTES);
    if (accountBytes.every((value, index) => value === image[index])) {
      observedComplete++;
      if (corruptFinal && observedComplete >= 2) bytes[BUFFER_HEADER_BYTES] ^= 1;
    }
    return {owner: BUFFER_LOADER, executable: false, data: [bytes.toString('base64'), 'base64']};
  }
  const rpc: BufferRpc = {endpoint: intent.endpoint, async request<T>(method: string, params: readonly unknown[], signal: AbortSignal): Promise<T> {
    calls.push({method, params}); signal.throwIfAborted();
    let value: unknown;
    if (rpcHang) return new Promise<T>(() => {});
    switch (method) {
      case 'getGenesisHash': value = intent.expectedGenesis; break;
      case 'getAccountInfo': {
        const config = params[1] as {commitment: string; minContextSlot?: unknown};
        assert.ok(['finalized', 'confirmed'].includes(config.commitment));
        if (config.minContextSlot !== undefined) assert.equal(typeof config.minContextSlot, 'number', 'RPC context slot must be a JSON number');
        value = {context: {slot: 55n}, value: account()}; break;
      }
      case 'getLatestBlockhash': value = {value: {blockhash: (await generateKeyPairSigner()).address, lastValidBlockHeight: height + 90n}}; break;
      case 'isBlockhashValid': value = {context: {slot: 55n}, value: false}; break;
      case 'getTransaction': value = null; break;
      case 'getMinimumBalanceForRentExemption': value = rent; break;
      case 'getBalance': value = {value: 5_000_000_000n}; break;
      case 'getFeeForMessage': assert.ok(signatures === new Set(sends.map(e => e.signature)).size, 'live fee quote precedes new signature'); value = {value: fee}; break;
      case 'simulateTransaction': {
        assert.ok(signatures === new Set(sends.map(e => e.signature)).size, 'simulation precedes new signature');
        assert.equal((params[1] as {sigVerify: boolean}).sigVerify, false);
        value = {value: {err: null, unitsConsumed: 2370n}}; break;
      }
      case 'sendTransaction': {
        // Persistence is checked from the journal, not an engine-provided test hook.
        const tx = getTransactionDecoder().decode(Buffer.from(params[0] as string, 'base64'));
        const signature = String(getSignatureFromTransaction(tx));
        const event = state!.signed.find(event => event.signature === signature);
        assert.ok(event, 'durable signed record exists before transport');
        assert.equal(event.wireBase64, params[0]);
        assert.equal((params[1] as {maxRetries: number}).maxRetries, 0);
        assert.ok(Buffer.from(event.wireBase64, 'base64').length <= 1232);
        const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
        assert.equal(compiled.version, 0);
        assert.equal(compiled.staticAccounts[0], authority.address);
        const loader = compiled.instructions.filter(ix => compiled.staticAccounts[ix.programAddressIndex] === BUFFER_LOADER);
        assert.equal(loader.length, 1, 'exactly one BUFFER loader instruction, no upgrade');
        const loaderData = Buffer.from(loader[0].data!);
        assert.ok(loaderData.readUInt32LE(0) === 0 || loaderData.readUInt32LE(0) === 1);
        const price = compiled.instructions.find(ix => Buffer.from(ix.data ?? [])[0] === 3
          && compiled.staticAccounts[ix.programAddressIndex] === 'ComputeBudget111111111111111111111111111111');
        assert.ok(price); assert.equal(Buffer.from(price.data!).readBigUInt64LE(1), 0n);
        for (const [signer, signatureBytes] of Object.entries(tx.signatures))
          assert.ok(signatureBytes && await verifySignature(await getPublicKeyFromAddress(address(signer)), signatureBytes, tx.messageBytes));
        sends.push(event);
        const fault = sendMode; sendMode = undefined;
        if (fault === 'unknown-no-effect' || fault === '429' || fault === '403') throw new Error(fault === '429' ? 'HTTP 429' : fault === '403' ? 'HTTP 403' : 'synthetic lost acknowledgement');
        if (fault === 'accepted-no-effect') { value = signature; break; }
        if (event.kind === 'create') {
          assert.equal(loaderData.readUInt32LE(0), 0); accountBytes = new Uint8Array(size);
        } else {
          assert.equal(loaderData.readUInt32LE(0), 1);
          assert.equal(loaderData.readUInt32LE(4), event.offset);
          assert.equal(loaderData.readBigUInt64LE(8), BigInt(event.length));
          assert.deepEqual(loaderData.subarray(16), Buffer.from(image.subarray(event.offset, event.offset + event.length)));
          accountBytes!.set(loaderData.subarray(16), event.offset);
        }
        if (fault === 'unknown-with-effect') throw new Error('synthetic lost acknowledgement');
        statuses.set(signature, {err: null, confirmationStatus: 'finalized', slot: 55n});
        value = signature; break;
      }
      case 'getSignatureStatuses': value = {value: [(historyMissing ? null : statuses.get((params[0] as string[])[0])) ?? null]}; break;
      case 'getBlockHeight': value = height; break;
      default: throw new Error('Unmocked method ' + method);
    }
    count++;
    return value as T;
  }};
  const limits: BufferLimits = {maxTotalFeeLamports: 100_000n, maxTransactionFeeLamports: 10_000n, maxRentLamports: 200_000n,
    paceMs: 0, pollIntervalMs: 0, maxPolls: 1, rpcTimeoutMs: 500};
  const run = (options: Pick<BufferStageOptions, 'retryExpiredWrites' | 'confirmedProgress' | 'rebroadcastRetainedWrites'> = {}) => runBufferStage({image, intent, authoritySigner: signingAuthority, bufferSigner, rpc, journal, limits, ...options});
  return {image, intent, authority, signingAuthority, bufferSigner, rpc, journal, limits, calls, sends, run,
    get state() { return state!; }, get signatureCount() { return signatures; }, get rpcCount() { return count; },
    set sendMode(value: typeof sendMode) { sendMode = value; }, set historyMissing(value: boolean) { historyMissing = value; },
    set failBarrier(value: boolean) { failBarrier = value; }, set corruptFinal(value: boolean) { corruptFinal = value; },
    set height(value: bigint) { height = value; }, set fee(value: unknown) { fee = value; }, set rent(value: unknown) { rent = value; },
    set rpcHang(value: boolean) { rpcHang = value; }, account};
}

test('actual Kit Ed25519 writes have exact bincode offsets, zero priority price, <=1232B and finalized final hash', async () => {
  const h = await fixture(), result = await h.run();
  assert.equal(result.status, 'bufferReady', result.reason);
  assert.equal(result.finalizedBufferSlot, '55');
  assert.deepEqual(h.sends.map(event => [event.offset, event.length]), [[0, 900], [900, 900], [1800, 5]]);
  assert.equal(result.feesReservedLamports, '15000'); assert.equal(result.completedChunks, 3);
  assert.equal(h.signatureCount, 3);
  assert.ok(result.observations.filter(value => value.status === 'finalized').length === 3);
});

test('fresh buffer creation requires explicit signer, uses live exact rent and initializes only BUFFER', async () => {
  const h = await fixture(901, false);
  const refused = await runBufferStage({image: h.image, intent: h.intent, authoritySigner: h.authority, rpc: h.rpc, journal: h.journal, limits: h.limits});
  assert.equal(refused.reason, 'EXPLICIT_NEW_BUFFER_SIGNER_REQUIRED'); assert.equal(h.sends.length, 0);
  const result = await h.run(); assert.equal(result.status, 'bufferReady', result.reason);
  assert.deepEqual(h.sends.map(event => event.kind), ['create', 'write', 'write']);
  assert.equal(h.sends[0].rentLamports, '100000'); assert.equal(result.rentReservedLamports, '100000');
});

test('write encoding rejects unsafe or overflowing offsets and >900 byte chunks', async () => {
  const h = await fixture();
  for (const offset of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, 0x100000000])
    assert.throws(() => bufferWriteInstruction(h.intent.bufferAddress, h.authority, offset, new Uint8Array(1)), /INVALID_OFFSET/);
  assert.throws(() => bufferWriteInstruction(h.intent.bufferAddress, h.authority, 0, new Uint8Array(901)), /CHUNK_LENGTH/);
});

test('buffer decoder rejects owner, executable, discriminator, absent/wrong authority and size', async () => {
  const h = await fixture(), original = h.account()!;
  const edits = [
    {...original, owner: h.authority.address}, {...original, executable: true},
    ...[0, 4, 5].map(index => { const bytes = Buffer.from(original.data[0], 'base64'); bytes[index] ^= 1; return {...original, data: [bytes.toString('base64'), 'base64']}; }),
    {...original, data: [Buffer.alloc(37).toString('base64'), 'base64']},
  ];
  for (const value of edits) assert.throws(() => validateBufferAccount(value, h.intent), /INVALID_BUFFER/);
});

test('no mainnet/custom public/credential endpoint or non-loopback fast localnet', async () => {
  const h = await fixture();
  for (const endpoint of ['https://api.mainnet-beta.solana.com', 'http://example.com:8899', 'http://127.0.0.1:8899?token=secret', 'http://name:secret@localhost:8899'])
    assert.throws(() => validateBufferEndpoint({...h.intent, endpoint}));
  assert.doesNotThrow(() => validateBufferEndpoint({...h.intent, network: 'devnet', endpoint: 'https://api.devnet.solana.com', expectedGenesis: DEVNET_GENESIS}));
  const intent = {...h.intent, network: 'devnet' as const, endpoint: 'https://api.devnet.solana.com', expectedGenesis: DEVNET_GENESIS};
  const result = await runBufferStage({image: h.image, intent, authoritySigner: h.authority, rpc: {...h.rpc, endpoint: intent.endpoint}, journal: h.journal, limits: h.limits});
  assert.equal(result.reason, 'INVALID_PACE'); assert.equal(h.calls.length, 0);
});

test('durable signed persistence failure prevents send; asynchronous journal is rejected', async () => {
  const h = await fixture(); h.failBarrier = true;
  const result = await h.run(); assert.equal(result.status, 'stopped'); assert.equal(h.sends.length, 0);
  assert.equal(h.calls.filter(value => value.method === 'sendTransaction').length, 0);
  const other = await fixture();
  const asyncJournal = {...other.journal, initialize: (() => Promise.resolve()) as unknown as BufferJournal['initialize']};
  const refused = await runBufferStage({image: other.image, intent: other.intent, authoritySigner: other.authority, rpc: other.rpc, journal: asyncJournal, limits: other.limits});
  assert.equal(refused.reason, 'ASYNC_JOURNAL_FORBIDDEN'); assert.equal(other.sends.length, 0);
});

test('reload barrier detects a journal that acknowledges but loses signed bytes', async () => {
  const h = await fixture();
  const journal = {...h.journal, appendSigned() { /* synthetic broken durability */ }};
  const result = await runBufferStage({image: h.image, intent: h.intent, authoritySigner: h.authority, rpc: h.rpc, journal, limits: h.limits});
  assert.equal(result.reason, 'JOURNAL_SIGNED_BARRIER'); assert.equal(h.sends.length, 0);
});

test('unknown partial same-buffer resume observes original signature/bytes, no resend or replacement signature', async () => {
  const h = await fixture(); h.sendMode = 'unknown-with-effect';
  const first = await h.run(); assert.equal(first.reason, 'SEND_OUTCOME_UNKNOWN');
  const retained = structuredClone(h.state.signed[0]); h.historyMissing = true;
  const second = await h.run(); assert.equal(second.status, 'bufferReady', second.reason);
  assert.equal(h.sends.length, 3); assert.equal(h.signatureCount, 3);
  assert.deepEqual(h.state.signed[0], retained);
  assert.ok(second.observations.some(value => value.signature === retained.signature && value.status === 'effect-observed'));
  assert.ok(!second.observations.some(value => value.signature === retained.signature && value.status === 'finalized'));
});

test('unknown without observed bytes, including expired missing status, never signs or sends a replacement', async () => {
  const h = await fixture(); h.sendMode = 'unknown-no-effect';
  const first = await h.run(); assert.equal(first.reason, 'SEND_OUTCOME_UNKNOWN');
  h.height = 101n;
  const second = await h.run(); assert.equal(second.reason, 'RETAINED_SIGNATURE_UNRESOLVED');
  assert.equal(h.signatureCount, 1); assert.equal(h.sends.length, 1);
  assert.ok(second.observations.some(value => value.status === 'expired-unresolved'));
});

for (const code of ['429', '403'] as const) test(`HTTP ${code} stops new signing and preserves unknown fee exposure`, async () => {
  const h = await fixture(); h.sendMode = code;
  const first = await h.run(); assert.equal(first.reason, code === '429' ? 'RPC_RATE_LIMITED' : 'RPC_FORBIDDEN');
  assert.equal(first.feesReservedLamports, '5000'); assert.equal(h.signatureCount, 1); assert.equal(h.sends.length, 1);
  const second = await h.run(); assert.equal(second.reason, 'RETAINED_SIGNATURE_UNRESOLVED');
  assert.equal(h.signatureCount, 1); assert.equal(h.sends.length, 1);
});

test('cumulative exact fee cap includes unknown signed transactions on resume', async () => {
  const h = await fixture(); h.sendMode = 'unknown-with-effect'; h.limits.maxTotalFeeLamports = 5000n;
  await h.run();
  const resumed = await h.run(); assert.equal(resumed.reason, 'BUDGET_EXCEEDED');
  assert.equal(resumed.feesReservedLamports, '5000'); assert.equal(h.signatureCount, 1); assert.equal(h.sends.length, 1);
});

test('live fee/rent caps and unsafe integers refuse before signing', async () => {
  for (const fee of [10001n, null, Number.MAX_SAFE_INTEGER + 1]) {
    const h = await fixture(); h.fee = fee;
    const result = await h.run(); assert.equal(result.status, 'stopped'); assert.equal(h.signatureCount, 0); assert.equal(h.sends.length, 0);
  }
  const h = await fixture(10, false); h.rent = 200001n;
  assert.equal((await h.run()).reason, 'RENT_BUDGET_EXCEEDED'); assert.equal(h.signatureCount, 0);
  assert.equal(exactBufferU64('18446744073709551615', 'U64'), (1n << 64n) - 1n);
  assert.throws(() => exactBufferU64('18446744073709551616', 'U64'), /INVALID/);
});

test('final account hash mismatch refuses READY after successful write statuses', async () => {
  const h = await fixture(12); h.corruptFinal = true;
  const result = await h.run(); assert.equal(result.reason, 'FINAL_BUFFER_HASH_MISMATCH'); assert.equal(result.status, 'stopped');
  assert.equal(result.finalizedBufferSlot, undefined);
});

test('retained signed wire/image identity tampering refuses recovery and signing', async () => {
  const h = await fixture(); h.sendMode = 'unknown-no-effect'; await h.run();
  h.state.signed[0].offset = 900;
  const result = await h.run(); assert.equal(result.status, 'stopped'); assert.equal(h.signatureCount, 1); assert.equal(h.sends.length, 1);
});

test('explicit run transaction cap stops safely and same journal resumes remaining offsets', async () => {
  const h = await fixture(); h.limits.maxTransactions = 1;
  const first = await h.run(); assert.equal(first.reason, 'TRANSACTION_RUN_LIMIT'); assert.equal(h.sends.length, 1);
  const second = await h.run(); assert.equal(second.reason, 'TRANSACTION_RUN_LIMIT'); assert.equal(h.sends.length, 2);
  const third = await h.run(); assert.equal(third.status, 'bufferReady', third.reason); assert.equal(h.sends.length, 3);
});

test('bounded RPC timeout and AbortSignal stop even an adapter that ignores abort', async () => {
  const h = await fixture(); h.rpcHang = true; h.limits.rpcTimeoutMs = 15;
  // Node's AbortSignal.timeout is unref'ed; keep this synthetic hanging test alive explicitly.
  const keepAlive = setTimeout(() => {}, 200);
  try { const result = await h.run(); assert.equal(result.reason, 'RPC_TIMEOUT'); assert.equal(h.signatureCount, 0); }
  finally { clearTimeout(keepAlive); }
  const other = await fixture(), controller = new AbortController(); controller.abort();
  const result = await runBufferStage({image: other.image, intent: other.intent, authoritySigner: other.authority, rpc: other.rpc, journal: other.journal, limits: other.limits, signal: controller.signal});
  assert.equal(result.status, 'stopped'); assert.equal(other.sends.length, 0);
});

test('genesis mismatch, malformed finalized status and a read-side 429 stop new signing', async () => {
  for (const variant of ['genesis', 'status', 'read429']) {
    const h = await fixture(), original = h.rpc.request.bind(h.rpc);
    h.rpc.request = async <T>(method: string, params: readonly unknown[], signal: AbortSignal): Promise<T> => {
      if (variant === 'genesis' && method === 'getGenesisHash') return DEVNET_GENESIS as T;
      if (variant === 'status' && method === 'getSignatureStatuses') return {value: [{confirmationStatus: 'finalized', slot: 55n}]} as T;
      if (variant === 'read429' && method === 'getFeeForMessage') throw Object.assign(new Error('synthetic'), {status: 429});
      return original<T>(method, params, signal);
    };
    const result = await h.run();
    assert.equal(result.reason, variant === 'genesis' ? 'GENESIS_MISMATCH' : variant === 'status' ? 'INVALID_SIGNATURE_STATUS' : 'RPC_RATE_LIMITED');
    assert.equal(h.signatureCount, variant === 'status' ? 1 : 0);
  }
});

test('finalized transaction slot is retained independently from the later account observation slot', async () => {
  const h = await fixture(5), original = h.rpc.request.bind(h.rpc);
  h.rpc.request = async <T>(method: string, params: readonly unknown[], signal: AbortSignal): Promise<T> => {
    if (method === 'getSignatureStatuses') return {value: [{err: null, confirmationStatus: 'finalized', slot: 50n}]} as T;
    return original<T>(method, params, signal);
  };
  const result = await h.run(); assert.equal(result.status, 'bufferReady', result.reason);
  assert.equal(result.finalizedBufferSlot, '55');
  assert.equal(result.observations.find(value => value.status === 'finalized')!.slot, '50');
});

test('persisted intent key ordering does not change identity at initialization or same-buffer resume', async () => {
  const h = await fixture(5), load = h.journal.load.bind(h.journal);
  h.journal.load = () => {
    const state = load();
    return state ? {...state, intent: Object.fromEntries(Object.entries(state.intent).reverse()) as unknown as BufferIntent} : null;
  };
  const first = await h.run();
  assert.equal(first.status, 'bufferReady', first.reason);
  const signed = h.signatureCount;
  const resumed = await h.run();
  assert.equal(resumed.status, 'bufferReady', resumed.reason);
  assert.equal(h.signatureCount, signed, 'Same persisted intent never creates replacement signatures');
});

test('a changed intent value remains a conflict even when persisted fields are reordered', async () => {
  const h = await fixture(5), load = h.journal.load.bind(h.journal);
  h.journal.load = () => {
    const state = load();
    return state ? {...state, intent: {...Object.fromEntries(Object.entries(state.intent).reverse()), imageSha256:'b'.repeat(64)} as BufferIntent} : null;
  };
  const result = await h.run();
  assert.equal(result.status, 'stopped');
  assert.equal(h.signatureCount, 0);
  assert.equal(h.sends.length, 0);
});

test('explicit expired write retry appends one linked wire, preserves original and counts both fees on resume', async () => {
  const h = await fixture(900); h.sendMode = 'unknown-no-effect';
  assert.equal((await h.run()).reason, 'SEND_OUTCOME_UNKNOWN');
  const original = structuredClone(h.state.signed[0]); h.height = 101n;
  const result = await h.run({retryExpiredWrites: true});
  assert.equal(result.status, 'bufferReady', result.reason);
  assert.equal(result.feesReservedLamports, '10000');
  assert.deepEqual(h.state.signed[0], original);
  const retry = h.state.signed[1];
  assert.equal(retry.id, 'write:0:retry1'); assert.equal(retry.retryOf, original.id);
  assert.notEqual(retry.signature, original.signature); assert.notEqual(retry.blockhash, original.blockhash);
  assert.deepEqual(retry.recovery, {expiredAtHeight: '101', checkedAtSlot: '55'});
  assert.equal((await h.run()).status, 'bufferReady'); assert.equal(h.signatureCount, 2);
});

test('retry requires actual expiry and null history, invalid blockhash, correct finalized buffer and a fresh lifetime', async () => {
  for (const failure of ['expiry', 'valid', 'status', 'transaction', 'authority', 'fresh', '429']) {
    const h = await fixture(900); h.sendMode = 'unknown-no-effect'; await h.run();
    const original = structuredClone(h.state.signed[0]); h.height = failure === 'expiry' ? 100n : 101n;
    const request = h.rpc.request.bind(h.rpc);
    h.rpc.request = async <T>(method: string, params: readonly unknown[], signal: AbortSignal) => {
      if (failure === 'valid' && method === 'isBlockhashValid') return {context: {slot: 55n}, value: true} as T;
      if (failure === 'status' && method === 'getSignatureStatuses') return {value: [{err: null, slot: 55n, confirmationStatus: 'confirmed'}]} as T;
      if (failure === 'transaction' && method === 'getTransaction') return {slot: 55n, meta: {err: null}} as T;
      if (failure === 'fresh' && method === 'getLatestBlockhash') return {value: {blockhash: original.blockhash, lastValidBlockHeight: 100n}} as T;
      if (failure === '429' && method === 'getTransaction') throw Object.assign(new Error('limited'), {status: 429});
      const result = await request<T>(method, params, signal);
      if (failure === 'authority' && method === 'getAccountInfo') (result as {value: {owner: string}}).value.owner = h.authority.address;
      return result;
    };
    const result = await h.run({retryExpiredWrites: true});
    assert.equal(result.status, 'stopped', failure); assert.equal(h.signatureCount, 1, failure);
    assert.deepEqual(h.state.signed[0], original); assert.equal(h.sends.length, 1);
  }
});

test('a lost retry never gets a third signature and create never uses the write exception', async () => {
  const h = await fixture(900); h.sendMode = 'unknown-no-effect'; await h.run(); h.height = 101n;
  h.sendMode = 'unknown-no-effect'; assert.equal((await h.run({retryExpiredWrites: true})).reason, 'SEND_OUTCOME_UNKNOWN');
  h.height = 300n;
  assert.equal((await h.run({retryExpiredWrites: true})).reason, 'RETAINED_SIGNATURE_UNRESOLVED');
  assert.equal(h.signatureCount, 2); assert.equal(h.state.signed.length, 2);
  const create = await fixture(900, false); create.sendMode = 'unknown-no-effect'; await create.run(); create.height = 101n;
  assert.equal((await create.run({retryExpiredWrites: true})).reason, 'RETAINED_SIGNATURE_UNRESOLVED');
  assert.equal(create.signatureCount, 1);
});

test('retry cannot evade cumulative cap or durable barrier', async () => {
  for (const failure of ['budget', 'barrier']) {
    const h = await fixture(900); h.sendMode = 'unknown-no-effect'; await h.run(); h.height = 101n;
    if (failure === 'budget') h.limits.maxTotalFeeLamports = 5000n; else h.failBarrier = true;
    const result = await h.run({retryExpiredWrites: true});
    assert.equal(result.status, 'stopped'); assert.equal(h.sends.length, 1);
    assert.equal(h.state.signed.length, 1);
  }
});

test('tampered retry links or expiry proof refuse before network sends', async () => {
  for (const failure of ['link', 'expiry', 'range']) {
    const h = await fixture(900); h.sendMode = 'unknown-no-effect'; await h.run(); h.height = 101n;
    assert.equal((await h.run({retryExpiredWrites: true})).status, 'bufferReady');
    const retry = h.state.signed[1];
    if (failure === 'link') retry.retryOf = 'create';
    if (failure === 'expiry') retry.recovery!.expiredAtHeight = '100';
    if (failure === 'range') retry.offset = 1;
    assert.equal((await h.run({retryExpiredWrites: true})).status, 'stopped'); assert.equal(h.signatureCount, 2);
  }
});

test('confirmed progress records no premature finality and READY waits for full finalized byte identity', async () => {
  const h = await fixture(1805); let finalizedReady = false, finalPolls = 0;
  const request = h.rpc.request.bind(h.rpc);
  h.rpc.request = async <T>(method: string, params: readonly unknown[], signal: AbortSignal) => {
    const result = await request<T>(method, params, signal);
    if (method === 'getSignatureStatuses') {
      const status = (result as {value: {confirmationStatus: string}[]}).value[0];
      if (status) status.confirmationStatus = 'confirmed';
    }
    if (method === 'getAccountInfo') {
      const commitment = (params[1] as {commitment: string}).commitment;
      if (commitment === 'confirmed') (result as {context: {slot: bigint}}).context.slot = 100n;
      if (commitment === 'finalized' && h.sends.length > 0 && !finalizedReady) {
        if (h.sends.length === 3 && ++finalPolls >= 2) finalizedReady = true;
        else {
          const response = result as {value: {data: [string, string]}};
          const bytes = Buffer.from(response.value.data[0], 'base64'); bytes.fill(0, BUFFER_HEADER_BYTES);
          response.value.data[0] = bytes.toString('base64');
        }
      }
    }
    return result;
  };
  h.limits.maxPolls = 3;
  const result = await h.run({confirmedProgress: true});
  assert.equal(result.status, 'bufferReady', result.reason); assert.equal(finalPolls, 2);
  assert.equal(result.finalizedBufferSlot, '55', 'confirmed context100 must not become finalized55');
  assert.equal(result.observations.filter(o => o.status === 'confirmed').length, 3);
  assert.equal(result.observations.filter(o => o.status === 'effect-observed').length, 3);
  assert.equal(result.observations.filter(o => o.status === 'finalized').length, 0);
});

test('confirmed progress cannot return READY or send more after an absent finalized effect on resume', async () => {
  const h = await fixture(1805); const request = h.rpc.request.bind(h.rpc);
  h.rpc.request = async <T>(method: string, params: readonly unknown[], signal: AbortSignal) => {
    const result = await request<T>(method, params, signal);
    if (method === 'getSignatureStatuses') {
      const status = (result as {value: {confirmationStatus: string}[]}).value[0];
      if (status) status.confirmationStatus = 'confirmed';
    }
    if (method === 'getAccountInfo' && (params[1] as {commitment: string}).commitment === 'finalized') {
      const response = result as {value: {data: [string, string]}};
      const bytes = Buffer.from(response.value.data[0], 'base64'); bytes.fill(0, BUFFER_HEADER_BYTES);
      response.value.data[0] = bytes.toString('base64');
    }
    return result;
  };
  assert.equal((await h.run({confirmedProgress: true})).reason, 'FINAL_BUFFER_HASH_MISMATCH');
  assert.equal(h.signatureCount, 3);
  assert.equal((await h.run({confirmedProgress: true})).reason, 'RETAINED_SIGNATURE_UNRESOLVED');
  assert.equal(h.signatureCount, 3);
});

async function liveRebroadcastFixture(size = 900, existing = true) {
  const h = await fixture(size, existing), request = h.rpc.request.bind(h.rpc);
  h.limits.maxPolls = 4;
  h.rpc.request = async <T>(method: string, params: readonly unknown[], signal: AbortSignal) => method === 'isBlockhashValid'
    ? {context: {slot: 55n}, value: true} as T : request<T>(method, params, signal);
  return h;
}

test('explicit live rebroadcast relays identical write wire once without another signer, event, fee, or weakened final hash', async () => {
  const h = await liveRebroadcastFixture(); h.sendMode = 'accepted-no-effect'; h.limits.maxTotalFeeLamports = 5000n;
  const result = await h.run({rebroadcastRetainedWrites: true});
  assert.equal(result.status, 'bufferReady', result.reason); assert.equal(result.feesReservedLamports, '5000');
  assert.equal(h.signatureCount, 1); assert.equal(h.state.signed.length, 1); assert.equal(h.sends.length, 2);
  assert.deepEqual(h.sends[0], h.sends[1]);
  const marker = h.state.observations.find(o => o.status === 'rebroadcast-attempt')!;
  assert.equal(marker.signature, h.sends[0].signature); assert.equal(marker.eventId, h.sends[0].id);
  assert.equal(marker.wireSha256, bufferImageHash(Buffer.from(h.sends[0].wireBase64, 'base64')));
  assert.equal((await h.run({rebroadcastRetainedWrites: true})).status, 'bufferReady');
  assert.equal(h.sends.length, 2); assert.equal(h.signatureCount, 1);
});

test('rebroadcast defaults off, excludes create, and does not replace an expired write', async () => {
  for (const variant of ['default', 'create', 'expired']) {
    const h = await liveRebroadcastFixture(900, variant !== 'create'); h.sendMode = 'accepted-no-effect';
    assert.equal((await h.run()).status, 'stopped'); h.height = variant === 'expired' ? 101n : 10n;
    assert.equal((await h.run(variant === 'default' ? {} : {rebroadcastRetainedWrites: true})).status, 'stopped');
    assert.equal(h.sends.length, 1, variant); assert.equal(h.signatureCount, 1);
    assert.equal(h.state.observations.filter(o => o.status === 'rebroadcast-attempt').length, 0);
  }
});

test('fresh status, account, blockhash and remaining-lifetime checks can prevent rebroadcast', async () => {
  for (const variant of ['processed', 'confirmed', 'failed', 'effect', 'owner', 'invalid', 'margin', 'stale']) {
    const h = await liveRebroadcastFixture(); h.sendMode = 'accepted-no-effect'; await h.run();
    let statusCalls = 0; const request = h.rpc.request.bind(h.rpc);
    h.rpc.request = async <T>(method: string, params: readonly unknown[], signal: AbortSignal) => {
      if (method === 'getSignatureStatuses' && ++statusCalls === 3 && ['processed','confirmed','failed'].includes(variant))
        return {value: [{err: variant === 'failed' ? {InstructionError: [0, 'invalid']} : null, confirmationStatus: variant === 'processed' ? 'processed' : 'confirmed', slot: 55n}]} as T;
      if (method === 'isBlockhashValid' && variant === 'invalid') return {context: {slot: 55n}, value: false} as T;
      if (method === 'isBlockhashValid' && variant === 'stale') return {context: {slot: 54n}, value: true} as T;
      if (method === 'getBlockHeight' && variant === 'margin') return 95n as T;
      const result = await request<T>(method, params, signal);
      if (method === 'getAccountInfo' && (params[1] as {commitment: string}).commitment === 'confirmed') {
        const account = (result as {value: {owner: string; data: [string, string]}}).value;
        if (variant === 'owner') account.owner = h.authority.address;
        if (variant === 'effect') { const bytes = Buffer.from(account.data[0], 'base64'); bytes.set(h.image, BUFFER_HEADER_BYTES); account.data[0] = bytes.toString('base64'); }
      }
      return result;
    };
    const result = await h.run({rebroadcastRetainedWrites: true});
    assert.equal(result.status, 'stopped', variant); assert.equal(h.sends.length, 1, variant); assert.equal(h.signatureCount, 1);
    assert.equal(h.state.observations.filter(o => o.status === 'rebroadcast-attempt').length, 0, variant);
  }
});

test('rebroadcast durable marker consumes the permission even after a crash before relay', async () => {
  const h = await liveRebroadcastFixture(); h.sendMode = 'accepted-no-effect'; await h.run();
  const original = structuredClone(h.state.signed[0]), record = h.journal.recordObservation.bind(h.journal);
  h.journal.recordObservation = observation => { record(observation); if (observation.status === 'rebroadcast-attempt') throw Error('CRASH_AFTER_FSYNC'); };
  assert.equal((await h.run({rebroadcastRetainedWrites: true})).status, 'stopped');
  assert.equal(h.sends.length, 1); h.journal.recordObservation = record;
  assert.equal((await h.run({rebroadcastRetainedWrites: true})).status, 'stopped');
  assert.equal(h.sends.length, 1); assert.equal(h.signatureCount, 1); assert.deepEqual(h.state.signed[0], original);
  assert.equal(h.state.observations.filter(o => o.status === 'rebroadcast-attempt').length, 1);
});

test('missing durable marker barrier prevents relay and marker tampering is rejected on restart', async () => {
  const h = await liveRebroadcastFixture(); h.sendMode = 'accepted-no-effect'; await h.run();
  const record = h.journal.recordObservation.bind(h.journal);
  h.journal.recordObservation = observation => { if (observation.status !== 'rebroadcast-attempt') record(observation); };
  assert.equal((await h.run({rebroadcastRetainedWrites: true})).reason, 'JOURNAL_REBROADCAST_BARRIER');
  assert.equal(h.sends.length, 1); h.journal.recordObservation = record;
  assert.equal((await h.run({rebroadcastRetainedWrites: true})).status, 'bufferReady');
  const marker = h.state.observations.find(o => o.status === 'rebroadcast-attempt')!;
  marker.wireSha256 = '0'.repeat(64);
  assert.equal((await h.run({rebroadcastRetainedWrites: true})).reason, 'INVALID_REBROADCAST_MARKER');
  assert.equal(h.sends.length, 2); assert.equal(h.signatureCount, 1);
});

test('rebroadcast transport failures stop immediately and never permit a third relay', async () => {
  for (const mode of ['429', '403', 'unknown-no-effect'] as const) {
    const h = await liveRebroadcastFixture(); h.sendMode = 'accepted-no-effect'; await h.run(); h.sendMode = mode;
    const result = await h.run({rebroadcastRetainedWrites: true});
    assert.equal(result.reason, mode === '429' ? 'RPC_RATE_LIMITED' : mode === '403' ? 'RPC_FORBIDDEN' : 'REBROADCAST_OUTCOME_UNKNOWN');
    assert.equal(h.sends.length, 2); assert.equal(h.signatureCount, 1); assert.equal(result.feesReservedLamports, '5000');
    assert.equal((await h.run({rebroadcastRetainedWrites: true})).status, 'stopped');
    assert.equal(h.sends.length, 2); assert.equal(h.state.signed.length, 1);
  }
});

test('rebroadcast does not bypass cumulative budget or final byte verification', async () => {
  const capped = await liveRebroadcastFixture(); capped.sendMode = 'accepted-no-effect'; await capped.run(); capped.limits.maxTotalFeeLamports = 4999n;
  assert.equal((await capped.run({rebroadcastRetainedWrites: true})).reason, 'CUMULATIVE_BUDGET_EXCEEDED');
  assert.equal(capped.sends.length, 1);
  const corrupt = await liveRebroadcastFixture(); corrupt.sendMode = 'accepted-no-effect'; corrupt.corruptFinal = true;
  assert.equal((await corrupt.run({rebroadcastRetainedWrites: true})).reason, 'FINAL_BUFFER_HASH_MISMATCH');
  assert.equal(corrupt.signatureCount, 1); assert.equal(corrupt.sends.length, 2);
});

test('a duplicate rebroadcast marker is invalid even when its original wire and signature match', async () => {
  const h=await liveRebroadcastFixture();h.sendMode='accepted-no-effect';
  assert.equal((await h.run({rebroadcastRetainedWrites:true})).status,'bufferReady');
  h.state.observations.push(structuredClone(h.state.observations.find(o=>o.status==='rebroadcast-attempt')!));
  assert.equal((await h.run({rebroadcastRetainedWrites:true})).reason,'INVALID_REBROADCAST_MARKER');
  assert.equal(h.sends.length,2);assert.equal(h.signatureCount,1);
});
