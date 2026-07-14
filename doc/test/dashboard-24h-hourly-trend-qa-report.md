# QA Black-Box Report

- Environment: Web UI (Vite dev server) at http://localhost:5190, Core API at http://127.0.0.1:4317, macOS local dev machine, single local user, no auth.
- Revision / HEAD SHA: 5306a9925d6870355952532ba8e9521356490807 (branch `fix/dashboard-24h-hourly-trend`)
- Timestamp: 2026-07-14 21:54 (Asia/Taipei, per `date` in repo shell)
- Target URL / public entry: http://localhost:5190 (Dashboard 首頁, root route)
- Test depth: Black-box, user-facing only (browser automation via mcp__Claude_Browser__*); no source/diff read, no internal function calls, no code changes.
- Subagent attempt: Not used — task executed directly in this session per instructions.
- Subagents used: None
- Fallback reason: N/A
- Result: PASS

## Scenarios

- [PASS] 開啟 http://localhost:5190，確認頁面載入到 Dashboard 首頁
  - Expected: 頁面顯示「儀表板首頁 (Dashboard)」標題與統計卡片、趨勢圖、專案集中度排行區塊。
  - Actual: 頁面正常載入，預設選取「全部」區間，所有區塊（累積總計 TOKEN 4870.80M、活躍 PROJECTS 11/21、累積總計 SESSIONS 525次、主要 AGENT Codex CLI、Agent Token 比例圓餅圖、Token 消耗量趨勢折線圖、專案集中度排行）均正確渲染。

- [PASS] 切換「全部」→「近24小時」，檢查趨勢圖 X 軸格式與線形
  - Expected: 圖表標題變為「Token 消耗量趨勢 (近24小時)」，X 軸為 HH:00 格式（如 00:00/11:00/23:00），折線應有起伏而非貫穿全寬的水平直線。
  - Actual: 標題正確變為「Token 消耗量趨勢 (近24小時)」，X 軸顯示 00:00 / 11:00 / 23:00。折線在 11:00 附近出現明顯單峰起伏（含一個小台階再升至峰值後回落至 0），非水平直線，確認為以小時分桶的曲線。

- [PASS] 「近24小時」統計卡片與排行同步更新
  - Expected: 累積總計 TOKEN/PROJECTS/SESSIONS/主要 AGENT/Agent Token 比例/專案集中度排行 皆應改為對應 24h 區間數值，且與「全部」不同。
  - Actual: TOKEN 變為 26.42M（↓94.6% vs 上一區段）、PROJECTS 4/21、SESSIONS 4次、主要 AGENT 變為 Claude Code（100% 佔比）、Agent Token 比例圓餅圖僅顯示 Claude Code 100%、專案集中度排行變為「近24小時」標題並列出 Development log 76.9%、Veggie finder 23.1% 兩筆，與「全部」的 11 筆排行明顯不同。

- [PASS] 切換「近7天」，檢查趨勢圖 X 軸格式維持日期
  - Expected: X 軸應為 MM-DD 格式（如 07-08），不受本次修改影響。
  - Actual: 標題變為「Token 消耗量趨勢 (近7天)」，X 軸顯示 07-08 / 07-11 / 07-14，折線為多資料點日趨勢曲線（非小時格式）。統計卡片同步更新：TOKEN 1869.91M（↑84.4%）、PROJECTS 7/21、SESSIONS 188次、主要 AGENT Codex CLI（83%）、專案集中度排行 5 筆且與其他區間不同。

- [PASS] 切換「近1個月」，檢查趨勢圖 X 軸格式維持日期
  - Expected: X 軸應為 MM-DD 格式，行為與修改前一致。
  - Actual: 標題變為「Token 消耗量趨勢 (近1個月)」，X 軸顯示 06-15 / 06-29 / 07-14，多峰日趨勢曲線正常顯示。統計卡片同步更新：TOKEN 3937.09M（↑323.3%）、PROJECTS 11/21、SESSIONS 471次、主要 AGENT Codex CLI（76.6%）、專案集中度排行 5 筆數值與其他區間不同。

