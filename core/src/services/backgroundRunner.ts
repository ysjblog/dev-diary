import type { DB } from '../db/index.js';
import type { DailySchedulerRunResult } from './dailyScheduler.js';
import { DailySchedulerRuntime, type DailySchedulerRuntimeOptions } from './dailyScheduler.js';
import { createAntigravityProbe, usesAntigravityProvider } from './antigravitySession.js';
import { resolveCanonicalActivityDataRoots } from './agentDetection.js';
import { createConfiguredScanProvider, runManualScan, type ManualScanResult, type ScanProvider } from './scans.js';
import {
  getSettings,
  recordScanOperation,
  updateDailySchedulerState,
  type AppSettings,
  type SettingsRuntimeDefaults,
} from './settings.js';

export interface BackgroundCycleOptions extends Omit<DailySchedulerRuntimeOptions, 'now'> {
  now?: Date;
  scanProvider?: ScanProvider;
  scheduler?: DailySchedulerRuntime;
}

export interface BackgroundCycleResult {
  status: 'success' | 'skipped' | 'failed';
  started_at: string;
  completed_at: string;
  interval_minutes: number;
  next_interval_ms: number;
  scan: ManualScanResult | null;
  diary: DailySchedulerRunResult | null;
  message: string;
  antigravity_skipped: boolean;
  error_message: string | null;
}

const MIN_BACKGROUND_INTERVAL_MS = 60_000;

export function backgroundStartupDelayMs(raw = process.env.DEVDIARY_BACKGROUND_START_DELAY_MS): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), 120_000) : 0;
}

function nowIso(now: Date): string {
  return now.toISOString();
}

