import { openDb } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { resolveRuntimeConfig } from './runtimeConfig.js';
import { createServer } from './server.js';
import { DailySchedulerRuntime } from './services/dailyScheduler.js';
import { AntigravitySessionGate } from './services/antigravitySession.js';
import { runSchedulerTickWithRecovery } from './services/schedulerRecovery.js';
import { discoverProjectsFromRoots } from './services/projectDiscovery.js';
import { taipeiDate } from './services/taipeiDate.js';
import {
  isRuntimeManifestStale,
  readRuntimeManifest,
  removeRuntimeManifest,
  resolveRuntimeManifestPath,
  writeRuntimeManifest,
} from './services/runtimeManifest.js';
import { listenWithPortFallback } from './services/runtimePort.js';

// Bootstrap the Core Engine for local development.
const HOST = '127.0.0.1';
const REQUESTED_PORT = Number(process.env.DEVDIARY_PORT ?? 4317);
const STARTED_AT = new Date().toISOString();
const runtimeConfig = resolveRuntimeConfig();
const db = openDb(runtimeConfig.dbPath);
const projectRoots = runtimeConfig.projectRoots;
const runtimeIdentity = {
  port: null as number | null,
  startedAt: STARTED_AT,
  pid: process.pid,
};
const settingsRuntime = () => ({
  activeDbPath: runtimeConfig.dbPath,
  projectRoots,
});

// Seed in-memory dev DBs so the API has data without a real scan yet.
if (runtimeConfig.dbPath === ':memory:') {
  seedDatabase(db, { today: taipeiDate() });
  if (projectRoots.length > 0) {
    discoverProjectsFromRoots(db, projectRoots);
  }
}

const dailyScheduler = new DailySchedulerRuntime(db, settingsRuntime, {
  antigravityGate: new AntigravitySessionGate(),
});
const app = createServer(db, {
  dbPath: runtimeConfig.dbPath,
  projectRoots,
  dailyScheduler,
  runtime: runtimeIdentity,
});

const SCHEDULER_INTERVAL_MS = 60_000;
const schedulerRecoveryState = { lastTickAt: null as number | null };
const schedulerTimer = setInterval(() => {
  const tick = runSchedulerTickWithRecovery(dailyScheduler, schedulerRecoveryState, { intervalMs: SCHEDULER_INTERVAL_MS });
  if (tick.recovery) {
    process.stdout.write(`Daily scheduler recovery tick after ${tick.elapsed_ms}ms gap\n`);
  }
  void tick.result;
}, SCHEDULER_INTERVAL_MS);
schedulerTimer.unref?.();

const manifestPath = resolveRuntimeManifestPath();
let manifestReady = false;

function cleanupManifest(): void {
  if (!manifestReady) return;
  removeRuntimeManifest(manifestPath, process.pid);
}

process.on('exit', cleanupManifest);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    cleanupManifest();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

try {
  // Bind to loopback only — must not be a remote network service (spec §6.3).
  const result = await listenWithPortFallback(app, {
    host: HOST,
    preferredPort: REQUESTED_PORT,
    maxAttempts: 20,
  });
  runtimeIdentity.port = result.port;
  // Inspect any leftover manifest before claiming it, so a crashed previous Core
  // does not strand dev clients on a dead port.
  const existingManifest = readRuntimeManifest(manifestPath);
  if (existingManifest) {
    const ownerPid = existingManifest.runtime?.pid ?? 'unknown';
    if (isRuntimeManifestStale(existingManifest)) {
      process.stdout.write(`Reclaiming stale Core runtime manifest (pid ${ownerPid} not alive)\n`);
    } else if (existingManifest.runtime?.pid !== process.pid) {
      process.stderr.write(`Warning: overwriting runtime manifest owned by live Core pid ${ownerPid}\n`);
    }
  }
  writeRuntimeManifest({
    path: manifestPath,
    host: HOST,
    port: result.port,
    pid: process.pid,
    startedAt: STARTED_AT,
  });
  manifestReady = true;
  const note = result.fallbackUsed ? `; requested port ${REQUESTED_PORT} was busy` : '';
  process.stdout.write(`DevDiary Core API listening on http://${HOST}:${result.port} (db=${runtimeConfig.dbPath}${note})\n`);
  const tick = runSchedulerTickWithRecovery(dailyScheduler, schedulerRecoveryState, { intervalMs: SCHEDULER_INTERVAL_MS });
  void tick.result;
} catch (err) {
  process.stderr.write(`DevDiary Core API failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
