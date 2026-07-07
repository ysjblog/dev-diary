import { execFile as nodeExecFile } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CustomAgentProbeArg, CustomAgentSettings } from './settings.js';

const PROBE_TIMEOUT_MS = 3_000;
const MAX_OUTPUT_CHARS = 160;
const MAX_TEXT_LENGTH = 120;
const MAX_PATH_LENGTH = 1024;
const ALLOWED_PROBE_ARGS: CustomAgentProbeArg[] = ['--version', 'version', '--help', 'help'];

export interface CustomAgentProbeInput {
  display_name: string;
  model?: string;
  executable_path: string;
  probe_arg?: CustomAgentProbeArg;
}

export interface CustomAgentProbeResult {
  status: 'connected' | 'failed' | 'inconclusive';
  display_name: string;
  model: string;
  executable_path: string;
  resolved_path: string | null;
  probe_arg: CustomAgentProbeArg;
  version: string | null;
  checked_at: string;
  error_message: string | null;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export type ExecFileImpl = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
    shell: false;
  },
) => Promise<ExecFileResult>;

export interface CustomAgentProbeOptions {
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  execFileImpl?: ExecFileImpl;
  now?: () => Date;
}

export class CustomAgentValidationError extends Error {
  code = 'custom_agent_validation_error';
}

function fail(message: string): never {
  throw new CustomAgentValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeShortText(raw: unknown, field: string, max = MAX_TEXT_LENGTH): string {
  if (typeof raw !== 'string') fail(`${field} must be a string`);
  const value = raw.trim();
  if (!value) fail(`${field} must not be empty`);
  if (value.length > max) fail(`${field} must be at most ${max} characters`);
  if (value.includes('\0') || value.includes('\n') || value.includes('\r')) fail(`${field} contains an invalid value`);
  return value;
}

function looksLikeShellString(value: string): boolean {
  return /[;&|`<>]/.test(value) || value.includes('$(') || /^\s*(sh|bash|zsh)\s+/i.test(value);
}

function normalizeExecutable(raw: unknown): string {
  const value = normalizeShortText(raw, 'executable_path', MAX_PATH_LENGTH);
  if (looksLikeShellString(value)) fail('executable_path must be an executable path or command, not a shell string');
  if (!isAbsolute(value) && /\s/.test(value)) fail('command names must not contain spaces');
  return value;
}

function normalizeProbeArg(raw: unknown): CustomAgentProbeArg {
  const value = raw === undefined || raw === null || raw === '' ? '--version' : String(raw).trim();
  if (ALLOWED_PROBE_ARGS.includes(value as CustomAgentProbeArg)) return value as CustomAgentProbeArg;
  fail('probe_arg must be one of --version, version, --help, help');
}

export function normalizeCustomAgentProbeInput(raw: unknown): CustomAgentProbeInput {
  if (!isRecord(raw)) fail('custom agent payload must be an object');
  return {
    display_name: normalizeShortText(raw.display_name, 'display_name'),
    model: normalizeShortText(raw.model ?? 'custom', 'model'),
    executable_path: normalizeExecutable(raw.executable_path),
    probe_arg: normalizeProbeArg(raw.probe_arg),
  };
}

function defaultExecFile(file: string, args: string[], options: Parameters<ExecFileImpl>[2]): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    const child = nodeExecFile(file, args, options, (error, stdout, stderr) => {
      const result = { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
      if (error) {
        reject(Object.assign(error, result));
        return;
      }
      resolve(result);
    });
    child.stdin?.end();
  });
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function lookupExecutable(value: string, env: NodeJS.ProcessEnv): string | null {
  if (isAbsolute(value)) return existsSync(value) && isExecutable(value) ? value : null;
  if (value.includes('/')) return null;
  for (const dir of String(env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(dir, value);
    if (existsSync(candidate) && isExecutable(candidate)) return candidate;
  }
  return null;
}

function safeEnv(homeDir: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    HOME: homeDir,
    PATH: env.PATH ?? process.env.PATH ?? '',
    LANG: env.LANG ?? process.env.LANG ?? 'C',
    LC_ALL: env.LC_ALL ?? process.env.LC_ALL,
    TERM: env.TERM ?? process.env.TERM,
  };
}

function firstMeaningfulLine(value: string): string | null {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return null;
  return line.length > MAX_OUTPUT_CHARS ? `${line.slice(0, MAX_OUTPUT_CHARS - 1)}…` : line;
}

function sanitizedFailure(err: unknown): string {
  const record = err as { code?: unknown; signal?: unknown; killed?: unknown; message?: unknown };
  if (record.code === 'ETIMEDOUT' || record.signal === 'SIGTERM' || record.killed === true) return 'Custom agent probe 逾時。';
  return 'Custom agent probe 失敗。';
}

export async function probeCustomAgent(raw: unknown, options: CustomAgentProbeOptions = {}): Promise<CustomAgentProbeResult> {
  const input = normalizeCustomAgentProbeInput(raw);
  const homeDir = options.homeDir ?? homedir();
  const env = safeEnv(homeDir, { ...process.env, ...options.env });
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const resolved = lookupExecutable(input.executable_path, env);

  if (!resolved) {
    return {
      status: 'failed',
      display_name: input.display_name,
      model: input.model ?? 'custom',
      executable_path: input.executable_path,
      resolved_path: null,
      probe_arg: input.probe_arg ?? '--version',
      version: null,
      checked_at: checkedAt,
      error_message: '找不到可執行檔，或檔案沒有執行權限。',
    };
  }

  const cwd = join(homeDir, '.cache', 'devdiary-custom-agent-probes');
  mkdirSync(cwd, { recursive: true });
  try {
    const execFileImpl = options.execFileImpl ?? defaultExecFile;
    const result = await execFileImpl(resolved, [input.probe_arg ?? '--version'], {
      cwd,
      env,
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: 256 * 1024,
      shell: false,
    });
    return {
      status: 'connected',
      display_name: input.display_name,
      model: input.model ?? 'custom',
      executable_path: input.executable_path,
      resolved_path: resolved,
      probe_arg: input.probe_arg ?? '--version',
      version: firstMeaningfulLine(`${result.stdout}\n${result.stderr}`) ?? `${basename(resolved)} probe ok`,
      checked_at: checkedAt,
      error_message: null,
    };
  } catch (err) {
    return {
      status: 'failed',
      display_name: input.display_name,
      model: input.model ?? 'custom',
      executable_path: input.executable_path,
      resolved_path: resolved,
      probe_arg: input.probe_arg ?? '--version',
      version: null,
      checked_at: checkedAt,
      error_message: sanitizedFailure(err),
    };
  }
}

export function customAgentFromProbe(result: CustomAgentProbeResult): CustomAgentSettings {
  if (result.status !== 'connected') fail('custom agent must pass probe before it can be saved');
  return {
    id: `custom-${randomUUID()}`,
    display_name: result.display_name,
    model: result.model,
    reasoning: 'default',
    executable_path: result.executable_path,
    probe_arg: result.probe_arg,
    enabled: true,
    status: result.status,
    version: result.version,
    checked_at: result.checked_at,
    error_message: null,
  };
}
