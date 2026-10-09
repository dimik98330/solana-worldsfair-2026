import {createHash} from 'node:crypto';
import {address, getAddressDecoder, getBase58Decoder} from '@solana/kit';
import {PROGRAM_ID, derive} from '../packages/client/src/program.ts';
import {AppError} from './rpc.ts';
import type {ReadRpc} from './chain-view.ts';

export const MAX_PROPOSALS = 32;
const HEADER_LENGTH = 48; // Anchor discriminator + Bond pubkey + u64 proposal ID.
const discriminator = createHash('sha256').update('account:Proposal').digest().subarray(0, 8);
export type DiscoveredProposal = {id: string; address: string};
export type ProposalDiscovery = {
  contextSlot: number; proposals: DiscoveredProposal[]; discoveredIds: string[];
  selectedIds: string[]; catalogIdsAbsentAtDiscovery: string[]; headerFingerprint: string;
};
export type ProposalDiscoveryCoverage = {
  source: 'program-accounts'; commitment: 'confirmed'; scope: 'discovery-slot';
  contextSlot: number; verificationContextSlot: number; financialContextSlot: number;
  discoveredIds: string[]; catalogIds: string[]; queriedIds: string[];
  selection: 'lowest-proposal-id'; discoveredCount: number; selectedIds: string[];
  selectedDiscoveredCount: number; omittedDiscoveredCount: number; omittedCatalogIds: string[];
  catalogIdsAbsentAtDiscovery: string[]; unverifiedPdaCount: number;
  maxProposals: 32; completeAtFinancialContext: false;
};
function fail(code: string, message: string): never { throw new AppError(code, message, 503); }
function object(value: unknown): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const validSlot = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function sortProposalIds(ids: string[]): string[] { return [...ids].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0); }

/** Headers identify PDAs only. No financial fields from this RPC enter the chain view. */
export async function discoverProposals(bond: string, minContextSlot: number, request: ReadRpc, catalogIds: string[] = []): Promise<ProposalDiscovery> {
  try { address(bond); } catch { return fail('INVALID_ADDRESS', 'Invalid instrument address for proposal discovery'); }
  if (!validSlot(minContextSlot)) fail('RPC_INVALID', 'Invalid proposal discovery lower bound');
  const response: unknown = await request('getProgramAccounts', [PROGRAM_ID, {
    encoding: 'base64', commitment: 'confirmed', withContext: true, minContextSlot,
    dataSlice: {offset: 0, length: HEADER_LENGTH},
    filters: [
      {memcmp: {offset: 0, bytes: getBase58Decoder().decode(discriminator)}},
      {memcmp: {offset: 8, bytes: bond}},
    ],
  }]);
  if (!object(response) || !object(response.context) || !validSlot(response.context.slot) || response.context.slot < minContextSlot || !Array.isArray(response.value)) fail('RPC_INVALID', 'Proposal discovery response is malformed or stale');
  const ids = new Set<string>(), addresses = new Set<string>(), headers: DiscoveredProposal[] = [];
  for (const entry of response.value) {
    if (!object(entry) || typeof entry.pubkey !== 'string' || !object(entry.account)) fail('RPC_INVALID', 'Invalid proposal discovery entry');
    try { address(entry.pubkey); } catch { return fail('RPC_INVALID', 'Invalid discovered proposal address'); }
    const account = entry.account;
    if (account.owner !== PROGRAM_ID) fail('INVALID_ACCOUNT_OWNER', 'Discovered proposal has an unexpected program owner');
    if (account.executable !== false || !Array.isArray(account.data) || account.data.length !== 2 || account.data[1] !== 'base64' || typeof account.data[0] !== 'string') fail('RPC_INVALID', 'Invalid discovered proposal account envelope');
    // Reject oversized encoded input before allocating or deriving any PDA.
    if (account.data[0].length !== HEADER_LENGTH / 3 * 4) fail('INVALID_PROPOSAL_DISCOVERY', 'Proposal discovery must return exactly the requested identity header');
    const bytes = Buffer.from(account.data[0], 'base64');
    if (bytes.toString('base64') !== account.data[0]) fail('RPC_INVALID', 'Discovered proposal header is not canonical base64');
    if (bytes.length !== HEADER_LENGTH) fail('INVALID_PROPOSAL_DISCOVERY', 'Proposal discovery must return exactly the requested identity header');
    if (!bytes.subarray(0, 8).equals(discriminator) || getAddressDecoder().decode(bytes.subarray(8, 40)) !== bond) fail('INVALID_PROPOSAL_DISCOVERY', 'Discovered proposal does not match the requested discriminator and instrument');
    const id = bytes.readBigUInt64LE(40).toString();
    if (ids.has(id) || addresses.has(entry.pubkey)) fail('INVALID_PROPOSAL_DISCOVERY', 'Proposal discovery contains duplicate identities');
    ids.add(id); addresses.add(entry.pubkey); headers.push({id, address: entry.pubkey});
  }
  headers.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
  const discoveredIds = headers.map(p => p.id);
  const selectedIds = sortProposalIds([...new Set([...discoveredIds, ...catalogIds])]).slice(0, MAX_PROPOSALS);
  const selected = new Set(selectedIds), proposals = headers.filter(p => selected.has(p.id));
  // A Bond can have more proposals than fit the financial read graph. Check
  // every returned header cheaply, but derive PDAs only for this finite window.
  // Omitted identities remain explicitly PDA-unverified and supply no values.
  for (const proposal of proposals) if (await derive('proposal', bond, BigInt(proposal.id)) !== proposal.address) fail('INVALID_PROPOSAL_DISCOVERY', 'Discovered proposal address is not its canonical PDA');
  return {contextSlot: response.context.slot, proposals, discoveredIds, selectedIds,
    catalogIdsAbsentAtDiscovery: catalogIds.filter(id => !ids.has(id)),
    headerFingerprint: createHash('sha256').update(JSON.stringify(headers)).digest('hex')};
}
