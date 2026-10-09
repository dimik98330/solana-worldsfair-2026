import { isAddress } from '@solana/kit';
import type { ChainState } from './types';
import { zonedInput, zonedSeconds } from './time-zone';
import { resolveDraftSeconds, type DraftInstants } from './issuer-draft';

export const U64_MAX = 18_446_744_073_709_551_615n;
export const ISSUE_NAME_MAX_BYTES = 64;
export const MAX_COUPONS = 8;
export const MAX_HOLDERS = 16;
export type ParsedInteger = { value: string; error: null } | { value: null; error: string };
export interface CouponDraft { key: string; recordLocal: string; paymentLocal: string; amount: string }
export interface IssueDraft { seriesId: string; name: string; settlementMint: string; faceValue: string; maturityLocal: string; coupons: CouponDraft[] }
export interface IssueParams { seriesId: string; name: string; settlementMint: string; faceValueMinor: string; maturityTs: string; coupons: string }

export function utf8Error(value: string, label = 'Issue name', maximum = ISSUE_NAME_MAX_BYTES): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `Enter ${label.toLowerCase()}.`;
  if (/[\u0000-\u001f\u007f]/u.test(trimmed)) return `${label} cannot contain control characters. Use a single-line label.`;
  const bytes = new TextEncoder().encode(trimmed).byteLength;
  return bytes > maximum ? `${label} uses ${bytes} UTF-8 bytes. Use at most ${maximum}; some characters use several bytes.` : null;
}

/** Exact six-decimal settlement units. Never Number/parseFloat for money. */
export function parseSettlementAmount(input: string): ParsedInteger {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return { value: null, error: 'Enter a positive amount with a decimal point and up to 6 decimals. No commas or exponents.' };
  const [whole, fraction = ''] = value.split('.');
  const minor = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (minor <= 0n) return { value: null, error: 'Amount must be greater than zero.' };
  if (minor > U64_MAX) return { value: null, error: 'Amount exceeds the on-chain limit of 18,446,744,073,709.551615 test units.' };
  return { value: minor.toString(), error: null };
}

export function parseBondCount(input: string): ParsedInteger {
  const value = input.trim();
  if (!/^\d+$/.test(value)) return { value: null, error: 'Enter a whole number of bonds. Fractions and exponents are not accepted.' };
  const count = BigInt(value);
  if (count <= 0n) return { value: null, error: 'Issue at least 1 bond.' };
  if (count > U64_MAX) return { value: null, error: 'Bond count exceeds the on-chain integer limit.' };
  return { value: count.toString(), error: null };
}

export function addressError(value: string): string | null {
  return isAddress(value.trim()) ? null : 'Enter a complete, valid Solana address (32-byte base58).';
}

