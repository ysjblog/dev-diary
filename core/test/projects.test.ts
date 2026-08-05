import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import { getProjectList, getProjectDetail } from '../src/services/projects.js';
import { addDays } from '../src/domain/dateRange.js';

const TODAY = '2026-06-28';

function freshDb(): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 90, seed: 1337 });
  return db;
}

function addProjectWithSession(db: DB, id: number, status: 'active' | 'idle' | 'paused', sessionDate?: string): void {
  db.prepare(
    `INSERT INTO projects (id, name, root_path, tracking_status, created_at, detected_agents)
     VALUES (?, ?, ?, ?, '2026-06-01T00:00:00Z', '[]')`,
  ).run(id, `Status ${id}`, `/tmp/status-${id}`, status);
  if (!sessionDate) return;
  db.prepare(
    `INSERT INTO sessions (project_id, agent_name, model, start_time, end_time, token_total,
      token_input, token_cached, token_output, token_reasoning, summary, source_log_ref,
      parser_confidence, command, duration, status)
     VALUES (?, 'codex-cli', 'gpt-5-codex', ?, ?, 100, 40, 10, 30, 20, 'status test',
      ?, 1.0, 'codex', 60, 'completed')`,
  ).run(id, `${sessionDate}T10:00:00.000Z`, `${sessionDate}T10:01:00.000Z`, `status-test://${id}/${sessionDate}`);
}

/** Strip live runtime fields so two detail snapshots of the same seed data compare equal. */
function stableDetail(s: NonNullable<ReturnType<typeof getProjectDetail>>) {
  const { captured_at, git_status, ...rest } = s;
  void captured_at;
  void git_status;
  return rest;
}

