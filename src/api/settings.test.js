import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coreApiUrl,
} from './coreFetch.js';
import {
  DEFAULT_AGENT_MODEL_OPTIONS,
  REASONING_OPTIONS,
  fetchAgentDetection,
  fetchDailySchedulerPreflight,
  fetchDailySchedulerStatus,
  fetchRuntimeHealth,
  fetchSettingsWithRetry,
  fetchDailyMarkdownExport,
  fetchRedactedBackupExport,
  createCustomAgent,
  deleteCustomAgent,
  formToSettingsPatch,
  classifyRuntimeHealth,
  listToRows,
  multilineToList,
  patchCustomAgent,
  patchSettings,
  probeCustomAgent,
  runDailySchedulerNow,
  schedulerPreflightSummary,
  selectedFolderToProjectDocFolder,
  settingsAgentsToCardsWithDetection,
  settingsToForm,
  rowsToList,
  withCoreStartupRetry,
} from './settings.js';

test('coreApiUrl keeps browser dev requests relative and points Tauri to loopback Core', () => {
  assert.equal(coreApiUrl('/api/health', { location: { protocol: 'http:', hostname: 'localhost' } }), '/api/health');
  assert.equal(
    coreApiUrl('/api/health', { __TAURI_INTERNALS__: {}, location: { protocol: 'tauri:', hostname: 'tauri.localhost' } }),
    'http://127.0.0.1:4317/api/health',
  );
});

test('multilineToList trims empty lines and removes duplicates without executing values', () => {
  assert.deepEqual(
    multilineToList('\n /tmp/project-a \n/tmp/project-a\n echo should-not-run \n'),
    ['/tmp/project-a', 'echo should-not-run'],
  );
});

test('row list helpers keep one blank row and dedupe submitted values', () => {
  assert.deepEqual(listToRows([]), ['']);
  assert.deepEqual(rowsToList([' /tmp/a ', '', '/tmp/a', '/tmp/b']), ['/tmp/a', '/tmp/b']);
});

test('Project Docs folder picker converts selected folders under Project Roots to relative settings values', () => {
  assert.deepEqual(
    selectedFolderToProjectDocFolder(
      '/Users/me/projects/app/docs/specs',
      ['/Users/me/projects'],
      ['/Users/me/projects/app'],
    ),
    { value: 'docs/specs', error: '' },
  );
  assert.deepEqual(
    selectedFolderToProjectDocFolder('/Users/me/projects/app/docs/specs', ['/Users/me/projects', '/Users/me']),
    { value: 'app/docs/specs', error: '' },
  );
  assert.deepEqual(
    selectedFolderToProjectDocFolder('/Users/me/projects/app/docs/', [' /Users/me/projects/app ']),
    { value: 'docs', error: '' },
  );
  assert.equal(
    selectedFolderToProjectDocFolder('/Users/me/other/docs', ['/Users/me/projects']).error,
    '選取的資料夾不在目前 Project Roots 之內；Project Docs 資料夾需使用 project root 內的相對路徑。',
  );
  assert.equal(
    selectedFolderToProjectDocFolder('/Users/me/projects', ['/Users/me/projects']).error,
    '請選取 Project Roots 底下的子資料夾，或手動輸入要全掃描的相對資料夾。',
  );
});

