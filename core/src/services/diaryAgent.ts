import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSafeChildEnv, resolveCanonicalAgentExecutable } from './agentDetection.js';
import type { CanonicalAgentId, ProjectDetailSnapshot } from '../domain/types.js';
import {
  DEFAULT_DAILY_DIARY_ENTRY_PROMPT,
  DEFAULT_PROJECT_DIARY_PROMPT,
  type AppSettings,
  type CustomAgentSettings,
} from './settings.js';

const DEFAULT_ANTIGRAVITY_MODEL = 'Gemini 3.5 Flash (Medium)';
const DEFAULT_PRINT_TIMEOUT = '90s';
const DEFAULT_EXEC_TIMEOUT_MS = 100_000;
const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen3.6:27b';
const MAX_PROMPT_CHARS = 1_800;
const MAX_DRAFT_CHARS = 20_000;
const AUTH_MARKER = 'you are not logged into antigravity';

export interface DiaryDraftResult {
  markdown: string;
  agent_id: CanonicalAgentId | `custom-${string}` | 'fallback';
  fallback_report: string | null;
}

export type ProjectSummaryDraftGenerator = (
  snapshot: ProjectDetailSnapshot,
  today: string,
) => Promise<DiaryDraftResult>;

export type DailySummaryDraftGenerator = (prompt: string) => Promise<DiaryDraftResult>;

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export type ExecFileImpl = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
    shell: false;
  },
) => Promise<ExecFileResult>;

export interface AntigravityDiaryAgentOptions {
  cliPath?: string;
  model?: string;
  systemPrompt?: string;
  printTimeout?: string;
  execTimeoutMs?: number;
  homeDir?: string;
  runDir?: string;
  execFileImpl?: ExecFileImpl;
}

export interface ClaudeDiaryAgentOptions {
  cliPath?: string;
  model?: string;
  systemPrompt?: string;
  execTimeoutMs?: number;
  homeDir?: string;
  runDir?: string;
  execFileImpl?: ExecFileImpl;
  sources?: AppSettings['agents'][number]['sources'];
}

export interface CodexDiaryAgentOptions extends Omit<ClaudeDiaryAgentOptions, 'sources'> {
  sources?: AppSettings['agents'][number]['sources'];
}

export interface OllamaDiaryAgentOptions {
  agentId?: `custom-${string}`;
  endpoint?: string;
  model?: string;
  systemPrompt?: string;
  execTimeoutMs?: number;
  fetchImpl?: (url: string, init: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text?: () => Promise<string>;
  }>;
}

export class DiaryAgentError extends Error {
  code = 'diary_agent_failed';
}

export class DiaryAgentAuthError extends DiaryAgentError {
  code = 'diary_agent_auth_failed';
}

function defaultExecFile(file: string, args: string[], options: Parameters<ExecFileImpl>[2]): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    const child = nodeExecFile(file, args, options, (error, stdout, stderr) => {
      const result = { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
      if (error) {
        if (`${result.stdout}\n${result.stderr}`.toLowerCase().includes(AUTH_MARKER)) {
          reject(new DiaryAgentAuthError('Antigravity CLI 尚未登入；請在 Terminal 執行 `agy` 完成登入後重試。'));
          return;
        }
        reject(new DiaryAgentError('Antigravity CLI exited unsuccessfully'));
        return;
      }
      resolve(result);
    });
    // `agy --print` also watches stdin; closing it makes print mode see EOF under Node execFile.
    child.stdin?.end();
  });
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function safeEnv(homeDir: string): NodeJS.ProcessEnv {
  return buildSafeChildEnv({ ...process.env, PATH: `${join(homeDir, '.local', 'bin')}:${process.env.PATH ?? ''}` }, homeDir);
}

function defaultAgyPath(homeDir: string): string {
  const local = join(homeDir, '.local', 'bin', 'agy');
  return existsSync(local) ? local : 'agy';
}

function normalizeMarkdown(raw: string): string {
  const markdown = raw.trim();
  if (!markdown) throw new DiaryAgentError('Antigravity CLI returned an empty diary draft');
  return truncate(markdown, MAX_DRAFT_CHARS);
}

