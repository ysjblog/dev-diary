# Codex Desktop Multi-Target Quota Auto-Resume Feature Spec

## 中文摘要

使用者可在 `Settings > Automation` 貼上 `codex://threads/<UUID>` 註冊多個 Codex Desktop 任務；名稱只供顯示，定位一律用 UUID 與本機 session metadata。只有註冊後出現結構化額度用完事件、合法恢復時間已到，且來源仍唯一完整時，背景 runner 才以本機 Codex CLI `queue` 對該 UUID 排入固定「繼續」，精確回條吻合後再開啟該任務。送出成功只代表已排入 Codex 佇列，不保證 Codex 何時開始；另有只觀察、不改變派送結果的本機診斷紀錄。

## Purpose

This capability lets a local user keep several Codex Desktop tasks moving after a usage-limit interruption without watching the screen. It identifies each task by its immutable thread UUID, acts only on strict post-registration quota evidence whose reset time has passed, and hands a fixed continuation message to Codex through the official local CLI queue. Every uncertain outcome stops for manual review instead of replaying, so the feature favors never double-sending over always resuming.

## Scope

- Contract v8 Core API under `/api/codex/desktop-resume` (global toggle, target register, pause/resume, rename, unregister) and dedicated SQLite tables `codex_desktop_resume_state` and `codex_desktop_resume_targets`.
- Deep-link registration, bounded session lookup, and sequential-segment identity across one canonical Desktop `.codex` store.
- Strict quota-event parsing, reset-time buffering, bounded retry, fixed `codex queue` dispatch with exact receipts, and a global dispatch lease.
- Foreground navigation to the registered task after an accepted queue request, background rescan throttling, and diagnostics-only start observation.
- React settings UI for multiple targets, gated by the v8 runtime capability check.

## Non-Goals

- No custom prompt: the only message ever sent is the fixed 「繼續」.
- No Codex credential handling and no bypass of OpenAI usage limits.
- No guarantee that Codex starts or completes the task at any particular time after the request is queued.
- No positioning by task name, window title, screen coordinates, focus, Accessibility, clipboard, or keystroke injection.
- No wake-from-sleep, auto-unlock, or modification of the Codex app itself.

## Actors and Permissions

- The local desktop user registers, pauses, renames, and unregisters targets and may toggle the whole feature through Core-backed UI actions.
- React UI is an unprivileged client; resume mutations are allowed only when Core health proves contract v8 and the full capability set, and only through the dedicated multi-target routes.
- The Core Engine owns SQLite state and session lookup. Only the LaunchAgent background runner creates the resume engine and may dispatch; the foreground Core never dispatches.
- The local Codex CLI and Codex Desktop are external providers invoked with fixed argv and `shell:false`; DevDiary reads Codex session files and never writes into `.codex`.

## Requirements
### Requirement: Bounded background session verification
Foreground registration SHALL retain its 5-second scan deadline. Background monitoring and safe recovery SHALL use a 30-second scan deadline to tolerate slower LaunchAgent filesystem scans. A supplied scan budget MUST be a safe integer from 1 to 30,000 milliseconds. Synchronous I/O cannot be interrupted; deadline checks SHALL run at each visit, after scan completion and after full snapshot validation/hash/timezone resolution. When control returns, overdue results SHALL be rejected without claiming evidence or dispatching; all uniqueness, file identity, checkpoint and safe-recovery checks SHALL remain unchanged.

#### Scenario: Background verification completes beyond foreground budget
- **GIVEN** an enabled target needs attention only because session uniqueness could not be proved, and it has no claimed evidence, attempt or action phase
- **WHEN** a complete scan takes more than 5 seconds but less than 30 seconds and proves the exact registered locator and file identity
- **THEN** monitoring returns to watching without dispatching unless separate fresh quota evidence independently permits it

#### Scenario: Background scan remains incomplete
- **WHEN** a scan exceeds 30 seconds or encounters duplicate, symlink or identity ambiguity
- **THEN** the target remains stopped and no evidence is claimed or replayed

