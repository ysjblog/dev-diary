# Delta Spec: Agent Runtime Reliability And Source-Path UI

> Branch: `codex/agent-source-path-settings-public`
> Date: 2026-07-13
> Status: implemented / verified
> Review: Level 3 — local CLI execution, SQLite shared persistence, background LaunchAgent, React state.

## 新增（Added）

- `GET /api/settings` 的 persisted `background_scan` snapshot：
  `{ last_started_at, last_completed_at, last_status, last_error, last_scanned_projects, last_inserted_sessions, next_interval_ms }`。
  `last_status` 僅能為 `idle | success | failed | skipped`；每次 background cycle 開始先寫 `last_started_at`，結束後依 scan / scheduler 結果寫入其餘欄位。`last_scanned_projects` 與 `last_inserted_sessions` 分別來自 cycle 的 `scan.scanned_projects.length`、`scan.inserted_sessions`；下一輪間隔來自有效 `scan_interval_minutes`。此為 runtime state，使用者 PATCH 不可直接改寫。
- Claude Code 成為可執行的 Diary Agent：以 `claude -p` print mode、固定 timeout、非 project working directory、`execFile(..., shell:false)` 執行既有 redacted structured prompt。DevDiary 不會檢視、讀取或記錄 credential；Claude CLI 本身仍可依其官方登入機制使用原生 credential。
- 每個 canonical Settings agent 回傳 `diary_capability: { supported, unsupported_reason }`。Claude 與 Antigravity 為 supported；Codex 是 `supported:false` 且原因為未實作 diary adapter。既有儲存為 Codex 的 default 值在讀取時遷移成 `null`，UI 顯示提示、不再送回未支援值。Custom agent 只有 enabled Ollama 才 supported。
- Workspace 未送出的 comment draft 使用 `devdiary:comment-draft:<project-id>` localStorage 儲存 `{ text, tag }`；malformed value 一律丟棄。只有 comment POST 成功（2xx）才清除該 project draft。

## 修改（Changed）

- Activity roots 嚴格沿用 `agents[].sources.activity_logs`（mode / `configured_data_roots`）儲存，並由 `source_status.activity_logs` 顯示；UI 僅提交 product data roots，`resolved_data_roots` 與 `derived_scan_locations` 永遠 read-only。
- CLI Agents 的 activity-log mode controls（自動＋自訂、只用自訂、恢復自動）置於「活動記錄資料夾」標題同列，顯示當前模式。custom roots 每列各有 input、folder picker、移除；底部只有一個「新增路徑」。
- Product data roots 與 Core 實際衍生掃描位置分組。衍生位置預設收合、可完整換行、不作 ellipsis；Claude 的 project mapping 也在衍生位置群組，不再混成另一種不明灰色路徑。
- 每個 `openDb()` connection 對 file-backed DB 設 `journal_mode=WAL` 與 `busy_timeout=5000`；`:memory:` 只設 busy timeout，不強制 WAL。僅 SQLite `SQLITE_BUSY` / `SQLITE_LOCKED` 會在 comment write route 映射為 `503 { error: 'database_busy', message }`；不做 UI POST/DELETE 自動 retry，避免沒有 idempotency key 時重複新增。UI 保留 draft 並顯示使用者可手動再試的白話訊息。
- Claude 僅供 project / daily diary 文字摘要；`createConfiguredKanbanAiGenerator` 明確在 Claude selected 時回傳 `null`，維持 Kanban strict-JSON 不會暗中切換到 Claude。
- packaged app setup 先掃描 `~/Library/LaunchAgents`：legacy plist 僅在同時符合以下所有條件才可清理：(1) Label 結尾為 `.devdiary.background` 且不是 current label；(2) `ProgramArguments` 的 launcher basename 是 `devdiary-background-launcher.sh`；(3) arguments 含固定 `run`；(4) plist 的 stdout 或 stderr path 位於 DevDiary app-data 的 `logs/`。逐一先以 plist path、再以該 Label `launchctl bootout`，只移除 plist symlink 本身（不追刪 target）、`launchctl print gui/<uid>/<label>` 必須 not-found，最後才 install / bootstrap / kickstart current label。不得在 public source 嵌入私人舊 identifier。
- LaunchAgent 的第一次 scan 固定延後 45 秒（可受限在 0–120 秒環境覆寫），避免 app startup 的 Core initialization 與 background scan 爭用 SQLite；後續仍由 settings interval 決定。
- app 開啟期間以固定 60 秒週期重讀 read-only dashboard/project-list/settings snapshot；不得呼叫 `applyProjectDetail(..., { resetEditor:true })`，不得覆寫未送出的 comment / daily diary editor。Settings polling 只合併 `background_scan` 等 runtime/read-only fields，絕不呼叫 `setSettingsForm` 覆寫 dirty form；若 snapshot revision 改變，顯示「有新設定，請重新載入」提示。切換 project 時先保存舊 project draft、再讀新 project draft；project 不存在時清除該 key。

## 移除（Removed）

- Activity root 的多行 textarea 與「新增一列／移除最後一列」操作。
- generic Core API 500 的 comment lock 錯誤，以及不具 idempotency 保證的 client retry。
- Codex CLI 作為可正常產生日記的可選項；它仍保有 executable / activity-log detection。

## Security / privacy boundary

- Claude argv、model alias、prompt 皆不經 shell；child env 只保留既有 allowlist、`HOME` 與必要 PATH，不能繼承 token 型環境變數。runner cwd 只能是 temporary DevDiary directory，永不使用 project root；error / log 不得輸出 prompt、credential 或 token。
- React 不自行掃描 filesystem；source roots 仍受 Core product-root validation。comment draft 只在本機 WebView storage，不能自動送 API。
- LaunchAgent migration 僅處理上述四項合取 predicate 的 DevDiary-owned legacy plist，其他使用者 LaunchAgent 不可碰。

## 驗收條件

- [ ] Claude default 時 project regenerate 與 daily scheduler 走安全 print-mode adapter；Codex disabled selection 的 migration / reason 可見；Kanban 沒有使用 Claude。
- [ ] Activity-root controls、逐列 picker / remove / add、三種 mode 與 product / derived 分組如上，desktop/mobile 均無截斷或重疊。
- [ ] background cycle 的 success / failed / skipped 都持久化 `background_scan` 並由 Settings 顯示；60 秒 snapshot refresh 不清除 comment / diary editor。
- [ ] comment concurrent lock 不回 generic 500；鎖定仍未解除時回 `database_busy` 503、原 draft 保留且不重複新增。
- [ ] legacy DevDiary background service 在新 LaunchAgent 前被移除，完成後僅 current label 可 loaded。
- [ ] Core tests/typecheck、UI tests/build、desktop/mobile smoke、safe runtime black-box QA、packaged app smoke 通過。
