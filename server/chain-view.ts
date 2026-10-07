import {getMintDecoder, getTokenDecoder, TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import {PROGRAM_ID, SYSTEM, ata, decodeBond, decodeCoupon, decodeProposal, derive, deriveBond} from '../packages/client/src/program.ts';
import {AppError, rpc} from './rpc.ts';
import {address} from '@solana/kit';

export const CLOCK_ADDRESS = 'SysvarC1ock11111111111111111111111111111111';
const SYSVAR_OWNER = 'Sysvar1111111111111111111111111111111111111';
export type Bond = ReturnType<typeof decodeBond>;
export type Coupon = ReturnType<typeof decodeCoupon>;
export type Proposal = ReturnType<typeof decodeProposal>;
export type RpcAccount = {owner: string; executable: boolean; data: [string, string]};
type AccountResponse = {context: {slot: number}; value: RpcAccount | null};
type MultipleResponse = {context: {slot: number}; value: (RpcAccount | null)[]};
export type ReadRpc = (method: string, params: unknown[]) => Promise<any>;
export type TokenBalance = {address: string; mint: string; owner: string; amount: bigint; state: number; closed: boolean};
export type ChainView = {
  address: string; bond: Bond; contextSlot: number; clock: {slot: bigint; timestamp: bigint}; accountCount: number;
  bondMint: ReturnType<ReturnType<typeof getMintDecoder>['decode']>;
  settlementMint: ReturnType<ReturnType<typeof getMintDecoder>['decode']>;
  holders: TokenBalance[]; vault: TokenBalance; issuerSettlement: TokenBalance;
  coupons: (Coupon | null)[]; couponAddresses: string[];
  proposals: {id: string; address: string; value: Proposal}[]; missingProposalIds: string[];
};
function fail(code: string, message: string): never { throw new AppError(code, message, 503); }
function slot(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('RPC_INVALID', 'RPC context slot is invalid');
  return value;
}
export function accountBytes(value: RpcAccount, expectedOwner?: string): Buffer {
  if (!value || typeof value.owner !== 'string' || value.executable !== false || !Array.isArray(value.data) || value.data.length !== 2 || value.data[1] !== 'base64' || typeof value.data[0] !== 'string') fail('RPC_INVALID', 'Invalid account envelope');
  if (expectedOwner && value.owner !== expectedOwner) fail('INVALID_ACCOUNT_OWNER', 'Account has an unexpected program owner');
  const bytes = Buffer.from(value.data[0], 'base64');
  if (bytes.toString('base64') !== value.data[0]) fail('RPC_INVALID', 'Account data is not canonical base64');
  return bytes;
}
export function decodeProgramAccount<T>(value: RpcAccount | null, decoder: (bytes: Uint8Array) => T): T | null {
  if (value === null) return null;
  try { return decoder(accountBytes(value, PROGRAM_ID)); }
  catch (error) { if (error instanceof AppError) throw error; return fail('INVALID_PROGRAM_ACCOUNT', 'Malformed program account'); }
}
export async function validateBondIdentity(key: string, bond: Bond) {
  if (await deriveBond(bond.issuer, bond.seriesId) !== key || await derive('bond_mint', key) !== bond.bondMint || await derive('vault', key) !== bond.vault) fail('INVALID_INSTRUMENT', 'Instrument identity does not match canonical accounts');
}
function mint(value: RpcAccount | null, decimals: number) {
  if (value === null) fail('MISSING_REQUIRED_ACCOUNT', 'Required mint is absent');
  const bytes = accountBytes(value, TOKEN_PROGRAM_ADDRESS);
  if (bytes.length !== 82) fail('INVALID_MINT', 'Expected classic SPL mint');
  let decoded; try { decoded = getMintDecoder().decode(bytes); } catch { return fail('INVALID_MINT', 'Malformed SPL mint'); }
  if (!decoded.isInitialized || decoded.decimals !== decimals) fail('INVALID_MINT', 'Mint initialization or decimals do not match the instrument');
  return decoded;
}
export function decodeTokenBalance(value: RpcAccount | null, key: string, expectedMint: string, expectedOwner?: string, allowClosed = false, strictAuthorities = true): TokenBalance {
  if (value === null) {
    if (!allowClosed) fail('MISSING_REQUIRED_ACCOUNT', 'Required token account is absent');
    return {address: key, mint: expectedMint, owner: expectedOwner ?? '', amount: 0n, state: 0, closed: true};
  }
  const bytes = accountBytes(value);
  if (allowClosed && value.owner === SYSTEM && bytes.length === 0) return {address: key, mint: expectedMint, owner: expectedOwner ?? '', amount: 0n, state: 0, closed: true};
  if (value.owner !== TOKEN_PROGRAM_ADDRESS) fail('INVALID_TOKEN_OWNER', 'Token account has an unexpected program owner');
  if (bytes.length !== 165) fail('INVALID_TOKEN_ACCOUNT', 'Expected classic SPL token account');
  let token; try { token = getTokenDecoder().decode(bytes); } catch { return fail('INVALID_TOKEN_ACCOUNT', 'Malformed SPL token account'); }
  if (token.mint !== expectedMint) fail('WRONG_TOKEN_MINT', 'Token account mint does not match');
  // Program snapshots deliberately accept empty canonical ATAs after external owner/authority changes.
  const enforceAuthority = !allowClosed || token.amount > 0n;
  if (enforceAuthority && expectedOwner && token.owner !== expectedOwner) fail('WRONG_TOKEN_AUTHORITY', 'Token account authority does not match its canonical wallet');
  if (token.state !== 1 && token.state !== 2) fail('INVALID_TOKEN_ACCOUNT', 'Token account is not initialized');
  if (token.isNative.__option !== 'None') fail('INVALID_TOKEN_ACCOUNT', 'Instrument token accounts cannot wrap SOL');
  if (enforceAuthority && strictAuthorities && (token.delegate.__option !== 'None' || token.closeAuthority.__option !== 'None' || token.delegatedAmount !== 0n)) fail('UNSAFE_TOKEN_AUTHORITY', 'Instrument token account has a delegated or alternate close authority');
  return {address: key, mint: token.mint, owner: token.owner, amount: token.amount, state: token.state, closed: false};
}
function graphIdentity(bond: Bond) {
  return JSON.stringify({issuer: bond.issuer, seriesId: String(bond.seriesId), mint: bond.bondMint, settlement: bond.settlementMint, vault: bond.vault, holders: bond.holderWallets, face: String(bond.faceValue), maturity: String(bond.maturityTs), coupons: bond.couponTerms.map(t => [String(t.recordTs), String(t.paymentTs), String(t.unitAmount)])});
}
function proposalIds(read: () => string[]): string[] {
  const ids = read();
  if (!Array.isArray(ids) || ids.length > 32 || ids.some(id => typeof id !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(id) || BigInt(id) > (1n << 64n) - 1n) || new Set(ids).size !== ids.length) fail('INVALID_CATALOG', 'Invalid proposal discovery list');
  return [...ids];
}
/** Discovery identifies addresses only. Every returned financial value comes from one confirmed bank. */
export async function readChainView(key: string, options: {readRpc?: ReadRpc; proposalIds?: () => string[]} = {}): Promise<ChainView> {
  try{address(key);}catch{throw new AppError('INVALID_ADDRESS','Select a complete Solana instrument address');}
  const request = options.readRpc ?? rpc, idsReader = options.proposalIds ?? (() => []);
  let lowerBound = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const discovery: AccountResponse = await request('getAccountInfo', [key, {encoding: 'base64', commitment: 'confirmed', ...(lowerBound ? {minContextSlot: lowerBound} : {})}]);
    const discoveredSlot = slot(discovery?.context?.slot);
    if (discoveredSlot < lowerBound) fail('RPC_INVALID', 'Discovery context regressed');
    const discovered = decodeProgramAccount(discovery?.value, decodeBond);
    if (!discovered) fail('INSTRUMENT_NOT_FOUND', 'Selected instrument does not exist at confirmed commitment');
    await validateBondIdentity(key, discovered);
    const ids = proposalIds(idsReader), holderAtas = await Promise.all(discovered.holderWallets.map(wallet => ata(wallet, discovered.bondMint)));
    const couponAddresses = await Promise.all(discovered.couponTerms.map((_terms, index) => derive('coupon', key, index)));
    const proposalAddresses = await Promise.all(ids.map(id => derive('proposal', key, BigInt(id))));
    const issuerAta = await ata(discovered.issuer, discovered.settlementMint);
    const keys = [key, CLOCK_ADDRESS, discovered.bondMint, discovered.settlementMint, discovered.vault, ...holderAtas, ...couponAddresses, ...proposalAddresses, issuerAta];
    if (keys.length > 100 || new Set(keys).size !== keys.length) fail('INVALID_INSTRUMENT', 'Instrument account graph exceeds RPC capacity or aliases accounts');
    const response: MultipleResponse = await request('getMultipleAccounts', [keys, {encoding: 'base64', commitment: 'confirmed', minContextSlot: discoveredSlot}]);
    const contextSlot = slot(response?.context?.slot);
    if (contextSlot < discoveredSlot || !Array.isArray(response?.value) || response.value.length !== keys.length || response.value.some(v => v === undefined)) fail('RPC_INVALID', 'RPC did not return the complete requested context');
    const bond = decodeProgramAccount(response.value[0], decodeBond);
    if (!bond) fail('MISSING_REQUIRED_ACCOUNT', 'Instrument disappeared from its account graph');
    await validateBondIdentity(key, bond);
    if (graphIdentity(bond) !== graphIdentity(discovered) || JSON.stringify(proposalIds(idsReader)) !== JSON.stringify(ids)) { lowerBound = contextSlot; continue; }
    const clockAccount = response.value[1];
    if (!clockAccount) fail('CLOCK_UNAVAILABLE', 'Chain clock is absent');
    const clockBytes = accountBytes(clockAccount, SYSVAR_OWNER);
    if (clockBytes.length !== 40) fail('CLOCK_INVALID', 'Clock account must contain the canonical 40-byte layout');
    const clock = {slot: clockBytes.readBigUInt64LE(0), timestamp: clockBytes.readBigInt64LE(32)};
    if (clock.slot > BigInt(contextSlot)) fail('CLOCK_INVALID', 'Clock is newer than the RPC context');
    const bondMint = mint(response.value[2], 0), settlementMint = mint(response.value[3], 6);
    for (const authority of [bondMint.mintAuthority, bondMint.freezeAuthority]) if (authority.__option !== 'Some' || authority.value !== key) fail('INVALID_MINT_AUTHORITY', 'Bond mint authorities do not match the instrument');
    const vault = decodeTokenBalance(response.value[4], discovered.vault, bond.settlementMint, key);
    if (vault.state !== 1) fail('INVALID_VAULT', 'Settlement vault must be transferable');
    let offset = 5;
    const holders = holderAtas.map((address, index) => decodeTokenBalance(response.value[offset++], address, bond.bondMint, bond.holderWallets[index], true));
    const coupons = couponAddresses.map((_address, index) => {
      const value = decodeProgramAccount(response.value[offset++], decodeCoupon);
      if (!value && index < bond.nextCouponIndex) fail('MISSING_REQUIRED_ACCOUNT', 'Captured coupon snapshot is absent');
      return value;
    });
    const missingProposalIds: string[] = [], proposals: ChainView['proposals'] = [];
    proposalAddresses.forEach((address, index) => { const value = decodeProgramAccount(response.value[offset++], decodeProposal); if (value) proposals.push({id: ids[index], address, value}); else missingProposalIds.push(ids[index]); });
    const issuerSettlement = decodeTokenBalance(response.value[offset], issuerAta, bond.settlementMint, bond.issuer, true, false);
    return {address: key, bond, contextSlot, clock, accountCount: keys.length, bondMint, settlementMint, holders, vault, issuerSettlement, coupons, couponAddresses, proposals, missingProposalIds};
  }
  throw new AppError('CHAIN_VIEW_CHANGED', 'Instrument registry or proposal discovery changed during all three reads; retry without signing', 503, true);
}
