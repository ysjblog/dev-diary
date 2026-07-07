// Projects Workspace API client (spec §11). The React UI consumes Core API
// snapshots only — it does not read project folders, parse logs, or compute
// aggregates itself. Git Status also comes from the Core read-only
// GitStatusSnapshot contract; React never shells out to git.

import { coreFetch } from './coreFetch.js';
import { formatTokens } from './dashboard.js';
import { withCoreStartupRetry } from './settings.js';

const AGENT_LABEL = {
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'antigravity-cli': 'Antigravity CLI',
  other: '其他',
};

function agentLabel(id) {
  return AGENT_LABEL[id] || id || '—';
}

async function jsonOrThrow(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) {
      throw new Error(body.message || 'Core runtime 可能是舊版或沒有載入最新 route；請重啟 DevDiary Core 後再重試。');
    }
    throw new Error(body.message || `Core API error (HTTP ${res.status})`);
  }
  return res.json();
}

/** Fetch the Workspace project list (left rail). */
export async function fetchProjectList() {
  const res = await coreFetch('/api/projects');
  return jsonOrThrow(res);
}

export async function fetchProjectListWithRetry(options = {}) {
  const fetcher = options.fetcher || fetchProjectList;
  return withCoreStartupRetry(fetcher, options);
}

function projectRangeQuery({ range = 'all', start = '', end = '' } = {}) {
  const params = new URLSearchParams({ range });
  if (range === 'custom') {
    params.set('start', start);
    params.set('end', end);
  }
  return params.toString();
}

export function singleDayRangeOptions(date) {
  return { range: 'custom', start: date, end: date };
}

/** Fetch one read-only project detail snapshot. */
export async function fetchProjectDetail(id, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}?${projectRangeQuery(rangeOptions)}`);
  return jsonOrThrow(res);
}

export async function createProjectComment(id, { content, tags }, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/comments?${projectRangeQuery(rangeOptions)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, tags }),
  });
  return jsonOrThrow(res);
}

export async function setProjectCommentPinned(id, commentId, pinned, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/comments/${commentId}?${projectRangeQuery(rangeOptions)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pinned }),
  });
  return jsonOrThrow(res);
}

export async function removeProjectComment(id, commentId, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/comments/${commentId}?${projectRangeQuery(rangeOptions)}`, { method: 'DELETE' });
  return jsonOrThrow(res);
}

export async function setKanbanCardStatus(id, cardId, status, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/kanban/${cardId}?${projectRangeQuery(rangeOptions)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return jsonOrThrow(res);
}

export async function saveProjectSummary(id, markdown, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/summary?${projectRangeQuery(rangeOptions)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  });
  return jsonOrThrow(res);
}

export async function regenerateProjectSummary(id, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/summary/regenerate?${projectRangeQuery(rangeOptions)}`, { method: 'POST' });
  return jsonOrThrow(res);
}

export async function acceptProjectSummaryDraft(id, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/summary/accept-draft?${projectRangeQuery(rangeOptions)}`, { method: 'POST' });
  return jsonOrThrow(res);
}

export async function saveProjectDiaryEntry(id, date, markdown, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/diary/${encodeURIComponent(date)}?${projectRangeQuery(rangeOptions)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  });
  return jsonOrThrow(res);
}

export async function regenerateProjectDiaryEntry(id, date, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/diary/${encodeURIComponent(date)}/regenerate?${projectRangeQuery(rangeOptions)}`, { method: 'POST' });
  return jsonOrThrow(res);
}

export async function runGlobalScan(rangeOptions) {
  const res = await coreFetch(`/api/scan?${projectRangeQuery(rangeOptions)}`, { method: 'POST' });
  return jsonOrThrow(res);
}

export async function runProjectScan(id, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/scan?${projectRangeQuery(rangeOptions)}`, { method: 'POST' });
  return jsonOrThrow(res);
}

export async function runProjectKanbanAiSync(id, rangeOptions) {
  const res = await coreFetch(`/api/projects/${id}/kanban/ai-sync?${projectRangeQuery(rangeOptions)}`, { method: 'POST' });
  return jsonOrThrow(res);
}

/** Map a Core list item to the shape the left rail / header render. */
export function toProjectListItem(p) {
  return {
    id: p.id,
    name: p.name,
    status: p.tracking_status, // 'active' | 'idle'
    path: p.root_path,
    agents: Array.isArray(p.detected_agents) ? p.detected_agents : [],
    logsCount: p.logs_count,
    tokenTotal: Number(p.token_total) || 0,
    tokensCount: formatTokens(p.token_total),
  };
}

export function toProjectListView(list) {
  return (Array.isArray(list) ? list : []).map(toProjectListItem);
}

/** Map a Core KanbanCard into the prototype card shape the board renders. */
export function toKanbanCardView(c) {
  return {
    id: c.id,
    title: c.title,
    desc: c.description,
    status: c.status,
    assignee: agentLabel(c.assignee_agent_id),
    projectId: c.project_id,
    sourceRef: c.source_ref || '',
    manualStatusLock: Boolean(c.status_locked_by_user),
    aiAutoAdded: c.source_ref?.startsWith('ai-suggest://') || false,
  };
}

/** Derive the Workspace metric-strip view (formatted tokens). */
export function toMetricStripView(strip) {
  if (!strip) {
    return { today: '—', week: '—', month: '—', all: '—', rangeTokens: '—', rangeSessions: 0, sessions: 0, summaryStatus: 'pending' };
  }
  return {
    today: formatTokens(strip.token_today),
    week: formatTokens(strip.token_week),
    month: formatTokens(strip.token_month),
    all: formatTokens(strip.token_all),
    rangeTokens: formatTokens(strip.range_token_total ?? strip.token_all),
    rangeSessions: strip.range_session_count ?? strip.session_count,
    sessions: strip.session_count,
    summaryStatus: strip.summary_status,
  };
}

const SUMMARY_STATUS_LABEL = {
  confirmed: '● 已確認',
  ai_generated: '● AI 已生成',
  pending: '○ 待生成',
};

export function summaryStatusLabel(status) {
  return SUMMARY_STATUS_LABEL[status] || '○ 待生成';
}

/** Map Core GitStatusSnapshot into the compact view shape rendered by the Git tab. */
export function toGitStatusView(snapshot) {
  if (!snapshot) {
    return {
      available: false,
      main: '—',
      branch: '—',
      relation: 'loading',
      workingTree: 'loading',
      upstreamHealth: 'loading',
      commits: [],
      worktrees: [],
      diff: { added: 0, changed: 0, deleted: 0 },
    };
  }
  return {
    available: !!snapshot.available,
    main: snapshot.main_branch || '—',
    branch: snapshot.current_branch || '—',
    relation: snapshot.branch_relationship || '—',
    workingTree: snapshot.working_tree_status || '—',
    upstreamHealth: snapshot.upstream_health || snapshot.unavailable_reason || '—',
    commits: Array.isArray(snapshot.recent_commits) ? snapshot.recent_commits : [],
    worktrees: Array.isArray(snapshot.linked_worktrees) ? snapshot.linked_worktrees : [],
    diff: {
      added: Number(snapshot.diff_added_lines) || 0,
      changed: Number(snapshot.diff_changed_lines) || 0,
      deleted: Number(snapshot.diff_deleted_lines) || 0,
    },
  };
}

/** Format an ISO/`YYYY-MM-DDTHH:mm:ssZ` timestamp for compact display. */
export function formatTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Format a duration in seconds as a compact string. */
export function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}
