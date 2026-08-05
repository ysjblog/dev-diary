import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import { buildDailyMarkdownExport, buildRedactedBackupExport } from '../src/services/exports.js';

async function closeServer(server: ReturnType<ReturnType<typeof createServer>['listen']>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe('Export and backup', () => {
  describe('function 邏輯', () => {
    it('Markdown daily export uses precedence and totals', () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      db.prepare(`UPDATE daily_logs SET global_summary_user = ? WHERE date = ?`).run('User confirmed summary wins.', '2026-06-30');

      const artifact = buildDailyMarkdownExport(db, {
        date: '2026-06-30',
        includeComments: false,
        redactSensitiveValues: true,
      });

      expect(artifact.filename).toBe('devdiary-daily-2026-06-30.md');
      expect(artifact.content).toContain('# DevDiary Daily Export - 2026-06-30');
      expect(artifact.content).toContain('User confirmed summary wins.');
      expect(artifact.content).toContain('## Projects');
      expect(artifact.content).toContain('## Token Summary');
      expect(artifact.content).toMatch(/- Total tokens: \d+/);
      expect(artifact.content).toContain('- By agent:');
      expect(artifact.content).toContain('## Sessions');
      expect(artifact.content).not.toContain('cost');
      expect(artifact.content).not.toContain('source_log_ref');
    });

    it('Daily export uses the same Taipei date boundary as Workspace and Dashboard', () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-08-05' });
      db.exec(`DELETE FROM sessions; DELETE FROM token_usage;`);
      const insert = db.prepare(
        `INSERT INTO sessions (project_id, agent_name, model, start_time, token_total, source_log_ref)
         VALUES (1, 'codex-cli', 'gpt-5-codex', ?, ?, ?)`,
      );
      insert.run('2026-08-04T16:30:00.000Z', 100, 'test://export/taipei/1');
      insert.run('2026-08-05T15:59:59.000Z', 200, 'test://export/taipei/2');
      insert.run('2026-08-05T16:00:00.000Z', 300, 'test://export/taipei/3');

      const artifact = buildDailyMarkdownExport(db, {
        date: '2026-08-05', includeComments: false, redactSensitiveValues: true,
      });

      expect(artifact.content).toContain('- Total tokens: 300');
      expect(artifact.content).toContain('- Sessions: 2');
      expect(artifact.content).toContain('2026-08-04T16:30:00.000Z');
      expect(artifact.content).toContain('2026-08-05T15:59:59.000Z');
      expect(artifact.content).not.toContain('2026-08-05T16:00:00.000Z');
    });

    it('Daily export prefers project_daily_diaries and backup includes that collection', () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      const legacy = '## legacy daily_logs content';
      const tableFirst = '## table-first confirmed diary';
      db.prepare(`UPDATE daily_logs SET per_project_summary = ? WHERE date = ?`).run(
        JSON.stringify({ 1: legacy }),
        '2026-06-30',
      );
      db.prepare(
        `INSERT INTO project_daily_diaries
         (project_id, date, markdown, status, fallback_report, created_at, updated_at)
         VALUES (1, '2026-06-30', ?, 'confirmed', NULL, ?, ?)`,
      ).run(tableFirst, '2026-06-30T01:00:00.000Z', '2026-06-30T01:00:00.000Z');

      const markdown = buildDailyMarkdownExport(db, {
        date: '2026-06-30',
        includeComments: false,
        redactSensitiveValues: true,
      });
      const backup = buildRedactedBackupExport(db, {
        includeComments: false,
        redactSensitiveValues: true,
      });

      expect(markdown.content).toContain(tableFirst);
      expect(markdown.content).not.toContain(legacy);
      expect(backup.project_daily_diaries).toEqual(expect.arrayContaining([
        expect.objectContaining({ project_id: 1, date: '2026-06-30', markdown: tableFirst, status: 'confirmed' }),
      ]));
      expect(db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('project_daily_diaries', 'daily_scheduler_runs') ORDER BY name`,
      ).all()).toEqual([
        { name: 'daily_scheduler_runs' },
        { name: 'project_daily_diaries' },
      ]);
    });

    it('Markdown export redacts secret-like values and source refs', () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      db.prepare(`UPDATE daily_logs SET global_summary_user = ? WHERE date = ?`).run(
        'Deploy used password=super-secret and token sk-1234567890abcdef.',
        '2026-06-30',
      );
      db.prepare(
        `INSERT INTO comments (project_id, content, tags, pinned, created_at, updated_at)
         VALUES (1, ?, '[]', 0, '2026-06-30T10:00:00Z', '2026-06-30T10:00:00Z')`,
      ).run('API key is ghp_1234567890abcdef and source_log_ref=claude-code:///secret/path');

      const artifact = buildDailyMarkdownExport(db, {
        date: '2026-06-30',
        includeComments: true,
        redactSensitiveValues: true,
      });

      expect(artifact.content).toContain('[REDACTED]');
      expect(artifact.content).not.toContain('super-secret');
      expect(artifact.content).not.toContain('sk-1234567890abcdef');
      expect(artifact.content).not.toContain('ghp_1234567890abcdef');
      expect(artifact.content).not.toContain('claude-code:///secret/path');
    });

    it('Comments are opt-in', () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      db.prepare(
        `INSERT INTO comments (project_id, content, tags, pinned, created_at, updated_at)
         VALUES (1, 'Export-only comment', '[]', 0, '2026-06-30T10:00:00Z', '2026-06-30T10:00:00Z')`,
      ).run();

      const disabled = buildDailyMarkdownExport(db, {
        date: '2026-06-30',
        includeComments: false,
        redactSensitiveValues: true,
      });
      const enabled = buildDailyMarkdownExport(db, {
        date: '2026-06-30',
        includeComments: true,
        redactSensitiveValues: true,
      });

      expect(disabled.content).not.toContain('Export-only comment');
      expect(enabled.content).toContain('Export-only comment');
    });

    it('Backup endpoint data is structured and redacted', () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      db.prepare(
        `INSERT INTO project_docs (project_id, name, content, updated_at)
         VALUES (1, 'secret.md', 'private_key=-----BEGIN PRIVATE KEY-----', '2026-06-30T00:00:00Z')`,
      ).run();

      const bundle = buildRedactedBackupExport(db, {
        includeComments: true,
        redactSensitiveValues: true,
      });
      const serialized = JSON.stringify(bundle);

      expect(bundle.metadata.kind).toBe('devdiary-redacted-backup');
      expect(bundle.projects.length).toBeGreaterThan(0);
      expect(bundle.sessions.length).toBeGreaterThan(0);
      expect(bundle.sessions[0]).not.toHaveProperty('source_log_ref');
      expect(bundle.token_usage.length).toBeGreaterThan(0);
      expect(bundle.daily_logs.length).toBeGreaterThan(0);
      expect(bundle.project_docs.length).toBeGreaterThan(0);
      expect(serialized).toContain('[REDACTED]');
      expect(serialized).not.toContain('-----BEGIN PRIVATE KEY-----');
    });
  });

  describe('Mock API', () => {
    it('Daily export default date uses the Asia/Taipei calendar day', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-30T17:30:00.000Z'));
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-07-01' });
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const res = await fetch(`http://127.0.0.1:${address.port}/api/exports/daily`);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toContain('devdiary-daily-2026-07-01.md');
        expect(await res.text()).toContain('# DevDiary Daily Export - 2026-07-01');
      } finally {
        await closeServer(server);
        vi.useRealTimers();
      }
    });

    it('Daily export endpoint returns downloadable Markdown', async () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const res = await fetch(`http://127.0.0.1:${address.port}/api/exports/daily?date=2026-06-30`);
        const body = await res.text();

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/markdown');
        expect(res.headers.get('content-disposition')).toContain('devdiary-daily-2026-06-30.md');
        expect(body).toContain('# DevDiary Daily Export - 2026-06-30');
      } finally {
        await closeServer(server);
        db.close();
      }
    });

    it('Backup endpoint returns redacted structured JSON', async () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const res = await fetch(`http://127.0.0.1:${address.port}/api/exports/backup`);
        const body = (await res.json()) as { metadata: { kind: string }; sessions: Array<Record<string, unknown>> };

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        expect(res.headers.get('content-disposition')).toContain('devdiary-backup-redacted');
        expect(body.metadata.kind).toBe('devdiary-redacted-backup');
        expect(body.sessions[0]).not.toHaveProperty('source_log_ref');
      } finally {
        await closeServer(server);
        db.close();
      }
    });

    it('Daily export endpoint rejects malformed dates', async () => {
      const db = openDb(':memory:');
      seedDatabase(db, { today: '2026-06-30' });
      const app = createServer(db, { dbPath: ':memory:', projectRoots: [] });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const res = await fetch(`http://127.0.0.1:${address.port}/api/exports/daily?date=not-a-date`);
        const body = (await res.json()) as { error: string; message: string };

        expect(res.status).toBe(400);
        expect(body.error).toBe('invalid_export_request');
        expect(body.message).toBe('date must be YYYY-MM-DD');
      } finally {
        await closeServer(server);
        db.close();
      }
    });
  });
});
