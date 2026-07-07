import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_APP_DATA_FOLDER = 'DevDiary';
export const DEFAULT_DB_FILENAME = 'DevDiary.sqlite';
export const LOCAL_DEV_PROJECT_ROOTS = ['/path/to/your/projects', '/path/to/another/project'];

export interface RuntimeConfigEnv {
  DEVDIARY_DB?: string;
  DEVDIARY_PROJECT_ROOTS?: string;
}

export interface RuntimeConfigOptions {
  homeDir?: string;
}

export interface RuntimeConfig {
  dbPath: string;
  projectRoots: string[];
}

export function defaultAppDataDir(homeDir = homedir()): string {
  return join(homeDir, 'Library', 'Application Support', DEFAULT_APP_DATA_FOLDER);
}

export function defaultDbPath(homeDir = homedir()): string {
  return join(defaultAppDataDir(homeDir), DEFAULT_DB_FILENAME);
}

export function parseProjectRoots(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(':')
    .map((root) => root.trim())
    .filter(Boolean);
}

export function resolveRuntimeConfig(
  env: RuntimeConfigEnv = process.env,
  options: RuntimeConfigOptions = {},
): RuntimeConfig {
  const dbPath = env.DEVDIARY_DB?.trim() || defaultDbPath(options.homeDir);
  const configuredRoots = parseProjectRoots(env.DEVDIARY_PROJECT_ROOTS);
  const projectRoots = configuredRoots.length > 0 ? configuredRoots : dbPath === ':memory:' ? LOCAL_DEV_PROJECT_ROOTS : [];

  return { dbPath, projectRoots };
}
