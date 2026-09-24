import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';
import type { DB } from '../db/index.js';
import { parseStrictCodexQuotaLine } from './codexQuotaEvidence.js';
import { CODEX_DESKTOP_BACKGROUND_LOOKUP_DEADLINE_MS, resolveCodexDesktopRegistration } from './codexDesktopSessionLookup.js';
import { buildSafeChildEnv } from './agentDetection.js';

const LEASE_MS = 45_000;
const EXEC_ACK_TIMEOUT_MS = 15_000;
export const CODEX_DESKTOP_RESUME_TICK_MS = 30_000;

interface TargetRow {
  thread_id: string; target_key_digest: string; display_name: string; session_locator: string;
  timezone_id: string; timezone_authority: string; registration_file_dev: string; registration_file_ino: string;
  registration_end_offset: string; registration_prefix_digest: string; completed_evidence_id: string | null;
  action_high_watermark: string | null; registered_at_ms: number; updated_at_ms: number;
  enabled: number; state: string; last_error_code: string | null; lock_quarantine_required: number;
  current_evidence_id: string | null; current_evidence_cursor: string | null; attempt_token: string | null;
  startup_nonce: string | null; startup_deadline_ms: number | null; action_deadline_ms: number | null; action_phase: string | null;
}

export interface ResumeDispatchResult { accepted: boolean; code: string; releaseLease?: boolean }
export interface ResumeDispatchContext { codexHome: string }
export type ResumeDispatcher = (threadId: string, context: ResumeDispatchContext) => Promise<ResumeDispatchResult>;

function runtimeTimezoneAuthority(): string {
  return `node=${process.versions.node};icu=${process.versions.icu};tz=${process.versions.tz}`;
}

function pathForLocator(locator: string, roots: string[]): string | null {
  const match = /^r([0-9]+)\/(.+)$/.exec(locator);
  if (!match) return null;
  const root = roots[Number(match[1])];
  if (!root) return null;
  const base = resolve(root);
  const path = resolve(base, match[2]!);
  return path.startsWith(`${base}${sep}`) ? path : null;
}

const STABLE_READ_ATTEMPTS = 3;
// 'unstable' means Codex appended while the snapshot was taken: identity and
// prefix are unproven either way, so the caller must neither act nor quarantine.
function readStable(path: string): { raw: Buffer; dev: string; ino: string } | 'unstable' | null {
  for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt += 1) {
    let fd: number | null = null;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const before = fstatSync(fd, { bigint: true });
      if (!before.isFile() || before.size > 1024n * 1024n * 1024n) return null;
      const raw = Buffer.alloc(Number(before.size));
      let offset = 0;
      while (offset < raw.length) {
        const count = readSync(fd, raw, offset, raw.length - offset, offset);
        if (!count) break;
        offset += count;
      }
      const after = fstatSync(fd, { bigint: true });
      if (before.dev !== after.dev || before.ino !== after.ino) return null;
      if (offset === raw.length && before.size === after.size && before.mtimeNs === after.mtimeNs) {
        return { raw, dev: before.dev.toString(), ino: before.ino.toString() };
      }
    } catch { return null; } finally { if (fd !== null) closeSync(fd); }
  }
  return 'unstable';
}