function summarizeFailure(err: unknown): string {
  if (err instanceof DiaryAgentAuthError) return 'Antigravity CLI 尚未登入，已改用 deterministic fallback。';
  if (err instanceof Error && err.message.toLowerCase().includes('ollama')) return 'Ollama 產生日記失敗，已改用 deterministic fallback。';
  if (err instanceof Error && err.message.toLowerCase().includes('timeout')) return 'AI Diary Agent 逾時，已改用 deterministic fallback。';
  if (err instanceof Error && 'code' in err && err.code === 'ETIMEDOUT') return 'Antigravity CLI 逾時，已改用 deterministic fallback。';
  if (err instanceof Error && err.message.toLowerCase().includes('antigravity')) return 'Antigravity CLI 產生日記失敗，已改用 deterministic fallback。';
  return 'AI Diary Agent 產生日記失敗，已改用 deterministic fallback。';
}

function isDefaultCliModel(model: string | null | undefined): boolean {
  return !model || model.trim() === '' || model.trim() === 'Default (CLI config)';
}

function claudeModel(model: string | null | undefined): string | null {
  if (isDefaultCliModel(model)) return null;
  const value = model!.trim().toLowerCase();
  if (value.includes('opus')) return 'opus';
  if (value.includes('sonnet')) return 'sonnet';
  if (value.includes('haiku')) return 'haiku';
  return null;
}

export function createClaudePromptRunner(options: ClaudeDiaryAgentOptions = {}): (prompt: string) => Promise<string> {
  const homeDir = options.homeDir ?? homedir();
  const resolution = options.sources
    ? resolveCanonicalAgentExecutable('claude-code', options.sources, { homeDir })
    : { path: null };
  const cliPath = options.cliPath ?? resolution.path ?? 'claude';
  const model = claudeModel(options.model);
  const execTimeoutMs = options.execTimeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
  const runDir = options.runDir ?? join(tmpdir(), 'devdiary-claude-runner');
  const execFileImpl = options.execFileImpl ?? defaultExecFile;
  mkdirSync(runDir, { recursive: true });
  return async (prompt: string) => {
    const args = ['-p', truncate(prompt, MAX_PROMPT_CHARS), '--output-format', 'text', '--max-turns', '1'];
    if (model) args.push('--model', model);
    try {
      const result = await execFileImpl(cliPath, args, {
        cwd: runDir,
        env: safeEnv(homeDir),
        timeout: execTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        shell: false,
      });
      return normalizeMarkdown(result.stdout);
    } catch {
      throw new DiaryAgentError('Claude Code CLI exited unsuccessfully');
    }
  };
}

export function createCodexPromptRunner(options: CodexDiaryAgentOptions = {}): (prompt: string) => Promise<string> {
  const homeDir = options.homeDir ?? homedir();
  const resolution = options.sources
    ? resolveCanonicalAgentExecutable('codex-cli', options.sources, { homeDir })
    : { path: null };
  const cliPath = options.cliPath ?? resolution.path;
  const execTimeoutMs = options.execTimeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
  const parent = options.runDir ?? join(tmpdir(), 'devdiary-codex-runner');
  const execFileImpl = options.execFileImpl ?? defaultExecFile;
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  return async (prompt: string) => {
    if (!cliPath) throw new DiaryAgentError('Codex CLI executable is unavailable');
    const temporaryCwd = mkdtempSync(join(parent, 'run-'));
    try {
      const args = ['exec', '--sandbox', 'read-only', '--ephemeral', '--cd', temporaryCwd, '--skip-git-repo-check', '--color', 'never', truncate(prompt, MAX_PROMPT_CHARS)];
      const result = await execFileImpl(cliPath, args, {
        cwd: temporaryCwd,
        env: safeEnv(homeDir),
        timeout: execTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        shell: false,
      });
      return normalizeMarkdown(result.stdout);
    } catch {
      throw new DiaryAgentError('Codex CLI exited unsuccessfully');
    } finally {
      rmSync(temporaryCwd, { recursive: true, force: true });
    }
  };
}

