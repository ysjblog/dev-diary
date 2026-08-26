import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DB } from '../db/index.js';

export interface DiscoveredProject {
  name: string;
  root_path: string;
  git_repo_detected: boolean;
}

export interface ProjectDiscoveryOptions {
  maxDepth?: number;
  now?: string;
}

export interface ProjectDiscoveryResult {
  roots: string[];
  discovered: DiscoveredProject[];
  inserted: number;
  updated: number;
}

export interface ProjectReconciliationResult {
  skipped: boolean;
  observed: number;
  marked_missing: number;
  restored: number;
}

const DEFAULT_MAX_DEPTH = 2;
const IGNORED_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache']);
const PROJECT_MARKERS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'deno.json', 'README.md'];

function isIgnoredDir(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function projectMarker(path: string): { isProject: boolean; git: boolean } {
  const git = isDirectory(join(path, '.git'));
  if (git) return { isProject: true, git };
  return {
    isProject:
      PROJECT_MARKERS.some((marker) => existsSync(join(path, marker))) ||
      existsSync(join(path, 'app', 'public', 'wp-config.php')),
    git,
  };
}

function fsErrorCode(err: unknown): string | null {
  return err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : null;
}

function collectProjects(root: string, maxDepth: number): { discovered: DiscoveredProject[]; complete: boolean } {
  const discovered: DiscoveredProject[] = [];
  const seen = new Set<string>();
  let complete = true;

  const visit = (dir: string, depth: number) => {
    const marker = projectMarker(dir);
    if (marker.isProject) {
      if (!seen.has(dir)) {
        seen.add(dir);
        discovered.push({ name: basename(dir), root_path: dir, git_repo_detected: marker.git });
      }
      // A configured root may also be a container repository (for example a
      // Local Sites folder). Keep exploring its direct descendants, while a
      // nested project remains a traversal boundary.
      if (depth > 0) return;
    }
    if (depth >= maxDepth) return;

    let entries: string[] = [];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      complete = false;
      return;
    }
    for (const entry of entries) {
      if (isIgnoredDir(entry)) continue;
      const child = join(dir, entry);
      try {
        if (statSync(child).isDirectory()) visit(child, depth + 1);
      } catch {
        complete = false;
      }
    }
  };

  try {
    if (statSync(root).isDirectory()) visit(root, 0);
    else complete = false;
  } catch {
    complete = false;
  }
  return { discovered, complete };
}

export function discoverProjectsFromRoots(db: DB, roots: string[], options: ProjectDiscoveryOptions = {}): ProjectDiscoveryResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const now = options.now ?? new Date().toISOString();
  const uniqueRoots = Array.from(new Set(roots.map((root) => root.trim()).filter(Boolean)));
  const discovered = uniqueRoots.flatMap((root) => collectProjects(root, maxDepth).discovered).sort((a, b) => a.root_path.localeCompare(b.root_path));
  let inserted = 0;
  let updated = 0;

  const sync = db.transaction(() => {
    for (const project of discovered) {
      const existing = db.prepare(`SELECT name, git_repo_detected FROM projects WHERE root_path = ?`).get(project.root_path) as
        | { name: string; git_repo_detected: number }
        | undefined;
      if (!existing) {
        db.prepare(
          `INSERT INTO projects (name, root_path, tracking_status, created_at, last_activity_at,
             detected_agents, ignored, scan_paused, git_repo_detected, git_branch, git_worktree_count)
           VALUES (@name, @root_path, 'active', @created_at, NULL,
             '[]', 0, 0, @git_repo_detected, NULL, 0)`,
        ).run({
          name: project.name,
          root_path: project.root_path,
          created_at: now,
          git_repo_detected: project.git_repo_detected ? 1 : 0,
        });
        inserted++;
        continue;
      }
      db.prepare(`UPDATE projects SET presence_status = 'present', missing_check_count = 0, last_presence_check_at = ? WHERE root_path = ?`).run(now, project.root_path);
      if (existing.name !== project.name || Boolean(existing.git_repo_detected) !== project.git_repo_detected) {
        db.prepare(`UPDATE projects SET name = ?, git_repo_detected = ? WHERE root_path = ?`).run(
          project.name,
          project.git_repo_detected ? 1 : 0,
          project.root_path,
        );
        updated++;
      }
    }
  });
  sync();

  return { roots: uniqueRoots, discovered, inserted, updated };
}

function pathWithinRoot(path: string, root: string): boolean {
  const target = resolve(path);
  const parent = resolve(root);
  return target === parent || target.startsWith(`${parent}${sep}`);
}

