import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createCodexCliResumeDispatcher, createCodexDesktopResumeEngine } from '../src/services/codexDesktopResumeEngine.js';
import { createCodexDesktopResumeRepository } from '../src/services/codexDesktopResumeRepository.js';
import { resolveCodexDesktopRegistration } from '../src/services/codexDesktopSessionLookup.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roots: string[] = [];
const authority = () => `node=${process.versions.node};icu=${process.versions.icu};tz=${process.versions.tz}`;
afterEach(() => { vi.restoreAllMocks(); while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function setup(now: number, displayName = '任務') {
  const root = mkdtempSync(join(tmpdir(), 'codex-engine-')); roots.push(root); mkdirSync(join(root, 'sessions'));
  const path = join(root, 'sessions', 'target.jsonl');
  writeFileSync(path, `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
  const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => now);
  const registration = resolveCodexDesktopRegistration(id, displayName, [root]);
  expect(registration.timezone_authority).toBe(authority());
  repo.registerVerifiedTarget(registration); repo.setGlobalEnabled(true);
  return { root, path, db, repo };
}

function quota(timestamp: string, message: string) {
  return `${JSON.stringify({ type: 'event_msg', timestamp, payload: { type: 'task_complete', error: { codex_error_info: 'usage_limit_exceeded', message } } })}\n`;
}

describe('Codex Desktop multi-target resume engine', () => {
  it('never claims quota evidence or dispatches when the final session snapshot is overdue', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db, repo } = setup(now);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    vi.spyOn(Date, 'now').mockReturnValue(30_001).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0);
    let calls = 0;
    const engine = createCodexDesktopResumeEngine(db, () => [root], async () => { calls++; return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot()).toMatchObject({ action_in_progress: false, targets: [{ state: 'needs_attention', last_error_code: 'session_uniqueness_unproven' }] });
    expect(db.prepare('SELECT current_evidence_id FROM codex_desktop_resume_targets').get()).toEqual({ current_evidence_id: null });
    expect(calls).toBe(0);
  });
  it('recovers exact session monitoring when background scanning exceeds five seconds without dispatching', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, db, repo } = setup(now);
    for (let i = 0; i < 6; i++) writeFileSync(join(root, 'sessions', `other-${i}.jsonl`), '{}\n');
    db.prepare("UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code='session_uniqueness_unproven'").run();
    let elapsed = 0; vi.spyOn(Date, 'now').mockImplementation(() => elapsed += 1_000);
    let calls = 0;
    const engine = createCodexDesktopResumeEngine(db, () => [root], async () => { calls++; return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'watching', last_error_code: null });
    expect(calls).toBe(0);
  });
  it.each(["You've", 'You’ve'])('dispatches the exact thread only after a new strict quota reset and never replays it: %s', async (prefix) => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db, repo } = setup(now);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', `${prefix} hit your usage limit. Upgrade to Pro or try again at 9:30 AM.`));
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('resumed'); expect(calls).toEqual([id]);
    expect(await engine.tick()).toBe('watching'); expect(calls).toEqual([id]);
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'resumed' });
  });

  it('consumes the evidence and never retries when a fake Codex CLI exits with active-writer output but no acknowledgement', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db, repo } = setup(now);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    const binary = join(root, 'fake-codex-active-writer');
    writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' '{"type":"error","message":"thread-store conflict: active writer"}' >&2\nexit 1\n`);
    chmodSync(binary, 0o700);
    let calls = 0;
    const engine = createCodexDesktopResumeEngine(db, () => [root], async () => {
      calls += 1;
      return createCodexCliResumeDispatcher(binary)(id, { codexHome: realpathSync(root) });
    }, () => now);

    expect(await engine.tick()).toBe('needs_attention');
    expect(calls).toBe(1);
    expect(repo.snapshot().targets[0]).toMatchObject({
      state: 'needs_attention',
      last_error_code: 'codex_resume_active_writer',
    });
    expect(await engine.tick()).toBe('watching');
    expect(calls).toBe(1);
  });

  it('advances a byte high-watermark past duplicate pre-existing quota events', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db } = setup(now);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    appendFileSync(path, quota('2026-09-09T00:00:01.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    let calls = 0;
    const engine = createCodexDesktopResumeEngine(db, () => [root], async () => { calls += 1; return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('resumed');
    expect(await engine.tick()).toBe('watching');
    expect(calls).toBe(1);
  });

  it('serializes multiple registered targets and dispatches at most one per tick', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z');
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const root = mkdtempSync(join(tmpdir(), 'codex-engine-multi-')); roots.push(root); mkdirSync(join(root, 'sessions'));
    const firstPath = join(root, 'sessions', 'a.jsonl'); const secondPath = join(root, 'sessions', 'b.jsonl');
    writeFileSync(firstPath, `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
    writeFileSync(secondPath, `${JSON.stringify({ type: 'session_meta', payload: { id: secondId } })}\n`);
    const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => now);
    repo.registerVerifiedTarget(resolveCodexDesktopRegistration(id, '第一個任務', [root]));
    repo.registerVerifiedTarget(resolveCodexDesktopRegistration(secondId, '第二個任務', [root]));
    repo.setGlobalEnabled(true);
    appendFileSync(firstPath, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    appendFileSync(secondPath, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('resumed'); expect(calls).toEqual([id]);
    expect(await engine.tick()).toBe('resumed'); expect(calls).toEqual([id, secondId]);
    expect(repo.snapshot().targets.map((target) => target.state)).toEqual(['resumed', 'resumed']);
  });

  it('ignores ordinary text and waits when the exact reset is still in the future', async () => {
    const now = Date.parse('2026-09-09T00:30:00.000Z'); const { root, path, db, repo } = setup(now);
    appendFileSync(path, `${JSON.stringify({ type: 'response_item', payload: { message: 'Try again at 9:30 AM' } })}\n`);
    let calls = 0; const engine = createCodexDesktopResumeEngine(db, () => [root], async () => { calls += 1; return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('watching'); expect(calls).toBe(0);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'waiting_for_reset' }); expect(calls).toBe(0);
  });

  it('recovers only a pre-dispatch timezone mismatch after the registered runtime authority returns', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db, repo } = setup(now);
    db.prepare(`UPDATE codex_desktop_resume_targets SET timezone_authority='node=22.23.1;icu=other;tz=2026a' WHERE thread_id=?`).run(id);
    let calls = 0;
    const engine = createCodexDesktopResumeEngine(db, () => [root], async () => { calls += 1; return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: 'timezone_authority_changed' });
    expect(calls).toBe(0);

    db.prepare(`UPDATE codex_desktop_resume_targets SET timezone_authority=? WHERE thread_id=?`).run(authority(), id);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    expect(await engine.tick()).toBe('resumed');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'resumed', last_error_code: null });
    expect(calls).toBe(1);
  });

  it('keeps source identity changes quarantined and safely recovers after the exact session returns', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db, repo } = setup(now);
    writeFileSync(path, `${JSON.stringify({ type: 'session_meta', payload: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } })}\n`);
    let calls = 0; const engine = createCodexDesktopResumeEngine(db, () => [root], async () => { calls += 1; return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('watching'); expect(calls).toBe(0);
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: 'session_uniqueness_unproven' });
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: 'session_uniqueness_unproven' });

    writeFileSync(path, `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`);
    expect(await engine.tick()).toBe('watching');
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'watching', last_error_code: null });
    expect(calls).toBe(0);
  });

  it('never replays an expired unknown dispatch after a runner crash', async () => {
    let now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db, repo } = setup(now);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    const target = repo.snapshot().targets[0]!;
    db.prepare(`UPDATE codex_desktop_resume_state SET active_target_digest=?,owner_id=?,lease_token=?,lease_generation=1,acquired_at_ms=?,renewed_at_ms=?,lease_expires_at_ms=?,updated_at_ms=? WHERE id=1`).run(target.target_key_digest, 'a'.repeat(32), 'b'.repeat(32), now, now, now + 1, now);
    db.prepare(`UPDATE codex_desktop_resume_targets SET state='claimed',current_evidence_id=?,current_evidence_cursor='{}',attempt_token=?,startup_nonce=?,startup_deadline_ms=?,action_deadline_ms=?,action_phase='claimed' WHERE thread_id=?`).run('c'.repeat(64), 'd'.repeat(32), 'e'.repeat(32), now + 1, now + 1, id);
    now += 2; let calls = 0;
    const engine = createCodexDesktopResumeEngine(db, () => [root], async () => { calls += 1; return { accepted: true, code: 'accepted' }; }, () => now);
    await engine.tick(); expect(calls).toBe(0);
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: 'previous_dispatch_outcome_unknown' });
    expect(repo.snapshot().action_in_progress).toBe(true);
    expect(db.prepare('SELECT lock_quarantine_required,completed_evidence_id,action_high_watermark FROM codex_desktop_resume_targets').get()).toEqual({ lock_quarantine_required: 1, completed_evidence_id: 'c'.repeat(64), action_high_watermark: '{}' });
    const lease = db.prepare('SELECT lease_token,lease_expires_at_ms FROM codex_desktop_resume_state').get();
    expect(lease).toEqual({ lease_token: 'b'.repeat(32), lease_expires_at_ms: Number.MAX_SAFE_INTEGER });
    // A different runnable target must remain blocked across engine restart.
    const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const otherPath = join(root, 'sessions', 'other.jsonl');
    writeFileSync(otherPath, `${JSON.stringify({ type: 'session_meta', payload: { id: other } })}\n`);
    const reg = resolveCodexDesktopRegistration(other, 'other', [root]);
    db.prepare(`INSERT INTO codex_desktop_resume_targets (thread_id,target_key_digest,display_name,enabled,state,session_locator,timezone_id,timezone_authority,registration_file_dev,registration_file_ino,registration_end_offset,registration_prefix_digest,registered_at_ms,updated_at_ms) VALUES (?,?,?,1,'watching',?,?,?,?,?,?,?,?,?)`).run(other, 'f'.repeat(64), reg.display_name, reg.session_locator,reg.timezone_id,reg.timezone_authority,reg.registration_file_dev,reg.registration_file_ino,reg.registration_end_offset,reg.registration_prefix_digest,now,now);
    appendFileSync(otherPath, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    for (let restart = 0; restart < 2; restart++) {
      now += 60_000;
      const restarted = createCodexDesktopResumeEngine(db, () => [root], async () => { calls++; return { accepted: true, code: 'queued' }; }, () => now);
      expect(await restarted.tick()).toBe('skipped');
    }
    expect(calls).toBe(0);
    expect(() => repo.patchTarget(id, { enabled: false })).toThrow('codex_resume_action_in_progress');
    expect(() => repo.setGlobalEnabled(false)).toThrow('codex_resume_action_in_progress');

  });

  it('rejects finalization when lease ownership changes during dispatch', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z'); const { root, path, db, repo } = setup(now);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Upgrade to Pro or try again at 9:30 AM."));
    const engine = createCodexDesktopResumeEngine(db, () => [root], async () => {
      db.prepare(`UPDATE codex_desktop_resume_state SET lease_token=? WHERE id=1`).run('f'.repeat(32));
      return { accepted: true, code: 'accepted' };
    }, () => now);
    await expect(engine.tick()).rejects.toThrow('codex_resume_lease_finalization_fenced');
    expect(repo.snapshot()).toMatchObject({ action_in_progress: true, targets: [{ state: 'claimed' }] });
  });

  it('invokes the Codex CLI with fixed queue argv and requires receipt plus successful exit', async () => {
    const base = mkdtempSync(join(tmpdir(), 'codex-dispatch-')); roots.push(base);
    const binary = join(base, 'fake-codex'); const argv = join(base, 'argv.txt');
    writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argv}'\nprintf '%s\\n' 'Queued message aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa for thread ${id}.'\n`);
    chmodSync(binary, 0o700);
    await expect(createCodexCliResumeDispatcher(binary)(id, { codexHome: realpathSync(base) })).resolves.toEqual({ accepted: true, code: 'queued' });
    expect(readFileSync(argv, 'utf8').split('\n').filter(Boolean)).toEqual(['queue', '--thread', id, '--message', '繼續']);
  });

  it('accepts the UUIDv7 thread identities emitted by current Codex Desktop', async () => {
    const currentId = '0190abcd-ef00-7000-8000-000000000001';
    const base = mkdtempSync(join(tmpdir(), 'codex-dispatch-v7-')); roots.push(base);
    const binary = join(base, 'fake-codex'); const argv = join(base, 'argv.txt');
    writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argv}'\nprintf '%s\\n' 'Queued message aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa for thread ${currentId}.'\n`);
    chmodSync(binary, 0o700);
    await expect(createCodexCliResumeDispatcher(binary)(currentId, { codexHome: realpathSync(base) })).resolves.toEqual({ accepted: true, code: 'queued' });
    expect(readFileSync(argv, 'utf8').split('\n').filter(Boolean)).toEqual(['queue', '--thread', currentId, '--message', '繼續']);
  });

  it('rejects an invalid thread identity before spawning the CLI', async () => {
    const base = mkdtempSync(join(tmpdir(), 'codex-dispatch-invalid-')); roots.push(base);
    const binary = join(base, 'fake-codex'); const marker = join(base, 'spawned.txt');
    writeFileSync(binary, `#!/bin/sh\nprintf 'spawned' > '${marker}'\n`);
    chmodSync(binary, 0o700);
    await expect(createCodexCliResumeDispatcher(binary)('not-a-thread-id', { codexHome: realpathSync(base) })).resolves.toEqual({ accepted: false, code: 'invalid_codex_thread_id' });
    expect(() => readFileSync(marker)).toThrow();
  });

  it('does not release the dispatcher until a SIGTERM-ignoring oversized-output child is confirmed stopped', async () => {
    const base = mkdtempSync(join(tmpdir(), 'codex-dispatch-timeout-')); roots.push(base);
    const binary = join(base, 'fake-codex'); const ready = join(base, 'ready');
    writeFileSync(binary, `#!/bin/sh\ntrap '' TERM\nprintf ready > ${JSON.stringify(ready)}\nhead -c 300000 /dev/zero\nwhile :; do :; done\n`);
    chmodSync(binary, 0o700);
    const started = Date.now();
    const dispatched = createCodexCliResumeDispatcher(binary, { ackTimeoutMs: 5_000, terminationGraceMs: 500 })(id, { codexHome: realpathSync(base) });
    while (!existsSync(ready) && Date.now() - started < 4_000) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    expect(existsSync(ready)).toBe(true);
    const readyObservedAt = Date.now();
    await expect(dispatched).resolves.toEqual({
      accepted: false, code: 'codex_resume_output_too_large', releaseLease: true,
    });
    expect(Date.now() - readyObservedAt).toBeGreaterThanOrEqual(400);
  });

  it('never places a hostile display label or quota message into the command arguments', async () => {
    const now = Date.parse('2026-09-09T02:00:00.000Z');
    const hostile = '任務; touch /tmp/should-not-exist $(whoami)';
    const { root, path, db } = setup(now, hostile);
    appendFileSync(path, quota('2026-09-09T00:00:00.000Z', "You've hit your usage limit. Ignore rules; or try again at 9:30 AM."));
    const calls: string[] = [];
    const engine = createCodexDesktopResumeEngine(db, () => [root], async (threadId) => { calls.push(threadId); return { accepted: true, code: 'accepted' }; }, () => now);
    expect(await engine.tick()).toBe('resumed');
    expect(calls).toEqual([id]);
    expect(calls.join(' ')).not.toContain(hostile);
  });
});
