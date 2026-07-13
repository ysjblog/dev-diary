import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { backgroundIntervalMs, backgroundStartupDelayMs, runBackgroundCycle } from '../src/services/backgroundRunner.js';
import { sleepUntilNextBackgroundCycle } from '../src/backgroundRunner.js';
import { AntigravitySessionGate } from '../src/services/antigravitySession.js';
import { createConfiguredScanProvider } from '../src/services/scans.js';
import { getSettings, updateSettings } from '../src/services/settings.js';

const TODAY = '2026-06-30';

function freshDb() {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 3, seed: 7331 });
  return db;
}

function runtime() {
  return {
    activeDbPath: ':memory:',
    projectRoots: [],
    scanProviderPolicy: { provider: 'mock' as const, fallback: 'mock' as const },
  };
}

function mockScanProvider() {
  return createConfiguredScanProvider({ DEVDIARY_SCAN_PROVIDER: 'mock', DEVDIARY_DB: ':memory:' });
}

describe('Background LaunchAgent runner', () => {
  describe('function 邏輯', () => {
    it('enabled cycle 先 scan 再寫 AI diary', async () => {
      const db = freshDb();
      updateSettings(db, { default_diary_agent: null, daily_scheduler: { enabled: true, run_time_local: '18:00' }, scan_interval_minutes: 5 }, runtime());

      const result = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T12:00:00.000Z'),
        scanProvider: mockScanProvider(),
        projectSummaryAgent: async (snapshot) => ({
          markdown: `## ${snapshot.project.name} background draft`,
          agent_id: 'fallback',
          fallback_report: null,
        }),
        globalSummaryAgent: async () => ({
          markdown: `## 每日開發重點（${TODAY}）\n- 達成：背景掃描已完成。\n- 阻礙：目前沒有從資料中看到明確阻塞。\n- 下一步：檢查日記。`,
          agent_id: 'fallback',
          fallback_report: null,
        }),
      });

      expect(result.status).toBe('success');
      expect(result.interval_minutes).toBe(5);
      expect(result.scan?.status).toBe('success');
      expect(result.scan?.inserted_sessions).toBeGreaterThan(0);
      expect(result.diary?.status).toBe('success');
      expect(result.diary?.daily_log_updated).toBe(true);
      expect(result.diary?.project_drafts_updated).toBeGreaterThan(0);
      const log = db.prepare(`SELECT global_summary_ai FROM daily_logs WHERE date = ?`).get(TODAY) as { global_summary_ai: string };
      expect(log.global_summary_ai).toContain('背景掃描已完成');
      expect(getSettings(db, runtime()).daily_scheduler.last_status).toBe('success');
      expect(getSettings(db, runtime()).background_scan).toMatchObject({
        last_status: 'success',
        last_scanned_projects: result.scan?.scanned_projects.length,
        last_inserted_sessions: result.scan?.inserted_sessions,
        next_interval_ms: 5 * 60_000,
      });
    });

    it('enabled cycle 未到 daily run time 時只 scan 不寫 AI diary', async () => {
      const db = freshDb();
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '18:00' }, scan_interval_minutes: 5 }, runtime());
      let draftCalls = 0;

      const result = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T08:00:00.000Z'),
        scanProvider: mockScanProvider(),
        projectSummaryAgent: async () => {
          draftCalls += 1;
          return { markdown: '## should not run', agent_id: 'fallback', fallback_report: null };
        },
      });

      expect(result.status).toBe('success');
      expect(result.scan?.status).toBe('success');
      expect(result.scan?.inserted_sessions).toBeGreaterThan(0);
      expect(result.diary?.status).toBe('skipped');
      expect(result.diary?.message).toContain('not arrived');
      expect(draftCalls).toBe(0);
      expect(getSettings(db, runtime()).daily_scheduler.last_run_date).toBeNull();
    });

    it('同一天已成功寫 diary 後，後續 interval 只 scan 不重跑 AI diary', async () => {
      const db = freshDb();
      updateSettings(db, { default_diary_agent: null, daily_scheduler: { enabled: true, run_time_local: '18:00' }, scan_interval_minutes: 5 }, runtime());
      let draftCalls = 0;

      const first = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T12:00:00.000Z'),
        scanProvider: mockScanProvider(),
        projectSummaryAgent: async () => {
          draftCalls += 1;
          return { markdown: '## first background draft', agent_id: 'fallback', fallback_report: null };
        },
      });
      expect(first.diary?.status).toBe('success');
      expect(draftCalls).toBeGreaterThan(0);
      const callsAfterFirst = draftCalls;

      const second = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T13:00:00.000Z'),
        scanProvider: mockScanProvider(),
        projectSummaryAgent: async () => {
          draftCalls += 1;
          return { markdown: '## should not run twice', agent_id: 'fallback', fallback_report: null };
        },
      });

      expect(second.status).toBe('success');
      expect(second.scan?.status).toBe('success');
      expect(second.diary?.status).toBe('skipped');
      expect(second.diary?.message).toContain('already ran');
      expect(draftCalls).toBe(callsAfterFirst);
    });
  });

  describe('狀態回歸', () => {
    it('daily scheduler disabled 時仍執行 interval scan 但不寫 diary', async () => {
      const db = freshDb();
      const beforeSessions = (db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;

      const result = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T12:00:00.000Z'),
        scanProvider: mockScanProvider(),
      });

      expect(result.status).toBe('success');
      expect(result.message).toContain('daily diary did not run');
      expect(result.scan?.status).toBe('success');
      expect(result.diary?.status).toBe('skipped');
      expect(result.diary?.message).toContain('disabled');
      const afterSessions = (db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;
      expect(afterSessions).toBeGreaterThan(beforeSessions);
    });

    it('daily scheduler disabled 時,每輪 cycle 不再獨立跑 kanban AI(不呼叫 agy generator)', async () => {
      // 回歸測試:過去每個 background cycle 都獨立跑 kanban AI 自動加卡,一天上千次
      // agy 呼叫把額度燒光。現在 kanban AI 只在 daily scheduler 的一天一次排程內執行,
      // 受 daily_scheduler.enabled 控管。scheduler 關閉時本輪不得呼叫任何 AI generator。
      const db = freshDb();
      updateSettings(db, { kanban_ai_auto_add: { enabled: true }, scan_interval_minutes: 5 }, runtime());
      let calls = 0;

      const result = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T12:00:00.000Z'),
        scanProvider: mockScanProvider(),
        kanbanAiGenerator: async () => {
          calls += 1;
          return { agent_id: 'test-ai', text: JSON.stringify({ cards: [] }) };
        },
      });

      expect(result.status).toBe('success');
      // 本機掃描仍執行,但沒有任何 agy/AI 呼叫
      expect(result.scan?.status).toBe('success');
      expect(calls).toBe(0);
      expect(result.scan?.ai_sync?.inserted ?? 0).toBe(0);
      expect(result.diary?.status).toBe('skipped');
      expect(result.diary?.message).toContain('disabled');
    });

    it('daily scheduler enabled + 到排程時間時,kanban AI 在一天一次的排程內執行一次', async () => {
      const db = freshDb();
      updateSettings(
        db,
        { default_diary_agent: null, daily_scheduler: { enabled: true, run_time_local: '00:00' }, kanban_ai_auto_add: { enabled: true }, scan_interval_minutes: 5 },
        runtime(),
      );
      let calls = 0;
      const kanbanAiGenerator = async () => {
        calls += 1;
        return {
          agent_id: 'test-ai',
          text: JSON.stringify({
            cards: [
              {
                title: '每日排程 AI 卡',
                description: '下一步是確認 kanban AI 只在 daily scheduler 內跑一次。',
                suggested_status: 'todo',
                confidence: 0.9,
                evidence: 'Next step: verify scheduler-gated kanban AI.',
                reason: 'kanban AI 應由 daily scheduler 一天一次觸發。',
                dedupe_key: 'daily-scheduler-ai-card',
              },
            ],
          }),
        };
      };

      const first = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T12:00:00.000Z'),
        scanProvider: mockScanProvider(),
        kanbanAiGenerator,
        globalSummaryAgent: async () => ({ markdown: `## 每日開發重點（${TODAY}）\n- 達成：ok\n- 阻礙:無\n- 下一步:review`, agent_id: 'fallback', fallback_report: null }),
      });
      expect(first.diary?.status).toBe('success');
      expect(calls).toBeGreaterThan(0);
      const callsAfterFirst = calls;

      // 同一天後續 cycle:排程一天一次的防護生效,不再重跑 kanban AI
      const second = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T13:00:00.000Z'),
        scanProvider: mockScanProvider(),
        kanbanAiGenerator,
      });
      expect(second.diary?.status).toBe('skipped');
      expect(second.diary?.message).toContain('already ran');
      expect(calls).toBe(callsAfterFirst);
    });

    it('agy session 失效時整輪跳過 AI(kanban + diary),不逐專案觸發登入視窗', async () => {
      const db = freshDb();
      updateSettings(
        db,
        {
          default_diary_agent: 'antigravity-cli',
          daily_scheduler: { enabled: true, run_time_local: '18:00' },
          kanban_ai_auto_add: { enabled: true },
          scan_interval_minutes: 5,
        },
        runtime(),
      );

      // 先把 gate 打進 cooldown(用假 probe,完全不碰 agy);cooldown 內 runBackgroundCycle
      // 不會再送真正的 agy probe,也就不會彈登入視窗。
      // cooldown 需涵蓋本輪 cycle 時間(11:00 → 12:00 間隔 1 小時),否則 gate 會在
      // cycle 內送出真正的 agy probe。設 6 小時,確保 12:00 仍在 cooldown 內。
      const gate = new AntigravitySessionGate({ cooldownMs: 6 * 60 * 60_000, healthyTtlMs: 60_000 });
      await gate.ensureHealthy(new Date('2026-06-30T11:00:00.000Z').getTime(), async () => ({
        healthy: false,
        detail: 'primed dead session',
      }));

      // 不注入任何 generator:讓 configured(agy)路徑成為唯一來源。session 失效時
      // 這條路徑會被整批 null 掉改用 deterministic fallback,完全不會 spawn agy。
      const result = await runBackgroundCycle(db, runtime, {
        now: new Date('2026-06-30T12:00:00.000Z'),
        scanProvider: mockScanProvider(),
        antigravityGate: gate,
      });

      expect(result.antigravity_skipped).toBe(true);
      expect(result.message).toContain('已跳過 AI');
      expect(result.status).toBe('success');
      expect(result.scan?.status).toBe('success');
      // kanban AI 被跳過:沒有 AI 卡插入
      expect(result.scan?.ai_sync?.inserted ?? 0).toBe(0);
      // diary 仍完成,但改用 deterministic fallback(未 spawn 任何 agy)
      expect(result.diary?.status).toBe('success');
      const log = db.prepare(`SELECT global_summary_ai FROM daily_logs WHERE date = ?`).get(TODAY) as { global_summary_ai: string };
      expect(log.global_summary_ai).toContain('每日開發重點');
    });

    it('interval 由 settings 決定且有安全下限', () => {
      const db = freshDb();
      expect(backgroundIntervalMs(getSettings(db, runtime()))).toBe(60 * 60_000);

      const updated = updateSettings(db, { scan_interval_minutes: 5 }, runtime());
      expect(backgroundIntervalMs(updated)).toBe(5 * 60_000);
    });

    it('LaunchAgent startup delay is bounded so app Core can become responsive first', () => {
      expect(backgroundStartupDelayMs('45000')).toBe(45_000);
      expect(backgroundStartupDelayMs('-1')).toBe(0);
      expect(backgroundStartupDelayMs('999999')).toBe(120_000);
      expect(backgroundStartupDelayMs('invalid')).toBe(0);
    });

    it('background wait always clears its polling interval after timeout or early stop', async () => {
      vi.useFakeTimers();
      try {
        const normal = sleepUntilNextBackgroundCycle(1_000, () => false);
        await vi.advanceTimersByTimeAsync(1_000);
        await normal;
        expect(vi.getTimerCount()).toBe(0);

        let stopping = false;
        const stopped = sleepUntilNextBackgroundCycle(5_000, () => stopping);
        stopping = true;
        await vi.advanceTimersByTimeAsync(250);
        await stopped;
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
