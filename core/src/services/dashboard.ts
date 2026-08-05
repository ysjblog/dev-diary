import type { DB } from '../db/index.js';
import {
  resolveRange,
  addDays,
  daysBetween,
  expandDates,
  type ResolvedRange,
} from '../domain/dateRange.js';
import { normalizeAgentId, agentDisplayName, agentColorKey, OTHER_AGENT_META } from '../domain/agents.js';
import type {
  RangeKey,
  CanonicalAgentId,
  DashboardSnapshot,
  DashboardRangeMetric,
  DashboardAgentMix,
  DashboardTrendPoint,
  DashboardActivityCell,
  DashboardProjectConcentration,
  DashboardDailyHighlight,
  DashboardDailyHighlightKind,
  SeriesKey,
  IntensityLevel,
} from '../domain/types.js';
import { sqliteTaipeiDate, sqliteTaipeiHour } from './taipeiDate.js';

const CANON_ORDER: CanonicalAgentId[] = ['claude-code', 'codex-cli', 'antigravity-cli'];
type MixKey = CanonicalAgentId | 'other';

export interface DashboardQuery {
  range: RangeKey;
  today: string; // YYYY-MM-DD anchor (caller supplies real clock)
  customStart?: string | null;
  customEnd?: string | null;
}

/** Bucket any raw agent_name into a canonical id or `other`. */
function mixKeyOf(agentName: string): MixKey {
  return normalizeAgentId(agentName) ?? 'other';
}

/** Resolve the concrete inclusive [start,end] used for queries. For all-time this
 *  comes from observed data bounds; the snapshot still reports null/null dates. */
function effectiveBounds(db: DB, resolved: ResolvedRange, today: string): { start: string; end: string } {
  if (resolved.start_date && resolved.end_date) {
    return { start: resolved.start_date, end: resolved.end_date };
  }
  const row = db.prepare(`SELECT MIN(${sqliteTaipeiDate('start_time')}) AS lo, MAX(${sqliteTaipeiDate('start_time')}) AS hi FROM sessions`).get() as {
    lo: string | null;
    hi: string | null;
  };
  return { start: row.lo ?? today, end: row.hi ?? today };
}

function latestActivityBounds(db: DB, today: string): { start: string; end: string } {
  const row = db
    .prepare(
      `SELECT MIN(${sqliteTaipeiDate('start_time')}) AS lo, MAX(${sqliteTaipeiDate('start_time')}) AS hi
       FROM sessions`,
    )
    .get() as { lo: string | null; hi: string | null };
  return { start: row.lo ?? today, end: row.hi ?? today };
}

interface UsageRow { agent_name: string; tokens: number }
interface SessionAgg { sessions: number; projects: number }

function sumTokens(db: DB, start: string, end: string): UsageRow[] {
  return db
    .prepare(
      `SELECT agent_name, SUM(token_total) AS tokens
       FROM sessions WHERE ${sqliteTaipeiDate('start_time')} >= ? AND ${sqliteTaipeiDate('start_time')} <= ?
       GROUP BY agent_name`,
    )
    .all(start, end) as UsageRow[];
}

