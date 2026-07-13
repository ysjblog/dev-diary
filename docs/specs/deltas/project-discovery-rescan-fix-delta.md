# Delta Spec: Project Discovery Rescan Fix

> PR: fix/project-discovery-throttle
> Date: 2026-07-13
> Status: merged

## 新增（Added）

- `core/test/projectDiscovery.test.ts`：新增迴歸測試，涵蓋「scan root 底下已有多個追蹤中的專案，之後新增資料夾，是否仍會在下一次 global scan 被發現、且不會重複 insert 既有專案」的多輪掃描場景。

## 修改（Changed）

- `core/src/services/scans.ts`：`runManualScan()` 的 `scope: 'global'` 分支移除 `shouldDiscoverProjectRoots()` 節流判斷，改為每次 global scan（含 background scan，每 5 分鐘一次）都呼叫 `discoverProjectsFromRoots()`。
  - 原本行為：只要某個 scan root 底下**曾經**被發現過任一個 project，之後該 root 永久跳過重新探索——即使使用者事後在同一個 root 底下新增了新的 git repo / package.json 資料夾，也不會被自動掃描加入。
  - 修正後行為：`discoverProjectsFromRoots()` 本身是 idempotent（依 `root_path` insert-or-update，不會重複新增），因此每次 global scan 都重新探索是安全的；對目前實際的兩個 scan root（`~/Desktop/side-projects`、`~/Projects`）而言，探索只做 `maxDepth=2` 的 `readdirSync`/`statSync`，並跳過 `.git`/`node_modules`/`dist` 等目錄，開銷極小。
- `core/test/projectDiscovery.test.ts`：原本名為「global scan 對已追蹤 root 直接掃 known projects，避免每次更新都重新 discovery」的測試斷言新增的 sibling 資料夾**不會**被發現——這是舊行為的迴歸保護，現已改為斷言新增的 sibling 資料夾**會**被發現。

## 移除（Removed）

- `core/src/services/scans.ts` 內的 `shouldDiscoverProjectRoots()` 與 `rootContainsProject()` helper functions（無其他呼叫點，確認安全移除）。

## 影響範圍（Impact）

- 受影響的模組：Core scan service (`core/src/services/scans.ts`)、project discovery tests。
- MASTER.md 需更新的區塊：Project root discovery 相關描述（第 45 行附近，補充「global scan 每次都會重新探索 configured roots，非一次性」）。
- Runtime 影響：使用者目前跑的是打包好的 DevDiary.app，此修法需要 `npm run package:mac` 重新打包並重啟 app 才會生效（app bundle 內是 core/src 快照，改 repo 不會即時反映）。

## 驗收條件

- [x] `core/test/projectDiscovery.test.ts`、`core/test/scans.test.ts` 全數通過（22 tests）。
- [x] `npm run typecheck`（core）通過，無型別錯誤。
- [x] Repeated global scan 不會對既有專案重複 insert（idempotency 未被破壞）。
- [x] Scan root 底下已有追蹤中專案時，之後新增的資料夾會在下一次 global scan 被發現並 upsert 到 `projects`。
- [ ] 實機驗證（需使用者協助）：`npm run package:mac` 重新打包、重啟 DevDiary.app 後，確認 `EV charge log` 資料夾在下一次 background scan（或手動 Scan Now）後出現在 Workspace。
