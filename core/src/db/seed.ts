import type { DB } from './index.js';
import { openDb } from './index.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CanonicalAgentId } from '../domain/types.js';
import { taipeiDate } from '../services/taipeiDate.js';

// Deterministic seed. No Math.random / Date.now in the generator — a seeded LCG
// plus an explicit `today` anchor makes the dataset reproducible (spec §10/§7.3.3:
// dashboard data must be deterministic for the same persisted records).

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function addDaysUTC(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

interface SeedAgent {
  id: CanonicalAgentId | string; // non-canonical id => bucketed as `other`
  model: string;
  weight: number; // relative token share target
}

// Target mix roughly mirrors the Open Design prototype (Claude 46 / Antigravity 37 / Codex 12 / other 5).
const SEED_AGENTS: SeedAgent[] = [
  { id: 'claude-code', model: 'claude-opus-4-8', weight: 46 },
  { id: 'antigravity-cli', model: 'antigravity-core', weight: 37 },
  { id: 'codex-cli', model: 'gpt-5-codex', weight: 12 },
  { id: 'gemini-cli', model: 'gemini-2.0-flash', weight: 5 }, // non-canonical -> `other`
];

interface SeedProject {
  id: number;
  name: string;
  root_path: string;
  tracking_status: 'active' | 'idle' | 'paused';
  activity: number; // 0..1 likelihood multiplier
  detected_agents: CanonicalAgentId[];
}

const SEED_PROJECTS: SeedProject[] = [
  { id: 1, name: 'Example Workspace', root_path: join(tmpdir(), 'devdiary-example', 'workspace'), tracking_status: 'active', activity: 1.0, detected_agents: ['claude-code', 'antigravity-cli'] },
  { id: 2, name: 'Example Agent Lab', root_path: join(tmpdir(), 'devdiary-example', 'agent-lab'), tracking_status: 'idle', activity: 0.55, detected_agents: ['codex-cli', 'claude-code'] },
  { id: 3, name: 'Example Core', root_path: join(tmpdir(), 'devdiary-example', 'core'), tracking_status: 'active', activity: 0.7, detected_agents: ['claude-code', 'codex-cli', 'antigravity-cli'] },
];

export interface SeedOptions {
  today: string; // YYYY-MM-DD anchor (inclusive end of window)
  days?: number; // window length, default 90
  seed?: number; // LCG seed, default 1337
}

function pickAgent(rnd: () => number): SeedAgent {
  const totalWeight = SEED_AGENTS.reduce((a, x) => a + x.weight, 0);
  let r = rnd() * totalWeight;
  for (const a of SEED_AGENTS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return SEED_AGENTS[0]!;
}

/** Populate a fresh DB with deterministic projects, sessions, derived token usage and daily logs. */
export function seedDatabase(db: DB, opts: SeedOptions): void {
  const { today, days = 90, seed = 1337 } = opts;
  const rnd = lcg(seed);

  const wipe = db.transaction(() => {
    for (const t of ['token_usage', 'sessions', 'kanban_cards', 'comments', 'project_docs', 'daily_logs', 'projects']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
  });
  wipe();

  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, root_path, tracking_status, created_at, last_activity_at,
       detected_agents, ignored, scan_paused, git_repo_detected, git_branch, git_worktree_count)
     VALUES (@id, @name, @root_path, @tracking_status, @created_at, @last_activity_at,
       @detected_agents, 0, 0, 1, @git_branch, @git_worktree_count)`,
  );
  const insertSession = db.prepare(
    `INSERT INTO sessions (project_id, agent_name, model, start_time, end_time,
       token_total, token_input, token_cached, token_output, token_reasoning,
       summary, source_log_ref, parser_confidence, command, duration, status,
       redacted_log_excerpt, task_count, transcript_length)
     VALUES (@project_id, @agent_name, @model, @start_time, @end_time,
       @token_total, @token_input, @token_cached, @token_output, @token_reasoning,
       @summary, @source_log_ref, @parser_confidence, @command, @duration, @status,
       @redacted_log_excerpt, @task_count, @transcript_length)`,
  );

  const windowStart = addDaysUTC(today, -(days - 1));

  const run = db.transaction(() => {
    for (const p of SEED_PROJECTS) {
      insertProject.run({
        id: p.id,
        name: p.name,
        root_path: p.root_path,
        tracking_status: p.tracking_status,
        created_at: `${windowStart}T00:00:00Z`,
        last_activity_at: `${today}T18:00:00Z`,
        detected_agents: JSON.stringify(p.detected_agents),
        git_branch: p.id === 1 ? 'feature/core-engine' : 'main',
        git_worktree_count: p.id === 1 ? 1 : 0,
      });
    }

    let seq = 0;
    for (let i = 0; i < days; i++) {
      const date = addDaysUTC(windowStart, i);
      for (const p of SEED_PROJECTS) {
        const sessionsToday = Math.floor(rnd() * 4 * p.activity); // 0..3 scaled by activity
        for (let s = 0; s < sessionsToday; s++) {
          const agent = pickAgent(rnd);
          const magnitude = Math.round((2000 + rnd() * 18000) * (agent.weight / 46));
          const input = Math.round(magnitude * 0.45);
          const cached = Math.round(magnitude * 0.2);
          const output = Math.round(magnitude * 0.25);
          const reasoning = magnitude - input - cached - output;
          const hour = 9 + Math.floor(rnd() * 10);
          const durMin = 5 + Math.floor(rnd() * 55);
          seq++;
          insertSession.run({
            project_id: p.id,
            agent_name: agent.id,
            model: agent.model,
            start_time: `${date}T${String(hour).padStart(2, '0')}:00:00Z`,
            end_time: `${date}T${String(hour).padStart(2, '0')}:${String(durMin).padStart(2, '0')}:00Z`,
            token_total: magnitude,
            token_input: input,
            token_cached: cached,
            token_output: output,
            token_reasoning: reasoning,
            summary: null,
            source_log_ref: `seed://p${p.id}/${date}/${seq}`,
            parser_confidence: 1.0,
            command: 'session',
            duration: durMin * 60,
            status: 'completed',
            redacted_log_excerpt: null,
            task_count: 1 + Math.floor(rnd() * 4),
            transcript_length: 200 + Math.floor(rnd() * 4000),
          });
        }
      }
    }

    // Derive token_usage from sessions so counts and totals cannot disagree.
    db.prepare(
      `INSERT INTO token_usage (date, project_id, agent_name, model, token_total,
         token_input, token_cached, token_output, token_reasoning)
       SELECT date(start_time, '+8 hours') AS date, project_id, agent_name, model,
         SUM(token_total), SUM(token_input), SUM(token_cached), SUM(token_output), SUM(token_reasoning)
       FROM sessions
       GROUP BY date, project_id, agent_name, model`,
    ).run();

    // A couple of recent daily logs to drive blocker / warning / unconfirmed counts.
    const insertLog = db.prepare(
      `INSERT INTO daily_logs (date, global_summary_ai, global_summary_user, per_project_summary,
         blockers, warnings, fallback_report, summary_status)
       VALUES (@date, @ai, @user, @per, @blockers, @warnings, @fallback, @status)`,
    );
    insertLog.run({
      date: today,
      ai: [
        `## 今日開發重點 - ${today}`,
        '- 達成：完成 Core Engine 後端地基與 Dashboard 聚合 API。',
        '- 阻礙：CLI log schema 待實機驗證。',
        '- 下一步：接上真實 CLI log parser 並確認 Dashboard 資料更新。',
      ].join('\n'),
      user: null,
      per: JSON.stringify({ 1: '移植 UI 並建立後端骨架。' }),
      blockers: JSON.stringify([{ id: 1, title: 'CLI log schema 待實機驗證', desc: '需確認 Claude/Codex log 實際欄位。' }]),
      warnings: JSON.stringify([{ id: 1, title: 'Antigravity parser 仍為 experimental' }]),
      fallback: null,
      status: 'ai_generated', // not yet user-confirmed -> counts as unconfirmed
    });
    insertLog.run({
      date: addDaysUTC(today, -1),
      ai: '昨日整理需求 spec 並完成 review。',
      user: '昨日整理需求 spec 並完成 review（已確認）。',
      per: JSON.stringify({ 1: '昨日整理需求 spec 並完成 review。', 3: '昨日對 Core Engine 補測試。' }),
      blockers: JSON.stringify([]),
      warnings: JSON.stringify([]),
      fallback: null,
      status: 'confirmed',
    });

    // Kanban cards (spec §11, three v1 columns). Deterministic, project-scoped.
    const insertKanban = db.prepare(
      `INSERT INTO kanban_cards (project_id, title, description, status, assignee_agent_id,
         due_date, source_ref, created_at, updated_at)
       VALUES (@project_id, @title, @description, @status, @assignee, @due_date, @source_ref, @created_at, @updated_at)`,
    );
    const KANBAN: Array<{
      project_id: number;
      title: string;
      description: string;
      status: 'todo' | 'in_progress' | 'done';
      assignee: CanonicalAgentId;
    }> = [
      { project_id: 1, title: '自動日記 Dashboard 接 Core API', description: '把 metric/donut/trend/heatmap 改吃 /api/dashboard。', status: 'done', assignee: 'claude-code' },
      { project_id: 1, title: 'Projects Workspace 接後端', description: '列表與 detail snapshot 改吃 Core API。', status: 'in_progress', assignee: 'claude-code' },
      { project_id: 1, title: 'CLI Agent Log Parser', description: '實機驗證後解析 Claude/Codex/Antigravity log。', status: 'todo', assignee: 'antigravity-cli' },
      { project_id: 1, title: 'Tauri shell 打包', description: '產出 unsigned .app / .dmg。', status: 'todo', assignee: 'claude-code' },
      { project_id: 2, title: 'media generate 佇列重試', description: '非同步輪詢失敗時自動重試。', status: 'in_progress', assignee: 'codex-cli' },
      { project_id: 2, title: 'provider model id 正規化', description: '統一 fal / veo 模型代號。', status: 'done', assignee: 'codex-cli' },
      { project_id: 3, title: 'token usage 聚合測試', description: '補 by-agent / by-model 一致性測試。', status: 'done', assignee: 'claude-code' },
      { project_id: 3, title: 'better-sqlite3 WAL 調校', description: '確認多讀單寫下的 WAL 行為。', status: 'todo', assignee: 'antigravity-cli' },
    ];
    KANBAN.forEach((c, i) => {
      const createdDate = addDaysUTC(today, -((i % 6) + 1));
      insertKanban.run({
        project_id: c.project_id,
        title: c.title,
        description: c.description,
        status: c.status,
        assignee: c.assignee,
        due_date: addDaysUTC(today, (i % 4) + 1),
        source_ref: null,
        created_at: `${createdDate}T10:00:00Z`,
        updated_at: `${createdDate}T10:00:00Z`,
      });
    });

    // Comments (spec §11 memo comments). Project-scoped, with tags / pinning.
    const insertComment = db.prepare(
      `INSERT INTO comments (project_id, content, tags, pinned, created_at, updated_at)
       VALUES (@project_id, @content, @tags, @pinned, @created_at, @updated_at)`,
    );
    const COMMENTS: Array<{ project_id: number; content: string; tags: string[]; pinned: number; day: number }> = [
      { project_id: 1, content: 'Liquid Glass 在 Light mode 要降低模糊度維持文字易讀性。', tags: ['UI/UX'], pinned: 1, day: 1 },
      { project_id: 1, content: 'Dashboard 與 Workspace 的 time-range state 要拆開，避免互相干擾。', tags: ['Bug'], pinned: 0, day: 2 },
      { project_id: 1, content: '記得 commit 前自檢 .env 不要進版本控制。', tags: ['Info'], pinned: 0, day: 3 },
      { project_id: 2, content: '需支援 --aspect 比例參數，預設 1:1。', tags: ['Feature'], pinned: 0, day: 2 },
      { project_id: 3, content: 'WAL 模式下要確認 checkpoint 行為再上線。', tags: ['Info'], pinned: 0, day: 1 },
    ];
    COMMENTS.forEach((c) => {
      const d = addDaysUTC(today, -c.day);
      insertComment.run({
        project_id: c.project_id,
        content: c.content,
        tags: JSON.stringify(c.tags),
        pinned: c.pinned,
        created_at: `${d}T14:30:00Z`,
        updated_at: `${d}T14:30:00Z`,
      });
    });

    // Project docs (spec §11 document summaries / preview). Minimal seeded set.
    const insertDoc = db.prepare(
      `INSERT INTO project_docs (project_id, name, content, updated_at)
       VALUES (@project_id, @name, @content, @updated_at)`,
    );
    const DOCS: Array<{ project_id: number; name: string; content: string }> = [
      { project_id: 1, name: 'MASTER.md', content: '# Master Spec\n主分支的系統現況文件，定義專案生命週期與 Core API 同步合約。' },
      { project_id: 1, name: 'dev-diary-macos-app.md', content: '# Spec Specification\nmacOS App 的界面與功能規格書，Tauri 封裝的 Webview 設計。' },
      { project_id: 1, name: 'dashboard-wiring-delta.md', content: '# Delta Spec\nDashboard 接 Core API snapshot 的差量規格。' },
      { project_id: 2, name: 'README.md', content: '# od-cli\nOpen Design Command Line Interface tool。媒體資源下載與生成。' },
      { project_id: 3, name: 'README.md', content: '# DevDiary Core\n本機 SQLite + Express Core Engine，提供 Dashboard 與 Workspace 聚合 API。' },
    ];
    DOCS.forEach((d) => {
      insertDoc.run({ project_id: d.project_id, name: d.name, content: d.content, updated_at: `${today}T09:00:00Z` });
    });
  });
  run();
}

// CLI entry: `npm run seed` (anchors to real today; app code may use real clock).
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.env.DEVDIARY_DB ?? 'devdiary.db';
  const db = openDb(path);
  const today = taipeiDate();
  seedDatabase(db, { today });
  const n = db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number };
  process.stdout.write(`Seeded ${path}: ${n.c} sessions (anchor today=${today}).\n`);
}
