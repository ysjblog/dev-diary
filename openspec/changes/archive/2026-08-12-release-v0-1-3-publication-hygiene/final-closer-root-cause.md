# Final Closer Root-cause Resolution

## Trigger

The first fresh final closer rejected the consolidated fix because two original findings were not executable yet and the compatibility receipt lacked transparent landing detail. This is a cross-file finding, so publication remains blocked until a bounded fresh reviewer checks this resolution.

## Root Cause

- The version contract was updated in prose before the focused test parsed `package-lock.json.packages[""]` and the `app` package in Cargo.lock.
- The privacy contract described a reusable release-body scanner, but the implementation was still an inline test that reconstructed private literals and scanned only tracked files.
- The compatibility bridge intentionally did not claim independent approval, but the author receipt reduced landing evidence to one boolean and therefore obscured how the five original findings were resolved.

## Resolution

- `src/api/releaseDistribution.test.js` now parses both npm lock version locations and exactly one Cargo `app` entry.
- `scripts/check-public-release-hygiene.mjs` derives identity from Git worktrees/home at runtime, scans cached plus untracked non-ignored files, and can scan a release-notes file before create and after readback.
- The focused suite includes clean and hostile release-body fixtures without the maintainer identity literal.
- `author-fix-report.md` records every original finding, concern tags and exact landing string. The compatibility bridge remains explicitly non-independent; only a fresh final reviewer may approve modified artifacts.

## Stop Condition

If the bounded fresh reviewer finds another cross-file authority or implementation mismatch, publication stops and the user receives the contradiction; no additional full-review loop is synthesized.
