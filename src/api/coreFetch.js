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

export function coreApiUrl(path, runtime = globalThis) {
  const value = String(path || '/');
  if (/^https?:\/\//i.test(value)) return value;
  if (!isTauriRuntime(runtime)) return value;
  return `${DEFAULT_TAURI_CORE_ORIGIN}${value.startsWith('/') ? value : `/${value}`}`;
}

export function coreFetch(path, init) {
  return fetch(coreApiUrl(path), init);
}
