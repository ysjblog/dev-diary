---
openspec_level: o3
template_version: owner-workflow/v1
change: add-codex-desktop-auto-resume
reasons: external_write,workflow_state,data_migration
---
# Implementation Tasks: Codex Desktop 多任務額度恢復續跑

## 中文摘要

以 exact UUID CLI queue 完成多任務註冊、quota-only 觸發、持久 claim/recovery、專用 API/UI 與安全驗證。

## Requirement Traceability

| Requirement | Implementation | Verification |
|---|---|---|
| Accepted queue requests open the registered Desktop task | bounded opener/background consumer | W1-W8 foreground wake verification |
| Recovery timing and sequential segment repair | quota parser/engine checkpoint transfer | time boundary, retry cap, segment and quarantine regressions |
| Vendor apostrophe variants preserve strict quota evidence | strict quota prefix allowlist | straight/curly, malformed, original digest and no replay |
| Bounded background session verification | session lookup deadline/engine | slow scan, overflow, invalid budget and safe recovery tests |
| Deep link registration establishes one exact task identity | contracts/session lookup/repository | malformed/duplicate/drift tests |
| Only post-registration quota exhaustion may trigger continuation | strict parser/engine | real-shape/fake-text/time tests |
| Continuation uses fixed exact UUID CLI dispatch | CLI dispatcher/global lease | exact argv/ack/crash-no-replay tests |
| Users can safely manage multiple targets | dedicated API/React UI | API/UI/runtime black-box |
| New local-provider UI rejects an old Core runtime | health/manifest/pre-parser/client | drift/CORS/version tests |

## Test Preparation

- [x] 1.0 Preserve the 5-second foreground scan deadline and use a bounded 30-second background scan deadline for monitoring/recovery, with deterministic budget/overflow and engine recovery regressions.

- [x] 1.1 Route as Level 4 and document fixture-only runtime; no real Codex message during tests.
- [x] 1.2 Define malformed identity, quota spoof, multi-target race, runtime drift and crash replay cases.

## Implementation

- [x] 2.1 Add v8 dedicated schema, migration, contracts and repository CRUD/claim state.
- [x] 2.2 Add bounded logical-thread lookup with fail-closed sequential segment handling, checkpoint integrity and strict actual-shape quota parser.
- [x] 2.3 Replace exec resume with Desktop-CLI-first `codex queue --thread <UUID> --message 繼續`, same-store CODEX_HOME, exit-bound durable receipt, sanitized errors and no-replay behavior.
- [x] 2.6 Display accepted continuation request without claiming task execution; preserve prior consumed evidence during repair recovery.
- [x] 2.4 Add v8 health capability, verified runtime mutation binding, strict CORS and dedicated routes; retire legacy mutation routes.
- [x] 2.5 Add multi-target Settings UI with register, global/individual pause, rename, unregister, state/reset/error display and no Accessibility input dependency; foreground wake is added below.

## Verification

- [ ] 3.1 Pass strict OpenSpec, fresh Author Preflight and O3 review after final artifacts.
- [x] 3.2 Pass all Core/UI/Rust tests, Core typecheck, production build, diff/security checks.
- [x] 3.3 Pass temp DB/session/fake CLI API-to-dispatch runtime smoke without contacting real Codex.
- [ ] 3.4 Capture desktop-only localhost UI and complete independent black-box QA.

## Rollback

- [x] 4.1 Global pause or per-target unregister is recoverable and never deletes Codex session files.

## Open Questions

None.

本次 queue 修復的 runtime、UI 與 independent QA 必須重新取得 revision-bound 證據；舊完成勾選與舊 converged receipt 不得代用。

2026-09-20：376 Core、82 UI、type/build、真實 CLI 隔離 smoke、打包與 package smoke 通過。獨立 browser gate 被 Worker hook 拒絕；3.4 保持未完成。安裝版與真實 registration 未修改。

## Recovery repair

- [x] 5.1 Review bounded grace/retry and verified sequential-segment checkpoint policy.
- [x] 5.2 Add regression fixtures before implementation, then repair parser/engine.
- [x] 5.3 Complete fixture runtime smoke, independent QA/security review, full tests/type/build and DMG package checks.

2026-09-21：恢復修復 Owner Core395／UI82／Rust23、type/build、DB-copy smoke 及 DMG integrity/signature 通過；首位獨立 reviewer 額度中斷後，另一 reviewer 完成10/10；已替換安裝 App 並確認背景自動送出、新 turn 開始。休眠任務背景喚醒仍未普遍證明。

## Foreground-assisted wake amendment
- [x] 6.1 Complete O3 integration-authority/failure-recovery review and fresh closer for the foreground wake amendment.
- [x] 6.2 Define Level 4 wake, ordering, timeout, store mismatch and no-replay tests; implement bounded opener and wire the background consumer.
- [x] 6.3 Run Owner smoke, independent QA, full tests/type/build/security/diff and desktop disclosure verification.
- [ ] 6.4 Verify controlled registered-target wake with actual start evidence, package and report precise installed/runtime limits.

2026-09-23：foreground wake 已實作、409 Core／82 UI／23 Rust、type/build、Owner fixture、獨立16/16、安全接線及桌面畫面檢查通過；受控 notLoaded 任務當下成功開始；新版 App 已備份替換、hash/signature/背景程序與監看恢復確認。後續真實排程在09-22 16:42已切換並要求resume，但Desktop至09-23 00:33才完成resume；6.4的可靠無人操作啟動仍未完成，不能把open接受算成開始。

2026-09-24：修正 evidence 讀取撞上 Codex 同時寫入時被誤判 `session_integrity_changed` 而永久停止（改為最多重讀3次，仍不穩定則本輪跳過、不寫狀態不派送；真實截斷／改寫仍停止），新增 `core/test/codexDesktopResumeReadRace.test.ts` 5案；advisor 審查 APPROVE。fresh：430 Core／83 UI／24 Rust、Core typecheck、`npm run build`、diff secret scan 通過。09-23 17:22 另有一次螢幕關閉下真實恢復開始（`doc/test/codex-resume-status-20260924.json`），但只一次，6.4 可靠性仍未證明；此修正尚未打包安裝；3.1／3.4 仍待最終 artifacts 的 O3 審查與獨立黑箱 QA。
