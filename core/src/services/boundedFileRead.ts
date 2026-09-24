import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export class BoundedFileReadError extends Error {}

const DEFAULT_WORKER_PATH = fileURLToPath(new URL('./boundedFileReadWorker.mjs', import.meta.url));

export function boundedReadUtf8(
  path: string,
  options: { workerPath?: string; timeoutMs?: number; maxBytes?: number } = {},
): string {
  return boundedReadUtf8WithMode(path, options, false);
}

export function boundedReadTailUtf8(
  path: string,
  options: { workerPath?: string; timeoutMs?: number; maxBytes?: number } = {},
): string {
  return boundedReadUtf8WithMode(path, options, true);
}

function boundedReadUtf8WithMode(
  path: string,
  options: { workerPath?: string; timeoutMs?: number; maxBytes?: number },
  tail: boolean,
): string {
  const timeoutMs = Math.max(25, Math.min(options.timeoutMs ?? 2_000, 30_000));
  const maxBytes = Math.max(1_024, Math.min(options.maxBytes ?? 16 * 1024 * 1024, 64 * 1024 * 1024));
  const args = [options.workerPath ?? DEFAULT_WORKER_PATH, path, String(maxBytes)];
  if (tail) args.push('--tail');
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: maxBytes + 1_024,
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) throw new BoundedFileReadError('File read timed out or failed.');
  return result.stdout;
}
