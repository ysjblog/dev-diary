import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { createServer } from '../src/server.js';
import { discoverProjectsFromRoots } from '../src/services/projectDiscovery.js';
import { createCliLogScanProvider, escapeClaudeProjectPath } from '../src/services/cliLogParser.js';
import { createConfiguredScanProvider, runManualScan, type ScanProvider } from '../src/services/scans.js';

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
