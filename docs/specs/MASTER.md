# DevDiary — MASTER 系統現況

> 唯一的系統現況文件。任何新 session 讀此檔即可上手，不需讀完整對話歷史。
> 詳細需求規格見 `docs/specs/dev-diary-macos-app.md`（Review Level 3, converged）。
> Last updated: 2026-07-11

## 產品

自動開發日記（DevDiary）：local-first macOS desktop app，自動收集、整理、視覺化使用者透過 CLI coding agent（Claude Code / Codex CLI / Antigravity CLI）開發時產生的紀錄。AI coding activity dashboard + project development diary + local token/session analytics。

## 目標架構（spec §6）

- Desktop shell：Tauri（Rust）
- UI：React
- Core Engine：Node.js / TypeScript
- Core ↔ UI：Local HTTP API（僅本機，不對外）
- 儲存：SQLite + app data folder（`~/Library/Application Support/DevDiary/`）
- 打包：Tauri 原生、最終完整 ad-hoc seal 的 GitHub Release DMG；使用者透過右鍵 Open 或 Privacy & Security 手動允許，不需要 Developer ID

邊界：React UI 不可直接讀 project folder、解析 log、讀寫 SQLite 或執行 mutating 指令；一律經 Core API。對 project folder 永遠 read-only。

## 目前實作狀態

| 模組 | 狀態 |
|---|---|
| 需求 spec | ✅ converged（L3 review） |
| React UI（mock 資料） | ✅ 已從 Open Design 移植，可 `npm run dev` 執行 |
| TypeScript Core Engine | ✅ Core services、scan/parser、settings、scheduler、exports、custom agent safe probe 與 runtime manifest lifecycle 已完成 |
| Local HTTP API | ✅ `/api/health` 已回報 runtime identity / contract version / capabilities；Core dev runtime 可在 preferred port 被佔用時改綁後續 loopback port，並寫入 redacted runtime manifest 供 Vite dev proxy discovery；另有 `/api/dashboard`、`/api/projects`、`/api/projects/:id`、`POST /api/scan`、`POST /api/projects/:id/scan`、`GET/PATCH /api/settings`、custom agent probe/write routes、scheduler preflight/run routes、export routes（loopback-only, Express） |
| SQLite schema / 儲存 | ✅ schema + deterministic seed 完成（projects/sessions/token_usage/daily_logs/comments/kanban/project_docs/app_settings）；Core startup 預設使用 `~/Library/Application Support/DevDiary/DevDiary.sqlite`；`custom_agents` 持久化於 app settings；`kanban_cards.status_locked_by_user` 會保護使用者手動移動過的卡片狀態 |
| Dashboard 聚合（§10） | ✅ 單一 snapshot 驅動 metric/mix/trend/project concentration；range-based ranking 與不跟 range 連動的 latest-26-week heatmap window 已接；Core/root tests + runtime smoke |
| Workspace 聚合（§11） | ✅ `getProjectList` + ranged `getProjectDetail` snapshot（metric strip/kanban/diary/token detail/sessions/comments/docs/git status）+ Workspace comments/Kanban/project summary/daily diary write paths；Workspace `active` / `idle` 顯示由最近 5 個日曆日 session 推導，不提供手動狀態切換，legacy `paused` 不會外露到前端；點選 daily diary block 可載入左側 editor 並寫回該日 `daily_logs.per_project_summary`，已持久化 daily markdown 原樣回傳、不再自動增生日期標題/session 統計；Kanban UI 會隱藏低訊號 auto-synth 重複卡，auto synthesis 以 mixed rules 產生 explicit TODO / in-progress / done cards，手動移動過的卡片會顯示鎖定標示且不再被自動調整進度，Comments 以 Global / UI/UX / Bug / Feature / Info 等強制分類篩選 |
| Manual Scan / Project Rescan | ✅ Core endpoint + React button wiring 已完成；runtime 預設使用 persistent SQLite + CLI log provider；app-facing Settings 固定真實 CLI logs 且不做 fake fallback；底層 deterministic mock provider 只供測試或明確 provider injection；global scan 可先從 configured roots upsert project folders |
| CLI log parser（Claude/Codex/Antigravity） | ✅ Claude Code / Codex CLI JSONL parser provider 已接入 scan contract 並成為 default scan provider；Antigravity CLI glog / transcript metadata parser 已可建立低信心 sessions，token 欄位仍可能為 0 並清楚保留 experimental/低信心語意 |
| AI Diary Agent + fallback | ✅ Workspace summary regenerate 已接 Core Diary Agent contract；default diary agent 為 enabled `antigravity-cli` 時會透過 Node `execFile` argv 執行 `agy --print` 並取得 Markdown draft；default diary agent 也可指向 configured local Ollama custom agent，透過 loopback `/api/generate` 使用 selected model（例如 `qwen3.6:27b`）產生 Markdown draft；失敗/逾時/disabled 會寫 deterministic fallback draft；Core in-app daily scheduler 已可每日產生白話 global daily highlight、刷新 project AI drafts、同步 Kanban synthesis，並在 Run now 回傳分層 preflight 狀態 |
| UI 接 Core API（取代 mock） | ✅ Dashboard 全頁 + sidebar 24h 已接；Dashboard AI Global Summary List 改讀 Core `daily_highlights` 並移除固定 mock；Projects Workspace 讀取路徑與主要寫入路徑已接（comments、Kanban status、summary override / AI draft、daily diary entry）；Logs 清除日期會回 project summary；Docs preview 已改大型 rich Markdown modal；Settings UI 已接 `GET/PATCH /api/settings`、Local HTTP API runtime status/stale warning、daily scheduler 設定/Run now、Markdown daily export、redacted structured backup、project docs filename allowlist、AI prompt overrides；CLI Agents 頁已接 settings enabled toggle、Core safe agent detection、custom agent safe probe/persist、default diary agent selector、agent model/reasoning preferences；first-launch onboarding 已接 Core settings/detection/scan |
| Tauri shell + 打包 | ✅ Tauri shell 可啟動 loopback Core 並在 quit 後清理 process；正式 `npm run package:mac` 使用 Tauri `--no-sign` 加 staging DMG 的最終完整 ad-hoc seal，含 Applications drag-install DMG、quarantine 診斷與 GitHub workflow；LaunchAgent 不會改寫 bundle；使用者首次開啟需手動允許 |

