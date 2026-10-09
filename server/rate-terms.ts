import {createHash} from 'node:crypto';
import {address, getAddressEncoder, getCompiledTransactionMessageDecoder, getSignatureFromTransaction, getTransactionDecoder, getTransactionEncoder, type Instruction} from '@solana/kit';
import {couponPerBond, MAX_U64} from '../packages/client/src/domain.ts';
import {PROGRAM_ID} from '../packages/client/src/program.ts';
import {AppError} from './rpc.ts';
import type {ReceiptRecord} from './journal.ts';

export const MEMO_PROGRAM = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export interface RateDescriptor {rateBps: string; couponFrequency: string; couponUnitMinor: string;}
export interface RateTermsEvidence extends RateDescriptor {
  version: 1; faceValueMinor: string; creationSignature: string; memoSha256: string;
  provenance: 'issuer-signed-creation-memo';
}
function fail(code: string, message: string): never {throw new AppError(code, message);}
function integer(value: unknown, name: string, maximum: bigint): string {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value) || BigInt(value) < 1n || BigInt(value) > maximum) fail('INVALID_RATE_TERMS', `${name} must be a positive exact integer string within its supported range`);
  return BigInt(value).toString();
}
/** Fixed/irregular coupon schedules remain valid without an annual-rate descriptor. */
export function normalizeRateDescriptor(params: Record<string, unknown>, faceValue: bigint): RateDescriptor | undefined {
  if (params.rateBps === undefined && params.couponFrequency === undefined) return undefined;
  if (params.rateBps === undefined || params.couponFrequency === undefined) fail('INVALID_RATE_TERMS', 'Provide annual rate and coupon frequency together');
  const rateBps = integer(params.rateBps, 'rateBps', 10_000n), couponFrequency = integer(params.couponFrequency, 'couponFrequency', 12n);
  let amount: bigint;
  try {amount = couponPerBond(faceValue, Number(rateBps), Number(couponFrequency));}
  catch {return fail('COUPON_PRECISION', 'Annual rate and frequency must produce a positive exactly representable coupon in settlement base units; no rounding is applied');}
  return {rateBps, couponFrequency, couponUnitMinor: amount.toString()};
}
export function verifyRateAmounts(descriptor: RateDescriptor, amounts: readonly bigint[]) {
  if (!amounts.length || amounts.some(amount => amount.toString() !== descriptor.couponUnitMinor)) fail('COUPON_AMOUNT_MISMATCH', 'Every coupon amount must equal nominal × annual rate ÷ coupon frequency');
}
export function rateTermsMemo(bond: string, issuer: string, faceValueMinor: string, descriptor: RateDescriptor): string {
  return JSON.stringify({schema: 'bondtrace.rate.v1', bond: String(address(bond)), issuer: String(address(issuer)), faceValueMinor, ...descriptor});
}
export function rateMemoInstruction(bond: string, issuer: string, faceValueMinor: string, descriptor: RateDescriptor): Instruction {
  // Official Memo interface: UTF-8 data; every supplied account must sign.
  // https://www.solana-program.com/docs/memo (checked 2026-10-08).
  return {programAddress: MEMO_PROGRAM, accounts: [{address: address(issuer), role: 2}], data: new Uint8Array(Buffer.from(rateTermsMemo(bond, issuer, faceValueMinor, descriptor), 'utf8'))};
}
/** Validate the public projection without pretending these are Bond account fields. */
export function validateRateEvidence(value: unknown, bond: string, issuer: string): RateTermsEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RATE_TERMS', 'Rate creation evidence must be an object');
  const v = value as Record<string, unknown>, faceValueMinor = integer(v.faceValueMinor, 'faceValueMinor', MAX_U64), descriptor = normalizeRateDescriptor(v, BigInt(faceValueMinor));
  if (v.version !== 1 || !descriptor || v.couponUnitMinor !== descriptor.couponUnitMinor || v.provenance !== 'issuer-signed-creation-memo' || typeof v.creationSignature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(v.creationSignature)) fail('INVALID_RATE_TERMS', 'Rate creation evidence has invalid terms or signature provenance');
  const memoSha256 = createHash('sha256').update(rateTermsMemo(bond, issuer, faceValueMinor, descriptor)).digest('hex');
  if (v.memoSha256 !== memoSha256) fail('INVALID_RATE_TERMS', 'Rate creation evidence does not match its immutable memo');
  return {version: 1, faceValueMinor, ...descriptor, creationSignature: v.creationSignature, memoSha256, provenance: 'issuer-signed-creation-memo'};
}
/** A successful exact retained creation message must contain the issuer-signed memo. */
export async function confirmedRateEvidence(record: ReceiptRecord | null, bond: string, issuer: string, faceValueMinor: string, descriptor: RateDescriptor): Promise<RateTermsEvidence> {
  if (!record || record.action !== 'initialize_issue' || record.bond !== bond || record.wallet !== issuer || record.chainStatus !== 'confirmed' || !record.signedTransactionBase64) fail('RATE_EVIDENCE_PENDING', 'Recover the confirmed exact creation receipt before accepting annual-rate provenance');
  const expectedMemo = rateTermsMemo(bond, issuer, faceValueMinor, descriptor);
  try {
    const bytes = Buffer.from(record.signedTransactionBase64, 'base64');
    if (bytes.length > 1232 || bytes.toString('base64') !== record.signedTransactionBase64) throw new Error('Invalid bounded base64');
    const transaction = getTransactionDecoder().decode(bytes);
    if (!Buffer.from(getTransactionEncoder().encode(transaction)).equals(bytes)) throw new Error('Noncanonical transaction bytes');
    if (String(getSignatureFromTransaction(transaction)) !== record.signature) throw new Error('Receipt signature mismatch');
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    if (message.version !== 0 && message.version !== 'legacy') throw new Error('Unsupported creation evidence message version');
    const signerIndex = message.staticAccounts.indexOf(address(issuer));
    if (signerIndex < 0 || signerIndex >= message.header.numSignerAccounts || (message.version === 0 && message.addressTableLookups?.length)) throw new Error('Issuer signer is absent');
    const memo = message.instructions.find(ix => message.staticAccounts[ix.programAddressIndex] === MEMO_PROGRAM && ix.accountIndices?.includes(signerIndex) && Buffer.from(ix.data ?? []).toString('utf8') === expectedMemo);
    if (!memo) throw new Error('The exact reviewed memo is absent');
    const discriminators = ['initialize_issue','initialize_rate_issue'].map(name=>createHash('sha256').update('global:'+name).digest().subarray(0,8)), bondIndex = message.staticAccounts.indexOf(address(bond));
    if (!message.instructions.some(ix => message.staticAccounts[ix.programAddressIndex] === PROGRAM_ID && discriminators.some(discriminator=>Buffer.from(ix.data ?? []).subarray(0, 8).equals(discriminator)) && ix.accountIndices?.includes(bondIndex) && ix.accountIndices?.includes(signerIndex))) throw new Error('Memo is not attached to the matching creation instruction');
    const signature = transaction.signatures[address(issuer)];
    if (!signature) throw new Error('Issuer signature is absent');
    const key = await crypto.subtle.importKey('raw', new Uint8Array(getAddressEncoder().encode(address(issuer))), {name: 'Ed25519'}, false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, new Uint8Array(signature), new Uint8Array(transaction.messageBytes))) throw new Error('Issuer signature is invalid');
  } catch {return fail('RATE_EVIDENCE_MISMATCH', 'The retained signed creation message does not commit to these annual-rate terms');}
  return {version: 1, faceValueMinor, ...descriptor, creationSignature: record.signature, memoSha256: createHash('sha256').update(expectedMemo).digest('hex'), provenance: 'issuer-signed-creation-memo'};
}
