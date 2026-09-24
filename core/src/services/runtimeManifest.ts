import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CORE_API_CAPABILITIES, CORE_API_CONTRACT_VERSION } from './runtimeHealth.js';
import { type VerifiedCoreTargetSnapshot } from './codexDesktopResumeContracts.js';

const MAX_RUNTIME_MANIFEST_BYTES = 64 * 1024;

export interface RuntimeManifestEnv {
  DEVDIARY_CORE_MANIFEST?: string;
}

export interface RuntimeManifestOptions {
  path: string;
  host: string;
  port: number;
  pid: number;
  startedAt: string;
  now?: () => Date;
}

export function defaultRuntimeManifestPath(homeDir = homedir()): string {
  return join(homeDir, 'Library', 'Application Support', 'DevDiary', 'core-runtime.json');
}

export function resolveRuntimeManifestPath(env: RuntimeManifestEnv = process.env, homeDir = homedir()): string {
  return env.DEVDIARY_CORE_MANIFEST?.trim() || defaultRuntimeManifestPath(homeDir);
}

export function writeRuntimeManifest(options: RuntimeManifestOptions): void {
  const capturedAt = (options.now ?? (() => new Date()))().toISOString();
  const manifest = {
    service: 'devdiary-core',
    api_contract_version: CORE_API_CONTRACT_VERSION,
    url: `http://${options.host}:${options.port}`,
    captured_at: capturedAt,
    runtime: {
      host: options.host,
      port: options.port,
      pid: options.pid,
      started_at: options.startedAt,
    },
    capabilities: [...CORE_API_CAPABILITIES].sort(),
  };
  mkdirSync(dirname(options.path), { recursive: true });
  writeFileSync(options.path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

function readExactRegularManifest(path: string): { raw: Buffer; parsed: any } | null {
  let fd: number | null = null;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.size <= 0n || before.size > BigInt(MAX_RUNTIME_MANIFEST_BYTES)) return null;
    fd = openSync(path, 'r');
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) return null;
    const raw = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < raw.length) {
      const count = readSync(fd, raw, offset, raw.length - offset, offset);
      if (count === 0) return null;
      offset += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs) return null;
    return { raw, parsed: JSON.parse(raw.toString('utf8')) };
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export interface ImmutableCoreRuntimeIdentity {
  host: '127.0.0.1' | 'localhost';
  port: number | null;
  pid: number;
  startedAt: string;
}

export function buildVerifiedRuntimeTargetSnapshot(path: string, runtime: ImmutableCoreRuntimeIdentity): VerifiedCoreTargetSnapshot | null {
  if (!Number.isInteger(runtime.port) || Number(runtime.port) <= 0) return null;
  const file = readExactRegularManifest(path);
  if (!file) return null;
  const value = file.parsed as Record<string, any>;
  const capabilities = [...CORE_API_CAPABILITIES].sort();
  if (
    value?.service !== 'devdiary-core' || value.api_contract_version !== CORE_API_CONTRACT_VERSION
    || value.url !== `http://${runtime.host}:${runtime.port}`
    || value.runtime?.host !== runtime.host || value.runtime?.port !== runtime.port
    || value.runtime?.pid !== runtime.pid || value.runtime?.started_at !== runtime.startedAt
    || JSON.stringify(value.capabilities) !== JSON.stringify(capabilities)
  ) return null;
  return {
    origin: value.url, source: 'verified_manifest',
    manifest_digest: createHash('sha256').update(file.raw).digest('hex'),
    runtime: { host: runtime.host, port: runtime.port!, pid: runtime.pid, started_at: runtime.startedAt },
    api_contract_version: CORE_API_CONTRACT_VERSION, capabilities,
  };
}

