import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
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

function collectProjects(root: string, maxDepth: number): DiscoveredProject[] {
  const discovered: DiscoveredProject[] = [];
  const seen = new Set<string>();

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
      return;
    }
    for (const entry of entries) {
      if (isIgnoredDir(entry)) continue;
      const child = join(dir, entry);
      if (isDirectory(child)) visit(child, depth + 1);
    }
  };

  if (isDirectory(root)) visit(root, 0);
  return discovered;
}

export function discoverProjectsFromRoots(db: DB, roots: string[], options: ProjectDiscoveryOptions = {}): ProjectDiscoveryResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const now = options.now ?? new Date().toISOString();
  const uniqueRoots = Array.from(new Set(roots.map((root) => root.trim()).filter(Boolean)));
  const discovered = uniqueRoots.flatMap((root) => collectProjects(root, maxDepth)).sort((a, b) => a.root_path.localeCompare(b.root_path));
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
