import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, normalize, relative, sep } from 'node:path';
import type { DB } from '../db/index.js';
import type { KanbanAiSyncResult } from '../domain/types.js';
import { createCliLogScanProvider, type CliLogParserOptions } from './cliLogParser.js';
import { createSqliteFileScanCache } from './logFileScanCache.js';
import { synthesizeProjectKanban } from './kanbanSynthesis.js';
import { discoverProjectsFromRoots } from './projectDiscovery.js';
import { taipeiDate } from './taipeiDate.js';

type ScanScope = 'global' | 'project';
type SkipReason = 'ignored' | 'scan_paused';

export interface ScannableProject {
  id: number;
  name: string;
  root_path: string;
  ignored: boolean;
  scan_paused: boolean;
}

export interface ScanSessionCandidate {
  agent_name: string;
  model: string;
  start_time: string;
  end_time: string | null;
  token_total: number;
  token_input: number;
  token_cached: number;
  token_output: number;
  token_reasoning: number;
  source_log_ref: string;
  command: string | null;
  duration: number | null;
  status: string;
  summary: string | null;
  parser_confidence?: number;
}

export interface ScanKanbanCandidate {
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee_agent_id: string | null;
  source_ref: string;
}

export interface ProjectScanCandidate {
  sessions: ScanSessionCandidate[];
  kanban_cards: ScanKanbanCandidate[];
  daily_summary: string | null;
  warnings?: ScanWarning[];
}

export interface ScanProvider {
  scanProject(project: ScannableProject, today: string): ProjectScanCandidate;
}

export interface ScanWarning {
  agent_name: string;
  kind: string;
  source: string;
  line?: number;
  message: string;
}

export interface ManualScanOptions {
  scope: ScanScope;
  projectId?: number;
  today: string;
  provider?: ScanProvider;
  projectRoots?: string[];
  projectDocFilenames?: string[];
  projectDocFolders?: string[];
}

export type ScanProviderMode = 'cli-logs' | 'mock';
export type ScanFallbackMode = 'mock' | 'none';

export interface ScanProviderPolicy {
  provider: ScanProviderMode;
  fallback: ScanFallbackMode;
}

export interface ScanProviderEnv {
  DEVDIARY_SCAN_PROVIDER?: string;
  DEVDIARY_SCAN_FALLBACK?: string;
  DEVDIARY_DB?: string;
}

export interface SkippedProject {
  project_id: number;
  reason: SkipReason;
}

export interface ManualScanResult {
  status: 'success' | 'failed';
  scope: ScanScope;
  project_id: number | null;
  started_at: string;
  completed_at: string;
  scanned_projects: number[];
  skipped_projects: SkippedProject[];
  inserted_sessions: number;
  inserted_kanban_cards: number;
  updated_kanban_cards: number;
  updated_daily_logs: number;
  ai_sync?: KanbanAiSyncResult;
  warnings: ScanWarning[];
  error_message: string | null;
}

export class ScanNotFoundError extends Error {
  code = 'not_found';
}

function nowIso(): string {
  return new Date().toISOString();
}

function dayOf(iso: string): string {
  return taipeiDate(new Date(iso));
}

function mockProvider(): ScanProvider {
  return {
    scanProject(project, today) {
      const tokenTotal = 1_200 + project.id * 137;
      const tokenInput = Math.round(tokenTotal * 0.45);
      const tokenCached = Math.round(tokenTotal * 0.15);
      const tokenOutput = Math.round(tokenTotal * 0.25);
      const tokenReasoning = tokenTotal - tokenInput - tokenCached - tokenOutput;
      return {
        sessions: [
          {
            agent_name: 'codex-cli',
            model: 'gpt-5-codex',
            start_time: `${today}T12:${String(project.id).padStart(2, '0')}:00Z`,
            end_time: `${today}T12:${String(project.id + 10).padStart(2, '0')}:00Z`,
            token_total: tokenTotal,
            token_input: tokenInput,
            token_cached: tokenCached,
            token_output: tokenOutput,
            token_reasoning: tokenReasoning,
            source_log_ref: `mock-scan://p${project.id}/${today}/session/v1`,
            command: 'manual-scan',
            duration: 600,
            status: 'completed',
            summary: `Manual scan refreshed ${project.name}.`,
          },
        ],
        kanban_cards: [
          {
            title: '確認 CLI log parser 接線',
            description: 'Manual scan 已建立穩定 Core contract；下一步接真實 CLI log parser。',
            status: 'todo',
            assignee_agent_id: 'codex-cli',
            source_ref: `mock-scan://p${project.id}/${today}/kanban/parser-next`,
          },
        ],
        daily_summary: `${project.name} manual scan completed through DevDiary Core.`,
      };
    },
  };
}

