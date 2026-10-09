import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { localDateTimeOutOfBounds, normalizeTimeSegment, readLocalDateTime, writeLocalDateTime } from './date-time-value';

test('typed time segments accept ordinary digits but never clamp, round, or coerce invalid input', () => {
  assert.equal(normalizeTimeSegment('9', 23), '09');
  assert.equal(normalizeTimeSegment('0', 59), '00');
  assert.equal(normalizeTimeSegment('23', 23), '23');
  assert.equal(normalizeTimeSegment('59', 59), '59');
  for (const value of ['', '24', '-1', '1.5', ' 9', '009', '1e1', 'a']) assert.equal(normalizeTimeSegment(value, 23), null, value);
  assert.equal(normalizeTimeSegment('60', 59), null);
});

test('calendar selection round-trips local day at the start and end of a day without a UTC shift', () => {
  for (const value of ['2026-10-09T00:01', '2026-12-31T23:59', '2028-02-29T08:35']) {
    const parts = readLocalDateTime(value);
    assert.ok(parts);
    assert.equal(writeLocalDateTime(parts.date, parts.hour, parts.minute, parts.seconds), value);
    assert.equal(parts.date.getHours(), 12);
  }
});

test('an existing timestamp preserves seconds while date and minute are changed', () => {
  const parts = readLocalDateTime('2026-10-09T16:25:37');
  assert.ok(parts);
  assert.equal(writeLocalDateTime(parts.date, parts.hour, parts.minute, parts.seconds), '2026-10-09T16:25:37');
  parts.date.setDate(10);
  assert.equal(writeLocalDateTime(parts.date, '18', '45', parts.seconds), '2026-10-10T18:45:37');
});

test('impossible dates, malformed values and times are rejected rather than normalized', () => {
  for (const value of ['', '2026-02-30T12:30', '2026-13-01T12:30', '2026-10-09T24:00', '2026-10-09T12:60', '2026-10-09T12:30:60', '2026-10-09T12:30Z']) {
    assert.equal(readLocalDateTime(value), null, value);
  }
  assert.equal(writeLocalDateTime(undefined, '10', '30'), null);
  assert.equal(writeLocalDateTime(new Date(2026, 9, 9), '99', '30'), null);
});

test('optional limits compare actual local timestamps including seconds and allow the boundaries', () => {
  const min = '2026-10-09T12:30:37', max = '2026-10-09T13:00';
  assert.equal(localDateTimeOutOfBounds('2026-10-09T12:30', min, max), 'min');
  assert.equal(localDateTimeOutOfBounds(min, min, max), null);
  assert.equal(localDateTimeOutOfBounds(max, min, max), null);
  assert.equal(localDateTimeOutOfBounds('2026-10-09T13:00:01', min, max), 'max');
});

test('selected-zone calendar validates that zone rather than the browser, including DST gaps and folds', () => {
  const value = '2026-03-08T02:30:37';
  assert.ok(readLocalDateTime(value, 'Asia/Qyzylorda'));
  assert.equal(readLocalDateTime(value, 'America/New_York'), null);
  assert.equal(readLocalDateTime('2026-11-01T01:30:37', 'America/New_York'), null);
  const known = readLocalDateTime('2026-11-01T01:30:37', 'America/New_York', true);
  assert.ok(known);
  assert.equal(writeLocalDateTime(known.date, known.hour, known.minute, known.seconds, 'America/New_York'), null);
  assert.equal(writeLocalDateTime(known.date, known.hour, known.minute, known.seconds, 'America/New_York', true), '2026-11-01T01:30:37');
});

test('local dates remain exact east and west of UTC and nonexistent daylight-saving time is rejected', () => {
  const moduleUrl = new URL('./date-time-value.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { readLocalDateTime, writeLocalDateTime } from ${JSON.stringify(moduleUrl)};
    for (const value of ['2026-10-09T00:01:37', '2026-12-31T23:59:59']) {
      const parts = readLocalDateTime(value);
      assert.ok(parts);
      assert.equal(writeLocalDateTime(parts.date, parts.hour, parts.minute, parts.seconds), value);
    }
    if (process.env.TZ === 'America/New_York') {
      assert.equal(readLocalDateTime('2026-03-08T02:30'), null);
      assert.ok(readLocalDateTime('2026-03-08T03:30'));
    }
  `;
  for (const zone of ['Asia/Qyzylorda', 'Pacific/Kiritimati', 'America/New_York']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 15000, windowsHide: true,
    });
    assert.equal(result.status, 0, `${zone}: ${result.stderr || result.error?.message}`);
  }
});
