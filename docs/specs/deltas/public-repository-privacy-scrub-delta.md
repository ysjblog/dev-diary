# Delta Spec: Public Repository Privacy Scrub

> Date: 2026-07-11
> Status: implementing

## 新增（Added）

- 公開 repository 的 current-tree scan，阻擋個人絕對路徑與已淘汰的 private identifier。
- 以 `origin/main` 為基底的 sanitized snapshot publish strategy，避免把本機 private commit history 推送到 GitHub。

## 修改（Changed）

- Core 不再提供 repository-local project root preset；persistent 與 in-memory runtime 都只使用明確設定的 `DEVDIARY_PROJECT_ROOTS`。
- Tauri bundle identifier 與 LaunchAgent label 使用公開 repository owner 對應的 `com.ysjblog.devdiary`。
- Mock data、tests、README、spec 與 QA reports 使用通用或不記錄實體機器位置的範例。

## 移除（Removed）

- 已移除開發者本機 project roots、私有設計來源路徑與過期 LaunchAgent identifier。

## 驗收條件

- [x] current tree 不含個人絕對路徑或舊 identifier。
- [x] 未設定 `DEVDIARY_PROJECT_ROOTS` 時，任何 runtime 都不會載入 repository-local roots。
- [x] Core tests/typecheck、root tests/build 通過。
- [ ] sanitized snapshot 以 fast-forward 推送到 `origin/main`，不 force-push 或改寫遠端 history。
