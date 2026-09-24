import { describe, expect, it } from 'vitest';
import { parseStrictCodexQuotaLine } from '../src/services/codexQuotaEvidence.js';

const line = (overrides: Record<string, unknown> = {}) => Buffer.from(`${JSON.stringify({
  type: 'event_msg', timestamp: '2026-09-09T00:00:00.000Z',
  payload: { type: 'task_complete', error: { codex_error_info: 'usage_limit_exceeded', message: "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM." } }, ...overrides,
})}\n`);

describe('strict Codex quota evidence', () => {
  it('accepts only the exact error event and resolves its reset in the registered timezone', () => {
    const result = parseStrictCodexQuotaLine(line(), 'Asia/Taipei');
    expect(result?.reset_at_ms).toBe(Date.parse('2026-09-09T01:30:00.000Z'));
    expect(result?.raw_line_digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects mentions, wrong enums, arbitrary reset fields, duplicate clauses and incomplete lines', () => {
    expect(parseStrictCodexQuotaLine(line({ type: 'response_item' }), 'Asia/Taipei')).toBeNull();
    expect(parseStrictCodexQuotaLine(Buffer.from(`${JSON.stringify({ type: 'event_msg', timestamp: '2026-09-09T00:00:00.000Z', payload: { type: 'task_complete', error: { codex_error_info: 'other', message: "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM." } } })}\n`), 'Asia/Taipei')).toBeNull();
    expect(parseStrictCodexQuotaLine(line({ resets_at: '2026-09-10T00:00:00Z' }), 'Asia/Taipei')).not.toBeNull();
    expect(parseStrictCodexQuotaLine(Buffer.from(line().toString().replace('9:30 AM', '9:30 AM; or try again at 10:00 AM')), 'Asia/Taipei')).toBeNull();
    expect(parseStrictCodexQuotaLine(line().subarray(0, line().length - 1), 'Asia/Taipei')).toBeNull();
  });

  it('accepts the dated vendor format and rejects an invalid ordinal suffix', () => {
    const dated = Buffer.from(line({ timestamp: '2026-07-23T00:00:00.000Z' }).toString().replace('9:30 AM', 'Jul 23rd, 2026 2:34 PM'));
    expect(parseStrictCodexQuotaLine(dated, 'Asia/Taipei')?.reset_at_ms).toBe(Date.parse('2026-07-23T06:34:00.000Z'));
    expect(parseStrictCodexQuotaLine(Buffer.from(dated.toString().replace('23rd', '23th')), 'Asia/Taipei')).toBeNull();
  });
  it('accepts the vendor right-curly apostrophe while retaining original evidence bytes', () => {
    const straight = line();
    const curly = Buffer.from(straight.toString().replace("You've", 'You’ve'));
    const a = parseStrictCodexQuotaLine(straight, 'Asia/Taipei');
    const b = parseStrictCodexQuotaLine(curly, 'Asia/Taipei');
    expect(b?.reset_at_ms).toBe(a?.reset_at_ms);
    expect(b?.raw_line_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(b?.raw_line_digest).not.toBe(a?.raw_line_digest);
    for (const prefix of ['You‘ve', 'You＇ve', 'You`ve', 'Quoted: You’ve']) {
      expect(parseStrictCodexQuotaLine(Buffer.from(straight.toString().replace("You've", prefix)), 'Asia/Taipei')).toBeNull();
    }
    expect(parseStrictCodexQuotaLine(Buffer.from(curly.toString().replace('usage_limit_exceeded', 'other')), 'Asia/Taipei')).toBeNull();
    expect(parseStrictCodexQuotaLine(Buffer.from(curly.toString().replace('event_msg', 'response_item')), 'Asia/Taipei')).toBeNull();
  });

});
