import type { DB } from '../db/index.js';
import type { ProjectDetailQuery } from './projects.js';
import { getProjectList } from './projects.js';
import {
  createConfiguredDailySummaryAgent,
  createConfiguredProjectDiaryAgent,
  generateDailySummaryDraft,
  type DailySummaryDraftGenerator,
  type ProjectSummaryDraftGenerator,
} from './diaryAgent.js';
import { redactSensitiveText, synthesizeProjectKanban } from './kanbanSynthesis.js';
import { createConfiguredKanbanAiGenerator, emptyKanbanAiSync, syncKanbanAiCards, type KanbanAiTextGenerator } from './kanbanAiSuggestions.js';
import { regenerateProjectDiaryEntryWithAgent, regenerateProjectSummaryWithAgent } from './projectWrites.js';
import { taipeiDate } from './taipeiDate.js';
import { getGitStatusSnapshot } from './gitStatus.js';
import { randomUUID } from 'node:crypto';
import { upsertKanbanCandidate } from './scans.js';
import {
  DEFAULT_DAILY_HIGHLIGHT_PROMPT,
  getSettings,
  updateDailySchedulerState,
  type AppSettings,
  type SettingsRuntimeDefaults,
} from './settings.js';
import type { SchedulerPreflightResult } from './schedulerPreflight.js';
import { AntigravitySessionGate, createAntigravityProbe, usesAntigravityProvider } from './antigravitySession.js';
import type { KanbanAiSyncResult } from '../domain/types.js';

export interface DailySchedulerStatus {
  enabled: boolean;
  run_time_local: string;
  timezone: string;
  running: boolean;
  last_run_date: string | null;
  last_run_at: string | null;
  last_status: 'idle' | 'success' | 'failed' | 'skipped';
  last_error: string | null;
  last_project_count: number;
}

export interface DailySchedulerRunResult {
  status: 'success' | 'skipped' | 'failed' | 'running';
  date: string;
  message: string;
  project_count: number;
  daily_log_updated: boolean;
  project_drafts_updated: number;
  project_summaries_updated: number;
  daily_diaries_updated: number;
  daily_diaries_preserved: number;
  daily_diaries_fallback: number;
  daily_highlight_updated: number;
  kanban_cards_updated: number;
  kanban_ai_sync?: KanbanAiSyncResult;
  preflight?: SchedulerPreflightResult;
  error_message: string | null;
}

export interface DailySchedulerRuntimeOptions {
  projectSummaryAgent?: ProjectSummaryDraftGenerator | null;
  globalSummaryAgent?: DailySummaryDraftGenerator | null;
  kanbanAiGenerator?: KanbanAiTextGenerator | null;
  antigravityGate?: AntigravitySessionGate;
  now?: () => Date;
}

// Wall-clock minutes-of-day in Asia/Taipei, used only to gate run_time_local (spec:
// the scheduler's trigger time is a Taipei wall clock, independent of the record date below).
function minutesInTaipei(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return Number(value('hour')) * 60 + Number(value('minute'));
}

// Record date must match the UTC anchor every other endpoint queries by (server.ts
// todayUTC()); using a Taipei-anchored date here caused Run Now, during the
// Taipei-midnight-to-8am window, to stamp daily_logs/project drafts with tomorrow's
// date relative to the dashboard's UTC "today" — the AI Global Summary looked like it
// never ran even though it had (it was just filed a day ahead of where the UI looked).
function todayUTC(now: Date): string { return taipeiDate(now); }

function runTimeMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function sanitizeSchedulerError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.includes('Command failed') ? 'Daily scheduler failed.' : err.message;
  return 'Daily scheduler failed.';
}

const DAILY_SCHEDULER_LEASE_MS = 10 * 60_000;
const DAILY_SCHEDULER_RENEWAL_MS = 30_000;

class SchedulerLeaseLostError extends Error {
  constructor() {
    super('Daily scheduler lease was lost before finalization.');
    this.name = 'SchedulerLeaseLostError';
  }
}

