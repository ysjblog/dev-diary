---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-2-distribution
reasons: external_write
---
# Change Proposal: release-v0-1-2-distribution

## 中文摘要

將已推送的 DevDiary 最新原始碼發布為新的 `v0.1.2` macOS DMG。版本來源、安裝檔名稱、Git tag 與 GitHub Release 必須一致；舊有 `v0.1.1` release 不可被覆寫。

## Why

`main` 已包含 `v0.1.1` 之後的 7 筆提交，但現有 GitHub Release 的同名 DMG 指向舊內容。使用者已明確授權建立新的可下載版本，而非覆蓋既有發佈檔。

## What Changes

- 將 root npm、lockfile、Tauri 與 Cargo 的應用程式版本同步從 `0.1.1` 升為 `0.1.2`。
- 重新打包並驗證一份 `DevDiary_0.1.2_aarch64.dmg`。
- 以版本提交建立並推送 `v0.1.2` tag，再由唯一的 Owner CLI 發佈步驟建立同名 GitHub Release，上傳 DMG 與 SHA-256 checksum。
- 將 GitHub Actions release workflow 改為僅允許明確手動執行、拒絕既有 tag/release/asset，且不含 asset overwrite 行為。
- 更新 README 的下載與打包檔名範例。

## Scope

- Included: version metadata, README release references, release-workflow fail-closed guard, local release package verification, one Git commit/tag push, and one GitHub Release asset upload.

## Non-Goals

- 修改產品功能、覆寫或刪除 `v0.1.1`、Developer ID signing/notarization、雲端資料寫入。

## Human Gates

- Actions requiring explicit human authority: 本次使用者訊息「同意」授權上述新版本的 Git/GitHub 外部寫入；不得將其擴大為覆寫、刪除或後續版本發布的授權。

### Modified Capabilities

- `dev-diary-macos-app`: modifies the packaging and desktop startup boundary with a version-to-artifact release provenance requirement.

## Capabilities

The only affected capability is `dev-diary-macos-app`; no new capability is introduced.

## Impact

- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `README.md`, and `.github/workflows/macos-release.yml` change.
- The only local release artifact source is `src-tauri/target/release/bundle/dmg/`; it is uploaded to GitHub Release and never committed to Git.

## Risks

- Risk: a version declaration or release target can drift. Mitigation: compare all four metadata sources, artifact name, immutable tag target, checksum, and release asset digest before publishing.
- Risk: upload failure after tag push. Mitigation: retain the tag and local artifact, report the partial state, and do not retry with an overwrite operation.
- Use patch version `0.1.2`; do not replace the existing `v0.1.1` asset.

## Open Questions

None. The user approved the recommended `0.1.2` release path.

## Completion Evidence

Fresh evidence must include metadata consistency, root tests/build, mounted DMG verification, checksum, exact tag target, GitHub Release asset metadata, and a clean working tree after push.