interface EvidenceCursor {
  file_dev: string; file_ino: string; end_byte_offset: string; prefix_digest: string;
  event_floor_at_ms?: number; quota_retry_reset_at_ms?: number; quota_retry_count?: number;
}
const safeTime = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function cursorFor(file: { raw: Buffer; dev: string; ino: string }, end: number, extras: Partial<EvidenceCursor> = {}): EvidenceCursor {
  return { ...extras, file_dev: file.dev, file_ino: file.ino, end_byte_offset: String(end),
    prefix_digest: createHash('sha256').update(file.raw.subarray(0, end)).digest('hex') };
}
function evidenceFor(row: TargetRow, roots: string[]) {
  const path = pathForLocator(row.session_locator, roots);
  const file = path ? readStable(path) : null;
  if (file === 'unstable') return { error: 'session_read_unstable' as const };
  const start = Number(row.registration_end_offset);
  if (!file || file.dev !== row.registration_file_dev || file.ino !== row.registration_file_ino
    || !Number.isSafeInteger(start) || start < 0 || start > file.raw.length
    || createHash('sha256').update(file.raw.subarray(0, start)).digest('hex') !== row.registration_prefix_digest) return { error: 'session_integrity_changed' as const };
  let highWaterEnd = start;
  let saved: Partial<EvidenceCursor> = {};
  if (row.action_high_watermark) {
    try {
      const parsed = JSON.parse(row.action_high_watermark) as EvidenceCursor;
      const offset = Number(parsed.end_byte_offset);
      if (parsed.file_dev !== file.dev || parsed.file_ino !== file.ino || !Number.isSafeInteger(offset) || offset < start || offset > file.raw.length
        || typeof parsed.prefix_digest !== 'string' || createHash('sha256').update(file.raw.subarray(0, offset)).digest('hex') !== parsed.prefix_digest
        || (parsed.event_floor_at_ms !== undefined && !safeTime(parsed.event_floor_at_ms))
        || ((parsed.quota_retry_count !== undefined || parsed.quota_retry_reset_at_ms !== undefined)
          && (!safeTime(parsed.quota_retry_reset_at_ms) || !Number.isInteger(parsed.quota_retry_count) || parsed.quota_retry_count! < 0 || parsed.quota_retry_count! > 3))) {
        return { error: 'action_high_watermark_invalid' as const };
      }
      highWaterEnd = offset; saved = parsed;
    } catch { return { error: 'action_high_watermark_invalid' as const }; }
  }
  const candidates: Array<{ id: string; reset: number; event: number; cursor: EvidenceCursor; end: number }> = [];
  let consumedFloor = saved.event_floor_at_ms ?? 0;
  let throughFloor = consumedFloor;
  let lineStart = start;
  while (lineStart < file.raw.length) {
    const newline = file.raw.indexOf(0x0a, lineStart);
    if (newline < 0) break;
    const parsed = parseStrictCodexQuotaLine(file.raw.subarray(lineStart, newline + 1), row.timezone_id);
    if (parsed) {
      throughFloor = Math.max(throughFloor, parsed.event_at_ms);
      if (newline + 1 <= highWaterEnd) consumedFloor = Math.max(consumedFloor, parsed.event_at_ms);
      else if (parsed.event_at_ms > consumedFloor) candidates.push({ id: parsed.raw_line_digest, reset: parsed.reset_at_ms,
        event: parsed.event_at_ms, end: newline + 1, cursor: cursorFor(file, newline + 1, { ...saved, event_floor_at_ms: throughFloor }) });
    }
    lineStart = newline + 1;
  }
  return { file, saved, consumedFloor, candidate: candidates.filter((item) => item.id !== row.completed_evidence_id).at(-1) ?? null };
}
function safeTarget(row: TargetRow, allowRecovery = false): boolean {
  return row.enabled === 1 && row.lock_quarantine_required === 0
    && [row.current_evidence_id, row.current_evidence_cursor, row.attempt_token, row.startup_nonce,
      row.startup_deadline_ms, row.action_deadline_ms, row.action_phase].every(value => value === null)
    && (['watching', 'waiting_for_reset', 'resumed'].includes(row.state)
      || (allowRecovery && row.state === 'needs_attention' && row.last_error_code === 'session_uniqueness_unproven'));
}
function snapshotMatches(a: TargetRow, b: TargetRow): boolean {
  return Object.keys(a).every(key => a[key as keyof TargetRow] === b[key as keyof TargetRow]);
}
function cleanGlobal(db: DB): boolean {
  const state = db.prepare(`SELECT enabled,active_target_digest,owner_id,lease_token,lease_generation,acquired_at_ms,renewed_at_ms,lease_expires_at_ms FROM codex_desktop_resume_state WHERE id=1`).get() as Record<string, unknown>;
  return state.enabled === 1 && Object.entries(state).every(([key,value]) => key === 'enabled' || value === null);
}
function firstMetadata(raw: Buffer, id: string): { at: number; end: number } | null {
  const end = raw.indexOf(0x0a) + 1;
  if (!end) return null;
  try {
    const value = JSON.parse(raw.subarray(0, end).toString('utf8'));
    const at = Date.parse(value.timestamp);
    return value.type === 'session_meta' && value.payload?.id === id && safeTime(at)
      && new Date(at).toISOString() === value.timestamp ? { at, end } : null;
  } catch { return null; }
}
function adoptSegment(db: DB, row: TargetRow, proof: ReturnType<typeof resolveCodexDesktopRegistration>, roots: string[], at: number): TargetRow | null {
  if (row.session_locator === proof.session_locator || row.session_locator.split('/').slice(0,2).join('/') !== proof.session_locator.split('/').slice(0,2).join('/')) return null;
  const old = evidenceFor(row, roots);
  if ('error' in old) return null;
  const path = pathForLocator(proof.session_locator, roots); const file = path ? readStable(path) : null;
  if (!file || file === 'unstable' || file.dev !== proof.registration_file_dev || file.ino !== proof.registration_file_ino
    || file.raw.length < Number(proof.registration_end_offset)
    || createHash('sha256').update(file.raw.subarray(0,Number(proof.registration_end_offset))).digest('hex') !== proof.registration_prefix_digest) return null;
  const previous = firstMetadata(old.file.raw, row.thread_id); const next = firstMetadata(file.raw, row.thread_id);
  if (!previous || !next || next.at <= Math.max(previous.at,row.registered_at_ms,old.consumedFloor) || next.at > at) return null;
  const checkpoint = cursorFor(file,next.end,{...old.saved,event_floor_at_ms:next.at});
  return db.transaction(() => {
    const live = db.prepare('SELECT * FROM codex_desktop_resume_targets WHERE thread_id=?').get(row.thread_id) as TargetRow | undefined;
    if (!cleanGlobal(db) || !live || !snapshotMatches(row,live) || !safeTarget(live,true)) return null;
    db.prepare(`UPDATE codex_desktop_resume_targets SET session_locator=?,registration_file_dev=?,registration_file_ino=?,
      registration_end_offset=?,registration_prefix_digest=?,action_high_watermark=?,state='watching',last_error_code=NULL,reset_at_ms=NULL,updated_at_ms=? WHERE thread_id=?`)
      .run(proof.session_locator,file.dev,file.ino,String(next.end),checkpoint.prefix_digest,JSON.stringify(checkpoint),at,row.thread_id);
    return db.prepare('SELECT * FROM codex_desktop_resume_targets WHERE thread_id=?').get(row.thread_id) as TargetRow;
  }).immediate();
}

