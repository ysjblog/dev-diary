# Delta Spec: Settings Backend

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Core Settings backend：新增 app-owned settings persistence，供 React Settings / Agents 未來透過 Core API 讀寫。
- 新增 API：
  - `GET /api/settings`
  - `PATCH /api/settings`
- Settings snapshot 覆蓋第一版 backend scope：
  - `project_roots`
  - `excluded_paths`
  - `scan_interval_minutes`
  - `default_diary_agent`
  - `privacy`
  - `appearance`
  - `data_storage`
  - `scan_provider`
  - `agents`
- Global scan 會讀取 persisted `project_roots`，讓 Settings API 更新後不需重啟即可影響 `/api/scan` discovery roots。

## 修改（Changed）

- `createServer` 可接收 runtime metadata/default settings，讓 `/api/settings` 回傳 active DB path 與 startup fallback roots。
- SQLite schema 新增 app settings storage table；schema version 提升。
- `MASTER.md` 更新 Settings backend 實作狀態與 delta index。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- 受影響模組：Core schema, settings service, Core server routes, scan route project roots resolution, tests, docs。
- 不影響 React UI rendering；Settings UI 仍可先維持 mock，之後再接 Core API。
- 不 hot-swap 目前 process 的 SQLite connection；`data_storage.db_path` 在本 slice 中保存 desired path 並標記 restart required。
- 不執行 agent executable、shell command、Antigravity prompt、project mutation 或 Git mutation。

## 驗收條件

- [x] `GET /api/settings` 在 fresh DB 回傳 default settings 與 active runtime DB path。
- [x] `PATCH /api/settings` 可持久化 project roots、excluded paths、scan interval、default diary agent、privacy、appearance、scan provider policy、agent enabled/disabled。
- [x] Invalid settings payload 回 400，且不留下 partial writes。
- [x] Persisted settings 經 server restart 後仍存在。
- [x] `PATCH project_roots` 後，`POST /api/scan?range=all` 使用最新 persisted roots。
- [x] Settings backend 不寫 project folders、不執行 configured commands、不讀 credential content、不持久化 raw transcript/prompt/response/thinking。
