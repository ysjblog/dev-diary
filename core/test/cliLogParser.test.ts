import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import { createCliLogScanProvider, escapeClaudeProjectPath, parseProjectCliLogs } from '../src/services/cliLogParser.js';
import { createConfiguredScanProvider, runManualScan } from '../src/services/scans.js';
import { getProjectDetail } from '../src/services/projects.js';

const TODAY = '2026-06-28';
const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-cli-parser-'));
  roots.push(root);
  return root;
}

function freshDb(): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 15, seed: 1337 });
  return db;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initProjectRepo(root: string): string {
  const projectRoot = join(root, 'Demo Project');
  mkdirSync(projectRoot, { recursive: true });
  git(projectRoot, ['init', '-b', 'main']);
  writeFileSync(join(projectRoot, 'README.md'), '# Demo\n');
  git(projectRoot, ['add', 'README.md']);
  git(projectRoot, ['-c', 'user.name=DevDiary Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Initial commit']);
  return projectRoot;
}

function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n'));
}

function writeFixtures(homeDir: string, projectRoot: string): void {
  const claudeDir = join(homeDir, '.claude', 'projects', escapeClaudeProjectPath(projectRoot));
  mkdirSync(claudeDir, { recursive: true });
  writeJsonl(join(claudeDir, 'claude-session-1.jsonl'), [
    {
      type: 'user',
      timestamp: `${TODAY}T10:00:00.000Z`,
      cwd: projectRoot,
      sessionId: 'claude-session-1',
      message: { role: 'user', content: 'raw prompt must not persist' },
    },
    '{malformed-json',
    {
      type: 'assistant',
      timestamp: `${TODAY}T10:04:00.000Z`,
      cwd: projectRoot,
      sessionId: 'claude-session-1',
      message: {
        model: 'claude-opus-4-1',
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 40,
        },
      },
    },
    {
      type: 'assistant',
      timestamp: `${TODAY}T10:08:00.000Z`,
      cwd: projectRoot,
      sessionId: 'claude-session-1',
      message: {
        model: 'claude-opus-4-1',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      },
    },
  ]);

  const codexDir = join(homeDir, '.codex', 'sessions', '2026', '06', '28');
  mkdirSync(codexDir, { recursive: true });
  writeJsonl(join(codexDir, 'rollout-2026-06-28T11-00-00-codex-session-1.jsonl'), [
    {
      timestamp: `${TODAY}T11:00:00.000Z`,
      type: 'session_meta',
      payload: {
        id: 'codex-session-1',
        timestamp: `${TODAY}T11:00:00.000Z`,
        cwd: projectRoot,
        model_provider: 'openai',
      },
    },
    {
      timestamp: `${TODAY}T11:01:00.000Z`,
      type: 'turn_context',
      payload: {
        cwd: projectRoot,
        model: 'gpt-5-codex',
      },
    },
    {
      timestamp: `${TODAY}T11:02:00.000Z`,
      type: 'event_msg',
      payload: {
        info: {
          last_token_usage: {
            input_tokens: 70,
            cached_input_tokens: 20,
            output_tokens: 10,
            reasoning_output_tokens: 5,
            total_tokens: 85,
          },
          total_token_usage: {
            input_tokens: 70,
            cached_input_tokens: 20,
            output_tokens: 10,
            reasoning_output_tokens: 5,
            total_tokens: 85,
          },
        },
      },
    },
    {
      timestamp: `${TODAY}T11:03:00.000Z`,
      type: 'event_msg',
      payload: {
        info: {
          last_token_usage: {
            input_tokens: 7,
            output_tokens: 3,
            total_tokens: 10,
          },
          total_token_usage: {
            input_tokens: 77,
            cached_input_tokens: 20,
            output_tokens: 13,
            reasoning_output_tokens: 5,
            total_tokens: 95,
          },
        },
      },
    },
  ]);
}

