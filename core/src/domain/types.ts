// Canonical data model — mirrors spec §7 (docs/specs/dev-diary-macos-app.md).
// These are the persisted / API contract types. The React UI must consume these,
// not the Open Design prototype mock field names (spec §7.9 maps prototype -> canonical).

export type TrackingStatus = 'active' | 'idle' | 'paused';
export type WorkspaceTrackingStatus = 'active' | 'idle';
export type KanbanStatus = 'todo' | 'in_progress' | 'done';

/** Canonical agent identifiers (spec §7.9). */
export type CanonicalAgentId = 'claude-code' | 'codex-cli' | 'antigravity-cli';

/** Trend / mix series buckets (spec §7.3.4). `other` covers non-canonical agents. */
export type SeriesKey = 'total' | CanonicalAgentId | 'other';

export interface Project {
  id: number;
  name: string;
  root_path: string;
  tracking_status: TrackingStatus;
  created_at: string;
  last_activity_at: string | null;
  detected_agents: CanonicalAgentId[];
  ignored: boolean;
  scan_paused: boolean;
  git_repo_detected: boolean;
  git_branch: string | null;
  git_worktree_count: number;
}

export interface KanbanCard {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: KanbanStatus;
  assignee_agent_id: CanonicalAgentId | null;
  due_date: string | null;
  source_ref: string | null;
  status_locked_by_user: boolean;
  created_at: string;
  updated_at: string;
}

export interface KanbanAiPromptInput {
  project: {
    id: number;
    name: string;
    tracking_status: TrackingStatus;
    branch: string | null;
  };
  existing_cards: Array<{
    title: string;
    status: KanbanStatus;
    manual_status_lock: boolean;
    source: 'ai' | 'auto' | 'manual';
  }>;
  recent_sessions: Array<{
    date: string;
    agent_name: CanonicalAgentId | 'other';
    status: string;
    summary: string;
  }>;
  recent_commits: Array<{
    hash_prefix: string;
    title: string;
  }>;
  deterministic_evidence: string[];
}

export interface KanbanSuggestion {
  title: string;
  description: string;
  suggested_status: KanbanStatus;
  confidence: number;
  evidence: string;
  reason: string;
  dedupe_key: string;
  source_ref: string;
}

export interface KanbanAiSyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  warnings: string[];
  agent_id: string | null;
  enabled: boolean;
}

export interface Session {
  id: number;
  project_id: number;
  agent_name: CanonicalAgentId;
  model: string;
  start_time: string;
  end_time: string | null;
  token_total: number;
  token_input: number;
  token_cached: number;
  token_output: number;
  token_reasoning: number;
  summary: string | null;
  source_log_ref: string | null;
  parser_confidence: number;
  command: string | null;
  duration: number | null;
  status: string;
  redacted_log_excerpt: string | null;
  task_count: number | null;
  transcript_length: number | null;
}

export interface TokenUsage {
  date: string; // YYYY-MM-DD
  project_id: number;
  agent_name: CanonicalAgentId;
  model: string;
  token_total: number;
  token_input: number;
  token_cached: number;
  token_output: number;
  token_reasoning: number;
}

// ---- Dashboard derived contracts (spec §7.3.1 – §7.3.4) ----

export type RangeKey = 'all' | '24h' | '7d' | '1m' | 'custom';

export interface DashboardRangeMetric {
  range_key: RangeKey;
  start_date: string | null;
  end_date: string | null;
  token_total: number;
  session_count: number;
  active_project_count: number;
  primary_agent_name: string | null;
  primary_agent_token_percentage: number;
  blocker_count: number;
  warning_count: number;
  unconfirmed_summary_count: number;
  comparison_delta_percentage: number | null;
}

export interface DashboardAgentMix {
  agent_name: string;
  agent_id: CanonicalAgentId | 'other';
  token_total: number;
  percentage: number;
  color_key: string;
}

export interface DashboardTrendPoint {
  range_key: RangeKey;
  bucket_start: string;
  bucket_end: string;
  series_key: SeriesKey;
  token_total: number;
  session_count: number;
}

export type IntensityLevel = 0 | 1 | 2 | 3 | 4;

export interface DashboardActivityCell {
  date: string;
  project_id: number | null;
  session_count: number;
  token_total: number;
  transcript_length: number;
  task_count: number;
  intensity_level: IntensityLevel;
  dominant_agent_id: CanonicalAgentId | 'other' | null;
}

export interface DashboardProjectConcentration {
  project_id: number;
  project_name: string;
  token_total: number;
  session_count: number;
  percentage: number;
}

