import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import {
  ScanNotFoundError,
  createConfiguredScanProvider,
  runManualScan,
  type ScanProvider,
} from '../src/services/scans.js';
import { getProjectDetail } from '../src/services/projects.js';
import { getSettings, updateSettings } from '../src/services/settings.js';

const TODAY = '2026-06-28';
const roots: string[] = [];

function freshDb(): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 15, seed: 1337 });
  return db;
}

function mockScanProvider(): ScanProvider {
  return createConfiguredScanProvider({ DEVDIARY_SCAN_PROVIDER: 'mock' });
}

function runtime() {
  return { activeDbPath: ':memory:', projectRoots: [] };
}

function counts(db: DB, projectId: number) {
  return {
    sessions: (db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = ?`).get(projectId) as { c: number }).c,
    tokens: (db.prepare(`SELECT COALESCE(SUM(token_total),0) AS t FROM token_usage WHERE project_id = ?`).get(projectId) as { t: number }).t,
    kanban: (db.prepare(`SELECT COUNT(*) AS c FROM kanban_cards WHERE project_id = ?`).get(projectId) as { c: number }).c,
    scanKanban: (
      db.prepare(`SELECT COUNT(*) AS c FROM kanban_cards WHERE project_id = ? AND source_ref LIKE 'mock-scan://%'`).get(projectId) as {
        c: number;
      }
    ).c,
    synthKanban: (
      db.prepare(`SELECT COUNT(*) AS c FROM kanban_cards WHERE project_id = ? AND source_ref LIKE 'agent-synth://%'`).get(projectId) as {
        c: number;
      }
    ).c,
  };
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-scan-'));
  roots.push(root);
  return root;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepoProject(db: DB): string {
  const root = tempRoot();
  const repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  writeFileSync(join(repo, 'README.md'), '# Demo\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['-c', 'user.name=DevDiary Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Initial commit']);
  db.prepare(`UPDATE projects SET root_path = ?, git_repo_detected = 1, git_branch = 'main' WHERE id = 1`).run(repo);
  return repo;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Scan Now / project rescan', () => {
  let db: DB;

  beforeEach(() => {
    db = freshDb();
  });

  describe('function 邏輯', () => {
    it('global scan 第一次新增 deterministic records，第二次不新增 duplicate', () => {
      const before = counts(db, 1);

      const provider = mockScanProvider();
      const first = runManualScan(db, { scope: 'global', today: TODAY, provider });
      const afterFirst = counts(db, 1);
      const diaryAfterFirst = getProjectDetail(db, 1, TODAY)!.diary.length;

      expect(first.status).toBe('success');
      expect(first.inserted_sessions).toBeGreaterThan(0);
      expect(afterFirst.sessions).toBeGreaterThan(before.sessions);
      expect(afterFirst.scanKanban).toBe(1);
      expect(afterFirst.synthKanban).toBeGreaterThan(0);

      const second = runManualScan(db, { scope: 'global', today: TODAY, provider });
      const afterSecond = counts(db, 1);
      const diaryAfterSecond = getProjectDetail(db, 1, TODAY)!.diary.length;

      expect(second.status).toBe('success');
      expect(second.inserted_sessions).toBe(0);
      expect(second.inserted_kanban_cards).toBe(0);
      expect(second.updated_kanban_cards).toBeGreaterThan(0);
      expect(afterSecond).toEqual(afterFirst);
      expect(diaryAfterSecond).toBe(diaryAfterFirst);
    });

    it('scan-derived summary 不會改寫 scheduler 專屬的 global daily_logs projection', () => {
      const before = db
        .prepare(`SELECT global_summary_ai, global_summary_user, per_project_summary, fallback_report, summary_status FROM daily_logs WHERE date = ?`)
        .get(TODAY);

      const result = runManualScan(db, { scope: 'global', today: TODAY, provider: mockScanProvider() });

      const after = db
        .prepare(`SELECT global_summary_ai, global_summary_user, per_project_summary, fallback_report, summary_status FROM daily_logs WHERE date = ?`)
        .get(TODAY);
      expect(result.status).toBe('success');
      expect(result.updated_daily_logs).toBe(0);
      expect(after).toEqual(before);
    });

    it('project rescan 只影響 selected project', () => {
      const p1Before = counts(db, 1);
      const p2Before = counts(db, 2);
      const p3Before = counts(db, 3);

      const result = runManualScan(db, { scope: 'project', projectId: 2, today: TODAY, provider: mockScanProvider() });

      expect(result.status).toBe('success');
      expect(result.scanned_projects).toEqual([2]);
      expect(counts(db, 1)).toEqual(p1Before);
      expect(counts(db, 3)).toEqual(p3Before);
      expect(counts(db, 2).sessions).toBeGreaterThan(p2Before.sessions);
      expect(counts(db, 2).tokens).toBeGreaterThan(p2Before.tokens);
      expect(counts(db, 2).scanKanban).toBe(1);
    });

    it('ignored / scan_paused project 不會被掃描', () => {
      db.prepare(`UPDATE projects SET scan_paused = 1 WHERE id = 2`).run();
      db.prepare(`UPDATE projects SET ignored = 1 WHERE id = 3`).run();
      const p2Before = counts(db, 2);
      const p3Before = counts(db, 3);

      const result = runManualScan(db, { scope: 'global', today: TODAY, provider: mockScanProvider() });

      expect(result.status).toBe('success');
      expect(result.scanned_projects).not.toContain(2);
      expect(result.scanned_projects).not.toContain(3);
      expect(result.skipped_projects).toEqual(
        expect.arrayContaining([
          { project_id: 2, reason: 'scan_paused' },
          { project_id: 3, reason: 'ignored' },
        ]),
      );
      expect(counts(db, 2)).toEqual(p2Before);
      expect(counts(db, 3)).toEqual(p3Before);
    });

    it('scanner failure 不會留下 partial writes', () => {
      const before = [1, 2, 3].map((id) => counts(db, id));
      const failingProvider: ScanProvider = {
        scanProject(project) {
          if (project.id === 2) throw new Error('mock scanner failed');
          return {
            sessions: [
              {
                agent_name: 'codex-cli',
                model: 'gpt-5-codex',
                start_time: `${TODAY}T21:00:00Z`,
                end_time: `${TODAY}T21:12:00Z`,
                token_total: 1234,
                token_input: 600,
                token_cached: 100,
                token_output: 400,
                token_reasoning: 134,
                source_log_ref: `test-failure://p${project.id}/${TODAY}`,
                command: 'scan',
                duration: 720,
                status: 'completed',
                summary: 'This write should roll back if any project fails.',
              },
            ],
            kanban_cards: [],
            daily_summary: 'Should not persist on failed global scan.',
          };
        },
      };

      const result = runManualScan(db, { scope: 'global', today: TODAY, provider: failingProvider });

      expect(result.status).toBe('failed');
      expect(result.error_message).toContain('mock scanner failed');
      expect([1, 2, 3].map((id) => counts(db, id))).toEqual(before);
    });

    it('invalid selected project throws not found before writes', () => {
      expect(() => runManualScan(db, { scope: 'project', projectId: 9999, today: TODAY })).toThrow(ScanNotFoundError);
    });

    it('scan path 不寫 project folder、不執行 shell', () => {
      const repo = initRepoProject(db);
      const beforeFiles = readdirSync(repo).sort();
      const beforeHead = readFileSync(join(repo, '.git', 'HEAD'), 'utf8');
      const beforeStatus = git(repo, ['status', '--porcelain=v1']);

      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider: mockScanProvider() });

      expect(result.status).toBe('success');
      expect(readdirSync(repo).sort()).toEqual(beforeFiles);
      expect(readFileSync(join(repo, '.git', 'HEAD'), 'utf8')).toBe(beforeHead);
      expect(git(repo, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    });

    it('scan 會依 settings allowlist 讀取 project docs，但拒絕跳出 project root 的路徑', () => {
      const repo = initRepoProject(db);
      mkdirSync(join(repo, 'docs', 'specs'), { recursive: true });
      writeFileSync(join(repo, 'docs', 'specs', 'MASTER.md'), '# MASTER\n\nSystem of record.\n');
      writeFileSync(join(repo, 'docs', 'notes.md'), '# Notes\n\nFolder scanned.\n');
      mkdirSync(join(repo, 'docs', '.secret'), { recursive: true });
      writeFileSync(join(repo, 'docs', '.secret', 'hidden.md'), '# Hidden\n');

      const result = runManualScan(db, {
        scope: 'project',
        projectId: 1,
        today: TODAY,
        provider: mockScanProvider(),
        projectDocFilenames: ['docs/specs/MASTER.md', '../secrets.md'],
        projectDocFolders: ['docs', '../private'],
      });
      const detail = getProjectDetail(db, 1, TODAY)!;

      expect(result.status).toBe('success');
      expect(detail.docs.map((doc) => doc.name)).toContain('docs/specs/MASTER.md');
      expect(detail.docs.map((doc) => doc.name)).toContain('docs/notes.md');
      expect(detail.docs.find((doc) => doc.name === 'docs/specs/MASTER.md')?.content).toContain('System of record');
      expect(detail.docs.find((doc) => doc.name === 'docs/notes.md')?.content).toContain('Folder scanned');
      expect(detail.docs.some((doc) => doc.name.includes('secrets'))).toBe(false);
      expect(detail.docs.some((doc) => doc.name.includes('hidden'))).toBe(false);
    });

    it('persistent DB runtime 沒有 matching CLI logs 時不寫 deterministic mock fallback', () => {
      const homeDir = tempRoot();
      const provider = createConfiguredScanProvider({ DEVDIARY_DB: join(homeDir, 'DevDiary.sqlite') }, { homeDir });
      const before = counts(db, 1);

      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });

      expect(result.status).toBe('success');
      expect(result.inserted_sessions).toBe(0);
      expect(result.inserted_kanban_cards).toBe(0);
      expect(counts(db, 1)).toEqual(before);
    });

    it('in-memory dev runtime 沒有 matching CLI logs 時保留 deterministic mock fallback', () => {
      const homeDir = tempRoot();
      const provider = createConfiguredScanProvider({ DEVDIARY_DB: ':memory:' }, { homeDir });

      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });

      expect(result.status).toBe('success');
      expect(result.inserted_sessions).toBe(1);
      expect(result.inserted_kanban_cards).toBeGreaterThanOrEqual(1);
      expect(counts(db, 1).scanKanban).toBe(1);
    });

    it('DEVDIARY_SCAN_PROVIDER=mock 可強制使用 deterministic mock provider', () => {
      const homeDir = tempRoot();
      const provider = createConfiguredScanProvider({ DEVDIARY_SCAN_PROVIDER: 'mock', DEVDIARY_DB: join(homeDir, 'DevDiary.sqlite') }, { homeDir });

      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider });

      expect(result.status).toBe('success');
      expect(result.inserted_sessions).toBe(1);
      expect(result.inserted_kanban_cards).toBeGreaterThanOrEqual(1);
      expect(counts(db, 1).scanKanban).toBe(1);
    });

    it('manual user status lock prevents scan upsert from overwriting card status', () => {
      const provider: ScanProvider = {
        scanProject() {
          return {
            sessions: [],
            kanban_cards: [
              {
                title: 'Auto card v1',
                description: 'first',
                status: 'in_progress',
                assignee_agent_id: 'codex-cli',
                source_ref: 'agent-synth://p1/manual-lock-test',
              },
            ],
            daily_summary: null,
          };
        },
      };
      expect(runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider }).inserted_kanban_cards).toBeGreaterThanOrEqual(1);
      const row = db.prepare(`SELECT id FROM kanban_cards WHERE source_ref = ?`).get('agent-synth://p1/manual-lock-test') as { id: number };
      db.prepare(`UPDATE kanban_cards SET status = 'done', status_locked_by_user = 1 WHERE id = ?`).run(row.id);

      const updatedProvider: ScanProvider = {
        scanProject() {
          return {
            sessions: [],
            kanban_cards: [
              {
                title: 'Auto card v2',
                description: 'second',
                status: 'in_progress',
                assignee_agent_id: 'codex-cli',
                source_ref: 'agent-synth://p1/manual-lock-test',
              },
            ],
            daily_summary: null,
          };
        },
      };

      const result = runManualScan(db, { scope: 'project', projectId: 1, today: TODAY, provider: updatedProvider });
      const final = db.prepare(`SELECT title, description, status, status_locked_by_user FROM kanban_cards WHERE id = ?`).get(row.id) as {
        title: string;
        description: string;
        status: string;
        status_locked_by_user: number;
      };
      expect(result.updated_kanban_cards).toBeGreaterThan(0);
      expect(final.title).toBe('Auto card v2');
      expect(final.description).toBe('second');
      expect(final.status).toBe('done');
      expect(final.status_locked_by_user).toBe(1);
    });
  });

  describe('Mock API', () => {
    it('POST /api/projects/:id/kanban/ai-sync auto-adds gated cards and returns refreshed detail', async () => {
      const app = createServer(db, {
        kanbanAiGenerator: async () => ({
          agent_id: 'test-ai',
          text: JSON.stringify({
            cards: [
              {
                title: '補上 AI Kanban 測試',
                description: '下一步是完成 AI Kanban API route 測試。',
                suggested_status: 'todo',
                confidence: 0.91,
                evidence: 'Next step: add API route test.',
                reason: '明確提到下一步。',
                dedupe_key: 'api-route-test',
              },
              {
                title: '低信心卡',
                description: '不應自動加入。',
                suggested_status: 'todo',
                confidence: 0.2,
                evidence: 'weak',
                reason: 'low confidence',
                dedupe_key: 'low-confidence',
              },
            ],
          }),
        }),
      });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/1/kanban/ai-sync?range=all`, { method: 'POST' });
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
          ai_sync: { inserted: number; skipped: number; warnings: string[] };
          project_detail: { kanban: Array<{ title: string; source_ref: string }> };
        };
        expect(body.ai_sync.inserted).toBe(1);
        expect(body.ai_sync.skipped).toBe(1);
        expect(body.ai_sync.warnings.join('\n')).toContain('confidence');
        expect(body.project_detail.kanban.some((card) => card.title === '補上 AI Kanban 測試' && card.source_ref.startsWith('ai-suggest://'))).toBe(true);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('POST /api/scan includes ai_sync counts only when kanban_ai_auto_add is enabled', async () => {
      updateSettings(db, { kanban_ai_auto_add: { enabled: true } }, runtime());
      let calls = 0;
      const app = createServer(db, {
        scanProvider: mockScanProvider(),
        kanbanAiGenerator: async () => {
          calls += 1;
          return {
            agent_id: 'test-ai',
            text: JSON.stringify({
              cards: [
                {
                  title: `掃描後 AI 自動加入 ${calls}`,
                  description: '下一步是確認 scan response 的 ai_sync counts。',
                  suggested_status: 'todo',
                  confidence: 0.93,
                  evidence: 'Next step: inspect ai_sync counts.',
                  reason: 'scan 後自動建立待辦。',
                  dedupe_key: `scan-ai-sync-${calls}`,
                },
              ],
            }),
          };
        },
      });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/scan?range=24h`, { method: 'POST' });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { scan: { ai_sync: { inserted: number; skipped: number } } };
        expect(calls).toBeGreaterThan(0);
        expect(body.scan.ai_sync.inserted).toBeGreaterThan(0);
        expect(body.scan.ai_sync.skipped).toBe(0);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('POST /api/scan 與 /api/projects/:id/scan 回 scan status 與 refreshed snapshots', async () => {
      const app = createServer(db, { scanProvider: mockScanProvider() });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const global = await fetch(`${base}/api/scan?range=24h`, { method: 'POST' });
        expect(global.status).toBe(200);
        const globalBody = (await global.json()) as {
          scan: { status: string; inserted_sessions: number };
          dashboard: { metric: { session_count: number } };
          projects: unknown[];
        };
        expect(globalBody.scan.status).toBe('success');
        expect(globalBody.scan.inserted_sessions).toBeGreaterThan(0);
        expect(globalBody.dashboard.metric.session_count).toBeGreaterThan(0);
        expect(globalBody.projects.length).toBeGreaterThan(0);

        const project = await fetch(`${base}/api/projects/2/scan?range=custom&start=${TODAY}&end=${TODAY}`, { method: 'POST' });
        expect(project.status).toBe(200);
        const projectBody = (await project.json()) as {
          scan: { status: string; scanned_projects: number[] };
          project_detail: { project: { id: number }; range_key: string; start_date: string; end_date: string };
        };
        expect(projectBody.scan.status).toBe('success');
        expect(projectBody.scan.scanned_projects).toEqual([2]);
        expect(projectBody.project_detail.project.id).toBe(2);
        expect(projectBody.project_detail.range_key).toBe('custom');
        expect(projectBody.project_detail.start_date).toBe(TODAY);
        expect(projectBody.project_detail.end_date).toBe(TODAY);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('invalid project id / missing selected project 回正確錯誤', async () => {
      const app = createServer(db);
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const invalid = await fetch(`${base}/api/projects/nope/scan`, { method: 'POST' });
        expect(invalid.status).toBe(400);

        const missing = await fetch(`${base}/api/projects/9999/scan`, { method: 'POST' });
        expect(missing.status).toBe(404);
        const body = (await missing.json()) as { error: string };
        expect(body.error).toBe('not_found');
        expect(getSettings(db, runtime()).background_scan.running_operations).toEqual([]);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  });
});
