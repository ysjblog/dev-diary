# Delta Spec: CLI Log Parser Scan Provider

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Core CLI log parser provider：讀取 Claude Code 與 Codex CLI 本機 JSONL logs，轉成現有 scan endpoint 可持久化的 session candidates。
- Claude Code parser：支援 `~/.claude/projects/<escaped-project-path>/*.jsonl`，以 `sessionId`、`timestamp`、`cwd`、`message.model`、`message.usage` 產生 session、model 與 token usage。
- Codex CLI parser：支援 `~/.codex/sessions/**/*.jsonl` 與 `~/.codex/archived_sessions/*.jsonl`，以 `session_meta.payload.cwd/id/timestamp` 與 `turn_context.payload.model` 產生 session metadata；缺 token usage 時以 0 token 低信心 session 保存。
- Parser warning contract：malformed / dirty JSONL line 不會讓 scan crash，會回傳 parser warnings。
- Scan service provider injection：API 測試與未來 runtime 可指定 CLI log provider；deterministic mock scanner 保留為 dev/test fallback。
- `doc/test/cli-log-parser.md` 記錄 Level 3 測試與 smoke criteria。

## 修改（Changed）

- Manual scan persistence 接受 parser warnings，並維持 transaction rollback 與 source identity 去重。
- `POST /api/scan` / `POST /api/projects/:id/scan` 可透過 Core server option 使用 CLI log provider，回傳 scan status 與 refreshed snapshots。
- `MASTER.md` 將 CLI log parser 狀態更新為 Claude/Codex parser provider 已接入、Antigravity experimental 待後續穩定。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- 受影響的模組：Core scan service, CLI parser adapter, Express server test injection, Core tests, specs, doc/test。
- MASTER.md 需更新的區塊：目前實作狀態、Manual Scan / Project Rescan、CLI log parser、變更歷史、Open Questions。

## 驗收條件

- [x] 已確認 Claude Code 與 Codex CLI 的本機 log 路徑與關鍵欄位；Antigravity 標記 experimental。
- [x] Parser 能輸出穩定 `source_log_ref`，並接入 `runManualScan` provider。
- [x] Repeated scan 不重複新增 sessions/token_usage/daily_logs/Kanban。
- [x] Dirty / malformed JSONL 不 crash，會產生 warning。
- [x] Core tests 覆蓋 parser 與 scan integration。
- [x] API smoke 能證明 scan endpoint 寫入 parsed records。
- [x] UI build 維持通過；本切片不改 UI，RWD 截圖不列為新增 gate。
