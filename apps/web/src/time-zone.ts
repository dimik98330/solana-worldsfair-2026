export type DisplayLanguage = 'en' | 'ru' | 'kk';
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

const cityNames: Record<string, readonly [string, string, string]> = {
  UTC: ['UTC', 'UTC', 'UTC'],
  'Etc/UTC': ['UTC', 'UTC', 'UTC'],
  'Etc/GMT': ['UTC', 'UTC', 'UTC'],
  'Asia/Qyzylorda': ['Qyzylorda', 'Кызылорда', 'Қызылорда'],
  'Asia/Almaty': ['Almaty', 'Алматы', 'Алматы'],
  'Asia/Qostanay': ['Kostanay', 'Костанай', 'Қостанай'],
  'Asia/Aqtobe': ['Aktobe', 'Актобе', 'Ақтөбе'],
  'Asia/Aqtau': ['Aktau', 'Актау', 'Ақтау'],
  'Asia/Atyrau': ['Atyrau', 'Атырау', 'Атырау'],
  'Asia/Oral': ['Oral', 'Уральск', 'Орал'],
  'Europe/Moscow': ['Moscow', 'Москва', 'Мәскеу'],
  'Europe/London': ['London', 'Лондон', 'Лондон'],
  'Europe/Berlin': ['Berlin', 'Берлин', 'Берлин'],
  'Europe/Paris': ['Paris', 'Париж', 'Париж'],
  'Europe/Istanbul': ['Istanbul', 'Стамбул', 'Ыстанбұл'],
  'Europe/Rome': ['Rome', 'Рим', 'Рим'],
  'Europe/Madrid': ['Madrid', 'Мадрид', 'Мадрид'],
  'Europe/Amsterdam': ['Amsterdam', 'Амстердам', 'Амстердам'],
  'Europe/Zurich': ['Zurich', 'Цюрих', 'Цюрих'],
  'Europe/Vienna': ['Vienna', 'Вена', 'Вена'],
  'Europe/Warsaw': ['Warsaw', 'Варшава', 'Варшава'],
  'Europe/Prague': ['Prague', 'Прага', 'Прага'],
  'Europe/Helsinki': ['Helsinki', 'Хельсинки', 'Хельсинки'],
  'Europe/Athens': ['Athens', 'Афины', 'Афина'],
  'Europe/Kyiv': ['Kyiv', 'Киев', 'Киев'],
  'Europe/Kiev': ['Kyiv', 'Киев', 'Киев'],
  'Europe/Lisbon': ['Lisbon', 'Лиссабон', 'Лиссабон'],
  'Asia/Tashkent': ['Tashkent', 'Ташкент', 'Ташкент'],
  'Asia/Bishkek': ['Bishkek', 'Бишкек', 'Бішкек'],
  'Asia/Dushanbe': ['Dushanbe', 'Душанбе', 'Душанбе'],
  'Asia/Baku': ['Baku', 'Баку', 'Баку'],
  'Asia/Tbilisi': ['Tbilisi', 'Тбилиси', 'Тбилиси'],
  'Asia/Yerevan': ['Yerevan', 'Ереван', 'Ереван'],
  'Asia/Dubai': ['Dubai', 'Дубай', 'Дубай'],
  'Asia/Riyadh': ['Riyadh', 'Эр-Рияд', 'Эр-Рияд'],
  'Asia/Kolkata': ['Kolkata', 'Калькутта', 'Калькутта'],
  'Asia/Calcutta': ['Kolkata', 'Калькутта', 'Калькутта'],
  'Asia/Kathmandu': ['Kathmandu', 'Катманду', 'Катманду'],
  'Asia/Katmandu': ['Kathmandu', 'Катманду', 'Катманду'],
  'Asia/Shanghai': ['Shanghai', 'Шанхай', 'Шанхай'],
  'Asia/Hong_Kong': ['Hong Kong', 'Гонконг', 'Гонконг'],
  'Asia/Singapore': ['Singapore', 'Сингапур', 'Сингапур'],
  'Asia/Bangkok': ['Bangkok', 'Бангкок', 'Бангкок'],
  'Asia/Jakarta': ['Jakarta', 'Джакарта', 'Джакарта'],
  'Asia/Seoul': ['Seoul', 'Сеул', 'Сеул'],
  'Asia/Tokyo': ['Tokyo', 'Токио', 'Токио'],
  'America/New_York': ['New York', 'Нью-Йорк', 'Нью-Йорк'],
  'America/Los_Angeles': ['Los Angeles', 'Лос-Анджелес', 'Лос-Анджелес'],
  'America/Chicago': ['Chicago', 'Чикаго', 'Чикаго'],
  'America/Denver': ['Denver', 'Денвер', 'Денвер'],
  'America/Toronto': ['Toronto', 'Торонто', 'Торонто'],
  'America/Vancouver': ['Vancouver', 'Ванкувер', 'Ванкувер'],
  'America/Mexico_City': ['Mexico City', 'Мехико', 'Мехико'],
  'America/Sao_Paulo': ['São Paulo', 'Сан-Паулу', 'Сан-Паулу'],
  'America/Argentina/Buenos_Aires': ['Buenos Aires', 'Буэнос-Айрес', 'Буэнос-Айрес'],
  'America/Buenos_Aires': ['Buenos Aires', 'Буэнос-Айрес', 'Буэнос-Айрес'],
  'Pacific/Honolulu': ['Honolulu', 'Гонолулу', 'Гонолулу'],
  'Pacific/Auckland': ['Auckland', 'Окленд', 'Окленд'],
  'Pacific/Chatham': ['Chatham Islands', 'Острова Чатем', 'Чатем аралдары'],
  'Australia/Sydney': ['Sydney', 'Сидней', 'Сидней'],
  'Australia/Melbourne': ['Melbourne', 'Мельбурн', 'Мельбурн'],
  'Australia/Adelaide': ['Adelaide', 'Аделаида', 'Аделаида'],
  'Australia/Perth': ['Perth', 'Перт', 'Перт'],
  'Australia/Lord_Howe': ['Lord Howe Island', 'Остров Лорд-Хау', 'Лорд-Хау аралы'],
  'Africa/Cairo': ['Cairo', 'Каир', 'Каир'],
  'Africa/Johannesburg': ['Johannesburg', 'Йоханнесбург', 'Йоханнесбург'],
  'Africa/Nairobi': ['Nairobi', 'Найроби', 'Найроби'],
};