test('settingsToForm and formToSettingsPatch preserve the Core settings contract', () => {
  const form = settingsToForm({
    project_roots: ['/tmp/a', '/tmp/b'],
    excluded_paths: ['/tmp/a/node_modules'],
    project_doc_filenames: ['README.md', 'docs/specs/MASTER.md'],
    project_doc_folders: ['docs', 'notes/research'],
    scan_interval_minutes: 120,
    default_diary_agent: 'codex-cli',
    appearance: 'light',
    privacy: { redact_sensitive_values: false, include_comments_in_exports: true },
    data_storage: { active_db_path: '/tmp/current.sqlite', desired_db_path: '/tmp/next.sqlite', restart_required: true },
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
      { id: 'claude-code', display_name: 'Claude Code', enabled: false, model: 'Opus 4.8', reasoning: 'extra_high' },
      { id: 'codex-cli', display_name: 'Codex CLI', enabled: true, model: 'GPT-5.5', reasoning: 'high' },
    ],
    custom_agents: [
      { id: 'custom-local-test', display_name: 'Local Test Agent', enabled: true, executable_path: '/tmp/local-agent' },
    ],
    ai_prompts: {
      project_diary: 'project prompt',
      daily_diary_entry: 'daily prompt',
      daily_highlight: 'highlight prompt',
      kanban_cards: 'kanban prompt',
    },
  });

  assert.deepEqual(form.projectRoots, ['/tmp/a', '/tmp/b']);
  assert.equal(form.projectRootsText, '/tmp/a\n/tmp/b');
  assert.equal(form.projectDocFilenamesText, 'README.md\ndocs/specs/MASTER.md');
  assert.equal(form.projectDocFoldersText, 'docs\nnotes/research');
  assert.equal(form.appearance, 'light');
  assert.equal(form.redactSensitiveValues, false);
  assert.equal(form.dailySchedulerEnabled, true);
  assert.equal(form.dailySchedulerRunTime, '21:30');
  assert.equal(form.agents[0].model, 'Opus 4.8');
  assert.equal(form.agents[0].reasoning, 'extra_high');
  assert.equal(form.aiPrompts.daily_highlight, 'highlight prompt');
  assert.equal(form.aiPrompts.kanban_cards, 'kanban prompt');
  assert.equal(form.customAgents.length, 1);

  form.projectRoots = ['/tmp/a', '', '/tmp/a', '/tmp/c'];
  form.scanIntervalMinutes = '30';
  form.agents = form.agents.map((agent) => (agent.id === 'codex-cli' ? { ...agent, enabled: false, model: 'GPT-5.4-Mini', reasoning: 'speed' } : agent));

  assert.deepEqual(formToSettingsPatch(form), {
    project_roots: ['/tmp/a', '/tmp/c'],
    excluded_paths: ['/tmp/a/node_modules'],
    project_doc_filenames: ['README.md', 'docs/specs/MASTER.md'],
    project_doc_folders: ['docs', 'notes/research'],
    scan_interval_minutes: 30,
    default_diary_agent: 'codex-cli',
    privacy: { redact_sensitive_values: false, include_comments_in_exports: true },
    appearance: 'light',
    data_storage: { desired_db_path: '/tmp/next.sqlite' },
    scan_provider: { provider: 'cli-logs', fallback: 'none' },
    daily_scheduler: { enabled: true, run_time_local: '21:30' },
    agents: [
      { id: 'claude-code', enabled: false, model: 'Opus 4.8', reasoning: 'extra_high' },
      { id: 'codex-cli', enabled: false, model: 'GPT-5.4-Mini', reasoning: 'speed' },
    ],
    ai_prompts: {
      project_diary: 'project prompt',
      daily_diary_entry: 'daily prompt',
      daily_highlight: 'highlight prompt',
    },
  });
});

test('canonical agent model and reasoning options match current picker labels', () => {
  assert.deepEqual(DEFAULT_AGENT_MODEL_OPTIONS['claude-code'], [
    'Default (CLI config)',
    'Opus 4.8',
    'Sonnet 5',
    'Haiku 4.5',
    'Opus 4.7',
    'Opus 4.6',
    'Sonnet 4.6',
  ]);
  assert.deepEqual(DEFAULT_AGENT_MODEL_OPTIONS['codex-cli'], [
    'Default (CLI config)',
    'GPT-5.5',
    'GPT-5.4',
    'GPT-5.4-Mini',
  ]);
  assert.deepEqual(REASONING_OPTIONS.map((item) => item.value), ['default', 'light', 'medium', 'high', 'extra_high', 'speed']);
});

