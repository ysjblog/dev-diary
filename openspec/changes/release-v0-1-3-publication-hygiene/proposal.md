---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-3-publication-hygiene
reasons: external_writes, production_contract_changes, credentials_secrets
---
# Change Proposal: release-v0-1-3-publication-hygiene

## 中文摘要

將目前已驗證的可靠性與安全修正整理成新的 `v0.1.3` macOS 發布：清除現行公開來源中的真實本機 checkout／使用者路徑，重新打包 App 與 DMG，讓 `main`、immutable tag、GitHub Release 與下載回讀的 checksum 指向同一個 commit。舊版與 legacy provenance 不覆寫、不刪除。

## Why

功能分支含有已完成但尚未併入 `main` 的台北日期、loopback Origin、runtime manifest 與 LaunchAgent 修正。使用者現在明確授權 merge、push 與 DMG 發布，並要求遠端來源不保留這台機器的私人路徑；既有最新公開版本是 `v0.1.2`，因此需要新 patch version，不能重用舊 tag 或資產名稱。

## What Changes

- 將 root npm、lockfile、Tauri、Cargo 與 README 版本同步為 `0.1.3`。
- 將 production seed、UI fallback/placeholder 與現行文件中的機器特定路徑改成由 OS 暫存目錄推導或不具識別性的表示；匿名測試 fixtures、標準 macOS 系統偵測 candidates 與 immutable legacy provenance 不在移除範圍。
- 在 exact candidate 上重跑自動測試、security、black-box 與 packaged runtime verification，重新建立 `DevDiary.app` 與 `DevDiary_0.1.3_aarch64.dmg`。
- fast-forward merge 到 `main`，push `main` 與新 `v0.1.3` tag，建立新的 GitHub Release，只上傳 DMG 與 basename-only checksum，最後下載回讀。

## Scope

- Included: current tracked source/docs hygiene、版本 metadata、Level-4 regression test、App/DMG fresh build、single-repository main/tag/release publication、remote readback 與 current OpenSpec reconciliation。

## Non-Goals

- 不改寫 `docs/specs/legacy/` 的歷史證據，不移除 `/Applications/ChatGPT.app`、`/usr/local/bin/codex` 等標準安裝候選，也不把 `/Users/me`、`/Users/tester` 等匿名測試 fixture 當成真實私人資料。
- 不覆寫／刪除／retarget `v0.1.2` 或任何舊 Release，不 commit DMG/App binary，不安裝到 `/Applications`，不讀私人 runtime DB、agent logs 或憑證內容。
- 不新增 Developer ID、notarization、x86_64 build、cloud sync 或 production authentication。

## Capabilities

### Modified Capabilities

- `dev-diary-macos-app`: adds a current public-source privacy boundary and retains the immutable, revision-bound packaging/publication contract.

## Impact

- Source/docs readers: `src/App.jsx`, `core/src/db/seed.ts`, README/current test documentation and public GitHub source.
- Build/version readers: root npm metadata, Tauri/Cargo metadata, package script, App Info.plist and DMG verifier.
- Remote writers: one authorized push to `origin/main`, one new `v0.1.3` tag push, and one new GitHub Release with two assets.

## Risks

- False-positive hygiene could remove required platform/test paths; mitigation is an explicit allow boundary plus source-specific assertions.
- Revision drift could publish code other than the tested candidate; mitigation is clean-tree/exact-HEAD checks before packaging, tag creation, push and release.
- Partial remote writes could leave a tag or incomplete release; mitigation is fail-closed preflight and digest-based recovery without clobber.
- Ad-hoc signing still requires macOS manual approval and does not provide notarization; README/current spec keep that limitation explicit.

## Open Questions

None. The user explicitly authorized merge, push, App/DMG repackaging and DMG publication. “DMG 要 push” is implemented as a new GitHub Release asset rather than committing a binary into Git.

## Completion Evidence

Fresh evidence must bind one candidate commit to: current-source hygiene scan, complete Core/UI/Rust suites, type/build/spec gates, security review, independent black-box packaged verification, App/DMG versions and signatures, local/remote `main`, `v0.1.3`, Release metadata, downloaded DMG SHA-256, and clean worktrees.