function normalizedEnv(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function shouldUseMockFallback(env: ScanProviderEnv): boolean {
  const raw = normalizedEnv(env.DEVDIARY_SCAN_FALLBACK);
  if (['0', 'false', 'no', 'none', 'off', 'disabled'].includes(raw)) return false;
  if (['1', 'true', 'yes', 'mock', 'on', 'enabled'].includes(raw)) return true;
  return !env.DEVDIARY_DB || env.DEVDIARY_DB === ':memory:';
}

export function resolveScanProviderPolicy(env: ScanProviderEnv = process.env): ScanProviderPolicy {
  const provider = normalizedEnv(env.DEVDIARY_SCAN_PROVIDER) === 'mock' ? 'mock' : 'cli-logs';
  return {
    provider,
    fallback: provider === 'mock' || shouldUseMockFallback(env) ? 'mock' : 'none',
  };
}

export function createConfiguredScanProvider(
  env: ScanProviderEnv = process.env,
  parserOptions: CliLogParserOptions = {},
  db?: DB,
): ScanProvider {
  const policy = resolveScanProviderPolicy(env);
  if (policy.provider === 'mock') return mockProvider();
  return createCliLogScanProvider({
    ...parserOptions,
    fileScanCache: parserOptions.fileScanCache ?? (db ? createSqliteFileScanCache(db) : undefined),
    fallbackProvider: policy.fallback === 'mock' ? mockProvider() : null,
  });
}

function defaultProvider(): ScanProvider {
  return createConfiguredScanProvider();
}

function projectRows(db: DB, scope: ScanScope, projectId?: number): ScannableProject[] {
  if (scope === 'project') {
    const row = db
      .prepare(`SELECT id, name, root_path, ignored, scan_paused FROM projects WHERE id = ?`)
      .get(projectId ?? -1) as Record<string, unknown> | undefined;
    if (!row) throw new ScanNotFoundError(`project ${projectId} not found`);
    return [toProject(row)];
  }
  return (db.prepare(`SELECT id, name, root_path, ignored, scan_paused FROM projects ORDER BY id`).all() as Record<string, unknown>[]).map(
    toProject,
  );
}

function toProject(row: Record<string, unknown>): ScannableProject {
  return {
    id: Number(row.id),
    name: String(row.name),
    root_path: String(row.root_path),
    ignored: Boolean(row.ignored),
    scan_paused: Boolean(row.scan_paused),
  };
}

function splitEligible(projects: ScannableProject[]): { eligible: ScannableProject[]; skipped: SkippedProject[] } {
  const eligible: ScannableProject[] = [];
  const skipped: SkippedProject[] = [];
  for (const p of projects) {
    if (p.ignored) {
      skipped.push({ project_id: p.id, reason: 'ignored' });
    } else if (p.scan_paused) {
      skipped.push({ project_id: p.id, reason: 'scan_paused' });
    } else {
      eligible.push(p);
    }
  }
  return { eligible, skipped };
}

function safeProjectDocPath(projectRoot: string, relativePath: string): string | null {
  const raw = relativePath.trim();
  if (raw.startsWith('/')) return null;
  const trimmed = raw;
  if (!trimmed || trimmed.startsWith('/') || trimmed.split('/').includes('..')) return null;
  const root = normalize(projectRoot);
  const candidate = normalize(join(root, trimmed));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

const DOC_SCAN_MAX_BYTES = 512_000;
const DOC_SCAN_CONTENT_BYTES = 80_000;
const DOC_SCAN_MAX_FOLDER_FILES = 120;
const SKIPPED_DOC_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'coverage']);

function logicalProjectDocPath(name: string): string | null {
  const parts = name.replace(/\\/g, '/').split('/');
  if (!name || name.startsWith('/') || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) return null;
  return parts.join('/');
}