export function createAntigravityPromptRunner(options: AntigravityDiaryAgentOptions = {}): (prompt: string) => Promise<string> {
  const homeDir = options.homeDir ?? homedir();
  const cliPath = options.cliPath ?? process.env.DEVDIARY_ANTIGRAVITY_BIN ?? process.env.AGY_CLI_PATH ?? defaultAgyPath(homeDir);
  const model = isDefaultCliModel(options.model) ? (process.env.DEVDIARY_ANTIGRAVITY_MODEL ?? DEFAULT_ANTIGRAVITY_MODEL) : options.model!.trim();
  const printTimeout = options.printTimeout ?? process.env.DEVDIARY_ANTIGRAVITY_PRINT_TIMEOUT ?? DEFAULT_PRINT_TIMEOUT;
  const execTimeoutMs = options.execTimeoutMs ?? Number(process.env.DEVDIARY_ANTIGRAVITY_EXEC_TIMEOUT_MS ?? DEFAULT_EXEC_TIMEOUT_MS);
  const runDir = options.runDir ?? join(tmpdir(), 'devdiary-antigravity-runner');
  const execFileImpl = options.execFileImpl ?? defaultExecFile;
  mkdirSync(runDir, { recursive: true });

  return async (prompt: string) => {
    const args = ['--model', model, '--print-timeout', printTimeout, '--print', truncate(prompt, MAX_PROMPT_CHARS)];
    let result: ExecFileResult;
    try {
      result = await execFileImpl(cliPath, args, {
        cwd: runDir,
        env: safeEnv(homeDir),
        timeout: execTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        shell: false,
      });
    } catch (err) {
      if (err instanceof DiaryAgentError) throw err;
      throw new DiaryAgentError('Antigravity CLI exited unsuccessfully');
    }

    const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
    if (combined.includes(AUTH_MARKER)) {
      throw new DiaryAgentAuthError('Antigravity CLI 尚未登入；請在 Terminal 執行 `agy` 完成登入後重試。');
    }
    return normalizeMarkdown(result.stdout);
  };
}

function normalizeOllamaEndpoint(endpoint: string | undefined): string {
  const raw = (endpoint || process.env.DEVDIARY_OLLAMA_ENDPOINT || DEFAULT_OLLAMA_ENDPOINT).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(raw)) {
    throw new DiaryAgentError('Ollama endpoint must be a local http(s) endpoint');
  }
  return raw;
}

function ollamaModel(model: string | null | undefined): string {
  const value = model?.trim();
  if (!value || value === 'custom' || value === 'Default (CLI config)') {
    return process.env.DEVDIARY_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  }
  return value;
}

function createOllamaPromptRunner(options: OllamaDiaryAgentOptions = {}): (prompt: string) => Promise<string> {
  const endpoint = normalizeOllamaEndpoint(options.endpoint);
  const model = ollamaModel(options.model);
  const execTimeoutMs = options.execTimeoutMs ?? Number(process.env.DEVDIARY_OLLAMA_EXEC_TIMEOUT_MS ?? DEFAULT_EXEC_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as OllamaDiaryAgentOptions['fetchImpl']);
  if (!fetchImpl) throw new DiaryAgentError('Ollama fetch runtime is unavailable');

  return async (prompt: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), execTimeoutMs);
    try {
      const res = await fetchImpl(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: truncate(prompt, MAX_PROMPT_CHARS),
          stream: false,
          options: { temperature: 0.2 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new DiaryAgentError(`Ollama generate failed with HTTP ${res.status}`);
      const body = await res.json();
      if (!body || typeof body !== 'object' || typeof (body as { response?: unknown }).response !== 'string') {
        throw new DiaryAgentError('Ollama returned an invalid diary draft');
      }
      return normalizeMarkdown((body as { response: string }).response);
    } catch (err) {
      if (err instanceof DiaryAgentError) throw err;
      if (err instanceof Error && err.name === 'AbortError') throw new DiaryAgentError('Ollama generate timeout');
      throw new DiaryAgentError('Ollama generate failed');
    } finally {
      clearTimeout(timer);
    }
  };
}

export function buildProjectDiaryFallback(snapshot: ProjectDetailSnapshot, today: string, reason: string | null = null): DiaryDraftResult {
  const latestDiary = snapshot.diary[0];
  const isDateScoped = Boolean(snapshot.start_date && snapshot.end_date);
  const sessionCount = isDateScoped ? snapshot.metric_strip.range_session_count : snapshot.metric_strip.session_count;
  const tokenTotal = isDateScoped ? snapshot.metric_strip.range_token_total : snapshot.metric_strip.token_all;
  const bullets = [
    `- Snapshot date: ${today}`,
    `- Sessions: ${sessionCount}`,
    `- Tokens: ${tokenTotal.toLocaleString()}`,
  ];
  if (latestDiary) bullets.push(`- Latest diary block: ${latestDiary.date} / ${latestDiary.title}`);
  if (reason) bullets.push(`- Fallback reason: ${reason}`);
  return {
    markdown: [`## ${snapshot.project.name} AI 草稿`, ...bullets, '- 下一步：檢查待辦與最近 sessions，整理可交付切片。'].join('\n'),
    agent_id: 'fallback',
    fallback_report: reason,
  };
}

