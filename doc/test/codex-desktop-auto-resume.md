> 歷史驗證紀錄：下方 turn.started/exec 派送證據已由 2026-09-20 queue 修復取代；本次有效案例與驗證見 codex-resume-queue-repair.md 與 codex-resume-queue-qa-report.md。

# Codex Desktop 多任務額度恢復續跑測試計畫

## Test Depth Route

- Level: 4
- Reason: 會在本機對外部 Codex 任務送出訊息，跨 UI、API、SQLite、session parser、背景程序與 CLI。
- Required: Core/UI/Rust 全套、typecheck/build、安全與 diff、fixture runtime smoke、desktop screenshot、獨立黑箱 QA。
- Safety: 所有 dispatch 測試只可使用 fake executable 與假 UUID；禁止真實 Codex task、credential 或 quota event。

## Bug Pattern Coverage

- [x] canonical deep link、malformed/query/fragment、同名不同 UUID、duplicate UUID。
- [x] session zero/multiple match、prefix/inode/locator/timezone authority drift。
- [x] 實際 `event_msg/task_complete/usage_limit_exceeded` shape；普通文字、錯誤 enum、未完成行與未到期不觸發。
- [x] global lease、每 tick 一個 target、成功 evidence 不重播、crash/unknown outcome 不重播、stale owner fencing。
- [x] fixed argv、名稱與 message 不進 argv、`shell:false`、bounded output/time、只認 `turn.started`；頑固子程序需確認停止後才放行。
- [x] dedicated API、legacy 410、general settings reject、trusted Origin、runtime snapshot drift zero mutation。
- [x] API-to-fake-CLI runtime smoke與 desktop screenshot。
- [x] 獨立黑箱 QA。

## Runtime Verification Route

使用 temporary app-data/SQLite、兩個 fixture session roots、已過 reset time 的真實結構 quota JSON line，以及只寫 argv receipt 並輸出 `turn.started` 的 fake Codex executable。透過實際 loopback API 註冊多個 targets，執行 runner tick，確認只有目標 UUID 收到固定「繼續」、DB 變 resumed 且第二 tick 不重播。

## UI Acceptance

- [x] 1280×820 desktop-only viewport 可見 global switch、deep link、目前任務名稱、註冊按鈕與 targets 清單。
- [x] 清單具備 pause/resume、rename、unregister，狀態 mapping 顯示等待 reset、resumed、needs-attention。
- [x] stale/unverified Core 時所有 mutation controls disabled；註冊失敗不清空使用者輸入。
- [x] 說明明確：名稱不是 identity、不需固定視窗大小/位置/前景、不需 Accessibility。

## Security Review Checklist

- [x] deep link/name/header 皆 exact validation；名稱、quota message 無法進 command。
- [x] session read bounded/no-follow/identity/prefix checked；raw transcript 不進 log/API/UI。
- [x] executable 必須 regular/executable；spawn no shell、fixed cwd/argv、安全 allowlisted env。
- [x] 一個 global lease；timeout/crash fail closed、條件 fencing、程序未證實停止時不釋放 lease，且 evidence 不重播。
- [x] fresh secret scan、dependency/security command、runtime receipt redaction與 independent review。

## Completion Record

2026-09-10 執行中證據：

- UI：82 tests passed；Vite production build passed。
- Rust：21 tests passed。
- Core API-to-session-to-fake-CLI smoke 已包含於 `codexDesktopResumeApiV8.test.ts`，只寫 fake argv receipt 並輸出 `turn.started`，未接觸真實 Codex 任務。
- Desktop screenshot：`output/playwright/codex-desktop-auto-resume-v8.png`，取自 1280×820 desktop viewport 的完整功能區塊，SHA-256 `f24f337742a9ef1b8d64b7e5d519262d68f6255753f69e46f1edc56d1a0937d7`；console 0 error / 0 warning，假 deep link 只填入未送出。
- Core：35 files、323 tests passed，typecheck passed；Rust 22/22。背景啟動 authority 另以 25/25 targeted tests 驗證舊/缺少 schema 不被 LaunchAgent 建立或升級。獨立黑箱 QA 最終 `APPROVE`；focused Core 33/33、UI/API 43/43，connected/stale UI runtime probe 通過且 mutation request 0。歷史 Accessibility prototype 不作本輪證據。
