import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {address, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress} from '@solana/kit';
import {PROGRAM_ID} from '../packages/client/src/program.ts';
import {network, rpcUrl} from './config.ts';
import {AppError, rpc} from './rpc.ts';

export const UPGRADEABLE_LOADER = address('BPFLoaderUpgradeab1e11111111111111111111111');
const HEADER_BYTES = 45, PROGRAM_BYTES = 36, MAX_ACCOUNT_BYTES = 10 * 1024 * 1024;
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const releaseFile = new URL('../programs/bondtrace/release.json', import.meta.url);
type IdentityStatus = 'known-match' | 'mismatch' | 'unavailable';
export interface ProgramRelease {
  schemaVersion: 1;
  programId: string;
  loader: 'BPFLoaderUpgradeable';
  programLen: number;
  sha256: string;
  releaseId?: string;
}
export interface ProgramIdentity {
  status: IdentityStatus;
  signingAllowed: boolean;
  code: string;
  message: string;
  network: string;
  rpcUrl: string;
  programId: string;
  loaderAddress: string;
  genesisHash: string | null;
  contextSlot: number | null;
  observedAt: string;
  expected: ProgramRelease | null;
  observed: {
    programDataAddress: string;
    deploymentSlot: string;
    upgradeAuthority: string | null;
    immutable: boolean;
    programDataLength: number;
    payloadLength: number;
    sha256: string | null;
    paddingBytes: number | null;
    paddingZero: boolean | null;
  } | null;
  verification: {
    commitment: 'confirmed';
    scope: 'rpc-observed-deployed-bytecode';
    method: 'full-payload' | 'cached-payload-with-fresh-headers' | null;
    payloadContextSlot: number | null;
    headerContextSlot: number | null;
    sourceToBinaryAttested: false;
  };
}
export interface ProgramIdentityOptions {
  rpc: (method: string, params?: unknown[]) => Promise<unknown>;
  expected: unknown | (() => unknown | Promise<unknown>);
  programId?: string;
  network?: 'localnet' | 'devnet';
  rpcUrl?: string;
}
class IdentityFailure extends Error {
  constructor(readonly status: Exclude<IdentityStatus, 'known-match'>, readonly code: string, message: string) { super(message); }
}
function fail(status: Exclude<IdentityStatus, 'known-match'>, code: string, message: string): never { throw new IdentityFailure(status, code, message); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function publicKey(value: unknown): string {
  if (typeof value !== 'string') fail('unavailable', 'RPC_INVALID', 'RPC returned an invalid public address.');
  try { return String(address(value)); } catch { return fail('unavailable', 'RPC_INVALID', 'RPC returned an invalid public address.'); }
}
function release(value: unknown, programId: string): ProgramRelease {
  if (!record(value) || value.schemaVersion !== 1 || value.programId !== programId || value.loader !== 'BPFLoaderUpgradeable'
    || !Number.isSafeInteger(value.programLen) || (value.programLen as number) < 4 || (value.programLen as number) > MAX_ACCOUNT_BYTES - HEADER_BYTES
    || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)
    || (value.releaseId !== undefined && (typeof value.releaseId !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(value.releaseId)))) {
    fail('unavailable', 'RELEASE_DESCRIPTOR_INVALID', 'The expected program release descriptor is missing or invalid.');
  }
  return {schemaVersion: 1, programId, loader: 'BPFLoaderUpgradeable', programLen: value.programLen as number, sha256: value.sha256,
    ...(value.releaseId === undefined ? {} : {releaseId: value.releaseId as string})};
}
function readExpectedRelease(): unknown {
  try {
    const content = fs.readFileSync(releaseFile, 'utf8');
    if (Buffer.byteLength(content) > 16_384) throw new Error('Oversized release descriptor');
    return JSON.parse(content);
  } catch { return fail('unavailable', 'RELEASE_DESCRIPTOR_UNAVAILABLE', 'The expected program release descriptor cannot be read.'); }
}
interface DecodedAccount {bytes: Buffer; space: number;}
function account(value: unknown, kind: 'program' | 'programdata', full: boolean): DecodedAccount {
  if (value === null) fail('unavailable', 'PROGRAM_ACCOUNT_MISSING', 'The deployed program or its ProgramData account is absent.');
  if (!record(value) || typeof value.executable !== 'boolean' || !Number.isSafeInteger(value.space)
    || (value.space as number) < 0 || (value.space as number) > MAX_ACCOUNT_BYTES
    || !Number.isSafeInteger(value.lamports) || (value.lamports as number) <= 0) fail('unavailable', 'RPC_INVALID', 'RPC returned malformed program account metadata.');
  if (publicKey(value.owner) !== UPGRADEABLE_LOADER) fail('mismatch', 'PROGRAM_LOADER_MISMATCH', 'The deployed accounts are not owned by the expected upgradeable loader.');
  if (value.executable !== (kind === 'program')) fail('mismatch', 'PROGRAM_EXECUTABLE_MISMATCH', 'The deployed accounts have unexpected executable flags.');
  const data = value.data;
  if (!Array.isArray(data) || data.length !== 2 || data[1] !== 'base64' || typeof data[0] !== 'string'
    || data[0].length > Math.ceil(MAX_ACCOUNT_BYTES / 3) * 4) fail('unavailable', 'RPC_INVALID', 'RPC returned invalid program account encoding.');
  const bytes = Buffer.from(data[0], 'base64');
  if (bytes.toString('base64') !== data[0] || bytes.length !== (full ? value.space : Math.min(value.space as number, HEADER_BYTES))) {
    fail('unavailable', 'RPC_INVALID', 'RPC returned truncated or noncanonical program account bytes.');
  }
  return {bytes, space: value.space as number};
}
interface Snapshot {
  slot: number; programDataAddress: string; deploymentSlot: bigint; upgradeAuthority: string | null;
  program: DecodedAccount; programData: DecodedAccount; key: string;
}
function snapshot(value: unknown, canonicalData: string, full: boolean, minimumSlot: number): Snapshot {
  if (!record(value) || !record(value.context) || !Number.isSafeInteger(value.context.slot)
    || (value.context.slot as number) < minimumSlot || !Array.isArray(value.value) || value.value.length !== 2) {
    fail('unavailable', 'RPC_INVALID', 'RPC returned an invalid or stale program account context.');
  }
  const slot = value.context.slot as number;
  const program = account(value.value[0], 'program', full), programData = account(value.value[1], 'programdata', full);
  if (program.space !== PROGRAM_BYTES || program.bytes.length !== PROGRAM_BYTES || program.bytes.readUInt32LE(0) !== 2) fail('mismatch', 'PROGRAM_LAYOUT_MISMATCH', 'The deployed Program account has an unsupported loader layout.');
  const programDataAddress = String(getAddressDecoder().decode(program.bytes.subarray(4, 36)));
  if (programDataAddress !== canonicalData) fail('mismatch', 'PROGRAMDATA_ADDRESS_MISMATCH', 'The ProgramData pointer does not match the canonical loader PDA.');
  if (programData.space < HEADER_BYTES + 4 || programData.bytes.length < HEADER_BYTES || programData.bytes.readUInt32LE(0) !== 3
    || ![0, 1].includes(programData.bytes[12])) fail('mismatch', 'PROGRAMDATA_LAYOUT_MISMATCH', 'The ProgramData account has an unsupported loader layout.');
  const deploymentSlot = programData.bytes.readBigUInt64LE(4);
  if (deploymentSlot > BigInt(slot)) fail('unavailable', 'RPC_INVALID', 'Program deployment slot is newer than its RPC context.');
  const upgradeAuthority = programData.bytes[12] === 1 ? String(getAddressDecoder().decode(programData.bytes.subarray(13, 45))) : null;
  // None occupies 13 serialized bytes, but code always starts at offset45.
  // The reserved bytes may retain an old authority after making it immutable.
  const key = [program.bytes.toString('hex'), programData.bytes.subarray(0, HEADER_BYTES).toString('hex'), programData.space].join(':');
  return {slot, programDataAddress, deploymentSlot, upgradeAuthority, program, programData, key};
}

