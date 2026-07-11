# Delta Spec: macOS Manual-Approval Release Distribution

> Merge: fast-forwarded locally into `main`
> Date: 2026-07-11
> Status: merged; clean second-Mac GitHub download click remains a residual QA check

## 背景 / 問題

舊的 DevDiary debug／release app 是 ad-hoc signed，但 bundle 的 resources 曾在簽章後變動。這會讓 `spctl` 回報「code has no resources but signature indicates they must be present」，對下載者可表現成「app 已損毀」。同時，直接移除所有 Mach-O signatures 雖可讓 `spctl` 回報無可用簽章，卻會使 macOS 無法啟動主程式或 nested native helper。

## 新增（Added）

- 公開 release 不要求 Developer ID 或 notarization；改用完整、有效的 ad-hoc bundle seal，讓使用者可走右鍵 Open 或 Privacy & Security 的手動允許流程。
- Tauri 先以 `--no-sign` 完成原生 DMG 與所有 resources；在 writable staging DMG 內對 `DevDiary.app` 執行一次 `codesign --force --deep --sign -`，完成後不得再修改 app bundle。
- Release verifier 會檢查 DMG integrity、Applications shortcut、完整 ad-hoc bundle seal、主程式與 nested Mach-O verification，以及 quarantine copy 沒有 sealed-resource、bundle-format 或 invalid-signature error。
- Packaged app startup 的 launcher／source plist 寫到 `.app` 同層的 `.DevDiaryLaunchAgents`（不在 sealed bundle），`~/Library/LaunchAgents` 只保留指向這個系統卷路徑的 symlink；不得寫入 `.app/Contents/Resources`。

## 修改（Changed）

- 保留 Tauri 原生 DMG bundle，不再使用手寫 app copy／`hdiutil -srcfolder`。
- GitHub workflow 不需要 Apple certificate 或 notarization secret；build → mounted verifier → checksum → upload 的順序 fail closed。
- README 明確說明這是未經 Developer ID 驗證的手動允許流程，並禁止建議移除 quarantine。

## 移除（Removed）

- 不再把 `APPLE_SIGNING_IDENTITY=-` 的 pre-resource ad-hoc build 當成可公開 artifact。
- 不再嘗試移除所有 nested Mach-O signatures，因為這會破壞 macOS runtime。

## 影響範圍（Impact）

- `package.json`、release/verification scripts、GitHub Actions、README、packaging spec 與測試文件。
- 對外信任邊界：下載後 app 必須具有有效且未被後續修改的 ad-hoc seal；不是 Developer ID，因此使用者仍須手動允許。

## 驗收條件

- [x] `npm run package:mac` 不需要 Apple credentials，並生成新 DMG。
- [x] 掛載後 app 的 `codesign --verify --deep --strict` 通過，顯示 `Signature=adhoc`、沒有 TeamIdentifier，且 DMG 內有 `DevDiary.app`、Applications shortcut 與拖拉安裝背景。
- [x] 每個 nested Mach-O 都通過嚴格 code-sign verification；所有 app resources 在最終壓縮後仍被 bundle seal 驗證。
- [x] 從最終 DMG 安裝並冷啟動 app 後，`codesign --verify --deep --strict` 仍通過；launcher／source plist 位於 `.DevDiaryLaunchAgents`、`~/Library/LaunchAgents` symlink 可 bootstrap，不在 `.app` bundle。
- [x] 對 quarantine copy 的 Gatekeeper 結果是 rejected，但不含 sealed resource、bundle format 或 invalid signature error。
- [x] GitHub workflow 只在 staging sign、mounted-DMG verifier 與 checksum 成功後上傳 DMG，並附上手動允許說明。