/** Native datetime-local values are interpreted in the browser's displayed timezone. */
export function localDateSeconds(value: string, timeZone?: string): number | null {
  if (timeZone) return zonedSeconds(value, timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0'] = match;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day) || date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute) || date.getSeconds() !== Number(second)) return null;
  const seconds = date.getTime() / 1000;
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

export function localDateInput(seconds: number, timeZone?: string): string {
  if (timeZone) return zonedInput(seconds, timeZone);
  const value = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function validateIssueDraft(draft: IssueDraft, nowSeconds: number, timeZone?: string, instants: DraftInstants = {}): { errors: Record<string, string>; params: IssueParams | null; unitReserveMinor?: string } {
  const secondsFor = (key: string, value: string) => timeZone ? resolveDraftSeconds(value, timeZone, instants[key]) : localDateSeconds(value);
  const errors: Record<string, string> = {};
  const name = utf8Error(draft.name); if (name) errors.name = name;
  const mint = addressError(draft.settlementMint); if (mint) errors.settlementMint = mint;
  if (!/^\d+$/.test(draft.seriesId) || BigInt(draft.seriesId) > U64_MAX) errors.seriesId = 'Issue identifier is invalid. Start a new issue form.';
  const face = parseSettlementAmount(draft.faceValue); if (face.error) errors.faceValue = face.error;
  const maturity = secondsFor('maturityLocal', draft.maturityLocal);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) errors.schedule = 'Chain time is unavailable. Refresh the connection before creating an issue.';
  if (maturity == null) errors.maturityLocal = 'Choose a valid maturity date and time.';
  else if (maturity <= nowSeconds) errors.maturityLocal = 'Maturity must be in the future.';
  if (draft.coupons.length < 1 || draft.coupons.length > MAX_COUPONS) errors.schedule = `Add between 1 and ${MAX_COUPONS} fixed coupons.`;
  let priorRecord = nowSeconds, priorPayment = nowSeconds, unitReserve = face.value == null ? 0n : BigInt(face.value);
  const coupons: { recordTs: string; paymentTs: string; unitAmount: string }[] = [];
  draft.coupons.forEach((coupon, index) => {
    const prefix = `coupon.${coupon.key}`;
    const record = secondsFor(`${prefix}.recordLocal`, coupon.recordLocal), payment = secondsFor(`${prefix}.paymentLocal`, coupon.paymentLocal);
    const amount = parseSettlementAmount(coupon.amount);
    if (record == null) errors[`${prefix}.recordLocal`] = 'Choose a valid record date and time.';
    else if (record <= priorRecord) errors[`${prefix}.recordLocal`] = index === 0 ? 'First record date must be in the future. Allow time to register, issue, fund and activate.' : 'Record date must be later than the previous coupon record date.';
    if (payment == null) errors[`${prefix}.paymentLocal`] = 'Choose a valid payment date and time.';
    else if (record != null && payment < record) errors[`${prefix}.paymentLocal`] = 'Payment cannot precede this coupon record date.';
    else if (payment < priorPayment) errors[`${prefix}.paymentLocal`] = 'Payment cannot precede the previous coupon payment.';
    else if (maturity != null && payment > maturity) errors[`${prefix}.paymentLocal`] = 'Payment must be on or before maturity.';
    if (amount.error) errors[`${prefix}.amount`] = amount.error;
    if (record != null) priorRecord = record;
    if (payment != null) priorPayment = payment;
    if (amount.value != null) unitReserve += BigInt(amount.value);
    if (record != null && payment != null && amount.value != null) coupons.push({ recordTs: String(record), paymentTs: String(payment), unitAmount: amount.value });
  });
  if (unitReserve > U64_MAX) errors.schedule = 'Nominal plus all coupons per bond exceeds the on-chain integer limit. Reduce the amounts.';
  if (Object.keys(errors).length || face.value == null || maturity == null) return { errors, params: null };
  return { errors, params: { seriesId: draft.seriesId, name: draft.name.trim(), settlementMint: draft.settlementMint.trim(), faceValueMinor: face.value, maturityTs: String(maturity), coupons: JSON.stringify(coupons) }, unitReserveMinor: unitReserve.toString() };
}

function unsigned(value?: string | null): bigint | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  const n = BigInt(value); return n <= U64_MAX ? n : null;
}

/** Draft reserve only: principal plus every fixed coupon, derived from supplied chain state. */
export function issueReserve(state: ChainState): { principalMinor?: string; couponMinor?: string; requiredMinor?: string; gapMinor?: string; unitMinor?: string; error?: string } {
  const instrument = state.instrument;
  if (!instrument) return {};
  const extended = instrument as typeof instrument & { couponUnitMinor?: string; requiredReserveMinor?: string };
  const supply = unsigned(instrument.issuedSupply), face = unsigned(instrument.faceValueMinor), vault = unsigned(instrument.vaultBalanceMinor);
  if (supply == null || face == null || vault == null || !state.coupons.length) return { error: 'Reserve data is incomplete. Refresh chain state before funding or activation.' };
  const principal = supply * face;
  let couponTotal = 0n, unitCoupon = 0n, everyUnitKnown = true;
  for (const coupon of state.coupons) {
    const unit = unsigned((coupon as typeof coupon & { unitAmountMinor?: string }).unitAmountMinor);
    const total = unsigned(coupon.totalMinor);
    if (total == null && unit == null) return { error: 'Coupon amounts are unavailable. Refresh chain state.' };
    couponTotal += unit != null ? supply * unit : total!;
    if (unit != null) unitCoupon += unit;
    else if (supply > 0n && total! % supply === 0n) unitCoupon += total! / supply;
    else everyUnitKnown = false;
  }
  const summedUnit = unsigned(extended.couponUnitMinor);
  const unitReserve = summedUnit != null ? face + summedUnit : everyUnitKnown ? face + unitCoupon : null;
  const required = principal + couponTotal;
  const supplied = unsigned(extended.requiredReserveMinor);
  if (required > U64_MAX || (unitReserve != null && unitReserve > U64_MAX)) return { error: 'The reserve exceeds the on-chain integer limit. Do not fund this issue.' };
  if (supplied != null && supplied !== required) return { error: 'Reserve totals disagree. Refresh chain state before continuing.' };
  return { principalMinor: principal.toString(), couponMinor: couponTotal.toString(), requiredMinor: required.toString(), gapMinor: (required > vault ? required - vault : 0n).toString(), unitMinor: unitReserve?.toString() };
}

export function issuanceError(input: string, currentSupply: string, unitReserveMinor?: string): string | null {
  const count = parseBondCount(input); if (count.value == null) return count.error;
  const supply = unsigned(currentSupply);
  if (supply == null) return 'Current supply is unavailable. Refresh chain state.';
  const newSupply = supply + BigInt(count.value);
  if (newSupply > U64_MAX) return 'Total issued supply would exceed the on-chain integer limit.';
  const reserve = unsigned(unitReserveMinor);
  if (reserve != null && newSupply * reserve > U64_MAX) return 'The full reserve for this supply would exceed the on-chain integer limit. Issue fewer bonds.';
  return null;
}
