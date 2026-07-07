import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { ProjectScanCandidate, ScanProvider, ScanSessionCandidate, ScannableProject } from './scans.js';

export type ParserWarningKind = 'malformed_jsonl' | 'unreadable_file';

export interface ParserWarning {
  agent_name: 'claude-code' | 'codex-cli' | 'antigravity-cli';
  kind: ParserWarningKind;
  source: string;
  line?: number;
  message: string;
}

export interface CliLogParserOptions {
  homeDir?: string;
  maxFilesPerProject?: number;
}

export interface CliLogScanProviderOptions extends CliLogParserOptions {
  fallbackProvider?: ScanProvider | null;
}

export interface ParsedProjectScanCandidate extends ProjectScanCandidate {
  warnings: ParserWarning[];
}

interface SharedCodexIndex {
  sessionsByProject: Map<string, ScanSessionCandidate[]>;
  warnings: ParserWarning[];
  warningsReported: boolean;
}

interface JsonObject {
  [key: string]: unknown;
}

interface SessionAccumulator {
  agent_name: 'claude-code' | 'codex-cli' | 'antigravity-cli';
  sessionId: string;
  source_log_ref: string;
  model: string;
  start_time: string | null;
  end_time: string | null;
  token_input: number;
  token_cached: number;
  token_output: number;
  token_reasoning: number;
  command: string;
  parser_confidence: number;
  hasUsage: boolean;
}

const DEFAULT_MAX_FILES = 500;

export function escapeClaudeProjectPath(projectPath: string): string {
  return projectPath.replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9.-]/g, '-');
}

function legacyEscapeClaudeProjectPath(projectPath: string): string {
  return projectPath.replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-');
}

function claudeProjectDirs(homeDir: string, projectPath: string): string[] {
  const names = [escapeClaudeProjectPath(projectPath), legacyEscapeClaudeProjectPath(projectPath)];
  return [...new Set(names)].map((name) => join(homeDir, '.claude', 'projects', name));
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function stableId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function safeSourceToken(input: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input) ? input : stableId(input);
}

function updateTimes(acc: SessionAccumulator, timestamp: unknown): void {
  const ts = stringValue(timestamp);
  if (!ts || Number.isNaN(Date.parse(ts))) return;
  if (!acc.start_time || ts < acc.start_time) acc.start_time = ts;
  if (!acc.end_time || ts > acc.end_time) acc.end_time = ts;
}

function durationSeconds(start: string, end: string | null): number | null {
  if (!end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 1000);
}

function sortedJsonlFiles(dir: string, maxFiles: number): string[] {
  if (!existsSync(dir)) return [];
  const out: Array<{ path: string; mtimeMs: number }> = [];
  const visit = (current: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(current).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile() && path.endsWith('.jsonl')) {
        out.push({ path, mtimeMs: stat.mtimeMs });
      }
    }
  };
  visit(dir);
  return out
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
    .slice(0, maxFiles)
    .map((entry) => entry.path);
}

function sortedLogFiles(dir: string, maxFiles: number): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= maxFiles) break;
    const path = join(dir, entry);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isFile() && path.endsWith('.log')) out.push(path);
  }
  return out;
}

function readJsonl(file: string, agentName: ParserWarning['agent_name'], warnings: ParserWarning[]): JsonObject[] {
  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    warnings.push({
      agent_name: agentName,
      kind: 'unreadable_file',
      source: `${agentName}:${basename(file)}`,
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const rows: JsonObject[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isObject(parsed)) rows.push(parsed);
    } catch {
      warnings.push({
        agent_name: agentName,
        kind: 'malformed_jsonl',
        source: `${agentName}:${basename(file)}`,
        line: index + 1,
        message: 'Skipped malformed JSONL line.',
      });
    }
  });
  return rows;
}

function toCandidate(acc: SessionAccumulator): ScanSessionCandidate | null {
  if (!acc.start_time) return null;
  const endTime = acc.end_time ?? acc.start_time;
  const tokenTotal = acc.token_input + acc.token_cached + acc.token_output + acc.token_reasoning;
  return {
    agent_name: acc.agent_name,
    model: acc.model,
    start_time: acc.start_time,
    end_time: endTime,
    token_total: tokenTotal,
    token_input: acc.token_input,
    token_cached: acc.token_cached,
    token_output: acc.token_output,
    token_reasoning: acc.token_reasoning,
    source_log_ref: acc.source_log_ref,
    command: acc.command,
    duration: durationSeconds(acc.start_time, endTime),
    status: 'completed',
    summary: `Parsed ${acc.agent_name} session ${acc.sessionId}.`,
    parser_confidence: acc.parser_confidence,
  };
}