export type DashboardDailyHighlightKind = 'achieve' | 'blocker' | 'next';

export interface DashboardDailyHighlight {
  kind: DashboardDailyHighlightKind;
  label: string;
  text: string;
  date: string;
}

/** Single aggregate snapshot returned for one Dashboard range (spec §10 render order). */
export interface DashboardSnapshot {
  range_key: RangeKey;
  start_date: string | null;
  end_date: string | null;
  captured_at: string;
  metric: DashboardRangeMetric;
  agent_mix: DashboardAgentMix[];
  project_concentration: DashboardProjectConcentration[];
  trend: DashboardTrendPoint[];
  heatmap: DashboardActivityCell[];
  daily_highlights: DashboardDailyHighlight[];
}

// ---- Projects Workspace contracts (spec §11) ----

export interface ProjectDoc {
  id: number;
  project_id: number;
  name: string;
  content: string;
  updated_at: string;
}

/** One row in the Workspace project list (left rail). */
export interface ProjectListItem {
  id: number;
  name: string;
  root_path: string;
  tracking_status: WorkspaceTrackingStatus;
  last_activity_at: string | null;
  detected_agents: CanonicalAgentId[];
  git_branch: string | null;
  logs_count: number; // distinct active dates = one diary block per date (spec §11)
  token_total: number; // all-time token total for the project
}

/** Project metric strip (spec §11 / §6.3 B). Cost is hidden in v1 (Non-Goal). */
export interface ProjectMetricStrip {
  token_today: number;
  token_week: number;
  token_month: number;
  token_all: number;
  range_token_total: number;
  range_session_count: number;
  session_count: number;
  summary_status: string; // 'confirmed' | 'ai_generated' | 'pending'
}

/** One Token Detail row. No cost field — v1 hides estimated cost (spec §11). */
export interface ProjectTokenRow {
  id: string;
  date: string;
  agent_id: CanonicalAgentId | 'other';
  agent_name: string; // canonical display name
  token_input: number;
  token_output: number;
  token_total: number;
}

export interface ProjectTokenBreakdownItem {
  key: string; // agent display name or model id
  token_total: number;
}

export interface ProjectTokenDetail {
  rows: ProjectTokenRow[];
  by_agent: ProjectTokenBreakdownItem[];
  by_model: ProjectTokenBreakdownItem[];
}

/** One diary block: one per date, grouped by month in the UI (spec §11). */
export interface ProjectDiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  markdown: string;
}

export interface ProjectComment {
  id: number;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
}

export interface ProjectSessionView {
  id: number;
  command: string | null;
  agent_name: CanonicalAgentId | 'other';
  start_time: string;
  duration: number | null; // seconds
  token_total: number;
  status: string;
  excerpt: string | null;
  source_log_ref: string | null;
}

export type ProjectSummarySource = 'user' | 'ai' | 'daily_log' | 'fallback';

export interface GitLinkedWorktree {
  name: string;
  path: string;
  branch: string | null;
}

export interface GitRecentCommit {
  hash: string;
  title: string;
  author: string;
  time: string;
  tag: string;
}

export interface GitStatusSnapshot {
  project_id: number;
  captured_at: string;
  available: boolean;
  unavailable_reason: string | null;
  main_branch: string | null;
  current_branch: string | null;
  branch_relationship: string;
  working_tree_status: string;
  linked_worktrees: GitLinkedWorktree[];
  upstream_health: string;
  recent_commits: GitRecentCommit[];
  diff_added_lines: number;
  diff_changed_lines: number;
  diff_deleted_lines: number;
}

/** One validated read-only snapshot for a selected Workspace project (spec §11). */
export interface ProjectDetailSnapshot {
  range_key: RangeKey;
  start_date: string | null;
  end_date: string | null;
  project: {
    id: number;
    name: string;
    root_path: string;
    tracking_status: WorkspaceTrackingStatus;
    detected_agents: CanonicalAgentId[];
    last_activity_at: string | null;
    git_branch: string | null;
  };
  metric_strip: ProjectMetricStrip;
  kanban: KanbanCard[];
  summary_markdown: string;
  summary_source: ProjectSummarySource;
  summary_ai_draft_markdown: string | null;
  summary_user_override_markdown: string | null;
  diary: ProjectDiaryEntry[];
  token_detail: ProjectTokenDetail;
  sessions: ProjectSessionView[];
  comments: ProjectComment[];
  docs: ProjectDoc[];
  git_status: GitStatusSnapshot;
  captured_at: string;
}
