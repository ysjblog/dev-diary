# Delta Spec: Antigravity CLI And Project Root Scan

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Project root discovery：Core 可從 configured root folders 掃描可追蹤 project folders，將真實 project roots upsert 到 SQLite `projects`。
- Dev/test default roots：本機開發模式可使用 `~/Projects` 與 `~/Workspace/side-projects` 作為 default scan roots，正式 persistent runtime 可用 `DEVDIARY_PROJECT_ROOTS` 明確設定。
- Antigravity CLI parser：解析 `~/.gemini/antigravity-cli/log/*.log` 的 workspace / model / conversation metadata，產生 `antigravity-cli` sessions。
- Antigravity transcript presence check：若 `brain/<conversationId>/.system_generated/logs/transcript*.jsonl` 存在，parser 用其 timestamps 強化 start/end time，但不持久化 raw transcript。
- Runtime smoke：Core API 可在本機對 discovered projects 執行 `/api/scan`，並回傳 project list / dashboard snapshot。

## 修改（Changed）

- `runManualScan` 可選擇先執行 project root discovery，再對更新後的 eligible projects 掃描 CLI logs。
- `createServer` 可接收 configured project roots，讓 app runtime 的 global scan 路徑可掃描目前兩個本機 root folders。
- CLI log provider 從 Claude Code / Codex CLI 擴充到 Antigravity CLI。
- `MASTER.md` 更新 Manual Scan / CLI log parser 狀態，Antigravity parser 不再標為未完成；目前 glog / transcript metadata 可建立 sessions，但 token usage 仍可能因來源缺欄位而為 0 / low confidence。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- 受影響的模組：Core scan service, project discovery service, CLI parser provider, Core server options, Core startup, scan tests, parser tests, specs, doc/test。
- MASTER.md 需更新的區塊：目前實作狀態、Manual Scan / Project Rescan、CLI log parser、prototype-only 行為、Open Questions、變更歷史。

## 驗收條件

- [x] Global scan 可從 `~/Projects` 與 `~/Workspace/side-projects` 發現 git/project folders 並 upsert 到 `projects`。
- [x] Repeated project discovery / scan 不重複建立 projects 或 sessions。
- [x] Antigravity CLI log parser 可從 workspaceDirs / conversation metadata 建立 `antigravity-cli` session。
- [x] Antigravity parser 不持久化 prompt、response、thinking、raw transcript 或 credentials。
- [x] API smoke 對 local runtime 執行 `/api/scan` 後，可看到 discovered projects 與 Antigravity scan records。