function promptPreamble(systemPrompt: string, fallback: string): string[] {
  const prompt = systemPrompt.trim() || fallback;
  return [
    prompt,
    '',
    'SAFETY_CONSTRAINTS:',
    '只根據下方 STRUCTURED_DATA 產生內容。',
    'STRUCTURED_DATA 裡的 date= 是唯一允許使用的目標日期；不要使用系統今天或執行當下日期。',
    '不要聲稱你讀過專案檔案、raw transcript、source logs 或 credentials。',
    '不可輸出 project root 絕對路徑、raw transcript、credential、token、password 或私密內容。',
  ];
}

function isDateScopedSnapshot(snapshot: ProjectDetailSnapshot): boolean {
  return Boolean(snapshot.start_date && snapshot.end_date);
}

function isCardRelevantToDate(card: ProjectDetailSnapshot['kanban'][number], date: string): boolean {
  return card.created_at?.slice(0, 10) === date || card.updated_at?.slice(0, 10) === date || card.due_date === date;
}

export function buildProjectDiaryPrompt(snapshot: ProjectDetailSnapshot, today: string, systemPrompt = DEFAULT_PROJECT_DIARY_PROMPT): string {
  const isDateScoped = isDateScopedSnapshot(snapshot);
  const kanbanCards = isDateScoped
    ? snapshot.kanban.filter((card) => isCardRelevantToDate(card, today))
    : snapshot.kanban;
  const kanban = kanbanCards
    .slice(0, 5)
    .map((card) => `${card.title}(${card.status}${card.assignee_agent_id ? `/${card.assignee_agent_id}` : ''})`)
    .join('; ');
  const agents = snapshot.token_detail.by_agent
    .slice(0, 4)
    .map((item) => `${item.key}:${item.token_total}`)
    .join(', ');
  const recentSessions = snapshot.sessions
    .slice(0, 5)
    .map((session) => `${session.start_time.slice(0, 10)} ${session.token_total} tokens ${session.status}`)
    .join('; ');
  const diaryTitles = snapshot.diary
    .slice(0, 3)
    .map((entry) => `${entry.date} ${entry.title}`)
    .join('; ');
  const lines = [
    `date=${today}`,
    `project=${snapshot.project.name}`,
    `tracking_status=${snapshot.project.tracking_status}`,
    `branch=${snapshot.git_status.current_branch ?? snapshot.project.git_branch ?? 'unknown'}`,
    isDateScoped
      ? 'git_status_current_snapshot=omitted_for_date_scoped_diary'
      : `git_status=${snapshot.git_status.working_tree_status}`,
    `tokens_today=${snapshot.metric_strip.token_today}`,
    `tokens_week=${snapshot.metric_strip.token_week}`,
    isDateScoped
      ? `tokens_range=${snapshot.metric_strip.range_token_total}`
      : `tokens_all=${snapshot.metric_strip.token_all}`,
    `range_sessions=${snapshot.metric_strip.range_session_count}`,
    `summary_status=${snapshot.metric_strip.summary_status}`,
    `agents=${agents || 'none'}`,
    `kanban=${kanban || 'none'}`,
    `recent_sessions=${recentSessions || 'none'}`,
    `recent_diary=${diaryTitles || 'none'}`,
  ];

  return truncate(
    [
      ...promptPreamble(systemPrompt, DEFAULT_PROJECT_DIARY_PROMPT),
      '',
      'STRUCTURED_DATA:',
      lines.join('\n'),
    ].join('\n'),
    MAX_PROMPT_CHARS,
  );
}