function readProjectDoc(name: string, path: string): { name: string; content: string; updated_at: string } | null {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > DOC_SCAN_MAX_BYTES) return null;
  try {
    const content = readFileSync(path, 'utf8').slice(0, DOC_SCAN_CONTENT_BYTES);
    if (content.includes('\0')) return null;
    const logicalName = logicalProjectDocPath(name);
    if (!logicalName) return null;
    return { name: logicalName, content, updated_at: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

function collectFolderDocs(projectRoot: string, folder: string): Array<{ name: string; path: string }> {
  const folderPath = safeProjectDocPath(projectRoot, folder);
  if (!folderPath || !existsSync(folderPath)) return [];
  try {
    if (!statSync(folderPath).isDirectory()) return [];
  } catch {
    return [];
  }
  const root = normalize(projectRoot);
  const out: Array<{ name: string; path: string }> = [];
  const visit = (dir: string) => {
    if (out.length >= DOC_SCAN_MAX_FOLDER_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= DOC_SCAN_MAX_FOLDER_FILES) return;
      if (entry.name.startsWith('.') || SKIPPED_DOC_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        const name = relative(root, path);
        if (!name.startsWith('..') && !name.startsWith('/') && !name.includes(`${sep}..${sep}`)) {
          out.push({ name, path });
        }
      }
    }
  };
  visit(folderPath);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function scanProjectDocs(project: ScannableProject, filenames: string[] = [], folders: string[] = []): Array<{ name: string; content: string; updated_at: string }> {
  const docs: Array<{ name: string; content: string; updated_at: string }> = [];
  const seen = new Set<string>();
  for (const filename of filenames) {
    const path = safeProjectDocPath(project.root_path, filename);
    if (!path || seen.has(path) || !existsSync(path)) continue;
    const doc = readProjectDoc(filename.includes('/') ? filename : basename(filename), path);
    if (doc) {
      docs.push(doc);
      seen.add(path);
    }
  }
  for (const folder of folders) {
    for (const item of collectFolderDocs(project.root_path, folder)) {
      if (seen.has(item.path)) continue;
      const doc = readProjectDoc(item.name, item.path);
      if (doc) {
        docs.push(doc);
        seen.add(item.path);
      }
    }
  }
  return docs;
}

function replaceProjectDocs(db: DB, projectId: number, docs: Array<{ name: string; content: string; updated_at: string }>, timestamp: string): void {
  if (docs.length === 0) return;
  db.prepare(`DELETE FROM project_docs WHERE project_id = ?`).run(projectId);
  const insert = db.prepare(
    `INSERT INTO project_docs (project_id, name, content, updated_at)
     VALUES (?, ?, ?, ?)`,
  );
  for (const doc of docs) {
    insert.run(projectId, doc.name, doc.content, doc.updated_at || timestamp);
  }
}

function upsertSession(db: DB, projectId: number, session: ScanSessionCandidate): { inserted: boolean; tokenDelta: ScanSessionCandidate | null } {
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO sessions (project_id, agent_name, model, start_time, end_time,
         token_total, token_input, token_cached, token_output, token_reasoning,
         summary, source_log_ref, parser_confidence, command, duration, status,
         redacted_log_excerpt, task_count, transcript_length)
       VALUES (@project_id, @agent_name, @model, @start_time, @end_time,
         @token_total, @token_input, @token_cached, @token_output, @token_reasoning,
         @summary, @source_log_ref, @parser_confidence, @command, @duration, @status,
         @redacted_log_excerpt, @task_count, @transcript_length)`,
    )
    .run({
      project_id: projectId,
      ...session,
      parser_confidence: session.parser_confidence ?? 1.0,
      redacted_log_excerpt: session.summary,
      task_count: 1,
      transcript_length: 0,
    });

  if (inserted.changes > 0) return { inserted: true, tokenDelta: session };

  const existing = db
    .prepare(
      `SELECT token_total, token_input, token_cached, token_output, token_reasoning
       FROM sessions WHERE source_log_ref = ? AND project_id = ?`,
    )
    .get(session.source_log_ref, projectId) as
    | { token_total: number; token_input: number; token_cached: number; token_output: number; token_reasoning: number }
    | undefined;
  if (!existing || session.token_total <= existing.token_total) return { inserted: false, tokenDelta: null };

  const delta: ScanSessionCandidate = {
    ...session,
    token_total: session.token_total - existing.token_total,
    token_input: session.token_input - existing.token_input,
    token_cached: session.token_cached - existing.token_cached,
    token_output: session.token_output - existing.token_output,
    token_reasoning: session.token_reasoning - existing.token_reasoning,
  };
  db.prepare(
    `UPDATE sessions
     SET model = ?, end_time = ?, token_total = ?, token_input = ?, token_cached = ?,
         token_output = ?, token_reasoning = ?, parser_confidence = ?, duration = ?,
         redacted_log_excerpt = ?
     WHERE source_log_ref = ? AND project_id = ?`,
  ).run(
    session.model,
    session.end_time,
    session.token_total,
    session.token_input,
    session.token_cached,
    session.token_output,
    session.token_reasoning,
    session.parser_confidence ?? 1.0,
    session.duration,
    session.summary,
    session.source_log_ref,
    projectId,
  );
  return { inserted: false, tokenDelta: delta };
}

function applyTokenUsageDelta(db: DB, projectId: number, session: ScanSessionCandidate): void {
  db.prepare(
    `INSERT INTO token_usage (date, project_id, agent_name, model, token_total,
       token_input, token_cached, token_output, token_reasoning)
     VALUES (@date, @project_id, @agent_name, @model, @token_total,
       @token_input, @token_cached, @token_output, @token_reasoning)
     ON CONFLICT(date, project_id, agent_name, model) DO UPDATE SET
       token_total = token_total + excluded.token_total,
       token_input = token_input + excluded.token_input,
       token_cached = token_cached + excluded.token_cached,
       token_output = token_output + excluded.token_output,
       token_reasoning = token_reasoning + excluded.token_reasoning`,
  ).run({
    date: dayOf(session.start_time),
    project_id: projectId,
    agent_name: session.agent_name,
    model: session.model,
    token_total: session.token_total,
    token_input: session.token_input,
    token_cached: session.token_cached,
    token_output: session.token_output,
    token_reasoning: session.token_reasoning,
  });
}

export function upsertKanbanCandidate(
  db: DB,
  projectId: number,
  card: ScanKanbanCandidate,
  timestamp: string,
): { inserted: boolean; updated: boolean } {
  const existing = db
    .prepare(`SELECT id, status_locked_by_user FROM kanban_cards WHERE project_id = ? AND source_ref = ?`)
    .get(projectId, card.source_ref) as { id: number; status_locked_by_user: number } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO kanban_cards (project_id, title, description, status, assignee_agent_id,
         due_date, source_ref, status_locked_by_user, created_at, updated_at)
       VALUES (@project_id, @title, @description, @status, @assignee_agent_id,
         NULL, @source_ref, 0, @created_at, @updated_at)`,
    ).run({
      project_id: projectId,
      ...card,
      created_at: timestamp,
      updated_at: timestamp,
    });
    return { inserted: true, updated: false };
  }

  db.prepare(
    `UPDATE kanban_cards
     SET title = @title,
         description = @description,
         status = CASE WHEN status_locked_by_user = 1 THEN status ELSE @status END,
         assignee_agent_id = @assignee_agent_id,
         updated_at = @updated_at
     WHERE id = @id AND project_id = @project_id`,
  ).run({
    id: existing.id,
    project_id: projectId,
    title: card.title,
    description: card.description,
    status: card.status,
    assignee_agent_id: card.assignee_agent_id,
    updated_at: timestamp,
  });
  return { inserted: false, updated: true };
}

