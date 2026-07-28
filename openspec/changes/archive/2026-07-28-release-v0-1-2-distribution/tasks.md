---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-2-distribution
reasons: external_write
---
# Implementation Tasks: release-v0-1-2-distribution

## 中文摘要

先完成規格審查和測試計畫，再調整版本、打包、驗證、提交與發佈。所有外部寫入都在相對應的本機證據通過後才執行。

## Requirement Traceability

| Requirement | Design decision | Task | Verification |
|---|---|---|---|
| Packaging and desktop startup boundary | metadata/order/recovery steps 1-6 | 2.1-3.4 | metadata checks, DMG verifier, tag/release readback |

## 1. Plan and Review

- [x] 1.1 Confirm user authorization, exact source revision, existing release inventory, and no-overwrite boundary.
- [x] 1.2 Administrative closeout authorized by the user on 2026-07-29. The archived review record retains the prior closer findings and root-cause notes; this checkbox does not claim an additional independent review.
- [x] 1.3 Add the Level-4 release test plan before executable metadata changes.

## 2. Implementation and Local Verification

- [x] 2.1 Synchronize `0.1.2` across npm, lockfile, Tauri, Cargo, and README release examples; make the release workflow manual-only and fail closed for any existing release state.
- [x] 2.2 Run metadata/workflow consistency, root tests/build, Core tests/typecheck, and diff/security checks.
- [x] 2.3 Build a fresh `DevDiary_0.1.2_aarch64.dmg`, run the mounted release verifier, check its Info.plist version, and write its SHA-256 checksum file from its sole upload path.

## 3. Commit and Publish

- [x] 3.1 Commit only the tracked metadata, README, test-plan, and OpenSpec documentation allowlist after all local gates pass.
- [x] 3.2 Re-run revision-bound checks, bind one-shot authority to repository/commit/tag/assets/digests/actions, create annotated `v0.1.2`, and push `main` plus the tag.
- [x] 3.3 Preflight tag/release/assets, create the `DevDiary v0.1.2` GitHub Release, upload the DMG and checksum, and verify the downloadable checksum. The owner corrected the checksum pathname after readback; the tag and DMG were never replaced.
- [x] 3.4 Record the final external evidence and leave the working tree clean.

## Verification

Run `npm test`, `npm run build`, Core tests/typecheck, workflow guard test, `scripts/verify-macos-release.sh`, version/Info.plist/DMG name checks, SHA-256, `git ls-remote`, and `gh release view`. The external checks must name the exact `v0.1.2` tag and release commit.

## Open Questions

None.
