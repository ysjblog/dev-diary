import { accessSync, constants, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openBackgroundDb } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { defaultAppDataDir, resolveRuntimeConfig } from './runtimeConfig.js';
import { backgroundStartupDelayMs, formatBackgroundCycleLog, runBackgroundCycle } from './services/backgroundRunner.js';
import { AntigravitySessionGate } from './services/antigravitySession.js';
import { CODEX_DESKTOP_RESUME_TICK_MS, createCodexCliResumeDispatcher, createCodexDesktopResumeEngine } from './services/codexDesktopResumeEngine.js';
import { createCodexDesktopWakeDispatcher } from './services/codexDesktopWake.js';
import { createCodexResumeObserver } from './services/codexResumeObservation.js';
import { resolveCanonicalActivityDataRoots } from './services/agentDetection.js';
import { getSettings, updateSettings, type SettingsRuntimeDefaults } from './services/settings.js';
import type { DB } from './db/index.js';
import { taipeiDate } from './services/taipeiDate.js';
import { assertBackgroundRuntimeManifestCompatibleBeforeDb, resolveRuntimeManifestPath } from './services/runtimeManifest.js';

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

export function resolveCodexDesktopCliPath(
  configured: string | null | undefined,
  desktopBundled = '/Applications/ChatGPT.app/Contents/Resources/codex',
  fallbacks = ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'],
): string | undefined {
  const candidates = [desktopBundled, configured, ...fallbacks].filter((value): value is string => Boolean(value));
  return candidates.find((value) => {
    try { accessSync(value, constants.X_OK); return statSync(value).isFile(); } catch { return false; }
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
  assertBackgroundRuntimeManifestCompatibleBeforeDb(resolveRuntimeManifestPath());
  const releaseLock = acquireLock(appDir);
  let db: DB;
  try {
    db = openBackgroundDb(runtimeConfig.dbPath);
  } catch (error) {
    releaseLock();
    throw error;
  }
  const runtime = () => ({
    activeDbPath: runtimeConfig.dbPath,
    projectRoots: runtimeConfig.projectRoots,
  });
  const codexRoots = () => {
    const agent = getSettings(db, runtime()).agents.find((item) => item.id === 'codex-cli');
    return agent ? resolveCanonicalActivityDataRoots('codex-cli', agent.sources) : [];
  };
  const codexDispatcher = async (threadId: string, context: { codexHome: string }) => {
    const settings = getSettings(db, runtime());
    const configured = settings.agents.find((item) => item.id === 'codex-cli')?.sources.executable.configured_path;
    // Desktop sessions must be resumed by the CLI shipped with the running
    // Desktop app when available. A user-configured standalone CLI can lag the
    // Desktop session format even when both installations share login state.
    const binary = resolveCodexDesktopCliPath(configured);
    return binary ? createCodexDesktopWakeDispatcher(createCodexCliResumeDispatcher(binary))(threadId, context) : { accepted: false, code: 'codex_cli_not_found' };
  };
  const codexObservation = createCodexResumeObserver({
    directory: join(appDir, 'codex-resume-diagnostics'),
    resolveSource: (digest) => {
      const row = db.prepare('SELECT thread_id,session_locator FROM codex_desktop_resume_targets WHERE target_key_digest=?')
        .get(digest) as { thread_id: string; session_locator: string } | undefined;
      const match = row && /^r([0-9]+)\/(.+)$/.exec(row.session_locator);
      const root = match ? codexRoots()[Number(match[1])] : undefined;
      return row && match && root ? { root, locator: match[2]!, threadId: row.thread_id } : null;
    },
  });
  const codexDesktopResume = createCodexDesktopResumeEngine(db, codexRoots, codexObservation.wrap(codexDispatcher));
  let resumeTickRunning = false;
  let resumeTimer: NodeJS.Timeout | null = null;
  const runResumeTick = async (): Promise<void> => {
    if (resumeTickRunning) return;
    resumeTickRunning = true;
    try {
      try { codexObservation.tick(); } catch {
        process.stderr.write('DevDiary resume observation tick failed; continuation behavior unchanged.\n');
      }
      await codexDesktopResume.tick();
    } catch {
      // A lightweight companion tick must never terminate the full background runner.
    } finally {
      resumeTickRunning = false;
    }
  };
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
        seedDatabase(db, { today: taipeiDate() });
      }
    }
    if (options.enableForSmoke) {
      updateSettings(db, { daily_scheduler: { enabled: true, run_time_local: '00:00' }, scan_interval_minutes: 5 }, runtime());
    }
    // 單一長生命週期的斷路器,在多輪 cycle 之間共用 cooldown:agy session 失效後
    // 不會每輪重複 probe / 彈登入視窗。
    const antigravityGate = new AntigravitySessionGate();
    await runResumeTick();
    if (options.mode === 'run') {
      resumeTimer = setInterval(() => { void runResumeTick(); }, CODEX_DESKTOP_RESUME_TICK_MS);
      resumeTimer.unref?.();
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
    if (resumeTimer) clearInterval(resumeTimer);
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
