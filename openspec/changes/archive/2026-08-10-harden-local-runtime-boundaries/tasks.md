---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-local-runtime-boundaries
reasons: auth_authorization
---
# Implementation Tasks: Harden local runtime boundaries

## 中文摘要

先完成安全契約、嚴格驗證與獨立規格審查，再以失敗測試依序鎖定 Origin 授權、台北日期、runtime PID 與 LaunchAgent 路徑。產品修正後才建立可重現的 smoke/digest 證據，最後跑完整測試、真實 localhost、桌面畫面、獨立黑箱與安全複核；所有證據綁定同一 revision，不碰使用者資料或 launchctl。

## 1. Contract and review gates

- [x] 1.1 Record current facts, root-cause reproductions, actors, protected effects, readers/writers, operation order, compatibility, rollback and residual no-Origin/native-process risk.
- [x] 1.2 Complete Proposal, Delta Spec, Design and `doc/test/reliability-security-hardening.md`; run strict OpenSpec validation and fresh Author Preflight with receipt.
- [x] 1.3 Build a revision-bound Contract Matrix covering all Change artifacts, current baseline and the load-bearing `doc/test` plan. Run the official router over all five standard lenses; in the same canonical receipt require separate `trigger_lens_results` for security and authorization, and validate those fields fail-closed because the out-of-scope global router cannot union both sets.
- [x] 1.4 If the initial review finds anything, apply exactly one consolidated Owner artifact fix, verify every landing string, rerun strict validation/Preflight, and record a durable Author-fix receipt.
- [x] 1.5 Obtain one fresh Sol closer over the complete reviewed contract; require pass for all five official standard-lens results and both trigger-lens results, then converge with zero unresolved mandatory-lens or cross-file finding before any executable product/script change.
- [x] 1.6 Confirm no local implementation gate needs further user choice; preserve separate authority gates for merge, push, deploy/release, install/launchctl, provider spend, private runtime data and branch deletion.

## 2. Test-first regression shield

- [x] 2.1 Add Core tests that fail on the current code for untrusted/opaque/lookalike Origins; hostile-Origin GET and OPTIONS; trusted OPTIONS; no-Origin CLI GET, mutation and OPTIONS; absent-Origin cross-site Fetch Metadata; invalid/empty/duplicate/built-in-collision additional origins; malformed JSON ordering; representative simple/JSON mutations; and zero middleware-next/provider/DB effects. Enumerate every current mutation method/route through the central guard.
- [x] 2.2 Add Core boundary tests that fail on raw UTC session calendar labels at `15:59:59Z`/`16:00:00Z`/`17:30:00Z`, the exact qualified-identifier grammar (including leading digit, consecutive/trailing dot and SQL fragments), diary evidence, Kanban synthesis/AI evidence, and any timestamp-backed card-date behavior confirmed to be a Taipei calendar field. Preserve and test complete `Z`-suffixed export timestamps as UTC audit facts while their selection/grouping remains Taipei.
- [x] 2.3 Flip the JS missing-PID compatibility test to reject and add missing/string/zero/negative/dead/live PID, port bounds, wrong-service/non-loopback, URL/runtime mismatch and fallback tests; add the equivalent failing Rust matrix.
- [x] 2.4 Replace the packaged beside-app expectation with failing Rust tests for one Application Support source layout, registration-link identity, lint-before-registration, and cleanup limited to the current attempt; use only pure paths/temporary directories.
- [x] 2.5 Add failing self-tests for deterministic candidate hashing and in-memory runtime smoke, including arguments, success/failure exit, stable cleanup and revision/output validation before implementing their scripts.

## 3. Product and verification-tool implementation

- [x] 3.1 Implement one pre-parser browser-origin policy, all-or-nothing exact development-origin validation, stable non-reflective 403 envelope, trusted CORS/preflight, absent-Origin native compatibility and absent-Origin cross-site rejection; keep the guard central for every route.
- [x] 3.2 Constrain `sqliteTaipeiDate`/`sqliteTaipeiHour` to trusted qualified identifiers and replace remaining session-derived UTC prefix labels with `taipeiDate`; do not rewrite date-only arithmetic or persistent timestamp rows.
- [x] 3.3 Align JS/Rust manifest consumers on canonical runtime host/port/live numeric PID, matching optional URL and bounded fallback port while keeping the explicit JS loopback URL override.
- [x] 3.4 Remove packaged beside-Applications storage, keep launcher/source plist in Application Support, use one per-user registration link, validate source before replacement, and clean only the exact current-attempt registration on failure; never invoke actual install during tests.
- [x] 3.5 Implement `scripts/verification-candidate-digest.sh` and `scripts/smoke-local-runtime.mjs` until their test-first contracts pass; smoke uses dynamic loopback, `:memory:` SQLite, synthetic Taipei fixtures and mock/provider effect counters with `finally` cleanup.
- [x] 3.6 Update only the planned current Feature Spec navigation/test documentation and remove no planned functionality or user WIP.

