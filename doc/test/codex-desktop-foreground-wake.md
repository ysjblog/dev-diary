# Foreground wake verification

TEST DEPTH ROUTE
Level: 4; repeated critical unattended workflow, external-write and subprocess lifecycle.
Runtime smoke: REQUIRED. Black-box QA: REQUIRED, independent.
Required: exact identity/store, sequence, process cleanup, no replay, consumer wiring, full tests/types/build, desktop disclosure and actual-start observation.
Allowed skips: lint if no configured command. Sleep/unlock is outside supported behavior.

ROOT CAUSE DEBUGGING
Symptom: queued continuation waits until Desktop navigates to the task.
Observed evidence: queue dispatcher ends at receipt; installed Desktop renderer gates automatic execution by readiness/host ownership.
Root cause: queue acceptance has no target-load step. Foreground navigation supplies that missing step; controlled cold activation remains to be verified.
Fix boundary: wrap queue with exact deep-link open; existing receipt/evidence/lease protection remains.

SECURITY REVIEW ROUTE
Protect exact task/store and one-message policy. Canonical UUID and canonical Desktop root fence input before queue; shell-free fixed app/argv; no prompt/name/raw diagnostics in opener. Group termination unknown keeps quarantine; no replay after queue/open failure. Same-user local tampering remains outside trust boundary.

- [x] W1 Queue then one exact open, never open before ack or on failure/unknown cleanup.
- [x] W2 Invalid UUID, alternate store, missing store yield zero subprocesses.
- [x] W3 Open failure/timeout/descendant uncertainty preserves no-replay and quarantine.
- [x] W4 Existing accepted rows and restart do not resend/reopen; other target serialization unchanged.
- [x] W5 Production background consumer invokes composed dispatcher.
- [x] W6 Independent fixture runtime and full owner verification.
- [ ] W7 Real registered dormant target: exactly one existing queued continuation, navigation, actual new turn; distinguish from preloaded target.
- [ ] W8 Desktop disclosure and package/source/install evidence.

## Bug Pattern Coverage

| Pattern | Cases | Observable evidence |
|---|---|---|
| Canonical input/malformed/security injection | W2 | zero fake queue/open invocations |
| Operation order and generated contract consumed | W1,W5 | fake CLI receipt precedes exact open argv through production composition |
| Deadline boundary/partial outcome | W3 | timeout code, process group gone or quarantine |
| State/history/restart | W4 | consumed cursor unchanged; one queue/open across engine instances |
| Dirty legacy state | W4 | accepted old row never opened on upgrade |
| Foreground behavior | W7,W8 | actual new turn and visible truthful disclosure |
| Rule priority/opt-out | W2,W4 | mismatch before write; disabled and active-lease exclusions inherited and tested |

## Runtime Verification Route
Safe environment: temporary SQLite/session files, fake queue/open executables; actual Node process via tsx.
Forbidden: real message sends in automated/QA tests; production DB edits; unlock or quota/approval bypass.

## [ ] 【整合流程】確認單一收據後才開啟同一任務
**範例輸入**：fixture quota 到期、exact queue receipt、fake opener exit 0。
**期待輸出**：queue/open 各一次、argv UUID 相同、之後 tick 不重送。

## [ ] 【錯誤處理】開啟逾時仍不重播
**範例輸入**：queue 成功、fake opener 超過期限。
**期待輸出**：需要檢查；清除群組後才釋放 lease；重啟後不重送。

## 2026-09-23 verification
W7 controlled source-dispatcher test PASS: pre notLoaded, queue count zero; one authorized message, exact open, new inProgress turn in same second, queue drained. Later installed scheduled execution did not start promptly: queue/open accepted 2026-09-22 16:42:17 +08; Desktop logs confirm correct active target and maybe_resume_started then, but maybe_resume_success only 2026-09-23 00:33:08 +08. Internal request timeouts also present. Screen was off in the intervening interval, causality unproven. Unattended reliability remains NOT READY.
W8 screenshot/source/package/install parity and signature PASS; original two registrations and enabled global state retained; background LaunchAgent running. No source commit: prior feature WIP inseparable. No push/release.