test('settings form sanitizes old mock scan policy to real logs only', () => {
  const form = settingsToForm({
    scan_provider: { provider: 'mock', fallback: 'mock' },
    privacy: {},
    data_storage: { active_db_path: '/tmp/current.sqlite', desired_db_path: '/tmp/current.sqlite' },
    agents: [],
  });

  assert.equal(form.scanProviderMode, 'cli-logs');
  assert.equal(form.scanFallbackMode, 'none');
  assert.deepEqual(formToSettingsPatch(form).scan_provider, { provider: 'cli-logs', fallback: 'none' });
});

test('settingsAgentsToCards maps enabled flags and detection into visible agent card state', () => {
  assert.deepEqual(
    settingsAgentsToCardsWithDetection(
      [{ id: 'claude-code', display_name: 'Claude Code', enabled: false }],
      [{ id: 'claude-code', available: true, binary_path: '/tmp/claude', version: 'claude 1.0', checked_at: '2026-06-30T00:00:00.000Z' }],
    ),
    [
      {
        id: 'claude-code',
        name: 'Claude Code',
        version: 'claude 1.0',
        status: 'connected',
        active: false,
        path: '/tmp/claude',
        detectionError: null,
        checkedAt: '2026-06-30T00:00:00.000Z',
        kind: 'canonical',
        removable: false,
        model: 'Default (CLI config)',
        reasoning: 'default',
      },
    ],
  );
});

test('settingsAgentsToCards includes removable custom agents from settings snapshot', () => {
  const cards = settingsAgentsToCardsWithDetection(
    [{ id: 'claude-code', display_name: 'Claude Code', enabled: true }],
    [],
    [
      {
        id: 'custom-local-test',
        display_name: 'Local Test Agent',
        enabled: true,
        status: 'connected',
        version: 'local-agent 1.0',
        executable_path: '/tmp/local-agent',
        checked_at: '2026-07-01T00:00:00.000Z',
      },
    ],
  );

  assert.equal(cards.length, 2);
  assert.equal(cards[1].kind, 'custom');
  assert.equal(cards[1].removable, true);
  assert.equal(cards[1].name, 'Local Test Agent');
  assert.equal(cards[1].path, '/tmp/local-agent');
});

test('agent detection and daily scheduler API helpers call Core endpoints', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      headers: { get: () => null },
      async json() {
        return { ok: true };
      },
      async text() {
        return 'exported';
      },
    };
  };

  await fetchRuntimeHealth();
  await fetchAgentDetection();
  await fetchDailySchedulerStatus();
  await fetchDailySchedulerPreflight();
  await runDailySchedulerNow();
  await fetchDailyMarkdownExport({ date: '2026-06-30', includeComments: true });
  await fetchRedactedBackupExport({ includeComments: false });
  await probeCustomAgent({ display_name: 'Local Test Agent', executable_path: '/tmp/local-agent' });
  await createCustomAgent({ display_name: 'Local Test Agent', executable_path: '/tmp/local-agent' });
  await patchCustomAgent('custom-local-test', { enabled: false });
  await deleteCustomAgent('custom-local-test');

  assert.deepEqual(calls.map((call) => [call.url, call.options.method || 'GET']), [
    ['/api/health', 'GET'],
    ['/api/agents/detect', 'GET'],
    ['/api/scheduler/daily', 'GET'],
    ['/api/scheduler/daily/preflight', 'GET'],
    ['/api/scheduler/daily/run', 'POST'],
    ['/api/exports/daily?date=2026-06-30&include_comments=true', 'GET'],
    ['/api/exports/backup?include_comments=false', 'GET'],
    ['/api/agents/custom/probe', 'POST'],
    ['/api/agents/custom', 'POST'],
    ['/api/agents/custom/custom-local-test', 'PATCH'],
    ['/api/agents/custom/custom-local-test', 'DELETE'],
  ]);

  globalThis.fetch = originalFetch;
});

