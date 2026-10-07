/** Contract money is integer minor units (6 decimals), never a JS floating point balance. */
export function integer(value: string | number | bigint | null | undefined): bigint | null {
  if (value == null || !/^-?\d+$/.test(String(value))) return null;
  try { return BigInt(value); } catch { return null; }
}
export function rawAmount(value: string | null | undefined, decimals = 6): string {
  const n = integer(value);
  if (n == null) return '';
  const negative = n < 0n;
  const padded = (negative ? -n : n).toString().padStart(decimals + 1, '0');
  const whole = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? `.${padded.slice(-decimals)}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}
export function amount(value: string | null | undefined, decimals = 6): string {
  const raw = rawAmount(value, decimals);
  if (!raw) return '--';
  const [whole, fraction] = raw.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction == null ? '' : `.${fraction}`}`;
}
export function units(value: string | number | bigint | null | undefined): string {
  const n = integer(value);
  return n == null ? '--' : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function add(values: (string | undefined)[]): string | undefined {
  let total = 0n;
  for (const value of values) { const n = integer(value); if (n == null) return undefined; total += n; }
  return total.toString();
}
export function subtract(a?: string, b?: string): string | undefined {
  const first = integer(a), second = integer(b);
  return first == null || second == null ? undefined : (first - second).toString();
}
export function multiply(a?: string, b?: string): string | undefined {
  const first = integer(a), second = integer(b);
  return first == null || second == null ? undefined : (first * second).toString();
}
export function decimalInput(value: string): string | null {
  if (!/^\d+(\.\d{1,6})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
}
export function percentage(numerator?: string, denominator?: string): number {
  const n = integer(numerator), d = integer(denominator);
  if (n == null || d == null || d <= 0n) return 0;
  return Math.max(0, Math.min(100, Number(n * 10_000n / d) / 100));
}
export function rate(bps?: number): string {
  if (bps == null || !Number.isSafeInteger(bps)) return '--';
  return `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}
export function shortAddress(value?: string, chars = 5): string {
  if (!value) return 'Not available';
  return value.length <= chars * 2 + 3 ? value : `${value.slice(0, chars)}…${value.slice(-chars)}`;
}
export function date(value?: string, withTime = false): string {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' } : {}) }).format(parsed);
}
export function safeExplorer(url?: string): string | undefined {
  if (!url) return undefined;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'explorer.solana.com' ? parsed.href : undefined; } catch { return undefined; }
}