export function runManualScan(db: DB, opts: ManualScanOptions): ManualScanResult {
  const startedAt = nowIso();
  const provider = opts.provider ?? defaultProvider();
  if (opts.scope === 'global' && opts.projectRoots?.length) {
    discoverProjectsFromRoots(db, opts.projectRoots, { now: startedAt });
  }
  const projects = projectRows(db, opts.scope, opts.projectId);
  const { eligible, skipped } = splitEligible(projects);

  const base: Omit<ManualScanResult, 'status' | 'completed_at' | 'error_message'> = {
    scope: opts.scope,
    project_id: opts.scope === 'project' ? opts.projectId ?? null : null,
    started_at: startedAt,
    scanned_projects: [],
    skipped_projects: skipped,
    inserted_sessions: 0,
    inserted_kanban_cards: 0,
    updated_kanban_cards: 0,
    updated_daily_logs: 0,
    warnings: [],
  };

  try {
    const run = db.transaction(() => {
      const result = { ...base, scanned_projects: [] as number[] };
      for (const project of eligible) {
        const scanned = provider.scanProject(project, opts.today);
        replaceProjectDocs(db, project.id, scanProjectDocs(project, opts.projectDocFilenames, opts.projectDocFolders), startedAt);
        result.warnings.push(...(scanned.warnings ?? []));
        result.scanned_projects.push(project.id);
        for (const session of scanned.sessions) {
          const upsert = upsertSession(db, project.id, session);
          if (upsert.inserted) result.inserted_sessions++;
          if (!upsert.tokenDelta) continue;
          applyTokenUsageDelta(db, project.id, upsert.tokenDelta);
          db.prepare(`UPDATE projects SET last_activity_at = ? WHERE id = ?`).run(session.start_time, project.id);
        }

        const shouldSynthesize = scanned.sessions.length > 0 || scanned.kanban_cards.length > 0 || Boolean(scanned.daily_summary);
        const synthesizedCards = shouldSynthesize ? synthesizeProjectKanban(db, project.id, opts.today) : [];
        for (const card of [...scanned.kanban_cards, ...synthesizedCards]) {
          const upsert = upsertKanbanCandidate(db, project.id, card, `${opts.today}T20:30:00Z`);
          if (upsert.inserted) result.inserted_kanban_cards++;
          if (upsert.updated) result.updated_kanban_cards++;
        }

        // Scan-derived text may contribute to Kanban synthesis above, but the
        // scheduler is the sole owner of the global daily_logs projection.
      }
      return result;
    });
    const result = run();
    return {
      ...result,
      status: 'success',
      completed_at: nowIso(),
      error_message: null,
    };
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      completed_at: nowIso(),
      error_message: err instanceof Error ? err.message : String(err),
    };
  }
}
