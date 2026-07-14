import assert from 'node:assert/strict';
import test from 'node:test';
import { coreApiUrl } from './coreFetch.js';

const TAURI_RUNTIME = { __TAURI_INTERNALS__: {}, location: { protocol: 'tauri:', hostname: 'tauri.localhost' } };
const BROWSER_RUNTIME = { location: { protocol: 'http:', hostname: 'localhost' } };

test('coreApiUrl keeps browser dev requests relative and never invokes Tauri', async () => {
  const invoke = () => { throw new Error('should not be called outside Tauri runtime'); };
  assert.equal(await coreApiUrl('/api/health', BROWSER_RUNTIME, { invoke }), '/api/health');
});

test('coreApiUrl leaves absolute URLs untouched even inside Tauri', async () => {
  const invoke = () => { throw new Error('should not be called for absolute URLs'); };
  assert.equal(await coreApiUrl('http://example.com/api/health', TAURI_RUNTIME, { invoke }), 'http://example.com/api/health');
});

test('coreApiUrl asks Rust for the Core origin and uses the dynamically-bound port', async () => {
  let requestedCommand = null;
  const invoke = async (command) => {
    requestedCommand = command;
    return 'http://127.0.0.1:4322';
  };
  assert.equal(await coreApiUrl('/api/health', TAURI_RUNTIME, { invoke }), 'http://127.0.0.1:4322/api/health');
  assert.equal(requestedCommand, 'resolve_core_api_origin');
});

test('coreApiUrl falls back to the historical default when invoke rejects', async () => {
  const invoke = async () => { throw new Error('IPC not available'); };
  assert.equal(await coreApiUrl('/api/health', TAURI_RUNTIME, { invoke }), 'http://127.0.0.1:4317/api/health');
});

test('coreApiUrl falls back to the historical default when Rust returns a non-loopback origin', async () => {
  const invoke = async () => 'http://example.com:4322';
  assert.equal(await coreApiUrl('/api/health', TAURI_RUNTIME, { invoke }), 'http://127.0.0.1:4317/api/health');
});

test('coreApiUrl falls back to the historical default when Rust returns garbage', async () => {
  const invoke = async () => 'not-a-url';
  assert.equal(await coreApiUrl('/api/health', TAURI_RUNTIME, { invoke }), 'http://127.0.0.1:4317/api/health');
});

test('coreApiUrl normalizes paths without a leading slash', async () => {
  const invoke = async () => 'http://127.0.0.1:4318';
  assert.equal(await coreApiUrl('api/health', TAURI_RUNTIME, { invoke }), 'http://127.0.0.1:4318/api/health');
});