## 已知 prototype-only 行為（正式實作須修正，spec §15）

- Dashboard 隨機 heatmap intensity / 隨機點擊明細 → 須 deterministic、data-backed。
- Custom date range 用 proportional mock 常數 → 須聚合 persisted 資料。
- Dashboard 與 Workspace range state 已拆分；Workspace selected-project range 已接 Core ranged snapshot。
- Manual Scan / Project Rescan 已改走 Core API，且 repeated scan 以 stable source identity 去重；CLI provider 可解析 Claude Code / Codex CLI JSONL 與 Antigravity CLI glog / transcript metadata；app-facing runtime 無 matching logs 時不寫 mock records。
- Project root discovery 已可從 configured roots upsert app-owned `projects` records；`npm start` 預設使用 persistent SQLite path；persistent 與 in-memory runtime 都只會掃明確設定的 `DEVDIARY_PROJECT_ROOTS`，不提供 repository 內的私人路徑 preset。
- Settings backend 已可用 `GET/PATCH /api/settings` 持久化 project roots、excluded paths、project docs filename allowlist、project docs folder full-scan rules、scan interval、default diary agent、agent model/reasoning preferences、AI prompt overrides、privacy、appearance、data storage desired path、scan provider policy 與 agent enabled state；`/api/scan` 會使用 persisted project roots 與 docs allowlist/folder rules。
- Settings UI 已使用 Core settings snapshot 作為來源；React 只送 structured settings patch，不直接讀 SQLite、掃 project folders 或執行 configured path；agent enable/disable、model/reasoning 與 default diary agent 選擇集中在 CLI Agents 頁，避免 Settings 重複顯示同一組 agent controls。
- Settings page 已重排為 Core runtime status-first 分組：頁首只保留不可編輯的 Runtime 狀態；Daily Scheduler、Storage 與其他可編輯設定集中在下方分組，不顯示不可互動的 capability chips。
- Settings page 已新增子頁籤：Projects、Prompts、Automation、Preferences、Storage；Prompts 顯示 AI-generated content 的可編輯 prompt defaults；path-like settings 改為一列一個值並提供 add/remove/folder-picker entry controls。
- CLI Agents page 頁首可選 default diary agent；每個 agent card 可設定 model / reasoning。Canonical agent 使用 built-in model list；custom agent 可保存本機模型 tag（例如 Ollama `qwen3.6:27b`）。
- AI regenerate 已在 Workspace 寫入路徑切片改為 Core Diary Agent draft + 明確 accept-new-draft；Antigravity CLI adapter 目前保留 deterministic fallback，不得因 provider 失敗阻斷手動 summary flow；其他未接後端區塊若有類似 prototype 行為仍不得沿用。
- Workspace daily diary editor 已可針對單日寫入 `daily_logs.per_project_summary`；project-level `project_summaries` 仍代表整體專案摘要，不等同單日 diary entry。
- Workspace daily diary 日期選擇會同步左側 daily editor context；daily save/regenerate refresh query 會鎖定該日期 single-day range，避免非今日操作落回 server today / Workspace today range；date-scoped diary prompt 只餵該日期 sessions/tokens/commits/當日相關 Kanban，並省略 current-only Git working-tree status。
- Daily scheduler 是 Core process 內的 in-app scheduler；啟用後依 Asia/Taipei run time 每日最多自動跑一次，也可由 Settings 手動 Run now；Run now 會回傳 Core / scheduler / agent detection / scan provider preflight；Core interval 偵測 sleep-like long gap 後會記錄 recovery tick 並立即補一次 scheduler tick。另新增 macOS per-user LaunchAgent background runner，讓 app 完全關閉時仍可依 `scan_interval_minutes` 讀取最新 settings 週期性執行 scan；AI diary 只在 `daily_scheduler.run_time_local` 到達且當天尚未 success 時產生。**kanban AI 自動加卡同樣只在此一天一次的 daily scheduler 排程內執行(受 `daily_scheduler.enabled` + `run_time_local` 控管);background cycle 不再每輪獨立呼叫 agy 產卡** —— 舊行為會每 `scan_interval_minutes` × 每專案各叫一次 agy，一天上千次把 Antigravity 配額燒光(見 `deltas/background-kanban-ai-quota-fix-delta.md`)。單一專案即時重新整理 AI 看板卡仍可由 `POST /api/projects/:id/kanban/ai-sync` on-demand 觸發。Packaged app startup 會自動安裝 / 更新 LaunchAgent，不需使用者手動執行 npm script。
- Token 表顯示估算成本（cost）→ v1 須隱藏（cost calculation 是 Non-Goal）。
- Markdown daily export 已由 Core API 產生，支援 user override 優先、token/session summary、optional comments 與 secret-like redaction；redacted structured backup 已接，仍不提供 raw SQLite DB dump。
- Settings 會讀 `/api/health` 顯示目前 UI 經 Vite proxy 連到的 Core runtime port、contract version、capabilities 與 stale/unreachable 狀態；dev mode 的 Vite proxy 會優先使用 `DEVDIARY_CORE_URL`，再讀 Core runtime manifest，最後才 fallback 到 `127.0.0.1:4317`；route 404 會轉成「Core runtime 可能是舊版」的白話錯誤，避免誤判為 Antigravity CLI 本身壞掉。
- Manifest 生命週期已 hardening（dev runtime）：Core 啟動 bind port 前會檢查既有 manifest，pid 已死則記錄 reclaim 訊息再覆寫、pid 仍存活但非自己則記錄 warning（交由 dynamic port fallback 共存）；Vite dev proxy 解析 target 時，若 manifest 帶有已死的 `runtime.pid` 會視為 stale 並退回 legacy port（無 pid 的 manifest 維持向後相容），unreachable Core 仍回固定的 `502 core_unreachable` JSON。
- 「儲存至 SQLite」「守護進程 / daemon」等文案 → 改為 Core API / in-app scheduler；raw `.db` 完整匯出維持 v1 out of scope。

