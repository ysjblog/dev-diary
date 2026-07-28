# DevDiary v0.1.2 Release Distribution Tests

## Test Depth Route

- Level: 4
- Reason: A public macOS DMG release is a critical user installation and external publish path; a mismatched version, tag, checksum, or replacement asset would mislead every downloader.
- Required verification: metadata consistency, root tests/build, Core tests/typecheck, fresh package, mounted DMG verifier, Info.plist version, checksum, commit/tag/release readback, security and diff review.
- Allowed skips: Developer ID/notarization and long-duration soak remain out of scope; a fresh Finder GUI black-box check is not repeated because the release flow is unchanged and the mounted verifier checks the Finder resources.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: no alternate `0.1.1` release version remains in active release instructions or metadata.
- [x] Boundary values / empty / null / malformed input: a missing fresh DMG or checksum blocks publication.
- [x] Rule priority conflicts: release automation has no asset upload or overwrite path.
- [x] Negation / exclusion / opt-out / unlimited: previous `v0.1.1` tag and asset remain untouched locally and no overwrite command is present.
- [x] Contract generated and execution applied: package metadata produced a `0.1.2` DMG whose mounted Info.plist is `0.1.2`.
- [x] Operation order invariants: local build, mounted verification, checksum, and independent QA completed before any future commit/tag/push/upload.
- [x] Production-like dirty data: stale 0.1.1 artifact copies cannot pass the exact name/version/hash checks.
- [ ] Multi-condition combinations: tag target, release target, asset name, asset digest, and checksum agree on one commit/version. (Pending authorized publish.)
- [x] Security bypass mixed with normal input: no token, signing key, private local data, `--clobber`, or release deletion enters the diff or verification workflow.
- [x] State/history/retry/refresh behavior: the workflow no longer publishes; the documented Owner path requires remote readback before a missing asset can be uploaded.
- [ ] Externally observable result, not only implementation detail: GitHub Release readback exposes the new named DMG and checksum asset. (Pending authorized publish.)

## Runtime Verification Route

- Runtime smoke: REQUIRED — mount and verify the fresh local DMG.
- Black-box QA: REQUIRED — a different verifier must independently inspect the fresh DMG and its quarantine/manual-approval diagnostic before the release is published.
- Safe environment or localhost command: local build output mounted at a temporary mountpoint through `scripts/verify-macos-release.sh`.
- Safe test account / mock access: authenticated repository release account only; no user data or secrets are accessed.
- Forbidden or destructive actions: overwrite an asset, delete/rewrite a release or tag, inspect credentials, or publish a second version.

## [x] 【整合流程】四份應用程式版本宣告一致
**範例輸入**：root npm、lockfile、Tauri 與 Cargo metadata。
**期待輸出**：所有應用程式版本皆為 `0.1.2`，README 的公開下載與打包範例亦為 `DevDiary_0.1.2_aarch64.dmg`。

## [x] 【整合流程】最新來源可建置與封裝
**範例輸入**：版本提交前的工作目錄。
**期待輸出**：root 與 Core 驗證通過，`npm run package:mac` 建立本輪新 DMG。

## [x] 【整合流程】掛載 DMG 的完整性與版本
**範例輸入**：`DevDiary_0.1.2_aarch64.dmg`。
**期待輸出**：mounted verifier、bundle seal、Applications shortcut、Finder background、Info.plist 版本與 SHA-256 均通過且記錄。

## [x] 【狀態回歸】歷史 release 不可被覆寫
**範例輸入**：現有 `v0.1.1` GitHub Release 和新 `v0.1.2` 發佈命令。
**期待輸出**：既有 tag/asset 不變；新的 tag 與 Release 指向同一提交，upload 命令不含 overwrite 選項。

## [x] 【狀態回歸】自動發佈工作流程沒有發布權限
**範例輸入**：`.github/workflows/macos-release.yml`。
**期待輸出**：沒有 tag push trigger、只接受明確手動 ref、只有唯讀 repository 權限，且不含 GitHub Release 建立、上傳或 `--clobber`；未來唯一人工發布者才負責遠端 preflight。

## [ ] 【整合流程】遠端 release 回讀一致
**範例輸入**：已建立的 `v0.1.2` Release。
**期待輸出**：tag target、Release target、DMG 名稱、size、asset digest 與上傳前 SHA-256 checksum 一致。
