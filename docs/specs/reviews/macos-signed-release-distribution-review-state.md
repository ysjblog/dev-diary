# macOS Manual-Approval Release Distribution — Review State

## SPEC REVIEW ROUTE

- Level: 2
- Reason: 公開 release pipeline 跨越 Tauri bundle、shell scripts、GitHub Actions、Gatekeeper 驗證與使用者安裝文件；錯誤會讓所有下載者無法開啟 app。
- Spec: `docs/specs/deltas/macos-signed-release-distribution-delta.md`
- Touched surface: `package.json`、Tauri DMG bundle、release/verifier scripts、GitHub workflow、README、spec 與 QA 文件。
- Load-bearing claims: Tauri CLI 支援 `--no-sign`；Tauri 完成所有 contents 後可在 writable staging DMG 對完整 app 做一次 ad-hoc seal；掛載後 outer bundle 與每個 nested Mach-O 都必須通過嚴格驗證；quarantine copy 的 Gatekeeper 拒絕不可是 sealed-resource、bundle-format 或 invalid-signature failure；workflow 不可引用 Apple signing/notarization secrets。
- Plan: 以 Tauri 原生 DMG 產生 drag-install 視窗，再用 writable staging DMG 對完整 app 執行最後一次 ad-hoc signing，最後在掛載後驗證器與 GitHub workflow 內 fail closed。
- Subagent attempt: attempted
- Subagents required: yes
- Subagents used: default read-only reviewers
- Fallback reason: named `sol` / `luna` models are unavailable for this ChatGPT account；使用預設 reviewer 與本機 evidence-first 對帳。
- Budget mode: bounded
- Required lenses this round: data-and-facts、naming-and-types、blast-radius
- Deferred lenses: execution-order、logic-and-design
- Why deferred: 只在 required lenses 出現 high finding 時加入；operation order 已由實際 package/verifier run 覆蓋。
- Escalation trigger: 任一 executable 仍有 signature、quarantine `spctl` 非 `source=no usable signature`、DMG 缺少 Applications shortcut、或 workflow 引入 Apple secrets。
- Round trust policy: required lenses must return structured findings; named-agent failures are recorded as infrastructure fallback rather than clean evidence.

## FACT INVENTORY

- claim: `tauri build` 可略過 bundle signing。
  status: confirmed
  evidence: `npx tauri build --help` 顯示 `--no-sign`。
- claim: 單用 `--no-sign` 足以完全 unsigned。
  status: refuted
  evidence: 初始產物的主 Mach-O 仍有 `Signature=adhoc`、`linker-signed`；因此不能把它當公開 release，也不能移除所有 nested signatures，否則會破壞 native helper runtime。
- claim: staged final DMG 可保留 Tauri 原生 install UI 並完成完整 app ad-hoc seal。
  status: confirmed
  evidence: `npm run package:mac` 後，掛載產物顯示 `Signature=adhoc` 與 sealed resources；outer bundle 及 nested Mach-O 均通過 `codesign --verify --strict`，Finder 仍顯示 DevDiary、Applications 與箭頭。
- claim: quarantine 路徑不是 damaged bundle failure。
  status: confirmed
  evidence: temporary quarantined app copy 的 `spctl --assess --type execute --verbose=4` 回傳 `rejected`，但沒有 sealed-resource、bundle-format 或 invalid-signature error。

## REVIEW RESULT

- Round 1: 未收斂。發現 package wrapper、verifier、workflow 仍是 Developer ID/notarization 契約；已改為 no-sign public path。
- Round 2: 未收斂。發現 `--no-sign` 保留 linker ad-hoc signature；移除所有 nested signature 會破壞 native helper runtime；過期 QA/review state 也需同步。改為最後一次完整 ad-hoc seal、逐檔 Mach-O strict verification，並同步文件。
- Round 3: 實體 package、mounted verifier、quarantine diagnostic、Finder QA、安裝後 Core cold-launch 與簽章不被 LaunchAgent 改寫均通過；乾淨第二台 Mac 的 GitHub 下載點擊保留為 residual QA。

## FIX REPORT

- title: Seal the complete bundle after Tauri no-sign bundling
  specSection: delta `修改` and `驗收條件`
  whatChanged: release wrapper converts the native DMG to writable staging format, signs the complete app once with an ad-hoc seal, recompresses it, and verifies the fresh artifact.
  concernTags: data-facts, execution-order
  verifyString: `Signature=adhoc`
- title: Make every nested executable verification fail closed
  specSection: delta `驗收條件`
  whatChanged: verifier requires every nested Mach-O executable to pass `codesign --verify --strict`.
  concernTags: data-facts, readers-writers
  verifyString: `satisfies its Designated Requirement`
- title: Align public release and operator documentation
  specSection: delta `新增` and `影響範圍`
  whatChanged: workflow removes Apple credentials, uploads only verified ad-hoc-sealed DMG/checksum, and release notes/README document right-click Open or Privacy & Security without xattr removal.
  concernTags: design-contract, readers-writers
  verifyString: `not signed with Apple Developer ID`
