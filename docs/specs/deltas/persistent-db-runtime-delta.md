# Delta Spec: Persistent DB Runtime Default

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Core runtime config helper：集中解析 `DEVDIARY_DB`、`DEVDIARY_PROJECT_ROOTS` 與 macOS default app data SQLite path。
- Persistent DB default：未設定 `DEVDIARY_DB` 時，Core 預設使用 `~/Library/Application Support/DevDiary/DevDiary.sqlite`。
- SQLite parent directory creation：Core 開啟 file-backed DB 前會建立父資料夾。
- Project roots 明確設定：使用者透過 `DEVDIARY_PROJECT_ROOTS` 指定要掃描的目錄，不提供 repository 內的 local preset。

## 修改（Changed）

- `npm start` 不再預設使用 `:memory:`，因此 server restart 後 projects / sessions 會留在 persistent SQLite。
- Persistent runtime 未設定 `DEVDIARY_PROJECT_ROOTS` 時不自動掃私人本機 roots；正式 app / 其他電腦不會因預設值掃不存在或不屬於使用者的路徑。
- Explicit `DEVDIARY_DB=:memory:` 同樣只使用明確設定的 `DEVDIARY_PROJECT_ROOTS`；seed data 行為不變。

## 移除（Removed）

- 移除 `core/src/index.ts` 內分散的 DB path / project roots parsing，改由 runtime config helper 提供。

## 影響範圍（Impact）

- 受影響模組：Core startup, SQLite open path, package scripts, runtime config tests, project discovery API persistence tests, docs。
- 不影響 React UI rendering，不修改 project folders，不新增 API endpoint。
- MASTER.md 需更新：Manual Scan / Project Rescan runtime 行為、prototype-only 行為、delta index。

## 驗收條件

- [x] 未設定 `DEVDIARY_DB` 時，Core runtime config resolves 到 `~/Library/Application Support/DevDiary/DevDiary.sqlite`。
- [x] Persistent runtime 未設定 `DEVDIARY_PROJECT_ROOTS` 時，project roots 為空陣列。
- [x] `DEVDIARY_PROJECT_ROOTS` 是 persistent 與 in-memory runtime 唯一的 project roots 來源。
- [x] File-backed SQLite parent directory 會自動建立。
- [x] API scan 寫入 file-backed SQLite 後，server restart 仍保留 discovered projects 與 sessions。
- [x] Repeated scan 不重複建立同一 `source_log_ref` session。
- [x] 不把 API key、token、OAuth creds、raw transcript、prompt、response、thinking 寫入 DB 或 logs。