### Requirement: Deep link registration establishes one exact task identity

The system SHALL accept only canonical `codex://threads/<lowercase UUID>` links and a validated display label. It SHALL use the UUID, never the label, as identity. It SHALL accept one complete matching local session, or multiple timestamped sequential segments only when every match belongs to the same configured root and the same active/archive store, selecting the uniquely newest segment. It SHALL persist only a safe locator, file identity, registration EOF/prefix digest, timezone authority and target state. It MUST reject malformed links, cross-root or active/archive duplicates, ambiguous or incomplete segment timestamps, incomplete scans, symlink/identity drift, or zero matches without creating a target.

#### Scenario: Two tasks have the same display name

- **WHEN** two valid deep links contain different UUIDs but the same display name
- **THEN** both targets may be registered and are independently identified by UUID.

#### Scenario: The UUID exists in two roots

- **WHEN** complete lookup finds the same UUID in more than one session file
- **THEN** registration fails with zero target write.

#### Scenario: Codex rotates one thread into sequential active segments

- **WHEN** the same UUID appears in multiple files under one active session store and each has a distinct valid start timestamp
- **THEN** registration uses only the uniquely newest segment while cross-root, active/archive and timestamp ambiguity still fail closed.

### Requirement: Only post-registration quota exhaustion may trigger continuation

The runner SHALL consider only complete JSONL lines after the registration checkpoint that exactly identify an `event_msg` / `task_complete` error with `codex_error_info=usage_limit_exceeded`, the accepted fixed message prefix, one parseable reset clause and the registered timezone authority. It SHALL wait until reset time, ignore ordinary text and incomplete/old lines, and MUST re-prove cross-root uniqueness, file identity and prefix integrity before claim. Session reads SHALL use a stable read: the segment is re-read up to three times while its size or mtime changes during the read; if it is still unstable the target is skipped for that tick without an evidence-read state write, evidence claim, dispatch or quarantine, while a file identity change during the read, a real truncation or a rewrite still stops the target.

#### Scenario: A conversation merely mentions quota text

- **WHEN** a normal message contains “usage limit exceeded” but is not the exact structured error
- **THEN** the target remains watching and no command runs.

#### Scenario: Reset time has not arrived

- **WHEN** valid evidence has a future reset time
- **THEN** the target reports waiting with that time and sends nothing.

#### Scenario: Codex appends while the session is being read

- **WHEN** the registered segment changes during each of three read attempts in one tick
- **THEN** the tick skips that target without writing state, claiming evidence or quarantining it, and the next tick reads again.

### Requirement: Continuation uses fixed exact UUID CLI dispatch

After valid evidence reaches reset time, the runner SHALL globally serialize one claim and execute only a verified regular Codex executable, preferring the Desktop bundled CLI, with shell:false, safe environment and exact arguments `queue --thread <UUID> --message 繼續`. The verified locator's canonical root SHALL be passed as `codexHome` and child CODEX_HOME; queue writes MUST target the same store whose session was verified. UUIDs MUST be canonical RFC 9562 v1-v8. Labels and quota messages MUST NOT enter argv. Success SHALL require exit code 0 without signal and exactly one newline-terminated receipt `Queued message <canonical UUID> for thread <exact target UUID>.` within 15 seconds and bounded stdout/stderr. The legacy internal state resumed SHALL indicate accepted continuation request only; UI SHALL display 已送出續跑要求 and SHALL NOT claim execution started or work completed. No private sockets, raw app-server, queue DB edits, GUI injection or exec-resume fallback are permitted. All outcomes after claim consume evidence; failed, uncertain, timed-out or crash outcomes SHALL require attention without automatic replay. Only sanitized allowlisted error codes may persist; raw diagnostics MUST remain bounded in memory. Timeout/overflow SHALL terminate the detached process group and release lease only after confirmed direct-child close and process-group absence (ESRCH on group signal-0 probe), otherwise quarantine it. Direct-child close alone MUST NOT establish process-group termination; an unproven live descendant keeps the lease quarantined. TERM then KILL and bounded polling SHALL apply even when the parent exits before descendants; EPERM and unknown probe errors are not absence proof. A valid receipt plus normal exit zero within the original deadline MAY be accepted after bounded descendant cleanup only if group absence is confirmed; otherwise quarantine. This does not turn a timeout, signal or nonzero exit into success.