export function createCodexDesktopResumeEngine(db: DB, roots: () => string[], dispatcher: ResumeDispatcher, now: () => number = Date.now) {
  const tick = async (): Promise<string> => {
    let global = db.prepare(`SELECT enabled,active_target_digest,lease_expires_at_ms FROM codex_desktop_resume_state WHERE id=1`).get() as { enabled: number; active_target_digest: string | null; lease_expires_at_ms: number | null };
    if (global.active_target_digest && global.lease_expires_at_ms !== null && global.lease_expires_at_ms <= now()) {
      db.transaction(() => {
        const at = now();
        const live = db.prepare(`SELECT active_target_digest,lease_token,lease_generation,lease_expires_at_ms FROM codex_desktop_resume_state WHERE id=1`).get() as {
          active_target_digest: string | null; lease_token: string | null; lease_generation: number | null; lease_expires_at_ms: number | null;
        };
        if (!live.active_target_digest || !live.lease_token || live.lease_generation === null || live.lease_expires_at_ms === null || live.lease_expires_at_ms > at) return;
        const target = db.prepare(`UPDATE codex_desktop_resume_targets SET state='needs_attention',completed_evidence_id=COALESCE(current_evidence_id,completed_evidence_id),action_high_watermark=COALESCE(current_evidence_cursor,action_high_watermark),last_error_code='previous_dispatch_outcome_unknown',lock_quarantine_required=1,attempt_token=NULL,startup_nonce=NULL,startup_deadline_ms=NULL,action_deadline_ms=NULL,action_phase=NULL,current_evidence_id=NULL,current_evidence_cursor=NULL,updated_at_ms=? WHERE target_key_digest=?`).run(at, live.active_target_digest);
        const leaseState = db.prepare(`UPDATE codex_desktop_resume_state SET lease_expires_at_ms=9007199254740991,updated_at_ms=? WHERE id=1 AND active_target_digest=? AND lease_token=? AND lease_generation=? AND lease_expires_at_ms<=?`).run(at, live.active_target_digest, live.lease_token, live.lease_generation, at);
        if (target.changes !== 1 || leaseState.changes !== 1) throw new Error('codex_resume_lease_recovery_fenced');
      }).immediate();
      global = db.prepare(`SELECT enabled,active_target_digest,lease_expires_at_ms FROM codex_desktop_resume_state WHERE id=1`).get() as typeof global;
    }
    if (!global.enabled || global.active_target_digest) return 'skipped';
    // A runtime mismatch is detected before any evidence is claimed or input is
    // sent. If the exact registered runtime returns, monitoring can safely
    // resume without clearing any post-claim or unknown-dispatch failure.
    db.prepare(`UPDATE codex_desktop_resume_targets
      SET state='watching',last_error_code=NULL,updated_at_ms=?
      WHERE enabled=1 AND state='needs_attention' AND last_error_code='timezone_authority_changed'
        AND timezone_authority=? AND current_evidence_id IS NULL AND current_evidence_cursor IS NULL
        AND attempt_token IS NULL AND action_phase IS NULL`).run(now(), runtimeTimezoneAuthority());
    const rows = db.prepare(`SELECT * FROM codex_desktop_resume_targets WHERE enabled=1 AND
      (state IN ('watching','waiting_for_reset','resumed') OR (state='needs_attention' AND last_error_code='session_uniqueness_unproven'))
      ORDER BY registered_at_ms,thread_id`).all() as TargetRow[];
    for (let row of rows) {
      if (!safeTarget(row,true)) continue;
      if (row.timezone_authority !== runtimeTimezoneAuthority()) {
        db.prepare(`UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code='timezone_authority_changed',updated_at_ms=? WHERE thread_id=?`).run(now(), row.thread_id);
        continue;
      }
      const currentRoots = roots();
      try {
        const proof = resolveCodexDesktopRegistration(row.thread_id, row.display_name, currentRoots, { deadlineMs: CODEX_DESKTOP_BACKGROUND_LOOKUP_DEADLINE_MS });
        if (proof.session_locator !== row.session_locator || proof.registration_file_dev !== row.registration_file_dev || proof.registration_file_ino !== row.registration_file_ino) {
          const adopted = adoptSegment(db,row,proof,currentRoots,now());
          if (!adopted) throw new Error('changed');
          row = adopted;
        } else if (row.state === 'needs_attention') {
          const recovered = db.transaction(() => {
            const live = db.prepare('SELECT * FROM codex_desktop_resume_targets WHERE thread_id=?').get(row.thread_id) as TargetRow | undefined;
            if (!cleanGlobal(db) || !live || !snapshotMatches(row,live) || !safeTarget(live,true)) return null;
            db.prepare("UPDATE codex_desktop_resume_targets SET state='watching',last_error_code=NULL,updated_at_ms=? WHERE thread_id=?").run(now(),row.thread_id);
            return db.prepare('SELECT * FROM codex_desktop_resume_targets WHERE thread_id=?').get(row.thread_id) as TargetRow;
          }).immediate();
          if (!recovered) continue;
          row = recovered;
        }
      } catch {
        db.prepare(`UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code='session_uniqueness_unproven',updated_at_ms=? WHERE thread_id=?`).run(now(), row.thread_id);
        continue;
      }
      const observed = evidenceFor(row, currentRoots);
      if ('error' in observed && observed.error === 'session_read_unstable') continue;
      if ('error' in observed) {
        db.prepare(`UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code=?,updated_at_ms=? WHERE thread_id=?`).run(observed.error, now(), row.thread_id);
        continue;
      }
      if (!observed.candidate) continue;
      const candidate = observed.candidate;
      if (candidate.event > now()) continue;
      const recentPast = candidate.reset <= candidate.event;
      const previousReset = observed.saved.quota_retry_reset_at_ms ?? 0;
      const previousCount = observed.saved.quota_retry_count ?? 0;
      if (recentPast && previousCount >= 3) {
        db.prepare("UPDATE codex_desktop_resume_targets SET state='needs_attention',last_error_code='quota_retry_exhausted',updated_at_ms=? WHERE thread_id=? AND updated_at_ms=? AND enabled=1")
          .run(now(),row.thread_id,row.updated_at_ms);
        continue;
      }
      const due = recentPast ? candidate.event + 300_000 : candidate.reset + 60_000;
      if (due > now()) {
        db.prepare(`UPDATE codex_desktop_resume_targets SET state='waiting_for_reset',reset_at_ms=?,updated_at_ms=? WHERE thread_id=?`).run(due, now(), row.thread_id);
        continue;
      }
      const claimCursor = JSON.stringify({ ...candidate.cursor,
        quota_retry_reset_at_ms: Math.max(previousReset,candidate.reset),
        quota_retry_count: recentPast ? previousCount + 1 : candidate.reset > previousReset ? 0 : previousCount });
      const owner = randomBytes(16).toString('hex'); const lease = randomBytes(16).toString('hex'); const attempt = randomBytes(16).toString('hex'); const nonce = randomBytes(16).toString('hex');
      const claimed = db.transaction(() => {
        const live = db.prepare('SELECT * FROM codex_desktop_resume_targets WHERE thread_id=?').get(row.thread_id) as TargetRow | undefined;
        if (!cleanGlobal(db) || !live || !safeTarget(live) || !snapshotMatches(row,live)) return false;
        const at = now();
        db.prepare(`UPDATE codex_desktop_resume_state SET active_target_digest=?,owner_id=?,lease_token=?,lease_generation=1,acquired_at_ms=?,renewed_at_ms=?,lease_expires_at_ms=?,updated_at_ms=? WHERE id=1`).run(row.target_key_digest, owner, lease, at, at, at + LEASE_MS, at);
        const changed = db.prepare(`UPDATE codex_desktop_resume_targets SET state='claimed',current_evidence_id=?,current_evidence_cursor=?,reset_at_ms=?,attempt_token=?,startup_nonce=?,startup_deadline_ms=?,action_deadline_ms=?,action_phase='claimed',updated_at_ms=? WHERE thread_id=?`).run(candidate.id, claimCursor, candidate.reset, attempt, nonce, at + EXEC_ACK_TIMEOUT_MS, at + LEASE_MS, at, row.thread_id);
        if (changed.changes !== 1) throw new Error('codex_resume_claim_fenced');
        return true;
      }).immediate();
      if (!claimed) return 'skipped';
      let result: ResumeDispatchResult;
      try {
        const rootIndex = /^r([0-9]+)\//.exec(row.session_locator)?.[1];
        const codexHome = rootIndex === undefined ? null : currentRoots[Number(rootIndex)];
        result = codexHome
          ? await dispatcher(row.thread_id, { codexHome: realpathSync(codexHome) })
          : { accepted: false, code: 'codex_resume_store_unverified' };
      } catch { result = { accepted: false, code: 'dispatch_failed', releaseLease: false }; }
      const at = now();
      db.transaction(() => {
        const target = db.prepare(`UPDATE codex_desktop_resume_targets SET state=?,completed_evidence_id=?,action_high_watermark=?,last_error_code=?,lock_quarantine_required=?,
          attempt_token=NULL,startup_nonce=NULL,startup_deadline_ms=NULL,action_deadline_ms=NULL,action_phase=NULL,current_evidence_id=NULL,current_evidence_cursor=NULL,updated_at_ms=? WHERE thread_id=? AND attempt_token=?`)
          .run(result.accepted ? 'resumed' : 'needs_attention', candidate.id, claimCursor, result.accepted ? null : result.code, result.releaseLease === false ? 1 : 0, at, row.thread_id, attempt);
        const leaseState = result.releaseLease === false
          ? db.prepare(`UPDATE codex_desktop_resume_state SET renewed_at_ms=?,lease_expires_at_ms=?,updated_at_ms=? WHERE id=1 AND active_target_digest=? AND lease_token=? AND lease_generation=1`).run(at, Number.MAX_SAFE_INTEGER, at, row.target_key_digest, lease)
          : db.prepare(`UPDATE codex_desktop_resume_state SET active_target_digest=NULL,owner_id=NULL,lease_token=NULL,lease_generation=NULL,acquired_at_ms=NULL,renewed_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=? WHERE id=1 AND active_target_digest=? AND lease_token=? AND lease_generation=1`).run(at, row.target_key_digest, lease);
        if (target.changes !== 1 || leaseState.changes !== 1) throw new Error('codex_resume_lease_finalization_fenced');
      }).immediate();
      return result.accepted ? 'resumed' : 'needs_attention';
    }
    return 'watching';
  };
  return { tick };
}