interface DailyProjectSummaryInput {
  id: number;
  name: string;
  session_count: number;
  token_total: number;
  latest_session: string | null;
  git_status: string;
  recent_commits: string[];
  kanban_titles: string[];
}

function buildDailyProjectInputs(db: DB, date: string): DailyProjectSummaryInput[] {
  return getProjectList(db, date).map((project) => {
    const activity = db.prepare(
      `SELECT COUNT(*) AS session_count, COALESCE(SUM(token_total), 0) AS token_total
       FROM sessions WHERE project_id = ? AND substr(start_time, 1, 10) = ?`,
    ).get(project.id, date) as { session_count: number; token_total: number };
    const latest = db.prepare(
      `SELECT command, COALESCE(summary, redacted_log_excerpt) AS excerpt
       FROM sessions WHERE project_id = ? AND substr(start_time, 1, 10) = ?
       ORDER BY start_time DESC, id DESC LIMIT 1`,
    ).get(project.id, date) as { command: string | null; excerpt: string | null } | undefined;
    const kanban = db.prepare(
      `SELECT title FROM kanban_cards WHERE project_id = ? ORDER BY updated_at DESC, id DESC LIMIT 4`,
    ).all(project.id) as { title: string }[];
    const git = getGitStatusSnapshot(
      { project_id: project.id, root_path: project.root_path },
      { startDate: date, endDate: date },
    );
    return {
      id: project.id,
      name: redactSensitiveText(project.name),
      session_count: activity.session_count,
      token_total: activity.token_total,
      latest_session: latest?.command
        ? redactSensitiveText(latest.command)
        : latest?.excerpt
          ? redactSensitiveText(latest.excerpt)
          : null,
      git_status: redactSensitiveText(git.working_tree_status),
      recent_commits: git.recent_commits.slice(0, 3).map((commit) => redactSensitiveText(commit.title)),
      kanban_titles: kanban.map((card) => redactSensitiveText(card.title)),
    };
  });
}

function leadProject(projects: DailyProjectSummaryInput[]): DailyProjectSummaryInput | null {
  return [...projects].sort((a, b) => b.session_count - a.session_count || b.token_total - a.token_total)[0] ?? null;
}

function buildPlainLanguageFallback(date: string, projects: DailyProjectSummaryInput[], draftCount: number, kanbanCount: number): string {
  const active = projects.filter((project) => project.session_count > 0 || project.recent_commits.length > 0);
  const lead = leadProject(active);
  const achievement = lead
    ? `今天主要在 ${lead.name} 推進，整理了 ${lead.session_count} 個 session${lead.recent_commits[0] ? `，最近完成「${lead.recent_commits[0]}」` : ''}。`
    : `今天沒有新的 session 被掃描進來，DevDiary 仍完成每日檢查並更新可用的摘要狀態。`;
  const dirty = projects.find((project) => project.git_status && project.git_status !== 'clean' && project.git_status !== 'unavailable');
  const blocker = dirty
    ? `${dirty.name} 還有 ${dirty.git_status}，收尾前建議先檢查 diff、測試與 commit 切分。`
    : '今天沒有明顯阻礙；若要交付，下一步是確認摘要與 Kanban 是否符合實際進度。';
  const next = draftCount > 0 || kanbanCount > 0
    ? `下一步先 review ${draftCount} 份 project AI draft 與 ${kanbanCount} 張自動同步的 Kanban 卡片，確認後再打包或交付。`
    : '下一步先執行 Scan Now 或確認 CLI agent log 設定，讓 DevDiary 取得更多真實活動資料。';
  return [
    `## 每日開發重點（${date}）`,
    `- 達成：${achievement}`,
    `- 阻礙：${blocker}`,
    `- 下一步：${next}`,
  ].join('\n');
}

