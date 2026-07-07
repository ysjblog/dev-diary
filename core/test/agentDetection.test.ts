import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  });

  describe('Mock API', () => {
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
