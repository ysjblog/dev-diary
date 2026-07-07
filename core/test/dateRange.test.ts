import { describe, it, expect } from 'vitest';
import { resolveRange, addDays, daysBetween, expandDates, RangeValidationError } from '../src/domain/dateRange.js';

const TODAY = '2026-06-28';

describe('resolveRange', () => {
  it('all-time returns null bounds', () => {
    expect(resolveRange('all', TODAY)).toEqual({ range_key: 'all', start_date: null, end_date: null });
  });

  it('24h is the single anchor day', () => {
    expect(resolveRange('24h', TODAY)).toEqual({ range_key: '24h', start_date: TODAY, end_date: TODAY });
  });

  it('7d spans the last 7 inclusive days', () => {
    expect(resolveRange('7d', TODAY)).toEqual({ range_key: '7d', start_date: '2026-06-22', end_date: TODAY });
  });

  it('1m spans the last 30 inclusive days', () => {
    expect(resolveRange('1m', TODAY)).toEqual({ range_key: '1m', start_date: '2026-05-30', end_date: TODAY });
  });

  it('custom passes valid dates through', () => {
    expect(resolveRange('custom', TODAY, '2026-06-01', '2026-06-10')).toEqual({
      range_key: 'custom',
      start_date: '2026-06-01',
      end_date: '2026-06-10',
    });
  });

  it('custom corrects reversed start/end (spec §10)', () => {
    expect(resolveRange('custom', TODAY, '2026-06-10', '2026-06-01')).toEqual({
      range_key: 'custom',
      start_date: '2026-06-01',
      end_date: '2026-06-10',
    });
  });

  it('custom without both dates throws', () => {
    expect(() => resolveRange('custom', TODAY, '2026-06-01', null)).toThrow(RangeValidationError);
  });

  it('rejects malformed dates', () => {
    expect(() => resolveRange('custom', TODAY, '2026/06/01', '2026-06-10')).toThrow(RangeValidationError);
  });

  it('rejects non-existent calendar dates', () => {
    expect(() => resolveRange('custom', TODAY, '2026-02-31', '2026-03-10')).toThrow(RangeValidationError);
  });
});

describe('date helpers', () => {
  it('addDays handles month/year wrap', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('daysBetween is inclusive-end minus start', () => {
    expect(daysBetween('2026-06-01', '2026-06-10')).toBe(9);
  });
  it('expandDates lists every inclusive day', () => {
    expect(expandDates('2026-06-01', '2026-06-03')).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });
});