## 變更歷史（delta 索引）

- `deltas/background-kanban-ai-quota-fix-delta.md` — 移除 background cycle 每輪重複的 kanban AI，改由 daily scheduler 一天一次（implemented, branch fix/devdiary-background-agy-quota）

- `deltas/ui-scaffold-delta.md` — UI 移植骨架（implemented）
- `deltas/core-engine-dashboard-delta.md` — Core Engine + Dashboard 聚合 API（implemented, branch feature/core-engine）
- `deltas/dashboard-wiring-delta.md` — Dashboard 接 Core API snapshot（implemented, branch feature/core-engine）
- `deltas/workspace-wiring-delta.md` — Projects Workspace 讀取路徑接 Core API（implemented, branch feature/core-engine）
- `deltas/workspace-active-idle-session-window-delta.md` — Workspace active/idle 由最近 5 個日曆日 session 自動推導，無手動狀態切換（implemented, branch feature/core-engine）
- `deltas/git-status-wiring-delta.md` — Workspace Git Status 接 Core read-only snapshot（implemented, branch feature/core-engine）
- `deltas/workspace-write-paths-delta.md` — Workspace comments / Kanban status / summary override 寫入路徑接 Core API（implemented, branch feature/core-engine）
- `deltas/workspace-range-state-delta.md` — Dashboard / Workspace range state 拆分與 Workspace selected-project ranged snapshot（implemented, branch feature/core-engine）
- `deltas/scan-now-project-rescan-delta.md` — Manual Scan Now / selected-project rescan Core endpoint 與 UI wiring（implemented, branch feature/core-engine）
- `deltas/cli-log-parser-delta.md` — Claude Code / Codex CLI JSONL parser provider 接入 scan contract（implemented, branch feature/core-engine）
- `deltas/scan-provider-runtime-delta.md` — Scan provider runtime default 與 fallback policy（implemented, branch feature/core-engine）
- `deltas/antigravity-project-scan-delta.md` — Project root discovery 與 Antigravity CLI metadata parser（implemented, branch feature/core-engine）
- `deltas/persistent-db-runtime-delta.md` — Persistent SQLite startup default 與 local project roots preset scripts（implemented, branch feature/core-engine）
- `deltas/settings-backend-delta.md` — Settings backend persistence and `GET/PATCH /api/settings`（implemented, branch feature/core-engine）
- `deltas/settings-ui-delta.md` — Settings UI wiring to `GET/PATCH /api/settings`（implemented, branch feature/core-engine）
- `deltas/codex-scan-heatmap-fix-delta.md` — Codex token usage parsing and Dashboard heatmap calendar layout fix（implemented, branch feature/core-engine）
- `deltas/settings-dashboard-polish-delta.md` — Settings real-log-only policy and Dashboard chart/readability polish（implemented, branch feature/core-engine）
- `deltas/ai-diary-agent-delta.md` — Core Diary Agent + Antigravity adapter attempt/fallback and Dashboard trend bottom alignment（implemented, branch feature/core-engine）
- `deltas/settings-agent-detection-daily-scheduler-delta.md` — Core safe agent detection、Settings scheduler controls、in-app daily scheduler（implemented, branch feature/core-engine）
- `deltas/export-backup-delta.md` — Markdown daily export 與 redacted structured backup（implemented, branch feature/core-engine）
- `deltas/local-api-runtime-discovery-delta.md` — Core runtime identity / Settings stale runtime detection（implemented, branch feature/core-engine）
- `deltas/dynamic-core-port-discovery-delta.md` — Core dev runtime dynamic port fallback 與 Vite manifest discovery（implemented, branch feature/core-engine）
- `deltas/core-runtime-lifecycle-hardening-delta.md` — Manifest stale/reclaim 生命週期 hardening（startup reclaim + dev proxy 跳過 dead-pid manifest）（implemented, branch feature/core-engine）
- `deltas/kanban-auto-synthesis-delta.md` — Core 依 session/git 自動建立並定期更新每專案 kanban 卡片（implemented, branch feature/core-engine）
- `deltas/daily-ai-highlight-plain-language-delta.md` — 每日 AI 重點改白話敘事（取代計數式文案）+ Dashboard summary panel 接 Core 真實資料（implemented, branch feature/core-engine）
- `deltas/scheduler-preflight-recovery-delta.md` — Daily scheduler Run now preflight 分層狀態與 Core wake/recovery tick（implemented, branch feature/core-engine）
- `deltas/tauri-packaging-delta.md` — Tauri shell 與 unsigned macOS `.app` / `.dmg` 打包（implemented, branch feature/core-engine）
- `deltas/macos-signed-release-distribution-delta.md` — 最終 ad-hoc seal、Tauri native DMG、Applications drag-install DMG、LaunchAgent bundle-write fix 與 GitHub Release workflow（merged；clean second-Mac download click 待補 QA）
- `deltas/public-repository-privacy-scrub-delta.md` — 公開 repository 移除私人 paths／identifier、改採 sanitized snapshot publish（implementing）
- `deltas/app-startup-auto-scan-delta.md` — Packaged app 啟動後 Core startup retry 與已設定 roots 的自動掃描（implemented, branch feature/core-engine）
- `deltas/custom-agent-safe-probe-delta.md` — Custom Agent Core safe probe、persistence、enable/disable/remove 與 browser/RWD 驗證（implemented, branch feature/core-engine）
- `deltas/onboarding-core-backed-delta.md` — First-launch onboarding 接 Core settings/detection/scan 並完成 browser/RWD 驗證（implemented, branch feature/core-engine）
- `deltas/workspace-diary-docs-token-hardening-delta.md` — Daily diary edit/write path、project docs allowlist scan、Global comments、Kanban drag reliability、Claude underscore path token parser 修正（implemented, branch feature/core-engine）
- `deltas/settings-daily-diary-usability-delta.md` — Settings 頁面重排與 daily diary 舊日期 regenerate refresh range 修正（implemented, branch feature/core-engine）
- `deltas/settings-ai-prompts-path-controls-delta.md` — Settings 子頁籤與 prompt/path controls、CLI Agents model/reasoning/default diary agent、Ollama diary provider（implemented, branch feature/core-engine）
- `deltas/app-icon-refresh-delta.md` — DevDiary orbit logo icon refresh and packaged app smoke verification（implemented, branch feature/core-engine）
- `deltas/background-launchagent-runner-delta.md` — macOS app 關閉時由 LaunchAgent 啟動 background runner，依 settings interval 執行 scan，依 daily scheduler time 執行 AI diary，並由 packaged app startup 自動安裝（implemented, branch feature/core-engine）
- `deltas/workspace-kanban-comments-docs-scan-delta.md` — Workspace Kanban 去重/低訊號卡隱藏、Comments 強制分類 filter、Project Docs filename/folder scan controls（implemented, branch feature/core-engine）
- `deltas/kanban-hybrid-status-lock-delta.md` — Kanban mixed status rules、explicit TODO signals、manual status lock badge（implemented, branch feature/core-engine）
- `deltas/kanban-ai-suggested-cards-delta.md` — AI auto-added Kanban cards strict JSON contract、Core validation gates、manual lock safeguards（implemented, branch feature/core-engine）
- `deltas/kanban-doc-folder-settings-regression-delta.md` — Project Docs folder picker 相對路徑 regression、Kanban stale route 404 guidance、`kanban.ai-sync` runtime capability gate（implemented, branch feature/core-engine）

