import { describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { getProjectDetail } from '../src/services/projects.js';
import { updateSettings } from '../src/services/settings.js';
import {
  buildKanbanAiPrompt,
  syncKanbanAiCards,
  type KanbanAiTextGenerator,
} from '../src/services/kanbanAiSuggestions.js';

const TODAY = '2026-06-28';

function freshDb(): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 15, seed: 1337 });
  return db;
}

function runtime() {
  return { activeDbPath: ':memory:', projectRoots: [] };
}

function jsonGenerator(cards: unknown[]): KanbanAiTextGenerator {
  return async () => ({
    text: JSON.stringify({ cards }),
    agent_id: 'test-ai',
  });
}

function validCard(overrides: Record<string, unknown> = {}) {
  return {
    title: '整理 AI Kanban 自動卡片',
    description: '下一步是完成 AI Kanban strict JSON contract 的實作。',
    suggested_status: 'todo',
    confidence: 0.9,
    evidence: 'Next step: implement strict JSON contract.',
    reason: '明確提到下一步與未完成工作。',
    dedupe_key: 'kanban-ai-contract',
    ...overrides,
  };
}

describe('Kanban AI auto-add', () => {
  describe('安全邊界', () => {
    it('AI prompt input uses a redacted allowlist instead of raw ProjectDetailSnapshot', () => {
      const db = freshDb();
      db.prepare(`INSERT INTO project_docs (project_id, name, content, updated_at) VALUES (?, ?, ?, ?)`).run(
        1,
        'docs/private.md',
        'SECRET_TOKEN=abc123\n/Users/demo/Developer/dev-diary/raw transcript',
        `${TODAY}T00:00:00.000Z`,
      );
      db.prepare(`INSERT INTO comments (project_id, content, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        1,
        'raw comment with password=hunter2',
        '["Info"]',
        0,
        `${TODAY}T00:00:00.000Z`,
        `${TODAY}T00:00:00.000Z`,
      );

      const detail = getProjectDetail(db, 1, TODAY)!;
      const prompt = buildKanbanAiPrompt(detail, '請產生卡片');
      const serialized = JSON.stringify(prompt.input);

      expect(serialized).toContain('Development log');
      expect(serialized).not.toContain('/Users/demo/Developer/projects');
      expect(serialized).not.toContain('source_log_ref');
      expect(serialized).not.toContain('docs/private.md');
      expect(serialized).not.toContain('SECRET_TOKEN');
      expect(serialized).not.toContain('hunter2');
      expect(prompt.prompt).toContain('STRUCTURED_DATA');
      expect(prompt.prompt).toContain('untrusted data');
    });
  });

  describe('狀態回歸', () => {
    it('stable source_ref dedupes status changes and preserves manual status locks', async () => {
      const db = freshDb();
      const settings = updateSettings(db, { kanban_ai_auto_add: { enabled: true } }, runtime());

      const first = await syncKanbanAiCards(db, 1, TODAY, { range: 'all' }, settings, {
        generator: jsonGenerator([validCard({ suggested_status: 'todo' })]),
      });
      expect(first.inserted).toBe(1);
      const row = db.prepare(`SELECT id, source_ref FROM kanban_cards WHERE source_ref LIKE 'ai-suggest://%'`).get() as {
        id: number;
        source_ref: string;
      };
      expect(row.source_ref).toMatch(/^ai-suggest:\/\/p1\/[a-f0-9]{12}$/);
      expect(row.source_ref).not.toContain('todo');

      db.prepare(`UPDATE kanban_cards SET status = 'done', status_locked_by_user = 1 WHERE id = ?`).run(row.id);

      const second = await syncKanbanAiCards(db, 1, TODAY, { range: 'all' }, settings, {
        generator: jsonGenerator([validCard({ title: '整理 AI Kanban 自動卡片 v2', suggested_status: 'in_progress' })]),
      });
      expect(second.updated).toBe(1);
      const finalRows = db.prepare(`SELECT title, status, status_locked_by_user, source_ref FROM kanban_cards WHERE source_ref LIKE 'ai-suggest://%'`).all() as Array<{
        title: string;
        status: string;
        status_locked_by_user: number;
        source_ref: string;
      }>;
      expect(finalRows).toHaveLength(1);
      const final = finalRows[0]!;
      expect(final.source_ref).toBe(row.source_ref);
      expect(final.title).toBe('整理 AI Kanban 自動卡片 v2');
      expect(final.status).toBe('done');
      expect(final.status_locked_by_user).toBe(1);
    });

    it('provider and invalid JSON failures are non-throwing warnings', async () => {
      const db = freshDb();
      const settings = updateSettings(db, { kanban_ai_auto_add: { enabled: true } }, runtime());

      const thrown = await syncKanbanAiCards(db, 1, TODAY, { range: 'all' }, settings, {
        generator: async () => {
          throw new Error('provider offline');
        },
      });
      expect(thrown.inserted).toBe(0);
      expect(thrown.warnings.join('\n')).toContain('provider offline');

      const malformed = await syncKanbanAiCards(db, 1, TODAY, { range: 'all' }, settings, {
        generator: async () => ({ text: '```json\n{"cards":[]}\n```', agent_id: 'test-ai' }),
      });
      expect(malformed.inserted).toBe(0);
      expect(malformed.warnings.join('\n')).toContain('strict JSON');
    });
  });
});
