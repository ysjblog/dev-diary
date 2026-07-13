# Scan, Diary, And Docs Usability — Security Review

## Scope and verdict

- Verdict: PASS with accepted local-only residual risk.
- Reviewed surfaces: scan-state API writers, background runner timing, Codex diary adapter, Project Docs timestamp/path handling, and browser-only Docs search.

## Trust boundaries and controls

| Boundary | Untrusted or sensitive input | Sink | Control | Result |
|---|---|---|---|---|
| UI → Core scan state | HTTP scan requests and concurrent completion order | persisted SQLite settings | Core-only `recordScanOperation`, UUID operation identity, monotonic terminal update and read-only UI merge | Pass |
| Core → Codex CLI | generated/redacted diary prompt and configured canonical executable | child process | `execFile`, fixed argv, `shell: false`, read-only sandbox, ephemeral temporary cwd, allowlisted environment, timeout/maxBuffer and finally cleanup | Pass |
| Filesystem → Project Docs | scanned relative names and source content | persisted `project_docs` | reject absolute/traversal/empty/NUL path parts; normalize to POSIX logical path; Core scanner remains read-only | Pass |
| Browser Docs search | filename/content query | in-memory React filter | query never reaches SQL, shell, filesystem, or remote service | Pass |

## Evidence

- `core/test/diaryAgent.test.ts` asserts the Codex `exec` argv, read-only sandbox, no shell, and temporary cwd cleanup.
- `core/test/settings.test.ts` asserts scan operation ordering and next-due persistence.
- `core/test/projects.test.ts` asserts source mtime ordering and stable filename tie-break.
- Local runtime smoke used only loopback Core/UI and a normal scan; no credentials, prompt content, secrets, or source files were printed.

## Residual risk

- Codex intentionally retains the user's existing Codex configuration/rules so the local CLI continues to behave as the user configured it. DevDiary does not pass app secrets or project working directories; the child is constrained to a fresh app-controlled temporary cwd and `--sandbox read-only`.
