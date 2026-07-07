// Dashboard API client. The React UI consumes Core API snapshots only — it does
// not compute range data itself (spec §10 render order: render from the Core
// snapshot, no client mock / proportional fallback in production).

import { coreFetch } from './coreFetch.js';

const RANGE_LABELS = {
  all: '累積總計',
  '24h': '近24小時',
  '7d': '近7天',
  '1m': '近1個月',
  custom: '自訂區間',
};

const COLOR_VAR = {
  total: 'var(--model-total)',
  claude: 'var(--model-claude)',
  antigravity: 'var(--model-antigravity)',
  codex: 'var(--model-codex)',
  other: 'var(--model-other)',
};

const CLASS_MAP = {
  claude: 'claude',
  antigravity: 'antigravity',
  codex: 'codex',
  other: 'others',
};

export function formatTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(v);
}

export function buildTrendAxis(trend) {
  const data = Array.isArray(trend) ? trend : [];
  const total = data
    .filter((point) => point.series_key === 'total')
    .sort((a, b) => String(a.bucket_start).localeCompare(String(b.bucket_start)));
  const maxToken = Math.max(0, ...total.map((point) => Number(point.token_total) || 0));
  const yMax = Math.max(1, maxToken);
  const yLabels = [yMax, Math.round(yMax / 2), 0].map((value) => ({
    value,
    label: formatTokens(value),
  }));
  const xLabels = total.length === 0
    ? []
    : [total[0], total[Math.floor((total.length - 1) / 2)], total[total.length - 1]]
        .filter(Boolean)
        .filter((point, index, arr) => arr.findIndex((item) => item.bucket_start === point.bucket_start) === index)
        .map((point) => ({
          value: point.bucket_start,
          label: String(point.bucket_start).slice(5),
        }));
  return { yMax, yLabels, xLabels };
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HEATMAP_VISIBLE_WEEKS = 26;

function parseDateUtc(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mondayStart(date) {
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysUtc(date, offset);
}

function daysBetweenUtc(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function weekColumn(startMonday, date) {
  return Math.floor(daysBetweenUtc(startMonday, date) / 7) + 1;
}

function weekdayRow(date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function defaultActivityCell(date) {
  return {
    date,
    project_id: null,
    session_count: 0,
    token_total: 0,
    transcript_length: 0,
    task_count: 0,
    intensity_level: 0,
    dominant_agent_id: null,
  };
}

export function buildHeatmapCalendar(cells) {
  const sorted = [...(Array.isArray(cells) ? cells : [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (sorted.length === 0) return { cells: [], monthLabels: [], totalWeeks: 0 };

  const lastDate = parseDateUtc(sorted[sorted.length - 1].date);
  const lastWeekMonday = mondayStart(lastDate);
  const startMonday = addDaysUtc(lastWeekMonday, -(HEATMAP_VISIBLE_WEEKS - 1) * 7);
  const windowEnd = addDaysUtc(startMonday, HEATMAP_VISIBLE_WEEKS * 7 - 1);
  const totalWeeks = HEATMAP_VISIBLE_WEEKS;
  const byDate = new Map(sorted.map((item) => [item.date, item]));
  const seenMonthWeeks = new Set();
  const monthLabels = [];
  const positionedCells = [];

  for (let cursor = new Date(startMonday); cursor <= windowEnd; cursor = addDaysUtc(cursor, 1)) {
    const dateKey = formatDateUtc(cursor);
    const cell = byDate.get(dateKey) ?? defaultActivityCell(dateKey);
    const date = parseDateUtc(dateKey);
    const column = weekColumn(startMonday, date);
    if ((dateKey === formatDateUtc(startMonday) || date.getUTCDate() === 1) && !seenMonthWeeks.has(`${date.getUTCFullYear()}-${date.getUTCMonth()}`)) {
      seenMonthWeeks.add(`${date.getUTCFullYear()}-${date.getUTCMonth()}`);
      monthLabels.push({ label: MONTH_LABELS[date.getUTCMonth()], column });
    }
    positionedCells.push({
      ...cell,
      gridColumnStart: column,
      gridRowStart: weekdayRow(date),
    });
  }

  return {
    cells: positionedCells,
    monthLabels,
    totalWeeks,
  };
}

export function buildProjectConcentrationFromProjects(projects) {
  const rows = (Array.isArray(projects) ? projects : [])
    .map((project) => ({
      id: project.id,
      name: project.name,
      tokenTotal: Number(project.tokenTotal ?? project.token_total) || 0,
      sessions: Number(project.logsCount ?? project.logs_count) || 0,
    }))
    .filter((project) => project.tokenTotal > 0);
  const total = rows.reduce((sum, project) => sum + project.tokenTotal, 0);
  const ranked = rows
    .sort((a, b) => b.tokenTotal - a.tokenTotal || String(a.name).localeCompare(String(b.name)))
    .slice(0, 5);
  return ranked.map((project) => ({
    ...project,
    tokens: formatTokens(project.tokenTotal),
    pct: total > 0 ? Math.round((project.tokenTotal / total) * 1000) / 10 : 0,
  }));
}

/** Fetch one validated Dashboard snapshot for the selected range. */
export async function fetchDashboard(range, start, end) {
  const params = new URLSearchParams({ range });
  if (range === 'custom') {
    params.set('start', start);
    params.set('end', end);
  }
  const res = await coreFetch(`/api/dashboard?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Core API error (HTTP ${res.status})`);
  }
  return res.json();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientCoreLoadError(err) {
  const message = err?.message || String(err || '');
  return /Load failed|fetch failed|Failed to fetch|Core API is not reachable|連不到 Core API/i.test(message);
}

/** Retry transient startup races while Tauri is still launching the bundled Core. */
export async function fetchDashboardWithRetry(range, start, end, options = {}) {
  const attempts = Number.isInteger(options.attempts) && options.attempts > 0 ? options.attempts : 8;
  const delayMs = Number.isFinite(options.delayMs) && options.delayMs >= 0 ? options.delayMs : 600;
  const fetcher = options.fetcher || fetchDashboard;
  const sleeper = options.wait || wait;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetcher(range, start, end);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !isTransientCoreLoadError(err)) break;
      await sleeper(delayMs);
    }
  }
  throw lastError;
}

/** Map a Core snapshot into the view shapes the Dashboard renders. */
export function toDashboardView(snapshot) {
  const m = snapshot.metric;
  const label = RANGE_LABELS[snapshot.range_key] || '區間';
  return {
    label,
    rangeData: {
      label,
      tokens: formatTokens(m.token_total),
      sessions: m.session_count,
      primary: m.primary_agent_name || '—',
      pct: `${m.primary_agent_token_percentage}%`,
      activeProjects: m.active_project_count,
      delta: m.comparison_delta_percentage,
    },
    agentMix: {
      label,
      total: formatTokens(m.token_total),
      data: snapshot.agent_mix.map((a) => ({
        name: a.agent_name,
        pct: a.percentage,
        tokenTotal: Number(a.token_total) || 0,
        tokens: formatTokens(a.token_total),
        color: COLOR_VAR[a.color_key] || COLOR_VAR.other,
        className: CLASS_MAP[a.color_key] || 'others',
      })),
    },
    projectConcentration: (snapshot.project_concentration ?? []).map((project) => ({
      id: project.project_id,
      name: project.project_name,
      tokenTotal: Number(project.token_total) || 0,
      tokens: formatTokens(project.token_total),
      sessions: Number(project.session_count) || 0,
      pct: Number(project.percentage) || 0,
    })),
    heatmap: buildHeatmapCalendar(snapshot.heatmap),
    trend: snapshot.trend,
    trendAxis: buildTrendAxis(snapshot.trend),
    dailyHighlights: (Array.isArray(snapshot.daily_highlights) ? snapshot.daily_highlights : []).map((item) => ({
      kind: item.kind,
      label: item.label,
      text: item.text,
      date: item.date,
    })),
  };
}
