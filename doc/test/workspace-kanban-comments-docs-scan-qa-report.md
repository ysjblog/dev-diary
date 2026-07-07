# QA Black-Box Report

- Environment: local Core `http://127.0.0.1:4318` + Vite `http://127.0.0.1:5174`
- Revision / HEAD SHA: `7a4334b` + working tree on `feature/core-engine`
- Timestamp: 2026-07-06T10:55:00Z
- Target URL / public entry: `http://127.0.0.1:5174`
- Test depth: Level 3
- Subagent attempt: not spawned
- Subagents used: none
- Fallback reason: current subagent tool policy says not to spawn subagents unless the user explicitly asks; main agent performed a separate black-box Playwright pass after automated tests and smoke passed
- Result: PASS

## Scenarios

- [PASS] Settings Project Docs Scan mode separation. Steps: open Settings at 1440x900. Expected: filename mode and folder full-scan mode are visibly separate. Actual: `Project Docs Scan：特定檔名`, `Project Docs Scan：資料夾全掃描`, and `新增相對資料夾` were visible.
- [PASS] Project Docs folder picker is exposed only on folder full-scan rows. Steps: open Settings -> Projects. Expected: folder full-scan row has a `選擇資料夾` button; filename rows do not. Actual: desktop DOM check returned `projectDocFolderButtons: 1` and `filenamePickers: false`.
- [PASS] Project Docs folder picker does not fake success in Web dev runtime. Steps: click the folder full-scan `選擇資料夾` button in browser dev runtime. Expected: truthful unsupported message because only Tauri can return a macOS folder path. Actual: page showed `目前 Web dev runtime 無法回傳 macOS 絕對路徑；請先手動貼上路徑。`.
- [PASS] Comments forced category filters. Steps: open Workspace -> 備忘錄留言. Expected: All, Global, Project, Pinned, UI/UX, Bug, Feature, Info filters and no 未分類 filter. Actual: all expected filters present; 未分類 count was 0.
- [PASS] Kanban redundant generated card suppression. Steps: open Workspace -> Kanban 看板. Expected: old generic `收斂目前未提交變更` card is not visible. Actual: visible count was 0.
- [PASS] Docs scan context. Steps: open Workspace -> 專案 Docs. Expected: doc cards expose scan-mode badge, or empty state tells user to configure filename/folder scan. Actual: mode badge or folder/filename empty guidance was present.
- [PASS] RWD / overflow. Steps: check Settings at 1440x1000 and 390x844. Expected: no horizontal overflow. Actual: desktop and mobile overflow checks were both false; mobile returned `scrollWidth=390`, `viewport=390`, `hasOverflow=false`.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
- Commands / artifacts:
  - `npm test` -> 49 passing tests
  - `npm run build` -> Vite production build passed
  - Playwright desktop DOM check returned `{ "width": 1440, "viewport": 1440, "hasOverflow": false, "projectDocFolderButtons": 1, "filenamePickers": false }`
  - Playwright mobile DOM check returned `{ "width": 390, "viewport": 390, "hasOverflow": false, "folderButtons": 4, "folderScanInput": true }`
  - Core runtime status in Settings showed Contract `v5`, Port `127.0.0.1:4318`
- Console errors: 0
- Network/API errors: none observed in smoke path

## Findings

- Severity: none
- Reproduction steps: none
- Expected: n/a
- Actual: n/a

## Residual Risk

- Native macOS folder dialog selection itself is only available in Tauri runtime; browser dev runtime verifies the button and truthful unsupported fallback, while relative path conversion is covered by unit tests.
- Existing persisted docs can only be labelled by matching current folder settings against doc names; older docs scanned before folder rules may still appear as filename-scan unless their path matches a configured folder.
