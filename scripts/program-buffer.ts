/** Resumable BUFFER staging only. There is deliberately no deploy/upgrade/extend/close operation. */
import {createHash} from 'node:crypto';
import {
  AccountRole, address, appendTransactionMessageInstructions, blockhash, compileTransaction,
  createNoopSigner, createTransactionMessage, getAddressDecoder, getPublicKeyFromAddress,
  getSignatureFromTransaction, getTransactionDecoder, getTransactionEncoder,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners, verifySignature, type Instruction, type ReadonlyUint8Array, type TransactionSigner,
} from '@solana/kit';
import {getCreateAccountInstruction} from '@solana-program/system';
import {getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction} from '@solana-program/compute-budget';

export const BUFFER_LOADER = address('BPFLoaderUpgradeab1e11111111111111111111111');
export const BUFFER_CHUNK_BYTES = 900;
export const BUFFER_HEADER_BYTES = 37;
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const U64_MAX = (1n << 64n) - 1n;
const ACCOUNT_MAX_BYTES = 10 * 1024 * 1024;

export interface BufferIntent {
  version: 1;
  id: string;
  network: 'devnet' | 'localnet';
  endpoint: string;
  expectedGenesis: string;
  bufferAddress: string;
  authorityAddress: string;
  imageSha256: string;
  imageLength: number;
  chunkSize: 900;
}
/** The adapter returns the JSON-RPC RESULT, rejects HTTP/RPC errors, and honors AbortSignal.
 * It must retain exact integers (bigint/decimal string, or number only when safe). */
export interface BufferRpc {
  endpoint: string;
  request<T>(method: string, params: readonly unknown[], signal: AbortSignal): Promise<T>;
}
export interface SignedBufferEvent {
  id: string;
  intentId: string;
  kind: 'create' | 'write';
  offset: number;
  length: number;
  imageSha256: string;
  signature: string;
  wireBase64: string;
  blockhash: string;
  lastValidBlockHeight: string;
  feeLamports: string;
  rentLamports: string;
}
export interface BufferObservation {
  eventId: string;
  signature: string;
  status: 'submitted' | 'unknown' | 'confirmed' | 'finalized' | 'effect-observed' | 'failed' | 'expired-unresolved';
  slot?: string;
}
export interface BufferJournalState {
  intent: BufferIntent;
  signed: SignedBufferEvent[];
  observations: BufferObservation[];
}
/** All methods are synchronous. initialize/appendSigned/recordObservation must durably fsync
 * before returning. The caller must hold one exclusive writer lock for the entire run.
 * An asynchronous method or a failed reload barrier prevents send. No secret belongs here. */
export interface BufferJournal {
  load(): BufferJournalState | null;
  initialize(intent: BufferIntent): void;
  appendSigned(event: SignedBufferEvent): void;
  recordObservation(observation: BufferObservation): void;
}
export interface BufferLimits {
  maxTotalFeeLamports: bigint;
  maxTransactionFeeLamports: bigint;
  maxRentLamports: bigint;
  paceMs?: number;
  rpcTimeoutMs?: number;
  pollIntervalMs?: number;
  maxPolls?: number;
  maxTransactions?: number;
  maxRunMs?: number;
}
export interface BufferStageResult {
  status: 'bufferReady' | 'stopped';
  reason?: string;
  bufferAddress: string;
  imageSha256: string;
  feesReservedLamports: string;
  rentReservedLamports: string;
  signedTransactions: number;
  completedChunks: number;
  observations: BufferObservation[];
  /** This is a finalized account read, NOT a claim that missing transaction history finalized. */
  finalizedBufferSlot?: string;
}
export interface BufferStageOptions {
  image: Uint8Array;
  intent: BufferIntent;
  authoritySigner: TransactionSigner;
  bufferSigner?: TransactionSigner;
  rpc: BufferRpc;
  journal: BufferJournal;
  limits: BufferLimits;
  signal?: AbortSignal;
  onProgress?: (progress: {kind: 'signed' | 'observed' | 'skipped'; offset: number; signature?: string}) => void;
}

