import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ManualScanResult } from './scans.js';

export interface IsolatedManualScanRequest {
  scope: 'global' | 'project';
  projectId?: number;
  today: string;
}

export class ManualScanWorkerError extends Error {
  constructor(readonly code: 'scan_timeout' | 'scan_worker_failed' | 'scan_worker_invalid', message: string) {
    super(message);
  }
}

export interface IsolatedManualScanOptions {
  dbPath: string;
  request: IsolatedManualScanRequest;
  workerPath?: string;
  execPath?: string;
  execArgv?: string[];
  timeoutMs?: number;
}

const DEFAULT_WORKER_PATH = fileURLToPath(new URL('./manualScanWorker.ts', import.meta.url));
const DEFAULT_SCAN_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function validResult(value: unknown): value is ManualScanResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ManualScanResult>;
  return (result.status === 'success' || result.status === 'failed')
    && (result.scope === 'global' || result.scope === 'project')
    && typeof result.started_at === 'string'
    && typeof result.completed_at === 'string'
    && Array.isArray(result.scanned_projects)
    && Array.isArray(result.skipped_projects)
    && Array.isArray(result.warnings)
    && typeof result.inserted_sessions === 'number'
    && typeof result.inserted_kanban_cards === 'number'
    && typeof result.updated_kanban_cards === 'number'
    && typeof result.updated_daily_logs === 'number'
    && (result.error_message === null || typeof result.error_message === 'string');
}

export function runIsolatedManualScan(options: IsolatedManualScanOptions): Promise<ManualScanResult> {
  const timeoutMs = Math.max(50, Math.min(options.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS, 10 * 60_000));
  return new Promise((resolve, reject) => {
    const child = spawn(options.execPath ?? process.execPath, [
      ...(options.execArgv ?? process.execArgv),
      options.workerPath ?? DEFAULT_WORKER_PATH,
      JSON.stringify(options.request),
    ], {
      env: { ...process.env, DEVDIARY_DB: options.dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let stdout = '';
    let stderrBytes = 0;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const terminate = () => {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 250);
      force.unref();
    };
    const timer = setTimeout(() => {
      terminate();
      finish(() => reject(new ManualScanWorkerError('scan_timeout', 'Scan exceeded the bounded runtime and was stopped.')));
    }, timeoutMs);
    timer.unref();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        terminate();
        finish(() => reject(new ManualScanWorkerError('scan_worker_invalid', 'Scan worker returned an oversized result.')));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; });
    child.once('error', () => finish(() => reject(new ManualScanWorkerError('scan_worker_failed', 'Scan worker could not start.'))));
    child.once('close', (code) => finish(() => {
      if (code !== 0) {
        reject(new ManualScanWorkerError('scan_worker_failed', stderrBytes > 0 ? 'Scan worker failed.' : 'Scan worker stopped unexpectedly.'));
        return;
      }
      try {
        const result = JSON.parse(stdout) as unknown;
        if (!validResult(result)) throw new Error('invalid');
        resolve(result);
      } catch {
        reject(new ManualScanWorkerError('scan_worker_invalid', 'Scan worker returned an invalid result.'));
      }
    }));
  });
}
