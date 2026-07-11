# macOS Manual-Approval Release Distribution Tests

## Test Depth Route

- Level: 4
- Reason: GitHub 對外 DMG 是關鍵使用者安裝流程；簽章順序錯誤會讓所有下載者看到 damaged app。
- Required verification: staging ad-hoc seal、mounted DMG content check、bundle/nested Mach-O verification、quarantine diagnostic、workflow syntax review、build/type/test/diff/security review、Finder black-box QA。
- Allowed skips: Developer ID/notarization 不屬於本手動允許 release path；實際第二台乾淨 Mac 的下載點擊需列為 residual QA。

## Bug Pattern Coverage

- [ ] Contract generated and execution applied: Tauri 產物必須先放進 staging image，再簽署並在壓縮後驗證。
- [ ] Operation order invariants: app bundle 在簽章後不可再被 copy／修改；GitHub upload 必須在 mounted verifier 後。
- [ ] Production-like dirty data: 舊無效 ad-hoc app、quarantine copy 與 stale DMG 不得誤通過。
- [ ] Security bypass mixed with normal input: release workflow 不可依賴 Apple certificate、password 或 private key。
- [ ] State/history/retry/refresh behavior: build marker 只接受本輪新 DMG。
- [ ] Externally observable result, not only implementation detail: Finder 顯示 drag-install UI，local installed app 可冷啟動 Core。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: 本機新建 DMG 掛載到暫存 mountpoint；對 `/tmp` copy 加入診斷用 quarantine；已安裝 app probe `127.0.0.1:4317/api/health`。
- Safe test account / mock access: 無帳號；不能移除使用者下載檔的 quarantine。
- Forbidden or destructive actions: 不輸出 certificate、private key、密碼或 token；不得把 `xattr -rd` 當成正式安裝指引。

## [x] 【整合流程】staging DMG 在所有 resources 完成後一次性 ad-hoc signing
**範例輸入**：`npm run package:mac`。
**期待輸出**：Tauri 以 `--no-sign` 建立原生 DMG，再在 staging image 對完整 app bundle 執行 `codesign --force --deep --sign -`。

## [x] 【整合流程】掛載後 bundle integrity 與 drag-install UI
**範例輸入**：本輪 DMG。
**期待輸出**：`codesign --verify --deep --strict` 通過；DMG 內有 `DevDiary.app`、`Applications` symbolic link 與 configured background。

## [x] 【整合流程】nested Mach-O verification
**範例輸入**：掛載後 App 內所有 Mach-O files。
**期待輸出**：每個 native executable 都通過 `codesign --verify --strict`；非 Mach-O script 由外層 sealed resources 保護。

## [x] 【狀態回歸】quarantine 情境不是 damaged bundle failure
**範例輸入**：從掛載 DMG 複製出的 app 加上 `com.apple.quarantine`。
**期待輸出**：記錄完整 `spctl` 輸出；它拒絕未經 Developer ID 驗證的 copy，但不含 sealed resource、bundle format 或 invalid signature error。

## [x] 【前端元素】Finder 黑箱檢查拖拉安裝引導
**範例輸入**：掛載本機 release DMG。
**期待輸出**：Finder 視窗可見 DevDiary app、Applications 捷徑與「拖曳 DevDiary 到 Applications」指示。

## [x] 【runtime smoke】安裝後 local App 可啟動 Core
**範例輸入**：從本輪 DMG 安裝到 `/Applications/DevDiary.app` 後冷啟動。
**期待輸出**：`GET http://127.0.0.1:4317/api/health` 回傳 `ok: true`。

## [x] 【狀態回歸】App startup 不得改寫 bundle sealed resources
**範例輸入**：安裝後首次冷啟動，再檢查 app signature 與 LaunchAgent 檔案位置。
**期待輸出**：`codesign --verify --deep --strict` 仍通過；launcher／source plist 位於 `/Applications/.DevDiaryLaunchAgents`、`~/Library/LaunchAgents` symlink 能 bootstrap，不會建立 `.app/Contents/Resources/.launchagents`。

## [ ] 【狀態回歸】新裝置可用 PATH 中的 Node runtime 啟動 Core
**範例輸入**：沒有 `/opt/homebrew/opt/node@22/bin/node`、但 PATH 有可執行 Node 的 macOS App 環境。
**期待輸出**：Tauri 解析並使用可用 Node 啟動 Core，`/api/health` 可連線；不再因固定 Homebrew 路徑使 Settings 顯示 `Load failed`。

## [x] 【整合流程】DMG background 必須被 Finder metadata 實際引用
**範例輸入**：本輪正式 DMG。
**期待輸出**：打包 helper 直接寫入 `.DS_Store` 的 background alias；除 `.background/dmg-background.png` 存在外，`.DS_Store` 亦含該檔案參照；Finder 顯示拖拉安裝背景，而非白底。

## [x] 【狀態回歸】Release artifact 使用公開 bundle identifier
**範例輸入**：從目前 `main` 建置的 DMG 內 `DevDiary.app/Contents/Info.plist`。
**期待輸出**：`CFBundleIdentifier` 為 `com.ysjblog.devdiary`，不可再發布含舊 private identifier 的 stale artifact。
