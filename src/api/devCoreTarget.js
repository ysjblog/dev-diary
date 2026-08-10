import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function defaultCoreManifestPath(homeDir = homedir()) {
  return join(homeDir, 'Library', 'Application Support', 'DevDiary', 'core-runtime.json');
}

export function resolveCoreManifestPath(env = process.env, homeDir = homedir()) {
  return String(env.DEVDIARY_CORE_MANIFEST || '').trim() || defaultCoreManifestPath(homeDir);
}

function loopbackUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:') return null;
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null;
    if (!url.port) return null;
    return `http://${url.hostname}:${url.port}`;
  } catch {
    return null;
  }
}

function runtimeLoopbackUrl(runtime) {
  const host = runtime?.host;
  const port = runtime?.port;
  if (
    (host === '127.0.0.1' || host === 'localhost')
    && typeof port === 'number'
    && Number.isInteger(port)
    && port > 0
    && port <= 65_535
  ) {
    return `http://${host}:${port}`;
  }
  return null;
}

// Signal 0 only checks reachability: ESRCH => gone, EPERM => alive but unsignalable.
function isProcessAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err) && err.code === 'EPERM';
  }
}

function manifestUrl(manifest, isAlive) {
  if (manifest?.service !== 'devdiary-core') return null;
  const runtimeUrl = runtimeLoopbackUrl(manifest.runtime);
  const pid = manifest?.runtime?.pid;
  if (!runtimeUrl || typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0 || !isAlive(pid)) return null;
  if (Object.hasOwn(manifest, 'url') && manifest.url !== runtimeUrl) return null;
  return runtimeUrl;
}

function boundedFallbackPort(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!/^\d+$/.test(raw)) return 4317;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : 4317;
}

export function resolveCoreApiTarget(env = process.env, homeDir = homedir(), options = {}) {
  const isAlive = options.isAlive || isProcessAlive;
  const explicit = loopbackUrl(String(env.DEVDIARY_CORE_URL || '').trim());
  if (explicit) return explicit;

  const manifestPath = resolveCoreManifestPath(env, homeDir);
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const resolved = manifestUrl(manifest, isAlive);
      if (resolved) return resolved;
    } catch {
      // Ignore malformed stale manifests and fall back to the historical dev port.
    }
  }

  return `http://127.0.0.1:${boundedFallbackPort(env.DEVDIARY_PORT)}`;
}

export function buildCoreProxyUrl(requestUrl, env = process.env, homeDir = homedir(), options = {}) {
  const target = resolveCoreApiTarget(env, homeDir, options);
  const incoming = String(requestUrl || '/');
  const path = incoming.startsWith('/api') ? incoming : `/api${incoming.startsWith('/') ? incoming : `/${incoming}`}`;
  return new URL(path, target);
}