#### Scenario: CLI durably queues the exact task
- **WHEN** the claimed target's store receives the fixed prompt and CLI exits 0 with one complete receipt naming exactly that UUID
- **THEN** the target records the accepted request, consumes evidence, and a second tick does not enqueue again; a queue receipt alone never proves a new turn began.

#### Scenario: Receipt cannot prove acceptance
- **WHEN** stdout has the wrong target, invalid message UUID, extra lines, missing newline or legacy turn.started JSON, or the process exits nonzero or by signal
- **THEN** the target requires attention with sanitized diagnostics and the consumed evidence is not replayed.

#### Scenario: Product queue root differs from Desktop store
- **WHEN** the verified session belongs to a canonical root different from the local Desktop store
- **THEN** the foreground-assisted product dispatcher rejects it before queue or open; alternate-store tests of the lower-level queue helper do not authorize production dispatch.

#### Scenario: Runner dies after claim

- **WHEN** the lease expires without a durable dispatch outcome
- **THEN** recovery atomically marks manual attention and lock_quarantine_required=1, consumes the evidence, preserves lease identity with maximum safe deadline and performs no dispatch for any target on this or later ticks/restarts. Runner restart or lease expiry MUST NOT release an unknown dispatch lease without process termination proof; otherwise the global lease remains quarantined. The current schema cannot prove old process-group identity across restart, so no automatic unlock is provided; manual release needs independently established termination proof. Pause, target mutation, a new queue success and elapsed time are not such proof.

#### Scenario: Timed-out process cannot be proven stopped

- **WHEN** the dispatcher cannot confirm that the detached process group closed after bounded termination attempts
- **THEN** the evidence is consumed, the target requires attention and the global lease remains quarantined so another target cannot dispatch.

### Requirement: Users can safely manage multiple targets

The dedicated API/UI SHALL list display name, enabled state, status, reset time and sanitized error; SHALL support global pause plus target register, pause/resume monitoring, rename and unregister; and SHALL reject mutation while an action lease is active. Removing a target MUST NOT remove or edit Codex session files. It SHALL disclose that window size and position do not determine identity, and that accepted queue requests automatically navigate Codex to the registered task without Accessibility or text injection.

#### Scenario: One target is paused

- **WHEN** the user pauses one of several registered targets
- **THEN** other enabled targets remain eligible and the paused target receives no dispatch.

#### Scenario: User explicitly resumes monitoring after a consumed transport failure
- **WHEN** an explicit enabled false-to-true patch targets only codex_resume_active_writer, codex_resume_queue_unsupported, codex_resume_session_not_found or codex_resume_auth_required with completed evidence and action high-watermark, no current evidence/cursor/attempt/action phase, lock_quarantine_required=0 and a clean global lease
- **THEN** only monitoring/error state may reset; consumed evidence and high-watermark MUST remain unchanged, next tick MUST revalidate session identity and old quota evidence MUST NOT replay; unknown outcome/quarantine/integrity failures remain stopped.

Legacy codex_resume_not_acknowledged is outcome-unknown and MUST NOT enter the generic monitoring-recovery allowlist. Generic command failures, invalid receipts, timeouts, output overflow, previous unknown outcomes and unterminated-process errors SHALL also remain stopped.

#### Scenario: A target is unregistered

- **WHEN** the user unregisters one target while no action is active
- **THEN** only its DevDiary row is removed and the Codex task remains intact.