function fail(code: string): never { throw new Error(code); }
function ensure(value: unknown, code: string): asserts value { if (!value) fail(code); }
export function bufferImageHash(image: Uint8Array): string { return createHash('sha256').update(image).digest('hex'); }
export function exactBufferU64(value: unknown, label: string): bigint {
  ensure(typeof value === 'bigint' || typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)
    || typeof value === 'number' && Number.isSafeInteger(value), `INVALID_${label}`);
  const result = BigInt(value as bigint | string | number);
  ensure(result >= 0n && result <= U64_MAX, `INVALID_${label}`);
  return result;
}
function integer(value: number, min: number, max: number, label: string): number {
  ensure(Number.isSafeInteger(value) && value >= min && value <= max, `INVALID_${label}`);
  return value;
}
function same(a: ReadonlyUint8Array, b: ReadonlyUint8Array): boolean { return Buffer.from(a).equals(Buffer.from(b)); }
function canonicalBase64(value: unknown): Buffer {
  ensure(typeof value === 'string' && value.length > 0 && value.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value), 'INVALID_BASE64');
  const bytes = Buffer.from(value, 'base64');
  ensure(bytes.toString('base64') === value, 'INVALID_BASE64');
  return bytes;
}
export function validateBufferEndpoint(intent: BufferIntent, rpcEndpoint = intent.endpoint): void {
  const endpoint = new URL(intent.endpoint), transport = new URL(rpcEndpoint);
  ensure(endpoint.href === transport.href, 'RPC_ENDPOINT_MISMATCH');
  ensure(!endpoint.username && !endpoint.password && !endpoint.hash && !endpoint.search, 'INVALID_ENDPOINT');
  if (intent.network === 'devnet') {
    ensure(endpoint.protocol === 'https:' && endpoint.hostname === 'api.devnet.solana.com'
      && (!endpoint.port || endpoint.port === '443') && endpoint.pathname === '/', 'DEVNET_ENDPOINT_REQUIRED');
    ensure(intent.expectedGenesis === DEVNET_GENESIS, 'DEVNET_GENESIS_REQUIRED');
  } else {
    ensure(intent.network === 'localnet' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      && ['http:', 'https:'].includes(endpoint.protocol) && endpoint.pathname === '/', 'LOOPBACK_LOCALNET_REQUIRED');
    address(intent.expectedGenesis);
  }
}
/** Bincode UpgradeableLoaderInstruction::Write { u32 offset, Vec<u8> }.
 * Pinned Agave 3.1.10 uses the loader-v3 interface and the 1232-byte packet bound. */