test('classifyRuntimeHealth identifies connected, stale, and unreachable Core runtimes', () => {
  assert.deepEqual(
    classifyRuntimeHealth({
      ok: true,
      api_contract_version: 5,
      runtime: { host: '127.0.0.1', port: 4317, started_at: '2026-06-30T00:00:00.000Z', pid: 123 },
      capabilities: ['kanban.ai-sync', 'scheduler.daily.preflight', 'scheduler.daily.run', 'agents.detect', 'agents.custom.probe', 'agents.custom.write', 'exports.daily', 'exports.backup'],
      checked_at: '2026-06-30T00:00:01.000Z',
    }),
    {
      status: 'connected',
      message: 'Core API 已連線',
      port: 4317,
    contractVersion: 5,
      checkedAt: '2026-06-30T00:00:01.000Z',
      missingCapabilities: [],
      startedAt: '2026-06-30T00:00:00.000Z',
    },
  );

  const stale = classifyRuntimeHealth({ ok: true, service: 'devdiary-core', captured_at: '2026-06-30T00:00:01.000Z' });
  assert.equal(stale.status, 'stale');
  assert.match(stale.message, /Core runtime 可能是舊版/);
  assert.equal(stale.port, null);

  const missingRoute = classifyRuntimeHealth({
    ok: true,
    api_contract_version: 5,
    runtime: { port: 4317 },
    capabilities: ['agents.detect'],
  });
  assert.equal(missingRoute.status, 'stale');
  assert.deepEqual(missingRoute.missingCapabilities, ['kanban.ai-sync', 'scheduler.daily.preflight', 'scheduler.daily.run', 'agents.custom.probe', 'agents.custom.write', 'exports.daily', 'exports.backup']);

  const unreachable = classifyRuntimeHealth(null, new Error('fetch failed'));
  assert.equal(unreachable.status, 'unreachable');
  assert.match(unreachable.message, /連不到 Core API/);
});

test('schedulerPreflightSummary summarizes failed, warning, and ok states', () => {
  assert.equal(schedulerPreflightSummary({ checks: [{ status: 'ok' }, { status: 'ok' }] }), 'preflight ok');
  assert.equal(schedulerPreflightSummary({ checks: [{ status: 'ok' }, { status: 'warning' }] }), 'preflight warning：1 warning');
  assert.equal(
    schedulerPreflightSummary({ checks: [{ status: 'failed' }, { status: 'warning' }] }),
    'preflight failed：1 failed / 1 warning',
  );
});

test('route 404 errors surface stale Core runtime guidance', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    async json() {
      throw new Error('html response');
    },
  });

  await assert.rejects(
    runDailySchedulerNow(),
    /Core runtime 可能是舊版/,
  );

  globalThis.fetch = originalFetch;
});

test('Core startup retry recovers transient Load failed responses', async () => {
  let calls = 0;
  const result = await fetchSettingsWithRetry({
    attempts: 3,
    delayMs: 0,
    wait: async () => {},
    fetcher: async () => {
      calls += 1;
      if (calls < 3) throw new Error('Load failed');
      return { project_roots: ['/tmp/devdiary'] };
    },
  });

  assert.equal(calls, 3);
  assert.deepEqual(result.project_roots, ['/tmp/devdiary']);
});

test('Core startup retry does not mask validation errors', async () => {
  let calls = 0;
  await assert.rejects(
    withCoreStartupRetry(async () => {
      calls += 1;
      throw new Error('appearance must be light, dark, or system');
    }, {
      attempts: 3,
      delayMs: 0,
      wait: async () => {},
    }),
    /appearance must be light/,
  );
  assert.equal(calls, 1);
});

test('patchSettings sends a structured PATCH request and surfaces Core validation messages', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: false,
      status: 400,
      async json() {
        return { message: 'appearance must be light, dark, or system' };
      },
    };
  };

  await assert.rejects(
    patchSettings({ appearance: 'sepia' }),
    /appearance must be light, dark, or system/,
  );
  assert.equal(calls[0].url, '/api/settings');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');

  globalThis.fetch = originalFetch;
});
