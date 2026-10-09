import type { IssueDraft } from './issuer-validation';
import { zonedInput, zonedSeconds } from './time-zone';

export interface DraftInstant { local: string; seconds: number }
export type DraftInstants = Record<string, DraftInstant>;
export interface IssuerDraftSnapshot {
  version: 1;
  draft: IssueDraft;
  timeZone: string;
  instants: DraftInstants;
  step: number;
  testDates: boolean;
  pendingCreation?: { seriesId: string; issuer: string };
}

export const issuerDraftKey = (network: string, wallet?: string) => `bondtrace.issue-draft.v1:${network}:${wallet || 'unassigned'}`;

export function draftHasInput(draft: IssueDraft): boolean {
  return Boolean(draft.name || draft.faceValue || draft.maturityLocal || draft.coupons.some(coupon => coupon.amount || coupon.recordLocal || coupon.paymentLocal));
}

function scheduleValues(draft: IssueDraft): [string, string][] {
  return [['maturityLocal', draft.maturityLocal], ...draft.coupons.flatMap(coupon => [
    [`coupon.${coupon.key}.recordLocal`, coupon.recordLocal],
    [`coupon.${coupon.key}.paymentLocal`, coupon.paymentLocal],
  ] as [string, string][])];
}

/** Only a matching display value may reuse a previously selected absolute instant. */
export function resolveDraftSeconds(local: string, timeZone: string, retained?: DraftInstant): number | null {
  if (retained?.local === local && Number.isSafeInteger(retained.seconds) && retained.seconds > 0
    && zonedInput(retained.seconds, timeZone) === (local.length === 16 ? `${local}:00` : local)) return retained.seconds;
  return zonedSeconds(local, timeZone);
}

export function captureDraftInstants(draft: IssueDraft, timeZone: string, retained: DraftInstants = {}): DraftInstants {
  const instants: DraftInstants = {};
  for (const [key, local] of scheduleValues(draft)) {
    const seconds = resolveDraftSeconds(local, timeZone, retained[key]);
    if (seconds !== null && seconds > 0) instants[key] = { local, seconds };
  }
  return instants;
}

/** Reformat valid dates, preserving UTC seconds; keep incomplete edits untouched. */
export function rebaseDraft(snapshot: IssuerDraftSnapshot, timeZone: string): IssuerDraftSnapshot {
  const source = captureDraftInstants(snapshot.draft, snapshot.timeZone, snapshot.instants);
  const instants: DraftInstants = {};
  function convert(key: string, local: string): string {
    const saved = source[key];
    if (!saved) return local;
    const next = zonedInput(saved.seconds, timeZone);
    instants[key] = { local: next, seconds: saved.seconds };
    return next;
  }
  return { ...snapshot, timeZone, instants, draft: { ...snapshot.draft,
    maturityLocal: convert('maturityLocal', snapshot.draft.maturityLocal),
    coupons: snapshot.draft.coupons.map(coupon => ({ ...coupon,
      recordLocal: convert(`coupon.${coupon.key}.recordLocal`, coupon.recordLocal),
      paymentLocal: convert(`coupon.${coupon.key}.paymentLocal`, coupon.paymentLocal),
    })),
  } };
}

/** Saved browser input is untrusted: restore only this version and bounded field shapes. */
export function parseIssuerDraft(value: string | null): IssuerDraftSnapshot | null {
  if (!value || value.length > 32_768) return null;
  try {
    const parsed = JSON.parse(value) as IssuerDraftSnapshot;
    const draft = parsed?.draft;
    if (parsed.version !== 1 || typeof parsed.timeZone !== 'string' || !draft || !Array.isArray(draft.coupons)
      || draft.coupons.length < 1 || draft.coupons.length > 8 || !Number.isInteger(parsed.step) || parsed.step < 0 || parsed.step > 2
      || !['seriesId', 'name', 'settlementMint', 'faceValue', 'maturityLocal'].every(key => typeof draft[key as keyof IssueDraft] === 'string')
      || !draft.coupons.every(coupon => coupon && ['key', 'recordLocal', 'paymentLocal', 'amount'].every(key => typeof coupon[key as keyof typeof coupon] === 'string'))
      || new Set(draft.coupons.map(coupon => coupon.key)).size !== draft.coupons.length) return null;
    new Intl.DateTimeFormat('en', { timeZone: parsed.timeZone });
    const pending = parsed.pendingCreation;
    if (pending && (typeof pending.seriesId !== 'string' || typeof pending.issuer !== 'string' || pending.seriesId !== draft.seriesId)) return null;
    return { version: 1, draft, timeZone: parsed.timeZone, step: parsed.step, testDates: Boolean(parsed.testDates),
      instants: captureDraftInstants(draft, parsed.timeZone, parsed.instants || {}), ...(pending ? { pendingCreation: pending } : {}) };
  } catch { return null; }
}
