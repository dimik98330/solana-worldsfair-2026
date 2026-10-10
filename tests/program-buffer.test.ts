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
  type BufferObservation, type BufferRpc, type SignedBufferEvent,
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
  let count = 0, signatures = 0, sendMode: 'unknown-no-effect' | 'unknown-with-effect' | '429' | '403' | undefined;
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
        assert.equal(config.commitment, 'finalized');
        if (config.minContextSlot !== undefined) assert.equal(typeof config.minContextSlot, 'number', 'RPC context slot must be a JSON number');
        value = {context: {slot: 55n}, value: account()}; break;
      }
      case 'getLatestBlockhash': value = {value: {blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100n}}; break;
      case 'getMinimumBalanceForRentExemption': value = rent; break;
      case 'getBalance': value = {value: 5_000_000_000n}; break;
      case 'getFeeForMessage': assert.ok(signatures === sends.length, 'live fee quote precedes new signature'); value = {value: fee}; break;
      case 'simulateTransaction': {
        assert.ok(signatures === sends.length, 'simulation precedes new signature');
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
  const run = () => runBufferStage({image, intent, authoritySigner: signingAuthority, bufferSigner, rpc, journal, limits});
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
