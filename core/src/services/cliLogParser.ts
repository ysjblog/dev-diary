import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { CanonicalAgentId } from '../domain/types.js';
import { createInMemoryFileScanCache, type FileScanCache } from './logFileScanCache.js';
import type { ProjectScanCandidate, ScanProvider, ScanSessionCandidate, ScannableProject } from './scans.js';

export type ParserWarningKind = 'malformed_jsonl' | 'unreadable_file' | 'missing_root' | 'unreadable_root' | 'invalid_data_root_layout' | 'symlink_escape' | 'symlink_cycle';

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
  dataRoots?: Partial<Record<CanonicalAgentId, string[]>>;
  fileScanCache?: FileScanCache;
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

interface AntigravityLogEntry {
  workspaceDirsAll: string[];
  model: string;
  conversationId: string;
  firstTime: string;
  lastTime: string | null;
  completedTime: string | null;
}

interface SharedAntigravityIndex {
  entries: AntigravityLogEntry[];
  roots: string[];
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

interface ClaudeFileSessionEntry {
  sessionId: string;
  cwd: string | null;
  model: string;
  start_time: string | null;
  end_time: string | null;
  token_input: number;
  token_cached: number;
  token_output: number;
  token_reasoning: number;
  hasUsage: boolean;
}

interface ScannedFile {
  path: string;
  mtimeMs: number;
}

// DevDiary is a records-first app: history must stay scannable no matter how
// old it is, so this is a defensive ceiling, not a real cap. Actual scan cost
// is bounded by the per-file cache (opts.fileScanCache), not this number.
const DEFAULT_MAX_FILES = Number.MAX_SAFE_INTEGER;

export function escapeClaudeProjectPath(projectPath: string): string {
  return projectPath.replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9.-]/g, '-');
}

export function legacyEscapeClaudeProjectPath(projectPath: string): string {
  return projectPath.replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-');
}

export function claudeProjectEncodingVariants(projectPath: string): Array<{ name: string; variant: 'current' | 'legacy' }> {
  const values = [
    { name: escapeClaudeProjectPath(projectPath), variant: 'current' as const },
    { name: legacyEscapeClaudeProjectPath(projectPath), variant: 'legacy' as const },
  ];
  return values.filter((value, index) => values.findIndex((other) => other.name === value.name) === index);
}

function dataRoots(opts: Required<CliLogParserOptions>, id: CanonicalAgentId): string[] {
  const configured = opts.dataRoots?.[id];
  if (configured?.length) return configured;
  if (id === 'claude-code') return [join(opts.homeDir, '.claude')];
  if (id === 'codex-cli') return [join(opts.homeDir, '.codex')];
  return [join(opts.homeDir, '.gemini', 'antigravity-cli')];
}

function usableDataRoots(opts: Required<CliLogParserOptions>, id: CanonicalAgentId, warnings: ParserWarning[]): string[] {
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const configured of dataRoots(opts, id)) {
    const leaf = basename(configured);
    const invalidLeaf = id === 'claude-code' ? leaf === 'projects' : id === 'codex-cli' ? leaf === 'sessions' || leaf === 'archived_sessions' : leaf === 'log' || leaf === 'brain';
    if (invalidLeaf) {
      warnings.push({ agent_name: id, kind: 'invalid_data_root_layout', source: `${id}:${leaf}`, message: 'Expected a product data root, not a derived scan folder.' });
      continue;
    }
    if (!existsSync(configured)) {
      warnings.push({ agent_name: id, kind: 'missing_root', source: `${id}:${leaf}`, message: 'Configured activity data root does not exist.' });
      continue;
    }
    try {
      const realPath = realpathSync(configured);
      accessSync(realPath, constants.R_OK);
      if (!statSync(realPath).isDirectory()) throw new Error('not directory');
      if (!seen.has(realPath)) {
        seen.add(realPath);
        valid.push(realPath);
      }
    } catch {
      warnings.push({ agent_name: id, kind: 'unreadable_root', source: `${id}:${leaf}`, message: 'Configured activity data root is not readable.' });
    }
  }
  return valid;
}