function writeAntigravityFixtures(homeDir: string, projectRoot: string): string {
  const conversationId = 'agy-conversation-1';
  const logDir = join(homeDir, '.gemini', 'antigravity-cli', 'log');
  mkdirSync(logDir, { recursive: true });
  writeFileSync(
    join(logDir, 'cli-20260628_121500.log'),
    [
      'I0628 12:15:00.100000 12345 resolver.go:111] Model resolved via default',
      `I0628 12:15:01.200000 12345 server.go:216] Creating CLI server backend: product=antigravity workspaceDirs=[${projectRoot}] appDataDir=${homeDir}/.gemini/antigravity-cli cascadeManager=true codeAssist=true`,
      'I0628 12:15:01.300000 12345 printmode.go:82] Print mode: starting (promptLength=99, model="Gemini 3.5 Flash (High)", conversationID="")',
      'I0628 12:15:03.400000 12345 conversation_manager.go:306] Starting new conversation (agent=false)',
      `I0628 12:15:03.500000 12345 server.go:800] Created conversation ${conversationId}`,
      `I0628 12:16:10.600000 12345 conversation_manager.go:589] Stream completed for ${conversationId}, clearing ResponsePending`,
    ].join('\n'),
  );
  writeJsonl(join(homeDir, '.gemini', 'antigravity-cli', 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl'), [
    {
      step_index: 1,
      source: 'user',
      type: 'message',
      status: 'completed',
      created_at: `${TODAY}T04:15:05.000Z`,
      content: 'raw prompt must not persist',
    },
    {
      step_index: 2,
      source: 'assistant',
      type: 'message',
      status: 'completed',
      created_at: `${TODAY}T04:16:10.000Z`,
      thinking: 'private chain of thought must not persist',
      content: 'raw response must not persist',
    },
  ]);
  return conversationId;
}

