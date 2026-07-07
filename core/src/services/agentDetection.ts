import { execFile as nodeExecFile } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { CANONICAL_AGENTS } from '../domain/agents.js';
import type { CanonicalAgentId } from '../domain/types.js';

const PROBE_TIMEOUT_MS = 3_000;
const MAX_OUTPUT_CHARS = 160;
const AUTH_MARKER = 'you are not logged into antigravity';

export interface AgentDetectionResult {
  id: CanonicalAgentId;
  display_name: string;
  available: boolean;
  status: 'connected' | 'offline';
  binary_path: string | null;
  version: string | null;
  checked_at: string;
  error_message: string | null;
}

export interface AgentDetectionSnapshot {
  checked_at: string;
  agents: AgentDetectionResult[];
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

export interface AgentDetectionOptions {
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  execFileImpl?: ExecFileImpl;
  now?: () => Date;
}

interface ProbeSpec {
  id: CanonicalAgentId;
  envNames: string[];
  candidates: string[];
  args: string[];
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

function lookupPath(binary: string, env: NodeJS.ProcessEnv): string | null {
  if (binary.includes('/')) return existsSync(binary) && isExecutable(binary) ? binary : null;
  for (const dir of String(env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(dir, binary);
    if (existsSync(candidate) && isExecutable(candidate)) return candidate;
  }
  return null;
}

function resolveBinary(spec: ProbeSpec, env: NodeJS.ProcessEnv): string | null {
  for (const name of spec.envNames) {
    const configured = env[name]?.trim();
    if (configured) {
      const resolved = lookupPath(configured, env);
      if (resolved) return resolved;
    }
  }
  for (const candidate of spec.candidates) {
    const resolved = lookupPath(candidate, env);
    if (resolved) return resolved;
  }
  return null;
}

function firstMeaningfulLine(value: string): string | null {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  return line ? truncate(line, MAX_OUTPUT_CHARS) : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function sanitizeFailure(err: unknown): string {
  const record = err as { code?: unknown; signal?: unknown; killed?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown };
  const combined = `${record.stdout ?? ''}\n${record.stderr ?? ''}\n${record.message ?? ''}`.toLowerCase();
  if (combined.includes(AUTH_MARKER)) return 'CLI 尚未登入，請先在 Terminal 完成登入。';
  if (record.code === 'ETIMEDOUT' || record.signal === 'SIGTERM' || record.killed === true || combined.includes('timeout')) {
    return 'CLI probe 逾時。';
  }
  return 'CLI probe 失敗。';
}

function probeSpecs(homeDir: string): ProbeSpec[] {
  return [
    {
      id: 'claude-code',
      envNames: ['DEVDIARY_CLAUDE_BIN', 'CLAUDE_CODE_BIN'],
      candidates: ['claude'],
      args: ['--version'],
    },
    {
      id: 'codex-cli',
      envNames: ['DEVDIARY_CODEX_BIN', 'CODEX_CLI_PATH'],
      candidates: ['codex'],
      args: ['--version'],
    },
    {
      id: 'antigravity-cli',
      envNames: ['DEVDIARY_ANTIGRAVITY_BIN', 'AGY_CLI_PATH'],
      candidates: [join(homeDir, '.local', 'bin', 'agy'), 'agy'],
      args: ['--help'],
    },
  ];
}

export async function detectCliAgents(options: AgentDetectionOptions = {}): Promise<AgentDetectionSnapshot> {
  const homeDir = options.homeDir ?? homedir();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    HOME: homeDir,
    PATH: `${join(homeDir, '.local', 'bin')}${delimiter}${options.env?.PATH ?? process.env.PATH ?? ''}`,
  };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  const execFileImpl = options.execFileImpl ?? defaultExecFile;
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const cwd = join(homeDir, '.cache');
  mkdirSync(cwd, { recursive: true });

  const agents = await Promise.all(
    probeSpecs(homeDir).map(async (spec): Promise<AgentDetectionResult> => {
      const binary = resolveBinary(spec, env);
      if (!binary) {
        return {
          id: spec.id,
          display_name: CANONICAL_AGENTS[spec.id].display_name,
          available: false,
          status: 'offline',
          binary_path: null,
          version: null,
          checked_at: checkedAt,
          error_message: 'CLI binary not found.',
        };
      }
      try {
        const result = await execFileImpl(binary, spec.args, {
          cwd,
          env,
          timeout: PROBE_TIMEOUT_MS,
          maxBuffer: 256 * 1024,
          shell: false,
        });
        return {
          id: spec.id,
          display_name: CANONICAL_AGENTS[spec.id].display_name,
          available: true,
          status: 'connected',
          binary_path: binary,
          version: firstMeaningfulLine(`${result.stdout}\n${result.stderr}`) ?? 'Installed',
          checked_at: checkedAt,
          error_message: null,
        };
      } catch (err) {
        return {
          id: spec.id,
          display_name: CANONICAL_AGENTS[spec.id].display_name,
          available: false,
          status: 'offline',
          binary_path: binary,
          version: null,
          checked_at: checkedAt,
          error_message: sanitizeFailure(err),
        };
      }
    }),
  );

  return { checked_at: checkedAt, agents };
}
