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
  git_worktree_count INTEGER NOT NULL DEFAULT 0,
  presence_status    TEXT NOT NULL DEFAULT 'present' CHECK (presence_status IN ('present','missing')),
  missing_check_count INTEGER NOT NULL DEFAULT 0,
  last_presence_check_at TEXT
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

CREATE TABLE IF NOT EXISTS project_daily_diaries (
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  markdown        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('ai_generated','confirmed')),
  fallback_report TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (project_id, date)
);

CREATE TABLE IF NOT EXISTS daily_scheduler_runs (
  date              TEXT PRIMARY KEY,
  owner_instance_id TEXT NOT NULL,
  lease_expires_at  TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  started_at        TEXT NOT NULL,
  completed_at      TEXT,
  error             TEXT,
  lease_generation  INTEGER NOT NULL DEFAULT 1,
  telemetry_json    TEXT
);

CREATE TABLE IF NOT EXISTS project_reconciliation_runs (
  period_start      TEXT PRIMARY KEY,
  owner_instance_id TEXT NOT NULL,
  lease_expires_at  TEXT NOT NULL,
  started_at        TEXT NOT NULL,
  completed_at      TEXT,
  status            TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  checked_roots     TEXT NOT NULL DEFAULT '[]',
  result_json       TEXT,
  error             TEXT
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

CREATE TABLE IF NOT EXISTS codex_desktop_resume_targets (
  thread_id TEXT PRIMARY KEY
    CHECK (length(thread_id)=36 AND lower(thread_id)=thread_id
      AND thread_id NOT GLOB '*[^0-9a-f-]*'
      AND substr(thread_id,9,1)='-' AND substr(thread_id,14,1)='-'
      AND substr(thread_id,19,1)='-' AND substr(thread_id,24,1)='-'),
  target_key_digest TEXT NOT NULL UNIQUE
    CHECK (length(target_key_digest)=64 AND target_key_digest NOT GLOB '*[^0-9a-f]*'),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  state TEXT NOT NULL DEFAULT 'watching'
    CHECK (state IN ('watching','waiting_for_reset','claimed','resuming','resumed','needs_attention','partial_input_possible')),
  session_locator TEXT,
  timezone_id TEXT,
  timezone_authority TEXT,
  registration_file_dev TEXT CHECK (registration_file_dev IS NULL OR registration_file_dev='0'
    OR (length(registration_file_dev)>0 AND registration_file_dev NOT LIKE '0%' AND registration_file_dev NOT GLOB '*[^0-9]*')),
  registration_file_ino TEXT CHECK (registration_file_ino IS NULL OR registration_file_ino='0'
    OR (length(registration_file_ino)>0 AND registration_file_ino NOT LIKE '0%' AND registration_file_ino NOT GLOB '*[^0-9]*')),
  registration_end_offset TEXT CHECK (registration_end_offset IS NULL OR registration_end_offset='0'
    OR (length(registration_end_offset)>0 AND registration_end_offset NOT LIKE '0%' AND registration_end_offset NOT GLOB '*[^0-9]*')),
  registration_prefix_digest TEXT CHECK (registration_prefix_digest IS NULL OR (length(registration_prefix_digest)=64 AND registration_prefix_digest NOT GLOB '*[^0-9a-f]*')),
  current_evidence_id TEXT,
  current_evidence_cursor TEXT,
  completed_evidence_id TEXT,
  action_high_watermark TEXT,
  reset_at_ms INTEGER CHECK (reset_at_ms IS NULL OR reset_at_ms BETWEEN 0 AND 9007199254740991),
  attempt_token TEXT CHECK (attempt_token IS NULL OR (length(attempt_token)=32 AND attempt_token NOT GLOB '*[^0-9a-f]*')),
  startup_nonce TEXT CHECK (startup_nonce IS NULL OR (length(startup_nonce)=32 AND startup_nonce NOT GLOB '*[^0-9a-f]*')),
  startup_deadline_ms INTEGER CHECK (startup_deadline_ms IS NULL OR startup_deadline_ms BETWEEN 0 AND 9007199254740991),
  action_deadline_ms INTEGER CHECK (action_deadline_ms IS NULL OR action_deadline_ms BETWEEN 0 AND 9007199254740991),
  child_pid INTEGER CHECK (child_pid IS NULL OR child_pid BETWEEN 1 AND 9007199254740991),
  child_instance_token TEXT CHECK (child_instance_token IS NULL OR (length(child_instance_token)=32 AND child_instance_token NOT GLOB '*[^0-9a-f]*')),
  child_process_title TEXT,
  action_phase TEXT CHECK (action_phase IS NULL OR action_phase IN ('claimed','child_authorized','ui_preflight','text_dispatching','text_dispatched','post_text_identity_verified','return_dispatching','submitted')),
  terminal_outcome TEXT CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('pre_text_failed','partial_input_possible','submitted')),
  terminal_phase TEXT CHECK (terminal_phase IS NULL OR terminal_phase IN ('claimed','child_authorized','ui_preflight','text_dispatching','text_dispatched','post_text_identity_verified','return_dispatching','submitted')),
  terminal_lease_token TEXT CHECK (terminal_lease_token IS NULL OR (length(terminal_lease_token)=32 AND terminal_lease_token NOT GLOB '*[^0-9a-f]*')),
  terminal_attempt_token TEXT CHECK (terminal_attempt_token IS NULL OR (length(terminal_attempt_token)=32 AND terminal_attempt_token NOT GLOB '*[^0-9a-f]*')),
  terminal_generation INTEGER CHECK (terminal_generation IS NULL OR terminal_generation BETWEEN 1 AND 9007199254740991),
  terminal_nonce TEXT CHECK (terminal_nonce IS NULL OR (length(terminal_nonce)=32 AND terminal_nonce NOT GLOB '*[^0-9a-f]*')),
  terminal_pid INTEGER CHECK (terminal_pid IS NULL OR terminal_pid BETWEEN 1 AND 9007199254740991),
  terminal_child_instance_token TEXT CHECK (terminal_child_instance_token IS NULL OR (length(terminal_child_instance_token)=32 AND terminal_child_instance_token NOT GLOB '*[^0-9a-f]*')),
  terminal_child_process_title TEXT,
  terminal_recorded_at_ms INTEGER CHECK (terminal_recorded_at_ms IS NULL OR terminal_recorded_at_ms BETWEEN 0 AND 9007199254740991),
  lock_quarantine_required INTEGER NOT NULL DEFAULT 0 CHECK (lock_quarantine_required IN (0,1)),
  lock_quarantine_state TEXT CHECK (lock_quarantine_state IS NULL OR lock_quarantine_state='moving'),
  lock_quarantine_name TEXT,
  lock_quarantine_source_dev TEXT,
  lock_quarantine_source_ino TEXT,
  lock_quarantine_source_mode INTEGER,
  last_quarantined_name TEXT,
  last_quarantined_source_dev TEXT,
  last_quarantined_source_ino TEXT,
  lock_quarantine_completed_at_ms INTEGER,
  last_error_code TEXT,
  registered_at_ms INTEGER NOT NULL CHECK (registered_at_ms BETWEEN 0 AND 9007199254740991),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms BETWEEN 0 AND 9007199254740991),
  CHECK ((attempt_token IS NULL AND startup_nonce IS NULL AND startup_deadline_ms IS NULL AND action_deadline_ms IS NULL)
    OR (attempt_token IS NOT NULL AND startup_nonce IS NOT NULL AND startup_deadline_ms IS NOT NULL AND action_deadline_ms IS NOT NULL)),
  CHECK ((child_pid IS NULL AND child_instance_token IS NULL AND child_process_title IS NULL)
    OR (child_pid IS NOT NULL AND child_instance_token IS NOT NULL
      AND child_process_title='devdiary-resume-' || child_instance_token)),
  CHECK ((terminal_outcome IS NULL AND terminal_phase IS NULL AND terminal_lease_token IS NULL
      AND terminal_attempt_token IS NULL AND terminal_generation IS NULL AND terminal_nonce IS NULL
      AND terminal_pid IS NULL AND terminal_child_instance_token IS NULL
      AND terminal_child_process_title IS NULL AND terminal_recorded_at_ms IS NULL)
    OR (terminal_outcome IS NOT NULL AND terminal_phase IS NOT NULL AND terminal_lease_token IS NOT NULL
      AND terminal_attempt_token IS NOT NULL AND terminal_generation IS NOT NULL AND terminal_nonce IS NOT NULL
      AND terminal_pid IS NOT NULL AND terminal_child_instance_token IS NOT NULL
      AND terminal_child_process_title='devdiary-resume-' || terminal_child_instance_token
      AND terminal_recorded_at_ms IS NOT NULL)),
  CHECK ((lock_quarantine_state IS NULL AND lock_quarantine_name IS NULL AND lock_quarantine_source_dev IS NULL
      AND lock_quarantine_source_ino IS NULL AND lock_quarantine_source_mode IS NULL)
    OR (lock_quarantine_state='moving' AND lock_quarantine_name GLOB 'resume-action.quarantine.[0-9a-f]*'
      AND length(lock_quarantine_name)=57 AND lock_quarantine_source_dev IS NOT NULL
      AND lock_quarantine_source_ino IS NOT NULL AND lock_quarantine_source_mode IS NOT NULL)),
  CHECK ((last_quarantined_name IS NULL AND last_quarantined_source_dev IS NULL
      AND last_quarantined_source_ino IS NULL AND lock_quarantine_completed_at_ms IS NULL)
    OR (last_quarantined_name IS NOT NULL AND last_quarantined_source_dev IS NOT NULL
      AND last_quarantined_source_ino IS NOT NULL AND lock_quarantine_completed_at_ms IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS codex_desktop_resume_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  active_target_digest TEXT REFERENCES codex_desktop_resume_targets(target_key_digest),
  owner_id TEXT CHECK (owner_id IS NULL OR (length(owner_id)=32 AND owner_id NOT GLOB '*[^0-9a-f]*')),
  lease_token TEXT CHECK (lease_token IS NULL OR (length(lease_token)=32 AND lease_token NOT GLOB '*[^0-9a-f]*')),
  lease_generation INTEGER CHECK (lease_generation IS NULL OR lease_generation BETWEEN 1 AND 9007199254740991),
  acquired_at_ms INTEGER CHECK (acquired_at_ms IS NULL OR acquired_at_ms BETWEEN 0 AND 9007199254740991),
  renewed_at_ms INTEGER CHECK (renewed_at_ms IS NULL OR renewed_at_ms BETWEEN 0 AND 9007199254740991),
  lease_expires_at_ms INTEGER CHECK (lease_expires_at_ms IS NULL OR lease_expires_at_ms BETWEEN 0 AND 9007199254740991),
  updated_at_ms INTEGER NOT NULL DEFAULT 0 CHECK (updated_at_ms BETWEEN 0 AND 9007199254740991),
  CHECK ((active_target_digest IS NULL AND owner_id IS NULL AND lease_token IS NULL AND lease_generation IS NULL
      AND acquired_at_ms IS NULL AND renewed_at_ms IS NULL AND lease_expires_at_ms IS NULL)
    OR (active_target_digest IS NOT NULL AND owner_id IS NOT NULL AND lease_token IS NOT NULL
      AND lease_generation IS NOT NULL AND acquired_at_ms IS NOT NULL AND renewed_at_ms IS NOT NULL
      AND lease_expires_at_ms IS NOT NULL))
);

INSERT OR IGNORE INTO codex_desktop_resume_state (id,enabled,revision,updated_at_ms) VALUES (1,0,0,0);
`;

export const SCHEMA_VERSION = '8';
