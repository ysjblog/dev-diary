## Test Depth Route

- Level: 3
- Reason：新增 SQL 聚合查詢（安全地板規則）+ 使用者可見 Dashboard 圖表資料契約變更，需證明後端產生的小時 bucket 真的被前端正確消費並渲染。
- Required verification：unit（buildTrend 24h 分支）、integration（getDashboardSnapshot 24h 端到端）、前端 buildTrendAxis unit test、既有 7d/1m/all 回歸測試、瀏覽器 runtime smoke。
- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Allowed skips：無

## Bug Pattern Coverage

- [x] 邊界值 / 空 / null / 畸形輸入 — 當天 0 筆 session、部分小時無資料、最後一小時
- [ ] 輸入正規化 / 別名 / 格式變體 — 不適用，本次無新增使用者輸入欄位
- [ ] 規則優先衝突 — 不適用，24h/7d/1m/custom 為互斥 branch，非疊加規則
- [ ] 否定 / 排除 / opt-out / unlimited — 不適用
- [x] 契約產生且實際執行 — backend `bucket_start` 格式 → 前端 `buildTrendAxis` label 格式化 → 圖表實際顯示多點
- [ ] 操作順序不變式 — 不適用，純讀取聚合無多步驟依序操作
- [x] 類 production 髒資料 — 沿用既有 seed 資料型態（無新增欄位需求）
- [x] 多條件組合 — filter=all 與單一 series（claude-code/codex-cli/antigravity-cli/other）搭配小時分桶
- [ ] 安全繞過混入正常輸入 — 不適用，無新使用者輸入面
- [ ] 狀態/歷史/retry/refresh 行為 — 不適用，本次是唯讀聚合
- [x] 外部可觀察結果，非僅實作細節 — 瀏覽器 Dashboard 頁面實際切換近24小時需看到多點趨勢線

---

> 狀態：初始為 [ ]、完成為 [x]

## [x] 【function 邏輯】24h range 產生 24 個小時 bucket，而非單一日期 bucket
**範例輸入**：`getDashboardSnapshot(db, { range: '24h', today: '2026-06-28' })`，seed 資料在該日 09:00–19:00 間有多筆 session
**期待輸出**：`trend` 中 `series_key === 'total'` 的資料點數量 > 1（最多 24 筆），且每筆 `bucket_start` 格式為 `2026-06-28TXX:00`（XX 為 00–23）

## [x] 【function 邏輯】無資料的小時輸出 0 而非略過
**範例輸入**：同上，取一個 seed 資料保證沒有 session 的小時（例如 03:00）
**期待輸出**：該小時仍有對應 bucket，`token_total === 0`，不會從陣列中消失

## [x] 【function 邏輯】24h 小時分桶總和等於原本單日彙總總和
**範例輸入**：`getDashboardSnapshot(db, { range: '24h', today: TODAY })` 的 trend（total series）token 總和，對照同一天 `sumTokens(db, TODAY, TODAY)` 的既有彙總結果
**期待輸出**：兩者相等（換資料來源不能算錯總量）

## [x] 【function 邏輯】多條 series（claude-code/codex-cli/antigravity-cli/other）在小時分桶下仍分別正確加總
**範例輸入**：seed 資料同時含多種 agent_name 的 session，`range: '24h'`
**期待輸出**：每個 series_key 各小時的加總等於 `total` series 對應小時的值（各 series 相加 = total）

## [x] 【function 邏輯】7d / 1m / custom / all range 的 bucketing 行為不受影響（回歸測試）
**範例輸入**：既有 `dashboard.test.ts` 中 `range: '7d'` / `'1m'` / `'all'` 的既有測試案例原樣重跑
**期待輸出**：與改動前結果一致（既有測試全數維持綠燈，不需修改既有斷言）

## [x] 【Mock API / 前端 function】buildTrendAxis 對小時級 bucket_start 格式化為 HH:00
**範例輸入**：`buildTrendAxis(trend)`，其中 `trend` 為含 `bucket_start: '2026-06-28T14:00'` 的資料點
**期待輸出**：`xLabels` 中對應項目 `label === '14:00'`

## [x] 【Mock API / 前端 function】buildTrendAxis 對日期級 bucket_start 仍維持 MM-DD 格式（回歸）
**範例輸入**：`buildTrendAxis(trend)`，其中 `trend` 為含 `bucket_start: '2026-06-28'`（無 `T`）的資料點
**期待輸出**：`xLabels` 中對應項目 `label === '06-28'`（與改動前行為一致）

## [x] 【前端元素 / Runtime smoke】Dashboard 頁面切換「近24小時」顯示多點趨勢線
**範例輸入**：瀏覽器開啟 Dashboard，點選頂部「近24小時」篩選
**期待輸出**：Token 消耗量趨勢圖顯示隨小時變化的折線（非單一貫穿全寬的水平線），且切換回「近7天」「近1個月」時圖表維持原本以日期為單位的顯示
**實測結果**：`devdiary-ui`（暫用 5190）+ `devdiary-core`（4317）連線後，切到「近24小時」呈現有起伏的鐘型曲線、X 軸為 `00:00`/`11:00`/`23:00`；切回「近7天」X 軸維持 `07-08`/`07-11`/`07-14` 日期格式，未受影響。PASS。
