import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export class BoundedFileReadError extends Error {}

const DEFAULT_WORKER_PATH = fileURLToPath(new URL('./boundedFileReadWorker.mjs', import.meta.url));

export function boundedReadUtf8(
  path: string,
  options: { workerPath?: string; timeoutMs?: number; maxBytes?: number } = {},
): string {
  const timeoutMs = Math.max(25, Math.min(options.timeoutMs ?? 2_000, 30_000));
  const maxBytes = Math.max(1_024, Math.min(options.maxBytes ?? 16 * 1024 * 1024, 64 * 1024 * 1024));
  const result = spawnSync(process.execPath, [options.workerPath ?? DEFAULT_WORKER_PATH, path, String(maxBytes)], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: maxBytes + 1_024,
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) throw new BoundedFileReadError('File read timed out or failed.');
  return result.stdout;
}
