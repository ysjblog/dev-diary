# 額度恢復延遲與換檔修復

## Root cause
到點後仍回傳同分鐘 reset，被解為隔天；最新 segment lookup 與固定註冊 inode 比較造成停看。已送出與已執行是不同證據。

## Test Depth Route
Level 4: repeated critical workflow, natural-language time parsing, persistent state and exact-target external writes. Runtime smoke REQUIRED (temporary DB and fake dispatcher). Independent black-box QA REQUIRED. No UI changes, no real target sends.

## Bug Pattern Coverage
Boundary minute/day/ordinal/DST; malformed vendor events; duplicated/copied evidence; restarted runner; repeated fresh failures; multi-target serialization; checkpoint integrity; new same-root segment vs cross-root/ambiguous identity; disabled/quarantined/claimed target; generated schedule actually gates dispatch.

## Cases
- [x] Parser recent past 35 seconds and midnight, explicit date, >60-minute bound, malformed format.
- [x] Initial 60-second grace, fresh failure 5-minute retry, at most three retries, restart/dedup/no-replay.
- [x] Sequential segment adoption, new quota, copied old errors ignored, old prefix drift/unknown action/paused target blocked.
- [x] Owner runtime smoke and independent black-box/security checks.
- [x] Full Core/UI suite, typecheck/build, diff review and package verification.

## Limits
Desktop dormant-thread wake is not proven by public queue command; never substitute raw appserver, private socket or GUI injection. Do not declare complete automatic execution.

Review R1/R2/R3: add cross-segment retry cap, copied non-last consumed evidence, overlapping/equal segment time rejection and second-connection pause/delete/re-register/checkpoint mutation at final claim.

## Verification report (current)
Owner fixture tests: 395 Core, 82 UI/API, 23 Rust passed. Type/build/diff passed. Lint not configured. Owner real-registration DB-copy smoke: no real sends, no callback invocations, blocked target adopted latest segment and waited; real registration unchanged. DMG integrity and ad-hoc signature passed. Gatekeeper still requires the existing manual-approval install flow (not notarized). First independent QA stopped on reviewer quota; a different reviewer then completed 10/10 runtime scenarios with zero real sends. Verified DMG installed with old app and SQLite backup retained. No commit: the encompassing feature is inseparable from existing WIP.

Security: fixed exact UUID/same-store dispatcher untouched; no shell or credentials added. Old/new prefix integrity, strict monotone segment time, persisted retry budget and final transactional target/global fence protect against replay and paused targets. Same-user tampering remains the preexisting trust limitation.

安裝版驗證：原卡住目標自動換檔恢復，12:28:45 背景接受續跑要求，12:28:53 Codex 新 turn 開始；另一目標監看正常。未手動補送。
