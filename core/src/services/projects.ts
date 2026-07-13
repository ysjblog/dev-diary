import type { DB } from '../db/index.js';
import { addDays, resolveRange, type ResolvedRange } from '../domain/dateRange.js';
import { normalizeAgentId, agentDisplayName } from '../domain/agents.js';
import type {
  CanonicalAgentId,
  KanbanStatus,
  KanbanCard,
  ProjectListItem,
  ProjectDetailSnapshot,
  ProjectMetricStrip,
  ProjectTokenRow,
  ProjectTokenDetail,
  ProjectTokenBreakdownItem,
  ProjectDiaryEntry,
  ProjectComment,
  ProjectSummarySource,
  ProjectSessionView,
  ProjectDoc,
  RangeKey,
  TrackingStatus,
  WorkspaceTrackingStatus,
} from '../domain/types.js';
import { getGitStatusSnapshot } from './gitStatus.js';

const AGENT_ORDER: CanonicalAgentId[] = ['claude-code', 'codex-cli', 'antigravity-cli'];
const ACTIVE_SESSION_WINDOW_DAYS = 5;

export interface ProjectDetailQuery {
  range?: RangeKey;
  customStart?: string | null;
  customEnd?: string | null;
}

/** Bucket a raw agent name into a canonical id or `other`. */
function bucket(agentName: string): CanonicalAgentId | 'other' {
  return normalizeAgentId(agentName) ?? 'other';
}

function displayName(id: CanonicalAgentId | 'other'): string {
  return id === 'other' ? '其他' : agentDisplayName(id);
}

function parseAgents(json: unknown): CanonicalAgentId[] {
  try {
    const v = JSON.parse(String(json ?? '[]'));
    return Array.isArray(v) ? (v as CanonicalAgentId[]) : [];
  } catch {
    return [];
  }
}

function mergeAgents(...sources: unknown[]): CanonicalAgentId[] {
  const seen = new Set<CanonicalAgentId>();
  for (const source of sources) {
    const values = typeof source === 'string' && source.trim().startsWith('[') ? parseAgents(source) : String(source ?? '').split(',');
    for (const value of values) {
      const id = normalizeAgentId(String(value).trim());
      if (id) seen.add(id);
    }
  }
  return AGENT_ORDER.filter((id) => seen.has(id));
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function deriveTrackingStatus(latestSessionDate: string | null, today: string): WorkspaceTrackingStatus {
  const activeSince = addDays(today, -(ACTIVE_SESSION_WINDOW_DAYS - 1));
  return latestSessionDate && latestSessionDate >= activeSince ? 'active' : 'idle';
}

/** Workspace project list (spec §11 left rail). Excludes ignored projects. */
export function getProjectList(db: DB, today = todayUTC()): ProjectListItem[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.root_path, p.tracking_status, p.last_activity_at,
              p.detected_agents, p.git_branch,
              (SELECT GROUP_CONCAT(DISTINCT s.agent_name) FROM sessions s WHERE s.project_id = p.id) AS session_agents,
              (SELECT MAX(substr(s.start_time,1,10)) FROM sessions s WHERE s.project_id = p.id) AS latest_session_date,
              (SELECT COUNT(DISTINCT substr(s.start_time,1,10)) FROM sessions s WHERE s.project_id = p.id) AS logs_count,
              (SELECT COALESCE(SUM(s.token_total),0) FROM sessions s WHERE s.project_id = p.id) AS token_total
       FROM projects p
       WHERE p.ignored = 0
       ORDER BY p.last_activity_at DESC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    root_path: String(r.root_path),
    tracking_status: deriveTrackingStatus((r.latest_session_date as string | null) ?? null, today),
    last_activity_at: (r.last_activity_at as string | null) ?? null,
    detected_agents: mergeAgents(r.detected_agents, r.session_agents),
    git_branch: (r.git_branch as string | null) ?? null,
    logs_count: Number(r.logs_count),
    token_total: Number(r.token_total),
  }));
}

