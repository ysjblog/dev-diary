# Delta Spec: Dashboard 近24小時趨勢圖改用小時分桶
> PR: fix/dashboard-24h-hourly-trend
> Date: 2026-07-14
> Status: merged

## 背景 / 問題

Dashboard 首頁「Token 消耗量趨勢」圖表在 `近24小時` 篩選下，目前顯示一條貫穿全寬的水平線，而非趨勢線。

根因：`buildTrend()`（`core/src/services/dashboard.ts`）不分 range_key，一律以「日期」為 bucket 單位；`resolveRange('24h', today)`（`core/src/domain/dateRange.ts`）把 24h 解析成 `start_date = end_date = today`（同一天）。因此 24h range 永遠只產生「今天」這一個 bucket，圖表退化成單點，觸發 `TrendChart.jsx` 中「單一資料點 → 畫水平線」的既有 fallback（該 fallback 本身設計正確，不是這次要改的對象）。

## 新增（Added）

- `buildTrend()` 新增 24h 專用路徑：當 `rangeKey === '24h'` 時，改用 `sessions` 表的 `start_time`（含時分秒的 ISO timestamp）依「小時」彙總，取代 `token_usage`（只有日期粒度）。
- 產生固定 24 個小時 bucket（00:00–23:00，涵蓋 `today` 整個日期範圍內的每個小時），即使某小時無資料也輸出 0 值點（維持現有「日期範圍內每天都有點」的一致行為）。
- `bucket_start` 格式在 24h 情境下改為 `YYYY-MM-DDTHH:00`（其餘 range 仍是 `YYYY-MM-DD`，不變）。

## 修改（Changed）

- `src/api/dashboard.js` 的 `buildTrendAxis()`：X 軸 label 格式化邏輯需分辨 `bucket_start` 是日期還是小時級（依是否含 `T` 判斷），小時級顯示 `HH:00`，日期級維持現有 `slice(5)`（`MM-DD`）行為不變。
- `core/src/domain/types.ts` 的 `DashboardTrendPoint.bucket_start` 型別註解更新，說明 24h range 下的格式差異。

## 不動（Out of scope，明確排除）

- `7d` / `1m` / `custom` / `all` 的 bucketing 邏輯（依日期或依週）完全不變。
- `24h` 的日期錨定語意不變：仍是「今天整個日曆日」（沿用 `resolveRange` 既有行為），**不**改成「過去 rolling 24 小時」。這兩者不同，但屬於既有既定行為，本次不動。
- `TrendChart.jsx` 的單點 fallback 邏輯（正常運作中，保留給真的只有 1 個 bucket 的情境，例如當天完全沒有任何 session）。
- Timezone：小時 bucket 直接採用 `sessions.start_time` 原始時間值（與現有 `token_usage`/`sessions` 儲存時區一致），不另外做時區轉換；前端顯示沿用瀏覽器本機時區呈現（此為 local-first 單機 app，瀏覽器時區與系統時區一致）。

## 影響範圍（Impact）

- 受影響模組：`core/src/services/dashboard.ts`（後端聚合）、`core/src/domain/types.ts`（型別註解）、`src/api/dashboard.js`（前端 X 軸 label 格式化）。
- `TrendChart.jsx` 不需改動（已是資料驅動，把 `bucket_start` 當不透明排序 key 處理）。
- MASTER.md 待更新區塊：「Dashboard 聚合（§10）」段落，補充 24h range 已改用小時級 trend bucket。

## 驗收條件

- [x] 近24小時篩選下，趨勢圖顯示多個時間點（最多 24 個小時 bucket），不再是單一水平線（除非當天完全無資料）。
- [x] 近24小時 bucket 的 token 總和等於目前（改動前）該日單一 bucket 的 token 總和（不會因為換資料來源而算錯總量）。
- [x] 7d / 1m / custom / all range 的趨勢圖行為與改動前完全一致（無 regression）。
- [x] `core/test/dashboard.test.ts` 新增 24h 小時分桶測試案例並通過。
- [x] `src/api/dashboard.test.js` 新增小時級 `bucket_start` 的 X 軸 label 格式化測試並通過。
- [x] 手動於 Dashboard 頁面切換「近24小時」/「近7天」/「近1個月」，截圖確認趨勢線與各時間篩選皆正常（見 `doc/test/dashboard-24h-hourly-trend-qa-report.md`，Black-box QA PASS）。
