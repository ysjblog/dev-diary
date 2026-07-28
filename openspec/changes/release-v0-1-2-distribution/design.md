---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-2-distribution
reasons: external_write
---
# Technical Design: release-v0-1-2-distribution

## 中文摘要

發佈採「版本資料先一致、建立物後驗證、提交與 tag 固定來源、最後建立 GitHub Release」的順序。任何版本不一致、DMG 驗證失敗或遠端回傳不同資產資訊，都停止在該步，不覆寫舊 release。

## Context

At planning time `main` was published at `92c7708`, while the only current GitHub Release was `v0.1.1` at `7330756`. At publication, `origin/main` and annotated `v0.1.2` both identified immutable release candidate `8c71412`; `v0.1.1` remains unchanged. The later local documentation revision `7d7aec5` records closeout evidence and is intentionally not part of the released DMG or tag.

## Goals / Non-Goals

- Goal: publish one new, traceable, verified DMG for the current `main` commit.
- Non-goal: overwrite, delete, or retarget existing release history.

## Threat and Authority Model

- Release source of truth: immutable `v0.1.2` / `8c71412` plus the four version declarations. Current closeout-document source of truth: checked-out `main` at `7d7aec5`; it does not retarget the release.
- Artifact source: `npm run package:mac` writes one fresh ignored DMG under `src-tauri/target/release/bundle/dmg/`; that exact path is the only upload candidate.
- Remote sinks: `origin/main`, immutable `v0.1.2` tag, and the GitHub Release for that tag.
- Authority: only the user-approved one-time Git/GitHub publish operations; no asset replacement, release deletion, or credential inspection.
- Required O3 lenses: `integration_authority` and `failure_recovery`.

## Runtime Path and Data Flow

Tracked version declarations -> `npm run package:mac` -> mounted DMG verifier -> SHA-256 checksum -> version commit -> annotated tag -> GitHub Release -> asset/readback verification.

## Decisions

- Use a patch increment to `0.1.2` because the current stable tag is `v0.1.1` and the source has additional commits.
- Use a new release rather than a clobber upload so tag and artifact provenance remain immutable.

## Contract Inventory

- Version fields: root `package.json`, root `package-lock.json` package entry, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
- Artifact contract: `DevDiary_0.1.2_aarch64.dmg` and `SHA256SUMS.txt`.
- Remote contract: `main` and annotated `v0.1.2` point to the same release commit; GitHub Release assets have matching name and digest.

## Execution Order and Failure Recovery

1. Update all four version declarations and README together; `rg` must find no old release version in active release instructions.
2. Update the manual GitHub Actions workflow so it has no tag-push trigger or release-write permission, accepts an explicit source ref, and only builds and verifies the artifact. The workflow never invokes `gh release` or `--clobber`; the user-authorized Owner CLI remains the sole publisher.
3. Build/test the exact candidate. Package only after source gates pass.
4. Verify the mounted DMG using `scripts/verify-macos-release.sh`; record SHA-256 and assert the app bundle version is `0.1.2`.
5. At the one-shot external-write checkpoint, bind the user authority to `ysjblog/dev-diary`, candidate commit, `v0.1.2`, `DevDiary_0.1.2_aarch64.dmg`, its checksum, `SHA256SUMS.txt`, and the exact `main`/tag/release-create/upload actions; reject overwrite, delete, retarget, extra asset, or a different commit.
6. Commit the exact tracked allowlist and rerun revision-bound checks. Create annotated `v0.1.2` at that commit, then push `main` and the tag.
7. Preflight remote state: tag must target the candidate commit and neither release nor either asset may exist. Create the GitHub Release from the pushed tag and upload the DMG plus `SHA256SUMS.txt` without `--clobber`.
8. Read back release tag, target commit, asset names, sizes, and digest. A failure before the GitHub Release leaves a recoverable pushed commit/tag.

### Partial-upload recovery table

| Observed state | Safe recovery |
|---|---|
| tag exists, release absent | read the tag target; create the release only if it still matches the candidate commit |
| release exists, no assets | read target/assets; upload both assets only if the release target matches and both names are absent |
| exactly one expected asset exists | verify its GitHub digest matches the local expected digest; upload only the missing asset |
| both expected assets exist | read back and finish only if both digests match; otherwise stop for new user authority and a new version |
| tag/release target or any existing digest differs | stop; never overwrite, delete, retarget, or auto-retry |

### Completed release evidence and exception

The owner created `v0.1.2` from `8c71412`, uploaded the 87,623,444-byte DMG, then downloaded both remote assets and verified the DMG digest. That readback found that the first checksum file used a build-relative pathname, so a user could not run it directly after download. Under the user's explicit publish authorization, the owner replaced only `SHA256SUMS.txt` with the same DMG digest and a basename-only pathname; the tag and DMG asset were not changed. A second remote download ran `shasum -a 256 -c SHA256SUMS.txt` successfully. This corrective exception is historical evidence, not authority for future automatic overwrite or deletion.

## Migration and Rollback

- Existing `v0.1.1` tag and assets remain unchanged. The workflow is manual-only and read-only; the Owner CLI is the sole publisher for this release.
- `v0.1.2` targets Apple Silicon and retains the documented manual-approval/ad-hoc-signing flow; this change does not add notarization.
- A discovered bad new release is not automatically deleted or replaced. Any corrective release requires a distinct user authorization and a new version.

## Security and Privacy

No signing key, GitHub token, private app data, or raw runtime database data is read or emitted. The release upload uses the already-authenticated GitHub CLI only after local artifact validation.

## Risks / Trade-offs

Publishing a source-built, ad-hoc-signed release exposes a manual-approval user experience but avoids introducing certificate credentials. The release is intentionally Apple Silicon only.

## Open Questions

None. The remote release name is `DevDiary v0.1.2`; it has no generated release notes so no unverified feature claim is published.