/** One readable group label; no offset repeated on every date. */
export function timeZoneLabel(zone: string, language: DisplayLanguage = 'en'): string {
  const named = cityNames[zone];
  if (named) return named[language === 'ru' ? 1 : language === 'kk' ? 2 : 0];
  if (!isTimeZone(zone)) return 'UTC';
  if (zone.startsWith('Etc/')) {
    return new Intl.DateTimeFormat(displayLocale(language), {
      timeZone: zone, timeZoneName: 'longGeneric',
    }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value ?? zone;
  }
  return zone.split('/').at(-1)!.replaceAll('_', ' ');
}

function displayLocale(language: DisplayLanguage): string {
  return language === 'ru' ? 'ru-RU' : language === 'kk' ? 'kk-KZ' : 'en-GB';
}

const kazakhMonths = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'] as const;

/** Chromium may accept kk-KZ yet omit its month names from bundled ICU. */
export function kazakhDateLabel(year: number, month: number, day: number): string {
  return `${day} ${kazakhMonths[month - 1]} ${year} ж.`;
}

/** Calendar dates already contain the selected wall day; do not reapply a zone. */
export function kazakhCalendarMonthLabel(date: Date): string {
  return `${kazakhMonths[date.getMonth()]} ${date.getFullYear()}`;
}

/** Offset at the displayed instant, including seasonal and fractional changes. */
export function timeZoneOffsetMinutes(zone: string, instant: Date = new Date()): number {
  const seconds = Math.floor(instant.getTime() / 1000);
  if (!isTimeZone(zone) || !Number.isFinite(seconds)) return 0;
  return (utcSeconds(wallParts(seconds, zone)) - seconds) / 60;
}

export function gmtOffsetLabel(minutes: number): string {
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `GMT${minutes < 0 ? '−' : '+'}${hours}${remainder ? `:${String(remainder).padStart(2, '0')}` : ''}`;
}

export function timeZoneOptionLabel(zone: string, language: DisplayLanguage = 'en', instant: Date = new Date()): string {
  const offset = gmtOffsetLabel(timeZoneOffsetMinutes(zone, instant));
  const city = timeZoneLabel(zone, language);
  return city === 'UTC' || zone.startsWith('Etc/') ? offset : `${city} · ${offset}`;
}

/** Preserve IANA identities; group cities by offset at the previewed date. */
export function timeZoneOptionGroups(zones: readonly string[], language: DisplayLanguage, instant: Date) {
  const grouped = new Map<number, { zone: string; label: string }[]>();
  for (const zone of new Set(zones)) {
    if (!isTimeZone(zone)) continue;
    const minutes = timeZoneOffsetMinutes(zone, instant);
    const options = grouped.get(minutes) ?? [];
    options.push({ zone, label: timeZoneOptionLabel(zone, language, instant) });
    grouped.set(minutes, options);
  }
  return [...grouped].sort(([a], [b]) => a - b).map(([minutes, options]) => ({
    label: gmtOffsetLabel(minutes),
    options: options.sort((a, b) => a.label.localeCompare(b.label, displayLocale(language)) || a.zone.localeCompare(b.zone)),
  }));
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
    return { date: language === 'ru' ? 'Дата не указана' : language === 'kk' ? 'Күні белгіленбеген' : 'Not scheduled', time: '' };
  }
  const locale = displayLocale(language);
  const [year, month, day] = language === 'kk' ? wallParts(Math.floor(parsed.getTime() / 1000), zone) : [];
  return {
    date: language === 'kk' ? kazakhDateLabel(year, month, day) : new Intl.DateTimeFormat(locale, { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' }).format(parsed),
    time: new Intl.DateTimeFormat(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(parsed),
  };
}
