import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';

export type DB = Database.Database;

function ensureSchemaPatches(db: DB): void {
  const kanbanColumns = db.prepare(`PRAGMA table_info(kanban_cards)`).all() as Array<{ name: string }>;
  if (!kanbanColumns.some((column) => column.name === 'status_locked_by_user')) {
    db.prepare(`ALTER TABLE kanban_cards ADD COLUMN status_locked_by_user INTEGER NOT NULL DEFAULT 0`).run();
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
  db.exec(SCHEMA_SQL);
  ensureSchemaPatches(db);
  db.prepare(
    `INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SCHEMA_VERSION);
  return db;
}
