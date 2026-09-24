# Codex Desktop 多任務額度恢復續跑：v8 獨立黑箱驗證報告

## 結論

PASS。2026-09-10 由獨立 no-fork Sol reviewer `0190abcd-ef00-7000-8000-000000000005` 完成。驗證全程使用 fake UUID、fake CLI 與攔截的 localhost API；沒有讀取私人 session/log、沒有按註冊，也沒有對任何真實 Codex 任務送出「繼續」。

## 驗證結果

| 檢查 | 結果 | Fresh evidence |
|---|---|---|
| exact deep-link / UUID、多 target、同名不同 identity | PASS | Connected fixture 以兩個不同 fake UUID 和相同 display name 渲染兩列 |
| quota-only、reset 前等待、每 tick 一個、不重播 | PASS | 7 個 Core 專用檔案共 33/33 tests passed |
| fixed fake CLI argv 與 `turn.started` acknowledgement | PASS | API-to-session-to-fake-CLI loopback smoke；argv 只有 `exec resume --json <fake UUID> 繼續` |
| transport/Core runtime drift zero mutation | PASS | integration tests 與 stale UI probe；mutation request 集合為空 |
| connected UI controls / 狀態 / 說明 | PASS | 1280×820 mocked localhost；global、pause/resume、rename、unregister 可用，三種狀態文案皆顯示 |
| stale UI fail closed | PASS | `control_count=10`、`disabled_count=10`、兩列 target；所有 mutation controls disabled |
| console / page runtime | PASS | console errors 0、page errors 0 |

## Commands and counts

- Core focused：`npx vitest run` 執行 7 個 Codex resume 測試檔，33/33 passed。
- UI/API focused：`node --test src/api/coreFetch.test.js src/api/settings.test.js src/api/appShell.test.js`，43/43 passed。
- UI retest：Playwright CLI 隔離 session，以 route interception 執行 connected、resumed、needs-attention 與 stale runtime probe；瀏覽器完成後已關閉。

Owner 另完成的完整驗證：Core 35 files、323/323；UI 82/82；Rust 22/22；Core typecheck 與 Vite production build passed。另有 25/25 targeted tests 證明背景 runner 遇到舊/缺少 schema 或 incompatible manifest 時不建立、不 migration 資料庫，且 Tauri 先 spawn Core 才安裝 LaunchAgent。完整功能區塊截圖為 `output/playwright/codex-desktop-auto-resume-v8.png`，SHA-256 `f24f337742a9ef1b8d64b7e5d519262d68f6255753f69e46f1edc56d1a0937d7`。

## Residual boundary

獨立 UI probe 是 mocked localhost Web runtime；真實 Core 整合由 fixture API-to-fake-CLI smoke 覆蓋，但刻意沒有對真實 Codex 任務執行 resume。這是避免誤送訊息的安全邊界，不是缺少產品路徑測試。
