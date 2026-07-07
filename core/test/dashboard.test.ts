import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { getDashboardSnapshot } from '../src/services/dashboard.js';

const TODAY = '2026-06-28';

function freshDb(): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 90, seed: 1337 });
  return db;
}

/** Strip the wall-clock field so two snapshots of the same data compare equal. */
function stable(s: ReturnType<typeof getDashboardSnapshot>) {
  const { captured_at, ...rest } = s;
  return rest;
}

describe('dashboard snapshot', () => {
  let db: DB;
  beforeEach(() => {
    db = freshDb();
  });

  it('is deterministic for the same persisted data and range', () => {
    const a = getDashboardSnapshot(db, { range: '7d', today: TODAY });
    const b = getDashboardSnapshot(freshDb(), { range: '7d', today: TODAY });
    expect(stable(a)).toEqual(stable(b));
  });

  it('agent mix percentages sum to ~100 and include canonical + other buckets', () => {
    const s = getDashboardSnapshot(db, { range: 'all', today: TODAY });
    const ids = s.agent_mix.map((m) => m.agent_id);
    expect(ids).toContain('claude-code');
    expect(ids).toContain('other'); // seeded gemini-cli is bucketed as other
    const sum = s.agent_mix.reduce((a, m) => a + m.percentage, 0);
    expect(sum).toBeGreaterThan(99);
    expect(sum).toBeLessThan(101);
  });

  it('metric token_total equals sum of agent mix and of trend total series', () => {
    const s = getDashboardSnapshot(db, { range: '1m', today: TODAY });
    const mixSum = s.agent_mix.reduce((a, m) => a + m.token_total, 0);
    expect(mixSum).toBe(s.metric.token_total);

    const trendTotal = s.trend
      .filter((p) => p.series_key === 'total')
      .reduce((a, p) => a + p.token_total, 0);
    expect(trendTotal).toBe(s.metric.token_total);
  });

  it('project concentration is ranked within the selected range', () => {
    const s = getDashboardSnapshot(db, { range: '7d', today: TODAY });
    expect(s.project_concentration.length).toBeGreaterThan(0);

    const ranked = [...s.project_concentration].sort((a, b) => b.token_total - a.token_total);
    expect(s.project_concentration).toEqual(ranked);

    for (const project of s.project_concentration) {
      expect(project.token_total).toBeGreaterThan(0);
      expect(project.session_count).toBeGreaterThanOrEqual(0);
      expect(project.percentage).toBe(
        Math.round((project.token_total / s.metric.token_total) * 1000) / 10,
      );
    }
  });

  it('trend exposes total plus all canonical buckets and other', () => {
    const s = getDashboardSnapshot(db, { range: '7d', today: TODAY });
    const keys = new Set(s.trend.map((p) => p.series_key));
    for (const k of ['total', 'claude-code', 'codex-cli', 'antigravity-cli', 'other']) {
      expect(keys.has(k as never)).toBe(true);
    }
  });

  it('heatmap is data-backed and deterministic; levels are 0..4', () => {
    const s1 = getDashboardSnapshot(db, { range: '1m', today: TODAY });
    const s2 = getDashboardSnapshot(freshDb(), { range: '1m', today: TODAY });
    expect(s1.heatmap).toEqual(s2.heatmap);
    for (const c of s1.heatmap) {
      expect(c.intensity_level).toBeGreaterThanOrEqual(0);
      expect(c.intensity_level).toBeLessThanOrEqual(4);
    }
    // At least one active day reaches the top intensity in a month window.
    expect(s1.heatmap.some((c) => c.intensity_level === 4)).toBe(true);
  });

  it('heatmap uses the latest activity window independent of the selected Dashboard range', () => {
    const all = getDashboardSnapshot(db, { range: 'all', today: TODAY });
    const month = getDashboardSnapshot(db, { range: '1m', today: TODAY });
    const emptyFuture = getDashboardSnapshot(db, { range: 'custom', today: TODAY, customStart: '2030-01-01', customEnd: '2030-01-07' });

    expect(month.metric.token_total).not.toBe(all.metric.token_total);
    expect(emptyFuture.metric.token_total).toBe(0);
    expect(month.heatmap).toEqual(all.heatmap);
    expect(emptyFuture.heatmap).toEqual(all.heatmap);
  });

  it('reversed custom dates produce the same snapshot as the corrected order', () => {
    const forward = getDashboardSnapshot(db, { range: 'custom', today: TODAY, customStart: '2026-06-01', customEnd: '2026-06-20' });
    const reversed = getDashboardSnapshot(db, { range: 'custom', today: TODAY, customStart: '2026-06-20', customEnd: '2026-06-01' });
    expect(stable(forward)).toEqual(stable(reversed));
    expect(forward.start_date).toBe('2026-06-01');
    expect(forward.end_date).toBe('2026-06-20');
  });

  it('empty range yields zeroes, no mix, independent heatmap, null primary', () => {
    // A future window with no seeded data.
    const s = getDashboardSnapshot(db, { range: 'custom', today: TODAY, customStart: '2030-01-01', customEnd: '2030-01-07' });
    expect(s.metric.token_total).toBe(0);
    expect(s.metric.session_count).toBe(0);
    expect(s.metric.active_project_count).toBe(0);
    expect(s.metric.primary_agent_name).toBeNull();
    expect(s.agent_mix).toEqual([]);
    expect(s.heatmap.some((c) => c.intensity_level > 0)).toBe(true);
  });

  it('counts blockers, warnings and unconfirmed summaries from daily logs', () => {
    const s = getDashboardSnapshot(db, { range: '24h', today: TODAY });
    expect(s.metric.blocker_count).toBe(1);
    expect(s.metric.warning_count).toBe(1);
    expect(s.metric.unconfirmed_summary_count).toBe(1);
    expect(s.daily_highlights.map((item) => item.label)).toContain('達成');
  });

  it('daily_highlights 來自 latest daily_logs.global_summary_ai，無資料時回空陣列', () => {
    db.prepare(`DELETE FROM daily_logs`).run();

    expect(getDashboardSnapshot(db, { range: '24h', today: TODAY }).daily_highlights).toEqual([]);

    db.prepare(
      `INSERT INTO daily_logs (date, global_summary_ai, per_project_summary, blockers, warnings, summary_status)
       VALUES (?, ?, '{}', '[]', '[]', 'ai_generated')`,
    ).run(
      TODAY,
      [
        `## 今日開發重點 - ${TODAY}`,
        '- 達成：完成 Core manifest lifecycle hardening。',
        '- 阻礙：Tauri packaged lifecycle 還沒收斂。',
        '- 下一步：先補打包 smoke test。',
      ].join('\n'),
    );

    expect(getDashboardSnapshot(db, { range: '24h', today: TODAY }).daily_highlights).toEqual([
      { kind: 'achieve', label: '達成', text: '完成 Core manifest lifecycle hardening。', date: TODAY },
      { kind: 'blocker', label: '阻礙', text: 'Tauri packaged lifecycle 還沒收斂。', date: TODAY },
      { kind: 'next', label: '下一步', text: '先補打包 smoke test。', date: TODAY },
    ]);
  });

  it('daily_highlights parses AI Markdown labels wrapped in bold formatting', () => {
    db.prepare(`DELETE FROM daily_logs`).run();

    db.prepare(
      `INSERT INTO daily_logs (date, global_summary_ai, per_project_summary, blockers, warnings, summary_status)
       VALUES (?, ?, '{}', '[]', '[]', 'ai_generated')`,
    ).run(
      TODAY,
      [
        `# DevDiary Daily Export - ${TODAY}`,
        '* **達成**：完成 packaged app 啟動修復與 CORS hardening。',
        '* **阻礙**：Dashboard parser 還不能讀取粗體標籤。',
        '* **下一步**：補 parser regression test 並確認 UI 顯示。',
      ].join('\n'),
    );

    expect(getDashboardSnapshot(db, { range: '24h', today: TODAY }).daily_highlights).toEqual([
      { kind: 'achieve', label: '達成', text: '完成 packaged app 啟動修復與 CORS hardening。', date: TODAY },
      { kind: 'blocker', label: '阻礙', text: 'Dashboard parser 還不能讀取粗體標籤。', date: TODAY },
      { kind: 'next', label: '下一步', text: '補 parser regression test 並確認 UI 顯示。', date: TODAY },
    ]);
  });
});
