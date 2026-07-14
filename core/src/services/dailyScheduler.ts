import type { DB } from '../db/index.js';
import type { ProjectDetailQuery } from './projects.js';
import { getProjectDetail, getProjectList } from './projects.js';
import {
  createConfiguredDailySummaryAgent,
  createConfiguredProjectDiaryAgent,
  generateDailySummaryDraft,
  type DailySummaryDraftGenerator,
  type ProjectSummaryDraftGenerator,
} from './diaryAgent.js';
import { redactSensitiveText, synthesizeProjectKanban } from './kanbanSynthesis.js';
import { createConfiguredKanbanAiGenerator, emptyKanbanAiSync, syncKanbanAiCards, type KanbanAiTextGenerator } from './kanbanAiSuggestions.js';
import { regenerateProjectSummaryWithAgent } from './projectWrites.js';
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
function todayUTC(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function runTimeMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function sanitizeSchedulerError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.includes('Command failed') ? 'Daily scheduler failed.' : err.message;
  return 'Daily scheduler failed.';
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
    const detail = getProjectDetail(db, project.id, date, { range: '24h' });
    return {
      id: project.id,
      name: redactSensitiveText(project.name),
      session_count: detail?.metric_strip.range_session_count ?? 0,
      token_total: detail?.metric_strip.range_token_total ?? 0,
      latest_session: detail?.sessions[0]?.command
        ? redactSensitiveText(detail.sessions[0].command)
        : detail?.sessions[0]?.excerpt
          ? redactSensitiveText(detail.sessions[0].excerpt)
          : null,
      git_status: redactSensitiveText(detail?.git_status.working_tree_status ?? 'unavailable'),
      recent_commits: (detail?.git_status.recent_commits ?? []).slice(0, 3).map((commit) => redactSensitiveText(commit.title)),
      kanban_titles: (detail?.kanban ?? []).slice(0, 4).map((card) => redactSensitiveText(card.title)),
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
    const date = todayUTC(now);
    if (this.running) {
      return {
        status: 'running',
        date,
        message: 'Daily scheduler is already running.',
        project_count: 0,
        daily_log_updated: false,
        project_drafts_updated: 0,
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
    if (!input.force && settings.daily_scheduler.last_run_date === date && settings.daily_scheduler.last_status === 'success') {
      return this.skipResult(date, 'Daily scheduler already ran today.');
    }

    this.running = true;
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
      const globalGenerator = this.options.globalSummaryAgent !== undefined
        ? this.options.globalSummaryAgent
        : (disableAntigravity ? null : createConfiguredDailySummaryAgent(settings));
      const kanbanAiGenerator = this.options.kanbanAiGenerator !== undefined
        ? this.options.kanbanAiGenerator
        : (disableAntigravity ? null : createConfiguredKanbanAiGenerator(settings));
      const query: ProjectDetailQuery = { range: '24h' };
      let draftCount = 0;
      let kanbanCount = 0;
      const kanbanAiSync = emptyKanbanAiSync(settings.kanban_ai_auto_add.enabled);
      for (const project of projects) {
        const detail = getProjectDetail(this.db, project.id, date, query);
        if (!detail) continue;
        await regenerateProjectSummaryWithAgent(this.db, project.id, date, query, generator);
        draftCount += 1;
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
      upsertDailyLog(this.db, date, summary.markdown, summary.fallbackReport);
      updateDailySchedulerState(
        this.db,
        {
          last_run_date: date,
          last_run_at: now.toISOString(),
          last_status: 'success',
          last_error: null,
          last_project_count: draftCount,
        },
        runtime,
      );
      return {
        status: 'success',
        date,
        message: 'Daily scheduler completed.',
        project_count: projects.length,
        daily_log_updated: true,
        project_drafts_updated: draftCount,
        kanban_cards_updated: kanbanCount,
        kanban_ai_sync: kanbanAiSync,
        preflight: input.preflight,
        error_message: null,
      };
    } catch (err) {
      const message = sanitizeSchedulerError(err);
      updateDailySchedulerState(
        this.db,
        {
          last_run_date: date,
          last_run_at: now.toISOString(),
          last_status: 'failed',
          last_error: message,
          last_project_count: 0,
        },
        runtime,
      );
      return {
        status: 'failed',
        date,
        message,
        project_count: 0,
        daily_log_updated: false,
        project_drafts_updated: 0,
        kanban_cards_updated: 0,
        kanban_ai_sync: emptyKanbanAiSync(settings.kanban_ai_auto_add.enabled, [message]),
        preflight: input.preflight,
        error_message: message,
      };
    } finally {
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
      kanban_cards_updated: 0,
      kanban_ai_sync: emptyKanbanAiSync(false),
      preflight: undefined,
      error_message: null,
    };
  }
}
