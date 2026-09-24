import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { normalizeCodexDisplayName } from './codexDesktopResumeContracts.js';
import type { VerifiedTargetRegistration } from './codexDesktopResumeRepository.js';

const MAX_FILES = 100_000;
const MAX_DEPTH = 12;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const METADATA_PREFIX_BYTES = 512 * 1024;
const LOOKUP_DEADLINE_MS = 5_000;
export const CODEX_DESKTOP_BACKGROUND_LOOKUP_DEADLINE_MS = 30_000;

function timezoneAuthority(): { timezone_id: string; timezone_authority: string } {
  const zone = Intl.DateTimeFormat('en-US').resolvedOptions().timeZone;
  const canonical = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  const node = process.versions.node;
  const icu = process.versions.icu;
  const tz = process.versions.tz;
  if (!zone || canonical !== zone || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone)
    || zone === 'UTC' || zone.startsWith('Etc/GMT') || !node || !icu || !tz) throw new Error('invalid_timezone_authority');
  return { timezone_id: zone, timezone_authority: `node=${node};icu=${icu};tz=${tz}` };
}

function metadataEntries(raw: Buffer): Array<{ id: string; started_at_ms: number | null }> {
  const lines = raw.toString('utf8').split('\n');
  if (raw.at(-1) !== 0x0a) lines.pop();
  const entries: Array<{ id: string; started_at_ms: number | null }> = [];
  for (const line of lines) {
    if (!line) continue;
    let value: any;
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.type === 'session_meta' && typeof value?.payload?.id === 'string') {
      const parsed = typeof value.timestamp === 'string' ? Date.parse(value.timestamp) : Number.NaN;
      entries.push({ id: value.payload.id, started_at_ms: Number.isFinite(parsed) ? parsed : null });
    }
  }
  return entries;
}

function metadataIds(raw: Buffer): string[] { return metadataEntries(raw).map((entry) => entry.id); }

export function resolveCodexDesktopRegistration(threadId: string, displayName: unknown, configuredRoots: string[], options: { deadlineMs?: number } = {}): VerifiedTargetRegistration {
  const deadlineMs = options.deadlineMs ?? LOOKUP_DEADLINE_MS;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > CODEX_DESKTOP_BACKGROUND_LOOKUP_DEADLINE_MS) {
    throw new Error('invalid_resume_lookup_deadline');
  }
  if (!configuredRoots.length) throw new Error('resume_probe_incomplete');
  const matches: Array<{ rootIndex: number; area: string; path: string; started_at_ms: number | null }> = [];
  let seenFiles = 0;
  const deadline = Date.now() + deadlineMs;
  const assertWithinDeadline = (): void => {
    if (Date.now() > deadline) throw new Error('resume_probe_incomplete');
  };
  const readMetadataPrefix = (path: string, size: number): Buffer => {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const length = Math.min(size, METADATA_PREFIX_BYTES);
      const raw = Buffer.alloc(length); let offset = 0;
      while (offset < length) { const count = readSync(fd, raw, offset, length - offset, offset); if (!count) break; offset += count; }
      return raw.subarray(0, offset);
    } finally { closeSync(fd); }
  };
  const visit = (rootIndex: number, area: string, path: string, depth: number): void => {
    assertWithinDeadline();
    if (depth > MAX_DEPTH) throw new Error('resume_probe_incomplete');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(rootIndex, area, resolve(path, entry), depth + 1);
      return;
    }
    if (!stat.isFile() || !path.endsWith('.jsonl')) return;
    if (++seenFiles > MAX_FILES || stat.size > MAX_FILE_BYTES) throw new Error('resume_probe_incomplete');
    const raw = readMetadataPrefix(path, stat.size);
    const found = metadataEntries(raw).filter((entry) => entry.id === threadId);
    if (found.length) matches.push({ rootIndex, area, path, started_at_ms: found.length === 1 ? found[0]!.started_at_ms : null });
  };
  try {
    configuredRoots.forEach((root, index) => {
      const base = resolve(root);
      const rootStat = lstatSync(base);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('resume_probe_incomplete');
      // Configured roots are Codex homes, as in the activity scanner. Copies in
      // memories/plugins/tmp are not session stores and may be arbitrarily deep.
      for (const location of ['sessions', 'archived_sessions']) {
        const path = resolve(base, location);
        let stat;
        try { stat = lstatSync(path); } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('resume_probe_incomplete');
        visit(index, location, path, 1);
      }
    });
  } catch { throw new Error('resume_probe_incomplete'); }
  assertWithinDeadline();
  if (!matches.length) throw new Error('codex_session_not_found');
  let match = matches[0]!;
  if (matches.length > 1) {
    const sameCanonicalStore = matches.every((candidate) => candidate.rootIndex === match.rootIndex && candidate.area === match.area);
    const starts = matches.map((candidate) => candidate.started_at_ms);
    const isSequential = sameCanonicalStore && starts.every((value): value is number => value !== null)
      && new Set(starts).size === starts.length;
    if (!isSequential) throw new Error('duplicate_codex_session_identity');
    match = [...matches].sort((a, b) => b.started_at_ms! - a.started_at_ms!)[0]!;
  }
  const root = resolve(configuredRoots[match.rootIndex]!);
  const rel = relative(root, match.path);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') throw new Error('resume_probe_incomplete');
  const fd = openSync(match.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_FILE_BYTES)) throw new Error('resume_probe_incomplete');
    const raw = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < raw.length) {
      const count = readSync(fd, raw, offset, raw.length - offset, offset);
      if (count === 0) throw new Error('resume_probe_incomplete');
      offset += count;
    }
    const after = fstatSync(fd, { bigint: true });
    const ids = metadataIds(raw);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || ids.length !== 1 || ids[0] !== threadId) throw new Error('resume_probe_incomplete');
    const authority = timezoneAuthority();
    const prefixDigest = createHash('sha256').update(raw).digest('hex');
    assertWithinDeadline();
    return {
      thread_id: threadId, display_name: normalizeCodexDisplayName(displayName),
      session_locator: `r${match.rootIndex}/${rel.split(sep).join('/')}`,
      ...authority, registration_file_dev: before.dev.toString(), registration_file_ino: before.ino.toString(),
      registration_end_offset: before.size.toString(), registration_prefix_digest: prefixDigest,
    };
  } finally { closeSync(fd); }
}
