import type { RangeKey } from './types.js';

export class RangeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RangeValidationError';
  }
}

export interface ResolvedRange {
  range_key: RangeKey;
  /** Inclusive YYYY-MM-DD, or null for all-time. */
  start_date: string | null;
  end_date: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a YYYY-MM-DD string into a UTC-midnight epoch-day count. Throws on invalid. */
function toEpochDay(date: string): number {
  if (!ISO_DATE.test(date)) {
    throw new RangeValidationError(`Invalid date format (expected YYYY-MM-DD): ${date}`);
  }
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new RangeValidationError(`Invalid calendar date: ${date}`);
  }
  // Reject normalization drift (e.g. 2026-02-31 -> 2026-03-03).
  const back = new Date(ms).toISOString().slice(0, 10);
  if (back !== date) {
    throw new RangeValidationError(`Invalid calendar date: ${date}`);
  }
  return Math.floor(ms / 86_400_000);
}

function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Days between two inclusive dates (end - start). */
export function daysBetween(start: string, end: string): number {
  return toEpochDay(end) - toEpochDay(start);
}

/**
 * Resolve a requested Dashboard/Workspace range into canonical inclusive dates,
 * anchored to `today` (YYYY-MM-DD). Custom ranges are validated and reversed
 * start/end are corrected (spec §10 render order step 2).
 */
export function resolveRange(
  rangeKey: RangeKey,
  today: string,
  customStart?: string | null,
  customEnd?: string | null,
): ResolvedRange {
  toEpochDay(today); // validate anchor
  switch (rangeKey) {
    case 'all':
      return { range_key: 'all', start_date: null, end_date: null };
    case '24h':
      return { range_key: '24h', start_date: today, end_date: today };
    case '7d':
      return { range_key: '7d', start_date: addDays(today, -6), end_date: today };
    case '1m':
      return { range_key: '1m', start_date: addDays(today, -29), end_date: today };
    case 'custom': {
      if (!customStart || !customEnd) {
        throw new RangeValidationError('Custom range requires both start_date and end_date');
      }
      let start = customStart;
      let end = customEnd;
      if (toEpochDay(start) > toEpochDay(end)) {
        [start, end] = [end, start]; // correct reversed dates
      }
      return { range_key: 'custom', start_date: start, end_date: end };
    }
    default:
      throw new RangeValidationError(`Unknown range_key: ${rangeKey as string}`);
  }
}

/** Expand a resolved range into the list of inclusive YYYY-MM-DD dates it covers.
 *  For all-time, the caller must supply observed data bounds. */
export function expandDates(start: string, end: string): string[] {
  const out: string[] = [];
  const last = toEpochDay(end);
  for (let d = toEpochDay(start); d <= last; d++) out.push(fromEpochDay(d));
  return out;
}
