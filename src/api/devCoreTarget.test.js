import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCoreProxyUrl, defaultCoreManifestPath, resolveCoreApiTarget, resolveCoreManifestPath } from './devCoreTarget.js';

test('resolveCoreApiTarget prefers explicit env URL', () => {
  assert.equal(resolveCoreApiTarget({ DEVDIARY_CORE_URL: 'http://127.0.0.1:4999' }, '/Users/devdiary-test'), 'http://127.0.0.1:4999');
  assert.equal(
    resolveCoreApiTarget({ DEVDIARY_CORE_URL: 'http://example.com:4999', DEVDIARY_PORT: '4400' }, '/Users/devdiary-test'),
    'http://127.0.0.1:4400',
  );
});

test('resolveCoreApiTarget reads the runtime manifest written by Core', () => {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-core-target-'));
  try {
    const manifest = join(root, 'core-runtime.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        service: 'devdiary-core',
        url: 'http://127.0.0.1:4322',
        runtime: { host: '127.0.0.1', port: 4322 },
      }),
    );

    assert.equal(resolveCoreApiTarget({ DEVDIARY_CORE_MANIFEST: manifest }, '/Users/devdiary-test'), 'http://127.0.0.1:4322');
    assert.equal(buildCoreProxyUrl('/scheduler/daily', { DEVDIARY_CORE_MANIFEST: manifest }, '/Users/devdiary-test').href, 'http://127.0.0.1:4322/api/scheduler/daily');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveCoreApiTarget ignores malformed or non-loopback manifests', () => {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-core-target-'));
  try {
    const manifest = join(root, 'core-runtime.json');
    writeFileSync(manifest, JSON.stringify({ service: 'devdiary-core', url: 'http://example.com:4322' }));

    assert.equal(resolveCoreApiTarget({ DEVDIARY_CORE_MANIFEST: manifest, DEVDIARY_PORT: '4400' }, '/Users/devdiary-test'), 'http://127.0.0.1:4400');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveCoreApiTarget skips a manifest whose owner pid is dead', () => {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-core-target-'));
  try {
    const manifest = join(root, 'core-runtime.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        service: 'devdiary-core',
        url: 'http://127.0.0.1:4322',
        runtime: { host: '127.0.0.1', port: 4322, pid: 999999 },
      }),
    );

    // Dead pid -> stale -> fall back to the legacy dev port.
    assert.equal(
      resolveCoreApiTarget({ DEVDIARY_CORE_MANIFEST: manifest, DEVDIARY_PORT: '4400' }, '/Users/devdiary-test', { isAlive: () => false }),
      'http://127.0.0.1:4400',
    );
    // Live pid -> trust the manifest URL.
    assert.equal(
      resolveCoreApiTarget({ DEVDIARY_CORE_MANIFEST: manifest, DEVDIARY_PORT: '4400' }, '/Users/devdiary-test', { isAlive: () => true }),
      'http://127.0.0.1:4322',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveCoreApiTarget trusts a manifest with no owner pid (backward compatible)', () => {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-core-target-'));
  try {
    const manifest = join(root, 'core-runtime.json');
    writeFileSync(
      manifest,
      JSON.stringify({ service: 'devdiary-core', url: 'http://127.0.0.1:4322', runtime: { host: '127.0.0.1', port: 4322 } }),
    );

    assert.equal(
      resolveCoreApiTarget({ DEVDIARY_CORE_MANIFEST: manifest, DEVDIARY_PORT: '4400' }, '/Users/devdiary-test', { isAlive: () => false }),
      'http://127.0.0.1:4322',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('default manifest path matches the Core app data path', () => {
  assert.equal(
    defaultCoreManifestPath('/Users/devdiary-test'),
    '/Users/devdiary-test/Library/Application Support/DevDiary/core-runtime.json',
  );
  assert.equal(resolveCoreManifestPath({}, '/Users/devdiary-test'), defaultCoreManifestPath('/Users/devdiary-test'));
});
