export type DisplayLanguage = 'en' | 'ru';
export type WallTimeIssue = 'invalid' | 'nonexistent' | 'ambiguous' | null;

export const TIME_ZONE_STORAGE_KEY = 'bondtrace.timeZone';
const wallPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const wallFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number[]>();
let volatilePreference: string | undefined;

export function isTimeZone(zone: string): boolean {
  // Preferences use IANA zones, not a fixed offset whose DST meaning changes.
  if (!zone || /^[+-]/.test(zone)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
}

export function browserTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : 'UTC';
  } catch { return 'UTC'; }
}

export function readTimeZonePreference(): string {
  if (volatilePreference !== undefined) return volatilePreference;
  try {
    const stored = globalThis.localStorage?.getItem(TIME_ZONE_STORAGE_KEY);
    return stored && (stored === 'auto' || isTimeZone(stored)) ? stored : 'auto';
  } catch { return 'auto'; }
}

/** Persist display only. Contract timestamps and signer permissions never change. */
export function setStoredTimeZonePreference(preference: string): string {
  const next = preference === 'auto' || isTimeZone(preference) ? preference : 'auto';
  volatilePreference = undefined;
  try {
    const storage = globalThis.localStorage;
    if (storage) storage.setItem(TIME_ZONE_STORAGE_KEY, next);
    else volatilePreference = next;
  } catch { volatilePreference = next; }
  return next;
}

export function getDisplayTimeZone(): string {
  const preference = readTimeZonePreference();
  return preference === 'auto' ? browserTimeZone() : preference;
}

const cityNames: Record<string, readonly [string, string]> = {
  UTC: ['UTC', 'UTC'],
  'Etc/UTC': ['UTC', 'UTC'],
  'Etc/GMT': ['UTC', 'UTC'],
  'Asia/Qyzylorda': ['Qyzylorda', 'Кызылорда'],
  'Asia/Almaty': ['Almaty', 'Алматы'],
  'Asia/Aqtobe': ['Aktobe', 'Актобе'],
  'Asia/Aqtau': ['Aktau', 'Актау'],
  'Asia/Atyrau': ['Atyrau', 'Атырау'],
  'Asia/Oral': ['Oral', 'Уральск'],
  'Europe/Moscow': ['Moscow', 'Москва'],
  'Europe/London': ['London', 'Лондон'],
  'Europe/Berlin': ['Berlin', 'Берлин'],
  'Europe/Paris': ['Paris', 'Париж'],
  'Europe/Istanbul': ['Istanbul', 'Стамбул'],
  'America/New_York': ['New York', 'Нью-Йорк'],
  'America/Los_Angeles': ['Los Angeles', 'Лос-Анджелес'],
  'Asia/Dubai': ['Dubai', 'Дубай'],
  'Asia/Singapore': ['Singapore', 'Сингапур'],
  'Asia/Tokyo': ['Tokyo', 'Токио'],
};

/** One readable group label; no offset repeated on every date. */
export function timeZoneLabel(zone: string, language: DisplayLanguage = 'en'): string {
  const named = cityNames[zone];
  if (named) return named[language === 'ru' ? 1 : 0];
  if (!isTimeZone(zone)) return 'UTC';
  if (zone.startsWith('Etc/')) {
    return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
      timeZone: zone, timeZoneName: 'longGeneric',
    }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value ?? zone;
  }
  return zone.split('/').at(-1)!.replaceAll('_', ' ');
}

function wallFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = wallFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, calendar: 'iso8601', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    wallFormatters.set(zone, formatter);
  }
  return formatter;
}

function wallParts(seconds: number, zone: string): number[] {
  const parts = wallFormatter(zone).formatToParts(new Date(seconds * 1000));
  return ['year', 'month', 'day', 'hour', 'minute', 'second'].map(type =>
    Number(parts.find(part => part.type === type)?.value));
}

function utcSeconds(parts: number[]): number {
  // setUTCFullYear avoids Date.UTC's special interpretation of years 00–99.
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(parts[3], parts[4], parts[5], 0);
  return date.getTime() / 1000;
}

function parseWall(local: string): { parts: number[]; naive: number } | null {
  const match = wallPattern.exec(local);
  if (!match) return null;
  const parts = match.slice(1).map(value => Number(value ?? 0));
  const [year, month, day, hour, minute, second] = parts;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const naive = utcSeconds(parts);
  const date = new Date(naive * 1000);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return { parts, naive };
}

export function zonedInput(seconds: number, zone: string): string {
  if (!Number.isSafeInteger(seconds) || !isTimeZone(zone) || !Number.isFinite(new Date(seconds * 1000).getTime())) return '';
  const [year, month, day, hour, minute, second] = wallParts(seconds, zone);
  if (year < 1 || year > 9999) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function matchingInstants(local: string, zone: string): number[] | null {
  const parsed = parseWall(local);
  if (!parsed || !isTimeZone(zone)) return null;
  const { parts, naive } = parsed;
  const key = `${zone}:${local.slice(0, 10)}`;
  let offsets = offsetCache.get(key);
  if (!offsets) {
    const found = new Set<number>();
    // Probe both sides of IANA transitions, including half-hour DST and skipped
    // civil days. Candidate offsets are then verified against the exact wall time.
    const dayStart = naive - parts[3] * 3600 - parts[4] * 60 - parts[5];
    for (let hours = -48; hours <= 48; hours += 3) {
      const probe = dayStart + hours * 3600;
      found.add(utcSeconds(wallParts(probe, zone)) - probe);
    }
    offsets = [...found];
    // A form can visit many dates; keep this small cache bounded.
    if (offsetCache.size >= 128) offsetCache.delete(offsetCache.keys().next().value!);
    offsetCache.set(key, offsets);
  }
  const matches = new Set<number>();
  for (const offset of offsets) {
    const candidate = naive - offset;
    if (wallParts(candidate, zone).every((value, index) => value === parts[index])) matches.add(candidate);
  }
  return [...matches];
}

export function wallTimeIssue(local: string, zone: string): WallTimeIssue {
  const matches = matchingInstants(local, zone);
  if (matches == null) return 'invalid';
  if (matches.length === 0) return 'nonexistent';
  return matches.length === 1 ? null : 'ambiguous';
}

/** Never silently shift a gap forward or choose one side of a DST fold. */
export function zonedSeconds(local: string, zone: string): number | null {
  const matches = matchingInstants(local, zone);
  return matches?.length === 1 ? matches[0] : null;
}

export function dateParts(value: string | undefined, zone: string = getDisplayTimeZone(), language: DisplayLanguage = 'en'): { date: string; time: string } {
  const parsed = value ? new Date(value) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || !isTimeZone(zone)) {
    return { date: language === 'ru' ? 'Дата не указана' : 'Not scheduled', time: '' };
  }
  const locale = language === 'ru' ? 'ru-RU' : 'en-GB';
  return {
    date: new Intl.DateTimeFormat(locale, { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' }).format(parsed),
    time: new Intl.DateTimeFormat(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(parsed),
  };
}
