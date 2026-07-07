import assert from 'node:assert/strict';
import test from 'node:test';
import { runProjectKanbanAiSync, saveProjectDiaryEntry, regenerateProjectDiaryEntry, setKanbanCardStatus, singleDayRangeOptions, toKanbanCardView, toProjectListItem } from './projects.js';

test('toProjectListItem preserves raw token totals for dashboard rankings', () => {
  assert.deepEqual(
    toProjectListItem({
      id: 7,
      name: 'Project A',
      tracking_status: 'active',
      root_path: '/tmp/project-a',
      detected_agents: ['codex-cli'],
      logs_count: 12,
      token_total: 1234567,
    }),
    {
      id: 7,
      name: 'Project A',
      status: 'active',
      path: '/tmp/project-a',
      agents: ['codex-cli'],
      logsCount: 12,
      tokenTotal: 1234567,
      tokensCount: '1.23M',
    },
  );
});

test('toProjectListItem consumes active/idle tracking_status from Core without recalculating it', () => {
  assert.equal(
    toProjectListItem({
      id: 8,
      name: 'Idle Project',
      tracking_status: 'idle',
      root_path: '/tmp/idle',
      detected_agents: [],
      logs_count: 1,
      token_total: 0,
    }).status,
    'idle',
  );
});

test('daily diary API helpers call Core diary endpoints with encoded dates', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { ok: true };
      },
    };
  };

  await saveProjectDiaryEntry(3, '2026-07-01', '## 今天', { range: 'custom', start: '2026-07-01', end: '2026-07-01' });
  await regenerateProjectDiaryEntry(3, '2026-07-01', { range: 'all' });

  assert.equal(calls[0].url, '/api/projects/3/diary/2026-07-01?range=custom&start=2026-07-01&end=2026-07-01');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.body, JSON.stringify({ markdown: '## 今天' }));
  assert.equal(calls[1].url, '/api/projects/3/diary/2026-07-01/regenerate?range=all');
  assert.equal(calls[1].options.method, 'POST');

  globalThis.fetch = originalFetch;
});

test('kanban AI sync helper calls Core ai-sync endpoint with range query', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { ai_sync: { inserted: 1 }, project_detail: { id: 3 } };
      },
    };
  };

  const result = await runProjectKanbanAiSync(3, { range: 'custom', start: '2026-07-01', end: '2026-07-01' });

  assert.deepEqual(result.ai_sync, { inserted: 1 });
  assert.equal(calls[0].url, '/api/projects/3/kanban/ai-sync?range=custom&start=2026-07-01&end=2026-07-01');
  assert.equal(calls[0].options.method, 'POST');

  globalThis.fetch = originalFetch;
});

test('Kanban helpers translate stale Core route 404 into restart guidance', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    async json() {
      throw new Error('html response');
    },
  });

  await assert.rejects(
    runProjectKanbanAiSync(3, { range: 'all' }),
    /Core runtime 可能是舊版/,
  );
  await assert.rejects(
    setKanbanCardStatus(3, 9, 'done', { range: 'all' }),
    /Core runtime 可能是舊版/,
  );

  globalThis.fetch = originalFetch;
});

test('toKanbanCardView marks AI auto-added cards from source_ref', () => {
  assert.deepEqual(
    toKanbanCardView({
      id: 9,
      title: 'AI card',
      description: 'auto',
      status: 'todo',
      assignee_agent_id: 'codex-cli',
      project_id: 1,
      source_ref: 'ai-suggest://p1/abcdef123456',
      status_locked_by_user: true,
    }),
    {
      id: 9,
      title: 'AI card',
      desc: 'auto',
      status: 'todo',
      assignee: 'Codex CLI',
      projectId: 1,
      sourceRef: 'ai-suggest://p1/abcdef123456',
      manualStatusLock: true,
      aiAutoAdded: true,
    },
  );
});

test('singleDayRangeOptions keeps daily diary refreshes pinned to the selected date', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { ok: true };
      },
    };
  };

  const range = singleDayRangeOptions('2026-06-27');
  assert.deepEqual(range, { range: 'custom', start: '2026-06-27', end: '2026-06-27' });

  await regenerateProjectDiaryEntry(3, '2026-06-27', range);

  assert.equal(calls[0].url, '/api/projects/3/diary/2026-06-27/regenerate?range=custom&start=2026-06-27&end=2026-06-27');
  assert.equal(calls[0].options.method, 'POST');

  globalThis.fetch = originalFetch;
});
