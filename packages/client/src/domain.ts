export const SETTLEMENT_SCALE = 1_000_000n;
export const MAX_U64 = (1n << 64n) - 1n;
export function uint(value: unknown, name = 'amount'): bigint {
  if ((typeof value !== 'string' && typeof value !== 'bigint') || !/^\d+$/.test(String(value))) throw new Error(`${name} must be an unsigned integer string`);
  const parsed = BigInt(value); if (parsed > MAX_U64) throw new Error(`${name} exceeds u64`); return parsed;
}
export function couponPerBond(faceMinor: bigint, annualRateBps: number, frequency: number): bigint {
  if (faceMinor <= 0n || faceMinor > MAX_U64 || !Number.isSafeInteger(annualRateBps) || annualRateBps < 1 || annualRateBps > 10_000 || !Number.isSafeInteger(frequency) || frequency < 1 || frequency > 12) throw new Error('Invalid coupon terms');
  const numerator = faceMinor * BigInt(annualRateBps), denominator = 10_000n * BigInt(frequency);
  if (numerator % denominator !== 0n) throw new Error('Coupon requires sub-unit rounding; choose exactly representable terms');
  const amount = numerator / denominator; if (amount < 1n || amount > MAX_U64) throw new Error('Coupon outside supported bounds'); return amount;
}
export function entitlement(unitAmount: bigint, units: bigint): bigint {
  if (unitAmount < 0n || units < 0n) throw new Error('Negative entitlement');
  const value = unitAmount * units; if (value > MAX_U64) throw new Error('Entitlement overflow'); return value;
}
export function hasClaim(mask: number, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= 16) throw new Error('Holder index outside registry');
  return (mask & (1 << index)) !== 0;
}
