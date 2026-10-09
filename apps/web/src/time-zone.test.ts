import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  TIME_ZONE_STORAGE_KEY, browserTimeZone, dateParts, getDisplayTimeZone,
  isTimeZone, readTimeZonePreference, setStoredTimeZonePreference,
  timeZoneLabel, wallTimeIssue, zonedInput, zonedSeconds,
} from './time-zone';

const instant = Math.floor(Date.parse('2026-10-08T23:14:37Z') / 1000);

test('display zone changes the wall clock while preserving the exact UTC instant', () => {
  for (const [zone, expected] of [
    ['UTC', '2026-10-08T23:14:37'],
    ['Asia/Qyzylorda', '2026-10-09T04:14:37'],
    ['America/New_York', '2026-10-08T19:14:37'],
    ['Asia/Kathmandu', '2026-10-09T04:59:37'],
    ['Pacific/Chatham', '2026-10-09T12:59:37'],
  ]) {
    assert.equal(zonedInput(instant, zone), expected, zone);
    assert.equal(zonedSeconds(expected, zone), instant, zone);
  }
  assert.equal(zonedSeconds('2026-10-09T04:14', 'Asia/Qyzylorda'), instant - 37);
});

test('nonexistent and repeated DST wall times are rejected instead of shifted or guessed', () => {
  assert.equal(wallTimeIssue('2026-03-08T02:30:00', 'America/New_York'), 'nonexistent');
  assert.equal(zonedSeconds('2026-03-08T02:30:00', 'America/New_York'), null);
  assert.equal(wallTimeIssue('2026-11-01T01:30:37', 'America/New_York'), 'ambiguous');
  assert.equal(zonedSeconds('2026-11-01T01:30:37', 'America/New_York'), null);
  assert.equal(wallTimeIssue('2026-11-01T02:30:37', 'America/New_York'), null);
  assert.equal(zonedSeconds('2026-11-01T02:30:37', 'America/New_York'), Date.parse('2026-11-01T07:30:37Z') / 1000);
  // A fold's two real UTC instants display identically; editing must not pick one.
  assert.equal(zonedInput(Date.parse('2026-11-01T05:30:37Z') / 1000, 'America/New_York'), '2026-11-01T01:30:37');
  assert.equal(zonedInput(Date.parse('2026-11-01T06:30:37Z') / 1000, 'America/New_York'), '2026-11-01T01:30:37');
});

test('conversion also detects half-hour DST and an IANA skipped civil day', () => {
  assert.equal(wallTimeIssue('2026-04-05T01:45:00', 'Australia/Lord_Howe'), 'ambiguous');
  assert.equal(wallTimeIssue('2026-10-04T02:15:00', 'Australia/Lord_Howe'), 'nonexistent');
  assert.equal(wallTimeIssue('2011-12-30T12:00:00', 'Pacific/Apia'), 'nonexistent');
});

test('malformed dates, impossible calendar dates and invalid zones fail closed', () => {
  for (const value of ['', '2026-02-29T12:00', '2026-13-01T12:00', '2026-10-08T24:00', '2026-10-08T12:60', '2026-10-08T12:00:60', '2026-10-08T12:00Z']) {
    assert.equal(zonedSeconds(value, 'UTC'), null, value);
    assert.equal(wallTimeIssue(value, 'UTC'), 'invalid', value);
  }
  assert.equal(zonedSeconds('2026-10-08T12:00', 'Not/AZone'), null);
  assert.equal(isTimeZone('auto'), false);
  assert.equal(isTimeZone('+05:00'), false);
  assert.equal(zonedInput(NaN, 'UTC'), '');
  assert.equal(zonedInput(1.5, 'UTC'), '');
  assert.equal(zonedInput(instant, 'Not/AZone'), '');
  assert.equal(zonedSeconds('0099-10-08T12:00:37', 'UTC'), Date.parse('0099-10-08T12:00:37Z') / 1000);
});

test('grouped display has stable date and time lines, exact seconds, and no repeated offset', () => {
  const before = '2026-10-08T23:14:37Z';
  const after = '2026-10-08T23:14:42Z';
  assert.deepEqual(dateParts(before, 'Asia/Qyzylorda', 'en'), { date: '9 October 2026', time: '04:14:37' });
  assert.deepEqual(dateParts(after, 'Asia/Qyzylorda', 'en'), { date: '9 October 2026', time: '04:14:42' });
  assert.deepEqual(dateParts(before, 'UTC', 'ru'), { date: '8 октября 2026 г.', time: '23:14:37' });
  assert.equal(timeZoneLabel('Asia/Qyzylorda', 'ru'), 'Кызылорда');
  assert.equal(timeZoneLabel('America/New_York', 'en'), 'New York');
  assert.deepEqual(dateParts(undefined, 'UTC', 'en'), { date: 'Not scheduled', time: '' });
});

test('auto follows the browser zone regardless of which locale is selected', () => {
  const moduleUrl = new URL('./time-zone.ts', import.meta.url).href;
  for (const zone of ['UTC', 'Asia/Qyzylorda', 'America/New_York']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
      `import {browserTimeZone,getDisplayTimeZone,zonedInput} from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify([browserTimeZone(),getDisplayTimeZone(),zonedInput(${instant},getDisplayTimeZone())]));`],
    { cwd: process.cwd(), env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const [browser, resolved, wall] = JSON.parse(result.stdout) as string[];
    assert.equal(browser, zone);
    assert.equal(resolved, zone);
    assert.equal(wall, zonedInput(instant, zone));
  }
});

test('explicit preference persists, auto restores browser detection, invalid stored values are ignored', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  try {
    assert.equal(readTimeZonePreference(), 'auto');
    assert.equal(setStoredTimeZonePreference('Europe/London'), 'Europe/London');
    assert.equal(values.get(TIME_ZONE_STORAGE_KEY), 'Europe/London');
    assert.equal(getDisplayTimeZone(), 'Europe/London');
    assert.equal(setStoredTimeZonePreference('auto'), 'auto');
    assert.equal(getDisplayTimeZone(), browserTimeZone());
    values.set(TIME_ZONE_STORAGE_KEY, 'Not/AZone');
    assert.equal(readTimeZonePreference(), 'auto');
    assert.equal(setStoredTimeZonePreference('Not/AZone'), 'auto');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('blocked storage still applies a preference consistently for this session', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage blocked'); } });
  try {
    assert.equal(setStoredTimeZonePreference('Asia/Tokyo'), 'Asia/Tokyo');
    assert.equal(readTimeZonePreference(), 'Asia/Tokyo');
    assert.equal(getDisplayTimeZone(), 'Asia/Tokyo');
    setStoredTimeZonePreference('auto');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
