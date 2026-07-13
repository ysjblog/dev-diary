import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDb } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { defaultAppDataDir, resolveRuntimeConfig } from './runtimeConfig.js';
import { backgroundStartupDelayMs, formatBackgroundCycleLog, runBackgroundCycle } from './services/backgroundRunner.js';
import { AntigravitySessionGate } from './services/antigravitySession.js';
import { getSettings, updateSettings, type SettingsRuntimeDefaults } from './services/settings.js';
import type { DB } from './db/index.js';

type Mode = 'run' | 'once';

interface CliOptions {
  mode: Mode;
  seedIfEmpty: boolean;
  enableForSmoke: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const [modeArg = 'run', ...rest] = argv;
  const mode = modeArg === 'once' ? 'once' : 'run';
  return {
    mode,
    seedIfEmpty: rest.includes('--seed-if-empty'),
    enableForSmoke: rest.includes('--enable-for-smoke'),
  };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(appDir: string): () => void {
  mkdirSync(appDir, { recursive: true });
  const lockDir = join(appDir, 'background-runner.lock');
  const pidPath = join(lockDir, 'pid');
  try {
    mkdirSync(lockDir);
  } catch {
    const existingPid = Number(readFileSync(pidPath, 'utf8').trim());
    if (Number.isFinite(existingPid) && existingPid > 0 && isPidAlive(existingPid)) {
      throw new Error(`DevDiary background runner is already running with pid ${existingPid}`);
    }
    rmSync(lockDir, { recursive: true, force: true });
    mkdirSync(lockDir);
  }
  writeFileSync(pidPath, String(process.pid));
  return () => rmSync(lockDir, { recursive: true, force: true });
}

export function sleepUntilNextBackgroundCycle(ms: number, isStopping: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(poll);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const poll = setInterval(() => {
      if (!isStopping()) return;
      finish();
    }, 250);
  });
}

export async function waitForNextBackgroundDue(
  db: DB,
  runtime: () => SettingsRuntimeDefaults,
  isStopping: () => boolean,
  now: () => number = Date.now,
): Promise<void> {
  while (!isStopping()) {
    const state = getSettings(db, runtime()).background_scan;
    const due = state.next_due_at ? Date.parse(state.next_due_at) : now();
    const waitMs = Number.isFinite(due) ? Math.max(0, due - now()) : 0;
    if (waitMs <= 0) return;
    await sleepUntilNextBackgroundCycle(Math.min(30_000, waitMs), isStopping);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runtimeConfig = resolveRuntimeConfig();
  const appDir = defaultAppDataDir();
  const releaseLock = acquireLock(appDir);
  const db = openDb(runtimeConfig.dbPath);
  const runtime = () => ({
    activeDbPath: runtimeConfig.dbPath,
    projectRoots: runtimeConfig.projectRoots,
  });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      stopping = true;
    });
  }

  try {
    if (options.seedIfEmpty) {
      const projectCount = (db.prepare(`SELECT COUNT(*) AS c FROM projects`).get() as { c: number }).c;
      if (projectCount === 0) {
        seedDatabase(db, { today: new Date().toISOString().slice(0, 10) });
      }
    }
    if (options.enableForSmoke) {
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '00:00' }, scan_interval_minutes: 5 }, runtime());
    }
    // 單一長生命週期的斷路器,在多輪 cycle 之間共用 cooldown:agy session 失效後
    // 不會每輪重複 probe / 彈登入視窗。
    const antigravityGate = new AntigravitySessionGate();
    if (options.mode === 'run') {
      await sleepUntilNextBackgroundCycle(backgroundStartupDelayMs(), () => stopping);
      // A manual scan may have completed while the runner was waiting to
      // start. Re-read the persisted due time before the first cycle too.
      await waitForNextBackgroundDue(db, runtime, () => stopping);
    }
    do {
      const result = await runBackgroundCycle(db, runtime, { antigravityGate });
      process.stdout.write(`${formatBackgroundCycleLog(result)}\n`);
      if (options.mode === 'once') {
        process.exitCode = result.status === 'failed' ? 1 : 0;
        break;
      }
      await waitForNextBackgroundDue(db, runtime, () => stopping);
    } while (!stopping);
  } finally {
    db.close();
    releaseLock();
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryUrl) {
  main().catch((err) => {
    const appDir = defaultAppDataDir();
    mkdirSync(appDir, { recursive: true });
    const message = err instanceof Error ? err.message : String(err);
    writeFileSync(join(appDir, 'background-runner.last-error.log'), `${new Date().toISOString()} ${message}\n`);
    process.stderr.write(`DevDiary background runner failed: ${message}\n`);
    process.exit(1);
  });
}