### Requirement: Recovery timing and sequential segment repair
The system SHALL wait at least 60 seconds after a future reset, recognize a reset at most 60 minutes before the error timestamp, and delay retries by five minutes per fresh strict quota error. It SHALL allow at most three retries across recent-past reset values per recovery cycle and stop on the fourth recent-past error. Consumed and unknown dispatch evidence MUST NOT be replayed. The system SHALL follow a later same-store same-thread segment only with stable old and new identity/checkpoint proof, a start after registration, and a clean idle transactional checkpoint transfer. Retry budgets MUST survive segment changes and restarts; alternating stale resets MUST NOT replenish them. Only a strictly newer future reset may begin a new cycle. Transfer SHALL require the new start to exceed the consumed-event floor; equal or overlapping time fails closed. Earlier copied errors MUST NOT trigger continuation. Final claim SHALL atomically fence target enablement, safe state, quarantine, all claim fields, unchanged registration and consumed checkpoint and a completely idle global lease. Queue acceptance SHALL NOT imply Desktop execution.

#### Scenario: Server still reports quota at reset
- **WHEN** a fresh strict error reports a reset 35 seconds before its timestamp
- **THEN** the system waits five minutes and does not reinterpret that reset as tomorrow

#### Scenario: New runtime segment
- **WHEN** the same registered UUID gains a strictly newer verified segment after registration
- **THEN** the system monitors that segment without replaying old evidence or bypassing a quarantine

### Requirement: Accepted queue requests open the registered Desktop task
The foreground-assisted dispatcher SHALL validate the exact canonical UUID and require the verified queue store to equal the local Desktop canonical `.codex` store before enqueueing. After queue acceptance and process-group termination proof, it SHALL open only `codex://threads/<UUID>` through `/usr/bin/open -b com.openai.codex` once, without shell or background-opening flags. The entire queue and open sequence SHALL remain under one 45-second action lease. Open SHALL have a five-second deadline and bounded TERM/KILL cleanup with child-close and group-absence proof. Unknown process termination SHALL quarantine the lease. An open failure SHALL require attention and consume the evidence without any resend or reopen retry. Successful open SHALL NOT claim a turn started or completed. Existing accepted requests SHALL NOT replay on upgrade.

#### Scenario: Dormant registered task has a new due quota event
- **WHEN** the Desktop store matches, the exact queue receipt succeeds and its process group has stopped
- **THEN** the runner opens that same task's deep link once and preserves the accepted-request-only status semantics

#### Scenario: Navigation fails after queue acceptance
- **WHEN** opening fails, times out, or has an unproven process group
- **THEN** the target requires attention, the evidence is consumed, the unknown group remains quarantined, and future ticks do not resend or reopen

#### Scenario: A configured CLI store differs from Desktop
- **WHEN** the verified context root differs from the canonical local Desktop store
- **THEN** no queue or open command is executed and a sanitized store-mismatch error is returned

#### Scenario: Upgrade sees an earlier accepted request
- **WHEN** no new qualifying quota evidence exists
- **THEN** upgrade and restart do not reopen or resend the earlier request

### Requirement: Vendor apostrophe variants preserve strict quota evidence
The quota parser SHALL accept only the official prefixes `You've hit your usage limit.` and `You’ve hit your usage limit.` with U+0027 or U+2019. It SHALL retain original-byte evidence digest and all existing event type, error enum, timestamp, unique reset clause, timezone and replay checks. Other apostrophe variants or embedded quoted text SHALL NOT qualify.

#### Scenario: Desktop emits a right-curly apostrophe
- **WHEN** a post-registration event_msg/task_complete/usage_limit_exceeded event uses You’ve and contains one valid due reset time
- **THEN** the engine consumes that original event once and may dispatch the registered target; subsequent ticks MUST NOT replay it.

