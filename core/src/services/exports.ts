import type { DB } from '../db/index.js';
import { SCHEMA_VERSION } from '../db/schema.js';

export class ExportValidationError extends Error {
  code = 'invalid_export_request';
}

export interface DailyMarkdownExportOptions {
  date: string;
  includeComments: boolean;
  redactSensitiveValues: boolean;
}

export interface ExportArtifact {
  filename: string;
  content: string;
}

export interface BackupExportOptions {
  includeComments: boolean;
  redactSensitiveValues: boolean;
}

export interface RedactedBackupBundle {
  metadata: {
    kind: 'devdiary-redacted-backup';
    exported_at: string;
    schema_version: number;
  };
  projects: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  token_usage: Array<Record<string, unknown>>;
  daily_logs: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  project_docs: Array<Record<string, unknown>>;
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(sk-[A-Za-z0-9_-]{10,})\b/g,
  /\b(gh[pousr]_[A-Za-z0-9_]{10,})\b/g,
  /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  /\b((?:api[_-]?key|password|passwd|token|secret|private[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(source_log_ref\s*[:=]\s*)[^\s,;]+/gi,
];

function fail(message: string): never {
  throw new ExportValidationError(message);
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('date must be YYYY-MM-DD');
}

function safeJsonMap(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
    );
  } catch {
    return {};
  }
}

function redact(value: unknown, enabled: boolean): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let out = value;
    for (const pattern of SECRET_PATTERNS) {
      out = out.replace(pattern, (match, prefix) => (typeof prefix === 'string' && prefix !== match ? `${prefix}[REDACTED]` : '[REDACTED]'));
    }
    return enabled ? out : out;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, enabled));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redact(item, enabled)]));
  }
  return value;
}