export function bufferWriteInstruction(buffer: string, authority: TransactionSigner, offset: number, bytes: Uint8Array): Instruction {
  integer(offset, 0, 0xffffffff, 'OFFSET');
  integer(bytes.length, 1, BUFFER_CHUNK_BYTES, 'CHUNK_LENGTH');
  ensure(offset + bytes.length <= ACCOUNT_MAX_BYTES - BUFFER_HEADER_BYTES, 'WRITE_BOUNDS');
  const data = Buffer.alloc(16 + bytes.length);
  data.writeUInt32LE(1, 0); data.writeUInt32LE(offset, 4); data.writeBigUInt64LE(BigInt(bytes.length), 8);
  data.set(bytes, 16);
  const accounts = [
    {address: address(buffer), role: AccountRole.WRITABLE},
    {address: authority.address, role: AccountRole.READONLY_SIGNER, signer: authority},
  ];
  return {programAddress: BUFFER_LOADER, accounts, data};
}
export function validateBufferAccount(account: unknown, intent: BufferIntent): Uint8Array {
  const value = account as {owner?: unknown; executable?: unknown; data?: unknown};
  ensure(value && value.owner === BUFFER_LOADER && value.executable === false, 'INVALID_BUFFER_OWNER_OR_EXECUTABLE');
  ensure(Array.isArray(value.data) && value.data.length === 2 && value.data[1] === 'base64', 'INVALID_BUFFER_ENCODING');
  const data = canonicalBase64(value.data[0]);
  ensure(data.length === BUFFER_HEADER_BYTES + intent.imageLength, 'INVALID_BUFFER_SIZE');
  ensure(data.readUInt32LE(0) === 1 && data[4] === 1, 'INVALID_BUFFER_DISCRIMINATOR');
  ensure(getAddressDecoder().decode(data.subarray(5, 37)) === intent.authorityAddress, 'INVALID_BUFFER_AUTHORITY');
  return data.subarray(BUFFER_HEADER_BYTES);
}
function instructions(intent: BufferIntent, image: Uint8Array, kind: SignedBufferEvent['kind'], offset: number,
  authority: TransactionSigner, buffer: TransactionSigner, rent: bigint): Instruction[] {
  const loader: Instruction[] = kind === 'write'
    ? [bufferWriteInstruction(intent.bufferAddress, authority, offset, image.subarray(offset, offset + BUFFER_CHUNK_BYTES))]
    : [getCreateAccountInstruction({payer: authority, newAccount: buffer, lamports: rent,
      space: BigInt(BUFFER_HEADER_BYTES + image.length), programAddress: BUFFER_LOADER}),
    {programAddress: BUFFER_LOADER, accounts: [
      {address: address(intent.bufferAddress), role: AccountRole.WRITABLE},
      {address: authority.address, role: AccountRole.READONLY},
    ], data: new Uint8Array(4)}];
  // Intentional v0 for pinned Agave 3.1.10 and the reviewed 900B/1232B transport contract.
  // A deliberate 50k CU ceiling bounds fees/resources; each exact message is simulated before signing.
  return [getSetComputeUnitLimitInstruction({units: 50_000}), getSetComputeUnitPriceInstruction({microLamports: 0n}), ...loader];
}
function message(intent: BufferIntent, image: Uint8Array, kind: SignedBufferEvent['kind'], offset: number,
  authority: TransactionSigner, buffer: TransactionSigner, rent: bigint, hash: string, height: bigint) {
  return appendTransactionMessageInstructions(instructions(intent, image, kind, offset, authority, buffer, rent),
    setTransactionMessageLifetimeUsingBlockhash({blockhash: blockhash(hash), lastValidBlockHeight: height},
      setTransactionMessageFeePayerSigner(authority, createTransactionMessage({version: 0}))));
}
function synchronous<T>(value: T): T { ensure(!(value && typeof (value as {then?: unknown}).then === 'function'), 'ASYNC_JOURNAL_FORBIDDEN'); return value; }
function errorCode(error: unknown): string {
  const candidate = error as {message?: string; status?: number; statusCode?: number};
  if (candidate?.status === 429 || candidate?.statusCode === 429 || /\b429\b/.test(candidate?.message ?? '')) return 'RPC_RATE_LIMITED';
  if (candidate?.status === 403 || candidate?.statusCode === 403 || /\b403\b/.test(candidate?.message ?? '')) return 'RPC_FORBIDDEN';
  return /^[A-Z][A-Z0-9_]+$/.test(candidate?.message ?? '') ? candidate.message! : 'STAGE_FAILED_RETAIN_JOURNAL';
}
function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('ABORTED')); };
    const timer = setTimeout(done, ms); signal.addEventListener('abort', abort, {once: true});
  });
}

