import {createHash} from 'node:crypto';
import {address, getAddressEncoder, getBase58Encoder, getBase58Decoder, getCompiledTransactionMessageDecoder, getCompiledTransactionMessageEncoder,
  getSignatureFromTransaction, getTransactionDecoder, getTransactionEncoder} from '@solana/kit';
import {rpc} from './rpc.ts';

const MAX_U64 = (1n << 64n) - 1n, MAX_ACCOUNTS = 256, MAX_PROOF_BYTES = 65_536, MAX_WIRE_BYTES = 4096;
export interface TransactionProofRequest {signature: string; slot: number; genesisHash: string; expectedWireBase64?: string; commitment?:'confirmed'|'finalized';}
export interface ProofTokenBalance {
  accountIndex: number; account: string; mint: string; owner: string | null; programId: string | null; amount: string; decimals: number;
}
interface TransactionProofFields {
  signature: string; genesisHash: string; slot: number; blockTime: number | null; capturedAt: string; version: 'legacy' | 0;
  genesisScope: 'caller-confirmed-context-not-returned-by-getTransaction';
  transactionSha256: string; messageSha256: string; wireBytes: number; expectedWireMatched: boolean | null;
  feeLamports: string; computeUnitsConsumed: string | null; accountKeys: string[];
  preBalances: string[]; postBalances: string[]; preTokenBalances: ProofTokenBalance[]; postTokenBalances: ProofTokenBalance[];
  independentAttestation: false;
}
/** V1 archives remain readable and only establish their original confirmed query. */
export interface LegacyTransactionProof extends TransactionProofFields {
  schemaVersion:1;source:'retained-confirmed-rpc-transaction';commitment:'confirmed';
}
export interface CurrentTransactionProof extends TransactionProofFields {
  schemaVersion:2;source:'retained-confirmed-rpc-transaction'|'retained-finalized-rpc-transaction';commitment:'confirmed'|'finalized';
  provenance:{source:'live-rpc';method:'getTransaction';requestedCommitment:'confirmed'|'finalized';observedAt:string};
}
export type TransactionProof=LegacyTransactionProof|CurrentTransactionProof;
export type TransactionProofResult = {status: 'captured'; proof: TransactionProof} | {status: 'unavailable'; code: string; message: string; attemptedAt: string};
export type ProofReadRpc = (method: string, params: unknown[]) => Promise<unknown>;
class ProofGap extends Error { constructor(readonly code: string, message: string) { super(message); } }
function fail(code: string, message: string): never { throw new ProofGap(code, message); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function key(value: unknown): string {
  if (typeof value !== 'string') fail('INVALID_ADDRESS', 'An execution-proof public address is missing or invalid.');
  try { return String(address(value)); } catch { return fail('INVALID_ADDRESS', 'An execution-proof public address is missing or invalid.'); }
}
function nonnegative(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('INVALID_EXECUTION_METADATA', `${name} must be an exact nonnegative safe integer.`);
  return value;
}
function base64(value: unknown): Buffer {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(MAX_WIRE_BYTES / 3) * 4) fail('INVALID_WIRE', 'The execution-proof transaction bytes are missing or outside their size bound.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_WIRE_BYTES || bytes.toString('base64') !== value) fail('INVALID_WIRE', 'The execution-proof transaction must use canonical bounded base64.');
  return bytes;
}
function signature(value: unknown): string {
  if (typeof value !== 'string' || value.length < 64 || value.length > 88) fail('INVALID_PROOF_REQUEST', 'A canonical transaction signature is required.');
  try {
    const bytes = getBase58Encoder().encode(value);
    if (bytes.length !== 64 || !bytes.some(b => b !== 0) || getBase58Decoder().decode(bytes) !== value) throw new Error('Invalid signature');
    return value;
  } catch { return fail('INVALID_PROOF_REQUEST', 'A canonical transaction signature is required.'); }
}
function balances(value: unknown, count: number, name: string): string[] {
  if (!Array.isArray(value) || value.length !== count || value.length > MAX_ACCOUNTS) fail('INVALID_BALANCES', `${name} must contain one exact balance per decoded account.`);
  return value.map(item => BigInt(nonnegative(item, name)).toString());
}
function tokenBalances(value: unknown, keys: string[], name: string): ProofTokenBalance[] {
  if (!Array.isArray(value) || value.length > keys.length || value.length > MAX_ACCOUNTS) fail('TOKEN_BALANCES_UNAVAILABLE', `${name} is absent or exceeds the decoded account bounds.`);
  const indices = new Set<number>();
  return value.map(item => {
    if (!object(item) || !object(item.uiTokenAmount)) fail('INVALID_TOKEN_BALANCES', `${name} has malformed token balance entries.`);
    const index = nonnegative(item.accountIndex, 'Token account index');
    if (index >= keys.length || indices.has(index)) fail('INVALID_TOKEN_BALANCES', `${name} has duplicated or out-of-range token account indexes.`);
    indices.add(index);
    const raw = item.uiTokenAmount.amount, decimals = nonnegative(item.uiTokenAmount.decimals, 'Token decimals');
    if (typeof raw !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(raw) || BigInt(raw) > MAX_U64 || decimals > 255) fail('INVALID_TOKEN_BALANCES', `${name} must use canonical u64 token amounts and valid decimals.`);
    return {accountIndex: index, account: keys[index], mint: key(item.mint), owner: item.owner === undefined ? null : key(item.owner),
      programId: item.programId === undefined ? null : key(item.programId), amount: raw, decimals};
  }).sort((a, b) => a.accountIndex - b.accountIndex);
}

/** The retained commitment reflects the actual RPC query, never a caller's label. */
export async function captureTransactionProof(input: TransactionProofRequest, readRpc: ProofReadRpc = rpc): Promise<TransactionProofResult> {
  const attemptedAt = new Date().toISOString();
  try {
    if (!object(input)) fail('INVALID_PROOF_REQUEST', 'The confirmed signature, slot and caller-bound genesis are required.');
    const requestedSignature = signature(input.signature), requestedSlot = nonnegative(input.slot, 'Confirmed slot'), genesisHash = key(input.genesisHash);
    const commitment=input.commitment??'confirmed';
    if(commitment!=='confirmed'&&commitment!=='finalized')fail('INVALID_PROOF_REQUEST','Execution proof requires a confirmed or finalized RPC commitment.');
    const expected = input.expectedWireBase64 === undefined ? null : base64(input.expectedWireBase64);
    const result = await readRpc('getTransaction', [requestedSignature, {encoding: 'base64', commitment, maxSupportedTransactionVersion: 1}]);
    if (result === null) fail('TRANSACTION_HISTORY_UNAVAILABLE', `The RPC does not return this transaction at ${commitment} commitment; no execution proof was captured.`);
    if (!object(result) || !object(result.meta) || nonnegative(result.slot, 'Transaction slot') !== requestedSlot) fail('TRANSACTION_CONTEXT_MISMATCH', 'The transaction response does not match the observed confirmed slot.');
    if (!Object.hasOwn(result.meta, 'err')) fail('INVALID_EXECUTION_METADATA', 'The transaction execution outcome is missing.');
    if (result.meta.err !== null) fail('TRANSACTION_NOT_SUCCESSFUL', 'The transaction response does not contain a successful execution outcome.');
    if (!Array.isArray(result.transaction) || result.transaction.length !== 2 || result.transaction[1] !== 'base64') fail('INVALID_WIRE', 'The RPC transaction encoding does not match the base64 request.');
    const wire = base64(result.transaction[0]);
    if (expected && !wire.equals(expected)) fail('TRANSACTION_WIRE_MISMATCH', 'The returned bytes differ from the exact retained signed message.');
    const decoded = getTransactionDecoder().decode(wire);
    if (!Buffer.from(getTransactionEncoder().encode(decoded)).equals(wire)) fail('INVALID_WIRE', 'The returned transaction contains noncanonical or trailing bytes.');
    if (String(getSignatureFromTransaction(decoded)) !== requestedSignature) fail('TRANSACTION_SIGNATURE_MISMATCH', 'The returned first signature differs from the requested receipt.');
    const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
    if (!Buffer.from(getCompiledTransactionMessageEncoder().encode(message)).equals(Buffer.from(decoded.messageBytes))) fail('INVALID_WIRE', 'The decoded message is not canonical.');
    if (message.version !== 'legacy' && message.version !== 0) fail('UNSUPPORTED_TRANSACTION_VERSION', 'This proof decoder supports legacy and version0 transactions only; execution status is unchanged.');
    if (result.version !== message.version) fail('TRANSACTION_VERSION_MISMATCH', 'RPC and decoded transaction versions disagree.');
    if (message.version === 0 && (message.addressTableLookups?.length ?? 0) > 0) fail('UNSUPPORTED_ADDRESS_LOOKUPS', 'Historical address lookup resolution is outside this proof decoder; execution status is unchanged.');
    if (wire.length > 1232) fail('INVALID_WIRE', 'Legacy/version0 wire exceeds its supported size bound.');
    if (result.meta.loadedAddresses !== undefined) {
      const loaded = result.meta.loadedAddresses;
      if (!object(loaded) || !Array.isArray(loaded.writable) || !Array.isArray(loaded.readonly) || loaded.writable.length || loaded.readonly.length) fail('INVALID_LOADED_ADDRESSES', 'A transaction without lookup tables cannot claim loaded addresses.');
    }
    const accountKeys = message.staticAccounts.map(key), count = accountKeys.length, header = message.header;
    if (!count || count > MAX_ACCOUNTS || new Set(accountKeys).size !== count || header.numSignerAccounts < 1 || header.numSignerAccounts > count
      || header.numReadonlySignerAccounts >= header.numSignerAccounts || header.numReadonlyNonSignerAccounts > count - header.numSignerAccounts) fail('INVALID_MESSAGE_ACCOUNTS', 'The decoded account list or signer header is inconsistent.');
    for (const ix of message.instructions) {
      if (!Number.isInteger(ix.programAddressIndex) || ix.programAddressIndex < header.numSignerAccounts || ix.programAddressIndex >= count
        || (ix.accountIndices ?? []).some(index => !Number.isInteger(index) || index < 0 || index >= count)) fail('INVALID_INSTRUCTION_INDEX', 'A compiled instruction refers outside its decoded accounts.');
    }
    const signers = Object.entries(decoded.signatures);
    if (signers.length !== header.numSignerAccounts || signers.some(([signer], index) => signer !== accountKeys[index])) fail('INVALID_MESSAGE_ACCOUNTS', 'Required signatures do not match the decoded signer accounts.');
    for (const [signer, bytes] of signers) {
      if (!bytes || bytes.length !== 64) fail('INVALID_TRANSACTION_SIGNATURE', 'A required transaction signature is missing.');
      const publicKey = await crypto.subtle.importKey('raw', new Uint8Array(getAddressEncoder().encode(address(signer))), {name: 'Ed25519'}, false, ['verify']);
      if (!await crypto.subtle.verify('Ed25519', publicKey, new Uint8Array(bytes), new Uint8Array(decoded.messageBytes))) fail('INVALID_TRANSACTION_SIGNATURE', 'A returned transaction signature does not verify against its exact message.');
    }
    const preBalances = balances(result.meta.preBalances, count, 'preBalances'), postBalances = balances(result.meta.postBalances, count, 'postBalances');
    const fee = BigInt(nonnegative(result.meta.fee, 'Transaction fee'));
    const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);
    if (sum(preBalances) - sum(postBalances) !== fee || BigInt(preBalances[0]) < fee) fail('INCONSISTENT_LAMPORT_BALANCES', 'Pre/post lamport balances do not reconcile with the exact transaction fee.');
    const preTokenBalances = tokenBalances(result.meta.preTokenBalances, accountKeys, 'preTokenBalances'), postTokenBalances = tokenBalances(result.meta.postTokenBalances, accountKeys, 'postTokenBalances');
    const decimalsByMint = new Map<string, number>(), preByIndex = new Map(preTokenBalances.map(item => [item.accountIndex, item]));
    for (const item of [...preTokenBalances, ...postTokenBalances]) {
      const previous = decimalsByMint.get(item.mint);
      if (previous !== undefined && previous !== item.decimals) fail('INCONSISTENT_TOKEN_BALANCES', 'Token decimals disagree for the same mint.');
      decimalsByMint.set(item.mint, item.decimals);
    }
    for (const item of postTokenBalances) {
      const prior = preByIndex.get(item.accountIndex);
      if (prior && (prior.mint !== item.mint || (prior.programId !== null && item.programId !== null && prior.programId !== item.programId))) fail('INCONSISTENT_TOKEN_BALANCES', 'A token account changes mint/program identity within this unsupported proof scope.');
    }
    let blockTime: number | null = null;
    if (result.blockTime !== null && result.blockTime !== undefined) {
      if (typeof result.blockTime !== 'number' || !Number.isSafeInteger(result.blockTime)) fail('INVALID_EXECUTION_METADATA', 'Block time is not an exact integer or unknown.');
      blockTime = result.blockTime;
    }
    const computeUnitsConsumed = result.meta.computeUnitsConsumed == null ? null : String(nonnegative(result.meta.computeUnitsConsumed, 'Compute units'));
    const capturedAt=new Date().toISOString();
    const proof: CurrentTransactionProof = {schemaVersion: 2, source: commitment==='finalized'?'retained-finalized-rpc-transaction':'retained-confirmed-rpc-transaction', signature: requestedSignature, genesisHash,
      slot: requestedSlot, blockTime, capturedAt, commitment, version: message.version,
      provenance:{source:'live-rpc',method:'getTransaction',requestedCommitment:commitment,observedAt:capturedAt},
      genesisScope: 'caller-confirmed-context-not-returned-by-getTransaction', transactionSha256: createHash('sha256').update(wire).digest('hex'),
      messageSha256: createHash('sha256').update(Buffer.from(decoded.messageBytes)).digest('hex'), wireBytes: wire.length, expectedWireMatched: expected ? true : null,
      feeLamports: fee.toString(), computeUnitsConsumed, accountKeys, preBalances, postBalances, preTokenBalances, postTokenBalances, independentAttestation: false};
    if (Buffer.byteLength(JSON.stringify(proof)) > MAX_PROOF_BYTES) fail('PROOF_TOO_LARGE', 'The normalized public proof exceeds its64KiB retention bound.');
    return {status: 'captured', proof};
  } catch (error) {
    return error instanceof ProofGap ? {status: 'unavailable', code: error.code, message: error.message, attemptedAt}
      : {status: 'unavailable', code: 'TRANSACTION_PROOF_UNAVAILABLE', message: 'The RPC response or wire decoder could not establish a valid execution proof; the existing confirmation is unchanged.', attemptedAt};
  }
}