### Requirement: Background rescans are throttled only while nothing is actionable
The runner SHALL keep, in process memory only, the time of the last full cross-root rescan attempt per target together with the global target revision and the target's registered locator, file identity and registration time observed at that attempt. For each target it SHALL keep the existing timezone check first. It SHALL then run the unchanged full path (rescan with all uniqueness, identity and deadline checks, then segment adoption or recovery, evidence, retry and claim fencing) unless all of the following hold: the target is watching, waiting_for_reset or resumed; a remembered attempt exists; the remembered revision, locator, file identity and registration time equal the current ones; and 0 <= now - attempt time < 5 minutes. Any user mutation (register, rename, pause, re-enable, unregister) increments the revision and therefore forces the next tick to revalidate session identity. A clock that moves backwards forces a full rescan. Only when the throttle conditions hold SHALL the runner read the registered segment with the existing stable-read, file identity, registration prefix and action checkpoint checks: an unstable read skips the tick without writes; an invalid read, a due candidate or a retry-exhaustion decision SHALL fall through to the full path in the same tick; no candidate or a future event SHALL write nothing; a valid candidate whose computed due time has not arrived MAY only record waiting_for_reset with that due time, fenced on enabled, safe state, idle claim fields, no quarantine and unchanged updated_at_ms. A skipped rescan MUST NOT claim, dispatch, adopt a segment, recover attention or write quarantine. needs_attention/session_uniqueness_unproven targets keep a full rescan on every tick. The full-path and throttled decisions SHALL share one candidate classification. A newer segment or a cross-root duplicate may therefore be noticed up to 5 minutes later; until then only the displayed state can lag and nothing is dispatched without a fresh full rescan.

#### Scenario: Nothing is actionable between rescans
- **WHEN** a watching target's registered segment has no new quota evidence and it was fully rescanned less than 5 minutes ago with unchanged revision and registration
- **THEN** the tick reads only that segment, performs no cross-root walk, and the next full rescan happens once 5 minutes have elapsed

#### Scenario: Due evidence appears between rescans
- **WHEN** a valid quota event in the registered segment becomes due before the 5-minute rescan
- **THEN** the same tick performs the full rescan and dispatches only if uniqueness is re-proved; a duplicate copy in another root still stops dispatch

#### Scenario: Codex rotates to a newer segment between rescans
- **WHEN** the quota event is written only to a newer segment
- **THEN** it is adopted and handled no later than the next 5-minute full rescan, with the existing segment transfer checks

#### Scenario: User re-enables a target inside the window
- **WHEN** the user pauses and re-enables a target less than 5 minutes after its last full rescan
- **THEN** the next tick revalidates session identity with a full rescan

#### Scenario: Clock moves backwards or the session keeps changing
- **WHEN** the wall clock moves before the remembered attempt, or the registered segment reads unstable on every tick
- **THEN** a full rescan still runs, at the latest once 5 minutes have elapsed since the last attempt

### Requirement: Resume diagnostics observe without changing dispatch outcome
The background runner MAY wrap the dispatcher with a local diagnostic observer. The observer SHALL NOT change the dispatch result, retry, resend, reopen or alter target state; an observer failure SHALL only log a fixed warning and may disable further diagnostics. It SHALL persist only allowlisted fields to an owner-only (0600) `codex-resume-diagnostics/observations.json` capped at 256 KiB, 100 records and 32 pending observations, each with a 10-minute deadline, and SHALL check at most two pending observations per tick, each probe bounded (2-second observe, 4-second snapshot), so observer work outside the lease is at most about 12 seconds per tick. Sources are limited to the registered session segment, at most 16 allowlisted `/bin/ps` rows (PID, PPID, state, kind) and bounded counts from `~/Library/Logs/com.openai.codex`; conversation text, task names, raw logs, source paths and command lines MUST NOT be stored or sent anywhere. Probe work inside the action lease SHALL be bounded (2-second baseline, 4-second snapshot) and counted within the 45-second lease budget. A new turn observed after a request SHALL NOT be claimed as proof that the request caused it.

#### Scenario: Diagnostics storage is unavailable
- **WHEN** the diagnostics file cannot be written or the pending limit is reached
- **THEN** the dispatch proceeds with its unchanged outcome, no observation is recorded, and a fixed warning is logged


