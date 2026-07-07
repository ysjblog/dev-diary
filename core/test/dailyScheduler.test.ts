import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import { DailySchedulerRuntime } from '../src/services/dailyScheduler.js';
import { getSettings, updateSettings } from '../src/services/settings.js';
import { saveProjectDiaryEntry, saveProjectSummary } from '../src/services/projectWrites.js';
import { buildSchedulerPreflight } from '../src/services/schedulerPreflight.js';
import { runSchedulerTickWithRecovery } from '../src/services/schedulerRecovery.js';

const TODAY = '2026-06-30';

function freshDb() {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 15, seed: 1337 });
  return db;
}

function runtime() {
  return { activeDbPath: ':memory:', projectRoots: [] };
}

describe('Daily scheduler', () => {
  describe('function 邏輯', () => {
    it('daily scheduler run-now 產生 global daily log 與 project AI drafts', async () => {
      const db = freshDb();
      saveProjectSummary(db, 1, { markdown: '## 手動摘要' }, TODAY);
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async (snapshot) => ({
          markdown: `## ${snapshot.project.name} scheduled draft`,
          agent_id: 'antigravity-cli',
          fallback_report: null,
        }),
      });

      const result = await scheduler.runNow({ force: true, now: new Date('2026-06-30T12:00:00.000Z') });

      expect(result.status).toBe('success');
      expect(result.daily_log_updated).toBe(true);
      expect(result.project_drafts_updated).toBeGreaterThan(0);
      const log = db.prepare(`SELECT global_summary_ai, summary_status FROM daily_logs WHERE date = ?`).get(TODAY) as {
        global_summary_ai: string;
        summary_status: string;
      };
      expect(log.summary_status).toBe('ai_generated');
      expect(log.global_summary_ai).toContain('每日開發重點');
      expect(log.global_summary_ai).toContain('達成');
      expect(log.global_summary_ai).not.toContain('Projects checked');
      const summary = db.prepare(`SELECT markdown_user, markdown_ai FROM project_summaries WHERE project_id = 1`).get() as {
        markdown_user: string;
        markdown_ai: string;
      };
      expect(summary.markdown_user).toBe('## 手動摘要');
      expect(summary.markdown_ai).toContain('scheduled draft');
      const synthCards = db.prepare(`SELECT COUNT(*) AS c FROM kanban_cards WHERE source_ref LIKE 'agent-synth://%'`).get() as { c: number };
      expect(synthCards.c).toBeGreaterThan(0);
      expect(getSettings(db, runtime()).daily_scheduler.last_status).toBe('success');
    });

    it('automatic tick 只在 enabled / 到達時間 / 今日未跑時執行', async () => {
      const db = freshDb();
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## scheduled', agent_id: 'fallback', fallback_report: null }),
      });

      expect((await scheduler.tick(new Date('2026-06-30T12:00:00.000Z'))).status).toBe('skipped');
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '21:00' } }, runtime());
      expect((await scheduler.tick(new Date('2026-06-30T12:00:00.000Z'))).message).toContain('not arrived');
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '18:00' } }, runtime());
      expect((await scheduler.tick(new Date('2026-06-30T12:00:00.000Z'))).status).toBe('success');
      expect((await scheduler.tick(new Date('2026-06-30T13:00:00.000Z'))).message).toContain('already ran');
      expect((await scheduler.tick(new Date('2026-06-30T13:01:00.000Z'))).message).toContain('already ran');
      expect((await scheduler.runNow({ force: true, now: new Date('2026-06-30T13:05:00.000Z') })).status).toBe('success');
    });

    it('daily scheduler global highlight uses persisted prompt override', async () => {
      const db = freshDb();
      updateSettings(db, {
        ai_prompts: { daily_highlight: '請用 PM 交接語氣整理每日重點。' },
      }, runtime());
      let seenPrompt = '';
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: null,
        globalSummaryAgent: async (prompt) => {
          seenPrompt = prompt;
          return { markdown: '## 今日開發重點\n- 達成：測試\n- 阻礙：無\n- 下一步：交接', agent_id: 'fallback', fallback_report: null };
        },
      });

      const result = await scheduler.runNow({ force: true, now: new Date('2026-06-30T12:00:00.000Z') });

      expect(result.status).toBe('success');
      expect(seenPrompt).toContain('請用 PM 交接語氣整理每日重點。');
      expect(seenPrompt).toContain('SAFETY_CONSTRAINTS');
      expect(seenPrompt).toContain('STRUCTURED_DATA');
      expect(seenPrompt).toContain(`target_date=${TODAY}`);
      expect(seenPrompt).toContain('唯一允許使用的目標日期');
    });

    it('daily scheduler auto-adds AI Kanban cards when enabled without blocking diary flow', async () => {
      const db = freshDb();
      updateSettings(db, { kanban_ai_auto_add: { enabled: true } }, runtime());
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## scheduled', agent_id: 'fallback', fallback_report: null }),
        kanbanAiGenerator: async () => ({
          agent_id: 'test-ai',
          text: JSON.stringify({
            cards: [
              {
                title: 'Scheduler AI Kanban 卡',
                description: '下一步是確認 scheduler 會自動加入 AI Kanban 卡。',
                suggested_status: 'todo',
                confidence: 0.92,
                evidence: 'Next step: scheduler auto-add.',
                reason: 'daily scheduler 觸發。',
                dedupe_key: 'scheduler-ai-auto-add',
              },
            ],
          }),
        }),
      });

      const result = await scheduler.runNow({ force: true, now: new Date('2026-06-30T12:00:00.000Z') });

      expect(result.status).toBe('success');
      expect(result.kanban_ai_sync?.inserted).toBeGreaterThan(0);
      const row = db.prepare(`SELECT title FROM kanban_cards WHERE source_ref LIKE 'ai-suggest://%'`).get() as { title: string };
      expect(row.title).toBe('Scheduler AI Kanban 卡');
    });

    it('daily scheduler preserves manually confirmed per-project diary entries', async () => {
      const db = freshDb();
      const manual = '## 手動保留\n- 使用者已修正這天的內容，不應被 scheduler 覆蓋。';
      saveProjectDiaryEntry(db, 1, TODAY, { markdown: manual }, TODAY);
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## scheduled', agent_id: 'fallback', fallback_report: null }),
      });

      const result = await scheduler.runNow({ force: true, now: new Date('2026-06-30T12:00:00.000Z') });

      expect(result.status).toBe('success');
      const log = db.prepare(`SELECT per_project_summary, summary_status FROM daily_logs WHERE date = ?`).get(TODAY) as {
        per_project_summary: string;
        summary_status: string;
      };
      const perProject = JSON.parse(log.per_project_summary) as Record<string, string>;
      expect(perProject['1']).toBe(manual);
      expect(perProject['2']).toContain(`在 ${TODAY}`);
      expect(log.summary_status).toBe('confirmed');
    });
  });

  describe('Mock API', () => {
    it('scheduler status 與 run endpoint 可被 UI 呼叫', async () => {
      const db = freshDb();
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '18:00' } }, runtime());
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## API scheduled', agent_id: 'fallback', fallback_report: null }),
      });
      const app = createServer(db, {
        dailyScheduler: scheduler,
        agentDetector: async () => ({
          checked_at: '2026-06-30T12:00:00.000Z',
          agents: [
            {
              id: 'codex-cli',
              display_name: 'Codex CLI',
              available: true,
              binary_path: '/tmp/codex',
              version: 'codex 1.0',
              status: 'connected',
              error_message: null,
              checked_at: '2026-06-30T12:00:00.000Z',
            },
          ],
        }),
      });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const status = await fetch(`${base}/api/scheduler/daily`);
        expect(status.status).toBe(200);
        const statusBody = (await status.json()) as { enabled: boolean };
        expect(statusBody.enabled).toBe(true);

        const preflight = await fetch(`${base}/api/scheduler/daily/preflight`);
        expect(preflight.status).toBe(200);
        const preflightBody = (await preflight.json()) as { overall_status: string; checks: Array<{ id: string; status: string }> };
        expect(preflightBody.overall_status).toBe('ok');
        expect(preflightBody.checks.map((check) => check.id)).toEqual([
          'core_health',
          'scheduler_settings',
          'agent_detection',
          'scan_provider',
        ]);

        const run = await fetch(`${base}/api/scheduler/daily/run`, { method: 'POST' });
        const body = (await run.json()) as { status: string; daily_log_updated: boolean; preflight: { overall_status: string } };
        expect(run.status).toBe(200);
        expect(body.status).toBe('success');
        expect(body.daily_log_updated).toBe(true);
        expect(body.preflight.overall_status).toBe('ok');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  });

  describe('狀態回歸', () => {
    it('preflight agent detection failure becomes warning and deterministic fallback can proceed', async () => {
      const db = freshDb();
      const settings = getSettings(db, runtime());

      const preflight = await buildSchedulerPreflight({
        settings,
        core: { contract_version: 'core-api-v4', db_path: ':memory:', project_roots: [] },
        agentDetector: async () => {
          throw new Error('agent detector unavailable');
        },
        now: () => new Date('2026-06-30T12:00:00.000Z'),
      });

      expect(preflight.overall_status).toBe('warning');
      expect(preflight.checks.find((check) => check.id === 'agent_detection')?.message).toContain('fallback');
    });

    it('recovery tick marks long sleep-like gaps and still calls scheduler tick', async () => {
      const calls: string[] = [];
      const scheduler = {
        tick: async (now: Date) => {
          calls.push(now.toISOString());
          return {
            status: 'skipped',
            date: now.toISOString().slice(0, 10),
            message: 'test tick',
            project_count: 0,
            daily_log_updated: false,
            project_drafts_updated: 0,
            kanban_cards_updated: 0,
            error_message: null,
          };
        },
      } as unknown as DailySchedulerRuntime;
      const state = { lastTickAt: null as number | null };

      const first = runSchedulerTickWithRecovery(scheduler, state, {
        intervalMs: 60_000,
        now: new Date('2026-06-30T12:00:00.000Z'),
      });
      expect(first.recovery).toBe(false);
      await first.result;

      const second = runSchedulerTickWithRecovery(scheduler, state, {
        intervalMs: 60_000,
        now: new Date('2026-06-30T12:05:30.000Z'),
      });
      expect(second.recovery).toBe(true);
      expect(second.elapsed_ms).toBe(330_000);
      await second.result;
      expect(calls).toEqual(['2026-06-30T12:00:00.000Z', '2026-06-30T12:05:30.000Z']);
    });
  });
});
