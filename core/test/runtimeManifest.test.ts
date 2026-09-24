import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertBackgroundRuntimeManifestCompatibleBeforeDb,
  assertRuntimeManifestAvailableBeforeDb,
  buildVerifiedRuntimeTargetSnapshot,
  defaultRuntimeManifestPath,
  isProcessAlive,
  isRuntimeManifestStale,
  readRuntimeManifest,
  removeRuntimeManifest,
  resolveRuntimeManifestPath,
  verifyExpectedRuntimeTarget,
  writeRuntimeManifest,
} from '../src/services/runtimeManifest.js';

const DEAD_PID = 2_147_483_646; // far above any realistic live pid on macOS

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-runtime-manifest-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Runtime manifest', () => {
  it('writes a redacted manifest with the active Core port', () => {
    const path = join(tempRoot(), 'core-runtime.json');

    writeRuntimeManifest({
      path,
      host: '127.0.0.1',
      port: 4321,
      pid: 12345,
      startedAt: '2026-06-30T00:00:00.000Z',
      now: () => new Date('2026-06-30T00:00:01.000Z'),
    });

    const body = JSON.parse(readFileSync(path, 'utf8')) as {
      service: string;
      url: string;
      runtime: { port: number; pid: number };
      capabilities: string[];
    };
    expect(body.service).toBe('devdiary-core');
    expect(body.url).toBe('http://127.0.0.1:4321');
    expect(body.runtime).toEqual(expect.objectContaining({ port: 4321, pid: 12345 }));
    expect(body.capabilities).toContain('scheduler.daily.run');
    expect(body.capabilities).toContain('scheduler.daily.preflight');
    expect(JSON.stringify(body)).not.toContain('DEVDIARY');
    expect(JSON.stringify(body)).not.toContain('project_roots');
  });

  it('uses the macOS app data manifest path unless overridden', () => {
    expect(defaultRuntimeManifestPath('/Users/devdiary-test')).toBe(
      '/Users/devdiary-test/Library/Application Support/DevDiary/core-runtime.json',
    );
    expect(resolveRuntimeManifestPath({}, '/Users/devdiary-test')).toBe(
      '/Users/devdiary-test/Library/Application Support/DevDiary/core-runtime.json',
    );
    expect(resolveRuntimeManifestPath({ DEVDIARY_CORE_MANIFEST: '/tmp/core.json' }, '/Users/devdiary-test')).toBe('/tmp/core.json');
  });

  it('removes only the manifest owned by the exiting pid', () => {
    const path = join(tempRoot(), 'core-runtime.json');
    writeRuntimeManifest({
      path,
      host: '127.0.0.1',
      port: 4321,
      pid: 12345,
      startedAt: '2026-06-30T00:00:00.000Z',
    });

    removeRuntimeManifest(path, 999);
    expect(existsSync(path)).toBe(true);

    removeRuntimeManifest(path, 12345);
    expect(existsSync(path)).toBe(false);
  });

  it('detects process liveness via signal 0', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(DEAD_PID)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(Number.NaN)).toBe(false);
    // EPERM (exists but not signalable) counts as alive.
    expect(
      isProcessAlive(424242, () => {
        const err = new Error('not permitted') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      }),
    ).toBe(true);
  });

  it('reads only well-formed devdiary-core manifests', () => {
    const path = join(tempRoot(), 'core-runtime.json');
    expect(readRuntimeManifest(path)).toBeNull();

    writeFileSync(path, 'not json {');
    expect(readRuntimeManifest(path)).toBeNull();

    writeFileSync(path, JSON.stringify({ service: 'something-else', url: 'http://127.0.0.1:1' }));
    expect(readRuntimeManifest(path)).toBeNull();

    writeRuntimeManifest({ path, host: '127.0.0.1', port: 4321, pid: 12345, startedAt: '2026-06-30T00:00:00.000Z' });
    expect(readRuntimeManifest(path)?.runtime?.port).toBe(4321);
  });

  it('treats manifests without a live owner pid as stale', () => {
    expect(isRuntimeManifestStale(null)).toBe(true);
    expect(isRuntimeManifestStale({ service: 'devdiary-core', runtime: {} })).toBe(true);
    expect(isRuntimeManifestStale({ service: 'devdiary-core', runtime: { pid: DEAD_PID } }, { isAlive: () => false })).toBe(true);
    expect(isRuntimeManifestStale({ service: 'devdiary-core', runtime: { pid: 12345 } }, { isAlive: () => true })).toBe(false);
  });

  it('refuses a live or malformed owner before the database is opened, but removes an exact dead owner', () => {
    const path = join(tempRoot(), 'core-runtime.json');
    writeRuntimeManifest({ path, host: '127.0.0.1', port: 4321, pid: 12345, startedAt: '2026-06-30T00:00:00.000Z' });
    expect(() => assertRuntimeManifestAvailableBeforeDb(path, { isAlive: () => true })).toThrow('live_core_manifest_owner');
    writeFileSync(path, '{ malformed');
    expect(() => assertRuntimeManifestAvailableBeforeDb(path, { isAlive: () => false })).toThrow('unknown_core_manifest_owner');
    writeRuntimeManifest({ path, host: '127.0.0.1', port: 4321, pid: DEAD_PID, startedAt: '2026-06-30T00:00:00.000Z' });
    assertRuntimeManifestAvailableBeforeDb(path, { isAlive: () => false });
    expect(existsSync(path)).toBe(false);
  });

  it('allows the background runner only beside an exact current live Core manifest', () => {
    const path = join(tempRoot(), 'core-runtime.json');
    expect(() => assertBackgroundRuntimeManifestCompatibleBeforeDb(path)).not.toThrow();

    writeRuntimeManifest({ path, host: '127.0.0.1', port: 4321, pid: 12345, startedAt: '2026-06-30T00:00:00.000Z' });
    expect(() => assertBackgroundRuntimeManifestCompatibleBeforeDb(path, { isAlive: () => true })).not.toThrow();

    const old = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    old.api_contract_version = 'old-contract';
    writeFileSync(path, JSON.stringify(old));
    expect(() => assertBackgroundRuntimeManifestCompatibleBeforeDb(path, { isAlive: () => true }))
      .toThrow('incompatible_core_manifest_owner');

    writeFileSync(path, '{ malformed');
    expect(() => assertBackgroundRuntimeManifestCompatibleBeforeDb(path, { isAlive: () => false }))
      .toThrow('unknown_core_manifest_owner');
  });

  it('removes an exact current dead Core manifest before the background runner opens the database', () => {
    const path = join(tempRoot(), 'core-runtime.json');
    writeRuntimeManifest({ path, host: '127.0.0.1', port: 4321, pid: DEAD_PID, startedAt: '2026-06-30T00:00:00.000Z' });
    assertBackgroundRuntimeManifestCompatibleBeforeDb(path, { isAlive: () => false });
    expect(existsSync(path)).toBe(false);
  });

  it('builds a verified mutation snapshot from the exact current manifest bytes', () => {
    const path = join(tempRoot(), 'core-runtime.json');
    writeRuntimeManifest({ path, host: '127.0.0.1', port: 4321, pid: 12345, startedAt: '2026-06-30T00:00:00.000Z' });
    const target = buildVerifiedRuntimeTargetSnapshot(path, {
      host: '127.0.0.1', port: 4321, pid: 12345, startedAt: '2026-06-30T00:00:00.000Z',
    });
    expect(target?.origin).toBe('http://127.0.0.1:4321');
    expect(target?.manifest_digest).toMatch(/^[0-9a-f]{64}$/);
    writeFileSync(path, `${readFileSync(path, 'utf8')} `);
    expect(verifyExpectedRuntimeTarget(path, {
      host: '127.0.0.1', port: 4321, pid: 12345, startedAt: '2026-06-30T00:00:00.000Z',
    }, target!)).toBe(false);
  });
});
