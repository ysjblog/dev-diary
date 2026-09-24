import { createHash } from 'node:crypto';

const CLAUSE = /(?:^|[\s.,;:!?()\[\]{}])(or try again at (?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([1-9]|[12][0-9]|3[01])(st|nd|rd|th), ([0-9]{4}) )?([1-9]|1[0-2]):([0-5][0-9]) (AM|PM))(?=$|[\s.,;:!?()\[\]{}])/g;
export const CODEX_QUOTA_RECENT_PAST_MS = 60 * 60_000;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface StrictQuotaEvidence { event_at_ms: number; reset_at_ms: number; raw_line_digest: string }

function localParts(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function resolveWallClock(zone: string, wanted: ReturnType<typeof localParts>): number | null {
  const center = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute);
  const matches: number[] = [];
  for (let at = center - 14 * 3600_000; at <= center + 14 * 3600_000; at += 60_000) {
    const got = localParts(at, zone);
    if (Object.keys(wanted).every((key) => got[key as keyof typeof got] === wanted[key as keyof typeof wanted])) matches.push(at);
  }
  return matches.length === 1 ? matches[0]! : null;
}

export function parseStrictCodexQuotaLine(rawLine: Buffer, timezoneId: string): StrictQuotaEvidence | null {
  if (rawLine.at(-1) !== 0x0a || rawLine.includes(0)) return null;
  let value: any;
  try { value = JSON.parse(rawLine.subarray(0, -1).toString('utf8')); } catch { return null; }
  if (value?.type !== 'event_msg' || typeof value.timestamp !== 'string' || value?.payload?.type !== 'task_complete'
    || value?.payload?.error?.codex_error_info !== 'usage_limit_exceeded' || typeof value.payload.error.message !== 'string') return null;
  const message = value.payload.error.message;
  if (!message.startsWith("You've hit your usage limit.") && !message.startsWith("You’ve hit your usage limit.")) return null;
  if (Buffer.byteLength(message, 'utf8') < 1 || Buffer.byteLength(message, 'utf8') > 2048 || message.includes('\0')) return null;
  const eventAt = Date.parse(value.timestamp);
  if (!Number.isFinite(eventAt) || new Date(eventAt).toISOString() !== value.timestamp) return null;
  const matches = [...message.matchAll(CLAUSE)];
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  let hour = Number(match[6]);
  if (match[8] === 'AM') hour %= 12; else if (hour !== 12) hour += 12;
  const minute = Number(match[7]);
  let resetAt: number | null = null;
  if (match[2]) {
    const day = Number(match[3]);
    const expectedSuffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    if (match[4] !== expectedSuffix) return null;
    resetAt = resolveWallClock(timezoneId, { year: Number(match[5]), month: MONTHS.indexOf(match[2]) + 1, day, hour, minute });
  } else {
    const eventLocal = localParts(eventAt, timezoneId);
    const base = Date.UTC(eventLocal.year, eventLocal.month - 1, eventLocal.day);
    for (let day = -1; day <= 1 && resetAt === null; day += 1) {
      const date = new Date(base + day * 86_400_000);
      const candidate = resolveWallClock(timezoneId, { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour, minute });
      if (candidate !== null && candidate >= eventAt - CODEX_QUOTA_RECENT_PAST_MS) resetAt = candidate;
    }
  }
  if (resetAt === null || resetAt < eventAt - CODEX_QUOTA_RECENT_PAST_MS || resetAt - eventAt > 7 * 86_400_000) return null;
  return { event_at_ms: eventAt, reset_at_ms: resetAt, raw_line_digest: createHash('sha256').update(rawLine).digest('hex') };
}
