import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';

export type DB = Database.Database;
export const SQLITE_BUSY_TIMEOUT_MS = 5_000;

function ensureSchemaPatches(db: DB): void {
  const kanbanColumns = db.prepare(`PRAGMA table_info(kanban_cards)`).all() as Array<{ name: string }>;
  if (!kanbanColumns.some((column) => column.name === 'status_locked_by_user')) {
    db.prepare(`ALTER TABLE kanban_cards ADD COLUMN status_locked_by_user INTEGER NOT NULL DEFAULT 0`).run();
  }
  const projectColumns = db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>;
  if (!projectColumns.some((column) => column.name === 'presence_status')) {
    db.prepare(`ALTER TABLE projects ADD COLUMN presence_status TEXT NOT NULL DEFAULT 'present' CHECK (presence_status IN ('present','missing'))`).run();
  }
  if (!projectColumns.some((column) => column.name === 'missing_check_count')) {
    db.prepare(`ALTER TABLE projects ADD COLUMN missing_check_count INTEGER NOT NULL DEFAULT 0`).run();
  }
  if (!projectColumns.some((column) => column.name === 'last_presence_check_at')) {
    db.prepare(`ALTER TABLE projects ADD COLUMN last_presence_check_at TEXT`).run();
  }
  const schedulerColumns = db.prepare(`PRAGMA table_info(daily_scheduler_runs)`).all() as Array<{ name: string }>;
  if (!schedulerColumns.some((column) => column.name === 'lease_generation')) {
    db.prepare(`ALTER TABLE daily_scheduler_runs ADD COLUMN lease_generation INTEGER NOT NULL DEFAULT 1`).run();
  }
  if (!schedulerColumns.some((column) => column.name === 'telemetry_json')) {
    db.prepare(`ALTER TABLE daily_scheduler_runs ADD COLUMN telemetry_json TEXT`).run();
  }
}

/**
 * Open a DevDiary SQLite database and ensure the schema exists.
 * Pass ':memory:' for tests, or an absolute file path for the app data folder.
 */
export function openDb(path: string): DB {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  db.exec(SCHEMA_SQL);
  ensureSchemaPatches(db);
  db.prepare(
    `INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SCHEMA_VERSION);
  return db;
}
