# Codex Scan And Heatmap QA Report

Date: 2026-06-29
Runtime: local Core `http://127.0.0.1:4317`, Vite UI `http://127.0.0.1:5173`

## Scope

- Codex CLI token parsing from existing local JSONL metadata.
- Safe same-source token backfill for previously inserted zero-token Codex sessions.
- Project list agent visibility derived from sessions.
- Dashboard heatmap week/weekday calendar layout.

## Evidence

- `cd core && npm test -- cliLogParser.test.ts projects.test.ts` passed.
- `cd core && npm test` passed: 10 files, 91 tests.
- `cd core && npm run typecheck` passed.
- `npm test` passed: 6 tests.
- `npm run build` passed.
- `git diff --check` passed.
- Live `POST /api/scan?range=all` against the persistent local runtime completed successfully.
- Browser desktop screenshot: `output/playwright/dashboard-heatmap-desktop.png`.
- Browser mobile screenshot: `output/playwright/dashboard-heatmap-mobile-scrolled.png`.

## Live Data Result

- Persistent DB before Codex backfill had 244 Codex sessions with 0 Codex tokens.
- Persistent DB was backed up before mutation at:
  `~/Library/Application Support/DevDiary/DevDiary.2026-06-29T12-45-24-627Z.before-codex-backfill.sqlite`
- After rescan/backfill, Codex shows 244 sessions and 2,624,534,199 tokens.
- Remaining 22 Codex zero-token sessions appear to have no supported token usage metadata in the scanned source logs.
- Antigravity sessions are visible, but token totals remain 0 because the parsed metadata does not expose stable token usage fields yet.

## QA Notes

- Heatmap now maps each date to a Monday-start weekday row and a week column.
- Month labels are derived from the first week column touched by each month in the returned range.
- UI smoke found no obvious overlap on desktop or mobile.
- No Codex, Claude, or Antigravity executable was invoked; scan remains read-only over existing local logs/metadata.