function projectTokenSince(db: DB, projectId: number, sinceDate: string | null): number {
  if (sinceDate === null) {
    const row = db
      .prepare(`SELECT COALESCE(SUM(token_total),0) AS t FROM sessions WHERE project_id = ?`)
      .get(projectId) as { t: number };
    return row.t;
  }
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(token_total),0) AS t FROM sessions
       WHERE project_id = ? AND substr(start_time,1,10) >= ?`,
    )
    .get(projectId, sinceDate) as { t: number };
  return row.t;
}

function rangeDateClause(expr: string, resolved: ResolvedRange): { sql: string; params: string[] } {
  if (!resolved.start_date || !resolved.end_date) return { sql: '', params: [] };
  return { sql: ` AND ${expr} BETWEEN ? AND ?`, params: [resolved.start_date, resolved.end_date] };
}

function projectTokenInRange(db: DB, projectId: number, resolved: ResolvedRange): number {
  const clause = rangeDateClause('substr(start_time,1,10)', resolved);
  const row = db
    .prepare(`SELECT COALESCE(SUM(token_total),0) AS t FROM sessions WHERE project_id = ?${clause.sql}`)
    .get(projectId, ...clause.params) as { t: number };
  return row.t;
}

function projectSessionCountInRange(db: DB, projectId: number, resolved: ResolvedRange): number {
  const clause = rangeDateClause('substr(start_time,1,10)', resolved);
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = ?${clause.sql}`)
    .get(projectId, ...clause.params) as { c: number };
  return row.c;
}

function buildMetricStrip(db: DB, projectId: number, today: string, resolved: ResolvedRange): ProjectMetricStrip {
  const sessionCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = ?`).get(projectId) as { c: number }
  ).c;
  // Latest daily log overall drives the AI summary status indicator (spec §11 strip).
  const latestLog = db
    .prepare(`SELECT summary_status FROM daily_logs ORDER BY date DESC LIMIT 1`)
    .get() as { summary_status: string } | undefined;
  return {
    token_today: projectTokenSince(db, projectId, today),
    token_week: projectTokenSince(db, projectId, addDays(today, -6)),
    token_month: projectTokenSince(db, projectId, addDays(today, -29)),
    token_all: projectTokenSince(db, projectId, null),
    range_token_total: projectTokenInRange(db, projectId, resolved),
    range_session_count: projectSessionCountInRange(db, projectId, resolved),
    session_count: sessionCount,
    summary_status: latestLog?.summary_status ?? 'pending',
  };
}

function buildKanban(db: DB, projectId: number): KanbanCard[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, title, description, status, assignee_agent_id, due_date,
              source_ref, status_locked_by_user, created_at, updated_at
       FROM kanban_cards WHERE project_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    title: String(r.title),
    description: String(r.description ?? ''),
    status: String(r.status) as KanbanStatus,
    assignee_agent_id: (r.assignee_agent_id as CanonicalAgentId | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    source_ref: (r.source_ref as string | null) ?? null,
    status_locked_by_user: Boolean(r.status_locked_by_user),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

function buildTokenDetail(db: DB, projectId: number, resolved: ResolvedRange): ProjectTokenDetail {
  // One row per (date, agent), summing models. Cost is intentionally absent (v1 Non-Goal).
  const dateClause = rangeDateClause('date', resolved);
  const rows = db
    .prepare(
      `SELECT date, agent_name,
              SUM(token_input) AS token_input,
              SUM(token_output) AS token_output,
              SUM(token_total) AS token_total
       FROM token_usage WHERE project_id = ?
       ${dateClause.sql}
       GROUP BY date, agent_name
       ORDER BY date DESC, agent_name ASC`,
    )
    .all(projectId, ...dateClause.params) as {
    date: string;
    agent_name: string;
    token_input: number;
    token_output: number;
    token_total: number;
  }[];

  const detailRows: ProjectTokenRow[] = rows.map((r) => {
    const id = bucket(r.agent_name);
    return {
      id: `${r.date}-${id}`,
      date: r.date,
      agent_id: id,
      agent_name: displayName(id),
      token_input: r.token_input,
      token_output: r.token_output,
      token_total: r.token_total,
    };
  });

  const byAgentMap = new Map<string, number>();
  for (const r of detailRows) {
    byAgentMap.set(r.agent_name, (byAgentMap.get(r.agent_name) ?? 0) + r.token_total);
  }
  const by_agent: ProjectTokenBreakdownItem[] = [...byAgentMap.entries()]
    .map(([key, token_total]) => ({ key, token_total }))
    .sort((a, b) => b.token_total - a.token_total);

  const modelRows = db
    .prepare(
      `SELECT model, SUM(token_total) AS token_total FROM token_usage
       WHERE project_id = ?${dateClause.sql} GROUP BY model ORDER BY token_total DESC`,
    )
    .all(projectId, ...dateClause.params) as { model: string; token_total: number }[];
  const by_model: ProjectTokenBreakdownItem[] = modelRows.map((r) => ({ key: r.model, token_total: r.token_total }));

  return { rows: detailRows, by_agent, by_model };
}

interface DayAgg {
  date: string;
  sessions: number;
  tokens: number;
  topAgent: CanonicalAgentId | 'other';
}

function dayAggregates(db: DB, projectId: number, resolved: ResolvedRange): DayAgg[] {
  const clause = rangeDateClause('substr(start_time,1,10)', resolved);
  const rows = db
    .prepare(
      `SELECT substr(start_time,1,10) AS date, agent_name, COUNT(*) AS sessions, SUM(token_total) AS tokens
       FROM sessions WHERE project_id = ?${clause.sql}
       GROUP BY date, agent_name`,
    )
    .all(projectId, ...clause.params) as { date: string; agent_name: string; sessions: number; tokens: number }[];
  const byDate = new Map<string, { sessions: number; tokens: number; perAgent: Map<string, number> }>();
  for (const r of rows) {
    let e = byDate.get(r.date);
    if (!e) {
      e = { sessions: 0, tokens: 0, perAgent: new Map() };
      byDate.set(r.date, e);
    }
    e.sessions += r.sessions;
    e.tokens += r.tokens;
    e.perAgent.set(r.agent_name, (e.perAgent.get(r.agent_name) ?? 0) + r.tokens);
  }
  const out: DayAgg[] = [];
  for (const [date, e] of byDate) {
    let topName = '';
    let topVal = -1;
    for (const [name, val] of e.perAgent) {
      if (val > topVal) {
        topVal = val;
        topName = name;
      }
    }
    out.push({ date, sessions: e.sessions, tokens: e.tokens, topAgent: bucket(topName) });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Map { projectId: text } JSON from a daily_log row, tolerant of malformed data. */
function perProjectSummary(json: unknown, projectId: number): string | null {
  try {
    const v = JSON.parse(String(json ?? '{}'));
    if (v && typeof v === 'object' && v[projectId] != null) return String(v[projectId]);
    return null;
  } catch {
    return null;
  }
}

function buildDiary(
  db: DB,
  projectId: number,
  days: DayAgg[],
  resolved: ResolvedRange,
): { diary: ProjectDiaryEntry[]; latestSummary: string | null } {
  const clause = rangeDateClause('date', resolved);
  const logRows = db
    .prepare(`SELECT date, per_project_summary FROM daily_logs WHERE 1 = 1${clause.sql} ORDER BY date DESC`)
    .all(...clause.params) as { date: string; per_project_summary: string }[];
  const summaryByDate = new Map<string, string>();
  for (const r of logRows) {
    const s = perProjectSummary(r.per_project_summary, projectId);
    if (s) summaryByDate.set(r.date, s);
  }
  // Latest persisted per-project summary takes priority over generated fallback.
  let latestSummary: string | null = null;
  for (const r of logRows) {
    const s = summaryByDate.get(r.date);
    if (s) {
      latestSummary = s;
      break;
    }
  }

  const diary: ProjectDiaryEntry[] = days.map((d) => {
    const persisted = summaryByDate.get(d.date);
    const markdown =
      persisted ??
      `## ${d.date} 開發摘要\n- 本日 ${d.sessions} 個 session、${d.tokens.toLocaleString()} tokens。\n- 主要 agent：${displayName(d.topAgent)}。`;
    return {
      id: `p${projectId}-${d.date}`,
      date: d.date,
      title: `${d.sessions} 個 session · ${d.tokens.toLocaleString()} tokens`,
      markdown,
    };
  });

  return { diary, latestSummary };
}

