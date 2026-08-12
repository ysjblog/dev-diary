---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-3-publication-hygiene
reasons: external_writes, production_contract_changes, credentials_secrets
---
# Implementation Tasks: release-v0-1-3-publication-hygiene

## 中文摘要

先把發布與隱私契約審清楚，再完成 tests-first 實作與完整本機驗證；只有 exact candidate 的 App/DMG 通過獨立黑箱與安全 closer 後，才依序 fast-forward、push、tag、Release，最後從遠端下載回讀。

## Requirement Traceability

| Requirement | Design decision | Tasks | Verification |
|---|---|---|---|
| Packaging and desktop startup boundary | immutable v0.1.3 identity and fail-closed publication order | 2.1, 3.1-4.4 | complete suites, package verifier, isolated Core health, local/remote/tag/release/digest equality |
| Public release source privacy boundary | current-source exact identity scan plus production `/Users` guard | 2.1-2.3 | `releaseDistribution.test.js`, tracked-text scan, diff/security review |

## 1. Plan and Independent Review

- [x] 1.1 Record explicit user authority, exact baseline, remote/release inventory, no-overwrite boundary and Level-4 test plan.
- [x] 1.2 Pass strict OpenSpec validation and fresh Author Preflight, then complete the O3 initial review across all mandatory and standard lenses.
- [x] 1.3 Apply one consolidated Owner spec fix, resolve the closer root cause, verify every landing string, and receive one bounded fresh all-lens approval bound to the resulting artifact digest.

## 2. Tests-first Implementation

- [x] 2.1 Add failing regression assertions for v0.1.3 metadata alignment, current public-source private-path hygiene and verification-only GitHub workflow.
- [x] 2.2 Synchronize version declarations/README and remove machine-specific production/demo paths while preserving legacy provenance, platform candidates and anonymous fixtures.
- [x] 2.3 Run focused release, seed/UI, security and path-hygiene checks, including cached/untracked candidate files and a clean/hostile release-body fixture; update the Level-4 test checklist only after matching evidence passes.
- [ ] 2.4 Prepare the current Feature Spec and Traditional-Chinese MASTER changes without archiving; keep the Change active until remote readback and all required completion evidence pass.

## 3. Exact Candidate and Package Verification

- [ ] 3.1 Run fresh Core/UI/Rust tests, typecheck, production build, security/diff scans and candidate smoke; commit only the verified tracked allowlist.
- [ ] 3.2 Re-run revision-bound gates on clean HEAD and build a fresh `DevDiary_0.1.3_aarch64.dmg` from that exact commit.
- [ ] 3.3 Verify DMG integrity, App/Info.plist version, Finder layout, nested/outer signatures and isolated bundled-Core health; create basename-only `SHA256SUMS.txt`.
- [ ] 3.4 Complete independent black-box QA and fresh security closer against the same HEAD and artifact SHA-256; any drift returns to 3.1.

## 4. Merge, Push, Release and Readback

- [ ] 4.1 Fast-forward local `main` to the candidate and push `origin/main` without force; assert local/remote equality.
- [ ] 4.2 Create annotated `v0.1.3` at the same commit and push only that new tag after remote absence preflight.
- [ ] 4.3 Create the new GitHub Release and upload only DMG/checksum without overwrite or clobber.
- [ ] 4.4 Download both assets into a fresh temp directory, run checksum validation, compare remote/local digests and confirm main/tag/release identity plus clean worktrees.

## 5. Successful Publication Closeout

- [ ] 5.1 Archive this Change only after step 4.4 remote readback and all required completion evidence pass.
- [ ] 5.2 Reconcile current Feature Spec/MASTER, run strict all-current validation/preflight, commit only documentation evidence, push `main` without force and confirm local `main == origin/main`; do not move `v0.1.3`.

## Verification

Run strict OpenSpec/preflight, focused release tests, `npm test`, `npm run build`, Core test/typecheck, Rust tests, revision-bound smoke/security/diff checks, `npm run package:mac`, `scripts/verify-macos-release.sh`, isolated bundled-Core health, Git remote/tag equality, `gh release view`, fresh asset download and `shasum -a 256 -c SHA256SUMS.txt`.

## Open Questions

None. A failure at an external step follows the recovery table in Design and never authorizes an overwrite, delete, force push or retarget.
