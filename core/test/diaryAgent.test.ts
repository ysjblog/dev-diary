import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { getProjectDetail } from '../src/services/projects.js';
import {
  buildProjectDiaryFallback,
  buildProjectDiaryPrompt,
  createAntigravityProjectDiaryAgent,
  createConfiguredProjectDiaryAgent,
  createOllamaProjectDiaryAgent,
  generateProjectDiaryDraft,
  type ExecFileImpl,
} from '../src/services/diaryAgent.js';
import { updateSettings } from '../src/services/settings.js';
import { regenerateProjectSummaryWithAgent, saveProjectSummary } from '../src/services/projectWrites.js';

const TODAY = '2026-06-28';
const roots: string[] = [];

function freshSnapshot() {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 15, seed: 1337 });
  return { db, snapshot: getProjectDetail(db, 1, TODAY)! };
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-diary-agent-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('AI Diary Agent', () => {
  describe('function 邏輯', () => {
    it('Diary prompt uses structured data and excludes project raw paths / source refs', () => {
      const { snapshot } = freshSnapshot();
      const prompt = buildProjectDiaryPrompt(snapshot, TODAY);

      expect(prompt).toContain('STRUCTURED_DATA');
      expect(prompt).toContain(snapshot.project.name);
      expect(prompt).not.toContain(snapshot.project.root_path);
      for (const session of snapshot.sessions) {
        if (session.source_log_ref) expect(prompt).not.toContain(session.source_log_ref);
      }
      const structuredData = prompt.split('STRUCTURED_DATA:')[1] ?? '';
      expect(structuredData.toLowerCase()).not.toContain('credential');
    });

    it('Diary prompt applies user prompt override while preserving safety constraints', () => {
      const { snapshot } = freshSnapshot();
      const prompt = buildProjectDiaryPrompt(snapshot, TODAY, '請用條列式產生主管看得懂的交接摘要。');

      expect(prompt).toContain('請用條列式產生主管看得懂的交接摘要。');
      expect(prompt).toContain('SAFETY_CONSTRAINTS');
      expect(prompt).toContain('STRUCTURED_DATA');
      expect(prompt).not.toContain(snapshot.project.root_path);
      for (const session of snapshot.sessions) {
        if (session.source_log_ref) expect(prompt).not.toContain(session.source_log_ref);
      }
    });

    it('date-scoped diary prompt omits current-only Git status and unrelated Kanban cards', () => {
      const { snapshot } = freshSnapshot();
      const dateScopedSnapshot = {
        ...snapshot,
        range_key: 'custom' as const,
        start_date: TODAY,
        end_date: TODAY,
        git_status: {
          ...snapshot.git_status,
          working_tree_status: '2 modified',
        },
        kanban: [
          {
            id: 1001,
            project_id: snapshot.project.id,
            title: 'Target-date card',
            description: '',
            status: 'done' as const,
            assignee_agent_id: 'codex-cli' as const,
            due_date: null,
            source_ref: 'agent-synth://target-date',
            status_locked_by_user: false,
            created_at: `${TODAY}T10:00:00.000Z`,
            updated_at: `${TODAY}T10:00:00.000Z`,
          },
          {
            id: 1002,
            project_id: snapshot.project.id,
            title: 'Current-only card',
            description: '',
            status: 'todo' as const,
            assignee_agent_id: 'claude-code' as const,
            due_date: null,
            source_ref: 'agent-synth://current-only',
            status_locked_by_user: false,
            created_at: '2026-07-02T10:00:00.000Z',
            updated_at: '2026-07-02T10:00:00.000Z',
          },
        ],
      };

      const prompt = buildProjectDiaryPrompt(dateScopedSnapshot, TODAY);

      expect(prompt).toContain('Target-date card');
      expect(prompt).not.toContain('Current-only card');
      expect(prompt).toContain('git_status_current_snapshot=omitted_for_date_scoped_diary');
      expect(prompt).not.toContain('2 modified');
    });

    it('date-scoped deterministic fallback uses range totals instead of all-time totals', () => {
      const { snapshot } = freshSnapshot();
      const dateScopedSnapshot = {
        ...snapshot,
        range_key: 'custom' as const,
        start_date: TODAY,
        end_date: TODAY,
        metric_strip: {
          ...snapshot.metric_strip,
          range_session_count: 2,
          range_token_total: 3456,
          session_count: 99,
          token_all: 123456,
        },
      };

      const fallback = buildProjectDiaryFallback(dateScopedSnapshot, TODAY).markdown;

      expect(fallback).toContain('Sessions: 2');
      expect(fallback).toContain('Tokens: 3,456');
      expect(fallback).not.toContain('99');
      expect(fallback).not.toContain('123,456');
    });

    it('Antigravity diary agent invokes agy with argv, temp cwd, and --print prompt', async () => {
      const { snapshot } = freshSnapshot();
      const runDir = tempRoot();
      const calls: Array<{ file: string; args: string[]; cwd: string; shell: false }> = [];
      const execFileImpl: ExecFileImpl = async (file, args, options) => {
        calls.push({ file, args, cwd: options.cwd, shell: options.shell });
        return { stdout: '## 測試日記\n- 已整理今日進展。', stderr: '' };
      };

      const agent = createAntigravityProjectDiaryAgent({
        cliPath: '/tmp/fake-agy',
        model: 'Gemini 3.5 Flash (High)',
        printTimeout: '10s',
        execTimeoutMs: 1000,
        homeDir: tempRoot(),
        runDir,
        execFileImpl,
      });
      const result = await agent(snapshot, TODAY);

      expect(result.agent_id).toBe('antigravity-cli');
      expect(result.markdown).toContain('測試日記');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.file).toBe('/tmp/fake-agy');
      expect(calls[0]!.args.slice(0, 5)).toEqual(['--model', 'Gemini 3.5 Flash (High)', '--print-timeout', '10s', '--print']);
      expect(calls[0]!.args.at(-1)).not.toContain(snapshot.project.root_path);
      expect(calls[0]!.cwd).toBe(runDir);
      expect(calls[0]!.cwd).not.toBe(snapshot.project.root_path);
      expect(calls[0]!.shell).toBe(false);
    });

    it('Antigravity default exec closes stdin so print mode can finish', async () => {
      const { snapshot } = freshSnapshot();
      const cliRoot = tempRoot();
      const cliPath = join(cliRoot, 'fake-agy.js');
      writeFileSync(
        cliPath,
        [
          '#!/usr/bin/env node',
          'process.stdin.resume();',
          "process.stdin.on('end', () => {",
          "  process.stdout.write('## stdin closed\\n- fake diary completed.\\n');",
          '});',
        ].join('\n'),
      );
      chmodSync(cliPath, 0o755);

      const agent = createAntigravityProjectDiaryAgent({
        cliPath,
        execTimeoutMs: 1000,
        homeDir: tempRoot(),
        runDir: tempRoot(),
      });

      const result = await agent(snapshot, TODAY);

      expect(result.agent_id).toBe('antigravity-cli');
      expect(result.markdown).toContain('stdin closed');
    });

    it('Antigravity auth / empty output falls back to deterministic draft', async () => {
      const { snapshot } = freshSnapshot();
      const authAgent = createAntigravityProjectDiaryAgent({
        cliPath: '/tmp/fake-agy',
        homeDir: tempRoot(),
        runDir: tempRoot(),
        execFileImpl: async () => ({ stdout: 'You are not logged into Antigravity', stderr: '' }),
      });

      const draft = await generateProjectDiaryDraft(snapshot, TODAY, authAgent);

      expect(draft.agent_id).toBe('fallback');
      expect(draft.markdown).toContain('AI 草稿');
      expect(draft.markdown).toContain('Fallback reason');
      expect(draft.fallback_report).toContain('Antigravity CLI 尚未登入');
    });

    it('Ollama diary agent calls local generate API with selected model', async () => {
      const { snapshot } = freshSnapshot();
      const calls: Array<{ url: string; body: { model: string; prompt: string; stream: boolean } }> = [];
      const agent = createOllamaProjectDiaryAgent({
        agentId: 'custom-ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'qwen3.6:27b',
        fetchImpl: async (url, init) => {
          calls.push({ url, body: JSON.parse(String(init.body)) });
          return {
            ok: true,
            status: 200,
            json: async () => ({ response: '## Ollama 日記\n- 已透過本機 Qwen 產生。' }),
          };
        },
      });

      const result = await agent(snapshot, TODAY);

      expect(result.agent_id).toBe('custom-ollama');
      expect(result.markdown).toContain('Ollama 日記');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('http://127.0.0.1:11434/api/generate');
      expect(calls[0]!.body.model).toBe('qwen3.6:27b');
      expect(calls[0]!.body.stream).toBe(false);
      expect(calls[0]!.body.prompt).not.toContain(snapshot.project.root_path);
    });

    it('configured custom Ollama agent can generate diary drafts', async () => {
      const { db, snapshot } = freshSnapshot();
      const settings = updateSettings(
        db,
        {
          custom_agents: [{
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
          }],
          default_diary_agent: 'custom-ollama',
        },
        { activeDbPath: ':memory:', projectRoots: [] },
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ response: '## Qwen 日記\n- custom agent provider ok.' }),
      })) as unknown as typeof fetch;
      try {
        const generator = createConfiguredProjectDiaryAgent(settings);
        const result = await generator!(snapshot, TODAY);

        expect(result.agent_id).toBe('custom-ollama');
        expect(result.markdown).toContain('Qwen 日記');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('CLI failure details are sanitized before fallback draft persistence', async () => {
      const { snapshot } = freshSnapshot();
      const failingAgent = createAntigravityProjectDiaryAgent({
        cliPath: '/tmp/fake-agy',
        homeDir: tempRoot(),
        runDir: tempRoot(),
        execFileImpl: async () => {
          throw new Error(`Command failed: /tmp/fake-agy --print ${snapshot.project.root_path} SECRET_TOKEN`);
        },
      });

      const draft = await generateProjectDiaryDraft(snapshot, TODAY, failingAgent);

      expect(draft.agent_id).toBe('fallback');
      expect(draft.fallback_report).toBe('Antigravity CLI 產生日記失敗，已改用 deterministic fallback。');
      expect(draft.markdown).not.toContain(snapshot.project.root_path);
      expect(draft.markdown).not.toContain('SECRET_TOKEN');
    });

    it('regenerateProjectSummaryWithAgent writes AI draft without replacing user override', async () => {
      const { db } = freshSnapshot();
      saveProjectSummary(db, 1, { markdown: '## 手動摘要' }, TODAY);

      const detail = await regenerateProjectSummaryWithAgent(db, 1, TODAY, {}, async () => ({
        markdown: '## Antigravity 日記\n- 今天完成核心接線。',
        agent_id: 'antigravity-cli',
        fallback_report: null,
      }));

      expect(detail.summary_source).toBe('user');
      expect(detail.summary_markdown).toBe('## 手動摘要');
      expect(detail.summary_ai_draft_markdown).toContain('Antigravity 日記');
      const row = db.prepare(`SELECT markdown_ai FROM project_summaries WHERE project_id = 1`).get() as { markdown_ai: string };
      expect(row.markdown_ai).toContain('Antigravity 日記');
    });
  });
});
