# QA Black-Box Report

SOL VERDICT: APPROVE

信心：高（限本次本機 observer、真實 worker 與唯讀接線審查範圍）。

- Environment: temporary synthetic sessions/logs/state, Node v22.23.1
- Revision / HEAD SHA: 6d55c34224518e1fdfc4748851808ee77acc2ae8 plus dirty candidate file hashes below
- Timestamp: 2026-09-23T04:28:45.479Z
- Public entry: createCodexResumeObserver(options).wrap(dispatcher), tick(); real worker stdin/stdout
- Test depth: Level 4 independent black-box QA + security source-to-sink review
- Owner / QA Worker identity: /root / /root/observation_qa
- Independence method: no-fork worker; acceptance and API read first; implementation opened only after initial black-box suite
- Bounded lens: local fixture behavior, privacy, limits, failure isolation, read-only background wiring
- Result: PASS after initial deadline finding was repaired; no production task sent

## Candidate hashes

- core/src/services/codexResumeObservation.ts: a47a23ab1f779afc28e0f9342ac642cdf7e16b6ceeb40552d1dadf2e30be9a51
- core/src/services/codexResumeObservationWorker.mjs: 52a5304ed1efcc9469a0451b2f4541f549eb28585356a58c0f2beca1f03a56e4
- core/src/backgroundRunner.ts: 1ad50491eb65c586a8a1eff1d1b5862673205dc7396cbf67891ca69bdf97ff29

Before/after hashes matched for every final runtime scenario.

## Scenarios

- [PASS] fresh start and private persisted state
- [PASS] existing old fake events rejected
- [PASS] restart pending no replay
- [PASS] deadline snapshot exact and idempotent
- [PASS] delayed tick event deadline late
- [PASS] delayed tick event deadline exact
- [PASS] delayed tick event deadline before
- [PASS] source truncate
- [PASS] source replace
- [PASS] source symlink
- [PASS] source escape
- [PASS] source huge
- [PASS] source malformed
- [PASS] source partial
- [PASS] source fake_uuid
- [PASS] partial baseline excludes suffix
- [PASS] diagnostic path file preserves dispatcher
- [PASS] state symlink does not modify victim
- [PASS] bad persisted state does not resolve paths
- [PASS] dispatcher thrown error preserved once
- [PASS] real worker 4 log limit statistics and privacy
- [PASS] FIFO refuses within timeout
- [PASS] 100 finished records and 256KiB cap
- [PASS] home-contained traversal with valid session_meta refused
- [PASS] empty and dot locator segments refused

## Evidence

- Repeatable script: /tmp/devdiary-observation-qa-rerun.mjs
- Fresh machine-readable evidence: /tmp/devdiary-observation-qa-results.json
- Temporary source fixtures: /tmp/devdiary-observation-qa-final-VXVbYl
- Command (repository cwd): /Applications/DevDiary.app/Contents/Resources/core/node/bin/node --import ./core/node_modules/tsx/dist/loader.mjs /tmp/devdiary-observation-qa-rerun.mjs
- Count independently checked using python3: 25 PASS; 0 FAIL.
- Expected diagnostic failures emitted only the fixed warning: DevDiary resume diagnostics unavailable; continuation behavior unchanged.
- No screenshots/UI claims; no network requests.

## Findings

0. P2, CLOSED in final worker candidate: Owner identified that sessions/../outside.jsonl remained inside Codex home but escaped the allowed session area. Earlier 23-case approval for worker 8d5ede0f is superseded. Reviewer inspected new safePath segment validation and independently exercised a valid-session_meta file outside sessions: source_unavailable, no start accepted. Empty and dot segments also refused; legal sessions still observed successfully. All previous 23 scenarios reran on worker 52a5304e; none reused as fresh evidence.

1. P2, CLOSED after fresh rerun: initial candidate d2331b974bf8084add2990b9031ccc59ad57bb68844aea355de7759b3f99f7c5 accepted a task_started at deadline+1ms as new_turn_observed when tick was delayed. Reproduction fixture: /tmp/devdiary-observation-qa-boundary-4O0AQd. Expected not_observed; actual new_turn_observed. Root cause was event upper bound now rather than deadline. Final candidate passes delayed tick with events deadline-1ms / exact deadline / deadline+1ms, including restart before tick.
2. Informational operational limit: service caps pending observations at 32; excess requests continue dispatching but get no observation record, with fixed warning. Two pending sources are checked per tick, so collection can lag deadline under load. Owner documented this limit; reviewer independently read doc/test/codex-resume-observation.md after the update. No accepted-event deadline relaxation remains.
3. Initial harness corrections: cap test mistakenly required exactly 100 pending records although public requirement is at most 100; two diagnostic failure fixtures were initially created after constructor had already made the directory. Corrected setup and 100 completed-record retention were rechecked; those harness failures are not product findings.

## Security / integration evidence

- Protected asset: private session/log contents and continued dispatcher behavior.
- Trust boundary: DB-provided locator -> bounded isolated worker filesystem read -> allowlisted metadata -> private local state.
- Service validates exact record keys, digest/id formats, bounded sizes and snapshot fields; invalid state disables diagnostics before resolver use.
- Worker rejects empty, dot and dot-dot locator segments before resolution, and validates source within sessions/archived_sessions, canonical real path, O_NOFOLLOW, O_NONBLOCK, regular file, unique matching session_meta, device/inode/offset, delta <= 1MiB; only event_msg/task_started with valid UUID/time enters turn digest.
- Fixed executable and argv, shell=false, minimal PATH-only environment; process records omit command/path. Snapshot log reads are limited to four 256KiB tails from latest two date directories, fixed counters only. Synthetic private markers do not appear in real worker stdout/stderr or persisted observation.
- Persistent target symlink was rejected; victim remained unchanged. State write is 0600 exclusive random temp plus rename, with no raw error output. Source FIFO and unreadable diagnostic path fail without changing dispatcher result.
- Read-only integration trace: backgroundRunner.ts 136-147 constructs the observer and wraps production dispatcher; 151-157 calls observation tick independently before resume-engine tick; 186 schedules existing 30-second interval. Resolver SELECT uses a bound digest; observer has no resume DB write/retry call. No background process was started by this reviewer.

## Residual Risk

- No installed-app/package/signature/background-launch validation in this Work Packet; no real quota reset or causal relationship to task start proved.
- Process timeout configuration was inspected and FIFO nonblocking behavior exercised; no induced hung regular-file kernel I/O or forced-kill race test.
- No adversarial filesystem swap/race between path validation and open/rename, interrupted atomic rename, or sleep/reboot soak was exercised.
- Start observation means only matching session new task_started within the window, not dispatch causality or task completion.
- Scope excludes broader preexisting dirty resume/auth/UI changes; hashes above identify the only reviewed runtime candidate.

## 總整理

完成事項：獨立本機黑箱與安全接線審查完成；期限缺陷修正後25個案例通過。
目前意義：本機診斷功能的這個候選可繼續進入Owner的其餘驗證；不代表安裝或真實續跑成功。
下一步：Owner消化報告並完成其餘必要驗證；並行觀察限制已明示。
是否需要決策：本範圍不需使用者決策。