export function reconcileMissingProjects(
  db: DB,
  roots: string[],
  options: { now?: string; intervalDays?: number; beforeFinalize?: () => void } = {},
): ProjectReconciliationResult {
  const now = options.now ?? new Date().toISOString();
  const observationStartedAt = Date.now();
  const liveObservationTime = () => options.now === undefined
    ? Date.now()
    : Date.parse(now) + Math.max(0, Date.now() - observationStartedAt);
  const completedAt = () => options.now === undefined ? new Date(liveObservationTime()).toISOString() : now;
  const intervalMs = (options.intervalDays ?? 7) * 86_400_000;
  const owner = randomUUID();
  const periodStart = now.slice(0, 10);
  const leaseExpiresAt = new Date(Date.parse(now) + 30 * 60_000).toISOString();
  const claimed = db.transaction((): boolean => {
    const latest = db.prepare(
      `SELECT completed_at FROM project_reconciliation_runs WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1`,
    ).get() as { completed_at: string } | undefined;
    if (latest && Date.parse(now) - Date.parse(latest.completed_at) < intervalMs) {
      return false;
    }
    const existing = db.prepare(`SELECT owner_instance_id, lease_expires_at, status FROM project_reconciliation_runs WHERE period_start = ?`).get(periodStart) as
      | { owner_instance_id: string; lease_expires_at: string; status: 'running' | 'success' | 'failed' }
      | undefined;
    if (existing?.status === 'success' || (existing?.status === 'running' && Date.parse(existing.lease_expires_at) > Date.parse(now))) return false;
    db.prepare(
      `INSERT INTO project_reconciliation_runs
         (period_start, owner_instance_id, lease_expires_at, started_at, completed_at, status, checked_roots, result_json, error)
       VALUES (?, ?, ?, ?, NULL, 'running', '[]', NULL, NULL)
       ON CONFLICT(period_start) DO UPDATE SET
         owner_instance_id = excluded.owner_instance_id, lease_expires_at = excluded.lease_expires_at,
         started_at = excluded.started_at, completed_at = NULL, status = 'running', checked_roots = '[]', result_json = NULL, error = NULL`,
    ).run(periodStart, owner, leaseExpiresAt, now);
    return true;
  }).immediate();
  if (!claimed) return { skipped: true, observed: 0, marked_missing: 0, restored: 0 };

  const configuredRoots = Array.from(new Set(roots.map((root) => root.trim()).filter(Boolean)));
  const usableRoots = configuredRoots.filter((root) => collectProjects(root, DEFAULT_MAX_DEPTH).complete);
  if (usableRoots.length === 0) {
    db.prepare(`UPDATE project_reconciliation_runs SET status = 'failed', completed_at = ?, error = 'No configured root completed traversal.' WHERE period_start = ? AND owner_instance_id = ? AND status = 'running'`).run(now, periodStart, owner);
    return { skipped: true, observed: 0, marked_missing: 0, restored: 0 };
  }

  options.beforeFinalize?.();
  const reconcile = db.transaction((): ProjectReconciliationResult => {
    const lease = db.prepare(`SELECT owner_instance_id, lease_expires_at, status FROM project_reconciliation_runs WHERE period_start = ?`).get(periodStart) as
      | { owner_instance_id: string; lease_expires_at: string; status: string }
      | undefined;
    if (lease?.owner_instance_id !== owner || lease.status !== 'running' || Date.parse(lease.lease_expires_at) <= liveObservationTime()) {
      return { skipped: true, observed: 0, marked_missing: 0, restored: 0 };
    }
    const latestSuccess = db.prepare(
      `SELECT period_start, completed_at FROM project_reconciliation_runs
       WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1`,
    ).get() as { period_start: string; completed_at: string } | undefined;
    if (latestSuccess && liveObservationTime() - Date.parse(latestSuccess.completed_at) < intervalMs) {
      db.prepare(
        `UPDATE project_reconciliation_runs
         SET status = 'failed', completed_at = ?, error = 'Superseded by a newer successful reconciliation.'
         WHERE period_start = ? AND owner_instance_id = ? AND status = 'running'`,
      ).run(completedAt(), periodStart, owner);
      return { skipped: true, observed: 0, marked_missing: 0, restored: 0 };
    }
    let observed = 0;
    let markedMissing = 0;
    let restored = 0;
    const projects = db.prepare(`SELECT id, root_path, presence_status, missing_check_count FROM projects`).all() as Array<{
      id: number; root_path: string; presence_status: 'present' | 'missing'; missing_check_count: number;
    }>;
    for (const project of projects) {
      if (!usableRoots.some((root) => pathWithinRoot(project.root_path, root))) continue;
      let pathState: 'present' | 'missing' | 'inconclusive';
      try {
        statSync(project.root_path);
        pathState = 'present';
      } catch (err) {
        pathState = fsErrorCode(err) === 'ENOENT' ? 'missing' : 'inconclusive';
      }
      if (pathState === 'inconclusive') continue;
      observed++;
      if (pathState === 'present') {
        if (project.presence_status === 'missing') restored++;
        db.prepare(`UPDATE projects SET presence_status = 'present', missing_check_count = 0, last_presence_check_at = ? WHERE id = ?`).run(now, project.id);
        continue;
      }
      const nextCount = project.missing_check_count + 1;
      const nextStatus = nextCount >= 2 ? 'missing' : project.presence_status;
      if (project.presence_status !== 'missing' && nextStatus === 'missing') markedMissing++;
      db.prepare(`UPDATE projects SET presence_status = ?, missing_check_count = ?, last_presence_check_at = ? WHERE id = ?`).run(nextStatus, nextCount, now, project.id);
    }
    const result = { skipped: false, observed, marked_missing: markedMissing, restored };
    const completed = db.prepare(
      `UPDATE project_reconciliation_runs SET status = 'success', completed_at = ?, checked_roots = ?, result_json = ?, error = NULL
       WHERE period_start = ? AND owner_instance_id = ? AND status = 'running'`,
    ).run(completedAt(), JSON.stringify(usableRoots), JSON.stringify(result), periodStart, owner);
    if (completed.changes !== 1) throw new Error('Project reconciliation ownership was lost before completion.');
    return result;
  });
  return reconcile.immediate();
}
