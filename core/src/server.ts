import express, { type Express, type Request, type Response } from 'express';
import { basename, dirname } from 'node:path';
import type { DB } from './db/index.js';
import { getDashboardSnapshot } from './services/dashboard.js';
import { getProjectList, getProjectDetail, type ProjectDetailQuery } from './services/projects.js';
import { detectCliAgents, resolveCanonicalActivityDataRoots, type AgentDetectionSnapshot } from './services/agentDetection.js';
import { DailySchedulerRuntime } from './services/dailyScheduler.js';
import { AntigravitySessionGate } from './services/antigravitySession.js';
import { createConfiguredProjectDiaryAgent, type ProjectSummaryDraftGenerator } from './services/diaryAgent.js';
import {
  createConfiguredKanbanAiGenerator,
  emptyKanbanAiSync,
  syncKanbanAiCards,
  type KanbanAiTextGenerator,
} from './services/kanbanAiSuggestions.js';
import { ExportValidationError, buildDailyMarkdownExport, buildRedactedBackupExport } from './services/exports.js';
import { buildRuntimeHealth, type RuntimeHealthOptions } from './services/runtimeHealth.js';
import { buildSchedulerPreflight } from './services/schedulerPreflight.js';
import { ScanNotFoundError, createConfiguredScanProvider, resolveScanProviderPolicy, runManualScan } from './services/scans.js';
import type { ScanProvider, ScanProviderPolicy } from './services/scans.js';
import {
  SettingsValidationError,
  SettingsConflictError,
  addCustomAgent,
  getSettings,
  normalizeCanonicalAgentSources,
  removeCustomAgent,
  updateCanonicalAgentSources,
  updateCustomAgentEnabled,
  updateSettings,
  recordScanOperation,
  startScanOperationHeartbeat,
  BackgroundScanStateBusyError,
  type AppSettings,
} from './services/settings.js';
import { CustomAgentValidationError, customAgentFromProbe, probeCustomAgent } from './services/customAgents.js';
import {
  ProjectWriteNotFoundError,
  ProjectWriteValidationError,
  acceptProjectSummaryDraft,
  addProjectComment,
  deleteProjectComment,
  regenerateProjectSummaryWithAgent,
  regenerateProjectDiaryEntryWithAgent,
  saveProjectDiaryEntry,
  saveProjectSummary,
  updateKanbanCardStatus,
  updateProjectComment,
} from './services/projectWrites.js';
import { RangeValidationError } from './domain/dateRange.js';
import type { RangeKey } from './domain/types.js';
import { normalizeAgentId } from './domain/agents.js';
import { taipeiDate } from './services/taipeiDate.js';

