# Worktree Specification — DevDiary reliability and local-runtime security hardening

## Branch

- Source baseline: `main` at `af1a21311eea49787d9beddbaa6d36bb29c22720`
- Integrated predecessor: `codex/fix-daily-diary-input` at `197bceb18f846c7196d076a4d3d8fb7a09233782`
- Working branch: `codex/reliability-security-hardening`
- Worktree: `~/Projects/dev-diary-reliability-hardening`

## Goal

Make DevDiary use one Asia/Taipei calendar contract across date-scoped features, prevent untrusted browser pages from invoking local Core mutations, require live runtime identity, and keep the macOS background runner's generated assets in a per-user writable directory.

## Implementation scope

- Re-verify and retain the predecessor branch's automatic Daily diary input and Taipei-date fixes.
- Close remaining UTC/Taipei bucketing gaps in Core and UI-facing exports.
- Reject Origin-bearing Core requests whose browser origin is not explicitly trusted before any side effect.
- Require a positive, live owner PID before trusting a runtime manifest in Core-adjacent JS and Rust consumers.
- Generate LaunchAgent support files under `~/Library/Application Support/DevDiary`, not beside `/Applications/DevDiary.app`.
- Update OpenSpec, test plans, regression tests, QA evidence, and project navigation.

## Acceptance criteria

- A UTC session between 16:00 and 23:59 is attributed to the following Asia/Taipei date everywhere it is queried or aggregated.
- An untrusted `Origin` receives a rejection before scan, scheduler, settings, or other mutation logic runs. Trusted origins are exact values only: packaged `tauri://localhost`, default dev `http://localhost:5173` / `http://127.0.0.1:5173`, and validated explicit loopback origins supplied for a dev worktree. This worktree supplies only `http://localhost:5180` / `http://127.0.0.1:5180`; no arbitrary localhost-port wildcard is allowed. No-Origin native/CLI callers remain supported.
- A missing, non-positive, or dead runtime-manifest PID is never trusted by either the JS resolver or Tauri resolver.
- Packaged background-runner assets resolve to the user's Application Support directory and unit tests do not write real user files.
- Level 4 automated, runtime smoke, independent black-box, security, build/type, Rust, OpenSpec, and diff gates pass with artifacts bound first to the deterministic candidate digest and then rerun against the final commit SHA.

## Technical constraints

- No private runtime SQLite inspection or modification.
- No destructive schema/data migration.
- No real provider token spend; use in-memory databases, mocks, and safe local runtime inputs.
- Preserve desktop-only UI support; no mobile viewport work.
- No merge, push, deploy, publication, installation, or remote branch deletion.

## Cross-branch notes

- The predecessor branch is not deleted until the Owner can prove its content is contained in this branch and cleanup remains safe.
- This branch intentionally starts from the predecessor because `main` is its ancestor and the two commits are already isolated, committed, and independently reviewable.
- Merge order, if later authorized: `codex/reliability-security-hardening` into `main`; do not merge the predecessor separately.