function buildGlobalSummaryPrompt(date: string, projects: DailyProjectSummaryInput[], fallback: string, systemPrompt = DEFAULT_DAILY_HIGHLIGHT_PROMPT): string {
  const structured = projects.map((project) => ({
    name: project.name,
    sessions: project.session_count,
    tokens: project.token_total,
    latest_session: project.latest_session,
    git_status: project.git_status,
    commits: project.recent_commits,
    kanban: project.kanban_titles,
  }));
  return [
    systemPrompt.trim() || DEFAULT_DAILY_HIGHLIGHT_PROMPT,
    '',
    'SAFETY_CONSTRAINTS:',
    '只根據 STRUCTURED_DATA 產生繁體中文 Markdown，每一行都要白話、可交接。',
    'target_date 是唯一允許使用的目標日期；不要使用系統今天或執行當下日期。',
    '不可輸出 project root 絕對路徑、raw transcript、credential、token、password 或私密內容。',
    '固定輸出三個 bullet，label 必須是：達成、阻礙、下一步。',
    '',
    `target_date=${date}`,
    'STRUCTURED_DATA:',
    JSON.stringify(structured),
    '',
    'FALLBACK_STYLE_EXAMPLE:',
    fallback,
  ].join('\n');
}

function parsePerProjectSummary(json: string | null | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(json ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, value as string]),
    );
  } catch {
    return {};
  }
}

async function buildGlobalSummary(
  date: string,
  projects: DailyProjectSummaryInput[],
  draftCount: number,
  kanbanCount: number,
  generator: DailySummaryDraftGenerator | null | undefined,
  systemPrompt = DEFAULT_DAILY_HIGHLIGHT_PROMPT,
): Promise<{ markdown: string; fallbackReport: string | null }> {
  const fallback = buildPlainLanguageFallback(date, projects, draftCount, kanbanCount);
  const draft = await generateDailySummaryDraft(buildGlobalSummaryPrompt(date, projects, fallback, systemPrompt), fallback, generator);
  return {
    markdown: redactSensitiveText(draft.markdown),
    fallbackReport: draft.fallback_report,
  };
}

function upsertDailyLog(db: DB, date: string, globalSummary: string, fallbackReport: string | null): void {
  const projects = buildDailyProjectInputs(db, date);
  const generatedPerProject = Object.fromEntries(
    projects.map((project) => [
      String(project.id),
      project.session_count > 0
        ? `${project.name} 在 ${date} 有 ${project.session_count} 個 session，主要進展可從 Workspace 日記與 Kanban 追蹤。`
        : `${project.name} 在 ${date} 沒有新的 session；保留既有摘要供後續 review。`,
    ]),
  );
  const existing = db
    .prepare(`SELECT per_project_summary, summary_status FROM daily_logs WHERE date = ?`)
    .get(date) as { per_project_summary: string | null; summary_status: string | null } | undefined;
  const existingPerProject = parsePerProjectSummary(existing?.per_project_summary);
  const preserveManual = existing?.summary_status === 'confirmed';
  const perProject = preserveManual
    ? { ...generatedPerProject, ...existingPerProject }
    : generatedPerProject;
  const summaryStatus = preserveManual ? 'confirmed' : 'ai_generated';
  db.prepare(
     `INSERT INTO daily_logs (date, global_summary_ai, global_summary_user, per_project_summary,
       blockers, warnings, fallback_report, summary_status)
     VALUES (?, ?, NULL, ?, '[]', '[]', ?, 'ai_generated')
     ON CONFLICT(date) DO UPDATE SET
       global_summary_ai = excluded.global_summary_ai,
       per_project_summary = excluded.per_project_summary,
       fallback_report = excluded.fallback_report,
       summary_status = ?`,
  ).run(date, globalSummary, JSON.stringify(perProject), fallbackReport, summaryStatus);
}

export class DailySchedulerRuntime {
  private running = false;
  private readonly ownerInstanceId = randomUUID();

  constructor(
    private readonly db: DB,
    private readonly runtime: () => SettingsRuntimeDefaults,
    private readonly options: DailySchedulerRuntimeOptions = {},
  ) {}

