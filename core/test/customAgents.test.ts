import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createServer } from '../src/server.js';
import { CustomAgentValidationError, probeCustomAgent, type ExecFileImpl } from '../src/services/customAgents.js';
import { getSettings } from '../src/services/settings.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-custom-agent-'));
  roots.push(root);
  return root;
}

function fakeBin(root: string, name = 'custom-agent'): string {
  mkdirSync(root, { recursive: true });
  const path = join(root, name);
  writeFileSync(path, '#!/bin/sh\necho custom-agent 1.2.3\n');
  chmodSync(path, 0o755);
  return path;
}

async function closeServer(server: ReturnType<ReturnType<typeof createServer>['listen']>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Custom agent safe probe', () => {
  describe('function 邏輯', () => {
    it('valid custom executable probe uses safe execution', async () => {
      const root = tempRoot();
      const bin = fakeBin(join(root, 'bin'));
      const calls: Array<{ file: string; args: string[]; cwd: string; shell: false; env: NodeJS.ProcessEnv }> = [];
      const execFileImpl: ExecFileImpl = async (file, args, options) => {
        calls.push({ file, args, cwd: options.cwd, shell: options.shell, env: options.env });
        return { stdout: 'custom-agent 1.2.3\n', stderr: '' };
      };

      const result = await probeCustomAgent(
        { display_name: 'Local Test Agent', executable_path: bin, probe_arg: '--version' },
        { homeDir: root, execFileImpl, env: { PATH: join(root, 'bin'), SECRET_TOKEN: 'do-not-pass' }, now: () => new Date('2026-07-01T00:00:00.000Z') },
      );

      expect(result.status).toBe('connected');
      expect(result.version).toBe('custom-agent 1.2.3');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.file).toBe(bin);
      expect(calls[0]!.args).toEqual(['--version']);
      expect(calls[0]!.shell).toBe(false);
      expect(calls[0]!.cwd).toContain('.cache/devdiary-custom-agent-probes');
      expect(calls[0]!.env.SECRET_TOKEN).toBeUndefined();
    });

    it('shell-looking input is rejected before execution', async () => {
      const execFileImpl: ExecFileImpl = async () => {
        throw new Error('should not execute');
      };

      await expect(probeCustomAgent({ display_name: 'Bad', executable_path: '/tmp/fake; rm -rf /' }, { execFileImpl })).rejects.toThrow(CustomAgentValidationError);
      await expect(probeCustomAgent({ display_name: 'Bad', executable_path: 'echo hello' }, { execFileImpl })).rejects.toThrow(CustomAgentValidationError);
    });
  });

  describe('Mock API', () => {
    it('custom agent save probes before persistence and reload keeps it', async () => {
      const root = tempRoot();
      const bin = fakeBin(join(root, 'bin'));
      const db = openDb(':memory:');
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const save = await fetch(`${base}/api/agents/custom`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ display_name: 'Local Test Agent', model: 'custom-cli', executable_path: bin }),
        });
        expect(save.status).toBe(200);
        const saved = (await save.json()) as { custom_agents: Array<{ id: string; display_name: string; status: string; version: string }> };

        expect(saved.custom_agents).toHaveLength(1);
        expect(saved.custom_agents[0]!.display_name).toBe('Local Test Agent');
        expect(saved.custom_agents[0]!.status).toBe('connected');
        expect(saved.custom_agents[0]!.version).toContain('custom-agent 1.2.3');
        expect(getSettings(db, { activeDbPath: ':memory:', projectRoots: [] }).custom_agents).toHaveLength(1);
      } finally {
        await closeServer(server);
      }
    });

    it('failed probe is not persisted', async () => {
      const db = openDb(':memory:');
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/agents/custom`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ display_name: 'Missing Agent', executable_path: '/tmp/definitely-missing-agent' }),
        });

        expect(response.status).toBe(400);
        expect(getSettings(db, { activeDbPath: ':memory:', projectRoots: [] }).custom_agents).toHaveLength(0);
      } finally {
        await closeServer(server);
      }
    });

    it('custom agent enable disable and remove persists without removing canonical agents', async () => {
      const root = tempRoot();
      const bin = fakeBin(join(root, 'bin'));
      const db = openDb(':memory:');
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const saved = (await (await fetch(`${base}/api/agents/custom`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ display_name: 'Toggle Agent', executable_path: bin }),
        })).json()) as { custom_agents: Array<{ id: string; enabled: boolean }> };
        const id = saved.custom_agents[0]!.id;

        const disabled = await fetch(`${base}/api/agents/custom/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        });
        expect(disabled.status).toBe(200);
        expect(((await disabled.json()) as { custom_agents: Array<{ enabled: boolean }> }).custom_agents[0]!.enabled).toBe(false);

        const removed = await fetch(`${base}/api/agents/custom/${id}`, { method: 'DELETE' });
        expect(removed.status).toBe(200);
        const body = (await removed.json()) as { agents: unknown[]; custom_agents: unknown[] };
        expect(body.custom_agents).toHaveLength(0);
        expect(body.agents).toHaveLength(3);
      } finally {
        await closeServer(server);
      }
    });
  });
});
