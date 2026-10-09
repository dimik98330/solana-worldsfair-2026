import { wallTimeIssue, zonedSeconds } from './time-zone';

export interface LocalDateTimeParts {
  date: Date;
  hour: string;
  minute: string;
  /** Existing seconds stay exact without introducing another editing segment. */
  seconds: string;
}

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2})?$/;
const pad = (value: number) => String(value).padStart(2, '0');

/** Accept ordinary single-digit typing without silently clamping an invalid time. */
export function normalizeTimeSegment(value: string, maximum: number): string | null {
  return /^\d{1,2}$/.test(value) && Number(value) <= maximum ? value.padStart(2, '0') : null;
}

/** Parse browser-local fields; UTC conversion would change the selected calendar day. */
export function readLocalDateTime(value: string, timeZone?: string, allowAmbiguous = false): LocalDateTimeParts | null {
  const match = localDateTimePattern.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, seconds = ''] = match;
  const result = timeZone ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(seconds.slice(1) || '0'))) : new Date(value);
  const prefix = timeZone ? 'getUTC' : 'get';
  if (!Number.isFinite(result.getTime()) || result[`${prefix}FullYear`]() !== Number(year)
    || result[`${prefix}Month`]() + 1 !== Number(month) || result[`${prefix}Date`]() !== Number(day)
    || result[`${prefix}Hours`]() !== Number(hour) || result[`${prefix}Minutes`]() !== Number(minute)
    || result[`${prefix}Seconds`]() !== Number(seconds.slice(1) || '0')) return null;
  if (timeZone) {
    const issue = wallTimeIssue(value, timeZone);
    if (issue && !(allowAmbiguous && issue === 'ambiguous')) return null;
  }
  // Noon keeps the calendar date independent of midnight daylight-saving changes.
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  return { date, hour, minute, seconds };
}

export function writeLocalDateTime(date: Date | undefined, hour: string, minute: string, seconds = '', timeZone?: string, allowAmbiguous = false): string | null {
  if (!date || !Number.isFinite(date.getTime()) || !/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)
    || Number(hour) > 23 || Number(minute) > 59 || (seconds && !/^:[0-5]\d$/.test(seconds))) return null;
  const value = `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${hour}:${minute}${seconds}`;
  // A nonexistent local time during a DST transition is rejected rather than shifted.
  return readLocalDateTime(value, timeZone, allowAmbiguous) ? value : null;
}

export function localDateTimeOutOfBounds(value: string, minimum?: string, maximum?: string, timeZone?: string): 'min' | 'max' | null {
  if (!readLocalDateTime(value, timeZone)) return null;
  const timestamp = timeZone ? zonedSeconds(value, timeZone) : new Date(value).getTime();
  const min = minimum && readLocalDateTime(minimum, timeZone) ? timeZone ? zonedSeconds(minimum, timeZone) : new Date(minimum).getTime() : null;
  const max = maximum && readLocalDateTime(maximum, timeZone) ? timeZone ? zonedSeconds(maximum, timeZone) : new Date(maximum).getTime() : null;
  if (timestamp != null && min != null && timestamp < min) return 'min';
  if (timestamp != null && max != null && timestamp > max) return 'max';
  return null;
}
