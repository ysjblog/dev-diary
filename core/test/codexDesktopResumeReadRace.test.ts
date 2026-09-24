import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Simulates Codex appending to the session file while DevDiary reads it: every
// bigint fstat pair seen while armed disagrees on mtime, exactly as a real
// concurrent append would. The session lookup runs unperturbed so only the
// evidence snapshot read is exercised.
const race = vi.hoisted(() => ({ reads: 0, calls: 0, truncate: null as null | { path: string; length: number } }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const fstatSync = ((fd: number, options?: { bigint?: boolean }) => {
    const stat = real.fstatSync(fd, options as never) as unknown as import('node:fs').BigIntStats;
    if (options?.bigint && race.truncate) {
      // Truncate right after the pre-read stat, so the first read comes up short.
      real.truncateSync(race.truncate.path, race.truncate.length); race.truncate = null;
      return stat;
    }
    if (!options?.bigint || race.reads <= 0) return stat;
    race.calls += 1;
    if (race.calls % 2 === 0) race.reads -= 1;
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { mtimeNs: stat.mtimeNs + BigInt(race.calls) });
  }) as typeof real.fstatSync;
  return { ...real, default: { ...real, fstatSync }, fstatSync };
});
vi.mock('../src/services/codexDesktopSessionLookup.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/services/codexDesktopSessionLookup.js')>();
  return {
    ...real,
    resolveCodexDesktopRegistration: (...args: Parameters<typeof real.resolveCodexDesktopRegistration>) => {
      const saved = { reads: race.reads, truncate: race.truncate }; race.reads = 0; race.truncate = null;
      try { return real.resolveCodexDesktopRegistration(...args); } finally { Object.assign(race, saved); }
    },
  };
});

const { openDb } = await import('../src/db/index.js');
const { createCodexDesktopResumeEngine } = await import('../src/services/codexDesktopResumeEngine.js');
const { createCodexDesktopResumeRepository } = await import('../src/services/codexDesktopResumeRepository.js');
const { resolveCodexDesktopRegistration } = await import('../src/services/codexDesktopSessionLookup.js');

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roots: string[] = [];
afterEach(() => { race.reads = 0; race.calls = 0; race.truncate = null; while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function setupWithQuota(now: number) {
  const root = mkdtempSync(join(tmpdir(), 'codex-race-')); roots.push(root); mkdirSync(join(root, 'sessions'));
  const path = join(root, 'sessions', 'target.jsonl');
  writeFileSync(path, `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
  const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => now);
  repo.registerVerifiedTarget(resolveCodexDesktopRegistration(id, '任務', [root])); repo.setGlobalEnabled(true);
  appendFileSync(path, `${JSON.stringify({ type: 'event_msg', timestamp: '2026-09-09T00:00:00.000Z', payload: { type: 'task_complete',
    error: { codex_error_info: 'usage_limit_exceeded', message: "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM." } } })}\n`);
  return { root, db, repo };
}

describe('Codex Desktop resume evidence read racing a live Codex append', () => {
  it('skips the tick without quarantining the target while the session file keeps changing, then resumes normally', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, db, repo } = setupWithQuota(now);
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'queued' }; }, () => now);
    race.reads = 100;
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'watching', last_error_code: null });
    expect(calls).toEqual([]);
    race.reads = 0;
    expect(await engine.tick()).toBe('resumed');
    expect(calls).toEqual([id]);
  });

  it('retries a single transient unstable read within the same tick', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, db } = setupWithQuota(now);
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'queued' }; }, () => now);
    race.reads = 1;
    expect(await engine.tick()).toBe('resumed');
    expect(calls).toEqual([id]);
  });

  it('still stops on a real prefix rewrite of the same session file', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, db, repo } = setupWithQuota(now);
    writeFileSync(join(root, 'sessions', 'target.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id, rewritten: true } })}\n`);
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'queued' }; }, () => now);
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: 'session_integrity_changed' });
    expect(calls).toEqual([]);
  });

  it('still stops when the file is truncated during the read and then stays stable', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, db, repo } = setupWithQuota(now);
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'queued' }; }, () => now);
    race.truncate = { path: join(root, 'sessions', 'target.jsonl'), length: 10 };
    expect(await engine.tick()).toBe('watching');
    expect(race.truncate).toBeNull();
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: 'session_integrity_changed' });
    expect(calls).toEqual([]);
  });

  it('treats an unstable read during segment adoption as a recoverable uniqueness failure', async () => {
    const base = Date.parse('2026-09-21T00:00:00.000Z'); let clock = base + 60_000;
    const meta = (at: number) => `${JSON.stringify({ type: 'session_meta', timestamp: new Date(at).toISOString(), payload: { id } })}\n`;
    const quota = (at: number) => `${JSON.stringify({ type: 'event_msg', timestamp: new Date(at).toISOString(), payload: { type: 'task_complete',
      error: { codex_error_info: 'usage_limit_exceeded', message: 'You’ve hit your usage limit. Upgrade or try again at 8:12 AM.' } } })}\n`;
    const root = mkdtempSync(join(tmpdir(), 'codex-race-')); roots.push(root); mkdirSync(join(root, 'sessions'));
    writeFileSync(join(root, 'sessions', 'old.jsonl'), meta(base));
    const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => clock);
    repo.registerVerifiedTarget(resolveCodexDesktopRegistration(id, '任務', [root])); repo.setGlobalEnabled(true);
    writeFileSync(join(root, 'sessions', 'new.jsonl'), meta(base + 600_000) + quota(base + 660_000)); clock = base + 780_000;
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'queued' }; }, () => clock);
    race.reads = 100;
    await engine.tick();
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: 'session_uniqueness_unproven' });
    expect(calls).toEqual([]);
    race.reads = 0;
    expect(await engine.tick()).toBe('resumed');
    expect(calls).toEqual([id]);
    expect(db.prepare('SELECT session_locator FROM codex_desktop_resume_targets').get()).toEqual({ session_locator: 'r0/sessions/new.jsonl' });
  });
});
