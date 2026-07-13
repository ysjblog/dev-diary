export const CORE_API_CONTRACT_VERSION = 5;

export const CORE_API_CAPABILITIES = [
  'dashboard.snapshot',
  'projects.list',
  'projects.detail',
  'scan.global',
  'kanban.ai-sync',
  'settings.read',
  'settings.write',
  'agents.detect',
  'agents.executable-source.write',
  'agents.activity-log-source.write',
  'agents.custom.probe',
  'agents.custom.write',
  'scheduler.daily.status',
  'scheduler.daily.preflight',
  'scheduler.daily.run',
  'exports.daily',
  'exports.backup',
] as const;

export interface RuntimeHealthOptions {
  port?: number | null;
  startedAt?: string;
  pid?: number;
  projectRoots?: string[];
  dbPath?: string;
  now?: () => Date;
}

export function buildRuntimeHealth(options: RuntimeHealthOptions = {}) {
  const capturedAt = (options.now ?? (() => new Date()))().toISOString();
  return {
    ok: true,
    service: 'devdiary-core',
    api_contract_version: CORE_API_CONTRACT_VERSION,
    captured_at: capturedAt,
    runtime: {
      host: '127.0.0.1',
      port: options.port ?? null,
      pid: options.pid ?? process.pid,
      started_at: options.startedAt ?? capturedAt,
    },
    capabilities: [...CORE_API_CAPABILITIES],
    storage: {
      active_db_kind: options.dbPath === ':memory:' ? 'memory' : 'sqlite',
    },
    project_roots_count: options.projectRoots?.length ?? 0,
  };
}
