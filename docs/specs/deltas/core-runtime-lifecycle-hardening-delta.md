# Delta Spec: Core runtime lifecycle hardening (dev runtime, non-packaged)

> PR: feature/core-engine
> Date: 2026-06-30
> Status: implemented

## 背景

接續 `dynamic-core-port-discovery`。Core 已能寫 redacted runtime manifest，Vite dev proxy 已能依 manifest 解析 Core target。本 delta 處理 manifest / Core process 生命週期中「不確定狀態」的 deterministic 行為，仍不進入 packaged Tauri 範圍。

定義三種狀態：

- **stale manifest**：manifest 檔存在但缺欄位 / 非 loopback / JSON 壞掉。
- **stale Core**：manifest 格式正確，但其 `runtime.pid` 對應的 process 已不存在（前一個 Core crash 後沒清掉 manifest）。
- **unreachable Core**：解析出的 target 沒有任何 process 在 listen（連線被拒）。

## 新增（Added）

- Core 啟動 bind port 前會讀取既有 manifest：若其 pid 已死，記錄一行 reclaim 訊息再覆寫；若 pid 仍存活但不是自己，記錄一行 warning（交由 dynamic port fallback 處理共存）。
- `runtimeManifest.ts` 新增 `isProcessAlive(pid)`、`readRuntimeManifest(path)`、`isRuntimeManifestStale(manifest)` 三個可注入測試的 primitive。
- Vite dev proxy resolver 在 manifest 帶有 `runtime.pid` 且該 pid 已死時，視為 stale，跳過該 manifest 並退回 legacy `4317` fallback。

## 修改（Changed）

- `resolveCoreApiTarget` 對 manifest 的信任條件：除了既有的 loopback / service 檢查，新增「若有 pid 則 pid 必須存活」。無 pid 的 manifest 維持向後相容（仍信任）。

## 移除（Removed）

- 不適用。

## 影響範圍（Impact）

- Core startup lifecycle（manifest reclaim）。
- Vite dev proxy target resolution（stale-pid 跳過）。
- Runtime troubleshooting：避免把「Core 已換 port 重啟」誤導向死掉的舊 port。

## 不在範圍（Out of scope）

- 主動 kill 舊 Core process（風險高，且 dynamic port fallback 已能讓新 Core 共存）。
- sleep/wake 後 scheduler recovery。
- run-now preflight contract。
- packaged Tauri lifecycle。

## 驗收條件

- [x] Core 啟動時若既有 manifest 的 pid 已死，會輸出 reclaim 訊息並以自身身分覆寫 manifest。
- [x] Core 啟動時若既有 manifest 的 pid 仍存活且非自己，會輸出 warning，且仍能透過 port fallback 綁到別的 loopback port。
- [x] `resolveCoreApiTarget` 對「pid 已死」的 manifest 回退到 legacy port，不回傳死掉的 URL。
- [x] `resolveCoreApiTarget` 對無 pid 的 manifest 維持原行為（向後相容）。
- [x] unreachable Core 時，Vite proxy 仍回既有的 `502 core_unreachable` JSON（行為不退化）。
- [x] Core tests / typecheck / UI tests / build / runtime smoke 全綠。
