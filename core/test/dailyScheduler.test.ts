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
const RUN_AT = new Date('2026-06-30T12:00:00.000Z'); // 2026-06-30 20:00 Asia/Taipei

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
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });

      const result = await scheduler.runNow({ force: true, now: RUN_AT });

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

    it('daily scheduler 會統計有明確 fallback_report 的 project diary', async () => {
      const db = freshDb();
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => {
          throw new Error('provider unavailable');
        },
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });

      const result = await scheduler.runNow({ force: true, now: RUN_AT });

      expect(result.status).toBe('success');
      const eligible = db.prepare(
        `SELECT COUNT(DISTINCT project_id) AS c FROM sessions WHERE date(start_time, '+8 hours') = ?`,
      ).get(TODAY) as { c: number };
      expect(result.daily_diaries_fallback).toBe(eligible.c);
      const fallback = db.prepare(
        `SELECT fallback_report FROM project_daily_diaries WHERE project_id = 1 AND date = ?`,
      ).get(TODAY) as { fallback_report: string | null };
      expect(fallback.fallback_report).toContain('deterministic fallback');
    });

    it('automatic tick 只在 enabled / 到達時間 / 今日未跑時執行', async () => {
      const db = freshDb();
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## scheduled', agent_id: 'fallback', fallback_report: null }),
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
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
        kanbanAiGenerator: null,
      });

      const result = await scheduler.runNow({ force: true, now: RUN_AT });

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
        globalSummaryAgent: null,
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

      const result = await scheduler.runNow({ force: true, now: RUN_AT });

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
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });

      const result = await scheduler.runNow({ force: true, now: RUN_AT });

      expect(result.status).toBe('success');
      const log = db.prepare(`SELECT per_project_summary, summary_status FROM daily_logs WHERE date = ?`).get(TODAY) as {
        per_project_summary: string;
        summary_status: string;
      };
      const perProject = JSON.parse(log.per_project_summary) as Record<string, string>;
      expect(perProject['1']).toContain(`在 ${TODAY}`);
      expect(perProject['1']).not.toContain('使用者已修正這天的內容');
      expect(perProject['2']).toContain(`在 ${TODAY}`);
      // A confirmed project diary must remain independent from the global daily highlight.
      expect(log.summary_status).toBe('ai_generated');
      expect(db.prepare(`SELECT status FROM project_daily_diaries WHERE project_id = 1 AND date = ?`).get(TODAY)).toEqual({
        status: 'confirmed',
      });
      expect(
        db.prepare(`SELECT markdown FROM project_daily_diaries WHERE project_id = 1 AND date = ?`).get(TODAY),
      ).toEqual({ markdown: manual });
    });

    it('daily scheduler global projection does not read confirmed project diary markdown', async () => {
      const db = freshDb();
      saveProjectDiaryEntry(db, 1, TODAY, { markdown: '## confirmed private diary' }, TODAY);
      const originalPrepare = db.prepare.bind(db);
      db.prepare = ((source: string) => {
        if (/SELECT[\s\S]*markdown[\s\S]*FROM\s+project_daily_diaries/i.test(source)) {
          throw new Error('scheduler must not read project diary markdown');
        }
        return originalPrepare(source);
      }) as typeof db.prepare;
      try {
        const scheduler = new DailySchedulerRuntime(db, runtime, {
          projectSummaryAgent: null,
          globalSummaryAgent: null,
          kanbanAiGenerator: null,
        });
        await expect(scheduler.runNow({ force: true, now: RUN_AT })).resolves.toMatchObject({ status: 'success' });
      } finally {
        db.prepare = originalPrepare as typeof db.prepare;
      }
    });

    it('scheduler uses a Taipei calendar date and reports separate output counters', async () => {
      const db = freshDb();
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async (_snapshot, date) => ({
          markdown: `## generated for ${date}`,
          agent_id: 'fallback',
          fallback_report: null,
        }),
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });

      const result = await scheduler.runNow({
        force: true,
        now: new Date('2026-06-30T12:30:00.000Z'),
      });

      expect(result.status).toBe('success');
      expect(result.date).toBe(TODAY);
      expect(result.project_summaries_updated).toBe(result.project_count);
      const eligible = db.prepare(
        `SELECT COUNT(DISTINCT project_id) AS c FROM sessions WHERE date(start_time, '+8 hours') = ?`,
      ).get(TODAY) as { c: number };
      expect(result.daily_diaries_updated).toBe(eligible.c);
      expect(result.daily_diaries_preserved).toBe(0);
      expect(result.daily_highlight_updated).toBe(1);
      expect(db.prepare(`SELECT COUNT(*) AS c FROM project_daily_diaries WHERE date = ?`).get(TODAY)).toEqual({
        c: eligible.c,
      });
    });

    it('01:00 automatic scheduler summarizes only the current Taipei day activity and stays idempotent', async () => {
      const db = freshDb();
      const targetDate = '2026-07-01';
      db.prepare(`DELETE FROM sessions WHERE date(start_time, '+8 hours') = ?`).run(targetDate);
      db.prepare(
        `INSERT INTO sessions (project_id, agent_name, model, start_time, token_total, source_log_ref, command, summary)
         VALUES (1, 'codex-cli', 'gpt-5-codex', '2026-06-30T16:30:00.000Z', 321, 'test://same-day', 'same day task', 'same day summary')`,
      ).run();
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '01:00' } }, runtime());
      const seenDates: string[] = [];
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async (snapshot, date) => {
          if (snapshot.range_key === 'custom' && snapshot.start_date === date && snapshot.end_date === date) seenDates.push(date);
          return { markdown: `## generated for ${date}`, agent_id: 'fallback', fallback_report: null };
        },
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });
      const runAt = new Date('2026-06-30T17:00:00.000Z'); // 2026-07-01 01:00 Asia/Taipei

      const result = await scheduler.tick(runAt);

      expect(result.status).toBe('success');
      expect(result.date).toBe(targetDate);
      expect(seenDates).toEqual([targetDate]);
      expect(result.daily_diaries_updated).toBe(1);
      expect(db.prepare(`SELECT status FROM daily_scheduler_runs WHERE date = ?`).get(targetDate)).toEqual({ status: 'success' });
      expect(db.prepare(`SELECT project_id FROM project_daily_diaries WHERE date = ?`).all(targetDate)).toEqual([{ project_id: 1 }]);
      expect(db.prepare(`SELECT date FROM daily_logs WHERE date = ?`).get(targetDate)).toEqual({ date: targetDate });
      expect(getSettings(db, runtime()).daily_scheduler.semantics_version).toBe('same-taipei-day-v1');
      expect((await scheduler.tick(new Date('2026-06-30T18:00:00.000Z'))).message).toContain('already ran');
    });

    it('current Taipei date crosses the year boundary safely', async () => {
      const db = freshDb();
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: null,
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });

      const result = await scheduler.runNow({ force: true, now: new Date('2026-12-31T17:00:00.000Z') });

      expect(result.status).toBe('success');
      expect(result.date).toBe('2027-01-01');
      expect(db.prepare(`SELECT status FROM daily_scheduler_runs WHERE date = ?`).get('2027-01-01')).toEqual({ status: 'success' });
    });

    it('current scheduler semantics safely reruns one old same-date success, then skips', async () => {
      const db = freshDb();
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '18:00' } }, runtime());
      db.prepare(
        `INSERT INTO daily_scheduler_runs
         (date, owner_instance_id, lease_expires_at, status, started_at, completed_at, error)
         VALUES (?, 'legacy-owner', '2026-06-30T11:00:00.000Z', 'success', '2026-06-30T10:00:00.000Z', '2026-06-30T10:05:00.000Z', NULL)`,
      ).run(TODAY);
      let diaryCalls = 0;
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async (snapshot) => {
          if (snapshot.range_key === 'custom') diaryCalls += 1;
          return { markdown: '## current semantics', agent_id: 'fallback', fallback_report: null };
        },
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });

      const first = await scheduler.tick(RUN_AT);
      expect(first.status).toBe('success');
      expect(diaryCalls).toBeGreaterThan(0);
      expect(getSettings(db, runtime()).daily_scheduler.semantics_version).toBe('same-taipei-day-v1');
      const callsAfterFirst = diaryCalls;

      const second = await scheduler.tick(new Date('2026-06-30T13:00:00.000Z'));
      expect(second.status).toBe('skipped');
      expect(second.message).toContain('already ran');
      expect(diaryCalls).toBe(callsAfterFirst);
    });

    it('scheduler respects a live lease, recovers an expired lease, and keeps ordinary success idempotent', async () => {
      const db = freshDb();
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '00:00' } }, runtime());
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## scheduled', agent_id: 'fallback', fallback_report: null }),
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });
      db.prepare(
        `INSERT INTO daily_scheduler_runs
         (date, owner_instance_id, lease_expires_at, status, started_at, completed_at, error)
         VALUES (?, 'other-live-owner', ?, 'running', ?, NULL, NULL)`,
      ).run(TODAY, '2026-06-30T12:10:00.000Z', '2026-06-30T12:00:00.000Z');

      expect((await scheduler.runNow({ now: new Date('2026-06-30T12:01:00.000Z') })).status).toBe('skipped');
      db.prepare(`UPDATE daily_scheduler_runs SET lease_expires_at = ? WHERE date = ?`).run(
        '2026-06-30T11:59:00.000Z',
        TODAY,
      );
      expect((await scheduler.runNow({ now: new Date('2026-06-30T12:02:00.000Z') })).status).toBe('success');
      expect((await scheduler.runNow({ now: new Date('2026-06-30T12:03:00.000Z') })).status).toBe('skipped');
      expect(db.prepare(`SELECT status FROM daily_scheduler_runs WHERE date = ?`).get(TODAY)).toEqual({
        status: 'success',
      });
    });

    it('scheduler refuses to finalize success after another owner takes the lease', async () => {
      const db = freshDb();
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      const observed = new Promise<void>((resolve) => { started = resolve; });
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## scheduled', agent_id: 'fallback', fallback_report: null }),
        globalSummaryAgent: async () => {
          started();
          await waiting;
          return { markdown: '## highlight', agent_id: 'fallback', fallback_report: null };
        },
        kanbanAiGenerator: null,
      });

      const running = scheduler.runNow({ force: true, now: RUN_AT });
      await observed;
      db.prepare(`UPDATE daily_scheduler_runs SET owner_instance_id = 'other-owner' WHERE date = ?`).run(TODAY);
      release();
      const result = await running;

      expect(result.status).toBe('failed');
      expect(result.message).toContain('lease was lost');
      expect(result.message).toContain('failure_state_not_persisted');
      expect(getSettings(db, runtime()).daily_scheduler.semantics_version).toBeNull();
      expect(db.prepare(`SELECT status, owner_instance_id FROM daily_scheduler_runs WHERE date = ?`).get(TODAY)).toEqual({
        status: 'running',
        owner_instance_id: 'other-owner',
      });
    });

    it('scheduler runs all project outputs before Kanban and writes global highlight last', async () => {
      const db = freshDb();
      updateSettings(db, { kanban_ai_auto_add: { enabled: true } }, runtime());
      const calls: string[] = [];
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async (snapshot) => {
          calls.push(`project:${snapshot.project.id}`);
          return { markdown: '## scheduled', agent_id: 'fallback', fallback_report: null };
        },
        kanbanAiGenerator: async () => {
          calls.push('kanban');
          return { agent_id: 'test-ai', text: JSON.stringify({ cards: [] }) };
        },
        globalSummaryAgent: async () => {
          calls.push('highlight');
          return {
            markdown: '## 每日開發重點\n- 達成：測試\n- 阻礙：無\n- 下一步：完成',
            agent_id: 'fallback',
            fallback_report: null,
          };
        },
      });

      expect((await scheduler.runNow({ force: true, now: RUN_AT })).status).toBe('success');
      const firstKanban = calls.findIndex((call) => call === 'kanban');
      const lastProject = calls.reduce((index, call, current) => call.startsWith('project:') ? current : index, -1);
      expect(firstKanban).toBeGreaterThan(lastProject);
      expect(calls.at(-1)).toBe('highlight');
    });

    it('scheduler final transaction failure rolls back success and reports when failure state cannot persist', async () => {
      const db = freshDb();
      db.exec(`
        CREATE TRIGGER fail_daily_highlight BEFORE INSERT ON daily_logs
        BEGIN SELECT RAISE(ABORT, 'forced final transaction failure'); END;
        CREATE TRIGGER fail_scheduler_state BEFORE UPDATE ON daily_scheduler_runs
        BEGIN SELECT RAISE(ABORT, 'forced terminal state failure'); END;
      `);
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## scheduled', agent_id: 'fallback', fallback_report: null }),
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
      });

      const result = await scheduler.runNow({ force: true, now: RUN_AT });

      expect(result.status).toBe('failed');
      expect(result.daily_highlight_updated).toBe(0);
      expect(result.daily_log_updated).toBe(false);
      expect(result.message).toContain('failure_state_not_persisted');
      expect(db.prepare(`SELECT status FROM daily_scheduler_runs WHERE date = ?`).get(TODAY)).toEqual({
        status: 'running',
      });
    });
  });

  describe('Mock API', () => {
    it('scheduler status 與 run endpoint 可被 UI 呼叫', async () => {
      const db = freshDb();
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '18:00' } }, runtime());
      const scheduler = new DailySchedulerRuntime(db, runtime, {
        projectSummaryAgent: async () => ({ markdown: '## API scheduled', agent_id: 'fallback', fallback_report: null }),
        globalSummaryAgent: null,
        kanbanAiGenerator: null,
        now: () => RUN_AT,
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
        const body = (await run.json()) as { status: string; date: string; daily_log_updated: boolean; preflight: { overall_status: string } };
        expect(run.status).toBe(200);
        expect(body.status).toBe('success');
        expect(body.date).toBe(TODAY);
        expect(body.daily_log_updated).toBe(true);
        expect(body.preflight.overall_status).toBe('ok');
        expect(db.prepare(`SELECT status FROM daily_scheduler_runs WHERE date = ?`).get(TODAY)).toEqual({ status: 'success' });
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