export function verifyExpectedRuntimeTarget(path: string, runtime: ImmutableCoreRuntimeIdentity, expected: VerifiedCoreTargetSnapshot): boolean {
  const current = buildVerifiedRuntimeTargetSnapshot(path, runtime);
  return current !== null && current.origin === expected.origin && current.manifest_digest === expected.manifest_digest
    && current.runtime.host === expected.runtime.host && current.runtime.port === expected.runtime.port
    && current.runtime.pid === expected.runtime.pid && current.runtime.started_at === expected.runtime.started_at
    && current.api_contract_version === expected.api_contract_version
    && current.capabilities.join('\0') === expected.capabilities.join('\0');
}

export function assertRuntimeManifestAvailableBeforeDb(path: string, options: ManifestStaleOptions = {}): void {
  if (!existsSync(path)) return;
  const file = readExactRegularManifest(path);
  const pid = Number(file?.parsed?.runtime?.pid);
  if (!file || file.parsed?.service !== 'devdiary-core' || !Number.isInteger(pid) || pid <= 0) throw new Error('unknown_core_manifest_owner');
  const isAlive = options.isAlive ?? ((candidate: number) => isProcessAlive(candidate));
  if (isAlive(pid)) throw new Error('live_core_manifest_owner');
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('unknown_core_manifest_owner');
  unlinkSync(path);
}

export function assertBackgroundRuntimeManifestCompatibleBeforeDb(path: string, options: ManifestStaleOptions = {}): void {
  if (!existsSync(path)) return;
  const file = readExactRegularManifest(path);
  const value = file?.parsed as Record<string, any> | undefined;
  const pid = Number(value?.runtime?.pid);
  if (!file || value?.service !== 'devdiary-core' || !Number.isInteger(pid) || pid <= 0) {
    throw new Error('unknown_core_manifest_owner');
  }
  const expectedCapabilities = [...CORE_API_CAPABILITIES].sort();
  const host = value.runtime?.host;
  const port = Number(value.runtime?.port);
  const isCurrent = value.api_contract_version === CORE_API_CONTRACT_VERSION
    && (host === '127.0.0.1' || host === 'localhost')
    && Number.isInteger(port) && port > 0
    && value.url === `http://${host}:${port}`
    && typeof value.runtime?.started_at === 'string' && value.runtime.started_at.length > 0
    && JSON.stringify(value.capabilities) === JSON.stringify(expectedCapabilities);
  if (!isCurrent) throw new Error('incompatible_core_manifest_owner');
  const isAlive = options.isAlive ?? ((candidate: number) => isProcessAlive(candidate));
  if (isAlive(pid)) return;
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('unknown_core_manifest_owner');
  unlinkSync(path);
}

export function removeRuntimeManifest(path: string, pid: number): void {
  if (!existsSync(path)) return;
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { runtime?: { pid?: unknown } };
    if (manifest.runtime?.pid !== pid) return;
    rmSync(path, { force: true });
  } catch {
    rmSync(path, { force: true });
  }
}

export interface RuntimeManifestContent {
  service?: string;
  url?: string;
  runtime?: { host?: string; port?: number; pid?: number; started_at?: string };
}

export type KillSignal = (pid: number, signal: 0) => void;

// Signal 0 performs error checking without delivering a signal: ESRCH means the
// process is gone, EPERM means it exists but we may not signal it (still alive).
export function isProcessAlive(pid: number, kill: KillSignal = process.kill): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readRuntimeManifest(path: string): RuntimeManifestContent | null {
  if (!existsSync(path)) return null;
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as RuntimeManifestContent;
    if (manifest?.service !== 'devdiary-core') return null;
    return manifest;
  } catch {
    return null;
  }
}

export interface ManifestStaleOptions {
  isAlive?: (pid: number) => boolean;
}

// A manifest is stale when we cannot prove a live Core owns it: missing/garbage
// content, no usable pid, or a pid whose process no longer exists.
export function isRuntimeManifestStale(
  manifest: RuntimeManifestContent | null,
  options: ManifestStaleOptions = {},
): boolean {
  if (!manifest || manifest.service !== 'devdiary-core') return true;
  const pid = Number(manifest.runtime?.pid);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  const isAlive = options.isAlive ?? ((candidate: number) => isProcessAlive(candidate));
  return !isAlive(pid);
}
