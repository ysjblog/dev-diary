import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { getGitStatusSnapshot } from '../src/services/gitStatus.js';
import { getProjectDetail } from '../src/services/projects.js';
import { createServer } from '../src/server.js';

const TODAY = '2026-06-28';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devdiary-git-status-'));
  roots.push(root);
  return root;
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
}

function commitFile(repo: string, fileName: string, content: string, message: string, date = '2026-06-27T10:00:00+08:00'): void {
  writeFileSync(join(repo, fileName), content);
  git(repo, ['add', fileName]);
  git(repo, ['-c', 'user.name=DevDiary Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', message], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
}

function initRepo(name = 'repo'): string {
  const root = tempRoot();
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  commitFile(repo, 'README.md', '# Demo\n', 'Initial commit');
  return repo;
}

function seededDb(rootPath: string): DB {
  const db = openDb(':memory:');
  seedDatabase(db, { today: TODAY, days: 5, seed: 1337 });
  db.prepare(`UPDATE projects SET root_path = ?, git_repo_detected = 1, git_branch = 'main', git_worktree_count = 1 WHERE id = 1`).run(
    rootPath,
  );
  return db;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Workspace Git Status snapshot', () => {
  it('getGitStatusSnapshot 對正常 Git repo 回傳 canonical snapshot', () => {
    const repo = initRepo();
    writeFileSync(join(repo, 'README.md'), '# Demo\n\nChanged line\n');
    writeFileSync(join(repo, 'new-file.txt'), 'new file\n');

    const snapshot = getGitStatusSnapshot({ project_id: 1, root_path: repo });

    expect(snapshot.project_id).toBe(1);
    expect(snapshot.available).toBe(true);
    expect(snapshot.main_branch).toBe('main');
    expect(snapshot.current_branch).toBe('main');
    expect(snapshot.branch_relationship).toMatch(/up to date|no upstream/);
    expect(snapshot.working_tree_status).toMatch(/modified|untracked/);
    expect(snapshot.linked_worktrees.length).toBeGreaterThan(0);
    expect(snapshot.linked_worktrees[0]!.name).toBe(basename(repo));
    expect(snapshot.recent_commits[0]!.title).toBe('Initial commit');
    expect(snapshot.diff_added_lines + snapshot.diff_changed_lines + snapshot.diff_deleted_lines).toBeGreaterThan(0);
    expect(typeof snapshot.captured_at).toBe('string');
  });

  it('Git reader 只執行 read-only allowlist 且不經 shell', () => {
    const repo = initRepo('repo;touch injected');
    const root = join(repo, '..');
    const beforeStatus = git(repo, ['status', '--porcelain=v1']);
    const beforeHead = readFileSync(join(repo, '.git', 'HEAD'), 'utf8');

    const snapshot = getGitStatusSnapshot({ project_id: 1, root_path: repo });

    expect(snapshot.available).toBe(true);
    expect(existsSync(join(root, 'injected'))).toBe(false);
    expect(git(repo, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    expect(readFileSync(join(repo, '.git', 'HEAD'), 'utf8')).toBe(beforeHead);
  });

  it('range-scoped Git snapshot excludes newer commits from historical diary dates', () => {
    const repo = initRepo();
    commitFile(repo, 'old-day.txt', 'old day\n', 'Historical diary commit', '2026-06-28T11:00:00+08:00');
    commitFile(repo, 'today.txt', 'today\n', 'Today-only commit', '2026-07-02T11:00:00+08:00');

    const latest = getGitStatusSnapshot({ project_id: 1, root_path: repo });
    expect(latest.recent_commits[0]!.title).toBe('Today-only commit');

    const ranged = getGitStatusSnapshot(
      { project_id: 1, root_path: repo },
      { startDate: '2026-06-28', endDate: '2026-06-28' },
    );
    expect(ranged.recent_commits.map((commit) => commit.title)).toContain('Historical diary commit');
    expect(ranged.recent_commits.map((commit) => commit.title)).not.toContain('Today-only commit');

    const db = seededDb(repo);
    const detail = getProjectDetail(db, 1, '2026-06-28', {
      range: 'custom',
      customStart: '2026-06-28',
      customEnd: '2026-06-28',
    })!;
    expect(detail.git_status.recent_commits.map((commit) => commit.title)).toContain('Historical diary commit');
    expect(detail.git_status.recent_commits.map((commit) => commit.title)).not.toContain('Today-only commit');
  });

  it('missing root / 非 Git repo 回傳 unavailable snapshot，不 crash', () => {
    const normalFolder = tempRoot();
    const missing = join(tempRoot(), 'missing');

    const nonGit = getGitStatusSnapshot({ project_id: 1, root_path: normalFolder });
    const missingRepo = getGitStatusSnapshot({ project_id: 2, root_path: missing });

    for (const snapshot of [nonGit, missingRepo]) {
      expect(snapshot.available).toBe(false);
      expect(snapshot.main_branch).toBeNull();
      expect(snapshot.current_branch).toBeNull();
      expect(snapshot.linked_worktrees).toEqual([]);
      expect(snapshot.recent_commits).toEqual([]);
      expect(snapshot.diff_added_lines).toBe(0);
      expect(snapshot.diff_changed_lines).toBe(0);
      expect(snapshot.diff_deleted_lines).toBe(0);
    }
  });

  it('GET /api/projects/:id snapshot 包含 git_status；invalid/not found 不跑 Git', async () => {
    const repo = initRepo();
    const db = seededDb(repo);
    const app = createServer(db);
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server failed to listen');
      const base = `http://127.0.0.1:${address.port}`;

      const ok = await fetch(`${base}/api/projects/1`);
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { git_status: { project_id: number; available: boolean } };
      expect(body.git_status.project_id).toBe(1);
      expect(body.git_status.available).toBe(true);

      const invalid = await fetch(`${base}/api/projects/abc`);
      expect(invalid.status).toBe(400);

      const missing = await fetch(`${base}/api/projects/9999`);
      expect(missing.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('Project detail Git status snapshot 不修改 repo state', () => {
    const repo = initRepo();
    writeFileSync(join(repo, 'README.md'), '# Demo\n\nStill dirty\n');
    const beforeStatus = git(repo, ['status', '--porcelain=v1']);
    const beforeHead = readFileSync(join(repo, '.git', 'HEAD'), 'utf8');
    const db = seededDb(repo);

    const detail = getProjectDetail(db, 1, TODAY)!;

    expect(detail.git_status.available).toBe(true);
    expect(git(repo, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    expect(readFileSync(join(repo, '.git', 'HEAD'), 'utf8')).toBe(beforeHead);
  });
});
