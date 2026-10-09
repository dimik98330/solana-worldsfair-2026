import {getCreateAssociatedTokenIdempotentInstruction, getMintDecoder, getTokenDecoder, TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import {address, createNoopSigner, type Instruction} from '@solana/kit';
import * as program from '../packages/client/src/program.ts';
import {MAX_U64} from '../packages/client/src/domain.ts';
import {network} from './config.ts';
import {account, AppError, chainClock} from './rpc.ts';
import {programAccount, readBond} from './state.ts';
import {readCatalog, saveCatalog, type CatalogRecord} from './catalog.ts';
import {transactionSync} from './storage.ts';
import {isKnownDemoWallet} from './demo-identities.ts';
import {fixture} from './store.ts';
import {normalizeRateDescriptor,verifyRateAmounts,rateMemoInstruction,confirmedRateEvidence,type RateTermsEvidence} from './rate-terms.ts';
import {receipt} from './journal.ts';

export const adminActions = new Set(['initialize_issue', 'register_holder', 'issue_units', 'seal_issue']);
type Bond = ReturnType<typeof program.decodeBond>;
export type AdminRequest = {action: string; params?: Record<string, unknown>; bondAddress?: string};
export type AdminMetadata = Record<string, unknown>;
// The API renders all schedule dates as ISO strings in getState. Preserve exact
// integer seconds while rejecting valid i64 values the browser cannot display.
const MAX_RENDERABLE_TIMESTAMP = 8_640_000_000_000n;
function fail(code: string, message: string): never { throw new AppError(code, message); }
function publicKey(value: unknown, name: string): string {
  if (typeof value !== 'string') fail('INVALID_ADDRESS', `${name} must be an address`);
  try { return String(address(value)); } catch { return fail('INVALID_ADDRESS', `${name} is not a valid address`); }
}
function integer(value: unknown, name: string, max = MAX_U64, positive = false): bigint {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) fail('INVALID_TERMS', `${name} must be an exact integer string`);
  const parsed = BigInt(value);
  if (parsed > max || (positive && parsed === 0n)) fail('INVALID_TERMS', `${name} is outside the supported range`);
  return parsed;
}
function label(value: unknown, name: string, max = 64): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value, 'utf8') > max || Buffer.from(value).toString('utf8') !== value || /[\u0000-\u001f\u007f]/u.test(value)) fail('INVALID_TERMS', `${name} must contain 1 to ${max} valid UTF-8 bytes`);
  return value.trim();
}
function checked(value: bigint): bigint {
  if (value < 0n || value > MAX_U64) fail('AMOUNT_OVERFLOW', 'The issued supply or full reserve exceeds u64');
  return value;
}
export function requiredReserve(bond: Pick<Bond, 'faceValue' | 'couponTerms'>, units: bigint): bigint {
  if (bond.faceValue <= 0n || bond.couponTerms.length < 1 || bond.couponTerms.length > 8 || bond.couponTerms.some(coupon => coupon.unitAmount <= 0n || coupon.unitAmount > MAX_U64)) fail('INVALID_TERMS', 'Full reserve requires positive face value and 1 to 8 positive coupons');
  let perUnit = checked(bond.faceValue);
  for (const coupon of bond.couponTerms) perUnit = checked(perUnit + coupon.unitAmount);
  return checked(perUnit * checked(units));
}
export function normalizeIssueTerms(params: Record<string, unknown>, now: bigint) {
  const seriesId = integer(params.seriesId, 'Series ID'), name = label(params.name, 'Issue name');
  const settlementMint = publicKey(params.settlementMint, 'Settlement mint');
  const faceValue = integer(params.faceValueMinor, 'Face value', MAX_U64, true);
  const rateDescriptor = normalizeRateDescriptor(params, faceValue);
  const maturityTs = integer(params.maturityTs, 'Maturity date', MAX_RENDERABLE_TIMESTAMP, true);
  let schedule = params.coupons;
  if (typeof schedule === 'string') {
    if (schedule.length > 4096) fail('INVALID_TERMS', 'Coupon schedule is too large');
    try { schedule = JSON.parse(schedule); } catch { fail('INVALID_TERMS', 'Coupon schedule must be valid JSON'); }
  }
  if (!Array.isArray(schedule) || schedule.length < 1 || schedule.length > 8) fail('INVALID_TERMS', 'Use a schedule of 1 to 8 coupons');
  if (maturityTs <= now) fail('INVALID_TERMS', 'Maturity must be after the current chain time');
  let priorRecord = now, priorPayment = now;
  const coupons: program.CouponTerms[] = schedule.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_TERMS', 'Each coupon must be an object');
    const recordTs = integer(value.recordTs, 'Record date', MAX_RENDERABLE_TIMESTAMP, true);
    const paymentTs = integer(value.paymentTs, 'Payment date', MAX_RENDERABLE_TIMESTAMP, true);
    const unitAmount = integer(value.unitAmount === undefined && rateDescriptor ? rateDescriptor.couponUnitMinor : value.unitAmount, 'Coupon amount', MAX_U64, true);
    if (recordTs <= priorRecord || paymentTs < recordTs || paymentTs < priorPayment || paymentTs > maturityTs) fail('INVALID_TERMS', 'Coupon dates must be ordered, after chain time, and within maturity');
    priorRecord = recordTs; priorPayment = paymentTs;
    return {recordTs, paymentTs, unitAmount};
  });
  if (rateDescriptor) verifyRateAmounts(rateDescriptor, coupons.map(coupon => coupon.unitAmount));
  requiredReserve({faceValue, couponTerms: coupons}, 1n);
  return {seriesId, name, settlementMint, faceValue, maturityTs, coupons, rateDescriptor};
}
function normalizeMetadata(terms: ReturnType<typeof normalizeIssueTerms>): AdminMetadata {
  return {seriesId: terms.seriesId.toString(), name: terms.name, settlementMint: terms.settlementMint,
    faceValueMinor: terms.faceValue.toString(), maturityTs: terms.maturityTs.toString(),
    coupons: terms.coupons.map(c => ({recordTs: c.recordTs.toString(), paymentTs: c.paymentTs.toString(), unitAmount: c.unitAmount.toString()})),
    ...(terms.rateDescriptor ? {rateBps: terms.rateDescriptor.rateBps, couponFrequency: terms.rateDescriptor.couponFrequency, rateProvenance: 'issuer-signed-creation-memo'} : {})};
}
async function mint(key: string, decimals: number) {
  const {value} = await account(key);
  if (!value || value.executable || value.owner !== TOKEN_PROGRAM_ADDRESS) fail('INVALID_MINT', 'Expected an initialized classic SPL mint');
  const bytes = Buffer.from(value.data[0], 'base64');
  if (bytes.length !== 82 || bytes[45] !== 1) fail('INVALID_MINT', 'Expected an initialized classic SPL mint');
  const data = getMintDecoder().decode(bytes);
  if (!data.isInitialized || data.decimals !== decimals) fail('INVALID_MINT', `Mint must use ${decimals} decimals`);
  return data;
}
async function token(key: string, expectedMint: string, owner: string, optional = false) {
  const {value} = await account(key);
  const vacant = value?.owner === program.SYSTEM && value.executable === false
    && Number.isSafeInteger(value.lamports) && value.lamports >= 0
    && Array.isArray(value.data) && value.data.length === 2 && value.data[0] === '' && value.data[1] === 'base64'
    && (value.space === undefined || value.space === 0);
  if (optional && (!value || vacant)) {
    // A closed ATA may receive lamports before recreation. Only its exact
    // canonical, empty System account can take the idempotent creation path.
    if (key !== await program.ata(owner, expectedMint)) fail('INVALID_TOKEN_ACCOUNT', 'Only a canonical associated token account may be restored');
    return null;
  }
  if (!value || value.executable || value.owner !== TOKEN_PROGRAM_ADDRESS) fail('INVALID_TOKEN_ACCOUNT', 'Expected a classic SPL token account');
  const bytes = Buffer.from(value.data[0], 'base64');
  if (bytes.length !== 165) fail('INVALID_TOKEN_ACCOUNT', 'Expected a classic SPL token account');
  const data = getTokenDecoder().decode(bytes);
  if (data.mint !== expectedMint || data.owner !== owner || (data.state !== 1 && data.state !== 2) || data.delegate.__option !== 'None' || data.closeAuthority.__option !== 'None') fail('INVALID_TOKEN_ACCOUNT', 'Token account mint, authority or state does not match this instrument');
  return data;
}
async function identity(bond: Bond, bondAddress: string) {
  const expected = await program.deriveBond(bond.issuer, bond.seriesId);
  const [bondMint, vault] = await Promise.all([program.derive('bond_mint', expected), program.derive('vault', expected)]);
  if (expected !== bondAddress || bondMint !== bond.bondMint || vault !== bond.vault || !bond.couponTerms.length || bond.holderWallets.length > 16 || new Set(bond.holderWallets).size !== bond.holderWallets.length) fail('INVALID_INSTRUMENT', 'Instrument does not match its canonical accounts');
  requiredReserve(bond, bond.totalIssued);
}
async function draft(bond: Bond, actor: string) {
  if (bond.issuer !== actor) fail('UNAUTHORIZED_ISSUER', 'Only this instrument issuer may administer it');
  if (bond.state !== 0) fail('INVALID_PHASE', 'Issuer setup is available only while the instrument is draft');
  if ((await chainClock()).timestamp >= bond.couponTerms[0].recordTs) fail('RECORD_DATE_PASSED', 'Issuer setup closes at the first record date');
}
export async function makeAdminAction(request: AdminRequest, wallet: string) {
  if (!adminActions.has(request.action)) fail('UNKNOWN_ACTION', 'Unsupported issuer action');
  const actor = publicKey(wallet, 'Issuer wallet'), params = request.params ?? {};
  const instructions: Instruction[] = [];
  let bondAddress: string, proofAccount: string, amount: bigint | undefined, metadata: AdminMetadata | undefined;
  let tokenAddress: string | undefined, tokenDecimals: number | undefined, recipients: string[] | undefined;
  if (request.action === 'initialize_issue') {
    const terms = normalizeIssueTerms(params, (await chainClock()).timestamp);
    await mint(terms.settlementMint, 6);
    const built = terms.rateDescriptor
      ? await program.initializeRateIssue(actor, terms.settlementMint, terms.seriesId, terms.name, terms.faceValue, terms.maturityTs, terms.coupons, Number(terms.rateDescriptor.rateBps), Number(terms.rateDescriptor.couponFrequency))
      : await program.initializeIssue(actor, terms.settlementMint, terms.seriesId, terms.name, terms.faceValue, terms.maturityTs, terms.coupons);
    if (request.bondAddress !== undefined && publicKey(request.bondAddress, 'Instrument') !== built.bond) fail('INSTRUMENT_MISMATCH', 'Requested instrument does not match issuer and series');
    if ((await account(built.bond)).value) fail('ISSUE_EXISTS', 'An instrument for this issuer and series already exists');
    bondAddress = built.bond; proofAccount = built.bond; metadata = normalizeMetadata(terms);
    if(terms.rateDescriptor)metadata.programRateTermsVersion=1;
    instructions.push(built.ix);
    if (terms.rateDescriptor) instructions.push(rateMemoInstruction(bondAddress, actor, terms.faceValue.toString(), terms.rateDescriptor));
  } else {
    const read = await readBond(request.bondAddress);
    if (!read) fail('NO_INSTRUMENT', 'Select a confirmed instrument first');
    const {bond} = read;
    bondAddress = read.address; proofAccount = bondAddress;
    await identity(bond, bondAddress); await draft(bond, actor);
    switch (request.action) {
      case 'register_holder': {
        const holder = publicKey(params.holderWallet, 'Holder wallet');
        const holderLabel = params.label === undefined || params.label === '' ? undefined : label(params.label, 'Holder label');
        if (bond.holderWallets.includes(address(holder))) fail('ALREADY_REGISTERED', 'This holder is already registered');
        if (bond.holderWallets.length >= 16) fail('REGISTRY_FULL', 'An instrument supports at most 16 holders');
        const holderAccount = await account(holder);
        if (holderAccount.value && (holderAccount.value.owner !== program.SYSTEM || holderAccount.value.executable)) fail('INVALID_HOLDER', 'Holder must be a system wallet');
        const holderAta = await program.ata(holder, bond.bondMint), existing = await token(holderAta, bond.bondMint, holder, true);
        if (existing && existing.amount !== 0n) fail('INVALID_HOLDER', 'A new holder must have an empty bond account');
        instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer: createNoopSigner(address(actor)), ata: holderAta, owner: address(holder), mint: bond.bondMint}), program.registerHolder(actor, bondAddress, holder, holderAta, bond.bondMint));
        metadata = {holderWallet: holder, ...(holderLabel ? {label: holderLabel} : {})}; recipients = [holder];
        break;
      }
      case 'issue_units': {
        const holder = publicKey(params.holderWallet, 'Holder wallet');
        if (!bond.holderWallets.includes(address(holder))) fail('NOT_HOLDER', 'Register this holder before issuing units');
        amount = integer(params.units, 'Bond units', MAX_U64, true);
        requiredReserve(bond, checked(bond.totalIssued + amount));
        const holderAta = await program.ata(holder, bond.bondMint), existing = await token(holderAta, bond.bondMint, holder, true);
        // SPL permits closing an empty registered account. Restore only its
        // canonical ATA; the program freezes it again after the authorized mint.
        if (existing && existing.state !== 2 && (existing.state !== 1 || existing.amount !== 0n)) fail('INVALID_HOLDER', 'Registered bond accounts must be frozen or empty before issuance');
        if (!existing) instructions.push(getCreateAssociatedTokenIdempotentInstruction({payer: createNoopSigner(address(actor)), ata: holderAta, owner: address(holder), mint: bond.bondMint}));
        instructions.push(program.issueUnits(actor, bondAddress, bond.bondMint, holderAta, amount));
        tokenAddress = bond.bondMint; tokenDecimals = 0; recipients = [holder];
        metadata = {holderWallet: holder, units: amount.toString(), beforeTotalIssued: bond.totalIssued.toString(), beforeHolderUnits: (existing?.amount ?? 0n).toString()};
        break;
      }
      case 'seal_issue': {
        if (bond.totalIssued === 0n || !bond.holderWallets.length) fail('INVALID_TERMS', 'Issue units to registered holders before activation');
        const [bondMint, vault] = await Promise.all([mint(bond.bondMint, 0), token(bond.vault, bond.settlementMint, bondAddress)]);
        if (bondMint.supply !== bond.totalIssued) fail('SUPPLY_MISMATCH', 'Bond mint supply does not match the issued supply');
        if (bondMint.mintAuthority.__option !== 'Some' || bondMint.mintAuthority.value !== bondAddress || bondMint.freezeAuthority.__option !== 'Some' || bondMint.freezeAuthority.value !== bondAddress) fail('INVALID_MINT', 'Bond mint authorities do not match this instrument');
        const reserve = requiredReserve(bond, bond.totalIssued);
        if (!vault || vault.amount < reserve) fail('INSUFFICIENT_RESERVE', `Full reserve requires ${reserve} settlement minor units`);
        if (vault.state !== 1) fail('VAULT_FROZEN', 'The settlement vault is frozen; activation requires a transferable reserve');
        instructions.push(program.sealIssue(actor, bondAddress, bond.bondMint, bond.vault));
        metadata = {requiredReserveMinor: reserve.toString()};
        break;
      }
    }
  }
  return {instructions, bondAddress, proofAccount, amount, metadata, summary: {network, action: request.action, signer: actor, instrumentAddress: bondAddress,
    ...(amount !== undefined ? {amountMinor: amount.toString()} : {}), ...(tokenAddress ? {token: tokenAddress, tokenDecimals} : {}), ...(recipients ? {recipients} : {})}};
}

