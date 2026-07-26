# Delta Spec: Settings 與 Daily Diary Usability
> PR: feature/core-engine
> Date: 2026-07-01
> Status: implemented

## 新增（Added）

- Workspace daily diary 操作新增單日 range helper，daily save/regenerate 後的刷新 snapshot 會包含被操作的日期。
- Settings page 重新分組為 Core runtime status、專案與掃描、Daily automation、外觀/匯出/隱私、資料儲存。

## 修改（Changed）

- Logs tab 的日期選擇會同步左側 editor 的 daily entry context；選舊日期後再按 AI 重新總結，不會落回 project-level summary 或今天 range。
- Settings page 減少長列表式排列，改成同類設定集中呈現；頁首只保留不可編輯的 Core runtime 狀態，不再重複顯示 Daily Scheduler、Storage 或不可互動的 capability chips。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- Affected modules: React Workspace logs interactions, Projects API client helper, Settings page rendering/CSS, tests, docs/specs.
- Core API contract 不變；React 仍只透過 Core API 讀寫 settings 與 diary，不直接讀 SQLite 或 project folder。

## 驗收條件

- [x] 選擇非今日 diary date 後，左側 editor 進入該日期的 daily entry context。
- [x] 非今日 daily diary 按 AI 重新總結時，API refresh query 使用該日期的 single-day custom range。
- [x] Settings page 的相關功能集中分組，桌面與手機寬度都無重疊或水平 overflow。
- [x] Settings page 不顯示不可互動的 capability chips，也不在頁首重複顯示下方已存在的 scheduler/storage 設定。
- [x] Root tests、Core targeted tests、Build、desktop/mobile browser smoke 通過。
