# Delta: Core Engine + Dashboard Aggregation API

> Feature: TypeScript Core Engine 後端地基（SQLite + Local HTTP API + Dashboard 聚合）
> Base spec: `docs/specs/dev-diary-macos-app.md`（§6 架構、§7 資料模型、§10 Dashboard）
> Branch: `feature/core-engine`
> Date: 2026-06-28
> Status: implemented（後端 slice，含測試與 runtime smoke；UI 尚未接上）

## 新增 (Added)

- `core/`：獨立的 TypeScript Node.js Core Engine 專案（package.json / tsconfig）。
- `core/src/domain/types.ts`：canonical 資料模型型別（spec §7：Project / KanbanCard / Session / TokenUsage 及 Dashboard 衍生型別 §7.3.1–§7.3.4）。
- `core/src/domain/agents.ts`：canonical agent id、display name、color key 與 alias 正規化（spec §7.9：`claude/codex/agy` → canonical）。
- `core/src/domain/dateRange.ts`：range 解析與日期 canonicalization（spec §10：驗證、反轉日期校正、all-time 空值）。
- `core/src/db/schema.ts` + `index.ts`：SQLite schema 與開啟 / migrate（projects、kanban_cards、sessions、token_usage、daily_logs、comments）。
- `core/src/db/seed.ts`：deterministic seed（seeded LCG，無 `Math.random`；sessions 為唯一來源，token_usage 由其聚合，counts 與 totals 不會打架）。
- `core/src/services/dashboard.ts`：單一 aggregate snapshot 產生器，metric / agent_mix / trend / heatmap 全部讀同一 selected range（spec §10）。heatmap intensity 由 token 為主、session 次之、task 再次之 deterministic 推導。
- `core/src/server.ts` + `index.ts`：Express Local HTTP API（loopback-only），`/api/health`、`/api/dashboard`、`/api/projects`。
- `core/test/*.test.ts`：20 個 vitest 測試（日期 canonicalization、determinism、跨圖表一致性、空 range、反轉日期、blocker/warning/unconfirmed 計數）。

## 修改 (Modified)

- MASTER.md 狀態表：Core Engine / Local HTTP API / SQLite / Dashboard 聚合 由 ⬜ 改為部分完成。

## 移除 (Removed)

- 無。

## 修正的 prototype-only 行為（對照 spec §15）

- Dashboard 隨機 heatmap → 改為 deterministic、data-backed（spec §15.18）。
- custom range proportional mock → 改為聚合 persisted token_usage（spec §15.17）。
- donut / breakdown / metric / trend / heatmap 改為共用同一 selected-range snapshot（spec §10）。

## 尚未實作（後續 delta）

- 將 React Dashboard 由 mock 常數改 fetch `/api/dashboard`（含 loading / stale / error 狀態，spec §10 render order step 6）。
- Workspace selected-project range API（spec §11）。
- CLI log parser 取代 seed 資料（spec §8，需實機驗證 log schema）。
- Dashboard / Workspace range state 拆分（spec §15.19）— 屬前端工作。
- Tauri shell 啟動 / 停止 Core sidecar 與打包（spec §6.2）。

## 已知限制

- 目前資料來自 deterministic seed，非真實 CLI log；比例近似但非精確對齊 prototype（prototype 數字本為 mock）。
- Dev port 固定 4317（spec §6.3 port discovery 策略仍待確認）。
