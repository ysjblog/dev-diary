import type { DB } from '../db/index.js';
import { codexTargetKeyDigest, normalizeCodexDisplayName } from './codexDesktopResumeContracts.js';

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOWER_HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/;

export interface VerifiedTargetRegistration {
  thread_id: string;
  display_name: string;
  session_locator: string;
  timezone_id: string;
  timezone_authority: string;
  registration_file_dev: string;
  registration_file_ino: string;
  registration_end_offset: string;
  registration_prefix_digest: string;
}

export interface CodexResumeTargetSnapshot {
  thread_id: string;
  target_key_digest: string;
  display_name: string;
  enabled: boolean;
  state: string;
  registered_at_ms: number;
  updated_at_ms: number;
  reset_at_ms: number | null;
  last_error_code: string | null;
}

export interface CodexResumeSnapshot {
  enabled: boolean;
  revision: number;
  action_in_progress: boolean;
  targets: CodexResumeTargetSnapshot[];
}

function fail(code: string): never {
  throw new Error(code);
}

function assertSafeTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid_codex_resume_time');
}

function validateRegistration(value: VerifiedTargetRegistration): VerifiedTargetRegistration {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== [
    'display_name', 'registration_end_offset', 'registration_file_dev', 'registration_file_ino',
    'registration_prefix_digest', 'session_locator', 'thread_id', 'timezone_authority', 'timezone_id',
  ].sort().join(',')) fail('invalid_verified_target_registration');
  if (!THREAD_ID_PATTERN.test(value.thread_id)) fail('invalid_codex_thread_id');
  const displayName = normalizeCodexDisplayName(value.display_name);
  if (
    typeof value.session_locator !== 'string' || value.session_locator.length < 3 || value.session_locator.length > 1024
    || value.session_locator.startsWith('/') || value.session_locator.includes('\0') || value.session_locator.split('/').includes('..')
    || typeof value.timezone_id !== 'string' || value.timezone_id.length > 128 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value.timezone_id)
    || typeof value.timezone_authority !== 'string' || value.timezone_authority.length < 3 || value.timezone_authority.length > 256
    || !DECIMAL_PATTERN.test(value.registration_file_dev) || !DECIMAL_PATTERN.test(value.registration_file_ino)
    || !DECIMAL_PATTERN.test(value.registration_end_offset) || !LOWER_HEX_64_PATTERN.test(value.registration_prefix_digest)
  ) fail('invalid_verified_target_registration');
  return { ...value, display_name: displayName };
}

function cleanIdle(db: DB): boolean {
  const row = db.prepare(`SELECT active_target_digest,owner_id,lease_token,lease_generation,
    acquired_at_ms,renewed_at_ms,lease_expires_at_ms FROM codex_desktop_resume_state WHERE id=1`).get() as Record<string, unknown>;
  return Object.values(row).every((value) => value === null);
}

function requireCleanIdle(db: DB): void {
  if (!cleanIdle(db)) fail('codex_resume_action_in_progress');
}