## Spec / Delta 流程備註

- `docs/specs/dev-diary-macos-app.md` 是目前大功能的 feature spec；已在 Review Level 3 收斂。後續若只是同一個 app 範圍內的修正、hardening、UI wiring、測試補強或可局部驗收的行為調整，使用 `docs/specs/deltas/*.md` 記錄即可。
- 若新增的是跨 2+ 模組的新使用者流程、新 API endpoint、新資料 contract、新 background/scheduler 執行模式、AI 自動寫入路徑，或會讓使用者操作方式明顯改變，開發前要先判斷是否需要獨立 feature spec；即使最後選擇 delta，也要在 delta 內寫明 review level / safety boundary / test depth。
- `MASTER.md` 是 current-state index，不複製完整 delta 內容；每個完成 slice 收尾時至少要更新 Last updated、變更歷史狀態、目前實作狀態或已知缺口，避免新 session 只讀 `MASTER.md` 時拿到過期現況。
- Spec review router 對純 `MASTER.md` / delta bookkeeping 可 Level 0；但 cross-module、state/data-layer、scheduler/background、AI output、auth/permission/secrets、或 repeated regression 類 delta 不應只靠 Level 0。Level 2+ 應嘗試 reviewer subagent；若平台或 budget 不允許，需在 review-state 寫明 fallback reason，並改用本地 fact inventory / lens review 補足。
- Commit 前 reconciliation scan：`find docs/specs -maxdepth 1 -type f -name '*.md' ! -name 'MASTER.md' | sort` 與 `find docs/specs/deltas -type f -name '*.md' 2>/dev/null | sort`，再確認所有已驗收 delta 的 `Status` 與 `MASTER.md` 索引一致。

