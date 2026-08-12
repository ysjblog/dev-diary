---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-3-publication-hygiene
reasons: external_writes, production_contract_changes, credentials_secrets
---
# Technical Design: release-v0-1-3-publication-hygiene

## 中文摘要

發佈順序是「先固定可測的來源，再產出並驗證 App/DMG，最後才寫遠端」。發布 identity 由單一 candidate commit、`v0.1.3`、固定資產名稱與 SHA-256 組成；任何一項不一致都停止，且不覆寫已存在的遠端內容。

## Context

- Baseline `origin/main` is `af1a21311eea49787d9beddbaa6d36bb29c22720`; feature candidate begins at `e66c93bba9d88a06c259327ccd3c0831cadc98cd` plus this release-prep diff.
- Existing releases include `v0.1.2`; no `v0.1.3` tag/release/asset existed at kickoff.
- `scripts/package-mac-release.sh` produces one exact versioned Apple Silicon DMG, bundles pinned Node `22.23.1`, seals the staged App ad hoc, configures Finder metadata and runs `scripts/verify-macos-release.sh`.
- Current tracked production/demo source contained literal user-home examples and one current worktree document contained the real checkout path; these are not necessary runtime inputs.

## Goals / Non-Goals

- Goal: publish one clean, traceable, fresh v0.1.3 App/DMG from the exact merged commit.
- Goal: keep current public source free from this maintainer's real checkout/home/volume identifiers and from production `/Users/<literal>/...` demo roots.
- Non-goal: rewrite immutable legacy evidence, standard system path candidates, anonymous fixture paths, or add code-signing credentials.

## Threat and Authority Model

- Actors: the local Owner process is the sole publisher; GitHub users are read-only downloaders; GitHub and `origin` are external sinks.
- Protected data: private checkout/home/volume strings, credentials held by the existing `gh` session, and local runtime data. No credential contents or private DB/logs are read or printed.
- Authority: this user turn authorizes only merge/push of this repository, new v0.1.3 tag/release creation and its DMG/checksum upload. It does not authorize overwrite, delete, retarget, unrelated repositories/assets, deployment, or installation into `/Applications`.
- Mandatory O3 lenses: compatibility, failure recovery, integration authority, rollout, secret handling and security; the standard data/facts, naming/types, blast-radius, execution-order and logic/design lenses also remain in the independent spec review.

## Runtime Path and Data Flow

Tracked candidate source -> complete local gates -> conventional commit -> clean immutable HEAD -> fresh App/DMG build -> mounted verifier and isolated temporary runtime smoke -> independent QA/security closer -> fast-forward local `main` -> push `origin/main` -> annotated `v0.1.3` tag -> tag push -> new GitHub Release -> DMG/checksum upload -> fresh download/digest readback.

Public path hygiene flows separately: tracked current text -> exact private-identity scan excluding `docs/specs/legacy/` -> production source scan for literal `/Users/<name>/` demo roots. Test fixtures and platform candidates remain covered by functional tests rather than global deletion.

## Decisions

- Use v0.1.3, not v0.1.2 overwrite: immutable release history is recoverable and auditable.
- Publish the DMG as a Release asset, not a tracked Git blob: Git remains source-focused and the downloadable artifact retains release metadata/checksum.
- Keep legacy provenance untouched: historical paths explain old evidence and are explicitly non-authoritative; rewriting them would destroy audit history.
- Replace seed paths with `join(tmpdir(), ...)` and UI placeholders with non-filesystem examples/current detection state, rather than guessing another user's home.
- Do not launch/install the full App against the user's real HOME during verification; copy the App from the DMG into a temporary directory and exercise its bundled Core with isolated HOME/DB/manifest.

## Contract Inventory

- Version writers: `package.json`, `package-lock.json` top-level and `packages[""]` root entry, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, the `app` package entry in `src-tauri/Cargo.lock`, and README examples.
- Version readers: npm/Tauri/Cargo packaging, generated App Info.plist, exact DMG path, verifier, tag, GitHub Release and checksum file.
- Hygiene writers: production seed path constructor, UI fallback/placeholder data, current non-legacy documentation and `scripts/check-public-release-hygiene.mjs`.
- Hygiene readers: seed users, React initial/fallback UI, repository browsers and release builders.
- Artifact names: `DevDiary_0.1.3_aarch64.dmg` and `SHA256SUMS.txt`; checksum content uses the DMG basename only.
- Remote identity at publication: `main`, `origin/main`, peeled annotated `v0.1.3` tag and Release target resolve to the same candidate commit. After successful readback, one documentation-only archive commit may advance local/remote `main` together without retargeting the release tag.