/** Injectable, read-only verifier. Cache never substitutes for fresh loader headers. */
export function createProgramIdentityVerifier(options: ProgramIdentityOptions) {
  const configuredProgram = String(address(options.programId ?? PROGRAM_ID));
  const configuredNetwork = options.network ?? 'localnet', configuredRpc = options.rpcUrl ?? 'injected';
  const canonicalData = getProgramDerivedAddress({programAddress: UPGRADEABLE_LOADER, seeds: [getAddressEncoder().encode(address(configuredProgram))]}).then(([key]) => String(key));
  let lastGenesis: string | null = null, minimumSlot = 0;
  let cache: {key: string; sha256: string; paddingBytes: number; payloadContextSlot: number} | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const clearCache = () => { cache = null; lastGenesis = null; minimumSlot = 0; };
  async function genesis(): Promise<string> {
    const hash = publicKey(await options.rpc('getGenesisHash', []));
    if (configuredNetwork === 'devnet' && hash !== DEVNET_GENESIS) fail('mismatch', 'NETWORK_MISMATCH', 'The configured RPC is not the permitted devnet ledger.');
    return hash;
  }
  async function read(dataAddress: string, full: boolean, floor: number): Promise<Snapshot> {
    const result = await options.rpc('getMultipleAccounts', [[configuredProgram, dataAddress], {
      encoding: 'base64', commitment: 'confirmed', minContextSlot: floor,
      ...(full ? {} : {dataSlice: {offset: 0, length: HEADER_BYTES}}),
    }]);
    return snapshot(result, dataAddress, full, floor);
  }
  async function inspect(): Promise<ProgramIdentity> {
    const result: ProgramIdentity = {status: 'unavailable', signingAllowed: false, code: 'PROGRAM_IDENTITY_UNAVAILABLE', message: 'Program identity is unavailable.',
      network: configuredNetwork, rpcUrl: configuredRpc, programId: configuredProgram, loaderAddress: UPGRADEABLE_LOADER,
      genesisHash: null, contextSlot: null, observedAt: new Date().toISOString(), expected: null, observed: null,
      verification: {commitment: 'confirmed', scope: 'rpc-observed-deployed-bytecode', method: null, payloadContextSlot: null, headerContextSlot: null, sourceToBinaryAttested: false}};
    try {
      result.expected = release(typeof options.expected === 'function' ? await options.expected() : options.expected, configuredProgram);
      const expected = result.expected, beforeGenesis = await genesis();
      result.genesisHash = beforeGenesis;
      if (lastGenesis !== beforeGenesis) { cache = null; minimumSlot = 0; lastGenesis = beforeGenesis; }
      const dataAddress = await canonicalData;
      const first = await read(dataAddress, false, minimumSlot);
      result.contextSlot = first.slot;
      result.observed = {programDataAddress: first.programDataAddress, deploymentSlot: first.deploymentSlot.toString(), upgradeAuthority: first.upgradeAuthority,
        immutable: first.upgradeAuthority === null, programDataLength: first.programData.space, payloadLength: first.programData.space - HEADER_BYTES,
        sha256: null, paddingBytes: null, paddingZero: null};
      result.verification.headerContextSlot = first.slot;
      // Loader-v3 upgrades take effect in deployment_slot+1, not in the slot
      // whose ProgramData already contains the replacement bytes.
      if (first.deploymentSlot >= BigInt(first.slot)) fail('unavailable', 'PROGRAM_NOT_ACTIVE', 'The deployment has not reached its activation slot; retry after the next confirmed slot.');
      const cacheKey = [beforeGenesis, configuredProgram, dataAddress, first.key, JSON.stringify(expected)].join(':');
      const previous = cache?.key === cacheKey ? cache : null;
      let digest: string, paddingBytes: number, payloadSlot: number;
      let payloadMismatch: {code: string; message: string} | null = null;
      if (previous) {
        digest = previous.sha256; paddingBytes = previous.paddingBytes; payloadSlot = previous.payloadContextSlot;
        result.verification.method = 'cached-payload-with-fresh-headers';
      } else {
        cache = null;
        const full = await read(dataAddress, true, first.slot);
        if (full.key !== first.key) fail('unavailable', 'PROGRAM_CHANGED_DURING_CHECK', 'Program deployment changed while its bytecode was being read.');
        const payload = full.programData.bytes.subarray(HEADER_BYTES);
        payloadSlot = full.slot;
        paddingBytes = payload.length - expected.programLen;
        if (paddingBytes < 0) {
          digest = createHash('sha256').update(payload).digest('hex');
          payloadMismatch = {code: 'PROGRAM_LENGTH_MISMATCH', message: 'The deployed executable is shorter than the expected release.'};
        } else {
          digest = createHash('sha256').update(payload.subarray(0, expected.programLen)).digest('hex');
          if (payload.subarray(expected.programLen).some(byte => byte !== 0)) payloadMismatch = {code: 'PROGRAM_PADDING_MISMATCH', message: 'Nonzero bytes follow the expected executable length.'};
          else if (digest !== expected.sha256) payloadMismatch = {code: 'PROGRAM_BYTECODE_MISMATCH', message: 'The deployed executable does not match the expected release hash.'};
        }
        result.verification.method = 'full-payload';
      }
      result.observed.sha256 = digest;
      result.observed.paddingBytes = paddingBytes >= 0 ? paddingBytes : null;
      result.observed.paddingZero = paddingBytes >= 0 && payloadMismatch?.code !== 'PROGRAM_PADDING_MISMATCH';
      result.verification.payloadContextSlot = payloadSlot;
      const final = await read(dataAddress, false, Math.max(first.slot, payloadSlot));
      if (final.key !== first.key) fail('unavailable', 'PROGRAM_CHANGED_DURING_CHECK', 'Program deployment changed before bytecode verification completed.');
      const afterGenesis = await genesis();
      if (beforeGenesis !== afterGenesis) { clearCache(); fail('unavailable', 'CHAIN_CHANGED_DURING_CHECK', 'The RPC ledger changed during program verification.'); }
      result.contextSlot = final.slot; result.verification.headerContextSlot = final.slot;
      minimumSlot = final.slot;
      if (payloadMismatch) fail('mismatch', payloadMismatch.code, payloadMismatch.message);
      cache = {key: cacheKey, sha256: digest, paddingBytes, payloadContextSlot: payloadSlot};
      result.status = 'known-match'; result.signingAllowed = true; result.code = 'PROGRAM_MATCH';
      result.message = 'RPC-observed deployed bytecode matches the expected release; this is not source-to-binary attestation.';
    } catch (error) {
      cache = null;
      if (error instanceof IdentityFailure) { result.status = error.status; result.code = error.code; result.message = error.message; }
      else { result.status = 'unavailable'; result.code = 'PROGRAM_IDENTITY_UNAVAILABLE'; result.message = 'The RPC or release descriptor could not be verified. Existing signed receipts may still be recovered.'; }
    }
    result.observedAt = new Date().toISOString();
    return result;
  }
  function getProgramIdentity(): Promise<ProgramIdentity> {
    // Serialize observations so an older request cannot replace a newer cache.
    const task = queue.then(inspect, inspect); queue = task.then(() => undefined, () => undefined); return task;
  }
  async function assertVerifiedProgram(): Promise<ProgramIdentity> {
    const result = await getProgramIdentity();
    if (!result.signingAllowed) throw new AppError(result.status === 'mismatch' ? 'PROGRAM_IDENTITY_MISMATCH' : 'PROGRAM_IDENTITY_UNAVAILABLE',
      result.message + ' No new signature is permitted; retain existing receipts for passive recovery.', result.status === 'mismatch' ? 409 : 503, result.status === 'unavailable');
    return result;
  }
  return {getProgramIdentity, assertVerifiedProgram, clearCache};
}

const defaultVerifier = createProgramIdentityVerifier({rpc, expected: readExpectedRelease, programId: PROGRAM_ID, network: network as 'localnet' | 'devnet', rpcUrl});
export const getProgramIdentity = defaultVerifier.getProgramIdentity;
export const assertVerifiedProgram = defaultVerifier.assertVerifiedProgram;