## Data Contracts

- **API:** `GET/PATCH /api/codex/desktop-resume`, `POST /api/codex/desktop-resume/targets`, `PATCH`/`DELETE /api/codex/desktop-resume/targets/:threadId`. Mutations are bound to the verified runtime snapshot; target drift is rejected before body parsing with zero mutation.
- **Records:** `codex_desktop_resume_state` (global enablement, lease and dispatch bookkeeping) and `codex_desktop_resume_targets` (canonical thread UUID, display name, status, evidence checkpoint, attempt counts and error code).
- **Health:** `/api/health` reports contract version 8 and capabilities including `codex.desktop-resume.multi-target-v2`; lower versions, missing capabilities, or a stale manifest are treated as stale.
- **Diagnostics:** `~/Library/Application Support/DevDiary/codex-resume-diagnostics/observations.json`, owner-only, at most 256 KiB, 100 records and 32 pending observations.

## Error and Recovery Behavior

- Uniqueness, file-identity, receipt, or process-stop uncertainty sets the target to 「需要人工檢查」 and never replays.
- A server that still reports quota after reset retries after 5 minutes, at most three times per reset cycle; the count survives restarts and segment rotation.
- A runner that dies after claiming a dispatch keeps the global lock until a person reviews it; lock expiry alone never re-sends.
- Navigation failure after an accepted queue request asks for manual review and does not re-queue.
- Diagnostics failures only log a fixed warning and may disable diagnostics; the dispatch result is unchanged.

## Security and Privacy

- Only the current user's canonical Desktop `.codex` store is accepted; other CLI stores are rejected before any send.
- The CLI is executed with fixed argv and `shell:false`; no user-controlled text reaches the command line apart from the validated canonical UUID.
- Diagnostics never store conversation text, task names, raw logs, source paths, or command lines, and nothing is sent off the machine.
- No credentials are read or stored, and no system security or Accessibility permission is requested.

## Verification Mapping

| Requirement | Automated test | Runtime / manual evidence |
|---|---|---|
| Bounded background session verification | `core/test/codexDesktopSessionLookup.test.ts`, `core/test/codexDesktopResumeEngine.test.ts` | slow-scan and safe-recovery regressions |
| Deep link registration establishes one exact task identity | `core/test/codexDesktopResumeContracts.test.ts`, `core/test/codexDesktopSessionLookup.test.ts`, `core/test/codexDesktopResumeRepository.test.ts` | isolated black-box QA `doc/test/codex-desktop-auto-resume-closeout-qa-20260925.md` |
| Only post-registration quota exhaustion may trigger continuation | `core/test/codexQuotaEvidence.test.ts`, `core/test/codexDesktopResumeReadRace.test.ts` | installed-app live triggers in `doc/test/codex-desktop-unattended-start-closeout-20260925.md` |
| Continuation uses fixed exact UUID CLI dispatch | `core/test/codexDesktopQueueDispatch.test.ts` | installed-app live triggers |
| Users can safely manage multiple targets | `core/test/codexDesktopResumeApiV8.test.ts`, `src/api/settings.test.js` | isolated black-box QA |
| Recovery timing and sequential segment repair | `core/test/codexRecoveryTimingSegments.test.ts` | — |
| Accepted queue requests open the registered Desktop task | `core/test/codexDesktopWake.test.ts` | installed-app live triggers |
| Vendor apostrophe variants preserve strict quota evidence | `core/test/codexQuotaEvidence.test.ts` | — |
| Background rescans are throttled only while nothing is actionable | `core/test/codexDesktopResumeRescanCadence.test.ts` | installed runner CPU sampling |
| Resume diagnostics observe without changing dispatch outcome | `core/test/codexResumeObservation.test.ts` | bounded diagnostics file checks |

## Open Questions

None for the current contract. Known limit: in three installed live triggers, two started within 10 seconds and one started about 8 hours later because Codex Desktop delayed its own resume; this is documented, not guaranteed away.
