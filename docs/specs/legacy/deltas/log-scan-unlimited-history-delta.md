# Delta Spec: 日誌掃描無上限歷史紀錄（逐檔快取）

> PR: fix/log-scan-unlimited-history
> Date: 2026-07-15
> Status: merged

## 新增（Added）
- `core/src/services/logFileScanCache.ts`：新增 `FileScanCache` 介面與兩種實作：
  - `createInMemoryFileScanCache()`：進程內 Map 快取（測試 / 無 DB 情境用）
  - `createSqliteFileScanCache(db)`：以 SQLite 表 `log_file_scan_cache` 持久化快取
- `log_file_scan_cache` 資料表（`core/src/db/schema.ts`）：`PRIMARY KEY (agent_name, file_path)`，欄位含 `mtime_ms`、`payload_json`、`updated_at`；`SCHEMA_VERSION` 由 `4` 升至 `5`
- `core/test/logFileScanCache.test.ts`：涵蓋記憶體與 SQLite 兩種快取實作的命中 / 失效行為

## 修改（Changed）
- `core/src/services/cliLogParser.ts`：解析流程改為逐檔查快取 —— 若檔案 `mtime_ms` 與快取一致則直接複用已解析結果，不同才重新讀取解析；使全歷史掃描不必每輪重讀所有日誌檔
- `core/src/services/scans.ts`：`createConfiguredScanProvider()` 新增可選 `db` 參數，未顯式提供 `fileScanCache` 時，若有 `db` 則自動建立 `createSqliteFileScanCache(db)` 注入
- `core/src/services/backgroundRunner.ts`：`scanProviderFor()` 新增 `db` 參數，並在呼叫 `createConfiguredScanProvider` 時傳入，讓背景排程掃描共用同一份 SQLite 快取
- `core/src/server.ts`：對應更新呼叫端，補上 `db` 引數

## 移除（Removed）
- 無

## 影響範圍（Impact）
- 受影響的模組：CLI 日誌掃描（`cliLogParser`）、掃描 provider 組裝（`scans`）、背景排程（`backgroundRunner`）、DB schema
- MASTER.md 需更新的區塊：Data Model（新增 `log_file_scan_cache` 表）、Key Files & Modules（新增 `logFileScanCache.ts`）、Known Limitations（若原本記載「掃描受限於天數視窗」需移除或更新為已解除限制）

## 驗收條件
- [x] 相同 `mtime_ms` 的檔案再次掃描時不重新解析（單元測試覆蓋）
- [x] `mtime_ms` 改變時快取失效並重新解析
- [x] 實機驗證：目前本機 DevDiary project 實際解析到 129 sessions（Codex 110、Claude Code 14、Antigravity 5），時間跨度 2026-06-28 至 2026-07-15，無 parser warnings，未受原本天數視窗限制
- [x] PR 合併後同步更新 `docs/specs/MASTER.md` 並將本檔標記 `Status: merged`
