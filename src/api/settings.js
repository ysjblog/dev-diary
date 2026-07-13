import { coreFetch } from './coreFetch.js';

const DEFAULT_AGENT_CARDS = [
  { id: 'claude-code', name: 'Claude Code', version: 'Settings', status: 'connected', active: true, path: '由 Settings backend 管理' },
  { id: 'codex-cli', name: 'Codex CLI', version: 'Settings', status: 'connected', active: true, path: '由 Settings backend 管理' },
  { id: 'antigravity-cli', name: 'Antigravity CLI', version: 'Settings', status: 'connected', active: true, path: '由 Settings backend 管理' },
];

export const REQUIRED_CORE_API_CONTRACT_VERSION = 5;
export const REQUIRED_CORE_CAPABILITIES = [
  'kanban.ai-sync',
  'scheduler.daily.preflight',
  'scheduler.daily.run',
  'agents.detect',
  'agents.custom.probe',
  'agents.custom.write',
  'exports.daily',
  'exports.backup',
];

export const DEFAULT_AGENT_MODEL_OPTIONS = {
  'claude-code': ['Default (CLI config)', 'Opus 4.8', 'Sonnet 5', 'Haiku 4.5', 'Opus 4.7', 'Opus 4.6', 'Sonnet 4.6'],
  'codex-cli': ['Default (CLI config)', 'GPT-5.5', 'GPT-5.4', 'GPT-5.4-Mini'],
  'antigravity-cli': [
    'Default (CLI config)',
    'Gemini 3.1 Pro (High)',
    'Gemini 3.1 Pro (Low)',
    'Gemini 3.5 Flash (High)',
    'Gemini 3.5 Flash (Medium)',
    'Gemini 3.5 Flash (Low)',
    'Opus 4.8',
    'Sonnet 5',
    'GPT-5.5',
  ],
};

export const REASONING_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'extra_high', label: 'Extra High' },
  { value: 'speed', label: 'Speed' },
];

function staleCoreMessage() {
  return 'Core runtime 可能是舊版或沒有載入最新 route；請重啟 DevDiary Core 後再重試。';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientCoreLoadError(err) {
  const message = err?.message || String(err || '');
  return /Load failed|fetch failed|Failed to fetch|Core API is not reachable|連不到 Core API/i.test(message);
}

export async function withCoreStartupRetry(operation, options = {}) {
  const attempts = Number.isInteger(options.attempts) && options.attempts > 0 ? options.attempts : 8;
  const delayMs = Number.isFinite(options.delayMs) && options.delayMs >= 0 ? options.delayMs : 600;
  const sleeper = options.wait || wait;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !isTransientCoreLoadError(err)) break;
      await sleeper(delayMs);
    }
  }
  throw lastError;
}

async function jsonOrThrow(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error(body.message || staleCoreMessage());
    throw new Error(body.message || `Core API error (HTTP ${res.status})`);
  }
  return res.json();
}

export function classifyRuntimeHealth(snapshot, err = null) {
  if (err || !snapshot) {
    return {
      status: 'unreachable',
      message: '連不到 Core API；請確認 DevDiary Core process 已啟動。',
      port: null,
      contractVersion: null,
      checkedAt: new Date().toISOString(),
      missingCapabilities: REQUIRED_CORE_CAPABILITIES,
      startedAt: null,
    };
  }

  const capabilities = Array.isArray(snapshot.capabilities) ? snapshot.capabilities : [];
  const missingCapabilities = REQUIRED_CORE_CAPABILITIES.filter((capability) => !capabilities.includes(capability));
  const contractVersion = Number(snapshot.api_contract_version) || null;
  const checkedAt = snapshot.checked_at || snapshot.captured_at || new Date().toISOString();
  const port = Number.isFinite(Number(snapshot.runtime?.port)) ? Number(snapshot.runtime.port) : null;
  const startedAt = snapshot.runtime?.started_at || null;

  if (!contractVersion || contractVersion < REQUIRED_CORE_API_CONTRACT_VERSION || missingCapabilities.length > 0) {
    return {
      status: 'stale',
      message: staleCoreMessage(),
      port,
      contractVersion,
      checkedAt,
      missingCapabilities,
      startedAt,
    };
  }

  return {
    status: 'connected',
    message: 'Core API 已連線',
    port,
    contractVersion,
    checkedAt,
    missingCapabilities: [],
    startedAt,
  };
}