function sessionAgg(db: DB, start: string, end: string): SessionAgg {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS sessions, COUNT(DISTINCT project_id) AS projects
       FROM sessions WHERE ${sqliteTaipeiDate('start_time')} >= ? AND ${sqliteTaipeiDate('start_time')} <= ?`,
    )
    .get(start, end) as { sessions: number; projects: number };
  return { sessions: row.sessions, projects: row.projects };
}

function rangeTokenTotal(rows: UsageRow[]): number {
  return rows.reduce((a, r) => a + (r.tokens ?? 0), 0);
}

function buildAgentMix(rows: UsageRow[], total: number): DashboardAgentMix[] {
  const byKey = new Map<MixKey, number>();
  for (const r of rows) {
    const k = mixKeyOf(r.agent_name);
    byKey.set(k, (byKey.get(k) ?? 0) + (r.tokens ?? 0));
  }
  const keys: MixKey[] = [...CANON_ORDER, 'other'];
  const mix: DashboardAgentMix[] = [];
  for (const k of keys) {
    const tokens = byKey.get(k) ?? 0;
    if (tokens === 0) continue;
    mix.push({
      agent_name: k === 'other' ? OTHER_AGENT_META.display_name : agentDisplayName(k),
      agent_id: k,
      token_total: tokens,
      percentage: total > 0 ? Math.round((tokens / total) * 1000) / 10 : 0,
      color_key: agentColorKey(k),
    });
  }
  return mix.sort((a, b) => b.token_total - a.token_total);
}

function buildProjectConcentration(db: DB, start: string, end: string, total: number): DashboardProjectConcentration[] {
  const rows = db
    .prepare(
      `SELECT p.id AS project_id,
              p.name AS project_name,
              SUM(s.token_total) AS token_total,
              COUNT(*) AS session_count
       FROM sessions s
       JOIN projects p ON p.id = s.project_id
       WHERE ${sqliteTaipeiDate('s.start_time')} >= ? AND ${sqliteTaipeiDate('s.start_time')} <= ? AND p.ignored = 0
       GROUP BY p.id, p.name
       HAVING token_total > 0
       ORDER BY token_total DESC, p.name ASC
       LIMIT 5`,
    )
    .all(start, end) as {
      project_id: number;
      project_name: string;
      token_total: number;
      session_count: number;
    }[];

  return rows.map((row) => ({
    project_id: row.project_id,
    project_name: row.project_name,
    token_total: row.token_total ?? 0,
    session_count: row.session_count ?? 0,
    percentage: total > 0 ? Math.round(((row.token_total ?? 0) / total) * 1000) / 10 : 0,
  }));
}

/** Hourly trend for the 24h range. `sessions.start_time` carries hour-of-day
 *  granularity that `token_usage` (date-only) cannot provide. */
function buildHourlyTrend(db: DB, start: string, end: string): DashboardTrendPoint[] {
  const rows = db
    .prepare(
      `SELECT ${sqliteTaipeiDate('start_time')} AS date, ${sqliteTaipeiHour('start_time')} AS hour,
              agent_name, SUM(token_total) AS tokens
       FROM sessions WHERE ${sqliteTaipeiDate('start_time')} >= ? AND ${sqliteTaipeiDate('start_time')} <= ?
       GROUP BY date, hour, agent_name`,
    )
    .all(start, end) as { date: string; hour: string; agent_name: string; tokens: number }[];
  const sessRows = db
    .prepare(
      `SELECT ${sqliteTaipeiDate('start_time')} AS date, ${sqliteTaipeiHour('start_time')} AS hour,
              agent_name, COUNT(*) AS sessions
       FROM sessions WHERE ${sqliteTaipeiDate('start_time')} >= ? AND ${sqliteTaipeiDate('start_time')} <= ?
       GROUP BY date, hour, agent_name`,
    )
    .all(start, end) as { date: string; hour: string; agent_name: string; sessions: number }[];

  const series: SeriesKey[] = ['total', ...CANON_ORDER, 'other'];
  const points: DashboardTrendPoint[] = [];
  for (let d = start; daysBetween(d, end) >= 0; d = addDays(d, 1)) {
    for (let h = 0; h < 24; h++) {
      const hourStr = String(h).padStart(2, '0');
      const bucketStart = `${d}T${hourStr}:00`;
      const tok: Record<SeriesKey, number> = { total: 0, 'claude-code': 0, 'codex-cli': 0, 'antigravity-cli': 0, other: 0 };
      const ses: Record<SeriesKey, number> = { total: 0, 'claude-code': 0, 'codex-cli': 0, 'antigravity-cli': 0, other: 0 };
      for (const r of rows) {
        if (r.date !== d || r.hour !== hourStr) continue;
        const k = mixKeyOf(r.agent_name);
        tok[k] += r.tokens;
        tok.total += r.tokens;
      }
      for (const r of sessRows) {
        if (r.date !== d || r.hour !== hourStr) continue;
        const k = mixKeyOf(r.agent_name);
        ses[k] += r.sessions;
        ses.total += r.sessions;
      }
      for (const sk of series) {
        points.push({
          range_key: '24h',
          bucket_start: bucketStart,
          bucket_end: bucketStart,
          series_key: sk,
          token_total: tok[sk],
          session_count: ses[sk],
        });
      }
    }
  }
  return points;
}

function buildTrend(db: DB, rangeKey: RangeKey, start: string, end: string): DashboardTrendPoint[] {
  if (rangeKey === '24h') return buildHourlyTrend(db, start, end);
  const span = daysBetween(start, end);
  // Daily buckets for short ranges; weekly for long/all-time to keep the series readable.
  const bucketDays = span <= 31 ? 1 : 7;
  const rows = db
    .prepare(
      `SELECT ${sqliteTaipeiDate('start_time')} AS date, agent_name, SUM(token_total) AS tokens
       FROM sessions WHERE ${sqliteTaipeiDate('start_time')} >= ? AND ${sqliteTaipeiDate('start_time')} <= ? GROUP BY date, agent_name`,
    )
    .all(start, end) as { date: string; agent_name: string; tokens: number }[];
  const sessRows = db
    .prepare(
      `SELECT ${sqliteTaipeiDate('start_time')} AS date, agent_name, COUNT(*) AS sessions
       FROM sessions WHERE ${sqliteTaipeiDate('start_time')} >= ? AND ${sqliteTaipeiDate('start_time')} <= ?
       GROUP BY date, agent_name`,
    )
    .all(start, end) as { date: string; agent_name: string; sessions: number }[];

  const series: SeriesKey[] = ['total', ...CANON_ORDER, 'other'];
  const points: DashboardTrendPoint[] = [];
  for (let bStart = start; daysBetween(bStart, end) >= 0; bStart = addDays(bStart, bucketDays)) {
    const bEndRaw = addDays(bStart, bucketDays - 1);
    // Clamp the bucket end to the range end (min), never extend past it.
    const bEnd = daysBetween(bEndRaw, end) < 0 ? end : bEndRaw;
    const tok: Record<SeriesKey, number> = { total: 0, 'claude-code': 0, 'codex-cli': 0, 'antigravity-cli': 0, other: 0 };
    const ses: Record<SeriesKey, number> = { total: 0, 'claude-code': 0, 'codex-cli': 0, 'antigravity-cli': 0, other: 0 };
    for (const r of rows) {
      if (r.date < bStart || r.date > bEnd) continue;
      const k = mixKeyOf(r.agent_name);
      tok[k] += r.tokens;
      tok.total += r.tokens;
    }
    for (const r of sessRows) {
      if (r.date < bStart || r.date > bEnd) continue;
      const k = mixKeyOf(r.agent_name);
      ses[k] += r.sessions;
      ses.total += r.sessions;
    }
    for (const sk of series) {
      points.push({
        range_key: rangeKey,
        bucket_start: bStart,
        bucket_end: bEnd,
        series_key: sk,
        token_total: tok[sk],
        session_count: ses[sk],
      });
    }
  }
  return points;
}

function buildHeatmap(db: DB, start: string, end: string): DashboardActivityCell[] {
  const rows = db
    .prepare(
      `SELECT ${sqliteTaipeiDate('start_time')} AS date,
              COUNT(*) AS session_count,
              SUM(token_total) AS token_total,
              SUM(COALESCE(transcript_length,0)) AS transcript_length,
              SUM(COALESCE(task_count,0)) AS task_count
       FROM sessions WHERE ${sqliteTaipeiDate('start_time')} >= ? AND ${sqliteTaipeiDate('start_time')} <= ?
       GROUP BY date`,
    )
    .all(start, end) as {
      date: string;
      session_count: number;
      token_total: number;
      transcript_length: number;
      task_count: number;
    }[];
  const byDate = new Map(rows.map((r) => [r.date, r]));

  // Deterministic weighting: token total first, session count second, task count
  // third (spec §10). Sessions/tasks act only as tie-breakers below the token scale.
  const dominantStmt = db.prepare(
    `SELECT agent_name, SUM(token_total) AS t FROM sessions
     WHERE ${sqliteTaipeiDate('start_time')} = ? GROUP BY agent_name ORDER BY t DESC LIMIT 1`,
  );

  const cells: (DashboardActivityCell & { _score: number })[] = expandDates(start, end).map((date) => {
    const r = byDate.get(date);
    const session_count = r?.session_count ?? 0;
    const token_total = r?.token_total ?? 0;
    const transcript_length = r?.transcript_length ?? 0;
    const task_count = r?.task_count ?? 0;
    const dom = r ? (dominantStmt.get(date) as { agent_name: string } | undefined) : undefined;
    const dominant_agent_id = dom ? mixKeyOf(dom.agent_name) : null;
    const score = token_total + session_count * 1e-3 + task_count * 1e-6;
    return {
      date,
      project_id: null,
      session_count,
      token_total,
      transcript_length,
      task_count,
      intensity_level: 0,
      dominant_agent_id,
      _score: score,
    };
  });

  const maxScore = cells.reduce((m, c) => Math.max(m, c._score), 0);
  for (const c of cells) {
    c.intensity_level = scoreToLevel(c._score, maxScore);
  }
  return cells.map(({ _score, ...cell }) => cell);
}

function scoreToLevel(score: number, max: number): IntensityLevel {
  if (max <= 0 || score <= 0) return 0;
  const ratio = score / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function dailyLogCounts(db: DB, start: string, end: string) {
  const rows = db
    .prepare(`SELECT blockers, warnings, summary_status FROM daily_logs WHERE date >= ? AND date <= ?`)
    .all(start, end) as { blockers: string; warnings: string; summary_status: string }[];
  let blocker_count = 0;
  let warning_count = 0;
  let unconfirmed_summary_count = 0;
  for (const r of rows) {
    blocker_count += safeLen(r.blockers);
    warning_count += safeLen(r.warnings);
    if (r.summary_status === 'ai_generated' || r.summary_status === 'pending') unconfirmed_summary_count++;
  }
  return { blocker_count, warning_count, unconfirmed_summary_count };
}

function safeLen(json: string): number {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

const HIGHLIGHT_KIND: Record<string, DashboardDailyHighlightKind> = {
  達成: 'achieve',
  完成: 'achieve',
  阻礙: 'blocker',
  風險: 'blocker',
  下一步: 'next',
  next: 'next',
};

function parseDailyHighlights(date: string, markdown: string | null): DashboardDailyHighlight[] {
  if (!markdown?.trim()) return [];
  const out: DashboardDailyHighlight[] = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.replace(/^[-*]\s*/, '').trim();
    const match = line.match(/^(?:\*\*)?\s*(達成|完成|阻礙|風險|下一步|next)\s*(?:\*\*)?\s*[：:]\s*(.+)$/i);
    if (!match) continue;
    const label = match[1]!;
    const text = match[2]!.trim();
    if (!text) continue;
    out.push({
      kind: HIGHLIGHT_KIND[label.toLowerCase()] ?? HIGHLIGHT_KIND[label] ?? 'next',
      label,
      text,
      date,
    });
  }
  return out.slice(0, 3);
}

function dailyHighlights(db: DB, start: string, end: string): DashboardDailyHighlight[] {
  const row = db
    .prepare(
      `SELECT date, global_summary_ai
       FROM daily_logs
       WHERE date >= ? AND date <= ? AND global_summary_ai IS NOT NULL
       ORDER BY date DESC
       LIMIT 1`,
    )
    .get(start, end) as { date: string; global_summary_ai: string | null } | undefined;
  return row ? parseDailyHighlights(row.date, row.global_summary_ai) : [];
}

/**
 * Build one validated aggregate snapshot for a Dashboard range (spec §10 render order).
 * Throws RangeValidationError for invalid custom dates (caller maps to HTTP 400).
 */
export function getDashboardSnapshot(db: DB, q: DashboardQuery): DashboardSnapshot {
  const resolved = resolveRange(q.range, q.today, q.customStart, q.customEnd);
  const { start, end } = effectiveBounds(db, resolved, q.today);

  const usage = sumTokens(db, start, end);
  const tokenTotal = rangeTokenTotal(usage);
  const { sessions, projects } = sessionAgg(db, start, end);
  const mix = buildAgentMix(usage, tokenTotal);
  const primary = mix[0] ?? null;
  const counts = dailyLogCounts(db, start, end);
  const heatmapRange = latestActivityBounds(db, q.today);

  // Comparison vs previous equal-length window (null for all-time / empty prior).
  let comparison: number | null = null;
  if (resolved.start_date && resolved.end_date) {
    const len = daysBetween(resolved.start_date, resolved.end_date) + 1;
    const prevEnd = addDays(resolved.start_date, -1);
    const prevStart = addDays(prevEnd, -(len - 1));
    const prevTotal = rangeTokenTotal(sumTokens(db, prevStart, prevEnd));
    comparison = prevTotal > 0 ? Math.round(((tokenTotal - prevTotal) / prevTotal) * 1000) / 10 : null;
  }

  const metric: DashboardRangeMetric = {
    range_key: resolved.range_key,
    start_date: resolved.start_date,
    end_date: resolved.end_date,
    token_total: tokenTotal,
    session_count: sessions,
    active_project_count: projects,
    primary_agent_name: primary?.agent_name ?? null,
    primary_agent_token_percentage: primary?.percentage ?? 0,
    blocker_count: counts.blocker_count,
    warning_count: counts.warning_count,
    unconfirmed_summary_count: counts.unconfirmed_summary_count,
    comparison_delta_percentage: comparison,
  };

  return {
    range_key: resolved.range_key,
    start_date: resolved.start_date,
    end_date: resolved.end_date,
    captured_at: new Date().toISOString(),
    metric,
    agent_mix: mix,
    project_concentration: buildProjectConcentration(db, start, end, tokenTotal),
    trend: buildTrend(db, resolved.range_key, start, end),
    heatmap: buildHeatmap(db, heatmapRange.start, heatmapRange.end),
    daily_highlights: dailyHighlights(db, start, end),
  };
}
