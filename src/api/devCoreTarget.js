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
  const port = Number(runtime?.port);
  if ((host === '127.0.0.1' || host === 'localhost') && Number.isInteger(port) && port > 0) {
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

// A manifest that names a dead owner pid is stale — skip it so dev clients fall
// back instead of being stranded on a crashed Core's port. Manifests without a
// pid stay trusted for backward compatibility.
function manifestIsStale(manifest, isAlive) {
  const pid = Number(manifest?.runtime?.pid);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  return !isAlive(pid);
}

function manifestUrl(manifest) {
  if (manifest?.service !== 'devdiary-core') return null;
  return loopbackUrl(manifest.url) || runtimeLoopbackUrl(manifest.runtime);
}

export function resolveCoreApiTarget(env = process.env, homeDir = homedir(), options = {}) {
  const isAlive = options.isAlive || isProcessAlive;
  const explicit = loopbackUrl(String(env.DEVDIARY_CORE_URL || '').trim());
  if (explicit) return explicit;

  const manifestPath = resolveCoreManifestPath(env, homeDir);
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (!manifestIsStale(manifest, isAlive)) {
        const resolved = manifestUrl(manifest);
        if (resolved) return resolved;
      }
    } catch {
      // Ignore malformed stale manifests and fall back to the historical dev port.
    }
  }

  const fallbackPort = Number(env.DEVDIARY_PORT || 4317);
  return `http://127.0.0.1:${Number.isInteger(fallbackPort) && fallbackPort > 0 ? fallbackPort : 4317}`;
}

export function buildCoreProxyUrl(requestUrl, env = process.env, homeDir = homedir(), options = {}) {
  const target = resolveCoreApiTarget(env, homeDir, options);
  const incoming = String(requestUrl || '/');
  const path = incoming.startsWith('/api') ? incoming : `/api${incoming.startsWith('/') ? incoming : `/${incoming}`}`;
  return new URL(path, target);
}