export async function fetchRuntimeHealth() {
  const checkedAt = new Date().toISOString();
  const res = await coreFetch('/api/health');
  const snapshot = await jsonOrThrow(res);
  return { ...snapshot, checked_at: checkedAt };
}

export async function fetchRuntimeHealthWithRetry(options = {}) {
  const fetcher = options.fetcher || fetchRuntimeHealth;
  return withCoreStartupRetry(fetcher, options);
}

export async function fetchSettings() {
  const res = await coreFetch('/api/settings');
  return jsonOrThrow(res);
}

export async function fetchSettingsWithRetry(options = {}) {
  const fetcher = options.fetcher || fetchSettings;
  return withCoreStartupRetry(fetcher, options);
}

export async function patchSettings(patch) {
  const res = await coreFetch('/api/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow(res);
}

export async function fetchAgentDetection() {
  const res = await coreFetch('/api/agents/detect');
  return jsonOrThrow(res);
}

export async function updateCanonicalExecutableSource(id, payload) {
  const res = await coreFetch(`/api/agents/${encodeURIComponent(id)}/executable-source`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function updateCanonicalActivityLogSource(id, payload) {
  const res = await coreFetch(`/api/agents/${encodeURIComponent(id)}/activity-log-source`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function fetchAgentDetectionWithRetry(options = {}) {
  const fetcher = options.fetcher || fetchAgentDetection;
  return withCoreStartupRetry(fetcher, options);
}

export async function probeCustomAgent(payload) {
  const res = await coreFetch('/api/agents/custom/probe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function createCustomAgent(payload) {
  const res = await coreFetch('/api/agents/custom', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function patchCustomAgent(id, patch) {
  const res = await coreFetch(`/api/agents/custom/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow(res);
}

export async function deleteCustomAgent(id) {
  const res = await coreFetch(`/api/agents/custom/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return jsonOrThrow(res);
}

export async function fetchDailySchedulerStatus() {
  const res = await coreFetch('/api/scheduler/daily');
  return jsonOrThrow(res);
}

export async function fetchDailySchedulerStatusWithRetry(options = {}) {
  const fetcher = options.fetcher || fetchDailySchedulerStatus;
  return withCoreStartupRetry(fetcher, options);
}

export async function fetchDailySchedulerPreflight() {
  const res = await coreFetch('/api/scheduler/daily/preflight');
  return jsonOrThrow(res);
}

export async function runDailySchedulerNow() {
  const res = await coreFetch('/api/scheduler/daily/run', { method: 'POST' });
  return jsonOrThrow(res);
}

export function schedulerPreflightSummary(preflight) {
  const checks = Array.isArray(preflight?.checks) ? preflight.checks : [];
  if (!checks.length) return 'preflight unavailable';
  const failed = checks.filter((check) => check.status === 'failed').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;
  if (failed > 0) return `preflight failed：${failed} failed / ${warnings} warning`;
  if (warnings > 0) return `preflight warning：${warnings} warning`;
  return 'preflight ok';
}

function filenameFromDisposition(value, fallback) {
  const match = String(value || '').match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

async function exportOrThrow(res, fallbackFilename) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error(body.message || staleCoreMessage());
    throw new Error(body.message || `Core API error (HTTP ${res.status})`);
  }
  const content = await res.text();
  return {
    filename: filenameFromDisposition(res.headers?.get?.('content-disposition'), fallbackFilename),
    content,
  };
}

export async function fetchDailyMarkdownExport({ date, includeComments } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (includeComments !== undefined) params.set('include_comments', String(!!includeComments));
  const query = params.toString();
  const res = await coreFetch(`/api/exports/daily${query ? `?${query}` : ''}`);
  return exportOrThrow(res, `devdiary-daily-${date || 'today'}.md`);
}

export async function fetchRedactedBackupExport({ includeComments } = {}) {
  const params = new URLSearchParams();
  if (includeComments !== undefined) params.set('include_comments', String(!!includeComments));
  const query = params.toString();
  const res = await coreFetch(`/api/exports/backup${query ? `?${query}` : ''}`);
  return exportOrThrow(res, 'devdiary-backup-redacted.json');
}

export function listToMultiline(values) {
  return (Array.isArray(values) ? values : []).join('\n');
}

export function multilineToList(value) {
  const seen = new Set();
  const out = [];
  String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    });
  return out;
}

export function listToRows(values) {
  const rows = Array.isArray(values) ? values.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return rows.length ? rows : [''];
}

export function rowsToList(values) {
  if (!Array.isArray(values)) return multilineToList(values);
  const seen = new Set();
  const out = [];
  values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    });
  return out;
}

function normalizeFolderPathForCompare(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

export function selectedFolderToProjectDocFolder(selectedPath, projectRoots, projectPaths = []) {
  const selected = normalizeFolderPathForCompare(selectedPath);
  const projects = rowsToList(projectPaths || [])
    .map(normalizeFolderPathForCompare)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const roots = rowsToList(projectRoots || [])
    .map(normalizeFolderPathForCompare)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!selected) return { value: '', error: '未選取資料夾。' };
  if (!selected.startsWith('/')) return { value: selected.replace(/^\/+|\/+$/g, ''), error: '' };
  const project = projects.find((candidate) => selected === candidate || selected.startsWith(`${candidate}/`));
  if (project) {
    const relative = selected.slice(project.length).replace(/^\/+|\/+$/g, '');
    if (!relative) {
      return { value: '', error: '請選取專案底下的子資料夾，或手動輸入要全掃描的相對資料夾。' };
    }
    return { value: relative, error: '' };
  }
  if (roots.length === 0) {
    return { value: '', error: '請先設定至少一個 Project Roots，或手動輸入 project root 內的相對資料夾。' };
  }
  const root = roots.find((candidate) => selected === candidate || selected.startsWith(`${candidate}/`));
  if (!root) {
    return { value: '', error: '選取的資料夾不在目前 Project Roots 之內；Project Docs 資料夾需使用 project root 內的相對路徑。' };
  }
  const relative = selected.slice(root.length).replace(/^\/+|\/+$/g, '');
  if (!relative) {
    return { value: '', error: '請選取 Project Roots 底下的子資料夾，或手動輸入要全掃描的相對資料夾。' };
  }
  return { value: relative, error: '' };
}

export function settingsToForm(settings) {
  const projectRoots = listToRows(settings?.project_roots);
  const excludedPaths = listToRows(settings?.excluded_paths);
  const projectDocFilenames = listToRows(settings?.project_doc_filenames);
  const projectDocFolders = listToRows(settings?.project_doc_folders);
  return {
    projectRoots,
    excludedPaths,
    projectDocFilenames,
    projectDocFolders,
    projectRootsText: listToMultiline(settings?.project_roots),
    excludedPathsText: listToMultiline(settings?.excluded_paths),
    projectDocFilenamesText: listToMultiline(settings?.project_doc_filenames),
    projectDocFoldersText: listToMultiline(settings?.project_doc_folders),
    scanIntervalMinutes: Number(settings?.scan_interval_minutes) || 60,
    defaultDiaryAgent: settings?.default_diary_agent || '',
    appearance: settings?.appearance || 'system',
    redactSensitiveValues: settings?.privacy?.redact_sensitive_values ?? true,
    includeCommentsInExports: settings?.privacy?.include_comments_in_exports ?? false,
    desiredDbPath: settings?.data_storage?.desired_db_path || settings?.data_storage?.active_db_path || '',
    scanProviderMode: 'cli-logs',
    scanFallbackMode: 'none',
    dailySchedulerEnabled: settings?.daily_scheduler?.enabled ?? false,
    dailySchedulerRunTime: settings?.daily_scheduler?.run_time_local || '18:00',
    agents: Array.isArray(settings?.agents)
      ? settings.agents.map((agent) => ({
        id: agent.id,
        display_name: agent.display_name,
        enabled: !!agent.enabled,
        model: agent.model || 'Default (CLI config)',
        reasoning: agent.reasoning || 'default',
      }))
      : [],
    customAgents: Array.isArray(settings?.custom_agents) ? settings.custom_agents : [],
    aiPrompts: {
      project_diary: settings?.ai_prompts?.project_diary || '',
      daily_diary_entry: settings?.ai_prompts?.daily_diary_entry || '',
      daily_highlight: settings?.ai_prompts?.daily_highlight || '',
      kanban_cards: settings?.ai_prompts?.kanban_cards || '',
    },
  };
}

export function formToSettingsPatch(form) {
  const patch = {
    project_roots: rowsToList(form.projectRoots ?? form.projectRootsText),
    excluded_paths: rowsToList(form.excludedPaths ?? form.excludedPathsText),
    project_doc_filenames: rowsToList(form.projectDocFilenames ?? form.projectDocFilenamesText),
    project_doc_folders: rowsToList(form.projectDocFolders ?? form.projectDocFoldersText),
    scan_interval_minutes: Number(form.scanIntervalMinutes),
    default_diary_agent: form.defaultDiaryAgent || null,
    privacy: {
      redact_sensitive_values: !!form.redactSensitiveValues,
      include_comments_in_exports: !!form.includeCommentsInExports,
    },
    appearance: form.appearance || 'system',
    scan_provider: {
      provider: 'cli-logs',
      fallback: 'none',
    },
    daily_scheduler: {
      enabled: !!form.dailySchedulerEnabled,
      run_time_local: form.dailySchedulerRunTime || '18:00',
    },
    agents: (Array.isArray(form.agents) ? form.agents : []).map((agent) => ({
      id: agent.id,
      enabled: !!agent.enabled,
      model: agent.model || 'Default (CLI config)',
      reasoning: agent.reasoning || 'default',
    })),
    ai_prompts: {
      project_diary: form.aiPrompts?.project_diary || '',
      daily_diary_entry: form.aiPrompts?.daily_diary_entry || '',
      daily_highlight: form.aiPrompts?.daily_highlight || '',
    },
  };
  const desiredDbPath = String(form.desiredDbPath || '').trim();
  if (desiredDbPath) {
    patch.data_storage = { desired_db_path: desiredDbPath };
  }
  return patch;
}

export function settingsAgentsToCards(agents) {
  return settingsAgentsToCardsWithDetection(agents, null, []);
}

export function settingsAgentsToCardsWithDetection(agents, detectionAgents, customAgents = []) {
  const detectionById = new Map((Array.isArray(detectionAgents) ? detectionAgents : []).map((agent) => [agent.id, agent]));
  const canonicalSource = Array.isArray(agents) && agents.length > 0 ? agents : DEFAULT_AGENT_CARDS;
  const canonicalCards = canonicalSource.map((agent) => {
    const enabled = 'enabled' in agent ? !!agent.enabled : !!agent.active;
    const detection = detectionById.get(agent.id);
    const connected = detection ? detection.available : enabled;
    return {
      id: agent.id,
      name: agent.display_name || agent.name || agent.id,
      version: detection?.version || 'Settings',
      status: connected ? 'connected' : 'disconnected',
      active: enabled,
      path: detection?.binary_path || '未偵測到執行檔',
      detectionError: detection?.error_message || null,
      checkedAt: detection?.checked_at || null,
      kind: 'canonical',
      removable: false,
      model: agent.model || 'Default (CLI config)',
      reasoning: agent.reasoning || 'default',
      sources: agent.sources || {
        executable: { mode: 'auto', configured_path: null },
        activity_logs: { mode: 'auto', configured_data_roots: [] },
      },
      sourceStatus: detection?.source_status || null,
      diaryCapability: agent.diary_capability || { supported: agent.id !== 'codex-cli', unsupported_reason: agent.id === 'codex-cli' ? '尚未支援 Diary Agent' : null },
    };
  });
  const customCards = (Array.isArray(customAgents) ? customAgents : []).map((agent) => ({
    id: agent.id,
    name: agent.display_name || agent.id,
    version: agent.version || 'Custom agent',
    status: agent.status === 'connected' && agent.enabled ? 'connected' : 'disconnected',
    active: !!agent.enabled,
    path: agent.executable_path || '未設定',
    detectionError: agent.error_message || null,
    checkedAt: agent.checked_at || null,
    kind: 'custom',
    removable: true,
    model: agent.model || 'custom',
    reasoning: agent.reasoning || 'default',
    diaryCapability: { supported: /ollama/i.test(`${agent.id} ${agent.display_name} ${agent.model} ${agent.executable_path}`), unsupported_reason: '只有 enabled Ollama custom agent 可作為 Diary Agent。' },
  }));
  return [...canonicalCards, ...customCards];
}