function dateInTaipei(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function backgroundIntervalMs(settings: Pick<AppSettings, 'scan_interval_minutes'>): number {
  return Math.max(settings.scan_interval_minutes * 60_000, MIN_BACKGROUND_INTERVAL_MS);
}

function cycleResultBase(settings: AppSettings, startedAt: Date): Pick<BackgroundCycleResult, 'started_at' | 'interval_minutes' | 'next_interval_ms'> {
  return {
    started_at: nowIso(startedAt),
    interval_minutes: settings.scan_interval_minutes,
    next_interval_ms: backgroundIntervalMs(settings),
  };
}

function scanProviderFor(settings: AppSettings, injected?: ScanProvider): ScanProvider {
  if (injected) return injected;
  return createConfiguredScanProvider({
    DEVDIARY_DB: settings.data_storage.active_db_path,
    DEVDIARY_SCAN_PROVIDER: settings.scan_provider.provider,
    DEVDIARY_SCAN_FALLBACK: settings.scan_provider.fallback,
  }, {
    dataRoots: Object.fromEntries(settings.agents.map((agent) => [agent.id, resolveCanonicalActivityDataRoots(agent.id, agent.sources)])),
  });
}

export async function runBackgroundCycle(
  db: DB,
  runtime: () => SettingsRuntimeDefaults,
  options: BackgroundCycleOptions = {},
): Promise<BackgroundCycleResult> {
  const started = options.now ?? new Date();
  const runtimeDefaults = runtime();
  const settings = getSettings(db, runtimeDefaults);
  const base = cycleResultBase(settings, started);
  const completed = () => nowIso(new Date());
  const operation = recordScanOperation(db, runtimeDefaults, {
    phase: 'start',
    scope: 'background',
    started_at: base.started_at,
  }).operation;
  const persistResult = (result: BackgroundCycleResult): BackgroundCycleResult => {
    const state = recordScanOperation(db, runtimeDefaults, {
      phase: 'finish',
      operation,
      completed_at: result.completed_at,
      status: result.status,
      error: result.error_message,
      scanned_projects: result.scan?.scanned_projects.length ?? 0,
      inserted_sessions: result.scan?.inserted_sessions ?? 0,
    }).settings.background_scan;
    return { ...result, next_interval_ms: state.next_interval_ms ?? result.next_interval_ms };
  };

  const today = dateInTaipei(started);
  const projectRoots = settings.project_roots.length > 0 ? settings.project_roots : runtimeDefaults.projectRoots;
  const scan = runManualScan(db, {
    scope: 'global',
    today,
    provider: scanProviderFor(settings, options.scanProvider),
    projectRoots,
    projectDocFilenames: settings.project_doc_filenames,
    projectDocFolders: settings.project_doc_folders,
  });

  if (scan.status === 'failed') {
    updateDailySchedulerState(
      db,
      {
        last_run_date: today,
        last_run_at: nowIso(started),
        last_status: 'failed',
        last_error: scan.error_message ?? 'Background scan failed.',
        last_project_count: 0,
      },
      runtimeDefaults,
    );
    return persistResult({
      ...base,
      status: 'failed',
      completed_at: completed(),
      scan,
      diary: null,
      message: 'Background scan failed before diary generation.',
      antigravity_skipped: false,
      error_message: scan.error_message,
    });
  }

  // agy session 健康檢查:失效就整輪跳過 agy 呼叫改用 deterministic fallback,
  // 避免逐專案狂彈 GUI 登入視窗。此處只做「回報用」的健康探測,與 daily scheduler
  // 共用同一個 gate 實例(TTL 內不會重複 probe)。
  //
  // 注意:kanban AI 自動加卡「不再」每輪獨立執行。過去每個 background cycle(預設每
  // 5 分鐘)都對所有專案各叫一次 agy 產生看板卡,一天累積上千次 agy 呼叫、把額度燒光。
  // 現在 kanban AI 與每日摘要一律只在 daily scheduler 的「一天一次」排程內執行
  // (見 DailySchedulerRuntime.runNow),受 daily_scheduler.enabled 開關與 run_time_local
  // 排程時間控管。頻繁的 background cycle 只保留「免費、不呼叫 agy」的本機掃描。
  let antigravitySkipped = false;
  if (options.antigravityGate && usesAntigravityProvider(settings)) {
    const health = await options.antigravityGate.ensureHealthy(started.getTime(), createAntigravityProbe(settings));
    antigravitySkipped = !health.healthy;
  }

  const scheduler = options.scheduler ?? new DailySchedulerRuntime(db, runtime, {
    projectSummaryAgent: options.projectSummaryAgent,
    globalSummaryAgent: options.globalSummaryAgent,
    kanbanAiGenerator: options.kanbanAiGenerator,
    antigravityGate: options.antigravityGate,
  });
  const diary = await scheduler.tick(started);
  const failed = diary.status === 'failed';
  const skipNote = antigravitySkipped ? ' (Antigravity 未登入,本輪已跳過 AI 改用 fallback)' : '';
  return persistResult({
    ...base,
    status: failed ? 'failed' : 'success',
    completed_at: completed(),
    scan,
    diary,
    message: (failed
      ? 'Background diary generation failed after scan.'
      : diary.status === 'success'
        ? 'Background scan and diary generation completed.'
        : 'Background scan completed; daily diary did not run on this interval.') + skipNote,
    antigravity_skipped: antigravitySkipped,
    error_message: diary.error_message,
  });
}

export function formatBackgroundCycleLog(result: BackgroundCycleResult): string {
  return JSON.stringify({
    status: result.status,
    started_at: result.started_at,
    completed_at: result.completed_at,
    interval_minutes: result.interval_minutes,
    next_interval_ms: result.next_interval_ms,
    message: result.message,
    antigravity_skipped: result.antigravity_skipped,
    scan: result.scan
      ? {
          status: result.scan.status,
          scanned_projects: result.scan.scanned_projects.length,
          skipped_projects: result.scan.skipped_projects.length,
          inserted_sessions: result.scan.inserted_sessions,
          inserted_kanban_cards: result.scan.inserted_kanban_cards,
          updated_kanban_cards: result.scan.updated_kanban_cards,
          updated_daily_logs: result.scan.updated_daily_logs,
          ai_sync: result.scan.ai_sync
            ? {
                inserted: result.scan.ai_sync.inserted,
                updated: result.scan.ai_sync.updated,
                skipped: result.scan.ai_sync.skipped,
                warnings: result.scan.ai_sync.warnings.length,
              }
            : null,
          warnings: result.scan.warnings.length,
        }
      : null,
    diary: result.diary
      ? {
          status: result.diary.status,
          date: result.diary.date,
          project_count: result.diary.project_count,
          daily_log_updated: result.diary.daily_log_updated,
          project_drafts_updated: result.diary.project_drafts_updated,
          kanban_cards_updated: result.diary.kanban_cards_updated,
        }
      : null,
    error_message: result.error_message,
  });
}
