import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCodexDesktopRegistration } from '../src/services/codexDesktopSessionLookup.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roots: string[] = [];
const root = () => { const value = mkdtempSync(join(tmpdir(), 'codex-lookup-')); roots.push(value); mkdirSync(join(value, 'sessions')); return value; };
afterEach(() => { vi.restoreAllMocks(); while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('Codex Desktop exact session lookup', () => {
  it('rejects a scan or final snapshot that completes after the deadline', () => {
    const base = root(); writeFileSync(join(base, 'sessions', 'one.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(30_001).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base], { deadlineMs: 30_000 })).toThrow('resume_probe_incomplete');
    clock.mockReset().mockReturnValue(30_001).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base], { deadlineMs: 30_000 })).toThrow('resume_probe_incomplete');
  });
  it('allows a bounded background lookup beyond the foreground deadline and rejects budget overflow', () => {
    const base = root();
    for (let i = 0; i < 6; i++) writeFileSync(join(base, 'sessions', `${i}.jsonl`), `${JSON.stringify({ type: 'session_meta', payload: { id: i === 0 ? id : 'other' } })}\n`);
    let elapsed = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => elapsed += 1_000);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base])).toThrow('resume_probe_incomplete');
    elapsed = 0;
    expect(resolveCodexDesktopRegistration(id, 'x', [base], { deadlineMs: 30_000 }).session_locator).toBe('r0/sessions/0.jsonl');
    elapsed = 0;
    vi.mocked(Date.now).mockImplementation(() => elapsed += 10_000);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base], { deadlineMs: 30_000 })).toThrow('resume_probe_incomplete');
    for (const deadlineMs of [0, -1, NaN, Infinity, 30_001]) {
      expect(() => resolveCodexDesktopRegistration(id, 'x', [base], { deadlineMs })).toThrow('invalid_resume_lookup_deadline');
    }
  });
  it('registers one exact session using a safe locator and final full-file digest', () => {
    const base = root();
    writeFileSync(join(base, 'sessions', 'one.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
    const result = resolveCodexDesktopRegistration(id, '目前任務', [base]);
    expect(result).toMatchObject({ thread_id: id, display_name: '目前任務', session_locator: 'r0/sessions/one.jsonl' });
    expect(result.registration_prefix_digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed for no match, duplicate files, or duplicate metadata in one file', () => {
    const a = root(); const b = root();
    expect(() => resolveCodexDesktopRegistration(id, 'x', [a])).toThrow('codex_session_not_found');
    const line = `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`;
    writeFileSync(join(a, 'sessions', 'one.jsonl'), line); writeFileSync(join(b, 'sessions', 'two.jsonl'), line);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [a, b])).toThrow('duplicate_codex_session_identity');
    rmSync(join(b, 'sessions', 'two.jsonl')); writeFileSync(join(a, 'sessions', 'one.jsonl'), line + line);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [a])).toThrow('resume_probe_incomplete');
  });

  it('selects the newest timestamped segment when one active Codex thread spans sequential files', () => {
    const base = root();
    writeFileSync(join(base, 'sessions', 'old.jsonl'), `${JSON.stringify({ type: 'session_meta', timestamp: '2026-09-13T18:01:43.763Z', payload: { id } })}\n`);
    writeFileSync(join(base, 'sessions', 'current.jsonl'), `${JSON.stringify({ type: 'session_meta', timestamp: '2026-09-13T18:28:44.320Z', payload: { id } })}\n`);
    expect(resolveCodexDesktopRegistration(id, 'x', [base]).session_locator).toBe('r0/sessions/current.jsonl');

    writeFileSync(join(base, 'sessions', 'ambiguous.jsonl'), `${JSON.stringify({ type: 'session_meta', timestamp: '2026-09-13T18:28:44.320Z', payload: { id } })}\n`);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base])).toThrow('duplicate_codex_session_identity');
  });
});

describe('Canonical Codex activity locations', () => {
  const line = `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`;
  it('ignores deep temporary/plugin trees and transcript copies outside activity locations', () => {
    const base = root();
    writeFileSync(join(base, 'sessions', 'target.jsonl'), line);
    mkdirSync(join(base, '.tmp', ...Array(14).fill('nested')), { recursive: true });
    mkdirSync(join(base, 'plugins', ...Array(14).fill('nested')), { recursive: true });
    mkdirSync(join(base, 'memories'));
    writeFileSync(join(base, 'memories', 'copy.jsonl'), line);
    expect(resolveCodexDesktopRegistration(id, 'x', [base]).session_locator).toBe('r0/sessions/target.jsonl');
  });
  it('detects duplicates across active and archived sessions, and supports archived-only roots', () => {
    const base = root(); mkdirSync(join(base, 'archived_sessions'));
    writeFileSync(join(base, 'archived_sessions', 'old.jsonl'), line);
    rmSync(join(base, 'sessions'), { recursive: true });
    expect(resolveCodexDesktopRegistration(id, 'x', [base]).session_locator).toBe('r0/archived_sessions/old.jsonl');
    mkdirSync(join(base, 'sessions')); writeFileSync(join(base, 'sessions', 'active.jsonl'), line);
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base])).toThrow('duplicate_codex_session_identity');
  });
  it('rejects an unreadable activity layout instead of skipping potential duplicates', () => {
    const base = root(); writeFileSync(join(base, 'sessions', 'target.jsonl'), line);
    symlinkSync(join(base, 'sessions'), join(base, 'archived_sessions'));
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base])).toThrow('resume_probe_incomplete');
  });
  it('retains depth limits inside actual session storage', () => {
    const base = root(); mkdirSync(join(base, 'sessions', ...Array(14).fill('nested')), { recursive: true });
    expect(() => resolveCodexDesktopRegistration(id, 'x', [base])).toThrow('resume_probe_incomplete');
  });
});