function claudeProjectDirs(opts: Required<CliLogParserOptions>, projectPath: string, warnings: ParserWarning[]): string[] {
  return usableDataRoots(opts, 'claude-code', warnings).flatMap((root) => claudeProjectEncodingVariants(projectPath).map(({ name }) => join(root, 'projects', name)));
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

function sortedJsonlFiles(dir: string, maxFiles: number, warnings?: ParserWarning[], agentName?: ParserWarning['agent_name']): ScannedFile[] {
  if (!existsSync(dir)) return [];
  const out: ScannedFile[] = [];
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
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        warnings?.push({ agent_name: agentName ?? 'codex-cli', kind: 'symlink_escape', source: `${agentName ?? 'agent'}:${basename(path)}`, message: 'Skipped symbolic link while scanning activity logs.' });
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
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path)).slice(0, maxFiles);
}

function sortedLogFiles(dir: string, maxFiles: number, warnings?: ParserWarning[], agentName?: ParserWarning['agent_name']): ScannedFile[] {
  if (!existsSync(dir)) return [];
  const out: ScannedFile[] = [];
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
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      warnings?.push({ agent_name: agentName ?? 'antigravity-cli', kind: 'symlink_escape', source: `${agentName ?? 'agent'}:${basename(path)}`, message: 'Skipped symbolic link while scanning activity logs.' });
    } else if (stat.isFile() && path.endsWith('.log')) out.push({ path, mtimeMs: stat.mtimeMs });
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

function extractClaudeFileSessions(file: string, warnings: ParserWarning[]): ClaudeFileSessionEntry[] {
  const sessions = new Map<string, ClaudeFileSessionEntry>();
  for (const row of readJsonl(file, 'claude-code', warnings)) {
    const sessionId = stringValue(row.sessionId) ?? stableId(file);
    let entry = sessions.get(sessionId);
    if (!entry) {
      entry = { sessionId, cwd: null, model: 'unknown', start_time: null, end_time: null, token_input: 0, token_cached: 0, token_output: 0, token_reasoning: 0, hasUsage: false };
      sessions.set(sessionId, entry);
    }

    const cwd = stringValue(row.cwd);
    if (cwd) entry.cwd = cwd;
    const ts = stringValue(row.timestamp);
    if (ts && !Number.isNaN(Date.parse(ts))) {
      if (!entry.start_time || ts < entry.start_time) entry.start_time = ts;
      if (!entry.end_time || ts > entry.end_time) entry.end_time = ts;
    }

    const message = isObject(row.message) ? row.message : null;
    const usage = message && isObject(message.usage) ? message.usage : null;
    const model = message ? stringValue(message.model) : null;
    if (model) entry.model = model;
    if (!usage) continue;

    entry.hasUsage = true;
    entry.token_input += numberValue(usage.input_tokens);
    entry.token_cached += numberValue(usage.cache_creation_input_tokens) + numberValue(usage.cache_read_input_tokens);
    entry.token_output += numberValue(usage.output_tokens);
    entry.token_reasoning += numberValue(usage.reasoning_tokens);
  }
  return Array.from(sessions.values());
}

function claudeFileSessions(file: ScannedFile, opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): ClaudeFileSessionEntry[] {
  const cached = opts.fileScanCache.get('claude-code', file.path, file.mtimeMs);
  if (cached) return cached.payload as ClaudeFileSessionEntry[];
  const entries = extractClaudeFileSessions(file.path, warnings);
  opts.fileScanCache.set('claude-code', file.path, file.mtimeMs, entries);
  return entries;
}