/** Invoke only after the exact prepared message has a confirmed successful receipt. */
export async function finalizeAdminEffect(prepared: {action: string; wallet: string; bond?: string; params?: Record<string, unknown>; metadata?: AdminMetadata; signature?: string}) {
  if (!adminActions.has(prepared.action)) return;
  const actor = publicKey(prepared.wallet, 'Issuer wallet'), bondAddress = publicKey(prepared.bond, 'Instrument');
  const raw = await programAccount(bondAddress);
  if (!raw) fail('CONFIRMED_EFFECT_MISSING', 'Confirmed instrument state is not available yet');
  const bond = program.decodeBond(raw.bytes);
  await identity(bond, bondAddress);
  if (bond.issuer !== actor) fail('UNAUTHORIZED_ISSUER', 'Confirmed instrument issuer does not match the prepared signer');
  let record = readCatalog(bondAddress);
  if (record && (record.roles.issuer !== actor || record.seriesId !== bond.seriesId.toString() || record.settlementMint !== bond.settlementMint)) fail('INSTRUMENT_MISMATCH', 'Catalog identity does not match the confirmed instrument');
  const metadata = prepared.metadata;
  let holderLabelEffect: {wallet: string; label: string} | undefined;
  let rateTerms: RateTermsEvidence | undefined;
  if (prepared.action === 'initialize_issue') {
    if (!metadata) fail('CONFIRMED_EFFECT_MISSING', 'Prepared creation terms are required for reconciliation');
    // Compare immutable terms without reapplying the now-expired creation window.
    const terms = normalizeIssueTerms(metadata, 0n);
    if (terms.seriesId !== bond.seriesId || terms.name !== bond.name || terms.settlementMint !== bond.settlementMint || terms.faceValue !== bond.faceValue || terms.maturityTs !== bond.maturityTs || terms.coupons.length !== bond.couponTerms.length || terms.coupons.some((c, i) => c.recordTs !== bond.couponTerms[i].recordTs || c.paymentTs !== bond.couponTerms[i].paymentTs || c.unitAmount !== bond.couponTerms[i].unitAmount)) fail('INSTRUMENT_MISMATCH', 'Confirmed issue terms do not match the exact prepared creation');
    await mint(bond.settlementMint, 6);
    if(metadata.programRateTermsVersion===1){
      const key=await program.deriveFinancialTerms(bondAddress),raw=await programAccount(key);
      if(!raw)fail('RATE_EVIDENCE_PENDING','The atomic on-chain financial terms are absent');
      const validated=program.decodeFinancialTerms(raw.bytes);
      if(!terms.rateDescriptor||validated.bond!==bondAddress||validated.nominal!==terms.faceValue||validated.rateBps!==Number(terms.rateDescriptor.rateBps)||validated.couponFrequency!==Number(terms.rateDescriptor.couponFrequency)||validated.unitAmount.toString()!==terms.rateDescriptor.couponUnitMinor)fail('INSTRUMENT_MISMATCH','The program-validated financial terms differ from the reviewed creation');
    }
    if (terms.rateDescriptor) rateTerms = await confirmedRateEvidence(prepared.signature ? receipt(prepared.signature) : null, bondAddress, actor, terms.faceValue.toString(), terms.rateDescriptor);
    // This is the local catalog observation time, not an asserted chain creation timestamp.
    const source = isKnownDemoWallet(actor,fixture()?.roles) ? 'demo' : 'wallet';
    record ??= {seriesId: bond.seriesId.toString(), bond: bondAddress, name: bond.name, settlementMint: bond.settlementMint, createdAt: new Date().toISOString(), rateBps: rateTerms ? Number(rateTerms.rateBps) : 0, couponFrequency: rateTerms ? Number(rateTerms.couponFrequency) : 0, ...(rateTerms ? {rateTerms} : {}), roles: {issuer: actor}, proposalIds: [], complete: bond.state > 0, accelerated: false, source};
  } else {
    if (!record) fail('NO_INSTRUMENT', 'Confirmed instrument is missing from the catalog');
    if (prepared.action === 'register_holder') {
      const holder = publicKey(metadata?.holderWallet ?? prepared.params?.holderWallet, 'Holder wallet');
      if (!bond.holderWallets.includes(address(holder))) fail('CONFIRMED_EFFECT_MISSING', 'Registered holder is missing from confirmed chain state');
      const holderLabel = metadata?.label;
      if (holderLabel !== undefined) holderLabelEffect = {wallet: holder, label: label(holderLabel, 'Holder label')};
    } else if (prepared.action === 'issue_units') {
      if (!metadata) fail('CONFIRMED_EFFECT_MISSING', 'Prepared issuance baseline is required for reconciliation');
      const holder = publicKey(metadata.holderWallet, 'Holder wallet'), units = integer(metadata.units, 'Bond units', MAX_U64, true);
      const expectedTotal = checked(integer(metadata.beforeTotalIssued, 'Issued supply baseline') + units);
      const expectedHolder = checked(integer(metadata.beforeHolderUnits, 'Holder units baseline') + units);
      if (!bond.holderWallets.includes(address(holder)) || bond.totalIssued < expectedTotal) fail('CONFIRMED_EFFECT_MISSING', 'Issued supply does not reflect the confirmed issuance');
      // A later transfer/redemption may change holder balance; while draft it must include issuance.
      if (bond.state === 0 && (await token(await program.ata(holder, bond.bondMint), bond.bondMint, holder))!.amount < expectedHolder) fail('CONFIRMED_EFFECT_MISSING', 'Holder balance does not reflect the confirmed issuance');
    } else if (prepared.action === 'seal_issue' && bond.state === 0) fail('CONFIRMED_EFFECT_MISSING', 'Instrument activation is missing from confirmed state');
  }
  // Hold the database lock across the latest read, merge and write, including
  // callers from another process. All awaited chain checks completed above.
  transactionSync(()=>{
  const latest = readCatalog(bondAddress);
  if (latest) {
    if (latest.roles.issuer !== actor || latest.seriesId !== bond.seriesId.toString() || latest.settlementMint !== bond.settlementMint) fail('INSTRUMENT_MISMATCH', 'Catalog identity does not match the confirmed instrument');
    record = latest;
  }
  const effective=latest??record;
  if(!effective)fail('NO_INSTRUMENT','The confirmed instrument catalog is unavailable');
  if (rateTerms && JSON.stringify(effective.rateTerms) !== JSON.stringify(rateTerms)) fail('INSTRUMENT_MISMATCH', 'Catalog annual-rate provenance differs from the confirmed creation receipt');
  if (holderLabelEffect) effective.holderLabels = {...effective.holderLabels, [holderLabelEffect.wallet]: holderLabelEffect.label};
  effective.complete = effective.complete || bond.state > 0;
  saveCatalog(effective as CatalogRecord);
  });
}
