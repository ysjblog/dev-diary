import { createHash } from 'node:crypto';

export const CODEX_PROCESS_TITLE_PREFIX = 'devdiary-resume-';
export const EXPECTED_CORE_TARGET_HEADER_MAX_BYTES = 8 * 1024;

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOWER_HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7e]+$/;

export interface VerifiedCoreTargetSnapshot {
  origin: string;
  source: 'verified_manifest';
  manifest_digest: string;
  runtime: {
    host: '127.0.0.1' | 'localhost';
    port: number;
    pid: number;
    started_at: string;
  };
  api_contract_version: number;
  capabilities: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isCanonicalRfc3339(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('invalid_verified_core_target');
  return encoded;
}

export function parseCodexThreadDeepLink(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_codex_thread_deep_link');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid_codex_thread_deep_link');
  }
  const id = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
  if (
    parsed.protocol !== 'codex:' || parsed.hostname !== 'threads' || parsed.username || parsed.password
    || parsed.port || parsed.search || parsed.hash || !THREAD_ID_PATTERN.test(id)
    || value !== `codex://threads/${id}`
  ) throw new Error('invalid_codex_thread_deep_link');
  return id;
}

export function normalizeCodexDisplayName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_codex_display_name');
  const normalized = value.normalize('NFC').trim();
  if (!normalized || [...normalized].length > 160 || /[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) {
    throw new Error('invalid_codex_display_name');
  }
  return normalized;
}

export function codexTargetKeyDigest(threadId: unknown): string {
  if (typeof threadId !== 'string' || !THREAD_ID_PATTERN.test(threadId)) throw new Error('invalid_codex_thread_id');
  return createHash('sha256').update(Buffer.concat([
    Buffer.from('devdiary-codex-target-v1', 'ascii'), Buffer.from([0]), Buffer.from(threadId, 'ascii'),
  ])).digest('hex');
}

export function parseProcessTitleOutput(output: unknown): string | null {
  if (typeof output !== 'string') return null;
  const bytes = Buffer.from(output, 'utf8');
  if (bytes.length < 49 || bytes.length > 256 || bytes.at(-1) !== 0x0a) return null;
  const body = bytes.subarray(0, -1);
  const title = body.subarray(0, 48);
  const suffix = body.subarray(48);
  if (suffix.length > 207 || [...suffix].some((byte) => byte !== 0x20)) return null;
  const titleText = title.toString('ascii');
  if (!/^devdiary-resume-[0-9a-f]{32}$/.test(titleText) || !title.equals(Buffer.from(titleText, 'ascii'))) return null;
  return titleText;
}

export function validateVerifiedCoreTargetSnapshot(value: unknown): VerifiedCoreTargetSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, [
    'origin', 'source', 'manifest_digest', 'runtime', 'api_contract_version', 'capabilities',
  ])) throw new Error('invalid_verified_core_target');
  if (value.source !== 'verified_manifest' || typeof value.origin !== 'string' || !LOWER_HEX_64_PATTERN.test(String(value.manifest_digest))) {
    throw new Error('invalid_verified_core_target');
  }
  let origin: URL;
  try { origin = new URL(value.origin); } catch { throw new Error('invalid_verified_core_target'); }
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || !origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('invalid_verified_core_target');
  }
  if (!isRecord(value.runtime) || !hasExactKeys(value.runtime, ['host', 'port', 'pid', 'started_at'])) throw new Error('invalid_verified_core_target');
  const runtime = value.runtime;
  if (!['127.0.0.1', 'localhost'].includes(String(runtime.host)) || !isPositiveSafeInteger(runtime.port) || runtime.port > 65_535 || !isPositiveSafeInteger(runtime.pid) || !isCanonicalRfc3339(runtime.started_at)) {
    throw new Error('invalid_verified_core_target');
  }
  if (origin.hostname !== runtime.host || Number(origin.port) !== runtime.port || !isPositiveSafeInteger(value.api_contract_version)) throw new Error('invalid_verified_core_target');
  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0 || value.capabilities.some((item) => typeof item !== 'string' || !PRINTABLE_ASCII_PATTERN.test(item))) {
    throw new Error('invalid_verified_core_target');
  }
  const capabilities = value.capabilities as string[];
  if (new Set(capabilities).size !== capabilities.length || capabilities.some((item, index) => index > 0 && capabilities[index - 1]! >= item)) {
    throw new Error('invalid_verified_core_target');
  }
  return value as unknown as VerifiedCoreTargetSnapshot;
}

export function encodeExpectedCoreTargetHeader(value: unknown): string {
  const snapshot = validateVerifiedCoreTargetSnapshot(value);
  const encoded = Buffer.from(canonicalJson(snapshot), 'utf8').toString('base64url');
  if (Buffer.byteLength(encoded, 'ascii') > EXPECTED_CORE_TARGET_HEADER_MAX_BYTES) throw new Error('expected_core_target_header_too_large');
  return encoded;
}

export function decodeExpectedCoreTargetHeader(value: unknown): VerifiedCoreTargetSnapshot {
  if (typeof value !== 'string' || !value || value.length > EXPECTED_CORE_TARGET_HEADER_MAX_BYTES || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('invalid_expected_core_target_header');
  }
  let parsed: unknown;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('invalid_expected_core_target_header');
  }
  const snapshot = validateVerifiedCoreTargetSnapshot(parsed);
  if (encodeExpectedCoreTargetHeader(snapshot) !== value) throw new Error('invalid_expected_core_target_header');
  return snapshot;
}
