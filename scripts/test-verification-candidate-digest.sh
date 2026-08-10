#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
digest_script="$script_dir/verification-candidate-digest.sh"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/devdiary-digest-test.XXXXXX")"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

test_repo="$tmp_dir/repo"
mkdir -p "$test_repo"
git -C "$test_repo" init -q
git -C "$test_repo" config user.email "verification-test@devdiary.local"
git -C "$test_repo" config user.name "DevDiary verification test"
printf 'tracked-v1\n' > "$test_repo/tracked.txt"
printf '.verification-evidence/\n' > "$test_repo/.gitignore"
git -C "$test_repo" add tracked.txt .gitignore
git -C "$test_repo" commit -qm "test: seed digest fixture"

first="$(bash "$digest_script" "$test_repo")"
second="$(bash "$digest_script" "$test_repo")"
[[ "$first" =~ ^[0-9a-f]{64}$ ]] || fail "digest must be a lowercase SHA-256 value"
[[ "$first" == "$second" ]] || fail "unchanged candidate must produce a stable digest"

printf 'tracked-v2\n' > "$test_repo/tracked.txt"
tracked_changed="$(bash "$digest_script" "$test_repo")"
[[ "$tracked_changed" != "$first" ]] || fail "tracked content changes must change the digest"

printf 'untracked-code\n' > "$test_repo/new-code.ts"
untracked_changed="$(bash "$digest_script" "$test_repo")"
[[ "$untracked_changed" != "$tracked_changed" ]] || fail "non-ignored untracked files must change the digest"

mkdir -p "$test_repo/.verification-evidence"
printf 'ignored evidence\n' > "$test_repo/.verification-evidence/result.json"
ignored_evidence="$(bash "$digest_script" "$test_repo")"
[[ "$ignored_evidence" == "$untracked_changed" ]] || fail "ignored evidence must not change the candidate digest"

git -C "$test_repo" add tracked.txt new-code.ts
git -C "$test_repo" commit -qm "test: advance fixture head"
head_changed="$(bash "$digest_script" "$test_repo")"
[[ "$head_changed" != "$ignored_evidence" ]] || fail "HEAD changes must change the digest"

printf 'PASS: verification candidate digest self-test\n'
