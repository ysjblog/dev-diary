import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { symlinkSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import { discoverProjectsFromRoots } from '../src/services/projectDiscovery.js';
import { reconcileMissingProjects } from '../src/services/projectDiscovery.js';
import { createCliLogScanProvider, escapeClaudeProjectPath } from '../src/services/cliLogParser.js';
import { createConfiguredScanProvider, runManualScan, type ScanProvider } from '../src/services/scans.js';
import { getProjectList } from '../src/services/projects.js';
import { DailySchedulerRuntime } from '../src/services/dailyScheduler.js';

const TODAY = '2026-06-28';
const roots: string[] = [];

function mockScanProvider(): ScanProvider {
  return createConfiguredScanProvider({ DEVDIARY_SCAN_PROVIDER: 'mock' });
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-project-discovery-'));
  roots.push(root);
  return root;
}

function freshDb(): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 7, seed: 1337 });
  return db;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(root: string, name: string): string {
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  writeFileSync(join(repo, 'README.md'), `# ${name}\n`);
  git(repo, ['add', 'README.md']);
  git(repo, ['-c', 'user.name=DevDiary Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Initial commit']);
  return repo;
}

function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n'));
}

function writeClaudeFixture(homeDir: string, projectRoot: string): void {
  const dir = join(homeDir, '.claude', 'projects', escapeClaudeProjectPath(projectRoot));
  writeJsonl(join(dir, 'session.jsonl'), [
    {
      type: 'assistant',
      timestamp: `${TODAY}T09:00:00.000Z`,
      cwd: projectRoot,
      sessionId: 'discovered-session',
      message: {
        model: 'claude-opus-4-1',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  ]);
}

function projectCount(db: DB, rootPath: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE root_path = ?`).get(rootPath) as { c: number }).c;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Project root discovery', () => {
  it('requires two distinct due observations, preserves all history, excludes work and restores the same id', async () => {
    const db = freshDb();
    const root = tempRoot();
    const repo = initRepo(root, 'Gone Later');
    discoverProjectsFromRoots(db, [root], { now: '2026-06-01T00:00:00.000Z' });
    const id = (db.prepare(`SELECT id FROM projects WHERE root_path = ?`).get(repo) as { id: number }).id;
    db.prepare(`INSERT INTO sessions (project_id, agent_name, model, start_time, source_log_ref) VALUES (?, 'codex-cli', 'test', ?, ?)`).run(id, '2026-06-01T01:00:00.000Z', `history-${id}`);
    db.prepare(`INSERT INTO project_daily_diaries (project_id, date, markdown, status, created_at, updated_at) VALUES (?, '2026-06-01', 'history', 'confirmed', ?, ?)`).run(id, '2026-06-01T02:00:00.000Z', '2026-06-01T02:00:00.000Z');
    db.prepare(`INSERT INTO project_summaries (project_id, markdown_user, user_updated_at) VALUES (?, 'history', ?)`).run(id, '2026-06-01T02:00:00.000Z');
    db.prepare(`INSERT INTO kanban_cards (project_id, title, status, created_at, updated_at) VALUES (?, 'history', 'todo', ?, ?)`).run(id, '2026-06-01T02:00:00.000Z', '2026-06-01T02:00:00.000Z');
    db.prepare(`INSERT INTO comments (project_id, content, created_at, updated_at) VALUES (?, 'history', ?, ?)`).run(id, '2026-06-01T02:00:00.000Z', '2026-06-01T02:00:00.000Z');
    db.prepare(`INSERT INTO project_docs (project_id, name, content, updated_at) VALUES (?, 'history.md', 'history', ?)`).run(id, '2026-06-01T02:00:00.000Z');
    const historyCounts = () => Object.fromEntries(['sessions', 'project_daily_diaries', 'project_summaries', 'kanban_cards', 'comments', 'project_docs'].map((table) => [
      table,
      (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ?`).get(id) as { count: number }).count,
    ]));
    const beforeHistory = historyCounts();
    rmSync(repo, { recursive: true, force: true });

    expect(reconcileMissingProjects(db, [root], { now: '2026-06-08T00:00:00.000Z' }).marked_missing).toBe(0);
    expect(reconcileMissingProjects(db, [root], { now: '2026-06-08T00:01:00.000Z' }).skipped).toBe(true);
    expect(reconcileMissingProjects(db, [root], { now: '2026-06-15T00:00:00.000Z' }).marked_missing).toBe(1);
    expect(db.prepare(`SELECT presence_status FROM projects WHERE id = ?`).get(id)).toEqual({ presence_status: 'missing' });
    expect(getProjectList(db, '2026-06-15').some((project) => project.id === id)).toBe(false);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM projects WHERE id = ?`).get(id)).toEqual({ count: 1 });
    expect(historyCounts()).toEqual(beforeHistory);
    const scannedIds: number[] = [];
    const scan = runManualScan(db, {
      scope: 'global', today: '2026-06-15',
      provider: { scanProject(project) { scannedIds.push(project.id); return { sessions: [], kanban_cards: [], daily_summary: null }; } },
    });
    expect(scan.skipped_projects).toContainEqual({ project_id: id, reason: 'missing' });
    expect(scannedIds).not.toContain(id);
    const generatedIds: number[] = [];
    const scheduler = new DailySchedulerRuntime(db, () => ({ activeDbPath: ':memory:', projectRoots: [root] }), {
      projectSummaryAgent: async (snapshot) => {
        generatedIds.push(snapshot.project.id);
        return { markdown: '## test', agent_id: 'custom-test', fallback_report: null };
      },
      globalSummaryAgent: null,
      kanbanAiGenerator: null,
    });
    expect((await scheduler.runNow({ force: true, now: new Date('2026-06-15T12:00:00.000Z') })).status).toBe('success');
    expect(generatedIds).not.toContain(id);

    initRepo(root, 'Gone Later');
    discoverProjectsFromRoots(db, [root], { now: '2026-06-16T00:00:00.000Z' });
    expect(db.prepare(`SELECT id, presence_status, missing_check_count FROM projects WHERE root_path = ?`).get(repo)).toEqual({ id, presence_status: 'present', missing_check_count: 0 });
    expect(historyCounts()).toEqual(beforeHistory);
  });

  it('does not count a miss when configured-root traversal is partial', () => {
    const db = freshDb();
    const root = tempRoot();
    const repo = initRepo(root, 'Temporarily Gone');
    discoverProjectsFromRoots(db, [root], { now: '2026-06-01T00:00:00.000Z' });
    rmSync(repo, { recursive: true, force: true });
    symlinkSync(join(root, 'not-there'), join(root, 'broken-link'));

    expect(reconcileMissingProjects(db, [root], { now: '2026-06-08T00:00:00.000Z' })).toEqual({
      skipped: true,
      observed: 0,
      marked_missing: 0,
      restored: 0,
    });
    expect(db.prepare(`SELECT missing_check_count FROM projects WHERE root_path = ?`).get(repo)).toEqual({ missing_check_count: 0 });
  });

  it('bounds a stuck configured-root traversal and never turns the timeout into a missing observation', () => {
    const db = freshDb();
    const root = tempRoot();
    const repo = initRepo(root, 'Slow External Project');
    discoverProjectsFromRoots(db, [root], { now: '2026-06-01T00:00:00.000Z' });
    rmSync(repo, { recursive: true, force: true });
    const hangingWorker = join(root, 'hanging-discovery-worker.mjs');
    writeFileSync(hangingWorker, 'setInterval(() => {}, 1_000);\n');

    const startedAt = Date.now();
    const discovery = discoverProjectsFromRoots(db, [root], {
      now: '2026-06-08T00:00:00.000Z',
      workerPath: hangingWorker,
      rootTimeoutMs: 50,
    });
    const reconciliation = reconcileMissingProjects(db, [root], {
      now: '2026-06-08T00:00:00.000Z',
      workerPath: hangingWorker,
      rootTimeoutMs: 50,
    });

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(discovery.incomplete_roots).toEqual([root]);
    expect(reconciliation).toEqual({ skipped: true, observed: 0, marked_missing: 0, restored: 0 });
    expect(db.prepare(`SELECT missing_check_count FROM projects WHERE root_path = ?`).get(repo)).toEqual({ missing_check_count: 0 });
  });

  it('final cadence check lets only one different-date reconciliation update counters across two DB connections', () => {
    const root = tempRoot();
    const dbPath = join(root, 'reconciliation-race.sqlite');
    const firstDb = openDb(dbPath);
    const secondDb = openDb(dbPath);
    const projectsRoot = join(root, 'projects');
    mkdirSync(projectsRoot);
    const repo = initRepo(projectsRoot, 'Gone Across Midnight');
    discoverProjectsFromRoots(firstDb, [projectsRoot], { now: '2026-06-01T00:00:00.000Z' });
    rmSync(repo, { recursive: true, force: true });

    let secondResult: ReturnType<typeof reconcileMissingProjects> | undefined;
    const firstResult = reconcileMissingProjects(firstDb, [projectsRoot], {
      now: '2026-06-08T23:59:59.000Z',
      beforeFinalize: () => {
        secondResult = reconcileMissingProjects(secondDb, [projectsRoot], { now: '2026-06-09T00:00:01.000Z' });
      },
    });

    expect(secondResult).toEqual({ skipped: false, observed: 1, marked_missing: 0, restored: 0 });
    expect(firstResult).toEqual({ skipped: true, observed: 0, marked_missing: 0, restored: 0 });
    expect(firstDb.prepare(`SELECT missing_check_count, presence_status FROM projects WHERE root_path = ?`).get(repo)).toEqual({
      missing_check_count: 1, presence_status: 'present',
    });
    expect(firstDb.prepare(`SELECT period_start, status FROM project_reconciliation_runs ORDER BY period_start`).all()).toEqual([
      { period_start: '2026-06-08', status: 'failed' },
      { period_start: '2026-06-09', status: 'success' },
    ]);
    secondDb.close();
    firstDb.close();
  });

  it('從 configured roots upsert git/project folders 並且 repeated discovery 不新增 duplicate', () => {
    const db = freshDb();
    const root = tempRoot();
    const repo = initRepo(root, 'Side App');
    const plain = join(root, 'Plain App');
    mkdirSync(plain, { recursive: true });
    writeFileSync(join(plain, 'package.json'), '{"name":"plain-app"}\n');

    const first = discoverProjectsFromRoots(db, [root], { now: `${TODAY}T00:00:00.000Z` });
    const second = discoverProjectsFromRoots(db, [root], { now: `${TODAY}T00:00:00.000Z` });

    expect(first.discovered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ root_path: repo, name: 'Side App', git_repo_detected: true }),
        expect.objectContaining({ root_path: plain, name: 'Plain App', git_repo_detected: false }),
      ]),
    );
    expect(second.inserted).toBe(0);
    expect(projectCount(db, repo)).toBe(1);
    expect(projectCount(db, plain)).toBe(1);
  });

  it('忽略 hidden/vendor folders 並維持 project folder read-only', () => {
    const db = freshDb();
    const root = tempRoot();
    const repo = initRepo(root, 'Real Repo');
    mkdirSync(join(root, '.hidden', '.git'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'pkg', 'package.json'), '{"name":"vendor"}\n');

    const beforeFiles = readdirSync(repo).sort();
    const beforeHead = readFileSync(join(repo, '.git', 'HEAD'), 'utf8');
    const beforeStatus = git(repo, ['status', '--porcelain=v1']);

    const result = discoverProjectsFromRoots(db, [root], { now: `${TODAY}T00:00:00.000Z` });

    expect(result.discovered.map((project) => project.root_path)).toContain(repo);
    expect(result.discovered.map((project) => project.root_path)).not.toContain(join(root, '.hidden'));
    expect(result.discovered.map((project) => project.root_path)).not.toContain(join(root, 'node_modules', 'pkg'));
    expect(readdirSync(repo).sort()).toEqual(beforeFiles);
    expect(readFileSync(join(repo, '.git', 'HEAD'), 'utf8')).toBe(beforeHead);
    expect(git(repo, ['status', '--porcelain=v1'])).toBe(beforeStatus);
  });

  it('configured root 本身是 project 時仍探索 nested projects', () => {
    const db = freshDb();
    const root = tempRoot();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, 'package.json'), '{"name":"container"}\n');
    const nested = join(root, 'nested-app');
    mkdirSync(join(nested, 'app', 'public'), { recursive: true });
    writeFileSync(join(nested, 'app', 'public', 'wp-config.php'), '<?php // Local WordPress fixture\n');
    const vendor = join(root, 'node_modules', 'vendor');
    mkdirSync(vendor, { recursive: true });
    writeFileSync(join(vendor, 'package.json'), '{"name":"vendor"}\n');

    const result = discoverProjectsFromRoots(db, [root], { now: `${TODAY}T00:00:00.000Z` });

    expect(result.discovered.map((project) => project.root_path)).toEqual([root, nested]);
  });

  it('global scan 先 discovery 再掃描 eligible discovered projects', () => {
    const db = freshDb();
    const root = tempRoot();
    const homeDir = join(root, 'home');
    const repo = initRepo(root, 'Scanned Repo');
    writeClaudeFixture(homeDir, repo);

    const provider = createCliLogScanProvider({ homeDir });
    const first = runManualScan(db, { scope: 'global', today: TODAY, provider, projectRoots: [root] });
    const second = runManualScan(db, { scope: 'global', today: TODAY, provider, projectRoots: [root] });

    const project = db.prepare(`SELECT id FROM projects WHERE root_path = ?`).get(repo) as { id: number };
    const sessionCount = (
      db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = ? AND source_log_ref = 'claude-code://discovered-session'`).get(project.id) as {
        c: number;
      }
    ).c;

    expect(first.status).toBe('success');
    expect(first.scanned_projects).toContain(project.id);
    expect(first.inserted_sessions).toBe(1);
    expect(second.inserted_sessions).toBe(0);
    expect(sessionCount).toBe(1);
  });

  it('global scan 在已追蹤 root 底下新增的 sibling 資料夾，仍會在下一次掃描被發現加入', () => {
    const db = freshDb();
    const root = tempRoot();
    const homeDir = join(root, 'home');
    const repo = initRepo(root, 'Known Repo');
    const sibling = join(root, 'New Sibling Project');
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, 'README.md'), '# New sibling\n');
    writeClaudeFixture(homeDir, repo);
    db.prepare(`UPDATE projects SET root_path = ? WHERE id = 1`).run(repo);

    const result = runManualScan(db, {
      scope: 'global',
      today: TODAY,
      provider: createCliLogScanProvider({ homeDir }),
      projectRoots: [root],
    });
    const discoveredSibling = db.prepare(`SELECT id FROM projects WHERE root_path = ?`).get(sibling);

    expect(result.status).toBe('success');
    expect(result.scanned_projects).toContain(1);
    expect(result.inserted_sessions).toBe(1);
    expect(discoveredSibling).toBeTruthy();
  });

  it('root 底下已有多個追蹤中的專案時，新增的資料夾仍會在下一次 global scan 被發現，且不會重複 insert 既有專案', () => {
    const db = freshDb();
    const root = tempRoot();
    const projectX = initRepo(root, 'ProjectX');

    const first = runManualScan(db, { scope: 'global', today: TODAY, provider: mockScanProvider(), projectRoots: [root] });
    expect(projectCount(db, projectX)).toBe(1);
    expect(first.status).toBe('success');

    const projectY = initRepo(root, 'ProjectY');
    const second = runManualScan(db, { scope: 'global', today: TODAY, provider: mockScanProvider(), projectRoots: [root] });

    expect(second.status).toBe('success');
    expect(projectCount(db, projectY)).toBe(1);
    expect(projectCount(db, projectX)).toBe(1);

    const third = runManualScan(db, { scope: 'global', today: TODAY, provider: mockScanProvider(), projectRoots: [root] });
    expect(third.status).toBe('success');
    expect(projectCount(db, projectX)).toBe(1);
    expect(projectCount(db, projectY)).toBe(1);
  });

  it('POST /api/scan 回傳 discovered projects 與 refreshed snapshots', async () => {
    const db = freshDb();
    const root = tempRoot();
    const homeDir = join(root, 'home');
    const repo = initRepo(root, 'Api Repo');
    writeClaudeFixture(homeDir, repo);
    const app = createServer(db, { scanProvider: createCliLogScanProvider({ homeDir }), projectRoots: [root] });
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server failed to listen');
      const base = `http://127.0.0.1:${address.port}`;

      const response = await fetch(`${base}/api/scan?range=24h`, { method: 'POST' });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        scan: { status: string; inserted_sessions: number };
        projects: Array<{ root_path: string }>;
      };

      expect(body.scan.status).toBe('success');
      expect(body.scan.inserted_sessions).toBe(1);
      expect(body.projects.map((project) => project.root_path)).toContain(repo);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('persistent SQLite runtime 經過 server restart 後保留 discovered projects 與 sessions', async () => {
    const root = tempRoot();
    const dbPath = join(root, 'Library', 'Application Support', 'DevDiary', 'DevDiary.sqlite');
    const scanRoot = join(root, 'projects');
    const homeDir = join(root, 'home');
    const repo = initRepo(scanRoot, 'Persisted Repo');
    writeClaudeFixture(homeDir, repo);

    let db = openDb(dbPath);
    let app = createServer(db, { scanProvider: createCliLogScanProvider({ homeDir }), projectRoots: [scanRoot] });
    let server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server failed to listen');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/scan?range=all`, { method: 'POST' });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        scan: { status: string; inserted_sessions: number };
        projects: Array<{ id: number; root_path: string }>;
      };

      expect(body.scan.status).toBe('success');
      expect(body.scan.inserted_sessions).toBe(1);
      expect(body.projects.map((project) => project.root_path)).toContain(repo);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      db.close();
    }

    db = openDb(dbPath);
    app = createServer(db, { scanProvider: createCliLogScanProvider({ homeDir }), projectRoots: [scanRoot] });
    server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server failed to listen');
      const base = `http://127.0.0.1:${address.port}`;

      const projectsResponse = await fetch(`${base}/api/projects`);
      expect(projectsResponse.status).toBe(200);
      const projects = (await projectsResponse.json()) as Array<{ id: number; root_path: string }>;
      const persistedProject = projects.find((project) => project.root_path === repo);
      expect(persistedProject).toBeTruthy();

      const sessionCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE project_id = ? AND source_log_ref = 'claude-code://discovered-session'`).get(
          persistedProject!.id,
        ) as { c: number }
      ).c;
      expect(sessionCount).toBe(1);

      const secondScan = await fetch(`${base}/api/scan?range=all`, { method: 'POST' });
      expect(secondScan.status).toBe(200);
      const secondBody = (await secondScan.json()) as { scan: { inserted_sessions: number } };
      expect(secondBody.scan.inserted_sessions).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      db.close();
    }
  });
});
