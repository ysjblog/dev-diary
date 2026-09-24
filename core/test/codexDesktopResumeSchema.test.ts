import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { SCHEMA_VERSION } from '../src/db/schema.js';

describe('Codex Desktop v8 dedicated persistence', () => {
  it('creates a disabled singleton and dedicated multi-target table at schema version 8', () => {
    const db = openDb(':memory:');
    expect(SCHEMA_VERSION).toBe('8');
    expect((db.prepare(`SELECT value FROM schema_meta WHERE key='schema_version'`).get() as { value: string }).value).toBe('8');
    expect(db.prepare(`SELECT enabled, revision, owner_id, lease_token FROM codex_desktop_resume_state WHERE id=1`).get()).toEqual({
      enabled: 0, revision: 0, owner_id: null, lease_token: null,
    });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM codex_desktop_resume_targets`).get()).toEqual({ count: 0 });
  });

  it('enforces canonical target identity, unique digest and bounded display state in SQLite', () => {
    const db = openDb(':memory:');
    const insert = db.prepare(`INSERT INTO codex_desktop_resume_targets
      (thread_id,target_key_digest,display_name,enabled,state,registered_at_ms,updated_at_ms)
      VALUES (?,?,?,?,?,?,?)`);
    insert.run('00000000-0000-4000-8000-000000000001', 'a'.repeat(64), '任務 A', 1, 'watching', 1, 1);
    expect(() => insert.run('00000000-0000-4000-8000-000000000002', 'a'.repeat(64), '任務 B', 1, 'watching', 1, 1)).toThrow();
    expect(() => insert.run('UPPER-ID', 'b'.repeat(64), '任務 B', 1, 'watching', 1, 1)).toThrow();
    expect(() => insert.run('00000000-0000-4000-8000-000000000003', 'g'.repeat(64), '', 1, 'unknown', 1, 1)).toThrow();
  });

  it('rejects partially populated lease and terminal authority groups', () => {
    const db = openDb(':memory:');
    expect(() => db.prepare(`UPDATE codex_desktop_resume_state SET owner_id=? WHERE id=1`).run('a'.repeat(32))).toThrow();
    db.prepare(`INSERT INTO codex_desktop_resume_targets
      (thread_id,target_key_digest,display_name,enabled,state,registered_at_ms,updated_at_ms)
      VALUES (?,?,?,?,?,?,?)`).run('00000000-0000-4000-8000-000000000001', 'a'.repeat(64), '任務', 1, 'watching', 1, 1);
    expect(() => db.prepare(`UPDATE codex_desktop_resume_targets SET terminal_outcome='resumed' WHERE thread_id=?`)
      .run('00000000-0000-4000-8000-000000000001')).toThrow();
  });

  it('removes legacy shared resume state once while preserving unrelated settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-v8-migration-')); const path = join(root, 'db.sqlite');
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE schema_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    legacy.prepare(`INSERT INTO app_settings VALUES ('core',?,'2026-09-09T00:00:00.000Z')`).run(JSON.stringify({ revision: 7, appearance: 'dark', codex_desktop_resume: { enabled: true, state: 'waiting_for_reset' } }));
    legacy.close();
    const db = openDb(path);
    const stored = JSON.parse((db.prepare(`SELECT value FROM app_settings WHERE key='core'`).get() as { value: string }).value);
    expect(stored).toEqual({ revision: 7, appearance: 'dark' });
    expect((db.prepare(`SELECT value FROM schema_meta WHERE key='codex_desktop_resume_migration'`).get() as { value: string }).value).toBe('legacy_reregistration_required');
    db.close();
    const reopened = openDb(path);
    reopened.prepare(`UPDATE app_settings SET value=? WHERE key='core'`).run(JSON.stringify({ revision: 8, appearance: 'light', codex_desktop_resume: { should_remain_after_marker: true } }));
    reopened.close();
    const reopenedAgain = openDb(path);
    const unchanged = JSON.parse((reopenedAgain.prepare(`SELECT value FROM app_settings WHERE key='core'`).get() as { value: string }).value);
    expect(unchanged.codex_desktop_resume).toEqual({ should_remain_after_marker: true });
    reopenedAgain.close(); rmSync(root, { recursive: true, force: true });
  });
});
