import type { AgentDetectionSnapshot } from './agentDetection.js';
import { detectCliAgents } from './agentDetection.js';
import type { AppSettings } from './settings.js';

export type SchedulerPreflightStatus = 'ok' | 'warning' | 'failed';

export interface SchedulerPreflightCheck {
  id: 'core_health' | 'scheduler_settings' | 'agent_detection' | 'scan_provider';
  status: SchedulerPreflightStatus;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SchedulerPreflightResult {
  overall_status: SchedulerPreflightStatus;
  checks: SchedulerPreflightCheck[];
  checked_at: string;
}

export interface SchedulerPreflightInput {
  settings: AppSettings;
  core: {
    contract_version: string;
    db_path: string;
    project_roots: string[];
  };
  agentDetector?: () => Promise<AgentDetectionSnapshot>;
  now?: () => Date;
}

function overall(checks: SchedulerPreflightCheck[]): SchedulerPreflightStatus {
  if (checks.some((check) => check.status === 'failed')) return 'failed';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'ok';
}

function enabledAgentCount(snapshot: AgentDetectionSnapshot): number {
  return snapshot.agents.filter((agent) => agent.status === 'connected').length;
}

export async function buildSchedulerPreflight(input: SchedulerPreflightInput): Promise<SchedulerPreflightResult> {
  const checks: SchedulerPreflightCheck[] = [];
  checks.push({
    id: 'core_health',
    status: 'ok',
    message: 'Core runtime is reachable and ready for local scheduler work.',
    metadata: {
      contract_version: input.core.contract_version,
      db_path: input.core.db_path === ':memory:' ? ':memory:' : 'persistent',
    },
  });

  checks.push({
    id: 'scheduler_settings',
    status: input.settings.daily_scheduler.enabled ? 'ok' : 'warning',
    message: input.settings.daily_scheduler.enabled
      ? `Daily scheduler is enabled for ${input.settings.daily_scheduler.run_time_local} Asia/Taipei.`
      : 'Daily scheduler is disabled; manual Run now can still execute with force.',
    metadata: {
      enabled: input.settings.daily_scheduler.enabled,
      run_time_local: input.settings.daily_scheduler.run_time_local,
      last_status: input.settings.daily_scheduler.last_status,
    },
  });

  try {
    const detector = input.agentDetector ?? (() => detectCliAgents());
    const snapshot = await detector();
    const connected = enabledAgentCount(snapshot);
    checks.push({
      id: 'agent_detection',
      status: connected > 0 ? 'ok' : 'warning',
      message: connected > 0
        ? `${connected} CLI agent${connected === 1 ? '' : 's'} detected.`
        : 'No connected CLI agent detected; deterministic fallback will be used.',
      metadata: {
        connected_agents: connected,
        checked_at: snapshot.checked_at,
      },
    });
  } catch {
    checks.push({
      id: 'agent_detection',
      status: 'warning',
      message: 'Agent detection failed; deterministic fallback will be used.',
    });
  }

  checks.push({
    id: 'scan_provider',
    status: input.settings.scan_provider.provider === 'cli-logs' ? 'ok' : 'warning',
    message: input.settings.scan_provider.provider === 'cli-logs'
      ? 'Scan provider is configured for real CLI logs.'
      : 'Scan provider is not using real CLI logs.',
    metadata: {
      provider: input.settings.scan_provider.provider,
      fallback: input.settings.scan_provider.fallback,
      project_roots_count: input.settings.project_roots.length || input.core.project_roots.length,
    },
  });

  return {
    overall_status: overall(checks),
    checks,
    checked_at: (input.now?.() ?? new Date()).toISOString(),
  };
}
