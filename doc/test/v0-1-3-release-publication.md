# DevDiary v0.1.3 Release Publication Tests

## Test Depth Route

- Level: 4
- Reason: 本輪同時改動公開來源內容、版本契約、main push、tag 與 GitHub Release；錯誤會直接影響下載者或公開私人 checkout 資訊。
- Required verification: 版本宣告一致、公開來源路徑 hygiene、完整 Core/UI/Rust suites、build/type/security/diff、fresh DMG verifier、隔離安裝 App runtime smoke、遠端 main/tag/Release/asset digest readback。
- Allowed skips: Developer ID 與 notarization 不屬於目前 manual-approval 發布契約；不讀私人 runtime DB、不呼叫真人 AI provider。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：掃描常見 macOS absolute home、volume 與 private checkout 形式。
- [x] Boundary values / empty / null / malformed input：版本與 release asset 名稱必須精確符合 semantic version。
- [x] Rule priority conflicts：匿名測試 fixture 與必要系統偵測路徑不可被誤當私人 checkout 洩漏。
- [x] Contract generated and execution applied：package、lockfile、Tauri、Cargo、README、DMG、App Info.plist、tag 與 Release 全部同版。
- [x] Operation order invariants：先測試與打包驗證，再合併／push；先建立 immutable tag，再建立新 Release，不覆寫舊版。
- [x] Production-like dirty data：不得選到舊 DMG 或把 ignored build artifacts commit 進 Git。
- [x] Security bypass mixed with normal input：公開 tracked text 不得含這台機器的 checkout、volume 或使用者 home 路徑。
- [ ] State/history/retry/refresh behavior：remote readback 必須與 local main、tag、asset SHA-256 一致。
- [ ] Externally observable result, not only implementation detail：從 fresh DMG 複製出的 App 可用隔離 HOME／DB 啟動 Core 並回應 health。

不適用：搜尋排序、分頁、權限角色與多帳號狀態，本輪沒有這些行為。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: fresh v0.1.3 DMG、暫存 mount／install dir、隔離 HOME、空白 SQLite、loopback Core。
- Safe test account / mock access: GitHub 只使用現有 `gh` 登入；App smoke 不使用帳號或私人資料。
- Forbidden or destructive actions: 不覆寫既有 tag／Release、不可 `--clobber`、不改 `/Applications/DevDiary.app`、不讀私人 DB／agent logs。

## [x] 【安全繞過】公開來源不含本機私人 checkout 硬編碼
**範例輸入**：所有 tracked text、`src/App.jsx` 與 `core/src/db/seed.ts`。
**期待輸出**：不含真實 Sample_projects checkout、external-volume 使用者路徑或 production `/Users/<name>` demo root；匿名測試 fixture 與標準 macOS App executable candidates 可保留。

## [x] 【版本契約】所有公開版本宣告升到 0.1.3
**範例輸入**：package、lockfile、Tauri、Cargo、README。
**期待輸出**：npm lock 的 top-level 與 `packages[""]`、Cargo lock 的 `app` entry 也全部為 `0.1.3`，DMG 名稱為 `DevDiary_0.1.3_aarch64.dmg`。

## [ ] 【整合流程】fresh DMG 與 App 通過 mounted verifier
**範例輸入**：`npm run package:mac` 產生的本輪 DMG。
**期待輸出**：App／Applications symlink／Finder background 完整，nested Mach-O 與 outer bundle ad-hoc seal 通過，DMG integrity 通過。

## [ ] 【runtime smoke】隔離安裝的 App 可啟動自己的 Core
**範例輸入**：從 DMG 複製到暫存資料夾的 `DevDiary.app`，隔離 HOME／manifest／DB。
**期待輸出**：Core 回應 health，App bundle 啟動前後簽章保持有效，不接觸私人 runtime 資料。

## [ ] 【發布 readback】本機與遠端 main、tag、Release asset 一致
**範例輸入**：local main、`origin/main`、`v0.1.3`、GitHub Release 與下載回讀 DMG。
**期待輸出**：commit SHA 一致，tag 指向 main，Release asset digest 與本機 DMG SHA-256 一致。

## [x] 【發布隱私】Release notes 不含本機 identity
**範例輸入**：create 前的 release body 與 remote readback body。
**期待輸出**：兩者通過與 current source 相同的 checkout/account privacy scanner，且 scanner source 本身不包含 maintainer identity literal。
