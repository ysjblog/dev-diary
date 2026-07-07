import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import {
  ProjectWriteNotFoundError,
  ProjectWriteValidationError,
  acceptProjectSummaryDraft,
  addProjectComment,
  deleteProjectComment,
  regenerateProjectSummary,
  regenerateProjectDiaryEntryWithAgent,
  saveProjectSummary,
  saveProjectDiaryEntry,
  updateKanbanCardStatus,
  updateProjectComment,
} from '../src/services/projectWrites.js';

const TODAY = '2026-06-28';
const roots: string[] = [];

function freshDb(): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 15, seed: 1337 });
  return db;
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-writes-'));
  roots.push(root);
  return root;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepoProject(db: DB): string {
  const root = tempRoot();
  const repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  writeFileSync(join(repo, 'README.md'), '# Demo\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['-c', 'user.name=DevDiary Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Initial commit']);
  db.prepare(`UPDATE projects SET root_path = ?, git_repo_detected = 1, git_branch = 'main' WHERE id = 1`).run(repo);
  return repo;
}

function firstCardId(db: DB, projectId: number): number {
  const row = db.prepare(`SELECT id FROM kanban_cards WHERE project_id = ? ORDER BY id LIMIT 1`).get(projectId) as { id: number };
  return row.id;
}

function firstCommentId(db: DB, projectId: number): number {
  const row = db.prepare(`SELECT id FROM comments WHERE project_id = ? ORDER BY id LIMIT 1`).get(projectId) as { id: number };
  return row.id;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Projects Workspace write paths', () => {
  let db: DB;

  beforeEach(() => {
    db = freshDb();
  });

  describe('function 邏輯', () => {
    it('新增 comment 會 trim content、正規化 tags，並持久化到 selected project', () => {
      const detail = addProjectComment(db, 1, { content: '  ship it  ', tags: [' Bug ', '', 'Feature'] }, TODAY);
      const created = detail.comments.find((c) => c.content === 'ship it')!;

      expect(created.tags).toEqual(['Bug', 'Feature']);
      expect(created.pinned).toBe(false);
      const row = db.prepare(`SELECT project_id, content, tags FROM comments WHERE id = ?`).get(created.id) as {
        project_id: number;
        content: string;
        tags: string;
      };
      expect(row.project_id).toBe(1);
      expect(row.content).toBe('ship it');
      expect(JSON.parse(row.tags)).toEqual(['Bug', 'Feature']);
    });

    it('空 comment、過長 comment、畸形 tags 會回 validation error 且不寫 DB', () => {
      const before = (db.prepare(`SELECT COUNT(*) AS c FROM comments WHERE project_id = 1`).get() as { c: number }).c;

      expect(() => addProjectComment(db, 1, { content: '   ', tags: [] }, TODAY)).toThrow(ProjectWriteValidationError);
      expect(() => addProjectComment(db, 1, { content: 'x'.repeat(5001), tags: [] }, TODAY)).toThrow(
        ProjectWriteValidationError,
      );
      expect(() => addProjectComment(db, 1, { content: 'ok', tags: 'Bug' }, TODAY)).toThrow(ProjectWriteValidationError);

      const after = (db.prepare(`SELECT COUNT(*) AS c FROM comments WHERE project_id = 1`).get() as { c: number }).c;
      expect(after).toBe(before);
    });

    it('comment pin toggle 只能更新同 project comment', () => {
      const commentId = firstCommentId(db, 1);

      const detail = updateProjectComment(db, 1, commentId, { pinned: true }, TODAY);
      expect(detail.comments[0]!.id).toBe(commentId);
      expect(detail.comments[0]!.pinned).toBe(true);

      expect(() => updateProjectComment(db, 2, commentId, { pinned: false }, TODAY)).toThrow(ProjectWriteNotFoundError);
      const row = db.prepare(`SELECT pinned FROM comments WHERE id = ?`).get(commentId) as { pinned: number };
      expect(row.pinned).toBe(1);
    });

    it('delete comment 只刪 selected project comment', () => {
      const commentId = firstCommentId(db, 1);

      const detail = deleteProjectComment(db, 1, commentId, TODAY);
      expect(detail.comments.some((c) => c.id === commentId)).toBe(false);

      const otherCommentId = firstCommentId(db, 1);
      expect(() => deleteProjectComment(db, 2, otherCommentId, TODAY)).toThrow(ProjectWriteNotFoundError);
      const row = db.prepare(`SELECT COUNT(*) AS c FROM comments WHERE id = ?`).get(otherCommentId) as { c: number };
      expect(row.c).toBe(1);
    });

    it('Kanban status update 只允許三個 v1 enum 並持久化', () => {
      const cardId = firstCardId(db, 1);

      const detail = updateKanbanCardStatus(db, 1, cardId, { status: 'done' }, TODAY);
      expect(detail.kanban.find((c) => c.id === cardId)!.status).toBe('done');
      expect(detail.kanban.find((c) => c.id === cardId)!.status_locked_by_user).toBe(true);
      const row = db.prepare(`SELECT status, status_locked_by_user FROM kanban_cards WHERE id = ?`).get(cardId) as {
        status: string;
        status_locked_by_user: number;
      };
      expect(row.status).toBe('done');
      expect(row.status_locked_by_user).toBe(1);
    });

    it('Kanban invalid status 或跨 project card 不寫 DB', () => {
      const cardId = firstCardId(db, 1);
      const before = (db.prepare(`SELECT status FROM kanban_cards WHERE id = ?`).get(cardId) as { status: string }).status;

      expect(() => updateKanbanCardStatus(db, 1, cardId, { status: 'blocked' }, TODAY)).toThrow(ProjectWriteValidationError);
      expect(() => updateKanbanCardStatus(db, 2, cardId, { status: 'done' }, TODAY)).toThrow(ProjectWriteNotFoundError);

      const after = (db.prepare(`SELECT status FROM kanban_cards WHERE id = ?`).get(cardId) as { status: string }).status;
      expect(after).toBe(before);
    });

    it('summary save 建立 user override，且優先於 AI / fallback 顯示', () => {
      const detail = saveProjectSummary(db, 1, { markdown: '## 手動摘要\n- 已確認。' }, TODAY);

      expect(detail.summary_markdown).toBe('## 手動摘要\n- 已確認。');
      expect(detail.summary_source).toBe('user');

      const persisted = saveProjectSummary(db, 1, { markdown: '## 手動摘要 v2' }, TODAY);
      expect(persisted.summary_markdown).toBe('## 手動摘要 v2');
      expect(persisted.summary_source).toBe('user');
    });

    it('AI regenerate 只更新 AI draft，不覆蓋 user override', () => {
      saveProjectSummary(db, 1, { markdown: '## 手動摘要' }, TODAY);

      const detail = regenerateProjectSummary(db, 1, TODAY);

      expect(detail.summary_markdown).toBe('## 手動摘要');
      expect(detail.summary_source).toBe('user');
      expect(detail.summary_ai_draft_markdown).toContain('AI 草稿');
    });

    it('接受 AI draft 必須明確呼叫 accept endpoint', () => {
      saveProjectSummary(db, 1, { markdown: '## 手動摘要' }, TODAY);
      const draft = regenerateProjectSummary(db, 1, TODAY).summary_ai_draft_markdown!;

      const detail = acceptProjectSummaryDraft(db, 1, TODAY);

      expect(detail.summary_markdown).toBe(draft);
      expect(detail.summary_ai_draft_markdown).toBe(draft);
      expect(detail.summary_source).toBe('ai');
    });

    it('daily diary save 寫入指定日期 per_project_summary，並由該日 diary block 顯示', () => {
      const markdown = '## 2026-06-28 手動日記\n- 完成單日修正。';
      const detail = saveProjectDiaryEntry(db, 1, TODAY, { markdown }, TODAY, {
        range: 'custom',
        customStart: TODAY,
        customEnd: TODAY,
      });

      expect(detail.diary).toHaveLength(1);
      expect(detail.diary[0]!.date).toBe(TODAY);
      expect(detail.diary[0]!.markdown).toBe(markdown);
      const row = db.prepare(`SELECT per_project_summary, summary_status FROM daily_logs WHERE date = ?`).get(TODAY) as {
        per_project_summary: string;
        summary_status: string;
      };
      expect(JSON.parse(row.per_project_summary)['1']).toContain('手動日記');
      expect(row.summary_status).toBe('confirmed');
    });

    it('daily diary save 後讀回內容不會重複包日期標題或本日 session 統計', () => {
      const edited = '## 手動內容\n- 刪掉自動 session 文案。';

      const detail = saveProjectDiaryEntry(db, 1, TODAY, { markdown: edited }, TODAY, {
        range: 'custom',
        customStart: TODAY,
        customEnd: TODAY,
      });

      expect(detail.diary[0]!.markdown).toBe(edited);
      expect(detail.diary[0]!.markdown.match(/2026-06-28 開發摘要/g)).toBeNull();
      expect(detail.diary[0]!.markdown.match(/本日 \d+ 個 session/g)).toBeNull();
    });

    it('daily diary regenerate 只刷新指定日期，不改 project-level user summary', async () => {
      saveProjectSummary(db, 1, { markdown: '## 專案摘要保留' }, TODAY);

      const detail = await regenerateProjectDiaryEntryWithAgent(
        db,
        1,
        TODAY,
        TODAY,
        { range: 'custom', customStart: TODAY, customEnd: TODAY },
        async () => ({ markdown: '## AI 單日草稿\n- 只整理這一天。', agent_id: 'fallback', fallback_report: null }),
      );

      expect(detail.summary_markdown).toBe('## 專案摘要保留');
      expect(detail.summary_source).toBe('user');
      expect(detail.diary[0]!.markdown).toContain('只整理這一天');
    });

    it('daily diary regenerate 建立給 agent 的 snapshot 時使用選定日期，不使用 server today', async () => {
      const selectedDate = '2026-06-27';
      const expectedSelectedDateTokens = (
        db
          .prepare(`SELECT COALESCE(SUM(token_total),0) AS t FROM sessions WHERE project_id = 1 AND substr(start_time,1,10) = ?`)
          .get(selectedDate) as { t: number }
      ).t;
      let seenTodayArg = '';
      let seenTokenToday = -1;
      let seenDiaryDates: string[] = [];

      const detail = await regenerateProjectDiaryEntryWithAgent(
        db,
        1,
        selectedDate,
        TODAY,
        { range: 'custom', customStart: selectedDate, customEnd: selectedDate },
        async (snapshot, todayArg) => {
          seenTodayArg = todayArg;
          seenTokenToday = snapshot.metric_strip.token_today;
          seenDiaryDates = snapshot.diary.map((entry) => entry.date);
          return { markdown: '## AI 單日草稿\n- 使用選定日期資料。', agent_id: 'fallback', fallback_report: null };
        },
      );

      expect(seenTodayArg).toBe(selectedDate);
      expect(seenTokenToday).toBe(expectedSelectedDateTokens);
      expect(seenDiaryDates).toEqual([selectedDate]);
      expect(detail.start_date).toBe(selectedDate);
      expect(detail.end_date).toBe(selectedDate);
      expect(detail.diary.map((entry) => entry.date)).toEqual([selectedDate]);
      expect(detail.diary[0]!.markdown).toContain('使用選定日期資料');
    });

    it('daily diary save 回傳選定日期 snapshot，不落回 server today', () => {
      const selectedDate = '2026-06-27';

      const detail = saveProjectDiaryEntry(
        db,
        1,
        selectedDate,
        { markdown: '## 舊日期手動日記\n- 這應該留在 2026-06-27。' },
        TODAY,
        { range: 'all' },
      );

      expect(detail.start_date).toBe(selectedDate);
      expect(detail.end_date).toBe(selectedDate);
      expect(detail.diary.map((entry) => entry.date)).toEqual([selectedDate]);
      expect(detail.diary[0]!.markdown).toContain('舊日期手動日記');
    });

    it('write paths 不讀寫 project folder、不執行 shell、不改 Git state', () => {
      const repo = initRepoProject(db);
      const beforeFiles = readdirSync(repo).sort();
      const beforeHead = readFileSync(join(repo, '.git', 'HEAD'), 'utf8');
      const beforeStatus = git(repo, ['status', '--porcelain=v1']);

      addProjectComment(db, 1, { content: 'Local app note', tags: ['Info'] }, TODAY);
      updateKanbanCardStatus(db, 1, firstCardId(db, 1), { status: 'done' }, TODAY);
      saveProjectSummary(db, 1, { markdown: '## Core-only note' }, TODAY);
      regenerateProjectSummary(db, 1, TODAY);

      expect(readdirSync(repo).sort()).toEqual(beforeFiles);
      expect(readFileSync(join(repo, '.git', 'HEAD'), 'utf8')).toBe(beforeHead);
      expect(git(repo, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    });
  });

  describe('Mock API', () => {
    it('CORS preflight allows PUT workspace save endpoints', async () => {
      const app = createServer(db);
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const preflight = await fetch(`${base}/api/projects/1/diary/${TODAY}`, {
          method: 'OPTIONS',
          headers: {
            origin: 'tauri://localhost',
            'access-control-request-method': 'PUT',
            'access-control-request-headers': 'content-type',
          },
        });

        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('GET /api/projects/:id 支援 Workspace range query，invalid range 回 400', async () => {
      const app = createServer(db);
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const ok = await fetch(`${base}/api/projects/1?range=custom&start=${TODAY}&end=${TODAY}`);
        expect(ok.status).toBe(200);
        const body = (await ok.json()) as {
          range_key: string;
          start_date: string;
          end_date: string;
          metric_strip: { range_session_count: number };
          sessions: Array<{ start_time: string }>;
        };
        expect(body.range_key).toBe('custom');
        expect(body.start_date).toBe(TODAY);
        expect(body.end_date).toBe(TODAY);
        expect(body.sessions.every((s) => s.start_time.startsWith(TODAY))).toBe(true);
        expect(body.metric_strip.range_session_count).toBe(body.sessions.length);

        const invalidRange = await fetch(`${base}/api/projects/1?range=blocked`);
        expect(invalidRange.status).toBe(400);

        const invalidDate = await fetch(`${base}/api/projects/1?range=custom&start=2026/06/01&end=2026-06-10`);
        expect(invalidDate.status).toBe(400);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('Workspace write endpoints 保留 range query 回傳刷新後的 ranged ProjectDetailSnapshot', async () => {
      const app = createServer(db);
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const created = await fetch(`${base}/api/projects/1/comments?range=custom&start=${TODAY}&end=${TODAY}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: 'Range-preserving comment', tags: ['Feature'] }),
        });
        expect(created.status).toBe(201);
        const body = (await created.json()) as {
          range_key: string;
          start_date: string;
          end_date: string;
          diary: Array<{ date: string }>;
          token_detail: { rows: Array<{ date: string }> };
        };
        expect(body.range_key).toBe('custom');
        expect(body.start_date).toBe(TODAY);
        expect(body.end_date).toBe(TODAY);
        expect(body.diary.every((entry) => entry.date === TODAY)).toBe(true);
        expect(body.token_detail.rows.every((row) => row.date === TODAY)).toBe(true);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('Workspace write endpoints 會回傳刷新後 ProjectDetailSnapshot', async () => {
      const app = createServer(db, {
        projectSummaryAgent: async () => ({
          markdown: '## Injected Antigravity draft\n- API generated this through the diary agent contract.',
          agent_id: 'antigravity-cli',
          fallback_report: null,
        }),
      });
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;
        const cardId = firstCardId(db, 1);

        const created = await fetch(`${base}/api/projects/1/comments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: 'API comment', tags: ['Feature'] }),
        });
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { comments: Array<{ id: number; content: string }> };
        const apiComment = createdBody.comments.find((c) => c.content === 'API comment')!;
        expect(apiComment.content).toBe('API comment');
        const commentId = apiComment.id;

        const pinned = await fetch(`${base}/api/projects/1/comments/${commentId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pinned: true }),
        });
        expect(pinned.status).toBe(200);

        const kanban = await fetch(`${base}/api/projects/1/kanban/${cardId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        });
        expect(kanban.status).toBe(200);
        const kanbanBody = (await kanban.json()) as { kanban: Array<{ id: number; status: string }> };
        expect(kanbanBody.kanban.find((c) => c.id === cardId)!.status).toBe('done');

        const saved = await fetch(`${base}/api/projects/1/summary`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown: '## API 手動摘要' }),
        });
        expect(saved.status).toBe(200);
        expect(((await saved.json()) as { summary_source: string }).summary_source).toBe('user');

        const regenerated = await fetch(`${base}/api/projects/1/summary/regenerate`, { method: 'POST' });
        expect(regenerated.status).toBe(200);
        const regeneratedBody = (await regenerated.json()) as { summary_source: string; summary_ai_draft_markdown: string };
        expect(regeneratedBody.summary_source).toBe('user');
        expect(regeneratedBody.summary_ai_draft_markdown).toContain('Injected Antigravity draft');

        const accepted = await fetch(`${base}/api/projects/1/summary/accept-draft`, { method: 'POST' });
        expect(accepted.status).toBe(200);
        expect(((await accepted.json()) as { summary_source: string }).summary_source).toBe('ai');

        const deleted = await fetch(`${base}/api/projects/1/comments/${commentId}`, { method: 'DELETE' });
        expect(deleted.status).toBe(200);
        const deletedBody = (await deleted.json()) as { comments: Array<{ id: number }> };
        expect(deletedBody.comments.some((c) => c.id === commentId)).toBe(false);

        const invalidId = await fetch(`${base}/api/projects/abc/comments`, { method: 'POST' });
        expect(invalidId.status).toBe(400);

        const invalidBody = await fetch(`${base}/api/projects/1/kanban/${cardId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'blocked' }),
        });
        expect(invalidBody.status).toBe(400);

        const notFound = await fetch(`${base}/api/projects/2/kanban/${cardId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        });
        expect(notFound.status).toBe(404);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });
  });
});
