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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function expectedTargetHeader(snapshot) {
  if (!snapshot || snapshot.source !== 'verified_manifest') throw new Error('Core runtime 尚未完成驗證，不能修改自動續跑設定。');
  const bytes = new TextEncoder().encode(canonicalJson(snapshot));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function coreFetchWithVerifiedMutationTarget(snapshot, path, init = {}, dependencies = {}) {
  const runtime = dependencies.runtime || globalThis;
  const invoke = dependencies.invoke || defaultInvoke;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const mutationUrl = await coreApiUrl(path, runtime, { invoke });
  const healthUrl = await coreApiUrl('/api/health', runtime, { invoke });
  if (/^https?:\/\//i.test(mutationUrl) && new URL(mutationUrl).origin !== snapshot?.origin) {
    throw new Error('Core runtime 已變更，不能送出自動續跑設定。');
  }
  const healthResponse = await fetchImpl(healthUrl, { method: 'GET' });
  if (!healthResponse.ok) throw new Error('Core runtime 重新驗證失敗，不能送出自動續跑設定。');
  const health = await healthResponse.json();
  if (canonicalJson(health?.verified_core_target) !== canonicalJson(snapshot)) {
    throw new Error('Core runtime 已變更，不能送出自動續跑設定。');
  }
  const headers = new Headers(init.headers || {});
  headers.set('x-devdiary-expected-core-target', expectedTargetHeader(snapshot));
  return fetchImpl(mutationUrl, { ...init, headers });
}
