import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CORE_API_CAPABILITIES, CORE_API_CONTRACT_VERSION } from './runtimeHealth.js';

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
    capabilities: [...CORE_API_CAPABILITIES],
  };
  mkdirSync(dirname(options.path), { recursive: true });
  writeFileSync(options.path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
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
