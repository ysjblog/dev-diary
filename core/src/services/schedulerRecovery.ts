import type { DailySchedulerRuntime, DailySchedulerRunResult } from './dailyScheduler.js';

export interface SchedulerRecoveryState {
  lastTickAt: number | null;
}

export interface SchedulerRecoveryOptions {
  intervalMs: number;
  recoveryThresholdMs?: number;
  now?: Date;
}

export interface SchedulerRecoveryTickResult {
  recovery: boolean;
  elapsed_ms: number | null;
  result: Promise<DailySchedulerRunResult>;
}

export function runSchedulerTickWithRecovery(
  scheduler: DailySchedulerRuntime,
  state: SchedulerRecoveryState,
  options: SchedulerRecoveryOptions,
): SchedulerRecoveryTickResult {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const elapsed = state.lastTickAt === null ? null : nowMs - state.lastTickAt;
  const threshold = options.recoveryThresholdMs ?? options.intervalMs * 2.5;
  const recovery = elapsed !== null && elapsed > threshold;
  state.lastTickAt = nowMs;
  return {
    recovery,
    elapsed_ms: elapsed,
    result: scheduler.tick(now),
  };
}