export function createAntigravityProjectDiaryAgent(options: AntigravityDiaryAgentOptions = {}): ProjectSummaryDraftGenerator {
  const runPrompt = createAntigravityPromptRunner(options);

  return async (snapshot, today) => {
    const prompt = buildProjectDiaryPrompt(snapshot, today, options.systemPrompt ?? DEFAULT_PROJECT_DIARY_PROMPT);
    return {
      markdown: await runPrompt(prompt),
      agent_id: 'antigravity-cli',
      fallback_report: null,
    };
  };
}

export function createClaudeProjectDiaryAgent(options: ClaudeDiaryAgentOptions = {}): ProjectSummaryDraftGenerator {
  const runPrompt = createClaudePromptRunner(options);
  return async (snapshot, today) => ({
    markdown: await runPrompt(buildProjectDiaryPrompt(snapshot, today, options.systemPrompt ?? DEFAULT_PROJECT_DIARY_PROMPT)),
    agent_id: 'claude-code',
    fallback_report: null,
  });
}

export function createCodexProjectDiaryAgent(options: CodexDiaryAgentOptions = {}): ProjectSummaryDraftGenerator {
  const runPrompt = createCodexPromptRunner(options);
  return async (snapshot, today) => ({
    markdown: await runPrompt(buildProjectDiaryPrompt(snapshot, today, options.systemPrompt ?? DEFAULT_PROJECT_DIARY_PROMPT)),
    agent_id: 'codex-cli',
    fallback_report: null,
  });
}

export function createAntigravityDailySummaryAgent(options: AntigravityDiaryAgentOptions = {}): DailySummaryDraftGenerator {
  const runPrompt = createAntigravityPromptRunner(options);
  return async (prompt) => ({
    markdown: await runPrompt(prompt),
    agent_id: 'antigravity-cli',
    fallback_report: null,
  });
}

export function createClaudeDailySummaryAgent(options: ClaudeDiaryAgentOptions = {}): DailySummaryDraftGenerator {
  const runPrompt = createClaudePromptRunner(options);
  return async (prompt) => ({ markdown: await runPrompt(prompt), agent_id: 'claude-code', fallback_report: null });
}

export function createCodexDailySummaryAgent(options: CodexDiaryAgentOptions = {}): DailySummaryDraftGenerator {
  const runPrompt = createCodexPromptRunner(options);
  return async (prompt) => ({ markdown: await runPrompt(prompt), agent_id: 'codex-cli', fallback_report: null });
}

export function createOllamaProjectDiaryAgent(options: OllamaDiaryAgentOptions = {}): ProjectSummaryDraftGenerator {
  const runPrompt = createOllamaPromptRunner(options);
  const agentId = options.agentId ?? 'custom-ollama';

  return async (snapshot, today) => {
    const prompt = buildProjectDiaryPrompt(snapshot, today, options.systemPrompt ?? DEFAULT_PROJECT_DIARY_PROMPT);
    return {
      markdown: await runPrompt(prompt),
      agent_id: agentId,
      fallback_report: null,
    };
  };
}

export function createOllamaDailySummaryAgent(options: OllamaDiaryAgentOptions = {}): DailySummaryDraftGenerator {
  const runPrompt = createOllamaPromptRunner(options);
  const agentId = options.agentId ?? 'custom-ollama';
  return async (prompt) => ({
    markdown: await runPrompt(prompt),
    agent_id: agentId,
    fallback_report: null,
  });
}

function isOllamaCustomAgent(agent: CustomAgentSettings | undefined): agent is CustomAgentSettings {
  if (!agent || agent.enabled === false) return false;
  const haystack = [
    agent.id,
    agent.display_name,
    agent.model,
    agent.executable_path,
    agent.version ?? '',
  ].join(' ').toLowerCase();
  return haystack.includes('ollama');
}

function customOllamaOptions(agent: CustomAgentSettings, systemPrompt?: string): OllamaDiaryAgentOptions {
  return {
    agentId: agent.id as `custom-${string}`,
    model: agent.model,
    systemPrompt,
  };
}

