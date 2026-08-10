#!/usr/bin/env bash
set -euo pipefail

repo_input="${1:-.}"
repo_root="$(git -C "$repo_input" rev-parse --show-toplevel 2>/dev/null)" || {
  printf 'verification-candidate-digest: target is not a Git worktree\n' >&2
  exit 64
}
head_revision="$(git -C "$repo_root" rev-parse HEAD)"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/devdiary-candidate-digest.XXXXXX")"
index_file="$tmp_dir/index"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

GIT_INDEX_FILE="$index_file" git -C "$repo_root" read-tree HEAD
GIT_INDEX_FILE="$index_file" git -C "$repo_root" add -A -- .
candidate_tree="$(GIT_INDEX_FILE="$index_file" git -C "$repo_root" write-tree)"

printf '%s\n%s\n' "$head_revision" "$candidate_tree" | shasum -a 256 | awk '{print $1}'
