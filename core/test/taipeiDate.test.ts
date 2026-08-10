import { describe, expect, it } from 'vitest';
import { sqliteTaipeiDate, sqliteTaipeiHour, taipeiDate } from '../src/services/taipeiDate.js';

describe('Asia/Taipei calendar projection helpers', () => {
  it('projects UTC instants immediately around Taipei midnight', () => {
    expect(taipeiDate(new Date('2026-06-30T15:59:59.000Z'))).toBe('2026-06-30');
    expect(taipeiDate(new Date('2026-06-30T16:00:00.000Z'))).toBe('2026-07-01');
    expect(taipeiDate(new Date('2026-06-30T17:30:00.000Z'))).toBe('2026-07-01');
  });

  it('renders only simple or qualified SQLite identifiers', () => {
    expect(sqliteTaipeiDate('start_time')).toBe("date(start_time, '+8 hours')");
    expect(sqliteTaipeiDate('s.start_time')).toBe("date(s.start_time, '+8 hours')");
    expect(sqliteTaipeiHour('sessions.start_time')).toBe("strftime('%H', sessions.start_time, '+8 hours')");

    for (const invalid of [
      '1start_time',
      '.start_time',
      's..start_time',
      's.start_time.',
      's start_time',
      'start_time)',
      'start_time, id',
      'start_time --',
      'date(start_time)',
      '"start_time"',
      '',
    ]) {
      expect(() => sqliteTaipeiDate(invalid), invalid).toThrow(/qualified SQLite identifier/i);
      expect(() => sqliteTaipeiHour(invalid), invalid).toThrow(/qualified SQLite identifier/i);
    }
  });
});
