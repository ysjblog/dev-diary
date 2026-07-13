import { execFile as nodeExecFile } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { CANONICAL_AGENTS } from '../domain/agents.js';
import type { CanonicalAgentId } from '../domain/types.js';
import { defaultCanonicalAgentSources, type CanonicalAgentSourceSettings } from './settings.js';
import { claudeProjectEncodingVariants } from './cliLogParser.js';

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
  source_status?: AgentSourceStatus;
}

export interface AgentSourceStatus {
  executable: {
    mode: 'auto' | 'custom'; configured_path: string | null; resolved_path: string | null;
    source: 'custom' | 'environment' | 'app_bundle' | 'known_path' | 'path' | 'not_found';
    exists: boolean; is_executable: boolean; probe_status: 'connected' | 'failed' | 'not_found'; checked_at: string; error_message: string | null;
  };
  activity_logs: {
    mode: 'auto' | 'auto_plus_custom' | 'custom'; configured_data_roots: string[];
    resolved_data_roots: Array<{ path: string; source: 'default' | 'custom'; exists: boolean; readable: boolean; real_path: string | null; warning: string | null }>;
    derived_scan_locations: Array<{ data_root: string; role: 'claude_projects' | 'codex_sessions' | 'codex_archived_sessions' | 'antigravity_log' | 'antigravity_brain'; path: string; project_id: number | null; project_root: string | null; encoding_variant: 'current' | 'legacy' | null; exists: boolean; readable: boolean; warning: string | null }>;
  };
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
  appBundleCandidates?: Partial<Record<CanonicalAgentId, string[]>>;
  sourceSettings?: Partial<Record<CanonicalAgentId, CanonicalAgentSourceSettings>>;
  projects?: Array<{ id: number; root_path: string }>;
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
    const stat = statSync(path);
    accessSync(path, constants.X_OK);
    return stat.isFile();
  } catch {
    return false;
  }
}

interface ExecutableIdentity {
  realPath: string;
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
}