function parseClaude(project: ScannableProject, opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): ScanSessionCandidate[] {
  const files = claudeProjectDirs(opts.homeDir, project.root_path).flatMap((projectDir) => sortedJsonlFiles(projectDir, opts.maxFilesPerProject));
  const sessions = new Map<string, SessionAccumulator>();

  for (const file of files) {
    for (const row of readJsonl(file, 'claude-code', warnings)) {
      const cwd = stringValue(row.cwd);
      if (cwd && cwd !== project.root_path) continue;
      const sessionId = stringValue(row.sessionId) ?? stableId(file);
      let acc = sessions.get(sessionId);
      if (!acc) {
        acc = {
          agent_name: 'claude-code',
          sessionId,
          source_log_ref: `claude-code://${safeSourceToken(sessionId)}`,
          model: 'unknown',
          start_time: null,
          end_time: null,
          token_input: 0,
          token_cached: 0,
          token_output: 0,
          token_reasoning: 0,
          command: 'claude-code',
          parser_confidence: 0.95,
          hasUsage: false,
        };
        sessions.set(sessionId, acc);
      }
      updateTimes(acc, row.timestamp);

      const message = isObject(row.message) ? row.message : null;
      const usage = message && isObject(message.usage) ? message.usage : null;
      const model = message ? stringValue(message.model) : null;
      if (model) acc.model = model;
      if (!usage) continue;

      acc.hasUsage = true;
      acc.token_input += numberValue(usage.input_tokens);
      acc.token_cached += numberValue(usage.cache_creation_input_tokens) + numberValue(usage.cache_read_input_tokens);
      acc.token_output += numberValue(usage.output_tokens);
      acc.token_reasoning += numberValue(usage.reasoning_tokens);
    }
  }

  return Array.from(sessions.values())
    .filter((acc) => acc.hasUsage)
    .map(toCandidate)
    .filter((candidate): candidate is ScanSessionCandidate => Boolean(candidate));
}

function addUsage(acc: SessionAccumulator, usage: JsonObject): void {
  const input = numberValue(usage.input_tokens) + numberValue(usage.prompt_tokens);
  const cached = numberValue(usage.cached_input_tokens) + numberValue(usage.cache_read_input_tokens);
  const output = numberValue(usage.output_tokens) + numberValue(usage.completion_tokens);
  const reasoning = numberValue(usage.reasoning_tokens) + numberValue(usage.reasoning_output_tokens);
  if (input + cached + output + reasoning === 0) return;
  acc.hasUsage = true;
  acc.token_input += input;
  acc.token_cached += cached;
  acc.token_output += output;
  acc.token_reasoning += reasoning;
}

function setUsageTotals(acc: SessionAccumulator, usage: JsonObject): void {
  const input = numberValue(usage.input_tokens) + numberValue(usage.prompt_tokens);
  const cached = numberValue(usage.cached_input_tokens) + numberValue(usage.cache_read_input_tokens);
  const output = numberValue(usage.output_tokens) + numberValue(usage.completion_tokens);
  const reasoning = numberValue(usage.reasoning_tokens) + numberValue(usage.reasoning_output_tokens);
  if (input + cached + output + reasoning === 0) return;
  acc.hasUsage = true;
  acc.token_input = input;
  acc.token_cached = cached;
  acc.token_output = output;
  acc.token_reasoning = reasoning;
}