## 已知缺口（後續 hardening）

- **Kanban 文案品質**：v1 以 deterministic mixed rules 從 explicit TODO signals、recent sessions、recent commits 合成卡片；agent-authored card copy 需等嚴格 JSON contract 後再開。
- **AI auto-added Kanban cards**：strict JSON contract、Core validation / redaction / confidence / status-lock gates、Settings opt-in、manual sync 與 scan/scheduler/background runner integration 已完成；real provider 長時間 soak、配額/timeout telemetry 與更細緻的使用者審核策略留待後續 hardening。
- **Packaged app lifecycle**：Tauri shell 會啟動 bundled Core source + `core/node_modules` 並由 UI 指向 loopback Core；GitHub Release 以 Tauri `--no-sign` 先產生完整 resources，再加上最終 ad-hoc bundle seal，讓 Gatekeeper 走未知開發者的手動允許流程；Developer ID/notarization 可在日後另行啟用；完全免 Node 的 native sidecar 留待後續 hardening。
- **OS-level catch-up**：Core process 內 scheduler 已有 sleep/recovery tick；LaunchAgent background runner 已補上 app 完全關閉期間的 interval-based scan 與 daily-time AI diary 寫入，且 packaged app startup 會自動安裝 / 更新 LaunchAgent。仍待長時間本機 soak。
- **Cost / raw DB export**：Token Detail 仍不顯示 estimated cost；redacted structured backup 已完成，raw SQLite dump 與 cost calculation 維持 Non-Goal。

## 已關閉 / Deferred Open Questions（spec §18）

- Antigravity token usage 欄位尚未在目前可讀 metadata 中穩定確認；現階段 parser 以 glog workspace/model/conversation + transcript timestamps 建立低信心 sessions。
- Antigravity CLI direct shell `agy --print` 與 Core Node `execFile` hot path 目前都可產生 Markdown diary；daily scheduler run-now 已接，長期 scheduler-grade reliability 仍需 Tauri app lifecycle / sleep recovery 驗證。
- Local HTTP API 已有 runtime identity / port visibility / stale-runtime detection；dev mode 已有 Core dynamic port fallback 與 Vite manifest discovery；Tauri shell packaged runtime 預設啟動 loopback Core 並由 UI 直連 `127.0.0.1:4317`。
- App scheduler 在 macOS 睡眠後會由 Core recovery tick 補一次；app 完全關閉期間可由 per-user LaunchAgent background runner 持續依 settings interval 掃描，並依 daily scheduler time 每日寫 diary。