function buildSessions(db: DB, projectId: number, resolved: ResolvedRange): ProjectSessionView[] {
  const clause = rangeDateClause('substr(start_time,1,10)', resolved);
  const rows = db
    .prepare(
      `SELECT id, command, agent_name, start_time, duration, token_total, status,
              COALESCE(summary, redacted_log_excerpt) AS excerpt,
              source_log_ref
       FROM sessions WHERE project_id = ?${clause.sql}
       ORDER BY start_time DESC, id DESC
       LIMIT 50`,
    )
    .all(projectId, ...clause.params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    command: (r.command as string | null) ?? null,
    agent_name: bucket(String(r.agent_name)),
    start_time: String(r.start_time),
    duration: (r.duration as number | null) ?? null,
    token_total: Number(r.token_total),
    status: String(r.status),
    excerpt: (r.excerpt as string | null) ?? null,
    source_log_ref: (r.source_log_ref as string | null) ?? null,
  }));
}

function buildComments(db: DB, projectId: number): ProjectComment[] {
  const rows = db
    .prepare(
      `SELECT id, content, tags, pinned, created_at FROM comments
       WHERE project_id = ? ORDER BY pinned DESC, created_at DESC, id DESC`,
    )
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => {
    let tags: string[] = [];
    try {
      const v = JSON.parse(String(r.tags ?? '[]'));
      if (Array.isArray(v)) tags = v.map(String);
    } catch {
      tags = [];
    }
    return {
      id: Number(r.id),
      content: String(r.content),
      tags,
      pinned: !!r.pinned,
      created_at: String(r.created_at),
    };
  });
}