function parseCodexIndex(opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): Map<string, ScanSessionCandidate[]> {
  const roots = [join(opts.homeDir, '.codex', 'sessions'), join(opts.homeDir, '.codex', 'archived_sessions')];
  const files = roots.flatMap((root) => sortedJsonlFiles(root, opts.maxFilesPerProject));
  const sessionsByProject = new Map<string, ScanSessionCandidate[]>();

  for (const file of files) {
    const rows = readJsonl(file, 'codex-cli', warnings);
    let sessionId: string | null = null;
    let cwd: string | null = null;
    let model = 'unknown';
    let startTime: string | null = null;
    let endTime: string | null = null;
    const acc: SessionAccumulator = {
      agent_name: 'codex-cli',
      sessionId: stableId(file),
      source_log_ref: `codex-cli://${stableId(file)}`,
      model,
      start_time: null,
      end_time: null,
      token_input: 0,
      token_cached: 0,
      token_output: 0,
      token_reasoning: 0,
      command: 'codex-cli',
      parser_confidence: 0.55,
      hasUsage: false,
    };

    for (const row of rows) {
      updateTimes(acc, row.timestamp);
      if (acc.start_time && (!startTime || acc.start_time < startTime)) startTime = acc.start_time;
      if (acc.end_time && (!endTime || acc.end_time > endTime)) endTime = acc.end_time;

      const payload = isObject(row.payload) ? row.payload : null;
      const item = isObject(row.item) ? row.item : null;
      if (row.type === 'session_meta' && payload) {
        sessionId = stringValue(payload.id) ?? sessionId;
        cwd = stringValue(payload.cwd) ?? cwd;
        startTime = stringValue(payload.timestamp) ?? startTime;
      }
      if (row.type === 'turn_context' && payload) {
        cwd = stringValue(payload.cwd) ?? cwd;
        model = stringValue(payload.model) ?? model;
      }
      const payloadUsage = payload && isObject(payload.usage) ? payload.usage : null;
      const itemUsage = item && isObject(item.usage) ? item.usage : null;
      const info = payload && isObject(payload.info) ? payload.info : null;
      const lastTokenUsage = info && isObject(info.last_token_usage) ? info.last_token_usage : null;
      const totalTokenUsage = info && isObject(info.total_token_usage) ? info.total_token_usage : null;
      if (payloadUsage) addUsage(acc, payloadUsage);
      if (itemUsage) addUsage(acc, itemUsage);
      if (lastTokenUsage) addUsage(acc, lastTokenUsage);
      if (totalTokenUsage) setUsageTotals(acc, totalTokenUsage);
    }

    if (!cwd || !startTime) continue;
    const stableSessionId = sessionId ?? stableId(file);
    acc.sessionId = stableSessionId;
    acc.source_log_ref = `codex-cli://${safeSourceToken(stableSessionId)}`;
    acc.model = model;
    acc.start_time = startTime;
    acc.end_time = endTime ?? startTime;
    acc.parser_confidence = acc.hasUsage ? 0.85 : 0.55;
    const candidate = toCandidate(acc);
    if (candidate) {
      const projectSessions = sessionsByProject.get(cwd) ?? [];
      projectSessions.push(candidate);
      sessionsByProject.set(cwd, projectSessions);
    }
  }

  for (const sessions of sessionsByProject.values()) {
    sessions.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return sessionsByProject;
}

function parseCodex(
  project: ScannableProject,
  opts: Required<CliLogParserOptions>,
  warnings: ParserWarning[],
  sharedIndex?: SharedCodexIndex,
): ScanSessionCandidate[] {
  const sessionsByProject = sharedIndex?.sessionsByProject ?? parseCodexIndex(opts, warnings);
  if (sharedIndex && !sharedIndex.warningsReported) {
    warnings.push(...sharedIndex.warnings);
    sharedIndex.warningsReported = true;
  }
  return sessionsByProject.get(project.root_path) ?? [];
}

function parseAntigravityTimestamp(file: string, line: string): string | null {
  const fileDate = basename(file).match(/^cli-(\d{4})(\d{2})(\d{2})_/);
  const lineTime = line.match(/^[IWEF](\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d+)/);
  if (!fileDate || !lineTime) return null;
  const [, year, month, day] = fileDate;
  const [, , , hour, minute, second] = lineTime;
  const millis = (lineTime[6] ?? '000').slice(0, 3).padEnd(3, '0');
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}+08:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function transcriptTimes(homeDir: string, conversationId: string, warnings: ParserWarning[]): { start: string | null; end: string | null; exists: boolean } {
  const transcript = join(homeDir, '.gemini', 'antigravity-cli', 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!existsSync(transcript)) return { start: null, end: null, exists: false };
  let start: string | null = null;
  let end: string | null = null;
  for (const row of readJsonl(transcript, 'antigravity-cli', warnings)) {
    const ts = stringValue(row.created_at);
    if (!ts || Number.isNaN(Date.parse(ts))) continue;
    if (!start || ts < start) start = ts;
    if (!end || ts > end) end = ts;
  }
  return { start, end, exists: true };
}

function parseAntigravity(project: ScannableProject, opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): ScanSessionCandidate[] {
  const logDir = join(opts.homeDir, '.gemini', 'antigravity-cli', 'log');
  const files = sortedLogFiles(logDir, opts.maxFilesPerProject);
  const sessions: ScanSessionCandidate[] = [];

  for (const file of files) {
    let content = '';
    try {
      content = readFileSync(file, 'utf8');
    } catch (err) {
      warnings.push({
        agent_name: 'antigravity-cli',
        kind: 'unreadable_file',
        source: `antigravity-cli:${basename(file)}`,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    let workspaceMatches = false;
    let model = 'unknown';
    let conversationId: string | null = null;
    let firstTime: string | null = null;
    let lastTime: string | null = null;
    let completedTime: string | null = null;

    for (const line of content.split(/\r?\n/)) {
      const ts = parseAntigravityTimestamp(file, line);
      if (ts) {
        if (!firstTime || ts < firstTime) firstTime = ts;
        if (!lastTime || ts > lastTime) lastTime = ts;
      }

      const workspace = line.match(/workspaceDirs=\[([^\]]*)\]/)?.[1];
      if (workspace && workspace.includes(project.root_path)) workspaceMatches = true;

      const printModel = line.match(/Print mode: starting .*model="([^"]+)"/)?.[1];
      if (printModel) model = printModel;

      const created = line.match(/Created conversation ([A-Za-z0-9._-]+)/)?.[1];
      const streamed = line.match(/Print mode: conversation=([A-Za-z0-9._-]+)/)?.[1];
      if (created || streamed) conversationId = created ?? streamed ?? conversationId;

      if (conversationId && line.includes(`Stream completed for ${conversationId}`) && ts) completedTime = ts;
    }

    if (!workspaceMatches || !conversationId || !firstTime) continue;

    const transcript = transcriptTimes(opts.homeDir, conversationId, warnings);
    const startTime = transcript.start ?? firstTime;
    const endTime = transcript.end ?? completedTime ?? lastTime ?? startTime;
    const candidate: ScanSessionCandidate = {
      agent_name: 'antigravity-cli',
      model,
      start_time: startTime,
      end_time: endTime,
      token_total: 0,
      token_input: 0,
      token_cached: 0,
      token_output: 0,
      token_reasoning: 0,
      source_log_ref: `antigravity-cli://${safeSourceToken(conversationId)}`,
      command: 'agy --print',
      duration: durationSeconds(startTime, endTime),
      status: 'completed',
      summary: `Parsed antigravity-cli conversation ${safeSourceToken(conversationId)}.`,
      parser_confidence: transcript.exists ? 0.65 : 0.5,
    };
    sessions.push(candidate);
  }

  return sessions;
}

function normalizedOptions(options: CliLogParserOptions = {}): Required<CliLogParserOptions> {
  return {
    homeDir: options.homeDir ?? homedir(),
    maxFilesPerProject: options.maxFilesPerProject ?? DEFAULT_MAX_FILES,
  };
}

function parseProjectCliLogsWithIndex(
  project: ScannableProject,
  options: CliLogParserOptions = {},
  sharedCodexIndex?: SharedCodexIndex,
): ParsedProjectScanCandidate {
  const opts: Required<CliLogParserOptions> = {
    ...normalizedOptions(options),
  };
  const warnings: ParserWarning[] = [];
  const sessions = [...parseClaude(project, opts, warnings), ...parseCodex(project, opts, warnings, sharedCodexIndex), ...parseAntigravity(project, opts, warnings)].sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  );

  return {
    sessions,
    kanban_cards: [],
    daily_summary: sessions.length > 0 ? `${project.name} CLI logs parsed: ${sessions.length} session(s).` : null,
    warnings,
  };
}

export function parseProjectCliLogs(project: ScannableProject, options: CliLogParserOptions = {}): ParsedProjectScanCandidate {
  return parseProjectCliLogsWithIndex(project, options);
}

export function createCliLogScanProvider(options: CliLogScanProviderOptions = {}): ScanProvider {
  let sharedCodexIndex: SharedCodexIndex | null = null;
  const getSharedCodexIndex = (): SharedCodexIndex => {
    if (!sharedCodexIndex) {
      const warnings: ParserWarning[] = [];
      sharedCodexIndex = {
        sessionsByProject: parseCodexIndex(normalizedOptions(options), warnings),
        warnings,
        warningsReported: false,
      };
    }
    return sharedCodexIndex;
  };
  return {
    scanProject(project, today) {
      const parsed = parseProjectCliLogsWithIndex(project, options, getSharedCodexIndex());
      if (parsed.sessions.length > 0 || options.fallbackProvider === null || !options.fallbackProvider) return parsed;
      const fallback = options.fallbackProvider.scanProject(project, today);
      return {
        ...fallback,
        warnings: [...(parsed.warnings ?? []), ...(fallback.warnings ?? [])],
      };
    },
  };
}