function readExecutableIdentity(path: string): ExecutableIdentity | null {
  try {
    const realPath = realpathSync(path);
    const stat = statSync(realPath);
    accessSync(realPath, constants.X_OK);
    if (!stat.isFile()) return null;
    return { realPath, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

function sameExecutableIdentity(left: ExecutableIdentity | null, right: ExecutableIdentity | null): boolean {
  return Boolean(left && right && left.realPath === right.realPath && left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs);
}

function lookupPath(binary: string, env: NodeJS.ProcessEnv): string | null {
  if (binary.includes('/')) return existsSync(binary) && isExecutable(binary) ? binary : null;
  for (const dir of String(env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(dir, binary);
    if (existsSync(candidate) && isExecutable(candidate)) return candidate;
  }
  return null;
}

function resolveBinary(spec: ProbeSpec, env: NodeJS.ProcessEnv): { path: string | null; source: AgentSourceStatus['executable']['source'] } {
  for (const name of spec.envNames) {
    const configured = env[name]?.trim();
    if (configured) {
      const resolved = lookupPath(configured, env);
      if (resolved) return { path: resolved, source: 'environment' };
    }
  }
  for (const candidate of spec.candidates) {
    const resolved = lookupPath(candidate, env);
    if (resolved) {
      const source = candidate.includes('.app/') ? 'app_bundle' : candidate.includes('/') ? 'known_path' : 'path';
      return { path: resolved, source };
    }
  }
  return { path: null, source: 'not_found' };
}

export function buildSafeChildEnv(input: NodeJS.ProcessEnv, homeDir: string): NodeJS.ProcessEnv {
  const allow = new Set(['TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']);
  const out: NodeJS.ProcessEnv = { HOME: homeDir, PATH: String(input.PATH ?? '') };
  for (const [key, value] of Object.entries(input)) {
    if (allow.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

export function resolveCanonicalExecutable(
  spec: ProbeSpec,
  sources: CanonicalAgentSourceSettings,
  env: NodeJS.ProcessEnv,
): { path: string | null; source: AgentSourceStatus['executable']['source'] } {
  if (sources.executable.mode === 'custom') {
    const configured = sources.executable.configured_path;
    return { path: configured && lookupPath(configured, env), source: configured ? 'custom' : 'not_found' };
  }
  return resolveBinary(spec, env);
}

export function resolveCanonicalAgentExecutable(
  id: CanonicalAgentId,
  sources: CanonicalAgentSourceSettings,
  options: Pick<AgentDetectionOptions, 'homeDir' | 'env' | 'appBundleCandidates'> = {},
): { path: string | null; source: AgentSourceStatus['executable']['source'] } {
  const homeDir = options.homeDir ?? homedir();
  const env = buildSafeChildEnv(
    { ...process.env, ...options.env, PATH: `${join(homeDir, '.local', 'bin')}${delimiter}${options.env?.PATH ?? process.env.PATH ?? ''}` },
    homeDir,
  );
  const spec = probeSpecs(homeDir, options.appBundleCandidates).find((item) => item.id === id);
  if (!spec) return { path: null, source: 'not_found' };
  return resolveCanonicalExecutable(spec, sources, env);
}

function dataRootDefaults(id: CanonicalAgentId, homeDir: string): string[] {
  if (id === 'claude-code') return [join(homeDir, '.claude')];
  if (id === 'codex-cli') return [join(homeDir, '.codex')];
  return [join(homeDir, '.gemini', 'antigravity-cli')];
}

function readableDirectory(path: string): boolean {
  try { accessSync(path, constants.R_OK); return statSync(path).isDirectory(); } catch { return false; }
}

export function resolveCanonicalActivityDataRoots(id: CanonicalAgentId, sources: CanonicalAgentSourceSettings, homeDir = homedir()): string[] {
  const defaults = dataRootDefaults(id, homeDir);
  const roots = sources.activity_logs.mode === 'auto' ? defaults
    : sources.activity_logs.mode === 'custom' ? sources.activity_logs.configured_data_roots
    : [...defaults, ...sources.activity_logs.configured_data_roots];
  const seen = new Set<string>();
  return roots.filter((path) => {
    let key = path;
    try { key = realpathSync(path); } catch {}
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceStatusForRoots(
  id: CanonicalAgentId,
  sources: CanonicalAgentSourceSettings,
  homeDir: string,
  projects: Array<{ id: number; root_path: string }> = [],
): AgentSourceStatus['activity_logs'] {
  const defaults = dataRootDefaults(id, homeDir);
  const roots = sources.activity_logs.mode === 'auto' ? defaults.map((path) => ({ path, source: 'default' as const }))
    : sources.activity_logs.mode === 'custom' ? sources.activity_logs.configured_data_roots.map((path) => ({ path, source: 'custom' as const }))
    : [...defaults.map((path) => ({ path, source: 'default' as const })), ...sources.activity_logs.configured_data_roots.map((path) => ({ path, source: 'custom' as const }))];
  const seen = new Set<string>();
  const resolved = roots.filter(({ path }) => { let key = path; try { key = realpathSync(path); } catch {} if (seen.has(key)) return false; seen.add(key); return true; }).map(({ path, source }) => {
    const exists = existsSync(path); const readable = exists && readableDirectory(path);
    return { path, source, exists, readable, real_path: exists ? (() => { try { return realpathSync(path); } catch { return null; } })() : null, warning: !exists ? '資料夾不存在。' : !readable ? '資料夾無法讀取。' : null };
  });
  const plainRoles = id === 'codex-cli' ? [['codex_sessions', 'sessions'], ['codex_archived_sessions', 'archived_sessions']] as const : id === 'antigravity-cli' ? [['antigravity_log', 'log'], ['antigravity_brain', 'brain']] as const : [];
  const derived_scan_locations = id === 'claude-code'
    ? resolved.flatMap((root) => projects.flatMap((project) => claudeProjectEncodingVariants(project.root_path).map(({ name, variant }) => {
      const path = join(root.path, 'projects', name); const exists = existsSync(path); const readable = exists && readableDirectory(path);
      return { data_root: root.path, role: 'claude_projects' as const, path, project_id: project.id, project_root: project.root_path, encoding_variant: variant, exists, readable, warning: !exists ? '掃描位置不存在。' : !readable ? '掃描位置無法讀取。' : null };
    })))
    : resolved.flatMap((root) => plainRoles.map(([role, leaf]) => {
    const path = join(root.path, leaf); const exists = existsSync(path); const readable = exists && readableDirectory(path);
    return { data_root: root.path, role, path, project_id: null, project_root: null, encoding_variant: null, exists, readable, warning: !exists ? '掃描位置不存在。' : !readable ? '掃描位置無法讀取。' : null };
  }));
  return { mode: sources.activity_logs.mode, configured_data_roots: sources.activity_logs.configured_data_roots, resolved_data_roots: resolved, derived_scan_locations };
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

function probeSpecs(homeDir: string, appBundleCandidates: Partial<Record<CanonicalAgentId, string[]>> = {}): ProbeSpec[] {
  return [
    {
      id: 'claude-code',
      envNames: ['DEVDIARY_CLAUDE_BIN', 'CLAUDE_CODE_BIN'],
      candidates: [
        ...(appBundleCandidates['claude-code'] ?? []),
        '/Applications/Claude.app/Contents/MacOS/claude',
        'claude',
      ],
      args: ['--version'],
    },
    {
      id: 'codex-cli',
      envNames: ['DEVDIARY_CODEX_BIN', 'CODEX_CLI_PATH'],
      candidates: [
        ...(appBundleCandidates['codex-cli'] ?? []),
        '/Applications/Codex.app/Contents/Resources/codex',
        '/Applications/ChatGPT.app/Contents/Resources/codex',
        'codex',
      ],
      args: ['--version'],
    },
    {
      id: 'antigravity-cli',
      envNames: ['DEVDIARY_ANTIGRAVITY_BIN', 'AGY_CLI_PATH'],
      candidates: [...(appBundleCandidates['antigravity-cli'] ?? []), join(homeDir, '.local', 'bin', 'agy'), 'agy'],
      args: ['--help'],
    },
  ];
}

export async function detectCliAgents(options: AgentDetectionOptions = {}): Promise<AgentDetectionSnapshot> {
  const homeDir = options.homeDir ?? homedir();
  const env = buildSafeChildEnv({ ...process.env, ...options.env, PATH: `${join(homeDir, '.local', 'bin')}${delimiter}${options.env?.PATH ?? process.env.PATH ?? ''}` }, homeDir);
  const execFileImpl = options.execFileImpl ?? defaultExecFile;
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const cwd = join(homeDir, '.cache');
  mkdirSync(cwd, { recursive: true });

  const agents = await Promise.all(
    probeSpecs(homeDir, options.appBundleCandidates).map(async (spec): Promise<AgentDetectionResult> => {
      const sources = options.sourceSettings?.[spec.id] ?? defaultCanonicalAgentSources();
      const resolution = resolveCanonicalExecutable(spec, sources, env);
      const binary = resolution.path;
      const activity_logs = sourceStatusForRoots(spec.id, sources, homeDir, options.projects);
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
          source_status: { executable: { mode: sources.executable.mode, configured_path: sources.executable.configured_path, resolved_path: null, source: resolution.source, exists: false, is_executable: false, probe_status: 'not_found', checked_at: checkedAt, error_message: 'CLI binary not found.' }, activity_logs },
        };
      }
      const beforeProbe = readExecutableIdentity(binary);
      if (!beforeProbe) {
        return {
          id: spec.id,
          display_name: CANONICAL_AGENTS[spec.id].display_name,
          available: false,
          status: 'offline',
          binary_path: binary,
          version: null,
          checked_at: checkedAt,
          error_message: 'CLI executable is not a regular executable file.',
          source_status: { executable: { mode: sources.executable.mode, configured_path: sources.executable.configured_path, resolved_path: binary, source: resolution.source, exists: true, is_executable: false, probe_status: 'failed', checked_at: checkedAt, error_message: 'CLI executable is not a regular executable file.' }, activity_logs },
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
        if (!sameExecutableIdentity(beforeProbe, readExecutableIdentity(binary))) {
          return {
            id: spec.id,
            display_name: CANONICAL_AGENTS[spec.id].display_name,
            available: false,
            status: 'offline',
            binary_path: beforeProbe.realPath,
            version: null,
            checked_at: checkedAt,
            error_message: 'CLI executable changed during probe.',
            source_status: { executable: { mode: sources.executable.mode, configured_path: sources.executable.configured_path, resolved_path: beforeProbe.realPath, source: resolution.source, exists: true, is_executable: false, probe_status: 'failed', checked_at: checkedAt, error_message: 'CLI executable changed during probe.' }, activity_logs },
          };
        }
        return {
          id: spec.id,
          display_name: CANONICAL_AGENTS[spec.id].display_name,
          available: true,
          status: 'connected',
          binary_path: beforeProbe.realPath,
          version: firstMeaningfulLine(`${result.stdout}\n${result.stderr}`) ?? 'Installed',
          checked_at: checkedAt,
          error_message: null,
          source_status: { executable: { mode: sources.executable.mode, configured_path: sources.executable.configured_path, resolved_path: beforeProbe.realPath, source: resolution.source, exists: true, is_executable: true, probe_status: 'connected', checked_at: checkedAt, error_message: null }, activity_logs },
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
          source_status: { executable: { mode: sources.executable.mode, configured_path: sources.executable.configured_path, resolved_path: binary, source: resolution.source, exists: true, is_executable: true, probe_status: 'failed', checked_at: checkedAt, error_message: sanitizeFailure(err) }, activity_logs },
        };
      }
    }),
  );

  return { checked_at: checkedAt, agents };
}
