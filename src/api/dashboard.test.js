import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHeatmapCalendar, buildProjectConcentrationFromProjects, buildTrendAxis, fetchDashboardWithRetry, toDashboardView } from './dashboard.js';

function cell(date) {
  return {
    date,
    session_count: 1,
    token_total: 1,
    intensity_level: 1,
    dominant_agent_id: 'codex-cli',
    task_count: 1,
  };
}

test('buildHeatmapCalendar lays out dates as Monday-start week columns', () => {
  const calendar = buildHeatmapCalendar([cell('2026-04-15'), cell('2026-05-01'), cell('2026-06-29')]);

  const apr15 = calendar.cells.find((item) => item.date === '2026-04-15');
  const may1 = calendar.cells.find((item) => item.date === '2026-05-01');
  const jun29 = calendar.cells.find((item) => item.date === '2026-06-29');

  assert.deepEqual(
    { column: apr15.gridColumnStart, row: apr15.gridRowStart },
    { column: 15, row: 3 },
  );
  assert.deepEqual(
    { column: may1.gridColumnStart, row: may1.gridRowStart },
    { column: 17, row: 5 },
  );
  assert.deepEqual(
    { column: jun29.gridColumnStart, row: jun29.gridRowStart },
    { column: 26, row: 1 },
  );
  assert.equal(calendar.totalWeeks, 26);
});

test('buildHeatmapCalendar emits month labels at the first visible month and month boundaries', () => {
  const calendar = buildHeatmapCalendar([cell('2026-04-15'), cell('2026-05-01'), cell('2026-06-01')]);

  assert.deepEqual(
    calendar.monthLabels.filter((month) => ['Apr', 'May', 'Jun'].includes(month.label)),
    [
      { label: 'Apr', column: 17 },
      { label: 'May', column: 21 },
      { label: 'Jun', column: 26 },
    ],
  );
});

test('buildHeatmapCalendar caps the visible window at the latest 26 weeks', () => {
  const daily = [];
  const start = new Date(Date.UTC(2025, 11, 1));
  for (let i = 0; i < 220; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    daily.push(cell(d.toISOString().slice(0, 10)));
  }

  const calendar = buildHeatmapCalendar(daily);
  assert.equal(calendar.totalWeeks, 26);
  assert.equal(calendar.cells.some((item) => item.date === '2025-12-01'), false);
  assert.equal(calendar.cells.some((item) => item.date === '2026-07-08'), true);
});

test('toDashboardView carries agent token counts for legends', () => {
  const view = toDashboardView({
    range_key: 'all',
    metric: {
      token_total: 3000,
      session_count: 3,
      primary_agent_name: 'Codex CLI',
      primary_agent_token_percentage: 66.7,
      active_project_count: 2,
      comparison_delta_percentage: null,
    },
    agent_mix: [
      { agent_name: 'Codex CLI', color_key: 'codex', percentage: 66.7, token_total: 2000 },
      { agent_name: 'Claude Code', color_key: 'claude', percentage: 33.3, token_total: 1000 },
    ],
    project_concentration: [
      { project_id: 2, project_name: 'DevDiary', token_total: 2400, session_count: 8, percentage: 80 },
      { project_id: 4, project_name: 'Tooling', token_total: 600, session_count: 2, percentage: 20 },
    ],
    heatmap: [],
    trend: [],
    daily_highlights: [
      { kind: 'achieve', label: '達成', text: '完成 Core 接線。', date: '2026-06-30' },
      { kind: 'next', label: '下一步', text: '跑 package build。', date: '2026-06-30' },
    ],
  });

  assert.deepEqual(
    view.agentMix.data.map((agent) => ({ name: agent.name, pct: agent.pct, tokens: agent.tokens, tokenTotal: agent.tokenTotal })),
    [
      { name: 'Codex CLI', pct: 66.7, tokens: '2k', tokenTotal: 2000 },
      { name: 'Claude Code', pct: 33.3, tokens: '1k', tokenTotal: 1000 },
    ],
  );
  assert.deepEqual(view.projectConcentration, [
    { id: 2, name: 'DevDiary', tokenTotal: 2400, tokens: '2k', sessions: 8, pct: 80 },
    { id: 4, name: 'Tooling', tokenTotal: 600, tokens: '600', sessions: 2, pct: 20 },
  ]);
  assert.deepEqual(view.dailyHighlights, [
    { kind: 'achieve', label: '達成', text: '完成 Core 接線。', date: '2026-06-30' },
    { kind: 'next', label: '下一步', text: '跑 package build。', date: '2026-06-30' },
  ]);
});

test('toDashboardView returns empty daily highlights instead of mock summaries', () => {
  const view = toDashboardView({
    range_key: '24h',
    metric: {
      token_total: 0,
      session_count: 0,
      primary_agent_name: null,
      primary_agent_token_percentage: 0,
      active_project_count: 0,
      comparison_delta_percentage: null,
    },
    agent_mix: [],
    project_concentration: [],
    heatmap: [],
    trend: [],
  });

  assert.deepEqual(view.dailyHighlights, []);
});

test('fetchDashboardWithRetry retries transient Core startup failures', async () => {
  const calls = [];
  const result = await fetchDashboardWithRetry('24h', '', '', {
    attempts: 3,
    delayMs: 0,
    wait: async () => {},
    fetcher: async (range) => {
      calls.push(range);
      if (calls.length < 3) throw new Error('Load failed');
      return { range_key: range, metric: {} };
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(result.range_key, '24h');
});

test('fetchDashboardWithRetry does not retry non-transient Core errors', async () => {
  let calls = 0;
  await assert.rejects(
    fetchDashboardWithRetry('24h', '', '', {
      attempts: 3,
      delayMs: 0,
      wait: async () => {},
      fetcher: async () => {
        calls += 1;
        throw new Error('range must be one of all, 24h, 7d');
      },
    }),
    /range must be one/,
  );
  assert.equal(calls, 1);
});

test('buildProjectConcentrationFromProjects ranks all-time project fallback data', () => {
  const ranking = buildProjectConcentrationFromProjects([
    { id: 1, name: 'Tiny', tokenTotal: 100, logsCount: 1 },
    { id: 2, name: 'Large', tokenTotal: 700, logsCount: 7 },
    { id: 3, name: 'Zero', tokenTotal: 0, logsCount: 9 },
    { id: 4, name: 'Medium', token_total: 200, logs_count: 2 },
  ]);

  assert.deepEqual(ranking, [
    { id: 2, name: 'Large', tokenTotal: 700, sessions: 7, tokens: '700', pct: 70 },
    { id: 4, name: 'Medium', tokenTotal: 200, sessions: 2, tokens: '200', pct: 20 },
    { id: 1, name: 'Tiny', tokenTotal: 100, sessions: 1, tokens: '100', pct: 10 },
  ]);
});

test('buildTrendAxis returns readable token and date labels', () => {
  const axis = buildTrendAxis([
    { series_key: 'total', bucket_start: '2026-04-15', token_total: 0 },
    { series_key: 'total', bucket_start: '2026-05-01', token_total: 1_500_000 },
    { series_key: 'total', bucket_start: '2026-06-29', token_total: 3_000_000 },
    { series_key: 'codex-cli', bucket_start: '2026-06-29', token_total: 2_000_000 },
  ]);

  assert.deepEqual(axis.yLabels.map((label) => label.label), ['3.00M', '1.50M', '0']);
  assert.deepEqual(axis.xLabels.map((label) => label.label), ['04-15', '05-01', '06-29']);
});