function rows<T extends Record<string, unknown>>(db: DB, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

function row<T extends Record<string, unknown>>(db: DB, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function formatNumber(value: unknown): string {
  return Number(value ?? 0).toLocaleString('en-US');
}

function line(value: unknown, fallback = '_No data._'): string {
  const text = String(value ?? '').trim();
  return text ? text : fallback;
}

export function buildDailyMarkdownExport(db: DB, opts: DailyMarkdownExportOptions): ExportArtifact {
  assertDate(opts.date);
  const daily = row<{
    date: string;
    global_summary_ai: string | null;
    global_summary_user: string | null;
    per_project_summary: string | null;
    fallback_report: string | null;
  }>(
    db,
    `SELECT date, global_summary_ai, global_summary_user, per_project_summary, fallback_report
     FROM daily_logs
     WHERE date = ?`,
    opts.date,
  );
  const projects = rows<{ id: number; name: string }>(db, `SELECT id, name FROM projects WHERE ignored = 0 ORDER BY id`);
  const projectSummaries = rows<{ project_id: number; markdown_user: string | null; markdown_ai: string | null }>(
    db,
    `SELECT project_id, markdown_user, markdown_ai FROM project_summaries`,
  );
  const projectSummaryById = new Map(projectSummaries.map((item) => [Number(item.project_id), item]));
  const perProject = safeJsonMap(daily?.per_project_summary);
  const tokenTotals = row<{ token_total: number; session_count: number }>(
    db,
    `SELECT COALESCE(SUM(token_total), 0) AS token_total,
       (SELECT COUNT(*) FROM sessions WHERE substr(start_time, 1, 10) = ?) AS session_count
     FROM token_usage
     WHERE date = ?`,
    opts.date,
    opts.date,
  ) ?? { token_total: 0, session_count: 0 };
  const byAgent = rows<{ agent_name: string; token_total: number }>(
    db,
    `SELECT agent_name, SUM(token_total) AS token_total
     FROM token_usage
     WHERE date = ?
     GROUP BY agent_name
     ORDER BY token_total DESC, agent_name ASC`,
    opts.date,
  );
  const sessions = rows<{
    start_time: string;
    agent_name: string;
    model: string;
    token_total: number;
    status: string;
  }>(
    db,
    `SELECT start_time, agent_name, model, token_total, status
     FROM sessions
     WHERE substr(start_time, 1, 10) = ?
     ORDER BY start_time ASC, id ASC`,
    opts.date,
  );
  const comments = opts.includeComments
    ? rows<{ project_name: string; content: string; created_at: string }>(
        db,
        `SELECT p.name AS project_name, c.content, c.created_at
         FROM comments c
         JOIN projects p ON p.id = c.project_id
         WHERE substr(c.created_at, 1, 10) = ?
         ORDER BY c.created_at ASC, c.id ASC`,
        opts.date,
      )
    : [];

  const parts: string[] = [];
  const globalSummary = daily?.global_summary_user ?? daily?.global_summary_ai ?? daily?.fallback_report ?? '';
  parts.push(`# DevDiary Daily Export - ${opts.date}`);
  parts.push('');
  parts.push('## Global Summary');
  parts.push(line(redact(globalSummary, opts.redactSensitiveValues)));
  parts.push('');
  parts.push('## Projects');
  for (const project of projects) {
    const summary = projectSummaryById.get(Number(project.id));
    const content = summary?.markdown_user ?? summary?.markdown_ai ?? perProject[String(project.id)] ?? daily?.fallback_report ?? '';
    parts.push(`### ${redact(project.name, opts.redactSensitiveValues)}`);
    parts.push(line(redact(content, opts.redactSensitiveValues)));
    parts.push('');
  }
  parts.push('## Token Summary');
  parts.push(`- Total tokens: ${formatNumber(tokenTotals.token_total)}`);
  parts.push(`- Sessions: ${formatNumber(tokenTotals.session_count)}`);
  parts.push('- By agent:');
  if (byAgent.length === 0) {
    parts.push('  - No agent token usage for this date.');
  } else {
    for (const item of byAgent) {
      parts.push(`  - ${redact(item.agent_name, opts.redactSensitiveValues)}: ${formatNumber(item.token_total)}`);
    }
  }
  parts.push('');
  parts.push('## Sessions');
  if (sessions.length === 0) {
    parts.push('- No sessions for this date.');
  } else {
    for (const session of sessions) {
      parts.push(
        `- ${session.start_time} ${redact(session.agent_name, opts.redactSensitiveValues)} ${redact(session.model, opts.redactSensitiveValues)} ${formatNumber(session.token_total)} ${redact(session.status, opts.redactSensitiveValues)}`,
      );
    }
  }
  if (opts.includeComments) {
    parts.push('');
    parts.push('## Comments');
    if (comments.length === 0) {
      parts.push('- No comments for this date.');
    } else {
      for (const comment of comments) {
        parts.push(`- ${comment.created_at} ${redact(comment.project_name, opts.redactSensitiveValues)}: ${redact(comment.content, opts.redactSensitiveValues)}`);
      }
    }
  }
  parts.push('');

  return {
    filename: `devdiary-daily-${opts.date}.md`,
    content: parts.join('\n'),
  };
}

export function buildRedactedBackupExport(db: DB, opts: BackupExportOptions): RedactedBackupBundle {
  const bundle: RedactedBackupBundle = {
    metadata: {
      kind: 'devdiary-redacted-backup',
      exported_at: new Date().toISOString(),
      schema_version: Number(SCHEMA_VERSION),
    },
    projects: rows(
      db,
      `SELECT id, name, root_path, tracking_status, created_at, last_activity_at,
        detected_agents, ignored, scan_paused, git_repo_detected, git_branch, git_worktree_count
       FROM projects
       ORDER BY id ASC`,
    ),
    sessions: rows(
      db,
      `SELECT id, project_id, agent_name, model, start_time, end_time,
        token_total, token_input, token_cached, token_output, token_reasoning,
        summary, parser_confidence, command, duration, status,
        redacted_log_excerpt, task_count, transcript_length
       FROM sessions
       ORDER BY start_time ASC, id ASC`,
    ),
    token_usage: rows(
      db,
      `SELECT date, project_id, agent_name, model, token_total, token_input,
        token_cached, token_output, token_reasoning
       FROM token_usage
       ORDER BY date ASC, project_id ASC, agent_name ASC, model ASC`,
    ),
    daily_logs: rows(
      db,
      `SELECT date, global_summary_ai, global_summary_user, per_project_summary,
        blockers, warnings, fallback_report, summary_status
       FROM daily_logs
       ORDER BY date ASC`,
    ),
    comments: opts.includeComments
      ? rows(db, `SELECT id, project_id, content, tags, pinned, created_at, updated_at FROM comments ORDER BY created_at ASC, id ASC`)
      : [],
    project_docs: rows(db, `SELECT id, project_id, name, content, updated_at FROM project_docs ORDER BY project_id ASC, id ASC`),
  };
  return redact(bundle, opts.redactSensitiveValues) as RedactedBackupBundle;
}
