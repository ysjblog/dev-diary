import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const IGNORED_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache']);
const PROJECT_MARKERS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'deno.json', 'README.md'];

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function projectMarker(path) {
  const git = isDirectory(join(path, '.git'));
  return {
    isProject: git || PROJECT_MARKERS.some((marker) => existsSync(join(path, marker))) || existsSync(join(path, 'app', 'public', 'wp-config.php')),
    git,
  };
}

function collect(root, maxDepth) {
  const discovered = [];
  const seen = new Set();
  let complete = true;
  const visit = (dir, depth) => {
    const marker = projectMarker(dir);
    if (marker.isProject) {
      if (!seen.has(dir)) {
        seen.add(dir);
        discovered.push({ name: basename(dir), root_path: dir, git_repo_detected: marker.git });
      }
      if (depth > 0) return;
    }
    if (depth >= maxDepth) return;
    let entries;
    try { entries = readdirSync(dir).sort(); } catch { complete = false; return; }
    for (const entry of entries) {
      if (entry.startsWith('.') || IGNORED_DIRS.has(entry)) continue;
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

const root = process.argv[2];
const maxDepth = Number(process.argv[3]);
if (!root || !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 8) process.exit(2);
process.stdout.write(JSON.stringify(collect(root, maxDepth)));
