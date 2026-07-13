import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createServer } from '../src/server.js';
import { detectCliAgents, type ExecFileImpl } from '../src/services/agentDetection.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-agent-detect-'));
  roots.push(root);
  return root;
}

function fakeBin(root: string, name: string): string {
  const path = join(root, name);
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Agent detection', () => {
  describe('function 邏輯', () => {
    it('agent detection 使用 fixed argv 並 sanitize failure', async () => {
      const root = tempRoot();
      const binRoot = join(root, 'bin');
      mkdirSync(binRoot);
      fakeBin(binRoot, 'claude');
      fakeBin(binRoot, 'codex');
      fakeBin(binRoot, 'agy');
      const calls: Array<{ file: string; args: string[]; shell: false }> = [];
      const execFileImpl: ExecFileImpl = async (file, args, options) => {
        calls.push({ file, args, shell: options.shell });
        if (file.endsWith('/codex')) {
          const err = new Error('Command failed: /tmp/codex --version SECRET_TOKEN');
          throw Object.assign(err, { stdout: '', stderr: 'SECRET_TOKEN' });
        }
        return { stdout: `${file.split('/').pop()} version 1.2.3\n`, stderr: '' };
      };

      const snapshot = await detectCliAgents({
        homeDir: root,
        env: { PATH: binRoot },
        execFileImpl,
        now: () => new Date('2026-06-30T00:00:00.000Z'),
      });

      expect(snapshot.agents).toHaveLength(3);
      expect(calls.map((call) => call.args)).toEqual([['--version'], ['--version'], ['--help']]);
      expect(calls.every((call) => call.shell === false)).toBe(true);
      expect(snapshot.agents.find((agent) => agent.id === 'claude-code')?.version).toContain('claude version');
      const codex = snapshot.agents.find((agent) => agent.id === 'codex-cli')!;
      expect(codex.available).toBe(false);
      expect(codex.error_message).toBe('CLI probe 失敗。');
      expect(JSON.stringify(codex)).not.toContain('SECRET_TOKEN');
      expect(JSON.stringify(codex)).not.toContain('Command failed');
    });

    it('Packaged GUI PATH 缺少 CLI 時仍偵測已知 Codex app bundle', async () => {
      const root = tempRoot();
      const bundledCodex = fakeBin(root, 'codex-app-bundle');
      const calls: string[] = [];

      const snapshot = await detectCliAgents({
        homeDir: root,
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
        appBundleCandidates: { 'codex-cli': [bundledCodex] },
        execFileImpl: async (file) => {
          calls.push(file);
          return { stdout: 'codex-cli 1.2.3\n', stderr: '' };
        },
      });

      const codex = snapshot.agents.find((agent) => agent.id === 'codex-cli')!;
      expect(codex.available).toBe(true);
      expect(codex.binary_path).toBe(realpathSync(bundledCodex));
      expect(calls).toContain(bundledCodex);
    });

    it('probe 期間 executable identity 改變會失敗且不回報 connected', async () => {
      const root = tempRoot();
      const binary = fakeBin(root, 'codex');
      const snapshot = await detectCliAgents({
        homeDir: root,
        env: { PATH: root },
        sourceSettings: {
          'codex-cli': {
            executable: { mode: 'custom', configured_path: binary },
            activity_logs: { mode: 'auto', configured_data_roots: [] },
          },
        },
        execFileImpl: async (file) => {
          if (file === binary) writeFileSync(binary, '#!/bin/sh\necho changed\n');
          return { stdout: 'codex 1.0', stderr: '' };
        },
      });
      const codex = snapshot.agents.find((agent) => agent.id === 'codex-cli')!;
      expect(codex.status).toBe('offline');
      expect(codex.source_status?.executable.probe_status).toBe('failed');
      expect(codex.error_message).toBe('CLI executable changed during probe.');
    });

    it('Claude source status exposes Core-derived current and legacy project locations', async () => {
      const root = tempRoot();
      const snapshot = await detectCliAgents({
        homeDir: root,
        env: { PATH: '' },
        projects: [{ id: 42, root_path: '/tmp/project_with_underscore' }],
      });
      const claude = snapshot.agents.find((agent) => agent.id === 'claude-code')!;
      const locations = claude.source_status?.activity_logs.derived_scan_locations ?? [];
      expect(locations).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'claude_projects', project_id: 42, project_root: '/tmp/project_with_underscore', encoding_variant: 'current' }),
        expect.objectContaining({ role: 'claude_projects', project_id: 42, project_root: '/tmp/project_with_underscore', encoding_variant: 'legacy' }),
      ]));
    });
  });

  describe('Mock API', () => {
    it('activity source PUT is revision guarded and returns the canonical response envelope', async () => {
      const db = openDb(':memory:');
      const root = tempRoot();
      const app = createServer(db);
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;
        const response = await fetch(`${base}/api/agents/codex-cli/activity-log-source`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'custom', configured_data_roots: [root], expected_revision: 0 }),
        });
        const body = (await response.json()) as { agent: { sources: { activity_logs: { mode: string; configured_data_roots: string[] } } }; revision: number; source_status: unknown };
        expect(response.status).toBe(200);
        expect(body.revision).toBe(1);
        expect(body.agent.sources.activity_logs).toEqual({ mode: 'custom', configured_data_roots: [realpathSync(root)] });
        expect(body.source_status).toBeTruthy();

        const stale = await fetch(`${base}/api/agents/codex-cli/activity-log-source`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'auto', configured_data_roots: [], expected_revision: 0 }),
        });
        expect(stale.status).toBe(409);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('executable source only persists a successful regular-file probe and rejects a directory', async () => {
      const db = openDb(':memory:');
      const root = tempRoot();
      const binary = fakeBin(root, 'codex-custom');
      const app = createServer(db);
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;
        const invalid = await fetch(`${base}/api/agents/codex-cli/executable-source`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'custom', configured_path: root, expected_revision: 0 }),
        });
        expect(invalid.status).toBe(400);

        const saved = await fetch(`${base}/api/agents/codex-cli/executable-source`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'custom', configured_path: binary, expected_revision: 0 }),
        });
        const body = (await saved.json()) as { agent: { sources: { executable: { mode: string; configured_path: string } } }; revision: number };
        expect(saved.status).toBe(200);
        expect(body.revision).toBe(1);
        expect(body.agent.sources.executable).toEqual({ mode: 'custom', configured_path: realpathSync(binary) });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('GET /api/agents/detect 回傳 safe detection snapshot', async () => {
      const db = openDb(':memory:');
      const app = createServer(db, {
        agentDetector: async () => ({
          checked_at: '2026-06-30T00:00:00.000Z',
          agents: [
            {
              id: 'antigravity-cli',
              display_name: 'Antigravity CLI',
              available: true,
              status: 'connected',
              binary_path: '/tmp/agy',
              version: 'Usage of agy:',
              checked_at: '2026-06-30T00:00:00.000Z',
              error_message: null,
            },
          ],
        }),
      });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/agents/detect`);
        const body = (await response.json()) as { checked_at: string; agents: Array<{ id: string; available: boolean }> };

        expect(response.status).toBe(200);
        expect(body.checked_at).toBe('2026-06-30T00:00:00.000Z');
        expect(body.agents[0]!.id).toBe('antigravity-cli');
        expect(body.agents[0]!.available).toBe(true);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  });
});
