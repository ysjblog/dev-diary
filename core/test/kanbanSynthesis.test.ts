import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { getProjectDetail } from '../src/services/projects.js';
import { buildKanbanSynthesisCandidates, redactSensitiveText } from '../src/services/kanbanSynthesis.js';

const TODAY = '2026-06-30';

function freshDb() {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 15, seed: 1337 });
  return db;
}

describe('Kanban auto synthesis', () => {
  describe('function 邏輯', () => {
    it('從 recent sessions 產生 deterministic agent-synth in-progress card', () => {
      const db = freshDb();
      const snapshot = getProjectDetail(db, 1, TODAY, { range: '24h' })!;

      const cards = buildKanbanSynthesisCandidates(snapshot);

      expect(cards.some((card) => /^agent-synth:\/\/p1\/session\/(claude-code|codex-cli|antigravity-cli|other)$/.test(card.source_ref))).toBe(true);
      expect(cards.every((card) => ['todo', 'in_progress', 'done'].includes(card.status))).toBe(true);
      expect(cards.every((card) => !card.title.includes('/Applications/'))).toBe(true);
    });

    it('從明確 TODO / blocker / failed-test 訊號產生 stable todo card', () => {
      const db = freshDb();
      const snapshot = getProjectDetail(db, 1, TODAY, { range: '24h' })!;
      const baseSession = snapshot.sessions[0]!;
      const cards = buildKanbanSynthesisCandidates({
        ...snapshot,
        sessions: [
          {
            ...baseSession,
            agent_name: 'codex-cli',
            command: 'TODO fix failing settings test token=abc123456',
            excerpt: 'Blocker: failed test in /Users/demo/Developer/projects/app raw transcript',
            status: 'completed',
          },
          ...snapshot.sessions.slice(1),
        ],
      });

      const todo = cards.find((card) => card.status === 'todo');
      expect(todo?.source_ref).toBe('agent-synth://p1/todo/codex-cli');
      expect(todo?.title).toMatch(/^待辦：/);
      expect(todo?.description).toContain('明確待辦訊號');
      expect(todo?.title).not.toContain('token=abc123456');
      expect(todo?.description).not.toContain('/Applications/');
      expect(todo?.description).not.toMatch(/raw transcript/i);
    });

    it('dirty working tree alone does not create generic cleanup todo cards', () => {
      const db = freshDb();
      const snapshot = getProjectDetail(db, 1, TODAY, { range: '24h' })!;
      const cards = buildKanbanSynthesisCandidates({
        ...snapshot,
        sessions: [],
        git_status: {
          ...snapshot.git_status,
          available: true,
          working_tree_status: 'dirty',
          recent_commits: [],
        },
      });

      expect(cards).toEqual([]);
    });

    it('redaction removes absolute paths, secrets, and raw transcript wording', () => {
      const text = redactSensitiveText('open /Users/demo/Developer/projects/app token=abc123456 raw transcript password=hunter222');

      expect(text).not.toContain('/Applications/');
      expect(text).not.toContain('token=abc123456');
      expect(text).not.toContain('password=hunter222');
      expect(text).not.toMatch(/raw transcript/i);
      expect(text).toContain('[redacted-path]');
      expect(text).toContain('[redacted-secret]');
    });
  });
});
