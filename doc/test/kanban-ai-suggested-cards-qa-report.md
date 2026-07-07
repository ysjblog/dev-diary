# QA Black-Box Report

- Environment: localhost UI `http://127.0.0.1:5174`, Core `http://127.0.0.1:4329`, Core DB `:memory:`
- Revision / HEAD SHA: `dda7c2f`
- Timestamp: 2026-07-06 18:40 Asia/Taipei
- Target URL / public entry: Workspace Kanban board and Settings Automation tab
- Test depth: Level 3; Runtime smoke REQUIRED; Black-box QA REQUIRED
- Subagent attempt: attempted with QA subagent `0190abcd-ef00-7000-8000-000000000011`
- Subagents used: 0 for completed QA
- Fallback reason: QA subagent was blocked by usage limit before producing a report, so the main agent executed the same black-box scenarios in a separate pass.
- Result: PASS

## Scenarios

- [PASS] Open Workspace from the app navigation. Expected: Workspace renders without crashing and exposes the Kanban board. Actual: `Kanban 看板` rendered.
- [PASS] Inspect Workspace Kanban AI controls. Expected: `AI Kanban`, `重新整理卡片`, and an AI sync summary are visible. Actual: all three were present; summary matched `AI 自動加入 0 張、更新 0 張、略過 0 張`.
- [PASS] Open Settings > Automation. Expected: Daily Scheduler controls remain visible and Kanban AI tuning controls are hidden. Actual: `Kanban AI Auto-add`, `Confidence`, and `Max cards` were not visible.
- [PASS] Desktop layout at 1280x900. Expected: no page-level horizontal overflow. Actual: `bodyScrollWidth = 1280`, `bodyClientWidth = 1280`.
- [PASS] Mobile Settings layout at 390x844. Expected: no page-level horizontal overflow; internal tab scroller allowed. Actual: `bodyScrollWidth = 390`, `bodyClientWidth = 390`; only `.settings-tabs` had `overflow-x: auto`.
- [PASS] Mobile Workspace layout at 390x844. Expected: Kanban AI controls visible and no page-level horizontal overflow. Actual: `AI Kanban`, `重新整理卡片`, and summary visible; `bodyScrollWidth = 390`, `bodyClientWidth = 390`. Existing project list used an internal horizontal scroller.
- [PASS] Console and API network check. Expected: no feature-related browser console warning/error and no failed API calls. Actual: console returned 0 warnings/errors; `/api/dashboard`, `/api/projects`, `/api/health`, `/api/settings`, `/api/agents/detect`, `/api/scheduler/daily`, and `/api/scan` returned 200.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - Browser MCP screenshots captured during the run for Workspace desktop/mobile and Settings desktop/mobile.
- Commands / artifacts:
  - `curl -sS http://127.0.0.1:4329/api/health` reported `kanban.ai-sync` in capabilities after Core restart.
  - `/tmp/codex-ui-verified-df89aa9b86f2`
- Console errors: none
- Network/API errors: none observed for non-static `/api/` requests

## Findings

- Severity: none
- Reproduction steps: not applicable
- Expected: not applicable
- Actual: not applicable

## Residual Risk

- The black-box pass used a local `:memory:` Core runtime and verified the UI/API contract without calling a real external AI provider. Provider-specific auth/rate-limit behavior is covered by non-throwing generator error tests and remains a controlled integration risk.