## Execution Order and Failure Recovery

1. Preflight GitHub authentication/repository and assert `v0.1.3` tag/release do not exist. This is read-only.
2. Complete spec review, tests-first release assertions, source hygiene/version edits, current spec/MASTER reconciliation, strict validation and full local suites.
3. Commit the exact allowlist. Re-run revision-bound source/security gates and require a clean tree.
4. Package fresh App/DMG from that HEAD. Verify DMG integrity, App metadata, nested/outer signatures, Finder layout and isolated bundled-Core health; compute digest.
5. Independent black-box and fresh security closers must approve the same HEAD/artifact digest. Any source change invalidates them and returns to step 3.
6. Fast-forward local `main` to candidate, push `main`, create annotated tag at that exact commit and push only that tag. A non-fast-forward or mismatched remote stops publication.
7. Re-preflight absent Release/assets, then create `DevDiary v0.1.3` and upload only the DMG and checksum without `--clobber`.
8. Download both assets into a fresh temporary directory, run checksum verification, compare digests/size and assert the publication-time local `main`, `origin/main`, tag and Release target match.
9. Only after all required completion evidence passes, archive the Change, reconcile current Feature Spec/MASTER and make one documentation-only closeout commit. Push `main` again and assert local `main == origin/main`; the immutable release tag remains on the tested package commit.

### Partial publication recovery

| Observed remote state | Safe action |
|---|---|
| main push failed | stop before tag/release; resolve divergence without force push |
| main matches, tag absent | create/push tag only after local candidate/artifact identity is rechecked |
| tag matches, release absent | create release only after tag target and local digest recheck |
| release exists, no assets | upload both only when release target matches and names are absent |
| exactly one expected asset exists | download and verify its digest; upload only the absent asset |
| either asset exists with different bytes, or tag/Release target differs | stop; do not overwrite/delete/retarget; require new user authority and a new version |

## Security and Privacy

- No tokens, auth status internals, private DB, agent logs, screenshots or raw environment values enter tracked files or release notes.
- `gh auth status` is used only to establish publish capability; output is not persisted in release artifacts.
- `scripts/check-public-release-hygiene.mjs` derives the current checkout and account identity from Git worktree/home boundaries, scans cached plus untracked non-ignored candidate files, and accepts a `--release-notes` file; the regression source does not contain the maintainer identity literal.
- Release notes MUST pass the same privacy scanner before creation and after remote readback.
- Release notes describe only verified changes; manual-approval/ad-hoc-signing and Apple Silicon limits remain explicit.

## Migration and Rollback

- v0.1.3 remains Apple Silicon, local-first and ad-hoc signed; existing settings/SQLite schema require no migration.
- `main` is advanced by fast-forward only for the release candidate. After successful remote readback, an evidence-only archive commit may advance local and remote `main` together; the feature branch remains as a local recovery reference until separate cleanup authority.
- Code rollback is a new revert commit on `main`, which is pushable without rewriting history. Published v0.1.3 remains immutable; a corrected binary uses a new patch version rather than replacing it.
- Local ignored App/DMG artifacts may be rebuilt or discarded without affecting Git. No `/Applications` install or LaunchAgent registration is part of this release verification.

## Risks / Trade-offs

- A bundled-Core smoke is narrower than a full installed/Finder/manual-approval user journey; the mounted verifier covers bundle structure and signature, while actual install/long soak remains a documented limitation.
- `tmpdir()` seed examples are platform-dependent by design and non-sensitive; functional seed tests must prevent behavioral drift.
- GitHub may accept main/tag but fail during asset upload; the recovery table preserves immutable state and forbids clobber.

## Open Questions

None. The exact repository is `ysjblog/dev-diary`, the release is `v0.1.3`, and only the new DMG plus checksum are public binary assets.
