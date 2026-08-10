import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const coreDir = path.join(repoRoot, 'core');

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) return null;
    values.set(key, value);
  }
  const revision = values.get('--revision');
  const output = values.get('--output');
  if (values.size !== 2 || !revision || !/^[0-9a-f]{40,64}$/.test(revision) || !output || !path.isAbsolute(output)) {
    return null;
  }
  return { revision, output };
}

function usage() {
  process.stderr.write('Usage: node scripts/smoke-local-runtime.mjs --revision <40-64 lowercase hex> --output <absolute JSON path>\n');
}

function commandOutput(command, commandArgs) {
  return execFileSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function verifyRevisionBinding(revision) {
  if (revision.length === 64) {
    const digestScript = path.join(scriptDir, 'verification-candidate-digest.sh');
    if (commandOutput('bash', [digestScript, repoRoot]) !== revision) {
      throw new Error('Revision does not match the loaded worktree candidate.');
    }
    return;
  }

  const head = commandOutput('git', ['-C', repoRoot, 'rev-parse', 'HEAD']);
  const status = commandOutput('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=all']);
  if (head !== revision || status !== '') {
    throw new Error('Revision does not match a clean loaded worktree HEAD.');
  }
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function loadCoreModules() {
  const corePackage = pathToFileURL(path.join(coreDir, 'package.json'));
  const coreBase = pathToFileURL(`${coreDir}${path.sep}`);
  const requireFromCore = createRequire(corePackage);
  const tsxApiPath = requireFromCore.resolve('tsx/esm/api');
  const { tsImport } = await import(pathToFileURL(tsxApiPath).href);
  const dbModule = await tsImport('./src/db/index.ts', coreBase.href);
  const seedModule = await tsImport('./src/db/seed.ts', coreBase.href);
  const serverModule = await tsImport('./src/server.ts', coreBase.href);
  return { openDb: dbModule.openDb, seedDatabase: seedModule.seedDatabase, createServer: serverModule.createServer };
}

async function forbidden(response) {
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await response.json(), {
    error: 'forbidden_origin',
    message: 'Browser origin is not trusted for this local service.',
  });
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
  usage();
  process.exitCode = 64;
} else {
  try {
    verifyRevisionBinding(args.revision);
  } catch {
    process.stderr.write('Revision verification failed for the loaded worktree.\n');
    process.exitCode = 65;
    process.exit();
  }
  const scenarios = [];
  const effects = { scan_calls: 0, scheduler_calls: 0 };
  const evidence = {
    revision: args.revision,
    status: 'FAIL',
    generated_at: new Date().toISOString(),
    runtime: { host: '127.0.0.1', port: null, database: ':memory:', providers: 'mocked' },
    effects,
    scenarios,
  };
  let db;
  let server;
  try {
    const { openDb, seedDatabase, createServer } = await loadCoreModules();
    db = openDb(':memory:');
    seedDatabase(db, { today: '2026-07-01', days: 1, seed: 17 });
    db.exec('DELETE FROM sessions; DELETE FROM token_usage;');
    db.prepare(
      `INSERT INTO sessions
       (project_id, agent_name, model, start_time, end_time, token_total, source_log_ref, status)
       VALUES (1, 'codex-cli', 'gpt-5-codex', ?, ?, 123, 'synthetic://taipei-boundary', 'completed')`,
    ).run('2026-06-30T17:30:00.000Z', '2026-06-30T17:45:00.000Z');

    const dailyScheduler = {
      getStatus: () => ({
        enabled: false, run_time_local: '01:00', timezone: 'Asia/Taipei', running: false,
        last_run_date: null, last_run_at: null, last_status: 'idle', last_error: null, last_project_count: 0,
      }),
      runNow: async () => {
        effects.scheduler_calls += 1;
        return { status: 'success', date: '2026-07-01', message: 'mocked', project_count: 0 };
      },
    };
    const scanProvider = {
      scanProject: () => {
        effects.scan_calls += 1;
        return { sessions: [], kanban_cards: [], daily_summary: null, warnings: [] };
      },
    };
    const app = createServer(db, {
      dbPath: ':memory:',
      projectRoots: [],
      dailyScheduler,
      scanProvider,
      agentDetector: async () => ({ agents: [] }),
      additionalBrowserOrigins: ['http://localhost:5180', 'http://127.0.0.1:5180'],
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('dynamic loopback listener did not expose a port');
    evidence.runtime.port = address.port;
    const base = `http://127.0.0.1:${address.port}`;

    const settingsBefore = db.prepare('SELECT key, value FROM app_settings ORDER BY key').all();
    await forbidden(await fetch(`${base}/api/health`, { headers: { origin: 'https://attacker.example' } }));
    await forbidden(await fetch(`${base}/api/settings`, { method: 'OPTIONS', headers: { origin: 'https://attacker.example' } }));
    await forbidden(await fetch(`${base}/api/settings`, {
      method: 'PATCH', headers: { origin: 'null', 'content-type': 'application/json' }, body: '{ malformed',
    }));
    await forbidden(await fetch(`${base}/api/scheduler/daily/run`, {
      method: 'POST', headers: { origin: 'https://attacker.example' },
    }));
    await forbidden(await fetch(`${base}/api/scan`, {
      method: 'POST', headers: { origin: 'https://attacker.example' },
    }));
    assert.equal(effects.scan_calls, 0);
    assert.equal(effects.scheduler_calls, 0);
    assert.deepEqual(db.prepare('SELECT key, value FROM app_settings ORDER BY key').all(), settingsBefore);
    scenarios.push({ name: 'hostile_origin_denied_before_effects', status: 'PASS' });

    const trustedHealth = await fetch(`${base}/api/health`, { headers: { origin: 'http://localhost:5180' } });
    assert.equal(trustedHealth.status, 200);
    assert.equal(trustedHealth.headers.get('access-control-allow-origin'), 'http://localhost:5180');
    const trustedPreflight = await fetch(`${base}/api/settings`, {
      method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5180' },
    });
    assert.equal(trustedPreflight.status, 204);
    assert.equal(trustedPreflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5180');
    scenarios.push({ name: 'exact_worktree_origins_allowed', status: 'PASS' });

    const cliHealth = await fetch(`${base}/api/health`);
    const cliSettings = await fetch(`${base}/api/settings`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appearance: 'dark' }),
    });
    assert.equal(cliHealth.status, 200);
    assert.equal(cliSettings.status, 200);
    assert.equal(cliHealth.headers.get('access-control-allow-origin'), null);
    await forbidden(await fetch(`${base}/api/health`, { headers: { 'sec-fetch-site': 'cross-site' } }));
    scenarios.push({ name: 'native_compatibility_and_cross_site_metadata', status: 'PASS' });

    const dashboard = await fetch(`${base}/api/dashboard?range=custom&start=2026-07-01&end=2026-07-01`);
    assert.equal(dashboard.status, 200);
    const dashboardBody = await dashboard.json();
    assert.equal(dashboardBody.metric.session_count, 1);
    assert.equal(dashboardBody.metric.token_total, 123);
    const dailyExport = await fetch(`${base}/api/exports/daily?date=2026-07-01`);
    assert.equal(dailyExport.status, 200);
    const exportBody = await dailyExport.text();
    assert.match(exportBody, /- Total tokens: 123/);
    assert.match(exportBody, /- Sessions: 1/);
    assert.match(exportBody, /2026-06-30T17:30:00\.000Z/);
    scenarios.push({ name: 'taipei_boundary_dashboard_and_export', status: 'PASS' });

    evidence.status = 'PASS';
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    try {
      await closeServer(server);
    } catch (error) {
      evidence.status = 'FAIL';
      evidence.failure = error instanceof Error ? error.message : String(error);
      process.exitCode = 1;
    }
    if (db) db.close();
    await mkdir(path.dirname(args.output), { recursive: true });
    await writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${evidence.status}: isolated local runtime smoke (${args.revision})\n`);
  }
}
