# Test Plan: Core runtime lifecycle hardening

> Spec: docs/specs/deltas/core-runtime-lifecycle-hardening-delta.md
> Scope: dev runtime only (non-packaged)

## Test depth routing

- Level: **2**（runtime lifecycle + dev proxy routing；blast radius 中等，限 dev runtime，不影響 persistent data）。
- Runtime smoke: **REQUIRED**（碰 Core startup 與 Vite proxy target 解析路徑）。
- Black-box QA: **NOT_APPLICABLE**（無新 user-facing UI flow；行為差異在 runtime 解析層，由 unit + runtime smoke 覆蓋）。

## Unit — `core/test/runtimeManifest.test.ts`

1. `isProcessAlive` 對 `process.pid`（自己）回 true；對保證不存在的 pid 回 false；對非正整數 pid 回 false。
2. `readRuntimeManifest` 對不存在路徑回 null；對壞掉 JSON 回 null；對非 `devdiary-core` service 回 null；對合法 manifest 回 parsed object。
3. `isRuntimeManifestStale`：
   - manifest 為 null → stale。
   - 無 pid → stale（無法證明 owner 存活）。
   - pid 注入為 alive → 非 stale。
   - pid 注入為 dead → stale。

## Unit — `src/api/devCoreTarget.test.js`

4. manifest 帶 `runtime.pid` 且注入 `isAlive=false` → 跳過 manifest，回退到 legacy `DEVDIARY_PORT` / 4317。
5. manifest 帶 `runtime.pid` 且注入 `isAlive=true` → 使用 manifest URL。
6. manifest 無 pid → 維持既有行為（信任 manifest，向後相容）。

## Runtime smoke

- 用 `DEVDIARY_CORE_MANIFEST` 指向一個 pid=已死 的假 manifest，啟動 Core（`DEVDIARY_PORT=0`），確認：
  - Core 輸出 reclaim 訊息。
  - Core 以自身 pid 覆寫 manifest（pid == 啟動的 Core pid）。
  - `/api/health` 回 200 且 port 與 manifest 一致。
- 確認 Vite proxy 透過覆寫後的 manifest 命中 Core。