function buildDocs(db: DB, projectId: number): ProjectDoc[] {
  const rows = db
    .prepare(`SELECT id, project_id, name, content, updated_at FROM project_docs WHERE project_id = ? ORDER BY updated_at DESC, name ASC`)
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    name: String(r.name),
    content: String(r.content ?? ''),
    updated_at: String(r.updated_at),
  }));
}

function nonEmptyText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? v : null;
}

function buildSummaryState(
  db: DB,
  projectId: number,
  latestSummary: string | null,
  fallbackSummary: string,
): {
  summary_markdown: string;
  summary_source: ProjectSummarySource;
  summary_ai_draft_markdown: string | null;
  summary_user_override_markdown: string | null;
} {
  const row = db.prepare(`SELECT markdown_ai, markdown_user FROM project_summaries WHERE project_id = ?`).get(projectId) as
    | { markdown_ai: string | null; markdown_user: string | null }
    | undefined;
  const user = nonEmptyText(row?.markdown_user);
  const ai = nonEmptyText(row?.markdown_ai);
  if (user) {
    return {
      summary_markdown: user,
      summary_source: 'user',
      summary_ai_draft_markdown: ai,
      summary_user_override_markdown: user,
    };
  }
  if (ai) {
    return {
      summary_markdown: ai,
      summary_source: 'ai',
      summary_ai_draft_markdown: ai,
      summary_user_override_markdown: null,
    };
  }
  if (latestSummary) {
    return {
      summary_markdown: latestSummary,
      summary_source: 'daily_log',
      summary_ai_draft_markdown: null,
      summary_user_override_markdown: null,
    };
  }
  return {
    summary_markdown: fallbackSummary,
    summary_source: 'fallback',
    summary_ai_draft_markdown: null,
    summary_user_override_markdown: null,
  };
}

/**
 * Build one read-only Workspace snapshot for a selected project (spec §11).
 * Returns null when the project does not exist or is ignored (caller maps to 404).
 */
export function getProjectDetail(
  db: DB,
  projectId: number,
  today: string,
  query: ProjectDetailQuery = {},
): ProjectDetailSnapshot | null {
  const resolved = resolveRange(query.range ?? 'all', today, query.customStart ?? null, query.customEnd ?? null);
  const p = db
    .prepare(
      `SELECT id, name, root_path, tracking_status, detected_agents, last_activity_at, git_branch,
              (SELECT MAX(substr(s.start_time,1,10)) FROM sessions s WHERE s.project_id = projects.id) AS latest_session_date
       FROM projects WHERE id = ? AND ignored = 0`,
    )
    .get(projectId) as Record<string, unknown> | undefined;
  if (!p) return null;

  const days = dayAggregates(db, projectId, resolved);
  const { diary, latestSummary } = buildDiary(db, projectId, days, resolved);
  const fallbackSummary =
    days.length > 0
      ? `## ${String(p.name)} 開發摘要\n- 最近活動：${days[0]!.date}，${days[0]!.sessions} 個 session。\n- 累積 ${days.reduce((a, d) => a + d.tokens, 0).toLocaleString()} tokens。`
      : `## ${String(p.name)} 開發摘要\n尚無 CLI 執行紀錄，掃描後會自動生成日記摘要。`;
  const summary = buildSummaryState(db, projectId, latestSummary, fallbackSummary);

  return {
    range_key: resolved.range_key,
    start_date: resolved.start_date,
    end_date: resolved.end_date,
    project: {
      id: Number(p.id),
      name: String(p.name),
      root_path: String(p.root_path),
      tracking_status: deriveTrackingStatus((p.latest_session_date as string | null) ?? null, today),
      detected_agents: parseAgents(p.detected_agents),
      last_activity_at: (p.last_activity_at as string | null) ?? null,
      git_branch: (p.git_branch as string | null) ?? null,
    },
    metric_strip: buildMetricStrip(db, projectId, today, resolved),
    kanban: buildKanban(db, projectId),
    summary_markdown: summary.summary_markdown,
    summary_source: summary.summary_source,
    summary_ai_draft_markdown: summary.summary_ai_draft_markdown,
    summary_user_override_markdown: summary.summary_user_override_markdown,
    diary,
    token_detail: buildTokenDetail(db, projectId, resolved),
    sessions: buildSessions(db, projectId, resolved),
    comments: buildComments(db, projectId),
    docs: buildDocs(db, projectId),
    git_status: getGitStatusSnapshot(
      { project_id: projectId, root_path: String(p.root_path) },
      { startDate: resolved.start_date, endDate: resolved.end_date },
    ),
    captured_at: new Date().toISOString(),
  };
}
