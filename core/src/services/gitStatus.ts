import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { GitLinkedWorktree, GitRecentCommit, GitStatusSnapshot } from '../domain/types.js';

const GIT_TIMEOUT_MS = 2_500;
const GIT_MAX_BUFFER = 1024 * 1024;

type GitResult = { ok: boolean; stdout: string; stderr: string };
export interface GitStatusOptions {
  startDate?: string | null;
  endDate?: string | null;
}

function unavailable(projectId: number, reason: string): GitStatusSnapshot {
  return {
    project_id: projectId,
    captured_at: new Date().toISOString(),
    available: false,
    unavailable_reason: reason,
    main_branch: null,
    current_branch: null,
    branch_relationship: 'unavailable',
    working_tree_status: reason,
    linked_worktrees: [],
    upstream_health: 'not available',
    recent_commits: [],
    diff_added_lines: 0,
    diff_changed_lines: 0,
    diff_deleted_lines: 0,
  };
}

function runGit(rootPath: string, args: string[]): GitResult {
  const child = spawnSync('git', ['-C', rootPath, ...args], {
    encoding: 'utf8',
    shell: false,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return {
    ok: child.status === 0 && !child.error,
    stdout: typeof child.stdout === 'string' ? child.stdout.trim() : '',
    stderr: typeof child.stderr === 'string' ? child.stderr.trim() : child.error?.message ?? '',
  };
}

function firstLine(value: string): string | null {
  const line = value
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  return line ?? null;
}

function localMainBranch(rootPath: string): string | null {
  const branches = runGit(rootPath, ['branch', '--format=%(refname:short)']);
  if (branches.ok) {
    const names = branches.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.includes('main')) return 'main';
    if (names.includes('master')) return 'master';
  }

  const remoteHead = runGit(rootPath, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const remote = firstLine(remoteHead.stdout);
  return remote?.replace(/^origin\//, '') ?? null;
}

function currentBranch(rootPath: string): string | null {
  const branch = runGit(rootPath, ['branch', '--show-current']);
  const name = firstLine(branch.stdout);
  if (branch.ok && name) return name;

  const head = runGit(rootPath, ['rev-parse', '--short', 'HEAD']);
  const hash = firstLine(head.stdout);
  return head.ok && hash ? `detached@${hash}` : null;
}

function upstreamInfo(rootPath: string): { relationship: string; health: string } {
  const upstream = runGit(rootPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const upstreamName = firstLine(upstream.stdout);
  if (!upstream.ok || !upstreamName) {
    return { relationship: 'no upstream', health: 'no upstream configured' };
  }

  const counts = runGit(rootPath, ['rev-list', '--left-right', '--count', `HEAD...${upstreamName}`]);
  const [aheadRaw = '0', behindRaw = '0'] = counts.stdout.split(/\s+/);
  const ahead = Number(aheadRaw) || 0;
  const behind = Number(behindRaw) || 0;
  const relationship = ahead === 0 && behind === 0 ? 'up to date' : `ahead ${ahead} · behind ${behind}`;
  return { relationship, health: `tracking ${upstreamName}` };
}

function workingTreeStatus(rootPath: string): string {
  const status = runGit(rootPath, ['status', '--porcelain=v1']);
  if (!status.ok || status.stdout.length === 0) return 'clean';

  const counts = { modified: 0, added: 0, deleted: 0, untracked: 0 };
  for (const line of status.stdout.split('\n').filter(Boolean)) {
    const code = line.slice(0, 2);
    if (code === '??') {
      counts.untracked++;
      continue;
    }
    if (code.includes('A')) counts.added++;
    if (code.includes('M') || code.includes('R') || code.includes('C')) counts.modified++;
    if (code.includes('D')) counts.deleted++;
  }

  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${key}`);
  return parts.length > 0 ? parts.join(' · ') : 'dirty';
}

function linkedWorktrees(rootPath: string): GitLinkedWorktree[] {
  const result = runGit(rootPath, ['worktree', 'list', '--porcelain']);
  if (!result.ok || !result.stdout) return [];

  const out: GitLinkedWorktree[] = [];
  for (const record of result.stdout.split(/\n\s*\n/).filter(Boolean)) {
    let path: string | null = null;
    let branch: string | null = null;
    for (const line of record.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length);
      if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      if (line === 'detached') branch = 'detached';
    }
    if (path) out.push({ name: basename(path), path, branch });
  }
  return out;
}

function recentCommitArgs(options: GitStatusOptions = {}): string[] {
  const args = ['log', '-n', '5'];
  if (options.startDate && options.endDate) {
    args.push(`--since=${options.startDate}T00:00:00+08:00`, `--until=${options.endDate}T23:59:59+08:00`);
  }
  args.push('--pretty=format:%h%x1f%s%x1f%an%x1f%cr%x1e');
  return args;
}

function recentCommits(rootPath: string, options: GitStatusOptions = {}): GitRecentCommit[] {
  const result = runGit(rootPath, recentCommitArgs(options));
  if (!result.ok || !result.stdout) return [];

  return result.stdout
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record, index) => {
      const [hash = '', title = '', author = '', time = ''] = record.split('\x1f');
      return {
        hash,
        title,
        author,
        time,
        tag: index === 0 ? 'HEAD' : 'branch',
      };
    });
}

function diffStats(rootPath: string): { added: number; changed: number; deleted: number } {
  const totals = { added: 0, changed: 0, deleted: 0 };
  for (const args of [
    ['diff', '--numstat', 'HEAD'],
    ['diff', '--cached', '--numstat', 'HEAD'],
  ]) {
    const result = runGit(rootPath, args);
    if (!result.ok || !result.stdout) continue;
    for (const line of result.stdout.split('\n').filter(Boolean)) {
      const [addedRaw = '0', deletedRaw = '0'] = line.split('\t');
      const rawAdded = Number(addedRaw);
      const rawDeleted = Number(deletedRaw);
      if (!Number.isFinite(rawAdded) || !Number.isFinite(rawDeleted)) continue;
      const changed = Math.min(rawAdded, rawDeleted);
      totals.changed += changed;
      totals.added += Math.max(0, rawAdded - changed);
      totals.deleted += Math.max(0, rawDeleted - changed);
    }
  }
  return totals;
}

/**
 * Build a read-only Git status snapshot for a Workspace project (spec §11).
 * This function never shells out through a command string and only runs Git
 * inspection commands. It must not mutate the target repository.
 */
export function getGitStatusSnapshot(input: { project_id: number; root_path: string }, options: GitStatusOptions = {}): GitStatusSnapshot {
  if (!existsSync(input.root_path)) {
    return unavailable(input.project_id, 'project root not found');
  }

  const inside = runGit(input.root_path, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || firstLine(inside.stdout) !== 'true') {
    return unavailable(input.project_id, 'not a git repository');
  }

  const { relationship, health } = upstreamInfo(input.root_path);
  const diff = diffStats(input.root_path);
  return {
    project_id: input.project_id,
    captured_at: new Date().toISOString(),
    available: true,
    unavailable_reason: null,
    main_branch: localMainBranch(input.root_path),
    current_branch: currentBranch(input.root_path),
    branch_relationship: relationship,
    working_tree_status: workingTreeStatus(input.root_path),
    linked_worktrees: linkedWorktrees(input.root_path),
    upstream_health: health,
    recent_commits: recentCommits(input.root_path, options),
    diff_added_lines: diff.added,
    diff_changed_lines: diff.changed,
    diff_deleted_lines: diff.deleted,
  };
}
