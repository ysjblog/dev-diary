import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Counts full cross-root session walks so the tests can prove when the engine
// skips or performs them. While `unstable` is set, every evidence read sees the
// file change underneath it (as during a live Codex append); the walk itself
// runs unperturbed.
const lookups = vi.hoisted(() => ({ count: 0, unstable: false, calls: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const fstatSync = ((fd: number, options?: { bigint?: boolean }) => {
    const stat = real.fstatSync(fd, options as never) as unknown as import('node:fs').BigIntStats;
    if (!options?.bigint || !lookups.unstable) return stat;
    lookups.calls += 1;
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { mtimeNs: stat.mtimeNs + BigInt(lookups.calls) });
  }) as typeof real.fstatSync;
  return { ...real, default: { ...real, fstatSync }, fstatSync };
});
vi.mock('../src/services/codexDesktopSessionLookup.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/services/codexDesktopSessionLookup.js')>();
  return {
    ...real,
    resolveCodexDesktopRegistration: (...args: Parameters<typeof real.resolveCodexDesktopRegistration>) => {
      lookups.count += 1;
      const unstable = lookups.unstable; lookups.unstable = false;
      try { return real.resolveCodexDesktopRegistration(...args); } finally { lookups.unstable = unstable; }
    },
  };
});

const { openDb } = await import('../src/db/index.js');
const { CODEX_DESKTOP_RESUME_RESCAN_MS, createCodexDesktopResumeEngine } = await import('../src/services/codexDesktopResumeEngine.js');
const { createCodexDesktopResumeRepository } = await import('../src/services/codexDesktopResumeRepository.js');
const { resolveCodexDesktopRegistration } = await import('../src/services/codexDesktopSessionLookup.js');

const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const base = Date.parse('2026-09-21T00:00:00.000Z');
const dirs: string[] = [];
afterEach(() => { lookups.count = 0; lookups.unstable = false; lookups.calls = 0; while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const meta = (at: number) => `${JSON.stringify({ type: 'session_meta', timestamp: new Date(at).toISOString(), payload: { id } })}\n`;
// The parser reads the reset clause in the registered local timezone.
const localClock = (at: number) => new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/[  ]/g, ' ');
const quota = (eventAt: number, resetAt: number) => `${JSON.stringify({ type: 'event_msg', timestamp: new Date(eventAt).toISOString(), payload: { type: 'task_complete',
  error: { codex_error_info: 'usage_limit_exceeded', message: `You’ve hit your usage limit. Upgrade or try again at ${localClock(resetAt)}.` } } })}\n`;

function codexHome(): string {
  const root = mkdtempSync(join(tmpdir(), 'codex-cadence-')); dirs.push(root); mkdirSync(join(root, 'sessions'));
  return root;
}

function setup(roots: string[]) {
  const clock = { now: base };
  writeFileSync(join(roots[0]!, 'sessions', 'old.jsonl'), meta(base));
  const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => clock.now);
  repo.registerVerifiedTarget(resolveCodexDesktopRegistration(id, '任務', [roots[0]!])); repo.setGlobalEnabled(true);
  lookups.count = 0;
  const calls: string[] = [];
  const engine = createCodexDesktopResumeEngine(db, () => roots, async (threadId) => { calls.push(threadId); return { accepted: true, code: 'queued' }; }, () => clock.now);
  return { clock, db, repo, calls, engine, target: () => repo.snapshot().targets[0]! };
}

