# DMG、Onboarding、CLI 與 Project Discovery regression

## Test Depth Route

- Level: 4
- Reason: DMG 背景屬重複 release regression；首次啟動 UI 與 project discovery 是關鍵使用者流程，且 CLI detection 涉及 packaged GUI runtime 環境差異。
- Required verification: regression unit tests、Core integration test、Build/Types、實際 DMG Finder smoke、desktop/mobile onboarding browser check、independent black-box QA。
- Allowed skips: 不執行 Developer ID notarization（目前產品 release contract 為 ad-hoc manual approval，且本修正不改簽章策略）。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：GUI PATH 與 app bundle absolute candidate。
- [x] Boundary values / empty / null / malformed input：空 root、root 本身就是 project。
- [x] Rule priority conflicts：configured root project 與 nested project 同時成立。
- [x] Negation / exclusion / opt-out / unlimited：ignored directories 仍不可深入。
- [x] Contract generated and execution applied：DMG metadata 不只含檔名，Finder 必須真的顯示背景。
- [x] Operation order invariants：先完成 bundle 修改與 seal，再保留／寫入有效 Finder layout。
- [x] Production-like dirty data：container root 同時有 `.git`、`package.json` 與 nested projects。
- [x] Multi-condition combinations：project marker + max depth + ignored directory。
- [ ] Security bypass mixed with normal input：不適用；掃描維持 read-only，binary probe 維持 fixed argv / shell false。
- [x] State/history/retry/refresh behavior：DMG 重新掛載後背景仍可解析。
- [x] Externally observable result, not only implementation detail：Finder、desktop/mobile onboarding 與 packaged CLI detection smoke。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `npm run dev`、local Core、fresh local unsigned/ad-hoc DMG。
- Safe test account / mock access: 本機 fixture roots 與既有 local CLI；不登入、不傳輸資料。
- Forbidden or destructive actions: 不移除使用者 project、CLI logs、Applications 內 app 或任何 credentials。

## [x] 【DMG Finder】重新掛載 release DMG 後顯示 drag-to-Applications 背景
**範例輸入**：fresh `npm run package:mac` 產物，卸載後再次掛載並由 Finder 開啟。
**期待輸出**：顯示 660×400 自訂背景，只呈現 DevDiary 與 Applications 安裝圖示；背景 metadata 不依賴 build 暫存 mount path。

## [x] 【前端互動】Onboarding primary button hover 維持可讀文字
**範例輸入**：首次啟動畫面各步驟的 primary button，dark/light theme，normal/hover state。
**期待輸出**：hover 時文字色與背景有清楚對比，且 desktop/mobile 無破版。

## [x] 【function 邏輯】Packaged GUI PATH 缺少 CLI 時仍偵測已知 Codex app bundle
**範例輸入**：`PATH=/usr/bin:/bin:/usr/sbin:/sbin`，Codex binary 位於支援的 macOS app bundle。
**期待輸出**：Codex card 回報 available、binary path 與 version；probe 仍使用 fixed argv、`shell: false`。

## [x] 【function 邏輯】Configured root 本身是 project 時仍探索 nested projects
**範例輸入**：root 有 `.git` / `package.json`，下一層另有 Git repo，且 `node_modules` 內也有 package marker。
**期待輸出**：root 與 nested repo 都被發現；ignored directory 內 package 不被加入。

## [x] 【整合流程】儲存 project root 後 global scan upsert nested projects
**範例輸入**：Settings 保存 container root 後呼叫 global scan。
**期待輸出**：Projects API 可見 container 與符合條件的 nested projects，重掃不重複建立。
