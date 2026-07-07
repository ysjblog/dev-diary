import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { createServer } from '../src/server.js';
import {
  DEFAULT_DAILY_DIARY_ENTRY_PROMPT,
  DEFAULT_DAILY_HIGHLIGHT_PROMPT,
  DEFAULT_KANBAN_CARDS_PROMPT,
  DEFAULT_PROJECT_DIARY_PROMPT,
  getSettings,
  updateSettings,
  SettingsValidationError,
} from '../src/services/settings.js';
import { createConfiguredScanProvider } from '../src/services/scans.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-settings-'));
  roots.push(root);
  return root;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(root: string, name: string): string {
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  writeFileSync(join(repo, 'README.md'), `# ${name}\n`);
  git(repo, ['add', 'README.md']);
  git(repo, ['-c', 'user.name=DevDiary Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Initial commit']);
  return repo;
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

describe('Settings backend', () => {
  describe('function 邏輯', () => {
    it('GET settings defaults include runtime metadata and canonical agents', () => {
      const db = openDb(':memory:');
      const settings = getSettings(db, {
        activeDbPath: '/tmp/DevDiary.sqlite',
        projectRoots: ['/tmp/projects'],
      });

      expect(settings.project_roots).toEqual(['/tmp/projects']);
      expect(settings.excluded_paths).toEqual([]);
      expect(settings.project_doc_filenames).toEqual([
        'README.md',
        'docs/specs/MASTER.md',
        'docs/specs/dev-diary-macos-app.md',
        'MASTER.md',
        'master.md',
        'spec.md',
      ]);
      expect(settings.project_doc_folders).toEqual([]);
      expect(settings.scan_interval_minutes).toBe(60);
      expect(settings.default_diary_agent).toBe('claude-code');
      expect(settings.appearance).toBe('system');
      expect(settings.data_storage).toEqual({
        active_db_path: '/tmp/DevDiary.sqlite',
        desired_db_path: '/tmp/DevDiary.sqlite',
        restart_required: false,
      });
      expect(settings.scan_provider.provider).toBe('cli-logs');
      expect(settings.daily_scheduler).toEqual({
        enabled: false,
        run_time_local: '18:00',
        timezone: 'Asia/Taipei',
        last_run_date: null,
        last_run_at: null,
        last_status: 'idle',
        last_error: null,
        last_project_count: 0,
      });
      expect(settings.kanban_ai_auto_add).toEqual({
        enabled: true,
        min_confidence: 0.65,
        max_cards_per_project_per_run: 3,
        allowed_statuses: ['todo', 'in_progress', 'done'],
        timeout_ms: 15000,
      });
      expect(settings.agents.map((agent) => [agent.id, agent.enabled])).toEqual([
        ['claude-code', true],
        ['codex-cli', true],
        ['antigravity-cli', true],
      ]);
      expect(settings.agents.map((agent) => [agent.id, agent.model, agent.reasoning])).toEqual([
        ['claude-code', 'Default (CLI config)', 'default'],
        ['codex-cli', 'Default (CLI config)', 'default'],
        ['antigravity-cli', 'Gemini 3.5 Flash (Medium)', 'default'],
      ]);
      expect(settings.custom_agents).toEqual([]);
      expect(settings.ai_prompts).toEqual({
        project_diary: DEFAULT_PROJECT_DIARY_PROMPT,
        daily_diary_entry: DEFAULT_DAILY_DIARY_ENTRY_PROMPT,
        daily_highlight: DEFAULT_DAILY_HIGHLIGHT_PROMPT,
        kanban_cards: DEFAULT_KANBAN_CARDS_PROMPT,
      });
      expect(DEFAULT_PROJECT_DIARY_PROMPT).toContain('date=');
      expect(DEFAULT_DAILY_DIARY_ENTRY_PROMPT).toContain('date=');
      expect(DEFAULT_DAILY_HIGHLIGHT_PROMPT).toContain('STRUCTURED_DATA');
      expect(DEFAULT_DAILY_HIGHLIGHT_PROMPT).not.toContain('整理今天');
    });

    it('GET settings defaults ignore runtime mock policy for app-facing settings', () => {
      const db = openDb(':memory:');
      const settings = getSettings(db, {
        activeDbPath: ':memory:',
        projectRoots: [],
        scanProviderPolicy: { provider: 'mock', fallback: 'mock' },
      });

      expect(settings.scan_provider).toEqual({ provider: 'cli-logs', fallback: 'none' });
    });

    it('PATCH settings normalizes and persists configurable fields', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };

      const updated = updateSettings(
        db,
        {
          project_roots: [' /tmp/a ', '/tmp/a', '/tmp/b'],
          excluded_paths: [' node_modules ', '', 'dist'],
          project_doc_filenames: [' README.md ', 'docs/specs/MASTER.md', 'README.md'],
          project_doc_folders: [' docs ', 'docs', 'notes/research'],
          scan_interval_minutes: 120,
          default_diary_agent: 'codex',
          appearance: 'dark',
          privacy: { redact_sensitive_values: false, include_comments_in_exports: true },
          data_storage: { desired_db_path: '/tmp/next.sqlite' },
          scan_provider: { provider: 'cli-logs', fallback: 'none' },
          daily_scheduler: { enabled: true, run_time_local: '21:30' },
          kanban_ai_auto_add: {
            enabled: true,
            min_confidence: 0.72,
            max_cards_per_project_per_run: 5,
            allowed_statuses: ['todo', 'in_progress'],
            timeout_ms: 9000,
          },
          agents: [
            { id: 'claude', enabled: false, model: 'Opus 4.8', reasoning: 'extra_high' },
            { id: 'codex-cli', enabled: true, model: 'GPT-5.5', reasoning: 'high' },
            { id: 'antigravity', enabled: false, model: 'Gemini 3.5 Flash (Low)', reasoning: 'light' },
          ],
          custom_agents: [
            {
              id: 'custom-local-test',
              display_name: 'Local Test Agent',
              model: 'custom-cli',
              reasoning: 'medium',
              executable_path: '/tmp/local-agent',
              probe_arg: '--version',
              enabled: true,
              status: 'connected',
              version: 'local-agent 1.0',
              checked_at: '2026-07-01T00:00:00.000Z',
              error_message: null,
            },
          ],
          ai_prompts: {
            project_diary: '自訂 project diary prompt',
            daily_diary_entry: '自訂 daily diary prompt',
            daily_highlight: '自訂 daily highlight prompt',
            kanban_cards: '自訂 kanban prompt',
          },
        },
        runtime,
      );
      const restarted = getSettings(db, runtime);

      expect(updated.project_roots).toEqual(['/tmp/a', '/tmp/b']);
      expect(updated.excluded_paths).toEqual(['node_modules', 'dist']);
      expect(updated.project_doc_filenames).toEqual(['README.md', 'docs/specs/MASTER.md']);
      expect(updated.project_doc_folders).toEqual(['docs', 'notes/research']);
      expect(updated.default_diary_agent).toBe('codex-cli');
      expect(updated.data_storage.restart_required).toBe(true);
      expect(updated.scan_provider).toEqual({ provider: 'cli-logs', fallback: 'none' });
      expect(updated.daily_scheduler.enabled).toBe(true);
      expect(updated.daily_scheduler.run_time_local).toBe('21:30');
      expect(updated.kanban_ai_auto_add).toEqual({
        enabled: true,
        min_confidence: 0.65,
        max_cards_per_project_per_run: 3,
        allowed_statuses: ['todo', 'in_progress', 'done'],
        timeout_ms: 15000,
      });
      expect(updated.agents.find((agent) => agent.id === 'claude-code')?.model).toBe('Opus 4.8');
      expect(updated.agents.find((agent) => agent.id === 'claude-code')?.reasoning).toBe('extra_high');
      expect(updated.custom_agents[0]?.id).toBe('custom-local-test');
      expect(updated.custom_agents[0]?.reasoning).toBe('medium');
      expect(updated.ai_prompts.project_diary).toBe('自訂 project diary prompt');
      expect(updated.ai_prompts.daily_diary_entry).toBe('自訂 daily diary prompt');
      expect(updated.ai_prompts.daily_highlight).toBe('自訂 daily highlight prompt');
      expect(updated.ai_prompts.kanban_cards).toBe(DEFAULT_KANBAN_CARDS_PROMPT);
      expect(restarted).toEqual(updated);
    });

    it('PATCH settings can select a configured custom agent as diary agent', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };

      const updated = updateSettings(
        db,
        {
          custom_agents: [
            {
              id: 'custom-ollama',
              display_name: 'Ollama Qwen',
              model: 'qwen3.6:27b',
              reasoning: 'high',
              executable_path: '/usr/local/bin/ollama',
              probe_arg: '--version',
              enabled: true,
              status: 'connected',
              version: 'ollama version 0.20.0',
              checked_at: '2026-07-02T00:00:00.000Z',
              error_message: null,
            },
          ],
          default_diary_agent: 'custom-ollama',
        },
        runtime,
      );

      expect(updated.default_diary_agent).toBe('custom-ollama');
      expect(getSettings(db, runtime).default_diary_agent).toBe('custom-ollama');
    });

    it('PATCH settings rejects an unknown custom diary agent id', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };

      expect(() => updateSettings(db, { default_diary_agent: 'custom-missing' }, runtime)).toThrow(SettingsValidationError);
    });

    it('PATCH settings rejects app-facing mock scan policy', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };

      expect(() => updateSettings(db, { scan_provider: { provider: 'mock', fallback: 'none' } }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { scan_provider: { provider: 'cli-logs', fallback: 'mock' } }, runtime)).toThrow(SettingsValidationError);
      expect(getSettings(db, runtime).scan_provider).toEqual({ provider: 'cli-logs', fallback: 'none' });
    });

    it('GET settings normalizes legacy reasoning names to current picker values', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };
      db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`).run(
        'core',
        JSON.stringify({
          agents: [
            { id: 'claude-code', enabled: true, model: 'Claude Sonnet 4.6 (Thinking)', reasoning: 'thinking' },
            { id: 'codex-cli', enabled: true, model: 'GPT-5.5 (Medium)', reasoning: 'low' },
          ],
        }),
        '2026-07-01T00:00:00.000Z',
      );

      const settings = getSettings(db, runtime);

      expect(settings.agents.find((agent) => agent.id === 'claude-code')?.reasoning).toBe('high');
      expect(settings.agents.find((agent) => agent.id === 'codex-cli')?.reasoning).toBe('light');
    });

    it('GET settings sanitizes old persisted mock scan policy', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };
      db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`).run(
        'core',
        JSON.stringify({ scan_provider: { provider: 'mock', fallback: 'mock' } }),
        '2026-06-29T00:00:00.000Z',
      );

      expect(getSettings(db, runtime).scan_provider).toEqual({ provider: 'cli-logs', fallback: 'none' });
    });

    it('GET settings replaces legacy custom prompt overrides with upgraded defaults', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };
      db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`).run(
        'core',
        JSON.stringify({
          ai_prompts: {
            project_diary: '舊版 project prompt',
            daily_diary_entry: '舊版 daily prompt',
            daily_highlight: '舊版 highlight prompt',
          },
        }),
        '2026-07-01T00:00:00.000Z',
      );

      expect(getSettings(db, runtime).ai_prompts).toEqual({
        project_diary: DEFAULT_PROJECT_DIARY_PROMPT,
        daily_diary_entry: DEFAULT_DAILY_DIARY_ENTRY_PROMPT,
        daily_highlight: DEFAULT_DAILY_HIGHLIGHT_PROMPT,
        kanban_cards: DEFAULT_KANBAN_CARDS_PROMPT,
      });
    });

    it('GET settings migrates ai_prompts_version 2 by preserving diary prompts and adding kanban_cards', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };
      db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`).run(
        'core',
        JSON.stringify({
          ai_prompts_version: 2,
          ai_prompts: {
            project_diary: 'v2 project prompt',
            daily_diary_entry: 'v2 daily prompt',
            daily_highlight: 'v2 highlight prompt',
          },
        }),
        '2026-07-01T00:00:00.000Z',
      );

      expect(getSettings(db, runtime).ai_prompts).toEqual({
        project_diary: 'v2 project prompt',
        daily_diary_entry: 'v2 daily prompt',
        daily_highlight: 'v2 highlight prompt',
        kanban_cards: DEFAULT_KANBAN_CARDS_PROMPT,
      });
    });

    it('invalid PATCH throws before partial writes', () => {
      const db = openDb(':memory:');
      const runtime = { activeDbPath: '/tmp/current.sqlite', projectRoots: [] };
      const before = updateSettings(db, { appearance: 'light', scan_interval_minutes: 30 }, runtime);

      expect(() => updateSettings(db, { appearance: 'sepia' }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { scan_interval_minutes: 0 }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { agents: [{ id: 'unknown-agent', enabled: true }] }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '25:00' } }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { daily_scheduler: { last_status: 'success' } }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { project_roots: ['/tmp/' + 'x'.repeat(2000)] }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { project_doc_filenames: ['../secret.md'] }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { project_doc_filenames: ['/tmp/README.md'] }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { project_doc_folders: ['/tmp/docs'] }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { project_doc_folders: ['../private'] }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { agents: [{ id: 'claude-code', enabled: true, reasoning: 'maximum' }] }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { ai_prompts: { project_diary: 'x'.repeat(6000) } }, runtime)).toThrow(SettingsValidationError);
      expect(() => updateSettings(db, { custom_agents: [{ id: 'custom-bad', display_name: 'Bad', executable_path: 'echo hello', enabled: true, status: 'connected' }] }, runtime)).toThrow(SettingsValidationError);
      expect(getSettings(db, runtime)).toEqual(before);
    });
  });

  describe('Mock API', () => {
    it('GET /api/settings and PATCH /api/settings persist across server restart', async () => {
      const root = tempRoot();
      const dbPath = join(root, 'DevDiary.sqlite');
      let db: DB = openDb(dbPath);
      let app = createServer(db, { dbPath, projectRoots: [] });
      let server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const getDefault = await fetch(`${base}/api/settings`);
        expect(getDefault.status).toBe(200);
        const defaultBody = (await getDefault.json()) as { data_storage: { active_db_path: string } };
        expect(defaultBody.data_storage.active_db_path).toBe(dbPath);

        const patch = await fetch(`${base}/api/settings`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            project_roots: ['/tmp/settings-api-root'],
            appearance: 'dark',
            scan_provider: { provider: 'cli-logs', fallback: 'none' },
            agents: [{ id: 'claude-code', enabled: false }],
          }),
        });
        expect(patch.status).toBe(200);
        const patchBody = (await patch.json()) as { appearance: string; agents: Array<{ id: string; enabled: boolean }> };
        expect(patchBody.appearance).toBe('dark');
        expect(patchBody.agents.find((agent) => agent.id === 'claude-code')?.enabled).toBe(false);
      } finally {
        await closeServer(server);
        db.close();
      }

      db = openDb(dbPath);
      app = createServer(db, { dbPath, projectRoots: [] });
      server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/settings`);
        const body = (await response.json()) as { project_roots: string[]; appearance: string; agents: Array<{ id: string; enabled: boolean }> };

        expect(response.status).toBe(200);
        expect(body.project_roots).toEqual(['/tmp/settings-api-root']);
        expect(body.appearance).toBe('dark');
        expect(body.agents.find((agent) => agent.id === 'claude-code')?.enabled).toBe(false);
      } finally {
        await closeServer(server);
        db.close();
      }
    });

    it('invalid PATCH /api/settings returns 400 and keeps previous settings', async () => {
      const db = openDb(':memory:');
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const valid = await fetch(`${base}/api/settings`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ appearance: 'light', scan_interval_minutes: 30 }),
        });
        expect(valid.status).toBe(200);

        const invalid = await fetch(`${base}/api/settings`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ appearance: 'sepia' }),
        });
        expect(invalid.status).toBe(400);

        const after = (await (await fetch(`${base}/api/settings`)).json()) as { appearance: string; scan_interval_minutes: number };
        expect(after.appearance).toBe('light');
        expect(after.scan_interval_minutes).toBe(30);
      } finally {
        await closeServer(server);
      }
    });

    it('PATCH project_roots 後 global scan 使用 persisted roots', async () => {
      const root = tempRoot();
      const scanRoot = join(root, 'projects');
      const repo = initRepo(scanRoot, 'Settings Scan Repo');
      const db = openDb(':memory:');
      const app = createServer(db, {
        dbPath: ':memory:',
        projectRoots: [],
        scanProvider: createConfiguredScanProvider({ DEVDIARY_SCAN_PROVIDER: 'mock', DEVDIARY_DB: ':memory:' }),
      });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const patch = await fetch(`${base}/api/settings`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ project_roots: [scanRoot] }),
        });
        expect(patch.status).toBe(200);

        const scan = await fetch(`${base}/api/scan?range=all`, { method: 'POST' });
        expect(scan.status).toBe(200);
        const body = (await scan.json()) as {
          scan: { status: string; inserted_sessions: number };
          projects: Array<{ root_path: string }>;
        };

        expect(body.scan.status).toBe('success');
        expect(body.scan.inserted_sessions).toBe(1);
        expect(body.projects.map((project) => project.root_path)).toContain(repo);
      } finally {
        await closeServer(server);
      }
    });
  });
});