  getStatus(): DailySchedulerStatus {
    const settings = getSettings(this.db, this.runtime());
    return {
      ...settings.daily_scheduler,
      running: this.running,
    };
  }

  async runNow(input: { force?: boolean; now?: Date; preflight?: SchedulerPreflightResult } = {}): Promise<DailySchedulerRunResult> {
    const now = input.now ?? this.options.now?.() ?? new Date();
    const leaseClock = () => input.now ?? this.options.now?.() ?? new Date();
    const date = todayUTC(now);
    if (this.running) {
      return {
        status: 'running',
        date,
        message: 'Daily scheduler is already running.',
        project_count: 0,
        daily_log_updated: false,
        project_drafts_updated: 0,
        project_summaries_updated: 0, daily_diaries_updated: 0, daily_diaries_preserved: 0, daily_diaries_fallback: 0, daily_highlight_updated: 0,
        kanban_cards_updated: 0,
        kanban_ai_sync: emptyKanbanAiSync(false),
        preflight: input.preflight,
        error_message: null,
      };
    }

    const runtime = this.runtime();
    const settings = getSettings(this.db, runtime);
    if (!input.force && !settings.daily_scheduler.enabled) {
      return this.skipResult(date, 'Daily scheduler is disabled.');
    }
    if (!this.claimLease(date, now, !!input.force)) return this.skipResult(date, 'Daily scheduler already ran or is running today.');

    this.running = true;
    let leaseLost = false;
    const leaseTimer = setInterval(() => {
      if (!this.renewLease(date, leaseClock())) leaseLost = true;
    }, DAILY_SCHEDULER_RENEWAL_MS);
    leaseTimer.unref?.();
    try {
      const projects = getProjectList(this.db, date);
      // agy session 失效時整批停用 configured(agy)generator,改用 deterministic fallback,
      // 避免逐專案觸發 GUI 登入視窗。gate 內含 cooldown,失效後不會每輪重複 probe。
      let disableAntigravity = false;
      if (this.options.antigravityGate && usesAntigravityProvider(settings)) {
        const health = await this.options.antigravityGate.ensureHealthy(now.getTime(), createAntigravityProbe(settings));
        disableAntigravity = !health.healthy;
      }
      const generator = this.options.projectSummaryAgent !== undefined
        ? this.options.projectSummaryAgent
        : (disableAntigravity ? null : createConfiguredProjectDiaryAgent(settings));
      const diaryGenerator = this.options.projectSummaryAgent !== undefined
        ? this.options.projectSummaryAgent
        : (disableAntigravity ? null : createConfiguredProjectDiaryAgent(settings, 'daily_diary_entry'));
      const globalGenerator = this.options.globalSummaryAgent !== undefined
        ? this.options.globalSummaryAgent
        : (disableAntigravity ? null : createConfiguredDailySummaryAgent(settings));
      const kanbanAiGenerator = this.options.kanbanAiGenerator !== undefined
        ? this.options.kanbanAiGenerator
        : (disableAntigravity ? null : createConfiguredKanbanAiGenerator(settings));
      const query: ProjectDetailQuery = { range: '24h', includeDiary: false };
      let draftCount = 0;
      let diaryUpdated = 0;
      let diaryPreserved = 0;
      let diaryFallback = 0;
      let kanbanCount = 0;
      const kanbanAiSync = emptyKanbanAiSync(settings.kanban_ai_auto_add.enabled);
      for (const project of projects) {
        await regenerateProjectSummaryWithAgent(this.db, project.id, date, query, generator);
        draftCount += 1;
        const existingDiary = this.db.prepare(`SELECT status FROM project_daily_diaries WHERE project_id = ? AND date = ?`).get(project.id, date) as { status?: string } | undefined;
        if (existingDiary?.status === 'confirmed') {
          diaryPreserved += 1;
        } else {
          await regenerateProjectDiaryEntryWithAgent(this.db, project.id, date, date, query, diaryGenerator);
          const finalDiary = this.db.prepare(`SELECT status, fallback_report FROM project_daily_diaries WHERE project_id = ? AND date = ?`).get(project.id, date) as { status?: string; fallback_report?: string | null } | undefined;
          if (finalDiary?.status === 'confirmed') diaryPreserved += 1;
          else {
            diaryUpdated += 1;
            if (finalDiary?.fallback_report) diaryFallback += 1;
          }
        }
      }
      // Kanban always runs after every project summary and daily diary write.
      for (const project of projects) {
        for (const card of synthesizeProjectKanban(this.db, project.id, date, query)) {
          const upsert = upsertKanbanCandidate(this.db, project.id, card, now.toISOString());
          if (upsert.inserted || upsert.updated) kanbanCount += 1;
        }
        if (settings.kanban_ai_auto_add.enabled) {
          const ai = await syncKanbanAiCards(this.db, project.id, date, query, settings, {
            generator: kanbanAiGenerator,
            now: now.toISOString(),
          });
          kanbanAiSync.inserted += ai.inserted;
          kanbanAiSync.updated += ai.updated;
          kanbanAiSync.skipped += ai.skipped;
          kanbanAiSync.warnings.push(...ai.warnings);
          kanbanAiSync.agent_id = ai.agent_id ?? kanbanAiSync.agent_id;
        }
      }
      const dailyInputs = buildDailyProjectInputs(this.db, date);
      const summary = await buildGlobalSummary(date, dailyInputs, draftCount, kanbanCount, globalGenerator, settings.ai_prompts.daily_highlight);
      this.db.transaction(() => {
        const lease = this.db.prepare(
          `SELECT owner_instance_id, status, lease_expires_at FROM daily_scheduler_runs WHERE date = ?`,
        ).get(date) as { owner_instance_id: string; status: string; lease_expires_at: string } | undefined;
        if (leaseLost || lease?.owner_instance_id !== this.ownerInstanceId || lease.status !== 'running' || Date.parse(lease.lease_expires_at) <= leaseClock().getTime()) {
          throw new SchedulerLeaseLostError();
        }
        upsertDailyLog(this.db, date, summary.markdown, summary.fallbackReport);
        const finalized = this.db.prepare(`UPDATE daily_scheduler_runs SET status = 'success', completed_at = ?, error = NULL WHERE date = ? AND owner_instance_id = ? AND status = 'running'`).run(leaseClock().toISOString(), date, this.ownerInstanceId);
        if (finalized.changes !== 1) throw new SchedulerLeaseLostError();
        updateDailySchedulerState(this.db, { last_run_date: date, last_run_at: now.toISOString(), last_status: 'success', last_error: null, last_project_count: draftCount }, runtime);
      })();
      return {
        status: 'success',
        date,
        message: 'Daily scheduler completed.',
        project_count: projects.length,
        daily_log_updated: true,
        project_drafts_updated: draftCount,
        project_summaries_updated: draftCount,
        daily_diaries_updated: diaryUpdated,
        daily_diaries_preserved: diaryPreserved,
        daily_diaries_fallback: diaryFallback,
        daily_highlight_updated: 1,
        kanban_cards_updated: kanbanCount,
        kanban_ai_sync: kanbanAiSync,
        preflight: input.preflight,
        error_message: null,
      };
    } catch (err) {
      const message = sanitizeSchedulerError(err);
      let failureStateNotPersisted = false;
      try {
        const failedRun = this.db.prepare(`UPDATE daily_scheduler_runs SET status = 'failed', completed_at = ?, error = ? WHERE date = ? AND owner_instance_id = ? AND status = 'running'`).run(now.toISOString(), message, date, this.ownerInstanceId);
        if (failedRun.changes !== 1) throw new Error('scheduler terminal state was not owned');
        updateDailySchedulerState(this.db, { last_run_date: date, last_run_at: now.toISOString(), last_status: 'failed', last_error: message, last_project_count: 0 }, runtime);
      } catch { failureStateNotPersisted = true; }
      return {
        status: 'failed',
        date,
        message: failureStateNotPersisted ? `${message} failure_state_not_persisted` : message,
        project_count: 0,
        daily_log_updated: false,
        project_drafts_updated: 0,
        project_summaries_updated: 0, daily_diaries_updated: 0, daily_diaries_preserved: 0, daily_diaries_fallback: 0, daily_highlight_updated: 0,
        kanban_cards_updated: 0,
        kanban_ai_sync: emptyKanbanAiSync(settings.kanban_ai_auto_add.enabled, [message]),
        preflight: input.preflight,
        error_message: message,
      };
    } finally {
      clearInterval(leaseTimer);
      this.running = false;
    }
  }