function targetExists(db: DB, threadId: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM codex_desktop_resume_targets WHERE thread_id=?`).get(threadId));
}

export function createCodexDesktopResumeRepository(db: DB, now: () => number = Date.now) {
  const snapshot = (): CodexResumeSnapshot => {
    const state = db.prepare(`SELECT enabled,revision,active_target_digest FROM codex_desktop_resume_state WHERE id=1`).get() as {
      enabled: number; revision: number; active_target_digest: string | null;
    };
    const rows = db.prepare(`SELECT thread_id,target_key_digest,display_name,enabled,state,
      registered_at_ms,updated_at_ms,reset_at_ms,last_error_code FROM codex_desktop_resume_targets
      ORDER BY registered_at_ms,thread_id`).all() as Array<Omit<CodexResumeTargetSnapshot, 'enabled'> & { enabled: number }>;
    return {
      enabled: state.enabled === 1,
      revision: state.revision,
      action_in_progress: state.active_target_digest !== null,
      targets: rows.map((row) => ({ ...row, enabled: row.enabled === 1 })),
    };
  };

  const registerVerifiedTarget = (input: VerifiedTargetRegistration): CodexResumeSnapshot => {
    const value = validateRegistration(input);
    const at = now();
    assertSafeTime(at);
    const run = db.transaction(() => {
      requireCleanIdle(db);
      if (targetExists(db, value.thread_id)) fail('duplicate_codex_resume_target');
      db.prepare(`INSERT INTO codex_desktop_resume_targets
        (thread_id,target_key_digest,display_name,enabled,state,session_locator,timezone_id,timezone_authority,
         registration_file_dev,registration_file_ino,registration_end_offset,registration_prefix_digest,
         registered_at_ms,updated_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        value.thread_id, codexTargetKeyDigest(value.thread_id), value.display_name, 1, 'watching', value.session_locator,
        value.timezone_id, value.timezone_authority, value.registration_file_dev, value.registration_file_ino,
        value.registration_end_offset, value.registration_prefix_digest, at, at,
      );
      db.prepare(`UPDATE codex_desktop_resume_state SET revision=revision+1,updated_at_ms=? WHERE id=1`).run(at);
    });
    try { run.immediate(); } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) fail('duplicate_codex_resume_target');
      throw error;
    }
    return snapshot();
  };

  const patchTarget = (threadId: string, patch: { display_name?: string; enabled?: boolean }): CodexResumeSnapshot => {
    if (!THREAD_ID_PATTERN.test(threadId) || !patch || typeof patch !== 'object') fail('invalid_codex_target_patch');
    const keys = Object.keys(patch);
    if (!keys.length || keys.some((key) => key !== 'display_name' && key !== 'enabled')) fail('invalid_codex_target_patch');
    const displayName = 'display_name' in patch ? normalizeCodexDisplayName(patch.display_name) : undefined;
    if ('enabled' in patch && typeof patch.enabled !== 'boolean') fail('invalid_codex_target_patch');
    const at = now();
    assertSafeTime(at);
    const run = db.transaction(() => {
      requireCleanIdle(db);
      if (!targetExists(db, threadId)) fail('codex_resume_target_not_found');
      // Only a deliberate re-enable can recover known failures; never replay consumed evidence.
      if (patch.enabled === true) {
        db.prepare(`UPDATE codex_desktop_resume_targets SET state='watching',last_error_code=NULL
          WHERE thread_id=? AND enabled=0 AND state='needs_attention'
            AND last_error_code IN ('codex_resume_active_writer','codex_resume_queue_unsupported','codex_resume_session_not_found','codex_resume_auth_required')
            AND completed_evidence_id IS NOT NULL AND action_high_watermark IS NOT NULL
            AND current_evidence_id IS NULL AND current_evidence_cursor IS NULL
            AND attempt_token IS NULL AND action_phase IS NULL AND lock_quarantine_required=0`).run(threadId);
      }
      db.prepare(`UPDATE codex_desktop_resume_targets SET
        display_name=COALESCE(?,display_name), enabled=COALESCE(?,enabled), updated_at_ms=? WHERE thread_id=?`)
        .run(displayName ?? null, patch.enabled === undefined ? null : Number(patch.enabled), at, threadId);
      db.prepare(`UPDATE codex_desktop_resume_state SET revision=revision+1,updated_at_ms=? WHERE id=1`).run(at);
    });
    run.immediate();
    return snapshot();
  };

  const deleteTarget = (threadId: string): CodexResumeSnapshot => {
    if (!THREAD_ID_PATTERN.test(threadId)) fail('codex_resume_target_not_found');
    const at = now();
    assertSafeTime(at);
    const run = db.transaction(() => {
      requireCleanIdle(db);
      const result = db.prepare(`DELETE FROM codex_desktop_resume_targets WHERE thread_id=?`).run(threadId);
      if (result.changes !== 1) fail('codex_resume_target_not_found');
      db.prepare(`UPDATE codex_desktop_resume_state SET revision=revision+1,updated_at_ms=? WHERE id=1`).run(at);
    });
    run.immediate();
    return snapshot();
  };

  const setGlobalEnabled = (enabled: boolean): CodexResumeSnapshot => {
    if (typeof enabled !== 'boolean') fail('invalid_codex_global_patch');
    const at = now();
    assertSafeTime(at);
    const run = db.transaction(() => {
      requireCleanIdle(db);
      db.prepare(`UPDATE codex_desktop_resume_state SET enabled=?,revision=revision+1,updated_at_ms=? WHERE id=1`).run(Number(enabled), at);
    });
    run.immediate();
    return snapshot();
  };

  return { snapshot, registerVerifiedTarget, patchTarget, deleteTarget, setGlobalEnabled };
}
