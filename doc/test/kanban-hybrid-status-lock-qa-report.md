# QA Black-Box Report

- Environment: local DevDiary Vite UI + loopback Core API
- Revision / HEAD SHA: 1874481 plus current working-tree changes
- Timestamp: 2026-07-06T05:03:10Z
- Target URL / public entry: http://localhost:5173
- Test depth: Level 3; Runtime smoke REQUIRED; Black-box QA REQUIRED
- Subagent attempt: not spawned
- Subagents used: none
- Fallback reason: platform tool policy disallows subagents unless the user explicitly asks for subagents/delegation.
- Result: PASS

## Scenarios

- [PASS] Open Dashboard at `http://localhost:5173`, switch to Workspace, and verify Kanban board is visible.
  Expected result: Workspace loads selected project detail, Kanban columns render, and Core API requests succeed.
  Actual result: Dashboard and Workspace loaded; `/api/dashboard`, `/api/projects`, `/api/projects/:id`, `/api/health`, `/api/settings`, `/api/agents/detect`, and `/api/scheduler/daily` returned 200.
- [PASS] Inspect user-moved Kanban cards on desktop viewport.
  Expected result: cards with manual status lock show a visible badge explaining AI / auto scan will not adjust progress.
  Actual result: Desktop snapshot showed `手動調整` badges with tooltip `這張卡已被你手動移動，AI/自動掃描不會再改它的進度`.
- [PASS] Resize to 390px mobile viewport and inspect Workspace Kanban.
  Expected result: Kanban cards, badge, description, and move controls remain readable without obvious horizontal overlap.
  Actual result: Mobile snapshot kept the same Kanban content readable; no badge/control overlap observed.
- [PASS] Check browser console and API/network failures.
  Expected result: no console errors or failed Core API requests.
  Actual result: Playwright console reported 0 errors / 0 warnings; relevant API requests returned 200.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - `/tmp/codex-ui-mobile-kanban-hybrid-status-lock.png`
- Commands / artifacts:
  - Playwright snapshots for desktop and 390px mobile Workspace Kanban.
  - `playwright-cli console`
  - `playwright-cli requests`
- Console errors: none
- Network/API errors: none observed in relevant Core API requests

## Findings

- Severity: none
- Reproduction steps: not applicable
- Expected: not applicable
- Actual: not applicable

## Residual Risk

- This QA pass used the current local persisted DevDiary data. It observed existing locked cards, but did not create new cards or run external AI candidate generation.