const VALID_RANGES: RangeKey[] = ['all', '24h', '7d', '1m', 'custom'];
const ALLOWED_BROWSER_ORIGINS = new Set([
  'tauri://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function applyLocalCors(req: Request, res: Response): void {
  const origin = req.get('origin');
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
}

function todayUTC(): string {
  return taipeiDate();
}

function parsePositiveId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function parseRangeQuery(req: Request): ProjectDetailQuery | null {
  const range = String(req.query.range ?? 'all') as RangeKey;
  if (!VALID_RANGES.includes(range)) return null;
  return {
    range,
    customStart: req.query.start ? String(req.query.start) : null,
    customEnd: req.query.end ? String(req.query.end) : null,
  };
}

function parseDashboardRangeQuery(req: Request): ProjectDetailQuery | null {
  const range = String(req.query.range ?? '24h') as RangeKey;
  if (!VALID_RANGES.includes(range)) return null;
  return {
    range,
    customStart: req.query.start ? String(req.query.start) : null,
    customEnd: req.query.end ? String(req.query.end) : null,
  };
}

function sendRangeError(res: Response, err: unknown): Response | void {
  if (err instanceof RangeValidationError) {
    return res.status(400).json({ error: 'invalid_range', message: err.message });
  }
  if (err instanceof BackgroundScanStateBusyError || isSqliteBusyError(err)) {
    return res.status(503).json({ error: 'database_busy', message: '資料庫正在更新，掃描狀態尚未保存；請稍後再試。' });
  }
  throw err;
}

export function isSqliteBusyError(err: unknown): boolean {
  const sqliteCode = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
  return sqliteCode === 'SQLITE_BUSY' || sqliteCode === 'SQLITE_LOCKED' || sqliteCode === 'database_busy';
}

function sendWriteError(res: Response, err: unknown): Response | void {
  if (err instanceof ProjectWriteValidationError) {
    return res.status(400).json({ error: err.code, message: err.message });
  }
  if (err instanceof ProjectWriteNotFoundError) {
    return res.status(404).json({ error: err.code, message: err.message });
  }
  if (err instanceof RangeValidationError) {
    return res.status(400).json({ error: 'invalid_range', message: err.message });
  }
  if (isSqliteBusyError(err)) {
    return res.status(503).json({
      error: 'database_busy',
      message: '資料庫正在更新，備忘錄尚未變更；請稍後再試。',
    });
  }
  throw err;
}

function parseBooleanQuery(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const value = String(raw).toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/**
 * Build the local HTTP API consumed by the Tauri/React UI (spec §6.3).
 * Local-only; never exposed as a remote network service.
 */
export interface CreateServerOptions {
  scanProvider?: ScanProvider;
  scanProviderPolicy?: ScanProviderPolicy;
  projectSummaryAgent?: ProjectSummaryDraftGenerator;
  kanbanAiGenerator?: KanbanAiTextGenerator;
  agentDetector?: () => Promise<AgentDetectionSnapshot>;
  dailyScheduler?: DailySchedulerRuntime;
  projectRoots?: string[];
  dbPath?: string;
  runtime?: RuntimeHealthOptions;
}

export function createServer(db: DB, opts: CreateServerOptions = {}): Express {
  const app = express();
  app.use((req, res, next) => {
    applyLocalCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  app.use(express.json());

  const settingsRuntime = () => ({
    activeDbPath: opts.dbPath ?? ':memory:',
    projectRoots: opts.projectRoots ?? [],
    scanProviderPolicy:
      opts.scanProviderPolicy ??
      resolveScanProviderPolicy({
        DEVDIARY_DB: opts.dbPath ?? ':memory:',
        DEVDIARY_SCAN_PROVIDER: process.env.DEVDIARY_SCAN_PROVIDER,
        DEVDIARY_SCAN_FALLBACK: process.env.DEVDIARY_SCAN_FALLBACK,
      }),
  });

  const scanProviderFor = (settings: AppSettings): ScanProvider | undefined => {
    if (opts.scanProvider) return opts.scanProvider;
    return createConfiguredScanProvider({
      DEVDIARY_DB: settings.data_storage.active_db_path,
      DEVDIARY_SCAN_PROVIDER: settings.scan_provider.provider,
      DEVDIARY_SCAN_FALLBACK: settings.scan_provider.fallback,
    }, {
      dataRoots: Object.fromEntries(settings.agents.map((agent) => [agent.id, resolveCanonicalActivityDataRoots(agent.id, agent.sources)])),
    }, db);
  };
  const detectConfiguredAgents = async (): Promise<AgentDetectionSnapshot> => {
    if (opts.agentDetector) return opts.agentDetector();
    const settings = getSettings(db, settingsRuntime());
    return detectCliAgents({
      sourceSettings: Object.fromEntries(settings.agents.map((agent) => [agent.id, agent.sources])),
      projects: getProjectList(db).map((project) => ({ id: project.id, root_path: project.root_path })),
    });
  };
  const assertProductDataRoots = (id: 'claude-code' | 'codex-cli' | 'antigravity-cli', roots: string[]) => {
    const forbidden = id === 'claude-code' ? new Set(['projects']) : id === 'codex-cli' ? new Set(['sessions', 'archived_sessions']) : new Set(['log', 'brain']);
    const knownClaudeEncoded = id === 'claude-code'
      ? new Set(getProjectList(db).flatMap((project) => [
        project.root_path.replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9.-]/g, '-'),
        project.root_path.replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-'),
      ]))
      : new Set<string>();
    for (const root of roots) {
      if (forbidden.has(basename(root)) || (id === 'claude-code' && basename(dirname(root)) === 'projects' && knownClaudeEncoded.has(basename(root)))) {
        throw new SettingsValidationError(`agents.${id}.sources.activity_logs.configured_data_roots must be a product data root, not a derived scan folder`);
      }
    }
  };
  const kanbanAiGeneratorFor = (settings: AppSettings): KanbanAiTextGenerator | null => opts.kanbanAiGenerator ?? createConfiguredKanbanAiGenerator(settings);
  const runScanKanbanAiSync = async (
    projectIds: number[],
    today: string,
    query: ProjectDetailQuery,
    settings: AppSettings,
  ) => {
    if (!settings.kanban_ai_auto_add.enabled) return emptyKanbanAiSync(false);
    const aggregate = emptyKanbanAiSync(true);
    const generator = kanbanAiGeneratorFor(settings);
    for (const projectId of projectIds) {
      const result = await syncKanbanAiCards(db, projectId, today, query, settings, { generator });
      aggregate.inserted += result.inserted;
      aggregate.updated += result.updated;
      aggregate.skipped += result.skipped;
      aggregate.warnings.push(...result.warnings);
      aggregate.agent_id = result.agent_id ?? aggregate.agent_id;
    }
    return aggregate;
  };
  const dailyScheduler =
    opts.dailyScheduler ??
    new DailySchedulerRuntime(db, settingsRuntime, {
      projectSummaryAgent: opts.projectSummaryAgent,
      antigravityGate: new AntigravitySessionGate(),
    });

  const runtimeStartedAt = opts.runtime?.startedAt ?? new Date().toISOString();

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json(buildRuntimeHealth({
      port: opts.runtime?.port ?? Number(process.env.DEVDIARY_PORT ?? 4317),
      startedAt: runtimeStartedAt,
      pid: opts.runtime?.pid,
      projectRoots: opts.projectRoots ?? [],
      dbPath: opts.dbPath ?? ':memory:',
    }));
  });

  app.get('/api/dashboard', (req: Request, res: Response) => {
    const range = String(req.query.range ?? '24h') as RangeKey;
    if (!VALID_RANGES.includes(range)) {
      return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    }
    try {
      const snapshot = getDashboardSnapshot(db, {
        range,
        today: todayUTC(),
        customStart: req.query.start ? String(req.query.start) : null,
        customEnd: req.query.end ? String(req.query.end) : null,
      });
      res.json(snapshot);
    } catch (err) {
      if (err instanceof RangeValidationError) {
        return res.status(400).json({ error: 'invalid_range', message: err.message });
      }
      throw err;
    }
  });

  app.get('/api/projects', (_req: Request, res: Response) => {
    res.json(getProjectList(db, todayUTC()));
  });

  app.get('/api/settings', (_req: Request, res: Response) => {
    res.json(getSettings(db, settingsRuntime()));
  });

  app.patch('/api/settings', (req: Request, res: Response) => {
    try {
      return res.json(updateSettings(db, req.body ?? {}, settingsRuntime()));
    } catch (err) {
      if (err instanceof SettingsValidationError) {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.get('/api/agents/detect', async (_req: Request, res: Response) => {
    try {
      return res.json(await detectConfiguredAgents());
    } catch {
      return res.status(500).json({ error: 'agent_detection_failed', message: 'Agent detection failed.' });
    }
  });

  app.post('/api/agents/detect', async (_req: Request, res: Response) => {
    try {
      return res.json(await detectConfiguredAgents());
    } catch {
      return res.status(500).json({ error: 'agent_detection_failed', message: 'Agent detection failed.' });
    }
  });

  app.put('/api/agents/:id/executable-source', async (req: Request, res: Response) => {
    const id = normalizeAgentId(String(req.params.id));
    if (!id) return res.status(404).json({ error: 'agent_not_found', message: 'Unknown canonical agent.' });
    try {
      const current = getSettings(db, settingsRuntime());
      const agent = current.agents.find((item) => item.id === id)!;
      const executable = req.body?.mode === 'auto'
        ? { mode: 'auto' as const, configured_path: null }
        : { mode: req.body?.mode, configured_path: req.body?.configured_path };
      const sources = normalizeCanonicalAgentSources({ executable, activity_logs: agent.sources.activity_logs }, `agents.${id}.sources`);
      if (sources.executable.mode === 'custom') {
        const probe = await detectCliAgents({ sourceSettings: { [id]: sources } });
        const result = probe.agents.find((item) => item.id === id)!;
        if (result.source_status?.executable.probe_status !== 'connected') {
          return res.status(400).json({ error: 'executable_probe_failed', message: result.error_message ?? 'CLI executable probe failed.' });
        }
      }
      const settings = updateCanonicalAgentSources(db, id, sources, settingsRuntime(), req.body?.expected_revision);
      const source_status = (await detectConfiguredAgents()).agents.find((item) => item.id === id)?.source_status;
      return res.json({ agent: settings.agents.find((item) => item.id === id), source_status, revision: settings.revision, updated_at: settings.updated_at });
    } catch (err) {
      if (err instanceof SettingsConflictError) return res.status(409).json({ error: err.code, message: err.message });
      if (err instanceof SettingsValidationError) return res.status(400).json({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.put('/api/agents/:id/activity-log-source', async (req: Request, res: Response) => {
    const id = normalizeAgentId(String(req.params.id));
    if (!id) return res.status(404).json({ error: 'agent_not_found', message: 'Unknown canonical agent.' });
    try {
      const current = getSettings(db, settingsRuntime());
      const agent = current.agents.find((item) => item.id === id)!;
      const { mode, configured_data_roots } = req.body ?? {};
      const sources = normalizeCanonicalAgentSources({ executable: agent.sources.executable, activity_logs: { mode, configured_data_roots } }, `agents.${id}.sources`);
      assertProductDataRoots(id, sources.activity_logs.configured_data_roots);
      const settings = updateCanonicalAgentSources(db, id, sources, settingsRuntime(), req.body?.expected_revision);
      const source_status = (await detectConfiguredAgents()).agents.find((item) => item.id === id)?.source_status;
      return res.json({ agent: settings.agents.find((item) => item.id === id), source_status, revision: settings.revision, updated_at: settings.updated_at });
    } catch (err) {
      if (err instanceof SettingsConflictError) return res.status(409).json({ error: err.code, message: err.message });
      if (err instanceof SettingsValidationError) return res.status(400).json({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post('/api/agents/custom/probe', async (req: Request, res: Response) => {
    try {
      return res.json(await probeCustomAgent(req.body ?? {}));
    } catch (err) {
      if (err instanceof CustomAgentValidationError) {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/api/agents/custom', async (req: Request, res: Response) => {
    try {
      const probe = await probeCustomAgent(req.body ?? {});
      if (probe.status !== 'connected') {
        return res.status(400).json({ error: 'custom_agent_probe_failed', message: probe.error_message ?? 'Custom agent probe failed.', probe });
      }
      const settings = addCustomAgent(db, customAgentFromProbe(probe), settingsRuntime());
      return res.json(settings);
    } catch (err) {
      if (err instanceof CustomAgentValidationError || err instanceof SettingsValidationError) {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.patch('/api/agents/custom/:id', (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body.enabled !== 'boolean') {
        return res.status(400).json({ error: 'custom_agent_validation_error', message: 'enabled must be boolean' });
      }
      return res.json(updateCustomAgentEnabled(db, String(req.params.id), req.body.enabled, settingsRuntime()));
    } catch (err) {
      if (err instanceof SettingsValidationError) {
        return res.status(404).json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.delete('/api/agents/custom/:id', (req: Request, res: Response) => {
    try {
      return res.json(removeCustomAgent(db, String(req.params.id), settingsRuntime()));
    } catch (err) {
      if (err instanceof SettingsValidationError) {
        return res.status(404).json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.get('/api/scheduler/daily', (_req: Request, res: Response) => {
    return res.json(dailyScheduler.getStatus());
  });

  const schedulerPreflight = async () => {
    const settings = getSettings(db, settingsRuntime());
    return buildSchedulerPreflight({
      settings,
      core: {
        contract_version: 'core-api-v1',
        db_path: settings.data_storage.active_db_path,
        project_roots: settings.project_roots,
      },
      agentDetector: detectConfiguredAgents,
    });
  };

  app.get('/api/scheduler/daily/preflight', async (_req: Request, res: Response) => {
    return res.json(await schedulerPreflight());
  });

  app.post('/api/scheduler/daily/run', async (_req: Request, res: Response) => {
    const preflight = await schedulerPreflight();
    const result = await dailyScheduler.runNow({ force: true, preflight });
    return res.status(result.status === 'failed' ? 500 : 200).json(result);
  });

  app.get('/api/exports/daily', (req: Request, res: Response) => {
    const settings = getSettings(db, settingsRuntime());
    const date = req.query.date ? String(req.query.date) : todayUTC();
    const includeComments = parseBooleanQuery(req.query.include_comments, settings.privacy.include_comments_in_exports);
    try {
      const artifact = buildDailyMarkdownExport(db, {
        date,
        includeComments,
        redactSensitiveValues: settings.privacy.redact_sensitive_values,
      });
      res.setHeader('content-type', 'text/markdown; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="${artifact.filename}"`);
      return res.send(artifact.content);
    } catch (err) {
      if (err instanceof ExportValidationError) {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.get('/api/exports/backup', (req: Request, res: Response) => {
    const settings = getSettings(db, settingsRuntime());
    const includeComments = parseBooleanQuery(req.query.include_comments, settings.privacy.include_comments_in_exports);
    const bundle = buildRedactedBackupExport(db, {
      includeComments,
      redactSensitiveValues: settings.privacy.redact_sensitive_values,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="devdiary-backup-redacted-${stamp}.json"`);
    return res.json(bundle);
  });

  app.post('/api/scan', async (req: Request, res: Response) => {
    const rangeQuery = parseDashboardRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    const today = todayUTC();
    const settings = getSettings(db, settingsRuntime());
    let operation;
    try {
      operation = recordScanOperation(db, settingsRuntime(), { phase: 'start', scope: 'global' }).operation;
    } catch (err) {
      if (err instanceof BackgroundScanStateBusyError) return res.status(503).json({ error: err.code, message: '資料庫正在更新，掃描尚未開始；請稍後再試。' });
      throw err;
    }
    const stopHeartbeat = startScanOperationHeartbeat(db, settingsRuntime(), operation);
    let scan;
    try {
      scan = runManualScan(db, {
        scope: 'global', today, provider: scanProviderFor(settings), projectRoots: settings.project_roots,
        projectDocFilenames: settings.project_doc_filenames, projectDocFolders: settings.project_doc_folders,
      });
    } catch (err) {
      stopHeartbeat();
      // A thrown scan still owns one terminal cleanup attempt; recovery handles a
      // transient SQLite-busy cleanup on a later Core read.
      try { recordScanOperation(db, settingsRuntime(), { phase: 'finish', operation, status: 'failed', error: 'Scan aborted unexpectedly.' }); } catch { /* safe later reconciliation */ }
      throw err;
    }
    stopHeartbeat();
    let scanState;
    try {
      scanState = recordScanOperation(db, settingsRuntime(), {
        phase: 'finish', operation, completed_at: scan.completed_at,
        status: scan.status === 'success' ? 'success' : 'failed', error: scan.error_message,
        scanned_projects: scan.scanned_projects.length, inserted_sessions: scan.inserted_sessions,
      }).settings.background_scan;
    } catch (err) {
      if (err instanceof BackgroundScanStateBusyError) return res.status(503).json({ error: err.code, message: '資料庫正在更新，掃描已完成但狀態尚未保存；請稍後再試。' });
      throw err;
    }
    if (scan.status === 'failed') return res.status(500).json({ error: 'scan_failed', message: scan.error_message, scan, background_scan: scanState });
    try {
      scan.ai_sync = await runScanKanbanAiSync(scan.scanned_projects, today, rangeQuery, settings);
      return res.json({
        scan,
        dashboard: getDashboardSnapshot(db, {
          range: rangeQuery.range ?? '24h',
          today,
          customStart: rangeQuery.customStart,
          customEnd: rangeQuery.customEnd,
        }),
        projects: getProjectList(db, today),
        background_scan: scanState,
      });
    } catch (err) {
      return sendRangeError(res, err);
    }
  });

  app.post('/api/projects/:id/scan', async (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    const projectExists = db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId);
    if (!projectExists) return res.status(404).json({ error: 'not_found', message: `Project ${projectId} not found` });
    const today = todayUTC();
    try {
      const settings = getSettings(db, settingsRuntime());
      let scan;
      const operation = recordScanOperation(db, settingsRuntime(), { phase: 'start', scope: 'project', project_id: projectId }).operation;
      const stopHeartbeat = startScanOperationHeartbeat(db, settingsRuntime(), operation);
      try {
        scan = runManualScan(db, {
          scope: 'project', projectId, today, provider: scanProviderFor(settings),
          projectDocFilenames: settings.project_doc_filenames, projectDocFolders: settings.project_doc_folders,
        });
      } catch (err) {
        stopHeartbeat();
        try { recordScanOperation(db, settingsRuntime(), { phase: 'finish', operation, status: 'failed', error: 'Scan aborted unexpectedly.' }); } catch { /* recovered later */ }
        throw err;
      }
      stopHeartbeat();
      const scanState = recordScanOperation(db, settingsRuntime(), {
        phase: 'finish', operation, completed_at: scan.completed_at,
        status: scan.status === 'success' ? 'success' : 'failed', error: scan.error_message,
        scanned_projects: scan.scanned_projects.length, inserted_sessions: scan.inserted_sessions,
      }).settings.background_scan;
      if (scan.status === 'failed') return res.status(500).json({ error: 'scan_failed', message: scan.error_message, scan, background_scan: scanState });
      scan.ai_sync = await runScanKanbanAiSync(scan.scanned_projects, today, rangeQuery, settings);
      return res.json({
        scan,
        dashboard: getDashboardSnapshot(db, { range: '24h', today }),
        projects: getProjectList(db, today),
        project_detail: getProjectDetail(db, projectId, today, rangeQuery),
        background_scan: scanState,
      });
    } catch (err) {
      if (err instanceof ScanNotFoundError) {
        return res.status(404).json({ error: err.code, message: err.message });
      }
      return sendRangeError(res, err);
    }
  });

  app.post('/api/projects/:id/kanban/ai-sync', async (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    const today = todayUTC();
    try {
      const settings = getSettings(db, settingsRuntime());
      const ai_sync = await syncKanbanAiCards(db, projectId, today, rangeQuery, settings, {
        generator: kanbanAiGeneratorFor(settings),
        force: true,
      });
      return res.json({
        ai_sync,
        project_detail: getProjectDetail(db, projectId, today, rangeQuery),
      });
    } catch (err) {
      if (err instanceof RangeValidationError) return res.status(400).json({ error: 'invalid_range', message: err.message });
      throw err;
    }
  });

  app.post('/api/projects/:id/comments', (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      return res.status(201).json(addProjectComment(db, projectId, req.body ?? {}, todayUTC(), rangeQuery));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.patch('/api/projects/:id/comments/:commentId', (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    const commentId = parsePositiveId(req.params.commentId);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    if (commentId === null) return res.status(400).json({ error: 'invalid_id', message: 'comment id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      return res.json(updateProjectComment(db, projectId, commentId, req.body ?? {}, todayUTC(), rangeQuery));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.delete('/api/projects/:id/comments/:commentId', (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    const commentId = parsePositiveId(req.params.commentId);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    if (commentId === null) return res.status(400).json({ error: 'invalid_id', message: 'comment id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      return res.json(deleteProjectComment(db, projectId, commentId, todayUTC(), rangeQuery));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.patch('/api/projects/:id/kanban/:cardId', (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    const cardId = parsePositiveId(req.params.cardId);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    if (cardId === null) return res.status(400).json({ error: 'invalid_id', message: 'kanban card id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      return res.json(updateKanbanCardStatus(db, projectId, cardId, req.body ?? {}, todayUTC(), rangeQuery));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.put('/api/projects/:id/summary', (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      return res.json(saveProjectSummary(db, projectId, req.body ?? {}, todayUTC(), rangeQuery));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.post('/api/projects/:id/summary/regenerate', async (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      const settings = getSettings(db, settingsRuntime());
      const agent = opts.projectSummaryAgent ?? createConfiguredProjectDiaryAgent(settings, 'project_diary');
      return res.json(await regenerateProjectSummaryWithAgent(db, projectId, todayUTC(), rangeQuery, agent));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.post('/api/projects/:id/summary/accept-draft', (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      return res.json(acceptProjectSummaryDraft(db, projectId, todayUTC(), rangeQuery));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.put('/api/projects/:id/diary/:date', (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      return res.json(saveProjectDiaryEntry(db, projectId, req.params.date, req.body ?? {}, todayUTC(), rangeQuery));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.post('/api/projects/:id/diary/:date/regenerate', async (req: Request, res: Response) => {
    const projectId = parsePositiveId(req.params.id);
    if (projectId === null) return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      const settings = getSettings(db, settingsRuntime());
      const agent = opts.projectSummaryAgent ?? createConfiguredProjectDiaryAgent(settings, 'daily_diary_entry');
      return res.json(await regenerateProjectDiaryEntryWithAgent(db, projectId, req.params.date, todayUTC(), rangeQuery, agent));
    } catch (err) {
      return sendWriteError(res, err);
    }
  });

  app.get('/api/projects/:id', (req: Request, res: Response) => {
    const raw = req.params.id ?? '';
    const projectId = parsePositiveId(raw);
    if (projectId === null) {
      return res.status(400).json({ error: 'invalid_id', message: 'project id must be a positive integer' });
    }
    const rangeQuery = parseRangeQuery(req);
    if (!rangeQuery) return res.status(400).json({ error: 'invalid_range', message: `range must be one of ${VALID_RANGES.join(', ')}` });
    try {
      const snapshot = getProjectDetail(db, projectId, todayUTC(), rangeQuery);
      if (!snapshot) {
        return res.status(404).json({ error: 'not_found', message: `project ${raw} not found` });
      }
      res.json(snapshot);
    } catch (err) {
      return sendRangeError(res, err);
    }
  });

  return app;
}
