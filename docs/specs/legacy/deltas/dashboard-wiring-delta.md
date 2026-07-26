# Delta: Dashboard Live API Wiring

> Feature: Dashboard 由 mock 改接 Core API snapshot
> Base spec: `docs/specs/dev-diary-macos-app.md`（§10 Dashboard render order）
> Branch: `feature/core-engine`
> Date: 2026-06-29
> Status: implemented（Dashboard metric/donut/breakdown/heatmap 已接線）

## 新增 (Added)

- `src/api/dashboard.js`：Dashboard API client（`fetchDashboard` + `toDashboardView` 映射）。
- Vite dev proxy `/api` → `http://127.0.0.1:4317`（`vite.config.js`）。
- Dashboard「全部」all-time 選擇器按鈕（spec §10 要求明確 all-time）。
- Dashboard loading / error 狀態列（不 fallback 到 client mock，spec §10 step 6）。

## 修改 (Modified)

- Dashboard metric 卡片、Agent Token donut、CLI 比例 breakdown、活躍熱力圖：全部改讀同一 selected-range Core snapshot。
- heatmap：由 `Math.random()` 改為 deterministic、data-backed（`intensity_level`、Claude-dominant 紫色變體），點擊顯示真實日期 / session / token / task。
- token 卡片 delta 改用 `metric.comparison_delta_percentage`；活躍 projects 改用 `metric.active_project_count`。
- `rangeData` / `agentMix` 由 mock IIFE 改為 snapshot 衍生（`useEffect` fetch，依 dashRange 變化）。

## 移除 (Removed)

- 死碼：`RANGE_DATA`、`RANGE_AGENT_MIX`、`computeRangeData`、`ALL_TIME_*` 常數。

## 修正的 prototype-only 行為（spec §15）

- §15.17 custom range proportional mock → 改為 Core 聚合 persisted 資料。
- §15.18 隨機 heatmap → deterministic、data-backed。
- Dashboard 所有圖表共用同一 range snapshot（spec §10）。

## 後續追加（2026-06-29）

- ✅ Token 趨勢圖改為 data-driven（`src/components/TrendChart.jsx`，吃 `DashboardTrendSeries`：total / Claude Code / Codex CLI / Antigravity CLI / other，spec §7.3.4）；toggle 補上 Codex CLI。
- ✅ Sidebar 24h 快速統計（Token / Projects / Sessions / 更新時間）改吃獨立 24h snapshot，移除 mock。

## 尚未實作（後續 delta）

- 手動 Scan Now 走 Core API（目前為 prototype 行為；尚無 scan endpoint）。
- Projects Workspace 接 `/api/projects` 與 per-project snapshot（spec §11）。
- Dashboard / Workspace range state 拆分（spec §15.19）。
- 手動 Scan Now 走 Core API（目前為 prototype 行為）。
