# Delta Spec: Scheduler Run-Now Preflight and Wake Recovery

> PR: feature/core-engine
> Date: 2026-07-01
> Status: implemented（2026-07-01，branch feature/core-engine）

## 背景 / 問題

Daily scheduler 已能在 Core process 內定時或手動 Run now，但失敗時回饋仍偏粗：

- `POST /api/scheduler/daily/run` 目前直接執行 daily run，沒有先把 runtime health、scheduler 設定、agent detection、scan provider 狀態分層回報。
- Settings UI 只顯示 `Daily scheduler：success/failed`，使用者不容易知道是 Core、agent、provider、或 scheduler 狀態哪一層出問題。
- `core/src/index.ts` 只有固定 60 秒 `setInterval`，macOS sleep/wake 後雖可能恢復 tick，但沒有記錄 recovery tick，也沒有立即補跑或清楚狀態。

## 新增（Added）

- `GET /api/scheduler/daily/preflight`：
  - 回傳 `overall_status` 與 `checks[]`。
  - checks 至少包含：
    - `core_health`
    - `scheduler_settings`
    - `agent_detection`
    - `scan_provider`
  - 每層使用 `ok / warning / failed`，附白話 `message` 與必要 metadata。
- `POST /api/scheduler/daily/run`：
  - Run now 前先執行同一份 preflight。
  - 回傳 body 包含 `preflight`，即使 daily run failed 也能看出是哪一層失敗。
- Core wake/recovery tick：
  - Core 啟動後立即 tick。
  - interval 偵測到兩次 tick 間隔超過正常 interval 門檻時，標記為 recovery tick 並立即嘗試 `dailyScheduler.tick(now)`。
  - 不引入 `launchd` / cron；仍維持 Core process 內 scheduler。

## 修改（Changed）

- Settings API client 新增 `fetchDailySchedulerPreflight()`。
- Settings Run now UI：執行前或執行後用 preflight 結果組白話 toast，例如「preflight ok：Core / scheduler / scan provider 可用；agent detection warning」。
- Core tests 補 preflight API、run result preflight、wake/recovery tick helper。

## 移除（Removed）

- 不移除原 `/api/scheduler/daily` 與 `/api/scheduler/daily/run` contract；只做 additive extension。

## 影響範圍（Impact）

- Core services：daily scheduler、server routes、runtime health / agent detection / scan provider policy。
- UI：Settings scheduler Run now helper/toast。
- Tests：Core scheduler/server tests、UI settings API tests。
- 安全邊界：preflight 不執行任意 user command；agent detection 仍走固定 command allowlist；provider check 不寫 project folder、不保存 raw transcript。

## 驗收條件

- [x] `GET /api/scheduler/daily/preflight` 回傳 `overall_status` 與四層 checks。
- [x] `POST /api/scheduler/daily/run` 成功或失敗時都包含 `preflight`。
- [x] agent detection 失敗時 preflight 可回 warning/failed 並提供白話 message，不阻斷 deterministic fallback。
- [x] scan provider policy 可在 preflight 中看出 provider/fallback 與 settings roots count。
- [x] scheduler recovery tick helper 能在 sleep-like long gap 後觸發一次 tick；不依賴 OS cron。
- [x] Core tests / UI tests / typecheck / build pass。
