# Delta Spec: Antigravity Session 斷路器(修登入視窗狂彈)

> PR: fix/antigravity-login-storm
> Date: 2026-07-07
> Status: implemented

## 背景 / 根因

`agy` 的 OAuth token 會過夜過期,headless `agy --print` 無法靜默刷新,session 失效時只會彈 GUI 登入視窗。背景 runner 每 `scan_interval_minutes`(實測使用者設 5 分鐘)一輪、且對每個 scanned project 呼叫 agy(kanban AI + 每日摘要),failure 又被逐專案 swallow 成 fallback,導致 session 失效時「逐專案 ×每輪」狂彈登入頁——即使終端機已登入(互動模式能續期,背景不能)。

## 新增（Added）

- `core/src/services/antigravitySession.ts`:
  - `AntigravitySessionGate` 斷路器(長生命週期單例):`ensureHealthy(nowMs, probe)` 依 healthy TTL(預設 30 分)與 failure cooldown(預設 180 分)決定「這次要不要真的 probe」。失效後 cooldown 內不再 probe → 不再彈登入視窗。
  - `createAntigravityProbe(settings)`:送 1 次 magic-token(`AGYHEALTHOK`)probe,拿到才算健康;呼叫失敗/無 token 一律回 `{healthy:false}`,不丟例外。
  - `usesAntigravityProvider(settings)`:對齊 diaryAgent 建 configured agent 的條件。
  - 環境變數:`DEVDIARY_ANTIGRAVITY_HEALTH_TTL_MINUTES`、`DEVDIARY_ANTIGRAVITY_AUTH_COOLDOWN_MINUTES` 可覆寫。
- `BackgroundCycleResult` 新增 `antigravity_skipped: boolean`,並寫入 `formatBackgroundCycleLog` 的 JSON log。
- 測試:`core/test/antigravitySession.test.ts`(gate cooldown/TTL、probe 健康/失效不丟例外、provider 判斷);`core/test/backgroundRunner.test.ts` 新增「失效整輪跳過 AI」情境。

## 修改（Changed）

- `core/src/services/backgroundRunner.ts`:kanban AI fan-out 前先過 gate;失效時整輪把 configured(agy)generator null 掉改用 deterministic fallback。gate 傳入其建構的 `DailySchedulerRuntime`。
- `core/src/services/dailyScheduler.ts`:`DailySchedulerRuntimeOptions` 新增 `antigravityGate`;`runNow` 在 provider 為 antigravity 且 gate 判失效時,`generator/globalGenerator/kanbanAiGenerator` 皆改用 fallback(不逐專案彈窗)。**只 gate configured fallback,顯式注入的 generator 仍優先。**
- `core/src/services/diaryAgent.ts`:`createAntigravityPromptRunner` 改為 export,供 probe 重用(確保 probe 與真實呼叫用同一組 cliPath/model/env)。
- `core/src/backgroundRunner.ts`、`core/src/index.ts`、`core/src/server.ts`:各進入點注入一個長生命週期 `AntigravitySessionGate` 單例,在多輪 tick/cycle 之間共用 cooldown。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- Core services:`antigravitySession.ts`(新)、`backgroundRunner.ts`、`dailyScheduler.ts`、`diaryAgent.ts`。
- Entry points:`src/backgroundRunner.ts`、`src/index.ts`、`src/server.ts`。
- Tests:`test/antigravitySession.test.ts`(新)、`test/backgroundRunner.test.ts`。

## 驗收條件

- [x] `tsc --noEmit` 乾淨。
- [x] 全套件 183 passed(含新增 8 個測試)。
- [x] gate 失效後 cooldown 內不再 probe(單元測試驗證 probe 呼叫次數)。
- [x] 背景 cycle 在 session 失效時 `antigravity_skipped=true`、kanban AI 不插卡、diary 改用 deterministic fallback。
- [ ] 手動:重啟 `com.devdiary.app.background` 後,session 過期時登入視窗最多再出現一次(探針),之後 cooldown 內安靜。