- [PASS] 切回「全部」，確認回歸原本累積總計視圖
  - Expected: 應恢復為以日期分桶、標示「累積總計」的視圖，行為與最初載入一致。
  - Actual: 標題恢復「Token 消耗量趨勢 (累積總計)」，X 軸恢復 04-26 / 05-31 / 07-12，統計卡片與排行恢復累積總計數值（TOKEN 4871.20M，因背景持續掃描比初次讀取的 4870.80M 略增，屬正常即時更新，非異常）。

- [PASS] Console error 檢查
  - Expected: 切換各區間過程中不應出現 JS console error。
  - Actual: 全程 `read_console_messages` (onlyErrors=true) 兩次檢查均回傳「No console logs.」，僅有初始 vite/React DevTools 的 debug/info 訊息，無 error。

- [PASS] /api/dashboard Network 請求檢查
  - Expected: 所有 `/api/dashboard?range=*` 請求皆應為 200 OK，無失敗請求。
  - Actual: 逐一確認 `range=all`、`range=24h`、`range=7d`、`range=1m` 的請求全數回傳 200 OK，無 4xx/5xx。

## Evidence

- Screenshots: 6 張全頁截圖，依序涵蓋「全部」初始載入、「近24小時」（含統計卡片與 00:00/11:00/23:00 折線）、「近7天」（07-08/07-11/07-14）、「近1個月」（06-15/06-29/07-14）、切回「全部」確認回歸。
- Commands / artifacts: `mcp__Claude_Browser__read_network_requests`（urlPattern=/api/dashboard 與 /api/）、`mcp__Claude_Browser__read_console_messages`（onlyErrors=true 與全量）、`git rev-parse HEAD` 於 repo 確認版本。
- Console errors: 無（僅 vite HMR debug 與 React DevTools info 訊息，非 error）。
- Network/API errors: 所有 `/api/dashboard?range=*` 請求均為 200 OK。觀察到一組非本次功能相關的雜訊：在頁面「初次載入」階段（早於任何區間切換操作，時序 ID 90639.247–90639.273），有 27 筆 `GET /api/settings` 回傳 `net::ERR_CONNECTION_REFUSED`，隨後於 90639.274 起同一端點即穩定回傳 200 OK 並持續成功。研判為 UI dev server 啟動時對 Core API (127.0.0.1:4317) 的早期輪詢與 Core API 尚未完全就緒之間的競速，屬啟動期暫態，非本次「近24小時分桶」修改所引入，且與 `/api/dashboard` 端點無關（所有 dashboard 請求全程 200 OK）。詳見 Findings。

## Findings

- Severity: Low（觀察性，非本次驗收範圍的缺陷）
- Reproduction steps: 從頭重新整理 http://localhost:5190 頁面，於頁面極早期（首次渲染前後）觀察 Network 面板中 `/api/settings` 請求。
- Expected: 若 Core API 尚未就緒，理想上應有明確的載入中狀態或重試退避，而非產生一串 `ERR_CONNECTION_REFUSED` 的失敗請求記錄。
- Actual: 觀察到 27 筆 `/api/settings` 連線被拒絕，隨後才穩定成功；期間未影響畫面顯示（無 console error、統計卡片與圖表最終皆正確渲染），使用者無感知。
- 此現象與本次「近24小時」分桶功能驗收無關，不影響本次 PASS 判定，僅作為背景觀察記錄，供日後參考是否需優化 Core API 就緒前的請求時序。

## Residual Risk

- 本次僅驗證「全部 / 近24小時 / 近7天 / 近1個月」四種區間切換，未測試「自訂日期」功能（規格中列為選測項目，本次未執行）。
- 僅在單一本機資料集（4870M+ token、跨約 3 個月歷史資料）下驗證，未涵蓋資料極少（如當日剛安裝、近24小時完全無資料）或跨時區邊界的極端情境。
- 未重新整理頁面後再次驗證「近24小時」是否仍正確分桶（僅在同一 SPA session 內切換），但由於已完整驗證 API 回應與畫面渲染邏輯一致，此殘餘風險極低。