describe('Codex Desktop background rescan cadence', () => {
  it('reads only the registered segment between full rescans while nothing is actionable', async () => {
    const { clock, engine, calls, target } = setup([codexHome()]);
    clock.now = base + 60_000;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(1);
    for (const offset of [30_000, 60_000, CODEX_DESKTOP_RESUME_RESCAN_MS - 1]) {
      clock.now = base + 60_000 + offset;
      expect(await engine.tick()).toBe('watching');
    }
    expect(lookups.count).toBe(1);
    clock.now = base + 60_000 + CODEX_DESKTOP_RESUME_RESCAN_MS;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(2);
    expect(target()).toMatchObject({ state: 'watching', last_error_code: null });
    expect(calls).toEqual([]);
  });

  it('records a future reset without a rescan, then re-proves uniqueness in the tick where it becomes due', async () => {
    const root = codexHome(); const { clock, engine, calls, target } = setup([root]);
    clock.now = base + 60_000;
    await engine.tick();
    const reset = base + 30 * 60_000;
    appendFileSync(join(root, 'sessions', 'old.jsonl'), quota(base + 90_000, reset));
    clock.now = base + 120_000;
    expect(await engine.tick()).toBe('watching');
    expect(target()).toMatchObject({ state: 'waiting_for_reset', reset_at_ms: reset + 60_000 });
    expect(lookups.count).toBe(1);
    clock.now = reset - 60_000;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(2);
    clock.now = reset + 60_000;
    expect(await engine.tick()).toBe('resumed');
    expect(lookups.count).toBe(3);
    expect(calls).toEqual([id]);
    // A resumed target is throttled again and never re-sends the consumed evidence.
    clock.now = reset + 90_000;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(3);
    expect(calls).toEqual([id]);
  });

  it('still refuses to dispatch due evidence when a cross-root duplicate appeared inside the rescan window', async () => {
    const primary = codexHome(); const copy = codexHome();
    const { clock, engine, calls, target } = setup([primary, copy]);
    clock.now = base + 100_000;
    await engine.tick();
    copyFileSync(join(primary, 'sessions', 'old.jsonl'), join(copy, 'sessions', 'copy.jsonl'));
    appendFileSync(join(primary, 'sessions', 'old.jsonl'), quota(base + 70_000, base + 30_000));
    // Recent-past reset: due five minutes after the event, still inside the window of the previous rescan.
    clock.now = base + 70_000 + 300_000;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(2);
    expect(target()).toMatchObject({ state: 'needs_attention', last_error_code: 'session_uniqueness_unproven' });
    expect(calls).toEqual([]);
  });

  it('adopts a rotated segment at the next full rescan instead of every tick', async () => {
    const root = codexHome(); const { clock, db, engine, calls } = setup([root]);
    clock.now = base + 700_000;
    await engine.tick();
    expect(lookups.count).toBe(1);
    writeFileSync(join(root, 'sessions', 'new.jsonl'), meta(base + 600_000) + quota(base + 660_000, base + 720_000));
    clock.now = base + 790_000;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(1);
    expect(calls).toEqual([]);
    clock.now = base + 700_000 + CODEX_DESKTOP_RESUME_RESCAN_MS;
    expect(await engine.tick()).toBe('resumed');
    expect(lookups.count).toBe(2);
    expect(calls).toEqual([id]);
    expect(db.prepare('SELECT session_locator FROM codex_desktop_resume_targets').get()).toEqual({ session_locator: 'r0/sessions/new.jsonl' });
  });

  it('keeps retrying uniqueness recovery on every tick', async () => {
    const primary = codexHome(); const copy = codexHome();
    const { clock, engine, target } = setup([primary, copy]);
    copyFileSync(join(primary, 'sessions', 'old.jsonl'), join(copy, 'sessions', 'copy.jsonl'));
    clock.now = base + 60_000;
    await engine.tick();
    expect(target()).toMatchObject({ state: 'needs_attention', last_error_code: 'session_uniqueness_unproven' });
    rmSync(join(copy, 'sessions', 'copy.jsonl'));
    clock.now = base + 90_000;
    await engine.tick();
    expect(lookups.count).toBe(2);
    expect(target()).toMatchObject({ state: 'watching', last_error_code: null });
  });

  it('runs the full path at once when the registered segment is rewritten inside the window', async () => {
    const root = codexHome(); const { clock, engine, calls, target } = setup([root]);
    clock.now = base + 60_000;
    await engine.tick();
    writeFileSync(join(root, 'sessions', 'old.jsonl'), `${JSON.stringify({ type: 'session_meta', timestamp: new Date(base).toISOString(), payload: { id, rewritten: true } })}\n`);
    clock.now = base + 90_000;
    await engine.tick();
    expect(lookups.count).toBe(2);
    expect(target()).toMatchObject({ state: 'needs_attention', last_error_code: 'session_integrity_changed' });
    expect(calls).toEqual([]);
  });

  it('revalidates on the next tick when the user re-enables a target inside the window', async () => {
    const { clock, repo, engine, target } = setup([codexHome()]);
    clock.now = base + 60_000;
    await engine.tick();
    clock.now = base + 70_000;
    repo.patchTarget(id, { enabled: false }); repo.patchTarget(id, { enabled: true });
    clock.now = base + 90_000;
    await engine.tick();
    expect(lookups.count).toBe(2);
    expect(target()).toMatchObject({ state: 'watching', last_error_code: null });
  });

  it('rescans in full when the clock moves backwards', async () => {
    const { clock, engine } = setup([codexHome()]);
    clock.now = base + 120_000;
    await engine.tick();
    clock.now = base + 60_000;
    await engine.tick();
    expect(lookups.count).toBe(2);
  });

  it('still rescans in full after the window while the session keeps changing', async () => {
    const { clock, engine, calls, target } = setup([codexHome()]);
    lookups.unstable = true;
    clock.now = base + 60_000;
    expect(await engine.tick()).toBe('watching');
    clock.now = base + 90_000;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(1);
    clock.now = base + 60_000 + CODEX_DESKTOP_RESUME_RESCAN_MS;
    expect(await engine.tick()).toBe('watching');
    expect(lookups.count).toBe(2);
    expect(target()).toMatchObject({ state: 'watching', last_error_code: null });
    expect(calls).toEqual([]);
  });

  it('revalidates every target after the global switch is turned off and on, or another target is renamed', async () => {
    const { clock, repo, engine } = setup([codexHome()]);
    clock.now = base + 60_000;
    await engine.tick();
    repo.setGlobalEnabled(false); repo.setGlobalEnabled(true);
    clock.now = base + 90_000;
    await engine.tick();
    expect(lookups.count).toBe(2);
    repo.patchTarget(id, { display_name: '改名' });
    clock.now = base + 120_000;
    await engine.tick();
    expect(lookups.count).toBe(3);
    clock.now = base + 150_000;
    await engine.tick();
    expect(lookups.count).toBe(3);
  });
});