export function createConfiguredProjectDiaryAgent(
  settings: AppSettings,
  promptKind: 'project_diary' | 'daily_diary_entry' = 'project_diary',
): ProjectSummaryDraftGenerator | null {
  const systemPrompt = promptKind === 'daily_diary_entry'
    ? (settings.ai_prompts.daily_diary_entry || DEFAULT_DAILY_DIARY_ENTRY_PROMPT)
    : (settings.ai_prompts.project_diary || DEFAULT_PROJECT_DIARY_PROMPT);
  if (settings.default_diary_agent?.startsWith('custom-')) {
    const custom = settings.custom_agents.find((agent) => agent.id === settings.default_diary_agent);
    if (isOllamaCustomAgent(custom)) return createOllamaProjectDiaryAgent(customOllamaOptions(custom, systemPrompt));
    return null;
  }
  const claude = settings.agents.find((agent) => agent.id === 'claude-code');
  if (settings.default_diary_agent === 'claude-code' && claude?.enabled !== false) {
    if (!claude || !resolveCanonicalAgentExecutable('claude-code', claude.sources, { homeDir: homedir() }).path) return null;
    return createClaudeProjectDiaryAgent({ model: claude?.model, sources: claude?.sources, systemPrompt });
  }
  const codex = settings.agents.find((agent) => agent.id === 'codex-cli');
  if (settings.default_diary_agent === 'codex-cli' && codex?.enabled !== false) {
    if (!codex || !resolveCanonicalAgentExecutable('codex-cli', codex.sources, { homeDir: homedir() }).path) return null;
    return createCodexProjectDiaryAgent({ model: codex.model, sources: codex.sources, systemPrompt });
  }
  const antigravity = settings.agents.find((agent) => agent.id === 'antigravity-cli');
  if (settings.default_diary_agent !== 'antigravity-cli' || antigravity?.enabled === false) return null;
  return createAntigravityProjectDiaryAgent({
    model: antigravity?.model,
    cliPath: antigravity?.sources.executable.mode === 'custom' ? antigravity.sources.executable.configured_path ?? undefined : undefined,
    systemPrompt,
  });
}

export function createConfiguredDailySummaryAgent(settings: AppSettings): DailySummaryDraftGenerator | null {
  if (settings.default_diary_agent?.startsWith('custom-')) {
    const custom = settings.custom_agents.find((agent) => agent.id === settings.default_diary_agent);
    if (isOllamaCustomAgent(custom)) return createOllamaDailySummaryAgent(customOllamaOptions(custom));
    return null;
  }
  const claude = settings.agents.find((agent) => agent.id === 'claude-code');
  if (settings.default_diary_agent === 'claude-code' && claude?.enabled !== false) {
    if (!claude || !resolveCanonicalAgentExecutable('claude-code', claude.sources, { homeDir: homedir() }).path) return null;
    return createClaudeDailySummaryAgent({ model: claude?.model, sources: claude?.sources });
  }
  const codex = settings.agents.find((agent) => agent.id === 'codex-cli');
  if (settings.default_diary_agent === 'codex-cli' && codex?.enabled !== false) {
    if (!codex || !resolveCanonicalAgentExecutable('codex-cli', codex.sources, { homeDir: homedir() }).path) return null;
    return createCodexDailySummaryAgent({ model: codex.model, sources: codex.sources });
  }
  const antigravity = settings.agents.find((agent) => agent.id === 'antigravity-cli');
  if (settings.default_diary_agent !== 'antigravity-cli' || antigravity?.enabled === false) return null;
  return createAntigravityDailySummaryAgent({
    model: antigravity?.model,
    cliPath: antigravity?.sources.executable.mode === 'custom' ? antigravity.sources.executable.configured_path ?? undefined : undefined,
  });
}

export async function generateProjectDiaryDraft(
  snapshot: ProjectDetailSnapshot,
  today: string,
  generator: ProjectSummaryDraftGenerator | null | undefined,
): Promise<DiaryDraftResult> {
  if (!generator) return buildProjectDiaryFallback(snapshot, today);
  try {
    return await generator(snapshot, today);
  } catch (err) {
    const reason = summarizeFailure(err);
    return buildProjectDiaryFallback(snapshot, today, reason);
  }
}

export async function generateDailySummaryDraft(
  prompt: string,
  fallbackMarkdown: string,
  generator: DailySummaryDraftGenerator | null | undefined,
): Promise<DiaryDraftResult> {
  if (!generator) {
    return { markdown: fallbackMarkdown, agent_id: 'fallback', fallback_report: null };
  }
  try {
    return await generator(prompt);
  } catch (err) {
    const reason = summarizeFailure(err);
    return {
      markdown: `${fallbackMarkdown}\n\n> ${reason}`,
      agent_id: 'fallback',
      fallback_report: reason,
    };
  }
}