  async tick(now: Date = this.options.now?.() ?? new Date()): Promise<DailySchedulerRunResult> {
    const runtime = this.runtime();
    const settings = getSettings(this.db, runtime);
    const date = todayUTC(now);
    if (!settings.daily_scheduler.enabled) return this.skipResult(date, 'Daily scheduler is disabled.');
    if (minutesInTaipei(now) < runTimeMinutes(settings.daily_scheduler.run_time_local)) {
      return this.skipResult(date, 'Daily scheduler run time has not arrived.');
    }
    return this.runNow({ force: false, now });
  }

  private skipResult(date: string, message: string): DailySchedulerRunResult {
    return {
      status: 'skipped',
      date,
      message,
      project_count: 0,
      daily_log_updated: false,
      project_drafts_updated: 0,
      project_summaries_updated: 0, daily_diaries_updated: 0, daily_diaries_preserved: 0, daily_diaries_fallback: 0, daily_highlight_updated: 0,
      kanban_cards_updated: 0,
      kanban_ai_sync: emptyKanbanAiSync(false),
      preflight: undefined,
      error_message: null,
    };
  }

  private claimLease(date: string, now: Date, force: boolean): boolean {
    const expires = new Date(now.getTime() + DAILY_SCHEDULER_LEASE_MS).toISOString();
    return this.db.transaction(() => {
      const existing = this.db.prepare(`SELECT status, lease_expires_at FROM daily_scheduler_runs WHERE date = ?`).get(date) as { status: string; lease_expires_at: string } | undefined;
      if (existing?.status === 'running' && Date.parse(existing.lease_expires_at) > now.getTime()) return false;
      if (!force && existing?.status === 'success') return false;
      if (existing?.status === 'running') {
        this.db.prepare(
          `UPDATE daily_scheduler_runs SET status = 'failed', completed_at = ?, error = 'Daily scheduler lease expired.' WHERE date = ? AND status = 'running' AND lease_expires_at <= ?`,
        ).run(now.toISOString(), date, now.toISOString());
      }
      this.db.prepare(
        `INSERT INTO daily_scheduler_runs (date, owner_instance_id, lease_expires_at, status, started_at, completed_at, error)
         VALUES (?, ?, ?, 'running', ?, NULL, NULL)
         ON CONFLICT(date) DO UPDATE SET owner_instance_id = excluded.owner_instance_id, lease_expires_at = excluded.lease_expires_at, status = 'running', started_at = excluded.started_at, completed_at = NULL, error = NULL`,
      ).run(date, this.ownerInstanceId, expires, now.toISOString());
      return true;
    })();
  }

  private renewLease(date: string, now: Date): boolean {
    const expires = new Date(now.getTime() + DAILY_SCHEDULER_LEASE_MS).toISOString();
    const result = this.db.prepare(
      `UPDATE daily_scheduler_runs SET lease_expires_at = ? WHERE date = ? AND owner_instance_id = ? AND status = 'running' AND lease_expires_at > ?`,
    ).run(expires, date, this.ownerInstanceId, now.toISOString());
    return result.changes === 1;
  }
}
