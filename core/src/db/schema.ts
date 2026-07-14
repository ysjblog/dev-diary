// SQLite schema for DevDiary Core. Mirrors canonical data model (spec §7).
// Only the Core Engine writes here (spec §4.2); UI/agents go through Core API.

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  root_path          TEXT NOT NULL UNIQUE,
  tracking_status    TEXT NOT NULL CHECK (tracking_status IN ('active','idle','paused')),
  created_at         TEXT NOT NULL,
  last_activity_at   TEXT,
  detected_agents    TEXT NOT NULL DEFAULT '[]',
  ignored            INTEGER NOT NULL DEFAULT 0,
  scan_paused        INTEGER NOT NULL DEFAULT 0,
  git_repo_detected  INTEGER NOT NULL DEFAULT 0,
  git_branch         TEXT,
  git_worktree_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kanban_cards (
  id                INTEGER PRIMARY KEY,
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL CHECK (status IN ('todo','in_progress','done')),
  assignee_agent_id TEXT,
  due_date          TEXT,
  source_ref        TEXT,
  status_locked_by_user INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  INTEGER PRIMARY KEY,
  project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name          TEXT NOT NULL,
  model               TEXT NOT NULL,
  start_time          TEXT NOT NULL,
  end_time            TEXT,
  token_total         INTEGER NOT NULL DEFAULT 0,
  token_input         INTEGER NOT NULL DEFAULT 0,
  token_cached        INTEGER NOT NULL DEFAULT 0,
  token_output        INTEGER NOT NULL DEFAULT 0,
  token_reasoning     INTEGER NOT NULL DEFAULT 0,
  summary             TEXT,
  source_log_ref      TEXT NOT NULL UNIQUE,
  parser_confidence   REAL NOT NULL DEFAULT 1.0,
  command             TEXT,
  duration            INTEGER,
  status              TEXT NOT NULL DEFAULT 'completed',
  redacted_log_excerpt TEXT,
  task_count          INTEGER,
  transcript_length   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start   ON sessions(start_time);

CREATE TABLE IF NOT EXISTS token_usage (
  date            TEXT NOT NULL,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name      TEXT NOT NULL,
  model           TEXT NOT NULL,
  token_total     INTEGER NOT NULL DEFAULT 0,
  token_input     INTEGER NOT NULL DEFAULT 0,
  token_cached    INTEGER NOT NULL DEFAULT 0,
  token_output    INTEGER NOT NULL DEFAULT 0,
  token_reasoning INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, project_id, agent_name, model)
);
CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date);

CREATE TABLE IF NOT EXISTS daily_logs (
  date                TEXT PRIMARY KEY,
  global_summary_ai   TEXT,
  global_summary_user TEXT,
  per_project_summary TEXT,
  blockers            TEXT NOT NULL DEFAULT '[]',
  warnings            TEXT NOT NULL DEFAULT '[]',
  fallback_report     TEXT,
  summary_status      TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '[]',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_docs (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_docs_project ON project_docs(project_id);

CREATE TABLE IF NOT EXISTS project_summaries (
  project_id       INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  markdown_ai      TEXT,
  markdown_user    TEXT,
  ai_updated_at    TEXT,
  user_updated_at  TEXT
);

-- Per-file parse cache for CLI activity logs (spec: unlimited-retention scan).
-- Keyed by (agent_name, file_path); a row is reused as long as mtime_ms still
-- matches the file on disk, so full history can be scanned without re-reading
-- every log file on every cycle.
CREATE TABLE IF NOT EXISTS log_file_scan_cache (
  agent_name   TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  mtime_ms     REAL NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (agent_name, file_path)
);
`;

export const SCHEMA_VERSION = '5';
