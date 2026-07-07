# QA Black-Box Report

- Environment: localhost Vite `http://127.0.0.1:5173` + Core `http://127.0.0.1:4317`
- Revision / HEAD SHA: `4732305` + working tree changes
- Timestamp: 2026-07-01T16:36:00Z
- Target URL / public entry: `http://127.0.0.1:5173`
- Test depth: Level 3
- Subagent attempt: skipped
- Subagents used: none
- Fallback reason: subagent tool policy says not to spawn unless the user explicitly asks for subagents; main agent performed the same black-box scenarios.
- Result: PASS

## Scenarios

- [PASS] Open Settings on desktop, expected simplified top area, actual: only one Core runtime status card was visible.
- [PASS] Check non-clickable Core capabilities, expected hidden from normal UI, actual: no `dashboard.snapshot` / `projects.list` text or `.runtime-capabilities` chips appeared.
- [PASS] Check duplicated top overview, expected no top Daily Scheduler or Storage summary, actual: Settings top runtime summary had `hasDailySchedulerTop=false` and `hasStorageTop=false`; editable sections still showed Daily Scheduler and data storage below.
- [PASS] Check light-mode Settings toolbar, expected softer panel background, actual: `rgba(255, 255, 255, 0.78)` with subtle blue shadow.
- [PASS] Open Settings at 390px mobile, expected no horizontal overflow or overlapping controls, actual: `overflowCount=0`, mobile tooltip hidden, form rows stack with controls next to their labels.
- [PASS] Open Workspace > Logs, select old date `2026-06-30`, expected left editor enters daily entry context, actual: left title changed to `2026-06-30 日記摘要` and right block showed `左側顯示中`.
- [PASS] Check network/API health during smoke, expected local API calls succeed, actual: dashboard/settings/projects/health requests returned HTTP 200.
- [PASS] Probe custom agent executable through Core, expected safe probe succeeds without persistence, actual: `/usr/local/bin/ollama --version` returned `connected` and `custom_agents_count` stayed `0`.
- [PASS] Run local Ollama model smoke, expected the installed 27B Qwen model can answer, actual: `qwen3.6:27b` returned `DevDiary Ollama 測試成功。`

## Evidence

- Screenshots:
  - `output/playwright/settings-simplified-desktop.png`
  - `output/playwright/settings-simplified-mobile.png`
  - `output/playwright/logs-old-date-desktop.png`
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
- Commands / artifacts:
  - `npm test`
  - `npm run build`
  - `cd core && npm test -- customAgents.test.ts settings.test.ts`
  - `cd core && npm run typecheck`
  - `curl http://127.0.0.1:4317/api/health`
  - `curl http://127.0.0.1:11434/api/tags`
  - `curl http://127.0.0.1:11434/api/generate` with `model=qwen3.6:27b`, `think=false`
  - `POST http://127.0.0.1:4317/api/agents/custom/probe`
- Console errors: none observed in the final Settings smoke.
- Network/API errors: none observed in checked requests.

## Findings

- Severity: none for the requested Settings simplification.
- Limitation: Custom Agent can currently probe and persist safe local executables, but diary generation is still wired to the existing default diary agent path. Using Ollama/Qwen as the actual diary generation provider needs an additional provider adapter and settings fields for endpoint/model/prompt protocol.

## Residual Risk

- The AI regenerate button itself was not clicked in the live app to avoid invoking a real configured diary agent against the user's persistent DB. The URL/range contract is covered by `src/api/projects.test.js`, and Core selected-date snapshot behavior is covered by `core/test/projectWrites.test.ts`.
