import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import {
  createCodexDesktopResumeRepository,
  type VerifiedTargetRegistration,
} from '../src/services/codexDesktopResumeRepository.js';

const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function registration(threadId: string, displayName = '同名任務'): VerifiedTargetRegistration {
  return {
    thread_id: threadId,
    display_name: displayName,
    session_locator: `root:${threadId}.jsonl`,
    timezone_id: 'Asia/Taipei',
    timezone_authority: 'node=22.0.0;icu=75.1;tz=2024a',
    registration_file_dev: '1',
    registration_file_ino: threadId === idA ? '10' : '11',
    registration_end_offset: '100',
    registration_prefix_digest: 'c'.repeat(64),
  };
}

describe('Codex Desktop v8 multi-target repository', () => {
  it('registers same-name targets by exact thread identity without persisting raw deep links', () => {
    const db = openDb(':memory:');
    const repo = createCodexDesktopResumeRepository(db, () => 1000);
    repo.registerVerifiedTarget(registration(idA));
    repo.registerVerifiedTarget(registration(idB));
    expect(repo.snapshot().targets.map((target) => [target.thread_id, target.display_name])).toEqual([
      [idA, '同名任務'], [idB, '同名任務'],
    ]);
    expect(JSON.stringify(db.prepare(`SELECT * FROM codex_desktop_resume_targets`).all())).not.toContain('codex://');
    expect(() => repo.registerVerifiedTarget(registration(idA, '覆蓋'))).toThrow('duplicate_codex_resume_target');
  });

  it('renames, pauses, resumes and deletes exactly one target', () => {
    const db = openDb(':memory:');
    const repo = createCodexDesktopResumeRepository(db, () => 1000);
    repo.registerVerifiedTarget(registration(idA));
    repo.registerVerifiedTarget(registration(idB));
    repo.patchTarget(idA, { display_name: '新名稱', enabled: false });
    expect(repo.snapshot().targets[0]).toMatchObject({ thread_id: idA, display_name: '新名稱', enabled: false });
    expect(repo.snapshot().targets[1]).toMatchObject({ thread_id: idB, enabled: true });
    repo.patchTarget(idA, { enabled: true });
    repo.deleteTarget(idB);
    expect(repo.snapshot().targets).toHaveLength(1);
    expect(repo.snapshot().targets[0]).toMatchObject({ thread_id: idA, enabled: true });
  });

  it('rejects unknown keys, missing targets and every configuration mutation while a lease is active', () => {
    const db = openDb(':memory:');
    const repo = createCodexDesktopResumeRepository(db, () => 1000);
    repo.registerVerifiedTarget(registration(idA));
    expect(() => repo.patchTarget(idA, {})).toThrow('invalid_codex_target_patch');
    expect(() => repo.patchTarget(idA, { display_name: 'x', unexpected: true } as never)).toThrow('invalid_codex_target_patch');
    expect(() => repo.deleteTarget(idB)).toThrow('codex_resume_target_not_found');

    const digest = repo.snapshot().targets[0]!.target_key_digest;
    db.prepare(`UPDATE codex_desktop_resume_state SET
      active_target_digest=?,owner_id=?,lease_token=?,lease_generation=1,
      acquired_at_ms=1,renewed_at_ms=1,lease_expires_at_ms=999999 WHERE id=1`)
      .run(digest, 'd'.repeat(32), 'e'.repeat(32));
    expect(() => repo.setGlobalEnabled(true)).toThrow('codex_resume_action_in_progress');
    expect(() => repo.registerVerifiedTarget(registration(idB))).toThrow('codex_resume_action_in_progress');
    expect(() => repo.patchTarget(idA, { enabled: false })).toThrow('codex_resume_action_in_progress');
    expect(() => repo.deleteTarget(idA)).toThrow('codex_resume_action_in_progress');
    expect(repo.snapshot().targets).toHaveLength(1);
  });
  it.each(['codex_resume_active_writer', 'codex_resume_queue_unsupported', 'codex_resume_session_not_found', 'codex_resume_auth_required'])('recovers monitoring only on explicit false-to-true for %s without replaying consumed evidence', (code) => {
    const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => 1000);
    repo.registerVerifiedTarget(registration(idA));
    db.prepare("UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code=?,completed_evidence_id=?,action_high_watermark='{}'").run(code, 'c'.repeat(64));
    repo.patchTarget(idA, { enabled: true });
    expect(repo.snapshot().targets[0]?.state).toBe('needs_attention');
    repo.patchTarget(idA, { enabled: false }); repo.patchTarget(idA, { enabled: true });
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'watching', last_error_code: null });
    expect(db.prepare('SELECT completed_evidence_id,action_high_watermark FROM codex_desktop_resume_targets').get()).toEqual({ completed_evidence_id: 'c'.repeat(64), action_high_watermark: '{}' });
  });
  it.each(['codex_resume_not_acknowledged', 'codex_resume_queue_receipt_invalid', 'codex_resume_ack_timeout', 'codex_resume_output_too_large', 'codex_resume_command_failed', 'previous_dispatch_outcome_unknown', 'codex_resume_active_writer_process_unterminated'])('never recovers an uncertain outcome %s through enabled toggles', (code) => {
    const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => 1000);
    repo.registerVerifiedTarget(registration(idA));
    db.prepare("UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code=?,completed_evidence_id=?,action_high_watermark='{}'").run(code, 'c'.repeat(64));
    repo.patchTarget(idA, { enabled: false }); repo.patchTarget(idA, { enabled: true });
    expect(repo.snapshot().targets[0]).toMatchObject({ state: 'needs_attention', last_error_code: code });
  });
  it.each(["completed_evidence_id=NULL", "action_high_watermark=NULL", "current_evidence_id='x'", "current_evidence_cursor='{}'", "attempt_token='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',startup_nonce='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',startup_deadline_ms=1000,action_deadline_ms=1000", "action_phase='claimed'", "lock_quarantine_required=1"])('requires complete clean recovery preconditions: %s', (dirty) => {
    const db = openDb(':memory:'); const repo = createCodexDesktopResumeRepository(db, () => 1000);
    repo.registerVerifiedTarget(registration(idA));
    db.prepare("UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code='codex_resume_active_writer',completed_evidence_id=?,action_high_watermark='{}'").run('c'.repeat(64));
    db.exec('UPDATE codex_desktop_resume_targets SET ' + dirty);
    repo.patchTarget(idA, { enabled: false }); repo.patchTarget(idA, { enabled: true });
    expect(repo.snapshot().targets[0]?.state).toBe('needs_attention');
  });

});