function counts(db: DB, projectId: number) {
  return {
    sessions: (db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = ?`).get(projectId) as { c: number }).c,
    tokens: (db.prepare(`SELECT COALESCE(SUM(token_total),0) AS t FROM token_usage WHERE project_id = ?`).get(projectId) as { t: number }).t,
  };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('CLI log parser scan provider', () => {
  let db: DB;
  let root: string;
  let homeDir: string;
  let projectRoot: string;

  beforeEach(() => {
    db = freshDb();
    root = tempRoot();
    homeDir = join(root, 'home');
    projectRoot = initProjectRepo(root);
    writeFixtures(homeDir, projectRoot);
    db.prepare(`UPDATE projects SET root_path = ?, git_repo_detected = 1, git_branch = 'main' WHERE id = 1`).run(projectRoot);
  });

  describe('function 邏輯', () => {
    it('Claude Code JSONL parser 讀 sessionId / cwd / usage 並產生 stable source identity', () => {
      const parsed = parseProjectCliLogs({ id: 1, name: 'Demo Project', root_path: projectRoot, ignored: false, scan_paused: false }, { homeDir });
      const claude = parsed.sessions.find((session) => session.agent_name === 'claude-code');

      expect(claude).toMatchObject({
        agent_name: 'claude-code',
        model: 'claude-opus-4-1',
        start_time: `${TODAY}T10:00:00.000Z`,
        end_time: `${TODAY}T10:08:00.000Z`,
        token_input: 110,
        token_cached: 50,
        token_output: 45,
        token_reasoning: 0,
        token_total: 205,
        source_log_ref: 'claude-code://claude-session-1',
      });
      expect(claude?.source_log_ref).not.toContain(projectRoot);
      expect(parsed.warnings.some((warning) => warning.kind === 'malformed_jsonl')).toBe(true);
    });

    it('Codex CLI JSONL parser 讀 session_meta / turn_context / token usage', () => {
      const parsed = parseProjectCliLogs({ id: 1, name: 'Demo Project', root_path: projectRoot, ignored: false, scan_paused: false }, { homeDir });
      const codex = parsed.sessions.find((session) => session.agent_name === 'codex-cli');

      expect(codex).toMatchObject({
        agent_name: 'codex-cli',
        model: 'gpt-5-codex',
        start_time: `${TODAY}T11:00:00.000Z`,
        end_time: `${TODAY}T11:03:00.000Z`,
        token_input: 77,
        token_cached: 20,
        token_output: 13,
        token_reasoning: 5,
        token_total: 115,
        source_log_ref: 'codex-cli://codex-session-1',
        parser_confidence: 0.85,
      });
      expect(codex?.source_log_ref).not.toContain(projectRoot);
    });

    it('Antigravity CLI glog parser 讀 workspaceDirs / model / conversation metadata', () => {
      const conversationId = writeAntigravityFixtures(homeDir, projectRoot);

      const parsed = parseProjectCliLogs({ id: 1, name: 'Demo Project', root_path: projectRoot, ignored: false, scan_paused: false }, { homeDir });
      const agy = parsed.sessions.find((session) => session.agent_name === 'antigravity-cli');

      expect(agy).toMatchObject({
        agent_name: 'antigravity-cli',
        model: 'Gemini 3.5 Flash (High)',
        start_time: `${TODAY}T04:15:05.000Z`,
        end_time: `${TODAY}T04:16:10.000Z`,
        token_total: 0,
        source_log_ref: `antigravity-cli://${conversationId}`,
        command: 'agy --print',
        parser_confidence: 0.65,
      });
      expect(agy?.source_log_ref).not.toContain(projectRoot);
    });

    it('malformed / dirty JSONL line 不讓 parser crash', () => {
      const parsed = parseProjectCliLogs({ id: 1, name: 'Demo Project', root_path: projectRoot, ignored: false, scan_paused: false }, { homeDir });

      expect(parsed.sessions).toHaveLength(2);
      expect(parsed.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent_name: 'claude-code',
            kind: 'malformed_jsonl',
          }),
        ]),
      );
    });

    it('dirty source identity 會被正規化，不把 raw path-like id 寫進 source_log_ref', () => {
      const claudeDir = join(homeDir, '.claude', 'projects', escapeClaudeProjectPath(projectRoot));
      writeJsonl(join(claudeDir, 'dirty-session.jsonl'), [
        {
          type: 'assistant',
          timestamp: `${TODAY}T12:00:00.000Z`,
          cwd: projectRoot,
          sessionId: '../../sensitive/path',
          message: {
            model: 'claude-sonnet-4-1',
            usage: { input_tokens: 1, output_tokens: 2 },
          },
        },
      ]);

      const parsed = parseProjectCliLogs({ id: 1, name: 'Demo Project', root_path: projectRoot, ignored: false, scan_paused: false }, { homeDir });
      const dirty = parsed.sessions.find((session) => session.model === 'claude-sonnet-4-1');

      expect(dirty?.source_log_ref).toMatch(/^claude-code:\/\/[a-f0-9]{16}$/);
      expect(dirty?.source_log_ref).not.toContain('sensitive');
      expect(dirty?.source_log_ref).not.toContain('..');
    });

    it('Claude Code parser 使用實際資料夾命名規則，支援 project path 裡的 underscore', () => {
      const underscoredRoot = join(root, 'Project_exception', 'Development log');
      mkdirSync(underscoredRoot, { recursive: true });
      const actualClaudeDir = join(homeDir, '.claude', 'projects', escapeClaudeProjectPath(underscoredRoot));
      writeJsonl(join(actualClaudeDir, 'underscore-session.jsonl'), [
        {
          type: 'assistant',
          timestamp: `${TODAY}T13:00:00.000Z`,
          cwd: underscoredRoot,
          sessionId: 'underscore-session',
          message: {
            model: 'claude-opus-4-8',
            usage: { input_tokens: 8, output_tokens: 4 },
          },
        },
      ]);

      const parsed = parseProjectCliLogs({ id: 1, name: 'Underscore', root_path: underscoredRoot, ignored: false, scan_paused: false }, { homeDir });

      expect(parsed.sessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent_name: 'claude-code',
            token_total: 12,
            source_log_ref: 'claude-code://underscore-session',
          }),
        ]),
      );
    });

    it('CLI provider 接入 runManualScan 後 repeated scan 不重複新增資料', () => {
      writeAntigravityFixtures(homeDir, projectRoot);
      const provider = createCliLogScanProvider({ homeDir });
      const before = counts(db, 1);

      const first = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });
      const afterFirst = counts(db, 1);
      const second = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });
      const afterSecond = counts(db, 1);

      expect(first.status).toBe('success');
      expect(first.inserted_sessions).toBe(3);
      expect(first.warnings.some((warning) => warning.kind === 'malformed_jsonl')).toBe(true);
      expect(afterFirst.sessions).toBe(before.sessions + 3);
      expect(afterFirst.tokens).toBe(before.tokens + 320);
      expect(second.inserted_sessions).toBe(0);
      expect(afterSecond).toEqual(afterFirst);
    });

    it('global scan 對多個 projects 共用同一份 Codex index，避免重複讀取與重複 warning', () => {
      const secondProjectRoot = join(root, 'Second Project');
      mkdirSync(secondProjectRoot, { recursive: true });
      writeFileSync(join(secondProjectRoot, 'README.md'), '# Second\n');
      db.prepare(`UPDATE projects SET root_path = ? WHERE id = 2`).run(secondProjectRoot);

      const codexDir = join(homeDir, '.codex', 'sessions', '2026', '06', '29');
      writeJsonl(join(codexDir, 'rollout-2026-06-29T10-00-00-codex-session-2.jsonl'), [
        {
          timestamp: `${TODAY}T12:00:00.000Z`,
          type: 'session_meta',
          payload: {
            id: 'codex-session-2',
            timestamp: `${TODAY}T12:00:00.000Z`,
            cwd: secondProjectRoot,
          },
        },
        {
          timestamp: `${TODAY}T12:01:00.000Z`,
          type: 'event_msg',
          payload: {
            info: {
              total_token_usage: {
                input_tokens: 10,
                output_tokens: 4,
              },
            },
          },
        },
      ]);
      writeJsonl(join(codexDir, 'rollout-2026-06-29T10-01-00-malformed.jsonl'), [
        '{malformed-codex-json',
      ]);

      const result = runManualScan(db, { scope: 'global', today: TODAY, provider: createCliLogScanProvider({ homeDir }) });
      const malformedCodexWarnings = result.warnings.filter(
        (warning) => warning.agent_name === 'codex-cli' && warning.kind === 'malformed_jsonl',
      );

      expect(result.status).toBe('success');
      expect(result.scanned_projects).toEqual(expect.arrayContaining([1, 2]));
      expect(result.inserted_sessions).toBeGreaterThanOrEqual(2);
      expect(malformedCodexWarnings).toHaveLength(1);
    });

    it('re-scan 會回填舊版 zero-token Codex session，但不重複新增 session', () => {
      const provider = createCliLogScanProvider({ homeDir });
      db.prepare(
        `INSERT INTO sessions (project_id, agent_name, model, start_time, end_time, token_total,
          token_input, token_cached, token_output, token_reasoning, summary, source_log_ref,
          parser_confidence, command, duration, status)
         VALUES (1, 'codex-cli', 'gpt-5-codex', ?, ?, 0, 0, 0, 0, 0, 'old zero token',
          'codex-cli://codex-session-1', 0.55, 'codex-cli', 60, 'completed')`,
      ).run(`${TODAY}T11:00:00.000Z`, `${TODAY}T11:01:00.000Z`);
      db.prepare(
        `INSERT INTO token_usage (date, project_id, agent_name, model, token_total,
          token_input, token_cached, token_output, token_reasoning)
         VALUES (?, 1, 'codex-cli', 'gpt-5-codex', 0, 0, 0, 0, 0)`,
      ).run(TODAY);

      const before = counts(db, 1);
      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });
      const after = counts(db, 1);
      const codex = db
        .prepare(`SELECT token_total, token_input, token_cached, token_output, token_reasoning FROM sessions WHERE source_log_ref = ?`)
        .get('codex-cli://codex-session-1') as {
        token_total: number;
        token_input: number;
        token_cached: number;
        token_output: number;
        token_reasoning: number;
      };

      expect(result.status).toBe('success');
      expect(result.inserted_sessions).toBe(1);
      expect(after.sessions).toBe(before.sessions + 1);
      expect(after.tokens).toBe(before.tokens + 320);
      expect(codex).toMatchObject({
        token_total: 115,
        token_input: 77,
        token_cached: 20,
        token_output: 13,
        token_reasoning: 5,
      });
    });

    it('default runtime provider 會優先解析 CLI logs，而不是直接使用 deterministic mock', () => {
      const conversationId = writeAntigravityFixtures(homeDir, projectRoot);
      const provider = createConfiguredScanProvider({}, { homeDir });

      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });
      const detail = getProjectDetail(db, 1, TODAY)!;
      const refs = detail.sessions.map((session) => session.source_log_ref);

      expect(result.status).toBe('success');
      expect(result.inserted_sessions).toBe(3);
      expect(result.inserted_kanban_cards).toBeGreaterThan(0);
      expect(refs).toEqual(
        expect.arrayContaining(['claude-code://claude-session-1', 'codex-cli://codex-session-1', `antigravity-cli://${conversationId}`]),
      );
      expect(refs.some((ref) => String(ref).startsWith('mock-scan://'))).toBe(false);
      expect(detail.kanban.some((card) => card.source_ref?.startsWith('agent-synth://'))).toBe(true);
      expect(detail.kanban.some((card) => card.source_ref?.startsWith('mock-scan://'))).toBe(false);
    });

    it('parser 不寫 project folder、不執行 shell、不輸出 raw transcript', () => {
      writeAntigravityFixtures(homeDir, projectRoot);
      const provider = createCliLogScanProvider({ homeDir });
      const beforeFiles = readdirSync(projectRoot).sort();
      const beforeHead = readFileSync(join(projectRoot, '.git', 'HEAD'), 'utf8');
      const beforeStatus = git(projectRoot, ['status', '--porcelain=v1']);

      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });
      const detail = getProjectDetail(db, 1, TODAY)!;

      expect(result.status).toBe('success');
      expect(readdirSync(projectRoot).sort()).toEqual(beforeFiles);
      expect(readFileSync(join(projectRoot, '.git', 'HEAD'), 'utf8')).toBe(beforeHead);
      expect(git(projectRoot, ['status', '--porcelain=v1'])).toBe(beforeStatus);
      expect(detail.sessions.some((session) => String(session.command).includes('raw prompt'))).toBe(false);
      expect(
        (
          db.prepare(`SELECT redacted_log_excerpt FROM sessions WHERE source_log_ref = 'claude-code://claude-session-1'`).get() as
            | { redacted_log_excerpt: string | null }
            | undefined
        )?.redacted_log_excerpt,
      ).not.toContain('raw prompt');
      const agyExcerpt = (
        db.prepare(`SELECT redacted_log_excerpt FROM sessions WHERE source_log_ref = 'antigravity-cli://agy-conversation-1'`).get() as
          | { redacted_log_excerpt: string | null }
          | undefined
      )?.redacted_log_excerpt;
      expect(agyExcerpt).not.toContain('raw prompt');
      expect(agyExcerpt).not.toContain('private chain of thought');
    });
  });

  describe('Mock API', () => {
    it('scan endpoint 使用 CLI provider 回傳 parsed records 與 refreshed snapshot', async () => {
      const conversationId = writeAntigravityFixtures(homeDir, projectRoot);
      const provider = createCliLogScanProvider({ homeDir });
      const app = createServer(db, { scanProvider: provider });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const response = await fetch(`${base}/api/projects/1/scan?range=custom&start=${TODAY}&end=${TODAY}`, { method: 'POST' });
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
          scan: { status: string; inserted_sessions: number; scanned_projects: number[] };
          project_detail: { sessions: Array<{ source_log_ref: string | null }> };
        };

        expect(body.scan).toMatchObject({
          status: 'success',
          inserted_sessions: 3,
          scanned_projects: [1],
        });
        expect(body.project_detail.sessions.map((session) => session.source_log_ref)).toEqual(
          expect.arrayContaining(['claude-code://claude-session-1', 'codex-cli://codex-session-1', `antigravity-cli://${conversationId}`]),
        );
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  });
});