function parseClaude(project: ScannableProject, opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): ScanSessionCandidate[] {
  const files = claudeProjectDirs(opts, project.root_path, warnings).flatMap((projectDir) => sortedJsonlFiles(projectDir, opts.maxFilesPerProject, warnings, 'claude-code'));
  const sessions = new Map<string, SessionAccumulator>();

  for (const file of files) {
    for (const entry of claudeFileSessions(file, opts, warnings)) {
      if (entry.cwd && entry.cwd !== project.root_path) continue;
      let acc = sessions.get(entry.sessionId);
      if (!acc) {
        acc = {
          agent_name: 'claude-code',
          sessionId: entry.sessionId,
          source_log_ref: `claude-code://${safeSourceToken(entry.sessionId)}`,
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
        sessions.set(entry.sessionId, acc);
      }
      if (entry.start_time && (!acc.start_time || entry.start_time < acc.start_time)) acc.start_time = entry.start_time;
      if (entry.end_time && (!acc.end_time || entry.end_time > acc.end_time)) acc.end_time = entry.end_time;
      if (entry.model !== 'unknown') acc.model = entry.model;
      if (!entry.hasUsage) continue;

      acc.hasUsage = true;
      acc.token_input += entry.token_input;
      acc.token_cached += entry.token_cached;
      acc.token_output += entry.token_output;
      acc.token_reasoning += entry.token_reasoning;
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

interface CodexFileResult {
  cwd: string;
  candidate: ScanSessionCandidate;
}

function parseCodexFile(file: string, warnings: ParserWarning[]): CodexFileResult | null {
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

  if (!cwd || !startTime) return null;
  const stableSessionId = sessionId ?? stableId(file);
  acc.sessionId = stableSessionId;
  acc.source_log_ref = `codex-cli://${safeSourceToken(stableSessionId)}`;
  acc.model = model;
  acc.start_time = startTime;
  acc.end_time = endTime ?? startTime;
  acc.parser_confidence = acc.hasUsage ? 0.85 : 0.55;
  const candidate = toCandidate(acc);
  return candidate ? { cwd, candidate } : null;
}

function codexFileResult(file: ScannedFile, opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): CodexFileResult | null {
  const cached = opts.fileScanCache.get('codex-cli', file.path, file.mtimeMs);
  if (cached) return cached.payload as CodexFileResult | null;
  const result = parseCodexFile(file.path, warnings);
  opts.fileScanCache.set('codex-cli', file.path, file.mtimeMs, result);
  return result;
}

function parseCodexIndex(opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): Map<string, ScanSessionCandidate[]> {
  const roots = usableDataRoots(opts, 'codex-cli', warnings).flatMap((root) => [join(root, 'sessions'), join(root, 'archived_sessions')]);
  const files = roots.flatMap((root) => sortedJsonlFiles(root, opts.maxFilesPerProject, warnings, 'codex-cli'));
  const sessionsByProject = new Map<string, ScanSessionCandidate[]>();

  for (const file of files) {
    const result = codexFileResult(file, opts, warnings);
    if (!result) continue;
    const projectSessions = sessionsByProject.get(result.cwd) ?? [];
    projectSessions.push(result.candidate);
    sessionsByProject.set(result.cwd, projectSessions);
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

function transcriptTimes(opts: Required<CliLogParserOptions>, roots: string[], conversationId: string, warnings: ParserWarning[]): { start: string | null; end: string | null; exists: boolean } {
  const transcript = roots.map((root) => join(root, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl')).find(existsSync);
  if (!transcript) return { start: null, end: null, exists: false };
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

function parseAntigravityFile(file: string, warnings: ParserWarning[]): AntigravityLogEntry | null {
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
    return null;
  }

  const workspaceDirsAll: string[] = [];
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
    if (workspace) workspaceDirsAll.push(workspace);

    const printModel = line.match(/Print mode: starting .*model="([^"]+)"/)?.[1];
    if (printModel) model = printModel;

    const created = line.match(/Created conversation ([A-Za-z0-9._-]+)/)?.[1];
    const streamed = line.match(/Print mode: conversation=([A-Za-z0-9._-]+)/)?.[1];
    if (created || streamed) conversationId = created ?? streamed ?? conversationId;

    if (conversationId && line.includes(`Stream completed for ${conversationId}`) && ts) completedTime = ts;
  }

  if (!conversationId || !firstTime) return null;
  return { workspaceDirsAll, model, conversationId, firstTime, lastTime, completedTime };
}

function antigravityFileEntry(file: ScannedFile, opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): AntigravityLogEntry | null {
  const cached = opts.fileScanCache.get('antigravity-cli', file.path, file.mtimeMs);
  if (cached) return cached.payload as AntigravityLogEntry | null;
  const entry = parseAntigravityFile(file.path, warnings);
  opts.fileScanCache.set('antigravity-cli', file.path, file.mtimeMs, entry);
  return entry;
}

function parseAntigravityIndex(opts: Required<CliLogParserOptions>, warnings: ParserWarning[]): { entries: AntigravityLogEntry[]; roots: string[] } {
  const roots = usableDataRoots(opts, 'antigravity-cli', warnings);
  const files = roots.flatMap((root) => sortedLogFiles(join(root, 'log'), opts.maxFilesPerProject, warnings, 'antigravity-cli'));
  const entries: AntigravityLogEntry[] = [];

  for (const file of files) {
    const entry = antigravityFileEntry(file, opts, warnings);
    if (entry) entries.push(entry);
  }

  return { entries, roots };
}

function parseAntigravity(
  project: ScannableProject,
  opts: Required<CliLogParserOptions>,
  warnings: ParserWarning[],
  sharedIndex?: SharedAntigravityIndex,
): ScanSessionCandidate[] {
  const { entries, roots } = sharedIndex ?? parseAntigravityIndex(opts, warnings);
  if (sharedIndex && !sharedIndex.warningsReported) {
    warnings.push(...sharedIndex.warnings);
    sharedIndex.warningsReported = true;
  }

  const sessions: ScanSessionCandidate[] = [];
  for (const entry of entries) {
    if (!entry.workspaceDirsAll.some((workspace) => workspace.includes(project.root_path))) continue;

    const conversationId = entry.conversationId;
    const transcript = transcriptTimes(opts, roots, conversationId, warnings);
    const startTime = transcript.start ?? entry.firstTime;
    const endTime = transcript.end ?? entry.completedTime ?? entry.lastTime ?? startTime;
    const candidate: ScanSessionCandidate = {
      agent_name: 'antigravity-cli',
      model: entry.model,
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
    dataRoots: options.dataRoots ?? {},
    fileScanCache: options.fileScanCache ?? createInMemoryFileScanCache(),
  };
}

function parseProjectCliLogsWithIndex(
  project: ScannableProject,
  options: CliLogParserOptions = {},
  sharedCodexIndex?: SharedCodexIndex,
  sharedAntigravityIndex?: SharedAntigravityIndex,
): ParsedProjectScanCandidate {
  const opts: Required<CliLogParserOptions> = {
    ...normalizedOptions(options),
  };
  const warnings: ParserWarning[] = [];
  const sessions = [
    ...parseClaude(project, opts, warnings),
    ...parseCodex(project, opts, warnings, sharedCodexIndex),
    ...parseAntigravity(project, opts, warnings, sharedAntigravityIndex),
  ].sort((a, b) => a.start_time.localeCompare(b.start_time));

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
  let sharedAntigravityIndex: SharedAntigravityIndex | null = null;
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
  const getSharedAntigravityIndex = (): SharedAntigravityIndex => {
    if (!sharedAntigravityIndex) {
      const warnings: ParserWarning[] = [];
      const { entries, roots } = parseAntigravityIndex(normalizedOptions(options), warnings);
      sharedAntigravityIndex = { entries, roots, warnings, warningsReported: false };
    }
    return sharedAntigravityIndex;
  };
  return {
    scanProject(project, today) {
      const parsed = parseProjectCliLogsWithIndex(project, options, getSharedCodexIndex(), getSharedAntigravityIndex());
      if (parsed.sessions.length > 0 || options.fallbackProvider === null || !options.fallbackProvider) return parsed;
      const fallback = options.fallbackProvider.scanProject(project, today);
      return {
        ...fallback,
        warnings: [...(parsed.warnings ?? []), ...(fallback.warnings ?? [])],
      };
    },
  };
}