## 4. Integrated verification

- [x] 4.1 Run focused regressions, then full Core/UI API/Rust suites, Core typecheck, UI build, digest/smoke self-tests, `git diff --check`, secret/debug-log scan and Owner diff review serially where first-time compilation could contend for resources.
- [x] 4.2 Run provisional safe localhost smoke, supported 1280x820 desktop UI/host receipt, no-fork black-box QA and security/authorization review to discover runtime or cross-file failures. Store this provisional evidence under an external provisional revision and never reuse it for candidate completion.
- [x] 4.3 Consume every provisional finding, update code/tests/docs as needed, and rerun affected automated/provisional gates until no planned delivery-file fix remains.

## 5. Reconciliation, exact commit, and final evidence

- [x] 5.1 From fresh provisional evidence, mark tasks, sync/archive this Change into `openspec/specs/dev-diary-macos-app/spec.md`, reconcile `docs/specs/MASTER.md`, validate all current specs, run all-current Author Preflight, and finish every other delivery-file edit before candidate freeze.
- [ ] 5.2 Compute the deterministic candidate digest only after 5.1. Rerun all automated gates, safe actual localhost smoke with exact 5180 origins, desktop UI/host receipt, independent black-box QA and security/authorization closer into `/tmp/devdiary-reliability-security-hardening/<candidate>/`. Any later delivery-file edit discards this evidence and returns to 5.1.
- [ ] 5.3 Stage only the exact candidate-verified allowlist, protect unrelated/pre-staged work, and create one conventional commit; do not merge, push, deploy, release, install or delete branches.
- [ ] 5.4 Against final `HEAD`, rerun automated gates, actual smoke, desktop UI/host receipt, independent black-box QA and security closer into `/tmp/devdiary-reliability-security-hardening/<final-HEAD>/`; do not reuse provisional or candidate runtime evidence.
- [ ] 5.5 Confirm the feature worktree is committed/clean, primary `main` remains unchanged/clean, no root screenshots leaked, and the final report separates local proof from deferred installed-app/remote proof.

## Requirement Traceability

| Requirement | Tests first | Implementation | Runtime / review |
|---|---|---|---|
| Loopback browser-origin authorization is fail-closed | 2.1 | 3.1 | 4.1–4.3, 5.2, 5.4 |
| Session-derived calendar projections use Asia/Taipei safely | 2.2 | 3.2 | 4.1–4.3, 5.2, 5.4 |
| Runtime manifest routing requires live process identity | 2.3 | 3.3 | 4.1–4.3, 5.2, 5.4 |
| Background-runner support files stay in the user data boundary | 2.4 | 3.4 | 4.1–4.3, 5.2, 5.4 |
| Revision-bound verification toolchain | 2.5 | 3.5 | 4.1–4.3, 5.1–5.4 |

## Verification

- Automated: focused and full Core Vitest, root node:test API/UI suite, Rust unit suite, Core typecheck, Vite build, verification-script self-tests, strict OpenSpec, diff/secret/debug-log checks.
- Runtime: dynamic loopback in-memory Core smoke with exact 5180 trusted origins and synthetic Taipei fixtures.
- UI: supported desktop-only 1280x820 capture plus host-bound receipt.
- Independent: provisional discovery plus fresh no-fork black-box QA and security/authorization closer after all delivery reconciliation on both candidate digest and final commit SHA.
- Review receipts: the official router validates five standard lens fields; a fail-closed structured assertion validates `trigger_lens_results` contains exactly security/authorization. Both must pass in the same canonical receipt.
- Forbidden proof substitutions: no private runtime database, real provider, launchctl/install, packaged soak, merge, push, deploy or release.

## Open Questions

None. Human authority gates and every product/testing decision are resolved in Proposal and Design.

## Completion Rule

No checkbox is complete from plan text alone. A test checkbox requires an observed pre-fix failure and post-fix pass; runtime/UI/independent/security checkboxes require fresh exact-revision artifacts; installed-app, launchctl, merge, push, deployment and release remain explicitly unperformed.
