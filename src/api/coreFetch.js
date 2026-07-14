const DEFAULT_TAURI_CORE_ORIGIN = 'http://127.0.0.1:4317';

function isTauriRuntime(runtime = globalThis) {
  const location = runtime.location || {};
  return Boolean(
    runtime.__TAURI_INTERNALS__
      || runtime.__TAURI__
      || String(location.protocol || '').startsWith('tauri')
      || location.hostname === 'tauri.localhost',
  );
}

function isLoopbackOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && Boolean(url.port);
  } catch {
    return false;
  }
}

async function defaultInvoke(...args) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(...args);
}

// Core's real bound port can drift from the historical default (see
// core/src/services/runtimePort.ts's fallback loop), so ask Rust for the
// origin it read from the runtime manifest instead of assuming 4317. Rust
// falls back to 4317 itself when no live manifest exists, so any failure
// here (older build without the command, IPC hiccup) is safe to swallow.
async function resolveTauriCoreOrigin(invoke) {
  try {
    const origin = await invoke('resolve_core_api_origin');
    if (isLoopbackOrigin(origin)) return origin;
  } catch {
    // fall through to the historical default
  }
  return DEFAULT_TAURI_CORE_ORIGIN;
}

export async function coreApiUrl(path, runtime = globalThis, { invoke = defaultInvoke } = {}) {
  const value = String(path || '/');
  if (/^https?:\/\//i.test(value)) return value;
  if (!isTauriRuntime(runtime)) return value;
  const origin = await resolveTauriCoreOrigin(invoke);
  return `${origin}${value.startsWith('/') ? value : `/${value}`}`;
}

export async function coreFetch(path, init) {
  return fetch(await coreApiUrl(path), init);
}