const CANONICAL_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const THREAD_UUID = new RegExp(`^${CANONICAL_UUID}$`);

function queueFailureCode(stderr: string): string {
  if (/active writer|thread-store conflict/i.test(stderr)) return 'codex_resume_active_writer';
  if (/unrecognized subcommand ['"]queue['"]|unknown (?:command|subcommand).*queue/i.test(stderr)) return 'codex_resume_queue_unsupported';
  if (/no rollout found|thread not found|session not found/i.test(stderr)) return 'codex_resume_session_not_found';
  if (/not logged in|authentication required|unauthorized|please (?:log|sign) in/i.test(stderr)) return 'codex_resume_auth_required';
  return 'codex_resume_command_failed';
}

export function createCodexCliResumeDispatcher(binaryPath: string, options: { ackTimeoutMs?: number; terminationGraceMs?: number } = {}): ResumeDispatcher {
  const ackTimeoutMs = options.ackTimeoutMs ?? EXEC_ACK_TIMEOUT_MS;
  const terminationGraceMs = options.terminationGraceMs ?? 2_000;
  return (threadId, context) => new Promise((resolvePromise) => {
    if (!THREAD_UUID.test(threadId) || threadId.length !== 36) {
      resolvePromise({ accepted: false, code: 'invalid_codex_thread_id' });
      return;
    }
    try {
      if (!context || !isAbsolute(context.codexHome) || realpathSync(context.codexHome) !== context.codexHome
        || !statSync(context.codexHome).isDirectory()) throw new Error('invalid store');
    } catch {
      resolvePromise({ accepted: false, code: 'codex_resume_store_unverified' });
      return;
    }
    let settled = false; let terminating = false; let closed = false;
    let stdout = ''; let stderr = ''; let stdoutBytes = 0; let stderrBytes = 0;
    const ackDeadline = performance.now() + ackTimeoutMs;
    const child = spawn(binaryPath, ['queue', '--thread', threadId, '--message', '繼續'], {
      cwd: '/', shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
      env: { ...buildSafeChildEnv(process.env, homedir()), CODEX_HOME: context.codexHome },
    });
    const timer = setTimeout(() => { void terminate('codex_resume_ack_timeout'); }, ackTimeoutMs);
    const finish = (result: ResumeDispatchResult) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      // Unknown process groups remain quarantined; they must not keep the runner alive.
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      resolvePromise(result);
    };
    const groupAbsent = (): boolean => {
      if (!child.pid) return closed;
      try { process.kill(-child.pid, 0); return false; }
      catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
    };
    const stopped = () => closed && groupAbsent();
    const waitForStopped = async (): Promise<boolean> => {
      const deadline = performance.now() + terminationGraceMs;
      while (!stopped() && performance.now() < deadline) {
        await new Promise((done) => setTimeout(done, Math.min(20, Math.max(1, deadline - performance.now()))));
      }
      return stopped();
    };
    const signalGroup = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); } catch { /* absence must be proved separately */ }
    };
    async function terminate(code: string, acceptedAfterCleanup = false) {
      if (settled || terminating) return;
      terminating = true;
      signalGroup('SIGTERM');
      let confirmed = await waitForStopped();
      if (!confirmed) { signalGroup('SIGKILL'); confirmed = await waitForStopped(); }
      if (confirmed && acceptedAfterCleanup) finish({ accepted: true, code: 'queued' });
      else finish({ accepted: false, code: confirmed ? code : `${code}_process_unterminated`, releaseLease: confirmed });
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 256 * 1024) { void terminate('codex_resume_output_too_large'); return; }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 16 * 1024) { void terminate('codex_resume_output_too_large'); return; }
      stderr += chunk.toString('utf8');
    });
    child.once('error', () => {
      if (!child.pid) { closed = true; finish({ accepted: false, code: 'codex_resume_command_failed' }); }
      else void terminate('codex_resume_command_failed');
    });
    child.once('close', (code, signal) => {
      closed = true;
      if (terminating || settled) return;
      if (performance.now() > ackDeadline) { void terminate('codex_resume_ack_timeout'); return; }
      const match = new RegExp(`^Queued message ${CANONICAL_UUID} for thread ${threadId}\\.\\r?\\n$`).exec(stdout);
      const accepted = code === 0 && signal === null && match !== null && match[0] === stdout;
      const failure = code !== 0 || signal !== null ? queueFailureCode(stderr) : 'codex_resume_queue_receipt_invalid';
      if (!groupAbsent()) { void terminate(failure, accepted); return; }
      finish({ accepted, code: accepted ? 'queued' : failure });
    });
  });
}