describe('Projects Workspace', () => {
  let db: DB;
  beforeEach(() => {
    db = freshDb();
  });

  describe('function 邏輯', () => {
    it('getProjectList 回傳非 ignored 專案，含 logs_count 與 token_total 聚合', () => {
      const list = getProjectList(db);
      expect(list.length).toBeGreaterThan(0);
      for (const p of list) {
        expect(typeof p.id).toBe('number');
        expect(typeof p.name).toBe('string');
        expect(Array.isArray(p.detected_agents)).toBe(true);
        expect(typeof p.logs_count).toBe('number');
        expect(typeof p.token_total).toBe('number');
      }
      // token_total equals the project's session token sum.
      const p1 = list.find((p) => p.id === 1)!;
      const raw = db.prepare(`SELECT COALESCE(SUM(token_total),0) AS t FROM sessions WHERE project_id = 1`).get() as { t: number };
      expect(p1.token_total).toBe(raw.t);
    });

    it('getProjectList 的 logs_count 等於該專案有活動的不同日期數', () => {
      const list = getProjectList(db);
      const p1 = list.find((p) => p.id === 1)!;
      const distinct = db
        .prepare(`SELECT COUNT(DISTINCT date(start_time, '+8 hours')) AS c FROM sessions WHERE project_id = 1`)
        .get() as { c: number };
      expect(p1.logs_count).toBe(distinct.c);
    });

    it('getProjectList 從 sessions 聚合 detected_agents，避免 stale project 欄位漏掉 Codex', () => {
      db.prepare(`UPDATE projects SET detected_agents = '[]' WHERE id = 1`).run();
      db.prepare(
        `INSERT INTO sessions (project_id, agent_name, model, start_time, end_time, token_total,
          token_input, token_cached, token_output, token_reasoning, summary, source_log_ref,
          parser_confidence, command, duration, status)
         VALUES (1, 'codex-cli', 'gpt-5-codex', ?, ?, 0, 0, 0, 0, 0, 'codex session',
          'codex-cli://detected-agent-test', 0.85, 'codex-cli', 60, 'completed')`,
      ).run(`${TODAY}T11:00:00.000Z`, `${TODAY}T11:01:00.000Z`);

      const p1 = getProjectList(db).find((p) => p.id === 1)!;
      expect(p1.detected_agents).toContain('codex-cli');
    });

    it('getProjectDetail 回傳完整 snapshot 形狀', () => {
      const d = getProjectDetail(db, 1, TODAY)!;
      expect(d).not.toBeNull();
      expect(d.project.id).toBe(1);
      expect(d.metric_strip).toBeTruthy();
      expect(Array.isArray(d.kanban)).toBe(true);
      expect(typeof d.summary_markdown).toBe('string');
      expect(Array.isArray(d.diary)).toBe(true);
      expect(d.token_detail).toBeTruthy();
      expect(Array.isArray(d.sessions)).toBe(true);
      expect(Array.isArray(d.comments)).toBe(true);
      expect(Array.isArray(d.docs)).toBe(true);
      expect(d.git_status.project_id).toBe(1);
      expect(typeof d.captured_at).toBe('string');
    });

    it('metric_strip token 聚合分層正確（today<=week<=month<=all）', () => {
      const m = getProjectDetail(db, 1, TODAY)!.metric_strip;
      expect(m.token_today).toBeLessThanOrEqual(m.token_week);
      expect(m.token_week).toBeLessThanOrEqual(m.token_month);
      expect(m.token_month).toBeLessThanOrEqual(m.token_all);
      const sc = db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = 1`).get() as { c: number };
      expect(m.session_count).toBe(sc.c);
    });

    it('Workspace range snapshot 同步限制 metric strip、token detail、sessions、diary candidates', () => {
      const ranged = getProjectDetail(db, 1, TODAY, { range: 'custom', customStart: TODAY, customEnd: TODAY })!;
      expect(ranged.range_key).toBe('custom');
      expect(ranged.start_date).toBe(TODAY);
      expect(ranged.end_date).toBe(TODAY);

      const expectedTokens = db
        .prepare(`SELECT COALESCE(SUM(token_total),0) AS t FROM sessions WHERE project_id = 1 AND substr(start_time,1,10) = ?`)
        .get(TODAY) as { t: number };
      const expectedSessions = db
        .prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = 1 AND substr(start_time,1,10) = ?`)
        .get(TODAY) as { c: number };

      expect(ranged.metric_strip.range_token_total).toBe(expectedTokens.t);
      expect(ranged.metric_strip.range_session_count).toBe(expectedSessions.c);
      expect(ranged.token_detail.rows.every((r) => r.date === TODAY)).toBe(true);
      expect(ranged.sessions.every((s) => s.start_time.startsWith(TODAY))).toBe(true);
      expect(ranged.diary.every((entry) => entry.date === TODAY)).toBe(true);
      expect(ranged.token_detail.rows.reduce((a, r) => a + r.token_total, 0)).toBe(ranged.metric_strip.range_token_total);
    });

    it('Workspace date-scoped readers use one Taipei calendar boundary across UTC midnight', () => {
      db.prepare(`DELETE FROM sessions WHERE project_id = 1`).run();
      db.prepare(`DELETE FROM token_usage WHERE project_id = 1`).run();
      const insert = db.prepare(
        `INSERT INTO sessions (project_id, agent_name, model, start_time, token_total, source_log_ref, command, summary)
         VALUES (1, 'codex-cli', 'gpt-5-codex', ?, ?, ?, 'timezone task', 'timezone summary')`,
      );
      insert.run('2026-08-04T16:30:00.000Z', 100, 'test://taipei/1');
      insert.run('2026-08-05T15:59:59.000Z', 200, 'test://taipei/2');
      insert.run('2026-08-05T16:00:00.000Z', 300, 'test://taipei/3');

      const taipeiAug5 = getProjectDetail(db, 1, '2026-08-05', {
        range: 'custom', customStart: '2026-08-05', customEnd: '2026-08-05',
      })!;

      expect(taipeiAug5.sessions.map((session) => session.start_time)).toEqual([
        '2026-08-05T15:59:59.000Z',
        '2026-08-04T16:30:00.000Z',
      ]);
      expect(taipeiAug5.metric_strip.range_session_count).toBe(2);
      expect(taipeiAug5.metric_strip.range_token_total).toBe(300);
      expect(taipeiAug5.metric_strip.token_today).toBe(300);
      expect(taipeiAug5.metric_strip.token_week).toBe(300);
      expect(taipeiAug5.metric_strip.token_month).toBe(300);
      expect(taipeiAug5.token_detail.rows.reduce((sum, row) => sum + row.token_total, 0)).toBe(300);
      expect(taipeiAug5.diary).toEqual(expect.arrayContaining([expect.objectContaining({ date: '2026-08-05' })]));
      expect(getProjectList(db, '2026-08-05').find((project) => project.id === 1)?.logs_count).toBe(2);
    });

    it('Workspace custom range 會 canonicalize reversed dates，empty range 回空 rows 而不是 fallback all-time', () => {
      const forward = getProjectDetail(db, 1, TODAY, {
        range: 'custom',
        customStart: '2026-06-10',
        customEnd: '2026-06-20',
      })!;
      const reversed = getProjectDetail(db, 1, TODAY, {
        range: 'custom',
        customStart: '2026-06-20',
        customEnd: '2026-06-10',
      })!;
      expect(forward.start_date).toBe('2026-06-10');
      expect(forward.end_date).toBe('2026-06-20');
      expect(stableDetail(reversed)).toEqual(stableDetail(forward));

      const empty = getProjectDetail(db, 1, TODAY, {
        range: 'custom',
        customStart: '2030-01-01',
        customEnd: '2030-01-07',
      })!;
      expect(empty.metric_strip.range_token_total).toBe(0);
      expect(empty.metric_strip.range_session_count).toBe(0);
      expect(empty.token_detail.rows).toEqual([]);
      expect(empty.sessions).toEqual([]);
      expect(empty.diary).toEqual([]);
    });

    it('token_detail by_agent / by_model 聚合等於 rows 總和，且無 cost 欄位', () => {
      const td = getProjectDetail(db, 1, TODAY)!.token_detail;
      const rowsSum = td.rows.reduce((a, r) => a + r.token_total, 0);
      const agentSum = td.by_agent.reduce((a, r) => a + r.token_total, 0);
      const modelSum = td.by_model.reduce((a, r) => a + r.token_total, 0);
      expect(agentSum).toBe(rowsSum);
      expect(modelSum).toBe(rowsSum);
      for (const r of td.rows) {
        expect(r).not.toHaveProperty('cost');
        expect(typeof r.agent_name).toBe('string');
      }
    });

    it('diary 依日期新到舊、一天一 block、且為 Markdown 字串', () => {
      const diary = getProjectDetail(db, 1, TODAY)!.diary;
      const dates = diary.map((e) => e.date);
      expect(new Set(dates).size).toBe(dates.length); // one block per date
      const sorted = [...dates].sort((a, b) => (a < b ? 1 : -1));
      expect(dates).toEqual(sorted);
      for (const e of diary) {
        expect(e.markdown.trim().length).toBeGreaterThan(0);
        expect(typeof e.title).toBe('string');
      }
    });

    it('confirmed diary table row 會先於 legacy per-project summary 載入，且同日期不查該 projection', () => {
      const markdown = '## confirmed diary\n- 使用者確認內容。';
      db.prepare(
        `INSERT INTO project_daily_diaries (project_id, date, markdown, status, fallback_report, created_at, updated_at)
         VALUES (1, ?, ?, 'confirmed', NULL, ?, ?)`,
      ).run(TODAY, markdown, `${TODAY}T12:00:00.000Z`, `${TODAY}T12:00:00.000Z`);
      const prepare = db.prepare.bind(db);
      const guard = vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('per_project_summary')) throw new Error('confirmed diary must not read legacy per-project summary');
        return prepare(sql);
      });

      const detail = getProjectDetail(db, 1, TODAY, { range: 'custom', customStart: TODAY, customEnd: TODAY });

      expect(detail!.diary).toEqual(expect.arrayContaining([expect.objectContaining({ date: TODAY, markdown })]));
      guard.mockRestore();
    });

    it('non-diary snapshot 不讀 legacy per-project summary', () => {
      const prepare = db.prepare.bind(db);
      const guard = vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('per_project_summary')) throw new Error('non-diary snapshot must not read legacy per-project summary');
        return prepare(sql);
      });

      const detail = getProjectDetail(db, 1, TODAY, {
        range: 'custom', customStart: TODAY, customEnd: TODAY, includeDiary: false,
      });

      expect(detail!.summary_markdown).toContain('開發摘要');
      guard.mockRestore();
    });

    it('summary：持久化 per_project_summary 優先於生成 fallback', () => {
      // project 1 has a seeded per_project_summary; project with none falls back.
      const withSummary = getProjectDetail(db, 1, TODAY)!.summary_markdown;
      expect(withSummary.length).toBeGreaterThan(0);
      const seeded = db
        .prepare(`SELECT per_project_summary FROM daily_logs WHERE per_project_summary LIKE '%1%' ORDER BY date DESC`)
        .all();
      expect(seeded.length).toBeGreaterThan(0);
      // A project that exists but has no per_project_summary still returns a non-null fallback.
      const other = getProjectDetail(db, 2, TODAY)!.summary_markdown;
      expect(other.length).toBeGreaterThan(0);
    });

    it('kanban 只含該專案卡片且狀態為三個合法 enum', () => {
      const k = getProjectDetail(db, 2, TODAY)!.kanban;
      expect(k.length).toBeGreaterThan(0);
      for (const c of k) {
        expect(c.project_id).toBe(2);
        expect(['todo', 'in_progress', 'done']).toContain(c.status);
      }
    });

    it('comments / docs 只含該專案資料且形狀正確', () => {
      const d = getProjectDetail(db, 1, TODAY)!;
      expect(d.comments.length).toBeGreaterThan(0);
      for (const c of d.comments) {
        expect(Array.isArray(c.tags)).toBe(true);
        expect(typeof c.pinned).toBe('boolean');
        expect(typeof c.content).toBe('string');
      }
      expect(d.docs.length).toBeGreaterThan(0);
      for (const doc of d.docs) {
        expect(doc.project_id).toBe(1);
        expect(typeof doc.name).toBe('string');
      }
      // pinned comment sorts first.
      expect(d.comments[0]!.pinned).toBe(true);
    });

    it('docs 依 source mtime 新到舊排序，同時間再依 logical path 排序', () => {
      db.prepare(`INSERT INTO project_docs (project_id, name, content, updated_at) VALUES (1, ?, ?, ?)`).run('docs/specs/MASTER.md', 'body', '2026-07-13T02:00:00.000Z');
      db.prepare(`INSERT INTO project_docs (project_id, name, content, updated_at) VALUES (1, ?, ?, ?)`).run('README.md', 'body', '2026-07-13T02:00:00.000Z');
      db.prepare(`INSERT INTO project_docs (project_id, name, content, updated_at) VALUES (1, ?, ?, ?)`).run('docs/specs/deltas/a.md', 'body', '2026-07-13T03:00:00.000Z');
      const names = getProjectDetail(db, 1, TODAY)!.docs.slice(0, 3).map((doc) => doc.name);
      expect(names).toEqual(['docs/specs/deltas/a.md', 'README.md', 'docs/specs/MASTER.md']);
    });

    it('不存在或 ignored 的專案 id 回傳 null', () => {
      expect(getProjectDetail(db, 9999, TODAY)).toBeNull();
      db.prepare(`UPDATE projects SET ignored = 1 WHERE id = 3`).run();
      expect(getProjectDetail(db, 3, TODAY)).toBeNull();
      expect(getProjectList(db).some((p) => p.id === 3)).toBe(false);
    });

    it('無 session/comment/kanban 的專案不 crash、回空陣列', () => {
      db.prepare(
        `INSERT INTO projects (id, name, root_path, tracking_status, created_at, detected_agents)
         VALUES (99, 'Empty', '/tmp/empty-proj', 'idle', '2026-06-01T00:00:00Z', '[]')`,
      ).run();
      const d = getProjectDetail(db, 99, TODAY)!;
      expect(d).not.toBeNull();
      expect(d.kanban).toEqual([]);
      expect(d.sessions).toEqual([]);
      expect(d.comments).toEqual([]);
      expect(d.metric_strip.token_all).toBe(0);
      expect(d.metric_strip.session_count).toBe(0);
      expect(d.summary_markdown.length).toBeGreaterThan(0);
    });

    it('Workspace status 依最近 5 天 session 推導 active/idle，legacy paused 也不外露', () => {
      addProjectWithSession(db, 101, 'idle', '2026-06-24');
      addProjectWithSession(db, 102, 'active', '2026-06-23');
      addProjectWithSession(db, 103, 'active');
      addProjectWithSession(db, 104, 'paused', TODAY);
      addProjectWithSession(db, 105, 'paused');

      const byId = new Map(getProjectList(db, TODAY).map((p) => [p.id, p.tracking_status]));
      expect(byId.get(101)).toBe('active');
      expect(byId.get(102)).toBe('idle');
      expect(byId.get(103)).toBe('idle');
      expect(byId.get(104)).toBe('active');
      expect(byId.get(105)).toBe('idle');

      expect(getProjectDetail(db, 101, TODAY)!.project.tracking_status).toBe('active');
      expect(getProjectDetail(db, 102, TODAY)!.project.tracking_status).toBe('idle');
      expect(getProjectDetail(db, 104, TODAY)!.project.tracking_status).toBe('active');
      expect(getProjectDetail(db, 105, TODAY)!.project.tracking_status).toBe('idle');
    });

    it('GET /api/projects list/detail 套用同一個 derived Workspace status contract', async () => {
      const runtimeToday = new Date().toISOString().slice(0, 10);
      addProjectWithSession(db, 201, 'idle', runtimeToday);
      addProjectWithSession(db, 202, 'active', addDays(runtimeToday, -5));
      const app = createServer(db);
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test server failed to listen');
        const base = `http://127.0.0.1:${address.port}`;

        const listResponse = await fetch(`${base}/api/projects`);
        expect(listResponse.status).toBe(200);
        const list = (await listResponse.json()) as Array<{ id: number; tracking_status: string }>;
        const detailResponse = await fetch(`${base}/api/projects/201?range=all`);
        expect(detailResponse.status).toBe(200);
        const detail = (await detailResponse.json()) as { project: { tracking_status: string } };

        expect(list.find((p) => p.id === 201)?.tracking_status).toBe('active');
        expect(list.find((p) => p.id === 202)?.tracking_status).toBe('idle');
        expect(detail.project.tracking_status).toBe('active');
      } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      }
    });

    it('getProjectList / getProjectDetail 對相同 seed 為 deterministic', () => {
      expect(getProjectList(db, TODAY)).toEqual(getProjectList(freshDb(), TODAY));
      const a = getProjectDetail(db, 1, TODAY)!;
      const b = getProjectDetail(freshDb(), 1, TODAY)!;
      expect(stableDetail(a)).toEqual(stableDetail(b));
    });
  });
});
