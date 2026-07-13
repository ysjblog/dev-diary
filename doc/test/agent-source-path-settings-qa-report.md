# QA Black-Box Report

- Environment: localhost Vite UI + fresh Core runtime
- Revision / HEAD SHA: `fbdc89f`（QA 時功能變更尚未 commit）
- Timestamp: 2026-07-12 Asia/Taipei
- Target URL / public entry: `http://127.0.0.1:5173` → CLI Agents
- Test depth: Level 3 — Runtime smoke + Black-box QA required
- Subagent attempt: yes
- Subagents used: `sol` read-only QA reviewer
- Fallback reason: 初輪 QA 找到 mobile overflow；修正後由主 agent 以同一個 read-only scenario 重測，`sol` 再確認 geometry。
- Result: PASS

## Scenarios

- [PASS] Core integration / API loading：fresh Core 後 `/api/health`、`/api/settings`、`/api/agents/detect` 皆為 200。
- [PASS] Desktop canonical source controls：1440×900 的 Claude Code card 清楚分為「CLI 執行檔」與「活動記錄資料夾」，包含手動輸入、picker、probe/save、reset 與三種 log mode controls。
- [PASS] Claude Core readonly mapping：顯示 product root、project root 到 Core-derived current/legacy encoded locations；沒有 editable encoded-folder input。
- [PASS] Browser console / network：fresh-Core pass 的 browser console 為 0 errors / 0 warnings；相關 GET 成功。
- [PASS] Mobile RWD：390×844 下展開 Claude executable/activity sections 後，viewport `390 = 390`，card `245 = 245`，兩個 details `203 = 203`（clientWidth = scrollWidth），沒有 horizontal overflow。
- [PASS] Packaged Tauri smoke：debug DMG 可 mount；`DevDiary.app` 可啟動；停止 dev Core 後，packaged app 自行在 loopback 4317 啟動 Core，`/api/health` 回 `devdiary-core` contract 5。

## Evidence

- Screenshots: `/tmp/codex-ui-shot-df89aa9b86f2.png`（fresh Core、390×844 mobile）。
- Commands / artifacts: Playwright snapshots、`npm run package:mac:debug`、DMG attach、fresh packaged Core `/api/health` smoke。
- Console errors: 0 errors / 0 warnings（fresh Core reload）。
- Network/API errors: 初輪曾有 stale-Core 502；重啟正確 Core 後重測為 200，未列為通過證據。

## Findings

- 初輪 mobile Claude mapping 造成 card overflow；已以 `minmax(0, 1fr)`、`min-width:0` 與 wrapping constraints 修正並重測通過。

## Residual Risk

- QA 未寫入真實使用者 source settings；targeted API 的 probe/save、mode persistence 與 409 conflict 由 isolated Core integration tests 覆蓋。
