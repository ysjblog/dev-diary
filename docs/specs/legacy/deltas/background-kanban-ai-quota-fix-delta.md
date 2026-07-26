# Delta Spec: Background Kanban AI Quota Fix

> PR: fix/devdiary-background-agy-quota
> Date: 2026-07-07
> Status: implemented

## 背景（Why）

背景 runner 每個 cycle(預設 `scan_interval_minutes` = 5 分鐘)都對「所有專案」各呼叫一次
Antigravity CLI (`agy`) 產生 AI 看板卡,且完全不受 `daily_scheduler` 的「一天一次」控管。
實測 2026-07-07 一天累積 1788 次 agy 呼叫、其中 1404 次 `RESOURCE_EXHAUSTED (429)`,把
Antigravity 每日配額燒光,導致其他自動化任務全部 429 失敗。

## 修改（Changed）

- `runBackgroundCycle`(`core/src/services/backgroundRunner.ts`):移除每輪獨立執行的
  `kanban_ai_auto_add` 區塊。kanban AI 自動加卡不再每 cycle × 每專案呼叫 agy。
- kanban AI 現在只在 `DailySchedulerRuntime.runNow` 的一天一次排程內執行(runNow 內部本來
  就已對每個專案做過同一份 kanban AI),受 `daily_scheduler.enabled` 開關與 `run_time_local`
  排程時間控管。頻繁的 background cycle 只保留免費、不呼叫 agy 的本機掃描 + 一次健康探測。
- 效果:每輪 agy 呼叫從 ~18-20 次降到 ≤1(僅 `AntigravitySessionGate` 健康探測,TTL 30 分快取)。

## 新增（Added）

- 無新 API / 檔案。

## 移除（Removed）

- `runBackgroundCycle` 內 per-cycle 的 kanban AI 產生區塊(與 daily scheduler 重複)。
- 對應的 unused imports(`createConfiguredKanbanAiGenerator`, `syncKanbanAiCards`)。

## 不受影響（Unchanged）

- 手動按鈕 `POST /api/projects/:id/kanban/ai-sync`(單一專案即時重新整理 AI 看板卡)行為不變,
  仍為 on-demand `force: true` 呼叫 agy。
- 每日日記(project summary / global daily highlight)本來就一天一次,行為不變。

## 影響範圍（Impact）

- 受影響模組:Core background runner、對應 Core 測試。
- 測試:`core/test/backgroundRunner.test.ts` 改掉編碼舊行為的案例(「daily scheduler disabled
  時每輪仍跑 kanban AI」→ 改為「不再每輪獨立跑;一天一次由 scheduler 觸發」)。184 tests pass。
- MASTER.md 需更新:background runner 的 kanban AI 執行時機(每 cycle → daily 一次)。