export async function runBufferStage(options: BufferStageOptions): Promise<BufferStageResult> {
  const {intent, rpc, journal, limits, authoritySigner, bufferSigner} = options;
  // Copy caller-owned bytes before any await; the reviewed hash cannot change during signing.
  const image = Uint8Array.from(options.image);
  let state: BufferJournalState = {intent, signed: [], observations: []};
  let fees = 0n, rentReserved = 0n, completedChunks = 0, contextSlot = 0n;
  const result = (status: BufferStageResult['status'], reason?: string): BufferStageResult => ({status, ...(reason ? {reason} : {}),
    bufferAddress: intent.bufferAddress, imageSha256: intent.imageSha256, feesReservedLamports: fees.toString(),
    rentReservedLamports: rentReserved.toString(), signedTransactions: state.signed.length, completedChunks,
    observations: [...state.observations], ...(status === 'bufferReady' ? {finalizedBufferSlot: contextSlot.toString()} : {})});
  try {
    ensure(intent.version === 1 && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(intent.id), 'INVALID_INTENT');
    validateBufferEndpoint(intent, rpc.endpoint);
    address(intent.bufferAddress); address(intent.authorityAddress);
    ensure(intent.bufferAddress !== intent.authorityAddress, 'BUFFER_AUTHORITY_MUST_DIFFER');
    ensure(intent.authorityAddress === authoritySigner.address, 'AUTHORITY_SIGNER_MISMATCH');
    if (bufferSigner) ensure(bufferSigner.address === intent.bufferAddress, 'BUFFER_SIGNER_MISMATCH');
    integer(intent.imageLength, 1, ACCOUNT_MAX_BYTES - BUFFER_HEADER_BYTES, 'IMAGE_LENGTH');
    ensure(intent.chunkSize === BUFFER_CHUNK_BYTES && image.length === intent.imageLength
      && /^[a-f0-9]{64}$/.test(intent.imageSha256) && bufferImageHash(image) === intent.imageSha256, 'IMAGE_IDENTITY_MISMATCH');
    for (const key of ['maxTotalFeeLamports', 'maxTransactionFeeLamports', 'maxRentLamports'] as const)
      ensure(typeof limits[key] === 'bigint' && exactBufferU64(limits[key], key) === limits[key], 'EXPLICIT_BIGINT_BUDGET_REQUIRED');
    const pace = integer(limits.paceMs ?? 2000, intent.network === 'devnet' ? 2000 : 0, 60_000, 'PACE');
    const pollInterval = integer(limits.pollIntervalMs ?? 2000, intent.network === 'devnet' ? 1000 : 0, 60_000, 'POLL_INTERVAL');
    const timeout = integer(limits.rpcTimeoutMs ?? 15_000, 1, 60_000, 'RPC_TIMEOUT');
    const maxPolls = integer(limits.maxPolls ?? 12, 1, 120, 'MAX_POLLS');
    const maxTransactions = integer(limits.maxTransactions ?? Math.ceil(image.length / BUFFER_CHUNK_BYTES) + 1, 1, 20_000, 'MAX_TRANSACTIONS');
    const runSignal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(integer(limits.maxRunMs ?? 1_800_000, 1, 86_400_000, 'MAX_RUN_MS'))]);
    const request = async <T>(method: string, params: readonly unknown[] = []): Promise<T> => {
      runSignal.throwIfAborted();
      const signal = AbortSignal.any([runSignal, AbortSignal.timeout(timeout)]);
      // Race enforces the bound even if an injected adapter incorrectly ignores abort.
      let abort: (() => void) | undefined;
      try {
        return await Promise.race([rpc.request<T>(method, params, signal), new Promise<never>((_, reject) => {
          abort = () => reject(new Error(runSignal.aborted ? 'ABORTED' : 'RPC_TIMEOUT'));
          signal.addEventListener('abort', abort, {once: true});
        })]);
      } finally { if (abort) signal.removeEventListener('abort', abort); }
    };
    const load = (): BufferJournalState | null => synchronous(journal.load());
    const initial = load();
    if (initial) {
      ensure(JSON.stringify(initial.intent) === JSON.stringify(intent), 'JOURNAL_INTENT_MISMATCH');
      state = structuredClone(initial);
    } else {
      synchronous(journal.initialize(structuredClone(intent)));
      const initialized = load();
      ensure(initialized && JSON.stringify(initialized.intent) === JSON.stringify(intent)
        && initialized.signed.length === 0 && initialized.observations.length === 0, 'JOURNAL_INITIALIZATION_BARRIER');
      state = structuredClone(initialized);
    }
    ensure(Array.isArray(state.signed) && state.signed.length <= Math.ceil(image.length / BUFFER_CHUNK_BYTES) + 1
      && Array.isArray(state.observations), 'INVALID_JOURNAL');
    const ids = new Set<string>(), signatures = new Set<string>();
    for (const event of state.signed) {
      runSignal.throwIfAborted();
      ensure(event.intentId === intent.id && event.imageSha256 === intent.imageSha256, 'JOURNAL_EVENT_IDENTITY_MISMATCH');
      ensure(event.kind === 'create' || event.kind === 'write', 'INVALID_EVENT_KIND');
      ensure(!ids.has(event.id) && !signatures.has(event.signature), 'DUPLICATE_JOURNAL_EVENT');
      ids.add(event.id); signatures.add(event.signature);
      ensure(event.id === (event.kind === 'create' ? 'create' : `write:${event.offset}`), 'INVALID_EVENT_ID');
      integer(event.offset, 0, image.length - 1, 'EVENT_OFFSET');
      ensure(event.kind === 'create' ? event.offset === 0 && event.length === 0
        : event.offset % BUFFER_CHUNK_BYTES === 0 && event.length === Math.min(BUFFER_CHUNK_BYTES, image.length - event.offset), 'INVALID_EVENT_RANGE');
      const eventFee = exactBufferU64(event.feeLamports, 'EVENT_FEE'), eventRent = exactBufferU64(event.rentLamports, 'EVENT_RENT');
      ensure(eventFee <= limits.maxTransactionFeeLamports && (event.kind === 'create' || eventRent === 0n), 'EVENT_BUDGET_MISMATCH');
      fees += eventFee; rentReserved += eventRent;
      const wire = canonicalBase64(event.wireBase64); ensure(wire.length <= 1232, 'WIRE_TOO_LARGE');
      const tx = getTransactionDecoder().decode(wire);
      const rebuilt = compileTransaction(message(intent, image, event.kind, event.offset,
        createNoopSigner(address(intent.authorityAddress)), createNoopSigner(address(intent.bufferAddress)), eventRent,
        event.blockhash, exactBufferU64(event.lastValidBlockHeight, 'EVENT_HEIGHT')));
      ensure(same(tx.messageBytes, rebuilt.messageBytes), 'JOURNAL_WIRE_INTENT_MISMATCH');
      ensure(String(getSignatureFromTransaction(tx)) === event.signature, 'JOURNAL_SIGNATURE_MISMATCH');
      for (const [signer, signature] of Object.entries(tx.signatures))
        ensure(signature && await verifySignature(await getPublicKeyFromAddress(address(signer)), signature, tx.messageBytes), 'INVALID_RETAINED_SIGNATURE');
    }
    ensure(fees <= limits.maxTotalFeeLamports && rentReserved <= limits.maxRentLamports, 'CUMULATIVE_BUDGET_EXCEEDED');
    for (const observation of state.observations) ensure(ids.has(observation.eventId)
      && state.signed.find(event => event.id === observation.eventId)!.signature === observation.signature, 'INVALID_OBSERVATION_IDENTITY');
    const observe = (event: SignedBufferEvent, status: BufferObservation['status'], slot?: bigint) => {
      const observation: BufferObservation = {eventId: event.id, signature: event.signature, status, ...(slot === undefined ? {} : {slot: slot.toString()})};
      synchronous(journal.recordObservation(observation)); state.observations.push(observation);
      options.onProgress?.({kind: 'observed', offset: event.offset, signature: event.signature});
    };
    ensure(await request<string>('getGenesisHash') === intent.expectedGenesis, 'GENESIS_MISMATCH');
    const snapshot = async (): Promise<Uint8Array | null> => {
      const response = await request<{context: {slot: unknown}; value: unknown}>('getAccountInfo', [intent.bufferAddress,
        {encoding: 'base64', commitment: 'finalized', ...(contextSlot ? {minContextSlot: Number(contextSlot)} : {})}]);
      const slot = exactBufferU64(response?.context?.slot, 'CONTEXT_SLOT');
      ensure(slot >= contextSlot && slot <= BigInt(Number.MAX_SAFE_INTEGER), 'STALE_OR_UNSAFE_ACCOUNT_CONTEXT');
      contextSlot = slot;
      return response.value === null ? null : validateBufferAccount(response.value, intent);
    };
    let payload = await snapshot();
    const effect = (event: SignedBufferEvent): boolean => payload !== null && (event.kind === 'create'
      || same(payload.subarray(event.offset, event.offset + event.length), image.subarray(event.offset, event.offset + event.length)));
    const recover = async (event: SignedBufferEvent, polls: number): Promise<boolean> => {
      for (let index = 0; index < polls; index++) {
        const statuses = await request<{value: ({err: unknown; confirmationStatus: string; slot: unknown} | null)[]}>('getSignatureStatuses', [[event.signature], {searchTransactionHistory: true}]);
        ensure(Array.isArray(statuses?.value) && statuses.value.length === 1, 'INVALID_SIGNATURE_STATUS');
        const status = statuses.value[0];
        let signatureSlot: bigint | undefined;
        if (status) {
          ensure(Object.hasOwn(status, 'err') && ['processed', 'confirmed', 'finalized'].includes(status.confirmationStatus), 'INVALID_SIGNATURE_STATUS');
          if (status.err !== null) { observe(event, 'failed'); fail('RETAINED_TRANSACTION_FAILED'); }
          signatureSlot = exactBufferU64(status.slot, 'STATUS_SLOT');
          if (status.confirmationStatus === 'finalized' && signatureSlot > contextSlot) contextSlot = signatureSlot;
        }
        payload = await snapshot();
        if (effect(event)) {
          // Only a status explicitly reporting finalized establishes transaction finality.
          observe(event, status?.confirmationStatus === 'finalized' ? 'finalized' : 'effect-observed',
            status?.confirmationStatus === 'finalized' ? signatureSlot : contextSlot);
          return true;
        }
        if (status?.confirmationStatus === 'finalized') fail('FINALIZED_EFFECT_MISMATCH');
        if (status?.confirmationStatus === 'confirmed') observe(event, 'confirmed', exactBufferU64(status.slot, 'STATUS_SLOT'));
        const height = exactBufferU64(await request('getBlockHeight', [{commitment: 'finalized'}]), 'BLOCK_HEIGHT');
        if (height > BigInt(event.lastValidBlockHeight)) { observe(event, 'expired-unresolved'); return false; }
        if (index + 1 < polls) await delay(pollInterval, runSignal);
      }
      observe(event, 'unknown'); return false;
    };
    // Resolve every retained uncertain signature before considering any new signature.
    for (const event of state.signed) {
      const last = state.observations.filter(observation => observation.eventId === event.id).at(-1);
      ensure(last?.status !== 'failed', 'RETAINED_TRANSACTION_FAILED');
      if (last?.status === 'finalized' || last?.status === 'effect-observed') {
        ensure(effect(event), 'RETAINED_EFFECT_MISMATCH');
      } else if (!await recover(event, 1)) return result('stopped', 'RETAINED_SIGNATURE_UNRESOLVED');
    }
    let sent = 0, lastStart = 0;
    const submit = async (kind: SignedBufferEvent['kind'], offset: number, rent: bigint): Promise<boolean> => {
      ensure(sent < maxTransactions, 'TRANSACTION_RUN_LIMIT');
      await delay(Math.max(0, pace - (Date.now() - lastStart)), runSignal);
      const latest = await request<{value: {blockhash: string; lastValidBlockHeight: unknown}}>('getLatestBlockhash', [{commitment: 'finalized'}]);
      const height = exactBufferU64(latest?.value?.lastValidBlockHeight, 'LAST_VALID_HEIGHT');
      const draft = message(intent, image, kind, offset, authoritySigner,
        bufferSigner ?? createNoopSigner(address(intent.bufferAddress)), rent, latest.value.blockhash, height);
      const unsigned = compileTransaction(draft), unsignedWire = getTransactionEncoder().encode(unsigned);
      ensure(unsignedWire.length <= 1232, 'WIRE_TOO_LARGE');
      const simulation = await request<{value: {err: unknown; unitsConsumed: unknown}}>('simulateTransaction', [Buffer.from(unsignedWire).toString('base64'),
        {encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false, commitment: 'finalized'}]);
      ensure(simulation?.value?.err === null && exactBufferU64(simulation.value.unitsConsumed, 'SIMULATION_UNITS') <= 50_000n, 'SIMULATION_FAILED');
      const quote = await request<{value: unknown}>('getFeeForMessage', [Buffer.from(unsigned.messageBytes).toString('base64'), {commitment: 'finalized'}]);
      const fee = exactBufferU64(quote?.value, 'LIVE_FEE');
      ensure(fee <= limits.maxTransactionFeeLamports && fees + fee <= limits.maxTotalFeeLamports
        && rentReserved + rent <= limits.maxRentLamports, 'BUDGET_EXCEEDED');
      const balance = await request<{value: unknown}>('getBalance', [intent.authorityAddress, {commitment: 'finalized'}]);
      ensure(exactBufferU64(balance?.value, 'PAYER_BALANCE') >= fee + rent, 'INSUFFICIENT_PAYER_BALANCE');
      runSignal.throwIfAborted();
      const signed = await signTransactionMessageWithSigners(draft, {abortSignal: runSignal});
      ensure(same(signed.messageBytes, unsigned.messageBytes), 'SIGNER_CHANGED_MESSAGE');
      const wire = getTransactionEncoder().encode(signed); ensure(wire.length <= 1232, 'WIRE_TOO_LARGE');
      for (const [signer, signature] of Object.entries(signed.signatures))
        ensure(signature && await verifySignature(await getPublicKeyFromAddress(address(signer)), signature, signed.messageBytes), 'INVALID_NEW_SIGNATURE');
      const event: SignedBufferEvent = {id: kind === 'create' ? 'create' : `write:${offset}`, intentId: intent.id, kind, offset,
        length: kind === 'create' ? 0 : Math.min(BUFFER_CHUNK_BYTES, image.length - offset), imageSha256: intent.imageSha256,
        signature: String(getSignatureFromTransaction(signed)), wireBase64: Buffer.from(wire).toString('base64'),
        blockhash: latest.value.blockhash, lastValidBlockHeight: height.toString(), feeLamports: fee.toString(), rentLamports: rent.toString()};
      ensure(!state.signed.some(item => item.id === event.id), 'REPLACEMENT_SIGNATURE_FORBIDDEN');
      // Durable signed-wire barrier precedes the very first send, even if that send never returns.
      synchronous(journal.appendSigned(structuredClone(event)));
      const durable = load();
      ensure(durable && JSON.stringify(durable.intent) === JSON.stringify(intent)
        && JSON.stringify(durable.signed) === JSON.stringify([...state.signed, event]), 'JOURNAL_SIGNED_BARRIER');
      state.signed.push(event); fees += fee; rentReserved += rent; sent++;
      options.onProgress?.({kind: 'signed', offset, signature: event.signature});
      try {
        lastStart = Date.now();
        ensure(await request<string>('sendTransaction', [event.wireBase64,
          {encoding: 'base64', skipPreflight: false, preflightCommitment: 'finalized', maxRetries: 0}]) === event.signature, 'SEND_SIGNATURE_MISMATCH');
        observe(event, 'submitted');
      } catch (error) { observe(event, 'unknown'); fail(errorCode(error) === 'RPC_RATE_LIMITED' ? 'RPC_RATE_LIMITED' : errorCode(error) === 'RPC_FORBIDDEN' ? 'RPC_FORBIDDEN' : 'SEND_OUTCOME_UNKNOWN'); }
      return await recover(event, maxPolls);
    };
    if (!payload) {
      ensure(!state.signed.length, 'BUFFER_MISSING_WITH_RETAINED_SIGNATURE');
      ensure(bufferSigner, 'EXPLICIT_NEW_BUFFER_SIGNER_REQUIRED');
      const rent = exactBufferU64(await request('getMinimumBalanceForRentExemption', [BUFFER_HEADER_BYTES + image.length, {commitment: 'finalized'}]), 'LIVE_RENT');
      ensure(rent <= limits.maxRentLamports, 'RENT_BUDGET_EXCEEDED');
      if (!await submit('create', 0, rent)) return result('stopped', 'CREATE_SIGNATURE_UNRESOLVED');
    }
    for (let offset = 0; offset < image.length; offset += BUFFER_CHUNK_BYTES) {
      const length = Math.min(BUFFER_CHUNK_BYTES, image.length - offset);
      if (payload && same(payload.subarray(offset, offset + length), image.subarray(offset, offset + length))) {
        completedChunks++; options.onProgress?.({kind: 'skipped', offset}); continue;
      }
      ensure(!state.signed.some(event => event.id === `write:${offset}`), 'REPLACEMENT_SIGNATURE_FORBIDDEN');
      if (!await submit('write', offset, 0n)) return result('stopped', 'WRITE_SIGNATURE_UNRESOLVED');
      completedChunks++;
    }
    payload = await snapshot();
    ensure(payload && same(payload, image) && bufferImageHash(payload) === intent.imageSha256, 'FINAL_BUFFER_HASH_MISMATCH');
    return result('bufferReady');
  } catch (error) { return result('stopped', errorCode(error)); }
}
